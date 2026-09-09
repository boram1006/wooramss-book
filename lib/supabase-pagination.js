const DEFAULT_PAGE_SIZE = 1000;

async function fetchRange(supabase, table, columns, from, to, includeCount) {
  const query = supabase
    .from(table)
    .select(columns, includeCount ? { count: 'exact' } : undefined)
    .order('id', { ascending: true });
  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(`Supabase ${table} error: ${error.message}`);
  return { rows: data || [], count };
}

async function fetchAllRows(supabase, table, options = {}) {
  const columns = options.columns || '*';
  const pageSize = Math.max(1, Number.parseInt(options.pageSize, 10) || DEFAULT_PAGE_SIZE);
  const first = await fetchRange(supabase, table, columns, 0, pageSize - 1, true);
  const total = Number.isFinite(first.count) ? first.count : null;

  if (total === null) {
    const rows = [...first.rows];
    for (let from = pageSize; first.rows.length === pageSize; from += pageSize) {
      const page = await fetchRange(supabase, table, columns, from, from + pageSize - 1, false);
      rows.push(...page.rows);
      if (page.rows.length < pageSize) break;
    }
    return rows;
  }

  const ranges = [];
  for (let from = pageSize; from < total; from += pageSize) {
    ranges.push([from, Math.min(from + pageSize - 1, total - 1)]);
  }
  const remainingPages = await Promise.all(
    ranges.map(([from, to]) => fetchRange(supabase, table, columns, from, to, false))
  );
  return [...first.rows, ...remainingPages.flatMap(page => page.rows)];
}

module.exports = { DEFAULT_PAGE_SIZE, fetchAllRows };
