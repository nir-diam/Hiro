import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Where `/` and unknown URLs land.
 *
 * These routes used to hard-redirect to `/dashboard`. For a tenant that disables the
 * "misc" module, `/dashboard` is forbidden for every non-admin, and `StaffPageGate`
 * would then redirect back to `/dashboard` — an endless same-path loop that rendered
 * a completely blank screen. Pick the first page the user can actually open instead.
 */
const HOME_CANDIDATES = [
    '/dashboard',
    '/candidates',
    '/jobs',
    '/job-board',
    '/candidate-pool',
    '/communications',
    '/clients',
    '/events-management',
    '/reports/referrals',
    '/finance/dashboard',
    '/settings/company',
    '/admin',
    '/notifications',
];

const HomeRedirect: React.FC = () => {
    const { ready, canAccessPath } = useAuth();

    if (!ready) {
        return (
            <div className="flex items-center justify-center flex-1 min-h-[40vh] p-8 text-text-muted text-sm">
                טוען הרשאות...
            </div>
        );
    }

    const target = HOME_CANDIDATES.find((p) => canAccessPath(p));
    if (!target) {
        return (
            <div className="flex flex-1 min-h-[60vh] items-center justify-center p-8" dir="rtl">
                <div className="max-w-md text-center">
                    <h1 className="text-2xl font-bold text-text-default mb-3">אין הרשאה</h1>
                    <p className="text-sm text-text-muted">
                        אין לך הרשאה לאף עמוד במערכת. פנה/י למנהל המערכת שלך.
                    </p>
                </div>
            </div>
        );
    }

    return <Navigate to={target} replace />;
};

export default HomeRedirect;
