
import React, { useState, useMemo, useEffect } from 'react';
import { MagnifyingGlassIcon, LinkIcon, PlusIcon, TrashIcon, UserIcon, ArrowTopRightOnSquareIcon } from './Icons';
import { useNavigate } from 'react-router-dom';

interface UnmatchedCompany {
    id: number;
    name: string;
    source: string;
    candidateId: number; // Added candidate ID context
    candidateName: string; // Added candidate name for display
}

const mockUnmatchedCompanies: UnmatchedCompany[] = [
    { id: 1, name: 'Googel', source: 'CV', candidateId: 1, candidateName: 'אבי כהן' },
    { id: 2, name: 'פייסבוק ישראל', source: 'CV', candidateId: 2, candidateName: 'יעל לוי' },
    { id: 3, name: 'מיקרוסופט', source: 'CV', candidateId: 3, candidateName: 'משה פרץ' },
    { id: 4, name: 'Amazon Web Services', source: 'CV', candidateId: 4, candidateName: 'שרה כץ' },
    { id: 5, name: 'Teva Pharm', source: 'CV', candidateId: 5, candidateName: 'דוד ביטן' },
];

const AdminCompanyCorrectionsView: React.FC = () => {
    const navigate = useNavigate();
    const [unmatched, setUnmatched] = useState(mockUnmatchedCompanies);
    const [selected, setSelected] = useState<UnmatchedCompany | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [selectedExistingCompany, setSelectedExistingCompany] = useState<string | null>(null);
    const [existingCompanies, setExistingCompanies] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`${apiBase}/api/organizations`);
                if (!res.ok) throw new Error('Failed to load companies');
                const data = await res.json();
                setExistingCompanies(data.map((c: any) => c.name).filter(Boolean));
            } catch (err: any) {
                setError(err.message || 'Load failed');
            }
        };
        load();
    }, [apiBase]);
    
    const filteredUnmatched = useMemo(() => 
        unmatched.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [unmatched, searchTerm]
    );

    const filteredExisting = useMemo(() =>
        linkSearchTerm
            ? existingCompanies.filter(c => c.toLowerCase().includes(linkSearchTerm.toLowerCase()))
            : [],
        [linkSearchTerm, existingCompanies]
    );
    
    const handleResolve = (action: 'link' | 'create' | 'delete') => {
        if (!selected) return;
        
        if (action === 'link' && !selectedExistingCompany) {
            alert('Please select an existing company to link to.');
            return;
        }

        console.log(`Resolving '${selected.name}' with action: ${action}. Linked to: ${selectedExistingCompany}`);
        
        setUnmatched(prev => prev.filter(u => u.id !== selected.id));
        setSelected(null);
        setLinkSearchTerm('');
        setSelectedExistingCompany(null);
    };

    const handleViewCandidate = (candidateId: number) => {
        navigate(`/candidates/${candidateId}`);
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6">
            <h1 className="text-xl font-bold mb-1">תיקון שמות חברות</h1>
            <p className="text-sm text-text-muted mb-6">טפל בשמות חברות שזוהו מקורות חיים ואין להם התאמה במאגר הלקוחות.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Unmatched List */}
                <div className="md:col-span-1 border-l border-border-default pl-6">
                     <div className="relative mb-4">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="חפש שם חברה..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                        />
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {filteredUnmatched.map(item => (
                            <button 
                                key={item.id} 
                                onClick={() => setSelected(item)}
                                className={`w-full text-right p-3 rounded-lg transition-colors flex justify-between items-center group ${selected?.id === item.id ? 'bg-primary-100' : 'hover:bg-bg-hover'}`}
                            >
                                <div>
                                    <p className="font-semibold text-text-default">{item.name}</p>
                                    <p className="text-xs text-text-subtle mt-0.5">{item.source} של {item.candidateName}</p>
                                </div>
                                
                                <div 
                                    onClick={(e) => { e.stopPropagation(); handleViewCandidate(item.candidateId); }}
                                    className="p-1.5 rounded-full text-text-subtle hover:text-primary-600 hover:bg-bg-card transition-all opacity-0 group-hover:opacity-100"
                                    title="צפה במועמד"
                                >
                                    <UserIcon className="w-4 h-4"/>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column: Resolution Area */}
                <div className="md:col-span-2">
                    {selected ? (
                        <div className="space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-text-muted">שם לטיפול:</p>
                                    <p className="text-3xl font-bold text-primary-700">"{selected.name}"</p>
                                    <div className="flex items-center gap-2 mt-2 text-sm text-text-default">
                                        <span>זוהה אצל: <strong>{selected.candidateName}</strong></span>
                                        <button 
                                            onClick={() => handleViewCandidate(selected.candidateId)}
                                            className="text-primary-600 hover:underline flex items-center gap-1 text-xs"
                                        >
                                            <ArrowTopRightOnSquareIcon className="w-3 h-3" /> צפה בפרופיל
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-bg-subtle/70 p-6 rounded-xl border border-border-default space-y-4">
                                <h3 className="font-bold text-lg">שייך לחברה קיימת</h3>
                                <p className="text-sm text-text-muted -mt-2">השם השגוי יוחלף בשם החברה הנבחרת בכל המופעים.</p>
                                 <div className="relative">
                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input 
                                        type="text" 
                                        placeholder="הקלד שם חברה לחיפוש..."
                                        value={linkSearchTerm}
                                        onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingCompany(null); }}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                {linkSearchTerm && (
                                    <div className="max-h-48 overflow-y-auto space-y-1 border border-border-default rounded-lg bg-bg-card p-1 shadow-sm">
                                        {filteredExisting.map(company => (
                                            <button 
                                                key={company}
                                                onClick={() => { setSelectedExistingCompany(company); setLinkSearchTerm(company); }}
                                                className={`w-full text-right p-2.5 rounded-md text-sm transition-colors ${selectedExistingCompany === company ? 'bg-primary-100 text-primary-700 font-medium' : 'hover:bg-bg-hover'}`}
                                            >
                                                {company}
                                            </button>
                                        ))}
                                        {filteredExisting.length === 0 && <div className="p-3 text-center text-sm text-text-muted">לא נמצאו חברות תואמות</div>}
                                    </div>
                                )}
                                <button 
                                    onClick={() => handleResolve('link')} 
                                    disabled={!selectedExistingCompany} 
                                    className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-primary-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed shadow-md"
                                >
                                    <LinkIcon className="w-5 h-5"/>
                                    <span>שייך ל-{selectedExistingCompany || 'חברה'}</span>
                                </button>
                            </div>
                            
                             <div className="flex items-center gap-4">
                                <div className="flex-grow border-t border-border-default"></div>
                                <span className="text-sm font-semibold text-text-subtle">אפשרויות נוספות</span>
                                <div className="flex-grow border-t border-border-default"></div>
                            </div>

                            <div className="flex gap-4">
                                <button onClick={() => handleResolve('create')} className="flex-1 flex items-center justify-center gap-2 bg-secondary-100 text-secondary-800 font-semibold py-3 px-4 rounded-xl hover:bg-secondary-200 transition">
                                    <PlusIcon className="w-5 h-5"/>
                                    <span>צור כחברה חדשה</span>
                                </button>
                                 <button onClick={() => handleResolve('delete')} className="flex-1 flex items-center justify-center gap-2 bg-bg-subtle text-text-default font-semibold py-3 px-4 rounded-xl hover:bg-bg-hover transition border border-border-default">
                                    <TrashIcon className="w-5 h-5"/>
                                    <span>התעלם / מחק</span>
                                </button>
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-text-muted p-8 bg-bg-subtle/30 rounded-2xl border-2 border-dashed border-border-default">
                            <div className="w-16 h-16 bg-bg-subtle rounded-full flex items-center justify-center mb-4">
                                <LinkIcon className="w-8 h-8 text-text-subtle opacity-50" />
                            </div>
                            <h3 className="text-lg font-bold text-text-default">בחר חברה לטיפול</h3>
                            <p className="max-w-xs mt-2">בחר שם חברה מרשימת החריגים מימין כדי להתחיל בתהליך התיקון והשיוך.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminCompanyCorrectionsView;
