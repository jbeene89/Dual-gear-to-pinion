/* Magnetic field of the shared magnet band, for the Field view.
 *
 * Model. Every magnet in the band is a uniformly magnetized rectangular
 * block (a parallelepiped) sitting at its true circumferential position,
 * magnetized along its own axial body direction. The field is the exact
 * closed-form superposition of the blocks in air: each block is replaced
 * by the magnetic surface charges on its two pole faces (the Coulombian
 * model), and the field of one uniformly charged rectangle is a corner
 * sum of log and atan2 terms — the atan2 sum is the rectangle's signed
 * solid angle. This is the Akoun–Yonnet family of formulas, reduced to
 * the two charged faces a block magnetized along one body axis carries.
 * B is mu0 * H outside the blocks and mu0 * (H + M) inside one, so field
 * lines can be traced through the magnet material as well.
 *
 * Idealization, stated plainly: ideal uniformly magnetized blocks in
 * air. No iron (the stators in the view are drawn, not modelled), no
 * saturation, no eddy currents, no demagnetization limit checks. Within
 * that idealization the numbers are exact, not fitted: the test suite
 * pins the block field against the known on-axis closed form, a dipole
 * far-field limit, and superposition identities.
 *
 * Units: lengths in millimetres, Br in tesla, angles in degrees. The
 * band's pole-pair count is a parameter here; the app sets it from the
 * Addendum 2 upper pole-pair parameter so the views cannot disagree.
 * The seesaw tilt is the bars' literal pivot angle about their
 * tangential axes, applied to geometry and magnetization together —
 * the same rotation the closed form already handles, nothing rescaled.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GearField = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MU0 = 4 * Math.PI * 1e-7;
  const RAD = Math.PI / 180;
  const num = (v, fallback, low = -1e9, high = 1e9) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;

  const FIELD_DEFAULTS = Object.freeze({
    radius: 320,          // mm, band centre radius — the drawn cap radius
    polePairs: 15,        // magnets = 2 x pole pairs, alternating polarity
    magnetRadial: 40,     // mm, radial thickness of one bar
    magnetAxial: 12,      // mm, axial height of one bar
    fillFactor: 0.75,     // tangential width as a share of the pole arc
    airgap: 1.5,          // mm, band face to stator face, each side
    statorRadial: 56,     // mm, schematic stator radial width (drawn only)
    statorAxial: 18,      // mm, schematic stator axial thickness (drawn only)
    br: 1.2,              // T, remanence of the bar material
    tiltDeg: 0,           // bar pivot angle about the tangential axis
    angleDeg: 0,          // rotor angle of magnet 0
    flipped: []           // indices of magnets flipped against the pattern
  });

  function fieldSettings(raw = {}) {
    const polePairs = Math.round(num(raw.polePairs, FIELD_DEFAULTS.polePairs, 1, 60));
    const seen = new Set();
    const flipped = [];
    if (Array.isArray(raw.flipped)) {
      for (const v of raw.flipped) {
        const i = Math.round(num(v, -1));
        if (i >= 0 && i < 2 * polePairs && !seen.has(i)) { seen.add(i); flipped.push(i); }
      }
      flipped.sort((x, y) => x - y);
    }
    const angle = num(raw.angleDeg, FIELD_DEFAULTS.angleDeg);
    return {
      radius: num(raw.radius, FIELD_DEFAULTS.radius, 10, 5000),
      polePairs,
      magnetRadial: num(raw.magnetRadial, FIELD_DEFAULTS.magnetRadial, 1, 1000),
      magnetAxial: num(raw.magnetAxial, FIELD_DEFAULTS.magnetAxial, 0.5, 500),
      fillFactor: num(raw.fillFactor, FIELD_DEFAULTS.fillFactor, 0.05, 1),
      airgap: num(raw.airgap, FIELD_DEFAULTS.airgap, 0, 100),
      statorRadial: num(raw.statorRadial, FIELD_DEFAULTS.statorRadial, 1, 2000),
      statorAxial: num(raw.statorAxial, FIELD_DEFAULTS.statorAxial, 1, 1000),
      br: num(raw.br, FIELD_DEFAULTS.br, 0, 1.4),
      tiltDeg: num(raw.tiltDeg, FIELD_DEFAULTS.tiltDeg, -60, 60),
      angleDeg: Number.isFinite(angle) ? ((angle % 360) + 360) % 360 : 0,
      flipped
    };
  }

  // Tangential width of one bar: the pole arc at the band radius, times
  // the fill factor. The rest of the arc is the gap between bars.
  function magnetTangential(s) {
    return s.fillFactor * (2 * Math.PI * s.radius) / (2 * s.polePairs);
  }

  /* H (A/m) of one uniformly charged rectangle lying in the plane z = zf,
   * spanning x in [-a, a] and y in [-b, b], charge density sigma (A/m).
   * Corner sums over the four corners; the rational terms that appear in
   * the gradient of the sheet potential cancel pairwise in the sums,
   * leaving the log terms for the tangential components and the solid
   * angle for the normal one. Signs verified against quadrature of the
   * defining integral and the on-axis closed form.
   */
  function rectH(px, py, pz, a, b, zf, sigma) {
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < 2; i++) {
      const U = px - (i ? a : -a);
      for (let j = 0; j < 2; j++) {
        const V = py - (j ? b : -b);
        const W = pz - zf;
        const R = Math.hypot(U, V, W);
        const w = ((i + j) % 2 === 0) ? 1 : -1;
        sx += w * Math.log(Math.max(V + R, 1e-300));
        sy += w * Math.log(Math.max(U + R, 1e-300));
        sz += w * Math.atan2(U * V, W * R);
      }
    }
    const k = sigma / (4 * Math.PI);
    return [-k * sx, -k * sy, k * sz];
  }

  /* B (tesla) of one block centred on the origin of its body frame,
   * half sizes [radial, tangential, axial], magnetized along body z
   * with sign +1 (north up) or -1, remanence br. The pole faces are the
   * z = +/-axial faces, carrying charges +/- sign * M.
   */
  function blockB(p, half, sign, br) {
    const M = br / MU0;
    const top = rectH(p[0], p[1], p[2], half[0], half[1], half[2], sign * M);
    const bottom = rectH(p[0], p[1], p[2], half[0], half[1], -half[2], -sign * M);
    const B = [MU0 * (top[0] + bottom[0]), MU0 * (top[1] + bottom[1]), MU0 * (top[2] + bottom[2])];
    if (Math.abs(p[0]) <= half[0] && Math.abs(p[1]) <= half[1] && Math.abs(p[2]) <= half[2]) {
      B[2] += sign * br;   // inside the material, B = mu0 (H + M)
    }
    return B;
  }

  /* The band as placed blocks: centres on the circle, body frames from
   * the rotor angle and the shared tilt. The frame is Q = Rz(phi) then a
   * pivot about the tangential axis, so a tilted bar's magnetization
   * tips in the radial-axial plane, toward radial for positive tilt.
   * Polarity alternates around the ring; `flipped` indices run against
   * the pattern.
   */
  function bandMagnets(raw) {
    const s = fieldSettings(raw);
    const n = 2 * s.polePairs;
    const tilt = s.tiltDeg * RAD, ct = Math.cos(tilt), st = Math.sin(tilt);
    const flipped = new Set(s.flipped);
    const magnets = [];
    for (let k = 0; k < n; k++) {
      const phi = s.angleDeg * RAD + k * (2 * Math.PI / n);
      const cf = Math.cos(phi), sf = Math.sin(phi);
      magnets.push({
        index: k,
        angle: phi,
        center: [s.radius * cf, s.radius * sf, 0],
        axes: [
          [ct * cf, ct * sf, -st],      // body x: radial, tipped by the pivot
          [-sf, cf, 0],                 // body y: tangential
          [st * cf, st * sf, ct]        // body z: axial, tipped by the pivot
        ],
        sign: (k % 2 === 0 ? 1 : -1) * (flipped.has(k) ? -1 : 1)
      });
    }
    return magnets;
  }

  // Total B at a world point, summed over the placed blocks.
  function fieldAt(p, raw, magnets) {
    const s = fieldSettings(raw);
    const list = magnets || bandMagnets(s);
    const half = [s.magnetRadial / 2, magnetTangential(s) / 2, s.magnetAxial / 2];
    const B = [0, 0, 0];
    for (const m of list) {
      const dx = p[0] - m.center[0], dy = p[1] - m.center[1], dz = p[2] - m.center[2];
      const local = [
        dx * m.axes[0][0] + dy * m.axes[0][1] + dz * m.axes[0][2],
        dx * m.axes[1][0] + dy * m.axes[1][1] + dz * m.axes[1][2],
        dx * m.axes[2][0] + dy * m.axes[2][1] + dz * m.axes[2][2]
      ];
      const bl = blockB(local, half, m.sign, s.br);
      B[0] += m.axes[0][0] * bl[0] + m.axes[1][0] * bl[1] + m.axes[2][0] * bl[2];
      B[1] += m.axes[0][1] * bl[0] + m.axes[1][1] * bl[1] + m.axes[2][1] * bl[2];
      B[2] += m.axes[0][2] * bl[0] + m.axes[1][2] * bl[1] + m.axes[2][2] * bl[2];
    }
    return B;
  }

  // Is a world point inside any placed block? Tilted bars swing their
  // corners through the zero-tilt gap planes, so the airgap sample has
  // to ask — a point inside magnet material is not an airgap point.
  function insideAnyBlock(p, raw, magnets) {
    const s = fieldSettings(raw);
    const list = magnets || bandMagnets(s);
    const half = [s.magnetRadial / 2, magnetTangential(s) / 2, s.magnetAxial / 2];
    for (const m of list) {
      const dx = p[0] - m.center[0], dy = p[1] - m.center[1], dz = p[2] - m.center[2];
      if (Math.abs(dx * m.axes[0][0] + dy * m.axes[0][1] + dz * m.axes[0][2]) <= half[0]
        && Math.abs(dx * m.axes[1][0] + dy * m.axes[1][1] + dz * m.axes[1][2]) <= half[1]
        && Math.abs(dx * m.axes[2][0] + dy * m.axes[2][1] + dz * m.axes[2][2]) <= half[2]) return true;
    }
    return false;
  }

  // Mean and peak |B| on the circle at the band radius, midway across
  // the airgap on one side (side +1 upper, -1 lower). This is the sample
  // the Field view reports for each machine's gap. Samples that fall
  // inside a tilted bar are excluded and counted, not silently read as
  // airgap field.
  function sampleAirgap(raw, magnets, side, count = 120) {
    const s = fieldSettings(raw);
    const list = magnets || bandMagnets(s);
    const z = (side < 0 ? -1 : 1) * (s.magnetAxial / 2 + s.airgap / 2);
    let sum = 0, peak = 0, used = 0, inside = 0;
    for (let j = 0; j < count; j++) {
      const t = j * (2 * Math.PI / count);
      const p = [s.radius * Math.cos(t), s.radius * Math.sin(t), z];
      if (insideAnyBlock(p, s, list)) { inside++; continue; }
      const B = fieldAt(p, s, list);
      const m = Math.hypot(B[0], B[1], B[2]);
      sum += m; if (m > peak) peak = m;
      used++;
    }
    return { mean: used ? sum / used : 0, peak, samples: used, inside };
  }

  // The section region: wide enough to hold both stator sections and a
  // margin of the fringing field around them.
  function sectionRegion(raw) {
    const s = fieldSettings(raw);
    return {
      halfW: s.radius + s.magnetRadial / 2 + 34,
      halfH: s.magnetAxial / 2 + s.airgap + s.statorAxial + 14
    };
  }

  // |B| on the section plane y = 0 over the region, as a grid of cell
  // centres, row 0 at the top (+z). Values in tesla.
  function sectionGrid(raw, magnets, nx, nz) {
    const s = fieldSettings(raw);
    const list = magnets || bandMagnets(s);
    const region = sectionRegion(s);
    const dx = 2 * region.halfW / nx, dz = 2 * region.halfH / nz;
    const values = new Array(nx * nz);
    let max = 0;
    for (let j = 0; j < nz; j++) {
      const z = region.halfH - (j + 0.5) * dz;
      for (let i = 0; i < nx; i++) {
        const x = -region.halfW + (i + 0.5) * dx;
        const B = fieldAt([x, 0, z], s, list);
        const m = Math.hypot(B[0], B[1], B[2]);
        values[j * nx + i] = m;
        if (m > max) max = m;
      }
    }
    return { nx, nz, dx, dz, halfW: region.halfW, halfH: region.halfH, values, max };
  }

  /* One field line in the section plane, traced both ways from a seed
   * [x, z] with a midpoint (RK2) integrator on the in-plane components.
   * The line stops at the region edge, at a null, after maxSteps, or
   * after a run of steps in field too weak to follow (the bore and the
   * far outside, where a line would otherwise wander the whole step
   * budget). Brief weak crossings — the saddles between poles — are
   * ridden through.
   */
  function streamline(raw, magnets, seed, opts = {}) {
    const s = fieldSettings(raw);
    const list = magnets || bandMagnets(s);
    const region = sectionRegion(s);
    const step = num(opts.step, 1.5, 0.05, 100);
    const maxSteps = Math.round(num(opts.maxSteps, 240, 1, 100000));
    const weak = num(opts.weak, 0.003, 0, 100);
    const bound = { x: region.halfW * 1.03, z: region.halfH * 1.03 };
    const slope = (x, z) => {
      const B = fieldAt([x, 0, z], s, list);
      const m = Math.hypot(B[0], B[2]);
      return m > 1e-9 ? [B[0] / m, B[2] / m, m] : null;
    };
    const trace = dir => {
      const pts = [];
      let x = seed[0], z = seed[1], weakRun = 0;
      for (let i = 0; i < maxSteps; i++) {
        const d0 = slope(x, z);
        if (!d0) break;
        const mx = x + dir * d0[0] * step / 2, mz = z + dir * d0[1] * step / 2;
        const dm = slope(mx, mz);
        if (!dm) break;
        x += dir * dm[0] * step; z += dir * dm[1] * step;
        if (Math.abs(x) > bound.x || Math.abs(z) > bound.z) break;
        weakRun = dm[2] < weak ? weakRun + 1 : 0;
        if (weakRun > 10) break;
        pts.push([x, z]);
        // A line that comes home has closed its loop around a pole;
        // tracing on would only draw over itself.
        if (pts.length > 20 && Math.hypot(x - seed[0], z - seed[1]) < step * 0.8) break;
      }
      return pts;
    };
    const back = trace(-1).reverse();
    return back.concat([[seed[0], seed[1]]], trace(1));
  }

  return { MU0, FIELD_DEFAULTS, fieldSettings, magnetTangential, bandMagnets,
    blockB, fieldAt, insideAnyBlock, sampleAirgap, sectionRegion, sectionGrid, streamline };
});
