const { slugifySegment } = require('./publicJobSlug');
const { boardOf } = require('./publicJobVisibility');

const readBrandPolicy = (agency) => {
  const meta = agency?.metadata && typeof agency.metadata === 'object' ? agency.metadata : {};
  const value = String(meta.jobHeroBrandSource || 'company').trim();
  if (value === 'job_client' || value === 'choice') return value;
  return 'company';
};

/**
 * Hide the employer when the agency brand policy says so.
 * The same setting drives Nano Banana ("מקור מותג בתמונות משרה").
 * publicBoard.showClientName overrides that default for one job.
 */
const isEmployerConfidential = (agency, publication) => {
  const board = boardOf(publication);
  if (board.showClientName === true) return false;
  if (board.showClientName === false) return true;
  const policy = readBrandPolicy(agency);
  if (policy === 'job_client') return false;
  if (policy === 'choice') return publication?.heroBrandSource !== 'job_client';
  return true;
};

const agencyPublicName = (agency) =>
  String(agency?.displayName || agency?.name || '').trim();

const publisherFromAgency = (agency) => {
  const name = agencyPublicName(agency);
  if (!name) return null;
  const domain = String(agency?.domain || '').trim();
  const slug = slugifySegment(domain.replace(/^https?:\/\//, '').split('/')[0].split('.')[0]) || slugifySegment(name);
  return {
    name,
    logoUrl: agency?.logoUrl || null,
    slug: slug || null,
  };
};

const deriveConfidentialDisplayName = ({ industry, regionLabel, stored }) => {
  const custom = String(stored || '').trim();
  if (custom) return custom;
  const field = String(industry || '').trim() || 'חברה';
  const where = regionLabel ? ` ב${regionLabel}` : '';
  return `חברת ${field} מובילה${where}`;
};

const employerIdentity = (job, org) => ({
  name: String(org?.name || job?.client || '').trim(),
  logoUrl: org?.logo || null,
  website: org?.website || null,
  id: org?.id || null,
});

const redactText = (text, secrets) => {
  let out = String(text || '');
  for (const secret of secrets) {
    const value = String(secret || '').trim();
    if (value.length < 2) continue;
    out = out.split(value).join('');
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
};

const buildCompanyDto = ({ job, publication, agency, org, industry, sizeRange, regionLabel }) => {
  const confidential = isEmployerConfidential(agency, publication);
  const publisher = publisherFromAgency(agency);
  const identity = employerIdentity(job, org);
  if (confidential) {
    const board = boardOf(publication);
    return {
      confidential: true,
      displayName: deriveConfidentialDisplayName({
        industry,
        regionLabel,
        stored: board.confidentialDisplayName,
      }),
      industry: industry || null,
      sizeRange: sizeRange || null,
      publisher,
      _secrets: [identity.name, identity.website, identity.logoUrl, identity.id].filter(Boolean),
    };
  }
  const name = identity.name;
  const slug = String(org?.publicSlug || '').trim() || slugifySegment(name);
  return {
    confidential: false,
    name: name || null,
    slug: slug || null,
    logoUrl: identity.logoUrl,
    website: identity.website,
    industry: industry || null,
    sizeRange: sizeRange || null,
    publisher,
    _secrets: [],
  };
};

const publicCompanyDto = (company) => {
  if (!company) return null;
  const { _secrets, ...rest } = company;
  return rest;
};

module.exports = {
  readBrandPolicy,
  isEmployerConfidential,
  publisherFromAgency,
  deriveConfidentialDisplayName,
  buildCompanyDto,
  publicCompanyDto,
  redactText,
};
