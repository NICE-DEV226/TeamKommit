import { chromium } from '@playwright/test';
const base = 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/pw/board.png', fullPage: false });
console.log('board title:', await page.locator('h1').first().textContent());
console.log('team cards:', await page.locator('ul[aria-live] > li').count());

await page.goto(base + '/auth', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/pw/auth.png' });

// login as seed user
await page.fill('input[type="email"]', 'user0@seed.teamkommit.dev');
await page.fill('input[type="password"]', 'password123');
await page.click(".sticker form .btn-grape");
await page.waitForURL(base + '/', { timeout: 10000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/pw/board-logged.png' });

// open first team
const firstTeam = page.locator('ul[aria-live] > li a').first();
if (await firstTeam.count()) {
  await firstTeam.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/pw/team.png', fullPage: true });
  console.log('team url:', page.url());
}

await page.goto(base + '/profile', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/pw/profile.png' });

await page.goto(base + '/submissions', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/pw/submissions.png' });

console.log('JS errors:', errors.length ? errors.slice(0,10) : 'none');
await browser.close();
