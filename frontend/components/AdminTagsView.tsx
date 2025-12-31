
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon, 
    SparklesIcon, TagIcon, BuildingOffice2Icon, CheckCircleIcon, NoSymbolIcon,
    ChevronDownIcon, ArrowLeftIcon, ArrowUpTrayIcon, DocumentArrowDownIcon, ChatBubbleBottomCenterTextIcon
} from './Icons';
import HiroAIChat from './HiroAIChat';

// --- NEW DATA MODEL ---
type TagStatus = 'active' | 'draft' | 'deprecated' | 'archived';
type TagType = 'role' | 'skill' | 'industry' | 'tool' | 'certification' | 'language' | 'seniority' | 'domain';
type QualityState = 'verified' | 'needs_review' | 'experimental';
type TagSource = 'system' | 'admin' | 'user' | 'ai';

interface TagSynonym {
    id: string;
    phrase: string;
    language: 'he' | 'en' | 'ru' | 'ar';
    type: 'alias' | 'synonym' | 'typo' | 'abbreviation';
    priority: number; // 1-5
}

interface Tag {
    id: string;
    tagKey: string; // unique internal key
    displayNameHe: string;
    displayNameEn: string;
    type: TagType;
    category: string; // simplified for UI, could be ID
    descriptionHe?: string;
    status: TagStatus;
    qualityState: QualityState;
    source: TagSource;
    matchable: boolean;
    synonyms: TagSynonym[];
    domains: string[]; // List of relevant industries/domains
    usageCount: number;
    lastUsed: string;
}

// --- HELPER COMPONENTS ---

const StatusBadge: React.FC<{ status: TagStatus }> = ({ status }) => {
    const styles = {
        active: 'bg-green-100 text-green-800 border-green-200',
        draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        deprecated: 'bg-red-100 text-red-800 border-red-200',
        archived: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${styles[status]}`}>{status}</span>;
};

const TypeBadge: React.FC<{ type: TagType }> = ({ type }) => {
    const styles: Record<string, string> = {
        role: 'bg-blue-50 text-blue-700',
        skill: 'bg-purple-50 text-purple-700',
        seniority: 'bg-orange-50 text-orange-700',
        default: 'bg-gray-50 text-gray-700'
    };
    return <span className={`text-xs px-2 py-0.5 rounded font-medium ${styles[type] || styles.default}`}>{type}</span>;
};


// --- EDITOR MODAL ---

interface TagEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    tag: Tag | null; // null for new
    onSave: (tag: Tag) => void;
}

const TagEditorModal: React.FC<TagEditorModalProps> = ({ isOpen, onClose, tag, onSave }) => {
    // Form State
    const [formData, setFormData] = useState<Tag>({
        id: '', tagKey: '', displayNameHe: '', displayNameEn: '', type: 'role', category: '',
        descriptionHe: '', status: 'active', qualityState: 'verified', source: 'admin',
        matchable: true, synonyms: [], domains: [], usageCount: 0, lastUsed: new Date().toISOString()
    });
    
    // Tab State
    const [activeTab, setActiveTab] = useState<'general' | 'synonyms' | 'settings'>('general');
    
    // Synonyms Editing State
    const [newSynonym, setNewSynonym] = useState('');
    const [newSynLang, setNewSynLang] = useState<'he'|'en'>('he');

    useEffect(() => {
        if (isOpen) {
            if (tag) {
                setFormData(tag);
            } else {
                // Reset for new
                setFormData({
                    id: Date.now().toString(), tagKey: '', displayNameHe: '', displayNameEn: '', type: 'role', category: '',
                    descriptionHe: '', status: 'active', qualityState: 'verified', source: 'admin',
                    matchable: true, synonyms: [], domains: [], usageCount: 0, lastUsed: new Date().toISOString()
                });
            }
            setActiveTab('general');
        }
    }, [isOpen, tag]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked }));
    };
    
    const addSynonym = () => {
        if (!newSynonym.trim()) return;
        const newItem: TagSynonym = {
            id: Date.now().toString(),
            phrase: newSynonym,
            language: newSynLang,
            type: 'synonym',
            priority: 5
        };
        setFormData(prev => ({ ...prev, synonyms: [...prev.synonyms, newItem] }));
        setNewSynonym('');
    };

    const removeSynonym = (id: string) => {
        setFormData(prev => ({ ...prev, synonyms: prev.synonyms.filter(s => s.id !== id) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[85vh] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="flex items-center justify-between p-5 border-b border-border-default">
                    <div>
                        <h2 className="text-xl font-bold text-text-default">{tag ? 'עריכת תגית' : 'יצירת תגית חדשה'}</h2>
                        <div className="flex items-center gap-2 text-sm text-text-muted mt-1">
                            <span>Key: {formData.tagKey || 'Pending...'}</span>
                            <StatusBadge status={formData.status} />
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted"><XMarkIcon className="w-6 h-6"/></button>
                </header>

                {/* Tabs */}
                <div className="flex border-b border-border-default px-6 bg-bg-subtle/30">
                    <button onClick={() => setActiveTab('general')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>פרטים כלליים</button>
                    <button onClick={() => setActiveTab('synonyms')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'synonyms' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>מילים נרדפות ({formData.synonyms.length})</button>
                    <button onClick={() => setActiveTab('settings')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'settings' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>הגדרות מתקדמות</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-bg-subtle/10">
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-text-default mb-1.5">מפתח תגית (Tag Key) <span className="text-red-500">*</span></label>
                                <input type="text" name="tagKey" value={formData.tagKey} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-mono text-primary-700" placeholder="e.g. role_manager" required />
                                <p className="text-xs text-text-muted mt-1">מזהה ייחודי במערכת (אנגלית, ללא רווחים).</p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">שם תצוגה (עברית)</label>
                                <input type="text" name="displayNameHe" value={formData.displayNameHe} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="למשל: מנהל פרויקטים" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">שם תצוגה (אנגלית)</label>
                                <input type="text" name="displayNameEn" value={formData.displayNameEn} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm text-left" placeholder="e.g. Project Manager" dir="ltr" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">סוג תגית</label>
                                <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                                    <option value="role">תפקיד (Role)</option>
                                    <option value="skill">מיומנות (Skill)</option>
                                    <option value="industry">תעשייה (Industry)</option>
                                    <option value="tool">כלי / תוכנה (Tool)</option>
                                    <option value="seniority">בכירות (Seniority)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">קטגוריה</label>
                                <input type="text" name="category" value={formData.category} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="למשל: פיתוח תוכנה" />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-text-default mb-1.5">תיאור (לשימוש פנימי/AI)</label>
                                <textarea name="descriptionHe" value={formData.descriptionHe} onChange={handleChange} rows={3} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm resize-none"></textarea>
                            </div>
                        </div>
                    )}

                    {activeTab === 'synonyms' && (
                        <div className="space-y-4">
                            <div className="flex gap-2 items-end bg-bg-card p-4 rounded-xl border border-border-default shadow-sm">
                                <div className="flex-grow">
                                    <label className="block text-xs font-bold text-text-muted mb-1">הוסף ביטוי / מילה נרדפת</label>
                                    <input 
                                        type="text" 
                                        value={newSynonym} 
                                        onChange={e => setNewSynonym(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && addSynonym()}
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" 
                                        placeholder="הקלד ביטוי..."
                                    />
                                </div>
                                <div className="w-24">
                                     <label className="block text-xs font-bold text-text-muted mb-1">שפה</label>
                                     <select value={newSynLang} onChange={e => setNewSynLang(e.target.value as any)} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                         <option value="he">HE</option>
                                         <option value="en">EN</option>
                                     </select>
                                </div>
                                <button onClick={addSynonym} className="bg-primary-600 text-white p-2 rounded-lg hover:bg-primary-700 transition">
                                    <PlusIcon className="w-5 h-5"/>
                                </button>
                            </div>

                            <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-bg-subtle text-text-muted font-semibold text-xs border-b border-border-default">
                                        <tr>
                                            <th className="p-3">ביטוי</th>
                                            <th className="p-3">שפה</th>
                                            <th className="p-3">סוג</th>
                                            <th className="p-3">עדיפות</th>
                                            <th className="p-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {formData.synonyms.map(syn => (
                                            <tr key={syn.id} className="hover:bg-bg-hover">
                                                <td className="p-3 font-medium">{syn.phrase}</td>
                                                <td className="p-3 uppercase text-xs">{syn.language}</td>
                                                <td className="p-3 text-xs text-text-subtle">{syn.type}</td>
                                                <td className="p-3 text-xs">{syn.priority}</td>
                                                <td className="p-3 text-center">
                                                    <button onClick={() => removeSynonym(syn.id)} className="text-text-subtle hover:text-red-500 transition-colors">
                                                        <TrashIcon className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {formData.synonyms.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-text-muted">אין מילים נרדפות מוגדרות</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <div className="bg-bg-card p-5 rounded-xl border border-border-default space-y-4">
                                <h3 className="font-bold text-text-default">סטטוס ואיכות</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">סטטוס תגית</label>
                                        <select name="status" value={formData.status} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                                            <option value="active">Active (פעיל)</option>
                                            <option value="draft">Draft (טיוטה)</option>
                                            <option value="deprecated">Deprecated (מיושן)</option>
                                            <option value="archived">Archived (ארכיון)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">מצב איכות (Quality State)</label>
                                        <select name="qualityState" value={formData.qualityState} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                                            <option value="verified">Verified (מאומת)</option>
                                            <option value="needs_review">Needs Review (לביקורת)</option>
                                            <option value="experimental">Experimental (נסיוני)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-bg-card p-5 rounded-xl border border-border-default space-y-4">
                                <h3 className="font-bold text-text-default">הגדרות Matching</h3>
                                <div className="flex flex-col gap-3">
                                    <label className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-bg-subtle cursor-pointer">
                                        <input type="checkbox" name="matchable" checked={formData.matchable} onChange={handleCheckbox} className="w-5 h-5 rounded text-primary-600" />
                                        <div>
                                            <span className="font-semibold block text-sm">אפשר שימוש ב-Matching</span>
                                            <span className="text-xs text-text-muted">האם תגית זו משפיעה על ציון ההתאמה של מועמד למשרה</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                             <div className="bg-bg-card p-5 rounded-xl border border-border-default space-y-4">
                                <h3 className="font-bold text-text-default">דומיינים מקושרים (CSV)</h3>
                                <textarea 
                                    value={formData.domains.join(', ')} 
                                    onChange={(e) => setFormData(prev => ({...prev, domains: e.target.value.split(',').map(s => s.trim()).filter(Boolean)}))}
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm h-20 resize-none"
                                    placeholder="הייטק, פיננסים, שירות לקוחות..."
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <footer className="flex justify-end items-center gap-3 p-5 border-t border-border-default bg-bg-card">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">ביטול</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 transition shadow-sm">שמור תגית</button>
                </footer>
            </div>
        </div>
    );
};

// --- MAIN VIEW ---

const AdminTagsView: React.FC = () => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Bulk & AI State
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
    const [isEnriching, setIsEnriching] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
    const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    // Sort & Filter
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${apiBase}/api/tags`);
                if (!res.ok) throw new Error('Failed to load tags');
                const data = await res.json();
                setTags(data);
            } catch (err: any) {
                setError(err.message || 'Load failed');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [apiBase]);

    const filteredTags = useMemo(() => 
        tags.filter(t => 
            (t.displayNameHe || '').includes(searchTerm) || 
            (t.tagKey || '').includes(searchTerm) ||
            (t.category || '').includes(searchTerm)
        ), 
    [tags, searchTerm]);

    const handleCreate = () => {
        setEditingTag(null);
        setIsModalOpen(true);
    };

    const handleEdit = (tag: Tag) => {
        setEditingTag(tag);
        setIsModalOpen(true);
    };

    const handleSave = async (savedTag: Tag) => {
        const payload: any = { ...savedTag };
        if (!editingTag) {
            delete payload.id;
            delete payload.usageCount;
            delete payload.lastUsed;
        }
        try {
            if (editingTag) {
                const res = await fetch(`${apiBase}/api/tags/${editingTag.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Update failed');
                const updated = await res.json();
                setTags(prev => prev.map(t => t.id === editingTag.id ? updated : t));
            } else {
                const res = await fetch(`${apiBase}/api/tags`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Create failed');
                const created = await res.json();
                setTags(prev => [...prev, created]);
            }
            setIsModalOpen(false);
        } catch (err: any) {
            alert(err.message || 'Save failed');
        }
    };
    
    const handleDelete = async (id: string) => {
        if(!window.confirm("Delete this tag?")) return;
        const prev = tags;
        setTags(prev => prev.filter(t => t.id !== id));
        setSelectedTagIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        try {
            const res = await fetch(`${apiBase}/api/tags/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
        } catch (err: any) {
            alert(err.message || 'Delete failed');
            setTags(prev);
        }
    };

    // --- Bulk & Import Logic ---

    const handleToggleSelect = (id: string) => {
        setSelectedTagIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedTagIds(new Set(filteredTags.map(t => t.id)));
        } else {
            setSelectedTagIds(new Set());
        }
    };

    const handleDownloadTemplate = () => {
        const headers = ["Tag Name (Hebrew)", "Category (Optional)"];
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(",")].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "tags_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Mock import: Read CSV (simplified) and add drafts
            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target?.result as string;
                const lines = text.split('\n').slice(1); // skip header
                const newTags: Tag[] = [];
                
                lines.forEach((line, idx) => {
                    const [name, category] = line.split(',');
                    if (name && name.trim()) {
                        newTags.push({
                            id: `imported_${Date.now()}_${idx}`,
                            tagKey: `draft_${Date.now()}_${idx}`,
                            displayNameHe: name.trim(),
                            displayNameEn: '',
                            type: 'skill', // Default
                            category: category?.trim() || 'General',
                            status: 'draft',
                            qualityState: 'needs_review',
                            source: 'admin',
                            matchable: true,
                            synonyms: [],
                            domains: [],
                            usageCount: 0,
                            lastUsed: new Date().toISOString()
                        });
                    }
                });
                
                if (newTags.length > 0) {
                    setTags(prev => [...prev, ...newTags]);
                    alert(`${newTags.length} tags imported as drafts.`);
                }
            };
            reader.readAsText(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- AI Enrichment Logic ---

    const handleBulkEnrich = async () => {
        if (selectedTagIds.size === 0) return;
        setIsEnriching(true);
        
        try {
            const selectedTagsList = tags.filter(t => selectedTagIds.has(t.id));

            const res = await fetch(`${apiBase}/api/tags/ai/enrich`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags: selectedTagsList }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Enrichment failed');
            }
            const data = await res.json();
            const suggestions = (data.suggestions || []).map((s: any) => ({
                ...s,
                _selected: true,
            }));
            setAiSuggestions(suggestions);
            setIsSuggestModalOpen(true);

        } catch (error) {
            console.error("AI Enrichment failed:", error);
            alert("Enrichment failed. Please try again.");
        } finally {
            setIsEnriching(false);
        }
    };

    // --- AI Chat Logic ---

    const handleOpenChat = () => {
        setIsChatOpen(true);
    };

    return (
        <div className="h-full flex flex-col p-6 max-w-[1600px] mx-auto relative">
            <header className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-default flex items-center gap-2">
                        <TagIcon className="w-8 h-8 text-primary-500" />
                        ניהול תגיות
                    </h1>
                    <p className="text-text-muted mt-1">מערכת מרכזית לניהול טקסונומיה, מילים נרדפות וקטגוריות.</p>
                </div>
                <div className="flex gap-3">
                     <button 
                        onClick={handleOpenChat}
                        className="bg-white border border-border-default text-primary-700 font-bold py-2.5 px-4 rounded-xl hover:bg-primary-50 transition shadow-sm flex items-center gap-2"
                    >
                        <ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>
                        <span>התייעץ עם AI</span>
                    </button>
                    <button onClick={handleCreate} className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2">
                        <PlusIcon className="w-5 h-5"/>
                        <span>תגית חדשה</span>
                    </button>
                </div>
            </header>

            {/* Toolbar */}
            <div className="bg-bg-card rounded-2xl border border-border-default p-3 mb-6 flex flex-col md:flex-row items-center gap-4 justify-between">
                <div className="relative flex-grow max-w-md w-full">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="חפש לפי שם, מפתח או קטגוריה..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition shadow-sm" 
                    />
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Import / Template Buttons */}
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileChange} />
                    <button onClick={handleDownloadTemplate} className="text-sm font-medium text-primary-600 hover:underline flex items-center gap-1">
                        <DocumentArrowDownIcon className="w-4 h-4" /> תבנית
                    </button>
                    <button onClick={handleImportClick} className="flex items-center gap-2 bg-bg-subtle text-text-default border border-border-default font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition shadow-sm">
                        <ArrowUpTrayIcon className="w-4 h-4" />
                        <span>ייבוא</span>
                    </button>
                </div>
            </div>

            {/* Bulk Actions Bar (Visible when items selected) */}
            {selectedTagIds.size > 0 && (
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 mb-4 flex items-center justify-between animate-fade-in">
                    <div className="flex items-center gap-4">
                        <span className="font-bold text-primary-900 text-sm px-2">{selectedTagIds.size} נבחרו</span>
                        <div className="h-6 w-px bg-primary-200"></div>
                        <button 
                            onClick={handleBulkEnrich} 
                            disabled={isEnriching}
                            className="flex items-center gap-2 bg-white text-primary-700 font-bold py-1.5 px-4 rounded-lg shadow-sm border border-primary-100 hover:bg-primary-50 transition disabled:opacity-50"
                        >
                            {isEnriching ? (
                                <span className="animate-pulse">מעשיר...</span>
                            ) : (
                                <>
                                    <SparklesIcon className="w-4 h-4 text-purple-500" />
                                    <span>מילוי אוטומטי (AI Enrich)</span>
                                </>
                            )}
                        </button>
                    </div>
                    <button onClick={() => setSelectedTagIds(new Set())} className="text-text-muted hover:text-primary-600 text-sm font-medium">ביטול בחירה</button>
                </div>
            )}

            {/* Table */}
            <div className="bg-bg-card border border-border-default rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-right text-sm">
                        <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-10 border-b border-border-default">
                            <tr>
                                <th className="p-4 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        onChange={handleSelectAll} 
                                        checked={filteredTags.length > 0 && selectedTagIds.size === filteredTags.length}
                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4">Tag Key</th>
                                <th className="p-4">שם (עברית)</th>
                                <th className="p-4">שם (אנגלית)</th>
                                <th className="p-4">סוג</th>
                                <th className="p-4">קטגוריה</th>
                                <th className="p-4">סטטוס</th>
                                <th className="p-4">נרדפים</th>
                                <th className="p-4">שימוש</th>
                                <th className="p-4 w-20"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {filteredTags.map(tag => (
                                <tr key={tag.id} className={`hover:bg-bg-hover transition-colors group cursor-pointer ${selectedTagIds.has(tag.id) ? 'bg-primary-50/50' : ''}`} onClick={() => handleEdit(tag)}>
                                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedTagIds.has(tag.id)}
                                            onChange={() => handleToggleSelect(tag.id)}
                                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-4 font-mono text-xs text-primary-700 font-semibold">{tag.tagKey}</td>
                                    <td className="p-4 font-bold text-text-default">{tag.displayNameHe}</td>
                                    <td className="p-4 text-text-default">{tag.displayNameEn}</td>
                                    <td className="p-4"><TypeBadge type={tag.type}/></td>
                                    <td className="p-4 text-text-muted">{tag.category}</td>
                                    <td className="p-4"><StatusBadge status={tag.status}/></td>
                                    <td className="p-4">
                                        <div className="flex flex-wrap gap-1">
                                            {tag.synonyms.slice(0, 2).map(s => (
                                                <span key={s.id} className="text-[10px] bg-bg-subtle border px-1.5 rounded text-text-muted">{s.phrase}</span>
                                            ))}
                                            {tag.synonyms.length > 2 && <span className="text-[10px] text-text-subtle">+{tag.synonyms.length - 2}</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-xs tabular-nums text-text-muted">{tag.usageCount.toLocaleString()}</td>
                                    <td className="p-4 text-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 justify-center">
                                            <button onClick={(e) => {e.stopPropagation(); handleEdit(tag);}} className="p-1.5 hover:bg-primary-50 text-primary-600 rounded-lg"><PencilIcon className="w-4 h-4"/></button>
                                            <button onClick={(e) => {e.stopPropagation(); handleDelete(tag.id);}} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                 <div className="p-3 border-t border-border-default text-xs text-text-muted bg-bg-subtle/30">
                    סה"כ {filteredTags.length} תגיות
                </div>
            </div>

            <TagEditorModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                tag={editingTag}
                onSave={handleSave}
            />

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                tagsText={tags.map(t => `${t.displayNameHe} (${t.category})`).join(', ')}
            />

            {/* AI Suggestions Modal */}
            {isSuggestModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-border-default w-full max-w-4xl max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle/40">
                            <div>
                                <h3 className="text-lg font-bold text-text-default">השלמות AI לתגיות שנבחרו</h3>
                                <p className="text-sm text-text-muted">בחר אילו פריטים להחיל. ניתן לערוך לפני החלה.</p>
                            </div>
                            <button onClick={() => setIsSuggestModalOpen(false)} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
                            {aiSuggestions.length === 0 && (
                                <div className="text-center text-text-muted py-6">אין הצעות</div>
                            )}
                            {aiSuggestions.map((sugg, idx) => (
                                <div key={sugg.id || idx} className="border border-border-default rounded-xl p-3 bg-bg-subtle/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="checkbox" 
                                                checked={sugg._selected !== false}
                                                onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, _selected: e.target.checked } : item))}
                                                className="w-4 h-4 text-primary-600 rounded"
                                            />
                                            <div>
                                                <div className="font-bold text-text-default">{sugg.displayNameHe}</div>
                                                <div className="text-xs text-text-muted">{sugg.displayNameEn}</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-text-muted">ID: {sugg.id}</div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <label className="block text-xs text-text-subtle mb-1">קטגוריה</label>
                                            <input value={sugg.category || ''} onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, category: e.target.value } : item))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-text-subtle mb-1">סוג</label>
                                            <select value={sugg.type} onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, type: e.target.value as TagType } : item))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                <option value="role">role</option>
                                                <option value="skill">skill</option>
                                                <option value="industry">industry</option>
                                                <option value="tool">tool</option>
                                                <option value="certification">certification</option>
                                                <option value="language">language</option>
                                                <option value="seniority">seniority</option>
                                                <option value="domain">domain</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-text-subtle mb-1">סטטוס</label>
                                            <select value={sugg.status} onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, status: e.target.value as TagStatus } : item))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                <option value="active">active</option>
                                                <option value="draft">draft</option>
                                                <option value="deprecated">deprecated</option>
                                                <option value="archived">archived</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-text-subtle mb-1">Quality</label>
                                            <select value={sugg.qualityState} onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, qualityState: e.target.value as QualityState } : item))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                <option value="verified">verified</option>
                                                <option value="needs_review">needs_review</option>
                                                <option value="experimental">experimental</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-3">
                                        <label className="block text-xs text-text-subtle mb-1">מילים נרדפות</label>
                                        <div className="flex flex-wrap gap-2">
                                            {sugg.synonyms?.map((syn: any, si: number) => (
                                                <span key={syn.id || si} className="flex items-center gap-1 bg-white border border-border-default px-2 py-1 rounded text-xs shadow-sm">
                                                    {syn.phrase}
                                                    <button onClick={() => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, synonyms: item.synonyms.filter((_: any, jj: number) => jj !== si) } : item))} className="text-text-muted hover:text-red-500">
                                                        <XMarkIcon className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-2">
                            <button onClick={() => setIsSuggestModalOpen(false)} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                            <button 
                                onClick={() => {
                                    const selectedUpdates = aiSuggestions.filter(s => s._selected !== false);
                                    setTags(prev => prev.map(t => {
                                        const upd = selectedUpdates.find(u => u.id === t.id);
                                        if (!upd) return t;
                                        return {
                                            ...t,
                                            displayNameHe: upd.displayNameHe,
                                            displayNameEn: upd.displayNameEn,
                                            category: upd.category,
                                            type: upd.type,
                                            status: upd.status,
                                            qualityState: upd.qualityState,
                                            synonyms: upd.synonyms,
                                        };
                                    }));
                                    setSelectedTagIds(new Set());
                                    setIsSuggestModalOpen(false);
                                }}
                                className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition"
                            >
                                החל נבחרים
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTagsView;
