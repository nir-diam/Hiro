const RecruitmentStatus = require('../models/RecruitmentStatus');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val.trim());
}

function normalizeRow(raw, idx) {
  const name = String(raw.name ?? '').trim();
  const statusGroup = String(raw.statusGroup ?? raw.group ?? 'בתהליך').trim() || 'בתהליך';
  let textColor = String(raw.textColor ?? '#000000').trim();
  if (!/^#[0-9a-f]{3,8}$/i.test(textColor)) textColor = '#000000';
  textColor = textColor.slice(0, 32);
  const isActive = raw.isActive !== false && raw.isActive !== 0 && raw.isActive !== 'false';
  return {
    id: raw.id,
    sortIndex: Number.isFinite(raw.sortIndex) ? raw.sortIndex : idx,
    statusGroup,
    name,
    textColor,
    isActive,
  };
}

async function listByClientId(clientId) {
  const rows = await RecruitmentStatus.findAll({
    where: { clientId },
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return rows.map(toDto);
}

function toDto(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    clientId: plain.clientId,
    sortIndex: plain.sortIndex,
    group: plain.statusGroup,
    name: plain.name,
    textColor: plain.textColor,
    isActive: plain.isActive,
  };
}

/**
 * Replace/sync all statuses for a client from an ordered array.
 * Rows without a valid UUID or unknown id are inserted; missing ids are deleted.
 */
async function syncClientStatuses(clientId, incoming = []) {
  const { sequelize } = require('../config/db');
  const list = Array.isArray(incoming) ? incoming : [];

  return sequelize.transaction(async (transaction) => {
    const existingRows = await RecruitmentStatus.findAll({
      where: { clientId },
      transaction,
    });
    const existingById = new Map(existingRows.map((r) => [String(r.id), r]));

    const keptIds = [];

    const normalized = list
      .map((r, idx) => normalizeRow(r, idx))
      .filter((r) => r.name);

    for (let i = 0; i < normalized.length; i += 1) {
      const row = normalized[i];
      const sortIndex = i;
      const payload = {
        clientId,
        sortIndex,
        statusGroup: row.statusGroup,
        name: row.name,
        textColor: row.textColor,
        isActive: row.isActive,
      };
      const sid = row.id;
      if (isUuid(sid) && existingById.has(String(sid))) {
        await RecruitmentStatus.update(payload, {
          where: { id: sid, clientId },
          transaction,
        });
        keptIds.push(String(sid));
      } else {
        const created = await RecruitmentStatus.create(payload, { transaction });
        keptIds.push(String(created.id));
      }
    }

    const toRemove = existingRows.filter((r) => !keptIds.includes(String(r.id)));
    for (const r of toRemove) {
      await r.destroy({ transaction });
    }

    const rows = await RecruitmentStatus.findAll({
      where: { clientId },
      order: [
        ['sortIndex', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      transaction,
    });
    return rows.map(toDto);
  });
}

module.exports = {
  listByClientId,
  syncClientStatuses,
  isUuid,
};
