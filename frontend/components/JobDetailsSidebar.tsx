import React, { useMemo } from 'react';
import { ChartBarIcon, PencilIcon as PencilSquareIcon, ClipboardDocumentIcon, ArchiveBoxIcon, ArrowPathIcon, UserGroupIcon, ClockIcon, AvatarIcon, FunnelIcon, LinkIcon } from './Icons';
import { mockJobCandidates } from '../data/mockJobData';

const SidebarCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; editable?: boolean }> = ({ title, icon, children, editable = false }) => (
    <div className="bg-bg-card rounded-xl border border-border-default shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-border-default">
            <div className="flex items-center gap-3">
                <div className="bg-primary-100 text-primary-600 p-2 rounded-lg">{icon}</div>
                <h3 className="font-bold text-text-default">{title}</h3>
            </div>
            {editable && <button className="p-1 text-text-muted hover:text-primary-600"><PencilSquareIcon className="w-5 h-5" /></button>}
        </div>
        <div className="p-4">
            {children}
        </div>
    </div>
);

const InsightItem: React.FC<{ label: string; count: number; onClick?: () => void; }> = ({ label, count, onClick }) => (
    <button onClick={onClick} className="flex items-center justify-between w-full text-sm font-semibold text-text-default hover:bg-primary-50 p-2 rounded-lg transition-colors group">
        <span>{label}</span>
        <span className="font-bold text-primary-600 bg-primary-100 group-hover:bg-primary-200 px-2 py-0.5 rounded-full transition-colors">{count}</span>
    </button>
);


// Mock data for the sidebar - these are different from the main candidate list for now
const quickActions = [
  { label: 'שכפל משרה', icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
  { label: 'העבר לארכיון', icon: <ArchiveBoxIcon className="w-5 h-5" /> },
  { label: 'פרסם מחדש', icon: <ArrowPathIcon className="w-5 h-5" /> },
  { label: 'הצג מועמדים', icon: <UserGroupIcon className="w-5 h-5" /> },
];

const recentActivitiesData = [
    { description: 'נוצר אירוע חדש: ראיון טלפוני', time: 'לפני שעתיים', user: 'חלי' },
    { description: 'המועמד "ישראל ישראלי" שויך למשרה', time: 'אתמול', user: 'מערכת' },
    { description: 'המשרה עודכנה: טווח שכר עודכן', time: 'לפני יומיים', user: 'חלי' },
];

interface JobDetailsSidebarProps {
    job: {
        status: string;
        openDate: string;
        associatedCandidates: number; // This will now be derived from mock data length
    };
    openSummaryDrawer: (candidateId: number) => void;
}

const JobDetailsSidebar: React.FC<JobDetailsSidebarProps> = ({ job, openSummaryDrawer }) => {
    const openDate = new Date(job.openDate);
    const today = new Date();
    const diffTime = Math.max(0, today.getTime() - openDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const totalCandidates = mockJobCandidates.length;

    const funnelStats = useMemo(() => {
        const newCandidates = mockJobCandidates.filter(c => c.status === 'חדש').length;
        const advancedProcess = mockJobCandidates.filter(c => ['סינון טלפוני', 'ראיון', 'הצעה'].includes(c.status)).length;
        const rejected = mockJobCandidates.filter(c => c.status === 'נדחה').length;
        // Mock data as discussed
        const cvSent = 3; 
        return { newCandidates, advancedProcess, rejected, cvSent };
    }, []);

    const sourcingStats = useMemo(() => {
        const adChannels = ['AllJobs', 'LinkedIn', 'Ethosia', 'JobMaster'];
        const fromAds = mockJobCandidates.filter(c => adChannels.includes(c.source)).length;
        const fromOther = totalCandidates - fromAds;
        return { fromAds, fromOther };
    }, [totalCandidates]);
    
    return (
        <div className="space-y-6">
            <SidebarCard title="נתונים מהירים" icon={<ChartBarIcon className="w-5 h-5" />}>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <div className="font-semibold text-text-muted">סטטוס משרה:</div>
                    <div><span className={`font-bold px-2 py-0.5 rounded-full ${job.status === 'פתוחה' ? 'text-green-600 bg-green-100' : 'text-text-default bg-bg-subtle'}`}>{job.status}</span></div>
                    
                    <div className="font-semibold text-text-muted">סה"כ מועמדים:</div>
                    <div className="font-bold text-text-default">{totalCandidates}</div>

                    <div className="font-semibold text-text-muted">פתוחה למשך:</div>
                    <div className="font-bold text-text-default">{diffDays} ימים</div>

                    <div className="font-semibold text-text-muted">תאריך פתיחה:</div>
                    <div className="font-bold text-text-default">{openDate.toLocaleDateString('he-IL')}</div>
                </div>
            </SidebarCard>

            <SidebarCard title="משפך הגיוס" icon={<FunnelIcon className="w-5 h-5" />}>
                <div className="space-y-1">
                    <InsightItem label="מועמדים חדשים (לסינון)" count={funnelStats.newCandidates} />
                    <InsightItem label="בתהליך מתקדם" count={funnelStats.advancedProcess} />
                    <InsightItem label="נשלחו קו״ח ללקוח" count={funnelStats.cvSent} />
                    <InsightItem label="מועמדים שנפסלו" count={funnelStats.rejected} />
                </div>
            </SidebarCard>

            <SidebarCard title="מקורות גיוס" icon={<LinkIcon className="w-5 h-5" />}>
                 <div className="space-y-1">
                    <InsightItem label="מועמדים מפרסום" count={sourcingStats.fromAds} />
                    <InsightItem label="מקורות אחרים" count={sourcingStats.fromOther} />
                </div>
            </SidebarCard>

            <SidebarCard title="פעולות מהירות" icon={<PencilSquareIcon className="w-5 h-5" />} editable>
                <ul className="space-y-3">
                    {quickActions.map(action => (
                        <li key={action.label}>
                            <a href="#" className="flex items-center gap-3 text-sm font-semibold text-text-default hover:text-primary-600 transition-colors">
                                <span className="text-primary-500">{action.icon}</span>
                                {action.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </SidebarCard>
            
            <SidebarCard title="פעילות אחרונה" icon={<ClockIcon className="w-5 h-5" />}>
                <div className="relative pl-4 space-y-6">
                    {recentActivitiesData.map((activity, index) => (
                         <div key={index} className="relative">
                            <div className="absolute -left-5 top-1.5 w-2.5 h-2.5 bg-border-default rounded-full"></div>
                            {index < recentActivitiesData.length - 1 && <div className="absolute -left-4 top-4 bottom-[-1.5rem] w-px bg-border-default"></div>}
                            <p className="text-sm text-text-default">{activity.description}</p>
                            <p className="text-xs text-text-subtle mt-1">{activity.time} · {activity.user}</p>
                        </div>
                    ))}
                </div>
            </SidebarCard>

        </div>
    );
};

export default JobDetailsSidebar;