import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AvatarIcon, ArrowLeftIcon, PhoneIcon, MapPinIcon } from './Icons';

const InfoItem: React.FC<{ label: string; value: string | undefined }> = ({ label, value }) => (
    <div>
        <p className="text-sm text-text-muted">{label}</p>
        <p className="font-semibold text-text-default">{value || 'לא צוין'}</p>
    </div>
);

const AdminCandidateProfileView: React.FC = () => {
    const { candidateId } = useParams<{ candidateId: string }>();
    const navigate = useNavigate();
    const [candidate, setCandidate] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const load = async () => {
            if (!apiBase || !candidateId) return;
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${apiBase}/api/candidates/${candidateId}`, { headers: { ...authHeaders() } });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                setCandidate(data);
            } catch (e: any) {
                setError(e.message || 'שגיאה בטעינת מועמד');
            } finally {
                setLoading(false);
            }
        };
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase, candidateId]);

    if (loading) {
        return <div className="bg-bg-card rounded-2xl shadow-sm p-6 text-center">טוען מועמד...</div>;
    }

    if (error || !candidate) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm p-6 text-center">
                <h1 className="text-xl font-bold">{error || 'המועמד לא נמצא'}</h1>
                <button onClick={() => navigate(-1)} className="mt-4 text-primary-600 font-semibold">חזור</button>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <AvatarIcon initials={candidate.fullName?.[0] || '?'} size={64} fontSize={24} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                    <div>
                        <h1 className="text-2xl font-bold text-text-default">{candidate.fullName || 'ללא שם'}</h1>
                        <p className="text-base text-text-muted">{candidate.title || '—'}</p>
                    </div>
                </div>
                <button onClick={() => navigate(-1)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center gap-2">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>חזור לרשימה</span>
                </button>
            </header>
            
            <div className="bg-bg-card rounded-2xl shadow-sm p-6">
                <h2 className="text-lg font-bold mb-4">פרטים בסיסיים</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <InfoItem label="טלפון" value={candidate.phone} />
                    <InfoItem label="כתובת" value={candidate.address} />
                    <InfoItem label="מקור גיוס" value={candidate.source} />
                    <InfoItem label="סטטוס אחרון" value={candidate.status} />
                    <InfoItem label="אימייל" value={candidate.email} />
                    <InfoItem label="זמינות" value={candidate.availability} />
                </div>
            </div>
        </div>
    );
};

export default AdminCandidateProfileView;