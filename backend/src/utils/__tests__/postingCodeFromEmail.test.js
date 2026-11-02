const {
  looksLikePhoneNumberDigits,
  extractPostingCodeFromSubject,
  collectPostingCodeCandidatesFromSubject,
  extractPostingCodeFromLargeNumberInText,
} = require('../postingCodeFromEmail');

describe('postingCodeFromEmail', () => {
  test('any number that starts with 0 is not a posting code', () => {
    expect(looksLikePhoneNumberDigits('067243543')).toBe(true);
    expect(looksLikePhoneNumberDigits('0541234567')).toBe(true);
    expect(looksLikePhoneNumberDigits('0123')).toBe(true);
    expect(looksLikePhoneNumberDigits('0')).toBe(true);
    expect(looksLikePhoneNumberDigits('538515')).toBe(false);
    expect(looksLikePhoneNumberDigits('1000058')).toBe(false);
    expect(looksLikePhoneNumberDigits('789172')).toBe(false);
  });

  test('JobMaster subject prefers trailing code over a phone in the name', () => {
    expect(extractPostingCodeFromSubject('מארק 067243543 - 538515')).toBe('538515');
    expect(collectPostingCodeCandidatesFromSubject('מארק 067243543 - 538515')).toEqual(['538515']);
  });

  test('plain JobMaster subjects still resolve', () => {
    expect(extractPostingCodeFromSubject('עדי סרור - 789172')).toBe('789172');
    expect(extractPostingCodeFromSubject('מנשה מטוקו - 1000058')).toBe('1000058');
    expect(extractPostingCodeFromSubject('חיים דסה - 1000058')).toBe('1000058');
  });

  test('AllJobs מס\' code', () => {
    expect(extractPostingCodeFromSubject("מועמדות חדשה מבראזני סביון למשרה מס' 1000049")).toBe('1000049');
  });

  test('large-number scan skips phones', () => {
    expect(extractPostingCodeFromLargeNumberInText('מארק 067243543 - 538515')).toBe('538515');
    expect(extractPostingCodeFromLargeNumberInText('call 067243543')).toBe(null);
    expect(extractPostingCodeFromSubject('מועמד 012345 - 1000058')).toBe('1000058');
  });
});
