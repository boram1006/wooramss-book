// Airtable 데이터 가져오기 (Supabase로 마이그레이션됨 - 하위 호환성을 위해 유지)
// 이 파일은 내부적으로 Supabase를 사용하지만, Airtable 형식의 응답을 반환합니다.
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

// 테이블 이름 매핑 (Airtable → Supabase)
const TABLE_MAP = {
  'Books': 'books',
  'ReadingLog': 'reading_logs'
};

// Airtable 형식의 레코드를 Supabase 형식으로 변환
function convertAirtableToSupabase(records, tableName) {
  if (tableName === 'Books' || tableName === 'books') {
    return records.map(record => ({
      id: record.id,
      fields: {
        'ISBN': record.isbn,
        '제목': record.title,
        '저자': record.author,
        '출판사': record.publisher,
        '발행년': record.pub_year,
        '표지이미지': record.cover_image,
        '설명': record.description,
        '테마': record.themes,
        '연령': record.age_range,
        '부모_읽기_가이드': record.parent_guide,
        '연계놀이': record.activities,
        '관심': record.interested
      }
    }));
  } else if (tableName === 'ReadingLog' || tableName === 'reading_logs') {
    return records.map(record => ({
      id: record.id,
      fields: {
        '책': record.book_id ? [record.book_id] : [],
        '완독여부': record.completed,
        '아이반응': record.child_reaction,
        '메모': record.memo,
        '질문정도': record.question_level,
        '집중정도': record.focus_level,
        'memoSummary': record.memo_summary ? JSON.stringify(record.memo_summary) : null,
        '날짜': record.read_date
      }
    }));
  }
  return records;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { table } = req.query;
  
  if (!table) {
    return res.status(400).json({ error: 'Table name required' });
  }

  try {
    const supabase = getSupabaseClient();
    const supabaseTableName = TABLE_MAP[table] || table.toLowerCase();

    // 모든 레코드 가져오기
    const { data, error } = await supabase
      .from(supabaseTableName)
      .select('*');

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    // Airtable 형식으로 변환하여 반환 (하위 호환성)
    const convertedData = convertAirtableToSupabase(data || [], table);

    res.status(200).json(convertedData);
  } catch (error) {
    console.error('Supabase fetch error:', error);
    res.status(500).json({ error: error.message });
  }
};
