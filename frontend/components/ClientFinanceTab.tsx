
import React, { useState } from 'react';
import { 
    DocumentTextIcon, PencilIcon, CheckCircleIcon, BanknotesIcon, 
    ArrowDownTrayIcon, EyeIcon, CreditCardIcon, CalculatorIcon, ClockIcon,
    PlusIcon, MinusIcon
} from './Icons';
import { useLanguage } from '../context/LanguageContext';

interface ClientFinanceTabProps {
    clientName: string;
}

const ClientFinanceTab: React.FC<ClientFinanceTabProps> = ({ clientName }) => {
    const { t } = useLanguage();
    const [isEditing, setIsEditing] = useState(false); // Can be used to toggle read-only mode if needed
    
    // Mock Data State
    const [financeData, setFinanceData] = useState({
        vatNumber: '512345678',
        paymentTerms: 'שוטף + 30',
        commissionRate: 100, // Default 100%
        agreementType: 'השמה מלאה (100%)',
        hasSignedContract: true,
        contractDate: '31/12/2026'
    });

    const handleSave = () => {
        setIsEditing(false);
        // Save logic here (API call)
        console.log("Saved finance data:", financeData);
    };

    const adjustCommission = (amount: number) => {
        setFinanceData(prev => ({
            ...prev,
            commissionRate: Math.max(0, prev.commissionRate + amount)
        }));
    };

    return (
        <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
            
            {/* 1. Contract Status Card */}
            <div className="bg-bg-card border border-border-default rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                <div className="flex items-center gap-5 z-10">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm ${financeData.hasSignedContract ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-gray-100 text-gray-400'}`}>
                        <DocumentTextIcon className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-text-default flex items-center gap-2">
                            הסכם התקשרות חתום
                            {financeData.hasSignedContract && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
                        </h3>
                        <p className="text-sm text-text-muted mt-1">
                            {financeData.hasSignedContract 
                                ? `הסכם מסגרת לשירותי השמה, בתוקף עד ${financeData.contractDate}` 
                                : 'טרם נחתם הסכם התקשרות'}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3 w-full md:w-auto z-10">
                    <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-border-default text-text-default rounded-xl font-bold hover:bg-bg-subtle transition-colors shadow-sm">
                        <ArrowDownTrayIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">הורד הסכם</span>
                        <span className="sm:hidden">הורד</span>
                    </button>
                    <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-50 text-primary-700 border border-primary-200 rounded-xl font-bold hover:bg-primary-100 transition-colors shadow-sm">
                        <EyeIcon className="w-5 h-5" />
                        <span>צפייה בהסכם</span>
                    </button>
                </div>
            </div>

            {/* 2. Billing Settings Form */}
            <div className="bg-bg-card border border-border-default rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-border-default bg-bg-subtle/30 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-text-default flex items-center gap-2">
                        <BanknotesIcon className="w-6 h-6 text-primary-500" />
                        הגדרות חיוב ותשלום
                    </h3>
                    <div className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                        פעיל לחיוב
                    </div>
                </div>
                
                <div className="p-6 md:p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                        
                        {/* VAT Number */}
                        <div>
                            <label className="block text-sm font-bold text-text-muted mb-2">ח.פ / מספר עוסק</label>
                            <div className="relative group">
                                <input 
                                    type="text" 
                                    value={financeData.vatNumber}
                                    onChange={(e) => setFinanceData({...financeData, vatNumber: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-4 pl-12 text-right font-mono text-sm font-medium focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                                    placeholder="51..."
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle group-hover:text-primary-500 transition-colors">
                                    <CreditCardIcon className="w-5 h-5" />
                                </div>
                            </div>
                        </div>

                         {/* Terms - Select */}
                         <div>
                            <label className="block text-sm font-bold text-text-muted mb-2">תנאי תשלום</label>
                            <div className="relative">
                                <select 
                                    value={financeData.paymentTerms}
                                    onChange={(e) => setFinanceData({...financeData, paymentTerms: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-4 text-sm font-medium focus:ring-2 focus:ring-primary-500 transition-all appearance-none cursor-pointer shadow-sm"
                                >
                                    <option>מיידי</option>
                                    <option>שוטף + 30</option>
                                    <option>שוטף + 45</option>
                                    <option>שוטף + 60</option>
                                    <option>שוטף + 90</option>
                                </select>
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
                                    <ClockIcon className="w-4 h-4" />
                                </div>
                            </div>
                        </div>

                         {/* Commission - Number with +/- */}
                         <div>
                            <label className="block text-sm font-bold text-text-muted mb-2">אחוז עמלה מוסכם</label>
                            <div className="relative flex items-center">
                                <button 
                                    onClick={() => adjustCommission(-5)}
                                    className="absolute right-2 p-1.5 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                                >
                                    <MinusIcon className="w-4 h-4" />
                                </button>
                                
                                <input 
                                    type="number" 
                                    value={financeData.commissionRate}
                                    onChange={(e) => setFinanceData({...financeData, commissionRate: Number(e.target.value)})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-12 text-center font-black text-lg focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                                />
                                <span className="absolute left-10 top-1/2 -translate-y-1/2 text-text-subtle font-bold text-lg">%</span>
                                
                                <button 
                                    onClick={() => adjustCommission(5)}
                                    className="absolute left-2 p-1.5 text-text-muted hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors z-10"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Agreement Type - Select */}
                        <div>
                            <label className="block text-sm font-bold text-text-muted mb-2">סוג הסכם</label>
                            <div className="relative">
                                <select 
                                    value={financeData.agreementType}
                                    onChange={(e) => setFinanceData({...financeData, agreementType: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-4 text-sm font-medium focus:ring-2 focus:ring-primary-500 transition-all appearance-none cursor-pointer shadow-sm"
                                >
                                    <option>השמה מלאה (100%)</option>
                                    <option>השמה מדורגת (50/50)</option>
                                    <option>ריטיינר חודשי</option>
                                    <option>השמה בכירים</option>
                                    <option>השמה חלקית</option>
                                </select>
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
                                    <CalculatorIcon className="w-4 h-4" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 bg-bg-subtle/50 border-t border-border-default flex justify-end">
                    <button 
                        onClick={handleSave}
                        className="bg-primary-600 text-white font-bold py-3 px-10 rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-500/30 transition-all transform active:scale-95"
                    >
                        שמור הגדרות כספים
                    </button>
                </div>
            </div>

            {/* 3. History Banner */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center sm:items-start gap-4 shadow-sm">
                <div className="p-3 bg-white rounded-full text-blue-600 shadow-sm mt-1 ring-4 ring-blue-50/50">
                    <ClockIcon className="w-6 h-6" />
                </div>
                <div className="flex-1 text-center sm:text-right">
                    <h4 className="text-base font-bold text-blue-900 mb-1">היסטוריית חיובים וגבייה</h4>
                    <p className="text-sm text-blue-800/80 leading-relaxed">
                        ללקוח זה הופקו <span className="font-bold text-blue-900 bg-blue-100 px-1 rounded">3 חשבוניות</span> בסך כולל של <span className="font-bold text-blue-900 text-lg">45,000 ₪</span>.
                        <br className="hidden sm:block"/>
                        החשבונית האחרונה הופקה ב-15/10/2025 ושולמה במלואה.
                    </p>
                </div>
                <button className="text-sm font-bold text-primary-600 bg-white border border-primary-200 px-5 py-2.5 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-all shadow-sm whitespace-nowrap self-center sm:self-auto">
                    לכל המסמכים
                </button>
            </div>

        </div>
    );
};

export default ClientFinanceTab;
