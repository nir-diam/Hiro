
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    HiroLogotype, CheckCircleIcon, SparklesIcon, UserGroupIcon, 
    BriefcaseIcon, ChartBarIcon, ArrowLeftIcon, RocketLaunchIcon, 
    ChatBubbleBottomCenterTextIcon, BoltIcon, GlobeAmericasIcon,
    MagnifyingGlassIcon, ShareIcon, ShieldCheckIcon, BuildingOffice2Icon
} from './Icons';

// --- UI Components ---

const BentoCard: React.FC<{ 
    className?: string; 
    title: string; 
    subtitle: string; 
    icon?: React.ReactNode;
    children?: React.ReactNode;
    visual?: React.ReactNode;
}> = ({ className, title, subtitle, icon, children, visual }) => (
    <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200 transition-all duration-300 p-8 flex flex-col relative overflow-hidden group ${className}`}>
        <div className="flex items-center gap-3 mb-4 z-10">
            {icon && <div className="p-2 bg-slate-50 rounded-xl text-slate-900">{icon}</div>}
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h3>
        </div>
        <p className="text-slate-500 mb-6 max-w-sm z-10 leading-relaxed text-sm">{subtitle}</p>
        <div className="flex-1 z-10">{children}</div>
        
        {/* Background Visual Area */}
        {visual && (
            <div className="absolute right-0 bottom-0 w-full h-full opacity-50 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                {visual}
            </div>
        )}
    </div>
);

const StatItem: React.FC<{ value: string; label: string }> = ({ value, label }) => (
    <div className="text-center p-4">
        <div className="text-4xl font-extrabold text-slate-900 mb-1 tracking-tight">
            {value}
        </div>
        <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
);

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen bg-[#FAFAFA] font-sans text-slate-800 overflow-x-hidden selection:bg-purple-100 selection:text-purple-900" dir="rtl">
            <style>{`
                .bg-grid {
                    background-size: 40px 40px;
                    background-image: linear-gradient(to right, rgba(0, 0, 0, 0.04) 1px, transparent 1px),
                                      linear-gradient(to bottom, rgba(0, 0, 0, 0.04) 1px, transparent 1px);
                }
                .text-gradient {
                    background: linear-gradient(135deg, #1e293b 0%, #6366f1 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
            `}</style>

            {/* Navbar */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl shadow-sm py-4' : 'bg-transparent py-6'}`}>
                <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo(0,0)}>
                        <HiroLogotype className="h-7 text-slate-900" />
                    </div>
                    <div className="hidden md:flex items-center gap-10 font-medium text-sm text-slate-600">
                        <a href="#platform" className="hover:text-purple-600 transition-colors">המאגר המשותף</a>
                        <a href="#candidates" className="hover:text-purple-600 transition-colors">למועמדים</a>
                        <a href="#features" className="hover:text-purple-600 transition-colors">פיצ'רים</a>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/candidate-portal/login')} className="text-sm font-bold text-slate-600 hover:text-purple-600 transition-colors hidden sm:block">
                            כניסת מועמדים
                        </button>
                        <button onClick={() => navigate('/login')} className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold px-6 py-2.5 rounded-full transition-all shadow-lg shadow-slate-900/20 hover:scale-105">
                            כניסת מעסיקים
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
                <div className="absolute inset-0 bg-grid [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]"></div>
                
                {/* Background Glows */}
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-100/40 rounded-full blur-[100px] pointer-events-none"></div>

                <div className="max-w-5xl mx-auto px-6 relative z-10 text-center">
                    <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-full px-4 py-1.5 shadow-sm mb-8 animate-fade-in hover:border-purple-200 transition-colors cursor-default">
                        <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-xs font-bold text-slate-600 tracking-wide">מעל 200,000 פרופילים פעילים</span>
                    </div>
                    
                    <h1 className="text-5xl lg:text-8xl font-black tracking-tight text-slate-900 mb-8 leading-[1.1]">
                        הלינקדאין של<br/>
                        <span className="text-gradient">עולם התעשייה.</span>
                    </h1>
                    
                    <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
                        הפלטפורמה הראשונה שמאחדת את עולמות התעשייה, הלוגיסטיקה והקמעונאות.
                        <br className="hidden sm:block"/>
                        כל מועמד שמגיש אליכם מועמדות - מצטרף אוטומטית למאגר הפרטי והמשותף שלכם.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
                        <button onClick={() => navigate('/admin/jobs')} className="h-12 px-8 rounded-full bg-slate-900 text-white font-bold text-base hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-900/10 hover:shadow-slate-900/20 hover:-translate-y-0.5">
                            <RocketLaunchIcon className="w-5 h-5"/>
                            הצטרף למאגר
                        </button>
                        <button onClick={() => navigate('/dashboard')} className="h-12 px-8 rounded-full bg-white text-slate-900 border border-slate-200 font-bold text-base hover:bg-slate-50 transition-all flex items-center gap-2 hover:border-slate-300">
                            סיור במערכת
                        </button>
                    </div>

                    {/* Abstract UI Element - Candidate Cards Flow */}
                    <div className="relative mx-auto max-w-4xl">
                         {/* Card Stack Animation */}
                        <div className="relative z-10 flex justify-center -space-x-4 md:-space-x-8 hover:space-x-2 transition-all duration-500">
                            
                             {/* Card 1 */}
                            <div className="w-48 md:w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 transform -rotate-6 translate-y-4 hover:rotate-0 transition-transform duration-300 z-10">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">ד</div>
                                    <div className="text-right">
                                        <div className="font-bold text-sm">דניאל כהן</div>
                                        <div className="text-xs text-slate-500">מנהל מחסן</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full"></div>
                                    <div className="h-1.5 w-3/4 bg-slate-100 rounded-full"></div>
                                </div>
                                <div className="mt-3 flex gap-1">
                                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">רישיון מלגזה</span>
                                </div>
                            </div>

                             {/* Card 2 (Center) */}
                             <div className="w-48 md:w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 transform z-20 scale-110">
                                <div className="absolute -top-3 -right-3 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md animate-bounce">
                                    פרופיל נוצר!
                                </div>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700">ר</div>
                                    <div className="text-right">
                                        <div className="font-bold text-sm">רונית לוי</div>
                                        <div className="text-xs text-slate-500">מנהלת ייצור</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full">
                                         <div className="h-1.5 w-4/5 bg-purple-500 rounded-full"></div>
                                    </div>
                                    <div className="h-1.5 w-1/2 bg-slate-100 rounded-full"></div>
                                </div>
                                <div className="mt-3 flex gap-1 flex-wrap">
                                    <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded">מהנדסת תעו"נ</span>
                                    <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded">ניהול צוות</span>
                                </div>
                            </div>

                             {/* Card 3 */}
                             <div className="w-48 md:w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 transform rotate-6 translate-y-4 hover:rotate-0 transition-transform duration-300 z-10">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-700">מ</div>
                                    <div className="text-right">
                                        <div className="font-bold text-sm">משה פרץ</div>
                                        <div className="text-xs text-slate-500">נהג חלוקה</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full"></div>
                                    <div className="h-1.5 w-5/6 bg-slate-100 rounded-full"></div>
                                </div>
                                <div className="mt-3 flex gap-1">
                                    <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded">רישיון ג'</span>
                                </div>
                            </div>

                        </div>
                        {/* Glow under UI */}
                        <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-purple-500 opacity-20 blur-3xl -z-10 rounded-[3rem] top-10"></div>
                    </div>

                </div>
            </section>

            {/* Social Proof */}
            <div className="border-y border-slate-100 bg-white/50">
                <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-x-reverse divide-slate-100">
                    <StatItem value="200k+" label="מועמדי תעשייה" />
                    <StatItem value="150+" label="חברות מגייסות" />
                    <StatItem value="100%" label="חוקי ופרטי" />
                    <StatItem value="X3" label="מהירות גיוס" />
                </div>
            </div>

            {/* Bento Grid Section - The Core Platform */}
            <section className="py-32 bg-white" id="platform">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="mb-20 text-center max-w-3xl mx-auto">
                        <h2 className="text-4xl lg:text-5xl font-black text-slate-900 mb-6 tracking-tight">איך גלגל התנופה עובד?</h2>
                        <p className="text-xl text-slate-500 leading-relaxed">
                            המערכת שלנו הופכת כל הגשת מועמדות לפרופיל דיגיטלי חי.
                            <br/>
                            אתם מפרסמים כרגיל, אנחנו בונים לכם את המאגר.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(300px,auto)]">
                        
                        {/* 1. Candidate Pool - Large Card */}
                        <BentoCard 
                            className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-transparent"
                            title="מאגר התעשייה הישראלי"
                            subtitle="גישה ל-200,000 עובדי כפיים, ייצור, לוגיסטיקה וקמעונאות. מצא את המלגזן או המהנדס הבא שלך בשניות, בלי לחכות לקורות חיים."
                            icon={<GlobeAmericasIcon className="w-6 h-6 text-blue-300"/>}
                            visual={
                                <div className="absolute bottom-0 right-0 w-full h-1/2 bg-gradient-to-t from-black/20 to-transparent p-6 flex flex-col justify-end">
                                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/10 flex items-center gap-4 max-w-md mr-auto transform translate-y-4 group-hover:translate-y-0 transition-transform">
                                        <div className="bg-green-500/20 p-2 rounded-lg text-green-300"><CheckCircleIcon className="w-5 h-5"/></div>
                                        <div>
                                            <div className="text-sm font-bold text-white">נמצאו 14 כרסמים (CNC)</div>
                                            <div className="text-xs text-slate-300">אזור התעשייה קיסריה • זמינות מיידית</div>
                                        </div>
                                    </div>
                                </div>
                            }
                        >
                            <button onClick={() => navigate('/candidate-pool')} className="mt-6 bg-white text-slate-900 px-6 py-2.5 rounded-full font-bold text-sm hover:bg-blue-50 transition-colors">
                                חיפוש במאגר &larr;
                            </button>
                        </BentoCard>

                        {/* 2. Automated Profiles */}
                        <BentoCard 
                            title="בניית פרופיל אוטומטית"
                            subtitle="מועמד הגיש קו''ח בלוח דרושים? המערכת שולחת לו מייל, בונה לו אזור אישי, ומאפשרת לו לעדכן פרטים ולסמן זמינות."
                            icon={<SparklesIcon className="w-6 h-6 text-purple-600"/>}
                            className="md:row-span-2"
                            visual={
                                <div className="absolute inset-x-6 bottom-0 top-1/2 bg-slate-50 rounded-t-xl border-x border-t border-slate-200 p-4 opacity-80 group-hover:translate-y-2 transition-transform">
                                    <div className="text-center mb-2 text-xs font-bold text-purple-600">דוא"ל נשלח למועמד:</div>
                                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 text-xs">
                                        <p className="font-bold">היי רונן, הפרופיל שלך מוכן!</p>
                                        <p className="text-slate-500 mt-1">היכנס לאזור האישי כדי לשפר את הסיכויים שלך...</p>
                                    </div>
                                </div>
                            }
                        />

                        {/* 3. Privacy & Blocking */}
                        <BentoCard 
                            title="פרטיות ושליטה למועמד"
                            subtitle="המועמדים מצטרפים כי אנחנו שומרים עליהם. אפשרות לחסימת מעסיקים נוכחיים וניהול דיסקרטיות."
                            icon={<ShieldCheckIcon className="w-6 h-6 text-green-500"/>}
                            visual={
                                <div className="absolute bottom-6 left-6 right-6">
                                    <div className="flex items-center gap-3 bg-red-50 rounded-xl p-3 border border-red-100">
                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-red-500 shadow-sm"><BoltIcon className="w-4 h-4"/></div>
                                        <div>
                                            <div className="text-xs font-bold text-slate-900">חסימת מעסיק</div>
                                            <div className="text-[10px] text-slate-500">הפרופיל מוסתר מפני "אלקטרה בע''מ"</div>
                                        </div>
                                    </div>
                                </div>
                            }
                        />

                        {/* 4. One Dashboard */}
                        <BentoCard 
                            title="מערכת גיוס מלאה"
                            subtitle="ATS מלא לניהול כל תהליך הגיוס, כולל פרסום משרות, ניהול מועמדים וחוזים."
                            icon={<BuildingOffice2Icon className="w-6 h-6 text-blue-500"/>}
                        />
                    </div>
                </div>
            </section>

            {/* Candidate Value Prop Section */}
            <section className="py-24 bg-slate-50 border-t border-slate-200" id="candidates">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <div className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold mb-4">
                                למועמדים
                            </div>
                            <h2 className="text-4xl font-black text-slate-900 mb-6">הפרופיל המקצועי שלך. לתמיד.</h2>
                            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                                במקום לשלוח קובץ וורד שנעלם במיילים, בנה לעצמך פרופיל מקצועי ב-Hiro.
                                <br/><br/>
                                אנחנו נציג אותך למעסיקים המובילים במשק, בדיוק כשאתה מחפש, ובדיסקרטיות מלאה.
                            </p>
                            
                            <ul className="space-y-4">
                                {[
                                    'פרופיל אחד לכל המשרות בתעשייה',
                                    'עדכון סטטוס זמינות בקליק (פנוי / עובד)',
                                    'חסימת המעסיק הנוכחי שלך'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-slate-800 font-medium">
                                        <CheckCircleIcon className="w-5 h-5 text-green-600"/>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            
                             <button onClick={() => navigate('/candidate-portal/register')} className="mt-8 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl transition shadow-lg shadow-green-600/20">
                                פתח פרופיל בחינם
                            </button>
                        </div>
                        
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-green-200 to-blue-200 rounded-3xl rotate-3 opacity-30 blur-xl"></div>
                            <div className="relative bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                                <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                        <div className="h-3 w-20 bg-gray-200 rounded"></div>
                                    </div>
                                    <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">מחפש עבודה</div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="flex gap-2">
                                        <div className="h-8 w-24 bg-slate-100 rounded-lg"></div>
                                        <div className="h-8 w-24 bg-slate-100 rounded-lg"></div>
                                        <div className="h-8 w-24 bg-slate-100 rounded-lg"></div>
                                    </div>
                                    <div className="h-24 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm">
                                        היסטוריה תעסוקתית ורישיונות
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 bg-slate-900 text-white relative overflow-hidden">
                 {/* Decorative background elements */}
                 <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[128px] opacity-40 transform translate-x-1/2 -translate-y-1/2"></div>
                 <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[128px] opacity-40 transform -translate-x-1/2 translate-y-1/2"></div>

                 <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                     <h2 className="text-5xl md:text-7xl font-black mb-8 tracking-tight">הצטרפו למהפכה בתעשייה</h2>
                     <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto">
                         אלפי חברות ועובדים כבר מחוברים.
                         <br/>
                         הצטרפו היום והתחילו לגייס (או למצוא עבודה) בצורה חכמה יותר.
                     </p>
                     <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <button onClick={() => navigate('/admin/jobs')} className="bg-white text-slate-900 font-bold text-lg px-10 py-4 rounded-full hover:bg-blue-50 transition shadow-xl shadow-white/10 hover:scale-105">
                            אני מעסיק - התחל חינם
                        </button>
                        <button onClick={() => navigate('/candidate-portal/register')} className="bg-transparent border border-slate-600 text-white font-bold text-lg px-10 py-4 rounded-full hover:bg-white/10 transition">
                            אני מחפש עבודה
                        </button>
                     </div>
                 </div>
            </section>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-100 py-12">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2 opacity-80">
                        <HiroLogotype className="h-6 text-slate-900" />
                        <span className="text-sm text-slate-500">© 2025 Hiro Systems</span>
                    </div>
                    <div className="flex gap-8 text-sm font-medium text-slate-500">
                        <a href="#" className="hover:text-purple-600 transition-colors">אודות</a>
                        <a href="#" className="hover:text-purple-600 transition-colors">מאגר מועמדים</a>
                        <a href="#" className="hover:text-purple-600 transition-colors">תנאי שימוש</a>
                        <a href="#" className="hover:text-purple-600 transition-colors">פרטיות</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
