import ditherSrc from "../../dither.ts?raw";
import grainSrc from "../../grain.ts?raw";
import pixelateSrc from "../../pixelate.ts?raw";
import sphereSrc from "../../sphere.ts?raw";

const blankEffect = `import { defineProperties } from "figma:shaders"

export default function Effect() {}

export function setup(device, frame) {
  frame.state.shaderModule = device.createShaderModule({
    code: \`
diagnostic(off,derivative_uniformity);
struct Uniforms { values: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsIn { @location(0) pos: vec2f, @location(1) uv: vec2f };
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(in: VsOut) -> @location(0) vec4f {
  let tint = u.values.x;
  let color = textureSample(inputTex, samp, in.uv);
  let straight = select(color.rgb / max(color.a, 0.0001), vec3f(0.0), color.a <= 0.0);
  let graded = mix(straight, straight.bgr, tint);
  return vec4f(graded * color.a, color.a);
}
\`,
  })

  frame.state.quad = device.createBuffer({
    size: 6 * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  })
  new Float32Array(frame.state.quad.getMappedRange()).set([
    -1, -1, 0, 1,  1, -1, 1, 1,  -1, 1, 0, 0,
    -1, 1, 0, 0,   1, -1, 1, 1,   1, 1, 1, 0,
  ])
  frame.state.quad.unmap()

  frame.state.uniformBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  frame.state.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" })
}

export function render(device, frame) {
  if (frame.input == null) return
  var s = frame.state
  if (s.pipelineFormat !== frame.output.format) {
    s.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: s.shaderModule, entryPoint: "vs_main",
        buffers: [{ arrayStride: 16, attributes: [
          { shaderLocation: 0, format: "float32x2", offset: 0 },
          { shaderLocation: 1, format: "float32x2", offset: 8 },
        ] }],
      },
      fragment: { module: s.shaderModule, entryPoint: "fs_main", targets: [{ format: frame.output.format }] },
      primitive: { topology: "triangle-list" },
    })
    s.pipelineFormat = frame.output.format
  }

  device.queue.writeBuffer(s.uniformBuf, 0, new Float32Array([frame.params.tint ?? 0, 0, 0, 0]))

  var bindGroup = device.createBindGroup({
    layout: s.pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: s.uniformBuf } },
      { binding: 1, resource: s.sampler },
      { binding: 2, resource: frame.input.createView() },
    ],
  })

  var encoder = device.createCommandEncoder()
  var pass = encoder.beginRenderPass({
    colorAttachments: [{ view: frame.output.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }],
  })
  pass.setPipeline(s.pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.setVertexBuffer(0, s.quad)
  pass.draw(6)
  pass.end()
  device.queue.submit([encoder.finish()])
}

defineProperties(Effect, {
  tint: { type: "number", label: "Swap", defaultValue: 0, control: "slider", min: 0, max: 1, step: 0.01 },
})
`;

const blankFill = `import { defineProperties } from "figma:shaders"

export default function Effect() {}

export function setup(device, frame) {
  frame.state.shaderModule = device.createShaderModule({
    code: \`
diagnostic(off,derivative_uniformity);
struct Uniforms { values: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn { @location(0) pos: vec2f, @location(1) uv: vec2f };
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(in: VsOut) -> @location(0) vec4f {
  let scale = max(u.values.x, 0.001);
  let t = u.values.y;
  let drift = vec2f(t * 0.12, t * 0.08);
  let p = in.uv * scale + drift;
  let g = fract(p * 8.0) - 0.5;
  let d = length(g);
  let pulse = 0.32 + 0.04 * sin(t * 2.0 + p.x * 6.0 + p.y * 4.0);
  let ring = smoothstep(pulse + 0.01, pulse, d);
  let col = mix(vec3f(0.05, 0.06, 0.1), vec3f(0.2, 0.7, 1.0), ring);
  return vec4f(col, 1.0);
}
\`,
  })

  frame.state.quad = device.createBuffer({ size: 6 * 4 * 4, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true })
  new Float32Array(frame.state.quad.getMappedRange()).set([
    -1, -1, 0, 1,  1, -1, 1, 1,  -1, 1, 0, 0,
    -1, 1, 0, 0,   1, -1, 1, 1,   1, 1, 1, 0,
  ])
  frame.state.quad.unmap()

  frame.state.uniformBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
}

export function render(device, frame) {
  var s = frame.state
  if (s.pipelineFormat !== frame.output.format) {
    s.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: s.shaderModule, entryPoint: "vs_main",
        buffers: [{ arrayStride: 16, attributes: [
          { shaderLocation: 0, format: "float32x2", offset: 0 },
          { shaderLocation: 1, format: "float32x2", offset: 8 },
        ] }],
      },
      fragment: { module: s.shaderModule, entryPoint: "fs_main", targets: [{ format: frame.output.format }] },
      primitive: { topology: "triangle-list" },
    })
    s.pipelineFormat = frame.output.format
  }

  device.queue.writeBuffer(s.uniformBuf, 0, new Float32Array([
    frame.params.scale ?? 1,
    (frame.time ?? 0) * 0.001,
    0,
    0,
  ]))

  var bindGroup = device.createBindGroup({
    layout: s.pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: s.uniformBuf } }],
  })

  var encoder = device.createCommandEncoder()
  var pass = encoder.beginRenderPass({
    colorAttachments: [{ view: frame.output.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }],
  })
  pass.setPipeline(s.pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.setVertexBuffer(0, s.quad)
  pass.draw(6)
  pass.end()
  device.queue.submit([encoder.finish()])
}

defineProperties(Effect, {
  scale: { type: "number", label: "Scale", defaultValue: 1, control: "slider", min: 0.1, max: 5, step: 0.01 },
})
`;

export const PRESETS = [
  { id: "dither", name: "Dither", kind: "effect", source: ditherSrc },
  { id: "grain", name: "Grain", kind: "effect", source: grainSrc },
  { id: "pixelate", name: "Pixelate", kind: "effect", source: pixelateSrc },
  { id: "sphere", name: "Sphere", kind: "fill", source: sphereSrc },
];

/** Starters for “New Figma shader” — not shown in the nav chooser. */
export const STARTER_PRESETS = [
  { id: "blank-effect", name: "New Effect", kind: "effect", source: blankEffect },
  { id: "blank-fill", name: "New Fill", kind: "fill", source: blankFill },
];

const ALL_PRESETS = [...PRESETS, ...STARTER_PRESETS];

export function getPreset(id) {
  return ALL_PRESETS.find((p) => p.id === id) || PRESETS[0];
}

const BUILTIN_MODULE_FILES = {
  dither: "dither.ts",
  grain: "grain.ts",
  pixelate: "pixelate.ts",
  sphere: "sphere.ts",
};

/** Display name for the code editor tab / header (repo `.ts` for built-ins). */
export function shaderModuleFileName(presetId, shaderName) {
  if (BUILTIN_MODULE_FILES[presetId]) return BUILTIN_MODULE_FILES[presetId];
  const slug =
    (shaderName || "main")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "main";
  return `${slug}.ts`;
}
