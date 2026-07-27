(function attachSimulatteWebGpuRendererBackgroundShader(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

    const WEBGPU_BACKGROUND_SHADER = `
struct BackgroundUniforms {
  viewport: vec4f,
  params: vec4f,
  motion: vec4f,
  loading: vec4f,
  palette0: vec4f,
  palette1: vec4f,
  palette2: vec4f,
  palette3: vec4f,
  features0: vec4f,
  features1: vec4f,
  features2: vec4f,
  features3: vec4f,
  features4: vec4f,
  features5: vec4f,
  features6: vec4f,
  features7: vec4f,
  features8: vec4f,
  features9: vec4f,
  features10: vec4f,
  features11: vec4f,
  atoms0: vec4f,
  atoms1: vec4f,
  atoms2: vec4f,
  atoms3: vec4f,
  atoms4: vec4f,
  atoms5: vec4f,
  sceneMix0: vec4f,
  sceneMix1: vec4f,
  sceneMix2: vec4f,
  sceneMix3: vec4f,
};

@group(0) @binding(0) var<uniform> u: BackgroundUniforms;

struct BackgroundVsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn backgroundVs(@builtin(vertex_index) vertexIndex: u32) -> BackgroundVsOut {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  var out: BackgroundVsOut;
  out.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  out.uv = positions[vertexIndex] * 0.5 + vec2f(0.5);
  return out;
}

fn backgroundSceneMix(index: i32) -> f32 {
  if (index < 4) { return u.sceneMix0[index]; }
  if (index < 8) { return u.sceneMix1[index - 4]; }
  if (index < 12) { return u.sceneMix2[index - 8]; }
  return u.sceneMix3[index - 12];
}

fn backgroundLine(value: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width, width + 0.004, abs(value));
}

fn backgroundHash(point: vec2f) -> f32 {
  return fract(sin(dot(point, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn backgroundFs(input: BackgroundVsOut) -> @location(0) vec4f {
  let uv = input.uv;
  let t = u.viewport.z;
  let thermal = backgroundSceneMix(0);
  let water = backgroundSceneMix(1);
  let mechanical = backgroundSceneMix(2);
  let magnetic = backgroundSceneMix(3);
  let optical = backgroundSceneMix(4);
  let acoustic = backgroundSceneMix(5);
  let biological = backgroundSceneMix(6);
  let chemical = backgroundSceneMix(7);
  let orbital = backgroundSceneMix(8);
  let network = backgroundSceneMix(9);
  let energy = backgroundSceneMix(10);
  let robotic = backgroundSceneMix(11);
  let granular = backgroundSceneMix(12);
  let instrument = backgroundSceneMix(13);
  let phase = backgroundSceneMix(14);
  let hazard = backgroundSceneMix(15);

  let sky = mix(u.palette0.rgb, u.palette1.rgb, smoothstep(0.0, 1.0, uv.y));
  let groundWeight = clamp(mechanical + biological + robotic + granular, 0.0, 1.0);
  let horizon = smoothstep(0.54, 0.72, uv.y) * groundWeight;
  var color = mix(sky, mix(u.palette1.rgb, u.palette2.rgb, 0.42), horizon * 0.42);

  let waterLevel = 0.56 + sin(uv.x * 10.0 + t * 0.35) * 0.008;
  let waterMask = smoothstep(waterLevel - 0.015, waterLevel + 0.015, uv.y) * water;
  color = mix(color, vec3f(0.12, 0.43, 0.68), waterMask * 0.72);
  let waterLine = backgroundLine(uv.y - waterLevel, 0.006) * water;
  color += vec3f(0.5, 0.86, 0.94) * waterLine * 0.34;
  let caustic = pow(abs(sin(uv.x * 22.0 + sin(uv.y * 17.0 + t * 0.22) * 2.1)), 14.0);
  color += vec3f(0.18, 0.72, 0.92) * caustic * water * 0.13;

  let orbitalMask = clamp(orbital + energy * 0.24, 0.0, 1.0);
  color = mix(color, vec3f(0.015, 0.025, 0.085), orbitalMask * 0.86);
  let starCellA = floor(uv * vec2f(83.0, 47.0));
  let starCellB = floor((uv + vec2f(0.17, 0.31)) * vec2f(127.0, 73.0));
  let starsA = step(0.982, backgroundHash(starCellA));
  let starsB = step(0.991, backgroundHash(starCellB));
  color += vec3f(0.72, 0.84, 1.0) * (starsA * 0.52 + starsB * 0.34) * orbitalMask;
  let nebula = sin(uv.x * 5.2 + sin(uv.y * 7.0 - t * 0.06) * 2.4) * 0.5 + 0.5;
  color += mix(vec3f(0.14, 0.08, 0.36), vec3f(0.02, 0.32, 0.5), uv.x) *
    pow(nebula, 4.0) * orbitalMask * 0.18;

  let gridX = backgroundLine(fract(uv.x * 12.0) - 0.5, 0.018);
  let gridY = backgroundLine(fract(uv.y * 8.0) - 0.5, 0.018);
  color += u.palette3.rgb * max(gridX, gridY) * network * 0.055;
  let networkCell = fract(uv * vec2f(12.0, 8.0)) - vec2f(0.5);
  let networkNode = 1.0 - smoothstep(0.045, 0.13, length(networkCell));
  let networkPulse = 0.5 + 0.5 * sin(t * 0.72 + floor(uv.x * 12.0) * 0.7 + floor(uv.y * 8.0));
  color += u.palette3.rgb * networkNode * networkPulse * network * 0.22;

  let heat = exp(-abs(uv.x - 0.5 + sin(uv.y * 8.0 + t * 0.3) * 0.04) * 10.0);
  color += vec3f(0.95, 0.28, 0.06) * heat * clamp(thermal + hazard, 0.0, 1.0) * 0.09;
  let emberCell = floor((uv + vec2f(0.0, t * 0.025)) * vec2f(45.0, 32.0));
  let embers = step(0.975, backgroundHash(emberCell)) * (1.0 - uv.y);
  color += vec3f(1.0, 0.24, 0.02) * embers * clamp(thermal + hazard, 0.0, 1.0) * 0.34;

  color += vec3f(0.18, 0.36, 0.2) * biological * smoothstep(0.5, 1.0, uv.y) * 0.12;
  let organicCell = floor((uv + vec2f(t * 0.008, -t * 0.012)) * vec2f(36.0, 28.0));
  let organicMotes = step(0.965, backgroundHash(organicCell));
  color += vec3f(0.5, 0.9, 0.36) * organicMotes * biological * 0.18;

  color += vec3f(0.46, 0.24, 0.58) * chemical * (1.0 - uv.y) * uv.y * 0.08;
  let bubbleCell = fract((uv + vec2f(0.0, -t * 0.015)) * vec2f(17.0, 11.0)) - vec2f(0.5);
  let bubbles = 1.0 - smoothstep(0.035, 0.075, abs(length(bubbleCell) - 0.24));
  color += vec3f(0.72, 0.36, 0.86) * bubbles * chemical * 0.08;

  let aurora = pow(max(0.0, sin(uv.x * 7.0 + sin(uv.y * 5.0 + t * 0.08) * 2.2)), 5.0);
  color += mix(vec3f(0.1, 0.82, 0.72), vec3f(0.48, 0.18, 0.86), uv.y) *
    aurora * clamp(magnetic + energy, 0.0, 1.0) * 0.16;
  let prism = 0.5 + 0.5 * cos(
    vec3f(0.0, 2.094, 4.188) + (uv.x + uv.y * 0.42) * 9.0
  );
  color += prism * pow(max(0.0, sin((uv.x - uv.y) * 10.0)), 15.0) * optical * 0.12;

  let acousticRadius = distance(uv, vec2f(0.5, 0.58));
  let wavefront = pow(abs(sin(acousticRadius * 42.0 - t * 0.32)), 24.0);
  color += vec3f(0.28, 0.7, 1.0) * wavefront * acoustic * 0.1;

  let dustCell = floor((uv + vec2f(t * 0.006, -t * 0.01)) * vec2f(52.0, 34.0));
  let dust = step(0.97, backgroundHash(dustCell));
  color += vec3f(0.92, 0.72, 0.4) * dust * granular * 0.16;

  let instrumentScan = pow(max(0.0, sin(uv.y * 38.0 - t * 0.24)), 26.0);
  color += vec3f(0.25, 0.74, 0.86) * instrumentScan * instrument * 0.09;
  let phaseFacet = pow(abs(sin((uv.x + uv.y * 0.72) * 13.0)), 20.0);
  color += u.palette3.rgb * phaseFacet * phase * 0.08;

  let architecture = smoothstep(0.68, 0.96, uv.y) *
    (0.5 + 0.5 * step(0.66, fract(uv.x * 9.0)));
  color = mix(color, color * 0.68 + u.palette2.rgb * 0.32, architecture * mechanical * 0.2);

  let vignette = 1.0 - smoothstep(0.18, 0.82, distance(uv, vec2f(0.5)));
  color = mix(color * 0.86, color, vignette);
  return vec4f(pow(max(color, vec3f(0.0)), vec3f(0.94)), 1.0);
}
`;

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-background-shader.js', { WEBGPU_BACKGROUND_SHADER });

})(typeof globalThis !== 'undefined' ? globalThis : window);
