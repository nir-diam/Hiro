import type { PipelineDto, PipelineStageDto, StageOutcomeDto } from '../services/pipelinesApi';

export type PipelineKind = 'client' | 'candidate';

export type EnrichedPipeline = PipelineDto & {
  kind: PipelineKind;
  clientId: string;
};

export type StageOutcomeOption = {
  key: string;
  label: string;
  groupLabel: string;
  kind: 'stage' | 'outcome';
  pipelineId: string;
  stageId: string;
  outcomeId?: string;
  outcome?: StageOutcomeDto;
  stage?: PipelineStageDto;
};

export type SystemEventOption = {
  value: string;
  label: string;
  groupLabel: string;
};

export const pipelineNameKey = (pipeline: Pick<EnrichedPipeline, 'kind' | 'name'>) =>
  `${pipeline.kind}:${String(pipeline.name || '').trim().toLowerCase()}`;

/** One entry per pipeline template name (avoids duplicates across tenants/clients). */
export function dedupeEnrichedPipelinesByName(pipelines: EnrichedPipeline[]): EnrichedPipeline[] {
  const map = new Map<string, EnrichedPipeline>();
  for (const pipeline of pipelines) {
    const key = pipelineNameKey(pipeline);
    if (!map.has(key)) map.set(key, pipeline);
  }
  return Array.from(map.values());
}

export function siblingPipelineIds(
  pipeline: EnrichedPipeline,
  allPipelines: EnrichedPipeline[],
): string[] {
  const key = pipelineNameKey(pipeline);
  return allPipelines.filter((row) => pipelineNameKey(row) === key).map((row) => row.id);
}

export function isPipelineGroupSelected(
  pipeline: EnrichedPipeline,
  selectedPipelineIds: Set<string>,
  allPipelines: EnrichedPipeline[],
): boolean {
  if (selectedPipelineIds.size === 0) return false;
  return siblingPipelineIds(pipeline, allPipelines).some((id) => selectedPipelineIds.has(id));
}

export function togglePipelineGroupSelection(
  pipeline: EnrichedPipeline,
  selectedPipelineIds: Set<string>,
  allPipelines: EnrichedPipeline[],
): Set<string> {
  const siblings = siblingPipelineIds(pipeline, allPipelines);
  const anySelected = siblings.some((id) => selectedPipelineIds.has(id));
  const next = new Set(selectedPipelineIds);
  for (const id of siblings) {
    if (anySelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function countSelectedPipelineGroups(
  selectedPipelineIds: Set<string>,
  allPipelines: EnrichedPipeline[],
): number {
  return dedupeEnrichedPipelinesByName(allPipelines).filter((pipeline) =>
    isPipelineGroupSelected(pipeline, selectedPipelineIds, allPipelines),
  ).length;
}

export const stageOutcomeKey = (pipelineId: string, stageId: string, outcomeId?: string) =>
  outcomeId ? `outcome:${pipelineId}:${stageId}:${outcomeId}` : `stage:${pipelineId}:${stageId}`;

export const parseStageOutcomeKey = (key: string) => {
  const parts = String(key || '').split(':');
  if (parts[0] === 'stage' && parts.length >= 3) {
    return { kind: 'stage' as const, pipelineId: parts[1], stageId: parts[2] };
  }
  if (parts[0] === 'outcome' && parts.length >= 4) {
    return {
      kind: 'outcome' as const,
      pipelineId: parts[1],
      stageId: parts[2],
      outcomeId: parts[3],
    };
  }
  return null;
};

function pipelineMatchesSelection(
  pipeline: EnrichedPipeline,
  selectedPipelineIds: Set<string>,
  selectionPool: EnrichedPipeline[],
): boolean {
  if (selectedPipelineIds.size === 0) return true;
  if (selectedPipelineIds.has(pipeline.id)) return true;
  return siblingPipelineIds(pipeline, selectionPool).some((id) => selectedPipelineIds.has(id));
}

export function buildStageOutcomeOptions(
  pipelines: EnrichedPipeline[],
  selectedPipelineIds: Set<string>,
  selectionPool: EnrichedPipeline[] = pipelines,
): StageOutcomeOption[] {
  const out: StageOutcomeOption[] = [];
  for (const pipeline of pipelines) {
    if (!pipelineMatchesSelection(pipeline, selectedPipelineIds, selectionPool)) continue;
    const kindLabel = pipeline.kind === 'candidate' ? 'מועמדים' : 'לקוחות';
    const stages = [...(pipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const stage of stages) {
      out.push({
        key: stageOutcomeKey(pipeline.id, stage.id),
        label: stage.name,
        groupLabel: `${kindLabel} · ${pipeline.name}`,
        kind: 'stage',
        pipelineId: pipeline.id,
        stageId: stage.id,
        stage,
      });
      for (const outcome of stage.outcomes || []) {
        const title = String(outcome.name || '').trim();
        if (!title) continue;
        out.push({
          key: stageOutcomeKey(pipeline.id, stage.id, outcome.id),
          label: title,
          groupLabel: `${pipeline.name} · ${stage.name}`,
          kind: 'outcome',
          pipelineId: pipeline.id,
          stageId: stage.id,
          outcomeId: outcome.id,
          outcome,
          stage,
        });
      }
    }
  }
  return out;
}

export function flattenSystemEventGroups(
  groups: Array<{ label: string; events: Array<{ value: string; label: string }> }>,
): SystemEventOption[] {
  return groups.flatMap((group) =>
    group.events.map((ev) => ({
      value: ev.value,
      label: ev.label,
      groupLabel: group.label,
    })),
  );
}

export function eventMatchesPipelineFilters(
  event: { processId?: string | null; process?: string; stageId?: string | null; stage?: string },
  selectedPipelineIds: Set<string>,
  pipelines: EnrichedPipeline[],
  selectedStageOutcomeKeys: Set<string>,
): boolean {
  if (selectedPipelineIds.size > 0) {
    const pid = event.processId ? String(event.processId) : '';
    const proc = String(event.process || '').trim().toLowerCase();
    const matchedById = pid && pipelines.some(
      (p) => selectedPipelineIds.has(p.id) && String(p.id) === pid,
    );
    const matchedBySelection = pipelines.some(
      (p) =>
        isPipelineGroupSelected(p, selectedPipelineIds, pipelines) &&
        (pid === String(p.id) ||
          proc === String(p.name || '').trim().toLowerCase() ||
          proc.includes(String(p.name || '').trim().toLowerCase()) ||
          String(p.name || '').trim().toLowerCase().includes(proc)),
    );
    if (!matchedById && !matchedBySelection) return false;
  }

  if (selectedStageOutcomeKeys.size > 0) {
    const selectedStageIds = new Set<string>();
    for (const key of selectedStageOutcomeKeys) {
      const parsed = parseStageOutcomeKey(key);
      if (parsed?.stageId) selectedStageIds.add(parsed.stageId);
    }
    const stageId = event.stageId ? String(event.stageId) : '';
    const stageName = String(event.stage || '').trim().toLowerCase();
    if (selectedStageIds.size > 0) {
      if (stageId && selectedStageIds.has(stageId)) return true;
      const pipelinesForStages = pipelines.filter(
        (p) => selectedPipelineIds.size === 0 || selectedPipelineIds.has(p.id),
      );
      const nameMatch = pipelinesForStages.some((p) =>
        (p.stages || []).some(
          (s) =>
            selectedStageIds.has(s.id) &&
            String(s.name || '').trim().toLowerCase() === stageName,
        ),
      );
      if (!nameMatch) return false;
    }
  }

  return true;
}

export function filterOutcomesByStageSelection<T extends { id: string }>(
  outcomes: T[],
  stageId: string,
  selectedStageOutcomeKeys: Set<string>,
): T[] {
  if (selectedStageOutcomeKeys.size === 0) return outcomes;
  const selectedOutcomeIds = new Set<string>();
  let stageSelected = false;
  for (const key of selectedStageOutcomeKeys) {
    const parsed = parseStageOutcomeKey(key);
    if (!parsed) continue;
    if (parsed.stageId === stageId && parsed.kind === 'stage') stageSelected = true;
    if (parsed.stageId === stageId && parsed.kind === 'outcome' && parsed.outcomeId) {
      selectedOutcomeIds.add(parsed.outcomeId);
    }
  }
  if (selectedOutcomeIds.size > 0) {
    return outcomes.filter((o) => selectedOutcomeIds.has(o.id));
  }
  if (stageSelected) return outcomes;
  return outcomes;
}
