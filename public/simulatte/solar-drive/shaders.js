(function attachSolarShaders(root) {
  'use strict';
  const common = /* wgsl */`
struct Frame {
  viewProjection: mat4x4<f32>, lightProjection: mat4x4<f32>,
  eyeTime: vec4<f32>, sun: vec4<f32>, selection: vec4<f32>,
}
struct Instance {
  model: mat4x4<f32>, color: vec4<f32>, material: vec4<f32>,
  normal0: vec4<f32>, normal1: vec4<f32>, normal2: vec4<f32>,
}
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> instances: array<Instance>;
struct Input { @location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(instance_index) index: u32 }
`;
  const main = common + /* wgsl */`
@group(0) @binding(2) var shadowTexture: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;
struct Vertex {
  @builtin(position) position: vec4<f32>, @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>, @location(2) local: vec3<f32>,
  @location(3) @interpolate(flat) index: u32,
}
@vertex fn vs(input: Input) -> Vertex {
  let item = instances[input.index];
  let world = item.model * vec4<f32>(input.position, 1.0);
  var output: Vertex;
  output.position = frame.viewProjection * world;
  output.world = world.xyz;
  output.normal = mat3x3<f32>(item.normal0.xyz, item.normal1.xyz, item.normal2.xyz) * input.normal;
  output.local = input.position;
  output.index = input.index;
  return output;
}
fn shadow(position: vec3<f32>, n: vec3<f32>) -> f32 {
  let light = frame.lightProjection * vec4<f32>(position + n * 0.002, 1.0);
  let ndc = light.xyz / light.w;
  let uv = ndc.xy * vec2<f32>(0.5, -0.5) + 0.5;
  var value = 0.0;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      value += textureSampleCompareLevel(shadowTexture, shadowSampler,
        uv + vec2<f32>(f32(x), f32(y)) / 2048.0, ndc.z - 0.0005);
    }
  }
  return mix(0.18, 1.0, value / 9.0);
}
fn fresnel(cosine: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - cosine, 5.0);
}
fn aces(x: vec3<f32>) -> vec3<f32> {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
}
@fragment fn fs(v: Vertex, @builtin(front_facing) front: bool) -> @location(0) vec4<f32> {
  let item = instances[v.index];
  let gridWidth = max(fwidth(v.world.xz * 2.0), vec2<f32>(0.001));
  let n = normalize(v.normal);
  let view = normalize(frame.eyeTime.xyz - v.world);
  let light = normalize(frame.sun.xyz);
  let halfVector = normalize(view + light);
  let nv = max(dot(n, view), 0.001);
  let nl = max(dot(n, light), 0.0);
  let nh = max(dot(n, halfVector), 0.0);
  let vh = max(dot(view, halfVector), 0.0);
  let metal = item.material.x;
  var rough = max(0.075, item.material.y);
  let pattern = u32(item.material.z + 0.5);
  var base = item.color.rgb;
  if (pattern == 1u) {
    let weave = sin(v.world.x * 720.0 + v.world.y * 720.0) * sin(v.world.z * 720.0 - v.world.y * 720.0);
    base *= 0.8 + 0.2 * weave;
  }
  if (pattern == 2u) {
    let tread = smoothstep(0.3, 0.5, abs(sin(atan2(v.local.y, v.local.x) * 100.0 + v.local.z * 12.0)));
    base *= 0.6 + 0.4 * tread;
    rough = 0.8;
  }
  if (pattern == 3u) {
    let uv = v.local.xz + 0.5;
    let cell = abs(fract(uv * vec2<f32>(8.0, 6.0)) - 0.5);
    let seam = smoothstep(0.465, 0.493, max(cell.x, cell.y));
    let finger = smoothstep(0.43, 0.495, abs(fract(uv.x * 160.0) - 0.5));
    base = mix(base * (0.95 + 0.05 * sin(floor(uv.x * 8.0) * 9.0)), vec3<f32>(0.32, 0.40, 0.46), seam);
    base = mix(base, vec3<f32>(0.22, 0.26, 0.28), finger * 0.4);
  }
  if (pattern == 5u) {
    let tracks = step(vec2<f32>(0.46), abs(fract(v.local.xz * 24.0) - 0.5));
    base = mix(base, vec3<f32>(0.20, 0.31, 0.19), max(tracks.x, tracks.y) * 0.6);
  }
  if (pattern == 6u) {
    base *= 0.94 + 0.06 * sin(v.world.y * 2400.0 + v.world.x * 150.0);
  }
  let alpha = rough * rough;
  let a2 = alpha * alpha;
  let denominator = nh * nh * (a2 - 1.0) + 1.0;
  let distribution = a2 / max(3.14159265 * denominator * denominator, 0.00001);
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  let geometry = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
  let f0 = mix(vec3<f32>(0.04), base, metal);
  let f = fresnel(vh, f0);
  let specular = distribution * geometry * f / max(4.0 * nv * nl, 0.001);
  let diffuse = (vec3<f32>(1.0) - f) * (1.0 - metal) * base / 3.14159265;
  let visibility = shadow(v.world, n);
  let reflection = reflect(-view, n);
  let sky = mix(vec3<f32>(0.16, 0.19, 0.21), vec3<f32>(0.95, 0.98, 1.05), smoothstep(-0.4, 0.9, reflection.y));
  let softbox = pow(max(dot(reflection, normalize(vec3<f32>(-0.8, 1.2, 0.5))), 0.0), 14.0 / (rough + 0.2));
  let strip = pow(max(dot(reflection, normalize(vec3<f32>(1.0, 0.3, -0.7))), 0.0), 32.0 / (rough + 0.2));
  var color = (diffuse + specular) * vec3<f32>(3.8, 3.55, 3.12) * nl * visibility;
  color += base * (1.0 - metal) * (0.25 + max(n.y, 0.0) * 0.3);
  color += fresnel(nv, f0) * (sky * 0.5 + softbox * 2.5 + strip * 1.7) * (1.0 - rough * 0.45);
  color += base * item.color.a * 2.5;
  if (pattern == 4u) {
    let grid = abs(fract(v.world.xz * 2.0 - 0.5) - 0.5) / gridWidth;
    let line = 1.0 - min(min(grid.x, grid.y), 1.0);
    let fade = exp(-dot(v.world.xz, v.world.xz) * 0.025);
    color = vec3<f32>(0.87, 0.86, 0.82) * mix(0.60, 1.0, visibility);
    color *= 1.0 - line * 0.065 * fade;
    color = mix(vec3<f32>(0.91, 0.90, 0.87), color, exp(-dot(v.world.xz, v.world.xz) * 0.003));
  }
  let selected = abs(item.material.w - frame.selection.x) < 0.1 && frame.selection.x > 0.0;
  if (selected) { color += vec3<f32>(0.13, 0.09, 0.025) * pow(1.0 - nv, 2.0); }
  return vec4<f32>(pow(aces(color), vec3<f32>(1.0 / 2.2)), 1.0);
}
`;
  const shadow = common + /* wgsl */`
@vertex fn vs(input: Input) -> @builtin(position) vec4<f32> {
  return frame.lightProjection * instances[input.index].model * vec4<f32>(input.position, 1.0);
}
`;
  root.SimulatteSolarShaders = Object.freeze({ main, shadow, frameFloats: 44, instanceFloats: 36 });
})(globalThis);
