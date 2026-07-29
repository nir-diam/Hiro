import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    PlusIcon, XMarkIcon, CheckCircleIcon,
    Bars3Icon, ClockIcon, BriefcaseIcon, UserGroupIcon, TrashIcon,
} from './Icons';
import { useAuth } from '../context/AuthContext';
import {
    fetchPipelines,
    syncPipelines,
    createPipeline,
    type PipelineDto,
    type PipelineStageDto,
} from '../services/pipelinesApi';

interface Stage {
    id: string;
    name: string;
    color: string;
    order: number;
    slaLimit: number;
}

interface Pipeline {
    id: string;
    name: string;
    description: string;
    stages: Stage[];
}

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
    { label: 'ציאן', value: 'bg-cyan-100 text-cyan-700' },
];

function dtoToPipeline(d: PipelineDto): Pipeline {
    return {
        id: d.id,
        name: d.name,
        description: d.description || '',
        stages: (d.stages || []).map((s: PipelineStageDto) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            order: s.order,
            slaLimit: s.slaLimit,
        })),
    };
}

const AddPipelineModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, description: string) => void;
    saving?: boolean;
}> = ({ isOpen, onClose, onSave, saving }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(name, description);
        setName('');
        setDescription('');
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-xl border border-border-default overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg text-text-default">יצירת תהליך חדש</h3>
                    <button type="button" onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
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
                        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 shadow-sm disabled:opacity-60">
                            {saving ? 'שומר…' : 'צור תהליך'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PipelineSettingsView: React.FC = () => {
    const { user } = useAuth();
    const clientId = user?.clientId ? String(user.clientId) : null;

    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [activePipelineId, setActivePipelineId] = useState<string>('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const stagesContainerRef = useRef<HTMLDivElement>(null);
    const persistEnabled = useRef(false);
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activePipeline = pipelines.find(p => p.id === activePipelineId);

    const schedulePersist = useCallback((snapshot: Pipeline[]) => {
        if (!clientId || !persistEnabled.current) return;
        setSaveError(null);
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(async () => {
            persistTimer.current = null;
            try {
                setSaving(true);
                const saved = await syncPipelines(clientId, snapshot);
                setPipelines(saved.map(dtoToPipeline));
                setActivePipelineId((prev) => {
                    if (saved.some((p) => p.id === prev)) return prev;
                    return saved[0]?.id || '';
                });
            } catch (e: unknown) {
                setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
            } finally {
                setSaving(false);
            }
        }, 700);
    }, [clientId]);

    useEffect(() => {
        persistEnabled.current = false;
        if (!clientId) {
            setPipelines([]);
            setActivePipelineId('');
            setLoadError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        void fetchPipelines(clientId)
            .then((rows) => {
                if (cancelled) return;
                const mapped = rows.map(dtoToPipeline);
                setPipelines(mapped);
                setActivePipelineId(mapped[0]?.id || '');
                queueMicrotask(() => {
                    persistEnabled.current = true;
                });
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setLoadError(e instanceof Error ? e.message : 'טעינה נכשלה');
                setPipelines([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, [clientId]);

    const updatePipelines = (next: Pipeline[]) => {
        setPipelines(next);
        schedulePersist(next);
    };

    const handleAddPipeline = async (name: string, description: string) => {
        if (!clientId) return;
        try {
            setSaving(true);
            setSaveError(null);
            const created = await createPipeline(clientId, { name, description });
            const mapped = dtoToPipeline(created);
            setPipelines((prev) => [...prev, mapped]);
            setActivePipelineId(mapped.id);
            setIsAddModalOpen(false);
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : 'יצירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const handleAddStage = () => {
        if (!activePipeline) return;
        const newStage: Stage = {
            id: `tmp-${Date.now()}`,
            name: 'שלב חדש',
            color: 'bg-gray-100 text-gray-700',
            order: activePipeline.stages.length + 1,
            slaLimit: 3,
        };
        const updatedPipeline = {
            ...activePipeline,
            stages: [...activePipeline.stages, newStage],
        };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
        setTimeout(() => {
            if (stagesContainerRef.current) {
                stagesContainerRef.current.scrollTop = stagesContainerRef.current.scrollHeight;
            }
        }, 100);
    };

    const handleUpdateStage = (stageId: string, field: keyof Stage, value: unknown) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map(s => s.id === stageId ? { ...s, [field]: value } : s),
        };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
    };

    const handleDeleteStage = (stageId: string) => {
        if (!activePipeline) return;
        if (!window.confirm('האם למחוק שלב זה?')) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages
                .filter(s => s.id !== stageId)
                .map((s, i) => ({ ...s, order: i + 1 })),
        };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
    };

    const handleDeletePipeline = () => {
        if (!activePipeline) return;
        if (!window.confirm(`למחוק את התהליך "${activePipeline.name}" ואת כל שלביו?`)) return;
        const next = pipelines.filter(p => p.id !== activePipelineId);
        setActivePipelineId(next[0]?.id || '');
        updatePipelines(next);
    };

    const handleDragStart = (e: React.DragEvent, position: number) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent, position: number) => {
        dragOverItem.current = position;
        e.preventDefault();
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
        const reorderedStages = newStages.map((s, i) => ({ ...s, order: i + 1 }));
        const updatedPipeline = { ...activePipeline, stages: reorderedStages };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
        dragItem.current = null;
        dragOverItem.current = null;
    };

    if (!clientId) {
        return (
            <div className="p-8 text-center text-text-muted">
                יש להתחבר כמשתמש לקוח כדי לנהל תהליכים.
            </div>
        );
    }

    if (loading) {
        return <div className="p-8 text-center text-text-muted">טוען תהליכים…</div>;
    }

    if (loadError) {
        return <div className="p-8 text-center text-red-600">{loadError}</div>;
    }

    return (
        <div className="h-full flex flex-col md:flex-row gap-6 animate-fade-in pb-10">
            <style>{`.ghost { opacity: 0.5; background: #f3f4f6; }`}</style>

            <div className="w-full md:w-1/4 flex flex-col gap-4">
                <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm h-full">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <h2 className="text-lg font-bold text-text-default">תהליכים</h2>
                        <button
                            type="button"
                            onClick={() => setIsAddModalOpen(true)}
                            className="text-primary-600 hover:bg-primary-50 p-1.5 rounded-lg transition-colors"
                            title="הוסף תהליך חדש"
                        >
                            <PlusIcon className="w-5 h-5"/>
                        </button>
                    </div>

                    <div className="space-y-2">
                        {pipelines.map((pipeline, idx) => (
                            <button
                                key={pipeline.id}
                                type="button"
                                onClick={() => setActivePipelineId(pipeline.id)}
                                className={`w-full text-right p-4 rounded-xl border transition-all flex items-center justify-between group ${
                                    activePipelineId === pipeline.id
                                    ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-200'
                                    : 'bg-white border-border-default hover:border-primary-200 hover:shadow-sm'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${activePipelineId === pipeline.id ? 'bg-white text-primary-600' : 'bg-bg-subtle text-text-muted'}`}>
                                        {idx === 0 ? <BriefcaseIcon className="w-5 h-5"/> : <UserGroupIcon className="w-5 h-5"/>}
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
                        {!pipelines.length && (
                            <p className="text-sm text-text-muted px-1">אין תהליכים עדיין.</p>
                        )}
                    </div>
                    {(saving || saveError) && (
                        <p className={`text-xs mt-3 px-1 ${saveError ? 'text-red-600' : 'text-text-muted'}`}>
                            {saveError || 'שומר…'}
                        </p>
                    )}
                </div>
            </div>

            <div className="w-full md:w-3/4 flex flex-col gap-4">
                <div className="bg-bg-card rounded-2xl border border-border-default p-6 shadow-sm flex flex-col h-full">
                {activePipeline ? (
                    <>
                        <header className="mb-6 flex justify-between items-end border-b border-border-default pb-4 gap-3">
                            <div>
                                <h2 className="text-2xl font-black text-text-default">{activePipeline.name}</h2>
                                <p className="text-sm text-text-muted mt-1">{activePipeline.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDeletePipeline}
                                    className="p-2 text-text-subtle hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                    title="מחק תהליך"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddStage}
                                    className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-5 rounded-xl hover:bg-primary-700 transition shadow-md"
                                >
                                    <PlusIcon className="w-5 h-5" />
                                    <span>הוסף שלב</span>
                                </button>
                            </div>
                        </header>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" ref={stagesContainerRef}>
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
                                        <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-text-subtle hover:text-primary-600">
                                            <Bars3Icon className="w-5 h-5"/>
                                        </div>

                                        <div>
                                            <input
                                                type="text"
                                                value={stage.name}
                                                onChange={(e) => handleUpdateStage(stage.id, 'name', e.target.value)}
                                                className={`w-full text-sm font-bold bg-transparent border-b-2 border-transparent focus:border-primary-500 outline-none px-1 py-0.5 rounded transition-colors ${stage.color.split(' ')[1] || ''}`}
                                                placeholder="שם השלב"
                                            />
                                        </div>

                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                                            {availableColors.map(c => {
                                                const bgClass = c.value.split(' ')[0];
                                                const isSelected = stage.color === c.value;
                                                return (
                                                    <button
                                                        key={c.label}
                                                        type="button"
                                                        onClick={() => handleUpdateStage(stage.id, 'color', c.value)}
                                                        className={`w-6 h-6 rounded-full flex-shrink-0 transition-all border-2 ${bgClass} ${isSelected ? 'border-primary-600 scale-110 ring-1 ring-offset-1 ring-primary-300' : 'border-transparent hover:scale-105'}`}
                                                        title={c.label}
                                                    >
                                                        {isSelected && <CheckCircleIcon className="w-full h-full text-primary-700 p-0.5"/>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="flex items-center gap-2 bg-bg-subtle/50 px-2 py-1 rounded-lg border border-border-default max-w-[100px]">
                                            <ClockIcon className="w-4 h-4 text-text-subtle" />
                                            <input
                                                type="number"
                                                min="0"
                                                value={stage.slaLimit}
                                                onChange={(e) => handleUpdateStage(stage.id, 'slaLimit', parseInt(e.target.value, 10) || 0)}
                                                className="w-full bg-transparent text-sm font-semibold text-center outline-none"
                                                title="התראה לאחר X ימים ללא שינוי"
                                            />
                                        </div>

                                        <div className="flex items-center justify-center">
                                            <button
                                                type="button"
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
                                 הגדרת "SLA" תצבע פריטים בלוח באדום כאשר הם חורגים מהזמן המוגדר.
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
                saving={saving}
            />
        </div>
    );
};

export default PipelineSettingsView;
