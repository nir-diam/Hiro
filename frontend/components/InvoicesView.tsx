
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, ArrowPathIcon, DocumentTextIcon, PrinterIcon, CalendarDaysIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, PlusIcon,
    ClockIcon, ArchiveBoxIcon, PencilIcon, ChevronDownIcon, ChatBubbleBottomCenterTextIcon,
    EyeIcon, PaperAirplaneIcon
} from './Icons';
import InvoiceFormModal, { InvoiceData, HistoryItem, RelatedDocument } from './InvoiceFormModal';
import ActivityLogModal from './ActivityLogModal';
import DocumentViewerModal from './DocumentViewerModal';
import { useFinance, InvoiceData as ContextInvoiceData } from '../context/FinanceContext';

const InvoicesView: React.FC = () => {
    const { invoices, updateInvoice, addInvoice } = useFinance();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'open' | 'overdue' | 'paid' | 'draft'>('all');
    
    // Date Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState<ContextInvoiceData | null>(null);
    const [modalMode, setModalMode] = useState<'edit' | 'produce'>('edit');

    // Log Modal State
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [activeLogInvoice, setActiveLogInvoice] = useState<ContextInvoiceData | null>(null);

    // Document Viewer State
    const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);
    const [viewingDoc, setViewingDoc] = useState<{title: string, client: string} | null>(null);

    // Dropdowns States
    const [openStatusId, setOpenStatusId] = useState<number | null>(null);
    const [docsMenuOpenId, setDocsMenuOpenId] = useState<number | null>(null);
    
    const statusMenuRef = useRef<HTMLDivElement>(null);
    const docsMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Close status menu
            if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
                setOpenStatusId(null);
            }
            // Close docs menu
            if (docsMenuRef.current && !docsMenuRef.current.contains(event.target as Node)) {
                setDocsMenuOpenId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    // Derived Data
    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            const matchesSearch = 
                inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                inv.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (inv.invoiceNumber && inv.invoiceNumber.includes(searchTerm));
            
            let matchesTab = true;
            if (activeTab === 'open') matchesTab = inv.status === 'sent';
            if (activeTab === 'overdue') matchesTab = inv.status === 'overdue';
            if (activeTab === 'paid') matchesTab = inv.status === 'paid';
            if (activeTab === 'draft') matchesTab = inv.status === 'draft';

            let matchesDate = true;
            if (startDate) matchesDate = matchesDate && new Date(inv.issueDate) >= new Date(startDate);
            if (endDate) matchesDate = matchesDate && new Date(inv.issueDate) <= new Date(endDate);

            return matchesSearch && matchesTab && matchesDate;
        });
    }, [invoices, searchTerm, activeTab, startDate, endDate]);

    const stats = useMemo(() => {
        const open = invoices.filter(i => i.status === 'sent').reduce((acc, c) => acc + c.amount, 0);
        const overdue = invoices.filter(i => i.status === 'overdue').reduce((acc, c) => acc + c.amount, 0);
        const paid = invoices.filter(i => i.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
        const drafts = invoices.filter(i => i.status === 'draft').length;
        return { open, overdue, paid, drafts };
    }, [invoices]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    const handleCreateNew = () => {
        setEditingInvoice(null);
        setModalMode('produce'); 
        setIsModalOpen(true);
    };

    const handleEdit = (invoice: ContextInvoiceData) => {
        setEditingInvoice(invoice);
        setModalMode('edit');
        setIsModalOpen(true);
    };
    
    const handleOpenLog = (invoice: ContextInvoiceData) => {
        setActiveLogInvoice(invoice);
        setIsLogModalOpen(true);
    };

    const handleViewDocument = (invoice: ContextInvoiceData) => {
        // Check if there are multiple documents
        if (invoice.relatedDocuments && invoice.relatedDocuments.length > 0) {
            setDocsMenuOpenId(invoice.id);
        } else {
            // Only one document (the current one)
            openDocViewer(`${getTypeLabel(invoice.type)} #${invoice.invoiceNumber || 'טיוטה'}`, invoice.clientName);
        }
    };
    
    const openDocViewer = (title: string, clientName: string) => {
        setViewingDoc({ title, client: clientName });
        setIsDocViewerOpen(true);
        setDocsMenuOpenId(null);
    };

    const handleSendReminder = (invoice: ContextInvoiceData) => {
        alert(`נשלחה תזכורת במייל ללקוח ${invoice.clientName} עבור חשבונית ${invoice.invoiceNumber}`);
    };

    const handleAddLogNote = (note: string) => {
        if (!activeLogInvoice || !activeLogInvoice.id) return;
        
        const newHistoryItem = {
            date: new Date().toISOString(),
            action: note,
            user: 'אני'
        };

        const updatedInvoice: ContextInvoiceData = { 
            ...activeLogInvoice, 
            id: activeLogInvoice.id, // Ensure ID is present
            history: [...(activeLogInvoice.history || []), newHistoryItem] 
        };
        updateInvoice(updatedInvoice);
        setActiveLogInvoice(updatedInvoice);
    };

    const handleProduceDocument = (invoice: ContextInvoiceData) => {
        setEditingInvoice(invoice);
        setModalMode('produce');
        setIsModalOpen(true);
    };

    const handleSave = (data: InvoiceData) => {
        // If we are editing an existing invoice (and mode is NOT produce), update it.
        // If mode IS produce, we treat it as creating a NEW one based on the old one.
        if (modalMode === 'edit' && editingInvoice && editingInvoice.id) {
            // Check if status changed
            const original = invoices.find(i => i.id === editingInvoice.id);
            let newHistory = data.history || [];
            
            if (original && original.status !== data.status) {
                 newHistory.push({
                     date: new Date().toISOString(),
                     action: `סטטוס שונה מ-${getStatusLabel(original.status)} ל-${getStatusLabel(data.status)}`,
                     user: 'אני'
                 });
            }
            updateInvoice({ ...data, id: editingInvoice.id, history: newHistory } as ContextInvoiceData);
        } else {
            // Create new (Produce mode or completely new)
            const newInvoice: ContextInvoiceData = {
                ...data,
                id: Date.now(),
                invoiceNumber: `INV-2025-${Math.floor(Math.random()*1000)}`, // Simulate new number
                history: [{ date: new Date().toISOString(), action: 'מסמך נוצר', user: 'אני' }]
            };
            addInvoice(newInvoice);
        }
        setIsModalOpen(false);
    };

    const handleStatusChange = (id: number, newStatus: InvoiceData['status']) => {
        const inv = invoices.find(i => i.id === id);
        if (inv) {
            const updatedInv = {
                ...inv,
                status: newStatus,
                history: [
                    ...(inv.history || []),
                    {
                        date: new Date().toISOString(),
                        action: `שינוי סטטוס מהיר ל-${getStatusLabel(newStatus)}`,
                        user: 'אני'
                    }
                ]
            };
            updateInvoice(updatedInv);
        }
        setOpenStatusId(null);
    };

    const getStatusStyle = (status: string) => {
        switch(status) {
            case 'paid': return 'bg-green-100 text-green-800 border-green-200';
            case 'sent': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200';
            case 'overdue': return 'bg-red-100 text-red-800 border-red-200';
            case 'canceled': return 'bg-slate-200 text-slate-600 border-slate-300';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusLabel = (status: string) => {
        switch(status) {
            case 'paid': return 'שולם';
            case 'sent': return 'נשלח';
            case 'draft': return 'טיוטה';
            case 'overdue': return 'באיחור';
            case 'canceled': return 'בוטל';
            default: return status;
        }
    };
    
    const getTypeLabel = (type: string) => {
        switch(type) {
             case 'proforma': return 'דרישת תשלום';
             case 'tax_invoice': return 'חשבונית מס';
             case 'invoice_receipt': return 'חשבונית מס/קבלה';
             case 'receipt': return 'קבלה';
             default: return 'מסמך';
        }
    };

    const getStatusIcon = (status: string) => {
        switch(status) {
            case 'paid': return <CheckCircleIcon className="w-3.5 h-3.5"/>;
            case 'overdue': return <ExclamationTriangleIcon className="w-3.5 h-3.5"/>;
            case 'draft': return <DocumentTextIcon className="w-3.5 h-3.5"/>;
            case 'sent': return <ArrowPathIcon className="w-3.5 h-3.5"/>;
            default: return null;
        }
    };

    const StatBox: React.FC<{ label: string; value: string | number; colorClass: string; icon: React.ReactNode }> = ({ label, value, colorClass, icon }) => (
        <div className="bg-bg-card border border-border-default rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
            <div>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-xl font-black ${colorClass}`}>{value}</p>
            </div>
            <div className={`p-3 rounded-xl ${colorClass.replace('text-', 'bg-').replace('600', '100').replace('500', '100').replace('800', '100')}`}>
                {icon}
            </div>
        </div>
    );

    const statusOptions: { value: InvoiceData['status'], label: string }[] = [
        { value: 'draft', label: 'טיוטה' },
        { value: 'sent', label: 'נשלח (פתוח)' },
        { value: 'paid', label: 'שולם' },
        { value: 'overdue', label: 'באיחור' },
        { value: 'canceled', label: 'בוטל' },
    ];

    return (
        <div className="h-full flex flex-col space-y-6">
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            
            {/* Header Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
                <StatBox 
                    label="צפי גבייה (פתוח)" 
                    value={formatCurrency(stats.open)} 
                    colorClass="text-blue-600"
                    icon={<ClockIcon className="w-6 h-6 text-blue-600"/>}
                />
                <StatBox 
                    label="חוב בפיגור" 
                    value={formatCurrency(stats.overdue)} 
                    colorClass="text-red-600"
                    icon={<ExclamationTriangleIcon className="w-6 h-6 text-red-600"/>}
                />
                 <StatBox 
                    label="שולם החודש" 
                    value={formatCurrency(stats.paid)} 
                    colorClass="text-green-600"
                    icon={<CheckCircleIcon className="w-6 h-6 text-green-600"/>}
                />
                 <StatBox 
                    label="טיוטות להפקה" 
                    value={stats.drafts} 
                    colorClass="text-gray-600"
                    icon={<DocumentTextIcon className="w-6 h-6 text-gray-600"/>}
                />
            </div>

            {/* Main Content Area */}
            <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default flex-1 flex flex-col overflow-hidden animate-fade-in">
                
                {/* Toolbar */}
                <div className="p-4 border-b border-border-default flex flex-col xl:flex-row justify-between items-center gap-4 bg-bg-subtle/30">
                    
                    {/* Tabs */}
                    <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default overflow-x-auto max-w-full">
                        {[
                            { id: 'all', label: 'כל המסמכים' },
                            { id: 'open', label: 'פתוח לתשלום' },
                            { id: 'overdue', label: 'באיחור' },
                            { id: 'paid', label: 'שולם' },
                            { id: 'draft', label: 'טיוטות' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${
                                    activeTab === tab.id 
                                        ? 'bg-white text-primary-700 shadow-sm' 
                                        : 'text-text-muted hover:text-text-default hover:bg-white/50'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
                        
                        {/* Date Filter */}
                         <div className="flex items-center gap-2 bg-white border border-border-default rounded-xl px-2 py-1 shadow-sm">
                            <span className="text-xs font-semibold text-text-muted whitespace-nowrap">מתאריך:</span>
                            <input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)} 
                                className="bg-transparent text-sm border-none focus:ring-0 p-1 w-28"
                            />
                            <div className="w-px h-4 bg-border-default mx-1"></div>
                            <span className="text-xs font-semibold text-text-muted whitespace-nowrap">עד תאריך:</span>
                            <input 
                                type="date" 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)} 
                                className="bg-transparent text-sm border-none focus:ring-0 p-1 w-28"
                            />
                        </div>

                        <div className="relative flex-grow sm:flex-grow-0 sm:w-64">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder="חיפוש לפי לקוח, מועמד או מס׳..." 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="w-full bg-bg-input border border-border-default rounded-xl py-2 pl-3 pr-9 text-sm focus:ring-2 focus:ring-primary-500/20" 
                            />
                        </div>
                        <button 
                            onClick={handleCreateNew}
                            className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition shadow-md whitespace-nowrap"
                        >
                            <PlusIcon className="w-5 h-5"/>
                            <span className="hidden sm:inline">הפק מסמך חדש</span>
                            <span className="sm:hidden">חדש</span>
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-right text-sm">
                        <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-10">
                            <tr>
                                <th className="p-4">מס׳ מסמך</th>
                                <th className="p-4">תאריך</th>
                                <th className="p-4">לקוח</th>
                                <th className="p-4">עבור מועמד/ת</th>
                                <th className="p-4">סכום (לפני מע"מ)</th>
                                <th className="p-4">תאריך יעד</th>
                                <th className="p-4">סטטוס</th>
                                <th className="p-4 text-center">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {filteredInvoices.map((inv) => (
                                <tr key={inv.id} className="hover:bg-bg-hover/50 transition-colors group">
                                    <td className="p-4 font-mono font-medium text-primary-700 flex items-center gap-2">
                                        {inv.type === 'tax_invoice' && (
                                            <span title="חשבונית מס">
                                                <PrinterIcon className="w-3.5 h-3.5 text-text-subtle" />
                                            </span>
                                        )}
                                        {inv.type === 'proforma' && (
                                            <span title="דרישת תשלום">
                                                <DocumentTextIcon className="w-3.5 h-3.5 text-text-subtle" />
                                            </span>
                                        )}
                                        {inv.invoiceNumber}
                                    </td>
                                    <td className="p-4 text-text-default">{new Date(inv.issueDate).toLocaleDateString('he-IL')}</td>
                                    <td className="p-4 font-bold text-text-default">{inv.clientName}</td>
                                    <td className="p-4 text-text-muted">{inv.candidateName}</td>
                                    <td className="p-4 font-mono font-bold text-text-default">{formatCurrency(inv.amount)}</td>
                                    <td className="p-4 text-text-muted">{new Date(inv.dueDate).toLocaleDateString('he-IL')}</td>
                                    <td className="p-4 relative">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setOpenStatusId(openStatusId === inv.id ? null : inv.id); }}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all hover:scale-105 ${getStatusStyle(inv.status)}`}
                                        >
                                            {getStatusIcon(inv.status)}
                                            {getStatusLabel(inv.status)}
                                            <ChevronDownIcon className="w-3 h-3 opacity-50"/>
                                        </button>

                                        {/* Status Dropdown */}
                                        {openStatusId === inv.id && (
                                            <div 
                                                ref={statusMenuRef}
                                                className="absolute top-full right-0 mt-1 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {statusOptions.map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => handleStatusChange(inv.id!, opt.value)}
                                                        className={`w-full text-right px-4 py-2 text-xs font-semibold hover:bg-bg-hover flex items-center gap-2 ${inv.status === opt.value ? 'bg-primary-50 text-primary-700' : 'text-text-default'}`}
                                                    >
                                                        <span className={`w-2 h-2 rounded-full ${opt.value === 'paid' ? 'bg-green-500' : opt.value === 'overdue' ? 'bg-red-500' : 'bg-gray-400'}`}></span>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* View/Eye Button - With Multiple Docs Support */}
                                            <div className="relative">
                                                 <button 
                                                    onClick={(e) => { e.stopPropagation(); handleViewDocument(inv); }} 
                                                    className="p-1.5 text-text-subtle hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title={inv.relatedDocuments?.length ? "צפה במסמכים מקושרים" : "צפה בחשבונית (PDF)"}
                                                >
                                                    <EyeIcon className="w-4 h-4"/>
                                                    {inv.relatedDocuments && inv.relatedDocuments.length > 0 && (
                                                        <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-white">
                                                            {inv.relatedDocuments.length}
                                                        </span>
                                                    )}
                                                </button>
                                                {/* Multiple Docs Dropdown */}
                                                {docsMenuOpenId === inv.id && inv.relatedDocuments && (
                                                    <div 
                                                        ref={docsMenuRef}
                                                        className="absolute top-full right-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-30 p-1"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <div className="text-[10px] font-bold text-text-muted px-2 py-1 bg-bg-subtle/50 mb-1 rounded">מסמכים מקושרים</div>
                                                        {inv.relatedDocuments.map((doc, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => openDocViewer(`${getTypeLabel(doc.type)} #${doc.number}`, inv.clientName)}
                                                                className="w-full text-right px-2 py-2 text-xs hover:bg-bg-hover rounded flex items-center gap-2 transition-colors border-b border-border-default last:border-0"
                                                            >
                                                                <div className="p-1 bg-primary-50 text-primary-600 rounded">
                                                                    {doc.type === 'proforma' ? <DocumentTextIcon className="w-3 h-3"/> : <PrinterIcon className="w-3 h-3"/>}
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-text-default">{getTypeLabel(doc.type)}</span>
                                                                    <span className="text-text-muted">{doc.number} • {new Date(doc.date).toLocaleDateString('he-IL')}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <button 
                                                onClick={() => handleSendReminder(inv)} 
                                                className="p-1.5 text-text-subtle hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                                title="שלח תזכורת"
                                            >
                                                <PaperAirplaneIcon className="w-4 h-4"/>
                                            </button>
                                             <button 
                                                onClick={() => handleOpenLog(inv)} 
                                                className="p-1.5 text-text-subtle hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                title="יומן פעילות"
                                            >
                                                <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/>
                                            </button>
                                            <button 
                                                onClick={() => handleEdit(inv)} 
                                                className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                title="ערוך פרטים"
                                            >
                                                <PencilIcon className="w-4 h-4"/>
                                            </button>
                                            <button 
                                                onClick={() => handleProduceDocument(inv)}
                                                className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                title="הפקת מסמך"
                                            >
                                                <PrinterIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredInvoices.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-text-muted">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <ArchiveBoxIcon className="w-12 h-12 opacity-20"/>
                                            <span>לא נמצאו מסמכים התואמים לחיפוש</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            <InvoiceFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                initialData={editingInvoice}
                mode={modalMode} 
            />

            {/* Log Modal */}
            {activeLogInvoice && (
                <ActivityLogModal
                    isOpen={isLogModalOpen}
                    onClose={() => setIsLogModalOpen(false)}
                    title="יומן פעילות וגבייה"
                    entityId={activeLogInvoice.invoiceNumber || String(activeLogInvoice.id)}
                    history={activeLogInvoice.history || []}
                    onAddNote={handleAddLogNote}
                />
            )}
            
            {/* Document Viewer Modal */}
            {viewingDoc && (
                <DocumentViewerModal
                    isOpen={isDocViewerOpen}
                    onClose={() => setIsDocViewerOpen(false)}
                    documentTitle={viewingDoc.title}
                    clientName={viewingDoc.client}
                    // Mock URL logic could go here or use empty for simulated view
                />
            )}
        </div>
    );
};

export default InvoicesView;
