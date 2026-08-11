import React, { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from './Icons';
import ProposalModal, { type ProposalModalSavePayload } from './ProposalModal';
import {
  createProposal,
  fetchProposals,
  updateProposal,
  PROPOSAL_STATUS_LABELS,
  type ProposalDto,
  type ProposalStatus,
} from '../services/proposalsApi';

type Props = {
  clientId: string;
  contactId?: string;
  clientName?: string;
};

const statusClass = (status: string) => {
  switch (status) {
    case 'sent':
      return 'bg-blue-100 text-blue-800';
    case 'accepted':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    case 'converted':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const ContactFinanceTab: React.FC<Props> = ({ clientId, contactId, clientName }) => {
  const [proposals, setProposals] = useState<ProposalDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<ProposalDto | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchProposals({
        clientId,
        contactId: contactId || undefined,
      });
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

  const handleSaveProposal = async (proposalData: ProposalModalSavePayload) => {
    if (editingProposal?.id) {
      await updateProposal(editingProposal.id, proposalData);
    } else {
      await createProposal({
        ...proposalData,
        clientId,
        contactId: contactId || proposalData.contactId || null,
      });
    }
    await load();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border-default pb-4">
        <div className="flex items-center gap-2">
          <button type="button" className="bg-primary-500 text-white px-6 py-2 rounded-lg font-bold text-sm">
            הצעות מחיר
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingProposal(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 text-primary-600 font-bold hover:text-primary-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          הוספה...
        </button>
      </div>

      {error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}

      <div className="bg-white border border-border-default rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-bg-subtle text-text-muted text-sm border-b border-border-default">
                <th className="px-6 py-4 font-semibold w-24">מספר</th>
                <th className="px-6 py-4 font-semibold w-40">תאריך יצירה</th>
                <th className="px-6 py-4 font-semibold">סכום כולל</th>
                <th className="px-6 py-4 font-semibold w-32">סטטוס</th>
                <th className="px-6 py-4 font-semibold w-32">פעולות נוספות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                    טוען...
                  </td>
                </tr>
              ) : proposals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                    אין הצעות מחיר
                  </td>
                </tr>
              ) : (
                proposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-text-default">{proposal.number}</td>
                    <td className="px-6 py-4 text-sm text-text-muted">
                      {proposal.date ? new Date(proposal.date).toLocaleDateString('he-IL') : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-text-default">
                      {proposal.totalAmount || proposal.amount}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass(proposal.status)}`}
                      >
                        {PROPOSAL_STATUS_LABELS[proposal.status as ProposalStatus] || proposal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProposal(proposal);
                          setIsModalOpen(true);
                        }}
                        className="text-primary-600 hover:text-primary-800 text-sm font-bold transition-colors"
                      >
                        צפה
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProposalModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingProposal(null);
        }}
        onSave={handleSaveProposal}
        initialData={editingProposal}
        clientId={clientId}
        contactId={contactId}
        clientName={clientName}
      />
    </div>
  );
};

export default ContactFinanceTab;
