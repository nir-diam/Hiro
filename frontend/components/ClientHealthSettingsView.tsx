import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, UserGroupIcon,
    PlusIcon, TrashIcon, BriefcaseIcon, BuildingOffice2Icon, ChartBarIcon, Bars3Icon,
    ChevronDownIcon,
} from './Icons';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import {
    fetchClientHealthRules,
    syncClientHealthRules,
    cloneHealthRulesForCopy,
    type ClientHealthRuleDto,
    type HealthColor,
    type HealthConditionType,
    type HealthOperator,
} from '../services/clientHealthRulesApi';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';

type HealthRule = ClientHealthRuleDto;

type ConditionType = HealthConditionType;
type Operator = HealthOperator;

const colorConfig: Record<HealthColor, { label: string; bg: string; text: string; ring: string }> = {
    red: { label: 'אדום (קריטי)', bg: 'bg-red-100', text: 'text-red-800', ring: 'ring-red-500' },
    orange: { label: 'כתום (דחיפות גבוהה)', bg: 'bg-orange-100', text: 'text-orange-800', ring: 'ring-orange-500' },
    yellow: { label: 'צהוב (אזהרה)', bg: 'bg-yellow-100', text: 'text-yellow-800', ring: 'ring-yellow-500' },
    green: { label: 'ירוק (תקין)', bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-500' },
    blue: { label: 'כחול (אינפורמטיבי)', bg: 'bg-blue-100', text: 'text-blue-800', ring: 'ring-blue-500' },
    purple: { label: 'סגול (חריג זמן)', bg: 'bg-purple-100', text: 'text-purple-800', ring: 'ring-purple-500' },
    gray: { label: 'אפור', bg: 'bg-gray-100', text: 'text-gray-800', ring: 'ring-gray-500' },
};

const conditionOptions: { value: ConditionType; label: string; unit: string; icon: React.ReactNode; isBoolean?: boolean }[] = [
    { value: 'days_since_contact', label: 'ימים ללא קשר (טלפון/מייל)', unit: 'ימים', icon: <ClockIcon className="w-4 h-4"/> },
    { value: 'open_opportunities', label: 'כמות משרות פתוחות', unit: 'משרות', icon: <BriefcaseIcon className="w-4 h-4"/> },
    { value: 'active_placements', label: 'כמות השמות פעילות', unit: 'השמות', icon: <UserGroupIcon className="w-4 h-4"/> },
    { value: 'no_future_activity', label: 'אין פעילות עתידית מתוכננת', unit: '', icon: <ExclamationTriangleIcon className="w-4 h-4"/>, isBoolean: true },
];

type ScopeOption = { id: string; name: string };

/** Sentinel for client-level default rules (organizationId = null in API). */
const DEFAULT_SCOPE_ID = '__default__';

function isPlatformAdminUser(user: { role?: string; clientId?: string | null } | null | undefined): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'admin' && !user.clientId) return true;
    return false;
}

function resolveOrganizationId(scopeId: string): string | null {
    if (!scopeId || scopeId === DEFAULT_SCOPE_ID) return null;
    return scopeId;
}

const RuleRow: React.FC<{
    rule: HealthRule;
    isDragging: boolean;
    onChange: (id: string, updates: Partial<HealthRule>) => void;
    onDelete: (id: string) => void;
    onHandlePointerDown: (e: React.PointerEvent, id: string) => void;
    onHandlePointerMove: (e: React.PointerEvent) => void;
    onHandlePointerUp: (e: React.PointerEvent) => void;
}> = ({
    rule,
    isDragging,
    onChange,
    onDelete,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
}) => {
    const currentCondition = conditionOptions.find(c => c.value === rule.condition);

    return (
        <div
            data-rule-id={rule.id}
            className={`flex flex-col lg:flex-row items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${
                isDragging
                    ? 'opacity-60 border-primary-500 ring-2 ring-primary-300 shadow-lg scale-[1.01] z-10 relative bg-bg-card'
                    : rule.enabled
                      ? 'bg-bg-card border-border-default shadow-sm hover:border-primary-300'
                      : 'bg-bg-subtle/50 border-border-default opacity-60'
            }`}
        >
            <button
                type="button"
                className="flex items-center justify-center cursor-grab active:cursor-grabbing text-text-subtle hover:text-primary-600 shrink-0 p-1.5 rounded-lg hover:bg-bg-hover touch-none select-none"
                title="גרור לשינוי סדר"
                aria-label="גרור לשינוי סדר"
                onPointerDown={(e) => onHandlePointerDown(e, rule.id)}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
            >
                <Bars3Icon className="w-5 h-5 pointer-events-none" />
            </button>
            <div className="flex items-center gap-3 w-full lg:w-auto min-w-[180px]">
                <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => onChange(rule.id, { enabled: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <div className="relative group w-full">
                    <button type="button" className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-transparent text-sm font-medium transition-colors ${colorConfig[rule.color].bg} ${colorConfig[rule.color].text}`}>
                        <span className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${colorConfig[rule.color].text.replace('text-', 'bg-')}`}></div>
                            {colorConfig[rule.color].label}
                        </span>
                    </button>
                    <select
                        value={rule.color}
                        onChange={(e) => onChange(rule.id, { color: e.target.value as HealthColor })}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    >
                        {Object.keys(colorConfig).map(c => (
                            <option key={c} value={c}>{colorConfig[c as HealthColor].label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 w-full items-center bg-bg-subtle/30 p-2 rounded-lg border border-border-subtle/50">
                <div className="relative">
                    <select
                        value={rule.condition}
                        onChange={(e) => {
                            const next = e.target.value as ConditionType;
                            const isBool = conditionOptions.find(o => o.value === next)?.isBoolean;
                            onChange(rule.id, {
                                condition: next,
                                ...(isBool ? { operator: 'is_true' as Operator, value: 0 } : {}),
                            });
                        }}
                        className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2 pl-9 appearance-none focus:ring-1 focus:ring-primary-500"
                    >
                        {conditionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none">
                        {currentCondition?.icon}
                    </div>
                </div>

                {currentCondition?.isBoolean ? (
                     <div className="md:col-span-2 text-sm text-text-muted px-2">מתקיים (אמת)</div>
                ) : (
                    <>
                        <select
                            value={rule.operator}
                            onChange={(e) => onChange(rule.id, { operator: e.target.value as Operator })}
                            className="bg-bg-input border border-border-default text-sm rounded-md p-2"
                        >
                            <option value="gt">גדול מ-</option>
                            <option value="lt">קטן מ-</option>
                            <option value="eq">שווה ל-</option>
                        </select>

                        <div className="flex items-center gap-2 min-w-[120px]">
                            <input
                                type="number"
                                value={rule.value}
                                onChange={(e) => onChange(rule.id, { value: parseInt(e.target.value) || 0 })}
                                className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2 text-center font-bold focus:ring-1 focus:ring-primary-500"
                            />
                            <span className="text-xs font-semibold text-text-muted whitespace-nowrap bg-bg-subtle px-1.5 py-0.5 rounded">{currentCondition?.unit}</span>
                        </div>
                    </>
                )}
            </div>

            <button type="button" onClick={() => onDelete(rule.id)} className="p-2 text-text-subtle hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="מחק חוק">
                <TrashIcon className="w-5 h-5" />
            </button>
        </div>
    );
};

function mapLinkedOrgOption(raw: Record<string, unknown>): ScopeOption | null {
    const organizationId = raw.organizationId ? String(raw.organizationId) : '';
    if (!organizationId) return null;
    const source = (raw.organization || raw.organizationTmp || {}) as Record<string, unknown>;
    const name = String(source.name || 'ארגון');
    return { id: organizationId, name };
}

const ClientHealthSettingsView: React.FC = () => {
    const { user, ready: authReady } = useAuth();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const isPlatformAdmin = isPlatformAdminUser(user);
    const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;

    const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
    const [selectedScopeId, setSelectedScopeId] = useState('');
    const [pipelines, setPipelines] = useState<PipelineDto[]>([]);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
    const [rules, setRules] = useState<HealthRule[]>([]);
    const [baselineRules, setBaselineRules] = useState<HealthRule[]>([]);
    const [loadingScopes, setLoadingScopes] = useState(false);
    const [loadingPipelines, setLoadingPipelines] = useState(false);
    const [loadingRules, setLoadingRules] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const draggingIdRef = useRef<string | null>(null);
    const [pipelineRuleCounts, setPipelineRuleCounts] = useState<Record<string, number>>({});
    const [orgSearchQuery, setOrgSearchQuery] = useState('');
    const [selectedBulkOrgIds, setSelectedBulkOrgIds] = useState<Set<string>>(() => new Set());
    const [bulkSourceScopeId, setBulkSourceScopeId] = useState(DEFAULT_SCOPE_ID);
    const [bulkApplying, setBulkApplying] = useState(false);
    const [orgPickerOpen, setOrgPickerOpen] = useState(false);
    const orgPickerRef = useRef<HTMLDivElement>(null);

    /** Admin: selected client id. Tenant: organization or default sentinel. */
    const effectiveScopeId = selectedScopeId || (!isPlatformAdmin ? DEFAULT_SCOPE_ID : '');
    const activeClientId = isPlatformAdmin ? selectedScopeId : tenantClientId;
    /** Tenant: selected organization id, or null for client defaults. Admin: null (client-level). */
    const activeOrganizationId = isPlatformAdmin ? null : resolveOrganizationId(effectiveScopeId);
    const isDefaultScope = !isPlatformAdmin && effectiveScopeId === DEFAULT_SCOPE_ID;
    const activePipeline = pipelines.find((p) => p.id === selectedPipelineId) || null;

    useEffect(() => {
        if (!authReady || !apiBase) return;
        let active = true;
        setLoadingScopes(true);
        setError(null);

        const load = async () => {
            try {
                if (isPlatformAdmin) {
                    const res = await fetch(`${apiBase}/api/clients`, { headers: authHeaders(true) });
                    if (!res.ok) throw new Error('טעינת לקוחות נכשלה');
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.data ?? []);
                    if (!active) return;
                    const opts: ScopeOption[] = list.map((c: { id?: string; displayName?: string; name?: string }) => ({
                        id: String(c.id),
                        name: String(c.displayName || c.name || 'לקוח'),
                    })).filter((o: ScopeOption) => o.id);
                    setScopeOptions(opts);
                    setSelectedScopeId((prev) => {
                        if (prev && prev !== DEFAULT_SCOPE_ID && opts.some((o) => o.id === prev)) return prev;
                        return opts[0]?.id || '';
                    });
                } else if (tenantClientId) {
                    const res = await fetch(
                        `${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/linked-organizations`,
                        { headers: authHeaders(true) },
                    );
                    if (!res.ok) throw new Error('טעינת ארגונים מקושרים נכשלה');
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : [];
                    if (!active) return;
                    const opts = list
                        .map((row: Record<string, unknown>) => mapLinkedOrgOption(row))
                        .filter((o: ScopeOption | null): o is ScopeOption => Boolean(o));
                    setScopeOptions(opts);
                    setSelectedScopeId((prev) => {
                        if (prev === DEFAULT_SCOPE_ID) return prev;
                        if (prev && opts.some((o) => o.id === prev)) return prev;
                        return DEFAULT_SCOPE_ID;
                    });
                } else {
                    setScopeOptions([]);
                    setSelectedScopeId('');
                }
            } catch (e: any) {
                if (active) setError(e?.message || 'טעינת הרשימה נכשלה');
            } finally {
                if (active) setLoadingScopes(false);
            }
        };

        void load();
        return () => { active = false; };
    }, [authReady, apiBase, isPlatformAdmin, tenantClientId]);

    useEffect(() => {
        if (!activeClientId) {
            setPipelines([]);
            setSelectedPipelineId('');
            return;
        }
        let active = true;
        setLoadingPipelines(true);
        void fetchPipelines(activeClientId)
            .then((rows) => {
                if (!active) return;
                setPipelines(rows);
                setSelectedPipelineId((prev) => {
                    if (prev && rows.some((p) => p.id === prev)) return prev;
                    return rows[0]?.id || '';
                });
            })
            .catch((e: any) => {
                if (!active) return;
                setPipelines([]);
                setSelectedPipelineId('');
                setError(e?.message || 'טעינת תהליכים נכשלה');
            })
            .finally(() => {
                if (active) setLoadingPipelines(false);
            });
        return () => { active = false; };
    }, [activeClientId]);

    const loadRules = useCallback(async () => {
        if (!activeClientId || !selectedPipelineId) {
            setRules([]);
            setBaselineRules([]);
            return;
        }
        if (!isPlatformAdmin && !effectiveScopeId) {
            setRules([]);
            setBaselineRules([]);
            return;
        }
        setLoadingRules(true);
        setError(null);
        setSaveMessage(null);
        try {
            const rows = await fetchClientHealthRules(
                activeClientId,
                activeOrganizationId,
                selectedPipelineId,
            );
            setRules(rows);
            setBaselineRules(rows);
        } catch (e: any) {
            setError(e?.message || 'טעינת חוקי דופק נכשלה');
            setRules([]);
            setBaselineRules([]);
        } finally {
            setLoadingRules(false);
        }
    }, [activeClientId, activeOrganizationId, selectedPipelineId, isPlatformAdmin, selectedScopeId]);

    useEffect(() => {
        void loadRules();
    }, [loadRules]);

    useEffect(() => {
        if (!activeClientId || !isDefaultScope || pipelines.length === 0) {
            setPipelineRuleCounts({});
            return;
        }
        let active = true;
        void Promise.all(
            pipelines.map(async (pipeline) => {
                try {
                    const rows = await fetchClientHealthRules(activeClientId, null, pipeline.id);
                    return [pipeline.id, rows.length] as const;
                } catch {
                    return [pipeline.id, 0] as const;
                }
            }),
        ).then((entries) => {
            if (!active) return;
            setPipelineRuleCounts(Object.fromEntries(entries));
        });
        return () => { active = false; };
    }, [activeClientId, isDefaultScope, pipelines, baselineRules]);

    useEffect(() => {
        if (!orgPickerOpen) return;
        const onDocClick = (e: MouseEvent) => {
            if (orgPickerRef.current && !orgPickerRef.current.contains(e.target as Node)) {
                setOrgPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [orgPickerOpen]);

    const handleAddRule = () => {
        const newRule: HealthRule = {
            id: (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : `tmp-${Date.now()}`,
            color: 'gray',
            condition: 'days_since_contact',
            operator: 'gt',
            value: 7,
            enabled: true,
            pipelineId: selectedPipelineId || null,
        };
        setRules(prev => [...prev, newRule]);
        setSaveMessage(null);
    };

    const handleUpdateRule = (id: string, updates: Partial<HealthRule>) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
        setSaveMessage(null);
    };

    const handleDeleteRule = (id: string) => {
        setRules(prev => prev.filter(r => r.id !== id));
        setSaveMessage(null);
    };

    const handleRulePointerDown = (e: React.PointerEvent, id: string) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        draggingIdRef.current = id;
        setDraggingId(id);
        try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
    };

    const handleRulePointerMove = (e: React.PointerEvent) => {
        const id = draggingIdRef.current;
        if (!id) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const row = el?.closest('[data-rule-id]') as HTMLElement | null;
        const overId = row?.dataset?.ruleId;
        if (!overId || overId === id) return;

        setRules((prev) => {
            const from = prev.findIndex((r) => r.id === id);
            const to = prev.findIndex((r) => r.id === overId);
            if (from < 0 || to < 0 || from === to) return prev;
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
        setSaveMessage(null);
    };

    const handleRulePointerUp = (e: React.PointerEvent) => {
        if (!draggingIdRef.current) return;
        draggingIdRef.current = null;
        setDraggingId(null);
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
    };

    const handleCancel = () => {
        setRules(baselineRules);
        setSaveMessage(null);
        setError(null);
    };

    const filteredScopeOptions = scopeOptions.filter((o) => {
        const q = orgSearchQuery.trim().toLowerCase();
        if (!q) return true;
        return o.name.toLowerCase().includes(q);
    });

    const defaultHasUnsavedChanges = isDefaultScope
        && JSON.stringify(rules) !== JSON.stringify(baselineRules);

    const toggleBulkOrg = (orgId: string) => {
        setSelectedBulkOrgIds((prev) => {
            const next = new Set(prev);
            if (next.has(orgId)) next.delete(orgId);
            else next.add(orgId);
            return next;
        });
    };

    const toggleSelectAllBulk = () => {
        const visibleIds = filteredScopeOptions.map((o) => o.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedBulkOrgIds.has(id));
        setSelectedBulkOrgIds((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                visibleIds.forEach((id) => next.delete(id));
            } else {
                visibleIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const bulkSourceLabel = bulkSourceScopeId === DEFAULT_SCOPE_ID
        ? 'ברירת מחדל'
        : (scopeOptions.find((o) => o.id === bulkSourceScopeId)?.name || 'ארגון');

    const activeScopeLabel = effectiveScopeId === DEFAULT_SCOPE_ID
        ? 'ברירת מחדל'
        : (scopeOptions.find((o) => o.id === effectiveScopeId)?.name || 'ארגון');

    const selectScopeForEdit = (scopeId: string) => {
        setSelectedScopeId(scopeId);
        setOrgPickerOpen(false);
    };

    const handleBulkApplyTemplate = async () => {
        if (!activeClientId || !selectedPipelineId || selectedBulkOrgIds.size === 0) return;

        const sourceOrgId = resolveOrganizationId(bulkSourceScopeId);
        const useUnsavedDefault = bulkSourceScopeId === DEFAULT_SCOPE_ID
            && isDefaultScope
            && defaultHasUnsavedChanges;

        if (useUnsavedDefault) {
            const ok = window.confirm(
                'לתבנית ברירת המחדל יש שינויים שלא נשמרו. להחיל את השינויים הנוכחיים (ללא שמירה) על הארגונים הנבחרים?',
            );
            if (!ok) return;
        }

        const targetCount = selectedBulkOrgIds.size;
        const ok = window.confirm(
            `להחיל את תבנית "${bulkSourceLabel}" (${activePipeline?.name || 'תהליך'}) על ${targetCount} ארגונים? פעולה זו תדרוס את החוקים הקיימים שלהם.`,
        );
        if (!ok) return;

        setBulkApplying(true);
        setError(null);
        setSaveMessage(null);
        try {
            let sourceRules: HealthRule[];
            if (useUnsavedDefault) {
                sourceRules = rules;
            } else {
                sourceRules = await fetchClientHealthRules(
                    activeClientId,
                    sourceOrgId,
                    selectedPipelineId,
                );
            }

            if (!sourceRules.length) {
                throw new Error('לתבנית המקור אין חוקים להחלה');
            }

            const targets = [...selectedBulkOrgIds];
            let applied = 0;
            for (const orgId of targets) {
                const cloned = cloneHealthRulesForCopy(sourceRules);
                await syncClientHealthRules(
                    activeClientId,
                    cloned,
                    orgId,
                    selectedPipelineId,
                );
                applied += 1;
            }

            setSaveMessage(`התבנית הוחלה בהצלחה על ${applied} ארגונים`);
            setSelectedBulkOrgIds(new Set());
        } catch (e: any) {
            setError(e?.message || 'החלת תבנית נכשלה');
        } finally {
            setBulkApplying(false);
        }
    };

    const handleSave = async () => {
        if (!activeClientId || !selectedPipelineId) return;
        if (!isPlatformAdmin && !effectiveScopeId) {
            setError('יש לבחור ארגון');
            return;
        }
        setSaving(true);
        setError(null);
        setSaveMessage(null);
        try {
            const saved = await syncClientHealthRules(
                activeClientId,
                rules,
                activeOrganizationId,
                selectedPipelineId,
            );
            setRules(saved);
            setBaselineRules(saved);
            setSaveMessage('החוקים נשמרו בהצלחה');
        } catch (e: any) {
            setError(e?.message || 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const scopeLabel = isPlatformAdmin ? 'לקוח' : 'ארגון';
    const canEdit = Boolean(
        activeClientId
        && selectedPipelineId
        && (isPlatformAdmin || effectiveScopeId),
    );

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-10">
            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary-100 p-2 rounded-lg text-primary-600"><CheckCircleIcon className="w-6 h-6"/></div>
                        <h2 className="text-2xl font-bold text-text-default">הגדרת מדדי דופק לקוח (Client Pulse)</h2>
                    </div>
                    <div className="relative min-w-[220px] max-w-full md:w-96 flex-1">
                        <label className="block text-xs font-bold text-text-muted mb-1.5">{scopeLabel}</label>
                        {isPlatformAdmin ? (
                            <div className="relative">
                                <BuildingOffice2Icon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select
                                    value={selectedScopeId || ''}
                                    onChange={(e) => setSelectedScopeId(e.target.value)}
                                    disabled={loadingScopes || scopeOptions.length === 0}
                                    className="w-full appearance-none bg-bg-input border border-border-default rounded-xl py-2.5 pr-10 pl-3 text-sm font-bold text-text-default focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-60"
                                >
                                    {loadingScopes ? (
                                        <option value="">טוען…</option>
                                    ) : scopeOptions.length === 0 ? (
                                        <option value="">אין לקוחות</option>
                                    ) : (
                                        scopeOptions.map((o) => (
                                            <option key={o.id} value={o.id}>{o.name}</option>
                                        ))
                                    )}
                                </select>
                            </div>
                        ) : (
                            <div className="relative" ref={orgPickerRef}>
                                <button
                                    type="button"
                                    onClick={() => setOrgPickerOpen((open) => !open)}
                                    disabled={loadingScopes || !tenantClientId}
                                    className="w-full flex items-center gap-2 bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm font-bold text-text-default focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-60 hover:border-primary-300 transition-colors"
                                    aria-expanded={orgPickerOpen}
                                    aria-haspopup="listbox"
                                >
                                    <BuildingOffice2Icon className="w-4 h-4 text-text-subtle shrink-0" />
                                    <span className="flex-1 text-right truncate">{activeScopeLabel}</span>
                                    {selectedBulkOrgIds.size > 0 ? (
                                        <span className="shrink-0 text-[10px] font-bold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-md">
                                            {selectedBulkOrgIds.size} נבחרו
                                        </span>
                                    ) : null}
                                    <ChevronDownIcon
                                        className={`w-4 h-4 text-text-subtle shrink-0 transition-transform duration-200 ${orgPickerOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {orgPickerOpen ? (
                                    <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border-default rounded-xl bg-bg-card shadow-xl overflow-hidden animate-fade-in">
                                        <button
                                            type="button"
                                            onClick={() => selectScopeForEdit(DEFAULT_SCOPE_ID)}
                                            disabled={loadingScopes || !tenantClientId}
                                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-right transition-colors border-b border-border-subtle ${
                                                effectiveScopeId === DEFAULT_SCOPE_ID
                                                    ? 'bg-primary-50 text-primary-700'
                                                    : 'hover:bg-bg-hover text-text-default'
                                            }`}
                                        >
                                            <BuildingOffice2Icon className="w-4 h-4 shrink-0" />
                                            <span className="flex-1">ברירת מחדל — עריכה</span>
                                            {effectiveScopeId === DEFAULT_SCOPE_ID ? (
                                                <span className="text-[10px] font-bold uppercase tracking-wide text-primary-600">פעיל</span>
                                            ) : null}
                                        </button>

                                        {scopeOptions.length > 0 ? (
                                            <>
                                                <div className="px-3 py-2 border-b border-border-subtle bg-bg-subtle/40 space-y-2">
                                                    <p className="text-[11px] font-bold text-text-muted">החלה מרובה — סמנו ארגונים</p>
                                                    <input
                                                        type="search"
                                                        value={orgSearchQuery}
                                                        onChange={(e) => setOrgSearchQuery(e.target.value)}
                                                        placeholder="חיפוש ארגון…"
                                                        className="w-full bg-bg-card border border-border-default rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                                                    />
                                                    <label className="flex items-center gap-2 text-xs font-bold text-text-default cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                filteredScopeOptions.length > 0
                                                                && filteredScopeOptions.every((o) => selectedBulkOrgIds.has(o.id))
                                                            }
                                                            onChange={toggleSelectAllBulk}
                                                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                        />
                                                        סמן הכל
                                                        {filteredScopeOptions.length !== scopeOptions.length ? (
                                                            <span className="text-text-subtle font-medium">
                                                                ({filteredScopeOptions.length} מוצגים)
                                                            </span>
                                                        ) : (
                                                            <span className="text-text-subtle font-medium">
                                                                ({scopeOptions.length})
                                                            </span>
                                                        )}
                                                    </label>
                                                </div>

                                                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-border-subtle">
                                                    {filteredScopeOptions.length === 0 ? (
                                                        <p className="px-3 py-4 text-xs text-text-muted text-center">לא נמצאו ארגונים</p>
                                                    ) : (
                                                        filteredScopeOptions.map((o) => {
                                                            const isEditing = effectiveScopeId === o.id;
                                                            const isBulkSelected = selectedBulkOrgIds.has(o.id);
                                                            return (
                                                                <div
                                                                    key={o.id}
                                                                    className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                                                        isEditing ? 'bg-primary-50/70' : 'hover:bg-bg-hover'
                                                                    }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isBulkSelected}
                                                                        onChange={() => toggleBulkOrg(o.id)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer shrink-0"
                                                                        aria-label={`בחר ${o.name} להחלת תבנית`}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => selectScopeForEdit(o.id)}
                                                                        className={`flex-1 text-right truncate font-medium ${
                                                                            isEditing ? 'text-primary-700 font-bold' : 'text-text-default'
                                                                        }`}
                                                                        title={o.name}
                                                                    >
                                                                        {o.name}
                                                                    </button>
                                                                    {isEditing ? (
                                                                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary-600 shrink-0">עריכה</span>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>

                                                {selectedBulkOrgIds.size > 0 ? (
                                                    <div className="p-3 border-t border-border-default bg-bg-subtle/30 space-y-2">
                                                        <p className="text-xs font-bold text-text-default">
                                                            נבחרו {selectedBulkOrgIds.size} ארגונים
                                                        </p>
                                                        <label className="block text-[11px] font-bold text-text-muted">תבנית מקור</label>
                                                        <select
                                                            value={bulkSourceScopeId}
                                                            onChange={(e) => setBulkSourceScopeId(e.target.value)}
                                                            className="w-full bg-bg-card border border-border-default rounded-lg py-2 px-2.5 text-xs font-bold text-text-default focus:ring-1 focus:ring-primary-500 outline-none"
                                                        >
                                                            <option value={DEFAULT_SCOPE_ID}>ברירת מחדל</option>
                                                            {scopeOptions.map((o) => (
                                                                <option key={o.id} value={o.id}>{o.name}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            disabled={bulkApplying || !selectedPipelineId}
                                                            onClick={() => void handleBulkApplyTemplate()}
                                                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                        >
                                                            <CheckCircleIcon className="w-4 h-4" />
                                                            {bulkApplying
                                                                ? 'מעדכן…'
                                                                : `עדכן נבחרים לתבנית "${bulkSourceLabel}"`}
                                                        </button>
                                                        <p className="text-[10px] text-text-subtle leading-snug">
                                                            מומלץ לשמור קודם את תבנית ברירת המחדל, ואז להחיל על הארגונים המסומנים.
                                                            {activePipeline ? ` (${activePipeline.name})` : ''}
                                                        </p>
                                                    </div>
                                                ) : null}
                                            </>
                                        ) : loadingScopes ? (
                                            <p className="px-3 py-4 text-xs text-text-muted">טוען ארגונים…</p>
                                        ) : (
                                            <p className="px-3 py-4 text-xs text-text-muted">אין ארגונים מקושרים</p>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        )}
                       
                    </div>
                </div>
               
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl">
                    {error}
                </div>
            )}
            {saveMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm font-medium px-4 py-3 rounded-xl">
                    {saveMessage}
                </div>
            )}

            <div className="flex space-x-2 space-x-reverse overflow-x-auto pb-2">
                {loadingPipelines ? (
                    <div className="text-sm text-text-muted px-2 py-3">טוען תהליכים…</div>
                ) : pipelines.length === 0 ? (
                    <div className="text-sm text-text-muted px-2 py-3">
                        אין תהליכים מוגדרים. הוסיפו תהליך ב&quot;הגדרות → תהליכי עבודה&quot;.
                    </div>
                ) : (
                    pipelines.map((pipeline) => (
                        <button
                            key={pipeline.id}
                            type="button"
                            onClick={() => {
                                setSelectedPipelineId(pipeline.id);
                                setSaveMessage(null);
                            }}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                                selectedPipelineId === pipeline.id
                                    ? 'bg-primary-600 text-white shadow-md'
                                    : 'bg-bg-card text-text-muted border border-border-default hover:bg-bg-subtle hover:text-text-default'
                            }`}
                        >
                            <ChartBarIcon className="w-5 h-5" />
                            {pipeline.name}
                            {isDefaultScope && pipelineRuleCounts[pipeline.id] != null ? (
                                <span className="text-[10px] font-bold opacity-80">
                                    ({pipelineRuleCounts[pipeline.id]} חוקים)
                                </span>
                            ) : null}
                        </button>
                    ))
                )}
            </div>

            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm transition-all">
                {activePipeline ? (
                    <div className="mb-6 pb-6 border-b border-border-default">
                        <h3 className="text-lg font-bold text-text-default mb-1">
                            חוקים עבור: {activePipeline.name}
                        </h3>
                        <p className="text-sm text-text-muted">
                            {activePipeline.description?.trim()
                                || 'מדדי דופק ייחודיים לתהליך זה. בחירת תהליך אחר בטאב למעלה תציג את החוקים שלו.'}
                        </p>
                    </div>
                ) : null}

                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-text-default uppercase tracking-wider">רשימת חוקים פעילים</h4>
                    <button
                        type="button"
                        onClick={handleAddRule}
                        disabled={!canEdit || loadingRules}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition shadow-sm shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <PlusIcon className="w-4 h-4" />
                        הוסף חוק חדש
                    </button>
                </div>

                {loadingRules ? (
                    <div className="text-center py-12 text-text-muted text-sm">טוען חוקים…</div>
                ) : !canEdit ? (
                    <div className="text-center py-12 bg-bg-subtle/30 border-2 border-dashed border-border-default rounded-xl">
                        <p className="text-text-muted font-medium">
                            {isPlatformAdmin
                                ? 'בחר לקוח ותהליך כדי לערוך חוקי דופק ברירת המחדל.'
                                : 'בחר ארגון (או ברירת מחדל) ותהליך כדי לערוך חוקי דופק.'}
                        </p>
                    </div>
                ) : rules.length > 0 ? (
                    <div className="space-y-3">
                        <p className="text-xs text-text-subtle mb-1">גררו את אייקון ≡ בצד השורה כדי לשנות סדר בדיקה (מלמעלה למטה). אל תשכחו לשמור.</p>
                        {rules.map((rule) => (
                            <RuleRow
                                key={rule.id}
                                rule={rule}
                                isDragging={draggingId === rule.id}
                                onChange={handleUpdateRule}
                                onDelete={handleDeleteRule}
                                onHandlePointerDown={handleRulePointerDown}
                                onHandlePointerMove={handleRulePointerMove}
                                onHandlePointerUp={handleRulePointerUp}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-bg-subtle/30 border-2 border-dashed border-border-default rounded-xl">
                        <p className="text-text-muted font-medium">לא הוגדרו חוקים. המערכת תציג &quot;אפור&quot; כברירת מחדל.</p>
                        <button type="button" onClick={handleAddRule} className="text-primary-600 font-bold text-sm mt-2 hover:underline">צור חוק ראשון</button>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!canEdit || saving || loadingRules}
                    className="px-6 py-3 rounded-xl text-text-muted font-bold hover:bg-bg-hover transition disabled:opacity-50"
                >
                    בטל שינויים
                </button>
                <button
                    type="button"
                    disabled={!canEdit || saving || loadingRules}
                    className="px-8 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition flex items-center gap-2 disabled:opacity-50"
                    onClick={() => void handleSave()}
                >
                    <CheckCircleIcon className="w-5 h-5" />
                    {saving ? 'שומר…' : activePipeline ? `שמור — ${activePipeline.name}` : 'שמור הגדרות'}
                </button>
            </div>
        </div>
    );
};

export default ClientHealthSettingsView;
