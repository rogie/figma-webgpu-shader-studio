import { defineProperties } from "figma:shaders"

// @supports-render-scale
export default function Effect() {}

export function setup(device, frame) {
  var SHADER = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  slot0: vec4f,
  slot1: vec4f,
  slot2: vec4f,
  slot3: vec4f,
  slot4: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs_main(@location(0) pos: vec2f, @location(1) uv: vec2f) -> VsOut {
  return VsOut(vec4f(pos, 0.0, 1.0), uv);
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + vec3f(dot(p3, vec3f(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33)));
  return fract((p3.x + p3.y) * p3.z);
}

fn hash11(p: f32) -> f32 {
  var q = fract(p * 0.1031);
  q = q + q * (q + 33.33);
  return fract(q * q);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;
}

fn voronoiDist(p: vec2f) -> f32 {
  let ip = floor(p);
  let fp = fract(p);
  var md = 8.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let o = vec2f(
        hash21(ip + g),
        hash21(ip + g + vec2f(127.1, 311.7))
      );
      let r = g + o - fp;
      let d = dot(r, r);
      md = min(md, d);
    }
  }
  return sqrt(md);
}

fn luminanceZone(lum: f32, hi: f32, mid: f32, shd: f32) -> f32 {
  let shadowW = smoothstep(0.0, 0.25, lum) * (1.0 - smoothstep(0.25, 0.5, lum));
  let midW = smoothstep(0.15, 0.4, lum) * (1.0 - smoothstep(0.6, 0.85, lum));
  let highW = smoothstep(0.5, 0.75, lum);
  return shd * shadowW + mid * midW + hi * highW;
}

// grain is a signed value in [-1, 1]; base is straight color in [0, 1]
fn overlayBlendCh(base: f32, grain: f32) -> f32 {
  // Overlay using signed grain: visible on any base including solids at extremes
  if (grain < 0.0) {
    return base * (1.0 + grain);
  }
  return base + (1.0 - base) * grain;
}

fn softLightCh(base: f32, grain: f32) -> f32 {
  // Soft light using signed grain mapped to [0,1] for the blend formula
  let g = grain * 0.5 + 0.5;
  return select(
    base + (2.0 * g - 1.0) * (sqrt(base) - base),
    base - (1.0 - 2.0 * g) * base * (1.0 - base),
    g < 0.5
  );
}

// grain is signed [-1,1], already scaled by intensity/zone/fade
fn applyBlend(base: vec3f, grain: vec3f, mode: f32) -> vec3f {
  if (mode < 0.5) {
    // Normal: simple additive — always visible on any solid color
    return clamp(base + grain, vec3f(0.0), vec3f(1.0));
  }
  if (mode < 1.5) {
    return vec3f(
      overlayBlendCh(base.x, grain.x),
      overlayBlendCh(base.y, grain.y),
      overlayBlendCh(base.z, grain.z)
    );
  }
  if (mode < 2.5) {
    return vec3f(
      softLightCh(base.x, grain.x),
      softLightCh(base.y, grain.y),
      softLightCh(base.z, grain.z)
    );
  }
  if (mode < 3.5) {
    // Screen: blend positive grain only
    let g = max(grain, vec3f(0.0));
    return vec3f(1.0) - (vec3f(1.0) - base) * (vec3f(1.0) - g);
  }
  if (mode < 4.5) {
    // Multiply: attenuate by negative grain
    let g = grain * 0.5 + 0.5;
    return base * g;
  }
  // Linear Light: additive with doubled grain
  return clamp(base + grain * 2.0, vec3f(0.0), vec3f(1.0));
}

fn grainForStyle(p: vec2f, style: f32, roughness: f32) -> f32 {
  if (style < 0.5) {
    return hash21(floor(p)) * 2.0 - 1.0;
  }
  if (style < 1.5) {
    let coarse = valueNoise(p);
    let fine = valueNoise(p * 2.0);
    return mix(coarse, coarse + fine * 0.5, roughness);
  }
  if (style < 2.5) {
    let n1 = valueNoise(p);
    let n2 = valueNoise(p * 2.0) * 0.5;
    let n3 = valueNoise(p * 4.0) * 0.25;
    var n = n1 + n2 + n3;
    let contrast = 1.0 + roughness * 3.0;
    n = clamp(n * contrast, -1.0, 1.0);
    return n;
  }
  if (style < 3.5) {
    let n = hash21(floor(p)) * 2.0 - 1.0;
    let threshold = 0.3 + roughness * 0.5;
    return select(select(-1.0, 0.0, n > -threshold), 1.0, n > threshold);
  }
  if (style < 4.5) {
    let d = voronoiDist(p * 0.5);
    let wobble = valueNoise(p * 3.0) * 0.08 + valueNoise(p * 7.0) * 0.04;
    let dotRadius = 0.15 + roughness * 0.35;
    let edge = select(1.0, -1.0, d < dotRadius + wobble);
    return edge;
  }
  if (style < 5.5) {
    let rowNoise = hash11(floor(p.y));
    let fine = hash21(floor(p)) * 2.0 - 1.0;
    return mix(rowNoise * 2.0 - 1.0, fine, roughness * 0.3);
  }
  let h1 = hash21(floor(p));
  let h2 = hash21(floor(p) + vec2f(7.93, 13.17));
  let gauss = (h1 + h2 + hash21(floor(p) + vec2f(31.41, 59.27))
             + hash21(floor(p) + vec2f(97.13, 41.71))) * 0.5 - 1.0;
  let n1 = valueNoise(p);
  return mix(gauss, n1, roughness * 0.5);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dims = vec2f(u.slot0.x, u.slot0.y);
  let intensity = u.slot0.z;
  let grainSize = max(u.slot0.w, 1.0);
  let roughness = u.slot1.x;
  let colorAmount = u.slot1.y;
  let style = u.slot1.z;
  let blendMode = u.slot1.w;
  let highlights = u.slot2.x;
  let midtones = u.slot2.y;
  let shadows = u.slot2.z;
  let seed = u.slot2.w;
  let regionCenter = vec2f(u.slot3.x, u.slot3.y) * dims;
  let regionRadius = u.slot3.z * 0.01 * max(dims.x, dims.y);
  let regionAngle = u.slot3.w * 0.01745329;
  let falloff = u.slot4.x;
  let density = u.slot4.y;

  let inputColor = textureSample(inputTex, samp, uv);

  let a = max(inputColor.a, 0.0001);
  let straight = inputColor.rgb / a;

  let pp = uv * dims;
  let rel = pp - regionCenter;
  let cosA = cos(-regionAngle);
  let sinA = sin(-regionAngle);
  let rotated = vec2f(rel.x * cosA - rel.y * sinA, rel.x * sinA + rel.y * cosA);
  let p = rotated / grainSize + vec2f(seed * 17.31, seed * 13.97);

  let dist = length(rel);
  let normDist = dist / max(regionRadius, 0.001);
  let fadeMask = mix(1.0, clamp(1.0 - normDist, 0.0, 1.0), falloff);

  let monoNoise = grainForStyle(p, style, roughness);

  let colorNoise = vec3f(
    grainForStyle(p + vec2f(127.1, 311.7), style, roughness),
    grainForStyle(p + vec2f(269.5, 183.3), style, roughness),
    grainForStyle(p + vec2f(419.2, 371.9), style, roughness)
  );

  let densityHash = hash21(floor(p) + vec2f(573.1, 891.3));
  let densityMask = select(0.0, 1.0, densityHash < density);

  let grainMono = vec3f(monoNoise);
  let grainSignal = mix(grainMono, colorNoise, colorAmount) * densityMask;

  let lum = dot(straight, vec3f(0.2126, 0.7152, 0.0722));
  let zoneMask = luminanceZone(clamp(lum, 0.0, 1.0), highlights, midtones, shadows);

  // grainSignal is signed [-1, 1]; pass directly to blend functions
  let grainLayer = grainSignal * intensity * zoneMask * fadeMask;

  let blended = applyBlend(clamp(straight, vec3f(0.0), vec3f(1.0)), clamp(grainLayer, vec3f(-1.0), vec3f(1.0)), blendMode);

  return vec4f(clamp(blended, vec3f(0.0), vec3f(1.0)) * a, inputColor.a);
}
`;
  frame.state.shaderModule = device.createShaderModule({ code: SHADER });
  frame.state.uniformBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  frame.state.uniformData = new Float32Array(20);
  frame.state.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  frame.state.quad = device.createBuffer({ size: 96, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
  new Float32Array(frame.state.quad.getMappedRange()).set([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
    -1,  1, 0, 0,
     1, -1, 1, 1,
     1,  1, 1, 0,
  ]);
  frame.state.quad.unmap();
}

export function render(device, frame) {
  var s = frame.state;

  if (s.pipelineFormat !== frame.output.format) {
    s.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: s.shaderModule,
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, format: "float32x2", offset: 0 },
            { shaderLocation: 1, format: "float32x2", offset: 8 },
          ],
        }],
      },
      fragment: {
        module: s.shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: frame.output.format }],
      },
      primitive: { topology: "triangle-list" },
    });
    s.pipelineFormat = frame.output.format;
  }

  if (frame.input == null) return;

  var p = frame.params ?? {};

  var intensity = (p.intensity ?? 25) / 100 * 2.0;
  var grainSize = Math.max(p.size ?? 1, 1);
  var roughness = (p.roughness ?? 50) / 100;
  var colorAmount = (p.colorAmount ?? 0) / 100;
  var highlights = (p.highlights ?? 50) / 100;
  var midtones = (p.midtones ?? 100) / 100;
  var shadows = (p.shadows ?? 50) / 100;
  var reg = p.region ?? { x: 50, y: 50, radius: 100, angle: 0 };
  var falloff = (p.falloff ?? 0) / 100;
  var dens = (p.density ?? 100) / 100;
  var renderScale = frame.renderScale || 1;

  s.uniformData.set([
    frame.output.width / renderScale, frame.output.height / renderScale, intensity, grainSize,
    roughness, colorAmount, p.grainStyle ?? 0, p.blendMode ?? 1,
    highlights, midtones, shadows, p.seed ?? 0,
    reg.x / 100, reg.y / 100, reg.radius ?? 100, reg.angle ?? 0,
    falloff, dens, 0, 0,
  ]);
  device.queue.writeBuffer(s.uniformBuf, 0, s.uniformData);

  if (!s.bindGroup || s.bindGroupPipeline !== s.pipeline || s.bindGroupInput !== frame.input) {
    s.bindGroup = device.createBindGroup({
      layout: s.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: s.uniformBuf } },
        { binding: 1, resource: s.sampler },
        { binding: 2, resource: frame.input.createView() },
      ],
    });
    s.bindGroupPipeline = s.pipeline;
    s.bindGroupInput = frame.input;
  }

  var encoder = device.createCommandEncoder();
  var pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: frame.output.createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      storeOp: "store",
    }],
  });
  pass.setPipeline(s.pipeline);
  pass.setBindGroup(0, s.bindGroup);
  pass.setVertexBuffer(0, s.quad);
  pass.draw(6);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

defineProperties(Effect, {
  grainStyle: {
    type: "number",
    label: "Style",
    defaultValue: 0,
    control: "select",
    options: [
      { value: 0, label: "Regular" },
      { value: 1, label: "Soft" },
      { value: 2, label: "Clumped" },
      { value: 3, label: "Contrasty" },
      { value: 4, label: "Stippled" },
      { value: 5, label: "Linear" },
      { value: 6, label: "Film" },
    ],
  },
  intensity: { type: "number", label: "Intensity", defaultValue: 25, control: "slider", min: 0, max: 100, step: 1, unit: "%" },
  size: { type: "number", label: "Size", defaultValue: 1, control: "slider", min: 1, max: 20, step: 0.5 },
  density: { type: "number", label: "Density", defaultValue: 100, control: "slider", min: 0, max: 100, step: 1, unit: "%" },
  roughness: { type: "number", label: "Roughness", defaultValue: 50, control: "slider", min: 0, max: 100, step: 1, unit: "%" },
  colorAmount: { type: "number", label: "Color", defaultValue: 0, control: "slider", min: 0, max: 100, step: 1, unit: "%" },
  highlights: { type: "number", label: "Highlights", defaultValue: 50, control: "slider", min: 0, max: 100, step: 1 },
  midtones: { type: "number", label: "Midtones", defaultValue: 100, control: "slider", min: 0, max: 100, step: 1 },
  shadows: { type: "number", label: "Shadows", defaultValue: 50, control: "slider", min: 0, max: 100, step: 1 },
  blendMode: {
    type: "number",
    label: "Blend",
    defaultValue: 1,
    control: "select",
    options: [
      { value: 0, label: "Normal" },
      { value: 1, label: "Overlay" },
      { value: 2, label: "Soft Light" },
      { value: 3, label: "Screen" },
      { value: 4, label: "Multiply" },
      { value: 5, label: "Linear Light" },
    ],
  },
  region: { type: "point-angle-radius", label: "Region", defaultValue: { x: 50, y: 50, radius: 100, angle: 0 }, mode: "canvas", positionUnit: "%", radiusUnit: "%" },
  falloff: { type: "number", label: "Falloff", defaultValue: 0, control: "slider", min: 0, max: 100, step: 1, unit: "%" },
  seed: { type: "number", label: "Seed", defaultValue: 0, control: "slider", min: 0, max: 100, step: 1 },
});
