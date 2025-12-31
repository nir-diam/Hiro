
import React, { useState, useRef, useEffect } from 'react';
import { CalendarIcon, ChevronDownIcon, XMarkIcon } from './Icons';

export interface DateRange {
    from: string;
    to: string;
    label: string;
}

interface DateRangeSelectorProps {
    value: DateRange | null;
    onChange: (range: DateRange | null) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

const quickOptions = [
    { label: 'היום', days: 0 },
    { label: 'החודש', type: 'current_month' },
    { label: '7 ימים אחרונים', days: 7 },
    { label: '30 ימים אחרונים', days: 30 },
    { label: 'מתחילת השנה', type: 'ytd' }
];

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ value, onChange, placeholder = "כל הזמנים", className = "", disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showCustom, setShowCustom] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setShowCustom(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleQuickSelect = (option: any) => {
        const end = new Date();
        const start = new Date();
        
        if (option.type === 'ytd') {
            start.setMonth(0, 1); // Jan 1st
        } else if (option.type === 'current_month') {
            start.setDate(1); // 1st of current month
        } else {
            start.setDate(end.getDate() - option.days);
        }

        onChange({
            from: start.toISOString().split('T')[0],
            to: end.toISOString().split('T')[0],
            label: option.label
        });
        setIsOpen(false);
        setShowCustom(false);
    };

    const handleCustomApply = () => {
        if (customFrom && customTo) {
             const fromDate = new Date(customFrom);
             const toDate = new Date(customTo);
             onChange({
                from: customFrom,
                to: customTo,
                label: `${fromDate.getDate()}/${fromDate.getMonth()+1} - ${toDate.getDate()}/${toDate.getMonth()+1}`
            });
            setIsOpen(false);
            setShowCustom(false);
        }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null);
        setCustomFrom('');
        setCustomTo('');
        setShowCustom(false);
    }

    const isActive = !!value;

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200 outline-none focus:ring-2 focus:ring-primary-500/20 ${
                    disabled ? 'bg-bg-subtle/50 text-text-subtle cursor-not-allowed border-border-default' :
                    isActive 
                    ? 'bg-primary-50 border-primary-200 text-primary-700 font-medium shadow-sm' 
                    : 'bg-bg-input border-border-default text-text-muted hover:border-primary-300'
                }`}
            >
                <div className="flex items-center gap-2 truncate">
                    <CalendarIcon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary-500' : 'text-text-subtle'}`} />
                    <span className="text-sm truncate">{value?.label || placeholder}</span>
                </div>
                {isActive && !disabled ? (
                    <div onClick={handleClear} className="p-0.5 rounded-full hover:bg-primary-100 text-primary-500 transition-colors">
                        <XMarkIcon className="w-3.5 h-3.5" />
                    </div>
                ) : (
                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-bg-card border border-border-default rounded-xl shadow-xl z-50 p-2 animate-fade-in flex flex-col gap-1">
                    <div className="space-y-1 pb-2 border-b border-border-subtle">
                         <span className="text-xs font-bold text-text-muted px-2 py-1 block">בחירה מהירה</span>
                        {quickOptions.map((opt, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleQuickSelect(opt)}
                                className="w-full text-right px-3 py-2 text-sm text-text-default hover:bg-bg-subtle rounded-lg transition-colors"
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    
                    <div className="pt-2">
                         {!showCustom ? (
                             <button 
                                onClick={() => setShowCustom(true)}
                                className="w-full text-right px-3 py-2 text-sm font-bold text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex items-center justify-between"
                             >
                                 <span>טווח מותאם אישית...</span>
                                 <span className="text-xs text-primary-400">▼</span>
                             </button>
                         ) : (
                             <div className="p-2 bg-bg-subtle/50 rounded-lg animate-fade-in border border-border-subtle">
                                 <div className="grid grid-cols-2 gap-2 mb-2">
                                     <div>
                                         <label className="text-[10px] text-text-muted font-bold block mb-1">מ-</label>
                                         <input 
                                            type="date" 
                                            value={customFrom} 
                                            onChange={e => setCustomFrom(e.target.value)} 
                                            className="w-full bg-white border border-border-default rounded-md text-xs p-1.5 focus:border-primary-500 outline-none" 
                                         />
                                     </div>
                                     <div>
                                         <label className="text-[10px] text-text-muted font-bold block mb-1">עד-</label>
                                         <input 
                                            type="date" 
                                            value={customTo} 
                                            onChange={e => setCustomTo(e.target.value)} 
                                            className="w-full bg-white border border-border-default rounded-md text-xs p-1.5 focus:border-primary-500 outline-none" 
                                         />
                                     </div>
                                 </div>
                                 <button 
                                    onClick={handleCustomApply}
                                    disabled={!customFrom || !customTo}
                                    className="w-full bg-primary-600 text-white text-xs font-bold py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                 >
                                     החל טווח
                                 </button>
                             </div>
                         )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DateRangeSelector;
