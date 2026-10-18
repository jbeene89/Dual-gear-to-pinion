# Motor and generator layout update — 2026-10-18

The current motor and generator starters preserve the previous top/bottom gear arrangement and extend the shared shaft outward past the small, outermost pinion. The two sections have not been swapped. A mode selector changes the intended power flow while preserving edited geometry, rotation directions, and camera settings. Separate layout buttons load fresh motor or generator examples, with Undo available.

## Geometry verified

- The large section remains centered at X=256 and the small section at X=320; both have shaft height Z=10 and thickness 18.
- The base shaft remains 90 drawing units long. A 120-unit extension on the small-gear end changes its endpoints to X=243 and X=453. The working end is therefore 124 units beyond the small section's outward face at X=329.
- Both modes have exactly one compound pinion and two concentric annular machines, with the upper cap above the small section and the lower cap below the large section.
- The motor power-flow arrow points outward along +X; the generator arrow points inward along -X. The upper ring remains CW and lower ring CCW when viewed from above. Power-flow arrows are separate from rotation arrows.
- Working end and extension are editable. The outward-repair action chooses the shaft end farther from the ring center without moving either gear.

## Software checks

The complete regression run passed 94 tests: 67 core/renderer and 27 synthetic DOM integration tests. After the final part-label and 2D annotation changes, all seven drive-mode DOM tests passed again against the final 155,760-byte standalone HTML.

Coverage includes strict import validation, old-file defaults, unchanged legacy geometry, arbitrary shaft orientations, extension bounds, generator power-flow reversal, mode switching, camera preservation, drag/draw regression, undo/redo, autosave, JSON roundtrip, and SVG exports. All historical and current example JSON files validate.

Six current SVG previews were rasterized to PNG with Sharp. Angled and end-on views were inspected for the extended shaft and top/bottom placement. The PNG previews are independent rasterizations of the SVG exports; this does not retest the app's browser-canvas PNG download path.

These interaction checks execute the actual bundled scripts in jsdom with no resource loading or network. They do not establish behavior in the user's live browser. Earlier static shell/CSS checks are not integrated-app validation.

## Evidence limits

This is a schematic editor. Gear tooth profiles, contacts, clearances, bearings, structural loads, generator voltage, current, efficiency, thermal limits, and electrical control are not solved. Preview speeds and tooth counts are independent drawing settings, not a validated transmission. Changing mode does not simulate electrical power generation.

Open START.bat, then select **Load motor layout** or **Load generator layout** if an older browser copy is restored. The original ZIP releases and example designs remain available.
