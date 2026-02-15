
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, PlusIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, 
    TableCellsIcon, DocumentTextIcon, BanknotesIcon, PencilIcon, ChevronDownIcon, UserIcon, ChatBubbleBottomCenterTextIcon
} from './Icons';
import CommissionFormModal, { CommissionData } from './CommissionFormModal';
import ActivityLogModal from './ActivityLogModal';
import { useFinance, CommissionData as ContextCommissionData } from '../context/FinanceContext';

const CommissionsView: React.FC = () => {
    const { commissions, updateCommission, addCommission } = useFinance();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCommission, setEditingCommission] = useState<CommissionData | null>(null);
    
    // Log Modal State
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [activeLogCommission, setActiveLogCommission] = useState<CommissionData | null>(null);


    const filteredCommissions = useMemo(() => commissions.filter(c => 
        c.recruiterName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.candidateName.toLowerCase().includes(searchTerm.toLowerCase())
    ), [commissions, searchTerm]);

    // Calculate Stats
    const stats = useMemo(() => {
        // Simple aggregation logic for display
        const totalPending = commissions.reduce((acc, c) => {
            const pendingInst = c.installments.filter(i => !i.isPaid).reduce((sum, i) => sum + i.amount, 0);
            return acc + pendingInst;
        }, 0);
        
        const paidThisMonth = commissions.reduce((acc, c) => {
             const paidInst = c.installments.filter(i => i.isPaid).reduce((sum, i) => sum + i.amount, 0);
             return acc + paidInst;
        }, 0);

        return { totalPending, paidThisMonth };
    }, [commissions]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    const handleCreateNew = () => {
        setEditingCommission(null);
        setIsModalOpen(true);
    };

    const handleEdit = (commission: ContextCommissionData) => {
        setEditingCommission(commission);
        setIsModalOpen(true);
    };

    const handleSave = (data: CommissionData) => {
        if (editingCommission && editingCommission.id) {
            updateCommission({ ...data, id: editingCommission.id } as ContextCommissionData);
        } else {
            const newCommission: ContextCommissionData = {
                ...data,
                id: Date.now(),
                history: [{ date: new Date().toISOString(), action: 'נוצר ידנית', user: 'אני' }]
            };
            addCommission(newCommission);
        }
    };
    
    const handleOpenLog = (commission: ContextCommissionData) => {
        setActiveLogCommission(commission);
        setIsLogModalOpen(true);
    };

    const handleAddLogNote = (note: string) => {
        if (!activeLogCommission || !activeLogCommission.id) return;
        
        const newHistoryItem = {
            date: new Date().toISOString(),
            action: note,
            user: 'אני'
        };

        const updatedComm: ContextCommissionData = { 
            ...activeLogCommission, 
            id: activeLogCommission.id, // Ensure ID is present
            history: [...(activeLogCommission.history || []), newHistoryItem] 
        };
        updateCommission(updatedComm);
        setActiveLogCommission(updatedComm);
    };


    const getRecruiterTypeBadge = (type: string) => {
        switch(type) {
            case 'freelance': return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold border border-purple-200">פרילנס</span>;
            case 'employee': return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-200">שכיר</span>;
            case 'agency': return <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs font-bold border border-orange-200">חברת השמה</span>;
            default: return null;
        }
    };

    const PaymentProgressBar: React.FC<{ installments: any[], total: number }> = ({ installments, total }) => {
        const paid = installments.filter(i => i.isPaid).reduce((acc, curr) => acc + curr.amount, 0);
        const percent = total > 0 ? (paid / total) * 100 : 0;
        
        return (
            <div className="w-full max-w-[140px]">
                <div className="flex justify-between text-[10px] font-semibold text-text-subtle mb-1">
                    <span>{formatCurrency(paid)}</span>
                    <span>{Math.round(percent)}%</span>
                </div>
                <div className="h-2 w-full bg-bg-subtle rounded-full overflow-hidden border border-border-subtle">
                    <div 
                        className={`h-full rounded-full transition-all duration-500 ${percent === 100 ? 'bg-green-500' : 'bg-primary-500'}`} 
                        style={{ width: `${percent}%` }}
                    ></div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default h-full flex flex-col p-6 animate-fade-in">
             <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-text-default">תשלום לרכזות (Commissions)</h2>
                    <p className="text-sm text-text-muted">ניהול מענקי השמה, פריסות תשלומים ומעקב רכזים</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 px-5 shadow-sm text-center">
                         <p className="text-xs text-blue-800 font-bold uppercase mb-1">יתרה לתשלום</p>
                         <p className="text-xl font-black text-blue-900 leading-none">{formatCurrency(stats.totalPending)}</p>
                     </div>
                     <div className="bg-green-50 border border-green-200 rounded-xl p-3 px-5 shadow-sm text-center">
                         <p className="text-xs text-green-800 font-bold uppercase mb-1">שולם החודש</p>
                         <p className="text-xl font-black text-green-900 leading-none">{formatCurrency(stats.paidThisMonth)}</p>
                     </div>
                </div>
            </header>

            {/* Toolbar */}
             <div className="flex flex-wrap gap-3 mb-4 bg-bg-subtle/50 p-3 rounded-xl border border-border-default">
                 <div className="relative flex-grow max-w-sm">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="חיפוש רכזת, מועמד..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full bg-white border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-primary-500" 
                    />
                </div>
                 <button 
                    onClick={handleCreateNew}
                    className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-primary-700 transition shadow-sm ml-auto"
                >
                    <PlusIcon className="w-4 h-4"/> הוספת תשלום
                </button>
            </div>

            {/* Table */}
             <div className="overflow-visible border border-border-default rounded-xl flex-1 bg-white">
                <table className="w-full text-right text-sm">
                    <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 border-b border-border-default">
                        <tr>
                            <th className="p-4">תאריך השמה</th>
                            <th className="p-4">רכזת</th>
                            <th className="p-4">סוג</th>
                            <th className="p-4">מועמד</th>
                            <th className="p-4">שווי עסקה</th>
                            <th className="p-4">עמלה (%)</th>
                            <th className="p-4">סה"כ לתשלום</th>
                            <th className="p-4">סטטוס ביצוע</th>
                            <th className="p-4 text-center">פעולות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle overflow-visible">
                        {filteredCommissions.map((comm) => (
                            <tr key={comm.id} className="hover:bg-bg-hover transition-colors group cursor-default">
                                <td className="p-4 font-mono text-text-muted">{new Date(comm.placementDate).toLocaleDateString('he-IL')}</td>
                                <td className="p-4 font-bold text-text-default">{comm.recruiterName}</td>
                                <td className="p-4">{getRecruiterTypeBadge(comm.recruiterType as string)}</td>
                                <td className="p-4 text-text-default">{comm.candidateName}</td>
                                <td className="p-4 text-text-muted">{formatCurrency(comm.invoiceAmount)}</td>
                                <td className="p-4 text-text-default font-semibold">{comm.commissionPercent}%</td>
                                <td className="p-4 font-bold text-text-default">{formatCurrency(comm.commissionAmount)}</td>
                                <td className="p-4">
                                     <PaymentProgressBar installments={comm.installments} total={comm.commissionAmount} />
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                        <button 
                                            onClick={() => handleOpenLog(comm)}
                                            className="p-1.5 text-text-subtle hover:text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                                            title="יומן פעילות"
                                        >
                                            <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/>
                                        </button>
                                        <button 
                                            onClick={() => handleEdit(comm)}
                                            className="text-primary-600 bg-primary-50 hover:bg-primary-100 p-2 rounded-lg transition-colors font-bold text-xs"
                                        >
                                            ניהול
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>

             <CommissionFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingCommission}
             />

             {/* Log Modal */}
             {activeLogCommission && (
                <ActivityLogModal
                    isOpen={isLogModalOpen}
                    onClose={() => setIsLogModalOpen(false)}
                    title="יומן פעילות וגבייה"
                    entityId={activeLogCommission.id!}
                    history={activeLogCommission.history || []}
                    onAddNote={handleAddLogNote}
                />
            )}
        </div>
    );
};

export default CommissionsView;
