const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProfile, normalizeInterests } = require('../api/child-settings');

test('아이 프로필 저장값을 허용 범위로 정규화한다', () => {
  assert.deepEqual(normalizeProfile({
    birthDate: '2022-03-04',
    ageMonths: '48',
    gender: 'female',
    booksPerDay: 99,
    emotionSensitivity: 'high'
  }), {
    birthDate: '2022-03-04',
    ageMonths: 48,
    gender: 'female',
    booksPerDay: 20,
    emotionSensitivity: 'high'
  });
});

test('기존 한글 설정값은 추천 엔진의 표준값으로 이관한다', () => {
  const profile = normalizeProfile({ gender: '남아', emotionSensitivity: '높음' });
  assert.equal(profile.gender, 'male');
  assert.equal(profile.emotionSensitivity, 'high');
});

test('관심사는 중복과 빈 값을 제거하고 8개까지만 저장한다', () => {
  assert.deepEqual(
    normalizeInterests(['공룡', ' 공룡 ', '', '우주', '동물', '감정', '가족', '자연', '과학', '모험']),
    ['공룡', '우주', '동물', '감정', '가족', '자연', '과학', '모험']
  );
});
