import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminMatchingEngineView from './AdminMatchingEngineView';

const CompanyMatchingEngineView: React.FC = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const clientId = useMemo(() => {
        const fromQuery = String(searchParams.get('clientId') || '').trim();
        if (fromQuery) return fromQuery;
        if (!isPlatformAdmin) return String(user?.clientId || '').trim() || null;
        return null;
    }, [searchParams, isPlatformAdmin, user?.clientId]);

    if (!clientId) {
        return (
            <div className="p-6 text-right space-y-3">
                <p className="text-sm text-text-muted">
                    {isPlatformAdmin
                        ? 'בחרו לקוח בהגדרות חברה (טאב פרמטרים) ולחצו שוב על עיפרון בכרטיס תבנית.'
                        : 'לא נמצא לקוח מקושר לחשבון — לא ניתן לערוך תבנית שקלול.'}
                </p>
                <Link to="/settings/company" className="text-sm font-semibold text-primary-600 hover:underline">
                    חזרה להגדרות חברה
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-4 pb-8">
            <Link
                to="/settings/company"
                className="inline-flex text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline"
            >
                ← חזרה לתבניות שקלול (הגדרות חברה)
            </Link>
            <AdminMatchingEngineView tenantClientId={clientId} />
        </div>
    );
};

export default CompanyMatchingEngineView;
