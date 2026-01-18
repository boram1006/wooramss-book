// Supabase 데이터 가져오기 (Airtable 대체)
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
        '관심': record.interested === true || record.interested === 'true' || record.interested === 1
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

// Supabase 형식의 데이터를 Airtable 형식으로 변환
function convertSupabaseToAirtable(data, tableName) {
  if (tableName === 'Books' || tableName === 'books') {
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
  } else if (tableName === 'ReadingLog' || tableName === 'reading_logs') {
    return {
      id: data.id,
      fields: {
        '책': data.book_id ? [data.book_id] : [],
        '완독여부': data.completed,
        '아이반응': data.child_reaction,
        '메모': data.memo,
        '질문정도': data.question_level,
        '집중정도': data.focus_level,
        'memoSummary': data.memo_summary ? JSON.stringify(data.memo_summary) : null,
        '날짜': data.read_date
      }
    };
  }
  return data;
}

// Airtable fields 형식을 Supabase 형식으로 변환
function convertFieldsToSupabase(fields, tableName) {
  if (tableName === 'Books' || tableName === 'books') {
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
  } else if (tableName === 'ReadingLog' || tableName === 'reading_logs') {
    return {
      book_id: Array.isArray(fields['책']) ? fields['책'][0] : fields['책'],
      completed: fields['완독여부'] || false,
      child_reaction: fields['아이반응'],
      memo: fields['메모'],
      question_level: fields['질문정도'],
      focus_level: fields['집중정도'],
      memo_summary: fields['memoSummary'] ? (typeof fields['memoSummary'] === 'string' ? JSON.parse(fields['memoSummary']) : fields['memoSummary']) : null,
      read_date: fields['날짜'] || fields['읽은날짜'] || fields['읽은 날짜']
    };
  }
  return fields;
}

// Supabase 데이터 가져오기 API 엔드포인트
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { table } = req.query;
  
  if (!table) {
    return res.status(400).json({ error: 'Table name required' });
  }

  try {
    // 환경 변수 확인
    if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
      console.error('Supabase configuration error:', {
        hasUrl: !!process.env.SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasAnonKey: !!process.env.SUPABASE_ANON_KEY
      });
      return res.status(500).json({ 
        error: 'Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required',
        details: '환경 변수가 설정되지 않았습니다. Vercel 환경 변수를 확인하세요.'
      });
    }

    const supabase = getSupabaseClient();
    const supabaseTableName = TABLE_MAP[table] || table.toLowerCase();

    console.log(`Fetching from table: ${supabaseTableName}`);

    // 모든 레코드 가져오기 (Supabase는 기본적으로 1000개로 제한하므로 페이지네이션 필요)
    let allData = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData, error } = await supabase
        .from(supabaseTableName)
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('Supabase query error:', error);
        throw new Error(`Supabase error: ${error.message} (code: ${error.code})`);
      }

      if (pageData && pageData.length > 0) {
        allData = allData.concat(pageData);
        from += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const data = allData;
    console.log(`Fetched ${data.length} records from ${supabaseTableName}`);

    // Airtable 형식으로 변환하여 반환 (하위 호환성)
    const convertedData = convertAirtableToSupabase(data || [], table);

    res.status(200).json(convertedData);
  } catch (error) {
    console.error('Supabase fetch error:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// 헬퍼 함수들 export
module.exports.getSupabaseClient = getSupabaseClient;
module.exports.convertFieldsToSupabase = convertFieldsToSupabase;
module.exports.convertSupabaseToAirtable = convertSupabaseToAirtable;
module.exports.convertAirtableToSupabase = convertAirtableToSupabase;
module.exports.TABLE_MAP = TABLE_MAP;

