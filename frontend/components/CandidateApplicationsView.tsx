
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, DocumentTextIcon, MagnifyingGlassIcon } from './Icons';
import AddApplicationModal, { type ApplicationFormValues } from './AddApplicationModal';
import { authHeaders } from '../utils/authHeaders';

interface JobOption {
    id: string;
    title: string;
    client?: string;
}

type EmailUploadRow = {
    id: number | string;
    candidateId?: string | null;
    jobId?: string | null;
    subject?: string | null;
    from?: string | null;
    createdAt?: string | null;
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
    notes?: string | null;
    job?: JobOption | null;
    date?: string;
    source?: 'manual' | 'email';
    readOnly?: boolean;
}

interface CandidateApplicationsViewProps {
    candidateId?: string | null;
    /** All profile version ids for the same portal user — aggregates email + manual submissions. */
    relatedProfileIds?: string[];
}

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

function normalizeDate(value?: string | null): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
}

function mapManualApplication(app: ApplicationRecord): ApplicationRecord {
    return {
        ...app,
        source: 'manual',
        readOnly: false,
        date: app.applicationDate ? normalizeDate(app.applicationDate) : app.date || normalizeDate(null),
    };
}

function mapEmailUploadToApplication(
    upload: EmailUploadRow,
    jobsById: Map<string, JobOption>,
): ApplicationRecord | null {
    const candidateId = upload.candidateId ? String(upload.candidateId) : '';
    if (!candidateId) return null;
    const jobId = upload.jobId != null ? String(upload.jobId).trim() : '';
    const job = jobId ? jobsById.get(jobId) : undefined;
    const subject = String(upload.subject || '').trim();
    const from = String(upload.from || '').trim();
    return {
        id: `email-${upload.id}`,
        candidateId,
        jobId: jobId || null,
        company: job?.client || '—',
        role: job?.title || subject || 'הגשה ממייל',
        status: 'נקלט ממייל',
        applicationDate: upload.createdAt || null,
        date: normalizeDate(upload.createdAt),
        link: null,
        cvFile: subject || 'קורות חיים ממייל',
        notes: from ? `מ: ${from}` : null,
        job: job || null,
        source: 'email',
        readOnly: true,
    };
}

const CandidateApplicationsView: React.FC<CandidateApplicationsViewProps> = ({
    candidateId,
    relatedProfileIds = [],
}) => {
    const [applications, setApplications] = useState<ApplicationRecord[]>([]);
    const [jobs, setJobs] = useState<JobOption[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<ApplicationFormValues | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const profileIds = useMemo(() => {
        const ids = new Set<string>();
        const primary = candidateId != null ? String(candidateId).trim() : '';
        if (primary) ids.add(primary);
        for (const id of relatedProfileIds) {
            const s = String(id || '').trim();
            if (s) ids.add(s);
        }
        return [...ids];
    }, [candidateId, relatedProfileIds]);

    const loadJobs = useCallback(async (): Promise<Map<string, JobOption>> => {
        const base = apiBase();
        const map = new Map<string, JobOption>();
        try {
            const res = await fetch(`${base}/api/jobs`, {
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to load jobs');
            const payload = await res.json();
            if (!Array.isArray(payload)) return map;
            for (const job of payload) {
                if (!job?.id) continue;
                map.set(String(job.id), {
                    id: String(job.id),
                    title: job.title || '',
                    client: job.client || '',
                });
            }
            setJobs([...map.values()]);
        } catch (err) {
            console.error('[CandidateApplicationsView] loadJobs', err);
        }
        return map;
    }, []);

    const loadManualApplications = useCallback(async (ids: string[]) => {
        const base = apiBase();
        const batches = await Promise.allSettled(
            ids.map(async (id) => {
                const res = await fetch(`${base}/api/applications?candidateId=${encodeURIComponent(id)}`, {
                    headers: authHeaders(),
                    credentials: 'include',
                });
                if (!res.ok) throw new Error('Failed to load applications');
                const payload = await res.json();
                if (!Array.isArray(payload)) return [] as ApplicationRecord[];
                return payload.map((row) => mapManualApplication(row as ApplicationRecord));
            }),
        );
        const merged: ApplicationRecord[] = [];
        const seen = new Set<string>();
        for (const batch of batches) {
            if (batch.status !== 'fulfilled') continue;
            for (const app of batch.value) {
                const key = app.id;
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(app);
            }
        }
        return merged;
    }, []);

    const loadEmailApplications = useCallback(async (ids: string[], jobsById: Map<string, JobOption>) => {
        const base = apiBase();
        const batches = await Promise.allSettled(
            ids.map(async (id) => {
                const res = await fetch(`${base}/api/email-uploads/candidate/${encodeURIComponent(id)}`, {
                    headers: authHeaders(),
                    credentials: 'include',
                });
                if (!res.ok) return [] as ApplicationRecord[];
                const payload = await res.json();
                if (!Array.isArray(payload)) return [] as ApplicationRecord[];
                return payload
                    .map((row) => mapEmailUploadToApplication(row as EmailUploadRow, jobsById))
                    .filter((row): row is ApplicationRecord => Boolean(row));
            }),
        );
        const merged: ApplicationRecord[] = [];
        const seen = new Set<string>();
        for (const batch of batches) {
            if (batch.status !== 'fulfilled') continue;
            for (const app of batch.value) {
                const key = app.id;
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(app);
            }
        }
        return merged;
    }, []);

    const loadApplications = useCallback(async () => {
        if (!profileIds.length) {
            setApplications([]);
            return;
        }
        setIsLoading(true);
        setLoadError(null);
        try {
            const jobsById = await loadJobs();
            const [manualApps, emailApps] = await Promise.all([
                loadManualApplications(profileIds),
                loadEmailApplications(profileIds, jobsById),
            ]);
            const manualJobKeys = new Set(
                manualApps.map((a) => `${a.candidateId}::${a.jobId || ''}::${a.date || ''}`),
            );
            const emailOnly = emailApps.filter((app) => {
                const key = `${app.candidateId}::${app.jobId || ''}::${app.date || ''}`;
                if (app.jobId && manualJobKeys.has(key)) return false;
                return true;
            });
            const combined = [...manualApps, ...emailOnly].sort((a, b) => {
                const aTime = Date.parse(String(a.date || '')) || 0;
                const bTime = Date.parse(String(b.date || '')) || 0;
                return bTime - aTime;
            });
            setApplications(combined);
        } catch (err) {
            console.error('[CandidateApplicationsView] loadApplications', err);
            setLoadError(err instanceof Error ? err.message : 'טעינת הגשות נכשלה');
        } finally {
            setIsLoading(false);
        }
    }, [profileIds, loadJobs, loadManualApplications, loadEmailApplications]);

    useEffect(() => {
        void loadApplications();
    }, [loadApplications]);

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
                                <th className="px-6 py-4">לינק</th>
                                <th className="px-6 py-4">קובץ קו"ח</th>
                                <th className="px-6 py-4">הערות</th>
                                <th className="px-6 py-4 text-center">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-text-muted">
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
                                                        : 'bg-primary-50 text-primary-700'
                                                }`}
                                            >
                                                {app.status}
                                            </span>
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
                                        <td className="px-6 py-4 text-text-muted flex items-center gap-2">
                                            {app.cvFile && <DocumentTextIcon className="w-4 h-4 text-text-subtle" />}
                                            {app.cvFile || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-text-muted max-w-xs truncate" title={app.notes || ''}>
                                            {app.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {app.readOnly ? (
                                                <span className="text-xs text-text-muted">מקור: מייל</span>
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
                                    <td colSpan={8} className="px-6 py-12 text-center text-text-muted">
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
                jobs={jobs}
                isSaving={isSaving}
            />
        </div>
    );
};

export default CandidateApplicationsView;
