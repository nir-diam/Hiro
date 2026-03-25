import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronDownIcon,
    NoSymbolIcon,
    CheckCircleIcon,
    MapPinIcon,
    SparklesIcon,
    PaperAirplaneIcon,
    AvatarIcon,
    ArrowLeftIcon,
    ArrowsPointingOutIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    PencilIcon,
} from './Icons';
import ResumeViewer from './ResumeViewer';
import { InternalOpinionEditorModal, copyRichHtmlToClipboard } from './InternalOpinionEditorModal';

const apiBase = import.meta.env.VITE_API_BASE || '';

interface ScreeningJob {
  id: number | string;
  company: string;
  title: string;
  location: string;
  salary: string;
  aiMatchScore: number;
  description: string;
  requirements: string[];
  screeningQuestions: { question: string; answer: string }[];
  /** Job JSONB contacts from API when present */
  contactsFromJob?: { id?: string; name: string; role?: string }[];
}

interface SendModalContact {
  id: string;
  name: string;
  role: string;
}

export const screeningJobsData: ScreeningJob[] = [
  { 
    id: 1, 
    company: 'Wix', 
    title: 'מפתח/ת Fullstack', 
    location: 'תל אביב', 
    salary: '28-32k ₪',
    aiMatchScore: 88,
    description: 'דרוש/ה מפתח/ת Fullstack מנוסה להצטרפות לצוות הליבה שלנו. העבודה כוללת פיתוח פיצ\'רים חדשים מקצה לקצה, תוך שימוש בטכנולוגיות המתקדמות ביותר.',
    requirements: ['5+ שנות ניסיון בפיתוח Web', 'שליטה מעולה ב-React ו-Node.js', 'ניסיון עם TypeScript - יתרון משמעותי', 'ניסיון בעבודה עם Microservices'],
    screeningQuestions: [
        { question: 'מה הניסיון שלך עם מסדי נתונים NoSQL?', answer: '' },
        { question: 'האם עבדת בסביבת CI/CD? אם כן, תאר/י.', answer: '' },
    ]
  },
  { 
    id: 2, 
    company: 'בזק', 
    title: 'מנהל/ת שיווק דיגיטלי', 
    location: 'תל אביב', 
    salary: '18-22k ₪',
    aiMatchScore: 92,
    description: 'ניהול כלל הפעילות הדיגיטלית של החברה, כולל קמפיינים ממומנים, SEO, וניהול נכסים דיגיטליים.',
    requirements: ['4+ שנות ניסיון בניהול שיווק דיגיטלי', 'ניסיון מוכח בניהול תקציבים גדולים', 'שליטה מלאה ב-Google Analytics ו-Google Ads'],
    screeningQuestions: [
      { question: 'מה התקציב הגדול ביותר שניהלת בחודש?', answer: '' },
      { question: 'תאר קמפיין מוצלח במיוחד שהובלת.', answer: '' },
    ]
  },
  { 
    id: 3, 
    company: 'אל-על', 
    title: 'ראש/ת צוות BI', 
    location: 'לוד', 
    salary: '25-28k ₪',
    aiMatchScore: 75,
    description: 'ניהול צוות של 4 אנליסטים, אחריות על פיתוח דשבורדים, ניתוח נתונים עסקיים והצגת תובנות להנהלה.',
    requirements: ['3+ שנות ניסיון בניהול צוות BI', 'שליטה מעולה ב-SQL', 'ניסיון עם כלי ויזואליזציה (Tableau/Power BI)', 'רקע בתחום התעופה - יתרון'],
    screeningQuestions: [
      { question: 'באיזה כלי ויזואליזציה יש לך הכי הרבה ניסיון?', answer: '' },
      { question: 'איך אתה מתמודד עם דרישות אד-הוק מההנהלה?', answer: '' },
    ]
  },
];

const AIMatchScore: React.FC<{ score: number }> = ({ score }) => {
    const scoreColor = score > 85 ? 'text-accent-600' : score > 70 ? 'text-primary-600' : 'text-red-600';
    const bgColor = score > 85 ? 'bg-accent-100/70' : score > 70 ? 'bg-primary-100/70' : 'bg-red-100/70';

    return (
        <div className={`flex items-center justify-center gap-1.5 text-sm font-bold px-2.5 py-1 rounded-full ${bgColor} ${scoreColor}`}>
            <SparklesIcon className="w-4 h-4" />
            <span>{score}%</span>
        </div>
    );
};

// Mock Resume Data for the split view
const mockResumeData = {
    name: 'גדעון שפירא',
    contact: 'gidon.shap@email.com | 054-1234567',
    summary: 'מנהל שיווק דיגיטלי עם ניסיון של 5 שנים. מומחה ב-PPC, SEO ואנליטיקה.',
    experience: [
        '<b>מנהל שיווק דיגיטלי, בזק</b><br/>ניהול קמפיינים ותקציבים גדולים.',
        '<b>מנהל PPC, Wix</b><br/>אופטימיזציה לקמפיינים בגוגל ופייסבוק.'
    ]
};

function buildResumeDataFromCandidate(candidate?: {
  fullName?: string;
  title?: string;
  professionalSummary?: string;
  workExperience?: any[];
  skills?: any;
  email?: string;
  phone?: string;
  resumeUrl?: string;
  resumeFileUrl?: string;
  resumeText?: string;
  resumeRaw?: string;
  resume?: string;
  parsedResumeText?: string;
}, candidateId?: string) {
  if (!candidate) {
    return { ...mockResumeData, candidateId: candidateId || undefined };
  }

  const name = candidate.fullName?.trim() || mockResumeData.name;
  const contactParts = [candidate.email, candidate.phone].filter(Boolean);
  const contact =
    contactParts.length > 0 ? contactParts.join(' | ') : mockResumeData.contact;

  const summary =
    (candidate.professionalSummary && candidate.professionalSummary.trim()) ||
    (candidate.title && candidate.title.trim()) ||
    mockResumeData.summary;

  const experience = Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0
    ? candidate.workExperience.map((exp: any) => {
        if (typeof exp === 'string') return exp;
        const role = String(exp?.role || exp?.title || '').trim();
        const company = String(exp?.company || exp?.organization || '').trim();
        const years = String(exp?.years || exp?.period || exp?.date || '').trim();
        const line1 = [role, company].filter(Boolean).join(', ');
        const line2 = years ? `<br/>${years}` : '';
        return `<b>${line1 || 'ניסיון תעסוקתי'}</b>${line2}`;
      })
    : mockResumeData.experience;

  const skills = candidate.skills;
  const skillsText = Array.isArray(skills)
    ? skills.map((s) => (typeof s === 'string' ? s : String(s?.name || s?.label || '').trim())).filter(Boolean).join(', ')
    : (typeof skills === 'string' ? skills : '');

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
    raw,
    resumeUrl: candidate.resumeUrl || candidate.resumeFileUrl || undefined,
    candidateId: candidateId || undefined,
  };
}

function mapApiJobToScreeningJob(raw: any): ScreeningJob {
  const req = raw.requirements ?? [];
  const reqList = Array.isArray(req) ? req : (typeof req === 'string' ? [req] : []);
  const screening = raw.telephoneQuestions ?? raw.screeningQuestions ?? [];
  const screeningList = Array.isArray(screening)
    ? screening.map((q: any) => ({ question: typeof q === 'string' ? q : (q?.question ?? q?.text ?? ''), answer: '' }))
    : [];
  const rawContacts = raw.contacts;
  let contactsFromJob: ScreeningJob['contactsFromJob'];
  if (Array.isArray(rawContacts) && rawContacts.length) {
    contactsFromJob = rawContacts
      .map((x: any, i: number) => ({
        id: x.id != null ? String(x.id) : undefined,
        name:
          typeof x.name === 'string'
            ? x.name
            : String(x.contactName || x.fullName || x.email || '').trim() || `איש קשר ${i + 1}`,
        role: typeof x.role === 'string' ? x.role : String(x.title || ''),
      }))
      .filter((x) => x.name);
  }
  return {
    id: raw.id,
    company: raw.client ?? raw.company ?? '',
    title: raw.title ?? '',
    location: raw.location ?? raw.city ?? '',
    salary: raw.salaryMin && raw.salaryMax ? `${raw.salaryMin}-${raw.salaryMax}k ₪` : (raw.salary ?? ''),
    aiMatchScore: typeof raw.matchPercentage === 'number' ? raw.matchPercentage : 0,
    description: raw.description ?? '',
    requirements: reqList,
    screeningQuestions: screeningList,
    contactsFromJob,
  };
}

function getFallbackContactsForCompany(company: string): SendModalContact[] {
  const c = company.trim();
  if (c.includes('Wix'))
    return [
      { id: 'demo-wix-1', name: 'דנה כהן', role: 'HR Manager' },
      { id: 'demo-wix-2', name: 'יוסי לוי', role: 'Engineering Manager' },
      { id: 'demo-wix-3', name: 'מיכל ברק', role: 'Recruiter' },
    ];
  if (c.includes('בזק'))
    return [
      { id: 'demo-bzq-1', name: 'רונית אברהם', role: 'Marketing Director' },
      { id: 'demo-bzq-2', name: 'אביב גל', role: 'Digital Lead' },
      { id: 'demo-bzq-3', name: 'שרה פרידמן', role: 'Talent Acquisition' },
      { id: 'demo-bzq-4', name: 'משה דיין', role: 'CEO' },
      { id: 'demo-bzq-5', name: 'ליאת שקד', role: 'HRBP' },
    ];
  if (c.includes('אל-על') || c.includes('אלעל'))
    return [
      { id: 'demo-ly-1', name: 'איתי לוין', role: 'Head of Data' },
      { id: 'demo-ly-2', name: 'קרן אור', role: 'BI Architect' },
    ];
  return [
    { id: 'demo-gen-1', name: 'איש קשר לקוח', role: 'מגייס' },
    { id: 'demo-gen-2', name: 'מנהל/ת גיוס', role: 'HR' },
  ];
}

function stripHtmlToText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const REJECTION_REASONS = [
  'חוסר ניסיון רלוונטי',
  'ציפיות שכר גבוהות',
  'חוסר התאמה טכנולוגית',
  'חוסר התאמה אישיותית',
  'מרחק גיאוגרפי',
  'מועמד משך עניין',
  'אחר',
] as const;

const CandidateScreeningView: React.FC<{
  onBack: () => void;
  candidateId?: string;
  candidate?: {
    fullName?: string;
    title?: string;
    professionalSummary?: string;
    workExperience?: any[];
    skills?: any;
    email?: string;
    phone?: string;
    resumeUrl?: string;
    resumeFileUrl?: string;
    resumeText?: string;
    resumeRaw?: string;
  };
}> = ({ onBack, candidateId, candidate }) => {
    const [jobs, setJobs] = useState<ScreeningJob[]>([]);
    const [selectedJobs, setSelectedJobs] = useState<(number | string)[]>([]);
    const [expandedJobId, setExpandedJobId] = useState<number | string | null>(null);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [internalOpinionByJobId, setInternalOpinionByJobId] = useState<Record<string, string>>({});
    const [loadingOpinionForJobId, setLoadingOpinionForJobId] = useState<number | string | null>(null);
    const [screeningDataByJobId, setScreeningDataByJobId] = useState<Record<string, { answers: string[]; telephoneImpression: string }>>({});
    const [opinionEditJob, setOpinionEditJob] = useState<ScreeningJob | null>(null);
    const [opinionEditDraft, setOpinionEditDraft] = useState('');
    const [opinionEditSaving, setOpinionEditSaving] = useState(false);
    const [opinionEditRegenerating, setOpinionEditRegenerating] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState<string>(REJECTION_REASONS[0]);
    const [rejectNotes, setRejectNotes] = useState('');
    const [rejectSubmitting, setRejectSubmitting] = useState(false);
    const [sendCvModalOpen, setSendCvModalOpen] = useState(false);
    const [sendModalJobIds, setSendModalJobIds] = useState<(number | string)[]>([]);
    const [contactsForSendModal, setContactsForSendModal] = useState<Record<string, SendModalContact[]>>({});
    const [contactsForSendLoading, setContactsForSendLoading] = useState(false);
    const [selectedContactsByJob, setSelectedContactsByJob] = useState<Record<string, Record<string, boolean>>>({});
    const [sendCvSubmitting, setSendCvSubmitting] = useState(false);
    const resumeSendCvAfterOpinionRef = useRef(false);
    const saveTimeoutByJobRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const candidateResumeData = useMemo(
      () => buildResumeDataFromCandidate(candidate as any, candidateId),
      [candidate, candidateId]
    );

    useEffect(() => {
      if (!candidateId || !apiBase) {
        setJobs([]);
        return;
      }
      setJobsLoading(true);
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${apiBase}/api/candidates/${candidateId}/relevant-jobs?limit=5`, {
        headers,
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: any[]) => {
          if (Array.isArray(data)) {
            setJobs(data.map(mapApiJobToScreeningJob));
          }
        })
        .catch(() => setJobs([]))
        .finally(() => setJobsLoading(false));
    }, [candidateId]);

    useEffect(() => {
      if (!candidateId || !apiBase || jobs.length === 0) return;
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, { headers, cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data: Record<string, { screeningAnswers?: { question: string; answer: string }[]; telephoneImpression?: string; internalOpinion?: string }>) => {
          setScreeningDataByJobId((prev) => {
            const next = { ...prev };
            jobs.forEach((job) => {
              const jid = String(job.id);
              const fromApi = data[jid];
              const questions = job.screeningQuestions || [];
              const answers = questions.map((sq) => {
                const a = fromApi?.screeningAnswers?.find((x) => x.question === sq.question);
                return a?.answer ?? '';
              });
              next[jid] = {
                answers: answers.length ? answers : prev[jid]?.answers ?? [],
                telephoneImpression: fromApi?.telephoneImpression ?? prev[jid]?.telephoneImpression ?? '',
              };
            });
            return next;
          });
          setInternalOpinionByJobId((prev) => {
            const next = { ...prev };
            jobs.forEach((job) => {
              const jid = String(job.id);
              const opinion = (data[jid] as { internalOpinion?: string } | undefined)?.internalOpinion;
              if (opinion) next[jid] = opinion;
            });
            return next;
          });
        })
        .catch(() => {});
    }, [candidateId, jobs.map((j) => j.id).join(',')]);

    const getScreeningForJob = useCallback((job: ScreeningJob) => {
      const jid = String(job.id);
      const stored = screeningDataByJobId[jid];
      const questions = job.screeningQuestions || [];
      return {
        answers: stored?.answers ?? questions.map(() => ''),
        telephoneImpression: stored?.telephoneImpression ?? '',
      };
    }, [screeningDataByJobId]);

    const saveScreeningForJob = useCallback(
      async (job: ScreeningJob) => {
        if (!candidateId || !apiBase) return;
        const { answers, telephoneImpression } = getScreeningForJob(job);
        const screeningAnswers = (job.screeningQuestions || []).map((sq, i) => ({
          question: sq.question,
          answer: answers[i] ?? '',
        }));
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        try {
          await fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              jobId: job.id,
              screeningAnswers,
              telephoneImpression,
            }),
          });
        } catch (_) {}
      },
      [candidateId, getScreeningForJob]
    );

    const debouncedSaveScreening = useCallback(
      (job: ScreeningJob) => {
        const jid = String(job.id);
        const t = saveTimeoutByJobRef.current[jid];
        if (t) clearTimeout(t);
        saveTimeoutByJobRef.current[jid] = setTimeout(() => {
          saveScreeningForJob(job);
          delete saveTimeoutByJobRef.current[jid];
        }, 2000);
      },
      [saveScreeningForJob]
    );

    useEffect(() => {
      const ref = saveTimeoutByJobRef.current;
      return () => {
        Object.values(ref).forEach(clearTimeout);
        saveTimeoutByJobRef.current = {};
      };
    }, []);

    const updateScreeningAnswer = useCallback(
      (job: ScreeningJob, questionIndex: number, value: string) => {
        const jid = String(job.id);
        const { answers, telephoneImpression } = getScreeningForJob(job);
        const nextAnswers = [...answers];
        while (nextAnswers.length <= questionIndex) nextAnswers.push('');
        nextAnswers[questionIndex] = value;
        setScreeningDataByJobId((prev) => ({ ...prev, [jid]: { answers: nextAnswers, telephoneImpression } }));
        debouncedSaveScreening(job);
      },
      [getScreeningForJob, debouncedSaveScreening]
    );

    const updateTelephoneImpression = useCallback(
      (job: ScreeningJob, value: string) => {
        const jid = String(job.id);
        const { answers } = getScreeningForJob(job);
        setScreeningDataByJobId((prev) => ({ ...prev, [jid]: { answers, telephoneImpression: value } }));
        debouncedSaveScreening(job);
      },
      [getScreeningForJob, debouncedSaveScreening]
    );

    const persistInternalOpinion = useCallback(
      async (job: ScreeningJob, html: string) => {
        if (!candidateId || !apiBase) return false;
        const { answers, telephoneImpression } = getScreeningForJob(job);
        const screeningAnswers = (job.screeningQuestions || []).map((sq, i) => ({
          question: sq.question,
          answer: answers[i] ?? '',
        }));
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        try {
          const res = await fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              jobId: job.id,
              screeningAnswers,
              telephoneImpression,
              internalOpinion: html,
            }),
          });
          return res.ok;
        } catch {
          return false;
        }
      },
      [candidateId, getScreeningForJob]
    );

    const requestGeneratedInternalOpinionHtml = useCallback(
      async (job: ScreeningJob): Promise<{ html: string | null; errorMessage?: string }> => {
        if (!candidateId || !apiBase) {
          return { html: null, errorMessage: 'לא זמין: יש לטעון מועמד מהמערכת.' };
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        try {
          const res = await fetch(`${apiBase}/api/candidates/${candidateId}/generate-internal-opinion`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jobId: job.id,
              jobTitle: job.title,
              jobDescription: job.description,
              requirements: job.requirements,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.html) return { html: data.html };
          return { html: null, errorMessage: data.message || 'שגיאה ביצירת חוות הדעת.' };
        } catch {
          return { html: null, errorMessage: 'שגיאת רשת.' };
        }
      },
      [candidateId]
    );

    const handleGenerateInternalOpinion = useCallback(
      async (job: ScreeningJob) => {
        setLoadingOpinionForJobId(job.id);
        try {
          const { html, errorMessage } = await requestGeneratedInternalOpinionHtml(job);
          if (html) {
            setInternalOpinionByJobId((prev) => ({ ...prev, [String(job.id)]: html }));
            await persistInternalOpinion(job, html);
          } else if (errorMessage) {
            alert(errorMessage);
          }
        } finally {
          setLoadingOpinionForJobId(null);
        }
      },
      [requestGeneratedInternalOpinionHtml, persistInternalOpinion]
    );

    const openOpinionEditor = useCallback((job: ScreeningJob) => {
      setOpinionEditJob(job);
      setOpinionEditDraft(internalOpinionByJobId[String(job.id)] || '');
    }, [internalOpinionByJobId]);

    const openOpinionEditorFromSendModal = useCallback(
      (job: ScreeningJob) => {
        resumeSendCvAfterOpinionRef.current = true;
        setSendCvModalOpen(false);
        setOpinionEditJob(job);
        setOpinionEditDraft(internalOpinionByJobId[String(job.id)] || '');
      },
      [internalOpinionByJobId]
    );

    const closeOpinionEditor = useCallback(() => {
      setOpinionEditJob(null);
      setOpinionEditDraft('');
      setOpinionEditSaving(false);
      setOpinionEditRegenerating(false);
      if (resumeSendCvAfterOpinionRef.current) {
        resumeSendCvAfterOpinionRef.current = false;
        setSendCvModalOpen(true);
      }
    }, []);

    const handleSaveOpinionFromModal = useCallback(async () => {
      if (!opinionEditJob) return;
      setOpinionEditSaving(true);
      try {
        const ok = await persistInternalOpinion(opinionEditJob, opinionEditDraft);
        if (ok) {
          setInternalOpinionByJobId((prev) => ({ ...prev, [String(opinionEditJob.id)]: opinionEditDraft }));
          closeOpinionEditor();
        } else {
          alert('שמירת חוות הדעת נכשלה.');
        }
      } finally {
        setOpinionEditSaving(false);
      }
    }, [opinionEditJob, opinionEditDraft, persistInternalOpinion, closeOpinionEditor]);

    const handleRegenerateOpinionInModal = useCallback(async () => {
      if (!opinionEditJob) return;
      setOpinionEditRegenerating(true);
      try {
        const { html, errorMessage } = await requestGeneratedInternalOpinionHtml(opinionEditJob);
        if (html) {
          setOpinionEditDraft(html);
          setInternalOpinionByJobId((prev) => ({ ...prev, [String(opinionEditJob.id)]: html }));
          await persistInternalOpinion(opinionEditJob, html);
        } else if (errorMessage) {
          alert(errorMessage);
        }
      } finally {
        setOpinionEditRegenerating(false);
      }
    }, [opinionEditJob, requestGeneratedInternalOpinionHtml, persistInternalOpinion]);

    const handleCopyOpinionFromModal = useCallback(async () => {
      try {
        await copyRichHtmlToClipboard(opinionEditDraft);
        alert('הועתק ללוח — ניתן להדביק במייל עם עיצוב.');
      } catch {
        alert('העתקה ללוח נכשלה.');
      }
    }, [opinionEditDraft]);

    const handleReportOpinionIssue = useCallback(() => {
      const details = window.prompt('תאר את הבעיה בחוות הדעת (אופציונלי):');
      if (details === null) return;
      alert('תודה על הדיווח. הצוות יבדוק את הנושא.');
    }, []);

    const handleSelectJob = (jobId: number | string) => {
        setSelectedJobs(prev =>
            prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedJobs(jobs.map(j => j.id));
        } else {
            setSelectedJobs([]);
        }
    };

    const closeRejectModal = useCallback(() => {
      setRejectModalOpen(false);
      setRejectNotes('');
      setRejectReason(REJECTION_REASONS[0]);
      setRejectSubmitting(false);
    }, []);

    const openRejectModal = useCallback(() => {
      if (selectedJobs.length === 0) return;
      setRejectReason(REJECTION_REASONS[0]);
      setRejectNotes('');
      setRejectModalOpen(true);
    }, [selectedJobs]);

    const handleConfirmReject = useCallback(async () => {
      if (selectedJobs.length === 0) return;
      const jobIds = [...selectedJobs];

      const applyLocalReject = () => {
        setJobs((prev) => prev.filter((job) => !jobIds.includes(job.id)));
        setSelectedJobs([]);
        setExpandedJobId(null);
        setScreeningDataByJobId((prev) => {
          const next = { ...prev };
          jobIds.forEach((id) => {
            delete next[String(id)];
          });
          return next;
        });
        setInternalOpinionByJobId((prev) => {
          const next = { ...prev };
          jobIds.forEach((id) => {
            delete next[String(id)];
          });
          return next;
        });
        closeRejectModal();
      };

      if (!candidateId || !apiBase) {
        applyLocalReject();
        return;
      }

      setRejectSubmitting(true);
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const payload = {
        screeningStatus: 'rejected' as const,
        rejectionReason: rejectReason,
        rejectionNotes: rejectNotes.trim(),
      };

      try {
        const results = await Promise.allSettled(
          jobIds.map((jobId) =>
            fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ jobId, ...payload }),
            }).then((res) => {
              if (!res.ok) throw new Error(String(res.status));
            })
          )
        );
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length === 0) {
          applyLocalReject();
        } else {
          alert(`שלילה נכשלה עבור ${failed.length} מתוך ${jobIds.length} משרות. נסה שוב.`);
        }
      } catch {
        alert('שגיאת רשת בשמירת השלילה.');
      } finally {
        setRejectSubmitting(false);
      }
    }, [
      selectedJobs,
      candidateId,
      rejectReason,
      rejectNotes,
      closeRejectModal,
    ]);

    useEffect(() => {
      if (!sendCvModalOpen || sendModalJobIds.length === 0) return;
      let cancelled = false;
      setContactsForSendLoading(true);

      (async () => {
        const selectedJobObjs = jobs.filter((j) => sendModalJobIds.includes(j.id));
        const result: Record<string, SendModalContact[]> = {};
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        let clientsList: any[] = [];
        if (apiBase && token) {
          try {
            const res = await fetch(`${apiBase}/api/clients`, { headers });
            if (res.ok) {
              const data = await res.json();
              clientsList = Array.isArray(data) ? data : [];
            }
          } catch {
            /* ignore */
          }
        }

        const resolveClientId = (company: string): string | null => {
          const c = company.trim();
          if (!c || !clientsList.length) return null;
          const norm = (s: string) => s.trim().toLowerCase();
          const nc = norm(c);
          for (const cl of clientsList) {
            const name = norm(String(cl.displayName || cl.name || ''));
            if (name === nc) return String(cl.id);
          }
          for (const cl of clientsList) {
            const name = norm(String(cl.displayName || cl.name || ''));
            if (name && (name.includes(nc) || nc.includes(name))) return String(cl.id);
          }
          return null;
        };

        const fetchedClientContacts = new Map<string, SendModalContact[]>();

        for (const job of selectedJobObjs) {
          const jid = String(job.id);
          if (job.contactsFromJob?.length) {
            result[jid] = job.contactsFromJob.map((c, i) => ({
              id: c.id ?? `job-embed-${jid}-${i}`,
              name: c.name || 'ללא שם',
              role: c.role || '',
            }));
            continue;
          }
          const clientId = resolveClientId(job.company);
          if (clientId && apiBase) {
            if (!fetchedClientContacts.has(clientId)) {
              try {
                const res = await fetch(`${apiBase}/api/clients/${clientId}/contacts`, { headers });
                const list = res.ok ? await res.json() : [];
                const arr = (Array.isArray(list) ? list : [])
                  .filter((x: { isActive?: boolean }) => x.isActive !== false)
                  .map((x: { id: string; name?: string; role?: string }) => ({
                    id: String(x.id),
                    name: String(x.name || ''),
                    role: String(x.role || ''),
                  }))
                  .filter((x) => x.name);
                fetchedClientContacts.set(clientId, arr);
              } catch {
                fetchedClientContacts.set(clientId, []);
              }
            }
            const fromApi = fetchedClientContacts.get(clientId) || [];
            result[jid] = fromApi.length ? fromApi : getFallbackContactsForCompany(job.company);
          } else {
            result[jid] = getFallbackContactsForCompany(job.company);
          }
        }

        if (cancelled) return;
        setContactsForSendModal(result);
        const sel: Record<string, Record<string, boolean>> = {};
        for (const jid of Object.keys(result)) {
          sel[jid] = {};
          for (const c of result[jid]) sel[jid][c.id] = true;
        }
        setSelectedContactsByJob(sel);
        setContactsForSendLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [sendCvModalOpen, sendModalJobIds.join(','), jobs]);

    const closeSendCvModal = useCallback(() => {
      setSendCvModalOpen(false);
      setSendModalJobIds([]);
      setContactsForSendModal({});
      setSelectedContactsByJob({});
      setSendCvSubmitting(false);
      setContactsForSendLoading(false);
    }, []);

    const openSendCvModal = useCallback(() => {
      if (selectedJobs.length === 0) return;
      setSendModalJobIds([...selectedJobs]);
      setSendCvModalOpen(true);
    }, [selectedJobs]);

    const toggleSendContact = useCallback((jobId: string, contactId: string) => {
      setSelectedContactsByJob((prev) => ({
        ...prev,
        [jobId]: {
          ...(prev[jobId] || {}),
          [contactId]: !prev[jobId]?.[contactId],
        },
      }));
    }, []);

    const handleConfirmSendCv = useCallback(async () => {
      const jobIds = sendModalJobIds;
      if (jobIds.length === 0) return;

      for (const id of jobIds) {
        const jid = String(id);
        const map = selectedContactsByJob[jid];
        const n = map ? Object.entries(map).filter(([, v]) => v).length : 0;
        if (n === 0) {
          alert('יש לבחור לפחות איש קשר אחד לכל משרה.');
          return;
        }
      }

      const jobsPayload = jobs.filter((j) => jobIds.includes(j.id));
      const missingOpinion = jobsPayload.some((j) => !stripHtmlToText(internalOpinionByJobId[String(j.id)] || ''));
      if (missingOpinion && !window.confirm('לחלק מהמשרות אין חוות דעת פנימית. להמשיך בכל זאת?')) {
        return;
      }

      setSendCvSubmitting(true);
      try {
        const payload = jobIds.map((id) => {
          const job = jobs.find((j) => j.id === id);
          const contacts = contactsForSendModal[String(id)] || [];
          const sel = selectedContactsByJob[String(id)] || {};
          return {
            jobId: id,
            jobTitle: job?.title,
            company: job?.company,
            contacts: contacts.filter((c) => sel[c.id]),
            internalOpinionHtml: internalOpinionByJobId[String(id)] || '',
          };
        });
        console.log('[sendCvToClient]', {
          candidateId,
          candidateName: candidateResumeData.name,
          payload,
        });
        await new Promise((r) => setTimeout(r, 450));
        alert('השליחה נרשמה בהצלחה (סימולציה — חיבור אימייל יתווסף בהמשך).');
        setSelectedJobs((prev) => prev.filter((jid) => !jobIds.includes(jid)));
        closeSendCvModal();
      } finally {
        setSendCvSubmitting(false);
      }
    }, [
      sendModalJobIds,
      selectedContactsByJob,
      contactsForSendModal,
      jobs,
      internalOpinionByJobId,
      candidateId,
      candidateResumeData.name,
      closeSendCvModal,
    ]);

    const sendModalJobs = useMemo(
      () => jobs.filter((j) => sendModalJobIds.includes(j.id)),
      [jobs, sendModalJobIds]
    );

    const allSelected = useMemo(() => jobs.length > 0 && selectedJobs.length === jobs.length, [jobs, selectedJobs]);

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2);

    const opinionEditorCandidateLabel = candidateResumeData.name;

    return (
        <div className="bg-bg-default h-full flex flex-col -m-6 overflow-hidden relative">
            {/* Header */}
            <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-card flex-shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-4">
                     <button onClick={onBack} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
                        <ArrowLeftIcon className="w-6 h-6 transform rotate-180" />
                    </button>
                    <h3 className="text-xl font-bold text-text-default">סינון מועמד</h3>
                </div>
                 {/* Desktop Actions */}
                 <div className="hidden md:flex items-center gap-3">
                    <button
                        onClick={openRejectModal}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-red-50 text-red-600 font-semibold py-2 px-4 rounded-lg hover:bg-red-100 transition shadow-sm disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                    >
                        <NoSymbolIcon className="w-5 h-5" />
                        <span>שלול ({selectedJobs.length})</span>
                    </button>
                    
                    <button
                        onClick={openSendCvModal}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm disabled:bg-primary-300 disabled:cursor-not-allowed"
                    >
                         <span>שלח קו"ח ללקוח ({selectedJobs.length})</span>
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                 </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative flex-row">
                 {/* Right Pane - Jobs List */}
                 {/* RTL: First child is Right. We want Jobs on Right. */}
                 {/* Mobile: Full width (CV hidden). Desktop: Half width. */}
                <div className="w-full md:w-1/2 flex flex-col overflow-hidden bg-bg-subtle/30 md:border-l border-border-default">
                     <div className="p-3 border-b border-border-default flex items-center justify-between bg-bg-subtle/50">
                         <h4 className="font-bold text-text-muted text-sm">משרות לבדיקה ({jobs.length}){jobsLoading ? '...' : ''}</h4>
                         <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                checked={allSelected}
                                onChange={handleSelectAll}
                                id="select-all-jobs"
                                disabled={jobsLoading}
                            />
                            <label htmlFor="select-all-jobs" className="text-sm text-text-muted cursor-pointer">בחר הכל</label>
                        </div>
                     </div>
                     
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 md:pb-4">
                        {jobsLoading ? (
                            <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 text-text-muted">
                                <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                                <p className="text-sm font-medium">טוען משרות רלוונטיות...</p>
                            </div>
                        ) : (
                        <>
                        {jobs.map(job => (
                            <div key={job.id} className={`border rounded-lg bg-bg-card transition-all ${expandedJobId === job.id ? 'border-primary-300 shadow-md' : 'border-border-default hover:border-primary-200'}`}>
                                {/* Job Summary */}
                                <div
                                    className="flex items-start gap-3 p-3 cursor-pointer"
                                    onClick={() => setExpandedJobId(prevId => prevId === job.id ? null : job.id)}
                                >
                                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="h-5 w-5 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                            checked={selectedJobs.includes(job.id)}
                                            onChange={() => handleSelectJob(job.id)}
                                        />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                             <div>
                                                <p className="font-bold text-text-default text-base leading-tight">{job.title}</p>
                                                <p className="text-sm text-text-muted">{job.company}</p>
                                             </div>
                                             <AIMatchScore score={job.aiMatchScore} />
                                        </div>
                                        
                                        <div className="flex items-center gap-3 text-xs text-text-subtle mt-2">
                                             <span className="flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> {job.location}</span>
                                             <span>•</span>
                                             <span className="font-medium text-text-default">{job.salary}</span>
                                        </div>
                                    </div>
                                     <div className="self-center pl-1">
                                        <ChevronDownIcon className={`w-5 h-5 text-text-muted transition-transform ${expandedJobId === job.id ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>
                                
                                {/* Expanded Details */}
                                {expandedJobId === job.id && (
                                    <div className="p-4 border-t border-border-default bg-bg-subtle/30 text-sm">
                                        <div className="space-y-4">
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">תיאור המשרה</h5>
                                                <p className="text-text-default leading-relaxed">{job.description}</p>
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">דרישות</h5>
                                                <ul className="space-y-1">
                                                    {job.requirements.map((req, i) => (
                                                        <li key={i} className="flex items-start gap-2">
                                                            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                                            <span>{req}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="bg-primary-50/50 p-3 rounded-lg border border-primary-100">
                                                <h5 className="font-bold text-primary-800 mb-2 text-xs uppercase">שאלות סינון</h5>
                                                <div className="space-y-3">
                                                    {job.screeningQuestions.map((sq, i) => (
                                                        <div key={i}>
                                                            <label className="block font-semibold text-text-default mb-1">{sq.question}</label>
                                                            <input
                                                                type="text"
                                                                placeholder="תשובת המועמד..."
                                                                value={getScreeningForJob(job).answers[i] ?? ''}
                                                                onChange={(e) => updateScreeningAnswer(job, i, e.target.value)}
                                                                className="w-full bg-white border border-primary-200 rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase"> התרשמות טלפונית
                                                </h5>
                                                <textarea
                                                    rows={2}
                                                    placeholder="רשום התרשמות משיחה טלפונית..."
                                                    value={getScreeningForJob(job).telephoneImpression}
                                                    onChange={(e) => updateTelephoneImpression(job, e.target.value)}
                                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"
                                                />
                                            </div>
                                            <div className="pt-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h5 className="font-bold text-text-muted text-xs uppercase">חוות דעת פנימית</h5>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={loadingOpinionForJobId === job.id}
                                                            onClick={(e) => { e.stopPropagation(); handleGenerateInternalOpinion(job); }}
                                                            className="text-[10px] font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 bg-primary-50 px-2 py-1 rounded-md border border-primary-100 transition-colors disabled:opacity-50"
                                                        >
                                                            <SparklesIcon className="w-3 h-3" />
                                                            {loadingOpinionForJobId === job.id ? 'מייצר...' : 'הפק חוות דעת AI'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openOpinionEditor(job);
                                                            }}
                                                            className="text-[10px] font-bold text-text-muted hover:text-text-default flex items-center gap-1 bg-bg-subtle px-2 py-1 rounded-md border border-border-default transition-colors"
                                                        >
                                                            <ArrowsPointingOutIcon className="w-3 h-3" />
                                                            ערוך והרחב
                                                        </button>
                                                        <button type="button" className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md border border-red-100 transition-colors" title="דווח על אי-דיוק">
                                                            <ExclamationTriangleIcon className="w-3 h-3" />
                                                            דווח
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-white border border-border-default rounded-xl p-4 text-sm text-text-default cursor-pointer hover:border-primary-300 transition-all shadow-sm relative group max-h-[400px] overflow-y-auto custom-scrollbar">
                                                    <div className="prose prose-sm max-w-none opacity-80" dangerouslySetInnerHTML={{ __html: internalOpinionByJobId[String(job.id)] || '<p class="text-text-muted">לחץ על &quot;הפק חוות דעת AI&quot; כדי ליצור חוות דעת.</p>' }} />
                                                    <div className="sticky bottom-0 right-0 flex justify-end pt-2">
                                                        <span className="text-[10px] font-bold text-text-muted bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-md border border-border-default">לחץ לכיווץ</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        </>
                        )}
                    </div>
                </div>

                {/* Left Pane - CV */}
                {/* Visually LEFT in RTL. Hidden on mobile. */}
                <div className="hidden md:flex w-1/2 bg-bg-card overflow-hidden flex-col">
                     <ResumeViewer resumeData={candidateResumeData} candidateId={candidateId || null} className="h-full border-none shadow-none rounded-none" />
                </div>
            </div>

            {/* Mobile Bottom Actions Bar - Only visible on mobile */}
            <div className="md:hidden absolute bottom-0 left-0 right-0 p-4 bg-bg-card border-t border-border-default flex items-center gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                 <button
                    onClick={openRejectModal}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 font-bold py-3 px-4 rounded-xl transition active:bg-red-100 disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                >
                    <NoSymbolIcon className="w-5 h-5" />
                    <span>שלול ({selectedJobs.length})</span>
                </button>
                
                <button
                    onClick={openSendCvModal}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-xl transition active:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                >
                     <span>שלח ללקוח ({selectedJobs.length})</span>
                    <PaperAirplaneIcon className="w-5 h-5" />
                </button>
            </div>

            <InternalOpinionEditorModal
                job={opinionEditJob}
                draftHtml={opinionEditDraft}
                onDraftChange={setOpinionEditDraft}
                candidateLabel={opinionEditorCandidateLabel}
                onClose={closeOpinionEditor}
                onSave={() => void handleSaveOpinionFromModal()}
                saving={opinionEditSaving}
                onRegenerate={() => void handleRegenerateOpinionInModal()}
                regenerating={opinionEditRegenerating}
                onCopy={() => void handleCopyOpinionFromModal()}
                onReport={handleReportOpinionIssue}
            />

            {rejectModalOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  className="fixed inset-0 bg-black/50 z-[10060] flex items-center justify-center p-4 animate-in fade-in duration-200"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="reject-candidate-modal-title"
                >
                  <div
                    className="bg-bg-card w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                          <NoSymbolIcon className="w-6 h-6" />
                        </div>
                        <h3 id="reject-candidate-modal-title" className="font-bold text-lg text-text-default">
                          שלילת מועמד ({selectedJobs.length})
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={closeRejectModal}
                        disabled={rejectSubmitting}
                        className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors disabled:opacity-50"
                        aria-label="סגור"
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </header>
                    <div className="p-6 space-y-4">
                      <div>
                        <label htmlFor="reject-reason" className="block text-sm font-semibold text-text-muted mb-2">
                          סיבת השלילה:
                        </label>
                        <select
                          id="reject-reason"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          disabled={rejectSubmitting}
                          className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500 focus:border-primary-500"
                        >
                          {REJECTION_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reject-notes" className="block text-sm font-semibold text-text-muted mb-2">
                          הערות נוספות:
                        </label>
                        <textarea
                          id="reject-notes"
                          rows={4}
                          placeholder="פרט את סיבת השלילה..."
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                          disabled={rejectSubmitting}
                          className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"
                        />
                      </div>
                    </div>
                    <footer className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeRejectModal}
                        disabled={rejectSubmitting}
                        className="px-6 py-2.5 font-bold text-text-muted hover:bg-bg-hover rounded-xl transition-colors disabled:opacity-50"
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmReject()}
                        disabled={rejectSubmitting}
                        className="px-8 py-2.5 font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-200 transition-all transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {rejectSubmitting ? 'שומר...' : 'שלול מועמד'}
                      </button>
                    </footer>
                  </div>
                </div>,
                document.body
              )}

            {sendCvModalOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  className="fixed inset-0 bg-black/50 z-[10070] flex items-center justify-center p-4 animate-in fade-in duration-200"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="send-cv-modal-title"
                >
                  <div
                    className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center">
                          <PaperAirplaneIcon className="w-6 h-6" />
                        </div>
                        <h3 id="send-cv-modal-title" className="font-bold text-lg text-text-default">
                          שליחת קו&quot;ח ללקוח
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={closeSendCvModal}
                        disabled={sendCvSubmitting}
                        className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors disabled:opacity-50"
                        aria-label="סגור"
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </header>
                    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar flex-1 min-h-0">
                      <div className="bg-primary-50 p-4 rounded-xl border border-primary-100">
                        <p className="text-sm text-primary-800 leading-relaxed">
                          אתה עומד לשלוח את קורות החיים של{' '}
                          <span className="font-bold">{candidateResumeData.name}</span> עבור{' '}
                          <span className="font-bold">{sendModalJobIds.length}</span> משרות. הלקוחות יקבלו את קורות החיים
                          המקוריים בצירוף חוות הדעת המקצועית שהופקה.
                        </p>
                      </div>
                      {contactsForSendLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-muted">
                          <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm font-medium">טוען אנשי קשר...</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                            משרות נבחרות ואנשי קשר:
                          </h4>
                          <div className="space-y-4">
                            {sendModalJobs.map((job) => {
                              const jid = String(job.id);
                              const contacts = contactsForSendModal[jid] || [];
                              return (
                                <div
                                  key={jid}
                                  className="p-4 bg-bg-subtle rounded-xl border border-border-default space-y-4"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-base text-text-default">{job.title}</p>
                                      <p className="text-sm text-text-muted">{job.company}</p>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => openOpinionEditorFromSendModal(job)}
                                        disabled={sendCvSubmitting}
                                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                                        title="ערוך חוות דעת"
                                      >
                                        <PencilIcon className="w-4 h-4" />
                                        <span className="hidden sm:inline">ערוך חוות דעת</span>
                                      </button>
                                      <div className="flex items-center gap-2 border-r border-border-default pr-3 mr-1">
                                        <span className="text-xs font-bold text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full border border-accent-100">
                                          {job.aiMatchScore}% התאמה
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="pt-3 border-t border-border-default/50">
                                    <p className="text-[10px] font-bold text-text-muted uppercase mb-2 tracking-wide">
                                      אנשי קשר לקבלת קו&quot;ח:
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {contacts.map((c) => {
                                        const selected = !!selectedContactsByJob[jid]?.[c.id];
                                        return (
                                          <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => toggleSendContact(jid, c.id)}
                                            disabled={sendCvSubmitting}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-xs font-medium disabled:opacity-50 ${
                                              selected
                                                ? 'bg-primary-50 border-primary-200 text-primary-700 shadow-sm'
                                                : 'bg-bg-card border-border-default text-text-muted hover:border-primary-200'
                                            }`}
                                          >
                                            <div
                                              className="rounded-full flex items-center justify-center bg-primary-100 shrink-0"
                                              style={{ width: 24, height: 24 }}
                                            >
                                              <span className="text-primary-600" style={{ fontSize: 10 }}>
                                                {getInitials(c.name || '?')}
                                              </span>
                                            </div>
                                            <div className="text-right">
                                              <p className="leading-none">{c.name}</p>
                                              {c.role ? (
                                                <p className="text-[9px] mt-0.5 text-primary-400">{c.role}</p>
                                              ) : null}
                                            </div>
                                            {selected ? (
                                              <CheckCircleIcon className="w-3.5 h-3.5 text-primary-500 ml-0.5 shrink-0" />
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                        <div className="mt-0.5 shrink-0">
                          <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600" />
                        </div>
                        <p className="text-xs text-yellow-800">
                          שים לב: מומלץ לוודא שחוות הדעת הפנימית ערוכה ומוכנה לשליחה לפני האישור.
                        </p>
                      </div>
                    </div>
                    <footer className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={closeSendCvModal}
                        disabled={sendCvSubmitting || contactsForSendLoading}
                        className="px-6 py-2.5 font-bold text-text-muted hover:bg-bg-hover rounded-xl transition-colors disabled:opacity-50"
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmSendCv()}
                        disabled={sendCvSubmitting || contactsForSendLoading}
                        className="px-8 py-2.5 font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-200 transition-all transform active:scale-95 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <span>{sendCvSubmitting ? 'שולח...' : 'אשר ושלח'}</span>
                        <PaperAirplaneIcon className="w-5 h-5" />
                      </button>
                    </footer>
                  </div>
                </div>,
                document.body
              )}
        </div>
    );
};

export default CandidateScreeningView;
