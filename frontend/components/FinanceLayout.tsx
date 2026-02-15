
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { BanknotesIcon, ChartBarIcon, ReceiptPercentIcon, CalculatorIcon, DocumentTextIcon } from './Icons';

const FinanceLayout: React.FC = () => {
    
    const navItems = [
        { to: '/finance/dashboard', label: 'לוח בקרה', icon: <ChartBarIcon className="w-5 h-5" /> },
        { to: '/finance/proposals', label: 'הצעות מחיר', icon: <DocumentTextIcon className="w-5 h-5" /> }, // New
        { to: '/finance/invoices', label: 'גבייה וחשבוניות', icon: <BanknotesIcon className="w-5 h-5" /> },
        { to: '/finance/commissions', label: 'עמלות רכזות', icon: <CalculatorIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text-default flex items-center gap-2">
                    <BanknotesIcon className="w-8 h-8 text-primary-600" />
                    ניהול כספים
                </h1>
                <p className="text-sm text-text-muted">מעקב הכנסות, הצעות מחיר, גבייה ותשלומים לרכזות</p>
            </header>
            
            <div className="border-b border-border-default">
                <nav className="flex items-center -mb-px gap-4 overflow-x-auto">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${
                                    isActive 
                                        ? 'border-b-2 border-primary-500 text-primary-600' 
                                        : 'text-text-muted hover:text-text-default'
                                }`
                            }
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
            
            <main>
                <Outlet />
            </main>
        </div>
    );
};

export default FinanceLayout;
