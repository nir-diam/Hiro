
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UserGroupIcon, BriefcaseIcon, ChartPieIcon,BanknotesIcon, Cog6ToothIcon, HiroLogoIcon, ChevronDownIcon, SquaresPlusIcon, HiroLogotype, BuildingOffice2Icon, CircleStackIcon, BookmarkIcon, PencilIcon, TrashIcon, LockClosedIcon, WrenchScrewdriverIcon, ChartBarIcon, GlobeAmericasIcon, ArrowTopRightOnSquareIcon, ChatBubbleBottomCenterTextIcon, ArrowLeftIcon, ArrowRightIcon, DocumentTextIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { useSavedSearches } from '../context/SavedSearchesContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

// ... (Keep existing interfaces and NavItem/SubMenuLink components) ...
interface NavItemProps {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isOpen: boolean;
  to: string;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick, isOpen, to }) => {
    return (
        <Link
            to={to}
            onClick={onClick}
            title={!isOpen ? label : ''} // Show tooltip only when collapsed
            className={`flex items-center rounded-lg transition-all duration-200 group relative ${
                isActive ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20' : 'text-text-muted hover:bg-primary-50 hover:text-primary-700'
            } ${isOpen ? 'px-3 py-2.5 mx-2 justify-start' : 'p-3 mx-auto justify-center w-12 h-12'}`}
        >
            {React.cloneElement(icon, {
                className: `w-6 h-6 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-text-muted group-hover:text-primary-600'
                }`
            })}
            
            {/* Text Label - Only visible when open */}
            <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                {label}
            </span>
        </Link>
    );
};

const SubMenuLink: React.FC<{label: string, onClick: () => void, isActive: boolean, to: string}> = ({label, onClick, isActive, to}) => (
    <Link to={to} onClick={onClick} className={`block w-full text-start text-sm font-medium py-2 px-9 rounded-md transition-colors ${isActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-hover hover:text-text-default'}`}>
        {label}
    </Link>
);


interface SidebarProps {
    isSidebarOpen: boolean;
    onClose: () => void; // This toggles the state
}

type ConnectedUser = {
    id?: string;
    email?: string;
    name?: string;
    role?: string;
    phone?: string;
    effectivePermissions?: Record<string, boolean>;
};

const readStoredUser = (): ConnectedUser | null => {
    const raw = localStorage.getItem('herouser') || localStorage.getItem('user');
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const getInitial = (u: ConnectedUser | null): string => {
    const base = (u?.name || u?.email || '').trim();
    if (!base) return '?';
    return base[0].toUpperCase();
};

const roleLabelHe = (role?: string): string => {
    switch ((role || '').toLowerCase()) {
        case 'super_admin': return 'מנהל על';
        case 'admin': return 'אדמין';
        case 'recruiter': return 'מגייס/ת';
        case 'coordinator': return 'רכז/ת';
        case 'manager': return 'מנהל/ת';
        case 'candidate': return 'מועמד/ת';
        case 'guest': return 'אורח';
        default: return role || '';
    }
};

const Sidebar: React.FC<SidebarProps> = ({ isSidebarOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { savedSearches, deleteSearch } = useSavedSearches();
    const { t, dir } = useLanguage();
    const { canPage } = useAuth();
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const [connectedUser, setConnectedUser] = useState<ConnectedUser | null>(() => readStoredUser());

    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 1024);
    
    // Sub-menu states
    const [isCandidatesOpen, setIsCandidatesOpen] = useState(true);
    const [isSavedSearchesOpen, setIsSavedSearchesOpen] = useState(false);
    const [isJobsOpen, setIsJobsOpen] = useState(false);
    const [isClientsOpen, setIsClientsOpen] = useState(false);
    const [isFinanceOpen, setIsFinanceOpen] = useState(false); // New state for Finance
    const [isReportsOpen, setIsReportsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMiscOpen, setIsMiscOpen] = useState(false);

    // ... (Keep existing useEffect and handlers) ...
    useEffect(() => {
        const handleResize = () => {
            setIsMobileView(window.innerWidth < 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        // Keep sidebar user in sync across tabs/windows
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'herouser' || e.key === 'user' || e.key === 'token' || e.key === null) {
                setConnectedUser(readStoredUser());
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        // Refresh from localStorage on navigation (same-tab login/logout won't trigger `storage`)
        setConnectedUser(readStoredUser());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    useEffect(() => {
        // Refresh on window focus (helps after returning from login / other flows)
        const onFocus = () => setConnectedUser(readStoredUser());
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, []);

    useEffect(() => {
        // If we have a token but missing user details (like name), fetch /auth/me
        const token = localStorage.getItem('token');
        if (!token) return;

        const hasName = !!(connectedUser?.name && connectedUser.name.trim());
        const hasPerms =
            connectedUser?.effectivePermissions &&
            typeof connectedUser.effectivePermissions === 'object' &&
            Object.keys(connectedUser.effectivePermissions).length > 0;
        if (hasName && hasPerms) return;

        let cancelled = false;
        (async () => {
            try {
                const meUrl = apiBase ? `${apiBase}/api/auth/me` : '/api/auth/me';
                const res = await fetch(meUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const me = await res.json();
                if (cancelled) return;
                setConnectedUser(me);
                try {
                    localStorage.setItem('herouser', JSON.stringify(me));
                    localStorage.setItem('user', JSON.stringify(me));
                } catch {}
            } catch {
                // ignore
            }
        })();

        return () => { cancelled = true; };
    }, [apiBase, connectedUser?.name, connectedUser?.effectivePermissions]);

    const handleNavigation = (path: string) => {
        navigate(path);
        if (isMobileView) {
            onClose();
        }
    };

    const handleOpenPublicProfile = (e: React.MouseEvent) => {
        e.preventDefault();
        navigate('/p/gidon-shapira');
    };

								
			    const handleLogout = () => {
        try {
            localStorage.clear();
        } catch (e) {
            console.error('Failed to clear localStorage', e);
        }
        setConnectedUser(null);
        navigate('/login');
    };
 
								 
					 
															 
		 
						   
	  

																							 
																							
    const isOpen = isSidebarOpen; 
    const pathname = location.pathname;

    const isCandidatesActive = pathname.startsWith('/candidates');
    const isCandidatePoolActive = pathname.startsWith('/candidate-pool');
    const isJobBoardActive = pathname.startsWith('/job-board');
    const isJobsActive = pathname.startsWith('/jobs');
    const isClientsActive = pathname.startsWith('/clients');
    const isFinanceActive = pathname.startsWith('/finance'); // New active check
    const isReportsActive = pathname.startsWith('/reports');
    const isMiscActive = pathname.startsWith('/login') || pathname.startsWith('/p/');
    const isSettingsActive = pathname.startsWith('/settings') || pathname.startsWith('/admin');
    const isCommunicationsActive = pathname.startsWith('/communications');

    // ... (Keep handleParentClick) ...
    const handleParentClick = (
        subState: boolean, 
        setSubState: React.Dispatch<React.SetStateAction<boolean>>, 
        navPath: string
    ) => {
        if (!isOpen && !isMobileView) {
            onClose(); // Expand sidebar
            setSubState(true); // Open sub-menu
            return;
        }
        
        if (isOpen) {
            setSubState(!subState);
        } else {
             handleNavigation(navPath);
        }
    };

																  
    const CollapseIcon = isOpen 
        ? (dir === 'rtl' ? ChevronRightIcon : ChevronLeftIcon)
        : (dir === 'rtl' ? ChevronLeftIcon : ChevronRightIcon);

    return (
        <>
            {/* Mobile Overlay */}
            {isMobileView && isSidebarOpen && (
                <div onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden transition-opacity"></div>
            )}
            
            <aside 
                className={`bg-bg-card border-e border-border-default flex flex-col transition-all duration-300 ease-in-out z-40
                    ${isMobileView 
                        ? `fixed top-0 bottom-0 h-full start-0 shadow-2xl ${isSidebarOpen ? 'translate-x-0 w-72' : (dir === 'rtl' ? 'translate-x-full' : '-translate-x-full')} w-72`
                        : `relative flex-shrink-0 h-screen sticky top-0 ${isOpen ? 'w-64' : 'w-20'}`
                    }
                `}
            >
                {/* Logo Area */}
                <div className={`flex items-center h-20 border-b border-border-default shrink-0 transition-all ${isOpen ? 'px-6' : 'justify-center px-0'}`}>
                    <Link to="/dashboard" title="דף הבית">
                        {isOpen ? (
                            <HiroLogotype className="h-8" />
                        ) : (
                            <HiroLogoIcon className="w-9 h-9 text-primary-600" />
                        )}
                    </Link>
                </div>
                
                {/* Navigation Items */}
                <div className="flex-1 flex flex-col justify-between overflow-y-auto overflow-x-hidden custom-scrollbar py-4 space-y-1">
                    <nav className="flex flex-col space-y-1">
                        
                        {canPage('page:candidates') && (
                        <div className="w-full">
                            <button
                                onClick={() => handleParentClick(isCandidatesOpen, setIsCandidatesOpen, '/candidates')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isCandidatesActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? t('nav.candidates') : ''}
                            >
                                <div className="flex items-center">
                                    <UserGroupIcon className={`w-6 h-6 shrink-0 transition-colors ${isCandidatesActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        {t('nav.candidates')}
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isCandidatesOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            
                            {/* ... (Existing Submenu) ... */}
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isCandidatesOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                    <SubMenuLink 
                                        to={`/candidates${location.pathname.startsWith('/candidates') ? location.search : ''}`}
                                        label={t('nav.list_candidates')}
                                        onClick={() => handleNavigation(`/candidates${location.pathname.startsWith('/candidates') ? location.search : ''}`)} 
                                        isActive={pathname === '/candidates' || (pathname.startsWith('/candidates/') && !pathname.includes('new'))}
                                    />
                                    {canPage('page:reports') && (
                                        <SubMenuLink
                                            to="/reports/referrals"
                                            label={t('referrals_view.title')}
                                            onClick={() => handleNavigation('/reports/referrals')}
                                            isActive={pathname === '/reports/referrals'}
                                        />
                                    )}
                                    <SubMenuLink 
                                        to="/candidates/new"
                                        label={t('nav.new_candidate')}
                                        onClick={() => handleNavigation('/candidates/new')} 
                                        isActive={pathname === '/candidates/new'}
                                    />
                                    {/* ... (Saved Searches) ... */}
                                    <button
                                        onClick={() => setIsSavedSearchesOpen(!isSavedSearchesOpen)}
                                        className="w-full text-start text-sm font-medium py-2 px-9 text-text-muted hover:bg-bg-hover hover:text-text-default flex items-center justify-between group"
                                    >
                                        <span>{t('nav.saved_searches')}</span>
                                        <ChevronDownIcon className={`w-3 h-3 transition-transform ${isSavedSearchesOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    
                                    {isSavedSearchesOpen && (
                                        <div className="bg-bg-subtle/30 py-1 border-y border-border-subtle/50">
                                            {savedSearches.length > 0 ? (
                                                savedSearches.map(search => (
                                                    <div key={search.id} className="relative group/search">
                                                        <Link 
                                                            to={`/candidates?savedSearchId=${search.id}`} 
                                                            onClick={() => handleNavigation(`/candidates?savedSearchId=${search.id}`)}
                                                            className="block w-full text-start text-xs py-1.5 px-11 text-text-subtle hover:text-primary-600 truncate"
                                                        >
                                                            {search.name}
                                                        </Link>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); deleteSearch(search.id); }} 
                                                            className="absolute start-2 top-1/2 -translate-y-1/2 p-1 text-text-subtle hover:text-red-500 opacity-0 group-hover/search:opacity-100 transition-opacity"
                                                        >
                                                            <TrashIcon className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <span className="block py-1.5 px-11 text-xs text-text-subtle">אין חיפושים</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        )}
                        
                        {canPage('page:communications') && (
                        <NavItem 
                            to="/communications"
                            label={t('nav.communications')} 
                            icon={<ChatBubbleBottomCenterTextIcon />} 
                            isActive={isCommunicationsActive} 
                            onClick={() => handleNavigation('/communications')}
                            isOpen={isOpen} 
                        />
                        )}
                         
                        {canPage('page:candidate_pool') && (
                         <NavItem 
                            to="/candidate-pool"
                            label={t('nav.candidate_pool')}
                            icon={<CircleStackIcon />} 
                            isActive={isCandidatePoolActive} 
                            onClick={() => handleNavigation('/candidate-pool')}
                            isOpen={isOpen} 
                        />
                        )}

                        {canPage('page:job_board') && (
                        <NavItem 
                            to="/job-board"
                            label={t('nav.job_board')}
                            icon={<BriefcaseIcon />} 
                            isActive={isJobBoardActive} 
                            onClick={() => handleNavigation('/job-board')}
                            isOpen={isOpen} 
                        />
                        )}

                        {/* Jobs Group */}
                        {canPage('page:jobs') && (
                        <div className="w-full">
                             <button
                                onClick={() => handleParentClick(isJobsOpen, setIsJobsOpen, '/jobs')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isJobsActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? t('nav.jobs') : ''}
                            >
                                <div className="flex items-center">
                                    <BriefcaseIcon className={`w-6 h-6 shrink-0 transition-colors ${isJobsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        {t('nav.jobs')}
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isJobsOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isJobsOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                    <SubMenuLink 
                                        to="/jobs"
                                        label={t('nav.list_jobs')} 
                                        onClick={() => handleNavigation('/jobs')} 
                                        isActive={isJobsActive && !pathname.startsWith('/jobs/new') && !pathname.startsWith('/jobs/existing')}
                                    />
                                    <SubMenuLink 
                                        to="/jobs/new"
                                        label={t('nav.new_job')}
                                        onClick={() => handleNavigation('/jobs/new')} 
                                        isActive={pathname === '/jobs/new'}
                                    />
                                     <SubMenuLink 
                                        to="/jobs/existing"
                                        label={t('nav.existing_job')}
                                        onClick={() => handleNavigation('/jobs/existing')} 
                                        isActive={pathname.startsWith('/jobs/existing')}
                                    />
                                    <SubMenuLink 
                                        to="/jobs/existing/events"
                                        label={t('job_events.title')}
                                        onClick={() => handleNavigation('/jobs/existing/events')} 
                                        isActive={pathname === '/jobs/existing/events'}
                                    />
                                </div>
                            </div>
                        </div>
                        )}

                        {/* Clients Group */}
                        {canPage('page:clients') && (
                        <div className="w-full">
                            <button
                                onClick={() => handleParentClick(isClientsOpen, setIsClientsOpen, '/clients')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isClientsActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? t('nav.clients') : ''}
                            >
                                <div className="flex items-center">
                                    <BuildingOffice2Icon className={`w-6 h-6 shrink-0 transition-colors ${isClientsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        {t('nav.clients')}
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isClientsOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isClientsOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                    <SubMenuLink 
                                        to="/clients"
                                        label={t('nav.list_clients')} 
                                        onClick={() => handleNavigation('/clients')} 
                                        isActive={pathname === '/clients' || /^\/clients\/\d+/.test(pathname)}
                                    />
                                    <SubMenuLink 
                                        to="/clients/new"
                                        label={t('nav.new_client')}
                                        onClick={() => handleNavigation('/clients/new')} 
                                        isActive={pathname === '/clients/new'}
                                    />
                                </div>
                            </div>
                        </div>
                        )}

                        {/* --- FINANCE GROUP (NEW) --- */}
                        {canPage('page:finance') && (
                        <div className="w-full">
                            <button
                                onClick={() => handleParentClick(isFinanceOpen, setIsFinanceOpen, '/finance')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isFinanceActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? 'כספים' : ''}
                            >
                                <div className="flex items-center">
                                    <BanknotesIcon className={`w-6 h-6 shrink-0 transition-colors ${isFinanceActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        כספים
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isFinanceOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isFinanceOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                    <SubMenuLink 
                                        to="/finance/dashboard"
                                        label="דשבורד פיננסי" 
                                        onClick={() => handleNavigation('/finance/dashboard')} 
                                        isActive={pathname === '/finance/dashboard'}
                                    />
                                    <SubMenuLink 
                                        to="/finance/invoices"
                                        label="גבייה וחשבוניות"
                                        onClick={() => handleNavigation('/finance/invoices')} 
                                        isActive={pathname === '/finance/invoices'}
                                    />
                                     <SubMenuLink 
                                        to="/finance/commissions"
                                        label="עמלות רכזות"
                                        onClick={() => handleNavigation('/finance/commissions')} 
                                        isActive={pathname === '/finance/commissions'}
                                    />
                                </div>
                            </div>
                        </div>
                        )}

                         {/* Reports Group */}
                         {canPage('page:reports') && (
                         <div className="w-full">
                            <button
                                onClick={() => handleParentClick(isReportsOpen, setIsReportsOpen, '/reports')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isReportsActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? t('nav.reports') : ''}
                            >
                                <div className="flex items-center">
                                    <ChartPieIcon className={`w-6 h-6 shrink-0 transition-colors ${isReportsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        {t('nav.reports')}
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isReportsOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            {/* ... (Existing Submenu) ... */}
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isReportsOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                     <SubMenuLink 
                                        to="/reports/bi"
                                        label={t('nav.bi_report')}
                                        onClick={() => handleNavigation('/reports/bi')} 
                                        isActive={pathname === '/reports/bi'}
                                    />
                                    <SubMenuLink 
                                        to="/reports/referrals"
                                        label={t('nav.referrals')}
                                        onClick={() => handleNavigation('/reports/referrals')} 
                                        isActive={pathname === '/reports/referrals'}
                                    />
                                     <SubMenuLink 
                                        to="/reports/publications"
                                        label={t('nav.publications')}
                                        onClick={() => handleNavigation('/reports/publications')} 
                                        isActive={pathname === '/reports/publications'}
                                    />
                                    <SubMenuLink 
                                        to="/reports/recruitment-sources"
                                        label={t('nav.recruitment_sources')}
                                        onClick={() => handleNavigation('/reports/recruitment-sources')} 
                                        isActive={pathname === '/reports/recruitment-sources'}
                                    />
                                </div>
                            </div>
                        </div>
                        )}

                         {/* Settings Group */}
                         {(canPage('page:settings') || canPage('page:admin')) && (
                         <div className="w-full">
                            <button
                                onClick={() => handleParentClick(isSettingsOpen, setIsSettingsOpen, '/settings')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isSettingsActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? t('nav.settings') : ''}
                            >
                                <div className="flex items-center">
                                    <WrenchScrewdriverIcon className={`w-6 h-6 shrink-0 transition-colors ${isSettingsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        {t('nav.settings')}
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isSettingsOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isSettingsOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                    {canPage('page:settings') && (
                                    <>
                                    <SubMenuLink 
                                        to="/settings/company"
                                        label={t('nav.company_settings')}
                                        onClick={() => handleNavigation('/settings/company')} 
                                        isActive={pathname === '/settings/company'}
                                    />
                                    <SubMenuLink 
                                        to="/settings/coordinators"
                                        label={t('nav.coordinators')}
                                        onClick={() => handleNavigation('/settings/coordinators')} 
                                        isActive={pathname.startsWith('/settings/coordinators')}
                                    />
                                    <SubMenuLink 
                                        to="/settings/message-templates"
                                        label={t('nav.message_templates')}
                                        onClick={() => handleNavigation('/settings/message-templates')} 
                                        isActive={pathname === '/settings/message-templates'}
                                    />
                                    <SubMenuLink 
                                        to="/settings/event-types"
                                        label={t('nav.event_types')}
                                        onClick={() => handleNavigation('/settings/event-types')} 
                                        isActive={pathname === '/settings/event-types'}
                                    />
                                    <SubMenuLink 
                                        to="/settings/recruitment-sources"
                                        label={t('nav.recruitment_sources')}
                                        onClick={() => handleNavigation('/settings/recruitment-sources')} 
                                        isActive={pathname === '/settings/recruitment-sources'}
                                    />
                                     <SubMenuLink 
                                        to="/settings/questionnaires"
                                        label={t('breadcrumbs.questionnaires')}
                                        onClick={() => handleNavigation('/settings/questionnaires')} 
                                        isActive={pathname === '/settings/questionnaires'}
                                    />
                                    </>
                                    )}
                                    {canPage('page:admin') && (
                                    <SubMenuLink 
                                        to="/admin"
                                        label={t('nav.admin_panel')}
                                        onClick={() => handleNavigation('/admin')} 
                                        isActive={pathname.startsWith('/admin')}
                                    />
                                    )}
                                </div>
                            </div>
                        </div>
                        )}

                         {/* Misc Group */}
                         {canPage('page:dashboard') && (
                         <div className="w-full">
                            <button
                                onClick={() => handleParentClick(isMiscOpen, setIsMiscOpen, '')}
                                className={`w-full flex items-center transition-all duration-200 group relative
                                    ${isMiscActive ? 'text-primary-700 bg-primary-50' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}
                                    ${isOpen ? 'px-3 py-2.5 mx-2 rounded-lg justify-between' : 'p-3 mx-auto justify-center rounded-lg w-12 h-12'}
                                `}
                                title={!isOpen ? t('nav.misc') : ''}
                            >
                                <div className="flex items-center">
                                    <SquaresPlusIcon className={`w-6 h-6 shrink-0 transition-colors ${isMiscActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'}`}/>
                                    <span className={`font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isOpen ? 'w-auto opacity-100 ms-3' : 'w-0 opacity-0'}`}>
                                        {t('nav.misc')}
                                    </span>
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 ${isMiscOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ${isOpen && isMiscOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <div className="mt-1 space-y-0.5">
                                     <SubMenuLink 
                                        to="/landing"
                                        label="דף נחיתה (Marketing Site)"
                                        onClick={() => handleNavigation('/landing')} 
                                        isActive={pathname === '/landing'}
                                    />
                                    <SubMenuLink 
                                        to="/login"
                                        label={t('nav.login')}
                                        onClick={() => handleNavigation('/login')} 
                                        isActive={pathname === '/login'}
                                    />
                                    <div className="relative group/public">
                                         <a 
                                            href="#" 
                                            onClick={handleOpenPublicProfile}
                                            className="block w-full text-start text-sm font-medium py-2 px-9 rounded-md text-text-muted hover:bg-bg-hover hover:text-text-default"
                                        >
                                            {t('nav.public_profile')}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}

                    </nav>
                </div>
                
                {/* ... (Existing Footer) ... */}
                <div className="border-t border-border-default mt-auto">
                    {/* Only show collapse toggle on desktop */}
                    {!isMobileView && (
                        <div className="p-2 border-b border-border-default flex justify-center">
                            <button 
                                onClick={onClose} 
                                className="p-2 text-text-muted hover:bg-bg-subtle rounded-lg w-full flex items-center justify-center transition-colors hover:text-primary-600"
                                title={isOpen ? "סגור סרגל" : "פתח סרגל"}
                            >
                                <CollapseIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    
                    <div className="p-4">
                        <button className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-bg-subtle transition-colors group ${!isOpen ? 'justify-center' : ''}`}>
                             <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-lg border-2 border-white shadow-sm group-hover:scale-105 transition-transform">
                                 {getInitial(connectedUser)}
                             </div>
                             <div className={`flex flex-col text-start overflow-hidden transition-all duration-300 ${isOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}`}>
                                 <span className="font-bold text-sm text-text-default truncate">
                                     {connectedUser?.name || connectedUser?.email || 'משתמש'}
                                 </span>
                                 <span className="text-xs text-text-muted truncate">
                                     {roleLabelHe(connectedUser?.role)}
                                 </span>
                             </div>
                        </button>
                        <div className={`mt-2 flex justify-center transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
                            <button onClick={handleLogout} className="text-xs text-text-subtle hover:text-red-500 flex items-center gap-1 p-1">
                                 <ArrowTopRightOnSquareIcon className="w-3 h-3"/>
                                 <span>התנתק</span>
                             </button>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
