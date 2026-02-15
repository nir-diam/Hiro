
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    SparklesIcon, PencilIcon, ArrowPathIcon, ExclamationTriangleIcon, 
    CheckCircleIcon, ChatBubbleBottomCenterTextIcon, InformationCircleIcon,
    CodeBracketIcon, PlusIcon, DocumentTextIcon, TrashIcon, ClockIcon
} from './Icons';
import { usePrompts, PromptTemplate } from '../context/PromptContext';
import { useLanguage } from '../context/LanguageContext';
import { GoogleGenAI } from '@google/genai';

const apiBase = import.meta.env.VITE_API_BASE || '';

interface PromptHistoryEntry {
    id: string;
    promptId: string;
    name: string;
    description: string;
    template: string;
    model: string;
    temperature: number;
    variables: string[];
    category: string;
    action: 'create' | 'update';
    createdAt: string;
    comments?: string;
}

// --- MOCK DATA FOR TESTING ---
const MOCK_DATA_EXAMPLES: Record<string, string> = {
    'resume_text': `ישראל ישראלי
מנהל שיווק דיגיטלי עם 5 שנות ניסיון.
ניסיון:
- מנהל שיווק בבזק (2020-2023): ניהול צוות, אחריות על קמפיינים דיגיטליים ותקציב שנתי.
- מנהל קמפיינים PPC ב-Wix (2018-2019): ניהול קמפיינים בגוגל ופייסבוק.
השכלה:
- תואר ראשון בתקשורת, אוניברסיטת תל אביב.
כישורים:
- Google Ads, Facebook Ads, Google Analytics, ניהול צוות, אסטרטגיה.`,
    'job_text': `דרוש/ה מנהל/ת מוצר לחברת הייטק מובילה בתל אביב.
דרישות התפקיד:
- ניסיון של 3 שנים לפחות בניהול מוצר B2B - חובה.
- ניסיון בעבודה בסביבת Agile.
- אנגלית ברמה גבוהה.
- יכולת עבודה בצוות.`,
    'company_names_json': `["Wix", "Tnuva", "Elbit Systems"]`
};

const AdminPromptsView: React.FC = () => {
    const { prompts, isLoading, updatePrompt, addPrompt, deletePrompt, resetToDefaults } = usePrompts();
    const { t } = useLanguage();
    const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
    const [editForm, setEditForm] = useState<PromptTemplate | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const [isNew, setIsNew] = useState(false);
    
    // Playground State
    const [activeTab, setActiveTab] = useState<'edit' | 'test' | 'history'>('edit');
    const [historyEntries, setHistoryEntries] = useState<PromptHistoryEntry[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
    const [historyModalEntry, setHistoryModalEntry] = useState<PromptHistoryEntry | null>(null);
    const [testInputs, setTestInputs] = useState<Record<string, string>>({});
    const [testOutput, setTestOutput] = useState('');
    const [isTesting, setIsTesting] = useState(false);

    const handleEdit = (prompt: PromptTemplate) => {
        setSelectedPrompt(prompt);
        setEditForm({ ...prompt });
        setErrorMessage(null);
        setIsNew(false);
        setSaveStatus('idle');
        setActiveTab('edit');
        setTestInputs({});
        setTestOutput('');
        
        // Initialize empty inputs for variables
        const initialInputs: Record<string, string> = {};
        if (Array.isArray(prompt.variables)) {
            prompt.variables.forEach(v => initialInputs[v] = '');
        }
        setTestInputs(initialInputs);
    };

    const handleCreateNew = () => {
        const newPrompt: PromptTemplate = {
            id: '',
            name: 'פרומפט חדש',
            description: '',
            template: '',
            model: 'gemini-3-flash-preview',
            temperature: 0.5,
            variables: [],
            category: 'other',
            comments: '',
        };
        setErrorMessage(null);
        setEditForm(newPrompt);
        setSelectedPrompt(null);
        setIsNew(true);
        setSaveStatus('idle');
        setActiveTab('edit');
        setTestInputs({});
        setTestOutput('');
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק את הפרומפט הזה? פעולה זו היא בלתי הפיכה.')) return;
        try {
            await deletePrompt(id);
            setEditForm(null);
            setSelectedPrompt(null);
        } catch (err) {
            alert((err as Error).message || 'מחיקה נכשלה');
        }
    };

    const handleInsertVariable = (variable: string) => {
        if (!editForm || !textAreaRef.current) return;

        const textarea = textAreaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = editForm.template;
        const insertText = `{{${variable}}}`;
        
        const newText = text.substring(0, start) + insertText + text.substring(end);
        setEditForm({ ...editForm, template: newText });

        // Restore focus and cursor position after React re-render
        setTimeout(() => {
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(start + insertText.length, start + insertText.length);
            }
        }, 0);
    };

    const extractVariables = (template: string): string[] => {
        if (!template || typeof template !== 'string') return [];
        try {
            const regex = /{{([a-zA-Z0-9_]+)}}/g;
            const variables = new Set<string>();
            let match;
            // Use regex.exec for broader compatibility and to avoid TS issues with matchAll
            while ((match = regex.exec(template)) !== null) {
                variables.add(match[1]);
            }
            return Array.from(variables);
        } catch (e) {
            console.error('Error extracting variables', e);
            return [];
        }
    };

    const handleLoadMockData = () => {
        if (!editForm) return;
        const newInputs: Record<string, string> = {};
        if (Array.isArray(editForm.variables)) {
            editForm.variables.forEach(v => {
                newInputs[v] = MOCK_DATA_EXAMPLES[v] || 'Data not found for this variable';
            });
        }
        setTestInputs(newInputs);
    };

    const handleSave = async () => {
        if (!editForm) return;

        if (isNew && !editForm.id.trim()) {
            alert('חובה להזין מזהה (ID) ייחודי לפרומפט חדש. זה המזהה בו המתכנת ישתמש בקוד.');
            return;
        }

        if (isNew && prompts.some(p => p.id === editForm.id)) {
            alert('קיים כבר פרומפט עם המזהה הזה. אנא בחר מזהה אחר.');
            return;
        }

        // Auto-detect variables from template
        const detectedVars = extractVariables(editForm.template);
        const updatedForm = { ...editForm, variables: detectedVars };

        setSaveStatus('saving');
        setErrorMessage(null);
        try {
            if (isNew) {
                const created = await addPrompt(updatedForm);
                setIsNew(false);
                setSelectedPrompt(created);
                setEditForm(created);
            } else {
                const updated = await updatePrompt(editForm.id, updatedForm);
                setSelectedPrompt(updated);
                setEditForm(updated);
            }
            setSaveStatus('saved');
            clearHistoryCache();
            fetchHistory();
        } catch (err: any) {
            const msg = err?.message || 'שמירה נכשלה';
            setErrorMessage(msg);
            setSaveStatus('idle');
            return;
        } finally {
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleReset = async () => {
        if (window.confirm('האם אתה בטוח שברצונך לאפס את כל הפרומפטים לברירת המחדל של המערכת? פעולה זו תמחק את כל השינויים.')) {
            await resetToDefaults();
            setSelectedPrompt(null);
            setEditForm(null);
            setHistoryEntries([]);
            setIsHistoryLoaded(false);
        }
    };

    const handleRunTest = async () => {
        if (!editForm) return;
        setIsTesting(true);
        setTestOutput('');

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            let finalPrompt = editForm.template;
            
            // Interpolate variables
            if (Array.isArray(editForm.variables)) {
                editForm.variables.forEach(v => {
                    const val = testInputs[v] || '';
                    // Simple replace all occurrences
                    finalPrompt = finalPrompt.split(`{{${v}}}`).join(val);
                });
            }

            // Call API
            const response = await ai.models.generateContent({
                model: editForm.model,
                contents: finalPrompt,
                config: { temperature: editForm.temperature }
            });

            setTestOutput(response.text || 'התקבלה תשובה ריקה מהמודל.');
        } catch (e: any) {
            console.error(e);
            const errorMessage = e?.message || String(e);
            setTestOutput('שגיאה בהרצת הבדיקה:\n' + errorMessage);
        } finally {
            setIsTesting(false);
        }
    };

    const fetchHistory = useCallback(async (promptId?: string) => {
        setIsHistoryLoading(true);
        try {
            const url = new URL(`${apiBase}/api/prompts/history`, window.location.origin);
            if (promptId) {
                url.searchParams.set('promptId', promptId);
            }
            const res = await fetch(url.toString());
            if (!res.ok) throw new Error('Failed to load history');
            const data = await res.json();
            if (Array.isArray(data)) {
                setHistoryEntries(data);
            }
            setIsHistoryLoaded(true);
        } catch (err) {
            console.error('Failed to fetch prompt history', err);
        } finally {
            setIsHistoryLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (activeTab === 'history' && selectedPrompt) {
            fetchHistory(selectedPrompt.id);
        }
        }
    , [activeTab, fetchHistory, selectedPrompt]);

    const openHistoryModal = (entry: PromptHistoryEntry) => setHistoryModalEntry(entry);
    const closeHistoryModal = () => setHistoryModalEntry(null);

    const handleTabChange = (tab: 'edit' | 'test' | 'history') => {
        setActiveTab(tab);
    };

    useEffect(() => {
        setHistoryEntries([]);
        setIsHistoryLoaded(false);
    }, [selectedPrompt?.id]);

    const clearHistoryCache = () => {
        setIsHistoryLoaded(false);
    };

    return (
        <div className="flex flex-col h-full space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                        <SparklesIcon className="w-8 h-8 text-primary-600" />
                        ניהול מוח המערכת (AI Prompts)
                    </h1>
                    <p className="text-sm text-text-muted mt-1">
                        כאן ניתן לערוך את ההנחיות הנשלחות לבינה המלאכותית ולדייק את התוצאות.
                    </p>
                </div>
                <button 
                    onClick={handleReset}
                    className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 border border-transparent hover:border-red-100"
                >
                    <ArrowPathIcon className="w-4 h-4" />
                    אפס לברירת מחדל
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-200px)]">
                
                {/* Sidebar: List of Prompts */}
                <div className="w-full lg:w-1/3 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border-default bg-bg-subtle/50 flex justify-between items-center">
                        <h3 className="font-bold text-text-default">פרומפטים פעילים</h3>
                        <button 
                            onClick={handleCreateNew}
                            className="bg-primary-600 text-white p-1.5 rounded-lg hover:bg-primary-700 transition"
                            title="צור פרומפט חדש"
                        >
                            <PlusIcon className="w-5 h-5"/>
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                        {isLoading ? (
                            <div className="px-4 py-6 text-center text-xs text-text-muted">טוען פרומפטים...</div>
                        ) : (
                            prompts.map(prompt => (
                                <button
                                    key={prompt.id}
                                    onClick={() => handleEdit(prompt)}
                                    className={`w-full text-right p-4 rounded-xl border transition-all duration-200 group ${
                                        selectedPrompt?.id === prompt.id
                                            ? 'bg-primary-50 border-primary-500 ring-1 ring-primary-500 shadow-sm'
                                            : 'bg-white border-border-default hover:border-primary-300 hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <h4 className={`font-bold ${selectedPrompt?.id === prompt.id ? 'text-primary-900' : 'text-text-default'}`}>
                                            {prompt.name}
                                        </h4>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                                            prompt.category === 'candidates' ? 'bg-blue-100 text-blue-700' :
                                            prompt.category === 'jobs' ? 'bg-orange-100 text-orange-700' :
                                            'bg-purple-100 text-purple-700'
                                        }`}>
                                            {prompt.category}
                                        </span>
                                    </div>
                                    <p className="text-xs text-text-muted mt-2 line-clamp-2">
                                        {prompt.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-3 text-[10px] text-text-subtle font-mono">
                                        <span className="bg-bg-subtle px-1.5 py-0.5 rounded">{prompt.model}</span>
                                        <span>ID: {prompt.id}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Main Content: Editor & Playground */}
                <div className="w-full lg:w-2/3 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col">
                    {editForm ? (
                        <>
                            {/* Tabs Header */}
                            <div className="flex items-center justify-between border-b border-border-default bg-bg-subtle/30 px-2">
                                <div className="flex">
                                    <button 
                                        onClick={() => handleTabChange('edit')}
                                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'edit' ? 'border-primary-500 text-primary-700 bg-white' : 'border-transparent text-text-muted hover:text-text-default'}`}
                                    >
                                        <PencilIcon className="w-4 h-4"/> עריכה
                                    </button>
                                    <button 
                                        onClick={() => handleTabChange('test')}
                                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'test' ? 'border-purple-500 text-purple-700 bg-white' : 'border-transparent text-text-muted hover:text-text-default'}`}
                                    >
                                        <CodeBracketIcon className="w-4 h-4"/> Playground (בדיקה)
                                    </button>
                                    <button
                                        onClick={() => handleTabChange('history')}
                                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'border-green-500 text-green-700 bg-white' : 'border-transparent text-text-muted hover:text-text-default'}`}
                                    >
                                        <ClockIcon className="w-4 h-4"/> היסטוריה
                                    </button>
                                </div>
                                <div className="px-4 flex items-center gap-2">
                                    {!isNew && (
                                        <button 
                                            onClick={() => handleDelete(editForm.id)} 
                                            className="text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50"
                                            title="מחק פרומפט"
                                        >
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {/* EDITOR TAB */}
                            {activeTab === 'edit' && (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                        
                                        {/* Meta Data Inputs */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">שם הפרומפט (לתצוגה)</label>
                                                <input 
                                                    type="text" 
                                                    value={editForm.name} 
                                                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm font-bold"
                                                />
                                            </div>
                                             <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">מזהה (Code ID)</label>
                                                <input 
                                                    type="text" 
                                                    value={editForm.id} 
                                                    onChange={e => setEditForm({...editForm, id: e.target.value})}
                                                    disabled={!isNew}
                                                    className={`w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm font-mono ${!isNew ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'text-purple-600'}`}
                                                    placeholder="e.g. new_feature_generator"
                                                />
                                                {isNew && <p className="text-[10px] text-purple-600 mt-1">זהו המזהה שהמתכנת ישתמש בו בקוד.</p>}
                                            </div>
                                            <div className="col-span-2">
                                                 <label className="block text-xs font-bold text-text-muted uppercase mb-1">תיאור</label>
                                                 <input 
                                                    type="text" 
                                                    value={editForm.description} 
                                                    onChange={e => setEditForm({...editForm, description: e.target.value})}
                                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                                />
                                            </div>
                                             <div className="col-span-2 md:col-span-1">
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-1">קטגוריה</label>
                                                <select 
                                                    value={editForm.category}
                                                    onChange={e => setEditForm({...editForm, category: e.target.value as any})}
                                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                                >
                                                    <option value="candidates">מועמדים</option>
                                                    <option value="jobs">משרות</option>
                                                    <option value="companies">חברות</option>
                                                    <option value="communications">תקשורת</option>
                                                    <option value="analysis">אנליטיקה</option>
                                                    <option value="chatbots">צ'אט בוטים</option>
                                                    <option value="other">אחר</option>
                                                </select>
                                            </div>
                                        </div>

                                        <hr className="border-border-default"/>

                                        {/* Variables Toolbar */}
                                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <InformationCircleIcon className="w-5 h-5 text-blue-600" />
                                                <h4 className="text-sm font-bold text-blue-900">משתנים דינמיים (לחץ להוספה)</h4>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {Array.isArray(editForm.variables) && editForm.variables.map(v => (
                                                    <button 
                                                        key={v} 
                                                        onClick={() => handleInsertVariable(v)}
                                                        className="flex items-center gap-1.5 text-xs font-mono bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-100 transition-all active:scale-95"
                                                        title={`הוסף את המשתנה {{${v}}} במקום הסמן`}
                                                    >
                                                        <PlusIcon className="w-3 h-3" />
                                                        {v}
                                                    </button>
                                                ))}
                                                {isNew && <span className="text-xs text-blue-400 self-center">משתנים יזוהו אוטומטית בעת השמירה ({'{{var}}'})</span>}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-text-default mb-2">תוכן הפרומפט (System Instruction)</label>
                                            <textarea 
                                                ref={textAreaRef}
                                                value={editForm.template}
                                                onChange={(e) => setEditForm({ ...editForm, template: e.target.value })}
                                                className="w-full h-80 bg-bg-input border border-border-default rounded-xl p-4 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                                                dir="ltr"
                                                spellCheck={false}
                                                placeholder="הקלד את ההנחיות ל-AI כאן..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-text-default mb-2 mt-4">הערות</label>
                                            <textarea
                                                value={editForm.comments || ''}
                                                onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                                                className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm leading-relaxed focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                                                rows={3}
                                                placeholder="הערות פנימיות לגבי הפרומפט..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-bg-subtle/30 p-4 rounded-xl border border-border-default">
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-2">מודל (Model)</label>
                                                <select 
                                                    value={editForm.model}
                                                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                                                    className="w-full bg-white border border-border-default rounded-lg p-2.5 text-sm"
                                                >
                                                    <option value="gemini-3-flash-preview">Gemini 3 Flash (מהיר וחסכוני)</option>
                                                    <option value="gemini-3-pro-preview">Gemini 3 Pro (חכם ומדויק)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-text-muted uppercase mb-2">
                                                    יצירתיות (Temperature: {editForm.temperature})
                                                </label>
                                                <input 
                                                    type="range" 
                                                    min="0" max="1" step="0.1"
                                                    value={editForm.temperature}
                                                    onChange={(e) => setEditForm({ ...editForm, temperature: parseFloat(e.target.value) })}
                                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                                                />
                                                <div className="flex justify-between text-[10px] text-text-muted mt-1">
                                                    <span>0.0 (מדויק)</span>
                                                    <span>1.0 (יצירתי)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="p-4 border-t border-border-default bg-white flex flex-col gap-3 z-10">
                                        {saveStatus === 'saved' && (
                                            <span className="text-sm font-bold text-green-600 flex items-center gap-1 animate-fade-in self-center mr-auto">
                                                <CheckCircleIcon className="w-5 h-5" /> השינויים נשמרו בהצלחה
                                            </span>
                                        )}
                                        {errorMessage && (
                                            <div className="text-sm text-red-600 font-semibold">{errorMessage}</div>
                                        )}
                                        <button 
                                            onClick={handleSave}
                                            disabled={saveStatus === 'saving'}
                                            className="bg-primary-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 disabled:opacity-50"
                                        >
                                            {saveStatus === 'saving' ? 'שומר...' : (isNew ? 'צור פרומפט' : 'שמור שינויים')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* PLAYGROUND TAB */}
                            {activeTab === 'test' && (
                                <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                        
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-text-default flex items-center gap-2">
                                                <PencilIcon className="w-4 h-4 text-purple-600"/>
                                                קלט משתנים (Test Data)
                                            </h3>
                                            <button 
                                                onClick={handleLoadMockData}
                                                className="text-xs font-bold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-200 transition-colors flex items-center gap-1"
                                            >
                                                <DocumentTextIcon className="w-3 h-3" />
                                                טען נתונים לדוגמה
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {extractVariables(editForm.template).map(v => (
                                                <div key={v}>
                                                    <label className="block text-xs font-bold text-text-muted mb-1.5 font-mono">{`{{${v}}}`}</label>
                                                    <textarea
                                                        value={testInputs[v] || ''}
                                                        onChange={e => setTestInputs(prev => ({...prev, [v]: e.target.value}))}
                                                        className="w-full bg-white border border-border-default rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 font-mono h-24"
                                                        placeholder={`הזן תוכן עבור ${v}...`}
                                                    />
                                                </div>
                                            ))}
                                            {extractVariables(editForm.template).length === 0 && (
                                                <div className="text-center text-text-muted text-sm py-4">אין משתנים בתבנית זו.</div>
                                            )}
                                        </div>

                                        <div className="flex justify-end pt-4 border-t border-gray-200">
                                            <button 
                                                onClick={handleRunTest}
                                                disabled={isTesting}
                                                className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition shadow-md flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isTesting ? (
                                                    <span className="animate-pulse">מריץ בדיקה...</span>
                                                ) : (
                                                    <>
                                                        <ArrowPathIcon className="w-4 h-4"/> הרץ בדיקה (Live API)
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {testOutput && (
                                            <div className="space-y-2 animate-fade-in">
                                                <h3 className="font-bold text-text-default flex items-center gap-2">
                                                    <SparklesIcon className="w-4 h-4 text-green-600"/>
                                                    תוצאת המודל
                                                </h3>
                                                <div className="bg-[#1e1e1e] text-green-400 p-4 rounded-xl font-mono text-xs overflow-x-auto shadow-inner border border-gray-700">
                                                    <pre>{testOutput}</pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {activeTab === 'history' && (
                                <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                        {!selectedPrompt ? (
                                            <div className="text-center text-text-muted">בחר פרומפט כדי לצפות בהיסטוריה רלוונטית.</div>
                                        ) : isHistoryLoading ? (
                                            <div className="text-center text-text-muted">טוען היסטוריה...</div>
                                        ) : historyEntries.length === 0 ? (
                                            <div className="text-center text-text-muted">אין היסטוריה להצגה.</div>
                                        ) : (
                                            historyEntries.map(entry => (
                                                <button
                                                    key={entry.id}
                                                    onClick={() => openHistoryModal(entry)}
                                                    className="w-full text-right p-4 rounded-xl border border-border-default bg-white hover:border-primary-300 hover:shadow-sm transition"
                                                >
                                                    <div className="flex justify-between items-center gap-3">
                                                        <div className="text-right">
                                                            <p className="text-sm font-bold text-text-default">{entry.name}</p>
                                                            <p className="text-[11px] text-text-muted flex items-center gap-2">
                                                                <span className="capitalize">{entry.action}</span>
                                                                <span>•</span>
                                                                {new Date(entry.createdAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                        <span className="text-[10px] text-text-muted font-mono">{entry.promptId}</span>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-8 text-center bg-gray-50/50">
                            <div className="bg-white p-6 rounded-full mb-4 shadow-sm border border-border-default">
                                <ChatBubbleBottomCenterTextIcon className="w-12 h-12 opacity-30 text-primary-500" />
                            </div>
                            <h3 className="text-xl font-bold text-text-default">בחר פרומפט לעריכה</h3>
                            <p className="mt-2 max-w-sm text-sm">
                                בחר את אחת מההגדרות בתפריט מימין או צור פרומפט חדש כדי להתחיל.
                            </p>
                            <button 
                                onClick={handleCreateNew}
                                className="mt-6 bg-primary-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-primary-700 transition shadow-md flex items-center gap-2"
                            >
                                <PlusIcon className="w-5 h-5"/>
                                צור חדש
                            </button>
                        </div>
                    )}
                </div>
            </div>
            {historyModalEntry && (
                <HistoryModal entry={historyModalEntry} onClose={closeHistoryModal} />
            )}
        </div>
    );
};

const HistoryModal: React.FC<{ entry: PromptHistoryEntry; onClose: () => void }> = ({ entry, onClose }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-border-default overflow-hidden flex flex-col animate-fade-in">
            <div className="flex justify-between items-center px-5 py-4 border-b border-border-default">
                <div>
                    <p className="text-lg font-bold text-text-default">{entry.name}</p>
                    <p className="text-xs text-text-muted flex items-center gap-2">
                        <span className="capitalize bg-bg-subtle px-1.5 rounded">{entry.action}</span>
                        <span>{new Date(entry.createdAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                </div>
                <button onClick={onClose} className="p-2 text-text-muted hover:text-text-default">
                    סגור
                </button>
            </div>
                <div className="p-5 space-y-4 overflow-y-auto">
                <div>
                    <p className="text-xs text-text-muted uppercase mb-1">תיאור</p>
                    <p className="text-sm text-text-default whitespace-pre-line">{entry.description || 'ללא תיאור'}</p>
                </div>
                <div>
                    <p className="text-xs text-text-muted uppercase mb-1">תבנית (Template)</p>
                    <pre className="bg-bg-subtle border border-border-default rounded-xl p-3 text-xs overflow-x-auto whitespace-pre-wrap">{entry.template}</pre>
                </div>
                    <div>
                        <p className="text-xs text-text-muted uppercase mb-1">הערות</p>
                        <p className="text-sm text-text-default whitespace-pre-line">{entry.comments || 'אין הערות'}</p>
                    </div>
                <div className="grid grid-cols-2 gap-4 text-xs text-text-muted">
                    <div>
                        <p className="font-bold text-text-default text-[11px]">מודל</p>
                        <p>{entry.model}</p>
                    </div>
                    <div>
                        <p className="font-bold text-text-default text-[11px]">טמפרטורה</p>
                        <p>{entry.temperature}</p>
                    </div>
                </div>
                <div>
                    <p className="text-xs text-text-muted uppercase mb-1">משתנים</p>
                    <div className="flex flex-wrap gap-2">
                        {(entry.variables || []).map(variable => (
                            <span key={variable} className="text-[11px] px-2 py-1 bg-bg-card border border-border-default rounded-full">
                                {variable}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
);

export default AdminPromptsView;
