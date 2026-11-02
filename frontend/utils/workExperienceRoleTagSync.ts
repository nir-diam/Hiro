import { resolveExperienceContextTags, type RoleTagDetailLike } from './workExperienceRoleTag';

export const WORK_EXP_ROLE_QUOTE_PREFIX = 'hiro:wx:';

export const workExpRoleQuote = (rowId: number | string): string =>
    `${WORK_EXP_ROLE_QUOTE_PREFIX}${rowId}`;

const isRoleDetail = (d: Record<string, unknown>): boolean => {
    const raw = String(d.rawType || d.raw_type || '')
        .trim()
        .toLowerCase();
    return raw === 'role' || raw.includes('role');
};

const detailTagId = (d: Record<string, unknown>): string =>
    String(d.tagId ?? d.tag_id ?? (d.tag as { id?: string })?.id ?? '').trim();

const quoteOf = (d: Record<string, unknown>): string =>
    String(d.quote || d.evidence || '').trim();

/** Prefer stored ids; else infer up to 2 role tags already shown on the row. */
export function resolveRowRoleTagIdsForEdit(
    exp: Record<string, unknown> | null | undefined,
    tagDetails: unknown[] = [],
): string[] {
    const stored = resolveRowRoleTagIds(exp, tagDetails);
    if (stored.length) return stored;
    if (!exp || typeof exp !== 'object') return [];
    const ctx = resolveExperienceContextTags(exp, tagDetails).filter((t) => t.type === 'role');
    const ids: string[] = [];
    for (const tag of ctx.slice(0, 2)) {
        const detail = (Array.isArray(tagDetails) ? tagDetails : []).find((d) => {
            if (!d || typeof d !== 'object') return false;
            const raw = d as Record<string, unknown>;
            if (!isRoleDetail(raw)) return false;
            const label = String(raw.displayNameHe || raw.displayNameEn || raw.tagKey || '').trim();
            return label === tag.label;
        }) as Record<string, unknown> | undefined;
        const tid = detail ? detailTagId(detail) : '';
        if (tid) ids.push(tid);
    }
    return [...new Set(ids)].slice(0, 2);
}

/** Up to 2 catalog role tag ids explicitly linked to this job row. */
export function resolveRowRoleTagIds(
    exp: Record<string, unknown> | null | undefined,
    tagDetails: unknown[] = [],
): string[] {
    if (!exp || typeof exp !== 'object') return [];
    const fromRow = Array.isArray(exp.roleTagIds)
        ? exp.roleTagIds.map((id) => String(id).trim()).filter(Boolean)
        : [];
    if (fromRow.length) return [...new Set(fromRow)].slice(0, 2);

    const primary = exp.tagId ?? exp.tag_id;
    if (primary != null && String(primary).trim()) {
        return [String(primary).trim()];
    }

    const rowId = exp.id;
    if (rowId == null || !Array.isArray(tagDetails) || !tagDetails.length) return [];

    const anchor = workExpRoleQuote(rowId);
    const linked: string[] = [];
    for (const item of tagDetails) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Record<string, unknown>;
        if (!isRoleDetail(raw)) continue;
        if (quoteOf(raw) !== anchor) continue;
        const tid = detailTagId(raw);
        if (tid) linked.push(tid);
    }
    return [...new Set(linked)].slice(0, 2);
}

/** Apply roleTagIds + primary tagId/roleTag on each work row before save. */
export function normalizeWorkExperienceRoleFields(
    workExperience: unknown[],
    tagDetails: unknown[] = [],
): Record<string, unknown>[] {
    if (!Array.isArray(workExperience)) return [];
    return workExperience.map((row) => {
        if (!row || typeof row !== 'object') return row as Record<string, unknown>;
        const exp = row as Record<string, unknown>;
        const ids = resolveRowRoleTagIds(exp, tagDetails);
        const next: Record<string, unknown> = { ...exp, roleTagIds: ids };
        if (ids.length) {
            next.tagId = ids[0];
            const detail = (Array.isArray(tagDetails) ? tagDetails : []).find(
                (d) => d && typeof d === 'object' && detailTagId(d as Record<string, unknown>) === ids[0],
            ) as RoleTagDetailLike | undefined;
            const label =
                detail?.displayNameHe ||
                detail?.displayNameEn ||
                detail?.tagKey ||
                String(exp.roleTag || '').trim();
            if (label) next.roleTag = label;
        } else {
            delete next.tagId;
            delete next.roleTag;
        }
        return next;
    });
}

/** Keep candidate tagDetails aligned with per-row roleTagIds (quote anchor per row). */
export function mergeTagDetailsAfterWorkExperienceChange(
    workExperience: unknown[],
    tagDetails: unknown[] | undefined,
): unknown[] {
    const wx = Array.isArray(workExperience) ? workExperience : [];
    const base = Array.isArray(tagDetails) ? [...tagDetails] : [];
    const rowIds = new Set(wx.map((r) => (r && typeof r === 'object' ? String((r as { id?: unknown }).id) : '')).filter(Boolean));

    const filtered = base.filter((item) => {
        if (!item || typeof item !== 'object') return true;
        const raw = item as Record<string, unknown>;
        const q = quoteOf(raw);
        if (!q.startsWith(WORK_EXP_ROLE_QUOTE_PREFIX)) return true;
        const rowId = q.slice(WORK_EXP_ROLE_QUOTE_PREFIX.length);
        if (!rowIds.has(rowId)) return false;
        const row = wx.find((r) => r && typeof r === 'object' && String((r as { id?: unknown }).id) === rowId);
        if (!row || typeof row !== 'object') return false;
        const ids = resolveRowRoleTagIds(row as Record<string, unknown>, base);
        if (!ids.length) return false;
        return ids.includes(detailTagId(raw));
    });

    for (const row of wx) {
        if (!row || typeof row !== 'object') continue;
        const exp = row as Record<string, unknown>;
        const ids = resolveRowRoleTagIds(exp, base);
        if (!ids.length) continue;
        const anchor = workExpRoleQuote(String(exp.id ?? ''));
        const end = String(exp.endDate || '');
        const isCurrent = exp.isCurrent === true || !end || /present|היום|נוכחי/i.test(end);

        for (const tagId of ids) {
            const exists = filtered.some(
                (d) =>
                    d &&
                    typeof d === 'object' &&
                    isRoleDetail(d as Record<string, unknown>) &&
                    detailTagId(d as Record<string, unknown>) === tagId &&
                    quoteOf(d as Record<string, unknown>) === anchor,
            );
            if (exists) continue;

            const seed = base.find(
                (d) => d && typeof d === 'object' && detailTagId(d as Record<string, unknown>) === tagId,
            ) as Record<string, unknown> | undefined;

            filtered.push({
                tagId,
                displayNameHe: seed?.displayNameHe || exp.roleTag || seed?.displayNameEn || '',
                displayNameEn: seed?.displayNameEn || seed?.displayNameHe || '',
                tagKey: seed?.tagKey,
                rawType: 'role',
                quote: anchor,
                evidence: anchor,
                context: 'Core',
                tagReason: 'תפקיד מקושר לניסיון תעסוקתי',
                isCurrent,
                confidenceScore: 0.9,
            });
        }
    }

    return filtered;
}
