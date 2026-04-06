/**
 * Page keys for staff UI. Keep aligned with frontend `access/pathAccess.ts`.
 */
const PAGE_KEYS = [
  'page:dashboard',
  'page:candidates',
  'page:communications',
  'page:candidate_pool',
  'page:job_board',
  'page:jobs',
  'page:clients',
  'page:finance',
  'page:reports',
  'page:settings',
  'page:notifications',
  'page:admin',
  'page:manager_portal',
];

const allPages = (value) =>
  PAGE_KEYS.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {});

const ROLE_DEFAULTS = {
  super_admin: allPages(true),
  admin: allPages(true),
  manager: {
    ...allPages(false),
    'page:dashboard': true,
    'page:candidates': true,
    'page:communications': true,
    'page:candidate_pool': true,
    'page:job_board': true,
    'page:jobs': true,
    'page:clients': true,
    'page:finance': true,
    'page:reports': true,
    'page:settings': true,
    'page:notifications': true,
    'page:admin': false,
    'page:manager_portal': true,
  },
  recruiter: {
    ...allPages(false),
    'page:dashboard': true,
    'page:candidates': true,
    'page:communications': true,
    'page:candidate_pool': true,
    'page:job_board': true,
    'page:jobs': true,
    'page:clients': false,
    'page:finance': false,
    'page:reports': false,
    'page:settings': false,
    'page:notifications': true,
    'page:admin': false,
    'page:manager_portal': false,
  },
  coordinator: {
    ...allPages(false),
    'page:dashboard': true,
    'page:candidates': true,
    'page:communications': true,
    'page:candidate_pool': true,
    'page:job_board': true,
    'page:jobs': true,
    'page:clients': false,
    'page:finance': false,
    'page:reports': false,
    'page:settings': false,
    'page:notifications': true,
    'page:admin': false,
    'page:manager_portal': false,
  },
  guest: {
    ...allPages(false),
    'page:dashboard': true,
    'page:candidates': true,
    'page:communications': false,
    'page:candidate_pool': false,
    'page:job_board': true,
    'page:jobs': false,
    'page:clients': false,
    'page:finance': false,
    'page:reports': false,
    'page:settings': false,
    'page:notifications': false,
    'page:admin': false,
    'page:manager_portal': false,
  },
  candidate: allPages(false),
};

const plainUser = (user) => (user?.get ? user.get({ plain: true }) : user) || {};

const getEffectivePermissions = (user) => {
  const u = plainUser(user);
  const role = u.role || 'recruiter';
  if (role === 'super_admin') {
    return allPages(true);
  }
  const base = { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.recruiter) };
  const overrides = u.permissions && typeof u.permissions === 'object' ? u.permissions : {};
  for (const [key, val] of Object.entries(overrides)) {
    if (val === true || val === false) {
      base[key] = val;
    }
  }
  // Managers: always allow Settings; never allow Clients (ignore JSONB overrides for these).
  if (role === 'manager') {
    if (ROLE_DEFAULTS.manager['page:settings']) {
      base['page:settings'] = true;
    }
    base['page:clients'] = false;
  }
  return base;
};

const serializeAuthUser = (user) => {
  const u = plainUser(user);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone,
    clientId: u.clientId || null,
    dataScope: u.dataScope || { candidates: 'own', jobs: 'own' },
    permissions: u.permissions || {},
    effectivePermissions: getEffectivePermissions(user),
  };
};

const hasPagePermission = (user, pageKey) => !!getEffectivePermissions(user)[pageKey];

module.exports = {
  PAGE_KEYS,
  getEffectivePermissions,
  serializeAuthUser,
  hasPagePermission,
};
