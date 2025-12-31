
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
    PaperAirplaneIcon, BellIcon, QuestionMarkCircleIcon, Cog6ToothIcon, PaintBrushIcon, Bars3Icon,
    BuildingOffice2Icon, UserGroupIcon, ChatBubbleBottomCenterTextIcon, TagIcon, ChevronLeftIcon,
    WrenchScrewdriverIcon, UserCircleIcon, BriefcaseIcon, DocumentTextIcon
} from './Icons';
import { notificationsData } from './NotificationCenter';
import { specs } from '../data/specs';
import SpecDrawer from './SpecDrawer';


const ActionButton: React.FC<{ children: React.ReactNode; tooltip: string; hasNotification?: boolean; notificationCount?: number; onClick?: () => void; 'aria-expanded'?: boolean; className?: string }> = ({ children, tooltip, hasNotification, notificationCount, onClick, className = '', ...props }) => (
    <button
        onClick={onClick}
        title={tooltip}
        className={`relative w-11 h-11 flex items-center justify-center bg-bg-card rounded-full shadow-md border border-border-default text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-all duration-200 ${className}`}
        {...props}
    >
        {children}
        {hasNotification && notificationCount && notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-bg-card">
                {notificationCount}
            </span>
        )}
    </button>
);

const UserProfileAvatar: React.FC<{ initials: string; tooltip: string; onClick: () => void; 'aria-expanded': boolean; }> = ({ initials, tooltip, onClick, ...props }) => (
    <button
        onClick={onClick}
        title={tooltip}
        className="w-11 h-11 flex items-center justify-center bg-bg-subtle text-text-muted rounded-full shadow-md border border-border-default font-bold text-lg hover:ring-2 hover:ring-primary-400 transition-all duration-200"
        {...props}
    >
        {initials}
    </button>
);

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void; to?: string; disabled?: boolean; }> = ({ icon, label, onClick, to, disabled = false }) => {
    const content = (
        <>
            {icon}
            <span>{label}</span>
        </>
    );

    const className = "w-full text-right flex items-center gap-3 px-4 py-2.5 text-sm text-text-default hover:bg-bg-hover hover:text-primary-700 transition-colors disabled:text-text-subtle disabled:bg-transparent disabled:cursor-not-allowed";

    if (to && !disabled) {
        return (
            <Link to={to} onClick={onClick} className={className}>
                {content}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} disabled={disabled} className={className}>
            {content}
        </button>
    );
};

interface TopBarProps {
    breadcrumbs: { label: string, path: string }[];
    onOpenPreferences: () => void;
    onOpenNewTask: () => void;
    onToggleSidebar: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ breadcrumbs, onOpenPreferences, onOpenNewTask, onToggleSidebar }) => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
    const [isSpecDrawerOpen, setIsSpecDrawerOpen] = useState(false);
    const [shouldCrash, setShouldCrash] = useState(false);
    
    const userMenuRef = useRef<HTMLDivElement>(null);
    const settingsMenuRef = useRef<HTMLDivElement>(null);
    const unreadCount = notificationsData.filter(n => !n.isRead).length;

    // Check if current route has a spec
    const currentSpec = specs[location.pathname];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
            if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
                setIsSettingsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (shouldCrash) {
        throw new Error('Test Crash for ErrorBoundary');
    }

    return (
        <>
            <header className="relative z-30 flex-shrink-0 flex items-center justify-between p-3 md:px-6 md:py-4 bg-bg-card/60 backdrop-blur-md border-b border-border-default">
                {/* Left side (in RTL): Global Action Buttons */}
                <div className="flex items-center gap-2">
                    <div className="relative" ref={userMenuRef}>
                        <UserProfileAvatar initials="ג" tooltip="פרופיל משתמש" onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} aria-expanded={isUserMenuOpen} />
                        {isUserMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-50 animate-fade-in-down">
                                <MenuItem 
                                    icon={<PaintBrushIcon className="w-5 h-5" />}
                                    label="העדפות תצוגה"
                                    onClick={() => {
                                        onOpenPreferences();
                                        setIsUserMenuOpen(false);
                                    }}
                                />
                                <div className="border-t border-border-default my-1"></div>
                                <div className="p-2">
                                    <span className="px-2 py-1 text-xs font-semibold text-text-subtle">החלפת תפקיד</span>
                                </div>
                                <MenuItem 
                                    icon={<WrenchScrewdriverIcon className="w-5 h-5" />}
                                    label="פאנל ניהול"
                                    to="/admin"
                                    onClick={() => setIsUserMenuOpen(false)}
                                />
                                <MenuItem 
                                    icon={<BriefcaseIcon className="w-5 h-5" />}
                                    label="תצוגת מנהל מגייס"
                                    to="/portal/manager"
                                    onClick={() => setIsUserMenuOpen(false)}
                                />
                                <MenuItem 
                                    icon={<UserCircleIcon className="w-5 h-5" />}
                                    label="תצוגת מחפש עבודה"
                                    to="/candidate-portal/profile"
                                    onClick={() => setIsUserMenuOpen(false)}
                                />
                            </div>
                        )}
                    </div>
                    
                    {/* Tech Spec Button (Only visible if spec exists for route) */}
                    {currentSpec && (
                        <div className="flex items-center gap-2">
                            <ActionButton 
                                tooltip="אפיון טכני לעמוד זה (Dev Spec)" 
                                onClick={() => setIsSpecDrawerOpen(true)}
                                className="bg-blue-600 text-white border-blue-700 shadow-blue-500/30 shadow-lg ring-2 ring-blue-200 hover:bg-blue-700"
                            >
                                <DocumentTextIcon className="w-6 h-6" />
                            </ActionButton>
                        </div>
                    )}

                    <ActionButton tooltip="פנייה לתמיכה" onClick={() => setShouldCrash(true)}>
                        <QuestionMarkCircleIcon className="w-6 h-6" />
                    </ActionButton>
                    
                    <div className="relative" ref={settingsMenuRef}>
                        <ActionButton tooltip="הגדרות" onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)} aria-expanded={isSettingsMenuOpen}>
                            <Cog6ToothIcon className="w-6 h-6" />
                        </ActionButton>
                        {isSettingsMenuOpen && (
                            <div className="absolute top-full right-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-50 animate-fade-in-down">
                                <div className="p-2">
                                    <span className="px-2 py-1 text-xs font-semibold text-text-subtle">הגדרות מערכת</span>
                                </div>
                                <MenuItem icon={<BuildingOffice2Icon className="w-5 h-5" />} label="חברה" to="/settings/company" onClick={() => setIsSettingsMenuOpen(false)} />
                                <MenuItem icon={<UserGroupIcon className="w-5 h-5" />} label="רכזים" to="/settings/coordinators" onClick={() => setIsSettingsMenuOpen(false)} />
                                <MenuItem icon={<ChatBubbleBottomCenterTextIcon className="w-5 h-5" />} label="תבניות להודעות" to="/settings/message-templates" onClick={() => setIsSettingsMenuOpen(false)} />
                                <MenuItem icon={<TagIcon className="w-5 h-5" />} label="סוגי אירועים" to="/settings/event-types" onClick={() => setIsSettingsMenuOpen(false)} />
                            </div>
                        )}
                    </div>

                    <ActionButton tooltip="יצירת משימה חדשה" onClick={onOpenNewTask}>
                        <PaperAirplaneIcon className="w-6 h-6" />
                    </ActionButton>
                    <ActionButton 
                        tooltip="מרכז הודעות" 
                        hasNotification={unreadCount > 0} 
                        notificationCount={unreadCount}
                        onClick={() => navigate('/notifications')}
                    >
                        <BellIcon className="w-6 h-6" />
                    </ActionButton>
                    <style>{`
                        @keyframes fade-in-down {
                            from { opacity: 0; transform: translateY(-10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                        .animate-fade-in-down { animation: fade-in-down 0.2s ease-out; }
                    `}</style>
                </div>
                
                {/* Right side (in RTL): Page Title & Hamburger */}
                <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-2">
                        {breadcrumbs.map((crumb, index) => {
                            const isLast = index === breadcrumbs.length - 1;
                            return (
                                <React.Fragment key={index}>
                                    {index > 0 && <ChevronLeftIcon className="w-5 h-5 text-text-subtle" />}
                                    {isLast ? (
                                        <span className="text-xl font-bold text-text-default">{crumb.label}</span>
                                    ) : (
                                        <Link
                                            to={crumb.path}
                                            className="text-xl font-bold text-text-muted hover:text-text-default transition-colors"
                                        >
                                            {crumb.label}
                                        </Link>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                    {/* On Desktop: This toggles Mini/Full Sidebar. On Mobile: This toggles Drawer */}
                    <button onClick={onToggleSidebar} className="p-2 text-text-muted rounded-full hover:bg-bg-hover" aria-label="Toggle menu">
                        <Bars3Icon className="w-6 h-6" />
                    </button>
                </div>
            </header>

            {/* Render the Spec Drawer */}
            <SpecDrawer 
                isOpen={isSpecDrawerOpen} 
                onClose={() => setIsSpecDrawerOpen(false)} 
                spec={currentSpec} 
            />
        </>
    );
};

export default TopBar;
