import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseIcon, ArrowTopRightOnSquareIcon } from './Icons';
import { authHeaders } from '../utils/authHeaders';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';
import { contactFromApi, primaryEmail, primaryPhone } from '../utils/contactFormModel';
import {
  resolveProcessPlacements,
  resolveStageDisplay,
} from '../utils/processPlacements';
import {
  mapRawProcessJournalEvent,
  processRowHasJournalEvent,
  type ProcessJournalEventLike,
} from '../utils/processEventMatching';

type ContactRow = ReturnType<typeof contactFromApi> & {
  pipelineId?: string | null;
  processStage?: string | null;
  updatedAt?: string;
  createdAt?: string;
};

type OrgLinkRow = {
  linkId: string;
  organizationId: string | null;
  organizationTmpId: string | null;
  name: string;
  pipelineId: string | null;
  pipelineStage: string | null;
};

export type ClientContactProcessesTabProps = {
  clientId: string;
  /** When set, only contacts / org link for this organization are included. */
  organizationId?: string;
  organizationTmpId?: string;
  organizationName?: string;
  /** When set, only this contact's processes are shown (contact profile). */
  contactId?: string;
  contactName?: string;
};

type ProcessRow = {
  rowKey: string;
  kind: 'contact' | 'organization';
  name: string;
  role: string;
  pipelineId: string;
  processStage: string | null;
  contact?: ContactRow;
  organizationId?: string | null;
};

const normalizeOrgLink = (raw: Record<string, unknown>): OrgLinkRow | null => {
  const organizationId = raw.organizationId != null ? String(raw.organizationId) : null;
  const org = raw.organization && typeof raw.organization === 'object'
    ? (raw.organization as Record<string, unknown>)
    : null;
  const tmp = raw.organizationTmp && typeof raw.organizationTmp === 'object'
    ? (raw.organizationTmp as Record<string, unknown>)
    : null;
  const name = String(org?.name || org?.nameEn || tmp?.name || '').trim();
  if (!name && !organizationId) return null;
  return {
    linkId: String(raw.id || organizationId || raw.organizationTmpId || ''),
    organizationId,
    organizationTmpId: raw.organizationTmpId != null ? String(raw.organizationTmpId) : null,
    name: name || '—',
    pipelineId: raw.pipelineId != null ? String(raw.pipelineId) : null,
    pipelineStage: raw.pipelineStage != null ? String(raw.pipelineStage) : null,
  };
};

const ClientContactProcessesTab: React.FC<ClientContactProcessesTabProps> = ({
  clientId,
  organizationId,
  organizationTmpId,
  organizationName,
  contactId,
  contactName,
}) => {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [orgLinks, setOrgLinks] = useState<OrgLinkRow[]>([]);
  const [pipelines, setPipelines] = useState<PipelineDto[]>([]);
  const [journalEvents, setJournalEvents] = useState<ProcessJournalEventLike[]>([]);
  const [filterPipelineId, setFilterPipelineId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiBase || !clientId) return;
    let active = true;
    setIsLoading(true);
    setError(null);

    const orgQs = organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : organizationTmpId
        ? `?organizationTmpId=${encodeURIComponent(organizationTmpId)}`
        : '';

    Promise.all([
      fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts${orgQs}`, {
        headers: authHeaders(true),
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load contacts')))),
      fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/linked-organizations`, {
        headers: authHeaders(true),
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : [])),
      fetchPipelines(clientId).catch(() => [] as PipelineDto[]),
      fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/events?summary=1&limit=1200`, {
        headers: authHeaders(true),
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([contactsData, linkedOrgsData, pipelineList, eventsData]) => {
        if (!active) return;
        const list = Array.isArray(contactsData) ? contactsData : contactsData?.data ?? [];
        const mapped = list.map((row: Record<string, unknown>) => {
          const base = contactFromApi(row);
          return {
            ...base,
            pipelineId: row.pipelineId != null ? String(row.pipelineId) : null,
            processStage: row.processStage != null ? String(row.processStage) : null,
            updatedAt: row.updatedAt != null ? String(row.updatedAt) : undefined,
            createdAt: row.createdAt != null ? String(row.createdAt) : undefined,
          };
        });
        setContacts(mapped);

        const linksRaw = Array.isArray(linkedOrgsData) ? linkedOrgsData : [];
        const links = linksRaw
          .map((row: Record<string, unknown>) => normalizeOrgLink(row))
          .filter(Boolean) as OrgLinkRow[];
        setOrgLinks(
          organizationId
            ? links.filter((l) => l.organizationId === organizationId)
            : organizationTmpId
              ? links.filter((l) => l.organizationTmpId === organizationTmpId)
              : links,
        );

        setPipelines(Array.isArray(pipelineList) ? pipelineList : []);

        const eventsRaw = Array.isArray(eventsData) ? eventsData : eventsData?.data ?? [];
        setJournalEvents(
          eventsRaw
            .filter((row: unknown): row is Record<string, unknown> => !!row && typeof row === 'object')
            .map((row) => mapRawProcessJournalEvent(row)),
        );
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'טעינה נכשלה');
        setContacts([]);
        setOrgLinks([]);
        setPipelines([]);
        setJournalEvents([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiBase, clientId, organizationId, organizationTmpId]);

  const scopedContacts = useMemo(() => {
    if (!contactId) return contacts;
    return contacts.filter((c) => String(c.id) === String(contactId));
  }, [contacts, contactId]);

  const processRows = useMemo((): ProcessRow[] => {
    const rows: ProcessRow[] = [];

    if (!contactId) for (const link of orgLinks) {
      const placements = resolveProcessPlacements(link.pipelineId, link.pipelineStage, pipelines);
      for (const placement of placements) {
        rows.push({
          rowKey: `org-${link.linkId}-${placement.pipelineId}`,
          kind: 'organization',
          name: link.name,
          role: 'חברה',
          pipelineId: placement.pipelineId,
          processStage: placement.processStage,
          organizationId: link.organizationId,
        });
      }
    }

    for (const c of scopedContacts) {
      const placements = resolveProcessPlacements(c.pipelineId, c.processStage, pipelines);
      for (const placement of placements) {
        rows.push({
          rowKey: `contact-${c.id}-${placement.pipelineId}`,
          kind: 'contact',
          name: c.name,
          role: c.role || '—',
          pipelineId: placement.pipelineId,
          processStage: placement.processStage,
          contact: c,
          organizationId: c.organizationId,
        });
      }
    }

    if (organizationId && !contactId) {
      const orgPlacementKeys = new Set(
        rows
          .filter((row) => row.kind === 'organization')
          .map((row) => `${row.pipelineId}:${row.processStage || ''}`),
      );
      return rows.filter((row) => {
        if (row.kind !== 'contact') return true;
        if (String(row.organizationId || '') !== String(organizationId)) return true;
        const key = `${row.pipelineId}:${row.processStage || ''}`;
        return !orgPlacementKeys.has(key);
      }).sort((a, b) => {
        const kindOrder = a.kind === b.kind ? 0 : a.kind === 'organization' ? -1 : 1;
        if (kindOrder !== 0) return kindOrder;
        const an = a.name.localeCompare(b.name, 'he');
        if (an !== 0) return an;
        return a.pipelineId.localeCompare(b.pipelineId, 'he');
      });
    }

    return rows.sort((a, b) => {
      const kindOrder = a.kind === b.kind ? 0 : a.kind === 'organization' ? -1 : 1;
      if (kindOrder !== 0) return kindOrder;
      const an = a.name.localeCompare(b.name, 'he');
      if (an !== 0) return an;
      return a.pipelineId.localeCompare(b.pipelineId, 'he');
    });
  }, [scopedContacts, orgLinks, pipelines, contactId, organizationId]);

  const processRowsWithEvents = useMemo(
    () =>
      processRows.filter((row) =>
        processRowHasJournalEvent(journalEvents, row, pipelines),
      ),
    [processRows, journalEvents, pipelines],
  );

  const allOpenProcesses = useMemo(() => {
    return processRowsWithEvents.map((row) => {
      const pipeline = pipelines.find((p) => p.id === row.pipelineId);
      const stage = resolveStageDisplay(pipeline, row.processStage);
      return {
        ...row,
        pipeline,
        pipelineName: pipeline?.name || 'תהליך',
        stageName: stage.name,
        stageColorClass: stage.colorClass,
      };
    });
  }, [processRows, pipelines]);

  const openProcesses = useMemo(() => {
    if (filterPipelineId === 'all') return allOpenProcesses;
    return allOpenProcesses.filter((row) => row.pipelineId === filterPipelineId);
  }, [allOpenProcesses, filterPipelineId]);

  const pipelineOptions = useMemo(() => {
    const ids = new Set(allOpenProcesses.map((p) => p.pipelineId));
    return pipelines.filter((p) => ids.has(p.id));
  }, [allOpenProcesses, pipelines]);

  const profileLink = (row: (typeof allOpenProcesses)[number]) => {
    if (row.kind === 'organization' && row.organizationId) {
      return `/organizations/${encodeURIComponent(row.organizationId)}`;
    }
    if (row.contact) {
      return `/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(row.contact.id)}`;
    }
    return `/clients/${encodeURIComponent(clientId)}`;
  };

  const processManagementLink = (row: (typeof allOpenProcesses)[number]) => {
    const qs = new URLSearchParams({
      tab: 'events',
      pipelineId: row.pipelineId,
    });
    if (row.processStage) qs.set('processStage', row.processStage);

    if (row.kind === 'contact' && row.contact) {
      return `/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(row.contact.id)}?${qs.toString()}`;
    }
    if (row.kind === 'organization' && row.organizationId) {
      return `/organizations/${encodeURIComponent(row.organizationId)}?${qs.toString()}`;
    }
    return profileLink(row);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-text-muted">טוען תהליכים...</div>;
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600 bg-red-50 border border-red-100 rounded-xl">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text-default flex items-center gap-2">
            <BriefcaseIcon className="w-5 h-5 text-primary-600" />
            תהליכים פתוחים
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            {contactName
              ? `תהליכים עם אירוע ביומן עבור ${contactName}`
              : organizationName
                ? `תהליכים עם אירוע ביומן עבור ${organizationName} ואנשי הקשר שלה`
                : 'תהליכים עם אירוע ביומן — חברות מקושרות ואנשי קשר'}
          </p>
        </div>
        {pipelineOptions.length > 1 ? (
          <select
            value={filterPipelineId}
            onChange={(e) => setFilterPipelineId(e.target.value)}
            className="bg-bg-input border border-border-default text-text-default text-sm rounded-xl py-2.5 px-3 min-w-[200px] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
          >
            <option value="all">כל התהליכים ({allOpenProcesses.length})</option>
            {pipelineOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {openProcesses.length === 0 ? (
        <div className="text-center py-16 bg-bg-subtle rounded-2xl border border-dashed border-border-default">
          <BriefcaseIcon className="w-12 h-12 text-text-subtle mx-auto mb-3" />
          <p className="font-semibold text-text-muted">אין תהליכים עם אירוע ביומן</p>
          <p className="text-sm text-text-subtle mt-1 max-w-md mx-auto">
            תהליך ב-Kanban מופיע כאן רק לאחר שנוצר לו אירוע ביומן (ידנית, אוטומציה, או ייבוא).
            ניתן לפתוח תהליך בלוח הלקוחות וליצור אירוע מניהול האירועים.
          </p>
          <Link
            to="/clients"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-bold text-primary-600 hover:text-primary-700"
          >
            מעבר ללוח לקוחות
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-card shadow-sm">
          <table className="w-full text-sm text-right min-w-[720px]">
            <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
              <tr>
                <th className="p-4 font-bold">סוג</th>
                <th className="p-4 font-bold">שם</th>
                <th className="p-4 font-bold">תפקיד / תיאור</th>
                <th className="p-4 font-bold">תהליך</th>
                <th className="p-4 font-bold">שלב נוכחי</th>
                <th className="p-4 font-bold">טלפון</th>
                <th className="p-4 font-bold">דוא״ל</th>
                <th className="p-4 font-bold">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {openProcesses.map((row) => (
                <tr key={row.rowKey} className="hover:bg-bg-hover/60">
                  <td className="p-4 text-text-muted text-xs font-semibold">
                    {row.kind === 'organization' ? 'חברה' : 'איש קשר'}
                  </td>
                  <td className="p-4">
                    <Link
                      to={profileLink(row)}
                      className="font-semibold text-primary-700 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="p-4 text-text-muted">{row.role}</td>
                  <td className="p-4 font-medium text-text-default">{row.pipelineName}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold border ${row.stageColorClass}`}
                    >
                      {row.stageName}
                    </span>
                  </td>
                  <td className="p-4 text-text-muted" dir="ltr">
                    {row.contact
                      ? primaryPhone(row.contact, 'mobile') || primaryPhone(row.contact, 'office') || '—'
                      : '—'}
                  </td>
                  <td className="p-4 text-text-muted" dir="ltr">
                    {row.contact ? primaryEmail(row.contact) || '—' : '—'}
                  </td>
                  <td className="p-4">
                    <Link
                      to={processManagementLink(row)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-lg transition whitespace-nowrap"
                      title={row.kind === 'organization' ? 'ניהול התהליך' : 'ניהול התהליך'}
                    >
                      ניהול התהליך
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClientContactProcessesTab;
