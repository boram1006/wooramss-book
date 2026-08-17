// 기존 책의 가이드 업데이트
const { generateBookGuide, generateBookGuides } = require('../lib/book-guide');

// 2,048권 기존 데이터 재생성 후 제거할 일회성 유지보수 키.
const BULK_REFRESH_TOKEN = 'guide-refresh-2f4a91c8-20260817';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { createClient } = require('@supabase/supabase-js');
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEBUG_RECO = process.env.DEBUG_RECO === '1';

function debugLog(...args) {
  if (DEBUG_RECO) console.log(...args);
}
  // Supabase 클라이언트 초기화
  function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { bookId, title, author, childAgeMonths, bookIds, maintenanceToken } = req.body;
    const supabase = getSupabaseClient();

    if (Array.isArray(bookIds)) {
      if (maintenanceToken !== BULK_REFRESH_TOKEN) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const uniqueBookIds = Array.from(new Set(bookIds.map(String).filter(Boolean))).slice(0, 12);
      if (!uniqueBookIds.length) {
        return res.status(400).json({ error: 'bookIds required' });
      }

      const { data: storedBooks, error: booksError } = await supabase
        .from('books')
        .select('id,title,author,publisher,description,isbn')
        .in('id', uniqueBookIds);
      if (booksError) throw new Error(`Supabase books lookup error: ${booksError.message}`);
      if ((storedBooks || []).length !== uniqueBookIds.length) {
        throw new Error('일부 책을 찾지 못했습니다');
      }

      const guides = await generateBookGuides(storedBooks.map(book => ({
        key: String(book.id),
        title: book.title,
        author: book.author || '',
        publisher: book.publisher || '',
        description: book.description || ''
      })), { apiKey: OPENAI_API_KEY, childAgeMonths });
      const guideById = new Map(guides.map(guide => [guide.key, guide]));

      const updatedIds = await Promise.all(storedBooks.map(async book => {
        const guide = guideById.get(String(book.id));
        if (!guide?.parentGuide || !guide?.activities) {
          throw new Error(`AI 가이드 생성 결과가 완전하지 않습니다: ${book.id}`);
        }
        const { error } = await supabase.from('books').update({
          themes: guide.themes.join(','),
          age_range: guide.ageRange,
          parent_guide: guide.parentGuide,
          activities: guide.activities
        }).eq('id', book.id);
        if (error) throw new Error(`Supabase update error (${book.id}): ${error.message}`);
        return book.id;
      }));

      return res.status(200).json({ success: true, updatedIds });
    }

    if (!bookId || !title) {
      return res.status(400).json({ error: 'bookId and title required' });
    }

    const { data: storedBook, error: bookError } = await supabase
      .from('books')
      .select('id,title,author,publisher,description,isbn')
      .eq('id', bookId)
      .single();

    if (bookError) throw new Error(`Supabase book lookup error: ${bookError.message}`);

    const aiContent = await generateBookGuide({
      key: storedBook.isbn || storedBook.id,
      title: storedBook.title || title,
      author: storedBook.author || author || '',
      publisher: storedBook.publisher || '',
      description: storedBook.description || ''
    }, { apiKey: OPENAI_API_KEY, childAgeMonths });

    if (!aiContent.parentGuide || !aiContent.activities) {
      throw new Error('AI 가이드 생성 결과가 완전하지 않습니다');
    }

    // DB에 저장된 전체 책 정보를 근거로 가이드를 업데이트한다.
    
    const updateFields = {};
    if (aiContent.themes?.length) updateFields.themes = aiContent.themes.join(',');
    if (aiContent.ageRange) updateFields.age_range = aiContent.ageRange;
    if (aiContent.parentGuide) updateFields.parent_guide = aiContent.parentGuide;
    if (aiContent.activities) updateFields.activities = aiContent.activities;

    const { data: updatedBook, error } = await supabase
      .from('books')
      .update(updateFields)
      .eq('id', bookId)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase update error: ${error.message}`);
    }

    // Airtable 형식으로 변환 (하위 호환성)
    const convertedBook = {
      id: updatedBook.id,
      fields: {
        'ISBN': updatedBook.isbn,
        '제목': updatedBook.title,
        '저자': updatedBook.author,
        '출판사': updatedBook.publisher,
        '발행년': updatedBook.pub_year,
        '표지이미지': updatedBook.cover_image,
        '설명': updatedBook.description,
        '테마': updatedBook.themes,
        '연령': updatedBook.age_range,
        '부모_읽기_가이드': updatedBook.parent_guide,
        '연계놀이': updatedBook.activities,
        '관심': updatedBook.interested
      }
    };

    res.status(200).json({
      success: true,
      book: convertedBook,
      aiContent
    });
  } catch (error) {
    console.error('가이드 업데이트 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

