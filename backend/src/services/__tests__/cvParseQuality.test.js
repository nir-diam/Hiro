const {
  assessCvParseQuality,
  extractContactFromInboundMessage,
  applyInboundContact,
  withCvReviewTags,
  roleTagsFromExperience,
  parsedCvScore,
  activeTagCount,
  CV_REVIEW_TAG,
  CV_PARTIAL_TAG,
} = require('../cvParseQuality');

describe('assessCvParseQuality', () => {
  it('is partial when experience exists but tags do not, and names the tag stage', () => {
    const result = assessCvParseQuality({
      fullName: 'נועה דיין',
      email: 'noa@example.com',
      phone: '0501234567',
      workExperience: [{ title: 'מנהלת גיוס', company: 'א' }],
      tagCount: 0,
      extractedTextLength: 2000,
    });
    expect(result.partial).toBe(true);
    expect(result.reasons).toContain('no_tags');
    expect(result.stage).toBe('post_parse_tags');
  });

  it('is ok when name, contact, experience and tags are present', () => {
    const result = assessCvParseQuality({
      fullName: 'נועה דיין',
      email: 'noa@example.com',
      phone: '0501234567',
      workExperience: [{ title: 'מנהלת גיוס', company: 'א' }],
      tagCount: 3,
      extractedTextLength: 2000,
    });
    expect(result.partial).toBe(false);
    expect(result.stage).toBe('ok');
  });

  it('is partial when the saved name is a single token or a portal name', () => {
    const hr = assessCvParseQuality({
      fullName: 'hr',
      email: 'hr@humand.co.il',
      workExperience: [{ title: 'פרופיל', company: 'א' }],
      tagCount: 2,
      extractedTextLength: 2000,
    });
    expect(hr.partial).toBe(true);
    expect(hr.reasons).toContain('suspicious_name');

    const portal = assessCvParseQuality({
      fullName: 'AllJobs',
      email: 'didadu5577@gmail.com',
      phone: '0501234567',
      workExperience: [{ title: 'רכז', company: 'ב' }],
      tagCount: 3,
      extractedTextLength: 2000,
    });
    expect(portal.reasons).toContain('suspicious_name');
  });

  it('points at file extraction when almost no text came out', () => {
    const result = assessCvParseQuality({
      fullName: 'נועה דיין',
      email: 'noa@example.com',
      workExperience: [],
      tagCount: 0,
      extractedTextLength: 12,
    });
    expect(result.stage).toBe('file_to_text');
  });
});

describe('extractContactFromInboundMessage', () => {
  it('takes a personal email and phone from the message body, not the portal sender', () => {
    const contact = extractContactFromInboundMessage({
      body: 'מועמד: גדעון\nטלפון: 052-1112233\nמייל: gideon@gmail.com',
      fromEmail: 'noreply@jobmaster.co.il',
    });
    expect(contact.email).toBe('gideon@gmail.com');
    expect(contact.phone).toBe('0521112233');
  });

  it('uses a personal sender when the body has no email', () => {
    const contact = extractContactFromInboundMessage({
      body: 'מצורף קו"ח',
      fromEmail: 'dana.levi@gmail.com',
    });
    expect(contact.email).toBe('dana.levi@gmail.com');
  });
});

describe('applyInboundContact', () => {
  it('fills only missing contact fields', () => {
    const filled = applyInboundContact(
      { email: 'in-cv@example.com', phone: '' },
      { email: 'other@example.com', phone: '0501234567' },
    );
    expect(filled.email).toBe('in-cv@example.com');
    expect(filled.phone).toBe('0501234567');
  });
});

describe('activeTagCount', () => {
  it('ignores pending catalog links the list does not show', () => {
    expect(activeTagCount([
      { is_active: false },
      { is_active: true },
      { isActive: false },
    ])).toBe(1);
  });
});

describe('withCvReviewTags', () => {
  it('adds the recruiter badge only while the parse is still partial', () => {
    expect(withCvReviewTags(['מקור'], { partial: true })).toEqual(['מקור', CV_PARTIAL_TAG, CV_REVIEW_TAG]);
    expect(withCvReviewTags(['מקור', CV_REVIEW_TAG], { partial: false })).toEqual(['מקור']);
  });
});

describe('roleTagsFromExperience', () => {
  it('builds a role tag from a job title when the model returned none', () => {
    const tags = roleTagsFromExperience([{ title: 'מנהלת גיוס', company: 'א', endDate: 'היום' }]);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('מנהלת גיוס');
    expect(tags[0].raw_type).toBe('role');
  });
});

describe('parsedCvScore', () => {
  it('prefers a parse that recovered experience', () => {
    const empty = parsedCvScore({ fullName: 'נועה דיין', workExperience: [], tags: [] });
    const rich = parsedCvScore({
      fullName: 'נועה דיין',
      email: 'a@b.com',
      workExperience: [{ title: 'רכזת', company: 'ב' }],
      tags: [{ name: 'גיוס' }],
    });
    expect(rich).toBeGreaterThan(empty);
  });
});
