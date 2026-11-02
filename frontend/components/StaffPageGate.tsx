import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * First page (in this order) the signed-in user is actually allowed to open.
 * Used as the target when the requested page is forbidden, so denial never
 * redirects back to the same URL (which renders nothing at all).
 */
export const FALLBACK_PATHS = [
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
    '/dashboard',
];

/** No-access screen shown when the user has no page they can reach. */
const NoAccessScreen: React.FC<{ pathname: string }> = ({ pathname }) => (
    <div className="flex flex-1 min-h-[60vh] items-center justify-center p-8" dir="rtl">
        <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-text-default mb-3">אין הרשאה לעמוד הזה</h1>
            <p className="text-sm text-text-muted mb-2">
                אין לך הרשאה לצפות בעמוד <span className="font-mono text-xs">{pathname}</span>.
            </p>
            <p className="text-sm text-text-muted">
                פנה/י למנהל המערכת שלך כדי לקבל הרשאה מתאימה.
            </p>
        </div>
    </div>
);

/** Main staff shell: login required, candidates blocked from staff URLs, path vs effectivePermissions. */
const StaffPageGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { ready, user, canAccessPath } = useAuth();
    const location = useLocation();
    const pathname = location.pathname;

    if (!ready) {
        return (
            <div className="flex items-center justify-center flex-1 min-h-[40vh] p-8 text-text-muted text-sm">
                טוען הרשאות...
            </div>
        );
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token || !user) {
        return <Navigate to="/login" replace state={{ from: pathname }} />;
    }

    if (user.role === 'candidate') {
        return <Navigate to="/candidate-portal/profile" replace />;
    }

    if (!canAccessPath(pathname)) {
        // Redirecting to /dashboard here used to loop forever when the user also lacked
        // `page:dashboard` (tenant module "misc" off): React Router aborted the same-path
        // navigation and the whole shell rendered blank, with no error in the console.
        const target = FALLBACK_PATHS.find((p) => p !== pathname && canAccessPath(p));
        if (target) return <Navigate to={target} replace />;
        return <NoAccessScreen pathname={pathname} />;
    }

    return <>{children}</>;
};

export default StaffPageGate;
