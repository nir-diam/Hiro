
import React, { useState } from 'react';
import { 
    ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, UserGroupIcon, 
    PlusIcon, TrashIcon, SparklesIcon, ArrowPathIcon, FunnelIcon, ChatBubbleBottomCenterTextIcon,
    BriefcaseIcon, UserIcon, FireIcon
} from './Icons';
import DevAnnotation from './DevAnnotation';

type HealthColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';

// Expanded condition types to reflect the "Recruiter Reality"
type ConditionType = 
    | 'candidates_total'        // כמות כללית (פחות קריטי)
    | 'candidates_at_stage'     // כמות בסטטוס X (קריטי לאיכות)
    | 'time_in_stage'           // זמן תקיעות בסטטוס X (צוואר בקבוק)
    | 'days_since_contact'      // ימים ללא קשר עם לקוח (קריטי לקשר)
    | 'disqualification_rate'   // אחוז פסילה (דיוק פרופיל)
    | 'days_open';              // ותק משרה

type Operator = 'gt' | 'lt' | 'between' | 'eq';
type ProfileId = 'standard' | 'high_volume' | 'executive';

interface HealthRule {
    id: string;
    color: HealthColor;
    condition: ConditionType;
    operator: Operator;
    value: number;
    maxValue?: number;
    stage?: string; // For stage-specific rules
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

const conditionOptions: { value: ConditionType; label: string; unit: string; icon: React.ReactNode; requiresStage?: boolean }[] = [
    { value: 'candidates_at_stage', label: 'כמות מועמדים בסטטוס...', unit: 'מועמדים', icon: <FunnelIcon className="w-4 h-4"/>, requiresStage: true },
    { value: 'time_in_stage', label: 'זמן שהייה (תקיעות) בסטטוס...', unit: 'ימים', icon: <ClockIcon className="w-4 h-4"/>, requiresStage: true },
    { value: 'days_since_contact', label: 'ימים ללא תקשורת עם לקוח', unit: 'ימים', icon: <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> },
    { value: 'disqualification_rate', label: 'אחוז פסילות (יחס המרה)', unit: '%', icon: <ExclamationTriangleIcon className="w-4 h-4"/> },
    { value: 'candidates_total', label: 'סך כל המועמדים (הגשות)', unit: 'מועמדים', icon: <UserGroupIcon className="w-4 h-4"/> },
    { value: 'days_open', label: 'ימים שהמשרה פתוחה', unit: 'ימים', icon: <ClockIcon className="w-4 h-4"/> },
];

const profileMetadata: Record<ProfileId, { label: string; icon: React.ReactNode; description: string }> = {
    standard: { 
        label: 'רגיל (Standard)', 
        icon: <BriefcaseIcon className="w-5 h-5"/>,
        description: 'פרופיל ברירת המחדל. מאוזן בין מהירות לאיכות, מתאים לרוב המשרות במערכת.'
    },
    high_volume: { 
        label: 'מסת גיוס (High Volume)', 
        icon: <FireIcon className="w-5 h-5"/>,
        description: 'מיועד למשרות עם תחלופה גבוהה (מוקד, תפעול). מתריע בעיקר על צווארי בקבוק בכמויות ודורש טיפול מהיר.'
    },
    executive: { 
        label: 'בכירים (Executive)', 
        icon: <UserIcon className="w-5 h-5"/>,
        description: 'מיועד למשרות בכירות/הד-האנטינג. סובלני יותר לזמנים ארוכים, אך רגיש לניתוק קשר עם הלקוח.'
    }
};

// Mock stages from the system
const systemStages = ['חדש', 'סינון טלפוני', 'ראיון HR', 'הועבר למנהל', 'ראיון מקצועי', 'הצעת שכר', 'בדיקת ממליצים'];

const initialRules: Record<ProfileId, HealthRule[]> = {
    standard: [
        { id: 's1', color: 'red', condition: 'time_in_stage', stage: 'הועבר למנהל', operator: 'gt', value: 4, enabled: true },
        { id: 's2', color: 'orange', condition: 'days_since_contact', operator: 'gt', value: 7, enabled: true },
        { id: 's3', color: 'yellow', condition: 'candidates_total', operator: 'lt', value: 5, enabled: true },
    ],
    high_volume: [
        { id: 'hv1', color: 'red', condition: 'candidates_at_stage', stage: 'חדש', operator: 'gt', value: 50, enabled: true },
        { id: 'hv2', color: 'red', condition: 'time_in_stage', stage: 'חדש', operator: 'gt', value: 2, enabled: true },
        { id: 'hv3', color: 'orange', condition: 'candidates_total', operator: 'lt', value: 20, enabled: true },
    ],
    executive: [
        { id: 'ex1', color: 'red', condition: 'days_since_contact', operator: 'gt', value: 3, enabled: true },
        { id: 'ex2', color: 'orange', condition: 'days_open', operator: 'gt', value: 60, enabled: true },
    ]
};

const RuleRow: React.FC<{ 
    rule: HealthRule; 
    onChange: (id: string, updates: Partial<HealthRule>) => void; 
    onDelete: (id: string) => void; 
}> = ({ rule, onChange, onDelete }) => {
    const currentCondition = conditionOptions.find(c => c.value === rule.condition);

    return (
        <DevAnnotation
            title={`Health Rule: ${rule.id}`}
            description="Defines a specific condition that triggers a visual health status change."
            logic={[
                `IF ${rule.condition} ${rule.operator} ${rule.value}`,
                `THEN set job status color to ${rule.color}`,
                "Rules are evaluated in order. Red overrides Orange overrides Yellow."
            ]}
            position='top-left'
        >
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

                    {/* Stage Selector (Dynamic) */}
                    {currentCondition?.requiresStage ? (
                        <select 
                            value={rule.stage || ''}
                            onChange={(e) => onChange(rule.id, { stage: e.target.value })}
                            className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2 text-primary-700 font-medium focus:ring-1 focus:ring-primary-500"
                        >
                            <option value="" disabled>בחר סטטוס...</option>
                            {systemStages.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    ) : (
                        <div className="hidden md:block md:bg-border-subtle/30 md:h-0.5 md:w-8 md:mx-auto rounded-full"></div> // Spacer
                    )}

                    {/* Operator */}
                    <select 
                        value={rule.operator}
                        onChange={(e) => onChange(rule.id, { operator: e.target.value as Operator })}
                        className="bg-bg-input border border-border-default text-sm rounded-md p-2"
                    >
                        <option value="gt">גדול מ-</option>
                        <option value="lt">קטן מ-</option>
                        <option value="eq">שווה ל-</option>
                        <option value="between">בין</option>
                    </select>

                    {/* Value Input */}
                    <div className="flex items-center gap-2 min-w-[120px]">
                        <input 
                            type="number" 
                            value={rule.value}
                            onChange={(e) => onChange(rule.id, { value: parseInt(e.target.value) || 0 })}
                            className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2 text-center font-bold focus:ring-1 focus:ring-primary-500"
                        />
                        {rule.operator === 'between' && (
                            <>
                                <span className="text-text-muted">-</span>
                                <input 
                                    type="number" 
                                    value={rule.maxValue || rule.value + 1}
                                    onChange={(e) => onChange(rule.id, { maxValue: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2 text-center font-bold focus:ring-1 focus:ring-primary-500"
                                />
                            </>
                        )}
                        <span className="text-xs font-semibold text-text-muted whitespace-nowrap bg-bg-subtle px-1.5 py-0.5 rounded">{currentCondition?.unit}</span>
                    </div>
                </div>

                {/* Actions */}
                <button onClick={() => onDelete(rule.id)} className="p-2 text-text-subtle hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="מחק חוק">
                    <TrashIcon className="w-5 h-5" />
                </button>
            </div>
        </DevAnnotation>
    );
}

const JobHealthSettingsView: React.FC = () => {
    const [isSystemActive, setIsSystemActive] = useState(true);
    const [selectedProfile, setSelectedProfile] = useState<ProfileId>('standard');
    const [profileRules, setProfileRules] = useState<Record<ProfileId, HealthRule[]>>(initialRules);

    const handleAddRule = () => {
        const newRule: HealthRule = {
            id: Date.now().toString(),
            color: 'gray',
            condition: 'candidates_at_stage',
            stage: 'ראיון HR',
            operator: 'gt',
            value: 0,
            enabled: true
        };
        setProfileRules(prev => ({
            ...prev,
            [selectedProfile]: [...prev[selectedProfile], newRule]
        }));
    };

    const handleUpdateRule = (id: string, updates: Partial<HealthRule>) => {
        setProfileRules(prev => ({
            ...prev,
            [selectedProfile]: prev[selectedProfile].map(r => r.id === id ? { ...r, ...updates } : r)
        }));
    };

    const handleDeleteRule = (id: string) => {
        setProfileRules(prev => ({
            ...prev,
            [selectedProfile]: prev[selectedProfile].filter(r => r.id !== id)
        }));
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-10">
            {/* Header Section */}
            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm flex flex-col md:flex-row justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-primary-100 p-2 rounded-lg text-primary-600"><SparklesIcon className="w-6 h-6"/></div>
                        <h2 className="text-2xl font-bold text-text-default">פרופילי בריאות משרה (Job Health Profiles)</h2>
                    </div>
                    <p className="text-sm text-text-muted max-w-2xl leading-relaxed">
                        הגדר חוקים שונים עבור סוגי משרות שונים. בעת פתיחת משרה, הרכז יבחר את הפרופיל המתאים (למשל "מסת גיוס" או "בכירים"), והמערכת תתריע על חריגות בהתאם לחוקים שהגדרת כאן.
                    </p>
                </div>
                <div className="flex items-start">
                    <div className="flex items-center gap-3 bg-bg-subtle p-2 rounded-xl border border-border-default">
                        <span className={`text-sm font-bold px-2 ${!isSystemActive ? 'text-text-muted' : 'text-primary-600'}`}>
                            {isSystemActive ? 'מערכת פעילה' : 'מערכת כבויה'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={isSystemActive} onChange={(e) => setIsSystemActive(e.target.checked)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>
                </div>
            </div>

            {isSystemActive && (
                <>
                    {/* Profile Selector Tabs */}
                    <div className="flex space-x-2 space-x-reverse overflow-x-auto pb-2">
                        {(Object.keys(profileMetadata) as ProfileId[]).map((profileId) => (
                            <button
                                key={profileId}
                                onClick={() => setSelectedProfile(profileId)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                                    selectedProfile === profileId
                                        ? 'bg-primary-600 text-white shadow-md'
                                        : 'bg-bg-card text-text-muted border border-border-default hover:bg-bg-subtle hover:text-text-default'
                                }`}
                            >
                                {profileMetadata[profileId].icon}
                                {profileMetadata[profileId].label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm transition-all">
                        <div className="mb-6 pb-6 border-b border-border-default">
                            <h3 className="text-lg font-bold text-text-default mb-1">חוקים עבור: {profileMetadata[selectedProfile].label}</h3>
                            <p className="text-sm text-text-muted">{profileMetadata[selectedProfile].description}</p>
                        </div>

                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-bold text-text-default uppercase tracking-wider">רשימת חוקים פעילים</h4>
                            <button onClick={handleAddRule} className="flex items-center gap-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition shadow-sm shadow-primary-500/20">
                                <PlusIcon className="w-4 h-4" />
                                הוסף חוק לפרופיל זה
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            {profileRules[selectedProfile].length > 0 ? (
                                profileRules[selectedProfile].map((rule) => (
                                    <RuleRow 
                                        key={rule.id} 
                                        rule={rule} 
                                        onChange={handleUpdateRule} 
                                        onDelete={handleDeleteRule}
                                    />
                                ))
                            ) : (
                                <div className="text-center py-12 bg-bg-subtle/30 border-2 border-dashed border-border-default rounded-xl">
                                    <p className="text-text-muted font-medium">לא הוגדרו חוקים לפרופיל זה. המערכת תציג "ירוק" כברירת מחדל.</p>
                                    <button onClick={handleAddRule} className="text-primary-600 font-bold text-sm mt-2 hover:underline">צור חוק ראשון</button>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
            
            {isSystemActive && (
                <div className="flex justify-end gap-3">
                    <button className="px-6 py-3 rounded-xl text-text-muted font-bold hover:bg-bg-hover transition">
                        בטל שינויים
                    </button>
                    <button 
                        className="px-8 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition flex items-center gap-2"
                        onClick={() => alert('הפרופילים נשמרו בהצלחה! החוקים יחולו על משרות בהתאם לפרופיל הנבחר.')}
                    >
                        <CheckCircleIcon className="w-5 h-5" />
                        שמור הגדרות פרופילים
                    </button>
                </div>
            )}
        </div>
    );
};

export default JobHealthSettingsView;
