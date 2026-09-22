# FigUI3 + ToolKit integration map (Figma WebGPU Shader Studio)

## Package entrypoints

Loaded in `app/src/mainApp.jsx`:

- `@rogieking/figui3/fig.css` — core component styles
- `@rogieking/figui3/fig-editor.css` — editor/fill-picker/`fig-select` styles
- `@rogieking/figui3/fig-lab.css` — lab styles (chat, attachments, canvas, angle/wheel). From **8.1+**, lab CSS is **not** imported by `fig-editor.css`.
- `@rogieking/toolkit/toolkit.css` + `toolkit.js` — `toolkit-*` property controls. The JS entry also registers the required FigUI3 primitives.

Keep FigUI3 as a **direct** dependency (the app imports its CSS). ToolKit pins FigUI3 as well; npm should dedupe them to the same version.

Vite excludes FigUI3 and ToolKit from dependency prebundle in `app/vite.config.js` (`optimizeDeps.exclude`).

## App surfaces

| Surface | Files | Usage |
|---------|-------|-------|
| Properties panel | `app/src/components/Controls.jsx` | ToolKit controls, gradient picker |
| Composition fill | `app/src/components/CompositionEditor.jsx` | `toolkit-fill` + `fig-fill-picker` `mode-shader` slot |
| Preview time | `app/src/components/PlayControls.jsx` | `toolkit-wheel` |
| Chat | `app/src/components/ChatPane.jsx`, `app/src/chat.css` | `fig-ai-prompt`, `fig-attachments`, `fig-attachment`, `fig-chat-message`, `fig-select` |
| Canvas controls | `app/src/components/CanvasControlsOverlay.jsx` | `fig-canvas-control` |
| Shell / library | `app/src/App.jsx` | `fig-button`, `fig-menu`, `fig-dialog`, `fig-card`, `fig-preview`, etc. |
| Account | `app/src/components/AccountMenu.jsx` | `fig-menu`, `fig-field`, `fig-input-text`, theme `fig-segmented-control` |

## When reviewing upgrades

1. Scan FigUI3 README plus ToolKit `README.md` / `.cursor/skills/toolkit/` for new tags.
2. Check whether an existing raw control (e.g. `fig-input-gradient`, manual attachment UI) has a ToolKit or attachment wrapper.
3. Check `fig-lab.css` for layout tokens affecting `fig-ai-prompt > fig-attachments` spacing.
4. Do not change unrelated app CSS unless the new FigUI3/ToolKit release requires it.
