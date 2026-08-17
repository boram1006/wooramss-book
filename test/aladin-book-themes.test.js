const test = require('node:test');
const assert = require('node:assert/strict');
const { inferAladinThemes } = require('../lib/aladin-book-themes');

test('할머니 한 명이 등장한다고 가족으로 분류하지 않는다', () => {
  const result = inferAladinThemes({
    title: '아름다운 밤을 알려 줄게',
    description: '밤을 무서워하는 꼬마 박쥐와 홀로 긴 밤을 보내는 로즈 할머니가 서로의 친구가 된다.'
  });

  assert.ok(result.themes.includes('친구·우정'));
  assert.ok(result.themes.includes('감정 이해'));
  assert.ok(!result.themes.includes('가족'));
});

test('명화 책을 친구가 아닌 예술로 분류한다', () => {
  const result = inferAladinThemes({
    title: '명화의 탄생',
    description: '정말 멋진 그림을 보면 코가 빛나는 평론가 루돌프의 이야기다.'
  });

  assert.deepEqual(result.themes, ['예술·창작']);
});

test('엄마 한 단어는 가족 근거가 아니지만 엄마와 동생의 관계는 가족으로 본다', () => {
  const oneKinship = inferAladinThemes({
    title: '엄마, 왜 나만 뽀글머리야?',
    description: '다른 모습 때문에 고민하는 아이가 있는 그대로 자신을 사랑하는 이야기다.'
  });
  const relationship = inferAladinThemes({
    title: '엄마는 동생만 좋아해요',
    description: '아이의 생활 속 마음을 다룬다.'
  });

  assert.ok(!oneKinship.themes.includes('가족'));
  assert.ok(oneKinship.themes.includes('자존감·나다움'));
  assert.ok(relationship.themes.includes('가족'));
  assert.ok(relationship.themes.includes('형제자매'));
});

test('출판사의 산 글자 때문에 자연으로 오인하지 않는다', () => {
  const result = inferAladinThemes({
    title: '도시의 하루',
    description: '새봄출판사가 펴낸 이야기다.'
  });

  assert.ok(!result.themes.includes('자연·계절'));
});
