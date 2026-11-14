// Walkthrough video recorder — Playwright records .webm, ffmpeg converts to mp4.
// Usage: node record-video.mjs [baseUrl]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, renameSync, existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'https://app-production-11e1.up.railway.app';
const OUT = 'demo-videos';
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1440, height: 810 };
const slow = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: OUT, size: VIEWPORT },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

async function shot(label) {
  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log('📸', label, page.url());
}

try {
  // 1. Landing
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await slow(2500);
  await shot('01-landing');

  // 2. Login as organizer
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' });
  await slow(800);
  await page.fill('input[type=email]', 'organizer@crew.dev');
  await page.fill('input[type=password]', 'Str0ng!Pass');
  await slow(400);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('/auth'), { timeout: 15000 });
  await slow(2000);
  await shot('02-after-login');

  // 3. Board — 2000 seeded teams
  await page.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
  await slow(3000);
  await shot('03-board');
  await page.mouse.wheel(0, 600);
  await slow(1200);
  await shot('04-board-scroll');

  // 4. Open first team
  const teamLink = page.locator('a[href^="/teams/"]').first();
  if (await teamLink.count()) {
    await teamLink.click();
    await page.waitForLoadState('networkidle');
    await slow(2000);
    await shot('05-team');
    await page.goBack({ waitUntil: 'networkidle' });
    await slow(1200);
  }

  // 5. People directory
  await page.goto(`${BASE}/people`, { waitUntil: 'networkidle' });
  await slow(2000);
  await shot('06-people');

  // 6. Submissions
  await page.goto(`${BASE}/submissions`, { waitUntil: 'networkidle' });
  await slow(2000);
  await shot('07-submissions');

  // 7. Admin console — overview
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await slow(3000);
  await shot('08-admin-overview');

  // 8. Admin hackathons
  await page.goto(`${BASE}/admin/hackathons`, { waitUntil: 'networkidle' });
  await slow(2000);
  await shot('09-admin-hackathons');

  // 9. Admin hackathon detail (deep link)
  const hLink = page.locator('a[href^="/admin/hackathons/"]').first();
  if (await hLink.count()) {
    await hLink.click();
    await page.waitForLoadState('networkidle');
    await slow(2500);
    await shot('10-admin-hackathon-detail');
  }

  // 10. Admin pipelines
  await page.goto(`${BASE}/admin/pipelines`, { waitUntil: 'networkidle' });
  await slow(2500);
  await shot('11-admin-pipelines');

  // 11. Admin organizers
  await page.goto(`${BASE}/admin/organizers`, { waitUntil: 'networkidle' });
  await slow(2000);
  await shot('12-admin-organizers');

  console.log('✅ recording done');
} catch (e) {
  console.error('❌ recording failed:', e.message);
  await shot('99-error').catch(() => {});
} finally {
  const video = page.video();
  await ctx.close();
  await browser.close();
  if (video) {
    const webm = await video.path();
    const mp4 = `${OUT}/teamkommit-walkthrough.mp4`;
    execSync(`ffmpeg -y -i "${webm}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${mp4}"`, { stdio: 'inherit' });
    renameSync(webm, `${OUT}/raw.webm`);
    console.log('🎬 video:', mp4);
  }
}
