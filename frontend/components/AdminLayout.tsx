
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BuildingOffice2Icon, BriefcaseIcon, UserGroupIcon, WrenchScrewdriverIcon, TagIcon, SquaresPlusIcon, GlobeAmericasIcon } from './Icons';

const AdminLayout: React.FC = () => {
    const navItems = [
        { to: '/admin/clients', label: 'לקוחות', icon: <BuildingOffice2Icon className="w-5 h-5" /> },
        { to: '/admin/companies', label: 'מאגר חברות', icon: <GlobeAmericasIcon className="w-5 h-5" /> },
        { to: '/admin/jobs', label: 'משרות', icon: <BriefcaseIcon className="w-5 h-5" /> },
        { to: '/admin/candidates', label: 'מועמדים', icon: <UserGroupIcon className="w-5 h-5" /> },
        { to: '/admin/company-corrections', label: 'תיקון חברות', icon: <WrenchScrewdriverIcon className="w-5 h-5" /> },
        { to: '/admin/tags', label: 'ניהול תגיות', icon: <TagIcon className="w-5 h-5" /> },
        { to: '/admin/job-fields', label: 'ניהול תחומי משרה', icon: <SquaresPlusIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text-default">פאנל ניהול</h1>
                <p className="text-sm text-text-muted">תצוגת-על לניהול כלל הנתונים במערכת.</p>
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
