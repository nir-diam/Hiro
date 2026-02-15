
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
    BoltIcon, PlusIcon, PencilIcon, TrashIcon, 
    CheckCircleIcon, XMarkIcon, PlayIcon, 
    MagnifyingGlassIcon, ListBulletIcon,
    ClockIcon, CodeBracketIcon, FunnelIcon, ArrowRightIcon,
    ChevronDownIcon, NoSymbolIcon, UserIcon, BriefcaseIcon, BuildingOffice2Icon,
    Squares2X2Icon, TagIcon, GlobeAmericasIcon, ClipboardDocumentCheckIcon
} from './Icons';

// --- TYPES ---
type DevStatus = 'pending' | 'in_progress' | 'testing' | 'deployed';

interface LogicRule {
    id: number;
    ruleId: string;
    name: string;
    description: string;
    context: string;
    trigger: string;
    conditions: string[];
    actions: string[];
    devStatus: DevStatus;
}

const statusConfig: Record<DevStatus, { label: string; dot: string; text: string; bg: string }> = {
    pending: { label: 'ממתין לפיתוח', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' },
    in_progress: { label: 'בפיתוח', dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
    testing: { label: 'בבדיקות', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
    deployed: { label: 'עלה לאוויר', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};

const entityTypes = [
    { id: 'all', label: 'כל היישויות', icon: <Squares2X2Icon className="w-4 h-4"/> },
    { id: 'Candidate', label: 'מועמדים', icon: <UserIcon className="w-4 h-4"/> },
    { id: 'Job', label: 'משרות', icon: <BriefcaseIcon className="w-4 h-4"/> },
    { id: 'Client', label: 'לקוחות', icon: <BuildingOffice2Icon className="w-4 h-4"/> },
    { id: 'Tag', label: 'תגיות', icon: <TagIcon className="w-4 h-4"/> },
    { id: 'Company', label: 'חברות', icon: <GlobeAmericasIcon className="w-4 h-4"/> },
    { id: 'Task', label: 'משימות', icon: <ClipboardDocumentCheckIcon className="w-4 h-4"/> },
];

const triggerOptions = ['all', 'On Change', 'On Save', 'On Delete', 'Daily Schedule', 'On Create'];

// --- MOCK DATA ---
const initialRules: LogicRule[] = [
    {
        id: 1,
        ruleId: 'RULE-101',
        name: 'שליחת מייל דחייה אוטומטי',
        description: 'כאשר מעבירים מועמד לסטטוס "נדחה" לאחר ראיון טלפוני, יש לשלוח טמפלייט דחייה ולהוסיף תיעוד.',
        context: 'Candidate (מועמד)',
        trigger: 'On Change',
        conditions: ['Old Status = Phone Screen', 'New Status = Rejected'],
        actions: ['"Send Email Template: "Rejection', 'Create Log Entry'],
        devStatus: 'deployed'
    },
    {
        id: 2,
        ruleId: 'RULE-102',
        name: 'ולידציה של תעודת זהות',
        description: 'בדיקת תקינות ספרת ביקורת בעת שמירת פרטי מועמד.',
        context: 'Candidate (מועמד)',
        trigger: 'On Save',
        conditions: ['id_number.length > 0'],
        actions: ['()validate_id_checksum', '()prevent_save_on_error'],
        devStatus: 'deployed'
    },
    {
        id: 3,
        ruleId: 'RULE-103',
        name: 'שיוך אוטומטי של תגית חברה',
        description: 'כאשר מזוהה שם חברה מהרשימה המאושרת, יש להוסיף תגית "Target Company" למועמד.',
        context: 'Tag (תגית)',
        trigger: 'On Create',
        conditions: ['Company Name In TargetList'],
        actions: ['AddTag("Target Company")'],
        devStatus: 'in_progress'
    },
    {
        id: 4,
        ruleId: 'RULE-104',
        name: 'תזכורת למשימה שפג תוקפה',
        description: 'משימות בסטטוס פתוח שעברו 48 שעות מהדד-ליין יצבעו באדום ותשלח התראה.',
        context: 'Task (משימה)',
        trigger: 'Daily Schedule',
        conditions: ['Status = Pending', 'HoursPastDue > 48'],
        actions: ['SetColor("Red")', 'SendNotification("Manager")'],
        devStatus: 'testing'
    }
];

const AdminBusinessLogicView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const [rules, setRules] = useState<LogicRule[]>(initialRules);
    const [isRulesLoading, setIsRulesLoading] = useState(false);
    const [rulesError, setRulesError] = useState<string | null>(null);
    const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);
    const [isSavingRule, setIsSavingRule] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedContext, setSelectedContext] = useState('all');
    const [selectedTrigger, setSelectedTrigger] = useState('all');
    const [selectedDevStatus, setSelectedDevStatus] = useState<string>('all');
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<LogicRule | null>(null);
    const [modalData, setModalData] = useState<Partial<LogicRule>>({});

    const handleCreate = () => {
        setEditingRule(null);
        setModalData({
            ruleId: `RULE-${Math.floor(Math.random() * 900) + 100}`,
            name: '',
            description: '',
            context: 'Candidate',
            trigger: 'On Change',
            devStatus: 'pending',
            conditions: [''],
            actions: ['']
        });
        setIsModalOpen(true);
        setModalError(null);
    };

    const handleEdit = (rule: LogicRule) => {
        setModalError(null);
        setEditingRule(rule);
        setModalData({ ...rule });
        setIsModalOpen(true);
    };

    const handleUpdateLogicArray = (type: 'conditions' | 'actions', index: number, value: string) => {
        const arr = [...(modalData[type] || [])];
        arr[index] = value;
        setModalData({ ...modalData, [type]: arr });
    };

    const handleAddLogicItem = (type: 'conditions' | 'actions') => {
        setModalData({ ...modalData, [type]: [...(modalData[type] || []), ''] });
    };

    const handleRemoveLogicItem = (type: 'conditions' | 'actions', index: number) => {
        const arr = [...(modalData[type] || [])];
        arr.splice(index, 1);
        setModalData({ ...modalData, [type]: arr });
    };

    const fetchRules = useCallback(async () => {
        if (!apiBase) {
            setRules(initialRules);
            return;
        }
        setIsRulesLoading(true);
        setRulesError(null);
        try {
            const res = await fetch(`${apiBase}/api/admin/business-logic`, {
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
            });
            if (!res.ok) throw new Error('שגיאה בטעינת החוקים');
            const data = await res.json();
            setRules(Array.isArray(data) ? data : initialRules);
        } catch (err: any) {
            console.error('Failed to load business logic rules', err);
            setRulesError(err.message || 'שגיאה בטעינת החוקים');
        } finally {
            setIsRulesLoading(false);
        }
    }, [apiBase]);

    const handleDeleteRule = useCallback(async (id: number) => {
        if (!window.confirm('אתה בטוח שברצונך למחוק את החוק הזה?')) return;
        if (!apiBase) {
            setRules(prev => prev.filter(rule => rule.id !== id));
            return;
        }
        setDeletingRuleId(id);
        try {
            const res = await fetch(`${apiBase}/api/admin/business-logic/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.message || 'מחיקה נכשלה');
            }
            setRules(prev => prev.filter(rule => rule.id !== id));
        } catch (err: any) {
            console.error('Failed to delete rule', err);
            setRulesError(err.message || 'מחיקה נכשלה');
        } finally {
            setDeletingRuleId(null);
        }
    }, [apiBase]);

    useEffect(() => {
        void fetchRules();
    }, [fetchRules]);

    const handleSave = () => {
        if (!modalData.name) {
            setModalError('יש להזין שם חוק');
            return;
        }
        const finalRule = { ...modalData, id: editingRule?.id } as LogicRule;
        if (!apiBase) {
            const ruleToSave = { ...finalRule, id: editingRule?.id || Date.now() };
            if (editingRule) {
                setRules(prev => prev.map(r => r.id === editingRule.id ? ruleToSave : r));
            } else {
                setRules(prev => [ruleToSave, ...prev]);
            }
            setIsModalOpen(false);
            setEditingRule(null);
            setModalError(null);
            return;
        }
        const method = editingRule ? 'PUT' : 'POST';
        const url = editingRule ? `${apiBase}/api/admin/business-logic/${editingRule.id}` : `${apiBase}/api/admin/business-logic`;
        setIsSavingRule(true);
        setModalError(null);
        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({
                ...finalRule,
                conditions: finalRule.conditions || [],
                actions: finalRule.actions || [],
            }),
        })
            .then(async res => {
                if (!res.ok) {
                    const errBody = await res.json().catch(() => null);
                    throw new Error(errBody?.message || 'שמירה נכשלה');
                }
                return res.json();
            })
            .then(saved => {
                setRules(prev => editingRule ? prev.map(r => r.id === saved.id ? saved : r) : [saved, ...prev]);
                setIsModalOpen(false);
                setEditingRule(null);
            })
            .catch(err => {
                console.error('Failed to save business rule', err);
                setModalError(err.message || 'שמירה נכשלה');
            })
            .finally(() => {
                setIsSavingRule(false);
            });
    };

    const filteredRules = useMemo(() => {
        return rules.filter(rule => {
            const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  rule.ruleId.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesContext = selectedContext === 'all' || rule.context.includes(selectedContext);
            const matchesTrigger = selectedTrigger === 'all' || rule.trigger === selectedTrigger;
            const matchesStatus = selectedDevStatus === 'all' || rule.devStatus === selectedDevStatus;

            return matchesSearch && matchesContext && matchesTrigger && matchesStatus;
        });
    }, [rules, searchTerm, selectedContext, selectedTrigger, selectedDevStatus]);

    return (
        <div className="flex flex-col h-full bg-bg-default max-w-6xl mx-auto p-4 md:p-8 space-y-6 animate-fade-in">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border-default pb-8">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black text-text-default tracking-tight flex items-center gap-3">
                        <CodeBracketIcon className="w-8 h-8 text-primary-600" />
                        מרשם חוקים עסקיים (Logic Registry)
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">
                        מערכת זו משמשת כ"מקור האמת" לכל הלוגיקה העסקית במערכת.
                    </p>
                </div>
                <button 
                    onClick={handleCreate}
                    className="bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 flex items-center gap-2 text-sm"
                >
                    <PlusIcon className="w-4 h-4"/>
                    הוסף חוק למרשם
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-4">
                {/* Entities Tabs */}
                <div className="flex items-center bg-bg-subtle p-1.5 rounded-2xl border border-border-default overflow-x-auto no-scrollbar">
                    {entityTypes.map(type => (
                        <button
                            key={type.id}
                            onClick={() => setSelectedContext(type.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                selectedContext === type.id 
                                ? 'bg-white text-primary-700 shadow-sm border border-border-subtle' 
                                : 'text-text-muted hover:text-text-default'
                            }`}
                        >
                            {type.icon}
                            {type.label}
                        </button>
                    ))}
                </div>

                {/* Parametric Filters Row */}
                <div className="flex flex-col lg:flex-row gap-3">
                    <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input 
                            type="text" 
                            placeholder="חפש לפי שם חוק או מזהה..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-border-default rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none font-medium shadow-sm transition-all"
                        />
                    </div>

                    {/* Trigger Filter */}
                    <div className="relative min-w-[180px]">
                        <select 
                            value={selectedTrigger}
                            onChange={(e) => setSelectedTrigger(e.target.value)}
                            className="w-full bg-white border border-border-default rounded-xl py-3 pl-8 pr-4 text-sm font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500/20 transition-all shadow-sm"
                        >
                            <option value="all">כל הטריגרים</option>
                            {triggerOptions.slice(1).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {/* Dev Status Filter */}
                    <div className="relative min-w-[180px]">
                        <select 
                            value={selectedDevStatus}
                            onChange={(e) => setSelectedDevStatus(e.target.value)}
                            className="w-full bg-white border border-border-default rounded-xl py-3 pl-8 pr-4 text-sm font-bold appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500/20 transition-all shadow-sm"
                        >
                            <option value="all">כל סטטוסי הפיתוח</option>
                            {Object.entries(statusConfig).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                        <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Registry List */}
            <div className="space-y-4 pb-20">
                {rulesError && (
                    <div className="text-sm text-red-500 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                        {rulesError}
                    </div>
                )}

                {isRulesLoading ? (
                    <div className="text-center text-text-muted py-6">טוען חוקים...</div>
                ) : filteredRules.length ? (
                    filteredRules.map(rule => {
                        const status = statusConfig[rule.devStatus];
                        return (
                            <div 
                                key={rule.id}
                                onClick={() => handleEdit(rule)}
                                className="bg-white rounded-2xl border border-border-default hover:border-primary-300 hover:shadow-xl transition-all duration-300 overflow-hidden group cursor-pointer relative"
                            >
                                <div className="flex flex-col lg:flex-row items-stretch">
                                    <div className="p-6 flex-1 border-l border-border-subtle">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-tighter border border-slate-200">
                                                    {rule.ruleId}
                                                </span>
                                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${status.bg} ${status.text} text-[10px] font-black uppercase tracking-widest border border-current/10`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></div>
                                                    {status.label}
                                                </div>
                                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRule(rule.id);
                                }}
                                className="text-red-500 hover:text-red-700 transition p-2 rounded-full"
                                title="מחק חוק זה"
                                disabled={deletingRuleId === rule.id}
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                                        </div>
                                        <h3 className="text-lg font-bold text-text-default mb-1 group-hover:text-primary-700 transition-colors">{rule.name}</h3>
                                        <p className="text-text-muted text-sm leading-relaxed mb-6 line-clamp-2">{rule.description}</p>
                                        
                                        <div className="flex flex-wrap gap-4 text-[10px] font-black text-text-subtle uppercase tracking-widest">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-text-default">ENTITY:</span> {rule.context}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-text-default">TRIGGER:</span> {rule.trigger}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="lg:w-[350px] bg-bg-subtle/30 p-6 flex flex-col justify-center gap-4 border-t lg:border-t-0 lg:border-r border-border-subtle">
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded w-fit border border-primary-200">IF</span>
                                            {rule.conditions.map((c, i) => (
                                                <div key={i} className="font-mono text-[11px] text-text-default flex items-center gap-1.5">
                                                    <span className="text-border-default">└</span>
                                                    <span className="truncate bg-white/50 px-1.5 py-0.5 rounded border border-border-subtle/50">{c}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded w-fit border border-emerald-200">THEN</span>
                                        {rule.actions.map((a, i) => (
                                            <div key={i} className="font-mono text-[11px] text-text-default flex items-center gap-1.5">
                                                <span className="text-border-default">└</span>
                                                <span className="truncate bg-white/50 px-1.5 py-0.5 rounded border border-border-subtle/50">{a}</span>
                                            </div>
                                        ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-border-default shadow-sm">
                        <NoSymbolIcon className="w-16 h-16 text-text-subtle mx-auto mb-4 opacity-20" />
                        <h3 className="text-xl font-bold text-text-default">לא נמצאו חוקים שתואמים לסינון</h3>
                        <p className="text-text-muted text-sm mt-2">נסה לשנות את הפרמטרים או את מילות החיפוש.</p>
                    </div>
                )}
            </div>
            
            {/* EDITOR MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-bg-card w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in border border-border-default" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <header className="p-5 border-b border-border-default flex justify-between items-start bg-white">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary-100 text-primary-600 rounded-xl">
                                    <BoltIcon className="w-6 h-6"/>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-text-default">עריכת חוק עסקי</h2>
                                    <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block border border-slate-200">
                                        ID: {modalData.ruleId}
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full hover:bg-bg-subtle transition-colors">
                                <XMarkIcon className="w-6 h-6 text-text-muted" />
                            </button>
                        </header>

                        {/* Modal Body */}
                        {modalError && (
                            <div className="px-5 text-xs text-red-600">
                                {modalError}
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-bg-subtle/5">
                            <div className="space-y-2 text-right">
                                <label className="block text-xs font-black text-text-muted uppercase tracking-wider">שם החוק</label>
                                <input 
                                    type="text" 
                                    value={modalData.name} 
                                    onChange={(e) => setModalData({...modalData, name: e.target.value})}
                                    className="w-full bg-white border border-border-default rounded-xl p-3 text-lg font-bold focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
                                    placeholder="לדוגמה: שליחת מייל דחייה אוטומטי"
                                />
                            </div>

                            <div className="space-y-2 text-right">
                                <label className="block text-xs font-black text-text-muted uppercase tracking-wider">תיאור טכני</label>
                                <textarea 
                                    value={modalData.description} 
                                    onChange={(e) => setModalData({...modalData, description: e.target.value})}
                                    rows={3}
                                    className="w-full bg-white border border-border-default rounded-xl p-4 text-sm leading-relaxed focus:ring-2 focus:ring-primary-500/20 outline-none transition-all resize-none"
                                    placeholder="תאר את הלוגיקה ומה המטרה שלה..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-border-default shadow-sm">
                                <div className="text-right">
                                    <label className="block text-[10px] font-black text-text-muted uppercase mb-2">הקשר (ENTITY)</label>
                                    <div className="relative">
                                        <select 
                                            value={modalData.context}
                                            onChange={(e) => setModalData({...modalData, context: e.target.value})}
                                            className="w-full bg-bg-subtle border border-border-default rounded-xl p-2.5 text-sm font-bold appearance-none text-right pr-4"
                                        >
                                            {entityTypes.slice(1).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                        <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="text-right">
                                    <label className="block text-[10px] font-black text-text-muted uppercase mb-2">טריגר (TRIGGER)</label>
                                    <div className="relative">
                                        <select 
                                            value={modalData.trigger}
                                            onChange={(e) => setModalData({...modalData, trigger: e.target.value})}
                                            className="w-full bg-bg-subtle border border-border-default rounded-xl p-2.5 text-sm font-bold appearance-none text-right pr-4"
                                        >
                                            {triggerOptions.slice(1).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                        <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                                <div className="text-right">
                                    <label className="block text-[10px] font-black text-text-muted uppercase mb-2">סטטוס פיתוח</label>
                                    <div className="relative">
                                        <select 
                                            value={modalData.devStatus}
                                            onChange={(e) => setModalData({...modalData, devStatus: e.target.value as any})}
                                            className="w-full bg-bg-subtle border border-border-default rounded-xl p-2.5 text-sm font-bold appearance-none text-right pr-4"
                                        >
                                            {Object.entries(statusConfig).map(([key, val]) => (
                                                <option key={key} value={key}>{val.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <h4 className="text-sm font-black text-primary-700 flex items-center gap-1.5 uppercase">
                                        <FunnelIcon className="w-4 h-4" />
                                        תנאים (IF)
                                    </h4>
                                    <div className="space-y-2">
                                        {modalData.conditions?.map((condition, idx) => (
                                            <div key={idx} className="flex items-center gap-2 group animate-fade-in">
                                                <span className="text-border-default font-mono text-xl">└</span>
                                                <div className="flex-1 flex items-center bg-white rounded-xl border border-border-default p-1 shadow-sm focus-within:border-primary-400 transition-all">
                                                    <input 
                                                        value={condition} 
                                                        onChange={(e) => handleUpdateLogicArray('conditions', idx, e.target.value)}
                                                        className="w-full bg-transparent p-1.5 text-xs font-mono font-bold text-primary-900 outline-none text-right"
                                                        placeholder="הזן תנאי..."
                                                    />
                                                    <button onClick={() => handleRemoveLogicItem('conditions', idx)} className="p-1 text-text-subtle hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <button 
                                            onClick={() => handleAddLogicItem('conditions')}
                                            className="flex items-center gap-1.5 text-[11px] font-bold text-primary-600 bg-white px-3 py-1.5 rounded-lg hover:bg-primary-50 border border-primary-200 transition-all mr-6 shadow-sm"
                                        >
                                            <PlusIcon className="w-3 h-3" />
                                            הוסף תנאי
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-sm font-black text-emerald-700 flex items-center gap-1.5 uppercase">
                                        <PlayIcon className="w-4 h-4" />
                                        פעולות (THEN)
                                    </h4>
                                    <div className="space-y-2">
                                        {modalData.actions?.map((action, idx) => (
                                            <div key={idx} className="flex items-center gap-2 group animate-fade-in">
                                                <span className="text-border-default font-mono text-xl">└</span>
                                                <div className="flex-1 flex items-center bg-white rounded-xl border border-border-default p-1 shadow-sm focus-within:border-emerald-400 transition-all">
                                                    <input 
                                                        value={action} 
                                                        onChange={(e) => handleUpdateLogicArray('actions', idx, e.target.value)}
                                                        className="w-full bg-transparent p-1.5 text-xs font-mono font-bold text-emerald-900 outline-none text-right"
                                                        placeholder="הזן פעולה..."
                                                    />
                                                    <button onClick={() => handleRemoveLogicItem('actions', idx)} className="p-1 text-text-subtle hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <button 
                                            onClick={() => handleAddLogicItem('actions')}
                                            className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-white px-3 py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-200 transition-all mr-6 shadow-sm"
                                        >
                                            <PlusIcon className="w-3 h-3" />
                                            הוסף פעולה
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <footer className="p-6 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3">
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="px-6 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-subtle transition-colors"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={handleSave}
                                className="bg-primary-600 text-white px-10 py-2.5 rounded-xl font-black hover:bg-primary-700 shadow-xl shadow-primary-500/20 transition-all transform active:scale-95 disabled:opacity-60"
                                disabled={isSavingRule}
                            >
                                {isSavingRule ? 'שומר/ת...' : 'שמור במרשם'}
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {filteredRules.length === 0 && (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-border-default shadow-sm">
                    <NoSymbolIcon className="w-16 h-16 text-text-subtle mx-auto mb-4 opacity-20" />
                    <h3 className="text-xl font-bold text-text-default">לא נמצאו חוקים שתואמים לסינון</h3>
                    <p className="text-text-muted text-sm mt-2">נסה לשנות את הפרמטרים או את מילות החיפוש.</p>
                </div>
            )}

            {/* Legend / Info Footer */}
            <div className="pt-12 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] font-bold text-text-muted uppercase tracking-widest border-t border-border-default">
                <div className="flex flex-wrap gap-6 justify-center">
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Deployed</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Development</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div> Testing</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div> Pending</span>
                </div>
                <div>Hiro Logic Engine v2.5.1</div>
            </div>
        </div>
    );
};

export default AdminBusinessLogicView;
