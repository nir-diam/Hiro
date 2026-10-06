import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon, TrashIcon, EyeIcon } from './Icons';
import ProposalModal from './ProposalModal';
import {
  createProposal,
  deleteProposal,
  fetchProposals,
  updateProposal,
  PROPOSAL_STATUS_LABELS,
  PROPOSALS_UPDATED_EVENT,
  type ProposalDto,
  type ProposalSentHistoryEntry,
  type ProposalStatus,
} from '../services/proposalsApi';

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-green-100 text-green-800 ring-1 ring-green-200',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  converted: 'bg-purple-100 text-purple-700',
};

const formatSentAt = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const ProposalStatusBadge: React.FC<{
  proposal: ProposalDto;
}> = ({ proposal }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const status = (proposal.status as ProposalStatus) || 'draft';
  const label = PROPOSAL_STATUS_LABELS[status] || proposal.status;
  const history: ProposalSentHistoryEntry[] = Array.isArray(proposal.sentHistory)
    ? proposal.sentHistory
    : [];
  const canShowHistory = status === 'sent' && history.length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const chip = (
    <span
      className={`text-xs font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 ${statusStyles[status] || statusStyles.draft}${
        canShowHistory ? ' cursor-pointer hover:brightness-95' : ''
      }`}
      title={canShowHistory ? 'לחצו לצפייה בתאריכי שליחה' : undefined}
    >
      {label}
      {canShowHistory ? (
        <span className="text-[10px] font-semibold opacity-80">({history.length})</span>
      ) : null}
    </span>
  );

  if (!canShowHistory) return chip;

  return (
    <div className="relative inline-block" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        {chip}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-56 max-w-[90vw] bg-bg-card border border-border-default rounded-lg shadow-xl overflow-hidden text-right">
          <div className="px-3 py-2 text-xs font-bold text-text-muted border-b border-border-subtle bg-bg-subtle">
            תאריכי שליחה
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-border-subtle">
                <th className="py-2 px-3 font-semibold text-right w-8">#</th>
                <th className="py-2 px-3 font-semibold text-right">נשלח</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((row, idx) => (
                <tr key={`${row.sentAt}-${idx}`} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 px-3 text-text-muted tabular-nums">{history.length - idx}</td>
                  <td className="py-2 px-3 text-text-default font-medium">{formatSentAt(row.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

type ContactProposalsTabProps = {
  clientId: string;
  contactId: string;
  contactName?: string;
  clientName?: string;
};

const ContactProposalsTab: React.FC<ContactProposalsTabProps> = ({
  clientId,
  contactId,
  contactName,
  clientName,
}) => {
  const [proposals, setProposals] = useState<ProposalDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalDto | null>(null);

  const load = useCallback(async () => {
    if (!clientId || !contactId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProposals({ clientId, contactId });
      setProposals(rows);
    } catch (e) {
      setError((e as Error)?.message || 'שגיאה בטעינת הצעות מחיר');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [clientId, contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdated = () => {
      window.setTimeout(() => void load(), 450);
    };
    window.addEventListener(PROPOSALS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PROPOSALS_UPDATED_EVENT, onUpdated);
  }, [load]);

  const openCreate = () => {
    setSelectedProposal(null);
    setIsModalOpen(true);
  };

  const openEdit = (proposal: ProposalDto) => {
    setSelectedProposal(proposal);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('למחוק הצעת מחיר?')) return;
    try {
      await deleteProposal(id);
      await load();
    } catch (e) {
      alert((e as Error)?.message || 'מחיקה נכשלה');
    }
  };

  return (
    <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
      <header className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-default">הצעות מחיר</h2>
          <p className="text-sm text-text-muted">
            הצעות מחיר שמורות עבור {contactName || 'איש הקשר'}. ניתן לערוך מתוך תבניות ולצרף במייל.
            לאחר שליחה, המייל מופיע גם ב«תקשורת → מיילים אישיים» (מסומן כהצעת מחיר, עם קובץ מצורף כשיש).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-md"
        >
          <PlusIcon className="w-5 h-5" />
          <span>הצעה חדשה</span>
        </button>
      </header>

      {error ? (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}

      <div className="overflow-x-auto border border-border-default rounded-xl">
        <table className="w-full text-sm text-right min-w-[640px]">
          <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default">
            <tr>
              <th className="p-4">מספר הצעה</th>
              <th className="p-4">תאריך</th>
              <th className="p-4">תוקף</th>
              <th className="p-4">סכום</th>
              <th className="p-4">סטטוס</th>
              <th className="p-4 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-text-muted">
                  טוען...
                </td>
              </tr>
            ) : proposals.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-text-muted">
                  אין הצעות מחיר לאיש קשר זה. לחצו «הצעה חדשה» ליצירה מתבנית.
                </td>
              </tr>
            ) : (
              proposals.map((p) => (
                <tr key={p.id} className="hover:bg-bg-hover transition-colors">
                  <td className="p-4 font-mono font-medium">{p.number}</td>
                  <td className="p-4 text-text-muted">
                    {p.date ? new Date(p.date).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="p-4 text-text-muted">
                    {p.validUntil ? new Date(p.validUntil).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="p-4 font-bold">{p.totalAmount || `${p.amount} ${p.currency}`}</td>
                  <td className="p-4">
                    <ProposalStatusBadge proposal={p} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="p-2 text-text-subtle hover:text-primary-600 rounded-lg"
                        title="צפה / ערוך"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(p.id)}
                        className="p-2 text-text-subtle hover:text-red-600 rounded-lg"
                        title="מחק"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ProposalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedProposal(null);
        }}
        onSave={async (data) => {
          const payload = {
            ...data,
            clientId,
            contactId,
          };
          if (selectedProposal?.id) {
            const keepStatus =
              selectedProposal.status === 'sent' &&
              data.status === 'draft' &&
              (selectedProposal.sentHistory?.length || 0) > 0;
            await updateProposal(selectedProposal.id, {
              ...payload,
              ...(keepStatus ? { status: 'sent' as ProposalStatus } : {}),
            });
          } else {
            await createProposal(payload);
          }
          await load();
        }}
        initialData={selectedProposal}
        clientId={clientId}
        contactId={contactId}
        clientName={clientName || contactName}
      />
    </div>
  );
};

export default ContactProposalsTab;
