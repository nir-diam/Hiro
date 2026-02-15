
import React, { useState, useMemo } from 'react';
import { BanknotesIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, CalendarDaysIcon, ChartBarIcon, PlusIcon } from './Icons';
import { useFinance } from '../context/FinanceContext';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import ManualPlacementModal from './ManualPlacementModal';

const StatCard: React.FC<{ title: string; value: string; subValue?: string; icon: React.ReactNode; color: string }> = ({ title, value, subValue, icon, color }) => (
    <div className="bg-bg-card p-5 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
        <div>
            <p className="text-sm font-semibold text-text-muted mb-1">{title}</p>
            <p className="text-3xl font-black text-text-default">{value}</p>
            {subValue && <p className="text-xs text-text-subtle mt-1">{subValue}</p>}
        </div>
        <div className={`p-4 rounded-xl ${color}`}>
            {icon}
        </div>
    </div>
);

const FinanceDashboard: React.FC = () => {
    const { invoices, commissions } = useFinance();
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);

    // Default to current month
    const [dateRange, setDateRange] = useState<DateRange | null>(() => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
            from: firstDay.toISOString().split('T')[0],
            to: now.toISOString().split('T')[0],
            label: 'החודש'
        };
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    // Filter Data based on Date Range
    const filteredData = useMemo(() => {
        if (!dateRange) return { invoices, commissions };

        const from = new Date(dateRange.from);
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999); // Include the end of the day

        const filteredInvoices = invoices.filter(inv => {
            const date = new Date(inv.issueDate); // Filter by issue date
            return date >= from && date <= to;
        });

        const filteredCommissions = commissions.filter(comm => {
            const date = new Date(comm.placementDate);
            return date >= from && date <= to;
        });

        return { invoices: filteredInvoices, commissions: filteredCommissions };
    }, [invoices, commissions, dateRange]);

    const stats = useMemo(() => {
        // Income: Sum of paid invoices in range
        const incomePeriod = filteredData.invoices
            .filter(inv => inv.status === 'paid')
            .reduce((sum, inv) => sum + inv.amount, 0);

        // Expected Income (Open invoices) in range
        const expectedIncome = filteredData.invoices
            .filter(inv => inv.status === 'sent' || inv.status === 'overdue')
            .reduce((sum, inv) => sum + inv.amount, 0);
        
        // Count of paid invoices
        const paidCount = filteredData.invoices.filter(inv => inv.status === 'paid').length;
        
        // Total deal value generated in period (regardless of payment status)
        const totalGenerated = filteredData.invoices.reduce((sum, inv) => sum + inv.amount, 0);

        // Average per deal
        const avgDeal = filteredData.invoices.length > 0 ? totalGenerated / filteredData.invoices.length : 0;

        return {
            incomePeriod,
            expectedIncome,
            paidCount,
            totalGenerated,
            avgDeal
        };
    }, [filteredData.invoices]);

    const alerts = useMemo(() => {
        // Alerts are usually "Active" items, regardless of date filter, but we can filter by date if needed.
        // Here we show ALL active alerts to ensure nothing is missed.
        const overdueInvoices = invoices.filter(inv => inv.status === 'overdue').length;
        const missingDocsInvoices = invoices.filter(inv => inv.status === 'draft').length;
        const pendingCommissions = commissions.filter(c => c.status === 'pending' || c.status === 'partial').length;
        
        return {
            overdueInvoices,
            missingDocsInvoices,
            pendingCommissions
        };
    }, [invoices, commissions]);


    // Dynamic Chart Data based on filtered invoices
    const chartData = useMemo(() => {
        // Group by month
        const dataMap = new Map<string, { revenue: number, forecast: number }>();
        
        // Populate based on range or default last 4 months if no range
        // For simplicity in this demo, we'll just show the breakdown of the filtered items
        // In a real app, you'd generate labels based on the dateRange diff.
        
        filteredData.invoices.forEach(inv => {
            const date = new Date(inv.issueDate);
            const monthKey = date.toLocaleString('he-IL', { month: 'short' }); // e.g., "ינו"
            
            const current = dataMap.get(monthKey) || { revenue: 0, forecast: 0 };
            
            if (inv.status === 'paid') {
                current.revenue += inv.amount;
            } else {
                current.forecast += inv.amount;
            }
            dataMap.set(monthKey, current);
        });

        // Convert to array and sort (basic sort, assumes chronological insert or maps keys)
        // If empty, show some placeholders
        if (dataMap.size === 0) {
             return [
                { month: 'אין נתונים', revenue: 0, forecast: 0 },
            ];
        }

        return Array.from(dataMap.entries()).map(([month, data]) => ({
            month,
            revenue: data.revenue,
            forecast: data.forecast
        }));

    }, [filteredData.invoices]);

    const maxVal = Math.max(...chartData.map(d => Math.max(d.revenue, d.forecast)), 1000);

    return (
        <div className="space-y-6 h-full flex flex-col animate-fade-in">
             <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-text-default flex items-center gap-2">
                        <ChartBarIcon className="w-8 h-8 text-primary-600" />
                         לוח בקרה פיננסי
                    </h1>
                    <p className="text-sm text-text-muted mt-1">סקירה פיננסית, צפי גבייה ויעדים {dateRange ? `עבור ${dateRange.label}` : 'לכל התקופות'}</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="min-w-[200px]">
                        <DateRangeSelector 
                            value={dateRange} 
                            onChange={setDateRange} 
                            placeholder="בחר טווח תאריכים"
                            className="w-full"
                        />
                    </div>
                    <button 
                        onClick={() => setIsManualModalOpen(true)}
                        className="bg-primary-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                        <PlusIcon className="w-5 h-5" />
                        הוסף עסקה ידנית
                    </button>
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="הכנסות (שולם)" 
                    value={formatCurrency(stats.incomePeriod)} 
                    subValue={`מתוך ${stats.paidCount} עסקאות בתקופה`}
                    icon={<BanknotesIcon className="w-8 h-8 text-primary-600"/>} 
                    color="bg-primary-100" 
                />
                <StatCard 
                    title="צפי גבייה (פתוח)" 
                    value={formatCurrency(stats.expectedIncome)} 
                    subValue="חשבוניות שנשלחו וטרם שולמו"
                    icon={<ClockIcon className="w-8 h-8 text-orange-600"/>} 
                    color="bg-orange-100" 
                />
                <StatCard 
                    title="סה״כ מחזור (מחושב)" 
                    value={formatCurrency(stats.totalGenerated)} 
                    subValue="כלל העסקאות בתקופה"
                    icon={<CheckCircleIcon className="w-8 h-8 text-green-600"/>} 
                    color="bg-green-100" 
                />
                <StatCard 
                    title="ממוצע לעסקה" 
                    value={formatCurrency(stats.avgDeal)} 
                    subValue="שווי ממוצע לחשבונית"
                    icon={<BanknotesIcon className="w-8 h-8 text-blue-600"/>} 
                    color="bg-blue-100" 
                />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* Main Chart */}
                <div className="lg:col-span-2 bg-bg-card border border-border-default rounded-2xl shadow-sm p-6 flex flex-col">
                     <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-text-default">תזרים הכנסות (לפי תאריך מסמך)</h3>
                        <div className="text-xs text-text-muted flex gap-3">
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-400 rounded-sm"></div> צפי (פתוח)</span>
                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> בפועל (שולם)</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 flex items-end justify-around gap-4 min-h-[250px]">
                        {chartData.map((data, idx) => (
                             <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                                <div className="w-full max-w-[60px] flex flex-col justify-end items-center gap-1 h-full relative group-hover:scale-105 transition-transform duration-300">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 pointer-events-none z-10 whitespace-nowrap">
                                        שולם: {formatCurrency(data.revenue)} <br/>
                                        צפי: {formatCurrency(data.forecast)}
                                    </div>

                                    {/* Forecast Bar */}
                                    {data.forecast > 0 && (
                                        <div 
                                            className="w-full bg-yellow-400 rounded-t-sm opacity-90"
                                            style={{ height: `${Math.max((data.forecast / maxVal) * 80, 5)}%` }}
                                        ></div>
                                    )}
                                    {/* Actual Bar */}
                                    {data.revenue > 0 && (
                                        <div 
                                            className="w-full bg-blue-500 rounded-t-sm opacity-90"
                                            style={{ height: `${Math.max((data.revenue / maxVal) * 80, 5)}%` }}
                                        ></div>
                                    )}
                                    {data.revenue === 0 && data.forecast === 0 && (
                                        <div className="h-px w-full bg-gray-200"></div>
                                    )}
                                </div>
                                <span className="text-xs text-text-muted font-medium">{data.month}</span>
                             </div>
                        ))}
                    </div>
                </div>

                {/* Action Center (Alerts) */}
                <div className="bg-bg-card border border-border-default rounded-2xl shadow-sm p-6">
                    <div className="flex justify-between items-center mb-4">
                         <h3 className="text-lg font-bold text-text-default">חריגים לטיפול (סטטוס נוכחי)</h3>
                         <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">{alerts.overdueInvoices + alerts.missingDocsInvoices + alerts.pendingCommissions}</span>
                    </div>
                    
                    <div className="space-y-4">
                        {/* Billing Alerts */}
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                            <h4 className="font-bold text-red-900 text-sm mb-2">כספים וגבייה</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-text-muted flex items-center gap-1"><ExclamationTriangleIcon className="w-4 h-4 text-red-500"/> חוב בפיגור:</span>
                                    <span className="font-bold text-red-700">{alerts.overdueInvoices}</span>
                                </div>
                                 <div className="flex justify-between items-center text-sm">
                                    <span className="text-text-muted flex items-center gap-1"><ClockIcon className="w-4 h-4 text-orange-500"/> להפקה (טיוטה):</span>
                                    <span className="font-bold text-text-default">{alerts.missingDocsInvoices}</span>
                                </div>
                            </div>
                        </div>

                        {/* Commissions Alerts */}
                         <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500"></div>
                            <h4 className="font-bold text-purple-900 text-sm mb-2">תשלום לרכזות</h4>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-text-muted">עמלות ממתינות לתשלום:</span>
                                <span className="font-bold text-purple-700">{alerts.pendingCommissions}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border-default">
                         <h3 className="text-sm font-bold text-text-default mb-3">ביצועי רכזות (הכנסות בתקופה)</h3>
                         <div className="space-y-3">
                            {[
                                { name: 'קרן גיטמן', amount: 15000 },
                                { name: 'יפתח דביר', amount: 12500 },
                                { name: 'מיכל אסרף', amount: 8000 },
                            ].map((rec, i) => {
                                 const percent = Math.min((rec.amount / 20000) * 100, 100);
                                 return (
                                     <div key={i}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span>{rec.name}</span>
                                            <span className="font-bold">{formatCurrency(rec.amount)}</span>
                                        </div>
                                        <div className="flex-1 h-1.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                 )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <ManualPlacementModal 
                isOpen={isManualModalOpen}
                onClose={() => setIsManualModalOpen(false)}
            />
        </div>
    );
};

export default FinanceDashboard;
