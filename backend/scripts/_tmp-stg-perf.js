const BASE = process.env.STG_API || 'https://api.hiro.co.il';

async function timed(label, path, token, init = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const tHeaders = performance.now();
  const buf = Buffer.from(await res.arrayBuffer());
  const t1 = performance.now();
  console.log(
    `${label.padEnd(34)} ${res.status} ttfb=${Math.round(tHeaders - t0)}ms total=${Math.round(t1 - t0)}ms`
    + ` size=${(buf.length / 1024).toFixed(0)}KB cache=${res.headers.get('x-app-cache') || '-'}`,
  );
  return buf;
}

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.STG_EMAIL, password: process.env.STG_PASS }),
  });
  const { token } = await login.json();
  if (!token) return console.log('login failed', login.status);

  await timed('GET /api/jobs (full) #1', '/api/jobs', token);
  await timed('GET /api/jobs (full) #2', '/api/jobs', token);
  const picker = JSON.parse((await timed('GET /api/jobs?view=picker #1', '/api/jobs?view=picker', token)).toString());
  await timed('GET /api/jobs?view=picker #2', '/api/jobs?view=picker', token);
  const skills = JSON.parse((await timed('GET /api/jobs?view=skills #1', '/api/jobs?view=skills', token)).toString());
  await timed('GET /api/jobs?view=skills #2', '/api/jobs?view=skills', token);
  console.log(`  picker rows=${picker.length} fields=${Object.keys(picker[0] || {}).join(',')}`);
  console.log(`  skills rows=${skills.length} withSkills=${skills.filter((j) => Array.isArray(j.skills) && j.skills.length).length}`);
  await timed('GET /api/jobs?paginated=1 #1', '/api/jobs?paginated=1&page=1&limit=50', token);
  await timed('GET /api/jobs?paginated=1 #2', '/api/jobs?paginated=1&page=1&limit=50', token);

  await timed('bi-dashboard #1', '/api/reports/bi-dashboard?range=12m', token);
  await timed('bi-dashboard #2', '/api/reports/bi-dashboard?range=12m', token);

  const job = 'bab818f2-f26d-4aec-a3e5-4bc36f98c8ca';
  const all = JSON.parse((await timed('candidates (all 138) #1', `/api/jobs/${job}/candidates`, token)).toString());
  await timed('candidates (all 138) #2', `/api/jobs/${job}/candidates`, token);
  console.log(`  rows=${all.candidates?.length} hasTagDetails=${(all.candidates || []).some((c) => c.tagDetails)}`);
  const pageQs = 'limit=25&offset=0&sort=received&dir=desc';
  await timed('candidates (page of 25) #1', `/api/jobs/${job}/candidates?${pageQs}`, token);
  await timed('candidates (page of 25) #2', `/api/jobs/${job}/candidates?${pageQs}`, token);

  if (process.env.WRITE_TEST === '1') {
    const notes = all.job?.listNotes ?? '';
    await timed('PATCH list-notes (same value)', `/api/jobs/${job}/list-notes`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listNotes: notes }),
    });
    await new Promise((r) => setTimeout(r, 300));
    await timed('candidates (page) after write', `/api/jobs/${job}/candidates?${pageQs}`, token);
    await timed('candidates (page) again', `/api/jobs/${job}/candidates?${pageQs}`, token);
  }
})().catch((e) => console.error('ERR', e.message));
