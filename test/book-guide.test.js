const test = require('node:test');
const assert = require('node:assert/strict');
const { generateBookGuide, generateBookGuides, sanitizeGuide, SYSTEM_PROMPT } = require('../lib/book-guide');

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
      return jsonResponse({ output_text: JSON.stringify({ guides: [{
        key: '9781', ageRange: '3-5세', parentGuide: '함께 볼 점: 구름을 살펴보세요. 질문: ① 어떤 모양이 보여? ② 네가 구름이라면 어디로 가고 싶어? 반응: 기다린 뒤 아이 말을 되돌려주세요.', activities: '준비물: 종이, 크레용. 방법: ① 구름 모양을 골라요. ② 몸으로 움직여요. ③ 이야기를 들려줘요.'
      }] }) });
    }
  });

  assert.equal(guide.ageRange, '3-5세');
  assert.equal('themes' in guide, false);
  assert.equal('themes' in requestBody.text.format.schema.properties.guides.items.properties, false);
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
        { key: '222', ageRange: '3-5세', parentGuide: '둘째 부모 가이드', activities: '둘째 연계 놀이' },
        { key: '111', ageRange: '3-5세', parentGuide: '첫째 부모 가이드', activities: '첫째 연계 놀이' }
      ] }) });
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(guides.map(guide => guide.key), ['111', '222']);
  assert.equal(guides[0].parentGuide, '첫째 부모 가이드');
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
  assert.match(SYSTEM_PROMPT, /질문은 정확히 2개/);
  assert.match(SYSTEM_PROMPT, /두 가지 선택지를 제시하지 않습니다/);
  assert.match(SYSTEM_PROMPT, /준비물: A, B\. 방법:/);
  assert.match(SYSTEM_PROMPT, /48개월 미만/);
});
