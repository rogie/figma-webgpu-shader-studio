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

Open [http://localhost:5173](http://localhost:5173). Figma OAuth uses this exact host and port. If you start Connect to Figma from `127.0.0.1:5173` in dev, Shader Studio switches to `localhost` before starting the flow. Browser drafts and sessions are stored separately on each origin.

The interface mirrors the original `shader.gl` application: a preset rail, FigUI3 property sidebar, CodeMirror panel, and large checkerboard visualizer. The `dither`, `grain`, `pixelate`, and `sphere` modules from the repo root are bundled as presets. A bundled sample image is loaded so effects render immediately; drop or upload your own image/video to change the input.

## Supabase setup

The app uses Supabase Auth, Postgres, and Storage for Figma and GitHub
accounts, cloud shaders, thumbnails, and input media.

1. Create or open the Supabase project.
2. Run
   [`../supabase/migrations/20260719220000_shader_cloud.sql`](../supabase/migrations/20260719220000_shader_cloud.sql)
   in the Supabase SQL Editor. This creates the `shaders` table, private
   `shader-assets` bucket, and their Row Level Security policies.
3. In **Authentication → URL Configuration**, set:
   - Site URL: `https://shader-studio.pages.dev/`
   - Redirect URLs:
     - `http://localhost:5173/**`
     - `https://shader-studio.pages.dev/**`
4. Enable GitHub under **Authentication → Providers**. Figma sign-in is handled
   by the `figma-shaders` Edge Function (not a built-in Supabase provider).
5. Apply
   [`../supabase/migrations/20260809232500_restrict_github_signups_to_figma.sql`](../supabase/migrations/20260809232500_restrict_github_signups_to_figma.sql)
   and
   [`../supabase/migrations/20260818123000_allow_figma_oauth_signups.sql`](../supabase/migrations/20260818123000_allow_figma_oauth_signups.sql),
   then keep that function as the **Before User Created** Auth hook. New GitHub
   and Figma users must have a verified `@figma.com` email.

Uploaded images and videos are limited to 25 MB in both the browser and
Storage. The bucket remains private: its RLS policy permits owners to read
draft assets and anonymous visitors to read assets only when the corresponding
shader is public.

## Cloudflare Pages

The production app is deployed at
[`https://shader-studio.pages.dev/`](https://shader-studio.pages.dev/) from the
private GitHub repository.

Configure the Pages Git integration with:

- Production branch: `main`
- Root directory: `app`
- Build command: `npm run build`
- Output directory: `dist`
- Production and preview variables: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`

### Private FigUI3 Extended dependency

Cloudflare’s GitHub integration checks out Shader Studio. The npm install also
needs read access to the separate private `rogie/figui3-extended` repository.
Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new)
owned by `rogie`, with only `figui3-extended` selected and repository
**Contents: Read-only** permission. Start with an expiring token and the
**Preview** environment in the Cloudflare Pages settings.

| Cloudflare build variable | Value |
| --- | --- |
| `GIT_CONFIG_COUNT` | `2` |
| `GIT_CONFIG_KEY_0` | `url.https://github.com/rogie/figui3-extended.git.insteadOf` |
| `GIT_CONFIG_VALUE_0` | `ssh://git@github.com/rogie/figui3-extended.git` |
| `GIT_CONFIG_KEY_1` | `http.https://github.com/rogie/figui3-extended.git.extraHeader` |
| `GIT_CONFIG_VALUE_1` | **Encrypted secret.** The authorization header generated below. |

On macOS, run this in a terminal to copy the header to the clipboard without
printing it. Paste it into the encrypted secret field in Cloudflare.

```bash
(
  printf 'GitHub token: '
  read -rs figui_build_token
  printf '\n'
  {
    printf 'Authorization: Basic '
    printf '%s' "x-access-token:$figui_build_token" | base64 | tr -d '\r\n'
  } | pbcopy
)
```

Retry the preview after saving the variables. Add the same configuration to
**Production** before merging a release that uses FigUI3 Extended. Keep the
build command and output directory as shown above.

Cloudflare Access protects the production hostname and preview deployments.
That edge policy is still GitHub-only (`@figma.com`). In-app sign-in can use
Figma or GitHub; people without GitHub still need Access to be opened or
bypass-listed before they can reach the Figma sign-in button.

Canvas-only iframe routes remain behind that same employee-only Access policy.
Public items load for any employee who can reach the app. Private items load
only when the viewer's Shader Studio session is authorized by Supabase RLS,
normally the owner. Cloudflare's login page cannot run inside an iframe, so
viewers must first open Shader Studio in a top-level tab and authenticate.
Browsers that partition third-party storage or block the `CF_Authorization`
cookie can still prevent a session-only iframe from loading.

The home view lives at `/`. Shader effects and fills use `/shader/<id>`
(preset id or saved shader id). Compositions use `/composer/<id>`. Legacy
single-segment links like `/dither` still load. Saved canvas-only embeds use
`/shader/<id>/embed` and `/composer/<id>/embed`. Local drafts are unavailable;
private items and private composition dependencies require an authorized
Shader Studio session.

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
OpenAI, Anthropic, Gemini, or Grok API key.

1. Open **Settings** and paste an OpenAI, Anthropic, Gemini, and/or Grok key. Keys are
   stored only in `localStorage` on this device — never in Supabase.
2. Deploy the Edge Function that proxies provider calls (needed for Anthropic
   CORS and to keep the system prompt server-side):

   ```bash
   supabase functions deploy chat
   ```

   The function reads `x-user-api-key` from each request. No platform
   provider secrets are required.
3. In Chat, pick an available model from the dropdown. The OpenAI shortlist
   includes GPT-6.2 Sol and Astra, GPT-6.1 Terra, and GPT-6 Luna. GPT-5.6 Turbo
   appears only if your API key lists that exact model. Send a message, and
   when the model returns a full TypeScript fence it is applied to the editor
   (with Undo apply).

Each request includes the current module source plus bundled authoring skills
(`figma-shader-coder`, `v3` module contract, WGSL, WebGPU). Chat history is
saved per shader in `localStorage` and resumed when you reopen Chat.

Use the **Plan mode** toggle to request a Markdown implementation plan without
changing the editor. Plan turns cannot apply or auto-repair code. The latest
completed plan is saved as `plan.md` in the private `shader-plans` Supabase
Storage bucket for owned cloud shaders, with a local fallback for anonymous
users and unsaved drafts.

You can attach an image (all providers) or video (Gemini only) via the **+**
menu next to Send; media is sent as multimodal context for that turn (max 3 MB).

Chat still needs `VITE_SUPABASE_URL` + publishable key so the browser can reach
`/functions/v1/chat`. Sign-in is not required for chat.

## Figma shader library OAuth

The Figma source filter lists shader effects and fills through Figma's staging
remote MCP server (`mcp.staging.figma.com`). Configure these exact callback URLs
on the allowlisted staging OAuth client:

- `https://shader-studio.pages.dev/figma/oauth/callback`
- `http://localhost:5173/figma/oauth/callback`

Store the MCP OAuth client's `FIGMA_OAUTH_CLIENT_ID` and
`FIGMA_OAUTH_CLIENT_SECRET` as Supabase Edge Function secrets. For account
sign-in, create a separate staging Figma OAuth app with the
`current_user:read` scope and store its credentials as
`FIGMA_SIGNIN_OAUTH_CLIENT_ID` and `FIGMA_SIGNIN_OAUTH_CLIENT_SECRET`. Register
the same callback URLs above on both clients, then deploy the proxy:

```bash
supabase functions deploy figma-shaders
```

The browser uses authorization code + PKCE. The Edge Function performs token
exchange and refresh so client secrets are never included in the frontend
bundle. The shader-library OAuth client must be approved for `mcp:connect`.
The proxy uses the unified `list_shaders` and `get_shader` MCP tools for effects
and fills. Creates use `create_shader` followed by `get_shader` and
`update_shader`; updates replace only `main.ts` in `files` and send the display
name, description, `isAnimated`, and `usesMouse` through `metadata`.

**Sign in with Figma** reuses the PKCE callback but uses regular staging Figma
OAuth rather than MCP OAuth. After token exchange the Edge Function reads the
account identity from the REST API's `/v1/me` endpoint, requires an `@figma.com`
email, upserts the Supabase user, and returns a minted Supabase session (access
+ refresh tokens) that the client applies via `supabase.auth.setSession`. The
Figma OAuth tokens used for sign-in are not sent to or stored by the browser.
**Connect to Figma** in Settings remains a separate MCP OAuth flow; its MCP
tokens stay on-device for the shader library and do not change the Shader
Studio session.

Accounts are keyed by the verified `@figma.com` email: one email maps to one
Shader Studio user. Signing in with Figma and GitHub using the same address
lands on the same account (GitHub is auto-linked by Supabase; Figma sign-in
looks the user up by email and appends `figma` to `app_metadata.providers`
without overwriting GitHub).

## Notes / limitations

- Close, not pixel-exact, match to Figma's compositor (canvas uses the preferred format, input is `rgba8unorm`).
- Validation is browser-side (not `naga` like `figma shader build`), so error wording differs.
- Point-type params use numeric fields; on-canvas draggable handles are a future enhancement.
- Cloud saving requires the Supabase migration and environment variables above.
- Chat requires the deployed `chat` Edge Function and a BYOK provider key.
