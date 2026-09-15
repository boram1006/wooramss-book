// Vercel Serverless Function
// 알라딘 책 검색

const ExcelJS = require('exceljs');

const ALADIN_API_KEY = process.env.ALADIN_API_KEY || 'ttbcasey862231001';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (error) { return null; }
}

function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[\s\-_:·ㆍ.,!?「」『』()\[\]]/g, '');
}

function convertAladinBook(book) {
  return {
    isbn: book.isbn13 || book.isbn || '',
    title: book.title || '',
    author: book.author || '',
    publisher: book.publisher || '',
    pubDate: book.pubDate || '',
    cover: book.cover || '',
    description: book.description || '',
    price: book.priceStandard,
    link: book.link
  };
}

async function searchAladinByTitle(title, maxResults = 5) {
  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_API_KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=${maxResults}&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.item || []).map(convertAladinBook).filter(book => book.isbn && book.title);
}

async function lookupAladinByIsbn(isbn) {
  const url = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN_API_KEY}&itemIdType=ISBN&ItemId=${encodeURIComponent(isbn)}&output=js&Version=20131101&Cover=Big`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  return data.item?.[0] ? convertAladinBook(data.item[0]) : null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchNlcyRecommendations() {
  const sourceUrl = 'https://www.nlcy.go.kr/NLCY/contents/C10600000000.do?schBdcode=_nlcy_normal0801';
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DoranDoranBook/1.0)' }
  });
  if (!response.ok) throw new Error('국립어린이청소년도서관 목록을 불러오지 못했습니다.');
  const html = await response.text();
  const itemPattern = /<p\s+class="tit">\s*([\s\S]*?)\s*<\/p>[\s\S]*?<button\s+class="btn_view"[^>]*onclick="[^"]*?fnDetailSearch\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([0-9Xx]{10,13})'/g;
  const found = [];
  const seen = new Set();
  let match;
  while ((match = itemPattern.exec(html)) && found.length < 30) {
    const title = decodeHtml(match[1].replace(/<[^>]+>/g, ''));
    const isbn = match[2].toUpperCase();
    if (!title || seen.has(isbn)) continue;
    seen.add(isbn);
    found.push({ title, isbn });
  }
  if (!found.length) throw new Error('추천 목록 형식이 변경되어 책을 읽지 못했습니다.');

  const books = await mapWithConcurrency(found, 5, async sourceBook => {
    try {
      return await lookupAladinByIsbn(sourceBook.isbn) || sourceBook;
    } catch (error) {
      return sourceBook;
    }
  });
  return { source: 'nlcy', sourceUrl, books };
}

function plainCellValue(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (value.text != null) return String(value.text);
    if (value.result != null) return String(value.result);
  }
  return String(value);
}

function normalizeHeader(value) {
  return String(value || '').replace(/[\s·/._-]/g, '').toLowerCase();
}

function firstValidIsbn(value) {
  const candidates = String(value || '').toUpperCase().match(/[0-9X][0-9X\s-]{8,20}[0-9X]/g) || [];
  for (const candidate of candidates) {
    const normalized = candidate.replace(/[^0-9X]/g, '');
    if (normalized.length === 10 || normalized.length === 13) return normalized;
  }
  return '';
}

function recommendedAge(value) {
  const match = String(value || '').match(/(\d{1,2})\s*세/);
  return match ? Number(match[1]) : null;
}

async function fetchChildbookRecommendations(maxAge = 7) {
  const listUrl = 'https://www.childbook.org/news/notice_list.html?b_class=1';
  const requestOptions = { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DoranDoranBook/1.0)' } };
  const listResponse = await fetch(listUrl, requestOptions);
  if (!listResponse.ok) throw new Error('어린이도서연구회 공지 목록을 불러오지 못했습니다.');
  const listHtml = await listResponse.text();

  const anchors = [...listHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const selectedNotice = anchors.find(([, href, label]) => {
    const title = decodeHtml(label.replace(/<[^>]+>/g, ''));
    return href.includes('mode=VIEW_FORM') && title.includes('어린이도서연구회가 뽑은') && title.includes('어린이');
  });
  if (!selectedNotice) throw new Error('최신 어린이도서연구회 선정 목록을 찾지 못했습니다.');

  const detailUrl = new URL(decodeHtml(selectedNotice[1]), listUrl).toString();
  const detailResponse = await fetch(detailUrl, requestOptions);
  if (!detailResponse.ok) throw new Error('어린이도서연구회 선정 목록 상세를 불러오지 못했습니다.');
  const detailHtml = await detailResponse.text();
  const downloadAnchors = [...detailHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const spreadsheetLink = downloadAnchors.find(([, href, label]) => {
    const combined = `${decodeHtml(href)} ${decodeHtml(label.replace(/<[^>]+>/g, ''))}`.toLowerCase();
    return combined.includes('download.php') && combined.includes('.xlsx');
  });
  if (!spreadsheetLink) throw new Error('최신 선정 목록의 엑셀 파일을 찾지 못했습니다.');

  const spreadsheetUrl = new URL(decodeHtml(spreadsheetLink[1]), detailUrl).toString();
  const spreadsheetResponse = await fetch(spreadsheetUrl, requestOptions);
  if (!spreadsheetResponse.ok) throw new Error('어린이도서연구회 선정 목록 파일을 내려받지 못했습니다.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await spreadsheetResponse.arrayBuffer()));

  const found = [];
  const seen = new Set();
  workbook.eachSheet(sheet => {
    let headerRowNumber = 0;
    let columns = {};
    for (let rowNumber = 1; rowNumber <= Math.min(5, sheet.rowCount); rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const candidateColumns = {};
      row.eachCell((cell, columnNumber) => {
        candidateColumns[normalizeHeader(plainCellValue(cell))] = columnNumber;
      });
      if (candidateColumns.isbn && candidateColumns['책이름']) {
        headerRowNumber = rowNumber;
        columns = candidateColumns;
        break;
      }
    }
    if (!headerRowNumber || !columns['연령']) return;

    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const ageLabel = plainCellValue(row.getCell(columns['연령']));
      const age = recommendedAge(ageLabel);
      if (age == null || age > maxAge) continue;
      const isbn = firstValidIsbn(plainCellValue(row.getCell(columns.isbn)));
      const title = plainCellValue(row.getCell(columns['책이름'])).trim();
      if (!isbn || !title || seen.has(isbn)) continue;
      seen.add(isbn);
      found.push({
        isbn,
        title,
        author: columns['글쓴이'] ? plainCellValue(row.getCell(columns['글쓴이'])).trim() : '',
        publisher: columns['출판사'] ? plainCellValue(row.getCell(columns['출판사'])).trim() : '',
        ageLabel
      });
    }
  });
  if (!found.length) throw new Error('현재 연령에 맞는 선정 도서를 찾지 못했습니다.');

  const books = await mapWithConcurrency(found, 5, async sourceBook => {
    try {
      return { ...sourceBook, ...(await lookupAladinByIsbn(sourceBook.isbn) || {}) };
    } catch (error) {
      return sourceBook;
    }
  });
  return { source: 'childbook', sourceUrl: detailUrl, maxAge, books };
}

async function recognizeBookSpines(req, res) {
  if (!OPENAI_API_KEY) return res.status(500).json({ error: '이미지 인식 API 설정이 필요합니다.' });

  const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 3) : [];
  if (!images.length) return res.status(400).json({ error: '책등 사진을 한 장 이상 올려주세요.' });

  const invalidImage = images.some(image =>
    typeof image !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(image)
  );
  if (invalidImage) return res.status(400).json({ error: '지원하지 않는 이미지 형식입니다.' });

  const totalSize = images.reduce((sum, image) => sum + image.length, 0);
  if (totalSize > 4_000_000) {
    return res.status(413).json({ error: '사진 용량이 너무 큽니다. 사진 수를 줄여 다시 시도해주세요.' });
  }

  const prompt = `이 사진들은 사용자가 찾고 싶은 책의 표지 또는 여러 어린이책의 책등 사진이다.
사진마다 보이는 표지와 책등을 살펴보고, 실제로 읽을 수 있는 제목만 추출하라.

규칙:
- 표지의 큰 제목과 한국어 세로쓰기, 회전된 책등 글자를 고려한다.
- 제목을 추측해서 만들어내지 않는다.
- 같은 책이 여러 사진에 있으면 한 번만 반환한다.
- 시리즈명만 보이고 개별 제목을 구분할 수 없으면 confidence를 low로 둔다.
- 저자는 책등에 명확히 보일 때만 적는다.
- 최대 12권까지만 반환한다.
- 반드시 아래 JSON 형식만 출력한다.

{"books":[{"title":"책 제목","author":"저자 또는 빈 문자열","confidence":"high 또는 medium 또는 low"}]}`;

  const content = [
    { type: 'input_text', text: prompt },
    ...images.map(image => ({ type: 'input_image', image_url: image, detail: 'high' }))
  ];
  const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-5-mini',
      input: [{ role: 'user', content }],
      text: { format: { type: 'text' }, verbosity: 'low' },
      reasoning: { effort: 'low' },
      max_output_tokens: 1200
    })
  });

  if (!openAIResponse.ok) {
    const errorText = await openAIResponse.text();
    console.error('책등 이미지 인식 실패:', openAIResponse.status, errorText.slice(0, 500));
    return res.status(502).json({ error: '사진을 분석하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }

  const parsed = parseJson(extractResponseText(await openAIResponse.json()));
  const seen = new Set();
  const detectedBooks = (Array.isArray(parsed?.books) ? parsed.books : []).filter(book => {
    const normalized = normalizeTitle(book.title);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, 12);

  const books = await Promise.all(detectedBooks.map(async book => ({
    detectedTitle: String(book.title || '').trim(),
    detectedAuthor: String(book.author || '').trim(),
    confidence: ['high', 'medium', 'low'].includes(book.confidence) ? book.confidence : 'low',
    candidates: await searchAladinByTitle(String(book.title || '').trim(), 5)
  })));

  return res.status(200).json({ success: true, books });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      return await recognizeBookSpines(req, res);
    } catch (error) {
      console.error('책등 사진 처리 오류:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { query, isbn, source, maxAge } = req.query;

    if (source === 'nlcy') {
      const result = await fetchNlcyRecommendations();
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json({ success: true, ...result, total: result.books.length });
    }

    if (source === 'childbook') {
      const resolvedMaxAge = Math.max(0, Math.min(12, Number(maxAge) || 7));
      const result = await fetchChildbookRecommendations(resolvedMaxAge);
      res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json({ success: true, ...result, total: result.books.length });
    }
    
    if (!query) {
      return res.status(400).json({ error: '검색어를 입력해주세요' });
    }
    
    let aladinItemId = '';
    try {
      const parsedUrl = new URL(query);
      if (/(^|\.)aladin\.co\.kr$/i.test(parsedUrl.hostname)) {
        aladinItemId = parsedUrl.searchParams.get('ItemId') || parsedUrl.searchParams.get('itemid') || '';
      }
    } catch (error) {
      // URL이 아니면 일반 검색어로 처리한다.
    }

    // ISBN 또는 알라딘 상품 링크 검색인 경우 ItemLookUp API 사용
    if (aladinItemId || isbn === 'true' || /^[0-9]{10,13}[0-9X]*$/.test(query.replace(/[^0-9X]/g, ''))) {
      const itemId = aladinItemId || query.replace(/[^0-9X]/g, '');
      const itemIdType = aladinItemId ? 'ItemId' : 'ISBN';
      const url = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN_API_KEY}&itemIdType=${itemIdType}&ItemId=${encodeURIComponent(itemId)}&output=js&Version=20131101&Cover=Big`;
      
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
    const books = await searchAladinByTitle(query, 20);
    
    res.status(200).json({
      success: true,
      total: books.length,
      books
    });
    
  } catch (error) {
    console.error('알라딘 검색 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
