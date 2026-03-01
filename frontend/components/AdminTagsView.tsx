
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon, 
    SparklesIcon, TagIcon, BuildingOffice2Icon, CheckCircleIcon, NoSymbolIcon,
    ChevronDownIcon, ArrowLeftIcon, ArrowUpTrayIcon, DocumentArrowDownIcon, ChatBubbleBottomCenterTextIcon,
    Bars3Icon, Squares2X2Icon, TableCellsIcon, ListBulletIcon, CalendarDaysIcon
} from './Icons';
import HiroAIChat from './HiroAIChat';

// --- NEW DATA MODEL ---
type TagStatus = 'active' | 'draft' | 'deprecated' | 'archived' | 'pending';
type TagType = 'role' | 'skill' | 'industry' | 'tool' | 'certification' | 'language' | 'seniority' | 'domain';
type QualityState = 'verified' | 'needs_review' | 'experimental' | 'initial_detection';
type TagSource = 'system' | 'admin' | 'user' | 'ai' | 'manual';

interface TagSynonym {
    id: string;
    phrase: string;
    language: 'he' | 'en' | 'ru' | 'ar' | '-' | '';
    type: 'alias' | 'synonym' | 'typo' | 'abbreviation';
    priority: number; // 1-5
    source?: 'alias' | 'synonym';
    aliasIndex?: number;
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
    aliases?: string[];
    domains: string[]; // List of relevant industries/domains
    usageCount: number;
    lastUsedAt?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    internalNote?: string;
}

interface TagHistoryEntry {
    id: string;
    tagId: string;
    action: 'create' | 'update' | 'delete' | string;
    actor?: string;
    changes?: {
        before?: Partial<Tag>;
        after?: Partial<Tag>;
    };
    createdAt?: string;
}

interface UsageCandidate {
    id: string;
    candidate?: { id: string; fullName?: string };
}

const ensureArray = (val: any) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            // ignore
        }
        return [val];
    }
    return [];
};

const normalizeIncomingSynonyms = (synonyms?: any[]): TagSynonym[] => {
    const list = ensureArray(synonyms);
    const normalized = list.map((syn: any, idx: number) => {
        if (!syn) return {
            id: `syn_${Date.now()}_${idx}`,
            phrase: '',
            language: 'he',
            type: 'synonym',
            priority: 3,
            source: 'synonym'
        };
        if (typeof syn === 'string') {
            const lang = /[a-zA-Z]/.test(syn) ? 'en' : 'he';
            return {
                id: `syn_${idx}_${syn}`,
                phrase: syn,
                language: lang as TagSynonym['language'],
                type: 'synonym' as TagSynonym['type'],
                priority: 3,
                source: 'synonym'
            } as TagSynonym;
        }
        return {
            id: syn.id || `syn_${idx}_${Date.now()}`,
            phrase: syn.phrase || syn.value || '',
            language: (syn.language || (/[a-zA-Z]/.test(syn.phrase || '') ? 'en' : 'he')) as TagSynonym['language'],
            type: (syn.type || 'synonym') as TagSynonym['type'],
            priority: Number.isFinite(syn.priority) ? syn.priority : 3,
            source: syn.source as TagSynonym['source'] || 'synonym',
            aliasIndex: syn.aliasIndex,
        } as TagSynonym;
    }).filter(s => !!s.phrase);
    return normalized as TagSynonym[];
};

type SourceFilterValue = '' | 'ai' | 'manual' | 'candidate' | 'curator';

type SortKey = 'tagKey' | 'displayNameHe' | 'displayNameEn' | 'type' | 'category' | 'status' | 'createdAt' | 'source' | 'usageCount';
type SortConfig = { key: SortKey | null; direction: 'asc' | 'desc' };

const getRelativeTimeLabel = (date?: Date | string) => {
    if (!date) return '';
    const target = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(target.getTime())) return '';
    const diffMs = Date.now() - target.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 60) return `${diffMinutes} דק'`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} ש'`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} ימים`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks} שבועות`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} חודשים`;
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} שנים`;
};

const formatDateTime = (value?: string | Date) => {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    const formatted = date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    const relative = getRelativeTimeLabel(date);
    return relative ? `${formatted} (${relative})` : formatted;
};

const formatDateOnly = (value?: string | Date) => {
    if (!value) return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const mapSourceToFilterValue = (value?: TagSource): SourceFilterValue => {
    if (value === 'ai') return 'ai';
    if (value === 'manual') return 'manual';
    if (value === 'user') return 'candidate';
    if (value === 'admin' || value === 'system') return 'curator';
    return 'manual';
};

const getSourceDisplayName = (value?: TagSource) => {
    if (!value) return 'ידני';
    if (value === 'ai') return 'AI';
    if (value === 'manual') return 'ידני';
    if (value === 'user') return 'מועמד';
    if (value === 'admin' || value === 'system') return 'רכז';
    return value;
};
const getTagDisplayName = (tag?: Tag | null) => {
    return tag?.displayNameHe || tag?.displayNameEn || tag?.tagKey || 'בחר תגית';
};
interface BlockingCandidate {
    candidate_tag_id: string;
    candidateTagId?: string;
    candidate_id?: string;
    candidateId?: string;
    full_name?: string;
    fullName?: string;
    email?: string;
    phone?: string;
}

// --- HELPER COMPONENTS ---

const StatusBadge: React.FC<{ status: TagStatus; quality?: QualityState }> = ({ status, quality }) => {
    const styles = {
        active: 'bg-green-100 text-green-800 border-green-200',
        draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        deprecated: 'bg-red-100 text-red-800 border-red-200',
        archived: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    
    const qualityStyles = {
        verified: 'bg-blue-100 text-blue-800 border-blue-200',
        needs_review: 'bg-orange-100 text-orange-800 border-orange-200',
        experimental: 'bg-purple-100 text-purple-800 border-purple-200',
        initial_detection: 'bg-gray-50 text-gray-600 border-gray-200',
    };

    const qualityLabels = {
        verified: 'Verified',
        needs_review: 'Review',
        experimental: 'Exp',
        initial_detection: 'Initial',
    };

    return (
        <div className="flex items-center gap-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${styles[status]}`}>{status}</span>
            {quality && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${qualityStyles[quality]}`}>
                    {qualityLabels[quality]}
                </span>
            )}
        </div>
    );
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
    tag: Tag | null;
    onSave: (tag: Tag) => void;
    allTags: Tag[];
    tagNameOptions: string[];
    typePicklistOptions: { label: string; value: string }[];
}

const TagEditorModal: React.FC<TagEditorModalProps> = ({ isOpen, onClose, tag, onSave, allTags, tagNameOptions, typePicklistOptions }) => {
    // Form State
    const [formData, setFormData] = useState<Tag>({
        id: '', tagKey: '', displayNameHe: '', displayNameEn: '', type: 'role', category: '',
        descriptionHe: '', status: 'draft', qualityState: 'initial_detection', source: 'admin',
        matchable: true, synonyms: [], domains: [], usageCount: 0, lastUsedAt: new Date().toISOString()
    });
    
    // Tab State
    const [activeTab, setActiveTab] = useState<'general' | 'synonyms' | 'settings' | 'history'>('general');
    
    // Synonyms Editing State
    const [newSynonym, setNewSynonym] = useState('');
    const [newSynLang, setNewSynLang] = useState<'he'|'en'>('he');
    const [newSynPriority, setNewSynPriority] = useState(3);
    const [newSynType, setNewSynType] = useState<'synonym'|'alias'|'abbreviation'>('synonym');
    const [editingSynId, setEditingSynId] = useState<string | null>(null);
    const [editingAliasIndex, setEditingAliasIndex] = useState<number | null>(null);
    const [editingAliasKey, setEditingAliasKey] = useState<string | null>(null);
    const [synonymSearch, setSynonymSearch] = useState('');
    const [isSynSaving, setIsSynSaving] = useState(false);
    const [aliasPriorityMap, setAliasPriorityMap] = useState<Record<string, number>>({});
    const [isTagNameListOpen, setIsTagNameListOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (tag) {
                setFormData({
                    ...tag,
                    synonyms: normalizeIncomingSynonyms(tag.synonyms),
                });
            } else {
                // Reset for new
                setFormData({
                    id: Date.now().toString(),
                    tagKey: '',
                    displayNameHe: '',
                    displayNameEn: '',
                    type: 'role',
                    category: '',
                    descriptionHe: '',
                    status: 'draft',
                    qualityState: 'initial_detection',
                    source: 'admin',
                    matchable: true,
                    synonyms: [],
                    domains: [],
                    usageCount: 0,
                    lastUsedAt: new Date().toISOString(),
                });
            }
            setActiveTab('general');
            setEditingSynId(null);
            setEditingAliasIndex(null);
            setSynonymSearch('');
        }
    }, [isOpen, tag]);

    const [historyEntries, setHistoryEntries] = useState<TagHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const historyFieldLabels: Record<string, string> = {
        displayNameHe: 'שם (עברית)',
        displayNameEn: 'שם (אנגלית)',
        type: 'סוג',
        category: 'קטגוריה',
        status: 'סטטוס',
        qualityState: 'איכות',
        source: 'מקור',
        aliases: 'שמות אחרים',
        synonyms: 'מילים נרדפות',
        internalNote: 'הערה פנימית',
    };
    const actionLabels: Record<string, string> = {
        create: 'נוצר',
        update: 'עודכן',
        delete: 'נמחק',
    };
    const formatHistoryValue = (value: any) => {
        if (Array.isArray(value)) {
            return value.length ? value.join(', ') : '—';
        }
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'boolean') return value ? 'כן' : 'לא';
        return String(value);
    };
    const normalizeSynonymList = (value: any) => {
        if (!value) return [];
        return ensureArray(value)
            .map((item) => {
                if (!item) return '';
                if (typeof item === 'string') return item.trim();
                return (item.phrase || '').trim();
            })
            .filter(Boolean)
            .sort();
    };
    const areArraysEqual = (field: string, beforeValue: any, afterValue: any) => {
        if (!Array.isArray(beforeValue) && !Array.isArray(afterValue)) {
            return false;
        }
        if (field === 'synonyms') {
            const beforeList = normalizeSynonymList(beforeValue);
            const afterList = normalizeSynonymList(afterValue);
            return beforeList.join('|') === afterList.join('|');
        }
        if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
            const beforeList = Array.isArray(beforeValue) ? beforeValue.map((item) => String(item || '').trim()).sort() : [];
            const afterList = Array.isArray(afterValue) ? afterValue.map((item) => String(item || '').trim()).sort() : [];
            return beforeList.join('|') === afterList.join('|');
        }
        return false;
    };
    const valuesAreEqual = (field: string, beforeValue: any, afterValue: any) => {
        if (field === 'synonyms' || field === 'aliases') {
            return areArraysEqual(field, beforeValue, afterValue);
        }
        if (typeof beforeValue === 'string' && typeof afterValue === 'string') {
            return beforeValue.trim() === afterValue.trim();
        }
        return beforeValue === afterValue;
    };
    const getHistoryDiffRows = (entry: TagHistoryEntry) => {
        const before = entry.changes?.before || {};
        const after = entry.changes?.after || {};
        const rows = Object.entries(historyFieldLabels)
            .map(([field, label]) => {
                const beforeValue = (before as any)[field];
                const afterValue = (after as any)[field];
                if (valuesAreEqual(field, beforeValue, afterValue)) return null;
                return {
                    field,
                    label,
                    before: formatHistoryValue(beforeValue),
                    after: formatHistoryValue(afterValue),
                };
            })
            .filter((row): row is { field: string; label: string; before: string; after: string } => Boolean(row));
        if (rows.length) return rows;
        const changedFields = Object.keys(historyFieldLabels).filter((field) => {
            const beforeValue = (before as any)[field];
            const afterValue = (after as any)[field];
            return !valuesAreEqual(field, beforeValue, afterValue);
        });
        return changedFields.map((field) => {
            const beforeValue = (before as any)[field];
            const afterValue = (after as any)[field];
            return {
                field,
                label: historyFieldLabels[field],
                before: formatHistoryValue(beforeValue),
                after: formatHistoryValue(afterValue),
            };
        });
    };

    const getSanitizedHistoryPayload = (entry: TagHistoryEntry) => {
        const payload = entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : {};
        ['before', 'after'].forEach((key) => {
            if (payload[key]?.embedding) {
                delete payload[key].embedding;
            }
        });
        return payload;
    };
    const renderJsonValue = (value: any) => {
        if (Array.isArray(value)) {
            if (!value.length) return '—';
            return (
                <div className="flex flex-wrap gap-1">
                    {value.map((item, idx) => (
                        <span key={idx} className="text-text-default">
                            {typeof item === 'object' ? JSON.stringify(item) : item}
                        </span>
                    ))}
                </div>
            );
        }
        if (value === null || value === undefined || value === '') return '—';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };
    useEffect(() => {
        if (!isOpen || !tag?.id) {
            setHistoryEntries([]);
            setHistoryLoading(false);
            return;
        }
        const controller = new AbortController();
        let active = true;
        setHistoryLoading(true);

        (async () => {
            try {
                const baseUrl = apiBase || '';
                const res = await fetch(`${baseUrl}/api/tags/${tag.id}/history`, {
                    signal: controller.signal,
                });
                if (!res.ok) {
                    throw new Error('Failed to fetch history');
                }
                const payload = await res.json();
                if (active) {
                    setHistoryEntries(Array.isArray(payload) ? payload : []);
                }
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    console.error('[TagEditorModal] failed to load history', err);
                }
                if (active) {
                    setHistoryEntries([]);
                }
            } finally {
                if (active) {
                    setHistoryLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [apiBase, isOpen, tag?.id]);

    const filteredTagNameOptions = useMemo(() => {
        const query = (formData.displayNameHe || '').trim().toLowerCase();
        return tagNameOptions
            .filter(opt => !query || opt.toLowerCase().includes(query))
            .slice(0, 30);
    }, [formData.displayNameHe, tagNameOptions]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };


    const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked }));
    };
    
    const checkDuplicateSynonym = (phrase: string): string[] => {
        const results: string[] = [];
        const cleanPhrase = phrase.trim().toLowerCase();
        if (!cleanPhrase) return [];

        (allTags || []).forEach(t => {
            if (t.id === formData.id) return; // Skip current tag
            const hasSyn = (t.synonyms || []).some(s => (s.phrase || '').toLowerCase() === cleanPhrase);
            const nameHeMatch = (t.displayNameHe || '').toLowerCase() === cleanPhrase;
            const nameEnMatch = (t.displayNameEn || '').toLowerCase() === cleanPhrase;
            
            if (hasSyn || nameHeMatch || nameEnMatch) {
                results.push(t.displayNameHe || t.displayNameEn || t.tagKey);
            }
        });
        return results;
    };

    const addSynonym = () => {
        if (!newSynonym.trim()) return;
        
        const duplicates = checkDuplicateSynonym(newSynonym);
        if (duplicates.length > 0) {
            if (!window.confirm(`אזהרה: הביטוי "${newSynonym}" כבר מופיע בתגיות הבאות: ${duplicates.join(', ')}. האם להוסיף בכל זאת?`)) {
                return;
            }
        }

        if (editingAliasIndex !== null) {
            setFormData(prev => {
                const aliases = [...(prev.aliases || [])];
                aliases[editingAliasIndex] = newSynonym;
                return { ...prev, aliases };
            });
            setAliasPriorityMap(prev => {
                const next = { ...prev };
                if (editingAliasKey) delete next[editingAliasKey];
                next[newSynonym] = newSynPriority;
                return next;
            });
        } else if (editingSynId) {
            setFormData(prev => ({
                ...prev,
                synonyms: prev.synonyms.map(s => s.id === editingSynId ? { ...s, phrase: newSynonym, language: newSynLang as any, priority: newSynPriority, type: newSynType } : s)
            }));
        } else {
            const newItem: TagSynonym = {
                id: Date.now().toString(),
                phrase: newSynonym,
                language: newSynLang as any,
                type: newSynType,
                priority: newSynPriority
            };
            setFormData(prev => ({ ...prev, synonyms: [...prev.synonyms, newItem] }));
        }
        setNewSynonym('');
        setEditingSynId(null);
        setEditingAliasIndex(null);
        setNewSynPriority(3);
        setNewSynType('synonym');
    };

    const startEditSynonym = (syn: TagSynonym) => {
        setNewSynonym(syn.phrase);
        const normalizedLang = (syn.language || '').toLowerCase() === 'en' ? 'en' : 'he';
        setNewSynLang(normalizedLang);
        setNewSynType(syn.type || 'synonym');
        setNewSynPriority(syn.priority || 3);
        setEditingSynId(syn.id);
        if (syn.source === 'alias') {
            setEditingAliasIndex(syn.aliasIndex ?? null);
            setEditingAliasKey(syn.phrase);
        } else {
            setEditingAliasIndex(null);
            setEditingAliasKey(null);
        }
    };

    const cancelEditSynonym = () => {
        setNewSynonym('');
        setEditingSynId(null);
        setEditingAliasIndex(null);
        setNewSynPriority(3);
        setNewSynType('synonym');
        setEditingAliasKey(null);
    };

    const removeSynonym = (syn: TagSynonym) => {
        if (syn.source === 'alias') {
            setFormData(prev => ({
                ...prev,
                aliases: (prev.aliases || []).filter((_, idx) => idx !== syn.aliasIndex)
            }));
            if (editingAliasIndex === syn.aliasIndex) {
                setEditingAliasIndex(null);
                setEditingSynId(null);
            }
            setAliasPriorityMap(prev => {
                const next = { ...prev };
                if (syn.phrase) delete next[syn.phrase];
                return next;
            });
        } else {
            setFormData(prev => ({
                ...prev,
                synonyms: prev.synonyms.filter(s => s.id !== syn.id)
            }));
            if (editingSynId === syn.id) {
                setEditingSynId(null);
            }
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.displayNameHe && !formData.displayNameEn) {
            alert('חובה למלא שם תגית לפחות בעברית או באנגלית');
            return;
        }
        const dups: string[] = [];
        const normalizedKey = (formData.tagKey || '').trim().toLowerCase();
        const normalizedHe = (formData.displayNameHe || '').trim().toLowerCase();
        const normalizedEn = (formData.displayNameEn || '').trim().toLowerCase();
        (allTags || []).forEach(t => {
            if (t.id === formData.id) return;
            if (normalizedKey && t.tagKey?.toLowerCase() === normalizedKey) {
                dups.push('מפתח תגית (Tag Key)');
            }
            if (normalizedHe && (t.displayNameHe || '').toLowerCase() === normalizedHe) {
                dups.push('שם תצוגה (עברית)');
            }
            if (normalizedEn && (t.displayNameEn || '').toLowerCase() === normalizedEn) {
                dups.push('שם תצוגה (אנגלית)');
            }
        });
       
        onSave(formData);
    };

    const aliasRows = (formData.aliases || []).map((alias, idx) => ({
        id: `alias-${idx}-${alias}`,
        phrase: alias,
        language: '-',
        type: 'alias',
        priority: aliasPriorityMap[alias] ?? 4,
        source: 'alias' as const,
        aliasIndex: idx
    }));

    const synonymRows = (formData.synonyms || []).map(s => ({
        ...s,
        source: s.source || 'synonym'
    }));

    const filteredSynonyms = [...aliasRows, ...synonymRows].filter(s =>
        (s?.phrase || '').toLowerCase().includes((synonymSearch || '').toLowerCase())
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[85vh] overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                {/* Header */}
                        <header className="flex items-center justify-between p-5 border-b border-border-default">
                    <div>
                        <h2 className="text-xl font-bold text-text-default">{tag ? 'עריכת תגית' : 'יצירת תגית חדשה'}</h2>
                        <div className="flex items-center gap-2 text-sm text-text-muted mt-1">
                            <span>Key: {formData.tagKey || 'Pending...'}</span>
                            <StatusBadge status={formData.status} quality={formData.qualityState} />
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted"><XMarkIcon className="w-6 h-6"/></button>
                </header>

                {/* Tabs */}
                <div className="flex border-b border-border-default px-6 bg-bg-subtle/30">
                    <button onClick={() => setActiveTab('general')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'general' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>פרטים כלליים</button>
                    <button onClick={() => setActiveTab('synonyms')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'synonyms' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>מילים נרדפות ({(formData.aliases?.length || 0) + (formData.synonyms.length)})</button>
                    <button onClick={() => setActiveTab('settings')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'settings' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>הגדרות מתקדמות</button>
                <button onClick={() => setActiveTab('history')} className={`py-3 px-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary-500 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>היסטוריה</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-bg-subtle/10">
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-text-default mb-1.5">מפתח תגית (Tag Key)</label>
                                <input type="text" name="tagKey" value={formData.tagKey} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-mono text-primary-700" placeholder="e.g. role_manager" />
                                <p className="text-xs text-text-muted mt-1">מזהה ייחודי במערכת. אם יישאר ריק, ייווצר אוטומטית מהשם.</p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">שם תצוגה (עברית) <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <input
                                        name="displayNameHe"
                                        value={formData.displayNameHe}
                                        onChange={(e) => {
                                            handleChange(e);
                                            setIsTagNameListOpen(true);
                                        }}
                                        onFocus={() => setIsTagNameListOpen(true)}
                                        onBlur={() => setTimeout(() => setIsTagNameListOpen(false), 150)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                                        placeholder="הקלד או בחר שם תגית"
                                    />
                                    {isTagNameListOpen && filteredTagNameOptions.length > 0 && (
                                        <div className="absolute top-full mt-1 w-full bg-white border border-border-default rounded-xl shadow-lg max-h-40 overflow-y-auto z-20">
                                            {filteredTagNameOptions.map(option => (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        setFormData(prev => ({ ...prev, displayNameHe: option }));
                                                        setIsTagNameListOpen(false);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition"
                                                >
                                                    {option}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">שם תצוגה (אנגלית)</label>
                                <input type="text" name="displayNameEn" value={formData.displayNameEn} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm text-left" placeholder="e.g. Project Manager" dir="ltr" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-default mb-1.5">סוג תגית</label>
                                <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                                    {typePicklistOptions.length ? (
                                        typePicklistOptions.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="role">תפקיד (Role)</option>
                                            <option value="skill">מיומנות (Skill)</option>
                                            <option value="industry">תעשייה (Industry)</option>
                                            <option value="tool">כלי / תוכנה (Tool)</option>
                                            <option value="seniority">בכירות (Seniority)</option>
                                        </>
                                    )}
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
                            <div className="flex flex-col md:flex-row gap-4 items-end bg-bg-card p-4 rounded-xl border border-border-default shadow-sm">
                                <div className="flex-grow w-full">
                                    <label className="block text-xs font-bold text-text-muted mb-1">
                                        {editingSynId ? 'ערוך ביטוי / מילה נרדפת' : 'הוסף ביטוי / מילה נרדפת'}
                                    </label>
                                    <input 
                                        type="text" 
                                        value={newSynonym} 
                                        onChange={e => setNewSynonym(e.target.value)} 
                                        onKeyDown={e => e.key === 'Enter' && addSynonym()}
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" 
                                        placeholder="הקלד ביטוי..."
                                    />
                                </div>
                            <div className="w-full md:w-24">
                                 <label className="block text-xs font-bold text-text-muted mb-1">שפה</label>
                                 <select value={newSynLang} onChange={e => setNewSynLang(e.target.value as any)} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                     <option value="he">HE</option>
                                     <option value="en">EN</option>
                                 </select>
                            </div>
                                <div className="w-full md:w-24">
                                     <label className="block text-xs font-bold text-text-muted mb-1">עדיפות</label>
                                     <select value={newSynPriority} onChange={e => setNewSynPriority(Number(e.target.value))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                         {[1,2,3,4,5].map(value => (
                                            <option key={value} value={value}>{value}</option>
                                         ))}
                                     </select>
                                </div>
                            <div className="w-full md:w-24">
                                 <label className="block text-xs font-bold text-text-muted mb-1">סוג</label>
                                 <select value={newSynType} onChange={e => setNewSynType(e.target.value as any)} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                     <option value="synonym">synonym</option>
                                     <option value="alias">alias</option>
                                     <option value="abbreviation">abbreviation</option>
                                 </select>
                            </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <button onClick={addSynonym} className="flex-1 md:flex-none bg-primary-600 text-white p-2 px-4 rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2">
                                        {editingSynId ? <CheckIcon className="w-5 h-5"/> : <PlusIcon className="w-5 h-5"/>}
                                        <span className="md:hidden">{editingSynId ? 'עדכן' : 'הוסף'}</span>
                                    </button>
                                    {editingSynId && (
                                        <button onClick={cancelEditSynonym} className="flex-1 md:flex-none bg-bg-subtle text-text-muted p-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center justify-center gap-2">
                                            <XMarkIcon className="w-5 h-5"/>
                                            <span className="md:hidden">ביטול</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="relative">
                                <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    placeholder="חפש במילים הנרדפות של תגית זו..." 
                                    value={synonymSearch}
                                    onChange={e => setSynonymSearch(e.target.value)}
                                    className="w-full bg-bg-card border border-border-default rounded-lg py-2 pl-3 pr-9 text-xs focus:ring-1 focus:ring-primary-500 transition" 
                                />
                            </div>

                            <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-bg-subtle text-text-muted font-semibold text-xs border-b border-border-default">
                                        <tr>
                                            <th className="p-3">ביטוי</th>
                                            <th className="p-3">שפה</th>
                                            <th className="p-3">סוג</th>
                                            <th className="p-3">עדיפות</th>
                                            <th className="p-3 w-24"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {filteredSynonyms.map((syn, sIdx) => (
                                            <tr key={syn.id || `syn-edit-${sIdx}`} className={`hover:bg-bg-hover ${editingSynId === syn.id ? 'bg-primary-50' : ''}`}>
                                                <td className="p-3 font-medium">{typeof syn === 'string' ? syn : syn.phrase}</td>
                                                <td className="p-3 uppercase text-xs">{typeof syn === 'string' ? '-' : syn.language}</td>
                                                <td className="p-3 text-xs text-text-subtle">{typeof syn === 'string' ? '-' : syn.type}</td>
                                                <td className="p-3 text-xs">
                                                    {typeof syn === 'string' ? '-' : (
                                                        <select
                                                            className="w-full bg-bg-input border border-border-default rounded-lg p-1 text-xs"
                                                            value={syn.source === 'alias'
                                                                ? (aliasPriorityMap[syn.phrase] ?? syn.priority ?? 4)
                                                                : (syn.priority ?? 3)}
                                                            onChange={(e) => {
                                                                const nextPriority = Number(e.target.value);
                                                                if (syn.source === 'alias') {
                                                                    setAliasPriorityMap(prev => ({
                                                                        ...prev,
                                                                        [syn.phrase]: nextPriority
                                                                    }));
                                                                } else {
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        synonyms: prev.synonyms.map(s => s.id === syn.id ? { ...s, priority: nextPriority } : s)
                                                                    }));
                                                                }
                                                            }}
                                                        >
                                                            {[1,2,3,4,5].map(value => (
                                                                <option key={value} value={value}>{value}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => startEditSynonym(syn)} className="text-text-subtle hover:text-primary-600 transition-colors">
                                                            <PencilIcon className="w-4 h-4"/>
                                                        </button>
                                                        <button onClick={() => removeSynonym(syn)} className="text-text-subtle hover:text-red-500 transition-colors">
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredSynonyms.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-text-muted">
                                                    {synonymSearch ? 'לא נמצאו מילים נרדפות התואמות את החיפוש' : 'אין מילים נרדפות מוגדרות'}
                                                </td>
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
                                            <option value="draft">Draft (טיוטה)</option>
                                            <option value="active">Active (פעיל)</option>
                                            <option value="deprecated">Deprecated (מיושן)</option>
                                            <option value="archived">Archived (ארכיון)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">מצב איכות (Quality State)</label>
                                        <select name="qualityState" value={formData.qualityState} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                                            <option value="initial_detection">זיהוי ראשוני</option>
                                            <option value="needs_review">Needs Review (לביקורת)</option>
                                            <option value="verified">Verified (מאומת)</option>
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
                    {activeTab === 'history' && (
                        <div className="space-y-3">
                            {historyLoading && (
                                <div className="p-4 text-center text-text-muted">טוען היסטוריה...</div>
                            )}
                            {!historyLoading && historyEntries.length === 0 && (
                                <div className="p-4 text-center text-text-muted">אין היסטוריית עדכונים</div>
                            )}
                            {!historyLoading && historyEntries.map(entry => {
                                const diffRows = getHistoryDiffRows(entry);
                                const payload = getSanitizedHistoryPayload(entry);
                                return (
                                <div key={entry.id} className="border border-border-default rounded-xl p-3 bg-bg-card/70">
                                       
                                        <details className="mt-3 text-[10px]">
                                            <summary className="font-semibold text-primary-600 cursor-pointer">JSON של השינוי</summary>
                                            <div className="mt-2 grid gap-4 text-[11px]">
                                                {(['before', 'after'] as const).map((key) => {
                                                    const section = payload[key] || {};
                                                    const entries = Object.entries(section);
                                                    return (
                                                        <div key={key} className="bg-bg-input rounded-xl p-3 space-y-2">
                                                            <div className="text-[10px] font-semibold text-text-muted uppercase">{key}</div>
                                                            {entries.length ? entries.map(([field, value]) => (
                                                                <div key={field} className="grid grid-cols-[90px,1fr] gap-1 text-[10px]">
                                                                    <div className="text-text-muted">{field}</div>
                                                                    <div className="text-text-default">{renderJsonValue(value)}</div>
                                                                </div>
                                                            )) : (
                                                                <div className="text-text-muted">אין נתונים</div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    </div>
                                );
                            })}
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

const PICKLIST_CATEGORY_ID = '7605ff08-fc40-49ef-9e90-4c6490c5c25c';

const AdminTagsView: React.FC = () => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<TagStatus[]>([]);
    const [synonymFilter, setSynonymFilter] = useState('');
    const [editingTag, setEditingTag] = useState<Tag | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Bulk & AI State
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(() => new Set<string>());
    const [isEnriching, setIsEnriching] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
    const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
    const [isSavingSuggestions, setIsSavingSuggestions] = useState(false);
    const [newSynonyms, setNewSynonyms] = useState<Record<number, string>>({});
    const [newSynLangs, setNewSynLangs] = useState<Record<number, 'he' | 'en'>>({});
    const [newSynTypes, setNewSynTypes] = useState<Record<number, 'synonym' | 'alias' | 'abbreviation'>>({});
    const [isSynSaving, setIsSynSaving] = useState(false);
    const [blockingCandidates, setBlockingCandidates] = useState<BlockingCandidate[]>([]);
    const [isBlockingModalOpen, setIsBlockingModalOpen] = useState(false);
    const [pendingTagDelete, setPendingTagDelete] = useState<Tag | null>(null);
    const [isResolvingBlocking, setIsResolvingBlocking] = useState(false);
    const [blockingError, setBlockingError] = useState<string | null>(null);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
    const [blockingSearch, setBlockingSearch] = useState('');
    const [isDeleteErrorModalOpen, setIsDeleteErrorModalOpen] = useState(false);
    const [candidateActions, setCandidateActions] = useState<Record<string, { action: 'delete' | 'reassign'; targetTagId: string | null }>>({});
    const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);
    const [inlineDropdownOpenFor, setInlineDropdownOpenFor] = useState<string | null>(null);
    const bulkDropdownRef = useRef<HTMLDivElement>(null);
    const inlineDropdownRef = useRef<HTMLDivElement | null>(null);
    const [typePicklistOptions, setTypePicklistOptions] = useState<{ label: string; value: string }[]>([]);
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
    const [categorySearch, setCategorySearch] = useState('');
    const typeDropdownRef = useRef<HTMLDivElement>(null);
    const categoryDropdownRef = useRef<HTMLDivElement>(null);
    const statusDropdownRef = useRef<HTMLDivElement>(null);
    const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>('');
    const [createdFrom, setCreatedFrom] = useState('');
    const [createdTo, setCreatedTo] = useState('');
    const [updatedFrom, setUpdatedFrom] = useState('');
    const [updatedTo, setUpdatedTo] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'tagKey', direction: 'asc' });
    const [columnOrder, setColumnOrder] = useState<SortKey[]>(['tagKey', 'displayNameHe', 'displayNameEn', 'type', 'category', 'status', 'createdAt', 'source', 'usageCount']);
    const [inlineLoading, setInlineLoading] = useState<Record<string, boolean>>({});
    const [bulkActionType, setBulkActionType] = useState<'delete' | 'reassign'>('delete');
    const [bulkTargetTagId, setBulkTargetTagId] = useState<string>('');
    const [bulkTagSearch, setBulkTagSearch] = useState('');
    const [inlineTagSearch, setInlineTagSearch] = useState('');
    const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [filterVertical, setFilterVertical] = useState(true);
    const navigate = useNavigate();
    const pageSizeOptions = useMemo(() => [10, 50, 100, 200, 500], []);
    const [pageSize, setPageSize] = useState(100);
    const [page, setPage] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);
    const resolveSuggestedType = useCallback((suggestion: any) => {
        const normalize = (value?: string) => (value || '').toString().trim().toLowerCase();
        const picklist = typePicklistOptions || [];
        const findMatch = (value?: string) => {
            const normalized = normalize(value);
            if (!normalized) return undefined;
            return picklist.find(option => {
                const valueMatch = (option.value || '').trim().toLowerCase();
                const labelMatch = (option.label || '').trim().toLowerCase();
                return valueMatch === normalized || labelMatch === normalized;
            });
        };

        if (suggestion?.type) {
            const match = findMatch(suggestion.type);
            if (match) return match.value || suggestion.type;
        }
        if (suggestion?.tagKey) {
            const match = findMatch(suggestion.tagKey);
            if (match) return match.value || suggestion.tagKey;
        }

        return suggestion?.type || '';
    }, [typePicklistOptions]);
    const filterLayoutClass = filterVertical ? 'grid grid-cols-1 md:grid-cols-6 gap-3' : 'grid grid-cols-1 gap-3';

    const tagNameOptions = useMemo(() => {
        return Array.from(new Set(
            tags
                .filter(tag => tag.status === 'active')
                .flatMap(tag => [tag.displayNameHe, tag.displayNameEn, tag.tagKey])
                .filter(Boolean)
                .map((value) => (value || '').trim())
        ));
    }, [tags]);

    const categoryOptions = useMemo<string[]>(() => {
        const setValues = new Set<string>(
            tags
                .map(tag => (tag.category || '').trim())
                .filter(Boolean) as string[]
        );
        return Array.from(setValues).sort((a, b) => a.localeCompare(b));
    }, [tags]);

    const filteredCategoryOptions = useMemo(() => {
        const query = categorySearch.trim().toLowerCase();
        if (!query) return categoryOptions;
        return categoryOptions.filter(option => option.toLowerCase().includes(query));
    }, [categoryOptions, categorySearch]);

    const statusOptions: TagStatus[] = ['active', 'draft', 'deprecated', 'archived', 'pending'];

    const toggleTypeSelection = (value: string) => {
        setSelectedTypes(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]);
    };

    const toggleCategorySelection = (value: string) => {
        const normalized = value.trim();
        if (!normalized) return;
        setSelectedCategories(prev => prev.includes(normalized) ? prev.filter(item => item !== normalized) : [...prev, normalized]);
    };

    const toggleStatusSelection = (value: TagStatus) => {
        setSelectedStatuses(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]);
    };

    const toggleSort = (key: SortKey) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const columnMeta: Record<SortKey, { label: string }> = {
        tagKey: { label: 'Tag Key' },
        displayNameHe: { label: 'שם (עברית)' },
        displayNameEn: { label: 'שם (אנגלית)' },
        type: { label: 'סוג' },
        category: { label: 'קטגוריה' },
        status: { label: 'סטטוס' },
        createdAt: { label: 'תאריך יצירה' },
        source: { label: 'מקור' },
        usageCount: { label: 'שימוש' },
    };

    const handleColumnDragStart = (event: React.DragEvent<HTMLTableHeaderCellElement>, key: SortKey) => {
        event.dataTransfer.setData('text/plain', key);
        event.currentTarget.classList.add('opacity-70');
    };

    const handleColumnDragEnd = (event: React.DragEvent<HTMLTableHeaderCellElement>) => {
        event.currentTarget.classList.remove('opacity-70');
    };

    const handleColumnDrop = (event: React.DragEvent<HTMLTableHeaderCellElement>, targetKey: SortKey) => {
        event.preventDefault();
        const draggedKey = event.dataTransfer.getData('text/plain') as SortKey;
        if (!draggedKey || draggedKey === targetKey) return;
        setColumnOrder(prev => {
            const next = [...prev];
            const fromIndex = next.indexOf(draggedKey);
            const toIndex = next.indexOf(targetKey);
            if (fromIndex === -1 || toIndex === -1) return prev;
            next.splice(fromIndex, 1);
            next.splice(toIndex, 0, draggedKey);
            return next;
        });
    };

    const renderSortIndicator = (key: SortKey) => {
        if (sortConfig.key !== key) return null;
        return (
            <ChevronDownIcon className={`w-3 h-3 transition ${sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
        );
    };

    const getCountForTag = (tag: Tag) => usageCounts[tag.id] ?? tag.usageCount;

    const renderColumnCell = (tag: Tag, key: SortKey) => {
        switch (key) {
            case 'tagKey':
                return (
                    <td className="p-4 font-mono text-xs text-primary-700 font-semibold truncate">{tag.tagKey}</td>
                );
            case 'displayNameHe':
                return (
                    <td className="p-4 font-bold text-text-default break-words">{tag.displayNameHe}</td>
                );
            case 'displayNameEn':
                return (
                    <td className="p-4 text-text-default break-words">{tag.displayNameEn}</td>
                );
            case 'type':
                return (
                    <td className="p-4"><TypeBadge type={tag.type}/></td>
                );
            case 'category':
                return (
                    <td className="p-4 text-text-muted break-words">{tag.category}</td>
                );
            case 'status':
                return (
                    <td className="p-4 space-y-2">
                        <select
                            value={tag.status}
                            onChange={(e) => { e.stopPropagation(); handleInlineUpdate(tag.id, { status: e.target.value as TagStatus }); }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={inlineLoading[tag.id]}
                            className="w-full bg-bg-input border border-border-default rounded-xl py-1.5 px-3 text-xs text-text-default"
                        >
                            {statusOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <select
                            value={tag.qualityState}
                            onChange={(e) => { e.stopPropagation(); handleInlineUpdate(tag.id, { qualityState: e.target.value as QualityState }); }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={inlineLoading[tag.id]}
                            className="w-full bg-bg-input border border-border-default rounded-xl py-1.5 px-3 text-xs text-text-default"
                        >
                            {qualityOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        {inlineLoading[tag.id] && (
                            <div className="text-[10px] text-primary-600 font-semibold">שומר...</div>
                        )}
                    </td>
                );
            case 'createdAt':
                return (
                    <td className="p-4 text-xs text-text-muted">{formatDateTime(tag.createdAt || tag.lastUsedAt)}</td>
                );
            case 'source':
                return (
                    <td className="p-4 text-text-muted">{getSourceDisplayName(tag.source)}</td>
                );
            case 'usageCount':
                return (
                    <td className="p-4 text-xs tabular-nums">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleUsageNavigate(tag); }}
                            className={`w-full text-left font-semibold ${tag.tagKey ? 'text-primary-600 hover:text-primary-800' : 'text-text-muted cursor-not-allowed'}`}
                            disabled={!tag.tagKey}
                        >
                            {getCountForTag(tag).toLocaleString()}
                        </button>
                    </td>
                );
            default:
                return null;
        }
    };

    const handleUsageNavigate = (tag: Tag) => {
        if (!tag.tagKey) return;
        navigate(`/admin/candidates?tag=${encodeURIComponent(tag.id)}`);
    };

    const handleInlineUpdate = async (tagId: string, updates: Partial<Pick<Tag, 'status' | 'qualityState'>>) => {
        setInlineLoading(prev => ({ ...prev, [tagId]: true }));
        try {
            const res = await fetch(`${apiBase}/api/tags/${tagId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error(await res.text() || 'עדכון נכשל');
            const updated = await res.json();
            setTags(prev => prev.map(t => (t.id === tagId ? updated : t)));
        } catch (err: any) {
            alert(err?.message || 'עדכון נכשל');
        } finally {
            setInlineLoading(prev => {
                const next = { ...prev };
                delete next[tagId];
                return next;
            });
        }
    };

    const qualityOptions: QualityState[] = ['verified', 'needs_review', 'experimental', 'initial_detection'];

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    // Sort & Filter
    const refreshUsageCounts = useCallback(async (ids: string[]) => {
        if (!apiBase || !ids.length) return;
        try {
            const res = await fetch(`${apiBase}/api/admin/candidate-tags/counts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagIds: ids }),
            });
            if (!res.ok) throw new Error(await res.text() || 'Failed to load usage counts');
            const payload = await res.json();
            setUsageCounts(prev => ({ ...prev, ...payload }));
        } catch (error) {
            console.error('Failed to refresh usage counts', error);
        }
    }, [apiBase]);

    const loadTags = useCallback(async () => {
        if (!apiBase) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(pageSize));
            if (searchTerm.trim()) params.set('search', searchTerm.trim());
            if (synonymFilter.trim()) params.set('synonym', synonymFilter.trim());
            if (selectedTypes.length) params.set('types', selectedTypes.join(','));
            if (selectedCategories.length) params.set('categories', selectedCategories.join(','));
            if (selectedStatuses.length) params.set('statuses', selectedStatuses.join(','));
            if (sourceFilter) params.set('source', sourceFilter);
            if (createdFrom) params.set('createdFrom', createdFrom);
            if (createdTo) params.set('createdTo', createdTo);
            if (updatedFrom) params.set('updatedFrom', updatedFrom);
            if (updatedTo) params.set('updatedTo', updatedTo);
            const currentSortKey = sortConfig.key || 'tagKey';
            params.set('sort', currentSortKey);
            params.set('direction', sortConfig.direction);
            const res = await fetch(`${apiBase}/api/tags?${params.toString()}`, {
                cache: 'reload',
            });
            if (!res.ok) throw new Error('Failed to load tags');
            const payload = await res.json();
            const data = Array.isArray(payload.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];
            setTags(data);
            setTotalRecords(Number(payload.total ?? payload?.data?.length ?? data.length));
            refreshUsageCounts(data.map((tag: Tag) => tag.id));
        } catch (err: any) {
            setError(err.message || 'Load failed');
            setTags([]);
            setTotalRecords(0);
        } finally {
            setLoading(false);
        }
    }, [
        apiBase,
        page,
        pageSize,
        searchTerm,
        synonymFilter,
        selectedTypes,
        selectedCategories,
        selectedStatuses,
        sourceFilter,
        createdFrom,
        createdTo,
        updatedFrom,
        updatedTo,
        sortConfig.key,
        sortConfig.direction,
        refreshUsageCounts,
    ]);

    useEffect(() => {
        loadTags();
    }, [loadTags]);

    const loadTypeOptions = useCallback(async () => {
        const baseUrl = apiBase || '';
        try {
            const res = await fetch(`${baseUrl}/api/picklists/categories/${PICKLIST_CATEGORY_ID}/values`);
            if (!res.ok) throw new Error('Failed to load picklist options');
            const values = await res.json();
            if (!Array.isArray(values)) return;
            const normalized = values
                .map((item: any) => ({
                    label: String(item.label || item.value || '').trim(),
                    value: String(item.value || item.label || '').trim(),
                }))
                .filter(item => item.label);
            setTypePicklistOptions(normalized);
        } catch (err) {
            console.error('[AdminTagsView] failed to load type picklist', err);
        }
    }, [apiBase]);

    useEffect(() => {
        loadTypeOptions();
    }, [loadTypeOptions]);

    useEffect(() => {
        const handler = () => loadTags();
        window.addEventListener('hiro-tags-created', handler);
        return () => window.removeEventListener('hiro-tags-created', handler);
    }, [loadTags]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
                setTypeDropdownOpen(false);
            }
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
                setCategoryDropdownOpen(false);
            }
            if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
                setStatusDropdownOpen(false);
            }
            if (bulkDropdownRef.current && !bulkDropdownRef.current.contains(event.target as Node)) {
                setBulkDropdownOpen(false);
            }
            if (inlineDropdownRef.current && !inlineDropdownRef.current.contains(event.target as Node)) {
                setInlineDropdownOpenFor(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!inlineDropdownOpenFor) {
            inlineDropdownRef.current = null;
        }
    }, [inlineDropdownOpenFor]);

    useEffect(() => {
        if (aiSuggestions.length) {
            setCategoryDropdownOpen(true);
        }
    }, [aiSuggestions]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm, selectedTypes, selectedCategories, selectedStatuses, synonymFilter, sourceFilter, createdFrom, createdTo, updatedFrom, updatedTo, sortConfig.key, sortConfig.direction, pageSize]);

    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    useEffect(() => {
        setPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const startIndex = totalRecords ? (page - 1) * pageSize : 0;
    const endIndex = Math.min(startIndex + pageSize, totalRecords);
    const handlePageSizeChange = (value: number) => {
        setPageSize(value);
        setPage(1);
    };
    const goToPage = (target: number) => {
        if (target < 1 || target > totalPages) return;
        setPage(target);
    };

    const availableReassignTags = useMemo(() => {
        if (!pendingTagDelete) return tags;
        return tags.filter(tag => tag.id !== pendingTagDelete.id);
    }, [tags, pendingTagDelete]);

    const filteredReassignOptions = useMemo(() => {
        const query = bulkTagSearch.trim().toLowerCase();
        if (!query) return availableReassignTags;
        return availableReassignTags.filter(tag =>
            (tag.displayNameHe || tag.displayNameEn || tag.tagKey || '')
                .toLowerCase()
                .includes(query)
        );
    }, [availableReassignTags, bulkTagSearch]);

    const filteredInlineOptions = useMemo(() => {
        const query = inlineTagSearch.trim().toLowerCase();
        if (!query) return availableReassignTags;
        return availableReassignTags.filter(tag =>
            (tag.displayNameHe || tag.displayNameEn || tag.tagKey || '')
                .toLowerCase()
                .includes(query)
        );
    }, [availableReassignTags, inlineTagSearch]);

    useEffect(() => {
        if (bulkActionType === 'reassign' && availableReassignTags.length) {
            setBulkTargetTagId(prev => prev || availableReassignTags[0].id || '');
            return;
        }
        if (bulkActionType === 'delete') {
            setBulkTargetTagId('');
        }
    }, [bulkActionType, availableReassignTags]);

    const hasReassignWithoutTarget = useMemo(() => {
        return blockingCandidates.some(candidate => {
            const id = candidate.candidate_tag_id || candidate.candidateTagId;
            if (!id) return false;
            const actionEntry = candidateActions[id];
            return actionEntry?.action === 'reassign' && !actionEntry.targetTagId;
        });
    }, [blockingCandidates, candidateActions]);

    const applyBulkAction = () => {
        if (!blockingCandidates.length) return;
        if (bulkActionType === 'reassign' && !bulkTargetTagId) {
            setBlockingError('אנא בחר תגית יעד לפני החלת שינוי גורף');
            return;
        }
        blockingCandidates.forEach(candidate => {
            const candidateTagId = candidate.candidate_tag_id || candidate.candidateTagId;
            if (!candidateTagId) return;
            updateCandidateAction(candidateTagId, {
                action: bulkActionType,
                targetTagId: bulkActionType === 'reassign' ? bulkTargetTagId : null,
            });
        });
    };

    const updateCandidateAction = (candidateTagId: string, updates: Partial<{ action: 'delete' | 'reassign'; targetTagId: string | null }>) => {
        setCandidateActions(prev => ({
            ...prev,
            [candidateTagId]: {
                ...(prev[candidateTagId] || { action: 'delete', targetTagId: null }),
                ...updates,
            },
        }));
    };

    const handleCreate = () => {
        setEditingTag(null);
        setIsModalOpen(true);
    };

    const handleEdit = (tag: Tag) => {
        setEditingTag(tag);
        setIsModalOpen(true);
    };

    const extractServerMessage = async (res: Response, fallback: string) => {
        if (res.ok) return null;
        let textPayload = await res.text();
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                const parsed = JSON.parse(textPayload);
                throw Object.assign(new Error(parsed?.message || fallback), {
                    duplicate: parsed?.duplicate,
                });
            } catch (error) {
                if (error instanceof Error) throw error;
                if (textPayload) throw new Error(textPayload);
                throw new Error(fallback);
            }
        }
        if (textPayload) throw new Error(textPayload);
        throw new Error(fallback);
    };

    type DuplicateAlert = {
        message: string;
        displayNameHe?: string;
    };
    const [duplicateAlert, setDuplicateAlert] = useState<DuplicateAlert | null>(null);

    useEffect(() => {
        if (!duplicateAlert) return;
        const timer = setTimeout(() => setDuplicateAlert(null), 4000);
        return () => clearTimeout(timer);
    }, [duplicateAlert]);

    const handleSave = async (savedTag: Tag) => {
        const payload: any = { ...savedTag };
        if (!editingTag) {
            delete payload.id;
            delete payload.usageCount;
            delete payload.lastUsedAt;
        }
        delete payload.tagKey;
        try {
            if (editingTag) {
                const res = await fetch(`${apiBase}/api/tags/${editingTag.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                await extractServerMessage(res, 'Update failed');
                const updated = await res.json();
                setTags(prev => prev.map(t => t.id === editingTag.id ? updated : t));
            } else {
                const res = await fetch(`${apiBase}/api/tags`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                await extractServerMessage(res, 'Create failed');
                const created = await res.json();
                setTags(prev => [...prev, created]);
            }
            setIsModalOpen(false);
        } catch (err: any) {
            setDuplicateAlert({
                message: err?.message || 'Save failed',
                displayNameHe: err?.duplicate?.displayNameHe,
            });
        }
    };
    
    const deleteTagById = async (id: string) => {
        const res = await fetch(`${apiBase}/api/tags/${id}`, { method: 'DELETE' });
        if (res.ok) return;
        const text = await res.text();
        let payload: any = { message: text };
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = { message: text };
            }
        }
        const err: any = new Error(payload.message || 'Delete failed');
        err.payload = payload;
        throw err;
    };

    const openBlockingModal = (tag: Tag, payload: any) => {
        setPendingTagDelete(tag);
        setBlockingCandidates(payload.candidates);
        setCandidateActions(payload.candidates.reduce((acc: Record<string, { action: 'delete' | 'reassign'; targetTagId: string | null }>, candidate: BlockingCandidate) => {
            const key = candidate.candidate_tag_id || candidate.candidateTagId;
            if (key) {
                acc[key] = { action: 'delete', targetTagId: null };
            }
            return acc;
        }, {}));
        setBlockingError(payload.helperError || null);
        setBlockingSearch('');
        setIsBlockingModalOpen(true);
    };

    const handleDelete = async (tag: Tag) => {
        if(!window.confirm("Delete this tag?")) return;
       
        const prevTags = [...tags];
        setTags(prev => prev.filter(t => t.id !== tag.id));
        setSelectedTagIds(prev => {
            const next = new Set(prev);
            next.delete(tag.id);
            return next;
        });
        try {
            await deleteTagById(tag.id);
        } catch (err: any) {
            setTags(prevTags);
            const payload = err.payload;
            if (payload?.candidates && payload.candidates.length) {
                openBlockingModal(tag, payload);
                return;
            }
            const message = payload?.message || err.message || 'Delete failed';
            setDeleteErrorMessage(message);
            setIsDeleteErrorModalOpen(true);
        }
    };

    const getCandidateDisplayName = (candidate: BlockingCandidate) => {
        return candidate.fullName || candidate.full_name || candidate.email || candidate.phone || 'ללא שם';
    };

    const getUsageCandidateName = (entry: UsageCandidate) => {
        return entry.candidate?.fullName || 'ללא שם';
    };

    const filteredBlockingCandidates = useMemo(() => {
        const normalized = blockingSearch.trim().toLowerCase();
        if (!normalized) return blockingCandidates;
        return blockingCandidates.filter(candidate =>
            getCandidateDisplayName(candidate).toLowerCase().includes(normalized)
        );
    }, [blockingCandidates, blockingSearch]);

    const resetBlockingForm = () => {
        setBlockingCandidates([]);
        setCandidateActions({});
        setBlockingError(null);
        setBulkActionType('delete');
        setBulkTargetTagId('');
    };

    const closeBlockingModal = () => {
        setIsBlockingModalOpen(false);
        setPendingTagDelete(null);
        resetBlockingForm();
        setBlockingSearch('');
    };

    const closeDeleteErrorModal = () => {
        setIsDeleteErrorModalOpen(false);
        setDeleteErrorMessage(null);
    };

    const resolveBlockingCandidates = async () => {
        if (!pendingTagDelete || !blockingCandidates.length) return;
        setIsResolvingBlocking(true);
        setBlockingError(null);
        const prevTags = [...tags];
        try {
            const actions = blockingCandidates
                .map(entry => {
                const candidateTagId = entry.candidate_tag_id || entry.candidateTagId;
                    if (!candidateTagId) return null;
                const action = candidateActions[candidateTagId] || { action: 'delete', targetTagId: null };
                    if (action.action === 'reassign' && !action.targetTagId) {
                        throw new Error('אנא בחר תגית יעד לכל מועמד שמשנים');
                    }
                    return {
                        candidateTagId,
                        action: action.action,
                        targetTagId: action.targetTagId,
                    };
                })
                .filter(Boolean) as { candidateTagId: string; action: 'delete' | 'reassign'; targetTagId: string | null }[];

            const res = await fetch(`${apiBase}/api/admin/candidate-tags/bulk-update`, {
                method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actions }),
                    });
                    if (!res.ok) throw new Error(await res.text() || 'Request failed');

            setTags(prev => prev.filter(t => t.id !== pendingTagDelete.id));
            await deleteTagById(pendingTagDelete.id);
            setPendingTagDelete(null);
            closeBlockingModal();
        } catch (err: any) {
            setTags(prevTags);
            setBlockingError(err.message || 'Failed to update candidate associations');
        } finally {
            setIsResolvingBlocking(false);
        }
    };

    const updateTagSynonyms = async (tagId: string, synonyms: any[]) => {
        if (!apiBase || !tagId) return null;
        setIsSynSaving(true);
        try {
            const payload = { synonyms };
            const res = await fetch(`${apiBase}/api/tags/${tagId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Synonym update failed');
            const updated = await res.json();
            setTags(prev => prev.map(t => (t.id === tagId ? updated : t)));
            setAiSuggestions(prev => prev.map((item) => item.id === tagId ? { ...item, synonyms: updated.synonyms } : item));
            return updated.synonyms || [];
        } catch (err) {
            console.error('Failed to update synonyms', err);
            return null;
        } finally {
            setIsSynSaving(false);
        }
    };

    const handleSynonymDelete = async (sugg: any, syn: any, suggIdx: number, synIdx: number) => {
        const normalized = (sugg.synonyms || []).filter((_: any, idx: number) => idx !== synIdx);
        await updateTagSynonyms(sugg.id, normalized);
        setNewSynonyms(prev => {
            const next = { ...prev };
            delete next[suggIdx];
            return next;
        });
    };

    const handleSynonymAdd = async (sugg: any, suggIdx: number) => {
        const phrase = (newSynonyms[suggIdx] || '').trim();
        if (!phrase) return;
        const lang = newSynLangs[suggIdx] || 'he';
        const type = newSynTypes[suggIdx] || 'synonym';
        const nextArray = [...(sugg.synonyms || []), { phrase, language: lang, type }];
        await updateTagSynonyms(sugg.id, nextArray);
        setNewSynonyms(prev => ({ ...prev, [suggIdx]: '' }));
        setNewSynLangs(prev => ({ ...prev, [suggIdx]: lang }));
        setNewSynTypes(prev => ({ ...prev, [suggIdx]: type }));
    };

    const applyAiSuggestions = async () => {
        const selectedUpdates = aiSuggestions.filter(s => s._selected !== false);
        if (!selectedUpdates.length) {
            setIsSuggestModalOpen(false);
            return;
        }
        setIsSavingSuggestions(true);
        let firstError: string | null = null;
        const saved: Tag[] = [];
        for (const upd of selectedUpdates) {
            if (!upd.id) {
                firstError = firstError || 'חסרה מזהה תגית (id) באחת ההמלצות';
                continue;
            }
            // User requirement: status remains Draft, but Quality State changes to "Needs Review"
            const payload = { 
                ...upd,
                status: 'draft',
                qualityState: 'needs_review',
                descriptionHe: upd.descriptionHe || '',
                domains: upd.domains || [],
                source: 'ai',
            };
            delete payload.tagKey;
            delete (payload as any)._selected;
            try {
                const res = await fetch(`${apiBase}/api/tags/${upd.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error(await res.text());
                const updated = await res.json();
                saved.push(updated);
            } catch (err: any) {
                if (!firstError) firstError = err?.message || 'Save failed';
            }
        }
        if (saved.length) {
            setTags(prev => prev.map(t => {
                const upd = saved.find(u => u.id === t.id);
                return upd ? upd : t;
            }));
        }
        setIsSavingSuggestions(false);
        setSelectedTagIds(new Set<string>());
        setIsSuggestModalOpen(false);
        await loadTypeOptions();
        if (firstError) alert(firstError);
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
            setSelectedTagIds(new Set(tags.map(t => t.id)));
        } else {
            setSelectedTagIds(new Set<string>());
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
                            qualityState: 'initial_detection',
                            source: 'admin',
                            matchable: true,
                            synonyms: [],
                            domains: [],
                            usageCount: 0,
                            lastUsedAt: new Date().toISOString()
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

    const handleBulkDelete = async () => {
        if (selectedTagIds.size === 0) return;
        if (!window.confirm(`האם למחוק ${selectedTagIds.size} תגיות שנבחרו?`)) return;
        setIsBulkDeleting(true);
        const idsToDelete = Array.from(selectedTagIds) as string[];
        const preserved = [...tags];
        setTags(prev => prev.filter(t => !selectedTagIds.has(t.id)));
        setSelectedTagIds(new Set<string>());

        try {
            for (const id of idsToDelete) {
                try {
                    await deleteTagById(id);
                } catch (err: any) {
                    err.failingId = id;
                    throw err;
                }
            }
        } catch (err: any) {
            const message: string = err instanceof Error ? err.message : 'Delete failed';
            setTags(preserved);
            const payload = err?.payload;
            if (payload?.candidates && payload.candidates.length) {
                const failedTag = preserved.find(t => t.id === err?.failingId) || preserved[0];
                if (failedTag) {
                    openBlockingModal(failedTag, payload);
                }
                return;
            }
            setDeleteErrorMessage(message);
            setIsDeleteErrorModalOpen(true);
        } finally {
            setIsBulkDeleting(false);
        }
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
            const suggestions = (data.suggestions || []).map((s: any, idx: number) => ({
                ...s,
                id: s.id || selectedTagsList[idx]?.id,
                type: resolveSuggestedType(s),
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
            <div className="bg-bg-card rounded-2xl border border-border-default p-4 mb-6 space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="p-2 rounded-lg bg-white border border-border-default text-text-muted shadow-sm">
                            <Bars3Icon className="w-5 h-5" />
                        </span>
                <div>
                            <p className="text-xs uppercase tracking-wide text-text-muted">ניהול תגיות</p>
                    <h1 className="text-2xl font-extrabold text-text-default flex items-center gap-2">
                        <TagIcon className="w-8 h-8 text-primary-500" />
                                <span>ניהול תגיות</span>
                    </h1>
                </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${viewMode === 'table' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border-default bg-transparent text-text-muted'}`}
                        >
                            <TableCellsIcon className="w-4 h-4" />
                            טבלה
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${viewMode === 'grid' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border-default bg-transparent text-text-muted'}`}
                        >
                            <Squares2X2Icon className="w-4 h-4" />
                            רשת
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterVertical(prev => !prev)}
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${filterVertical ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border-default bg-transparent text-text-muted'}`}
                        >
                            <ListBulletIcon className="w-4 h-4" />
                            {filterVertical ? 'סינון אנכי' : 'סינון אופקי'}
                        </button>
                     <button 
                        onClick={handleOpenChat}
                            className="bg-white border border-border-default text-primary-700 font-bold py-2 px-4 rounded-xl hover:bg-primary-50 transition shadow-sm flex items-center gap-2"
                    >
                        <ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>
                            <span className="text-xs">התייעץ עם AI</span>
                    </button>
                        <button onClick={handleCreate} className="bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2">
                        <PlusIcon className="w-5 h-5"/>
                            <span className="text-xs">תגית חדשה</span>
                    </button>
                </div>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="relative flex-grow md:max-w-md w-full">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="חפש לפי שם, מפתח או קטגוריה..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition shadow-sm" 
                    />
                </div>
                    <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
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
            </div>

            <div className={`bg-bg-card rounded-2xl border border-border-default p-3 mb-6 ${filterLayoutClass}`}>
                <div className="relative" ref={typeDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setTypeDropdownOpen(prev => !prev)}
                        className="w-full text-xs text-left bg-bg-input border border-border-default rounded-xl py-2 px-3 flex items-center justify-between"
                    >
                        <span>{selectedTypes.length ? selectedTypes.length + ' סוגים' : 'סוג (הכל)'}</span>
                        <ChevronDownIcon className={'w-4 h-4 transition ' + (typeDropdownOpen ? 'rotate-180' : '')} />
                    </button>
                    {typeDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-border-default rounded-xl shadow-lg max-h-48 overflow-y-auto">
                            {typePicklistOptions.map(option => (
                                <label key={option.value} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-subtle cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedTypes.includes(option.value)}
                                        onChange={() => toggleTypeSelection(option.value)}
                                        className="w-3 h-3"
                                    />
                                    <span>{option.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="relative" ref={categoryDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setCategoryDropdownOpen(prev => !prev)}
                        className="w-full text-xs text-left bg-bg-input border border-border-default rounded-xl py-2 px-3 flex items-center justify-between"
                    >
                        <span>{selectedCategories.length ? selectedCategories.length + ' קטגוריות' : 'קטגוריה (הכל)'}</span>
                        <ChevronDownIcon className={'w-4 h-4 transition ' + (categoryDropdownOpen ? 'rotate-180' : '')} />
                    </button>
                    {categoryDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-border-default rounded-xl shadow-lg">
                            <input
                                type="text"
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                placeholder="חפש קטגוריה..."
                                className="w-full text-xs bg-bg-input border-b border-border-default px-3 py-2 focus:outline-none"
                            />
                            <div className="max-h-48 overflow-y-auto">
                                {filteredCategoryOptions.map(option => (
                                    <label key={option} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-subtle cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedCategories.includes(option)}
                                            onChange={() => toggleCategorySelection(option)}
                                            className="w-3 h-3"
                                        />
                                        <span>{option}</span>
                                    </label>
                                ))}
                                {!filteredCategoryOptions.length && (
                                    <div className="px-3 py-2 text-xs text-text-muted">לא נמצאו קטגוריות</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="relative" ref={statusDropdownRef}>
                    <button
                        type="button"
                        onClick={() => setStatusDropdownOpen(prev => !prev)}
                        className="w-full text-xs text-left bg-bg-input border border-border-default rounded-xl py-2 px-3 flex items-center justify-between"
                    >
                        <span>{selectedStatuses.length ? selectedStatuses.length + ' סטטוסים' : 'סטטוס (הכל)'}</span>
                        <ChevronDownIcon className={'w-4 h-4 transition ' + (statusDropdownOpen ? 'rotate-180' : '')} />
                    </button>
                    {statusDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-border-default rounded-xl shadow-lg">
                            {statusOptions.map(status => (
                                <label key={status} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-bg-subtle cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedStatuses.includes(status)}
                                        onChange={() => toggleStatusSelection(status)}
                                        className="w-3 h-3"
                                    />
                                    <span>{status}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 w-full">
                            <label className="text-[10px] text-text-muted uppercase tracking-wider">נוצר מה-</label>
                            <input type="date" value={createdFrom} onChange={e => setCreatedFrom(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-xl p-2 text-xs focus:border-primary-500 transition" />
                        </div>
                        
                    </div>
                    <div className="flex gap-2">
                        <div className="flex flex-col gap-1 w-full">
                            <label className="text-[10px] text-text-muted uppercase tracking-wider">עודכן מ-</label>
                            <input type="date" value={updatedFrom} onChange={e => setUpdatedFrom(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-xl p-2 text-xs focus:border-primary-500 transition" />
                        </div>
                        
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-text-muted uppercase tracking-wider">מקור</label>
                    <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as SourceFilterValue)} className="w-full bg-bg-input border border-border-default rounded-xl p-2 text-xs focus:border-primary-500 transition">
                        <option value="">מקור (הכל)</option>
                        <option value="ai">AI</option>
                        <option value="manual">ידני</option>
                        <option value="candidate">מועמד</option>
                        <option value="curator">רכז</option>
                </select>
                </div>
                <input type="text" value={synonymFilter} onChange={e => setSynonymFilter(e.target.value)} placeholder="מילה נרדפת" className="w-full bg-bg-input border border-border-default rounded-xl p-2 text-xs focus:border-primary-500 transition" />
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
                        <button
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className="flex items-center gap-2 bg-red-600 text-white font-bold py-1.5 px-4 rounded-lg shadow-sm border border-red-500 hover:bg-red-700 transition disabled:opacity-50"
                        >
                            {isBulkDeleting ? 'מוחק...' : 'מחק נבחרים'}
                        </button>
                    </div>
                    <button onClick={() => setSelectedTagIds(new Set<string>())} className="text-text-muted hover:text-primary-600 text-sm font-medium">ביטול בחירה</button>
                </div>
            )}

            {/* Table */}
            <div className="bg-bg-card border border-border-default rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
                <div className="px-3 py-3 border-b border-border-default bg-bg-subtle/10 text-xs text-text-muted flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        {totalRecords
                            ? `מראה ${totalRecords ? startIndex + 1 : 0}–${totalRecords ? endIndex : 0} מתוך ${totalRecords} תגיות`
                            : 'לא נמצאו תגיות להצגה'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <label className="flex items-center gap-1 whitespace-nowrap">
                            <span>דפים</span>
                            <select
                                value={pageSize}
                                onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                                className="bg-white border border-border-default rounded px-2 py-1 text-xs"
                            >
                                {pageSizeOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                            className="px-3 py-1 rounded-full border border-border-default text-xs text-text-muted bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            קודם
                        </button>
                        <span className="text-xs text-text-default">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                            className="px-3 py-1 rounded-full border border-border-default text-xs text-text-muted bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            הבא
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-right text-sm table-fixed">
                        <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-10 border-b border-border-default">
                            <tr>
                                <th className="p-4 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        onChange={handleSelectAll} 
                                        checked={tags.length > 0 && selectedTagIds.size === tags.length}
                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                    />
                                </th>
                                {columnOrder.map(key => (
                                    <th
                                        key={key}
                                        className="p-4 cursor-pointer select-none"
                                        draggable
                                        onDragStart={(e) => handleColumnDragStart(e, key)}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDragEnd={handleColumnDragEnd}
                                        onDrop={(e) => handleColumnDrop(e, key)}
                                        onClick={() => toggleSort(key)}
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span>{columnMeta[key].label}</span>
                                            {renderSortIndicator(key)}
                                        </div>
                                    </th>
                                ))}
                                <th className="p-4 w-[8%]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {tags.map(tag => (
                                <tr key={tag.id} className={`hover:bg-bg-hover transition-colors group cursor-pointer ${selectedTagIds.has(tag.id) ? 'bg-primary-50/50' : ''}`} onClick={() => handleEdit(tag)}>
                                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedTagIds.has(tag.id)}
                                            onChange={() => handleToggleSelect(tag.id)}
                                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                        />
                                    </td>
                                    {columnOrder.map(key => (
                                        <React.Fragment key={`${tag.id}-${key}`}>
                                            {renderColumnCell(tag, key)}
                                        </React.Fragment>
                                    ))}
                                    <td className="p-4 text-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 justify-center">
                                            <button onClick={(e) => {e.stopPropagation(); handleEdit(tag);}} className="p-1.5 hover:bg-primary-50 text-primary-600 rounded-lg"><PencilIcon className="w-4 h-4"/></button>
                                            <button onClick={(e) => {e.stopPropagation(); handleDelete(tag);}} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-3 py-3 border-t border-border-default bg-bg-subtle/10 text-xs text-text-muted flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        {totalRecords
                            ? `מראה ${totalRecords ? startIndex + 1 : 0}–${totalRecords ? endIndex : 0} מתוך ${totalRecords} תגיות`
                            : 'לא נמצאו תגיות להצגה'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <label className="flex items-center gap-1 whitespace-nowrap">
                            <span>דפים</span>
                            <select
                                value={pageSize}
                                onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                                className="bg-white border border-border-default rounded px-2 py-1 text-xs"
                            >
                                {pageSizeOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                            className="px-3 py-1 rounded-full border border-border-default text-xs text-text-muted bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            קודם
                        </button>
                        <span className="text-xs text-text-default">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                            className="px-3 py-1 rounded-full border border-border-default text-xs text-text-muted bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            הבא
                        </button>
                    </div>
                </div>
            </div>

            <TagEditorModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                tag={editingTag}
                onSave={handleSave}
                allTags={tags}
                tagNameOptions={tagNameOptions}
                typePicklistOptions={typePicklistOptions}
            />

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                tagsText={tags.map(t => `${t.displayNameHe} (${t.category})`).join(', ')}
            />

            {/* Blocking candidates modal */}
            {isBlockingModalOpen && pendingTagDelete && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-border-default w-full max-w-2xl max-h-[80vh] overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle/40">
                            <div>
                                <h3 className="text-lg font-bold text-text-default">התגית נעולה</h3>
                                <p className="text-sm text-text-muted">מועמדים שמחזיקים את התגית "{pendingTagDelete.displayNameHe}" עדיין קושרים אותה.</p>
                            </div>
                            <button
                                onClick={() => !isResolvingBlocking && closeBlockingModal()}
                                disabled={isResolvingBlocking}
                                className={`p-2 rounded-full hover:bg-bg-hover text-text-muted transition ${isResolvingBlocking ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold">מה עושים עם המועמדים?</div>
                                <p className="text-xs text-text-muted">בחרו לכל מועמד אם להסיר את התגית או להעביר אותו לתגית אחרת, ואז לחצו שמירה.</p>
                            </div>
                        <div className="bg-bg-card border border-border-default rounded-xl px-4 py-3 space-y-2 text-xs">
                            <div className="font-semibold text-text-default">החל על כולם</div>
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-text-muted uppercase tracking-wider">פעולה</label>
                                    <select
                                        value={bulkActionType}
                                        onChange={(e) => setBulkActionType(e.target.value as 'delete' | 'reassign')}
                                        className="bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm"
                                    >
                                        <option value="delete">הסר את התגית</option>
                                        <option value="reassign">העבר תגית</option>
                                    </select>
                                </div>
                                {bulkActionType === 'reassign' && (
                                    <div className="flex flex-col gap-2 min-w-[180px]">
                                        <label className="text-[10px] text-text-muted uppercase tracking-wider">תגית יעד</label>
                                        <div className="relative" ref={bulkDropdownRef}>
                                            <button
                                                type="button"
                                                onClick={() => setBulkDropdownOpen(prev => !prev)}
                                                className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm flex items-center justify-between"
                                            >
                                                <span>
                                                    {bulkTargetTagId
                                                        ? getTagDisplayName(tags.find(t => t.id === bulkTargetTagId) || null)
                                                        : 'בחר תגית יעד'}
                                                </span>
                                                <ChevronDownIcon className={`w-4 h-4 transition ${bulkDropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            {bulkDropdownOpen && (
                                                <div className="absolute z-30 mt-1 w-full bg-white border border-border-default rounded-xl shadow-lg">
                                                    <div className="px-3 pt-3">
                                                        <input
                                                            type="text"
                                                            value={bulkTagSearch}
                                                            onChange={(e) => setBulkTagSearch(e.target.value)}
                                                            placeholder="חפש תגית יעד"
                                                            className="w-full bg-bg-input border border-border-default rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary-500 transition"
                                                        />
                                                    </div>
                                                    <div className="max-h-48 overflow-y-auto">
                                                        {filteredReassignOptions.map(tag => (
                                                            <button
                                                                key={tag.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setBulkTargetTagId(tag.id);
                                                                    setBulkDropdownOpen(false);
                                                                }}
                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-bg-subtle"
                                                            >
                                                                {getTagDisplayName(tag)}
                                                            </button>
                                                        ))}
                                                        {!filteredReassignOptions.length && (
                                                            <div className="px-3 py-2 text-xs text-text-muted">לא נמצאו תגיות</div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={applyBulkAction}
                                    className="px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 transition"
                                >
                                    החל על כולם
                                </button>
                            </div>
                            </div>
                            <div>
                                <input
                                    type="text"
                                    value={blockingSearch}
                                    onChange={(e) => setBlockingSearch(e.target.value)}
                                    placeholder="חפש מועמד..."
                                    className="w-full bg-white border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                />
                            </div>
                            <div className="bg-bg-card rounded-xl border border-border-default overflow-hidden">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-bg-subtle text-text-muted text-xs uppercase">
                                        <tr>
                                            <th className="p-3">שם מועמד</th>
                                            <th className="p-3 w-[220px]">פעולה</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {filteredBlockingCandidates.map(candidate => {
                                            const candidateTagId = candidate.candidate_tag_id || candidate.candidateTagId;
                                            const actionEntry = candidateTagId ? candidateActions[candidateTagId] : undefined;
                                            const selectedAction = actionEntry?.action || 'delete';
                                            return (
                                                <tr key={candidateTagId || Math.random()}>
                                                    <td className="p-3 font-medium">{getCandidateDisplayName(candidate)}</td>
                                                    <td className="p-3 text-xs text-text-muted">
                                                        <div className="space-y-2">
                                                            <select
                                                                value={selectedAction}
                                                                onChange={(e) => candidateTagId && updateCandidateAction(candidateTagId, { action: e.target.value as 'delete' | 'reassign' })}
                                                                className="w-full bg-bg-input border border-border-default rounded-xl py-1.5 px-3 text-sm"
                                                            >
                                                                <option value="delete">הסר את התגית</option>
                                                                <option value="reassign">העבר תגית</option>
                                                            </select>
                                                            {selectedAction === 'reassign' && candidateTagId && (
                                                                <div className="relative" ref={inlineDropdownOpenFor === candidateTagId ? inlineDropdownRef : null}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setInlineDropdownOpenFor(prev => (prev === candidateTagId ? null : candidateTagId))}
                                                                        className="w-full bg-bg-input border border-border-default rounded-xl py-1.5 px-3 text-xs text-left flex items-center justify-between"
                                                                    >
                                                                        <span>
                                                                            {actionEntry?.targetTagId
                                                                                ? getTagDisplayName(tags.find(t => t.id === actionEntry.targetTagId) || null)
                                                                                : 'בחר תגית יעד'}
                                                                        </span>
                                                                        <ChevronDownIcon className={`w-4 h-4 transition ${inlineDropdownOpenFor === candidateTagId ? 'rotate-180' : ''}`} />
                                                                    </button>
                                                                    {inlineDropdownOpenFor === candidateTagId && (
                                                                        <div className="mt-2 bg-white border border-border-default rounded-xl shadow-lg">
                                                                            <div className="px-3 pt-3">
                                                                                <input
                                                                                    type="text"
                                                                                    value={inlineTagSearch}
                                                                                    onChange={(e) => setInlineTagSearch(e.target.value)}
                                                                                    placeholder="חפש תגית יעד"
                                                                                    className="w-full bg-bg-input border border-border-default rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary-500 transition"
                                                                                />
                                                                            </div>
                                                                            <div className="max-h-48 overflow-y-auto">
                                                                                {filteredInlineOptions.map(tag => (
                                                                                    <button
                                                                                        key={tag.id}
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            updateCandidateAction(candidateTagId, { targetTagId: tag.id });
                                                                                            setInlineDropdownOpenFor(null);
                                                                                        }}
                                                                                        className="w-full text-left px-3 py-2 text-xs hover:bg-bg-subtle"
                                                                                    >
                                                                                        {getTagDisplayName(tag)}
                                                                                    </button>
                                                                                ))}
                                                                                {!filteredInlineOptions.length && (
                                                                                    <div className="px-3 py-2 text-xs text-text-muted">לא נמצאו תגיות</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {(filteredBlockingCandidates.length === 0) && (
                                            <tr>
                                                <td colSpan={2} className="p-4 text-center text-text-muted">
                                                    {blockingCandidates.length === 0
                                                        ? 'אין מועמדים רשומים'
                                                        : 'לא נמצאו מועמדים שתואמים לחיפוש'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {blockingError && (
                                <div className="text-xs text-red-600">{blockingError}</div>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-default bg-bg-card">
                            <button onClick={closeBlockingModal} disabled={isResolvingBlocking} className="px-4 py-2 rounded-xl text-sm font-bold text-text-muted bg-bg-subtle hover:bg-bg-hover transition disabled:opacity-50">
                                ביטול
                            </button>
                            <button
                                onClick={resolveBlockingCandidates}
                                disabled={isResolvingBlocking || hasReassignWithoutTarget}
                                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition disabled:opacity-50"
                            >
                                {isResolvingBlocking ? 'שומר...' : 'שמור שינויים ועבור למחיקה'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isDeleteErrorModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[140] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-border-default w-full max-w-lg overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle/40">
                            <h3 className="text-lg font-bold text-text-default">שגיאת מחיקה</h3>
                            <button
                                onClick={closeDeleteErrorModal}
                                className="p-2 rounded-full hover:bg-bg-hover text-text-muted"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-text-muted">
                                {deleteErrorMessage || 'לא הצלחנו למחוק את התגית.'}
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-default bg-bg-card">
                            <button
                                onClick={closeDeleteErrorModal}
                                className="px-4 py-2 rounded-xl text-sm font-bold text-text-muted bg-bg-subtle hover:bg-bg-hover transition"
                            >
                                הבנתי
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                            {typePicklistOptions.length ? (
                                                <select value={sugg.type} onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, type: e.target.value as TagType } : item))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                    {typePicklistOptions.map(option => (
                                                        <option key={`suggest-${option.value}`} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
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
                                            )}
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
                                                <option value="initial_detection">initial_detection</option>
                                                <option value="verified">verified</option>
                                                <option value="needs_review">needs_review</option>
                                                <option value="experimental">experimental</option>
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-text-subtle mb-1">תיאור פנימי (Hebrew Description)</label>
                                            <textarea 
                                                value={sugg.descriptionHe || ''} 
                                                onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, descriptionHe: e.target.value } : item))} 
                                                className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm h-16 resize-none"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs text-text-subtle mb-1">דומיינים (Comma separated)</label>
                                            <input 
                                                value={Array.isArray(sugg.domains) ? sugg.domains.join(', ') : sugg.domains || ''} 
                                                onChange={(e) => setAiSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, domains: e.target.value.split(',').map(d => d.trim()).filter(Boolean) } : item))} 
                                                className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                            />
                                        </div>
                                    </div>
                                        <div>
                                            <label className="block text-xs text-text-subtle mb-1">מילים נרדפות</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                                                {sugg.synonyms?.map((syn: any, si: number) => (
                                                    <span key={syn.id || si} className="flex items-center gap-1 bg-white border border-border-default px-2 py-1 rounded text-xs shadow-sm">
                                                        {typeof syn === 'string' ? syn : syn.phrase}
                                <button onClick={() => handleSynonymDelete(sugg, syn, idx, si)} className="text-text-muted hover:text-red-500">
                                                            <XMarkIcon className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                        <div className="flex flex-col md:flex-row gap-2">
                            <input
                                placeholder="הוסף ביטוי"
                                className="flex-1 bg-bg-input border border-border-default rounded-lg p-2 text-xs"
                                value={newSynonyms[idx] || ''}
                                onChange={(e) => setNewSynonyms(prev => ({ ...prev, [idx]: e.target.value }))}
                            />
                            <select
                                className="bg-bg-input border border-border-default rounded-lg p-2 text-xs"
                                value={newSynLangs[idx] || 'he'}
                                onChange={(e) => setNewSynLangs(prev => ({ ...prev, [idx]: e.target.value as 'he'|'en' }))}
                            >
                                <option value="he">HE</option>
                                <option value="en">EN</option>
                            </select>
                            <select
                                className="bg-bg-input border border-border-default rounded-lg p-2 text-xs"
                                value={newSynTypes[idx] || 'synonym'}
                                onChange={(e) => setNewSynTypes(prev => ({ ...prev, [idx]: e.target.value as 'synonym' | 'alias' | 'abbreviation' }))}
                            >
                                <option value="synonym">synonym</option>
                                <option value="alias">alias</option>
                                <option value="abbreviation">abbreviation</option>
                            </select>
                            <button
                                onClick={() => handleSynonymAdd(sugg, idx)}
                                className="px-3 py-2 rounded-md bg-primary-600 text-white text-xs font-semibold"
                                disabled={isSynSaving || !(newSynonyms[idx] || '').trim()}
                            >
                                {isSynSaving ? 'שומר...' : 'הוסף'}
                            </button>
                        </div>
                                        </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-2">
                            <button onClick={() => setIsSuggestModalOpen(false)} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                            <button 
                                onClick={applyAiSuggestions}
                                className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition"
                                disabled={isSavingSuggestions}
                            >
                                {isSavingSuggestions ? 'שומר...' : 'החל נבחרים'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {duplicateAlert && (
                <div className="fixed bottom-6 left-1/2 z-[150] -translate-x-1/2 flex max-w-md w-full flex-col gap-1 rounded-2xl border border-primary-200 bg-white/90 px-4 py-3 shadow-xl backdrop-blur-sm">
                    <span className="text-sm font-bold text-text-default">{duplicateAlert.message}</span>
                    {duplicateAlert.displayNameHe && (
                        <span className="text-sm text-primary-600 font-semibold">{duplicateAlert.displayNameHe}</span>
                    )}
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setDuplicateAlert(null)}
                            className="text-xs text-primary-500 hover:text-primary-700 underline-offset-2 hover:underline focus:outline-none"
                        >
                            סגור
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTagsView;
