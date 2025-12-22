
import React from 'react';

// --- HELPER TYPES ---
export interface KpiData {
    id?: string;
    title: string;
    value: string | number;
    trend?: number; // Percentage change, e.g. +15 or -5
    trendLabel?: string; // e.g. "vs last month"
    icon?: React.ReactNode;
    colorClass?: string; // e.g. 'bg-blue-100 text-blue-600'
    onClick?: () => void;
    isActive?: boolean;
}

// --- KPI CARD ---
export const KPICard: React.FC<KpiData> = ({ title, value, trend, trendLabel, icon, colorClass = 'bg-bg-subtle text-primary-600', onClick, isActive }) => {
    const isPositive = trend && trend > 0;
    const isNeutral = trend === 0;
    
    // Extract base color for the active border (e.g., from 'bg-blue-500' get 'border-blue-500')
    // This assumes standard tailwind naming conventions or custom theme vars
    const baseColor = colorClass.split(' ')[0].replace('bg-', ''); 
    const activeRingClass = isActive ? `ring-2 ring-${baseColor} ring-offset-1 border-${baseColor}` : 'border-border-default hover:border-primary-300';

    return (
        <div 
            onClick={onClick}
            className={`bg-bg-card rounded-xl border p-4 shadow-sm flex items-start justify-between transition-all duration-200 cursor-pointer relative overflow-hidden group ${activeRingClass} hover:shadow-md`}
        >
            {isActive && (
                <div className={`absolute top-0 right-0 w-1.5 h-full ${colorClass.split(' ')[0]}`}></div>
            )}
            
            <div>
                <p className="text-sm font-semibold text-text-muted mb-1 group-hover:text-primary-600 transition-colors">{title}</p>
                <h3 className="text-2xl font-bold text-text-default">{value}</h3>
                {trend !== undefined && (
                    <div className="flex items-center gap-1 mt-2 text-xs font-medium">
                        <span className={`${isPositive ? 'text-green-600 bg-green-50' : isNeutral ? 'text-text-muted bg-gray-50' : 'text-red-600 bg-red-50'} px-1.5 py-0.5 rounded`}>
                            {isPositive ? '▲' : isNeutral ? '-' : '▼'} {Math.abs(trend)}%
                        </span>
                        <span className="text-text-subtle">{trendLabel}</span>
                    </div>
                )}
            </div>
            <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
                {icon}
            </div>
        </div>
    );
};

// --- SIMPLE BAR CHART (CSS Based) ---
interface BarChartProps {
    data: { label: string; value: number; color?: string }[];
    height?: number;
    showValues?: boolean;
    colorTheme?: string; // Base color class for bars if individual color not provided
}

export const SimpleBarChart: React.FC<BarChartProps> = ({ data, height = 200, showValues = true, colorTheme = 'bg-primary-400' }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="flex items-end justify-between gap-2 w-full pt-6" style={{ height: `${height}px` }}>
            {data.map((item, index) => (
                <div key={index} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    {showValues && (
                        <div className="mb-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                            <span className="text-xs font-bold text-text-default bg-bg-subtle px-2 py-1 rounded shadow-sm border border-border-default">
                                {item.value}
                            </span>
                        </div>
                    )}
                    <div 
                        className={`w-full max-w-[40px] rounded-t-md transition-all duration-500 ${item.color || colorTheme} hover:opacity-80 relative`}
                        style={{ height: `${(item.value / maxValue) * 85}%` }} // 85% to leave room for labels
                    >
                    </div>
                    <span className="text-xs text-text-subtle mt-2 truncate w-full text-center font-medium" title={item.label}>
                        {item.label}
                    </span>
                </div>
            ))}
        </div>
    );
};

// --- DELTA CHART (Positive/Negative Bars) ---
interface DeltaChartProps {
    data: { label: string; value: number }[];
}

export const DeltaChart: React.FC<DeltaChartProps> = ({ data }) => {
    const maxValue = Math.max(...data.map(d => Math.abs(d.value)), 1);

    return (
        <div className="w-full space-y-3">
             {/* Center Line */}
             <div className="flex justify-center text-xs text-text-muted mb-2">
                 <span>יעד (0)</span>
             </div>
            
            {data.map((item, index) => {
                const isPositive = item.value >= 0;
                const widthPct = (Math.abs(item.value) / maxValue) * 50;
                
                return (
                    <div key={index} className="flex items-center text-xs h-8 group">
                        {/* Left Side (Negative) */}
                        <div className="flex-1 flex justify-end pr-2 items-center">
                            {!isPositive && (
                                <>
                                    <span className="text-text-default font-bold mr-2">{item.value}</span>
                                    <div className="h-5 bg-red-400/80 rounded-l-md transition-all group-hover:bg-red-500" style={{ width: `${widthPct}%` }}></div>
                                </>
                            )}
                            {isPositive && <span className="text-text-subtle font-medium">{item.label}</span>}
                        </div>
                        
                        {/* Center Axis */}
                        <div className="w-px h-full bg-border-default mx-1 relative">
                             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-border-default"></div>
                        </div>
                        
                        {/* Right Side (Positive) */}
                        <div className="flex-1 flex justify-start pl-2 items-center">
                            {isPositive && (
                                <>
                                    <div className="h-5 bg-green-400/80 rounded-r-md transition-all group-hover:bg-green-500" style={{ width: `${widthPct}%` }}></div>
                                    <span className="text-text-default font-bold ml-2">+{item.value}</span>
                                </>
                            )}
                             {!isPositive && <span className="text-text-subtle font-medium">{item.label}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


// --- SPARKLINE (SVG) ---
export const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({ data, color = "currentColor", width = 100, height = 30 }) => {
    if (data.length < 2) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="overflow-visible">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* End dot */}
            <circle cx={width} cy={height - ((data[data.length-1] - min) / range) * height} r="3" fill={color} />
        </svg>
    );
};

// --- HEATMAP CELL (Updated for softer look) ---
export const HeatmapCell: React.FC<{ value: number; max: number; label?: string }> = ({ value, max, label }) => {
    const intensity = max > 0 ? Math.round((value / max) * 100) : 0;
    
    // Softer Green Scale (Pastel-like)
    let bgClass = 'bg-transparent text-text-subtle';
    if (intensity > 5) bgClass = 'bg-green-50 text-green-800';
    if (intensity > 25) bgClass = 'bg-green-100 text-green-800';
    if (intensity > 50) bgClass = 'bg-green-200 text-green-900';
    if (intensity > 75) bgClass = 'bg-green-300 text-green-900';
    if (intensity > 90) bgClass = 'bg-green-400 text-white shadow-sm'; // Using 400 for max to keep it soft

    return (
        <div className={`w-full h-full min-h-[36px] flex items-center justify-center rounded-md ${bgClass} text-xs font-medium transition-all duration-200 hover:scale-105 cursor-default`}>
            {label ? <span>{label}: <strong>{value}</strong></span> : value}
        </div>
    );
};
