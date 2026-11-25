---
name: figma-shader-coder
description: Author, update, and validate Figma shader effects and shader fills. Use when coding Figma shaders, shader effects, shader fills, WGSL for Figma, or when working with figma shader build/overwrite-using-recipe workflows.
---

# Figma Shader Coder

## Instructions

When this skill is used, immediately read `/Users/rking/Figma shaders/skills/v3.md.tmpl` and follow it as the source of truth for coding Figma shader effects and shader fills.

Treat the template as shader-authoring guidance for the current agent. If the template refers to the `shader-coder` subagent or "caller", map that to the current request context.

Before editing shader source:

1. Read the shader's `product-brief.md`.
2. Decide whether the shader should use the recipe flow or a raw `main.ts` implementation.
3. Keep `main.ts`, `features.json`, and `product-brief.md` consistent with the requested shader behavior.
4. Run the local shader build command when a shader id is available.
5. Fix build, WGSL, type, and lint errors with the smallest targeted edits.

Do not deploy, create, update, attach, or invalidate shaders unless the user explicitly asks for those actions.

## Figma MCP publishing

Use Figma's current `figma-shaders` skill for the connected MCP workflow. Create the fill or effect scaffold in the chosen plan, read its source contract, and update it with the complete `main.ts`. For a linked shader, keep its existing kind and update it directly. Pass `usesMouse` for any pointer read, including `frame.mousePosition.down`, and `isAnimated` for clock reads. Send those flags in update metadata, with a commit message and the supported version notes. If Figma rejects a capability, report the rejection and preserve the source.
