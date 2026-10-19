'use strict';
/* Field view checks: the closed-form block field against its analytic
 * anchors — the known on-axis value, the dipole far field, superposition,
 * polarity and rotation identities — plus the band-level sampling the
 * view reports. No dependencies: run with `node test/run.cjs`.
 */
const F = require('../src/field.js');

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const relErr = (v, ref) => Math.hypot(v[0] - ref[0], v[1] - ref[1], v[2] - ref[2]) / Math.max(Math.hypot(...ref), 1e-12);

// The textbook on-axis field of a rectangular magnet, magnetized
// through its height H, at distance d above the top face.
function onAxisBz(d, W, D, H, Br) {
  const f = z => Math.atan((W * D) / (2 * z * Math.sqrt(W * W + D * D + 4 * z * z)));
  return (Br / Math.PI) * (f(d) - f(d + H));
}

// Point-dipole field (SI) of a block with moment along mDir.
function dipoleB(p, center, mDir, volumeMm3, br) {
  const m = mDir.map(v => v * (br / F.MU0) * volumeMm3 * 1e-9);
  const r = p.map((v, i) => (v - center[i]) * 1e-3);
  const rn = Math.hypot(...r), rh = r.map(v => v / rn);
  const mdotr = m[0] * rh[0] + m[1] * rh[1] + m[2] * rh[2];
  const k = (F.MU0 / (4 * Math.PI)) / Math.pow(rn, 3);
  return [k * (3 * rh[0] * mdotr - m[0]), k * (3 * rh[1] * mdotr - m[1]), k * (3 * rh[2] * mdotr - m[2])];
}

module.exports = ({ test, assert }) => {
  test('a single block on its axis matches the known closed form', () => {
    const half = [20, 25, 6], Br = 1.2;
    for (const d of [0.5, 2, 5, 20]) {
      const B = F.blockB([0, 0, half[2] + d], half, 1, Br);
      const expected = onAxisBz(d, 2 * half[0], 2 * half[1], 2 * half[2], Br);
      assert.ok(near(B[2], expected, 1e-9), `d=${d}: ${B[2]} vs ${expected}`);
      assert.ok(near(B[0], 0, 1e-12) && near(B[1], 0, 1e-12), 'no transverse field on the axis');
    }
    const below = F.blockB([0, 0, -(half[2] + 2)], half, 1, Br);
    assert.ok(near(below[2], onAxisBz(2, 40, 50, 12, Br), 1e-9), 'the south face reads the same on its axis');
  });

  test('flipping a block negates its field', () => {
    const half = [20, 25, 6];
    for (const p of [[10, 8, 10], [24, 0, 7], [-30, 15, 20], [0, 0, -9]]) {
      const up = F.blockB(p, half, 1, 1.2), down = F.blockB(p, half, -1, 1.2);
      for (let i = 0; i < 3; i++) assert.ok(near(up[i] + down[i], 0, 1e-12), `component ${i} at ${p}`);
    }
  });

  test('the band field is the sum of its blocks', () => {
    const s = F.fieldSettings({ polePairs: 3, angleDeg: 17, tiltDeg: 10, flipped: [1] });
    const magnets = F.bandMagnets(s);
    for (const p of [[320, 0, 8], [250, 40, -9], [0, 0, 30]]) {
      const total = F.fieldAt(p, s, magnets);
      const sum = [0, 0, 0];
      for (const m of magnets) {
        const one = F.fieldAt(p, s, [m]);
        for (let i = 0; i < 3; i++) sum[i] += one[i];
      }
      for (let i = 0; i < 3; i++) assert.ok(near(total[i], sum[i], 1e-9), `component ${i} at ${p}`);
    }
  });

  test('far from a block the field is the dipole field', () => {
    const half = [20, 25, 6], Br = 1.2, volume = 8 * half[0] * half[1] * half[2];
    for (const p of [[600, 300, 1000], [0, 0, 1200], [-900, 200, -500]]) {
      const B = F.blockB(p, half, 1, Br);
      const dip = dipoleB(p, [0, 0, 0], [0, 0, 1], volume, Br);
      assert.ok(relErr(B, dip) < 2e-3, `at ${p}: rel err ${relErr(B, dip)}`);
    }
  });

  test('tilt turns the magnet and its far field together', () => {
    const s = F.fieldSettings({ polePairs: 1, radius: 60, angleDeg: 0, tiltDeg: 60 });
    const m = F.bandMagnets(s)[0];
    const zb = m.axes[2];
    assert.ok(near(zb[0], Math.sin(Math.PI / 3), 1e-12) && near(zb[1], 0, 1e-12) && near(zb[2], Math.cos(Math.PI / 3), 1e-12),
      'the body z axis tips toward radial by the tilt angle');
    const volume = s.magnetRadial * F.magnetTangential(s) * s.magnetAxial;
    const p = [m.center[0] + 1200, m.center[1] + 450, m.center[2] + 3800];
    const B = F.fieldAt(p, s, [m]);
    const dip = dipoleB(p, m.center, zb.map(v => v * m.sign), volume, s.br);
    assert.ok(relErr(B, dip) < 2e-3, `tilted dipole: rel err ${relErr(B, dip)}`);
  });

  test('rotation by one magnet pitch negates the field; two pitches restore it', () => {
    const probes = [[320, 0, 8], [250, 40, -9], [374, 0, 20], [0, 0, 30]];
    const base = F.fieldSettings({ angleDeg: 0 });
    const one = F.fieldSettings({ angleDeg: 360 / (2 * base.polePairs) });
    const two = F.fieldSettings({ angleDeg: 2 * 360 / (2 * base.polePairs) });
    for (const p of probes) {
      const b0 = F.fieldAt(p, base), b1 = F.fieldAt(p, one), b2 = F.fieldAt(p, two);
      for (let i = 0; i < 3; i++) {
        assert.ok(near(b1[i], -b0[i], 1e-9), `one pitch negates component ${i} at ${p}`);
        assert.ok(near(b2[i], b0[i], 1e-9), `two pitches restore component ${i} at ${p}`);
      }
    }
  });

  test('the two airgaps agree at zero tilt, and flipping every magnet changes nothing', () => {
    const s = F.fieldSettings({});
    const magnets = F.bandMagnets(s);
    const up = F.sampleAirgap(s, magnets, 1), low = F.sampleAirgap(s, magnets, -1);
    assert.ok(near(up.mean, low.mean, 1e-9), 'upper and lower means agree');
    assert.ok(near(up.peak, low.peak, 1e-9), 'upper and lower peaks agree');
    assert.ok(up.mean > 0.1 && up.mean < s.br, 'the gap field is a sane share of Br');
    const flippedAll = F.fieldSettings({ flipped: magnets.map(m => m.index) });
    const up2 = F.sampleAirgap(flippedAll, F.bandMagnets(flippedAll), 1);
    assert.ok(near(up2.mean, up.mean, 1e-9) && near(up2.peak, up.peak, 1e-9), 'a global flip leaves |B| alone');
  });

  test('gap samples inside tilted bars are excluded, not read as airgap', () => {
    const flat = F.fieldSettings({});
    assert.equal(F.sampleAirgap(flat, F.bandMagnets(flat), 1).inside, 0, 'nothing inside at zero tilt');
    const tilted = F.fieldSettings({ tiltDeg: 45 });
    const up = F.sampleAirgap(tilted, F.bandMagnets(tilted), 1);
    assert.ok(up.inside > 0, 'tilted corners cross the gap plane');
    assert.equal(up.samples + up.inside, 120, 'every sample is accounted for');
  });

  test('a traced field line stays finite and inside the section bounds', () => {
    const s = F.fieldSettings({});
    const magnets = F.bandMagnets(s);
    const region = F.sectionRegion(s);
    const line = F.streamline(s, magnets, [s.radius, s.magnetAxial / 2 + 1.2]);
    assert.ok(line.length > 10, 'the line goes somewhere');
    for (const [x, z] of line) {
      assert.ok(Number.isFinite(x) && Number.isFinite(z), 'finite points');
      assert.ok(Math.abs(x) <= region.halfW * 1.04 && Math.abs(z) <= region.halfH * 1.04, 'inside the bounds');
    }
  });

  test('field settings clamp and fall back like the other side stores', () => {
    const s = F.fieldSettings({ br: 9, tiltDeg: 400, angleDeg: -90, flipped: [2, 2, 999, -1, 5] });
    assert.equal(s.br, 1.4);
    assert.equal(s.tiltDeg, 60);
    assert.equal(s.angleDeg, 270);
    assert.deepEqual(s.flipped, [2, 5], 'flips dedupe and stay in range');
    assert.equal(F.fieldSettings({ polePairs: 0 }).polePairs, 1, 'at least one pole pair');
    assert.equal(F.fieldSettings({ radius: 'x' }).radius, F.FIELD_DEFAULTS.radius);
  });

  test('the field view is present in the built file', () => {
    const fs = require('fs'), path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="stagefield"'), 'the section stage is in the built file');
    assert.ok(html.includes('data-view-mode="field"'), 'the Field view button is in the built file');
    assert.ok(html.includes('soupy-gear-studio-field-v1'), 'the field state has its own store key');
    assert.ok(html.includes('no iron, no saturation, no eddy currents'), 'the honest label travels with the view');
  });
};
