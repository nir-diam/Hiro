const TAG_PROTECTED_MESSAGE =
  'לא ניתן לעדכן את התגית כל עוד היא נמצאת בתגיות מוגנות';

const ALLOWED_PROTECTED_UPDATE_FIELDS = new Set(['synonyms', 'aliases', 'domains']);

const createTagProtectedError = () => {
  const err = new Error(TAG_PROTECTED_MESSAGE);
  err.status = 403;
  err.code = 'TAG_PROTECTED';
  return err;
};

const isTagProtectedRow = (tag) => {
  if (!tag) return false;
  const plain = tag.get ? tag.get({ plain: true }) : tag;
  return plain.isProtected === true;
};

const assertTagNotProtectedForMutation = (tag) => {
  if (isTagProtectedRow(tag)) throw createTagProtectedError();
};

const assertProtectedTagUpdateAllowed = (tag, payload = {}) => {
  if (!isTagProtectedRow(tag)) return;
  const keys = Object.keys(payload).filter(
    (key) => !['updatedBy', 'updated_by', 'embedding'].includes(key) && payload[key] !== undefined,
  );
  const disallowed = keys.filter((key) => !ALLOWED_PROTECTED_UPDATE_FIELDS.has(key));
  if (disallowed.length) throw createTagProtectedError();
};

const partitionIdsByProtection = async (Tag, ids = []) => {
  const unique = [...new Set((ids || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length) return { protectedIds: [], mutableIds: [] };
  const rows = await Tag.findAll({
    where: { id: unique },
    attributes: ['id', 'isProtected'],
  });
  const protectedIds = [];
  const mutableIds = [];
  for (const row of rows) {
    if (isTagProtectedRow(row)) protectedIds.push(String(row.id));
    else mutableIds.push(String(row.id));
  }
  const found = new Set(rows.map((r) => String(r.id)));
  for (const id of unique) {
    if (!found.has(id)) mutableIds.push(id);
  }
  return { protectedIds, mutableIds };
};

module.exports = {
  TAG_PROTECTED_MESSAGE,
  ALLOWED_PROTECTED_UPDATE_FIELDS,
  createTagProtectedError,
  isTagProtectedRow,
  assertTagNotProtectedForMutation,
  assertProtectedTagUpdateAllowed,
  partitionIdsByProtection,
};
