(function attachSimulatteWebGpuRendererBackgroundShader(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

@fragment
fn backgroundFs(input: BackgroundVsOut) -> @location(0) vec4f {
  let uv = input.uv;
  let t = u.viewport.z;
  let thermal = backgroundSceneMix(0);
  let water = backgroundSceneMix(1);
  let mechanical = backgroundSceneMix(2);
  let biological = backgroundSceneMix(6);
  let chemical = backgroundSceneMix(7);
  let orbital = backgroundSceneMix(8);
  let network = backgroundSceneMix(9);
  let energy = backgroundSceneMix(10);
  let robotic = backgroundSceneMix(11);
  let granular = backgroundSceneMix(12);
  let instrument = backgroundSceneMix(13);
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

  let orbitalMask = clamp(orbital + energy * 0.24, 0.0, 1.0);
  color = mix(color, vec3f(0.015, 0.025, 0.085), orbitalMask * 0.86);
  let stars = step(0.992, fract(sin(dot(floor(uv * vec2f(83.0, 47.0)), vec2f(12.9898, 78.233))) * 43758.5453));
  color += vec3f(0.72, 0.84, 1.0) * stars * orbitalMask * 0.42;

  let gridX = backgroundLine(fract(uv.x * 12.0) - 0.5, 0.018);
  let gridY = backgroundLine(fract(uv.y * 8.0) - 0.5, 0.018);
  color += u.palette3.rgb * max(gridX, gridY) * network * 0.055;

  let heat = exp(-abs(uv.x - 0.5 + sin(uv.y * 8.0 + t * 0.3) * 0.04) * 10.0);
  color += vec3f(0.95, 0.28, 0.06) * heat * clamp(thermal + hazard, 0.0, 1.0) * 0.09;
  color += vec3f(0.18, 0.36, 0.2) * biological * smoothstep(0.5, 1.0, uv.y) * 0.12;
  color += vec3f(0.46, 0.24, 0.58) * chemical * (1.0 - uv.y) * uv.y * 0.08;
  color += vec3f(0.25, 0.52, 0.72) * instrument * max(gridX, gridY) * 0.035;

  let vignette = smoothstep(0.82, 0.18, distance(uv, vec2f(0.5)));
  color = mix(color * 0.86, color, vignette);
  return vec4f(pow(max(color, vec3f(0.0)), vec3f(0.94)), 1.0);
}
`;

    Object.assign(scope, { WEBGPU_BACKGROUND_SHADER });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
