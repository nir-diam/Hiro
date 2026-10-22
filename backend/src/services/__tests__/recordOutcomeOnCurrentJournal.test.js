const { recordOutcomeOnCurrentJournal } = require('../jobCandidateProcessJournalService');

describe('recordOutcomeOnCurrentJournal', () => {
  it('keeps the same card and moves the previous stage into its history', () => {
    const meta = recordOutcomeOnCurrentJournal({
      workflowMeta: {
        statusJournal: [
          {
            id: 'initial-jc-1',
            status: 'חדש',
            description: '',
            createdAt: '2026-10-11T09:01:16.000Z',
            creator: 'מערכת',
            dueDate: '2026-10-27',
            isActive: true,
            updates: [],
          },
        ],
      },
      prevStatus: 'חדש',
      newStatus: '02 - ממתין לראיון טלפוני',
      actor: 'ניר111',
      summary: 'עבר סינון ראשוני → 02 - ממתין לראיון טלפוני',
      dueDate: '2026-10-27',
      dueTime: null,
    });

    const card = meta.statusJournal[0];
    expect(meta.statusJournal).toHaveLength(1);
    expect(card.id).toBe('initial-jc-1');
    expect(card.status).toBe('02 - ממתין לראיון טלפוני');
    expect(card.creator).toBe('מערכת');
    expect(card.createdAt).toBe('2026-10-11T09:01:16.000Z');
    expect(card.description).toBe('');
    expect(card.updates.map((row) => row.title)).toEqual([
      'עבר סינון ראשוני → 02 - ממתין לראיון טלפוני',
      'חדש',
    ]);
    expect(card.updates[0].creator).toBe('ניר111');
    expect(card.updates[1].creator).toBe('מערכת');
  });

  it('appends a later action on the same card without duplicating the original stage', () => {
    const first = recordOutcomeOnCurrentJournal({
      workflowMeta: {
        statusJournal: [
          {
            id: 'initial-jc-1',
            status: 'חדש',
            createdAt: '2026-10-11T09:01:16.000Z',
            creator: 'מערכת',
            updates: [],
          },
        ],
      },
      prevStatus: 'חדש',
      newStatus: '02 - ממתין לראיון טלפוני',
      actor: 'ניר111',
      summary: 'עבר סינון ראשוני → 02 - ממתין לראיון טלפוני',
    });

    const second = recordOutcomeOnCurrentJournal({
      workflowMeta: first,
      prevStatus: '02 - ממתין לראיון טלפוני',
      newStatus: '02 - ממתין לראיון טלפוני',
      actor: 'ניר111',
      summary: 'לא ענה לטלפון',
    });

    const card = second.statusJournal[0];
    expect(second.statusJournal).toHaveLength(1);
    expect(card.id).toBe('initial-jc-1');
    expect(card.updates.map((row) => row.title)).toEqual([
      'לא ענה לטלפון',
      'עבר סינון ראשוני → 02 - ממתין לראיון טלפוני',
      'חדש',
    ]);
  });
});
