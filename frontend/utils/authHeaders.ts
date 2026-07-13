/** Bearer token headers for authenticated API calls. */
export function authHeaders(json = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    try {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
        // ignore
    }
    return headers;
}
