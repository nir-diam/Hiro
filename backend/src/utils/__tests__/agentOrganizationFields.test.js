'use strict';

const {
  parseAgentOrganizationFields,
  ACTIVITY_STATUS_VALUES,
} = require('../agentOrganizationFields');

describe('parseAgentOrganizationFields', () => {
  test('accepts partial patch with null to clear registrationNumber', () => {
    const { patch } = parseAgentOrganizationFields({ registrationNumber: null, name: 'Acme' });
    expect(patch.registrationNumber).toBeNull();
    expect(patch.name).toBe('Acme');
  });

  test('validates registrationNumber as 9 digits', () => {
    expect(() => parseAgentOrganizationFields({ registrationNumber: '123' })).toThrow(/9 digits/);
    const { patch } = parseAgentOrganizationFields({ registrationNumber: '513905497' });
    expect(patch.registrationNumber).toBe('513905497');
  });

  test('rejects user-verified dataConfidence with 403', () => {
    try {
      parseAgentOrganizationFields({ dataConfidence: 'Verified by User' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.code).toBe('FORBIDDEN_DATA_CONFIDENCE');
    }
  });

  test('normalizes agent dataConfidence values', () => {
    const { patch } = parseAgentOrganizationFields({ dataConfidence: 'חסר נתונים' });
    expect(patch.dataConfidence).toBe('Missing');
  });

  test('validates activityStatus enum', () => {
    expect(() => parseAgentOrganizationFields({ activityStatus: 'merged' })).toThrow(/Invalid activityStatus/);
    const { patch } = parseAgentOrganizationFields({ activityStatus: ACTIVITY_STATUS_VALUES[0] });
    expect(patch.activityStatus).toBe('פעילה');
  });

  test('rejects read-only fields', () => {
    expect(() => parseAgentOrganizationFields({ snippet: 'x' })).toThrow(/Read-only/);
  });
});
