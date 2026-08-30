
import React from 'react';
import { Outlet, Link, useSearchParams } from 'react-router-dom';
import { HiroLogotype, ArrowLeftIcon } from './Icons';

const CandidatePortalLayout: React.FC = () => {
    const [searchParams] = useSearchParams();
    const isStaffPreview =
        searchParams.get('staff') === '1'
        && Boolean(String(searchParams.get('previewCandidateId') || searchParams.get('candidateId') || '').trim());

    return (
        <div className="flex flex-col h-screen bg-bg-default text-text-default" dir="rtl">
            {!isStaffPreview ? (
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-bg-card/80 backdrop-blur-md border-b border-border-default z-10 sticky top-0">
                <div className="flex items-center gap-4">
                    <Link to="/candidate-portal/profile">
                        <HiroLogotype className="text-3xl" />
                    </Link>
                </div>
                <Link to="/dashboard" className="text-sm font-medium text-text-muted hover:text-primary-600 flex items-center gap-1 transition-colors">
                    <span>למערכת הגיוס</span>
                    <ArrowLeftIcon className="w-4 h-4" />
                </Link>
            </header>
            ) : null}
            <main
                className="flex-1 overflow-y-auto bg-bg-default relative"
                // Prevent browser scroll anchoring from jumping while React re-renders
                style={{ overflowAnchor: 'none' } as any}
            >
                <div className="min-h-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default CandidatePortalLayout;
