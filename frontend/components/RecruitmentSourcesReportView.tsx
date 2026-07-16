import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Cog6ToothIcon,
  DocumentArrowDownIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  ChartBarIcon,
  ArrowPathIcon,
  TableCellsIcon,
  BuildingOffice2Icon,
} from './Icons';
import {
  fetchRecruitmentSourcesReport,
  type SourceReportRow,
} from '../services/recruitmentSourcesReportApi';
import { fetchRecruitmentSourceOptions } from '../services/recruitmentSourcesApi';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from './SearchableSelect';

type SourceReport = SourceReportRow;

const allColumns: { key: keyof SourceReport; label: string; isNumeric: boolean }[] = [
  { key: 'sourceName', label: 'מקור גיוס', isNumeric: false },
  { key: 'candidates', label: 'סה"כ מועמדים', isNumeric: true },
  { key: 'referrals', label: 'הפניות ללקוח', isNumeric: true },
  { key: 'placements', label: 'קליטות (השמות)', isNumeric: true },
  { key: 'accepted', label: 'התקבלו', isNumeric: true },
  { key: 'current', label: 'פעילים כרגע', isNumeric: true },
  { key: 'initial', label: 'בסינון ראשוני', isNumeric: true },
];

const defaultVisibleColumns = allColumns.map((c) => c.key as string);

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({
  title,
  value,
  icon,
  color,
}) => (
  <div className="bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-sm font-semibold text-text-muted mb-1">{title}</p>
      <p className="text-2xl font-extrabold text-text-default">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
    <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
  </div>
);

const VisualBar: React.FC<{ value: number; max: number; colorClass?: string }> = ({
  value,
  max,
  colorClass = 'bg-primary-200',
}) => {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-sm font-semibold w-10 text-left tabular-nums">{value.toLocaleString()}</span>
      <div className="flex-1 h-2 bg-bg-subtle rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
};

const TopSourcesChart: React.FC<{ data: { sourceName: string; candidates: number }[] }> = ({ data }) => {
  const top5 = data.slice(0, 5);
  const maxVal = Math.max(0, ...top5.map((d) => d.candidates));

  return (
    <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm h-full">
      <h3 className="text-lg font-bold text-text-default mb-6">מקורות מובילים (נפח מועמדים)</h3>
      {top5.length === 0 ? (
        <p className="text-sm text-text-muted">אין נתונים לטווח הנבחר</p>
      ) : (
        <div className="space-y-4">
          {top5.map((item) => (
            <div key={item.sourceName} className="group">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-text-default">{item.sourceName}</span>
                <span className="text-text-muted">{item.candidates.toLocaleString()}</span>
              </div>
              <div className="w-full bg-bg-subtle rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary-500 h-full rounded-full transition-all duration-1000 ease-out group-hover:bg-primary-600"
                  style={{ width: `${maxVal > 0 ? (item.candidates / maxVal) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RecruitmentSourcesReportView: React.FC = () => {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const today = new Date();
  const defaultEndDate = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
  const defaultStartDate = thirtyDaysAgo.toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    source: 'הכל',
  });

  const [adminClientId, setAdminClientId] = useState<string | null>(null);
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [clientsListLoading, setClientsListLoading] = useState(false);

  const [activePreset, setActivePreset] = useState<'month' | 'week' | 'today' | 'quarter' | 'custom'>('month');
  const [sortConfig, setSortConfig] = useState<{ key: keyof SourceReport; direction: 'asc' | 'desc' } | null>({
    key: 'candidates',
    direction: 'desc',
  });
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const dragItemIndex = useRef<number | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

  const [rows, setRows] = useState<SourceReport[]>([]);
  const [topSources, setTopSources] = useState<{ sourceName: string; candidates: number }[]>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [totals, setTotals] = useState({
    candidates: 0,
    referrals: 0,
    placements: 0,
    accepted: 0,
    current: 0,
    initial: 0,
    conversionRate: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!apiBase || !isPlatformAdmin) {
      setClientOptions([]);
      return;
    }
    let cancelled = false;
    setClientsListLoading(true);
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
        const opts = list
          .map((c: Record<string, unknown>) => ({
            id: String(c.id ?? ''),
            label: String((c.displayName as string) || (c.name as string) || '').trim(),
          }))
          .filter((o) => o.id && o.label)
          .sort((a, b) => a.label.localeCompare(b.label, 'he'));
        setClientOptions(opts);
      })
      .catch(() => {
        if (!cancelled) setClientOptions([]);
      })
      .finally(() => {
        if (!cancelled) setClientsListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, isPlatformAdmin]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const scopedClientId = isPlatformAdmin ? adminClientId : null;
      const [data, catalog] = await Promise.all([
        fetchRecruitmentSourcesReport({
          startDate: filters.startDate,
          endDate: filters.endDate,
          source: filters.source,
          clientId: scopedClientId,
        }),
        // Catalog options: tenant users get their client from /options; admins viewing one client rely on report.sourceOptions.
        !isPlatformAdmin || !adminClientId
          ? fetchRecruitmentSourceOptions().catch(() => [])
          : Promise.resolve([]),
      ]);
      setRows(Array.isArray(data.items) ? data.items : []);
      setTopSources(Array.isArray(data.topSources) ? data.topSources : []);
      setTotals(
        data.totals || {
          candidates: 0,
          referrals: 0,
          placements: 0,
          accepted: 0,
          current: 0,
          initial: 0,
          conversionRate: 0,
        },
      );
      const fromApi = Array.isArray(data.sourceOptions) ? data.sourceOptions : [];
      const fromCatalog = catalog.map((s) => String(s.name || '').trim()).filter(Boolean);
      setSourceOptions([...new Set([...fromCatalog, ...fromApi])].sort((a, b) => a.localeCompare(b, 'he')));
    } catch (e) {
      setRows([]);
      setTopSources([]);
      setTotals({
        candidates: 0,
        referrals: 0,
        placements: 0,
        accepted: 0,
        current: 0,
        initial: 0,
        conversionRate: 0,
      });
      setError((e as Error).message || 'שגיאה בטעינת הדוח');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.source, isPlatformAdmin, adminClientId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (e.target.name === 'startDate' || e.target.name === 'endDate') {
      setActivePreset('custom');
    }
  };

  const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
    const end = new Date();
    const start = new Date();
    if (preset === 'week') start.setDate(end.getDate() - 7);
    if (preset === 'month') start.setDate(end.getDate() - 30);
    if (preset === 'quarter') start.setDate(end.getDate() - 90);
    setFilters((prev) => ({
      ...prev,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    }));
    setActivePreset(preset);
  };

  const sortedData = useMemo(() => {
    const sortableItems = [...rows];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal, 'he') : bVal.localeCompare(aVal, 'he');
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [sortConfig, rows]);

  const requestSort = (key: keyof SourceReport) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: keyof SourceReport) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  const handleColumnToggle = (columnKey: string) => {
    setVisibleColumns((prev) => {
      const isVisible = prev.includes(columnKey);
      if (isVisible) {
        return prev.length > 1 ? prev.filter((key) => key !== columnKey) : prev;
      }
      return allColumns.some((c) => c.key === columnKey) ? [...prev, columnKey] : prev;
    });
  };

  const handleDragStart = (index: number, colKey: string) => {
    dragItemIndex.current = index;
    setDraggingColumn(colKey);
  };
  const handleDragEnter = (index: number) => {
    if (dragItemIndex.current === null || dragItemIndex.current === index) return;
    const newVisibleColumns = [...visibleColumns];
    const draggedItem = newVisibleColumns.splice(dragItemIndex.current, 1)[0];
    newVisibleColumns.splice(index, 0, draggedItem);
    dragItemIndex.current = index;
    setVisibleColumns(newVisibleColumns);
  };
  const handleDragEnd = () => {
    dragItemIndex.current = null;
    setDraggingColumn(null);
  };

  const maxCandidates = Math.max(0, ...sortedData.map((d) => d.candidates));
  const maxPlacements = Math.max(0, ...sortedData.map((d) => d.placements));

  const exportCsv = () => {
    const cols = visibleColumns
      .map((k) => allColumns.find((c) => c.key === k))
      .filter(Boolean) as typeof allColumns;
    const header = cols.map((c) => c.label).join(',');
    const lines = sortedData.map((row) =>
      cols
        .map((c) => {
          const v = row[c.key];
          const s = String(v ?? '');
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    );
    const blob = new Blob(['\uFEFF' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recruitment-sources-${filters.startDate}_${filters.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartData =
    topSources.length > 0
      ? topSources
      : [...sortedData]
          .sort((a, b) => b.candidates - a.candidates)
          .slice(0, 5)
          .map((r) => ({ sourceName: r.sourceName, candidates: r.candidates }));

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-2">
      <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-extrabold text-text-default">דוח מקורות גיוס</h1>
          <p className="text-text-muted text-sm mt-1">ניתוח ביצועים לפי מקור הגעה לפרק זמן נבחר</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-bg-card p-2 rounded-xl border border-border-default shadow-sm w-full md:w-auto">
          {isPlatformAdmin ? (
            <div className="relative min-w-[200px] w-full sm:w-56">
              <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1 z-10">
                לקוח
              </span>
              <SearchableSelect
                options={[{ id: '', label: 'כל הלקוחות' }, ...clientOptions]}
                value={adminClientId ?? ''}
                onChange={(val) => {
                  const next = val != null && String(val).trim() ? String(val) : null;
                  setAdminClientId(next);
                  setFilters((prev) => ({ ...prev, source: 'הכל' }));
                }}
                placeholder={clientsListLoading ? 'טוען לקוחות…' : 'כל הלקוחות'}
                className="w-full"
                icon={<BuildingOffice2Icon className="w-4 h-4 text-text-subtle" />}
                disabled={clientsListLoading}
              />
            </div>
          ) : null}

          <div className="flex bg-bg-subtle p-1 rounded-lg border border-border-default mr-2">
            <button
              type="button"
              onClick={() => applyDatePreset('today')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'today' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}
            >
              היום
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('week')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'week' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}
            >
              השבוע
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('month')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'month' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}
            >
              החודש
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('quarter')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'quarter' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}
            >
              רבעון
            </button>
          </div>

          <div className="relative">
            <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">מתאריך</span>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px]"
            />
          </div>
          <div className="relative">
            <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">עד תאריך</span>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px]"
            />
          </div>
          <div className="relative">
            <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">מקור ספציפי</span>
            <select
              name="source"
              value={filters.source}
              onChange={handleFilterChange}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm w-40 focus:ring-1 focus:ring-primary-500 outline-none h-[38px]"
            >
              <option value="הכל">הצג הכל</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            title="רענן נתונים"
            className="bg-primary-600 text-white p-2 rounded-lg hover:bg-primary-700 transition shadow-sm h-[38px] w-[38px] flex items-center justify-center disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void loadReport()} className="underline text-xs">
            נסה שוב
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="סה״כ מועמדים"
          value={loading ? '…' : totals.candidates}
          icon={<UserGroupIcon className="w-6 h-6 text-primary-600" />}
          color="bg-primary-100"
        />
        <StatCard
          title="הפניות ללקוחות"
          value={loading ? '…' : totals.referrals}
          icon={<ArrowPathIcon className="w-6 h-6 text-blue-600" />}
          color="bg-blue-100"
        />
        <StatCard
          title="קליטות (השמות)"
          value={loading ? '…' : totals.placements}
          icon={<CheckBadgeIcon className="w-6 h-6 text-green-600" />}
          color="bg-green-100"
        />
        <StatCard
          title="יחס המרה (ממוצע)"
          value={loading ? '…' : `${totals.conversionRate}%`}
          icon={<ChartBarIcon className="w-6 h-6 text-orange-600" />}
          color="bg-orange-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
        <div className="lg:col-span-1 h-full">
          <TopSourcesChart data={chartData} />
        </div>

        <div className="lg:col-span-2 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col h-full">
          <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
            <div className="flex items-center gap-2">
              <TableCellsIcon className="w-5 h-5 text-text-muted" />
              <h3 className="font-bold text-text-default">פירוט נתונים</h3>
              {loading && <span className="text-xs text-text-muted">טוען…</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="ייצוא ל-CSV"
                onClick={exportCsv}
                disabled={sortedData.length === 0}
                className="p-2 text-text-muted rounded-full hover:bg-bg-hover disabled:opacity-40"
              >
                <DocumentArrowDownIcon className="w-5 h-5" />
              </button>
              <div className="relative" ref={settingsRef}>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  title="התאם עמודות"
                  className="p-2 text-text-muted rounded-full hover:bg-bg-hover"
                >
                  <Cog6ToothIcon className="w-5 h-5" />
                </button>
                {isSettingsOpen && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                    <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {allColumns.map((column) => (
                        <label
                          key={column.key}
                          className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns.includes(column.key as string)}
                            onChange={() => handleColumnToggle(column.key as string)}
                            className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                          />
                          {column.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-sm text-right min-w-[800px]">
              <thead className="bg-bg-subtle/80 text-text-muted font-bold sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  {visibleColumns.map((colKey, index) => {
                    const col = allColumns.find((c) => c.key === colKey);
                    if (!col) return null;
                    return (
                      <th
                        key={col.key}
                        className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.key ? 'dragging' : ''}`}
                        onClick={() => requestSort(col.key)}
                        draggable
                        onDragStart={() => handleDragStart(index, col.key as string)}
                        onDragEnter={() => handleDragEnter(index)}
                        onDragEnd={handleDragEnd}
                        onDrop={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                      >
                        <div className="flex items-center gap-1">
                          <span>{col.label}</span>
                          {getSortIndicator(col.key)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {!loading && sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="p-8 text-center text-text-muted">
                      לא נמצאו מועמדים לטווח ולמסננים שנבחרו
                    </td>
                  </tr>
                ) : (
                  sortedData.map((row) => (
                    <tr key={`${row.sourceName}-${row.id}`} className="hover:bg-bg-hover/50 transition-colors group">
                      {visibleColumns.map((colKey) => {
                        const col = allColumns.find((c) => c.key === colKey);
                        if (!col) return null;

                        if (colKey === 'candidates') {
                          return (
                            <td key={colKey} className="p-3 pr-4">
                              <VisualBar value={row.candidates} max={maxCandidates} colorClass="bg-primary-500" />
                            </td>
                          );
                        }
                        if (colKey === 'placements') {
                          return (
                            <td key={colKey} className="p-3 pr-4">
                              <VisualBar value={row.placements} max={maxPlacements} colorClass="bg-green-500" />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            className={`p-4 ${col.key === 'sourceName' ? 'text-text-default font-bold' : 'text-text-default'}`}
                          >
                            {typeof row[col.key] === 'number'
                              ? (row[col.key] as number).toLocaleString()
                              : String(row[col.key] ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruitmentSourcesReportView;
