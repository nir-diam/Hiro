const {
  applyWebsiteVerificationGate,
  quoteForPrompt,
} = require('../organizationEnrichmentService');

describe('org website verification gate', () => {
  it('keeps gershayim out of the prompt quotes', () => {
    expect(quoteForPrompt('רו"ח פלתיאל ארבוז')).toBe('רו׳ח פלתיאל ארבוז');
    expect(quoteForPrompt('בע"מ')).not.toMatch(/["']/);
  });

  it('does not null stored phone or email on an explicit mismatch', () => {
    const updates = {
      website: 'https://wrong.example',
      phone: '0500000000',
      email: 'new@example.com',
      linkedinUrl: 'https://linkedin.com/company/wrong',
      mainField: 'ראיית חשבון',
    };
    const existing = {
      website: 'https://kept.example',
      phone: '0521111111',
      email: 'kept@example.com',
    };

    applyWebsiteVerificationGate(
      updates,
      existing,
      { isMatch: false, uncertain: false, reason: 'different company' },
      'https://wrong.example',
    );

    expect(updates.website).toBeUndefined();
    expect(updates.phone).toBeUndefined();
    expect(updates.email).toBeUndefined();
    expect(updates.linkedinUrl).toBeUndefined();
    expect(updates.mainField).toBe('ראיית חשבון');
    expect(updates.dataConfidence).toBe('אין התאמה');
  });

  it('clears a stored website only when it is the rejected url', () => {
    const updates = { website: 'https://bad.example', phone: '0500000000' };
    applyWebsiteVerificationGate(
      updates,
      { website: 'https://bad.example', phone: '0521111111' },
      { isMatch: false, uncertain: false },
      'https://bad.example',
    );
    expect(updates.website).toBeNull();
    expect(updates.phone).toBeUndefined();
  });

  it('leaves the patch untouched when verification failed', () => {
    const updates = { website: 'https://maybe.example', phone: '0500000000' };
    applyWebsiteVerificationGate(
      updates,
      { phone: '0521111111' },
      { isMatch: null, uncertain: true, reason: 'gemini failed' },
      'https://maybe.example',
    );
    expect(updates.website).toBe('https://maybe.example');
    expect(updates.phone).toBe('0500000000');
    expect(updates.dataConfidence).toBeUndefined();
  });
});
