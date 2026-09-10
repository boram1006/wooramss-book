const DEFAULT_PROFILE = Object.freeze({
  birthDate: '',
  ageMonths: '',
  gender: '',
  booksPerDay: 2,
  emotionSensitivity: 'normal'
});

function normalizeProfile(value = {}) {
  const booksPerDay = Number.parseInt(value.booksPerDay, 10);
  const ageMonths = Number.parseInt(value.ageMonths, 10);
  const genderAliases = { 남아: 'male', 여아: 'female', 기타: 'other' };
  const sensitivityAliases = { 높음: 'high', 보통: 'normal', 낮음: 'low' };
  const gender = genderAliases[value.gender] || String(value.gender || '');
  const emotionSensitivity = sensitivityAliases[value.emotionSensitivity] || String(value.emotionSensitivity || '');
  return {
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.birthDate || '')) ? String(value.birthDate) : '',
    ageMonths: Number.isFinite(ageMonths) && ageMonths >= 0 && ageMonths <= 216 ? ageMonths : '',
    gender: ['male', 'female', 'other', ''].includes(gender) ? gender : '',
    booksPerDay: Number.isFinite(booksPerDay) ? Math.min(20, Math.max(1, booksPerDay)) : 2,
    emotionSensitivity: ['low', 'normal', 'high'].includes(emotionSensitivity) ? emotionSensitivity : 'normal'
  };
}

function normalizeInterests(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(item => String(item || '').replace(/\s+/g, ' ').trim().slice(0, 50))
    .filter(item => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

module.exports = { DEFAULT_PROFILE, normalizeProfile, normalizeInterests };
