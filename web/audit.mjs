import { chromium } from '@playwright/test';
const base = 'http://localhost:5173';
const browser = await chromium.launch();

async function audit(path, name, authed) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('403') && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text().slice(0,150)); });
  if (authed) {
    await page.goto(base + '/auth', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'user0@seed.teamkommit.dev');
    await page.fill('input[type="password"]', 'password123');
    await page.click('.sticker form .btn-grape');
    await page.waitForTimeout(1500);
  }
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(()=>{});
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const hOverflow = de.scrollWidth > de.clientWidth + 2;
    // elements wider than viewport
    const wide = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > de.clientWidth + 4 && r.height > 0;
    }).slice(0,5).map(el => el.tagName + '.' + String(el.className).slice(0,60));
    // h1 present?
    const h1 = document.querySelector('h1')?.textContent?.slice(0,60) ?? 'NO H1';
    return { hOverflow, scrollW: de.scrollWidth, clientW: de.clientWidth, wide, h1, title: document.title };
  });
  console.log(`\n=== ${name} (${path}) ===`);
  console.log('h1:', m.h1);
  console.log('h-overflow:', m.hOverflow, `(${m.scrollW}>${m.clientW})`);
  if (m.wide.length) console.log('wide elements:', m.wide);
  if (errors.length) console.log('errors:', errors.slice(0,6));
  else console.log('errors: none');
  await page.close();
}

await audit('/', 'LANDING (guest)', false);
await audit('/board', 'BOARD (guest)', false);
await audit('/', 'LANDING (auth)', true);
await audit('/board', 'BOARD (auth)', true);
await audit('/people', 'PEOPLE', true);
await audit('/submissions', 'SUBMISSIONS', true);
await audit('/profile', 'PROFILE', true);
await browser.close();
