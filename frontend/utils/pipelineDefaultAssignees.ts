import type { PipelineDto } from '../services/pipelinesApi';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAssigneeUserId(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function resolvePipelineDefaultAssigneeUserIds(
  pipeline: Pick<PipelineDto, 'defaultAssigneeUserIds' | 'defaultContactId'> | undefined,
): string[] {
  if (!pipeline) return [];
  const fromList = Array.isArray(pipeline.defaultAssigneeUserIds)
    ? pipeline.defaultAssigneeUserIds
    : [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of fromList) {
    const id = String(raw || '').trim();
    if (!isAssigneeUserId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length) return ids;
  const legacy = String(pipeline.defaultContactId || '').trim();
  return isAssigneeUserId(legacy) ? [legacy] : [];
}

export function resolvePipelineDefaultAssigneeNames(
  pipeline: Pick<PipelineDto, 'defaultAssigneeUserIds' | 'defaultContactId'> | undefined,
  staffUsers: Array<{ id: string; name: string }>,
): string[] {
  const ids = resolvePipelineDefaultAssigneeUserIds(pipeline);
  if (!ids.length) return [];
  const byId = new Map(staffUsers.map((u) => [u.id, u.name]));
  return ids
    .map((id) => String(byId.get(id) || '').trim())
    .filter(Boolean);
}
