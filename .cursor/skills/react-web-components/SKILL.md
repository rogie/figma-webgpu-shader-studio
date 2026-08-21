---
name: react-web-components
description: Guides React integration with web components, including fig-* and propskit-* elements. Use whenever creating, editing, reviewing, or debugging JSX that contains custom elements or web-component APIs.
---
# React Web Components

## Project rule

any web component, such as fig-* or propskit-* cannot use className terminology in react. it needs class attribute.

- Use `class` on every custom element whose tag contains a hyphen.
- Continue using `className` on native HTML elements and React components.
- Preserve the web component's documented attribute names, including hyphenated names such as `aspect-ratio` and `fig-menu-trigger`.

```jsx
<fig-button class="toolbar-button" variant="ghost" icon="true">
  <fig-icon name="more" />
</fig-button>

<div className="toolbar">...</div>
```

## React integration

- This project uses React 18. For non-string object or function properties, assign the property through a ref in an effect unless the component API explicitly supports an attribute.
- JSX handlers are appropriate for standard DOM events such as `click`. Subscribe to web-component custom events with `addEventListener` on a ref and remove the listener during effect cleanup.
- Treat presence-based boolean attributes carefully. When false should remove the attribute, use `condition ? "" : undefined` unless the component documents another format.
- Before finishing a JSX edit, check all `fig-*`, `propskit-*`, and other hyphenated tags for accidental `className` usage.

## Styling

FigUI3 components already include their visual design. Do not add custom CSS, extra `class` values, or appearance overrides for `fig-*` / `propskit-*` unless the user asked. Follow `.cursor/skills/figui3-styling/SKILL.md` and ask first.
