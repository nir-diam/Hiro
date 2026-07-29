
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    PlusIcon, MagnifyingGlassIcon, BuildingOffice2Icon, PencilIcon, TrashIcon, 
    Cog6ToothIcon, ChevronDownIcon, TableCellsIcon, Squares2X2Icon, 
    XMarkIcon, UserGroupIcon, PhoneIcon, EnvelopeIcon, ChartBarIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, BriefcaseIcon, ArrowRightIcon,
    FunnelIcon, ClockIcon, MapPinIcon, ChatBubbleBottomCenterTextIcon, WhatsappIcon, UserIcon,
    EllipsisVerticalIcon, DocumentArrowDownIcon, PlayIcon, CalendarDaysIcon, ClipboardDocumentCheckIcon, LinkIcon
} from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import { fetchPublishingLinks, type PublishingLinkRow } from '../services/publishingApi';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useScreenTablePreferences } from '../hooks/useScreenTablePreferences';
import ActivityLogModal from './ActivityLogModal';
import { authHeaders } from '../utils/authHeaders';
import LocationSelector, { LocationItem } from './LocationSelector';
import CompanyFilterPopover from './CompanyFilterPopover';
import ContactDrawer from './ContactDrawer';
import ClientDetailsDrawer from './ClientDetailsDrawer';
import SearchableSelect from './SearchableSelect'; 
import ClientTasksTab from './ClientTasksTab';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';
import { fetchClientHealthPulse, type OrgHealthPulseDto } from '../services/clientHealthRulesApi';
import { downloadRowsAsXlsx } from '../utils/exportRowsToXlsx';

// --- TYPES ---
type ClientStatus = 'פעיל' | 'לא פעיל' | 'בהקפאה' | 'ליד חדש';
type ClientTier = 'VIP' | 'Gold' | 'Silver' | 'Standard';

export interface Client {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  openJobs: number;
  status: ClientStatus;
  accountManager: string;
  city: string;
  region: string;
  industry: string;
  tier: ClientTier;
  // Pipeline Data
  pipelineStage: string;
  pipelineValue: number;
  // Raw Data for Health Logic
  lastContactDate: string; // ISO Date
  daysSinceLastContact: number; // Computed/Mocked
  nextScheduledActivity: string | null; // ISO Date or null
  activePlacements: number; // Successful hires in warranty
  notes?: string;
  isContactProcess?: boolean;
  logo?: string;
}

export interface Contact {
    id: string;
    clientId?: string;
    organizationId?: string | null;
    name: string;
    role: string;
    clientName: string;
    clientLogo?: string;
    phone: string;
    email: string;
    lastContact: string;
    avatar?: string;
    pipelineId?: string;
    stageId?: string;
    createdAt?: string;
}

export type LinkedOrganizationItem = {
    linkId: string;
    organizationId: string | null;
    organizationTmpId: string | null;
    isPrimary: boolean;
    isPending: boolean;
    name: string;
    mainField: string;
    subFields: string[];
    secondaryField: string;
    website: string;
    location: string;
    logo: string;
    employeeCount: string;
    statusLabel: string;
    pipelineId?: string;
    pipelineStage?: string;
};

const normalizeLinkedOrganization = (raw: Record<string, unknown>): LinkedOrganizationItem => {
    const org = (raw.organization && typeof raw.organization === 'object') ? raw.organization as Record<string, unknown> : null;
    const tmp = (raw.organizationTmp && typeof raw.organizationTmp === 'object') ? raw.organizationTmp as Record<string, unknown> : null;
    const isPending = Boolean(raw.organizationTmpId && !raw.organizationId);
    const source = org || tmp || {};
    const subRaw = source.subField;
    const subFields = Array.isArray(subRaw)
        ? subRaw.map((v) => String(v || '').trim()).filter(Boolean)
        : subRaw
          ? [String(subRaw).trim()].filter(Boolean)
          : [];
    return {
        linkId: String(raw.id || ''),
        organizationId: raw.organizationId ? String(raw.organizationId) : null,
        organizationTmpId: raw.organizationTmpId ? String(raw.organizationTmpId) : null,
        isPrimary: Boolean(raw.isPrimary),
        isPending,
        name: String(source.name || '—'),
        mainField: String(source.mainField || ''),
        subFields,
        secondaryField: String(source.secondaryField || ''),
        website: String(source.website || ''),
        location: String(source.location || source.address || ''),
        logo: String(source.logo || ''),
        employeeCount: String(source.employeeCount || ''),
        statusLabel: isPending ? 'ממתין לאישור' : String(source.activityStatus || source.dataConfidence || 'מאושר'),
        pipelineId: raw.pipelineId ? String(raw.pipelineId) : undefined,
        pipelineStage: raw.pipelineStage ? String(raw.pipelineStage) : undefined,
    };
};

const formatWebsiteHost = (url: string) =>
    String(url || '')
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/\/$/, '') || '—';

// --- PIPELINE DEFINITIONS ---
interface PipelineStage {
    id: string;
    name: string;
    color: string;
    bg: string;
    accent: string;
}

interface Pipeline {
    id: string;
    name: string;
    stages: PipelineStage[];
}

function mapPipelineDto(d: PipelineDto): Pipeline {
    return {
        id: d.id,
        name: d.name,
        stages: (d.stages || []).map((s) => {
            const parts = String(s.color || '').split(/\s+/).filter(Boolean);
            const bgToken = parts.find((p) => p.startsWith('bg-')) || 'bg-gray-100';
            const accent = parts.find((p) => p.startsWith('text-')) || 'text-gray-700';
            const family = bgToken.match(/^bg-([a-z]+)-/)?.[1] || 'gray';
            return {
                id: s.id,
                name: s.name,
                color: `border-${family}-500`,
                bg: `bg-${family}-50`,
                accent,
            };
        }),
    };
}

// --- RICH MOCK DATA ---
export const clientsData: Client[] = [
  
];

const normalizeClient = (raw: any): Client => {
    const lastContactDate = raw?.metadata?.lastContactDate || raw?.metadata?.lastContact || raw?.createdAt || new Date().toISOString();
    const daysSinceLastContact = Math.max(
        0,
        Math.floor((Date.now() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
    );
    return {
        id: String(raw.id),
        name: raw.displayName || raw.name || 'לקוח',
        contactPerson: raw.contactPerson || raw.mainContactName || '',
        phone: raw.phone || raw.mainContactPhone || '',
        email: raw.email || raw.mainContactEmail || '',
        openJobs: Number(raw.openJobs ?? 0),
        status: (raw.status as any) || (raw.isActive === false ? 'לא פעיל' : 'פעיל'),
        accountManager: raw.accountManager || '',
        city: raw.city || '',
        region: raw.region || '',
        industry: raw.industry || '',
        tier: (raw.metadata?.tier as any) || 'Standard',
        pipelineStage: raw.metadata?.pipelineStage || 'lead',
        pipelineValue: Number(raw.metadata?.pipelineValue ?? 0),
        lastContactDate,
        daysSinceLastContact,
        nextScheduledActivity: raw.metadata?.nextScheduledActivity || null,
        activePlacements: Number(raw.metadata?.activePlacements ?? 0),
        notes: raw.metadata?.notes,
        isContactProcess: Boolean(raw.metadata?.isContactProcess),
        logo: raw.logoUrl || raw.metadata?.logo,
    };
};

function inferPipelineIdForStage(stageId: string | undefined, pipelines: Pipeline[]): string | undefined {
    if (!stageId) return undefined;
    for (const p of pipelines) {
        if (p.stages.some((s) => s.id === stageId)) return p.id;
    }
    return undefined;
}

function formatRelativeHebrew(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays <= 0) return 'היום';
    if (diffDays === 1) return 'אתמול';
    if (diffDays < 7) return `לפני ${diffDays} ימים`;
    return d.toLocaleDateString('he-IL');
}

function mapServerContactToListContact(
    row: any,
    clientsById: Map<string, Client>,
    pipelines: Pipeline[] = [],
    orgsById: Map<string, { name: string; logo?: string }> = new Map(),
): Contact {
    const clientRow = row.client;
    const orgRow = row.organization;
    const cid = String(row.clientId || clientRow?.id || '');
    const organizationId = row.organizationId ? String(row.organizationId) : null;
    const fallback = cid ? clientsById.get(cid) : undefined;
    const linkedOrg = organizationId ? orgsById.get(organizationId) : undefined;
    const orgName = String(
        row.organizationName
        || orgRow?.name
        || orgRow?.nameEn
        || linkedOrg?.name
        || '',
    ).trim();
    const tenantClientName = String(clientRow?.displayName || clientRow?.name || fallback?.name || '').trim();
    // Prefer organization name for "שם לקוח" when the contact is linked to an org.
    const clientName = orgName || tenantClientName || 'לקוח';
    const logo = row.organizationLogo || orgRow?.logo || linkedOrg?.logo || clientRow?.logoUrl || fallback?.logo;
    const nm = String(row.name || '').trim();
    const initials =
        nm
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0])
            .join('') || '?';
    const createdRaw = row.createdAt || row.updatedAt;
    const createdAt =
        typeof createdRaw === 'string'
            ? createdRaw
            : createdRaw
              ? new Date(createdRaw).toISOString()
              : undefined;
    const contactPipelineId = row.pipelineId ? String(row.pipelineId) : undefined;
    const contactStageId = row.processStage ? String(row.processStage) : undefined;
    const stageFromMeta = contactStageId || undefined;
    return {
        id: String(row.id),
        clientId: cid || undefined,
        organizationId,
        name: nm,
        role: row.role || '',
        clientName,
        clientLogo: logo,
        phone: row.phone || row.mobilePhone || '',
        email: row.email || '',
        lastContact: formatRelativeHebrew(row.updatedAt || row.createdAt),
        avatar: initials,
        pipelineId: contactPipelineId || inferPipelineIdForStage(stageFromMeta, pipelines),
        stageId: stageFromMeta || undefined,
        createdAt,
    };
}

const statusStyles: { [key in ClientStatus]: { text: string; bg: string; border: string; } } = {
  'פעיל': { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  'בהקפאה': { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  'לא פעיל': { text: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
  'ליד חדש': { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
};

// --- Column Definitions ---
const allClientColumns = [
    { id: 'health', label: 'דופק לקוח' },
    { id: 'name', label: 'לקוח' },
    { id: 'lastContact', label: 'קשר אחרון' },
    { id: 'nextActivity', label: 'פעילות הבאה' },
    { id: 'status', label: 'סטטוס' },
    { id: 'pipelineStage', label: 'שלב מכירה' },
    { id: 'contactPerson', label: 'איש קשר' },
    { id: 'phone', label: 'טלפון' },
    { id: 'actions', label: 'פעולות' }
];

const allLinkedOrgColumns = [
    { id: 'name', label: 'שם חברה' },
    { id: 'health', label: 'דופק לקוח' },
    { id: 'mainField', label: 'תחום' },
    { id: 'location', label: 'מיקום' },
    { id: 'employeeCount', label: 'עובדים' },
    { id: 'website', label: 'אתר' },
    { id: 'actions', label: 'פעולות' },
];

const allContactColumns = [
    { id: 'name', label: 'שם איש קשר' },
    { id: 'role', label: 'תפקיד' },
    { id: 'clientName', label: 'שם לקוח' },
    { id: 'phone', label: 'טלפון' },
    { id: 'email', label: 'אימייל' },
    { id: 'lastContact', label: 'קשר אחרון' },
    { id: 'actions', label: 'פעולות' }
];

type ClientPulseLevel = 'green' | 'yellow' | 'red';

const pulseLevelStyles: Record<ClientPulseLevel, { dot: string; badge: string; label: string }> = {
    green: {
        dot: 'bg-green-500',
        badge: 'bg-green-50 text-green-800 border-green-200',
        label: 'ירוק',
    },
    yellow: {
        dot: 'bg-yellow-400',
        badge: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        label: 'צהוב',
    },
    red: {
        dot: 'bg-red-500',
        badge: 'bg-red-50 text-red-800 border-red-200',
        label: 'אדום',
    },
};

/** Traffic-light pulse from client activity signals (green / yellow / red). */
const getClientHealthData = (client: Client): { level: ClientPulseLevel; message: string; pulse: boolean } => {
    if (client.status === 'לא פעיל') {
        return { level: 'yellow', message: 'לקוח לא פעיל / ארכיון', pulse: false };
    }

    // Red — critical
    if (client.daysSinceLastContact > 30) {
        return { level: 'red', message: `קריטי: נתק של ${client.daysSinceLastContact} ימים!`, pulse: true };
    }
    if (client.pipelineStage === 'risk') {
        return { level: 'red', message: 'קריטי: הלקוח סומן בסיכון נטישה', pulse: true };
    }

    // Yellow — attention
    if (client.openJobs > 0 && !client.nextScheduledActivity) {
        return { level: 'yellow', message: 'אזהרה: יש משרות פתוחות אך אין פעילות עתידית מתוכננת', pulse: false };
    }
    if (client.daysSinceLastContact > 14) {
        return { level: 'yellow', message: 'אזהרה: שבועיים ללא קשר', pulse: false };
    }
    if (client.daysSinceLastContact > 7) {
        return { level: 'yellow', message: 'תשומת לב: שבוע ללא קשר', pulse: false };
    }

    // Green — healthy
    return { level: 'green', message: 'תקין: פעילות שוטפת', pulse: false };
};

const HealthTooltip: React.FC<{ message: string }> = ({ message }) => (
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-[220px] bg-gray-900 text-white text-xs rounded-lg py-1.5 px-3 shadow-xl z-50 text-center transition-opacity opacity-0 group-hover/health:opacity-100 pointer-events-none">
        {message}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
);

const ClientHealthIndicator: React.FC<{ client: Client; compact?: boolean }> = ({ client, compact }) => {
    const { level, message, pulse } = getClientHealthData(client);
    return <PulseBadge level={level} message={message} pulse={pulse} compact={compact} />;
};

/** Pulse for linked organizations (tenant companies table). */
const getOrgHealthData = (org: LinkedOrganizationItem): { level: ClientPulseLevel; message: string; pulse: boolean } => {
    if (org.isPending) {
        return { level: 'yellow', message: 'ממתין לאישור', pulse: false };
    }
    return { level: 'green', message: 'תקין: ארגון פעיל', pulse: false };
};

const OrgHealthIndicator: React.FC<{
    org: LinkedOrganizationItem;
    pulseData?: OrgHealthPulseDto | null;
}> = ({ org, pulseData }) => {
    const fallback = getOrgHealthData(org);
    const level = (pulseData?.level || fallback.level) as ClientPulseLevel;
    const message = pulseData?.message || fallback.message;
    const pulse = pulseData?.pulse ?? fallback.pulse;
    return <PulseBadge level={level} message={message} pulse={pulse} />;
};

const PulseBadge: React.FC<{
    level: ClientPulseLevel;
    message: string;
    pulse?: boolean;
    compact?: boolean;
}> = ({ level, message, pulse, compact }) => {
    const style = pulseLevelStyles[level];

    if (compact) {
        return (
            <div className="group/health relative inline-flex items-center justify-center cursor-help w-8 h-8" title={message}>
                <div className={`w-3 h-3 rounded-full ${style.dot} ${pulse ? 'animate-pulse ring-2 ring-offset-1 ring-red-200' : ''} shadow-sm`} />
                <HealthTooltip message={message} />
            </div>
        );
    }

    return (
        <div className="group/health relative inline-flex cursor-help" title={message}>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${style.badge}`}>
                <span className={`w-2 h-2 rounded-full ${style.dot} ${pulse ? 'animate-pulse' : ''}`} />
                {style.label}
            </span>
            <HealthTooltip message={message} />
        </div>
    );
};

// ... (StatCard, StageUpdateModal, KanbanCard, ContactGridCard, ClientGridCard, QuickAddClientModal kept same as before)
const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string; trend?: string }> = ({ title, value, icon, color, trend }) => (
    <div className="bg-bg-card p-5 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
        <div>
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-1">{title}</p>
            <div className="flex items-end gap-2">
                <p className="text-3xl font-black text-text-default leading-none">{value}</p>
                {trend && <span className="text-xs font-bold text-green-600 mb-0.5">{trend}</span>}
            </div>
        </div>
        <div className={`p-3 rounded-xl ${color} shadow-sm`}>
            {icon}
        </div>
    </div>
);

const StageUpdateModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    client: Client | null; 
    onSave: (clientId: string, newStage: string, notes: string) => void; 
    onNavigateToProfile: (id: string) => void;
    pipelines: Pipeline[];
    activePipelineId: string;
}> = ({ isOpen, onClose, client, onSave, onNavigateToProfile, pipelines, activePipelineId }) => {
    const [notes, setNotes] = useState('');
    const [stage, setStage] = useState('');
    const activePipeline = pipelines.find(p => p.id === activePipelineId) || pipelines[0];

    useEffect(() => {
        if (client) {
            setNotes(client.notes || '');
            setStage(client.pipelineStage || activePipeline?.stages[0]?.id || '');
        }
    }, [client, activePipeline]);

    if (!isOpen || !client) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border-default overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border-default flex justify-between items-start bg-bg-subtle/30">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-6 h-6 rounded bg-bg-subtle border border-border-default flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0 overflow-hidden">
                                {client.logo ? (
                                    <img src={client.logo} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    client.name.substring(0, 2)
                                )}
                            </div>
                            <h3 className="text-xl font-bold text-text-default">{client.name}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusStyles[client.status]?.bg || 'bg-gray-100'} ${statusStyles[client.status]?.text || 'text-gray-700'} ${statusStyles[client.status]?.border || 'border-gray-200'}`}>
                                {client.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                            <UserGroupIcon className="w-4 h-4"/>
                            <span>{client.contactPerson}</span>
                            <span>•</span>
                            <span>{client.phone}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-bg-hover text-text-muted">
                        <XMarkIcon className="w-5 h-5"/>
                    </button>
                </div>
                
                <div className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-2">עדכון שלב ({activePipeline?.name || 'תהליך'})</label>
                        <select 
                            value={stage} 
                            onChange={(e) => setStage(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none"
                            disabled={!activePipeline?.stages?.length}
                        >
                            {(activePipeline?.stages || []).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-2">הערות ותיעוד</label>
                        <textarea 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                            placeholder="הוסף הערה לגבי הסטטוס או המשימה הבאה..."
                        />
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-3 items-start">
                        <BriefcaseIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-blue-900">שווי פייפליין נוכחי</p>
                            <p className="text-lg font-black text-blue-700">₪{client.pipelineValue.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-border-default flex justify-between items-center bg-bg-subtle/20">
                    <button 
                        onClick={() => onNavigateToProfile(client.id)}
                        className="text-sm font-bold text-primary-600 hover:text-primary-800 flex items-center gap-1 hover:underline"
                    >
                        <BuildingOffice2Icon className="w-4 h-4"/>
                        תיק לקוח מלא
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition">ביטול</button>
                        <button 
                            onClick={() => { onSave(client.id, stage, notes); onClose(); }}
                            className="px-6 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm transition"
                        >
                            שמור שינויים
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const KanbanCard: React.FC<{
    client: Client;
    onClick: () => void;
    onDragStart: (e: React.DragEvent) => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}> = ({ client, onClick, onDragStart, isSelected, onToggleSelect }) => (
    <div 
        draggable
        onDragStart={onDragStart}
        onClick={onClick}
        className={`bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group mb-3 relative overflow-hidden ${
            isSelected
                ? 'border-primary-500 ring-1 ring-primary-500'
                : client.isContactProcess
                    ? 'border-primary-200 bg-primary-50/20'
                    : 'border-border-default'
        }`}
    >
        <div className={`absolute top-0 right-0 w-1.5 h-full ${client.status === 'פעיל' ? 'bg-green-500' : client.status === 'בהקפאה' ? 'bg-amber-500' : 'bg-gray-300'}`}></div>
        {onToggleSelect ? (
            <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    checked={Boolean(isSelected)}
                    onChange={onToggleSelect}
                />
            </div>
        ) : null}
        <div className="pr-3">
            <div className="flex justify-between items-start mb-2">
                 <div className="flex items-center gap-2">
                     <div className="w-6 h-6 rounded bg-bg-subtle border border-border-default flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0 overflow-hidden">
                        {client.logo ? (
                            <img src={client.logo} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            client.name.substring(0, 2)
                        )}
                     </div>
                     <h4 className="font-bold text-text-default text-sm truncate">{client.name}</h4>
                 </div>
                 {client.tier === 'VIP' && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 font-bold">VIP</span>}
                 {client.isContactProcess && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-bold">איש קשר</span>}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
                <UserGroupIcon className="w-3.5 h-3.5"/>
                <span className="truncate">{client.contactPerson}</span>
            </div>
            
            <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                <div className="flex flex-col">
                    <span className="text-[10px] text-text-subtle font-medium">שווי עסקה</span>
                    <span className="text-xs font-bold text-text-default">₪{(client.pipelineValue / 1000).toFixed(0)}k</span>
                </div>
                <div className="flex flex-col items-end">
                     <span className="text-[10px] text-text-subtle font-medium">פעילות</span>
                     {/* Show days since contact instead of full date for better context */}
                     <span className={`text-xs ${client.daysSinceLastContact > 14 ? 'text-red-500 font-bold' : 'text-text-default'}`}>
                         לפני {client.daysSinceLastContact} ימים
                     </span>
                </div>
            </div>
        </div>
    </div>
);

// Contact Card for Grid View
const ContactGridCard: React.FC<{ 
    contact: Contact; 
    isSelected: boolean; 
    onSelect: () => void; 
    onAction: (action: 'email' | 'sms' | 'whatsapp') => void;
    onStartProcess: (contact: Contact, pipelineId: string) => void;
    processOptions: Pipeline[];
    onViewProfile: (contact: Contact) => void;
    onDelete: (contact: Contact) => void;
}> = ({ contact, isSelected, onSelect, onAction, onStartProcess, processOptions, onViewProfile, onDelete }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div 
            className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-all group relative ${isSelected ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'}`}
            onClick={onSelect}
        >
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                {/* 3 Dots Menu */}
                <div className="relative" ref={menuRef}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                        className="p-1 rounded-full hover:bg-bg-subtle text-text-muted transition-colors"
                    >
                        <EllipsisVerticalIcon className="w-5 h-5" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-border-default rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onViewProfile(contact); }}
                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                            >
                                <UserIcon className="w-4 h-4 text-text-subtle"/> צפה בפרופיל
                            </button>
                            {processOptions.map((p, idx) => (
                                <button
                                    key={p.id}
                                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onStartProcess(contact, p.id); }}
                                    className={`w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2 ${idx === 0 ? '' : 'border-t border-border-subtle'}`}
                                >
                                    <PlusIcon className="w-4 h-4 text-primary-600"/> פתח {p.name}
                                </button>
                            ))}
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onDelete(contact); }}
                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-border-subtle"
                            >
                                <TrashIcon className="w-4 h-4"/> מחק איש קשר
                            </button>
                        </div>
                    )}
                </div>

                <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={onSelect}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>

            <div className="flex flex-col items-center text-center mb-3 cursor-pointer" onClick={(e) => { e.stopPropagation(); onViewProfile(contact); }}>
                <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xl mb-3 border-4 border-white shadow-sm">
                    {contact.avatar}
                </div>
                <h4 className="font-bold text-text-default text-lg">{contact.name}</h4>
                <p className="text-primary-600 font-medium text-sm">{contact.role}</p>
                <div className="flex items-center justify-center gap-1.5 mt-1.5 bg-bg-subtle px-2 py-1 rounded-md">
                    <div className="w-4 h-4 rounded bg-white border border-border-default flex items-center justify-center text-[8px] font-bold text-text-muted shrink-0 overflow-hidden">
                        {contact.clientLogo ? (
                            <img src={contact.clientLogo} alt={contact.clientName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                            contact.clientName.substring(0, 2)
                        )}
                    </div>
                    <p className="text-text-muted text-xs font-medium">{contact.clientName}</p>
                </div>
            </div>

            <div className="space-y-2 mb-4 text-sm text-text-muted">
                <div className="flex items-center gap-2 justify-center bg-bg-subtle/50 py-1.5 px-3 rounded-lg">
                    <PhoneIcon className="w-3.5 h-3.5"/>
                    {contact.phone}
                </div>
                <div className="flex items-center gap-2 justify-center bg-bg-subtle/50 py-1.5 px-3 rounded-lg truncate">
                    <EnvelopeIcon className="w-3.5 h-3.5"/>
                    {contact.email}
                </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-border-subtle mt-auto">
                 <button onClick={(e) => {e.stopPropagation(); onAction('whatsapp')}} className="flex-1 p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center"><WhatsappIcon className="w-4 h-4"/></button>
                 <button onClick={(e) => {e.stopPropagation(); onAction('sms')}} className="flex-1 p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center"><ChatBubbleBottomCenterTextIcon className="w-4 h-4"/></button>
                 <button onClick={(e) => {e.stopPropagation(); onAction('email')}} className="flex-1 p-2 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 flex items-center justify-center"><EnvelopeIcon className="w-4 h-4"/></button>
            </div>
        </div>
    );
};

const ClientGridCard: React.FC<{
    client: Client;
    onClick: () => void;
    stageName: string;
    activePipelineColor: string;
    pipelines: Pipeline[];
    onStatusChange: (clientId: number, newStatus: ClientStatus) => void;
    onStageChange: (clientId: number, newStage: string) => void;
    onDelete?: (client: Client) => void;
    isDeleting?: boolean;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}> = ({ client, onClick, stageName, activePipelineColor, pipelines, onStatusChange, onStageChange, onDelete, isDeleting, isSelected, onToggleSelect }) => {
    let currentPipeline = pipelines[0];
    for (const pipeline of pipelines) {
        if (pipeline.stages.some(s => s.id === client.pipelineStage)) {
            currentPipeline = pipeline;
            break;
        }
    }

    return (
    <div onClick={onClick} className={`bg-bg-card border rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden ${isSelected ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'}`}>
        {/* Risk Indicator Strip */}
        {client.daysSinceLastContact > 14 && (
             <div className="absolute top-0 right-0 left-0 h-1 bg-red-500"></div>
        )}

        {onToggleSelect ? (
            <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    checked={Boolean(isSelected)}
                    onChange={onToggleSelect}
                />
            </div>
        ) : null}

        <div className="flex justify-between items-start mb-3 pt-2">
             <div>
                <h4 className="font-bold text-text-default text-lg group-hover:text-primary-700 transition-colors">{client.name}</h4>
                <div className="relative inline-block mt-1" onClick={(e) => e.stopPropagation()}>
                    <select
                        value={client.status}
                        onChange={(e) => onStatusChange(client.id, e.target.value as ClientStatus)}
                        className={`appearance-none inline-flex items-center pr-2.5 pl-6 py-0.5 rounded-full text-xs font-bold border cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500 ${statusStyles[client.status]?.bg || 'bg-gray-100'} ${statusStyles[client.status]?.text || 'text-gray-700'} ${statusStyles[client.status]?.border || 'border-gray-200'}`}
                    >
                        {(Object.keys(statusStyles) as ClientStatus[]).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                    <ChevronDownIcon className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                </div>
             </div>
             <div className="flex flex-col items-end gap-1">
                 {onDelete ? (
                     <button
                         type="button"
                         onClick={(e) => { e.stopPropagation(); onDelete(client); }}
                         disabled={isDeleting}
                         className="p-1.5 rounded-lg text-text-subtle hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                         title="מחק לקוח"
                     >
                         <TrashIcon className="w-4 h-4" />
                     </button>
                 ) : null}
                 <div className="w-10 h-10 rounded-lg bg-bg-subtle border border-border-default flex items-center justify-center text-sm font-bold text-text-muted shrink-0 overflow-hidden">
                    {client.logo ? (
                        <img src={client.logo} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                        client.name.substring(0, 2)
                    )}
                 </div>
                 <ClientHealthIndicator client={client} compact />
             </div>
        </div>
        
        <div className="space-y-2 mb-4 flex-grow">
             <div className="text-sm text-text-muted flex items-center gap-2">
                <UserGroupIcon className="w-4 h-4"/> {client.contactPerson}
             </div>
             <div className="text-sm text-text-muted flex items-center gap-2">
                <MapPinIcon className="w-4 h-4"/> {client.city}
             </div>
             {/* New data display */}
             <div className="text-xs text-text-subtle mt-2 pt-2 border-t border-border-subtle/50 flex flex-col gap-1">
                 <div className="flex justify-between">
                     <span>קשר אחרון:</span>
                     <span className={client.daysSinceLastContact > 14 ? 'text-red-500 font-bold' : ''}>לפני {client.daysSinceLastContact} ימים</span>
                 </div>
                 {client.nextScheduledActivity ? (
                     <div className="flex justify-between text-green-600 font-medium">
                         <span>פעילות הבאה:</span>
                         <span>{new Date(client.nextScheduledActivity).toLocaleDateString('he-IL')}</span>
                     </div>
                 ) : (
                     <div className="flex justify-between text-orange-500 font-medium">
                         <span>אין פעילות עתידית</span>
                     </div>
                 )}
             </div>
        </div>

        <div className="pt-3 border-t border-border-default mt-auto">
             <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1">
                    <span className="text-text-subtle">שלב:</span>
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                         <select
                             value={client.pipelineStage}
                             onChange={(e) => onStageChange(client.id, e.target.value)}
                             className={`appearance-none inline-flex items-center pr-2 pl-5 py-0.5 rounded-md text-xs font-bold border cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500 ${activePipelineColor} ${activePipelineColor.replace('border-', 'bg-').replace('500', '50')} text-text-default`}
                         >
                             {(currentPipeline?.stages || []).map(stage => (
                                 <option key={stage.id} value={stage.id}>{stage.name}</option>
                             ))}
                         </select>
                         <ChevronDownIcon className="w-3 h-3 absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                     </div>
                </div>
                <span className="font-bold text-text-default">₪{(client.pipelineValue / 1000).toFixed(0)}k</span>
             </div>
             <div className={`h-1 w-full mt-2 rounded-full bg-gray-100 overflow-hidden`}>
                <div className={`h-full ${activePipelineColor.replace('border-', 'bg-')}`} style={{width: '100%'}}></div> 
             </div>
        </div>
    </div>
);
};

const QuickAddClientModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    pipelineId: string;
    stageId?: string;
    onSave: (data: Partial<Client>) => void;
}> = ({ isOpen, onClose, pipelineId, stageId, onSave }) => {
    const [name, setName] = useState('');
    const [contact, setContact] = useState('');
    
    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            name,
            contactPerson: contact,
            pipelineStage: stageId
        });
        setName('');
        setContact('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg">הוספת לקוח מהירה</h3>
                    <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted"/></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-1">שם הלקוח</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2" autoFocus required />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-1">איש קשר</label>
                        <input type="text" value={contact} onChange={e => setContact(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2" />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                         <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:bg-bg-subtle">ביטול</button>
                         <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700">הוסף</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ClientsListView: React.FC<{ openMessageModal: (config: MessageModalConfig) => void }> = ({ openMessageModal }) => {
    const { t } = useLanguage();
    const { user, ready: authReady } = useAuth();
    const navigate = useNavigate();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;
    const isTenantUser = Boolean(tenantClientId);
    
    // --- Tabs State ---
    const [activeTab, setActiveTab] = useState<'companies' | 'contacts' | 'tasks'>('companies');

    // --- Clients Data & State ---
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [clients, setClients] = useState<Client[]>(clientsData);
    const [linkedOrganizations, setLinkedOrganizations] = useState<LinkedOrganizationItem[]>([]);
    const [orgPulseById, setOrgPulseById] = useState<Record<string, OrgHealthPulseDto>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
    const [orgDrawer, setOrgDrawer] = useState<{ org: LinkedOrganizationItem; full: Record<string, unknown> | null } | null>(null);
    const [orgDrawerLoading, setOrgDrawerLoading] = useState(false);
    type OrgJobLink = {
        jobId: string;
        jobTitle: string;
        totalVisits: number;
        totalSubmissions: number;
        sources: Array<{ source: string; url: string; visits: number; submissions: number; subPercent: number }>;
    };
    const [orgDrawerLinks, setOrgDrawerLinks] = useState<OrgJobLink[]>([]);
    const [orgDrawerLinksLoading, setOrgDrawerLinksLoading] = useState(false);

    useEffect(() => {
        if (!apiBase || !authReady || isTenantUser) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        fetch(`${apiBase}/api/clients`)
            .then((r) => {
                if (!r.ok) throw new Error('Failed to load clients');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                setClients(list.map(normalizeClient));
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'Failed to load clients');
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, authReady, isTenantUser]);

    const pipelinesClientId = tenantClientId
        || (isPlatformAdmin && clients[0]?.id ? String(clients[0].id) : null);

    useEffect(() => {
        if (!authReady || !pipelinesClientId) {
            setPipelines([]);
            return;
        }
        let active = true;
        void fetchPipelines(pipelinesClientId)
            .then((rows) => {
                if (!active) return;
                setPipelines(rows.map(mapPipelineDto));
            })
            .catch(() => {
                if (!active) return;
                setPipelines([]);
            });
        return () => { active = false; };
    }, [authReady, pipelinesClientId]);

    useEffect(() => {
        if (!apiBase || !authReady || !tenantClientId) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        fetch(`${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/linked-organizations`, {
            headers: authHeaders(true),
        })
            .then((r) => {
                if (!r.ok) throw new Error('טעינת חברות מקושרות נכשלה');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : [];
                setLinkedOrganizations(list.map((row) => normalizeLinkedOrganization(row as Record<string, unknown>)));
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'טעינת חברות מקושרות נכשלה');
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, authReady, tenantClientId]);

    const openOrgDrawer = async (org: LinkedOrganizationItem) => {
        setOrgDrawer({ org, full: null });
        setOrgDrawerLinks([]);

        const fetchDetails = org.organizationId
            ? (async () => {
                setOrgDrawerLoading(true);
                try {
                    const res = await fetch(`${apiBase}/api/organizations/${encodeURIComponent(org.organizationId!)}`, {
                        headers: authHeaders(true),
                    });
                    if (res.ok) {
                        const data = await res.json() as Record<string, unknown>;
                        setOrgDrawer((prev) => prev ? { ...prev, full: data } : null);
                    }
                } catch { /* show partial data */ }
                finally { setOrgDrawerLoading(false); }
            })()
            : Promise.resolve();

        const fetchLinks = (async () => {
            setOrgDrawerLinksLoading(true);
            try {
                const all = await fetchPublishingLinks(tenantClientId ?? undefined);
                const orgName = org.name.trim().toLowerCase();
                const filtered = all.filter(
                    (l) => (l.employer || l.client || '').trim().toLowerCase() === orgName,
                );
                // Group by jobId — one card per job, sources listed inside
                const byJob = new Map<string, typeof filtered>();
                for (const l of filtered) {
                    const key = l.jobId;
                    if (!byJob.has(key)) byJob.set(key, []);
                    byJob.get(key)!.push(l);
                }
                const grouped = [...byJob.entries()].map(([jobId, links]) => ({
                    jobId,
                    jobTitle: links[0].jobTitle,
                    totalVisits: links.reduce((s, l) => s + (l.visits || 0), 0),
                    totalSubmissions: links.reduce((s, l) => s + (l.submissions || 0), 0),
                    sources: links.map((l) => ({
                        source: l.source,
                        url: l.url,
                        visits: l.visits || 0,
                        submissions: l.submissions || 0,
                        subPercent: l.subPercent || 0,
                    })),
                }));
                setOrgDrawerLinks(grouped);
            } catch { /* ignore */ }
            finally { setOrgDrawerLinksLoading(false); }
        })();

        await Promise.all([fetchDetails, fetchLinks]);
    };

    useEffect(() => {
        if (!apiBase || !authReady) return;

        if (!isPlatformAdmin && !tenantClientId) {
            setContacts([]);
            setContactsError(null);
            setContactsLoading(false);
            return;
        }

        const contactsUrl = `${apiBase}/api/clients/all-contacts`;

        let active = true;
        setContactsLoading(true);
        setContactsError(null);
        fetch(contactsUrl, { headers: authHeaders(true) })
            .then((r) => {
                if (!r.ok) throw new Error('טעינת אנשי קשר נכשלה');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : [];
                const byId = new Map<string, Client>(clients.map((c) => [c.id, c]));
                const orgsById = new Map<string, { name: string; logo?: string }>();
                for (const org of linkedOrganizations) {
                    if (org.organizationId) {
                        orgsById.set(org.organizationId, { name: org.name, logo: org.logo || undefined });
                    }
                }
                setContacts(
                    list.map((row: any) =>
                        mapServerContactToListContact(row, byId, pipelines, orgsById),
                    ),
                );
            })
            .catch((e: any) => {
                if (active) setContactsError(e?.message || 'טעינת אנשי קשר נכשלה');
            })
            .finally(() => {
                if (active) setContactsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [apiBase, clients, authReady, isPlatformAdmin, tenantClientId, pipelines, linkedOrganizations]);

    const { viewMode, setViewMode } = useScreenTablePreferences('clients_list', {
        defaultLayoutMode: isTenantUser ? 'cards' : 'list',
        defaultVisibleColumns: [],
    });
    const {
        viewMode: contactsViewMode,
        setViewMode: setContactsViewMode,
    } = useScreenTablePreferences('clients_contacts', {
        defaultLayoutMode: 'list',
        defaultVisibleColumns: [],
    });
    const [activePipelineId, setActivePipelineId] = useState<string>('all'); // Changed default to 'all'
    const [activeStageId, setActiveStageId] = useState<string>('all'); // New State for Stage Filter
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isStageModalOpen, setIsStageModalOpen] = useState(false);

    useEffect(() => {
        if (!authReady || !tenantClientId || linkedOrganizations.length === 0) {
            setOrgPulseById({});
            return;
        }
        let active = true;
        const pipelineIdForPulse =
            activePipelineId && activePipelineId !== 'all'
                ? activePipelineId
                : null;
        void fetchClientHealthPulse(tenantClientId, pipelineIdForPulse)
            .then((map) => {
                if (!active) return;
                setOrgPulseById(map);
            })
            .catch(() => {
                if (!active) return;
                setOrgPulseById({});
            });
        return () => { active = false; };
    }, [authReady, tenantClientId, linkedOrganizations, activePipelineId, isTenantUser]);

    // --- Contacts Data & State ---
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [contactsError, setContactsError] = useState<string | null>(null);
    const [linkedOrgVisibleColumns, setLinkedOrgVisibleColumns] = useState<string[]>([
        'name', 'health', 'mainField', 'location', 'employeeCount', 'website', 'actions',
    ]);
    /** Multi-select on companies tab: client.id (admin) or linkId (tenant orgs). */
    const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [contactVisibleColumns, setContactVisibleColumns] = useState<string[]>(['name', 'role', 'clientName', 'phone', 'email', 'lastContact', 'actions']);
    const [isColumnPopoverOpen, setIsColumnPopoverOpen] = useState(false);
    const [contactSortConfig, setContactSortConfig] = useState<{ key: keyof Contact; direction: 'asc' | 'desc' } | null>(null);
    
    // New Contact Drawer State
    const [selectedContactForDrawer, setSelectedContactForDrawer] = useState<Contact | null>(null);
    const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false);
    const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const [contactDeleteLoading, setContactDeleteLoading] = useState(false);

    // New Client Drawer State
    const [selectedClientForDrawer, setSelectedClientForDrawer] = useState<Client | null>(null);
    const [isClientDrawerOpen, setIsClientDrawerOpen] = useState(false);


    // --- Clients Table State ---
    // Added 'health', 'lastContact', 'nextActivity'
    const [clientVisibleColumns, setClientVisibleColumns] = useState<string[]>(['health', 'name', 'status', 'pipelineStage', 'lastContact', 'nextActivity', 'contactPerson', 'phone', 'actions']);
    const [clientSortConfig, setClientSortConfig] = useState<{ key: keyof Client; direction: 'asc' | 'desc' } | null>(null);
    const [isClientColumnPopoverOpen, setIsClientColumnPopoverOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const dragItemIndex = useRef<number | null>(null);

    // --- Filter States ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterAccountManager, setFilterAccountManager] = useState<string>('all');
    const [filterIndustry, setFilterIndustry] = useState<string>('all');
    const [filterLocation, setFilterLocation] = useState<string>('');
    
    // Use LocationSelector items
    const [selectedLocations, setSelectedLocations] = useState<LocationItem[]>([]);
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [companyFilters, setCompanyFilters] = useState<{
        sizes: string[];
        sectors: string[];
        industry: string;
        field: string;
    }>({ sizes: [], sectors: [], industry: '', field: '' });
    const companyFilterButtonRef = useRef<HTMLButtonElement>(null);


    // --- Common State ---
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [quickAddStageId, setQuickAddStageId] = useState<string | undefined>(undefined);
    const settingsRef = useRef<HTMLDivElement>(null);
    const clientSettingsRef = useRef<HTMLDivElement>(null);
    
    // Contact filter states (NEW & IMPROVED)
    const [filterContactRole, setFilterContactRole] = useState<string>('all');
    const [filterContactClient, setFilterContactClient] = useState<string>('all');
    
    // NEW: Advanced Filters
    const [filterContactPipeline, setFilterContactPipeline] = useState<string>('all');
    const [filterContactStage, setFilterContactStage] = useState<string>('all');
    const [filterContactDateFrom, setFilterContactDateFrom] = useState('');
    const [filterContactDateTo, setFilterContactDateTo] = useState('');
    
    const [isBulkProcessMenuOpen, setIsBulkProcessMenuOpen] = useState(false);

    // Mobile States (NEW)
    const [showMobileStats, setShowMobileStats] = useState(false);


    // --- Stats Calculation ---
    const stats = useMemo(() => {
        if (isTenantUser) {
            const approved = linkedOrganizations.filter((o) => !o.isPending).length;
            const pending = linkedOrganizations.filter((o) => o.isPending).length;
            return {
                totalOpenJobs: 0,
                activeClients: approved,
                totalValue: pending,
                winRate: linkedOrganizations.length,
            };
        }
        const totalOpenJobs = clients.reduce((acc, c) => acc + (c.status === 'פעיל' ? c.openJobs : 0), 0);
        const activeClients = clients.filter(c => c.status === 'פעיל').length;
        const totalValue = clients.reduce((acc, c) => acc + (c.pipelineValue || 0), 0);
        const winRate = 18; // Mock

        return { totalOpenJobs, activeClients, totalValue, winRate };
    }, [clients, isTenantUser, linkedOrganizations]);

    const activePipeline = pipelines.find(p => p.id === activePipelineId); // Can be undefined if 'all'

    const filteredLinkedOrganizations = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const industry = String(companyFilters.industry || '').trim().toLowerCase();
        return linkedOrganizations.filter((org) => {
            if (q) {
                const hay = [
                    org.name,
                    org.mainField,
                    org.secondaryField,
                    org.location,
                    org.website,
                    ...org.subFields,
                ].join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (filterStatus === 'pending' && !org.isPending) return false;
            if (filterStatus === 'approved' && org.isPending) return false;
            if (industry) {
                const fields = [org.mainField, org.secondaryField, ...org.subFields]
                    .join(' ')
                    .toLowerCase();
                if (!fields.includes(industry)) return false;
            }
            if (selectedLocations.length > 0) {
                const locHay = String(org.location || '').toLowerCase();
                const matchesLocation = selectedLocations.some((loc) => {
                    const v = String(loc.value || '').toLowerCase();
                    return v && locHay.includes(v);
                });
                if (!matchesLocation) return false;
            }
            if (activePipelineId !== 'all') {
                const stageIds = activePipeline?.stages.map((s) => s.id) || [];
                if (activeStageId !== 'all') {
                    if (org.pipelineStage !== activeStageId) return false;
                } else {
                    const inThisPipeline = org.pipelineId === activePipelineId
                        || Boolean(org.pipelineStage && stageIds.includes(org.pipelineStage));
                    const unassigned = !org.pipelineId && !org.pipelineStage;
                    if (!inThisPipeline && !unassigned) return false;
                }
            }
            return true;
        });
    }, [linkedOrganizations, searchTerm, filterStatus, companyFilters.industry, selectedLocations, activePipelineId, activeStageId, activePipeline]);
    
    // Dynamic Filter Options
    const accountManagers = useMemo(() => Array.from(new Set(clients.map(c => c.accountManager))), [clients]);
    
    // Contact Filter Options
    const contactRoles = useMemo(() => Array.from(new Set(contacts.map(c => c.role))), [contacts]);
    const contactClients = useMemo(() => Array.from(new Set(contacts.map(c => c.clientName))), [contacts]);
    
    // Available stages based on selected pipeline
    const availableStages = useMemo(() => {
        if (activePipelineId === 'all') return [];
        return activePipeline ? activePipeline.stages : [];
    }, [activePipelineId, activePipeline]);
    
    const availableContactStages = useMemo(() => {
        if (filterContactPipeline === 'all') return [];
        const pipeline = pipelines.find(p => p.id === filterContactPipeline);
        return pipeline ? pipeline.stages : [];
    }, [filterContactPipeline, pipelines]);


    const filteredClients = useMemo(() => {
        return clients.filter(c => {
             // 1. Search Filter
             const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.contactPerson.toLowerCase().includes(searchTerm.toLowerCase());
             
             // 2. Pipeline & Stage Filter
             let matchesPipeline = true;
             
             if (activePipelineId !== 'all') {
                  const activePipelineStages = activePipeline?.stages.map(s => s.id) || [];
                  const isInPipeline = activePipelineStages.includes(c.pipelineStage);
                  
                  if (activeStageId !== 'all') {
                      matchesPipeline = c.pipelineStage === activeStageId;
                  } else {
                      matchesPipeline = isInPipeline;
                  }
             }

             // 3. New Filters
             const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
             const matchesManager = filterAccountManager === 'all' || c.accountManager === filterAccountManager;
             const matchesIndustry = !companyFilters.industry || c.industry === companyFilters.industry;
             
             // Location Match using LocationSelector logic (simplified for client city/region)
             const matchesLocation = selectedLocations.length === 0 || selectedLocations.some(loc => {
                 if (loc.type === 'city') return c.city === loc.value;
                 if (loc.type === 'region') return c.region === loc.value; // Assuming simple region match
                 return true;
             });

             return matchesSearch && matchesPipeline && matchesStatus && matchesManager && matchesIndustry && matchesLocation;
        });
    }, [clients, searchTerm, activePipelineId, activeStageId, activePipeline, filterStatus, filterAccountManager, companyFilters.industry, selectedLocations]);

    const sortedClients = useMemo(() => {
        let sortable = [...filteredClients];
        if (clientSortConfig) {
            sortable.sort((a, b) => {
                // @ts-ignore
                const aVal = a[clientSortConfig.key];
                // @ts-ignore
                const bVal = b[clientSortConfig.key];
                if (aVal < bVal) return clientSortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return clientSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [filteredClients, clientSortConfig]);


    const filteredContacts = useMemo(() => {
        return contacts.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  c.role.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesRole = filterContactRole === 'all' || c.role === filterContactRole;
            const matchesClient = filterContactClient === 'all' || c.clientName === filterContactClient;
            
            // Advanced Filters Logic
            // NOTE: Mock data assumes fields exist. In real app, make sure fields match interface.
            // Using logic assuming if field doesn't exist, it passes 'all' check but fails specific check
            
            const matchesPipeline = filterContactPipeline === 'all'
                || c.pipelineId === filterContactPipeline
                || (!c.pipelineId && !c.stageId);
            const matchesStage = filterContactStage === 'all' || c.stageId === filterContactStage;
            
            let matchesDate = true;
            if (filterContactDateFrom || filterContactDateTo) {
                const created = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
                if (!Number.isNaN(created)) {
                    if (filterContactDateFrom) {
                        const from = new Date(filterContactDateFrom).setHours(0, 0, 0, 0);
                        if (created < from) matchesDate = false;
                    }
                    if (filterContactDateTo) {
                        const to = new Date(filterContactDateTo).setHours(23, 59, 59, 999);
                        if (created > to) matchesDate = false;
                    }
                }
            }

            return matchesSearch && matchesRole && matchesClient && matchesPipeline && matchesStage && matchesDate;
        });
    }, [contacts, searchTerm, filterContactRole, filterContactClient, filterContactPipeline, filterContactStage, filterContactDateFrom, filterContactDateTo]);

    // --- Sorting Logic (Contacts) ---
    const sortedContacts = useMemo(() => {
        let sortable = [...filteredContacts];
        if (contactSortConfig) {
            sortable.sort((a, b) => {
                const aVal = a[contactSortConfig.key];
                const bVal = b[contactSortConfig.key];
                if (aVal < bVal) return contactSortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return contactSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [filteredContacts, contactSortConfig]);

    const requestContactSort = (key: keyof Contact) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (contactSortConfig && contactSortConfig.key === key && contactSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setContactSortConfig({ key, direction });
    };

    const requestClientSort = (key: keyof Client) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (clientSortConfig && clientSortConfig.key === key && clientSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setClientSortConfig({ key, direction });
    };

    const getContactSortIndicator = (key: keyof Contact) => {
         if (!contactSortConfig || contactSortConfig.key !== key) return null;
         return <span className="text-primary-500 ml-1 text-xs">{contactSortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const getClientSortIndicator = (key: keyof Client) => {
         if (!clientSortConfig || clientSortConfig.key !== key) return null;
         return <span className="text-primary-500 ml-1 text-xs">{clientSortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };


    // --- Drag & Drop Handlers (Clients - Reordering Columns) ---
    // Shared handlers for both tables essentially, just updating different states
    const handleDragStart = (index: number, colId: string, type: 'clients' | 'contacts') => {
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };

    const handleDragEnter = (index: number, type: 'clients' | 'contacts') => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        
        if (type === 'clients') {
            const newCols = [...clientVisibleColumns];
            const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
            newCols.splice(index, 0, draggedItem);
            dragItemIndex.current = index;
            setClientVisibleColumns(newCols);
        } else {
            const newCols = [...contactVisibleColumns];
            const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
            newCols.splice(index, 0, draggedItem);
            dragItemIndex.current = index;
            setContactVisibleColumns(newCols);
        }
    };

    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    // --- Drag & Drop Handlers (Kanban - Clients) ---
    const handleKanbanDragStart = (e: React.DragEvent, clientId: string) => {
        e.dataTransfer.setData('clientId', clientId);
    };

    const handleKanbanDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleKanbanDrop = async (e: React.DragEvent, stageId: string) => {
        const clientId = String(e.dataTransfer.getData('clientId') || '');
        const orgLinkId = String(e.dataTransfer.getData('orgLinkId') || '');
        const contactId = String(e.dataTransfer.getData('contactId') || '');

        if (orgLinkId) {
            await handleOrgKanbanDrop(orgLinkId, stageId);
            return;
        }
        if (contactId) {
            await handleContactKanbanDrop(contactId, stageId);
            return;
        }
        if (!clientId) return;

        const prevClient = clients.find(c => c.id === clientId);
        const prevStage = prevClient?.pipelineStage;

        setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: stageId } : c));

        if (!apiBase || clientId.startsWith('tmp-')) return;

        try {
            const clientAfter = prevClient ? { ...prevClient, pipelineStage: stageId } : null;
            const metadata = clientAfter ? buildClientMetadataPatch(clientAfter) : { pipelineStage: stageId };
            const res = await fetch(`${apiBase}/api/clients/${clientId}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ metadata }),
            });
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            if (prevStage) {
                setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: prevStage } : c));
            }
        }
    };

    const handleOrgKanbanDragStart = (e: React.DragEvent, linkId: string) => {
        e.dataTransfer.setData('orgLinkId', linkId);
    };

    const handleOrgKanbanDrop = async (linkId: string, stageId: string) => {
        const prev = linkedOrganizations.find((o) => o.linkId === linkId);
        if (!prev || !tenantClientId || !apiBase) return;
        const pipelineId = activePipelineId !== 'all' ? activePipelineId : (prev.pipelineId || pipelines[0]?.id || '');
        const prevStage = prev.pipelineStage;
        const prevPipelineId = prev.pipelineId;

        setLinkedOrganizations((list) =>
            list.map((o) =>
                o.linkId === linkId ? { ...o, pipelineStage: stageId, pipelineId: pipelineId || o.pipelineId } : o,
            ),
        );

        try {
            const res = await fetch(
                `${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/organization-link/${encodeURIComponent(linkId)}`,
                {
                    method: 'PATCH',
                    headers: authHeaders(true),
                    body: JSON.stringify({ pipelineStage: stageId, pipelineId: pipelineId || null }),
                },
            );
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            setLinkedOrganizations((list) =>
                list.map((o) =>
                    o.linkId === linkId ? { ...o, pipelineStage: prevStage, pipelineId: prevPipelineId } : o,
                ),
            );
        }
    };

    const handleContactKanbanDragStart = (e: React.DragEvent, contactId: string) => {
        e.dataTransfer.setData('contactId', contactId);
    };

    const handleContactKanbanDrop = async (contactId: string, stageId: string) => {
        const prev = contacts.find((c) => c.id === contactId);
        if (!prev) return;
        const clientId = resolveContactClientId(prev);
        const pipelineId = filterContactPipeline !== 'all'
            ? filterContactPipeline
            : (prev.pipelineId || pipelines[0]?.id || '');
        const prevStage = prev.stageId;
        const prevPipelineId = prev.pipelineId;

        setContacts((list) =>
            list.map((c) =>
                c.id === contactId
                    ? { ...c, stageId, pipelineId: pipelineId || c.pipelineId }
                    : c,
            ),
        );

        if (!apiBase || !clientId) return;
        try {
            const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ processStage: stageId, pipelineId: pipelineId || null }),
            });
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            setContacts((list) =>
                list.map((c) =>
                    c.id === contactId
                        ? { ...c, stageId: prevStage, pipelineId: prevPipelineId }
                        : c,
                ),
            );
        }
    };

    // --- Actions (Clients) ---
    const handleCardClick = (client: Client) => {
        // If "All Pipelines" is selected, we need to know WHICH pipeline to show in modal.
        // We'll try to infer it from the client's current stage, or default to first pipeline.
        let inferredPipelineId = activePipelineId;
        if (activePipelineId === 'all') {
             const foundPipeline = pipelines.find(p => p.stages.some(s => s.id === client.pipelineStage));
             inferredPipelineId = foundPipeline ? foundPipeline.id : (pipelines[0]?.id || 'all');
        }

        setSelectedClient(client);
        // We pass the potentially inferred pipeline ID to the modal so it shows correct stages
        // But we don't change the main view state.
        // Note: StageUpdateModal props updated below to accept specific pipeline ID for display
        setIsStageModalOpen(true);
    };

    const handleSaveStage = async (clientId: string, newStage: string, notes: string) => {
        const prevClient = clients.find(c => c.id === clientId);
        const prevStage = prevClient?.pipelineStage;
        const prevNotes = prevClient?.notes;

        setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: newStage, notes } : c));

        if (!apiBase || clientId.startsWith('tmp-')) return;

        try {
            const clientAfter = prevClient ? { ...prevClient, pipelineStage: newStage, notes } : null;
            const metadata = clientAfter ? buildClientMetadataPatch(clientAfter) : { pipelineStage: newStage, notes };
            const res = await fetch(`${apiBase}/api/clients/${clientId}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ metadata }),
            });
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: prevStage || c.pipelineStage, notes: prevNotes } : c));
        }
    };

    const handleNavigateToProfile = (id: string) => {
        navigate(`/clients/${id}`);
    };

    const handleDeleteClient = async (client: Client) => {
        if (!window.confirm(`האם למחוק את הלקוח "${client.name}"? פעולה זו אינה ניתנת לביטול.`)) return;
        if (!apiBase || client.id.startsWith('tmp-')) {
            setClients((prev) => prev.filter((c) => c.id !== client.id));
            return;
        }
        setDeleteBusyId(client.id);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(client.id)}`, {
                method: 'DELETE',
                headers: authHeaders(true),
            });
            if (!res.ok && res.status !== 204) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'מחיקת לקוח נכשלה');
            }
            setClients((prev) => prev.filter((c) => c.id !== client.id));
            setActiveActionMenuId(null);
            if (selectedClientForDrawer?.id === client.id) {
                setIsClientDrawerOpen(false);
                setSelectedClientForDrawer(null);
            }
        } catch (e: any) {
            setError(e?.message || 'מחיקת לקוח נכשלה');
        } finally {
            setDeleteBusyId(null);
        }
    };

    const handleUnlinkOrganization = async (org: LinkedOrganizationItem) => {
        if (!tenantClientId || !apiBase) return;
        if (!window.confirm(`האם להסיר את הקישור ל"${org.name}"? החברה תישאר במאגר הגלובלי.`)) return;
        setDeleteBusyId(org.linkId);
        setError(null);
        try {
            const res = await fetch(
                `${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/organization-link/${encodeURIComponent(org.linkId)}`,
                { method: 'DELETE', headers: authHeaders(true) },
            );
            if (!res.ok && res.status !== 204) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'הסרת קישור נכשלה');
            }
            setLinkedOrganizations((prev) => prev.filter((o) => o.linkId !== org.linkId));
        } catch (e: any) {
            setError(e?.message || 'הסרת קישור נכשלה');
        } finally {
            setDeleteBusyId(null);
        }
    };

    const handleOpenClientDrawer = (client: Client) => {
        setSelectedClientForDrawer(client);
        setIsClientDrawerOpen(true);
    };

    const buildClientMetadataPatch = (client: Client) => ({
        pipelineStage: client.pipelineStage,
        pipelineValue: client.pipelineValue,
        nextScheduledActivity: client.nextScheduledActivity,
        activePlacements: client.activePlacements,
        notes: client.notes,
        isContactProcess: client.isContactProcess,
        lastContactDate: client.lastContactDate,
        tier: client.tier,
        logo: client.logo,
    });

    const handleStatusChange = async (clientId: string, newStatus: ClientStatus) => {
        if (!apiBase || clientId.startsWith('tmp-')) {
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));
            return;
        }

        const prevClient = clients.find(c => c.id === clientId);
        const prevStatus = prevClient?.status;

        setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: newStatus } : c));

        try {
            const res = await fetch(`${apiBase}/api/clients/${clientId}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            if (prevStatus) {
                setClients(prev => prev.map(c => c.id === clientId ? { ...c, status: prevStatus } : c));
            }
        }
    };

    const handleStageChange = async (clientId: string, newStage: string) => {
        if (!apiBase || clientId.startsWith('tmp-')) {
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: newStage } : c));
            return;
        }

        const prevClient = clients.find(c => c.id === clientId);
        const prevStage = prevClient?.pipelineStage;

        setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: newStage } : c));

        try {
            const clientAfter = (prevClient ? { ...prevClient, pipelineStage: newStage } : null);
            const metadata = clientAfter ? buildClientMetadataPatch(clientAfter) : { pipelineStage: newStage };

            const res = await fetch(`${apiBase}/api/clients/${clientId}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ metadata }),
            });
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            if (prevStage) {
                setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: prevStage } : c));
            }
        }
    };
    
    const handleQuickAdd = (clientData: Partial<Client>) => {
        const targetPipeline = activePipelineId === 'all' ? pipelines[0] : activePipeline;
        const defaultStage = targetPipeline?.stages[0]?.id || '';

        const newClient: Client = {
            id: `tmp-${Date.now()}`,
            name: clientData.name || 'לקוח חדש',
            contactPerson: clientData.contactPerson || '',
            phone: '',
            email: '',
            openJobs: 0,
            status: 'ליד חדש',
            accountManager: 'אני',
            city: '',
            region: '',
            industry: '',
            tier: 'Standard',
            pipelineStage: clientData.pipelineStage || defaultStage,
            pipelineValue: 0,
            lastContactDate: new Date().toISOString(),
            daysSinceLastContact: 0,
            nextScheduledActivity: null,
            activePlacements: 0
        };
        setClients(prev => [...prev, newClient]);
    };

    // --- Actions (Contacts) ---
    
    const handleContactRowClick = (contact: Contact) => {
        // Toggle logic: If same ID is open, close it. Else open new.
        if (selectedContactForDrawer?.id === contact.id && isContactDrawerOpen) {
            setIsContactDrawerOpen(false);
            setSelectedContactForDrawer(null);
        } else {
            setSelectedContactForDrawer(contact);
            setIsContactDrawerOpen(true);
            setActiveActionMenuId(null);
        }
    };

    const handleContactSelect = (id: string) => {
        setSelectedContactIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllContacts = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
        else setSelectedContactIds(new Set());
    };

    const companySelectableIds = useMemo(
        () =>
            isTenantUser
                ? filteredLinkedOrganizations.map((o) => o.linkId)
                : sortedClients.map((c) => c.id),
        [isTenantUser, filteredLinkedOrganizations, sortedClients],
    );

    const toggleCompanySelect = (id: string) => {
        setSelectedCompanyIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllCompanies = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedCompanyIds(new Set(companySelectableIds));
        else setSelectedCompanyIds(new Set());
    };

    const contactToRecipientOption = (c: Contact) => ({
        id: c.id,
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        subtitle: c.clientName || '',
    });

    const handleBulkAction = (action: 'email' | 'sms' | 'whatsapp') => {
        const selected = sortedContacts.filter((c) => selectedContactIds.has(c.id));
        if (!selected.length) return;
        const allOptions = contacts.map(contactToRecipientOption);
        const initialIds = selected
            .filter((c) => (action === 'email' ? Boolean(c.email?.trim()) : Boolean(c.phone?.trim())))
            .map((c) => c.id);
        const fallbackIds = initialIds.length ? initialIds : selected.map((c) => c.id);
        const primary =
            selected.find((c) => (action === 'email' ? Boolean(c.email?.trim()) : Boolean(c.phone?.trim())))
            || selected[0];
        openMessageModal({
            mode: action,
            candidateName:
                selected.length === 1
                    ? primary.name
                    : `${primary.name} (+${selected.length - 1})`,
            candidatePhone: selected.map((c) => String(c.phone || '').trim()).filter(Boolean).join('; '),
            candidateEmail: selected.map((c) => String(c.email || '').trim()).filter(Boolean).join(', '),
            recipientOptions: allOptions.length ? allOptions : selected.map(contactToRecipientOption),
            initialRecipientIds: fallbackIds,
        });
        setSelectedContactIds(new Set());
    };

    const handleCompanyBulkAction = (action: 'email' | 'sms' | 'whatsapp') => {
        let related: Contact[] = [];
        let label = '';

        if (isTenantUser) {
            const orgs = filteredLinkedOrganizations.filter((o) => selectedCompanyIds.has(o.linkId));
            if (!orgs.length) return;
            const orgIds = new Set(orgs.map((o) => o.organizationId).filter(Boolean) as string[]);
            related = contacts.filter((c) => c.organizationId && orgIds.has(c.organizationId));
            label =
                orgs.length === 1
                    ? orgs[0].name
                    : `${orgs[0].name} (+${orgs.length - 1})`;
        } else {
            const selected = sortedClients.filter((c) => selectedCompanyIds.has(c.id));
            if (!selected.length) return;
            const clientIds = new Set(selected.map((c) => c.id));
            related = contacts.filter((c) => c.clientId && clientIds.has(c.clientId));
            label =
                selected.length === 1
                    ? selected[0].name
                    : `${selected[0].name} (+${selected.length - 1})`;
        }

        const recipientOptions = related.map(contactToRecipientOption);
        if (!recipientOptions.length) {
            window.alert('אין אנשי קשר לחברות שנבחרו. הוסיפו אנשי קשר ואז נסו שוב.');
            return;
        }

        const initialIds = related
            .filter((c) => (action === 'email' ? Boolean(c.email?.trim()) : Boolean(c.phone?.trim())))
            .map((c) => c.id);
        const primary =
            related.find((c) => (action === 'email' ? Boolean(c.email?.trim()) : Boolean(c.phone?.trim())))
            || related[0];

        openMessageModal({
            mode: action,
            candidateName: primary?.name || label,
            candidatePhone: primary?.phone || '',
            candidateEmail: primary?.email || '',
            recipientOptions,
            initialRecipientIds: initialIds.length ? initialIds : [related[0].id],
        });
        setSelectedCompanyIds(new Set());
    };

    const handleBulkStartProcess = (pipelineId: string) => {
        const selected = sortedContacts.filter((c) => selectedContactIds.has(c.id));
        if (!selected.length) return;
        const pipeline = pipelines.find((p) => p.id === pipelineId);
        const firstStage = pipeline?.stages[0]?.id || '';
        const now = Date.now();
        const newItems: Client[] = selected.map((contact, idx) => ({
            id: `tmp-${now}-${idx}`,
            name: `${contact.name} (${contact.clientName})`,
            contactPerson: contact.name,
            phone: contact.phone,
            email: contact.email,
            openJobs: 0,
            status: 'ליד חדש',
            accountManager: 'אני',
            city: 'לא ידוע',
            region: 'מרכז',
            industry: 'כללי',
            tier: 'Standard',
            pipelineStage: firstStage,
            pipelineValue: 0,
            lastContactDate: new Date().toISOString(),
            daysSinceLastContact: 0,
            nextScheduledActivity: null,
            activePlacements: 0,
            isContactProcess: true,
        }));
        setClients((prev) => [...prev, ...newItems]);
        setActiveTab('companies');
        setActivePipelineId(pipelineId);
        if (!isTenantUser) setViewMode('board');
        setSelectedContactIds(new Set());
        setIsBulkProcessMenuOpen(false);
    };

    const handleCompanyBulkStartProcess = (pipelineId: string) => {
        const pipeline = pipelines.find((p) => p.id === pipelineId);
        const firstStage = pipeline?.stages[0]?.id || '';
        if (!firstStage) {
            setIsBulkProcessMenuOpen(false);
            return;
        }
        if (isTenantUser) {
            const orgs = filteredLinkedOrganizations.filter((o) => selectedCompanyIds.has(o.linkId));
            if (!orgs.length) return;
            const now = Date.now();
            const newItems: Client[] = orgs.map((org, idx) => ({
                id: `tmp-org-${now}-${idx}`,
                name: org.name,
                contactPerson: '',
                phone: '',
                email: '',
                openJobs: 0,
                status: 'ליד חדש',
                accountManager: user?.name || 'אני',
                city: org.location || 'לא ידוע',
                region: 'מרכז',
                industry: org.mainField || 'כללי',
                tier: 'Standard',
                pipelineStage: firstStage,
                pipelineValue: 0,
                lastContactDate: new Date().toISOString(),
                daysSinceLastContact: 0,
                nextScheduledActivity: null,
                activePlacements: 0,
                logo: org.logo || undefined,
            }));
            setClients((prev) => [...prev, ...newItems]);
            setViewMode('board');
        } else {
            setClients((prev) =>
                prev.map((c) =>
                    selectedCompanyIds.has(c.id)
                        ? { ...c, pipelineStage: firstStage, status: 'ליד חדש' as ClientStatus }
                        : c,
                ),
            );
            setActivePipelineId(pipelineId);
            setViewMode('board');
        }
        setSelectedCompanyIds(new Set());
        setIsBulkProcessMenuOpen(false);
    };

    const handleBulkExport = () => {
        const rows = sortedContacts.filter((c) => selectedContactIds.has(c.id));
        if (!rows.length) return;
        const stamp = new Date().toISOString().slice(0, 10);
        downloadRowsAsXlsx(
            rows,
            [
                { key: 'name', label: 'שם איש קשר' },
                { key: 'role', label: 'תפקיד' },
                { key: 'clientName', label: 'שם לקוח' },
                { key: 'phone', label: 'טלפון' },
                { key: 'email', label: 'אימייל' },
                { key: 'lastContact', label: 'קשר אחרון' },
            ],
            `contacts_${stamp}.xlsx`,
        );
        setSelectedContactIds(new Set());
    };

    const handleCompanyBulkExport = () => {
        if (selectedCompanyIds.size === 0) return;
        const stamp = new Date().toISOString().slice(0, 10);
        if (isTenantUser) {
            const rows = filteredLinkedOrganizations.filter((o) => selectedCompanyIds.has(o.linkId));
            if (!rows.length) return;
            downloadRowsAsXlsx(
                rows,
                [
                    { key: 'name', label: 'שם חברה' },
                    { key: 'mainField', label: 'תחום' },
                    { key: 'location', label: 'מיקום' },
                    { key: 'employeeCount', label: 'עובדים' },
                    { key: 'website', label: 'אתר' },
                    { key: 'statusLabel', label: 'סטטוס' },
                ],
                `companies_${stamp}.xlsx`,
            );
        } else {
            const rows = sortedClients.filter((c) => selectedCompanyIds.has(c.id));
            if (!rows.length) return;
            downloadRowsAsXlsx(
                rows,
                [
                    { key: 'name', label: 'לקוח' },
                    { key: 'status', label: 'סטטוס' },
                    { key: 'accountManager', label: 'מנהל תיק' },
                    { key: 'industry', label: 'תעשייה' },
                    { key: 'city', label: 'עיר' },
                    { key: 'region', label: 'אזור' },
                    { key: 'contactPerson', label: 'איש קשר' },
                    { key: 'phone', label: 'טלפון' },
                    { key: 'email', label: 'אימייל' },
                ],
                `clients_${stamp}.xlsx`,
            );
        }
        setSelectedCompanyIds(new Set());
    };
    
    const handleSingleContactAction = (action: 'email' | 'sms' | 'whatsapp', contact: Contact) => {
         openMessageModal({
            mode: action,
            candidateName: contact.name, // Reusing candidate modal for contacts for simplicity
            candidatePhone: contact.phone,
            candidateEmail: contact.email,
        });
    };

    const handleContactColumnToggle = (columnId: string) => {
        setContactVisibleColumns(prev => 
            prev.includes(columnId) ? prev.filter(c => c !== columnId) : [...prev, columnId]
        );
    };

    const handleClientColumnToggle = (columnId: string) => {
        setClientVisibleColumns(prev => 
            prev.includes(columnId) ? prev.filter(c => c !== columnId) : [...prev, columnId]
        );
    };

    const handleLinkedOrgColumnToggle = (columnId: string) => {
        setLinkedOrgVisibleColumns((prev) =>
            prev.includes(columnId) ? prev.filter((c) => c !== columnId) : [...prev, columnId],
        );
    };
    
    // --- New Contact Actions ---
    const handleOpenContactDrawer = (contact: Contact) => {
        setSelectedContactForDrawer(contact);
        setIsContactDrawerOpen(true);
        setActiveActionMenuId(null);
    };

    const handleStartProcess = async (contact: Contact, pipelineId: string) => {
        const pipeline = pipelines.find((p) => p.id === pipelineId);
        const firstStage = pipeline?.stages[0]?.id || '';
        const clientId = resolveContactClientId(contact);

        setContacts((list) =>
            list.map((c) =>
                c.id === contact.id
                    ? { ...c, pipelineId, stageId: firstStage }
                    : c,
            ),
        );

        if (apiBase && clientId) {
            try {
                await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contact.id)}`, {
                    method: 'PUT',
                    headers: authHeaders(true),
                    body: JSON.stringify({ pipelineId, processStage: firstStage }),
                });
            } catch (_e) { /* keep optimistic */ }
        }

        // Tenant: also put the linked organization onto the same pipeline stage.
        if (isTenantUser && contact.organizationId && tenantClientId && apiBase) {
            const orgLink = linkedOrganizations.find((o) => o.organizationId === contact.organizationId);
            if (orgLink) {
                setLinkedOrganizations((list) =>
                    list.map((o) =>
                        o.linkId === orgLink.linkId
                            ? { ...o, pipelineId, pipelineStage: firstStage }
                            : o,
                    ),
                );
                try {
                    await fetch(
                        `${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/organization-link/${encodeURIComponent(orgLink.linkId)}`,
                        {
                            method: 'PATCH',
                            headers: authHeaders(true),
                            body: JSON.stringify({ pipelineId, pipelineStage: firstStage }),
                        },
                    );
                } catch (_e) { /* keep optimistic */ }
            }
        }

        setFilterContactPipeline(pipelineId);
        setFilterContactStage('all');
        setActiveTab('contacts');
        setContactsViewMode('board');
        setIsContactDrawerOpen(false);
        setActiveActionMenuId(null);
        alert(`תהליך ${pipeline?.name || 'עבודה'} נפתח עבור ${contact.name}!`);
    };

    const resolveContactClientId = (contact: Contact): string | null => {
        if (contact.clientId) return contact.clientId;
        const match = clients.find((c) => c.name === contact.clientName);
        return match?.id ?? null;
    };

    const handleDeleteContact = (contact: Contact) => {
        setContactToDelete(contact);
        setActiveActionMenuId(null);
        setIsContactDrawerOpen(false);
        setSelectedContactForDrawer(null);
    };

    const confirmDeleteContact = async () => {
        if (!contactToDelete) return;
        const contactId = contactToDelete.id;
        const clientId = resolveContactClientId(contactToDelete);
        setContactDeleteLoading(true);
        try {
            if (apiBase && clientId) {
                const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}`, {
                    method: 'DELETE',
                    headers: authHeaders(true),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(typeof body?.message === 'string' ? body.message : 'מחיקת איש קשר נכשלה');
                }
            }
            setContacts((prev) => prev.filter((c) => c.id !== contactId));
            setSelectedContactIds((prev) => {
                const next = new Set(prev);
                next.delete(contactId);
                return next;
            });
            setContactToDelete(null);
        } catch (e: any) {
            alert(e?.message || 'מחיקת איש קשר נכשלה');
        } finally {
            setContactDeleteLoading(false);
        }
    };

    // Click outside handler for popover and menus
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsColumnPopoverOpen(false);
            }
            if (clientSettingsRef.current && !clientSettingsRef.current.contains(event.target as Node)) {
                setIsClientColumnPopoverOpen(false);
            }
            // Close active action menu if clicked outside
            if (activeActionMenuId !== null && !(event.target as HTMLElement).closest('[data-menu-trigger]')) {
                setActiveActionMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeActionMenuId]);

    const renderClientCell = (client: Client, colId: string) => {
        switch(colId) {
            case 'health':
                return (
                    <div className="flex justify-center">
                        <ClientHealthIndicator client={client} />
                    </div>
                );
            case 'name':
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-bg-subtle border border-border-default flex items-center justify-center text-sm font-bold text-text-muted shrink-0 overflow-hidden">
                            {client.logo ? (
                                <img src={client.logo} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                client.name.substring(0, 2)
                            )}
                        </div>
                        <div>
                             <div className="font-bold text-text-default text-base">{client.name}</div>
                             <div className="text-xs text-text-muted">{client.industry}</div>
                        </div>
                    </div>
                );
            case 'lastContact':
                return (
                    <span className={`text-xs font-medium ${client.daysSinceLastContact > 14 ? 'text-red-500 font-bold' : 'text-text-muted'}`}>
                        לפני {client.daysSinceLastContact} ימים
                    </span>
                );
            case 'nextActivity':
                return client.nextScheduledActivity ? (
                    <span className="text-xs font-medium text-green-600">
                        {new Date(client.nextScheduledActivity).toLocaleDateString('he-IL')}
                    </span>
                ) : (
                    <span className="text-xs text-text-subtle italic">אין</span>
                );
            case 'status':
                return (
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <select
                            value={client.status}
                            onChange={(e) => handleStatusChange(client.id, e.target.value as ClientStatus)}
                            className={`appearance-none inline-flex items-center pr-2.5 pl-6 py-0.5 rounded-full text-xs font-bold border cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500 ${statusStyles[client.status]?.bg || 'bg-gray-100'} ${statusStyles[client.status]?.text || 'text-gray-700'} ${statusStyles[client.status]?.border || 'border-gray-200'}`}
                        >
                            {(Object.keys(statusStyles) as ClientStatus[]).map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                        <ChevronDownIcon className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                    </div>
                );
            case 'pipelineStage':
                // Find stage name even if pipeline is 'all', by searching all pipelines
                let stageName = client.pipelineStage;
                let stageColor = 'border-gray-200';
                let stageBg = 'bg-gray-50';
                let currentPipeline = pipelines[0];

                // Try to find stage in any pipeline
                for (const pipeline of pipelines) {
                    const foundStage = pipeline.stages.find(s => s.id === client.pipelineStage);
                    if (foundStage) {
                        stageName = foundStage.name;
                        stageColor = foundStage.color;
                        stageBg = foundStage.bg;
                        currentPipeline = pipeline;
                        break;
                    }
                }
                
                 return (
                     <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                         <select
                             value={client.pipelineStage}
                             onChange={(e) => handleStageChange(client.id, e.target.value)}
                             className={`appearance-none inline-flex items-center pr-2.5 pl-6 py-0.5 rounded-md text-xs font-bold border cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500 ${stageColor} ${stageBg} text-text-default`}
                         >
                             {(currentPipeline?.stages || []).map(stage => (
                                 <option key={stage.id} value={stage.id}>{stage.name}</option>
                             ))}
                         </select>
                         <ChevronDownIcon className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
                     </div>
                 );
            case 'contactPerson':
                return client.contactPerson;
            case 'phone':
                 return <span dir="ltr">{client.phone}</span>;
            case 'openJobs':
                return <span className="inline-block bg-primary-50 text-primary-700 px-2 py-1 rounded text-xs font-bold">{client.openJobs}</span>;
            case 'actions':
                return (
                    <div className="relative flex items-center justify-end" data-menu-trigger>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveActionMenuId(activeActionMenuId === client.id ? null : client.id);
                            }}
                            className="p-2 rounded-full hover:bg-bg-subtle text-text-muted transition-colors"
                        >
                            <EllipsisVerticalIcon className="w-5 h-5" />
                        </button>
                        {activeActionMenuId === client.id && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-border-default rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in origin-top-left">
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setActiveActionMenuId(null);
                                        handleNavigateToProfile(client.id); 
                                    }}
                                    className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                                >
                                    <BuildingOffice2Icon className="w-4 h-4 text-text-subtle"/>
                                    צפה בתיק לקוח
                                </button>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setActiveActionMenuId(null); 
                                        handleCardClick(client); 
                                    }}
                                    className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2 border-t border-border-default"
                                >
                                    <ArrowRightIcon className="w-4 h-4 text-text-subtle"/>
                                    עדכון סטטוס מהיר
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveActionMenuId(null);
                                        void handleDeleteClient(client);
                                    }}
                                    disabled={deleteBusyId === client.id}
                                    className="w-full text-right px-4 py-2.5 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-border-default disabled:opacity-50"
                                >
                                    <TrashIcon className="w-4 h-4"/>
                                    {deleteBusyId === client.id ? 'מוחק...' : 'מחק לקוח'}
                                </button>
                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    // Helper to determine the pipeline ID to pass to modal
    const getModalPipelineId = () => {
        if (activePipelineId !== 'all') return activePipelineId;
        // If All, default to first pipeline (Sales) or try to infer from selectedClient if available
        if (selectedClient) {
             const found = pipelines.find(p => p.stages.some(s => s.id === selectedClient?.pipelineStage));
             if (found) return found.id;
        }
        return pipelines[0]?.id || 'all';
    }


    // --- Render ---

    return (
        <div className="flex flex-col space-y-4 pb-6">
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
                .dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); }
                th[draggable] { cursor: grab; }
                th[draggable]:active { cursor: grabbing; }
                @keyframes slide-in-right { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                .animate-slide-in-right { animation: slide-in-right 0.25s ease-out forwards; }
            `}</style>

             {/* Header & KPIs */}
             <div className="flex flex-col gap-6">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-text-default">{t('clients.title')}</h1>
                        <p className="text-sm text-text-muted">
                            {isTenantUser
                                ? 'חברות מהמאגר הגלובלי המקושרות ללקוח שלך'
                                : 'ניהול קשרי לקוחות, אנשי קשר ותהליכי מכירה'}
                        </p>
                    </div>
                    <button 
                        onClick={() => navigate('/clients/new')}
                        className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2 w-full md:w-auto justify-center"
                    >
                        <PlusIcon className="w-5 h-5"/>
                        <span>{isTenantUser ? 'קשר חברה לארגון' : 'לקוח חדש'}</span>
                    </button>
                 </div>

                 {/* Mobile Stats Toggle */}
                 <div className="lg:hidden">
                    <button 
                        onClick={() => setShowMobileStats(!showMobileStats)}
                        className="w-full bg-bg-card border border-border-default rounded-xl p-3 flex items-center justify-between shadow-sm text-sm font-bold text-text-default hover:bg-bg-subtle"
                    >
                        <span>{showMobileStats ? 'הסתר מדדים' : 'הצג מדדים וסטטיסטיקה'}</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMobileStats ? 'rotate-180' : ''}`} />
                    </button>
                 </div>

                 <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${showMobileStats ? 'block' : 'hidden lg:grid'}`}>
                    {isTenantUser ? (
                        <>
                            <StatCard
                                title="חברות מקושרות"
                                value={linkedOrganizations.length.toString()}
                                icon={<BuildingOffice2Icon className="w-6 h-6 text-blue-600"/>}
                                color="bg-blue-100"
                            />
                            <StatCard
                                title="מאושרות במאגר"
                                value={stats.activeClients.toString()}
                                icon={<CheckCircleIcon className="w-6 h-6 text-green-600"/>}
                                color="bg-green-100"
                            />
                            <StatCard
                                title="ממתינות לאישור"
                                value={stats.totalValue.toString()}
                                icon={<ClockIcon className="w-6 h-6 text-orange-600"/>}
                                color="bg-orange-100"
                            />
                            <StatCard
                                title="ראשיות"
                                value={linkedOrganizations.filter((o) => o.isPrimary).length.toString()}
                                icon={<ChartBarIcon className="w-6 h-6 text-purple-600"/>}
                                color="bg-purple-100"
                            />
                        </>
                    ) : (
                        <>
                    <StatCard 
                        title="משרות פתוחות" 
                        value={stats.totalOpenJobs.toString()} 
                        icon={<BriefcaseIcon className="w-6 h-6 text-blue-600"/>} 
                        color="bg-blue-100" 
                    />
                    <StatCard 
                        title="לקוחות פעילים" 
                        value={stats.activeClients.toString()} 
                        icon={<UserGroupIcon className="w-6 h-6 text-green-600"/>} 
                        color="bg-green-100" 
                    />
                    <StatCard 
                        title="יחס המרה (Win Rate)" 
                        value={`${stats.winRate}%`} 
                        trend={stats.winRate > 20 ? '+5%' : '-2%'}
                        icon={<ChartBarIcon className="w-6 h-6 text-purple-600"/>} 
                        color="bg-purple-100" 
                    />
                    <StatCard 
                        title="שווי פייפליין" 
                        value={`₪${(stats.totalValue / 1000).toFixed(0)}k`} 
                        icon={<ChartBarIcon className="w-6 h-6 text-orange-600"/>} 
                        color="bg-orange-100" 
                    />
                        </>
                    )}
                </div>
             </div>

             {/* Tab Switcher */}
             <div className="flex border-b border-border-default overflow-x-auto no-scrollbar">
                 <button 
                    onClick={() => { setActiveTab('companies'); setSelectedContactIds(new Set()); }} 
                    className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'companies' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}
                 >
                     <BuildingOffice2Icon className="w-5 h-5 inline-block ml-2"/>
                     {isTenantUser ? 'חברות מקושרות' : 'תיקי לקוחות'}
                 </button>
                 <button 
                    onClick={() => { setActiveTab('contacts'); setSelectedCompanyIds(new Set()); }} 
                    className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'contacts' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}
                 >
                     <UserGroupIcon className="w-5 h-5 inline-block ml-2"/>
                     אנשי קשר
                 </button>
                 {/* Processes / Tasks — admin: across clients; tenant: across linked orgs */}
                 <button 
                    onClick={() => { setActiveTab('tasks'); setSelectedCompanyIds(new Set()); setSelectedContactIds(new Set()); }} 
                    className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'tasks' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}
                 >
                     <ClipboardDocumentCheckIcon className="w-5 h-5 inline-block ml-2"/>
                     תהליכים/משימות
                 </button>
             </div>

             {/* Toolbar & View Controls */}
             {activeTab !== 'tasks' && (
             <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm flex flex-col items-center gap-4 relative z-30">
                 
                 {/* Top Row: Search */}
                 <div className="w-full flex items-center gap-4">
                     <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder={
                                activeTab === 'companies'
                                    ? (isTenantUser ? 'חיפוש חברה...' : 'חיפוש לקוח...')
                                    : 'חיפוש איש קשר...'
                            } 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all" 
                        />
                     </div>
                 </div>

                 {/* Filters Row - Companies tab (admin clients + tenant linked orgs) */}
                 {activeTab === 'companies' && (
                     <div className="w-full grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-wrap gap-3 items-center pt-2 border-t border-border-subtle">
                        {/* Status Filter */}
                        <div className="relative">
                            <select 
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm pr-8 focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer pl-9"
                            >
                                <option value="all">כל הסטטוסים</option>
                                {isTenantUser ? (
                                    <>
                                        <option value="approved">מאושר</option>
                                        <option value="pending">ממתין לאישור</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="פעיל">פעיל</option>
                                        <option value="בהקפאה">בהקפאה</option>
                                        <option value="לא פעיל">לא פעיל</option>
                                        <option value="ליד חדש">ליד חדש</option>
                                    </>
                                )}
                            </select>
                            <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                        </div>

                        {/* Account Manager Filter — agency clients only */}
                        {!isTenantUser && (
                        <div className="relative">
                            <select 
                                value={filterAccountManager}
                                onChange={(e) => setFilterAccountManager(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm pr-8 focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer pl-9"
                            >
                                <option value="all">כל מנהלי התיק</option>
                                {accountManagers.map(am => <option key={am} value={am}>{am}</option>)}
                            </select>
                            <UserIcon className="w-4 h-4 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                        </div>
                        )}

                         {/* Industry Filter (Smart Button) */}
                         <div className="relative">
                            <button
                                ref={companyFilterButtonRef}
                                onClick={() => setIsCompanyFilterOpen(prev => !prev)}
                                className={`w-full flex items-center justify-between gap-2 font-medium py-2 px-3 rounded-lg border transition-all text-sm h-[38px] ${
                                    isCompanyFilterOpen || companyFilters.industry
                                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                                        : 'bg-bg-input text-text-default border-border-default hover:border-primary-300'
                                }`}
                                title="סינון לפי תעשייה"
                            >
                                <div className="flex items-center gap-2 truncate">
                                    <BuildingOffice2Icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="truncate">{companyFilters.industry || 'כל התעשיות'}</span>
                                </div>
                                <ChevronDownIcon className="w-4 h-4 text-text-subtle flex-shrink-0" />
                            </button>
                            {isCompanyFilterOpen && (
                                <div className="absolute top-full right-0 z-30 mt-2">
                                     <CompanyFilterPopover
                                        onClose={() => setIsCompanyFilterOpen(false)}
                                        filters={companyFilters}
                                        setFilters={setCompanyFilters}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Location Filter (Improved) */}
                         <div className="relative col-span-2 md:col-span-1 lg:w-48">
                            <LocationSelector
                                selectedLocations={selectedLocations}
                                onChange={(locs) => setSelectedLocations(locs)}
                                placeholder="מיקום (עיר/אזור)"
                                className="w-full"
                             />
                         </div>

                        {/* Pipeline Selector */}
                         <div className="relative flex items-center bg-white border border-border-default rounded-lg px-3 py-1.5 h-[42px] col-span-2 md:col-span-2 lg:ml-auto w-full md:w-auto">
                            <FunnelIcon className="w-4 h-4 text-text-subtle ml-2 flex-shrink-0"/>
                            <select 
                                value={activePipelineId}
                                onChange={(e) => {
                                    setActivePipelineId(e.target.value);
                                    setActiveStageId('all'); // Reset stage when pipeline changes
                                }}
                                className="bg-transparent text-sm font-bold text-text-default outline-none cursor-pointer w-full min-w-[140px]"
                            >
                                <option value="all">כל התהליכים</option>
                                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                         </div>
                         
                         {/* Stage Filter (Conditional) */}
                         {activePipelineId !== 'all' && (
                             <div className="relative flex items-center bg-white border border-border-default rounded-lg px-3 py-1.5 h-[42px] col-span-2 md:col-span-2 w-full md:w-auto animate-fade-in">
                                <select 
                                    value={activeStageId}
                                    onChange={(e) => setActiveStageId(e.target.value)}
                                    className="bg-transparent text-sm font-medium text-text-default outline-none cursor-pointer w-full min-w-[120px]"
                                >
                                    <option value="all">כל השלבים</option>
                                    {availableStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                             </div>
                         )}

                     </div>
                 )}

                 {/* Filters Row - Only for Contacts tab */}
                 {activeTab === 'contacts' && (
                     <div className="w-full flex flex-wrap gap-3 items-center pt-2 border-t border-border-subtle">
                         
                         {/* Process Filter */}
                         <div className="relative flex-grow md:flex-grow-0 md:w-48">
                             <select
                                value={filterContactPipeline}
                                onChange={(e) => {
                                    setFilterContactPipeline(e.target.value);
                                    setFilterContactStage('all'); // Reset stage when pipeline changes
                                }}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm pr-8 focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
                             >
                                 <option value="all">כל התהליכים</option>
                                 {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                             </select>
                             <BriefcaseIcon className="w-4 h-4 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                         </div>
                         
                         {/* Stage Filter (Conditional) */}
                         {filterContactPipeline !== 'all' && (
                             <div className="relative flex-grow md:flex-grow-0 md:w-48 animate-fade-in">
                                 <select
                                    value={filterContactStage}
                                    onChange={(e) => setFilterContactStage(e.target.value)}
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm pr-8 focus:ring-2 focus:ring-primary-500 outline-none appearance-none cursor-pointer"
                                 >
                                     <option value="all">כל השלבים</option>
                                     {availableContactStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                 </select>
                                 <FunnelIcon className="w-4 h-4 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                             </div>
                         )}
                         
                         {/* Created Date Range */}
                         <div className="flex items-center gap-2 bg-bg-input border border-border-default rounded-lg p-1">
                             <div className="relative">
                                 <input 
                                    type="date" 
                                    value={filterContactDateFrom} 
                                    onChange={e => setFilterContactDateFrom(e.target.value)}
                                    className="text-sm bg-transparent border-none outline-none p-1 w-28"
                                    placeholder="מתאריך"
                                 />
                             </div>
                             <span className="text-text-muted">-</span>
                             <div className="relative">
                                 <input 
                                    type="date" 
                                    value={filterContactDateTo} 
                                    onChange={e => setFilterContactDateTo(e.target.value)}
                                    className="text-sm bg-transparent border-none outline-none p-1 w-28"
                                    placeholder="עד תאריך"
                                 />
                             </div>
                         </div>
                         
                         {/* Existing filters */}
                         <div className="relative flex-grow md:flex-grow-0 md:w-48">
                             {/* Use SearchableSelect for Account Managers in contacts too if needed, or keep simple select for smaller lists */}
                             <SearchableSelect
                                options={contactRoles.map((r, i) => ({ id: r, label: r }))}
                                value={filterContactRole === 'all' ? null : filterContactRole}
                                onChange={(val) => setFilterContactRole(val ? String(val) : 'all')}
                                placeholder="כל התפקידים"
                                className="w-full"
                                icon={<UserIcon className="w-4 h-4 text-text-subtle"/>}
                             />
                         </div>
                         
                         <div className="relative flex-grow md:flex-grow-0 md:w-48">
                              {/* Use SearchableSelect for Client names in contacts (can be large) */}
                             <SearchableSelect
                                options={contactClients.map(c => ({ id: c, label: c }))}
                                value={filterContactClient === 'all' ? null : filterContactClient}
                                onChange={(val) => setFilterContactClient(val ? String(val) : 'all')}
                                placeholder={isTenantUser ? 'כל הארגונים' : 'כל הלקוחות'}
                                className="w-full"
                                icon={<BuildingOffice2Icon className="w-4 h-4 text-text-subtle"/>}
                             />
                         </div>
                     </div>
                 )}

                 <div className="w-full flex justify-end gap-3 pt-2 border-t border-border-subtle">
                     {activeTab === 'companies' ? (
                         <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="relative" ref={clientSettingsRef}>
                                <button 
                                    onClick={() => setIsClientColumnPopoverOpen(!isClientColumnPopoverOpen)}
                                    className="p-2 bg-bg-subtle border border-border-default rounded-lg hover:bg-bg-hover transition-colors"
                                    title="התאם עמודות"
                                >
                                    <Cog6ToothIcon className="w-5 h-5 text-text-muted" />
                                </button>
                                {isClientColumnPopoverOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-xl shadow-xl border border-border-default z-50 p-4 animate-fade-in">
                                        <p className="font-bold text-text-default mb-2 text-sm border-b border-border-default pb-2">בחר עמודות להצגה</p>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {(isTenantUser ? allLinkedOrgColumns : allClientColumns).map(col => (
                                                <label key={col.id} className="flex items-center gap-2 text-sm text-text-default hover:bg-bg-hover p-1.5 rounded cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={
                                                            isTenantUser
                                                                ? linkedOrgVisibleColumns.includes(col.id)
                                                                : clientVisibleColumns.includes(col.id)
                                                        }
                                                        onChange={() =>
                                                            isTenantUser
                                                                ? handleLinkedOrgColumnToggle(col.id)
                                                                : handleClientColumnToggle(col.id)
                                                        }
                                                        className="rounded text-primary-600 focus:ring-primary-500" 
                                                    />
                                                    {col.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                             <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default shrink-0">
                                <button 
                                    onClick={() => setViewMode('table')} 
                                    className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'table' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת רשימה"
                                >
                                    <TableCellsIcon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => setViewMode('grid')} 
                                    className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת כרטיסיות"
                                >
                                    <Squares2X2Icon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => setViewMode('board')} 
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === 'board' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת לוח (Kanban)"
                                >
                                    <ChartBarIcon className="w-4 h-4 transform rotate-90"/>
                                </button>
                             </div>
                         </div>
                     ) : (
                         // Contacts Toolbar Controls
                         <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            {/* Column Visibility Popover Trigger */}
                            <div className="relative" ref={settingsRef}>
                                 <button 
                                    onClick={() => setIsColumnPopoverOpen(!isColumnPopoverOpen)}
                                    className="p-2 bg-bg-subtle border border-border-default rounded-lg hover:bg-bg-hover transition-colors"
                                    title="התאם עמודות"
                                >
                                    <Cog6ToothIcon className="w-5 h-5 text-text-muted" />
                                </button>
                                {isColumnPopoverOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-xl shadow-xl border border-border-default z-50 p-4 animate-fade-in">
                                        <p className="font-bold text-text-default mb-2 text-sm border-b border-border-default pb-2">בחר עמודות להצגה</p>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {allContactColumns.map(col => (
                                                <label key={col.id} className="flex items-center gap-2 text-sm text-text-default hover:bg-bg-hover p-1.5 rounded cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={contactVisibleColumns.includes(col.id)} 
                                                        onChange={() => handleContactColumnToggle(col.id)} 
                                                        className="rounded text-primary-600 focus:ring-primary-500" 
                                                    />
                                                    {col.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                             <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default shrink-0">
                                <button 
                                    onClick={() => setContactsViewMode('table')} 
                                    className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${contactsViewMode === 'table' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת רשימה"
                                >
                                    <TableCellsIcon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => setContactsViewMode('grid')} 
                                    className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${contactsViewMode === 'grid' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת כרטיסיות"
                                >
                                    <Squares2X2Icon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => setContactsViewMode('board')} 
                                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${contactsViewMode === 'board' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת לוח (Kanban)"
                                >
                                    <ChartBarIcon className="w-4 h-4 transform rotate-90"/>
                                </button>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
             )}

             {/* Content Area */}
             <div className="bg-bg-subtle/30 rounded-2xl border border-border-default flex flex-col overflow-hidden">
                 {error ? (
                     <div className="p-6 text-center text-sm font-semibold text-red-600">{error}</div>
                 ) : null}
                 {isLoading ? (
                     <div className="p-12 text-center text-sm text-text-muted">טוען...</div>
                 ) : null}
                 {activeTab === 'companies' ? (
                    isTenantUser ? (
                        viewMode === 'table' ? (
                        <div className="overflow-x-auto custom-scrollbar bg-bg-card">
                            <table className="w-full text-sm text-right border-collapse min-w-[600px]">
                                <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-10 border-b border-border-default">
                                    <tr>
                                        <th className="p-4 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                checked={
                                                    filteredLinkedOrganizations.length > 0
                                                    && filteredLinkedOrganizations.every((o) => selectedCompanyIds.has(o.linkId))
                                                }
                                                onChange={handleSelectAllCompanies}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </th>
                                        {linkedOrgVisibleColumns.map((colId) => {
                                            const col = allLinkedOrgColumns.find((c) => c.id === colId);
                                            if (!col) return null;
                                            return (
                                                <th
                                                    key={col.id}
                                                    className={`p-4 ${col.id === 'health' || col.id === 'actions' ? 'text-center' : ''}`}
                                                >
                                                    {col.label}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {filteredLinkedOrganizations.map((org) => (
                                        <tr
                                            key={org.linkId}
                                            className={`hover:bg-bg-hover transition-colors cursor-pointer group ${selectedCompanyIds.has(org.linkId) ? 'bg-primary-50/50' : ''}`}
                                            onClick={() => {
                                                if (isPlatformAdmin) navigate(`/admin/companies?tab=db&search=${encodeURIComponent(org.name)}`);
                                                else void openOrgDrawer(org);
                                            }}
                                        >
                                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                    checked={selectedCompanyIds.has(org.linkId)}
                                                    onChange={() => toggleCompanySelect(org.linkId)}
                                                />
                                            </td>
                                            {linkedOrgVisibleColumns.map((colId) => {
                                                if (colId === 'name') {
                                                    return (
                                            <td key={colId} className="p-4">
                                                <div className="flex items-center gap-3">
                                                    {org.logo ? (
                                                        <img src={org.logo} alt="" className="w-8 h-8 rounded-lg object-contain border border-border-default bg-bg-subtle p-0.5 shrink-0" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-bg-subtle border border-border-default flex items-center justify-center shrink-0">
                                                            <BuildingOffice2Icon className="w-4 h-4 text-text-muted" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-bold text-text-default">{org.name}</p>
                                                        <div className="flex gap-1 mt-0.5">
                                                            {org.isPrimary ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700">ראשית</span> : null}
                                                            {org.isPending ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">ממתין</span> : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                                    );
                                                }
                                                if (colId === 'health') {
                                                    return (
                                            <td key={colId} className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex justify-center">
                                                    <OrgHealthIndicator
                                                        org={org}
                                                        pulseData={org.organizationId ? orgPulseById[org.organizationId] : null}
                                                    />
                                                </div>
                                            </td>
                                                    );
                                                }
                                                if (colId === 'mainField') {
                                                    return <td key={colId} className="p-4 text-text-muted">{org.mainField || '—'}</td>;
                                                }
                                                if (colId === 'location') {
                                                    return <td key={colId} className="p-4 text-text-muted">{org.location || '—'}</td>;
                                                }
                                                if (colId === 'employeeCount') {
                                                    return <td key={colId} className="p-4 text-text-muted">{org.employeeCount || '—'}</td>;
                                                }
                                                if (colId === 'website') {
                                                    return (
                                            <td key={colId} className="p-4">
                                                {org.website ? (
                                                    <a
                                                        href={org.website}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary-600 hover:underline inline-flex items-center gap-1 text-xs"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {formatWebsiteHost(org.website)}
                                                        <LinkIcon className="w-3 h-3" />
                                                    </a>
                                                ) : '—'}
                                            </td>
                                                    );
                                                }
                                                if (colId === 'actions') {
                                                    return (
                                            <td key={colId} className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {org.organizationId && (
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/organizations/${org.organizationId}`)}
                                                            className="text-xs font-bold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-lg transition whitespace-nowrap"
                                                            title="ניהול תיק לקוח"
                                                        >
                                                            ניהול תיק לקוח
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnlinkOrganization(org)}
                                                        disabled={deleteBusyId === org.linkId}
                                                        className="p-1.5 rounded-lg text-text-subtle hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                                        title="הסר קישור"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                                    );
                                                }
                                                return null;
                                            })}
                                        </tr>
                                    ))}
                                    {!isLoading && filteredLinkedOrganizations.length === 0 ? (
                                        <tr>
                                            <td colSpan={Math.max(2, linkedOrgVisibleColumns.length + 1)} className="p-12 text-center text-text-muted">
                                                <BuildingOffice2Icon className="w-10 h-10 mx-auto mb-2 opacity-20"/>
                                                <p>אין חברות מקושרות עדיין.</p>
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                        ) : viewMode === 'board' ? (
                        <div className="overflow-x-auto overflow-y-hidden p-6 custom-scrollbar">
                             {activePipelineId === 'all' ? (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted py-16">
                                    <ChartBarIcon className="w-16 h-16 opacity-20 mb-4"/>
                                    <h3 className="text-xl font-bold">לא ניתן להציג לוח Kanban עבור "כל התהליכים"</h3>
                                    <p>אנא בחר תהליך ספציפי מהפילטר למעלה כדי לראות את הלוח לפי ארגונים.</p>
                                </div>
                             ) : (
                                <div className="flex gap-6 h-full min-w-max">
                                    {activePipeline && activePipeline.stages.map((stage) => {
                                        const stageItems = filteredLinkedOrganizations.filter((o) =>
                                            o.pipelineStage === stage.id
                                            || (!o.pipelineStage && !o.pipelineId && stage.id === activePipeline.stages[0].id),
                                        );
                                        return (
                                            <div
                                                key={stage.id}
                                                className="w-80 flex flex-col h-full max-h-full bg-bg-subtle/50 rounded-2xl border border-border-default/60 shadow-sm"
                                                onDragOver={handleKanbanDragOver}
                                                onDrop={(e) => handleKanbanDrop(e, stage.id)}
                                            >
                                                <div className={`p-3 border-b border-border-default/50 flex justify-between items-center bg-white rounded-t-2xl border-t-4 ${stage.color}`}>
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <h3 className={`font-bold text-sm truncate ${stage.accent}`}>{stage.name}</h3>
                                                        <span className="bg-bg-subtle px-2 py-0.5 rounded-full text-xs font-bold text-text-muted border border-border-subtle flex-shrink-0">
                                                            {stageItems.length}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar max-h-[60vh]">
                                                    {stageItems.map((org) => (
                                                        <div
                                                            key={org.linkId}
                                                            draggable
                                                            onDragStart={(e) => handleOrgKanbanDragStart(e, org.linkId)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => void openOrgDrawer(org)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') void openOrgDrawer(org);
                                                            }}
                                                            className={`bg-white border rounded-xl p-3 shadow-sm hover:border-primary-300 cursor-grab active:cursor-grabbing transition relative ${selectedCompanyIds.has(org.linkId) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'}`}
                                                        >
                                                            <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                                    checked={selectedCompanyIds.has(org.linkId)}
                                                                    onChange={() => toggleCompanySelect(org.linkId)}
                                                                />
                                                            </div>
                                                            <div className="flex items-start gap-3 pr-1">
                                                                {org.logo ? (
                                                                    <img src={org.logo} alt="" className="w-9 h-9 rounded-lg object-contain border border-border-default bg-bg-subtle p-0.5 shrink-0" />
                                                                ) : (
                                                                    <div className="w-9 h-9 rounded-lg bg-bg-subtle border border-border-default flex items-center justify-center shrink-0">
                                                                        <BuildingOffice2Icon className="w-4 h-4 text-text-muted" />
                                                                    </div>
                                                                )}
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="font-bold text-sm text-text-default truncate">{org.name}</p>
                                                                        <OrgHealthIndicator
                                                                            org={org}
                                                                            pulseData={org.organizationId ? orgPulseById[org.organizationId] : null}
                                                                        />
                                                                    </div>
                                                                    <p className="text-xs text-text-muted mt-0.5 truncate">{org.mainField || org.location || '—'}</p>
                                                                </div>
                                                            </div>
                                                            {org.organizationId && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); navigate(`/organizations/${org.organizationId}`); }}
                                                                    className="mt-3 w-full text-xs font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg py-1.5 transition"
                                                                >
                                                                    ניהול תיק לקוח
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {stageItems.length === 0 ? (
                                                        <p className="text-xs text-text-muted text-center py-6">אין פריטים</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                             )}
                        </div>
                        ) : (
                        <div className="overflow-y-auto custom-scrollbar p-6 bg-bg-card">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                               {filteredLinkedOrganizations.map((org) => (
                                    <div
                                        key={org.linkId}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                            if (isPlatformAdmin) {
                                                navigate(`/admin/companies?tab=db&search=${encodeURIComponent(org.name)}`);
                                            } else {
                                                void openOrgDrawer(org);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                if (isPlatformAdmin) navigate(`/admin/companies?tab=db&search=${encodeURIComponent(org.name)}`);
                                                else void openOrgDrawer(org);
                                            }
                                        }}
                                        className={`bg-bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary-300 transition-all cursor-pointer relative ${selectedCompanyIds.has(org.linkId) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'}`}
                                    >
                                         <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                checked={selectedCompanyIds.has(org.linkId)}
                                                onChange={() => toggleCompanySelect(org.linkId)}
                                            />
                                         </div>
                                         <div className="flex items-start gap-4">
                                             {org.logo ? (
                                                 <img src={org.logo} alt="" className="w-14 h-14 rounded-xl object-contain border border-border-default bg-bg-subtle p-1 shrink-0" />
                                             ) : (
                                                 <div className="w-14 h-14 rounded-xl bg-bg-subtle border border-border-default flex items-center justify-center shrink-0">
                                                     <BuildingOffice2Icon className="w-7 h-7 text-text-muted" />
                                                 </div>
                                             )}
                                             <div className="min-w-0 flex-1">
                                                 <div className="flex flex-wrap items-center gap-2">
                                                     <h3 className="font-bold text-text-default truncate">{org.name}</h3>
                                                     <OrgHealthIndicator
                                                         org={org}
                                                         pulseData={org.organizationId ? orgPulseById[org.organizationId] : null}
                                                     />
                                                     {org.isPrimary ? (
                                                         <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">ראשית</span>
                                                     ) : null}
                                                     {org.isPending ? (
                                                         <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">ממתין לאישור</span>
                                                     ) : null}
                                                 </div>
                                                 <p className="text-sm text-text-muted mt-1">{org.mainField || '—'}</p>
                                             </div>
                                                <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); void handleUnlinkOrganization(org); }}
                                                disabled={deleteBusyId === org.linkId}
                                                className="shrink-0 p-2 rounded-lg text-text-subtle hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                                                title="הסר קישור"
                                            >
                                                 <TrashIcon className="w-4 h-4" />
                                             </button>
                                         </div>
                                         {org.subFields.length > 0 ? (
                                             <div className="mt-4">
                                                 <p className="text-xs font-semibold text-text-muted mb-2">תחום עיסוק</p>
                                                 <div className="flex flex-wrap gap-1.5">
                                                     {org.subFields.map((sf) => (
                                                         <span key={sf} className="text-xs font-semibold px-2 py-1 rounded-full bg-secondary-100 text-secondary-800">{sf}</span>
                                                     ))}
                                                 </div>
                                             </div>
                                         ) : null}
                                         {org.secondaryField ? (
                                             <div className="mt-3">
                                                 <p className="text-xs font-semibold text-text-muted mb-1">תחום עיסוק משני</p>
                                                 <p className="text-sm text-text-default">{org.secondaryField}</p>
                                             </div>
                                         ) : null}
                                         <dl className="mt-4 pt-4 border-t border-border-subtle space-y-2 text-sm">
                                             <div className="flex justify-between gap-3">
                                                 <dt className="text-text-muted">מיקום</dt>
                                                 <dd className="font-semibold text-right">{org.location || '—'}</dd>
                                             </div>
                                             <div className="flex justify-between gap-3">
                                                 <dt className="text-text-muted">עובדים</dt>
                                                 <dd className="font-semibold">{org.employeeCount || '—'}</dd>
                                             </div>
                                             <div className="flex justify-between gap-3 items-center">
                                                 <dt className="text-text-muted">אתר</dt>
                                                 <dd className="font-semibold text-right">
                                                     {org.website ? (
                                                         <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline inline-flex items-center gap-1">
                                                             <span>{formatWebsiteHost(org.website)}</span>
                                                             <LinkIcon className="w-4 h-4" />
                                                         </a>
                                                     ) : '—'}
                                                 </dd>
                                             </div>
                                         </dl>
                                         {/* Card footer action */}
                                         {org.organizationId && (
                                             <div className="mt-4 pt-4 border-t border-border-subtle" onClick={(e) => e.stopPropagation()}>
                                                 <button
                                                     type="button"
                                                     onClick={(e) => { e.stopPropagation(); navigate(`/organizations/${org.organizationId}`); }}
                                                     className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-sm font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-200 transition"
                                                 >
                                                     <BriefcaseIcon className="w-4 h-4" />
                                                     ניהול תיק לקוח
                                                 </button>
                                             </div>
                                         )}
                                     </div>
                                 ))}
                             </div>
                             {!isLoading && filteredLinkedOrganizations.length === 0 ? (
                                 <div className="text-center py-12 flex flex-col items-center justify-center text-text-muted">
                                     <BuildingOffice2Icon className="w-12 h-12 mb-3 opacity-20"/>
                                     <p>אין חברות מקושרות עדיין.</p>
                                     <button
                                         type="button"
                                         onClick={() => navigate('/clients/new')}
                                         className="mt-4 text-sm font-bold text-primary-600 hover:text-primary-700"
                                     >
                                         קשר חברה לארגון
                                     </button>
                                 </div>
                             ) : null}
                         </div>
                        )
                     ) : viewMode === 'table' ? (
                        <div className="overflow-x-auto custom-scrollbar bg-bg-card">
                             <table className="w-full text-sm text-right border-collapse min-w-[900px]">
                                 <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-20 border-b border-border-default shadow-sm">
                                     <tr>
                                         <th className="p-4 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                checked={
                                                    sortedClients.length > 0
                                                    && sortedClients.every((c) => selectedCompanyIds.has(c.id))
                                                }
                                                onChange={handleSelectAllCompanies}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                         </th>
                                         {clientVisibleColumns.map((colId, index) => {
                                             const col = allClientColumns.find(c => c.id === colId);
                                             if (!col) return null;
                                             return (
                                                 <th 
                                                    key={col.id} 
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors select-none ${draggingColumn === col.id ? 'dragging' : ''} ${col.id === 'actions' ? 'text-left' : ''} ${col.id === 'health' ? 'text-center' : ''}`}
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id, 'clients')}
                                                    onDragEnter={() => handleDragEnter(index, 'clients')}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onClick={() => requestClientSort(col.id as keyof Client)}
                                                >
                                                     {col.label} {getClientSortIndicator(col.id as keyof Client)}
                                                 </th>
                                             );
                                         })}
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-border-subtle">
                                     {sortedClients.map(client => {
                                         return (
                                             <tr 
                                                 key={client.id} 
                                                 className={`hover:bg-bg-hover transition-colors group cursor-pointer ${activeActionMenuId === client.id ? 'z-50 relative' : ''} ${selectedCompanyIds.has(client.id) ? 'bg-primary-50/50' : ''}`}
                                                 onClick={() => handleOpenClientDrawer(client)}
                                             >
                                                 <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                        checked={selectedCompanyIds.has(client.id)}
                                                        onChange={() => toggleCompanySelect(client.id)}
                                                    />
                                                 </td>
                                                 {clientVisibleColumns.map(colId => (
                                                     <td key={colId} className="p-4">
                                                         {renderClientCell(client, colId)}
                                                     </td>
                                                 ))}
                                             </tr>
                                         );
                                     })}
                                 </tbody>
                             </table>
                             {sortedClients.length === 0 && (
                                <div className="text-center py-12 flex flex-col items-center justify-center text-text-muted">
                                    <UserGroupIcon className="w-12 h-12 mb-3 opacity-20"/>
                                    <p>לא נמצאו לקוחות.</p>
                                </div>
                             )}
                        </div>
                     ) : viewMode === 'grid' ? (
                         <div className="overflow-y-auto custom-scrollbar p-6">
                             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {sortedClients.map(client => {
                                    const stageInfo = activePipeline
                                        ? activePipeline.stages.find(s => s.id === client.pipelineStage)
                                        : pipelines[0]?.stages.find(s => s.id === client.pipelineStage);
                                    
                                    // Fallback for stage name if 'All' pipeline or missing
                                    let displayStageName = stageInfo?.name || client.pipelineStage;
                                    let displayStageColor = stageInfo?.color || 'border-gray-300';
                                    
                                    if (!stageInfo && activePipelineId === 'all') {
                                        // Try to find stage name in any pipeline
                                        for (const pipeline of pipelines) {
                                            const s = pipeline.stages.find(st => st.id === client.pipelineStage);
                                            if (s) {
                                                displayStageName = s.name;
                                                displayStageColor = s.color;
                                                break;
                                            }
                                        }
                                    }

                                    return (
                                        <ClientGridCard 
                                            key={client.id}
                                            client={client}
                                            onClick={() => handleOpenClientDrawer(client)}
                                            stageName={displayStageName}
                                            activePipelineColor={displayStageColor}
                                            pipelines={pipelines}
                                            onStatusChange={handleStatusChange}
                                            onStageChange={handleStageChange}
                                            onDelete={(c) => void handleDeleteClient(c)}
                                            isDeleting={deleteBusyId === client.id}
                                            isSelected={selectedCompanyIds.has(client.id)}
                                            onToggleSelect={() => toggleCompanySelect(client.id)}
                                        />
                                    );
                                })}
                             </div>
                         </div>
                     ) : (
                         // KANBAN VIEW
                         <div className="overflow-x-auto overflow-y-hidden p-6 custom-scrollbar">
                             {activePipelineId === 'all' ? (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                                    <ChartBarIcon className="w-16 h-16 opacity-20 mb-4"/>
                                    <h3 className="text-xl font-bold">לא ניתן להציג לוח Kanban עבור "כל התהליכים"</h3>
                                    <p>אנא בחר תהליך ספציפי (למשל: תהליך מכירה) מהפילטר למעלה כדי לראות את הלוח.</p>
                                </div>
                             ) : (
                                <div className="flex gap-6 h-full min-w-max">
                                    {activePipeline && activePipeline.stages.map(stage => {
                                        // Filter logic including Contact processes if needed
                                        const stageItems = filteredClients.filter(c => 
                                            c.pipelineStage === stage.id || 
                                            (!c.pipelineStage && stage.id === activePipeline.stages[0].id)
                                        );
                                        return (
                                            <div 
                                                key={stage.id} 
                                                className="w-80 flex flex-col h-full max-h-full bg-bg-subtle/50 rounded-2xl border border-border-default/60 shadow-sm"
                                                onDragOver={handleKanbanDragOver}
                                                onDrop={(e) => handleKanbanDrop(e, stage.id)}
                                            >
                                                <div className={`p-3 border-b border-border-default/50 flex justify-between items-center bg-white rounded-t-2xl border-t-4 ${stage.color}`}>
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <h3 className={`font-bold text-sm truncate ${stage.accent}`}>{stage.name}</h3>
                                                        <span className="bg-bg-subtle px-2 py-0.5 rounded-full text-xs font-bold text-text-muted border border-border-subtle flex-shrink-0">
                                                            {stageItems.length}
                                                        </span>
                                                    </div>
                                                    <button 
                                                        onClick={() => { setQuickAddStageId(stage.id); setIsQuickAddOpen(true); }}
                                                        className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-primary-600 transition"
                                                        title="הוסף לקוח לשלב זה"
                                                    >
                                                        <PlusIcon className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                                    {stageItems.map(client => (
                                                        <KanbanCard 
                                                            key={client.id} 
                                                            client={client} 
                                                            onClick={() => handleOpenClientDrawer(client)}
                                                            onDragStart={(e) => handleKanbanDragStart(e, client.id)}
                                                            isSelected={selectedCompanyIds.has(client.id)}
                                                            onToggleSelect={() => toggleCompanySelect(client.id)}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="p-3 border-t border-border-default bg-white rounded-b-2xl text-center">
                                                    <p className="text-[10px] text-text-muted font-medium">
                                                        שווי: ₪{stageItems.reduce((sum, c) => sum + (c.pipelineValue || 0), 0).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                             )}
                         </div>
                     )
                 ) : activeTab === 'contacts' ? (
                     // --- CONTACTS VIEW (API: all-contacts) ---
                     contactsLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
                            <UserGroupIcon className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm font-medium">טוען אנשי קשר מכל הלקוחות…</p>
                        </div>
                     ) : contactsError ? (
                        <div className="text-center py-16 text-red-600 text-sm px-4">{contactsError}</div>
                     ) : contactsViewMode === 'table' ? (
                        <div className="overflow-y-auto custom-scrollbar bg-bg-card">
                             <table className="w-full text-sm text-right border-collapse min-w-[900px]">
                                 <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-20 border-b border-border-default shadow-sm">
                                     <tr>
                                         <th className="p-4 w-12 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={sortedContacts.length > 0 && selectedContactIds.size === sortedContacts.length}
                                                onChange={handleSelectAllContacts}
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            />
                                         </th>
                                         {contactVisibleColumns.map((colId, index) => {
                                             const col = allContactColumns.find(c => c.id === colId);
                                             if (!col) return null;
                                             return (
                                                 <th 
                                                    key={col.id} 
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors select-none ${draggingColumn === col.id ? 'dragging' : ''}`}
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id, 'contacts')}
                                                    onDragEnter={() => handleDragEnter(index, 'contacts')}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onClick={() => requestContactSort(col.id as keyof Contact)}
                                                >
                                                     {col.label} {getContactSortIndicator(col.id as keyof Contact)}
                                                 </th>
                                             );
                                         })}
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-border-subtle">
                                     {sortedContacts.map(contact => (
                                         <tr 
                                            key={contact.id} 
                                            className={`hover:bg-bg-hover transition-colors group cursor-pointer ${selectedContactIds.has(contact.id) ? 'bg-primary-50/50' : ''}`}
                                            onClick={() => handleContactRowClick(contact)}
                                        >
                                             <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedContactIds.has(contact.id)}
                                                    onChange={() => handleContactSelect(contact.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                />
                                             </td>
                                             {contactVisibleColumns.map(colId => {
                                                if (colId === 'actions') {
                                                    return (
                                                        <td key={colId} className="p-4" onClick={(e) => e.stopPropagation()}>
                                                            <div className="relative inline-block" data-menu-trigger>
                                                                <button 
                                                                    onClick={(e) => {
                                                                         e.stopPropagation(); 
                                                                         setActiveActionMenuId(activeActionMenuId === contact.id ? null : contact.id);
                                                                    }}
                                                                    className="p-1 rounded-full hover:bg-bg-subtle text-text-muted"
                                                                >
                                                                    <EllipsisVerticalIcon className="w-5 h-5" />
                                                                </button>
                                                                {activeActionMenuId === contact.id && (
                                                                    <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-border-default rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setActiveActionMenuId(null); handleOpenContactDrawer(contact); }}
                                                                            className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                                                                        >
                                                                            <UserIcon className="w-4 h-4 text-text-subtle"/> צפה בפרופיל
                                                                        </button>
                                                                        {pipelines.map((p, idx) => (
                                                                            <button
                                                                                key={p.id}
                                                                                onClick={(e) => { e.stopPropagation(); setActiveActionMenuId(null); handleStartProcess(contact, p.id); }}
                                                                                className={`w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2 ${idx === 0 ? '' : 'border-t border-border-subtle'}`}
                                                                            >
                                                                                <PlusIcon className="w-4 h-4 text-primary-600"/> פתח {p.name}
                                                                            </button>
                                                                        ))}
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); handleDeleteContact(contact); }}
                                                                            className="w-full text-right px-4 py-2.5 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-border-subtle"
                                                                        >
                                                                            <TrashIcon className="w-4 h-4"/> מחק איש קשר
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                }
                                                if (colId === 'clientName') {
                                                    return (
                                                        <td key={colId} className="p-4 text-text-default">
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <span>{contact.clientName}</span>
                                                                <div className="w-6 h-6 rounded-md bg-bg-subtle border border-border-default flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0 overflow-hidden">
                                                                    {contact.clientLogo ? (
                                                                        <img src={contact.clientLogo} alt={contact.clientName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                    ) : (
                                                                        contact.clientName.substring(0, 2)
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    );
                                                }
                                                return (
                                                     <td key={colId} className="p-4 text-text-default">
                                                        {/* @ts-ignore */}
                                                        {contact[colId]}
                                                     </td>
                                                );
                                             })}
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                             {sortedContacts.length === 0 && (
                                <div className="text-center py-12 flex flex-col items-center justify-center text-text-muted border-t border-border-subtle">
                                    <UserGroupIcon className="w-12 h-12 mb-3 opacity-20" />
                                    <p>לא נמצאו אנשי קשר התואמים לסינון.</p>
                                </div>
                             )}
                        </div>
                     ) : contactsViewMode === 'grid' ? (
                         // CONTACTS GRID
                         <div className="overflow-y-auto custom-scrollbar p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {sortedContacts.length === 0 ? (
                                    <div className="col-span-full text-center py-12 text-text-muted">
                                        לא נמצאו אנשי קשר התואמים לסינון.
                                    </div>
                                ) : (
                                sortedContacts.map(contact => (
                                    <ContactGridCard 
                                        key={contact.id} 
                                        contact={contact} 
                                        isSelected={selectedContactIds.has(contact.id)}
                                        onSelect={() => handleContactSelect(contact.id)}
                                        onAction={(action) => handleSingleContactAction(action, contact)}
                                        onStartProcess={handleStartProcess}
                                        processOptions={pipelines}
                                        onViewProfile={handleOpenContactDrawer}
                                        onDelete={handleDeleteContact}
                                    />
                                ))
                                )}
                            </div>
                         </div>
                     ) : (
                         // CONTACTS KANBAN
                         <div className="overflow-x-auto overflow-y-hidden p-6 custom-scrollbar">
                             {filterContactPipeline === 'all' ? (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted py-16">
                                    <ChartBarIcon className="w-16 h-16 opacity-20 mb-4"/>
                                    <h3 className="text-xl font-bold">לא ניתן להציג לוח Kanban עבור "כל התהליכים"</h3>
                                    <p>אנא בחר תהליך ספציפי מהפילטר למעלה כדי לראות את הלוח.</p>
                                </div>
                             ) : (
                                <div className="flex gap-6 h-full min-w-max">
                                    {(pipelines.find((p) => p.id === filterContactPipeline)?.stages || []).map((stage, idx) => {
                                        const stageItems = sortedContacts.filter((c) =>
                                            c.stageId === stage.id
                                            || (!c.stageId && !c.pipelineId && idx === 0)
                                            || (!c.stageId && c.pipelineId === filterContactPipeline && idx === 0),
                                        );
                                        return (
                                            <div
                                                key={stage.id}
                                                className="w-80 flex flex-col h-full max-h-full bg-bg-subtle/50 rounded-2xl border border-border-default/60 shadow-sm"
                                                onDragOver={handleKanbanDragOver}
                                                onDrop={(e) => handleKanbanDrop(e, stage.id)}
                                            >
                                                <div className={`p-3 border-b border-border-default/50 flex justify-between items-center bg-white rounded-t-2xl border-t-4 ${stage.color}`}>
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <h3 className={`font-bold text-sm truncate ${stage.accent}`}>{stage.name}</h3>
                                                        <span className="bg-bg-subtle px-2 py-0.5 rounded-full text-xs font-bold text-text-muted border border-border-subtle flex-shrink-0">
                                                            {stageItems.length}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar max-h-[60vh]">
                                                    {stageItems.map((contact) => (
                                                        <div
                                                            key={contact.id}
                                                            draggable
                                                            onDragStart={(e) => handleContactKanbanDragStart(e, contact.id)}
                                                            onClick={() => handleOpenContactDrawer(contact)}
                                                            className={`bg-white border rounded-xl p-3 shadow-sm hover:border-primary-300 cursor-grab active:cursor-grabbing transition relative ${selectedContactIds.has(contact.id) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'}`}
                                                        >
                                                            <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                                    checked={selectedContactIds.has(contact.id)}
                                                                    onChange={() => handleContactSelect(contact.id)}
                                                                />
                                                            </div>
                                                            <div className="flex items-start gap-3">
                                                                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                                                                    {contact.avatar || contact.name.substring(0, 2)}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-bold text-sm text-text-default truncate">{contact.name}</p>
                                                                    <p className="text-xs text-text-muted mt-0.5 truncate">{contact.role || '—'}</p>
                                                                    <p className="text-xs text-text-subtle mt-1 truncate flex items-center gap-1">
                                                                        <BuildingOffice2Icon className="w-3 h-3"/>
                                                                        {contact.clientName}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {stageItems.length === 0 ? (
                                                        <p className="text-xs text-text-muted text-center py-6">אין פריטים</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                             )}
                         </div>
                     )
                 ) : (
                    // --- TASKS VIEW: admin → all clients; tenant → orgs under tenant client ---
                    isPlatformAdmin ? (
                        <ClientTasksTab
                            clientPickerOptions={clients.map((c) => ({ id: c.id, name: c.name }))}
                        />
                    ) : tenantClientId ? (
                        <ClientTasksTab
                            clientId={tenantClientId}
                            organizationPickerOptions={linkedOrganizations
                                .filter((o) => o.organizationId)
                                .map((o) => ({ id: o.organizationId!, name: o.name }))}
                        />
                    ) : null
                 )}
             </div>

             {/* Bulk Actions Bar (Companies / linked orgs) */}
             {activeTab === 'companies' && selectedCompanyIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-bg-card rounded-full shadow-2xl border border-border-default px-6 py-3 flex items-center gap-6 animate-slide-up">
                    <span className="font-bold text-primary-600 text-sm">{selectedCompanyIds.size} נבחרו</span>
                    <div className="h-6 w-px bg-border-default"></div>

                    <div className="relative">
                        <button
                            onClick={() => setIsBulkProcessMenuOpen(!isBulkProcessMenuOpen)}
                            className="font-semibold hover:text-purple-600 transition-colors flex items-center gap-2 text-sm"
                        >
                            <PlayIcon className="w-4 h-4"/> פתח תהליך
                        </button>
                        {isBulkProcessMenuOpen && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white border border-border-default rounded-lg shadow-xl overflow-hidden">
                                {pipelines.length === 0 ? (
                                    <div className="px-4 py-2 text-xs text-text-muted">אין תהליכים מוגדרים</div>
                                ) : (
                                    pipelines.map((p, idx) => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleCompanyBulkStartProcess(p.id)}
                                            className={`w-full text-right px-4 py-2 text-sm hover:bg-bg-hover ${idx === 0 ? '' : 'border-t border-border-subtle'}`}
                                        >
                                            {p.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <button onClick={handleCompanyBulkExport} className="font-semibold hover:text-gray-600 transition-colors flex items-center gap-2 text-sm">
                        <DocumentArrowDownIcon className="w-4 h-4"/> ייצוא לאקסל
                    </button>

                    <div className="h-6 w-px bg-border-default"></div>

                    <button onClick={() => handleCompanyBulkAction('whatsapp')} className="font-semibold hover:text-green-600 transition-colors flex items-center gap-2 text-sm">
                        <WhatsappIcon className="w-4 h-4"/> WhatsApp
                    </button>
                    <button onClick={() => handleCompanyBulkAction('email')} className="font-semibold hover:text-primary-600 transition-colors flex items-center gap-2 text-sm">
                        <EnvelopeIcon className="w-4 h-4"/> Email
                    </button>
                    <button onClick={() => handleCompanyBulkAction('sms')} className="font-semibold hover:text-blue-600 transition-colors flex items-center gap-2 text-sm">
                        <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> SMS
                    </button>
                    <div className="h-6 w-px bg-border-default"></div>
                    <button onClick={() => setSelectedCompanyIds(new Set())} className="p-1 bg-bg-subtle rounded-full hover:bg-bg-hover text-text-muted" title="נקה בחירה">
                        <XMarkIcon className="w-4 h-4"/>
                    </button>
                </div>
            )}

             {/* Bulk Actions Bar (Contacts) */}
             {activeTab === 'contacts' && selectedContactIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-bg-card rounded-full shadow-2xl border border-border-default px-6 py-3 flex items-center gap-6 animate-slide-up">
                    <span className="font-bold text-primary-600 text-sm">{selectedContactIds.size} נבחרו</span>
                    <div className="h-6 w-px bg-border-default"></div>
                    
                    {/* START PROCESS BUTTON */}
                    <div className="relative">
                        <button 
                            onClick={() => setIsBulkProcessMenuOpen(!isBulkProcessMenuOpen)}
                            className="font-semibold hover:text-purple-600 transition-colors flex items-center gap-2 text-sm"
                        >
                            <PlayIcon className="w-4 h-4"/> פתח תהליך
                        </button>
                        {isBulkProcessMenuOpen && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white border border-border-default rounded-lg shadow-xl overflow-hidden">
                                {pipelines.length === 0 ? (
                                    <div className="px-4 py-2 text-xs text-text-muted">אין תהליכים מוגדרים</div>
                                ) : (
                                    pipelines.map((p, idx) => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleBulkStartProcess(p.id)}
                                            className={`w-full text-right px-4 py-2 text-sm hover:bg-bg-hover ${idx === 0 ? '' : 'border-t border-border-subtle'}`}
                                        >
                                            {p.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <button onClick={handleBulkExport} className="font-semibold hover:text-gray-600 transition-colors flex items-center gap-2 text-sm">
                        <DocumentArrowDownIcon className="w-4 h-4"/> ייצוא לאקסל
                    </button>

                    <div className="h-6 w-px bg-border-default"></div>

                    <button onClick={() => handleBulkAction('whatsapp')} className="font-semibold hover:text-green-600 transition-colors flex items-center gap-2 text-sm">
                        <WhatsappIcon className="w-4 h-4"/> WhatsApp
                    </button>
                    <button onClick={() => handleBulkAction('email')} className="font-semibold hover:text-primary-600 transition-colors flex items-center gap-2 text-sm">
                        <EnvelopeIcon className="w-4 h-4"/> Email
                    </button>
                     <button onClick={() => handleBulkAction('sms')} className="font-semibold hover:text-blue-600 transition-colors flex items-center gap-2 text-sm">
                        <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> SMS
                    </button>
                    <div className="h-6 w-px bg-border-default"></div>
                    <button onClick={() => setSelectedContactIds(new Set())} className="p-1 bg-bg-subtle rounded-full hover:bg-bg-hover text-text-muted" title="נקה בחירה">
                        <XMarkIcon className="w-4 h-4"/>
                    </button>
                </div>
            )}

             <StageUpdateModal 
                isOpen={isStageModalOpen}
                onClose={() => setIsStageModalOpen(false)}
                client={selectedClient}
                onSave={handleSaveStage}
                onNavigateToProfile={handleNavigateToProfile}
                pipelines={pipelines}
                activePipelineId={getModalPipelineId()}
            />

            <QuickAddClientModal 
                isOpen={isQuickAddOpen}
                onClose={() => setIsQuickAddOpen(false)}
                pipelineId={activePipelineId === 'all' ? (pipelines[0]?.id || '') : activePipelineId}
                stageId={quickAddStageId}
                onSave={handleQuickAdd}
            />
            
            <ContactDrawer 
                isOpen={isContactDrawerOpen}
                onClose={() => setIsContactDrawerOpen(false)}
                contact={selectedContactForDrawer}
                processOptions={pipelines.map((p) => ({ id: p.id, name: p.name }))}
                onStartProcess={(pipelineId) => {
                    if (selectedContactForDrawer) handleStartProcess(selectedContactForDrawer, pipelineId);
                }}
                openMessageModal={openMessageModal}
            />
            <ClientDetailsDrawer 
                client={selectedClientForDrawer}
                isOpen={isClientDrawerOpen}
                onClose={() => setIsClientDrawerOpen(false)}
            />

            {contactToDelete ? (
                <div
                    className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4"
                    onClick={() => !contactDeleteLoading && setContactToDelete(null)}
                >
                    <div className="bg-bg-card rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2">מחיקת איש קשר</h3>
                        <p className="text-text-muted mb-4">
                            האם למחוק את {contactToDelete.name}? לא ניתן לשחזר פעולה זו.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                disabled={contactDeleteLoading}
                                onClick={() => setContactToDelete(null)}
                                className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover disabled:opacity-50"
                            >
                                ביטול
                            </button>
                            <button
                                type="button"
                                disabled={contactDeleteLoading}
                                onClick={() => void confirmDeleteContact()}
                                className="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50"
                            >
                                {contactDeleteLoading ? 'מוחק…' : 'מחק'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ── Company detail drawer (tenant users) ───────────────────── */}
            {orgDrawer ? (
                <div className="fixed inset-0 z-50 flex justify-end" dir="rtl">
                    {/* backdrop */}
                    <div className="absolute inset-0 bg-black/40" onClick={() => setOrgDrawer(null)} />
                    <div className="relative w-full max-w-lg h-full bg-bg-card shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
                        {/* Header */}
                        <div className="flex items-center gap-4 px-6 py-5 border-b border-border-default shrink-0">
                            {orgDrawer.org.logo ? (
                                <img src={orgDrawer.org.logo} alt="" className="w-12 h-12 rounded-xl object-contain border border-border-default bg-bg-subtle p-1 shrink-0" />
                            ) : (
                                <div className="w-12 h-12 rounded-xl bg-bg-subtle border border-border-default flex items-center justify-center shrink-0">
                                    <BuildingOffice2Icon className="w-6 h-6 text-text-muted" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h2 className="text-lg font-bold text-text-default truncate">{orgDrawer.org.name}</h2>
                                <p className="text-sm text-text-muted truncate">{orgDrawer.org.mainField || '—'}</p>
                            </div>
                            <button onClick={() => setOrgDrawer(null)} className="p-2 rounded-lg hover:bg-bg-hover text-text-muted">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                            {orgDrawerLoading && (
                                <div className="text-center text-sm text-text-muted py-4">טוען פרטים...</div>
                            )}

                            {/* Status badges */}
                            <div className="flex flex-wrap gap-2">
                                {orgDrawer.org.isPrimary && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">ראשית</span>}
                                {orgDrawer.org.isPending && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">ממתין לאישור</span>}
                                {(() => {
                                    const status = String((orgDrawer.full?.activityStatus as string) || orgDrawer.org.statusLabel || '');
                                    if (!status) return null;
                                    const color = status === 'פעילה' ? 'bg-green-50 text-green-700 border-green-100' : status === 'לא פעילה' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-600 border-gray-200';
                                    return <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${color}`}>{status}</span>;
                                })()}
                            </div>

                            {/* Key details */}
                            {[
                                { label: 'תחום', value: orgDrawer.org.mainField },
                                { label: 'תת-תחום', value: orgDrawer.org.subFields?.join(', ') },
                                { label: 'מיקום', value: orgDrawer.full?.location as string || orgDrawer.org.location },
                                { label: 'מספר עובדים', value: orgDrawer.full?.employeeCount as string || orgDrawer.org.employeeCount },
                                { label: 'אתר', value: orgDrawer.full?.website as string || orgDrawer.org.website, isLink: true },
                                { label: 'לינקדאין', value: orgDrawer.full?.linkedinUrl as string, isLink: true },
                                { label: 'טלפון', value: orgDrawer.full?.phone as string },
                                { label: 'דוא״ל', value: orgDrawer.full?.email as string },
                                { label: 'כתובת', value: orgDrawer.full?.address as string },
                                { label: 'שנת ייסוד', value: orgDrawer.full?.foundedYear as string },
                                { label: 'סיווג', value: orgDrawer.full?.classification as string },
                            ].map(({ label, value, isLink }) => value ? (
                                <div key={label} className="flex gap-3 items-start text-sm">
                                    <span className="text-text-muted w-28 shrink-0">{label}</span>
                                    {isLink ? (
                                        <a href={String(value).startsWith('http') ? String(value) : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">
                                            {String(value).replace(/^https?:\/\//, '')}
                                        </a>
                                    ) : (
                                        <span className="text-text-default font-medium">{String(value)}</span>
                                    )}
                                </div>
                            ) : null)}

                            {/* Description */}
                            {(orgDrawer.full?.description as string) && (
                                <div>
                                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">תיאור</p>
                                    <p className="text-sm text-text-default leading-relaxed">{orgDrawer.full?.description as string}</p>
                                </div>
                            )}

                            {/* Tags */}
                            {Array.isArray(orgDrawer.full?.tags) && (orgDrawer.full?.tags as string[]).length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">תגיות</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(orgDrawer.full?.tags as string[]).map((tag) => (
                                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-bg-subtle border border-border-default text-text-muted">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Publishing links */}
                            <div className="pt-4 border-t border-border-subtle">
                                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">דפי נחיתה ופרסום</p>
                                {orgDrawerLinksLoading ? (
                                    <p className="text-sm text-text-muted">טוען דפי נחיתה...</p>
                                ) : orgDrawerLinks.length === 0 ? (
                                    <p className="text-sm text-text-muted italic">אין דפי נחיתה פעילים לחברה זו</p>
                                ) : (
                                    <div className="space-y-3">
                                        {orgDrawerLinks.map((job) => (
                                            <div key={job.jobId} className="bg-bg-subtle rounded-xl p-3 border border-border-default">
                                                {/* Job header */}
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <p className="font-semibold text-sm text-text-default truncate flex-1">{job.jobTitle}</p>
                                                    <button
                                                        onClick={() => { setOrgDrawer(null); navigate(`/jobs/edit/${job.jobId}`); }}
                                                        className="shrink-0 flex items-center gap-1 text-xs font-bold text-text-muted hover:text-primary-600 bg-bg-card hover:bg-primary-50 border border-border-default px-2.5 py-1 rounded-lg transition"
                                                        title="ערוך דף נחיתה"
                                                    >
                                                        <PencilIcon className="w-3.5 h-3.5"/>
                                                        ערוך
                                                    </button>
                                                </div>
                                                {/* Aggregate stats */}
                                                <div className="flex gap-4 text-xs text-text-muted mb-2">
                                                    <span>{job.totalVisits.toLocaleString()} צפיות</span>
                                                    <span>{job.totalSubmissions.toLocaleString()} הגשות</span>
                                                    {job.totalVisits > 0 && job.totalSubmissions > 0 && (
                                                        <span>{Math.round((job.totalSubmissions / job.totalVisits) * 1000) / 10}% המרה</span>
                                                    )}
                                                </div>
                                                {/* Per-source rows */}
                                                {job.sources.length > 0 && (
                                                    <div className="border-t border-border-subtle pt-2 space-y-1.5">
                                                        {job.sources.map((s) => (
                                                            <div key={s.source} className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="text-xs font-semibold text-text-muted bg-bg-card border border-border-default rounded px-1.5 py-0.5 shrink-0">{s.source}</span>
                                                                    <span className="text-xs text-text-subtle">{s.visits} צפיות · {s.submissions} הגשות</span>
                                                                </div>
                                                                <a
                                                                    href={s.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-0.5 rounded-lg transition"
                                                                >
                                                                    <LinkIcon className="w-3 h-3"/>
                                                                    פתח
                                                                </a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ClientsListView;
