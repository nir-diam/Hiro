const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Job = sequelize.define(
  'Job',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    title: { type: DataTypes.STRING, allowNull: false },
    client: { type: DataTypes.STRING, allowNull: false },
    field: DataTypes.STRING,
    role: DataTypes.STRING,
    priority: {
      type: DataTypes.ENUM('רגילה', 'דחופה', 'קריטית'),
      defaultValue: 'רגילה',
    },
    clientType: DataTypes.STRING,
    city: DataTypes.STRING,
    region: DataTypes.STRING,
    gender: {
      type: DataTypes.ENUM('זכר', 'נקבה', 'לא משנה'),
      defaultValue: 'לא משנה',
    },
    mobility: DataTypes.BOOLEAN,
    licenseType: DataTypes.STRING,
    postingCode: DataTypes.STRING,
    validityDays: DataTypes.INTEGER,
    recruitingCoordinator: DataTypes.STRING,
    accountManager: DataTypes.STRING,
    salaryMin: DataTypes.INTEGER,
    salaryMax: DataTypes.INTEGER,
    ageMin: DataTypes.INTEGER,
    ageMax: DataTypes.INTEGER,
    openPositions: DataTypes.INTEGER,
    status: {
      type: DataTypes.ENUM('פתוחה', 'מוקפאת', 'מאוישת', 'טיוטה'),
      defaultValue: 'טיוטה',
    },
    associatedCandidates: DataTypes.INTEGER,
    waitingForScreening: DataTypes.INTEGER,
    activeProcess: DataTypes.INTEGER,
    openDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    recruiter: DataTypes.STRING,
    location: DataTypes.STRING,
    jobType: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    description: DataTypes.TEXT,
    requirements: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    rating: DataTypes.INTEGER,
    healthProfile: {
      type: DataTypes.ENUM('standard', 'high_volume', 'executive', 'disabled'),
      defaultValue: 'standard',
    },
    internalNotes: DataTypes.TEXT,
    contacts: { type: DataTypes.JSONB, defaultValue: [] },
    recruitmentSources: { type: DataTypes.JSONB, defaultValue: [] },
    telephoneQuestions: { type: DataTypes.JSONB, defaultValue: [] },
    languages: { type: DataTypes.JSONB, defaultValue: [] },
  },
  {
    tableName: 'jobs',
  },
);

module.exports = Job;

