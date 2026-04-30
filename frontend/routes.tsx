
// ... (imports)
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRoutes, Navigate, useParams, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { GoogleGenAI, Chat, GenerateContentResponse, FunctionDeclaration, Type } from '@google/genai';

// Import all page components
import CandidatesListView, { Candidate } from './components/CandidatesListView';
import NewCandidateViewV2 from './components/NewCandidateViewV2';
import JobsView from './components/JobsView';
import NewJobView from './components/NewJobView';
import ExistingJobView from './components/ExistingJobView';
import JobEventsView from './components/JobEventsView';
import ClientsListView from './components/ClientsListView';
import NewClientView from './components/NewClientView';
import ClientProfileView from './components/ClientProfileView';
import LoginScreen from './components/LoginScreen';
import ActivationPage from './components/ActivationPage';
import LandingPage from './components/LandingPage';
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
import AdminMessageTemplatesView from './components/AdminMessageTemplatesView';
import EventTypesSettingsView from './components/EventTypesSettingsView';
import RecruitmentSourcesSettingsView from './components/RecruitmentSourcesSettingsView';
import QuestionnaireBuilderView from './components/QuestionnaireBuilderView'; 
import AgreementTypesSettingsView from './components/AgreementTypesSettingsView'; // New Import
import { syncCandidateNameFields } from './utils/candidateName';
import PipelineSettingsView from './components/PipelineSettingsView';
import StatusSettingsView from './components/StatusSettingsView';
import DocumentTemplatesView from './components/DocumentTemplatesView';
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
import { generateExperienceSummaryForCandidate } from './services/experienceSummaryService';
import ContactProfileView from './components/ContactProfileView';
import CandidatePortalLayout from './components/CandidatePortalLayout';
import CandidateLoginView from './components/CandidateLoginView';
import CandidateSignup from './components/CandidateSignup';
import CandidatePublicProfileView from './components/CandidatePublicProfileView';
import CandidateRegistrationWizard from './components/CandidateRegistrationWizard'; 
import CandidateOnboardingChat from './components/CandidateOnboardingChat';
import DashboardView from './components/DashboardView';
import ExternalJobPostView from './components/ExternalJobPostView';
import CommunicationCenterView from './components/CommunicationCenterView';

// Finance Components
import FinanceLayout from './components/FinanceLayout';
import FinanceDashboard from './components/FinanceDashboard';
import InvoicesView from './components/InvoicesView';
import CommissionsView from './components/CommissionsView';

// Settings Layout
import SettingsLayout from './components/SettingsLayout';
import AdminSettingsLayout from './components/AdminSettingsLayout';

import AdminCompanyCorrectionsView from './components/AdminCompanyCorrectionsView';
import AdminTagsUnifiedView from './components/AdminTagsUnifiedView';
import AdminTagsView from './components/AdminTagsView';
import AdminCandidateTagsView from './components/AdminCandidateTagsView';
import AdminJobFieldsView from './components/AdminJobFieldsView';
import AdminCompaniesView from './components/AdminCompaniesView';
import AdminPromptsView from './components/AdminPromptsView';
import AdminMatchingEngineView from './components/AdminMatchingEngineView';
import AdminPicklistsView from './components/AdminPicklistsView';
import AdminTagCorrectionsView from './components/AdminTagCorrectionsView';
import AdminEventsView from './components/AdminEventsView';
import AdminHelpCenterView from './components/AdminHelpCenterView';
import AdminBusinessLogicView from './components/AdminBusinessLogicView';
import AdminReferenceInfoView from './components/AdminReferenceInfoView';
import AdminSystemEventsView from './components/AdminSystemEventsView';

import ManagerLayout from './components/ManagerLayout';
import ManagerDashboard from './components/ManagerDashboard';
import ManagerJobView from './components/ManagerJobView';

import PublicCandidateProfile from './components/PublicCandidateProfile';

import CandidateNav from './components/CandidateNav';
import CandidateProfile from './components/CandidateProfile';
import MainContent from './components/MainContent';
import ResumeViewer from './components/ResumeViewer';
import JobMatchingView from './components/JobMatchingView';
import CandidateScreeningView from './components/CandidateScreeningView';
import InterestedInJobs from './components/InterestedInJobs';
import ReferralsView from './components/ReferralsView';
import EventsView, { type Event as EventsViewEvent } from './components/EventsView';
import DocumentsView from './components/DocumentsView';
import { MessageModalConfig } from './hooks/useUIState';
import { JobAlertModalConfig } from './components/CreateJobAlertModal';
import { deriveLocalCandidateId } from './utils/candidateId';

interface Message {
    role: 'user' | 'model';
    text: string;
}

// ... (keep tool definitions and interface props) ...
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
    openSummaryDrawer: (candidate: Candidate | number) => void;
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
    events: EventsViewEvent[];
    setEvents: React.Dispatch<React.SetStateAction<EventsViewEvent[]>>;
    onOpenNewTask: () => void;
    openMessageModal: (config: MessageModalConfig) => void;
    openJobAlertModal: (config: JobAlertModalConfig) => void;
    favorites: Set<number>;
    toggleFavorite: (id: number) => void;
}

const initialData = {
    id: 0,
    fullName: "",
    firstName: "",
    lastName: "",
    title: "",
    status: "",
    phone: "",
    email: "",
    address: "",
    idNumber: "",
    maritalStatus: "-",
    gender: "",
    drivingLicense: "-",
    mobility: "-",
    birthYear: "",
    birthMonth: "",
    birthDay: "",
    age: "",
    employmentType: '',
    employmentTypes: ['שכיר'] as string[],
    jobScope: '',
    jobScopes: [] as string[],
    availability: '',
    physicalWork: '',
    preferredWorkModels: [] as string[],
    drivingLicenses: [] as string[],
    tags: [],
    internalTags: [],
    salaryMin: 18000,
    salaryMax: 20000,
    internalNotes: '',
    candidateNotes: '',
    professionalSummary: '',
    workExperience: [
        
    ],
    languages: [
       
    ],
    education: [
      
    ],
    softSkills: [],
    techSkills: [
      
    ],
    industryAnalysis: {
        industries: [
           
        ],
        smartTags: {
            
        }
    }
};

const ensureArray = (value: any, fallback: any[]) => Array.isArray(value) ? value : fallback;

const normalizeCandidatePayload = (payload: any) => {
    const drivingLicensesRaw = ensureArray(payload?.drivingLicenses, []);
    const employmentTypesRaw = ensureArray(payload?.employmentTypes, []);
    const jobScopesRaw = ensureArray(payload?.jobScopes, []);
    const drivingLicenseSingle = payload?.drivingLicense != null ? String(payload.drivingLicense) : '';
    const employmentSingle = payload?.employmentType != null ? String(payload.employmentType) : '';
    const jobScopeSingle = payload?.jobScope != null ? String(payload.jobScope) : '';

    const out = {
        ...initialData,
        ...payload,
        tags: ensureArray(payload?.tags, initialData.tags),
        internalTags: ensureArray(payload?.internalTags, initialData.internalTags),
        workExperience: ensureArray(payload?.workExperience, initialData.workExperience),
        languages: ensureArray(payload?.languages, initialData.languages),
        education: ensureArray(payload?.education, initialData.education),
        industryAnalysis: payload?.industryAnalysis || initialData.industryAnalysis,
        backendId: payload?.id,
        /** DB column is internalNotes; ignore legacy recruiterNotes if present */
        internalNotes: payload?.internalNotes ?? payload?.recruiterNotes ?? '',
        drivingLicenses:
            drivingLicensesRaw.length > 0
                ? drivingLicensesRaw.map((x: any) => String(x || '').trim()).filter(Boolean)
                : drivingLicenseSingle && drivingLicenseSingle !== '-'
                  ? [drivingLicenseSingle.trim()]
                  : [],
        employmentTypes:
            employmentTypesRaw.length > 0
                ? employmentTypesRaw.map((x: any) => String(x || '').trim()).filter(Boolean)
                : employmentSingle
                  ? [employmentSingle.trim()]
                  : ['שכיר'],
        jobScopes:
            jobScopesRaw.length > 0
                ? jobScopesRaw.map((x: any) => String(x || '').trim()).filter(Boolean)
                : jobScopeSingle
                  ? [jobScopeSingle.trim()]
                  : [],
    };
    syncCandidateNameFields(out as Record<string, unknown>);
    return out;
};

const ProfilePageWrapper: React.FC<AppRoutesProps> = (props) => {
    const params = useParams();
    const location = useLocation();
    const urlId = params.candidateId;
    const navigate = useNavigate();
    console.log('ProfilePageWrapper render', { urlId, params });
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [formData, setFormData] = useState<any>(initialData);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | number | null>(null);
    const [isCandidateLoading, setIsCandidateLoading] = useState(false);
    const [candidateFetchError, setCandidateFetchError] = useState<string | null>(null);
    const [isUpdatingCandidate, setIsUpdatingCandidate] = useState(false);
    const [candidateUpdateMessage, setCandidateUpdateMessage] = useState<string | null>(null);
    const [approveCorrectionsLoading, setApproveCorrectionsLoading] = useState(false);
    const [candidateList, setCandidateList] = useState<{ id: string }[]>([]);

    const loadProfilesForUser = useCallback(async (userId?: string | number) => {
        if (!userId || !apiBase) {
            setProfiles([]);
            return;
        }
        try {
            const res = await fetch(`${apiBase}/api/candidates/by-user/${userId}`);
            if (!res.ok) return;
            const payload = await res.json();
            const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
            const normalizedList = list
                .map(normalizeCandidatePayload)
                .map(candidate => ({
                    ...candidate,
                    backendId: candidate.backendId || candidate.id,
                }));
            setProfiles(normalizedList);
            setActiveProfileId(prev => prev ?? normalizedList[0]?.backendId ?? normalizedList[0]?.id ?? null);
        } catch (err) {
            console.error('Failed to load candidate profiles', err);
        }
    }, [apiBase]);

    const authHeaders = useCallback(() => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const fetchCandidateList = useCallback(async () => {
        if (!apiBase) return;
        try {
            const response = await fetch(`${apiBase}/api/candidates?page=1&limit=250`, {
                headers: { ...authHeaders() },
                cache: 'reload',
            });
            if (!response.ok) throw new Error('Failed to load candidates');
            const payload = await response.json();
            const list = Array.isArray(payload.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];
            const sanitized = list
                .filter((item) => item && item.id)
                .map((item) => ({ id: item.id }));
            setCandidateList(sanitized);
        } catch (err) {
            console.error('Failed to fetch candidate list', err);
        }
    }, [apiBase, authHeaders]);

    const fetchCandidate = useCallback(async (signal?: AbortSignal, options?: { showLoading?: boolean }) => {
        if (!urlId) {
            setCandidateFetchError('מזהה המועמד חסר.');
            return;
        }
            if (!apiBase) {
                setCandidateFetchError('כתובת ה-API לא מוגדרת.');
                return;
            }

        const showLoading = options?.showLoading ?? true;
        if (showLoading) {
            setIsCandidateLoading(true);
            setCandidateFetchError(null);
        }

            try {
        const response = await fetch(`${apiBase}/api/candidates/${urlId}`, { signal, cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('לא ניתן למצוא את המועמד המבוקש.');
                }

                const payload = await response.json();
                const normalized = normalizeCandidatePayload(payload);
                const localId = deriveLocalCandidateId(payload.id ?? payload.userId, 0);

            if (!signal?.aborted) {
                setFormData({
                    ...normalized,
                    id: localId,
                    backendId: payload.id, // Keep the real UUID
                });
                setActiveProfileId(payload.id ?? payload.backendId ?? normalized.backendId ?? null);
            }

                if (payload.userId) {
                    void loadProfilesForUser(payload.userId);
                }
            } catch (error: any) {
            if (!signal?.aborted) {
                    setCandidateFetchError(error.message || 'תקלה בטעינת המועמד.');
                }
            } finally {
            if (!signal?.aborted && showLoading) {
                    setIsCandidateLoading(false);
                }
            }
    }, [apiBase, loadProfilesForUser, urlId]);

    useEffect(() => {
        const controller = new AbortController();
        void fetchCandidate(controller.signal);
        return () => controller.abort();
    }, [fetchCandidate]);

    useEffect(() => {
        void fetchCandidateList();
    }, [fetchCandidateList]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleCandidateRefresh = (event: Event) => {
            const customEvent = event as CustomEvent;
            const detail = customEvent.detail;
            if (!detail) return;
            if (!urlId) return;
            const updatedId = detail.backendId || detail.id || detail.candidateId;
            if (!updatedId) return;
            if (String(updatedId) === String(urlId)) {
                void fetchCandidate(undefined, { showLoading: false });
            }
        };

        window.addEventListener('candidate-data-refreshed', handleCandidateRefresh);
        return () => window.removeEventListener('candidate-data-refreshed', handleCandidateRefresh);
    }, [fetchCandidate, urlId]);

    const handleSaveCandidate = useCallback(async () => {
        if (!urlId) {
            setCandidateUpdateMessage('מזהה המועמד חסר.');
            return;
        }
        if (!apiBase) {
            setCandidateUpdateMessage('כתובת ה-API לא מוגדרת.');
            return;
        }

        setIsUpdatingCandidate(true);
        setCandidateUpdateMessage(null);

        try {
            const response = await fetch(`${apiBase}/api/candidates/${urlId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (!response.ok) {
                const errBody = await response.json().catch(() => null);
                throw new Error(errBody?.message || 'עדכון נכשל.');
            }

            const payload = await response.json();
            const normalized = normalizeCandidatePayload(payload);
            const localId = deriveLocalCandidateId(payload.id ?? payload.userId, formData.id);
            setFormData({ ...normalized, id: localId, backendId: payload.id });
            setCandidateUpdateMessage('השינויים נשמרו בהצלחה.');
        } catch (error: any) {
            setCandidateUpdateMessage(error?.message || 'עדכון נכשל.');
        } finally {
            setIsUpdatingCandidate(false);
        }
    }, [apiBase, urlId, formData]);

    const mockResumeData = {
        name: formData.fullName,
        contact: `${formData.email} ${formData.phone}`,
        summary: formData.professionalSummary,
        experience: formData.workExperience.map(exp => 
             `<b>${exp.title}</b> ב-${exp.company} (${exp.companyField})<br/>${exp.startDate} - ${exp.endDate}<br/>${exp.description}`
        )
        ,
    workExperience: formData.workExperience,
            resumeUrl: formData.resumeUrl || '',
        candidateId: formData.backendId,
    };
    
    const handleTagsChange = (newTags: string[]) => {
        setFormData(prev => ({ ...prev, tags: newTags }));
    };
    
    const handleInternalTagsChange = (newTags: string[]) => {
        setFormData(prev => ({ ...prev, internalTags: newTags }));
    };

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedRef = useRef<string | null>(null);

    const triggerAutoSave = useCallback((nextData: any) => {
        if (!nextData) return;
        const payloadString = JSON.stringify(nextData);
        if (lastSavedRef.current === payloadString) return;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(async () => {
            const targetId = urlId || nextData.backendId;
            if (!targetId || !apiBase) return;
            setIsUpdatingCandidate(true);
            try {
                const res = await fetch(`${apiBase}/api/candidates/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nextData),
                });
                if (!res.ok) {
                    const errBody = await res.json().catch(() => null);
                    throw new Error(errBody?.message || 'עדכון אוטומטי נכשל');
                }
                lastSavedRef.current = payloadString;
                setCandidateUpdateMessage('השינויים נשמרו אוטומטית.');
            } catch (error: any) {
                setCandidateUpdateMessage(error?.message || 'עדכון אוטומטי נכשל.');
            } finally {
                setIsUpdatingCandidate(false);
            }
        }, 600);
    }, [apiBase, urlId]);

    const handleApproveDataCorrections = useCallback(async () => {
        const id = String(formData.backendId || urlId || '');
        if (!apiBase || !id) {
            setCandidateUpdateMessage('מזהה מועמד חסר.');
            return;
        }
        setApproveCorrectionsLoading(true);
        setCandidateUpdateMessage(null);
        try {
            const res = await fetch(`${apiBase}/api/candidates/${id}/approve-data-corrections`, {
                method: 'POST',
                headers: { ...authHeaders() },
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(typeof body?.message === 'string' ? body.message : 'אישור נכשל');
            const normalized = normalizeCandidatePayload(body);
            const localId = deriveLocalCandidateId(body.id ?? body.userId, formData.id);
            setFormData({ ...normalized, id: localId, backendId: body.id });
            setCandidateUpdateMessage('המועמד אושר והועבר למצב פעיל.');
            window.dispatchEvent(new CustomEvent('candidate-data-refreshed', { detail: { backendId: id } }));
        } catch (err: unknown) {
            setCandidateUpdateMessage(err instanceof Error ? err.message : 'אישור נכשל');
        } finally {
            setApproveCorrectionsLoading(false);
        }
    }, [apiBase, authHeaders, formData.backendId, formData.id, urlId]);

    const handleFormChange = (updatedData: any) => {
        if (typeof updatedData === 'function') {
            setFormData((prev) => {
                const next = updatedData(prev);
                triggerAutoSave(next);
                return next;
            });
        } else {
            setFormData(updatedData);
            triggerAutoSave(updatedData);
        }
    };

    const handleProfileSwitch = (profileId: string | number) => {
        setActiveProfileId(profileId);
        const target = profiles.find(profile => (profile.backendId || profile.id) === profileId);
        if (target?.backendId) {
            navigate(`/candidates/${target.backendId}`);
        }
    };

    const handleAddProfile = useCallback(async () => {
        const name = window.prompt('מה שם הפרופיל החדש?');
        if (!name || !name.trim()) return;
        const payload: any = {
            ...formData,
            profileName: name.trim(),
            userId: formData.userId,
        };
        delete payload.id;
        delete payload.backendId;
        if (!apiBase) return;
        try {
            const res = await fetch(`${apiBase}/api/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'Failed to create profile');
            }
            const created = await res.json();
            const normalizedCreated = normalizeCandidatePayload(created);
            setProfiles(prev => {
                const next = [...prev.filter(p => p.backendId !== normalizedCreated.backendId), normalizedCreated];
                return next;
            });
            setActiveProfileId(normalizedCreated.backendId ?? normalizedCreated.id);
            setFormData({ ...normalizedCreated, backendId: created.id });
            void loadProfilesForUser(formData.userId);
            navigate(`/candidates/${created.id}`);
        } catch (err: any) {
            console.error('Failed to add profile', err);
        }
    }, [apiBase, formData, loadProfilesForUser, navigate]);

    const profileOptions = useMemo(() => profiles.map(profile => ({
        id: profile.backendId || profile.id,
        profileName: profile.profileName || profile.fullName || 'פרופיל',
        profilePicture: profile.profilePicture,
    })), [profiles]);

    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [generateSummaryError, setGenerateSummaryError] = useState<string | null>(null);

    const handleGenerateExperienceSummary = async () => {
        const targetId = urlId || formData.backendId; 
        console.log('handleGenerateExperienceSummary (routes.tsx) clicked', { 
            urlId, 
            backendId: formData.backendId,
            targetId,
            formDataId: formData.id 
        });
        
        if (isGeneratingSummary) return;
        if (!targetId || targetId === 'undefined' || targetId === 'null') {
            console.warn('targetId is missing or invalid in routes.tsx', { urlId, backendId: formData.backendId });
            setGenerateSummaryError('נא לשמור את המועמד לפני יצירת תקציר.');
            return;
        }

        const exp = Array.isArray(formData.workExperience) && formData.workExperience.length > 0 ? formData.workExperience[0] : null;
        const payload = {
            title: exp?.title || formData.title || '',
            company: exp?.company || '',
            companyField: exp?.companyField || '',
            description: exp?.description || '',
        };

        if (!payload.title && !payload.company && !payload.companyField) {
            setGenerateSummaryError('הוסף תפקיד או חברה לפני שמפעילים את הכתיבה.');
            return;
        }

        setIsGeneratingSummary(true);
        setGenerateSummaryError(null);
        try {
            const summary = await generateExperienceSummaryForCandidate(targetId, payload);
            if (summary) {
                setFormData((prev: any) => ({ ...prev, professionalSummary: summary }));
                // Trigger save on backend too
                await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/candidates/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ professionalSummary: summary }),
                });
            }
        } catch (err: any) {
            setGenerateSummaryError(err.message || 'שגיאה ביצירת תיאור ניסיון.');
        } finally {
            setIsGeneratingSummary(false);
        }
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
            return (
                <CandidateScreeningView
                    onBack={() => props.handleSetActiveView('details')}
                    candidateId={formData.backendId || formData.id}
                    candidate={formData}
                />
            );
        }

        switch (props.activeView) {
            case 'details':
                return (
                    <>
                        {candidateFetchError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 px-4 py-2 mb-4">
                                {candidateFetchError}
                            </div>
                        )}
                        {isCandidateLoading && (
                            <div className="text-xs text-text-subtle mb-2">טוען מידע אודות המועמד...</div>
                        )}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                            <MainContent 
                                formData={formData} 
                                onFormChange={handleFormChange} 
                                onInternalTagsChange={handleInternalTagsChange} 
                            />
                            <ResumeViewer
                                resumeData={mockResumeData}
                                onOpenMessageModal={props.openMessageModal}
                                candidateId={formData.backendId || urlId || null}
                            />
                        </div>
                    </>
                );
            case 'jobs':
                return (
                    <InterestedInJobs
                        onOpenNewTask={props.onOpenNewTask}
                        candidateId={formData.backendId || formData.id}
                        candidatePhone={formData.phone}
                        candidateEmail={formData.email}
                    />
                );
            case 'referrals':
                return (
                    <ReferralsView
                        onOpenNewTask={props.onOpenNewTask}
                        candidateId={formData.backendId || formData.id}
                    />
                );
            case 'events':
                return (
                    <EventsView
                        candidateId={String(formData.backendId || formData.id || '')}
                        candidateName={
                            formData.fullName
                            || [formData.firstName, formData.lastName].filter(Boolean).join(' ')
                            || ''
                        }
                        events={props.events}
                        setEvents={props.setEvents}
                    />
                );
            case 'documents':
                return (
                    <DocumentsView
                        candidateId={String(formData.backendId || formData.id || '')}
                        candidateName={
                            formData.fullName
                            || [formData.firstName, formData.lastName].filter(Boolean).join(' ')
                            || ''
                        }
                    />
                );
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
                isSaving={isUpdatingCandidate}
                onSaveCandidate={handleSaveCandidate}
                saveStatusMessage={candidateUpdateMessage}
                profiles={profileOptions}
                activeProfileId={activeProfileId ?? formData.backendId ?? formData.id}
                onSwitchProfile={handleProfileSwitch}
                onAddProfile={handleAddProfile}
                candidateList={candidateList}
                onNavigateCandidate={(id) => {
                    const search = location.search || '';
                    navigate(`/candidates/${id}${search}`);
                }}
                onGenerateExperienceSummary={handleGenerateExperienceSummary}
                isGeneratingSummary={isGeneratingSummary}
                generateSummaryError={generateSummaryError}
                onApproveDataCorrections={handleApproveDataCorrections}
                approveCorrectionsLoading={approveCorrectionsLoading}
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
        { path: '/', element: <Navigate to="/dashboard" replace /> },
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
        { path: '/communications', element: <CommunicationCenterView onOpenCandidateSummary={props.openSummaryDrawer} /> },
        
        // --- FINANCE ROUTES ---
        { 
            path: '/finance', 
            element: <FinanceLayout />,
            children: [
                { index: true, element: <Navigate to="dashboard" replace /> },
                { path: 'dashboard', element: <FinanceDashboard /> },
                { path: 'invoices', element: <InvoicesView /> },
                { path: 'commissions', element: <CommissionsView /> },
            ] 
        },

        // --- SETTINGS ROUTES (UPDATED) ---
        { 
            path: '/settings', 
            element: <SettingsLayout />,
            children: [
                 { index: true, element: <Navigate to="company" replace /> },
                 { path: 'company', element: <CompanySettingsView /> },
                 { path: 'statuses', element: <StatusSettingsView /> },
                 { path: 'pipelines', element: <PipelineSettingsView /> },
                 { path: 'documents', element: <DocumentTemplatesView /> },
                 { path: 'coordinators', element: <CoordinatorsSettingsView /> },
                 { path: 'coordinators/:coordinatorId', element: <CoordinatorProfileView /> },
                 { path: 'agreements', element: <AgreementTypesSettingsView /> }, // New Route
                 { path: 'message-templates', element: <MessageTemplatesView /> },
                 { path: 'event-types', element: <EventTypesSettingsView /> },
                 { path: 'recruitment-sources', element: <RecruitmentSourcesSettingsView /> },
                 { path: 'questionnaires', element: <QuestionnaireBuilderView /> }, 
            ] 
        },

        { path: '/login', element: <LoginScreen /> },
        { path: '/activation', element: <ActivationPage /> },
        { path: '/landing', element: <LandingPage /> }, 
        
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
                {
                    path: 'tags',
                    element: <AdminTagsUnifiedView />,
                    children: [
                        { index: true, element: <Navigate to="list" replace /> },
                        { path: 'list', element: <AdminTagsView /> },
                        { path: 'corrections', element: <AdminTagCorrectionsView /> },
                        { path: 'candidates', element: <AdminCandidateTagsView /> },
                    ],
                },
                { path: 'tag-corrections', element: <Navigate to="/admin/tags/corrections" replace /> },
                { path: 'candidateTags', element: <Navigate to="/admin/tags/candidates" replace /> },
                { path: 'picklists', element: <AdminPicklistsView /> },
                { path: 'help-center', element: <AdminHelpCenterView /> },
                { path: 'events', element: <AdminEventsView /> },
                { path: 'system-events', element: <AdminSystemEventsView /> },
                { path: 'business-logic', element: <AdminBusinessLogicView /> },
                { path: 'reference-info', element: <AdminReferenceInfoView /> },
                { path: 'job-fields', element: <AdminJobFieldsView /> },
                {
                    path: 'settings',
                    element: <AdminSettingsLayout />,
                    children: [
                        { index: true, element: <Navigate to="companies" replace /> },
                        { path: 'companies', element: <AdminCompanyCorrectionsView /> },
                        { path: 'tags', element: <AdminTagsView /> },
                        { path: 'job-fields', element: <AdminJobFieldsView /> },
                        { path: 'prompts', element: <AdminPromptsView /> },
                        { path: 'matching-engine', element: <AdminMatchingEngineView /> },
                        { path: 'message-templates', element: <AdminMessageTemplatesView /> },
                    ],
                },
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
                 { path: 'signup', element: <CandidateSignup /> }, 
                 { path: 'profile', element: <CandidatePublicProfileView openJobAlertModal={props.openJobAlertModal} /> },
                 { path: 'register', element: <CandidateRegistrationWizard /> },
                 { path: 'onboarding', element: <CandidateOnboardingChat /> } 
            ]
        },
        { path: '*', element: <Navigate to="/dashboard" replace /> },
    ]);
    return element;
};
