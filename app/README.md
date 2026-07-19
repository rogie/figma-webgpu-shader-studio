# Figma WebGPU Shader Studio

A browser shader editor/viewer for **Figma shader modules** — the `setup(device, frame)` / `render(device, frame)` / `defineProperties` format described in [`../skills/v3.md.tmpl`](../skills/v3.md.tmpl). The preview is a real WebGPU canvas that runs the module's pipeline (render *and* compute passes), and the Properties panel is generated automatically from each module's `defineProperties` schema.

## Requirements

- A WebGPU-capable browser: Chrome/Edge (stable) or Safari Technology Preview.
- Node 18+.

## Run

```bash
cd app
npm install
npm run dev
```

Open the printed URL. The interface mirrors the original `shader.gl` application: a preset rail, FigUI3 property sidebar, optional CodeMirror panel, and large checkerboard visualizer. The `dither`, `grain`, `pixelate`, and `sphere` modules from the repo root are bundled as presets. A generated sample image is loaded so effects render immediately; drop or upload your own image/video to change the input.

## How it works

- **`src/runtime/loader.js`** — transpiles the module (TypeScript → JS via Sucrase), evaluates it as CommonJS with a `figma:shaders` shim that captures `defineProperties`, and **shadows the globals Figma forbids** (`console`, `fetch`, `Float64Array`, timers, DOM, `navigator`, …) so the preview catches code that would fail in Figma.
- **`src/runtime/host.js`** — owns the `GPUDevice` + canvas context and drives the `frame` contract (`input`, `output`, `state`, `params`, `time`, `deltaTime`, `frame`, `mousePosition`). Runs `setup` once (inside a validation error scope, surfacing WGSL/validation errors), then `render` each animation frame. Tracks and destroys GPU resources on re-run to avoid leaks.
- **`src/components/Controls.jsx`** — renders one FigUI3 control per `defineProperties` entry (dispatching on `control` then `type`) and writes values back into `frame.params` in the exact shape modules read (`{r,g,b,a}`, `{x,y,radius,angle}`, gradients, etc.).
- **FigUI3 bundles** — the app loads the core UI plus `fig-editor.js`/CSS and the experimental `fig-lab.js`/CSS bundle (FigUI3’s current replacement for the older “experimental” naming).
- **Export** — the Export button downloads the current source as `main.ts` plus a generated `features.json` (`version: 2`, with `isAnimated`/`usesMouse` inferred), matching the shader-coder deliverable.

## Notes / limitations

- Close, not pixel-exact, match to Figma's compositor (canvas uses the preferred format, input is `rgba8unorm`).
- Validation is browser-side (not `naga` like `figma shader build`), so error wording differs.
- Point-type params use numeric fields; on-canvas draggable handles are a future enhancement.
