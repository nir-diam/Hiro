
import React, { useState } from 'react';
import { 
    PlusIcon, PencilIcon, TrashIcon, VideoCameraIcon, 
    DocumentTextIcon, CheckCircleIcon, ClockIcon, XMarkIcon,
    ClipboardDocumentListIcon, ChevronDownIcon, ChevronUpIcon, 
    ArrowLeftIcon, PlayIcon, MicrophoneIcon, PhotoIcon, CheckIcon, NoSymbolIcon
} from './Icons';
import { useLanguage } from '../context/LanguageContext';

type QuestionType = 'text' | 'multiple_choice' | 'video';
type PresentationMode = 'text' | 'video';

interface QuestionOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

interface Question {
    id: number;
    // Context & Presentation
    introText?: string; // Info before the question
    presentationMode: PresentationMode; // How the recruiter asks (Text vs Video)
    
    // The Question Content
    text: string;
    description?: string;
    
    // Response Config
    type: QuestionType;
    options?: QuestionOption[]; // For multiple choice
    timeLimit?: number; // For video response (seconds)
    retriesAllowed?: boolean; // For video response
    
    // Logic
    isMandatory: boolean;
    disqualifyIfWrong?: boolean; // Killer question logic
    disqualificationReason?: string; // The reason for disqualification
    
    // UI State
    isExpanded?: boolean; 
}

interface Questionnaire {
    id: number;
    name: string;
    description: string;
    questions: Question[];
    createdAt: string;
    isActive: boolean;
}

const disqualificationReasons = [
    "ניסיון",
    "שכר",
    "השכלה / הכשרה",
    "זמינות / שעות עבודה",
    "מיקום / ניידות",
    "התאמה לתפקיד / ארגונית",
    "יציבות תעסוקתית",
    "חוסר תגובה",
    "סיבה אישית של המועמד",
    "אחר"
];

const initialQuestionnaires: Questionnaire[] = [
    {
        id: 1,
        name: 'סינון ראשוני - נציגי מכירות',
        description: 'שאלון למועמדים ללא ניסיון קודם, בדיקת זמינות ורכב.',
        createdAt: '2025-10-15',
        isActive: true,
        questions: [
            { 
                id: 101, 
                text: 'האם יש לך רישיון נהיגה בתוקף?', 
                presentationMode: 'text',
                type: 'multiple_choice', 
                options: [
                    { id: 'opt1', text: 'כן', isCorrect: true },
                    { id: 'opt2', text: 'לא', isCorrect: false }
                ], 
                disqualifyIfWrong: true,
                disqualificationReason: 'רישוי',
                isMandatory: true, 
                isExpanded: false 
            },
            { 
                id: 103, 
                introText: 'בתפקיד זה נדרשת יכולת ורבלית גבוהה ושכנוע.',
                text: 'ספר לנו בקצרה מדוע אתה מתאים לתפקיד מכירות?', 
                presentationMode: 'video',
                type: 'video', 
                timeLimit: 60, 
                retriesAllowed: true, 
                isMandatory: false, 
                isExpanded: false 
            },
        ]
    }
];

const QuestionTypeIcon: React.FC<{ type: QuestionType, className?: string }> = ({ type, className = "w-5 h-5" }) => {
    switch (type) {
        case 'video': return <VideoCameraIcon className={`${className} text-red-500`} />;
        case 'multiple_choice': return <CheckCircleIcon className={`${className} text-green-500`} />;
        case 'text': return <DocumentTextIcon className={`${className} text-blue-500`} />;
        default: return <DocumentTextIcon className={className} />;
    }
};

const QuestionnaireBuilderView: React.FC = () => {
    const { t } = useLanguage();
    const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>(initialQuestionnaires);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // --- Editor State ---
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formQuestions, setFormQuestions] = useState<Question[]>([]);
    
    const getTypeName = (type: QuestionType) => {
        switch (type) {
            case 'video': return t('questionnaires.video_response');
            case 'multiple_choice': return t('questionnaires.multiple_choice');
            case 'text': return t('questionnaires.text_response');
        }
    };

    const handleCreateNew = () => {
        setEditingId(null);
        setFormName(t('questionnaires.new'));
        setFormDescription('');
        setFormQuestions([]);
        setIsEditorOpen(true);
    };

    const handleEdit = (q: Questionnaire) => {
        setEditingId(q.id);
        setFormName(q.name);
        setFormDescription(q.description || '');
        setFormQuestions(q.questions.map(qu => ({ ...qu, isExpanded: false }))); // Collapse all initially
        setIsEditorOpen(true);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם למחוק את השאלון?')) {
            setQuestionnaires(prev => prev.filter(q => q.id !== id));
        }
    };

    const handleSave = () => {
        if (!formName.trim()) {
            alert('נא להזין שם לשאלון');
            return;
        }

        const newQ: Questionnaire = {
            id: editingId || Date.now(),
            name: formName,
            description: formDescription,
            questions: formQuestions,
            createdAt: editingId ? (questionnaires.find(q => q.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString().split('T')[0],
            isActive: true
        };

        if (editingId) {
            setQuestionnaires(prev => prev.map(q => q.id === newQ.id ? newQ : q));
        } else {
            setQuestionnaires(prev => [...prev, newQ]);
        }
        setIsEditorOpen(false);
    };

    // --- Question Manipulation ---

    const addQuestion = (type: QuestionType) => {
        const newQuestion: Question = {
            id: Date.now(),
            text: '',
            introText: '',
            presentationMode: 'text',
            type,
            options: type === 'multiple_choice' ? [
                { id: '1', text: '', isCorrect: false },
                { id: '2', text: '', isCorrect: false }
            ] : undefined,
            timeLimit: type === 'video' ? 60 : undefined,
            retriesAllowed: type === 'video' ? true : undefined,
            isMandatory: true,
            disqualifyIfWrong: false,
            disqualificationReason: 'ניסיון',
            isExpanded: true
        };
        setFormQuestions([...formQuestions, newQuestion]);
        
        setTimeout(() => {
            const container = document.getElementById('questions-container');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    };

    const updateQuestion = (id: number, field: keyof Question, value: any) => {
        setFormQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
    };
    
    const removeQuestion = (id: number) => {
        setFormQuestions(prev => prev.filter(q => q.id !== id));
    };

    const toggleExpand = (id: number) => {
        setFormQuestions(prev => prev.map(q => q.id === id ? { ...q, isExpanded: !q.isExpanded } : q));
    };

    // --- Option Logic ---

    const handleOptionTextChange = (qId: number, optId: string, text: string) => {
        setFormQuestions(prev => prev.map(q => {
            if (q.id !== qId || !q.options) return q;
            return {
                ...q,
                options: q.options.map(o => o.id === optId ? { ...o, text } : o)
            };
        }));
    };

    const toggleCorrectOption = (qId: number, optId: string) => {
        setFormQuestions(prev => prev.map(q => {
            if (q.id !== qId || !q.options) return q;
            return {
                ...q,
                options: q.options.map(o => o.id === optId ? { ...o, isCorrect: !o.isCorrect } : o)
            };
        }));
    };

    const addOption = (qId: number) => {
        setFormQuestions(prev => prev.map(q => {
            if (q.id !== qId || !q.options) return q;
            return { 
                ...q, 
                options: [...q.options, { id: Date.now().toString(), text: '', isCorrect: false }] 
            };
        }));
    };

    const removeOption = (qId: number, optId: string) => {
        setFormQuestions(prev => prev.map(q => {
            if (q.id !== qId || !q.options) return q;
            return { ...q, options: q.options.filter(o => o.id !== optId) };
        }));
    };
    
    const moveQuestion = (index: number, direction: -1 | 1) => {
        const newQuestions = [...formQuestions];
        if (index + direction < 0 || index + direction >= newQuestions.length) return;
        
        const temp = newQuestions[index];
        newQuestions[index] = newQuestions[index + direction];
        newQuestions[index + direction] = temp;
        setFormQuestions(newQuestions);
    };

    return (
        <div className="h-full flex flex-col relative">
            <style>{`
                @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } } 
                .animate-slide-in { animation: slideInRight 0.3s ease-out; }
            `}</style>

            {/* --- LIST VIEW --- */}
            {!isEditorOpen && (
                <div className="p-6 space-y-6 animate-fade-in">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-black text-text-default">{t('questionnaires.title')}</h1>
                            <p className="text-text-muted mt-1">{t('questionnaires.subtitle')}</p>
                        </div>
                        <button 
                            onClick={handleCreateNew}
                            className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30 flex items-center gap-2"
                        >
                            <PlusIcon className="w-5 h-5"/>
                            <span>{t('questionnaires.new_btn')}</span>
                        </button>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {questionnaires.map(q => (
                            <div key={q.id} className="bg-bg-card border border-border-default rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col relative overflow-hidden">
                                <div className={`absolute top-0 right-0 w-2 h-full ${q.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                
                                <div className="flex justify-between items-start mb-3 pl-2">
                                    <div className="pr-4">
                                        <h3 className="font-bold text-lg text-text-default mb-1 leading-tight">{q.name}</h3>
                                        <p className="text-sm text-text-muted line-clamp-2 min-h-[2.5em]">{q.description || 'ללא תיאור'}</p>
                                    </div>
                                    <div className="p-2 bg-bg-subtle rounded-lg text-primary-600">
                                        <ClipboardDocumentListIcon className="w-6 h-6"/>
                                    </div>
                                </div>
                                
                                <div className="mt-auto pt-4 border-t border-border-subtle flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-text-subtle">
                                        <span className="bg-bg-subtle px-2 py-1 rounded border border-border-default">{q.questions.length} {t('questionnaires.questions')}</span>
                                        <span>{new Date(q.createdAt).toLocaleDateString('he-IL')}</span>
                                    </div>
                                    
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEdit(q)} className="p-2 hover:bg-primary-50 rounded-lg text-text-muted hover:text-primary-600 transition-colors" title="ערוך">
                                            <PencilIcon className="w-4 h-4"/>
                                        </button>
                                        <button onClick={() => handleDelete(q.id)} className="p-2 hover:bg-red-50 rounded-lg text-text-muted hover:text-red-500 transition-colors" title="מחק">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- EDITOR VIEW --- */}
            {isEditorOpen && (
                <div className="flex flex-col h-full bg-bg-subtle/30 animate-slide-in">
                    
                    {/* Editor Header */}
                    <div className="bg-bg-card border-b border-border-default px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                        <div className="flex items-center gap-4 flex-1">
                            <button onClick={() => setIsEditorOpen(false)} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                                <ArrowLeftIcon className="w-5 h-5 transform rotate-180" />
                            </button>
                            <div className="flex-1 max-w-2xl">
                                <input 
                                    type="text" 
                                    value={formName} 
                                    onChange={(e) => setFormName(e.target.value)} 
                                    placeholder="שם השאלון..." 
                                    className="text-xl font-black text-text-default bg-transparent border-none focus:ring-0 placeholder:text-text-subtle/50 w-full p-0"
                                />
                                <input 
                                    type="text" 
                                    value={formDescription} 
                                    onChange={(e) => setFormDescription(e.target.value)} 
                                    placeholder="הוסף תיאור קצר..." 
                                    className="text-sm text-text-muted bg-transparent border-none focus:ring-0 placeholder:text-text-subtle/50 w-full p-0 mt-1"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3">
                             <button onClick={() => setIsEditorOpen(false)} className="text-text-muted font-bold py-2 px-4 hover:bg-bg-hover rounded-xl transition-colors">{t('client_form.cancel')}</button>
                             <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2 px-8 rounded-xl hover:bg-primary-700 shadow-md transition-all">{t('questionnaires.save_btn')}</button>
                        </div>
                    </div>

                    {/* Editor Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-8" id="questions-container">
                        <div className="max-w-3xl mx-auto space-y-6 pb-24">
                            
                            {formQuestions.length === 0 && (
                                <div className="text-center py-20 border-2 border-dashed border-border-default rounded-3xl bg-bg-subtle/20">
                                    <ClipboardDocumentListIcon className="w-16 h-16 text-text-subtle mx-auto mb-4 opacity-30"/>
                                    <h3 className="text-lg font-bold text-text-default">{t('questionnaires.empty_state')}</h3>
                                    <p className="text-text-muted mb-6">{t('questionnaires.empty_sub')}</p>
                                </div>
                            )}

                            {formQuestions.map((q, idx) => (
                                <div key={q.id} className={`bg-bg-card border transition-all duration-300 rounded-2xl shadow-sm group ${q.isExpanded ? 'border-primary-300 ring-4 ring-primary-50' : 'border-border-default hover:border-primary-200'}`}>
                                    {/* Card Header */}
                                    <div 
                                        className="flex items-center gap-4 p-4 cursor-pointer select-none"
                                        onClick={() => toggleExpand(q.id)}
                                    >
                                        <div className="flex flex-col gap-1">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); moveQuestion(idx, -1); }} 
                                                disabled={idx === 0}
                                                className="text-text-subtle hover:text-primary-600 disabled:opacity-20"
                                            >
                                                <ChevronUpIcon className="w-4 h-4"/>
                                            </button>
                                            <div className="w-6 h-6 rounded-full bg-bg-subtle flex items-center justify-center text-xs font-bold text-text-muted">
                                                {idx + 1}
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); moveQuestion(idx, 1); }} 
                                                disabled={idx === formQuestions.length - 1}
                                                className="text-text-subtle hover:text-primary-600 disabled:opacity-20"
                                            >
                                                <ChevronDownIcon className="w-4 h-4"/>
                                            </button>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <QuestionTypeIcon type={q.type} className="w-4 h-4" />
                                                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">{getTypeName(q.type)}</span>
                                                {q.isMandatory && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded font-bold">{t('questionnaires.mandatory')}</span>}
                                                {q.disqualifyIfWrong && <span className="text-[10px] bg-gray-800 text-white px-1.5 rounded font-bold">{t('questionnaires.killer')}</span>}
                                            </div>
                                            <div className="font-semibold text-text-default truncate">
                                                {q.text || <span className="text-text-subtle italic">ללא כותרת...</span>}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); removeQuestion(q.id); }} className="p-2 text-text-subtle hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                                                <TrashIcon className="w-5 h-5"/>
                                            </button>
                                            <div className={`transform transition-transform duration-200 text-text-muted ${q.isExpanded ? 'rotate-180' : ''}`}>
                                                <ChevronDownIcon className="w-5 h-5"/>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Body (Expanded) */}
                                    {q.isExpanded && (
                                        <div className="p-5 pt-0 border-t border-border-subtle/50 mt-2">
                                            <div className="space-y-4 pt-4">
                                                
                                                {/* Pre-Question Context */}
                                                <div>
                                                    <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">{t('questionnaires.intro_text')}</label>
                                                    <textarea 
                                                        value={q.introText || ''}
                                                        onChange={(e) => updateQuestion(q.id, 'introText', e.target.value)}
                                                        rows={2}
                                                        className="w-full bg-bg-subtle border border-border-default rounded-xl p-3 text-sm focus:ring-1 focus:ring-primary-500 transition-all resize-none"
                                                        placeholder="הוסף הקשר, הסבר או מידע לפני הצגת השאלה..."
                                                    />
                                                </div>

                                                {/* Recruiter Question Mode (Text vs Video) */}
                                                <div>
                                                    <div className="flex items-center gap-4 mb-2">
                                                        <label className="text-sm font-bold text-text-default">אופן הצגת השאלה:</label>
                                                        <div className="flex bg-bg-subtle p-0.5 rounded-lg border border-border-default">
                                                            <button 
                                                                onClick={() => updateQuestion(q.id, 'presentationMode', 'text')}
                                                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${q.presentationMode === 'text' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                                                            >
                                                                <DocumentTextIcon className="w-3.5 h-3.5"/>
                                                                טקסט
                                                            </button>
                                                            <button 
                                                                onClick={() => updateQuestion(q.id, 'presentationMode', 'video')}
                                                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${q.presentationMode === 'video' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                                                            >
                                                                <VideoCameraIcon className="w-3.5 h-3.5"/>
                                                                וידאו אישי
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {q.presentationMode === 'video' ? (
                                                        <div className="border-2 border-dashed border-primary-200 bg-primary-50/50 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3">
                                                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-primary-500">
                                                                <VideoCameraIcon className="w-6 h-6"/>
                                                            </div>
                                                            <p className="text-sm font-semibold text-primary-900">הקלט או העלה סרטון שאלה</p>
                                                            <p className="text-xs text-primary-700 max-w-xs">המועמד יראה את הסרטון שלך במקום לקרוא את הטקסט. מומלץ להוסיף כתוביות או טקסט חליפי.</p>
                                                            <button className="bg-primary-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary-700 transition">פתח מקליט</button>
                                                        </div>
                                                    ) : (
                                                        <input 
                                                            type="text" 
                                                            value={q.text} 
                                                            onChange={(e) => updateQuestion(q.id, 'text', e.target.value)}
                                                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                                                            placeholder="מה תרצה לשאול?"
                                                            autoFocus
                                                        />
                                                    )}
                                                </div>

                                                {/* Type Specific Settings */}
                                                <div className="bg-bg-subtle/50 p-4 rounded-xl border border-border-default/60 space-y-4">
                                                    
                                                    {/* VIDEO RESPONSE SETTINGS */}
                                                    {q.type === 'video' && (
                                                        <div className="flex flex-wrap gap-6">
                                                            <div>
                                                                <label className="block text-xs font-bold text-text-muted mb-1.5">{t('questionnaires.time_limit')}</label>
                                                                <div className="flex items-center gap-2">
                                                                    <ClockIcon className="w-4 h-4 text-text-subtle"/>
                                                                    <input 
                                                                        type="number" 
                                                                        value={q.timeLimit} 
                                                                        onChange={(e) => updateQuestion(q.id, 'timeLimit', parseInt(e.target.value))}
                                                                        className="w-20 bg-white border border-border-default rounded-lg p-2 text-sm text-center font-bold"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center pt-5">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={q.retriesAllowed} 
                                                                        onChange={(e) => updateQuestion(q.id, 'retriesAllowed', e.target.checked)}
                                                                        className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 border-border-default"
                                                                    />
                                                                    <span className="text-sm font-medium text-text-default">{t('questionnaires.allow_retries')}</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* MULTIPLE CHOICE SETTINGS */}
                                                    {q.type === 'multiple_choice' && (
                                                        <div>
                                                            <div className="flex justify-between items-center mb-2">
                                                                <label className="block text-xs font-bold text-text-muted">{t('questionnaires.options_label')}</label>
                                                                <div className="text-xs text-text-subtle bg-blue-50 px-2 py-0.5 rounded text-blue-700">
                                                                    {t('questionnaires.correct_answer_hint')}
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {q.options?.map((opt, optIdx) => (
                                                                    <div key={opt.id} className={`flex items-center gap-2 group/opt p-2 rounded-lg border transition-colors ${opt.isCorrect ? 'bg-green-50 border-green-200' : 'bg-white border-border-default'}`}>
                                                                        
                                                                        {/* Mark Correct Button */}
                                                                        <button 
                                                                            onClick={() => toggleCorrectOption(q.id, opt.id)}
                                                                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border transition-all ${opt.isCorrect ? 'bg-green-500 border-green-500 text-white' : 'bg-gray-100 border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-400'}`}
                                                                            title={opt.isCorrect ? "זו התשובה הנכונה" : "סמן כתשובה נכונה"}
                                                                        >
                                                                            <CheckIcon className="w-4 h-4" />
                                                                        </button>

                                                                        <input 
                                                                            type="text" 
                                                                            value={opt.text} 
                                                                            onChange={(e) => handleOptionTextChange(q.id, opt.id, e.target.value)}
                                                                            className="flex-1 bg-transparent border-none px-2 py-1 text-sm focus:ring-0 placeholder:text-text-subtle/50"
                                                                            placeholder={`אפשרות ${optIdx + 1}`}
                                                                        />
                                                                        
                                                                        <button 
                                                                            onClick={() => removeOption(q.id, opt.id)} 
                                                                            className="p-1.5 text-text-subtle hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover/opt:opacity-100 transition-opacity"
                                                                        >
                                                                            <XMarkIcon className="w-3.5 h-3.5"/>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                                <button 
                                                                    onClick={() => addOption(q.id)}
                                                                    className="flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors mt-2"
                                                                >
                                                                    <PlusIcon className="w-3 h-3"/> {t('questionnaires.add_option')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* TEXT SETTINGS */}
                                                    {q.type === 'text' && (
                                                        <div className="flex items-center gap-2 text-text-muted text-sm italic">
                                                            <DocumentTextIcon className="w-4 h-4"/>
                                                            <span>המועמד יתבקש להזין תשובה בטקסט חופשי.</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Footer settings (Common for ALL types) */}
                                                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-4 mt-2 border-t border-border-subtle">
                                                     <label className="flex items-center gap-2 cursor-pointer bg-bg-subtle px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors w-fit">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={q.isMandatory} 
                                                            onChange={(e) => updateQuestion(q.id, 'isMandatory', e.target.checked)}
                                                            className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                                        />
                                                        <span className="text-sm font-semibold text-text-default">{t('questionnaires.mandatory')}</span>
                                                    </label>

                                                    <div className="flex flex-col items-end gap-2">
                                                        <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg transition-all border ${q.disqualifyIfWrong ? 'bg-red-50 border-red-200' : 'bg-transparent border-transparent hover:bg-bg-subtle'}`}>
                                                            <div className="relative">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={q.disqualifyIfWrong} 
                                                                    onChange={(e) => updateQuestion(q.id, 'disqualifyIfWrong', e.target.checked)}
                                                                    className="sr-only peer"
                                                                />
                                                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`text-sm font-bold ${q.disqualifyIfWrong ? 'text-red-700' : 'text-text-default'}`}>{t('questionnaires.killer')}</span>
                                                                {q.disqualifyIfWrong && <NoSymbolIcon className="w-4 h-4 text-red-500"/>}
                                                            </div>
                                                        </label>
                                                        
                                                        {/* Disqualification Reason Selector */}
                                                        {q.disqualifyIfWrong && (
                                                            <div className="animate-fade-in mr-2 sm:mr-0">
                                                                <select 
                                                                    value={q.disqualificationReason || ''}
                                                                    onChange={(e) => updateQuestion(q.id, 'disqualificationReason', e.target.value)}
                                                                    className="w-full sm:w-64 bg-white border border-red-200 text-red-800 text-sm rounded-lg p-2 focus:ring-red-500 focus:border-red-500 font-medium"
                                                                >
                                                                    <option value="" disabled>בחר סיבת פסילה...</option>
                                                                    {disqualificationReasons.map(r => <option key={r} value={r}>{r}</option>)}
                                                                </select>
                                                            </div>
                                                        )}
                                                        
                                                        {q.disqualifyIfWrong && (
                                                            <p className="text-xs text-text-muted mt-1 mr-2 sm:mr-0 text-right">מועמדים שייכשלו יועברו אוטומטית לסטטוס "לא מתאים".</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Floating Toolbar */}
                    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-30">
                        <div className="bg-white border border-border-default shadow-2xl rounded-full p-2 flex items-center gap-2 animate-slide-up">
                             <span className="text-xs font-bold text-text-muted px-3 uppercase tracking-wider hidden sm:block">הוסף שאלה:</span>
                             <button onClick={() => addQuestion('video')} className="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-red-50 text-red-600 font-bold transition-colors group">
                                 <VideoCameraIcon className="w-5 h-5 group-hover:scale-110 transition-transform"/> 
                                 <span>{t('questionnaires.type_video')}</span>
                             </button>
                             <div className="w-px h-6 bg-border-default"></div>
                             <button onClick={() => addQuestion('text')} className="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-blue-50 text-blue-600 font-bold transition-colors group">
                                 <DocumentTextIcon className="w-5 h-5 group-hover:scale-110 transition-transform"/> 
                                 <span>{t('questionnaires.type_text')}</span>
                             </button>
                             <div className="w-px h-6 bg-border-default"></div>
                             <button onClick={() => addQuestion('multiple_choice')} className="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-green-50 text-green-600 font-bold transition-colors group">
                                 <CheckCircleIcon className="w-5 h-5 group-hover:scale-110 transition-transform"/> 
                                 <span>{t('questionnaires.type_multiple')}</span>
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuestionnaireBuilderView;
