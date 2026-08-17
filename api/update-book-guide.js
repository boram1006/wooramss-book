// 기존 책의 가이드 업데이트
const { generateBookGuide } = require('../lib/book-guide');

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

    if (!bookId || !title) {
      return res.status(400).json({ error: 'bookId and title required' });
    }

    const supabase = getSupabaseClient();
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

