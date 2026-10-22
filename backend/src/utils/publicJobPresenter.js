const { slugifySegment, normalizeSearchText, composeJobSlug } = require('./publicJobSlug');
const {
  mapEmploymentTypeLabel,
  mapWorkModel,
  deriveSeniority,
  deriveExperience,
  deriveHoursDescription,
  mapQuestionType,
  SUITABLE_BY_VALUE,
} = require('./publicJobCatalog');
const { boardOf } = require('./publicJobVisibility');
const { buildCompanyDto, publicCompanyDto, redactText, isEmployerConfidential } = require('./publicJobConfidential');

const stripHtml = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const firstPath = (job) => (Array.isArray(job?.jobFields) ? job.jobFields[0] : null) || {};

const skillRows = (job) => {
  const list = Array.isArray(job?.skills) ? job.skills : [];
  return list
    .map((skill) => {
      if (typeof skill === 'string') return { label: skill, required: false, type: 'skill' };
      const type = skill?.type || 'skill';
      return {
        label: String(skill?.name || skill?.displayNameHe || skill?.key || '').trim(),
        required: skill?.mode === 'required' || skill?.is_required === true,
        type,
      };
    })
    .filter((skill) => skill.label && (skill.type === 'skill' || skill.type === 'tool' || skill.type === 'certification'));
};

const mapSkills = (job) =>
  skillRows(job)
    .filter((skill) => skill.type === 'skill')
    .sort((a, b) => Number(b.required) - Number(a.required))
    .slice(0, 8)
    .map(({ label, required }) => ({ label, required }));

const mapQuestions = (publication) => {
  const raw = Array.isArray(publication?.screeningQuestions) ? publication.screeningQuestions : [];
  return raw
    .filter((question) => question && question.isPublished !== false)
    .map((question) => {
      const type = mapQuestionType(question.type || question.answerType || question.presentationMode);
      const options = [];
      if (Array.isArray(question.options)) {
        for (const option of question.options) {
          const label = typeof option === 'string' ? option : option?.text || option?.label;
          if (label) options.push(String(label));
        }
      } else if (question.multipleChoiceOptions) {
        String(question.multipleChoiceOptions)
          .split(/[,|\n]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach((part) => options.push(part));
      }
      return {
        id: String(question.id),
        type,
        label: String(question.question || question.text || question.label || ''),
        required: type === 'video' ? false : Boolean(question.isMandatory ?? question.required),
        options,
        completeInPortal: type === 'video',
      };
    });
};

const validThrough = (job) => {
  const days = Number(job?.validityDays);
  if (!job?.openDate || !Number.isFinite(days) || days <= 0) return null;
  const date = new Date(job.openDate);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const recruiterDto = (job) => {
  const firstName = String(job?.recruiter || '').trim().split(/\s+/)[0];
  if (!firstName) return null;
  return { firstName, imageUrl: null };
};

const resolveSlug = (job, publication) => {
  const board = boardOf(publication);
  if (board.publicSlug) return String(board.publicSlug);
  const pub = publication || {};
  return composeJobSlug({
    title: pub.publicJobTitle || job.publicJobTitle || job.title,
    city: job.city,
    code: pub.publicationCode || job.postingCode,
    id: job.id,
  });
};

/**
 * @returns {{ dto: object, detail: object, meta: object }}
 */
const presentPublicJob = ({
  job,
  publication,
  agency,
  org,
  categoryNode,
  clusterNode,
  cityMeta,
  status = 'open',
}) => {
  const plain = job?.get ? job.get({ plain: true }) : job || {};
  const pub = publication?.get ? publication.get({ plain: true }) : publication || {};
  const board = boardOf(pub);
  const path = firstPath(plain);
  const categoryLabel = path.fieldType || plain.field || categoryNode?.label || null;
  const clusterLabel = path.category || clusterNode?.label || null;
  const categorySlug = categoryNode?.slug || (categoryLabel ? slugifySegment(categoryLabel) : null);
  const categoryAliases = categoryNode?.aliases || [];
  const clusterSlug = clusterNode?.slug || (clusterLabel ? slugifySegment(clusterLabel) : null);
  const roleLabel = path.role || plain.role || null;
  const industryLabel = org?.mainField || null;
  const industrySlug = industryLabel ? slugifySegment(industryLabel) : null;
  const regionSlug = cityMeta?.regionSlug || null;
  const regionName = cityMeta?.regionLabel || plain.region || null;
  const company = buildCompanyDto({
    job: plain,
    publication: pub,
    agency,
    org,
    industry: industryLabel,
    sizeRange: org?.employeeCount || null,
    regionLabel: regionName,
  });
  const confidential = company.confidential === true;
  const descriptionSource = pub.publicJobDescription || plain.PublicDescription || plain.description || '';
  const secrets = company._secrets || [];
  const description = confidential ? redactText(stripHtml(descriptionSource), secrets) : String(descriptionSource || '');
  const teaserSource = board.teaser || description;
  const teaser = (confidential ? redactText(teaserSource, secrets) : stripHtml(teaserSource)).slice(0, 180);
  const titleRaw = pub.publicJobTitle || plain.publicJobTitle || plain.title;
  const title = confidential ? redactText(titleRaw, secrets) : titleRaw;
  const experience = deriveExperience(
    `${description}\n${Array.isArray(plain.requirements) ? plain.requirements.join('\n') : ''}`,
    board,
  );
  const seniority = deriveSeniority(experience.experienceYearsMin, experience.noExperience, roleLabel);
  const workModel = mapWorkModel(board.workModel);
  const employmentType = (Array.isArray(plain.jobType) ? plain.jobType : [])
    .map(mapEmploymentTypeLabel)
    .filter(Boolean);
  const suitableFor = (Array.isArray(board.suitableFor) ? board.suitableFor : [])
    .map((value) => SUITABLE_BY_VALUE.get(String(value)) || null)
    .filter(Boolean);
  const salaryPublished = board.publishSalary === true;
  const salary = salaryPublished && (plain.salaryMin != null || plain.salaryMax != null)
    ? { min: plain.salaryMin ?? null, max: plain.salaryMax ?? null, currency: 'ILS', period: 'month' }
    : null;
  const showAddress = board.showAddress === true;
  const citySlug = cityMeta?.slug || (plain.city ? slugifySegment(plain.city) : null);
  const hideHero = confidential && isEmployerConfidential(agency, pub) && pub.heroBrandSource === 'job_client';
  const publishedAt = board.publishedAt || plain.openDate || null;
  const publishedAtMs = publishedAt ? new Date(publishedAt).getTime() : null;
  const skills = mapSkills(plain);
  const requiredLabels = skillRows(plain).filter((skill) => skill.required).map((skill) => skill.label);
  const requirementLines = [
    ...requiredLabels,
    ...(Array.isArray(plain.requirements) ? plain.requirements : []),
    ...(pub.publicJobRequirements ? String(pub.publicJobRequirements).split(/\n+/) : []),
  ].map((line) => String(line || '').trim()).filter(Boolean);
  const requirements = [...new Set(confidential ? requirementLines.map((line) => redactText(line, secrets)) : requirementLines)];
  const hoursDescription = deriveHoursDescription(description, board.hoursDescription);
  const locations = [
    {
      city: plain.city || null,
      citySlug,
      region: regionName,
      regionSlug,
      label: [plain.city, regionName].filter(Boolean).join(', ') || null,
      address: showAddress ? plain.location || null : null,
      lat: cityMeta?.lat ?? null,
      lng: cityMeta?.lng ?? null,
    },
  ];
  const companyPublic = publicCompanyDto(company);
  const list = {
    id: plain.id,
    slug: resolveSlug(plain, pub),
    title,
    jobNumber: pub.publicationCode || plain.postingCode || null,
    category: categoryLabel ? { slug: categorySlug, label: categoryLabel } : null,
    cluster: clusterLabel ? { slug: clusterSlug, label: clusterLabel } : null,
    role: roleLabel ? { slug: slugifySegment(roleLabel), label: roleLabel } : null,
    industry: industryLabel ? { slug: industrySlug, label: industryLabel } : null,
    locations,
    employmentType,
    workModel,
    urgent: plain.priority === 'דחופה' || plain.priority === 'קריטית',
    teaser,
    salary,
    imageUrl: hideHero ? null : pub.heroImageUrl || null,
    company: companyPublic,
    status,
    updatedAt: plain.updatedAt || plain.openDate || null,
    publishedAt,
    skills,
    hoursDescription,
    suitableFor,
    experienceYearsMin: experience.experienceYearsMin,
    noExperience: experience.noExperience,
    seniority,
    validThrough: validThrough(plain),
  };
  const hiringOrganization = confidential
    ? companyPublic.publisher
    : {
        name: companyPublic.name,
        logoUrl: companyPublic.logoUrl || null,
        sameAs: companyPublic.website || null,
      };
  const detail = {
    ...list,
    description,
    responsibilities: board.responsibilities || '',
    niceToHave: board.niceToHave || '',
    benefits: board.benefits || '',
    requirements,
    startDate: plain.availability || null,
    recruiter: recruiterDto(plain),
    apply: { questions: mapQuestions(pub) },
    googleForJobs: {
      title,
      description: stripHtml(description).slice(0, 4000),
      datePosted: publishedAt,
      validThrough: list.validThrough,
      employmentType: employmentType.map((row) => row.value),
      hiringOrganization: hiringOrganization
        ? { name: hiringOrganization.name, logo: hiringOrganization.logoUrl || null, sameAs: hiringOrganization.sameAs || null }
        : null,
      jobLocation: {
        addressLocality: plain.city || null,
        addressRegion: regionName,
        streetAddress: showAddress ? plain.location || null : null,
        addressCountry: 'IL',
      },
    },
  };
  const searchParts = [
    title,
    description,
    roleLabel,
    categoryLabel,
    clusterLabel,
    ...skills.map((skill) => skill.label),
    ...requirements,
    confidential ? '' : companyPublic.name,
  ];
  const meta = {
    searchText: normalizeSearchText(searchParts.filter(Boolean).join(' ')),
    clusterSlug,
    categorySlugs: [...new Set([categorySlug, ...categoryAliases].filter(Boolean))],
    industrySlug,
    citySlug,
    regionSlug,
    employmentValues: employmentType.map((row) => row.value),
    workModel: workModel?.value || null,
    seniority: seniority?.value || null,
    suitableFor: suitableFor.map((row) => row.value),
    companySlug: confidential ? null : companyPublic.slug,
    noExperience: experience.noExperience,
    salaryPublished,
    salaryMinValue: salaryPublished ? plain.salaryMin ?? null : null,
    salaryMax: salaryPublished ? plain.salaryMax ?? null : null,
    publishedAtMs: Number.isFinite(publishedAtMs) ? publishedAtMs : null,
    confidential,
  };
  return { dto: list, detail, meta };
};

module.exports = {
  stripHtml,
  presentPublicJob,
  resolveSlug,
  mapQuestions,
};
