// Supabase 책 필드 업데이트
const { createClient } = require('@supabase/supabase-js');

// Supabase 클라이언트 초기화
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Airtable fields를 Supabase 형식으로 변환
function convertFieldsToSupabase(fields) {
  // 관심 필드는 boolean으로 명시적 변환
  let interested = false;
  if (fields['관심'] !== undefined && fields['관심'] !== null) {
    if (typeof fields['관심'] === 'boolean') {
      interested = fields['관심'];
    } else if (typeof fields['관심'] === 'string') {
      interested = fields['관심'] === 'true' || fields['관심'] === '1';
    } else {
      interested = Boolean(fields['관심']);
    }
  }

  return {
    isbn: fields['ISBN'] || fields['ISBN13'] || fields['ISBN-13'],
    title: fields['제목'],
    author: fields['저자'],
    publisher: fields['출판사'],
    pub_year: fields['발행년'],
    cover_image: fields['표지이미지'],
    description: fields['설명'],
    themes: fields['테마'],
    age_range: fields['연령'],
    parent_guide: fields['부모_읽기_가이드'],
    activities: fields['연계놀이'],
    interested: interested
  };
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { recordId, fields } = req.body;

    if (!recordId || !fields) {
      return res.status(400).json({ error: 'recordId and fields required' });
    }

    const supabase = getSupabaseClient();
    const supabaseFields = convertFieldsToSupabase(fields);

    // null이 아닌 필드만 업데이트 (boolean false는 포함)
    const updateData = {};
    Object.keys(supabaseFields).forEach(key => {
      const value = supabaseFields[key];
      // undefined나 null이 아니면 업데이트 (boolean false는 포함)
      if (value !== undefined && value !== null) {
        updateData[key] = value;
      }
    });

    const { data, error } = await supabase
      .from('books')
      .update(updateData)
      .eq('id', recordId)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase update error: ${error.message}`);
    }

    // Airtable 형식으로 변환 (하위 호환성)
    const convertedRecord = {
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

    res.status(200).json({
      success: true,
      record: convertedRecord
    });
  } catch (error) {
    console.error('Update book field error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
