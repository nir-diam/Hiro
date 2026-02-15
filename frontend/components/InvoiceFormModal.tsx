
import React, { useState, useEffect } from 'react';
import { XMarkIcon, DocumentTextIcon, BanknotesIcon, BuildingOffice2Icon, ExclamationTriangleIcon, PrinterIcon, ClockIcon, CheckCircleIcon } from './Icons';

export interface HistoryItem {
    date: string;
    action: string;
    user: string;
}

export interface RelatedDocument {
    id: string; 
    type: 'proforma' | 'tax_invoice' | 'invoice_receipt' | 'receipt';
    number: string;
    date: string;
    amount?: number;
}

export interface InvoiceData {
    id?: number;
    type: 'proforma' | 'tax_invoice' | 'invoice_receipt' | 'receipt';
    clientName: string;
    candidateName: string;
    jobTitle?: string;
    amount: number;
    issueDate: string;
    paymentTerms: string;
    dueDate: string;
    notes: string;
    internalNotes: string;
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'canceled';
    invoiceNumber?: string;
    placementDate: string;
    history?: HistoryItem[];
    relatedDocuments?: RelatedDocument[];
}

interface InvoiceFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: InvoiceData) => void;
    initialData?: InvoiceData | null;
    mode?: 'edit' | 'produce'; // New prop
}

const InvoiceFormModal: React.FC<InvoiceFormModalProps> = ({ isOpen, onClose, onSave, initialData, mode = 'edit' }) => {
    const [formData, setFormData] = useState<InvoiceData>({
        type: 'proforma',
        clientName: '',
        candidateName: '',
        jobTitle: '',
        amount: 0,
        issueDate: new Date().toISOString().split('T')[0],
        paymentTerms: 'שוטף + 30',
        dueDate: '',
        placementDate: new Date().toISOString().split('T')[0],
        notes: '',
        internalNotes: '',
        status: 'draft',
        history: []
    });

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // If in 'produce' mode, we want to copy details but NOT the ID or the existing invoice number
                // We are creating a NEW document based on this one.
                if (mode === 'produce') {
                     setFormData({
                        ...initialData,
                        id: undefined, // Clear ID to force creation
                        invoiceNumber: '', // Clear number
                        type: 'tax_invoice', // Default next step
                        issueDate: new Date().toISOString().split('T')[0], // Reset date to today
                        status: 'draft',
                        history: [], // Start fresh history
                        relatedDocuments: [] // In a real app, you might link back to the parent doc here
                    });
                } else {
                    setFormData(initialData);
                }
            } else {
                // Reset for completely new
                const today = new Date();
                const due = new Date(today);
                due.setDate(today.getDate() + 30); // Default +30
                
                setFormData({
                    type: 'proforma',
                    clientName: '',
                    candidateName: '',
                    jobTitle: '',
                    amount: 0,
                    issueDate: today.toISOString().split('T')[0],
                    paymentTerms: 'שוטף + 30',
                    dueDate: due.toISOString().split('T')[0],
                    placementDate: today.toISOString().split('T')[0],
                    notes: '',
                    internalNotes: '',
                    status: 'draft',
                    history: []
                });
            }
        }
    }, [isOpen, initialData, mode]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? Number(value) : value }));
    };

    const handleTermsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const terms = e.target.value;
        const days = terms === 'מיידי' ? 0 : parseInt(terms.replace(/\D/g, '')) || 30;
        
        const issue = new Date(formData.issueDate);
        const newDue = new Date(issue);
        newDue.setDate(issue.getDate() + days);
        
        setFormData(prev => ({ 
            ...prev, 
            paymentTerms: terms, 
            dueDate: newDue.toISOString().split('T')[0] 
        }));
    };

    const handlePaymentReceivedToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isPaid = e.target.checked;
        const newStatus = isPaid ? 'paid' : 'sent';
        
        setFormData(prev => ({
            ...prev,
            status: newStatus,
            history: [
                ...(prev.history || []),
                {
                    date: new Date().toISOString(),
                    action: isPaid ? 'סומן כשולם (ידני)' : 'בוטל סימון תשלום',
                    user: 'אני'
                }
            ]
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    if (!isOpen) return null;

    const docTypes = [
        { id: 'proforma', label: 'חשבונית עסקה (דרישת תשלום)', icon: <DocumentTextIcon className="w-5 h-5"/> },
        { id: 'tax_invoice', label: 'חשבונית מס (חיוב מס מיידי)', icon: <PrinterIcon className="w-5 h-5"/> },
        { id: 'invoice_receipt', label: 'חשבונית מס/קבלה (לתשלום מיידי)', icon: <CheckCircleIcon className="w-5 h-5"/> },
        { id: 'receipt', label: 'קבלה בלבד (על תשלום קיים)', icon: <BanknotesIcon className="w-5 h-5"/> },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <header className="flex items-center justify-between p-6 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-xl font-black text-text-default">
                            {mode === 'produce' ? 'הפקת מסמך חדש' : 'עריכת פרטי גבייה'}
                        </h2>
                        {initialData?.invoiceNumber && mode === 'edit' && (
                            <span className="text-xs font-mono text-text-muted bg-bg-subtle px-2 py-0.5 rounded border border-border-default mt-1 inline-block">
                                #{initialData.invoiceNumber}
                            </span>
                        )}
                        {mode === 'produce' && initialData && (
                             <span className="text-xs text-text-muted mt-1 block">
                                מתבסס על {initialData.type === 'proforma' ? 'דרישת תשלום' : 'מסמך'} {initialData.invoiceNumber}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                    <div className="p-6 space-y-6">
                        
                        {/* Info Banner */}
                        {mode === 'produce' && (
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start">
                                <ExclamationTriangleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-blue-800 leading-relaxed">
                                    שים לב: הפקת מסמך תשלח בקשה למערכת החשבוניות (Morning) ותייצר מסמך רשמי עם מספר עוקב חדש.
                                </p>
                            </div>
                        )}

                        {/* Document Type Selector - Morning Style (Prominent in Produce mode) */}
                        {mode === 'produce' && (
                            <div className="animate-fade-in">
                                <label className="block text-sm font-semibold text-text-muted mb-2">סוג המסמך להפקה</label>
                                <div className="flex flex-col gap-2">
                                    {docTypes.map((type) => (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, type: type.id as any }))}
                                            className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between group ${
                                                formData.type === type.id 
                                                ? 'border-primary-500 bg-primary-50 text-primary-900 shadow-sm' 
                                                : 'border-border-default bg-white text-text-default hover:border-primary-200'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`${formData.type === type.id ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-500'}`}>
                                                    {type.icon}
                                                </div>
                                                <span className="font-bold text-sm">{type.label}</span>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${formData.type === type.id ? 'border-primary-600 bg-primary-600' : 'border-gray-300'}`}>
                                                {formData.type === type.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* In Edit mode, allow changing type via simple dropdown to save space */}
                        {mode === 'edit' && (
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">סוג המסמך</label>
                                <select 
                                    value={formData.type} 
                                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                                    className="w-full bg-bg-input border border-border-default rounded-xl p-2.5 text-sm"
                                >
                                    {docTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Status / Payment Toggle */}
                        {(formData.type === 'invoice_receipt' || formData.type === 'receipt') && (
                             <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-green-100 rounded-full text-green-700">
                                        <CheckCircleIcon className="w-5 h-5"/>
                                    </div>
                                    <div>
                                        <span className="block text-sm font-bold text-green-900">המסמך יסומן כ"שולם" אוטומטית</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {formData.type !== 'invoice_receipt' && formData.type !== 'receipt' && (
                             <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-green-100 rounded-full text-green-700">
                                        <CheckCircleIcon className="w-5 h-5"/>
                                    </div>
                                    <div>
                                        <span className="block text-sm font-bold text-green-900">לסמן שהתשלום התקבל?</span>
                                        <span className="block text-xs text-green-700">עדכון זה ישפיע על הדשבורד הראשי</span>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={formData.status === 'paid'} 
                                        onChange={handlePaymentReceivedToggle} 
                                        className="sr-only peer" 
                                    />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                </label>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Client & Candidate */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider border-b border-border-default pb-1 mb-2">פרטי מסמך</h4>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-text-default mb-1.5">לקוח משלם</label>
                                    <div className="relative">
                                        <BuildingOffice2Icon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                        <input 
                                            type="text" 
                                            name="clientName"
                                            value={formData.clientName}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500"
                                            required
                                        />
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-semibold text-text-default mb-1.5">עבור השמת מועמד/ת</label>
                                    <input 
                                        type="text" 
                                        name="candidateName"
                                        value={formData.candidateName}
                                        onChange={handleChange}
                                        className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                        required
                                    />
                                </div>

                                 <div>
                                    <label className="block text-sm font-semibold text-text-default mb-1.5">סכום בפועל (לפני מע"מ)</label>
                                    <div className="relative">
                                        <BanknotesIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                        <input 
                                            type="number" 
                                            name="amount"
                                            value={formData.amount}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-lg font-bold text-text-default focus:ring-2 focus:ring-primary-500"
                                            required
                                        />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">₪</span>
                                    </div>
                                </div>
                            </div>

                            {/* Dates & Terms */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider border-b border-border-default pb-1 mb-2">תאריכים</h4>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-text-default mb-1.5">תאריך השמה</label>
                                        <input 
                                            type="date" 
                                            name="placementDate"
                                            value={formData.placementDate}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-default mb-1.5">תאריך המסמך</label>
                                        <input 
                                            type="date" 
                                            name="issueDate"
                                            value={formData.issueDate}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                        />
                                    </div>
                                     <div>
                                        <label className="block text-sm font-semibold text-text-default mb-1.5">תאריך תשלום בפועל</label>
                                        <input 
                                            type="date" 
                                            name="dueDate"
                                            value={formData.dueDate}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 font-medium text-red-600"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-text-default mb-1.5">תנאי תשלום</label>
                                    <select 
                                        name="paymentTerms"
                                        value={formData.paymentTerms}
                                        onChange={handleTermsChange}
                                        className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary-500"
                                    >
                                        <option value="מיידי">מיידי</option>
                                        <option value="שוטף + 30">שוטף + 30</option>
                                        <option value="שוטף + 45">שוטף + 45</option>
                                        <option value="שוטף + 60">שוטף + 60</option>
                                        <option value="שוטף + 90">שוטף + 90</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                             <div>
                                <label className="block text-sm font-semibold text-text-default mb-1.5">הערות למסמך (יופיעו ע"ג החשבונית)</label>
                                <textarea 
                                    name="notes"
                                    value={formData.notes}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                                    placeholder="הערות שיופיעו במסמך..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">הערות פנימיות (לגבייה)</label>
                                <textarea 
                                    name="internalNotes"
                                    value={formData.internalNotes}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-yellow-500 resize-none text-text-default"
                                    placeholder="הערות פנימיות למעקב..."
                                />
                            </div>
                        </div>

                        {/* History Log Section */}
                        {mode === 'edit' && formData.history && formData.history.length > 0 && (
                            <div className="pt-4 border-t border-border-default">
                                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">היסטוריית שינויים</h4>
                                <div className="space-y-3 bg-bg-subtle/30 p-3 rounded-xl max-h-40 overflow-y-auto custom-scrollbar">
                                    {formData.history.slice().reverse().map((item, index) => (
                                        <div key={index} className="flex items-start gap-3 text-xs">
                                            <div className="bg-bg-card p-1 rounded-full border border-border-default text-text-subtle mt-0.5">
                                                <ClockIcon className="w-3 h-3"/>
                                            </div>
                                            <div>
                                                <p className="text-text-default font-medium">{item.action}</p>
                                                <p className="text-text-muted">
                                                    {new Date(item.date).toLocaleString('he-IL')} &bull; {item.user}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </form>

                {/* Footer */}
                <footer className="p-5 border-t border-border-default bg-bg-subtle flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors"
                    >
                        ביטול
                    </button>
                    {mode === 'produce' ? (
                        <>
                            <button 
                                onClick={(e) => { 
                                    setFormData(p => ({
                                        ...p, 
                                        status: 'draft',
                                        history: [...(p.history || []), { date: new Date().toISOString(), action: 'נשמר כטיוטה', user: 'אני' }]
                                    })); 
                                    onSave({...formData, status: 'draft', history: [...(formData.history || []), { date: new Date().toISOString(), action: 'נשמר כטיוטה', user: 'אני' }] });
                                    onClose();
                                }}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-primary-700 bg-primary-100 hover:bg-primary-200 transition-colors"
                            >
                                שמור כטיוטה
                            </button>
                            <button 
                                onClick={(e) => { 
                                    const finalData: InvoiceData = {
                                        ...formData, 
                                        status: formData.type === 'receipt' || formData.type === 'invoice_receipt' ? 'paid' : 'sent',
                                        history: [...(formData.history || []), { date: new Date().toISOString(), action: 'הופק ונשלח ללקוח', user: 'אני' }]
                                    };
                                    onSave(finalData);
                                    onClose();
                                }}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all flex items-center gap-2"
                            >
                                <PrinterIcon className="w-4 h-4" />
                                הפק מסמך
                            </button>
                        </>
                    ) : (
                        <button 
                            onClick={(e) => { 
                                const finalData = {
                                    ...formData,
                                    history: [...(formData.history || []), { date: new Date().toISOString(), action: 'עודכן ידנית', user: 'אני' }]
                                };
                                onSave(finalData);
                                onClose();
                            }}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all"
                        >
                            שמור שינויים
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default InvoiceFormModal;
