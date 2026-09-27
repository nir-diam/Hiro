import { useState } from 'react';
import { Candidate } from '../components/CandidatesListView';
import { JobAlertModalConfig } from '../components/CreateJobAlertModal';

export type MessageMode = 'whatsapp' | 'sms' | 'email';

export type SummaryDrawerTab = 'details' | 'events' | 'jobs' | 'documents';

export type SummaryDrawerOptions = {
    initialTab?: SummaryDrawerTab;
    manageLinkId?: string;
};

/** Optional picker entries (e.g. client contacts) so the user can choose who to send to. */
export interface MessageRecipientOption {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    /** e.g. company / org name shown under the contact */
    subtitle?: string | null;
    /** CRM client UUID — used to write journal events after send */
    clientId?: string | null;
    /** Linked organization UUID (company) for org-scoped journal filter */
    organizationId?: string | null;
}

export type MessageModalRecipientType = 'candidate' | 'client_contact' | 'team_member';

export interface MessageModalConfig {
    mode: MessageMode;
    candidateName: string;
    candidatePhone: string;
    /** Used for email channel / `POST .../send` */
    candidateEmail?: string | null;
    /** Backend candidate UUID when known (audit / system events) */
    candidateId?: string | null;
    /** Filters compose templates to those marked for this audience. */
    recipientType?: MessageModalRecipientType;
    /** When set, modal shows a contacts dropdown to pick recipient(s). */
    recipientOptions?: MessageRecipientOption[];
    /** Pre-selected option ids (defaults to options that already have email/phone for the mode). */
    initialRecipientIds?: string[];
    /** CRM context when sending without recipientOptions (single contact / profile). */
    linkedClientId?: string | null;
    linkedOrganizationId?: string | null;
    /** Organization / company display name for proposal placeholders ({company_name}). */
    linkedOrganizationName?: string | null;
    linkedContactId?: string | null;
}

export const useUIState = () => {
    const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
    const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
    const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);
    const [summaryCandidate, setSummaryCandidate] = useState<Candidate | null>(null);
    const [summaryDrawerOptions, setSummaryDrawerOptions] = useState<SummaryDrawerOptions | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [messageModalConfig, setMessageModalConfig] = useState<MessageModalConfig | null>(null);
    const [isJobAlertModalOpen, setIsJobAlertModalOpen] = useState(false);
    const [jobAlertModalConfig, setJobAlertModalConfig] = useState<JobAlertModalConfig | null>(null);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    
    const openPreferences = () => setIsPreferencesOpen(true);
    const closePreferences = () => setIsPreferencesOpen(false);

    const openNewTask = () => setIsNewTaskOpen(true);
    const closeNewTask = () => setIsNewTaskOpen(false);

    const createPlaceholderCandidate = (id: number): Candidate => ({
        id,
        backendId: undefined,
        name: '',
        avatar: '',
        title: '',
        status: '',
        lastActivity: '',
        source: '',
        tags: [],
        internalTags: [],
        matchScore: 0,
        phone: '',
        email: '',
    });

    const openSummaryDrawer = (
        candidateInput: Candidate | number,
        options?: SummaryDrawerOptions,
    ) => {
        const candidate = typeof candidateInput === 'number' ? createPlaceholderCandidate(candidateInput) : candidateInput;
        setSummaryCandidate(candidate);
        setSummaryDrawerOptions(options || null);
        setIsSummaryDrawerOpen(true);
    };

    const closeSummaryDrawer = () => {
        setIsSummaryDrawerOpen(false);
        setSummaryCandidate(null);
        setSummaryDrawerOptions(null);
    };

    const openMessageModal = (config: MessageModalConfig) => {
        setMessageModalConfig(config);
        setIsMessageModalOpen(true);
    };

    const closeMessageModal = () => {
        setIsMessageModalOpen(false);
        setTimeout(() => setMessageModalConfig(null), 300);
    };

    const openJobAlertModal = (config: JobAlertModalConfig) => {
        setJobAlertModalConfig(config);
        setIsJobAlertModalOpen(true);
    };

    const closeJobAlertModal = () => {
        setIsJobAlertModalOpen(false);
        setTimeout(() => setJobAlertModalConfig(null), 300);
    };

    return {
        isPreferencesOpen,
        openPreferences,
        closePreferences,
        isNewTaskOpen,
        openNewTask,
        closeNewTask,
        isSummaryDrawerOpen,
        summaryCandidate,
        summaryDrawerOptions,
        openSummaryDrawer,
        closeSummaryDrawer,
        isSidebarOpen,
        toggleSidebar,
        isMessageModalOpen,
        messageModalConfig,
        openMessageModal,
        closeMessageModal,
        isJobAlertModalOpen,
        jobAlertModalConfig,
        openJobAlertModal,
        closeJobAlertModal,
    };
};
