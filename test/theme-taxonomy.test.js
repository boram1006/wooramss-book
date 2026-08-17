const test = require('node:test');
const assert = require('node:assert/strict');
const { THEME_CATALOG, canonicalizeTheme, normalizeThemes, inferThemes } = require('../lib/theme-taxonomy');

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
