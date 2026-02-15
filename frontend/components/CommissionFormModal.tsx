
import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, BanknotesIcon, UserIcon, CheckCircleIcon, ClockIcon, CalendarDaysIcon, CalculatorIcon, PlusIcon, TrashIcon } from './Icons';

export interface HistoryItem {
    date: string;
    action: string;
    user: string;
}

export interface Installment {
    id: number;
    dueDate: string;
    amount: number;
    isPaid: boolean;
    paidDate?: string;
    note?: string;
}

export interface CommissionData {
    id?: number;
    recruiterName: string;
    recruiterType: 'freelance' | 'employee' | 'agency';
    candidateName: string;
    placementDate: string;
    invoiceAmount: number; // סכום החשבונית ללקוח
    commissionPercent: number; // אחוז העמלה לרכזת
    commissionAmount: number; // סכום לתשלום לרכזת (Total)
    installments: Installment[];
    status: 'paid' | 'partial' | 'pending' | 'invoice_pending';
    notes?: string;
    history?: HistoryItem[];
}

interface CommissionFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CommissionData) => void;
    initialData?: CommissionData | null;
}

const CommissionFormModal: React.FC<CommissionFormModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [formData, setFormData] = useState<CommissionData>({
        recruiterName: '',
        recruiterType: 'freelance',
        candidateName: '',
        placementDate: new Date().toISOString().split('T')[0],
        invoiceAmount: 0,
        commissionPercent: 30,
        commissionAmount: 0,
        installments: [],
        status: 'invoice_pending',
        notes: '',
        history: []
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                const formattedDate = initialData.placementDate.includes('.') 
                    ? initialData.placementDate.split('.').reverse().join('-') 
                    : initialData.placementDate;
                
                setFormData({
                    ...initialData,
                    placementDate: formattedDate,
                    // Ensure installments exist if loading old data
                    installments: initialData.installments && initialData.installments.length > 0 
                        ? initialData.installments 
                        : [{ id: 1, dueDate: formattedDate, amount: initialData.commissionAmount, isPaid: initialData.status === 'paid' }]
                });
            } else {
                setFormData({
                    recruiterName: '',
                    recruiterType: 'freelance',
                    candidateName: '',
                    placementDate: new Date().toISOString().split('T')[0],
                    invoiceAmount: 0,
                    commissionPercent: 30,
                    commissionAmount: 0,
                    installments: [],
                    status: 'invoice_pending',
                    notes: '',
                    history: []
                });
            }
        }
    }, [isOpen, initialData]);

    // Auto-calculate total commission based on invoice and percent
    useEffect(() => {
        const calculated = Math.round((formData.invoiceAmount * formData.commissionPercent) / 100);
        if (calculated !== formData.commissionAmount && !initialData) {
             setFormData(prev => ({ ...prev, commissionAmount: calculated }));
        }
    }, [formData.invoiceAmount, formData.commissionPercent]);

    // Derived stats
    const paidAmount = useMemo(() => 
        formData.installments.filter(i => i.isPaid).reduce((acc, curr) => acc + curr.amount, 0), 
    [formData.installments]);
    
    const remainingAmount = formData.commissionAmount - paidAmount;
    const progressPercent = formData.commissionAmount > 0 ? (paidAmount / formData.commissionAmount) * 100 : 0;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: (name === 'invoiceAmount' || name === 'commissionPercent' || name === 'commissionAmount') ? Number(value) : value 
        }));
    };

    const handleInstallmentChange = (id: number, field: keyof Installment, value: any) => {
        setFormData(prev => ({
            ...prev,
            installments: prev.installments.map(inst => inst.id === id ? { ...inst, [field]: value } : inst)
        }));
    };

    const toggleInstallmentPaid = (id: number) => {
        setFormData(prev => {
            const updatedInstallments = prev.installments.map(inst => {
                if (inst.id === id) {
                    return { 
                        ...inst, 
                        isPaid: !inst.isPaid,
                        paidDate: !inst.isPaid ? new Date().toISOString().split('T')[0] : undefined
                    };
                }
                return inst;
            });
            
            // Recalculate global status
            const allPaid = updatedInstallments.every(i => i.isPaid);
            const somePaid = updatedInstallments.some(i => i.isPaid);
            const newStatus = allPaid ? 'paid' : somePaid ? 'partial' : 'pending';

            return {
                ...prev,
                installments: updatedInstallments,
                status: newStatus,
                 history: [
                    ...(prev.history || []),
                    {
                        date: new Date().toISOString(),
                        action: `עדכון תשלום ${id}: ${!prev.installments.find(i => i.id === id)?.isPaid ? 'שולם' : 'בוטל'}`,
                        user: 'אני'
                    }
                ]
            };
        });
    };

    const generateInstallments = (count: number) => {
        const amountPerInst = Math.floor(formData.commissionAmount / count);
        const remainder = formData.commissionAmount % count;
        
        const newInstallments: Installment[] = Array.from({ length: count }).map((_, idx) => {
            const date = new Date(formData.placementDate);
            date.setMonth(date.getMonth() + idx); // Add month for each installment
            
            return {
                id: Date.now() + idx,
                dueDate: date.toISOString().split('T')[0],
                amount: idx === count - 1 ? amountPerInst + remainder : amountPerInst, // Add remainder to last one
                isPaid: false
            };
        });
        
        setFormData(prev => ({ ...prev, installments: newInstallments }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <header className="flex items-center justify-between p-6 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-xl font-black text-text-default">
                            {initialData ? 'ניהול תשלום ועמלה' : 'הקמת תשלום חדש'}
                        </h2>
                        <p className="text-xs text-text-muted mt-1">הגדרת תנאי תשלום לרכזת עבור ההשמה</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">

                        {/* Top Summary Card */}
                        <div className="bg-gradient-to-r from-primary-50 to-white border border-primary-100 rounded-2xl p-5 shadow-sm">
                            <div className="flex justify-between items-end mb-4">
                                <div>
                                    <span className="text-sm font-semibold text-text-muted block mb-1">סה"כ לתשלום לרכזת</span>
                                    <span className="text-3xl font-black text-primary-700">{formatCurrency(formData.commissionAmount)}</span>
                                </div>
                                <div className="text-left">
                                    <span className="text-xs font-bold text-text-muted block mb-1">נותר לתשלום</span>
                                    <span className="text-xl font-bold text-red-600">{formatCurrency(remainingAmount)}</span>
                                </div>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="relative h-4 bg-bg-subtle rounded-full overflow-hidden border border-border-default">
                                <div 
                                    className={`absolute top-0 right-0 h-full transition-all duration-500 ${progressPercent === 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary-900 drop-shadow-sm">
                                    {Math.round(progressPercent)}% שולם
                                </div>
                            </div>
                        </div>
                        
                        {/* Basic Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">שם הרכזת</label>
                                <div className="relative">
                                    <UserIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input 
                                        type="text" 
                                        name="recruiterName"
                                        value={formData.recruiterName}
                                        onChange={handleChange}
                                        className="w-full bg-bg-input border border-border-default rounded-xl py-2 pl-3 pr-9 text-sm focus:ring-2 focus:ring-primary-500"
                                        required
                                    />
                                </div>
                            </div>
                             <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">סוג התקשרות</label>
                                <select 
                                    name="recruiterType" 
                                    value={formData.recruiterType} 
                                    onChange={handleChange} 
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="freelance">פרילנס (חשבונית)</option>
                                    <option value="employee">שכיר/ה (תלוש)</option>
                                    <option value="agency">חברת השמה (שותף)</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">שם המועמד/ת</label>
                                <input 
                                    type="text" 
                                    name="candidateName"
                                    value={formData.candidateName}
                                    onChange={handleChange}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                    required
                                />
                            </div>
                             <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">תאריך השמה</label>
                                <input 
                                    type="date" 
                                    name="placementDate"
                                    value={formData.placementDate}
                                    onChange={handleChange}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                        </div>

                        {/* Calculation Area */}
                        <div className="bg-bg-subtle/50 p-4 rounded-xl border border-border-default">
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">שווי עסקה (חשבונית לקוח)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            name="invoiceAmount"
                                            value={formData.invoiceAmount}
                                            onChange={handleChange}
                                            className="w-full bg-white border border-border-default rounded-lg p-2 pr-6 text-sm focus:ring-primary-500"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs">₪</span>
                                    </div>
                                </div>
                                 <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">אחוז הפרשה לרכזת</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            name="commissionPercent"
                                            value={formData.commissionPercent}
                                            onChange={handleChange}
                                            className="w-full bg-white border border-border-default rounded-lg p-2 pr-2 pl-6 text-sm focus:ring-primary-500"
                                        />
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-xs">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Installments Section */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-bold text-text-default flex items-center gap-2">
                                    <CalculatorIcon className="w-4 h-4 text-primary-500"/>
                                    פריסת תשלומים
                                </h4>
                                <div className="flex gap-2">
                                     <button type="button" onClick={() => generateInstallments(1)} className="text-xs bg-bg-subtle hover:bg-bg-hover px-2 py-1 rounded border border-border-default transition">תשלום 1</button>
                                     <button type="button" onClick={() => generateInstallments(2)} className="text-xs bg-bg-subtle hover:bg-bg-hover px-2 py-1 rounded border border-border-default transition">2 תשלומים</button>
                                     <button type="button" onClick={() => generateInstallments(3)} className="text-xs bg-bg-subtle hover:bg-bg-hover px-2 py-1 rounded border border-border-default transition">3 תשלומים</button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {formData.installments.map((inst, index) => (
                                    <div key={inst.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${inst.isPaid ? 'bg-green-50 border-green-200 opacity-80' : 'bg-white border-border-default'}`}>
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-subtle flex items-center justify-center text-xs font-bold text-text-muted border border-border-default">
                                            {index + 1}
                                        </div>
                                        
                                        <div className="flex-grow grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] text-text-muted mb-0.5">תאריך לתשלום</label>
                                                <input 
                                                    type="date" 
                                                    value={inst.dueDate}
                                                    onChange={(e) => handleInstallmentChange(inst.id, 'dueDate', e.target.value)}
                                                    className="w-full bg-transparent border-b border-border-default text-sm focus:border-primary-500 outline-none p-0"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-text-muted mb-0.5">סכום</label>
                                                <input 
                                                    type="number" 
                                                    value={inst.amount}
                                                    onChange={(e) => handleInstallmentChange(inst.id, 'amount', Number(e.target.value))}
                                                    className="w-full bg-transparent border-b border-border-default text-sm font-bold focus:border-primary-500 outline-none p-0"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex-shrink-0">
                                            <button 
                                                type="button"
                                                onClick={() => toggleInstallmentPaid(inst.id)}
                                                className={`flex flex-col items-center justify-center w-16 h-10 rounded-lg border transition-all ${inst.isPaid ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-border-default text-text-subtle hover:border-green-500 hover:text-green-500'}`}
                                            >
                                                {inst.isPaid ? <CheckCircleIcon className="w-5 h-5"/> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                                                <span className="text-[9px] font-bold mt-0.5">{inst.isPaid ? 'שולם' : 'לשלם'}</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                
                                {formData.installments.length === 0 && (
                                    <div className="text-center p-4 bg-bg-subtle/30 rounded-xl border border-dashed border-border-default text-text-muted text-sm">
                                        לא הוגדרו תשלומים. לחץ על כפתורי הקיצור למעלה או חשב אוטומטית.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-text-default mb-1.5">הערות</label>
                            <textarea 
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                rows={2}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                                placeholder="הערות פנימיות..."
                            />
                        </div>

                    </div>
                </form>

                {/* Footer */}
                <footer className="p-5 border-t border-border-default bg-bg-subtle flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">
                        ביטול
                    </button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all">
                        שמור שינויים
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default CommissionFormModal;
