/** Maps URL prefix → page permission key. Align with backend `permissionService.js`. */
export function permissionForPath(pathname: string): string {
    const rules: { prefix: string; perm: string }[] = [
        { prefix: '/admin', perm: 'page:admin' },
        { prefix: '/settings', perm: 'page:settings' },
        { prefix: '/finance', perm: 'page:finance' },
        { prefix: '/reports', perm: 'page:reports' },
        { prefix: '/clients', perm: 'page:clients' },
        { prefix: '/jobs', perm: 'page:jobs' },
        { prefix: '/candidates', perm: 'page:candidates' },
        { prefix: '/communications', perm: 'page:communications' },
        { prefix: '/candidate-pool', perm: 'page:candidate_pool' },
        { prefix: '/job-board', perm: 'page:job_board' },
        { prefix: '/notifications', perm: 'page:notifications' },
        { prefix: '/dashboard', perm: 'page:dashboard' },
    ];
    const sorted = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const r of sorted) {
        if (pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) {
            return r.perm;
        }
    }
    return 'page:dashboard';
}
