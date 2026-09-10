const { createClient } = require('@supabase/supabase-js');

const USER_KEY = 'default';
const DEFAULT_PROFILE = Object.freeze({
  birthDate: '',
  ageMonths: '',
  gender: '',
  booksPerDay: 2,
  emotionSensitivity: 'normal'
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration is missing');
  return createClient(url, key);
}

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
    emotionSensitivity: ['low', 'normal', 'high'].includes(emotionSensitivity)
      ? emotionSensitivity
      : 'normal'
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

module.exports = async (req, res) => {
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabaseClient();
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('child_settings')
        .select('child_profile,selected_interests,updated_at')
        .eq('user_key', USER_KEY)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({
        profile: normalizeProfile(data?.child_profile || DEFAULT_PROFILE),
        selectedInterests: normalizeInterests(data?.selected_interests),
        updatedAt: data?.updated_at || null
      });
    }

    const profile = normalizeProfile(req.body?.profile);
    const selectedInterests = normalizeInterests(req.body?.selectedInterests);
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('child_settings').upsert({
      user_key: USER_KEY,
      child_profile: profile,
      selected_interests: selectedInterests,
      updated_at: updatedAt
    }, { onConflict: 'user_key' });
    if (error) throw error;
    return res.status(200).json({ success: true, profile, selectedInterests, updatedAt });
  } catch (error) {
    console.error('[child-settings]', error);
    return res.status(500).json({ error: '아이 설정을 저장하지 못했습니다.' });
  }
};

module.exports.DEFAULT_PROFILE = DEFAULT_PROFILE;
module.exports.normalizeProfile = normalizeProfile;
module.exports.normalizeInterests = normalizeInterests;
