const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateBookGuide,
  generateBookGuides,
  sanitizeGuide,
  SYSTEM_PROMPT
} = require('../lib/book-guide');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

test('공통 생성기는 Responses API의 엄격한 JSON 스키마와 아이 개월 수를 사용한다', async () => {
  let requestBody;
  const guide = await generateBookGuide({
    isbn: '9781234567890',
    title: '구름 산책',
    author: '홍길동',
    description: '구름의 모양을 관찰하는 그림책'
  }, {
    apiKey: 'test-key',
    childAgeMonths: 39,
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      requestBody = JSON.parse(options.body);
      return jsonResponse({
        output_text: JSON.stringify({
          guides: [{
            key: '9781234567890',
            themes: ['구름', '관찰', '상상'],
            ageRange: '3-5세',
            parentGuide: '그림 속 구름 모양을 천천히 살펴보세요. “어떤 모양으로 보이니?” “네가 구름이라면 어디로 가고 싶어?”라고 묻고 기다린 뒤 아이의 말을 한두 단어 보태 되돌려주세요.',
            activities: '준비물: 종이, 솜, 풀. 방법: ① 아이가 닮은 모양을 골라 솜 구름을 만들어요. ② 구름이 어디로 가는지 몸으로 움직여 표현해요. ③ 아이가 만든 구름 이야기를 들려주게 해보세요.'
          }]
        })
      });
    }
  });

  assert.deepEqual(guide.themes, ['구름', '관찰', '상상']);
  assert.match(requestBody.input[1].content, /아이 나이: 39개월/);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.text.format.schema.additionalProperties, false);
});

test('여러 책은 한 번의 호출로 생성하고 입력 순서를 보존한다', async () => {
  let calls = 0;
  const guides = await generateBookGuides([
    { isbn: '111', title: '첫 책' },
    { isbn: '222', title: '둘째 책' }
  ], {
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({
        output_text: JSON.stringify({
          guides: [
            { key: '222', themes: ['둘', '친구', '놀이'], ageRange: '3-5세', parentGuide: '둘째 부모 가이드', activities: '둘째 연계 놀이' },
            { key: '111', themes: ['하나', '관찰', '이야기'], ageRange: '3-5세', parentGuide: '첫째 부모 가이드', activities: '첫째 연계 놀이' }
          ]
        })
      });
    }
  });

  assert.equal(calls, 1);
  assert.deepEqual(guides.map(guide => guide.key), ['111', '222']);
  assert.equal(guides[0].parentGuide, '첫째 부모 가이드');
});

test('API 키가 없으면 등록을 막지 않는 빈 가이드를 반환한다', async () => {
  const guide = await generateBookGuide({ title: '책' }, { apiKey: '' });
  assert.deepEqual(guide, { themes: [], ageRange: '', parentGuide: '', activities: '' });
});

test('출력 값의 중복 테마와 불필요한 공백을 정리한다', () => {
  const guide = sanitizeGuide({
    themes: [' 동물 ', '동물', ' 우정 ', '용기'],
    ageRange: ' 3-5세 ',
    parentGuide: '  함께   읽어요. ',
    activities: '  같이   놀아요. '
  });

  assert.deepEqual(guide.themes, ['동물', '우정', '용기']);
  assert.equal(guide.parentGuide, '함께 읽어요.');
  assert.equal(guide.activities, '같이 놀아요.');
});

test('테마가 중복돼도 생성된 부모 가이드와 놀이는 보존한다', async () => {
  const guide = await generateBookGuide({ isbn: '333', title: '중복 테마 책' }, {
    apiKey: 'test-key',
    fetchImpl: async () => jsonResponse({
      output_text: JSON.stringify({
        guides: [{
          key: '333',
          themes: ['우정', '우정', '용기'],
          ageRange: '3-5세',
          parentGuide: '부모 가이드',
          activities: '연계 놀이'
        }]
      })
    })
  });

  assert.deepEqual(guide.themes, ['우정', '용기']);
  assert.equal(guide.parentGuide, '부모 가이드');
  assert.equal(guide.activities, '연계 놀이');
});

test('프롬프트는 짧은 열린 질문과 안전한 놀이 형식을 강제한다', () => {
  assert.match(SYSTEM_PROMPT, /질문은 정확히 2개/);
  assert.match(SYSTEM_PROMPT, /부모 마음 맞히기/);
  assert.match(SYSTEM_PROMPT, /두 가지 선택지를 제시하지 않습니다/);
  assert.match(SYSTEM_PROMPT, /준비물: A, B\. 방법: ①/);
  assert.match(SYSTEM_PROMPT, /48개월 미만/);
});
