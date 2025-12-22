
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    BriefcaseIcon, BuildingOffice2Icon, UserIcon, CheckCircleIcon, 
    ArrowLeftIcon, SparklesIcon, WalletIcon, MapPinIcon
} from './Icons';
import { GoogleGenAI } from '@google/genai';

// Reusing simplified form components
const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; required?: boolean; type?: string }> = ({ label, name, value, onChange, placeholder, required, type = 'text' }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-3 transition shadow-sm" />
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number; placeholder?: string; required?: boolean }> = ({ label, name, value, onChange, rows = 4, placeholder, required }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
        <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder} required={required} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-3 transition shadow-sm"></textarea>
    </div>
);

const StepIndicator: React.FC<{ currentStep: number; steps: string[] }> = ({ currentStep, steps }) => (
    <div className="flex items-center justify-center w-full mb-8">
        {steps.map((step, index) => (
            <React.Fragment key={index}>
                <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                        index + 1 <= currentStep ? 'bg-primary-600 text-white' : 'bg-bg-subtle text-text-muted border border-border-default'
                    }`}>
                        {index + 1 < currentStep ? <CheckCircleIcon className="w-6 h-6" /> : index + 1}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${index + 1 <= currentStep ? 'text-primary-700' : 'text-text-muted'}`}>{step}</span>
                </div>
                {index < steps.length - 1 && (
                    <div className={`w-16 h-1 mx-2 rounded-full ${index + 1 < currentStep ? 'bg-primary-500' : 'bg-bg-subtle'}`}></div>
                )}
            </React.Fragment>
        ))}
    </div>
);

const PricingCard: React.FC<{ 
    title: string; 
    price: string; 
    features: string[]; 
    recommended?: boolean; 
    selected: boolean; 
    onSelect: () => void; 
}> = ({ title, price, features, recommended, selected, onSelect }) => (
    <div 
        onClick={onSelect}
        className={`relative rounded-2xl p-6 cursor-pointer transition-all duration-300 border-2 flex flex-col h-full ${
            selected 
                ? 'border-primary-500 bg-primary-50 shadow-lg transform scale-105' 
                : 'border-border-default bg-bg-card hover:border-primary-200 hover:shadow-md'
        }`}
    >
        {recommended && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary-600 to-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                מומלץ
            </div>
        )}
        <h3 className="text-lg font-bold text-text-default text-center mb-2">{title}</h3>
        <div className="text-center mb-6">
            <span className="text-3xl font-extrabold text-text-default">{price}</span>
            {price !== 'חינם' && <span className="text-text-muted text-sm">/ משרה</span>}
        </div>
        <ul className="space-y-3 mb-6 flex-grow">
            {features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-text-default">
                    <CheckCircleIcon className={`w-5 h-5 flex-shrink-0 ${selected ? 'text-primary-600' : 'text-text-muted'}`} />
                    {feature}
                </li>
            ))}
        </ul>
        <div className={`w-full py-2 rounded-lg text-center font-bold text-sm transition-colors ${
            selected ? 'bg-primary-600 text-white' : 'bg-bg-subtle text-text-default'
        }`}>
            {selected ? 'נבחר' : 'בחר חבילה'}
        </div>
    </div>
);

const ExternalJobPostView: React.FC = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedPackage, setSelectedPackage] = useState<'basic' | 'pro' | 'premium'>('pro');
    const [isSuccess, setIsSuccess] = useState(false);

    const [formData, setFormData] = useState({
        // Company Info
        companyName: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        website: '',
        // Job Info
        jobTitle: '',
        location: '',
        jobType: 'משרה מלאה',
        description: '',
        requirements: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleNext = () => {
        if (currentStep < 3) setCurrentStep(currentStep + 1);
        else handleSubmit();
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const handleSubmit = () => {
        // In a real app, submit to API here
        console.log('Submitting external job:', { ...formData, package: selectedPackage });
        setIsSuccess(true);
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-bg-default flex items-center justify-center p-4">
                <div className="bg-bg-card p-8 rounded-2xl shadow-xl max-w-lg w-full text-center border border-border-default">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircleIcon className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-text-default mb-2">המשרה פורסמה בהצלחה!</h2>
                    <p className="text-text-muted mb-6">
                        המשרה הועברה לאישור צוות המערכת. <br/>
                        שלחנו מייל לכתובת <strong>{formData.contactEmail}</strong> עם פרטי גישה לניהול המועמדים.
                    </p>
                    <div className="flex flex-col gap-3">
                        <button onClick={() => navigate('/job-board')} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition">
                            חזרה ללוח המשרות
                        </button>
                        <button onClick={() => { setIsSuccess(false); setCurrentStep(1); setFormData({...formData, jobTitle: ''}); }} className="w-full bg-bg-subtle text-text-default font-bold py-3 rounded-lg hover:bg-bg-hover transition">
                            פרסם משרה נוספת
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg-subtle/50 flex flex-col">
            {/* Simplified Header */}
            <header className="bg-bg-card border-b border-border-default p-4">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <button onClick={() => navigate('/job-board')} className="text-text-muted hover:text-primary-600 flex items-center gap-2 font-semibold transition">
                        <ArrowLeftIcon className="w-5 h-5" />
                        חזרה לאתר
                    </button>
                    <div className="text-xl font-extrabold text-text-default">פרסום משרה חדשה</div>
                    <div className="w-24"></div> {/* Spacer */}
                </div>
            </header>

            <main className="flex-grow p-6">
                <div className="max-w-3xl mx-auto">
                    <StepIndicator currentStep={currentStep} steps={['פרטי חברה', 'פרטי המשרה', 'חבילת פרסום']} />

                    <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 md:p-8 animate-fade-in">
                        
                        {/* Step 1: Company Info */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-text-default">נתחיל עם פרטים בסיסיים</h2>
                                    <p className="text-text-muted">ספר לנו קצת עליך ועל החברה המגייסת</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormInput label="שם החברה" name="companyName" value={formData.companyName} onChange={handleChange} required placeholder="לדוגמה: גוגל ישראל" />
                                    <FormInput label="אתר החברה" name="website" value={formData.website} onChange={handleChange} placeholder="https://..." />
                                </div>

                                <div className="border-t border-border-default my-2"></div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormInput label="שם איש קשר" name="contactName" value={formData.contactName} onChange={handleChange} required />
                                    <FormInput label="טלפון" name="contactPhone" value={formData.contactPhone} onChange={handleChange} required />
                                    <div className="md:col-span-2">
                                        <FormInput label="דוא''ל (לשליחת קו''ח וניהול)" name="contactEmail" value={formData.contactEmail} onChange={handleChange} type="email" required />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Job Details */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-text-default">פרטי המשרה</h2>
                                    <p className="text-text-muted">תיאור מדויק עוזר למצוא את המועמדים המתאימים ביותר</p>
                                </div>

                                <FormInput label="כותרת המשרה" name="jobTitle" value={formData.jobTitle} onChange={handleChange} required placeholder="לדוגמה: מנהל/ת שיווק" />
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <FormInput label="מיקום" name="location" value={formData.location} onChange={handleChange} required placeholder="עיר או אזור" />
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">היקף משרה</label>
                                        <select name="jobType" value={formData.jobType} onChange={handleChange as any} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-3">
                                            <option>משרה מלאה</option>
                                            <option>משרה חלקית</option>
                                            <option>משמרות</option>
                                            <option>פרילנס</option>
                                        </select>
                                    </div>
                                </div>

                                <FormTextArea label="תיאור המשרה" name="description" value={formData.description} onChange={handleChange} rows={5} required placeholder="מה התפקיד כולל? תחומי אחריות, סביבת עבודה..." />
                                <FormTextArea label="דרישות חובה" name="requirements" value={formData.requirements} onChange={handleChange} rows={4} required placeholder="שנות ניסיון, השכלה, שפות, תוכנות..." />
                            </div>
                        )}

                        {/* Step 3: Packages */}
                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-bold text-text-default">בחר מסלול פרסום</h2>
                                    <p className="text-text-muted">איך תרצה לקבל את המועמדים שלך?</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                                    <PricingCard 
                                        title="בסיסי" 
                                        price="חינם" 
                                        selected={selectedPackage === 'basic'}
                                        onSelect={() => setSelectedPackage('basic')}
                                        features={[
                                            "פרסום בלוח המשרות הכללי",
                                            "קבלת קו\"ח למייל",
                                            "עד 10 מועמדים",
                                            "תוקף ל-14 יום"
                                        ]}
                                    />
                                    <PricingCard 
                                        title="מתקדם" 
                                        price="199 ₪" 
                                        selected={selectedPackage === 'pro'}
                                        onSelect={() => setSelectedPackage('pro')}
                                        recommended
                                        features={[
                                            "פרסום מודגש בלוח",
                                            "גישה למערכת ניהול מועמדים",
                                            "סינון מועמדים בסיסי (AI)",
                                            "עד 100 מועמדים",
                                            "תוקף ל-30 יום"
                                        ]}
                                    />
                                    <PricingCard 
                                        title="פרימיום" 
                                        price="499 ₪" 
                                        selected={selectedPackage === 'premium'}
                                        onSelect={() => setSelectedPackage('premium')}
                                        features={[
                                            "חשיפה מקסימלית (כולל רשתות)",
                                            "גישה מלאה למאגר המועמדים",
                                            "סינון ודירוג AI מלא",
                                            "ללא הגבלת מועמדים",
                                            "תוקף ל-60 יום"
                                        ]}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="flex justify-between items-center mt-8 pt-6 border-t border-border-default">
                            {currentStep > 1 ? (
                                <button onClick={handleBack} className="text-text-muted font-bold hover:text-text-default px-4 py-2 transition">חזור</button>
                            ) : (
                                <div></div>
                            )}
                            <button 
                                onClick={handleNext} 
                                className="bg-primary-600 text-white font-bold py-3 px-10 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30 flex items-center gap-2"
                            >
                                {currentStep === 3 ? (selectedPackage === 'basic' ? 'פרסם בחינם' : 'המשך לתשלום ופרסום') : 'המשך'}
                                {currentStep < 3 && <ArrowLeftIcon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ExternalJobPostView;
