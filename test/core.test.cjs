'use strict';
/* Guards on the file format and the starter geometry the analysis relies on. */
const C = require('../src/core.js');

module.exports = ({ test, assert }) => {
  const starters = {
    starter: C.starter, starter3D: C.starter3D, starterCappedMotors: C.starterCappedMotors,
    starterOpposedCaps: C.starterOpposedCaps, starterMotorDrive: C.starterMotorDrive,
    starterGeneratorDrive: C.starterGeneratorDrive
  };

  test('every starter survives its own import rules', () => {
    for (const [name, make] of Object.entries(starters)) {
      const design = make();
      const round = C.validateDesign(JSON.parse(JSON.stringify(design)));
      assert.equal(round.objects.length, design.objects.length, name);
      assert.equal(round.version, 1, name);
    }
  });

  test('the capped-motor starter keeps its documented placement', () => {
    const d = C.starterMotorDrive();
    const upper = d.objects.find(o => o.name.startsWith('Upper'));
    const lower = d.objects.find(o => o.name.startsWith('Lower'));
    const compound = d.objects.find(o => o.type === 'compound');
    assert.equal(upper.height, 100);
    assert.equal(upper.capRadius, 320);
    assert.equal(upper.rimDepth, 92);
    assert.equal(lower.height, -112);
    assert.equal(lower.capRadius, 270);
    assert.equal(lower.rimDepth, 20);
    assert.equal(compound.x, 288);
    assert.equal(compound.sectionGap, 64);
    assert.equal(compound.height, 10);
    assert.equal(compound.shaftTilt, 0);
    assert.equal(compound.shaftExtension, 120);
  });

  test('generator mode changes power flow, not rotation', () => {
    const motor = C.starterMotorDrive(), gen = C.starterGeneratorDrive();
    assert.equal(motor.operatingMode, 'motor');
    assert.equal(gen.operatingMode, 'generator');
    for (const role of ['outer-ring', 'inner-ring']) {
      const a = motor.objects.find(o => o.role === role), b = gen.objects.find(o => o.role === role);
      assert.equal(a.direction, b.direction, role + ' keeps its spin');
    }
  });

  test('a file missing the newer fields still loads', () => {
    const legacy = { version: 1, name: 'Old', strokes: [],
      objects: [{ type: 'compound', x: 10, y: 0, radius: 90, teeth: 36 }] };
    const out = C.validateDesign(legacy);
    assert.equal(out.operatingMode, 'motor', 'defaults to motor drive');
    assert.equal(out.objects[0].shaftTilt, 90, 'legacy compounds stay axial');
    assert.equal(out.objects[0].shaftExtension, 0);
  });

  test('bad files are rejected before the open design changes', () => {
    const bad = [
      { version: 2, objects: [], strokes: [] },
      { version: 1, objects: [{ type: 'rocket' }], strokes: [] },
      { version: 1, objects: [{ type: 'gear', teeth: 2 }], strokes: [] },
      { version: 1, objects: [{ type: 'gear', color: 'red' }], strokes: [] },
      { version: 1, objects: [], strokes: [], operatingMode: 'turbine' },
      { version: 1, objects: [{ type: 'gear', id: 'a' }, { type: 'gear', id: 'a' }], strokes: [] }
    ];
    for (const raw of bad) assert.throws(() => C.validateDesign(raw), /Cannot load design/);
  });

  test('an SVG export carries the schematic disclaimer', () => {
    const svg = C.exportSVG(C.starterGeneratorDrive());
    assert.ok(svg.startsWith('<?xml'));
    assert.ok(/not validated|schematic/i.test(svg));
    assert.ok(!/<script/i.test(svg), 'no scripts in an export');
  });
};
