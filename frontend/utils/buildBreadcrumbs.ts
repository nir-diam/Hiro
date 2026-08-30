export type BreadcrumbItem = { label: string; path: string };

type SavedSearch = { id: number; name: string };

type BuildBreadcrumbsOptions = {
  pathname: string;
  search?: string;
  savedSearches?: SavedSearch[];
  t: (key: string) => string;
};

const JOB_RESERVED_SEGMENTS = new Set(['new', 'existing', 'edit', 'public']);

const isJobIdSegment = (segment: string | undefined) =>
  Boolean(segment && !JOB_RESERVED_SEGMENTS.has(segment));

/** Build TopBar breadcrumb trail for staff app routes. */
export function buildBreadcrumbs({
  pathname,
  search = '',
  savedSearches = [],
  t,
}: BuildBreadcrumbsOptions): BreadcrumbItem[] {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbItem[] = [{ label: t('breadcrumbs.home'), path: '/dashboard' }];
  const push = (label: string, path: string) => crumbs.push({ label, path });

  if (parts.length === 0) {
    push(t('breadcrumbs.dashboard'), '/dashboard');
    return crumbs;
  }

  const [root, ...rest] = parts;

  switch (root) {
    case 'dashboard':
      push(t('breadcrumbs.dashboard'), '/dashboard');
      break;

    case 'finance': {
      push(t('breadcrumbs.finance'), '/finance/dashboard');
      const tab = rest[0];
      if (tab === 'dashboard') push(t('breadcrumbs.finance_dashboard'), '/finance/dashboard');
      if (tab === 'invoices') push(t('breadcrumbs.finance_invoices'), '/finance/invoices');
      if (tab === 'proposals') push(t('breadcrumbs.finance_proposals'), '/finance/proposals');
      if (tab === 'commissions') push(t('breadcrumbs.finance_commissions'), '/finance/commissions');
      break;
    }

    case 'candidates': {
      push(t('breadcrumbs.candidates_list'), `/candidates${search}`);
      const savedSearchId = new URLSearchParams(search).get('savedSearchId');
      if (rest[0] === 'new') {
        push(t('breadcrumbs.new_candidate'), '/candidates/new');
      } else if (rest[0]) {
        push(t('breadcrumbs.candidate_profile'), `/candidates/${rest[0]}`);
      } else if (savedSearchId) {
        const savedSearch = savedSearches.find((s) => s.id === Number(savedSearchId));
        if (savedSearch) {
          push(savedSearch.name, `/candidates?savedSearchId=${savedSearchId}`);
        }
      }
      break;
    }

    case 'candidate-pool':
      push(t('breadcrumbs.candidate_pool'), '/candidate-pool');
      break;

    case 'job-board':
      push(t('breadcrumbs.job_board'), '/job-board');
      break;

    case 'post-job':
      push(t('breadcrumbs.post_job'), '/post-job');
      break;

    case 'jobs': {
      push(t('breadcrumbs.jobs'), '/jobs');
      const [seg1, seg2] = rest;
      if (seg1 === 'new') {
        push(t('breadcrumbs.new_job'), '/jobs/new');
      } else if (seg1 === 'existing') {
        push(t('breadcrumbs.existing_job'), '/jobs/existing');
        if (seg2 === 'events') {
          push(t('breadcrumbs.job_events'), '/jobs/existing/events');
        }
      } else if (seg1 === 'edit' && seg2) {
        push(t('breadcrumbs.edit_job'), `/jobs/edit/${seg2}`);
      } else if (isJobIdSegment(seg1) && seg2 === 'publish') {
        push(t('breadcrumbs.publish_job'), `/jobs/${seg1}/publish`);
      } else if (isJobIdSegment(seg1) && seg2 === 'screen') {
        push(t('breadcrumbs.screen_job'), `/jobs/${seg1}/screen`);
      }
      break;
    }

    case 'clients': {
      push(t('breadcrumbs.clients'), '/clients');
      if (rest[0] === 'new') {
        push(t('breadcrumbs.new_client'), '/clients/new');
      } else if (rest[0]) {
        push(t('breadcrumbs.client_profile'), `/clients/${rest[0]}`);
        if (rest[1] === 'contacts' && rest[2]) {
          push(t('breadcrumbs.contact_profile'), `/clients/${rest[0]}/contacts/${rest[2]}`);
        }
      }
      break;
    }

    case 'organizations':
      if (rest[0]) {
        push(t('breadcrumbs.organization_profile'), `/organizations/${rest[0]}`);
      }
      break;

    case 'notifications':
      push(t('breadcrumbs.notifications'), '/notifications');
      break;

    case 'communications':
      push(t('breadcrumbs.communications'), '/communications');
      break;

    case 'events-management':
      push(t('breadcrumbs.events_management'), '/events-management');
      break;

    case 'reports': {
      push(t('breadcrumbs.reports'), '/reports/referrals');
      const report = rest[0];
      if (report === 'referrals') push(t('nav.referrals'), '/reports/referrals');
      if (report === 'publications') push(t('nav.publications'), '/reports/publications');
      if (report === 'recruitment-sources') {
        push(t('nav.recruitment_sources'), '/reports/recruitment-sources');
      }
      if (report === 'bi') push(t('nav.bi_report'), '/reports/bi');
      break;
    }

    case 'settings': {
      push(t('breadcrumbs.settings'), '/settings/company');
      const tab = rest[0];
      const settingsTabs: Record<string, string> = {
        company: 'breadcrumbs.company',
        publishing: 'breadcrumbs.publishing',
        'company-images': 'breadcrumbs.company_images',
        statuses: 'breadcrumbs.statuses',
        pipelines: 'breadcrumbs.pipelines',
        'candidate-pipelines': 'breadcrumbs.candidate_pipelines',
        documents: 'breadcrumbs.documents',
        'proposal-templates': 'breadcrumbs.proposal_templates',
        coordinators: 'breadcrumbs.coordinators',
        agreements: 'breadcrumbs.agreements',
        'message-templates': 'breadcrumbs.message_templates',
        'event-types': 'breadcrumbs.event_types',
        'recruitment-sources': 'breadcrumbs.recruitment_sources',
        questionnaires: 'breadcrumbs.questionnaires',
      };
      if (tab && settingsTabs[tab]) {
        push(t(settingsTabs[tab]), `/settings/${tab}`);
        if (tab === 'coordinators' && rest[1]) {
          push(t('breadcrumbs.coordinator_profile'), `/settings/coordinators/${rest[1]}`);
        }
      }
      break;
    }

    case 'admin': {
      push(t('breadcrumbs.admin'), '/admin/clients');
      const section = rest[0];
      if (!section) break;

      if (section === 'client') {
        if (rest[1] === 'new') {
          push(t('breadcrumbs.new_client'), '/admin/client/new');
        } else if (rest[1] === 'edit' && rest[2]) {
          push(t('breadcrumbs.edit_client'), `/admin/client/edit/${rest[2]}`);
        } else {
          push(t('breadcrumbs.client_form'), '/admin/client/new');
        }
        break;
      }

      if (section === 'candidates') {
        push(t('admin.tab_candidates'), '/admin/candidates');
        if (rest[1]) {
          push(t('breadcrumbs.candidate_profile'), `/admin/candidates/${rest[1]}`);
          if (rest[2] === 'logs') {
            push(t('breadcrumbs.candidate_logs'), `/admin/candidates/${rest[1]}/logs`);
          }
        }
        break;
      }

      if (section === 'tags') {
        push(t('admin.tab_tags'), '/admin/tags/list');
        const tagTabLabels: Record<string, string> = {
          list: 'breadcrumbs.tags_list',
          corrections: 'breadcrumbs.tags_corrections',
          blacklist: 'breadcrumbs.tags_blacklist',
          candidates: 'breadcrumbs.tags_candidates',
          jobs: 'breadcrumbs.tags_jobs',
        };
        const tagTab = rest[1];
        if (tagTab && tagTabLabels[tagTab]) {
          push(t(tagTabLabels[tagTab]), `/admin/tags/${tagTab}`);
        }
        break;
      }

      if (section === 'settings') {
        push(t('breadcrumbs.admin_settings'), '/admin/settings/companies');
        const adminSettingsTabs: Record<string, string> = {
          companies: 'admin.tab_company_corrections',
          tags: 'admin.tab_tags',
          'job-fields': 'admin.tab_job_fields',
          prompts: 'breadcrumbs.ai_prompts',
          'matching-engine': 'breadcrumbs.matching_engine',
          'message-templates': 'admin.tab_message_templates',
        };
        const settingsTab = rest[1];
        if (settingsTab && adminSettingsTabs[settingsTab]) {
          push(t(adminSettingsTabs[settingsTab]), `/admin/settings/${settingsTab}`);
        }
        break;
      }

      const adminSections: Record<string, { labelKey: string; path: string }> = {
        clients: { labelKey: 'admin.tab_clients', path: '/admin/clients' },
        companies: { labelKey: 'admin.tab_companies_db', path: '/admin/companies' },
        jobs: { labelKey: 'admin.tab_jobs', path: '/admin/jobs' },
        picklists: { labelKey: 'breadcrumbs.picklists', path: '/admin/picklists' },
        'help-center': { labelKey: 'breadcrumbs.help_center', path: '/admin/help-center' },
        events: { labelKey: 'breadcrumbs.admin_events', path: '/admin/events' },
        logs: { labelKey: 'breadcrumbs.admin_logs', path: '/admin/logs' },
        'system-events': { labelKey: 'breadcrumbs.system_events', path: '/admin/system-events' },
        'business-logic': { labelKey: 'breadcrumbs.business_logic', path: '/admin/business-logic' },
        'reference-info': { labelKey: 'breadcrumbs.reference_info', path: '/admin/reference-info' },
        'job-fields': { labelKey: 'admin.tab_job_fields', path: '/admin/job-fields' },
      };
      const mapped = adminSections[section];
      if (mapped) push(t(mapped.labelKey), mapped.path);
      break;
    }

    default:
      break;
  }

  return crumbs;
}
