(() => {
  'use strict';
  const C = window.GearCore;
  const $ = id => document.getElementById(id);
  const stage = $('stage'), world = $('world');
  const stage3d = $('stage3d'), G = window.Gear3D, M = window.GearMechanics;
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const STORE = 'soupy-gear-studio-v1';
  // Duty-point settings describe how the design is to be driven, not the
  // design itself, so they live beside the file rather than inside it and the
  // version 1 format is unchanged.
  const DUTY_STORE = 'soupy-gear-studio-duty-v1';
  let design = C.starterMotorDrive(), selectedId = null, tool = 'select', viewMode = '3d';
  let past = [], future = [], gesture = null, space = false;
  let view = {x:0, y:0, zoom:1}, playing = false, playStart = 0, frame = 0;
  let saveTimer, toastTimer, resizeTimer, storageAvailable = true;
  let duty = Object.assign({}, M.DEFAULTS);
  try { const raw = localStorage.getItem(DUTY_STORE); if (raw) duty = M.settings(JSON.parse(raw)); } catch (error) { duty = Object.assign({}, M.DEFAULTS); }
  const pointers = new Map();
  let recoveryMessage = '';
  try {
    const saved = localStorage.getItem(STORE);
    if (saved) {
      design = C.validateDesign(JSON.parse(saved));
      recoveryMessage = design.objects.some(o=>o.type==='compound'&&!o.shaftExtension)
        ? 'Earlier sketch restored. Load motor layout or Load generator layout for the extended outside shaft. Undo restores this sketch.'
        : 'Your last sketch is restored.';
    }
  } catch (error) { recoveryMessage = 'Could not restore the browser copy. Load a saved JSON design if needed.'; storageAvailable = false; }
  selectedId = design.objects.find(o=>o.type==='compound')?.id || null;
  const cameraDefaults = () => ({yaw:-35,pitch:55,roll:0,zoom:1,panX:0,panY:0});
  const camera = () => (design.camera ||= cameraDefaults());
  let cameraGesture = null;
  const cameraPointers = new Map();
  function selected() { return design.objects.find(o => o.id === selectedId); }
  function snapshot() { return JSON.stringify(design); }
  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
  }
  function persist() {
    clearTimeout(saveTimer);
    $('save-status').textContent = 'Saving browser copy…';
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE, snapshot()); storageAvailable = true; $('save-status').textContent = 'Browser copy saved'; }
      catch (error) { storageAvailable = false; $('save-status').textContent = 'Use Save to keep a JSON copy'; }
    }, 300);
  }
  function commit(before) {
    if (before !== snapshot()) {
      past.push(before); if (past.length > 60) past.shift();
      future = []; persist();
    }
    renderUI();
  }
  function mutate(fn) { if (gesture) finishGesture(); stopPreview(); const before = snapshot(); fn(); commit(before); renderScene(); }
  function undo() {
    if (gesture) finishGesture();
    if (!past.length) return;
    stopPreview(); future.push(snapshot()); design = JSON.parse(past.pop());
    if (!selected()) selectedId = null;
    persist(); render();
  }
  function redo() {
    if (gesture) finishGesture();
    if (!future.length) return;
    stopPreview(); past.push(snapshot()); design = JSON.parse(future.pop());
    if (!selected()) selectedId = null;
    persist(); render();
  }
  function localPoint(e) { const b = stage.getBoundingClientRect(); return {x:e.clientX-b.left,y:e.clientY-b.top}; }
  function toWorld(p) { return {x:(p.x-view.x)/view.zoom,y:(p.y-view.y)/view.zoom}; }
  function boundedPoint(p) { return {x:clamp(p.x,-10000,10000),y:clamp(p.y,-10000,10000)}; }
  function zoomAt(factor, p) {
    const at = toWorld(p), z = clamp(view.zoom * factor, 0.001, 6);
    view = {x:p.x-at.x*z,y:p.y-at.y*z,zoom:z}; renderScene();
  }
  function fit() {
    if(viewMode==='3d') {Object.assign(camera(),{zoom:1,panX:0,panY:0});renderScene();persist();return;}
    const b = C.bounds(design,{compactNotes:stage.clientWidth<600}), rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const z = clamp(Math.min((rect.width-60)/Math.max(100,b.width),(rect.height-110)/Math.max(100,b.height)),0.001,1.6);
    view = {x:rect.width/2-(b.x+b.width/2)*z,y:rect.height/2-(b.y+b.height/2)*z+(rect.width<600?-45:10),zoom:z};
    renderScene();
  }
  function renderView() {
    if(viewMode==='3d') {$('zoom-label').textContent=`${Math.round(camera().zoom*100)}%`;return;}
    world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
    const pattern = $('grid-pattern');
    pattern.setAttribute('patternTransform', `translate(${view.x} ${view.y}) scale(${view.zoom})`);
    $('zoom-label').textContent = `${Math.round(view.zoom*100)}%`;
  }
  function renderScene(time) {
    const angles = {};
    if (playing) for (const o of design.objects) {
      const sign = o.direction === 'ccw' ? -1 : o.direction === 'cw' ? 1 : 0;
      angles[o.id] = o.rotation + sign*(o.speed ?? 20)*((time ?? performance.now())-playStart)/1000;
    }
    if(viewMode==='3d') {
      const rect=stage3d.getBoundingClientRect();
      stage3d.setAttribute('viewBox',`0 0 ${Math.max(1,rect.width)} ${Math.max(1,rect.height)}`);
      stage3d.innerHTML=G.render(design,camera(),{width:Math.max(1,rect.width),height:Math.max(1,rect.height),selectedId,angles,grid:$('grid-bg').style.display!=='none',bottomPadding:rect.width<600?110:75,gizmo:rect.width>=600,overlayText:false});
      syncCameraControls();
    } else world.innerHTML = C.sceneMarkup(design,{selectedId:playing ? null : selectedId,angles,exporting:false,compactNotes:stage.clientWidth<600,handleScale:1/view.zoom});
    renderView();
  }
  const typeName = {gear:'Gear',ring:'Ring',motor:'Frameless motor + gear cap',compound:'Compound pinion',arrow:'Direction arrow',text:'Text label'};
  const isGenerator = () => design.operatingMode === 'generator';
  const partTypeName = o => o.type==='motor'&&isGenerator()?'Frameless generator + gear cap':typeName[o.type];
  const motorDirection = o => o.direction==='ccw'?'↺ CCW from above':o.direction==='cw'?'↻ CW from above':'Stopped';
  function renderList() {
    $('object-list').innerHTML = design.objects.length ? [...design.objects].reverse().map(o => `<button type="button" class="object-item ${o.id===selectedId?'selected':''}" data-select="${escape(o.id)}" aria-pressed="${o.id===selectedId}"><span class="object-dot" style="background:${o.color}"></span><span><strong>${escape(o.name)}</strong><small class="object-meta">${partTypeName(o)}${o.locked?' · Locked':''}</small>${o.type==='motor'?`<small class="object-meta">${motorDirection(o)}</small>`:''}${o.type==='compound'?`<small class="object-meta">Mechanical ${isGenerator()?'input':'output'} shaft</small>`:''}</span></button>`).join('') : '<p class="empty-state">Add a gear, ring, or pinion to start a new idea.</p>';
  }
  function field(key,label,value,type='number',extra='') {
    return `<label class="field">${label}<input data-prop="${key}" aria-label="${escape(label)}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  }
  function check(key,label,value) { return `<label class="check-field"><input data-prop="${key}" type="checkbox" ${value?'checked':''}> ${label}</label>`; }
  function renderProperties() {
    const o = selected();
    if (!o) {
      $('properties').innerHTML = '<div class="empty-state"><span class="empty-icon">↖</span><h3>Make it your mechanism</h3><p>Select a part on the canvas or in the parts list to change its size, teeth, color, and direction.</p><p>In 3D, drag to orbit the camera. Use Selection to edit the shaft angle and height. Switch to 2D sketch for dragging parts and free drawing.</p></div>';
      return;
    }
    let html = `<div class="property-section"><span class="selection-type">${partTypeName(o)}</span>${field('name','Part name',o.name,'text','maxlength="80"')}`;
    if (o.type==='text') html += field('text','Label text',o.text,'text','maxlength="240"');
    html += `<div class="field-row">${field('x','Position X',Math.round(o.x*10)/10,'number','min="-10000" max="10000" step="1"')}${field('y','Position Y',Math.round(o.y*10)/10,'number','min="-10000" max="10000" step="1"')}</div>`;
    html += `<div class="field-row">${field('rotation','Rotation °',Math.round(o.rotation*10)/10,'number','step="1"')}${field(o.type==='text'?'fontSize':'radius',o.type==='text'?'Text size':o.type==='motor'?'Motor body radius':'Radius',o.type==='text'?o.fontSize:Math.round(o.radius*10)/10,'number',o.type==='text'?'min="8" max="120"':'min="10" max="2000"')}</div>`;
    if (['ring','gear','motor','compound'].includes(o.type)) html += field('teeth',o.type==='compound'?'Large section teeth':o.type==='motor'?'Cap rim teeth':'Tooth count',o.teeth,'number','min="6" max="240" step="1"');
    if (o.type==='ring') html += `<label class="field">Teeth face<select data-prop="internal" aria-label="Teeth face"><option value="true" ${o.internal?'selected':''}>Inside the ring</option><option value="false" ${!o.internal?'selected':''}>Outside the ring</option></select></label>${field('band','Ring band width',o.band,'number','min="4" max="300"')}`;
    if (o.type==='compound') html += `<div class="section-note">Two gear sections move together on one shaft.</div><div class="field-row">${field('smallRadius','Small radius',o.smallRadius,'number',`min="5" max="${o.radius-1}"`)}${field('smallTeeth','Small teeth',o.smallTeeth,'number','min="6" max="240" step="1"')}</div>${field('shaftRadius','Shaft radius',o.shaftRadius,'number',`min="2" max="${o.smallRadius-1}"`)}`;
    if(o.type==='motor') {
      html += '</div><div class="property-section"><h3>Motor & geared cap</h3><p class="field-hint">A flat cap attaches to the rotor, with a toothed rim extending below the plate. Change Motor center height Z to position the cap above or below the pinion. Dimensions are drawing units.</p>';
      html += field('motorBand','Motor ring width',o.motorBand,'number',`min="4" max="${o.radius*.8}"`);
      html += '<div class="field-row">'+field('capRadius','Cap radius',o.capRadius,'number',`min="${o.radius}" max="3000"`)+field('capHole','Cap hole radius',o.capHole,'number',`min="0" max="${o.radius-o.motorBand}"`)+'</div>';
      html += field('capThickness','Cap plate thickness',o.capThickness,'number','min="2" max="100"');
      html += '<div class="field-row">'+field('rimDepth','Downturned rim depth',o.rimDepth,'number',`min="${o.capThickness}" max="1000"`)+field('rimWidth','Rim wall width',o.rimWidth,'number',`min="4" max="${Math.min(100,o.capRadius-o.capHole)}"`)+'</div><p class="field-hint">Rim depth is measured down from the cap top. Increasing it extends the teeth below the cap plate.</p>';
    }
    html += '</div><div class="property-section"><h3>3D placement</h3><div class="field-row">'+field('height',o.type==='motor'?'Motor center height Z':'Height Z',o.height??0,'number','min="-10000" max="10000"')+field('thickness',o.type==='motor'?'Motor body thickness':'Part thickness',o.thickness??18,'number','min="2" max="300"')+'</div>';
    if(o.type==='compound') {
      html += '<p class="field-hint">These controls turn the actual shaft. Both pinion sections stay perpendicular to the same shaft.</p><div class="field-row">'+field('shaftYaw','Shaft heading °',o.shaftYaw??180,'number','min="-180" max="180"')+field('shaftTilt','Shaft tilt °',o.shaftTilt??0,'number','min="-90" max="90"')+'</div><div class="field-row">'+field('sectionGap','Section spacing',o.sectionGap??120,'number','min="0" max="4000"')+field('shaftLength','Shaft length',o.shaftLength??220,'number','min="10" max="5000"')+'</div><button type="button" data-action="aim">Point shaft toward rings</button><p class="field-hint">Tilt 0° points across the rings; 90° points along their center axis. Rotation ° spins the sections around their shaft.</p>';
      html += '<h3>Working shaft end</h3><label class="field">Working end<select data-prop="shaftEnd" aria-label="Working end"><option value="small" '+(o.shaftEnd!=='large'?'selected':'')+'>Beyond small gear</option><option value="large" '+(o.shaftEnd==='large'?'selected':'')+'>Beyond large gear</option></select></label>'+field('shaftExtension','Shaft extension',o.shaftExtension??0,'number','min="0" max="2000"')+'<button type="button" data-action="extend-outward">Extend working end outward</button><p class="field-hint">Adds length at the chosen end without moving the gear sections. This is the mechanical '+(isGenerator()?'input':'output')+'. The straight arrow shows power flow; curved arrows show rotation.</p>';
    }
    html += '</div><div class="property-section"><h3>Appearance & motion</h3>';
    html += `<div class="field-row">${field('color',o.type==='compound'?'Large section':o.type==='motor'?'Gear cap color':'Part color',o.color,'color')}${o.type==='compound'?field('smallColor','Small section',o.smallColor,'color'):''}</div>`;
    if(o.type==='motor') html += '<div class="field-row">'+field('motorColor','Stator color',o.motorColor,'color')+field('rotorColor','Rotor color',o.rotorColor,'color')+'</div><p class="field-hint">The stator stays fixed. The rotor and its geared cap turn together. CW / CCW is viewed from above (+Z); it appears reversed when viewed from underneath.</p>';
    if (o.type!=='text') html += `<label class="field">Direction<select data-prop="direction" aria-label="Direction"><option value="cw" ${o.direction==='cw'?'selected':''}>↻ Clockwise</option><option value="ccw" ${o.direction==='ccw'?'selected':''}>↺ Counterclockwise</option><option value="none" ${o.direction==='none'?'selected':''}>No direction arrow</option></select></label><div class="field-row">${field('arrowColor','Arrow color',o.arrowColor,'color')}${field('speed','Preview °/sec',o.speed??20,'number','min="0" max="180"')}</div><p class="field-hint">Preview speeds are independent. Motion does not solve gear meshing.</p>`;
    html += check('showLabel','Show part name',o.showLabel)+check('locked','Lock canvas dragging',o.locked);
    html += '</div><div class="property-section"><div class="field-row"><button type="button" data-action="duplicate">Duplicate</button><button type="button" data-action="remove" class="danger">Remove part</button></div><div class="field-row"><button type="button" data-action="back">Send back</button><button type="button" data-action="front">Bring front</button></div></div>';
    $('properties').innerHTML = html;
  }
  /* ---- mechanism analysis panel ---------------------------------------
   * Reads the design, never writes it. The repair buttons are the only path
   * back into the design, and they go through mutate() like any other edit.
   */
  const unit = (v, places, suffix) => (Number.isFinite(v) ? M.fixed(v, places) + (suffix || '') : '—');
  const watts = v => (Math.abs(v) >= 1000 ? M.fixed(v / 1000, 2) + ' kW' : M.fixed(v, 0) + ' W');
  const dirGlyph = d => (d === 'cw' ? '↻ CW' : d === 'ccw' ? '↺ CCW' : '—');
  function dutyField(key, label, value, extra, hint) {
    return `<label class="duty-field">${escape(label)}<input data-duty="${key}" type="number" value="${escape(value)}" ${extra || ''} aria-label="${escape(label)}">${hint ? `<small>${escape(hint)}</small>` : ''}</label>`;
  }
  function renderAnalysis() {
    const report = M.analyze(design, duty);
    const badge = $('analysis-badge');
    const live = report.meshes.filter(m => !m.unmeshed);
    if (!live.length) { badge.textContent = 'no mesh'; badge.className = 'analysis-badge neutral'; }
    else if (report.blocking) { badge.textContent = report.blocking + ' blocking'; badge.className = 'analysis-badge bad'; }
    else if (report.advisories) { badge.textContent = report.advisories + ' to check'; badge.className = 'analysis-badge warn'; }
    else { badge.textContent = 'consistent'; badge.className = 'analysis-badge good'; }
    // The canvas badge keeps saying "Schematic only"; only its note changes,
    // so a passing check never reads as a validated mechanism.
    $('schematic-note').textContent = !live.length ? 'Meshing is not validated'
      : report.blocking ? report.blocking + (report.blocking === 1 ? ' mesh will not turn' : ' meshes will not turn')
      : 'Sizes and teeth agree · profiles still unvalidated';

    let html = '<div class="duty-grid">'
      + dutyField('scale', 'mm per unit', duty.scale, 'min="0.001" max="1000" step="0.1"')
      + dutyField('shaftRpm', 'Shaft rpm', duty.shaftRpm, 'min="0" max="100000" step="10"')
      + dutyField('shaftTorque', 'Shaft N·m', duty.shaftTorque, 'min="0" max="10000000" step="5"')
      + dutyField('busVoltage', 'Bus volts', duty.busVoltage, 'min="0" max="100000" step="1"')
      + dutyField('torqueShare', 'First share', duty.torqueShare, 'min="0" max="1" step="0.05"')
      + dutyField('gearEfficiency', 'Gear η', duty.gearEfficiency, 'min="0.1" max="1" step="0.01"')
      + dutyField('machineEfficiency', 'Machine η', duty.machineEfficiency, 'min="0.1" max="1" step="0.01"')
      + dutyField('converterEfficiency', 'Converter η', duty.converterEfficiency, 'min="0.1" max="1" step="0.01"')
      + '</div>';

    html += '<h3>Meshes</h3>';
    if (!report.meshes.length) html += '<p class="analysis-empty">Add a motor, ring, or gear and a compound pinion to analyse a mesh.</p>';
    for (const m of report.meshes) {
      if (m.unmeshed) {
        html += `<div class="mesh-card muted"><div class="mesh-head"><strong>${escape(m.wheelName)}</strong><span class="mesh-tag">no mesh</span></div>`
          + m.checks.map(c => `<p class="check miss">${escape(c.detail)}</p>`).join('') + '</div>';
        continue;
      }
      const tag = m.consistent ? '<span class="mesh-tag good">consistent</span>' : '<span class="mesh-tag bad">will not mesh</span>';
      html += `<div class="mesh-card"><div class="mesh-head"><strong>${escape(m.wheelName)}</strong>${tag}</div>`
        + `<p class="mesh-sub">${escape(m.kind === 'parallel' ? 'Parallel axes' : 'Right angle')} · ${escape(m.surface)} against the ${escape(m.sectionKind)} section</p>`
        + '<table class="mesh-table"><tbody>'
        + `<tr><th>Ratio from sizes</th><td>${unit(m.ratioGeometric, 3)}</td></tr>`
        + `<tr><th>Ratio from teeth</th><td class="${m.consistent ? '' : 'off'}">${unit(m.ratioTeeth, 3)}</td></tr>`
        + `<tr><th>Module</th><td class="${m.consistent ? '' : 'off'}">${unit(m.modulePinionMm, 3, ' mm')} / ${unit(m.moduleWheelMm, 3, ' mm')}</td></tr>`
        + `<tr><th>Contact radius</th><td>${unit(m.contactRadius * duty.scale, 1, ' mm')}</td></tr>`
        + '</tbody></table>'
        + m.checks.map(c => `<p class="check ${c.ok ? 'ok' : c.severity === 'blocking' ? 'miss' : c.severity === 'note' ? 'note' : 'warn'}">${escape(c.detail)}</p>`).join('');
      if (!m.consistent) {
        html += `<p class="check fix">Either ${escape(m.wheelName)} carries <strong>${m.suggestion.wheelTeeth} teeth</strong>`
          + (m.suggestion.wheelTeethResidual ? ` (the drawn radius wants ${M.fixed(m.suggestion.exactWheelTeeth, 2)}, so it shifts by ${M.fixed(Math.abs(m.suggestion.wheelTeethResidual) * m.modulePinion / 2 * duty.scale, 2)} mm)` : '')
          + `, or the ${escape(m.sectionKind)} section grows to <strong>${M.fixed(m.suggestion.radiusForTeeth * duty.scale, 1)} mm</strong> radius.</p>`;
      }
      html += '</div>';
    }
    if (report.blocking) {
      html += '<div class="fix-row">'
        + '<button type="button" data-fix="wheel-teeth">Match teeth to the drawn sizes</button>'
        + '<button type="button" data-fix="pinion-radius" class="quiet">Match sizes to the teeth</button></div>'
        + '<p class="field-hint">The first keeps every drawn dimension and restates the tooth counts. The second keeps the tooth counts, resizes the pinion sections, and re-seats the caps so the faces still touch.</p>';
    }

    if (report.clearances.length) {
      html += '<h3>Clearance</h3>';
      for (const c of report.clearances.slice(0, 6)) html += `<p class="check miss">${escape(c.detail)}</p>`;
    }

    const kin = report.kinematics;
    html += '<h3>Motion</h3>';
    if (!kin.rings.length) html += '<p class="analysis-empty">No mesh, so no speeds to derive.</p>';
    else {
      html += `<p class="mesh-sub">Shaft ${escape(dirGlyph(kin.shaftDirection))} at ${unit(kin.shaftRpm, 0)} rpm drives:</p><table class="mesh-table motion"><tbody>`;
      for (const r of kin.rings) {
        const flag = r.agrees === false ? '<span class="off"> ✗ drawn ' + escape(dirGlyph(r.declaredDirection)) + '</span>' : '';
        html += `<tr><th>${escape(r.name)}</th><td>${unit(r.rpm, 1)} rpm</td><td>${escape(dirGlyph(r.derivedDirection))}${flag}</td><td class="ratio">1:${unit(r.ratio, 2)}</td></tr>`;
      }
      html += '</tbody></table>';
      html += `<p class="check ${kin.counterRotating ? 'ok' : 'note'}">${kin.counterRotating ? 'The rings turn opposite ways, as the opposed cap faces require.' : 'Both rings turn the same way.'}</p>`;
      if (kin.disagreements) html += `<p class="check warn">${kin.disagreements} drawn rotation ${kin.disagreements === 1 ? 'arrow contradicts' : 'arrows contradict'} the mesh.</p>`;
      if (!report.speedsInStep) html += '<p class="check note">Preview speeds are hand-set and do not follow these ratios.</p>';
      if (kin.disagreements || !report.speedsInStep) html += '<div class="fix-row"><button type="button" data-fix="motion">Put rotation and preview in step</button></div>';
    }

    const p = report.power;
    html += `<h3>Power · ${p.mode === 'generator' ? 'generator' : 'motor drive'}</h3>`;
    if (!p.branches.length) html += '<p class="analysis-empty">No mesh, so no power path.</p>';
    else {
      html += `<p class="mesh-sub">${p.mode === 'generator' ? 'Shaft input' : 'Shaft output'} ${watts(p.shaftPower)} — ${unit(p.shaftTorque, 0, ' N·m')} at ${unit(p.shaftRpm, 0)} rpm.</p>`;
      html += '<table class="mesh-table power"><thead><tr><th>Machine</th><th>Ring</th><th>' + (p.mode === 'generator' ? 'Out' : 'In') + '</th><th>Bus</th></tr></thead><tbody>';
      for (const b of p.branches) {
        html += `<tr><th>${escape(b.name)}</th><td>${unit(b.ringTorque, 0, ' N·m')}<small>${unit(b.ringRpm, 1)} rpm</small></td>`
          + `<td>${watts(b.electricalPower)}</td><td>${unit(b.busCurrent, 1, ' A')}</td></tr>`;
      }
      html += `<tr class="total"><th>Together</th><td>${M.fixed(p.chainEfficiency * 100, 0)}% chain</td><td>${watts(p.electricalTotal)}</td><td>${unit(p.busCurrentTotal, 1, ' A')}</td></tr>`;
      html += '</tbody></table>';
      html += `<p class="field-hint">Shaft-to-bus efficiency ${M.fixed(p.overall * 100, 1)}% at ${unit(duty.busVoltage, 0, ' V')}. Bus current is total power over bus voltage, not a machine phase current.</p>`;
    }

    html += '<p class="analysis-limits">Checked here: equal module, centre distance or face contact, tooth-count consistency, gross interference, speed and direction, and a loss-chain power estimate. Not checked: tooth profile and the right-angle form these faces would need, contact stress, backlash, undercut, bending and bearing loads, lubrication, thermal limits, machine envelopes, and electrical behaviour. Passing every check here does not make the mechanism buildable.</p>';
    $('analysis').innerHTML = html;
  }
  function applyFix(fixId) {
    const report = M.analyze(design, duty);
    let patches;
    try { patches = M.patchesFor(design, report, fixId); }
    catch (error) { toast('That repair is not available.'); return; }
    if (!patches.length) { toast('Nothing to change.'); return; }
    mutate(() => {
      for (const patch of patches) {
        const o = design.objects.find(x => x.id === patch.id);
        if (o) Object.assign(o, patch.set);
      }
      // Run the result through the importer so a repair can never leave the
      // design in a state the app would refuse to load.
      try { design = C.validateDesign(design); }
      catch (error) { toast('Repair rejected: ' + error.message); }
    });
    toast(patches.map(p => p.note).join(' · ').slice(0, 220));
  }
  function renderUI() {
    $('design-name').value = design.name;
    $('undo').disabled = !past.length; $('redo').disabled = !future.length;
    $('notes-toggle').checked = design.notes;
    const generator = isGenerator();
    $('operating-mode').value = generator ? 'generator' : 'motor';
    $('power-flow-title').textContent = generator ? 'Generator drive' : 'Motor drive';
    $('power-flow-description').textContent = generator
      ? 'Mechanical input → shaft → both rings → electrical output'
      : 'Electrical input → both rings → shaft → mechanical output';
    $('concept-title').textContent = generator ? 'One input. Two generators.' : 'Two motors. One output.';
    $('concept-description').textContent = 'The upper cap meets the top of the small pinion section. The lower cap meets the bottom of the large section. '+(generator
      ? 'Drive the shaft from its extended outside end to turn both rings as generators. The rings counterrotate; their electrical outputs are conceptual.'
      : 'Both motor rings drive one compound shaft. Its working end extends outward beyond the small pinion, ready for the output connection.');
    document.querySelector('[data-add="motor"] strong').textContent = generator ? 'Generator + gear cap' : 'Motor + gear cap';
    $('selection-status').textContent = `${design.objects.length} parts · ${design.strokes.length} ink strokes${selected()?' · '+selected().name:''}`;
    renderList(); renderProperties(); renderAnalysis();
    syncCameraControls();
  }
  function render() { renderScene(); renderUI(); }
  function select(id) { stopPreview(); selectedId = id; render(); }
  function syncCameraControls() {
    const c=camera();
    for(const key of ['yaw','pitch','roll']) {
      $('camera-'+key).value=String(Math.round(c[key]));
      $('camera-'+key+'-value').textContent=Math.round(c[key])+'°';
    }
    const presets={iso:[-35,55,0],top:[0,89,0],front:[0,0,0],side:[90,0,0],under:[-35,-25,0]};
    document.querySelectorAll('[data-camera]').forEach(b=>{const p=presets[b.dataset.camera],active=!!p&&[c.yaw,c.pitch,c.roll].every((v,i)=>Math.abs(v-p[i])<.01);b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  }
  function setViewMode(mode) {
    if(gesture)finishGesture();
    stopPreview();viewMode=mode;
    document.querySelector('.app').classList.toggle('is-3d',mode==='3d');
    stage.hidden=mode==='3d';stage3d.hidden=mode!=='3d';$('camera-controls').hidden=mode!=='3d';
    document.querySelectorAll('[data-view-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.viewMode===mode);b.setAttribute('aria-pressed',b.dataset.viewMode===mode);});
    setTool(tool);render();
    if(mode==='2d')fit();
  }
  function aimPinion() {
    const o=selected()?.type==='compound'?selected():design.objects.find(o=>o.type==='compound');
    if(!o){toast('Add a compound pinion first, then point its shaft toward the rings.');return;}
    const ring=design.objects.find(o=>o.role==='outer-ring')||design.objects.find(o=>o.type==='motor'||o.type==='ring');
    mutate(()=>{
      selectedId=o.id;
      o.shaftYaw=ring&&Math.hypot(ring.x-o.x,ring.y-o.y)>.001?Math.atan2(ring.y-o.y,ring.x-o.x)*180/Math.PI:180;
      o.shaftTilt=0;
    });
    setViewMode('3d');
    toast('The shared shaft points toward the ring center. Height and section spacing are editable in Selection.');
  }
  function extendShaftOutward() {
    const o=selected(); if(o?.type!=='compound')return;
    const ring=design.objects.find(p=>p.role==='outer-ring')||design.objects.find(p=>p.type==='motor'||p.type==='ring');
    const yaw=(o.shaftYaw??180)*Math.PI/180, tilt=(o.shaftTilt??0)*Math.PI/180;
    const axis={x:Math.cos(yaw)*Math.cos(tilt),y:Math.sin(yaw)*Math.cos(tilt),z:Math.sin(tilt)};
    const outward=axis.x*(o.x-(ring?.x??0))+axis.y*(o.y-(ring?.y??0));
    mutate(()=>{o.shaftEnd=outward>0?'large':'small';o.shaftExtension=Math.max(120,o.shaftExtension??0);});
    toast('Working end extended away from the ring center. Both pinion gear positions are unchanged.');
  }
  document.querySelectorAll('[data-view-mode]').forEach(b=>b.addEventListener('click',()=>setViewMode(b.dataset.viewMode)));
  $('turn-pinion').addEventListener('click',aimPinion);
  for(const key of ['yaw','pitch','roll']) {
    $('camera-'+key).addEventListener('input',e=>{camera()[key]=Number(e.target.value);renderScene();});
    $('camera-'+key).addEventListener('change',persist);
  }
  document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>{
    const presets={iso:{yaw:-35,pitch:55,roll:0},top:{yaw:0,pitch:89,roll:0},front:{yaw:0,pitch:0,roll:0},side:{yaw:90,pitch:0,roll:0},under:{yaw:-35,pitch:-25,roll:0},reset:cameraDefaults()};
    Object.assign(camera(),presets[b.dataset.camera],{panX:0,panY:0});renderScene();persist();
  }));
  function zoomCamera(factor) {camera().zoom=clamp(camera().zoom*factor,.1,8);renderScene();persist();}
  const point3d=e=>{const r=stage3d.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};};
  const wrapAngle=a=>((a+180)%360+360)%360-180;
  stage3d.addEventListener('pointerdown',e=>{
    if(![0,1,2].includes(e.button))return;
    e.preventDefault();stage3d.focus({preventScroll:true});stage3d.setPointerCapture(e.pointerId);
    const p=point3d(e);cameraPointers.set(e.pointerId,p);
    if(cameraPointers.size===2){
      const[a,b]=[...cameraPointers.values()];cameraGesture={kind:'pinch',initial:clone(camera()),distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},moved:true};return;
    }
    if(cameraPointers.size>2)return;
    cameraGesture={kind:e.shiftKey||space||e.button!==0?'pan':'orbit',initial:clone(camera()),start:p,moved:false,id:e.target.closest('[data-part-id]')?.dataset.partId};
    stage3d.style.cursor='grabbing';
  });
  stage3d.addEventListener('pointermove',e=>{
    if(!cameraPointers.has(e.pointerId)||!cameraGesture)return;
    const p=point3d(e);cameraPointers.set(e.pointerId,p);const g=cameraGesture,c=camera();
    if(g.kind==='pinch'){
      if(cameraPointers.size<2)return;
      const[a,b]=[...cameraPointers.values()];c.zoom=clamp(g.initial.zoom*Math.hypot(a.x-b.x,a.y-b.y)/g.distance,.1,8);
      c.panX=clamp(g.initial.panX+(a.x+b.x)/2-g.center.x,-10000,10000);c.panY=clamp(g.initial.panY+(a.y+b.y)/2-g.center.y,-10000,10000);
    } else {
      const dx=p.x-g.start.x,dy=p.y-g.start.y;
      if(Math.hypot(dx,dy)>3)g.moved=true;
      if(g.kind==='pan'){c.panX=clamp(g.initial.panX+dx,-10000,10000);c.panY=clamp(g.initial.panY+dy,-10000,10000);}
      else {c.yaw=wrapAngle(g.initial.yaw+dx*.5);c.pitch=clamp(g.initial.pitch+dy*.4,-89,89);}
    }
    renderScene();
  });
  function finishCamera(e){
    const g=cameraGesture;cameraPointers.delete(e.pointerId);
    if(stage3d.hasPointerCapture(e.pointerId))stage3d.releasePointerCapture(e.pointerId);
    if(!g)return;
    if(g.kind==='pinch'&&cameraPointers.size>=2)return;
    cameraGesture=null;stage3d.style.cursor='grab';
    if(!g.moved&&e.type!=='pointercancel')select(g.id||null);
    else persist();
  }
  stage3d.addEventListener('pointerup',finishCamera);stage3d.addEventListener('pointercancel',finishCamera);
  stage3d.addEventListener('lostpointercapture',e=>{if(cameraPointers.has(e.pointerId)){cameraPointers.delete(e.pointerId);cameraGesture=null;persist();}});
  stage3d.addEventListener('contextmenu',e=>e.preventDefault());
  stage3d.addEventListener('wheel',e=>{e.preventDefault();zoomCamera(Math.exp(-clamp(e.deltaY,-150,150)*.002));},{passive:false});
  function setTool(next) {
    if (gesture) finishGesture();
    tool = next;
    document.querySelectorAll('[data-tool]').forEach(b => { b.classList.toggle('active',b.dataset.tool===tool); b.setAttribute('aria-pressed',b.dataset.tool===tool); });
    stage.style.cursor = tool==='pan'?'grab':tool==='draw'?'crosshair':tool==='erase'?'cell':'default';
    const hints = {select:'Drag to move · Square handle resizes · Round handle rotates',draw:'Draw with your mouse, pen, or finger · Two fingers pan & zoom',erase:'Drag across ink to erase whole strokes · Undo restores them',pan:'Drag the drawing surface · Scroll or pinch to zoom'};
    $('canvas-hint').textContent = viewMode==='3d'?'Drag to orbit · Shift-drag to pan · Scroll to zoom · Click a part to edit':hints[tool];
  }
  function stopPreview() {
    if (!playing) return;
    playing = false; cancelAnimationFrame(frame); $('play').textContent='Preview rotation'; $('play').setAttribute('aria-pressed','false'); renderScene();
  }
  function animate(time) { if (!playing) return; renderScene(time); frame = requestAnimationFrame(animate); }
  $('play').addEventListener('click',() => {
    if (playing) { stopPreview(); return; }
    if (gesture) finishGesture();
    playing = true; playStart = performance.now(); $('play').textContent='Stop preview'; $('play').setAttribute('aria-pressed','true');
    toast('Illustrative rotation only. Part speeds are independent; gear meshing is not solved.');
    frame = requestAnimationFrame(animate);
  });
  function add(type) {
    if (design.objects.length>=200) { toast('This design has reached its 200-part limit. Save it and start another design.'); return; }
    const rect = stage.getBoundingClientRect(), p = viewMode==='3d'?{x:0,y:0}:boundedPoint(toWorld({x:rect.width/2,y:rect.height/2}));
    mutate(() => { const o=C.createObject(type,p.x,p.y); if(type==='motor'&&isGenerator())o.name='Frameless generator + cap'; design.objects.push(o); selectedId=o.id; });
    setTool('select');
  }
  document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>add(b.dataset.add)));
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{if(viewMode==='3d')setViewMode('2d');setTool(b.dataset.tool);}));
  $('object-list').addEventListener('click',e=>{const b=e.target.closest('[data-select]'); if(b) { setTool('select'); select(b.dataset.select); }});
  function constrainMotor(o) {
    o.motorBand=clamp(o.motorBand,4,o.radius*.8);
    o.capRadius=clamp(o.capRadius,o.radius,3000);
    o.capHole=clamp(o.capHole,0,o.radius-o.motorBand);
    o.capThickness=clamp(o.capThickness,2,100);
    o.rimDepth=clamp(o.rimDepth,o.capThickness,1000);
    o.rimWidth=clamp(o.rimWidth,4,Math.min(100,o.capRadius-o.capHole));
  }
  function scaleMotor(o,original,ratio) {
    for(const key of ['motorBand','capRadius','capHole','rimWidth']) o[key]=original[key]*ratio;
    constrainMotor(o);
  }
  $('properties').addEventListener('change',e=>{
    const input=e.target, key=input.dataset.prop, o=selected(); if(!key||!o) return;
    let value=input.type==='checkbox'?input.checked:input.value;
    if (key==='internal') value=value==='true';
    if (input.type==='number') {
      if(input.value.trim()===''||!Number.isFinite(Number(value))) { toast('Enter a valid number.'); renderProperties(); return; }
      value=Number(value);
      const limits={x:[-10000,10000],y:[-10000,10000],radius:[10,2000],smallRadius:[5,o.radius-1],shaftRadius:[2,o.smallRadius-1],teeth:[6,240],smallTeeth:[6,240],band:[4,Math.min(300,o.radius*.8)],fontSize:[8,120],speed:[0,180],height:[-10000,10000],thickness:[2,300],shaftYaw:[-180,180],shaftTilt:[-90,90],sectionGap:[0,4000],shaftLength:[10,5000],shaftExtension:[0,2000],motorBand:[4,o.radius*.8],capRadius:[o.radius,3000],capHole:[0,o.radius-(o.motorBand??4)],capThickness:[2,100],rimDepth:[o.capThickness??2,1000],rimWidth:[4,Math.min(100,(o.capRadius??200)-(o.capHole??0))]};
      if(limits[key]) value=clamp(value,...limits[key]);
      if(key==='teeth'||key==='smallTeeth') value=Math.round(value);
      if(key==='rotation') value=((value%360)+360)%360;
    }
    mutate(()=>{
      if(key==='radius') {
        const ratio=value/o.radius;
        if(o.type==='compound') { o.smallRadius=clamp(o.smallRadius*ratio,5,value-1); o.shaftRadius=clamp(o.shaftRadius*ratio,2,o.smallRadius-1); }
        if(o.type==='ring') o.band=clamp(o.band*ratio,4,Math.min(300,value*.8));
        if(o.type==='motor') {const original=clone(o);o.radius=value;scaleMotor(o,original,ratio);}
      }
      o[key]=value;
      if(key==='smallRadius') o.shaftRadius=Math.min(o.shaftRadius,value-1);
      if(o.type==='motor') constrainMotor(o);
    });
  });
  function partAction(action) {
    const o=selected(); if(!o) return;
    if(action==='aim') {aimPinion();return;}
    if(action==='extend-outward') {extendShaftOutward();return;}
    if(action==='duplicate'&&design.objects.length>=200) { toast('The design limit is 200 parts.'); return; }
    mutate(()=>{
      const index=design.objects.indexOf(o);
      if(action==='remove') { design.objects.splice(index,1); selectedId=null; }
      if(action==='duplicate') { const n=clone(o); n.id=C.uid(); n.x=clamp(n.x+25,-10000,10000); n.y=clamp(n.y+25,-10000,10000); n.name=(n.name+' copy').slice(0,80); delete n.role; design.objects.push(n); selectedId=n.id; }
      if(action==='front') { design.objects.splice(index,1); design.objects.push(o); }
      if(action==='back') { design.objects.splice(index,1); design.objects.unshift(o); }
    });
  }
  $('properties').addEventListener('click',e=>{const b=e.target.closest('[data-action]'); if(b) partAction(b.dataset.action);});
  $('analysis').addEventListener('change',e=>{
    const input=e.target.closest('[data-duty]'); if(!input) return;
    const key=input.dataset.duty, raw=Number(input.value);
    if(input.value.trim()===''||!Number.isFinite(raw)) { toast('Enter a valid number.'); renderAnalysis(); return; }
    duty=M.settings(Object.assign({},duty,{[key]:raw}));
    try { localStorage.setItem(DUTY_STORE,JSON.stringify(duty)); } catch (error) { /* a browser copy is best effort */ }
    renderAnalysis();
  });
  $('analysis').addEventListener('click',e=>{const b=e.target.closest('[data-fix]'); if(b) applyFix(b.dataset.fix);});
  function segmentDistance(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const t=clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy);
  }
  function eraseAt(p) {
    const reach=Math.max(6,Number($('brush-size').value))/view.zoom;
    design.strokes=design.strokes.filter(s=>{
      if(s.points.length===1) return Math.hypot(p.x-s.points[0][0],p.y-s.points[0][1])>reach+s.width/2;
      return !s.points.some((v,i)=>i>0&&segmentDistance(p,s.points[i-1],v)<=reach+s.width/2);
    });
  }
  function finishGesture(cancel=false) {
    const g=gesture; gesture=null;
    if(g?.before) {
      if(cancel) { design=JSON.parse(g.before); render(); }
      else { commit(g.before); renderScene(); }
    }
    if(tool==='pan') stage.style.cursor='grab';
  }
  stage.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==1) return;
    e.preventDefault(); stage.focus({preventScroll:true}); stopPreview();
    const p=localPoint(e); pointers.set(e.pointerId,p); stage.setPointerCapture(e.pointerId);
    if(pointers.size===2) {
      finishGesture(true);
      const [a,b]=[...pointers.values()]; const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      gesture={kind:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:view.zoom,anchor:toWorld(center)}; return;
    }
    if(pointers.size>2) return;
    const w=boundedPoint(toWorld(p));
    if(space||e.button===1||tool==='pan') { gesture={kind:'pan',start:p,view:{...view}}; stage.style.cursor='grabbing'; return; }
    if(tool==='draw') {
      const count=design.strokes.reduce((n,s)=>n+s.points.length,0);
      if(design.strokes.length>=2000||count>=200000) { toast('Ink limit reached. Save this design and start another.'); return; }
      const before=snapshot(), s={id:C.uid(),color:$('brush-color').value,width:Number($('brush-size').value),points:[[w.x,w.y]]};
      design.strokes.push(s); gesture={kind:'draw',before,stroke:s,remaining:200000-count-1}; renderScene(); return;
    }
    if(tool==='erase') { gesture={kind:'erase',before:snapshot(),last:w}; eraseAt(w); renderScene(); return; }
    const el=e.target.closest('[data-id]'); const o=el&&design.objects.find(o=>o.id===el.dataset.id);
    if(!o) { select(null); return; }
    selectedId=o.id;
    const handle=e.target.closest('[data-handle]')?.dataset.handle;
    if(!o.locked) gesture={kind:handle||'move',before:snapshot(),id:o.id,start:w,original:clone(o),distance:Math.hypot(w.x-o.x,w.y-o.y),angle:Math.atan2(w.y-o.y,w.x-o.x)};
    else toast('This part is locked. Unlock it in Selection to move or resize it.');
    render();
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)) return;
    const p=localPoint(e); pointers.set(e.pointerId,p); if(!gesture) return;
    const g=gesture;
    if(g.kind==='pinch') {
      if(pointers.size<2) return;
      const [a,b]=[...pointers.values()], center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const z=clamp(g.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance),0.001,6);
      view={x:center.x-g.anchor.x*z,y:center.y-g.anchor.y*z,zoom:z}; renderScene(); return;
    }
    if(g.kind==='pan') { view.x=g.view.x+p.x-g.start.x; view.y=g.view.y+p.y-g.start.y; renderView(); return; }
    const w=boundedPoint(toWorld(p));
    if(g.kind==='draw') {
      const last=g.stroke.points.at(-1);
      if(g.remaining>0&&Math.hypot(w.x-last[0],w.y-last[1])>.7/view.zoom) {g.stroke.points.push([w.x,w.y]);g.remaining--;}
    } else if(g.kind==='erase') {
      const len=Math.hypot(w.x-g.last.x,w.y-g.last.y), steps=Math.min(300,Math.ceil(len*view.zoom/5));
      for(let i=1;i<=Math.max(1,steps);i++) { const t=i/Math.max(1,steps); eraseAt({x:g.last.x+(w.x-g.last.x)*t,y:g.last.y+(w.y-g.last.y)*t}); }
      g.last=w;
    } else {
      const o=design.objects.find(o=>o.id===g.id); if(!o) return;
      if(g.kind==='move') {
        o.x=clamp(g.original.x+w.x-g.start.x,-10000,10000); o.y=clamp(g.original.y+w.y-g.start.y,-10000,10000);
        if(e.shiftKey) {o.x=Math.round(o.x/10)*10;o.y=Math.round(o.y/10)*10;}
      }
      if(g.kind==='resize') {
        const ratio=Math.hypot(w.x-o.x,w.y-o.y)/Math.max(1,g.distance);
        o.radius=clamp(g.original.radius*ratio,10,2000);
        const actual=o.radius/g.original.radius;
        if(o.type==='compound') {o.smallRadius=clamp(g.original.smallRadius*actual,5,o.radius-1);o.shaftRadius=clamp(g.original.shaftRadius*actual,2,o.smallRadius-1);}
        if(o.type==='ring') o.band=clamp(g.original.band*actual,4,Math.min(300,o.radius*.8));
        if(o.type==='motor') scaleMotor(o,g.original,actual);
        if(o.type==='text') o.fontSize=clamp(g.original.fontSize*ratio,8,120);
      }
      if(g.kind==='rotate') {
        o.rotation=(g.original.rotation+(Math.atan2(w.y-o.y,w.x-o.x)-g.angle)*180/Math.PI+720)%360;
        if(e.shiftKey) o.rotation=Math.round(o.rotation/15)*15;
      }
    }
    renderScene();
  });
  function pointerEnd(e) {
    pointers.delete(e.pointerId);
    if(stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if(gesture?.kind==='pinch') {if(pointers.size<2) gesture=null; return;}
    finishGesture(e.type==='pointercancel');
  }
  stage.addEventListener('pointerup',pointerEnd); stage.addEventListener('pointercancel',pointerEnd);
  stage.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId)){pointers.delete(e.pointerId);finishGesture();}});
  stage.addEventListener('wheel',e=>{e.preventDefault();zoomAt(Math.exp(-clamp(e.deltaY,-150,150)*.002),localPoint(e));},{passive:false});
  stage.addEventListener('contextmenu',e=>e.preventDefault());
  $('zoom-in').addEventListener('click',()=>viewMode==='3d'?zoomCamera(1.2):zoomAt(1.2,{x:stage.clientWidth/2,y:stage.clientHeight/2}));
  $('zoom-out').addEventListener('click',()=>viewMode==='3d'?zoomCamera(1/1.2):zoomAt(1/1.2,{x:stage.clientWidth/2,y:stage.clientHeight/2}));
  $('fit').addEventListener('click',fit);
  $('grid-toggle').addEventListener('click',()=>{const b=$('grid-bg');const hidden=b.style.display==='none';b.style.display=hidden?'':'none';$('grid-toggle').setAttribute('aria-pressed',hidden);$('grid-toggle').classList.toggle('active',hidden);if(viewMode==='3d')renderScene();});
  $('brush-size').addEventListener('input',()=>{$('brush-size-value').textContent=$('brush-size').value;});
  $('notes-toggle').addEventListener('change',()=>mutate(()=>{design.notes=$('notes-toggle').checked;}));
  $('design-name').addEventListener('change',()=>mutate(()=>{design.name=$('design-name').value.trim().slice(0,100)||'Untitled mechanism';}));
  $('undo').addEventListener('click',undo); $('redo').addEventListener('click',redo);
  function loadDriveStarter(generator) {
    mutate(()=>{design=generator?C.starterGeneratorDrive():C.starterMotorDrive();selectedId=design.objects.find(o=>o.type==='compound')?.id||null;});
    setViewMode('3d');fit();toast((generator?'Generator':'Motor')+' layout loaded with the working shaft extended outside the small pinion. Undo restores your previous sketch.');
  }
  $('starter').addEventListener('click',()=>loadDriveStarter(false));
  $('generator-starter').addEventListener('click',()=>loadDriveStarter(true));
  $('operating-mode').addEventListener('change',e=>{
    const next=e.target.value==='generator'?'generator':'motor';
    mutate(()=>{design.operatingMode=next;});
    toast(next==='generator'?'Generator mode: the shaft supplies mechanical input. Rotation directions and your geometry are preserved.':'Motor mode: the rings drive the output shaft. Your geometry is preserved.');
  });
  $('blank').addEventListener('click',()=>{mutate(()=>{design={version:1,name:'Untitled mechanism',operatingMode:'motor',objects:[],strokes:[],notes:false,camera:cameraDefaults()};selectedId=null;});setViewMode('2d');fit();toast('New sketch. Undo returns to your previous design.');});
  function fileName(extension) { return (design.name.replace(/[^a-z0-9 _-]/gi,'').trim().slice(0,70)||'soupy-design')+'.'+extension; }
  function download(blob,name) {
    const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function saveJSON() {
    if(gesture) finishGesture();
    download(new Blob([JSON.stringify(design,null,2)],{type:'application/json'}),fileName('json'));
    toast('JSON download started. Keep this file to reopen or share your editable design.');
  }
  $('save').addEventListener('click',saveJSON);
  $('load').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file) return;
    try {
      if(file.size>15*1024*1024) throw new Error('Choose a JSON file smaller than 15 MB.');
      const next=C.validateDesign(JSON.parse(await file.text()));
      mutate(()=>{design=next;selectedId=null;});if(viewMode==='2d')fit();else renderScene();toast('Design loaded. Undo returns to your previous sketch.');
    } catch(error) {toast('Could not load design: '+(error instanceof SyntaxError?'This is not a valid JSON file.':error.message));}
    e.target.value='';
  });
  $('export-toggle').addEventListener('click',()=>{$('export-menu').hidden=!$('export-menu').hidden;$('export-toggle').setAttribute('aria-expanded',!$('export-menu').hidden);});
  document.addEventListener('click',e=>{if(!e.target.closest('#export-menu')&&!e.target.closest('#export-toggle')) {$('export-menu').hidden=true;$('export-toggle').setAttribute('aria-expanded','false');}});
  async function exportFile(format) {
    if(gesture) finishGesture(); stopPreview(); $('export-menu').hidden=true; $('export-toggle').setAttribute('aria-expanded','false');
    if(format==='json') {saveJSON();return;}
    try {
      const svg=viewMode==='3d'?G.exportSVG(design,camera(),{width:1600,height:1100}):C.exportSVG(design), blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      if(format==='svg') {download(blob,fileName('svg'));toast('SVG download started. Includes all parts and ink.');return;}
      const url=URL.createObjectURL(blob);
      try {
        const img=new Image(); await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('The drawing could not be rendered. Try SVG export.'));img.src=url;});
        const factor=Math.min(2,4096/Math.max(img.width,img.height)), canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.width*factor));canvas.height=Math.max(1,Math.round(img.height*factor));
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('PNG could not be created. Try SVG export.');
        download(png,fileName('png'));toast(`PNG download started (${canvas.width} × ${canvas.height}).`);
      } finally {URL.revokeObjectURL(url);}
    } catch(error) {toast('Export failed: '+error.message);}
  }
  document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>exportFile(b.dataset.export)));
  $('help').addEventListener('click',()=>$('help-dialog').showModal());
  $('help-close').addEventListener('click',()=>$('help-dialog').close());
  document.addEventListener('keydown',e=>{
    if($('help-dialog').open) return;
    const editing=e.target.closest('input,textarea,select,[contenteditable="true"]');
    const key=e.key.toLowerCase(), mod=e.ctrlKey||e.metaKey;
    if(mod&&key==='s') {e.preventDefault();if(editing)e.target.blur();saveJSON();return;}
    if(mod&&key==='o') {e.preventDefault();$('file-input').click();return;}
    if(editing) return;
    if(mod&&key==='z') {e.preventDefault();e.shiftKey?redo():undo();return;}
    if(mod&&key==='y') {e.preventDefault();redo();return;}
    if(mod&&key==='d') {e.preventDefault();partAction('duplicate');return;}
    if(e.code==='Space') {if(e.target.closest('button,a,summary'))return;e.preventDefault();space=true;stage.style.cursor='grab';return;}
    if(mod||e.altKey) return;
    const shortcuts={v:'select',b:'draw',e:'erase',h:'pan'};
    if(shortcuts[key]){if(viewMode==='3d')setViewMode('2d');setTool(shortcuts[key]);}
    if(key==='f')fit();
    if(key==='delete'||key==='backspace') {e.preventDefault();partAction('remove');}
    if(key==='escape') {finishGesture(true);stopPreview();selectedId=null;setTool('select');render();}
    if(key.startsWith('arrow')&&selected()&&!selected().locked) {
      e.preventDefault();const step=e.shiftKey?10:1;
      mutate(()=>{const o=selected();o.x=clamp(o.x+(key==='arrowright'?step:key==='arrowleft'?-step:0),-10000,10000);o.y=clamp(o.y+(key==='arrowdown'?step:key==='arrowup'?-step:0),-10000,10000);});
    }
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;setTool(tool);}});
  window.addEventListener('blur',()=>{space=false;pointers.clear();cameraPointers.clear();cameraGesture=null;finishGesture();});
  window.addEventListener('pagehide',()=>{try{localStorage.setItem(STORE,snapshot());}catch(error){/* Save JSON remains available. */}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPreview();});
  const refreshSize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderScene,80);};
  if(typeof ResizeObserver==='function')new ResizeObserver(refreshSize).observe($('stage-wrap'));
  else window.addEventListener('resize',refreshSize);
  if(matchMedia('(max-width:700px)').matches)document.querySelector('.library details')?.removeAttribute('open');
  render();setTool('select');requestAnimationFrame(()=>viewMode==='3d'?renderScene():fit());
  $('save-status').textContent=storageAvailable?'Editor ready · autosave on this browser':'Editor ready · use Save to keep a JSON copy';
  if(recoveryMessage)toast(recoveryMessage);
  $('launch-notice').hidden=true;
})();

