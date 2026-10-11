const stripHtml = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slugifySegment = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/**
 * Public slug: stable posting code until dedicated publicSlug column exists.
 * @param {import('../models/Job')} job
 * @param {import('../models/JobPublication') | null} [publication]
 */
const resolvePublicJobSlug = (job, publication) => {
  const plain = job.get ? job.get({ plain: true }) : job;
  const pubPlain = publication?.get ? publication.get({ plain: true }) : publication;
  const fromPub = pubPlain?.publicSlug || pubPlain?.metadata?.publicSlug;
  if (fromPub) return String(fromPub).trim();
  const posting = pubPlain?.publicationCode || plain.postingCode;
  if (posting) return String(posting).trim();
  return plain.id;
};

const mapEmploymentTypes = (job) => {
  const types = Array.isArray(job.jobType) ? job.jobType : [];
  return types.filter(Boolean).map((label) => ({
    value: slugifySegment(label) || label,
    label: String(label),
  }));
};

const mapPriorityUrgent = (priority) => priority === 'דחופה' || priority === 'קריטית';

const mapPublicJobListItem = (job, publication, extras = {}) => {
  const plain = job.get ? job.get({ plain: true }) : job;
  const pub = publication?.get ? publication.get({ plain: true }) : publication || {};
  const title = pub.publicJobTitle || plain.publicJobTitle || plain.title;
  const descriptionSource = pub.publicJobDescription || plain.PublicDescription || plain.description || '';
  const teaser = stripHtml(descriptionSource).slice(0, 180);

  return {
    id: plain.id,
    slug: resolvePublicJobSlug(job, publication),
    title,
    jobNumber: pub.publicationCode || plain.postingCode || null,
    category: plain.field ? { slug: slugifySegment(plain.field), label: plain.field } : null,
    role: plain.role ? { slug: slugifySegment(plain.role), label: plain.role } : null,
    industry: extras.industry || null,
    locations: [
      {
        city: plain.city || null,
        region: plain.region || null,
        label: [plain.city, plain.region].filter(Boolean).join(', ') || plain.location || null,
      },
    ],
    employmentType: mapEmploymentTypes(plain),
    workModel: extras.workModel || { value: 'office', label: 'מהמשרד' },
    urgent: mapPriorityUrgent(plain.priority),
    teaser,
    salary: extras.salary || null,
    imageUrl: pub.heroImageUrl || null,
    company: extras.company || { name: plain.client },
    status: extras.status || 'open',
    updatedAt: plain.updatedAt || plain.openDate || null,
    postedAt: plain.openDate || null,
  };
};

const mapPublicJobDetail = (job, publication, extras = {}) => {
  const list = mapPublicJobListItem(job, publication, extras);
  const plain = job.get ? job.get({ plain: true }) : job;
  const pub = publication?.get ? publication.get({ plain: true }) : publication || {};
  const requirements = Array.isArray(plain.requirements) ? plain.requirements : [];
  const pubReq = pub.publicJobRequirements ? String(pub.publicJobRequirements).split(/\n+/).filter(Boolean) : [];

  return {
    ...list,
    description: pub.publicJobDescription || plain.PublicDescription || plain.description || '',
    responsibilities: extras.responsibilities || '',
    niceToHave: extras.niceToHave || '',
    benefits: extras.benefits || '',
    requirements: pubReq.length ? pubReq : requirements,
    skills: extras.skills || [],
    experienceYearsMin: extras.experienceYearsMin ?? null,
    noExperience: extras.noExperience ?? false,
    seniority: extras.seniority || null,
    hoursDescription: extras.hoursDescription || null,
    suitableFor: extras.suitableFor || [],
    validThrough: extras.validThrough || null,
    startDate: extras.startDate || null,
    recruiter: extras.recruiter || null,
    apply: extras.apply || { questions: pub.screeningQuestions || [] },
    googleForJobs: extras.googleForJobs || null,
  };
};

module.exports = {
  stripHtml,
  slugifySegment,
  resolvePublicJobSlug,
  mapPublicJobListItem,
  mapPublicJobDetail,
};
