
import React from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { 
    BuildingOffice2Icon, 
    UserGroupIcon, 
    ChatBubbleBottomCenterTextIcon, 
    TagIcon, 
    GlobeAmericasIcon, 
    ClipboardDocumentListIcon,
    DocumentTextIcon,
    ArrowPathIcon // Icon for Pipelines
} from './Icons';
import { useLanguage } from '../context/LanguageContext';

const SettingsLayout: React.FC = () => {
    const { t } = useLanguage();
    const location = useLocation();

    // Redirect /settings to /settings/company if accessed directly
    if (location.pathname === '/settings') {
        return <Navigate to="/settings/company" replace />;
    }

    const navItems = [
        { to: '/settings/company', label: t('nav.company_settings'), icon: <BuildingOffice2Icon className="w-5 h-5" /> },
        { to: '/settings/pipelines', label: 'תהליכי עבודה', icon: <ArrowPathIcon className="w-5 h-5" /> }, 
        { to: '/settings/documents', label: 'Document Studio', icon: <DocumentTextIcon className="w-5 h-5" /> }, // New
        { to: '/settings/coordinators', label: t('nav.coordinators'), icon: <UserGroupIcon className="w-5 h-5" /> },
        { to: '/settings/agreements', label: 'סוגי הסכמים', icon: <ClipboardDocumentListIcon className="w-5 h-5" /> }, // Swapped icon to allow DocumentTextIcon for studio
        { to: '/settings/message-templates', label: t('nav.message_templates'), icon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" /> },
        { to: '/settings/event-types', label: t('nav.event_types'), icon: <TagIcon className="w-5 h-5" /> },
        { to: '/settings/recruitment-sources', label: t('nav.recruitment_sources'), icon: <GlobeAmericasIcon className="w-5 h-5" /> },
        { to: '/settings/questionnaires', label: t('breadcrumbs.questionnaires'), icon: <ClipboardDocumentListIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="flex flex-col h-full bg-bg-default space-y-6 p-6">
            <header>
                <h1 className="text-3xl font-black text-text-default">{t('nav.settings')}</h1>
                <p className="text-text-muted mt-1">ניהול הגדרות המערכת, משתמשים ותבניות עבודה.</p>
            </header>
            
            <div className="bg-bg-card border-b border-border-default shadow-sm rounded-t-xl overflow-hidden">
                <nav className="flex items-center gap-1 p-2 overflow-x-auto">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                                    isActive 
                                        ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-200' 
                                        : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'
                                }`
                            }
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
            
            <main className="flex-1 overflow-y-auto">
                <div className="h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default SettingsLayout;
