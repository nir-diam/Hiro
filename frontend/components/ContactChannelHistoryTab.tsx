import React, { useCallback, useEffect, useState } from 'react';
import { DocumentArrowDownIcon, DocumentTextIcon, PaperClipIcon, PlusIcon } from './Icons';
import { MessageModalConfig, type MessageRecipientOption } from '../hooks/useUIState';
import {
  fetchClientContactRecipientOptions,
  mergeMessageRecipientOptions,
} from '../utils/processEntityDrawers';
import { formatAttachmentSize } from '../services/clientAttachmentsApi';
import {
  downloadNotificationMessageAttachment,
  listOutboundMessageEvents,
  type OutboundMessageAttachmentRef,
  type OutboundMessageChannel,
  type OutboundMessageHistoryItem,
} from '../services/clientOutboundMessageApi';

type Props = {
  channel: OutboundMessageChannel;
  title: string;
  icon: React.ReactNode;
  sendLabel: string;
  openMessageModal: (config: MessageModalConfig) => void;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  contactEmails?: string[];
  clientId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
  organizationTmpId?: string | null;
  organizationName?: string | null;
  companyWide?: boolean;
};

const emptyLabel = (channel: OutboundMessageChannel, companyWide: boolean): string => {
  if (channel === 'email') {
    return companyWide ? 'אין מיילי חברה להצגה כרגע' : 'אין מיילים להצגה כרגע';
  }
  if (channel === 'whatsapp') return 'אין הודעות WhatsApp להצגה כרגע';
  return 'אין הודעות SMS להצגה כרגע';
};

const ContactChannelHistoryTab: React.FC<Props> = ({
  channel,
  title,
  icon,
  sendLabel,
  openMessageModal,
  contactName,
  contactPhone,
  contactEmail,
  contactEmails,
  clientId,
  contactId,
  organizationId,
  organizationTmpId,
  organizationName,
  companyWide = false,
}) => {
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const [items, setItems] = useState<OutboundMessageHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingAttachmentKey, setDownloadingAttachmentKey] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const attachmentKey = (itemId: string, attachment: OutboundMessageAttachmentRef) =>
    `${itemId}:${attachment.notificationMessageId}:${attachment.index}`;

  const handleDownloadAttachment = async (
    itemId: string,
    attachment: OutboundMessageAttachmentRef,
  ) => {
    const key = attachmentKey(itemId, attachment);
    setAttachmentError(null);
    setDownloadingAttachmentKey(key);
    try {
      await downloadNotificationMessageAttachment(attachment);
    } catch (e) {
      setAttachmentError((e as Error)?.message || 'הורדת הקובץ נכשלה');
    } finally {
      setDownloadingAttachmentKey(null);
    }
  };

  const load = useCallback(async () => {
    if (!clientId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const emailsForFilter =
        contactEmails && contactEmails.length
          ? contactEmails
          : contactEmail
            ? [contactEmail]
            : [];
      const rows = await listOutboundMessageEvents({
        clientId,
        channel,
        contactId: companyWide ? null : contactId,
        contactEmails: companyWide ? null : emailsForFilter,
        organizationId,
        companyWide,
      });
      setItems(rows);
    } catch (e) {
      setError((e as Error)?.message || 'שגיאה בטעינת היסטוריה');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [channel, clientId, companyWide, contactId, contactEmail, contactEmails, organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onLogged = (evt: Event) => {
      const detail = (evt as CustomEvent<{ clientId?: string; channel?: string }>).detail;
      if (detail?.clientId && clientId && String(detail.clientId) !== String(clientId)) return;
      if (detail?.channel && detail.channel !== channel) return;
      void load();
    };
    window.addEventListener('hiro:outbound-message-logged', onLogged);
    return () => window.removeEventListener('hiro:outbound-message-logged', onLogged);
  }, [channel, clientId, load]);

  const openComposer = async () => {
    const current: MessageRecipientOption | null = contactId
      ? {
          id: contactId,
          name: contactName,
          email: contactEmail || '',
          phone: contactPhone || '',
          subtitle: organizationName || null,
          clientId: clientId || null,
          organizationId: organizationId || null,
        }
      : null;

    let recipientOptions: MessageRecipientOption[] = current ? [current] : [];
    const orgId = String(organizationId || '').trim();
    const orgTmp = String(organizationTmpId || '').trim();
    const hasOrgScope = Boolean(orgId || orgTmp);
    if (clientId && hasOrgScope && apiBase) {
      const fetched = await fetchClientContactRecipientOptions(
        apiBase,
        clientId,
        organizationName || '',
        { organizationId: orgId || null, organizationTmpId: orgTmp || null },
      );
      if (current) {
        recipientOptions = mergeMessageRecipientOptions(fetched, current);
      } else if (fetched.length) {
        recipientOptions = fetched;
      }
    }

    openMessageModal({
      mode: channel,
      recipientType: 'client_contact',
      candidateName: contactName,
      candidatePhone: contactPhone,
      candidateEmail: contactEmail,
      linkedClientId: clientId || null,
      linkedContactId: contactId || null,
      linkedOrganizationId: organizationId || null,
      linkedOrganizationName: organizationName || null,
      recipientOptions: recipientOptions.length ? recipientOptions : undefined,
      initialRecipientIds: contactId ? [contactId] : undefined,
    });
  };

  const primaryColumn =
    channel === 'email' ? 'נושא' : channel === 'whatsapp' ? 'תוכן הודעה' : 'תוכן הודעה';

  return (
    <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default overflow-hidden p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-text-default text-lg flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <button
          type="button"
          onClick={() => void openComposer()}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          {sendLabel}
        </button>
      </div>

      {error ? (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}
      {attachmentError ? (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {attachmentError}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-bg-subtle text-text-muted border-b border-border-default">
            <tr>
              <th className="py-3 px-4 font-semibold rounded-tr-lg">{primaryColumn}</th>
              {companyWide ? <th className="py-3 px-4 font-semibold">איש קשר</th> : null}
              <th className="py-3 px-4 font-semibold">מאת</th>
              <th className="py-3 px-4 font-semibold">תאריך שליחה</th>
              <th className="py-3 px-4 font-semibold">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={companyWide ? 5 : 4} className="py-8 px-4 text-center text-text-muted">
                  טוען...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={companyWide ? 5 : 4} className="py-8 px-4 text-center text-text-muted">
                  {emptyLabel(channel, companyWide)}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isProposalEmail = channel === 'email' && Boolean(item.isProposal);
                const primary =
                  channel === 'email'
                    ? item.subject || item.title || '(ללא נושא)'
                    : item.body || item.title || '(ללא תוכן)';
                const isOpen = expandedId === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className={`border-b border-border-default hover:bg-bg-subtle/60 cursor-pointer ${
                        isProposalEmail ? 'bg-violet-50/50 hover:bg-violet-50/80' : ''
                      }`}
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                    >
                      <td className="py-3 px-4 text-text-default max-w-xs" title={primary}>
                        <div className="flex flex-col gap-1 min-w-0">
                          {isProposalEmail ? (
                            <span className="inline-flex items-center gap-1 w-fit text-[10px] font-bold uppercase tracking-wide text-violet-800 bg-violet-100 border border-violet-200 rounded-md px-1.5 py-0.5">
                              <DocumentTextIcon className="w-3 h-3 shrink-0" />
                              הצעת מחיר
                            </span>
                          ) : null}
                          <span className="truncate font-medium">{primary}</span>
                          {isProposalEmail && item.proposalLabels?.length ? (
                            <span className="text-[11px] text-violet-900/80 truncate">
                              {item.proposalLabels.join(' · ')}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {companyWide ? (
                        <td className="py-3 px-4 text-text-muted">{item.contactName || '—'}</td>
                      ) : null}
                      <td className="py-3 px-4 text-text-muted">{item.sender || '—'}</td>
                      <td className="py-3 px-4 text-text-muted whitespace-nowrap">
                        {item.date ? new Date(item.date).toLocaleString('he-IL') : '—'}
                      </td>
                      <td className="py-3 px-4 text-text-muted">{item.deliveryStatus || 'נשלח'}</td>
                    </tr>
                    {isOpen ? (
                      <tr
                        className={`border-b border-border-default ${
                          isProposalEmail ? 'bg-violet-50/40' : 'bg-bg-subtle/40'
                        }`}
                      >
                        <td colSpan={companyWide ? 5 : 4} className="py-3 px-4">
                          <div className="space-y-2 text-sm text-text-default whitespace-pre-wrap">
                            {isProposalEmail ? (
                              <div className="text-xs font-semibold text-violet-900 flex items-center gap-1.5 pb-1 border-b border-violet-100">
                                <DocumentTextIcon className="w-4 h-4" />
                                מייל עם הצעת מחיר
                                {item.proposalLabels?.length
                                  ? ` — ${item.proposalLabels.join(', ')}`
                                  : ''}
                              </div>
                            ) : null}
                            <div className="text-text-muted">אל: {item.to || '—'}</div>
                            {channel === 'email' && item.subject ? (
                              <div className="font-semibold">{item.subject}</div>
                            ) : null}
                            <div>{item.body || '(ללא תוכן)'}</div>
                            {channel === 'email' && item.attachments.length > 0 ? (
                              <div className="pt-3 mt-3 border-t border-border-default">
                                <div className="text-text-muted text-xs font-semibold mb-2 flex items-center gap-1.5">
                                  <PaperClipIcon className="w-4 h-4" />
                                  קבצים מצורפים ({item.attachments.length})
                                </div>
                                <ul className="flex flex-wrap gap-2">
                                  {item.attachments.map((attachment) => {
                                    const key = attachmentKey(item.id, attachment);
                                    const isDownloading = downloadingAttachmentKey === key;
                                    return (
                                      <li
                                        key={key}
                                        className="inline-flex items-center gap-2 max-w-full rounded-lg border border-border-default bg-bg-card px-3 py-2"
                                      >
                                        <span className="truncate font-medium max-w-[14rem]">
                                          {attachment.filename}
                                        </span>
                                        {attachment.size ? (
                                          <span className="text-xs text-text-muted shrink-0">
                                            {formatAttachmentSize(Math.max(1, Math.ceil(attachment.size / 1024)))}
                                          </span>
                                        ) : null}
                                        <button
                                          type="button"
                                          disabled={isDownloading}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDownloadAttachment(item.id, attachment);
                                          }}
                                          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border-default bg-bg-subtle px-2 py-1 text-xs font-semibold text-text-default hover:bg-bg-card disabled:opacity-60"
                                        >
                                          <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                                          {isDownloading ? 'מוריד...' : 'הורדה'}
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContactChannelHistoryTab;
