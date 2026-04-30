import React, { useState, useEffect, useCallback, useRef } from 'react';
import { XMarkIcon, PaperAirplaneIcon, CheckCircleIcon } from './Icons';

export type ReReferContact = {
    id: string;
    name: string;
    email: string;
    role: string;
};

export type ReReferSendPayload = {
    notes: string;
    nextStatus: string;
    contacts: ReReferContact[];
};

/** Context needed to load client contacts (by job) and to send screening CV. */
export interface ReReferReferralContext {
    id: string;
    candidateId: string | null;
    jobId: string | null;
    jobTitle: string;
    clientName: string;
    candidateName: string;
    /** Staff note on the referral row (optional; e.g. pasted into הערות when no list import). */
    internalNote?: string;
    /** Plain body saved on `notification_messages.text` for this screening send (read-only preview). */
    notificationText?: string;
}

interface ReReferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (data: ReReferSendPayload) => void | Promise<void>;
    referral: ReReferReferralContext | null;
    /**
     * Loads the first screening row for the **same candidate** (same filters/sort as the report / board),
     * then updates parent state so the modal matches that row. הערות stay empty for manual entry.
     */
    applyFirstListedReferral?: (candidateId: string | null) => Promise<void>;
}

const nextStatusOptions = ['נשלחו קו"ח', 'בבדיקה', 'ראיון', 'הצעה'];

const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
};

const ReReferModal: React.FC<ReReferModalProps> = ({
    isOpen,
    onClose,
    onSend,
    referral,
    applyFirstListedReferral,
}) => {
    const [notes, setNotes] = useState('');
    const [nextStatus, setNextStatus] = useState('נשלחו קו"ח');
    const [contacts, setContacts] = useState<ReReferContact[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(false);
    const [contactsError, setContactsError] = useState<string | null>(null);
    const [metaHint, setMetaHint] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [importingListedNote, setImportingListedNote] = useState(false);
    const [importListedNoteError, setImportListedNoteError] = useState<string | null>(null);
    /** Last value we set from referral prop / API — fetch won’t overwrite if the user edited away from this. */
    const notesProgrammaticSeedRef = useRef('');

    const apiBase = import.meta.env.VITE_API_BASE || '';

    const loadContacts = useCallback(async () => {
        if (!referral?.jobId || !String(referral.jobId).trim()) {
            setContacts([]);
            setSelectedIds([]);
            setContactsError(null);
            setMetaHint('לא נמצא מזהה משרה בהפניה — לא ניתן לטעון אנשי קשר ללקוח.');
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!apiBase || !token) {
            setContacts([]);
            setSelectedIds([]);
            setContactsError(!apiBase ? 'חסרה הגדרת שרת.' : 'נדרשת התחברות.');
            setMetaHint(null);
            return;
        }
        setLoadingContacts(true);
        setContactsError(null);
        setMetaHint(null);
        try {
            const res = await fetch(
                `${apiBase}/api/jobs/${encodeURIComponent(referral.jobId)}/referral-client-contacts`,
                {
                    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
                },
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(typeof data?.message === 'string' ? data.message : 'טעינת אנשי קשר נכשלה');
            }
            const list: ReReferContact[] = Array.isArray(data.contacts)
                ? data.contacts.map((c: { id?: string; name?: string; email?: string; role?: string }) => ({
                      id: String(c.id || ''),
                      name: String(c.name || '').trim(),
                      email: String(c.email || '').trim(),
                      role: String(c.role || '').trim(),
                  }))
                : [];
            setContacts(list);
            setSelectedIds(list.map((c) => c.id));
            const resolved = data.clientResolvedName ? String(data.clientResolvedName) : '';
            const jobLabel = data.jobClientLabel ? String(data.jobClientLabel) : '';
            if (list.length === 0) {
                setMetaHint(
                    resolved || jobLabel
                        ? `לא נמצאו אנשי קשר עם אימייל תקין עבור הלקוח (${resolved || jobLabel}). ניתן להוסיף אנשי קשר בכרטיס הלקוח או בשדה אנשי קשר במשרה.`
                        : 'לא נמצאו אנשי קשר. ודאו ששם הלקוח במשרה תואם ללקוח במערכת, או הוסיפו אנשי קשר במשרה.',
                );
            } else if (resolved && jobLabel && resolved !== jobLabel) {
                setMetaHint(`הותאם לקוח: ${resolved} (שדה משרה: ${jobLabel})`);
            }
        } catch (e: unknown) {
            setContacts([]);
            setSelectedIds([]);
            setContactsError(e instanceof Error ? e.message : 'שגיאה בטעינת אנשי קשר');
        } finally {
            setLoadingContacts(false);
        }
    }, [referral?.jobId, apiBase]);

    useEffect(() => {
        if (!isOpen || !referral) return;
        const propBody = referral.notificationText != null ? String(referral.notificationText).trim() : '';
        notesProgrammaticSeedRef.current = propBody;
        setNotes(propBody);
        setNextStatus('נשלחו קו"ח');
        setSendError(null);
        setImportListedNoteError(null);
        void loadContacts();
    }, [isOpen, referral, loadContacts]);

    useEffect(() => {
        if (!isOpen || !referral?.id || !String(referral.id).trim()) {
            return;
        }
        if (!apiBase) {
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            return;
        }
        let cancelled = false;
        const rid = String(referral.id).trim();
        void fetch(`${apiBase}/api/email-uploads/screening-cv-referrals/${encodeURIComponent(rid)}`, {
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            cache: 'no-store',
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(typeof data?.message === 'string' ? data.message : 'טעינת טקסט המייל נכשלה');
                }
                return data?.notificationText != null ? String(data.notificationText) : '';
            })
            .then((t) => {
                if (!cancelled) {
                    const trimmed = String(t || '').trim();
                    if (!trimmed) return;
                    setNotes((prev) => {
                        if (prev !== notesProgrammaticSeedRef.current) return prev;
                        notesProgrammaticSeedRef.current = trimmed;
                        return trimmed;
                    });
                }
            })
            .catch(() => {
                /* keep notes from referral.notificationText */
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, referral?.id, apiBase]);

    if (!isOpen || !referral) return null;

    const handleContactToggle = (contactId: string) => {
        setSelectedIds((prev) =>
            prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId],
        );
    };

    const handleImportLastNote = async () => {
        setImportListedNoteError(null);
        if (applyFirstListedReferral) {
            setImportingListedNote(true);
            try {
                await applyFirstListedReferral(referral.candidateId ?? null);
            } catch (e: unknown) {
                setImportListedNoteError(e instanceof Error ? e.message : 'ייבוא מהרשימה נכשל');
            } finally {
                setImportingListedNote(false);
            }
            return;
        }
        const raw = referral.internalNote != null ? String(referral.internalNote).trim() : '';
        if (raw) {
            notesProgrammaticSeedRef.current = raw;
            setNotes(raw);
        }
    };

    const canImportFromCurrentRow =
        referral.internalNote != null && String(referral.internalNote).trim().length > 0;
    const canImportListedSameCandidate = Boolean(
        applyFirstListedReferral &&
            referral.candidateId != null &&
            String(referral.candidateId).trim() !== '',
    );
    const importLastNoteDisabled =
        importingListedNote || (!canImportListedSameCandidate && !canImportFromCurrentRow);

    const handleSend = async () => {
        setSendError(null);
        const selected = contacts.filter((c) => selectedIds.includes(c.id));
        if (!referral.candidateId || !String(referral.candidateId).trim()) {
            setSendError('חסר מזהה מועמד — לא ניתן לשלוח קו״ח.');
            return;
        }
        if (!referral.jobId || !String(referral.jobId).trim()) {
            setSendError('חסר מזהה משרה — לא ניתן לשלוח.');
            return;
        }
        if (selected.length === 0) {
            setSendError('בחרו לפחות נמען אחד עם אימייל.');
            return;
        }
        setSending(true);
        try {
            await Promise.resolve(onSend({ notes, nextStatus, contacts: selected }));
        } catch (e: unknown) {
            setSendError(e instanceof Error ? e.message : 'השליחה נכשלה');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-bg-card rounded-2xl shadow-2xl w-full sm:w-[750px] sm:max-w-[95vw] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden text-text-default"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                    <h2 className="text-xl font-bold text-text-default">שליחה חוזרת ללקוח</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 flex-1 overflow-y-auto">
                    <p className="text-sm text-text-muted mb-4 text-right">
                        <span className="font-semibold text-text-default">{referral.candidateName}</span>
                        {' · '}
                        <span>{referral.jobTitle}</span>
                        {referral.clientName ? (
                            <>
                                {' · '}
                                <span>{referral.clientName}</span>
                            </>
                        ) : null}
                    </p>
                    <div className="flex flex-col gap-6">
                        {(contactsError || metaHint || sendError) && (
                            <div className="space-y-2">
                                {contactsError && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 text-right" role="alert">
                                        {contactsError}
                                    </div>
                                )}
                                {metaHint && !contactsError && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 text-right">{metaHint}</div>
                                )}
                                {sendError && (
                                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 text-right" role="alert">
                                        {sendError}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-end mb-1.5">
                                <label className="block text-sm font-bold text-text-muted text-right">הערות שליחה ללקוח:</label>
                            </div>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="w-full h-[180px] sm:h-[240px] overflow-y-auto bg-bg-input border border-border-default rounded-lg p-4 text-sm resize-none outline-none focus:border-primary-400 transition-colors whitespace-pre-wrap break-words leading-relaxed"
                                dir="auto"
                                placeholder="הקלד הערות לשליחה או ערוך את גוף המייל השמור..."
                            />
                            <div className="flex flex-col items-start gap-1 mt-1">
                                <button
                                    type="button"
                                    onClick={() => void handleImportLastNote()}
                                    disabled={importLastNoteDisabled}
                                    className="text-sm font-semibold text-text-default hover:text-primary-700 underline underline-offset-4 decoration-border-default hover:decoration-primary-300 transition-colors disabled:opacity-40 disabled:no-underline"
                                >
                                    {importingListedNote ? 'מייבא מהרשימה…' : 'ייבוא הפניה אחרונה'}
                                </button>
                                {importListedNoteError ? (
                                    <p className="text-[11px] text-red-700 text-right">{importListedNoteError}</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-6 pt-6 border-t border-border-default">
                            <div>
                                <label className="block text-sm font-bold text-text-muted mb-3 text-right">הסטטוס הבא:</label>
                                <select
                                    value={nextStatus}
                                    onChange={(e) => setNextStatus(e.target.value)}
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm outline-none focus:border-primary-400 transition-colors"
                                >
                                    {nextStatusOptions.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-text-muted mb-3 text-right">
                                    לשלוח אל (אנשי קשר אצל הלקוח):
                                </label>
                                {loadingContacts ? (
                                    <div className="text-sm text-text-muted py-8 text-center">טוען אנשי קשר…</div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto p-1">
                                        {contacts.map((contact) => {
                                            const isSelected = selectedIds.includes(contact.id);
                                            return (
                                                <div
                                                    key={contact.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => handleContactToggle(contact.id)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            handleContactToggle(contact.id);
                                                        }
                                                    }}
                                                    className={`flex items-center gap-2 py-1.5 px-3 rounded-full border-2 cursor-pointer transition-all ${
                                                        isSelected
                                                            ? 'border-primary-400 bg-primary-50 shadow-sm'
                                                            : 'border-border-default bg-bg-card hover:border-border-hover'
                                                    }`}
                                                >
                                                    <div className={`flex items-center justify-center ${isSelected ? 'text-primary-600' : 'text-text-muted'}`}>
                                                        <CheckCircleIcon className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex flex-col ml-1 border-l border-border-default/50 pl-2 h-full justify-center min-w-0">
                                                        <span
                                                            className={`text-[13px] font-bold leading-tight truncate ${isSelected ? 'text-primary-900' : 'text-text-default'}`}
                                                        >
                                                            {contact.name || contact.email}
                                                        </span>
                                                        <span className={`text-[11px] truncate ${isSelected ? 'text-primary-600' : 'text-text-subtle'}`}>
                                                            {contact.role || contact.email}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-auto shrink-0 ${
                                                            isSelected ? 'bg-primary-100 text-primary-700' : 'bg-bg-subtle text-text-muted'
                                                        }`}
                                                    >
                                                        {getInitials(contact.name || contact.email || '?')}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3 flex-shrink-0 sticky bottom-0 z-10">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition" disabled={sending}>
                        ביטול
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={sending || loadingContacts || contacts.length === 0}
                        className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                        {sending ? 'שולח…' : 'שליחה'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ReReferModal;
