# The analysis model

`src/mechanics.js` turns a sketch into numbers. It answers three questions the
drawing alone cannot, and it is explicit about the many it does not touch.

1. Do the drawn sizes and the drawn tooth counts describe the same gear pair?
2. Given one shaft speed, how fast and which way does each ring turn?
3. For a chosen torque and speed, what power and bus current follow?

It is a consistency and sizing aid. It is not a gear design program, and a
design that passes every check here is not thereby buildable.

## Conventions

Lengths are drawing units. `scale` (mm per drawing unit) converts them for
display; it does not change any ratio. Rings turn about **+Z**, and `ccw`
means counterclockwise seen from +Z. A compound's shaft axis is the unit
vector

```
â = (cos t · cos y,  cos t · sin y,  sin t)        y = shaftYaw, t = shaftTilt
```

and `ccw` on a compound means its angular velocity points along **+â**. These
are the renderer's own conventions, so the analysis and the drawn arrows
cannot drift apart.

## Finding a mesh

A **wheel** is anything turning about +Z that can carry teeth: a motor's
geared cap, a ring, or a plain gear. A **pinion section** is one of the two
discs on a compound's shaft. For each wheel the model takes the pinion section
that comes closest to touching it, and reports the result whether or not it is
close.

Two configurations are modelled, chosen by shaft tilt:

| Tilt | Configuration | Contact |
|---|---|---|
| within 15° of 0° | **Right angle** — the shaft lies in the ring plane and the axes cross at 90° | The pinion's pitch cylinder rolls on an axial face of the wheel: a crown/face-gear arrangement |
| within 15° of 90° | **Parallel** — the shaft is along the ring axis | Ordinary spur mesh where the pitch circles touch |
| anything else | **Oblique** | Reported, not modelled |

For the right-angle case the two candidate faces are the **bottom edge of the
downturned rim** (meeting the top of a pinion) and the **top of the cap plate**
(meeting the bottom of a pinion). This is exactly the arrangement the twin-ring
layouts describe.

## Equal module

A real pair needs the same module on both members. For a pinion of pitch
radius `r` with `z_p` teeth and a wheel of `z_w` teeth contacting at radius `R`:

```
m_pinion = 2r / z_p
m_wheel  = 2R / z_w
```

`R` is **where the pinion actually sits**, measured from the ring axis to the
section's centre — not the cap's outer radius. A cap drawn 270 units across
that the pinion meets at radius 256 is a 256-radius mesh.

Two equivalent ratios follow, and they agree only when the modules do:

```
g = R / r = shaft rpm / ring rpm        (from the drawn sizes)
g = z_w / z_p                           (from the tooth counts)
```

Also checked: axial contact (do the faces touch), whether contact lands on the
toothed band, centre distance for parallel pairs (`R ± r`, internal or
external), and whether the tooth counts share a factor. A shared factor is a
note, not a failure: a hunting ratio spreads wear, but plenty of real gearing
is not hunting.

## Direction and speed

With the ring axis **ẑ**, a radial shaft **â**, a pinion of radius `r` at
distance `R`, and contact on the pinion's top (`s = +1`) or bottom (`s = −1`),
rolling without slip gives

```
Ω = −σ · s · (r / R) · ω            σ = sign(â · d̂),  d̂ = radial unit vector
```

so the ring's sense depends on which face is driven and on which way along its
own axis the shaft points. For the shipped layout — upper cap on the small
section's top, lower cap on the large section's bottom, shaft along −x̂ with
the sections at +x — this returns **upper CW, lower CCW seen from above**,
which is what the layouts have always claimed. The counter-rotation is a
consequence of using opposite cap faces, not a setting.

For parallel axes an external pair counter-rotates and a pinion inside a ring
co-rotates.

Preview speeds in the editor are independent drawing settings. The model
reports the speed each ring *should* run at to stay in step with the shaft,
and the motion repair writes those values in.

## Power

Mechanical power at the shaft is

```
P = T · N · 2π / 60              T in N·m, N in rpm
```

Each mesh carries a share of shaft torque that the designer chooses — the
split depends on how the two machines are controlled, not on geometry. For
share `a` on a branch of ratio `g`:

| | Generator (shaft in) | Motor drive (shaft out) |
|---|---|---|
| Ring torque | `a · T · η_gear · g` | `a · T · g / η_gear` |
| Ring speed | `N / g` | `N / g` |
| Electrical | `P_ring · η_machine · η_conv` | `P_ring / (η_machine · η_conv)` |

Bus current is total electrical power over bus voltage. **It is not a machine
phase current**, and the two are not interchangeable when choosing a winding
or a controller.

## Repairs

Each repair returns patches; the editor applies them in one undoable step and
runs the result through the importer, so a repair cannot leave a design the
app would refuse to open.

- **Match teeth to the drawn sizes** — keeps every drawn dimension and
  restates the wheel tooth counts as `round(2R / m_pinion)`. When no whole
  number lands on the drawn radius, the shortfall is reported rather than
  hidden.
- **Match sizes to the teeth** — keeps the tooth counts, resizes the pinion
  sections to `m_wheel · z_p / 2`, and re-seats the caps (rim depth for a cap
  above, height for a cap below) so the faces still touch.
- **Put rotation and preview in step** — writes the derived sense and the
  ratio-correct preview speed onto each wheel.

## Clearance

A pinion section is a disc standing on edge: it occupies a Z band as tall as
its diameter and a radial band from the shaft's distance out to the disc's
corner, `√(d² + r²)`. Where that volume overlaps solid metal on a wheel it is
not meshing with, the overlap is reported with its depth. This is a gross
interference check between simplified volumes, not a clearance study.

## What is not solved

Tooth profile and the specific right-angle form these faces would need
(bevel, crown, face gear, or something else); profile shift, undercut, and
contact ratio; contact and bending stress; backlash and lash under load;
bearing reactions, shaft deflection, and the overhung load on an extended
shaft; lubrication; thermal limits; machine torque/speed envelopes, windings,
and cooling; converter behaviour, control, and stability; manufacturing
tolerance and assembly.

Nothing here is evidence that a mechanism will work. It is evidence that the
drawing is, or is not, internally consistent — which is the cheapest of the
many questions, and the only one worth answering first.
