import React from 'react';
import type { SonarMetricCell, SonarMetricTone } from '../utils/sonarMatchBreakdown';

export function metricValueClass(tone: SonarMetricTone): string {
    return tone === 'bad'
        ? 'text-red-700'
        : tone === 'muted'
          ? 'text-text-muted'
          : 'text-green-700 dark:text-green-400';
}

function MetricDot({ tone }: { tone: SonarMetricTone }) {
    const cls =
        tone === 'good' ? 'bg-green-500' : tone === 'bad' ? 'bg-red-500' : 'bg-gray-300';
    return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

export function SonarMetricsGrid({
    metrics,
    metricValueCls,
}: {
    metrics: SonarMetricCell[];
    metricValueCls?: (tone: SonarMetricTone) => string;
}) {
    const valueCls = metricValueCls ?? metricValueClass;
    if (!metrics.length) return null;
    return (
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
            {metrics.map((m) => (
                <div key={m.label} className="flex flex-col text-right gap-0.5">
                    <span className="text-[10px] text-text-muted">{m.label}</span>
                    <div className="flex items-center justify-start gap-1.5">
                        <MetricDot tone={m.tone} />
                        <span className={`text-[11px] font-bold truncate ${valueCls(m.tone)}`}>{m.value}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function SonarMetricInline({ m }: { m: SonarMetricCell }) {
    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <MetricDot tone={m.tone} />
            <span className="text-[11px] text-text-muted">{m.label}:</span>
            <span className={`text-[11px] font-bold ${metricValueClass(m.tone)}`}>{m.value}</span>
        </div>
    );
}
