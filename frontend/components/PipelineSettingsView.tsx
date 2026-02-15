
import React, { useState, useRef, useEffect } from 'react';
import { 
    PlusIcon, PencilIcon, TrashIcon, XMarkIcon, CheckCircleIcon, 
    ChevronUpIcon, ChevronDownIcon, Bars3Icon, ClockIcon, BriefcaseIcon, UserGroupIcon
} from './Icons';

// --- TYPES ---
interface Stage {
    id: string;
    name: string;
    color: string; // Tailwind class
    order: number;
    slaLimit: number; // Days allowed in this stage before alert
}

interface Pipeline {
    id: string;
    name: string;
    description: string;
    stages: Stage[];
}

// --- MOCK DATA ---
const initialPipelines: Pipeline[] = [
    {
        id: 'sales',
        name: 'מכירות (Sales)',
        description: 'תהליך מכירה סטנדרטי מליד ועד סגירה.',
        stages: [
            { id: 'lead', name: 'ליד חדש', color: 'bg-blue-100 text-blue-700', order: 1, slaLimit: 2 },
            { id: 'meeting', name: 'פגישה', color: 'bg-purple-100 text-purple-700', order: 2, slaLimit: 5 },
            { id: 'proposal', name: 'הצעת מחיר', color: 'bg-yellow-100 text-yellow-700', order: 3, slaLimit: 3 },
            { id: 'negotiation', name: 'משא ומתן', color: 'bg-orange-100 text-orange-700', order: 4, slaLimit: 7 },
            { id: 'won', name: 'סגירה (זכייה)', color: 'bg-green-100 text-green-700', order: 5, slaLimit: 0 },
            { id: 'lost', name: 'אבוד', color: 'bg-gray-100 text-gray-700', order: 6, slaLimit: 0 },
        ]
    },
    {
        id: 'retention',
        name: 'שימור לקוחות (Retention)',
        description: 'תהליך ליווי לקוח קיים ומניעת נטישה.',
        stages: [
            { id: 'onboarding', name: 'קליטה (Onboarding)', color: 'bg-indigo-100 text-indigo-700', order: 1, slaLimit: 14 },
            { id: 'active', name: 'לקוח פעיל', color: 'bg-green-100 text-green-700', order: 2, slaLimit: 90 },
            { id: 'risk', name: 'בסיכון (At Risk)', color: 'bg-red-100 text-red-700', order: 3, slaLimit: 3 },
            { id: 'renewal', name: 'חידוש חוזה', color: 'bg-cyan-100 text-cyan-700', order: 4, slaLimit: 30 },
        ]
    }
];

const availableColors = [
    { label: 'כחול', value: 'bg-blue-100 text-blue-700' },
    { label: 'ירוק', value: 'bg-green-100 text-green-700' },
    { label: 'אדום', value: 'bg-red-100 text-red-700' },
    { label: 'צהוב', value: 'bg-yellow-100 text-yellow-700' },
    { label: 'סגול', value: 'bg-purple-100 text-purple-700' },
    { label: 'כתום', value: 'bg-orange-100 text-orange-700' },
    { label: 'אפור', value: 'bg-gray-100 text-gray-700' },
    { label: 'טורקיז', value: 'bg-teal-100 text-teal-700' },
    { label: 'ורוד', value: 'bg-pink-100 text-pink-700' },
    { label: 'אינדיגו', value: 'bg-indigo-100 text-indigo-700' },
];

// --- ADD PIPELINE MODAL ---
const AddPipelineModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, description: string) => void;
}> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(name, description);
        setName('');
        setDescription('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-xl border border-border-default overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg text-text-default">יצירת תהליך חדש</h3>
                    <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">שם התהליך</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            placeholder="למשל: גיוס בכירים"
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">תיאור</label>
                        <textarea 
                            value={description} 
                            onChange={e => setDescription(e.target.value)} 
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                            placeholder="תיאור קצר של התהליך..."
                            rows={3}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:bg-bg-subtle">ביטול</button>
                        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 shadow-sm">צור תהליך</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PipelineSettingsView: React.FC = () => {
    const [pipelines, setPipelines] = useState<Pipeline[]>(initialPipelines);
    const [activePipelineId, setActivePipelineId] = useState<string>(initialPipelines[0].id);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // Drag & Drop State
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const stagesContainerRef = useRef<HTMLDivElement>(null);

    const activePipeline = pipelines.find(p => p.id === activePipelineId);

    // --- Actions ---

    const handleAddPipeline = (name: string, description: string) => {
        const newPipeline: Pipeline = {
            id: Date.now().toString(),
            name,
            description,
            stages: []
        };
        setPipelines([...pipelines, newPipeline]);
        setActivePipelineId(newPipeline.id);
    };

    const handleAddStage = () => {
        if (!activePipeline) return;
        
        const newStage: Stage = {
            id: Date.now().toString(),
            name: 'שלב חדש',
            color: 'bg-gray-100 text-gray-700',
            order: activePipeline.stages.length + 1,
            slaLimit: 3
        };

        const updatedPipeline = {
            ...activePipeline,
            stages: [...activePipeline.stages, newStage]
        };

        setPipelines(prev => prev.map(p => p.id === activePipelineId ? updatedPipeline : p));

        // Scroll to bottom to show new stage
        setTimeout(() => {
            if (stagesContainerRef.current) {
                stagesContainerRef.current.scrollTop = stagesContainerRef.current.scrollHeight;
            }
        }, 100);
    };

    const handleUpdateStage = (stageId: string, field: keyof Stage, value: any) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map(s => s.id === stageId ? { ...s, [field]: value } : s)
        };
        setPipelines(prev => prev.map(p => p.id === activePipelineId ? updatedPipeline : p));
    };

    const handleDeleteStage = (stageId: string) => {
        if (!activePipeline) return;
        if (window.confirm('האם למחוק שלב זה? מועמדים בשלב זה יועברו לארכיון.')) {
            const updatedPipeline = {
                ...activePipeline,
                stages: activePipeline.stages.filter(s => s.id !== stageId)
            };
            setPipelines(prev => prev.map(p => p.id === activePipelineId ? updatedPipeline : p));
        }
    };

    // --- Drag & Drop Logic ---

    const handleDragStart = (e: React.DragEvent, position: number) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent, position: number) => {
        dragOverItem.current = position;
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDragEnd = () => {
        if (!activePipeline || dragItem.current === null || dragOverItem.current === null) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        const newStages = [...activePipeline.stages];
        const draggedItemContent = newStages[dragItem.current];
        
        newStages.splice(dragItem.current, 1);
        newStages.splice(dragOverItem.current, 0, draggedItemContent);

        // Reassign orders
        const reorderedStages = newStages.map((s, i) => ({ ...s, order: i + 1 }));

        const updatedPipeline = {
            ...activePipeline,
            stages: reorderedStages
        };

        setPipelines(prev => prev.map(p => p.id === activePipelineId ? updatedPipeline : p));
        
        dragItem.current = null;
        dragOverItem.current = null;
    };


    return (
        <div className="h-full flex flex-col md:flex-row gap-6 animate-fade-in pb-10">
             <style>{`.ghost { opacity: 0.5; background: #f3f4f6; }`}</style>
            
            {/* Left Sidebar: Pipelines List */}
            <div className="w-full md:w-1/4 flex flex-col gap-4">
                 <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm h-full">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <h2 className="text-lg font-bold text-text-default">תהליכים</h2>
                        <button 
                            onClick={() => setIsAddModalOpen(true)}
                            className="text-primary-600 hover:bg-primary-50 p-1.5 rounded-lg transition-colors" 
                            title="הוסף תהליך חדש"
                        >
                            <PlusIcon className="w-5 h-5"/>
                        </button>
                    </div>
                    
                    <div className="space-y-2">
                        {pipelines.map(pipeline => (
                            <button
                                key={pipeline.id}
                                onClick={() => setActivePipelineId(pipeline.id)}
                                className={`w-full text-right p-4 rounded-xl border transition-all flex items-center justify-between group ${
                                    activePipelineId === pipeline.id
                                    ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-200'
                                    : 'bg-white border-border-default hover:border-primary-200 hover:shadow-sm'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${activePipelineId === pipeline.id ? 'bg-white text-primary-600' : 'bg-bg-subtle text-text-muted'}`}>
                                        {pipeline.id === 'sales' ? <BriefcaseIcon className="w-5 h-5"/> : <UserGroupIcon className="w-5 h-5"/>}
                                    </div>
                                    <div>
                                        <span className={`font-bold block ${activePipelineId === pipeline.id ? 'text-primary-900' : 'text-text-default'}`}>
                                            {pipeline.name}
                                        </span>
                                        <span className="text-xs text-text-muted">{pipeline.stages.length} שלבים</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Content: Stage Editor */}
            <div className="w-full md:w-3/4 flex flex-col gap-4">
                <div className="bg-bg-card rounded-2xl border border-border-default p-6 shadow-sm flex flex-col h-full">
                {activePipeline ? (
                    <>
                        <header className="mb-6 flex justify-between items-end border-b border-border-default pb-4">
                            <div>
                                <h2 className="text-2xl font-black text-text-default">{activePipeline.name}</h2>
                                <p className="text-sm text-text-muted mt-1">{activePipeline.description}</p>
                            </div>
                            <button 
                                onClick={handleAddStage}
                                className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-5 rounded-xl hover:bg-primary-700 transition shadow-md"
                            >
                                <PlusIcon className="w-5 h-5" />
                                <span>הוסף שלב</span>
                            </button>
                        </header>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" ref={stagesContainerRef}>
                             {/* Header Row */}
                             <div className="grid grid-cols-[40px_2fr_2fr_1fr_40px] gap-4 px-4 py-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                                 <div></div>
                                 <div>שם השלב (תצוגה)</div>
                                 <div>צבע תווית</div>
                                 <div>התראת SLA (ימים)</div>
                                 <div></div>
                             </div>

                            <div className="space-y-3">
                                {activePipeline.stages.map((stage, index) => (
                                    <div 
                                        key={stage.id} 
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragEnter={(e) => handleDragEnter(e, index)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                        className="grid grid-cols-[40px_2fr_2fr_1fr_40px] gap-4 items-center p-3 bg-white border border-border-default rounded-xl group hover:shadow-md transition-all cursor-default"
                                    >
                                        {/* Drag Handle */}
                                        <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-text-subtle hover:text-primary-600">
                                            <Bars3Icon className="w-5 h-5"/>
                                        </div>
                                        
                                        {/* Name Input & Preview */}
                                        <div>
                                            <input 
                                                type="text" 
                                                value={stage.name}
                                                onChange={(e) => handleUpdateStage(stage.id, 'name', e.target.value)}
                                                className={`w-full text-sm font-bold bg-transparent border-b-2 border-transparent focus:border-primary-500 outline-none px-1 py-0.5 rounded transition-colors ${stage.color.split(' ')[1]}`} // Use text color from class
                                                placeholder="שם השלב"
                                            />
                                        </div>

                                        {/* Color Palette */}
                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                                            {availableColors.map(c => {
                                                const bgClass = c.value.split(' ')[0]; // Extract bg class
                                                const isSelected = stage.color === c.value;
                                                return (
                                                    <button
                                                        key={c.label}
                                                        onClick={() => handleUpdateStage(stage.id, 'color', c.value)}
                                                        className={`w-6 h-6 rounded-full flex-shrink-0 transition-all border-2 ${bgClass} ${isSelected ? 'border-primary-600 scale-110 ring-1 ring-offset-1 ring-primary-300' : 'border-transparent hover:scale-105'}`}
                                                        title={c.label}
                                                    >
                                                        {isSelected && <CheckCircleIcon className="w-full h-full text-primary-700 p-0.5"/>}
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        {/* SLA Input */}
                                        <div className="flex items-center gap-2 bg-bg-subtle/50 px-2 py-1 rounded-lg border border-border-default max-w-[100px]">
                                            <ClockIcon className="w-4 h-4 text-text-subtle" />
                                            <input 
                                                type="number" 
                                                min="0"
                                                value={stage.slaLimit}
                                                onChange={(e) => handleUpdateStage(stage.id, 'slaLimit', parseInt(e.target.value) || 0)}
                                                className="w-full bg-transparent text-sm font-semibold text-center outline-none"
                                                title="התראה לאחר X ימים ללא שינוי"
                                            />
                                        </div>

                                        {/* Delete Action */}
                                        <div className="flex items-center justify-center">
                                            <button 
                                                onClick={() => handleDeleteStage(stage.id)} 
                                                className="p-2 text-text-subtle hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="מחק שלב"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3 text-sm text-blue-800">
                             <div className="bg-blue-100 p-1.5 rounded-full h-fit"><CheckCircleIcon className="w-5 h-5 text-blue-600"/></div>
                             <div>
                                 <strong>טיפ:</strong> סדר השלבים משפיע על תצוגת הלוח (Kanban). גרור את השלבים כדי לשנות את הסדר.
                                 הגדרת "SLA" תצבע מועמדים בלוח בצבע אדום כאשר הם חורגים מהזמן המוגדר.
                             </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center text-text-muted">
                        בחר תהליך מהרשימה לעריכה
                    </div>
                )}
                </div>
            </div>

            <AddPipelineModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onSave={handleAddPipeline} 
            />
        </div>
    );
};

export default PipelineSettingsView;
