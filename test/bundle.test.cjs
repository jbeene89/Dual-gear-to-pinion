'use strict';
/* The delivered artefact is one HTML file. These checks keep it that way. */
const fs = require('fs'), path = require('path'), vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

module.exports = ({ test, assert }) => {
  test('the build is current with src/', () => {
    const built = fs.existsSync(path.join(root, 'index.html'));
    assert.ok(built, 'run `node build.cjs` first');
    const html = read('index.html');
    for (const marker of ['GearCore', 'Gear3D', 'GearMechanics', 'GearField']) {
      assert.ok(html.includes(marker), 'index.html is missing ' + marker);
    }
    assert.ok(!html.includes('{{'), 'an unreplaced build placeholder is left in the output');
  });

  test('the app stays offline and self-contained', () => {
    const html = read('index.html');
    assert.ok(!/<script[^>]+\bsrc=/i.test(html), 'no external scripts');
    assert.ok(!/<link[^>]+stylesheet/i.test(html), 'no external stylesheets');
    assert.ok(!/\b(fetch|XMLHttpRequest|importScripts)\s*\(/.test(html), 'no network calls');
    assert.ok(!/https?:\/\//.test(html.replace(/https?:\/\/www\.w3\.org\/[^"']*/g, '')), 'no remote references beyond XML namespaces');
  });

  test('each module evaluates on its own', () => {
    for (const file of ['src/core.js', 'src/three-d.js', 'src/mechanics.js', 'src/field.js']) {
      const context = { module: { exports: {} }, globalThis: {} };
      context.globalThis = context;
      assert.doesNotThrow(() => vm.runInNewContext(read(file), context), file);
    }
  });

  test('the app script parses as a script', () => {
    assert.doesNotThrow(() => new vm.Script(read('src/app.js')), 'src/app.js has a syntax error');
  });

  test('the standalone file stays a reasonable size', () => {
    const bytes = Buffer.byteLength(read('index.html'));
    assert.ok(bytes > 100000, 'suspiciously small: ' + bytes);
    assert.ok(bytes < 400000, 'the single file is getting heavy: ' + bytes);
  });

  test('stylus mode is present, optional, and off by default', () => {
    const html = read('index.html');
    assert.ok(html.includes('id="stylus-toggle"'), 'the stylus toggle is in the built file');
    assert.ok(!/id="stylus-toggle"[^>]*\bchecked\b/.test(html), 'the stylus toggle starts unchecked');
    assert.ok(html.includes('stylus-mode'), 'the stylus-mode class hook is in the built file');
    assert.ok(html.includes('soupy-gear-studio-ui-v1'), 'the stylus preference has its own store key');
    assert.ok(html.includes('HANDLE_HIT_PX_STYLUS'), 'the widened grab sizes are wired into the sketch');
    assert.ok(html.includes('Stylus / touch'), 'the toggle is labeled for stylus/touch use');
  });

  test('every bundled example design loads', () => {
    const C = require('../src/core.js');
    const dir = path.join(root, 'examples');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
    assert.ok(files.length > 0, 'no example designs found');
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      assert.doesNotThrow(() => C.validateDesign(raw), file);
    }
  });
};
