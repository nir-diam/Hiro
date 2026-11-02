jest.mock('../redisService', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
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

const redis = require('../redisService');
const processMemory = require('../processMemoryCache');
const { getOrLoad, _inflightSize } = require('../readThroughCacheService');

describe('readThroughCacheService.getOrLoad singleflight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    processMemory.clear();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
  });

  it('runs loader once when many callers miss the same key', async () => {
    let loads = 0;
    const loader = jest.fn(async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true };
    });

    const results = await Promise.all([
      getOrLoad('test:singleflight:1', loader, { ttlSeconds: 60, scope: 'test' }),
      getOrLoad('test:singleflight:1', loader, { ttlSeconds: 60, scope: 'test' }),
      getOrLoad('test:singleflight:1', loader, { ttlSeconds: 60, scope: 'test' }),
    ]);

    expect(loads).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(_inflightSize()).toBe(0);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce different keys', async () => {
    const loader = jest.fn(async (n) => ({ n }));

    await Promise.all([
      getOrLoad('test:a', () => loader(1), { ttlSeconds: 60 }),
      getOrLoad('test:b', () => loader(2), { ttlSeconds: 60 }),
    ]);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('serves a repeat load from process memory without Redis', async () => {
    const loader = jest.fn(async () => ({ ok: true }));
    await getOrLoad('test:mem:1', loader, { ttlSeconds: 60, scope: 'test' });
    redis.get.mockClear();
    const second = await getOrLoad('test:mem:1', loader, { ttlSeconds: 60, scope: 'test' });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ ok: true });
    expect(redis.get).not.toHaveBeenCalled();
  });
});
