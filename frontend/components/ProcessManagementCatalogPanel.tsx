import React, { useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from './Icons';
import {
  buildStageOutcomeOptions,
  countSelectedPipelineGroups,
  dedupeEnrichedPipelinesByName,
  isPipelineGroupSelected,
  pipelineNameKey,
  togglePipelineGroupSelection,
  type EnrichedPipeline,
  type StageOutcomeOption,
  type SystemEventCatalogGroup,
} from '../utils/processManagementCatalog';

type Props = {
  clientPipelines: EnrichedPipeline[];
  candidatePipelines: EnrichedPipeline[];
  systemEventGroups: SystemEventCatalogGroup[];
  selectedPipelineIds: Set<string>;
  onSelectedPipelineIdsChange: (next: Set<string>) => void;
  selectedSystemEventIds: Set<string>;
  onSelectedSystemEventIdsChange: (next: Set<string>) => void;
  selectedStageOutcomeKeys: Set<string>;
  onSelectedStageOutcomeKeysChange: (next: Set<string>) => void;
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
  disabled = false,
}) => {
  const allPipelines = useMemo(
    () => [...clientPipelines, ...candidatePipelines],
    [clientPipelines, candidatePipelines],
  );
  const dedupedClientPipelines = useMemo(
    () => dedupeEnrichedPipelinesByName(clientPipelines),
    [clientPipelines],
  );
  const dedupedCandidatePipelines = useMemo(
    () => dedupeEnrichedPipelinesByName(candidatePipelines),
    [candidatePipelines],
  );
  const dedupedAllPipelines = useMemo(
    () => [...dedupedClientPipelines, ...dedupedCandidatePipelines],
    [dedupedClientPipelines, dedupedCandidatePipelines],
  );
  const selectedPipelineGroupCount = useMemo(
    () => countSelectedPipelineGroups(selectedPipelineIds, allPipelines),
    [selectedPipelineIds, allPipelines],
  );
  const stageOutcomeOptions = useMemo(
    () => buildStageOutcomeOptions(dedupedAllPipelines, selectedPipelineIds, allPipelines),
    [dedupedAllPipelines, selectedPipelineIds, allPipelines],
  );

  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [systemEventSearch, setSystemEventSearch] = useState('');
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

  const filteredSystemEventGroups = useMemo(() => {
    const q = systemEventSearch.trim().toLowerCase();
    if (!q) return systemEventGroups;
    return systemEventGroups
      .map((group) => {
        const groupMatches = group.label.toLowerCase().includes(q);
        const events = group.events.filter(
          (ev) =>
            groupMatches
            || ev.label.toLowerCase().includes(q)
            || ev.triggerName.toLowerCase().includes(q)
            || `${ev.triggerName}.${ev.eventName}`.toLowerCase().includes(q),
        );
        return events.length > 0 ? { ...group, events } : null;
      })
      .filter((group): group is SystemEventCatalogGroup => group != null);
  }, [systemEventGroups, systemEventSearch]);

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
            {selectedPipelineGroupCount === 0
              ? 'כל התהליכים'
              : `${selectedPipelineGroupCount} תהליכים`}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2 shrink-0" />
        </button>
        {pipelineOpen ? (
          <div className="absolute top-full mt-1 right-0 w-72 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50 max-h-72 overflow-y-auto">
            {dedupedClientPipelines.length > 0 ? (
              <>
                <p className="text-[10px] font-bold text-indigo-700 px-2 py-1">תהליכי לקוחות</p>
                {dedupedClientPipelines.map((p) => (
                  <label
                    key={`client-${pipelineNameKey(p)}`}
                    className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isPipelineGroupSelected(p, selectedPipelineIds, allPipelines)}
                      onChange={() =>
                        onSelectedPipelineIdsChange(
                          togglePipelineGroupSelection(p, selectedPipelineIds, allPipelines),
                        )
                      }
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{p.name}</span>
                  </label>
                ))}
              </>
            ) : null}
            {dedupedCandidatePipelines.length > 0 ? (
              <>
                <p className="text-[10px] font-bold text-teal-700 px-2 py-1 mt-1">תהליכי מועמדים</p>
                {dedupedCandidatePipelines.map((p) => (
                  <label
                    key={`candidate-${pipelineNameKey(p)}`}
                    className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isPipelineGroupSelected(p, selectedPipelineIds, allPipelines)}
                      onChange={() =>
                        onSelectedPipelineIdsChange(
                          togglePipelineGroupSelection(p, selectedPipelineIds, allPipelines),
                        )
                      }
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

      <div className="flex flex-col gap-1 relative" ref={stageRef}>
        <label className="text-xs font-semibold text-text-muted">שלב / תוצאה</label>
        <button
          type="button"
          disabled={disabled || selectedPipelineGroupCount === 0}
          onClick={() => setStageOpen((v) => !v)}
          className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[170px] disabled:opacity-50"
        >
          <span className="truncate">
            {selectedPipelineGroupCount === 0
              ? 'בחר תהליך תחילה'
              : selectedStageOutcomeKeys.size === 0
                ? 'כל השלבים והתוצאות'
                : `${selectedStageOutcomeKeys.size} נבחרו`}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2 shrink-0" />
        </button>
        {stageOpen && selectedPipelineGroupCount > 0 ? (
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
            <input
              type="search"
              value={systemEventSearch}
              onChange={(e) => setSystemEventSearch(e.target.value)}
              placeholder="חיפוש אירוע מערכת…"
              className="w-full mb-2 bg-bg-input border border-border-default rounded-lg py-1.5 px-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
            {filteredSystemEventGroups.length === 0 ? (
              <p className="text-xs text-text-muted px-2 py-3 text-center">לא נמצאו אירועים</p>
            ) : (
              filteredSystemEventGroups.map((group) => (
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
              ))
            )}
          </div>
        ) : null}
      </div>
    </>
  );
};

export default ProcessManagementCatalogPanel;
