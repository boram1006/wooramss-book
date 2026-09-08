const { listUnclassifiedThemes, THEME_CATALOG } = require('./theme-taxonomy');

const TABLE_NAME = 'unclassified_theme_logs';
const VALID_ACTIONS = new Set(['mapped', 'excluded', 'deferred', 'pending']);

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

function buildThemeOverrides(rows = []) {
  const overrides = new Map();
  for (const row of rows || []) {
    const key = String(row.normalized_expression || '').trim();
    if (!key) continue;
    if (row.status === 'mapped' && row.mapped_theme) overrides.set(key, row.mapped_theme);
    if (row.status === 'excluded') overrides.set(key, null);
  }
  return overrides;
}

async function loadThemeClassifications(supabase) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadThemeOverrides(supabase) {
  try {
    return buildThemeOverrides(await loadThemeClassifications(supabase));
  } catch (error) {
    console.warn('[theme-taxonomy] classification store unavailable:', error.message);
    return new Map();
  }
}

function collectUnclassifiedObservations(observations, overrides) {
  const collected = new Map();
  for (const observation of observations || []) {
    for (const item of listUnclassifiedThemes(observation.value, overrides)) {
      const key = `${observation.source || 'unknown'}:${item.normalized}`;
      if (!collected.has(key)) {
        collected.set(key, {
          raw: item.raw,
          normalized: item.normalized,
          source: observation.source || 'unknown',
          recordIds: observation.recordId ? [String(observation.recordId)] : []
        });
      } else if (observation.recordId) {
        const existing = collected.get(key);
        const recordId = String(observation.recordId);
        if (!existing.recordIds.includes(recordId)) existing.recordIds.push(recordId);
      }
    }
  }
  return [...collected.values()];
}

async function recordUnclassifiedObservations(supabase, observations, overrides) {
  const items = collectUnclassifiedObservations(observations, overrides);
  if (!items.length) return [];

  const results = await Promise.allSettled(items.map(item => supabase.rpc('record_unclassified_theme', {
    p_raw_expression: item.raw,
    p_normalized_expression: item.normalized,
    p_source: item.source,
    p_record_ids: item.recordIds
  })));

  results.forEach((result, index) => {
    const error = result.status === 'rejected' ? result.reason : result.value?.error;
    if (error) console.warn('[theme-taxonomy] persistent log failed:', items[index].normalized, error.message || error);
  });
  return items;
}

module.exports = {
  TABLE_NAME,
  buildThemeOverrides,
  collectUnclassifiedObservations,
  loadThemeClassifications,
  loadThemeOverrides,
  recordUnclassifiedObservations,
  validateClassification
};
