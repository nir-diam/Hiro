
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GoogleGenAI, Chat, GenerateContentResponse, FunctionDeclaration, Type } from '@google/genai';
import JobDetailsSidebar from './JobDetailsSidebar';
import NewJobView from './NewJobView';
import { 
    PencilIcon, ClockIcon, UserGroupIcon, ChevronDownIcon, SparklesIcon, 
    UserPlusIcon, ArrowLeftIcon, ChartBarIcon, FunnelIcon, ShareIcon,
    CheckCircleIcon, ExclamationTriangleIcon, FireIcon, ChevronUpIcon
} from './Icons';
import JobCandidatesView from './JobCandidatesView';
import JobEventsView, { mockJobEvents as initialJobEvents, JobEvent } from './JobEventsView';
import { mockExistingJob, mockJobCandidates } from '../data/mockJobData';
import HiroAIChat from './HiroAIChat';
import InviteManagerModal from './InviteManagerModal';

interface Message {
    role: 'user' | 'model';
    text: string;
}

// AI Tools Definitions
const updateJobFieldFunctionDeclaration: FunctionDeclaration = {
  name: 'updateJobField',
  parameters: {
    type: Type.OBJECT,
    description: 'Update a specific internal field in the job details.',
    properties: {
      fieldName: { type: Type.STRING, description: 'The field to update (title, salaryMax, salaryMin, status, priority).' },
      newValue: { type: Type.STRING, description: 'The new value for the field.' },
    },
    required: ['fieldName', 'newValue'],
  },
};

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

const createJobEventFunctionDeclaration: FunctionDeclaration = {
  name: 'createJobEvent',
  parameters: {
    type: Type.OBJECT,
    description: 'Create a new event or note in the job journal.',
    properties: {
      description: { type: Type.STRING, description: 'The description of the event or note content.' },
    },
    required: ['description'],
  },
};

interface ExistingJobViewProps {
  onCancel: () => void;
  onSave: (jobData: any) => void;
  openSummaryDrawer: (candidateId: number) => void;
}

const ExistingJobView: React.FC<ExistingJobViewProps> = ({ onCancel, onSave, openSummaryDrawer }) => {
    const [mainView, setMainView] = useState<'edit' | 'events' | 'candidates'>('candidates');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(window.innerWidth >= 1024);
    
    const { jobId } = useParams<{ jobId?: string }>();
    const navigate = useNavigate();

    const [jobDataState, setJobDataState] = useState(mockExistingJob);
    const [jobEvents, setJobEvents] = useState(initialJobEvents);

    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setIsSidebarExpanded(true);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const initializeChat = () => {
        if (chatSession) return;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const contextData = { job: jobDataState, candidatesCount: mockJobCandidates.length, eventsCount: jobEvents.length };
        const systemInstruction = `You are Hiro AI, a brilliant recruitment strategist. You are helping manage the job "${jobDataState.title}". 
        You have three primary superpowers:
        1. Update internal job details (salary, status, priority).
        2. Refine marketing content for the public landing page (public title, description, requirements).
        3. Create notes and events in the job's activity journal.
        Always confirm actions to the user in a professional recruitment tone in Hebrew.
        Context: ${JSON.stringify(contextData)}`;
        
        const newChatSession = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: { 
                systemInstruction,
                tools: [{ 
                    functionDeclarations: [
                        updateJobFieldFunctionDeclaration, 
                        updateJobPublishingFieldFunctionDeclaration,
                        createJobEventFunctionDeclaration
                    ] 
                }]
            },
        });
        setChatSession(newChatSession);
    };

    const handleOpenChat = () => {
        initializeChat();
        setIsChatOpen(true);
    };

    const handleSendMessage = async (input: string) => {
        if (!input.trim() || isChatLoading || !chatSession) return;
        setChatMessages(prev => [...prev, { role: 'user', text: input }]);
        setIsChatLoading(true);

        try {
            const response = await chatSession.sendMessage({ message: input });
            
            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    if (fc.name === 'updateJobField' || fc.name === 'updateJobPublishingField') {
                        const { fieldName, newValue } = fc.args as any;
                        setJobDataState(prev => ({ ...prev, [fieldName]: newValue }));
                        const toolRes = await chatSession.sendMessage({ message: `בוצע, עדכנתי את השדה ${fieldName} לערך החדש.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || "עודכן." }]);
                    }
                    if (fc.name === 'createJobEvent') {
                        const { description } = fc.args as any;
                        // NEW: Actually update the local events state
                        const newEvent: JobEvent = {
                            id: Date.now(),
                            type: 'note',
                            user: 'Hiro AI',
                            description: description,
                            timestamp: new Date().toISOString()
                        };
                        setJobEvents(prev => [newEvent, ...prev]);
                        const toolRes = await chatSession.sendMessage({ message: `רשמתי את ההערה ביומן המשרה.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || "האירוע נוסף ליומן." }]);
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

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 animate-fade-in relative">
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
            `}</style>

            {/* Header Area - Compact Version */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-gradient-to-l from-primary-600 to-primary-700 p-5 rounded-2xl text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 text-center md:text-right">
                    <div className="flex-shrink-0">
                        <div className="bg-white/20 text-white text-[10px] font-black px-2.5 py-1 rounded-lg backdrop-blur-md uppercase tracking-widest border border-white/20 mb-1 inline-block">
                             ID: {jobDataState.id}
                        </div>
                        <h1 className="text-2xl font-black tracking-tight leading-none">{jobDataState.title}</h1>
                    </div>
                    <div className="h-8 w-px bg-white/20 hidden md:block mx-2"></div>
                    <div className="flex flex-col items-center md:items-start">
                        <p className="text-primary-100 text-sm font-bold opacity-90">{jobDataState.client}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-primary-200">{jobDataState.location.split(',')[0]}</span>
                            <div className="flex items-center gap-1 bg-amber-400 text-amber-900 text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm">
                                <FireIcon className="w-2.5 h-2.5" /> {jobDataState.priority}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 relative z-10 w-full md:w-auto">
                    <button 
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex-1 md:flex-none bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold py-2 px-5 rounded-xl transition-all flex items-center justify-center gap-2 backdrop-blur-md text-sm"
                    >
                        <UserPlusIcon className="w-4 h-4" />
                        שתף מנהל
                    </button>
                    <button 
                        onClick={handleOpenChat}
                        className="flex-1 md:flex-none bg-white text-primary-700 font-bold py-2 px-6 rounded-xl hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <SparklesIcon className="w-4 h-4" />
                        התייעץ עם Hiro
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Stats Column (Left - 3 cols) */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-0 overflow-hidden">
                        <button 
                            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                            className="w-full flex items-center justify-between p-5 text-right outline-none lg:cursor-default"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
                                    <ChartBarIcon className="w-5 h-5" />
                                </div>
                                <h3 className="font-bold text-sm text-text-default">מבט מהיר</h3>
                            </div>
                            <div className="lg:hidden">
                                {isSidebarExpanded ? <ChevronUpIcon className="w-5 h-5 text-text-muted" /> : <ChevronDownIcon className="w-5 h-5 text-text-muted" />}
                            </div>
                        </button>
                        
                        {(isSidebarExpanded || window.innerWidth >= 1024) && (
                            <div className="p-5 pt-0 space-y-5 animate-fade-in">
                                <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                                    <div className="p-3 bg-bg-subtle rounded-xl border border-border-subtle">
                                        <p className="text-[10px] font-bold text-text-muted mb-0.5 uppercase">מועמדים</p>
                                        <p className="text-2xl font-black text-primary-600">{mockJobCandidates.length}</p>
                                    </div>
                                    <div className="p-3 bg-bg-subtle rounded-xl border border-border-subtle">
                                        <p className="text-[10px] font-bold text-text-muted mb-0.5 uppercase">ימים באוויר</p>
                                        <p className="text-2xl font-black text-text-default">14</p>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <JobDetailsSidebar job={jobDataState} openSummaryDrawer={openSummaryDrawer} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Operations Column (Center - 9 cols) */}
                <div className="lg:col-span-9 space-y-6">
                    <div className="bg-bg-card/80 backdrop-blur-md rounded-xl border border-border-default p-1.5 flex items-center gap-2 shadow-sm">
                        <button 
                            onClick={() => setMainView('candidates')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mainView === 'candidates' ? 'bg-primary-600 text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'}`}
                        >
                            <UserGroupIcon className="w-5 h-5" />
                            מועמדים
                        </button>
                        <button 
                            onClick={() => setMainView('edit')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mainView === 'edit' ? 'bg-primary-600 text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'}`}
                        >
                            <PencilIcon className="w-5 h-5" />
                            ערוך משרה
                        </button>
                        <button 
                            onClick={() => setMainView('events')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mainView === 'events' ? 'bg-primary-600 text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'}`}
                        >
                            <ClockIcon className="w-5 h-5" />
                            יומן אירועים
                        </button>
                    </div>

                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm min-h-[600px]">
                        {mainView === 'candidates' && <JobCandidatesView openSummaryDrawer={openSummaryDrawer} jobId={jobDataState.id} />}
                        {mainView === 'edit' && <div className="p-6"><NewJobView onCancel={() => setMainView('candidates')} onSave={onSave} isEditing={true} jobData={jobDataState} isEmbedded={true} /></div>}
                        {mainView === 'events' && <JobEventsView externalEvents={jobEvents} onAddEvent={(e) => setJobEvents(prev => [e, ...prev])} />}
                    </div>
                </div>
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
            
            <InviteManagerModal 
                isOpen={isInviteModalOpen}
                onClose={() => setIsInviteModalOpen(false)}
                onInvite={(d) => alert('הזמנה נשלחה')}
                jobTitle={jobDataState.title}
            />

             {/* Only show floating button if chat is closed */}
            {!isChatOpen && (
                <div className="fixed bottom-8 left-8 z-40">
                    <button
                        onClick={handleOpenChat}
                        className="w-14 h-14 bg-primary-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-primary-700 transition-all transform hover:scale-110 hover:rotate-3 group"
                    >
                        <SparklesIcon className="w-7 h-7 group-hover:animate-pulse" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExistingJobView;
