struct Frame {
  viewport: vec4<f32>,
  pointer: vec4<f32>,
  motion: vec4<f32>,
  ink: vec4<f32>,
  cells: array<vec4<f32>, 7>,
}
@group(0) @binding(0) var<uniform> frame: Frame;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(positions[index], 0.0, 1.0);
}

fn hexDistance(point: vec2<f32>, halfSize: vec2<f32>) -> f32 {
  let normal = normalize(vec2(halfSize.y, halfSize.x * 0.5));
  return max(abs(point.y) - halfSize.y, dot(abs(point), normal) - halfSize.x * normal.x);
}

fn lineDistance(point: vec2<f32>, start: vec2<f32>, end: vec2<f32>) -> f32 {
  let delta = end - start;
  let along = clamp(dot(point - start, delta) / max(dot(delta, delta), 1.0), 0.0, 1.0);
  return length(point - start - delta * along);
}

fn graphHash(value: vec2<f32>) -> f32 {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453);
}

fn graphOuterNode(particle: i32, cycle: i32) -> i32 {
  return 1 + i32(floor(graphHash(vec2(f32(particle) + 0.37, f32(cycle) + 0.61)) * 6.0));
}

fn graphNeighborNode(particle: i32, cycle: i32, outer: i32) -> i32 {
  let direction = select(-1, 1, graphHash(vec2(f32(particle) + 9.17, f32(cycle) + 4.73)) >= 0.5);
  var neighbor = outer + direction;
  if (neighbor < 1) { neighbor = 6; }
  if (neighbor > 6) { neighbor = 1; }
  return neighbor;
}

fn graphWalkNode(particle: i32, step: i32) -> i32 {
  let cycle = step / 3;
  let phase = step % 3;
  if (phase == 0) { return 0; }
  let outer = graphOuterNode(particle, cycle);
  if (phase == 1) { return outer; }
  return graphNeighborNode(particle, cycle, outer);
}

@fragment fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = position.xy / frame.viewport.w;
  let time = frame.viewport.z;
  let hoverIndex = i32(frame.pointer.z);
  let launchIndex = i32(frame.pointer.w);
  let hover = frame.motion.x;
  let progress = frame.motion.y;
  var alpha = 0.0;
  var nearest = 10000.0;
  for (var index = 0; index < 7; index += 1) {
    let cell = frame.cells[index];
    let local = pixel - cell.xy;
    let distance = hexDistance(local, max(cell.zw * 0.5, vec2(1.0)));
    nearest = min(nearest, distance);
    let active = select(0.0, hover, index == hoverIndex);
    let perimeter = atan2(local.y, local.x) / 6.2831853;
    let sweep = fract(perimeter - time * 0.065 + f32(index) * 0.137);
    let trace = smoothstep(0.68, 0.94, sweep) * (1.0 - smoothstep(0.94, 1.0, sweep));
    let edge = 1.0 - smoothstep(0.35, 1.6, abs(distance));
    let outer = 1.0 - smoothstep(0.3, 1.3, abs(distance - 5.0));
    let ticks = pow(max(0.0, cos(perimeter * 6.2831853 * 18.0)), 16.0);
    let proximity = exp(-length(pixel - frame.pointer.xy) / 95.0) * active;
    alpha += edge * (0.08 + trace * 0.5 + active * 0.24 + proximity * 0.18);
    alpha += outer * ticks * (0.05 + active * 0.34);
    alpha += exp(-abs(distance) * 0.19) * (0.012 + active * 0.055);
  }
  let seamVisibility = mix(0.09, 1.0, smoothstep(-3.0, 8.0, nearest));
  for (var outerIndex = 1; outerIndex < 7; outerIndex += 1) {
    let nextOuterIndex = select(outerIndex + 1, 1, outerIndex == 6);
    let spoke = lineDistance(pixel, frame.cells[0].xy, frame.cells[outerIndex].xy);
    let rim = lineDistance(pixel, frame.cells[outerIndex].xy, frame.cells[nextOuterIndex].xy);
    let spokePulse = 0.5 + 0.5 * sin(time * 0.42 + f32(outerIndex) * 1.71);
    alpha += (1.0 - smoothstep(0.35, 1.15, spoke)) * (0.018 + spokePulse * 0.014) * seamVisibility;
    alpha += (1.0 - smoothstep(0.35, 1.1, rim)) * 0.025 * seamVisibility;
  }
  for (var particleIndex = 0; particleIndex < 24; particleIndex += 1) {
    let seed = graphHash(vec2(f32(particleIndex) + 17.0, 3.91));
    let speed = 0.2 + seed * 0.19;
    let travel = time * speed + seed * 29.0;
    let step = i32(floor(travel));
    let progressAlongEdge = smoothstep(0.0, 1.0, fract(travel));
    let startNode = graphWalkNode(particleIndex, step);
    let endNode = graphWalkNode(particleIndex, step + 1);
    let start = frame.cells[startNode].xy;
    let end = frame.cells[endNode].xy;
    let head = mix(start, end, progressAlongEdge);
    let tail = mix(start, end, max(0.0, progressAlongEdge - 0.12 - seed * 0.08));
    let headDistance = length(pixel - head);
    let tailDistance = lineDistance(pixel, tail, head);
    let core = 1.0 - smoothstep(0.45, 1.8, headDistance);
    let glow = 1.0 - smoothstep(1.4, 6.8, headDistance);
    let trail = 1.0 - smoothstep(0.3, 1.25, tailDistance);
    let shimmer = 0.78 + 0.22 * sin(time * (1.1 + seed) + f32(particleIndex) * 2.37);
    alpha += (core * 0.5 + glow * 0.12 + trail * 0.16) * shimmer * seamVisibility;
  }
  if (hoverIndex > 0 && launchIndex < 0) {
    let start = frame.cells[0].xy;
    let end = frame.cells[hoverIndex].xy;
    let wire = lineDistance(pixel, start, end);
    let along = length(pixel - start);
    let pulse = pow(max(0.0, sin(along * 0.085 - time * 2.2)), 14.0);
    alpha += (1.0 - smoothstep(0.4, 1.2, wire)) * (0.12 + pulse * 0.45) * hover * smoothstep(-2.0, 1.0, nearest);
  }
  if (launchIndex >= 0) {
    let origin = frame.cells[launchIndex].xy;
    let radius = length(pixel - origin);
    let wave = progress * max(frame.viewport.x, frame.viewport.y) * 0.8;
    let ring = exp(-abs(radius - wave) * 0.18);
    let echo = exp(-abs(radius - wave * 0.73) * 0.35);
    alpha += (ring * 0.62 + echo * 0.24) * sin(progress * 3.14159265);
  }
  let opacity = clamp(alpha * frame.ink.a, 0.0, 0.76);
  return vec4(frame.ink.rgb * opacity, opacity);
}
