import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, ChevronRightIcon, CheckCircleIcon, NoSymbolIcon, XMarkIcon } from './Icons';
import ResumeViewer from './ResumeViewer';
import JobDetailsDrawer from './JobDetailsDrawer';
import { buildResumeDataFromCandidate } from './CandidateScreeningView';
import { useLanguage } from '../context/LanguageContext';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

type PoolRow = {
    candidate: Record<string, unknown>;
    jobCandidateId: string;
    path: number | null;
    reasons: string[];
    matchPercentage?: number;
};

export default function JobScreeningView() {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { t } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [job, setJob] = useState<Record<string, unknown> | null>(null);
    const [included, setIncluded] = useState<PoolRow[]>([]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [feedback, setFeedback] = useState('');
    const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);

    useEffect(() => {
        const base = apiBase();
        if (!jobId || !base) {
            setLoading(false);
            setJob(null);
            setIncluded([]);
            setError(!base ? t('job_screening.load_error') : null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        fetch(`${base}/api/jobs/${encodeURIComponent(jobId)}/screening-pool`, {
            headers,
            cache: 'no-store',
        })
            .then(async (res) => {
                if (res.status === 404) throw new Error('404');
                if (!res.ok) throw new Error('fetch');
                return res.json();
            })
            .then((data: { job?: Record<string, unknown>; included?: PoolRow[] }) => {
                if (cancelled) return;
                setJob(data.job && typeof data.job === 'object' ? data.job : null);
                setIncluded(Array.isArray(data.included) ? data.included : []);
                setCurrentIndex(0);
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    setJob(null);
                    setIncluded([]);
                    setError(e instanceof Error && e.message === '404' ? t('job_screening.job_missing') : t('job_screening.load_error'));
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [jobId, t]);

    const currentRow = included[currentIndex];
    const currentCandidate = currentRow?.candidate;

    const telephoneQuestions = useMemo(() => {
        const q = job?.telephoneQuestions;
        if (!Array.isArray(q)) return [];
        return q.map((item: unknown, i: number) => {
            if (typeof item === 'string') {
                return { id: String(i), question: item };
            }
            const o = item as Record<string, unknown>;
            return {
                id: String(o?.id ?? o?.order ?? i),
                question: String(o?.question ?? o?.text ?? ''),
            };
        });
    }, [job]);

    const resumeData = useMemo(() => {
        if (!currentCandidate || typeof currentCandidate !== 'object') {
            return buildResumeDataFromCandidate(undefined, undefined);
        }
        const cid = currentCandidate.id != null ? String(currentCandidate.id) : '';
        return buildResumeDataFromCandidate(currentCandidate as Parameters<typeof buildResumeDataFromCandidate>[0], cid || undefined);
    }, [currentCandidate]);

    const handleNext = () => {
        if (currentIndex < included.length - 1) {
            setCurrentIndex((i) => i + 1);
            resetForm();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex((i) => i - 1);
            resetForm();
        }
    };

    const resetForm = () => {
        setAnswers({});
        setFeedback('');
    };

    const handleAnswerChange = (questionId: string, answer: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    };

    const jobTitle = job ? String(job.title ?? '') : '';
    const jobClient = job ? String(job.client ?? '') : '';
    const editJobParam = job?.id != null ? String(job.id) : jobId || '';

    const handlePass = () => {
        if (currentCandidate) {
            const name = String((currentCandidate as { fullName?: string }).fullName ?? '');
            console.log(`${name} passed`, { answers, feedback, jobCandidateId: currentRow?.jobCandidateId });
        }
        handleNext();
    };

    const handleFail = () => {
        if (currentCandidate) {
            const name = String((currentCandidate as { fullName?: string }).fullName ?? '');
            console.log(`${name} failed`, { answers, feedback, jobCandidateId: currentRow?.jobCandidateId });
        }
        handleNext();
    };

    if (!jobId) {
        return <div className="p-6 text-text-muted">{t('job_screening.job_missing')}</div>;
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[320px] text-text-muted">
                <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                {t('job_screening.loading')}
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="p-6">
                <p className="text-red-600">{error || t('job_screening.job_missing')}</p>
                <button type="button" onClick={() => navigate('/jobs')} className="mt-4 text-primary-600 underline">
                    {t('job_screening.back_jobs')}
                </button>
            </div>
        );
    }

    if (included.length === 0) {
        return (
            <div className="p-8">
                <h1 className="text-xl font-bold text-text-default">{jobTitle || '—'}</h1>
                <p className="text-text-muted mt-2">{t('job_screening.empty_pool')}</p>
                <button
                    type="button"
                    onClick={() => navigate(editJobParam ? `/jobs/edit/${editJobParam}` : '/jobs')}
                    className="mt-6 text-primary-600 underline"
                >
                    {t('job_screening.edit_job')}
                </button>
            </div>
        );
    }

    if (!currentCandidate) {
        return (
            <div className="p-6 text-text-muted">
                {t('job_screening.empty_pool')}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-bg-default -m-6">
            <header className="flex items-center justify-between p-4 bg-bg-card border-b border-border-default flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-text-default">
                        {t('job_screening.title_prefix')}{' '}
                        <button
                            type="button"
                            onClick={() => setIsJobDrawerOpen(true)}
                            className="text-primary-600 hover:underline focus:outline-none"
                        >
                            {jobTitle}
                        </button>
                    </h1>
                    <p className="text-sm text-text-muted">
                        {t('job_screening.client_label')} {jobClient || '—'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate(editJobParam ? `/jobs/edit/${editJobParam}` : '/jobs')}
                    className="p-2 rounded-full text-text-muted hover:bg-bg-hover"
                    aria-label={t('job_screening.edit_job')}
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </header>

            <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-px bg-border-default overflow-y-auto">
                <div className="bg-bg-card overflow-y-auto">
                    <ResumeViewer resumeData={resumeData} />
                </div>

                <div className="bg-bg-card p-4 overflow-y-auto flex flex-col">
                    <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-text-default">{t('job_screening.questionnaire_title')}</h2>
                            {currentRow?.path === 2 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                                    {t('screening.path_badge_2')}
                                </span>
                            )}
                            {currentRow?.path === 1 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200">
                                    {t('screening.path_badge_1')}
                                </span>
                            )}
                            {currentRow?.path === 3 && (
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200">
                                    {t('screening.path_badge_3')}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={currentIndex === 0}
                                className="p-3 rounded-full bg-bg-card border border-border-default text-text-default hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRightIcon className="w-6 h-6" />
                            </button>
                            <span className="font-bold text-text-default text-lg tabular-nums">
                                ({currentIndex + 1} / {included.length})
                            </span>
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={currentIndex === included.length - 1}
                                className="p-3 rounded-full bg-bg-card border border-border-default text-text-default hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowLeftIcon className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                    <div className="space-y-4 flex-grow">
                        {telephoneQuestions.map((q) => (
                            <div key={q.id}>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{q.question}</label>
                                <textarea
                                    value={answers[q.id] || ''}
                                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                    rows={3}
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                    placeholder={t('job_screening.answer_placeholder')}
                                />
                            </div>
                        ))}
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('job_screening.feedback_label')}</label>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                rows={4}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                placeholder={t('job_screening.feedback_placeholder')}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end items-center gap-3 pt-4 flex-shrink-0">
                        <button
                            type="button"
                            onClick={handleFail}
                            className="flex items-center gap-2 bg-red-500 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-600 transition shadow-sm"
                        >
                            <NoSymbolIcon className="w-5 h-5" />
                            <span>{t('job_screening.fail')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handlePass}
                            className="flex items-center gap-2 bg-green-500 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-600 transition shadow-sm"
                        >
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>{t('job_screening.pass')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <JobDetailsDrawer job={job as never} isOpen={isJobDrawerOpen} onClose={() => setIsJobDrawerOpen(false)} />
        </div>
    );
}
