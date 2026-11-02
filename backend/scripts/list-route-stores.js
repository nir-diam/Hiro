/**
 * Prints: STORE\tMETHOD\tFULL_PATH  (one line per route)
 * Run: node scripts/list-route-stores.js
 */
const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, '../src/routes');

/** fileName -> one or more mount prefixes */
const MOUNTS = {
  'agentAuthRoutes.js': ['/api/agent/auth'],
  'agentRoutes.js': ['/api/agent'],
  'publicJobsApiRoutes.js': ['/api/public/v1'],
  'authRoutes.js': ['/api/auth'],
  'userRoutes.js': ['/api/users'],
  'clientRoutes.js': ['/api/clients'],
  'publicSiteAdminRoutes.js': ['/api/public-sites'],
  'organizationRoutes.js': ['/api/organizations'],
  'companiesRoutes.js': ['/api/companies'],
  'jobRoutes.js': ['/api/jobs'],
  'tagRoutes.js': ['/api/tags'],
  'chatRoutes.js': ['/api/chat'],
  'jobFieldRoutes.js': ['/api/job-fields'],
  'candidateRoutes.js': ['/api/candidates'],
  'promptRoutes.js': ['/api/prompts'],
  'candidateApplicationRoutes.js': ['/api/applications'],
  'picklistRoutes.js': ['/api/picklists'],
  'helpCenterRoutes.js': ['/api/help-center'],
  'candidateTagRoutes.js': ['/api/admin/candidate-tags'],
  'businessLogicRoutes.js': ['/api/admin/business-logic'],
  'emailRoutes.js': ['/api/email-uploads'],
  'cityRoutes.js': ['/api/cities'],
  'eventTypeRoutes.js': ['/api/event-types'],
  'systemEventRoutes.js': ['/api/system-events'],
  'auditLogRoutes.js': ['/api/audit-logs'],
  'appLogRoutes.js': ['/api/admin/logs'],
  'inforuRoutes.js': ['/api/inforu'],
  'messagingRoutes.js': ['/api/messaging'],
  'referenceInfoRoutes.js': ['/api/reference-info'],
  'recruitmentSourceRoutes.js': ['/api/recruitment-sources'],
  'reportRoutes.js': ['/api/reports'],
  'dashboardRoutes.js': ['/api/dashboard'],
  'proposalRoutes.js': ['/api/proposals'],
  'matchingEngineRoutes.js': ['/api/admin/matching-engine'],
  'savedSearchRoutes.js': ['/api/saved-searches'],
  'pipelineOutcomeRoutes.js': ['/api/pipeline-outcomes'],
  'scriptRoutes.js': ['/api/scripts'],
};

const {
  shouldSkipPath: httpGetCacheSkip,
} = require('../src/middleware/httpGetResponseCacheMiddleware');

/** POST routes that use Redis read-through at the service layer (not HTTP GET cache). */
const bothPostExact = new Set([
  'POST /api/candidates/search/list',
  'POST /api/candidates/match-scores/batch',
  'POST /api/candidates/search/semantic',
  'POST /api/candidates/semantic-search',
  'POST /api/candidates/:id/job-matches',
  'POST /api/jobs/:id/sonar-scan',
  'POST /api/admin/matching-engine/simulate',
]);

/** GET routes with dedicated entity/list read-through caches (plus PG on miss). */
const entityBothGetExact = new Set([
  'GET /api/candidates',
  'GET /api/candidates/:id',
  'GET /api/candidates/:id/linked-jobs',
  'GET /api/candidates/:id/relevant-jobs',
  'GET /api/clients',
  'GET /api/clients/:id',
  'GET /api/applications',
  'GET /api/jobs/:id',
  'GET /api/jobs/:id/candidates',
  'GET /api/jobs/for-list',
  'GET /api/jobs/for-picker',
  'GET /api/jobs/for-compose',
  'GET /api/event-types',
  'GET /api/recruitment-sources/options',
  'GET /api/admin/matching-engine/config',
  'GET /api/public/v1/taxonomy',
  'GET /api/tags',
  'GET /api/cities',
  'GET /api/reports/bi-dashboard',
  'GET /api/reports/recruitment-sources',
]);

/**
 * PG = no Redis layer.
 * Both = service-level read-through (Postgres on miss; Redis entity/list keys).
 * Redis = HTTP GET JSON cache only (http:get:*; Postgres on miss).
 */
function classify(fullPath, method) {
  const m = method.toUpperCase();
  if (bothPostExact.has(`${m} ${fullPath}`)) return 'Both';
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return 'PG';
  if (m === 'GET') {
    if (httpGetCacheSkip(fullPath)) return 'PG';
    if (fullPath.startsWith('/api/picklists/')) return 'Both';
    if (entityBothGetExact.has(`${m} ${fullPath}`)) return 'Both';
    return 'Redis';
  }
  return 'PG';
}

function extractRoutes(content, routerName = 'router') {
  const re = new RegExp(`${routerName}\\.(get|post|put|patch|delete)\\(\\s*['\`]([^'\`]+)['\`]`, 'g');
  const out = [];
  for (const m of content.matchAll(re)) {
    out.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return out;
}

const rows = [];

function joinApiPath(prefix, routePath) {
  if (routePath === '/') return prefix;
  return `${prefix}${routePath}`.replace(/\/+/g, '/');
}

function addRows(prefix, routes) {
  for (const r of routes) {
    const full = joinApiPath(prefix, r.path);
    rows.push({ store: classify(full, r.method), method: r.method, full });
  }
}

// Standard route files
for (const [file, prefixes] of Object.entries(MOUNTS)) {
  const fp = path.join(routesDir, file);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, 'utf8');
  const routes = extractRoutes(content, 'router');
  for (const prefix of prefixes) addRows(prefix, routes);
}

// messageTemplateRoutes — two routers
{
  const content = fs.readFileSync(path.join(routesDir, 'messageTemplateRoutes.js'), 'utf8');
  addRows('/api/message-templates', extractRoutes(content, 'clientRouter'));
  addRows('/api/admin/message-templates', extractRoutes(content, 'adminRouter'));
}

// jobPublicationRoutes — three routers
{
  const content = fs.readFileSync(path.join(routesDir, 'jobPublicationRoutes.js'), 'utf8');
  addRows('/api/public/jobs', extractRoutes(content, 'publicRouter'));
  addRows('/api/publishing', extractRoutes(content, 'publishingRouter'));
  addRows('/api/jobs', extractRoutes(content, 'jobPublicationRouter'));
}

rows.sort((a, b) => a.full.localeCompare(b.full) || a.method.localeCompare(b.method));

if (process.argv.includes('--md')) {
  let cur = '';
  for (const r of rows) {
    const top = r.full.split('/').slice(0, 3).join('/') || r.full;
    if (top !== cur) {
      cur = top;
      console.log(`\n### ${cur}…\n| Method | Path | Store |\n|--------|------|-------|`);
    }
    console.log(`| ${r.method} | ${r.full} | ${r.store} |`);
  }
} else {
  for (const r of rows) console.log(`${r.store}\t${r.method}\t${r.full}`);
}
const counts = { PG: 0, Both: 0, Redis: 0 };
for (const r of rows) counts[r.store] = (counts[r.store] || 0) + 1;
console.error(`Total: ${rows.length} (PG: ${counts.PG}, Both: ${counts.Both}, Redis: ${counts.Redis})`);
