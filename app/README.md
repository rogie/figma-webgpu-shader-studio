# Figma WebGPU Shader Studio

A browser shader editor/viewer for **Figma shader modules** — the `setup(device, frame)` / `render(device, frame)` / `defineProperties` format described in [`../skills/v3.md.tmpl`](../skills/v3.md.tmpl). The preview is a real WebGPU canvas that runs the module's pipeline (render *and* compute passes), and the Properties panel is generated automatically from each module's `defineProperties` schema.

## Requirements

- A WebGPU-capable browser: Chrome/Edge (stable) or Safari Technology Preview.
- Node 18+.

## Run

```bash
cd app
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in
`.env.local`. The publishable key is safe to use in the browser; never put a
Supabase secret or service-role key in this app.

Open the printed URL. The interface mirrors the original `shader.gl` application: a preset rail, FigUI3 property sidebar, CodeMirror panel, and large checkerboard visualizer. The `dither`, `grain`, `pixelate`, and `sphere` modules from the repo root are bundled as presets. A bundled sample image is loaded so effects render immediately; drop or upload your own image/video to change the input.

## Supabase setup

The app uses Supabase Auth, Postgres, and Storage for magic-link accounts,
cloud shaders, thumbnails, and input media.

1. Create or open the Supabase project.
2. Run
   [`../supabase/migrations/20260719220000_shader_cloud.sql`](../supabase/migrations/20260719220000_shader_cloud.sql)
   in the Supabase SQL Editor. This creates the `shaders` table, private
   `shader-assets` bucket, and their Row Level Security policies.
3. In **Authentication → URL Configuration**, set:
   - Site URL: `https://rogie.github.io/figma-webgpu-shader-studio/`
   - Redirect URLs:
     - `http://localhost:5173/**`
     - `https://rogie.github.io/figma-webgpu-shader-studio/**`
4. Keep Email enabled under **Authentication → Providers**. Magic-link login
   uses Supabase's email template and SMTP configuration.

Uploaded images and videos are limited to 25 MB in both the browser and
Storage. The bucket remains private: its RLS policy permits owners to read
draft assets and anonymous visitors to read assets only when the corresponding
shader is public.

## GitHub Pages

The workflow at
[`../.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
builds and deploys the `app` directory whenever `main` is pushed.

Configure these repository settings:

- Variable `VITE_SUPABASE_URL`
- Secret `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Settings → Pages → Source:** GitHub Actions

Public share links use `?shader=<id>`, so they work on GitHub Pages without an
SPA rewrite.

## How it works

- **`src/runtime/loader.js`** — transpiles the module (TypeScript → JS via Sucrase), evaluates it as CommonJS with a `figma:shaders` shim that captures `defineProperties`, and **shadows the globals Figma forbids** (`console`, `fetch`, `Float64Array`, timers, DOM, `navigator`, …) so the preview catches code that would fail in Figma.
- **`src/runtime/host.js`** — owns the `GPUDevice` + canvas context and drives the `frame` contract (`input`, `output`, `state`, `params`, `time`, `deltaTime`, `frame`, `mousePosition`). Runs `setup` once (inside a validation error scope, surfacing WGSL/validation errors), then `render` each animation frame. Tracks and destroys GPU resources on re-run to avoid leaks.
- **`src/components/Controls.jsx`** — renders one FigUI3 control per `defineProperties` entry (dispatching on `control` then `type`) and writes values back into `frame.params` in the exact shape modules read (`{r,g,b,a}`, `{x,y,radius,angle}`, gradients, etc.).
- **FigUI3 bundles** — the app loads the core UI plus `fig-editor.js`/CSS and the experimental `fig-lab.js`/CSS bundle (FigUI3’s current replacement for the older “experimental” naming).
- **Export** — the Export button downloads the current source as `main.ts` plus a generated `features.json` (`version: 2`, with `isAnimated`/`usesMouse` inferred), matching the shader-coder deliverable.
- **Cloud library** — built-in presets stay local. Signed-in users can save,
  duplicate, delete, and reopen their own shaders from the same swatch rail.
- **Sharing** — owners can mark a saved shader public and copy a link. Database
  and Storage RLS enforce private drafts independently of the UI.

## AI chat (BYOK)

The Code pane’s **Chat** mode iterates on the open shader module using your own
OpenAI, Anthropic, or Gemini API key.

1. Open **Settings** and paste an OpenAI, Anthropic, and/or Gemini key. Keys are
   stored only in `localStorage` on this device — never in Supabase.
2. Deploy the Edge Function that proxies provider calls (needed for Anthropic
   CORS and to keep the system prompt server-side):

   ```bash
   supabase functions deploy chat
   ```

   The function reads `x-user-api-key` from each request. No platform
   provider secrets are required.
3. In Chat, pick an allowlisted model from the dropdown (OpenAI GPT-4.1 / 4o /
   o-series, Claude Opus/Sonnet/Haiku, Gemini 2.x / 3.x), send a message, and
   when the model returns a full TypeScript fence it is applied to the editor
   (with Undo apply).

Each request includes the current module source plus bundled authoring skills
(`figma-shader-coder`, `v3` module contract, WGSL, WebGPU). Chat history is
saved per shader in `localStorage` and resumed when you reopen Chat.

You can attach an image (all providers) or video (Gemini only) via the **+**
menu next to Send; media is sent as multimodal context for that turn (max 3 MB).

Chat still needs `VITE_SUPABASE_URL` + publishable key so the browser can reach
`/functions/v1/chat`. Sign-in is not required for chat.

## Notes / limitations

- Close, not pixel-exact, match to Figma's compositor (canvas uses the preferred format, input is `rgba8unorm`).
- Validation is browser-side (not `naga` like `figma shader build`), so error wording differs.
- Point-type params use numeric fields; on-canvas draggable handles are a future enhancement.
- Cloud saving requires the Supabase migration and environment variables above.
- Chat requires the deployed `chat` Edge Function and a BYOK provider key.
