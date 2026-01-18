// Vercel Serverless Function
// 알라딘 책 검색

const ALADIN_API_KEY = process.env.ALADIN_API_KEY || 'ttbcasey862231001';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { query, isbn } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: '검색어를 입력해주세요' });
    }
    
    // ISBN 검색인 경우 ItemLookUp API 사용 (더 정확함)
    if (isbn === 'true' || /^[0-9]{10,13}[0-9X]*$/.test(query.replace(/[^0-9X]/g, ''))) {
      const isbnCode = query.replace(/[^0-9X]/g, '');
      const url = `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN_API_KEY}&itemIdType=ISBN&ItemId=${isbnCode}&output=js&Version=20131101&Cover=Big`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.errorCode && data.errorCode !== '0') {
        return res.status(200).json({
          success: false,
          total: 0,
          books: [],
          error: 'ISBN으로 책을 찾을 수 없습니다'
        });
      }
      
      const book = data.item && data.item[0];
      if (!book) {
        return res.status(200).json({
          success: false,
          total: 0,
          books: [],
          error: 'ISBN으로 책을 찾을 수 없습니다'
        });
      }
      
      return res.status(200).json({
        success: true,
        total: 1,
        books: [{
          isbn: book.isbn13 || book.isbn,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          pubDate: book.pubDate,
          cover: book.cover,
          description: book.description,
          price: book.priceStandard,
          link: book.link
        }]
      });
    }
    
    // 일반 제목 검색
    const url = `http://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_API_KEY}&Query=${encodeURIComponent(query)}&QueryType=Title&MaxResults=20&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.status(200).json({
      success: true,
      total: data.totalResults || 0,
      books: (data.item || []).map(book => ({
        isbn: book.isbn13 || book.isbn,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        pubDate: book.pubDate,
        cover: book.cover,
        description: book.description,
        price: book.priceStandard,
        link: book.link
      }))
    });
    
  } catch (error) {
    console.error('알라딘 검색 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
