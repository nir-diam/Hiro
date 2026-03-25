
import React, { useState } from 'react';
import { 
    SparklesIcon, 
    TagIcon, 
    GlobeAmericasIcon, 
    BriefcaseIcon, 
    ArrowPathIcon,
    CheckCircleIcon,
    InformationCircleIcon,
    AcademicCapIcon,
    LanguageIcon,
    WrenchScrewdriverIcon,
    UserGroupIcon,
    BuildingOffice2Icon,
    ShieldCheckIcon,
    AdjustmentsHorizontalIcon,
    BoltIcon
} from './Icons';

interface WeightSetting {
    id: string;
    label: string;
    value: number;
    icon: React.ReactNode;
    description: string;
}

const AdminMatchingEngineView: React.FC = () => {
    // Main Algorithm Weights
    const [mainWeights, setMainWeights] = useState<WeightSetting[]>([
        { 
            id: 'vector', 
            label: 'חיפוש סמנטי (Vector)', 
            value: 25, 
            icon: <SparklesIcon className="w-5 h-5 text-purple-500" />,
            description: 'הבנת הקשר ומשמעות מעבר למילות מפתח מדויקות'
        },
        { 
            id: 'tags', 
            label: 'שכבת תגיות (Tags)', 
            value: 40, 
            icon: <TagIcon className="w-5 h-5 text-blue-500" />,
            description: 'דיוק לפי 9 קטגוריות הליבה המובנות'
        },
        { 
            id: 'geo', 
            label: 'גיאוגרפיה (Geo)', 
            value: 20, 
            icon: <GlobeAmericasIcon className="w-5 h-5 text-emerald-500" />,
            description: 'קרבה פיזית בין המועמד למשרה'
        },
        { 
            id: 'experience', 
            label: 'ניסיון וחברות (Exp)', 
            value: 15, 
            icon: <BriefcaseIcon className="w-5 h-5 text-orange-500" />,
            description: 'איכות המעסיקים הקודמים והתאמה לתעשייה'
        },
    ]);

    // Internal Tag Category Weights
    const [tagWeights, setTagWeights] = useState<WeightSetting[]>([
        { id: 'role', label: 'תפקיד', value: 100, icon: <UserGroupIcon className="w-4 h-4" />, description: 'התאמה לתפקיד המוגדר' },
        { id: 'seniority', label: 'בכירות', value: 80, icon: <ShieldCheckIcon className="w-4 h-4" />, description: 'רמת ניסיון ודרג' },
        { id: 'skill', label: 'מיומנות', value: 70, icon: <TagIcon className="w-4 h-4" />, description: 'כישורים מקצועיים' },
        { id: 'tool', label: 'כלי / תוכנה', value: 60, icon: <WrenchScrewdriverIcon className="w-4 h-4" />, description: 'שליטה בכלים טכנולוגיים' },
        { id: 'industry', label: 'תעשייה', value: 50, icon: <BuildingOffice2Icon className="w-4 h-4" />, description: 'ניסיון בתחום הפעילות' },
        { id: 'education', label: 'השכלה', value: 40, icon: <AcademicCapIcon className="w-4 h-4" />, description: 'תארים והסמכות אקדמיות' },
        { id: 'language', label: 'שפה', value: 30, icon: <LanguageIcon className="w-4 h-4" />, description: 'שליטה בשפות נדרשות' },
        { id: 'soft_skill', label: 'כישור רך', value: 20, icon: <UserGroupIcon className="w-4 h-4" />, description: 'תכונות אישיות ובינאישיות' },
        { id: 'certification', label: 'הסמכה/תעודה', value: 20, icon: <ShieldCheckIcon className="w-4 h-4" />, description: 'תעודות מקצועיות' },
    ]);

    // Tag Source Weights
    const [sourceWeights, setSourceWeights] = useState<WeightSetting[]>([
        { id: 'recruiter', label: 'הוספה ע"י רכז', value: 100, icon: <UserGroupIcon className="w-4 h-4 text-blue-500" />, description: 'תגיות שאומתו ידנית ע"י איש מקצוע' },
        { id: 'candidate', label: 'הוספה ע"י מועמד', value: 70, icon: <UserGroupIcon className="w-4 h-4 text-emerald-500" />, description: 'תגיות שהמועמד העיד על עצמו' },
        { id: 'ai', label: 'חילוץ AI (אוטומטי)', value: 50, icon: <SparklesIcon className="w-4 h-4 text-purple-500" />, description: 'תגיות שחולצו אוטומטית מקורות החיים' },
    ]);

    // Geo Regional Logic
    const [geoRegions, setGeoRegions] = useState([
        { id: 'center', label: 'מרכז וגוש דן', grace: 15, penaltyPerKm: 2 },
        { id: 'north_south', label: 'צפון / דרום / פריפריה', grace: 30, penaltyPerKm: 1 },
        { id: 'jerusalem', label: 'ירושלים והסביבה', grace: 20, penaltyPerKm: 1.5 },
    ]);

    const [missingGeoScore, setMissingGeoScore] = useState(50);
    const [missingSalaryScore, setMissingSalaryScore] = useState(0);

    // Salary Penalty Settings
    const [salaryDiffThreshold, setSalaryDiffThreshold] = useState(10);
    const [salaryPenalty, setSalaryPenalty] = useState(5);

    // Age Gap Penalty Settings
    const [ageGapPenalty, setAgeGapPenalty] = useState(2);

    // Simulator State
    const [simJob, setSimJob] = useState<{
        ageMin: string;
        ageMax: string;
        industry: string;
    }>({
        ageMin: '25',
        ageMax: '35',
        industry: 'משאבי אנוש',
    });

    const [isExperienceEnabled, setIsExperienceEnabled] = useState(true);

    const [simCandidate, setSimCandidate] = useState({
        age: 30,
        ignoreAge: false,
        distance: 10,
        missingAddress: false,
        missingSalary: false,
        region: 'center',
        tagSource: 'recruiter',
        vectorScore: 85,
        expectedSalary: 22000,
        offeredSalary: 20000,
        simSalaryDiffThreshold: 10,
        simSalaryPenalty: 5,
        simAgeGapPenalty: 2,
        industryMatch: 80,
        tagScores: {
            role: 100,
            seniority: 100,
            skill: 70,
            tool: 50,
            industry: 80,
            education: 0,
            language: 0,
            soft_skill: 0,
            certification: 0
        } as Record<string, number>
    });
    const [simResult, setSimResult] = useState<any>(null);
    const [isSimulating, setIsSimulating] = useState(false);

    const runSimulation = async () => {
        setIsSimulating(true);
        
        // Prepare config from state
        const config: any = {
            mainWeights: {
                vector: mainWeights.find(w => w.id === 'vector')?.value! / 100,
                tags: mainWeights.find(w => w.id === 'tags')?.value! / 100,
                geo: mainWeights.find(w => w.id === 'geo')?.value! / 100,
                experience: isExperienceEnabled ? (mainWeights.find(w => w.id === 'experience')?.value! / 100) : 0
            },
            tagCategoryWeights: tagWeights.reduce((acc, w) => ({ ...acc, [w.id]: w.value }), {}),
            tagSourceWeights: sourceWeights.reduce((acc, w) => ({ ...acc, [w.id]: w.value / 100 }), {}),
            geoRegions: geoRegions.reduce((acc, r) => ({ 
                ...acc, 
                [r.id]: { grace: r.grace, penaltyPerKm: r.penaltyPerKm } 
            }), {}),
            missingGeoScore,
            missingSalaryScore
        };

        // Advanced Simulation Logic:
        // Use the manual performance sliders to calculate weighted totals
        
        // 1. Vector Score
        const vectorScore = simCandidate.vectorScore;

        // 2. Tags Score (Weighted average of category scores based on tagWeights config)
        let totalTagWeighted = 0;
        let totalTagWeight = 0;
        tagWeights.forEach(w => {
            const score = simCandidate.tagScores[w.id] || 0;
            totalTagWeighted += score * w.value;
            totalTagWeight += w.value;
        });
        const tagsScore = totalTagWeight > 0 ? totalTagWeighted / totalTagWeight : 0;

        // 3. Geo Score (Calculated from distance slider)
        let geoScore = 0;
        if (simCandidate.missingAddress) {
            geoScore = config.missingGeoScore;
        } else {
            const region = geoRegions.find(r => r.id === simCandidate.region) || geoRegions[0];
            if (simCandidate.distance <= region.grace) {
                geoScore = 100;
            } else {
                const excess = simCandidate.distance - region.grace;
                geoScore = Math.max(0, 100 - (excess * region.penaltyPerKm));
            }
        }

        // 4. Experience Score (Now 100% Industry Match)
        const expScore = simCandidate.industryMatch;

        // 5. Penalties
        // 5a. Salary Penalty
        let salaryPenaltyPoints = 0;
        if (simCandidate.missingSalary) {
            salaryPenaltyPoints = config.missingSalaryScore;
        } else if (simCandidate.expectedSalary > simCandidate.offeredSalary) {
            const diffPercent = ((simCandidate.expectedSalary - simCandidate.offeredSalary) / simCandidate.offeredSalary) * 100;
            if (diffPercent >= simCandidate.simSalaryDiffThreshold) {
                const penaltyMultiplier = Math.floor(diffPercent / simCandidate.simSalaryDiffThreshold);
                salaryPenaltyPoints = penaltyMultiplier * simCandidate.simSalaryPenalty;
            }
        }

        // 5b. Age Gap Penalty
        let ageGapPenaltyPoints = 0;
        if (!simCandidate.ignoreAge) {
            const parsedAgeMin = parseInt(simJob.ageMin);
            const parsedAgeMax = parseInt(simJob.ageMax);
            
            if (!isNaN(parsedAgeMin) && simCandidate.age < parsedAgeMin) {
                ageGapPenaltyPoints = (parsedAgeMin - simCandidate.age) * simCandidate.simAgeGapPenalty;
            } else if (!isNaN(parsedAgeMax) && simCandidate.age > parsedAgeMax) {
                ageGapPenaltyPoints = (simCandidate.age - parsedAgeMax) * simCandidate.simAgeGapPenalty;
            }
        }

        // Final Weighted Score
        const finalScore = Math.max(0, Math.round(
            vectorScore * config.mainWeights.vector +
            tagsScore * config.mainWeights.tags +
            geoScore * config.mainWeights.geo +
            expScore * config.mainWeights.experience
        ) - salaryPenaltyPoints - ageGapPenaltyPoints);

        setTimeout(() => {
            setSimResult({
                score: finalScore,
                candidate: { age: simCandidate.age, distance: simCandidate.distance },
                breakdown: {
                    vector: Math.round(vectorScore),
                    tags: Math.round(tagsScore),
                    geo: Math.round(geoScore),
                    experience: Math.round(expScore),
                    salaryPenalty: salaryPenaltyPoints,
                    ageGapPenalty: ageGapPenaltyPoints,
                    geoMissing: simCandidate.missingAddress,
                    salaryMissing: simCandidate.missingSalary
                }
            });
            setIsSimulating(false);
        }, 300);
    };

    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const handleMainWeightChange = (id: string, newValue: number) => {
        setMainWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const handleTagWeightChange = (id: string, newValue: number) => {
        setTagWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const handleSourceWeightChange = (id: string, newValue: number) => {
        setSourceWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const activeMainWeights = mainWeights.filter(w => isExperienceEnabled || w.id !== 'experience');
    const totalMainWeight = activeMainWeights.reduce((sum, w) => sum + w.value, 0);

    const handleSave = () => {
        setIsSaving(true);
        // Simulate API call
        setTimeout(() => {
            setIsSaving(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        }, 1000);
    };

    const applyPreset = (preset: 'balanced' | 'skills' | 'experience') => {
        const updates = {
            balanced: {
                main: { vector: 40, tags: 40, geo: 20 },
                tags: { role: 100, seniority: 80, skill: 70, tool: 60, industry: 50, education: 40, language: 30, soft_skill: 20, certification: 20 }
            },
            skills: {
                main: { vector: 45, tags: 45, geo: 10 },
                tags: { role: 40, seniority: 20, skill: 100, tool: 100, industry: 0, education: 0, language: 20, soft_skill: 100, certification: 40 }
            },
            experience: {
                main: { vector: 30, tags: 50, geo: 20 },
                tags: { role: 100, seniority: 100, skill: 40, tool: 40, industry: 100, education: 80, language: 20, soft_skill: 10, certification: 60 }
            }
        };

        const u = updates[preset];
        setMainWeights(prev => prev.map(w => ({ ...w, value: u.main[w.id as keyof typeof u.main] ?? w.value })));
        setTagWeights(prev => prev.map(w => ({ ...w, value: u.tags[w.id as keyof typeof u.tags] ?? w.value })));
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-text-default">הגדרות מנוע התאמה (Matching Engine)</h2>
                    <p className="text-sm text-text-muted">ניהול משקלים ואלגוריתם השקלול לחישוב אחוז התאמה</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={isSaving || totalMainWeight !== 100}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
                        totalMainWeight === 100 
                            ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20' 
                            : 'bg-bg-subtle text-text-muted cursor-not-allowed'
                    }`}
                >
                    {isSaving ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                    שמור שינויים
                </button>
            </div>

            {showSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span>ההגדרות נשמרו בהצלחה ועודכנו במנוע החישוב.</span>
                </div>
            )}

            {/* Presets */}
            <div className="bg-white p-6 rounded-2xl border border-border-subtle shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <SparklesIcon className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-bold text-text-default">תבניות שקלול מוכנות</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button onClick={() => applyPreset('balanced')} className="p-4 rounded-xl border border-border-default bg-bg-subtle/30 hover:bg-primary-50 hover:border-primary-500 hover:ring-1 hover:ring-primary-500 transition-all text-right group">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 bg-white rounded-lg shadow-sm group-hover:text-primary-600 text-text-muted transition-colors">
                                <AdjustmentsHorizontalIcon className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-text-default">גישה מאוזנת (Balanced)</h3>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">שילוב קלאסי של כישורים, ניסיון, והשכלה. מתאים לרוב המשרות הסטנדרטיות.</p>
                    </button>
                    <button onClick={() => applyPreset('skills')} className="p-4 rounded-xl border border-border-default bg-bg-subtle/30 hover:bg-emerald-50 hover:border-emerald-500 hover:ring-1 hover:ring-emerald-500 transition-all text-right group">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 bg-white rounded-lg shadow-sm group-hover:text-emerald-600 text-text-muted transition-colors">
                                <BoltIcon className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-text-default">מבוסס כישורים (Skills-Based)</h3>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">התעלמות מגיל ומוסד לימודים. מיקוד נטו ביכולות, כלים, כישורים רכים והתאמה סמנטית.</p>
                    </button>
                    <button onClick={() => applyPreset('experience')} className="p-4 rounded-xl border border-border-default bg-bg-subtle/30 hover:bg-blue-50 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all text-right group">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 bg-white rounded-lg shadow-sm group-hover:text-blue-600 text-text-muted transition-colors">
                                <BriefcaseIcon className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-text-default">מבוסס ניסיון (Experience)</h3>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">משקל גבוה לוותק, תפקידים קודמים, הלימה מדויקת לתעשייה והשכלה פורמלית.</p>
                    </button>
                </div>
            </div>

            {totalMainWeight !== 100 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl flex items-center gap-3">
                    <InformationCircleIcon className="w-5 h-5" />
                    <span>שים לב: סכום המשקלים הראשיים חייב להיות בדיוק 100% (כרגע: {totalMainWeight}%).</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Weights Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-text-default flex items-center gap-2">
                                <ArrowPathIcon className="w-5 h-5 text-primary-500" />
                                שקלול שכבות הליבה
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer bg-bg-subtle px-3 py-1.5 rounded-lg border border-border-default hover:bg-bg-input transition-colors">
                                <span className="text-sm font-bold text-text-default">הפעל שכבת ניסיון</span>
                                <input 
                                    type="checkbox" 
                                    checked={isExperienceEnabled}
                                    onChange={(e) => setIsExperienceEnabled(e.target.checked)}
                                    className="rounded border-border-default text-primary-500 focus:ring-primary-500 w-4 h-4"
                                />
                            </label>
                        </div>
                        
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 leading-relaxed">
                            <p className="font-bold mb-1">מה ההבדל בין שכבת הניסיון (Experience) לבין תגיות (Tags)?</p>
                            <p className="mb-2"><strong>תגיות</strong> בודקות האם קיימות מילות מפתח ספציפיות (למשל: "Fintech", "React", "ניהול צוות").</p>
                            <p><strong>שכבת הניסיון</strong> מעריכה את <em>האיכות והרלוונטיות</em> של החברות בהן המועמד עבד (למשל: עבודה בחברות Tier-1 בתעשייה, משך הזמן בכל תפקיד, ורצף תעסוקתי). אם אינך זקוק לשקלול מורכב של איכות המעסיקים, תוכל לכבות שכבה זו ולהסתמך על תגיות בלבד.</p>
                        </div>
                        
                        <div className="space-y-8">
                            {activeMainWeights.map(weight => (
                                <div key={weight.id} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-bg-subtle rounded-lg">
                                                {weight.icon}
                                            </div>
                                            <div>
                                                <div className="font-bold text-text-default">{weight.label}</div>
                                                <div className="text-xs text-text-muted">{weight.description}</div>
                                            </div>
                                        </div>
                                        <div className="text-lg font-black text-primary-600">{weight.value}%</div>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleMainWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-600"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-6 border-t border-border-subtle flex items-center justify-between">
                            <span className="text-sm font-bold text-text-muted">סה"כ משקל מצטבר:</span>
                            <span className={`text-xl font-black ${totalMainWeight === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {totalMainWeight}%
                            </span>
                        </div>
                    </div>

                    <div className="bg-bg-subtle rounded-2xl p-6 border border-dashed border-border-default">
                        <h4 className="font-bold text-text-default mb-2 flex items-center gap-2">
                            <InformationCircleIcon className="w-4 h-4" />
                            איך זה עובד?
                        </h4>
                        <p className="text-sm text-text-muted leading-relaxed">
                            האלגוריתם מחשב ציון התאמה סופי על ידי שקלול ארבע השכבות לעיל. 
                            שינוי המשקלים משפיע באופן מיידי על דירוג המועמדים בכל המשרות במערכת. 
                            מומלץ לבצע שינויים קטנים ולבדוק את התוצאות בסימולטור לפני שמירה סופית.
                        </p>
                    </div>
                </div>

                {/* Internal Tag Weights Section */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <TagIcon className="w-5 h-5 text-primary-500" />
                            שקלול פנימי של תגיות
                        </h3>
                        
                        <div className="space-y-5">
                            {tagWeights.map(weight => (
                                <div key={weight.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 text-text-default font-medium">
                                            {weight.icon}
                                            {weight.label}
                                        </div>
                                        <span className="font-bold text-primary-600">{weight.value}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleTagWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                    />
                                </div>
                            ))}

                            {/* Tags Relative Weight Indicator */}
                            <div className="pt-6 border-t border-border-subtle mt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-[10px] font-bold text-text-muted uppercase">חלוקת משקל יחסית בין הקטגוריות:</div>
                                    <div className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                                        סה"כ שקלול: 100%
                                    </div>
                                </div>
                                <div className="flex h-3 rounded-full overflow-hidden bg-bg-subtle shadow-inner">
                                    {tagWeights.map((w, idx) => {
                                        const total = tagWeights.reduce((acc, curr) => acc + curr.value, 0);
                                        const percentage = total > 0 ? (w.value / total) * 100 : 0;
                                        const colors = [
                                            'bg-primary-500', 'bg-blue-500', 'bg-emerald-500', 
                                            'bg-purple-500', 'bg-orange-500', 'bg-rose-500',
                                            'bg-cyan-500', 'bg-amber-500', 'bg-indigo-500'
                                        ];
                                        if (percentage === 0) return null;
                                        return (
                                            <div 
                                                key={w.id} 
                                                className={`${colors[idx % colors.length]} h-full transition-all duration-500 border-r border-white/20 last:border-0`}
                                                style={{ width: `${percentage}%` }}
                                                title={`${w.label}: ${Math.round(percentage)}%`}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-3 gap-y-2 gap-x-4 mt-4">
                                    {tagWeights.filter(w => w.value > 0).map((w, idx) => {
                                        const total = tagWeights.reduce((acc, curr) => acc + curr.value, 0);
                                        const percentage = total > 0 ? (w.value / total) * 100 : 0;
                                        const colors = [
                                            'bg-primary-500', 'bg-blue-500', 'bg-emerald-500', 
                                            'bg-purple-500', 'bg-orange-500', 'bg-rose-500',
                                            'bg-cyan-500', 'bg-amber-500', 'bg-indigo-500'
                                        ];
                                        return (
                                            <div key={w.id} className="text-[9px] text-text-muted flex items-center gap-1.5 truncate">
                                                <div className={`w-2 h-2 rounded-sm ${colors[idx % colors.length]}`} />
                                                <span className="font-bold text-text-default">{Math.round(percentage)}%</span>
                                                <span className="truncate">{w.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-6 p-3 bg-primary-50 rounded-xl text-[11px] text-primary-700 leading-tight">
                            הערכים כאן מייצגים את ה"חשיבות היחסית" של כל קטגוריה בתוך שכבת התגיות. 
                            ערך גבוה יותר (למשל 100 בתפקיד) יגרום להתאמה בקטגוריה זו להשפיע יותר על הציון של שכבת התגיות.
                        </div>
                    </div>
                </div>
            </div>

            {/* Additional Settings & Penalties */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8 items-start">
                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-primary-500" />
                            שקלול מקור התגית
                        </h3>
                        
                        <div className="space-y-5">
                            {sourceWeights.map(weight => (
                                <div key={weight.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 text-text-default font-medium">
                                            {weight.icon}
                                            {weight.label}
                                        </div>
                                        <span className="font-bold text-primary-600">{weight.value}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleSourceWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                    />
                                    <div className="text-[10px] text-text-muted">{weight.description}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <InformationCircleIcon className="w-5 h-5 text-primary-500" />
                            מדיניות מידע חסר
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="p-4 bg-primary-50 rounded-xl border border-primary-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">ציון ברירת מחדל ללא כתובת</div>
                                    <span className="text-2xl font-black text-primary-600">{missingGeoScore}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    value={missingGeoScore}
                                    onChange={(e) => setMissingGeoScore(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>קנס מלא (0)</span>
                                    <span>נייטרלי (50)</span>
                                    <span>בונוס (100)</span>
                                </div>
                            </div>

                            <div className="text-xs text-text-muted leading-relaxed">
                                <p className="font-bold text-text-default mb-1">איך זה עובד?</p>
                                כאשר למועמד אין כתובת, המערכת תיתן לו את הציון שקבעת כאן ברכיב הגיאוגרפי.
                                <br />
                                <span className="text-primary-600 font-medium italic">טיפ: כדי לעודד מועמדים להזין כתובת, מומלץ לקבוע ציון נמוך מ-80 (ציון "סביר").</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <AdjustmentsHorizontalIcon className="w-5 h-5 text-primary-500" />
                            קנס על פער בציפיות שכר
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">קנס ברירת מחדל ללא ציפיות שכר</div>
                                    <span className="text-2xl font-black text-purple-600">-{missingSalaryScore}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    value={missingSalaryScore}
                                    onChange={(e) => setMissingSalaryScore(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק'</span>
                                    <span>25 נק'</span>
                                    <span>50 נק'</span>
                                </div>
                            </div>

                            <div className="p-4 bg-primary-50 rounded-xl border border-primary-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">סף פער באחוזים (ממנו מתחיל הקנס)</div>
                                    <span className="text-2xl font-black text-primary-600">{salaryDiffThreshold}%</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    step="5"
                                    value={salaryDiffThreshold}
                                    onChange={(e) => setSalaryDiffThreshold(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0%</span>
                                    <span>25%</span>
                                    <span>50%</span>
                                </div>
                            </div>

                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">נקודות קנס לכל {salaryDiffThreshold}% פער</div>
                                    <span className="text-2xl font-black text-rose-600">-{salaryPenalty}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="20" 
                                    value={salaryPenalty}
                                    onChange={(e) => setSalaryPenalty(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק'</span>
                                    <span>10 נק'</span>
                                    <span>20 נק'</span>
                                </div>
                            </div>

                            <div className="text-xs text-text-muted leading-relaxed">
                                <p className="font-bold text-text-default mb-1">איך זה עובד?</p>
                                כאשר למועמד אין ציפיות שכר, יופחת קנס ברירת המחדל שקבעת.
                                <br />
                                כאשר ציפיות השכר של המועמד גבוהות מהשכר המוצע במשרה, המערכת תחשב את הפער באחוזים.
                                על כל פער של {salaryDiffThreshold}% יופחתו {salaryPenalty} נקודות מהציון הסופי.
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-primary-500" />
                            קנס על חריגה מטווח הגילאים (Demographics)
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">נקודות קנס לכל שנת חריגה</div>
                                    <span className="text-2xl font-black text-orange-600">-{ageGapPenalty}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="10" 
                                    value={ageGapPenalty}
                                    onChange={(e) => setAgeGapPenalty(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק'</span>
                                    <span>5 נק'</span>
                                    <span>10 נק'</span>
                                </div>
                            </div>

                            <div className="text-xs text-text-muted leading-relaxed">
                                <p className="font-bold text-text-default mb-1">איך זה עובד?</p>
                                כאשר גיל המועמד חורג מטווח הגילאים שהוגדר למשרה (כלפי מעלה או מטה), יופחתו {ageGapPenalty} נקודות מהציון הסופי על כל שנת חריגה.
                                <br />
                                <span className="text-primary-600 font-medium italic">הערה: הוצאת הגיל משכבת הניסיון והפיכתו לקנס מאפשרת שליטה מדויקת יותר ומונעת פגיעה במועמדים שמתאימים מקצועית אך חורגים מעט דמוגרפית.</span>
                            </div>
                        </div>
                    </div>
            </div>

            {/* Geo Regional Logic Section */}
            <div className="mt-8">
                <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                        <GlobeAmericasIcon className="w-5 h-5 text-primary-500" />
                            רגישות מרחק לפי אזורים (ק"מ)
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {geoRegions.map(region => (
                                <div key={region.id} className="p-5 bg-bg-subtle rounded-2xl border border-border-subtle space-y-4">
                                    <div className="font-bold text-text-default border-b border-border-subtle pb-2">{region.label}</div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-emerald-600 font-bold uppercase">מרחק לציון מלא (ק"מ)</div>
                                            <input 
                                                type="number" 
                                                value={region.grace}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setGeoRegions(prev => prev.map(r => r.id === region.id ? { ...r, grace: val || 0 } : r));
                                                }}
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-sm font-bold"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-red-600 font-bold uppercase">קנס לכל ק"מ חריגה (%)</div>
                                            <input 
                                                type="number" 
                                                step="0.5"
                                                value={region.penaltyPerKm}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setGeoRegions(prev => prev.map(r => r.id === region.id ? { ...r, penaltyPerKm: val || 0 } : r));
                                                }}
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-sm font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-text-muted italic">
                                        * עד {region.grace} ק"מ הציון הוא 100%. לאחר מכן יורד ב-{region.penaltyPerKm}% לכל ק"מ.
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            {/* Simulator Section */}
            <div className="mt-8 bg-white rounded-2xl border border-border-default overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border-subtle bg-bg-subtle flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-100 rounded-lg">
                            <ArrowPathIcon className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-text-default">סימולטור התאמה (Live Test)</h3>
                            <p className="text-sm text-text-muted">בדוק איך המשקלים שהגדרת משפיעים על התאמה אמיתית</p>
                        </div>
                    </div>
                    <button 
                        onClick={runSimulation}
                        disabled={isSimulating}
                        className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${isSimulating ? 'bg-bg-subtle text-text-muted cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-200'}`}
                    >
                        {isSimulating ? (
                            <>
                                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                מחשב...
                            </>
                        ) : (
                            <>
                                <ArrowPathIcon className="w-5 h-5" />
                                הרץ סימולציה
                            </>
                        )}
                    </button>
                </div>

                <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-8 lg:gap-12 bg-bg-subtle/10">
                    {/* Dynamic Simulator Inputs */}
                    <div className="space-y-8">
                        {/* Candidate Profile Card */}
                        <div className="bg-white rounded-2xl border border-border-default shadow-sm">
                            <div className="bg-bg-subtle rounded-t-2xl px-5 py-3.5 border-b border-border-default flex items-center gap-2.5 font-bold text-text-default">
                                <UserGroupIcon className="w-5 h-5 text-primary-500" />
                                פרופיל מועמד ומשרה
                            </div>
                            
                            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-5">
                                    <div>
                                        <label className="text-xs font-bold text-text-default block mb-2 flex justify-between items-center">
                                            <span>גיל המועמד</span>
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] text-text-muted flex items-center gap-1 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={simCandidate.ignoreAge}
                                                        onChange={(e) => setSimCandidate(prev => ({ ...prev, ignoreAge: e.target.checked }))}
                                                        className="rounded border-border-default text-primary-500 focus:ring-primary-500 w-3 h-3"
                                                    />
                                                    התעלם (ללא דרישה)
                                                </label>
                                                {!simCandidate.ignoreAge && <span className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">{simCandidate.age}</span>}
                                            </div>
                                        </label>
                                        <input 
                                            type="range" min="18" max="70" value={simCandidate.age}
                                            disabled={simCandidate.ignoreAge}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, age: parseInt(e.target.value) }))}
                                            className={`w-full h-2 rounded-lg appearance-none accent-primary-500 ${simCandidate.ignoreAge ? 'bg-bg-subtle/50 cursor-not-allowed opacity-50' : 'bg-bg-subtle cursor-pointer'}`}
                                        />
                                        <div className="flex justify-between text-[10px] text-text-muted mt-1.5 font-medium">
                                            <span>18</span>
                                            <span>70</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-text-default block mb-2 flex justify-between items-center">
                                            <span>מרחק מהמשרה (ק"מ)</span>
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] text-text-muted flex items-center gap-1 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={simCandidate.missingAddress}
                                                        onChange={(e) => setSimCandidate(prev => ({ ...prev, missingAddress: e.target.checked }))}
                                                        className="rounded border-border-default text-primary-500 focus:ring-primary-500 w-3 h-3"
                                                    />
                                                    ללא כתובת
                                                </label>
                                                {!simCandidate.missingAddress && <span className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">{simCandidate.distance} ק"מ</span>}
                                            </div>
                                        </label>
                                        <input 
                                            type="range" min="0" max="100" value={simCandidate.distance}
                                            disabled={simCandidate.missingAddress}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, distance: parseInt(e.target.value) }))}
                                            className={`w-full h-2 rounded-lg appearance-none accent-primary-500 ${simCandidate.missingAddress ? 'bg-bg-subtle/50 cursor-not-allowed opacity-50' : 'bg-bg-subtle cursor-pointer'}`}
                                        />
                                        <div className="flex justify-between text-[10px] text-text-muted mt-1.5 font-medium">
                                            <span>0</span>
                                            <span>100</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <div>
                                        <label className="text-xs font-bold text-text-default block mb-2">אזור המשרה (רגישות גיאוגרפית)</label>
                                        <select 
                                            value={simCandidate.region}
                                            disabled={simCandidate.missingAddress}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, region: e.target.value }))}
                                            className={`w-full p-2.5 text-sm rounded-xl border border-border-default focus:ring-2 focus:ring-primary-500 outline-none font-medium transition-colors ${simCandidate.missingAddress ? 'bg-bg-subtle/50 text-text-muted cursor-not-allowed' : 'bg-bg-input hover:border-primary-300'}`}
                                        >
                                            <option value="center">מרכז וגוש דן (רגישות גבוהה)</option>
                                            <option value="north_south">צפון / דרום / פריפריה (רגישות נמוכה)</option>
                                            <option value="jerusalem">ירושלים והסביבה</option>
                                        </select>
                                    </div>

                                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 space-y-3">
                                        <div className="text-[11px] text-blue-800 font-bold uppercase flex items-center gap-1.5">
                                            <BriefcaseIcon className="w-3.5 h-3.5" />
                                            הגדרות המשרה בסימולציה
                                        </div>
                                        <div className="space-y-2.5">
                                            <div className="flex items-center gap-2">
                                                <label className="text-[11px] text-blue-800/80 font-medium w-24">טווח גילאים:</label>
                                                <div className="flex items-center gap-1.5 flex-1 bg-white border border-blue-200 rounded-md px-3 py-1.5 text-sm text-blue-900 shadow-sm justify-center">
                                                    <span>{simJob.ageMin}</span>
                                                    <span className="text-blue-800/50 font-bold">-</span>
                                                    <span>{simJob.ageMax}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                <label className="text-[11px] text-blue-800/80 font-medium w-24">תעשייה:</label>
                                                <input 
                                                    type="text" 
                                                    value={simJob.industry} 
                                                    onChange={e => setSimJob(prev => ({...prev, industry: e.target.value}))}
                                                    className="flex-1 w-full bg-white border border-blue-200 rounded-md px-3 py-1.5 text-sm text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Salary & Penalty Card */}
                        <div className="bg-white rounded-2xl border border-border-default shadow-sm overflow-hidden">
                            <div className="bg-bg-subtle px-5 py-3.5 border-b border-border-default flex items-center gap-2.5 font-bold text-text-default">
                                <AdjustmentsHorizontalIcon className="w-5 h-5 text-primary-500" />
                                סימולציית שכר וקנסות
                            </div>
                            
                            <div className="p-5 space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-xs font-bold text-text-default block mb-2 flex justify-between items-center">
                                            <span>ציפיות שכר (מועמד)</span>
                                            <div className="flex items-center gap-2">
                                                <label className="text-[10px] text-text-muted flex items-center gap-1 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={simCandidate.missingSalary}
                                                        onChange={(e) => setSimCandidate(prev => ({ ...prev, missingSalary: e.target.checked }))}
                                                        className="rounded border-border-default text-primary-500 focus:ring-primary-500 w-3 h-3"
                                                    />
                                                    ללא ציפיות שכר
                                                </label>
                                                {!simCandidate.missingSalary && <span className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md font-bold">₪{simCandidate.expectedSalary.toLocaleString()}</span>}
                                            </div>
                                        </label>
                                        <input 
                                            type="range" min="10000" max="50000" step="1000" value={simCandidate.expectedSalary}
                                            disabled={simCandidate.missingSalary}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, expectedSalary: parseInt(e.target.value) }))}
                                            className={`w-full h-2 rounded-lg appearance-none accent-primary-500 ${simCandidate.missingSalary ? 'bg-bg-subtle/50 cursor-not-allowed opacity-50' : 'bg-bg-subtle cursor-pointer'}`}
                                        />
                                        <div className="flex justify-between text-[10px] text-text-muted mt-1.5 font-medium">
                                            <span>10K</span>
                                            <span>50K</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-text-default block mb-2 flex justify-between items-center">
                                            <span>שכר מוצע (משרה)</span>
                                            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-bold">₪{simCandidate.offeredSalary.toLocaleString()}</span>
                                        </label>
                                        <input 
                                            type="range" min="10000" max="50000" step="1000" value={simCandidate.offeredSalary}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, offeredSalary: parseInt(e.target.value) }))}
                                            className="w-full h-2 rounded-lg appearance-none accent-emerald-500 bg-bg-subtle cursor-pointer"
                                        />
                                        <div className="flex justify-between text-[10px] text-text-muted mt-1.5 font-medium">
                                            <span>10K</span>
                                            <span>50K</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-5 border-t border-border-subtle grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100/50">
                                        <label className="text-[10px] font-bold text-purple-900 block mb-3 flex justify-between items-center">
                                            <span>סף פער שכר</span>
                                            <span className="text-purple-700 font-black">{simCandidate.simSalaryDiffThreshold}%</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="50" step="5" value={simCandidate.simSalaryDiffThreshold}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, simSalaryDiffThreshold: parseInt(e.target.value) }))}
                                            className="w-full h-2 rounded-lg appearance-none accent-purple-500 bg-purple-200/50 cursor-pointer"
                                        />
                                    </div>
                                    <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100/50">
                                        <label className="text-[10px] font-bold text-rose-900 block mb-3 flex justify-between items-center">
                                            <span>קנס פער שכר</span>
                                            <span className="text-rose-700 font-black">-{simCandidate.simSalaryPenalty}</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="20" value={simCandidate.simSalaryPenalty}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, simSalaryPenalty: parseInt(e.target.value) }))}
                                            className="w-full h-2 rounded-lg appearance-none accent-rose-500 bg-rose-200/50 cursor-pointer"
                                        />
                                    </div>
                                    <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-100/50">
                                        <label className="text-[10px] font-bold text-orange-900 block mb-3 flex justify-between items-center">
                                            <span>קנס שנת חריגה (גיל)</span>
                                            <span className="text-orange-700 font-black">-{simCandidate.simAgeGapPenalty}</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="10" value={simCandidate.simAgeGapPenalty}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, simAgeGapPenalty: parseInt(e.target.value) }))}
                                            className="w-full h-2 rounded-lg appearance-none accent-orange-500 bg-orange-200/50 cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Performance Card */}
                        <div className="bg-white rounded-2xl border border-border-default shadow-sm overflow-hidden">
                            <div className="bg-bg-subtle px-5 py-3.5 border-b border-border-default flex items-center gap-2.5 font-bold text-text-default">
                                <SparklesIcon className="w-5 h-5 text-primary-500" />
                                ביצועי מועמד (0-100%)
                            </div>
                            
                            <div className="p-5 space-y-8">
                                {/* Main Sliders */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="text-xs font-bold text-text-default block mb-2 flex justify-between">
                                            <span>התאמה סמנטית (Vector)</span>
                                            <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded-md">{simCandidate.vectorScore}%</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="100" value={simCandidate.vectorScore}
                                            onChange={(e) => setSimCandidate(prev => ({ ...prev, vectorScore: parseInt(e.target.value) }))}
                                            className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                        />
                                    </div>

                                    {isExperienceEnabled && (
                                        <div>
                                            <label className="text-xs font-bold text-text-default block mb-2 flex justify-between">
                                                <span>הלימה לתעשייה (Experience)</span>
                                                <span className="text-primary-600 font-bold bg-primary-50 px-2 py-0.5 rounded-md">{simCandidate.industryMatch}%</span>
                                            </label>
                                            <input 
                                                type="range" min="0" max="100" value={simCandidate.industryMatch}
                                                onChange={(e) => setSimCandidate(prev => ({ ...prev, industryMatch: parseInt(e.target.value) }))}
                                                className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Tag Sliders */}
                                <div className="space-y-4 pt-5 border-t border-border-subtle/50">
                                    <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">התאמה לפי סוגי תגיות:</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {tagWeights.filter(w => w.value > 0).map(w => (
                                            <div key={w.id} className="p-3.5 bg-bg-subtle/30 rounded-xl border border-border-subtle hover:border-primary-200 transition-colors">
                                                <label className="text-xs font-bold text-text-default block mb-3 flex justify-between items-center">
                                                    <span className="flex items-center gap-1.5">
                                                        {w.icon}
                                                        {w.label}
                                                    </span>
                                                    <span className="text-primary-600 font-black">{simCandidate.tagScores[w.id] || 0}%</span>
                                                </label>
                                                <input 
                                                    type="range" min="0" max="100" value={simCandidate.tagScores[w.id] || 0}
                                                    onChange={(e) => setSimCandidate(prev => ({ 
                                                        ...prev, 
                                                        tagScores: { ...prev.tagScores, [w.id]: parseInt(e.target.value) } 
                                                    }))}
                                                    className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className="text-sm font-bold text-text-default mb-3">תגיות המועמד בסימולציה:</div>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs border border-blue-100 font-medium flex items-center gap-1.5 shadow-sm">
                                    <UserGroupIcon className="w-4 h-4" /> אדמיניסטרציה
                                </span>
                                <span className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs border border-purple-100 font-medium flex items-center gap-1.5 shadow-sm">
                                    <SparklesIcon className="w-4 h-4" /> רכזת גיוס
                                </span>
                                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs border border-emerald-100 font-medium flex items-center gap-1.5 shadow-sm">
                                    <BuildingOffice2Icon className="w-4 h-4" /> כוח אדם
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Results Display */}
                    <div className="relative h-full min-h-[400px]">
                        {!simResult && !isSimulating && (
                            <div className="sticky top-6 flex flex-col items-center justify-center text-center p-10 bg-white rounded-3xl border-2 border-dashed border-border-default shadow-sm h-full max-h-[600px]">
                                <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-6">
                                    <ArrowPathIcon className="w-10 h-10 text-primary-500 opacity-50" />
                                </div>
                                <h4 className="text-xl font-bold text-text-default mb-2">מוכן לסימולציה</h4>
                                <p className="text-text-muted font-medium max-w-xs mx-auto">הזן את נתוני המועמד ולחץ על "הרץ סימולציה" כדי לראות את התוצאות בזמן אמת</p>
                            </div>
                        )}

                        {isSimulating && (
                            <div className="sticky top-6 flex flex-col items-center justify-center text-center p-10 bg-white/90 backdrop-blur-md rounded-3xl border border-primary-100 shadow-xl z-10 h-full max-h-[600px]">
                                <ArrowPathIcon className="w-16 h-16 text-primary-500 animate-spin mb-6" />
                                <div className="text-xl text-primary-700 font-bold">מנתח התאמה רב-שכבתית...</div>
                                <p className="text-primary-500/70 mt-2 text-sm">מחשב וקטורים, תגיות, מרחק ופער שכר</p>
                            </div>
                        )}

                        {simResult && (
                            <div className="sticky top-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white p-8 rounded-3xl border border-border-default shadow-xl">
                                <div className="flex flex-col items-center justify-center pb-8 border-b border-border-subtle">
                                    <div className="text-sm font-bold text-text-muted uppercase tracking-widest mb-3">ציון התאמה סופי</div>
                                    <div className={`text-7xl font-black tracking-tighter ${simResult.score > 80 ? 'text-emerald-600' : simResult.score > 60 ? 'text-blue-600' : 'text-orange-600'}`}>
                                        {simResult.score}<span className="text-4xl opacity-50">%</span>
                                    </div>
                                </div>

                                <div className="space-y-5 pt-2">
                                    {/* Vector */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-purple-500"/> שכבה סמנטית</span>
                                            <span className="text-text-muted">{simResult.breakdown.vector}%</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.vector}%` }}></div>
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><TagIcon className="w-4 h-4 text-blue-500"/> שכבת תגיות</span>
                                            <span className="text-text-muted">{simResult.breakdown.tags}%</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.tags}%` }}></div>
                                        </div>
                                    </div>

                                    {/* Geo */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><GlobeAmericasIcon className="w-4 h-4 text-emerald-500"/> שכבה גיאוגרפית</span>
                                            <span className="text-text-muted">{simResult.breakdown.geo !== null ? `${simResult.breakdown.geo}%` : 'לא חושב'}</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.geo || 0}%` }}></div>
                                        </div>
                                    </div>

                                    {/* Experience */}
                                    {isExperienceEnabled && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm font-bold">
                                                <span className="text-text-default flex items-center gap-2"><BriefcaseIcon className="w-4 h-4 text-orange-500"/> שכבת ניסיון</span>
                                                <span className="text-text-muted">{simResult.breakdown.experience}%</span>
                                            </div>
                                            <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.experience}%` }}></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Age Gap Penalty */}
                                    {simResult.breakdown.ageGapPenalty > 0 && (
                                        <div className="space-y-2 pt-4 mt-2 border-t border-border-subtle">
                                            <div className="flex justify-between text-sm font-bold">
                                                <span className="text-orange-600 flex items-center gap-2"><UserGroupIcon className="w-4 h-4"/> קנס חריגת גיל</span>
                                                <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">-{simResult.breakdown.ageGapPenalty} נק'</span>
                                            </div>
                                            <div className="h-2.5 bg-orange-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 rounded-full transition-all duration-1000" style={{ width: `100%` }}></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Salary Penalty */}
                                    {simResult.breakdown.salaryPenalty > 0 && (
                                        <div className="space-y-2 pt-4 mt-2 border-t border-border-subtle">
                                            <div className="flex justify-between text-sm font-bold">
                                <span className="text-rose-600 flex items-center gap-2"><AdjustmentsHorizontalIcon className="w-4 h-4"/> קנס פער שכר</span>
                                                <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">-{simResult.breakdown.salaryPenalty} נק'</span>
                                            </div>
                                            <div className="h-2.5 bg-rose-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-rose-500 rounded-full transition-all duration-1000" style={{ width: `100%` }}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 p-5 bg-blue-50/50 rounded-2xl border border-blue-100 text-sm text-blue-900 leading-relaxed shadow-sm">
                                    <div className="font-bold mb-2 flex items-center gap-2 text-blue-700">
                                        <InformationCircleIcon className="w-5 h-5" /> ניתוח תוצאות:
                                    </div>
                                    <p className="opacity-90">
                                        המועמד קיבל ציון גבוה בזכות התאמה חזקה בשכבת התגיות (במיוחד בקטגוריית "תפקיד" עם משקל 100). 
                                        {simResult.breakdown.geoMissing && ` שים לב שהציון חושב עם ציון ברירת מחדל של ${missingGeoScore} ברכיב הגיאוגרפי עקב חוסר בכתובת.`}
                                        {simResult.breakdown.salaryPenalty > 0 && <span className="font-bold text-rose-700 block mt-1"> המועמד ספג קנס של {simResult.breakdown.salaryPenalty} נקודות עקב {simResult.breakdown.salaryMissing ? 'חוסר בציפיות שכר' : 'פער בציפיות השכר'}.</span>}
                                        {simResult.breakdown.ageGapPenalty > 0 && <span className="font-bold text-orange-700 block mt-1"> המועמד ספג קנס של {simResult.breakdown.ageGapPenalty} נקודות עקב חריגה מטווח הגילאים (גיל {simResult.candidate.age} מול דרישה ל-{simJob.ageMin}-{simJob.ageMax}).</span>}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Simulation Preview (Simple Formula) */}
            <div className="mt-8 bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                    <ArrowPathIcon className="w-5 h-5 text-primary-500" />
                    תצוגה מקדימה של נוסחת השקלול
                </h3>
                
                <div className="bg-bg-subtle p-6 rounded-xl font-mono text-sm overflow-x-auto text-text-default">
                    <div className="mb-4 text-text-muted">// נוסחת חישוב הציון הסופי (S_total)</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-primary-600 font-bold">S_total</span>
                        <span>=</span>
                        <span className="bg-purple-100 px-2 py-0.5 rounded text-purple-700">({mainWeights[0].value / 100} * S_vector)</span>
                        <span>+</span>
                        <span className="bg-blue-100 px-2 py-0.5 rounded text-blue-700">({mainWeights[1].value / 100} * S_tags)</span>
                        <span>+</span>
                        <span className="bg-emerald-100 px-2 py-0.5 rounded text-emerald-700">({mainWeights[2].value / 100} * S_geo)</span>
                        <span>-</span>
                        <span className="bg-rose-100 px-2 py-0.5 rounded text-rose-700">Penalty_salary</span>
                        <span>-</span>
                        <span className="bg-orange-100 px-2 py-0.5 rounded text-orange-700">Penalty_age</span>
                    </div>
                    
                    <div className="mt-6 mb-2 text-text-muted">// פירוט שכבת התגיות (S_tags)</div>
                    <div className="text-xs text-text-muted italic">
                        S_tags = (Σ (Match_i * Confidence_i * CategoryWeight_i * SourceWeight_i)) / Σ (CategoryWeight_i * SourceWeight_i)
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminMatchingEngineView;
