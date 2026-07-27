(function attachSimulatteWebGpuRendererObjectShader(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

    const WEBGPU_OBJECT_SHADER = `
struct ObjectUniforms {
  viewport: vec4f,
  camera: vec4f,
  light: vec4f,
  keyColor: vec4f,
  ambient: vec4f,
};

struct ObjectPart {
  rect: vec4f,
  style: vec4f,
  color: vec4f,
  identity: vec4f,
  material: vec4f,
  motion: vec4f,
  shapeParams: vec4f,
  surface: vec4f,
  accent: vec4f,
  accentMotion: vec4f,
};

@group(0) @binding(0) var<uniform> u: ObjectUniforms;
@group(0) @binding(1) var<storage, read> objectParts: array<ObjectPart>;

struct ObjectVsOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) shape: f32,
  @location(3) @interpolate(flat) opacity: f32,
  @location(4) @interpolate(flat) semantic: f32,
  @location(5) @interpolate(flat) literal: f32,
  @location(6) @interpolate(flat) material: vec4f,
  @location(7) @interpolate(flat) shapeParams: vec4f,
  @location(8) @interpolate(flat) surface: vec4f,
  @location(9) @interpolate(flat) accent: vec4f,
  @location(10) @interpolate(flat) accentMotion: vec4f,
};

@vertex
fn objectVs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> ObjectVsOut {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let row = objectParts[instanceIndex];
  let local = corners[vertexIndex];
  var angle = row.style.x;
  var motionScale = 1.0;
  if (abs(row.identity.x - 21.0) < 0.5 || abs(row.identity.x - 24.0) < 0.5) {
    angle += u.viewport.z * 0.18;
  }
  if (abs(row.identity.x - 22.0) < 0.5 || abs(row.identity.x - 20.0) < 0.5) {
    motionScale += sin(u.viewport.z * 1.8 + row.identity.y * 6.28318) * 0.045;
  }
  let cosine = cos(angle);
  let sine = sin(angle);
  let depth = clamp(row.material.w, 0.02, 0.98);
  let depthScale = 1.0 + (u.camera.w - depth) * u.camera.x;
  let scaled = vec2f(local.x * row.rect.z, -local.y * row.rect.w) * motionScale * depthScale * u.camera.y;
  let rotated = vec2f(
    cosine * scaled.x - sine * scaled.y,
    sine * scaled.x + cosine * scaled.y
  );
  var center = vec2f(row.rect.x * 2.0 - 1.0, 1.0 - row.rect.y * 2.0);
  center *= u.camera.y;
  center.x += (u.camera.w - depth) * u.camera.z;
  let phase = row.motion.z * 6.28318;
  let time = u.viewport.z * row.motion.x;
  let amplitude = row.motion.y;
  if (row.style.w > 0.75 && amplitude > 0.0 && row.motion.x > 0.0) {
    if (row.style.w < 1.5) {
      center += vec2f(sin(time * 1.4 + phase) * amplitude, cos(time * 2.1 + phase) * amplitude * 0.4);
    } else if (row.style.w > 1.5 && row.style.w < 2.5) {
      center += vec2f(sin(time * 0.9 + phase) * amplitude, cos(time * 1.3 + phase) * amplitude * 0.4);
    } else if (row.style.w > 2.5 && row.style.w < 3.5) {
      center += vec2f(sin(time * 1.6 + phase) * amplitude, cos(time * 1.1 + phase) * amplitude * 0.44);
    } else if (row.style.w > 3.5 && row.style.w < 4.5) {
      center.y += sin(time * 1.2 + phase) * amplitude * 0.3;
    } else if (row.style.w > 7.5 && row.style.w < 8.5) {
      center += vec2f(cos(time * 0.42 + phase), sin(time * 0.42 + phase)) * amplitude;
    } else if (row.style.w > 4.5 && row.style.w < 5.5) {
      center.x += (fract(time * 0.35 + row.motion.z) * 2.0 - 1.0) * amplitude;
    } else if (row.style.w > 5.5 && row.style.w < 6.5) {
      center.y += sin(time * 0.72 + phase) * amplitude;
    } else if (row.style.w > 6.5 && row.style.w < 7.5) {
      center += vec2f(sin(time * 0.74 + phase) * amplitude * 0.42, sin(time * 1.05 + phase) * amplitude);
    } else if (row.style.w > 8.5 && row.style.w < 9.5) {
      center += vec2f(sin(time * 1.2 + phase) * amplitude, cos(time * 1.6 + phase) * amplitude * 0.65);
    } else if (row.style.w > 9.5 && row.style.w < 10.5) {
      center += vec2f(cos(time * 0.72 + phase) * amplitude, sin(time * 1.14 + phase) * amplitude * 0.34);
    } else {
      center.y += sin(time * 0.5 + phase) * amplitude * 0.25;
    }
  }
  if (abs(row.identity.x - 16.0) < 0.5) {
    center.x += sin(time * 0.7 + phase) * 0.012;
  }
  if (abs(row.identity.x - 23.0) < 0.5) {
    center += vec2f(cos(time * 0.38 + phase), sin(time * 0.38 + phase)) * 0.022;
  }
  var out: ObjectVsOut;
  out.position = vec4f(center + rotated, depth, 1.0);
  out.local = local;
  out.color = row.color;
  out.shape = row.style.y;
  out.opacity = row.style.z;
  out.semantic = row.identity.x;
  out.literal = row.identity.w;
  out.material = row.material;
  out.shapeParams = row.shapeParams;
  out.surface = row.surface;
  out.accent = row.accent;
  out.accentMotion = row.accentMotion;
  return out;
}

fn objectEllipse(local: vec2f) -> f32 {
  return 1.0 - smoothstep(0.9, 1.0, length(local));
}

fn objectBox(local: vec2f, radius: f32) -> f32 {
  let q = abs(local) - vec2f(0.92 - radius);
  let distance = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  return 1.0 - smoothstep(-0.03, 0.04, distance);
}

fn objectCapsule(local: vec2f) -> f32 {
  let x = clamp(local.x, -0.68, 0.68);
  return 1.0 - smoothstep(0.25, 0.34, length(local - vec2f(x, 0.0)));
}

fn objectTriangle(local: vec2f) -> f32 {
  let p = vec2f(local.x, local.y + 0.12);
  let width = max(0.0, (p.y + 1.0) * 0.58);
  let inside = min(1.0 - p.y, width - abs(p.x));
  return smoothstep(-0.05, 0.04, inside);
}

fn objectRing(local: vec2f) -> f32 {
  let distance = length(local);
  return 1.0 - smoothstep(0.08, 0.17, abs(distance - 0.7));
}

fn objectStar(local: vec2f) -> f32 {
  let angle = atan2(local.y, local.x);
  let radius = length(local);
  let edge = 0.48 + 0.28 * cos(angle * 5.0);
  return 1.0 - smoothstep(edge - 0.04, edge + 0.05, radius);
}

fn objectSpiral(local: vec2f) -> f32 {
  let radius = length(local);
  let angle = atan2(local.y, local.x);
  let armA = abs(sin(angle * 2.0 - radius * 8.0));
  let armB = abs(sin(angle * 2.0 - radius * 8.0 + 3.14159));
  let arms = 1.0 - smoothstep(0.08, 0.28, min(armA, armB));
  let disk = 1.0 - smoothstep(0.82, 1.0, radius);
  let core = 1.0 - smoothstep(0.05, 0.28, radius);
  return max(core, arms * disk);
}

fn objectWave(local: vec2f) -> f32 {
  let body = objectBox(local, 0.12);
  let bands = 0.72 + 0.28 * sin(local.x * 9.0 + local.y * 5.0 + u.viewport.z * 0.8);
  return body * bands;
}

fn objectSuperellipse(local: vec2f, parameters: vec4f) -> f32 {
  let exponent = mix(2.0, 5.5, clamp(parameters.x, 0.0, 1.0));
  let warped = vec2f(
    local.x + sin(local.y * 3.14159) * parameters.z * 0.16,
    local.y + cos(local.x * 3.14159) * parameters.z * 0.1
  );
  let distance = pow(abs(warped.x), exponent) + pow(abs(warped.y), exponent);
  return 1.0 - smoothstep(0.86, 1.02, distance);
}

fn objectTrapezoid(local: vec2f, parameters: vec4f) -> f32 {
  let taper = mix(0.12, 0.52, clamp(parameters.y, 0.0, 1.0));
  let width = 0.9 - (local.y + 1.0) * 0.5 * taper;
  let edge = min(0.92 - abs(local.y), width - abs(local.x));
  return smoothstep(-0.045, 0.035, edge);
}

fn objectDiamond(local: vec2f, parameters: vec4f) -> f32 {
  let roundness = mix(0.82, 1.08, clamp(parameters.x, 0.0, 1.0));
  let distance = abs(local.x) + abs(local.y) * roundness;
  return 1.0 - smoothstep(0.86, 0.99, distance);
}

fn objectTeardrop(local: vec2f, parameters: vec4f) -> f32 {
  let point = clamp(parameters.y, 0.2, 1.0);
  let shifted = vec2f(local.x * (1.0 + local.y * 0.22), local.y * 0.9 + 0.1);
  let bulb = 1.0 - smoothstep(0.8, 0.96, length(shifted));
  let tipWidth = max(0.0, (1.0 - local.y) * 0.5 * point);
  let tip = smoothstep(-0.04, 0.035, min(0.98 - abs(local.y), tipWidth - abs(local.x)));
  return max(bulb, tip * (1.0 - smoothstep(-0.08, 0.28, local.y)));
}

fn objectLeaf(local: vec2f, parameters: vec4f) -> f32 {
  let axis = abs(local.y);
  let width = pow(max(0.0, 1.0 - axis), mix(0.38, 0.72, parameters.x));
  let asymmetry = sin(local.y * 3.14159) * parameters.z * 0.18;
  let body = smoothstep(-0.045, 0.035, width * 0.82 - abs(local.x + asymmetry));
  let vein = 1.0 - smoothstep(0.02, 0.055, abs(local.x + asymmetry * 0.4));
  return max(body * 0.96, vein * body);
}

fn objectCrescent(local: vec2f, parameters: vec4f) -> f32 {
  let outer = 1.0 - smoothstep(0.86, 0.98, length(local));
  let biteOffset = 0.24 + parameters.y * 0.22;
  let inner = 1.0 - smoothstep(0.58, 0.7, length(local - vec2f(biteOffset, -0.08)));
  return outer * (1.0 - inner);
}

fn objectArch(local: vec2f, parameters: vec4f) -> f32 {
  let stretched = vec2f(local.x, local.y * 0.72 + 0.18);
  let radius = length(stretched);
  let band = 1.0 - smoothstep(0.08, 0.16, abs(radius - mix(0.58, 0.74, parameters.x)));
  let legs = objectBox(vec2f(local.x, local.y - 0.45), 0.14) *
    (1.0 - smoothstep(0.18, 0.58, abs(local.x)));
  return max(band * (1.0 - smoothstep(-0.08, 0.3, local.y)), legs);
}

fn objectHexagon(local: vec2f) -> f32 {
  let point = abs(local);
  let distance = max(point.y * 0.94, point.x * 0.866025 + point.y * 0.5);
  return 1.0 - smoothstep(0.82, 0.94, distance);
}

fn objectShield(local: vec2f, parameters: vec4f) -> f32 {
  let vertical = local.y + 0.05;
  let upperWidth = 0.84 - max(0.0, vertical) * mix(0.38, 0.66, parameters.y);
  let lowerPoint = 0.92 - abs(vertical);
  let edge = min(lowerPoint, upperWidth - abs(local.x));
  return smoothstep(-0.045, 0.035, edge);
}

fn objectGear(local: vec2f, parameters: vec4f) -> f32 {
  let angle = atan2(local.y, local.x);
  let radius = length(local);
  let teeth = 0.72 + 0.12 * cos(angle * mix(8.0, 14.0, parameters.w));
  let outer = 1.0 - smoothstep(teeth - 0.04, teeth + 0.04, radius);
  let hole = 1.0 - smoothstep(0.22, 0.3, radius);
  return outer * (1.0 - hole);
}

fn objectCloud(local: vec2f, parameters: vec4f) -> f32 {
  let a = 1.0 - smoothstep(0.42, 0.5, length(local - vec2f(-0.38, 0.08)));
  let b = 1.0 - smoothstep(0.54, 0.64, length(local - vec2f(0.02, -0.12)));
  let c = 1.0 - smoothstep(0.38, 0.47, length(local - vec2f(0.42, 0.1)));
  let base = objectBox(vec2f(local.x, local.y - 0.22), 0.22 + parameters.x * 0.12);
  return max(max(a, b), max(c, base));
}

fn objectTaperedCapsule(local: vec2f, parameters: vec4f) -> f32 {
  let taper = clamp(parameters.y, 0.05, 0.95);
  let width = mix(0.34, 0.12, (local.x + 1.0) * 0.5 * taper);
  let x = clamp(local.x, -0.72, 0.72);
  return 1.0 - smoothstep(width - 0.05, width + 0.035, length(local - vec2f(x, 0.0)));
}

fn objectBevelBox(local: vec2f, parameters: vec4f) -> f32 {
  let radius = mix(0.04, 0.24, clamp(parameters.x, 0.0, 1.0));
  let boxMask = objectBox(local, radius);
  let cut = max(abs(local.x) + abs(local.y) - mix(1.42, 1.72, parameters.x), 0.0);
  return boxMask * (1.0 - smoothstep(0.01, 0.08, cut));
}

fn objectPartMask(local: vec2f, shape: f32, parameters: vec4f) -> f32 {
  if (shape < 1.5) { return objectEllipse(local); }
  if (shape < 2.5) { return objectBox(local, 0.02); }
  if (shape < 3.5) { return objectBox(local, 0.16); }
  if (shape < 4.5) { return objectCapsule(local); }
  if (shape < 5.5) { return objectTriangle(local); }
  if (shape < 6.5) { return objectRing(local); }
  if (shape < 7.5) { return objectStar(local); }
  if (shape < 8.5) { return objectSpiral(local); }
  if (shape < 9.5) { return objectWave(local); }
  if (shape < 10.5) { return objectSuperellipse(local, parameters); }
  if (shape < 11.5) { return objectTrapezoid(local, parameters); }
  if (shape < 12.5) { return objectDiamond(local, parameters); }
  if (shape < 13.5) { return objectTeardrop(local, parameters); }
  if (shape < 14.5) { return objectLeaf(local, parameters); }
  if (shape < 15.5) { return objectCrescent(local, parameters); }
  if (shape < 16.5) { return objectArch(local, parameters); }
  if (shape < 17.5) { return objectHexagon(local); }
  if (shape < 18.5) { return objectShield(local, parameters); }
  if (shape < 19.5) { return objectGear(local, parameters); }
  if (shape < 20.5) { return objectCloud(local, parameters); }
  if (shape < 21.5) { return objectTaperedCapsule(local, parameters); }
  if (shape < 22.5) { return objectBevelBox(local, parameters); }
  return objectBox(local, 0.12);
}

fn objectCurvedShape(shape: f32) -> bool {
  return shape < 1.5 ||
    (shape > 3.5 && shape < 4.5) ||
    (shape > 5.5 && shape < 10.5) ||
    (shape > 12.5 && shape < 16.5) ||
    (shape > 18.5 && shape < 21.5);
}

fn objectSurfaceNormal(local: vec2f, shape: f32) -> vec3f {
  if (objectCurvedShape(shape)) {
    let radial = clamp(1.0 - dot(local, local), 0.0, 1.0);
    return normalize(vec3f(local.x * 0.52, -local.y * 0.52, 0.58 + sqrt(radial)));
  }
  if ((shape > 2.5 && shape < 3.5) || (shape > 20.5 && shape < 22.5)) {
    let edge = smoothstep(0.68, 0.94, max(abs(local.x), abs(local.y)));
    let bevel = normalize(vec3f(local.x * 0.32, -local.y * 0.32, 1.0));
    return normalize(mix(vec3f(0.0, 0.0, 1.0), bevel, edge));
  }
  return vec3f(0.0, 0.0, 1.0);
}

fn objectSpecularStrength(shape: f32, metallic: f32) -> f32 {
  let curved = select(0.035, 0.09, objectCurvedShape(shape));
  return mix(curved, 0.58, metallic);
}

fn objectSurfacePattern(local: vec2f, surface: vec4f) -> f32 {
  let code = surface.x;
  let scale = max(2.0, surface.y);
  if (code < 0.5) { return 0.5; }
  if (code < 1.5) {
    let fibers = sin((local.x * 1.7 + local.y * 8.0) * scale);
    return 0.5 + fibers * 0.18;
  }
  if (code < 2.5) {
    let grain = sin(local.y * scale * 2.2 + sin(local.x * scale) * 1.8);
    return 0.5 + grain * 0.24;
  }
  if (code < 3.5) {
    let seams = step(0.92, fract((local.x + local.y * 0.24) * scale));
    let brushed = sin(local.y * scale * 5.0) * 0.08;
    return 0.48 + seams * 0.34 + brushed;
  }
  if (code < 4.5) {
    let diagonal = pow(abs(sin((local.x + local.y) * scale * 1.8)), 12.0);
    let highlight = pow(max(0.0, 1.0 - length(local - vec2f(-0.28, -0.34))), 5.0);
    return 0.42 + diagonal * 0.28 + highlight * 0.42;
  }
  if (code < 5.5) {
    let cells = sin(local.x * scale * 1.6) * sin(local.y * scale * 1.4);
    return 0.5 + cells * 0.22;
  }
  if (code < 6.5) {
    let warp = abs(sin(local.x * scale * 2.0));
    let weft = abs(sin(local.y * scale * 2.0));
    return 0.42 + (warp + weft) * 0.16;
  }
  if (code < 7.5) {
    let row = floor((local.y + 1.0) * scale);
    let offset = fract(row * 0.5) * 0.5;
    let joints = step(0.88, fract((local.x + 1.0 + offset) * scale * 0.5));
    let courses = step(0.9, fract((local.y + 1.0) * scale * 0.5));
    return 0.44 + max(joints, courses) * 0.3;
  }
  if (code < 8.5) {
    let ripples = sin(local.y * scale * 2.5 + sin(local.x * scale) * 1.2);
    return 0.5 + ripples * 0.25;
  }
  if (code < 9.5) {
    let stars = pow(max(0.0, sin(local.x * scale * 2.7) * sin(local.y * scale * 3.1)), 10.0);
    return 0.38 + stars * 0.62;
  }
  if (code < 10.5) {
    let grid = max(
      step(0.9, fract((local.x + 1.0) * scale)),
      step(0.9, fract((local.y + 1.0) * scale))
    );
    return 0.44 + grid * 0.36;
  }
  let glaze = sin(local.x * scale * 0.8 + sin(local.y * scale * 0.7));
  let speckle = pow(max(0.0, sin(local.x * scale * 3.7) * sin(local.y * scale * 4.3)), 12.0);
  return 0.5 + glaze * 0.08 + speckle * 0.2;
}

fn objectAccentColor(
  local: vec2f,
  accent: vec4f,
  accentMotion: vec4f,
  baseColor: vec3f
) -> vec3f {
  let code = accent.x;
  let scale = max(2.0, accent.y);
  let phase = accentMotion.x * 6.28318 + u.viewport.z * accent.w;
  if (code < 0.5) {
    let ambient = pow(max(0.0, 1.0 - length(local - vec2f(-0.28, -0.32))), 7.0);
    return u.keyColor.rgb * ambient * 0.28;
  }
  if (code < 1.5) {
    let sheen = pow(max(0.0, sin((local.x - local.y * 0.24) * 2.2 + phase)), 12.0);
    return mix(baseColor, u.keyColor.rgb, 0.55) * sheen;
  }
  if (code < 2.5) {
    let glint = pow(abs(sin((local.x + local.y * 0.35) * scale + phase)), 22.0);
    return vec3f(0.72, 0.9, 1.0) * glint;
  }
  if (code < 3.5) {
    let band = pow(max(0.0, sin((local.x * 0.72 + local.y * 0.28) * scale + phase)), 10.0);
    let spectrum = 0.5 + 0.5 * cos(
      vec3f(0.0, 2.094, 4.188) + (local.x - local.y) * 3.2 + phase
    );
    return spectrum * band;
  }
  let cell = floor((local + vec2f(1.0)) * scale);
  let grid = fract((local + vec2f(1.0)) * scale) - vec2f(0.5);
  let hash = fract(sin(dot(cell, vec2f(12.9898, 78.233)) + phase) * 43758.5453);
  let point = 1.0 - smoothstep(0.035, 0.18, length(grid));
  if (code < 4.5) {
    let star = point * step(0.78, hash);
    let filament = pow(max(0.0, sin((local.x + local.y * 0.62) * scale * 0.7 + phase)), 18.0);
    return vec3f(0.52, 0.7, 1.0) * (star + filament * 0.32);
  }
  if (code < 5.5) {
    let caustic = pow(abs(sin(local.x * scale + sin(local.y * scale + phase) * 1.8)), 13.0);
    return vec3f(0.28, 0.88, 1.0) * caustic;
  }
  if (code < 6.5) {
    let scan = pow(max(0.0, sin(local.y * scale * 2.4 + phase)), 24.0);
    let beacon = point * step(0.88, hash);
    return vec3f(0.18, 1.0, 0.82) * max(scan, beacon);
  }
  if (code < 7.5) {
    let traces = max(
      pow(abs(sin(local.x * scale + phase)), 28.0),
      pow(abs(sin(local.y * scale - phase)), 28.0)
    );
    let node = point * step(0.82, hash);
    return vec3f(0.2, 0.84, 1.0) * max(traces * 0.72, node);
  }
  if (code < 8.5) {
    let ember = point * step(0.76, hash) * clamp(0.8 - local.y * 0.5, 0.0, 1.0);
    return vec3f(1.0, 0.32, 0.04) * ember;
  }
  if (code < 9.5) {
    let crystal = pow(abs(sin((local.x + local.y) * scale + phase)), 19.0) +
      pow(abs(sin((local.x - local.y) * scale - phase)), 19.0);
    return vec3f(0.7, 0.92, 1.0) * min(1.0, crystal);
  }
  if (code < 10.5) {
    let mote = point * step(0.8, hash);
    return vec3f(1.0, 0.78, 0.18) * mote;
  }
  if (code < 11.5) {
    let bands = 0.5 + 0.5 * cos(
      vec3f(0.0, 2.094, 4.188) + local.y * scale + sin(local.x * 3.0) + phase
    );
    return bands * (0.45 + 0.55 * pow(max(0.0, 1.0 - abs(local.x)), 3.0));
  }
  if (code < 12.5) {
    let streak = pow(max(0.0, sin(local.y * scale * 2.0 + local.x * 0.7 + phase)), 20.0);
    return vec3f(0.62, 0.88, 1.0) * streak;
  }
  let glaze = pow(max(0.0, 1.0 - length(local - vec2f(-0.34, -0.42))), 9.0);
  return vec3f(1.0, 0.72, 0.42) * glaze;
}

@fragment
fn objectFs(input: ObjectVsOut) -> @location(0) vec4f {
  let mask = objectPartMask(input.local, input.shape, input.shapeParams);
  if (mask <= 0.01) { discard; }
  let normal = objectSurfaceNormal(input.local, input.shape);
  let lightDirection = normalize(vec3f(-u.light.x, -u.light.y, u.light.z));
  let diffuse = max(dot(normal, lightDirection), 0.0);
  let viewDirection = vec3f(0.0, 0.0, 1.0);
  let halfDirection = normalize(lightDirection + viewDirection);
  let roughness = clamp(input.material.x, 0.04, 1.0);
  let metallic = clamp(input.material.y, 0.0, 1.0);
  let emissive = clamp(input.material.z, 0.0, 1.0);
  let specularPower = mix(64.0, 7.0, roughness);
  let specular = pow(max(dot(normal, halfDirection), 0.0), specularPower) *
    objectSpecularStrength(input.shape, metallic);
  let ambientLight = u.ambient.rgb * u.ambient.w;
  let directLight = u.keyColor.rgb * u.light.w * diffuse;
  let literalGain = mix(0.9, 1.0, clamp(input.literal, 0.0, 1.0));
  var pulse = 1.0;
  if (abs(input.semantic - 20.0) < 0.5 || abs(input.semantic - 22.0) < 0.5) {
    pulse = 0.86 + 0.14 * sin(u.viewport.z * 2.2 + input.semantic);
  }
  let illumination = max(ambientLight + directLight, vec3f(0.28));
  let reflected = input.color.rgb * illumination + u.keyColor.rgb * specular;
  let pattern = objectSurfacePattern(input.local, input.surface);
  let patternStrength = clamp(input.surface.z, 0.0, 0.5);
  let patterned = reflected * mix(1.0 - patternStrength, 1.0 + patternStrength, pattern);
  let edge = smoothstep(0.08, 0.72, mask);
  let edgeShade = mix(0.58, 1.0, edge);
  let rim = (1.0 - edge) * clamp(input.surface.w, 0.0, 0.6);
  let accent = objectAccentColor(
    input.local,
    input.accent,
    input.accentMotion,
    input.color.rgb
  ) *
    clamp(input.accent.z, 0.0, 0.42) *
    (0.42 + edge * 0.58);
  let selected = clamp(input.accentMotion.y, 0.0, 1.0);
  let hovered = clamp(input.accentMotion.z, 0.0, 1.0);
  let active = clamp(input.accentMotion.w, 0.0, 1.0);
  let interactionEdge = (1.0 - edge) * (selected * 0.72 + hovered * 0.38);
  let interactionPulse = active * (0.16 + 0.1 * sin(u.viewport.z * 7.0));
  let interactionColor = mix(
    vec3f(0.38, 0.86, 1.0),
    vec3f(1.0, 0.72, 0.22),
    active
  ) * (interactionEdge + interactionPulse);
  let localOcclusion = mix(0.82, 1.04, clamp(0.55 - input.local.y * 0.35, 0.0, 1.0));
  let color = clamp(
    patterned * literalGain * pulse * edgeShade * localOcclusion +
      input.color.rgb * emissive +
      u.keyColor.rgb * rim +
      accent +
      interactionColor,
    vec3f(0.0),
    vec3f(1.0)
  );
  return vec4f(color, mask * input.opacity * input.color.a);
}
`;

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-object-shader.js', { WEBGPU_OBJECT_SHADER });

})(typeof globalThis !== 'undefined' ? globalThis : window);
