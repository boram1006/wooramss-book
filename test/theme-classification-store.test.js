const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildThemeOverrides,
  collectUnclassifiedObservations
} = require('../lib/theme-classification-store');

test('처리된 분류 행을 연결·제외 오버라이드로 만든다', () => {
  const overrides = buildThemeOverrides([
    { normalized_expression: '로봇과기계', status: 'mapped', mapped_theme: '과학·탐구' },
    { normalized_expression: '보드북', status: 'excluded', mapped_theme: null },
    { normalized_expression: '바퀴친구', status: 'pending', mapped_theme: null }
  ]);

  assert.equal(overrides.get('로봇과기계'), '과학·탐구');
  assert.equal(overrides.has('보드북'), true);
  assert.equal(overrides.get('보드북'), null);
  assert.equal(overrides.has('바퀴친구'), false);
});

test('같은 출처의 동일 미분류 표현은 한 번만 저장 대상으로 모은다', () => {
  const items = collectUnclassifiedObservations([
    { value: '로봇과 기계', source: 'books', recordId: '1' },
    { value: '로봇과 기계', source: 'books', recordId: '2' },
    { value: '로봇과 기계', source: 'profile' }
  ], new Map());

  assert.equal(items.length, 2);
  assert.deepEqual(items.map(item => item.source), ['books', 'profile']);
  assert.deepEqual(items[0].recordIds, ['1', '2']);
});
