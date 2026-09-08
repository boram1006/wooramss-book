const { THEME_GROUPS, THEME_CATALOG } = require('../lib/theme-taxonomy');
const { loadThemeClassifications } = require('../lib/theme-classification-store');

const VALID_ACTIONS = new Set(['mapped', 'excluded', 'deferred', 'pending']);

function getSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role configuration error');
  return createClient(url, key);
}

function validateClassification(body = {}) {
  const normalizedExpression = String(body.normalizedExpression || '').trim();
  const status = String(body.action || '').trim();
  const mappedTheme = String(body.mappedTheme || '').trim();

  if (!normalizedExpression) return { error: '분류할 표현이 없습니다.' };
  if (!VALID_ACTIONS.has(status)) return { error: '지원하지 않는 처리 방식입니다.' };
  if (status === 'mapped' && !THEME_CATALOG.includes(mappedTheme)) {
    return { error: '표준 테마를 선택해주세요.' };
  }

  return {
    value: {
      normalizedExpression,
      status,
      mappedTheme: status === 'mapped' ? mappedTheme : null
    }
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = getSupabaseClient();

    if (req.method === 'GET') {
      const items = await loadThemeClassifications(supabase);
      return res.status(200).json({
        success: true,
        groups: THEME_GROUPS,
        items
      });
    }

    if (req.method === 'POST') {
      const validation = validateClassification(req.body);
      if (validation.error) return res.status(400).json({ success: false, error: validation.error });

      const { normalizedExpression, status, mappedTheme } = validation.value;
      const patch = {
        status,
        mapped_theme: mappedTheme,
        resolved_at: status === 'mapped' || status === 'excluded' ? new Date().toISOString() : null
      };
      const { data, error } = await supabase
        .from('unclassified_theme_logs')
        .update(patch)
        .eq('normalized_expression', normalizedExpression)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, item: data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    const setupRequired = error?.code === '42P01' || /unclassified_theme_logs|record_unclassified_theme/.test(error.message || '');
    return res.status(setupRequired ? 503 : 500).json({
      success: false,
      setupRequired,
      error: setupRequired ? '분류 관리 저장소를 준비하는 중입니다.' : error.message
    });
  }
};

module.exports.validateClassification = validateClassification;
