// 메모 요약 생성 함수 (내부 함수)
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
