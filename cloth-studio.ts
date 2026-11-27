// Animated, pointer-interactive Figma shader effect.
import { defineProperties } from "figma:shaders"

export default function Effect() {}

export function setup(device, frame) {
  const s = frame.state
  const shared = `
diagnostic(off,derivative_uniformity);

struct Particle {
  pos: vec4f,
  prev: vec4f,
};

fn finite3(v: vec3f) -> bool {
  return all(v == v) && all(abs(v) < vec3f(1000.0));
}

fn normalizedOr(v: vec3f, fallback: vec3f) -> vec3f {
  let magnitude = length(v);
  return select(fallback, v / max(magnitude, 0.000001),
    finite3(v) && magnitude > 0.000001);
}

struct Grip {
  hit: vec4f,
  point: vec4f,
};

struct Patch {
  pos: vec3f,
  tangentX: vec3f,
  tangentY: vec3f,
};

struct CurveWeights {
  value: vec4f,
  slope: vec4f,
};

fn basis(t: f32, cell: u32, last: u32) -> CurveWeights {
  let q = 1.0 - t;
  var w = vec4f(q*q*q, 4.0 - 6.0*t*t + 3.0*t*t*t,
    1.0 + 3.0*t + 3.0*t*t - 3.0*t*t*t, t*t*t) / 6.0;
  var d = vec4f(-q*q, -4.0*t + 3.0*t*t, 1.0 + 2.0*t - 3.0*t*t, t*t) * 0.5;
  // Linear extension at the boundary reproduces a flat sheet edge to edge.
  if (cell == 0u) {
    w.y += 2.0*w.x; w.z -= w.x; w.x = 0.0;
    d.y += 2.0*d.x; d.z -= d.x; d.x = 0.0;
  }
  if (cell + 1u == last) {
    w.z += 2.0*w.w; w.y -= w.w; w.w = 0.0;
    d.z += 2.0*d.w; d.y -= d.w; d.w = 0.0;
  }
  return CurveWeights(w, d);
}

fn smoothPatch(uv: vec2f) -> Patch {
  let cells = vec2u(u.grid.xy) - vec2u(1u);
  let g = clamp(uv, vec2f(0.0), vec2f(1.0)) * vec2f(cells);
  let cell = min(vec2u(g), cells - vec2u(1u));
  let t = g - vec2f(cell);
  let wx = basis(t.x, cell.x, cells.x);
  let wy = basis(t.y, cell.y, cells.y);
  var p: Patch;
  for (var y = 0u; y < 4u; y++) {
    let row = u32(clamp(i32(cell.y + y) - 1, 0, i32(cells.y)));
    var rowPosition = vec3f(0.0);
    var rowSlope = vec3f(0.0);
    for (var x = 0u; x < 4u; x++) {
      let col = u32(clamp(i32(cell.x + x) - 1, 0, i32(cells.x)));
      let v = positionAt(row * (cells.x + 1u) + col);
      rowPosition += v * wx.value[x];
      rowSlope += v * wx.slope[x];
    }
    p.pos += rowPosition * wy.value[y];
    p.tangentX += rowSlope * wy.value[y];
    p.tangentY += rowPosition * wy.slope[y];
  }
  return p;
}

`

  s.computeModule = device.createShaderModule({
    code: shared + `
struct SimUniforms {
  grid: vec4f,
  forces: vec4f,
  pointer: vec4f,
  controls: vec4f,
  solver: vec4f,
  state: vec4f,
  limits: vec4f,
  fabric: vec4f, // bend response, lift fraction, wave speed, surface mode
};

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read> src: array<Particle>;
@group(0) @binding(2) var<storage, read_write> dst: array<Particle>;
@group(0) @binding(3) var<storage, read> restPos: array<vec4f>;
@group(0) @binding(4) var picked: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> grip: Grip;

struct ContactNode {
  start: vec3f,
  next: u32,
  cell: vec3i,
};
@group(0) @binding(6) var<storage,read_write> buckets: array<atomic<u32>>;
@group(0) @binding(7) var<storage,read_write> contacts: array<ContactNode>;

fn safePosition(index: u32, v: vec3f) -> vec3f {
  return select(restPos[index].xyz, v, finite3(v));
}
fn positionAt(index: u32) -> vec3f {
  return safePosition(index, src[index].pos.xyz);
}

fn pinnedForMode(col: u32, row: u32, mode: i32) -> bool {
  let lastCol = u32(u.grid.x) - 1u;
  let lastRow = u32(u.grid.y) - 1u;
  if (mode == 0) { return row == 0u; }
  if (mode != 1 && mode != 2) { return false; }
  let dx = f32(min(col, lastCol - col));
  let dy = f32(select(row, min(row, lastRow - row), mode == 2));
  let radius = max(2.0, 0.022 * f32(min(lastCol, lastRow)));
  return dx * dx + dy * dy <= radius * radius;
}
fn pinned(index: u32) -> bool {
  let columns = u32(u.grid.x);
  return pinnedForMode(index % columns, index / columns, i32(u.controls.w + 0.5));
}
fn fixParticle(index: u32) {
  let fixed = vec4f(restPos[index].xyz, 0.0);
  dst[index] = Particle(fixed, fixed);
}
fn limitVector(v: vec3f, limit: f32) -> vec3f {
  return v * min(1.0, limit / max(length(v), 0.000001));
}
fn materialPosition(uv: vec2f) -> vec2f {
  let aspect = (u.grid.x - 1.0) / (u.grid.y - 1.0);
  return uv * vec2f(aspect, 1.0);
}
// prev.w records the interval represented by pos - prev, including impulses.
fn carried(index: u32) -> vec3f {
  let oldDt = src[index].prev.w;
  let ratio = select(1.0, u.grid.z / max(oldDt, 0.00001), oldDt > 0.0);
  return (positionAt(index) - safePosition(index, src[index].prev.xyz)) * ratio;
}

fn neighbors(index: u32) -> vec4u {
  let cols = u32(u.grid.x);
  let col = index % cols;
  let row = index / cols;
  return vec4u(select(index, index - 1u, col > 0u), select(index, index + 1u, col+1u < cols),
    select(index, index - cols, row > 0u), select(index, index + cols, row+1u < u32(u.grid.y)));
}

@compute @workgroup_size(1)
fn captureHit() {
  grip.hit = textureLoad(picked, vec2i(0), 0);
}

// Evaluate the same refined triangle used by the pick rasterizer once per step.
@compute @workgroup_size(1)
fn trackGrip() {
  if (grip.hit.w < 0.5) { return; }
  let cells = (vec2u(u.grid.xy) - vec2u(1u)) * 2u;
  let g = clamp(grip.hit.xy, vec2f(0.0), vec2f(1.0)) * vec2f(cells);
  let cell = min(vec2u(g), cells - vec2u(1u));
  let t = g - vec2f(cell);
  let a = smoothPatch(vec2f(cell) / vec2f(cells)).pos;
  let b = smoothPatch(vec2f(cell + vec2u(1,0)) / vec2f(cells)).pos;
  let c = smoothPatch(vec2f(cell + vec2u(0,1)) / vec2f(cells)).pos;
  let d = smoothPatch(vec2f(cell + vec2u(1,1)) / vec2f(cells)).pos;
  var p: vec3f;
  if ((cell.x + cell.y) % 2u == 1u) {
    p = a*(1.0-max(t.x,t.y)) + d*min(t.x,t.y) + b*max(t.x-t.y,0.0) + c*max(t.y-t.x,0.0);
  } else if (t.x+t.y <= 1.0) {
    p = a + (b-a)*t.x + (c-a)*t.y;
  } else {
    p = d + (c-d)*(1.0-t.x) + (b-d)*(1.0-t.y);
  }
  grip.point = vec4f(p,1.0);
}

fn aerodynamicNormal(index: u32) -> vec3f {
  let columns = u32(u.grid.x);
  let rows = u32(u.grid.y);
  let col = index % columns;
  let row = index / columns;
  let center = positionAt(index);
  let left = positionAt(select(index, index - 1u, col > 0u));
  let right = positionAt(select(index, index + 1u, col + 1u < columns));
  let top = positionAt(select(index, index - columns, row > 0u));
  let bottom = positionAt(select(index, index + columns, row + 1u < rows));

  let l = left - center;
  let r = right - center;
  let t = top - center;
  let b = bottom - center;
  var sum = cross(r, b) + cross(b, l) + cross(l, t) + cross(t, r);
  if (col > 0u && row > 0u) {
    let p = positionAt(index - columns - 1u);
    sum += cross(l, p - center) + cross(p - center, t);
  }
  if (col + 1u < columns && row > 0u) {
    let p = positionAt(index - columns + 1u);
    sum += cross(t, p - center) + cross(p - center, r);
  }
  if (col > 0u && row + 1u < rows) {
    let p = positionAt(index + columns - 1u);
    sum += cross(b, p - center) + cross(p - center, l);
  }
  if (col + 1u < columns && row + 1u < rows) {
    let p = positionAt(index + columns + 1u);
    sum += cross(r, p - center) + cross(p - center, b);
  }
  let n = normalizedOr(sum, vec3f(0.0, 0.0, 1.0));
  return select(-n, n, n.z >= 0.0);
}

fn gripWeight(distanceValue: f32) -> f32 {
  let core = max(1.42 / (u.grid.y - 1.0), u.controls.y * 0.24);
  return 1.0 - smoothstep(core, max(u.controls.y, core * 1.6), distanceValue);
}

@compute @workgroup_size(64)
fn impulse(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x;
  if (index >= u32(u.grid.x) * u32(u.grid.y)) { return; }
  if (pinned(index)) { fixParticle(index); return; }
  let hit = grip.hit;
  let current = positionAt(index);
  var displacement = carried(index);
  if (hit.w > 0.5 && u.controls.x > 0.0) {
    let origin = materialPosition(hit.xy);
    let reliefThrow = u.fabric.w > 0.5 && u.controls.z > 1.5;
    let centerAtRelease = select(origin, u.pointer.xy, reliefThrow);
    let d = length(restPos[index].xy - centerAtRelease);
    let weight = gripWeight(d);
    let strength = 1.0 - exp(-2.0 * u.controls.x);
    if (u.controls.z < 1.5) {
      let center = 1.0 - smoothstep(0.0, max(u.controls.y, 0.025), d);
      let ripple = center * center * (1.0 - 0.35 * (1.0 - center));
      let pokeSpeed = min(0.95, u.forces.w * 16.0);
      let amplitude = select(1.0, 0.12, u.controls.z < 0.5);
      displacement.z -= amplitude * pokeSpeed * strength * max(ripple, weight * 0.45) * u.grid.z;
    } else if (reliefThrow) {
      displacement.z -= length(u.pointer.zw) * weight * strength * u.grid.z * 0.32;
    } else {
      displacement.x = mix(displacement.x, u.pointer.z * u.grid.z, weight * strength);
      displacement.y = mix(displacement.y, u.pointer.w * u.grid.z, weight * strength);
    }
  }
  dst[index] = Particle(vec4f(current, src[index].pos.w),
    vec4f(current - limitVector(displacement, u.solver.w), u.grid.z));
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x;
  let columns = u32(u.grid.x);
  if (index >= columns * u32(u.grid.y)) { return; }
  contacts[index].start = positionAt(index);
  if (pinned(index)) { fixParticle(index); return; }
  let rest = restPos[index].xyz;
  let current = positionAt(index);
  let dt = u.grid.z;
  let velocity = limitVector(carried(index) * u.forces.z, u.solver.w);
  let n = aerodynamicNormal(index);
  let phase = u.grid.w * 0.72 + rest.x * 3.1 + rest.y * 4.7;
  let variation = 0.74 + sin(phase) * 0.17 + cos(phase * 0.61) * 0.09;
  let wind = vec3f(u.forces.y * 0.1,
    sin(phase * 0.37) * abs(u.forces.y) * 0.018, u.forces.y * variation);
  let pressure = clamp(dot(wind - velocity / max(dt, 0.001), n), -2.0, 2.0);
  var acceleration = (
    n * pressure * abs(pressure) * 0.13 +
    vec3f(wind.x * 0.045, u.forces.x + wind.y * 0.045, 0.0)
  ) * u.state.x;

  let freeCloth = u.controls.w > 2.5;
  let drift = current.xy - rest.xy;
  let driftDistance = length(drift);
  let excess = max(driftDistance - select(0.18, 0.16, freeCloth), 0.0);
  let retention = u.state.w;
  acceleration += vec3f(
    -drift / max(driftDistance, 0.0001) * excess * retention,
    -current.z * retention * select(0.018, 0.08, excess > 0.0)
  );
  // Ease into the depth limit instead of letting wind flatten overlapping folds.
  acceleration.z -= sign(current.z) * max(abs(current.z) / u.forces.w - 0.65, 0.0) * 2.4;

  var next = current + limitVector(
    velocity + limitVector(acceleration, 3.5) * dt * dt, u.solver.w);
  var nextPrevious = current;
  if (u.solver.z > 0.5 && u.controls.x > 0.0) {
    let hit = grip.hit;
    if (hit.w > 0.5) {
      let d = length(rest.xy - materialPosition(hit.xy));
      let weight = gripWeight(d);
      if (weight > 0.0) {
        let strength = 1.0 - exp(-2.0 * u.controls.x);
        let gripPosition = vec3f(u.pointer.xy, mix(hit.z, u.forces.w * 0.92, u.fabric.y));
        let error = gripPosition - grip.point.xyz;
        let correction = limitVector(error * (1.0 - exp(-42.0 * strength * dt)),
          4.5 * dt) * weight;
        next += correction;
        nextPrevious += correction;
      }
    }
  }

  if (!finite3(next) || !finite3(nextPrevious)) {
    next = rest;
    nextPrevious = rest;
  }
  dst[index] = Particle(vec4f(next, 0.0), vec4f(nextPrevious, dt));
}

// A single-valued height surface. Its in-plane deformation is bounded separately.
@compute @workgroup_size(64)
fn heightStep(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cols = u32(u.grid.x);
  if (i >= cols * u32(u.grid.y)) { return; }
  if (pinned(i)) { fixParticle(i); return; }
  let rest = restPos[i].xyz;
  let z = positionAt(i).z;
  let j = neighbors(i);
  let lap = positionAt(j.x).z + positionAt(j.y).z + positionAt(j.z).z + positionAt(j.w).z - 4.0*z;
  let dt = u.grid.z;
  // Bound wave travel per substep for the explicit 2D stencil.
  let courant = min(0.64, dt * u.fabric.z * (u.grid.y - 1.0));
  let phase = rest.x * 5.0 + rest.y * 4.0 + u.grid.w * 1.6;
  let wind = u.forces.y * (sin(phase) + 0.38 * sin(2.0*phase - rest.y*3.0));
  let velocity = carried(i).z * u.forces.z;
  let load = wind + u.forces.x * (rest.y - 0.5);
  var next = z + velocity + courant*courant*lap + dt*dt*(load*u.state.x - 7.0*z);
  var prev = z;
  if (u.solver.z > 0.5 && u.controls.x > 0.0) {
    let hit = grip.hit;
    if (hit.w > 0.5) {
      let start = materialPosition(hit.xy);
      let center = u.pointer.xy;
      let delta = rest.xy - center;
      let radius = max(u.controls.y, 2.5 / (u.grid.y - 1.0));
      let axis = normalizedOr(vec3f(u.pointer.xy - start, 0.0), vec3f(1.0,0.0,0.0)).xy;
      let along = dot(delta, axis);
      let lateral = delta - axis*along;
      let footprint = exp(-(dot(lateral,lateral) + along*along*0.38) / (radius*radius));
      let goal = mix(hit.z, u.forces.w*0.92, u.fabric.y);
      let correction = (goal - next)*footprint*(1.0-exp(-24.0*u.controls.x*dt));
      next += correction;
      prev += correction;
    }
  }
  next = clamp(next, -u.forces.w, u.forces.w);
  dst[i] = Particle(vec4f(rest.xy, next, 0.0), vec4f(rest.xy, prev, dt));
}

// Hash deformed quads by their 3D centers. Each vertex tests nearby triangles
// from distant parts of the sheet. A dispatch boundary separates insertion and lookup.
fn bucketCell(p: vec3f) -> vec3i {
  return vec3i(floor(p * ((u.grid.y - 1.0) / 2.4)));
}
fn bucketKey(cell: vec3i) -> u32 {
  let k = bitcast<vec3u>(cell);
  return ((k.x*73856093u) ^ (k.y*19349663u) ^ (k.z*83492791u)) % arrayLength(&buckets);
}

@compute @workgroup_size(64)
fn clearBuckets(@builtin(global_invocation_id) gid: vec3u) {
  let n = u32(u.grid.x)*u32(u.grid.y);
  if (gid.x >= n) { return; }
  atomicStore(&buckets[gid.x],0u);
  atomicStore(&buckets[gid.x+n],0u);
}

@compute @workgroup_size(64)
fn indexQuads(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cols = u32(u.grid.x);
  if (i >= cols*(u32(u.grid.y)-1u) || i%cols == cols-1u) { return; }
  let center = (positionAt(i)+positionAt(i+1u)+positionAt(i+cols)+positionAt(i+cols+1u))*0.25;
  let cell = bucketCell(center);
  contacts[i].cell = cell;
  contacts[i].next = atomicExchange(&buckets[bucketKey(cell)],i+1u);
}

// Closest point on a triangle, including its edges and corners.
fn closestWeights(p: vec3f, a: vec3f, b: vec3f, c: vec3f) -> vec3f {
  let ab = b-a;
  let ac = c-a;
  let d1 = dot(ab,p-a); let d2 = dot(ac,p-a);
  if (d1 <= 0.0 && d2 <= 0.0) { return vec3f(1,0,0); }
  let d3 = dot(ab,p-b); let d4 = dot(ac,p-b);
  if (d3 >= 0.0 && d4 <= d3) { return vec3f(0,1,0); }
  let vc = d1*d4 - d3*d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) {
    let v = d1/max(d1-d3,1e-15); return vec3f(1.0-v,v,0.0);
  }
  let d5 = dot(ab,p-c); let d6 = dot(ac,p-c);
  if (d6 >= 0.0 && d5 <= d6) { return vec3f(0,0,1); }
  let vb = d5*d2 - d1*d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) {
    let w = d2/max(d2-d6,1e-15); return vec3f(1.0-w,0.0,w);
  }
  let va = d3*d6 - d5*d4;
  if (va <= 0.0 && d4 >= d3 && d5 >= d6) {
    let w = (d4-d3)/max((d4-d3)+(d5-d6),1e-15); return vec3f(0.0,1.0-w,w);
  }
  let sum = max(va+vb+vc,1e-20);
  return vec3f(va,vb,vc)/sum;
}

fn triangleContact(index: u32, p: vec3f, ids: vec3u, thickness: f32) -> vec3f {
  let a = positionAt(ids.x); let b = positionAt(ids.y); let c = positionAt(ids.z);
  let margin = vec3f(thickness*1.6);
  if (any(p < min(a,min(b,c))-margin) || any(p > max(a,max(b,c))+margin)) {
    return vec3f(0.0);
  }
  let weights = closestWeights(p,a,b,c);
  let delta = p - (a*weights.x + b*weights.y + c*weights.z);
  let dist = length(delta);
  if (dist > thickness*1.6) { return vec3f(0.0); }
  let oldA = contacts[ids.x].start; let oldB = contacts[ids.y].start; let oldC = contacts[ids.z].start;
  let oldDelta = contacts[index].start - (oldA*weights.x + oldB*weights.y + oldC*weights.z);
  let oldNormal = cross(oldB-oldA,oldC-oldA);
  let n = normalizedOr(cross(b-a,c-a),vec3f(0.0));
  let side = select(-1.0,1.0,dot(oldDelta,oldNormal) >= 0.0);
  let normal = n*side;
  // Use the sheet's previous side inside a face. At a free rim separate
  // along the closest-point direction, so the sheet can slide around it.
  let inside = all(weights > vec3f(0.0001));
  if (inside && dot(n,n) > 0.5) {
    return normal * max(0.0, thickness-dot(delta,normal));
  }
  return normalizedOr(delta,normal)*max(0.0,thickness-dist);
}

@compute @workgroup_size(64)
fn separateCloth(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cols = u32(u.grid.x);
  if (i >= cols*u32(u.grid.y)) { return; }
  if (pinned(i)) { fixParticle(i); return; }
  let p = positionAt(i);
  let coord = vec2i(i32(i%cols),i32(i/cols));
  let h = 1.0/(u.grid.y-1.0);
  let thickness = min(1.08*h, u.forces.w*0.46);
  let radius = vec3f(1.2*h+thickness*1.6);
  let low = bucketCell(p-radius);
  let high = bucketCell(p+radius);
  var push = vec3f(0.0);
  var weightSum = 0.0;
  for (var z=low.z; z<=high.z; z++) {
    for (var y=low.y; y<=high.y; y++) {
      for (var x=low.x; x<=high.x; x++) {
        let cell = vec3i(x,y,z);
        var link = atomicLoad(&buckets[bucketKey(cell)]);
        while (link != 0u) {
          let j = link-1u;
          link = contacts[j].next;
          if (any(contacts[j].cell != cell)) { continue; }
          let base = vec2i(i32(j%cols),i32(j/cols));
          let gap = max(base-coord,coord-(base+vec2i(1)));
          if (max(gap.x,gap.y) < 3) { continue; }
          let b = j+1u; let c = j+cols; let d = c+1u;
          var first = vec3u(j,c,b); var second = vec3u(b,c,d);
          if ((base.x+base.y)%2 == 1) { first=vec3u(j,c,d); second=vec3u(j,d,b); }
          let hitA = triangleContact(i,p,first,thickness);
          let hitB = triangleContact(i,p,second,thickness);
          let hit = select(hitA,hitB,dot(hitB,hitB)>dot(hitA,hitA));
          let w = length(hit);
          push += hit*w;
          weightSum += w;
        }
      }
    }
  }
  let correction = limitVector(push/max(weightSum,0.000001),0.85*h);
  var velocity = p - src[i].prev.xyz;
  if (weightSum > 0.0) {
    let normal = normalizedOr(correction,vec3f(0.0));
    velocity -= normal*min(dot(velocity,normal),0.0);
  }
  let next = p + correction;
  dst[i] = Particle(vec4f(next,0.0),vec4f(next-velocity,u.grid.z));
}

fn solveVertex(index: u32, phase: i32) {
  let columns = u32(u.grid.x);
  let rows = u32(u.grid.y);
  if (index >= columns * rows) { return; }
  if (pinned(index)) { fixParticle(index); return; }
  let position = positionAt(index);
  let previous = safePosition(index, src[index].prev.xyz);
  let cellSize = 1.0 / f32(rows - 1u);
  let strain = phase >= 3;
  var offsets = array(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));
  var restLength = cellSize;
  var complianceMultiplier = 1.0;
  if (phase == 1) {
    offsets = array(vec2i(-1, -1), vec2i(1, -1), vec2i(-1, 1), vec2i(1, 1));
    restLength *= 1.41421356;
    complianceMultiplier = 3.5;
  } else if (phase == 2) {
    offsets = array(vec2i(-2, 0), vec2i(2, 0), vec2i(0, -2), vec2i(0, 2));
    restLength *= 2.0;
    complianceMultiplier = 18.0;
  }

  let coord = vec2i(i32(index % columns), i32(index / columns));
  var correction = vec3f(0.0);
  var neighborCount = 0.0;
  for (var k = 0u; k < 4u; k++) {
    let neighbor = coord + offsets[k];
    if (any(neighbor < vec2i(0)) || any(neighbor >= vec2i(i32(columns), i32(rows)))) {
      continue;
    }
    neighborCount += 1.0;
    let j = u32(neighbor.y) * columns + u32(neighbor.x);
    let p = src[j].pos.xyz;
    if (!finite3(p)) { continue; }
    let delta = p - position;
    let measured = length(delta);
    if (measured < 0.00001) { continue; }
    let alpha = select(u.solver.x * complianceMultiplier / max(u.grid.z * u.grid.z, 0.000001),
      0.0, strain);
    let mass = 1.0 + select(1.0, 0.0, pinned(j));
    let desiredLength = select(restLength,
      clamp(measured, restLength * u.limits.y, restLength * u.limits.x), strain);
    let step = delta * ((measured - desiredLength) / measured) / (mass + alpha);
    correction += limitVector(step, u.solver.y * select(1.0, 1.5, strain));
  }
  correction /= max(neighborCount, 1.0);
  if (phase == 2) { correction *= u.fabric.x; }
  let next = position + correction;
  // Transmit part of the constraint impulse to velocity. Sustained loads
  // otherwise keep driving already-supported particles through a fold.
  var nextPrevious = previous + correction*0.45;
  if (strain && length(correction) > cellSize * 0.008) {
    nextPrevious = next - (next - nextPrevious) * 0.82;
  }
  if (!finite3(next) || !finite3(nextPrevious)) { fixParticle(index); return; }
  if (phase == 4) {
    finishParticle(index, next, next - nextPrevious);
  } else {
    dst[index] = Particle(vec4f(next, 0.0), vec4f(nextPrevious, src[index].prev.w));
  }
}

@compute @workgroup_size(64)
fn structural(@builtin(global_invocation_id) gid: vec3u) { solveVertex(gid.x, 0); }
@compute @workgroup_size(64)
fn shear(@builtin(global_invocation_id) gid: vec3u) { solveVertex(gid.x, 1); }
@compute @workgroup_size(64)
fn bend(@builtin(global_invocation_id) gid: vec3u) { solveVertex(gid.x, 2); }
@compute @workgroup_size(64)
fn strainLimit(@builtin(global_invocation_id) gid: vec3u) { solveVertex(gid.x, 3); }

// A pin can shorten its distance to the cloth as it folds, but the
// material between the pin and a vertex cannot stretch indefinitely.
fn tether(p: vec3f, rest: vec3f, anchor: vec3f) -> vec3f {
  let reach = length(rest - anchor) * 1.06 + 0.5 / (u.grid.y - 1.0);
  return anchor + limitVector(p - anchor, reach);
}

@compute @workgroup_size(64)
fn finishStrain(@builtin(global_invocation_id) gid: vec3u) { solveVertex(gid.x, 4); }

fn finishParticle(index: u32, position: vec3f, displacement: vec3f) {
  let aspect = (u.grid.x - 1.0) / (u.grid.y - 1.0);
  let freeCloth = u.controls.w > 2.5;
  let side = select(0.14, min(0.36, aspect * 0.45), freeCloth);
  let top = select(0.12, 0.32, freeCloth);
  let bottom = select(0.26, 0.44, freeCloth);
  let low = vec3f(-side, -top, -u.forces.w);
  let high = vec3f(aspect + side, 1.0 + bottom, u.forces.w);
  var velocity = displacement;
  let outward = ((position <= low) & (velocity < vec3f(0.0))) |
    ((position >= high) & (velocity > vec3f(0.0)));
  velocity = limitVector(select(velocity, vec3f(0.0), outward), u.solver.w);
  let bounded = clamp(position, low, high);
  // Leave a compliant depth envelope so stacked layers retain distinct heights.
  var next = mix(position, bounded, vec3f(u.limits.z, u.limits.z, 0.32));
  if (u.controls.w == 1.0 || u.controls.w == 2.0) {
    let rest = restPos[index].xyz;
    let before = next;
    next = tether(next, rest, vec3f(0.0));
    next = tether(next, rest, vec3f(aspect, 0.0, 0.0));
    if (u.controls.w == 2.0) {
      next = tether(next, rest, vec3f(0.0, 1.0, 0.0));
      next = tether(next, rest, vec3f(aspect, 1.0, 0.0));
    }
    let inward = normalizedOr(next - before, vec3f(0.0));
    velocity -= inward * min(dot(velocity, inward), 0.0);
  }
  dst[index] = Particle(vec4f(next, src[index].pos.w), vec4f(next - velocity, u.grid.z));
}
`,
  })

  s.renderModule = device.createShaderModule({
    code: shared + `
struct RenderUniforms {
  grid: vec4f,
  appearance: vec4f,
  pickPoint: vec4f, // pixel XY, sheen, highlight exponent
  warp: vec4f, // bounded material-space offset in XY
  surface: vec4f, // height-field flag, warp radius, display scale
};
@group(0) @binding(0) var<uniform> u: RenderUniforms;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> particles: array<Particle>;
@group(0) @binding(4) var<storage, read> grip: Grip;
override pickMode: bool = false;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) normal: vec3f,
  @location(2) height: f32,
};
fn positionAt(index: u32) -> vec3f {
  return particles[index].pos.xyz;
}

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> VsOut {
  let refined = (vec2u(u.grid.xy)-vec2u(1u))*2u;
  let uv = vec2f(f32(index % (refined.x+1u)), f32(index / (refined.x+1u))) / vec2f(refined);
  let surfaceSample = smoothPatch(uv);
  var center = surfaceSample.pos;
  var tx = surfaceSample.tangentX;
  var ty = surfaceSample.tangentY;
  if (u.surface.x > 0.5) {
    // The pull vanishes at the boundary. Its bounded spatial slope keeps the
    // screen-space sheet one-to-one, even during a fast diagonal drag.
    let rest = uv * vec2f(u.grid.z, 1.0);
    let radius = u.surface.y;
    let grabbed = grip.hit.xy * vec2f(u.grid.z, 1.0);
    let pull = u.warp.xy * grip.hit.w;
    let delta = (rest-grabbed)/radius;
    let g = exp(-dot(delta,delta));
    let edge = min(min(rest.x, u.grid.z-rest.x), min(rest.y, 1.0-rest.y));
    let t = clamp(edge/radius,0.0,1.0);
    let fade = t*t*(3.0-2.0*t);
    var edgeAxis = vec2f(0.0, -1.0);
    if (edge == rest.x) { edgeAxis = vec2f(1.0,0.0); }
    else if (edge == u.grid.z-rest.x) { edgeAxis = vec2f(-1.0,0.0); }
    else if (edge == rest.y) { edgeAxis = vec2f(0.0,1.0); }
    let gradient = g/radius * (6.0*t*(1.0-t)*edgeAxis - 2.0*fade*delta);
    let h = 1.0/(u.grid.y-1.0);
    center = vec3f(rest + pull*g*fade, center.z);
    tx = vec3f((vec2f(1.0,0.0) + pull*gradient.x)*h, tx.z);
    ty = vec3f((vec2f(0.0,1.0) + pull*gradient.y)*h, ty.z);
  }
  var out: VsOut;
  let screen = vec2f(center.x/u.grid.z, center.y) * u.surface.z + vec2f(0.5 * (1.0 - u.surface.z));
  var clip = screen*vec2f(2.0,-2.0) + vec2f(-1.0,1.0);
  if (pickMode) { clip = (screen*u.appearance.yz-u.pickPoint.xy)*vec2f(2.0,-2.0); }
  // A soft depth bound can leave a fold slightly above the nominal envelope.
  // A monotonic depth mapping preserves its ordering in both draw and pick passes.
  let depthValue = center.z / (u.grid.w + abs(center.z));
  out.position = vec4f(clip, 0.5 - 0.49*depthValue, 1.0);
  out.normal = normalizedOr(cross(tx,ty), vec3f(0.0,0.0,1.0));
  out.uv = uv;
  out.height = center.z;
  return out;
}

fn shade(in: VsOut) -> vec4f {
  let color = textureSample(inputTex, imageSampler, in.uv);
  if (color.a <= 0.0) { discard; }
  if (pickMode) {
    if (color.a < 0.002) { discard; }
    return vec4f(in.uv, in.height, 1.0);
  }
  let n = normalizedOr(in.normal, vec3f(0.0,0.0,1.0));
  let facing = select(-n, n, n.z >= 0.0);
  let light = normalize(vec3f(-0.38,-0.48,1.0));
  let halfVector = normalize(light+vec3f(0.0,0.0,1.0));
  let diffuse = dot(facing,light) - light.z;
  let gloss = pow(max(dot(facing,halfVector),0.0), u.pickPoint.w) -
    pow(halfVector.z, u.pickPoint.w);
  let gain = clamp(1.0+u.appearance.x*(0.50*diffuse + u.pickPoint.z*gloss),0.55,1.24);
  return vec4f(min(color.rgb*gain,vec3f(color.a)),color.a);
}

@fragment fn fs_main(in: VsOut) -> @location(0) vec4f { return shade(in); }

@group(1) @binding(0) var nearestDepth: texture_depth_2d;
@fragment fn fs_behind(in: VsOut) -> @location(0) vec4f {
  // Compare depth in the attachment's own precision (depth32float).
  if (in.position.z <= textureLoad(nearestDepth,vec2i(in.position.xy),0)) { discard; }
  return shade(in);
}
`,
  })
  s.compositeModule = device.createShaderModule({ code: `
diagnostic(off,derivative_uniformity);
@group(0) @binding(0) var front: texture_2d<f32>;
@group(0) @binding(1) var behind: texture_2d<f32>;
@vertex fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i<<1u)&2u), f32(i&2u));
  return vec4f(p*2.0-1.0,0.0,1.0);
}
@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
  let f = textureLoad(front,vec2i(p.xy),0);
  return f + (1.0-f.a)*textureLoad(behind,vec2i(p.xy),0);
}
` })

  s.computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  })
  const computePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [s.computeLayout] })
  s.computePipelines = {}
  for (const entryPoint of ["captureHit", "trackGrip", "impulse", "integrate", "structural", "shear", "bend", "strainLimit", "finishStrain", "heightStep", "clearBuckets", "indexQuads", "separateCloth"]) {
    s.computePipelines[entryPoint] = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: s.computeModule, entryPoint },
    })
  }
  s.drawLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ],
  })
  s.drawPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [s.drawLayout] })
  s.peelLayout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
  ] })
  s.peelPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [s.drawLayout,s.peelLayout] })
  s.gripBuffer = device.createBuffer({size: 32, usage: GPUBufferUsage.STORAGE})
  s.simUniform = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  s.drawUniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  s.simData = new Float32Array(32)
  s.drawData = new Float32Array(20)
  s.sampler = device.createSampler({
    magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
    addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge",
  })
  s.pickTexture = device.createTexture({
    size: [1, 1, 1], format: "rgba32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  })
  s.pickView = s.pickTexture.createView()
  s.pickDepthTexture = device.createTexture({
    size: [1, 1, 1], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })
  s.pickDepthView = s.pickDepthTexture.createView()
  s.topologyKey = ""
  s.profiles = [
    { bend: 1, damping: 1, spread: 1, wave: 0.53, sheen: 0.06, gloss: 7 },
    { bend: 0.44, damping: 0.6, spread: 0.72, wave: 0.41, sheen: 0.24, gloss: 21 },
    { bend: 1.42, damping: 2.5, spread: 1.45, wave: 0.69, sheen: 0.027, gloss: 4 },
  ]
  s.simulationTime = 0
  s.wasDown = false
  s.grab = null
}

function makeDrawPipeline(device, s, format: GPUTextureFormat, pick: boolean, peel = false) {
  const constants = { pickMode: pick ? 1 : 0 }
  return device.createRenderPipeline({
    layout: peel ? s.peelPipelineLayout : s.drawPipelineLayout,
    vertex: { module: s.renderModule, entryPoint: "vs_main", constants },
    fragment: { module: s.renderModule, entryPoint: peel ? "fs_behind" : "fs_main", constants, targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less-equal" },
  })
}

export function render(device, frame) {
  const s = frame.state
  const mouse = frame.mousePosition
  const down = mouse.down === true
  const wasDown = s.wasDown
  s.wasDown = down
  if (frame.input == null) {
    s.grab = null
    return
  }

  const width = Math.max(frame.output.width, 1)
  const height = Math.max(frame.output.height, 1)
  const qw = Math.max(8, Math.round(width / 8) * 8)
  const qh = Math.max(8, Math.round(height / 8) * 8)
  const quality = Math.max(0, Math.min(2, Math.round(frame.params.quality ?? 1)))
  const pinning = Math.max(0, Math.min(3, Math.round(frame.params.pinning ?? 1)))
  const grid = Math.max(0, Math.min(3, Math.round(frame.params.grid ?? 0)))
  const relief = (frame.params.surface ?? 0) < 0.5
  const resolutionKey = qw + "x" + qh + ":" + grid + ":" + (grid === 0 ? quality : 0)
  if (s.resolutionKey !== resolutionKey) {
    s.resolutionKey = resolutionKey

    const aspect = qw / qh
    const baseCells = grid === 0 ? [48, 88, 132][quality] : [0, 64, 88, 112][grid]
    const maximumVertices = grid === 0 ? [14000, 26000, 36000][quality] : 36000
    let columns = Math.min(256, Math.round(baseCells * Math.max(aspect, 1)) + 1)
    let rows = Math.min(256, Math.round(baseCells * Math.max(1 / aspect, 1)) + 1)
    while (columns * rows > maximumVertices && columns > 4 && rows > 4) {
      if (columns >= rows) columns--
      else rows--
    }

    s.targetColumns = columns
    s.targetRows = rows
  }
  const columns = s.targetColumns
  const rows = s.targetRows
  const topologyKey = columns + "x" + rows
  if (s.topologyKey !== topologyKey) {
    const count = columns * rows
    const simAspect = (columns - 1) / (rows - 1)
    const particles = new Float32Array(count * 8)
    const restData = new Float32Array(count * 4)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const i = row * columns + col
        const x = col / (rows - 1)
        const y = row / (rows - 1)
        particles.set([x, y, 0, 0, x, y, 0, 0], i * 8)
        restData.set([x, y, 0, 1], i * 4)
      }
    }
    const renderColumns = (columns - 1) * 2 + 1
    const renderRows = (rows - 1) * 2 + 1
    const indices = new Uint32Array((renderColumns - 1) * (renderRows - 1) * 6)
    let cursor = 0
    for (let row = 0; row < renderRows - 1; row++) {
      for (let col = 0; col < renderColumns - 1; col++) {
        const i = row * renderColumns + col
        const bottom = i + renderColumns
        const diagonal = (row + col) % 2 === 1
        indices.set(diagonal ? [i, bottom, bottom+1, i, bottom+1, i+1] :
          [i, bottom, i+1, i+1, bottom, bottom+1], cursor)
        cursor += 6
      }
    }
    const buffers = [0, 1].map(() => {
      const buffer = device.createBuffer({
        size: particles.byteLength, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true,
      })
      new Float32Array(buffer.getMappedRange()).set(particles)
      buffer.unmap()
      return buffer
    })
    const restBuffer = device.createBuffer({
      size: restData.byteLength, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true,
    })
    new Float32Array(restBuffer.getMappedRange()).set(restData)
    restBuffer.unmap()
    const indexBuffer = device.createBuffer({
      size: indices.byteLength, usage: GPUBufferUsage.INDEX, mappedAtCreation: true,
    })
    new Uint32Array(indexBuffer.getMappedRange()).set(indices)
    indexBuffer.unmap()
    if (s.positionBuffers) {
      s.positionBuffers[0].destroy()
      s.positionBuffers[1].destroy()
      s.restBuffer.destroy()
      s.indexBuffer.destroy()
      s.contactBuckets.destroy()
      s.contactNodes.destroy()
    }
    s.positionBuffers = buffers
    s.restBuffer = restBuffer
    s.indexBuffer = indexBuffer
    s.contactBuckets = device.createBuffer({size: count*8, usage: GPUBufferUsage.STORAGE})
    s.contactNodes = device.createBuffer({size: count*32, usage: GPUBufferUsage.STORAGE})
    s.computeGroups = buffers.map((buffer, i) => device.createBindGroup({
      layout: s.computeLayout,
      entries: [
        { binding: 0, resource: { buffer: s.simUniform } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: { buffer: buffers[1 - i] } },
        { binding: 3, resource: { buffer: restBuffer } },
        { binding: 4, resource: s.pickView },
        { binding: 5, resource: {buffer: s.gripBuffer} },
        { binding: 6, resource: {buffer: s.contactBuckets} },
        { binding: 7, resource: {buffer: s.contactNodes} },
      ],
    }))
    s.columns = columns
    s.rows = rows
    s.indexCount = indices.length
    s.workgroups = Math.ceil(count / 64)
    s.simAspect = simAspect
    s.current = 0
    s.topologyKey = topologyKey
    s.warpX = 0
    s.warpY = 0
    s.previousPinning = pinning
    s.warmAge = 0
    s.warmFrames = 0
    s.grab = null
  }

  if (s.pipelineFormat !== frame.output.format) {
    s.drawPipeline = makeDrawPipeline(device, s, frame.output.format, false)
    s.pipelineFormat = frame.output.format
  }
  if (s.depthWidth !== width || s.depthHeight !== height) {
    if (s.depthTexture) s.depthTexture.destroy()
    s.depthTexture = device.createTexture({
      size: [width, height, 1], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    s.depthView = s.depthTexture.createView()
    s.depthWidth = width
    s.depthHeight = height
    s.grab = null
  }

  if (s.relief !== relief) {
    s.grab = null
    s.relief = relief
    s.warpX = 0
    s.warpY = 0
  }
  if (!relief && !s.rearPipeline) {
    s.frontPipeline = makeDrawPipeline(device, s, "rgba16float", false)
    s.rearPipeline = makeDrawPipeline(device, s, "rgba16float", false, true)
  }
  if (!relief && s.compositeFormat !== frame.output.format) {
    s.compositePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: s.compositeModule, entryPoint: "vs_main" },
      fragment: { module: s.compositeModule, entryPoint: "fs_main", targets: [{ format: frame.output.format }] },
      primitive: { topology: "triangle-list" },
    })
    s.compositeFormat = frame.output.format
    s.compositeGroup = null
  }
  if (s.frontTexture && (relief || s.frontTexture.width !== width || s.frontTexture.height !== height)) {
    s.frontTexture.destroy()
    s.rearTexture.destroy()
    s.rearDepth.destroy()
    s.frontTexture = null
    s.compositeGroup = null
  }
  if (!relief && !s.frontTexture) {
    const color: GPUTextureDescriptor = { size: [width, height, 1], format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }
    s.frontTexture = device.createTexture(color)
    s.rearTexture = device.createTexture(color)
    s.frontView = s.frontTexture.createView()
    s.rearView = s.rearTexture.createView()
    s.rearDepth = device.createTexture({ size: [width,height,1], format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT })
    s.rearDepthView = s.rearDepth.createView()
    s.peelGroup = device.createBindGroup({ layout: s.peelLayout,
      entries: [{ binding: 0, resource: s.depthView }] })
  }
  if (!relief && !s.compositeGroup) {
    s.compositeGroup = device.createBindGroup({ layout: s.compositePipeline.getBindGroupLayout(0),
      entries: [{binding: 0, resource: s.frontView}, {binding: 1, resource: s.rearView}] })
  }

  const elapsed = frame.deltaTime * 0.001
  const intervalValid = elapsed > 0 && elapsed <= 0.085
  const realDelta = Math.max(0.001, Math.min(elapsed > 0 ? elapsed : 1 / 60, 1 / 30))
  const speed = Math.max(0.1, Math.min(3, frame.params.speed ?? 1))
  const depth = Math.max(0.01, Math.min(0.35, frame.params.depth ?? 0.14))
  const cellSize = 1 / (s.rows - 1)
  const simDelta = realDelta * speed
  const shallowFold = depth < 4 * cellSize
  const meshStep = shallowFold ? 1/180 : 1/120
  const stepLimit = relief ? [0.025, 1/90, 1/120][quality] : meshStep
  const substeps = Math.max(1, Math.ceil(simDelta / stepLimit))
  const dt = simDelta / substeps
  s.simulationTime += simDelta
  if (pinning !== s.previousPinning) {
    s.warmAge = 0
    s.warmFrames = 0
    s.grab = null
  } else {
    s.warmAge += realDelta
    s.warmFrames++
  }
  const warm = Math.min(1, s.warmAge / 0.32)
  const forceRamp = warm * warm * (3 - 2 * warm)
  const inside = mouse.x >= 0 && mouse.x < width && mouse.y >= 0 && mouse.y < height
  const displayScale = Math.max(10, Math.min(100, frame.params.scale ?? 100)) / 100
  const inset = (1 - displayScale) / 2
  const pointerX = inside ? (mouse.x / width - inset) / displayScale * s.simAspect : 0
  const pointerY = inside ? (mouse.y / height - inset) / displayScale : 0
  if (s.grab && s.grab.scale !== displayScale) s.grab = null
  const press = down && !wasDown && inside
  let dragging = false
  let event = 0
  let lift = 0
  let throwX = 0
  let throwY = 0
  if (press) {
    s.grab = {
      startX: mouse.x, startY: mouse.y, originX: pointerX, originY: pointerY,
      lastX: pointerX, lastY: pointerY, scale: displayScale,
      vx: 0, vy: 0, hasVelocity: false, dragging: false,
    }
    event = 0.25
  } else if (s.grab && down) {
    const grab = s.grab
    if (!inside || !intervalValid) {
      s.grab = null
    } else {
      const dx = pointerX - grab.lastX
      const dy = pointerY - grab.lastY
      const jumpX = dx / s.simAspect
      if (Math.hypot(jumpX, dy) * displayScale > 0.32) {
        s.grab = null
      } else {
        const fromPressX = mouse.x - grab.startX
        const fromPressY = mouse.y - grab.startY
        const threshold = 3 * Math.max(frame.renderScale, 0.001)
        grab.dragging = grab.dragging ||
          fromPressX * fromPressX + fromPressY * fromPressY >= threshold * threshold
        const sampleDt = Math.max(elapsed, 0.004)
        const vx = dx / sampleDt
        const vy = dy / sampleDt
        const sampleSpeed = Math.sqrt(vx * vx + vy * vy)
        const cap = Math.min(1, 4 / Math.max(sampleSpeed, 0.0001))
        const blend = grab.hasVelocity ? 1 - Math.exp(-elapsed / 0.021) : 1
        grab.vx += (vx * cap - grab.vx) * blend
        grab.vy += (vy * cap - grab.vy) * blend
        grab.hasVelocity = true
        grab.lastX = pointerX
        grab.lastY = pointerY
        dragging = grab.dragging
        const travel = Math.hypot(pointerX - grab.originX, pointerY - grab.originY)
        lift = 1 - Math.exp(-travel / (0.17 * Math.min(s.simAspect, 1)))
      }
    }
  } else if (s.grab && !down) {
    const grab = s.grab
    if (wasDown && inside && intervalValid && grab.dragging && grab.hasVelocity) {
      const decay = Math.exp(-Math.max(0, elapsed - 1 / 60) / 0.025)
      const vx = grab.vx * decay / speed
      const vy = grab.vy * decay / speed
      const magnitude = Math.sqrt(vx * vx + vy * vy)
      const cap = Math.min(1, 1.9 / Math.max(magnitude, 0.0001))
      throwX = vx * cap
      throwY = vy * cap
      event = 2
    }
    if (wasDown && inside && intervalValid && !grab.dragging) event = 1
    s.grab = null
  }

  const gravityInput = Math.max(-1, Math.min(3, frame.params.gravity ?? 0.75))
  const gravity = Math.sign(gravityInput) * Math.pow(Math.abs(gravityInput), 1.3) * 0.16
  const windInput = Math.max(-2, Math.min(2, frame.params.wind ?? 0.3))
  const wind = Math.sign(windInput) * Math.pow(Math.abs(windInput), 1.35) * 0.42
  const dampingInput = Math.max(0.75, Math.min(0.9985, frame.params.damping ?? 0.985))
  const forceInput = Math.max(0, Math.min(4, frame.params.interactionForce ?? 1.2))
  const force = Math.pow(forceInput / 4, 1.45) * 4
  const radius = Math.max(1, Math.min(50, frame.params.interactionRadius ?? 18)) * 0.01
  const stiffness = Math.max(0.05, Math.min(1, frame.params.stiffness ?? 0.78))
  const maxVelocity = Math.max(cellSize * 0.82 * Math.max(1, speed * 0.8), 1.9 * dt)
  const lighting = Math.sqrt(Math.max(0, Math.min(1, frame.params.lighting ?? 0.65)))
  // Ease each material coefficient independently while preserving the current pose.
  const material = Math.max(0, Math.min(2, Math.round(frame.params.material ?? 0)))
  const profile = s.profiles[material]
  if (!s.fabric) s.fabric = { ...profile }
  const materialBlend = 1 - Math.exp(-realDelta * 14)
  for (const key of ["bend", "damping", "spread", "wave", "sheen", "gloss"]) {
    s.fabric[key] += (profile[key] - s.fabric[key]) * materialBlend
  }
  const effectiveRadius = radius * s.fabric.spread
  const warpRadius = Math.min(Math.min(s.simAspect, 1)*0.42, Math.max(effectiveRadius*1.8,cellSize*4))
  if (dragging && relief && force > 0) {
    const dx = pointerX - s.grab.originX
    const dy = pointerY - s.grab.originY
    const scale = Math.min(0.8, 0.25*warpRadius/Math.max(Math.hypot(dx,dy),0.00001))
    const blend = 1 - Math.exp(-simDelta*30*force)
    s.warpX += (dx*scale-s.warpX)*blend
    s.warpY += (dy*scale-s.warpY)*blend
  } else {
    const decay = Math.exp(-simDelta*(6+2*s.fabric.damping))
    s.warpX *= decay
    s.warpY *= decay
  }
  const warpCap = Math.min(1, 0.25*warpRadius/Math.max(Math.hypot(s.warpX,s.warpY),0.00001))
  s.simData.set([
    s.columns, s.rows, dt, s.simulationTime,
    gravity, wind, Math.pow(dampingInput, dt * 60 * s.fabric.damping), depth,
    pointerX, pointerY, throwX, throwY,
    force, effectiveRadius, event, pinning,
    Math.pow(1 - stiffness, 3) * 0.0000008 + 0.000000002, cellSize * 0.48,
    dragging ? 1 : 0, maxVelocity,
    forceRamp, 0, 0, pinning === 3 ? 0.92 : 0.42,
    1.065 - stiffness * 0.025, 0.72, pinning === 3 ? 0.28 : 0.34, 0,
    s.fabric.bend, lift, s.fabric.wave * (0.65 + 0.45 * stiffness), relief ? 1 : 0,
  ])
  s.drawData.set([
    s.columns, s.rows, s.simAspect, depth, lighting, width, height, 0,
    press ? mouse.x : 0, press ? mouse.y : 0, s.fabric.sheen, s.fabric.gloss,
    s.warpX*warpCap, s.warpY*warpCap, 0, 0,
    relief ? 1 : 0, warpRadius, displayScale, 0,
  ])
  device.queue.writeBuffer(s.simUniform, 0, s.simData)
  device.queue.writeBuffer(s.drawUniform, 0, s.drawData)

  const inputView = frame.input.createView()
  const encoder = device.createCommandEncoder()
  let current = s.current
  const drawMesh = (
    pipeline: GPURenderPipeline, colorView: GPUTextureView,
    depthView: GPUTextureView, particleBuffer: GPUBuffer, storeDepth = false,
  ) => {
    const group = device.createBindGroup({
      layout: s.drawLayout,
      entries: [
        { binding: 0, resource: { buffer: s.drawUniform } },
        { binding: 1, resource: s.sampler },
        { binding: 2, resource: inputView },
        { binding: 3, resource: { buffer: particleBuffer } },
        { binding: 4, resource: { buffer: s.gripBuffer } },
      ],
    })
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: colorView, loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store",
      }],
      depthStencilAttachment: {
        view: depthView, depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: storeDepth ? "store" : "discard",
      },
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, group)
    if (pipeline === s.rearPipeline) pass.setBindGroup(1, s.peelGroup)
    pass.setIndexBuffer(s.indexBuffer, "uint32")
    pass.drawIndexed(s.indexCount)
    pass.end()
  }

  if (press) {
    if (!s.pickPipeline) s.pickPipeline = makeDrawPipeline(device, s, "rgba32float", true)
    drawMesh(s.pickPipeline, s.pickView, s.pickDepthView, s.positionBuffers[current])
  }
  const compute = encoder.beginComputePass()
  const dispatch = (name: string, writesParticles = true) => {
    compute.setPipeline(s.computePipelines[name])
    compute.setBindGroup(0, s.computeGroups[current])
    compute.dispatchWorkgroups(s.workgroups)
    if (writesParticles) current = 1 - current
  }
  const updateGrip = (name: string) => {
    compute.setPipeline(s.computePipelines[name])
    compute.setBindGroup(0, s.computeGroups[current])
    compute.dispatchWorkgroups(1)
  }
  if (press) updateGrip("captureHit")
  if (!relief && s.warmFrames < 3) {
    for (let cycle = 0; cycle < 2; cycle++) {
      dispatch("structural")
      dispatch("shear")
      dispatch("bend")
    }
  }
  if (event !== 0 && force > 0) dispatch("impulse")
  for (let step = 0; step < substeps; step++) {
    if (relief) {
      dispatch("heightStep")
      continue
    }
    if (dragging && force > 0) updateGrip("trackGrip")
    dispatch("integrate")
    for (let cycle = 0; cycle <= quality; cycle++) {
      dispatch("structural")
      dispatch("structural")
      dispatch("shear")
      dispatch("structural")
      dispatch("bend")
      dispatch(cycle === quality ? "finishStrain" : "strainLimit")
    }
    // In shallow space the depth bound leaves little room to separate a stack.
    // Rebuild the index after moving the first layer before resolving the next.
    const contactIterations = shallowFold ? 2 : 1
    for (let contact = 0; contact < contactIterations; contact++) {
      dispatch("clearBuckets", false)
      dispatch("indexQuads", false)
      dispatch("separateCloth")
    }
  }
  compute.end()
  const target = frame.output.createView()
  if (relief) {
    drawMesh(s.drawPipeline, target, s.depthView, s.positionBuffers[current])
  } else {
    drawMesh(s.frontPipeline, s.frontView, s.depthView, s.positionBuffers[current], true)
    drawMesh(s.rearPipeline, s.rearView, s.rearDepthView, s.positionBuffers[current])
    const composite = encoder.beginRenderPass({ colorAttachments: [{
      view: target, loadOp: "clear", clearValue: {r:0,g:0,b:0,a:0}, storeOp: "store",
    }] })
    composite.setPipeline(s.compositePipeline)
    composite.setBindGroup(0, s.compositeGroup)
    composite.draw(3)
    composite.end()
  }
  device.queue.submit([encoder.finish()])
  s.current = current
  s.previousPinning = pinning
}

defineProperties(Effect, {
  material: {
    type: "number", label: "Material", defaultValue: 0, control: "select",

    options: [{value: 0, label: "Cotton"}, {value: 1, label: "Silk"}, {value: 2, label: "Canvas"}],
  },
  scale: {
    type: "number", label: "Scale", defaultValue: 100,
    control: "slider", min: 10, max: 100, step: 1, unit: "%",
  },
  pinning: {
    type: "number", label: "Pin to", defaultValue: 1, control: "select",
    options: [
      { value: 0, label: "Top edge" },
      { value: 1, label: "Top corners" },
      { value: 2, label: "Four corners" },
      { value: 3, label: "None" },
    ],
  },
  surface: {
    type: "number", label: "Surface", defaultValue: 0, control: "select",
    options: [{value: 0, label: "Smooth relief"}, {value: 1, label: "Folding mesh"}],
  },
  grid: {
    type: "number", label: "Grid", defaultValue: 0, control: "select",
    options: [{value: 0, label: "Auto"}, {value: 1, label: "Coarse (64)"},
      {value: 2, label: "Standard (88)"}, {value: 3, label: "Fine (112)"}],
  },
  quality: {
    type: "number", label: "Quality", defaultValue: 1, control: "select",
    options: [
      { value: 0, label: "Performance" },
      { value: 1, label: "High definition" },
      { value: 2, label: "Ultra" },
    ],
  },
  interactionForce: {
    type: "number", label: "Pointer force", defaultValue: 1.2,
    control: "slider", min: 0, max: 4, step: 0.05,
  },
  interactionRadius: {
    type: "number", label: "Pointer size", defaultValue: 18,
    control: "slider", min: 1, max: 50, step: 1, unit: "%",
  },

  gravity: {
    type: "number", label: "Gravity", defaultValue: 0.75,
    control: "slider", min: -1, max: 3, step: 0.05,
  },
  wind: {
    type: "number", label: "Wind", defaultValue: 0,
    control: "slider", min: -2, max: 2, step: 0.05,
  },
  stiffness: {
    type: "number", label: "Stiffness", defaultValue: 0.78,
    control: "slider", min: 0.05, max: 1, step: 0.01,
  },
  damping: {
    type: "number", label: "Damping", defaultValue: 0.985,
    control: "slider", min: 0.75, max: 0.9985, step: 0.0005,
  },
  speed: {
    type: "number", label: "Speed", defaultValue: 1,
    control: "slider", min: 0.1, max: 3, step: 0.05,
  },
  depth: {
    type: "number", label: "Depth", defaultValue: 0.14,
    control: "slider", min: 0.01, max: 0.35, step: 0.005,
  },
  lighting: {
    type: "number", label: "Lighting", defaultValue: 0.65,
    control: "slider", min: 0, max: 1, step: 0.01,
  },

})
