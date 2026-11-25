---
name: update
description: >-
  Update @rogieking/figui3 to the latest version, rebuild the Vite cache, review
  FigUI3 and FigUI3 Extended changes for breaking or new component APIs, and apply needed app
  integrations. Use when the user runs /update or asks to pull the latest figui3,
  refresh figui3, rebuild vite cache, or sync FigUI3 component changes.
---

# /update — FigUI3 upgrade workflow

Run this skill end-to-end when invoked. Do not stop after installing the package.
When the user sends `/update`, run this FigUI3 workflow immediately. Do not ask
which dependency or update scope they mean.

## Quick start

From the repo root:

```bash
.cursor/skills/update/scripts/update-figui3.sh
```

Then follow **Review changelog & migrate** below. Finish with verification.

## Execution checklist

Copy and track progress:

```
- [ ] Record current FigUI3 version and FigUI3 Extended pin
- [ ] Install latest FigUI3 in app/
- [ ] Rebuild Vite cache (script does this)
- [ ] Restart Vite in a background Shell session and confirm http://localhost:5173/ responds
- [ ] Review FigUI3 and FigUI3 Extended changes since previous versions
- [ ] Apply needed integrations in app/src
- [ ] Run npm test && npm run build in app/
- [ ] Summarize version jump + code changes for the user
```

## 1. Install + Vite cache

Always run from repo root:

```bash
.cursor/skills/update/scripts/update-figui3.sh
```

The script:

- installs `@rogieking/figui3@latest` in `app/`
- preserves the pinned `@rogieking/figui3-extended` dependency
- prints old → new versions
- deletes `app/node_modules/.vite`

It does **not** restart the dev server. In Cursor, detached `nohup`/`setsid` processes do not survive after the script exits, so the agent must restart Vite in a background Shell session (see next step).

For local terminal use outside Cursor, you can restart manually with [`scripts/restart-vite.sh`](scripts/restart-vite.sh).

## 1b. Restart dev server (required in Cursor)

After the update script finishes, restart Vite from `app/` using a **background Shell command** (`block_until_ms: 0`):

```bash
PID=$(lsof -ti :5173 -sTCP:LISTEN 2>/dev/null); if [ -n "$PID" ]; then kill "$PID"; fi; rm -rf "node_modules/.vite"; npx vite --force --host localhost --port 5173
```

Poll until the server is ready:

```bash
curl -sf -o /dev/null --max-time 5 http://localhost:5173/
```

Or watch the background terminal log for `ready in`. Do not continue until `curl` succeeds.

## 2. Review changelog & migrate

1. Note `previousVersion` and `newVersion` from the script output (or `npm list @rogieking/figui3 @rogieking/figui3-extended --depth=0` in `app/`).
2. Read [`references/repo-integrations.md`](references/repo-integrations.md) for where this app uses FigUI3 and FigUI3 Extended.
3. Inspect the installed package docs:
   - `app/node_modules/@rogieking/figui3/CHANGELOG.md` — release changes
   - `app/node_modules/@rogieking/figui3/README.md` — component APIs, attributes, events
   - `app/node_modules/@rogieking/figui3-extended/fig-lab.js` / `fig-lab.css` — lab/chat/canvas components
   - `app/node_modules/@rogieking/figui3-extended/fig-editor.js` — editor/fill-picker components
   - `app/node_modules/@rogieking/figui3-extended/.cursor/skills/` — Editor and Lab component APIs
4. Search for newly relevant symbols:

```bash
rg -n "fig-input-slider-wheel|fig-attachment|fig-ai-prompt|fig-input-gradient|fig-chat" \
  app/node_modules/@rogieking/figui3/README.md \
  app/node_modules/@rogieking/figui3-extended/.cursor/skills
```

5. Cross-check `app/src` for places still using raw FigUI3 primitives where a newer FigUI3 component exists.
6. Apply the smallest correct diff. Prefer upgrading in place over adding parallel patterns.

### Migration priorities (this repo)

| Area | Preferred FigUI3 surface | Primary files |
|------|--------------------------|---------------|
| Properties panel scalars | `fig-input-number`, `fig-input-text`, `fig-slider`, `fig-switch`, `fig-select`, `fig-input-color` | `app/src/components/Controls.jsx` |
| Properties panel gradients | `fig-input-gradient` | `app/src/components/Controls.jsx` |
| Composition fill | `fig-input-fill` with a shader picker | `app/src/components/CompositionEditor.jsx` |
| Chat composer attachments | `fig-attachments` + `fig-attachment` inside `fig-ai-prompt` | `app/src/components/ChatPane.jsx`, `app/src/chat.css` |
| Canvas/on-canvas controls | `fig-canvas-control` | `app/src/components/CanvasControlsOverlay.jsx`, `app/lib/canvasControls.js` |
| Account/settings fields | `fig-field`, `fig-input-text` | `app/src/components/AccountMenu.jsx` |

Follow existing React + FigUI3 conventions:

- Use `dangerouslySetInnerHTML={opaqueContent}` (or `{ __html: "" }`) on custom elements whose light DOM React must not reconcile away.
- Bind FigUI3 `input` / `change` via `addEventListener` in `useEffect`, not React `onInput`, when the component rewrites its internals.
- For sliders, pause programmatic value updates during user input. See `PlayControls.jsx`.

See [`references/migration-notes.md`](references/migration-notes.md) for historical patterns from prior upgrades.

## 3. Verify

In `app/`:

```bash
npm test
npm run build
```

Confirm `curl -sf http://localhost:5173/` succeeds and the dev server log shows `ready in` without FigUI3 registration errors.

## 4. Report back

Tell the user:

- previous and new figui3 versions
- whether any app code changed (list files)
- anything noted in README/API that was **not** adopted yet
- test/build result

Only commit or publish if the user asks.
