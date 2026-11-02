const { resolveKanbanStageForStatus } = require('../candidateKanbanBoardService');

const stages = [
  { id: 's1', name: '01 - התקבלו קו"ח' },
  { id: 's2', name: '02 - ממתין לראיון טלפוני' },
  { id: 's4', name: '04 - תואם ראיון' },
];

describe('resolveKanbanStageForStatus', () => {
  test('matches a job-link status to the pipeline stage of the same name', () => {
    expect(resolveKanbanStageForStatus('02 - ממתין לראיון טלפוני', stages).id).toBe('s2');
    expect(resolveKanbanStageForStatus('04 - תואם ראיון', stages).id).toBe('s4');
  });

  test('places a new job link on stage 01 only when allowed', () => {
    expect(resolveKanbanStageForStatus('חדש', stages)).toBeNull();
    expect(resolveKanbanStageForStatus('חדש', stages, { allowNewAsFirst: true }).id).toBe('s1');
  });

  test('ignores statuses from a different process', () => {
    expect(resolveKanbanStageForStatus('02 - ממתין להתחברות (נשלח מייל)', stages)).toBeNull();
    expect(resolveKanbanStageForStatus('לא ענה לטלפון', stages)).toBeNull();
  });
});
