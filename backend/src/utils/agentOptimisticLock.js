const { parseExpectedUpdatedAt } = require('../dtos/agentAiDecisionDto');

const assertOptimisticLock = (row, expectedUpdatedAt) => {
  const expected = parseExpectedUpdatedAt(expectedUpdatedAt);
  if (!expected) return;
  const plain = row?.get ? row.get({ plain: true }) : row;
  const current = plain?.updatedAt ? new Date(plain.updatedAt).toISOString() : null;
  if (!current || current !== expected) {
    const err = new Error('Row was modified since last read — refresh and retry');
    err.status = 409;
    err.code = 'OPTIMISTIC_LOCK';
    throw err;
  }
};

module.exports = { assertOptimisticLock };
