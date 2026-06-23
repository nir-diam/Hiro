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
          // Prefer ISO startDate/endDate over free-text years
          let dateStr = String(exp?.years || exp?.period || exp?.date || '').trim();
          if (!dateStr && (exp?.startDate || exp?.endDate)) {
            const start = String(exp?.startDate || '').replace(/-\d{2}$/, '').trim();
            const end = String(exp?.endDate || '').replace(/-\d{2}$/, '').trim();
            if (start && end) dateStr = `${start} – ${end}`;
            else dateStr = start || end;
          }
          const description = String(exp?.description || exp?.summary || '').trim();
          const line1 = [role, company].filter(Boolean).join(', ');
          const line2 = dateStr
            ? `<br/><span style="color:#6b7280;font-size:0.85em;">${dateStr}</span>`
            : '';
          const line3 = description
            ? `<br/><span style="display:block;margin-top:4px;white-space:pre-line;">${description}</span>`
            : '';
          return `<b>${line1 || 'ניסיון תעסוקתי'}</b>${line2}${line3}`;
        })
      : [''];

  const education =
    Array.isArray(candidate.education) && candidate.education.length > 0
      ? candidate.education.map((edu: any) => {
          if (typeof edu === 'string') return edu;
          // Primary: pre-formatted value string (schema: { value: string })
          const val = String(edu?.value || '').trim();
          if (val) return `<b>${val}</b>`;
          // Fallback: composed fields
          const deg = String(edu?.degree || edu?.title || edu?.fieldOfStudy || '').trim();
          const inst = String(
            edu?.institution || edu?.school || edu?.university || '',
          ).trim();
          let years = String(edu?.years || edu?.period || '').trim();
          if (!years && (edu?.startYear || edu?.endYear)) {
            years = [edu?.startYear, edu?.endYear].filter(Boolean).join(' - ');
          }
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
