const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');

const ProposalTemplate = sequelize.define(
  'ProposalTemplate',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'client_id',
      references: { model: Client, key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    updatedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by_user_id',
    },
    updatedByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'updated_by_name',
    },
  },
  {
    tableName: 'proposal_templates',
    underscored: true,
  },
);

Client.hasMany(ProposalTemplate, { foreignKey: 'clientId', as: 'proposalTemplates' });
ProposalTemplate.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

module.exports = ProposalTemplate;
