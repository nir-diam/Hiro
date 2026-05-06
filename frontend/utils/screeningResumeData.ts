/** Maps API candidate fields → ResumeViewer `resumeData` shape. */

const emptyResumeDefaults = {
  name: '',
  contact: '',
  summary: '',
  education: undefined as string[] | undefined,
};

export function buildResumeDataFromCandidate(
  candidate?: {
    fullName?: string;
    title?: string;
    professionalSummary?: string;
    workExperience?: any[];
    education?: any[];
    skills?: any;
    email?: string;
    phone?: string;
    resumeUrl?: string;
    resumeFileUrl?: string;
    resumeText?: string;
    resumeRaw?: string;
    resume?: string;
    parsedResumeText?: string;
  },
  candidateId?: string,
) {
  if (!candidate) {
    return { ...emptyResumeDefaults, experience: [''], candidateId: candidateId || undefined };
  }

  const name = candidate.fullName?.trim() || emptyResumeDefaults.name;
  const contactParts = [candidate.email, candidate.phone].filter(Boolean);
  const contact =
    contactParts.length > 0 ? contactParts.join(' | ') : emptyResumeDefaults.contact;

  const summary =
    (candidate.professionalSummary && candidate.professionalSummary.trim()) ||
    (candidate.title && candidate.title.trim()) ||
    emptyResumeDefaults.summary;

  const experience =
    Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0
      ? candidate.workExperience.map((exp: any) => {
          if (typeof exp === 'string') return exp;
          const role = String(exp?.role || exp?.title || '').trim();
          const company = String(exp?.company || exp?.organization || '').trim();
          const years = String(exp?.years || exp?.period || exp?.date || '').trim();
          const line1 = [role, company].filter(Boolean).join(', ');
          const line2 = years ? `<br/>${years}` : '';
          return `<b>${line1 || 'ניסיון תעסוקתי'}</b>${line2}`;
        })
      : [''];

  const education =
    Array.isArray(candidate.education) && candidate.education.length > 0
      ? candidate.education.map((edu: any) => {
          if (typeof edu === 'string') return edu;
          const deg = String(edu?.degree || edu?.title || '').trim();
          const inst = String(edu?.institution || edu?.school || '').trim();
          const years = String(edu?.years || edu?.period || '').trim();
          const line1 = [deg, inst].filter(Boolean).join(', ');
          const line2 = years ? `<br/>${years}` : '';
          return `<b>${line1 || 'השכלה'}</b>${line2}`;
        })
      : undefined;

  const skills = candidate.skills;
  const skillsText = Array.isArray(skills)
    ? skills
        .map((s) => (typeof s === 'string' ? s : String(s?.name || s?.label || '').trim()))
        .filter(Boolean)
        .join(', ')
    : typeof skills === 'string'
      ? skills
      : '';

  const raw =
    candidate.resumeRaw ||
    candidate.resumeText ||
    candidate.parsedResumeText ||
    candidate.resume ||
    skillsText;

  return {
    name,
    contact,
    summary,
    experience,
    education,
    raw,
    resumeUrl: candidate.resumeUrl || candidate.resumeFileUrl || undefined,
    candidateId: candidateId || undefined,
  };
}
