const { listUnclassifiedThemes, THEME_CATALOG } = require('./theme-taxonomy');

const TABLE_NAME = 'unclassified_theme_logs';
const VALID_ACTIONS = new Set(['mapped', 'excluded', 'deferred', 'pending']);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function normalizeClassificationPagination(page, pageSize) {
  const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedPageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE)
  );
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    from: (normalizedPage - 1) * normalizedPageSize,
    to: (normalizedPage * normalizedPageSize) - 1
  };
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

async function loadOpenThemeClassifications(supabase, options = {}) {
  const pagination = normalizeClassificationPagination(options.page, options.pageSize);
  const { data, error, count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact' })
    .in('status', ['pending', 'deferred'])
    .order('occurrence_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .range(pagination.from, pagination.to);
  if (error) throw error;
  return {
    items: data || [],
    total: count || 0,
    page: pagination.page,
    pageSize: pagination.pageSize
  };
}

async function loadThemeOverrides(supabase) {
  try {
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('normalized_expression,status,mapped_theme')
        .in('status', ['mapped', 'excluded'])
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return buildThemeOverrides(rows);
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

  try {
    const { error } = await supabase.rpc('record_unclassified_themes', {
      p_items: items.map(item => ({
        raw_expression: item.raw,
        normalized_expression: item.normalized,
        source: item.source,
        record_ids: item.recordIds
      }))
    });
    if (error) throw error;
  } catch (error) {
    console.warn('[theme-taxonomy] persistent batch log failed:', error.message || error);
  }
  return items;
}

module.exports = {
  TABLE_NAME,
  buildThemeOverrides,
  collectUnclassifiedObservations,
  loadThemeClassifications,
  loadOpenThemeClassifications,
  loadThemeOverrides,
  normalizeClassificationPagination,
  recordUnclassifiedObservations,
  validateClassification
};
