
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRoutes, Navigate, useParams, Outlet } from 'react-router-dom';
import { GoogleGenAI, Chat, GenerateContentResponse, FunctionDeclaration, Type } from '@google/genai';

// Import all page components
import CandidatesListView, { candidatesData } from './components/CandidatesListView';
import NewCandidateViewV2 from './components/NewCandidateViewV2';
import JobsView from './components/JobsView';
import NewJobView from './components/NewJobView';
import ExistingJobView from './components/ExistingJobView';
import JobEventsView from './components/JobEventsView';
import ClientsListView from './components/ClientsListView';
import NewClientView from './components/NewClientView';
import ClientProfileView from './components/ClientProfileView';
import LoginScreen from './components/LoginScreen';
import NotificationCenter from './components/NotificationCenter';
import CompanySettingsView from './components/CompanySettingsView';
import CoordinatorsSettingsView from './components/CoordinatorsSettingsView';
import CoordinatorProfileView from './components/CoordinatorProfileView';
import AdminLayout from './components/AdminLayout';
import AdminClientsView from './components/AdminClientsView';
import AdminJobsView from './components/AdminJobsView';
import AdminCandidatesView from './components/AdminCandidatesView';
import AdminCandidateProfileView from './components/AdminCandidateProfileView';
import AdminClientFormView from './components/AdminClientFormView';
import MessageTemplatesView from './components/MessageTemplatesView';
import EventTypesSettingsView from './components/EventTypesSettingsView';
import RecruitmentSourcesSettingsView from './components/RecruitmentSourcesSettingsView';
import CandidatePoolView from './components/CandidatePoolView';
import ReferralsReportView from './components/ReferralsReportView';
import PublicationsReportView from './components/PublicationsReportView';
import RecruitmentSourcesReportView from './components/RecruitmentSourcesReportView';
import ReportsDashboardView from './components/ReportsDashboardView'; 
import PublishJobView from './components/PublishJobView';
import GeneralJobsView from './components/GeneralJobsView';
import JobScreeningView from './components/JobScreeningView';
import HiroAIChat from './components/HiroAIChat';
import { SparklesIcon } from './components/Icons';
import ContactProfileView from './components/ContactProfileView';
import CandidatePortalLayout from './components/CandidatePortalLayout';
import CandidateLoginView from './components/CandidateLoginView';
import CandidateSignup from './components/CandidateSignup'; // NEW IMPORT
import CandidatePublicProfileView from './components/CandidatePublicProfileView';
import CandidateRegistrationWizard from './components/CandidateRegistrationWizard'; 
import CandidateOnboardingChat from './components/CandidateOnboardingChat';
import DashboardView from './components/DashboardView';
import ExternalJobPostView from './components/ExternalJobPostView';
import CommunicationCenterView from './components/CommunicationCenterView';

import AdminCompanyCorrectionsView from './components/AdminCompanyCorrectionsView';
import AdminTagsView from './components/AdminTagsView';
import AdminJobFieldsView from './components/AdminJobFieldsView';
import AdminCompaniesView from './components/AdminCompaniesView';

import ManagerLayout from './components/ManagerLayout';
import ManagerDashboard from './components/ManagerDashboard';
import ManagerJobView from './components/ManagerJobView';

import PublicCandidateProfile from './components/PublicCandidateProfile';

import CandidateNav from './components/CandidateNav';
import CandidateProfile from './components/CandidateProfile';
import MainContent from './components/MainContent';
import ResumeViewer from './components/ResumeViewer';
import JobMatchingView from './components/JobMatchingView';
import CandidateScreeningView, { screeningJobsData } from './components/CandidateScreeningView';
import InterestedInJobs, { jobsData as interestedJobsData } from './components/InterestedInJobs';
import ReferralsView from './components/ReferralsView';
import EventsView, { type Event } from './components/EventsView';
import DocumentsView from './components/DocumentsView';
import { MessageModalConfig } from './hooks/useUIState';
import { JobAlertModalConfig } from './components/CreateJobAlertModal';

interface Message {
    role: 'user' | 'model';
    text: string;
}

// 1. הגדרת הפונקציות עבור ה-AI (Tools)
const updateCandidateFunctionDeclaration: FunctionDeclaration = {
  name: 'updateCandidateField',
  parameters: {
    type: Type.OBJECT,
    description: 'Update a basic field in the candidate profile data (address, phone, email, title, etc).',
    properties: {
      fieldName: { type: Type.STRING, description: 'Field name to update.' },
      newValue: { type: Type.STRING, description: 'New value.' },
    },
    required: ['fieldName', 'newValue'],
  },
};

const upsertWorkExperienceFunctionDeclaration: FunctionDeclaration = {
  name: 'upsertWorkExperience',
  parameters: {
    type: Type.OBJECT,
    description: 'Add a new work experience or update an existing one for the candidate.',
    properties: {
      id: { type: Type.NUMBER, description: 'Optional. Use ONLY if updating an existing record ID from the context.' },
      title: { type: Type.STRING, description: 'Job title / position name.' },
      company: { type: Type.STRING, description: 'Company name.' },
      companyField: { type: Type.STRING, description: 'Industry or field of the company.' },
      startDate: { type: Type.STRING, description: 'Format YYYY-MM.' },
      endDate: { type: Type.STRING, description: 'Format YYYY-MM or "Present".' },
      description: { type: Type.STRING, description: 'Description of the role and achievements.' },
    },
    required: ['title', 'company', 'startDate', 'endDate'],
  },
};

interface AppRoutesProps {
    openSummaryDrawer: (candidateId: number) => void;
    handleSaveJob: (jobData: any) => void;
    handleSaveClient: (clientData: any) => void;
    setActiveView: (view: string) => void;
    activeView: string;
    handleSetActiveView: (view: string) => void;
    handleMatchingClick: () => void;
    handleScreeningClick: () => void;
    contentAreaRef: React.RefObject<HTMLDivElement>;
    isMatchingJobs: boolean;
    setIsMatchingJobs: (val: boolean) => void;
    isScreening: boolean;
    setIsScreening: (val: boolean) => void;
    events: Event[];
    setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
    onOpenNewTask: () => void;
    openMessageModal: (config: MessageModalConfig) => void;
    openJobAlertModal: (config: JobAlertModalConfig) => void;
    favorites: Set<number>;
    toggleFavorite: (id: number) => void;
}

const ProfilePageWrapper: React.FC<AppRoutesProps> = (props) => {
    // ... (rest of ProfilePageWrapper code remains unchanged)
    // For brevity, including the existing content below:
    const { candidateId } = useParams();
    const numericId = candidateId ? parseInt(candidateId, 10) : 0;
    
    const initialData = {
        id: numericId, 
        fullName: "גדעון שפירא",
        title: "מנהל שיווק דיגיטלי",
        status: "עבר בדיקה ראשונית",
        phone: "0544910468",
        email: "gidon.shap@email.com",
        address: "תל אביב - יפו",
        idNumber: "",
        maritalStatus: "-",
        gender: "זכר",
        drivingLicense: "-",
        mobility: "-",
        birthYear: "1989",
        birthMonth: "יוני",
        birthDay: "15",
        age: "35",
        employmentType: 'שכיר',
        jobScope: 'מלאה',
        availability: 'מיידי (עד חודש)',
        physicalWork: 'כן/לא/פיזית מתונה',
        tags: ['חשמל', 'תואר ראשון', 'תואר שני', 'ניהול מערכות מידע', 'יזמות', 'ניהול פרויקט'],
        internalTags: ['פוטנציאל ניהולי', 'מתאים גם למכירות'],
        salaryMin: 18000,
        salaryMax: 20000,
        recruiterNotes: 'נראה מועמד מבטיח, לתאם שיחה טלפונית בהקדם.',
        candidateNotes: 'אני מאוד מתעניין בתפקידי ניהול מוצר ופתוח להצעות גם מתחום ה-Fintech.',
        professionalSummary: 'מנהל שיווק דיגיטלי מנוסה with למעלה מ-5 שנות ניסיון בהובלת אסטרטגיות צמיחה וקמפיינים מרובי ערוצים. בעל מומחיות עמוקה ב-PPC, SEO, ואנליטיקה, עם יכולת מוכחת בניהול תקציבים, אופטימיזציה של משפכי המרה והובלת צוותים להישגים עסקיים משמעותיים.',
        workExperience: [
            { id: 1, title: 'מנהל שיווק', company: 'בזק', companyField: 'תקשורת', startDate: '2020-01', endDate: '2023-05', description: 'ניהול צוות של 5 עובדים, אחריות על קמפיינים דיגיטליים ותקציב שנתי של 2 מיליון ש"ח.' },
            { id: 2, title: 'מנהל קמפיינים PPC', company: 'Wix', companyField: 'הייטק', startDate: '2018-06', endDate: '2019-12', description: 'ניהול קמפיינים בגוגל ופייסבוק, אופטימיזציה והפקת דוחות.' },
            { id: 3, title: 'מתמחה בשיווק', company: 'AllJobs', companyField: 'גיוס', startDate: '2017-09', endDate: '2018-05', description: 'סיוע לצוות השיווק במשימות השוטפות.' },
        ],
        languages: [
            { id: 1, name: 'עברית', level: 100, levelText: 'שפת אם / מעולה' },
            { id: 2, name: 'אנגלית', level: 90, levelText: 'טוב מאוד' },
        ],
        education: [
            { id: 1, value: '2020-2024 - אוניברסיטת תל אביב, תואר ראשון בתקשורת' },
            { id: 2, value: '2018 - קורס שיווק דיגיטלי, HackerU' },
        ],
        softSkills: ['עבודת צוות', 'ניהול זמן', 'פתרון בעיות'],
        techSkills: [
            { id: 1, name: 'Google Ads', level: 85, levelText: 'טוב מאוד' },
            { id: 2, name: 'פוטושופ', level: 75, levelText: 'טוב מאוד' },
        ],
        industryAnalysis: {
            industries: [
                { label: 'מסחר וקמעונאות', percentage: 60, color: 'bg-primary-500' },
                { label: 'טכנולוגיה ושירותים', percentage: 40, color: 'bg-secondary-400' },
            ],
            smartTags: {
                domains: ['שיווק דיגיטלי', 'ניהול'],
                orgDNA: { label: 'ארגוני Enterprise', subLabel: 'ניסיון בחברות גדולות' }
            }
        }
    };

    const [formData, setFormData] = useState(initialData);

    useEffect(() => {
        const candidateFromList = candidatesData.find(c => c.id === numericId);
        if (candidateFromList) {
            setFormData(prev => ({
                ...prev,
                id: candidateFromList.id,
                fullName: candidateFromList.name,
                title: candidateFromList.title,
                status: candidateFromList.status,
                phone: candidateFromList.phone || prev.phone,
                address: candidateFromList.address || prev.address,
                tags: candidateFromList.tags,
                internalTags: candidateFromList.internalTags,
                industryAnalysis: candidateFromList.industryAnalysis ? {
                    industries: candidateFromList.industryAnalysis.industries.map((ind: any, i: number) => ({
                         ...ind,
                         color: i === 0 ? 'bg-primary-500' : 'bg-secondary-400'
                    })),
                    smartTags: candidateFromList.industryAnalysis.smartTags || prev.industryAnalysis.smartTags
                } : prev.industryAnalysis
            }));
        } else {
            setFormData({ ...initialData, id: numericId });
        }
    }, [numericId]);

    const mockResumeData = {
        name: formData.fullName,
        contact: `${formData.email} ${formData.phone}`,
        summary: formData.professionalSummary,
        experience: formData.workExperience.map(exp => 
             `<b>${exp.title}</b> ב-${exp.company} (${exp.companyField})<br/>${exp.startDate} - ${exp.endDate}<br/>${exp.description}`
        )
    };
    
    const handleTagsChange = (newTags: string[]) => {
        setFormData(prev => ({ ...prev, tags: newTags }));
    };
    
    const handleInternalTagsChange = (newTags: string[]) => {
        setFormData(prev => ({ ...prev, internalTags: newTags }));
    };

    const handleFormChange = (updatedData: any) => {
        setFormData(updatedData);
    };
    
    const handleNavClick = (view: string) => {
        props.handleSetActiveView(view);
    };
    
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    const initializeChat = () => {
        if (chatSession) return;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const contextData = { candidate: formData, resume: mockResumeData };
        const systemInstruction = `You are an expert recruitment assistant named Hiro AI. Use the context to answer questions about the candidate in Hebrew. You have access to tools to update candidate information and work experience. Context: ${JSON.stringify(contextData)}`;
        
        const newChatSession = ai.chats.create({ 
            model: 'gemini-3-flash-preview', 
            config: { 
                systemInstruction,
                tools: [{ functionDeclarations: [updateCandidateFunctionDeclaration, upsertWorkExperienceFunctionDeclaration] }]
            } 
        });
        setChatSession(newChatSession);
    };

    const handleOpenChat = () => {
        initializeChat();
        setIsChatOpen(true);
    };

    const handleSendMessage = async (input: string) => {
        if (!input.trim() || isChatLoading || !chatSession) return;
        const userMessage: Message = { role: 'user', text: input };
        setChatMessages(prev => [...prev, userMessage]);
        setIsChatLoading(true);
        setChatError(null);

        try {
            const response = await chatSession.sendMessage({ message: input });
            
            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    if (fc.name === 'updateCandidateField') {
                        const { fieldName, newValue } = fc.args as any;
                        setFormData((prev: any) => ({ ...prev, [fieldName]: newValue }));
                        const toolResponse = await chatSession.sendMessage({ message: `Field ${fieldName} updated to ${newValue}.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || "עודכן בהצלחה." }]);
                    }
                    
                    if (fc.name === 'upsertWorkExperience') {
                        const newExp = fc.args as any;
                        setFormData((prev: any) => {
                            const currentExp = prev.workExperience || [];
                            let updatedExp;
                            if (newExp.id) {
                                updatedExp = currentExp.map((e: any) => e.id === newExp.id ? { ...e, ...newExp } : e);
                            } else {
                                updatedExp = [{ ...newExp, id: Date.now() }, ...currentExp];
                            }
                            return { ...prev, workExperience: updatedExp };
                        });
                        const toolResponse = await chatSession.sendMessage({ message: `Work experience at ${newExp.company} has been added/updated.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || "הניסיון התעסוקתי עודכן בהצלחה." }]);
                    }
                }
            } else {
                setChatMessages(prev => [...prev, { role: 'model', text: response.text || "" }]);
            }
        } catch (e) {
            console.error("Gemini API error:", e);
            setChatError("Error communicating with AI.");
        } finally {
            setIsChatLoading(false);
        }
    };

    const renderContent = () => {
        if (props.isMatchingJobs) {
            return <JobMatchingView onBack={() => props.handleSetActiveView('details')} candidateName={formData.fullName} />;
        }
        if (props.isScreening) {
            return <CandidateScreeningView onBack={() => props.handleSetActiveView('details')} />;
        }

        switch (props.activeView) {
            case 'details':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <MainContent 
                            formData={formData} 
                            onFormChange={handleFormChange} 
                            onInternalTagsChange={handleInternalTagsChange} 
                        />
                        <ResumeViewer resumeData={mockResumeData} onOpenMessageModal={props.openMessageModal} />
                    </div>
                );
            case 'jobs':
                return <InterestedInJobs onOpenNewTask={props.onOpenNewTask} />;
            case 'referrals':
                return <ReferralsView onOpenNewTask={props.onOpenNewTask} />;
            case 'events':
                return <EventsView events={props.events} setEvents={props.setEvents} />;
            case 'documents':
                return <DocumentsView />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6 relative">
            <div className="mt-4 mb-6">
                 <CandidateNav activeView={props.activeView} setActiveView={handleNavClick} />
            </div>

             <CandidateProfile 
                candidateData={formData} 
                onMatchJobsClick={props.handleMatchingClick}
                onScreenCandidateClick={props.handleScreeningClick}
                onOpenMessageModal={props.openMessageModal}
                onTagsChange={handleTagsChange}
                onFormChange={handleFormChange}
                isFavorite={props.favorites.has(formData.id)}
                onToggleFavorite={() => props.toggleFavorite(formData.id)}
                hideActions={props.isMatchingJobs || props.isScreening}
            />
            
            <div ref={props.contentAreaRef} className="scroll-mt-32"></div>

            <div className="min-h-[500px]">
                {renderContent()}
            </div>
            
            <div className="fixed bottom-6 left-6 z-40">
                <button
                    onClick={handleOpenChat}
                    className="w-16 h-16 bg-primary-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-700 transition-transform transform hover:scale-110"
                    title="פתח עוזר AI"
                >
                    <SparklesIcon className="w-8 h-8" />
                </button>
            </div>
            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                messages={chatMessages}
                isLoading={isChatLoading}
                error={chatError}
                onSendMessage={handleSendMessage}
                onReset={() => { setChatSession(null); setChatMessages([]); setChatError(null); initializeChat(); }}
            />
        </div>
    );
};

export const AppRoutes: React.FC<AppRoutesProps> = (props) => {
    const element = useRoutes([
        { path: '/', element: <Navigate to="/login" replace /> },
        { path: '/dashboard', element: <DashboardView /> },
        { path: '/candidates', element: <CandidatesListView openSummaryDrawer={props.openSummaryDrawer} favorites={props.favorites} toggleFavorite={props.toggleFavorite} /> },
        { path: '/candidates/new', element: <NewCandidateViewV2 /> },
        { path: '/candidates/:candidateId', element: <ProfilePageWrapper {...props} /> },
        { path: '/candidate-pool', element: <CandidatePoolView /> },
        { path: '/job-board', element: <GeneralJobsView openJobAlertModal={props.openJobAlertModal} /> },
        { path: '/post-job', element: <ExternalJobPostView /> },
        { path: '/jobs', element: <JobsView /> },
        { path: '/jobs/new', element: <NewJobView onCancel={() => {}} onSave={props.handleSaveJob} /> },
        { path: '/jobs/edit/:jobId', element: <ExistingJobView onCancel={() => {}} onSave={props.handleSaveJob} openSummaryDrawer={props.openSummaryDrawer} /> },
        { path: '/jobs/existing', element: <ExistingJobView onCancel={() => {}} onSave={props.handleSaveJob} openSummaryDrawer={props.openSummaryDrawer} /> },
        { path: '/jobs/existing/events', element: <JobEventsView /> },
        { path: '/jobs/:jobId/publish', element: <PublishJobView /> },
        { path: '/jobs/:jobId/screen', element: <JobScreeningView /> },
        { path: '/clients', element: <ClientsListView openMessageModal={props.openMessageModal} /> },
        { path: '/clients/new', element: <NewClientView onCancel={() => {}} onSave={props.handleSaveClient} /> },
        { path: '/clients/:clientId', element: <ClientProfileView openMessageModal={props.openMessageModal} /> },
        { path: '/clients/:clientId/contacts/:contactId', element: <ContactProfileView openMessageModal={props.openMessageModal} /> },
        { path: '/notifications', element: <NotificationCenter onOpenCandidateSummary={props.openSummaryDrawer} /> },
        { path: '/communications', element: <CommunicationCenterView /> },
        { path: '/login', element: <LoginScreen /> },
        { path: '/settings/company', element: <CompanySettingsView /> },
        { path: '/settings/coordinators', element: <CoordinatorsSettingsView /> },
        { path: '/settings/coordinators/:coordinatorId', element: <CoordinatorProfileView /> },
        { path: '/settings/message-templates', element: <MessageTemplatesView /> },
        { path: '/settings/event-types', element: <EventTypesSettingsView /> },
        { path: '/settings/recruitment-sources', element: <RecruitmentSourcesSettingsView /> },
        { path: '/reports/referrals', element: <ReferralsReportView onOpenNewTask={props.onOpenNewTask} onOpenCandidateSummary={props.openSummaryDrawer} /> },
        { path: '/reports/publications', element: <PublicationsReportView /> },
        { path: '/reports/recruitment-sources', element: <RecruitmentSourcesReportView /> },
        { path: '/reports/bi', element: <ReportsDashboardView /> },
        { path: '/p/:slug', element: <PublicCandidateProfile /> },
        { 
            path: '/admin', 
            element: <AdminLayout />,
            children: [
                { index: true, element: <Navigate to="clients" replace /> },
                { path: 'clients', element: <AdminClientsView /> },
                { path: 'companies', element: <AdminCompaniesView /> },
                { path: 'client/new', element: <AdminClientFormView /> },
                { path: 'client/edit/:clientId', element: <AdminClientFormView /> },
                { path: 'jobs', element: <AdminJobsView /> },
                { path: 'candidates', element: <AdminCandidatesView /> },
                { path: 'candidates/:candidateId', element: <AdminCandidateProfileView /> },
                { path: 'company-corrections', element: <AdminCompanyCorrectionsView /> },
                { path: 'tags', element: <AdminTagsView /> },
                { path: 'job-fields', element: <AdminJobFieldsView /> },
            ] 
        },
        {
            path: '/portal/manager',
            element: <ManagerLayout />,
            children: [
                { index: true, element: <ManagerDashboard /> },
                { path: 'jobs/:jobId', element: <ManagerJobView /> }
            ]
        },
        {
            path: '/candidate-portal',
            element: <CandidatePortalLayout />,
            children: [
                 { index: true, element: <Navigate to="login" replace /> },
                 { path: 'login', element: <CandidateLoginView /> },
                 { path: 'signup', element: <CandidateSignup /> }, // New Route
                 { path: 'profile', element: <CandidatePublicProfileView openJobAlertModal={props.openJobAlertModal} /> },
                 { path: 'register', element: <CandidateRegistrationWizard /> },
                 { path: 'onboarding', element: <CandidateOnboardingChat /> } 
            ]
        },
        { path: '*', element: <Navigate to="/login" replace /> },
    ]);
    return element;
};
