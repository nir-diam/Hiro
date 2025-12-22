import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BuildingOffice2Icon, TagIcon, BriefcaseIcon } from './Icons';

const AdminSettingsLayout: React.FC = () => {
    const navItems = [
        { to: '/admin/settings/companies', label: 'תיקון שמות חברות', icon: <BuildingOffice2Icon className="w-5 h-5" /> },
        { to: '/admin/settings/tags', label: 'ניהול תגיות', icon: <TagIcon className="w-5 h-5" /> },
        { to: '/admin/settings/job-fields', label: 'ניהול תחומי משרה', icon: <BriefcaseIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="flex flex-col md:flex-row gap-6">
            <aside className="w-full md:w-64 flex-shrink-0">
                <div className="bg-bg-card p-4 rounded-xl border border-border-default">
                    <h2 className="text-lg font-bold text-text-default mb-4 px-2">ניהול מערכת</h2>
                    <nav className="space-y-1">
                        {navItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                                        isActive
                                            ? 'bg-primary-100 text-primary-700'
                                            : 'text-text-muted hover:bg-bg-hover hover:text-text-default'
                                    }`
                                }
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </div>
            </aside>
            <main className="flex-grow min-w-0">
                <Outlet />
            </main>
        </div>
    );
};

export default AdminSettingsLayout;
