
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    PlusIcon,
    PencilIcon,
    TrashIcon,
    DocumentTextIcon,
    MagnifyingGlassIcon,
    BellIcon,
    ExclamationTriangleIcon,
    VideoCameraIcon,
    CheckCircleIcon,
} from './Icons';
import AddApplicationModal, { type ApplicationFormValues } from './AddApplicationModal';
import CandidateScreeningWizard, { type ScreeningQuestion } from './CandidateScreeningWizard';
import { authHeaders } from '../utils/authHeaders';
import {
    formatApplicationJobTitle,
    isDigitalScreeningComplete,
    mapJobQuestionsToWizard,
    wizardAnswersToDigitalRows,
    type DigitalAnswerRow,
    type JobDigitalQuestion,
    type ScreeningDataByJob,
} from '../utils/digitalScreening';

interface JobOption {
    id: string;
    title: string;
    client?: string;
    digitalQuestions?: JobDigitalQuestion[];
}

export type PendingDigitalScreeningTask = {
    id: string;
    jobId: string;
    jobTitle: string;
    type: 'screening';
    data: {
        jobTitle: string;
        questions: ScreeningQuestion[];
        digitalQuestions: JobDigitalQuestion[];
    };
};

type EmailUploadRow = {
    id: number | string;
    candidateId?: string | null;
    jobId?: string | null;
    fileKey?: string | null;
    subject?: string | null;
    from?: string | null;
    createdAt?: string | null;
    userNotes?: string | null;
    job?: JobOption | null;
};

interface ApplicationRecord {
    id: string;
    candidateId: string;
    jobId?: string | null;
    company: string;
    role: string;
    status: string;
    applicationDate?: string | null;
    link?: string | null;
    cvFile?: string | null;
    fileKey?: string | null;
    notes?: string | null;
    job?: JobOption | null;
    date?: string;
    source?: 'manual' | 'email' | 'portal';
    readOnly?: boolean;
}

type PortalLinkedJobRow = {
    jobCandidateId?: string | number;
    jobId?: string | null;
    candidateId?: string;
    status?: string | null;
    source?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    job?: JobOption | null;
};

const PORTAL_LINK_SOURCES = new Set(['candidate_portal', 'job_matching']);

interface CandidateApplicationsViewProps {
    candidateId?: string | null;
    /** All profile version ids for the same portal user — aggregates email + manual submissions. */
    relatedProfileIds?: string[];
    /** Reload list when the applications tab becomes visible. */
    isActive?: boolean;
    /** Bump after portal apply so the list refreshes without a full page reload. */
    refreshToken?: number;
    /** Notifies parent (sidebar badge / urgent tasks) when pending digital screenings change. */
    onPendingDigitalScreeningsChange?: (tasks: PendingDigitalScreeningTask[]) => void;
    /** When parent sidebar triggers a task, open that application's wizard. */
    externalScreeningTaskId?: string | null;
    onExternalScreeningTaskHandled?: () => void;
}

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function normalizeDate(value?: string | null): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
}

function mapManualApplication(app: ApplicationRecord): ApplicationRecord {
    const job = app.job || undefined;
    return {
        ...app,
        source: 'manual',
        readOnly: false,
        company: String(app.company || job?.client || '').trim() || '—',
        role: String(app.role || job?.title || '').trim() || '—',
        date: app.applicationDate ? normalizeDate(app.applicationDate) : app.date || normalizeDate(null),
    };
}

function fileNameFromKey(fileKey?: string | null): string {
    const key = String(fileKey || '').trim();
    if (!key) return '';
    const base = key.split('/').pop() || key;
    try {
        return decodeURIComponent(base);
    } catch {
        return base;
    }
}

function filenameFromContentDisposition(header: string | null, fallback: string): string {
    if (!header) return fallback;
    const star = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (star?.[1]) {
        try {
            return decodeURIComponent(star[1]);
        } catch {
            // ignore
        }
    }
    const plain = header.match(/filename="?([^";]+)"?/i);
    return plain?.[1] || fallback;
}

function mapPortalLinkedJobToApplication(row: PortalLinkedJobRow): ApplicationRecord | null {
    const candidateId = row.candidateId ? String(row.candidateId) : '';
    const jobId = row.jobId != null ? String(row.jobId).trim() : '';
    const source = String(row.source || '').trim();
    if (!candidateId || !jobId || !PORTAL_LINK_SOURCES.has(source)) return null;

    const job = row.job || undefined;
    return {
        id: `portal-${row.jobCandidateId || `${candidateId}-${jobId}`}`,
        candidateId,
        jobId,
        company: String(job?.client || '').trim() || '—',
        role: String(job?.title || '').trim() || '—',
        status: source === 'candidate_portal' ? 'הוגש מהפורטל' : String(row.status || 'נשלח').trim() || 'נשלח',
        applicationDate: row.createdAt || row.updatedAt || null,
        date: normalizeDate(row.createdAt || row.updatedAt),
        link: null,
        cvFile: null,
        notes: '',
        job: job || null,
        source: 'portal',
        readOnly: true,
    };
}

function mapEmailUploadToApplication(upload: EmailUploadRow): ApplicationRecord | null {
    const candidateId = upload.candidateId ? String(upload.candidateId) : '';
    if (!candidateId) return null;
    const jobId = upload.jobId != null ? String(upload.jobId).trim() : '';
    const job = upload.job || undefined;
    const subject = String(upload.subject || '').trim();
    const fileName = fileNameFromKey(upload.fileKey);
    const jobIdLabel = String(upload.jobId || '').trim();
    const cvLabel =
        fileName && fileName !== jobIdLabel
            ? fileName
            : subject || 'קורות חיים ממייל';
    const company = String(job?.client || '').trim() || '—';
    const role = String(job?.title || '').trim() || '—';
    return {
        id: `email-${upload.id}`,
        candidateId,
        jobId: job?.id ? String(job.id) : jobId || null,
        company,
        role,
        status: 'נקלט ממייל',
        applicationDate: upload.createdAt || null,
        date: normalizeDate(upload.createdAt),
        link: null,
        cvFile: cvLabel,
        fileKey: String(upload.fileKey || '').trim() || null,
        notes: String(upload.userNotes || '').trim(),
        job: job || null,
        source: 'email',
        readOnly: true,
    };
}

function looksLikeOpaqueFileToken(value: string): boolean {
    const label = String(value || '').trim();
    if (!label || label.length < 16) return false;
    if (/[\s\u0590-\u05FF]/.test(label)) return false;
    return /^[a-z0-9._-]+$/i.test(label);
}

function emailApplicationDisplayScore(app: ApplicationRecord): number {
    const label = String(app.cvFile || '').trim();
    let score = Math.min(label.length, 200);
    if (looksLikeOpaqueFileToken(label)) score -= 500;
    if (/קורות\s*חיים/i.test(label)) score += 40;
    if ((app.notes || '').trim()) score += 10;
    const uploadNum = Number(String(app.id).replace(/^email-/, '')) || 0;
    return score * 1000 + uploadNum;
}

function pickPreferredEmailApplication(apps: ApplicationRecord[]): ApplicationRecord {
    return [...apps].sort(
        (a, b) => emailApplicationDisplayScore(b) - emailApplicationDisplayScore(a),
    )[0];
}

/** Collapse mirror rows, double-ingest, and subject vs fileKey label pairs for the same submission. */
function dedupeEmailApplications(apps: ApplicationRecord[]): ApplicationRecord[] {
    if (!apps.length) return [];

    const afterFileKey = new Map<string, ApplicationRecord[]>();
    const withoutFileKey: ApplicationRecord[] = [];
    for (const app of apps) {
        const fileKey = String(app.fileKey || '').trim();
        if (fileKey) {
            const bucket = afterFileKey.get(fileKey) || [];
            bucket.push(app);
            afterFileKey.set(fileKey, bucket);
        } else {
            withoutFileKey.push(app);
        }
    }
    const fileKeyDeduped = [
        ...[...afterFileKey.values()].map(pickPreferredEmailApplication),
        ...withoutFileKey,
    ];

    const byJobDay = new Map<string, ApplicationRecord[]>();
    for (const app of fileKeyDeduped) {
        const jobId = String(app.jobId || '').trim();
        const day = String(app.date || '').slice(0, 10);
        const groupKey = jobId ? `job::${jobId}::${day}` : `id::${app.id}`;
        const bucket = byJobDay.get(groupKey) || [];
        bucket.push(app);
        byJobDay.set(groupKey, bucket);
    }

    return [...byJobDay.values()].map((group) =>
        group.length === 1 ? group[0] : pickPreferredEmailApplication(group),
    );
}

const CandidateApplicationsView: React.FC<CandidateApplicationsViewProps> = ({
    candidateId,
    relatedProfileIds = [],
    isActive = true,
    refreshToken = 0,
    onPendingDigitalScreeningsChange,
    externalScreeningTaskId,
    onExternalScreeningTaskHandled,
}) => {
    const [applications, setApplications] = useState<ApplicationRecord[]>([]);
    const [screeningDataByJob, setScreeningDataByJob] = useState<ScreeningDataByJob>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<ApplicationFormValues | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
    const [downloadingCvId, setDownloadingCvId] = useState<string | null>(null);
    const [notesBaseline, setNotesBaseline] = useState<Record<string, string>>({});
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeScreeningApp, setActiveScreeningApp] = useState<ApplicationRecord | null>(null);
    const [isSubmittingScreening, setIsSubmittingScreening] = useState(false);

    const profileIdsKey = useMemo(() => {
        const ids = new Set<string>();
        const primary = candidateId != null ? String(candidateId).trim() : '';
        if (primary) ids.add(primary);
        for (const id of relatedProfileIds) {
            const s = String(id || '').trim();
            if (s) ids.add(s);
        }
        return [...ids].sort().join(',');
    }, [candidateId, relatedProfileIds]);

    const loadApplications = useCallback(async () => {
        if (!profileIdsKey) {
            setApplications([]);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const base = apiBase();
            const qs = encodeURIComponent(profileIdsKey);
            const headers = authHeaders();
            const primaryCandidateId = profileIdsKey.split(',')[0] || candidateId || '';
            const [manualRes, emailRes, screeningRes] = await Promise.all([
                fetch(`${base}/api/applications?candidateIds=${qs}`, {
                    headers,
                    credentials: 'include',
                }),
                fetch(`${base}/api/email-uploads/by-candidates?candidateIds=${qs}`, {
                    headers,
                    credentials: 'include',
                }),
                primaryCandidateId
                    ? fetch(`${base}/api/candidates/${encodeURIComponent(primaryCandidateId)}/screening-data`, {
                          headers,
                          credentials: 'include',
                          cache: 'no-store',
                      })
                    : Promise.resolve(null),
            ]);
            if (!manualRes.ok) throw new Error('Failed to load applications');
            const manualPayload = await manualRes.json();
            const manualApps = Array.isArray(manualPayload)
                ? manualPayload.map((row) => mapManualApplication(row as ApplicationRecord))
                : [];

            let emailApps: ApplicationRecord[] = [];
            if (emailRes.ok) {
                const emailPayload = await emailRes.json();
                if (Array.isArray(emailPayload)) {
                    emailApps = dedupeEmailApplications(
                        emailPayload
                            .map((row) => mapEmailUploadToApplication(row as EmailUploadRow))
                            .filter((row): row is ApplicationRecord => Boolean(row)),
                    );
                }
            } else {
                console.warn('[CandidateApplicationsView] email uploads batch failed', emailRes.status);
            }

            const manualJobKeys = new Set(
                manualApps.map((a) => `${a.candidateId}::${a.jobId || ''}::${a.date || ''}`),
            );
            const manualJobIds = new Set(
                manualApps.filter((a) => a.jobId).map((a) => `${a.candidateId}::${a.jobId}`),
            );
            const emailOnly = emailApps.filter((app) => {
                const key = `${app.candidateId}::${app.jobId || ''}::${app.date || ''}`;
                if (app.jobId && manualJobKeys.has(key)) return false;
                return true;
            });

            const portalApps: ApplicationRecord[] = [];
            const candidateIds = profileIdsKey.split(',').filter(Boolean);
            await Promise.all(
                candidateIds.map(async (cid) => {
                    try {
                        const linkedRes = await fetch(
                            `${base}/api/candidates/${encodeURIComponent(cid)}/linked-jobs`,
                            { headers, credentials: 'include', cache: 'no-store' },
                        );
                        if (!linkedRes.ok) return;
                        const linkedPayload = await linkedRes.json();
                        if (!Array.isArray(linkedPayload)) return;
                        for (const row of linkedPayload) {
                            const mapped = mapPortalLinkedJobToApplication(row as PortalLinkedJobRow);
                            if (!mapped) continue;
                            const dedupeKey = `${mapped.candidateId}::${mapped.jobId}`;
                            if (manualJobIds.has(dedupeKey)) continue;
                            portalApps.push(mapped);
                        }
                    } catch (linkedErr) {
                        console.warn('[CandidateApplicationsView] linked-jobs fetch failed', cid, linkedErr);
                    }
                }),
            );
            const portalDeduped = portalApps.filter((app, index, arr) => {
                const key = `${app.candidateId}::${app.jobId}`;
                return arr.findIndex((other) => `${other.candidateId}::${other.jobId}` === key) === index;
            });

            const combined = [...manualApps, ...emailOnly, ...portalDeduped].sort((a, b) => {
                const aTime = Date.parse(String(a.date || '')) || 0;
                const bTime = Date.parse(String(b.date || '')) || 0;
                return bTime - aTime;
            });
            setApplications(combined);
            if (screeningRes?.ok) {
                const screeningPayload = (await screeningRes.json()) as ScreeningDataByJob;
                setScreeningDataByJob(screeningPayload && typeof screeningPayload === 'object' ? screeningPayload : {});
            } else {
                setScreeningDataByJob({});
            }
            const baseline: Record<string, string> = {};
            for (const app of combined) {
                baseline[app.id] = app.notes || '';
            }
            setNotesBaseline(baseline);
        } catch (err) {
            console.error('[CandidateApplicationsView] loadApplications', err);
            setLoadError(err instanceof Error ? err.message : 'טעינת הגשות נכשלה');
        } finally {
            setIsLoading(false);
        }
    }, [profileIdsKey, candidateId]);

    useEffect(() => {
        void loadApplications();
    }, [loadApplications, refreshToken]);

    useEffect(() => {
        if (isActive) void loadApplications();
    }, [isActive, loadApplications]);

    const getDigitalQuestionsForApp = useCallback((app: ApplicationRecord): JobDigitalQuestion[] => {
        const fromJob = Array.isArray(app.job?.digitalQuestions) ? app.job!.digitalQuestions! : [];
        return fromJob.filter((q) => String(q?.text || '').trim());
    }, []);

    const getDigitalAnswersForApp = useCallback(
        (app: ApplicationRecord): DigitalAnswerRow[] => {
            const jobId = app.jobId ? String(app.jobId) : '';
            if (!jobId) return [];
            return screeningDataByJob[jobId]?.digitalAnswers || [];
        },
        [screeningDataByJob],
    );

    const isAppDigitalScreeningPending = useCallback(
        (app: ApplicationRecord): boolean => {
            const questions = getDigitalQuestionsForApp(app);
            if (!questions.length) return false;
            return !isDigitalScreeningComplete(questions, getDigitalAnswersForApp(app));
        },
        [getDigitalAnswersForApp, getDigitalQuestionsForApp],
    );

    const pendingDigitalTasks = useMemo((): PendingDigitalScreeningTask[] => {
        return applications
            .filter((app) => app.jobId && isAppDigitalScreeningPending(app))
            .map((app) => {
                const digitalQuestions = getDigitalQuestionsForApp(app);
                const jobTitle = formatApplicationJobTitle(app);
                return {
                    id: app.id,
                    jobId: String(app.jobId),
                    jobTitle,
                    type: 'screening' as const,
                    data: {
                        jobTitle,
                        questions: mapJobQuestionsToWizard(digitalQuestions),
                        digitalQuestions,
                    },
                };
            });
    }, [applications, getDigitalQuestionsForApp, isAppDigitalScreeningPending]);

    useEffect(() => {
        onPendingDigitalScreeningsChange?.(pendingDigitalTasks);
    }, [pendingDigitalTasks, onPendingDigitalScreeningsChange]);

    useEffect(() => {
        if (!externalScreeningTaskId) return;
        const app = applications.find((row) => row.id === externalScreeningTaskId);
        if (app && isAppDigitalScreeningPending(app)) {
            setActiveScreeningApp(app);
            onExternalScreeningTaskHandled?.();
        }
    }, [externalScreeningTaskId, applications, isAppDigitalScreeningPending, onExternalScreeningTaskHandled]);

    const openScreeningWizard = (app: ApplicationRecord) => {
        if (!isAppDigitalScreeningPending(app)) return;
        setActiveScreeningApp(app);
    };

    const handleScreeningSubmit = async (answers: Record<number, unknown>) => {
        if (!activeScreeningApp?.jobId || !candidateId) return;
        const digitalQuestions = getDigitalQuestionsForApp(activeScreeningApp);
        const digitalAnswers = wizardAnswersToDigitalRows(digitalQuestions, answers);
        setIsSubmittingScreening(true);
        setLoadError(null);
        try {
            const base = apiBase();
            const res = await fetch(
                `${base}/api/candidates/${encodeURIComponent(String(candidateId))}/screening-data`,
                {
                    method: 'PUT',
                    headers: authHeaders(true),
                    credentials: 'include',
                    body: JSON.stringify({
                        jobId: activeScreeningApp.jobId,
                        digitalAnswers,
                    }),
                },
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'שמירת שאלון נכשלה');
            }
            const payload = await res.json();
            setScreeningDataByJob((prev) => ({
                ...prev,
                [String(activeScreeningApp.jobId)]: {
                    ...prev[String(activeScreeningApp.jobId)],
                    digitalAnswers: payload.digitalAnswers || digitalAnswers,
                },
            }));
            setActiveScreeningApp(null);
        } catch (err) {
            console.error('[CandidateApplicationsView] handleScreeningSubmit', err);
            setLoadError(err instanceof Error ? err.message : 'שמירת שאלון נכשלה');
        } finally {
            setIsSubmittingScreening(false);
        }
    };

    const saveApplication = async (formData: ApplicationFormValues) => {
        if (!candidateId) return;
        setIsSaving(true);
        setLoadError(null);
        try {
            const base = apiBase();
            const payload = {
                candidateId: String(candidateId),
                jobId: formData.jobId || null,
                company: formData.company,
                role: formData.role,
                link: formData.link,
                cvFile: formData.cvFile,
                notes: formData.notes,
                status: formData.status || 'נשלח',
                applicationDate: formData.date,
            };
            if (formData.id) {
                const res = await fetch(`${base}/api/applications/${formData.id}`, {
                    method: 'PUT',
                    headers: authHeaders(true),
                    credentials: 'include',
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'Failed to update application');
                }
            } else {
                const res = await fetch(`${base}/api/applications`, {
                    method: 'POST',
                    headers: authHeaders(true),
                    credentials: 'include',
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'Failed to save application');
                }
            }
            await loadApplications();
            setIsModalOpen(false);
            setEditingApp(null);
        } catch (err) {
            console.error('[CandidateApplicationsView] saveApplication', err);
            setLoadError(err instanceof Error ? err.message : 'שמירת הגשה נכשלה');
        } finally {
            setIsSaving(false);
        }
    };

    const handleNotesChange = (appId: string, notes: string) => {
        setApplications((prev) => prev.map((app) => (app.id === appId ? { ...app, notes } : app)));
    };

    const saveNotes = async (app: ApplicationRecord, notes: string) => {
        const baseline = notesBaseline[app.id] ?? '';
        if (notes === baseline) return;

        setSavingNotesId(app.id);
        setLoadError(null);
        try {
            const base = apiBase();
            if (app.source === 'email') {
                const uploadId = app.id.replace(/^email-/, '');
                const res = await fetch(`${base}/api/email-uploads/${encodeURIComponent(uploadId)}/notes`, {
                    method: 'PATCH',
                    headers: authHeaders(true),
                    credentials: 'include',
                    body: JSON.stringify({ userNotes: notes }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'Failed to save notes');
                }
            } else {
                const res = await fetch(`${base}/api/applications/${encodeURIComponent(app.id)}`, {
                    method: 'PUT',
                    headers: authHeaders(true),
                    credentials: 'include',
                    body: JSON.stringify({
                        candidateId: app.candidateId,
                        jobId: app.jobId || null,
                        company: app.company,
                        role: app.role,
                        link: app.link,
                        cvFile: app.cvFile,
                        notes,
                        status: app.status,
                        applicationDate: app.date,
                    }),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.message || 'Failed to save notes');
                }
            }
            setNotesBaseline((prev) => ({ ...prev, [app.id]: notes }));
            setApplications((prev) => prev.map((row) => (row.id === app.id ? { ...row, notes } : row)));
        } catch (err) {
            console.error('[CandidateApplicationsView] saveNotes', err);
            setLoadError(err instanceof Error ? err.message : 'שמירת הערות נכשלה');
            setApplications((prev) =>
                prev.map((row) => (row.id === app.id ? { ...row, notes: baseline } : row)),
            );
        } finally {
            setSavingNotesId(null);
        }
    };

    const handleDownloadCv = async (app: ApplicationRecord) => {
        if (app.source !== 'email') return;
        const uploadId = app.id.replace(/^email-/, '');
        if (!uploadId) return;

        setDownloadingCvId(app.id);
        setLoadError(null);
        try {
            const base = apiBase();
            const res = await fetch(`${base}/api/email-uploads/${encodeURIComponent(uploadId)}/resume`, {
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Failed to download resume');
            }
            const blob = await res.blob();
            const filename = filenameFromContentDisposition(
                res.headers.get('Content-Disposition'),
                app.cvFile || 'resume.pdf',
            );
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (err) {
            console.error('[CandidateApplicationsView] handleDownloadCv', err);
            setLoadError(err instanceof Error ? err.message : 'הורדת קובץ נכשלה');
        } finally {
            setDownloadingCvId(null);
        }
    };

    const handleDelete = async (appId: string) => {
        if (appId.startsWith('email-')) return;
        if (!window.confirm('האם למחוק הגשה זו?')) return;
        try {
            const base = apiBase();
            const res = await fetch(`${base}/api/applications/${appId}`, {
                method: 'DELETE',
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to delete application');
            await loadApplications();
        } catch (err) {
            console.error('[CandidateApplicationsView] handleDelete', err);
            setLoadError(err instanceof Error ? err.message : 'מחיקה נכשלה');
        }
    };

    const filteredApps = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return applications;
        return applications.filter((app) => {
            const company = app.company?.toLowerCase() || '';
            const role = app.role?.toLowerCase() || '';
            const jobTitle = app.job?.title?.toLowerCase() || '';
            return company.includes(term) || role.includes(term) || jobTitle.includes(term);
        });
    }, [applications, searchTerm]);

    const openNewModal = () => {
        if (!candidateId) {
            window.alert('שמור את הפרופיל או בחר מועמד כדי להוסיף הגשות.');
            return;
        }
        setEditingApp(null);
        setIsModalOpen(true);
    };

    const openEditModal = (app: ApplicationRecord) => {
        if (app.readOnly || app.source === 'email') return;
        setEditingApp({
            id: app.id,
            jobId: app.jobId || '',
            company: app.company,
            role: app.role,
            link: app.link || '',
            cvFile: app.cvFile || '',
            date: app.date || new Date().toISOString().slice(0, 10),
            notes: app.notes || '',
            status: app.status || 'נשלח',
        });
        setIsModalOpen(true);
    };

    if (!candidateId) {
        return (
            <div className="space-y-6 animate-fade-in text-center py-16">
                <p className="text-lg font-bold text-text-default">
                    כדי לנהל הגשות, שמור את הפרופיל או בחר מועמד קיים.
                </p>
                <p className="text-text-muted">
                    אין עדיין מזהה מועמד פעיל לשמירת הגשות. חזור לאחר ששמרת את הפרופיל.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-2 py-4">
                <h1 className="text-3xl font-black text-text-default tracking-tight">פנקס הגשות</h1>
                <p className="text-text-muted text-lg">נהל/י ועקוב/י אחר כל הגשות המועמדות שלך למשרות במקום אחד.</p>
            </div>

            {loadError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 px-4 py-3">
                    {loadError}
                </div>
            ) : null}

            {pendingDigitalTasks.length > 0 ? (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 animate-fade-in">
                    <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BellIcon className="w-4 h-4" />
                        משימות דחופות
                    </h4>
                    <div className="space-y-3">
                        {pendingDigitalTasks.map((task) => (
                            <div key={task.id} className="bg-white p-3 rounded-xl shadow-sm border border-red-100/50">
                                <div className="flex items-start gap-2 mb-2">
                                    <div className="mt-0.5 min-w-[16px]">
                                        <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-800 leading-tight">שאלון סינון</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{task.jobTitle}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const app = applications.find((row) => row.id === task.id);
                                        if (app) openScreeningWizard(app);
                                    }}
                                    className="w-full bg-red-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-1.5"
                                >
                                    <VideoCameraIcon className="w-3 h-3" />
                                    בצע כעת
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="חיפוש לפי חברה או משרה..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-card border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                    />
                </div>
                <button
                    onClick={openNewModal}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20"
                >
                    <PlusIcon className="w-5 h-5" />
                    <span>הוסף הגשה חדשה</span>
                </button>
            </div>

            <div className="bg-bg-card border border-border-default rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-bg-subtle/50 border-b border-border-default text-xs font-bold text-text-muted uppercase tracking-wider">
                                <th className="px-6 py-4">תאריך הגשה</th>
                                <th className="px-6 py-4">חברה</th>
                                <th className="px-6 py-4">משרה</th>
                                <th className="px-6 py-4">סטטוס</th>
                                <th className="px-6 py-4">שאלון דיגיטלי</th>
                                <th className="px-6 py-4">לינק</th>
                                <th className="px-6 py-4">קובץ קו"ח</th>
                                <th className="px-6 py-4">הערות</th>
                                <th className="px-6 py-4 text-center">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-text-muted">
                                        טוען הגשות...
                                    </td>
                                </tr>
                            ) : filteredApps.length > 0 ? (
                                filteredApps.map((app) => (
                                    <tr key={app.id} className="group hover:bg-bg-subtle/30 transition-colors text-sm">
                                        <td className="px-6 py-4 font-mono text-text-default">{app.date}</td>
                                        <td className="px-6 py-4 font-bold text-text-default">{app.company}</td>
                                        <td className="px-6 py-4 text-text-default">
                                            {app.role}
                                            {app.job?.title && app.job.title !== app.role ? (
                                                <div className="text-xs text-text-muted mt-1">
                                                    ({app.job.title})
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`px-2 py-1 rounded-md text-xs font-bold ${
                                                    app.source === 'email'
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : app.source === 'portal'
                                                          ? 'bg-emerald-50 text-emerald-700'
                                                          : 'bg-primary-50 text-primary-700'
                                                }`}
                                            >
                                                {app.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const digitalQuestions = getDigitalQuestionsForApp(app);
                                                if (!digitalQuestions.length) {
                                                    return <span className="text-text-subtle">—</span>;
                                                }
                                                const complete = isDigitalScreeningComplete(
                                                    digitalQuestions,
                                                    getDigitalAnswersForApp(app),
                                                );
                                                if (complete) {
                                                    return (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold bg-green-50 text-green-700">
                                                            <CheckCircleIcon className="w-3.5 h-3.5" />
                                                            הושלם
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => openScreeningWizard(app)}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 transition"
                                                    >
                                                        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                                        ממתין — בצע כעת
                                                    </button>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {app.link ? (
                                                <a
                                                    href={app.link}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-primary-600 hover:text-primary-800 font-medium hover:underline flex items-center gap-1"
                                                >
                                                    פתח לינק
                                                </a>
                                            ) : (
                                                <span className="text-text-subtle">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-text-muted">
                                            {app.cvFile ? (
                                                app.source === 'email' ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDownloadCv(app)}
                                                        disabled={downloadingCvId === app.id}
                                                        className="flex items-center gap-2 text-primary-600 hover:text-primary-800 hover:underline disabled:opacity-60 max-w-xs truncate"
                                                        title="הורד קובץ"
                                                    >
                                                        <DocumentTextIcon className="w-4 h-4 shrink-0 text-text-subtle" />
                                                        <span className="truncate">
                                                            {downloadingCvId === app.id ? 'מוריד...' : app.cvFile}
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-2 max-w-xs truncate">
                                                        <DocumentTextIcon className="w-4 h-4 shrink-0 text-text-subtle" />
                                                        <span className="truncate">{app.cvFile}</span>
                                                    </div>
                                                )
                                            ) : (
                                                '-'
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <textarea
                                                rows={2}
                                                value={app.notes || ''}
                                                onChange={(e) => handleNotesChange(app.id, e.target.value)}
                                                onBlur={(e) => void saveNotes(app, e.target.value)}
                                                disabled={savingNotesId === app.id || app.source === 'portal'}
                                                className="w-full min-w-[180px] max-w-xs bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-default focus:ring-2 focus:ring-primary-500 outline-none resize-y disabled:opacity-60"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            {app.readOnly ? (
                                                <span className="text-xs text-text-muted">
                                                    {app.source === 'portal' ? 'מקור: פורטל' : 'מקור: מייל'}
                                                </span>
                                            ) : (
                                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => openEditModal(app)}
                                                        className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                                                        title="ערוך"
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(app.id)}
                                                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                                        title="מחק"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-text-muted">
                                        לא נמצאו הגשות. לחץ על "הוסף הגשה חדשה" כדי להתחיל.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <AddApplicationModal
                isOpen={isModalOpen}
                onClose={() => {
                    if (isSaving) return;
                    setIsModalOpen(false);
                    setEditingApp(null);
                }}
                onSave={saveApplication}
                initialData={editingApp}
                isSaving={isSaving}
            />

            {activeScreeningApp ? (
                <CandidateScreeningWizard
                    jobTitle={formatApplicationJobTitle(activeScreeningApp)}
                    questions={mapJobQuestionsToWizard(getDigitalQuestionsForApp(activeScreeningApp))}
                    onClose={() => {
                        if (isSubmittingScreening) return;
                        setActiveScreeningApp(null);
                    }}
                    onSubmit={(answers) => void handleScreeningSubmit(answers)}
                />
            ) : null}
        </div>
    );
};

export default CandidateApplicationsView;
