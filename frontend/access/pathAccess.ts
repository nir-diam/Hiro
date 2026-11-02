/**
 * Maps URL prefix → page permission key. Align with backend `permissionService.js`.
 *
 * Returns `null` when a path is not gated by any page permission — the gate must treat
 * that as "allowed". Falling back to `page:dashboard` (the old behaviour) made every
 * unmapped route inherit the dashboard permission: a tenant with the "misc" module off
 * lost `/organizations/:id` (opened from the clients list) and got bounced elsewhere.
 */
export function permissionForPath(pathname: string): string | null {
    if (/^\/jobs\/[^/]+\/public(\/|$)/.test(pathname)) {
        return 'page:public_job_landing';
    }
    const rules: { prefix: string; perm: string }[] = [
        { prefix: '/admin', perm: 'page:admin' },
        { prefix: '/settings', perm: 'page:settings' },
        { prefix: '/finance', perm: 'page:finance' },
        { prefix: '/reports', perm: 'page:reports' },
        { prefix: '/clients', perm: 'page:clients' },
        // Organization profiles are reached from the clients list / client file.
        { prefix: '/organizations', perm: 'page:clients' },
        { prefix: '/jobs/public', perm: 'page:public_job_landing' },
        { prefix: '/jobs', perm: 'page:jobs' },
        { prefix: '/candidates', perm: 'page:candidates' },
        { prefix: '/communications', perm: 'page:communications' },
        { prefix: '/events-management', perm: 'page:clients' },
        { prefix: '/candidate-pool', perm: 'page:candidate_pool' },
        { prefix: '/job-board', perm: 'page:job_board' },
        { prefix: '/notifications', perm: 'page:notifications' },
        { prefix: '/portal/manager', perm: 'page:manager_portal' },
        { prefix: '/dashboard', perm: 'page:dashboard' },
    ];
    const sorted = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const r of sorted) {
        if (pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) {
            return r.perm;
        }
    }
    return null;
}
