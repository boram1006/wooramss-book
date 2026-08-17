const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReadingSignal,
  cleanOwnedFallbackDescription,
  hasStrongPersonalEvidence,
  hasRecommendationAuditLanguage,
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

test('마음 기차는 기차라는 소재보다 감정을 핵심으로 둔다', () => {
  const themes = resolveBookThemes(book(
    '마음 기차',
    '여러 상황에서 생기는 마음과 감정 낱말을 보여준다.',
    '탈것·도시,감정 이해'
  ));
  assert.equal(themes[0], '감정 이해');
});

test('도전이 제목의 핵심이면 부차적인 과학보다 용기·도전을 앞세운다', () => {
  const themes = resolveBookThemes(book(
    '생쥐 모이의 101번째 도전',
    '발명가가 되려다 실패를 거듭하는 모이의 이야기다.',
    '과학·탐구,동물·생명'
  ));
  assert.equal(themes[0], '용기·도전');
});

test('여행이 제목의 핵심이면 부차적인 음식보다 모험·탐험을 앞세운다', () => {
  const themes = resolveBookThemes(book(
    '아슬아슬한 여행',
    '일상의 작은 모험을 그린 그림책이다.',
    '음식·요리,과학·탐구,모험·탐험'
  ));
  assert.equal(themes[0], '모험·탐험');
});

test('보유 도서 소개 조각을 폴백에 쓸 수 있는 문장으로 정리한다', () => {
  assert.equal(
    cleanOwnedFallbackDescription('무엇보다도 재미있는 것은, 책에 구멍이 뚫려 있다는 것.'),
    '책에 구멍이 뚫려 있다는 점이 눈에 띄어요.'
  );
});

test('완독 한 번만으로 강한 취향 근거를 만들지 않는다', () => {
  assert.equal(hasStrongPersonalEvidence(['친구·우정 테마 완독 1회']), false);
  assert.equal(hasStrongPersonalEvidence(['친구·우정 테마 완독 2회']), true);
  assert.equal(hasStrongPersonalEvidence(['친구·우정 테마 집중 1회']), true);
});

test('독서 근거는 문장 대신 자연스러운 표현용 신호로 전달한다', () => {
  assert.deepEqual(
    buildReadingSignal([
      '유머·말놀이 테마 완독 3회',
      '유머·말놀이 테마 집중 4회',
      '유머·말놀이 테마 질문 많음 1회'
    ], '유머·말놀이'),
    {
      theme: '유머·말놀이',
      repeated: true,
      focused: true,
      askedQuestions: true,
      explicitInterest: false
    }
  );
});

test('완독·집중 기록을 보고하는 추천 문장을 차단한다', () => {
  assert.equal(hasRecommendationAuditLanguage('최근 유머 책을 여러 번 완독한 기록이 있어 잘 맞습니다.'), true);
  assert.equal(hasRecommendationAuditLanguage('말놀이 리듬을 즐겨 온 흐름과 자연스럽게 이어져요.'), false);
});

test('아이보다 권장 시작 연령이 크게 높은 책은 제외한다', () => {
  assert.equal(isAgeEligible(book('초등 책', '', '', '6-8세'), 39), false);
  assert.equal(isAgeEligible(book('유아 책', '', '', '4-6세'), 39), true);
});
