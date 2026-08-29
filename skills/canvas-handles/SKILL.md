---
name: canvas-handles
description: Defines Figma shader spatial-property schemas for draggable canvas handles. Use whenever a shader exposes a center, origin, focal point, radius, angle, line, gradient axis, light position, or positioned color.
---

# Figma shader canvas handles

Use rich `defineProperties` types for spatial values. Do not replace a supported
canvas handle with separate numeric X/Y/radius/angle sliders.

## Choose the handle

- `point`: one position.
- `point-radius`: position plus radius.
- `point-angle-radius`: position, radius, and angle.
- `point-point-line`: two endpoints.
- `color-point`: position coupled to a color.

Use `mode: "canvas_and_ui"` by default so the handle appears on canvas and in
the properties panel. Use `"canvas"` to hide it from the panel or `"ui"` when
the value should not have an on-canvas handle.

Prefer percent units for resize-relative geometry. Percent positions are
layer-relative; divide them by `100.0` before using them as WGSL UVs. A percent
radius is relative to the smaller layer dimension. Angles are degrees.

## Schemas

```javascript
center: {
  type: "point",
  label: "Center",
  defaultValue: { x: 50, y: 50 },
  control: "point",
  mode: "canvas_and_ui",
  unit: "%",
}

circle: {
  type: "point-radius",
  label: "Circle",
  defaultValue: { x: 50, y: 50, radius: 25 },
  control: "point-radius",
  mode: "canvas_and_ui",
  minRadius: 1,
  maxRadius: 100,
  positionUnit: "%",
  radiusUnit: "%",
}

ray: {
  type: "point-angle-radius",
  label: "Ray",
  defaultValue: { x: 50, y: 50, radius: 25, angle: 45 },
  mode: "canvas_and_ui",
  minRadius: 1,
  maxRadius: 100,
  positionUnit: "%",
  radiusUnit: "%",
}

axis: {
  type: "point-point-line",
  label: "Axis",
  defaultValue: { x: 25, y: 50, x2: 75, y2: 50 },
  mode: "canvas_and_ui",
  unit: "%",
}

light: {
  type: "color-point",
  label: "Light",
  defaultValue: {
    x: 50,
    y: 50,
    color: { r: 1, g: 0.65, b: 0.25, a: 1 },
  },
  control: "color-point",
  mode: "canvas_and_ui",
  unit: "%",
}
```

## Runtime values

- `point` → `{ x, y }`
- `point-radius` → `{ x, y, radius }`
- `point-angle-radius` → `{ x, y, radius, angle }`
- `point-point-line` → `{ x, y, x2, y2 }`
- `color-point` → `{ x, y, color: { r, g, b, a } }`

Read these objects from `frame.params`. Pack every component needed by WGSL
into aligned uniforms; never pass JavaScript objects directly to the GPU.
