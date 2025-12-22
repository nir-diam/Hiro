
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from '@google/genai';
import { 
    LinkIcon, PencilIcon, SparklesIcon, ArrowLeftIcon, PlusIcon, TrashIcon, XMarkIcon, 
    ClipboardDocumentIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, PaperAirplaneIcon,
    ShareIcon, WhatsappIcon, EnvelopeIcon, ChartBarIcon, EyeIcon, UserGroupIcon,
    TableCellsIcon, FunnelIcon
} from './Icons';
import AccordionSection from './AccordionSection';
import { AvatarIcon } from './Icons';
import HiroAIChat from './HiroAIChat';

interface Message {
    role: 'user' | 'model';
    text: string;
}

const updateJobPublishingFieldFunctionDeclaration: FunctionDeclaration = {
  name: 'updateJobPublishingField',
  parameters: {
    type: Type.OBJECT,
    description: 'Update a specific publishing/marketing field of the job (for the landing page).',
    properties: {
      fieldName: { type: Type.STRING, description: 'The field to update (publicTitle, publicDescription, publicRequirements).' },
      newValue: { type: Type.STRING, description: 'The new value for the field.' },
    },
    required: ['fieldName', 'newValue'],
  },
};

// --- TYPES for complex screening questions ---
type AnswerType = 'Yes/No' | 'טקסט חופשי' | 'בחירה מרובה';

interface ScreeningQuestion {
    id: number;
    question: string;
    answerType: AnswerType;
    idealAnswer: string;
    isMandatory: boolean;
    category: string;
    isPublished: boolean;
    multipleChoiceOptions: string;
    order: number;
}

// Mock candidates from sources
interface SourceCandidate {
    id: number;
    name: string;
    source: string;
    date: string;
    status: string;
    matchScore: number;
    city: string;
}

const mockSourceCandidates: SourceCandidate[] = [
    { id: 1, name: 'ישראל ישראלי', source: 'LinkedIn Post', date: '12/11/2025', status: 'חדש', matchScore: 92, city: 'תל אביב' },
    { id: 2, name: 'מיכל כהן', source: 'Facebook Campaign', date: '11/11/2025', status: 'סינון טלפוני', matchScore: 85, city: 'רמת גן' },
    { id: 3, name: 'דוד לוי', source: 'Website Career Page', date: '10/11/2025', status: 'ראיון', matchScore: 78, city: 'גבעתיים' },
    { id: 4, name: 'שרה אהרוני', source: 'LinkedIn Post', date: '09/11/2025', status: 'חדש', matchScore: 65, city: 'הרצליה' },
    { id: 5, name: 'גיל ססובר', source: 'Facebook Campaign', date: '09/11/2025', status: 'נדחה', matchScore: 45, city: 'חולון' },
];

// Mock data
const mockJob = {
    id: '10257',
    jobTitle: 'מנהל/ת שיווק דיגיטלי',
    description: 'ניהול כלל הפעילות הדיגיטלית של החברה, כולל קמפיינים ממומנים, SEO, וניהול נכסים דיגיטליים. אחריות על עמידה ביעדים והגדלת החשיפה למותג.',
    requirements: [
        '5+ שנות ניסיון בשיווק דיגיטלי',
        'ניסיון מוכח בניהול צוות',
        'שליטה מלאה בגוגל אנליטיקס'
    ],
    screeningQuestions: [
        { id: 1, question: "מה הניסיון שלך בניהול קמפיינים PPC?", answerType: 'טקסט חופשי', idealAnswer: '', isMandatory: true, category: 'ניסיון', isPublished: true, multipleChoiceOptions: '', order: 1 },
        { id: 2, question: "האם יש לך ניסיון עם Google Analytics?", answerType: 'Yes/No', idealAnswer: 'Yes', isMandatory: true, category: 'כלים', isPublished: true, multipleChoiceOptions: '', order: 2 },
        { id: 3, question: "מה ציפיות השכר שלך?", answerType: 'טקסט חופשי', idealAnswer: '', isMandatory: false, category: 'שכר', isPublished: false, multipleChoiceOptions: '', order: 3 },
    ] as ScreeningQuestion[],
};

interface LandingPageField {
    key: string;
    label: string;
    status: 'mandatory' | 'optional';
}

const allPossibleFields: Omit<LandingPageField, 'status'>[] = [
    { key: 'firstName', label: 'שם פרטי' },
    { key: 'lastName', label: 'שם משפחה' },
    { key: 'fullName', label: 'שם מלא' },
    { key: 'phone', label: 'טלפון' },
    { key: 'email', label: 'דוא"ל' },
    { key: 'city', label: 'עיר מגורים' },
    { key: 'idNumber', label: 'תעודת זהות' },
    { key: 'drivingLicense', label: 'רישיון נהיגה' },
    { key: 'linkedin', label: 'קישור לינקדאין' },
    { key: 'cv', label: 'קורות חיים' },
    { key: 'interestedInJobs', label: 'מתעניין במשרות' },
    { key: 'notes', label: 'הערות' },
    { key: 'privacy', label: 'אישור פרטיות' },
];

const initialFields: LandingPageField[] = [
    { key: 'fullName', label: 'שם מלא', status: 'mandatory' },
    { key: 'phone', label: 'טלפון', status: 'mandatory' },
    { key: 'email', label: 'דוא"ל', status: 'mandatory' },
    { key: 'cv', label: 'קורות חיים', status: 'mandatory' },
    { key: 'privacy', label: 'אישור פרטיות', status: 'mandatory' },
    { key: 'linkedin', label: 'קישור לינקדאין', status: 'optional' },
];

const ToggleSwitch: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, checked, onChange }) => (
  <label className="flex items-center justify-between cursor-pointer bg-bg-subtle/70 p-3 rounded-lg border border-border-default/80">
    <span className="text-sm font-medium text-text-default">{label}</span>
    <div className="relative">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <div className={`block w-12 h-6 rounded-full transition ${checked ? 'bg-primary-600' : 'bg-border-default'}`}></div>
      <div className={`dot absolute left-1 top-1 bg-bg-card w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-6' : ''}`}></div>
    </div>
  </label>
);


const PublishJobView: React.FC = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const job = mockJob; 

    const [publishingCode] = useState(String(Math.floor(100000 + Math.random() * 900000)));
    const [copySuccess, setCopySuccess] = useState(false);
    const [publicJobTitle, setPublicJobTitle] = useState(job.jobTitle);
    const [publicJobDescription, setPublicJobDescription] = useState(job.description);
    const [publicJobRequirements, setPublicJobRequirements] = useState(job.requirements.join('\n'));
    
    const [landingPageFields, setLandingPageFields] = useState<LandingPageField[]>(initialFields);
    const [isAddParamOpen, setIsAddParamOpen] = useState(false);
    const addParamRef = useRef<HTMLDivElement>(null);

    const [screeningQuestions, setScreeningQuestions] = useState(job.screeningQuestions);
    
    // Enhanced state for tracking links with analytics
    const [trackingLinks, setTrackingLinks] = useState([
        { id: 1, source: 'LinkedIn Post', url: 'https://hiro.co.il/jobs/10257?src=li_post', views: 450, applicants: 32 },
        { id: 2, source: 'Facebook Campaign', url: 'https://hiro.co.il/jobs/10257?src=fb_jul', views: 1200, applicants: 15 },
        { id: 3, source: 'Website Career Page', url: 'https://hiro.co.il/jobs/10257?src=career', views: 890, applicants: 56 },
    ]);
    
    const [newLinkSource, setNewLinkSource] = useState('');
    const [publishToGeneralBoard, setPublishToGeneralBoard] = useState(true);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    // Candidates Table State
    const [selectedSourceFilter, setSelectedSourceFilter] = useState<string | null>(null);
    const candidatesTableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scrollContainer = document.getElementById('main-scroll-container');
        if (scrollContainer) {
            scrollContainer.scrollTop = 0;
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (addParamRef.current && !addParamRef.current.contains(event.target as Node)) {
                setIsAddParamOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // AI Chat Initialization for Publishing View
    const initializeChat = () => {
        if (chatSession) return;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const contextData = { 
            job: {
                title: publicJobTitle,
                description: publicJobDescription,
                requirements: publicJobRequirements
            }
        };
        const systemInstruction = `You are Hiro AI, a marketing expert and recruiter. You are helping the user optimize the public landing page for the job "${publicJobTitle}".
        You can use the 'updateJobPublishingField' tool to directly update the title, description, or requirements that candidates will see.
        Always suggest changes in a professional, engaging Hebrew style.
        Context: ${JSON.stringify(contextData)}`;
        
        const newChatSession = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: { 
                systemInstruction,
                tools: [{ functionDeclarations: [updateJobPublishingFieldFunctionDeclaration] }]
            },
        });
        setChatSession(newChatSession);
    };

    const handleSendMessage = async (input: string) => {
        if (!input.trim() || isChatLoading || !chatSession) return;
        setChatMessages(prev => [...prev, { role: 'user', text: input }]);
        setIsChatLoading(true);

        try {
            const response = await chatSession.sendMessage({ message: input });
            
            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    if (fc.name === 'updateJobPublishingField') {
                        const { fieldName, newValue } = fc.args as any;
                        if (fieldName === 'publicTitle') setPublicJobTitle(newValue);
                        if (fieldName === 'publicDescription') setPublicJobDescription(newValue);
                        if (fieldName === 'publicRequirements') setPublicJobRequirements(newValue);
                        
                        const toolRes = await chatSession.sendMessage({ message: `בוצע, עדכנתי את השדה ${fieldName} כדי שיהיה אטרקטיבי יותר.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || "עודכן." }]);
                    }
                }
            } else {
                setChatMessages(prev => [...prev, { role: 'model', text: response.text || "" }]);
            }
        } catch (e) {
            setChatError("שגיאת AI");
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleFieldStatusChange = (key: string, newStatus: 'mandatory' | 'optional') => {
        setLandingPageFields(prev => prev.map(field => field.key === key ? { ...field, status: newStatus } : field));
    };

    const handleRemoveField = (key: string) => {
        setLandingPageFields(prev => prev.filter(field => field.key !== key));
    };

    const availableFields = allPossibleFields.filter(
        p => !landingPageFields.some(f => f.key === p.key)
    );

    const handleAddField = (field: Omit<LandingPageField, 'status'>) => {
        setLandingPageFields(prev => [...prev, { ...field, status: 'optional' }]);
        setIsAddParamOpen(false);
    };
    
    const handleAddQuestion = () => {
        const newQuestion: ScreeningQuestion = {
            id: Date.now(),
            question: '',
            answerType: 'טקסט חופשי',
            idealAnswer: '',
            isMandatory: false,
            category: 'כללי',
            isPublished: true,
            multipleChoiceOptions: '',
            order: screeningQuestions.length + 1,
        };
        setScreeningQuestions(prev => [...prev, newQuestion]);
    };

    const handleQuestionChange = (index: number, field: keyof ScreeningQuestion, value: any) => {
        const newQuestions = [...screeningQuestions];
        const questionToUpdate = { ...newQuestions[index], [field]: value };

        if (field === 'answerType') {
            if (value === 'Yes/No') questionToUpdate.idealAnswer = 'Yes';
            else questionToUpdate.idealAnswer = '';
        }

        newQuestions[index] = questionToUpdate;
        setScreeningQuestions(newQuestions);
    };

    const handleRemoveQuestion = (index: number) => {
        setScreeningQuestions(prev => prev.filter((_, i) => i !== index));
    };
    
    const handleReorderQuestion = (index: number, direction: 'up' | 'down') => {
        const newQuestions = [...screeningQuestions];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newQuestions.length) return;
        [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
        const reordered = newQuestions.map((q, i) => ({ ...q, order: i + 1 }));
        setScreeningQuestions(reordered);
    };

    const handleCreateLink = () => {
        if (!newLinkSource.trim()) return;
        const newLink = {
            id: Date.now(),
            source: newLinkSource,
            url: `https://hiro.co.il/jobs/${jobId}?src=${newLinkSource.toLowerCase().replace(/\s/g, '_')}`,
            views: 0,
            applicants: 0
        };
        setTrackingLinks(prev => [newLink, ...prev]);
        setNewLinkSource('');
    };

    const handleRemoveLink = (id: number) => {
        setTrackingLinks(prev => prev.filter(link => link.id !== id));
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(publishingCode).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    // Share Handlers
    const handleShareWhatsapp = (url: string, title: string) => {
        const text = encodeURIComponent(`משרה חדשה מעניינת: ${title}\n${url}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const handleShareEmail = (url: string, title: string) => {
        const subject = encodeURIComponent(`משרה חדשה: ${title}`);
        const body = encodeURIComponent(`היי,\n\nנתקלתי במשרה הזו שעשויה לעניין אותך:\n${title}\n\nלפרטים נוספים והגשה:\n${url}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    };

    const handleShareLinkedin = (url: string) => {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
    };
    
    const handleSourceClick = (sourceName: string) => {
        setSelectedSourceFilter(sourceName);
        if (candidatesTableRef.current) {
            candidatesTableRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const filteredCandidates = useMemo(() => {
        if (!selectedSourceFilter) return mockSourceCandidates;
        return mockSourceCandidates.filter(c => c.source === selectedSourceFilter);
    }, [selectedSourceFilter]);

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20 relative animate-fade-in">
             <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">פרסום משרה: {job.jobTitle}</h1>
                    <p className="text-sm text-text-muted">הגדר את עמוד הנחיתה, שאלות הסינון וקישורי המעקב עבור המשרה.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => { initializeChat(); setIsChatOpen(true); }}
                        className="flex items-center gap-2 bg-white text-primary-600 border border-primary-100 font-bold py-2 px-4 rounded-lg hover:bg-primary-50 transition shadow-sm"
                    >
                        <SparklesIcon className="w-5 h-5" />
                        <span>ייעוץ AI לפרסום</span>
                    </button>
                    <button onClick={() => navigate(-1)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center gap-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>חזור למשרה</span>
                    </button>
                </div>
            </header>

            <AccordionSection title="פרטי משרה לפרסום" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-text-muted">קוד לפרסום</label>
                        <div 
                            onClick={handleCopyCode}
                            className="bg-bg-subtle border border-border-default rounded-md p-1.5 flex items-center gap-2 cursor-pointer group hover:bg-primary-50 hover:border-primary-300 transition"
                        >
                            <span className="font-mono font-semibold text-sm text-text-default tracking-widest">{publishingCode}</span>
                            {copySuccess ? (
                                <CheckIcon className="w-4 h-4 text-green-500" />
                            ) : (
                                <ClipboardDocumentIcon className="w-4 h-4 text-text-subtle group-hover:text-primary-600" />
                            )}
                        </div>
                    </div>
                     {copySuccess && <p className="text-xs text-green-600 -mt-2 text-left animate-fade-in">הקוד הועתק!</p>}

                    <div>
                        <label className="block text-base font-bold text-text-default mb-2">כותרת משרה (לפרסום)</label>
                        <input 
                            type="text" 
                            value={publicJobTitle}
                            onChange={(e) => setPublicJobTitle(e.target.value)}
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        />
                    </div>
                    
                     <div>
                        <label className="block text-base font-bold text-text-default mb-2">תיאור משרה (לפרסום)</label>
                        <textarea 
                            value={publicJobDescription}
                            onChange={(e) => setPublicJobDescription(e.target.value)}
                            rows={6}
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        />
                    </div>

                     <div>
                        <label className="block text-base font-bold text-text-default mb-2">דרישות (לפרסום)</label>
                        <textarea 
                            value={publicJobRequirements}
                            onChange={(e) => setPublicJobRequirements(e.target.value)}
                            rows={4}
                            placeholder="כל דרישה בשורה נפרדת"
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        />
                    </div>
                </div>
            </AccordionSection>

            <AccordionSection title="ערוצי פרסום" icon={<PaperAirplaneIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-3">
                    <ToggleSwitch 
                        label="פרסם בלוח המשרות הכללי"
                        name="publishToBoard"
                        checked={publishToGeneralBoard}
                        onChange={(e) => setPublishToGeneralBoard(e.target.checked)}
                    />
                </div>
            </AccordionSection>

            <AccordionSection title="הגדרות עמוד הנחיתה" icon={<SparklesIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-3">
                    {landingPageFields.map(field => (
                        <div key={field.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-bg-subtle/70 p-2 rounded-lg">
                            <span className="font-semibold text-text-default text-sm">{field.label}</span>
                            <div className="flex items-center bg-bg-card p-1 rounded-md border border-border-default">
                                <button onClick={() => handleFieldStatusChange(field.key, 'mandatory')} className={`px-3 py-0.5 text-xs rounded ${field.status === 'mandatory' ? 'bg-primary-500 text-white' : 'text-text-muted'}`}>חובה</button>
                                <button onClick={() => handleFieldStatusChange(field.key, 'optional')} className={`px-3 py-0.5 text-xs rounded ${field.status === 'optional' ? 'bg-primary-500 text-white' : 'text-text-muted'}`}>רשות</button>
                            </div>
                            <button onClick={() => handleRemoveField(field.key)} className="p-2 text-text-subtle hover:text-red-600 rounded-full hover:bg-red-50"><TrashIcon className="w-4 h-4"/></button>
                        </div>
                    ))}
                    <div className="relative" ref={addParamRef}>
                        <button onClick={() => setIsAddParamOpen(!isAddParamOpen)} className="w-full flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-200 transition">
                            <PlusIcon className="w-5 h-5" />
                            <span>הוסף שדה</span>
                        </button>
                        {isAddParamOpen && availableFields.length > 0 && (
                             <div className="absolute bottom-full mb-2 w-full bg-bg-card border border-border-default rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                                {availableFields.map(field => (
                                    <button key={field.key} onClick={() => handleAddField(field)} className="w-full text-right px-4 py-2 text-sm hover:bg-bg-hover">{field.label}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </AccordionSection>
            
            <AccordionSection title="שאלות סינון למועמדים" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-4">
                    {screeningQuestions.map((q, index) => (
                        <div key={q.id} className="bg-bg-subtle/50 p-4 rounded-lg border border-border-default space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-text-default">שאלה #{index + 1}</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => handleReorderQuestion(index, 'up')} disabled={index === 0} className="p-1.5 text-text-muted hover:text-text-default disabled:opacity-30"><ChevronUpIcon className="w-4 h-4"/></button>
                                    <button type="button" onClick={() => handleReorderQuestion(index, 'down')} disabled={index === screeningQuestions.length - 1} className="p-1.5 text-text-muted hover:text-text-default disabled:opacity-30"><ChevronDownIcon className="w-4 h-4"/></button>
                                    <button type="button" onClick={() => handleRemoveQuestion(index)} className="p-1.5 text-red-500 hover:text-red-700"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <textarea value={q.question} onChange={e => handleQuestionChange(index, 'question', e.target.value)} rows={2} placeholder="הזן את שאלת הסינון..." className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <select name="answerType" value={q.answerType} onChange={e => handleQuestionChange(index, 'answerType', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option value="טקסט חופשי">טקסט חופשי</option>
                                    <option value="Yes/No">Yes/No</option>
                                    <option value="בחירה מרובה">בחירה מרובה</option>
                                </select>
                                
                                <div className="flex items-end gap-2">
                                    {q.answerType === 'Yes/No' && ( <select name="idealAnswer" value={q.idealAnswer} onChange={e => handleQuestionChange(index, 'idealAnswer', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"><option>Yes</option><option>No</option></select> )}
                                    {q.answerType === 'טקסט חופשי' && <input name="idealAnswer" value={q.idealAnswer} onChange={e => handleQuestionChange(index, 'idealAnswer', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" placeholder="תשובה אידיאלית (אופציונלי)" />}
                                    {q.answerType === 'בחירה מרובה' && (
                                        <div className="flex-grow space-y-2">
                                            <input name="multipleChoiceOptions" value={q.multipleChoiceOptions} onChange={e => handleQuestionChange(index, 'multipleChoiceOptions', e.target.value)} placeholder="אפשרויות (מופרד בפסיק)" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                                            <input name="idealAnswer" value={q.idealAnswer} onChange={e => handleQuestionChange(index, 'idealAnswer', e.target.value)} placeholder="תשובה אידיאלית" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                                        </div>
                                    )}
                                </div>

                                <select name="category" value={q.category} onChange={e => handleQuestionChange(index, 'category', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option>כללי</option> <option>שעות עבודה</option> <option>שכר</option> <option>ניסיון</option> <option>השכלה</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <label className="flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" name="isMandatory" checked={q.isMandatory} onChange={e => handleQuestionChange(index, 'isMandatory', e.target.checked)} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 bg-bg-input" /><span className="text-sm font-semibold text-text-muted">תנאי חובה</span></label>
                                <label className="flex items-center gap-2 text-sm font-medium text-text-default cursor-pointer flex-shrink-0" title="הצג שאלה זו בטופס הגשת המועמדות"><input type="checkbox" checked={q.isPublished} onChange={e => handleQuestionChange(index, 'isPublished', e.target.checked)} className="w-4 h-4 text-primary-600 bg-bg-card border-border-default rounded focus:ring-primary-500" /><span>פרסם</span></label>
                            </div>
                        </div>
                    ))}
                    <button type="button" onClick={handleAddQuestion} className="w-full flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-200 transition">
                        <PlusIcon className="w-5 h-5" />
                        <span>הוסף שאלה חדשה</span>
                    </button>
                </div>
            </AccordionSection>

            <AccordionSection title="קישורים וסטטיסטיקה של דפי פרסום למשרה זו" icon={<LinkIcon className="w-5 h-5"/>} defaultOpen>
                 <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                    <input 
                        type="text" 
                        value={newLinkSource}
                        onChange={(e) => setNewLinkSource(e.target.value)}
                        placeholder="שם מקור הגיוס (לדוגמה: קמפיין פייסבוק יולי)..." 
                        className="flex-grow w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"
                    />
                    <button onClick={handleCreateLink} className="w-full sm:w-auto bg-primary-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-600 transition flex items-center justify-center gap-2">
                        <PlusIcon className="w-5 h-5"/>
                        <span>יצירת קישור</span>
                    </button>
                </div>
                
                {trackingLinks.length > 0 && (
                    <div className="border border-border-default rounded-lg overflow-hidden">
                         <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right min-w-[700px]">
                                <thead className="bg-bg-subtle text-text-muted font-semibold border-b border-border-default">
                                    <tr>
                                        <th className="px-4 py-3">מקור גיוס</th>
                                        <th className="px-4 py-3 text-center">כניסות</th>
                                        <th className="px-4 py-3 text-center">הגשות</th>
                                        <th className="px-4 py-3 text-center">אחוז המרה</th>
                                        <th className="px-4 py-3 text-center">פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {trackingLinks.map(link => {
                                        const conversionRate = link.views > 0 ? ((link.applicants / link.views) * 100).toFixed(1) : '0.0';
                                        return (
                                            <tr key={link.id} className="bg-bg-card hover:bg-bg-hover transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-text-default">{link.source}</div>
                                                    <div className="text-xs text-text-muted font-mono truncate max-w-[200px]" title={link.url}>{link.url}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <EyeIcon className="w-4 h-4 text-text-subtle" />
                                                        <span className="font-bold">{link.views}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                     <button 
                                                        className="flex items-center justify-center gap-1.5 hover:text-primary-600 transition-colors"
                                                        onClick={() => handleSourceClick(link.source)}
                                                        title="צפה במועמדים"
                                                     >
                                                        <UserGroupIcon className="w-4 h-4 text-text-subtle" />
                                                        <span className="font-bold underline decoration-dotted">{link.applicants}</span>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <div className="w-16 bg-bg-subtle rounded-full h-1.5 overflow-hidden">
                                                            <div className={`h-full rounded-full ${Number(conversionRate) > 10 ? 'bg-green-500' : Number(conversionRate) > 5 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{width: `${Math.min(Number(conversionRate), 100)}%`}}></div>
                                                        </div>
                                                        <span className="text-xs font-semibold">{conversionRate}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center items-center gap-1">
                                                        <button 
                                                            onClick={() => navigator.clipboard.writeText(link.url)} 
                                                            title="העתק קישור"
                                                            className="p-1.5 text-text-subtle hover:text-primary-600 rounded-md hover:bg-primary-50 transition"
                                                        >
                                                            <ClipboardDocumentIcon className="w-4 h-4"/>
                                                            <span className="sr-only">העתק</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleShareWhatsapp(link.url, publicJobTitle)} 
                                                            title="שתף ב-WhatsApp"
                                                            className="p-1.5 text-text-subtle hover:text-[#25D366] rounded-md hover:bg-green-50 transition"
                                                        >
                                                            <WhatsappIcon className="w-4 h-4"/>
                                                        </button>
                                                         <button 
                                                            onClick={() => handleShareLinkedin(link.url)} 
                                                            title="שתף ב-LinkedIn"
                                                            className="p-1.5 text-text-subtle hover:text-[#0077b5] rounded-md hover:bg-blue-50 transition"
                                                        >
                                                            <ShareIcon className="w-4 h-4"/>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleShareEmail(link.url, publicJobTitle)} 
                                                            title="שתף במייל"
                                                            className="p-1.5 text-text-subtle hover:text-primary-600 rounded-md hover:bg-primary-50 transition"
                                                        >
                                                            <EnvelopeIcon className="w-4 h-4"/>
                                                        </button>
                                                        <div className="w-px h-4 bg-border-subtle mx-1"></div>
                                                        <button onClick={() => handleRemoveLink(link.id)} title="מחק קישור" className="p-1.5 text-text-subtle hover:text-red-600 rounded-md hover:bg-red-50 transition">
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {/* Total Row */}
                                    <tr className="bg-bg-subtle font-bold border-t-2 border-border-default">
                                        <td className="px-4 py-3 text-text-default">סה"כ</td>
                                        <td className="px-4 py-3 text-center">{trackingLinks.reduce((acc, curr) => acc + curr.views, 0)}</td>
                                        <td className="px-4 py-3 text-center">{trackingLinks.reduce((acc, curr) => acc + curr.applicants, 0)}</td>
                                        <td className="px-4 py-3 text-center">
                                            {(() => {
                                                const totalViews = trackingLinks.reduce((acc, curr) => acc + curr.views, 0);
                                                const totalApplicants = trackingLinks.reduce((acc, curr) => acc + curr.applicants, 0);
                                                return totalViews > 0 ? ((totalApplicants / totalViews) * 100).toFixed(1) + '%' : '0.0%';
                                            })()}
                                        </td>
                                        <td className="px-4 py-3"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </AccordionSection>

            {/* Candidates from Sources Section */}
            <div ref={candidatesTableRef}>
                <AccordionSection 
                    title={selectedSourceFilter ? `מועמדים שהגיעו מ: ${selectedSourceFilter}` : "כל המועמדים ממקורות פרסום"}
                    icon={<UserGroupIcon className="w-5 h-5"/>} 
                >
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-2">
                                <FunnelIcon className="w-4 h-4 text-text-muted" />
                                <span className="text-sm text-text-muted">
                                    {selectedSourceFilter ? 'מסונן לפי מקור' : 'מציג הכל'}
                                </span>
                                {selectedSourceFilter && (
                                    <button 
                                        onClick={() => setSelectedSourceFilter(null)}
                                        className="text-xs font-semibold text-primary-600 hover:underline"
                                    >
                                        (נקה סינון)
                                    </button>
                                )}
                             </div>
                             <span className="text-sm font-bold text-text-default">{filteredCandidates.length} מועמדים</span>
                        </div>

                        {filteredCandidates.length > 0 ? (
                            <div className="border border-border-default rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-bg-subtle text-text-muted font-semibold">
                                        <tr>
                                            <th className="px-4 py-3">שם</th>
                                            <th className="px-4 py-3">עיר</th>
                                            <th className="px-4 py-3">מקור</th>
                                            <th className="px-4 py-3">תאריך</th>
                                            <th className="px-4 py-3">סטטוס</th>
                                            <th className="px-4 py-3">התאמה</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {filteredCandidates.map(candidate => (
                                            <tr key={candidate.id} className="bg-bg-card hover:bg-bg-hover transition-colors">
                                                <td className="px-4 py-3 font-semibold text-primary-700">{candidate.name}</td>
                                                <td className="px-4 py-3 text-text-default">{candidate.city}</td>
                                                <td className="px-4 py-3 text-text-muted">{candidate.source}</td>
                                                <td className="px-4 py-3 text-text-muted">{candidate.date}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${candidate.status === 'חדש' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                                        {candidate.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-text-default">{candidate.matchScore}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center p-8 bg-bg-subtle/50 rounded-lg text-text-muted">
                                לא נמצאו מועמדים {selectedSourceFilter ? `עבור המקור: ${selectedSourceFilter}` : ''}
                            </div>
                        )}
                    </div>
                </AccordionSection>
            </div>

            {/* Floating AI Button for Publishing View */}
            <div className="fixed bottom-8 left-8 z-40">
                <button
                    onClick={() => { initializeChat(); setIsChatOpen(true); }}
                    className="w-14 h-14 bg-primary-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-primary-700 transition-all transform hover:scale-110 hover:rotate-3 group"
                >
                    <SparklesIcon className="w-7 h-7 group-hover:animate-pulse" />
                </button>
            </div>

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                messages={chatMessages}
                isLoading={isChatLoading}
                error={chatError}
                onSendMessage={handleSendMessage}
                onReset={() => { setChatSession(null); setChatMessages([]); initializeChat(); }}
            />
        </div>
    );
};

export default PublishJobView;
