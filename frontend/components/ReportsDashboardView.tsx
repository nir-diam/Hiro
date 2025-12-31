
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    ChartBarIcon, CalendarDaysIcon, UserGroupIcon, ArrowPathIcon, 
    FunnelIcon, ArrowDownTrayIcon, CheckCircleIcon, ClockIcon, 
    BriefcaseIcon, DocumentTextIcon, AdjustmentsHorizontalIcon, Cog6ToothIcon,
    ChevronDownIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon, EyeIcon, PaperAirplaneIcon,
    ChevronUpIcon, ArrowRightIcon
} from './Icons';
import { KPICard, SimpleBarChart, Sparkline, HeatmapCell, DeltaChart } from './ReportsComponents';
import CustomizeViewsPopover, { ViewConfig } from './CustomizeViewsPopover';
import { useLanguage } from '../context/LanguageContext';

// --- MOCK DATA ---
const recruiters = ['דנה', 'אביב', 'יעל', 'מיכל', 'גיא'];

// Dynamic data based on metric selection
const chartDataMap: Record<string, { label: string; value: number; color?: string }[]> = {
    'hires': [
        { label: 'ינו', value: 12, color: 'bg-green-400' },
        { label: 'פבר', value: 15, color: 'bg-green-400' },
        { label: 'מרץ', value: 18, color: 'bg-green-400' },
        { label: 'אפר', value: 24, color: 'bg-green-500' },
        { label: 'מאי', value: 20, color: 'bg-green-500' },
        { label: 'יוני', value: 35, color: 'bg-green-600' },
        { label: 'יולי', value: 42, color: 'bg-green-600' },
    ],
    'cv_ingestions': [
        { label: 'ינו', value: 850, color: 'bg-indigo-400' },
        { label: 'פבר', value: 920, color: 'bg-indigo-400' },
        { label: 'מרץ', value: 880, color: 'bg-indigo-400' },
        { label: 'אפר', value: 1050, color: 'bg-indigo-500' },
        { label: 'מאי', value: 1100, color: 'bg-indigo-500' },
        { label: 'יוני', value: 1250, color: 'bg-indigo-600' },
        { label: 'יולי', value: 1340, color: 'bg-indigo-600' },
    ],
    'referrals': [
        { label: 'ינו', value: 120, color: 'bg-blue-400' },
        { label: 'פבר', value: 145, color: 'bg-blue-400' },
        { label: 'מרץ', value: 160, color: 'bg-blue-400' },
        { label: 'אפר', value: 155, color: 'bg-blue-500' },
        { label: 'מאי', value: 180, color: 'bg-blue-500' },
        { label: 'יוני', value: 210, color: 'bg-blue-600' },
        { label: 'יולי', value: 245, color: 'bg-blue-600' },
    ],
    'screenings': [
        { label: 'ינו', value: 320, color: 'bg-teal-400' },
        { label: 'פבר', value: 340, color: 'bg-teal-400' },
        { label: 'מרץ', value: 310, color: 'bg-teal-400' },
        { label: 'אפר', value: 380, color: 'bg-teal-500' },
        { label: 'מאי', value: 410, color: 'bg-teal-500' },
        { label: 'יוני', value: 450, color: 'bg-teal-600' },
        { label: 'יולי', value: 480, color: 'bg-teal-600' },
    ],
    'open_jobs': [
        { label: 'ינו', value: 20, color: 'bg-orange-400' },
        { label: 'פבר', value: 22, color: 'bg-orange-400' },
        { label: 'מרץ', value: 25, color: 'bg-orange-400' },
        { label: 'אפר', value: 24, color: 'bg-orange-500' },
        { label: 'מאי', value: 28, color: 'bg-orange-500' },
        { label: 'יוני', value: 30, color: 'bg-orange-600' },
        { label: 'יולי', value: 28, color: 'bg-orange-600' },
    ],
    'time_to_hire': [
        { label: 'ינו', value: 45, color: 'bg-gray-400' },
        { label: 'פבר', value: 42, color: 'bg-gray-400' },
        { label: 'מרץ', value: 44, color: 'bg-gray-400' },
        { label: 'אפר', value: 38, color: 'bg-gray-500' },
        { label: 'מאי', value: 35, color: 'bg-gray-500' },
        { label: 'יוני', value: 36, color: 'bg-gray-600' },
        { label: 'יולי', value: 34, color: 'bg-gray-600' },
    ],
    'portal_submissions': [
        { label: 'ינו', value: 50, color: 'bg-pink-400' },
        { label: 'פבר', value: 65, color: 'bg-pink-400' },
        { label: 'מרץ', value: 60, color: 'bg-pink-400' },
        { label: 'אפר', value: 80, color: 'bg-pink-500' },
        { label: 'מאי', value: 95, color: 'bg-pink-500' },
        { label: 'יוני', value: 110, color: 'bg-pink-600' },
        { label: 'יולי', value: 125, color: 'bg-pink-600' },
    ],
    'communications': [
        { label: 'ינו', value: 1500, color: 'bg-cyan-400' },
        { label: 'פבר', value: 1650, color: 'bg-cyan-400' },
        { label: 'מרץ', value: 1800, color: 'bg-cyan-400' },
        { label: 'אפר', value: 1750, color: 'bg-cyan-500' },
        { label: 'מאי', value: 1900, color: 'bg-cyan-500' },
        { label: 'יוני', value: 2100, color: 'bg-cyan-600' },
        { label: 'יולי', value: 2300, color: 'bg-cyan-600' },
    ],
    'passed_screening': [
        { label: 'ינו', value: 80, color: 'bg-emerald-400' },
        { label: 'פבר', value: 95, color: 'bg-emerald-400' },
        { label: 'מרץ', value: 110, color: 'bg-emerald-400' },
        { label: 'אפר', value: 120, color: 'bg-emerald-500' },
        { label: 'מאי', value: 130, color: 'bg-emerald-500' },
        { label: 'יוני', value: 145, color: 'bg-emerald-600' },
        { label: 'יולי', value: 160, color: 'bg-emerald-600' },
    ]
};

const comparisonData = [
    { id: 'hires', metric: 'metric.hires', current: 15, previous: 12, change: 25, data: [8, 9, 11, 10, 12, 14, 15] },
    { id: 'cv_ingestions', metric: 'metric.cv_ingestions', current: 450, previous: 410, change: 9.7, data: [380, 390, 400, 420, 410, 430, 450] },
    { id: 'referrals', metric: 'metric.referrals', current: 84, previous: 92, change: -8.7, data: [80, 85, 90, 95, 92, 88, 84] },
    { id: 'open_jobs', metric: 'metric.open_jobs', current: 8, previous: 5, change: 60, data: [3, 4, 4, 5, 6, 5, 8] },
    { id: 'screenings', metric: 'metric.screenings', current: 120, previous: 100, change: 20, data: [10, 20, 50, 80, 90, 110, 120] },
    { id: 'time_to_hire', metric: 'metric.time_to_hire', current: 34, previous: 36, change: -5.5, data: [40, 38, 38, 37, 36, 35, 34] },
    { id: 'portal_submissions', metric: 'metric.portal_submissions', current: 250, previous: 200, change: 25, data: [180, 190, 200, 220, 230, 240, 250] },
];

const deltaData = [
    { label: 'דנה', value: 5 },
    { label: 'אביב', value: -2 },
    { label: 'יעל', value: 3 },
    { label: 'מיכל', value: 0 },
    { label: 'גיא', value: -1 },
];

const availableMetrics: ViewConfig[] = [
    { id: 'hires', name: 'התקבלו לעבודה (השמות)', visible: true },
    { id: 'cv_ingestions', name: 'קליטות קו"ח', visible: true },
    { id: 'referrals', name: 'הפניות ללקוחות', visible: true },
    { id: 'screenings', name: 'סינונים שבוצעו', visible: true },
    { id: 'open_jobs', name: 'משרות פתוחות', visible: true },
    { id: 'time_to_hire', name: 'זמן ממוצע לגיוס', visible: false },
    { id: 'portal_submissions', name: 'הגשות מדפי פרסום', visible: false },
    { id: 'communications', name: 'תקשורת (מייל/סמס)', visible: false },
    { id: 'passed_screening', name: 'עברו סינון ראשוני', visible: false },
];

// --- RECRUITER TABLE METRICS ---
const recruiterViewOptions: ViewConfig[] = [
    { id: 'cv_ingestions', name: 'קליטות קו"ח', visible: true },
    { id: 'referrals', name: 'הפניות', visible: true },
    { id: 'screenings_done', name: 'סינונים שבוצעו', visible: true },
    { id: 'passed_screening', name: 'עבר סינון ראשוני', visible: true },
    { id: 'rejected_screening', name: 'נדחה בסינון ראשוני', visible: false },
    { id: 'moved_to_process', name: 'עברו ל"בתהליך"', visible: true },
    { id: 'moved_to_no_process', name: 'עברו ל"לא בתהליך"', visible: false },
    { id: 'status_changes', name: 'שינויי סטטוס הפניה', visible: true },
    { id: 'sms_sent', name: 'שליחות סמס', visible: false },
    { id: 'user_actions', name: 'פעולות משתמשים', visible: false },
    { id: 'candidates_fixed', name: 'מועמדים תוקנו', visible: false },
    { id: 'cross_sections', name: 'חיתוכי מועמדים', visible: false },
    { id: 'all_events', name: 'כל האירועים', visible: false },
    { id: 'logins', name: 'התחברויות', visible: false },
    { id: 'started_work', name: 'התחילו לעבוד', visible: true },
    { id: 'moved_to_hired', name: 'עברו ל"התקבלו"', visible: true },
];

const recruitersHeatmap = recruiters.map(name => ({
    name,
    cv_ingestions: Math.floor(Math.random() * 300) + 100,
    referrals: Math.floor(Math.random() * 80) + 20,
    screenings_done: Math.floor(Math.random() * 150) + 50,
    passed_screening: Math.floor(Math.random() * 80) + 30,
    rejected_screening: Math.floor(Math.random() * 50) + 10,
    moved_to_process: Math.floor(Math.random() * 40) + 10,
    moved_to_no_process: Math.floor(Math.random() * 20) + 5,
    status_changes: Math.floor(Math.random() * 100) + 20,
    sms_sent: Math.floor(Math.random() * 200) + 50,
    user_actions: Math.floor(Math.random() * 500) + 100,
    candidates_fixed: Math.floor(Math.random() * 30),
    cross_sections: Math.floor(Math.random() * 50),
    all_events: Math.floor(Math.random() * 150) + 50,
    logins: Math.floor(Math.random() * 30) + 5,
    started_work: Math.floor(Math.random() * 5),
    moved_to_hired: Math.floor(Math.random() * 8),
}));

// --- TABS CONTENT ---

const TrendsTab: React.FC = () => {
    const { t } = useLanguage();
    const [selectedMetric, setSelectedMetric] = useState<string>('hires');
    const [metricsConfig, setMetricsConfig] = useState<ViewConfig[]>(availableMetrics);
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    
    const customizeBtnRef = useRef<HTMLButtonElement>(null);
    const customizePopoverRef = useRef<HTMLDivElement>(null);

    const handleSaveConfig = (newConfig: ViewConfig[]) => {
        setMetricsConfig(newConfig);
        setIsCustomizeOpen(false);
        if (!newConfig.find(c => c.id === selectedMetric)?.visible) {
            const firstVisible = newConfig.find(c => c.visible);
            if (firstVisible) setSelectedMetric(firstVisible.id);
        }
    };

    const handleResetConfig = () => {
        setMetricsConfig(availableMetrics);
        setIsCustomizeOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                customizePopoverRef.current &&
                !customizePopoverRef.current.contains(event.target as Node) &&
                customizeBtnRef.current &&
                !customizeBtnRef.current.contains(event.target as Node)
            ) {
                setIsCustomizeOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const kpiRenderData: Record<string, any> = {
        'hires': { title: t('metric.hires'), value: "42", trend: 12, trendLabel: t('reports.col_previous'), icon: <CheckCircleIcon className="w-6 h-6 text-white" />, colorClass: "bg-green-500" },
        'cv_ingestions': { title: t('metric.cv_ingestions'), value: "1,340", trend: 5, trendLabel: t('reports.col_previous'), icon: <DocumentTextIcon className="w-6 h-6 text-white" />, colorClass: "bg-indigo-500" },
        'referrals': { title: t('metric.referrals'), value: "245", trend: 8, trendLabel: t('reports.col_previous'), icon: <PaperAirplaneIcon className="w-6 h-6 text-white" />, colorClass: "bg-blue-500" },
        'screenings': { title: t('metric.screenings'), value: "480", trend: 15, trendLabel: t('reports.col_previous'), icon: <FunnelIcon className="w-6 h-6 text-white" />, colorClass: "bg-teal-500" },
        'open_jobs': { title: t('metric.open_jobs'), value: "28", trend: 0, trendLabel: t('reports.col_previous'), icon: <BriefcaseIcon className="w-6 h-6 text-white" />, colorClass: "bg-orange-500" },
        'time_to_hire': { title: t('metric.time_to_hire'), value: "34", trend: -5, trendLabel: t('reports.col_previous'), icon: <ClockIcon className="w-6 h-6 text-white" />, colorClass: "bg-gray-500" },
        'portal_submissions': { title: t('metric.portal_submissions'), value: "125", trend: 22, trendLabel: t('reports.col_previous'), icon: <EyeIcon className="w-6 h-6 text-white" />, colorClass: "bg-pink-500" },
        'communications': { title: t('metric.communications'), value: "2.3k", trend: 10, trendLabel: t('reports.col_previous'), icon: <EnvelopeIcon className="w-6 h-6 text-white" />, colorClass: "bg-cyan-500" },
        'passed_screening': { title: t('metric.passed_screening'), value: "160", trend: 12, trendLabel: t('reports.col_previous'), icon: <CheckCircleIcon className="w-6 h-6 text-white" />, colorClass: "bg-emerald-500" },
    };

    const chartData = chartDataMap[selectedMetric] || [];
    const activeColorTheme = kpiRenderData[selectedMetric]?.colorClass.split(' ')[0] || 'bg-primary-400';
    const activeTitle = kpiRenderData[selectedMetric]?.title || 'נתונים';

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-end">
                <div className="relative">
                    <button 
                        ref={customizeBtnRef}
                        onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
                        className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary-600 bg-bg-subtle px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                        <span>{t('reports.customize_metrics')}</span>
                    </button>
                    {isCustomizeOpen && (
                        <div ref={customizePopoverRef} className="z-20">
                            <CustomizeViewsPopover
                                isOpen={isCustomizeOpen}
                                onClose={() => setIsCustomizeOpen(false)}
                                views={metricsConfig}
                                onSave={handleSaveConfig}
                                onReset={handleResetConfig}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* KPIs Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {metricsConfig.filter(c => c.visible).map(config => {
                    const data = kpiRenderData[config.id];
                    if (!data) return null;
                    return (
                        <KPICard
                            key={config.id}
                            id={config.id}
                            title={data.title}
                            value={data.value}
                            trend={data.trend}
                            trendLabel={data.trendLabel}
                            icon={data.icon}
                            colorClass={data.colorClass}
                            isActive={selectedMetric === config.id}
                            onClick={() => setSelectedMetric(config.id)}
                        />
                    );
                })}
            </div>

            {/* Main Chart */}
            <div className="bg-bg-card rounded-xl border border-border-default p-6 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-text-default">
                        {t('reports.tab_trends')}: {activeTitle}
                    </h3>
                    <select className="bg-bg-input border border-border-default rounded-md text-sm p-1 cursor-pointer">
                        <option>{t('reports.chart_monthly')}</option>
                        <option>{t('reports.chart_quarterly')}</option>
                    </select>
                </div>
                <SimpleBarChart data={chartData} height={280} colorTheme={activeColorTheme} />
            </div>
        </div>
    );
};

const ComparisonTab: React.FC = () => {
    const { t } = useLanguage();
    const [metricsConfig, setMetricsConfig] = useState<ViewConfig[]>(availableMetrics);
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const customizeBtnRef = useRef<HTMLButtonElement>(null);
    const customizePopoverRef = useRef<HTMLDivElement>(null);

    const handleSaveConfig = (newConfig: ViewConfig[]) => {
        setMetricsConfig(newConfig);
        setIsCustomizeOpen(false);
    };

    const handleResetConfig = () => {
        setMetricsConfig(availableMetrics);
        setIsCustomizeOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                customizePopoverRef.current &&
                !customizePopoverRef.current.contains(event.target as Node) &&
                customizeBtnRef.current &&
                !customizeBtnRef.current.contains(event.target as Node)
            ) {
                setIsCustomizeOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const filteredData = comparisonData.filter(row => 
        metricsConfig.find(c => c.id === row.id)?.visible
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header with Customize Button */}
            <div className="flex justify-between items-center">
                 {/* Insight Banner */}
                <div className="bg-blue-50 border-r-4 border-blue-500 p-4 rounded-lg text-blue-900 text-sm flex items-start gap-3 flex-1 mr-6">
                    <ArrowPathIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        {t('reports.insight_banner')}
                    </div>
                </div>

                <div className="relative">
                    <button 
                        ref={customizeBtnRef}
                        onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
                        className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary-600 bg-bg-subtle px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                        <span>{t('reports.customize_metrics')}</span>
                    </button>
                    {isCustomizeOpen && (
                        <div ref={customizePopoverRef} className="z-20">
                            <CustomizeViewsPopover
                                isOpen={isCustomizeOpen}
                                onClose={() => setIsCustomizeOpen(false)}
                                views={metricsConfig}
                                onSave={handleSaveConfig}
                                onReset={handleResetConfig}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Detailed Table - Now with scroll on mobile */}
                <div className="lg:col-span-2 bg-bg-card rounded-xl border border-border-default overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right min-w-[600px]">
                            <thead className="bg-bg-subtle text-text-muted font-semibold">
                                <tr>
                                    <th className="p-4 whitespace-nowrap">{t('reports.col_metric')}</th>
                                    <th className="p-4 whitespace-nowrap">{t('reports.col_current')}</th>
                                    <th className="p-4 whitespace-nowrap">{t('reports.col_previous')}</th>
                                    <th className="p-4 whitespace-nowrap">{t('reports.col_change')}</th>
                                    <th className="p-4 whitespace-nowrap">{t('reports.col_trend')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-default">
                                {filteredData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-bg-hover/50">
                                        <td className="p-4 font-medium text-text-default">{t(row.metric)}</td>
                                        <td className="p-4 font-bold">{row.current}</td>
                                        <td className="p-4 text-text-muted">{row.previous}</td>
                                        <td className={`p-4 font-bold ${row.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {row.change > 0 ? '+' : ''}{row.change}%
                                        </td>
                                        <td className="p-4 w-32">
                                            <Sparkline data={row.data} color={row.change > 0 ? '#16a34a' : '#dc2626'} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredData.length === 0 && (
                         <div className="p-8 text-center text-text-muted">
                            {t('reports.no_data')}
                        </div>
                    )}
                </div>

                {/* Delta Chart */}
                <div className="bg-bg-card rounded-xl border border-border-default p-6">
                    <h3 className="font-bold text-text-default mb-4 text-center">{t('reports.delta_title')}</h3>
                    <p className="text-xs text-text-muted text-center mb-6">{t('reports.delta_subtitle')}</p>
                    <DeltaChart data={deltaData} />
                </div>
            </div>
        </div>
    );
};

const RecruitersTab: React.FC = () => {
    const { t } = useLanguage();
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [viewConfig, setViewConfig] = useState<ViewConfig[]>(recruiterViewOptions);
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    
    const customizeBtnRef = useRef<HTMLButtonElement>(null);
    const customizePopoverRef = useRef<HTMLDivElement>(null);

    // Calculate aggregates
    const totals = useMemo(() => {
        return recruitersHeatmap.reduce((acc, curr) => ({
            cvs: acc.cvs + curr.cv_ingestions,
            screened: acc.screened + curr.screenings_done,
            interviews: acc.interviews + curr.passed_screening, // Proxy for interviews for funnel
            hired: acc.hired + curr.moved_to_hired
        }), { cvs: 0, screened: 0, interviews: 0, hired: 0 });
    }, []);

    const sortedRecruiters = useMemo(() => {
        let sortable = [...recruitersHeatmap];
        if (sortConfig !== null) {
            sortable.sort((a, b) => {
                // @ts-ignore
                const aVal = a[sortConfig.key];
                // @ts-ignore
                const bVal = b[sortConfig.key];
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle text-xs ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const handleSaveConfig = (newConfig: ViewConfig[]) => {
        setViewConfig(newConfig);
        setIsCustomizeOpen(false);
    };

    const handleResetConfig = () => {
        setViewConfig(recruiterViewOptions);
        setIsCustomizeOpen(false);
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                customizePopoverRef.current &&
                !customizePopoverRef.current.contains(event.target as Node) &&
                customizeBtnRef.current &&
                !customizeBtnRef.current.contains(event.target as Node)
            ) {
                setIsCustomizeOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const FunnelSummaryWidget = () => (
        <div className="bg-bg-card border border-border-default rounded-xl p-6 mb-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
                {/* Connector Line for Desktop */}
                <div className="hidden md:block absolute top-1/2 left-10 right-10 h-0.5 bg-border-default -z-10 transform -translate-y-1/2"></div>
                
                {[
                    { label: t('metric.cv_ingestions'), value: totals.cvs, icon: <DocumentTextIcon className="w-5 h-5" />, color: 'bg-indigo-100 text-indigo-600' },
                    { label: t('metric.screenings_done'), value: totals.screened, icon: <FunnelIcon className="w-5 h-5" />, color: 'bg-blue-100 text-blue-600' },
                    { label: t('metric.passed_screening'), value: totals.interviews, icon: <UserGroupIcon className="w-5 h-5" />, color: 'bg-purple-100 text-purple-600' },
                    { label: t('metric.hires'), value: totals.hired, icon: <CheckCircleIcon className="w-5 h-5" />, color: 'bg-green-100 text-green-600' }
                ].map((step, idx) => (
                    <div key={idx} className="flex-1 w-full md:w-auto flex flex-col items-center bg-bg-card p-2 z-10 relative">
                         <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${step.color}`}>
                             {step.icon}
                         </div>
                         <span className="text-2xl font-bold text-text-default">{step.value}</span>
                         <span className="text-sm text-text-muted font-medium">{step.label}</span>
                         {/* Arrow for Mobile */}
                         {idx < 3 && <div className="md:hidden mt-3 text-text-subtle"><ArrowDownTrayIcon className="w-4 h-4"/></div>}
                    </div>
                ))}
            </div>
        </div>
    );

    // Helper to calculate max value for a column to scale the heatmap correctly
    const getColumnMax = (key: string) => {
        return Math.max(...recruitersHeatmap.map(r => (r as any)[key] || 0), 1);
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-text-default">{t('reports.recruiters_performance')}</h3>
                <div className="relative">
                    <button 
                        ref={customizeBtnRef}
                        onClick={() => setIsCustomizeOpen(!isCustomizeOpen)}
                        className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary-600 bg-bg-subtle px-3 py-1.5 rounded-lg transition-colors"
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                        <span>{t('reports.customize_metrics')}</span>
                    </button>
                    {isCustomizeOpen && (
                        <div ref={customizePopoverRef} className="z-20">
                            <CustomizeViewsPopover
                                isOpen={isCustomizeOpen}
                                onClose={() => setIsCustomizeOpen(false)}
                                views={viewConfig}
                                onSave={handleSaveConfig}
                                onReset={handleResetConfig}
                            />
                        </div>
                    )}
                </div>
            </div>

            <FunnelSummaryWidget />

            {/* Heatmap Table with Scroll */}
            <div className="bg-bg-card rounded-xl border border-border-default overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-center min-w-[900px]">
                        <thead className="bg-bg-subtle text-text-muted font-semibold border-b border-border-default">
                            <tr>
                                <th className="p-4 text-right min-w-[140px] cursor-pointer hover:bg-bg-hover transition-colors sticky right-0 bg-bg-subtle z-10 border-l border-border-default/50" onClick={() => requestSort('name')}>
                                    <div className="flex items-center">{t('reports.col_recruiter')} {getSortIndicator('name')}</div>
                                </th>
                                {viewConfig.filter(col => col.visible).map(col => (
                                    <th key={col.id} className="p-4 cursor-pointer hover:bg-bg-hover transition-colors whitespace-nowrap" onClick={() => requestSort(col.id)}>
                                        {t(`metric.${col.id}`) || col.name} {getSortIndicator(col.id)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                            {sortedRecruiters.map((r, idx) => (
                                <tr key={idx} className="hover:bg-bg-hover/50 transition-colors group cursor-pointer">
                                    <td className="p-4 text-right font-bold text-text-default flex items-center gap-3 sticky right-0 bg-bg-card group-hover:bg-bg-hover/50 z-10 border-l border-border-default/50">
                                         <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold border border-gray-200">{r.name[0]}</div>
                                         <span className="group-hover:text-primary-600 transition-colors whitespace-nowrap">{r.name}</span>
                                    </td>
                                    {viewConfig.filter(col => col.visible).map(col => (
                                        <td key={col.id} className="p-2">
                                            <HeatmapCell value={(r as any)[col.id]} max={getColumnMax(col.id)} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- MAIN VIEW ---
const ReportsDashboardView: React.FC = () => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'trends' | 'comparison' | 'recruiters'>('trends');
    const [dateRange, setDateRange] = useState('last_30_days');
    const [selectedRecruiter, setSelectedRecruiter] = useState('all');

    return (
        <div className="flex flex-col h-full p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.4s ease-out; }`}</style>
            
            {/* Header & Global Filters */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-default">{t('reports.title')}</h1>
                    <p className="text-text-muted text-sm">{t('reports.subtitle')}</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
                    {/* Recruiter Filter */}
                    <div className="bg-bg-card p-1.5 rounded-xl border border-border-default shadow-sm flex items-center gap-2 w-full sm:w-auto">
                        <UserGroupIcon className="w-4 h-4 text-text-subtle ml-1 mr-1 flex-shrink-0" />
                        <select 
                            value={selectedRecruiter}
                            onChange={(e) => setSelectedRecruiter(e.target.value)}
                            className="bg-transparent text-sm font-semibold outline-none text-text-default cursor-pointer min-w-[100px] w-full sm:w-auto"
                        >
                            <option value="all">{t('reports.filter_recruiter')}</option>
                            {recruiters.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {/* Date Range Filter */}
                    <div className="flex items-center gap-3 bg-bg-card p-1.5 rounded-xl border border-border-default shadow-sm w-full sm:w-auto">
                        <div className="relative w-full sm:w-auto">
                            <CalendarDaysIcon className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle" />
                            <select 
                                value={dateRange} 
                                onChange={(e) => setDateRange(e.target.value)} 
                                className="bg-transparent text-sm font-semibold pl-2 pr-9 py-1.5 outline-none text-text-default cursor-pointer w-full sm:w-auto"
                            >
                                <option value="last_7_days">{t('reports.filter_date_7days')}</option>
                                <option value="last_30_days">{t('reports.filter_date_30days')}</option>
                                <option value="this_month">{t('reports.filter_date_this_month')}</option>
                                <option value="last_month">{t('reports.filter_date_last_month')}</option>
                                <option value="this_quarter">{t('reports.filter_date_quarter')}</option>
                                <option value="this_year">{t('reports.filter_date_year')}</option>
                                <option value="custom">{t('reports.filter_date_custom')}</option>
                            </select>
                        </div>
                        <div className="w-px h-5 bg-border-default hidden sm:block"></div>
                        <button className="text-sm font-semibold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 justify-center w-full sm:w-auto mt-2 sm:mt-0">
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            <span className="sm:hidden">{t('reports.export')}</span>
                            <span className="hidden sm:inline">{t('reports.export')}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Navigation Tabs */}
            <div className="border-b border-border-default overflow-x-auto">
                <nav className="flex gap-6 min-w-max">
                    {[
                        { id: 'trends', label: t('reports.tab_trends'), icon: <ChartBarIcon className="w-5 h-5"/> },
                        { id: 'comparison', label: t('reports.tab_comparison'), icon: <ArrowPathIcon className="w-5 h-5"/> },
                        { id: 'recruiters', label: t('reports.tab_recruiters'), icon: <UserGroupIcon className="w-5 h-5"/> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 pb-3 text-sm font-bold transition-all border-b-2 ${
                                activeTab === tab.id 
                                ? 'border-primary-500 text-primary-600' 
                                : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content Area */}
            <main className="flex-1 overflow-y-auto pb-10">
                {activeTab === 'trends' && <TrendsTab />}
                {activeTab === 'comparison' && <ComparisonTab />}
                {activeTab === 'recruiters' && <RecruitersTab />}
            </main>
        </div>
    );
};

export default ReportsDashboardView;
