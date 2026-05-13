import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseIcon } from './Icons';

// ─── types ────────────────────────────────────────────────────────────────────

interface SkillRow {
  jobId: string;
  jobTitle: string;
  client: string;
  jobStatus: string;
  skillIndex: number;   // position inside job.skills[]
  name: string;
  key: string;
  mode: 'normal' | 'mandatory' | 'negative';
  source: string;
  tagType: string;
  tag_reason: string;
  relevance_score: number | null;
  status: string;
  createdAt: string | null; // skill-level createdAt if present, otherwise job createdAt
}

interface EditForm {
  name: string;
  key: string;
  mode: 'normal' | 'mandatory' | 'negative';
  source: string;
  tagType: string;
  tag_reason: string;
  relevance_score: string;
  status: string;
}

interface TagOption {
  id: string;
  tagKey: string;
  displayNameHe?: string;
  displayNameEn?: string;
  type?: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const MODE_STYLES: Record<string, string> = {
  mandatory: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative:  'bg-red-50 text-red-700 border-red-200',
  normal:    'bg-gray-100 text-gray-600 border-gray-200',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const authHeaders = (): HeadersInit => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

// ─── component ────────────────────────────────────────────────────────────────

const AdminJobTagsView: React.FC = () => {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const navigate = useNavigate();

  // raw data
  const [allRows, setAllRows] = useState<SkillRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // tag catalog for the edit dropdown
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);

  // filters
  const [searchTerm, setSearchTerm]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [modeFilter, setModeFilter]           = useState<'all' | 'normal' | 'mandatory' | 'negative'>('all');
  const [page, setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // edit state
  const [editingRow, setEditingRow] = useState<SkillRow | null>(null);
  const [form, setForm]             = useState<EditForm | null>(null);
  const [saving, setSaving]         = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  // sort
  type SortKey =
    | 'jobTitle'
    | 'client'
    | 'key'
    | 'name'
    | 'mode'
    | 'tagType'
    | 'source'
    | 'tag_reason'
    | 'relevance_score'
    | 'status'
    | 'createdAt';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>({
    key: 'createdAt',
    direction: 'desc',
  });

  const requestSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortIndicator = (key: SortKey) =>
    sortConfig?.key === key ? (
      <span className="text-primary-500 font-bold ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
    ) : (
      <span className="text-text-subtle/40 font-normal ml-1">↕</span>
    );

  // ── debounce search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => { setPage(1); }, [debouncedSearch, modeFilter, pageSize, sortConfig]);

  // ── load jobs and flatten skills ───────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/jobs`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load jobs');
      const jobs: any[] = await res.json();

      const rows: SkillRow[] = [];
      for (const job of jobs) {
        if (!Array.isArray(job.skills) || job.skills.length === 0) continue;
        const jobCreatedAt = job.createdAt || job.created_at || null;
        job.skills.forEach((s: any, idx: number) => {
          rows.push({
            jobId:           String(job.id),
            jobTitle:        job.title || '—',
            client:          job.client || '—',
            jobStatus:       job.status || '',
            skillIndex:      idx,
            name:            s.name || s.key || '',
            key:             s.key  || s.name || '',
            mode:            s.mode || 'normal',
            source:          s.source || '',
            tagType:         s.tagType || s.tag_type || '',
            tag_reason:      s.tag_reason || '',
            relevance_score: typeof s.relevance_score === 'number' ? s.relevance_score : null,
            status:          s.status || 'active',
            createdAt:       s.createdAt || s.created_at || jobCreatedAt,
          });
        });
      }
      setAllRows(rows);
      setLastUpdated(new Date().toISOString());
    } catch (e: any) {
      setError(e.message || 'Load failed');
      setAllRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  // ── load tag catalog ───────────────────────────────────────────────────────
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${apiBase}/api/tags`, { headers: authHeaders() });
        if (!res.ok) return;
        const raw: any = await res.json();
        const list: any[] = Array.isArray(raw) ? raw : (raw.data ?? raw.tags ?? []);
        setTagOptions(list.map((t) => ({
          id: t.id,
          tagKey: t.tagKey,
          displayNameHe: t.displayNameHe,
          displayNameEn: t.displayNameEn,
          type: t.type,
        })));
      } catch { /* non-critical */ }
    };
    fetchOptions();
  }, [apiBase]);

  const sortedTagOptions = useMemo(
    () => [...tagOptions].sort((a, b) =>
      (a.displayNameHe || a.tagKey || '').localeCompare(b.displayNameHe || b.tagKey || '')
    ),
    [tagOptions],
  );

  // ── filter + sort + paginate ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const list = allRows.filter((r) => {
      if (modeFilter !== 'all' && r.mode !== modeFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q)  ||
        r.jobTitle.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q) ||
        r.tagType.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q)
      );
    });

    if (!sortConfig) return list;

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    const compareValue = (row: SkillRow): string | number => {
      const k = sortConfig.key;
      if (k === 'relevance_score') {
        return row.relevance_score == null ? Number.NEGATIVE_INFINITY : row.relevance_score;
      }
      if (k === 'createdAt') {
        const t = row.createdAt ? Date.parse(row.createdAt) : NaN;
        return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
      }
      const v = (row as unknown as Record<string, unknown>)[k];
      return typeof v === 'string' ? v.toLowerCase() : String(v ?? '').toLowerCase();
    };

    return [...list].sort((a, b) => {
      const av = compareValue(a);
      const bv = compareValue(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), 'he') * dir;
    });
  }, [allRows, debouncedSearch, modeFilter, sortConfig]);

  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const paged      = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  // ── edit helpers ───────────────────────────────────────────────────────────
  const startEdit = (row: SkillRow) => {
    setEditingRow(row);
    setForm({
      name:            row.name,
      key:             row.key,
      mode:            row.mode,
      source:          row.source,
      tagType:         row.tagType,
      tag_reason:      row.tag_reason,
      relevance_score: row.relevance_score != null ? String(row.relevance_score) : '',
      status:          row.status,
    });
  };

  const cancelEdit = () => { setEditingRow(null); setForm(null); };

  useEffect(() => {
    if (editingRow && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editingRow]);

  // Apply a skill patch by loading the full job, modifying skills[], and PUTting back
  const patchJob = async (jobId: string, transform: (skills: any[]) => any[]) => {
    const jobRes = await fetch(`${apiBase}/api/jobs/${jobId}`, { headers: authHeaders() });
    if (!jobRes.ok) throw new Error('Failed to load job');
    const job = await jobRes.json();
    const skills: any[] = Array.isArray(job.skills) ? [...job.skills] : [];
    const updated = transform(skills);
    const putRes = await fetch(`${apiBase}/api/jobs/${jobId}`, {
      method:  'PUT',
      headers: authHeaders(),
      body:    JSON.stringify({ skills: updated }),
    });
    if (!putRes.ok) throw new Error((await putRes.text().catch(() => '')) || `HTTP ${putRes.status}`);
    return await putRes.json();
  };

  const handleSave = async () => {
    if (!editingRow || !form) return;
    setSaving(true);
    try {
      const { jobId, skillIndex } = editingRow;
      await patchJob(jobId, (skills) => {
        const copy = [...skills];
        copy[skillIndex] = {
          ...copy[skillIndex],
          name:            form.name,
          key:             form.key,
          mode:            form.mode,
          source:          form.source,
          tagType:         form.tagType,
          tag_reason:      form.tag_reason,
          relevance_score: form.relevance_score !== '' ? Number(form.relevance_score) : null,
          status:          form.status,
        };
        return copy;
      });
      await load();
      cancelEdit();
    } catch (e: any) {
      alert(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: SkillRow) => {
    if (!window.confirm(`Remove tag "${row.name}" from "${row.jobTitle}"?`)) return;
    try {
      await patchJob(row.jobId, (skills) => skills.filter((_, i) => i !== row.skillIndex));
      await load();
      if (editingRow?.jobId === row.jobId && editingRow?.skillIndex === row.skillIndex) cancelEdit();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  };

  const handleToggleStatus = async (row: SkillRow) => {
    try {
      const next = row.status === 'active' ? 'inactive' : 'active';
      await patchJob(row.jobId, (skills) =>
        skills.map((s, i) => (i === row.skillIndex ? { ...s, status: next } : s)),
      );
      await load();
    } catch (e: any) {
      alert(e.message || 'Update failed');
    }
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <BriefcaseIcon className="w-6 h-6 text-primary-600" />
          <div>
            <h1 className="text-2xl font-black text-text-default">תגיות משרות</h1>
            <p className="text-sm text-text-muted">
              כל התגיות שמוגדרות ב-job.skills — פרוסות לשורה אחת לכל תגית. ניתן לערוך, לשנות מצב ולמחוק.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש לפי שם תגית, משרה, לקוח..."
            className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none min-w-[240px]"
          />
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value as any)}
            className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
          >
            <option value="all">כל המצבים</option>
            <option value="normal">Normal</option>
            <option value="mandatory">Mandatory</option>
            <option value="negative">Negative</option>
          </select>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} לעמוד</option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-sm font-semibold text-primary-600 border border-primary-200 rounded-lg px-3 py-2 hover:bg-primary-50 disabled:opacity-50"
          >
            רענן
          </button>
          <span className="text-sm text-text-muted ml-auto">
            {total.toLocaleString()} תגיות
          </span>
        </div>
      </header>

      {/* Edit form */}
      <section ref={formRef} className="bg-bg-card border border-border-default rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-default">עריכת תגית נבחרת</h2>
          {editingRow && (
            <button
              onClick={cancelEdit}
              className="px-3 py-1 text-xs font-semibold rounded-full border border-border-default text-text-muted hover:bg-bg-hover"
            >
              ביטול
            </button>
          )}
        </div>

        {editingRow && form ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tag dropdown */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">תגית (קטלוג)</label>
              <select
                value={form.key}
                onChange={(e) => {
                  const key = e.target.value;
                  const opt = sortedTagOptions.find((t) => t.tagKey === key);
                  setForm((prev) => prev && ({
                    ...prev,
                    key,
                    name:    opt?.displayNameHe || opt?.tagKey || key,
                    tagType: opt?.type || prev.tagType,
                  }));
                }}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— בחר תגית —</option>
                {sortedTagOptions.map((t) => (
                  <option key={t.id} value={t.tagKey}>
                    {t.displayNameHe || t.displayNameEn || t.tagKey}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag key */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Tag Key</label>
              <input
                value={form.key}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, key: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Name (Hebrew)</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, name: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Mode */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Mode</label>
              <select
                value={form.mode}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, mode: e.target.value as any }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              >
                <option value="normal">Normal</option>
                <option value="mandatory">Mandatory</option>
                <option value="negative">Negative</option>
              </select>
            </div>

            {/* Tag type */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Tag Type</label>
              <input
                value={form.tagType}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, tagType: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Source */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Source</label>
              <input
                value={form.source}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, source: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Tag reason */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Tag Reason</label>
              <input
                value={form.tag_reason}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, tag_reason: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Relevance score */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Relevance Score</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.relevance_score}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, relevance_score: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-wide text-text-muted">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => prev && ({ ...prev, status: e.target.value }))}
                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Save */}
            <div className="flex items-end gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-wait"
              >
                {saving ? 'שומר…' : 'שמור שינויים'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">בחר תגית בטבלה כדי לערוך אותה.</p>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 px-4 py-2">{error}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-text-muted">טוען נתונים…</div>
      ) : (
        <>
          {paged.length > 0 ? (
            <div className="overflow-x-auto bg-bg-card border border-border-default rounded-2xl shadow-sm">
              <table className="w-full text-sm text-right">
                <thead className="bg-bg-subtle text-text-muted uppercase text-xs font-semibold border-b border-border-default">
                  <tr>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('jobTitle')}
                      aria-sort={sortConfig?.key === 'jobTitle' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">משרה{sortIndicator('jobTitle')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('client')}
                      aria-sort={sortConfig?.key === 'client' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">לקוח{sortIndicator('client')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('key')}
                      aria-sort={sortConfig?.key === 'key' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Tag Key{sortIndicator('key')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('name')}
                      aria-sort={sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">שם{sortIndicator('name')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('mode')}
                      aria-sort={sortConfig?.key === 'mode' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Mode{sortIndicator('mode')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('tagType')}
                      aria-sort={sortConfig?.key === 'tagType' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Type{sortIndicator('tagType')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('source')}
                      aria-sort={sortConfig?.key === 'source' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Source{sortIndicator('source')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('tag_reason')}
                      aria-sort={sortConfig?.key === 'tag_reason' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Reason{sortIndicator('tag_reason')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('relevance_score')}
                      aria-sort={sortConfig?.key === 'relevance_score' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Score{sortIndicator('relevance_score')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                      onClick={() => requestSort('status')}
                      aria-sort={sortConfig?.key === 'status' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">Status{sortIndicator('status')}</span>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-bg-hover transition-colors select-none whitespace-nowrap"
                      onClick={() => requestSort('createdAt')}
                      aria-sort={sortConfig?.key === 'createdAt' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center">תאריך יצירה{sortIndicator('createdAt')}</span>
                    </th>
                    <th className="p-3 text-center">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {paged.map((row) => {
                    const isEditing = editingRow?.jobId === row.jobId && editingRow?.skillIndex === row.skillIndex;
                    return (
                      <tr key={`${row.jobId}-${row.skillIndex}`} className={`hover:bg-bg-hover ${isEditing ? 'bg-primary-50/30' : ''}`}>
                        {/* Job title — click to navigate */}
                        <td className="py-2 px-3">
                          <button
                            onClick={() => navigate(`/jobs/edit/${row.jobId}`)}
                            className="text-sm font-semibold text-primary-600 hover:underline text-right"
                          >
                            {row.jobTitle}
                          </button>
                        </td>
                        <td className="py-2 px-3 text-text-muted text-xs">{row.client}</td>
                        <td className="py-2 px-3 font-mono text-xs">{row.key || '—'}</td>
                        <td className="py-2 px-3">{row.name || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${MODE_STYLES[row.mode] || MODE_STYLES.normal}`}>
                            {row.mode}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-text-muted">{row.tagType || '—'}</td>
                        <td className="py-2 px-3 text-xs text-text-muted">{row.source || '—'}</td>
                        <td className="py-2 px-3 text-xs text-text-muted max-w-[180px] truncate" title={row.tag_reason}>{row.tag_reason || '—'}</td>
                        <td className="py-2 px-3 text-xs">{row.relevance_score != null ? row.relevance_score.toFixed(2) : '—'}</td>
                        <td className="py-2 px-3">
                          {row.status === 'active' ? (
                            <span className="text-xs font-semibold text-primary-600">פעיל</span>
                          ) : (
                            <span className="text-xs font-semibold text-text-muted">לא פעיל</span>
                          )}
                        </td>
                        <td
                          className="py-2 px-3 text-xs text-text-muted whitespace-nowrap"
                          title={row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}
                        >
                          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col gap-1 items-center">
                            <button
                              onClick={() => handleToggleStatus(row)}
                              className="px-2 py-1 text-xs rounded-xl border border-primary-200 text-primary-600 hover:bg-primary-50 whitespace-nowrap"
                            >
                              {row.status === 'active' ? 'סגור' : 'הפעל'}
                            </button>
                            <button
                              onClick={() => startEdit(row)}
                              className="px-2 py-1 text-xs rounded-xl border border-border-default text-text-default hover:bg-bg-hover whitespace-nowrap"
                            >
                              ערוך
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="px-2 py-1 text-xs rounded-xl border border-red-200 text-red-600 hover:bg-red-50 whitespace-nowrap"
                            >
                              מחק
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-border-default bg-white/80 p-6 text-sm text-text-muted text-center">
              לא נמצאו רשומות.
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-text-muted">
            <span>
              סה״כ {total.toLocaleString()} רשומות · עמוד {page} מתוך {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className="px-3 py-1.5 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover"
              >
                הקודם
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="px-3 py-1.5 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover"
              >
                הבא
              </button>
            </div>
          </div>

          {lastUpdated && (
            <p className="text-xs text-text-muted">
              עודכן לאחרונה: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AdminJobTagsView;
