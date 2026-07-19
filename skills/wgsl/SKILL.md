---
name: wgsl
description: Guide WGSL shader authoring, debugging, validation, resource bindings, uniform/storage layout, compute and fragment shader logic, and shader performance. Use when writing or fixing WGSL code, WebGPU shaders, Figma shaders, compute kernels, render shaders, or WGSL compilation and validation errors.
---

# WGSL

## Instructions

When working on WGSL:

1. Confirm every `@group/@binding` declaration matches the host-side bind group layout and resource type.
2. Keep uniform structs aligned. Use 16-byte-friendly packing for scalars, `vec4f`, and padding fields, and verify JavaScript writes use the same offsets.
3. Prefer explicit types for numeric values when ambiguity can hurt validation: `u32`, `i32`, `f32`, `vec2f`, `vec3f`, `vec4f`.
4. Avoid derivative functions (`dpdx`, `dpdy`, `fwidth`) in non-uniform control flow. Use `diagnostic(off, derivative_uniformity);` only when the host environment expects it and the logic is understood.
5. In hot loops, avoid dynamic array indexing, modulo, function calls, and repeated bounds checks when constants can be generated or code can be unrolled.
6. For image kernels, separate interior pixels from border pixels so common paths avoid bounds checks.
7. For exact error-diffusion algorithms, preserve dependency order. Optimize serial work with scanline locality, unrolled taps, reused weights, and precomputed traversal/index buffers.
8. For alpha, state whether returned color is straight or premultiplied and ensure the caller’s blend mode matches.

## Validation Checklist

- Storage buffer indices are in range or guarded.
- Integer and float math are not accidentally mixed.
- Loop bounds are finite and compatible with WGSL validation.
- Arrays with runtime indexing are necessary; otherwise prefer generated constants or unrolled code.
- Texture coordinates are clamped or intentionally allowed to sample outside through the host’s helper.
- Compute shaders guard `global_invocation_id` against dimensions.

## Performance Checklist

- Reuse computed values such as luma, quantized values, weighted errors, offsets, and index bases.
- Prefer bit masking over modulo for powers of two.
- Prefer sequential memory access for storage buffers.
- Move invariant work out of shaders into JavaScript/TypeScript when it is static for the pipeline or frame.
- Specialize generated WGSL per algorithm when kernels have different tap counts, weights, or bounds.
