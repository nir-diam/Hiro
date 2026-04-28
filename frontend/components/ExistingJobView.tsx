
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
import JobEventsView, { getJobEventApiHeaders } from './JobEventsView';
import PublishJobView from './PublishJobView';
import { mockExistingJob, mockJobCandidates } from '../data/mockJobData';
import HiroAIChat from './HiroAIChat';
import InviteManagerModal from './InviteManagerModal';
import { useLanguage } from '../context/LanguageContext';

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
    const { t } = useLanguage();
    const [mainView, setMainView] = useState<'edit' | 'events' | 'candidates' | 'publish'>('edit');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(window.innerWidth >= 1024);
    
    const { jobId } = useParams<{ jobId?: string }>();
    const navigate = useNavigate();

    const [apiBase] = useState(import.meta.env.VITE_API_BASE || '');
    const [jobDataState, setJobDataState] = useState(mockExistingJob);
    const [jobLoading, setJobLoading] = useState(true);
    const [jobError, setJobError] = useState<string | null>(null);
    const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

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

    useEffect(() => {
        if (!jobId) {
            setJobLoading(false);
            return;
        }
        let active = true;
        (async () => {
            try {
                setJobLoading(true);
                setJobError(null);
                const res = await fetch(`${apiBase}/api/jobs/${jobId}`);
                if (!res.ok) {
                    throw new Error(res.statusText || 'Failed to load job');
                }
                const data = await res.json();
                if (active) {
                    setJobDataState(data);
                }
            } catch (err: any) {
                console.error('[ExistingJobView] failed to load job', err);
                if (active) {
                    setJobError(err?.message || 'Failed to load job');
                }
            } finally {
                if (active) setJobLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [apiBase, jobId]);

    const initializeChat = () => {
        if (chatSession) return;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const contextData = { job: jobDataState, candidatesCount: mockJobCandidates.length, eventsCount: 0 };
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
                        const { description } = fc.args as { description: string };
                        if (jobId && apiBase) {
                            try {
                                const res = await fetch(
                                    `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/events`,
                                    {
                                        method: 'POST',
                                        headers: getJobEventApiHeaders(true),
                                        body: JSON.stringify({
                                            type: ['הערה'],
                                            date: new Date().toISOString(),
                                            description: String(description || ''),
                                            status: 'עתידי',
                                            history: [
                                                {
                                                    user: 'אני',
                                                    timestamp: new Date().toISOString(),
                                                    summary: 'יצר את האירוע',
                                                },
                                            ],
                                        }),
                                    },
                                );
                                if (res.ok) {
                                    setEventsRefreshKey((k) => k + 1);
                                }
                            } catch (e) {
                                console.error('[ExistingJobView] createJobEvent', e);
                            }
                        }
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

    const handleJobSave = async (jobData: any) => {
        if (!jobId) {
            onSave(jobData);
            return;
        }
        try {
            const res = await fetch(`${apiBase}/api/jobs/${jobId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(jobData),
            });
            if (!res.ok) {
                throw new Error('Update failed');
            }
            const updated = await res.json();
            setJobDataState(updated);
            onSave(updated);
        } catch (err: any) {
            console.error('[ExistingJobView] failed to save job', err);
            alert(err?.message || 'עדכון משרה נכשל');
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 animate-fade-in relative">
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
            `}</style>

            {/* Header: skill tags in one horizontal row (full width scroll), never stacked under each other */}
            <div className="flex flex-col gap-2.5 bg-gradient-to-l from-primary-600 to-primary-700 p-3 sm:gap-3 sm:p-4 md:p-5 rounded-2xl text-white shadow-lg relative overflow-hidden lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-8 -mt-8 blur-2xl pointer-events-none sm:w-32 sm:h-32 sm:-mr-10 sm:-mt-10" aria-hidden />
                <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-2 text-right">
                    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-start md:gap-3 lg:gap-4">
                        <div className="min-w-0 shrink-0 md:max-w-[min(100%,28rem)]">
                        <div
                            className="mb-1 flex max-w-full items-center gap-1 rounded-lg border border-white/20 bg-white/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-white backdrop-blur-md sm:px-2 sm:py-1 sm:text-[9px] sm:tracking-wider md:text-[10px]"
                            dir="ltr"
                            title={`${t('job.id_prefix')} ${jobDataState.id}`}
                        >
                            <span className="shrink-0">{t('job.id_prefix')}</span>
                            <span className="min-w-0 truncate font-mono text-[7px] sm:text-[8px] md:text-[9px]">
                                {jobDataState.id}
                            </span>
                        </div>
                        <h1 className="text-base font-black leading-snug tracking-tight break-words sm:text-lg md:text-xl lg:text-2xl">
                            {jobDataState.title}
                        </h1>
                        {(jobDataState as any).publicJobTitle ? (
                            <p className="mt-1 max-w-xl text-xs font-semibold leading-snug text-primary-100/95 line-clamp-2 sm:mt-1.5 sm:text-sm sm:line-clamp-none">
                                פרסום: {(jobDataState as any).publicJobTitle}
                            </p>
                        ) : null}
                        </div>
                        <div className="hidden w-px shrink-0 bg-white/20 md:block md:self-stretch md:min-h-0" />
                        <div className="flex min-w-0 flex-1 flex-col items-stretch text-right md:min-h-0">
                        <p className="text-xs font-bold text-primary-100 opacity-90 sm:text-sm">{jobDataState.client}</p>
                        {(jobDataState as any).field || (jobDataState as any).role ? (
                            <p
                                className="mt-0.5 min-w-0 max-w-full truncate text-[11px] leading-snug text-primary-200/90 sm:mt-1 sm:text-xs"
                                title={
                                    [
                                        (jobDataState as any).field ? `תחום: ${(jobDataState as any).field}` : '',
                                        (jobDataState as any).role ? `תפקיד: ${(jobDataState as any).role}` : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' · ') || undefined
                                }
                            >
                                {(jobDataState as any).field ? <>תחום: {(jobDataState as any).field}</> : null}
                                {(jobDataState as any).field && (jobDataState as any).role ? ' · ' : null}
                                {(jobDataState as any).role ? <>תפקיד: {(jobDataState as any).role}</> : null}
                            </p>
                        ) : null}
                            <div className="mt-1 flex flex-nowrap items-center gap-1.5 sm:mt-1.5 sm:gap-2">
                                <span className="text-[10px] text-primary-200 sm:text-[11px]">
                                    {jobDataState.location.split(',')[0]}
                                </span>
                                <div className="flex items-center gap-0.5 rounded bg-amber-400 px-1 py-0.5 text-[8px] font-black text-amber-900 shadow-sm sm:gap-1 sm:px-1.5 sm:text-[9px]">
                                    <FireIcon className="h-2 w-2 shrink-0 sm:h-2.5 sm:w-2.5" /> {t(`priority.${jobDataState.priority}`)}
                                </div>
                            </div>
                        </div>
                    </div>
                    {Array.isArray((jobDataState as any).skills) && (jobDataState as any).skills.length > 0 ? (
                        <div className="-mx-0.5 flex w-full min-w-0 flex-row flex-nowrap items-center gap-1 overflow-x-auto overflow-y-hidden px-0.5 py-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] sm:gap-1.5">
                            {(jobDataState as any).skills.map((s: any) => {
                                const tip = [
                                    s.tagType ? `סוג: ${s.tagType}` : null,
                                    s.mode || s.aiMode ? `מצב: ${s.mode || s.aiMode}` : null,
                                    s.relevance_score != null ? `ציון: ${s.relevance_score}` : null,
                                    s.tag_reason ? `נימוק: ${s.tag_reason}` : null,
                                ]
                                    .filter(Boolean)
                                    .join('\n');
                                return (
                                    <span
                                        key={s.id || s.key || s.name}
                                        title={tip || s.name}
                                        className="max-w-[10rem] shrink-0 rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-white sm:max-w-[11rem] sm:text-[10px]"
                                    >
                                        <span className="block truncate">{s.name}</span>
                                    </span>
                                );
                            })}
                        </div>
                    ) : null}
                </div>

                <div className="relative z-10 flex w-full shrink-0 flex-row items-stretch gap-1.5 lg:w-auto lg:gap-2">
                    <button
                        type="button"
                        onClick={() => setIsInviteModalOpen(true)}
                        className="flex min-h-0 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-[11px] font-bold leading-tight text-white backdrop-blur-md transition-all hover:bg-white/20 active:bg-white/25 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm lg:flex-none lg:px-5"
                    >
                        <UserPlusIcon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                        <span className="text-center">{t('job.invite_manager')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenChat}
                        className="flex min-h-0 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-white px-2 py-2 text-[11px] font-bold leading-tight text-primary-700 shadow-sm transition-all hover:shadow-lg active:scale-[0.99] sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm sm:hover:scale-[1.02] lg:flex-none lg:px-6"
                    >
                        <SparklesIcon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                        <span className="text-center">{t('job.consult_hiro')}</span>
                    </button>
                </div>
            </div>

            {(() => {
                const pubDesc = (jobDataState as any).PublicDescription || (jobDataState as any).publicDescription;
                if (!pubDesc || !String(pubDesc).trim()) return null;
                return (
                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-5" dir="rtl">
                        <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide mb-2">תיאור פרסום (חיצוני)</h2>
                        <div
                            className="text-sm text-text-default prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{
                                __html: String(pubDesc).includes('<')
                                    ? String(pubDesc)
                                    : String(pubDesc).replace(/\n/g, '<br />'),
                            }}
                        />
                    </div>
                );
            })()}

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
                                <h3 className="font-bold text-sm text-text-default">{t('job.quick_look')}</h3>
                            </div>
                            <div className="lg:hidden">
                                {isSidebarExpanded ? <ChevronUpIcon className="w-5 h-5 text-text-muted" /> : <ChevronDownIcon className="w-5 h-5 text-text-muted" />}
                            </div>
                        </button>
                        
                        {(isSidebarExpanded || window.innerWidth >= 1024) && (
                            <div className="p-5 pt-0 space-y-5 animate-fade-in">
                                <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                                    <div className="p-3 bg-bg-subtle rounded-xl border border-border-subtle">
                                        <p className="text-[10px] font-bold text-text-muted mb-0.5 uppercase">{t('nav.candidates')}</p>
                                        <p className="text-2xl font-black text-primary-600">{mockJobCandidates.length}</p>
                                    </div>
                                    <div className="p-3 bg-bg-subtle rounded-xl border border-border-subtle">
                                        <p className="text-[10px] font-bold text-text-muted mb-0.5 uppercase">{t('job.days_on_air')}</p>
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
                            {t('job.tab_candidates')}
                        </button>
                        <button 
                            onClick={() => setMainView('edit')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mainView === 'edit' ? 'bg-primary-600 text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'}`}
                        >
                            <PencilIcon className="w-5 h-5" />
                            {t('job.tab_edit')}
                        </button>
                        <button 
                            onClick={() => setMainView('events')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mainView === 'events' ? 'bg-primary-600 text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'}`}
                        >
                            <ClockIcon className="w-5 h-5" />
                            {t('job.tab_journal')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMainView('publish')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${mainView === 'publish' ? 'bg-primary-600 text-white shadow-md' : 'text-text-muted hover:bg-bg-hover'}`}
                        >
                            { 'פרסום משרה'}
                        </button>
                    </div>

                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm min-h-[600px]">
                        {mainView === 'candidates' && <JobCandidatesView openSummaryDrawer={openSummaryDrawer} jobId={jobDataState.id} />}
                        {mainView === 'edit' && (
                            <div className="p-6">
                                <NewJobView
                                    onCancel={() => setMainView('candidates')}
                                    onSave={handleJobSave}
                                    isEditing={true}
                                    jobData={jobDataState}
                                    isEmbedded={true}
                                />
                            </div>
                        )}
                        {mainView === 'events' && (
                            <JobEventsView jobId={jobId} eventsRefreshKey={eventsRefreshKey} />
                        )}
                        {mainView === 'publish' && (
                            <div className="p-6">
                                <PublishJobView job={jobDataState} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
            />
            
            <InviteManagerModal 
                isOpen={isInviteModalOpen}
                onClose={() => setIsInviteModalOpen(false)}
                onInvite={(d) => alert('הזמנה נשלחה')}
                jobTitle={jobDataState.title}
                contacts={(jobDataState?.contacts || []).map((c) => ({
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    role: c.role,
                }))}
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
