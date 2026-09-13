const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'taxonomy-audit', 'taxonomy-deferred-second-pass-v2.json'), 'utf8'));
const axes = ['subject', 'interest', 'form', 'context', 'metadata'];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const links = report.items.flatMap((item) => axes.flatMap((axis) =>
  item.secondPass.acceptedAdditions[axis].map((target) => ({ bookId: item.id, axis, target }))
));

if (links.length !== 27) throw new Error(`Expected 27 approved links, found ${links.length}`);
const tuples = links.map(({ bookId, axis, target }) =>
  `  (${quote(bookId)}::uuid, ${quote(axis)}, ${quote(target)}, '2.0-draft.3', 'human-approved-second-pass')`
).join(',\n');
const keyTuples = links.map(({ bookId, axis, target }) =>
  `  (${quote(bookId)}::uuid, ${quote(axis)}, ${quote(target)})`
).join(',\n');

const migration = `-- Human-approved second-pass taxonomy links. Idempotent and additive only.\n`
  + `insert into public.book_taxonomy_v2(book_id, axis, target, taxonomy_version, approval_source) values\n`
  + `${tuples}\n`
  + `on conflict (book_id, axis, target) do nothing;\n`;
const rollback = `-- Removes only links introduced by the approved second pass.\n`
  + `delete from public.book_taxonomy_v2 b\n`
  + `using (values\n${keyTuples}\n) as approved(book_id, axis, target)\n`
  + `where b.book_id = approved.book_id\n`
  + `  and b.axis = approved.axis\n`
  + `  and b.target = approved.target\n`
  + `  and b.taxonomy_version = '2.0-draft.3'\n`
  + `  and b.approval_source = 'human-approved-second-pass';\n`;

const migrationPath = path.join(root, 'supabase', 'migrations', '20260914_apply_taxonomy_second_pass.sql');
const rollbackPath = path.join(root, 'reports', 'taxonomy-audit', 'taxonomy-second-pass-structured-rollback.sql');
fs.writeFileSync(migrationPath, migration);
fs.writeFileSync(rollbackPath, rollback);
console.log(JSON.stringify({ migrationPath, rollbackPath, links: links.length }, null, 2));
