// 도서관정보나루 API를 사용하여 부천시 도서관에서 책 보유 여부 확인
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const LIBRARY_API_KEY = process.env.LIBRARY_API_KEY || '28c38447391ff3d74744cd4ca0e6759b64681f2b804affc82eb57d05b72e52bd';

  // 부천시 도서관 코드 (전체 36개, 주요 시립 도서관 12개 포함)
  const BUCHEON_LIBRARIES = [
    // 부천시립 도서관 (주요)
    { libCode: '141065', libName: '부천시립꿈빛도서관' },
    { libCode: '141248', libName: '부천시립꿈여울도서관' },
    { libCode: '141583', libName: '부천시립도당도서관' },
    { libCode: '141315', libName: '부천시립동화도서관' },
    { libCode: '141056', libName: '부천시립북부도서관' },
    { libCode: '141321', libName: '부천시립상동도서관' },
    { libCode: '141559', libName: '부천시립송내도서관' },
    { libCode: '141043', libName: '부천시립심곡도서관' },
    { libCode: '141584', libName: '부천시립오정도서관' },
    { libCode: '141535', libName: '부천시립원미도서관' },
    { libCode: '141115', libName: '부천시립책마루도서관' },
    { libCode: '141151', libName: '부천시립한울빛도서관' },
    // 기타 부천시 도서관
    { libCode: '141603', libName: '부천시립역곡도서관' },
    { libCode: '141660', libName: '부천시립역곡밝은도서관' },
    { libCode: '141651', libName: '부천시립수주도서관' },
    { libCode: '141652', libName: '부천시립별빛마루도서관' }
  ];

  try {
    // 1. Supabase에서 모든 책 가져오기 (페이지네이션)
    const supabase = getSupabaseClient();
    let allBooks = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData, error } = await supabase
        .from('books')
        .select('*')
        .range(from, from + pageSize - 1);

      if (error) {
        throw new Error(`Supabase Books error: ${error.message}`);
      }

      if (pageData && pageData.length > 0) {
        allBooks = allBooks.concat(pageData);
        from += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    if (error) {
      throw new Error(`Supabase Books error: ${error.message}`);
    }

    // ISBN이 있는 책만 필터링
    const booksWithISBN = (allBooks || []).filter(book => {
      const isbn = book.isbn;
      return isbn && isbn.trim();
    });

    console.log(`[INFO] ISBN이 있는 책: ${booksWithISBN.length}권`);

    // 2. 각 도서관에서 책 보유 여부 확인
    const results = [];

    // 샘플로 처음 10권만 확인 (API 호출 제한 고려)
    const testBooks = booksWithISBN.slice(0, 10);

    for (const book of testBooks) {
      const isbn = book.isbn.replace(/-/g, '').trim();
      const title = book.title || '';

      const availability = {
        bookId: book.id,
        title: title,
        isbn: isbn,
        libraries: []
      };

      // 각 도서관에서 확인
      for (const lib of BUCHEON_LIBRARIES) {
        try {
          const url = `http://data4library.kr/api/itemSrch`;
          const params = new URLSearchParams({
            authKey: LIBRARY_API_KEY,
            format: 'json',
            libCode: lib.libCode,
            type: 'ALL',
            pageNo: '1',
            pageSize: '100'
          });

          const response = await fetch(`${url}?${params.toString()}`, {
            timeout: 10000
          });

          if (response.ok) {
            const data = await response.json();
            
            // ISBN 매칭
            if (data.response && data.response.docs) {
              const docs = Array.isArray(data.response.docs) ? data.response.docs : [data.response.docs];
              
              for (const doc of docs) {
                const bookData = doc.book || doc;
                // ISBN 필드명 확인: isbn13, isbn, ISBN 등 다양한 형태 가능
                const bookISBN = (bookData.isbn13 || bookData.isbn || bookData.ISBN || bookData.ISBN13 || '').replace(/-/g, '').trim();
                
                if (bookISBN && (isbn === bookISBN || isbn.includes(bookISBN) || bookISBN.includes(isbn))) {
                  availability.libraries.push({
                    libCode: lib.libCode,
                    libName: lib.libName,
                    available: true
                  });
                  break;
                }
              }
            }
          }

          // API 호출 제한을 위해 잠시 대기
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`도서관 ${lib.libName} 조회 실패:`, error.message);
        }
      }

      results.push(availability);
    }

    res.status(200).json({
      success: true,
      totalBooks: booksWithISBN.length,
      checkedBooks: testBooks.length,
      libraries: BUCHEON_LIBRARIES,
      results: results
    });

  } catch (error) {
    console.error('도서관 확인 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
