/* Soupy Gear Studio geometry and portable file format. No dependencies.
 * Geometry is schematic: radius is a nominal reference pitch radius. Tooth
 * silhouettes are decorative and are not involutes or a meshing calculation.
 * File v1: name <=120 chars; <=200 objects; <=2000 strokes; <=200000 points.
 * Coordinates +/-10000; radius 10..2000; teeth integer 6..240; speed 0..180
 * degrees/second; colors #RRGGBB; rotation normalized to [0,360). Optional
 * v1 camera and 3D placement fields are backward compatible. Missing legacy
 * compound orientation stays parallel to the ring axis (shaftTilt 90), while
 * newly created compounds use a radial shaft (shaftTilt 0). Unknown
 * properties are discarded. No HTML, external references, or scripts load.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GearCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const COLORS = { teal: '#087F8C', orange: '#E08035', purple: '#7762C4', ink: '#21333B' };
  const TYPES = ['gear', 'ring', 'motor', 'compound', 'arrow', 'text'];
  function defaultCamera() { return { yaw: -35, pitch: 55, roll: 0, zoom: 1, panX: 0, panY: 0 }; }
  let sequence = 0;
  function uid() {
    sequence += 1;
    return 'g-' + Date.now().toString(36) + '-' + sequence.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function escape(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  }
  function n(value) { return String(Math.round(value * 1000) / 1000); }
  function createObject(type, x = 0, y = 0) {
    if (!TYPES.includes(type)) throw new Error('Unknown object type: ' + type);
    const names = { gear: 'Gear', ring: 'Ring', motor: 'Frameless motor + cap', compound: 'Compound pinion', arrow: 'Direction arrow', text: 'Note' };
    const o = { id: uid(), type, name: names[type], x, y, radius: 80, rotation: 0,
      color: COLORS.teal, arrowColor: COLORS.ink, direction: 'cw', teeth: 32,
      showLabel: true, locked: false, speed: 24, height: 0, thickness: 18 };
    if (type === 'ring') Object.assign(o, { radius: 140, teeth: 56, internal: true, band: 20 });
    if (type === 'motor') Object.assign(o, { radius: 240, teeth: 96, thickness: 40,
      motorBand: 35, capRadius: 320, capThickness: 12, capHole: 80,
      rimDepth: 30, rimWidth: 14, motorColor: '#71818E', rotorColor: '#137F86' });
    if (type === 'compound') Object.assign(o, { radius: 90, smallRadius: 30, teeth: 36, smallTeeth: 12,
      color: COLORS.purple, smallColor: COLORS.orange, shaftRadius: 10,
      height: 90, shaftYaw: 180, shaftTilt: 0, sectionGap: 120, shaftLength: 220, shaftExtension: 0, shaftEnd: 'small' });
    if (type === 'arrow') Object.assign(o, { radius: 50, showLabel: false, arrowColor: COLORS.orange });
    if (type === 'text') Object.assign(o, { text: 'Your note', fontSize: 18, direction: 'none', showLabel: false, radius: 60 });
    return o;
  }
  function starter() {
    const outer = Object.assign(createObject('ring', 0, 0), { name: 'Outer ring', role: 'outer-ring',
      radius: 240, teeth: 96, internal: true, band: 22, color: COLORS.teal, arrowColor: COLORS.teal, speed: 6 });
    const inner = Object.assign(createObject('ring', 0, 0), { name: 'Inner ring', role: 'inner-ring',
      radius: 120, teeth: 48, internal: false, band: 22, color: COLORS.orange, arrowColor: COLORS.orange, direction: 'ccw', speed: 36 });
    const compound = Object.assign(createObject('compound', 210, 0), { name: 'Compound pinion / output', role: 'compound-pinion', speed: 48,
      arrowColor: COLORS.purple, height: 0, shaftTilt: 90 });
    return { version: 1, name: 'Twin-ring concept', objects: [outer, inner, compound], strokes: [], notes: true, camera: defaultCamera(), operatingMode: 'motor' };
  }
  function starter3D() {
    const design = starter();
    design.name = 'Twin-ring radial concept';
    design.objects.find(o => o.role === 'outer-ring').height = 60;
    Object.assign(design.objects.find(o => o.type === 'compound'), {
      x: 180, y: 0, height: 90, shaftYaw: 180, shaftTilt: 0,
      sectionGap: 120, shaftLength: 220
    });
    return design;
  }
  function starterCappedMotors() {
    const upper = Object.assign(createObject('motor', 0, 0), {
      name: 'Higher motor + large cap', role: 'outer-ring', radius: 240,
      motorBand: 40, height: 70, thickness: 40, capRadius: 320,
      capThickness: 12, capHole: 90, rimDepth: 62, rimWidth: 14, color: COLORS.teal, arrowColor: COLORS.teal,
      teeth: 96, direction: 'cw', speed: 6
    });
    const lower = Object.assign(createObject('motor', 0, 0), {
      name: 'Lower motor + cap', role: 'inner-ring', radius: 150,
      motorBand: 32, height: 10, thickness: 40, capRadius: 270,
      capThickness: 12, capHole: 70, rimDepth: 20, rimWidth: 14, color: COLORS.orange, arrowColor: COLORS.orange,
      rotorColor: '#BA6F32', teeth: 72, direction: 'ccw', speed: 24
    });
    const compound = Object.assign(createObject('compound', 288, 0), {
      name: 'Outside compound pinion / output', role: 'compound-pinion',
      height: 10, shaftYaw: 180, shaftTilt: 0, sectionGap: 64,
      shaftLength: 90, thickness: 18, radius: 90, teeth: 36,
      smallRadius: 30, smallTeeth: 12, speed: 48, arrowColor: COLORS.purple
    });
    return { version: 1, name: 'Frameless motors with geared caps', objects: [upper, lower, compound], strokes: [], notes: true, camera: defaultCamera(), operatingMode: 'motor' };
  }
  function starterOpposedCaps() {
    const design = starterCappedMotors();
    design.name = 'Top and bottom pinion drive';
    design.camera = { ...defaultCamera(), pitch: 18 };
    Object.assign(design.objects.find(o => o.role === 'outer-ring'), {
      name: 'Upper cap / small pinion top', height: 100, rimDepth: 92
    });
    Object.assign(design.objects.find(o => o.role === 'inner-ring'), {
      name: 'Lower cap / large pinion bottom', height: -112
    });
    // Nominal schematic edge placement only: the upper skirt tip is Z40,
    // above the small section, and the lower cap top is Z-80, below the large
    // section. Tooth geometry, clearances, and contact remain unvalidated.
    return design;
  }
  function starterMotorDrive() {
    const design = starterOpposedCaps();
    design.name = 'Top and bottom motor drive';
    design.operatingMode = 'motor';
    Object.assign(design.objects.find(o => o.type === 'compound'), {
      name: 'Compound pinion / shared shaft', shaftExtension: 120, shaftEnd: 'small'
    });
    design.objects.find(o => o.role === 'outer-ring').name = 'Upper ring / small pinion top';
    design.objects.find(o => o.role === 'inner-ring').name = 'Lower ring / large pinion bottom';
    return design;
  }
  function starterGeneratorDrive() {
    const design = starterMotorDrive();
    design.name = 'Top and bottom generator drive';
    design.operatingMode = 'generator';
    return design;
  }
  function shaftProjection(o) {
    const yaw = (o.shaftYaw ?? 180) * Math.PI / 180, tilt = (o.shaftTilt ?? 90) * Math.PI / 180;
    const axis = [Math.cos(yaw) * Math.cos(tilt), Math.sin(yaw) * Math.cos(tilt)];
    const length = Math.max(o.shaftLength ?? 220, (o.sectionGap ?? 120) + (o.thickness ?? 18));
    const extension = o.shaftExtension ?? 0, end = o.shaftEnd === 'large' ? 'large' : 'small';
    const start = axis.map(v => -v * (length / 2 + (end === 'small' ? extension : 0)));
    const finish = axis.map(v => v * (length / 2 + (end === 'large' ? extension : 0)));
    return { start, end: finish, workingPoint: end === 'small' ? start : finish, axis, extension };
  }
  function toothDepth(r, teeth) { return Math.max(1.4, Math.min(10, r * Math.PI / teeth * 0.62)); }
  function toothPath(r, teeth, internal) {
    const d = toothDepth(r, teeth), rootR = r + (internal ? d : -d), tipR = r + (internal ? -d : d);
    let path = '';
    for (let i = 0; i < teeth; i++) {
      const positions = [[-.5, rootR], [-.28, rootR], [-.17, tipR], [.17, tipR], [.28, rootR]];
      for (const [a, radius] of positions) {
        const angle = (i + a) / teeth * TAU;
        path += (path ? 'L' : 'M') + n(Math.cos(angle) * radius) + ' ' + n(Math.sin(angle) * radius);
      }
    }
    return path + 'Z';
  }
  function circlePath(r) { return 'M' + n(r) + ' 0A' + n(r) + ' ' + n(r) + ' 0 1 0 ' + n(-r) + ' 0A' + n(r) + ' ' + n(r) + ' 0 1 0 ' + n(r) + ' 0Z'; }
  function pitch(r, color) { return '<circle r="' + n(r) + '" fill="none" stroke="' + escape(color) + '" stroke-opacity=".42" stroke-width="1" stroke-dasharray="3 5" pointer-events="none"/>'; }
  function marker(r, color) { return '<line x1="0" y1="' + n(-r * .82) + '" x2="0" y2="' + n(-r * .64) + '" stroke="' + escape(color) + '" stroke-width="3" stroke-linecap="round" pointer-events="none"/>'; }
  function rotationArrow(radius, direction, color, thick = 3) {
    if (direction === 'none') return '';
    const r = Math.max(8, radius), cw = direction === 'cw';
    // SVG y grows downward, so a positive sweep is clockwise on screen.
    const start = cw ? -Math.PI * .92 : -Math.PI * .14;
    const end = cw ? -Math.PI * .14 : -Math.PI * .92;
    const sx = r * Math.cos(start), sy = r * Math.sin(start);
    const ex = r * Math.cos(end), ey = r * Math.sin(end);
    const tx = (cw ? -1 : 1) * Math.sin(end), ty = (cw ? 1 : -1) * Math.cos(end);
    const h = Math.max(6, Math.min(12, r * .17)), w = h * .54;
    const ax = ex - tx * h - ty * w, ay = ey - ty * h + tx * w;
    const bx = ex - tx * h + ty * w, by = ey - ty * h - tx * w;
    return '<g class="rotation-arrow" data-direction="' + direction + '" pointer-events="none"><path d="M' + n(sx) + ' ' + n(sy) + 'A' + n(r) + ' ' + n(r) + ' 0 0 ' + (cw ? 1 : 0) + ' ' + n(ex) + ' ' + n(ey) + '" fill="none" stroke="' + escape(color) + '" stroke-width="' + thick + '" stroke-linecap="round"/><path d="M' + n(ex) + ' ' + n(ey) + 'L' + n(ax) + ' ' + n(ay) + 'L' + n(bx) + ' ' + n(by) + 'Z" fill="' + escape(color) + '"/></g>';
  }
  function visualRadius(o) {
    if (o.type === 'motor') return o.capRadius + toothDepth(o.capRadius, o.teeth);
    return o.radius + (o.type === 'ring' && o.internal ? o.band : 0) + (['gear', 'ring', 'compound'].includes(o.type) ? toothDepth(o.radius, o.teeth) : 0);
  }
  function labelDetails(o, operatingMode = 'motor') {
    if (o.type === 'motor') return (operatingMode === 'generator' ? 'Generator · ' : 'Motor · ') + o.teeth + 'T · ' + (o.direction === 'ccw' ? 'CCW from above' : o.direction === 'cw' ? 'CW from above' : 'Stopped') + ' · downturned rim shown in 3D';
    if (o.type === 'ring') return o.teeth + ' teeth · ' + (o.internal ? 'internal' : 'external');
    if (o.type === 'compound') return o.teeth + 'T rear + ' + o.smallTeeth + 'T front · one shaft';
    if (o.type === 'gear') return o.teeth + ' teeth · schematic';
    return '';
  }
  function objectMarkup(o, options = {}) {
    const selected = !!options.selected && !options.exporting;
    const angle = Number.isFinite(options.angle) ? options.angle : o.rotation;
    const r = o.radius, c = escape(o.color), v = visualRadius(o);
    let shape = '', body = '';
    if (o.type === 'motor') {
      const bore = r - o.motorBand;
      body = '<g class="motor-body"><path d="' + circlePath(r) + circlePath(bore) + '" fill="' + escape(o.motorColor) + '" fill-opacity=".28" fill-rule="evenodd" stroke="' + escape(o.motorColor) + '" stroke-width="2"/>';
      for (let i = 0; i < 18; i++) body += '<line transform="rotate(' + i * 20 + ')" x1="' + n(bore + o.motorBand * .48) + '" x2="' + n(r - o.motorBand * .1) + '" y1="0" y2="0" stroke="' + escape(o.motorColor) + '" stroke-width="' + n(Math.max(2, o.motorBand * .18)) + '"/>';
      body += '<circle r="' + n(bore + o.motorBand * .2) + '" fill="none" stroke="' + escape(o.rotorColor) + '" stroke-width="' + n(o.motorBand * .28) + '"/></g>';
      shape = '<path class="motor-cap" d="' + toothPath(o.capRadius, o.teeth, false) + (o.capHole ? circlePath(o.capHole) : '') + '" fill="' + c + '" fill-opacity=".15" fill-rule="evenodd" stroke="' + c + '" stroke-width="2.2"/>' + pitch(o.capRadius, o.color) + marker(o.capRadius, o.color);
    } else if (o.type === 'ring') {
      const outline = o.internal ? circlePath(v) + toothPath(r, o.teeth, true)
        : toothPath(r, o.teeth, false) + circlePath(Math.max(r * .14, r - o.band));
      shape = '<path d="' + outline + '" fill="' + c + '" fill-opacity=".16" fill-rule="evenodd" stroke="' + c + '" stroke-width="2.2"/>' + pitch(r, o.color) + marker(r, o.color);
    } else if (o.type === 'gear' || o.type === 'compound') {
      const compound = o.type === 'compound';
      if (compound && (o.shaftExtension || 0) > 0) {
        const shaft = shaftProjection(o);
        body += '<line class="extended-shaft" x1="' + n(shaft.start[0]) + '" y1="' + n(shaft.start[1]) + '" x2="' + n(shaft.end[0]) + '" y2="' + n(shaft.end[1]) + '" stroke="#718A96" stroke-width="' + n(o.shaftRadius * 2) + '" stroke-linecap="round"/>';
      }
      shape = '<path d="' + toothPath(r, o.teeth, false) + '" fill="' + c + '" fill-opacity="' + (compound ? '.13' : '.2') + '" stroke="' + c + '" stroke-width="2.2"' + (compound ? ' stroke-dasharray="5 3"' : '') + '/>' + pitch(r, o.color);
      for (let i = 0; i < 3; i++) shape += '<line transform="rotate(' + i * 120 + ')" x1="0" y1="' + n(-r * .19) + '" x2="0" y2="' + n(-r * .7) + '" stroke="' + c + '" stroke-opacity=".3" stroke-width="' + n(Math.max(3, r * .05)) + '" stroke-linecap="round"/>';
      shape += marker(r, o.color);
      if (compound) shape += '<path d="' + toothPath(o.smallRadius, o.smallTeeth, false) + '" fill="' + escape(o.smallColor) + '" fill-opacity=".85" stroke="' + escape(o.smallColor) + '" stroke-width="2.2"/>' + pitch(o.smallRadius, '#FFFFFF');
      const shaft = compound ? o.shaftRadius : Math.max(5, r * .12);
      shape += '<circle r="' + n(shaft) + '" fill="#FCFCF8" stroke="#35464E" stroke-width="2.2"/><line x1="' + n(-shaft * .5) + '" x2="' + n(shaft * .5) + '" y1="0" y2="0" stroke="#35464E" stroke-width="1.3"/><line x1="0" x2="0" y1="' + n(-shaft * .5) + '" y2="' + n(shaft * .5) + '" stroke="#35464E" stroke-width="1.3"/>';
    } else if (o.type === 'arrow') {
      shape = '<circle r="' + n(r + 7) + '" fill="transparent" stroke="transparent" stroke-width="12"/>' + rotationArrow(r, o.direction, o.arrowColor, 5);
    } else if (o.type === 'text') {
      const lines = String(o.text).split('\n');
      shape = '<text fill="' + c + '" font-size="' + n(o.fontSize) + '" font-weight="500" text-anchor="middle">' + lines.map((line, i) => '<tspan x="0" dy="' + (i ? n(o.fontSize * 1.35) : '0') + '">' + escape(line || ' ') + '</tspan>').join('') + '</text>';
    }
    let fixed = '';
    if (o.type === 'compound' && (o.shaftExtension || 0) > 0) {
      const shaft = shaftProjection(o), mode = options.operatingMode === 'generator' ? 'INPUT' : 'OUTPUT';
      fixed += '<text class="shaft-power-label" x="' + n(shaft.workingPoint[0]) + '" y="' + n(shaft.workingPoint[1] - o.shaftRadius - 14) + '" fill="#244C59" font-size="11" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#FBFCF9" stroke-width="4">SHAFT ' + mode + '</text>';
    }
    if (!['arrow', 'text'].includes(o.type)) {
      fixed += rotationArrow(o.type === 'motor' ? o.capRadius * .78 : o.type === 'ring' ? (o.internal ? r - 29 : Math.max(14, r - o.band - 17)) : r * .56, o.direction, o.arrowColor);
    }
    if (o.showLabel && o.type !== 'text') {
      const y = v + 25;
      fixed += '<g class="object-label" pointer-events="none" text-anchor="middle" paint-order="stroke" stroke="#FBFCF9" stroke-width="5" stroke-linejoin="round"><text y="' + n(y) + '" fill="#253941" font-size="13" font-weight="650">' + escape(o.name) + '</text>';
      const detail = labelDetails(o, options.operatingMode);
      if (detail) fixed += '<text y="' + n(y + 18) + '" fill="#67767D" font-size="10.5" font-weight="450">' + escape(detail) + '</text>';
      fixed += '</g>';
    }
    if (selected) {
      const sx = r + 16, ry = -v - 38;
      const hs = Number.isFinite(options.handleScale) && options.handleScale > 0 ? options.handleScale : 1;
      fixed += '<g class="selection-controls"><circle r="' + n(v + 9) + '" fill="none" stroke="#008C92" stroke-width="1.4" stroke-dasharray="5 5" pointer-events="none"/><line x1="0" y1="' + n(-v - 9) + '" x2="0" y2="' + n(ry) + '" stroke="#008C92" stroke-width="1.5" pointer-events="none"/><circle data-handle="resize" cx="' + n(sx) + '" cy="0" r="' + n(18 * hs) + '" fill="transparent" style="cursor:ew-resize"/><rect data-handle="resize" x="' + n(sx - 8 * hs) + '" y="' + n(-8 * hs) + '" width="' + n(16 * hs) + '" height="' + n(16 * hs) + '" rx="' + n(2 * hs) + '" fill="#FFFFFF" stroke="#008C92" stroke-width="' + n(2.4 * hs) + '" style="cursor:ew-resize"/><circle data-handle="rotate" cx="0" cy="' + n(ry) + '" r="' + n(18 * hs) + '" fill="transparent" style="cursor:grab"/><circle data-handle="rotate" cx="0" cy="' + n(ry) + '" r="' + n(8 * hs) + '" fill="#008C92" stroke="#FFFFFF" stroke-width="' + n(2.4 * hs) + '" style="cursor:grab"/></g>';
    }
    return '<g data-id="' + escape(o.id) + '" data-type="' + escape(o.type) + '" class="gear-object' + (selected ? ' is-selected' : '') + '" transform="translate(' + n(o.x) + ' ' + n(o.y) + ')" font-family="Inter, Segoe UI, Arial, sans-serif">' + body + '<g class="object-geometry" transform="rotate(' + n(angle) + ')">' + shape + '</g>' + fixed + '</g>';
  }
  function strokeMarkup(s) {
    if (!s.points.length) return '';
    const d = s.points.map((p, i) => (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1])).join(' ');
    if (s.points.length === 1) return '<circle data-stroke-id="' + escape(s.id) + '" cx="' + n(s.points[0][0]) + '" cy="' + n(s.points[0][1]) + '" r="' + n(s.width / 2) + '" fill="' + escape(s.color) + '"/>';
    return '<path data-stroke-id="' + escape(s.id) + '" d="' + d + '" fill="none" stroke="' + escape(s.color) + '" stroke-width="' + n(s.width) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function plainBounds(design) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const include = (x1, y1, x2, y2) => { minX = Math.min(minX, x1); minY = Math.min(minY, y1); maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2); };
    for (const o of design.objects) {
      const r = visualRadius(o) + 5;
      if (o.type === 'text') {
        const lines = o.text.split('\n'), textW = Math.max(1, ...lines.map(s => s.length)) * o.fontSize * .75;
        const textH = o.fontSize * (lines.length * 1.35 + .4);
        const reach = Math.hypot(textW / 2, textH);
        include(o.x - reach, o.y - reach, o.x + reach, o.y + reach);
      } else {
        include(o.x - r, o.y - r, o.x + r, o.y + r);
        if (o.type === 'compound' && (o.shaftExtension || 0) > 0) {
          const shaft = shaftProjection(o);
          for (const p of [shaft.start, shaft.end]) include(o.x + p[0] - o.shaftRadius, o.y + p[1] - o.shaftRadius, o.x + p[0] + o.shaftRadius, o.y + p[1] + o.shaftRadius);
          const p = shaft.workingPoint;
          include(o.x + p[0] - 55, o.y + p[1] - o.shaftRadius - 30, o.x + p[0] + 55, o.y + p[1] - o.shaftRadius);
        }
        if (o.showLabel) {
          const halfW = Math.max(o.name.length * 4.6, labelDetails(o, design.operatingMode).length * 3.8, 35);
          include(o.x - halfW, o.y + r + 7, o.x + halfW, o.y + r + 44);
        }
      }
    }
    for (const s of design.strokes) for (const p of s.points) include(p[0] - s.width / 2, p[1] - s.width / 2, p[0] + s.width / 2, p[1] + s.width / 2);
    if (!Number.isFinite(minX)) return { x: -240, y: -180, width: 480, height: 360 };
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }
  function noteBox(design, options = {}) {
    const b = plainBounds(design);
    if (options.compactNotes) return { x: b.x + (b.width - 286) / 2 + 16, y: b.y + b.height + 50, width: 270, height: 258 };
    return { x: b.x + b.width + 44, y: b.y + 26, width: 270, height: 258 };
  }
  function noteMarkup(design, options = {}) {
    if (!design.notes) return '';
    const b = noteBox(design, options), x = b.x, y = b.y;
    const cappedMotors = design.objects.some(o => o.type === 'motor');
    const generator = design.operatingMode === 'generator';
    const rows = cappedMotors ? [
      [0, 'DESIGN INTENT', '#526A73', 10, 700],
      [29, generator ? 'One input. Two generators.' : 'Two motors. One output.', '#233A44', 18, 650],
      [59, generator ? 'Small pinion section → upper cap' : 'Higher geared cap → small section', COLORS.teal, 12, 600],
      [80, generator ? 'Large pinion section → lower cap' : 'Lower geared cap → large section', COLORS.orange, 12, 600],
      [111, generator ? 'Shaft drives both generator rotors.' : 'Gear caps attach to rotating motor rings.', '#63767E', 11, 450],
      [129, 'Downturned tooth rims shown in 3D.', '#63767E', 11, 450],
      [147, generator ? 'External shaft supplies mechanical power.' : 'Pinion shaft stays outside motor bodies.', '#63767E', 11, 450],
      [183, 'SCHEMATIC GEOMETRY', '#A36320', 10, 700],
      [202, generator ? 'Mechanical/electrical performance' : 'Cap and rim dimensions are editable.', '#63767E', 11, 450],
      [220, generator ? 'and gear contact are unvalidated.' : 'Profiles and meshing not validated.', '#63767E', 11, 450]
    ] : [
      [0, 'DESIGN INTENT', '#526A73', 10, 700],
      [29, generator ? 'One input. Two generators.' : 'Two rings. One output.', '#233A44', 18, 650],
      [59, generator ? 'Small pinion section → outer ring' : 'Outer ring → small pinion section', COLORS.teal, 12, 600],
      [80, generator ? 'Large pinion section → inner ring' : 'Inner ring → large pinion section', COLORS.orange, 12, 600],
      [111, 'Large section: rear axial plane', '#63767E', 11, 450],
      [129, 'Small section: front axial plane', '#63767E', 11, 450],
      [147, 'Both sections share one shaft.', '#63767E', 11, 450],
      [183, 'SCHEMATIC GEOMETRY', '#A36320', 10, 700],
      [202, 'Stylized teeth · nominal pitch radii', '#63767E', 11, 450],
      [220, 'Meshing and mechanics not validated.', '#63767E', 11, 450]
    ];
    return '<g class="schematic-notes" pointer-events="none" font-family="Inter, Segoe UI, Arial, sans-serif"><rect x="' + n(x - 16) + '" y="' + n(y - 20) + '" width="286" height="258" rx="12" fill="#FFFFFF" fill-opacity=".94" stroke="#D9E2E1"/>' + rows.map(([dy, t, c, size, weight]) => '<text x="' + n(x) + '" y="' + n(y + dy) + '" fill="' + c + '" font-size="' + size + '" font-weight="' + weight + '">' + escape(t) + '</text>').join('') + '</g>';
  }
  function sceneMarkup(design, options = {}) {
    const angles = options.angles || {};
    return design.objects.map(o => objectMarkup(o, { selected: options.selectedId === o.id,
      angle: Object.prototype.hasOwnProperty.call(angles, o.id) ? angles[o.id] : o.rotation,
      exporting: options.exporting, handleScale: options.handleScale, operatingMode: design.operatingMode })).join('') + design.strokes.map(strokeMarkup).join('') + noteMarkup(design, options);
  }
  function bounds(design, options = {}) {
    const b = plainBounds(design);
    if (!design.notes) return b;
    const nb = noteBox(design, options), x = Math.min(b.x, nb.x - 16), y = Math.min(b.y, nb.y - 20);
    return { x, y, width: Math.max(b.x + b.width, nb.x + nb.width) - x,
      height: Math.max(b.y + b.height, nb.y + nb.height - 20) - y };
  }
  function exportSVG(design) {
    const safe = validateDesign(design), b = bounds(safe), pad = 40;
    const x = b.x - pad, y = b.y - pad;
    const width = Math.max(620, b.width + pad * 2), height = Math.max(200, b.height + pad * 2 + 42);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + n(width) + '" height="' + n(height) + '" viewBox="' + n(x) + ' ' + n(y) + ' ' + n(width) + ' ' + n(height) + '" role="img" aria-label="' + escape(safe.name) + '"><title>' + escape(safe.name) + '</title><desc>Soupy Gear Studio schematic. Gear meshing and mechanical behavior have not been validated.</desc><rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(width) + '" height="' + n(height) + '" fill="#FBFCF9"/>' + sceneMarkup(safe, { exporting: true }) + '<text x="' + n(x + 20) + '" y="' + n(y + height - 20) + '" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#66767B">Schematic only • Gear meshing not validated</text></svg>';
  }
  function validateDesign(raw) {
    const fail = message => { throw new Error('Cannot load design: ' + message); };
    const record = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(label + ' must be an object.'); return v; };
    const num = (v, fallback, min, max, label, integer) => {
      if (v === undefined) return fallback;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) fail(label + ' must be ' + (integer ? 'an integer' : 'a number') + ' from ' + min + ' to ' + max + '.');
      return v;
    };
    const str = (v, fallback, max, label) => {
      if (v === undefined) return fallback;
      if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) fail(label + ' must be text of at most ' + max + ' characters.');
      return v;
    };
    const bool = (v, fallback, label) => { if (v === undefined) return fallback; if (typeof v !== 'boolean') fail(label + ' must be true or false.'); return v; };
    const color = (v, fallback, label) => { if (v === undefined) return fallback; if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) fail(label + ' must be a six-digit hex color, such as #087F8C.'); return v.toUpperCase(); };
    const seen = new Set();
    const id = (value, label) => { const v = value === undefined ? uid() : value; if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v)) fail(label + ' has an invalid identifier.'); if (seen.has(v)) fail('Identifiers must be unique.'); seen.add(v); return v; };
    record(raw, 'Design');
    if (raw.version !== 1) fail('This file version is not supported. Use a Soupy Gear Studio version 1 JSON file.');
    if (!Array.isArray(raw.objects) || raw.objects.length > 200) fail('Objects must be a list of at most 200 items.');
    if (!Array.isArray(raw.strokes) || raw.strokes.length > 2000) fail('Drawing strokes must be a list of at most 2000 items.');
    const camera = record(raw.camera === undefined ? {} : raw.camera, 'Camera');
    const defaults = defaultCamera();
    const operatingMode = raw.operatingMode === undefined ? 'motor' : raw.operatingMode;
    if (!['motor', 'generator'].includes(operatingMode)) fail('Operating mode must be motor or generator.');
    const result = { version: 1, name: str(raw.name, 'Untitled design', 120, 'Design name'), objects: [], strokes: [], notes: bool(raw.notes, false, 'Notes'), operatingMode,
      camera: {
        yaw: num(camera.yaw, defaults.yaw, -180, 180, 'Camera yaw'),
        pitch: num(camera.pitch, defaults.pitch, -89, 89, 'Camera pitch'),
        roll: num(camera.roll, defaults.roll, -180, 180, 'Camera roll'),
        zoom: num(camera.zoom, defaults.zoom, .1, 8, 'Camera zoom'),
        panX: num(camera.panX, defaults.panX, -10000, 10000, 'Camera pan X'),
        panY: num(camera.panY, defaults.panY, -10000, 10000, 'Camera pan Y')
      } };
    result.objects = raw.objects.map((value, i) => {
      const v = record(value, 'Object ' + (i + 1));
      if (!TYPES.includes(v.type)) fail('Object ' + (i + 1) + ' has an unknown type.');
      const base = createObject(v.type), p = 'Object ' + (i + 1) + ' ';
      const o = { id: id(v.id, p), type: v.type, name: str(v.name, base.name, 120, p + 'name'),
        x: num(v.x, 0, -10000, 10000, p + 'x'), y: num(v.y, 0, -10000, 10000, p + 'y'),
        height: num(v.height, 0, -10000, 10000, p + 'height'),
        thickness: num(v.thickness, base.thickness, 2, 300, p + 'thickness'),
        radius: num(v.radius, base.radius, 10, 2000, p + 'radius'),
        rotation: ((num(v.rotation, 0, -1000000000, 1000000000, p + 'rotation') % 360) + 360) % 360,
        teeth: num(v.teeth, base.teeth, 6, 240, p + 'tooth count', true),
        color: color(v.color, base.color, p + 'color'), arrowColor: color(v.arrowColor, base.arrowColor, p + 'arrow color'),
        direction: v.direction === undefined ? base.direction : v.direction,
        showLabel: bool(v.showLabel, base.showLabel, p + 'label visibility'), locked: bool(v.locked, false, p + 'lock'),
        speed: num(v.speed, base.speed, 0, 180, p + 'preview speed') };
      if (!['cw', 'ccw', 'none'].includes(o.direction)) fail(p + 'direction must be cw, ccw, or none.');
      if (v.role !== undefined) { const role = str(v.role, '', 40, p + 'role'); if (['outer-ring', 'inner-ring', 'compound-pinion'].includes(role)) o.role = role; }
      if (o.type === 'ring') Object.assign(o, { internal: bool(v.internal, true, p + 'internal teeth'), band: num(v.band, Math.min(20, o.radius * .8), 4, Math.min(300, o.radius * .8), p + 'band width') });
      if (o.type === 'motor') {
        o.motorBand = num(v.motorBand, Math.min(35, o.radius * .8), 4, o.radius * .8, p + 'motor band width');
        o.capRadius = num(v.capRadius, Math.max(320, o.radius), o.radius, 3000, p + 'cap radius');
        o.capThickness = num(v.capThickness, 12, 2, 100, p + 'cap thickness');
        o.capHole = num(v.capHole, Math.min(80, o.radius - o.motorBand), 0, o.radius - o.motorBand, p + 'cap hole');
        o.rimDepth = num(v.rimDepth, Math.max(30, o.capThickness), o.capThickness, 1000, p + 'rim depth');
        o.rimWidth = num(v.rimWidth, Math.min(14, o.capRadius - o.capHole), 4, Math.min(100, o.capRadius - o.capHole), p + 'rim width');
        o.motorColor = color(v.motorColor, base.motorColor, p + 'motor stator color');
        o.rotorColor = color(v.rotorColor, base.rotorColor, p + 'motor rotor color');
      }
      if (o.type === 'compound') {
        o.smallRadius = num(v.smallRadius, Math.min(30, o.radius - 1), 5, o.radius - 1, p + 'small radius');
        o.smallTeeth = num(v.smallTeeth, 12, 6, 240, p + 'small tooth count', true);
        o.smallColor = color(v.smallColor, base.smallColor, p + 'small section color');
        o.shaftRadius = num(v.shaftRadius, Math.min(10, o.smallRadius - 1), 2, o.smallRadius - 1, p + 'shaft radius');
        o.shaftYaw = num(v.shaftYaw, 180, -180, 180, p + 'shaft yaw');
        o.shaftTilt = num(v.shaftTilt, 90, -90, 90, p + 'shaft tilt');
        o.sectionGap = num(v.sectionGap, 120, 0, 4000, p + 'section gap');
        o.shaftLength = num(v.shaftLength, 220, 10, 5000, p + 'shaft length');
        o.shaftExtension = num(v.shaftExtension, 0, 0, 2000, p + 'shaft extension');
        o.shaftEnd = v.shaftEnd === undefined ? 'small' : v.shaftEnd;
        if (!['small', 'large'].includes(o.shaftEnd)) fail(p + 'working shaft end must be small or large.');
      }
      if (o.type === 'text') Object.assign(o, { text: str(v.text, 'Your note', 1000, p + 'text'), fontSize: num(v.fontSize, 18, 8, 120, p + 'font size') });
      return o;
    });
    let pointCount = 0;
    result.strokes = raw.strokes.map((value, i) => {
      const v = record(value, 'Stroke ' + (i + 1));
      if (!Array.isArray(v.points) || !v.points.length) fail('Each drawing stroke needs at least one point.');
      pointCount += v.points.length;
      if (pointCount > 200000) fail('The drawing exceeds 200,000 points. Split it into smaller designs.');
      const points = v.points.map(p => {
        if (!Array.isArray(p) || p.length !== 2 || p[0] === undefined || p[1] === undefined) fail('Drawing points must contain an x and y coordinate.');
        return [num(p[0], 0, -10000, 10000, 'Drawing x'), num(p[1], 0, -10000, 10000, 'Drawing y')];
      });
      return { id: id(v.id, 'Stroke ' + (i + 1)), points, color: color(v.color, COLORS.ink, 'Drawing color'), width: num(v.width, 3, .5, 100, 'Brush size') };
    });
    return result;
  }
  return { uid, starter, starter3D, starterCappedMotors, starterOpposedCaps, starterMotorDrive, starterGeneratorDrive, defaultCamera, createObject, objectMarkup, strokeMarkup, sceneMarkup, bounds, exportSVG, validateDesign,
    escape, visualRadius, rotationArrow, toothPath };
});

