
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseIcon, UserGroupIcon, ChevronLeftIcon, ClockIcon } from './Icons';

// Mock data for manager's jobs
const managerJobs = [
    { id: 1, title: 'מנהל/ת שיווק דיגיטלי', candidatesCount: 12, newCandidates: 3, lastActivity: 'לפני שעתיים', status: 'פתוחה' },
    { id: 2, title: 'אנליסט/ית נתונים', candidatesCount: 8, newCandidates: 0, lastActivity: 'אתמול', status: 'פתוחה' },
    { id: 3, title: 'מנהל/ת מוצר', candidatesCount: 25, newCandidates: 5, lastActivity: 'לפני 3 ימים', status: 'לקראת סגירה' },
];

const ManagerDashboard: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="space-y-8">
            <div className="text-center sm:text-right">
                <h1 className="text-2xl font-bold text-text-default">שלום, ישראל 👋</h1>
                <p className="text-text-muted">יש לך <span className="font-bold text-primary-600">8 מועמדים חדשים</span> שממתינים לחוות דעתך.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {managerJobs.map(job => (
                    <div 
                        key={job.id} 
                        onClick={() => navigate(`/portal/manager/jobs/${job.id}`)}
                        className="bg-bg-card rounded-xl border border-border-default shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden"
                    >
                        <div className="p-5 border-b border-border-subtle">
                            <div className="flex justify-between items-start mb-2">
                                <div className="bg-primary-50 p-2 rounded-lg text-primary-600">
                                    <BriefcaseIcon className="w-6 h-6" />
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${job.status === 'פתוחה' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {job.status}
                                </span>
                            </div>
                            <h3 className="text-lg font-bold text-text-default group-hover:text-primary-700 transition-colors">{job.title}</h3>
                        </div>
                        
                        <div className="p-5 space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-muted flex items-center gap-2">
                                    <UserGroupIcon className="w-4 h-4" />
                                    סה"כ מועמדים
                                </span>
                                <span className="font-bold text-text-default">{job.candidatesCount}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-muted flex items-center gap-2">
                                    <ClockIcon className="w-4 h-4" />
                                    פעילות אחרונה
                                </span>
                                <span className="font-medium text-text-default">{job.lastActivity}</span>
                            </div>

                            {job.newCandidates > 0 ? (
                                <div className="bg-primary-50 text-primary-700 text-sm font-semibold p-3 rounded-lg flex items-center justify-center gap-2">
                                    <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
                                    {job.newCandidates} מועמדים חדשים לטיפול
                                </div>
                            ) : (
                                <div className="bg-bg-subtle text-text-muted text-sm font-medium p-3 rounded-lg text-center">
                                    אין מועמדים חדשים
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 bg-bg-subtle/50 border-t border-border-subtle flex justify-between items-center group-hover:bg-primary-50/30 transition-colors">
                            <span className="text-sm font-semibold text-primary-600">צפה במועמדים</span>
                            <ChevronLeftIcon className="w-4 h-4 text-primary-600 transform transition-transform group-hover:-translate-x-1" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ManagerDashboard;
