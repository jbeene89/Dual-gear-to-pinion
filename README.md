# Soupy Gear Studio

A portable, offline sketching workspace for Soupy's twin-ring motor and generator concepts.

For the initial manufacturer comparison, control approach, and generator-power calculations, see [docs/MOTOR-GENERATOR-STUDY.md](docs/MOTOR-GENERATOR-STUDY.md). It uses labeled examples; no physical motor pair or output rating has been selected.

The editor also **checks the mechanism it is drawing**: whether the drawn sizes and tooth counts describe the same gear pair, how fast and which way each ring turns for a given shaft speed, and what power and bus current follow. See [Mechanism analysis](#mechanism-analysis) below and [docs/ANALYSIS-MODEL.md](docs/ANALYSIS-MODEL.md) for the model and its limits.

## Motor drive and generator layouts

The app opens in **3D orientation** with two concentric frameless motor rings at different heights. Each rotor carries an oversized, flat gear cap. The cap edge extends **downward as a toothed rim**, forming a cup around the motor. The **upper cap meets the top of the small pinion section** and the **lower cap meets the bottom of the large section** in the schematic. Both pinion sections share **one shaft outside the motor bodies**. Its working end extends outward past the small pinion, away from the motors. The new layouts add 120 drawing units at that end without moving either gear section. The initial low camera angle reveals the separation above and below the shaft; Front and Side offer straight-on views.

In both layouts, the **lower orange motor spins counterclockwise (CCW)** and the **higher teal motor spins clockwise (CW)**, viewed from above (+Z). Click **Preview rotation** to animate them. Motor labels and the parts list show each direction, and arrows are visible above the caps and below their skirts. Looking from underneath makes the apparent direction reverse. Select a motor and change **Direction** to reverse it yourself.


### Choose the power flow

Use **Operating mode** to label the current design as **Motor drive** or **Generator**:

| Mode | Intended power flow | Working shaft role |
|---|---|---|
| Motor drive | Electrical input → rings → shaft | Mechanical output |
| Generator | Mechanical input → shaft → rings → electrical output | Mechanical input |

Generator mode changes the intended power flow. It does **not** automatically reverse the parts' spin directions. The generator layout uses the same opposite ring directions as the motor layout. Rotation arrows indicate spin; the power-flow description identifies what drives what.

The generator view is a mechanical concept, with no electrical simulation or calculated voltage, current, power, or efficiency. Driven permanent-magnet machines can generate electricity; brushless output requires appropriate rectification and control for the intended load. See the manufacturer reference, [maxon: Motors as Generators](https://support.maxongroup.com/hc/en-us/articles/360004496254-maxon-Motors-as-Generators).

**Load motor layout** and **Load generator layout** each load the complete current arrangement. They are useful when the browser restores an older design. Either action can be undone to return to the previous design. Changing only Operating mode preserves the current geometry.

### Mechanism analysis

The **Mechanism analysis** panel reads the current design and reports what the
drawing implies. It never changes anything on its own; the repair buttons are
the only way back into the design, and each is a single undo step.

**Meshes.** For every ring or cap it finds the pinion section that comes
closest to touching it, identifies the contact face, and compares two
descriptions of the same pair: the ratio from the drawn sizes (`contact
radius / pinion radius`) and the ratio from the tooth counts. They agree only
when both members state the same module, which any real mesh requires. The
panel also checks that the faces actually touch, that contact lands on the
toothed band, centre distance for parallel pairs, and whether the tooth counts
share a factor.

The shipped twin-ring layouts **fail this check**, as their own notes always
suspected: both pinion sections state module 5, against 6.67 on the upper cap
and 7.11 on the lower. Two repairs are offered — restate the cap tooth counts
to 128 and 102 and keep every drawn dimension, or keep the tooth counts and
grow the pinion sections to 40 and 128, which the clearance check then flags
for driving the large section into the upper cap.

**Motion.** Enter a shaft speed and the panel derives each ring's speed and
direction from the mesh geometry rather than from the drawn arrows, then says
whether the arrows agree. The counter-rotation in these layouts is a
consequence of the caps meeting opposite faces of the pinion, not a setting:
reverse the shaft and both rings reverse together. Preview speeds are
independent drawing settings, and one button puts them in step with the
ratios.

**Power.** Set the duty point — mm per drawing unit, shaft rpm and torque, how
the torque splits between the two machines, bus voltage, and gear, machine,
and converter efficiencies — and the panel reports each machine's ring torque
and speed, its electrical power, and the bus current, with the totals. Bus
current is total power over bus voltage; it is not a machine phase current.

The duty point is stored separately from the design, so version 1 JSON files
are unchanged and still load everywhere.

**Transmission and flux (Addendum 2).** Below the power table the panel
models the design plan's transmission layer, as parameters rather than
geometry: each plate's station — its face, or internal teeth inside its rim,
with the rim count following from a rim radius and module you set — the
selector pinion's slide state, which sets preload only and never a ratio,
and the ring senses each station pairing implies, with any pairing that
would land the rings turning the same way flagged illegal. A seesaw tilt
steers the shared magnet band's flux between the two machines on a cosine
law, through three detents — flat to the lower machine, the W split, flat
to the upper — and a check beside it asks whether the W's repeat count
divides both machines' pole-pair counts, the condition for the zigzag to
act as a harmonic notch. These settings are stored separately from the
design, like the duty point.

**What a pass means.** Only that the drawing is internally consistent. Tooth
profile and the right-angle form these faces would need, contact stress,
backlash, bearing loads, thermal limits, machine envelopes, and electrical
behaviour are all untouched. The canvas still says **Schematic only**.

### Adjust the mechanism and view

- Drag the 3D view to orbit. Shift-drag, middle-drag, or right-drag pans. Scroll or pinch to zoom.
- Use **Angled**, **Top**, **Front**, **Side**, **Under caps**, and **Reset** for camera presets. Use **Under caps** to see the motor bodies beneath the overhanging caps. The camera's heading, elevation, and roll sliders change only the viewpoint.
- Select the compound pinion to edit **Shaft heading**, **Shaft tilt**, **Height Z**, **Section spacing**, **Shaft length**, **Shaft extension**, and **Working end**. Shaft length controls the symmetric base length; Shaft extension adds length beyond one end. Working end chooses the small-gear or large-gear end. The current layouts extend the small-gear end outward (+X in the starter) by 120 drawing units. Both sections always share the same shaft axis. Tilt 0° is radial/in the ring plane; 90° is parallel to the rings' center axis.
- **Point shaft toward rings** turns the selected compound pinion toward the ring center. It preserves your part positions and dimensions. Use **Load motor layout** or **Load generator layout** for the complete new arrangement; Undo restores the previous design.
- Select a motor to edit **Motor body radius**, **Motor ring width**, **Cap radius**, **Cap hole radius**, **Cap plate thickness**, **Downturned rim depth**, and **Rim wall width**. The rim depth is measured downward from the cap top. Increasing it extends the skirt below the plate. Height Z locates the motor body's center; its cap stays attached on top.
- Motor stator, rotor, and gear cap colors are independent. Rotation preview leaves the stator fixed and turns the rotor and cap together. Resizing the motor body also scales the cap's planar dimensions; cap size can then be adjusted separately.
- Camera settings and shaft orientation are preserved in saved JSON. PNG/SVG exports use the active view: 3D exports show the camera angle; 2D exports show the sketch.
- **2D sketch** retains direct part dragging, resize/rotate handles, and freehand drawing. It shows the compound at a single layout center; section spacing and shaft tilt are represented in 3D. Drawn ink is shown on the XY plane in 3D.

Existing JSON files and browser copies still load. Your earlier designs keep their original parts and orientations. If you see an earlier arrangement, click **Load motor layout** or **Load generator layout**. Undo returns to your previous design.

This is an orientation study with stylized extruded teeth. Turning the shaft does not convert the teeth into validated bevel, crown, face-gear, or other right-angle meshing profiles. The app does not establish that the displayed contact or mechanism is physically workable.

## Open it

Double-click **START.bat**. On Windows, this explicitly opens Microsoft Edge or Google Chrome so file-association settings cannot send the app to a static preview. Alternatively, right-click **index.html**, choose **Open with**, and select your browser. No installation, account, internet connection, or server is needed. The entire app is inside `index.html`; you can copy that one file to another computer.

If the layout appears but nothing responds, look for **Editor ready** underneath the design name. If instead a yellow notice says the interactive editor is not running, you are in a preview or a browser that is not running the scripts. Open the extracted app through **START.bat**. The notice disappears after the editor starts successfully.

On a phone or tablet, serve the same HTML file from any static website. The layout adapts to touch screens, with the parts list and Selection panel below the drawing. No remote service is required by the app.

## Make a design

- Add as many motor/cap assemblies, gears, rings, compound pinions, arrows, and text labels as needed, within the displayed design limits.
- Select a part on the canvas or in the parts list. Drag to move it; drag its square handle to resize or round handle to rotate. Hold Shift to snap movement to 10 units or angles to 15 degrees.
- Use **Selection** to enter exact positions, radius, angle, tooth counts, colors, and clockwise/counterclockwise direction. Compound pinions have independent large/small radii, tooth counts, and colors, with a shared shaft.
- Rings can have internal or external teeth. Changing tooth count does not automatically change radius: this is a sketching tool.
- **Draw** uses your selected brush color and width. **Erase** removes entire ink strokes touched by the eraser. Remove a gear with **Remove part** or Delete.
- **Pan** moves the view. Scroll, pinch, or use the zoom buttons to zoom. **Fit** brings all content back into view. Two-finger gestures pan and zoom on touch screens.
- Duplicate, reorder, or lock parts using Selection. Locks prevent accidental canvas dragging; fields remain editable.
- **Preview rotation** temporarily animates the parts using their independently editable direction and speed. Stopping restores the saved angles. Preview does not alter a design or calculate meshing.

## Keep and share your work

**Save** downloads a JSON design with all parts and freehand strokes. **Load** reopens that JSON file. A best-effort browser copy also restores the last design on the same browser and file location. Keep a JSON file for reliable backup and transfer; browser storage can be cleared or unavailable.

**Export** offers PNG, SVG, and editable JSON. A 2D image includes all sketch content regardless of pan or zoom and excludes selection handles and the working grid. A 3D image uses your camera orientation, zoom, and pan, with a reference ground grid; use **Fit** before exporting if you want the complete mechanism visible. PNG exports are capped at 4096 pixels on the longest side. SVG retains scalable vector shapes and text. Both image formats include the schematic disclaimer.

Undo/redo covers part edits, moving, resizing, rotating, ink, erasing, loading a design, and starting fresh. Each gesture is one undo step. History holds up to 60 steps in the current session; it is not saved in JSON. View changes do not consume undo steps.

## The current motor and generator starters

Both starters contain **two concentric motor/cap assemblies and exactly one compound pinion with one shared shaft**, represented by three editable parts. The shaft is an output in motor mode and an input in generator mode:

| Part | Body radius | Cap radius | Cap teeth | Intended engagement |
|---|---:|---:|---:|---|
| Higher, larger motor | 240 | 320 | 96 | Top of small pinion section |
| Lower, smaller motor | 150 | 270 | 72 | Bottom of large pinion section |

Both motor centers are at X/Y (0, 0). The higher body's center is Z=100; the lower body's center is Z=-112. Both bodies are 40 units thick and their cap plates are 12 units thick. The upper cap plate spans Z=120 to 132 and its downward rim ends at Z=40 (depth 92). The lower cap plate spans Z=-92 to -80 and its rim ends at Z=-100 (depth 20).

The shaft axis is at Z=10. The small pinion's nominal top is Z=40, matching the upper rim's lower edge. The large pinion's nominal bottom is Z=-80, matching the lower cap's upper face. The upper flat plate is 20 units above the large pinion's nominal top. These relationships express the requested top/bottom arrangement; they do not validate tooth contact.

The compound's center is (288, 0, 10), with heading 180°, tilt 0°, and section spacing 64. Its large section has radius 90 and 36 teeth at X=256; the small section has radius 30 and 12 teeth at X=320. The gear positions stay unchanged from the previous top/bottom arrangement. A 120-unit extension continues the working shaft outward (+X) past the small gear, beyond the existing symmetric shaft base. The shaft and section thicknesses lie beyond the largest motor body's radius. These are illustrative placement values, not validated mating or clearance dimensions. Cap and pinion silhouettes can intersect in this schematic; the app does not solve contact.

The current layouts are in `examples/motor-outboard-shaft.json` and `examples/twin-ring-generator.json`. Their preview filenames begin with `Motor-outboard-` and `Generator-input-`. Earlier arrangements remain in `examples/top-bottom-pinion.json`, `examples/frameless-geared-caps.json`, `examples/twin-ring-starter.json`, and `examples/twin-ring-3d.json` for continuity. Earlier preview images and validation reports describe those earlier releases, including the `Top-bottom-` previews.

**This is schematic geometry, not validated gear meshing or manufacturing CAD.** Radii are drawing units. Teeth are stylized, not involute profiles. The analysis panel checks module consistency, contact placement, gross interference, speeds and directions, and a loss-chain power estimate; it does not solve tooth profile, phase, backlash, undercut, contact or bending stress, bearing loads, lubrication, thermal limits, machine envelopes, or electrical control. A sketch, an export, or a passing check is not evidence that a mechanism will work.

## Keyboard

| Key | Action |
|---|---|
| V / B / E / H | Select / Draw / Erase / Pan |
| Space + drag | Temporarily pan |
| F | Fit design |
| Arrow keys / Shift + arrows | Move selected part 1 / 10 units |
| Delete or Backspace | Remove selected part |
| Ctrl/Cmd + D | Duplicate selected part |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y | Redo |
| Ctrl/Cmd + S | Download JSON |
| Ctrl/Cmd + O | Load JSON |
| Escape | Cancel gesture / stop preview / clear selection |

Editing fields keeps normal text-entry shortcuts. Canvas-only shortcuts do not run while typing.

## File limits and source

Version 1 JSON remains compatible with earlier designs. The optional design field `operatingMode` stores `motor` or `generator`; compound parts store `shaftExtension` and `shaftEnd` for the one-sided working end. Older files without those additions still load with their original geometry. Starter factories are `starterMotorDrive()` and `starterGeneratorDrive()` in `src/core.js`.

Version 1 JSON accepts up to 200 parts, 2,000 ink strokes, and 200,000 ink points. Imports are checked before changing the open design. Invalid or unsupported files leave the current design intact. Colors and identifiers are validated; labels are rendered as text. No uploaded file is executed, and the app makes no network requests. Analysis duty-point settings are stored under their own browser key and are not part of the design file.

## Source and tests

Readable source is in `src/`:

| File | Role |
|---|---|
| `src/core.js` | Geometry, the version 1 file format, and the starter factories |
| `src/three-d.js` | The 3D schematic mesh, camera, and label placement |
| `src/mechanics.js` | Mesh, kinematics, power, clearance, and the repairs |
| `src/app.js` | The editor: state, rendering, input, and import/export |
| `src/styles.css`, `src/shell.html` | Presentation and the page the build fills in |

Rebuild the standalone file with **node build.cjs**. Node is needed only to
rebuild, never to use the delivered app.

```
node build.cjs        # write index.html from src/
npm test              # 36 unit checks, no dependencies
npm run test:browser  # 23 checks driving the built file in Chromium
```

`npm test` needs nothing but Node. `npm run test:browser` needs Playwright
and drives the real `index.html`: it starts the editor, reads the analysis
panel, applies a repair and undoes it, changes the duty point, checks that no
part label lands on the model in any camera preset, and checks that the layout
does not overflow at phone width.



