
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ClipboardDocumentCheckIcon, CheckCircleIcon, ExclamationTriangleIcon, 
    BanknotesIcon, UserGroupIcon, PlusIcon, PencilIcon, TrashIcon, 
    CalendarIcon, CheckIcon, SparklesIcon, ChevronDownIcon, ClockIcon, XMarkIcon,
    BuildingOffice2Icon, MagnifyingGlassIcon, FunnelIcon, CalendarDaysIcon,
    FlagIcon, UserIcon, ArrowRightIcon
} from './Icons';
// --- TYPES ---

type TaskType = 'sales' | 'retention';
type TaskStatus = 'pending' | 'done';
type TaskPriority = 'high' | 'medium' | 'low';

export interface TaskHistoryItem {
    date: string;
    user: string;
    action: string;
}

export interface ClientTask {
    id: string;
    type: TaskType;
    status: TaskStatus;
    priority: TaskPriority;
    title: string;
    description?: string;
    dueDate: string; // ISO Date
    assignee: string; // Name
    isOverdue?: boolean;
    clientName?: string;
    clientId?: string; // Added for navigation
    contactName?: string;
    processStage?: string; // Linked to pipeline stage
    history?: TaskHistoryItem[]; // Added history
}

// Pipeline Definitions for filtering
const pipelines = [
    {
        id: 'sales',
        name: 'מכירות',
        stages: [
            { id: 'lead', name: 'ליד' },
            { id: 'meeting', name: 'פגישה' },
            { id: 'proposal', name: 'הצעת מחיר' },
            { id: 'negotiation', name: 'משא ומתן' },
            { id: 'won', name: 'סגירה' },
        ]
    },
    {
        id: 'retention',
        name: 'שימור',
        stages: [
            { id: 'onboarding', name: 'קליטה' },
            { id: 'active', name: 'לקוח פעיל' },
            { id: 'renewal', name: 'חידוש חוזה' },
            { id: 'risk', name: 'בסיכון' },
        ]
    }
];

const fallbackAssignees = ['אני'];

const computeIsOverdue = (task: ClientTask) => {
    if (task.status !== 'pending') return false;
    if (!task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
};

// --- MODAL COMPONENT ---

interface TaskFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: ClientTask) => void;
    taskToEdit?: ClientTask | null;
    assignees: string[];
    /** When creating a task across all clients, user must pick which client it belongs to. */
    aggregateMode?: boolean;
    clientPickerOptions?: { id: string; name: string }[];
    pickedClientId?: string;
    onPickedClientIdChange?: (id: string) => void;
}

const TaskFormModal: React.FC<TaskFormModalProps> = ({
    isOpen,
    onClose,
    onSave,
    taskToEdit,
    assignees,
    aggregateMode,
    clientPickerOptions = [],
    pickedClientId,
    onPickedClientIdChange,
}) => {
    const [formData, setFormData] = useState<Partial<ClientTask>>({
        title: '',
        description: '',
        type: 'sales',
        priority: 'medium',
        dueDate: new Date().toISOString().split('T')[0],
        assignee: assignees?.[0] || 'אני',
        status: 'pending',
        clientName: '',
        processStage: ''
    });

    useEffect(() => {
        if (isOpen) {
            if (taskToEdit) {
                setFormData(taskToEdit);
            } else {
                setFormData({
                    title: '',
                    description: '',
                    type: 'sales',
                    priority: 'medium',
                    dueDate: new Date().toISOString().split('T')[0],
                    assignee: assignees?.[0] || 'אני',
                    status: 'pending',
                    clientName: '',
                    processStage: pipelines[0].stages[0].id
                });
            }
        }
    }, [isOpen, taskToEdit, assignees]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title) return;
        if (aggregateMode && !taskToEdit && !pickedClientId) return;

        const picked = clientPickerOptions.find((c) => c.id === pickedClientId);
        onSave({
            id: taskToEdit ? taskToEdit.id : `tmp-${Date.now()}`,
            ...formData as ClientTask,
            clientId: taskToEdit?.clientId || pickedClientId || formData.clientId,
            clientName: taskToEdit?.clientName || picked?.name || formData.clientName,
            history: taskToEdit?.history || [{ date: new Date().toISOString(), user: 'אני', action: 'יצירת משימה' }],
        });
        onClose();
    };

    const activePipeline = pipelines.find(p => p.id === formData.type) || pipelines[0];

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-lg rounded-3xl shadow-2xl border border-border-default overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-border-default/50 relative">
                    <h3 className="font-black text-xl text-text-default text-center w-full">{taskToEdit ? 'עריכת משימה' : 'משימה חדשה'}</h3>
                    <button onClick={onClose} className="absolute left-6 p-2 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default transition-colors">
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {aggregateMode && !taskToEdit && clientPickerOptions.length > 0 && (
                        <div>
                            <label className="block text-sm font-bold text-text-default mb-2">לקוח</label>
                            <select
                                value={pickedClientId || ''}
                                onChange={(e) => onPickedClientIdChange?.(e.target.value)}
                                required
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all shadow-sm"
                            >
                                <option value="">בחר לקוח…</option>
                                {clientPickerOptions.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-2">כותרת המשימה</label>
                        <input 
                            type="text" 
                            required
                            value={formData.title}
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all shadow-sm"
                            placeholder="מה צריך לבצע?"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-bold text-text-default mb-2">לקוח רלוונטי</label>
                            <input 
                                type="text" 
                                value={formData.clientName}
                                onChange={e => setFormData({...formData, clientName: e.target.value})}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                                placeholder="שם הלקוח..."
                            />
                        </div>
                        <div>
                             <label className="block text-sm font-bold text-text-default mb-2">הקצאה ל-</label>
                             <select 
                                value={formData.assignee}
                                onChange={e => setFormData({...formData, assignee: e.target.value})}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                             >
                                 {Array.from(new Set([...(assignees || []), String(formData.assignee || '')].filter(Boolean))).map(member => (
                                     <option key={member} value={member}>{member}</option>
                                 ))}
                             </select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-bold text-text-default mb-2">תאריך יעד</label>
                            <div className="relative">
                                <input 
                                    type="date" 
                                    required
                                    value={formData.dueDate}
                                    onChange={e => setFormData({...formData, dueDate: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                                />
                            </div>
                        </div>
                        <div>
                             <label className="block text-sm font-bold text-text-default mb-2">דחיפות</label>
                             <select 
                                value={formData.priority}
                                onChange={e => setFormData({...formData, priority: e.target.value as TaskPriority})}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                             >
                                 <option value="high">גבוהה (דחוף)</option>
                                 <option value="medium">בינונית (רגיל)</option>
                                 <option value="low">נמוכה (רקע)</option>
                             </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div>
                             <label className="block text-sm font-bold text-text-default mb-2">תהליך (Type)</label>
                             <select 
                                value={formData.type}
                                onChange={e => {
                                    const newType = e.target.value as TaskType;
                                    const newPipeline = pipelines.find(p => p.id === newType);
                                    setFormData({
                                        ...formData, 
                                        type: newType,
                                        processStage: newPipeline ? newPipeline.stages[0].id : ''
                                    });
                                }}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                             >
                                 {pipelines.map(p => (
                                     <option key={p.id} value={p.id}>{p.name}</option>
                                 ))}
                             </select>
                        </div>
                        <div>
                             <label className="block text-sm font-bold text-text-default mb-2">שלב בתהליך</label>
                             <select 
                                value={formData.processStage}
                                onChange={e => setFormData({...formData, processStage: e.target.value})}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                             >
                                 {activePipeline.stages.map(s => (
                                     <option key={s.id} value={s.id}>{s.name}</option>
                                 ))}
                             </select>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-2">תיאור והערות</label>
                        <textarea 
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm resize-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                            placeholder="פרטים נוספים..."
                        />
                    </div>

                    <div className="flex justify-center gap-4 pt-6 mt-2 border-t border-border-default/50">
                        <button type="submit" className="w-full max-w-[200px] bg-primary-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-base">
                            {taskToEdit ? 'שמור שינויים' : 'צור משימה'}
                        </button>
                        <button type="button" onClick={onClose} className="w-full max-w-[200px] py-3.5 px-6 font-bold text-text-default hover:bg-bg-subtle rounded-xl transition-all border border-transparent hover:border-border-default text-base">ביטול</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- SUB-COMPONENTS ---

const TaskCard: React.FC<{
    task: ClientTask;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    onEdit: (task: ClientTask) => void;
}> = ({ task, onToggle, onDelete, onEdit }) => {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const isDone = task.status === 'done';
    
    // Style Mapping based on urgency/status
    let containerClass = "bg-bg-card border-border-default hover:border-primary-300";
    let priorityBadge = null;

    if (isDone) {
        containerClass = "bg-bg-subtle/30 border-transparent opacity-60";
    } else if (task.isOverdue) {
        containerClass = "bg-red-50/50 border-red-200";
        priorityBadge = <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1"><ExclamationTriangleIcon className="w-3 h-3"/> באיחור</span>;
    } else if (task.priority === 'high') {
        containerClass = "bg-white border-orange-200 shadow-sm";
        priorityBadge = <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full flex items-center gap-1"><FlagIcon className="w-3 h-3"/> דחוף</span>;
    } 

    const handleClientClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (task.clientId) {
            navigate(`/clients/${task.clientId}`);
        }
    };

    return (
        <div 
            className={`group rounded-xl border transition-all duration-200 overflow-hidden ${containerClass} ${isExpanded ? 'shadow-md ring-1 ring-primary-100' : ''}`}
        >
            <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                {/* Checkbox - Aligned to center vertically with the title */}
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                        isDone 
                        ? 'bg-green-500 border-green-500 text-white shadow-sm' 
                        : 'bg-white border-gray-300 text-transparent hover:border-primary-500 hover:shadow-inner'
                    }`}
                >
                    <CheckIcon className="w-3.5 h-3.5" />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                         <div className="flex items-center gap-2 overflow-hidden">
                             {task.type === 'sales' ? (
                                <span title="מכירות"><BanknotesIcon className={`w-4 h-4 flex-shrink-0 ${isDone ? 'text-text-muted' : 'text-green-600'}`} /></span>
                            ) : (
                                <span title="שימור/שירות"><UserGroupIcon className={`w-4 h-4 flex-shrink-0 ${isDone ? 'text-text-muted' : 'text-blue-600'}`} /></span>
                            )}
                             <span className={`text-sm font-bold truncate ${isDone ? 'line-through text-text-muted' : 'text-text-default'}`}>
                                {task.title}
                            </span>
                         </div>
                         <div className="flex items-center gap-2">
                             {priorityBadge}
                             <div className="text-text-subtle group-hover:text-primary-600 transition-colors">
                                 <ChevronDownIcon className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                         </div>
                    </div>
                    
                    {/* Secondary Info Line */}
                    <div className="flex items-center gap-3 text-xs text-text-subtle mt-1.5">
                         {task.clientName && (
                            <button 
                                onClick={handleClientClick}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-subtle/50 font-medium hover:bg-primary-50 hover:text-primary-700 transition-colors border border-transparent hover:border-primary-200"
                            >
                                <BuildingOffice2Icon className="w-3 h-3" />
                                {task.clientName}
                            </button>
                        )}
                        <span className={`flex items-center gap-1 ${task.isOverdue && !isDone ? 'text-red-600 font-bold' : ''}`}>
                            <CalendarIcon className="w-3 h-3"/>
                            {new Date(task.dueDate).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
                        </span>
                        
                        <div className="flex items-center gap-1 mr-auto">
                            <div className="w-4 h-4 rounded-full bg-primary-100 flex items-center justify-center text-[9px] font-bold text-primary-700">
                                {task.assignee.charAt(0)}
                            </div>
                            <span className="text-[10px] hidden sm:inline">{task.assignee}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-0 animate-fade-in bg-white/50">
                    <div className="pt-3 border-t border-border-default/50 mt-1">
                         {task.description && (
                             <div className="flex items-start gap-2 mb-4 bg-yellow-50 p-2.5 rounded-lg border border-yellow-100">
                                 <ClockIcon className="w-4 h-4 text-yellow-600 mt-0.5" />
                                 <p className="text-sm text-text-default leading-relaxed whitespace-pre-wrap">
                                     {task.description}
                                 </p>
                             </div>
                         )}
                         
                         {/* History Toggle Section */}
                         {task.history && task.history.length > 0 && (
                            <div className="mb-4">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShowHistory(!showHistory); }}
                                    className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-primary-600 transition-colors mb-2"
                                >
                                    <ClockIcon className="w-3.5 h-3.5" />
                                    <span>{showHistory ? 'הסתר היסטוריה' : 'הצג היסטוריית פעילות'}</span>
                                </button>
                                
                                {showHistory && (
                                    <div className="pl-3 border-r-2 border-border-subtle space-y-3 mr-1 bg-bg-subtle/30 p-3 rounded-lg">
                                        {task.history.slice().reverse().map((item, idx) => (
                                            <div key={idx} className="relative pr-3">
                                                <div className="absolute top-1.5 right-[-6px] w-1.5 h-1.5 rounded-full bg-primary-300 ring-2 ring-white"></div>
                                                <div className="flex justify-between items-start text-xs">
                                                    <span className="font-bold text-text-default">{item.action}</span>
                                                    <span className="text-[10px] text-text-subtle font-mono">{new Date(item.date).toLocaleDateString('he-IL')}</span>
                                                </div>
                                                <div className="text-[10px] text-text-muted mt-0.5">ע"י {item.user}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                         )}
                         
                         <div className="flex justify-end gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                                className="flex items-center gap-1 text-xs font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition shadow-sm"
                            >
                                <PencilIcon className="w-3.5 h-3.5" />
                                ערוך
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                                className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-white border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 transition shadow-sm"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                                מחק
                            </button>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface ClientTasksTabProps {
    showPipeline?: boolean;
    /** Omit to load and manage tasks for all clients (admin list view). */
    clientId?: string;
    /** Used when `clientId` is omitted — required to create new tasks (pick target client). */
    clientPickerOptions?: { id: string; name: string }[];
}

const ClientTasksTab: React.FC<ClientTasksTabProps> = ({
    showPipeline = true,
    clientId,
    clientPickerOptions = [],
}) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [tasks, setTasks] = useState<ClientTask[]>([]);
    const [assignees, setAssignees] = useState<string[]>(fallbackAssignees);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const aggregateMode = !clientId;

    useEffect(() => {
        if (!apiBase) return;
        if (!aggregateMode && !clientId) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        const tasksUrl = aggregateMode
            ? `${apiBase}/api/clients/all-tasks`
            : `${apiBase}/api/clients/${clientId}/tasks`;
        const contactsUrl = aggregateMode
            ? `${apiBase}/api/clients/all-contacts`
            : `${apiBase}/api/clients/${clientId}/contacts`;
        Promise.all([
            fetch(tasksUrl).then((r) => {
                if (!r.ok) throw new Error('Failed to load tasks');
                return r.json();
            }),
            fetch(contactsUrl).then((r) => {
                if (!r.ok) return [];
                return r.json();
            }),
        ])
            .then(([tasksData, contactsData]) => {
                if (!active) return;
                const list = Array.isArray(tasksData) ? tasksData : (tasksData?.data ?? []);
                const mapped: ClientTask[] = list
                    .map((row: any) => {
                        const cli = row.client;
                        const resolvedClientId = String(row.clientId || clientId || cli?.id || '');
                        const clientName = cli
                            ? String(cli.displayName || cli.name || '').trim()
                            : '';
                        return {
                            id: String(row.id),
                            type: (row.type as TaskType) || 'sales',
                            status: (row.status as TaskStatus) || 'pending',
                            priority: (row.priority as TaskPriority) || 'medium',
                            title: row.title || '',
                            description: row.description || '',
                            dueDate: row.dueDate || new Date().toISOString().split('T')[0],
                            assignee: row.assignee || '',
                            clientId: resolvedClientId,
                            clientName,
                            processStage: row.processStage || '',
                            history: Array.isArray(row.history) ? row.history : [],
                        };
                    })
                    .map((t) => ({
                        ...t,
                        assignee: t.assignee || fallbackAssignees[0],
                        isOverdue: computeIsOverdue(t),
                    }));
                setTasks(mapped);

                const cList = Array.isArray(contactsData) ? contactsData : (contactsData?.data ?? []);
                const names = cList.map((c: any) => String(c?.name || '').trim()).filter(Boolean);
                setAssignees(names.length ? Array.from(new Set(names)) : fallbackAssignees);
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'Failed to load tasks');
                setTasks([]);
                setAssignees(fallbackAssignees);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [apiBase, clientId, aggregateMode]);
    
    // Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('pending'); // default pending
    const [filterProcess, setFilterProcess] = useState<string>('all');
    const [filterStage, setFilterStage] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<ClientTask | null>(null);
    const [pickedClientIdForNewTask, setPickedClientIdForNewTask] = useState('');
    
    // Derived filtering options
    const activePipeline = pipelines.find(p => p.id === filterProcess);

    // Filtering Logic
    const filteredTasks = useMemo(() => {
        return tasks.filter(task => {
            const matchesSearch = !searchTerm || task.title.toLowerCase().includes(searchTerm.toLowerCase()) || task.clientName?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = 
                filterStatus === 'all' || 
                (filterStatus === 'pending' && task.status === 'pending') || 
                (filterStatus === 'done' && task.status === 'done');

            const matchesProcess = filterProcess === 'all' || task.type === filterProcess;
            
            const matchesStage = filterStage === 'all' || task.processStage === filterStage;
            
            const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;

            return matchesSearch && matchesStatus && matchesProcess && matchesStage && matchesPriority;
        });
    }, [tasks, searchTerm, filterStatus, filterProcess, filterStage, filterPriority]);

    // SORTING LOGIC: Overdue -> High Priority -> Date
    const sortedTasks = useMemo(() => {
        return [...filteredTasks].sort((a, b) => {
            // 1. Completion Status (Pending first)
            if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
            
            // 2. Overdue (Yes first)
            if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
            
            // 3. Priority (High -> Medium -> Low)
            const pMap = { 'high': 3, 'medium': 2, 'low': 1 };
            if (pMap[a.priority] !== pMap[b.priority]) return pMap[b.priority] - pMap[a.priority];
            
            // 4. Date (Soonest first)
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
    }, [filteredTasks]);

    const handleToggleTask = async (id: string) => {
        const prevTask = tasks.find(t => t.id === id);
        if (!prevTask) return;
        const newStatus: TaskStatus = prevTask.status === 'done' ? 'pending' : 'done';
        const newHistory = [
            ...(prevTask.history || []),
            { date: new Date().toISOString(), user: 'אני', action: newStatus === 'done' ? 'סימון כבוצע' : 'סימון כפתוח' }
        ];

        setTasks(prev => prev.map(t => t.id === id ? ({ ...t, status: newStatus, history: newHistory, isOverdue: computeIsOverdue({ ...t, status: newStatus }) }) : t));

        const targetClientId = clientId || prevTask.clientId;
        if (!apiBase || !targetClientId) return;
        try {
            const res = await fetch(`${apiBase}/api/clients/${targetClientId}/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, history: newHistory }),
            });
            if (!res.ok) throw new Error('Update failed');
        } catch (_e) {
            setTasks(prev => prev.map(t => t.id === id ? ({ ...t, status: prevTask.status, history: prevTask.history, isOverdue: computeIsOverdue(prevTask) }) : t));
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!window.confirm('האם למחוק משימה זו?')) return;
        const prevTasks = tasks;
        const row = tasks.find((t) => t.id === id);
        const targetClientId = clientId || row?.clientId;
        setTasks(prev => prev.filter(t => t.id !== id));
        if (!apiBase || !targetClientId) return;
        try {
            const res = await fetch(`${apiBase}/api/clients/${targetClientId}/tasks/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
        } catch (_e) {
            setTasks(prevTasks);
        }
    };

    const handleCreateTask = () => {
        setEditingTask(null);
        if (aggregateMode && clientPickerOptions.length > 0) {
            setPickedClientIdForNewTask(clientPickerOptions[0].id);
        } else {
            setPickedClientIdForNewTask('');
        }
        setIsModalOpen(true);
    };

    const handleEditTask = (task: ClientTask) => {
        setEditingTask(task);
        setIsModalOpen(true);
    };

    const handleSaveTask = async (task: ClientTask) => {
        if (!apiBase) return;
        const saveClientId = clientId || task.clientId || pickedClientIdForNewTask;
        if (!saveClientId) return;

        if (editingTask) {
            const updatedTask: ClientTask = {
                ...task,
                history: [
                    ...(editingTask.history || []),
                    { date: new Date().toISOString(), user: 'אני', action: 'עריכת משימה' }
                ]
            };
            updatedTask.isOverdue = computeIsOverdue(updatedTask);
            setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
            try {
                const res = await fetch(`${apiBase}/api/clients/${saveClientId}/tasks/${task.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: updatedTask.type,
                        status: updatedTask.status,
                        priority: updatedTask.priority,
                        title: updatedTask.title,
                        description: updatedTask.description,
                        dueDate: updatedTask.dueDate,
                        assignee: updatedTask.assignee,
                        processStage: updatedTask.processStage,
                        history: updatedTask.history || [],
                    }),
                });
                if (!res.ok) throw new Error('Update failed');
            } catch (_e) {
                // keep optimistic update for now
            }
        } else {
            const createPayload = {
                type: task.type,
                status: task.status,
                priority: task.priority,
                title: task.title,
                description: task.description,
                dueDate: task.dueDate,
                assignee: task.assignee,
                processStage: task.processStage,
                history: task.history || [{ date: new Date().toISOString(), user: 'אני', action: 'יצירת משימה' }],
            };
            try {
                const res = await fetch(`${apiBase}/api/clients/${saveClientId}/tasks`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(createPayload),
                });
                if (!res.ok) throw new Error('Create failed');
                const created = await res.json();
                const createdTask: ClientTask = {
                    id: String(created.id),
                    type: (created.type as TaskType) || task.type,
                    status: (created.status as TaskStatus) || task.status,
                    priority: (created.priority as TaskPriority) || task.priority,
                    title: created.title || task.title,
                    description: created.description || task.description,
                    dueDate: created.dueDate || task.dueDate,
                    assignee: created.assignee || task.assignee,
                    clientId: String(created.clientId || saveClientId),
                    clientName: task.clientName,
                    processStage: created.processStage || task.processStage,
                    history: Array.isArray(created.history) ? created.history : createPayload.history,
                };
                createdTask.isOverdue = computeIsOverdue(createdTask);
                setTasks(prev => [createdTask, ...prev]);
            } catch (_e) {
                // keep modal open? for now close and do nothing
            }
        }
        setIsModalOpen(false);
    };

    return (
        <div className="h-full flex flex-col animate-fade-in relative max-w-5xl mx-auto w-full">
            {isLoading && (
                <div className="text-center text-sm text-text-muted py-6">טוען משימות…</div>
            )}
            {error && !isLoading && (
                <div className="text-center text-sm text-red-600 py-4 px-4">{error}</div>
            )}

            {/* Main Action Bar (Sticky) */}
            <div className="sticky top-0 z-20 bg-bg-default/95 backdrop-blur-md pb-4 pt-2">
                <div className="flex flex-col md:flex-row gap-3 items-center justify-between p-2 bg-white rounded-2xl shadow-sm border border-border-default">
                    
                     {/* Search Input */}
                     <div className="relative flex-grow w-full md:w-auto">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                        <input 
                            type="text" 
                            placeholder="חיפוש משימה, לקוח..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-subtle/50 border border-border-default rounded-full py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-all hover:bg-white"
                        />
                     </div>
                     
                     <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
                         {/* Status Pills */}
                         <div className="flex bg-bg-subtle p-1 rounded-full border border-border-default">
                             <button 
                                onClick={() => setFilterStatus('all')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all whitespace-nowrap ${filterStatus === 'all' ? 'bg-white shadow text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                            >
                                הכל
                            </button>
                             <button 
                                onClick={() => setFilterStatus('pending')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all whitespace-nowrap ${filterStatus === 'pending' ? 'bg-white shadow text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                            >
                                לביצוע
                            </button>
                            <button 
                                onClick={() => setFilterStatus('done')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all whitespace-nowrap ${filterStatus === 'done' ? 'bg-white shadow text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                            >
                                הושלם
                            </button>
                         </div>
                         
                         {/* Process Filter */}
                         <div className="relative">
                            <select 
                                value={filterProcess} 
                                onChange={(e) => {
                                    setFilterProcess(e.target.value);
                                    setFilterStage('all'); // Reset stage when process changes
                                }}
                                className="appearance-none bg-white border border-border-default rounded-full py-2 pl-8 pr-4 text-xs font-bold text-text-default focus:ring-2 focus:ring-primary-500 outline-none cursor-pointer hover:border-primary-300 transition-colors"
                            >
                                <option value="all">כל התהליכים</option>
                                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <FunnelIcon className="w-3 h-3 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
                         </div>
                         
                         {/* Stage Filter - Conditional */}
                         {filterProcess !== 'all' && activePipeline && (
                            <div className="relative animate-fade-in">
                                 <select 
                                    value={filterStage} 
                                    onChange={(e) => setFilterStage(e.target.value)}
                                    className="appearance-none bg-white border border-primary-200 rounded-full py-2 pl-8 pr-4 text-xs font-bold text-primary-700 focus:ring-2 focus:ring-primary-500 outline-none cursor-pointer hover:border-primary-300 transition-colors"
                                >
                                    <option value="all">כל השלבים</option>
                                    {activePipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <ChevronDownIcon className="w-3 h-3 text-primary-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
                            </div>
                        )}

                         {/* Priority Dropdown */}
                         <div className="relative">
                            <select 
                                value={filterPriority} 
                                onChange={(e) => setFilterPriority(e.target.value)}
                                className="appearance-none bg-white border border-border-default rounded-full py-2 pl-8 pr-4 text-xs font-bold text-text-default focus:ring-2 focus:ring-primary-500 outline-none cursor-pointer hover:border-primary-300 transition-colors"
                            >
                                <option value="all">כל הדחיפויות</option>
                                <option value="high">גבוהה</option>
                                <option value="medium">בינונית</option>
                                <option value="low">נמוכה</option>
                            </select>
                            <FlagIcon className="w-3 h-3 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
                         </div>
                         
                         <div className="w-px h-6 bg-border-default mx-1 hidden md:block"></div>

                         <button
                            type="button"
                            onClick={handleCreateTask}
                            disabled={aggregateMode && clientPickerOptions.length === 0}
                            title={aggregateMode && clientPickerOptions.length === 0 ? 'טען לקוחות כדי ליצור משימה' : undefined}
                            className="bg-primary-600 text-white font-bold py-2 px-5 rounded-full hover:bg-primary-700 transition shadow-md shadow-primary-500/20 flex items-center gap-2 whitespace-nowrap text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <PlusIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">משימה חדשה</span>
                            <span className="sm:hidden">חדש</span>
                        </button>
                     </div>
                </div>
                
                 {/* Count Badge */}
                 <div className="flex justify-end px-2 mt-2">
                    <span className="text-[10px] font-bold text-text-muted bg-bg-subtle px-2 py-0.5 rounded-md">
                        {filteredTasks.length} משימות
                    </span>
                 </div>
            </div>

            {/* Task List */}
            <div className="space-y-3 pb-20">
                {!isLoading && sortedTasks.length > 0 ? (
                    sortedTasks.map(task => (
                        <TaskCard 
                            key={task.id} 
                            task={task} 
                            onToggle={handleToggleTask} 
                            onDelete={handleDeleteTask} 
                            onEdit={handleEditTask} 
                        />
                    ))
                ) : !isLoading ? (
                    <div className="text-center py-16 flex flex-col items-center justify-center text-text-muted">
                        <div className="w-16 h-16 bg-bg-subtle rounded-full flex items-center justify-center mb-4">
                            <CheckCircleIcon className="w-8 h-8 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-bold text-text-default">אין משימות להצגה</h3>
                        <p className="text-sm mt-1">נראה שהכל טופל! או שצריך לשנות את הסינון.</p>
                        <button onClick={() => {setFilterStatus('all'); setSearchTerm(''); setFilterProcess('all'); setFilterPriority('all');}} className="mt-4 text-primary-600 font-bold hover:underline text-sm">
                            נקה סינון
                        </button>
                    </div>
                ) : null}
            </div>

            {/* TASK FORM MODAL */}
            <TaskFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveTask}
                taskToEdit={editingTask}
                assignees={assignees}
                aggregateMode={aggregateMode && !editingTask}
                clientPickerOptions={clientPickerOptions}
                pickedClientId={pickedClientIdForNewTask}
                onPickedClientIdChange={setPickedClientIdForNewTask}
            />
        </div>
    );
};

export default ClientTasksTab;
