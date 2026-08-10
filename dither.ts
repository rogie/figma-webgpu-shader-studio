import { defineProperties } from "figma:shaders"

export default function Effect() {}

/*
 * Compute-shader dithering. Mirrors the reference WebGPU pipeline in index.html:
 * 1. load    (compute) — sample input texture at block centers into a working buffer
 * 2. dither  (compute) — true error diffusion / ordered dither
 * 3. present (render)  — upscale the working buffer back into frame.output
 *
 * Unlike the fragment-only version, error-diffusion styles propagate real error
 * between pixels (diagonal wavefront), so Atkinson/Floyd/Sierra/Jarvis
 * match the reference instead of being faked with static threshold matrices.
 */

// ---------------------------------------------------------------------------
// Error-diffusion kernels (dx, dy, weight) + divisor. Same data as index.html.
// ---------------------------------------------------------------------------
function getKERNELS() {
  return {
    atkinson: { div: 8, taps: [[1,0,1],[2,0,1],[-1,1,1],[0,1,1],[1,1,1],[0,2,1]] },
    floyd:    { div: 16, taps: [[1,0,7],[-1,1,3],[0,1,5],[1,1,1]] },
    sierra:   { div: 32, taps: [[1,0,5],[2,0,3],[-2,1,2],[-1,1,4],[0,1,5],[1,1,4],[2,1,2],[-1,2,2],[0,2,3],[1,2,2]] },
    jarvis:   { div: 48, taps: [[1,0,7],[2,0,5],[-2,1,3],[-1,1,5],[0,1,7],[1,1,5],[2,1,3],[-2,2,1],[-1,2,3],[0,2,5],[1,2,3],[2,2,1]] },
  }
}

// ---------------------------------------------------------------------------
// Tile generation for ordered styles (Bayer / Blue Noise / Threshold).
// Returns Float32Array of thresholds normalized to [0,1] plus the tile size.
// ---------------------------------------------------------------------------
function bayerMatrix(N): number[][] {
  if (N === 1) return [[0]]
  var small = bayerMatrix(N / 2)
  var m = N / 2
  var out: number[][] = []
  for (var y = 0; y < N; y++) {
    out[y] = new Array(N) as number[]
    for (var x = 0; x < N; x++) {
      var v = small[y % m][x % m] * 4
      var qx = Math.floor(x / m), qy = Math.floor(y / m)
      var qoff = (qy === 0 && qx === 0) ? 0
               : (qy === 0 && qx === 1) ? 2
               : (qy === 1 && qx === 0) ? 3 : 1
      out[y][x] = v + qoff
    }
  }
  return out
}

function flattenBayer(N) {
  var m = bayerMatrix(N)
  var data = new Float32Array(N * N)
  var denom = N * N
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      data[y * N + x] = (m[y][x] + 0.5) / denom
    }
  }
  return { data: data, size: N }
}

function rankOrderTile(buf: Float32Array, N: number) {
  var idx: number[] = []
  for (var i = 0; i < buf.length; i++) idx.push(i)
  idx.sort(function(a, b) { return buf[a] - buf[b] })
  var out = new Float32Array(buf.length)
  for (var rank = 0; rank < idx.length; rank++) {
    out[idx[rank]] = (rank + 0.5) / buf.length
  }
  return { data: out, size: N }
}

// Deterministic PRNG so the blue-noise tile is stable across runs.
function mulberry32(seed) {
  var a = seed >>> 0
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    var t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeBlueNoiseTile(N: number) {
  var rnd = mulberry32(0x9E3779B9)
  var total = N * N
  var data = new Float32Array(total)
  var lowEnergy = new Float32Array(total)
  var highEnergy = new Float32Array(total)
  var remaining: number[] = []
  var offsets: { dx: number, dy: number, w: number }[] = []

  // Two-sided progressive void placement. Low thresholds and high thresholds
  // are both distributed as blue-noise sets, which keeps shadows and highlights
  // from developing visible clumps.
  for (var i = 0; i < total; i++) remaining.push(i)

  var radius = 7
  var sigma = 2.25
  var invTwoSigmaSq = 1 / (2 * sigma * sigma)
  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      var d2 = dx * dx + dy * dy
      if (d2 > 0 && d2 <= radius * radius) {
        offsets.push({ dx: dx, dy: dy, w: Math.exp(-d2 * invTwoSigmaSq) })
      }
    }
  }

  var candidates = 64
  function chooseVoid(energy: Float32Array) {
    var bestSlot = 0
    var bestEnergy = Infinity
    var tries = Math.min(candidates, remaining.length)
    for (var c = 0; c < tries; c++) {
      var slot = Math.floor(rnd() * remaining.length)
      var p = remaining[slot]
      var e = energy[p]
      if (e < bestEnergy || (e === bestEnergy && rnd() < 0.5)) {
        bestEnergy = e
        bestSlot = slot
      }
    }
    return bestSlot
  }

  function removeSlot(slot: number) {
    var chosen = remaining[slot]
    remaining[slot] = remaining[remaining.length - 1]
    remaining.pop()
    return chosen
  }

  function addEnergy(energy: Float32Array, chosen: number) {
    var cx = chosen % N
    var cy = Math.floor(chosen / N)
    for (var o = 0; o < offsets.length; o++) {
      var off = offsets[o]
      var xx = (cx + off.dx + N) % N
      var yy = (cy + off.dy + N) % N
      energy[yy * N + xx] += off.w
    }
  }

  var lo = 0
  var hi = total - 1
  while (remaining.length > 0) {
    var low = removeSlot(chooseVoid(lowEnergy))
    data[low] = (lo + 0.5) / total
    addEnergy(lowEnergy, low)
    lo++

    if (remaining.length > 0) {
      var high = removeSlot(chooseVoid(highEnergy))
      data[high] = (hi + 0.5) / total
      addEnergy(highEnergy, high)
      hi--
    }
  }

  return { data: data, size: N }
}

function getTile(name) {
  switch (name) {
    case 'bayer2':    return flattenBayer(2)
    case 'bayer4':    return flattenBayer(4)
    case 'bayer8':    return flattenBayer(8)
    case 'bayer16':   return flattenBayer(16)
    case 'bluenoise': return makeBlueNoiseTile(256)
    case 'threshold': return { data: new Float32Array([0.5]), size: 1 }
    default:          return flattenBayer(4)
  }
}

// ---------------------------------------------------------------------------
// Shared WGSL snippets
// ---------------------------------------------------------------------------
function getLUMA() { return 'fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }\n' }

// ---------------------------------------------------------------------------
// Shader builders
// ---------------------------------------------------------------------------
function buildLoadShader() {
  return `diagnostic(off,derivative_uniformity);
struct LP { width: u32, height: u32, pixelSize: f32, _pad: f32 };
@group(0) @binding(0) var<uniform> P: LP;
@group(0) @binding(1) var<storage, read_write> buf: array<vec4f>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var tex: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= P.width || gid.y >= P.height) { return; }
  let dims = vec2f(textureDimensions(tex, 0));
  let center = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) * P.pixelSize / dims;
  let uv = clamp(center, vec2f(0.0), vec2f(1.0));
  let s = textureSampleLevel(tex, samp, uv, 0.0);
  var rgb = vec3f(0.0);
  if (s.a > 0.0) { rgb = s.rgb / s.a; }
  buf[gid.y * P.width + gid.x] = vec4f(rgb, s.a);
}
`
}

function buildEDShader(kernel, monoMode) {
  var TAP_COUNT = kernel.taps.length

  var maxNegX = 0, maxPosX = 0, maxPosY = 0
  for (var i = 0; i < TAP_COUNT; i++) {
    var dx = kernel.taps[i][0], dy = kernel.taps[i][1]
    if (dx < 0) maxNegX = Math.max(maxNegX, -dx)
    if (dx > 0) maxPosX = Math.max(maxPosX, dx)
    maxPosY = Math.max(maxPosY, dy)
  }

  function offExpr(dx, dy) {
    var e = 'i'
    if (dy === 1) e += ' + W'
    else if (dy > 1) e += ' + ' + dy + ' * W'
    if (dx > 0) e += ' + ' + dx
    else if (dx < 0) e += ' - ' + (-dx)
    return e
  }

  var interior = ''
  var border = ''
  var weightCounts = {}
  var weightVars = {}
  var weightedErrDecl = ''
  for (var i = 0; i < TAP_COUNT; i++) {
    var wk = (kernel.taps[i][2] / kernel.div).toFixed(8)
    weightCounts[wk] = (weightCounts[wk] || 0) + 1
  }
  var weightVarIndex = 0
  for (var key in weightCounts) {
    if (weightCounts[key] > 1) {
      var name = 'errW' + weightVarIndex
      weightVars[key] = name
      weightedErrDecl += '      let ' + name + ' = err * ' + key + ';\n'
      weightVarIndex++
    }
  }
  for (var i = 0; i < TAP_COUNT; i++) {
    var t = kernel.taps[i]
    var dx = t[0], dy = t[1]
    var w = (t[2] / kernel.div).toFixed(8)
    var j = offExpr(dx, dy)
    var errTerm = weightVars[w] || 'err * ' + w
    interior += '      { let j = ' + j + '; let p = buf[j]; buf[j] = vec4f(p.rgb + ' + errTerm + ', p.a); }\n'

    var conds: string[] = []
    if (dx < 0) conds.push('x >= ' + (-dx))
    if (dx > 0) conds.push('x < W - ' + dx)
    if (dy > 0) conds.push('y < H - ' + dy)
    if (conds.length > 0) {
      border += '      if (' + conds.join(' && ') + ') { let j = ' + j + '; let p = buf[j]; buf[j] = vec4f(p.rgb + ' + errTerm + ', p.a); }\n'
    } else {
      border += interior.slice(interior.lastIndexOf('      {'))
    }
  }

  // Skew = how many columns each row lags the one above it. With this value no
  // two threads ever touch the same cell in the same step, and every error
  // write from an above/left source lands (after the per-step barrier) before
  // it is read. Output is identical to a serial top-left->bottom-right scan.
  var WG = 64
  var SKEW = maxNegX + maxPosX + 1

  var quantCode = monoMode ? `    let g = luma(c);
    let gq = quantize(g);
    let q = P.monoColor.rgb * gq;
    let err = vec3f(g - gq);
` : `    let q = vec3f(quantize(c.r), quantize(c.g), quantize(c.b));
    let err = c - q;
`

  return `diagnostic(off,derivative_uniformity);
struct Params {
  width: u32, height: u32, _pad0: u32, _pad1: u32,
  levels: f32, mode: u32, _pad2: u32, _pad3: u32,
  bright: f32, contrast: f32, _pad4: u32, _pad5: u32,
  monoColor: vec4f,
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> buf: array<vec4f>;
fn quantize(v: f32) -> f32 { let L = P.levels - 1.0; return clamp(round(v * L) / L, 0.0, 1.0); }
${getLUMA()}
fn processPixel(x: i32, y: i32, W: i32, H: i32) {
  let i = y * W + x;
  let cell = buf[i];
  var c = cell.rgb;
  c = (c - 0.5) * P.contrast + 0.5 + P.bright;
  c = clamp(c, vec3f(0.0), vec3f(1.0));

${quantCode}
  buf[i] = vec4f(q, cell.a);

${weightedErrDecl}
  if (x >= ${maxNegX} && x < W - ${maxPosX} && y < H - ${maxPosY}) {
${interior}  } else {
${border}  }
}

// Skewed-wavefront parallel error diffusion. One workgroup of ${WG} threads
// processes a band of ${WG} rows at once; thread t owns one row and trails
// thread t-1 by ${SKEW} columns. The per-step storageBarrier publishes each
// step's writes before the next step reads them, so results match a serial scan
// while running ${WG} rows concurrently.
@compute @workgroup_size(${WG})
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let t = i32(lid.x);
  let W = i32(P.width); let H = i32(P.height);
  let bands = (H + ${WG - 1}) / ${WG};
  let steps = W + ${SKEW * (WG - 1)};
  for (var b: i32 = 0; b < bands; b = b + 1) {
    let y = b * ${WG} + t;
    for (var step: i32 = 0; step < steps; step = step + 1) {
      let x = step - ${SKEW} * t;
      if (y < H && x >= 0 && x < W) {
        processPixel(x, y, W, H);
      }
      storageBarrier();
    }
  }
}
`
}

function buildOrderedShader(monoMode) {
  var quantCode = monoMode ? `  let q = P.monoColor.rgb * quantize(luma(c), th);
` : `  let q = vec3f(quantize(c.r, th), quantize(c.g, th), quantize(c.b, th));
`
  return `diagnostic(off,derivative_uniformity);
struct Params {
  width: u32, height: u32, tileSize: u32, _pad0: u32,
  levels: f32, mode: u32, _pad1: vec2u,
  bright: f32, contrast: f32, _pad2: vec2f,
  monoColor: vec4f,
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> buf: array<vec4f>;
@group(0) @binding(2) var<storage, read> tile: array<f32>;
fn quantize(c: f32, t: f32) -> f32 {
  let L = P.levels - 1.0;
  let off = (t - 0.5) / L;
  return clamp(round((c + off) * L) / L, 0.0, 1.0);
}
${getLUMA()}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= P.width || gid.y >= P.height) { return; }
  let i = gid.y * P.width + gid.x;
  let cell = buf[i];
  var c = cell.rgb;
  c = (c - 0.5) * P.contrast + 0.5 + P.bright;
  c = clamp(c, vec3f(0.0), vec3f(1.0));
  let tileMask = P.tileSize - 1u;
  let tx = gid.x & tileMask;
  let ty = gid.y & tileMask;
  let th = tile[ty * P.tileSize + tx];
${quantCode}
  buf[i] = vec4f(q, cell.a);
}
`
}

function buildPresentShader() {
  return `diagnostic(off,derivative_uniformity);
struct PP { sx: f32, sy: f32, fW: f32, fH: f32, _a: f32, _b: f32, _c: f32, _d: f32 };
@group(0) @binding(0) var<uniform> P: PP;
@group(0) @binding(1) var<storage, read> buf: array<vec4f>;

struct VsIn { @location(0) pos: vec2f, @location(1) uv: vec2f };
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(in: VsOut) -> @location(0) vec4f {
  let W = i32(P.fW); let H = i32(P.fH);
  var cx = i32(floor(in.uv.x * P.sx));
  var cy = i32(floor(in.uv.y * P.sy));
  cx = clamp(cx, 0, W - 1);
  cy = clamp(cy, 0, H - 1);
  let p = buf[cy * W + cx];
  if (p.a <= 0.0) { return vec4f(0.0); }
  return vec4f(p.rgb * p.a, p.a);
}
`
}

// ---------------------------------------------------------------------------
// Algorithm registry
// ---------------------------------------------------------------------------
function getALGO_MAP() {
  return {
    'Atkinson':       { fam: 'ed',  kernel: 'atkinson' },
    'Floyd-Steinberg':{ fam: 'ed',  kernel: 'floyd' },
    'Sierra':         { fam: 'ed',  kernel: 'sierra' },
    'Jarvis':         { fam: 'ed',  kernel: 'jarvis' },
    'Bayer 2x2':      { fam: 'ord', tile: 'bayer2' },
    'Bayer 4x4':      { fam: 'ord', tile: 'bayer4' },
    'Bayer 8x8':      { fam: 'ord', tile: 'bayer8' },
    'Bayer 16x16':    { fam: 'ord', tile: 'bayer16' },
    'Blue Noise':     { fam: 'ord', tile: 'bluenoise' },
    'Threshold':      { fam: 'ord', tile: 'threshold' },
  }
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
export function setup(device, frame) {
  var s = frame.state

  // Fullscreen quad reused by the present pass.
  s.quad = device.createBuffer({
    size: 6 * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  })
  new Float32Array(s.quad.getMappedRange()).set([
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
    -1,  1,  0, 0,
     1, -1,  1, 1,
     1,  1,  1, 0,
  ])
  s.quad.unmap()

  s.sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  })

  s.edPipelines = {}
  s.orderedPipelines = {}
  s.tileBufs = {}
}

// ---------------------------------------------------------------------------
// Lazy pipeline getters
// ---------------------------------------------------------------------------
function getLoadPipeline(device, s) {
  if (!s.loadPipeline) {
    var module = device.createShaderModule({ code: buildLoadShader() })
    s.loadPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } })
  }
  return s.loadPipeline
}

function getOrderedPipeline(device, s, mode) {
  var key = mode === 0 ? 'mono' : 'color'
  if (!s.orderedPipelines[key]) {
    var module = device.createShaderModule({ code: buildOrderedShader(mode === 0) })
    s.orderedPipelines[key] = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } })
  }
  return s.orderedPipelines[key]
}

function getEDPipeline(device, s, kernelName, mode) {
  var key = kernelName + ':' + (mode === 0 ? 'mono' : 'color')
  if (!s.edPipelines[key]) {
    var module = device.createShaderModule({ code: buildEDShader(getKERNELS()[kernelName], mode === 0) })
    s.edPipelines[key] = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    })
  }
  return s.edPipelines[key]
}

function getPresentPipeline(device, s, format) {
  if (s.presentPipeline && s.presentFormat === format) return s.presentPipeline
  var module = device.createShaderModule({ code: buildPresentShader() })
  s.presentPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module, entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 16,
        attributes: [
          { shaderLocation: 0, format: 'float32x2', offset: 0 },
          { shaderLocation: 1, format: 'float32x2', offset: 8 },
        ],
      }],
    },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  s.presentFormat = format
  return s.presentPipeline
}

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------
function ensurePixelBuf(device, s, W, H) {
  if (s.pixelBuf && s.bufW === W && s.bufH === H) return s.pixelBuf
  if (s.pixelBuf) s.pixelBuf.destroy()
  s.pixelBuf = device.createBuffer({
    size: W * H * 16,
    usage: GPUBufferUsage.STORAGE,
  })
  s.bufW = W; s.bufH = H
  return s.pixelBuf
}

function ensureTileBuf(device, s, name) {
  if (s.tileBufs[name]) return s.tileBufs[name]
  var tile = getTile(name)
  var buf = device.createBuffer({
    size: Math.max(tile.data.byteLength, 16),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(buf, 0, tile.data)
  var entry = { buffer: buf, size: tile.size }
  s.tileBufs[name] = entry
  return entry
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
export function render(device, frame) {
  if (frame.input == null) return
  var s = frame.state

  var dimX = frame.input.width
  var dimY = frame.input.height
  if (!dimX || !dimY) return

  var pixelSize = frame.params.pixelSize
  var levels = frame.params.levels
  var bright = (frame.params.brightness - 100) / 200
  var contrast = frame.params.contrast
  var mode = frame.params.mono ? 0 : 1
  var mc = frame.params.monoColor

  var W = Math.max(1, Math.ceil(dimX / pixelSize))
  var H = Math.max(1, Math.ceil(dimY / pixelSize))

  var algoStr = frame.params.algorithm
  var algoMap = s.algoMap || (s.algoMap = getALGO_MAP())
  var algo = algoMap[algoStr] || algoMap['Bayer 8x8']

  var pixelBuf = ensurePixelBuf(device, s, W, H)

  // --- 1. load pass ---------------------------------------------------------
  var loadPipe = getLoadPipeline(device, s)
  if (!s.loadUbuf) {
    s.loadUbuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  }
  if (!s.loadParams) {
    s.loadParams = new ArrayBuffer(16)
    s.loadParamsView = new DataView(s.loadParams)
  }
  var ldv = s.loadParamsView
  ldv.setUint32(0, W, true)
  ldv.setUint32(4, H, true)
  ldv.setFloat32(8, pixelSize, true)
  device.queue.writeBuffer(s.loadUbuf, 0, s.loadParams)

  if (
    !s.loadBG ||
    s.loadBGPipe !== loadPipe ||
    s.loadBGPixelBuf !== pixelBuf ||
    s.loadBGInput !== frame.input
  ) {
    s.loadBG = device.createBindGroup({
      layout: loadPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: s.loadUbuf } },
        { binding: 1, resource: { buffer: pixelBuf } },
        { binding: 2, resource: s.sampler },
        { binding: 3, resource: frame.input.createView() },
      ],
    })
    s.loadBGPipe = loadPipe
    s.loadBGPixelBuf = pixelBuf
    s.loadBGInput = frame.input
  }

  var encoder = device.createCommandEncoder()
  var loadPass = encoder.beginComputePass()
  loadPass.setPipeline(loadPipe)
  loadPass.setBindGroup(0, s.loadBG)
  loadPass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8))
  loadPass.end()

  // --- 2. dither pass -------------------------------------------------------
  if (algo.fam === 'ed') {
    var edPipe = getEDPipeline(device, s, algo.kernel, mode)
    if (!s.edUbuf) {
      s.edUbuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    }
    if (!s.edParams) {
      s.edParams = new ArrayBuffer(64)
      s.edParamsView = new DataView(s.edParams)
    }
    var edv = s.edParamsView
    edv.setUint32(0, W, true)
    edv.setUint32(4, H, true)
    edv.setFloat32(16, levels, true)
    edv.setUint32(20, mode, true)
    edv.setFloat32(32, bright, true)
    edv.setFloat32(36, contrast, true)
    edv.setFloat32(48, mc.r, true)
    edv.setFloat32(52, mc.g, true)
    edv.setFloat32(56, mc.b, true)
    edv.setFloat32(60, 1, true)
    device.queue.writeBuffer(s.edUbuf, 0, s.edParams)

    if (!s.edBG || s.edBGPipe !== edPipe || s.edBGPixelBuf !== pixelBuf) {
      s.edBG = device.createBindGroup({
        layout: edPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: s.edUbuf } },
          { binding: 1, resource: { buffer: pixelBuf } },
        ],
      })
      s.edBGPipe = edPipe
      s.edBGPixelBuf = pixelBuf
    }

    var edPass = encoder.beginComputePass()
    edPass.setPipeline(edPipe)
    edPass.setBindGroup(0, s.edBG)
    edPass.dispatchWorkgroups(1)
    edPass.end()
  } else if (algo.fam === 'ord') {
    var ordPipe = getOrderedPipeline(device, s, mode)
    var tile = ensureTileBuf(device, s, algo.tile)
    if (!s.ordUbuf) {
      s.ordUbuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    }
    if (!s.ordParams) {
      s.ordParams = new ArrayBuffer(64)
      s.ordParamsView = new DataView(s.ordParams)
    }
    var odv = s.ordParamsView
    odv.setUint32(0, W, true)
    odv.setUint32(4, H, true)
    odv.setUint32(8, tile.size, true)
    odv.setFloat32(16, levels, true)
    odv.setUint32(20, mode, true)
    odv.setFloat32(32, bright, true)
    odv.setFloat32(36, contrast, true)
    odv.setFloat32(48, mc.r, true)
    odv.setFloat32(52, mc.g, true)
    odv.setFloat32(56, mc.b, true)
    odv.setFloat32(60, 1, true)
    device.queue.writeBuffer(s.ordUbuf, 0, s.ordParams)

    if (!s.ordBG || s.ordBGPipe !== ordPipe || s.ordBGPixelBuf !== pixelBuf || s.ordBGTileBuf !== tile.buffer) {
      s.ordBG = device.createBindGroup({
        layout: ordPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: s.ordUbuf } },
          { binding: 1, resource: { buffer: pixelBuf } },
          { binding: 2, resource: { buffer: tile.buffer } },
        ],
      })
      s.ordBGPipe = ordPipe
      s.ordBGPixelBuf = pixelBuf
      s.ordBGTileBuf = tile.buffer
    }
    var ordPass = encoder.beginComputePass()
    ordPass.setPipeline(ordPipe)
    ordPass.setBindGroup(0, s.ordBG)
    ordPass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8))
    ordPass.end()
  }

  // --- 3. present pass ------------------------------------------------------
  var presentPipe = getPresentPipeline(device, s, frame.output.format)
  if (!s.presentUbuf) {
    s.presentUbuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  }
  if (!s.presentParams) {
    s.presentParams = new ArrayBuffer(32)
    s.presentParamsView = new DataView(s.presentParams)
  }
  var pdv = s.presentParamsView
  pdv.setFloat32(0, dimX / pixelSize, true)
  pdv.setFloat32(4, dimY / pixelSize, true)
  pdv.setFloat32(8, W, true)
  pdv.setFloat32(12, H, true)
  device.queue.writeBuffer(s.presentUbuf, 0, s.presentParams)

  if (!s.presentBG || s.presentBGPipe !== presentPipe || s.presentBGPixelBuf !== pixelBuf) {
    s.presentBG = device.createBindGroup({
      layout: presentPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: s.presentUbuf } },
        { binding: 1, resource: { buffer: pixelBuf } },
      ],
    })
    s.presentBGPipe = presentPipe
    s.presentBGPixelBuf = pixelBuf
  }

  var pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: frame.output.createView(),
      loadOp: 'clear',
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      storeOp: 'store',
    }],
  })
  pass.setPipeline(presentPipe)
  pass.setBindGroup(0, s.presentBG)
  pass.setVertexBuffer(0, s.quad)
  pass.draw(6)
  pass.end()

  device.queue.submit([encoder.finish()])
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
defineProperties(Effect, {
  algorithm: {
    type: 'string',
    label: 'Style',
    defaultValue: 'Atkinson',
    control: 'select',
    options: [
      { value: 'Atkinson', label: 'Atkinson' },
      { value: 'Floyd-Steinberg', label: 'Floyd-Steinberg' },
      { value: 'Sierra', label: 'Sierra' },
      { value: 'Jarvis', label: 'Jarvis' },
      { value: 'Bayer 2x2', label: 'Bayer 2x2' },
      { value: 'Bayer 4x4', label: 'Bayer 4x4' },
      { value: 'Bayer 8x8', label: 'Bayer 8x8' },
      { value: 'Bayer 16x16', label: 'Bayer 16x16' },
      { value: 'Blue Noise', label: 'Blue Noise' },
      { value: 'Threshold', label: 'Threshold' },
    ],
  },
  pixelSize: {
    type: 'number',
    label: 'Size',
    defaultValue: 2,
    control: 'slider',
    min: 1,
    max: 8,
    step: 1,
  },
  levels: {
    type: 'number',
    label: 'Levels',
    defaultValue: 3,
    control: 'slider',
    min: 2,
    max: 8,
    step: 1,
  },
  brightness: {
    type: 'number',
    label: 'Brightness',
    defaultValue: 100,
    control: 'slider',
    min: 0,
    max: 200,
    step: 1,
    unit: '%',
  },
  contrast: {
    type: 'number',
    label: 'Contrast',
    defaultValue: 1,
    control: 'slider',
    min: 0.5,
    max: 2,
    step: 0.02,
  },
  mono: {
    type: 'boolean',
    label: 'Mono',
    defaultValue: false,
  },
  monoColor: {
    type: 'color',
    label: 'Mono color',
    defaultValue: { r: 1, g: 1, b: 1, a: 1 },
  },
})