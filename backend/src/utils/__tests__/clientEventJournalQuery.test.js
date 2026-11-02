const {
  parseJournalListQuery,
  filterJournalMappedRows,
  sortJournalMappedRowsByDueDate,
} = require('../clientEventJournalQuery');

const row = (id, dueDate, extra = {}) => ({
  id,
  dueDate,
  date: extra.date || '2026-01-01T00:00:00.000Z',
  status: extra.status || 'עתידי',
  isActive: extra.isActive !== false,
  coordinator: extra.coordinator || 'מיטל',
  clientName: extra.clientName || 'חברה א',
  process: extra.process || 'שימור לקוחות',
  processId: extra.processId || 'retention-1',
  ...extra,
});

describe('sortJournalMappedRowsByDueDate', () => {
  const mixed = [
    row('dec', '2026-12-04', { date: '2026-10-01T00:00:00.000Z' }),
    row('nov13', '2026-11-13', { date: '2026-10-20T00:00:00.000Z' }),
    row('nov7', '2026-11-07', { date: '2026-11-01T00:00:00.000Z' }),
    row('nov25', '2026-11-25', { date: '2026-09-15T00:00:00.000Z' }),
  ];

  it('sorts the full set by due date before paging (asc)', () => {
    const sorted = sortJournalMappedRowsByDueDate([...mixed], 'asc');
    expect(sorted.map((r) => r.id)).toEqual(['nov7', 'nov13', 'nov25', 'dec']);
    expect(sorted.slice(0, 2).map((r) => r.dueDate)).toEqual(['2026-11-07', '2026-11-13']);
    expect(sorted.slice(2).map((r) => r.dueDate)).toEqual(['2026-11-25', '2026-12-04']);
  });

  it('sorts the full set by due date before paging (desc)', () => {
    const sorted = sortJournalMappedRowsByDueDate([...mixed], 'desc');
    expect(sorted.map((r) => r.id)).toEqual(['dec', 'nov25', 'nov13', 'nov7']);
  });

  it('keeps the same rows when sorting with coordinator/company filters', () => {
    const rows = [
      row('a', '2026-11-13', { coordinator: 'מיטל', clientName: 'חברה א' }),
      row('b', '2026-11-07', { coordinator: 'דנה', clientName: 'חברה א' }),
      row('c', '2026-12-01', { coordinator: 'מיטל', clientName: 'חברה ב' }),
      row('d', '2026-11-20', { coordinator: 'מיטל', clientName: 'חברה א' }),
    ];
    const query = parseJournalListQuery({
      journalFilter: '1',
      statuses: 'עתידי',
      coordinators: 'מיטל',
      companies: 'חברה א',
      sortDir: 'asc',
    });
    const filtered = filterJournalMappedRows(rows, query);
    expect(filtered.map((r) => r.id).sort()).toEqual(['a', 'd']);
    const sorted = sortJournalMappedRowsByDueDate(filtered, query.sortDir);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'd']);
    expect(sorted).toHaveLength(filtered.length);
  });
});

describe('parseJournalListQuery sortDir', () => {
  it('defaults to desc and accepts asc', () => {
    expect(parseJournalListQuery({}).sortDir).toBe('desc');
    expect(parseJournalListQuery({ sortDir: 'asc' }).sortDir).toBe('asc');
    expect(parseJournalListQuery({ dateSort: 'ASC' }).sortDir).toBe('asc');
  });
});
