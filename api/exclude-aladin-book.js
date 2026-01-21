// Vercel Serverless Function
// 알라딘 신간 제외 추가

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function normIsbn(x) {
  return String(x || '').replace(/[^0-9X]/gi, '').trim();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { isbn13, isbn, title, reason, userId } = req.body || {};
    const normalized = normIsbn(isbn13 || isbn);
    if (!normalized) {
      return res.status(400).json({ success: false, error: 'ISBN이 필요합니다' });
    }

    const supabase = getSupabaseClient();
    const payload = {
      user_id: String(userId || 'default'),
      isbn13: normalized,
      title: title || null,
      reason: reason || null,
    };

    const { data: existing, error: findError } = await supabase
      .from('excluded_aladin_isbns')
      .select('id')
      .eq('user_id', payload.user_id)
      .eq('isbn13', payload.isbn13)
      .maybeSingle();

    if (findError) {
      throw new Error(`Supabase find error: ${findError.message}`);
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('excluded_aladin_isbns')
        .update({ title: payload.title, reason: payload.reason })
        .eq('id', existing.id);
      if (updateError) {
        throw new Error(`Supabase update error: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await supabase
        .from('excluded_aladin_isbns')
        .insert(payload);
      if (insertError) {
        throw new Error(`Supabase insert error: ${insertError.message}`);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
