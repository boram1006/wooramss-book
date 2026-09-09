const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchAllRows } = require('../lib/supabase-pagination');

function createSupabase(total, pageSize, starts) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from, to) => {
            starts.push(from);
            const length = Math.max(0, Math.min(to + 1, total) - from);
            await new Promise(resolve => setTimeout(resolve, from === 0 ? 0 : 5));
            return {
              data: Array.from({ length }, (_, index) => ({ id: from + index })),
              error: null,
              count: from === 0 ? total : null
            };
          }
        })
      })
    })
  };
}

test('첫 페이지의 전체 건수로 나머지 Supabase 페이지를 병렬 조회한다', async () => {
  const starts = [];
  const rows = await fetchAllRows(createSupabase(2500, 1000, starts), 'books', { pageSize: 1000 });

  assert.equal(rows.length, 2500);
  assert.deepEqual(starts, [0, 1000, 2000]);
  assert.deepEqual(rows.slice(-2).map(row => row.id), [2498, 2499]);
});
