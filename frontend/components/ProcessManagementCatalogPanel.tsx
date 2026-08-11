import React, { useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from './Icons';
import {
  buildStageOutcomeOptions,
  flattenSystemEventGroups,
  type EnrichedPipeline,
  type StageOutcomeOption,
} from '../utils/processManagementCatalog';

type Props = {
  clientPipelines: EnrichedPipeline[];
  candidatePipelines: EnrichedPipeline[];
  systemEventGroups: Array<{ label: string; events: Array<{ value: string; label: string }> }>;
  selectedPipelineIds: Set<string>;
  onSelectedPipelineIdsChange: (next: Set<string>) => void;
  selectedSystemEventIds: Set<string>;
  onSelectedSystemEventIdsChange: (next: Set<string>) => void;
  selectedStageOutcomeKeys: Set<string>;
  onSelectedStageOutcomeKeysChange: (next: Set<string>) => void;
  /** Sidebar: highlight one pipeline for action context */
  actionPipelineId?: string | null;
  onActionPipelineIdChange?: (pipelineId: string | null) => void;
  variant?: 'filters' | 'sidebar';
  disabled?: boolean;
};

const toggleSet = (setter: (next: Set<string>) => void, current: Set<string>, value: string) => {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
};

const ProcessManagementCatalogPanel: React.FC<Props> = ({
  clientPipelines,
  candidatePipelines,
  systemEventGroups,
  selectedPipelineIds,
  onSelectedPipelineIdsChange,
  selectedSystemEventIds,
  onSelectedSystemEventIdsChange,
  selectedStageOutcomeKeys,
  onSelectedStageOutcomeKeysChange,
  actionPipelineId = null,
  onActionPipelineIdChange,
  variant = 'filters',
  disabled = false,
}) => {
  const allPipelines = useMemo(
    () => [...clientPipelines, ...candidatePipelines],
    [clientPipelines, candidatePipelines],
  );
  const systemEvents = useMemo(() => flattenSystemEventGroups(systemEventGroups), [systemEventGroups]);
  const stageOutcomeOptions = useMemo(
    () => buildStageOutcomeOptions(allPipelines, selectedPipelineIds),
    [allPipelines, selectedPipelineIds],
  );

  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const systemRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const groupedStageOptions = useMemo(() => {
    const map = new Map<string, StageOutcomeOption[]>();
    for (const opt of stageOutcomeOptions) {
      if (!map.has(opt.groupLabel)) map.set(opt.groupLabel, []);
      map.get(opt.groupLabel)!.push(opt);
    }
    return map;
  }, [stageOutcomeOptions]);

  const isSidebar = variant === 'sidebar';

  if (isSidebar) {
    return (
      <div className="space-y-4 mb-4">
        <div>
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">תהליכים פעילים</h4>
          <div className="space-y-3 max-h-44 overflow-y-auto custom-scrollbar pr-1">
            {clientPipelines.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold text-indigo-700 mb-1">תהליכי לקוחות</p>
                <div className="space-y-1">
                  {clientPipelines.map((p) => (
                    <button
                      key={`client-${p.id}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onActionPipelineIdChange?.(p.id);
                        onSelectedPipelineIdsChange(new Set([p.id]));
                      }}
                      className={`w-full text-right px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                        actionPipelineId === p.id
                          ? 'bg-primary-50 border-primary-300 text-primary-800'
                          : 'bg-white border-border-default text-text-default hover:border-primary-200'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {candidatePipelines.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold text-teal-700 mb-1">תהליכי מועמדים</p>
                <div className="space-y-1">
                  {candidatePipelines.map((p) => (
                    <button
                      key={`candidate-${p.id}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onActionPipelineIdChange?.(p.id);
                        onSelectedPipelineIdsChange(new Set([p.id]));
                      }}
                      className={`w-full text-right px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                        actionPipelineId === p.id
                          ? 'bg-primary-50 border-primary-300 text-primary-800'
                          : 'bg-white border-border-default text-text-default hover:border-primary-200'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {clientPipelines.length === 0 && candidatePipelines.length === 0 ? (
              <p className="text-xs text-text-muted">אין תהליכים מוגדרים</p>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-3">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">אירועי מערכת</h4>
          <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1 pr-1">
            {systemEvents.length === 0 ? (
              <p className="text-xs text-text-muted">אין אירועי מערכת</p>
            ) : (
              systemEvents.map((ev) => (
                <label
                  key={ev.value}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-white cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedSystemEventIds.has(ev.value)}
                    onChange={() =>
                      toggleSet(onSelectedSystemEventIdsChange, selectedSystemEventIds, ev.value)
                    }
                    className="mt-0.5 rounded border-border-default text-primary-600 w-3.5 h-3.5"
                  />
                  <span className="font-medium text-text-default leading-snug">{ev.label}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-border-subtle pt-3">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">שלבים ותוצאות</h4>
          {!selectedPipelineIds.size ? (
            <p className="text-xs text-text-muted">בחר תהליך כדי לראות שלבים ותוצאות</p>
          ) : (
            <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-2 pr-1">
              {[...groupedStageOptions.entries()].map(([group, opts]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold text-gray-500 mb-1 sticky top-0 bg-gray-50/95 py-0.5">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {opts.map((opt) => (
                      <label
                        key={opt.key}
                        className={`flex items-center gap-2 p-1.5 rounded-md hover:bg-white cursor-pointer ${
                          opt.kind === 'stage' ? 'font-semibold' : 'mr-3 font-normal'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={selectedStageOutcomeKeys.has(opt.key)}
                          onChange={() =>
                            toggleSet(onSelectedStageOutcomeKeysChange, selectedStageOutcomeKeys, opt.key)
                          }
                          className="rounded border-border-default text-primary-600 w-3.5 h-3.5"
                        />
                        <span className="text-xs text-text-default">
                          {opt.kind === 'stage' ? `שלב: ${opt.label}` : `תוצאה: ${opt.label}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1 relative" ref={pipelineRef}>
        <label className="text-xs font-semibold text-text-muted">תהליך</label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPipelineOpen((v) => !v)}
          className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[170px]"
        >
          <span className="truncate">
            {selectedPipelineIds.size === 0 ? 'כל התהליכים' : `${selectedPipelineIds.size} תהליכים`}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2 shrink-0" />
        </button>
        {pipelineOpen ? (
          <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50 max-h-72 overflow-y-auto">
            {clientPipelines.length > 0 ? (
              <>
                <p className="text-[10px] font-bold text-indigo-700 px-2 py-1">תהליכי לקוחות</p>
                {clientPipelines.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPipelineIds.has(p.id)}
                      onChange={() => toggleSet(onSelectedPipelineIdsChange, selectedPipelineIds, p.id)}
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{p.name}</span>
                  </label>
                ))}
              </>
            ) : null}
            {candidatePipelines.length > 0 ? (
              <>
                <p className="text-[10px] font-bold text-teal-700 px-2 py-1 mt-1">תהליכי מועמדים</p>
                {candidatePipelines.map((p) => (
                  <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPipelineIds.has(p.id)}
                      onChange={() => toggleSet(onSelectedPipelineIdsChange, selectedPipelineIds, p.id)}
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{p.name}</span>
                  </label>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 relative" ref={systemRef}>
        <label className="text-xs font-semibold text-text-muted">אירוע מערכת</label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setSystemOpen((v) => !v)}
          className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[170px]"
        >
          <span className="truncate">
            {selectedSystemEventIds.size === 0
              ? 'כל אירועי המערכת'
              : `${selectedSystemEventIds.size} אירועים`}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2 shrink-0" />
        </button>
        {systemOpen ? (
          <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50 max-h-72 overflow-y-auto">
            {systemEventGroups.map((group) => (
              <div key={group.label} className="mb-2">
                <p className="text-[10px] font-bold text-gray-500 px-2 py-1">{group.label}</p>
                {group.events.map((ev) => (
                  <label key={ev.value} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSystemEventIds.has(ev.value)}
                      onChange={() =>
                        toggleSet(onSelectedSystemEventIdsChange, selectedSystemEventIds, ev.value)
                      }
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{ev.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 relative" ref={stageRef}>
        <label className="text-xs font-semibold text-text-muted">שלב / תוצאה</label>
        <button
          type="button"
          disabled={disabled || selectedPipelineIds.size === 0}
          onClick={() => setStageOpen((v) => !v)}
          className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[170px] disabled:opacity-50"
        >
          <span className="truncate">
            {selectedPipelineIds.size === 0
              ? 'בחר תהליך תחילה'
              : selectedStageOutcomeKeys.size === 0
                ? 'כל השלבים והתוצאות'
                : `${selectedStageOutcomeKeys.size} נבחרו`}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2 shrink-0" />
        </button>
        {stageOpen && selectedPipelineIds.size > 0 ? (
          <div className="absolute top-full mt-1 right-0 w-80 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50 max-h-80 overflow-y-auto">
            {[...groupedStageOptions.entries()].map(([group, opts]) => (
              <div key={group} className="mb-2">
                <p className="text-[10px] font-bold text-gray-500 px-2 py-1">{group}</p>
                {opts.map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer ${
                      opt.kind === 'outcome' ? 'mr-3' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStageOutcomeKeys.has(opt.key)}
                      onChange={() =>
                        toggleSet(onSelectedStageOutcomeKeysChange, selectedStageOutcomeKeys, opt.key)
                      }
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">
                      {opt.kind === 'stage' ? `שלב: ${opt.label}` : `תוצאה: ${opt.label}`}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
};

export default ProcessManagementCatalogPanel;
