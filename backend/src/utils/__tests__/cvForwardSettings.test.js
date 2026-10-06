const {
  DEFAULT_CV_FORWARD_SETTINGS,
  DEFAULT_SUBJECT_PREFIX,
  normalizeCvForwardSettings,
  validateCvForwardSettings,
  prepareCvForwardSettingsForSave,
  isCvForwardEnabled,
} = require('../cvForwardSettings');

const USER_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

describe('cvForwardSettings', () => {
  it('returns defaults for null/undefined input', () => {
    expect(normalizeCvForwardSettings(null)).toEqual({
      enabled: false,
      recipients: [],
      subjectPrefixTemplate: DEFAULT_SUBJECT_PREFIX,
    });
    expect(normalizeCvForwardSettings(undefined)).toEqual({
      enabled: false,
      recipients: [],
      subjectPrefixTemplate: DEFAULT_SUBJECT_PREFIX,
    });
  });

  it('normalizes user and external recipients and dedupes by email', () => {
    const out = normalizeCvForwardSettings({
      enabled: true,
      recipients: [
        { type: 'user', userId: USER_ID, email: 'Recruiter@Example.com', name: 'Recruiter' },
        { type: 'external', email: 'hr@client.com' },
        { type: 'external', email: 'HR@CLIENT.COM' },
        { type: 'invalid', email: 'nope' },
      ],
      subjectPrefixTemplate: '  {{מקור_גיוס}} - test  ',
    });

    expect(out.enabled).toBe(true);
    expect(out.subjectPrefixTemplate).toBe('{{מקור_גיוס}} - test');
    expect(out.recipients).toHaveLength(2);
    expect(out.recipients[0]).toEqual({
      type: 'user',
      userId: USER_ID,
      email: 'recruiter@example.com',
      name: 'Recruiter',
    });
    expect(out.recipients[1]).toEqual({
      type: 'external',
      email: 'hr@client.com',
    });
  });

  it('allows empty subject prefix template', () => {
    const out = normalizeCvForwardSettings({
      enabled: false,
      recipients: [],
      subjectPrefixTemplate: '',
    });
    expect(out.subjectPrefixTemplate).toBe('');
  });

  it('rejects non-object cvForwardSettings', () => {
    expect(() => normalizeCvForwardSettings([])).toThrow('cvForwardSettings must be an object');
    expect(() => normalizeCvForwardSettings('bad')).toThrow('cvForwardSettings must be an object');
  });

  it('rejects non-array recipients', () => {
    expect(() =>
      normalizeCvForwardSettings({
        enabled: false,
        recipients: 'bad',
      }),
    ).toThrow('cvForwardSettings.recipients must be an array');
  });

  it('requires at least one recipient when enabled', () => {
    expect(() =>
      validateCvForwardSettings({
        enabled: true,
        recipients: [],
      }),
    ).toThrow('At least one recipient is required when CV forwarding is enabled');
  });

  it('allows disabled settings with no recipients', () => {
    const out = validateCvForwardSettings({
      enabled: false,
      recipients: [],
      subjectPrefixTemplate: DEFAULT_SUBJECT_PREFIX,
    });
    expect(out.enabled).toBe(false);
    expect(out.recipients).toEqual([]);
  });

  it('prepareCvForwardSettingsForSave only touches payload when field is present', () => {
    const untouched = prepareCvForwardSettingsForSave({ title: 'Job' });
    expect(untouched).toEqual({ title: 'Job' });

    const prepared = prepareCvForwardSettingsForSave({
      title: 'Job',
      cvForwardSettings: {
        enabled: true,
        recipients: [{ type: 'external', email: 'hr@client.com' }],
      },
    });
    expect(prepared.cvForwardSettings.enabled).toBe(true);
    expect(prepared.cvForwardSettings.recipients).toHaveLength(1);
  });

  it('isCvForwardEnabled reflects enabled flag and recipient count', () => {
    expect(isCvForwardEnabled(DEFAULT_CV_FORWARD_SETTINGS)).toBe(false);
    expect(
      isCvForwardEnabled({
        enabled: true,
        recipients: [{ type: 'external', email: 'hr@client.com' }],
      }),
    ).toBe(true);
    expect(isCvForwardEnabled({ enabled: true, recipients: [] })).toBe(false);
  });
});
