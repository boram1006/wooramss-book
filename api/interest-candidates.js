const { createClient } = require('@supabase/supabase-js');
const {
  THEME_GROUPS,
  THEME_CATALOG,
  canonicalizeTheme,
  normalizeThemes,
  inferThemes
} = require('../lib/theme-taxonomy');
const {
  loadThemeClassifications,
  loadThemeOverrides,
  recordUnclassifiedObservations,
  validateClassification
} = require('../lib/theme-classification-store');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration error');
  return createClient(url, key);
}

async function fetchAll(supabase, table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function reactionWeight(reaction) {
  const value = String(reaction || '');
  if (value.includes('😍') || value.includes('최고')) return 2;
  if (value.includes('😊') || value.includes('좋')) return 1.5;
  if (value.includes('😐') || value.includes('보통')) return 1;
  if (value.includes('싫') || value.includes('😞') || value.includes('😢')) return 0.25;
  return 0.8;
}

function calculateAutomaticInterests(books, logs, overrides) {
  const booksById = new Map(books.map(book => [String(book.id), book]));
  const scores = new Map();
  const counts = new Map();
  const now = Date.now();

  for (const log of logs) {
    const book = booksById.get(String(log.book_id));
    if (!book) continue;
    const themes = inferThemes(book, 3, overrides);
    if (!themes.length) continue;

    const dateMs = log.read_date ? new Date(log.read_date).getTime() : now;
    const daysAgo = Number.isFinite(dateMs) ? Math.max(0, (now - dateMs) / 86400000) : 60;
    if (daysAgo > 90) continue;
    const recency = 0.55 + (0.45 * Math.max(0, 1 - daysAgo / 90));
    const completed = log.completed ? 1.25 : 1;
    const focus = String(log.focus_level || '').includes('높') ? 1.2 : 1;
    const questions = String(log.question_level || '').includes('많') ? 1.15 : 1;
    const weight = reactionWeight(log.child_reaction) * recency * completed * focus * questions;

    for (const theme of themes) {
      scores.set(theme, (scores.get(theme) || 0) + weight);
      counts.set(theme, (counts.get(theme) || 0) + 1);
    }
  }

  return [...scores.entries()]
    .filter(([theme]) => THEME_CATALOG.includes(theme))
    .sort((a, b) => b[1] - a[1] || (counts.get(b[0]) || 0) - (counts.get(a[0]) || 0))
    .slice(0, 5)
    .map(([theme]) => theme);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    const supabase = getSupabaseClient();
    const mode = String(req.query.mode || '');

    if (mode === 'classifications' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        groups: THEME_GROUPS,
        items: await loadThemeClassifications(supabase)
      });
    }

    if (mode === 'classifications' && req.method === 'POST') {
      const validation = validateClassification(req.body);
      if (validation.error) return res.status(400).json({ success: false, error: validation.error });

      const { normalizedExpression, status, mappedTheme } = validation.value;
      const { data, error } = await supabase
        .from('unclassified_theme_logs')
        .update({
          status,
          mapped_theme: mappedTheme,
          resolved_at: status === 'mapped' || status === 'excluded' ? new Date().toISOString() : null
        })
        .eq('normalized_expression', normalizedExpression)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, item: data });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const [books, logs, overrides] = await Promise.all([
      fetchAll(supabase, 'books'),
      fetchAll(supabase, 'reading_logs'),
      loadThemeOverrides(supabase)
    ]);
    const autoTop = calculateAutomaticInterests(books, logs, overrides);
    const autoSet = new Set(autoTop);
    const normalizedInput = req.query.q ? canonicalizeTheme(req.query.q, overrides) : null;
    const normalizedSelected = normalizeThemes(req.query.selected, 8, overrides);

    await recordUnclassifiedObservations(supabase, [
      ...books.map(book => ({
        value: book.themes,
        source: 'supabase.books',
        recordId: book.id
      })),
      { value: req.query.q, source: 'profile.manual-interest' },
      { value: req.query.selected, source: 'profile.selected-interests' }
    ], overrides);

    return res.status(200).json({
      success: true,
      hasData: logs.length > 0,
      autoTop,
      normalizedInput,
      normalizedSelected,
      catalogVersion: 1,
      groups: THEME_GROUPS,
      candidates: THEME_CATALOG.map(label => ({
        label,
        value: label,
        source: autoSet.has(label) ? 'automatic' : 'catalog'
      }))
    });
  } catch (error) {
    const setupRequired = error?.code === '42P01' || /unclassified_theme_logs|record_unclassified_theme/.test(error.message || '');
    return res.status(setupRequired ? 503 : 500).json({
      success: false,
      setupRequired,
      error: setupRequired ? '분류 관리 저장소를 준비하는 중입니다.' : error.message
    });
  }
};

module.exports.calculateAutomaticInterests = calculateAutomaticInterests;
