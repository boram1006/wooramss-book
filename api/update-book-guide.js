// 기존 책의 가이드 업데이트
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

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { bookId, title, author } = req.body;

    if (!bookId || !title) {
      return res.status(400).json({ error: 'bookId and title required' });
    }

    // 1. 알라딘에서 책 정보 가져오기 (ISBN이 있으면)
    let bookInfo = { title, author: author || '' };
    
    // 2. AI로 가이드 생성
    const prompt = `다음 어린이 책에 대한 가이드를 생성해주세요:

책 제목: ${title}
저자: ${author || ''}

다음 항목을 JSON 형식으로만 답변:
{
  "테마": "주요 테마 3개 (쉼표 구분)",
  "연령": "추정 연령대 (예: 3-7세)",
  "부모_읽기_가이드": "150자 내외 부모 가이드",
  "연계놀이": "150자 내외 연계 놀이 아이디어"
}`;

    const payload = {
      model: 'gpt-5-mini',
      max_tokens: 1024,
      temperature: 0.4,
      messages: [{
        role: 'user',
        content: prompt
      }]
    };

    debugLog('[WHY] chat payload temperature =', payload.temperature);

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!aiResponse.ok) {
      throw new Error('AI API 호출 실패');
    }

    const aiData = await aiResponse.json();
    debugLog('[WHY] response status:', aiResponse.status, 'finish_reason:', aiData?.choices?.[0]?.finish_reason);
    const text = aiData.choices?.[0]?.message?.content || '';
    
    // JSON 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI 응답 파싱 실패');
    }
    
    const aiContent = JSON.parse(jsonMatch[0]);

    // 3. Supabase 업데이트
    const supabase = getSupabaseClient();
    
    const updateFields = {};
    if (aiContent.테마) updateFields.themes = aiContent.테마;
    if (aiContent.연령) updateFields.age_range = aiContent.연령;
    if (aiContent.부모_읽기_가이드) updateFields.parent_guide = aiContent.부모_읽기_가이드;
    if (aiContent.연계놀이) updateFields.activities = aiContent.연계놀이;

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

