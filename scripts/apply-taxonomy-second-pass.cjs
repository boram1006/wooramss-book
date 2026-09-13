// Applies approved second-pass subject/interest links to legacy books.themes.
// Default mode is a read-only production preflight. Pass --apply after approval.
const fs = require('node:fs');
const path = require('node:path');
const { THEME_CATALOG } = require('../lib/theme-taxonomy');

const root = path.join(__dirname, '..');
const auditDir = path.join(root, 'reports', 'taxonomy-audit');
const reportPath = path.join(auditDir, 'taxonomy-deferred-second-pass-v2.json');
const planPath = path.join(auditDir, 'taxonomy-second-pass-production-plan-v2.json');
const backupPath = path.join(auditDir, 'taxonomy-second-pass-production-backup-v2.json');
const journalPath = path.join(auditDir, 'taxonomy-second-pass-production-journal-v2.json');
const endpoint = process.env.WOORAM_API_BASE || 'https://wooramss-book.vercel.app';
const apply = process.argv.includes('--apply');

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const split = (value) => String(value || '').split(/[,|;/\n]+/).map((item) => item.trim()).filter(Boolean);
const join = (values) => values.join(',');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = null; }
      if (!response.ok) throw new Error(`${response.status} ${body?.error || text.slice(0, 200)}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 500);
    }
  }
  throw lastError;
}

async function fetchLiveBooks() {
  const books = await requestJson(`${endpoint}/api/supabase?table=BOOKS`);
  if (!Array.isArray(books)) throw new Error('BOOKS response is not an array.');
  return books;
}

async function patchThemes(bookId, themes) {
  return requestJson(`${endpoint}/api/update-book-field`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recordId: bookId, fields: { '테마': themes } }),
  });
}

function buildOperations(report, liveBooks) {
  const liveById = new Map(liveBooks.map((book) => [book.id, book]));
  return report.items.flatMap((item) => {
    const additions = ['subject', 'interest'].flatMap((axis) => item.secondPass.acceptedAdditions[axis]);
    if (!additions.length) return [];
    const live = liveById.get(item.id);
    if (!live) throw new Error(`Production book missing: ${item.id} ${item.title}`);
    for (const target of additions) {
      if (!THEME_CATALOG.includes(target)) throw new Error(`Runtime catalog missing: ${target}`);
    }
    const beforeValues = split(live.themes);
    const afterValues = [...beforeValues];
    for (const target of additions) if (!afterValues.includes(target)) afterValues.push(target);
    return [{
      bookId: item.id,
      isbn: item.isbn,
      title: item.title,
      additions,
      beforeThemes: String(live.themes || ''),
      afterThemes: join(afterValues),
      changed: join(beforeValues) !== join(afterValues),
    }];
  });
}

async function main() {
  const report = read(reportPath);
  const liveBooks = await fetchLiveBooks();
  const operations = buildOperations(report, liveBooks);
  const pending = operations.filter((operation) => operation.changed);
  const plan = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'preflight',
    taxonomyVersion: '2.0-draft.3',
    endpoint,
    summary: {
      approvedThemeLinks: operations.reduce((sum, item) => sum + item.additions.length, 0),
      booksChecked: operations.length,
      pendingWrites: pending.length,
      alreadyApplied: operations.length - pending.length,
      deletions: 0,
    },
    operations,
  };
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({ planPath, summary: plan.summary }, null, 2));
  if (!apply || !pending.length) return;

  fs.writeFileSync(backupPath, `${JSON.stringify({
    createdAt: new Date().toISOString(),
    endpoint,
    items: pending.map(({ bookId, title, beforeThemes, afterThemes }) => ({ bookId, title, beforeThemes, afterThemes })),
  }, null, 2)}\n`);
  const journal = {
    startedAt: new Date().toISOString(),
    completedAt: null,
    endpoint,
    items: pending.map(({ bookId, title }) => ({ bookId, title, status: 'pending' })),
  };
  fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

  for (let index = 0; index < pending.length; index += 1) {
    const operation = pending[index];
    await patchThemes(operation.bookId, operation.afterThemes);
    journal.items[index].status = 'applied';
    journal.items[index].appliedAt = new Date().toISOString();
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  }

  const verifiedBooks = await fetchLiveBooks();
  const verifiedById = new Map(verifiedBooks.map((book) => [book.id, book]));
  const failures = operations.filter((operation) => {
    const current = split(verifiedById.get(operation.bookId)?.themes);
    return operation.additions.some((target) => !current.includes(target));
  });
  if (failures.length) throw new Error(`Post-write verification failed: ${failures.length}`);
  journal.completedAt = new Date().toISOString();
  journal.verifiedBooks = operations.length;
  journal.verifiedLinks = operations.reduce((sum, item) => sum + item.additions.length, 0);
  fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  console.log(JSON.stringify({ appliedBooks: pending.length, verifiedBooks: operations.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
