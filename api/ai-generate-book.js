// AI로 책 정보 생성
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
    const { title, author } = req.body;

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

    // 2. AI로 가이드 생성
    let aiContent = null;
    if (aladinData.found && aladinData.설명) {
      try {
        const payload = {
          model: 'gpt-5-mini',
          max_tokens: 400,
          temperature: 0.4,
          messages: [{
            role: 'user',
            content: `다음 어린이 책에 대한 가이드를 생성해주세요:

책 제목: ${title}
저자: ${aladinData.저자}
출판사: ${aladinData.출판사}
${aladinData.설명 ? '설명: ' + aladinData.설명 : ''}

다음 항목을 JSON 형식으로만 답변:
{
  "테마": "주요 테마 3개 (쉼표 구분)",
  "연령": "추정 연령대 (예: 3-7세)",
  "부모_읽기_가이드": "150자 내외 부모 가이드",
  "연계놀이": "150자 내외 연계 놀이 아이디어"
}`
          }]
        };

        debugLog('[WHY] chat payload temperature =', payload.temperature);

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          debugLog('[WHY] response status:', aiResponse.status, 'finish_reason:', aiData?.choices?.[0]?.finish_reason);
          const content = aiData.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiContent = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (e) {
        console.error('AI generation error:', e);
      }
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
      if (aiContent.테마) bookData.themes = aiContent.테마;
      if (aiContent.연령) bookData.age_range = aiContent.연령;
      if (aiContent.부모_읽기_가이드) bookData.parent_guide = aiContent.부모_읽기_가이드;
      if (aiContent.연계놀이) bookData.activities = aiContent.연계놀이;
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



