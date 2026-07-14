(function attachSimulatteWebGpuRendererObjectShader(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

fn objectPartMask(local: vec2f, shape: f32) -> f32 {
  if (shape < 1.5) { return objectEllipse(local); }
  if (shape < 2.5) { return objectBox(local, 0.02); }
  if (shape < 3.5) { return objectBox(local, 0.16); }
  if (shape < 4.5) { return objectCapsule(local); }
  if (shape < 5.5) { return objectTriangle(local); }
  if (shape < 6.5) { return objectRing(local); }
  if (shape < 7.5) { return objectStar(local); }
  if (shape < 8.5) { return objectSpiral(local); }
  if (shape < 9.5) { return objectWave(local); }
  return objectBox(local, 0.12);
}

fn objectSurfaceNormal(local: vec2f, shape: f32) -> vec3f {
  if (shape < 1.5 || (shape > 5.5 && shape < 8.5)) {
    let radial = clamp(1.0 - dot(local, local), 0.0, 1.0);
    return normalize(vec3f(local.x * 0.52, -local.y * 0.52, 0.58 + sqrt(radial)));
  }
  if (shape > 3.5 && shape < 4.5) {
    return normalize(vec3f(0.0, -local.y * 0.48, 0.92));
  }
  if (shape > 2.5 && shape < 3.5) {
    let edge = smoothstep(0.68, 0.94, max(abs(local.x), abs(local.y)));
    let bevel = normalize(vec3f(local.x * 0.32, -local.y * 0.32, 1.0));
    return normalize(mix(vec3f(0.0, 0.0, 1.0), bevel, edge));
  }
  return vec3f(0.0, 0.0, 1.0);
}

fn objectSpecularStrength(shape: f32, metallic: f32) -> f32 {
  let curved = select(0.035, 0.09, shape < 1.5 || (shape > 5.5 && shape < 8.5));
  return mix(curved, 0.58, metallic);
}

@fragment
fn objectFs(input: ObjectVsOut) -> @location(0) vec4f {
  let mask = objectPartMask(input.local, input.shape);
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
  let edgeShade = mix(0.76, 1.0, smoothstep(0.08, 0.64, mask));
  let color = clamp(reflected * literalGain * pulse * edgeShade + input.color.rgb * emissive, vec3f(0.0), vec3f(1.0));
  return vec4f(color, mask * input.opacity * input.color.a);
}
`;

    Object.assign(scope, { WEBGPU_OBJECT_SHADER });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
