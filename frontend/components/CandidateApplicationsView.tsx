
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
        notes: String(upload.userNotes || '').trim(),
        job: job || null,
        source: 'email',
        readOnly: true,
    };
}

function dedupeEmailApplications(apps: ApplicationRecord[]): ApplicationRecord[] {
    const seen = new Set<string>();
    return apps.filter((app) => {
        const dedupeKey =
            app.source === 'email' && app.cvFile
                ? `email-file::${app.cvFile}::${app.date || ''}`
                : app.id;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
    });
}

const CandidateApplicationsView: React.FC<CandidateApplicationsViewProps> = ({
    candidateId,
    relatedProfileIds = [],
}) => {
    const [applications, setApplications] = useState<ApplicationRecord[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<ApplicationFormValues | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
    const [downloadingCvId, setDownloadingCvId] = useState<string | null>(null);
    const [notesBaseline, setNotesBaseline] = useState<Record<string, string>>({});
    const [loadError, setLoadError] = useState<string | null>(null);

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
            const [manualRes, emailRes] = await Promise.all([
                fetch(`${base}/api/applications?candidateIds=${qs}`, {
                    headers,
                    credentials: 'include',
                }),
                fetch(`${base}/api/email-uploads/by-candidates?candidateIds=${qs}`, {
                    headers,
                    credentials: 'include',
                }),
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
    }, [profileIdsKey]);

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
                                                disabled={savingNotesId === app.id}
                                                className="w-full min-w-[180px] max-w-xs bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-default focus:ring-2 focus:ring-primary-500 outline-none resize-y disabled:opacity-60"
                                            />
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
                isSaving={isSaving}
            />
        </div>
    );
};

export default CandidateApplicationsView;
