
import React, { createContext, useState, useContext, ReactNode } from 'react';

// --- Types ---
export interface HistoryItem {
    date: string;
    action: string;
    user: string;
}

export interface RelatedDocument {
    id: string; // unique identifier for the doc
    type: 'proforma' | 'tax_invoice' | 'invoice_receipt' | 'receipt';
    number: string;
    date: string;
    amount?: number;
}

export interface InvoiceData {
    id: number;
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
    relatedDocuments?: RelatedDocument[]; // NEW: List of related documents
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
    id: number;
    recruiterName: string;
    recruiterType: 'freelance' | 'employee' | 'agency';
    candidateName: string;
    placementDate: string;
    invoiceAmount: number;
    commissionPercent: number;
    commissionAmount: number;
    installments: Installment[];
    status: 'paid' | 'partial' | 'pending' | 'invoice_pending';
    notes?: string;
    history?: HistoryItem[];
}

// --- Mock Data ---
const initialInvoices: InvoiceData[] = [
    { 
        id: 1, invoiceNumber: 'TEMP-001', issueDate: '2025-12-14', dueDate: '2026-01-07', clientName: 'מיכל אפרת', candidateName: 'מיכל אפרת', amount: 15000, status: 'draft', type: 'proforma', placementDate: '07/01/2026', notes: '', internalNotes: '', paymentTerms: 'שוטף + 30',
        history: [{ date: '2025-12-14T10:00:00', action: 'נוצר כטיוטה', user: 'מערכת' }]
    },
    { 
        id: 2, invoiceNumber: 'TEMP-002', issueDate: '2025-12-14', dueDate: '2025-12-14', clientName: 'רייטר נידם', candidateName: 'רייטר נידם', amount: 12000, status: 'sent', type: 'proforma', placementDate: '14/12/2025', notes: '', internalNotes: '', paymentTerms: 'מיידי',
        history: [{ date: '2025-12-14T11:00:00', action: 'נשלח ללקוח', user: 'אני' }]
    },
    { 
        id: 3, invoiceNumber: 'INV-2024-88', issueDate: '2025-12-14', dueDate: '2025-12-14', clientName: 'רגינה כרמי', candidateName: 'רגינה כרמי', amount: 8000, status: 'overdue', type: 'tax_invoice', placementDate: '14/12/2025', notes: '', internalNotes: '', paymentTerms: 'מיידי',
        history: [{ date: '2025-12-14T09:00:00', action: 'חשבונית הופקה', user: 'מערכת' }]
    },
    { 
        id: 4, invoiceNumber: 'TEMP-004', issueDate: '2025-12-14', dueDate: '2025-12-14', clientName: 'גואל כהן', candidateName: 'גואל כהן', amount: 7500, status: 'draft', type: 'proforma', placementDate: '14/12/2025', notes: '', internalNotes: '', paymentTerms: 'מיידי',
        history: []
    },
    { 
        id: 5, invoiceNumber: 'TEMP-005', issueDate: '2025-12-10', dueDate: '2025-12-10', clientName: 'יפתח דביר', candidateName: 'יפתח דביר', amount: 10000, status: 'sent', type: 'proforma', placementDate: '10/12/2025', notes: '', internalNotes: '', paymentTerms: 'מיידי',
        history: []
    },
    { 
        id: 6, invoiceNumber: 'INV-2024-85', issueDate: '2025-12-07', dueDate: '2025-12-07', clientName: 'רדה אגייב', candidateName: 'רדה אגייב', amount: 7500, status: 'paid', type: 'tax_invoice', placementDate: '07/12/2025', notes: '', internalNotes: '', paymentTerms: 'מיידי',
        history: [{ date: '2025-12-07T14:30:00', action: 'סומן כשולם', user: 'אני' }],
        relatedDocuments: [
            { id: 'rel_1', type: 'proforma', number: 'DEMAND-102', date: '2025-11-20', amount: 7500 },
            { id: 'rel_2', type: 'tax_invoice', number: 'INV-2024-85', date: '2025-12-07', amount: 7500 }
        ]
    },
];

const initialCommissions: CommissionData[] = [
    { 
        id: 1, recruiterName: 'קרן גיטמן', recruiterType: 'freelance', candidateName: 'אביטל', placementDate: '2025-12-14', invoiceAmount: 15000, commissionPercent: 30, commissionAmount: 4500, status: 'partial',
        installments: [
            { id: 1, dueDate: '2026-01-14', amount: 2250, isPaid: true },
            { id: 2, dueDate: '2026-02-14', amount: 2250, isPaid: false }
        ],
        history: [{ date: '2025-12-14T10:00:00', action: 'נוצר דרישת תשלום', user: 'מערכת' }]
    },
    { 
        id: 2, recruiterName: 'רויטל נידם', recruiterType: 'employee', candidateName: 'קרן גיטמן', placementDate: '2025-12-14', invoiceAmount: 12000, commissionPercent: 20, commissionAmount: 2400, status: 'pending',
        installments: [{ id: 1, dueDate: '2026-01-10', amount: 2400, isPaid: false }],
        history: []
    },
    { 
        id: 3, recruiterName: 'מיכל אסרף', recruiterType: 'agency', candidateName: 'רויטל נידם', placementDate: '2025-12-14', invoiceAmount: 18000, commissionPercent: 15, commissionAmount: 2700, status: 'invoice_pending',
        installments: [{ id: 1, dueDate: '2026-02-01', amount: 2700, isPaid: false }],
        history: []
    },
    { 
        id: 4, recruiterName: 'יפתח דביר', recruiterType: 'freelance', candidateName: 'מיכל אסרף', placementDate: '2025-11-12', invoiceAmount: 20000, commissionPercent: 30, commissionAmount: 6000, status: 'paid',
        installments: [{ id: 1, dueDate: '2025-12-12', amount: 6000, isPaid: true }],
        history: []
    },
];

interface FinanceContextType {
    invoices: InvoiceData[];
    commissions: CommissionData[];
    addInvoice: (invoice: InvoiceData) => void;
    updateInvoice: (invoice: InvoiceData) => void;
    addCommission: (commission: CommissionData) => void;
    updateCommission: (commission: CommissionData) => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [invoices, setInvoices] = useState<InvoiceData[]>(initialInvoices);
    const [commissions, setCommissions] = useState<CommissionData[]>(initialCommissions);

    const addInvoice = (invoice: InvoiceData) => {
        setInvoices(prev => [invoice, ...prev]);
    };

    const updateInvoice = (updatedInvoice: InvoiceData) => {
        setInvoices(prev => prev.map(inv => inv.id === updatedInvoice.id ? updatedInvoice : inv));
    };

    const addCommission = (commission: CommissionData) => {
        setCommissions(prev => [commission, ...prev]);
    };

    const updateCommission = (updatedCommission: CommissionData) => {
        setCommissions(prev => prev.map(comm => comm.id === updatedCommission.id ? updatedCommission : comm));
    };

    return (
        <FinanceContext.Provider value={{ invoices, commissions, addInvoice, updateInvoice, addCommission, updateCommission }}>
            {children}
        </FinanceContext.Provider>
    );
};

export const useFinance = () => {
    const context = useContext(FinanceContext);
    if (context === undefined) {
        throw new Error('useFinance must be used within a FinanceProvider');
    }
    return context;
};
