import React, { useState, useEffect } from 'react';

export const WorkingHoursInput: React.FC<{
    value: string;
    onChange: (value: string) => void;
    label?: string;
    containerClassName?: string;
    /** Applied to the start–end time row when visible. */
    timeRangeClassName?: string;
}> = ({
    value,
    onChange,
    label = 'שעות עבודה',
    containerClassName = '',
    timeRangeClassName,
}) => {
    const isFlexible = !value || value === 'גמיש' || value === 'ללא אילוצי שעות';
    const [start, setStart] = useState("08:00");
    const [end, setEnd] = useState("17:00");

    useEffect(() => {
        if (!isFlexible && value && value.includes('-')) {
            const parts = value.split('-');
            if (parts.length === 2 && parts[0].length === 5 && parts[1].length === 5) {
                setStart(parts[0]);
                setEnd(parts[1]);
            }
        }
    }, [value, isFlexible]);

    const handleToggle = (checked: boolean) => {
        if (checked) {
            onChange(`${start}-${end}`);
        } else {
            onChange('גמיש');
        }
    };

    const handleTimeChange = (type: 'start' | 'end', time: string) => {
        if (type === 'start') {
            setStart(time);
            onChange(`${time}-${end}`);
        } else {
            setEnd(time);
            onChange(`${start}-${time}`);
        }
    };

    return (
        <div className={containerClassName}>
            <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-text-muted">{label}</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={!isFlexible}
                        onChange={(e) => handleToggle(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-border-default text-primary-600 focus:ring-primary-500 transition-colors"
                    />
                    <span className="text-xs font-medium text-text-muted">הגדרת שעות פעילות</span>
                </label>
            </div>
            
            {!isFlexible && (
                <div className={`flex items-center gap-2 animate-fade-in mt-2 ${timeRangeClassName ?? ''}`.trim()} dir="ltr">
                    <input 
                        type="time" 
                        value={start}
                        onChange={(e) => handleTimeChange('start', e.target.value)}
                        className="flex-1 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm font-mono text-center"
                    />
                    <span className="text-text-muted font-bold">-</span>
                    <input 
                        type="time" 
                        value={end}
                        onChange={(e) => handleTimeChange('end', e.target.value)}
                        className="flex-1 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm font-mono text-center"
                    />
                </div>
            )}
        </div>
    );
};
