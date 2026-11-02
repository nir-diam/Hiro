const SystemTag = require('../src/models/SystemTag');
const { Op } = require('sequelize');

(async () => {
  const rows = await SystemTag.findAll({
    where: {
      [Op.or]: [
        { tagKey: { [Op.in]: ['operations_manager', 'operations_and_control_coordinator'] } },
        { displayNameHe: { [Op.iLike]: '%תפעול%' } },
      ],
    },
    attributes: [
      'id',
      'tagKey',
      'displayNameHe',
      'category',
      'type',
      'clusterId',
      'parentId',
    ],
    limit: 30,
    raw: true,
  });
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
