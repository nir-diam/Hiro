
// ... existing imports
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ResumeViewer from './components/ResumeViewer';
import TopBar from './components/TopBar';
import PreferencesModal from './components/PreferencesModal';
import NewTaskModal from './components/NewTaskModal';
import CandidateSummaryDrawer from './components/CandidateSummaryDrawer';
import { useUIState } from './hooks/useUIState';
import { useCandidateProfile } from './hooks/useCandidateProfile';
import { AppRoutes } from './routes';
import { type Event } from './components/EventsView';
import { useSavedSearches } from './context/SavedSearchesContext';
import SendMessageModal from './components/SendMessageModal';
import CreateJobAlertModal from './components/CreateJobAlertModal';
import { useLanguage } from './context/LanguageContext';
import { FinanceProvider } from './context/FinanceContext';
import { PromptProvider } from './context/PromptContext';
import { buildBreadcrumbs } from './utils/buildBreadcrumbs';
import { BreadcrumbProvider, useBreadcrumbContext } from './context/BreadcrumbContext';
import StaffPageGate from './components/StaffPageGate';


export type PageType = 'list' | 'profile' | 'new' | 'login' | 'jobs' | 'new-job' | 'clients' | 'new-client' | 'notifications' | 'company-settings' | 'coordinators-settings' | 'coordinator-profile' | 'admin-dashboard' | 'admin-client-form' | 'message-templates' | 'event-types-settings' | 'candidate-pool' | 'job-board' | 'finance';

const AppContent: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { savedSearches, addSearch, updateSearch } = useSavedSearches();
    const { t } = useLanguage();
    const { contactProfileParent } = useBreadcrumbContext();
    
    // ... (keep existing state hooks) ...
    const { 
        activeView, isMatchingJobs, isScreening, contentAreaRef, 
        handleSetActiveView, handleMatchingClick, handleScreeningClick, 
        setIsMatchingJobs, setIsScreening, setActiveView 
    } = useCandidateProfile();

    const {
        isPreferencesOpen, openPreferences, closePreferences,
        isNewTaskOpen, openNewTask, closeNewTask,
        isSummaryDrawerOpen, summaryCandidate, summaryDrawerOptions, openSummaryDrawer, closeSummaryDrawer,
        isSidebarOpen, toggleSidebar,
        isMessageModalOpen, messageModalConfig, openMessageModal, closeMessageModal,
        isJobAlertModalOpen, jobAlertModalConfig, openJobAlertModal, closeJobAlertModal,
    } = useUIState();

    const [events, setEvents] = useState<Event[]>([]);
    const [favorites, setFavorites] = useState<Set<number>>(new Set());

    const toggleFavorite = (id: number) => {
        setFavorites(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };
    
    const breadcrumbs = React.useMemo(
        () =>
            buildBreadcrumbs({
                pathname: location.pathname,
                search: location.search,
                savedSearches,
                t,
                contactProfileParent,
            }),
        [location.pathname, location.search, savedSearches, t, contactProfileParent],
    );

    const handleViewFullProfileFromDrawer = (candidateId: number) => {
        closeSummaryDrawer();
        navigate(`/candidates/${candidateId}`);
    };

    const handleSaveJob = (jobData: any) => {
        console.log("Saving job data:", jobData);
    };

    const handleSaveClient = (clientData: any) => {
        console.log("Saving client data:", clientData);
    };

    const handleSaveTask = (taskData: any) => {
        console.log("Saving new task:", taskData);
        const due =
            taskData.dueDate && taskData.dueTime
                ? new Date(`${taskData.dueDate}T${taskData.dueTime}`)
                : new Date();
        const dateIso = Number.isNaN(due.getTime()) ? new Date().toISOString() : due.toISOString();
        const primaryAssignee =
            Array.isArray(taskData.assigneeEmails) && taskData.assigneeEmails.length > 0
                ? String(taskData.assigneeEmails[0]).trim()
                : 'אני';
        const allocatedDays =
            taskData.isTask && Number.isFinite(Number(taskData.allocatedDays))
                ? Number(taskData.allocatedDays)
                : undefined;
        const newEvent = {
            id: Date.now(),
            type: [taskData.isTask ? 'משימת מערכת' : 'תזכורת'],
            description: taskData.messageText,
            date: dateIso,
            coordinator: primaryAssignee,
            status: 'עתידי' as const,
            linkedTo: [{ type: 'מועמד', name: 'שפירא גדעון' }],
            ...(allocatedDays != null ? { allocatedDays } : {}),
        } as Event;
        setEvents(prevEvents => [newEvent, ...prevEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        closeNewTask();
    };
    
    const handleSaveAlert = (alertData: { id?: number; name: string; frequency: 'daily' | 'weekly'; methods: ('email' | 'system')[] }) => {
        const { id, name, frequency, methods } = alertData;
        const config = { isAlert: true, frequency: frequency, notificationMethods: methods };

        if (jobAlertModalConfig?.mode === 'edit' && id) {
            const alertToUpdate = savedSearches.find(s => s.id === id);
            if (alertToUpdate) {
                updateSearch(id, name, alertToUpdate.isPublic, alertToUpdate.searchParams, alertToUpdate.additionalFilters, alertToUpdate.languageFilters, config);
            }
        } else if (jobAlertModalConfig?.mode === 'create') {
            addSearch(name, false, jobAlertModalConfig.currentFilters || {}, [], [], config);
        }
        closeJobAlertModal();
    };

    const isStandalonePage = 
        location.pathname.startsWith('/p/') || 
        location.pathname.startsWith('/jobs/public') ||
        /^\/jobs\/[^/]+\/public\//.test(location.pathname) ||
        location.pathname === '/login' || 
        location.pathname === '/activation' ||
        location.pathname === '/landing' ||
        location.pathname.startsWith('/candidate-portal') ||
        location.pathname.startsWith('/portal/manager') ||
        location.pathname === '/post-job';

    if (isStandalonePage) {
        return (
            <div className="h-screen w-screen overflow-hidden bg-bg-default text-text-default" dir="rtl">
                <div className="h-full w-full overflow-y-auto">
                    <AppRoutes
                            openSummaryDrawer={openSummaryDrawer}
                            handleSaveJob={handleSaveJob}
                            handleSaveClient={handleSaveClient}
                            setActiveView={setActiveView}
                            activeView={activeView}
                            handleSetActiveView={handleSetActiveView}
                            handleMatchingClick={handleMatchingClick}
                            handleScreeningClick={handleScreeningClick}
                            contentAreaRef={contentAreaRef}
                            isMatchingJobs={isMatchingJobs}
                            setIsMatchingJobs={setIsMatchingJobs}
                            isScreening={isScreening}
                            setIsScreening={setIsScreening}
                            events={events}
                            setEvents={setEvents}
                            onOpenNewTask={openNewTask}
                            openMessageModal={openMessageModal}
                            openJobAlertModal={openJobAlertModal}
                            favorites={favorites}
                            toggleFavorite={toggleFavorite}
                        />
                </div>
                {isMessageModalOpen && messageModalConfig && (
                    <SendMessageModal
                        isOpen={isMessageModalOpen}
                        onClose={closeMessageModal}
                        mode={messageModalConfig.mode}
                        candidateName={messageModalConfig.candidateName}
                        candidatePhone={messageModalConfig.candidatePhone}
                        candidateEmail={messageModalConfig.candidateEmail}
                        candidateId={messageModalConfig.candidateId}
                        recipientOptions={messageModalConfig.recipientOptions}
                        initialRecipientIds={messageModalConfig.initialRecipientIds}
                        linkedClientId={messageModalConfig.linkedClientId}
                        linkedOrganizationId={messageModalConfig.linkedOrganizationId}
                        linkedContactId={messageModalConfig.linkedContactId}
                        recipientType={messageModalConfig.recipientType}
                    />
                )}
            </div>
        );
    }

    return (
        <FinanceProvider>
            <StaffPageGate>
            <div className="flex h-screen bg-bg-default text-text-default" dir="rtl">
                <Sidebar 
                    isSidebarOpen={isSidebarOpen}
                    onClose={toggleSidebar}
                />
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    <TopBar 
                        breadcrumbs={breadcrumbs} 
                        onOpenPreferences={openPreferences}
                        onOpenNewTask={openNewTask}
                        onToggleSidebar={toggleSidebar}
                    />
                    <div
                        id="main-scroll-container"
                        className="flex-1 overflow-y-auto"
                        // Prevent browser scroll anchoring from jumping while React re-renders
                        style={{ overflowAnchor: 'none' } as any}
                    >
                        <main className="flex-1 p-3 md:p-6">
                            <PromptProvider>
                                <AppRoutes 
                                    openSummaryDrawer={openSummaryDrawer}
                                    handleSaveJob={handleSaveJob}
                                    handleSaveClient={handleSaveClient}
                                    setActiveView={setActiveView}
                                    activeView={activeView}
                                    handleSetActiveView={handleSetActiveView}
                                    handleMatchingClick={handleMatchingClick}
                                    handleScreeningClick={handleScreeningClick}
                                    contentAreaRef={contentAreaRef}
                                    isMatchingJobs={isMatchingJobs}
                                    setIsMatchingJobs={setIsMatchingJobs}
                                    isScreening={isScreening}
                                    setIsScreening={setIsScreening}
                                    events={events}
                                    setEvents={setEvents}
                                    onOpenNewTask={openNewTask}
                                    openMessageModal={openMessageModal}
                                    openJobAlertModal={openJobAlertModal}
                                    favorites={favorites}
                                    toggleFavorite={toggleFavorite}
                                />
                            </PromptProvider>
                        </main>
                    </div>
                </div>
                {isPreferencesOpen && <PreferencesModal onClose={closePreferences} />}
                <NewTaskModal 
                    isOpen={isNewTaskOpen} 
                    onClose={closeNewTask} 
                    onSave={handleSaveTask}
                    onOpenCandidateSummary={openSummaryDrawer}
                    pathname={location.pathname}
                />
                <CandidateSummaryDrawer
                    isOpen={isSummaryDrawerOpen}
                    onClose={closeSummaryDrawer}
                    candidate={summaryCandidate}
                    initialTab={summaryDrawerOptions?.initialTab}
                    initialManageLinkId={summaryDrawerOptions?.manageLinkId}
                    onViewFullProfile={handleViewFullProfileFromDrawer}
                    onOpenMessageModal={openMessageModal}
                    onOpenNewTask={openNewTask}
                    isFavorite={summaryCandidate ? favorites.has(summaryCandidate.id) : false}
                    onToggleFavorite={toggleFavorite}
                />
                {isMessageModalOpen && messageModalConfig && (
                    <SendMessageModal
                        isOpen={isMessageModalOpen}
                        onClose={closeMessageModal}
                        mode={messageModalConfig.mode}
                        candidateName={messageModalConfig.candidateName}
                        candidatePhone={messageModalConfig.candidatePhone}
                        candidateEmail={messageModalConfig.candidateEmail}
                        candidateId={messageModalConfig.candidateId}
                        recipientOptions={messageModalConfig.recipientOptions}
                        initialRecipientIds={messageModalConfig.initialRecipientIds}
                        linkedClientId={messageModalConfig.linkedClientId}
                        linkedOrganizationId={messageModalConfig.linkedOrganizationId}
                        linkedContactId={messageModalConfig.linkedContactId}
                        recipientType={messageModalConfig.recipientType}
                    />
                )}
                <CreateJobAlertModal
                    isOpen={isJobAlertModalOpen}
                    onClose={closeJobAlertModal}
                    onSave={handleSaveAlert}
                    config={jobAlertModalConfig}
                />
            </div>
            </StaffPageGate>
        </FinanceProvider>
    );
};

const App: React.FC = () => {
    return (
        <BreadcrumbProvider>
            <AppContent />
        </BreadcrumbProvider>
    );
}

export default App;
