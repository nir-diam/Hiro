
import React, { useMemo } from 'react';
import { ChartBarIcon, PencilIcon as PencilSquareIcon, ClipboardDocumentIcon, ArchiveBoxIcon, ArrowPathIcon, UserGroupIcon, ClockIcon, AvatarIcon, FunnelIcon, LinkIcon } from './Icons';
import { mockJobCandidates } from '../data/mockJobData';
import { useLanguage } from '../context/LanguageContext';

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


interface JobDetailsSidebarProps {
    job: {
        status: string;
        openDate: string;
        associatedCandidates: number; 
    };
    openSummaryDrawer: (candidateId: number) => void;
}

const JobDetailsSidebar: React.FC<JobDetailsSidebarProps> = ({ job, openSummaryDrawer }) => {
    const { t } = useLanguage();
    const openDate = new Date(job.openDate);
    const today = new Date();
    const diffTime = Math.max(0, today.getTime() - openDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const totalCandidates = mockJobCandidates.length;

    // Translated actions inside component to use hook
    const quickActions = [
      { label: t('job_sidebar.duplicate'), icon: <ClipboardDocumentIcon className="w-5 h-5" /> },
      { label: t('job_sidebar.archive'), icon: <ArchiveBoxIcon className="w-5 h-5" /> },
      { label: t('job_sidebar.republish'), icon: <ArrowPathIcon className="w-5 h-5" /> },
      { label: t('job_sidebar.view_candidates'), icon: <UserGroupIcon className="w-5 h-5" /> },
    ];

    const recentActivitiesData = [
        { description: 'נוצר אירוע חדש: ראיון טלפוני', time: 'לפני שעתיים', user: 'חלי' },
        { description: 'המועמד "ישראל ישראלי" שויך למשרה', time: 'אתמול', user: 'מערכת' },
        { description: 'המשרה עודכנה: טווח שכר עודכן', time: 'לפני יומיים', user: 'חלי' },
    ];

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
            <SidebarCard title={t('job_sidebar.quick_stats')} icon={<ChartBarIcon className="w-5 h-5" />}>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                    <div className="font-semibold text-text-muted">{t('job_sidebar.status')}</div>
                    <div><span className={`font-bold px-2 py-0.5 rounded-full ${job.status === 'פתוחה' || job.status === 'Open' ? 'text-green-600 bg-green-100' : 'text-text-default bg-bg-subtle'}`}>{t(`status.${job.status}`)}</span></div>
                    
                    <div className="font-semibold text-text-muted">{t('job_sidebar.total_candidates')}</div>
                    <div className="font-bold text-text-default">{totalCandidates}</div>

                    <div className="font-semibold text-text-muted">{t('job_sidebar.open_for')}</div>
                    <div className="font-bold text-text-default">{diffDays} {t('job_sidebar.days')}</div>

                    <div className="font-semibold text-text-muted">{t('job_sidebar.open_date')}</div>
                    <div className="font-bold text-text-default">{openDate.toLocaleDateString('he-IL')}</div>
                </div>
            </SidebarCard>

            <SidebarCard title={t('job_sidebar.funnel')} icon={<FunnelIcon className="w-5 h-5" />}>
                <div className="space-y-1">
                    <InsightItem label={t('job_sidebar.new_candidates')} count={funnelStats.newCandidates} />
                    <InsightItem label={t('job_sidebar.advanced_process')} count={funnelStats.advancedProcess} />
                    <InsightItem label={t('job_sidebar.cv_sent')} count={funnelStats.cvSent} />
                    <InsightItem label={t('job_sidebar.rejected')} count={funnelStats.rejected} />
                </div>
            </SidebarCard>

            <SidebarCard title={t('job_sidebar.sources')} icon={<LinkIcon className="w-5 h-5" />}>
                 <div className="space-y-1">
                    <InsightItem label={t('job_sidebar.from_ads')} count={sourcingStats.fromAds} />
                    <InsightItem label={t('job_sidebar.from_other')} count={sourcingStats.fromOther} />
                </div>
            </SidebarCard>

            <SidebarCard title={t('job_sidebar.quick_actions')} icon={<PencilSquareIcon className="w-5 h-5" />} editable>
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
            
            <SidebarCard title={t('job_sidebar.activity')} icon={<ClockIcon className="w-5 h-5" />}>
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
