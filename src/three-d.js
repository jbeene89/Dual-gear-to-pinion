/* Dependency-free 3D schematic mesh and orthographic camera. No contact solver.
 * World coordinates: rings lie in XY, height is Z. A compound's shaftYaw is
 * its heading in XY and shaftTilt its angle above XY. Both sections are normal
 * to the same shaft axis. Positive local rotation is clockwise when viewed
 * from the positive shaft end. All dimensions are schematic drawing units.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Gear3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RAD = Math.PI / 180, TAU = Math.PI * 2;
  const AXIAL = [0, 0, 1];
  const DEFAULT_CAMERA = Object.freeze({ yaw: -35, pitch: 55, roll: 0, zoom: 1, panX: 0, panY: 0 });
  const safe = (v, fallback, low = -1e6, high = 1e6) => typeof v === 'number' && Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : fallback;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const fmt = n => String(Math.round(n * 100) / 100);
  const color = (c, fallback = '#087F8C') => /^#[0-9a-f]{6}$/i.test(c || '') ? c : fallback;
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const mul = (a, s) => a.map(v => v * s);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const d = Math.hypot(...a) || 1; return mul(a, 1 / d); };
  function axisFromAngles(yaw = 180, tilt = 0) {
    const y = safe(yaw, 180) * RAD, t = safe(tilt, 0, -90, 90) * RAD;
    return norm([Math.cos(t) * Math.cos(y), Math.cos(t) * Math.sin(y), Math.sin(t)]);
  }
  function frame(axis) {
    const u = norm(cross(Math.abs(axis[2]) > .9 ? [0, 1, 0] : AXIAL, axis));
    return { axis, u, v: cross(axis, u) };
  }
  function planePoint(center, basis, x, y, depth = 0) {
    return add(center, add(add(mul(basis.u, x), mul(basis.v, y)), mul(basis.axis, depth)));
  }
  function cameraBasis(camera = {}) {
    const yaw = safe(camera.yaw, DEFAULT_CAMERA.yaw) * RAD;
    const pitch = safe(camera.pitch, DEFAULT_CAMERA.pitch, -89.5, 89.5) * RAD;
    const roll = safe(camera.roll, 0) * RAD;
    return { right: [-Math.sin(yaw), Math.cos(yaw), 0],
      up: [-Math.sin(pitch) * Math.cos(yaw), -Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch)],
      eye: [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)],
      cr: Math.cos(roll), sr: Math.sin(roll) };
  }
  function cameraPoint(point, basis) {
    const x = dot(point, basis.right), y = -dot(point, basis.up);
    return { x: x * basis.cr - y * basis.sr, y: x * basis.sr + y * basis.cr, z: dot(point, basis.eye) };
  }
  function project(point, camera = {}, viewport = {}) {
    const basis = cameraBasis(camera), p = cameraPoint(sub(point, viewport.center || [0, 0, 0]), basis);
    const scale = safe(viewport.scale, 1, .000001, 1e6) * safe(camera.zoom, 1, .01, 100);
    return { x: safe(viewport.width, 1000) / 2 + safe(camera.panX, 0) + p.x * scale,
      y: safe(viewport.height, 700) / 2 + safe(camera.panY, 0) + p.y * scale, z: p.z };
  }
  function shade(hex, normal, kind) {
    const light = [-.35, -.5, .79], incidence = Math.max(0, dot(norm(normal), light));
    const gain = kind === 'cap' ? .76 + .24 * incidence : .58 + .3 * incidence;
    return '#' + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * gain + (kind === 'cap' ? 19 : 5))).toString(16).padStart(2, '0')).join('');
  }
  function makeGeometry(design, options = {}) {
    const faces = [], lines = [], parts = [], annotations = [], angles = options.angles || {};
    const operatingMode = design?.operatingMode === 'generator' ? 'generator' : 'motor';
    let vertexCount = 0;
    function face(vertices, paint, id, kind, normal) {
      if (vertices.length < 3) return;
      const n = normal || cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0]));
      if (Math.hypot(...n) < .000001) return;
      faces.push({ vertices, color: color(paint), partId: id, kind, normal: norm(n) });
      vertexCount += vertices.length;
    }
    function disc(center, axis, radius, teeth, thickness, paint, id, angle, ring = null, component = null) {
      const firstFace = faces.length;
      const basis = frame(axis), d = Math.max(1, Math.min(10, radius * Math.PI / teeth * .62));
      const samples = teeth * 4, contour = [];
      const toothAngles = [-.5, -.2, .2, .5];
      for (let i = 0; i < samples; i++) {
        const tooth = Math.floor(i / 4), step = i % 4;
        const a = (tooth + toothAngles[step]) * TAU / teeth - angle * RAD;
        const tip = step === 1 || step === 2;
        let outerR = radius + (tip ? d : -d), innerR = 0;
        if (ring) {
          if (ring.internal) { outerR = radius + ring.band + d; innerR = radius + (tip ? -d : d); }
          else innerR = Math.max(radius * .12, radius - ring.band);
        }
        contour.push({ outer: [Math.cos(a) * outerR, Math.sin(a) * outerR],
          inner: [Math.cos(a) * innerR, Math.sin(a) * innerR] });
      }
      for (let i = 0; i < samples; i++) {
        const p = contour[i], q = contour[(i + 1) % samples];
        if (Math.hypot(p.outer[0] - q.outer[0], p.outer[1] - q.outer[1]) < .00001 &&
            Math.hypot(p.inner[0] - q.inner[0], p.inner[1] - q.inner[1]) < .00001) continue;
        const a = planePoint(center, basis, ...p.outer, thickness / 2), b = planePoint(center, basis, ...q.outer, thickness / 2);
        const c = planePoint(center, basis, ...q.inner, thickness / 2), d = planePoint(center, basis, ...p.inner, thickness / 2);
        const ab = add(a, mul(axis, -thickness)), bb = add(b, mul(axis, -thickness));
        const cb = add(c, mul(axis, -thickness)), db = add(d, mul(axis, -thickness));
        if (ring) {
          face([a, b, c, d], paint, id, 'cap', axis);
          face([db, cb, bb, ab], paint, id, 'cap', mul(axis, -1));
        } else {
          const bands = Math.min(16, Math.max(1, Math.ceil(radius / 18)));
          for (let j = 0; j < bands; j++) {
            const ro = 1 - j / bands, ri = 1 - (j + 1) / bands;
            const p = add(c, mul(sub(a, c), ro)), q = add(c, mul(sub(b, c), ro));
            const s = add(c, mul(sub(a, c), ri)), t = add(c, mul(sub(b, c), ri));
            const down = mul(axis, -thickness);
            face(ri ? [p, q, t, s] : [p, q, c], paint, id, 'cap', axis);
            face(ri ? [add(s, down), add(t, down), add(q, down), add(p, down)] : [add(c, down), add(q, down), add(p, down)], paint, id, 'cap', mul(axis, -1));
          }
        }
        face([a, ab, bb, b], paint, id, 'side');
        if (ring) face([d, c, cb, db], paint, id, 'side');
      }
      if (component) for (let i = firstFace; i < faces.length; i++) faces[i].component = component;
      return { center, normal: [...axis], radius, teeth, thickness };
    }
    function annulus(center, axis, outerRadius, innerRadius, thickness, paint, id, component) {
      const basis = frame(axis), count = 96, firstFace = faces.length;
      for (let i = 0; i < count; i++) {
        const a = i * TAU / count, b = (i + 1) * TAU / count;
        const oa = planePoint(center, basis, outerRadius * Math.cos(a), outerRadius * Math.sin(a), thickness / 2);
        const ob = planePoint(center, basis, outerRadius * Math.cos(b), outerRadius * Math.sin(b), thickness / 2);
        const ia = planePoint(center, basis, innerRadius * Math.cos(a), innerRadius * Math.sin(a), thickness / 2);
        const ib = planePoint(center, basis, innerRadius * Math.cos(b), innerRadius * Math.sin(b), thickness / 2);
        const down = mul(axis, -thickness), oad = add(oa, down), obd = add(ob, down), iad = add(ia, down), ibd = add(ib, down);
        // Broad cap plates need radial tiles for useful face-level painter
        // ordering around the motor bodies and the vertical pinion sections.
        const bands = component === 'cap' ? Math.min(24, Math.max(1, Math.ceil((outerRadius - innerRadius) / 20))) : 1;
        for (let j = 0; j < bands; j++) {
          const ro = outerRadius - (outerRadius - innerRadius) * j / bands, ri = outerRadius - (outerRadius - innerRadius) * (j + 1) / bands;
          const p = planePoint(center, basis, ro * Math.cos(a), ro * Math.sin(a), thickness / 2);
          const q = planePoint(center, basis, ro * Math.cos(b), ro * Math.sin(b), thickness / 2);
          const r = planePoint(center, basis, ri * Math.cos(b), ri * Math.sin(b), thickness / 2);
          const s = planePoint(center, basis, ri * Math.cos(a), ri * Math.sin(a), thickness / 2);
          face(ri ? [p, q, r, s] : [p, q, s], paint, id, 'cap', axis);
          face(ri ? [add(s, down), add(r, down), add(q, down), add(p, down)] : [add(s, down), add(q, down), add(p, down)], paint, id, 'cap', mul(axis, -1));
        }
        face([oa, oad, obd, ob], paint, id, 'side');
        if (innerRadius) face([ia, ib, ibd, iad], paint, id, 'side');
      }
      for (let i = firstFace; i < faces.length; i++) faces[i].component = component;
      return { center, normal: [...axis], outerRadius, innerRadius, thickness, bottom: center[2] - thickness / 2, top: center[2] + thickness / 2 };
    }
    function cylinder(start, end, radius, paint, id) {
      const axis = norm(sub(end, start)), basis = frame(axis), sides = 32;
      for (let i = 0; i < sides; i++) {
        const a = i * TAU / sides, b = (i + 1) * TAU / sides;
        const p = planePoint(start, basis, radius * Math.cos(a), radius * Math.sin(a));
        const q = planePoint(start, basis, radius * Math.cos(b), radius * Math.sin(b));
        const delta = sub(end, start), pe = add(p, delta), qe = add(q, delta);
        face([p, q, qe, pe], paint, id, 'shaft');
        face([start, q, p], paint, id, 'cap', mul(axis, -1));
        face([end, pe, qe], paint, id, 'cap', axis);
      }
    }
    function arrow(center, axis, radius, direction, paint, id, depth = 0) {
      if (direction === 'none') return;
      const basis = frame(axis), sign = direction === 'ccw' ? 1 : -1, start = direction === 'ccw' ? .2 : 2.8;
      const end = start + sign * 1.5, points = [];
      for (let i = 0; i <= 24; i++) {
        const a = start + (end - start) * i / 24;
        points.push(planePoint(center, basis, radius * Math.cos(a), radius * Math.sin(a), depth));
      }
      for (let i = 1; i < points.length; i++) lines.push({ points: [points[i - 1], points[i]], color: color(paint), width: 2.8, partId: id, kind: 'arrow' });
      const tip = [radius * Math.cos(end), radius * Math.sin(end)], tangent = [-sign * Math.sin(end), sign * Math.cos(end)];
      const size = Math.max(7, Math.min(12, radius * .18));
      const p = [tip[0] - tangent[0] * size - tangent[1] * size * .5, tip[1] - tangent[1] * size + tangent[0] * size * .5];
      const q = [tip[0] - tangent[0] * size + tangent[1] * size * .5, tip[1] - tangent[1] * size - tangent[0] * size * .5];
      faces.push({ vertices: [planePoint(center, basis, ...tip, depth), planePoint(center, basis, ...p, depth), planePoint(center, basis, ...q, depth)], color: color(paint), partId: id, kind: 'arrow', normal: axis });
    }
    for (const source of (Array.isArray(design?.objects) ? design.objects : []).slice(0, 200)) {
      const o = source || {}, id = String(o.id || ''), center = [safe(o.x, 0, -10000, 10000), safe(o.y, 0, -10000, 10000), safe(o.height, 0, -10000, 10000)];
      const radius = safe(o.radius, 80, 10, 2000), teeth = Math.round(safe(o.teeth, 32, 6, 240)), thickness = safe(o.thickness, 18, 1, 500);
      const paint = color(o.color), angle = safe(angles[id], safe(o.rotation, 0));
      const part = { id, type: o.type, center, axis: [...AXIAL], sections: [], direction: o.direction, name: String(o.name || 'Part'), showLabel: o.showLabel !== false };
      if (o.type === 'motor') {
        const motorBand = safe(o.motorBand, 35, 4, radius * .8), bore = radius - motorBand;
        const capRadius = safe(o.capRadius, Math.max(320, radius), radius, 3000), capThickness = safe(o.capThickness, 12, 2, 100);
        const capHole = safe(o.capHole, Math.min(80, bore), 0, bore), rimDepth = safe(o.rimDepth, Math.max(30, capThickness), capThickness, 1000);
        const rimWidth = safe(o.rimWidth, 14, 4, Math.min(100, capRadius - capHole));
        const capBottom = center[2] + thickness / 2, capTop = capBottom + capThickness;
        const statorInner = radius - motorBand * .55, rotorOuter = Math.max(bore + 1, statorInner - Math.min(1, motorBand * .05));
        const stator = annulus(center, AXIAL, radius, statorInner, thickness, color(o.motorColor, '#71818E'), id, 'stator');
        const rotor = annulus(center, AXIAL, rotorOuter, bore, thickness, color(o.rotorColor, '#137F86'), id, 'rotor');
        part.body = { center: [...center], outerRadius: radius, innerRadius: bore, thickness,
          bottom: center[2] - thickness / 2, top: capBottom, stationary: true, stator };
        part.rotor = { ...rotor, angle, stationary: false };
        part.cap = { ...annulus([center[0], center[1], capBottom + capThickness / 2], AXIAL,
          capRadius, capHole, capThickness, paint, id, 'cap'), angle, smoothPlate: true };
        const rimCenter = [center[0], center[1], capTop - rimDepth / 2];
        const rim = disc(rimCenter, AXIAL, capRadius, teeth, rimDepth, paint, id, angle,
          { internal: false, band: rimWidth }, 'rim');
        part.rim = { ...rim, outerRadius: capRadius, innerRadius: capRadius - rimWidth,
          depth: rimDepth, width: rimWidth, top: capTop, bottom: capTop - rimDepth, downturned: true };
        part.sections.push({ kind: 'geared-rim', ...rim });
        // Fine fixed casing marks distinguish the smooth stationary stator from
        // the moving rotor, cap, and rim. They are markings, not body teeth.
        for (let i = 0; i < 18; i++) {
          const a = i * TAU / 18, x = center[0] + (radius + .15) * Math.cos(a), y = center[1] + (radius + .15) * Math.sin(a);
          lines.push({ points: [[x, y, center[2] - thickness * .32], [x, y, center[2] + thickness * .32]],
            color: '#526A76', width: 1.1, partId: id, kind: 'body-mark', component: 'stator' });
        }
        const phase = -angle * RAD;
        for (let i = 0; i < 3; i++) {
          const a = phase + i * TAU / 3;
          lines.push({ points: [[center[0] + (bore + 2) * Math.cos(a), center[1] + (bore + 2) * Math.sin(a), center[2] - thickness / 2 - .3],
            [center[0] + (rotorOuter - 2) * Math.cos(a), center[1] + (rotorOuter - 2) * Math.sin(a), center[2] - thickness / 2 - .3]],
            color: '#C7E9E4', width: 2, partId: id, kind: 'rotor-mark', component: 'rotor' });
        }
        lines.push({ points: [[center[0] + (capRadius - rimWidth - 30) * Math.cos(phase), center[1] + (capRadius - rimWidth - 30) * Math.sin(phase), capTop + .4],
          [center[0] + (capRadius - rimWidth - 10) * Math.cos(phase), center[1] + (capRadius - rimWidth - 10) * Math.sin(phase), capTop + .4]],
          color: '#DDF1EE', width: 2.5, partId: id, kind: 'rotor-mark', component: 'cap' });
        arrow([center[0], center[1], capTop + 1], AXIAL, Math.max(capHole + 14, capRadius * .78), o.direction,
          o.arrowColor || paint, id, 1);
        // A second schematic arrow below and outside the skirt keeps the
        // direction readable from underneath, without reversing physical spin.
        arrow([center[0], center[1], capTop - rimDepth - 2], AXIAL, capRadius + 18,
          o.direction, o.arrowColor || paint, id);
      } else if (o.type === 'compound') {
        const axis = axisFromAngles(o.shaftYaw, o.shaftTilt), gap = safe(o.sectionGap, 120, 0, 4000), length = safe(o.shaftLength, 220, 10, 5000);
        const largeCenter = add(center, mul(axis, gap / 2)), smallCenter = add(center, mul(axis, -gap / 2));
        const smallRadius = safe(o.smallRadius, 30, 5, radius), smallTeeth = Math.round(safe(o.smallTeeth, 12, 6, 240));
        part.axis = axis;
        part.sections.push({ kind: 'large', ...disc(largeCenter, axis, radius, teeth, thickness, paint, id, angle) });
        part.sections.push({ kind: 'small', ...disc(smallCenter, axis, smallRadius, smallTeeth, thickness, color(o.smallColor, '#E08035'), id, angle) });
        const actualLength = Math.max(length, gap + thickness);
        const extension = safe(o.shaftExtension, 0, 0, 2000), workingEnd = o.shaftEnd === 'large' ? 'large' : 'small';
        const start = add(center, mul(axis, -(actualLength / 2 + (workingEnd === 'small' ? extension : 0))));
        const end = add(center, mul(axis, actualLength / 2 + (workingEnd === 'large' ? extension : 0)));
        const workingPoint = workingEnd === 'small' ? start : end, outwardDirection = mul(axis, workingEnd === 'small' ? -1 : 1);
        part.shaft = { start, end, center: mul(add(start, end), .5), radius: safe(o.shaftRadius, 10, 2, Math.max(2, smallRadius - 1)),
          baseLength: actualLength, length: actualLength + extension, extension, workingEnd, workingPoint: [...workingPoint] };
        cylinder(part.shaft.start, part.shaft.end, part.shaft.radius, '#718A96', id);
        const offset = mul(frame(axis).v, part.shaft.radius + 18);
        const outer = add(add(workingPoint, mul(outwardDirection, extension > 20 ? -8 : 74)), offset);
        const inner = add(outer, mul(outwardDirection, -(extension > 20 ? Math.min(120, extension - 16) : 60)));
        part.powerFlow = { mode: operatingMode, label: operatingMode === 'generator' ? 'INPUT' : 'OUTPUT',
          start: operatingMode === 'generator' ? outer : inner, end: operatingMode === 'generator' ? inner : outer,
          direction: mul(outwardDirection, operatingMode === 'generator' ? -1 : 1), outwardDirection,
          workingEnd, workingPoint: [...workingPoint] };
        lines.push({ points: [part.powerFlow.start, part.powerFlow.end], color: operatingMode === 'generator' ? '#9B6535' : '#176A84',
          width: 3, partId: id, kind: 'power-flow' });
        arrow(largeCenter, axis, radius * .68, o.direction, o.arrowColor || paint, id, thickness / 2 + 1.5);
        arrow(largeCenter, axis, radius * .68, o.direction, o.arrowColor || paint, id, -thickness / 2 - 1.5);
      } else if (o.type === 'gear' || o.type === 'ring') {
        const ring = o.type === 'ring' ? { internal: o.internal !== false, band: safe(o.band, 20, 4, Math.min(300, radius * .8)) } : null;
        part.sections.push({ kind: o.type, ...disc(center, AXIAL, radius, teeth, thickness, paint, id, angle, ring) });
        if (o.type === 'gear') cylinder(add(center, [0, 0, -thickness]), add(center, [0, 0, thickness]), Math.max(5, radius * .1), '#718A96', id);
        arrow(center, AXIAL, ring ? (ring.internal ? radius - 28 : Math.max(8, radius - ring.band - 15)) : radius * .65,
          o.direction, o.arrowColor || paint, id, thickness / 2 + 2);
      } else if (o.type === 'arrow') {
        arrow(center, AXIAL, radius, o.direction, o.arrowColor || paint, id, 2);
      } else if (o.type === 'text') {
        annotations.push({ center, text: String(o.text || ''), color: paint, fontSize: safe(o.fontSize, 18, 8, 120), partId: id });
        part.showLabel = false;
      }
      parts.push(part);
    }
    for (const s of (Array.isArray(design?.strokes) ? design.strokes : []).slice(0, 2000)) {
      if (!Array.isArray(s.points) || !s.points.length) continue;
      const stride = Math.max(1, Math.ceil(s.points.length / 1800)), points = [];
      for (let i = 0; i < s.points.length; i += stride) {
        const p = s.points[i]; if (Array.isArray(p)) points.push([safe(p[0], 0, -10000, 10000), safe(p[1], 0, -10000, 10000), 1]);
      }
      if (points.length === 1) points.push(add(points[0], [.01, 0, 0]));
      lines.push({ points, color: color(s.color, '#21333B'), width: safe(s.width, 3, .5, 100), kind: 'ink' });
    }
    return { faces, lines, parts, annotations, vertexCount, operatingMode };
  }
  function render(design, camera = {}, options = {}) {
    const width = safe(options.width, 1000, 100, 8000), height = safe(options.height, 700, 100, 8000);
    const bottomPadding = safe(options.bottomPadding, 80, 0, Math.max(0, height - 100)), sceneHeight = height - bottomPadding;
    const geometry = makeGeometry(design, options), basis = cameraBasis(camera);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, span = 100;
    const projectedFaces = geometry.faces.map(face => {
      const points = face.vertices.map(v => {
        const p = cameraPoint(v, basis);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, v[2]); span = Math.max(span, Math.abs(v[0]), Math.abs(v[1]));
        return p;
      });
      return { face, points, depth: points.reduce((sum, p) => sum + p.z, 0) / points.length };
    });
    const projectedLines = geometry.lines.map(line => {
      const points = line.points.map(v => { const p = cameraPoint(v, basis); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); return p; });
      return { line, points, depth: points.reduce((sum, p) => sum + p.z, 0) / points.length + .1 };
    });
    for (const a of geometry.annotations) { const p = cameraPoint(a.center, basis); minX = Math.min(minX, p.x - 90); maxX = Math.max(maxX, p.x + 90); minY = Math.min(minY, p.y - 30); maxY = Math.max(maxY, p.y + 30); }
    if (!Number.isFinite(minX)) { minX = -250; maxX = 250; minY = -150; maxY = 150; minZ = 0; }
    // Part labels stack in a band under the model, so the model is fitted to
    // what is left and lifted by half the band to stay centred in it.
    const labelRows = geometry.parts.filter(p => p.showLabel).length;
    const labelBand = Math.min(sceneHeight * .3, labelRows ? labelRows * 19 + 14 : 0);
    const fit = Math.min(Math.max(40, width - 120) / Math.max(100, maxX - minX), Math.max(40, sceneHeight - 120 - labelBand) / Math.max(100, maxY - minY));
    const scale = fit * safe(camera.zoom, 1, .01, 100), midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const panX = safe(camera.panX, 0), panY = safe(camera.panY, 0);
    const screen = p => ({ x: width / 2 + panX + (p.x - midX) * scale, y: sceneHeight / 2 - 10 - labelBand / 2 + panY + (p.y - midY) * scale, z: p.z });
    const pointString = points => points.map(p => { const s = screen(p); return fmt(s.x) + ',' + fmt(s.y); }).join(' ');
    let output = '<g class="scene3d-model" font-family="Inter,Segoe UI,Arial,sans-serif">';
    if (options.grid !== false) {
      const extent = Math.min(3000, Math.ceil(span / 100) * 100 + 80), floor = Number.isFinite(minZ) ? minZ - 4 : -12;
      const corners = [[-extent, -extent, floor], [extent, -extent, floor], [extent, extent, floor], [-extent, extent, floor]].map(v => cameraPoint(v, basis));
      output += '<polygon points="' + pointString(corners) + '" fill="#EFF5F3" fill-opacity=".75" pointer-events="none"/>';
      const step = Math.max(40, Math.ceil(extent / 12 / 20) * 20);
      for (let i = -extent; i <= extent; i += step) {
        for (const ends of [[[i, -extent, floor], [i, extent, floor]], [[-extent, i, floor], [extent, i, floor]]]) {
          output += '<polyline points="' + pointString(ends.map(v => cameraPoint(v, basis))) + '" fill="none" stroke="#DCE8E4" stroke-width=".7" pointer-events="none"/>';
        }
      }
    }
    const sorted = [...projectedFaces, ...projectedLines].sort((a, b) => a.depth - b.depth);
    const partBounds = new Map();
    for (const item of sorted) {
      if (item.face) {
        const f = item.face;
        // Backface culling is safe for opaque closed gear sections and reduces
        // the default three-part scene to roughly half its mesh faces.
        if (f.kind !== 'arrow' && dot(f.normal, basis.eye) < -.0001) continue;
        const selected = f.partId === options.selectedId, fill = f.kind === 'arrow' ? f.color : shade(f.color, f.normal, f.kind);
        output += '<polygon data-part-id="' + esc(f.partId) + '" points="' + pointString(item.points) + '" fill="' + fill + '" stroke="' + (selected ? '#44BEC0' : fill) + '" stroke-width="' + (selected ? '.42' : '.45') + '" stroke-linejoin="round"/>';
        for (const p of item.points) {
          const s = screen(p), b = partBounds.get(f.partId) || { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          b.minX = Math.min(b.minX, s.x); b.maxX = Math.max(b.maxX, s.x); b.minY = Math.min(b.minY, s.y); b.maxY = Math.max(b.maxY, s.y); partBounds.set(f.partId, b);
        }
      } else {
        const l = item.line;
        if (l.kind === 'power-flow') continue;
        output += '<polyline' + (l.partId ? ' data-part-id="' + esc(l.partId) + '"' : '') + ' points="' + pointString(item.points) + '" fill="none" stroke="' + l.color + '" stroke-width="' + fmt(l.kind === 'ink' ? Math.max(.6, l.width * scale) : l.width) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    }
    const placedLabels = [];
    // Straight-on views stack the parts, so a label hung under its own part
    // lands on another one. Anything that would cover a different part drops
    // below the whole model and keeps a leader line back to what it names.
    let modelBottom = -Infinity;
    for (const b of partBounds.values()) modelBottom = Math.max(modelBottom, b.maxY);
    const overlaps = (box, b, pad = 2) => box.left < b.maxX + pad && box.right > b.minX - pad
      && box.top < b.maxY + pad && box.bottom > b.minY - pad;
    const leaders = [];
    let labelOutput = '';
    for (const part of geometry.parts) {
      if (!part.showLabel) continue;
      const b = partBounds.get(part.id), p = screen(cameraPoint(part.center, basis));
      let x = b ? (b.minX + b.maxX) / 2 : p.x, y = b ? b.maxY + 23 : p.y + 30;
      const anchor = { x: b ? (b.minX + b.maxX) / 2 : p.x, y: b ? b.maxY : p.y };
      const nameMax = Math.max(12, Math.min(42, Math.floor((width - 50) / 7.1)));
      const name = part.name.length > nameMax ? part.name.slice(0, nameMax - 1) + '…' : part.name;
      const motorDirection = part.direction === 'ccw' ? 'CCW from above' : part.direction === 'cw' ? 'CW from above' : 'Stopped';
      const machineLabel = geometry.operatingMode === 'generator' ? 'Generator' : 'Motor';
      const subtitle = part.type === 'compound' ? 'SHAFT ' + part.powerFlow.label + ' · one shared shaft' : part.type === 'motor' ? machineLabel + ' · ' + motorDirection + ' · downturned rim ' + fmt(part.rim.depth) + ' deep' : part.type === 'ring' ? 'Ring plane XY' : '';
      const labelWidth = Math.max(name.length * 7.1, subtitle.length * 5.3), halfW = labelWidth / 2;
      x = Math.max(halfW + 12, Math.min(width - halfW - 12, x));
      const height = subtitle ? 20 : 4;
      const boxAt = at => ({ left: x - halfW, right: x + halfW, top: at - 13, bottom: at + height });
      for (const [id, bb] of partBounds) {
        if (id === part.id) continue;
        if (overlaps(boxAt(y), bb)) { y = modelBottom + 23; break; }
      }
      for (let attempt = 0; attempt < 16; attempt++) {
        const box = boxAt(y);
        const hit = placedLabels.find(other => box.left < other.right + 8 && box.right > other.left - 8
          && box.top < other.bottom + 6 && box.bottom > other.top - 6);
        if (!hit) break;
        y = hit.bottom + 13 + 6;
      }
      placedLabels.push(boxAt(y));
      if (y - 13 - anchor.y > 14) leaders.push({ x, y: y - 13, anchor, color: part.id === options.selectedId ? '#007E86' : '#AFC3CB' });
      labelOutput += '<g data-part-id="' + esc(part.id) + '" text-anchor="middle" paint-order="stroke" stroke="#F8FBF9" stroke-width="5" stroke-linejoin="round"><text x="' + fmt(x) + '" y="' + fmt(y) + '" fill="' + (part.id === options.selectedId ? '#007E86' : '#25424D') + '" font-size="13" font-weight="650">' + esc(name) + '</text>';
      if (subtitle) labelOutput += '<text x="' + fmt(x) + '" y="' + fmt(y + 16) + '" fill="#6B7F86" font-size="10">' + esc(subtitle) + '</text>';
      labelOutput += '</g>';
    }
    // Leaders go under the text so a line never crosses a glyph.
    for (const l of leaders) {
      output += '<path d="M' + fmt(l.anchor.x) + ' ' + fmt(l.anchor.y) + 'L' + fmt(l.anchor.x) + ' ' + fmt((l.anchor.y + l.y) / 2)
        + 'L' + fmt(l.x) + ' ' + fmt((l.anchor.y + l.y) / 2) + 'L' + fmt(l.x) + ' ' + fmt(l.y) + '" fill="none" stroke="'
        + l.color + '" stroke-width="1" stroke-dasharray="3 3" pointer-events="none"/>';
    }
    output += labelOutput;
    let labelFloor = placedLabels.reduce((low, b) => Math.max(low, b.bottom), modelBottom);
    for (const a of geometry.annotations) {
      const p = screen(cameraPoint(a.center, basis));
      output += '<text data-part-id="' + esc(a.partId) + '" x="' + fmt(p.x) + '" y="' + fmt(p.y) + '" fill="' + a.color + '" font-size="' + fmt(Math.min(48, Math.max(10, a.fontSize * Math.sqrt(scale)))) + '" text-anchor="middle" paint-order="stroke" stroke="#F8FBF9" stroke-width="4">' + esc(a.text) + '</text>';
    }
    for (const part of geometry.parts) {
      if (!part.powerFlow) continue;
      const flow = part.powerFlow, a = screen(cameraPoint(flow.start, basis)), b = screen(cameraPoint(flow.end, basis));
      const length = Math.hypot(b.x - a.x, b.y - a.y), dx = (b.x - a.x) / Math.max(.001, length), dy = (b.y - a.y) / Math.max(.001, length);
      const head = Math.min(10, Math.max(3, length * .28)), paint = flow.mode === 'generator' ? '#9B6535' : '#176A84';
      const wing1 = [b.x - dx * head - dy * head * .5, b.y - dy * head + dx * head * .5];
      const wing2 = [b.x - dx * head + dy * head * .5, b.y - dy * head - dx * head * .5];
      const tx = Math.max(75, Math.min(width - 75, (a.x + b.x) / 2));
      // Looking down the shaft foreshortens the arrow to a dot, and its text
      // would land on the model. Park it under the part labels instead.
      let ty = (a.y + b.y) / 2 - 15;
      if (length < 30) { labelFloor += 19; ty = labelFloor; }
      output += '<g class="shaft-power-flow" data-power-flow="' + flow.mode + '" data-part-id="' + esc(part.id) + '" fill="' + paint + '"><path d="M' + fmt(a.x) + ' ' + fmt(a.y) + 'L' + fmt(b.x) + ' ' + fmt(b.y) + '" fill="none" stroke="#F8FBF9" stroke-width="7" stroke-linecap="round"/><path d="M' + fmt(a.x) + ' ' + fmt(a.y) + 'L' + fmt(b.x) + ' ' + fmt(b.y) + '" fill="none" stroke="' + paint + '" stroke-width="3" stroke-linecap="round"/><polygon points="' + fmt(b.x) + ',' + fmt(b.y) + ' ' + wing1.map(fmt).join(',') + ' ' + wing2.map(fmt).join(',') + '"/><text x="' + fmt(tx) + '" y="' + fmt(ty) + '" font-size="11" font-weight="750" text-anchor="middle" paint-order="stroke" stroke="#F8FBF9" stroke-width="4">MECHANICAL ' + flow.label + '</text></g>';
    }
    output += '</g>';
    if (options.gizmo !== false) {
      const origin = { x: 55, y: height - 73 };
      output += '<g pointer-events="none" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="650">';
      for (const [axis, name, paint] of [[[1, 0, 0], 'X', '#CC7157'], [[0, 1, 0], 'Y', '#138B88'], [[0, 0, 1], 'Z', '#637DC0']]) {
        const p = cameraPoint(mul(axis, 27), basis);
        output += '<line x1="' + origin.x + '" y1="' + origin.y + '" x2="' + fmt(origin.x + p.x) + '" y2="' + fmt(origin.y + p.y) + '" stroke="' + paint + '" stroke-width="2" stroke-linecap="round"/><text x="' + fmt(origin.x + p.x * 1.35) + '" y="' + fmt(origin.y + p.y * 1.35 + 3) + '" fill="' + paint + '">' + name + '</text>';
      }
      output += '</g>';
    }
    if (options.overlayText !== false) output += '<text x="22" y="' + fmt(height - 18) + '" fill="#68808A" font-family="Segoe UI,Arial,sans-serif" font-size="11">3D orientation schematic — gear contact not validated; electrical performance unvalidated</text>';
    return output;
  }
  function exportSVG(design, camera = {}, options = {}) {
    const width = Math.round(safe(options.width, 1600, 300, 4096)), height = Math.round(safe(options.height, 1100, 300, 4096));
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><title>' + esc(design?.name || 'Soupy 3D gear schematic') + '</title><desc>One shared compound shaft with two gear sections. Orientation study only; gear contact and mechanical feasibility are not validated.</desc><rect width="100%" height="100%" fill="#F8FBF9"/>' + render(design, camera, { ...options, width, height, selectedId: null, overlayText: true }) + '</svg>';
  }
  return { render, exportSVG, makeGeometry, project, axisFromAngles, DEFAULT_CAMERA };
});

