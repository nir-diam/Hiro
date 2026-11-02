const processMemory = require('../processMemoryCache');

describe('processMemoryCache', () => {
  beforeEach(() => processMemory.clear());

  it('returns undefined for a miss and the stored value for a hit', () => {
    expect(processMemory.get('k1')).toBeUndefined();
    processMemory.set('k1', { n: 1 }, 60);
    expect(processMemory.get('k1')).toEqual({ n: 1 });
  });

  it('expires entries after ttl', () => {
    jest.useFakeTimers();
    processMemory.set('k2', 'v', 1);
    expect(processMemory.get('k2')).toBe('v');
    jest.advanceTimersByTime(1100);
    expect(processMemory.get('k2')).toBeUndefined();
    jest.useRealTimers();
  });

  it('increments version counters independently of stored values', () => {
    expect(processMemory.getCounter('ns:ver')).toBe('0');
    expect(processMemory.increment('ns:ver')).toBe(1);
    expect(processMemory.increment('ns:ver')).toBe(2);
    expect(processMemory.getCounter('ns:ver')).toBe('2');
  });
});
