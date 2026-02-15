
import React, { useState } from 'react';
import { 
    ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, UserGroupIcon, 
    PlusIcon, TrashIcon, SparklesIcon, FunnelIcon, ChatBubbleBottomCenterTextIcon,
    BriefcaseIcon, UserIcon, FireIcon
} from './Icons';
import DevAnnotation from './DevAnnotation';

type HealthColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';

type ConditionType = 
    | 'days_since_contact'      // ימים ללא קשר
    | 'active_placements'       // השמות פעילות
    | 'open_opportunities'      // משרות פתוחות
    | 'no_future_activity';     // אין פעילות עתידית

type Operator = 'gt' | 'lt' | 'eq' | 'is_true' | 'is_false';

interface HealthRule {
    id: string;
    color: HealthColor;
    condition: ConditionType;
    operator: Operator;
    value: number;
    enabled: boolean;
}

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

const initialRules: HealthRule[] = [
    { id: '1', color: 'red', condition: 'days_since_contact', operator: 'gt', value: 30, enabled: true },
    { id: '2', color: 'orange', condition: 'days_since_contact', operator: 'gt', value: 14, enabled: true },
    { id: '3', color: 'orange', condition: 'no_future_activity', operator: 'is_true', value: 0, enabled: true },
    { id: '4', color: 'green', condition: 'days_since_contact', operator: 'lt', value: 14, enabled: true },
];

const RuleRow: React.FC<{ 
    rule: HealthRule; 
    onChange: (id: string, updates: Partial<HealthRule>) => void; 
    onDelete: (id: string) => void; 
}> = ({ rule, onChange, onDelete }) => {
    const currentCondition = conditionOptions.find(c => c.value === rule.condition);

    return (
        <div className={`flex flex-col lg:flex-row items-center gap-4 p-4 rounded-xl border transition-all duration-200 ${rule.enabled ? 'bg-bg-card border-border-default shadow-sm hover:border-primary-300' : 'bg-bg-subtle/50 border-border-default opacity-60'}`}>
            
            {/* 1. Enable & Color */}
            <div className="flex items-center gap-3 w-full lg:w-auto min-w-[180px]">
                <input 
                    type="checkbox" 
                    checked={rule.enabled} 
                    onChange={(e) => onChange(rule.id, { enabled: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
                <div className="relative group w-full">
                    <button className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-transparent text-sm font-medium transition-colors ${colorConfig[rule.color].bg} ${colorConfig[rule.color].text}`}>
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

            {/* 2. Condition Definition */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 w-full items-center bg-bg-subtle/30 p-2 rounded-lg border border-border-subtle/50">
                
                {/* Parameter Type */}
                <div className="relative">
                    <select 
                        value={rule.condition}
                        onChange={(e) => onChange(rule.id, { condition: e.target.value as ConditionType })}
                        className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2 pl-9 appearance-none focus:ring-1 focus:ring-primary-500"
                    >
                        {conditionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none">
                        {currentCondition?.icon}
                    </div>
                </div>

                {/* Operator */}
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

                        {/* Value Input */}
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

            {/* Actions */}
            <button onClick={() => onDelete(rule.id)} className="p-2 text-text-subtle hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="מחק חוק">
                <TrashIcon className="w-5 h-5" />
            </button>
        </div>
    );
}

const ClientHealthSettingsView: React.FC = () => {
    const [rules, setRules] = useState<HealthRule[]>(initialRules);

    const handleAddRule = () => {
        const newRule: HealthRule = {
            id: Date.now().toString(),
            color: 'gray',
            condition: 'days_since_contact',
            operator: 'gt',
            value: 7,
            enabled: true
        };
        setRules(prev => [...prev, newRule]);
    };

    const handleUpdateRule = (id: string, updates: Partial<HealthRule>) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const handleDeleteRule = (id: string) => {
        setRules(prev => prev.filter(r => r.id !== id));
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-10">
            {/* Header Section */}
            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-primary-100 p-2 rounded-lg text-primary-600"><CheckCircleIcon className="w-6 h-6"/></div>
                    <h2 className="text-2xl font-bold text-text-default">הגדרת מדדי דופק לקוח (Client Pulse)</h2>
                </div>
                <p className="text-sm text-text-muted max-w-2xl leading-relaxed">
                    כאן מגדירים מתי המערכת תתריע על לקוחות "נופלים בין הכסאות".
                    המערכת בודקת את החוקים לפי הסדר (מלמעלה למטה). החוק הראשון שמתקיים קובע את צבע הדופק.
                    <br/>
                    מומלץ לשים חוקים קריטיים (אדום) בראש הרשימה.
                </p>
            </div>

            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm transition-all">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-text-default uppercase tracking-wider">רשימת חוקים פעילים</h4>
                    <button onClick={handleAddRule} className="flex items-center gap-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition shadow-sm shadow-primary-500/20">
                        <PlusIcon className="w-4 h-4" />
                        הוסף חוק חדש
                    </button>
                </div>
                
                <div className="space-y-3">
                    {rules.length > 0 ? (
                        rules.map((rule) => (
                            <RuleRow 
                                key={rule.id} 
                                rule={rule} 
                                onChange={handleUpdateRule} 
                                onDelete={handleDeleteRule}
                            />
                        ))
                    ) : (
                        <div className="text-center py-12 bg-bg-subtle/30 border-2 border-dashed border-border-default rounded-xl">
                            <p className="text-text-muted font-medium">לא הוגדרו חוקים. המערכת תציג "אפור" כברירת מחדל.</p>
                            <button onClick={handleAddRule} className="text-primary-600 font-bold text-sm mt-2 hover:underline">צור חוק ראשון</button>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex justify-end gap-3">
                <button className="px-6 py-3 rounded-xl text-text-muted font-bold hover:bg-bg-hover transition">
                    בטל שינויים
                </button>
                <button 
                    className="px-8 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition flex items-center gap-2"
                    onClick={() => alert('החוקים נשמרו בהצלחה! הדופק בטבלת הלקוחות יתעדכן בהתאם.')}
                >
                    <CheckCircleIcon className="w-5 h-5" />
                    שמור הגדרות
                </button>
            </div>
        </div>
    );
};

export default ClientHealthSettingsView;
