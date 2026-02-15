
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    PlusIcon, MagnifyingGlassIcon, BuildingOffice2Icon, PencilIcon, TrashIcon, 
    Cog6ToothIcon, ChevronDownIcon, TableCellsIcon, Squares2X2Icon, 
    XMarkIcon, UserGroupIcon, PhoneIcon, EnvelopeIcon, ChartBarIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, BriefcaseIcon, ArrowRightIcon,
    FunnelIcon, ClockIcon, MapPinIcon, ChatBubbleBottomCenterTextIcon, WhatsappIcon, UserIcon,
    EllipsisVerticalIcon, DocumentArrowDownIcon, PlayIcon, CalendarDaysIcon, ClipboardDocumentCheckIcon
} from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';
import ActivityLogModal from './ActivityLogModal';
import LocationSelector, { LocationItem } from './LocationSelector';
import CompanyFilterPopover from './CompanyFilterPopover';
import ContactDrawer from './ContactDrawer';
import SearchableSelect from './SearchableSelect'; 
import ClientTasksTab from './ClientTasksTab'; 

// --- TYPES ---
type ClientStatus = 'פעיל' | 'לא פעיל' | 'בהקפאה' | 'ליד חדש';
type ClientTier = 'VIP' | 'Gold' | 'Silver' | 'Standard';

export interface Client {
  id: number;
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
}

export interface Contact {
    id: number;
    name: string;
    role: string;
    clientName: string;
    phone: string;
    email: string;
    lastContact: string;
    avatar?: string;
    pipelineId?: string;
    stageId?: string;
    createdAt?: string;
}

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

const pipelines: Pipeline[] = [
    {
        id: 'sales',
        name: 'תהליך מכירה (Sales)',
        stages: [
            { id: 'lead', name: 'ליד חדש', color: 'border-blue-500', bg: 'bg-blue-50', accent: 'text-blue-700' },
            { id: 'meeting', name: 'פגישה', color: 'border-purple-500', bg: 'bg-purple-50', accent: 'text-purple-700' },
            { id: 'proposal', name: 'הצעת מחיר', color: 'border-yellow-500', bg: 'bg-yellow-50', accent: 'text-yellow-700' },
            { id: 'negotiation', name: 'משא ומתן', color: 'border-orange-500', bg: 'bg-orange-50', accent: 'text-orange-700' },
            { id: 'won', name: 'סגירה (זכייה)', color: 'border-green-500', bg: 'bg-green-50', accent: 'text-green-700' },
        ]
    },
    {
        id: 'retention',
        name: 'שימור לקוחות (Retention)',
        stages: [
            { id: 'onboarding', name: 'קליטה (Onboarding)', color: 'border-indigo-500', bg: 'bg-indigo-50', accent: 'text-indigo-700' },
            { id: 'active', name: 'לקוח פעיל', color: 'border-green-500', bg: 'bg-green-50', accent: 'text-green-700' },
            { id: 'risk', name: 'בסיכון (At Risk)', color: 'border-red-500', bg: 'bg-red-50', accent: 'text-red-700' },
            { id: 'renewal', name: 'חידוש חוזה', color: 'border-cyan-500', bg: 'bg-cyan-50', accent: 'text-cyan-700' },
        ]
    }
];

// --- RICH MOCK DATA ---
export const clientsData: Client[] = [
  { 
      id: 1, name: 'גטר גרופ', contactPerson: 'ישראל ישראלי', phone: '050-1112222', email: 'israel@getter.co.il', 
      openJobs: 3, status: 'פעיל', accountManager: 'ישראל ישראלי', city: 'פתח תקווה', region: 'מרכז', industry: 'מסחר וקמעונאות', tier: 'VIP', 
      pipelineStage: 'negotiation', pipelineValue: 45000, 
      lastContactDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
      daysSinceLastContact: 2,
      nextScheduledActivity: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(), // in 3 days
      activePlacements: 5
  },
  { 
      id: 2, name: 'נעמן גרופ', contactPerson: 'דנה כהן', phone: '052-3334444', email: 'dana@naaman.co.il', 
      openJobs: 8, status: 'פעיל', accountManager: 'אביב לוי', city: 'ראש העין', region: 'מרכז', industry: 'מסחר וקמעונאות', tier: 'Gold', 
      pipelineStage: 'proposal', pipelineValue: 120000, 
      lastContactDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // 5 days ago
      daysSinceLastContact: 5,
      nextScheduledActivity: null, // Risk factor: No future activity
      activePlacements: 2
  },
  { 
      id: 3, name: 'שטראוס מים', contactPerson: 'אביב לוי', phone: '053-5556666', email: 'aviv@strauss.com', 
      openJobs: 1, status: 'בהקפאה', accountManager: 'ישראל ישראלי', city: 'פתח תקווה', region: 'מרכז', industry: 'תעשייה וייצור', tier: 'Silver', 
      pipelineStage: 'risk', pipelineValue: 15000, 
      lastContactDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(), // 45 days ago
      daysSinceLastContact: 45,
      nextScheduledActivity: null,
      activePlacements: 0
  },
  { 
      id: 4, name: 'FedEx', contactPerson: 'יעל שחר', phone: '054-7778888', email: 'yael@fedex.co.il', 
      openJobs: 0, status: 'לא פעיל', accountManager: 'שרית בן חיים', city: 'נתב"ג', region: 'מרכז', industry: 'תחבורה ולוגיסטיקה', tier: 'Standard', 
      pipelineStage: 'lead', pipelineValue: 0, 
      lastContactDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString(), 
      daysSinceLastContact: 120,
      nextScheduledActivity: null,
      activePlacements: 0
  },
  { 
      id: 5, name: 'צ\'יטה שליחויות', contactPerson: 'משה משה', phone: '058-9990000', email: 'moshe@chita.co.il', 
      openJobs: 2, status: 'פעיל', accountManager: 'אביב לוי', city: 'חיפה', region: 'צפון', industry: 'תחבורה ולוגיסטיקה', tier: 'Gold', 
      pipelineStage: 'won', pipelineValue: 80000, 
      lastContactDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(), // 14 days ago
      daysSinceLastContact: 14,
      nextScheduledActivity: new Date(Date.now() + 1000 * 60 * 60 * 24 * 1).toISOString(), // Tomorrow
      activePlacements: 8
  },
];

const contactsData: Contact[] = [
    { id: 1, name: 'ישראל ישראלי', role: 'סמנכ"ל משאבי אנוש', clientName: 'גטר גרופ', phone: '050-1112222', email: 'israel@getter.co.il', lastContact: 'לפני יומיים', avatar: 'יי', pipelineId: 'sales', stageId: 'negotiation' },
    { id: 2, name: 'דנה כהן', role: 'מנהלת גיוס', clientName: 'נעמן גרופ', phone: '052-3334444', email: 'dana@naaman.co.il', lastContact: 'אתמול', avatar: 'דכ', pipelineId: 'sales', stageId: 'proposal' },
    { id: 3, name: 'אביב לוי', role: 'מנהל תפעול', clientName: 'שטראוס מים', phone: '053-5556666', email: 'aviv@strauss.com', lastContact: 'לפני שבוע', avatar: 'אל', pipelineId: 'retention', stageId: 'active' },
    { id: 4, name: 'יעל שחר', role: 'רכזת גיוס', clientName: 'FedEx', phone: '054-7778888', email: 'yael@fedex.co.il', lastContact: 'לפני חודש', avatar: 'יש' },
    { id: 5, name: 'משה משה', role: 'מנכ"ל', clientName: 'צ\'יטה שליחויות', phone: '058-9990000', email: 'moshe@chita.co.il', lastContact: 'היום', avatar: 'ממ', pipelineId: 'sales', stageId: 'won' },
];

const statusStyles: { [key in ClientStatus]: { text: string; bg: string; border: string; } } = {
  'פעיל': { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  'בהקפאה': { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  'לא פעיל': { text: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
  'ליד חדש': { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
};

// --- Column Definitions ---
const allClientColumns = [
    { id: 'health', label: 'דופק' },
    { id: 'name', label: 'לקוח' },
    { id: 'lastContact', label: 'קשר אחרון' }, // NEW
    { id: 'nextActivity', label: 'פעילות הבאה' }, // NEW
    { id: 'openJobs', label: 'משרות' },
    { id: 'status', label: 'סטטוס' },
    { id: 'pipelineStage', label: 'שלב מכירה' },
    { id: 'contactPerson', label: 'איש קשר' },
    { id: 'actions', label: 'פעולות' }
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

// --- LOGIC: CLIENT HEALTH (UPDATED) ---
// This mimics the "Rules" we will set in the settings
const getClientHealthData = (client: Client) => {
    // Rule 1: Churned / Inactive
    if (client.status === 'לא פעיל') {
        return { color: 'bg-gray-300', message: 'לקוח לא פעיל / ארכיון', pulse: false };
    }

    // Rule 2: Critical Risk (Red)
    // Condition: Active client but no contact > 30 days OR Pipeline Risk
    if (client.daysSinceLastContact > 30) {
         return { color: 'bg-red-500', message: `קריטי: נתק של ${client.daysSinceLastContact} ימים!`, pulse: true };
    }
    if (client.pipelineStage === 'risk') {
        return { color: 'bg-red-500', message: 'קריטי: הלקוח סומן בסיכון נטישה', pulse: true };
    }

    // Rule 3: Warning (Orange)
    // Condition: Open jobs but no future activity scheduled OR No contact > 14 days
    if (client.openJobs > 0 && !client.nextScheduledActivity) {
         return { color: 'bg-orange-500', message: 'אזהרה: יש משרות פתוחות אך אין פעילות עתידית מתוכננת', pulse: false };
    }
    if (client.daysSinceLastContact > 14) {
        return { color: 'bg-orange-500', message: `אזהרה: שבועיים ללא קשר`, pulse: false };
    }

    // Rule 4: Attention (Yellow)
    // Condition: No contact > 7 days
    if (client.daysSinceLastContact > 7) {
        return { color: 'bg-yellow-400', message: 'תשומת לב: שבוע ללא קשר', pulse: false };
    }

    // Rule 5: Healthy (Green)
    return { color: 'bg-emerald-500', message: 'תקין: פעילות שוטפת', pulse: false };
};

// --- COMPONENTS ---

const HealthTooltip: React.FC<{ message: string }> = ({ message }) => (
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-[200px] bg-gray-900 text-white text-xs rounded-lg py-1.5 px-3 shadow-xl z-50 text-center transition-opacity opacity-0 group-hover/health:opacity-100 pointer-events-none">
        {message}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
);

const ClientHealthIndicator: React.FC<{ client: Client }> = ({ client }) => {
    const { color, message, pulse } = getClientHealthData(client);
    
    return (
        <div className="group/health relative inline-flex items-center justify-center cursor-help mx-auto w-8 h-8">
            <div className="absolute inset-0 flex items-center justify-center w-full h-full">
                 <div className={`w-3 h-3 rounded-full ${color} ${pulse ? 'animate-pulse ring-2 ring-offset-1 ring-red-200' : ''} shadow-sm`}></div>
            </div>
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
    onSave: (clientId: number, newStage: string, notes: string) => void; 
    onNavigateToProfile: (id: number) => void;
    pipelines: Pipeline[];
    activePipelineId: string;
}> = ({ isOpen, onClose, client, onSave, onNavigateToProfile, pipelines, activePipelineId }) => {
    const [notes, setNotes] = useState('');
    const [stage, setStage] = useState('');
    const activePipeline = pipelines.find(p => p.id === activePipelineId) || pipelines[0];

    useEffect(() => {
        if (client) {
            setNotes(client.notes || '');
            setStage(client.pipelineStage || activePipeline.stages[0].id);
        }
    }, [client, activePipeline]);

    if (!isOpen || !client) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border-default overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border-default flex justify-between items-start bg-bg-subtle/30">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
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
                        <label className="block text-sm font-bold text-text-default mb-2">עדכון שלב ({activePipeline.name})</label>
                        <select 
                            value={stage} 
                            onChange={(e) => setStage(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            {activePipeline.stages.map(s => (
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

const KanbanCard: React.FC<{ client: Client; onClick: () => void; onDragStart: (e: React.DragEvent) => void }> = ({ client, onClick, onDragStart }) => (
    <div 
        draggable
        onDragStart={onDragStart}
        onClick={onClick}
        className={`bg-white p-4 rounded-xl border border-border-default shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group mb-3 relative overflow-hidden ${client.isContactProcess ? 'border-primary-200 bg-primary-50/20' : ''}`}
    >
        <div className={`absolute top-0 right-0 w-1.5 h-full ${client.status === 'פעיל' ? 'bg-green-500' : client.status === 'בהקפאה' ? 'bg-amber-500' : 'bg-gray-300'}`}></div>
        <div className="pr-3">
            <div className="flex justify-between items-start mb-2">
                 <h4 className="font-bold text-text-default text-sm truncate">{client.name}</h4>
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
    onStartProcess: (contact: Contact, type: 'sales' | 'retention') => void;
    onViewProfile: (contact: Contact) => void;
}> = ({ contact, isSelected, onSelect, onAction, onStartProcess, onViewProfile }) => {
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
                        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-border-default rounded-lg shadow-xl z-20 overflow-hidden animate-fade-in">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onViewProfile(contact); }}
                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                            >
                                <UserIcon className="w-4 h-4 text-text-subtle"/> צפה בפרופיל
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onStartProcess(contact, 'sales'); }}
                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4 text-primary-600"/> פתח תהליך מכירה
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); onStartProcess(contact, 'retention'); }}
                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2 border-t border-border-subtle"
                            >
                                <PlusIcon className="w-4 h-4 text-purple-600"/> פתח תהליך שימור
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
                <p className="text-text-muted text-xs mt-1">{contact.clientName}</p>
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
}> = ({ client, onClick, stageName, activePipelineColor }) => (
    <div onClick={onClick} className="bg-bg-card border border-border-default rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden">
        {/* Risk Indicator Strip */}
        {client.daysSinceLastContact > 14 && (
             <div className="absolute top-0 right-0 left-0 h-1 bg-red-500"></div>
        )}

        <div className="flex justify-between items-start mb-3 pt-2">
             <div>
                <h4 className="font-bold text-text-default text-lg group-hover:text-primary-700 transition-colors">{client.name}</h4>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyles[client.status]?.bg || 'bg-gray-100'} ${statusStyles[client.status]?.text || 'text-gray-700'} ${statusStyles[client.status]?.border || 'border-gray-200'}`}>
                    {client.status}
                </span>
             </div>
             <div className="flex flex-col items-end gap-1">
                 <div className="bg-bg-subtle p-2 rounded-lg">
                    <BuildingOffice2Icon className="w-5 h-5 text-text-muted"/>
                 </div>
                 <ClientHealthIndicator client={client} />
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
                <span className="text-text-subtle">שלב: <span className="font-medium text-text-default">{stageName}</span></span>
                <span className="font-bold text-text-default">₪{(client.pipelineValue / 1000).toFixed(0)}k</span>
             </div>
             <div className={`h-1 w-full mt-2 rounded-full bg-gray-100 overflow-hidden`}>
                <div className={`h-full ${activePipelineColor.replace('border-', 'bg-')}`} style={{width: '100%'}}></div> 
             </div>
        </div>
    </div>
);

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
    const navigate = useNavigate();
    
    // --- Tabs State ---
    const [activeTab, setActiveTab] = useState<'companies' | 'contacts' | 'tasks'>('companies');

    // --- Clients Data & State ---
    const [clients, setClients] = useState<Client[]>(clientsData);
    const [viewMode, setViewMode] = useState<'table' | 'grid' | 'board'>('table');
    const [activePipelineId, setActivePipelineId] = useState<string>('all'); // Changed default to 'all'
    const [activeStageId, setActiveStageId] = useState<string>('all'); // New State for Stage Filter
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isStageModalOpen, setIsStageModalOpen] = useState(false);

    // --- Contacts Data & State ---
    const [contacts, setContacts] = useState<Contact[]>(contactsData);
    const [contactsViewMode, setContactsViewMode] = useState<'table' | 'grid'>('table');
    const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());
    const [contactVisibleColumns, setContactVisibleColumns] = useState<string[]>(['name', 'role', 'clientName', 'phone', 'email', 'lastContact', 'actions']);
    const [isColumnPopoverOpen, setIsColumnPopoverOpen] = useState(false);
    const [contactSortConfig, setContactSortConfig] = useState<{ key: keyof Contact; direction: 'asc' | 'desc' } | null>(null);
    
    // New Contact Drawer State
    const [selectedContactForDrawer, setSelectedContactForDrawer] = useState<Contact | null>(null);
    const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false);
    const [activeActionMenuId, setActiveActionMenuId] = useState<number | null>(null);


    // --- Clients Table State ---
    // Added 'health', 'lastContact', 'nextActivity'
    const [clientVisibleColumns, setClientVisibleColumns] = useState<string[]>(['health', 'name', 'status', 'pipelineStage', 'lastContact', 'nextActivity', 'contactPerson', 'phone', 'openJobs', 'actions']);
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
        const totalOpenJobs = clients.reduce((acc, c) => acc + (c.status === 'פעיל' ? c.openJobs : 0), 0);
        const activeClients = clients.filter(c => c.status === 'פעיל').length;
        const totalValue = clients.reduce((acc, c) => acc + (c.pipelineValue || 0), 0);
        const winRate = 18; // Mock

        return { totalOpenJobs, activeClients, totalValue, winRate };
    }, [clients]);

    // --- Filter Logic ---
    const activePipeline = pipelines.find(p => p.id === activePipelineId); // Can be undefined if 'all'
    
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
    }, [filterContactPipeline]);


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
            
            const matchesPipeline = filterContactPipeline === 'all' || c.pipelineId === filterContactPipeline;
            const matchesStage = filterContactStage === 'all' || c.stageId === filterContactStage;
            
            // Date Filter (Using lastContact as proxy for createdAt for this demo, or createdAt if exists)
            // Assuming simplified date string 'YYYY-MM-DD' or comparable
            // For mock demo, we'll skip complex date parsing if data is missing, but structure is here.
            let matchesDate = true;
            if (filterContactDateFrom || filterContactDateTo) {
                 // Logic would go here. For now, pass all to avoid breaking mock demo.
                 matchesDate = true; 
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
    const handleKanbanDragStart = (e: React.DragEvent, clientId: number) => {
        e.dataTransfer.setData('clientId', clientId.toString());
    };

    const handleKanbanDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleKanbanDrop = (e: React.DragEvent, stageId: string) => {
        const clientId = Number(e.dataTransfer.getData('clientId'));
        if (clientId) {
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: stageId } : c));
        }
    };

    // --- Actions (Clients) ---
    const handleCardClick = (client: Client) => {
        // If "All Pipelines" is selected, we need to know WHICH pipeline to show in modal.
        // We'll try to infer it from the client's current stage, or default to first pipeline.
        let inferredPipelineId = activePipelineId;
        if (activePipelineId === 'all') {
             const foundPipeline = pipelines.find(p => p.stages.some(s => s.id === client.pipelineStage));
             inferredPipelineId = foundPipeline ? foundPipeline.id : pipelines[0].id;
        }

        setSelectedClient(client);
        // We pass the potentially inferred pipeline ID to the modal so it shows correct stages
        // But we don't change the main view state.
        // Note: StageUpdateModal props updated below to accept specific pipeline ID for display
        setIsStageModalOpen(true);
    };

    const handleSaveStage = (clientId: number, newStage: string, notes: string) => {
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, pipelineStage: newStage, notes } : c));
    };

    const handleNavigateToProfile = (id: number) => {
        navigate(`/clients/${id}`);
    };
    
    const handleQuickAdd = (clientData: Partial<Client>) => {
        const targetPipeline = activePipelineId === 'all' ? pipelines[0] : activePipeline!; // Fallback
        const defaultStage = targetPipeline.stages[0].id;

        const newClient: Client = {
            id: Date.now(),
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

    const handleContactSelect = (id: number) => {
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

    const handleBulkAction = (action: 'email' | 'sms' | 'whatsapp') => {
        // Mock bulk action
        alert(`שולח ${action} ל-${selectedContactIds.size} אנשי קשר...`);
        setSelectedContactIds(new Set());
    };
    
    const handleBulkStartProcess = (type: 'sales' | 'retention') => {
        const count = selectedContactIds.size;
        if (count === 0) return;
        
        // Mock Logic
        const processName = type === 'sales' ? 'תהליך מכירה' : 'תהליך שימור';
        alert(`פותח ${processName} עבור ${count} אנשי קשר שנבחרו.\nהם יתווספו ללוח הקאן-בן בסטטוס ההתחלתי.`);
        
        // In real app: Update backend, then local state (add to clients list as ContactProcess items)
        setSelectedContactIds(new Set());
        setIsBulkProcessMenuOpen(false);
    };

    const handleBulkExport = () => {
        const count = selectedContactIds.size;
        if (count === 0) return;
        alert(`מייצא ${count} אנשי קשר לקובץ Excel...`);
        // Mock download logic here
        setSelectedContactIds(new Set());
    };
    
    const handleSingleContactAction = (action: 'email' | 'sms' | 'whatsapp', contact: Contact) => {
         openMessageModal({
            mode: action,
            candidateName: contact.name, // Reusing candidate modal for contacts for simplicity
            candidatePhone: contact.phone
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
    
    // --- New Contact Actions ---
    const handleOpenContactDrawer = (contact: Contact) => {
        setSelectedContactForDrawer(contact);
        setIsContactDrawerOpen(true);
        setActiveActionMenuId(null);
    };

    const handleStartProcess = (contact: Contact, type: 'sales' | 'retention') => {
        // 1. Create a "Client" like entity for the Kanban board representing this contact interaction
        const newProcessItem: Client = {
            id: Date.now(),
            name: `${contact.name} (${contact.clientName})`, // Combine name
            contactPerson: contact.name,
            phone: contact.phone,
            email: contact.email,
            openJobs: 0,
            status: 'ליד חדש',
            accountManager: 'אני',
            city: 'לא ידוע', // Could inherit from client
            region: 'מרכז',
            industry: 'כללי',
            tier: 'Standard',
            pipelineStage: pipelines.find(p => p.id === type)?.stages[0].id || 'lead', // Default stage
            pipelineValue: 0,
            lastContactDate: new Date().toISOString(),
            daysSinceLastContact: 0,
            nextScheduledActivity: null,
            activePlacements: 0,
            isContactProcess: true
        };

        // 2. Add to clients list (which feeds Kanban)
        setClients(prev => [...prev, newProcessItem]);
        
        // 3. Switch to Kanban view and relevant pipeline
        setActiveTab('companies');
        setActivePipelineId(type);
        setViewMode('board');
        setIsContactDrawerOpen(false);
        setActiveActionMenuId(null);
        
        alert(`תהליך ${type === 'sales' ? 'מכירה' : 'שימור'} נפתח עבור ${contact.name}!`);
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
                return <ClientHealthIndicator client={client} />;
            case 'name':
                return (
                    <div>
                         <div className="font-bold text-text-default text-base">{client.name}</div>
                         <div className="text-xs text-text-muted">{client.industry}</div>
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
                     <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusStyles[client.status]?.bg || 'bg-gray-100'} ${statusStyles[client.status]?.text || 'text-gray-700'} ${statusStyles[client.status]?.border || 'border-gray-200'}`}>
                        {client.status}
                    </span>
                );
            case 'pipelineStage':
                // Find stage name even if pipeline is 'all', by searching all pipelines
                let stageName = client.pipelineStage;
                let stageColor = 'border-gray-200';
                let stageBg = 'bg-gray-50';

                // Try to find stage in any pipeline
                for (const pipeline of pipelines) {
                    const foundStage = pipeline.stages.find(s => s.id === client.pipelineStage);
                    if (foundStage) {
                        stageName = foundStage.name;
                        stageColor = foundStage.color;
                        stageBg = foundStage.bg;
                        break;
                    }
                }
                
                 return (
                     <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold border ${stageColor} ${stageBg} text-text-default`}>
                         {stageName}
                     </span>
                 );
            case 'contactPerson':
                return client.contactPerson;
            case 'phone':
                 return <span dir="ltr">{client.phone}</span>;
            case 'openJobs':
                return <span className="inline-block bg-primary-50 text-primary-700 px-2 py-1 rounded text-xs font-bold">{client.openJobs}</span>;
            case 'actions':
                return (
                    <div className="relative flex items-center justify-center" data-menu-trigger>
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
        return pipelines[0].id;
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
            `}</style>

             {/* Header & KPIs */}
             <div className="flex flex-col gap-6">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-text-default">{t('clients.title')}</h1>
                        <p className="text-sm text-text-muted">ניהול קשרי לקוחות, אנשי קשר ותהליכי מכירה</p>
                    </div>
                    <button 
                        onClick={() => { setQuickAddStageId(pipelines[0].stages[0].id); setIsQuickAddOpen(true); }}
                        className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2 w-full md:w-auto justify-center"
                    >
                        <PlusIcon className="w-5 h-5"/>
                        <span>לקוח חדש</span>
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
                </div>
             </div>

             {/* Tab Switcher */}
             <div className="flex border-b border-border-default overflow-x-auto no-scrollbar">
                 <button 
                    onClick={() => setActiveTab('companies')} 
                    className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'companies' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}
                 >
                     <BuildingOffice2Icon className="w-5 h-5 inline-block ml-2"/>
                     תיקי לקוחות
                 </button>
                 <button 
                    onClick={() => setActiveTab('contacts')} 
                    className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'contacts' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}
                 >
                     <UserGroupIcon className="w-5 h-5 inline-block ml-2"/>
                     אנשי קשר
                 </button>
                 {/* Added Tasks Tab */}
                 <button 
                    onClick={() => setActiveTab('tasks')} 
                    className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'tasks' ? 'border-primary-600 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}
                 >
                     <ClipboardDocumentCheckIcon className="w-5 h-5 inline-block ml-2"/>
                     משימות
                 </button>
             </div>

             {/* Toolbar & View Controls */}
             {activeTab !== 'tasks' && (
             <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm flex flex-col items-center gap-4">
                 
                 {/* Top Row: Search */}
                 <div className="w-full flex items-center gap-4">
                     <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder={activeTab === 'companies' ? "חיפוש לקוח..." : "חיפוש איש קשר..."} 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all" 
                        />
                     </div>
                 </div>

                 {/* Filters Row - Only for Companies tab */}
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
                                <option value="פעיל">פעיל</option>
                                <option value="בהקפאה">בהקפאה</option>
                                <option value="לא פעיל">לא פעיל</option>
                                <option value="ליד חדש">ליד חדש</option>
                            </select>
                            <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                        </div>

                        {/* Account Manager Filter */}
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

                        {/* Pipeline Selector (moved here) */}
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
                                placeholder="כל הלקוחות"
                                className="w-full"
                                icon={<BuildingOffice2Icon className="w-4 h-4 text-text-subtle"/>}
                             />
                         </div>
                     </div>
                 )}

                 <div className="w-full flex justify-end gap-3 pt-2 border-t border-border-subtle">
                     {activeTab === 'companies' ? (
                         <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                              {/* Client Column Visibility Popover Trigger */}
                            <div className="relative" ref={clientSettingsRef}>
                                <button 
                                    onClick={() => setIsClientColumnPopoverOpen(!isClientColumnPopoverOpen)}
                                    className="p-2 bg-bg-subtle border border-border-default rounded-lg hover:bg-bg-hover transition-colors"
                                    title="התאם עמודות"
                                >
                                    <Cog6ToothIcon className="w-5 h-5 text-text-muted" />
                                </button>
                                {isClientColumnPopoverOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-xl shadow-xl border border-border-default z-20 p-4 animate-fade-in">
                                        <p className="font-bold text-text-default mb-2 text-sm border-b border-border-default pb-2">בחר עמודות להצגה</p>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {allClientColumns.map(col => (
                                                <label key={col.id} className="flex items-center gap-2 text-sm text-text-default hover:bg-bg-hover p-1.5 rounded cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={clientVisibleColumns.includes(col.id)} 
                                                        onChange={() => handleClientColumnToggle(col.id)} 
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
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-xl shadow-xl border border-border-default z-20 p-4 animate-fade-in">
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
                                >
                                    <TableCellsIcon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => setContactsViewMode('grid')} 
                                    className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${contactsViewMode === 'grid' ? 'bg-white text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >
                                    <Squares2X2Icon className="w-4 h-4"/>
                                </button>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
             )}

             {/* Content Area */}
             <div className="bg-bg-subtle/30 rounded-2xl border border-border-default flex flex-col overflow-hidden">
                 {activeTab === 'companies' ? (
                     viewMode === 'table' ? (
                        <div className="overflow-x-auto custom-scrollbar bg-bg-card">
                             <table className="w-full text-sm text-right border-collapse min-w-[900px]">
                                 <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase sticky top-0 z-20 border-b border-border-default shadow-sm">
                                     <tr>
                                         {clientVisibleColumns.map((colId, index) => {
                                             const col = allClientColumns.find(c => c.id === colId);
                                             if (!col) return null;
                                             return (
                                                 <th 
                                                    key={col.id} 
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors select-none ${draggingColumn === col.id ? 'dragging' : ''}`}
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
                                                 className={`hover:bg-bg-hover transition-colors group cursor-pointer ${activeActionMenuId === client.id ? 'z-20 relative' : ''}`}
                                                 onClick={() => handleNavigateToProfile(client.id)}
                                             >
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
                                    const stageInfo = activePipeline ? activePipeline.stages.find(s => s.id === client.pipelineStage) : pipelines[0].stages.find(s => s.id === client.pipelineStage);
                                    
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
                                            onClick={() => handleCardClick(client)}
                                            stageName={displayStageName}
                                            activePipelineColor={displayStageColor}
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
                                                            onClick={() => handleCardClick(client)}
                                                            onDragStart={(e) => handleKanbanDragStart(e, client.id)}
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
                     // --- CONTACTS VIEW ---
                     contactsViewMode === 'table' ? (
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
                                                                    <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-border-default rounded-lg shadow-xl z-20 overflow-hidden animate-fade-in">
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setActiveActionMenuId(null); handleOpenContactDrawer(contact); }}
                                                                            className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                                                                        >
                                                                            <UserIcon className="w-4 h-4 text-text-subtle"/> צפה בפרופיל
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setActiveActionMenuId(null); handleStartProcess(contact, 'sales'); }}
                                                                            className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2"
                                                                        >
                                                                            <PlusIcon className="w-4 h-4 text-primary-600"/> פתח תהליך מכירה
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setActiveActionMenuId(null); handleStartProcess(contact, 'retention'); }}
                                                                            className="w-full text-right px-4 py-2.5 text-sm hover:bg-bg-hover text-text-default flex items-center gap-2 border-t border-border-subtle"
                                                                        >
                                                                            <PlusIcon className="w-4 h-4 text-purple-600"/> פתח תהליך שימור
                                                                        </button>
                                                                    </div>
                                                                )}
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
                        </div>
                     ) : (
                         // CONTACTS GRID
                         <div className="overflow-y-auto custom-scrollbar p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {sortedContacts.map(contact => (
                                    <ContactGridCard 
                                        key={contact.id} 
                                        contact={contact} 
                                        isSelected={selectedContactIds.has(contact.id)}
                                        onSelect={() => handleContactSelect(contact.id)}
                                        onAction={(action) => handleSingleContactAction(action, contact)}
                                        onStartProcess={handleStartProcess}
                                        onViewProfile={handleOpenContactDrawer}
                                    />
                                ))}
                            </div>
                         </div>
                     )
                 ) : (
                    // --- TASKS VIEW (NEW) ---
                    <ClientTasksTab showPipeline={false} />
                 )}
             </div>

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
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 bg-white border border-border-default rounded-lg shadow-xl overflow-hidden">
                                <button onClick={() => handleBulkStartProcess('sales')} className="w-full text-right px-4 py-2 text-sm hover:bg-bg-hover">תהליך מכירה</button>
                                <button onClick={() => handleBulkStartProcess('retention')} className="w-full text-right px-4 py-2 text-sm hover:bg-bg-hover border-t border-border-subtle">תהליך שימור</button>
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
                pipelineId={activePipelineId === 'all' ? pipelines[0].id : activePipelineId}
                stageId={quickAddStageId}
                onSave={handleQuickAdd}
            />
            
            <ContactDrawer 
                isOpen={isContactDrawerOpen}
                onClose={() => setIsContactDrawerOpen(false)}
                contact={selectedContactForDrawer}
                onStartProcess={(type) => {
                    if (selectedContactForDrawer) handleStartProcess(selectedContactForDrawer, type);
                }}
            />
        </div>
    );
};

export default ClientsListView;
