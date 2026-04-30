import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PlusIcon, TrashIcon, Bars3Icon, InformationCircleIcon } from './Icons';
import AccordionSection from './AccordionSection';
import DevAnnotation from './DevAnnotation';
import { useAuth } from '../context/AuthContext';
import {
    fetchRecruitmentStatuses,
    syncRecruitmentStatuses,
    type RecruitmentStatusDto,
} from '../services/recruitmentStatusesApi';

interface SystemStatus {
    id: string;
    isActive: boolean;
    group: string;
    name: string;
    textColor: string;
    isEditing?: boolean;
}

const statusGroups = ['בתהליך', 'התקבל', 'נדחה', 'הקפאה/אחר'];

const getDefaultColor = (group: string): string => {
    switch (group) {
        case 'התקבל':
            return '#22c55e';
        case 'נדחה':
        case 'הקפאה/אחר':
            return '#ef4444';
        case 'בתהליך':
        default:
            return '#000000';
    }
};

function dtoToRow(d: RecruitmentStatusDto, preserveEditing?: boolean): SystemStatus {
    return {
        id: d.id,
        isActive: d.isActive,
        group: d.group,
        name: d.name,
        textColor: d.textColor,
        isEditing: preserveEditing ?? false,
    };
}

function mergeSavedWithLocalOrder(saved: RecruitmentStatusDto[], localBefore: SystemStatus[]): SystemStatus[] {
    return saved.map((d, i) => ({
        ...dtoToRow(d),
        isEditing: localBefore[i]?.isEditing ?? false,
    }));
}

const StatusSettingsView: React.FC = () => {
    const { user } = useAuth();
    const clientId = user?.clientId ?? null;

    const [statuses, setStatuses] = useState<SystemStatus[]>([]);
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
    const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const persistEnabled = useRef(false);
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const canSync = useCallback((list: SystemStatus[]) => {
        if (!list.length) return true;
        return list.every((s) => s.name.trim() !== '');
    }, []);

    const schedulePersist = useCallback(
        (snapshot: SystemStatus[]) => {
            if (!clientId || !persistEnabled.current) return;
            if (!canSync(snapshot)) return;
            setSaveError(null);
            if (persistTimer.current) clearTimeout(persistTimer.current);
            persistTimer.current = setTimeout(async () => {
                persistTimer.current = null;
                try {
                    setSaving(true);
                    const payload: Omit<RecruitmentStatusDto, 'sortIndex'>[] = snapshot.map((s) => ({
                        id: s.id,
                        group: s.group,
                        name: s.name.trim(),
                        textColor: s.textColor,
                        isActive: s.isActive,
                    }));
                    const saved = await syncRecruitmentStatuses(clientId, payload);
                    setStatuses(mergeSavedWithLocalOrder(saved, snapshot));
                } catch (e: unknown) {
                    setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
                } finally {
                    setSaving(false);
                }
            }, 700);
        },
        [clientId, canSync],
    );

    useEffect(() => {
        persistEnabled.current = false;
        if (!clientId) {
            setStatuses([]);
            setLoadError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        void fetchRecruitmentStatuses(clientId)
            .then((rows) => {
                if (cancelled) return;
                setStatuses(rows.map((r) => dtoToRow(r)));
                queueMicrotask(() => {
                    persistEnabled.current = true;
                });
            })
            .catch((e: unknown) => {
                if (!cancelled) setLoadError(e instanceof Error ? e.message : 'טעינה נכשלה');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    useEffect(
        () => () => {
            if (persistTimer.current) clearTimeout(persistTimer.current);
        },
        [],
    );

    const handleAddStatus = () => {
        const newStatus: SystemStatus = {
            id: `temp_${Date.now()}`,
            isActive: true,
            group: 'בתהליך',
            name: '',
            textColor: '#000000',
            isEditing: true,
        };
        setStatuses((prev) => {
            const next = [newStatus, ...prev];
            schedulePersist(next);
            return next;
        });
    };

    const handleToggleActive = (id: string) => {
        setStatuses((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s));
            schedulePersist(next);
            return next;
        });
    };

    const handleGroupChange = (id: string, newGroup: string) => {
        setStatuses((prev) => {
            const next = prev.map((s) =>
                s.id === id ? { ...s, group: newGroup, textColor: getDefaultColor(newGroup) } : s,
            );
            schedulePersist(next);
            return next;
        });
    };

    const handleNameChange = (id: string, newName: string) => {
        setStatuses((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, name: newName } : s));
            schedulePersist(next);
            return next;
        });
    };

    const handleColorChange = (id: string, newColor: string) => {
        setStatuses((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, textColor: newColor } : s));
            schedulePersist(next);
            return next;
        });
    };

    const handleEditToggle = (id: string) => {
        setStatuses((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, isEditing: !s.isEditing } : s));
            schedulePersist(next);
            return next;
        });
    };

    const handleDelete = (id: string) => {
        if (
            window.confirm(
                'האם למחוק סטטוס זה לחלוטין? מחיקת סטטוס עלולה לפגוע במועמדים המקושרים אליו.',
            )
        ) {
            setStatuses((prev) => {
                const next = prev.filter((s) => s.id !== id);
                schedulePersist(next);
                return next;
            });
        }
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent, index: number) => {
        setDragOverItemIndex(index);
        e.preventDefault();
    };

    const handleDragEnd = () => {
        if (draggedItemIndex !== null && dragOverItemIndex !== null) {
            setStatuses((prev) => {
                const newStatuses = [...prev];
                const draggedItem = newStatuses[draggedItemIndex];
                newStatuses.splice(draggedItemIndex, 1);
                newStatuses.splice(dragOverItemIndex, 0, draggedItem);
                schedulePersist(newStatuses);
                return newStatuses;
            });
        }
        setDraggedItemIndex(null);
        setDragOverItemIndex(null);
    };

    if (!clientId) {
        return (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 text-sm">
                יש להתחבר עם משתמש משויך לחברה כדי לערוך סטטוסים.
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-6 animate-fade-in pb-10">
            <header className="flex flex-wrap justify-between items-center gap-4 bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-text-default">עריכת סטטוסים</h2>
                    <p className="text-sm text-text-muted mt-1">
                        ניהול והגדרת סטטוסי המועמדים בחברה (מחליף את תהליכי העבודה פר משרה).
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {saving && <span className="text-xs font-semibold text-text-muted">שומר…</span>}
                    {(loadError || saveError) && (
                        <span className="text-xs font-semibold text-red-600">{loadError || saveError}</span>
                    )}
                    <button
                        type="button"
                        onClick={handleAddStatus}
                        className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-5 rounded-xl hover:bg-primary-700 transition shadow-md"
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span>סטטוס חדש</span>
                    </button>
                </div>
            </header>

            {loading && (
                <div className="text-sm text-text-muted px-2" role="status">
                    טוען סטטוסים…
                </div>
            )}

            <AccordionSection title="הוראות שימוש" icon={<InformationCircleIcon className="w-5 h-5" />} defaultOpen>
                <div className="text-sm text-amber-800 space-y-2 bg-amber-50 p-5 rounded-lg border border-amber-200 leading-relaxed font-medium">
                    <p>
                        <strong>נא לשים לב!</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 mt-2">
                        <li>שינוי שם של סטטוס ישתנה רטרואקטיבית אצל כל המועמדים שנמצאים או היו בסטטוס הזה לשם החדש.</li>
                        <li>ממשק זה מאפשר לך לערוך סדר, שיוך ושמות סטטוסים.</li>
                        <li>בטרם שינוי סטטוס, מומלץ לבדוק אם יש מועמדים קיימים שהסטטוס ישפיע עליהם.</li>
                        <li>
                            כדי לשנות את הסדר של הסטטוסים במסכים השונים, יש לגרור את השורה באמצעות סמל הגרירה מימין לשורה.
                            סדר הרשימה פה קובע את הסדר במערכת.
                        </li>
                        <li className="list-none -mr-4 mt-2 text-amber-900">
                            השינויים נשמרים אוטומטית בשרת (מקוצרים) כשכל השורות כוללות שם סטטוס תקין.
                        </li>
                    </ul>
                </div>
            </AccordionSection>

            <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default overflow-hidden">
                <div className="grid grid-cols-[40px_auto_60px_minmax(150px,200px)_minmax(250px,3fr)_120px] gap-4 bg-bg-subtle p-4 border-b border-border-default text-sm font-bold text-text-muted items-center">
                    <div className="text-center">גרור</div>
                    <div className="text-center">פעיל</div>
                    <div className="text-center">צבע</div>
                    <div>קבוצת סטטוסים</div>
                    <div>שם הסטטוס</div>
                    <div className="text-center">פעולות</div>
                </div>

                <div className="divide-y divide-border-subtle custom-scrollbar max-h-[60vh] overflow-y-auto">
                    {statuses.length === 0 && !loading ? (
                        <div className="p-8 text-center text-text-muted">
                            אין סטטוסים מוגדרים. לחץ על &apos;סטטוס חדש&apos; ליצירה.
                        </div>
                    ) : (
                        statuses.map((status, index) => (
                            <div
                                key={status.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                className={`grid grid-cols-[40px_auto_60px_minmax(150px,200px)_minmax(250px,3fr)_120px] gap-4 p-4 items-center transition-colors bg-white hover:bg-bg-hover group ${
                                    dragOverItemIndex === index ? 'border-t-2 border-primary-500 bg-primary-50/20' : ''
                                } ${status.isEditing ? 'bg-blue-50/50' : ''}`}
                            >
                                <div className="flex justify-center flex-shrink-0">
                                    <div className="cursor-grab active:cursor-grabbing p-2 text-text-subtle hover:text-primary-600 transition-colors">
                                        <Bars3Icon className="w-5 h-5" />
                                    </div>
                                </div>

                                <div className="flex justify-center w-full">
                                    <input
                                        type="checkbox"
                                        checked={status.isActive}
                                        onChange={() => handleToggleActive(status.id)}
                                        className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 border-border-default cursor-pointer"
                                    />
                                </div>

                                <div className="flex justify-center w-full">
                                    <input
                                        type="color"
                                        value={status.textColor || '#000000'}
                                        onChange={(e) => handleColorChange(status.id, e.target.value)}
                                        disabled={!status.isEditing}
                                        className={`w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0 ${
                                            !status.isEditing ? 'opacity-70 pointer-events-none' : ''
                                        }`}
                                        title="בחר צבע טקסט"
                                    />
                                </div>

                                <div>
                                    {status.isEditing ? (
                                        <select
                                            value={status.group}
                                            onChange={(e) => handleGroupChange(status.id, e.target.value)}
                                            className="w-full border border-border-default rounded-lg p-2 text-sm bg-bg-input focus:ring-2 focus:ring-primary-500 outline-none"
                                        >
                                            {statusGroups.map((g) => (
                                                <option key={g} value={g}>
                                                    {g}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="text-sm px-2.5 py-1 bg-bg-subtle rounded-md border border-border-default text-text-default">
                                            {status.group}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    {status.isEditing ? (
                                        <input
                                            type="text"
                                            value={status.name}
                                            onChange={(e) => handleNameChange(status.id, e.target.value)}
                                            className="w-full border border-primary-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none shadow-sm"
                                            placeholder="הכנס שם סטטוס..."
                                            autoFocus
                                        />
                                    ) : (
                                        <span
                                            className={`text-sm font-semibold ${
                                                status.isActive ? '' : 'text-text-muted line-through opacity-70'
                                            }`}
                                            style={{ color: status.isActive ? status.textColor : undefined }}
                                        >
                                            {status.name}
                                        </span>
                                    )}
                                </div>

                                <div className="flex justify-center gap-2">
                                    {status.isEditing ? (
                                        <button
                                            type="button"
                                            onClick={() => handleEditToggle(status.id)}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors shadow-sm"
                                        >
                                            שמור
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleEditToggle(status.id)}
                                                className="px-3 py-1.5 text-xs font-semibold text-text-subtle border border-border-default bg-white hover:bg-bg-subtle rounded-lg transition-colors shadow-sm"
                                            >
                                                עריכה
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(status.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                                title="מחק"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <DevAnnotation
                title="מודול עריכת סטטוסים"
                description="המודול עריכת סטטוסים החדש מחליף את תהליכי העבודה (Pipeline) הרבים ומאפשר גרירה לסידור, כיבוי/הדלקת סטטוסים קיימים ללא עמודות האוטומציה שנדרשו. נתונים נשמרים בשרת לפי חברה."
            />
        </div>
    );
};

export default StatusSettingsView;
