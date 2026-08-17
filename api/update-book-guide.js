// 기존 책의 가이드 업데이트
const { assessGuideQuality, generateBookGuide, generateBookGuides } = require('../lib/book-guide');

const PILOT_BOOK_IDS = [
  '955099ce-3b1b-494e-9188-c306d413499a',
  '30e74b6c-989b-4f1f-9425-67eecefd1c1d',
  '69f85b68-0be8-4a4c-bd40-732eccac1dd7',
  '310aaa13-8fe3-460d-9b5a-fc70899c01fb',
  'a93d2067-7d61-43ae-97f6-60411ebed4b0',
  '99a37753-bf14-4883-a8bd-1bd409def866',
  '7f2ef1d8-507f-4d1b-996e-f301b7d7b33d',
  'f778f323-675f-437c-8ea2-32ecefe6bdbc',
  '0ca90d28-108f-446c-846a-81099dbac119',
  'a9ca4000-3164-443b-aaf1-de9b02dd1421'
];

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
    const { bookId, title, author, childAgeMonths } = req.body;
    const supabase = getSupabaseClient();

    // 임시 프리뷰 배포에서만 사용하는 비저장 품질 평가 경로다.
    if (req.body?.pilot === true && req.headers['x-guide-pilot'] === 'strategy-eval-v2') {
      const { data: books, error: pilotBooksError } = await supabase
        .from('books')
        .select('id,title,author,publisher,description,isbn')
        .in('id', PILOT_BOOK_IDS);
      if (pilotBooksError) throw new Error(`Supabase pilot lookup error: ${pilotBooksError.message}`);
      const byId = new Map((books || []).map(book => [book.id, book]));
      const orderedBooks = PILOT_BOOK_IDS.map(id => byId.get(id)).filter(Boolean);
      const guides = await generateBookGuides(orderedBooks.map(book => ({
        key: book.id,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        description: book.description
      })), { apiKey: OPENAI_API_KEY, childAgeMonths: 39 });
      const guideById = new Map(guides.map(guide => [guide.key, guide]));
      return res.status(200).json({
        saved: false,
        samples: orderedBooks.map(book => {
          const guide = guideById.get(book.id);
          return { title: book.title, description: book.description, guide, issues: assessGuideQuality(guide) };
        })
      });
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

    // 가이드 재생성은 추천에 쓰이는 테마·연령을 변경하지 않는다.
    
    const updateFields = {};
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

