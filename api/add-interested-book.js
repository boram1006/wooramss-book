// Vercel Serverless Function
// 관심 있는 책 추가 (검색 → AI 가이드 생성 → Supabase 저장)

const { createClient } = require('@supabase/supabase-js');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEBUG_RECO = process.env.DEBUG_RECO === '1';

function debugLog(...args) {
  if (DEBUG_RECO) console.log(...args);
}
const ALADIN_API_KEY = process.env.ALADIN_API_KEY || 'ttbcasey862231001';

// Supabase 클라이언트 초기화
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Books 테이블에서 ISBN으로 검색
async function findBookByISBN(isbn) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('isbn', isbn)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw new Error(`Supabase error: ${error.message}`);
  }

  if (!data) return null;

  // Airtable 형식으로 변환 (하위 호환성)
  return {
    id: data.id,
    fields: {
      'ISBN': data.isbn,
      '제목': data.title,
      '저자': data.author,
      '출판사': data.publisher,
      '발행년': data.pub_year,
      '표지이미지': data.cover_image,
      '설명': data.description,
      '테마': data.themes,
      '연령': data.age_range,
      '부모_읽기_가이드': data.parent_guide,
      '연계놀이': data.activities,
      '관심': data.interested
    }
  };
}

// 알라딘 API로 책 정보 가져오기
async function getBookFromAladin(isbn) {
  const url = `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN_API_KEY}&itemIdType=ISBN13&ItemId=${isbn}&output=js&Version=20131101&OptResult=ebookList,usedList,reviewList`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.item || data.item.length === 0) {
    throw new Error('책을 찾을 수 없습니다');
  }
  
  return data.item[0];
}

// OpenAI로 AI 가이드 생성
function parseJsonFromText(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return null;
  }
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item.content) continue;
      for (const c of item.content) {
        if (c.type === 'output_text' && typeof c.text === 'string') {
          return c.text.trim();
        }
      }
    }
  }
  return '';
}

async function generateAIGuide(bookInfo) {
  const prompt = `다음 어린이 책에 대한 정보를 분석하여 JSON 형식으로 답변해주세요.

책 정보:
- 제목: ${bookInfo.title}
- 저자: ${bookInfo.author}
- 출판사: ${bookInfo.publisher}
- 설명: ${bookInfo.description || '정보 없음'}

다음 형식으로 JSON만 출력해주세요:
{
  "themes": ["테마1", "테마2", "테마3"],
  "ageRange": "4-7세",
  "parentGuide": "부모가 읽어줄 때 주의할 점이나 대화 주제",
  "activities": "책과 연계한 놀이 활동 제안"
}`;

  const payload = {
    model: 'gpt-5-mini',
    input: [{ role: 'user', content: prompt }],
    text: {
      format: { type: 'text' },
      verbosity: 'low',
    },
    reasoning: { effort: 'low' },
    max_output_tokens: 600
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        debugLog('[WHY] add-interested-book ai non-200:', response.status, errText);
        continue;
      }

      const data = await response.json();
      const text = extractResponseText(data);
      const parsed = parseJsonFromText(text);
      if (parsed) return parsed;

      debugLog('[WHY] add-interested-book ai parse miss (attempt', attempt + '):', text.slice(0, 200));
      // 2번째 시도 전에는 출력 형식을 더 강하게 유도
      payload.input = [{
        role: 'user',
        content: `${prompt}\n\n반드시 JSON만 출력하고 다른 설명은 넣지 마세요.`
      }];
    } catch (e) {
      debugLog('[WHY] add-interested-book ai exception:', e?.message || e);
    }
  }

  return { themes: [], ageRange: '', parentGuide: '', activities: '' };
}

// Books 테이블에 책 추가
async function addBookToSupabase(bookInfo, aiGuide) {
  const supabase = getSupabaseClient();
  
  const bookData = {
    isbn: bookInfo.isbn13 || bookInfo.isbn,
    title: bookInfo.title,
    author: bookInfo.author,
    publisher: bookInfo.publisher,
    pub_year: bookInfo.pubDate ? parseInt(bookInfo.pubDate.substring(0, 4)) : null,
    cover_image: bookInfo.cover || '',
    description: bookInfo.description || '',
    themes: Array.isArray(aiGuide.themes) ? aiGuide.themes.join(',') : (aiGuide.themes || ''),
    age_range: aiGuide.ageRange || '',
    parent_guide: aiGuide.parentGuide || '',
    activities: aiGuide.activities || '',
    interested: false  // 기본값은 false (체크 해제)
  };

  const { data, error } = await supabase
    .from('books')
    .insert(bookData)
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase insert error: ${error.message}`);
  }

  // Airtable 형식으로 변환 (하위 호환성)
  return {
    id: data.id,
    fields: {
      'ISBN': data.isbn,
      '제목': data.title,
      '저자': data.author,
      '출판사': data.publisher,
      '발행년': data.pub_year,
      '표지이미지': data.cover_image,
      '설명': data.description,
      '테마': data.themes,
      '연령': data.age_range,
      '부모_읽기_가이드': data.parent_guide,
      '연계놀이': data.activities,
      '관심': data.interested
    }
  };
}

// ReadingLog에 관심 있는 책으로 추가
async function addToReadingLog(bookId) {
  const supabase = getSupabaseClient();
  
  const logData = {
    book_id: bookId
  };

  const { data, error } = await supabase
    .from('reading_logs')
    .insert(logData)
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase insert error: ${error.message}`);
  }

  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { isbn } = req.body;
    
    if (!isbn) {
      return res.status(400).json({ error: 'ISBN이 필요합니다' });
    }
    
    // 1. Books 테이블에서 검색
    let existingBook = await findBookByISBN(isbn);
    let bookId;
    
    if (existingBook) {
      // 이미 있는 책
      bookId = existingBook.id;
    } else {
      // 없는 책 - 새로 추가
      console.log('📚 알라딘에서 책 정보 가져오는 중...');
      const bookInfo = await getBookFromAladin(isbn);
      
      console.log('🤖 AI 가이드 생성 중...');
      const aiGuide = await generateAIGuide(bookInfo);
      
      console.log('💾 Supabase에 저장 중...');
      const newBook = await addBookToSupabase(bookInfo, aiGuide);
      bookId = newBook.id;
    }
    
    // 2. 관심 필드는 기본값 false로 유지 (업데이트하지 않음)
    
    res.status(200).json({
      success: true,
      message: '책이 추가되었습니다',
      bookId: bookId,
      isNew: !existingBook
    });
    
  } catch (error) {
    console.error('관심 책 추가 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
