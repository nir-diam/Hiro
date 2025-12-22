import { useState } from 'react';
import { Candidate, candidatesData } from '../components/CandidatesListView';
import { JobAlertModalConfig } from '../components/CreateJobAlertModal';

export type MessageMode = 'whatsapp' | 'sms' | 'email';

export interface MessageModalConfig {
    mode: MessageMode;
    candidateName: string;
    candidatePhone: string;
}

export const useUIState = () => {
    const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
    const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
    const [isSummaryDrawerOpen, setIsSummaryDrawerOpen] = useState(false);
    const [summaryCandidate, setSummaryCandidate] = useState<Candidate | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [messageModalConfig, setMessageModalConfig] = useState<MessageModalConfig | null>(null);
    // New state for Job Alert Modal
    const [isJobAlertModalOpen, setIsJobAlertModalOpen] = useState(false);
    const [jobAlertModalConfig, setJobAlertModalConfig] = useState<JobAlertModalConfig | null>(null);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    
    const openPreferences = () => setIsPreferencesOpen(true);
    const closePreferences = () => setIsPreferencesOpen(false);

    const openNewTask = () => setIsNewTaskOpen(true);
    const closeNewTask = () => setIsNewTaskOpen(false);

    const openSummaryDrawer = (candidateId: number) => {
        const candidate = candidatesData.find(c => c.id === candidateId);
        if (candidate) {
            setSummaryCandidate(candidate);
            setIsSummaryDrawerOpen(true);
        }
    };

    const closeSummaryDrawer = () => {
        setIsSummaryDrawerOpen(false);
        setSummaryCandidate(null);
    };

    const openMessageModal = (config: MessageModalConfig) => {
        setMessageModalConfig(config);
        setIsMessageModalOpen(true);
    };

    const closeMessageModal = () => {
        setIsMessageModalOpen(false);
        // A small delay to allow for fade out animation before clearing data
        setTimeout(() => setMessageModalConfig(null), 300);
    };

    // New functions for Job Alert Modal
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
