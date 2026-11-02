const { applyCompletedEventLock, isCompletedEvent } = require('../completedEventLock');

const oldRow = { id: 'u-1', title: 'שיחה', date: '2026-10-01T10:00:00.000Z', creator: 'דנה' };
const completed = {
  id: 'e1',
  status: 'הושלם',
  title: 'פגישה',
  type: ['פגישה'],
  description: 'תיאור',
  dueDate: '2026-10-01',
  isActive: true,
  updates: [oldRow],
  history: [{ user: 'דנה', timestamp: oldRow.date, summary: 'שיחה' }],
};

describe('completedEventLock', () => {
  it('passes patches through untouched for non-completed events', () => {
    const patch = { title: 'חדש', status: 'בוטל' };
    expect(applyCompletedEventLock({ ...completed, status: 'עתידי' }, patch)).toBe(patch);
  });

  it('rejects changing a locked field with 409', () => {
    for (const patch of [{ title: 'אחר' }, { status: 'עתידי' }, { dueDate: '2026-11-01' }, { type: ['שיחה'] }]) {
      expect(() => applyCompletedEventLock(completed, patch)).toThrow(
        expect.objectContaining({ status: 409 }),
      );
    }
  });

  it('allows resending unchanged values and toggling isActive', () => {
    expect(() =>
      applyCompletedEventLock(completed, { title: 'פגישה', status: 'הושלם', isActive: false }),
    ).not.toThrow();
  });

  it('appends new update rows and keeps stored rows as they were', () => {
    const newRow = { id: 'u-2', title: 'הערה', date: '2026-10-20T10:00:00.000Z', creator: 'דנה' };
    const out = applyCompletedEventLock(completed, {
      updates: [newRow, oldRow],
      history: [
        { user: 'דנה', timestamp: newRow.date, summary: 'הערה' },
        { user: 'דנה', timestamp: oldRow.date, summary: 'שיחה' },
      ],
    });
    expect(out.updates).toEqual([newRow, oldRow]);
    expect(out.history).toHaveLength(2);
    expect(out.history[1]).toBe(completed.history[0]);
  });

  it('cannot delete stored update rows', () => {
    const out = applyCompletedEventLock(completed, { updates: [], history: [] });
    expect(out.updates).toEqual([oldRow]);
    expect(out.history).toEqual(completed.history);
  });

  it('isCompletedEvent', () => {
    expect(isCompletedEvent(completed)).toBe(true);
    expect(isCompletedEvent({ status: ' הושלם ' })).toBe(true);
    expect(isCompletedEvent({ status: 'עתידי' })).toBe(false);
    expect(isCompletedEvent(null)).toBe(false);
  });
});
