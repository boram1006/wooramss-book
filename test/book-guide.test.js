const test = require('node:test');
const assert = require('node:assert/strict');
const {
  INTERACTION_STRATEGIES,
  assessGuideQuality,
  generateBookGuide,
  generateBookGuides,
  sanitizeGuide,
  selectInteractionStrategy,
  SYSTEM_PROMPT
} = require('../lib/book-guide');

function generatedGuide(key, overrides = {}) {
  return {
    key,
    ageRange: '3-5세',
    bookAnchor: '구름',
    focus: '구름의 모양과 페이지마다 달라지는 위치를 함께 살펴보세요.',
    question1: '구름에서 어떤 모양이 보여?',
    question2: '다음 장에서는 구름이 어디로 갈까?',
    response: '아이가 짚은 구름의 모양을 함께 따라 그린 뒤 다음 장의 구름과 달라진 점을 비교해 보세요.',
    activities: '준비물: 종이, 크레용. 방법: ① 구름 모양을 골라요. ② 몸으로 움직여요. ③ 이야기를 들려줘요.',
    ...overrides
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('가이드 생성 스키마에는 추천용 테마가 들어가지 않는다', async () => {
  let requestBody;
  const guide = await generateBookGuide({ isbn: '9781', title: '구름 여행', description: '구름을 관찰하는 그림책' }, {
    apiKey: 'test-key',
    childAgeMonths: 39,
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return jsonResponse({ output_text: JSON.stringify({ guides: [generatedGuide('9781')] }) });
    }
  });

  assert.equal(guide.ageRange, '3-5세');
  assert.equal(guide.interactionStrategy, '순서 다시 말하기');
  assert.match(guide.parentGuide, /구름의 모양/);
  assert.equal('themes' in guide, false);
  assert.equal('themes' in requestBody.text.format.schema.properties.guides.items.properties, false);
  assert.equal('interactionStrategy' in requestBody.text.format.schema.properties.guides.items.properties, false);
  assert.equal('bookAnchor' in requestBody.text.format.schema.properties.guides.items.properties, true);
  assert.match(requestBody.input[1].content, /필수 상호작용 전략: 순서 다시 말하기/);
  assert.match(requestBody.input[1].content, /39개월/);
  assert.match(SYSTEM_PROMPT, /테마·관심사·추천 분류는 생성하거나 참고하지 않습니다/);
});

test('여러 책을 한 번 호출하고 입력 순서로 되돌린다', async () => {
  let calls = 0;
  const guides = await generateBookGuides([{ isbn: '111', title: '첫 책' }, { isbn: '222', title: '둘째 책' }], {
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ output_text: JSON.stringify({ guides: [
        generatedGuide('222', { bookAnchor: '둘째 책', focus: '둘째 책의 표지와 실제로 보이는 그림 요소를 차례로 살펴보세요.', response: '둘째 책의 표지에서 아이가 짚은 부분을 따라 앞뒤 그림과 비교해 보세요.' }),
        generatedGuide('111', { bookAnchor: '첫 책', focus: '첫 책의 표지와 실제로 보이는 그림 요소를 차례로 살펴보세요.', response: '첫 책의 표지에서 아이가 짚은 부분을 따라 앞뒤 그림과 비교해 보세요.' })
      ] }) });
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(guides.map(guide => guide.key), ['111', '222']);
  assert.match(guides[0].parentGuide, /첫 책/);
});

test('API 키가 없으면 비어 있는 가이드를 반환한다', async () => {
  const guide = await generateBookGuide({ title: '책' }, { apiKey: '' });
  assert.deepEqual(guide, { ageRange: '', parentGuide: '', activities: '' });
});

test('가이드 출력 공백을 정리한다', () => {
  const guide = sanitizeGuide({ ageRange: ' 3-5세 ', parentGuide: ' 함께   읽어요. ', activities: ' 같이   놀아요. ' });
  assert.deepEqual(guide, { ageRange: '3-5세', parentGuide: '함께 읽어요.', activities: '같이 놀아요.' });
});

test('프롬프트는 열린 질문과 안전한 놀이 형식을 강제한다', () => {
  assert.match(SYSTEM_PROMPT, /question1, question2/);
  assert.match(SYSTEM_PROMPT, /두 가지 선택지를 제시하지 않습니다/);
  assert.match(SYSTEM_PROMPT, /준비물: A, B\. 방법:/);
  assert.match(SYSTEM_PROMPT, /48개월 미만/);
});

test('프롬프트는 책에 맞는 전략을 고르고 공통 반응 문구를 금지한다', () => {
  assert.equal(INTERACTION_STRATEGIES.length, 8);
  assert.match(SYSTEM_PROMPT, /전략을 다시 선택하거나 바꾸지 않습니다/);
  assert.match(SYSTEM_PROMPT, /모든 책에 통용되는 '잠깐 기다리기'/);
  assert.match(SYSTEM_PROMPT, /필수 전략을 실제로 실행/);
});

test('명확한 책 단서로 상호작용 전략을 먼저 결정한다', () => {
  assert.equal(selectInteractionStrategy({ title: '손 손 손', description: '손이 어떻게 생기고 움직이고 기능하는지 놀이처럼 보여 준다.' }), '낱말과 개념 익히기');
  assert.equal(selectInteractionStrategy({ title: '그림책 만들기', description: '책 한 권을 완성하도록 시작부터 마무리까지 전 과정을 알려 준다.' }), '순서 다시 말하기');
  assert.equal(selectInteractionStrategy({ title: '사뿐사뿐 따삐르', description: '의성어와 의태어가 풍부한 정글 그림책이다.' }), '소리와 말놀이');
  assert.equal(selectInteractionStrategy({ title: '생쥐 모이의 도전', description: '가족과 살던 모이가 바깥세상으로 떠나 새로운 곳에 도전한다.' }), '순서 다시 말하기');
});

test('품질 탈락 책만 사유를 붙여 자동 재작성한다', async () => {
  let calls = 0;
  let retryInput = '';
  const guide = await generateBookGuide({ isbn: 'retry-1', title: '소리 책', description: '의성어와 말놀이가 반복되는 책이다.' }, {
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      if (calls === 1) {
        return jsonResponse({ output_text: JSON.stringify({ guides: [generatedGuide('retry-1', {
          bookAnchor: '소리 책',
          response: '소리 책의 리듬을 손뼉으로 받아 빠르기를 바꾸어 이어가 보세요.',
          question2: '소리를 크게 또는 작게 해볼래?'
        })] }) });
      }
      retryInput = body.input[1].content;
      return jsonResponse({ output_text: JSON.stringify({ guides: [generatedGuide('retry-1', {
        bookAnchor: '소리 책',
        response: '소리 책의 리듬을 손뼉으로 받아 빠르기를 바꾸어 이어가 보세요.',
        question2: '어떤 새 소리를 만들고 싶어?'
      })] }) });
    }
  });

  assert.equal(calls, 2);
  assert.match(retryInput, /재작성 필수 조건:/);
  assert.match(guide.parentGuide, /어떤 새 소리/);
});

test('공통 기다리기·말 확장 반응은 저장 가능한 결과로 인정하지 않는다', async () => {
  const guide = await generateBookGuide({ isbn: '9782', title: '반복 책' }, {
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({ output_text: JSON.stringify({ guides: [generatedGuide('9782', {
      response: '아이가 말하면 잠깐 기다렸다가 한두 단어를 덧붙여 되돌려 주세요.'
    })] }) })
  });

  assert.deepEqual(guide, { ageRange: '', parentGuide: '', activities: '' });
});

test('비저장 파일럿은 탈락한 원문과 품질 사유를 진단할 수 있다', async () => {
  const guide = await generateBookGuide({ isbn: '9783', title: '진단 책' }, {
    apiKey: 'test-key',
    includeDiagnostics: true,
    fetchImpl: async () => jsonResponse({ output_text: JSON.stringify({ guides: [generatedGuide('9783', {
      bookAnchor: '진단 책',
      response: '아이의 답을 듣고 진단 책에서 잠깐 기다렸다가 한두 단어를 덧붙여 되돌려 주세요.'
    })] }) })
  });

  assert.match(guide.parentGuide, /잠깐 기다렸다가/);
  assert.deepEqual(guide.qualityIssues, ['generic_response', 'generic_response_opening']);
});

test('품질 검사는 형식과 공통 반응 문구를 구분한다', () => {
  const valid = {
    ageRange: '3-5세',
    interactionStrategy: '예측하고 확인하기',
    parentGuide: '함께 볼 점: 문 앞에 놓인 발자국을 살펴보세요. 질문: ① 발자국은 어디로 이어져? ② 다음에는 누가 나타날까? 반응: 아이의 예상을 기억해 두었다가 다음 장에서 실제 단서와 같은 점과 다른 점을 함께 찾아보세요.',
    activities: '준비물: 종이, 크레용. 방법: ① 발자국을 그려요. ② 길을 이어요.'
  };
  assert.deepEqual(assessGuideQuality(valid), []);
  assert.deepEqual(assessGuideQuality({ ...valid, parentGuide: valid.parentGuide.replace(/아이의 예상.+$/, '잠깐 기다린 뒤 아이 말을 한두 단어 확장해 되돌려 주세요.') }), ['generic_response']);
});

test('한 질문 안의 선택지와 복수 질문을 저장 전에 차단한다', () => {
  const base = {
    ageRange: '3-5세',
    interactionStrategy: '소리와 말놀이',
    parentGuide: '함께 볼 점: 반복되는 소리를 들어보세요. 질문: ① 어떤 소리가 들려? ② 소리를 크게 혹은 작게 내볼래? 반응: 반복구를 손뼉으로 받아 같은 박자를 이어 가세요.',
    activities: '준비물: 종이, 크레용. 방법: ① 소리를 그려요. ② 박자를 만들어요.'
  };
  assert.deepEqual(assessGuideQuality(base), ['question_contains_choices', 'question_not_open', 'question_not_atomic']);
  assert.deepEqual(assessGuideQuality({ ...base, parentGuide: base.parentGuide.replace('어떤 소리가 들려?', '어떤 소리가 들려? 어디서 들려?').replace('크게 혹은 작게 내볼래?', '소리를 바꾸면 어떻게 들릴까?') }), ['multiple_questions_in_one', 'question_not_open']);
});

test('책과 무관한 공통 반응 도입과 지나치게 긴 가이드를 차단한다', () => {
  const commonOpening = {
    ageRange: '3-5세',
    interactionStrategy: '그림 단서 찾기',
    parentGuide: '함께 볼 점: 표지의 우산을 살펴보세요. 질문: ① 어떤 색이 보여? ② 다음에는 무엇이 나올까? 반응: 아이의 답을 듣고 우산의 위치와 색을 함께 찾아보세요.',
    activities: '준비물: 종이, 크레용. 방법: ① 우산을 그려요. ② 색을 골라요.'
  };
  assert.deepEqual(assessGuideQuality(commonOpening), ['generic_response_opening']);
  assert.deepEqual(assessGuideQuality({ ...commonOpening, parentGuide: `${commonOpening.parentGuide}${' 긴 문장'.repeat(40)}` }), ['generic_response_opening', 'response_not_actionable', 'parent_guide_too_long']);
});

test('책 고유어가 반응에 없거나 공통어이면 차단한다', () => {
  const base = {
    ageRange: '3-5세',
    interactionStrategy: '그림 단서 찾기',
    bookAnchor: '노란 우산',
    parentGuide: '함께 볼 점: 우산의 색과 위치를 살펴보세요. 질문: ① 어떤 우산이 보여? ② 그 우산은 어디에 있어? 반응: 앞뒤 그림에서 우산의 위치 변화를 비교해 보세요.',
    activities: '준비물: 종이, 크레용. 방법: ① 우산을 그려요. ② 색을 골라요.'
  };
  assert.deepEqual(assessGuideQuality(base), ['response_missing_book_anchor']);
  assert.deepEqual(assessGuideQuality({ ...base, bookAnchor: '그림' }), ['invalid_book_anchor']);
  assert.deepEqual(assessGuideQuality({ ...base, parentGuide: base.parentGuide.replace('앞뒤 그림에서', '노란 우산이 나온 앞뒤 그림에서') }), []);
});
