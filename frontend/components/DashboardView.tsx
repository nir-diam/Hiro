
import React, { useState, useEffect, useRef } from 'react';
import { 
    Cog6ToothIcon, InformationCircleIcon, ArrowPathIcon, MagnifyingGlassIcon, UserGroupIcon, BriefcaseIcon, 
    ArrowTopRightOnSquareIcon, ClockIcon, PaperAirplaneIcon, CheckCircleIcon, AdjustmentsHorizontalIcon, ChartBarIcon,
    UserPlusIcon, ChevronUpIcon, ChevronDownIcon
} from './Icons';
import CustomizeViewsPopover, { ViewConfig } from './CustomizeViewsPopover';
import RecruitmentGoalWidget from './RecruitmentGoalWidget';
import DevAnnotation from './DevAnnotation';

// --- Reusable Dashboard Components ---

const DashboardCard: React.FC<{ children: React.ReactNode; className?: string; title: string; linkText?: string; onLinkClick?: () => void; chartColorClass?: string; chartColorShade?: string; }> = ({ children, className = '', title, linkText, onLinkClick, chartColorClass = 'primary', chartColorShade = '600' }) => (
    <div className={`bg-bg-card rounded-xl border border-border-default shadow-sm flex flex-col h-full overflow-hidden ${className}`}>
        <header className="px-4 py-3 border-b border-border-subtle flex justify-between items-center bg-bg-subtle/30">
            <h3 className="font-bold text-sm text-text-default truncate" title={title}>{title}</h3>
            {linkText && onLinkClick ? (
                 <button onClick={onLinkClick} className="text-xs font-semibold text-primary-600 hover:underline flex-shrink-0 ml-2 bg-primary-50 px-2 py-1 rounded-md hover:bg-primary-100 transition-colors">
                    {linkText}
                </button>
            ) : (
                <InformationCircleIcon className="w-4 h-4 text-text-subtle opacity-50" />
            )}
        </header>
        <div className="p-4 flex-grow flex flex-col justify-center" style={{'--chart-color': `rgb(var(--color-${chartColorClass}-${chartColorShade}))`, '--chart-color-subtle': `rgb(var(--color-${chartColorClass}-100))` } as React.CSSProperties}>
            {children}
        </div>
    </div>
);

// Smart KPI Card
interface KpiCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    sentiment?: 'neutral' | 'success' | 'warning' | 'critical';
    trend?: number; // Percentage change (+ or -)
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, sentiment = 'neutral', trend }) => {
    let colorStyles = 'bg-bg-card border-border-default hover:border-primary-300';
    let iconColor = 'text-primary-200 group-hover:text-primary-500';
    let valueColor = 'text-text-default';

    if (sentiment === 'critical') {
        colorStyles = 'bg-red-50/40 border-red-200 hover:border-red-300';
        iconColor = 'text-red-300 group-hover:text-red-500';
        valueColor = 'text-red-700';
    } else if (sentiment === 'warning') {
        colorStyles = 'bg-orange-50/40 border-orange-200 hover:border-orange-300';
        iconColor = 'text-orange-300 group-hover:text-orange-500';
        valueColor = 'text-orange-800';
    } else if (sentiment === 'success') {
        colorStyles = 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300';
        iconColor = 'text-emerald-300 group-hover:text-emerald-500';
        valueColor = 'text-emerald-800';
    }

    return (
        <div className={`${colorStyles} rounded-xl border shadow-sm flex flex-col relative overflow-hidden group transition-all hover:shadow-md w-full aspect-[1.6/1] min-h-[100px] p-3`}>
            {/* Header: Title & Icon */}
            <div className="flex justify-between items-start w-full z-10">
                <div className={`${iconColor} transition-colors opacity-80 scale-90 origin-top-right`}>
                    {React.cloneElement(icon as React.ReactElement<any>, { className: "w-5 h-5" })}
                </div>
                <p className="text-[11px] font-bold text-text-muted uppercase tracking-wide truncate ml-2" title={title}>{title}</p>
            </div>
            
            {/* Center: Number */}
            <div className="flex-grow flex items-center justify-center z-10 -mt-1">
                <p className={`text-4xl font-extrabold tracking-tight ${valueColor}`}>{value}</p>
            </div>

            {/* Footer: Trend (Fixed height to prevent jumping) */}
            <div className="h-5 flex items-end justify-center w-full z-10">
                {trend !== undefined ? (
                    <div className="flex items-center text-[10px] font-medium bg-white/60 px-1.5 py-0.5 rounded-full backdrop-blur-sm shadow-sm">
                         {trend > 0 ? (
                            <span className="text-emerald-600 flex items-center">
                                <ChevronUpIcon className="w-3 h-3 mr-0.5 stroke-2" /> {Math.abs(trend)}%
                            </span>
                        ) : trend < 0 ? (
                            <span className="text-red-600 flex items-center">
                                <ChevronDownIcon className="w-3 h-3 mr-0.5 stroke-2" /> {Math.abs(trend)}%
                            </span>
                        ) : (
                            <span className="text-text-muted flex items-center">
                                 - 0%
                            </span>
                        )}
                        <span className="text-text-subtle mr-1 hidden sm:inline">שינוי</span>
                    </div>
                ) : (
                    // Invisible placeholder to maintain alignment
                    <div className="h-4"></div>
                )}
            </div>
        </div>
    );
};

const KpiCardsGrid: React.FC<{ kpis: (KpiCardProps & { id: string })[] }> = ({ kpis }) => {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
            {kpis.map((kpi) => (
                <div key={kpi.id} className="col-span-1">
                    <KpiCard {...kpi} />
                </div>
            ))}
        </div>
    );
};

const VerticalBarChart: React.FC<{ data: { label: string; value: number }[]; max: number; }> = ({ data, max }) => (
    <div className="flex justify-around items-end h-40 gap-1 pt-4 pb-2">
        {data.map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                <div className="relative w-full h-full flex items-end justify-center">
                    <div 
                        className="w-full max-w-[12px] rounded-t-md opacity-60 group-hover:opacity-100 transition-all duration-300 bg-primary-400 group-hover:bg-primary-600 relative" 
                        style={{ height: `${(item.value / max) * 100}%` }}
                    >
                         {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-20">
                            {item.value}
                        </div>
                    </div>
                </div>
                {index % 5 === 0 && <span className="text-[10px] text-text-subtle">{item.label}</span>}
            </div>
        ))}
    </div>
);

// Funnel Visualization Component
const FunnelChart: React.FC<{ data: { label: string; value: number; total?: number }[]; max: number; }> = ({ data, max }) => (
    <div className="space-y-4 py-2">
        {data.map((item, index) => {
            const widthPercent = Math.max((item.value / max) * 100, 5); // Min 5% width
            const dropOff = index > 0 ? Math.round(((data[index - 1].value - item.value) / data[index - 1].value) * 100) : 0;
            
            // Gradient colors for funnel depth effect
            const opacity = 1 - (index * 0.15); 
            
            return (
                <div key={index} className="relative group">
                    <div className="flex items-center h-8">
                        {/* Label */}
                        <div className="w-28 flex-shrink-0 text-xs font-semibold text-text-muted group-hover:text-primary-700 transition-colors truncate pl-1">
                            {item.label}
                        </div>
                        
                        {/* Bar Container */}
                        <div className="flex-grow relative h-full flex items-center">
                             {/* Connector Line */}
                            {index < data.length - 1 && (
                                <div 
                                    className="absolute left-0 top-1/2 w-0.5 bg-border-subtle z-0"
                                    style={{ height: '40px', left: `${(data[index+1].value / max) * 100 / 2}%` }}
                                ></div>
                            )}
                            
                            {/* The Bar */}
                            <div 
                                className="h-full rounded-r-lg rounded-l-sm bg-primary-500 transition-all duration-500 ease-out shadow-sm relative z-10 flex items-center justify-end px-2"
                                style={{ 
                                    width: `${widthPercent}%`, 
                                    opacity: Math.max(opacity, 0.3) 
                                }}
                            >
                                <span className="text-white text-xs font-bold">{item.value}</span>
                            </div>
                        </div>

                        {/* Dropoff Stat (Right side) */}
                        <div className="w-12 flex-shrink-0 text-right">
                             {index > 0 && dropOff > 0 && (
                                <span className="text-[9px] text-red-500 bg-red-50 px-1 py-0.5 rounded font-medium">
                                    -{dropOff}%
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
);

// Compact Bar Chart (kept for other widgets)
const CompactBarChart: React.FC<{ data: { label: string; value: number; total?: number }[]; max: number; }> = ({ data, max }) => (
    <div className="space-y-3">
        {data.map((item, index) => (
            <div key={index} className="group">
                <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-text-default font-medium truncate max-w-[60%]">{item.label}</span>
                    <span className="text-text-muted font-bold tabular-nums">{item.value}</span>
                </div>
                <div className="w-full bg-bg-subtle rounded-full h-1.5 overflow-hidden">
                    <div 
                        className="h-full rounded-full transition-all duration-500 ease-out group-hover:opacity-80" 
                        style={{ width: `${(item.value / max) * 100}%`, backgroundColor: 'var(--chart-color)' }}
                    ></div>
                </div>
            </div>
        ))}
    </div>
);

const SimpleList: React.FC<{ items: { main: string; sub?: string }[] }> = ({ items }) => (
    <div className="space-y-0 divide-y divide-border-subtle -my-2">
        {items.map((item, index) => (
            <div key={index} className="flex flex-col justify-center py-2.5 first:pt-1 last:pb-1 hover:bg-bg-subtle/30 px-2 rounded transition-colors cursor-default">
                <span className="font-semibold text-text-default text-sm truncate">{item.main}</span>
                {item.sub && <span className="text-text-muted text-xs truncate mt-0.5">{item.sub}</span>}
            </div>
        ))}
    </div>
);

// --- MOCK DATA ---
const candidatesEnteredLastMonth = Array.from({ length: 30 }, (_, i) => ({ label: `${i + 1}`, value: Math.floor(Math.random() * 15) + 5 })).reverse();
const candidatesEnteredLastMonthMax = Math.max(...candidatesEnteredLastMonth.map(d => d.value), 1);

const recentOpenJobs = [
    { main: 'רכז.ת לוגיסטיקה', sub: 'מיכלי זהב' },
    { main: 'מנהל/ת שיווק', sub: 'בזק' },
    { main: 'מפתח/ת Fullstack', sub: 'Wix' },
    { main: 'נציג/ת מכירות', sub: 'תנובה' },
    { main: 'מנהל מוצר', sub: 'Monday' },
];

const tasksData = [
    { main: 'Follow-up: גדעון ש.', sub: 'היום 14:00' },
    { main: 'שלח קו"ח: בזק', sub: 'מחר 09:00' },
    { main: 'ראיון: מאיה כהן', sub: 'יום ג\'' },
    { main: 'עדכון סטטוס משרה', sub: 'יום ה\'' },
];

const correctionsData = [
    { main: 'חסר טלפון: יוסי לוי', sub: 'איש מכירות' },
    { main: 'שגיאת ניתוח: שרה כץ', sub: 'LinkedIn' },
];

const coordinatorActionsData = [
    { label: 'דנה', value: 45 },
    { label: 'אביב', value: 38 },
    { label: 'יעל', value: 32 },
    { label: 'אני', value: 25 },
];


const allPersonalViews: { id: string, name: string }[] = [
  { id: 'kpi_cards_personal', name: 'מדדי ביצוע מרכזיים' },
  { id: 'referrals', name: 'הפניות' },
  { id: 'candidates_in_process', name: 'מועמדים בתהליך' },
  { id: 'open_jobs', name: 'משרות פתוחות' },
  { id: 'new_candidates', name: 'מועמדים חדשים' },
  { id: 'hired', name: 'התקבלו לעבודה' },
  { id: 'started_work', name: 'התחילו לעבוד' },
  { id: 'top_sources', name: 'מקורות גיוס מובילים' },
  { id: 'tasks', name: 'משימות לטיפול' },
  { id: 'corrections', name: 'תיקונים' },
  { id: 'initial_screening', name: 'סינון ראשוני' },
  { id: 'coordinator_actions', name: 'פעולות רכזים' },
];

const defaultPersonalViewsConfig = allPersonalViews.map(view => ({
    ...view,
    visible: view.id === 'kpi_cards_personal' || view.id === 'referrals' || view.id === 'candidates_in_process' || view.id === 'open_jobs',
}));

// --- MOCK DATA FOR COMPANY DASHBOARD ---
// Updated KPIs with sentiment and trend
const companyKpis: (KpiCardProps & { id: string })[] = [
    { 
        id: 'c5', 
        title: "מחכים לסינון", 
        value: "8,423", 
        icon: <MagnifyingGlassIcon className="w-6 h-6" />,
        sentiment: 'critical',
        trend: 12
    },
    { 
        id: 'c6', 
        title: "תיקונים דחופים", 
        value: "7", 
        icon: <ArrowPathIcon className="w-6 h-6" />,
        sentiment: 'warning',
        trend: -5
    },
    { 
        id: 'c2', 
        title: "התקבלו לעבודה", 
        value: "15", 
        icon: <CheckCircleIcon className="w-6 h-6" />,
        sentiment: 'success',
        trend: 25
    },
    { 
        id: 'c7', 
        title: "תקנים פתוחים", 
        value: "38", 
        icon: <BriefcaseIcon className="w-6 h-6" />,
        sentiment: 'neutral',
        trend: 0
    },
    { 
        id: 'c1', 
        title: "התחילו לעבוד", 
        value: "13", 
        icon: <UserGroupIcon className="w-6 h-6" />, 
        sentiment: 'success',
        trend: 1
    },
    { 
        id: 'c3', 
        title: "הפניות החודש", 
        value: "356", 
        icon: <PaperAirplaneIcon className="w-6 h-6" />, 
        sentiment: 'neutral', 
        trend: 8 
    },
];


const companyCandidatesByStage = {
    max: 215,
    data: [
        { label: 'נשלחו קו"ח', value: 215, total: 264 },
        { label: 'ראיון פרונטלי', value: 65, total: 264 },
        { label: 'מבחן מקצועי', value: 32, total: 264 },
        { label: 'בדיקת ממליצים', value: 12, total: 264 },
        { label: 'הצעת שכר', value: 8, total: 264 },
        { label: 'חתימה', value: 4, total: 264 },
    ]
};

const companyCandidatesEntered = {
    max: 250,
    data: "16 15 14 13 12 11 10 09 08 07 06 05 04 03 02 01 31 30 29 28 27 26 25 24 23 22 21 20 19 18 17".split(" ").map(label => ({
        label, value: Math.floor(Math.random() * 230) + 20
    }))
};
const companyOpenJobs = [
    { main: 'מנהל.ת קשרי לקוחות', sub: 'ליווי שטראוס משאיות' },
    { main: 'אחראי.ת יבוא', sub: 'גטר גרופ' },
    { main: 'פקיד.ה למשרה חלקית', sub: 'ליווי שטראוס משאיות' },
    { main: 'פקיד.ת קבלה ושירות', sub: 'קרני תכלת' },
    { main: 'מהנדס/ת מכונות', sub: 'אלביט' },
];
const companyReferralsByDay = {
    max: 13,
    data: [
        { label: 'עדי', value: 13 },
        { label: 'שרית', value: 12 },
        { label: 'עדן', value: 9 },
        { label: 'דיאנה', value: 8 },
    ]
};
const companyTopSources = {
    max: 3032,
    data: [
        { label: '(לא מזוהה)', value: 3032, total: 4203 },
        { label: 'AllJobs', value: 535, total: 4203 },
        { label: 'JobMaster', value: 425, total: 4203 },
        { label: 'פורטל דרושים', value: 95, total: 4203 },
    ]
};

// --- Definitions for Company Dashboard Widgets ---
const allCompanyViews: { id: string, name: string }[] = [
    { id: 'goal_widget', name: 'יעד גיוסים' }, 
    { id: 'kpi_cards', name: 'מדדי ביצוע מרכזיים' },
    { id: 'candidates_by_stage', name: 'מועמדים בתהליך (משפך)' },
    { id: 'new_candidates_by_month', name: 'מועמדים שנכנסו בחודש האחרון' },
    { id: 'recent_open_jobs', name: 'משרות פתוחות אחרונות' },
    { id: 'top_sources', name: 'מקורות גיוס מובילים' },
    { id: 'tasks_and_corrections', name: 'משימות ותיקונים' },
    { id: 'referrals_by_recruiter_daily', name: 'הפניות היום לפי רכזים' },
    { id: 'coordinator_actions_weekly', name: 'פעולות רכזים השבוע' },
    { id: 'hired_by_source', name: 'התקבלו לעבודה לפי מקור' },
    { id: 'screening_by_recruiter', name: 'סינון ראשוני לפי רכז' },
];

const defaultCompanyViewsConfig = allCompanyViews.map(view => ({
    ...view,
    visible: true, 
}));

// --- Specific Widget Components ---
const personalKpisData: (KpiCardProps & { id: string })[] = [
    { id: 'open_jobs', title: "משרות פתוחות", value: "12", icon: <BriefcaseIcon className="w-6 h-6" />, sentiment: 'neutral' },
    { id: 'in_process', title: "מועמדים בתהליך", value: "87", icon: <UserGroupIcon className="w-6 h-6" />, sentiment: 'neutral' },
    { id: 'referrals', title: "הפניות החודש", value: "42", icon: <PaperAirplaneIcon className="w-6 h-6" />, sentiment: 'success', trend: 15 },
    { id: 'hired', title: "התקבלו", value: "4", icon: <CheckCircleIcon className="w-6 h-6" />, sentiment: 'success' },
    { id: 'corrections', title: "תיקונים דחופים", value: "3", icon: <ArrowPathIcon className="w-6 h-6" />, sentiment: 'critical' },
    { id: 'screening', title: "ממתינים לסינון", value: "18", icon: <MagnifyingGlassIcon className="w-6 h-6" />, sentiment: 'warning', trend: 5 },
];

const ReferralsByRecruiterWidget = ({ className }: { className?: string }) => (
    <DashboardCard title="הפניות היום לפי רכזים" className={className}>
         <CompactBarChart data={companyReferralsByDay.data} max={companyReferralsByDay.max} />
    </DashboardCard>
);

const CandidatesInProcessWidget = ({ className }: { className?: string }) => (
    <DashboardCard title="משפך מועמדים בתהליך" className={className}>
        {/* REPLACED WITH FUNNEL CHART */}
        <FunnelChart data={companyCandidatesByStage.data} max={companyCandidatesByStage.max} />
    </DashboardCard>
);

const RecentOpenJobsWidget = ({ className }: { className?: string }) => (
    <DashboardCard title="משרות פתוחות" linkText="לכל המשרות" onLinkClick={() => {}} className={className}>
        <SimpleList items={companyOpenJobs} />
    </DashboardCard>
);

const NewCandidatesWidget = ({ className }: { className?: string }) => (
    <DashboardCard title="כניסות החודש" linkText="לדוח המלא" onLinkClick={() => {}} className={className}>
        <VerticalBarChart data={candidatesEnteredLastMonth} max={candidatesEnteredLastMonthMax} />
    </DashboardCard>
);

const TopSourcesWidget = ({ className }: { className?: string }) => (
     <DashboardCard title="מקורות גיוס" linkText="לדוח המלא" onLinkClick={() => {}} className={className}>
        <CompactBarChart data={companyTopSources.data} max={companyTopSources.max} />
    </DashboardCard>
);

const TasksAndCorrectionsWidget = ({ className }: { className?: string }) => (
    <div className={`grid grid-cols-1 gap-4 ${className}`}>
        <DashboardCard title="משימות לטיפול" linkText="לכל המשימות" onLinkClick={() => {}}>
            <SimpleList items={tasksData} />
        </DashboardCard>
        <DashboardCard title="תיקונים דחופים" linkText="לכל התיקונים" onLinkClick={() => {}}>
            <SimpleList items={correctionsData} />
        </DashboardCard>
    </div>
);

const InitialScreeningWidget = ({ className }: { className?: string }) => (
     <DashboardCard title="מחכים לסינון" linkText="הצג הכל" onLinkClick={() => {}} className={className}>
        <SimpleList items={[{main: 'יעל ישראלי', sub: '3 ימים'}, {main: 'דוד לוי', sub: 'יומיים'}]} />
    </DashboardCard>
);

const CoordinatorActionsWidget = ({ className }: { className?: string }) => (
    <DashboardCard title="פעולות רכזים" className={className}>
        <CompactBarChart data={coordinatorActionsData} max={Math.max(...coordinatorActionsData.map(d => d.value))} />
    </DashboardCard>
);

const HiredBySourceWidget = ({ className }: { className?: string }) => (
    <DashboardCard title="התקבלו לפי מקור" className={className}>
        <CompactBarChart data={[{label: 'AllJobs', value: 8}, {label: 'חבר מביא חבר', value: 4}, {label: 'LinkedIn', value: 3}]} max={8} />
    </DashboardCard>
);

const ScreeningByRecruiterWidget = ({ className }: { className?: string }) => (
     <DashboardCard title="סינון לפי רכז" className={className}>
        <CompactBarChart data={[{label: 'דנה', value: 120}, {label: 'אביב', value: 95}, {label: 'יעל', value: 80}]} max={120} />
    </DashboardCard>
);

// --- Main Dashboard Component ---
const DashboardView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'personal' | 'company'>('personal');
    
    // State Management
    const [personalViewsConfig, setPersonalViewsConfig] = useState<ViewConfig[]>([]);
    const [personalKpiConfig, setPersonalKpiConfig] = useState<ViewConfig[]>(
        personalKpisData.map(k => ({ id: k.id, name: k.title, visible: true }))
    );
    const [companyViewsConfig, setCompanyViewsConfig] = useState<ViewConfig[]>([]);
    
    // Popovers State
    const [isPersonalCustomizePopoverOpen, setIsPersonalCustomizePopoverOpen] = useState(false);
    const [isKpiCustomizePopoverOpen, setIsKpiCustomizePopoverOpen] = useState(false);
    const [isCompanyCustomizePopoverOpen, setIsCompanyCustomizePopoverOpen] = useState(false);
    
    // Refs
    const personalPopoverRef = useRef<HTMLDivElement>(null);
    const kpiPopoverRef = useRef<HTMLDivElement>(null);
    const companyPopoverRef = useRef<HTMLDivElement>(null);
    const personalCustomizeButtonRef = useRef<HTMLButtonElement>(null);
    const kpiCustomizeButtonRef = useRef<HTMLButtonElement>(null);
    const companyCustomizeButtonRef = useRef<HTMLButtonElement>(null);

    // Load Configs
    useEffect(() => {
        try {
            const savedPersonal = localStorage.getItem('hiro-dashboard-config-v2');
            setPersonalViewsConfig(savedPersonal ? JSON.parse(savedPersonal) : defaultPersonalViewsConfig);
            
            const savedKpi = localStorage.getItem('hiro-personal-kpi-config');
            if (savedKpi) setPersonalKpiConfig(JSON.parse(savedKpi));
            
            const savedCompany = localStorage.getItem('hiro-company-dashboard-config');
            setCompanyViewsConfig(savedCompany ? JSON.parse(savedCompany) : defaultCompanyViewsConfig);
        } catch (e) {
            setPersonalViewsConfig(defaultPersonalViewsConfig);
            setCompanyViewsConfig(defaultCompanyViewsConfig);
        }
    }, []);

    // Save Configs
    useEffect(() => {
        if (personalViewsConfig.length) localStorage.setItem('hiro-dashboard-config-v2', JSON.stringify(personalViewsConfig));
    }, [personalViewsConfig]);
    
    useEffect(() => {
        if (personalKpiConfig.length) localStorage.setItem('hiro-personal-kpi-config', JSON.stringify(personalKpiConfig));
    }, [personalKpiConfig]);
    
    useEffect(() => {
        if (companyViewsConfig.length) localStorage.setItem('hiro-company-dashboard-config', JSON.stringify(companyViewsConfig));
    }, [companyViewsConfig]);


    // Click Outside Handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
             if (personalPopoverRef.current && !personalPopoverRef.current.contains(event.target as Node) && personalCustomizeButtonRef.current && !personalCustomizeButtonRef.current.contains(event.target as Node)) setIsPersonalCustomizePopoverOpen(false);
             if (kpiPopoverRef.current && !kpiPopoverRef.current.contains(event.target as Node) && kpiCustomizeButtonRef.current && !kpiCustomizeButtonRef.current.contains(event.target as Node)) setIsKpiCustomizePopoverOpen(false);
             if (companyPopoverRef.current && !companyPopoverRef.current.contains(event.target as Node) && companyCustomizeButtonRef.current && !companyCustomizeButtonRef.current.contains(event.target as Node)) setIsCompanyCustomizePopoverOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    

    const visiblePersonalKpis = personalKpisData.filter(kpi => personalKpiConfig.find(c => c.id === kpi.id)?.visible ?? true);

    // Dynamic renderer for Personal Dashboard widgets
    const renderPersonalWidget = (id: string) => {
        const spanClass = "col-span-1 h-full"; 
        
        switch(id) {
            case 'kpi_cards_personal':
                 return (
                     <DevAnnotation
                        title="KPI Widget Config"
                        description="User can customize which KPIs are visible."
                        logic={["Loads config from localStorage", "Filters KPIs list based on visibility boolean"]}
                    >
                        <div className="col-span-1 md:col-span-2 xl:col-span-4 relative group/kpi-container mb-2">
                            <div className="absolute top-0 left-2 z-10 opacity-0 group-hover/kpi-container:opacity-100 transition-opacity">
                                <button ref={kpiCustomizeButtonRef} onClick={() => setIsKpiCustomizePopoverOpen(p => !p)} className="p-1.5 bg-bg-card border border-border-default rounded-full shadow-sm hover:text-primary-600 hover:bg-bg-hover"><Cog6ToothIcon className="w-4 h-4" /></button>
                                {isKpiCustomizePopoverOpen && <div ref={kpiPopoverRef} className="absolute top-full left-0 mt-1 z-20"><CustomizeViewsPopover isOpen={isKpiCustomizePopoverOpen} onClose={() => setIsKpiCustomizePopoverOpen(false)} views={personalKpiConfig} onSave={(c) => {setPersonalKpiConfig(c); setIsKpiCustomizePopoverOpen(false)}} onReset={() => {setPersonalKpiConfig(personalKpisData.map(k => ({ id: k.id, name: k.title, visible: true }))); setIsKpiCustomizePopoverOpen(false)}} /></div>}
                            </div>
                            <KpiCardsGrid kpis={visiblePersonalKpis} />
                        </div>
                    </DevAnnotation>
                 );
            case 'tasks':
                return <div className={spanClass}><DashboardCard title="משימות לטיפול"><SimpleList items={tasksData} /></DashboardCard></div>;
            case 'corrections':
                return <div className={spanClass}><DashboardCard title="תיקונים"><SimpleList items={correctionsData} /></DashboardCard></div>;
            case 'open_jobs':
                return <div className={spanClass}><DashboardCard title="משרות פתוחות"><SimpleList items={recentOpenJobs} /></DashboardCard></div>;
            case 'initial_screening':
                return <div className={spanClass}><InitialScreeningWidget /></div>;
            case 'referrals':
                return <div className={spanClass}><DashboardCard title="הפניות החודש"><div className="text-center py-6"><p className="text-5xl font-light text-primary-600">42</p></div></DashboardCard></div>;
            case 'hired':
                return <div className={spanClass}><DashboardCard title="התקבלו לעבודה"><div className="text-center py-6"><p className="text-5xl font-light text-green-600">4</p></div></DashboardCard></div>;
            case 'started_work':
                 return <div className={spanClass}><DashboardCard title="התחילו לעבוד"><div className="text-center py-6"><p className="text-5xl font-light text-purple-600">2</p></div></DashboardCard></div>;
            case 'candidates_in_process':
                 return <div className="col-span-1 md:col-span-2"><CandidatesInProcessWidget /></div>;
            case 'new_candidates':
                 return <div className={spanClass}><NewCandidatesWidget /></div>;
            case 'top_sources':
                 return <div className={spanClass}><TopSourcesWidget /></div>;
            case 'coordinator_actions':
                 return <div className="col-span-1 md:col-span-2"><CoordinatorActionsWidget /></div>;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Row */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                {/* Tabs */}
                <div className="flex items-center gap-2 bg-bg-subtle p-1 rounded-full">
                    <button onClick={() => setActiveTab('personal')} className={`py-1.5 px-6 text-sm font-semibold rounded-full transition ${activeTab === 'personal' ? 'bg-bg-card shadow text-primary-700' : 'text-text-muted'}`}>דף הבית האישי</button>
                    <button onClick={() => setActiveTab('company')} className={`py-1.5 px-6 text-sm font-semibold rounded-full transition ${activeTab === 'company' ? 'bg-bg-card shadow text-primary-700' : 'text-text-muted'}`}>דף הבית - חברה</button>
                </div>

                {/* Action Buttons (Customize) - Moved here */}
                <div className="relative">
                     {activeTab === 'personal' ? (
                        <>
                            <button
                                ref={personalCustomizeButtonRef}
                                onClick={() => setIsPersonalCustomizePopoverOpen(p => !p)}
                                className="flex items-center gap-2 text-text-muted font-semibold p-2 rounded-lg hover:bg-bg-hover"
                                title="התאם תצוגות"
                            >
                                <AdjustmentsHorizontalIcon className="w-6 h-6"/>
                            </button>
                            {isPersonalCustomizePopoverOpen && (
                                <div ref={personalPopoverRef} className="absolute top-full left-0 z-20"><CustomizeViewsPopover isOpen={isPersonalCustomizePopoverOpen} onClose={() => setIsPersonalCustomizePopoverOpen(false)} views={personalViewsConfig} onSave={(c) => {setPersonalViewsConfig(c); setIsPersonalCustomizePopoverOpen(false)}} onReset={() => {setPersonalViewsConfig(defaultPersonalViewsConfig); setIsPersonalCustomizePopoverOpen(false)}} /></div>
                            )}
                        </>
                     ) : (
                        <>
                            <button
                                ref={companyCustomizeButtonRef}
                                onClick={() => setIsCompanyCustomizePopoverOpen(p => !p)}
                                className="flex items-center gap-2 text-text-muted font-semibold p-2 rounded-lg hover:bg-bg-hover"
                                title="התאם תצוגות"
                            >
                                <AdjustmentsHorizontalIcon className="w-6 h-6"/>
                            </button>
                            {isCompanyCustomizePopoverOpen && (
                                <div ref={companyPopoverRef} className="absolute top-full left-0 z-20"><CustomizeViewsPopover isOpen={isCompanyCustomizePopoverOpen} onClose={() => setIsCompanyCustomizePopoverOpen(false)} views={companyViewsConfig} onSave={(c) => {setCompanyViewsConfig(c); setIsCompanyCustomizePopoverOpen(false)}} onReset={() => {setCompanyViewsConfig(defaultCompanyViewsConfig); setIsCompanyCustomizePopoverOpen(false)}} /></div>
                            )}
                        </>
                     )}
                </div>
            </div>

            {/* === COMPANY DASHBOARD === */}
            {activeTab === 'company' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-min">
                        {/* 1. Goal Widget - Span 2 cols on desktop */}
                        {companyViewsConfig.find(v => v.id === 'goal_widget')?.visible && (
                             <div className="col-span-1 md:col-span-2 xl:col-span-2 h-full">
                                <RecruitmentGoalWidget current={15} target={20} />
                             </div>
                        )}
                        
                        {/* 2. KPI Cards - Span 4 cols (full row) on large screens */}
                        {companyViewsConfig.find(v => v.id === 'kpi_cards')?.visible && (
                             <div className="col-span-1 md:col-span-2 xl:col-span-4">
                                <KpiCardsGrid kpis={companyKpis} />
                             </div>
                        )}

                        {/* 3. Candidates By Stage - Span 2 cols on desktop */}
                         {companyViewsConfig.find(v => v.id === 'candidates_by_stage')?.visible && (
                             <CandidatesInProcessWidget className="col-span-1 md:col-span-2 xl:col-span-2" />
                        )}
                        
                        {/* 4. Recent Open Jobs - Span 1 col */}
                         {companyViewsConfig.find(v => v.id === 'recent_open_jobs')?.visible && (
                             <RecentOpenJobsWidget className="col-span-1 xl:col-span-1" />
                        )}
                        
                        {/* 5. Top Sources - Span 1 col */}
                         {companyViewsConfig.find(v => v.id === 'top_sources')?.visible && (
                             <TopSourcesWidget className="col-span-1 xl:col-span-1" />
                        )}

                        {/* 6. New Candidates - Span 2 cols */}
                        {companyViewsConfig.find(v => v.id === 'new_candidates_by_month')?.visible && (
                             <NewCandidatesWidget className="col-span-1 md:col-span-2 xl:col-span-2" />
                        )}
                        
                        {/* 7. Referrals By Recruiter - Span 2 cols */}
                        {companyViewsConfig.find(v => v.id === 'referrals_by_recruiter_daily')?.visible && (
                             <ReferralsByRecruiterWidget className="col-span-1 md:col-span-2 xl:col-span-2" />
                        )}
                        
                         {/* 8. Tasks - Span 2 cols */}
                        {companyViewsConfig.find(v => v.id === 'tasks_and_corrections')?.visible && (
                             <div className="col-span-1 md:col-span-2 xl:col-span-2">
                                <TasksAndCorrectionsWidget className="grid-cols-1 md:grid-cols-2" />
                             </div>
                        )}

                         {/* 9. Actions - Span 2 cols */}
                        {companyViewsConfig.find(v => v.id === 'coordinator_actions_weekly')?.visible && (
                             <CoordinatorActionsWidget className="col-span-1 md:col-span-2 xl:col-span-2" />
                        )}
                         
                         {/* 10. Hired - Span 1 col */}
                        {companyViewsConfig.find(v => v.id === 'hired_by_source')?.visible && (
                             <HiredBySourceWidget className="col-span-1 xl:col-span-1" />
                        )}
                         
                         {/* 11. Screening - Span 1 col */}
                        {companyViewsConfig.find(v => v.id === 'screening_by_recruiter')?.visible && (
                             <ScreeningByRecruiterWidget className="col-span-1 xl:col-span-1" />
                        )}
                    </div>
                </div>
            )}
            
            {/* === PERSONAL DASHBOARD === */}
            {activeTab === 'personal' && (
                <div className="space-y-4">
                    {/* Grid Container for Personal Dashboard - Iterating through Config */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-min">
                        {personalViewsConfig.filter(v => v.visible).map(view => (
                            <React.Fragment key={view.id}>
                                {renderPersonalWidget(view.id)}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardView;
