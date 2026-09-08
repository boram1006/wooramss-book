const { listUnclassifiedThemes } = require('./theme-taxonomy');

const TABLE_NAME = 'unclassified_theme_logs';

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
  recordUnclassifiedObservations
};
