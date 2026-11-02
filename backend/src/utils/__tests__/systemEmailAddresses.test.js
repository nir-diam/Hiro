const {
  isSystemEmail,
  isSystemEmailHost,
  toCandidateEmail,
  splitEmail,
} = require('../systemEmailAddresses');

describe('systemEmailAddresses', () => {
  it('splits a valid address', () => {
    expect(splitEmail(' Dana.Levi@Gmail.com ')).toEqual({
      local: 'dana.levi',
      host: 'gmail.com',
      full: 'dana.levi@gmail.com',
    });
  });

  it('rejects non-addresses', () => {
    expect(splitEmail('')).toBeNull();
    expect(splitEmail('not-an-email')).toBeNull();
    expect(splitEmail('@gmail.com')).toBeNull();
    expect(splitEmail('dana@')).toBeNull();
    expect(splitEmail('dana@localhost')).toBeNull();
  });

  describe('job boards', () => {
    // The AllJobs senders that poisoned candidates: both the singular and plural host spellings.
    it.each([
      'alljobs@alljob.co.il',
      'noreply@alljobs.co.il',
      'info@alljobs.com',
      'cv@jobmaster.co.il',
      'noreply@drushim.co.il',
      'jobs@gotfriends.co.il',
      'noreply@ethosia.com',
      'jobs-noreply@linkedin.com',
      'donotreply@indeed.com',
      'notifications@glassdoor.com',
    ])('treats %s as a system address', (address) => {
      expect(isSystemEmail(address)).toBe(true);
      expect(toCandidateEmail(address)).toBeNull();
    });
  });

  describe('our own ingest inbox', () => {
    it.each([
      'humand@app.hiro.co.il',
      'humand+538515@app.hiro.co.il',
      'cv@app.humand.co.il',
      'ingest+42@app.hiro.co.il',
    ])('treats %s as a system address', (address) => {
      expect(isSystemEmail(address)).toBe(true);
    });

    it('keeps an employee applying with an apex-domain address', () => {
      const address = 'dana.levi@hiro.co.il';
      expect(isSystemEmail(address)).toBe(false);
      expect(toCandidateEmail(address)).toBe(address);
    });

    it('keeps a candidate whose name merely contains a product name', () => {
      expect(isSystemEmail('hirolevi@gmail.com')).toBe(false);
    });
  });

  describe('noreply mailboxes', () => {
    it.each([
      'noreply@somecompany.com',
      'no-reply@somecompany.com',
      'donotreply@bank.co.il',
      'mailer-daemon@example.org',
      'postmaster@example.org',
    ])('treats %s as a system address', (address) => {
      expect(isSystemEmail(address)).toBe(true);
    });
  });

  it('keeps personal addresses untouched and normalized', () => {
    expect(toCandidateEmail('  Leah.Hillel@gmail.com ')).toBe('leah.hillel@gmail.com');
  });

  it('does not treat a personal address on an unrelated domain as a portal', () => {
    expect(isSystemEmailHost('gmail.com')).toBe(false);
    expect(isSystemEmail('leah.hillel@gmail.com')).toBe(false);
  });
});
