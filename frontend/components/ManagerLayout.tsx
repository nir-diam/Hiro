
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { HiroLogotype, ArrowLeftIcon } from './Icons';

const ManagerLayout: React.FC = () => {
    return (
        <div className="flex flex-col h-screen bg-bg-default text-text-default" dir="rtl">
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-bg-card shadow-sm border-b border-border-default z-10">
                <div className="flex items-center gap-4">
                    <Link to="/portal/manager">
                        <HiroLogotype className="h-8" />
                    </Link>
                    <div className="h-6 w-px bg-border-default hidden sm:block"></div>
                    <span className="text-sm font-semibold text-text-muted hidden sm:block">פורטל מנהלים</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold text-text-default">ישראל ישראלי</p>
                        <p className="text-xs text-text-muted">מנהל מגייס</p>
                    </div>
                    <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold border border-primary-200">
                        י
                    </div>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-7xl mx-auto w-full">
                <Outlet />
            </main>
        </div>
    );
};

export default ManagerLayout;
