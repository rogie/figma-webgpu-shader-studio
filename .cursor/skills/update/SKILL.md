---
name: update
description: >-
  Update @rogieking/figui3 to the latest version, rebuild the Vite cache, review
  FigUI3 release notes for breaking or new component APIs, and apply needed app
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
- [ ] Record current @rogieking/figui3 version
- [ ] Install latest figui3 in app/
- [ ] Rebuild Vite cache (script does this)
- [ ] Restart Vite in a background Shell session and confirm http://localhost:5173/ responds
- [ ] Review FigUI3 changes since previous version
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
- prints old → new version
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

FigUI3 does not ship a separate CHANGELOG file. Derive changes from the version jump:

1. Note `previousVersion` and `newVersion` from the script output (or `npm list @rogieking/figui3 --depth=0` in `app/`).
2. Read [`references/repo-integrations.md`](references/repo-integrations.md) for where this app uses FigUI3.
3. Inspect the installed package docs:
   - `app/node_modules/@rogieking/figui3/README.md` — component APIs, attributes, events
   - `app/node_modules/@rogieking/figui3/fig-lab.js` / `fig-lab.css` — lab/propskit/chat components
   - `app/node_modules/@rogieking/figui3/fig-editor.js` — editor/fill-picker components
4. Search for newly relevant symbols:

```bash
rg -n "propskit-|fig-attachment|fig-ai-prompt|fig-input-gradient|fig-chat" \
  app/node_modules/@rogieking/figui3/README.md \
  app/node_modules/@rogieking/figui3/fig-lab.js
```

5. Cross-check `app/src` for places still using raw FigUI3 primitives where a newer propskit or attachment wrapper exists.
6. Apply the smallest correct diff. Prefer upgrading in place over adding parallel patterns.

### Migration priorities (this repo)

| Area | Preferred FigUI3 surface | Primary files |
|------|--------------------------|---------------|
| Properties panel scalars | `propskit-number`, `propskit-text`, `propskit-slider`, `propskit-switch`, `propskit-select`, `propskit-color` | `app/src/components/Controls.jsx` |
| Properties panel gradients | `propskit-gradient` with `edit="picker"` | `app/src/components/Controls.jsx` |
| Composition fill | `propskit-fill` + `fig-fill-picker` `mode-shader` slot | `app/src/components/CompositionEditor.jsx` |
| Chat composer attachments | `fig-attachments` + `fig-attachment` inside `fig-ai-prompt` | `app/src/components/ChatPane.jsx`, `app/src/chat.css` |
| Canvas/on-canvas controls | `fig-canvas-control` | `app/src/components/CanvasControlsOverlay.jsx`, `app/lib/canvasControls.js` |
| Account/settings fields | `fig-field`, `propskit-*`, `fig-input-text` | `app/src/components/AccountMenu.jsx` |

Follow existing React + FigUI3 conventions:

- Use `dangerouslySetInnerHTML={opaqueContent}` (or `{ __html: "" }`) on custom elements whose light DOM React must not reconcile away.
- Bind FigUI3 `input` / `change` via `addEventListener` in `useEffect`, not React `onInput`, when the component rewrites its internals.
- For propskit sliders, avoid rewriting `value` from React while dragging; mirror `PropskitSliderControl` in `Controls.jsx`.

See [`references/migration-notes.md`](references/migration-notes.md) for patterns discovered during prior upgrades.

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
