# Mechanism analysis release — 2026-10-18

This release adds `src/mechanics.js` and the **Mechanism analysis** panel, and
restores the `src/` + `build.cjs` layout the README has always described. It
changes no geometry and no file format.

## The source split is faithful

The delivered `index.html` was split into `src/styles.css`, `src/core.js`,
`src/three-d.js`, `src/app.js`, and `src/shell.html`, and rebuilt. The
rebuild was **byte-for-byte identical** to the original 155,760-byte file
before any new code was added, so nothing was lost or silently altered in the
split. The current build is 202,952 bytes.

## What the analysis reproduces

Checked against figures derived independently by hand and against the sizing
study:

| Quantity | Expected | Computed |
|---|---|---|
| Upper mesh ratio from teeth | 96/12 = 8 | 8 |
| Upper mesh ratio from radii | 320/30 ≈ 10.67 | 10.667 |
| Lower mesh ratio from teeth | 72/36 = 2 | 2 |
| Lower mesh ratio from radii | 256/90 ≈ 2.84 | 2.844 |
| Shaft power, 100 N·m at 300 rpm | 3.14 kW | 3141.6 W |
| Derived ring senses | upper CW, lower CCW from above | matches the drawn arrows exactly |

The derived senses are worth stating plainly: the rotation directions the
layouts have always asserted were **not** checked against the geometry before.
They are now, and they are correct — the counter-rotation follows from the two
caps meeting opposite faces of the pinion.

The sizing study's lower-ratio figure of 270/90 = 3 used the cap's outer
radius. The rolling radius is where the pinion sits, X=256, giving 2.844. The
study has been corrected.

## What the analysis finds wrong

Both shipped twin-ring meshes fail the module check: the pinion sections state
module 5 against 6.67 on the upper cap and 7.11 on the lower, 33% and 42%
apart. They cannot turn as drawn.

Applying **Match teeth to the drawn sizes** gives 128 and 102 teeth and clears
both failures. The upper mesh becomes exact (module 5.00 on both members); the
lower keeps a 0.4% residual because 2 × 256 / 5 = 102.4 teeth and no whole
number lands on the drawn radius. The panel states that residual rather than
rounding it away.

Applying **Match sizes to the teeth** instead also clears the module check, and
the clearance check then reports that the enlarged large section passes through
the upper cap plate. That is a genuine consequence of the repair, not a defect
in it, and it is why the tooth-count route is offered first.

By contrast the **legacy parallel-axis starter was already fully consistent** —
module 5 on all four members, centre distances exactly 240 − 30 and 120 + 90.
The inconsistency entered with the capped-motor layout.

## Software checks

59 automated checks, all passing:

- **36 unit checks** (`npm test`, Node only) across mesh detection and face
  identification, contact radius, module and ratio consistency, millimetre
  scaling, the parallel-axis and oblique cases, direction derivation and shaft
  reversal, ring speeds, shaft power, generator and motor power chains, zero
  bus voltage, all three repairs, non-integer tooth counts, clearance
  detection, file-format limits after repair, empty and pinion-less designs,
  settings clamping, plus the existing format and starter guards.
- **23 browser checks** (`npm run test:browser`, Chromium via Playwright)
  driving the built `index.html`: the editor starts with no console errors,
  the panel renders both meshes with the right numbers, a repair applies and
  undoes as one step and is written to the browser copy, duty-point changes
  flow through to the power table, generator mode is reflected, no part label
  lands on the model in any of the four camera presets, the foreshortened
  power-flow tag parks below the model, and there is no horizontal overflow at
  390 px.

The unit suite was mutation-tested: flipping the direction sign, substituting
the cap radius for the contact radius, and dropping a stage from the loss
chain each produced failures (2, 5, and 1 respectively). The suite is not
vacuous.

## Label placement

Straight-on cameras previously stacked part labels on top of the model. Labels
that would cover another part now drop below the whole model, keep a dashed
leader back to what they name, and the fit reserves a band for them so the
stack clears the zoom controls. The angled default view keeps its former
appearance apart from the leaders.

## Evidence limits

These checks establish internal consistency of the drawing and the arithmetic
of the stated model. They establish nothing about tooth profile, the
right-angle form these faces would need, contact or bending stress, backlash,
bearing and shaft loads, lubrication, thermal behaviour, machine envelopes,
converter control, or manufacturability. The browser checks run one Chromium
build headlessly and do not establish behaviour in every browser. A passing
analysis is not a validated mechanism.
