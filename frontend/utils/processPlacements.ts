import type { PipelineDto } from '../services/pipelinesApi';

export function inferPipelineIdForStage(
  stageId: string | undefined,
  pipelines: PipelineDto[],
): string | undefined {
  const sid = String(stageId || '').trim();
  if (!sid) return undefined;
  for (const p of pipelines) {
    if (p.stages?.some((s) => s.id === sid)) return p.id;
  }
  return undefined;
}

export const firstStageIdForPipeline = (pipeline: PipelineDto): string | null => {
  const stages = [...(pipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const first = stages[0]?.id;
  return first ? String(first) : null;
};

/** Match ClientsListView Kanban: explicit stage, or first column when unassigned. */
export const resolveProcessPlacements = (
  pipelineId: string | null | undefined,
  stageId: string | null | undefined,
  pipelines: PipelineDto[],
): Array<{ pipelineId: string; processStage: string }> => {
  const pid = String(pipelineId || '').trim();
  const sid = String(stageId || '').trim();

  if (sid) {
    const resolvedPid = pid || inferPipelineIdForStage(sid, pipelines);
    if (resolvedPid) return [{ pipelineId: resolvedPid, processStage: sid }];
    return [];
  }

  if (pid) {
    const pipeline = pipelines.find((p) => p.id === pid);
    const first = pipeline ? firstStageIdForPipeline(pipeline) : null;
    return first ? [{ pipelineId: pid, processStage: first }] : [];
  }

  if (!pipelines.length) return [];

  return pipelines
    .map((p) => {
      const first = firstStageIdForPipeline(p);
      return first ? { pipelineId: p.id, processStage: first } : null;
    })
    .filter((row): row is { pipelineId: string; processStage: string } => Boolean(row));
};

export const resolveStageDisplay = (
  pipeline: PipelineDto | undefined,
  stageId: string | null | undefined,
): { name: string; colorClass: string } => {
  const sid = String(stageId || '').trim();
  if (!sid) return { name: '—', colorClass: 'bg-gray-100 text-gray-700 border-gray-200' };
  const stage = pipeline?.stages?.find((s) => s.id === sid);
  if (stage) {
    const token = String(stage.color || '').trim();
    if (token.includes('bg-') && token.includes('text-')) {
      return { name: stage.name, colorClass: `${token} border-current/20` };
    }
    return { name: stage.name, colorClass: 'bg-primary-50 text-primary-700 border-primary-200' };
  }
  return { name: sid, colorClass: 'bg-gray-100 text-gray-700 border-gray-200' };
};
