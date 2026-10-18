/* First-order mesh, kinematic, and power analysis for Soupy Gear Studio.
 *
 * Scope. This module answers three questions the sketch alone cannot:
 *   1. Are the drawn radii and the drawn tooth counts describing the same
 *      gear pair? (Equal module is necessary for any real mesh.)
 *   2. Given one shaft speed, how fast and which way does each ring turn?
 *   3. For a chosen torque and speed, what power and bus current follow?
 *
 * It is a consistency and sizing aid, not a gear design program. It does not
 * generate tooth profiles and does not decide that a mechanism is buildable.
 * See docs/ANALYSIS-MODEL.md for the assumptions and what stays unsolved.
 *
 * Conventions match the renderer: rings turn about +Z and 'ccw' means
 * counterclockwise seen from +Z. A compound's shaft axis is the unit vector
 * from axisFromAngles(shaftYaw, shaftTilt), and 'ccw' means its angular
 * velocity points along +axis. Lengths are drawing units until multiplied by
 * `scale` (mm per drawing unit); angles are degrees; torque is N*m.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GearMechanics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RAD = Math.PI / 180;
  const num = (v, fallback, low = -1e9, high = 1e9) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;

  const DEFAULTS = Object.freeze({
    scale: 1,                 // mm per drawing unit
    shaftRpm: 300,            // mechanical input/output speed at the shaft
    shaftTorque: 100,         // N*m at the shaft
    torqueShare: 0.5,         // fraction of shaft torque carried by mesh 1
    gearEfficiency: 0.96,     // per mesh, each direction
    machineEfficiency: 0.90,  // electromechanical conversion in one machine
    converterEfficiency: 0.95,// drive or rectifier/controller stage
    busVoltage: 48            // shared DC bus
  });

  // Axial tolerances are a fraction of the pinion diameter, so a big slow
  // mesh is not judged by the same absolute gap as a small one.
  const AXIAL_TOLERANCE = 0.08;
  const MODULE_TOLERANCE = 0.005;   // 0.5 % counts as "the same module"
  const CENTRE_TOLERANCE = 0.01;

  const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { const t = b; b = a % b; a = t; } return a; };
  const rpmToRad = rpm => rpm * Math.PI / 30;
  const sign = v => (v < 0 ? -1 : 1);
  const settle = (v, places = 6) => { const f = Math.pow(10, places); return Math.round(v * f) / f; };

  function axisFromAngles(yaw, tilt) {
    const y = num(yaw, 180) * RAD, t = num(tilt, 0, -90, 90) * RAD;
    const a = [Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)];
    const d = Math.hypot(a[0], a[1], a[2]) || 1;
    return a.map(v => v / d);
  }

  /* ---- scene decomposition ------------------------------------------- */

  // A wheel is anything that turns about +Z and can carry a mesh: a motor's
  // geared cap, a ring, or a plain gear. Each reports the two axial surfaces
  // a radial pinion could meet and the radial band where material exists.
  function wheels(design) {
    const list = [];
    for (const o of (Array.isArray(design?.objects) ? design.objects : [])) {
      if (!o || !['motor', 'ring', 'gear'].includes(o.type)) continue;
      const radius = num(o.radius, 80, 1), thickness = num(o.thickness, 18, 0.1);
      const centre = [num(o.x, 0), num(o.y, 0)], height = num(o.height, 0);
      if (o.type === 'motor') {
        const capThickness = num(o.capThickness, 12, 0.1);
        const capRadius = num(o.capRadius, Math.max(320, radius), radius);
        const capHole = num(o.capHole, 80, 0);
        const rimDepth = num(o.rimDepth, Math.max(30, capThickness), capThickness);
        const rimWidth = num(o.rimWidth, 14, 0.1);
        const capBottom = height + thickness / 2, capTop = capBottom + capThickness;
        list.push({
          id: String(o.id || ''), name: String(o.name || 'Motor'), type: 'motor',
          centre, radius: capRadius, teeth: Math.round(num(o.teeth, 96, 1)),
          direction: o.direction, speed: num(o.speed, 0, 0),
          // Facing up: the cap's top plate surface. Facing down: the bottom
          // edge of the downturned toothed rim.
          up: { z: capTop, inner: capHole, outer: capRadius, surface: 'cap top plate' },
          down: { z: capTop - rimDepth, inner: capRadius - rimWidth, outer: capRadius, surface: 'downturned rim edge' }
        });
      } else {
        const band = o.type === 'ring' ? num(o.band, 20, 0.1) : radius;
        list.push({
          id: String(o.id || ''), name: String(o.name || (o.type === 'ring' ? 'Ring' : 'Gear')), type: o.type,
          centre, radius, teeth: Math.round(num(o.teeth, 32, 1)),
          direction: o.direction, speed: num(o.speed, 0, 0),
          internal: o.type === 'ring' ? o.internal !== false : false,
          up: { z: height + thickness / 2, inner: Math.max(0, radius - band), outer: radius, surface: 'upper face' },
          down: { z: height - thickness / 2, inner: Math.max(0, radius - band), outer: radius, surface: 'lower face' }
        });
      }
    }
    return list;
  }

  function pinions(design) {
    const list = [];
    for (const o of (Array.isArray(design?.objects) ? design.objects : [])) {
      if (!o || o.type !== 'compound') continue;
      const axis = axisFromAngles(o.shaftYaw, o.shaftTilt);
      const centre = [num(o.x, 0), num(o.y, 0), num(o.height, 0)];
      const gap = num(o.sectionGap, 120, 0), radius = num(o.radius, 90, 1);
      const smallRadius = num(o.smallRadius, 30, 1);
      const at = s => centre.map((v, i) => v + axis[i] * s);
      list.push({
        id: String(o.id || ''), name: String(o.name || 'Compound pinion'),
        axis, tilt: num(o.shaftTilt, 90, -90, 90), centre,
        direction: o.direction, speed: num(o.speed, 0, 0),
        thickness: num(o.thickness, 18, 0.1),
        sections: [
          { kind: 'large', radius, teeth: Math.round(num(o.teeth, 36, 1)), centre: at(gap / 2) },
          { kind: 'small', radius: smallRadius, teeth: Math.round(num(o.smallTeeth, 12, 1)), centre: at(-gap / 2) }
        ]
      });
    }
    return list;
  }

  /* ---- mesh detection and checking ----------------------------------- */

  // Two configurations are modelled. A radial shaft (tilt near 0) puts the
  // pinion axis in the ring plane, intersecting the ring axis at 90 degrees:
  // a crown/face-gear arrangement, where the pinion rolls on an axial face of
  // the wheel. A shaft parallel to the ring axis (tilt near 90) is an ordinary
  // parallel-axis spur mesh. Anything between is reported, not modelled.
  function meshKind(tilt) {
    const t = Math.abs(tilt);
    if (t <= 15) return 'right-angle';
    if (t >= 75) return 'parallel';
    return 'oblique';
  }

  function candidate(wheel, pinion, section) {
    const dx = section.centre[0] - wheel.centre[0], dy = section.centre[1] - wheel.centre[1];
    const distance = Math.hypot(dx, dy);
    const kind = meshKind(pinion.tilt);
    if (kind === 'oblique') return null;

    if (kind === 'parallel') {
      // Axes both along Z. Contact is where the pitch circles touch.
      const internal = wheel.internal === true;
      const ideal = internal ? wheel.radius - section.radius : wheel.radius + section.radius;
      return {
        kind, wheel, pinion, section, internal,
        contactRadius: wheel.radius, centreDistance: distance, idealCentreDistance: ideal,
        centreError: distance - ideal,
        axialGap: 0, face: 'flank', surface: internal ? 'internal flank' : 'external flank',
        // External pairs counter-rotate; a pinion inside a ring co-rotates.
        directionFactor: internal ? 1 : -1
      };
    }

    // Right-angle: the pinion's pitch cylinder touches an axial face of the
    // wheel along the line directly above or below the shaft axis.
    const top = section.centre[2] + section.radius, bottom = section.centre[2] - section.radius;
    const options = [
      { face: 'pinion-top', z: top, plane: wheel.down, s: 1 },
      { face: 'pinion-bottom', z: bottom, plane: wheel.up, s: -1 }
    ].map(c => ({ ...c, gap: Math.abs(c.plane.z - c.z) }));
    const best = options.sort((a, b) => a.gap - b.gap)[0];
    if (!distance) return null;

    // sigma: does the shaft axis point away from or toward the wheel centre
    // at this section? It flips the sense of the driven wheel.
    const sigma = sign(pinion.axis[0] * (dx / distance) + pinion.axis[1] * (dy / distance));
    return {
      kind, wheel, pinion, section, internal: false,
      contactRadius: distance, centreDistance: distance,
      idealCentreDistance: null, centreError: null,
      axialGap: best.gap, face: best.face, surface: best.plane.surface,
      band: { inner: best.plane.inner, outer: best.plane.outer },
      directionFactor: -sigma * best.s
    };
  }

  function describeMesh(c, scale) {
    const { wheel, pinion, section } = c;
    const r = section.radius, R = c.contactRadius;
    const zp = section.teeth, zw = wheel.teeth;
    const modulePinion = 2 * r / zp;
    const moduleWheel = 2 * R / zw;
    const ratioGeometric = R / r;          // g = shaft rpm / wheel rpm
    const ratioTeeth = zw / zp;
    const moduleError = (moduleWheel - modulePinion) / modulePinion;

    // Two ways to make the pair consistent, both reported so the choice stays
    // with the designer: keep the drawn sizes and restate the tooth counts, or
    // keep the tooth counts and restate the pinion's radius.
    const exactWheelTeeth = 2 * R / modulePinion;
    const wheelTeeth = Math.max(6, Math.min(240, Math.round(exactWheelTeeth)));
    const radiusForTeeth = moduleWheel * zp / 2;
    const contactForTeeth = modulePinion * zw / 2;

    const axialTolerance = Math.max(1, AXIAL_TOLERANCE * 2 * r);
    const bandOk = c.band ? R >= c.band.inner - r * 0.5 && R <= c.band.outer + r * 0.5 : true;

    const checks = [];
    const moduleOk = Math.abs(moduleError) <= MODULE_TOLERANCE;
    checks.push({
      id: 'module', ok: moduleOk, severity: 'blocking',
      label: 'Equal module',
      detail: moduleOk
        ? 'Both members state module ' + fixed(modulePinion * scale, 3) + ' mm.'
        : 'Pinion module ' + fixed(modulePinion * scale, 3) + ' mm against ' + fixed(moduleWheel * scale, 3)
          + ' mm on the ' + wheelWord(wheel) + ' — ' + percent(moduleError) + ' apart. Teeth this far out of step cannot mesh.'
    });
    if (c.kind === 'right-angle') {
      const axialOk = c.axialGap <= axialTolerance;
      checks.push({
        id: 'axial', ok: axialOk, severity: 'advisory',
        label: 'Faces meet',
        detail: axialOk
          ? 'The ' + c.surface + ' sits at the ' + c.face.replace('pinion-', '') + ' of the pinion, within ' + fixed(c.axialGap, 1) + ' units.'
          : 'A ' + fixed(c.axialGap, 1) + '-unit gap between the ' + c.surface + ' and the ' + c.face.replace('pinion-', '') + ' of the pinion. Nothing touches.'
      });
      checks.push({
        id: 'band', ok: bandOk, severity: 'advisory',
        label: 'Contact lands on the toothed band',
        detail: bandOk
          ? 'Contact radius ' + fixed(R, 1) + ' falls on the ' + c.surface + ' (' + fixed(c.band ? c.band.inner : 0, 0) + '–' + fixed(c.band ? c.band.outer : R, 0) + ').'
          : 'Contact radius ' + fixed(R, 1) + ' is off the toothed band (' + fixed(c.band.inner, 0) + '–' + fixed(c.band.outer, 0) + ').'
      });
    } else {
      const centreOk = Math.abs(c.centreError) <= Math.max(0.5, CENTRE_TOLERANCE * c.idealCentreDistance);
      checks.push({
        id: 'centre', ok: centreOk, severity: 'blocking',
        label: 'Centre distance',
        detail: centreOk
          ? 'Centres are ' + fixed(c.centreDistance, 1) + ' apart, as the pitch circles require.'
          : 'Centres are ' + fixed(c.centreDistance, 1) + ' apart; the pitch circles need ' + fixed(c.idealCentreDistance, 1)
            + ' (' + (c.centreError > 0 ? 'too far by ' : 'overlapping by ') + fixed(Math.abs(c.centreError), 1) + ').'
      });
    }
    const teethShare = gcd(zw, zp);
    checks.push({
      id: 'hunting', ok: teethShare === 1, severity: 'note',
      label: 'Hunting tooth ratio',
      detail: teethShare === 1
        ? 'No common factor, so every pinion tooth eventually meets every wheel tooth and wear spreads evenly.'
        : zw + ' and ' + zp + ' share a factor of ' + teethShare + ', so the same teeth keep re-meeting. Changing one count by a tooth spreads the wear.'
    });

    return {
      key: wheel.id + ':' + section.kind,
      kind: c.kind, face: c.face, surface: c.surface,
      wheelId: wheel.id, wheelName: wheel.name, wheelType: wheel.type,
      pinionId: pinion.id, pinionName: pinion.name, sectionKind: section.kind,
      contactRadius: R, pinionRadius: r, wheelTeethNow: zw, pinionTeeth: zp,
      centreDistance: c.centreDistance, idealCentreDistance: c.idealCentreDistance, centreError: c.centreError,
      axialGap: c.axialGap, band: c.band || null,
      modulePinion, moduleWheel, moduleError,
      modulePinionMm: modulePinion * scale, moduleWheelMm: moduleWheel * scale,
      ratioGeometric, ratioTeeth,
      ratioError: (ratioTeeth - ratioGeometric) / ratioGeometric,
      directionFactor: c.directionFactor,
      consistent: Math.abs(moduleError) <= MODULE_TOLERANCE,
      suggestion: {
        wheelTeeth, exactWheelTeeth,
        wheelTeethClamped: wheelTeeth !== Math.round(exactWheelTeeth),
        wheelTeethResidual: wheelTeeth - exactWheelTeeth,
        ratioAfterWheelTeeth: wheelTeeth / zp,
        radiusForTeeth, contactForTeeth
      },
      checks
    };
  }

  const wheelWord = w => (w.type === 'motor' ? 'cap' : w.type);
  function fixed(v, places) {
    if (!Number.isFinite(v)) return '—';
    return (Math.round(v * Math.pow(10, places)) / Math.pow(10, places)).toFixed(places).replace(/\.?0+$/, m => (m.includes('.') ? '' : m));
  }
  function percent(fraction) {
    const v = Math.abs(fraction) * 100;
    return (v < 0.1 ? '<0.1' : fixed(v, v < 10 ? 1 : 0)) + '%';
  }

  function findMeshes(design, scale) {
    const result = [];
    const pinionList = pinions(design), wheelList = wheels(design);
    for (const wheel of wheelList) {
      let best = null;
      for (const pinion of pinionList) {
        for (const section of pinion.sections) {
          const c = candidate(wheel, pinion, section);
          if (!c) continue;
          // Prefer the pairing that actually comes closest to touching; for
          // parallel axes that is the smallest centre-distance error.
          const score = c.kind === 'parallel' ? Math.abs(c.centreError) : c.axialGap;
          if (!best || score < best.score) best = { c, score };
        }
      }
      if (best) result.push(describeMesh(best.c, scale));
      else result.push({
        key: wheel.id + ':none', unmeshed: true, wheelId: wheel.id, wheelName: wheel.name,
        wheelType: wheel.type, checks: [{ id: 'pair', ok: false, severity: 'advisory', label: 'No pinion found',
          detail: pinionList.length ? 'The shaft is oblique to the ring axis, which this model does not cover.' : 'Add a compound pinion to form a mesh.' }]
      });
    }
    return result;
  }

  /* ---- clearance ------------------------------------------------------
   * A pinion section is a disc standing on edge. Swept about nothing, it
   * simply occupies a Z band as tall as its diameter and a radial band from
   * the shaft's distance out to the corner of the disc. Where that volume
   * overlaps solid metal on a wheel it is not meshing with, the parts collide.
   */
  function solids(design) {
    const list = [];
    for (const o of (Array.isArray(design?.objects) ? design.objects : [])) {
      if (!o || !['motor', 'ring', 'gear'].includes(o.type)) continue;
      const centre = [num(o.x, 0), num(o.y, 0)], height = num(o.height, 0);
      const radius = num(o.radius, 80, 1), thickness = num(o.thickness, 18, 0.1);
      const id = String(o.id || ''), name = String(o.name || 'Part');
      if (o.type === 'motor') {
        const capThickness = num(o.capThickness, 12, 0.1);
        const capRadius = num(o.capRadius, Math.max(320, radius), radius);
        const capHole = num(o.capHole, 80, 0);
        const rimDepth = num(o.rimDepth, Math.max(30, capThickness), capThickness);
        const rimWidth = num(o.rimWidth, 14, 0.1);
        const bore = radius - num(o.motorBand, 35, 0.1);
        const capBottom = height + thickness / 2, capTop = capBottom + capThickness;
        list.push({ id, name, piece: 'motor body', inner: bore, outer: radius, bottom: height - thickness / 2, top: capBottom });
        list.push({ id, name, piece: 'cap plate', inner: capHole, outer: capRadius, bottom: capBottom, top: capTop });
        list.push({ id, name, piece: 'downturned rim', inner: capRadius - rimWidth, outer: capRadius, bottom: capTop - rimDepth, top: capTop });
      } else {
        const band = o.type === 'ring' ? num(o.band, 20, 0.1) : radius;
        list.push({ id, name, piece: o.type, inner: Math.max(0, radius - band), outer: radius,
          bottom: height - thickness / 2, top: height + thickness / 2 });
      }
    }
    return list;
  }

  function clearances(design, meshList) {
    const paired = new Set(meshList.filter(m => !m.unmeshed).map(m => m.wheelId + '|' + m.pinionId + '|' + m.sectionKind));
    const hits = [];
    const body = solids(design);
    for (const pinion of pinions(design)) {
      for (const section of pinion.sections) {
        const r = section.radius, half = pinion.thickness / 2;
        const zLow = section.centre[2] - r, zHigh = section.centre[2] + r;
        for (const piece of body) {
          const wheel = (design.objects || []).find(o => String(o.id) === piece.id) || {};
          const d = Math.hypot(section.centre[0] - num(wheel.x, 0), section.centre[1] - num(wheel.y, 0));
          const radialLow = Math.max(0, d - half), radialHigh = Math.hypot(d, r) + half;
          const zOverlap = Math.min(zHigh, piece.top) - Math.max(zLow, piece.bottom);
          const radialOverlap = Math.min(radialHigh, piece.outer) - Math.max(radialLow, piece.inner);
          if (zOverlap <= 0 || radialOverlap <= 0) continue;
          // The meshing pair is meant to touch; only count depth past a graze.
          const isMesh = paired.has(piece.id + '|' + pinion.id + '|' + section.kind);
          const depth = Math.min(zOverlap, radialOverlap);
          if (isMesh && depth <= Math.max(1, r * 0.05)) continue;
          hits.push({
            pinionId: pinion.id, sectionKind: section.kind, wheelId: piece.id,
            wheelName: piece.name, piece: piece.piece, depth,
            detail: 'The ' + section.kind + ' pinion section passes through the ' + piece.name
              + ' ' + piece.piece + ' by about ' + fixed(depth, 1) + ' units.'
          });
        }
      }
    }
    return hits.sort((a, b) => b.depth - a.depth);
  }

  /* ---- kinematics ----------------------------------------------------- */

  const dirSign = d => (d === 'ccw' ? 1 : d === 'cw' ? -1 : 0);
  const signName = s => (s > 0 ? 'ccw' : s < 0 ? 'cw' : 'none');

  function kinematics(design, meshList, shaftRpm) {
    const pinionList = pinions(design);
    const shaft = pinionList[0] || null;
    const shaftSign = shaft ? dirSign(shaft.direction) || -1 : -1;
    const rings = [];
    for (const m of meshList) {
      if (m.unmeshed) continue;
      // Speed follows the drawn sizes, which are what the geometry check is
      // reconciling the tooth counts against.
      const rpm = shaftRpm / m.ratioGeometric;
      const derived = shaftSign * m.directionFactor;
      const wheel = wheels(design).find(w => w.id === m.wheelId);
      const declared = dirSign(wheel ? wheel.direction : 'none');
      rings.push({
        meshKey: m.key, wheelId: m.wheelId, name: m.wheelName,
        rpm, ratio: m.ratioGeometric,
        derivedDirection: signName(derived),
        declaredDirection: wheel ? wheel.direction : 'none',
        agrees: declared === 0 ? null : declared === derived,
        // Preview speed the renderer should use to stay in step with the shaft.
        previewSpeed: shaft ? Math.abs(shaft.speed) / m.ratioGeometric : 0
      });
    }
    const senses = rings.map(r => r.derivedDirection).filter(d => d !== 'none');
    return {
      shaftId: shaft ? shaft.id : null,
      shaftName: shaft ? shaft.name : null,
      shaftRpm, shaftDirection: signName(shaftSign),
      shaftTilt: shaft ? shaft.tilt : null,
      rings,
      counterRotating: senses.length > 1 && new Set(senses).size > 1,
      disagreements: rings.filter(r => r.agrees === false).length
    };
  }

  /* ---- power ---------------------------------------------------------- */

  // Generator: mechanical power enters the shaft, divides between the meshes
  // by the chosen torque share, loses a gear stage, then a machine and a
  // converter stage on the way to the bus.
  // Motor: the same chain read backwards, so the ring torque each machine must
  // supply for a wanted shaft torque comes out directly.
  function power(design, meshList, kin, s) {
    const mode = design?.operatingMode === 'generator' ? 'generator' : 'motor';
    const live = meshList.filter(m => !m.unmeshed);
    const shares = live.map((m, i) => (live.length === 1 ? 1 : i === 0 ? s.torqueShare : (1 - s.torqueShare) / Math.max(1, live.length - 1)));
    const shaftPower = s.shaftTorque * rpmToRad(s.shaftRpm);
    const chain = s.gearEfficiency * s.machineEfficiency * s.converterEfficiency;

    const branches = live.map((m, i) => {
      const share = shares[i];
      const ring = kin.rings.find(r => r.meshKey === m.key) || { rpm: 0 };
      const shaftTorque = share * s.shaftTorque;
      const ringRpm = ring.rpm;
      // g = shaft rpm / ring rpm, so ring torque scales up by g.
      const ringTorque = mode === 'generator'
        ? shaftTorque * s.gearEfficiency * m.ratioGeometric
        : shaftTorque * m.ratioGeometric / s.gearEfficiency;
      const ringPower = Math.abs(ringTorque * rpmToRad(ringRpm));
      const electrical = mode === 'generator'
        ? ringPower * s.machineEfficiency * s.converterEfficiency
        : ringPower / (s.machineEfficiency * s.converterEfficiency);
      return {
        key: m.key, name: m.wheelName, share,
        ratio: m.ratioGeometric, ringRpm, ringTorque,
        shaftTorque, mechanicalPower: ringPower,
        electricalPower: electrical,
        busCurrent: s.busVoltage > 0 ? electrical / s.busVoltage : 0
      };
    });

    const electricalTotal = branches.reduce((sum, b) => sum + b.electricalPower, 0);
    return {
      mode, shaftPower, chainEfficiency: chain,
      shaftTorque: s.shaftTorque, shaftRpm: s.shaftRpm,
      branches,
      electricalTotal,
      busCurrentTotal: s.busVoltage > 0 ? electricalTotal / s.busVoltage : 0,
      overall: mode === 'generator'
        ? (shaftPower > 0 ? electricalTotal / shaftPower : 0)
        : (electricalTotal > 0 ? shaftPower / electricalTotal : 0)
    };
  }

  /* ---- public entry point --------------------------------------------- */

  function settings(raw = {}) {
    const s = {
      scale: num(raw.scale, DEFAULTS.scale, 0.001, 1000),
      shaftRpm: num(raw.shaftRpm, DEFAULTS.shaftRpm, 0, 100000),
      shaftTorque: num(raw.shaftTorque, DEFAULTS.shaftTorque, 0, 1e7),
      torqueShare: num(raw.torqueShare, DEFAULTS.torqueShare, 0, 1),
      gearEfficiency: num(raw.gearEfficiency, DEFAULTS.gearEfficiency, 0.1, 1),
      machineEfficiency: num(raw.machineEfficiency, DEFAULTS.machineEfficiency, 0.1, 1),
      converterEfficiency: num(raw.converterEfficiency, DEFAULTS.converterEfficiency, 0.1, 1),
      busVoltage: num(raw.busVoltage, DEFAULTS.busVoltage, 0, 100000)
    };
    return s;
  }

  function analyze(design, raw = {}) {
    const s = settings(raw);
    const meshList = findMeshes(design, s.scale);
    const kin = kinematics(design, meshList, s.shaftRpm);
    const pwr = power(design, meshList, kin, s);
    const collisions = clearances(design, meshList);
    const blocking = meshList.reduce((n, m) => n + (m.checks || []).filter(c => !c.ok && c.severity === 'blocking').length, 0);
    const advisories = meshList.reduce((n, m) => n + (m.checks || []).filter(c => !c.ok && c.severity === 'advisory').length, 0)
      + collisions.length;
    return {
      settings: s, meshes: meshList, kinematics: kin, power: pwr, clearances: collisions,
      blocking, advisories,
      // A design is "consistent" only in the narrow sense checked here.
      consistent: blocking === 0 && meshList.some(m => !m.unmeshed),
      speedsInStep: kin.rings.every(r => {
        const wheel = wheels(design).find(w => w.id === r.wheelId);
        return wheel ? Math.abs(wheel.speed - r.previewSpeed) <= 0.05 + r.previewSpeed * 0.01 : true;
      })
    };
  }

  /* ---- repairs --------------------------------------------------------
   * Each returns a list of {id, set} patches rather than touching the design,
   * so the editor can fold them into one undo step and validate as usual.
   */
  function fixWheelTeeth(design, report) {
    const patches = [];
    for (const m of report.meshes) {
      if (m.unmeshed || m.consistent) continue;
      patches.push({ id: m.wheelId, set: { teeth: m.suggestion.wheelTeeth },
        note: m.wheelName + ': ' + m.wheelTeethNow + ' → ' + m.suggestion.wheelTeeth + ' teeth' });
    }
    return patches;
  }

  function fixPinionRadius(design, report) {
    const byPinion = new Map();
    for (const m of report.meshes) {
      if (m.unmeshed || m.consistent) continue;
      const entry = byPinion.get(m.pinionId) || {};
      entry[m.sectionKind === 'small' ? 'smallRadius' : 'radius'] = m.suggestion.radiusForTeeth;
      entry._notes = (entry._notes || []).concat(m.sectionKind + ' section → radius ' + fixed(m.suggestion.radiusForTeeth, 1));
      byPinion.set(m.pinionId, entry);
    }
    const patches = [], newRadius = new Map();
    for (const [id, entry] of byPinion) {
      const notes = entry._notes; delete entry._notes;
      const o = (design.objects || []).find(x => x.id === id) || {};
      const set = {};
      // Keep the editor's own bounds: a small section stays inside the large
      // one, and the shaft stays inside the small section.
      if (entry.radius !== undefined) set.radius = Math.max(10, Math.min(2000, entry.radius));
      if (entry.smallRadius !== undefined) set.smallRadius = Math.max(5, entry.smallRadius);
      const large = set.radius !== undefined ? set.radius : num(o.radius, 90);
      if (set.smallRadius !== undefined) set.smallRadius = Math.min(set.smallRadius, large - 1);
      const small = set.smallRadius !== undefined ? set.smallRadius : num(o.smallRadius, 30);
      if (num(o.shaftRadius, 10) > small - 1) set.shaftRadius = Math.max(2, small - 1);
      newRadius.set(id + ':large', large);
      newRadius.set(id + ':small', small);
      patches.push({ id, set, note: (o.name || 'Compound') + ': ' + notes.join(', ') });
    }

    // Growing a pinion moves the face it rolls on, so the wheel has to follow
    // or the pair stops touching. A cap above the pinion keeps its body where
    // it is and lengthens its skirt; a cap below the pinion drops bodily.
    for (const m of report.meshes) {
      if (m.unmeshed || m.consistent || m.kind !== 'right-angle') continue;
      const r = newRadius.get(m.pinionId + ':' + m.sectionKind);
      if (r === undefined) continue;
      const pinion = (design.objects || []).find(x => x.id === m.pinionId) || {};
      const wheel = (design.objects || []).find(x => x.id === m.wheelId) || {};
      if (wheel.type !== 'motor') continue;
      const shaftZ = num(pinion.height, 0), thickness = num(wheel.thickness, 40);
      const capThickness = num(wheel.capThickness, 12);
      const capTop = num(wheel.height, 0) + thickness / 2 + capThickness;
      const set = {};
      if (m.face === 'pinion-top') {
        const depth = capTop - (shaftZ + r);
        if (depth >= capThickness && depth <= 1000) set.rimDepth = Math.round(depth * 100) / 100;
      } else {
        set.height = Math.round((shaftZ - r - thickness / 2 - capThickness) * 100) / 100;
      }
      if (!Object.keys(set).length) continue;
      const existing = patches.find(p => p.id === m.wheelId);
      const note = (wheel.name || 'Wheel') + ': re-seated to keep the faces touching';
      if (existing) Object.assign(existing.set, set);
      else patches.push({ id: m.wheelId, set, note });
    }
    return patches;
  }

  function fixMotion(design, report) {
    const patches = [];
    for (const r of report.kinematics.rings) {
      const set = {};
      if (r.agrees === false) set.direction = r.derivedDirection;
      const speed = Math.max(0, Math.min(180, Math.round(r.previewSpeed * 100) / 100));
      set.speed = speed;
      patches.push({ id: r.wheelId, set,
        note: r.name + ': ' + (set.direction ? set.direction.toUpperCase() + ', ' : '') + speed + '°/s' });
    }
    return patches;
  }

  const FIXES = {
    'wheel-teeth': { label: 'Match tooth counts to the drawn sizes', build: fixWheelTeeth },
    'pinion-radius': { label: 'Match pinion sizes to the tooth counts', build: fixPinionRadius },
    'motion': { label: 'Put rotation and preview speed in step', build: fixMotion }
  };

  function patchesFor(design, report, fixId) {
    const fix = FIXES[fixId];
    if (!fix) throw new Error('Unknown repair: ' + fixId);
    return fix.build(design, report);
  }

  return { DEFAULTS, FIXES, analyze, settings, patchesFor, findMeshes, kinematics, power,
    wheels, pinions, axisFromAngles, meshKind, gcd, fixed, percent, settle };
});
