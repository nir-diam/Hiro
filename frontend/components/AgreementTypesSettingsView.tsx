
import React, { useState, useMemo, useEffect } from 'react';
import { 
    PlusIcon, MagnifyingGlassIcon, TableCellsIcon, Squares2X2Icon, 
    PencilIcon, TrashIcon, XMarkIcon, CheckCircleIcon, InformationCircleIcon,
    DocumentTextIcon // Using existing icon
} from './Icons';

// --- TYPES ---
interface Installment {
    id: number;
    percent: number;
    daysAfterStart: number;
}

interface AgreementType {
    id: number;
    name: string;
    installments: Installment[];
    totalPercent: number;
}

// --- MOCK DATA ---
const initialAgreements: AgreementType[] = [
    {
        id: 1,
        name: 'הסכם 90 לאחר 30',
        installments: [{ id: 1, percent: 90, daysAfterStart: 30 }],
        totalPercent: 90,
    },
    {
        id: 2,
        name: 'הסכם 80 מדורג 60',
        installments: [
            { id: 1, percent: 40, daysAfterStart: 30 },
            { id: 2, percent: 40, daysAfterStart: 60 }
        ],
        totalPercent: 80,
    },
    {
        id: 3,
        name: 'הסכם מדורג 3 חודשים 90%',
        installments: [
            { id: 1, percent: 30, daysAfterStart: 30 },
            { id: 2, percent: 30, daysAfterStart: 60 },
            { id: 3, percent: 30, daysAfterStart: 90 }
        ],
        totalPercent: 90,
    },
    {
        id: 4,
        name: 'הסכם 100 לאחר 30',
        installments: [{ id: 1, percent: 100, daysAfterStart: 30 }],
        totalPercent: 100,
    }
];

// --- MODAL COMPONENT ---
const AgreementModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (agreement: AgreementType) => void;
    agreementToEdit?: AgreementType | null;
}> = ({ isOpen, onClose, onSave, agreementToEdit }) => {
    const [name, setName] = useState('');
    const [installmentsCount, setInstallmentsCount] = useState(1);
    const [installments, setInstallments] = useState<Installment[]>([{ id: 1, percent: 100, daysAfterStart: 30 }]);
    
    useEffect(() => {
        if (isOpen) {
            if (agreementToEdit) {
                setName(agreementToEdit.name);
                setInstallments(JSON.parse(JSON.stringify(agreementToEdit.installments))); // Deep copy
                setInstallmentsCount(agreementToEdit.installments.length);
            } else {
                setName('');
                setInstallmentsCount(1);
                setInstallments([{ id: 1, percent: 100, daysAfterStart: 30 }]);
            }
        }
    }, [isOpen, agreementToEdit]);

    const handleSetInstallmentsCount = (count: number) => {
        setInstallmentsCount(count);
        const newInstallments = [...installments];
        
        // If increasing
        if (count > newInstallments.length) {
            for (let i = newInstallments.length; i < count; i++) {
                // Default logic: Split remaining percent or set to 0, increment days by 30
                newInstallments.push({ id: i + 1, percent: 0, daysAfterStart: (i + 1) * 30 });
            }
        } 
        // If decreasing
        else {
            newInstallments.splice(count);
        }
        setInstallments(newInstallments);
    };

    const updateInstallment = (index: number, field: keyof Installment, value: number) => {
        const newInstallments = [...installments];
        newInstallments[index] = { ...newInstallments[index], [field]: value };
        setInstallments(newInstallments);
    };

    const totalPercent = installments.reduce((acc, curr) => acc + curr.percent, 0);

    const handleSave = () => {
        if (!name.trim()) return;
        
        const newAgreement: AgreementType = {
            id: agreementToEdit ? agreementToEdit.id : Date.now(),
            name,
            installments,
            totalPercent,
        };
        onSave(newAgreement);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">
                        {agreementToEdit ? 'עריכת סוג הסכם' : 'יצירת סוג הסכם חדש'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>

                <div className="p-6 space-y-6">
                    {/* Name Input */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 text-right">שם ההסכם</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            placeholder='לדוגמה: "הסכם מדורג חודשיים 80%"'
                            className="w-full bg-white border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none text-right"
                            dir="rtl"
                            autoFocus
                        />
                    </div>

                    {/* Installments Tabs */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-3 text-right">מספר תשלומים</label>
                        <div className="flex gap-2 w-full">
                            {[1, 2, 3].map(num => (
                                <button
                                    key={num}
                                    onClick={() => handleSetInstallmentsCount(num)}
                                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg border-2 transition-all ${
                                        installmentsCount === num 
                                        ? 'border-purple-500 bg-purple-50 text-purple-700' 
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-purple-200'
                                    }`}
                                >
                                    {num === 1 ? '1 תשלום' : `${num} תשלומים`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dynamic Inputs for Installments */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                        <div className="grid grid-cols-6 gap-4 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">
                            <span className="col-span-2 text-right">אחוז מהשכר (%)</span>
                            <span className="col-span-2 text-right">ימים לאחר התחלה</span>
                            <span className="col-span-2 text-right">תשלום</span>
                        </div>
                        
                        {installments.map((inst, index) => (
                            <div key={index} className="grid grid-cols-6 gap-4 items-center">
                                <div className="col-span-2 relative">
                                    <input 
                                        type="number" 
                                        value={inst.percent} 
                                        onChange={e => updateInstallment(index, 'percent', Number(e.target.value))}
                                        className="w-full bg-white border border-gray-300 rounded-lg p-2 pr-2 pl-8 text-center font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                                </div>
                                <div className="col-span-2 relative">
                                    <input 
                                        type="number" 
                                        value={inst.daysAfterStart} 
                                        onChange={e => updateInstallment(index, 'daysAfterStart', Number(e.target.value))}
                                        className="w-full bg-white border border-gray-300 rounded-lg p-2 text-center font-bold focus:ring-1 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <div className="col-span-2 text-right text-sm font-bold text-gray-800 px-2">
                                     חלק {index + 1}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Bar */}
                    <div className={`p-3 rounded-lg flex justify-between items-center text-sm font-bold ${totalPercent === 100 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-orange-50 text-orange-800 border border-orange-200'}`}>
                        <span className="flex items-center gap-1.5">
                            {totalPercent === 100 ? <CheckCircleIcon className="w-5 h-5"/> : <InformationCircleIcon className="w-5 h-5"/>}
                             סה"כ אחוזים לתשלום:
                        </span>
                        <span dir="ltr">{totalPercent}%</span>
                    </div>
                </div>

                <footer className="p-5 border-t border-gray-100 bg-white flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition">ביטול</button>
                    <button onClick={handleSave} className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 shadow-sm transition-all">שמור הסכם</button>
                </footer>
            </div>
        </div>
    );
};

// --- MAIN VIEW ---
const AgreementTypesSettingsView: React.FC = () => {
    const [agreements, setAgreements] = useState<AgreementType[]>(initialAgreements);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAgreement, setEditingAgreement] = useState<AgreementType | null>(null);

    const filteredAgreements = useMemo(() => 
        agreements.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [agreements, searchTerm]);

    const handleCreate = () => {
        setEditingAgreement(null);
        setIsModalOpen(true);
    };

    const handleEdit = (agreement: AgreementType) => {
        setEditingAgreement(agreement);
        setIsModalOpen(true);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את סוג ההסכם?')) {
            setAgreements(prev => prev.filter(a => a.id !== id));
        }
    };

    const handleSave = (agreement: AgreementType) => {
        if (editingAgreement) {
            setAgreements(prev => prev.map(a => a.id === agreement.id ? agreement : a));
        } else {
            setAgreements(prev => [...prev, agreement]);
        }
        setIsModalOpen(false);
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 space-y-6">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.4s ease-out; }`}</style>
            
            <header className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">סוגי הסכמים</h1>
                    <p className="text-sm text-text-muted">ניהול תבניות להסכמי התקשרות ומודלי גבייה.</p>
                </div>
                <button onClick={handleCreate} className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-sm">
                    <PlusIcon className="w-5 h-5"/>
                    <span>הסכם חדש</span>
                </button>
            </header>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-bg-subtle/50 p-2 rounded-xl border border-border-default">
                 <div className="relative w-full sm:w-96">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="חיפוש הסכם..."
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full bg-white border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition" 
                    />
                </div>
                <div className="flex bg-white p-1 rounded-lg border border-border-default shadow-sm">
                    <button onClick={() => setViewMode('table')} title="תצוגת רשימה" className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-primary-50 text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                    <button onClick={() => setViewMode('grid')} title="תצוגת כרטיסים" className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-primary-50 text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto">
                {viewMode === 'table' ? (
                     <div className="overflow-x-auto border border-border-default rounded-xl bg-white shadow-sm">
                        <table className="w-full text-sm text-right min-w-[800px]">
                            <thead className="text-xs text-text-muted uppercase bg-bg-subtle border-b border-border-default">
                                <tr>
                                    <th className="p-4">שם ההסכם</th>
                                    <th className="p-4">סה"כ % גבייה</th>
                                    <th className="p-4">מספר שלבים</th>
                                    <th className="p-4">פירוט שלבים (ימים לאחר התחלה)</th>
                                    <th className="p-4 text-center">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {filteredAgreements.map(agreement => (
                                    <tr key={agreement.id} className="hover:bg-bg-hover transition-colors group">
                                        <td className="p-4 font-bold text-text-default">{agreement.name}</td>
                                        <td className="p-4 font-mono font-semibold text-primary-700">{agreement.totalPercent}%</td>
                                        <td className="p-4 text-text-muted">
                                            {agreement.installments.length === 1 ? 'תשלום אחד' : `${agreement.installments.length} תשלומים`}
                                        </td>
                                        <td className="p-4 text-text-muted">
                                            <div className="flex gap-2">
                                                {agreement.installments.map((inst, idx) => (
                                                    <span key={idx} className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200">
                                                        {inst.percent}% | {inst.daysAfterStart} ימים
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleEdit(agreement)} className="p-2 text-text-subtle hover:text-primary-600 hover:bg-primary-50 rounded-lg transition"><PencilIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDelete(agreement.id)} className="p-2 text-text-subtle hover:text-red-600 hover:bg-red-50 rounded-lg transition"><TrashIcon className="w-4 h-4"/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                        {filteredAgreements.map(agreement => (
                            <div key={agreement.id} className="bg-white border border-border-default rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all group flex flex-col justify-between h-full relative overflow-hidden">
                                <div className="absolute top-0 right-0 h-full w-1.5 bg-primary-500"></div>
                                
                                <div>
                                    <div className="flex justify-between items-start mb-4 pr-3">
                                        <h3 className="font-bold text-lg text-text-default leading-tight">{agreement.name}</h3>
                                        <span className="bg-primary-50 text-primary-700 text-xs font-black px-2 py-1 rounded-md border border-primary-100">
                                            {agreement.totalPercent}%
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        {agreement.installments.map((inst, i) => (
                                            <div key={i} className="flex items-center justify-between text-sm bg-bg-subtle p-2 rounded-lg border border-border-subtle">
                                                <span className="font-bold text-text-muted text-xs">תשלום {i + 1}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-text-default">{inst.percent}%</span>
                                                    <span className="text-xs text-text-subtle bg-white px-1.5 py-0.5 rounded border border-border-default">{inst.daysAfterStart} ימים</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border-subtle">
                                    <button onClick={() => handleEdit(agreement)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-50 rounded-lg transition">
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                    <button onClick={() => handleDelete(agreement.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                        <TrashIcon className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>
                        ))}
                         {/* Add New Card (Ghost) */}
                         <button onClick={handleCreate} className="border-2 border-dashed border-border-default rounded-2xl p-5 flex flex-col items-center justify-center text-text-subtle hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50/30 transition-all gap-3 min-h-[200px] group">
                            <div className="w-12 h-12 rounded-full bg-bg-subtle group-hover:bg-white flex items-center justify-center transition-colors shadow-sm">
                                <PlusIcon className="w-6 h-6"/>
                            </div>
                            <span className="font-bold">יצירת הסכם חדש</span>
                        </button>
                    </div>
                )}
            </main>

            <AgreementModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                agreementToEdit={editingAgreement}
            />
        </div>
    );
};

export default AgreementTypesSettingsView;
