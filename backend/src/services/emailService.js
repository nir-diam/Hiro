const EmailUpload = require('../models/EmailUpload');

const create = async (payload) => {
  const record = await EmailUpload.create(payload);
  return record;
};

module.exports = { create };

