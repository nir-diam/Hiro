/**
 * Safe deletion of catalog `tags` rows.
 *
 * `system_tags.tag_id` and `tag_histories.tag_id` reference `tags(id)` with NO ON DELETE
 * action, so a plain `DELETE FROM tags` raises:
 *
 *   update or delete on table "tags" violates foreign key constraint
 *   "candidate_tags_tag_id_fkey" on table "system_tags"
 *
 * Every delete path must first re-point or remove the child rows. `purgeCatalogTagRows`
 * does that for the known children and then falls back to a catalog-wide FK sweep so an
 * unknown/legacy reference can never abort a reviewer merge.
 */
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TAG_CANDIDATE_TYPE = 'candidate';
const TAG_JOB_TYPE = 'job';

const toIdList = (ids = []) => [
  ...new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ),
];

/**
 * Discover every FK column that points at `tags(id)`.
 * @returns {Promise<Array<{ table_name: string, column_name: string }>>}
 */
const listTagForeignKeyColumns = async () => {
  try {
    const rows = await sequelize.query(
      `
      SELECT c.conrelid::regclass::text AS table_name,
             a.attname                 AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = ANY (c.conkey)
        JOIN pg_attribute fa
          ON fa.attrelid = c.confrelid
         AND fa.attnum = ANY (c.confkey)
       WHERE c.contype = 'f'
         AND c.confrelid = 'tags'::regclass
         AND fa.attname = 'id'
      `,
      { type: QueryTypes.SELECT },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn('[tagDeletionService] FK lookup failed:', err?.message || err);
    return [];
  }
};

const quoteQualifiedName = (name) =>
  String(name || '')
    .replace(/"/g, '')
    .split('.')
    .filter(Boolean)
    .map((part) => `"${part}"`)
    .join('.');

/**
 * Delete tag rows; on a foreign key violation clear every referencing table and retry once.
 * @returns {Promise<number>} deleted row count
 */
const deleteTagRowsClearingFk = async (ids = []) => {
  const cleanIds = toIdList(ids);
  if (!cleanIds.length) return 0;

  const Tag = require('../models/Tag');

  try {
    return await Tag.destroy({ where: { id: { [Op.in]: cleanIds } } });
  } catch (err) {
    const isFk =
      err?.code === '23503'
      || err?.parent?.code === '23503'
      || /violates foreign key constraint/i.test(err?.message || '');
    if (!isFk) throw err;

    console.warn(
      '[tagDeletionService] tag delete hit a foreign key — clearing references and retrying:',
      err?.message || err,
    );

    const refs = await listTagForeignKeyColumns();
    for (const ref of refs) {
      const table = quoteQualifiedName(ref.table_name);
      const column = String(ref.column_name || '').trim();
      if (!table || !column) continue;
      await sequelize
        .query(`DELETE FROM ${table} WHERE "${column.replace(/"/g, '""')}" IN (:ids)`, {
          replacements: { ids: cleanIds },
        })
        .catch((deleteErr) => {
          console.warn(
            `[tagDeletionService] could not clear ${table}.${column}:`,
            deleteErr?.message || deleteErr,
          );
        });
    }

    return Tag.destroy({ where: { id: { [Op.in]: cleanIds } } });
  }
};

/**
 * Delete catalog tags together with all dependent rows.
 * @param {string[]} ids
 * @param {{ targetTag?: object|null }} options  when targetTag is set, candidate/job links are
 *        re-pointed to it (collisions with the unique index are dropped) instead of removed.
 * @returns {Promise<number>} number of deleted catalog tags
 */
const purgeCatalogTagRows = async (ids = [], { targetTag = null } = {}) => {
  const cleanIds = toIdList(ids);
  if (!cleanIds.length) return 0;

  const SystemTag = require('../models/SystemTag');
  const TagHistory = require('../models/TagHistory');

  const targetId = targetTag?.id ? String(targetTag.id) : '';
  const targetActive = Boolean(
    targetTag?.status && String(targetTag.status).toLowerCase() === 'active',
  );

  if (targetId) {
    const rows = await SystemTag.findAll({ where: { tag_id: { [Op.in]: cleanIds } } });
    for (const row of rows) {
      const type = row.type || TAG_CANDIDATE_TYPE;
      const existing = await SystemTag.findOne({
        where: { entity_id: row.entity_id, tag_id: targetId, type },
      });
      if (existing) {
        await row.destroy();
        if (type === TAG_JOB_TYPE && targetActive && existing.is_active === false) {
          await existing.update({ is_active: true });
        }
      } else {
        await row.update({
          tag_id: targetId,
          is_active: type === TAG_JOB_TYPE ? targetActive : true,
          ...(type === TAG_JOB_TYPE && targetTag?.type ? { raw_type: targetTag.type } : {}),
        });
      }
    }
  }

  // Anything still pointing at a doomed tag is an unrecoverable duplicate link.
  await SystemTag.destroy({ where: { tag_id: { [Op.in]: cleanIds } } });
  await TagHistory.destroy({ where: { tag_id: { [Op.in]: cleanIds } } });

  // Legacy many-to-many link table — may not exist in every environment.
  if (targetId) {
    await sequelize
      .query(
        `UPDATE job_role_tags SET tag_id = :targetId
          WHERE tag_id IN (:ids)
            AND NOT EXISTS (
              SELECT 1 FROM job_role_tags existing
               WHERE existing.job_role_id = job_role_tags.job_role_id
                 AND existing.tag_id = :targetId
            )`,
        { replacements: { ids: cleanIds, targetId } },
      )
      .catch(() => {});
  }
  await sequelize
    .query('DELETE FROM job_role_tags WHERE tag_id IN (:ids)', { replacements: { ids: cleanIds } })
    .catch(() => {});

  return deleteTagRowsClearingFk(cleanIds);
};

module.exports = {
  purgeCatalogTagRows,
  deleteTagRowsClearingFk,
  listTagForeignKeyColumns,
};
