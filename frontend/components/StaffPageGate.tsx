import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
};

export default StaffPageGate;
