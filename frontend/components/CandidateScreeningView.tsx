import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ChevronDownIcon, NoSymbolIcon, CheckCircleIcon, MapPinIcon, SparklesIcon, PaperAirplaneIcon, AvatarIcon, ArrowLeftIcon, ArrowsPointingOutIcon, ExclamationTriangleIcon } from './Icons';
import ResumeViewer from './ResumeViewer';

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

function mapApiJobToScreeningJob(raw: any): ScreeningJob {
  const req = raw.requirements ?? [];
  const reqList = Array.isArray(req) ? req : (typeof req === 'string' ? [req] : []);
  const screening = raw.telephoneQuestions ?? raw.screeningQuestions ?? [];
  const screeningList = Array.isArray(screening)
    ? screening.map((q: any) => ({ question: typeof q === 'string' ? q : (q?.question ?? q?.text ?? ''), answer: '' }))
    : [];
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
  };
}

const CandidateScreeningView: React.FC<{
  onBack: () => void;
  candidateId?: string;
  candidate?: { fullName?: string; title?: string; professionalSummary?: string; workExperience?: any[]; skills?: any };
}> = ({ onBack, candidateId, candidate }) => {
    const [jobs, setJobs] = useState<ScreeningJob[]>([]);
    const [selectedJobs, setSelectedJobs] = useState<(number | string)[]>([]);
    const [expandedJobId, setExpandedJobId] = useState<number | string | null>(null);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [internalOpinionByJobId, setInternalOpinionByJobId] = useState<Record<string, string>>({});
    const [loadingOpinionForJobId, setLoadingOpinionForJobId] = useState<number | string | null>(null);
    const [screeningDataByJobId, setScreeningDataByJobId] = useState<Record<string, { answers: string[]; telephoneImpression: string }>>({});
    const saveTimeoutByJobRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

    const handleGenerateInternalOpinion = useCallback(
      async (job: ScreeningJob) => {
        if (!candidateId || !apiBase) {
          alert('לא זמין: יש לטעון מועמד מהמערכת.');
          return;
        }
        setLoadingOpinionForJobId(job.id);
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
          if (res.ok && data.html) {
            setInternalOpinionByJobId((prev) => ({ ...prev, [String(job.id)]: data.html }));
            const { answers, telephoneImpression } = getScreeningForJob(job);
            const screeningAnswers = (job.screeningQuestions || []).map((sq, i) => ({
              question: sq.question,
              answer: answers[i] ?? '',
            }));
            await fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                jobId: job.id,
                screeningAnswers,
                telephoneImpression,
                internalOpinion: data.html,
              }),
            });
          } else {
            alert(data.message || 'שגיאה ביצירת חוות הדעת.');
          }
        } catch (e) {
          alert('שגיאת רשת.');
        } finally {
          setLoadingOpinionForJobId(null);
        }
      },
      [candidateId, getScreeningForJob]
    );

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

    const handleRejectSelected = () => {
        if (selectedJobs.length === 0) return;
        if (window.confirm(`האם אתה בטוח שברצונך לשלול את המועמד מ-${selectedJobs.length} המשרות שנבחרו?`)) {
            setJobs(prevJobs => prevJobs.filter(job => !selectedJobs.includes(job.id)));
            setSelectedJobs([]);
            setExpandedJobId(null);
        }
    };

    const allSelected = useMemo(() => jobs.length > 0 && selectedJobs.length === jobs.length, [jobs, selectedJobs]);

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2);

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
                        onClick={handleRejectSelected}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-red-50 text-red-600 font-semibold py-2 px-4 rounded-lg hover:bg-red-100 transition shadow-sm disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                    >
                        <NoSymbolIcon className="w-5 h-5" />
                        <span>שלול ({selectedJobs.length})</span>
                    </button>
                    
                    <button
                        onClick={() => alert('Sending CV for selected jobs and moving to the next candidate... (simulation)')}
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
                                                        <button type="button" className="text-[10px] font-bold text-text-muted hover:text-text-default flex items-center gap-1 bg-bg-subtle px-2 py-1 rounded-md border border-border-default transition-colors">
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
                     <ResumeViewer resumeData={mockResumeData} className="h-full border-none shadow-none rounded-none" />
                </div>
            </div>

            {/* Mobile Bottom Actions Bar - Only visible on mobile */}
            <div className="md:hidden absolute bottom-0 left-0 right-0 p-4 bg-bg-card border-t border-border-default flex items-center gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                 <button
                    onClick={handleRejectSelected}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 font-bold py-3 px-4 rounded-xl transition active:bg-red-100 disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                >
                    <NoSymbolIcon className="w-5 h-5" />
                    <span>שלול ({selectedJobs.length})</span>
                </button>
                
                <button
                    onClick={() => alert('Sending CV for selected jobs...')}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-xl transition active:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                >
                     <span>שלח ללקוח ({selectedJobs.length})</span>
                    <PaperAirplaneIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default CandidateScreeningView;
