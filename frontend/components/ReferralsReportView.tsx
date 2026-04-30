
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
    MagnifyingGlassIcon, Cog6ToothIcon, Squares2X2Icon, TableCellsIcon,
    PencilIcon, PaperAirplaneIcon, ChevronDownIcon, CheckCircleIcon,
    ClockIcon, DocumentArrowDownIcon, ExclamationTriangleIcon,
    AdjustmentsHorizontalIcon, FunnelIcon, TrophyIcon, ArrowPathIcon
} from './Icons';
import UpdateStatusModal from './UpdateStatusModal';
import ReReferModal, { type ReReferSendPayload } from './ReReferModal';
import JobDetailsDrawer from './JobDetailsDrawer';
import { type Job } from './JobsView';
import type { Candidate } from './CandidatesListView';
import { useAuth } from '../context/AuthContext';

// --- TYPES ---
type ReferralStatus =
  | 'חדש'
  | 'בבדיקה'
  | 'ראיון'
  | 'הצעה'
  | 'התקבל'
  | 'נדחה'
  | 'התקבל לעבודה'
  | 'פעיל'
  | 'הוזמן לראיון'
  | 'לא רלוונטי'
  | 'מועמד משך עניין'
  | 'בארכיון'
  | 'בהמתנה'
  | 'נשלחו קו"ח'
  | 'נשלחו קורות חיים';

interface InterviewQA {
  question: string;
  answer: string;
}

interface ClientContact {
    id: number;
    name: string;
    email: string;
}

interface Referral {
  id: string;
  /** Backend candidate UUID — for opening summary drawer */
  candidateId: string | null;
  jobId: string | null;
  candidateName: string;
  avatar: string;
  clientName: string;
  jobTitle: string;
  coordinator: string;
  status: ReferralStatus;
  referralDate: string;
  lastUpdatedBy: string;
  source: string;
  interviewQA: InterviewQA[];
  feedbackSummary: string;
  recipientLine: string;
  internalNote: string;
  referralDueDate: string;
  referralDueTime: string;
  deliveryStatus?: unknown;
  clientContacts: ClientContact[];
  daysInStage?: number;
  candidatePhone: string;
  candidateEmail: string;
  inviteCandidate: boolean;
  inviteClient: boolean;
  /** Plain body from `notification_messages.text` for this screening send. */
  notificationText: string;
}

interface ReferralsReportViewProps {
    onOpenNewTask: () => void;
    onOpenCandidateSummary: (candidate: Candidate | number) => void;
}

const statusStyles: { [key: string]: string } = {
  'חדש': 'bg-blue-100 text-blue-800 border-blue-200',
  'בבדיקה': 'bg-purple-100 text-purple-800 border-purple-200',
  'ראיון': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'הצעה': 'bg-orange-100 text-orange-800 border-orange-200',
  'התקבל': 'bg-green-100 text-green-800 border-green-200',
  'התקבל לעבודה': 'bg-green-100 text-green-800 border-green-200',
  'פעיל': 'bg-teal-100 text-teal-800 border-teal-200',
  'נדחה': 'bg-gray-100 text-gray-700 border-gray-200',
  'הוזמן לראיון': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'לא רלוונטי': 'bg-gray-100 text-gray-600 border-gray-200',
  'מועמד משך עניין': 'bg-sky-100 text-sky-800 border-sky-200',
  'בארכיון': 'bg-gray-100 text-gray-600 border-gray-200',
  'בהמתנה': 'bg-amber-100 text-amber-800 border-amber-200',
  'נשלחו קו"ח': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  /** Same intent as ReRefer default label; recruitment_settings may use full wording */
  'נשלחו קורות חיים': 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

const statusOptions: ReferralStatus[] = ['חדש', 'בבדיקה', 'ראיון', 'הצעה', 'התקבל', 'נדחה', 'התקבל לעבודה', 'בהמתנה', 'פעיל'];

/** Row from GET /api/email-uploads/screening-cv-referrals */
interface ScreeningCvReferralApiRow {
  id: string;
  candidateId?: string | null;
  jobId?: string | null;
  candidateName?: string;
  jobTitle?: string;
  clientName?: string;
  clientId?: number | null;
  referralDate?: string;
  contactDate?: string;
  source?: string;
  coordinator?: string;
  status?: string;
  notes?: string;
  recipientLine?: string;
  internalNote?: string;
  dueDate?: string;
  dueTime?: string;
  clientContacts?: ClientContact[];
  deliveryStatus?: unknown;
  candidatePhone?: string;
  candidateEmail?: string;
  inviteCandidate?: boolean;
  inviteClient?: boolean;
  notificationText?: string;
}

/** Server aggregate stats (full filtered set, same filters as current page) */
interface ScreeningCvReferralsListStats {
  total: number;
  accepted: number;
  stages: {
    new: number;
    review: number;
    interview: number;
    offer: number;
    hired: number;
    rejected: number;
  };
  needsAttention: ScreeningCvReferralApiRow[];
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || '';
    const b = parts[parts.length - 1][0] || '';
    return (a + b).slice(0, 2) || '?';
  }
  const w = parts[0] || '?';
  return w.slice(0, 2);
}

function formatDeliveryForSummary(delivery: unknown): string {
  if (delivery == null) return '';
  if (typeof delivery === 'string') return delivery;
  try {
    return JSON.stringify(delivery);
  } catch {
    return String(delivery);
  }
}

function mapApiRowToReferral(row: ScreeningCvReferralApiRow): Referral {
  const referralDate = row.referralDate ? String(row.referralDate) : new Date().toISOString();
  const rd = new Date(referralDate);
  const daysInStage = Number.isFinite(rd.getTime())
    ? Math.max(0, Math.floor((Date.now() - rd.getTime()) / 86400000))
    : 0;
  const rawStatus = String(row.status || '').trim();
  const status = (rawStatus !== '' ? rawStatus : 'חדש') as ReferralStatus;
  const notes = String(row.notes || '');
  const recipientLine = String(row.recipientLine || '').trim() || (notes.includes('\n\n') ? notes.split('\n\n')[0] : notes);
  const internalNote = String(row.internalNote || '').trim();
  const deliveryLine = formatDeliveryForSummary(row.deliveryStatus);
  const feedbackSummary = [notes, deliveryLine ? `מצב משלוח: ${deliveryLine}` : ''].filter(Boolean).join('\n\n') || '—';
  const cid = row.candidateId != null && String(row.candidateId).trim() !== '' ? String(row.candidateId) : null;

  return {
    id: String(row.id),
    candidateId: cid,
    jobId: row.jobId != null && String(row.jobId).trim() !== '' ? String(row.jobId) : null,
    candidateName: String(row.candidateName || ''),
    avatar: initialsFromName(String(row.candidateName || '?')),
    clientName: String(row.clientName || ''),
    jobTitle: String(row.jobTitle || ''),
    coordinator: String(row.coordinator || ''),
    status,
    referralDate,
    lastUpdatedBy: String(row.coordinator || '—'),
    source: String(row.source || ''),
    interviewQA: [],
    feedbackSummary,
    recipientLine,
    internalNote,
    referralDueDate: row.dueDate != null ? String(row.dueDate).trim() : '',
    referralDueTime: row.dueTime != null ? String(row.dueTime).trim() : '',
    deliveryStatus: row.deliveryStatus,
    clientContacts: Array.isArray(row.clientContacts) ? row.clientContacts : [],
    daysInStage,
    candidatePhone: row.candidatePhone != null ? String(row.candidatePhone).trim() : '',
    candidateEmail: row.candidateEmail != null ? String(row.candidateEmail).trim() : '',
    inviteCandidate: Boolean(row.inviteCandidate),
    inviteClient: Boolean(row.inviteClient),
    notificationText: row.notificationText != null ? String(row.notificationText) : '',
  };
}

function referralToSummaryCandidate(r: Referral): Candidate {
  return {
    id: 0,
    backendId: r.candidateId || undefined,
    name: r.candidateName,
    avatar: r.avatar,
    title: r.jobTitle,
    status: r.status,
    lastActivity: '',
    source: r.source,
    tags: [],
    internalTags: [],
    matchScore: 0,
    phone: r.candidatePhone || '',
  };
}

const allColumns: { id: keyof Referral | 'actions'; header: string }[] = [
  { id: 'candidateName', header: 'שם המועמד' },
  { id: 'clientName', header: 'שם הלקוח' },
  { id: 'jobTitle', header: 'כותרת המשרה' },
  { id: 'coordinator', header: 'רכז' },
  { id: 'status', header: 'סטטוס' },
  { id: 'referralDate', header: 'תאריך הפניה' },
  { id: 'lastUpdatedBy', header: 'עודכן ע"י' },
  { id: 'source', header: 'מקור' },
];

type ReferralsFilterMultiselectProps = {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  triggerId: string;
  /** Shown when `options` is empty */
  emptyOptionsText?: string;
};

const ReferralsFilterMultiselect: React.FC<ReferralsFilterMultiselectProps> = ({
  options,
  value,
  onChange,
  triggerId,
  emptyOptionsText = 'אין אפשרויות',
}) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  const normalized = searchQuery.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalized) return options;
    return options.filter((opt) => opt.toLowerCase().includes(normalized));
  }, [options, normalized]);

  const summary =
    value.length === 0 ? 'הכל' : value.length === 1 ? value[0] : `${value.length} נבחרו`;

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((x) => x !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        id={triggerId}
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-white border border-border-default rounded-lg py-2 px-3 text-sm text-right flex items-center justify-between gap-2 min-h-[38px] focus:ring-2 focus:ring-primary-500/20 outline-none cursor-pointer"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate flex-1 min-w-0">{summary}</span>
        <ChevronDownIcon
          className={`w-4 h-4 flex-shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          className="absolute z-[80] mt-1 w-full min-w-0 max-h-64 flex flex-col bg-bg-card border border-border-default rounded-lg shadow-lg overflow-hidden"
          role="listbox"
          dir="rtl"
        >
          {options.length > 0 ? (
            <div
              className="shrink-0 p-2 border-b border-border-subtle bg-bg-subtle/40"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="relative">
                <MagnifyingGlassIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  dir="rtl"
                  autoComplete="off"
                  aria-label="חיפוש ברשימה"
                  placeholder="הקלד לחיפוש…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setOpen(false);
                    }
                  }}
                  className="w-full rounded-md border border-border-default bg-bg-input py-1.5 pl-3 pr-9 text-sm text-text-default placeholder:text-text-subtle focus:ring-2 focus:ring-primary-500/25 focus:border-primary-400 outline-none"
                />
              </div>
            </div>
          ) : null}
          <div className="overflow-y-auto min-h-0 max-h-[14rem] py-1.5">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-muted">{emptyOptionsText}</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-text-muted text-center">אין התאמה לחיפוש</div>
          ) : (
            filteredOptions.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-hover"
              >
                <input
                  type="checkbox"
                  checked={value.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="rounded border-border-default text-primary-600 focus:ring-primary-500/30 shrink-0"
                />
                <span className="flex-1 min-w-0 truncate">{opt}</span>
              </label>
            ))
          )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- WIDGET COMPONENTS ---

/** Pipeline bar width: relative to largest stage (classic funnel strip). */
const funnelBarWidthPct = (count: number, pipelineMax: number) => {
    if (count <= 0 || pipelineMax <= 0) return 0;
    const raw = (count / pipelineMax) * 100;
    return Math.min(100, Math.max(6, Math.round(raw * 10) / 10));
};

interface FunnelStages {
    new: number;
    review: number;
    interview: number;
    offer: number;
    hired: number;
    rejected: number;
}

const FUNNEL_PIPELINE_ROWS: {
    stageKey: keyof Pick<FunnelStages, 'new' | 'review' | 'interview' | 'offer'>;
    label: string;
    track: string;
    fill: string;
}[] = [
    { stageKey: 'new', label: 'חדש', track: 'bg-blue-100', fill: 'bg-blue-500' },
    { stageKey: 'review', label: 'בבדיקה', track: 'bg-purple-100', fill: 'bg-purple-500' },
    { stageKey: 'interview', label: 'ראיון', track: 'bg-yellow-100', fill: 'bg-yellow-500' },
    { stageKey: 'offer', label: 'הצעה', track: 'bg-orange-100', fill: 'bg-orange-500' },
];

const FunnelWidget: React.FC<{ stages: FunnelStages; totalFiltered: number }> = ({ stages, totalFiltered }) => {
    const pipelineMax = Math.max(stages.new, stages.review, stages.interview, stages.offer, 1);
    const hireRatePct =
        totalFiltered > 0 ? Math.round((stages.hired / totalFiltered) * 1000) / 10 : 0;
    const rejectRatePct =
        totalFiltered > 0 ? Math.round((stages.rejected / totalFiltered) * 1000) / 10 : 0;

    return (
        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-4">
            <h3 className="font-bold text-text-default text-sm mb-1 flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-primary-500 shrink-0" />
                משפך גיוס
            </h3>
            <p className="text-[10px] text-text-muted mb-3 leading-snug">
                רוחב הפסים — יחס לשלב הגבוה ביותר במשפך (לפי המסננים הנוכחיים)
            </p>
            <div className="space-y-3">
                {FUNNEL_PIPELINE_ROWS.map(({ stageKey, label, track, fill }) => {
                    const count = stages[stageKey];
                    const w = funnelBarWidthPct(count, pipelineMax);
                    return (
                        <div
                            key={stageKey}
                            className="flex items-center justify-between gap-2 text-xs"
                            title={`${label}: ${count}`}
                        >
                            <span className="font-medium text-text-default w-14 shrink-0">{label}</span>
                            <div className={`flex items-center gap-2 flex-1 min-w-0 mx-1 ${track} rounded-full h-2.5 relative overflow-hidden`}>
                                <div
                                    className={`absolute top-0 right-0 h-full ${fill} rounded-full transition-[width] duration-300 ease-out`}
                                    style={{ width: `${w}%` }}
                                />
                            </div>
                            <span className="font-bold tabular-nums min-w-[1.75rem] text-left text-text-default shrink-0">
                                {count}
                            </span>
                        </div>
                    );
                })}
                <div className="pt-2 border-t border-border-subtle mt-1 space-y-2">
                    <div className="flex justify-between items-center text-sm font-bold text-green-700 bg-green-50 p-2 rounded-lg gap-2">
                        <span className="flex items-center gap-1 min-w-0">
                            <TrophyIcon className="w-3.5 h-3.5 shrink-0" />
                            התקבלו
                        </span>
                        <span className="tabular-nums shrink-0">
                            {stages.hired}
                            {totalFiltered > 0 ? (
                                <span className="text-[10px] font-semibold text-green-600/90 mr-1">({hireRatePct}%)</span>
                            ) : null}
                        </span>
                    </div>
                    {stages.rejected > 0 ? (
                        <div className="flex justify-between items-center text-xs font-semibold text-gray-700 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                            <span>נדחו</span>
                            <span className="tabular-nums">
                                {stages.rejected}
                                {totalFiltered > 0 ? (
                                    <span className="text-[10px] font-medium text-gray-500 mr-1">({rejectRatePct}%)</span>
                                ) : null}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

const AttentionItem: React.FC<{ name: string; job: string; days: number; onClick: () => void }> = ({ name, job, days, onClick }) => (
    <div 
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg hover:bg-red-50 cursor-pointer group transition-colors border border-transparent hover:border-red-100 mb-1 last:mb-0"
    >
        <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
            </div>
            <div className="min-w-0">
                <p className="font-bold text-text-default text-xs truncate">{name}</p>
                <p className="text-[10px] text-text-muted truncate">{job}</p>
            </div>
        </div>
        <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-red-600 bg-white px-2 py-0.5 rounded-full border border-red-100 shadow-sm shrink-0 whitespace-nowrap">
                {days} ימים
            </span>
        </div>
    </div>
);

const ActionButton: React.FC<{ icon: React.ReactNode; tooltip: string; onClick?: (e: React.MouseEvent) => void }> = ({ icon, tooltip, onClick }) => (
    <button onClick={onClick} title={tooltip} className="p-2 text-text-subtle hover:text-primary-600 hover:bg-bg-hover rounded-full transition-colors">
        {icon}
    </button>
);

const ExpandedRowContent: React.FC<{ referral: Referral, className?: string, layout?: 'row' | 'card' }> = ({ referral, className, layout = 'row' }) => (
    <div className={className}>
        <div className={`grid gap-4 text-sm ${layout === 'row' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
                <p className="font-bold text-text-default mb-1">תקציר / פידבק:</p>
                <p className="text-text-muted bg-white p-3 rounded-lg border border-border-default whitespace-pre-line leading-relaxed">{referral.feedbackSummary}</p>
                {referral.notificationText.trim() !== '' ? (
                    <div className="mt-3">
                        <div
                            className="text-text-muted bg-white p-3 rounded-lg border border-border-default whitespace-pre-wrap break-words leading-relaxed max-h-[min(320px,50vh)] overflow-y-auto"
                            dir="auto"
                        >
                            {referral.notificationText}
                        </div>
                    </div>
                ) : null}
            </div>
            {referral.interviewQA.length > 0 && (
                <div>
                     <p className="font-bold text-text-default mb-1">שאלות סינון:</p>
                     <div className="space-y-2">
                        {referral.interviewQA.map((qa, i) => (
                            <div key={i} className="bg-white p-2 rounded-lg border border-border-default">
                                <p className="font-semibold text-xs text-primary-700">{qa.question}</p>
                                <p className="text-text-muted text-xs mt-1">{qa.answer}</p>
                            </div>
                        ))}
                     </div>
                </div>
            )}
        </div>
    </div>
);

const ReferralGridCard: React.FC<{ 
    referral: Referral, 
    isExpanded: boolean, 
    onToggle: () => void,
    onEdit: (e: React.MouseEvent) => void,
    onReRefer: (e: React.MouseEvent) => void
}> = ({ referral, isExpanded, onToggle, onEdit, onReRefer }) => {
    return (
        <div className={`bg-bg-card rounded-xl border border-border-default p-4 shadow-sm hover:shadow-md transition-all flex flex-col h-full ${isExpanded ? 'ring-1 ring-primary-200' : ''}`}>
             <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold border border-primary-200 text-xs">
                        {referral.avatar}
                    </div>
                    <div>
                        <h4 className="font-bold text-text-default">{referral.candidateName}</h4>
                        <p className="text-xs text-text-muted truncate max-w-[150px]">{referral.jobTitle}</p>
                    </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyles[referral.status] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                    {referral.status}
                </span>
             </div>
             
             <div className="text-xs text-text-muted space-y-1 mb-3 flex-grow">
                <p>לקוח: <span className="font-semibold text-text-default">{referral.clientName}</span></p>
                <p>רכז: {referral.coordinator}</p>
                <p>תאריך: {new Date(referral.referralDate).toLocaleDateString('he-IL')}</p>
             </div>
             
             {isExpanded && (
                 <ExpandedRowContent 
                    referral={referral} 
                    className="mb-3 pt-3 border-t border-border-default bg-bg-subtle/30 p-2 rounded-lg -mx-2" 
                    layout="card" 
                />
             )}

             <div className="flex items-center gap-2 pt-3 border-t border-border-default mt-auto">
                 <button onClick={onToggle} className="flex-1 py-1.5 text-xs font-semibold bg-bg-subtle hover:bg-bg-hover text-text-muted rounded transition-colors flex items-center justify-center gap-1">
                    <span>{isExpanded ? 'סגור פרטים' : 'פרטים מלאים'}</span>
                    <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                 </button>
                 <button onClick={onEdit} className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="ערוך סטטוס">
                     <PencilIcon className="w-4 h-4" />
                 </button>
                 <button onClick={onReRefer} className="p-1.5 text-text-subtle hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="הפניה מחדש">
                     <PaperAirplaneIcon className="w-4 h-4" />
                 </button>
             </div>
        </div>
    );
};

// --- MAIN VIEW ---

const userLabelsFromRows = (
    rows: { name?: string; email?: string; isActive?: boolean }[] | null | undefined,
): string[] => {
    if (!Array.isArray(rows) || !rows.length) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
        if (row?.isActive === false) continue;
        const label = String(row.name || '').trim() || String(row.email || '').trim();
        if (label && !seen.has(label)) {
            seen.add(label);
            out.push(label);
        }
    }
    return out.sort((a, b) => a.localeCompare(b, 'he'));
};

const ReferralsReportView: React.FC<ReferralsReportViewProps> = ({ onOpenNewTask, onOpenCandidateSummary }) => {
    const { user } = useAuth();
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
    const apiBase = import.meta.env.VITE_API_BASE || '';

    // Data State
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [referralsLoading, setReferralsLoading] = useState(false);
    const [listStats, setListStats] = useState<ScreeningCvReferralsListStats | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [jobsListLoading, setJobsListLoading] = useState(false);
    const [apiClientLabels, setApiClientLabels] = useState<string[]>([]);
    const [clientsListLoading, setClientsListLoading] = useState(false);
    const [coordinatorApiLabels, setCoordinatorApiLabels] = useState<string[]>([]);
    const [coordinatorsListLoading, setCoordinatorsListLoading] = useState(false);

    // Filters + sort (must be declared before `fetchReferrals` below)
    const [filters, setFilters] = useState({
        searchTerm: '',
        dateRange: 'month',
        referralDate: thirtyDaysAgo.toISOString().split('T')[0],
        referralDateEnd: today.toISOString().split('T')[0],
        status: '',
        clientNames: [] as string[],
        candidateName: '',
        jobTitles: [] as string[],
        coordinators: [] as string[],
        source: '',
        lastUpdatedBys: [] as string[],
    });
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>([
        'status',
        'candidateName',
        'jobTitle',
        'clientName',
        'referralDate',
        'coordinator',
    ]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Referral; direction: 'asc' | 'desc' } | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const dragItemIndex = useRef<number | null>(null);
    const [showMobileStats, setShowMobileStats] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
    const [reReferModal, setReReferModal] = useState<{ isOpen: boolean; referral: Referral | null }>({
        isOpen: false,
        referral: null,
    });
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const skipSearchPageReset = useRef(true);

    useEffect(() => {
        if (!apiBase) return;
        let active = true;
        setJobsListLoading(true);
        (async () => {
            try {
                const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
                const res = await fetch(`${apiBase}/api/jobs`, {
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    cache: 'no-store',
                });
                if (!res.ok) throw new Error('Failed to fetch jobs');
                const payload = await res.json();
                if (active) {
                    setJobs(Array.isArray(payload) ? payload : []);
                }
            } catch (err) {
                console.error('[ReferralsReportView] failed to load jobs', err);
                if (active) setJobs([]);
            } finally {
                if (active) setJobsListLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [apiBase]);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(filters.searchTerm), 300);
        return () => clearTimeout(t);
    }, [filters.searchTerm]);

    useEffect(() => {
        if (skipSearchPageReset.current) {
            skipSearchPageReset.current = false;
            return;
        }
        setPage(1);
    }, [debouncedSearch]);

    const fetchReferrals = useCallback(async () => {
        if (!apiBase) {
            setReferrals([]);
            setListStats(null);
            setTotalCount(0);
            setTotalPages(1);
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setReferrals([]);
            setListStats(null);
            setTotalCount(0);
            setTotalPages(1);
            return;
        }
        setReferralsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('pageSize', String(pageSize));
            const s = debouncedSearch.trim();
            if (s) params.set('search', s);
            if (filters.referralDate) params.set('referralDate', filters.referralDate);
            if (filters.referralDateEnd) params.set('referralDateEnd', filters.referralDateEnd);
            if (filters.status) params.set('status', filters.status);
            if (filters.clientNames.length) params.set('clientNames', filters.clientNames.join(','));
            if (filters.jobTitles.length) params.set('jobTitles', filters.jobTitles.join(','));
            if (filters.coordinators.length) params.set('coordinators', filters.coordinators.join(','));
            if (filters.lastUpdatedBys.length) params.set('lastUpdatedBys', filters.lastUpdatedBys.join(','));
            const cn = filters.candidateName.trim();
            if (cn) params.set('candidateName', cn);
            const src = filters.source.trim();
            if (src) params.set('source', src);
            const sk = sortConfig?.key ?? 'referralDate';
            const sd = sortConfig?.direction ?? 'desc';
            params.set('sortKey', String(sk));
            params.set('sortDir', sd);
            const res = await fetch(`${apiBase}/api/email-uploads/screening-cv-referrals?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            const raw: unknown = res.ok ? await res.json() : null;
            const rows: ScreeningCvReferralApiRow[] = Array.isArray(raw)
                ? (raw as ScreeningCvReferralApiRow[])
                : (raw && typeof raw === 'object' && 'items' in (raw as object)
                    ? ((raw as { items?: ScreeningCvReferralApiRow[] }).items ?? [])
                    : []);
            if (Array.isArray(raw)) {
                setReferrals(rows.map(mapApiRowToReferral));
                setListStats(null);
                setTotalCount(rows.length);
                setTotalPages(1);
            } else if (raw && typeof raw === 'object') {
                const p = raw as {
                    items?: ScreeningCvReferralApiRow[];
                    total?: number;
                    totalPages?: number;
                    stats?: ScreeningCvReferralsListStats;
                };
                setReferrals((p.items ?? []).map(mapApiRowToReferral));
                setTotalCount(typeof p.total === 'number' ? p.total : 0);
                setTotalPages(typeof p.totalPages === 'number' ? Math.max(1, p.totalPages) : 1);
                setListStats(
                    p.stats && typeof p.stats === 'object'
                        ? { ...p.stats, needsAttention: p.stats.needsAttention ?? [] }
                        : null,
                );
            } else {
                setReferrals([]);
                setListStats(null);
                setTotalCount(0);
                setTotalPages(1);
            }
        } catch {
            setReferrals([]);
            setListStats(null);
            setTotalCount(0);
            setTotalPages(1);
        } finally {
            setReferralsLoading(false);
        }
    }, [
        apiBase,
        page,
        pageSize,
        debouncedSearch,
        filters.referralDate,
        filters.referralDateEnd,
        filters.status,
        filters.clientNames,
        filters.jobTitles,
        filters.coordinators,
        filters.lastUpdatedBys,
        filters.candidateName,
        filters.source,
        sortConfig,
    ]);

    /** First row from GET screening-cv-referrals for the same candidate (same filters/sort as the report, page=1, pageSize=1). */
    const fetchFirstScreeningCvRowForReRefer = useCallback(
        async (candidateId: string | null): Promise<ScreeningCvReferralApiRow | null> => {
            const cid = candidateId != null ? String(candidateId).trim() : '';
            if (!cid) return null;
            if (!apiBase) return null;
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
            if (!token) return null;
            const params = new URLSearchParams();
            params.set('page', '1');
            params.set('pageSize', '1');
            params.set('candidateId', cid);
            const s = debouncedSearch.trim();
            if (s) params.set('search', s);
        if (filters.referralDate) params.set('referralDate', filters.referralDate);
        if (filters.referralDateEnd) params.set('referralDateEnd', filters.referralDateEnd);
        if (filters.status) params.set('status', filters.status);
        if (filters.clientNames.length) params.set('clientNames', filters.clientNames.join(','));
        if (filters.jobTitles.length) params.set('jobTitles', filters.jobTitles.join(','));
        if (filters.coordinators.length) params.set('coordinators', filters.coordinators.join(','));
        if (filters.lastUpdatedBys.length) params.set('lastUpdatedBys', filters.lastUpdatedBys.join(','));
        const cn = filters.candidateName.trim();
        if (cn) params.set('candidateName', cn);
        const src = filters.source.trim();
        if (src) params.set('source', src);
        const sk = sortConfig?.key ?? 'referralDate';
        const sd = sortConfig?.direction ?? 'desc';
        params.set('sortKey', String(sk));
        params.set('sortDir', sd);
        const res = await fetch(`${apiBase}/api/email-uploads/screening-cv-referrals?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        });
        const raw: unknown = await res.json().catch(() => null);
        if (!res.ok) {
            const msg =
                raw && typeof raw === 'object' && raw !== null && 'message' in raw
                    ? String((raw as { message?: string }).message || '')
                    : '';
            throw new Error(msg.trim() ? msg : 'בקשת הרשימה נכשלה');
        }
        let first: ScreeningCvReferralApiRow | undefined;
        if (Array.isArray(raw) && raw.length > 0) {
            first = raw[0] as ScreeningCvReferralApiRow;
        } else if (raw && typeof raw === 'object' && 'items' in raw) {
            const items = (raw as { items?: ScreeningCvReferralApiRow[] }).items;
            if (Array.isArray(items) && items.length > 0) first = items[0];
        }
        return first ?? null;
    }, [
        apiBase,
        debouncedSearch,
        filters.referralDate,
        filters.referralDateEnd,
        filters.status,
        filters.clientNames,
        filters.jobTitles,
        filters.coordinators,
        filters.lastUpdatedBys,
        filters.candidateName,
        filters.source,
        sortConfig,
    ]);

    const handleApplyFirstListedReferralToReReferModal = useCallback(
        async (candidateId: string | null) => {
            const cid = candidateId != null ? String(candidateId).trim() : '';
            if (!cid) {
                throw new Error('חסר מזהה מועמד — לא ניתן לייבא מהרשימה.');
            }
            const row = await fetchFirstScreeningCvRowForReRefer(cid);
            if (!row) {
                throw new Error('אין הפניה של אותו מועמד ברשימה לפי המסננים.');
            }
            if (String(row.candidateId || '').trim() !== cid) {
                throw new Error('ייבוא נכשל — המועמד אינו תואם.');
            }
            setReReferModal({ isOpen: true, referral: mapApiRowToReferral(row) });
        },
        [fetchFirstScreeningCvRowForReRefer],
    );

    useEffect(() => {
        void fetchReferrals();
    }, [fetchReferrals]);

    useEffect(() => {
        if (page > totalPages) setPage(Math.max(1, totalPages));
    }, [totalPages, page]);

    useEffect(() => {
        if (!apiBase) {
            setApiClientLabels([]);
            return;
        }
        let cancelled = false;
        setClientsListLoading(true);
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetch(`${apiBase}/api/clients?activeOnly=true`, {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((rows: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                const labels = list
                    .map((c: Record<string, unknown>) =>
                        String((c.displayName as string) || (c.name as string) || '').trim(),
                    )
                    .filter(Boolean);
                const unique = [...new Set(labels)].sort((a, b) => a.localeCompare(b, 'he'));
                setApiClientLabels(unique);
            })
            .catch(() => {
                if (!cancelled) setApiClientLabels([]);
            })
            .finally(() => {
                if (!cancelled) setClientsListLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase) {
            setCoordinatorApiLabels([]);
            return;
        }
        let cancelled = false;
        setCoordinatorsListLoading(true);
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const role = String(user?.role || '').toLowerCase();
        const clientId = user?.clientId && String(user.clientId).trim() ? String(user.clientId) : '';

        const fetchStaffUsers = async (): Promise<string[]> => {
            if (!clientId) return [];
            const r = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/staff-users`, {
                credentials: 'include',
                headers,
                cache: 'no-store',
            });
            const data = r.ok ? await r.json() : [];
            const list = Array.isArray(data) ? data : [];
            return userLabelsFromRows(list as { name?: string; email?: string; isActive?: boolean }[]);
        };

        const run = async () => {
            if (role === 'super_admin' || role === 'admin') {
                try {
                    const r = await fetch(`${apiBase}/api/users`, {
                        credentials: 'include',
                        headers,
                        cache: 'no-store',
                    });
                    if (r.ok) {
                        const data = (await r.json()) as unknown;
                        if (cancelled) return;
                        const list = Array.isArray(data) ? data : [];
                        setCoordinatorApiLabels(
                            userLabelsFromRows(list as { name?: string; email?: string; isActive?: boolean }[]),
                        );
                        return;
                    }
                } catch {
                    /* use tenant staff list below */
                }
            }
            if (cancelled) return;
            const staff = await fetchStaffUsers();
            if (!cancelled) setCoordinatorApiLabels(staff);
        };

        void run()
            .catch(() => {
                if (!cancelled) setCoordinatorApiLabels([]);
            })
            .finally(() => {
                if (!cancelled) setCoordinatorsListLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, user?.role, user?.clientId]);

    const clientFilterOptions = useMemo(() => [...apiClientLabels].sort((a, b) => a.localeCompare(b, 'he')), [apiClientLabels]);

    const jobTitleFilterOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const j of jobs) {
            const t = String(j.title || '').trim();
            if (t && !seen.has(t)) {
                seen.add(t);
                out.push(t);
            }
        }
        return out.sort((a, b) => a.localeCompare(b, 'he'));
    }, [jobs]);

    const coordinatorFilterOptions = useMemo(
        () => [...coordinatorApiLabels].sort((a, b) => a.localeCompare(b, 'he')),
        [coordinatorApiLabels],
    );

    /** Same user pool as רכז; labels from users/staff (not current page of referrals). */
    const updaterFilterOptions = useMemo(
        () => [...coordinatorApiLabels].sort((a, b) => a.localeCompare(b, 'he')),
        [coordinatorApiLabels],
    );
    
    // --- Logic ---

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name !== 'searchTerm') setPage(1);
        setFilters((prev) => {
            const next = { ...prev, [name]: value } as typeof prev;
            if (name === 'referralDate' || name === 'referralDateEnd') next.dateRange = 'custom';
            return next;
        });
    };

    const handleClearFilters = () => {
        setPage(1);
        setFilters({
            searchTerm: '',
            dateRange: 'month',
            referralDate: thirtyDaysAgo.toISOString().split('T')[0],
            referralDateEnd: today.toISOString().split('T')[0],
            status: '',
            clientNames: [],
            candidateName: '',
            jobTitles: [],
            coordinators: [],
            source: '',
            lastUpdatedBys: [],
        });
        setIsAdvancedSearchOpen(false);
    };

    const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
        setPage(1);
        const end = new Date();
        const start = new Date();
        if (preset === 'week') start.setDate(end.getDate() - 7);
        if (preset === 'month') start.setDate(end.getDate() - 30);
        if (preset === 'quarter') start.setDate(end.getDate() - 90);

        setFilters((prev) => ({
            ...prev,
            dateRange: preset,
            referralDate: start.toISOString().split('T')[0],
            referralDateEnd: end.toISOString().split('T')[0],
        }));
    };

    const insights = useMemo(() => {
        if (listStats) {
            return {
                total: listStats.total,
                accepted: listStats.accepted,
                stages: listStats.stages,
                needsAttention: (listStats.needsAttention || []).map(mapApiRowToReferral),
            };
        }
        return {
            total: 0,
            accepted: 0,
            stages: {
                new: 0,
                review: 0,
                interview: 0,
                offer: 0,
                hired: 0,
                rejected: 0,
            },
            needsAttention: [] as Referral[],
        };
    }, [listStats]);

    const requestSort = (key: keyof Referral) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof Referral) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-primary-500 font-bold text-xs ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const buildFallbackJob = (jobTitle: string, clientName: string): Job => ({
        id: Date.now(),
        title: jobTitle,
        client: clientName,
        field: 'לא צויין',
        role: 'לא צויין',
        priority: 'רגילה',
        clientType: 'כללי',
        city: 'לא צויין',
        region: 'לא צויין',
        gender: 'לא משנה',
        mobility: false,
        licenseType: 'לא צויין',
        postingCode: '',
        validityDays: 30,
        recruitingCoordinator: 'מערכת',
        accountManager: 'מערכת',
        salaryMin: 0,
        salaryMax: 0,
        ageMin: 18,
        ageMax: 65,
        openPositions: 1,
        status: 'טיוטה',
        associatedCandidates: 0,
        waitingForScreening: 0,
        activeProcess: 0,
        openDate: new Date().toISOString(),
        recruiter: 'מערכת',
        location: 'לא צויין',
        jobType: 'לא צויין',
        description: 'פרטי משרה לא זמינים',
        requirements: [],
        rating: 0,
        healthProfile: 'standard',
    });

    const handleOpenJobDrawer = (jobTitle: string, clientName: string) => {
         const job = jobs.find(j => j.title === jobTitle);
         const jobMap: {[key: string]: number} = { 'מפתח/ת Fullstack בכיר/ה': 2, 'מנהל/ת מוצר לחטיבת הפינטק': 7, 'מעצב/ת UX/UI': 3 };
         const fallbackJob = jobs.find(j => j.id === (jobMap[jobTitle] || 1));
         if (job || fallbackJob) {
            setSelectedJob(job || fallbackJob || null);
            setIsDrawerOpen(true);
            return;
         }
         setSelectedJob(buildFallbackJob(jobTitle, clientName));
         setIsDrawerOpen(true);
    };
    
    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]);
    };
    
    const handleDragStart = (index: number, colId: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };
    
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newVisibleColumns = [...visibleColumns];
        const draggedItem = newVisibleColumns.splice(dragItemIndex.current, 1)[0];
        newVisibleColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newVisibleColumns);
    };
    
    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    const handleOpenStatusModal = (e: React.MouseEvent, referral: Referral) => {
        e.stopPropagation();
        setEditingReferral(referral);
        setIsStatusModalOpen(true);
    };

    const handleSaveStatusUpdate = async (data: any) => {
        if (!editingReferral) return;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!apiBase || !token) {
            setReferrals(prev =>
                prev.map(r =>
                    r.id === editingReferral.id
                        ? {
                              ...r,
                              status: data.status as ReferralStatus,
                              internalNote: data.note != null ? String(data.note).trim() : '',
                              referralDueDate: String(data.dueDate || ''),
                              referralDueTime: String(data.dueTime || ''),
                              inviteCandidate: Boolean(data.inviteCandidate),
                              inviteClient: Boolean(data.inviteClient),
                          }
                        : r,
                ),
            );
            setIsStatusModalOpen(false);
            setEditingReferral(null);
            return;
        }
        const payload: Record<string, unknown> = {
            status: data.status,
            dueDate: data.dueDate || null,
            dueTime: data.dueTime || null,
            note: data.note != null ? String(data.note) : '',
            inviteCandidate: Boolean(data.inviteCandidate),
            inviteClient: Boolean(data.inviteClient),
        };

        const res = await fetch(`${apiBase}/api/email-uploads/screening-cv-referrals/${editingReferral.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'שמירה נכשלה');
        }
        const recipientLine = editingReferral.recipientLine || (editingReferral.feedbackSummary.split('\n\n')[0] || '');
        const nextInternal = data.note != null ? String(data.note).trim() : '';
        const notesCombined = nextInternal ? `${recipientLine}\n\n${nextInternal}` : recipientLine;
        const deliveryLine = formatDeliveryForSummary(editingReferral.deliveryStatus);
        const feedbackSummary = [notesCombined, deliveryLine ? `מצב משלוח: ${deliveryLine}` : ''].filter(Boolean).join('\n\n') || '—';

        setReferrals(prev =>
            prev.map(r =>
                r.id !== editingReferral.id
                    ? r
                    : {
                          ...r,
                          status: data.status as ReferralStatus,
                          internalNote: nextInternal,
                          recipientLine,
                          feedbackSummary,
                          referralDueDate: String(data.dueDate || ''),
                          referralDueTime: String(data.dueTime || ''),
                          inviteCandidate: Boolean(data.inviteCandidate),
                          inviteClient: Boolean(data.inviteClient),
                      },
            ),
        );
        setIsStatusModalOpen(false);
        setEditingReferral(null);
        void fetchReferrals();
    };

    const handleOpenReReferModal = (e: React.MouseEvent, referral: Referral) => {
        e.stopPropagation();
        setReReferModal({ isOpen: true, referral });
    };

    const notesToOpinionHtml = (text: string): string => {
        if (!text?.trim()) return '';
        const esc = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return `<div dir="rtl">${esc(text).replace(/\n/g, '<br/>')}</div>`;
    };

    const handleSendReReferral = async (data: ReReferSendPayload) => {
        const ref = reReferModal.referral;
        if (!ref) return;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (apiBase && token && ref.candidateId && ref.jobId) {
            const res = await fetch(`${apiBase}/api/email-uploads/send-screening-cv`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    candidateId: ref.candidateId,
                    sends: [
                        {
                            jobId: ref.jobId,
                            jobTitle: ref.jobTitle,
                            company: ref.clientName,
                            contacts: data.contacts.map((c) => ({ email: c.email, name: c.name })),
                            internalOpinionHtml: notesToOpinionHtml(data.notes),
                        },
                    ],
                }),
            });
            const errBody = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(typeof errBody?.message === 'string' ? errBody.message : 'שליחת המייל נכשלה');
            }
            await fetch(`${apiBase}/api/email-uploads/screening-cv-referrals/${ref.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: data.nextStatus }),
            }).catch(() => {});
        }
        setReReferModal({ isOpen: false, referral: null });
        setReferrals((prev) =>
            prev.map((r) => (r.id === ref.id ? { ...r, status: data.nextStatus as ReferralStatus } : r)),
        );
        void fetchReferrals();
    };

    const renderCell = (referral: Referral, columnId: string) => {
        switch (columnId) {
            case 'status':
                return (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyles[referral.status] || 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                        {referral.status}
                    </span>
                );
            case 'candidateName':
                return (
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">
                            {referral.avatar}
                        </div>
                        <span className="font-semibold text-text-default">{referral.candidateName}</span>
                    </div>
                );
            case 'jobTitle':
                return <button type="button" onClick={() => handleOpenJobDrawer(referral.jobTitle, referral.clientName)} className="text-primary-600 hover:underline font-medium">{referral.jobTitle}</button>;
            case 'clientName':
                 return <span className="font-medium text-text-default">{referral.clientName}</span>;
            case 'referralDate':
                return <span className="text-text-muted">{new Date(referral.referralDate).toLocaleDateString('he-IL')}</span>;
             case 'coordinator':
                 return <span className="text-text-muted">{referral.coordinator}</span>;
             case 'lastUpdatedBy':
                 return <span className="text-text-muted">{referral.lastUpdatedBy}</span>;
             case 'source':
                 return <span className="text-text-muted">{referral.source}</span>;
            default:
                return (referral as any)[columnId];
        }
    };

    // --- RENDER ---
    return (
        <div className="flex flex-col gap-4">
             {/* Header */}
             <div className="flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                 <div>
                     <h1 className="text-2xl font-black text-text-default mb-1">דוח הפניות</h1>
                     <p className="text-text-muted text-sm">סקירה מקיפה של כל תהליכי הגיוס הפעילים</p>
                 </div>
                 
                 {/* Top KPI Cards (The "Board") - Grid layout for mobile */}
                 <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
                     <div className="bg-white border border-border-default rounded-xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-right gap-1 sm:gap-3 shadow-sm">
                         <div className="p-1.5 sm:p-2 bg-blue-100 text-blue-600 rounded-lg"><DocumentArrowDownIcon className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                         <div><p className="text-[10px] sm:text-xs text-text-muted font-bold whitespace-nowrap">סה"כ הפניות</p><p className="text-lg sm:text-xl font-black text-text-default">{insights.total}</p></div>
                     </div>
                     <div className="bg-white border border-border-default rounded-xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-right gap-1 sm:gap-3 shadow-sm">
                         <div className="p-1.5 sm:p-2 bg-purple-100 text-purple-600 rounded-lg"><ClockIcon className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                         <div><p className="text-[10px] sm:text-xs text-text-muted font-bold whitespace-nowrap">בתהליך</p><p className="text-lg sm:text-xl font-black text-text-default">{insights.stages.new + insights.stages.review + insights.stages.interview + insights.stages.offer}</p></div>
                     </div>
                     <div className="bg-white border border-border-default rounded-xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-right gap-1 sm:gap-3 shadow-sm">
                         <div className="p-1.5 sm:p-2 bg-green-100 text-green-600 rounded-lg"><CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                         <div><p className="text-[10px] sm:text-xs text-text-muted font-bold whitespace-nowrap">השמות</p><p className="text-lg sm:text-xl font-black text-text-default">{insights.accepted}</p></div>
                     </div>
                 </div>
             </div>

            {/* Split Search Bar */}
            <div className="bg-bg-card p-3 rounded-2xl shadow-sm border border-border-default flex-shrink-0 relative z-20">
                <div className="flex flex-col xl:flex-row gap-3 items-center">
                    <div className="relative flex-grow w-full xl:w-auto">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="text" name="searchTerm" value={filters.searchTerm} onChange={handleFilterChange} placeholder="חיפוש מועמד, לקוח או משרה..." className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-shadow" />
                    </div>

                    <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default overflow-x-auto no-scrollbar w-full xl:w-auto">
                        {['today', 'week', 'month', 'quarter'].map(p => (
                             <button key={p} onClick={() => applyDatePreset(p as any)} className={`flex-1 xl:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${filters.dateRange === p ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>
                                {p === 'today' ? 'היום' : p === 'week' ? 'השבוע' : p === 'month' ? 'החודש' : 'רבעון'}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all whitespace-nowrap font-bold text-sm w-full xl:w-auto ${isAdvancedSearchOpen ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-border-default text-text-muted hover:bg-bg-subtle'}`}
                    >
                        <AdjustmentsHorizontalIcon className="w-5 h-5" />
                        <span>מסננים נוספים</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {/* Advanced Drawer */}
                {isAdvancedSearchOpen && (
                     <div className="mt-4 p-4 bg-bg-subtle/50 border border-border-default rounded-xl grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in shadow-inner">
                        <div><label className="block text-xs font-bold text-text-muted mb-1">תאריך מ-</label><input type="date" name="referralDate" value={filters.referralDate} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">תאריך עד-</label><input type="date" name="referralDateEnd" value={filters.referralDateEnd} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">סטטוס / שלב</label><select name="status" value={filters.status} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm"><option value="">הכל</option>{statusOptions.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                        <div>
                            <label htmlFor="filter-referrals-client" className="block text-xs font-bold text-text-muted mb-1">
                                לקוח
                            </label>
                            {clientsListLoading ? (
                                <p className="text-[10px] text-text-muted mb-1">טוען רשימת לקוחות…</p>
                            ) : null}
                            <ReferralsFilterMultiselect
                                triggerId="filter-referrals-client"
                                options={clientFilterOptions}
                                value={filters.clientNames}
                                onChange={(clientNames) => {
                                    setPage(1);
                                    setFilters((prev) => ({ ...prev, clientNames }));
                                }}
                                emptyOptionsText="אין לקוחות ברשימה"
                            />
                        </div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">מועמד</label><input type="text" name="candidateName" value={filters.candidateName} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" placeholder="שם מועמד..." /></div>
                        <div>
                            <label htmlFor="filter-referrals-job" className="block text-xs font-bold text-text-muted mb-1">
                                משרה
                            </label>
                            {jobsListLoading ? (
                                <p className="text-[10px] text-text-muted mb-1">טוען משרות…</p>
                            ) : null}
                            <ReferralsFilterMultiselect
                                triggerId="filter-referrals-job"
                                options={jobTitleFilterOptions}
                                value={filters.jobTitles}
                                onChange={(jobTitles) => {
                                    setPage(1);
                                    setFilters((prev) => ({ ...prev, jobTitles }));
                                }}
                                emptyOptionsText="אין משרות ברשימה"
                            />
                        </div>
                        <div>
                            <label htmlFor="filter-referrals-coordinator" className="block text-xs font-bold text-text-muted mb-1">
                                רכז
                            </label>
                            {coordinatorsListLoading ? (
                                <p className="text-[10px] text-text-muted mb-1">טוען רכזים…</p>
                            ) : null}
                            <ReferralsFilterMultiselect
                                triggerId="filter-referrals-coordinator"
                                options={coordinatorFilterOptions}
                                value={filters.coordinators}
                                onChange={(coordinators) => {
                                    setPage(1);
                                    setFilters((prev) => ({ ...prev, coordinators }));
                                }}
                                emptyOptionsText="אין רכזים ברשימה"
                            />
                        </div>
                        <div>
                            <label htmlFor="filter-referrals-updater" className="block text-xs font-bold text-text-muted mb-1">
                                משתמש מעדכן
                            </label>
                            {coordinatorsListLoading ? (
                                <p className="text-[10px] text-text-muted mb-1">טוען משתמשים…</p>
                            ) : null}
                            <ReferralsFilterMultiselect
                                triggerId="filter-referrals-updater"
                                options={updaterFilterOptions}
                                value={filters.lastUpdatedBys}
                                onChange={(lastUpdatedBys) => {
                                    setPage(1);
                                    setFilters((prev) => ({ ...prev, lastUpdatedBys }));
                                }}
                                emptyOptionsText="אין משתמשים ברשימה"
                            />
                        </div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">מקור גיוס</label><input type="text" name="source" value={filters.source} onChange={handleFilterChange} className="w-full bg-bg-input border-border-default rounded-lg py-2 px-3 text-sm" placeholder="מקור..." /></div>
                        
                        <div className="md:col-span-4 lg:col-span-5 flex justify-end gap-2 mt-2 pt-2 border-t border-border-default/50">
                            <button onClick={handleClearFilters} className="text-sm font-semibold text-text-muted hover:text-red-500 px-4 flex items-center gap-1"><ArrowPathIcon className="w-4 h-4"/> איפוס</button>
                            <button onClick={() => setIsAdvancedSearchOpen(false)} className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 shadow-sm">סגור</button>
                        </div>
                     </div>
                )}
            </div>

            {/* Mobile Sidebar Toggle Button */}
            <div className="lg:hidden">
                <button 
                    onClick={() => setShowMobileStats(!showMobileStats)}
                    className="w-full bg-bg-card border border-border-default rounded-xl p-3 flex items-center justify-between shadow-sm text-sm font-bold text-text-default hover:bg-bg-subtle"
                >
                    <span>{showMobileStats ? 'הסתר מדדים' : 'הצג מדדים וסטטיסטיקה'}</span>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMobileStats ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Main Content: Sidebar + Table */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* Sidebar (Widgets) - Conditional on Mobile */}
                <div className={`w-full lg:w-1/4 flex flex-col gap-4 overflow-y-auto pr-1 pb-4 flex-shrink-0 transition-all sticky top-4 self-start max-h-[calc(100vh-20px)] ${showMobileStats ? 'block' : 'hidden lg:flex'}`}>
                    <FunnelWidget stages={insights.stages} totalFiltered={insights.total} />
                    
                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-4 flex-1 flex flex-col min-h-[250px]">
                        <h3 className="font-bold text-text-default text-sm mb-3 flex items-center gap-2">
                             <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                             דורש טיפול (7+ ימים)
                        </h3>
                         <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {insights.needsAttention.length > 0 ? (
                                insights.needsAttention.map(r => (
                                    <AttentionItem
                                        key={r.id}
                                        name={r.candidateName}
                                        job={r.jobTitle}
                                        days={r.daysInStage || 0}
                                        onClick={() => {
                                            if (r.candidateId) onOpenCandidateSummary(referralToSummaryCandidate(r));
                                        }}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-8 text-text-muted text-xs bg-bg-subtle/30 rounded-lg border border-dashed border-border-default h-full flex flex-col items-center justify-center">
                                    <CheckCircleIcon className="w-8 h-8 text-green-500 mb-2 opacity-50" />
                                    אין מועמדים תקועים
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Table */}
                <div className="w-full lg:w-3/4 bg-bg-card rounded-2xl shadow-sm border border-border-default flex flex-col h-fit">
                     <header className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
                         <div className="flex items-center gap-2">
                            <h3 className="font-bold text-text-default">רשימת הפניות</h3>
                            <span className="bg-bg-subtle px-2 py-0.5 rounded text-xs font-bold border border-border-default text-text-muted">{totalCount}</span>
                        </div>
                         <div className="flex items-center gap-2">
                            <div className="flex bg-bg-subtle p-1 rounded-lg border border-border-default">
                                <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-4 h-4"/></button>
                                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-4 h-4"/></button>
                            </div>
                            <div className="relative" ref={settingsRef}>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 bg-white border border-border-default rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-4 h-4 text-text-muted"/></button>
                                {isSettingsOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-3">
                                        <div className="space-y-1">
                                        {allColumns.map(column => (
                                            <label key={column.id} className="flex items-center gap-2 text-sm text-text-default p-1 hover:bg-bg-hover rounded cursor-pointer">
                                            <input type="checkbox" checked={visibleColumns.includes(column.id as string)} onChange={() => handleColumnToggle(column.id as string)} className="w-4 h-4 text-primary-600 rounded" />
                                            {column.header}
                                            </label>
                                        ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                     </header>

                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border-default bg-white text-sm text-text-muted">
                        <span>
                            עמוד {totalPages > 0 ? page : 0} מתוך {totalPages} · {totalCount} רשומות
                        </span>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs">
                                <span>שורות בעמוד</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPage(1);
                                        setPageSize(Number(e.target.value));
                                    }}
                                    className="bg-bg-input border border-border-default rounded-md py-1 px-2 text-sm"
                                >
                                    {[10, 25, 50, 100].map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                className="px-2.5 py-1 rounded-md border border-border-default hover:bg-bg-hover disabled:opacity-40"
                                disabled={page <= 1 || referralsLoading}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                ‹
                            </button>
                            <button
                                type="button"
                                className="px-2.5 py-1 rounded-md border border-border-default hover:bg-bg-hover disabled:opacity-40"
                                disabled={page >= totalPages || referralsLoading || totalCount === 0}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                ›
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 p-0 bg-white rounded-b-2xl">
                        {viewMode === 'table' ? (
                             <table className="w-full text-sm text-right min-w-[800px]">
                                <thead className="bg-bg-subtle/50 text-text-muted font-bold sticky top-0 z-10 border-b border-border-default">
                                    <tr>
                                        <th className="p-4 w-10"></th>
                                        {visibleColumns.map((colId, index) => {
                                            const col = allColumns.find(c => c.id === colId);
                                            if (!col) return null;
                                            return (
                                                <th 
                                                    key={col.id} 
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id as string)}
                                                    onDragEnter={() => handleDragEnter(index)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'opacity-50' : ''}`} 
                                                    onClick={() => requestSort(col.id as keyof Referral)}
                                                >
                                                    <div className="flex items-center gap-1">{col.header} {getSortIndicator(col.id as keyof Referral)}</div>
                                                </th>
                                            );
                                        })}
                                        <th className="p-4 text-center">פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {referralsLoading ? (
                                        <tr>
                                            <td colSpan={visibleColumns.length + 2} className="p-16 text-center text-text-muted text-sm">טוען נתוני דוח…</td>
                                        </tr>
                                    ) : !referralsLoading && totalCount === 0 ? (
                                        <tr>
                                            <td colSpan={visibleColumns.length + 2} className="p-16 text-center text-text-muted text-sm">
                                                אין רשומות להצגה. אם הוספת מסננים, נסה לרווח אותם. שליחות קו״ח ממסך סינון מופיעות אחרי התחברות.
                                            </td>
                                        </tr>
                                    ) : (
                                    referrals.map(referral => (
                                        <React.Fragment key={referral.id}>
                                            <tr onClick={() => setExpandedRowId(prevId => prevId === referral.id ? null : referral.id)} className="hover:bg-primary-50/30 cursor-pointer group transition-colors">
                                                <td className="p-4 text-center">
                                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${expandedRowId === referral.id ? 'rotate-180' : ''}`} />
                                                </td>
                                                {visibleColumns.map(colId => (
                                                    <td key={colId} className="p-4 text-text-muted">{renderCell(referral, colId)}</td>
                                                ))}
                                                <td className="p-4 text-center">
                                                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ActionButton icon={<PencilIcon className="w-4 h-4"/>} tooltip="ערוך סטטוס" onClick={(e) => handleOpenStatusModal(e, referral)} />
                                                        <ActionButton icon={<PaperAirplaneIcon className="w-4 h-4"/>} tooltip="הפניה מחדש" onClick={(e) => handleOpenReReferModal(e, referral)} />
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedRowId === referral.id && (
                                                <tr className="bg-bg-subtle/30 shadow-inner">
                                                    <td colSpan={visibleColumns.length + 2}><ExpandedRowContent referral={referral} className="p-6" /></td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {referralsLoading ? (
                                    <div className="col-span-full flex items-center justify-center py-16 text-text-muted text-sm">טוען…</div>
                                ) : !referralsLoading && totalCount === 0 ? (
                                    <div className="col-span-full flex items-center justify-center py-16 text-text-muted text-sm text-center">
                                        אין רשומות להצגה.
                                    </div>
                                ) : (
                                referrals.map(referral => (
                                    <div key={referral.id} className="group h-full">
                                        <ReferralGridCard 
                                            referral={referral} 
                                            isExpanded={expandedRowId === referral.id} 
                                            onToggle={() => setExpandedRowId(prevId => prevId === referral.id ? null : referral.id)}
                                            onEdit={(e) => handleOpenStatusModal(e, referral)}
                                            onReRefer={(e) => handleOpenReReferModal(e, referral)}
                                        />
                                    </div>
                                )))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ReReferModal
                isOpen={reReferModal.isOpen}
                onClose={() => setReReferModal({ isOpen: false, referral: null })}
                onSend={handleSendReReferral}
                applyFirstListedReferral={handleApplyFirstListedReferralToReReferModal}
                referral={
                    reReferModal.referral
                        ? {
                              id: reReferModal.referral.id,
                              candidateId: reReferModal.referral.candidateId,
                              jobId: reReferModal.referral.jobId,
                              jobTitle: reReferModal.referral.jobTitle,
                              clientName: reReferModal.referral.clientName,
                              candidateName: reReferModal.referral.candidateName,
                              internalNote: reReferModal.referral.internalNote,
                              notificationText: reReferModal.referral.notificationText,
                          }
                        : null
                }
            />
            {editingReferral && (
                <UpdateStatusModal
                    isOpen={isStatusModalOpen}
                    onClose={() => setIsStatusModalOpen(false)}
                    onSave={handleSaveStatusUpdate}
                    initialStatus={editingReferral.status}
                    onOpenNewTask={onOpenNewTask}
                    contextPrimary={editingReferral.candidateName}
                    contextSecondary={[editingReferral.jobTitle, editingReferral.clientName].filter(Boolean).join(' · ')}
                    initialNote={editingReferral.internalNote}
                    initialDueDate={editingReferral.referralDueDate}
                    initialDueTime={editingReferral.referralDueTime}
                    initialInviteCandidate={editingReferral.inviteCandidate}
                    initialInviteClient={editingReferral.inviteClient}
                    candidatePhone={editingReferral.candidatePhone}
                    candidateEmail={editingReferral.candidateEmail}
                    emailNotificationText={editingReferral.notificationText}
                    screeningCvNotificationId={editingReferral.id}
                />
            )}
             <JobDetailsDrawer job={selectedJob} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
        </div>
    );
};

export default ReferralsReportView;
