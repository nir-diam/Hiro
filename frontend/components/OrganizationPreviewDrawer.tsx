import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  BuildingOffice2Icon,
  LinkIcon,
  XMarkIcon,
} from './Icons';
import { authHeaders } from '../utils/authHeaders';
import { fetchPublishingLinks } from '../services/publishingApi';

type OrgJobLink = {
  jobId: string;
  jobTitle: string;
  totalVisits: number;
  totalSubmissions: number;
  sources: Array<{
    source: string;
    url: string;
    visits: number;
    submissions: number;
    subPercent: number;
  }>;
};

export type OrganizationPreviewDrawerTarget = {
  organizationId: string;
  name: string;
  logo?: string;
  mainField?: string;
  website?: string;
  location?: string;
  employeeCount?: string;
  isPrimary?: boolean;
  isPending?: boolean;
  statusLabel?: string;
};

type Props = {
  target: OrganizationPreviewDrawerTarget | null;
  isOpen: boolean;
  onClose: () => void;
  tenantClientId?: string | null;
  overlayZIndexClass?: string;
};

const OrganizationPreviewDrawer: React.FC<Props> = ({
  target,
  isOpen,
  onClose,
  tenantClientId = null,
  overlayZIndexClass = 'z-[70]',
}) => {
  const navigate = useNavigate();
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const [full, setFull] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<OrgJobLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !target?.organizationId) {
      setFull(null);
      setLinks([]);
      return;
    }

    let active = true;
    setLoading(true);
    void fetch(`${apiBase}/api/organizations/${encodeURIComponent(target.organizationId)}`, {
      headers: authHeaders(true),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setFull(data && typeof data === 'object' ? (data as Record<string, unknown>) : null);
      })
      .catch(() => {
        if (active) setFull(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    setLinksLoading(true);
    void fetchPublishingLinks(tenantClientId ?? undefined)
      .then((all) => {
        if (!active) return;
        const orgName = target.name.trim().toLowerCase();
        const filtered = all.filter(
          (l) => (l.employer || l.client || '').trim().toLowerCase() === orgName,
        );
        const byJob = new Map<string, typeof filtered>();
        for (const row of filtered) {
          const key = row.jobId;
          if (!byJob.has(key)) byJob.set(key, []);
          byJob.get(key)!.push(row);
        }
        setLinks(
          [...byJob.entries()].map(([jobId, rows]) => ({
            jobId,
            jobTitle: rows[0].jobTitle,
            totalVisits: rows.reduce((sum, row) => sum + (row.visits || 0), 0),
            totalSubmissions: rows.reduce((sum, row) => sum + (row.submissions || 0), 0),
            sources: rows.map((row) => ({
              source: row.source,
              url: row.url,
              visits: row.visits || 0,
              submissions: row.submissions || 0,
              subPercent: row.subPercent || 0,
            })),
          })),
        );
      })
      .catch(() => {
        if (active) setLinks([]);
      })
      .finally(() => {
        if (active) setLinksLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, target?.organizationId, target?.name, apiBase, tenantClientId]);

  if (!isOpen || !target) return null;

  const logo = String(target.logo || full?.logo || '').trim();
  const mainField = String(target.mainField || full?.mainField || '').trim();
  const status = String((full?.activityStatus as string) || target.statusLabel || '').trim();
  const statusColor =
    status === 'פעילה'
      ? 'bg-green-50 text-green-700 border-green-100'
      : status === 'לא פעילה'
        ? 'bg-red-50 text-red-700 border-red-100'
        : 'bg-gray-50 text-gray-600 border-gray-200';

  const detailRows = [
    { label: 'תחום', value: mainField },
    {
      label: 'תת-תחום',
      value: Array.isArray(full?.subField)
        ? (full?.subField as string[]).join(', ')
        : full?.subField
          ? String(full.subField)
          : '',
    },
    { label: 'מיקום', value: String(full?.location || target.location || '') },
    { label: 'מספר עובדים', value: String(full?.employeeCount || target.employeeCount || '') },
    { label: 'אתר', value: String(full?.website || target.website || ''), isLink: true },
    { label: 'לינקדאין', value: String(full?.linkedinUrl || ''), isLink: true },
    { label: 'טלפון', value: String(full?.phone || '') },
    { label: 'דוא״ל', value: String(full?.email || '') },
    { label: 'כתובת', value: String(full?.address || '') },
    { label: 'שנת ייסוד', value: String(full?.foundedYear || '') },
    { label: 'סיווג', value: String(full?.classification || '') },
  ];

  return (
    <div className={`fixed inset-0 ${overlayZIndexClass} flex justify-end`} dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-bg-card shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
        <div className="flex items-center gap-4 px-6 py-5 border-b border-border-default shrink-0">
          {logo ? (
            <img
              src={logo}
              alt=""
              className="w-12 h-12 rounded-xl object-contain border border-border-default bg-bg-subtle p-1 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-bg-subtle border border-border-default flex items-center justify-center shrink-0">
              <BuildingOffice2Icon className="w-6 h-6 text-text-muted" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-text-default truncate">{target.name}</h2>
            <p className="text-sm text-text-muted truncate">{mainField || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-bg-hover text-text-muted">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          {loading ? <div className="text-center text-sm text-text-muted py-4">טוען פרטים...</div> : null}

          <div className="flex flex-wrap gap-2">
            {target.isPrimary ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                ראשית
              </span>
            ) : null}
            {target.isPending ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                ממתין לאישור
              </span>
            ) : null}
            {status ? (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusColor}`}>{status}</span>
            ) : null}
          </div>

          {detailRows.map(({ label, value, isLink }) =>
            value ? (
              <div key={label} className="flex gap-3 items-start text-sm">
                <span className="text-text-muted w-28 shrink-0">{label}</span>
                {isLink ? (
                  <a
                    href={String(value).startsWith('http') ? String(value) : `https://${value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline break-all"
                  >
                    {String(value).replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span className="text-text-default font-medium">{String(value)}</span>
                )}
              </div>
            ) : null,
          )}

          {full?.description ? (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">תיאור</p>
              <p className="text-sm text-text-default leading-relaxed">{String(full.description)}</p>
            </div>
          ) : null}

          <div className="pt-4 border-t border-border-subtle">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">דפי נחיתה ופרסום</p>
            {linksLoading ? (
              <p className="text-sm text-text-muted">טוען דפי נחיתה...</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-text-muted">אין דפי נחיתה משויכים</p>
            ) : (
              <div className="space-y-3">
                {links.map((job) => (
                  <div key={job.jobId} className="border border-border-default rounded-xl p-3 bg-bg-subtle/40 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-sm text-text-default">{job.jobTitle || 'משרה'}</p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate(`/jobs/edit/${job.jobId}`);
                        }}
                        className="text-xs font-bold text-primary-600 hover:text-primary-700"
                      >
                        עריכת משרה
                      </button>
                    </div>
                    <div className="text-xs text-text-muted flex gap-3">
                      <span>{job.totalVisits} צפיות</span>
                      <span>{job.totalSubmissions} הגשות</span>
                    </div>
                    {job.sources.map((source) => (
                      <div key={source.source} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-text-muted bg-bg-card border border-border-default rounded px-1.5 py-0.5 shrink-0">
                            {source.source}
                          </span>
                          <span className="text-xs text-text-subtle">
                            {source.visits} צפיות · {source.submissions} הגשות
                          </span>
                        </div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-0.5 rounded-lg transition"
                        >
                          <LinkIcon className="w-3 h-3" />
                          פתח
                        </a>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="p-4 border-t border-border-default shrink-0 bg-bg-card shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.05)]">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/organizations/${encodeURIComponent(target.organizationId)}`);
            }}
            className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-[0.98] group"
          >
            <span>צפה בפרופיל החברה</span>
            <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
        </footer>
      </div>
    </div>
  );
};

export default OrganizationPreviewDrawer;
