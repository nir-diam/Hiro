
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStaffUsers, type StaffUserDto } from '../services/usersApi';
import type { Candidate } from './CandidatesListView';
import { useAuth } from '../context/AuthContext';
import { 
    ClipboardDocumentListIcon, ChatBubbleOvalLeftEllipsisIcon, InformationCircleIcon, ArchiveBoxIcon, 
    CheckCircleIcon, MagnifyingGlassIcon, ArrowLeftIcon, ArrowUturnLeftIcon, ChevronDownIcon, XMarkIcon,
    ClockIcon, UserGroupIcon
} from './Icons';

import {
    NOTIFICATION_MESSAGES_REFRESH_EVENT,
    NOTIFICATION_MESSAGE_ID_REGEX,
    requestNotificationInboxCountsRefresh,
} from '../services/notificationInboxCounts';
import { deriveLocalCandidateId } from '../utils/candidateId';
import {
    EMPTY_LINKED_LABEL,
    parseLegacyLinkedAppendix,
    stripTaskLinkedAppendixFromBody,
} from '../utils/taskLinkedContext';

// --- TYPES ---
type NotificationType = 'task' | 'message' | 'system';
type NotificationStatus = 'New' | 'In Progress' | 'Done';

/** Advanced status filter: טופל / לא טופל (`metadata.taskCompleted` — משימות והודעות). לא קשור לנקרא. */
const NOTIFICATION_READ_FILTER_PENDING = 'pending';
const NOTIFICATION_READ_FILTER_DONE = 'done_read';

const ADVANCED_FILTER_FIELD_LABELS: Record<string, string> = {
    sender: 'שולח',
    recipient: 'מקבל',
    status: 'סטטוס',
    category: 'קטגוריה',
    linkedClient: 'לקוח',
    fromDate: 'מתאריך',
    toDate: 'עד תאריך',
};

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  timestamp: string; // Creation date
  dueDate?: string; // Due date for tasks
  /** טופל — `metadata.taskCompleted` (גם להודעות) */
  handledComplete: boolean;
  sender: string;
  recipient: string;
  assignee?: string;
  toEmail?: string;
  recipientReadAt?: string;
  senderUserId?: string | null;
  status: NotificationStatus;
  category: 'כללי' | 'גיוס' | 'מכירות';
  urgency?: 'נמוכה' | 'בינונית' | 'גבוהה';
  linkedCandidateId?: number;
  /** DB UUID for drawer fetch (when local id alone is insufficient). */
  linkedCandidateBackendId?: string;
  linkedJobId?: string;
  linkedClientId?: string;
  linkedContactId?: string;
  linkedClient?: string;
  /** תצוגה מתוך taskPayload (מידע מקושר — 3 שורות קבועות) */
  linkedCandidateLabel?: string;
  linkedJobLabel?: string;
  linkedClientLabel?: string;
  backendStatus: 'unread' | 'tasks' | 'archived' | 'deleted';
  /** Client-only: expanded once in ארכיון (tasks have no separate “read” API). */
  viewedInArchive?: boolean;
}

const notificationStyles: { [key in NotificationType]: { icon: React.ReactNode; bg: string; text: string; } } = {
    task: { icon: <ClipboardDocumentListIcon className="w-5 h-5" />, bg: 'bg-primary-100', text: 'text-primary-600' },
    message: { icon: <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5" />, bg: 'bg-secondary-100', text: 'text-secondary-600' },
    system: { icon: <InformationCircleIcon className="w-5 h-5" />, bg: 'bg-accent-100', text: 'text-accent-600' },
};

function formatRelativeTime(dateString?: string) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(',', '');
}

// Calculate task status based on due date
function getTaskUrgencyState(dueDateStr?: string): 'overdue' | 'soon' | 'future' | 'none' {
    if (!dueDateStr) return 'none';
    
    const now = new Date();
    const due = new Date(dueDateStr);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) return 'overdue';
    if (diffHours <= 48) return 'soon';
    return 'future';
}

function formatDueDate(dueDateStr?: string) {
    if (!dueDateStr) return '';
    const date = new Date(dueDateStr);
    if (Number.isNaN(date.getTime())) return '';
    const urgency = getTaskUrgencyState(dueDateStr);
    
    if (urgency === 'overdue') {
        const diffTime = Math.abs(new Date().getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return `באיחור של ${diffDays} ימים`;
    }
    
    if (urgency === 'soon') {
        const today = new Date();
        if (date.getDate() === today.getDate()) {
            return `היום ב-${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        return 'מחר';
    }

    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

/** Prefer API `senderName` / `senderEmail`; never show raw sender UUIDs. */
function formatNotificationSender(row: {
    senderName?: string | null;
    senderEmail?: string | null;
    senderUserId?: string | null;
}): string {
    const name = row.senderName != null ? String(row.senderName).trim() : '';
    const email = row.senderEmail != null ? String(row.senderEmail).trim() : '';
    if (name && email) return `${name} (${email})`;
    if (name) return name;
    if (email) return email;
    if (row.senderUserId) return 'משתמש לא זמין';
    return 'מערכת';
}

const NOTIFICATION_PREVIEW_MAX_WORDS = 6;

/** Collapsed row preview: first N words, then "..." (full body only when expanded). */
function truncatedPreviewWords(text: string, maxWords = NOTIFICATION_PREVIEW_MAX_WORDS): string {
    const raw = String(text ?? '').trim();
    if (!raw) return '';
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return raw;
    return `${words.slice(0, maxWords).join(' ')}...`;
}

function emailInCommaSeparatedField(field: string, emailNorm: string): boolean {
    const norm = String(emailNorm || '').trim().toLowerCase();
    if (!norm) return false;
    return String(field || '')
        .split(/[,;\n]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .includes(norm);
}

/** Mirrors backend `notificationRecipientMatchesViewer` (email in assignee or toEmail; or assignee equals viewer name). */
function notificationRecipientMatchesViewer(
    notification: Pick<Notification, 'assignee' | 'toEmail'>,
    email?: string | null,
    name?: string | null
): boolean {
    const emailNorm = (email || '').trim().toLowerCase();
    const nameNorm = (name || '').trim().toLowerCase();
    const assigneeWhole = String(notification.assignee || '').trim().toLowerCase();
    if (emailNorm) {
        if (emailInCommaSeparatedField(notification.toEmail || '', emailNorm)) return true;
        if (emailInCommaSeparatedField(notification.assignee || '', emailNorm)) return true;
    }
    if (nameNorm && assigneeWhole === nameNorm) return true;
    return false;
}

interface NotificationCenterProps {
    onOpenCandidateSummary: (candidateId: number) => void;
}

type AssignAnchor = { top: number; left: number; bottom: number; right: number; width: number; height: number };

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onOpenCandidateSummary }) => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const openLinkedCandidate = (n: Notification) => {
        const backend = n.linkedCandidateBackendId?.trim();
        if (backend) {
            const minimal: Candidate = {
                id: n.linkedCandidateId ?? deriveLocalCandidateId(backend),
                backendId: backend,
                name:
                    n.linkedCandidateLabel && n.linkedCandidateLabel !== EMPTY_LINKED_LABEL
                        ? n.linkedCandidateLabel
                        : '',
                avatar: '',
                title: '',
                status: '',
                lastActivity: '',
                source: '',
                tags: [],
                internalTags: [],
                matchScore: 0,
                phone: '',
            };
            onOpenCandidateSummary(minimal);
        } else if (n.linkedCandidateId != null) {
            onOpenCandidateSummary(n.linkedCandidateId);
        }
    };
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [archivedNotifications, setArchivedNotifications] = useState<Notification[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'unread' | 'archived'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
    const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
    const [isAssignMenuOpen, setIsAssignMenuOpen] = useState(false);
    const [assignMenuAnchor, setAssignMenuAnchor] = useState<AssignAnchor | null>(null);
    const [assigneeOptions, setAssigneeOptions] = useState<StaffUserDto[]>([]);
    const [staffUsersLoading, setStaffUsersLoading] = useState(false);
    const [tempSelectedAgents, setTempSelectedAgents] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const assignPanelRef = useRef<HTMLDivElement>(null);
    const bulkAssignBtnRef = useRef<HTMLButtonElement>(null);
    const loadNotificationsRef = useRef<(() => Promise<void>) | null>(null);
    
    const initialAdvancedFilters = {
        sender: '',
        recipient: '',
        status: NOTIFICATION_READ_FILTER_PENDING,
        category: '',
        fromDate: '',
        toDate: '',
        linkedClient: '',
    };
    const [advancedFilters, setAdvancedFilters] = useState(initialAdvancedFilters);
    
    useEffect(() => {
        if (!isAssignMenuOpen) return;
        const handlePointer = (event: MouseEvent) => {
            const t = event.target as Node;
            if (assignPanelRef.current?.contains(t)) return;
            if (bulkAssignBtnRef.current?.contains(t)) return;
            setIsAssignMenuOpen(false);
            setAssignMenuAnchor(null);
            setTempSelectedAgents([]);
        };
        document.addEventListener('mousedown', handlePointer);
        window.addEventListener('scroll', handlePointer, true);
        return () => {
            document.removeEventListener('mousedown', handlePointer);
            window.removeEventListener('scroll', handlePointer, true);
        };
    }, [isAssignMenuOpen]);

    useEffect(() => {
        if (!isAssignMenuOpen || !apiBase) return;
        let cancelled = false;
        setStaffUsersLoading(true);
        void fetchStaffUsers()
            .then((rows) => {
                if (cancelled) return;
                setAssigneeOptions(rows.filter((u) => u.isActive !== false));
            })
            .catch(() => {
                if (!cancelled) setAssigneeOptions([]);
            })
            .finally(() => {
                if (!cancelled) setStaffUsersLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isAssignMenuOpen, apiBase]);

    const assignPopoverLayout = useMemo(() => {
        if (!assignMenuAnchor) return null;
        const POPOVER_W = 288;
        const maxH = typeof window !== 'undefined' ? Math.min(320, window.innerHeight - 24) : 320;
        let top = assignMenuAnchor.bottom + 8;
        if (typeof window !== 'undefined' && top + maxH > window.innerHeight - 8) {
            top = Math.max(8, assignMenuAnchor.top - maxH - 8);
        }
        let left = assignMenuAnchor.left;
        if (typeof window !== 'undefined') {
            left = Math.min(left, window.innerWidth - POPOVER_W - 8);
            left = Math.max(8, left);
        }
        return { top, left, width: POPOVER_W, maxHeight: maxH };
    }, [assignMenuAnchor]);

    useEffect(() => {
        if (!apiBase) return;
        let active = true;

        const mapCategory = (value: unknown): Notification['category'] => {
            if (value === 'גיוס' || value === 'מכירות') return value;
            return 'כללי';
        };

        const mapUrgency = (value: unknown): Notification['urgency'] => {
            if (value === 'נמוכה' || value === 'בינונית' || value === 'גבוהה') return value;
            return undefined;
        };

        const loadNotifications = async () => {
            setIsLoading(true);
            setLoadError('');
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                const response = await fetch(`${apiBase}/api/email-uploads/messages`, {
                    method: 'GET',
                    cache: 'no-store',
                    credentials: 'include',
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                });

                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    throw new Error(text || `HTTP ${response.status}`);
                }

                const rows: any[] = await response.json();
                if (!active) return;

                const mapped: Notification[] = (Array.isArray(rows) ? rows : []).flatMap((row) => {
                    const backendId = String(row?.id || row?.notificationMessageId || '').trim();
                    if (!NOTIFICATION_MESSAGE_ID_REGEX.test(backendId)) {
                        return [];
                    }
                    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                    const tp =
                        metadata.taskPayload &&
                        typeof metadata.taskPayload === 'object' &&
                        !Array.isArray(metadata.taskPayload)
                            ? (metadata.taskPayload as Record<string, unknown>)
                            : {};
                    let linkedCandidateId: number | undefined;
                    const linkedCandidateBackendIdRaw =
                        tp.linkedCandidateBackendId != null ? String(tp.linkedCandidateBackendId).trim() : '';
                    const linkedCandidateBackendId =
                        linkedCandidateBackendIdRaw || undefined;
                    if (typeof tp.linkedCandidateLocalId === 'number') linkedCandidateId = tp.linkedCandidateLocalId;
                    else if (linkedCandidateBackendId) {
                        linkedCandidateId = deriveLocalCandidateId(linkedCandidateBackendId);
                    }
                    const linkedJobId = tp.linkedJobId != null ? String(tp.linkedJobId).trim() : undefined;
                    const linkedClientId = tp.linkedClientId != null ? String(tp.linkedClientId).trim() : undefined;
                    const linkedContactId = tp.linkedContactId != null ? String(tp.linkedContactId).trim() : undefined;
                    const rawText = String(row?.text || row?.html || '');
                    const legacyLinked = parseLegacyLinkedAppendix(rawText);
                    const linkedCandidateLabel =
                        typeof tp.linkedCandidateLabel === 'string'
                            ? tp.linkedCandidateLabel
                            : legacyLinked.candidate;
                    const linkedJobLabel =
                        typeof tp.linkedJobLabel === 'string' ? tp.linkedJobLabel : legacyLinked.job;
                    const linkedClientLabel =
                        typeof tp.linkedClientLabel === 'string'
                            ? tp.linkedClientLabel
                            : legacyLinked.client;
                    const handledComplete = Boolean(metadata?.taskCompleted);
                    const recipientReadRaw = metadata?.recipientReadAt;
                    const recipientReadAt =
                        recipientReadRaw != null && String(recipientReadRaw).trim() !== ''
                            ? String(recipientReadRaw)
                            : undefined;
                    const isTask = Boolean(row?.isTask) || row?.messageType === 'task';
                    const status: NotificationStatus = handledComplete ? 'Done' : 'New';

                    return [{
                        id: backendId,
                        type: isTask ? 'task' : 'message',
                        title: String(row?.subject || 'הודעה חדשה'),
                        content: rawText,
                        timestamp: String(row?.createdAt || new Date().toISOString()),
                        dueDate: row?.dueDate ? String(row.dueDate) : undefined,
                        handledComplete,
                        sender: formatNotificationSender(row),
                        recipient: String(row?.assignee || row?.toEmail || ''),
                        assignee: row?.assignee != null ? String(row.assignee) : '',
                        toEmail: row?.toEmail != null ? String(row.toEmail) : '',
                        recipientReadAt,
                        senderUserId: row?.senderUserId != null ? String(row.senderUserId) : null,
                        status,
                        category: mapCategory(row?.category),
                        urgency: mapUrgency(row?.sla),
                        linkedClient: undefined,
                        linkedCandidateId,
                        linkedCandidateBackendId,
                        linkedJobId: linkedJobId || undefined,
                        linkedClientId: linkedClientId || undefined,
                        linkedContactId: linkedContactId || undefined,
                        linkedCandidateLabel,
                        linkedJobLabel,
                        linkedClientLabel,
                        backendStatus: row?.status === 'tasks' || row?.status === 'archived' || row?.status === 'deleted' ? row.status : 'unread',
                    }];
                });

                setNotifications(mapped.filter((n) => n.backendStatus !== 'archived' && n.backendStatus !== 'deleted'));
                setArchivedNotifications(mapped.filter((n) => n.backendStatus === 'archived'));
            } catch (error: any) {
                if (!active) return;
                setLoadError(error?.message || 'טעינת הודעות נכשלה');
            } finally {
                if (!active) return;
                setIsLoading(false);
            }
        };

        loadNotificationsRef.current = loadNotifications;
        void loadNotifications();
        return () => {
            active = false;
            loadNotificationsRef.current = null;
        };
    }, [apiBase]);

    useEffect(() => {
        const onRefresh = (e: Event) => {
            const d = (e as CustomEvent<{ reloadNotificationList?: boolean }>).detail;
            if (d?.reloadNotificationList) {
                void loadNotificationsRef.current?.();
            }
        };
        window.addEventListener(NOTIFICATION_MESSAGES_REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(NOTIFICATION_MESSAGES_REFRESH_EVENT, onRefresh);
    }, []);

    /** Tab badges: רק פריטים שלא סומנו כטופל — בלי קשר לנקרא/לא נקרא. */
    const allUnreadCount = useMemo(
        () =>
            notifications.filter((n) => {
                if (n.type === 'task') return n.backendStatus === 'tasks' && !n.handledComplete;
                if (n.type === 'message') return !n.handledComplete;
                return false;
            }).length,
        [notifications]
    );
    const unreadMessagesCount = useMemo(
        () => notifications.filter((n) => n.type === 'message' && !n.handledComplete).length,
        [notifications]
    );
    const openUnreadTasksCount = useMemo(
        () => notifications.filter((n) => n.backendStatus === 'tasks' && !n.handledComplete).length,
        [notifications]
    );

    const persistNotificationPatch = async (
        id: string,
        body: {
            status?: 'unread' | 'tasks' | 'archived' | 'deleted';
            taskCompleted?: boolean;
            markRecipientRead?: boolean;
            dueDate?: string | null;
            dueTime?: string | null;
        }
    ): Promise<{ metadata?: { recipientReadAt?: string; taskCompleted?: boolean } } & Record<string, unknown>> => {
        if (!apiBase) throw new Error('חסר כתובת API');
        if (!NOTIFICATION_MESSAGE_ID_REGEX.test(id)) {
            throw new Error(`Invalid notification id: ${id}`);
        }
        const payload: Record<string, unknown> = {};
        if (body.status !== undefined) payload.status = body.status;
        if (body.taskCompleted !== undefined) payload.taskCompleted = body.taskCompleted;
        if (body.markRecipientRead !== undefined) payload.markRecipientRead = body.markRecipientRead;
        if (body.dueDate !== undefined) payload.dueDate = body.dueDate;
        if (body.dueTime !== undefined) payload.dueTime = body.dueTime;
        if (Object.keys(payload).length === 0) {
            throw new Error('ריק');
        }
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const response = await fetch(`${apiBase}/api/email-uploads/messages/${id}/status`, {
            method: 'PATCH',
            cache: 'no-store',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `HTTP ${response.status}`);
        }
        return (await response.json()) as { metadata?: { recipientReadAt?: string; taskCompleted?: boolean } } & Record<
            string,
            unknown
        >;
    };

    const persistStatusUpdate = async (id: string, status: 'unread' | 'tasks' | 'archived' | 'deleted') => {
        await persistNotificationPatch(id, { status });
    };

    const persistAssignUpdate = async (id: string, assigneeEmails: string[]) => {
        if (!apiBase) return;
        if (!NOTIFICATION_MESSAGE_ID_REGEX.test(id)) {
            throw new Error(`Invalid notification id: ${id}`);
        }
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const response = await fetch(`${apiBase}/api/email-uploads/messages/${id}/assign`, {
            method: 'PATCH',
            cache: 'no-store',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ assigneeEmails }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `HTTP ${response.status}`);
        }
    };

    const handleAdvancedFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setAdvancedFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const filterOptions = useMemo(() => {
        const notificationsForFilters = [...notifications, ...archivedNotifications];
        return {
            senders: [...new Set(notificationsForFilters.map(n => n.sender))],
            recipients: [...new Set(notificationsForFilters.map(n => n.recipient))],
            categories: [...new Set(notificationsForFilters.map(n => n.category))],
            linkedClients: [...new Set(notificationsForFilters.map(n => n.linkedClient).filter(Boolean))] as string[],
        };
    }, [notifications, archivedNotifications]);

    const filteredNotifications = useMemo(() => {
        // הכל + סטטוס «הכל» = כל האינבוקס. סטטוס מתקדם מסנן לפי טופל / לא טופל בלבד.
        let listToFilter = activeTab === 'archived' ? archivedNotifications : notifications;
        
        if (activeTab === 'unread') {
            listToFilter = listToFilter.filter((n) => n.type === 'message');
        }
        if (activeTab === 'tasks') {
            listToFilter = listToFilter.filter(n => n.backendStatus === 'tasks');
        }

        const search = searchTerm.toLowerCase();
        
        const filtered = listToFilter
            .filter(n => 
                n.title.toLowerCase().includes(search) ||
                n.content.toLowerCase().includes(search) ||
                (n.recipient && n.recipient.toLowerCase().includes(search))
            )
            .filter(n => {
                const { sender, recipient, status, category, fromDate, toDate, linkedClient } = advancedFilters;
                if (sender && n.sender !== sender) return false;
                if (recipient && n.recipient !== recipient) return false;
                if (status === NOTIFICATION_READ_FILTER_PENDING && n.handledComplete) return false;
                if (status === NOTIFICATION_READ_FILTER_DONE && !n.handledComplete) return false;
                if (category && n.category !== category) return false;
                if (linkedClient && n.linkedClient !== linkedClient) return false;

                const notificationDate = new Date(n.timestamp);
                if (fromDate && notificationDate < new Date(fromDate)) return false;
                if (toDate && notificationDate > new Date(new Date(toDate).setHours(23, 59, 59, 999))) return false;
                
                return true;
            });

        const byTimeDesc = (a: Notification, b: Notification) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

        return [...filtered].sort(byTimeDesc);
    }, [activeTab, searchTerm, notifications, archivedNotifications, advancedFilters]);

    /** Default read filter is `pending`; don’t treat it as an “active search” for empty-state copy. */
    const hasAdvancedFilterBeyondDefaults = useMemo(() => {
        const f = advancedFilters;
        if (f.sender || f.recipient || f.category || f.fromDate || f.toDate || f.linkedClient) return true;
        if (f.status && f.status !== NOTIFICATION_READ_FILTER_PENDING) return true;
        return false;
    }, [advancedFilters]);

    const handleToggleSelect = (id: string) => {
        setSelectedNotifications(prev => 
            prev.includes(id) 
                ? prev.filter(selectedId => selectedId !== id)
                : [...prev, id]
        );
    };
    
    const areAllVisibleSelected = useMemo(() => 
        filteredNotifications.length > 0 && 
        filteredNotifications.every(n => selectedNotifications.includes(n.id)), 
        [filteredNotifications, selectedNotifications]
    );

    const handleSelectAllVisible = () => {
        if (areAllVisibleSelected) {
            const visibleIds = filteredNotifications.map(n => n.id);
            setSelectedNotifications(prev => prev.filter(id => !visibleIds.includes(id)));
        } else {
            const visibleIds = filteredNotifications.map(n => n.id);
            setSelectedNotifications(prev => [...new Set([...prev, ...visibleIds])]);
        }
    };

    const handleToggleExpand = (id: string) => {
        setExpandedId((prevId) => {
            const willOpen = prevId !== id;
            const next = prevId === id ? null : id;
            if (willOpen && next === id) {
                const n = [...notifications, ...archivedNotifications].find((x) => x.id === id);
                if (
                    n?.type === 'message' &&
                    !n.recipientReadAt &&
                    notificationRecipientMatchesViewer(n, user?.email, user?.name)
                ) {
                    void (async () => {
                        try {
                            setLoadError('');
                            const updated = await persistNotificationPatch(id, { markRecipientRead: true });
                            const at = updated?.metadata?.recipientReadAt;
                            const patch = (list: Notification[]) =>
                                list.map((x) =>
                                    x.id === id ? { ...x, recipientReadAt: at || x.recipientReadAt } : x
                                );
                            setNotifications(patch);
                            setArchivedNotifications((prev) => patch(prev));
                        } catch (error: any) {
                            setLoadError(error?.message || 'סימון כנקרא נכשל');
                        }
                    })();
                }
            }
            return next;
        });
    };

    const handleMarkAsRead = async (id: string) => {
        const n = [...notifications, ...archivedNotifications].find((x) => x.id === id);
        if (n?.type !== 'message' || !notificationRecipientMatchesViewer(n, user?.email, user?.name)) return;
        try {
            setLoadError('');
            const updated = await persistNotificationPatch(id, { markRecipientRead: true });
            const at = updated?.metadata?.recipientReadAt;
            const patch = (list: Notification[]) =>
                list.map((x) =>
                    x.id === id ? { ...x, recipientReadAt: at || x.recipientReadAt } : x
                );
            setNotifications(patch);
            setArchivedNotifications((prev) => patch(prev));
        } catch (error: any) {
            setLoadError(error?.message || 'סימון כנקרא נכשל');
        }
    };
    
    const patchHandledLists = (id: string, complete: boolean) => {
        const patch = (list: Notification[]) =>
            list.map((n) =>
                n.id === id
                    ? {
                          ...n,
                          handledComplete: complete,
                          status: complete ? ('Done' as const) : ('New' as const),
                      }
                    : n
            );
        setNotifications((prev) => patch(prev));
        setArchivedNotifications((prev) => patch(prev));
    };

    const handleTaskComplete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            setLoadError('');
            await persistNotificationPatch(id, { taskCompleted: true });
            patchHandledLists(id, true);
            requestNotificationInboxCountsRefresh();
        } catch (error: any) {
            setLoadError(error?.message || 'שמירת סטטוס נכשלה');
        }
    };

    const handleTaskUncomplete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            setLoadError('');
            await persistNotificationPatch(id, { taskCompleted: false });
            patchHandledLists(id, false);
            requestNotificationInboxCountsRefresh();
        } catch (error: any) {
            setLoadError(error?.message || 'שמירת סטטוס נכשלה');
        }
    };

    const handleRescheduleTask = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const y = tomorrow.getFullYear();
        const mo = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const d = String(tomorrow.getDate()).padStart(2, '0');
        const dueDateStr = `${y}-${mo}-${d}`;
        try {
            setLoadError('');
            await persistNotificationPatch(id, { dueDate: dueDateStr });
            const patchLists = (list: Notification[]) =>
                list.map((n) => (n.id === id ? { ...n, dueDate: dueDateStr } : n));
            setNotifications(patchLists);
            setArchivedNotifications((prev) => patchLists(prev));
        } catch (err: any) {
            setLoadError(err?.message || 'עדכון מועד יעד נכשל');
        }
    };

    const handleArchive = async (id: string) => {
        await persistStatusUpdate(id, 'archived');
        const notificationToArchive = notifications.find(n => n.id === id);
        if (notificationToArchive) {
            setNotifications(prev => prev.filter(n => n.id !== id));
            setArchivedNotifications(prev => [{ ...notificationToArchive, backendStatus: 'archived' }, ...prev]);
        }
        requestNotificationInboxCountsRefresh();
    };

    const handleRestore = async (id: string) => {
        const notificationToRestore = archivedNotifications.find(n => n.id === id);
        if (notificationToRestore) {
            await persistStatusUpdate(id, notificationToRestore.type === 'task' ? 'tasks' : 'unread');
            setArchivedNotifications(prev => prev.filter(n => n.id !== id));
            setNotifications(prev => [
                {
                    ...notificationToRestore,
                    backendStatus: notificationToRestore.type === 'task' ? 'tasks' : 'unread',
                },
                ...prev,
            ]);
        }
        requestNotificationInboxCountsRefresh();
    };

    // Bulk Actions
    const handleBulkMarkAsRead = () => {
        void (async () => {
            try {
                setLoadError('');
                const ids = [...selectedNotifications];
                for (const id of ids) {
                    const n = notifications.find((x) => x.id === id);
                    if (
                        n?.type !== 'message' ||
                        !notificationRecipientMatchesViewer(n, user?.email, user?.name)
                    )
                        continue;
                    await persistNotificationPatch(id, { markRecipientRead: true });
                }
                setSelectedNotifications([]);
                void loadNotificationsRef.current?.();
            } catch (error: any) {
                setLoadError(error?.message || 'סימון כנקרא נכשל');
            }
        })();
    };

    const handleBulkMarkAsDone = () => {
        void (async () => {
            try {
                setLoadError('');
                const ids = [...selectedNotifications];
                await Promise.all(ids.map((id) => persistNotificationPatch(id, { taskCompleted: true })));
                setSelectedNotifications([]);
                void loadNotificationsRef.current?.();
                requestNotificationInboxCountsRefresh();
            } catch (error: any) {
                setLoadError(error?.message || 'סימון כטופל נכשל');
            }
        })();
    };

    const handleBulkArchive = async () => {
        await Promise.all(selectedNotifications.map((id) => persistStatusUpdate(id, 'archived')));
        const toArchive = notifications.filter(n => selectedNotifications.includes(n.id));
        setNotifications(prev => prev.filter(n => !selectedNotifications.includes(n.id)));
        setArchivedNotifications(prev => [
            ...toArchive.map((n) => ({ ...n, backendStatus: 'archived' as const })),
            ...prev,
        ]);
        setSelectedNotifications([]);
        requestNotificationInboxCountsRefresh();
    };

    const handleAgentToggle = (agent: string) => {
        setTempSelectedAgents(prev =>
            prev.includes(agent)
                ? prev.filter(a => a !== agent)
                : [...prev, agent]
        );
    };

    const handleConfirmAssignment = async () => {
        if (tempSelectedAgents.length === 0) return;

        const ids = [...selectedNotifications];
        const emails = [...tempSelectedAgents];
        try {
            setLoadError('');
            await Promise.all(ids.map((id) => persistAssignUpdate(id, emails)));
        } catch (error: any) {
            setLoadError(error?.message || 'העברת ההודעה לנציג נכשלה');
            return;
        }

        setSelectedNotifications([]);
        setTempSelectedAgents([]);
        setIsAssignMenuOpen(false);
        setAssignMenuAnchor(null);
        void loadNotificationsRef.current?.();
    };
    
    const filterKeyMap: { [key: string]: keyof typeof filterOptions | 'status_read' } = {
        sender: 'senders',
        recipient: 'recipients',
        status: 'status_read',
        category: 'categories',
        linkedClient: 'linkedClients',
    };

    useEffect(() => {
        // Clear selection when changing tabs
        setSelectedNotifications([]);
    }, [activeTab]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 relative">
            <style>{`
                @keyframes content-fade-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                .animate-content-fade-in { animation: content-fade-in 0.3s ease-out forwards; }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up { animation: slideUp 0.3s ease-out forwards; }
            `}</style>

            <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">מרכז עדכונים ומשימות</h1>
                    <p className="text-sm text-text-muted">כל ההתראות, המשימות וההודעות שלך במקום אחד.</p>
                </div>
                <button onClick={() => navigate('/candidates')} title="סגור" className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </header>

            <div className="bg-bg-subtle/70 rounded-xl border border-border-default mb-4 p-3 space-y-3">
                <div className="flex flex-col md:flex-row items-center gap-3">
                    <div className="flex-shrink-0 flex items-center bg-bg-card border border-border-default/50 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                        {([
                            ['all', `הכל (${allUnreadCount})`],
                            ['tasks', `משימות פתוחות (${openUnreadTasksCount})`],
                            ['unread', `הודעות (${unreadMessagesCount})`],
                            ['archived', `ארכיון (${archivedNotifications.length})`]
                        ] as const).map(([tab, label]) => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-1.5 px-4 text-sm font-semibold rounded-md transition whitespace-nowrap ${activeTab === tab ? 'bg-white shadow-sm text-primary-700 border border-gray-100' : 'text-text-muted hover:text-text-default'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                     {activeTab !== 'archived' && (
                        <div className="flex items-center gap-2 p-2 hidden md:flex">
                            <input
                                type="checkbox"
                                id="select-all"
                                checked={areAllVisibleSelected}
                                onChange={handleSelectAllVisible}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                            />
                            <label htmlFor="select-all" className="text-sm font-medium text-text-muted cursor-pointer">
                                בחר הכל
                            </label>
                        </div>
                     )}
                    <div className="relative w-full md:flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="חיפוש לפי כותרת, תוכן או אחראי..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-card border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            setIsAdvancedFilterOpen(!isAdvancedFilterOpen);
                        }}
                        className="text-sm font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1"
                    >
                        <span>חיפוש מתקדם</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
                {isAdvancedFilterOpen && (
                    <div className="pt-3 border-t border-border-default">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                            {Object.keys(filterKeyMap).map((filter) => {
                                const mapKey = filterKeyMap[filter as keyof typeof filterKeyMap];
                                const opts =
                                    mapKey === 'status_read'
                                        ? []
                                        : (filterOptions[mapKey as keyof typeof filterOptions] as string[]);
                                const fieldId = `adv-filter-${filter}`;
                                const label = ADVANCED_FILTER_FIELD_LABELS[filter] || filter;
                                return (
                                    <div key={filter} className="flex flex-col gap-1 min-w-0">
                                        <label htmlFor={fieldId} className="text-xs font-bold text-text-muted uppercase tracking-wide">
                                            {label}
                                        </label>
                                        <select
                                            id={fieldId}
                                            name={filter}
                                            value={(advancedFilters as Record<string, string>)[filter]}
                                            onChange={handleAdvancedFilterChange}
                                            className="w-full bg-bg-card border border-border-default text-text-default text-sm rounded-lg p-2 transition shadow-sm"
                                        >
                                            {mapKey === 'status_read' ? (
                                                <>
                                                    <option value="">הכל</option>
                                                    <option value={NOTIFICATION_READ_FILTER_DONE}>טופל</option>
                                                    <option value={NOTIFICATION_READ_FILTER_PENDING}>לא טופל</option>
                                                </>
                                            ) : (
                                                <>
                                                    <option value="">הכל</option>
                                                    {opts.map((opt: string) => (
                                                        <option key={opt} value={opt}>
                                                            {opt}
                                                        </option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                    </div>
                                );
                            })}
                            <div className="flex flex-col gap-1 min-w-0">
                                <label htmlFor="adv-filter-fromDate" className="text-xs font-bold text-text-muted uppercase tracking-wide">
                                    {ADVANCED_FILTER_FIELD_LABELS.fromDate}
                                </label>
                                <input
                                    id="adv-filter-fromDate"
                                    type="date"
                                    name="fromDate"
                                    value={advancedFilters.fromDate}
                                    onChange={handleAdvancedFilterChange}
                                    className="w-full bg-bg-card border border-border-default text-text-default text-sm rounded-lg p-2 transition shadow-sm"
                                />
                            </div>
                            <div className="flex flex-col gap-1 min-w-0">
                                <label htmlFor="adv-filter-toDate" className="text-xs font-bold text-text-muted uppercase tracking-wide">
                                    {ADVANCED_FILTER_FIELD_LABELS.toDate}
                                </label>
                                <input
                                    id="adv-filter-toDate"
                                    type="date"
                                    name="toDate"
                                    value={advancedFilters.toDate}
                                    onChange={handleAdvancedFilterChange}
                                    className="w-full bg-bg-card border border-border-default text-text-default text-sm rounded-lg p-2 transition shadow-sm"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <main className="flex-1 overflow-y-auto space-y-2 pb-20">
                {isLoading && (
                    <div className="text-center py-6 text-text-muted text-sm">טוען הודעות...</div>
                )}
                {loadError && (
                    <div className="text-center py-6 text-red-600 text-sm">{loadError}</div>
                )}
                {filteredNotifications.length > 0 ? (
                    filteredNotifications.map(notification => {
                        const bodyWithoutLinked = stripTaskLinkedAppendixFromBody(notification.content);
                        const { icon, bg, text } = notificationStyles[notification.type];
                        const isSelected = selectedNotifications.includes(notification.id);
                        
                        // Task urgency logic
                        const urgencyState = notification.type === 'task' && notification.status !== 'Done' 
                            ? getTaskUrgencyState(notification.dueDate) 
                            : 'none';

                        let urgencyClasses = 'border-border-default bg-bg-card';
                        let dateColorClass = 'text-text-subtle';
                        
                        if (urgencyState === 'overdue') {
                            urgencyClasses = 'border-red-400 bg-red-50/40 border-r-4'; // Using border-r for RTL
                            dateColorClass = 'text-red-600 font-bold';
                        } else if (urgencyState === 'soon') {
                            urgencyClasses = 'border-orange-400 bg-orange-50/40 border-r-4';
                            dateColorClass = 'text-orange-600 font-semibold';
                        } else if (notification.type === 'task' && notification.status !== 'Done') {
                            // Future tasks
                            urgencyClasses = 'border-l border-t border-b border-r-4 border-r-green-200 bg-white';
                        }

                        const displayDate = notification.type === 'task' && notification.status !== 'Done'
                            ? formatDueDate(notification.dueDate)
                            : formatRelativeTime(notification.timestamp);

                        return (
                            <div key={notification.id} className={`rounded-lg p-3 flex items-start gap-3 transition-all duration-200 border ${urgencyClasses} ${isSelected ? '!bg-primary-50 !border-primary-300 shadow-md' : ''}`}>
                                {activeTab !== 'archived' && (
                                    <div className="flex items-center h-full pt-1.5">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleSelect(notification.id)}
                                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                        />
                                    </div>
                                )}
                                <div className="flex-1 flex flex-row items-start gap-4 cursor-pointer" onClick={() => handleToggleExpand(notification.id)}>
                                    {!notification.recipientReadAt &&
                                        activeTab !== 'archived' &&
                                        !isSelected &&
                                        notification.type === 'message' &&
                                        notificationRecipientMatchesViewer(
                                            notification,
                                            user?.email,
                                            user?.name
                                        ) && (
                                            <div
                                                className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-2"
                                                title="לא נקרא"
                                            />
                                        )}

                                    {/* טופל — משימות והודעות */}
                                    {(notification.type === 'task' || notification.type === 'message') &&
                                        activeTab !== 'archived' && (
                                        <button
                                            type="button"
                                            onClick={(e) =>
                                                notification.status === 'Done'
                                                    ? handleTaskUncomplete(e, notification.id)
                                                    : handleTaskComplete(e, notification.id)
                                            }
                                            className={
                                                notification.status === 'Done'
                                                    ? 'mt-1 w-5 h-5 rounded-full border-2 border-green-500 bg-green-50 hover:border-amber-500 hover:bg-amber-50 transition-colors flex items-center justify-center shrink-0'
                                                    : 'mt-1 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center group/check shrink-0'
                                            }
                                            title={notification.status === 'Done' ? 'סמן כלא בוצע' : 'סמן כבוצע'}
                                        >
                                            <CheckCircleIcon
                                                className={
                                                    notification.status === 'Done'
                                                        ? 'w-3.5 h-3.5 text-green-600'
                                                        : 'w-0 h-0 text-green-500 group-hover/check:w-3.5 group-hover/check:h-3.5 transition-all duration-200'
                                                }
                                            />
                                        </button>
                                        )}

                                    <div className="flex-1 flex flex-col">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                                <p className={`font-semibold text-sm ${urgencyState === 'overdue' ? 'text-red-800' : 'text-text-default'}`}>{notification.title}</p>
                                                {notification.type === 'message' &&
                                                    user?.id &&
                                                    notification.senderUserId &&
                                                    String(notification.senderUserId) === String(user.id) &&
                                                    notification.recipientReadAt && (
                                                        <p className="text-[11px] text-green-700 font-medium mt-0.5">
                                                            נקרא · {formatRelativeTime(notification.recipientReadAt)}
                                                        </p>
                                                    )}
                                            </div>
                                            <span className={`text-xs ${dateColorClass} whitespace-nowrap shrink-0 mr-2`}>{displayDate}</span>
                                        </div>
                                        <p
                                            className={`text-xs mt-0.5 ${
                                                expandedId === notification.id
                                                    ? 'text-text-default whitespace-pre-wrap break-words'
                                                    : 'text-text-muted'
                                            }`}
                                        >
                                            {expandedId === notification.id
                                                ? bodyWithoutLinked
                                                : truncatedPreviewWords(bodyWithoutLinked)}
                                        </p>

                                        {expandedId === notification.id && (
                                            <div className="mt-3 pt-3 border-t border-border-default animate-content-fade-in">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                                    {notification.recipient && <div><strong className="text-text-muted">נמען:</strong> <span className="font-semibold text-text-default">{notification.recipient}</span></div>}
                                                    {notification.sender && <div><strong className="text-text-muted">שולח:</strong> <span className="font-semibold text-text-default">{notification.sender}</span></div>}
                                                    {notification.urgency && <div><strong className="text-text-muted">דחיפות:</strong> <span className="font-semibold text-text-default">{notification.urgency}</span></div>}
                                                    {notification.category && <div><strong className="text-text-muted">קטגוריה:</strong> <span className="font-semibold text-text-default">{notification.category}</span></div>}
                                                </div>
                                                {(() => {
                                                    const cand =
                                                        notification.linkedCandidateLabel || EMPTY_LINKED_LABEL;
                                                    const job = notification.linkedJobLabel || EMPTY_LINKED_LABEL;
                                                    const cli = notification.linkedClientLabel || EMPTY_LINKED_LABEL;
                                                    const hasLinkTarget =
                                                        Boolean(notification.linkedCandidateId) ||
                                                        Boolean(notification.linkedCandidateBackendId) ||
                                                        Boolean(notification.linkedJobId) ||
                                                        Boolean(notification.linkedClientId);
                                                    const hasLabel =
                                                        (cand && cand !== EMPTY_LINKED_LABEL) ||
                                                        (job && job !== EMPTY_LINKED_LABEL) ||
                                                        (cli && cli !== EMPTY_LINKED_LABEL);
                                                    if (!hasLinkTarget && !hasLabel) return null;
                                                    return (
                                                        <div className="mt-3 pt-3 border-t border-border-default text-xs space-y-2">
                                                            <p className="font-bold text-text-muted">מידע מקושר</p>
                                                            <div className="space-y-1.5">
                                                                <div>
                                                                    <strong className="text-text-muted">מועמד:</strong>{' '}
                                                                    {notification.linkedCandidateId != null ||
                                                                    notification.linkedCandidateBackendId ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openLinkedCandidate(notification);
                                                                            }}
                                                                            className="font-semibold text-primary-600 hover:underline"
                                                                        >
                                                                            {cand !== EMPTY_LINKED_LABEL
                                                                                ? cand
                                                                                : 'צפה בפרופיל'}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="font-semibold text-text-default">
                                                                            {cand}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <strong className="text-text-muted">משרה:</strong>{' '}
                                                                    {notification.linkedJobId ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                navigate(
                                                                                    `/jobs/edit/${notification.linkedJobId}`,
                                                                                );
                                                                            }}
                                                                            className="font-semibold text-primary-600 hover:underline"
                                                                        >
                                                                            {job !== EMPTY_LINKED_LABEL
                                                                                ? job
                                                                                : 'פתח משרה'}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="font-semibold text-text-default">
                                                                            {job}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <strong className="text-text-muted">לקוח:</strong>{' '}
                                                                    {notification.linkedClientId ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                navigate(
                                                                                    notification.linkedContactId
                                                                                        ? `/clients/${notification.linkedClientId}/contacts/${notification.linkedContactId}`
                                                                                        : `/clients/${notification.linkedClientId}`,
                                                                                );
                                                                            }}
                                                                            className="font-semibold text-primary-600 hover:underline"
                                                                        >
                                                                            {cli !== EMPTY_LINKED_LABEL
                                                                                ? cli
                                                                                : 'פתח כרטיס'}
                                                                        </button>
                                                                    ) : (
                                                                        <span className="font-semibold text-text-default">
                                                                            {cli}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                                    {activeTab === 'archived' ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRestore(notification.id);
                                                            }}
                                                            className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-primary-600 p-1.5 rounded-md hover:bg-primary-50"
                                                        >
                                                            <ArrowUturnLeftIcon className="w-4 h-4" />
                                                            שחזר
                                                        </button>
                                                    ) : notification.type === 'task' || notification.type === 'message' ? (
                                                        <>
                                                            {notification.status === 'Done' ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) =>
                                                                        handleTaskUncomplete(e, notification.id)
                                                                    }
                                                                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md hover:bg-amber-100 transition-colors"
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4 text-amber-700" />
                                                                    סמן כלא בוצע
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleTaskComplete(e, notification.id)}
                                                                    className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-md hover:bg-green-100 transition-colors"
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                    סמן כבוצע
                                                                </button>
                                                            )}
                                                            {notification.type === 'task' && (
                                                                <button
                                                                    onClick={(e) => handleRescheduleTask(e, notification.id)}
                                                                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md hover:bg-amber-100 transition-colors"
                                                                >
                                                                    <ClockIcon className="w-4 h-4" />
                                                                    דחה למחר
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedNotifications([notification.id]);
                                                                    setTempSelectedAgents([]);
                                                                    const r = e.currentTarget.getBoundingClientRect();
                                                                    setAssignMenuAnchor({
                                                                        top: r.top,
                                                                        left: r.left,
                                                                        bottom: r.bottom,
                                                                        right: r.right,
                                                                        width: r.width,
                                                                        height: r.height,
                                                                    });
                                                                    setIsAssignMenuOpen(true);
                                                                }}
                                                                className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-md hover:bg-primary-100 transition-colors"
                                                            >
                                                                <UserGroupIcon className="w-4 h-4" />
                                                                העבר לנציג
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleArchive(notification.id);
                                                                }}
                                                                className="flex items-center gap-1.5 text-xs font-semibold text-text-muted border border-border-default px-3 py-1.5 rounded-md hover:bg-bg-hover transition-colors"
                                                            >
                                                                <ArchiveBoxIcon className="w-4 h-4" />
                                                                ארכיון
                                                            </button>
                                                            {notification.type === 'message' &&
                                                                !notification.recipientReadAt &&
                                                                notificationRecipientMatchesViewer(
                                                                    notification,
                                                                    user?.email,
                                                                    user?.name
                                                                ) && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleMarkAsRead(notification.id);
                                                                        }}
                                                                        className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-green-600 p-1.5 rounded-md hover:bg-green-50"
                                                                    >
                                                                        <CheckCircleIcon className="w-4 h-4" />
                                                                        סמן כנקרא
                                                                    </button>
                                                                )}
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleArchive(notification.id);
                                                            }}
                                                            className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-red-600 p-1.5 rounded-md hover:bg-red-50"
                                                        >
                                                            <ArchiveBoxIcon className="w-4 h-4" /> ארכיון
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full ${bg} ${text}`}>
                                        {icon}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                ) : (
                     <div className="text-center py-20 text-text-muted flex flex-col items-center">
                        <MagnifyingGlassIcon className="w-12 h-12 text-text-subtle mb-4" />
                        <p className="font-semibold text-lg">{searchTerm || hasAdvancedFilterBeyondDefaults ? 'לא נמצאו התראות' : activeTab === 'archived' ? 'הארכיון ריק' : 'אין הודעות חדשות'}</p>
                        <p className="text-sm mt-1">{searchTerm || hasAdvancedFilterBeyondDefaults ? 'נסה מונח חיפוש אחר.' : activeTab === 'archived' ? 'הודעות שסומנו כטופלו יופיעו כאן.' : 'הכל מעודכן!'}</p>
                    </div>
                )}
            </main>
            
            {selectedNotifications.length > 0 && activeTab !== 'archived' && (
                <div className="absolute bottom-0 inset-x-0 z-20 p-4 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto w-auto max-w-full bg-bg-card shadow-2xl rounded-xl border border-border-default p-2 flex items-center flex-wrap justify-center gap-2 animate-slide-up">
                        <span className="text-sm font-semibold text-text-default px-2">
                            {selectedNotifications.length} נבחרו
                        </span>
                        <div className="h-6 w-px bg-border-default"></div>
                        <button onClick={handleBulkMarkAsRead} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors">סמן כנקרא</button>
                        <button onClick={handleBulkMarkAsDone} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors">סמן כטופל</button>
                        <button onClick={handleBulkArchive} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors">העבר לארכיון</button>
                        
                        <button
                            ref={bulkAssignBtnRef}
                            type="button"
                            onClick={() => {
                                setIsAssignMenuOpen((open) => {
                                    if (open) {
                                        setAssignMenuAnchor(null);
                                        setTempSelectedAgents([]);
                                        return false;
                                    }
                                    const el = bulkAssignBtnRef.current;
                                    if (el) {
                                        const r = el.getBoundingClientRect();
                                        setAssignMenuAnchor({
                                            top: r.top,
                                            left: r.left,
                                            bottom: r.bottom,
                                            right: r.right,
                                            width: r.width,
                                            height: r.height,
                                        });
                                    }
                                    setTempSelectedAgents([]);
                                    return true;
                                });
                            }}
                            className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors"
                        >
                            העבר לנציג
                        </button>
                        
                        <button onClick={() => setSelectedNotifications([])} className="p-2 rounded-full text-text-subtle hover:bg-bg-hover" title="נקה בחירה">
                            <XMarkIcon className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            )}

            {isAssignMenuOpen && assignMenuAnchor && assignPopoverLayout && (
                <div
                    ref={assignPanelRef}
                    className="fixed z-[200] bg-bg-card rounded-xl shadow-2xl border border-border-default flex flex-col overflow-hidden"
                    style={{
                        top: assignPopoverLayout.top,
                        left: assignPopoverLayout.left,
                        width: assignPopoverLayout.width,
                        maxHeight: assignPopoverLayout.maxHeight,
                    }}
                >
                    <div className="px-3 pt-3 pb-2 border-b border-border-default bg-bg-subtle/40 shrink-0">
                        <p className="text-sm font-bold text-text-default">בחר נציגים לשיוח</p>
                        <p className="text-xs text-text-muted mt-0.5">כל משתמשי הצוות של הלקוח (מהמערכת)</p>
                    </div>
                    <div className="overflow-y-auto flex-1 min-h-0 p-2 space-y-1">
                        {staffUsersLoading ? (
                            <p className="text-sm text-text-muted px-2 py-3 text-center">טוען משתמשים…</p>
                        ) : assigneeOptions.length === 0 ? (
                            <p className="text-sm text-text-muted px-2 py-3 text-center">לא נמצאו משתמשים</p>
                        ) : (
                            assigneeOptions.map((u) => {
                                const email = String(u.email || '').trim();
                                if (!email) return null;
                                const label = u.name?.trim() ? `${u.name.trim()} (${email})` : email;
                                return (
                                    <label
                                        key={u.id}
                                        className="flex items-center gap-2 text-sm text-text-default hover:bg-bg-hover p-2 rounded-lg cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={tempSelectedAgents.includes(email)}
                                            onChange={() => handleAgentToggle(email)}
                                            className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500 shrink-0"
                                        />
                                        <span className="min-w-0 break-words">{label}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                    <div className="p-2 border-t border-border-default shrink-0 bg-bg-card">
                        <button
                            type="button"
                            onClick={handleConfirmAssignment}
                            disabled={tempSelectedAgents.length === 0}
                            className="w-full bg-primary-600 text-white font-semibold py-2 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            העבר ({tempSelectedAgents.length})
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;

