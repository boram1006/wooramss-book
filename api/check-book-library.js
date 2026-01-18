// 부천시 도서관 보유 여부 확인 (ISBN 단건)
const LIBRARY_API_KEY = process.env.LIBRARY_API_KEY || '28c38447391ff3d74744cd4ca0e6759b64681f2b804affc82eb57d05b72e52bd';

const BUCHEON_LIBRARIES = [
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
  { libCode: '141603', libName: '부천시립역곡도서관' },
  { libCode: '141660', libName: '부천시립역곡밝은도서관' },
  { libCode: '141651', libName: '부천시립수주도서관' },
  { libCode: '141652', libName: '부천시립별빛마루도서관' }
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { isbn } = req.query;
    if (!isbn) {
      return res.status(400).json({ success: false, error: 'ISBN이 필요합니다' });
    }

    const isbn13 = isbn.replace(/[^0-9X]/g, '');
    if (!isbn13) {
      return res.status(400).json({ success: false, error: '유효한 ISBN이 아닙니다' });
    }

    const results = [];
    for (const lib of BUCHEON_LIBRARIES) {
      try {
        const params = new URLSearchParams({
          authKey: LIBRARY_API_KEY,
          libCode: lib.libCode,
          isbn13: isbn13,
          format: 'json'
        });
        const url = `http://data4library.kr/api/bookExist?${params.toString()}`;
        const response = await fetch(url);
        const data = await response.json();
        const result = data?.response?.result || {};
        const hasBook = result.hasBook === 'Y';
        const loanAvailable = result.loanAvailable === 'Y';

        results.push({
          libCode: lib.libCode,
          libName: lib.libName,
          hasBook,
          loanAvailable
        });
      } catch (error) {
        console.error(`도서관 ${lib.libName} 조회 실패:`, error.message);
        results.push({
          libCode: lib.libCode,
          libName: lib.libName,
          hasBook: false,
          loanAvailable: false,
          error: true
        });
      }
    }

    res.status(200).json({
      success: true,
      isbn: isbn13,
      results
    });
  } catch (error) {
    console.error('도서관 조회 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
