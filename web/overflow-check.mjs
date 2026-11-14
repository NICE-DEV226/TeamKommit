import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
for (const path of ['/', '/board']) {
  await p.goto('http://localhost:5173' + path, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const wide = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 2 || r.right > vw + 2 || r.left < -2) {
        out.push(`${el.tagName}.${(el.className.baseVal ?? el.className ?? '').toString().slice(0, 60)} w=${Math.round(r.width)} l=${Math.round(r.left)} r=${Math.round(r.right)}`);
      }
    });
    return { vw, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 12) };
  });
  console.log(`\n=== ${path} === vw=${wide.vw} scrollW=${wide.scrollW}`);
  wide.out.forEach((l) => console.log(' ', l));
}
await b.close();
