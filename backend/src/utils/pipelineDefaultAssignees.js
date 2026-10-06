const User = require('../models/User');
const { normalizeDefaultAssigneeUserIds } = require('../services/clientPipelineService');

async function resolvePipelineDefaultCoordinatorString(pipeline) {
  if (!pipeline) return null;
  const ids = normalizeDefaultAssigneeUserIds(
    pipeline.defaultAssigneeUserIds,
    pipeline.defaultContactId,
  );
  if (!ids.length) return null;
  const users = await User.findAll({
    where: { id: ids },
    attributes: ['id', 'name', 'email'],
  });
  const byId = new Map(users.map((u) => [String(u.id), u]));
  const names = ids
    .map((id) => {
      const u = byId.get(String(id));
      return String(u?.name || u?.email || '').trim();
    })
    .filter(Boolean);
  return names.length ? names.join(', ') : null;
}

module.exports = {
  resolvePipelineDefaultCoordinatorString,
};
