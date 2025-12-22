
import React, { useState } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ResumeViewer from './components/ResumeViewer';
import TopBar from './components/TopBar';
import PreferencesModal from './components/PreferencesModal';
import NewTaskModal from './components/NewTaskModal';
import CandidateSummaryDrawer from './components/CandidateSummaryDrawer';
import { useUIState } from './hooks/useUIState';
import { useCandidateProfile } from './hooks/useCandidateProfile';
import { AppRoutes } from './routes';
import { type Event, initialEventsData } from './components/EventsView';
import { useSavedSearches } from './context/SavedSearchesContext';
import SendMessageModal from './components/SendMessageModal';
import CreateJobAlertModal from './components/CreateJobAlertModal';


export type PageType = 'list' | 'profile' | 'new' | 'login' | 'jobs' | 'new-job' | 'clients' | 'new-client' | 'notifications' | 'company-settings' | 'coordinators-settings' | 'coordinator-profile' | 'admin-dashboard' | 'admin-client-form' | 'message-templates' | 'event-types-settings' | 'candidate-pool' | 'job-board';

const AppContent: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { savedSearches, addSearch, updateSearch } = useSavedSearches();
    const [searchParams] = useSearchParams();
    
    const { 
        activeView, isMatchingJobs, isScreening, contentAreaRef, 
        handleSetActiveView, handleMatchingClick, handleScreeningClick, 
        setIsMatchingJobs, setIsScreening, setActiveView 
    } = useCandidateProfile();

    const {
        isPreferencesOpen, openPreferences, closePreferences,
        isNewTaskOpen, openNewTask, closeNewTask,
        isSummaryDrawerOpen, summaryCandidate, openSummaryDrawer, closeSummaryDrawer,
        isSidebarOpen, toggleSidebar,
        isMessageModalOpen, messageModalConfig, openMessageModal, closeMessageModal,
        isJobAlertModalOpen, jobAlertModalConfig, openJobAlertModal, closeJobAlertModal,
    } = useUIState();

    const [events, setEvents] = useState<Event[]>(initialEventsData);

    // --- Favorites State (Lifted Up) ---
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
    // -----------------------------------
    
    const breadcrumbs = React.useMemo(() => {
        const pathParts = location.pathname.split('/').filter(p => p);
        const crumbs = [{ label: 'Hiro', path: '/dashboard' }];
        
        if (pathParts[0] === 'dashboard') {
             crumbs.push({ label: 'דף הבית', path: '/dashboard' });
        }
        if (pathParts[0] === 'candidates') {
            crumbs.push({ label: 'רשימת מועמדים', path: '/candidates' });
            const savedSearchId = searchParams.get('savedSearchId');
            
            if (pathParts[1] && pathParts[1] !== 'new') {
                crumbs.push({ label: 'פרופיל מועמד', path: `/candidates/${pathParts[1]}` });
            } else if (savedSearchId) {
                const savedSearch = savedSearches.find(s => s.id === Number(savedSearchId));
                if (savedSearch) {
                    crumbs.push({ label: savedSearch.name, path: `/candidates?savedSearchId=${savedSearchId}` });
                }
            } else if (pathParts[1] === 'new') {
                crumbs.push({ label: 'מועמד חדש', path: '/candidates/new' });
            }
        }
         if (pathParts[0] === 'candidate-pool') {
            crumbs.push({ label: 'מאגר מועמדים', path: '/candidate-pool' });
        }
        if (pathParts[0] === 'job-board') {
            crumbs.push({ label: 'לוח משרות', path: '/job-board' });
        }
        if (pathParts[0] === 'jobs') {
            crumbs.push({ label: 'משרות', path: '/jobs' });
            if (pathParts[1] === 'new') {
                crumbs.push({ label: 'משרה חדשה', path: '/jobs/new' });
            }
            if (pathParts[1] === 'existing') {
                crumbs.push({ label: 'משרה קיימת', path: '/jobs/existing' });
                if (pathParts[2] === 'events') {
                    crumbs.push({ label: 'אירועי משרה', path: '/jobs/existing/events' });
                }
            }
        }
         if (pathParts[0] === 'clients') {
            crumbs.push({ label: 'לקוחות', path: '/clients' });
            if (pathParts[1] === 'new') {
                crumbs.push({ label: 'לקוח חדש', path: '/clients/new' });
            } else if (/^\d+$/.test(pathParts[1])) {
                crumbs.push({ label: 'פרופיל לקוח', path: `/clients/${pathParts[1]}` });
            }
        }
        if (pathParts[0] === 'reports') {
            crumbs.push({ label: 'דוחות', path: '/reports/referrals' });
            if (pathParts[1] === 'referrals') {
                crumbs.push({ label: 'הפניות', path: '/reports/referrals' });
            }
            if (pathParts[1] === 'publications') {
                crumbs.push({ label: 'פרסומים', path: '/reports/publications' });
            }
            if (pathParts[1] === 'recruitment-sources') {
                crumbs.push({ label: 'מקורות גיוס', path: '/reports/recruitment-sources' });
            }
        }
        if (pathParts[0] === 'settings') {
             crumbs.push({ label: 'הגדרות', path: '/settings/company' });
             if(pathParts[1] === 'company') crumbs.push({ label: 'חברה', path: '/settings/company' });
             if(pathParts[1] === 'coordinators') {
                crumbs.push({ label: 'רכזים', path: '/settings/coordinators' });
                if(pathParts[2]) crumbs.push({ label: 'פרופיל רכז', path: `/settings/coordinators/${pathParts[2]}`});
             }
             if(pathParts[1] === 'message-templates') crumbs.push({ label: 'תבניות להודעות', path: '/settings/message-templates' });
             if(pathParts[1] === 'event-types') crumbs.push({ label: 'סוגי אירועים', path: '/settings/event-types' });
             if(pathParts[1] === 'recruitment-sources') crumbs.push({ label: 'מקורות גיוס', path: '/settings/recruitment-sources' });
        }
         if (pathParts[0] === 'admin') {
             crumbs.push({ label: 'פאנל ניהול', path: '/admin' });
             if(pathParts[1] === 'client') crumbs.push({ label: 'טופס לקוח', path: '/admin/client/new' });
        }

        return crumbs;

    }, [location.pathname, searchParams, savedSearches]);

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
        const newEvent: Event = {
            id: Date.now(),
            type: taskData.isTask ? 'משימת מערכת' : 'תזכורת',
            title: taskData.messageText.substring(0, 50) + (taskData.messageText.length > 50 ? '...' : ''),
            description: taskData.messageText,
            date: new Date(`${taskData.dueDate}T${taskData.dueTime}`).toISOString(),
            coordinator: taskData.assignee,
            status: 'עתידי',
            linkedTo: { type: 'מועמד', name: 'שפירא גדעון' }, 
        };
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

    // Determine if we should show the main app shell (Sidebar/TopBar)
    // Pages starting with /p/ (public profile), /login, /candidate-portal, /portal/manager, /post-job
    // are "standalone" layouts.
    const isStandalonePage = 
        location.pathname.startsWith('/p/') || 
        location.pathname === '/login' || 
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
                {/* Global Modals for standalone pages if needed */}
                {isMessageModalOpen && messageModalConfig && (
                    <SendMessageModal
                        isOpen={isMessageModalOpen}
                        onClose={closeMessageModal}
                        mode={messageModalConfig.mode}
                        candidateName={messageModalConfig.candidateName}
                        candidatePhone={messageModalConfig.candidatePhone}
                    />
                )}
            </div>
        );
    }

    return (
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
                <div id="main-scroll-container" className="flex-1 overflow-y-auto">
                    <main className="flex-1 p-3 md:p-6">
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
                    </main>
                </div>
            </div>
            {isPreferencesOpen && <PreferencesModal onClose={closePreferences} />}
            <NewTaskModal 
                isOpen={isNewTaskOpen} 
                onClose={closeNewTask} 
                onSave={handleSaveTask}
                onOpenCandidateSummary={openSummaryDrawer}
            />
            <CandidateSummaryDrawer
                isOpen={isSummaryDrawerOpen}
                onClose={closeSummaryDrawer}
                candidate={summaryCandidate}
                onViewFullProfile={handleViewFullProfileFromDrawer}
                onOpenMessageModal={openMessageModal}
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
                />
            )}
            <CreateJobAlertModal 
                isOpen={isJobAlertModalOpen}
                onClose={closeJobAlertModal}
                onSave={handleSaveAlert}
                config={jobAlertModalConfig}
            />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <AppContent />
    );
}

export default App;
