---
name: figui3-styling
description: >-
  Prefer FigUI3 component styling over custom CSS. Use whenever adding or
  editing CSS, class names, stylesheets, visual appearance, layout polish, or
  fig-* / propskit-* UI. Agents must ask before adding custom styling for
  FigUI3 components.
---

# FigUI3 styling

FigUI3 components already ship their visual design via `fig.css`, `fig-editor.css`, and `fig-lab.css` (loaded in `app/src/main.jsx`). Do not restyle them by default.

## Use the component, not CSS

Prefer documented attributes and tokens over new rules:

- Attributes such as `variant`, `size`, `icon`, and other props on `fig-*` / `propskit-*`
- Design tokens already in use: `--figma-color-*`, `--spacer-*`, `--body-*`, and component variables such as `--fig-chooser-grid-columns`
- The matching FigUI3 tag instead of recreating its look with custom HTML/CSS

## Ask before custom styling

Stop and ask the user before doing any of the following:

- Creating a new `.css` file
- Adding rules that target `fig-*`, `propskit-*`, `::part`, or nested FigUI3 internals
- Overriding color, type, padding, border, radius, hover, or focus on FigUI3 controls
- Adding `class` / `className` whose only purpose is to restyle a FigUI3 component

Ask in one short question: what you want to change, why the built-in look is insufficient, and the FigUI3 attribute or component you would use instead. Do not add the CSS until they agree.

## Allowed without asking

App-shell layout that does not change FigUI3 appearance:

- Flex/grid placement, widths, min-height, overflow, and show/hide for page regions
- Using existing tokens on native wrappers (`div`, `section`) and empty-state copy

If a change could be read as restyling a FigUI3 control, ask.

## Existing CSS

Keep layout in the files that already exist (`app/src/app.css` and colocated `Component.css`). Do not add CSS to “finish” a FigUI3 control.
