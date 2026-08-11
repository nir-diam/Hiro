import React, { useCallback, useEffect, useState } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  EyeIcon,
} from './Icons';
import ProposalModal from './ProposalModal';
import { useAuth } from '../context/AuthContext';
import {
  createProposal,
  deleteProposal,
  fetchProposals,
  updateProposal,
  PROPOSAL_STATUS_LABELS,
  type ProposalDto,
  type ProposalStatus,
} from '../services/proposalsApi';

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  converted: 'bg-purple-100 text-purple-700',
};

const ProposalsView: React.FC = () => {
  const { user } = useAuth();
  const clientId = user?.clientId || '';
  const [proposals, setProposals] = useState<ProposalDto[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProposals(clientId ? { clientId } : {});
      setProposals(rows);
    } catch (e) {
      setError((e as Error)?.message || 'שגיאה בטעינת הצעות מחיר');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProposals = proposals.filter(
    (p) =>
      (p.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.number || '').includes(searchTerm),
  );

  const formatCurrency = (amount: number, currency = 'ILS') => {
    try {
      return new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return String(amount);
    }
  };

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
    <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default h-full flex flex-col p-6 animate-fade-in">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-default">הצעות מחיר</h2>
          <p className="text-sm text-text-muted">נהל הצעות מחיר ללקוחות והפוך אותן לחשבוניות.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!clientId}
          className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-md disabled:opacity-50"
        >
          <PlusIcon className="w-5 h-5" />
          <span>הצעה חדשה</span>
        </button>
      </header>

      {error ? (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}

      <div className="mb-4 relative max-w-md">
        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="חיפוש לפי לקוח או מספר הצעה..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="overflow-x-auto border border-border-default rounded-xl">
        <table className="w-full text-sm text-right min-w-[800px]">
          <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default">
            <tr>
              <th className="p-4">מספר הצעה</th>
              <th className="p-4">לקוח</th>
              <th className="p-4">תאריך</th>
              <th className="p-4">תוקף</th>
              <th className="p-4">סכום</th>
              <th className="p-4">סטטוס</th>
              <th className="p-4">הערות</th>
              <th className="p-4 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-text-muted">
                  טוען...
                </td>
              </tr>
            ) : filteredProposals.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-text-muted">
                  אין הצעות מחיר
                </td>
              </tr>
            ) : (
              filteredProposals.map((p) => (
                <tr key={p.id} className="hover:bg-bg-hover transition-colors">
                  <td className="p-4 font-mono font-medium">{p.number}</td>
                  <td className="p-4">{p.clientName || '—'}</td>
                  <td className="p-4 text-text-muted">
                    {p.date ? new Date(p.date).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="p-4 text-text-muted">
                    {p.validUntil ? new Date(p.validUntil).toLocaleDateString('he-IL') : '—'}
                  </td>
                  <td className="p-4 font-bold">
                    {p.totalAmount || formatCurrency(Number(p.amount) || 0, p.currency)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${statusStyles[p.status] || statusStyles.draft}`}
                    >
                      {PROPOSAL_STATUS_LABELS[p.status as ProposalStatus] || p.status}
                    </span>
                  </td>
                  <td className="p-4 text-text-muted max-w-[200px] truncate">{p.notes || '—'}</td>
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
          if (selectedProposal?.id) {
            await updateProposal(selectedProposal.id, { ...data, clientId: data.clientId || clientId });
          } else {
            await createProposal({ ...data, clientId: data.clientId || clientId });
          }
          await load();
        }}
        initialData={selectedProposal}
        clientId={clientId}
        clientName={selectedProposal?.clientName}
      />
    </div>
  );
};

export default ProposalsView;
