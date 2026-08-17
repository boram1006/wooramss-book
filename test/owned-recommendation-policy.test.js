const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasStrongPersonalEvidence,
  isAgeEligible,
  resolveBookThemes
} = require('../lib/owned-recommendation-policy');

function book(title, description, themes = '', age = '') {
  return { fields: { '제목': title, '설명': description, '테마': themes, '연령': age } };
}

test('야구 책은 부차적인 과학 테마보다 몸·건강을 핵심으로 둔다', () => {
  const themes = resolveBookThemes(book(
    '야구쟁이',
    '야구를 처음 만난 주인공의 가슴 뛰는 하루를 담았다.',
    '과학·탐구,일상생활'
  ));
  assert.equal(themes[0], '몸·건강');
});

test('그림책 만들기는 예술·창작을 핵심으로 둔다', () => {
  const themes = resolveBookThemes(book(
    '나만의 특별한 그림책 만들기',
    '한 권의 책을 직접 완성하는 과정을 안내한다.',
    '가족,예술·창작'
  ));
  assert.equal(themes[0], '예술·창작');
});

test('완독 한 번만으로 강한 취향 근거를 만들지 않는다', () => {
  assert.equal(hasStrongPersonalEvidence(['친구·우정 테마 완독 1회']), false);
  assert.equal(hasStrongPersonalEvidence(['친구·우정 테마 완독 2회']), true);
  assert.equal(hasStrongPersonalEvidence(['친구·우정 테마 집중 1회']), true);
});

test('아이보다 권장 시작 연령이 크게 높은 책은 제외한다', () => {
  assert.equal(isAgeEligible(book('초등 책', '', '', '6-8세'), 39), false);
  assert.equal(isAgeEligible(book('유아 책', '', '', '4-6세'), 39), true);
});
