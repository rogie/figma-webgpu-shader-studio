# FigUI3 + PropsKit2 integration map (Figma WebGPU Shader Studio)

## Package entrypoints

Loaded in `app/src/mainApp.jsx`:

- `@rogieking/figui3/fig.css` — core component styles
- `@rogieking/figui3/fig-editor.css` — editor/fill-picker/`fig-select` styles
- `@rogieking/figui3/fig-lab.css` — lab styles (chat, attachments, canvas, angle/wheel). From **8.1+**, lab CSS is **not** imported by `fig-editor.css`.
- `@rogieking/propskit2/propskit.css` + `propskit.js` — `propskit-*` property controls. The JS entry also registers FigUI3 core, editor, and lab (`@rogieking/figui3/src/fig.js`, `fig-editor.js`, `fig-lab.js`).

Keep FigUI3 as a **direct** dependency (the app imports its CSS). PropsKit2 pins FigUI3 as well; npm should dedupe them to the same version.

Vite excludes FigUI3 and PropsKit2 from dependency prebundle in `app/vite.config.js` (`optimizeDeps.exclude`).

## App surfaces

| Surface | Files | Usage |
|---------|-------|-------|
| Properties panel | `app/src/components/Controls.jsx` | PropsKit2 controls, gradient picker |
| Composition fill | `app/src/components/CompositionEditor.jsx` | `propskit-fill` + `fig-fill-picker` `mode-shader` slot |
| Preview time | `app/src/components/PlayControls.jsx` | `propskit-wheel` |
| Chat | `app/src/components/ChatPane.jsx`, `app/src/chat.css` | `fig-ai-prompt`, `fig-attachments`, `fig-attachment`, `fig-chat-message`, `fig-select` |
| Canvas controls | `app/src/components/CanvasControlsOverlay.jsx` | `fig-canvas-control` |
| Shell / library | `app/src/App.jsx` | `fig-button`, `fig-menu`, `fig-dialog`, `fig-card`, `fig-preview`, etc. |
| Account | `app/src/components/AccountMenu.jsx` | `fig-menu`, `fig-field`, `fig-input-text`, theme `fig-segmented-control` |

## When reviewing upgrades

1. Scan FigUI3 README plus PropsKit2 `README.md` / `.cursor/skills/propskit2/` for new tags.
2. Check whether an existing raw control (e.g. `fig-input-gradient`, manual attachment UI) has a propskit or attachment wrapper.
3. Check `fig-lab.css` for layout tokens affecting `fig-ai-prompt > fig-attachments` spacing.
4. Do not change unrelated app CSS unless the new FigUI3/PropsKit2 release requires it.
