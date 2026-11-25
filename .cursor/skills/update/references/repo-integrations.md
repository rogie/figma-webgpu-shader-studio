# FigUI3 + Extended integration map (Figma WebGPU Shader Studio)

## Package entrypoints

Loaded in `app/src/mainApp.jsx`:

- `@rogieking/figui3/fig.css` — core component styles
- `@rogieking/figui3-extended/fig-editor.css` + `fig-editor.js` — editor and fill picker
- `@rogieking/figui3-extended/fig-lab.css` + `fig-lab.js` — chat, attachments, canvas controls, and the time wheel.

Keep FigUI3 and FigUI3 Extended as direct dependencies. The app imports both packages.

Vite excludes FigUI3 and FigUI3 Extended from dependency prebundle in `app/vite.config.js` (`optimizeDeps.exclude`).

## App surfaces

| Surface | Files | Usage |
|---------|-------|-------|
| Properties panel | `app/src/components/Controls.jsx` | FigUI3 controls and gradient picker |
| Composition fill | `app/src/components/CompositionEditor.jsx` | `fig-input-fill` and the shader picker |
| Preview time | `app/src/components/PlayControls.jsx` | `fig-input-slider-wheel` with a direct `fig-input-number` child |
| Chat | `app/src/components/ChatPane.jsx`, `app/src/chat.css` | `fig-ai-prompt`, `fig-attachments`, `fig-attachment`, `fig-chat-message`, `fig-select` |
| Canvas controls | `app/src/components/CanvasControlsOverlay.jsx` | `fig-canvas-control` |
| Shell / library | `app/src/App.jsx` | `fig-button`, `fig-menu`, `fig-dialog`, `fig-card`, `fig-preview`, etc. |
| Account | `app/src/components/AccountMenu.jsx` | `fig-menu`, `fig-field`, `fig-input-text`, theme `fig-segmented-control` |

## When reviewing upgrades

1. Scan both packages’ README and component skills for new tags.
2. Check whether an existing raw control (e.g. `fig-input-gradient`, manual attachment UI) has a FigUI3 wrapper.
3. Check `fig-lab.css` for layout tokens affecting `fig-ai-prompt > fig-attachments` spacing.
4. Do not change unrelated app CSS unless the new FigUI3 release requires it.
