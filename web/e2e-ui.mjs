// Full user-journey E2E through the real UI (Playwright)
// Guest → register → create team → invite → join → request/accept →
// profile → suggestions → submission upload → admin → mobile pass
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const BASE = 'http://localhost:5173';
const ts = Date.now();
let pass = 0, fail = 0;
const jsErrors = [];
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`); };

const browser = await chromium.launch();

function watch(page, tag) {
  page.on('pageerror', (e) => jsErrors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || m.text().includes('favicon')) return;
    if (/status of 40[13]/.test(m.text())) return; // expected authz denials on leader-only endpoints
    jsErrors.push(`${tag}: ${m.text().slice(0, 160)}`);
  });
}

async function newUserCtx(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, name);
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Email').fill(`${name.toLowerCase()}-${ts}@ui.teamkommit.dev`);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  await page.waitForTimeout(800);
  return { ctx, page, email: `${name.toLowerCase()}-${ts}@ui.teamkommit.dev` };
}

// ============ GUEST PASS ============
console.log('\n=== Guest journey ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); watch(page, 'guest');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  ok('landing h1 hero', (await page.locator('h1').first().textContent())?.includes('Find your crew'));
  ok('engine section "No LLM"', await page.getByText('No LLM.', { exact: false }).first().isVisible());
  ok('PS1 card badge', await page.getByText('Problem 01').isVisible());
  ok('PS2 card badge', await page.getByText('Problem 02').isVisible());
  ok('CommitMark logo in nav', await page.locator('header svg, nav svg').first().isVisible().catch(() => false));
  // nav to board guest
  await page.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
  ok('guest board shows PS1 badge', await page.getByText('PS1', { exact: true }).first().isVisible());
  ok('guest board lists teams', (await page.locator('ul[aria-live] > li').count()) > 0);
  await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' });
  ok('people page PS1 badge', await page.getByText('PS1', { exact: true }).first().isVisible());
  await page.goto(`${BASE}/submissions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  ok('guest /submissions redirects to auth', page.url().includes('/auth'));
  await ctx.close();
}

// ============ LEADER ============
console.log('\n=== Leader: register → create team ===');
const leader = await newUserCtx('UILead');
const lp = leader.page;
ok('registered → landed on /', lp.url().startsWith(BASE));
await lp.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
ok('Live badge reflects SSE', await lp.getByText('Live', { exact: true }).first().isVisible().catch(() => false));
await lp.getByRole('button', { name: '+ Create team' }).click();
await lp.getByLabel('Team name').fill(`UI Crew ${ts}`);
await lp.getByLabel('Skills you\'re looking for').fill('React.js, Node, Figma');
await lp.getByRole('button', { name: 'Create team', exact: true }).click();
await lp.waitForTimeout(1500);
ok('team created via UI', await lp.getByText(`UI Crew ${ts}`).first().isVisible());
// open the team
await lp.getByText(`UI Crew ${ts}`).first().click();
await lp.waitForURL(/\/teams\//, { timeout: 8000 });
const teamPath = new URL(lp.url()).pathname;
ok('team page opened', lp.url().includes('/teams/'));
await lp.waitForSelector('h1', { timeout: 8000 });
await lp.waitForTimeout(800);
ok('PS1 badge on team page', await lp.getByText('PS1', { exact: true }).first().isVisible().catch(() => false));
// canonicalized chips on team page
const chips = await lp.locator('section .chip').allTextContents();
ok('skillsSought canonicalized in UI', chips.some((c) => c.includes('frontend')) && chips.some((c) => c.includes('design')), chips.join(','));
// generate invite code
await lp.getByRole('button', { name: 'Generate invite code' }).click();
await lp.waitForTimeout(800);
const codeText = await lp.locator('p.input-mono').last().textContent();
ok('invite code generated', (codeText ?? '').trim().length >= 10, (codeText ?? '').trim());
const inviteCode = (codeText ?? '').trim();

// leader profile: add skills + availability via UI
await lp.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
await lp.getByRole('button', { name: 'frontend', exact: true }).click();
await lp.getByRole('button', { name: 'backend', exact: true }).click();
// set level slider for frontend to 0.8
const slider = lp.locator('input[type="range"]').first();
await slider.fill('0.8');
await lp.getByRole('button', { name: '+ Add window' }).click();
await lp.waitForTimeout(300);
await lp.getByRole('button', { name: 'Save profile' }).click();
await lp.waitForTimeout(1200);
ok('profile saved via UI', await lp.getByText('Saved!').isVisible().catch(() => false));

// ============ MEMBER B: join via invite code ============
console.log('\n=== Member B: join via invite code ===');
const memberB = await newUserCtx('UIMember');
const bp = memberB.page;
// set profile via UI quickly (skill for suggestions)
await bp.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
await bp.getByRole('button', { name: 'backend', exact: true }).click();
await bp.getByRole('button', { name: 'design', exact: true }).click();
await bp.getByLabel('Preferred roles').fill('backend, design');
await bp.getByLabel('Looking for a team').check();
await bp.getByRole('button', { name: 'Save profile' }).click();
await bp.waitForTimeout(1000);
// join via invite code on board
await bp.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
await bp.getByLabel('Invite code').fill(inviteCode);
await bp.getByRole('button', { name: 'Join team' }).first().click();
await bp.waitForTimeout(2000);
ok('join confirmation shown', await bp.getByText(/joined the team/i).isVisible().catch(() => false));
// navigate to team
await bp.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
await bp.waitForTimeout(800);
await bp.getByText(`UI Crew ${ts}`).first().click();
await bp.waitForURL(/\/teams\//, { timeout: 8000 });
await bp.waitForSelector('h1', { timeout: 8000 });
await bp.waitForTimeout(800);
ok('member sees team page', await bp.getByText(`UI Crew ${ts}`).first().isVisible());
const memberText = await bp.locator('text=/members|Member/').count();
ok('members section renders', memberText > 0);

// ============ MEMBER C: join request → leader accepts ============
console.log('\n=== Member C: request → leader accepts ===');
const memberC = await newUserCtx('UIReq');
const cp = memberC.page;
await cp.goto(`${BASE}${teamPath}`, { waitUntil: 'networkidle' });
await cp.waitForSelector('h1', { timeout: 8000 });
await cp.waitForTimeout(600);
await cp.getByPlaceholder('Message to leader (optional)').fill('Saw your crew on the board — love the stack');
await cp.getByRole('button', { name: 'Request to join' }).click();
await cp.waitForTimeout(1200);
ok('join request sent confirmation', await cp.getByText(/Request sent/i).isVisible().catch(() => false));
// leader side: back on team page → accept
await lp.goto(`${BASE}${teamPath}`, { waitUntil: 'networkidle' });
await lp.waitForSelector('h1', { timeout: 8000 });
await lp.waitForTimeout(1200);
const acceptBtn = lp.getByRole('button', { name: 'Accept' }).first();
ok('leader sees join request', await acceptBtn.isVisible().catch(() => false));
await acceptBtn.click();
await lp.waitForTimeout(1200);
ok('request accepted', await lp.getByText(/accepted/i).first().isVisible().catch(() => false));

// ============ SUGGESTIONS with formula bars ============
console.log('\n=== Suggestions (explainable math) ===');
await lp.goto(`${BASE}${teamPath}`, { waitUntil: 'networkidle' });
await lp.waitForSelector('h1', { timeout: 8000 });
await lp.waitForTimeout(2000);
const sugSection = lp.locator('section[aria-label="Teammate suggestions"]');
ok('suggestions section visible', await sugSection.isVisible().catch(() => false));
if (await sugSection.isVisible().catch(() => false)) {
  const formula = await sugSection.locator('text=/V_T = 0.5/').count();
  ok('formula decomposition displayed', formula > 0, `bars=${formula}`);
  const reasons = await sugSection.locator('text=/skill coverage|Brings missing|Shares/').count();
  ok('numeric reasons shown', reasons > 0, `reasons=${reasons}`);
}

// ============ SUBMISSION via UI ============
console.log('\n=== Member B: submission upload ===');
await bp.goto(`${BASE}/submissions`, { waitUntil: 'networkidle' });
await bp.getByLabel('Project title').fill('UI Crew Project');
await bp.getByLabel(/What did you build/).fill('A project submitted through the real UI end-to-end.');
await bp.getByLabel('Repository URL').fill('https://github.com/example/ui-crew');
await bp.locator('input[type="file"]').setInputFiles('/tmp/e2e-project.zip');
await bp.getByRole('button', { name: 'Submit project' }).click();
// wait for upload + checks (up to 90s)
let subStatus = '';
for (let i = 0; i < 45; i++) {
  await bp.waitForTimeout(2000);
  const badges = await bp.locator('span.badge-ok, span.badge-warn, span.badge-bad, span.badge-neutral').allTextContents();
  subStatus = badges.join('|');
  if (/ACCEPTED|NEEDS FIX|REJECTED|LATE/.test(subStatus)) break;
}
ok('submission reached terminal status', /ACCEPTED|NEEDS FIX|REJECTED|LATE/.test(subStatus), subStatus);
await bp.screenshot({ path: '/tmp/pw/submissions-final.png', fullPage: true });

// ============ ADMIN ============
console.log('\n=== Admin dashboard ===');
// flag leader as organizer (email stored lowercase)
const leaderEmail = `uilead-${ts}@ui.teamkommit.dev`;
execSync(`docker exec teamkommit-mongo-1 mongosh "mongodb://localhost:27017/teamkommit?replicaSet=rs0&directConnection=true" --quiet --eval 'db.users.updateOne({email:"${leaderEmail}"},{$set:{isOrganizer:true}})'`);
await lp.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await lp.waitForTimeout(1500);
ok('admin stats cards', await lp.getByText('Total submissions').isVisible().catch(() => false));
ok('CSV export link', await lp.getByRole('link', { name: /Export CSV/ }).isVisible().catch(() => false));
// non-organizer blocked
await bp.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await bp.waitForTimeout(1200);
ok('non-organizer sees access error', await bp.getByText(/Organizer access required/i).isVisible().catch(() => false));

// ============ PEOPLE search ============
console.log('\n=== People page ===');
await bp.goto(`${BASE}/people`, { waitUntil: 'networkidle' });
await bp.getByLabel('Search people').fill('UIMember');
await bp.getByRole('button', { name: 'Search' }).click();
await bp.waitForTimeout(1200);
ok('people search finds user', await bp.getByText('UIMember').first().isVisible().catch(() => false));

// ============ MOBILE PASS ============
console.log('\n=== Mobile viewport ===');
{
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await mctx.newPage(); watch(mp, 'mobile');
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok('no horizontal overflow (mobile)', !overflow);
  ok('mobile hero composition visible', await mp.locator('text=/50 racers/').first().isVisible().catch(() => false));
  await mp.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
  const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok('board no overflow (mobile)', !overflow2);
  await mctx.close();
}

// ============ JS ERRORS ============
console.log('\n=== Runtime health ===');
ok('zero JS errors across all pages', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n========== UI E2E RESULT: ${pass} passed, ${fail} failed ==========`);
process.exit(fail ? 1 : 0);
