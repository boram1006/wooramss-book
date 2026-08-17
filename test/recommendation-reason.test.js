const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFallbackRecommendationReason } = require('../lib/recommendation-reason');

test('AI 추천 이유가 실패해도 책 고유 내용과 읽기 근거를 담은 두 문장을 만든다', () => {
  const reason = buildFallbackRecommendationReason({
    title: '노란 우산',
    description: '비 오는 날 형형색색 우산들이 모여 아름다운 풍경을 만드는 글 없는 그림책입니다.',
    ruleReasons: ['자연·계절 주제 책을 최근 1번 끝까지 읽었어요'],
    themes: ['자연·계절'],
    recType: 'safe'
  });

  assert.match(reason, /최근 1번/);
  assert.match(reason, /노란 우산/);
  assert.match(reason, /형형색색 우산/);
  assert.ok(reason.length >= 70);
});

test('책 소개가 없어도 한 문장짜리 폴백으로 끝나지 않는다', () => {
  const reason = buildFallbackRecommendationReason({
    title: '새 책',
    description: '',
    ruleReasons: ['평소와 살짝 다른 동물 분위기의 신간이에요'],
    themes: ['동물·생명'],
    recType: 'explore'
  });

  assert.match(reason, /새 책/);
  assert.match(reason, /관심을 넓혀볼 수 있어요/);
  assert.ok((reason.match(/\./g) || []).length >= 2);
});
