const test = require('node:test');
const assert = require('node:assert/strict');
const {
  THEME_CATALOG,
  canonicalizeTheme,
  listUnclassifiedThemes,
  observeUnclassifiedThemes,
  resetObservedUnclassifiedThemes,
  normalizeThemes,
  inferThemes
} = require('../lib/theme-taxonomy');

test('동의어와 세부 대상을 추천용 표준 테마로 통합한다', () => {
  assert.equal(canonicalizeTheme('가족의 사랑'), '가족');
  assert.equal(canonicalizeTheme('친구와의 우정'), '친구·우정');
  assert.equal(canonicalizeTheme('고양이'), '동물·생명');
  assert.equal(canonicalizeTheme('자연 관찰'), '자연·계절');
});

test('형식과 메타데이터 표현은 테마에서 제외한다', () => {
  assert.equal(canonicalizeTheme('번역'), null);
  assert.equal(canonicalizeTheme('그림책'), null);
  assert.equal(canonicalizeTheme('반복'), null);
});

test('자동과 직접 값이 겹쳐도 표준 테마는 한 번만 남는다', () => {
  assert.deepEqual(normalizeThemes(['친구', '우정', '친구와의 우정']), ['친구·우정']);
});

test('책 정보에서 자동 분류하되 목록 밖 값을 만들지 않는다', () => {
  const themes = inferThemes({ title: '겁쟁이 공룡의 용기', description: '친구와 숲을 탐험합니다.' }, 3);
  assert.ok(themes.includes('동물·생명'));
  assert.ok(themes.includes('용기·도전'));
  assert.ok(themes.every(theme => THEME_CATALOG.includes(theme)));
});

test('사전에 없는 원본 표현과 정규화 값을 찾아낸다', () => {
  assert.deepEqual(
    listUnclassifiedThemes(['친구', '로봇과 기계', '번역', '로봇과 기계']),
    [{ raw: '로봇과 기계', normalized: '로봇과기계' }]
  );
});

test('미분류 표현 로그는 발생 경로를 포함하고 같은 런타임에서 중복을 억제한다', () => {
  resetObservedUnclassifiedThemes();
  const messages = [];
  const logger = message => messages.push(message);

  observeUnclassifiedThemes('로봇과 기계', { source: 'test.books', recordId: 'book-1' }, logger);
  observeUnclassifiedThemes('로봇과 기계', { source: 'test.books', recordId: 'book-2' }, logger);
  observeUnclassifiedThemes('로봇과 기계', { source: 'test.profile' }, logger);

  assert.equal(messages.length, 2);
  assert.match(messages[0], /"event":"unclassified_theme"/);
  assert.match(messages[0], /"raw":"로봇과 기계"/);
  assert.match(messages[0], /"source":"test.books"/);
  resetObservedUnclassifiedThemes();
});
