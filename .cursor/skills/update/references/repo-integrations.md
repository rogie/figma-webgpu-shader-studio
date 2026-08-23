# FigUI3 integration map (Figma WebGPU Shader Studio)

## Package entrypoints

Loaded in `app/src/main.jsx`:

- `@rogieking/figui3/fig.css` + `fig.js` — core components
- `@rogieking/figui3/fig-editor.css` + `fig-editor.js` — editor/fill-picker **and** `fig-select` (8.x+); JS also pulls in `fig-lab.js`
- `@rogieking/figui3/fig-lab.css` + `fig-lab.js` — lab bundle (propskit, chat, attachments). From **8.1+**, lab CSS is **not** imported by `fig-editor.css` — import `fig-lab.css` explicitly.

Vite excludes FigUI3 from dependency prebundle in `app/vite.config.js` (`optimizeDeps.exclude`).

## App surfaces

| Surface | Files | FigUI3 usage |
|---------|-------|--------------|
| Properties panel | `app/src/components/Controls.jsx` | propskit controls, gradient picker |
| Composition fill | `app/src/components/CompositionEditor.jsx` | `propskit-fill` + `fig-fill-picker` `mode-shader` slot |
| Chat | `app/src/components/ChatPane.jsx`, `app/src/chat.css` | `fig-ai-prompt`, `fig-attachments`, `fig-attachment`, `fig-chat-message`, `fig-select` |
| Canvas controls | `app/src/components/CanvasControlsOverlay.jsx` | `fig-canvas-control` |
| Shell / library | `app/src/App.jsx` | `fig-button`, `fig-menu`, `fig-dialog`, `fig-card`, `fig-preview`, etc. |
| Account | `app/src/components/AccountMenu.jsx` | `fig-menu`, `fig-field`, `fig-input-text`, theme `fig-segmented-control` |

## When reviewing upgrades

1. Scan README component table for new tags under **Propskit** or **Lab** sections.
2. Check whether an existing raw control (e.g. `fig-input-gradient`, manual attachment UI) has a propskit or attachment wrapper.
3. Check `fig-lab.css` for layout tokens affecting `fig-ai-prompt > fig-attachments` spacing.
4. Do not change unrelated app CSS unless the new FigUI3 release requires it.
