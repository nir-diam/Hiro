
import React, { useState } from 'react';
import { 
    PlusIcon, MagnifyingGlassIcon, PencilIcon, TrashIcon, DocumentTextIcon, 
    CheckCircleIcon, XMarkIcon, PrinterIcon, ArrowPathIcon, EyeIcon 
} from './Icons';
import DocumentViewerModal from './DocumentViewerModal';

// --- TYPES ---
interface Proposal {
    id: number;
    number: string;
    clientName: string;
    date: string;
    validUntil: string;
    amount: number;
    status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';
    notes: string;
}

// --- MOCK DATA ---
const initialProposals: Proposal[] = [
    { id: 1, number: 'QT-2025-001', clientName: 'בזק', date: '2025-10-01', validUntil: '2025-10-30', amount: 15000, status: 'sent', notes: 'השמה למשרת מנהל שיווק' },
    { id: 2, number: 'QT-2025-002', clientName: 'Wix', date: '2025-10-05', validUntil: '2025-11-05', amount: 22000, status: 'accepted', notes: 'השמת מפתח Fullstack' },
    { id: 3, number: 'QT-2025-003', clientName: 'אל-על', date: '2025-10-10', validUntil: '2025-11-10', amount: 18000, status: 'draft', notes: 'טיוטה ראשונית' },
];

const statusStyles = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    converted: 'bg-purple-100 text-purple-700'
};

const statusLabels = {
    draft: 'טיוטה',
    sent: 'נשלח',
    accepted: 'אושר',
    rejected: 'נדחה',
    converted: 'הפך לחשבונית'
};

const ProposalsView: React.FC = () => {
    const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
    const [searchTerm, setSearchTerm] = useState('');
    const [isViewerOpen, setIsViewerOpen] = useState(false);
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

    const filteredProposals = proposals.filter(p => 
        p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.number.includes(searchTerm)
    );

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    const handleCreateNew = () => {
        alert('פתח מודל יצירת הצעת מחיר (בפיתוח)');
    };

    const handleView = (proposal: Proposal) => {
        setSelectedProposal(proposal);
        setIsViewerOpen(true);
    };
    
    const handleDelete = (id: number) => {
        if (window.confirm('למחוק הצעת מחיר?')) {
            setProposals(prev => prev.filter(p => p.id !== id));
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default h-full flex flex-col p-6 animate-fade-in">
             <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-text-default">הצעות מחיר</h2>
                    <p className="text-sm text-text-muted">נהל הצעות מחיר ללקוחות והפוך אותן לחשבוניות.</p>
                </div>
                <button onClick={handleCreateNew} className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-md">
                    <PlusIcon className="w-5 h-5"/>
                    <span>הצעה חדשה</span>
                </button>
            </header>

            <div className="mb-4 relative max-w-md">
                <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text" 
                    placeholder="חיפוש לפי לקוח או מספר הצעה..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500" 
                />
            </div>

            <div className="overflow-x-auto border border-border-default rounded-xl">
                <table className="w-full text-sm text-right min-w-[800px]">
                    <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default">
                        <tr>
                            <th className="p-4">מספר הצעה</th>
                            <th className="p-4">לקוח</th>
                            <th className="p-4">תאריך</th>
                            <th className="p-4">תוקף</th>
                            <th className="p-4">סכום</th>
                            <th className="p-4">סטטוס</th>
                            <th className="p-4">הערות</th>
                            <th className="p-4 text-center">פעולות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {filteredProposals.map(p => (
                            <tr key={p.id} className="hover:bg-bg-hover transition-colors">
                                <td className="p-4 font-mono font-medium">{p.number}</td>
                                <td className="p-4 font-bold">{p.clientName}</td>
                                <td className="p-4 text-text-muted">{new Date(p.date).toLocaleDateString('he-IL')}</td>
                                <td className="p-4 text-text-muted">{new Date(p.validUntil).toLocaleDateString('he-IL')}</td>
                                <td className="p-4 font-bold">{formatCurrency(p.amount)}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${statusStyles[p.status]}`}>
                                        {statusLabels[p.status]}
                                    </span>
                                </td>
                                <td className="p-4 text-text-muted max-w-xs truncate" title={p.notes}>{p.notes}</td>
                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button onClick={() => handleView(p)} className="p-1.5 hover:bg-bg-subtle rounded text-text-subtle hover:text-primary-600 transition" title="צפה">
                                            <EyeIcon className="w-4 h-4"/>
                                        </button>
                                        <button className="p-1.5 hover:bg-bg-subtle rounded text-text-subtle hover:text-primary-600 transition" title="ערוך">
                                            <PencilIcon className="w-4 h-4"/>
                                        </button>
                                        <button className="p-1.5 hover:bg-bg-subtle rounded text-text-subtle hover:text-primary-600 transition" title="שלח במייל">
                                            <ArrowPathIcon className="w-4 h-4"/>
                                        </button>
                                        <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 rounded text-text-subtle hover:text-red-600 transition" title="מחק">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedProposal && (
                <DocumentViewerModal 
                    isOpen={isViewerOpen}
                    onClose={() => setIsViewerOpen(false)}
                    documentTitle={`הצעת מחיר ${selectedProposal.number}`}
                    clientName={selectedProposal.clientName}
                />
            )}
        </div>
    );
};

export default ProposalsView;
