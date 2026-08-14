import { defineProperties } from "figma:shaders"

// @supports-render-scale
export default function Effect() {}

export function setup(device, frame) {
  var SPHERE_WGSL = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  values0: vec4f, // shadowIntensity, lightHeight, shadowSoftness, baseGray
  values1: vec4f, // edgeDark, edgeLight, resW, resH
  values2: vec4f, // showShadow, spherePosX%, spherePosY%, spherePixelRadius
  values3: vec4f, // lightPosX%, lightPosY%, lightStrengthRadius%, padding
}
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
}
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.pos;
  return out;
}

fn sdSphere(p: vec3f, r: f32) -> f32 {
  return length(p) - r;
}

fn softShadow(ro: vec3f, rd: vec3f, mint: f32, maxt: f32, k: f32) -> f32 {
  var res: f32 = 1.0;
  var t: f32 = mint;
  for (var i: i32 = 0; i < 64; i = i + 1) {
    let h = sdSphere(ro + rd * t, 1.0);
    if (h < 0.0005) {
      return 0.0;
    }
    res = min(res, k * h / t);
    t = t + clamp(h, 0.01, 0.2);
    if (t > maxt) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

struct Hit {
  t: f32,
  matId: f32,
  hit: bool,
}

fn get_hit(ro: vec3f, rd: vec3f) -> Hit {
  var out: Hit;
  out.hit = false;
  out.matId = -1.0;
  out.t = 1e9;

  var tPlane: f32 = 1e10;
  if (abs(rd.y) > 0.00001) {
    let tp = -(ro.y + 1.0) / rd.y;
    if (tp > 0.0) { tPlane = tp; }
  }

  var tSphere: f32 = 1e10;
  let b = dot(ro, rd);
  let c = dot(ro, ro) - 1.0;
  let h = b * b - c;
  if (h >= 0.0) {
    let ts = -b - sqrt(h);
    if (ts > 0.0) { tSphere = ts; }
  }

  if (tSphere < 1e9 || tPlane < 1e9) {
    out.hit = true;
    if (tSphere < tPlane) {
      out.t = tSphere;
      out.matId = 0.0;
    } else {
      out.t = tPlane;
      out.matId = 1.0;
    }
  }
  return out;
}

fn shade(ro: vec3f, rd: vec3f, lightPos: vec3f) -> vec4f {
  let hit = get_hit(ro, rd);

  let shadowI = u.values0.x;
  let lightI = u.values3.z / 100.0;
  let radiusSoft = clamp(u.values3.z / 150.0, 0.0, 1.0);
  let softnessCtrl = clamp(u.values0.z, 0.0, 1.0);
  let softness = clamp(softnessCtrl + radiusSoft * 0.5, 0.0, 1.0);
  let shK = mix(56.0, 2.0, softness);

  if (!hit.hit) {
    return vec4f(0.0);
  }

  if (hit.matId < 0.5) {
    let p = ro + rd * hit.t;
    let n = normalize(p);
    let toLight = lightPos - p;
    let lightDist = length(toLight);
    let lightDir = toLight / max(lightDist, 0.0001);
    let ndotl = max(dot(n, lightDir), 0.0);
    let hHalf = normalize(lightDir - rd);
    let specMask = smoothstep(0.0, 0.05, ndotl);
    let spec =
      pow(max(dot(n, hHalf), 0.0), 32.0) *
      specMask * 0.35 * lightI;

    let amb = 0.25;
    let litness =
      clamp(amb + 0.85 * ndotl * lightI, 0.0, 1.0);

    let viewDir = -rd;
    let fres = 1.0 - max(dot(n, viewDir), 0.0);

    let dark = pow(fres, 3.0) * u.values1.x * 1.2;
    let bounce = pow(fres, 3.0) * (1.0 - fres) * u.values1.y * 6.0;

    let baseColor = vec3f(u.values0.w);
    let lit = (baseColor * litness) + vec3f(bounce - dark) + vec3f(spec);

    return vec4f(clamp(lit, vec3f(0.0), vec3f(1.0)), 1.0);
  } else {
    let showShadow = u.values2.x;
    if (showShadow < 0.5) {
      return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    let p = ro + rd * hit.t;
    let n = vec3f(0.0, 1.0, 0.0);
    let toLight = lightPos - p;
    let lightDist = length(toLight);
    let lightDir = toLight / max(lightDist, 0.0001);
    let sh = softShadow(p + n * 0.002, lightDir, 0.02, lightDist, shK);
    let shadow = 1.0 - sh;
    let distFade = 1.0 - smoothstep(1.0, 10.0, length(p.xz));
    let a = shadow * distFade * shadowI;
    return vec4f(0.0, 0.0, 0.0, clamp(a, 0.0, 1.0));
  }
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resW = u.values1.z;
  let resH = u.values1.w;
  let aspect = resW / resH;

  let ro = vec3f(0.0, 0.5, 3.5);
  let lookAt = vec3f(0.0, 0.0, 0.0);
  let fwd = normalize(lookAt - ro);
  let right = normalize(cross(fwd, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, fwd);
  let focal = 1.6;

  let spherePosX = u.values2.y;
  let spherePosY = u.values2.z;
  let spherePixR = u.values2.w;
  let centerClip = vec2f(
    (spherePosX / 100.0) * 2.0 - 1.0,
    1.0 - (spherePosY / 100.0) * 2.0
  );
  let camDistSq = dot(ro, ro);
  let defaultPixR = focal * resH / (2.0 * sqrt(camDistSq - 1.0));
  let scl = spherePixR / defaultPixR;

  let lightOffsetPx = vec2f(
    (u.values3.x - spherePosX) * resW / 100.0,
    (u.values3.y - spherePosY) * resH / 100.0
  );
  let sensitivity = 5.0;
  let viewX = sensitivity * lightOffsetPx.x / max(spherePixR, 1.0);
  let viewY = -sensitivity * lightOffsetPx.y / max(spherePixR, 1.0);
  let lightDepth = max(u.values0.y, 0.0);
  let lightPos =
    right * viewX +
    up * viewY -
    fwd * lightDepth;

  let px = vec2f(2.0 / resW, -2.0 / resH);

  let offs = array<vec2f, 8>(
    vec2f(-0.4375,  0.0625),
    vec2f(-0.3125, -0.3125),
    vec2f(-0.1875,  0.4375),
    vec2f(-0.0625, -0.1875),
    vec2f( 0.0625,  0.3125),
    vec2f( 0.1875, -0.4375),
    vec2f( 0.3125,  0.1875),
    vec2f( 0.4375, -0.0625),
  );

  var accColor = vec3f(0.0);
  var accAlpha: f32 = 0.0;
  for (var s: i32 = 0; s < 8; s = s + 1) {
    let o = offs[s];
    let suv = uv + px * o;
    let tuv = (suv - centerClip) / scl;
    let rd = normalize(fwd * focal + right * (tuv.x * aspect) + up * tuv.y);
    let sam = shade(ro, rd, lightPos);
    accColor = accColor + sam.rgb * sam.a;
    accAlpha = accAlpha + sam.a;
  }
  let rgb = accColor / max(accAlpha, 1e-5);
  let a = accAlpha / 8.0;
  return vec4f(rgb * a, a);
}
`

  frame.state.shaderModule = device.createShaderModule({ code: SPHERE_WGSL })
  frame.state.pipeline = null
  frame.state.pipelineFormat = null

  frame.state.quad = device.createBuffer({
    size: 6 * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  })
  new Float32Array(frame.state.quad.getMappedRange()).set([
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
    -1,  1,  0, 0,
     1, -1,  1, 1,
     1,  1,  1, 0,
  ])
  frame.state.quad.unmap()

  frame.state.uniformBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  frame.state.uniformData = new Float32Array(16)
}

export function render(device, frame) {
  var outputFormat = frame.output.format

  if (frame.state.pipeline == null || frame.state.pipelineFormat !== outputFormat) {
    frame.state.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: frame.state.shaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, format: 'float32x2', offset: 0 },
            { shaderLocation: 1, format: 'float32x2', offset: 8 },
          ],
        }],
      },
      fragment: {
        module: frame.state.shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: outputFormat,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    })
    frame.state.pipelineFormat = outputFormat
  }

  var shadowS = frame.params.shadowSoftness
  var shadowI = frame.params.shadowIntensity
  var baseGray = frame.params.baseGray
  var edgeDark = frame.params.edgeDark
  var edgeLight = frame.params.edgeLight
  var showShadow = frame.params.showShadow ? 1.0 : 0.0
  var sph = frame.params.sphere
  var light = frame.params.light
  var lightH = frame.params.lightHeight

  var renderScale = frame.renderScale || 1
  var w = frame.output.width / renderScale
  var h = frame.output.height / renderScale

  frame.state.uniformData.set([
    shadowI, lightH, shadowS, baseGray,
    edgeDark, edgeLight, w, h,
    showShadow, sph.x, sph.y, sph.radius * Math.min(w, h) / 100.0,
    light.x, light.y, light.radius, 0,
  ])
  device.queue.writeBuffer(frame.state.uniformBuf, 0, frame.state.uniformData)

  if (!frame.state.bindGroup || frame.state.bindGroupPipeline !== frame.state.pipeline) {
    frame.state.bindGroup = device.createBindGroup({
      layout: frame.state.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: frame.state.uniformBuf } },
      ],
    })
    frame.state.bindGroupPipeline = frame.state.pipeline
  }

  var encoder = device.createCommandEncoder()
  var pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: frame.output.createView(),
      loadOp: 'clear',
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      storeOp: 'store',
    }],
  })
  pass.setPipeline(frame.state.pipeline)
  pass.setBindGroup(0, frame.state.bindGroup)
  pass.setVertexBuffer(0, frame.state.quad)
  pass.draw(6)
  pass.end()

  device.queue.submit([encoder.finish()])
}

defineProperties(Effect, {
  light: {
    type: "point-radius",
    label: "Light Source",
    defaultValue: { x: 25, y: 20, radius: 90 },
    control: "point-radius",
    mode: "canvas",
    minRadius: 1,
    maxRadius: 200,
    positionUnit: "%",
    radiusUnit: "%",
  },
  lightHeight: {
    type: "number", label: "Light Distance", defaultValue: 4.0,
    control: "slider", min: 0, max: 100, step: 0.05,
  },
  shadowIntensity: {
    type: "number", label: "Shadow Intensity", defaultValue: 0.65,
    control: "slider", min: 0, max: 1, step: 0.01,
  },
  shadowSoftness: {
    type: "number", label: "Shadow Softness", defaultValue: 0.5,
    control: "slider", min: 0, max: 1, step: 0.01,
  },
  baseGray: {
    type: "number", label: "Gray", defaultValue: 0.5,
    control: "slider", min: 0, max: 1, step: 0.01,
  },
  edgeDark: {
    type: "number", label: "Edge Dark", defaultValue: 0.0,
    control: "slider", min: 0, max: 1, step: 0.01,
  },
  edgeLight: {
    type: "number", label: "Edge Light", defaultValue: 0.1,
    control: "slider", min: 0, max: 1, step: 0.01,
  },
  sphere: {
    type: "point-radius",
    label: "Transform",
    defaultValue: { x: 50, y: 50, radius: 40 },
    control: "point-radius",
    mode: "canvas_and_ui",
    minRadius: 1,
    maxRadius: 200,
    positionUnit: "%",
    radiusUnit: "%",
  },
  showShadow: {
    type: "boolean", label: "Shadow", defaultValue: true,
  },
})
