
import React, { useState, useEffect, useRef, useId, useCallback, useMemo } from 'react';
import {
    XMarkIcon,
    CalendarDaysIcon,
    ClockIcon,
    Microsoft365Icon,
    OutlookTaskIcon,
    GoogleCalendarIcon,
    ClipboardDocumentCheckIcon,
    ChevronDownIcon,
    PaperClipIcon,
    TrashIcon,
    ArrowUpTrayIcon,
} from './Icons';
import { formatAttachmentSize } from '../services/clientAttachmentsApi';
import type { SendNotificationEmailAttachment } from '../services/emailSendApi';
import { applyClientLogoToEmailAttachments } from '../utils/emailAttachmentLogoStamp';
import type { Candidate } from './CandidatesListView';
import { deriveLocalCandidateId } from '../utils/candidateId';
import { EMPTY_LINKED_LABEL } from '../utils/taskLinkedContext';
import {
  hasNewTaskLinkedOverrideContent,
  type NewTaskLinkedOverride,
} from '../utils/newTaskLinkedContext';
import { useAuth } from '../context/AuthContext';
import {
    requestNotificationInboxCountsRefresh,
    type NotificationInboxRefreshDetail,
} from '../services/notificationInboxCounts';
import {
    fetchEventTypes,
    filterEventTypesForContext,
    type EventTypeApiRow,
} from '../services/eventTypesApi';
import {
    fetchStaffUsers,
    mapStaffUsersToEmailOptions,
    type StaffEmailOption,
} from '../services/usersApi';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => void;
  onOpenCandidateSummary: (candidate: Candidate | number) => void;
  pathname: string;
  /** Selected journal event / screen context when URL has no entity route. */
  linkedOverride?: NewTaskLinkedOverride | null;
}

type TaskLinkedRoute =
  | { kind: 'none' }
  | { kind: 'candidate'; id: string }
  | { kind: 'job'; id: string }
  | { kind: 'client'; id: string }
  | { kind: 'contact'; clientId: string; contactId: string }
  | { kind: 'organization'; id: string }
  | { kind: 'organization_tmp'; id: string };

function parseTaskLinkedRoute(pathname: string): TaskLinkedRoute {
  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === 'candidates' && parts[1] && parts[1] !== 'new') {
    return { kind: 'candidate', id: parts[1] };
  }
  if (parts[0] === 'admin' && parts[1] === 'candidates' && parts[2]) {
    return { kind: 'candidate', id: parts[2] };
  }
  if (parts[0] === 'jobs') {
    if (parts[1] === 'edit' && parts[2]) return { kind: 'job', id: parts[2] };
    if (parts[1] && (parts[2] === 'publish' || parts[2] === 'screen')) {
      return { kind: 'job', id: parts[1] };
    }
  }
  if (parts[0] === 'portal' && parts[1] === 'manager' && parts[2] === 'jobs' && parts[3]) {
    return { kind: 'job', id: parts[3] };
  }
  if (parts[0] === 'organizations') {
    if (parts[1] === 'tmp' && parts[2]) return { kind: 'organization_tmp', id: parts[2] };
    if (parts[1] && parts[1] !== 'new') return { kind: 'organization', id: parts[1] };
  }
  if (parts[0] === 'clients' && parts[1] && parts[1] !== 'new') {
    if (parts[2] === 'contacts' && parts[3]) {
      return { kind: 'contact', clientId: parts[1], contactId: parts[3] };
    }
    return { kind: 'client', id: parts[1] };
  }
  return { kind: 'none' };
}

function candidateFromApiRow(row: Record<string, unknown>): Candidate {
  const backendId = String(row.id ?? '');
  const fullName = String(row.fullName ?? '');
  return {
    id: deriveLocalCandidateId(backendId),
    backendId: backendId || undefined,
    name: fullName,
    avatar: String(row.profilePicture ?? ''),
    title: String(row.title ?? ''),
    status: String(row.status ?? ''),
    lastActivity: String(row.lastActivity ?? row.lastActive ?? ''),
    source: String(row.source ?? ''),
    tags: [],
    internalTags: Array.isArray(row.internalTags) ? (row.internalTags as string[]) : [],
    matchScore: typeof row.matchScore === 'number' ? row.matchScore : 0,
    phone: String(row.phone ?? ''),
  };
}

function organizationLinkedPlainLines(orgName: string, clientName = ''): { label: string; value: string }[] {
    const v = (s: string) => (String(s ?? '').trim() || EMPTY_LINKED_LABEL);
    return [
        { label: 'ארגון:', value: v(orgName) },
        { label: 'מועמד:', value: EMPTY_LINKED_LABEL },
        { label: 'משרה:', value: EMPTY_LINKED_LABEL },
        { label: 'לקוח:', value: v(clientName) },
    ];
}

function fixedLinkedPlainLines(
    candidate: string,
    job: string,
    client: string,
    contact?: string,
): { label: string; value: string }[] {
    const v = (s: string) => (String(s ?? '').trim() || EMPTY_LINKED_LABEL);
    const lines = [
        { label: 'מועמד:', value: v(candidate) },
        { label: 'משרה:', value: v(job) },
        { label: 'לקוח:', value: v(client) },
    ];
    if (contact !== undefined) {
        lines.push({ label: 'איש קשר:', value: v(contact) });
    }
    return lines;
}

function contactNameFromRow(row: Record<string, unknown> | undefined): string {
    if (!row) return '';
    const name = String(row.name ?? '').trim();
    if (name) return name;
    const first = String(row.firstName ?? '').trim();
    const last = String(row.lastName ?? '').trim();
    return [first, last].filter(Boolean).join(' ');
}

function jsonHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

const CAL_EVENT_DURATION_MS = 60 * 60 * 1000;

type CalendarFormSlice = {
  messageText: string;
  assigneeEmails: string[];
  category: string;
  dueDate: string;
  dueTime: string;
  sla: string;
  allocatedDays: number;
};

function parseDueAsLocalRange(dueDate: string, dueTime: string): { start: Date; end: Date } | null {
  if (!dueDate?.trim()) return null;
  const timePart = dueTime?.trim() && /^\d{1,2}:\d{2}/.test(dueTime) ? dueTime.trim() : '09:00';
  const [th, tm] = timePart.split(':').map((x) => Number(x));
  const [y, m, d] = dueDate.split('-').map((x) => Number(x));
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, Number.isFinite(th) ? th : 0, Number.isFinite(tm) ? tm : 0, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  return { start, end: new Date(start.getTime() + CAL_EVENT_DURATION_MS) };
}

function buildCalendarEventMeta(form: CalendarFormSlice, isTaskMode: boolean) {
  const subjectBase = isTaskMode ? 'משימה חדשה' : 'תזכורת';
  const title = `${subjectBase}: ${form.category || 'כללי'}`;

  const lines: string[] = [];
  if (form.messageText.trim()) lines.push(form.messageText.trim());
  if (form.assigneeEmails.length) lines.push(`למען: ${form.assigneeEmails.join(', ')}`);
  lines.push(`קטגוריה: ${form.category || 'כללי'}`);
  if (isTaskMode) {
    lines.push(`דחיפות: ${form.sla}`);
    lines.push(`ימים מוקצים: ${form.allocatedDays}`);
  }
  const body = lines.join('\n\n');

  const parsed = parseDueAsLocalRange(form.dueDate, form.dueTime);
  const now = new Date();
  const start = parsed?.start ?? now;
  const end = parsed?.end ?? new Date(now.getTime() + CAL_EVENT_DURATION_MS);

  return { title, body, start, end };
}

function formatGoogleDates(start: Date, end: Date): string {
  const p = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}${m}${day}T${h}${min}${s}`;
  };
  return `${p(start)}/${p(end)}`;
}

/** Local datetime string for Outlook / Microsoft 365 compose (no timezone suffix). */
function formatOutlookLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}:${s}`;
}

function openGoogleCalendarFromMeta(meta: ReturnType<typeof buildCalendarEventMeta>, guestEmails?: string[]) {
  const dates = formatGoogleDates(meta.start, meta.end);
  let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meta.title)}&details=${encodeURIComponent(
    meta.body,
  )}&dates=${dates}`;
  for (const g of guestEmails || []) {
    const guest = g?.trim();
    if (guest && guest.includes('@')) {
      url += `&add=${encodeURIComponent(guest)}`;
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function openOutlookCalendarFromMeta(meta: ReturnType<typeof buildCalendarEventMeta>, workAccount: boolean) {
  const startdt = formatOutlookLocalIso(meta.start);
  const enddt = formatOutlookLocalIso(meta.end);
  const base = workAccount
    ? 'https://outlook.office.com/calendar/0/deeplink/compose'
    : 'https://outlook.live.com/calendar/0/deeplink/compose';
  const q = new URLSearchParams({
    subject: meta.title,
    body: meta.body,
    startdt,
    enddt,
    allday: 'false',
  });
  window.open(`${base}?${q.toString()}`, '_blank', 'noopener,noreferrer');
}

const SingleRangeSlider: React.FC<{
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name: string;
    unit?: string;
    className?: string;
}> = ({ label, min, max, step, value, onChange, name, unit = '', className='' }) => {
    const valuePercent = ((value - min) / (max - min)) * 100;
    const id = useId();

    return (
        <div className={className}>
            <div className="flex justify-between items-center mb-1">
                <label id={id} className="text-xs font-semibold text-text-muted">{label}</label>
                <span className="text-xs font-bold text-primary-700 tabular-nums">{value}{unit}</span>
            </div>
            <div className="relative h-5 flex items-center px-1">
                <div className="absolute w-full h-1 bg-bg-subtle rounded-full">
                    <div
                        className="absolute h-1 bg-primary-500 rounded-full"
                        style={{ width: `${valuePercent}%` }}
                    ></div>
                </div>
                <input
                    type="range" min={min} max={max} step={step} value={value} name={name} onChange={onChange}
                    aria-labelledby={id}
                    className="absolute w-full h-1 appearance-none bg-transparent cursor-pointer"
                />
            </div>
        </div>
    );
};


type LinkedPanel =
    | { phase: 'none' }
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | {
          phase: 'ok';
          rows: { label: string; node: React.ReactNode }[];
          /** Same fields as UI, for appending to outgoing email body */
          plainLines: { label: string; value: string }[];
      };

function linkedValueNode(
    value: string,
    link?: { href: string } | { onClick: () => void },
): React.ReactNode {
    if (value === EMPTY_LINKED_LABEL) {
        return <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>;
    }
    if (link && 'href' in link) {
        return (
            <a
                href={link.href}
                className="text-primary-600 font-bold hover:underline"
                onClick={(e) => e.stopPropagation()}
            >
                {value}
            </a>
        );
    }
    if (link && 'onClick' in link) {
        return (
            <button
                type="button"
                onClick={link.onClick}
                className="text-primary-600 font-bold hover:underline text-right hover:text-primary-700 transition-colors"
            >
                {value}
            </button>
        );
    }
    return <span className="text-text-default font-semibold">{value}</span>;
}

function buildLinkedPanelFromOverride(
    override: NewTaskLinkedOverride,
    openCandidate: (candidate: Candidate | number) => void,
): Extract<LinkedPanel, { phase: 'ok' }> {
    const v = (s: string | undefined) => (String(s ?? '').trim() || EMPTY_LINKED_LABEL);
    const rows: { label: string; node: React.ReactNode }[] = [];
    const plainLines: { label: string; value: string }[] = [];

    const pushRow = (
        label: string,
        raw: string | undefined,
        node: React.ReactNode,
    ) => {
        const value = v(raw);
        plainLines.push({ label, value });
        rows.push({ label, node });
    };

    if (override.linkedOrganizationLabel) {
        const orgLabel = v(override.linkedOrganizationLabel);
        pushRow(
            'ארגון:',
            override.linkedOrganizationLabel,
            linkedValueNode(
                orgLabel,
                override.linkedOrganizationId
                    ? { href: `/organizations/${encodeURIComponent(override.linkedOrganizationId)}` }
                    : undefined,
            ),
        );
    }

    const candLabel = override.linkedCandidateLabel ? v(override.linkedCandidateLabel) : EMPTY_LINKED_LABEL;
    if (override.linkedCandidateLabel) {
        pushRow(
            'מועמד:',
            override.linkedCandidateLabel,
            linkedValueNode(
                candLabel,
                override.linkedCandidateBackendId
                    ? {
                          onClick: () =>
                              openCandidate({
                                  id: deriveLocalCandidateId(override.linkedCandidateBackendId!),
                                  backendId: override.linkedCandidateBackendId,
                                  name: override.linkedCandidateLabel || '',
                                  avatar: '',
                                  title: '',
                                  status: '',
                                  lastActivity: '',
                                  source: '',
                                  tags: [],
                                  internalTags: [],
                                  matchScore: 0,
                                  phone: '',
                              }),
                      }
                    : undefined,
            ),
        );
    } else {
        pushRow('מועמד:', undefined, linkedValueNode(EMPTY_LINKED_LABEL));
    }

    const jobLabel = override.linkedJobLabel ? v(override.linkedJobLabel) : EMPTY_LINKED_LABEL;
    pushRow(
        'משרה:',
        override.linkedJobLabel,
        linkedValueNode(
            jobLabel,
            override.linkedJobId
                ? { href: `/jobs/edit/${encodeURIComponent(override.linkedJobId)}` }
                : undefined,
        ),
    );

    const clientLabel = v(override.linkedClientLabel);
    pushRow(
        'לקוח:',
        override.linkedClientLabel,
        linkedValueNode(
            clientLabel,
            override.linkedClientId
                ? { href: `/clients/${encodeURIComponent(override.linkedClientId)}` }
                : undefined,
        ),
    );

    if (override.linkedContactLabel && !override.linkedCandidateLabel) {
        const contactLabel = v(override.linkedContactLabel);
        pushRow(
            'איש קשר:',
            override.linkedContactLabel,
            linkedValueNode(
                contactLabel,
                override.linkedClientId && override.linkedContactId
                    ? {
                          href: `/clients/${encodeURIComponent(override.linkedClientId)}/contacts/${encodeURIComponent(override.linkedContactId)}`,
                      }
                    : undefined,
            ),
        );
    }

    if (override.stageLabel) {
        pushRow('שלב:', override.stageLabel, linkedValueNode(v(override.stageLabel)));
    }

    return { phase: 'ok', rows, plainLines };
}

function linkFieldsFromOverride(override: NewTaskLinkedOverride): Record<string, string | number> {
    const out: Record<string, string | number> = {};
    if (override.linkedCandidateBackendId) {
        out.linkedCandidateBackendId = override.linkedCandidateBackendId;
        out.linkedCandidateLocalId = deriveLocalCandidateId(override.linkedCandidateBackendId);
    }
    if (override.linkedJobId) out.linkedJobId = override.linkedJobId;
    if (override.linkedClientId) out.linkedClientId = override.linkedClientId;
    if (override.linkedContactId) out.linkedContactId = override.linkedContactId;
    if (override.linkedOrganizationId) out.linkedOrganizationId = override.linkedOrganizationId;
    return out;
}

function linkLabelsFromOverride(override: NewTaskLinkedOverride): Record<string, string> {
    const out: Record<string, string> = {};
    if (override.linkedOrganizationLabel) out.linkedOrganizationLabel = override.linkedOrganizationLabel;
    if (override.linkedCandidateLabel) out.linkedCandidateLabel = override.linkedCandidateLabel;
    if (override.linkedJobLabel) out.linkedJobLabel = override.linkedJobLabel;
    if (override.linkedClientLabel) out.linkedClientLabel = override.linkedClientLabel;
    if (override.linkedContactLabel) out.linkedContactLabel = override.linkedContactLabel;
    return out;
}

function guessAttachmentContentType(filename: string): string {
    const ext = String(filename || '').split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        txt: 'text/plain',
        csv: 'text/csv',
        zip: 'application/zip',
    };
    return map[ext] || 'application/octet-stream';
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(reader.error || new Error('קריאת קובץ נכשלה'));
        reader.readAsDataURL(file);
    });
}

async function buildTaskAttachments(files: File[]): Promise<SendNotificationEmailAttachment[]> {
    const out: SendNotificationEmailAttachment[] = [];
    for (const file of files) {
        out.push({
            filename: file.name,
            content: await fileToBase64(file),
            contentType: file.type || guessAttachmentContentType(file.name),
        });
    }
    return out;
}

function buildEmailBodyWithLinkedContext(messageText: string, plainLines: { label: string; value: string }[]): string {
    const main = (messageText || '').trim();
    if (!plainLines.length) return main;
    const block = plainLines.map((l) => `${l.label} ${l.value}`.trim()).join('\n');
    const appendix = `---\nמידע מקושר מהמערכת:\n${block}`;
    return main ? `${main}\n\n${appendix}` : appendix;
}

const NewTaskModal: React.FC<NewTaskModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onOpenCandidateSummary,
    pathname,
    linkedOverride = null,
}) => {
    const { user } = useAuth();
    const [isTaskMode, setIsTaskMode] = useState(false);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [linkedPanel, setLinkedPanel] = useState<LinkedPanel>({ phase: 'none' });
    const openSummaryRef = useRef(onOpenCandidateSummary);
    openSummaryRef.current = onOpenCandidateSummary;
    const [contactsLoading, setContactsLoading] = useState(false);
    const [clientContactOptions, setClientContactOptions] = useState<StaffEmailOption[]>([]);
    const [flightCategories, setFlightCategories] = useState<EventTypeApiRow[]>([]);

    useEffect(() => {
        if (!isOpen || !apiBase) return;
        let cancelled = false;
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        (async () => {
            try {
                const rows = await fetchEventTypes(apiBase, token);
                if (cancelled) return;
                setFlightCategories(filterEventTypesForContext(rows, 'flight'));
            } catch {
                if (!cancelled) setFlightCategories([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, apiBase]);
    const [formData, setFormData] = useState({
        messageText: '',
        assigneeEmails: [] as string[],
        category: 'כללי',
        dueDate: '',
        dueTime: '',
        submissionPopup: false,
        submissionEmail: true,
        sla: 'בינונית' as 'נמוכה' | 'בינונית' | 'גבוהה',
        allocatedDays: 3,
    });
    const modalRef = useRef<HTMLDivElement>(null);
    const assigneePickerRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
    const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const attachmentFileInputRef = useRef<HTMLInputElement>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const contentId = useId();
    const attachmentInputId = useId();

    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day}`;

            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const formattedTime = `${hours}:${minutes}`;

            setFormData({
                messageText: '',
                assigneeEmails: [],
                category: 'כללי',
                dueDate: formattedDate,
                dueTime: formattedTime,
                submissionPopup: false,
                submissionEmail: true,
                sla: 'בינונית',
                allocatedDays: 3,
            });
            setIsTaskMode(false);
            setAttachmentFiles([]);
            if (attachmentFileInputRef.current) attachmentFileInputRef.current.value = '';
            
            previouslyFocusedElement.current = document.activeElement as HTMLElement;
            setTimeout(() => closeButtonRef.current?.focus(), 100);

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Tab' && modalRef.current) {
                    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (event.shiftKey) { // Shift+Tab
                        if (document.activeElement === firstElement) {
                            lastElement.focus();
                            event.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            event.preventDefault();
                        }
                    }
                } else if (event.key === 'Escape') {
                    onClose();
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                previouslyFocusedElement.current?.focus();
            };
        }
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;

        const loadCoordinators = async () => {
            const tenantClientId = user?.clientId ? String(user.clientId).trim() : '';
            if (!tenantClientId) {
                setClientContactOptions([]);
                return;
            }

            setContactsLoading(true);
            try {
                const rows = await fetchStaffUsers(tenantClientId);
                const options = mapStaffUsersToEmailOptions(rows);

                if (!active) return;
                setClientContactOptions(options);

                // If user didn't pick anything yet, default to the first available email.
                setFormData((prev) => {
                    const me = user?.email?.trim();
                    const first = options[0]?.email;
                    if (me) {
                        if (prev.assigneeEmails.length === 0) return { ...prev, assigneeEmails: [me] };
                        if (
                            prev.assigneeEmails.length === 1 &&
                            first &&
                            prev.assigneeEmails[0] === first &&
                            me.toLowerCase() !== first.toLowerCase()
                        ) {
                            return { ...prev, assigneeEmails: [me] };
                        }
                        return prev;
                    }
                    if (prev.assigneeEmails.length > 0) return prev;
                    return { ...prev, assigneeEmails: first ? [first] : [] };
                });
            } catch (err) {
                console.error('[NewTaskModal] Failed to load coordinators for assignee', err);
                if (!active) return;
                setClientContactOptions([]);
            } finally {
                if (!active) return;
                setContactsLoading(false);
            }
        };

        void loadCoordinators();
        return () => {
            active = false;
        };
    }, [isOpen, user?.email, user?.name, user?.clientId]);

    const orderedContactOptions = useMemo(() => {
        const me = user?.email?.trim();
        const meLower = me?.toLowerCase();
        const myName = user?.name?.trim();
        const list = clientContactOptions.map((o) => ({ ...o }));
        if (!meLower) return list;
        const idx = list.findIndex((o) => o.email.toLowerCase() === meLower);
        if (idx >= 0) {
            const [row] = list.splice(idx, 1);
            const labelWithSelf = row.label.includes('(את/ה)') ? row.label : `${row.label} (את/ה)`;
            list.unshift({ email: row.email, label: labelWithSelf });
            return list;
        }
        const selfLabel = myName ? `${myName} (את/ה) (${me})` : `${me} (את/ה)`;
        list.unshift({ email: me, label: selfLabel });
        return list;
    }, [clientContactOptions, user?.email, user?.name]);

    const toggleAssigneeEmail = useCallback((email: string) => {
        const e = email.trim();
        if (!e) return;
        setFormData((prev) => {
            const next = new Set(prev.assigneeEmails.map((x) => x.trim()).filter(Boolean));
            if (next.has(e)) {
                if (next.size <= 1) return prev;
                next.delete(e);
            } else {
                next.add(e);
            }
            return { ...prev, assigneeEmails: Array.from(next) };
        });
    }, []);

    const assigneeSummary = useMemo(() => {
        const emails = formData.assigneeEmails;
        if (!emails.length) return 'בחרו נמענים…';
        const labels = emails.map((addr) => {
            const o = orderedContactOptions.find((x) => x.email.toLowerCase() === addr.toLowerCase());
            return o?.label || addr;
        });
        const joined = labels.join(' · ');
        if (joined.length > 72) return `${joined.slice(0, 69)}…`;
        return joined;
    }, [formData.assigneeEmails, orderedContactOptions]);

    useEffect(() => {
        if (!isOpen) setAssigneeDropdownOpen(false);
    }, [isOpen]);

    useEffect(() => {
        if (!assigneeDropdownOpen) return;
        const onDocMouseDown = (e: MouseEvent) => {
            const el = assigneePickerRef.current;
            if (el && !el.contains(e.target as Node)) setAssigneeDropdownOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [assigneeDropdownOpen]);

    useEffect(() => {
        if (!assigneeDropdownOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setAssigneeDropdownOpen(false);
            }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [assigneeDropdownOpen]);

    useEffect(() => {
        if (!isOpen || !apiBase) return;

        if (hasNewTaskLinkedOverrideContent(linkedOverride)) {
            setLinkedPanel(buildLinkedPanelFromOverride(linkedOverride!, (c) => openSummaryRef.current(c)));
            return;
        }

        const route = parseTaskLinkedRoute(pathname);
        if (route.kind === 'none') {
            setLinkedPanel({ phase: 'none' });
            return;
        }

        let cancelled = false;
        setLinkedPanel({ phase: 'loading' });

        const fail = (message: string) => {
            if (!cancelled) setLinkedPanel({ phase: 'error', message });
        };

        const run = async () => {
            try {
                if (route.kind === 'candidate') {
                    const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(route.id)}`, {
                        credentials: 'include',
                        cache: 'no-store',
                        headers: jsonHeaders(),
                    });
                    if (!res.ok) {
                        const t = await res.text().catch(() => '');
                        fail(t || `HTTP ${res.status}`);
                        return;
                    }
                    const row = (await res.json()) as Record<string, unknown>;
                    if (cancelled) return;
                    const cand = candidateFromApiRow(row);
                    const name = cand.name || 'מועמד';
                    const plainLines = fixedLinkedPlainLines(name, cand.title || '', '');
                    const candLabel = plainLines[0].value;
                    const jobLabel = plainLines[1].value;
                    const clientLabel = plainLines[2].value;
                    setLinkedPanel({
                        phase: 'ok',
                        rows: [
                            {
                                label: 'מועמד:',
                                node:
                                    candLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => openSummaryRef.current(cand)}
                                            className="text-primary-600 font-bold hover:underline text-right hover:text-primary-700 transition-colors"
                                        >
                                            {candLabel}
                                        </button>
                                    ),
                            },
                            {
                                label: 'משרה:',
                                node: <span className="text-text-default font-semibold">{jobLabel}</span>,
                            },
                            {
                                label: 'לקוח:',
                                node: <span className="text-text-default font-semibold">{clientLabel}</span>,
                            },
                        ],
                        plainLines,
                    });
                    return;
                }

                if (route.kind === 'job') {
                    const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(route.id)}`, {
                        credentials: 'include',
                        cache: 'no-store',
                        headers: jsonHeaders(),
                    });
                    if (!res.ok) {
                        const t = await res.text().catch(() => '');
                        fail(t || `HTTP ${res.status}`);
                        return;
                    }
                    const row = (await res.json()) as Record<string, unknown>;
                    if (cancelled) return;
                    const title =
                        String(row.publicJobTitle || row.title || '').trim() || 'משרה';
                    const client = String(row.client || '').trim();
                    const plainLines = fixedLinkedPlainLines('', title, client);
                    const candLabel = plainLines[0].value;
                    const jobLabel = plainLines[1].value;
                    const clientLabel = plainLines[2].value;
                    setLinkedPanel({
                        phase: 'ok',
                        rows: [
                            {
                                label: 'מועמד:',
                                node: <span className="text-text-default font-semibold">{candLabel}</span>,
                            },
                            {
                                label: 'משרה:',
                                node:
                                    jobLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : (
                                        <a
                                            href={`/jobs/edit/${encodeURIComponent(route.id)}`}
                                            className="text-primary-600 font-bold hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {jobLabel}
                                        </a>
                                    ),
                            },
                            {
                                label: 'לקוח:',
                                node: <span className="text-text-default font-semibold">{clientLabel}</span>,
                            },
                        ],
                        plainLines,
                    });
                    return;
                }

                if (route.kind === 'client') {
                    const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(route.id)}`, {
                        credentials: 'include',
                        cache: 'no-store',
                        headers: jsonHeaders(),
                    });
                    if (!res.ok) {
                        const t = await res.text().catch(() => '');
                        fail(t || `HTTP ${res.status}`);
                        return;
                    }
                    const row = (await res.json()) as Record<string, unknown>;
                    if (cancelled) return;
                    const name =
                        String(row.displayName || row.name || '').trim() || 'לקוח';
                    const plainLines = fixedLinkedPlainLines('', '', name);
                    const candLabel = plainLines[0].value;
                    const jobLabel = plainLines[1].value;
                    const clientLabel = plainLines[2].value;
                    setLinkedPanel({
                        phase: 'ok',
                        rows: [
                            {
                                label: 'מועמד:',
                                node: <span className="text-text-default font-semibold">{candLabel}</span>,
                            },
                            {
                                label: 'משרה:',
                                node: <span className="text-text-default font-semibold">{jobLabel}</span>,
                            },
                            {
                                label: 'לקוח:',
                                node:
                                    clientLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : (
                                        <a
                                            href={`/clients/${encodeURIComponent(route.id)}`}
                                            className="text-primary-600 font-bold hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {clientLabel}
                                        </a>
                                    ),
                            },
                        ],
                        plainLines,
                    });
                    return;
                }

                if (route.kind === 'contact') {
                    const [cRes, listRes] = await Promise.all([
                        fetch(`${apiBase}/api/clients/${encodeURIComponent(route.clientId)}`, {
                            credentials: 'include',
                            cache: 'no-store',
                            headers: jsonHeaders(),
                        }),
                        fetch(`${apiBase}/api/clients/${encodeURIComponent(route.clientId)}/contacts`, {
                            credentials: 'include',
                            cache: 'no-store',
                            headers: jsonHeaders(),
                        }),
                    ]);
                    if (!cRes.ok) {
                        const t = await cRes.text().catch(() => '');
                        fail(t || `HTTP ${cRes.status}`);
                        return;
                    }
                    if (!listRes.ok) {
                        const t = await listRes.text().catch(() => '');
                        fail(t || `HTTP ${listRes.status}`);
                        return;
                    }
                    const clientRow = (await cRes.json()) as Record<string, unknown>;
                    const contacts = (await listRes.json()) as Record<string, unknown>[];
                    if (cancelled) return;
                    const clientName =
                        String(clientRow.displayName || clientRow.name || '').trim() || 'לקוח';
                    const contactRow = contacts.find(
                        (c) => String(c.id ?? '') === String(route.contactId),
                    );
                    const contactName = contactNameFromRow(contactRow);
                    const plainLines = fixedLinkedPlainLines('', '', clientName, contactName);
                    const candLabel = plainLines[0].value;
                    const jobLabel = plainLines[1].value;
                    const clientLabel = plainLines[2].value;
                    const contactLabel = plainLines[3].value;
                    setLinkedPanel({
                        phase: 'ok',
                        rows: [
                            {
                                label: 'מועמד:',
                                node: <span className="text-text-default font-semibold">{candLabel}</span>,
                            },
                            {
                                label: 'משרה:',
                                node: <span className="text-text-default font-semibold">{jobLabel}</span>,
                            },
                            {
                                label: 'לקוח:',
                                node:
                                    clientLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : (
                                        <a
                                            href={`/clients/${encodeURIComponent(route.clientId)}`}
                                            className="text-primary-600 font-bold hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {clientLabel}
                                        </a>
                                    ),
                            },
                            {
                                label: 'איש קשר:',
                                node:
                                    contactLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : (
                                        <a
                                            href={`/clients/${encodeURIComponent(route.clientId)}/contacts/${encodeURIComponent(route.contactId)}`}
                                            className="text-primary-600 font-bold hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {contactLabel}
                                        </a>
                                    ),
                            },
                        ],
                        plainLines,
                    });
                    return;
                }

                if (route.kind === 'organization' || route.kind === 'organization_tmp') {
                    const orgUrl =
                        route.kind === 'organization_tmp'
                            ? `${apiBase}/api/organizations/tmp/${encodeURIComponent(route.id)}`
                            : `${apiBase}/api/organizations/${encodeURIComponent(route.id)}`;
                    const orgRes = await fetch(orgUrl, {
                        credentials: 'include',
                        cache: 'no-store',
                        headers: jsonHeaders(),
                    });
                    if (!orgRes.ok) {
                        const t = await orgRes.text().catch(() => '');
                        fail(t || `HTTP ${orgRes.status}`);
                        return;
                    }
                    const orgRow = (await orgRes.json()) as Record<string, unknown>;
                    if (cancelled) return;

                    let clientName = '';
                    let clientId: string | null = null;
                    if (route.kind === 'organization') {
                        try {
                            const pcRes = await fetch(
                                `${apiBase}/api/organizations/${encodeURIComponent(route.id)}/primary-client`,
                                {
                                    credentials: 'include',
                                    cache: 'no-store',
                                    headers: jsonHeaders(),
                                },
                            );
                            if (pcRes.ok) {
                                const pc = (await pcRes.json()) as Record<string, unknown>;
                                clientId = pc.clientId ? String(pc.clientId) : null;
                                clientName = String(pc.clientName || '').trim();
                            }
                        } catch {
                            /* optional enrichment */
                        }
                    }

                    const orgName = String(orgRow.name || '').trim() || 'ארגון';
                    const orgHref =
                        route.kind === 'organization_tmp'
                            ? `/organizations/tmp/${encodeURIComponent(route.id)}`
                            : `/organizations/${encodeURIComponent(route.id)}`;
                    const plainLines = organizationLinkedPlainLines(orgName, clientName);
                    const orgLabel = plainLines[0].value;
                    const candLabel = plainLines[1].value;
                    const jobLabel = plainLines[2].value;
                    const clientLabel = plainLines[3].value;

                    setLinkedPanel({
                        phase: 'ok',
                        rows: [
                            {
                                label: 'ארגון:',
                                node:
                                    orgLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : (
                                        <a
                                            href={orgHref}
                                            className="text-primary-600 font-bold hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {orgLabel}
                                        </a>
                                    ),
                            },
                            {
                                label: 'מועמד:',
                                node: <span className="text-text-default font-semibold">{candLabel}</span>,
                            },
                            {
                                label: 'משרה:',
                                node: <span className="text-text-default font-semibold">{jobLabel}</span>,
                            },
                            {
                                label: 'לקוח:',
                                node:
                                    clientLabel === EMPTY_LINKED_LABEL ? (
                                        <span className="text-text-default font-semibold">{EMPTY_LINKED_LABEL}</span>
                                    ) : clientId ? (
                                        <a
                                            href={`/clients/${encodeURIComponent(clientId)}`}
                                            className="text-primary-600 font-bold hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {clientLabel}
                                        </a>
                                    ) : (
                                        <span className="text-text-default font-semibold">{clientLabel}</span>
                                    ),
                            },
                        ],
                        plainLines,
                    });
                }
            } catch (e: unknown) {
                fail(e instanceof Error ? e.message : 'שגיאת רשת');
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [isOpen, apiBase, pathname, linkedOverride]);

    const openExternalCalendar = useCallback(
        (target: 'google' | 'outlook365' | 'outlook') => {
            let meta = buildCalendarEventMeta(formData, isTaskMode);
            if (linkedPanel.phase === 'ok' && linkedPanel.plainLines.length > 0) {
                const block = linkedPanel.plainLines.map((l) => `${l.label} ${l.value}`.trim()).join('\n');
                meta = {
                    ...meta,
                    body: `${meta.body}\n\n---\nמידע מקושר מהמערכת:\n${block}`,
                };
            }
            const guests = formData.assigneeEmails.filter((x) => x.includes('@'));
            if (target === 'google') {
                openGoogleCalendarFromMeta(meta, guests.length ? guests : undefined);
                return;
            }
            openOutlookCalendarFromMeta(meta, target === 'outlook365');
        },
        [formData, isTaskMode, linkedPanel],
    );

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'range') {
             setFormData(prev => ({ ...prev, [name]: Number(value) }));
             return;
        }

        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData(prev => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };

    const handleAttachmentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList?.length) return;
        const picked: File[] = [];
        for (let i = 0; i < fileList.length; i += 1) {
            const file = fileList.item(i);
            if (file) picked.push(file);
        }
        setAttachmentFiles((prev) => {
            const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
            const next = [...prev];
            for (const file of picked) {
                const key = `${file.name}:${file.size}:${file.lastModified}`;
                if (seen.has(key)) continue;
                seen.add(key);
                next.push(file);
            }
            return next;
        });
        e.target.value = '';
    };

    const removeAttachmentFile = (index: number) => {
        setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        if (attachmentFiles.length && !formData.submissionEmail) {
            alert('כדי לשלוח קבצים מצורפים, יש להפעיל "תזכורת מייל".');
            return;
        }

        const linkedPlain =
            linkedPanel.phase === 'ok' && linkedPanel.plainLines.length > 0 ? linkedPanel.plainLines : [];
        const fullMessageText = buildEmailBodyWithLinkedContext(formData.messageText, linkedPlain);
        const route = parseTaskLinkedRoute(pathname);
        const useOverride = hasNewTaskLinkedOverrideContent(linkedOverride);
        const linkFields: Record<string, string | number> = useOverride
            ? linkFieldsFromOverride(linkedOverride!)
            : {};
        if (!useOverride) {
            if (route.kind === 'candidate') {
                linkFields.linkedCandidateBackendId = route.id;
                linkFields.linkedCandidateLocalId = deriveLocalCandidateId(route.id);
            } else if (route.kind === 'job') {
                linkFields.linkedJobId = route.id;
            } else if (route.kind === 'client') {
                linkFields.linkedClientId = route.id;
            } else if (route.kind === 'contact') {
                linkFields.linkedClientId = route.clientId;
                linkFields.linkedContactId = route.contactId;
            } else if (route.kind === 'organization') {
                linkFields.linkedOrganizationId = route.id;
            } else if (route.kind === 'organization_tmp') {
                linkFields.linkedOrganizationTmpId = route.id;
            }
        }
        const linkLabels = useOverride
            ? linkLabelsFromOverride(linkedOverride!)
            : linkedPlain.length >= 3
              ? {
                    ...(linkedPlain[0]?.label.startsWith('ארגון:')
                        ? { linkedOrganizationLabel: linkedPlain[0].value }
                        : { linkedCandidateLabel: linkedPlain[0].value }),
                    linkedJobLabel:
                        linkedPlain.find((l) => l.label.startsWith('משרה:'))?.value ?? linkedPlain[1]?.value ?? '',
                    linkedClientLabel:
                        linkedPlain.find((l) => l.label.startsWith('לקוח:'))?.value ?? linkedPlain[2]?.value ?? '',
                    ...(linkedPlain.find((l) => l.label.startsWith('איש קשר:'))
                        ? { linkedContactLabel: linkedPlain.find((l) => l.label.startsWith('איש קשר:'))!.value }
                        : {}),
                }
              : {};
        let emailAttachments: SendNotificationEmailAttachment[] = [];
        if (attachmentFiles.length) {
            try {
                emailAttachments = await buildTaskAttachments(attachmentFiles);
                emailAttachments = await applyClientLogoToEmailAttachments(emailAttachments);
            } catch (attachErr: unknown) {
                alert(
                    attachErr instanceof Error ? attachErr.message : 'הכנת הקבצים המצורפים נכשלה',
                );
                return;
            }
        }

        const taskPayload = {
            ...formData,
            messageText: fullMessageText,
            isTask: isTaskMode,
            ...linkFields,
            ...linkLabels,
            attachmentCount: emailAttachments.length,
            attachmentNames: emailAttachments.map((a) => a.filename),
        };

        let postedToServer = false;
        let refreshFocusTab: NotificationInboxRefreshDetail['focusTab'] | undefined;
        const onNotificationsPage = pathname.replace(/\/$/, '') === '/notifications';
        if (apiBase) {
            setIsSubmitting(true);
            try {
                const me = user?.email?.trim();
                const meNorm = me ? me.toLowerCase() : '';
                const assignees = formData.assigneeEmails.map((x) => x.trim()).filter((x) => x.includes('@'));
                const to = assignees.length ? assignees : me ? [me] : [];
                const sentOnlyToSelf =
                    Boolean(meNorm) &&
                    to.length > 0 &&
                    to.every((email) => email.trim().toLowerCase() === meNorm);
                if (onNotificationsPage) {
                    refreshFocusTab = sentOnlyToSelf
                        ? isTaskMode
                            ? 'tasks'
                            : 'all'
                        : 'sent';
                }
                if (!to.length) {
                    throw new Error('בחרו נמען או ודאו שחשבון המשתמש כולל אימייל');
                }
                if (formData.submissionEmail && !assignees.length) {
                    throw new Error('בחר לפחות נמען אחד ב"למען" לשליחת מייל');
                }
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

                const subjectBase = isTaskMode ? 'משימה חדשה' : 'תזכורת';
                const subject = `${subjectBase}: ${formData.category || 'כללי'}`;

                const res = await fetch(`${apiBase}/api/email-uploads/send`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        to,
                        subject,
                        text: fullMessageText,
                        isTask: isTaskMode,
                        messageType: isTaskMode ? 'task' : 'message',
                        assignee: to[0] || '',
                        category: formData.category,
                        dueDate: formData.dueDate,
                        dueTime: formData.dueTime,
                        submissionPopup: formData.submissionPopup,
                        submissionEmail: formData.submissionEmail,
                        sla: isTaskMode ? formData.sla : null,
                        allocatedDays: isTaskMode ? formData.allocatedDays : null,
                        taskPayload,
                        skipSmtp: !formData.submissionEmail,
                        attachments: emailAttachments.length ? emailAttachments : undefined,
                    }),
                });

                if (!res.ok) {
                    const t = await res.text().catch(() => '');
                    throw new Error(t || `HTTP ${res.status}`);
                }
                postedToServer = true;
            } catch (err: any) {
                console.error('[NewTaskModal] create / send failed', err);
                alert(err?.message || 'שמירת הפעילות נכשלה');
                setIsSubmitting(false);
                return;
            } finally {
                setIsSubmitting(false);
            }
        }

        if (postedToServer) {
            requestNotificationInboxCountsRefresh({
                reloadNotificationList: true,
                focusTab: refreshFocusTab,
            });
        }
        onSave(taskPayload);
    };

    const fieldClass =
        'w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block py-2 px-2.5 transition-all shadow-sm';
    const labelClass = 'block text-xs font-bold text-text-default mb-1';

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden border border-border-default/50"
                onClick={e => e.stopPropagation()}
                style={{ animation: 'modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                    <header className="flex items-center justify-between px-4 py-3 border-b border-border-default/50 bg-bg-subtle/30 flex-shrink-0">
                        <div>
                            <h2 id={titleId} className="text-lg font-black text-text-default tracking-tight leading-tight">
                                יצירת פעילות חדשה
                            </h2>
                            <p className="text-[11px] text-text-muted mt-0.5">הודעה · תזכורת · משימה</p>
                        </div>
                         <button ref={closeButtonRef} type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default transition-colors" aria-label="סגור">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </header>

                    <main className="px-4 py-3 bg-bg-card overflow-hidden">
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-3">
                            {/* Controls column (RTL start) */}
                            <div className="space-y-2.5 order-2 lg:order-1 min-w-0">
                                <div className="relative" ref={assigneePickerRef}>
                                    <label className={labelClass}>
                                        למען <span className="text-text-muted font-normal">(מספר נמענים)</span>
                                    </label>
                                    {contactsLoading ? (
                                        <div className={`${fieldClass} min-h-[36px] flex items-center text-text-muted`}>
                                            טוען רכזים…
                                        </div>
                                    ) : orderedContactOptions.length === 0 ? (
                                        <p className="text-xs text-amber-700 py-1">לא נמצאו רכזים ללקוח המחובר.</p>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setAssigneeDropdownOpen((o) => !o)}
                                                aria-expanded={assigneeDropdownOpen}
                                                aria-haspopup="listbox"
                                                className={`${fieldClass} min-h-[36px] flex items-center justify-between gap-2 text-right hover:border-primary-300`}
                                            >
                                                <span className="truncate flex-1 min-w-0">{assigneeSummary}</span>
                                                <ChevronDownIcon
                                                    className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${assigneeDropdownOpen ? 'rotate-180' : ''}`}
                                                />
                                            </button>
                                            {assigneeDropdownOpen && (
                                                <div
                                                    role="listbox"
                                                    className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border-default bg-bg-card shadow-lg p-1.5 space-y-0.5"
                                                >
                                                    {orderedContactOptions.map((opt) => {
                                                        const checked = formData.assigneeEmails.includes(opt.email);
                                                        return (
                                                            <label
                                                                key={opt.email}
                                                                className="flex items-start gap-2 cursor-pointer text-xs text-text-default hover:bg-bg-subtle/80 rounded-md px-2 py-1"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    className="mt-0.5 w-3.5 h-3.5 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                                                    checked={checked}
                                                                    onChange={() => toggleAssigneeEmail(opt.email)}
                                                                />
                                                                <span className="leading-snug break-all">{opt.label}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className={labelClass}>קטגוריה</label>
                                        <select name="category" value={formData.category} onChange={handleChange} className={fieldClass}>
                                            <option value="כללי">כללי</option>
                                            {flightCategories.map((cat) => (
                                                <option key={cat.id} value={cat.name}>
                                                    {cat.name}
                                                </option>
                                            ))}
                                            {formData.category &&
                                                formData.category !== 'כללי' &&
                                                !flightCategories.some((c) => c.name === formData.category) && (
                                                <option value={formData.category}>{formData.category}</option>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>במועד</label>
                                        <div className="relative">
                                            <CalendarDaysIcon className="w-4 h-4 text-text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className={`${fieldClass} pr-8`} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>שעה</label>
                                        <div className="relative">
                                            <ClockIcon className="w-4 h-4 text-text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input type="time" name="dueTime" value={formData.dueTime} onChange={handleChange} className={`${fieldClass} pr-8`} />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsTaskMode(!isTaskMode)}
                                        className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border ${
                                            isTaskMode
                                                ? 'bg-primary-50 border-primary-500 text-primary-700'
                                                : 'bg-bg-card border-border-default text-text-default hover:bg-bg-subtle hover:border-primary-300'
                                        }`}
                                    >
                                        <ClipboardDocumentCheckIcon className={`w-4 h-4 ${isTaskMode ? 'text-primary-600' : 'text-text-muted'}`} />
                                        <span>{isTaskMode ? 'משימה' : 'הפוך למשימה'}</span>
                                    </button>
                                    {isTaskMode ? (
                                        <div className="animate-content-fade-in flex flex-wrap items-end gap-2 flex-1 min-w-[12rem]">
                                            <div className="w-[7.5rem] shrink-0">
                                                <label className={labelClass}>דחיפות</label>
                                                <select name="sla" value={formData.sla} onChange={handleChange} className={fieldClass}>
                                                    <option>נמוכה</option>
                                                    <option>בינונית</option>
                                                    <option>גבוהה</option>
                                                </select>
                                            </div>
                                            <SingleRangeSlider
                                                label="ימים מוקצים"
                                                min={1}
                                                max={30}
                                                step={1}
                                                value={formData.allocatedDays}
                                                onChange={handleChange}
                                                name="allocatedDays"
                                                unit=" ימים"
                                                className="flex-1 min-w-[8rem]"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="p-2.5 rounded-xl border border-border-default/80 bg-bg-subtle/30 space-y-2">
                                        <h3 className="text-xs font-bold text-text-default">התראות וזימונים</h3>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                            <label className="flex items-center gap-2 text-xs font-medium text-text-default cursor-pointer group">
                                                <input type="checkbox" name="submissionEmail" checked={formData.submissionEmail} onChange={handleChange} className="w-4 h-4 text-primary-600 bg-bg-input border-border-default rounded focus:ring-primary-500 cursor-pointer" />
                                                <span className="group-hover:text-primary-700">תזכורת מייל</span>
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-medium text-text-default cursor-pointer group">
                                                <input type="checkbox" name="submissionPopup" checked={formData.submissionPopup} onChange={handleChange} className="w-4 h-4 text-primary-600 bg-bg-input border-border-default rounded focus:ring-primary-500 cursor-pointer" />
                                                <span className="group-hover:text-primary-700">התראה קופצת</span>
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                title="Microsoft 365"
                                                aria-label="פתח בלוח שנה Microsoft 365"
                                                onClick={() => openExternalCalendar('outlook365')}
                                                className="p-1.5 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition-all"
                                            >
                                                <Microsoft365Icon className="w-5 h-5" />
                                            </button>
                                            <button
                                                type="button"
                                                title="Outlook"
                                                aria-label="פתח בלוח שנה Outlook אישי"
                                                onClick={() => openExternalCalendar('outlook')}
                                                className="p-1.5 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition-all"
                                            >
                                                <OutlookTaskIcon className="w-5 h-5" />
                                            </button>
                                            <button
                                                type="button"
                                                title="Google Calendar"
                                                aria-label="פתח ב-Google Calendar"
                                                onClick={() => openExternalCalendar('google')}
                                                className="p-1.5 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition-all"
                                            >
                                                <GoogleCalendarIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-2.5 rounded-xl border border-border-default/80 bg-bg-subtle/30 min-h-0">
                                        <h3 className="text-xs font-bold text-text-default mb-1.5">מידע מקושר</h3>
                                        {linkedPanel.phase === 'none' && (
                                            <p className="text-[11px] text-text-muted leading-snug">אין הקשר מהמסך הנוכחי.</p>
                                        )}
                                        {linkedPanel.phase === 'loading' && (
                                            <p className="text-[11px] text-text-muted">טוען…</p>
                                        )}
                                        {linkedPanel.phase === 'error' && (
                                            <p className="text-[11px] text-red-600 leading-snug">{linkedPanel.message}</p>
                                        )}
                                        {linkedPanel.phase === 'ok' && linkedPanel.rows.length > 0 && (
                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] items-center">
                                                {linkedPanel.rows.map((r, i) => (
                                                    <React.Fragment key={`${r.label}-${i}`}>
                                                        <span className="font-medium text-text-muted truncate">{r.label}</span>
                                                        <div className="text-right min-w-0 truncate [&_a]:text-primary-600 [&_button]:text-primary-600 [&_span]:text-text-default">{r.node}</div>
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        )}
                                        {linkedPanel.phase === 'ok' && linkedPanel.rows.length === 0 && (
                                            <p className="text-[11px] text-text-muted">לא נמצאו שדות.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Content column (RTL end) */}
                            <div className="flex flex-col min-h-0 order-1 lg:order-2">
                                <label htmlFor={contentId} className={labelClass}>תוכן הפעילות</label>
                                <textarea
                                    id={contentId}
                                    name="messageText"
                                    value={formData.messageText}
                                    onChange={handleChange as any}
                                    rows={5}
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition-all shadow-sm resize-none leading-snug"
                                    placeholder="כתוב כאן את תוכן ההודעה או המשימה..."
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                        id={attachmentInputId}
                                        ref={attachmentFileInputRef}
                                        type="file"
                                        multiple
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.zip"
                                        onChange={handleAttachmentInputChange}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => attachmentFileInputRef.current?.click()}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-md transition-colors shrink-0"
                                    >
                                        <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                                        צרף קובץ
                                    </button>
                                    {attachmentFiles.length === 0 ? (
                                        <span className="text-[11px] text-text-muted">PDF, Word, תמונות…</span>
                                    ) : (
                                        attachmentFiles.map((file, index) => (
                                            <span
                                                key={`${file.name}-${file.size}-${file.lastModified}`}
                                                className="inline-flex items-center gap-1 max-w-[180px] pl-2 pr-1 py-0.5 rounded-full border border-border-default bg-bg-subtle/50 text-[11px]"
                                            >
                                                <PaperClipIcon className="w-3 h-3 text-text-muted shrink-0" />
                                                <span className="truncate font-medium">{file.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachmentFile(index)}
                                                    className="p-0.5 rounded-full text-text-muted hover:text-red-600 hover:bg-red-50 shrink-0"
                                                    aria-label={`הסר ${file.name}`}
                                                >
                                                    <TrashIcon className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </main>

                    <footer className="flex justify-end items-center px-4 py-3 bg-bg-subtle/50 border-t border-border-default/50 flex-shrink-0 gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-default hover:bg-bg-hover rounded-lg transition-colors">
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition-all shadow-sm text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'שולח…' : isTaskMode ? 'צור משימה' : 'שליחה'}
                        </button>
                    </footer>
                </form>
                <style>{`
                    @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                    @keyframes contentFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                    .animate-content-fade-in { animation: contentFadeIn 0.3s ease-out forwards; }
                    input[type=range]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        pointer-events: all;
                        width: 20px;
                        height: 20px;
                        background-color: rgb(var(--color-bg-card));
                        border-radius: 50%;
                        border: 4px solid var(--color-primary-500);
                        cursor: pointer;
                        margin-top: -8px;
                    }
                    input[type=range]::-moz-range-thumb {
                        pointer-events: all;
                        width: 12px;
                        height: 12px;
                        background-color: rgb(var(--color-bg-card));
                        border-radius: 50%;
                        border: 4px solid var(--color-primary-500);
                        cursor: pointer;
                    }
                `}</style>
            </div>
        </div>
    );
};

export default NewTaskModal;
