import { chromium } from '@playwright/test';
const BASE = 'http://localhost:5173';
const ts = Date.now();
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (n, c, x='') => { c ? pass++ : fail++; console.log(`${c?'✅':'❌'} ${n}${x?' — '+x:''}`); };

async function register(name) {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Register', exact: true }).click();
  await p.getByLabel('Display name').fill(name);
  await p.getByLabel('Email').fill(`${name.toLowerCase()}-${ts}@role.td`);
  await p.getByLabel('Password').fill('password123');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.waitForURL(`${BASE}/`, { timeout: 10000 });
  return { ctx, p };
}

// regular user — no Admin link
const u = await register('RoleUser');
await u.p.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
await u.p.waitForTimeout(1500);
ok('regular user: no Admin nav link', (await u.p.getByRole('link', { name: 'Admin' }).count()) === 0);
ok('regular user: Submissions link present', (await u.p.getByRole('link', { name: 'Submissions' }).count()) === 1);

// direct /admin URL → error state (not a crash)
await u.p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await u.p.waitForTimeout(1200);
ok('regular user /admin → access error', await u.p.getByText(/Organizer access required/i).isVisible().catch(() => false));

// leader creates team via API (faster) then checks actions as member vs leader
const tok = await u.p.evaluate(() => localStorage.getItem('tk_access'));
const api = async (path, opts={}) => {
  const r = await fetch(`http://localhost:4000/api${path}`, { ...opts, headers: { 'content-type':'application/json', authorization:`Bearer ${tok}`, ...(opts.headers??{}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, json: await r.json().catch(()=>null) };
};
const hid = (await (await fetch('http://localhost:4000/api/hackathons')).json()).hackathons[0]._id;
const team = await api('/teams', { method:'POST', body:{ hackathonId:hid, name:`Role Team ${ts}`, maxSize:3 } });
const tid = team.json.teamId;
await u.p.goto(`${BASE}/teams/${tid}`, { waitUntil:'networkidle' });
await u.p.waitForSelector('h1'); await u.p.waitForTimeout(1500);
ok('leader sees invite code button', await u.p.getByRole('button', { name: 'Generate invite code' }).isVisible().catch(()=>false));
ok('leader does NOT see Request to join', (await u.p.getByRole('button', { name: 'Request to join' }).count()) === 0);
ok('leader sees Leave team (succession)', await u.p.getByRole('button', { name: /Leave team/ }).isVisible().catch(()=>false));

// second user joins via request → becomes member → actions change
const v = await register('RoleMember');
await v.p.goto(`${BASE}/teams/${tid}`, { waitUntil:'networkidle' });
await v.p.waitForSelector('h1'); await v.p.waitForTimeout(1500);
ok('non-member sees Request to join', await v.p.getByRole('button', { name: 'Request to join' }).isVisible().catch(()=>false));
ok('non-member does NOT see invite code', (await v.p.getByRole('button', { name: 'Generate invite code' }).count()) === 0);
await v.p.getByPlaceholder('Message to leader (optional)').fill('hi');
await v.p.getByRole('button', { name: 'Request to join' }).click();
await v.p.waitForTimeout(1200);
// leader accepts
await u.p.goto(`${BASE}/teams/${tid}`, { waitUntil:'networkidle' });
await u.p.waitForSelector('h1'); await u.p.waitForTimeout(1200);
await u.p.getByRole('button', { name: 'Accept' }).first().click();
await u.p.waitForTimeout(1200);
// member reloads → now sees Leave, not Request
await v.p.goto(`${BASE}/teams/${tid}`, { waitUntil:'networkidle' });
await v.p.waitForSelector('h1'); await v.p.waitForTimeout(1500);
ok('member no longer sees Request to join', (await v.p.getByRole('button', { name: 'Request to join' }).count()) === 0);
ok('member sees Leave team', await v.p.getByRole('button', { name: 'Leave team', exact: true }).isVisible().catch(()=>false));
ok('member does NOT see invite code', (await v.p.getByRole('button', { name: 'Generate invite code' }).count()) === 0);

await b.close();
console.log(`\n===== ROLE-AWARE UI: ${pass} passed, ${fail} failed =====`);
process.exit(fail?1:0);
