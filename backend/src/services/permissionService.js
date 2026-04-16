/**
 * Page keys for staff UI. Keep aligned with frontend `access/pathAccess.ts`.
 * Tenant `clients.modules` (JSONB) can disable pages for that client’s staff (not super_admin).
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
  'page:ai_parsing',
  'page:hiro_ai',
];

/** Admin UI module keys → page keys they gate (all must pass for the module to allow those pages). */
const MODULE_KEY_TO_PAGE_KEYS = {
  candidates: ['page:candidates'],
  candidate_pool: ['page:candidate_pool'],
  jobs: ['page:jobs'],
  job_board: ['page:job_board'],
  /** שונות — דף הבית והתראות */
  misc: ['page:dashboard', 'page:notifications'],
  clients: ['page:clients'],
  finance: ['page:finance'],
  reports: ['page:reports'],
  communication: ['page:communications', 'page:notifications'],
  settings: ['page:settings'],
  ai_parsing: ['page:ai_parsing'],
  hiro_ai: ['page:hiro_ai'],
  portal: ['page:manager_portal'],
};

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
    'page:ai_parsing': true,
    'page:hiro_ai': true,
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
    'page:ai_parsing': true,
    'page:hiro_ai': true,
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
    'page:ai_parsing': true,
    'page:hiro_ai': true,
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
    'page:ai_parsing': false,
    'page:hiro_ai': false,
  },
  candidate: allPages(false),
};

const plainUser = (user) => (user?.get ? user.get({ plain: true }) : user) || {};

const plainClientFromUser = (user) => {
  const c = user?.client;
  if (!c) return null;
  return c.get ? c.get({ plain: true }) : c;
};

/**
 * Tenant module off when stored as boolean false or common string/number forms from JSON/clients.
 * Missing key → not disabled (legacy tenants).
 */
const isModuleDisabled = (clientModules, moduleKey) => {
  if (!clientModules || typeof clientModules !== 'object') return false;
  const v = clientModules[moduleKey];
  if (v === false || v === 0) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return true;
  }
  return false;
};

const applyClientModuleGating = (base, clientModules, role) => {
  if (role === 'super_admin') return base;
  if (!clientModules || typeof clientModules !== 'object') return base;

  const out = { ...base };
  for (const [modKey, pageKeys] of Object.entries(MODULE_KEY_TO_PAGE_KEYS)) {
    if (!isModuleDisabled(clientModules, modKey)) continue;
    for (const pk of pageKeys) {
      out[pk] = false;
    }
  }
  return out;
};

const getEffectivePermissions = (user) => {
  const u = plainUser(user);
  const role = u.role || 'recruiter';
  if (role === 'super_admin') {
    return allPages(true);
  }
  let base = { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.recruiter) };
  const overrides = u.permissions && typeof u.permissions === 'object' ? u.permissions : {};
  for (const [key, val] of Object.entries(overrides)) {
    if (val === true || val === false) {
      base[key] = val;
    } else if (val === 'true' || val === 'false') {
      base[key] = val === 'true';
    }
  }

  const clientRow = plainClientFromUser(user);
  const clientModules = clientRow?.modules;
  base = applyClientModuleGating(base, clientModules, role);

  const normalized = {};
  for (const key of PAGE_KEYS) {
    normalized[key] = Boolean(base[key]);
  }
  return normalized;
};

const serializeAuthUser = (user) => {
  const u = plainUser(user);
  const clientRow = plainClientFromUser(user);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone,
    clientId: u.clientId || null,
    dataScope: u.dataScope || { candidates: 'own', jobs: 'own' },
    permissions: u.permissions || {},
    tenantModules: clientRow?.modules && typeof clientRow.modules === 'object' ? clientRow.modules : {},
    effectivePermissions: getEffectivePermissions(user),
  };
};

const hasPagePermission = (user, pageKey) => !!getEffectivePermissions(user)[pageKey];

module.exports = {
  PAGE_KEYS,
  MODULE_KEY_TO_PAGE_KEYS,
  getEffectivePermissions,
  serializeAuthUser,
  hasPagePermission,
};
