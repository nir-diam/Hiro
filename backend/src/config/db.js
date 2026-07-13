const { Sequelize } = require('sequelize');

// Set POSTGRES_URI or DATABASE_URL in backend/.env. Do not rely on repo defaults for production.
const sequelize = new Sequelize(
  process.env.POSTGRES_URI
    || process.env.DATABASE_URL
    || 'postgres://postgres:qwe123ZZZ@herodb.cjauwauq6xes.eu-north-1.rds.amazonaws.com:5432/postgres',
  {
    logging: false,
  },
);

const connectDb = async () => {
  await sequelize.authenticate();

  // Register models before sync to ensure associations load if added later
  require('../models/User');
  require('../models/Candidate');
  require('../models/Job');
  require('../models/JobCandidate');
  require('../models/JobCandidateStatusEvent');
  require('../models/JobCandidateScreening');
  require('../models/MessageLog');
  require('../models/Organization');
  require('../models/OrganizationChangeHistory');
  require('../models/Client');
  require('../models/ClientOrganizationLink');
  require('../models/ClientContact');
  require('../models/ClientContactGroup');
  require('../models/ClientTask');
  require('../models/JobPublication');
  require('../models/Tag');
  require('../models/TagHistory');
  require('../models/SystemTag');
  require('../models/Chat');
  require('../models/ChatMessage');
  require('../models/JobCategory');
  require('../models/JobCluster');
  require('../models/JobRole');
  require('../models/Prompt');
  require('../models/PromptHistory');
  require('../models/CandidateApplication');
  require('../models/OrganizationTmp');
  require('../models/OrganizationHistory');
  require('../models/BusinessLogicRule');
  require('../models/EmailUpload');
  require('../models/NotificationMessage');
  require('../models/City');
  require('../models/CandidateOrganization');
  require('../models/MessageTemplate');
  require('../models/ClientUsageSetting');
  require('../models/LoginEmailCode');
  require('../models/EventType');
  require('../models/RecruitmentStatus');
  require('../models/RecruitmentSource');
  require('../models/MatchingEngineConfig');
  require('../models/TagAiDecision');
  require('../models/TagCorrectionPlatformSettings');
  require('../models/AppLog');

  const User = require('../models/User');
  const Client = require('../models/Client');
  const MessageTemplate = require('../models/MessageTemplate');
  const ClientUsageSetting = require('../models/ClientUsageSetting');
  const RecruitmentStatus = require('../models/RecruitmentStatus');
  const RecruitmentSource = require('../models/RecruitmentSource');
  const JobPublication = require('../models/JobPublication');
  User.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(User, { foreignKey: 'clientId', as: 'members' });
  MessageTemplate.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(MessageTemplate, { foreignKey: 'clientId', as: 'messageTemplates' });
  Client.hasOne(ClientUsageSetting, { foreignKey: 'clientId', as: 'usageSettings' });
  ClientUsageSetting.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(RecruitmentStatus, { foreignKey: 'clientId', as: 'recruitmentStatuses' });
  RecruitmentStatus.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(RecruitmentSource, { foreignKey: 'clientId', as: 'recruitmentSources' });
  RecruitmentSource.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  const Job = require('../models/Job');
  Job.hasOne(JobPublication, { foreignKey: 'jobId', as: 'publication' });
  JobPublication.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

  await sequelize.sync();

  // users table has legacy is_active + duplicate "isActive" from sync — keep them aligned (false wins).
  await sequelize.query(`
    UPDATE users
    SET is_active = CASE
      WHEN is_active = false OR "isActive" = false THEN false
      ELSE COALESCE(is_active, "isActive", true)
    END
    WHERE is_active IS DISTINCT FROM "isActive";
  `).catch(() => {});
  await sequelize.query(`
    UPDATE users SET "isActive" = is_active WHERE "isActive" IS DISTINCT FROM is_active;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE tag_ai_decisions
      ADD COLUMN IF NOT EXISTS resolved_target_tag_id UUID NULL REFERENCES tags(id) ON DELETE SET NULL;
  `).catch(() => {});

  // Safe additive columns for job_publications (sync does not alter existing tables).
  await sequelize.query(`
    ALTER TABLE job_publications
      ADD COLUMN IF NOT EXISTS "heroImageUrl" VARCHAR(2048),
      ADD COLUMN IF NOT EXISTS "videoUrl" VARCHAR(2048),
      ADD COLUMN IF NOT EXISTS "visitCount" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "submissionCount" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "contactEmail" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "contactPhone1" VARCHAR(64),
      ADD COLUMN IF NOT EXISTS "contactPhone2" VARCHAR(64),
      ADD COLUMN IF NOT EXISTS "landingLayout" VARCHAR(32) DEFAULT 'detailed',
      ADD COLUMN IF NOT EXISTS "landingLayouts" JSONB NOT NULL DEFAULT '{}'::jsonb;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS "logoUrl" VARCHAR(2048),
      ADD COLUMN IF NOT EXISTS "primaryColor" VARCHAR(32);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS client_organization_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      organization_tmp_id UUID REFERENCES organizations_tmp(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT client_org_link_target_chk CHECK (
        (organization_id IS NOT NULL AND organization_tmp_id IS NULL)
        OR (organization_id IS NULL AND organization_tmp_id IS NOT NULL)
      )
    );
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_organization_links
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  `).catch(() => {});

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_client_org_link_org
      ON client_organization_links (client_id, organization_id)
      WHERE organization_id IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_client_org_link_tmp
      ON client_organization_links (client_id, organization_tmp_id)
      WHERE organization_tmp_id IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'organization_id'
      ) THEN
        INSERT INTO client_organization_links (id, client_id, organization_id, is_primary, created_at, updated_at)
        SELECT gen_random_uuid(), c.id, c.organization_id, true, NOW(), NOW()
        FROM clients c
        WHERE c.organization_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM client_organization_links l
            WHERE l.client_id = c.id AND l.organization_id = c.organization_id
          );
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'organization_tmp_id'
      ) THEN
        INSERT INTO client_organization_links (id, client_id, organization_tmp_id, is_primary, created_at, updated_at)
        SELECT gen_random_uuid(), c.id, c.organization_tmp_id, false, NOW(), NOW()
        FROM clients c
        WHERE c.organization_tmp_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM client_organization_links l
            WHERE l.client_id = c.id AND l.organization_tmp_id = c.organization_tmp_id
          );
      END IF;
    END $$;
  `).catch(() => {});

  await sequelize.query(`
    INSERT INTO client_organization_links (id, client_id, organization_id, is_primary, created_at, updated_at)
    SELECT gen_random_uuid(), c.id, (c.metadata->>'organizationId')::uuid, true, NOW(), NOW()
    FROM clients c
    WHERE c.metadata->>'organizationId' IS NOT NULL
      AND (c.metadata->>'organizationId') ~* '^[0-9a-f-]{36}$'
      AND NOT EXISTS (
        SELECT 1 FROM client_organization_links l
        WHERE l.client_id = c.id
          AND l.organization_id = (c.metadata->>'organizationId')::uuid
      );
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE clients DROP COLUMN IF EXISTS organization_id;
    ALTER TABLE clients DROP COLUMN IF EXISTS organization_tmp_id;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS client_id UUID NULL
      REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE;
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
  `).catch(() => {});

  await sequelize.query(`
    UPDATE jobs j
    SET client_id = c.id
    FROM clients c
    WHERE j.client_id IS NULL
      AND (
        LOWER(TRIM(j.client)) = LOWER(TRIM(c.name))
        OR LOWER(TRIM(j.client)) = LOWER(TRIM(c."displayName"))
      );
  `).catch(() => {});

  console.log('PostgreSQL connected & models synced');
};

module.exports = { sequelize, connectDb };

