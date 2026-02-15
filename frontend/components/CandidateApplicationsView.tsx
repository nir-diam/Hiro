
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, DocumentTextIcon, MagnifyingGlassIcon } from './Icons';
import AddApplicationModal, { type ApplicationFormValues } from './AddApplicationModal';

interface JobOption {
    id: string;
    title: string;
    client?: string;
}

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
}

interface CandidateApplicationsViewProps {
    candidateId?: string | null;
}

const CandidateApplicationsView: React.FC<CandidateApplicationsViewProps> = ({ candidateId }) => {
    const [applications, setApplications] = useState<ApplicationRecord[]>([]);
    const [jobs, setJobs] = useState<JobOption[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<ApplicationFormValues | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const formatApplications = useCallback((items: ApplicationRecord[]) => {
        return items.map((app) => ({
            ...app,
            date: app.applicationDate
                ? app.applicationDate.slice(0, 10)
                : app.date || new Date().toISOString().slice(0, 10),
        }));
    }, []);

    const loadJobs = useCallback(async () => {
        try {
            const res = await fetch('/api/jobs');
            if (!res.ok) throw new Error('Failed to load jobs');
            const payload = await res.json();
            if (!Array.isArray(payload)) return;
            setJobs(
                payload.map((job) => ({
                    id: job.id,
                    title: job.title || '',
                    client: job.client || '',
                })),
            );
        } catch (err) {
            console.error('[CandidateApplicationsView] loadJobs', err);
        }
    }, []);

    const loadApplications = useCallback(async () => {
        if (!candidateId) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/applications?candidateId=${candidateId}`);
            if (!res.ok) throw new Error('Failed to load applications');
            const payload = await res.json();
            if (!Array.isArray(payload)) throw new Error('Invalid application response');
            setApplications(formatApplications(payload));
        } catch (err) {
            console.error('[CandidateApplicationsView] loadApplications', err);
        } finally {
            setIsLoading(false);
        }
    }, [candidateId, formatApplications]);

    useEffect(() => {
        loadJobs();
    }, [loadJobs]);

    useEffect(() => {
        loadApplications();
    }, [loadApplications]);

    const saveApplication = async (formData: ApplicationFormValues) => {
        if (!candidateId) return;
        setIsSaving(true);
        try {
            const payload = {
                candidateId,
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
                const res = await fetch(`/api/applications/${formData.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to update application');
            } else {
                const res = await fetch('/api/applications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to save application');
            }
            await loadApplications();
        } catch (err) {
            console.error('[CandidateApplicationsView] saveApplication', err);
        } finally {
            setIsSaving(false);
            setIsModalOpen(false);
            setEditingApp(null);
        }
    };

    const handleDelete = async (appId: string) => {
        if (!window.confirm('האם למחוק הגשה זו?')) return;
        try {
            const res = await fetch(`/api/applications/${appId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete application');
            await loadApplications();
        } catch (err) {
            console.error('[CandidateApplicationsView] handleDelete', err);
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
                                            <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded-md text-xs font-bold">
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
                onClose={() => setIsModalOpen(false)}
                onSave={saveApplication}
                initialData={editingApp}
                jobs={jobs}
                isSaving={isSaving}
            />
        </div>
    );
};

export default CandidateApplicationsView;
