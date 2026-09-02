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

## 8.9.12 notes

- `fig-menu` slots `fig-menu-item` / `fig-separator` into the popup instead of relocating them. React can add or remove items without `removeChild` errors. `AccountMenu` no longer remounts the menu on auth changes.
- `fig-menu-item` works as a list row outside `fig-menu` (popup + sticky `fig-separator`s + nested row-action menu). Version history already uses this pattern.
- `fig-popup` `title` auto-generates a header with a close button (same as `fig-dialog`). Keep authored `<fig-header>` on account/settings/publish/version popups — they already have headers and do not need the extra close control or a native `title` tooltip.
- Nested `fig-menu` inside a `fig-menu-item` no longer selects the parent row. Version history restore menus pick this up automatically.
- Sticky labeled `fig-separator`s hide the rule while stuck. No app CSS change required.

## 8.9.13 notes

- Patch-only: sticky labeled `fig-separator`s stack above scrolling list items. Library list and version history already use `sticky=""`; no app wiring required.

## 8.9.14 notes

- Patch-only: vertical `fig-separator[direction="vertical"]` now clamps `max-width: 1px` and `padding: 0` so the rule cannot stretch in flex/grid rows. This app does not use vertical separators; no app wiring required.

## 8.9.15 notes

- `propskit-color` now composes a solid `fig-fill-picker` swatch instead of
  `fig-input-color`. There is no inline hex/opacity field; click the swatch to
  open the picker. Events are `{ color, alpha, opacity }` (reset still emits the
  host hex string). `Controls.jsx` reads that detail instead of querying
  `fig-input-color.rgba`.
- `propskit-gradient` default `edit` is now `"picker"` (this app already set
  `edit="picker"`). Color and gradient swatches share the same 33% width in
  large horizontal fields.
- `propskit-color-point` still omits `alpha` on its inner `propskit-color`; keep
  the post-mount enable workaround in `Controls.jsx`.
- `fig-field` treats `fig-fill-picker` as a popup host so clicking the color
  swatch does not collapse a collapsible field.

## 8.9.16 / 8.9.17 notes

- `fig-input-fill` / `fig-fill-picker` now match the video and webcam contract this
  app previously worked around:
  - `default-video` fills an empty Video tab
  - video swatches use `video.poster`, not `url(file.mp4)`
  - webcam JSON is `{ type, webcam: { live, snapshot, deviceId, scaleMode, scale, opacity } }`
  - live `MediaStream` is `webcamStream` / `webcamstream`, kept after dialog close
- `CompositionEditor` sets `webcam-mode="live"` and `default-video` on
  `fig-input-fill`, listens for `webcamstream`, and no longer stamps a JPEG onto
  the inner swatch.
- `App.jsx` clones `fig-input-fill.webcamStream` for the preview (falls back to
  `getUserMedia` with `webcam.deviceId` on restore). Snapshot-only webcam
  (`live: false`) still rasterizes.

## 8.9.18 notes

- Patch-only around fill picker and media chrome. The fill picker hides the
  gradient interpolation row and locks new gradient values to `srgb`. The fill
  type select is `variant="ghost"`. Video preview now sets `poster` on
  `fig-media`. `fig-icon` uses `contain: size` instead of `strict`.
- This app already uses `default-video`, `webcam-mode="live"`, and
  `webcamStream`. No new wiring required. Stored non-sRGB gradients still
  rasterize in `paintFill.js`; newly picked gradients will be sRGB.

## 8.9.19 notes

- `fig-input-fill` now forwards custom `slot="mode-*"` children to the inner
  picker, persists custom JSON, and uses image-style chrome (type label +
  opacity). Empty webcam/custom swatches are blank instead of `#D9D9D9`.
- Webcam camera switching no longer reuses a live stream when `deviceId` is
  unknown or does not match the requested camera.
- Fill-picker `overflow: visible` is limited to solid/gradient tabs so media
  previews clip correctly.

## 8.9.20 notes

- Adds `<propskit-fill>`: labeled `fig-field` + `fig-fill-picker` swatch, same
  chrome as `propskit-color`. Attributes include `value` (fill JSON), `default`,
  `mode`, `alpha`, `webcam-mode`, `default-video`. Events are the fill object;
  `webcamstream` is not re-emitted from the host.
- `fig-input-fill` focus/hover outline is now suppressed so propskit can put
  the ring on the field. Swatches paint with `background-image`. Media-control
  play buttons stay visible inside `fig-tooltip`.
- `CompositionEditor` uses `propskit-fill` (`size="large"` `direction="horizontal"`)
  with a `slot="mode-shader"` child on the inner `fig-fill-picker` (not the
  propskit host — propskit `replaceChildren`s its light DOM). Shader tab preview
  is a `fig-image` thumbnail; live compile stays on the main canvas.
- `App.jsx` reads `webcamStream` from `fig-fill-picker, fig-input-fill` because
  `propskit-fill` does not re-emit `webcamstream`. `defineProperties` has no
  fill type, so `Controls.jsx` has nothing to wire.

## 8.9.21 notes

- `propskit-color`, `propskit-fill`, and `propskit-gradient` set
  `anchorElement` on the inner picker so the dialog anchors to the field, not
  the swatch. Reopening an existing fill-picker dialog refreshes
  `dialog.anchor`. `fig-input-gradient` gained the same `anchorElement` hook.
- Focus chrome stays on the propskit field while the popup is open
  (`has-popup-open`); inner swatches / pickers no longer draw their own ring.
- This app already uses `propskit-fill` in `CompositionEditor`; picker
  position and field outline pick up the fix with no extra wiring.

## 8.9.22 / 8.9.23 notes

- `fig-fill-picker` automatically captures a static poster for video fills,
  including video URLs supplied through `value`.
- 8.9.23 makes automatic poster capture internal-only instead of emitting an
  `input` event. This prevents consumers from treating a derived thumbnail as
  a user fill change and repeatedly reloading the video.
- `CompositionEditor` strips generated posters from picker values before they
  enter app state; its temporary poster-event comparison workaround is no
  longer needed on 8.9.23.

## 8.9.24 notes

- Licensing changed without runtime API changes. Core `fig.js`, `fig-layer.js`,
  core CSS, and polyfills remain MIT; `fig-editor.js`, `fig-lab.js`, and their
  CSS are now under PolyForm Shield 1.0.0 (not OSI open source).
- This app imports both editor and lab bundles. No code migration is required,
  but distribution and competitive-use implications should be reviewed before
  release.

## 8.9.32 notes

- Propskit default size is now the 40px large row. `size="large"` remains a
  supported alias; `size="small"` is the compact 32px layout. This app already
  sets `size="large"` on properties and composition fill controls, so layout
  does not change. `propskit-group` can set `size="small"` on nested controls
  that do not define their own size; this app does not use `propskit-group`.
- Adds `<propskit-wheel>` (numeric scrubber with tick wheel) and
  `variant="minimal"` on switch/color/fill/gradient/select/text/number/slider/
  position/wheel. Neither is adopted here — Figma `defineProperties` has no
  wheel type, and the properties panel already uses full-row chrome.
- Hue and opacity `propskit-slider` filled-text contrast now follows the
  current hue/mix color (including `color(srgb …)`). Color/fill swatches use a
  transparent host background so checkerboard shows through. No app CSS change
  required; `--propskit-color-height` on the composition fill row already
  matches the large 2rem height.

## 8.9.33 notes

- Extracts `<fig-input-wheel>` as a standalone lab control. `<propskit-wheel>`
  now composes that child plus an optional number field (`text="false"` hides
  the number). This app still does not use either wheel control.
- No README/API changes to properties, fill, chat, or canvas surfaces this
  app already wires.

## 8.9.34 notes

- `<fig-input-wheel>` and `<propskit-wheel>` add `spin` (default `true`).
  `spin="false"` keeps ticks stationary while still updating `value` and the
  number field. `fig-input-wheel` also exposes `spinTo(value)` when spin is on.
- `PlayControls` already uses `<propskit-wheel>` in the preview toolbar:
  `label=""`, `units="seconds"`, `size="small"`, live `value` from host time,
  `disabled` while playing, `spin="false"` while playing and `spin="true"`
  while paused. No extra wiring required for this bump.
- Properties, fill, chat, and canvas surfaces are unchanged.

## 8.9.35 notes

- Adds `--font-variant-numeric: lining-nums tabular-nums slashed-zero` and
  applies it to `propskit-wheel` number fields. `PlayControls` picks this up
  with no app CSS change. Preview FPS still uses local `tabular-nums`;
  leave that unless the toolbar should share the token.
- README APIs for properties, fill, chat, and canvas are unchanged.

## 8.9.36 notes

- FigUI3's default `--font-family` now starts with Inter. This app already loads
  Inter 3.19.3 via `@font-face` in `app.css`; the duplicate `--font-family`
  override was removed so the token comes from FigUI3.

## 8.9.37 notes

- Fast `fig-input-wheel` scrubbing adds a brief tick motion blur. Handle pull
  no longer stretches the input-wheel host; `propskit-wheel` still optionally
  stretches the row (`elastic`). Horizontal tick inset is doubled.
- `PlayControls` already sets `elastic="false"` on the preview time wheel, so
  the row does not stretch. Motion blur and inset pick up automatically.
- `fig-input-wheel` no longer documents an `elastic` attribute; elastic is a
  propskit-wheel row behavior.

## 8.9.38 notes

- `propskit-wheel` elastic stretch now starts at the composed row edge, not
  the inset child wheel. No app wiring change; this surface keeps elastic off.

## 8.9.39 notes

- `fig-input-number` keeps trailing zeros when `precision` is set, including
  through `propskit-wheel`. `PlayControls` already uses `precision="1"` on the
  preview time wheel, so `1.0s` stays one decimal without extra wiring.
- README APIs for properties, fill, chat, and canvas are unchanged.

## 8.9.40 notes

- `fig-button` gains `align` (`start` / `center` / `end`; default `center`) for
  content alignment. Large buttons with a prepended `fig-icon[slot="prepend"]`
  also tighten left padding.
- Effect layer name buttons in `CompositionEditor` now use `align="start"`
  instead of a `justify-content` override. Height/padding still match the fill
  field (`size="large"` + `padding: 0 var(--spacer-2-5)`).

## 8.9.41 notes

- PropsKit slider and wheel show the grabbing cursor only after the drag
  threshold, reserve focused number-field chrome for text editing, and let
  `propskit-wheel` scrub across the full row. Arrow keys in the wheel number
  field spin ticks. `PlayControls` and `Controls.jsx` pick this up with no
  wiring change.

## 8.9.42 notes

- Patch-only: `fig-input-wheel` and `propskit-slider` handles drop soft
  shadows. Preview time wheel and property sliders pick this up automatically.

## 8.9.43 notes

- `propskit-slider` now fades and scales its handle based on proximity to the
  label and numeric value, revealing it on hover/focus. Property sliders in
  `Controls.jsx` pick this up automatically.
- `fig-group` headings truncate long names instead of overflowing, and
  `fig-avatar` drops its inset border. Existing groups and avatars need no app
  wiring or CSS changes.

## 8.9.44 notes

- Collapsible `fig-group` and `propskit-group` chevrons now sit beside the
  heading instead of inside it, preserving heading truncation and reset-button
  spacing. Existing groups pick this up automatically.
- No README/API changes and no app wiring or CSS changes are required.

## Vite cache

After any figui3 version bump, clear stale prebundles:

```bash
rm -rf app/node_modules/.vite
npx vite --force --host localhost --port 5173
```

The update script automates this.
