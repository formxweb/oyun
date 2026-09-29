// Scripted UI flow for smoke testing: node tools/flow.mjs <url> <outprefix> <steps-json>
// steps: [{"click":"text"}|{"key":"Space","hold":ms}|{"wait":ms}|{"shot":"name"}|{"eval":"js"}]
import { chromium } from 'playwright';
const [url, prefix, stepsJson, w = '1280', h = '720'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3000);
for (const s of steps) {
  if (s.click) await page.getByText(s.click, { exact: false }).first().click({ timeout: 5000 }).catch((e) => logs.push('click fail ' + s.click + ' ' + e.message));
  if (s.key) { if (s.hold) { await page.keyboard.down(s.key); await page.waitForTimeout(s.hold); await page.keyboard.up(s.key); } else await page.keyboard.press(s.key); }
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${prefix}${s.shot}.png` });
  if (s.eval) console.log('eval:', JSON.stringify(await page.evaluate(s.eval)));
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
