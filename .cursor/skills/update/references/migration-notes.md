# FigUI3 migration notes (project-specific)

Patterns established in this repo when adopting newer FigUI3 releases.

## Propskit properties controls

Replace ad-hoc `fig-field` + primitive pairings in the properties panel with propskit wrappers:

- `propskit-number`, `propskit-text`, `propskit-slider`, `propskit-switch`, `propskit-select`, `propskit-color`
- `propskit-gradient` for gradients — use `edit="picker"`, `size="large"`, `direction="horizontal"`, and wire `default` for reset support

Event handling: listen on the propskit element for bubbling `input`/`change`; detail shape varies by control (see existing handlers in `Controls.jsx`).

From 6.38+, `propskit-slider` supports drag-scrubbing on the numeric field and sets
`data-number-scrubbing` while active. Mirror the existing `data-elastic-dragging`
guard and skip React `value` attribute writes during that scrub.

## Chat attachments (fig-lab)

Pending composer attachments belong **inside** `fig-ai-prompt`, above the textarea:

```jsx
<fig-ai-prompt>
  <fig-attachments>
    <fig-attachment src={...} name={...} value={String(index)} />
  </fig-attachments>
  <fig-input-text ... />
  <fig-footer>...</fig-footer>
</fig-ai-prompt>
```

- Listen for `remove` on `fig-attachments`; `event.detail.value` is the attachment index.
- Images: pass `src={previewUrl}`. Videos: omit `src` (fallback label shows).
- Style override in `app/src/chat.css`: `fig-ai-prompt > fig-attachments { margin-inline: var(--spacer-2); }`

## React + custom elements

FigUI3 controls generate light DOM. Mark opaque content so React does not delete it:

```js
const opaqueContent = { __html: "" };
// ...
<fig-button dangerouslySetInnerHTML={opaqueContent} />
```

## Generated image loading

Use `fig-image` with `src` instead of manually composing `fig-preview`, `img`, and `fig-spinner`. It provides a delayed loading indicator and re-emits bubbling, composed `load` and `error` events from the host.

## fig-card (7.x)

From 7.0+, `fig-card` no longer wraps content in an `<a>` via `href`/`target`. Selection chrome and authored `fig-preview` / `fig-footer` children still work. This app's home cards do not use link attributes, so no migration was required.

`fig-chit` was added as a backwards-compatible alias of `fig-swatch`; prefer `fig-swatch` unless a surface specifically wants the chit name.

## fig-select (8.x)

From 8.0+, `fig-select` / `fig-select-options` / `fig-select-option` register from `fig-editor.js` (styles in `fig-editor.css`), not core `fig.js`. This app already imports both editor entrypoints in `main.jsx`, so selects and `propskit-select` keep working. `propskit-select` falls back to `fig-dropdown` if editor is not loaded.

`fig-editor.js` now also imports `fig-lab.js`, so lab components load transitively with the editor bundle.

## fig-lab.css (8.1+)

From 8.1.0, `fig-editor.css` no longer `@import`s `fig-lab.css`. Propskit / chat / attachment styles must be loaded via an explicit `@rogieking/figui3/fig-lab.css` import in `main.jsx`. Without it, `propskit-*` custom elements still register but render unstyled.

## Propskit point controls (8.1+)

Lab controls mirror canvas control shapes and are wired in `Controls.jsx`:

| defineProperties type | Propskit control |
|-----------------------|------------------|
| `point` | `propskit-position` |
| `color-point` | `propskit-color-point` |
| `point-radius` | `propskit-point-radius` |
| `point-angle-radius` | `propskit-point-radius-angle` |
| `point-point-line` | `propskit-point-point` |

Value shapes align with `fig-canvas-control` / `canvasControls.js` (percent coords; radius as a number in app state, `"N%"` strings when propskit `units="percent"`). Keep full `#RRGGBBAA` on color-point sync so opacity-only canvas edits refresh the panel. Canvas-related props sort to the bottom of the properties panel.

`propskit-color-point` does not set `alpha` on its inner `propskit-color`; enable it after mount if the panel must show opacity.

## 8.2.x notes

- Compound spatial propskit controls gained a `disabled` attribute (forwarded to inner controls). No app wiring required unless a surface needs disable-while-busy.
- Lab adds `<fig-reorder>` for drag-reorder lists. Not adopted here (shader library uses `fig-chooser`).
- Accessibility/focus token docs expanded; no app CSS changes required for this upgrade.

## 8.3 / 8.4 notes

- `<fig-menu-separator>` is a backwards-compatible alias of `<fig-separator>`; keep using `fig-separator` in app menus/lists.
- Package now ships bundled `.cursor/skills/` for FigUI3 authors; app integrations still follow this repo's `/update` skill and `app/src` wiring.
- Explicit `@rogieking/figui3/fig-lab.css` import in `main.jsx` remains required (editor CSS still does not pull lab styles).
- Color-point still omits `alpha` on its inner `propskit-color`; keep the post-mount enable workaround in `Controls.jsx`.

## 8.9.0 notes

- Adds a `copy` icon name to `fig-icon` (`--icon-24-copy` / `--icon-16-copy`). Lab/editor bundles and README are otherwise unchanged from 8.8.1.
- `<propskit-oscillator>` remains available but is unused here — Figma `defineProperties` has no oscillator type, and `Controls.jsx` has nothing to wire it to.

## 8.9.1 notes

- Patch-only: `fig-editor.css` list top-margin selector now uses `:nth-child(1 of :not(.fig-overflow))` instead of first-child / overflow-start sibling rules. No README/API changes; no app wiring required.

## 8.9.2 notes

- Patch-only: `fig-editor.css` / `components.css` add `h3 { margin: 0 0 var(--spacer-1) 0; }` on an editor control surface. No README/API changes; no app wiring required.

## 8.9.3 notes

- `fig-chat-message` is now a column flex container with `gap: var(--spacer-2-5)` and even `padding: var(--spacer-2-5)` on user messages. Extra top margins on `.pasted-text`, `.streaming-code-block`, and `fig-chat-message > fig-attachments` would stack on that gap — keep those children at `margin: 0`.
- No README/JS API changes. Avatar positioning still uses `> fig-avatar`; this app wraps avatars in `fig-tooltip`, so the existing chat.css override remains required.

## 8.9.4 notes

- Patch-only: `fig-easing-curve` styling and drag behavior (`Shift` snaps handle Y to 0/1, minimal handles, fixed 45px padding). This app does not use `fig-easing-curve`; no app wiring required.

## 8.9.5 notes

- Patch-only: popover/popup shadow tokens (`--fig-popover-shadow`, `--fig-popup-shadow`) and dark-mode-aware drop shadows on `fig-popup` variants. Version history and other menu popovers pick this up automatically; no app CSS changes required.

## 8.9.6 notes

- `propskit-select` can now take an authored `<fig-select-options slot="panel">` child for rich option content instead of the `options` attribute alone. This app still serializes enum options into `options` in `Controls.jsx`; no wiring change required unless a property needs multi-line select rows.

## 8.9.7 notes

- Patch-only: `fig-menu-item[subtle]` hover/focus uses `--figma-color-bg-secondary` instead of `--figma-color-bg-menu-hover`. No README/JS API changes; version history menu items pick this up only if authored with `subtle`.

## 8.9.8 notes

- `fig-menu` popups now portal to `[data-figui-overlay-root]` when the browser supports Popover API (`popover="manual"`), with `pointer-events: auto` on menu popups inside the overlay root. Fixes nested menus (e.g. version history inside an open `fig-popup`) clipping or positioning incorrectly. No app wiring required — editor/home menus pick this up automatically.
- Fallback browsers keep the previous in-place menu popup behavior.

## 8.9.11 notes

- `fig-select` and `fig-dropdown` gain `variant="ghost"` (borderless, secondary hover fill). Toolbar/nav selects in this app already sit in chrome that expects the default trigger; do not switch them unless a surface should look like a ghost button.
- README now documents `<fig-select>` in the core component table (still requires `fig-editor.js` / `fig-editor.css`, which this app already imports).
- Package README lists shipped `.cursor/skills/` (`figui3`, `fig-editor`, `fig-lab`, `propkit`). App integrations still follow this repo's `/update` skill.
- Layer docs no longer claim `fig-editor.js` registers `fig-layer`; this app does not rely on that transitive registration.

## Vite cache

After any figui3 version bump, clear stale prebundles:

```bash
rm -rf app/node_modules/.vite
npx vite --force --host localhost --port 5173
```

The update script automates this.
