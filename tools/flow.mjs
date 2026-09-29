// Scripted UI flow for smoke testing: node tools/flow.mjs <url> <outprefix> <steps-json>
// usage: node tools/flow.mjs <url> <outprefix> <steps-json> [width] [height] [desktop|touch]
// steps: [{"click":"text"}|{"tap":"text"}|{"key":"Space","hold":ms}|{"wait":ms}|{"shot":"name"}|{"eval":"js"}|{"reload":true}]
// {"seed":"completed"} writes a save with the journey finished (all regions reached) and reloads.
import { chromium } from 'playwright';
const [url, prefix, stepsJson, w = '1280', h = '720', device = 'desktop'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// device 'touch' emulates a phone/tablet: touch events, no hover, device pixel ratio 2
const page = await browser.newPage(device === 'touch' ? { viewport: { width: +w, height: +h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3000);
for (const s of steps) {
  if (s.click) await page.getByText(s.click, { exact: false }).first().click({ timeout: 5000 }).catch((e) => logs.push('click fail ' + s.click + ' ' + e.message));
  if (s.tap) await page.getByText(s.tap, { exact: false }).first().tap({ timeout: 5000 }).catch((e) => logs.push('tap fail ' + s.tap + ' ' + e.message));
  if (s.key) { if (s.hold) { await page.keyboard.down(s.key); await page.waitForTimeout(s.hold); await page.keyboard.up(s.key); } else await page.keyboard.press(s.key); }
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${prefix}${s.shot}.png` });
  if (s.seed) {
    // build the save in the page (same code the game uses), then install it before the next load
    // so the running game's own save-on-exit cannot overwrite it
    const enc = await page.evaluate(async (kind) => {
      const m = await import('/src/client/services/save.ts');
      const { MemoryKV } = await import('/src/client/services/storage.ts');
      const d = m.newSave();
      if (kind === 'completed' || kind === 'midway') {
        d.regionsReached = kind === 'completed' ? 9 : 4;
        d.journeysCompleted = kind === 'completed' ? 1 : 0;
        d.journey = m.newJourney('standard', false);
        d.journey.regionMax = d.regionsReached;
      }
      const kv = new MemoryKV();
      new m.SaveManager(kv).save(d, true);
      return kv.get('vertigo.save');
    }, s.seed);
    await page.addInitScript((v) => {
      if (sessionStorage.getItem('flow.seeded') === v.slice(0, 64)) return;
      sessionStorage.setItem('flow.seeded', v.slice(0, 64));
      for (const k of Object.keys(localStorage)) if (k.startsWith('vertigo.save')) localStorage.removeItem(k);
      localStorage.setItem('vertigo.save', v);
    }, enc);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(3000);
  }
  if (s.reload) { await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000); }
  if (s.eval) console.log('eval:', JSON.stringify(await page.evaluate(s.eval)));
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
