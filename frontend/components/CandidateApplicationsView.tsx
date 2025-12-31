
import React, { useState } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, LinkIcon, DocumentTextIcon, MagnifyingGlassIcon } from './Icons';
import AddApplicationModal from './AddApplicationModal';

interface Application {
    id: number;
    company: string;
    role: string;
    status: string;
    date: string;
    link?: string;
    cvFile?: string;
    notes?: string;
}

const initialApplications: Application[] = [
    { id: 1, company: 'טכנולוגיות מתקדמות בע"מ', role: 'סגן.ית מנהל הפצה', status: 'נשלח', date: '2025-12-23', link: 'https://...', cvFile: 'שי שני ניהול הפצה', notes: '-' },
    { id: 2, company: 'בזק', role: 'מנהל שיווק', status: 'ראיון', date: '2025-12-20', link: 'https://...', cvFile: 'שי שני שיווק', notes: 'נשלח דרך אתר החברה' },
    { id: 3, company: 'Wix', role: 'Product Manager', status: 'התקבל', date: '2025-12-18', link: '', cvFile: 'שי שני אנגלית', notes: 'ראיון טלפוני עבר בהצלחה' },
];

const CandidateApplicationsView: React.FC = () => {
    const [applications, setApplications] = useState<Application[]>(initialApplications);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<Application | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleAdd = (appData: any) => {
        const newApp: Application = {
            ...appData,
            id: editingApp ? editingApp.id : Date.now(),
            status: editingApp ? editingApp.status : 'נשלח'
        };

        if (editingApp) {
            setApplications(prev => prev.map(app => app.id === editingApp.id ? newApp : app));
        } else {
            setApplications(prev => [newApp, ...prev]);
        }
        setEditingApp(null);
    };

    const handleEdit = (app: Application) => {
        setEditingApp(app);
        setIsModalOpen(true);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם למחוק הגשה זו?')) {
            setApplications(prev => prev.filter(a => a.id !== id));
        }
    };

    const openNewModal = () => {
        setEditingApp(null);
        setIsModalOpen(true);
    };

    const filteredApps = applications.filter(app => 
        app.company.includes(searchTerm) || app.role.includes(searchTerm)
    );

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header Area */}
            <div className="text-center space-y-2 py-4">
                <h1 className="text-3xl font-black text-text-default tracking-tight">פנקס הגשות</h1>
                <p className="text-text-muted text-lg">נהל/י ועקוב/י אחר כל הגשות המועמדות שלך למשרות במקום אחד.</p>
            </div>

            {/* Actions Bar */}
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

            {/* Table Card */}
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
                            {filteredApps.length > 0 ? (
                                filteredApps.map((app) => (
                                    <tr key={app.id} className="group hover:bg-bg-subtle/30 transition-colors text-sm">
                                        <td className="px-6 py-4 font-mono text-text-default">{app.date}</td>
                                        <td className="px-6 py-4 font-bold text-text-default">{app.company}</td>
                                        <td className="px-6 py-4 text-text-default">{app.role}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded-md text-xs font-bold">
                                                {app.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {app.link ? (
                                                <a href={app.link} target="_blank" rel="noreferrer" className="text-primary-600 hover:text-primary-800 font-medium hover:underline flex items-center gap-1">
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
                                        <td className="px-6 py-4 text-text-muted max-w-xs truncate" title={app.notes}>
                                            {app.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => handleEdit(app)}
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
                // @ts-ignore
                onSave={handleAdd}
                // @ts-ignore
                initialData={editingApp}
            />
        </div>
    );
};

export default CandidateApplicationsView;
