
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UserGroupIcon, BriefcaseIcon, ChartPieIcon, Cog6ToothIcon, HiroLogoIcon, ChevronDownIcon, SquaresPlusIcon, HiroLogotype, BuildingOffice2Icon, CircleStackIcon, BookmarkIcon, PencilIcon, TrashIcon, LockClosedIcon, WrenchScrewdriverIcon, ChartBarIcon, GlobeAmericasIcon, ArrowTopRightOnSquareIcon, ChatBubbleBottomCenterTextIcon } from './Icons';
import { useSavedSearches } from '../context/SavedSearchesContext';

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
            title={label}
            className={`w-full flex items-center rounded-lg transition-colors duration-200 group ${
                isActive ? 'bg-primary-600 text-white' : 'text-text-muted hover:bg-primary-100'
            } ${isOpen ? 'justify-start p-3' : 'h-16 justify-center'}`}
        >
            {React.cloneElement(icon, {
                className: `w-7 h-7 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-text-muted group-hover:text-primary-600'
                } ${isOpen ? 'ml-4' : ''}`
            })}
            {isOpen && <span className="font-bold text-base whitespace-nowrap">{label}</span>}
        </Link>
    );
};

const SubMenuLink: React.FC<{label: string, onClick: () => void, isActive: boolean, to: string}> = ({label, onClick, isActive, to}) => (
    <Link to={to} onClick={onClick} className={`block w-full text-right text-base font-medium py-2 px-4 rounded-md transition-colors ${isActive ? 'text-primary-700 bg-primary-100' : 'text-text-muted hover:bg-bg-hover'}`}>
        {label}
    </Link>
);


interface SidebarProps {
    isSidebarOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isSidebarOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { savedSearches, deleteSearch } = useSavedSearches();

    const [isHoverOpen, setIsHoverOpen] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 1024);
    const [isCandidatesOpen, setIsCandidatesOpen] = useState(true);
    const [isSavedSearchesOpen, setIsSavedSearchesOpen] = useState(false);
    const [isJobsOpen, setIsJobsOpen] = useState(false);
    const [isClientsOpen, setIsClientsOpen] = useState(false);
    const [isReportsOpen, setIsReportsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMiscOpen, setIsMiscOpen] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsMobileView(window.innerWidth < 1024);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    const isOpen = (!isMobileView && isHoverOpen) || (isMobileView && isSidebarOpen);
    const pathname = location.pathname;

    const isCandidatesActive = pathname.startsWith('/candidates');
    const isCandidatePoolActive = pathname.startsWith('/candidate-pool');
    const isJobBoardActive = pathname.startsWith('/job-board');
    const isJobsActive = pathname.startsWith('/jobs');
    const isClientsActive = pathname.startsWith('/clients');
    const isReportsActive = pathname.startsWith('/reports');
    const isMiscActive = pathname.startsWith('/login') || pathname.startsWith('/p/');
    const isSettingsActive = pathname.startsWith('/settings') || pathname.startsWith('/admin');
    const isCommunicationsActive = pathname.startsWith('/communications');

    return (
        <>
            {isMobileView && isSidebarOpen && (
                <div onClick={onClose} className="fixed inset-0 bg-black bg-opacity-30 z-30 lg:hidden"></div>
            )}
            <aside 
                onMouseEnter={() => !isMobileView && setIsHoverOpen(true)}
                onMouseLeave={() => !isMobileView && setIsHoverOpen(false)}
                className={`bg-bg-card border-l border-border-default flex flex-col shadow-md transition-all duration-300 ease-in-out z-40
                    ${isMobileView 
                        ? `fixed top-0 bottom-0 h-full ${isSidebarOpen ? 'translate-x-0 w-64' : 'translate-x-full w-64'}`
                        : `relative flex-shrink-0 ${(isHoverOpen) ? 'w-64' : 'w-24'}`
                    }
                `}
            >
                <Link 
                    to="/dashboard" 
                    title="Go to Dashboard"
                    className={`flex items-center h-20 border-b border-border-default shrink-0 ${isOpen ? 'justify-start px-4' : 'justify-center px-0'}`}
                >
                    {isOpen ? (
                        <HiroLogotype className="text-3xl" />
                    ) : (
                        <HiroLogoIcon className="w-8 h-8 text-primary-600" />
                    )}
                </Link>
                
                <div className="flex-1 flex flex-col justify-between overflow-y-auto overflow-x-hidden">
                    <nav className={`flex flex-col space-y-2 ${isOpen ? 'p-4' : 'p-2 items-center'}`}>
                        {/* Candidates Collapsible Menu */}
                        <div className="w-full">
                            <button
                                onClick={() => {
                                    if (isOpen) {
                                        setIsCandidatesOpen(!isCandidatesOpen);
                                    } else {
                                        handleNavigation('/candidates');
                                    }
                                }}
                                aria-expanded={isOpen && isCandidatesOpen}
                                aria-controls="candidates-submenu"
                                className={`w-full flex items-center justify-between p-3 rounded-lg group transition-colors ${
                                    isCandidatesActive ? 'bg-primary-50 text-primary-700' : 'text-text-muted hover:bg-primary-100'
                                } ${!isOpen ? 'h-16 justify-center' : ''}`}
                            >
                                <div className="flex items-center">
                                    <UserGroupIcon className={`w-7 h-7 shrink-0 ${isCandidatesActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'} ${isOpen ? 'ml-4' : ''}`}/>
                                    {isOpen && <span className="font-bold text-base">מועמדים</span>}
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isCandidatesOpen ? '' : '-rotate-90'}`} />
                                )}
                            </button>
                            {isOpen && isCandidatesOpen && (
                                <div id="candidates-submenu" className="mt-2 space-y-1 pr-6 pl-2">
                                    <SubMenuLink 
                                        to="/candidates"
                                        label="רשימת מועמדים" 
                                        onClick={() => handleNavigation('/candidates')} 
                                        isActive={pathname === '/candidates' || (pathname.startsWith('/candidates/') && !pathname.includes('new'))}
                                    />
                                    <SubMenuLink 
                                        to="/candidates/new"
                                        label="מועמד חדש" 
                                        onClick={() => handleNavigation('/candidates/new')} 
                                        isActive={pathname === '/candidates/new'}
                                    />
                                    <div className="border-t border-border-default my-2 -mx-2"></div>
                                    <div className="w-full">
                                        <button
                                            onClick={() => setIsSavedSearchesOpen(!isSavedSearchesOpen)}
                                            className="w-full flex items-center justify-between py-2 text-base font-medium text-text-muted hover:bg-bg-hover rounded-md"
                                        >
                                            <div className="flex items-center gap-2">
                                                <BookmarkIcon className="w-5 h-5" />
                                                <span>חיפושים שמורים</span>
                                            </div>
                                            <ChevronDownIcon className={`w-5 h-5 transition-transform ${isSavedSearchesOpen ? '' : '-rotate-90'}`} />
                                        </button>
                                        {isSavedSearchesOpen && (
                                        <div className="mt-1 space-y-1 pr-4">
                                            {savedSearches.length > 0 ? (
                                            savedSearches.map(search => (
                                                <div key={search.id} className="group flex items-center justify-between w-full text-right rounded-md transition-colors text-sm text-text-muted hover:bg-bg-hover">
                                                    <Link to={`/candidates?savedSearchId=${search.id}`} onClick={() => handleNavigation(`/candidates?savedSearchId=${search.id}`)} className="flex-grow py-1.5 px-2 flex items-center gap-2">
                                                        {search.isPublic 
                                                            ? <span title="חיפוש ציבורי"><UserGroupIcon className="w-4 h-4 text-text-subtle flex-shrink-0"/></span> 
                                                            : <span title="חיפוש פרטי"><LockClosedIcon className="w-4 h-4 text-text-subtle flex-shrink-0"/></span>
                                                        }
                                                        <span className="truncate">{search.name}</span>
                                                    </Link>
                                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={(e) => { e.stopPropagation(); deleteSearch(search.id); }} className="p-1 text-text-subtle hover:text-red-500"><TrashIcon className="w-4 h-4"/></button>
                                                    </div>
                                                </div>
                                            ))
                                            ) : (
                                            <span className="block py-1.5 px-2 text-xs text-text-subtle">אין חיפושים שמורים.</span>
                                            )}
                                        </div>
                                        )}
                                    </div>

                                </div>
                            )}
                        </div>
                        
                        <NavItem 
                            to="/communications"
                            label="מרכז תקשורת" 
                            icon={<ChatBubbleBottomCenterTextIcon />} 
                            isActive={isCommunicationsActive} 
                            onClick={() => handleNavigation('/communications')}
                            isOpen={isOpen} 
                        />
                         
                         <NavItem 
                            to="/candidate-pool"
                            label="מאגר מועמדים" 
                            icon={<CircleStackIcon />} 
                            isActive={isCandidatePoolActive} 
                            onClick={() => handleNavigation('/candidate-pool')}
                            isOpen={isOpen} 
                        />

                        <NavItem 
                            to="/job-board"
                            label="לוח משרות" 
                            icon={<BriefcaseIcon />} 
                            isActive={isJobBoardActive} 
                            onClick={() => handleNavigation('/job-board')}
                            isOpen={isOpen} 
                        />

                        <div className="w-full">
                            <button
                                onClick={() => {
                                    if (isOpen) {
                                        setIsJobsOpen(!isJobsOpen);
                                    } else {
                                        handleNavigation('/jobs');
                                    }
                                }}
                                aria-expanded={isOpen && isJobsOpen}
                                aria-controls="jobs-submenu"
                                className={`w-full flex items-center justify-between p-3 rounded-lg group transition-colors ${
                                    isJobsActive ? 'bg-primary-50 text-primary-700' : 'text-text-muted hover:bg-primary-100'
                                } ${!isOpen ? 'h-16 justify-center' : ''}`}
                            >
                                <div className="flex items-center">
                                    <BriefcaseIcon className={`w-7 h-7 shrink-0 ${isJobsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'} ${isOpen ? 'ml-4' : ''}`}/>
                                    {isOpen && <span className="font-bold text-base">משרות</span>}
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isJobsOpen ? '' : '-rotate-90'}`} />
                                )}
                            </button>
                            {isOpen && isJobsOpen && (
                                <div id="jobs-submenu" className="mt-2 space-y-1 pr-6 pl-2">
                                    <SubMenuLink 
                                        to="/jobs"
                                        label="רשימת משרות" 
                                        onClick={() => handleNavigation('/jobs')} 
                                        isActive={isJobsActive && !pathname.startsWith('/jobs/new') && !pathname.startsWith('/jobs/existing')}
                                    />
                                    <SubMenuLink 
                                        to="/jobs/new"
                                        label="פתיחת משרה חדשה" 
                                        onClick={() => handleNavigation('/jobs/new')} 
                                        isActive={pathname === '/jobs/new'}
                                    />
                                     <SubMenuLink 
                                        to="/jobs/existing"
                                        label="משרה קיימת" 
                                        onClick={() => handleNavigation('/jobs/existing')} 
                                        isActive={pathname === '/jobs/existing'}
                                    />
                                </div>
                            )}
                        </div>
                         {/* Clients Collapsible Menu */}
                        <div className="w-full">
                            <button
                                onClick={() => {
                                    if (isOpen) {
                                        setIsClientsOpen(!isClientsOpen);
                                    } else {
                                        handleNavigation('/clients');
                                    }
                                }}
                                aria-expanded={isOpen && isClientsOpen}
                                aria-controls="clients-submenu"
                                className={`w-full flex items-center justify-between p-3 rounded-lg group transition-colors ${
                                    isClientsActive ? 'bg-primary-50 text-primary-700' : 'text-text-muted hover:bg-primary-100'
                                } ${!isOpen ? 'h-16 justify-center' : ''}`}
                            >
                                <div className="flex items-center">
                                    <BuildingOffice2Icon className={`w-7 h-7 shrink-0 ${isClientsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'} ${isOpen ? 'ml-4' : ''}`}/>
                                    {isOpen && <span className="font-bold text-base">לקוחות</span>}
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isClientsOpen ? '' : '-rotate-90'}`} />
                                )}
                            </button>
                            {isOpen && isClientsOpen && (
                                <div id="clients-submenu" className="mt-2 space-y-1 pr-6 pl-2">
                                    <SubMenuLink 
                                        to="/clients"
                                        label="רשימת לקוחות" 
                                        onClick={() => handleNavigation('/clients')} 
                                        isActive={pathname === '/clients'}
                                    />
                                    <SubMenuLink 
                                        to="/clients/new"
                                        label="לקוח חדש" 
                                        onClick={() => handleNavigation('/clients/new')} 
                                        isActive={pathname === '/clients/new'}
                                    />
                                </div>
                            )}
                        </div>
                        
                        {/* Reports Collapsible Menu */}
                        <div className="w-full">
                            <button
                                onClick={() => {
                                    if (isOpen) {
                                        setIsReportsOpen(!isReportsOpen);
                                    } else {
                                        handleNavigation('/reports/bi');
                                    }
                                }}
                                aria-expanded={isOpen && isReportsOpen}
                                aria-controls="reports-submenu"
                                className={`w-full flex items-center justify-between p-3 rounded-lg group transition-colors ${
                                    isReportsActive ? 'bg-primary-50 text-primary-700' : 'text-text-muted hover:bg-primary-100'
                                } ${!isOpen ? 'h-16 justify-center' : ''}`}
                            >
                                <div className="flex items-center">
                                    <ChartPieIcon className={`w-7 h-7 shrink-0 ${isReportsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'} ${isOpen ? 'ml-4' : ''}`}/>
                                    {isOpen && <span className="font-bold text-base">דוחות</span>}
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isReportsOpen ? '' : '-rotate-90'}`} />
                                )}
                            </button>
                            {isOpen && isReportsOpen && (
                                <div id="reports-submenu" className="mt-2 space-y-1 pr-6 pl-2">
                                     <SubMenuLink 
                                        to="/reports/bi"
                                        label="דוח BI מתקדם" 
                                        onClick={() => handleNavigation('/reports/bi')} 
                                        isActive={pathname === '/reports/bi'}
                                    />
                                    <SubMenuLink 
                                        to="/reports/referrals"
                                        label="הפניות" 
                                        onClick={() => handleNavigation('/reports/referrals')} 
                                        isActive={pathname === '/reports/referrals'}
                                    />
                                    <SubMenuLink 
                                        to="/reports/publications"
                                        label="פרסומים" 
                                        onClick={() => handleNavigation('/reports/publications')} 
                                        isActive={pathname === '/reports/publications'}
                                    />
                                     <SubMenuLink 
                                        to="/reports/recruitment-sources"
                                        label="מקורות גיוס" 
                                        onClick={() => handleNavigation('/reports/recruitment-sources')} 
                                        isActive={pathname === '/reports/recruitment-sources'}
                                    />
                                </div>
                            )}
                        </div>


                        {/* Miscellaneous Collapsible Menu */}
                        <div className="w-full">
                            <button
                                onClick={() => {
                                    if (isOpen) {
                                        setIsMiscOpen(!isMiscOpen);
                                    } else {
                                        handleNavigation('/login');
                                    }
                                }}
                                aria-expanded={isOpen && isMiscOpen}
                                aria-controls="misc-submenu"
                                className={`w-full flex items-center justify-between p-3 rounded-lg group transition-colors ${
                                    isMiscActive ? 'bg-primary-50 text-primary-700' : 'text-text-muted hover:bg-primary-100'
                                } ${!isOpen ? 'h-16 justify-center' : ''}`}
                            >
                                <div className="flex items-center">
                                    <SquaresPlusIcon className={`w-7 h-7 shrink-0 ${isMiscActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'} ${isOpen ? 'ml-4' : ''}`}/>
                                    {isOpen && <span className="font-bold text-base">שונות</span>}
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isMiscOpen ? '' : '-rotate-90'}`} />
                                )}
                            </button>
                            {isOpen && isMiscOpen && (
                                <div id="misc-submenu" className="mt-2 space-y-1 pr-6 pl-2">
                                    <SubMenuLink 
                                        to="/login"
                                        label="מסך לוגין" 
                                        onClick={() => handleNavigation('/login')} 
                                        isActive={pathname === '/login'}
                                    />
                                    <button 
                                        onClick={handleOpenPublicProfile}
                                        className="w-full text-right text-base font-medium py-2 px-4 rounded-md transition-colors text-text-muted hover:bg-bg-hover flex items-center gap-2"
                                    >
                                        פרופיל ציבורי (דמו)
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </nav>
                    
                    <div className={`flex flex-col space-y-2 ${isOpen ? 'p-4' : 'p-2 items-center'}`}>
                        <div className="w-full">
                            <button
                                onClick={() => {
                                    if (isOpen) {
                                        setIsSettingsOpen(!isSettingsOpen);
                                    } else {
                                        handleNavigation('/settings/company');
                                    }
                                }}
                                aria-expanded={isOpen && isSettingsOpen}
                                aria-controls="settings-submenu"
                                className={`w-full flex items-center justify-between p-3 rounded-lg group transition-colors ${
                                    isSettingsActive ? 'bg-primary-50 text-primary-700' : 'text-text-muted hover:bg-primary-100'
                                } ${!isOpen ? 'h-16 justify-center' : ''}`}
                            >
                                <div className="flex items-center">
                                    <Cog6ToothIcon className={`w-7 h-7 shrink-0 ${isSettingsActive ? 'text-primary-600' : 'text-text-muted group-hover:text-primary-600'} ${isOpen ? 'ml-4' : ''}`}/>
                                    {isOpen && <span className="font-bold text-base">הגדרות</span>}
                                </div>
                                {isOpen && (
                                    <ChevronDownIcon className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isSettingsOpen ? '' : '-rotate-90'}`} />
                                )}
                            </button>
                            {isOpen && isSettingsOpen && (
                                <div id="settings-submenu" className="mt-2 space-y-1 pr-6 pl-2">
                                    <SubMenuLink 
                                        to="/settings/company"
                                        label="חברה" 
                                        onClick={() => handleNavigation('/settings/company')} 
                                        isActive={pathname === '/settings/company'}
                                    />
                                    <SubMenuLink 
                                        to="/settings/coordinators"
                                        label="רכזים" 
                                        onClick={() => handleNavigation('/settings/coordinators')} 
                                        isActive={pathname.startsWith('/settings/coordinators')}
                                    />
                                    <SubMenuLink 
                                        to="/settings/message-templates"
                                        label="תבניות הודעה" 
                                        onClick={() => handleNavigation('/settings/message-templates')} 
                                        isActive={pathname === '/settings/message-templates'}
                                    />
                                    <SubMenuLink 
                                        to="/settings/event-types"
                                        label="סוגי אירועים" 
                                        onClick={() => handleNavigation('/settings/event-types')} 
                                        isActive={pathname === '/settings/event-types'}
                                    />
                                     <SubMenuLink 
                                        to="/settings/recruitment-sources"
                                        label="מקורות גיוס" 
                                        onClick={() => handleNavigation('/settings/recruitment-sources')} 
                                        isActive={pathname === '/settings/recruitment-sources'}
                                    />
                                     <SubMenuLink 
                                        to="/admin/clients"
                                        label="פאנל ניהול" 
                                        onClick={() => handleNavigation('/admin/clients')} 
                                        isActive={pathname.startsWith('/admin')}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
