// 메모 요약 생성 함수 (내부 함수)
const { generateBookGuides } = require('../lib/book-guide');
const { inferThemes } = require('../lib/theme-taxonomy');

async function generateMemoSummary(recordId, memo, supabase, OPENAI_API_KEY) {
  try {
    const prompt = `다음은 아이가 책을 읽은 후 부모가 작성한 메모입니다. 메모를 분석하여 다음 형식으로 JSON만 출력해주세요:

메모: ${memo}

다음 형식으로 JSON만 출력:
{
  "좋아한요소": "아이가 좋아했거나 관심을 보인 요소들을 나열 (예: 동물, 색깔, 소리, 반복 등)",
  "싫어한요소": "아이가 싫어했거나 피했던 요소들 (없으면 '없음')",
  "트리거": "아이의 감정이나 행동을 유발한 트리거 요소들 (예: 갈등, 이별, 공포, 슬픔, 놀람 등, 없으면 '없음')"
}

중요:
- 메모에 명시적으로 언급된 내용만 추출
- 추측하지 말고 메모 내용만 기반으로 작성
- 없으면 '없음'으로 표시`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }),
      timeout: 10000
    });

    let memoSummary = null;
    if (response.ok) {
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      
      // JSON 추출
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        memoSummary = JSON.parse(jsonMatch[0]);
      } else {
        memoSummary = {"좋아한요소": "분석 실패", "싫어한요소": "없음", "트리거": "없음"};
      }
    } else {
      memoSummary = {"좋아한요소": "AI 생성 실패", "싫어한요소": "없음", "트리거": "없음"};
    }

    // Supabase 업데이트
    const { error } = await supabase
      .from('reading_logs')
      .update({ memo_summary: memoSummary })
      .eq('id', recordId);

    if (error) {
      throw new Error(`Supabase update error: ${error.message}`);
    }
  } catch (error) {
    console.error('메모 요약 생성 오류:', error);
    throw error;
  }
}

function normalizeIsbn(value) {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase();
}

function normalizeBulkBook(book) {
  const isbn = normalizeIsbn(book?.isbn);
  const title = String(book?.title || '').trim();
  if (!isbn || !title) return null;
  const pubYear = parseInt(String(book.pubDate || '').slice(0, 4), 10);
  return {
    isbn,
    title,
    author: String(book.author || '').trim(),
    publisher: String(book.publisher || '').trim(),
    pub_year: Number.isFinite(pubYear) ? pubYear : null,
    cover_image: String(book.cover || '').trim(),
    description: String(book.description || '').trim()
  };
}

async function registerReadBooks(req, res, supabase) {
  const inputBooks = Array.isArray(req.body?.books) ? req.body.books.slice(0, 12) : [];
  const normalizedBooks = inputBooks.map(normalizeBulkBook).filter(Boolean);
  const books = Array.from(new Map(normalizedBooks.map(book => [book.isbn, book])).values());
  if (!books.length) return res.status(400).json({ error: '등록할 책 정보가 없습니다.' });

  const logDefaults = req.body?.logDefaults || {};
  const readDate = String(logDefaults.readDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readDate)) {
    return res.status(400).json({ error: '읽은 날짜를 확인해주세요.' });
  }

  const allowedReactions = new Set(['', '😍', '😊', '😐', '😢', '🥱']);
  const childReaction = allowedReactions.has(logDefaults.childReaction) ? logDefaults.childReaction : '';
  const isbns = books.map(book => book.isbn);

  const { data: existingBooks, error: existingBooksError } = await supabase
    .from('books').select('id,isbn,title,parent_guide,activities').in('isbn', isbns);
  if (existingBooksError) throw new Error(`기존 책 조회 실패: ${existingBooksError.message}`);

  const existingByIsbn = new Map((existingBooks || []).map(book => [normalizeIsbn(book.isbn), book]));
  const missingBooks = books.filter(book => !existingByIsbn.has(book.isbn));
  const existingBooksNeedingGuide = (existingBooks || []).filter(book => !book.parent_guide || !book.activities);
  const guideTargets = [
    ...missingBooks,
    ...existingBooksNeedingGuide
      .map(book => books.find(inputBook => inputBook.isbn === normalizeIsbn(book.isbn)))
      .filter(Boolean)
  ];
  let guides = [];

  if (guideTargets.length) {
    try {
      guides = await generateBookGuides(guideTargets, {
        apiKey: process.env.OPENAI_API_KEY,
        childAgeMonths: req.body?.childAgeMonths
      });
    } catch (error) {
      // 여러 권 등록에서는 가이드 실패보다 읽기 기록 보존이 우선이다.
      console.error('여러 권 가이드 생성 실패, 기본 정보로 등록:', error?.message || error);
    }
  }

  const guideByIsbn = new Map(guides.map(guide => [normalizeIsbn(guide.key), guide]));
  let insertedBooks = [];
  if (missingBooks.length) {
    const booksWithGuides = missingBooks.map(book => {
      const guide = guideByIsbn.get(book.isbn);
      if (!guide?.parentGuide || !guide?.activities) return book;
      return {
        ...book,
        themes: inferThemes(book).join(','),
        age_range: guide.ageRange,
        parent_guide: guide.parentGuide,
        activities: guide.activities
      };
    });

    const { data, error } = await supabase.from('books').insert(booksWithGuides).select('id,isbn,title');
    if (error) throw new Error(`새 책 저장 실패: ${error.message}`);
    insertedBooks = data || [];
  }

  // 이미 등록된 책이라도 가이드가 비어 있으면 사진에서 확인한 책 정보로 보완한다.
  await Promise.all(existingBooksNeedingGuide.map(async book => {
    const guide = guideByIsbn.get(normalizeIsbn(book.isbn));
    if (!guide?.parentGuide || !guide?.activities) return;
    const { error } = await supabase.from('books').update({
      age_range: guide.ageRange,
      parent_guide: guide.parentGuide,
      activities: guide.activities
    }).eq('id', book.id);
    if (error) console.error(`기존 책 가이드 보완 실패 (${book.id}):`, error.message);
  }));

  const allBooks = [...(existingBooks || []), ...insertedBooks];
  const savedByIsbn = new Map(allBooks.map(book => [normalizeIsbn(book.isbn), book]));
  const unresolved = books.filter(book => !savedByIsbn.has(book.isbn));
  if (unresolved.length) throw new Error(`책 ${unresolved.length}권의 저장 결과를 확인하지 못했습니다.`);

  const bookIds = books.map(book => savedByIsbn.get(book.isbn).id);
  const { data: existingLogs, error: existingLogsError } = await supabase
    .from('reading_logs').select('id,book_id').in('book_id', bookIds);
  if (existingLogsError) throw new Error(`기존 읽기 기록 조회 실패: ${existingLogsError.message}`);

  const loggedBookIds = new Set((existingLogs || []).map(log => String(log.book_id)));
  const newLogs = bookIds.filter(bookId => !loggedBookIds.has(String(bookId))).map(bookId => ({
    book_id: bookId,
    completed: logDefaults.completed === true,
    child_reaction: childReaction,
    memo: '',
    question_level: '',
    focus_level: '',
    read_date: readDate
  }));

  let insertedLogs = [];
  if (newLogs.length) {
    const { data, error } = await supabase.from('reading_logs').insert(newLogs).select('id,book_id');
    if (error) throw new Error(`읽기 기록 저장 실패: ${error.message}`);
    insertedLogs = data || [];
  }

  return res.status(200).json({
    success: true,
    bookCount: books.length,
    createdBookCount: insertedBooks.length,
    existingBookCount: (existingBooks || []).length,
    createdLogCount: insertedLogs.length,
    existingLogCount: (existingLogs || []).length
  });
}

// 읽기 기록 생성/업데이트
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { createClient } = require('@supabase/supabase-js');
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Supabase 클라이언트 초기화
  function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  const supabase = getSupabaseClient();

  try {
    if (req.method === 'POST' && Array.isArray(req.body?.books)) {
      return await registerReadBooks(req, res, supabase);
    }

    const { bookId, logData, recordId } = req.body;

    if (!bookId || !logData) {
      return res.status(400).json({ error: 'bookId and logData required' });
    }

    // 필수 필드 명시적 저장 (빈 문자열도 저장)
    const fieldsToSave = {
      book_id: bookId,
      completed: logData['완독여부'] || false,
      child_reaction: logData['아이반응'] || '',
      memo: logData['메모'] || '',
      question_level: logData['질문정도'] || '',
      focus_level: logData['집중정도'] || '',
      read_date: logData['날짜'] || logData['읽은날짜'] || logData['읽은 날짜'] || null
    };

    let savedRecord;

    if (req.method === 'PATCH' && recordId) {
      // 업데이트
      const { data, error } = await supabase
        .from('reading_logs')
        .update(fieldsToSave)
        .eq('id', recordId)
        .select()
        .single();

      if (error) {
        throw new Error(`Supabase update error: ${error.message}`);
      }

      savedRecord = data;
    } else {
      // 생성
      const { data, error } = await supabase
        .from('reading_logs')
        .insert(fieldsToSave)
        .select()
        .single();

      if (error) {
        throw new Error(`Supabase create error: ${error.message}`);
      }

      savedRecord = data;
    }

    // 메모가 있으면 AI로 요약 생성 (비동기, 실패해도 저장은 성공)
    if (logData['메모'] && logData['메모'].trim() && OPENAI_API_KEY) {
      // 비동기로 처리 (응답을 기다리지 않음)
      generateMemoSummary(savedRecord.id, logData['메모'], supabase, OPENAI_API_KEY)
        .catch(err => {
          console.error('메모 요약 생성 실패 (비동기):', err);
        });
    }

    // Airtable 형식으로 변환 (하위 호환성)
    const convertedRecord = {
      id: savedRecord.id,
      fields: {
        '책': savedRecord.book_id ? [savedRecord.book_id] : [],
        '완독여부': savedRecord.completed,
        '아이반응': savedRecord.child_reaction,
        '메모': savedRecord.memo,
        '질문정도': savedRecord.question_level,
        '집중정도': savedRecord.focus_level,
        'memoSummary': savedRecord.memo_summary ? JSON.stringify(savedRecord.memo_summary) : null,
        '날짜': savedRecord.read_date
      }
    };

    return res.status(req.method === 'PATCH' ? 200 : 201).json(convertedRecord);
  } catch (error) {
    console.error('Reading log error:', error);
    res.status(500).json({ error: error.message });
  }
}
