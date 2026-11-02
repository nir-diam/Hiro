const { EventEmitter } = require('events');

const mockStore = new Map();
jest.mock('../../services/redisService', () => ({
  get: jest.fn(async (k) => (mockStore.has(k) ? mockStore.get(k) : null)),
  set: jest.fn(async (k, v) => { mockStore.set(k, v); }),
  increment: jest.fn(async (k) => { mockStore.set(k, Number(mockStore.get(k) || 0) + 1); }),
}));
jest.mock('../../config/redis', () => ({
  isRedisAvailable: () => true,
  isReadThroughEnabled: () => true,
}));
jest.mock('../../utils/appCacheContext', () => ({
  recordHit: jest.fn(),
  recordMiss: jest.fn(),
  recordBypass: jest.fn(),
}));

const processMemory = require('../../services/processMemoryCache');
const {
  httpGetResponseCacheMiddleware,
  invalidateHttpGetCacheOnWrite,
} = require('../httpGetResponseCacheMiddleware');

const makeRes = () => {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = jest.fn(() => res);
  return res;
};

const get = async (url) => {
  const req = { method: 'GET', originalUrl: url, headers: { authorization: 'Bearer t1' } };
  const res = makeRes();
  let handled = false;
  await httpGetResponseCacheMiddleware(req, res, () => { handled = true; });
  return { res, servedFromCache: !handled };
};

const write = async (method, url, status = 200) => {
  const req = { method, originalUrl: url, headers: {} };
  const res = makeRes();
  invalidateHttpGetCacheOnWrite(req, res, () => {});
  res.statusCode = status;
  res.emit('finish');
  await new Promise((r) => setImmediate(r));
};

describe('httpGetResponseCache invalidation', () => {
  beforeEach(() => {
    mockStore.clear();
    processMemory.clear();
  });

  it('serves a repeat GET from cache, and misses after a successful write', async () => {
    const first = await get('/api/jobs/j1/candidates');
    expect(first.servedFromCache).toBe(false);
    first.res.json({ candidates: [{ status: 'old' }] });
    await new Promise((r) => setImmediate(r));

    expect((await get('/api/jobs/j1/candidates')).servedFromCache).toBe(true);

    await write('PATCH', '/api/jobs/j1/candidates/c1');
    expect((await get('/api/jobs/j1/candidates')).servedFromCache).toBe(false);
  });

  it('does not invalidate on failed writes or read-only POSTs', async () => {
    const first = await get('/api/reports/bi-dashboard');
    first.res.json({ ok: true });
    await new Promise((r) => setImmediate(r));

    await write('PATCH', '/api/jobs/j1', 500);
    await write('POST', '/api/candidates/match-scores/batch');
    await write('POST', '/api/candidates/search/list');

    expect((await get('/api/reports/bi-dashboard')).servedFromCache).toBe(true);
  });

  it('serves a repeat GET from process memory', async () => {
    const first = await get('/api/candidates?page=1&limit=100');
    first.res.json({ rows: [{ id: 'c1' }] });
    await new Promise((r) => setImmediate(r));

    expect((await get('/api/candidates?page=1&limit=100')).servedFromCache).toBe(true);
  });
});
