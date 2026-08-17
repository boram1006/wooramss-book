const DEFAULT_MODEL = 'gpt-5-mini';

const EMPTY_GUIDE = Object.freeze({
  themes: [],
  ageRange: '',
  parentGuide: '',
  activities: ''
});

const GUIDE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    themes: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3
    },
    ageRange: { type: 'string' },
    parentGuide: { type: 'string' },
    activities: { type: 'string' }
  },
  required: ['key', 'themes', 'ageRange', 'parentGuide', 'activities'],
  additionalProperties: false
};

function cleanText(value, maxLength = 800) {
  return String(value || '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeAgeMonths(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 216 ? parsed : null;
}

function normalizeBook(book, index) {
  return {
    key: cleanText(book?.key || book?.isbn || `book-${index + 1}`, 80),
    title: cleanText(book?.title || book?.제목, 200),
    author: cleanText(book?.author || book?.저자, 160),
    publisher: cleanText(book?.publisher || book?.출판사, 160),
    description: cleanText(book?.description || book?.설명, 1600),
    features: cleanText(book?.features || book?.특징, 300)
  };
}

function buildInput(books, childAgeMonths) {
  const ageContext = childAgeMonths === null
    ? '아이 나이 정보 없음: 책의 권장 연령을 기준으로 안내 난이도를 정하세요.'
    : `아이 나이: ${childAgeMonths}개월. 질문의 문장 길이, 놀이 난이도, 안전성을 이 발달 단계에 맞추세요.`;

  const bookLines = books.map((book, index) => [
    `[책 ${index + 1}]`,
    `key: ${book.key}`,
    `제목: ${book.title}`,
    `저자: ${book.author || '정보 없음'}`,
    `출판사: ${book.publisher || '정보 없음'}`,
    `소개: ${book.description || '정보 없음'}`,
    `특징: ${book.features || '정보 없음'}`
  ].join('\n')).join('\n\n');

  return `${ageContext}\n\n${bookLines}`;
}

const SYSTEM_PROMPT = `역할: 당신은 3~5세 유아의 문해력 발달, 상호작용식 함께 읽기, 놀이 중심 학습을 돕는 한국어 부모 코치입니다.

목표: 제공된 책 정보마다 부모가 바로 실행할 수 있는 부모 가이드와 연계 놀이를 만드세요. 아이가 이야기의 주도권을 갖고, 부모는 관찰하고 듣고 아이의 말을 자연스럽게 확장하도록 안내하세요.

성공 기준:
- themes: 책을 구별하는 구체적인 핵심 주제 3개. 서로 중복하지 말고 짧은 명사형으로 작성합니다.
- ageRange: 책 자체의 권장 연령을 "3-5세" 형식으로 추정합니다. 아이의 현재 나이와 혼동하지 않습니다.
- parentGuide: 한국어 150~230자. "함께 볼 점: ... 질문: “...?” “...?” 반응: ..." 순서로 씁니다. 질문은 정확히 2개로, 첫 질문은 그림·사건을 아이 말로 설명하게 하고 둘째 질문은 예측·선택·아이 경험 중 하나로 연결합니다. 현재 아이 나이에 맞는 짧고 일상적인 말로 묻고, 부모가 답을 재촉하거나 고치지 말고 기다린 뒤 아이의 말을 한두 단어 확장해 되돌려주도록 안내합니다.
- activities: 한국어 150~230자. 책의 핵심 내용과 직접 연결된 놀이 1개만 제안합니다. 반드시 "준비물: A, B. 방법: ① ... ② ... ③ ..." 형식으로 쓰고, 집에서 쉽게 구하는 안전한 준비물은 최대 3개, 방법은 2~3단계로 씁니다. 아이가 선택·설명·이야기 만들기를 주도하게 하며 역할놀이, 움직임, 오감 탐색 중 책에 자연스러운 방식을 활용합니다.

제약:
- 제공된 제목·저자·출판사·소개·특징만 근거로 사용합니다. 줄거리, 인물, 결말, 책 형식을 지어내지 마세요.
- 소개가 부족하면 특정 장면을 단정하지 말고 제목과 표지·그림을 함께 관찰하는 방식으로 안전하게 작성합니다.
- 아이를 시험하는 퀴즈, 정답 유도, 학습지식 활동, 부모의 긴 설명을 피합니다.
- "왜 그랬어?", 부모 마음 맞히기, 잘못·착함을 판단시키기처럼 아이를 추궁하거나 죄책감을 줄 수 있는 질문을 쓰지 않습니다.
- 48개월 미만 아이에게는 삼킬 수 있는 작은 물건, 가위 등 위험한 준비물을 제안하지 않습니다.
- "시키세요", "유도하세요" 대신 아이가 고르고 말할 여지를 주는 표현을 씁니다.
- "문해력이 향상돼요" 같은 홍보 문구 대신 실제 행동을 씁니다.
- 따뜻하지만 추상적이지 않은 존댓말을 사용하고, 마크다운과 줄바꿈 없이 각 값을 완결된 문장으로 작성합니다.
- 입력에 여러 책이 있으면 각 key를 그대로 보존하고 모든 책을 한 번씩만 출력합니다.`;

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        return content.text.trim();
      }
    }
  }

  return '';
}

function sanitizeGuide(value) {
  const rawThemes = Array.isArray(value?.themes)
    ? value.themes
    : String(value?.themes || '').split(',');
  const themes = Array.from(new Set(rawThemes.map(theme => cleanText(theme, 40)).filter(Boolean))).slice(0, 3);

  return {
    themes,
    ageRange: cleanText(value?.ageRange, 30),
    parentGuide: cleanText(value?.parentGuide, 500),
    activities: cleanText(value?.activities, 500)
  };
}

function isUsableGuide(guide) {
  return guide.themes.length === 3
    && Boolean(guide.ageRange)
    && Boolean(guide.parentGuide)
    && Boolean(guide.activities);
}

async function generateBookGuides(inputBooks, options = {}) {
  const books = (Array.isArray(inputBooks) ? inputBooks : [])
    .map(normalizeBook)
    .filter(book => book.title);
  if (!books.length) return [];

  const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.OPENAI_API_KEY;
  if (!apiKey) return books.map(book => ({ key: book.key, ...EMPTY_GUIDE }));

  const fetchImpl = options.fetchImpl || fetch;
  const childAgeMonths = normalizeAgeMonths(options.childAgeMonths);
  const schema = {
    type: 'object',
    properties: {
      guides: {
        type: 'array',
        items: GUIDE_ITEM_SCHEMA,
        minItems: books.length,
        maxItems: books.length
      }
    },
    required: ['guides'],
    additionalProperties: false
  };

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      input: [
        { role: 'developer', content: SYSTEM_PROMPT },
        { role: 'user', content: buildInput(books, childAgeMonths) }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'early_literacy_book_guides',
          strict: true,
          schema
        },
        verbosity: 'low'
      },
      reasoning: { effort: 'low' },
      max_output_tokens: Math.min(6000, Math.max(1000, books.length * 650))
    })
  });

  if (!response.ok) {
    const detail = cleanText(await response.text(), 300);
    throw new Error(`OpenAI guide generation failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const data = await response.json();
  const text = extractResponseText(data);
  if (!text) throw new Error('OpenAI guide generation returned empty output');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('OpenAI guide generation returned invalid JSON');
  }

  const generatedByKey = new Map((parsed.guides || []).map(item => [cleanText(item.key, 80), sanitizeGuide(item)]));
  return books.map(book => {
    const guide = generatedByKey.get(book.key) || { ...EMPTY_GUIDE };
    return { key: book.key, ...(isUsableGuide(guide) ? guide : { ...EMPTY_GUIDE }) };
  });
}

async function generateBookGuide(book, options = {}) {
  const [guide] = await generateBookGuides([book], options);
  if (!guide) return { ...EMPTY_GUIDE };
  const { key, ...value } = guide;
  return value;
}

module.exports = {
  EMPTY_GUIDE,
  SYSTEM_PROMPT,
  generateBookGuide,
  generateBookGuides,
  sanitizeGuide
};
