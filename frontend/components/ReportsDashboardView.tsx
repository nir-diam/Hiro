import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ChartBarIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  ArrowPathIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  BriefcaseIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  EyeIcon,
  PaperAirplaneIcon,
  BuildingOffice2Icon,
} from './Icons';
import { KPICard, SimpleBarChart, Sparkline, HeatmapCell, DeltaChart } from './ReportsComponents';
import CustomizeViewsPopover, { ViewConfig } from './CustomizeViewsPopover';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from './SearchableSelect';
import {
  fetchBiDashboard,
  type BiDashboardResponse,
  type BiHeatmapRow,
} from '../services/biDashboardApi';

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

const formatKpiValue = (id: string, value: number): string => {
  if (id === 'time_to_hire') return String(value);
  if (id === 'communications' && value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return value.toLocaleString();
};

type DashboardProps = {
  data: BiDashboardResponse | null;
  loading: boolean;
  selectedMetric: string;
  setSelectedMetric: (id: string) => void;
  granularity: 'month' | 'quarter';
  setGranularity: (g: 'month' | 'quarter') => void;
};

const TrendsTab: React.FC<DashboardProps> = ({
  data,
  loading,
  selectedMetric,
  setSelectedMetric,
  granularity,
  setGranularity,
}) => {
  const { t } = useLanguage();
  const [metricsConfig, setMetricsConfig] = useState<ViewConfig[]>(availableMetrics);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const customizeBtnRef = useRef<HTMLButtonElement>(null);
  const customizePopoverRef = useRef<HTMLDivElement>(null);

  const handleSaveConfig = (newConfig: ViewConfig[]) => {
    setMetricsConfig(newConfig);
    setIsCustomizeOpen(false);
    if (!newConfig.find((c) => c.id === selectedMetric)?.visible) {
      const firstVisible = newConfig.find((c) => c.visible);
      if (firstVisible) setSelectedMetric(firstVisible.id);
    }
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

  const kpiById = useMemo(() => {
    const map = new Map((data?.kpis || []).map((k) => [k.id, k]));
    return map;
  }, [data]);

  const kpiRenderMeta: Record<string, { title: string; icon: React.ReactNode; colorClass: string }> = {
    hires: {
      title: t('metric.hires'),
      icon: <CheckCircleIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-green-500',
    },
    cv_ingestions: {
      title: t('metric.cv_ingestions'),
      icon: <DocumentTextIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-indigo-500',
    },
    referrals: {
      title: t('metric.referrals'),
      icon: <PaperAirplaneIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-blue-500',
    },
    screenings: {
      title: t('metric.screenings'),
      icon: <FunnelIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-teal-500',
    },
    open_jobs: {
      title: t('metric.open_jobs'),
      icon: <BriefcaseIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-orange-500',
    },
    time_to_hire: {
      title: t('metric.time_to_hire'),
      icon: <ClockIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-gray-500',
    },
    portal_submissions: {
      title: t('metric.portal_submissions'),
      icon: <EyeIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-pink-500',
    },
    communications: {
      title: t('metric.communications'),
      icon: <EnvelopeIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-cyan-500',
    },
    passed_screening: {
      title: t('metric.passed_screening'),
      icon: <CheckCircleIcon className="w-6 h-6 text-white" />,
      colorClass: 'bg-emerald-500',
    },
  };

  const chartData = (data?.series?.points || []).map((p) => ({
    label: p.label,
    value: p.value,
  }));
  const activeColorTheme = kpiRenderMeta[selectedMetric]?.colorClass || 'bg-primary-400';
  const activeTitle = kpiRenderMeta[selectedMetric]?.title || t('reports.tab_trends');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-end">
        <div className="relative">
          <button
            ref={customizeBtnRef}
            type="button"
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
                onReset={() => {
                  setMetricsConfig(availableMetrics);
                  setIsCustomizeOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsConfig
          .filter((c) => c.visible)
          .map((config) => {
            const meta = kpiRenderMeta[config.id];
            const kpi = kpiById.get(config.id);
            if (!meta) return null;
            return (
              <KPICard
                key={config.id}
                id={config.id}
                title={meta.title}
                value={loading ? '…' : formatKpiValue(config.id, kpi?.current ?? 0)}
                trend={kpi?.changePct ?? 0}
                trendLabel={t('reports.col_previous')}
                icon={meta.icon}
                colorClass={meta.colorClass}
                isActive={selectedMetric === config.id}
                onClick={() => setSelectedMetric(config.id)}
              />
            );
          })}
      </div>

      <div className="bg-bg-card rounded-xl border border-border-default p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-text-default">
            {t('reports.tab_trends')}: {activeTitle}
          </h3>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as 'month' | 'quarter')}
            className="bg-bg-input border border-border-default rounded-md text-sm p-1 cursor-pointer"
          >
            <option value="month">{t('reports.chart_monthly')}</option>
            <option value="quarter">{t('reports.chart_quarterly')}</option>
          </select>
        </div>
        {loading ? (
          <p className="text-sm text-text-muted py-16 text-center">טוען…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-text-muted py-16 text-center">{t('reports.no_data')}</p>
        ) : (
          <SimpleBarChart data={chartData} height={280} colorTheme={activeColorTheme} />
        )}
      </div>
    </div>
  );
};

const ComparisonTab: React.FC<{ data: BiDashboardResponse | null; loading: boolean }> = ({
  data,
  loading,
}) => {
  const { t } = useLanguage();
  const [metricsConfig, setMetricsConfig] = useState<ViewConfig[]>(availableMetrics);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const customizeBtnRef = useRef<HTMLButtonElement>(null);
  const customizePopoverRef = useRef<HTMLDivElement>(null);

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

  const filteredData = (data?.comparison || []).filter((row) =>
    metricsConfig.find((c) => c.id === row.id)?.visible,
  );

  const deltaData = (data?.recruiterGaps || []).map((g) => ({
    label: g.name,
    value: g.delta,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div className="bg-blue-50 border-r-4 border-blue-500 p-4 rounded-lg text-blue-900 text-sm flex items-start gap-3 flex-1 mr-6">
          <ArrowPathIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <div>{t('reports.insight_banner')}</div>
        </div>
        <div className="relative">
          <button
            ref={customizeBtnRef}
            type="button"
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
                onSave={(cfg) => {
                  setMetricsConfig(cfg);
                  setIsCustomizeOpen(false);
                }}
                onReset={() => {
                  setMetricsConfig(availableMetrics);
                  setIsCustomizeOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-text-muted">
                      טוען…
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => (
                    <tr key={row.id} className="hover:bg-bg-hover/50">
                      <td className="p-4 font-medium text-text-default">{t(row.metric)}</td>
                      <td className="p-4 font-bold">{row.current.toLocaleString()}</td>
                      <td className="p-4 text-text-muted">{row.previous.toLocaleString()}</td>
                      <td
                        className={`p-4 font-bold ${row.changePct > 0 ? 'text-green-600' : row.changePct < 0 ? 'text-red-600' : 'text-text-muted'}`}
                      >
                        {row.changePct > 0 ? '+' : ''}
                        {row.changePct}%
                      </td>
                      <td className="p-4 w-32">
                        <Sparkline
                          data={row.sparkline}
                          color={row.changePct >= 0 ? '#16a34a' : '#dc2626'}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && filteredData.length === 0 && (
            <div className="p-8 text-center text-text-muted">{t('reports.no_data')}</div>
          )}
        </div>

        <div className="bg-bg-card rounded-xl border border-border-default p-6">
          <h3 className="font-bold text-text-default mb-4 text-center">{t('reports.delta_title')}</h3>
          <p className="text-xs text-text-muted text-center mb-6">{t('reports.delta_subtitle')}</p>
          {deltaData.length === 0 ? (
            <p className="text-sm text-text-muted text-center">{t('reports.no_data')}</p>
          ) : (
            <DeltaChart data={deltaData} />
          )}
        </div>
      </div>
    </div>
  );
};

const RecruitersTab: React.FC<{ data: BiDashboardResponse | null; loading: boolean }> = ({
  data,
  loading,
}) => {
  const { t } = useLanguage();
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(
    null,
  );
  const [viewConfig, setViewConfig] = useState<ViewConfig[]>(recruiterViewOptions);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const customizeBtnRef = useRef<HTMLButtonElement>(null);
  const customizePopoverRef = useRef<HTMLDivElement>(null);

  const heatmap: BiHeatmapRow[] = data?.heatmap || [];

  const totals = useMemo(
    () => ({
      cvs: data?.funnel?.cv_ingestions ?? 0,
      screened: data?.funnel?.screenings_done ?? 0,
      interviews: data?.funnel?.passed_screening ?? 0,
      hired: data?.funnel?.moved_to_hired ?? 0,
    }),
    [data],
  );

  const sortedRecruiters = useMemo(() => {
    const sortable = [...heatmap];
    if (sortConfig) {
      sortable.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc'
            ? aVal.localeCompare(bVal, 'he')
            : bVal.localeCompare(aVal, 'he');
        }
        const an = Number(aVal) || 0;
        const bn = Number(bVal) || 0;
        if (an < bn) return sortConfig.direction === 'asc' ? -1 : 1;
        if (an > bn) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [heatmap, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return (
      <span className="text-text-subtle text-xs ml-1">
        {sortConfig.direction === 'asc' ? '▲' : '▼'}
      </span>
    );
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

  const getColumnMax = (key: string) =>
    Math.max(...heatmap.map((r) => Number(r[key]) || 0), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-text-default">{t('reports.recruiters_performance')}</h3>
        <div className="relative">
          <button
            ref={customizeBtnRef}
            type="button"
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
                onSave={(cfg) => {
                  setViewConfig(cfg);
                  setIsCustomizeOpen(false);
                }}
                onReset={() => {
                  setViewConfig(recruiterViewOptions);
                  setIsCustomizeOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-bg-card border border-border-default rounded-xl p-6 mb-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative">
          <div className="hidden md:block absolute top-1/2 left-10 right-10 h-0.5 bg-border-default -z-10 transform -translate-y-1/2" />
          {[
            {
              label: t('metric.cv_ingestions'),
              value: totals.cvs,
              icon: <DocumentTextIcon className="w-5 h-5" />,
              color: 'bg-indigo-100 text-indigo-600',
            },
            {
              label: t('metric.screenings_done'),
              value: totals.screened,
              icon: <FunnelIcon className="w-5 h-5" />,
              color: 'bg-blue-100 text-blue-600',
            },
            {
              label: t('metric.passed_screening'),
              value: totals.interviews,
              icon: <UserGroupIcon className="w-5 h-5" />,
              color: 'bg-purple-100 text-purple-600',
            },
            {
              label: t('metric.hires'),
              value: totals.hired,
              icon: <CheckCircleIcon className="w-5 h-5" />,
              color: 'bg-green-100 text-green-600',
            },
          ].map((step, idx) => (
            <div
              key={idx}
              className="flex-1 w-full md:w-auto flex flex-col items-center bg-bg-card p-2 z-10 relative"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${step.color}`}>
                {step.icon}
              </div>
              <span className="text-2xl font-bold text-text-default">
                {loading ? '…' : step.value.toLocaleString()}
              </span>
              <span className="text-sm text-text-muted font-medium">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-bg-card rounded-xl border border-border-default overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center min-w-[900px]">
            <thead className="bg-bg-subtle text-text-muted font-semibold border-b border-border-default">
              <tr>
                <th
                  className="p-4 text-right min-w-[140px] cursor-pointer hover:bg-bg-hover transition-colors sticky right-0 bg-bg-subtle z-10 border-l border-border-default/50"
                  onClick={() => requestSort('name')}
                >
                  <div className="flex items-center">
                    {t('reports.col_recruiter')} {getSortIndicator('name')}
                  </div>
                </th>
                {viewConfig
                  .filter((col) => col.visible)
                  .map((col) => (
                    <th
                      key={col.id}
                      className="p-4 cursor-pointer hover:bg-bg-hover transition-colors whitespace-nowrap"
                      onClick={() => requestSort(col.id)}
                    >
                      {t(`metric.${col.id}`) || col.name} {getSortIndicator(col.id)}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td
                    colSpan={1 + viewConfig.filter((c) => c.visible).length}
                    className="p-8 text-text-muted"
                  >
                    טוען…
                  </td>
                </tr>
              ) : sortedRecruiters.length === 0 ? (
                <tr>
                  <td
                    colSpan={1 + viewConfig.filter((c) => c.visible).length}
                    className="p-8 text-text-muted"
                  >
                    {t('reports.no_data')}
                  </td>
                </tr>
              ) : (
                sortedRecruiters.map((r) => (
                  <tr
                    key={r.recruiterId}
                    className="hover:bg-bg-hover/50 transition-colors group cursor-pointer"
                  >
                    <td className="p-4 text-right font-bold text-text-default flex items-center gap-3 sticky right-0 bg-bg-card group-hover:bg-bg-hover/50 z-10 border-l border-border-default/50">
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold border border-gray-200">
                        {String(r.name || '?')[0]}
                      </div>
                      <span className="group-hover:text-primary-600 transition-colors whitespace-nowrap">
                        {r.name}
                      </span>
                    </td>
                    {viewConfig
                      .filter((col) => col.visible)
                      .map((col) => (
                        <td key={col.id} className="p-2">
                          <HeatmapCell
                            value={Number(r[col.id]) || 0}
                            max={getColumnMax(col.id)}
                          />
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ReportsDashboardView: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState<'trends' | 'comparison' | 'recruiters'>('trends');
  const [dateRange, setDateRange] = useState('last_30_days');
  const [selectedRecruiter, setSelectedRecruiter] = useState('all');
  const [adminClientId, setAdminClientId] = useState<string | null>(null);
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedMetric, setSelectedMetric] = useState('hires');
  const [granularity, setGranularity] = useState<'month' | 'quarter'>('month');

  const [data, setData] = useState<BiDashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

  useEffect(() => {
    if (!apiBase || !isPlatformAdmin) {
      setClientOptions([]);
      return;
    }
    let cancelled = false;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    fetch(`${apiBase}/api/clients?activeOnly=true`, {
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setClientOptions(
          list
            .map((c: Record<string, unknown>) => ({
              id: String(c.id ?? ''),
              label: String((c.displayName as string) || (c.name as string) || '').trim(),
            }))
            .filter((o) => o.id && o.label)
            .sort((a, b) => a.label.localeCompare(b.label, 'he')),
        );
      })
      .catch(() => {
        if (!cancelled) setClientOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, isPlatformAdmin]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchBiDashboard({
        range: dateRange === 'custom' ? 'last_30_days' : dateRange,
        clientId: isPlatformAdmin ? adminClientId : null,
        recruiterId: selectedRecruiter !== 'all' ? selectedRecruiter : null,
        granularity,
        metric: selectedMetric,
      });
      setData(payload);
    } catch (e) {
      setData(null);
      setError((e as Error).message || 'שגיאה בטעינת הדוח');
    } finally {
      setLoading(false);
    }
  }, [dateRange, adminClientId, isPlatformAdmin, selectedRecruiter, granularity, selectedMetric]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      ['metric', 'current', 'previous', 'changePct'].join(','),
      ...data.comparison.map((r) => [r.id, r.current, r.previous, r.changePct].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bi-dashboard-${data.startDate}_${data.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recruiters = data?.recruiters || [];

  return (
    <div className="flex flex-col h-full p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.4s ease-out; }`}</style>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text-default">{t('reports.title')}</h1>
          <p className="text-text-muted text-sm">{t('reports.subtitle')}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto flex-wrap">
          {isPlatformAdmin ? (
            <div className="min-w-[200px] w-full sm:w-56">
              <SearchableSelect
                options={[{ id: '', label: 'כל הלקוחות' }, ...clientOptions]}
                value={adminClientId ?? ''}
                onChange={(val) => {
                  setAdminClientId(val != null && String(val).trim() ? String(val) : null);
                  setSelectedRecruiter('all');
                }}
                placeholder="כל הלקוחות"
                className="w-full"
                icon={<BuildingOffice2Icon className="w-4 h-4 text-text-subtle" />}
              />
            </div>
          ) : null}

          <div className="bg-bg-card p-1.5 rounded-xl border border-border-default shadow-sm flex items-center gap-2 w-full sm:w-auto">
            <UserGroupIcon className="w-4 h-4 text-text-subtle ml-1 mr-1 flex-shrink-0" />
            <select
              value={selectedRecruiter}
              onChange={(e) => setSelectedRecruiter(e.target.value)}
              className="bg-transparent text-sm font-semibold outline-none text-text-default cursor-pointer min-w-[100px] w-full sm:w-auto"
            >
              <option value="all">{t('reports.filter_recruiter')}</option>
              {recruiters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

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
              </select>
            </div>
            <div className="w-px h-5 bg-border-default hidden sm:block" />
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="text-sm font-semibold text-text-muted hover:bg-bg-subtle px-2 py-1.5 rounded-lg"
              title="רענן"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data}
              className="text-sm font-semibold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 justify-center disabled:opacity-40"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span className="hidden sm:inline">{t('reports.export')}</span>
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 flex justify-between gap-3">
          <span>{error}</span>
          <button type="button" className="underline text-xs" onClick={() => void loadDashboard()}>
            נסה שוב
          </button>
        </div>
      )}

      <div className="border-b border-border-default overflow-x-auto">
        <nav className="flex gap-6 min-w-max">
          {[
            { id: 'trends' as const, label: t('reports.tab_trends'), icon: <ChartBarIcon className="w-5 h-5" /> },
            {
              id: 'comparison' as const,
              label: t('reports.tab_comparison'),
              icon: <ArrowPathIcon className="w-5 h-5" />,
            },
            {
              id: 'recruiters' as const,
              label: t('reports.tab_recruiters'),
              icon: <UserGroupIcon className="w-5 h-5" />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
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

      <main className="flex-1 overflow-y-auto pb-10">
        {activeTab === 'trends' && (
          <TrendsTab
            data={data}
            loading={loading}
            selectedMetric={selectedMetric}
            setSelectedMetric={setSelectedMetric}
            granularity={granularity}
            setGranularity={setGranularity}
          />
        )}
        {activeTab === 'comparison' && <ComparisonTab data={data} loading={loading} />}
        {activeTab === 'recruiters' && <RecruitersTab data={data} loading={loading} />}
      </main>
    </div>
  );
};

export default ReportsDashboardView;
