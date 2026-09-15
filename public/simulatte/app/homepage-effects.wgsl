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
