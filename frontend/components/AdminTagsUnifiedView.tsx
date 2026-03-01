import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { TagIcon, WrenchScrewdriverIcon, UserGroupIcon } from './Icons';

const TAB_ITEMS = [
    { to: '/admin/tags/list', label: 'ניהול תגיות', icon: TagIcon },
    { to: '/admin/tags/corrections', label: 'תיקון תגיות', icon: WrenchScrewdriverIcon },
    { to: '/admin/tags/candidates', label: 'תגיות מועמדים', icon: UserGroupIcon },
];

const AdminTagsUnifiedView: React.FC = () => {
    return (
        <div className="space-y-4">
            <div className="border-b border-border-default">
                <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
                    {TAB_ITEMS.map(({ to, label, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={false}
                            className={({ isActive }) =>
                                `flex items-center gap-2 py-2.5 px-4 font-medium text-sm transition-colors shrink-0 border-b-2 ${
                                    isActive
                                        ? 'border-primary-500 text-primary-600 bg-primary-50/50'
                                        : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-subtle'
                                }`
                            }
                        >
                            <Icon className="w-4 h-4" />
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
            <div className="min-h-[400px]">
                <Outlet />
            </div>
        </div>
    );
};

export default AdminTagsUnifiedView;
