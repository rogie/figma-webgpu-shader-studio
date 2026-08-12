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

## Vite cache

After any figui3 version bump, clear stale prebundles:

```bash
rm -rf app/node_modules/.vite
npx vite --force --host localhost --port 5173
```

The update script automates this.
