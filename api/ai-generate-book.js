// AI로 책 정보 생성
const { generateBookGuide } = require('../lib/book-guide');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { createClient } = require('@supabase/supabase-js');
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEBUG_RECO = process.env.DEBUG_RECO === '1';

function debugLog(...args) {
  if (DEBUG_RECO) console.log(...args);
}
  const ALADIN_API_KEY = process.env.ALADIN_API_KEY;

  // Supabase 클라이언트 초기화
  function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  if (!OPENAI_API_KEY || !ALADIN_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { title, author, childAgeMonths } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }

    // 1. 알라딘 API로 책 검색
    const aladinUrl = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_API_KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=3&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big`;
    
    let aladinData = { found: false };
    try {
      const aladinResponse = await fetch(aladinUrl);
      const aladinText = await aladinResponse.text();
      // JSONP 응답 파싱 (간단한 방법)
      const jsonMatch = aladinText.match(/ItemSearch\.js\((.+)\)/);
      if (jsonMatch) {
        const aladinJson = JSON.parse(jsonMatch[1]);
        if (aladinJson.item && aladinJson.item.length > 0) {
          const book = aladinJson.item[0];
          aladinData = {
            found: true,
            저자: book.author || author || '',
            출판사: book.publisher || '',
            발행년: book.pubDate ? parseInt(book.pubDate.substring(0, 4)) : null,
            표지이미지: book.cover || '',
            ISBN: book.isbn13 || book.isbn || '',
            설명: book.description || ''
          };
        }
      }
    } catch (e) {
      console.error('Aladin API error:', e);
    }

    // 2. 모든 책 추가 경로가 동일한 문해력 가이드 생성기를 사용한다.
    let aiContent = null;
    try {
      aiContent = await generateBookGuide({
        title,
        author: aladinData.저자 || author || '',
        publisher: aladinData.출판사 || '',
        description: aladinData.설명 || ''
      }, { apiKey: OPENAI_API_KEY, childAgeMonths });
    } catch (e) {
      debugLog('[WHY] ai-generate-book guide fallback:', e?.message || e);
    }

    // 3. Supabase에 추가
    const supabase = getSupabaseClient();
    
    const bookData = {
      title: title,
      author: aladinData.저자 || author || '',
      publisher: aladinData.출판사 || '',
      pub_year: aladinData.발행년,
      cover_image: aladinData.표지이미지 || '',
      isbn: aladinData.ISBN || '',
      description: aladinData.설명 || ''  // 알라딘에서 가져온 책 설명
    };

    if (aiContent) {
      if (aiContent.themes?.length) bookData.themes = aiContent.themes.join(',');
      if (aiContent.ageRange) bookData.age_range = aiContent.ageRange;
      if (aiContent.parentGuide) bookData.parent_guide = aiContent.parentGuide;
      if (aiContent.activities) bookData.activities = aiContent.activities;
    }

    const { data: newBook, error } = await supabase
      .from('books')
      .insert(bookData)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase create error: ${error.message}`);
    }

    // Airtable 형식으로 변환 (하위 호환성)
    const convertedBook = {
      id: newBook.id,
      fields: {
        'ISBN': newBook.isbn,
        '제목': newBook.title,
        '저자': newBook.author,
        '출판사': newBook.publisher,
        '발행년': newBook.pub_year,
        '표지이미지': newBook.cover_image,
        '설명': newBook.description,
        '테마': newBook.themes,
        '연령': newBook.age_range,
        '부모_읽기_가이드': newBook.parent_guide,
        '연계놀이': newBook.activities,
        '관심': newBook.interested
      }
    };

    res.status(200).json({
      success: true,
      book: convertedBook,
      aladinData,
      aiContent
    });
  } catch (error) {
    console.error('Generate book error:', error);
    res.status(500).json({ error: error.message });
  }
}



