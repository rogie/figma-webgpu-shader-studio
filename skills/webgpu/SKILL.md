---
name: webgpu
description: Guide WebGPU application, compute, render pipeline, buffer, texture, bind group, command encoding, and GPU performance work. Use when writing or debugging WebGPU code, GPU pipelines, WGSL bindings from JavaScript or TypeScript, shader resource layouts, compute dispatches, render passes, or WebGPU performance issues.
---

# WebGPU

## Instructions

When working on WebGPU code:

1. Verify pipeline resources agree end-to-end: WGSL `@group/@binding`, bind group entries, buffer usages, texture formats, sampler types, uniform packing, and dispatch/draw dimensions.
2. Prefer stable, reusable GPU resources. Cache pipelines, shader modules, bind group layouts, buffers, samplers, and static lookup tables when dimensions or formats have not changed.
3. Keep uniform buffers 16-byte aligned. Pack scalars into vec4-sized slots or explicitly pad structs and matching JavaScript writes.
4. Choose the smallest resource usage flags that cover actual use: `UNIFORM`, `STORAGE`, `COPY_DST`, `COPY_SRC`, `TEXTURE_BINDING`, `RENDER_ATTACHMENT`, etc.
5. Avoid per-frame allocation for resources that can be reused. Recreate only when size, format, binding layout, or algorithm changes.
6. For compute workloads, match `@workgroup_size` and `dispatchWorkgroups()` to the problem shape. Use parallel dispatches for independent pixels; accept serial execution only when the algorithm has true data dependencies.
7. For render pipelines, verify target format comes from the output texture when possible rather than hardcoding.
8. For alpha output, be explicit about straight vs premultiplied alpha and the blend state expected by the host.

## Performance Checklist

- Minimize CPU-to-GPU writes; update only the buffers that changed.
- Prefer sequential memory access in storage buffers.
- Avoid dynamic loops, dynamic indexing, and repeated bounds checks in hot shader paths when a generator or specialization can unroll them.
- Split border handling from common interior paths for image kernels.
- Precompute static lookup tables on the CPU when they remove repeated shader work.
- Use textures for sampled image data and storage buffers for structured working data.

## Debugging

When a WebGPU update fails:

1. Find the first real validation or shader compilation error; browser wrapper errors often hide useful stderr.
2. Check binding layout mismatches before changing shader logic.
3. Check buffer sizes and alignment before changing resource code.
4. Reduce to the smallest failing pass: load, compute, render, or present.
