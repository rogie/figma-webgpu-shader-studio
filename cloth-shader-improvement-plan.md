# Cloth shader improvement plan

Prioritize smooth silhouettes, continuous highlights, and natural release motion in the straight-on view. Start with the visual prototype below on the current solver. Establish the surface and overlap behavior before changing the solver schedule.

## Implemented Shader Studio effect

[cloth-studio.ts](./cloth-studio.ts) includes both surfaces. New effects start with Cotton, Auto grid, High definition, and Smooth relief. Folding mesh uses genuine geometric depth and composites the nearest two cloth layers. Its grip tracker samples the same refined triangles used for picking. The mesh solver gives nearby, non-adjacent cloth layers a contact thickness and uses their positions at the start of each substep to preserve their ordering. The renderer composites two translucent layers.

The standalone file passed 15 local Chrome WebGPU replays using Shader Studio’s module loader on Apple Metal. Checks covered all three materials on both surfaces, pin and grid changes, material switching during a grab, resize with an unchanged or changed grid, tap and drag, and fixed 30 Hz, fixed 60 Hz, and alternating 8/20 ms intervals. A uniformly half-transparent input retained alpha 128 across the entire 512 × 512 relief image during a diagonal pull. In the folding mesh, two overlapping half-transparent layers produced alpha 192. These automated replays included GPU validation and particle or pixel readback. A hands-on trackpad session and comparison to a filmed fabric sample remain aesthetic review steps.

The mesh combines final strain correction and bounds handling. It retains the eight-neighbor aerodynamic normal and both High definition shear passes. Timing ranges overlapped across six rotating runs per variant on this device, and removing a shear pass changed the rendered fold.

### Pinned-fold correction

The first folding mesh allowed distant parts of the same sheet to intersect. The revised mesh indexes nearby cloth quads in 3D, tests particles against their triangles, and separates contacting layers after the stretch and bend constraints. Constraint corrections feed back into velocity to support resting folds. A compliant depth limit and monotonic depth mapping preserve depth differences in a compressed stack. Shallow folds use shorter substeps and an extra contact iteration.

On an opaque, 480 × 320 test sheet pinned at the top corners, the original mesh had 2,539 intersecting triangle pairs summed over twelve sampled poses. The revised mesh had zero in those samples, including poses with thousands of back-facing triangles. Another 50 sampled frames covered a sideways pull and release at normal and shallow depth. No non-adjacent triangle crossings were detected in those frames. The check reconstructs the refined render triangles and counts strict edge-through-face intersections. It does not certify every possible gesture or coplanar contact.

## Grid test results

Replayed the pasted shader through Shader Studio’s module loader in a local headless Chrome WebGPU harness on Apple Metal. Each run used a 512 × 512 checkerboard with lettering and a transparent cutout, High definition, two solver cycles, default pinning and a 5% grab radius. The same 60 Hz replay poked the center, pulled from (85, 95) to (300, 260) over 600 ms, held for 200 ms and released. Only the base cell count varied between visual runs. [Full-resolution comparison](./cloth-grid-comparison.png)

| Cells per side | Particles | Appearance 300 ms after release | GPU compute time during the pull and hold¹ |
|---|---:|---|---:|
| 64 | 4,225 | Broad curl around the upper-left lettering | 0.074 ms |
| 88 | 7,921 | A narrower curl with a defined returning edge | 0.071 ms |
| 112 | 12,769 | A longer pointed fold still extends toward the drag target | 0.075 ms |

¹ Median of nine run means per density, with 48 timed frames per run and rotating run order. Individual GPU timestamps advanced in roughly 0.066 ms increments, and the run ranges overlapped. Submit-to-completion wall time had a median of 0.30 ms for each. These measurements cover an isolated shader on one device. Repeat in the full Studio preview at representative layer sizes before choosing performance defaults.

## First prototype — smooth rendering and stable overlap

Compare two versions of the same gesture before committing to a renderer. Favor the height field when every part of the artwork must stay visible. Favor the refined mesh when the defining interaction is lifting an edge over another fold.

1. **Keep 88 simulation cells as the visual reference.** Feed the exact same simulated poses into the current renderer and a second renderer with two render intervals per physics cell in each direction. On the square reference this gives 177 × 177 render vertices from 89 × 89 particles. Use a bounded smooth patch over neighboring particles, with shared boundary positions and consistent tangents. Merely splitting each flat triangle preserves its facets. Preserve material UVs and pin targets, derive normals from the reconstructed surface, and sample the input at full output resolution. Compare silhouette, texture distortion, and highlights at actual size and 2× zoom. Measure the extra surface evaluation and draw cost separately.
2. **Use the same surface for picking.** Draw the one-pixel pick pass from the refined surface with the same depth, UV, and alpha rules as the color pass. During dragging, evaluate the grabbed UV on that surface for the grip correction. Test the tip, both sides of a fold, and a transparent cutout. A visible fold should stay under the pointer throughout the pull.
3. **Diagnose cut-through on frozen poses and during release.** At peak pull on the 88-cell grid, the measured depth range was 0.075–0.767, inside WebGPU’s 0–1 clip range. Of 15,488 triangles, 176 reversed their projected winding. No particle reached the configured depth cap, and 529 particles extended beyond the layer boundary. These are distinct effects. At 300 ms after release, 168 triangles still had reversed winding. A reversal identifies a projected fold-over, not a physical intersection. Compare current grip-biased depth with depth from cloth geometry alone on the identical pose. Inspect the release in motion for isolated triangles switching which layer appears in front. If sections physically cross, prototype local cloth-to-cloth separation with a small contact thickness. Include the refined surface in verification because smoothing can introduce fresh intersections. [Cloth contact and collision-aware subdivision](https://graphics.stanford.edu/papers/cloth-sig02/)
4. **Prototype a height-field alternative if the design requires zero hidden artwork.** Keep material coordinates fixed in the image plane and simulate a single height per point, lighting it from continuous slopes. A small optional one-to-one in-plane warp can suggest tugging while keeping the artwork visible. Compare the same gesture side by side. This version can show ripples, ridges, and a raised pinch. The mesh version can turn an edge over and reveal the fold underneath.

**Visual acceptance.** Inspect a plain mid-gray fill under a grazing light for triangle-shaped highlights, a curved outer edge for straight segments, and lettering for abrupt jumps. Replay a slow fold crossing and release. Require a continuous silhouette, stable overlap order, and agreement between visible and picked surfaces. If the grasp still forms a long tent-like point, test a broader grip falloff at the same grid density before increasing mesh resolution. For artwork that must stay inside the frame, test a more strongly retained border separately.

## Interaction and material polish

Use one real fabric as the motion reference. A short straight-on clip of a matte cotton sheet under side light, pinched, pulled diagonally, held, and released, gives a concrete target for grip width, fold travel, and settling time. Compare the first few frames and the first half-second after release at normal playback speed.

| Priority | Change to try | Acceptance test |
|---|---|---|
| 1. Make a small tug feel small | Pick immediately on press. Compare the current full poke with a shallow contact response, then commit to a poke on tap release or ramp lift with drag distance. Current drags begin with a backwards poke and then target at least 90% of the depth setting as soon as they cross the drag threshold. Keep the picked patch anchored while the target height ramps. | Tap, drag five pixels, then perform a long diagonal pull. The tap feels responsive, the tiny drag makes a shallow fold, and the longer pull develops a continuous ridge. Check mouse and trackpad. |
| 2. Preserve the artwork’s color at rest | Normalize lighting against the same light evaluated on a flat, face-on surface. The current equation gives a flat patch a 1.102× RGB multiplier at default Lighting, before target-format clamping. Keep the fold’s light and dark sides legible with a matte highlight. | Compare flat gray, near-white, saturated colors, and a photo against the original. A flat interior patch reproduces its source color within render-target rounding. A shallow fold stays legible as it moves. |
| 3. Test soft edges in motion | Replay a fold crossing behind feathered artwork and antialiased type on both light and dark backgrounds. The mesh draw writes depth for alpha values of 0.002 and above and has no color blending. If the rear fold disappears through a translucent foreground, prototype a premultiplied, depth-ordered transparency path for the mesh renderer. | Feathered edges reveal the rear artwork at intermediate opacity. Fine lettering stays readable and free of crawling edges through a slow drag. |
| 4. Tune bending separately from stretch | If the mesh still forms a pointed crease after tuning the grip, compare its two-cell distance bend constraint with resistance to the angle between adjacent faces. Keep in-plane stretch settings fixed. Start with internal tuning at 88 cells, then check horizontal and diagonal pulls at 64 and 112. | Compare fold width, distortion of lettering, release motion, and compute time. Adopt the more involved model only if the improvement is visible at normal playback speed. [Discrete Shells](https://multires.caltech.edu/pubs/ds.pdf) |

## Material dropdown

Offer three art-directed starting points. Use Cotton as the reference for new effects once its motion is approved.

| Material | Target on the same diagonal pull | Surface |
|---|---|---|
| Cotton | A rounded ridge follows the grab and relaxes in a soft return. | Matte, with broad highlights. |
| Silk | A light pull gathers narrower folds. A small ripple follows the release. | A restrained sheen travels along the folds. |
| Canvas | The pull moves a wider patch into a broad bend. Small ripples die out quickly. | Matte, with a wide, subdued highlight. |

Material selects a response profile for bending, damping, and sheen. Existing Stiffness, Damping, and Lighting values adjust that profile. Preserve their stored values when switching materials and use the existing response for saved effects that have no Material value. Keep Grid and Quality independent. Switch materials on the current pose and ease the response over several frames so the cloth stays under the pointer.

Validate all three at the same grid density, lighting setting, and input gesture. Review motion first on plain gray, then use artwork to judge highlight strength and color fidelity. Ship each choice when its response is recognizable at normal playback speed.

## Grid control

Use a **Grid dropdown** with **Auto**, **Coarse (64)**, **Standard (88)**, and **Fine (112)**. Numbers are target cells along the shorter side before aspect and buffer limits. Discrete choices avoid repeated simulation resets while scrubbing. Missing or Auto values follow the existing 48/88/132 Quality mapping and its original caps, preserving saved effects. An explicit Grid choice controls only simulation density. Quality continues to select solver cycles. Use a quality-independent vertex cap for explicit choices and keep the existing dimension ceiling.

Change the topology only when the resolved rows or columns change. Check every Quality setting at fixed Grid, then every Grid setting at fixed Quality. Include wide, tall, and square layers. The refined draw mesh is an internal rendering choice and can be tuned separately.

## 1. Capture a baseline in Shader Studio

Use the pasted shader as the reference. Start with High definition, default controls, and a square layer containing a checkerboard, lettering, and a transparent cutout. Record the same timestamped pointer path for each build: poke the center, drag a corner diagonally across the layer, hold the fold, then release. Include an idle-wind interval. Save frames at peak fold and after release.

Record the grid dimensions, compute dispatches per substep, output dimensions, and median and 95th-percentile frame time. Repeat each timing run on the same device after warm-up. If the host exposes GPU timings, record compute time separately. Keep particle readbacks and screenshot capture out of timing runs.

## 2. Fuse the last two compute passes

**Edit** the final cycle in the substep loop. Have its strain solver pass the corrected particle directly to the bounds, velocity, and tether calculations from `finalizeState`. Finalization must consume the corrected current and previous positions and preserve `pos.w`, which controls front-fold ordering. Earlier cycles still run ordinary strain limiting. Preserve pin handling and invalid-position recovery.

**Accept when** steady-state dispatch counts fall from 8 to 7 on Performance, 14 to 13 on High definition, and 20 to 19 on Ultra, per substep. Compare current and previous positions and grip depth after one substep against the baseline within float tolerance. Replay the full gesture in each pin mode. Check drawing and picking on consecutive frames, since removing one dispatch changes which particle buffer holds the result.

## 3. Preserve folds across same-grid resizes

**Edit** topology setup in `render`. Recalculate the target rows and columns when the quantized output size or quality changes. Recreate the particle, rest, and index buffers only when those grid dimensions change. On a same-grid resize, retain the active buffer and warm-up state. Resize the output depth texture and clear the old pointer grab as today.

**Accept when** a folded 512 × 512 High definition layer resized to 1024 × 1024 keeps its 89 × 89 particle grid and fold, with zero simulation-buffer allocations. Grab the fold again at its new pixel coordinates. Then resize to 1024 × 512 and verify the changed grid rebuilds once and picking still lands under the pointer.

## 4. Stabilize release motion across frame rates

**Edit** the timestep handling shared by `impulse` and `integrate`. Track the last completed simulation substep duration. Convert carried displacement to current-step units with `dt / previousDt` exactly once, before mixing in a fresh poke or throw. On frames without an impulse, apply the conversion in the first integration. Later equal-duration substeps use a ratio of one. Initialize the ratio to one on a fresh grid and retain the existing velocity caps.

**Accept when** a fixed 60 Hz replay matches the reference and release distance varies less across 30 Hz, 60 Hz, and alternating 8/20 ms frames. Sample displacement of the grabbed patch at equal elapsed times after release. Include a slow frame immediately before release and a speed-slider change while cloth is moving. Check that the existing long-gap cancellation still works.

## 5. Run two independent performance experiments

| Experiment | Change | Decision |
|---|---|---|
| Cheaper aerodynamic normal | In `integrate`, estimate the normal from left, right, top, and bottom positions. Preserve edge handling, orientation, and the fallback for a collapsed patch. Keep the full `surfaceAt` calculation for rendering. | Keep if timing improves beyond run-to-run variation and tight folds release cleanly. Test positive, negative, and zero wind. Moving cloth still experiences aerodynamic drag at zero wind. |
| Fewer shear passes | On High definition, run diagonal shear in the first solver cycle only. Keep the structural, bending, and strain-limit passes at their current frequencies. | This takes the fused schedule from 13 to 12 dispatches per substep. Keep if timing improves and the diagonal pull preserves letter shapes, checkerboard angles, and recovery after release. |

Test each experiment against the same accepted build. If both pass individually, replay the gesture once more with both enabled before shipping.

The shear experiment borrows Drape’s independent treatment of structural, shear, and bending constraints. Its default grid and sequential CPU solver differ from this shader’s GPU solver, so use the Studio measurements to choose the final schedule. [Drape constraint setup](https://github.com/aatishb/drape/blob/master/clothphysics.js#L317-L442)
