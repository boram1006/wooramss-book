const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFallbackRecommendationReason,
  cleanGeneratedRecommendationReason
} = require('../lib/recommendation-reason');

test('AI 추천 이유가 실패해도 책 고유 내용과 읽기 근거를 담은 두 문장을 만든다', () => {
  const reason = buildFallbackRecommendationReason({
    title: '노란 우산',
    description: '비 오는 날 형형색색 우산들이 모여 아름다운 풍경을 만드는 글 없는 그림책입니다.',
    ruleReasons: ['자연·계절 주제 책을 최근 1번 끝까지 읽었어요'],
    themes: ['자연·계절'],
    recType: 'safe',
    hasPersonalEvidence: true
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
  assert.match(reason, /평소와 다른 관심/);
  assert.ok((reason.match(/\./g) || []).length >= 2);
});

test('개인화 근거가 약하면 읽기 기록을 억지로 연결하지 않는다', () => {
  const reason = buildFallbackRecommendationReason({
    title: '명화의 탄생',
    description: '정말 멋진 그림을 보면 코가 빛나는 평론가 루돌프가 새로운 작품을 만나는 이야기다.',
    ruleReasons: ['친구 주제 책을 최근 2번 끝까지 읽었어요'],
    themes: ['예술·창작'],
    recType: 'explore',
    hasPersonalEvidence: false
  });

  assert.doesNotMatch(reason, /최근 2번|친구 주제/);
  assert.match(reason, /명화의 탄생/);
  assert.match(reason, /평론가 루돌프/);
});

test('판매 문구만 있는 책 소개는 추천 이유에 붙이지 않는다', () => {
  const reason = buildFallbackRecommendationReason({
    title: '사랑해 사랑해 일 년 365일',
    description: '아마존닷컴 베스트셀러 1위에 시리즈 합계 450만부 판매를 돌파한 책이다.',
    ruleReasons: [],
    themes: ['공감·위로'],
    recType: 'safe'
  });

  assert.doesNotMatch(reason, /베스트셀러|450만부|판매/);
  assert.match(reason, /표지와 장면/);
});

test('책 제목의 받침에 맞는 목적격 조사를 사용하고 권수 소개는 버린다', () => {
  const reason = buildFallbackRecommendationReason({
    title: '기사가 된 린다',
    description: '린다의 신기한 여행 9권.',
    ruleReasons: [],
    themes: ['모험·탐험'],
    recType: 'explore'
  });

  assert.match(reason, /『기사가 된 린다』를/);
  assert.doesNotMatch(reason, /9권/);
});

test('구조화 응답 text 앞에 모델이 반복한 key 번호를 제거한다', () => {
  assert.equal(
    cleanGeneratedRecommendationReason('3: 자연의 재료가 떡이 되는 과정을 따라가요.', '3'),
    '자연의 재료가 떡이 되는 과정을 따라가요.'
  );
});
