
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BuildingOffice2Icon, BriefcaseIcon, UserGroupIcon, WrenchScrewdriverIcon, TagIcon, SquaresPlusIcon, GlobeAmericasIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

const AdminLayout: React.FC = () => {
    const { t } = useLanguage();
    
    const navItems = [
        { to: '/admin/clients', label: t('admin.tab_clients'), icon: <BuildingOffice2Icon className="w-5 h-5" /> },
        { to: '/admin/companies', label: t('admin.tab_companies_db'), icon: <GlobeAmericasIcon className="w-5 h-5" /> },
        { to: '/admin/jobs', label: t('admin.tab_jobs'), icon: <BriefcaseIcon className="w-5 h-5" /> },
        { to: '/admin/candidates', label: t('admin.tab_candidates'), icon: <UserGroupIcon className="w-5 h-5" /> },
        { to: '/admin/company-corrections', label: t('admin.tab_company_corrections'), icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
        { to: '/admin/tags', label: t('admin.tab_tags'), icon: <TagIcon className="w-5 h-5" /> },
        { to: '/admin/job-fields', label: t('admin.tab_job_fields'), icon: <SquaresPlusIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text-default">{t('admin.title')}</h1>
                <p className="text-sm text-text-muted">{t('admin.subtitle')}</p>
            </header>
            
            <div className="border-b border-border-default">
                <nav className="flex items-center -mb-px gap-4 overflow-x-auto">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${
                                    isActive 
                                        ? 'border-b-2 border-primary-500 text-primary-600' 
                                        : 'text-text-muted hover:text-text-default'
                                }`
                            }
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
            
            <main>
                <Outlet />
            </main>
        </div>
    );
};

export default AdminLayout;
