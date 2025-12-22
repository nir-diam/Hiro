import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { candidatesData } from './CandidatesListView';
import { AvatarIcon, ArrowLeftIcon, PhoneIcon, MapPinIcon } from './Icons';

// Mocking cross-client history for a candidate
const mockCrossClientHistory = [
    { clientName: 'בזק', jobTitle: 'מנהל/ת שיווק דיגיטלי', status: 'ראיון', referralDate: '2025-07-20' },
    { clientName: 'Wix', jobTitle: 'מפתח/ת Fullstack', status: 'נדחה', referralDate: '2025-06-15' },
    { clientName: 'מימד אנושי', jobTitle: 'רכז/ת גיוס', status: 'התקבל', referralDate: '2024-01-10' },
];

const InfoItem: React.FC<{ label: string; value: string | undefined }> = ({ label, value }) => (
    <div>
        <p className="text-sm text-text-muted">{label}</p>
        <p className="font-semibold text-text-default">{value || 'לא צוין'}</p>
    </div>
);

const AdminCandidateProfileView: React.FC = () => {
    const { candidateId } = useParams<{ candidateId: string }>();
    const navigate = useNavigate();
    
    // Find candidate from mock data
    const candidate = candidatesData.find(c => c.id === Number(candidateId));

    if (!candidate) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm p-6 text-center">
                <h1 className="text-xl font-bold">המועמד לא נמצא</h1>
                <button onClick={() => navigate(-1)} className="mt-4 text-primary-600 font-semibold">חזור</button>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <AvatarIcon initials={candidate.avatar} size={64} fontSize={24} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                    <div>
                        <h1 className="text-2xl font-bold text-text-default">{candidate.name}</h1>
                        <p className="text-base text-text-muted">{candidate.title}</p>
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
                </div>
            </div>
            
            <div className="bg-bg-card rounded-2xl shadow-sm p-6">
                 <h2 className="text-lg font-bold mb-4">פעילות בכלל הלקוחות</h2>
                 <div className="overflow-x-auto border border-border-default rounded-lg">
                    <table className="w-full text-sm text-right">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                            <tr>
                                <th className="p-3">שם לקוח</th>
                                <th className="p-3">שם משרה</th>
                                <th className="p-3">סטטוס</th>
                                <th className="p-3">תאריך הפניה</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                        {mockCrossClientHistory.map((item, index) => (
                            <tr key={index} className="hover:bg-bg-hover">
                                <td className="p-3 font-semibold text-text-default">{item.clientName}</td>
                                <td className="p-3 text-text-muted">{item.jobTitle}</td>
                                <td className="p-3 text-text-muted">{item.status}</td>
                                <td className="p-3 text-text-muted">{item.referralDate}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminCandidateProfileView;