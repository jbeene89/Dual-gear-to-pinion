#!/usr/bin/env node
'use strict';
/* Drives the built index.html in a real browser: the editor must start, the
 * analysis panel must render, and a repair must leave the design consistent.
 * Run with `node test/browser.cjs [--shots <dir>]`.
 */
const path = require('path');
const { chromium } = require('playwright');

const file = 'file://' + path.join(__dirname, '..', 'index.html');
const shotsIndex = process.argv.indexOf('--shots');
const shots = shotsIndex > -1 ? process.argv[shotsIndex + 1] : null;

let passed = 0, failed = 0;
function check(name, condition, extra) {
  if (condition) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
}

// The browser copy is written on a debounce, so wait for it rather than racing.
async function readStored(page, pick, expect) {
  await page.waitForFunction(want => {
    const raw = localStorage.getItem('soupy-gear-studio-v1');
    if (!raw) return false;
    if (!want) return true;
    return JSON.parse(raw).objects.some(o => o.type === 'motor' && String(o[want.key]) === String(want.value));
  }, expect || null, { timeout: 5000 }).catch(() => {});
  const objects = await page.evaluate(() => JSON.parse(localStorage.getItem('soupy-gear-studio-v1')).objects);
  return objects.filter(o => o.type === 'motor').map(pick);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // A stale browser copy must not decide what this run sees.
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(file);
  await page.waitForSelector('#analysis .mesh-card', { timeout: 10000 });

  check('no console or page errors on load', errors.length === 0, errors.join(' | '));
  check('the launch notice is dismissed by the running editor',
    await page.locator('#launch-notice').isHidden());
  check('the 3D scene drew geometry', (await page.locator('#stage3d polygon').count()) > 100);

  const badge = (await page.locator('#analysis-badge').textContent()).trim();
  check('the badge reports the blocking mismatch', badge === '2 blocking', badge);

  const cards = await page.locator('#analysis .mesh-card').count();
  check('both meshes are listed', cards === 2, 'cards: ' + cards);

  const text = await page.locator('#analysis').innerText();
  check('the upper ratio pair is shown', text.includes('10.667') && text.includes('8'), '');
  check('the module mismatch is named', /33%|42%/.test(text));
  check('derived ring speeds appear', text.includes('28.1 rpm') && text.includes('105.5 rpm'), '');
  check('power totals appear', /kW/.test(text) && /\bA\b/.test(text));

  if (shots) await page.screenshot({ path: path.join(shots, 'analysis-before.png'), fullPage: false });

  // Labels must sit clear of the model, in every view, not only the angled one.
  for (const view of ['front', 'side', 'top', 'iso']) {
    await page.locator(`[data-camera="${view}"]`).click();
    await page.waitForTimeout(250);
    const clash = await page.evaluate(() => {
      const svg = document.getElementById('stage3d');
      const shapes = [...svg.querySelectorAll('polygon[data-part-id]')];
      const boxes = shapes.map(n => n.getBBox());
      const hits = [];
      for (const text of svg.querySelectorAll('text')) {
        // The power-flow tag rides its own arrow by design and carries a
        // halo; only the part name/subtitle labels must stay off the model.
        if (!text.closest('[data-part-id]') || text.closest('.shaft-power-flow')) continue;
        const t = text.getBBox();
        if (t.width < 2) continue;
        for (const b of boxes) {
          if (t.x < b.x + b.width && t.x + t.width > b.x && t.y < b.y + b.height && t.y + t.height > b.y) {
            hits.push(text.textContent.slice(0, 32));
            break;
          }
        }
      }
      return hits;
    });
    check('no label sits on the model in the ' + view + ' view', clash.length === 0, clash.join(' | '));
  }
  // Looking straight down the shaft, the arrow collapses to a dot, so its
  // tag must drop into the label band rather than land on the model.
  await page.locator('[data-camera="front"]').click();
  await page.waitForTimeout(250);
  const parked = await page.evaluate(() => {
    const svg = document.getElementById('stage3d');
    const tag = [...svg.querySelectorAll('.shaft-power-flow text')][0];
    const parts = [...svg.querySelectorAll('polygon[data-part-id]')].map(n => n.getBBox());
    const low = parts.reduce((m, b) => Math.max(m, b.y + b.height), -Infinity);
    return tag ? tag.getBBox().y > low : false;
  });
  check('the foreshortened power-flow tag parks below the model', parked);

  await page.locator('[data-camera="reset"]').click();
  await page.waitForTimeout(250);

  const note = await page.locator('#schematic-note').textContent();
  check('the canvas badge reports the mesh failures', /will not turn/.test(note), note);

  // Repair: match tooth counts to the drawn sizes.
  await page.locator('[data-fix="wheel-teeth"]').click();
  await page.waitForFunction(() => document.getElementById('analysis-badge').textContent.trim() !== '2 blocking', null, { timeout: 5000 });
  const after = (await page.locator('#analysis-badge').textContent()).trim();
  check('the repair clears the blocking failures', !/blocking/.test(after), after);

  const teeth = await readStored(page, o => o.teeth, { key: 'teeth', value: 128 });
  check('cap tooth counts were restated', teeth.includes(128) && teeth.includes(102), JSON.stringify(teeth));

  // Undo must take the repair back, like any other edit.
  await page.keyboard.press('Control+z');
  await page.waitForFunction(() => document.getElementById('analysis-badge').textContent.trim() === '2 blocking', null, { timeout: 5000 });
  check('undo restores the original tooth counts', true);

  // Motion sync is a separate, independently useful repair.
  await page.locator('[data-fix="motion"]').click();
  await page.waitForTimeout(250);
  const speeds = await readStored(page, o => o.speed, { key: 'speed', value: 4.5 });
  check('preview speeds follow the ratios', speeds.includes(4.5) && speeds.includes(16.88), JSON.stringify(speeds));

  // A duty change must flow straight through to the power table.
  await page.fill('[data-duty="shaftTorque"]', '200');
  await page.locator('[data-duty="shaftTorque"]').dispatchEvent('change');
  await page.waitForTimeout(200);
  const doubled = await page.locator('#analysis').innerText();
  check('doubling shaft torque doubles shaft power', doubled.includes('6.28 kW'), '');

  // Generator mode must switch the power direction label.
  await page.selectOption('#operating-mode', 'generator');
  await page.waitForTimeout(250);
  const gen = await page.locator('#analysis').innerText();
  check('generator mode is reflected in the power section', /Power · generator/i.test(gen) || gen.includes('Shaft input'), '');

  if (shots) await page.screenshot({ path: path.join(shots, 'analysis-after.png'), fullPage: false });

  // Narrow viewport: the panel has to stay usable on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at phone width', overflow <= 1, 'overflow ' + overflow + 'px');
  if (shots) await page.screenshot({ path: path.join(shots, 'analysis-mobile.png'), fullPage: false });

  check('still no console errors after interaction', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
