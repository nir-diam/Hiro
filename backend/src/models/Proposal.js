const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');
const ClientContact = require('./ClientContact');
const ProposalTemplate = require('./ProposalTemplate');

const Proposal = sequelize.define(
  'Proposal',
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
    contactId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'contact_id',
      references: { model: ClientContact, key: 'id' },
      onDelete: 'SET NULL',
    },
    templateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'template_id',
      references: { model: ProposalTemplate, key: 'id' },
      onDelete: 'SET NULL',
    },
    number: { type: DataTypes.STRING(64), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    validUntil: { type: DataTypes.DATEONLY, allowNull: true, field: 'valid_until' },
    currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'ILS' },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    vatRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 17, field: 'vat_rate' },
    includeVat: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'include_vat' },
    closeProbability: { type: DataTypes.INTEGER, allowNull: true, field: 'close_probability' },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'draft',
    },
    notes: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
    contentHtml: { type: DataTypes.TEXT, allowNull: true, defaultValue: '', field: 'content_html' },
    createdByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_user_id',
    },
    createdByName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'created_by_name',
    },
  },
  {
    tableName: 'proposals',
    underscored: true,
  },
);

Client.hasMany(Proposal, { foreignKey: 'clientId', as: 'proposals' });
Proposal.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Proposal.belongsTo(ClientContact, { foreignKey: 'contactId', as: 'contact' });
Proposal.belongsTo(ProposalTemplate, { foreignKey: 'templateId', as: 'template' });

module.exports = Proposal;
