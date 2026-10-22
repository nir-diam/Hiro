const { presentPublicJob } = require('../publicJobPresenter');
const { sanitizePublicPayload, collectKeys } = require('../publicJobSanitize');
const { filterPublicJobs, buildSynonymGroups, expandQuery } = require('../publicJobQuery');
const { isJobListedOnSite, withinClosedWindow, jobAppearsOnSite } = require('../publicJobVisibility');
const { buildStableSlug } = require('../publicJobSlug');
const {
  validatePublicApplication,
  parseMultipartFields,
  hitRateLimit,
  resetApplyRateLimit,
  detectCvKind,
} = require('../publicJobApplication');
const { PUBLIC_JOBS_RESPONSE_BLOCKLIST } = require('../../constants/publicJobsApi');

const agency = {
  id: 'agency-1',
  name: 'מימד אנושי',
  displayName: 'מימד אנושי',
  logoUrl: 'https://cdn.example/mimad.png',
  domain: 'humand.co.il',
  metadata: { jobHeroBrandSource: 'company', publishOnHiroBoard: true },
};

const org = {
  id: 'org-secret',
  name: 'סודי לוגיסטיקה בעמ',
  logo: 'https://cdn.example/secret-logo.png',
  website: 'https://secret.example',
  mainField: 'לוגיסטיקה',
  employeeCount: '201-1000',
  publicSlug: 'sodi-logistics',
};

const job = {
  id: 'job-1',
  title: 'מחסנאי',
  client: 'סודי לוגיסטיקה בעמ',
  clientId: 'agency-1',
  field: 'מחסן והפצה',
  role: 'מחסנאי',
  city: 'פתח תקווה',
  region: 'מרכז',
  priority: 'דחופה',
  status: 'פתוחה',
  jobType: ['משרה מלאה'],
  description: 'סודי לוגיסטיקה בעמ מגייסת מחסנאי. 3 שנות ניסיון. שעות א-ה 07:00-16:00.',
  requirements: ['רישיון ג'],
  skills: [
    { name: 'מנהל/ת חשבונות', type: 'skill', mode: 'required' },
    { name: 'מלגזה', type: 'skill', mode: 'optional' },
  ],
  salaryMin: 8000,
  salaryMax: 12000,
  openDate: '2026-10-01T00:00:00.000Z',
  validityDays: 30,
  availability: 'מיידי',
  recruiter: 'דנה כהן',
  updatedAt: '2026-10-18T00:00:00.000Z',
  jobFields: [{ category: 'לוגיסטיקה', fieldType: 'מחסן והפצה', role: 'מחסנאי' }],
};

const publication = {
  publicJobTitle: 'מחסנאי/ת למשמרות',
  publicationCode: 'PUB-9',
  heroImageUrl: 'https://cdn.example/hero.png',
  publishToGeneralBoard: true,
  screeningQuestions: [
    { id: 1, question: 'יש רישיון?', answerType: 'Yes/No', isMandatory: true, isPublished: true },
    { id: 2, question: 'ספרו על עצמכם', type: 'video', isMandatory: true, isPublished: true },
  ],
  publicBoard: { publishSalary: false, workModel: 'office' },
};

const view = (overrides = {}) => presentPublicJob({
  job: { ...job, ...overrides.job },
  publication: { ...publication, ...overrides.publication, publicBoard: { ...publication.publicBoard, ...(overrides.publicBoard || {}) } },
  agency: overrides.agency || agency,
  org: overrides.org === null ? null : (overrides.org || org),
  categoryNode: { slug: 'warehouse', label: 'מחסן והפצה', aliases: ['old-warehouse'] },
  clusterNode: { slug: 'logistics', label: 'לוגיסטיקה' },
  cityMeta: { slug: 'petah-tikva', regionSlug: 'center', regionLabel: 'מרכז', lat: 32.08, lng: 34.88 },
});

describe('public job presenter', () => {
  test('confidential employer is replaced by the agency and internal fields stay out', () => {
    const presented = view();
    const dto = sanitizePublicPayload(presented.detail);
    const blob = JSON.stringify(dto);
    expect(dto.company.confidential).toBe(true);
    expect(dto.company.displayName).toContain('לוגיסטיקה');
    expect(dto.company.publisher.name).toBe('מימד אנושי');
    expect(dto.googleForJobs.hiringOrganization.name).toBe('מימד אנושי');
    expect(blob).not.toContain('סודי לוגיסטיקה');
    expect(blob).not.toContain('secret.example');
    expect(blob).not.toContain('secret-logo');
    expect(blob).not.toContain('org-secret');
    expect(dto.salary).toBeNull();
    expect(collectKeys(dto).has('salaryMin')).toBe(false);
    for (const key of PUBLIC_JOBS_RESPONSE_BLOCKLIST) {
      expect(collectKeys(dto).has(key)).toBe(false);
    }
  });

  test('salary is returned only when the publish toggle is on', () => {
    const hidden = sanitizePublicPayload(view().dto);
    const shown = sanitizePublicPayload(view({ publicBoard: { publishSalary: true } }).dto);
    expect(hidden.salary).toBeNull();
    expect(shown.salary).toEqual({ min: 8000, max: 12000, currency: 'ILS', period: 'month' });
  });

  test('list fields and video questions are mapped', () => {
    const dto = view().detail;
    expect(dto.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(dto.postedAt).toBeUndefined();
    expect(dto.cluster.slug).toBe('logistics');
    expect(dto.category.slug).toBe('warehouse');
    expect(dto.experienceYearsMin).toBe(3);
    expect(dto.noExperience).toBe(false);
    expect(dto.seniority.value).toBe('mid');
    expect(dto.hoursDescription).toMatch(/שעות/);
    expect(dto.skills[0].label).toBe('מנהל/ת חשבונות');
    expect(dto.recruiter).toEqual({ firstName: 'דנה', imageUrl: null });
    expect(dto.apply.questions.map((q) => q.type)).toEqual(['yes_no', 'video']);
    expect(dto.apply.questions[1].required).toBe(false);
    expect(dto.validThrough).toBeTruthy();
  });

  test('a visible employer keeps name, logo and website', () => {
    const dto = view({
      agency: { ...agency, metadata: { jobHeroBrandSource: 'job_client' } },
    }).dto;
    expect(dto.company.confidential).toBe(false);
    expect(dto.company.name).toBe('סודי לוגיסטיקה בעמ');
    expect(dto.company.slug).toBe('sodi-logistics');
    expect(dto.company.website).toBe('https://secret.example');
  });
});

describe('public job query', () => {
  const rows = [
    { dto: { urgent: true }, meta: view().meta },
    {
      dto: { urgent: false },
      meta: {
        ...view().meta,
        citySlug: 'ramat-gan',
        searchText: 'מנהל ת חשבונות מחסן',
        categorySlugs: ['warehouse'],
      },
    },
  ];

  test('synonym search finds the catalog term', () => {
    const groups = buildSynonymGroups([
      { displayNameHe: 'מנהל/ת חשבונות', synonyms: ['הנהלת חשבונות'], aliases: [] },
    ]);
    expect(expandQuery('הנהלת חשבונות', groups).some((term) => term.includes('מנהל'))).toBe(true);
    const filtered = filterPublicJobs(rows, { q: 'הנהלת חשבונות', facets: '1' }, groups);
    expect(filtered.total).toBe(2);
  });

  test('city facet ignores the city filter itself', () => {
    const filtered = filterPublicJobs(rows, { city: 'petah-tikva', facets: '1' }, []);
    expect(filtered.total).toBe(1);
    expect(filtered.facets.city['ramat-gan']).toBe(1);
    expect(filtered.facets.city['petah-tikva']).toBe(1);
  });
});

describe('site scope and status', () => {
  const publicationOnHumand = {
    publishToGeneralBoard: false,
    publicBoard: { publishedSiteIds: ['humand-site'] },
  };
  const humand = { id: 'humand-site', mode: 'tenant', clientId: 'agency-1' };
  const hiro = { id: 'hiro-site', mode: 'aggregator', clientId: null };

  test('tenant site sees its job and the aggregator does not', () => {
    const args = { publication: publicationOnHumand, jobClientId: 'agency-1', agency };
    expect(isJobListedOnSite({ ...args, site: humand })).toBe(true);
    expect(isJobListedOnSite({ ...args, site: hiro })).toBe(false);
  });

  test('aggregator sees a job published to the Hiro board when the org opted in', () => {
    const publication = { publishToGeneralBoard: false, publicBoard: { publishedSiteIds: ['hiro-site'] } };
    expect(isJobListedOnSite({ publication, jobClientId: 'agency-1', site: hiro, agency })).toBe(true);
    expect(isJobListedOnSite({
      publication,
      jobClientId: 'agency-1',
      site: hiro,
      agency: { metadata: { publishOnHiroBoard: false } },
    })).toBe(false);
  });

  test('closed jobs stay readable for 30 days and then expire', () => {
    const now = new Date('2026-10-21T00:00:00.000Z').getTime();
    expect(withinClosedWindow({ updatedAt: '2026-10-20T00:00:00.000Z' }, {}, now)).toBe(true);
    expect(withinClosedWindow({ updatedAt: '2026-09-01T00:00:00.000Z' }, {}, now)).toBe(false);
    expect(jobAppearsOnSite({ status: 'פתוחה' }, agency)).toBe(true);
    expect(jobAppearsOnSite({ status: 'מוקפאת' }, agency)).toBe(false);
    expect(jobAppearsOnSite({ status: 'מוקפאת' }, { metadata: { publicJobStatusVisibility: { מוקפאת: true } } })).toBe(true);
  });

  test('slug does not change when only the salt changes for a real name', () => {
    expect(buildStableSlug('מחסן והפצה', 'a')).toBe(buildStableSlug('מחסן והפצה', 'b'));
  });
});

describe('public application validation', () => {
  const consent = { accepted: true, policyVersion: '2026-10-01', policyUrl: 'https://hiro.co.il/privacy' };

  test('422 names the field', () => {
    expect(() => validatePublicApplication({ fullName: 'א', phone: '123', consent })).toThrow(expect.objectContaining({
      status: 422,
      field: 'phone',
    }));
    expect(() => validatePublicApplication({ fullName: 'דנה כהן', phone: '0501234567' })).toThrow(expect.objectContaining({
      field: 'consent',
    }));
  });

  test('accepts an Israeli phone and a real PDF', () => {
    const pdf = Buffer.from('%PDF-1.4 hello').toString('base64');
    const parsed = validatePublicApplication({
      fullName: 'דנה כהן',
      phone: '+972501234567',
      consent,
      cv: { contentBase64: pdf, filename: 'cv.pdf' },
    });
    expect(parsed.phone).toBe('0501234567');
    expect(parsed.cv.mimeType).toBe('application/pdf');
    expect(detectCvKind(Buffer.from('hello'))).toBeNull();
  });

  test('reads a multipart application with the cv file bytes', () => {
    const boundary = '----HiroBoundary';
    const pdf = Buffer.from('%PDF-1.4 hello');
    const consentJson = JSON.stringify(consent);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="fullName"\r\n\r\nדנה כהן\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="phone"\r\n\r\n0501234567\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="consent"\r\n\r\n${consentJson}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="cv"; filename="cv.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const raw = Buffer.concat([head, pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const fields = parseMultipartFields(raw, boundary);
    const parsed = validatePublicApplication(fields);
    expect(parsed.fullName).toBe('דנה כהן');
    expect(parsed.consent.policyVersion).toBe('2026-10-01');
    expect(parsed.cv.filename).toBe('cv.pdf');
    expect(Buffer.from(parsed.cv.contentBase64, 'base64').equals(pdf)).toBe(true);
  });

  test('rate limit trips after repeated phones', () => {
    resetApplyRateLimit();
    for (let i = 0; i < 5; i += 1) {
      expect(hitRateLimit({ phone: '0500000000', ip: `10.0.0.${i}` })).toBe(false);
    }
    expect(hitRateLimit({ phone: '0500000000', ip: '10.9.9.9' })).toBe(true);
    resetApplyRateLimit();
  });
});
