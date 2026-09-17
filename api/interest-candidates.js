const { createClient } = require('@supabase/supabase-js');
const {
  THEME_GROUPS,
  THEME_CATALOG,
  canonicalizeTheme,
  normalizeThemes,
  inferThemes
} = require('../lib/theme-taxonomy');
const {
  loadOpenThemeClassifications,
  loadOpenTaxonomyResiduals,
  loadThemeOverrides,
  recordUnclassifiedObservations,
  sanitizeThemeSuggestion,
  validateClassification,
  validateResidualAnalysis,
  validateResidualReview,
  appendBookThemes
} = require('../lib/theme-classification-store');
const { fetchAllRows } = require('../lib/supabase-pagination');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function extractResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return '';
}

async function analyzeBookDescription(book, description, overrides) {
  const fallbackThemes = inferThemes({ title: book.title, description }, 4, overrides);
  const fallback = {
    themes: fallbackThemes,
    reason: fallbackThemes.length
      ? '소개글에서 드러난 핵심 관계·갈등·경험을 표준 테마와 대조했어요.'
      : '소개글만으로는 확실한 표준 테마를 찾지 못했어요.',
    source: 'rule'
  };
  if (!OPENAI_API_KEY) return fallback;

  const schema = {
    type: 'object',
    properties: {
      themes: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: THEME_CATALOG } },
      reason: { type: 'string' }
    },
    required: ['themes', 'reason'],
    additionalProperties: false
  };
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TAXONOMY_MODEL || 'gpt-5-mini',
        input: [
          {
            role: 'developer',
            content: `어린이책 분류자로서 소개글의 핵심 주제와 이야기 경험만 분류하라. 반드시 제공된 ${THEME_CATALOG.length}개 표준 테마 안에서 1~4개를 고른다. 단순히 등장하는 동물·물건·장소는 제외하고, 관계·갈등·변화·문제해결의 중심성을 우선하라. 이유는 한국어 1~2문장으로 구체적으로 쓴다.`
          },
          { role: 'user', content: `제목: ${book.title || '(제목 없음)'}\n기존 테마: ${book.themes || '없음'}\n소개글:\n${description}` }
        ],
        reasoning: { effort: 'low' },
        max_output_tokens: 700,
        text: { format: { type: 'json_schema', name: 'book_theme_suggestion', strict: true, schema }, verbosity: 'low' }
      })
    });
    const data = await response.json();
    if (!response.ok) return fallback;
    const parsed = JSON.parse(extractResponseText(data));
    const themes = sanitizeThemeSuggestion(parsed.themes);
    if (!themes.length) return fallback;
    return { themes, reason: String(parsed.reason || '').trim(), source: 'ai' };
  } catch (error) {
    console.warn('[theme-taxonomy] description analysis fallback:', error.message);
    return fallback;
  }
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase configuration error');
  return createClient(url, key);
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
      const [result, residualBooks] = await Promise.all([
        loadOpenThemeClassifications(supabase, {
          page: req.query.page,
          pageSize: req.query.pageSize
        }),
        loadOpenTaxonomyResiduals(supabase, { includeReviewed: req.query.includeReviewed === '1' })
      ]);
      let reviewedBookThemes = {};
      if (req.query.includeReviewed === '1' && residualBooks.length) {
        const { data: residualThemeRows, error: residualThemeError } = await supabase
          .from('books')
          .select('id,themes')
          .in('id', residualBooks.map(book => book.book_id));
        if (residualThemeError) throw residualThemeError;
        reviewedBookThemes = Object.fromEntries((residualThemeRows || []).map(book => [String(book.id), book.themes]));
      }
      return res.status(200).json({
        success: true,
        groups: THEME_GROUPS,
        residualBooks: residualBooks.map(book => ({
          ...book,
          ...(req.query.includeReviewed === '1' ? { current_themes: reviewedBookThemes[String(book.book_id)] || '' } : {})
        })),
        ...result
      });
    }

    if (mode === 'classifications' && req.method === 'POST') {
      if (req.body?.scope === 'book') {
        if (req.body?.action === 'analyze') {
          const validation = validateResidualAnalysis(req.body);
          if (validation.error) return res.status(400).json({ success: false, error: validation.error });
          const { bookId, description } = validation.value;
          const [{ data: residual, error: residualError }, { data: book, error: bookError }, overrides] = await Promise.all([
            supabase.from('taxonomy_review_residuals_v2').select('book_id').eq('book_id', bookId).eq('status', 'pending').maybeSingle(),
            supabase.from('books').select('id,title,themes').eq('id', bookId).single(),
            loadThemeOverrides(supabase)
          ]);
          if (residualError) throw residualError;
          if (bookError) throw bookError;
          if (!residual) return res.status(404).json({ success: false, error: '이미 처리되었거나 찾을 수 없는 항목입니다.' });
          const analysis = await analyzeBookDescription(book, description, overrides);
          const { error: saveDescriptionError } = await supabase
            .from('books')
            .update({ description })
            .eq('id', bookId);
          if (saveDescriptionError) throw saveDescriptionError;
          return res.status(200).json({ success: true, descriptionSaved: true, ...analysis });
        }

        const validation = validateResidualReview(req.body);
        if (validation.error) return res.status(400).json({ success: false, error: validation.error });

        const { bookId, action, mappedThemes, description } = validation.value;
        const { data: residual, error: residualError } = await supabase
          .from('taxonomy_review_residuals_v2')
          .select('book_id,status')
          .eq('book_id', bookId)
          .eq('status', 'pending')
          .maybeSingle();
        if (residualError) throw residualError;
        if (!residual) return res.status(404).json({ success: false, error: '이미 처리되었거나 찾을 수 없는 항목입니다.' });

        if (action === 'resolved' || description) {
          const { data: book, error: bookError } = await supabase
            .from('books')
            .select('id,themes,description')
            .eq('id', bookId)
            .single();
          if (bookError) throw bookError;
          const updates = {};
          if (action === 'resolved') updates.themes = appendBookThemes(book.themes, mappedThemes);
          if (description) updates.description = description;
          const { error: updateBookError } = await supabase
            .from('books')
            .update(updates)
            .eq('id', bookId);
          if (updateBookError) throw updateBookError;
        }

        const { data, error } = await supabase
          .from('taxonomy_review_residuals_v2')
          .update({ status: action, resolved_at: new Date().toISOString() })
          .eq('book_id', bookId)
          .eq('status', 'pending')
          .select('*')
          .single();
        if (error) throw error;

        const { count: pendingResidualCount, error: pendingResidualError } = await supabase
          .from('taxonomy_review_residuals_v2')
          .select('book_id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (pendingResidualError) throw pendingResidualError;
        if (pendingResidualCount === 0) {
          const { error: closeDeferredError } = await supabase
            .from('unclassified_theme_logs')
            .update({ status: 'resolved_v2', resolved_at: new Date().toISOString() })
            .eq('status', 'deferred')
            .eq('resolution_scope', 'book');
          if (closeDeferredError) throw closeDeferredError;
        }

        return res.status(200).json({ success: true, item: data, mappedThemes });
      }

      const validation = validateClassification(req.body);
      if (validation.error) return res.status(400).json({ success: false, error: validation.error });

      const { normalizedExpression, status, mappedTheme, mappedThemes } = validation.value;
      const { data, error } = await supabase
        .from('unclassified_theme_logs')
        .update({
          status,
          mapped_theme: mappedTheme,
          mapped_themes: mappedThemes,
          resolution_scope: status === 'mapped' || status === 'excluded' ? 'global' : null,
          resolution_v2: status === 'mapped' || status === 'excluded'
            ? { source: 'settings-manual', disposition: status, mappedThemes }
            : null,
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
      fetchAllRows(supabase, 'books'),
      fetchAllRows(supabase, 'reading_logs'),
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
module.exports.analyzeBookDescription = analyzeBookDescription;
