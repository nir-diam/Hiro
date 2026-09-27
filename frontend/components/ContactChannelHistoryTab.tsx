import React, { useCallback, useEffect, useState } from 'react';
import { DocumentArrowDownIcon, PaperClipIcon, PlusIcon } from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
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
  clientId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
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
  clientId,
  contactId,
  organizationId,
  companyWide = false,
}) => {
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
      const rows = await listOutboundMessageEvents({
        clientId,
        channel,
        contactId: companyWide ? null : contactId,
        contactName: companyWide ? null : contactName,
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
  }, [channel, clientId, companyWide, contactId, contactName, organizationId]);

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

  const openComposer = () => {
    openMessageModal({
      mode: channel,
      recipientType: 'client_contact',
      candidateName: contactName,
      candidatePhone: contactPhone,
      candidateEmail: contactEmail,
      linkedClientId: clientId || null,
      linkedContactId: contactId || null,
      linkedOrganizationId: organizationId || null,
      recipientOptions: contactId
        ? [
            {
              id: contactId,
              name: contactName,
              email: contactEmail || '',
              phone: contactPhone || '',
              clientId: clientId || null,
              organizationId: organizationId || null,
            },
          ]
        : undefined,
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
          onClick={openComposer}
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
                const primary =
                  channel === 'email'
                    ? item.subject || item.title || '(ללא נושא)'
                    : item.body || item.title || '(ללא תוכן)';
                const isOpen = expandedId === item.id;
                return (
                  <React.Fragment key={item.id}>
                    <tr
                      className="border-b border-border-default hover:bg-bg-subtle/60 cursor-pointer"
                      onClick={() => setExpandedId(isOpen ? null : item.id)}
                    >
                      <td className="py-3 px-4 text-text-default max-w-xs truncate" title={primary}>
                        {primary}
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
                      <tr className="border-b border-border-default bg-bg-subtle/40">
                        <td colSpan={companyWide ? 5 : 4} className="py-3 px-4">
                          <div className="space-y-2 text-sm text-text-default whitespace-pre-wrap">
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
