const { listUnclassifiedThemes, THEME_CATALOG } = require('./theme-taxonomy');

const TABLE_NAME = 'unclassified_theme_logs';
const VALID_ACTIONS = new Set(['mapped', 'excluded', 'deferred', 'pending']);
const VALID_RESIDUAL_ACTIONS = new Set(['resolved', 'dismissed']);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_BOOK_DESCRIPTION_LENGTH = 6000;

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
    if (row.status === 'mapped') {
      const mappedThemes = Array.isArray(row.mapped_themes)
        ? row.mapped_themes.filter(theme => THEME_CATALOG.includes(theme))
        : [];
      if (mappedThemes.length > 1) overrides.set(key, mappedThemes);
      else if (mappedThemes.length === 1) overrides.set(key, mappedThemes[0]);
      else if (row.mapped_theme) overrides.set(key, row.mapped_theme);
    }
    if (row.status === 'excluded') overrides.set(key, null);
    if (row.status === 'resolved_v2' && row.resolution_scope === 'global') overrides.set(key, null);
  }
  return overrides;
}

function validateResidualReview(body = {}) {
  const bookId = String(body.bookId || '').trim();
  const action = String(body.action || '').trim();
  const description = String(body.description || '').trim();
  const mappedThemes = [...new Set((Array.isArray(body.mappedThemes) ? body.mappedThemes : [])
    .map(theme => String(theme || '').trim())
    .filter(Boolean))];

  if (!bookId) return { error: '확인할 책이 없습니다.' };
  if (!VALID_RESIDUAL_ACTIONS.has(action)) return { error: '지원하지 않는 책별 처리 방식입니다.' };
  if (description.length > MAX_BOOK_DESCRIPTION_LENGTH) return { error: `소개글은 ${MAX_BOOK_DESCRIPTION_LENGTH.toLocaleString('ko-KR')}자 이하로 입력해주세요.` };
  if (action === 'resolved' && (!mappedThemes.length || mappedThemes.some(theme => !THEME_CATALOG.includes(theme)))) {
    return { error: '이 책에 적용할 표준 테마를 하나 이상 선택해주세요.' };
  }

  return { value: { bookId, action, mappedThemes: action === 'resolved' ? mappedThemes : [], description } };
}

function validateResidualAnalysis(body = {}) {
  const bookId = String(body.bookId || '').trim();
  const description = String(body.description || '').trim();
  if (!bookId) return { error: '분석할 책이 없습니다.' };
  if (description.length < 30) return { error: '이야기의 맥락을 판단할 수 있게 소개글을 30자 이상 입력해주세요.' };
  if (description.length > MAX_BOOK_DESCRIPTION_LENGTH) return { error: `소개글은 ${MAX_BOOK_DESCRIPTION_LENGTH.toLocaleString('ko-KR')}자 이하로 입력해주세요.` };
  return { value: { bookId, description } };
}

function sanitizeThemeSuggestion(value, limit = 4) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(theme => String(theme || '').trim()))]
    .filter(theme => THEME_CATALOG.includes(theme))
    .slice(0, limit);
}

function appendBookThemes(currentThemes, additions = []) {
  const current = Array.isArray(currentThemes)
    ? currentThemes.map(theme => String(theme || '').trim()).filter(Boolean)
    : String(currentThemes || '').split(/[,|;/\n]+/).map(theme => theme.trim()).filter(Boolean);
  const next = [...new Set([...current, ...additions.filter(theme => THEME_CATALOG.includes(theme))])];
  return Array.isArray(currentThemes) ? next : next.join(',');
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
    .or('resolution_scope.is.null,resolution_scope.neq.book')
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

async function loadOpenTaxonomyResiduals(supabase) {
  const { data, error } = await supabase
    .from('taxonomy_review_residuals_v2')
    .select('*')
    .eq('status', 'pending')
    .order('title', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadThemeOverrides(supabase) {
  try {
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('normalized_expression,status,mapped_theme,mapped_themes,resolution_scope')
        .in('status', ['mapped', 'excluded', 'resolved_v2'])
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
  appendBookThemes,
  buildThemeOverrides,
  collectUnclassifiedObservations,
  loadThemeClassifications,
  loadOpenThemeClassifications,
  loadOpenTaxonomyResiduals,
  loadThemeOverrides,
  normalizeClassificationPagination,
  recordUnclassifiedObservations,
  sanitizeThemeSuggestion,
  validateClassification,
  validateResidualAnalysis,
  validateResidualReview
};
