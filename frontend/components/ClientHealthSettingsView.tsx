import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, UserGroupIcon,
    PlusIcon, TrashIcon, BriefcaseIcon, BuildingOffice2Icon, ChartBarIcon, Bars3Icon,
} from './Icons';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import {
    fetchClientHealthRules,
    syncClientHealthRules,
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
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;

    const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
    const [selectedScopeId, setSelectedScopeId] = useState<string>('');
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

    /** Admin: selected client id. Tenant: always their client id. */
    const activeClientId = isPlatformAdmin ? selectedScopeId : tenantClientId;
    /** Tenant: selected organization id. Admin: null (client-level rules). */
    const activeOrganizationId = isPlatformAdmin ? null : (selectedScopeId || null);
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
                    setSelectedScopeId((prev) => prev || opts[0]?.id || '');
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
                    setSelectedScopeId((prev) => prev || opts[0]?.id || '');
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
        if (!isPlatformAdmin && !activeOrganizationId) {
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
    }, [activeClientId, activeOrganizationId, selectedPipelineId, isPlatformAdmin]);

    useEffect(() => {
        void loadRules();
    }, [loadRules]);

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

    const handleSave = async () => {
        if (!activeClientId || !selectedPipelineId) return;
        if (!isPlatformAdmin && !activeOrganizationId) {
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
        && (isPlatformAdmin || activeOrganizationId),
    );

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-10">
            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary-100 p-2 rounded-lg text-primary-600"><CheckCircleIcon className="w-6 h-6"/></div>
                        <h2 className="text-2xl font-bold text-text-default">הגדרת מדדי דופק לקוח (Client Pulse)</h2>
                    </div>
                    <div className="relative min-w-[220px] max-w-full md:w-72">
                        <label className="block text-xs font-bold text-text-muted mb-1.5">{scopeLabel}</label>
                        <div className="relative">
                            <BuildingOffice2Icon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <select
                                value={selectedScopeId}
                                onChange={(e) => setSelectedScopeId(e.target.value)}
                                disabled={loadingScopes || scopeOptions.length === 0}
                                className="w-full appearance-none bg-bg-input border border-border-default rounded-xl py-2.5 pr-10 pl-3 text-sm font-bold text-text-default focus:ring-2 focus:ring-primary-500 outline-none disabled:opacity-60"
                            >
                                {scopeOptions.length === 0 ? (
                                    <option value="">
                                        {loadingScopes
                                            ? 'טוען…'
                                            : (isPlatformAdmin ? 'אין לקוחות' : 'אין ארגונים מקושרים')}
                                    </option>
                                ) : (
                                    scopeOptions.map((o) => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-text-muted max-w-2xl leading-relaxed">
                    כאן מגדירים מתי המערכת תתריע על לקוחות &quot;נופלים בין הכסאות&quot; — בנפרד לכל תהליך עבודה.
                    המערכת בודקת את החוקים לפי הסדר (מלמעלה למטה). החוק הראשון שמתקיים קובע את צבע הדופק.
                    <br/>
                    מומלץ לשים חוקים קריטיים (אדום) בראש הרשימה.
                </p>
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
                                ? 'בחר לקוח ותהליך כדי לערוך חוקי דופק.'
                                : 'בחר ארגון מקושר ותהליך כדי לערוך חוקי דופק.'}
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
                    {saving ? 'שומר…' : 'שמור הגדרות'}
                </button>
            </div>
        </div>
    );
};

export default ClientHealthSettingsView;
