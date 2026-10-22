import React, { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, FunnelIcon, MagnifyingGlassIcon, SparklesIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

export const SCAN_FILTER_KEYS = [
  'scope',
  'hours',
  'distance',
  'age',
  'gender',
  'mobility',
  'license',
  'salary',
  'affinity',
  'mandatory_skill',
  'negative_skill',
] as const;

export type ScanFilterKey = (typeof SCAN_FILTER_KEYS)[number];

/** UI affinity filter — maps to engine intentType exact / role / cluster. */
export type AffinityLevel = 'none' | 'exact' | 'same_cluster' | 'same_category';

export const AFFINITY_LEVELS: AffinityLevel[] = ['exact', 'same_cluster', 'same_category', 'none'];

/** Shared opening state for sonar and candidate–job matching. */
export const DEFAULT_SCAN_BATCH_SIZE = 20;
export const DEFAULT_SCAN_THRESHOLD = 0;
/** Second affinity option: same role + similar roles in the same fields. */
export const DEFAULT_AFFINITY_LEVEL: AffinityLevel = 'same_cluster';

export function toScanHardFilters(activeFilters: Iterable<string>): string[] {
  return [...activeFilters].filter((k) => k !== 'affinity');
}

type ScanSettingsPanelProps = {
  batchSize: number;
  onBatchSizeChange: (n: number) => void;
  threshold: number;
  onThresholdChange: (n: number) => void;
  vectorSimilarity: boolean;
  onVectorSimilarityChange: (v: boolean) => void;
  activeFilters: ReadonlySet<string>;
  onToggleFilter: (key: string) => void;
  affinityLevel: AffinityLevel;
  onAffinityLevelChange: (level: AffinityLevel) => void;
  loading?: boolean;
  batchCountLabel: string;
  searchLabel?: string;
  onSearch?: () => void;
  searchDisabled?: boolean;
};

const ScanSettingsPanel: React.FC<ScanSettingsPanelProps> = ({
  batchSize,
  onBatchSizeChange,
  threshold,
  onThresholdChange,
  vectorSimilarity,
  onVectorSimilarityChange,
  activeFilters,
  onToggleFilter,
  affinityLevel,
  onAffinityLevelChange,
  loading = false,
  batchCountLabel,
  searchLabel,
  onSearch,
  searchDisabled,
}) => {
  const { t } = useLanguage();
  const [affinityOpen, setAffinityOpen] = useState(false);
  const affinityWrapRef = useRef<HTMLDivElement | null>(null);
  const affinityActive = affinityLevel !== 'none';

  useEffect(() => {
    if (!affinityOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = affinityWrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setAffinityOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAffinityOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [affinityOpen]);

  return (
    <>
      <div className="flex items-center gap-2 text-text-default font-black text-sm border-b border-border-default pb-3">
        <FunnelIcon className="w-4 h-4 text-primary-500 shrink-0" />
        {t('job.sonar.settings')}
      </div>
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex justify-between items-center text-[11px] font-bold gap-2">
            <span className="text-text-muted">{t('job.sonar.batch')}</span>
            <span className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md whitespace-nowrap">
              {batchCountLabel}
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={batchSize}
            onChange={(e) => onBatchSizeChange(Number(e.target.value))}
            disabled={loading}
            className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-600"
          />
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-[11px] font-bold gap-2">
            <span className="text-text-muted">{t('job.sonar.threshold')}</span>
            <span className="text-accent-600 bg-accent-50 px-2 py-0.5 rounded-md whitespace-nowrap">
              {t('job.sonar.threshold_display', { pct: threshold })}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={threshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            disabled={loading}
            className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-accent-500"
          />
        </div>
        <label className="flex items-center justify-between p-3 bg-bg-subtle/50 rounded-xl border border-border-subtle cursor-pointer hover:border-primary-300 transition-colors gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">
              <SparklesIcon className="w-4 h-4 text-accent-500" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <span className="text-xs font-black text-text-default block">{t('job.sonar.vector')}</span>
              <p className="text-[10px] text-text-muted">{t('job.sonar.vector_hint')}</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={vectorSimilarity}
            onChange={(e) => onVectorSimilarityChange(e.target.checked)}
            disabled={loading}
            className="w-5 h-5 rounded-md text-primary-600 focus:ring-primary-500 shrink-0"
          />
        </label>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-[11px] font-bold pb-1 border-b border-border-default/50">
            <span className="text-text-muted">{t('job.sonar.filters')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SCAN_FILTER_KEYS.map((fk) => {
              if (fk === 'affinity') {
                return (
                  <div key={fk} className="relative" ref={affinityWrapRef}>
                    <button
                      type="button"
                      onClick={() => setAffinityOpen((o) => !o)}
                      disabled={loading}
                      aria-expanded={affinityOpen}
                      aria-haspopup="listbox"
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-colors inline-flex items-center gap-1 ${
                        affinityActive
                          ? 'bg-primary-50 text-primary-800 border-primary-300'
                          : 'bg-bg-subtle text-text-muted border-border-default hover:bg-bg-surface'
                      }`}
                    >
                      {t('job.sonar.fl_affinity')}
                      <ChevronDownIcon
                        className={`w-3 h-3 opacity-70 transition-transform ${affinityOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {affinityOpen && (
                      <div
                        role="listbox"
                        className="absolute z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border-default bg-bg-card shadow-xl p-1.5"
                      >
                        {AFFINITY_LEVELS.map((level) => {
                          const selected = affinityLevel === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                onAffinityLevelChange(level);
                                setAffinityOpen(false);
                              }}
                              className={`w-full text-start rounded-lg px-3 py-2 transition-colors ${
                                selected ? 'bg-primary-50' : 'hover:bg-bg-subtle'
                              }`}
                            >
                              <div
                                className={`text-[11px] font-black ${
                                  selected ? 'text-primary-800' : 'text-text-default'
                                }`}
                              >
                                {t(`job.sonar.affinity_${level}`)}
                              </div>
                              <div className="text-[10px] text-text-muted font-medium mt-0.5 leading-snug">
                                {t(`job.sonar.affinity_${level}_hint`)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              const active = activeFilters.has(fk);
              return (
                <button
                  key={fk}
                  type="button"
                  onClick={() => onToggleFilter(fk)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
                    active
                      ? 'bg-primary-50 text-primary-800 border-primary-300'
                      : 'bg-bg-subtle text-text-muted border-border-default hover:bg-bg-surface'
                  }`}
                >
                  {t(`job.sonar.fl_${fk}`)}
                </button>
              );
            })}
          </div>
        </div>
        {onSearch && searchLabel ? (
          <button
            type="button"
            onClick={onSearch}
            disabled={loading || searchDisabled}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black px-6 py-3.5 rounded-2xl shadow-xl hover:shadow-primary-600/30 transition-all flex items-center justify-center gap-2"
          >
            <MagnifyingGlassIcon className={`w-5 h-5 ${loading ? 'animate-pulse' : ''}`} />
            {loading ? t('job.sonar.scanning') : searchLabel}
          </button>
        ) : null}
      </div>
    </>
  );
};

export default ScanSettingsPanel;
