import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { HiroLogotype } from './Icons';

const CandidatePortalLayout: React.FC = () => {
    return (
        <div className="flex flex-col h-screen bg-bg-default text-text-default" dir="rtl">
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-bg-card/80 backdrop-blur-md border-b border-border-default">
                <Link to="/candidate-portal/profile">
                    <HiroLogotype className="text-3xl" />
                </Link>
            </header>
            <main className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};

export default CandidatePortalLayout;