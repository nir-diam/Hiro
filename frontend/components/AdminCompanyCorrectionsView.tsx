import React, { useState, useMemo } from 'react';
import { MagnifyingGlassIcon, LinkIcon, PlusIcon, TrashIcon } from './Icons';

interface UnmatchedCompany {
    id: number;
    name: string;
    source: string; // e.g., "From John Doe's CV"
}

const mockUnmatchedCompanies: UnmatchedCompany[] = [
    { id: 1, name: 'Googel', source: 'CV of Avi Cohen' },
    { id: 2, name: 'פייסבוק ישראל', source: 'CV of Yael Levi' },
    { id: 3, name: 'מיקרוסופט', source: 'CV of Moshe Peretz' },
    { id: 4, name: 'Amazon Web Services', source: 'CV of Sarah Katz' },
    { id: 5, name: 'Teva Pharm', source: 'CV of David Bitan' },
];

const mockExistingCompanies = ['Google', 'Meta', 'Microsoft', 'Amazon', 'Teva Pharmaceutical Industries', 'Apple', 'Intel'];

const AdminCompanyCorrectionsView: React.FC = () => {
    const [unmatched, setUnmatched] = useState(mockUnmatchedCompanies);
    const [selected, setSelected] = useState<UnmatchedCompany | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [selectedExistingCompany, setSelectedExistingCompany] = useState<string | null>(null);
    
    const filteredUnmatched = useMemo(() => 
        unmatched.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [unmatched, searchTerm]
    );

    const filteredExisting = useMemo(() =>
        linkSearchTerm
            ? mockExistingCompanies.filter(c => c.toLowerCase().includes(linkSearchTerm.toLowerCase()))
            : [],
        [linkSearchTerm]
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
                                className={`w-full text-right p-3 rounded-lg transition-colors ${selected?.id === item.id ? 'bg-primary-100' : 'hover:bg-bg-hover'}`}
                            >
                                <p className="font-semibold text-text-default">{item.name}</p>
                                <p className="text-xs text-text-subtle">מקור: {item.source}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column: Resolution Area */}
                <div className="md:col-span-2">
                    {selected ? (
                        <div className="space-y-6">
                            <div>
                                <p className="text-sm text-text-muted">שם לטיפול:</p>
                                <p className="text-2xl font-bold text-primary-600">"{selected.name}"</p>
                            </div>

                            <div className="bg-bg-subtle/70 p-4 rounded-lg border border-border-default space-y-3">
                                <h3 className="font-bold">שייך לחברה קיימת</h3>
                                 <div className="relative">
                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input 
                                        type="text" 
                                        placeholder="חפש חברה קיימת..."
                                        value={linkSearchTerm}
                                        onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingCompany(null); }}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                                    />
                                </div>
                                {linkSearchTerm && (
                                    <div className="max-h-40 overflow-y-auto space-y-1 border border-border-default rounded-md bg-bg-card p-1">
                                        {filteredExisting.map(company => (
                                            <button 
                                                key={company}
                                                onClick={() => { setSelectedExistingCompany(company); setLinkSearchTerm(company); }}
                                                className={`w-full text-right p-2 rounded text-sm ${selectedExistingCompany === company ? 'bg-primary-100 text-primary-700' : 'hover:bg-bg-hover'}`}
                                            >
                                                {company}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button onClick={() => handleResolve('link')} disabled={!selectedExistingCompany} className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition disabled:bg-bg-active">
                                    <LinkIcon className="w-5 h-5"/>
                                    <span>שייך לחברה שנבחרה</span>
                                </button>
                            </div>
                            
                             <div className="flex items-center gap-4">
                                <div className="flex-grow border-t border-border-default"></div>
                                <span className="text-sm font-semibold text-text-subtle">או</span>
                                <div className="flex-grow border-t border-border-default"></div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button onClick={() => handleResolve('create')} className="flex-1 flex items-center justify-center gap-2 bg-secondary-100 text-secondary-800 font-semibold py-2 px-4 rounded-lg hover:bg-secondary-200 transition">
                                    <PlusIcon className="w-5 h-5"/>
                                    <span>צור חברה חדשה</span>
                                </button>
                                 <button onClick={() => handleResolve('delete')} className="flex-1 flex items-center justify-center gap-2 bg-bg-subtle text-text-default font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">
                                    <TrashIcon className="w-5 h-5"/>
                                    <span>מחק רשומה</span>
                                </button>
                            </div>

                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center text-text-muted p-8 bg-bg-subtle rounded-lg">
                            <p className="font-semibold">בחר שם חברה מהרשימה כדי להתחיל.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminCompanyCorrectionsView;
