const test = require('node:test');
const assert = require('node:assert/strict');
const { validateClassification } = require('../lib/theme-classification-store');

test('기존 표준 테마 연결 요청을 검증한다', () => {
  assert.deepEqual(validateClassification({
    normalizedExpression: '로봇과기계',
    action: 'mapped',
    mappedTheme: '과학·탐구'
  }), {
    value: {
      normalizedExpression: '로봇과기계',
      status: 'mapped',
      mappedTheme: '과학·탐구'
    }
  });
});

test('목록에 없는 연결 대상과 잘못된 처리 방식을 거부한다', () => {
  assert.match(validateClassification({ normalizedExpression: 'x', action: 'mapped', mappedTheme: '새테마' }).error, /표준 테마/);
  assert.match(validateClassification({ normalizedExpression: 'x', action: 'delete' }).error, /지원하지 않는/);
});
