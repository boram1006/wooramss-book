const DEFAULT_MODEL = 'gpt-5-mini';

const EMPTY_GUIDE = Object.freeze({
  ageRange: '',
  parentGuide: '',
  activities: ''
});

const INTERACTION_STRATEGIES = Object.freeze([
  '그림 단서 찾기',
  '예측하고 확인하기',
  '순서 다시 말하기',
  '감정과 관점 나누기',
  '낱말과 개념 익히기',
  '소리와 말놀이',
  '경험과 장면 잇기',
  '인물 되어 말하기'
]);

const STRATEGY_TASKS = Object.freeze({
  '그림 단서 찾기': '질문1=눈에 보이는 한 가지 발견, 질문2=그 발견의 위치·변화 근거, 반응=해당 부분을 짚고 앞뒤 그림 비교',
  '예측하고 확인하기': '질문1=다음 사건 예측, 질문2=현재 장면의 예측 단서, 반응=다음 장면에서 예상과 실제 비교',
  '순서 다시 말하기': '질문1=처음 장면, 질문2=그다음 장면, 반응=관련 페이지를 다시 찾아 순서 연결',
  '감정과 관점 나누기': '질문1=감정 이름, 질문2=표정·몸짓·행동 근거, 반응=정답을 대신 말하지 않고 장면 단서 비교',
  '낱말과 개념 익히기': '질문1=핵심 낱말의 뜻·기능, 질문2=생활 속 한 가지 예, 반응=그림·몸짓·실물로 뜻 확인',
  '소리와 말놀이': '질문1=책 속 소리 흉내, 질문2=새로운 소리 만들기, 반응=같은 리듬으로 받아 소리 변화 이어가기',
  '경험과 장면 잇기': '질문1=책의 구체적 장면, 질문2=닮은 아이 경험, 반응=책 장면과 아이 경험의 같은 점 연결',
  '인물 되어 말하기': '질문1=한 인물이 할 말, 질문2=상대 인물의 답, 반응=부모도 인물이 되어 한 차례 대화'
});

const QUALITY_FEEDBACK = Object.freeze({
  generic_response: '공통 기다리기·말 확장 문구 대신 책 속 대상에 하는 행동을 쓰세요',
  generic_response_opening: '아이의 답을 듣고 같은 공통 도입을 쓰지 마세요',
  directive_response: '시키기·유도하기 표현을 쓰지 마세요',
  question_contains_choices: '질문 안에 혹은·또는·아니면 같은 선택지를 넣지 마세요',
  multiple_questions_in_one: '질문 하나에 물음 하나만 쓰세요',
  question_not_open: '각 질문에 의문 표현을 정확히 하나만 넣으세요',
  question_not_atomic: '쉼표로 질문을 붙이거나 말해줄래 같은 표현을 쓰지 마세요',
  question_too_long: '질문을 45자 이하로 줄이세요',
  focus_not_actionable: '함께 볼 점을 살펴보세요로 끝내세요',
  response_not_actionable: '반응을 해 보세요 또는 해 주세요로 끝내세요',
  invalid_book_anchor: '책·그림·장면 같은 공통어가 아닌 제목·소개 속 고유 표현을 bookAnchor로 복사하세요',
  ungrounded_book_anchor: 'bookAnchor는 제목·소개에 실제로 있는 표현을 그대로 복사하세요',
  response_missing_book_anchor: '반응 문장에 bookAnchor를 그대로 한 번 넣으세요',
  unquoted_book_anchor: '반응 문장에서 bookAnchor를 반드시 『bookAnchor』 형태로 감싸세요',
  awkward_book_anchor_grammar: '『bookAnchor』에서 예상이라고 쓰지 말고 『bookAnchor』가 나온 다음 장면에서 예상과 실제를 비교한다고 쓰세요',
  duplicated_response_ending: '해 보세요 해 보세요처럼 종결 표현을 반복하지 마세요',
  repeated_word: '같은 낱말을 바로 두 번 반복하지 마세요',
  parent_guide_too_long: '전체 부모 가이드를 260자 이하로 줄이세요',
  invalid_activity_format: '연계 놀이 형식을 준비물과 번호가 있는 방법으로 고치세요'
});

const GUIDE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    ageRange: { type: 'string' },
    bookAnchor: { type: 'string' },
    focus: { type: 'string' },
    question1: { type: 'string' },
    question2: { type: 'string' },
    response: { type: 'string' },
    activities: { type: 'string' }
  },
  required: ['key', 'ageRange', 'bookAnchor', 'focus', 'question1', 'question2', 'response', 'activities'],
  additionalProperties: false
};

function cleanText(value, maxLength = 800) {
  return String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeAgeMonths(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 216 ? parsed : null;
}

function normalizeBook(book, index) {
  const normalized = {
    key: cleanText(book?.key || book?.isbn || `book-${index + 1}`, 80),
    title: cleanText(book?.title || book?.제목, 200),
    author: cleanText(book?.author || book?.저자, 160),
    publisher: cleanText(book?.publisher || book?.출판사, 160),
    description: cleanText(book?.description || book?.설명, 1600),
    features: cleanText(book?.features || book?.특징, 300),
    qualityFeedback: cleanText(book?.qualityFeedback, 500)
  };
  return { ...normalized, interactionStrategy: selectInteractionStrategy(normalized) };
}

function selectInteractionStrategy(book) {
  const title = cleanText(book?.title || book?.제목, 200);
  const description = cleanText(book?.description || book?.설명, 1600);
  const features = cleanText(book?.features || book?.특징, 300);
  const text = `${title} ${description} ${features}`;
  if (/의성어|의태어|말놀이|운율|반복구|입말|말의\s*리듬|소리\s*표현/u.test(text)) return '소리와 말놀이';
  if (/만드는\s*과정|만들기\s*과정|전\s*과정|단계별|차례대로|순서대로|완성하는\s*과정/u.test(text)) return '순서 다시 말하기';
  if (/구조|기능|원리|생태|과학|지식|정보책|도감|어떻게\s*(?:생기|움직|작동)|몸의\s*기관/u.test(text)) return '낱말과 개념 익히기';
  if (/감정|마음|기분|서운|화해|두려|불안|용기|공감/u.test(text)) return '감정과 관점 나누기';
  if (/글\s*없는|색감|색채|조형|명화|그림\s*속\s*단서|숨은\s*그림/u.test(text)) return '그림 단서 찾기';
  if (/갑자기|과연|비밀|수수께끼|나타난다|맞닥뜨|예상치/u.test(text)) return '예측하고 확인하기';
  if (/여정|여행|모험|도전|길을\s*나서|떠나|바깥세상|밖으로\s*나|과정|준비를\s*하|여러\s*사건|에피소드|처음부터\s*끝/u.test(text)) return '순서 다시 말하기';
  if (/대화|다툼|갈등|문제\s*해결|부탁|사과/u.test(text)) return '인물 되어 말하기';
  if (/일상|우리\s*집|가족|엄마|아빠|유치원|친구|이웃/u.test(text)) return '경험과 장면 잇기';
  if (description.length < 35) return '그림 단서 찾기';
  return '예측하고 확인하기';
}

function buildStrategyTask(book) {
  const text = `${book.title} ${book.description} ${book.features}`;
  if (book.interactionStrategy === '순서 다시 말하기') {
    if (/만들|과정|단계|완성/u.test(text)) return '질문1=처음 만드는 행동, 질문2=그다음 만드는 행동, 반응=책 속 도구·결과물을 짚어 두 단계를 연결';
    if (/여정|여행|모험|도전|떠나|바깥세상/u.test(text)) return '질문1=출발한 곳, 질문2=다음에 간 곳, 반응=책 속 이동 대상을 짚어 이동 경로를 따라가기';
    if (/준비|생일|파티/u.test(text)) return '질문1=처음 준비한 것, 질문2=다음에 더해진 것, 반응=준비물이 늘어나는 두 장면 비교';
    if (/여러\s*사건|에피소드/u.test(text)) return '질문1=한 사건의 시작, 질문2=바로 뒤 행동, 반응=해당 사건의 두 페이지만 다시 찾아 연결';
  }
  return STRATEGY_TASKS[book.interactionStrategy];
}

function buildInput(books, childAgeMonths) {
  const ageContext = childAgeMonths === null
    ? '아이 나이 정보 없음: 책의 권장 연령을 기준으로 안내 수준을 정하세요.'
    : `아이 나이: ${childAgeMonths}개월. 질문의 문장 길이, 대화 수준, 놀이 안전성을 이 발달 단계에 맞추세요.`;
  const bookLines = books.map((book, index) => [
    `[책 ${index + 1}]`,
    `key: ${book.key}`,
    `제목: ${book.title}`,
    `저자: ${book.author || '정보 없음'}`,
    `출판사: ${book.publisher || '정보 없음'}`,
    `소개: ${book.description || '정보 없음'}`,
    `특징: ${book.features || '정보 없음'}`,
    `필수 상호작용 전략: ${book.interactionStrategy}`,
    `필수 질문·반응 구성: ${buildStrategyTask(book)}`,
    ...(book.qualityFeedback ? [`재작성 필수 조건: ${book.qualityFeedback}`] : [])
  ].join('\n')).join('\n\n');
  return `${ageContext}\n\n${bookLines}`;
}

const SYSTEM_PROMPT = `역할: 당신은 3~5세 유아의 문해력 발달과 상호작용적 함께 읽기를 돕는 한국어 부모 코치입니다.

목표: 입력에 지정된 필수 상호작용 전략과 질문·반응 구성을 그대로 실행하여, 그 책에서만 쓸 수 있는 부모 가이드와 연계 놀이를 만드세요. 전략을 다시 선택하거나 바꾸지 않습니다.

상호작용 전략 선택:
- 그림 단서 찾기: 그림이 풍부하거나 글이 적은 책. 아이가 발견한 위치·색·표정·변화를 함께 짚고 앞뒤 장면을 비교합니다.
- 예측하고 확인하기: 사건의 다음 행동이나 결과를 상상할 수 있는 이야기. 예상을 평가하지 않고 다음 장면과 비교합니다.
- 순서 다시 말하기: 과정·여정·누적·반복 구조가 분명한 책. 관련 페이지를 다시 찾아 처음·다음·마지막을 이어 봅니다.
- 감정과 관점 나누기: 관계·갈등·감정 변화가 중심인 책. 표정·몸짓·행동의 단서를 보며 서로 다른 해석을 받아줍니다.
- 낱말과 개념 익히기: 정보책이거나 핵심 낱말·개념이 뚜렷한 책. 그림·몸짓·생활 예로 뜻을 확인하고 새 문맥에서 다시 써 봅니다.
- 소리와 말놀이: 의성어·의태어·운율·반복구가 돋보이는 책. 소리를 따라 하고 세기·빠르기·낱말을 바꾸어 리듬을 이어 갑니다.
- 경험과 장면 잇기: 일상·가족·생활 경험과 연결하기 좋은 책. 아이가 꺼낸 실제 경험을 책의 구체적인 장면과 나란히 놓습니다.
- 인물 되어 말하기: 대화·선택·문제 해결이 중심인 이야기. 부모도 한 인물이 되어 아이와 짧게 말을 주고받습니다.
- 책 정보가 부족하면 줄거리를 추정하지 말고 '그림 단서 찾기'로 표지·제목·실제로 보이는 그림만 살핍니다.
- 각 책 입력의 '필수 상호작용 전략'과 '필수 질문·반응 구성'은 이미 책 정보에 따라 결정된 값입니다. 출력 내용은 반드시 그 값과 일치해야 합니다.

출력 기준:
- ageRange: 책 자체의 권장 연령을 "3-5세" 형식으로 추정합니다. 아이의 현재 나이와 혼동하지 않습니다.
- bookAnchor: 제목·소개에서 그대로 복사한 1~3어절의 책 고유 표현을 씁니다. 인물·사물·행동·개념 중 하나를 고르며 '책', '그림', '장면', '이야기', '인물', '소리'처럼 어느 책에나 쓰는 말은 고르지 않습니다.
- focus: 부모가 함께 살펴볼 책 속 대상·장면·표현을 20~40자의 "~을 살펴보세요" 문장으로 씁니다.
- question1, question2: 아이가 자기 말로 답할 수 있는 서로 다른 기능의 열린 질문을 각각 12~28자의 짧은 한 문장으로 씁니다. 각 질문에 '무엇·어떤·어디·누가·언제·어떻게·무슨' 중 자연스러운 의문 표현을 정확히 하나만 넣고, 쉼표로 질문을 덧붙이지 않습니다.
- 두 질문은 선택한 전략 안에서 역할을 나눕니다. 그림 단서는 발견+그림 근거, 예측은 다음 사건+현재 단서, 순서는 앞 장면+뒤 장면, 감정은 감정 이름+표정·행동 단서, 낱말은 뜻·기능+생활 속 예, 말놀이는 소리 흉내+새 소리 만들기, 경험은 책 장면+아이 경험, 인물 놀이는 인물의 말+상대 인물의 답을 묻습니다.
- response: 아이의 답 다음에 부모가 할 구체적인 행동을 35~60자의 "~해 보세요" 또는 "~해 주세요" 문장으로 씁니다. bookAnchor를 반드시 겹낫표로 감싼 『bookAnchor』 형태로 한 번 포함하고 필수 전략을 실제로 실행합니다. 『bookAnchor』에서 예상과 실제라고 쓰지 말고, 필요하면 『bookAnchor』가 나온 다음 장면에서 예상과 실제를 비교한다고 씁니다. 모든 책에 통용되는 '잠깐 기다리기', '한두 단어 덧붙이기', '말을 확장해 되돌려주기'를 쓰지 않습니다. "아이의 답을 듣고" 같은 공통 도입 대신 책에서 곧바로 할 행동으로 시작합니다.
- activities: 한국어 150~230자. 책의 핵심 내용과 직접 연결된 놀이 1개만 제안합니다. 반드시 "준비물: A, B. 방법: ① ... ② ... ③ ..." 형식으로 쓰고, 집에서 쉽게 구하는 안전한 준비물은 최대 3개, 방법은 2~3단계로 씁니다. 아이가 선택·설명·이야기 만들기를 주도하게 하며 역할놀이, 움직임, 오감 탐색 중 책에 자연스러운 방식을 사용합니다.

제약:
- 제공된 제목·저자·출판사·소개·특징만 근거로 사용하고 줄거리, 인물, 결말, 책 형식을 지어내지 마세요.
- 소개가 부족하면 특정 장면을 단정하지 말고 제목과 표지·그림을 함께 관찰하는 방식으로 안전하게 작성하세요.
- 아이를 시험하는 말, 정답 유도, 학습지식 활동, 부모의 긴 설명은 피합니다.
- "왜 그랬어?", 부모 마음 맞히기, 선악·착함을 판단시키기처럼 아이를 추궁하거나 죄책감을 줄 수 있는 질문은 쓰지 않습니다.
- 질문 안에 답이나 두 가지 선택지를 제시하지 않습니다. 아이가 자기 말로 답할 수 있게 한 질문은 한 문장으로 짧게 씁니다.
- 질문에 "혹은", "또는", "아니면", "A와 B 중"을 넣지 않고, 두 질문을 "그리고"로 이어 한 질문처럼 쓰지 않습니다.
- 질문에 쉼표를 쓰지 않습니다. "말해줄래?", "해볼래?", "맞아?", "보여?"처럼 예·아니요로 끝나는 질문과 필수 전략에서 벗어난 취향 질문은 쓰지 않습니다.
- 같은 낱말을 바로 두 번 반복하지 않습니다. 같은 전략의 다른 책이라도 필수 질문·반응 구성과 bookAnchor에 맞춰 서로 다른 행동을 씁니다.
- "해 보세요 해 보세요", "보여 주세요 보여 주세요"처럼 종결 표현을 두 번 쓰지 않습니다.
- 48개월 미만 아이에게 삼킬 수 있는 작은 물건, 가위, 불, 위험한 준비물을 제안하지 않습니다.
- "시키세요", "유도하세요", "말하게 하세요"보다 아이가 고르고 말할 여지를 주는 표현을 씁니다.
- "문해력이 향상돼요" 같은 홍보 문구보다 실제 행동을 씁니다.
- focus, question1, question2, response 값에는 "함께 볼 점", "질문", 번호, "반응" 같은 표제어를 넣지 않습니다. 따뜻하지만 추상적이지 않은 존댓말을 쓰고, 마크다운과 줄바꿈 없이 각 값을 완결된 문장으로 작성합니다.
- 테마·관심사·추천 분류는 생성하거나 참고하지 않습니다. 이 작업은 가이드와 놀이 생성만 담당합니다.
- 입력에 여러 책이 있으면 각 key를 그대로 보존하고 모든 책을 한 번씩만 출력합니다.`;

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

function sanitizeGuide(value) {
  return {
    ageRange: cleanText(value?.ageRange, 30),
    parentGuide: cleanText(value?.parentGuide, 500),
    activities: cleanText(value?.activities, 500)
  };
}

function cleanSection(value, maxLength) {
  return cleanText(value, maxLength)
    .replace(/^(?:함께\s*볼\s*점|질문|반응)\s*:\s*/u, '')
    .replace(/^[①②]\s*/u, '')
    .trim();
}

function withEnding(value, ending) {
  const text = String(value || '').replace(/[.!?。！？]+$/u, '').trim();
  return text ? `${text}${ending}` : '';
}

function sanitizeGeneratedGuide(value, interactionStrategy, book) {
  const bookAnchor = cleanText(value?.bookAnchor, 60);
  const anchorGrounded = `${book?.title || ''} ${book?.description || ''} ${book?.features || ''}`.includes(bookAnchor);
  const focus = withEnding(cleanSection(value?.focus, 160), '.');
  const question1 = withEnding(cleanSection(value?.question1, 120), '?');
  const question2 = withEnding(cleanSection(value?.question2, 120), '?');
  const response = withEnding(cleanSection(value?.response, 200), '.');
  return {
    ageRange: cleanText(value?.ageRange, 30),
    interactionStrategy,
    bookAnchor,
    parentGuide: cleanText(`함께 볼 점: ${focus} 질문: ① ${question1} ② ${question2} 반응: ${response}`, 500),
    activities: cleanText(value?.activities, 500),
    _parts: { bookAnchor, anchorGrounded, focus, question1, question2, response }
  };
}

const GENERIC_RESPONSE_PATTERNS = [
  /잠깐\s*기다/u,
  /기다린\s*(?:뒤|후)/u,
  /한두\s*단어/u,
  /말(?:을|에)?\s*확장/u,
  /덧붙여\s*(?:말|되돌)/u,
  /확장해\s*되돌/u
];

function assessGuideQuality(guide) {
  const issues = [];
  const response = guide?._parts?.response || String(guide?.parentGuide || '').match(/반응:\s*(.+)$/u)?.[1] || '';
  const questionMatch = String(guide?.parentGuide || '').match(/질문:\s*①\s*(.+?)\s*②\s*(.+?)\s*반응:/u);
  const questions = guide?._parts ? [guide._parts.question1, guide._parts.question2] : (questionMatch ? [questionMatch[1], questionMatch[2]] : []);
  const focus = guide?._parts?.focus || String(guide?.parentGuide || '').match(/^함께 볼 점:\s*(.+?)\s*질문:/u)?.[1] || '';
  const bookAnchor = guide?._parts?.bookAnchor || guide?.bookAnchor || '';
  if (!guide?.ageRange) issues.push('missing_age_range');
  if (!guide?.parentGuide) issues.push('missing_parent_guide');
  if (!guide?.activities) issues.push('missing_activities');
  if (guide?.interactionStrategy && !INTERACTION_STRATEGIES.includes(guide.interactionStrategy)) issues.push('invalid_strategy');
  if (GENERIC_RESPONSE_PATTERNS.some(pattern => pattern.test(response))) issues.push('generic_response');
  if (/^(?:아이의\s*(?:답|응답)을\s*(?:듣고|들은\s*뒤)|아이가\s*말하면)/u.test(response)) issues.push('generic_response_opening');
  if (/[가-힣]+하게\s*하|시키|유도/u.test(response)) issues.push('directive_response');
  if (questions.some(question => /혹은|또는|아니면|\S+와\s+\S+\s*중/u.test(question))) issues.push('question_contains_choices');
  if (questions.some(question => (question.match(/\?/gu) || []).length > 1)) issues.push('multiple_questions_in_one');
  if (questions.some(question => (question.match(/무엇|어떻게|어떤|어디|누가|언제|무슨|뭐|왜|어느|몇/gu) || []).length !== 1)) issues.push('question_not_open');
  if (questions.some(question => /[,，]|말해\s*줄래|볼래/u.test(question))) issues.push('question_not_atomic');
  if (questions.some(question => question.length > 45)) issues.push('question_too_long');
  if (focus && !/세요\.$/u.test(focus)) issues.push('focus_not_actionable');
  if (response && !/(?:세요|주세요)\.$/u.test(response)) issues.push('response_not_actionable');
  if ('bookAnchor' in (guide || {}) && (!bookAnchor || /^(?:책|그림|장면|이야기|인물|소리)$/u.test(bookAnchor))) issues.push('invalid_book_anchor');
  if (guide?._parts && !guide._parts.anchorGrounded) issues.push('ungrounded_book_anchor');
  if (bookAnchor && !response.includes(bookAnchor)) issues.push('response_missing_book_anchor');
  if (bookAnchor && !response.includes(`『${bookAnchor}』`)) issues.push('unquoted_book_anchor');
  if (/』에서\s+(?:네\s+|아이의\s+)?(?:예상|예측)|』에서\s+예상한/u.test(response)) issues.push('awkward_book_anchor_grammar');
  if (/해\s*보세요(?:[.!]?\s*)해\s*보세요|보여\s*주세요(?:[.!]?\s*)보여\s*주세요/u.test(response)) issues.push('duplicated_response_ending');
  if (/(장면|소리|그림|단서|순서|마음)\s+\1/u.test(`${focus} ${questions.join(' ')} ${response}`)) issues.push('repeated_word');
  if (guide?.parentGuide && !/^함께 볼 점: .+ 질문: ① .+ ② .+ 반응: .+$/u.test(guide.parentGuide)) issues.push('invalid_parent_guide_format');
  if (guide?.parentGuide?.length > 260) issues.push('parent_guide_too_long');
  if (guide?.activities && !/^준비물: .+\. 방법: ① .+/u.test(guide.activities)) issues.push('invalid_activity_format');
  return issues;
}

function isUsableGuide(guide) {
  return assessGuideQuality(guide).length === 0;
}

async function generateBookGuides(inputBooks, options = {}) {
  const books = (Array.isArray(inputBooks) ? inputBooks : []).map(normalizeBook).filter(book => book.title);
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      input: [
        { role: 'developer', content: SYSTEM_PROMPT },
        { role: 'user', content: buildInput(books, childAgeMonths) }
      ],
      text: { format: { type: 'json_schema', name: 'early_literacy_book_guides', strict: true, schema }, verbosity: 'low' },
      reasoning: { effort: 'low' },
      max_output_tokens: Math.min(10000, Math.max(1200, books.length * 750))
    })
  });

  if (!response.ok) {
    const detail = cleanText(await response.text(), 300);
    throw new Error(`OpenAI guide generation failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  const text = extractResponseText(await response.json());
  if (!text) throw new Error('OpenAI guide generation returned empty output');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if ((options._formatRetryCount || 0) < 1) {
      return generateBookGuides(inputBooks, { ...options, _formatRetryCount: (options._formatRetryCount || 0) + 1 });
    }
    throw new Error('OpenAI guide generation returned invalid JSON');
  }
  const generatedByKey = new Map((parsed.guides || []).map(item => [cleanText(item.key, 80), item]));
  const candidates = books.map(book => {
    const rawGuide = generatedByKey.get(book.key);
    const guide = rawGuide ? sanitizeGeneratedGuide(rawGuide, book.interactionStrategy, book) : { ...EMPTY_GUIDE };
    const qualityIssues = assessGuideQuality(guide);
    const { _parts, ...value } = guide;
    return { key: book.key, ...value, qualityIssues };
  });

  const retryCount = options._validationRetryCount || 0;
  const maxValidationRetries = options.maxValidationRetries === undefined ? 1 : options.maxValidationRetries;
  const invalidKeys = new Set(candidates.filter(guide => guide.qualityIssues.length).map(guide => guide.key));
  if (invalidKeys.size && retryCount < maxValidationRetries) {
    const retryBooks = books.filter(book => invalidKeys.has(book.key)).map(book => {
      const candidate = candidates.find(guide => guide.key === book.key);
      return {
        ...book,
        qualityFeedback: candidate.qualityIssues.map(issue => QUALITY_FEEDBACK[issue] || issue).join('; ')
      };
    });
    const retried = await generateBookGuides(retryBooks, {
      ...options,
      _formatRetryCount: 0,
      _validationRetryCount: retryCount + 1
    });
    const retriedByKey = new Map(retried.map(guide => [guide.key, guide]));
    for (let index = 0; index < candidates.length; index += 1) {
      const replacement = retriedByKey.get(candidates[index].key);
      if (replacement?.parentGuide) candidates[index] = replacement;
    }
  }

  return candidates.map(guide => {
    const qualityIssues = guide.qualityIssues || [];
    if (qualityIssues.length && !options.includeDiagnostics) return { key: guide.key, ...EMPTY_GUIDE };
    const { qualityIssues: omitted, ...value } = guide;
    return { ...value, ...(options.includeDiagnostics ? { qualityIssues } : {}) };
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
  INTERACTION_STRATEGIES,
  SYSTEM_PROMPT,
  assessGuideQuality,
  generateBookGuide,
  generateBookGuides,
  sanitizeGuide,
  selectInteractionStrategy
};
