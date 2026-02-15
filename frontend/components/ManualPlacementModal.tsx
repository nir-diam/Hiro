
import React, { useState } from 'react';
import { XMarkIcon, BanknotesIcon, UserIcon, BriefcaseIcon, CheckCircleIcon, CalculatorIcon } from './Icons';
import { useFinance, InvoiceData, CommissionData } from '../context/FinanceContext';

interface ManualPlacementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ManualPlacementModal: React.FC<ManualPlacementModalProps> = ({ isOpen, onClose }) => {
    const { addInvoice, addCommission } = useFinance();
    
    // Default State
    const [formData, setFormData] = useState({
        clientName: '',
        candidateName: '',
        jobTitle: '',
        dealAmount: 0, // Revenue
        placementDate: new Date().toISOString().split('T')[0],
        
        // Recruiter Info
        recruiterName: '',
        recruiterType: 'freelance', // freelance | employee | agency
        commissionPercent: 30,
        
        // Invoice Info
        paymentTerms: 'שוטף + 30',
        generateInvoice: true
    });

    if (!isOpen) return null;

    const commissionAmount = Math.round((formData.dealAmount * formData.commissionPercent) / 100);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        // @ts-ignore
        const val = type === 'number' ? Number(value) : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const timestamp = Date.now();
        const placementDateObj = new Date(formData.placementDate);
        
        // 1. Create Invoice Record (Revenue)
        if (formData.generateInvoice) {
            const dueDate = new Date(placementDateObj);
            dueDate.setDate(dueDate.getDate() + 30); // Approx logic for terms

            const newInvoice: InvoiceData = {
                id: timestamp, // Using timestamp as ID for sync
                type: 'tax_invoice',
                invoiceNumber: `MAN-${Math.floor(Math.random() * 1000)}`,
                clientName: formData.clientName,
                candidateName: formData.candidateName,
                jobTitle: formData.jobTitle,
                amount: formData.dealAmount,
                issueDate: formData.placementDate,
                dueDate: dueDate.toISOString().split('T')[0],
                paymentTerms: formData.paymentTerms,
                status: 'sent', // Assume sent if entered manually as a done deal
                placementDate: formData.placementDate,
                notes: 'הוזן ידנית דרך ממשק השמות',
                internalNotes: `רכזת מטפלת: ${formData.recruiterName}`,
                history: [{ date: new Date().toISOString(), action: 'השמה הוזנה ידנית', user: 'אני' }]
            };
            addInvoice(newInvoice);
        }

        // 2. Create Commission Record (Expense)
        const newCommission: CommissionData = {
            id: timestamp + 1,
            recruiterName: formData.recruiterName,
            recruiterType: formData.recruiterType as any,
            candidateName: formData.candidateName,
            placementDate: formData.placementDate,
            invoiceAmount: formData.dealAmount,
            commissionPercent: formData.commissionPercent,
            commissionAmount: commissionAmount,
            status: 'invoice_pending',
            installments: [
                {
                    id: 1,
                    dueDate: new Date(new Date(formData.placementDate).setMonth(new Date(formData.placementDate).getMonth() + 1)).toISOString().split('T')[0], // Next month
                    amount: commissionAmount,
                    isPaid: false
                }
            ],
            history: [{ date: new Date().toISOString(), action: 'השמה הוזנה ידנית', user: 'אני' }]
        };
        addCommission(newCommission);

        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in border border-border-default">
                
                <header className="flex items-center justify-between p-6 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-xl font-black text-text-default flex items-center gap-2">
                            <BriefcaseIcon className="w-6 h-6 text-primary-600"/>
                            הזנת השמה ידנית
                        </h2>
                        <p className="text-sm text-text-muted mt-1">יצירת רשומת הכנסה והוצאה (עמלה) בפעולה אחת</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-8">
                        
                        {/* Deal Details */}
                        <section>
                            <h3 className="text-sm font-bold text-text-default uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">1</span>
                                פרטי העסקה (הכנסה)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">שם הלקוח</label>
                                    <input required type="text" name="clientName" value={formData.clientName} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-primary-500" placeholder="למשל: בנק הפועלים"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">שם המועמד</label>
                                    <input required type="text" name="candidateName" value={formData.candidateName} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="למשל: ישראל ישראלי"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">משרה / תפקיד</label>
                                    <input required type="text" name="jobTitle" value={formData.jobTitle} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="למשל: מפתח Fullstack"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">תאריך השמה</label>
                                    <input required type="date" name="placementDate" value={formData.placementDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"/>
                                </div>
                                <div className="md:col-span-2 bg-green-50/50 p-4 rounded-xl border border-green-100 mt-2">
                                    <label className="block text-xs font-bold text-green-800 mb-1">סכום העסקה (לחיוב לקוח)</label>
                                    <div className="relative">
                                        <BanknotesIcon className="w-5 h-5 text-green-600 absolute right-3 top-1/2 -translate-y-1/2" />
                                        <input required type="number" name="dealAmount" value={formData.dealAmount} onChange={handleChange} className="w-full bg-white border border-green-200 rounded-lg py-2 pl-3 pr-10 text-lg font-black text-green-700 focus:ring-2 focus:ring-green-500" placeholder="0"/>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="border-t border-border-default"></div>

                        {/* Commission Details */}
                        <section>
                            <h3 className="text-sm font-bold text-text-default uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs">2</span>
                                עמלת רכזת (הוצאה)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">שם הרכזת</label>
                                    <div className="relative">
                                        <UserIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2"/>
                                        <input required type="text" name="recruiterName" value={formData.recruiterName} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm" placeholder="שם הרכזת"/>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">סוג התקשרות</label>
                                    <select name="recruiterType" value={formData.recruiterType} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                        <option value="freelance">פרילנס</option>
                                        <option value="employee">שכיר</option>
                                        <option value="agency">חברת השמה</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">אחוז עמלה</label>
                                    <div className="relative">
                                        <input type="number" name="commissionPercent" value={formData.commissionPercent} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm pl-6" />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">%</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-4 bg-purple-50 p-3 rounded-lg flex justify-between items-center border border-purple-100">
                                <span className="text-sm font-medium text-purple-900">סה"כ לתשלום לרכזת:</span>
                                <span className="text-lg font-black text-purple-700">
                                    {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(commissionAmount)}
                                </span>
                            </div>
                        </section>

                    </div>
                </form>

                <footer className="p-5 border-t border-border-default bg-bg-subtle flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="genInv" 
                            checked={formData.generateInvoice} 
                            onChange={(e) => setFormData(p => ({...p, generateInvoice: e.target.checked}))}
                            className="w-4 h-4 text-primary-600 rounded border-gray-300" 
                        />
                        <label htmlFor="genInv" className="text-sm text-text-muted">צור דרישת תשלום אוטומטית</label>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">
                            ביטול
                        </button>
                        <button onClick={handleSubmit} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5"/>
                            שמור עסקה
                        </button>
                    </div>
                </footer>

            </div>
        </div>
    );
};

export default ManualPlacementModal;
