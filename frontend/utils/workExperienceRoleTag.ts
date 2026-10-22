export type RoleTagDetailLike = {
  tagId?: string | number;
  tag?: { id?: string | number };
  displayNameHe?: string;
  displayNameEn?: string;
  tagKey?: string;
  rawType?: string;
  raw_type?: string;
};

const isRoleDetail = (d: RoleTagDetailLike) =>
  String(d.rawType || d.raw_type || '')
    .trim()
    .toLowerCase() === 'role';

/** Display label for תפקיד (תגית) when DB row lacks roleTag but candidate has role tags. */
export function resolveRoleTagForJob(
  exp: Record<string, unknown> | null | undefined,
  tagDetails: RoleTagDetailLike[] = [],
): string {
  if (!exp || typeof exp !== 'object') return '';
  const direct = String(exp.roleTag ?? exp.role_tag ?? '').trim();
  if (direct) return direct;

  const tagId = exp.tagId ?? exp.tag_id;
  if (tagId != null && tagDetails.length) {
    const idStr = String(tagId);
    const byId = tagDetails.find((d) => {
      const detailId = d.tagId ?? d.tag?.id;
      return detailId != null && String(detailId) === idStr;
    });
    if (byId) {
      return String(byId.displayNameHe || byId.displayNameEn || byId.tagKey || '').trim();
    }
  }

  const title = String(exp.title ?? exp.position ?? exp.role ?? '')
    .trim()
    .toLowerCase();
  if (title && tagDetails.length) {
    for (const d of tagDetails.filter(isRoleDetail)) {
      const name = String(d.displayNameHe || d.displayNameEn || d.tagKey || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (key === title || title.includes(key) || key.includes(title)) return name;
    }
  }

  return String(exp.title ?? exp.position ?? exp.role ?? '').trim();
}
