// 책등 사진에서 여러 권의 제목을 읽고 알라딘 검색 결과와 연결

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALADIN_API_KEY = process.env.ALADIN_API_KEY || 'ttbcasey862231001';

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      for (const content of item.content || []) {
        if (content.type === 'output_text' && typeof content.text === 'string') {
          return content.text.trim();
        }
      }
    }
  }

  return '';
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_:·ㆍ.,!?「」『』()\[\]]/g, '');
}

async function searchAladin(title) {
  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${ALADIN_API_KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=5&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = await response.json();
  return (data.item || []).map(book => ({
    isbn: book.isbn13 || book.isbn || '',
    title: book.title || '',
    author: book.author || '',
    publisher: book.publisher || '',
    pubDate: book.pubDate || '',
    cover: book.cover || '',
    description: book.description || ''
  })).filter(book => book.isbn && book.title);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!OPENAI_API_KEY) return res.status(500).json({ error: '이미지 인식 API 설정이 필요합니다.' });

  try {
    const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 3) : [];
    if (!images.length) {
      return res.status(400).json({ error: '책등 사진을 한 장 이상 올려주세요.' });
    }

    const invalidImage = images.some(image =>
      typeof image !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(image)
    );
    if (invalidImage) {
      return res.status(400).json({ error: '지원하지 않는 이미지 형식입니다.' });
    }

    const totalSize = images.reduce((sum, image) => sum + image.length, 0);
    if (totalSize > 4_000_000) {
      return res.status(413).json({ error: '사진 용량이 너무 큽니다. 사진 수를 줄여 다시 시도해주세요.' });
    }

    const prompt = `이 사진들은 사용자가 읽은 어린이책들의 책등 사진이다.
사진마다 보이는 책등을 하나씩 살펴보고, 실제로 읽을 수 있는 제목만 추출하라.

규칙:
- 한국어 세로쓰기와 회전된 책등 글자를 고려한다.
- 제목을 추측해서 만들어내지 않는다.
- 같은 책이 여러 사진에 있으면 한 번만 반환한다.
- 시리즈명만 보이고 개별 제목을 구분할 수 없으면 confidence를 low로 둔다.
- 저자는 책등에 명확히 보일 때만 적는다.
- 최대 12권까지만 반환한다.
- 반드시 아래 JSON 형식만 출력한다.

{
  "books": [
    {
      "title": "책 제목",
      "author": "저자 또는 빈 문자열",
      "confidence": "high 또는 medium 또는 low"
    }
  ]
}`;

    const content = [
      { type: 'input_text', text: prompt },
      ...images.map(image => ({ type: 'input_image', image_url: image, detail: 'high' }))
    ];

    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
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

    const responseData = await openAIResponse.json();
    const parsed = parseJson(extractResponseText(responseData));
    const detectedBooks = Array.isArray(parsed?.books) ? parsed.books : [];

    const seen = new Set();
    const uniqueBooks = detectedBooks.filter(book => {
      const normalized = normalizeTitle(book.title);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }).slice(0, 12);

    const books = await Promise.all(uniqueBooks.map(async book => ({
      detectedTitle: String(book.title || '').trim(),
      detectedAuthor: String(book.author || '').trim(),
      confidence: ['high', 'medium', 'low'].includes(book.confidence) ? book.confidence : 'low',
      candidates: await searchAladin(String(book.title || '').trim())
    })));

    return res.status(200).json({ success: true, books });
  } catch (error) {
    console.error('책등 사진 처리 오류:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
