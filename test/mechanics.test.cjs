'use strict';
/* Mesh, kinematics, power, repair, and clearance checks. No dependencies:
 * run with `node test/run.cjs`.
 */
const C = require('../src/core.js');
const M = require('../src/mechanics.js');

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

function apply(design, patches) {
  const next = JSON.parse(JSON.stringify(design));
  for (const patch of patches) {
    const o = next.objects.find(x => x.id === patch.id);
    if (!o) throw new Error('Patch targets a missing object: ' + patch.id);
    Object.assign(o, patch.set);
  }
  // Every repair must survive the app's own import rules.
  return C.validateDesign(next);
}

const meshOf = (report, kind) => report.meshes.find(m => m.sectionKind === kind);

module.exports = ({ test, assert }) => {
  test('the capped-motor starter meshes are found on the right faces', () => {
    const r = M.analyze(C.starterMotorDrive(), {});
    assert.equal(r.meshes.length, 2, 'two wheels, two meshes');
    const upper = meshOf(r, 'small'), lower = meshOf(r, 'large');
    assert.equal(upper.kind, 'right-angle');
    assert.equal(upper.face, 'pinion-top');
    assert.equal(upper.surface, 'downturned rim edge');
    assert.equal(lower.face, 'pinion-bottom');
    assert.equal(lower.surface, 'cap top plate');
    assert.ok(near(upper.axialGap, 0), 'upper faces touch exactly');
    assert.ok(near(lower.axialGap, 0), 'lower faces touch exactly');
  });

  test('contact radius is where the pinion sits, not the cap edge', () => {
    const r = M.analyze(C.starterMotorDrive(), {});
    // The small section is at X=320 and the large at X=256; the lower cap's
    // 270 outer radius is not the rolling radius.
    assert.ok(near(meshOf(r, 'small').contactRadius, 320));
    assert.ok(near(meshOf(r, 'large').contactRadius, 256));
  });

  test('the documented ratio inconsistency is reproduced', () => {
    const r = M.analyze(C.starterMotorDrive(), {});
    const upper = meshOf(r, 'small'), lower = meshOf(r, 'large');
    assert.ok(near(upper.ratioTeeth, 8), '96/12 = 8');
    assert.ok(near(upper.ratioGeometric, 320 / 30), '320/30 = 10.67');
    assert.ok(near(lower.ratioTeeth, 2), '72/36 = 2');
    assert.ok(near(lower.ratioGeometric, 256 / 90), '256/90 = 2.84');
    assert.equal(upper.consistent, false);
    assert.equal(lower.consistent, false);
    assert.equal(r.blocking, 2, 'one blocking module failure per mesh');
    assert.equal(r.consistent, false);
  });

  test('module is reported per member and scaled to millimetres', () => {
    const r = M.analyze(C.starterMotorDrive(), { scale: 2 });
    const upper = meshOf(r, 'small');
    assert.ok(near(upper.modulePinion, 5), '2*30/12');
    assert.ok(near(upper.moduleWheel, 2 * 320 / 96));
    assert.ok(near(upper.modulePinionMm, 10), 'scale multiplies into mm');
  });

  test('the legacy parallel-axis starter is already consistent', () => {
    const r = M.analyze(C.starter(), {});
    assert.equal(r.blocking, 0, 'module 5 on every member');
    assert.equal(r.consistent, true);
    const outer = r.meshes.find(m => m.wheelName === 'Outer ring');
    const inner = r.meshes.find(m => m.wheelName === 'Inner ring');
    assert.equal(outer.kind, 'parallel');
    assert.ok(near(outer.centreError, 0), 'internal pair: 240 - 30 = 210');
    assert.ok(near(inner.centreError, 0), 'external pair: 120 + 90 = 210');
    assert.equal(outer.directionFactor, 1, 'a pinion inside a ring co-rotates');
    assert.equal(inner.directionFactor, -1, 'an external pair counter-rotates');
  });

  test('ring directions derive from the mesh and match the drawn arrows', () => {
    for (const make of [C.starterMotorDrive, C.starterGeneratorDrive, C.starter]) {
      const r = M.analyze(make(), {});
      assert.equal(r.kinematics.disagreements, 0, make.name + ': arrows agree with the geometry');
      assert.equal(r.kinematics.counterRotating, true, make.name + ': the rings oppose');
    }
  });

  test('reversing the shaft reverses both rings', () => {
    const d = C.starterMotorDrive();
    d.objects.find(o => o.type === 'compound').direction = 'ccw';
    const r = M.analyze(d, {});
    assert.equal(r.kinematics.shaftDirection, 'ccw');
    const upper = r.kinematics.rings.find(x => x.name.startsWith('Upper'));
    const lower = r.kinematics.rings.find(x => x.name.startsWith('Lower'));
    assert.equal(upper.derivedDirection, 'ccw', 'was cw');
    assert.equal(lower.derivedDirection, 'cw', 'was ccw');
    assert.equal(r.kinematics.disagreements, 2, 'the drawn arrows now contradict the shaft');
  });

  test('ring speed follows the drawn ratio', () => {
    const r = M.analyze(C.starterMotorDrive(), { shaftRpm: 300 });
    const upper = r.kinematics.rings.find(x => x.name.startsWith('Upper'));
    const lower = r.kinematics.rings.find(x => x.name.startsWith('Lower'));
    assert.ok(near(upper.rpm, 300 / (320 / 30), 1e-9), '28.1 rpm');
    assert.ok(near(lower.rpm, 300 / (256 / 90), 1e-9), '105.5 rpm');
    assert.ok(near(upper.previewSpeed, 48 / (320 / 30), 1e-9), 'preview tracks the shaft at 48 deg/s');
  });

  test('shaft power matches torque x speed', () => {
    const r = M.analyze(C.starterGeneratorDrive(), { shaftTorque: 100, shaftRpm: 300 });
    // 100 N*m at 300 rpm is 3.14 kW, as the sizing study states.
    assert.ok(near(r.power.shaftPower, 100 * 300 * 2 * Math.PI / 60, 1e-9));
    assert.ok(Math.abs(r.power.shaftPower - 3141.6) < 0.5);
  });

  test('generator output is the shaft power less the loss chain', () => {
    const s = { shaftTorque: 100, shaftRpm: 300, gearEfficiency: .96, machineEfficiency: .90, converterEfficiency: .95, busVoltage: 48 };
    const r = M.analyze(C.starterGeneratorDrive(), s);
    const chain = .96 * .90 * .95;
    assert.equal(r.power.mode, 'generator');
    assert.ok(near(r.power.chainEfficiency, chain, 1e-12));
    assert.ok(near(r.power.electricalTotal, r.power.shaftPower * chain, 1e-6));
    assert.ok(near(r.power.busCurrentTotal, r.power.electricalTotal / 48, 1e-9));
    assert.ok(near(r.power.overall, chain, 1e-9));
  });

  test('each generator branch carries its torque share at its own ring speed', () => {
    const r = M.analyze(C.starterGeneratorDrive(), { shaftTorque: 100, shaftRpm: 300, torqueShare: 0.7 });
    const [first, second] = r.power.branches;
    assert.ok(near(first.share, 0.7));
    assert.ok(near(second.share, 0.3));
    // Ring torque scales with g, ring speed divides by g, so the product is
    // the branch's share of shaft power less one gear stage.
    for (const b of r.power.branches) {
      assert.ok(near(b.mechanicalPower, b.share * r.power.shaftPower * r.settings.gearEfficiency, 1e-6), b.name);
      assert.ok(near(b.ringTorque, b.share * 100 * r.settings.gearEfficiency * b.ratio, 1e-9));
    }
  });

  test('motor mode demands more ring torque than the shaft delivers', () => {
    const d = C.starterMotorDrive();
    const r = M.analyze(d, { shaftTorque: 100, shaftRpm: 300, torqueShare: 0.5 });
    assert.equal(r.power.mode, 'motor');
    for (const b of r.power.branches) {
      assert.ok(near(b.ringTorque, b.share * 100 * b.ratio / r.settings.gearEfficiency, 1e-9));
      assert.ok(b.electricalPower > b.mechanicalPower, 'losses add to the electrical draw');
    }
    assert.ok(r.power.overall < 1);
  });

  test('zero bus voltage does not produce infinite current', () => {
    const r = M.analyze(C.starterGeneratorDrive(), { busVoltage: 0 });
    assert.equal(r.power.busCurrentTotal, 0);
    for (const b of r.power.branches) assert.equal(b.busCurrent, 0);
  });

  test('matching tooth counts to the drawn sizes makes the design consistent', () => {
    const d = C.starterMotorDrive();
    const before = M.analyze(d, {});
    assert.ok(near(meshOf(before, 'small').suggestion.wheelTeeth, 128), '2*320/5');
    const patches = M.patchesFor(d, before, 'wheel-teeth');
    const after = M.analyze(apply(d, patches), {});
    assert.equal(after.blocking, 0, 'both meshes now share a module');
    assert.ok(near(meshOf(after, 'small').ratioTeeth, 128 / 12));
    assert.ok(near(meshOf(after, 'small').ratioGeometric, 320 / 30));
  });

  test('a non-integer tooth count is reported, not silently rounded away', () => {
    const before = M.analyze(C.starterMotorDrive(), {});
    const lower = meshOf(before, 'large');
    // 2*256/5 = 102.4 teeth: no whole number lands on the drawn radius.
    assert.ok(near(lower.suggestion.exactWheelTeeth, 102.4, 1e-9));
    assert.equal(lower.suggestion.wheelTeeth, 102);
    assert.ok(Math.abs(lower.suggestion.wheelTeethResidual + 0.4) < 1e-9);
  });

  test('matching pinion sizes to the tooth counts re-seats the caps', () => {
    const d = C.starterMotorDrive();
    const before = M.analyze(d, {});
    const patches = M.patchesFor(d, before, 'pinion-radius');
    const next = apply(d, patches);
    const after = M.analyze(next, {});
    assert.equal(after.blocking, 0, 'modules agree once the pinions are resized');
    const compound = next.objects.find(o => o.type === 'compound');
    assert.ok(near(compound.smallRadius, 40), 'module 6.667 x 12 / 2');
    assert.ok(near(compound.radius, 128), 'module 7.111 x 36 / 2');
    for (const m of after.meshes) assert.ok(m.axialGap < 1e-6, m.wheelName + ' still touches');
  });

  test('resizing the pinions is flagged for driving the large section into a cap', () => {
    const d = C.starterMotorDrive();
    assert.equal(M.analyze(d, {}).clearances.length, 0, 'the drawn layout is clear');
    const patches = M.patchesFor(d, M.analyze(d, {}), 'pinion-radius');
    const after = M.analyze(apply(d, patches), {});
    const hit = after.clearances.find(c => c.sectionKind === 'large');
    assert.ok(hit, 'the grown large section now fouls a cap');
    assert.ok(hit.depth > 1, 'and by a real amount: ' + hit.depth);
  });

  test('putting motion in step leaves the ratios driving the preview', () => {
    const d = C.starterMotorDrive();
    const before = M.analyze(d, {});
    assert.equal(before.speedsInStep, false, 'the shipped preview speeds are hand-set');
    const next = apply(d, M.patchesFor(d, before, 'motion'));
    const after = M.analyze(next, {});
    assert.equal(after.speedsInStep, true);
    assert.equal(after.kinematics.disagreements, 0);
    const upper = next.objects.find(o => o.name.startsWith('Upper'));
    assert.ok(near(upper.speed, 4.5), '48 deg/s divided by 10.67');
  });

  test('an oblique shaft is reported rather than guessed at', () => {
    const d = C.starterMotorDrive();
    d.objects.find(o => o.type === 'compound').shaftTilt = 45;
    const r = M.analyze(d, {});
    assert.ok(r.meshes.every(m => m.unmeshed), 'no mesh is claimed');
    assert.equal(r.consistent, false);
    assert.equal(M.meshKind(45), 'oblique');
  });

  test('a design with no pinion still reports cleanly', () => {
    const d = C.starterMotorDrive();
    d.objects = d.objects.filter(o => o.type !== 'compound');
    const r = M.analyze(d, {});
    assert.equal(r.meshes.length, 2);
    assert.ok(r.meshes.every(m => m.unmeshed));
    assert.equal(r.kinematics.rings.length, 0);
    assert.equal(r.power.branches.length, 0);
    assert.equal(r.power.electricalTotal, 0);
  });

  test('an empty design does not throw', () => {
    for (const d of [{ objects: [], strokes: [] }, {}, null]) {
      const r = M.analyze(d, {});
      assert.equal(r.meshes.length, 0);
      assert.equal(r.consistent, false);
    }
  });

  test('settings are clamped to usable ranges', () => {
    const s = M.settings({ scale: -5, busVoltage: -1, torqueShare: 4, gearEfficiency: 9, shaftRpm: 'fast' });
    assert.ok(s.scale > 0);
    assert.equal(s.busVoltage, 0);
    assert.equal(s.torqueShare, 1);
    assert.equal(s.gearEfficiency, 1);
    assert.equal(s.shaftRpm, M.DEFAULTS.shaftRpm, 'a bad number falls back to the default');
  });

  test('repairs stay inside the file format limits', () => {
    const d = C.starterMotorDrive();
    // A cap big enough to demand more than 240 teeth must clamp, not fail.
    d.objects.find(o => o.name.startsWith('Upper')).capRadius = 3000;
    const compound = d.objects.find(o => o.type === 'compound');
    compound.x = 3000;
    const report = M.analyze(d, {});
    const next = apply(d, M.patchesFor(d, report, 'wheel-teeth'));
    assert.ok(next.objects.every(o => o.teeth <= 240 && o.teeth >= 6));
  });

  test('the hunting-ratio note fires on a shared factor', () => {
    const r = M.analyze(C.starterMotorDrive(), {});
    const note = meshOf(r, 'small').checks.find(c => c.id === 'hunting');
    assert.equal(note.ok, false, '96 and 12 share 12');
    assert.equal(note.severity, 'note', 'advisory only; it does not block');
    assert.equal(M.gcd(127, 12), 1);
  });
};
