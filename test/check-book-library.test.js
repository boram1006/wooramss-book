const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/check-book-library');

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    }
  };
}

test('모든 도서관 조회를 동시에 시작하고 원래 목록 순서로 응답한다', async () => {
  const originalFetch = global.fetch;
  const pending = [];
  const calledCodes = [];

  global.fetch = url => {
    const parsed = new URL(url);
    calledCodes.push(parsed.searchParams.get('libCode'));
    return new Promise(resolve => pending.push(() => resolve({
      ok: true,
      status: 200,
      json: async () => ({ response: { result: { hasBook: 'Y', loanAvailable: 'N' } } })
    })));
  };

  try {
    const res = createResponse();
    const request = handler({ method: 'GET', query: { isbn: '978-89-1234-567-8' } }, res);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(pending.length, handler.BUCHEON_LIBRARIES.length);
    assert.deepEqual(calledCodes, handler.BUCHEON_LIBRARIES.map(lib => lib.libCode));

    pending.forEach(resolve => resolve());
    await request;

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.results.map(item => item.libCode), calledCodes);
    assert.ok(res.body.results.every(item => item.hasBook && !item.loanAvailable));
  } finally {
    global.fetch = originalFetch;
  }
});
