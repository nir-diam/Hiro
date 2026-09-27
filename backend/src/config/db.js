const { Sequelize } = require('sequelize');

// Set POSTGRES_URI or DATABASE_URL in backend/.env. Do not rely on repo defaults for production.
const sequelize = new Sequelize(
  process.env.POSTGRES_URI
    || process.env.DATABASE_URL
    || 'postgres://postgres:qwe123ZZZ@herodb.cjauwauq6xes.eu-north-1.rds.amazonaws.com:5432/postgres',
  {
    logging: false,
    dialectOptions: {
      keepAlive: true,
    },
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 30000,
    },
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
  require('../models/OrganizationLocation');
  require('../models/OrganizationContact');
  require('../models/OrganizationChangeHistory');
  require('../models/Client');
  require('../models/ClientOrganizationLink');
  require('../models/ClientContact');
  require('../models/ProposalTemplate');
  require('../models/Proposal');
  require('../models/ClientContactGroup');
  require('../models/ClientTask');
  require('../models/ClientPipeline');
  require('../models/ClientPipelineStage');
  require('../models/CandidatePipeline');
  require('../models/CandidatePipelineStage');
  require('../models/ClientHealthRule');
  require('../models/JobHealthRule');
  require('../models/JobHealthSetting');
  require('../models/JobPublication');
  require('../models/JobImage');
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
  require('../models/SmsRsvpRequest');
  require('../models/SmsRsvpInboundLog');
  require('../models/SmsRsvpDeliveryLog');

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

  const ClientPipeline = require('../models/ClientPipeline');
  const ClientPipelineStage = require('../models/ClientPipelineStage');
  ClientPipeline.hasMany(ClientPipelineStage, { foreignKey: 'pipelineId', as: 'stages', onDelete: 'CASCADE' });
  ClientPipelineStage.belongsTo(ClientPipeline, { foreignKey: 'pipelineId', as: 'pipeline' });

  const CandidatePipeline = require('../models/CandidatePipeline');
  const CandidatePipelineStage = require('../models/CandidatePipelineStage');
  CandidatePipeline.hasMany(CandidatePipelineStage, { foreignKey: 'pipelineId', as: 'stages', onDelete: 'CASCADE' });
  CandidatePipelineStage.belongsTo(CandidatePipeline, { foreignKey: 'pipelineId', as: 'pipeline' });

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

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "desiredRoles" JSONB NOT NULL DEFAULT '[]'::jsonb;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "profileVideoUrl" VARCHAR(2048);
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "portalAccessToken" UUID NULL,
      ADD COLUMN IF NOT EXISTS "portalAccessTokenExpiresAt" TIMESTAMPTZ NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "approveByCandidate" BOOLEAN NOT NULL DEFAULT false;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "consentToJobOffers" BOOLEAN NOT NULL DEFAULT false;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "canonicalCandidateId" UUID NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "staffProfileCopy" BOOLEAN NOT NULL DEFAULT false;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE email_uploads
      ADD COLUMN IF NOT EXISTS user_notes TEXT NULL;
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
      ADD COLUMN IF NOT EXISTS "landingLayouts" JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "heroDesignInstructions" TEXT;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS "logoUrl" VARCHAR(2048),
      ADD COLUMN IF NOT EXISTS "primaryColor" VARCHAR(32);
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_contacts
      ADD COLUMN IF NOT EXISTS "organizationId" UUID NULL REFERENCES organizations(id) ON DELETE SET NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_contacts
      ADD COLUMN IF NOT EXISTS "pipelineId" UUID NULL,
      ADD COLUMN IF NOT EXISTS "processStage" VARCHAR(255) NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_contacts
      ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(255) NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(255) NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS "distributionEmail" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "distributionSms" BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "distributionWhatsapp" BOOLEAN NOT NULL DEFAULT true;
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_client_contacts_org
      ON client_contacts ("organizationId")
      WHERE "organizationId" IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_organization_links
      ADD COLUMN IF NOT EXISTS pipeline_id UUID NULL,
      ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(255) NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_tasks
      ADD COLUMN IF NOT EXISTS "organizationId" UUID NULL REFERENCES organizations(id) ON DELETE SET NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_client_tasks_org
      ON client_tasks ("organizationId")
      WHERE "organizationId" IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_tasks
      ADD COLUMN IF NOT EXISTS "organizationTmpId" UUID NULL REFERENCES organizations_tmp(id) ON DELETE SET NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_client_tasks_org_tmp
      ON client_tasks ("organizationTmpId")
      WHERE "organizationTmpId" IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS client_pipelines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_client_pipelines_client
      ON client_pipelines (client_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS client_pipeline_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pipeline_id UUID NOT NULL REFERENCES client_pipelines(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(120) NOT NULL DEFAULT 'bg-gray-100 text-gray-700',
      sort_index INTEGER NOT NULL DEFAULT 0,
      sla_limit INTEGER NOT NULL DEFAULT 0,
      outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_pipeline_stages
      ADD COLUMN IF NOT EXISTS outcomes JSONB NOT NULL DEFAULT '[]'::jsonb;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_pipeline_stages
      ADD COLUMN IF NOT EXISTS sla_limit_unit VARCHAR(16) NOT NULL DEFAULT 'days';
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_client_pipeline_stages_pipeline
      ON client_pipeline_stages (pipeline_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS candidate_pipelines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_candidate_pipelines_client
      ON candidate_pipelines (client_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS candidate_pipeline_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pipeline_id UUID NOT NULL REFERENCES candidate_pipelines(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      color VARCHAR(120) NOT NULL DEFAULT 'bg-gray-100 text-gray-700',
      sort_index INTEGER NOT NULL DEFAULT 0,
      sla_limit INTEGER NOT NULL DEFAULT 0,
      outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidate_pipeline_stages
      ADD COLUMN IF NOT EXISTS sla_limit_unit VARCHAR(16) NOT NULL DEFAULT 'days';
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_candidate_pipeline_stages_pipeline
      ON candidate_pipeline_stages (pipeline_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS "candidatePipelineId" UUID NULL,
      ADD COLUMN IF NOT EXISTS "pipelineStageId" UUID NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS client_health_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
      pipeline_id UUID NULL REFERENCES client_pipelines(id) ON DELETE CASCADE,
      color VARCHAR(32) NOT NULL DEFAULT 'gray',
      condition VARCHAR(64) NOT NULL,
      operator VARCHAR(32) NOT NULL DEFAULT 'gt',
      value INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE client_health_rules
      ADD COLUMN IF NOT EXISTS pipeline_id UUID NULL REFERENCES client_pipelines(id) ON DELETE CASCADE;
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_client_health_rules_scope
      ON client_health_rules (client_id, organization_id, pipeline_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS organization_locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      description VARCHAR(255) NOT NULL DEFAULT '',
      location VARCHAR(255) NOT NULL DEFAULT '',
      address VARCHAR(255) NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_organization_locations_org
      ON organization_locations (organization_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS organization_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      first_name VARCHAR(255) NOT NULL DEFAULT '',
      last_name VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(255) NULL DEFAULT '',
      office_phone VARCHAR(255) NULL DEFAULT '',
      mobile VARCHAR(255) NULL DEFAULT '',
      website VARCHAR(255) NULL DEFAULT '',
      linkedin VARCHAR(255) NULL DEFAULT '',
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_organization_contacts_org
      ON organization_contacts (organization_id, sort_index);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proposal_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      updated_by_name VARCHAR(255) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_proposal_templates_client
      ON proposal_templates (client_id, updated_at DESC);
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS proposals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      contact_id UUID NULL REFERENCES client_contacts(id) ON DELETE SET NULL,
      template_id UUID NULL REFERENCES proposal_templates(id) ON DELETE SET NULL,
      number VARCHAR(64) NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      valid_until DATE NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'ILS',
      amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
      vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 17,
      include_vat BOOLEAN NOT NULL DEFAULT true,
      close_probability INTEGER NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      notes TEXT NULL DEFAULT '',
      content_html TEXT NULL DEFAULT '',
      created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_by_name VARCHAR(255) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (client_id, number)
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_proposals_client
      ON proposals (client_id, date DESC);
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_proposals_contact
      ON proposals (contact_id, date DESC)
      WHERE contact_id IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS job_health_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_job_health_settings_client
      ON job_health_settings (client_id)
      WHERE organization_id IS NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_job_health_settings_org
      ON job_health_settings (client_id, organization_id)
      WHERE organization_id IS NOT NULL;
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS job_health_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
      profile_id VARCHAR(32) NOT NULL DEFAULT 'standard',
      color VARCHAR(32) NOT NULL DEFAULT 'gray',
      condition VARCHAR(64) NOT NULL,
      operator VARCHAR(32) NOT NULL DEFAULT 'gt',
      value INTEGER NOT NULL DEFAULT 0,
      max_value INTEGER NULL,
      stage VARCHAR(255) NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      sort_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_job_health_rules_scope
      ON job_health_rules (client_id, organization_id, profile_id, sort_index);
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
    ALTER TABLE message_templates
      ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(2048) NULL,
      ADD COLUMN IF NOT EXISTS attachment_file_name VARCHAR(512) NULL,
      ADD COLUMN IF NOT EXISTS attachment_content_type VARCHAR(128) NULL,
      ADD COLUMN IF NOT EXISTS attachment_file_size INTEGER NULL;
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE message_templates
      ADD COLUMN IF NOT EXISTS for_candidate BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS for_client_contact BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS for_team_member BOOLEAN NOT NULL DEFAULT TRUE;
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

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sms_rsvp_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
      phone VARCHAR(32) NOT NULL,
      phone_digits VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      rsvp_response VARCHAR(48) NULL,
      outbound_message TEXT NULL,
      outbound_sent_at TIMESTAMPTZ NULL,
      inforu_customer_message_id VARCHAR(128) NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      answered_at TIMESTAMPTZ NULL,
      inbound_message_raw TEXT NULL,
      inbound_keyword VARCHAR(64) NULL,
      reminder_sent_at TIMESTAMPTZ NULL,
      delivery_status VARCHAR(64) NULL,
      delivery_status_at TIMESTAMPTZ NULL,
      created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_sms_rsvp_requests_phone_pending
      ON sms_rsvp_requests (phone_digits, expires_at DESC)
      WHERE status = 'pending';
  `).catch(() => {});

  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_rsvp_requests_one_pending_per_candidate
      ON sms_rsvp_requests (candidate_id)
      WHERE status = 'pending';
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sms_rsvp_inbound_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      phone VARCHAR(32) NOT NULL,
      phone_digits VARCHAR(32) NOT NULL,
      message TEXT NULL,
      keyword VARCHAR(64) NULL,
      short_code VARCHAR(32) NULL,
      parse_result VARCHAR(48) NULL,
      matched_request_id UUID NULL REFERENCES sms_rsvp_requests(id) ON DELETE SET NULL,
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `).catch(() => {});

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sms_rsvp_delivery_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NULL REFERENCES sms_rsvp_requests(id) ON DELETE SET NULL,
      phone VARCHAR(32) NULL,
      phone_digits VARCHAR(32) NULL,
      delivery_status VARCHAR(64) NOT NULL,
      raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).catch(() => {});

  await sequelize.query(`
    ALTER TABLE login_email_codes
      ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(16) NOT NULL DEFAULT 'email';
  `).catch(() => {});

  try {
    const [clearedRows] = await sequelize.query(`
      UPDATE candidates
      SET "ingestPending" = false, "updatedAt" = NOW()
      WHERE "ingestPending" = true
        AND (
          "updatedAt" < NOW() - INTERVAL '5 minutes'
          OR (
            length(trim(coalesce("fullName", ''))) > 2
            AND length(trim(coalesce("professionalSummary", ''))) > 10
          )
        )
      RETURNING id;
    `);
    if (clearedRows?.length) {
      console.log('[startup] cleared stale ingestPending on', clearedRows.length, 'candidate(s)');
    }
  } catch (_) { /* non-fatal */ }

  console.log('PostgreSQL connected & models synced');
};

module.exports = { sequelize, connectDb };

