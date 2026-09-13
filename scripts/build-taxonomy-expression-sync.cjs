const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sourceDir = process.env.TAXONOMY_SOURCE_DIR
  || 'C:/Users/HONG/Documents/Codex/2026-09-07/https-github-com-boram1006-wooramss-book/work/remote-check/reports/taxonomy-audit';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const applicationPlan = read(path.join(sourceDir, 'taxonomy-application-plan-v2.json'));
const secondPass = read(path.join(root, 'reports', 'taxonomy-audit', 'taxonomy-deferred-second-pass-v2.json'));
const rulesByExpression = new Map();

for (const lane of ['existingThemeRules', 'proposedThemeRules', 'separateAxisRules']) {
  for (const rule of applicationPlan.lanes[lane]) {
    const rules = rulesByExpression.get(rule.normalizedExpression) || [];
    const candidate = { axis: rule.axis, target: rule.target };
    if (!rules.some(item => item.axis === candidate.axis && item.target === candidate.target)) rules.push(candidate);
    rulesByExpression.set(rule.normalizedExpression, rules);
  }
}

const expressionOutcomes = new Map();
for (const item of secondPass.items) {
  for (const covered of item.secondPass.coveredExpressions) {
    const outcomes = expressionOutcomes.get(covered.expression) || [];
    outcomes.push({ bookId: item.id, outcome: 'covered', axis: covered.axis, coveredBy: covered.coveredBy });
    expressionOutcomes.set(covered.expression, outcomes);
  }
  for (const excluded of item.secondPass.excludedExpressions) {
    const outcomes = expressionOutcomes.get(excluded.expression) || [];
    outcomes.push({ bookId: item.id, outcome: 'excluded-for-book' });
    expressionOutcomes.set(excluded.expression, outcomes);
  }
  for (const expression of item.secondPass.residualExpressions) {
    const outcomes = expressionOutcomes.get(expression) || [];
    outcomes.push({ bookId: item.id, outcome: 'residual' });
    expressionOutcomes.set(expression, outcomes);
  }
}

const resolutions = [];
for (const [normalizedExpression, rules] of rulesByExpression) {
  const mappedThemes = [...new Set(rules
    .filter(rule => ['subject', 'interest'].includes(rule.axis))
    .map(rule => rule.target))];
  resolutions.push({
    normalized_expression: normalizedExpression,
    status: mappedThemes.length ? 'mapped' : 'resolved_v2',
    mapped_theme: mappedThemes[0] || null,
    mapped_themes: mappedThemes,
    resolution_scope: 'global',
    resolution_v2: {
      taxonomyVersion: '2.0-draft.3',
      disposition: mappedThemes.length ? 'global-mapped' : 'separate-axis',
      rules,
      source: 'approved-1490-review',
    },
  });
}

for (const excluded of applicationPlan.lanes.excludedExpressions) {
  resolutions.push({
    normalized_expression: excluded.normalizedExpression,
    status: 'excluded',
    mapped_theme: null,
    mapped_themes: [],
    resolution_scope: 'global',
    resolution_v2: {
      taxonomyVersion: '2.0-draft.3',
      disposition: 'excluded',
      reason: excluded.reason,
      source: 'approved-1490-review',
    },
  });
}

for (const expression of applicationPlan.lanes.bookScopedExpressions) {
  const outcomes = expressionOutcomes.get(expression.expression) || expressionOutcomes.get(expression.normalizedExpression) || [];
  if (!outcomes.length) throw new Error(`Missing second-pass outcome: ${expression.normalizedExpression}`);
  const hasResidual = outcomes.some(item => item.outcome === 'residual');
  resolutions.push({
    normalized_expression: expression.normalizedExpression,
    status: hasResidual ? 'deferred' : 'resolved_v2',
    mapped_theme: null,
    mapped_themes: [],
    resolution_scope: 'book',
    resolution_v2: {
      taxonomyVersion: '2.0-draft.3',
      disposition: hasResidual ? 'book-scoped-residual' : 'book-scoped-resolved',
      outcomes,
      source: 'approved-book-review',
    },
  });
}

const unique = new Set(resolutions.map(item => item.normalized_expression));
if (resolutions.length !== 1490 || unique.size !== 1490) {
  throw new Error(`Expected 1490 unique resolutions, got rows=${resolutions.length}, unique=${unique.size}`);
}

const residualBooks = secondPass.items
  .filter(item => item.secondPass.status === 'needs-source-enrichment')
  .map(item => ({
    book_id: item.id,
    title: item.title,
    residual_expressions: item.secondPass.residualExpressions,
    residual_additions: Object.fromEntries(Object.entries(item.secondPass.residualAdditions).filter(([, values]) => values.length)),
    reason: item.secondPass.rationale,
    taxonomy_version: '2.0-draft.3',
  }));
if (residualBooks.length !== 7) throw new Error(`Expected 7 residual books, got ${residualBooks.length}`);

const statusCounts = Object.fromEntries([...new Set(resolutions.map(item => item.status))]
  .sort()
  .map(status => [status, resolutions.filter(item => item.status === status).length]));
const manifest = {
  approvalId: 'taxonomy-expression-sync-v2-20260914',
  taxonomyVersion: '2.0-draft.3',
  resolutions,
  residualBooks,
  summary: { total: resolutions.length, statusCounts, residualBooks: residualBooks.length },
};

fs.writeFileSync(path.join(root, 'api', 'taxonomy-expression-resolutions-v2.json'), `${JSON.stringify(manifest)}\n`);
fs.writeFileSync(path.join(root, 'reports', 'taxonomy-audit', 'taxonomy-expression-sync-plan-v2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest.summary, null, 2));
