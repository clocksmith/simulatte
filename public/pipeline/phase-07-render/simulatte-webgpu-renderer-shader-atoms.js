(function attachSimulatteWebGpuRendererShaderAtoms(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    scope.WEBGPU_SHADER_PARTS = scope.WEBGPU_SHADER_PARTS || [];
    scope.WEBGPU_SHADER_PARTS.push(`  return max(atomFluidRibbons(q, t), stripe((q.x + q.y) * 5.0 - t * 0.38, 0.026)) * smoothstep(1.1, 0.08, length(p));
}

fn atomConstraintPads(p: vec2f, t: f32) -> f32 {
  let padA = diskMask(p, vec2f(-0.44, -0.18 + sin(t * 0.25) * 0.03), 0.12);
  let padB = diskMask(p, vec2f(0.42, 0.18 + cos(t * 0.22) * 0.03), 0.12);
  let bridge = capsuleLine(p, vec2f(-0.44, -0.18), vec2f(0.42, 0.18), 0.024);
  return max(max(padA, padB), bridge * 0.56);
}

fn atomSignalPulses(p: vec2f, t: f32) -> f32 {
  return stripe((p.x - p.y) * 6.0 - t * 0.58, 0.024) * smoothstep(1.04, 0.08, length(p));
}

fn atomOrbitalTrails(p: vec2f, t: f32) -> f32 {
  let angle = atan2(p.y, p.x);
  return stripe(angle * 2.4 + length(p) * 2.2 - t * 0.18, 0.026) * smoothstep(0.98, 0.08, length(p));
}

fn atomGravityWell(p: vec2f, t: f32) -> f32 {
  return stripe(length(p) * 4.6 - t * 0.1, 0.024) * smoothstep(1.0, 0.05, length(p));
}

fn atomFluxLines(p: vec2f, t: f32) -> f32 {
  return stripe(atan2(p.y, p.x) * 3.2 + length(p) * 2.2 - t * 0.18, 0.028) * smoothstep(0.96, 0.08, length(p));
}

fn atomChargeShell(p: vec2f, t: f32) -> f32 {
  return max(ellipseRing(p, vec2f(-0.22, 0.02), vec2f(1.2, 0.82), 0.28, 0.026),
    ellipseRing(p, vec2f(0.28, -0.02), vec2f(1.0, 1.1), 0.22, 0.024)) *
    (0.72 + 0.28 * sin(t * 0.8) * sin(t * 0.8));
}

fn atomOpticalCaustics(p: vec2f, t: f32) -> f32 {
  let beamA = exp(-abs(rot(p, 0.24).y) * 62.0) * smoothstep(-0.82, 0.76, p.x);
  let beamB = exp(-abs(rot(p, -0.32).y + 0.08) * 48.0) * smoothstep(-0.78, 0.72, p.x);
  return max(beamA, beamB) * (0.78 + 0.22 * sin(t + p.x * 4.0));
}

fn atomRayCones(p: vec2f, t: f32) -> f32 {
  let cone = exp(-abs(abs(rot(p - vec2f(-0.18, 0.02), 0.18).y) - max(0.02, (p.x + 0.25) * 0.18)) * 24.0);
  return cone * smoothstep(-0.78, 0.72, p.x);
}

fn atomReadoutPulse(p: vec2f, t: f32) -> f32 {
  let deck = rectMask(p, vec2f(0.0, 0.58), vec2f(0.78, 0.09));
  return deck * max(stripe(p.x * 12.0 - t * 0.8, 0.04), stripe((p.x + p.y) * 8.0 + t * 0.24, 0.03));
}

fn atomAcousticRings(p: vec2f, t: f32) -> f32 {
  return stripe(length((p - vec2f(-0.12, 0.02)) * vec2f(1.0, 0.72)) * 7.8 - t * 0.9, 0.026);
}

fn atomStandingNodes(p: vec2f, t: f32) -> f32 {
  return stripe(p.x * 7.0 + sin(p.y * 4.0 + t * 0.18), 0.03) * smoothstep(0.34, 0.02, abs(p.y));
}

fn atomBiologicalBranches(p: vec2f, t: f32) -> f32 {
  return branchWeb(p, t);
}

fn atomDensityFront(p: vec2f, t: f32) -> f32 {
  return smoothstep(0.06, 0.0, abs(length((p - vec2f(0.08, -0.02)) * vec2f(0.9, 1.18)) - 0.42 + sin(t * 0.28) * 0.05));
}

fn atomFermentationBubbles(p: vec2f, t: f32) -> f32 {
  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.8, 1.18)));
  let a = diskMask(p, vec2f(-0.32 + sin(t * 0.42) * 0.05, -0.05), 0.1);
  let b = diskMask(p, vec2f(0.2, 0.16 + cos(t * 0.41) * 0.05), 0.075);
  let c = diskMask(p, vec2f(0.38 + sin(t * 0.31) * 0.04, -0.24), 0.085);
  return max(max(a, b), c) * dough;
}

fn atomGlutenStrands(p: vec2f, t: f32) -> f32 {
  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.8, 1.18)));
  return exp(-abs(sin(p.x * 9.0 + p.y * 5.2 + sin(t * 0.22 + p.y * 4.0) * 0.7)) * 4.6) * dough;
}

fn atomAcidityGradient(p: vec2f, t: f32) -> f32 {
  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.8, 1.18)));
  return stripe((p.x + p.y * 0.72) * 5.4 - t * 0.22, 0.025) * dough;
}

fn atomChemicalClouds(p: vec2f, t: f32) -> f32 {
  let pool = smoothstep(0.68, 0.04, length((p - vec2f(0.12, 0.0)) * vec2f(1.0, 0.78)));
  return pool * (0.55 + 0.45 * filmNoise(p * 1.8, t * 0.4));
}

fn atomReactionFront(p: vec2f, t: f32) -> f32 {
  return stripe(length(p - vec2f(0.12, 0.0)) * 6.0 + t * 0.18, 0.026) * smoothstep(0.78, 0.06, length(p));
}

fn atomPacketPulses(p: vec2f, t: f32) -> f32 {
  let road = max(capsuleLine(p, vec2f(-0.82, -0.28), vec2f(0.78, 0.24), 0.024),
    capsuleLine(p, vec2f(-0.62, 0.34), vec2f(0.66, -0.18), 0.022));
  return road * stripe((p.x + p.y) * 5.0 - t * 0.86, 0.038);
}

fn atomGranularStrata(p: vec2f, t: f32) -> f32 {
  return max(stripe(p.y * 9.0 + sin(p.x * 4.0) * 0.12, 0.04), stripe((p.x - p.y) * 4.0, 0.03));
}

fn atomSedimentMotion(p: vec2f, t: f32) -> f32 {
  let fan = smoothstep(0.5, 0.04, length((p - vec2f(0.46, -0.36)) * vec2f(1.2, 0.7)));
  return fan * stripe(atan2(p.y + 0.36, p.x - 0.46) * 5.0 + t * 0.18, 0.035);
}

fn atomInstrumentReadout(p: vec2f, t: f32) -> f32 {
  let panel = rectMask(p, vec2f(-0.56, 0.42), vec2f(0.22, 0.14));
  let deck = rectMask(p, vec2f(0.0, 0.58), vec2f(0.86, 0.13));
  return max(panel, deck * max(stripe(p.x * 15.0 - t * 0.48, 0.035), stripe((p.x + p.y) * 9.0 + t * 0.2, 0.028)));
}

fn atomMeasurementBands(p: vec2f, t: f32) -> f32 {
  return stripe(p.x * 11.0 + p.y * 2.0 - t * 0.36, 0.028) * smoothstep(0.88, 0.1, abs(p.y - 0.42));
}

fn atomCombustionFront(p: vec2f, t: f32) -> f32 {
  return atomThermalPlume(p * vec2f(0.88, 1.1) + vec2f(sin(t * 0.36) * 0.08, -0.12), t);
}

fn atomSootColumn(p: vec2f, t: f32) -> f32 {
  return stripe(p.y * 5.5 + sin(p.x * 4.2 + t * 0.18) * 0.75 - t * 0.16, 0.03) *
    smoothstep(-0.18, 0.82, p.y);
}

fn atomLatentHeatBand(p: vec2f, t: f32) -> f32 {
  return stripe(max(abs(p.x), abs(p.y)) * 5.2 - t * 0.12, 0.027) * smoothstep(0.92, 0.06, length(p));
}

fn atomRobotWorkcell(p: vec2f, t: f32) -> f32 {
  let armTip = vec2f(0.5, 0.18 + sin(t * 1.8) * 0.14);
  let arm = max(capsuleLine(p, vec2f(-0.42, 0.12), vec2f(0.05, -0.06), 0.06),
    capsuleLine(p, vec2f(0.05, -0.06), armTip, 0.05));
  let cell = max(rectMask(p, vec2f(-0.62, 0.08), vec2f(0.09, 0.34)),
    rectMask(p, vec2f(0.66, 0.08), vec2f(0.08, 0.34)));
  return max(arm, cell * 0.64);
}

fn atomContactForces(p: vec2f, t: f32) -> f32 {
  let tip = vec2f(0.5, 0.18 + sin(t * 1.8) * 0.14);
  return max(diskMask(p, tip, 0.09), stripe(length(p - tip) * 5.0 - t * 0.8, 0.026) * smoothstep(0.42, 0.04, length(p - tip)));
}

fn cinematic3dScene(p: vec2f, t: f32, scene: f32, base: vec3f) -> vec3f {
  let sceneGroup = floor(scene);
  let heat = u.params.x;
  let flow = u.params.y;
  let density = u.params.z;
  let bloom = u.params.w;
  let motion = u.motion.x;
  let variant = hash11(sceneGroup + floor(u.motion.z * 997.0));
  let floorGlow = perspectiveFloor(p, t);
  let fog = filmNoise(p * (1.4 + variant), t) * smoothstep(1.45, 0.12, length(p));
  var color = base;
  color = mix(color, mix(u.palette2.rgb, u.palette0.rgb, 0.18), 0.18 + fog * 0.08);

  let thermal = max(atomAt(0), atomAt(14));
  let fluid = atomAt(1);
  let stress = atomAt(2);
  let feedback = atomAt(3);
  let orbital = atomAt(4);
  let em = atomAt(5);
  let optical = atomAt(6);
  let quantum = atomAt(7);
  let acoustic = atomAt(8);
  let bio = atomAt(9);
  let chemical = atomAt(10);
  let network = atomAt(11);
  let granular = atomAt(12);
  let instrument = max(atomAt(13), atomAt(17));
  let phase = atomAt(15);
  let robot = atomAt(16);
  let constraint = atomAt(21);
  let signal = atomAt(22);
  let gridFeature = featureAt(40);
  let robotFeature = max(featureAt(38), featureAt(41));
  let factoryFeature = featureAt(42);
  let quantumFeature = featureAt(43);
  let agroFeature = featureAt(44);
  let particleFeature = featureAt(45);
  let civicFeature = featureAt(46);
  let hazardFeature = featureAt(47);
  let atomSpecific = clamp(max(max(max(robot, quantum), max(chemical, granular)), max(max(network, optical), max(bio, orbital))), 0.0, 1.0);
  let networkLocal = network * (1.0 - clamp(max(max(robot, chemical), max(granular, fluid)) * 0.82, 0.0, 0.92));
  let literalScene = 0.0;
  let commonOverlay = 1.0 - literalScene;
  color += u.palette1.rgb * floorGlow * (0.025 + flow * 0.06) * (1.0 - atomSpecific * 0.78);

  if (sceneGroup == 10.0 || orbital > 0.36) {
    color = mix(color, vec3f(0.015, 0.022, 0.06), 0.42);
    color += vec3f(0.8, 0.94, 1.0) * starParticleField(p, t, 0.16 + density * 0.18) * 0.72;
    color = blendLayer(color, orb3d(p, vec2f(-0.28, -0.04), 0.36, u.palette1.rgb * 0.72, u.palette3.rgb * 0.02, 0.44));
    color = blendLayer(color, orb3d(p, vec2f(0.52, 0.2), 0.12, u.palette0.rgb * 0.8, u.palette3.rgb * 0.04, 0.32));
    color += u.palette3.rgb * ellipseRing(rot(p - vec2f(-0.28, -0.04), 0.18), vec2f(0.0), vec2f(0.75, 2.8), 0.58, 0.035) * 0.56;
  } else if (sceneGroup == 4.0) {
    color = mix(color, vec3f(0.012, 0.018, 0.036), 0.52);
    let dish = smoothstep(0.7, 0.08, length((p - vec2f(0.02, -0.08)) * vec2f(0.9, 1.25)));
    let coilA = ellipseRing(p, vec2f(-0.46, -0.08), vec2f(1.2, 0.74), 0.22, 0.035);
    let coilB = ellipseRing(p, vec2f(0.48, -0.08), vec2f(1.2, 0.74), 0.22, 0.035);
    let fluxA = stripe(atan2(p.y + 0.08, p.x) * 5.0 + length(p) * 3.5 - t * (0.22 + motion * 0.16), 0.028) * dish;
    let spikes = pow(max(0.0, sin(atan2(p.y + 0.06, p.x - 0.02) * 18.0 + t * 0.85)), 7.0) *
      smoothstep(0.62, 0.06, length((p - vec2f(0.02, -0.05)) * vec2f(1.0, 0.76)));
    color += vec3f(0.05, 0.1, 0.16) * dish * 0.48;
    color += vec3f(0.32, 0.62, 1.0) * fluxA * (0.32 + em * 0.44);
    color += vec3f(0.95, 0.18, 0.82) * spikes * (0.38 + bloom * 0.24);
    color += vec3f(0.98, 0.75, 0.36) * max(coilA, coilB) * 0.68;
  } else if (sceneGroup == 12.0) {
    color = mix(color, vec3f(0.015, 0.018, 0.04), 0.44);
    color += vec3f(0.86, 0.2, 1.0) * ellipseRing(p, vec2f(0.0, 0.02), vec2f(1.2, 0.72), 0.52, 0.04) * 0.72;
    color += vec3f(0.18, 0.92, 1.0) * stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.0 - t * 0.28, 0.032) * smoothstep(0.95, 0.08, length(p)) * 0.42;
    color = blendLayer(color, panel3d(p, vec2f(0.0, -0.5), vec2f(0.72, 0.12), vec3f(0.06, 0.08, 0.12), u.palette1.rgb));
  } else if (sceneGroup == 15.0 || sceneGroup == 32.0 || particleFeature > 0.18) {
    color = mix(color, vec3f(0.006, 0.04, 0.055), 0.68);
    let tank = diskMask(p, vec2f(0.0, -0.02), 0.62);
    let wall = ellipseRing(p, vec2f(0.0, -0.02), vec2f(0.72, 1.12), 0.62, 0.035);
    let track = capsuleLine(p, vec2f(-0.78, 0.28), vec2f(0.72, -0.22), 0.018);
    let trackPhase = t * (0.7 + motion * 0.46);
    let muonTrackA = capsuleLine(
      p,
      vec2f(-0.86, -0.34 + sin(trackPhase) * 0.18),
      vec2f(0.86, 0.3 + cos(trackPhase * 0.84) * 0.18),
      0.025
    );
    let muonTrackB = capsuleLine(
      p,
      vec2f(-0.76, 0.38 + cos(trackPhase * 0.72) * 0.14),
      vec2f(0.68, -0.42 + sin(trackPhase * 0.9) * 0.12),
      0.018
    );
    let fieldSweep = stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.2 - t * (0.92 + em * 0.36), 0.028) *
      smoothstep(0.78, 0.12, length(p));
    let hitCenter = vec2f(-0.7 + fract(t * (0.52 + motion * 0.32)) * 1.4, 0.24 + sin(t * 1.18) * 0.2);
    let travellingHit = diskMask(p, hitCenter, 0.075);
    let calorimeterPulse = stripe(p.x * 9.0 + t * (1.2 + heat * 0.44), 0.044) *
      smoothstep(0.72, 0.28, abs(p.y + 0.52));
    let coneA = exp(-abs(rot(p - vec2f(-0.14, 0.08), 0.34).y) * 20.0) *
      smoothstep(0.62, -0.08, length(p - vec2f(-0.14, 0.08)));
    let coneB = exp(-abs(rot(p - vec2f(0.12, -0.02), -0.48).y) * 18.0) *
      smoothstep(0.58, -0.06, length(p - vec2f(0.12, -0.02)));
    let pmt = max(max(max(
      diskMask(p, vec2f(-0.5, 0.38), 0.045),
      diskMask(p, vec2f(-0.24, 0.51), 0.045)),
      max(diskMask(p, vec2f(0.08, 0.54), 0.045), diskMask(p, vec2f(0.4, 0.42), 0.045))),
      max(diskMask(p, vec2f(-0.52, -0.38), 0.045), diskMask(p, vec2f(0.52, -0.32), 0.045)));
    color = mix(color, vec3f(0.03, 0.22, 0.26), tank * 0.34);
    color += vec3f(0.42, 0.96, 1.0) * wall * 0.66;
    color += vec3f(0.78, 1.0, 0.96) * max(coneA, coneB) * 0.28;
    color += vec3f(0.92, 1.0, 0.9) * track * 0.82;
    color += vec3f(0.74, 1.0, 0.98) * max(muonTrackA, muonTrackB) * (0.52 + instrument * 0.36);
    color += vec3f(0.22, 0.88, 1.0) * fieldSweep * (0.24 + em * 0.44);
    color += vec3f(1.0, 0.32, 0.08) * calorimeterPulse * (0.16 + thermal * 0.38);
    color += vec3f(1.0, 0.95, 0.5) * travellingHit * (0.46 + signal * 0.42);
    color += vec3f(0.18, 0.82, 1.0) * pmt * (0.54 + stripe(t + length(p) * 3.0, 0.05) * 0.28);
  } else if (sceneGroup == 23.0 || sceneGroup == 27.0) {
    let shelfEdge = p.y + 0.18 + sin(p.x * 2.5 + t * 0.18) * 0.08;
    let shelf = smoothstep(0.07, 0.0, abs(shelfEdge));
    let waterColumn = smoothstep(-0.98, -0.12, p.y) * (1.0 - smoothstep(0.44, 0.82, p.y));
    let waveBands = stripe(p.y * 8.5 + sin(p.x * 4.2 + t * 1.25) * 0.62 - t * 1.1, 0.036) * waterColumn;
    let foamBands = stripe((p.x - p.y) * 6.0 + sin(p.y * 5.0 - t * 1.6) - t * 0.74, 0.028) * waterColumn;
    let icebergA = rectMask(rot(p - vec2f(-0.38 + sin(t * 0.62) * 0.08, -0.05 + cos(t * 0.41) * 0.04), -0.18), vec2f(0.0), vec2f(0.16, 0.08));
    let icebergB = rectMask(rot(p - vec2f(0.32 - sin(t * 0.52) * 0.1, -0.28 + sin(t * 0.46) * 0.05), 0.24), vec2f(0.0), vec2f(0.13, 0.07));
    let calvingShard = rectMask(rot(p - vec2f(0.04 + sin(t * 0.9) * 0.16, 0.05 - fract(t * 0.2) * 0.54), 0.52), vec2f(0.0), vec2f(0.075, 0.05));
    color = mix(color, vec3f(0.02, 0.18, 0.32), waterColumn * 0.48);
    color += vec3f(0.35, 0.8, 1.0) * atomFluidRibbons(p, t) * 0.34;
    color += vec3f(0.36, 0.92, 1.0) * waveBands * (0.28 + max(acoustic, fluid) * 0.38);
    color += vec3f(0.92, 0.98, 1.0) * foamBands * (0.18 + acoustic * 0.34);
    color += vec3f(0.92, 0.98, 1.0) * shelf * 0.62;
    color += vec3f(0.88, 0.97, 1.0) * max(max(icebergA, icebergB), calvingShard) * 0.72;
    color += vec3f(0.55, 0.92, 1.0) * starParticleField(p + vec2f(t * 0.08, -t * 0.05), t, 0.1 + acoustic * 0.14) * waterColumn * 0.3;
    color += vec3f(0.2, 1.0, 0.58) * branchWeb(p + vec2f(0.18, -0.24), t) * 0.14;
  } else if (sceneGroup == 24.0) {
    color = blendLayer(color, panel3d(p, vec2f(0.0, -0.08), vec2f(0.86, 0.14), vec3f(0.11, 0.12, 0.13), u.palette1.rgb));
    color += vec3f(0.8, 0.9, 1.0) * capsuleLine(p, vec2f(-0.82, 0.22), vec2f(0.82, 0.22 + sin(t * 0.4) * 0.04), 0.035) * 0.52;
    color += vec3f(1.0, 0.54, 0.18) * atomStressCracks(p, t) * 0.42;
    color += vec3f(0.32, 0.74, 1.0) * stripe(p.x * 10.0 + sin(p.y * 8.0 + t * 0.32), 0.025) * smoothstep(0.82, 0.12, abs(p.y)) * 0.18;
  } else if (sceneGroup == 6.0) {
    color = mix(color, vec3f(0.018, 0.045, 0.07), 0.46);
    let tube = capsuleLine(p, vec2f(-0.82, -0.02), vec2f(0.82, -0.02 + sin(t * 0.2) * 0.03), 0.09);
    let mouthA = ellipseRing(p, vec2f(-0.72, -0.02), vec2f(1.0, 0.68), 0.16, 0.03);
    let mouthB = ellipseRing(p, vec2f(0.72, -0.02), vec2f(1.0, 0.68), 0.16, 0.03);
    let ringA = stripe(length((p - vec2f(-0.36, 0.02)) * vec2f(1.0, 0.72)) * 8.5 - t * (1.1 + motion * 0.36), 0.026);
    let ringB = stripe(length((p - vec2f(0.28, 0.0)) * vec2f(1.0, 0.72)) * 8.0 - t * (1.0 + motion * 0.3), 0.026);
    let levitatedDust = starParticleField(p + vec2f(sin(t * 0.24) * 0.04, 0.0), t, 0.12 + acoustic * 0.2) *
      smoothstep(0.34, 0.02, abs(p.y + sin(p.x * 5.0 + t * 0.5) * 0.04));
    color += vec3f(0.36, 0.74, 1.0) * tube * 0.48;
    color += vec3f(0.82, 0.92, 1.0) * max(mouthA, mouthB) * 0.58;
    color += u.palette3.rgb * max(ringA, ringB) * (0.24 + acoustic * 0.46);
    color += vec3f(1.0, 0.9, 0.42) * levitatedDust * 0.5;
  } else if (sceneGroup == 13.0) {
    color = mix(color, vec3f(0.025, 0.055, 0.035), 0.58);
    let energy = stripe(p.y * 5.2 + sin(p.x * 4.8 + t * 0.12) * 0.48, 0.026) *
      smoothstep(1.0, 0.08, length(p * vec2f(0.85, 1.15)));
    let bondA = capsuleLine(p, vec2f(-0.56, 0.18), vec2f(-0.24, -0.08), 0.035);
    let bondB = capsuleLine(p, vec2f(-0.24, -0.08), vec2f(0.08, 0.14), 0.035);
    let bondC = capsuleLine(p, vec2f(0.08, 0.14), vec2f(0.38, -0.1), 0.035);
    let bondD = capsuleLine(p, vec2f(0.38, -0.1), vec2f(0.62, 0.18), 0.032);
    let chain = max(max(bondA, bondB), max(bondC, bondD));
    color += vec3f(0.2, 0.95, 0.42) * energy * 0.26;
    color += vec3f(0.78, 0.95, 0.86) * chain * 0.72;
    color = blendLayer(color, orb3d(p, vec2f(-0.56, 0.18), 0.09, vec3f(0.5, 0.95, 0.36), u.palette3.rgb * 0.02, 0.58));
    color = blendLayer(color, orb3d(p, vec2f(-0.24, -0.08), 0.105, vec3f(0.75, 0.95, 0.58), u.palette3.rgb * 0.02, 0.5));
    color = blendLayer(color, orb3d(p, vec2f(0.08, 0.14), 0.095, vec3f(0.98, 0.78, 0.42), u.palette3.rgb * 0.03, 0.42));
    color = blendLayer(color, orb3d(p, vec2f(0.38, -0.1), 0.1, vec3f(0.62, 0.82, 1.0), u.palette3.rgb * 0.02, 0.46));
    color = blendLayer(color, orb3d(p, vec2f(0.62, 0.18), 0.08, vec3f(0.96, 0.55, 0.74), u.palette3.rgb * 0.03, 0.5));
    color += vec3f(1.0, 0.82, 0.26) * max(max(ellipseRing(p, vec2f(-0.24, -0.08), vec2f(1.0), 0.18, 0.02),
      ellipseRing(p, vec2f(0.38, -0.1), vec2f(1.0), 0.16, 0.02)), chain * stress * 0.24) * 0.32;
  } else if (sceneGroup == 25.0 || sceneGroup == 26.0) {
    let terrain = smoothstep(0.09, 0.0, abs(p.y + 0.42 + sin(p.x * 3.0) * 0.09));
    color = mix(color, vec3f(0.04, 0.18, 0.08), (1.0 - smoothstep(-0.74, -0.1, p.y)) * 0.38);
    color += vec3f(0.18, 0.72, 0.32) * branchWeb(p + vec2f(0.12, 0.18), t) * 0.42;
    color += vec3f(0.1, 0.58, 0.95) * atomFluidRibbons(p - vec2f(0.0, 0.2), t) * 0.24;
    color += vec3f(0.78, 0.56, 0.22) * terrain * 0.46;
  } else if (sceneGroup == 28.0 || sceneGroup == 29.0 || sceneGroup == 30.0 || civicFeature > 0.18) {
    color = vec3f(0.035, 0.048, 0.058);
    let roadA = capsuleLine(p, vec2f(-0.86, -0.18), vec2f(0.84, 0.24), 0.026);
    let roadB = capsuleLine(p, vec2f(-0.5, 0.58), vec2f(0.44, -0.54), 0.023);
    let pressure = smoothstep(0.86, 0.06, length((p - vec2f(0.18, 0.05)) * vec2f(0.9, 1.2)));
    let parcelA = rectMask(p, vec2f(-0.54, 0.24), vec2f(0.18, 0.16));
    let parcelB = rectMask(p, vec2f(-0.12, 0.16), vec2f(0.17, 0.14));
    let parcelC = rectMask(p, vec2f(0.32, 0.22), vec2f(0.2, 0.15));
    let parcelD = rectMask(p, vec2f(-0.38, -0.3), vec2f(0.2, 0.15));
    let parcelE = rectMask(p, vec2f(0.14, -0.28), vec2f(0.18, 0.16));
    let parcels = max(max(parcelA, parcelB), max(max(parcelC, parcelD), parcelE));
    let agents = max(max(diskMask(p, vec2f(-0.2, -0.02), 0.035), diskMask(p, vec2f(0.46, -0.12), 0.035)),
      max(diskMask(p, vec2f(-0.62, -0.05), 0.035), diskMask(p, vec2f(0.08, 0.42), 0.035)));
    color += vec3f(0.08, 0.16, 0.22) * parcels * 0.74;
    color += vec3f(0.95, 0.2, 0.16) * pressure * parcels * 0.36;
    color += vec3f(0.2, 0.58, 1.0) * max(roadA, roadB) * 0.58;
    color += vec3f(1.0, 0.78, 0.18) * agents * 0.86;
    color += vec3f(0.92, 0.22, 0.18) * atomFeedbackArcs(p * vec2f(1.2, 0.9), t) * networkLocal * 0.22;
  } else if (sceneGroup == 31.0 || hazardFeature > 0.18) {
    let front = smoothstep(0.05, 0.0, abs(p.y - sin(p.x * 3.2 + t * 0.2) * 0.22));
    let exposure = stripe(length(p - vec2f(-0.22, -0.1)) * 5.2 - t * 0.24, 0.035);
    color = mix(color, vec3f(0.18, 0.05, 0.035), 0.28);
    color += vec3f(1.0, 0.22, 0.05) * front * 0.48;
    color += vec3f(0.2, 0.72, 1.0) * exposure * 0.3;
    color += vec3f(0.02, 0.02, 0.025) * starParticleField(p, t, 0.18) * 0.34;
  } else if (sceneGroup == 17.0 || robot > 0.34 || robotFeature > 0.18) {
    let base = panel3d(p, vec2f(0.0, -0.04), vec2f(0.82, 0.56), vec3f(0.055, 0.065, 0.075), u.palette1.rgb);
    let conveyor = panel3d(p, vec2f(0.02, -0.52), vec2f(0.86, 0.11), vec3f(0.09, 0.1, 0.11), u.palette3.rgb);
    color = blendLayer(color, base);
    color = blendLayer(color, conveyor);
    color += vec3f(0.9, 0.95, 1.0) * capsuleLine(p, vec2f(-0.5, 0.24), vec2f(0.04, -0.02), 0.058) * 0.54;
    color += vec3f(0.9, 0.95, 1.0) * capsuleLine(p, vec2f(0.04, -0.02), vec2f(0.52, 0.18 + sin(t) * 0.04), 0.048) * 0.56;
    color += u.palette3.rgb * diskMask(p, vec2f(0.56, 0.18 + sin(t) * 0.04), 0.085) * 0.58;
    color += vec3f(1.0, 0.46, 0.16) * max(rectMask(p, vec2f(-0.42, -0.5), vec2f(0.11, 0.075)), rectMask(p, vec2f(0.34, -0.49), vec2f(0.13, 0.085))) * 0.52;
  } else if (sceneGroup == 33.0) {
    color = mix(color, vec3f(0.085, 0.035, 0.02), 0.54);
    let fuelBed = panel3d(p, vec2f(0.0, -0.58), vec2f(0.84, 0.12), vec3f(0.16, 0.06, 0.025), vec3f(1.0, 0.18, 0.04));
    let flameA = atomThermalPlume(p * vec2f(0.84, 1.1) + vec2f(-0.18 + sin(t * 0.42) * 0.08, -0.18), t);
    let flameB = atomThermalPlume(p * vec2f(1.05, 0.96) + vec2f(0.18 + cos(t * 0.37) * 0.08, -0.1), t + 1.7);
    let smoke = stripe(p.y * 5.5 + sin(p.x * 4.2 + t * 0.18) * 0.75 - t * 0.16, 0.03) *
      smoothstep(-0.18, 0.82, p.y);
    let embers = starParticleField(p + vec2f(0.0, t * 0.1), t, 0.14 + thermal * 0.2);
    color = blendLayer(color, fuelBed);
    color += vec3f(1.0, 0.18, 0.035) * max(flameA, flameB) * (0.52 + heat * 0.42);
    color += vec3f(1.0, 0.68, 0.14) * embers * 0.42;
    color = mix(color, vec3f(0.025, 0.027, 0.032), smoke * 0.3);
  } else if (sceneGroup == 19.0 || quantum > 0.3 || quantumFeature > 0.18) {
    color = blendLayer(color, panel3d(p, vec2f(0.0, -0.02), vec2f(0.72, 0.42), vec3f(0.1, 0.08, 0.22), u.palette1.rgb));
    color += u.palette3.rgb * atomQuantumFringes(p, t) * (0.4 + bloom * 0.26);
    color += u.palette1.rgb * ellipseRing(p, vec2f(-0.2, 0.02), vec2f(1.4, 0.82), 0.36, 0.025) * 0.52;
    color += vec3f(1.0, 0.65, 0.95) * exp(-abs(rot(p, -0.26).y) * 64.0) * 0.28;
  } else if (sceneGroup == 34.0) {
    color = mix(color, vec3f(0.96, 0.98, 1.0), 0.32);
    let filmBody = smoothstep(0.78, 0.08, length((p - vec2f(0.02, -0.02)) * vec2f(0.68, 1.04)));
    let wireA = ellipseRing(p, vec2f(-0.28, 0.02), vec2f(0.82, 1.28), 0.42, 0.034);
    let wireB = ellipseRing(p, vec2f(0.38, -0.1), vec2f(1.14, 0.82), 0.34, 0.028);
    let phaseField = p.x * 9.0 + p.y * 6.0 + sin(p.y * 8.0 + t * 0.38) * 1.2 + t * 0.12;
    let band = 0.5 + 0.5 * sin(phaseField);
    let spectral = vec3f(
      0.58 + 0.42 * sin(phaseField + 0.0),
      0.58 + 0.42 * sin(phaseField + 2.09),
      0.58 + 0.42 * sin(phaseField + 4.18)
    );
    let bubbleA = ellipseRing(p, vec2f(-0.36, -0.18 + sin(t * 0.48) * 0.04), vec2f(1.0, 1.0), 0.13, 0.026);
    let bubbleB = ellipseRing(p, vec2f(0.22, 0.2 + cos(t * 0.42) * 0.04), vec2f(0.86, 1.18), 0.1, 0.023);
    let caustic = exp(-abs(rot(p, 0.32).y) * 46.0) * smoothstep(-0.7, 0.7, p.x);
    color = mix(color, spectral, filmBody * (0.34 + optical * 0.38 + phase * 0.24));
    color += vec3f(0.08, 0.1, 0.14) * max(wireA, wireB) * 0.86;
    color += vec3f(1.0, 0.96, 0.82) * caustic * 0.22;
    color += u.palette3.rgb * max(bubbleA, bubbleB) * (0.42 + band * 0.18);
  } else if (sceneGroup == 35.0) {
    color = mix(color, vec3f(0.06, 0.065, 0.07), 0.38);
    let tray = panel3d(p, vec2f(0.0, -0.1), vec2f(0.82, 0.48), vec3f(0.12, 0.13, 0.14), u.palette1.rgb);
    let wellA = orb3d(p, vec2f(-0.44, 0.0), 0.13, u.palette1.rgb * 0.7, u.palette3.rgb * 0.03, 0.36);
    let wellB = orb3d(p, vec2f(0.0, 0.02), 0.11, u.palette3.rgb * 0.68, u.palette1.rgb * 0.03, 0.42);
    let wellC = orb3d(p, vec2f(0.44, -0.02), 0.12, u.palette0.rgb * 0.76, u.palette3.rgb * 0.02, 0.5);
    color = blendLayer(color, tray);
    color = blendLayer(color, wellA);
    color = blendLayer(color, wellB);
    color = blendLayer(color, wellC);
    color += vec3f(0.82, 0.92, 1.0) * atomMeasurementBands(p, t) * 0.18;
    color += u.palette3.rgb * atomPhaseBoundary(p, t) * phase * 0.24;
  } else if (sceneGroup == 36.0) {
    color = mix(color, vec3f(0.16, 0.11, 0.07), 0.42);
    let artifact = panel3d(p, vec2f(0.0, -0.04), vec2f(0.66, 0.42), vec3f(0.26, 0.18, 0.1), u.palette1.rgb);
    let glaze = atomOpticalCaustics(p * vec2f(0.9, 1.2), t * 0.18) * artifact.a;
    let cracks = atomStressCracks(p * vec2f(1.15, 0.85), t * 0.22) * artifact.a;
    let humidity = atomFluidRibbons(p + vec2f(0.0, t * 0.04), t * 0.22) * smoothstep(0.88, 0.12, length(p));
    color = blendLayer(color, artifact);
    color += u.palette1.rgb * glaze * 0.2;
    color += vec3f(0.08, 0.07, 0.06) * cracks * 0.58;
    color += u.palette3.rgb * humidity * 0.14;
  } else if (sceneGroup == 5.0 || optical > 0.34) {
    color = mix(color, vec3f(0.02, 0.035, 0.065), 0.38);
    color = blendLayer(color, orb3d(p, vec2f(0.08, -0.02), 0.28, vec3f(0.72, 0.88, 1.0), u.palette3.rgb * 0.03, 0.12));
    color += vec3f(1.0, 0.96, 0.78) * exp(-abs(rot(p, 0.17).y) * 70.0) * 0.46;
    color += u.palette3.rgb * ellipseRing(rot(p - vec2f(0.12, -0.02), 0.28), vec2f(0.0), vec2f(1.0, 1.8), 0.48, 0.03) * 0.44;
  } else if (sceneGroup == 8.0 || chemical > 0.32 || (fluid > 0.56 && instrument > 0.16)) {
    color = mix(color, vec3f(0.012, 0.115, 0.13), 0.46);
    let channel = max(capsuleLine(p, vec2f(-0.78, -0.08), vec2f(0.78, -0.08), 0.07),
      capsuleLine(p, vec2f(-0.2, -0.54), vec2f(0.36, 0.48), 0.055));
    color += vec3f(0.18, 0.98, 0.88) * channel * (0.28 + fluid * 0.42);
    color = blendLayer(color, orb3d(p, vec2f(-0.34, -0.08), 0.095, u.palette1.rgb * 0.76, u.palette3.rgb * 0.04, 0.18));
    color = blendLayer(color, orb3d(p, vec2f(0.16, -0.08), 0.085, u.palette3.rgb * 0.72, u.palette1.rgb * 0.03, 0.22));
    color += u.palette3.rgb * stripe(length(p - vec2f(0.18, -0.08)) * 8.0 + t * 0.18, 0.028) * smoothstep(0.66, 0.08, length(p - vec2f(0.18, -0.08))) * 0.34;
  } else if (sceneGroup == 2.0 || (fluid > 0.52 && granular > 0.24)) {
    color = mix(color, vec3f(0.055, 0.095, 0.065), 0.36);
    let valley = smoothstep(0.08, 0.0, abs(p.y + 0.1 + sin(p.x * 3.4 + t * 0.08) * 0.16));
    let ridge = max(stripe(p.y * 7.0 + sin(p.x * 3.0) * 0.2, 0.035), stripe((p.x - p.y) * 4.0, 0.03));
    let sediment = smoothstep(0.44, 0.03, length((p - vec2f(0.42, -0.34)) * vec2f(1.2, 0.72)));
    color += vec3f(0.05, 0.55, 0.95) * valley * (0.32 + flow * 0.3);
    color += vec3f(0.44, 0.32, 0.14) * ridge * max(granular, 0.28) * 0.08;
    color += vec3f(0.76, 0.52, 0.22) * sediment * max(granular, 0.18) * 0.36;
  } else if (sceneGroup == 21.0) {
    let bowlLip = exp(-abs(p.y - (0.48 * p.x * p.x - 0.44)) * 26.0);
    let bowlDeck = smoothstep(0.06, 0.0, abs(p.y + 0.52 - abs(p.x) * 0.06)) * smoothstep(0.95, 0.1, abs(p.x));
    let riderCenter = vec2f(sin(t * 0.64) * 0.48, -0.17 + cos(t * 0.64) * 0.18);
    let path = ellipseRing((p - vec2f(0.0, -0.2)), vec2f(0.0), vec2f(1.0, 1.72), 0.46, 0.026);
    let board = capsuleLine(rot(p - riderCenter, sin(t * 0.64) * 0.42), vec2f(-0.16, 0.0), vec2f(0.16, 0.0), 0.035);
    let rider = diskMask(p, riderCenter + vec2f(0.0, 0.12), 0.07);
    let wheelA = diskMask(rot(p - riderCenter, sin(t * 0.64) * 0.42), vec2f(-0.14, -0.035), 0.026);
    let wheelB = diskMask(rot(p - riderCenter, sin(t * 0.64) * 0.42), vec2f(0.14, -0.035), 0.026);
    let skid = stripe((p.x + p.y) * 9.0 - t * 0.72, 0.02) * smoothstep(0.34, 0.03, length(p - riderCenter));
    color = mix(color, vec3f(0.055, 0.065, 0.075), 0.42);
    color += vec3f(0.62, 0.68, 0.76) * max(bowlLip, bowlDeck) * 0.66;
    color += u.palette1.rgb * path * (0.28 + motion * 0.34);
    color += vec3f(1.0, 0.8, 0.24) * skid * (0.16 + max(stress, constraint) * 0.42);
    color += vec3f(0.08, 0.09, 0.1) * board * 0.78;
    color += u.palette3.rgb * max(wheelA, wheelB) * 0.76;
    color += vec3f(0.95, 0.98, 1.0) * rider * 0.62;
    color += vec3f(0.3, 0.72, 1.0) * atomFeedbackArcs(p - riderCenter, t) * max(motion, 0.28) * 0.18;
  } else if (sceneGroup == 22.0 || granular > 0.34) {
    color = mix(color, vec3f(0.14, 0.09, 0.045), 0.42);
    let walls = max(rectMask(p, vec2f(-0.55, 0.02), vec2f(0.04, 0.68)), rectMask(p, vec2f(0.55, 0.02), vec2f(0.04, 0.68)));
    let pile = smoothstep(0.1, 0.0, abs(p.y + 0.56 - abs(p.x) * 0.36)) * smoothstep(0.8, 0.03, abs(p.x));
    color += vec3f(0.64, 0.46, 0.22) * max(walls, pile) * 0.7;
    color += vec3f(1.0, 0.62, 0.18) * starParticleField(p + vec2f(0.0, t * 0.04), t, 0.12 + density * 0.16) * 0.28;
  } else if (sceneGroup == 11.0 || sceneGroup == 16.0 || networkLocal > 0.34 || gridFeature > 0.18) {
    let rackA = panel3d(p, vec2f(-0.45, 0.03), vec2f(0.22, 0.46), vec3f(0.05, 0.08, 0.12), u.palette1.rgb);
    let rackB = panel3d(p, vec2f(0.08, -0.02), vec2f(0.2, 0.4), vec3f(0.06, 0.075, 0.1), u.palette3.rgb);
    let rackC = panel3d(p, vec2f(0.52, 0.08), vec2f(0.18, 0.34), vec3f(0.07, 0.08, 0.1), u.palette1.rgb);
    let rackMask = max(max(rackA.a, rackB.a), rackC.a);
    color = blendLayer(color, rackA);
    color = blendLayer(color, rackB);
    color = blendLayer(color, rackC);
    let bus = max(capsuleLine(p, vec2f(-0.72, -0.48), vec2f(0.72, 0.34), 0.035), capsuleLine(p, vec2f(-0.68, 0.44), vec2f(0.78, -0.28), 0.028));
    let pulse = stripe((p.x + p.y) * 5.0 - t * (0.7 + motion), 0.042);
    let aisleFlow = max(
      stripe(p.y * 5.0 + sin(p.x * 2.5 + t * 0.9) * 0.18 - t * (0.82 + motion * 0.36), 0.044) * smoothstep(0.88, 0.08, abs(p.x)),
      stripe(p.x * 6.0 + p.y * 2.0 - t * (1.05 + motion * 0.28), 0.034) * smoothstep(0.74, 0.02, abs(p.y + 0.08))
    );
    let ledScan = stripe(p.y * 10.0 - t * (1.35 + motion), 0.038) * rackMask;
    let heatWash = atomThermalPlume(p * vec2f(0.72, 1.0) + vec2f(sin(t * 0.38) * 0.12, -0.12), t);
    color += u.palette1.rgb * bus * (0.3 + pulse * 0.52);
    color += vec3f(0.18, 0.78, 1.0) * aisleFlow * (0.22 + networkLocal * 0.42 + feedback * 0.24);
    color += vec3f(1.0, 0.28, 0.06) * heatWash * thermal * 0.36;
    color += vec3f(0.72, 1.0, 0.92) * ledScan * (0.22 + signal * 0.38);
    color += u.palette3.rgb * atomFeedbackArcs(p, t) * max(feedback, 0.28) * 0.62;
  } else if (sceneGroup == 0.0 || sceneGroup == 1.0 || thermal > 0.35 || phase > 0.32) {
    let basin = panel3d(p, vec2f(0.0, -0.55), vec2f(0.86, 0.2), vec3f(0.18, 0.05, 0.025), vec3f(1.0, 0.28, 0.04));
    color = blendLayer(color, basin);
    color += vec3f(1.0, 0.24, 0.05) * atomThermalPlume(p, t) * (0.45 + heat * 0.44);
    color += u.palette3.rgb * starParticleField(p + vec2f(0.0, t * 0.03), t, 0.08 + thermal * 0.2) * 0.38;
    color = blendLayer(color, orb3d(p, vec2f(-0.48, 0.28), 0.08, u.palette0.rgb, vec3f(1.0, 0.22, 0.05) * phase * 0.18, 0.22));
  } else if (sceneGroup == 7.0 || sceneGroup == 13.0 || sceneGroup == 14.0 || bio > 0.32 || agroFeature > 0.18) {
    color = blendLayer(color, orb3d(p, vec2f(-0.32, 0.02), 0.24, u.palette1.rgb * 0.75, u.palette3.rgb * 0.03, 0.72));
    color = blendLayer(color, orb3d(p, vec2f(0.22, -0.04), 0.18, u.palette3.rgb * 0.68, u.palette1.rgb * 0.02, 0.68));
    color += vec3f(0.28, 0.9, 0.42) * branchWeb(p, t) * 0.36;
    color += u.palette0.rgb * capsuleLine(p, vec2f(-0.68, -0.42), vec2f(0.64, 0.34), 0.028) * 0.24;
  } else if (sceneGroup == 8.0 || chemical > 0.32) {
    color = blendLayer(color, orb3d(p, vec2f(0.0, -0.02), 0.36, u.palette1.rgb * 0.52, u.palette3.rgb * 0.04, 0.18));
    color += u.palette3.rgb * stripe(length(p) * 7.0 + t * 0.18, 0.028) * smoothstep(0.72, 0.12, length(p)) * 0.38;
    color += u.palette0.rgb * capsuleLine(p, vec2f(-0.38, 0.46), vec2f(0.38, 0.46), 0.045) * 0.38;
  } else {
    let shaft = capsuleLine(p, vec2f(-0.72, -0.18), vec2f(0.64, 0.18), 0.075);
    let rotor = ellipseRing(p, vec2f(0.2, 0.04), vec2f(1.0, 1.0), 0.28, 0.035);
    color += u.palette1.rgb * shaft * 0.4;
    color += u.palette3.rgb * rotor * (0.32 + motion * 0.22);
    color = blendLayer(color, orb3d(p, vec2f(-0.42, -0.12), 0.14, u.palette0.rgb * 0.72, u.palette3.rgb * 0.02, 0.26));
  }

  color += vec3f(1.0, 0.96, 0.9) * optical * exp(-abs(rot(p, 0.2 + variant * 0.4).y) * 62.0) * 0.22 * commonOverlay;
  color += vec3f(0.45, 0.75, 1.0) * acoustic * stripe(length(p) * (7.0 + density * 3.0) - t * 0.46, 0.023) * 0.16 * commonOverlay;
  color += vec3f(0.7, 0.85, 1.0) * em * stripe(atan2(p.y, p.x) * 3.5 + length(p) * 2.2 - t * 0.15, 0.028) * 0.18 * commonOverlay;
  color += vec3f(0.9, 0.7, 0.42) * granular * perspectiveFloor(p + vec2f(0.0, 0.15), t) * 0.12 * commonOverlay;
  color += vec3f(0.95, 0.76, 0.38) * gridFeature * atomFeedbackArcs(p, t) * 0.28 * commonOverlay;
  color += vec3f(0.9, 0.94, 1.0) * max(robot, robotFeature) * capsuleLine(p, vec2f(-0.42, 0.2), vec2f(0.46, -0.08 + sin(t) * 0.05), 0.046) * 0.34 * commonOverlay;
  color += vec3f(0.72, 0.82, 0.94) * factoryFeature * panel3d(p, vec2f(0.38, -0.38), vec2f(0.38, 0.1), vec3f(0.13, 0.14, 0.15), u.palette1.rgb).w * 0.32 * commonOverlay;
  color += vec3f(0.42, 1.0, 0.48) * agroFeature * branchWeb(p + vec2f(0.08, 0.12), t) * 0.18 * commonOverlay;
  color += vec3f(0.22, 0.9, 1.0) * particleFeature * ellipseRing(p, vec2f(0.0), vec2f(1.0, 1.0), 0.56, 0.022) * 0.16;
  color += vec3f(1.0, 0.68, 0.18) * civicFeature * max(stripe(p.x * 5.5, 0.022), stripe(p.y * 4.5, 0.022)) * 0.04;
  color += vec3f(1.0, 0.22, 0.06) * hazardFeature * stripe(length(p) * 5.8 - t * 0.3, 0.03) * 0.16 * commonOverlay;
  color += vec3f(0.14, 0.9, 1.0) * max(instrument, signal) * panel3d(p, vec2f(0.0, 0.58), vec2f(0.82, 0.1), vec3f(0.02, 0.06, 0.09), u.palette3.rgb).w * 0.36 * commonOverlay;
  color = mix(color, color * (0.86 + fog * 0.08) + u.palette0.rgb * 0.04, 0.32);
  return color;
}

fn branchWeb(p: vec2f, t: f32) -> f32 {
  let trunk = capsuleLine(p, vec2f(-0.72, -0.48), vec2f(0.18, 0.24), 0.028);
  let a = capsuleLine(p, vec2f(-0.18, -0.06), vec2f(0.55, 0.38), 0.02);
  let b = capsuleLine(p, vec2f(-0.04, 0.1), vec2f(0.48, -0.34), 0.018);
  let vein = exp(-abs(sin(p.x * 9.0 + p.y * 5.0 + t * 0.12)) * 5.5) * smoothstep(0.88, 0.1, length(p));
  return max(max(trunk, a), max(b, vein * 0.42));
}

fn atomStructuralScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  let sceneGroup = floor(u.viewport.w);
  let thermal = max(atomAt(0), atomAt(14));
  let fluid = atomAt(1);
  let stress = atomAt(2);
  let feedback = atomAt(3);
  let orbit = atomAt(4);
  let em = atomAt(5);
  let optical = atomAt(6);
  let quantum = atomAt(7);
  let acoustic = atomAt(8);
  let bio = atomAt(9);
  let chemical = atomAt(10);
  let network = atomAt(11);
  let granular = atomAt(12);
  let instrument = max(atomAt(13), atomAt(17));
  let phase = atomAt(15);
  let robot = atomAt(16);
  let measurement = atomAt(17);
  let motion = atomAt(18);
  let density = atomAt(19);
  let signal = atomAt(22);
  let surface = atomAt(23);
  let specific = max(max(max(robot, quantum), max(chemical, granular)), max(max(network, optical), max(bio, orbit)));
  let literalScene = 0.0;
  let thermalLocal = thermal * (1.0 - clamp(specific * 0.62, 0.0, 0.78));
  let networkLocal = network * (1.0 - clamp(max(max(robot, chemical), max(granular, fluid)) * 0.76, 0.0, 0.9));
  let microfluidic = clamp(max(chemical, instrument), 0.0, 1.0);
  let terrainFluid = clamp(fluid * max(granular, surface), 0.0, 1.0);
  let bioFluid = clamp(fluid * max(bio, 0.32), 0.0, 1.0);
  let fermentationCue = clamp(max(featureAt(11), featureAt(12)) * max(min(bio, chemical), 0.28) * max(max(fluid, density), 0.24), 0.0, 1.0);
  let fluidLocal = fluid * (1.0 - clamp(max(max(robot, networkLocal), terrainFluid) * 0.28, 0.0, 0.45));
  let total = clamp(thermal + fluid + stress + feedback + orbit + em + optical + quantum +
    acoustic + bio + chemical + network + granular + instrument + phase + robot, 0.0, 3.0) / 3.0;
  var color = base * (0.28 + (1.0 - specific) * 0.16) + u.palette2.rgb * (0.14 + specific * 0.16);
  color = mix(color, vec3f(0.015, 0.12, 0.16), clamp(max(fluid, chemical) * 0.46, 0.0, 0.58));
  color = mix(color, vec3f(0.16, 0.11, 0.055), clamp(granular * 0.5, 0.0, 0.6));
  color = mix(color, vec3f(0.045, 0.06, 0.075), clamp(robot * 0.48, 0.0, 0.58));
  color = mix(color, vec3f(0.035, 0.055, 0.1), clamp(networkLocal * 0.34, 0.0, 0.46));
  color = mix(color, vec3f(0.015, 0.025, 0.065), clamp(max(orbit, quantum) * 0.45, 0.0, 0.58));
  let floorBand = smoothstep(0.06, 0.0, abs(p.y + 0.58));
  let thermalBasin = smoothstep(0.5, 0.0, abs(p.y + 0.52)) * smoothstep(0.82, 0.05, abs(p.x));
  color += vec3f(1.0, 0.2, 0.04) * thermalLocal * thermalBasin * (0.3 + atomThermalPlume(p, t) * 0.7);
  color += vec3f(1.0, 0.78, 0.24) * phase * floorBand * stripe(p.x * 5.0 + t * 0.1, 0.035) * 0.62;
  let tubeA = capsuleLine(p, vec2f(-0.9, -0.35), vec2f(0.78, 0.28), 0.055);
  let tubeB = capsuleLine(p, vec2f(-0.72, 0.42), vec2f(0.72, -0.18), 0.04);
  let channelCross = max(
    capsuleLine(p, vec2f(-0.82, -0.02), vec2f(0.82, -0.02), 0.042),
    capsuleLine(p, vec2f(-0.18, -0.54), vec2f(0.38, 0.48), 0.036)
  );
  let dropletTrain = max(max(
    diskMask(p, vec2f(-0.42 + sin(t * 0.55) * 0.04, -0.02), 0.075),
    diskMask(p, vec2f(0.04 + sin(t * 0.45) * 0.04, -0.02), 0.064)),
    diskMask(p, vec2f(0.46 + sin(t * 0.52) * 0.04, -0.02), 0.07));
  color += vec3f(0.0, 0.55, 1.0) * fluidLocal * max(tubeA, tubeB) * (0.12 + microfluidic * 0.42) * (0.34 + atomFluidRibbons(p, t) * 0.28);
  color = mix(color, vec3f(0.02, 0.26, 0.32), max(fluid, chemical) * microfluidic * channelCross * 0.44);
  color += vec3f(0.35, 1.0, 0.84) * max(fluid, chemical) * microfluidic * dropletTrain * 0.58;
  let riverPath = smoothstep(0.065, 0.0, abs(p.y + 0.08 + sin(p.x * 3.2 + t * 0.08) * 0.15));
  let sedimentFan = smoothstep(0.5, 0.04, length((p - vec2f(0.46, -0.36)) * vec2f(1.2, 0.7)));
  let airflow = atomFluidRibbons(p + vec2f(0.0, sin(t * 0.2) * 0.05), t);
  color += vec3f(0.05, 0.5, 0.95) * terrainFluid * riverPath * 0.58;
  color += vec3f(0.72, 0.5, 0.2) * terrainFluid * sedimentFan * 0.32;
  color += vec3f(0.58, 0.86, 1.0) * bioFluid * airflow * 0.24;
  let slab = rectMask(p, vec2f(0.0, -0.08), vec2f(0.72, 0.26));
  color = mix(color, vec3f(0.32, 0.34, 0.38), stress * slab * 0.62);
  color += vec3f(1.0, 0.86, 0.2) * stress * atomStressCracks(p, t) * 0.72;
  let graph = atomNetworkPressure(p, t);
  color += vec3f(0.16, 0.48, 1.0) * networkLocal * graph * 0.78;
  let parcelFlow = fract(t * 0.42);
  let movingParcelA = vec2f(-0.76 + parcelFlow * 1.52, -0.28 + sin(t * 0.7) * 0.025);
  let movingParcelB = vec2f(-0.32 + fract(parcelFlow + 0.34) * 1.28, 0.2 + cos(t * 0.62) * 0.02);
  let movingParcelC = vec2f(-0.64 + fract(parcelFlow + 0.68) * 1.42, -0.46);
  let parcelA = rectMask(p, movingParcelA, vec2f(0.12, 0.09));
  let parcelB = rectMask(p, movingParcelB, vec2f(0.11, 0.08));
  let parcelC = rectMask(p, movingParcelC, vec2f(0.14, 0.1));
  let parcelRoad = max(capsuleLine(p, vec2f(-0.82, -0.28), vec2f(0.78, 0.24), 0.026),
    capsuleLine(p, vec2f(-0.62, 0.34), vec2f(0.66, -0.18), 0.023));
  color += vec3f(0.05, 0.38, 0.92) * networkLocal * parcelRoad * 0.62;
  color += vec3f(1.0, 0.28, 0.16) * networkLocal * max(max(parcelA, parcelB), parcelC) * 0.38;
  color += vec3f(0.0, 0.95, 1.0) * feedback * atomFeedbackArcs(p, t) * 0.72;
  let well = stripe(length(p) * 4.5 - t * 0.08, 0.025);
  color = mix(color, vec3f(0.02, 0.04, 0.12), orbit * smoothstep(1.0, 0.15, length(p)) * 0.66);
  color += vec3f(0.85, 0.92, 1.0) * orbit * well * 0.58;
  color += vec3f(1.0, 0.2, 0.82) * em * stripe(atan2(p.y, p.x) * 3.0 + length(p) * 2.0, 0.035) * 0.52;
  color += vec3f(0.7, 0.9, 1.0) * optical * exp(-abs(rot(p, -0.24).y) * 56.0) * 0.82;
  let prism = rectMask(rot(p - vec2f(0.24, -0.04), 0.55), vec2f(0.0), vec2f(0.17, 0.26));
  color += vec3f(1.0, 0.92, 0.35) * optical * prism * 0.52;
  let chip = rectMask(p, vec2f(0.0, 0.0), vec2f(0.58, 0.34));
  color = mix(color, vec3f(0.18, 0.11, 0.35), quantum * chip * 0.76);
  color += vec3f(0.6, 0.95, 1.0) * quantum * atomQuantumFringes(p, t) * 0.7;
  let waveCenter = vec2f(-0.18 + sin(t * 0.34) * 0.22, 0.04 + cos(t * 0.27) * 0.12);
  let acousticBands = stripe(length(p - waveCenter) * 7.5 - t * 1.18, 0.032);
  color += vec3f(0.4, 0.78, 1.0) * acoustic * acousticBands * 0.82;
  let branch = exp(-abs(sin(p.x * 7.0 + p.y * 4.0 + t * 0.88)) * 4.0) * smoothstep(0.88, 0.08, length(p));
  let bioPulse = diskMask(p, vec2f(sin(t * 0.82) * 0.42, cos(t * 0.66) * 0.28), 0.16) * (0.45 + 0.55 * sin(t * 2.2) * sin(t * 2.2));
  let cellSwarm = max(max(
    diskMask(p, vec2f(-0.54 + fract(t * 0.18) * 1.08, -0.16 + sin(t * 0.72) * 0.1), 0.09),
    diskMask(p, vec2f(0.36 - fract(t * 0.15) * 0.86, 0.18 + cos(t * 0.64) * 0.12), 0.075)),
    diskMask(p, vec2f(sin(t * 0.48) * 0.5, -0.34 + cos(t * 0.51) * 0.08), 0.08));
  color += vec3f(0.26, 0.9, 0.36) * bio * branch * 0.64;
  color += vec3f(0.58, 1.0, 0.36) * bio * bioPulse * 0.48;
  color += vec3f(0.9, 1.0, 0.52) * bio * cellSwarm * 0.62;
  let vessel = diskMask(p, vec2f(0.12, 0.0), 0.48) * (1.0 - diskMask(p, vec2f(0.12, 0.0), 0.31));
  let reactionFront = stripe(length(p - vec2f(0.12, 0.0)) * 6.0 + t * 0.18, 0.026);
  let reagentPool = diskMask(p, vec2f(0.16, -0.04), 0.36);
  color = mix(color, vec3f(0.03, 0.22, 0.24), chemical * reagentPool * 0.34);
  color += vec3f(0.82, 0.4, 1.0) * chemical * vessel * 0.46;
  color += vec3f(0.95, 0.55, 0.18) * chemical * reactionFront * 0.52;
  let doughBody = smoothstep(0.68, 0.04, length((p - vec2f(0.02, -0.06)) * vec2f(0.82, 1.22)));
  let glutenWeb = exp(-abs(sin(p.x * 9.0 + p.y * 5.2 + sin(t * 0.22 + p.y * 4.0) * 0.7)) * 4.6) * doughBody;
  let bubbleA = diskMask(p, vec2f(-0.32 + sin(t * 0.42) * 0.05, -0.05 + cos(t * 0.37) * 0.04), 0.1 + 0.025 * sin(t * 0.8) * sin(t * 0.8));
  let bubbleB = diskMask(p, vec2f(0.2 + sin(t * 0.36) * 0.04, 0.16 + cos(t * 0.41) * 0.05), 0.075 + 0.02 * sin(t * 0.66) * sin(t * 0.66));
  let bubbleC = diskMask(p, vec2f(0.38 + sin(t * 0.31) * 0.04, -0.24 + cos(t * 0.48) * 0.035), 0.085 + 0.018 * sin(t * 0.72) * sin(t * 0.72));
  let gasPockets = max(max(bubbleA, bubbleB), bubbleC) * doughBody;
  let acidityBands = stripe((p.x + p.y * 0.72) * 5.4 - t * (0.18 + motion * 0.36), 0.025) * doughBody;
  color = mix(color, vec3f(0.34, 0.22, 0.13), fermentationCue * doughBody * 0.42);
  color += vec3f(0.82, 0.54, 0.28) * fermentationCue * doughBody * 0.2;
  color += vec3f(0.96, 0.82, 0.46) * fermentationCue * glutenWeb * 0.42;
  color += vec3f(0.7, 0.96, 0.86) * fermentationCue * gasPockets * 0.62;
  color += vec3f(1.0, 0.42, 0.72) * fermentationCue * acidityBands * 0.38;
  let strata = max(stripe(p.y * 9.0 + sin(p.x * 4.0) * 0.12, 0.04), stripe((p.x - p.y) * 4.0, 0.03));
  let siloWalls = max(rectMask(p, vec2f(-0.54, 0.05), vec2f(0.035, 0.66)),
    rectMask(p, vec2f(0.54, 0.05), vec2f(0.035, 0.66)));
  let grainPile = smoothstep(0.08, 0.0, abs(p.y + 0.58 - abs(p.x) * 0.34)) * smoothstep(0.78, 0.04, abs(p.x));
  let dustBloom = smoothstep(0.86, 0.12, length(p - vec2f(0.04, 0.18))) *
    (0.45 + 0.55 * stripe(atan2(p.y - 0.18, p.x - 0.04) * 5.0 + t * 0.2, 0.035));
  let granularMask = clamp(max(max(siloWalls, grainPile), dustBloom * 0.46), 0.0, 1.0);
  color += vec3f(0.74, 0.52, 0.24) * granular * strata * granularMask * 0.34;
  color += vec3f(0.52, 0.38, 0.18) * granular * max(siloWalls, grainPile) * 0.76;
  color += vec3f(1.0, 0.66, 0.22) * granular * dustBloom * 0.34;
  color += vec3f(0.9, 0.78, 0.48) * surface * (1.0 - clamp(granular * 0.72, 0.0, 0.86)) * stripe((p.x + p.y) * 8.0 - t * 0.12, 0.028) * 0.08;
  let armTip = vec2f(0.5, 0.18 + sin(t * 1.8) * 0.14);
  let arm = max(capsuleLine(p, vec2f(-0.42, 0.12), vec2f(0.05, -0.06), 0.06),
    capsuleLine(p, vec2f(0.05, -0.06), armTip, 0.05));
  let conveyor = rectMask(p, vec2f(0.0, -0.46), vec2f(0.86, 0.085)) *
    (0.32 + stripe(p.x * 11.0 - t * 3.0, 0.056) * 0.68);
  let workcell = max(rectMask(p, vec2f(-0.62, 0.08), vec2f(0.09, 0.34)),
    rectMask(p, vec2f(0.66, 0.08), vec2f(0.08, 0.34)));
  let sortingGate = rectMask(p, vec2f(sin(t * 0.95) * 0.42, -0.1), vec2f(0.035, 0.34));
  color += vec3f(0.78, 0.86, 0.92) * robot * arm * 0.82;
  color += vec3f(1.0, 0.64, 0.18) * robot * diskMask(p, armTip, 0.09) * 0.64;
  color += vec3f(0.13, 0.18, 0.22) * robot * conveyor * 0.82;
  color += vec3f(0.38, 0.82, 1.0) * robot * workcell * 0.42;
  color += vec3f(1.0, 0.48, 0.14) * robot * max(parcelA, parcelC) * 0.52;
  color += vec3f(0.9, 1.0, 0.36) * robot * sortingGate * 0.52;
  let panel = rectMask(p, vec2f(-0.56, 0.42), vec2f(0.22, 0.14));
  let readoutDeck = rectMask(p, vec2f(0.0, 0.58), vec2f(0.86, 0.13));
  let scan = max(stripe(p.x * 15.0 - t * 0.48, 0.035), stripe((p.x + p.y) * 9.0 + t * 0.2, 0.028));
  let sampleBeam = exp(-abs(rot(p, 0.1).y - 0.08) * 34.0) * smoothstep(-0.78, 0.78, p.x);
  color += vec3f(0.12, 0.88, 1.0) * instrument * panel * (0.62 + stripe(p.x * 16.0 - t * 0.4, 0.04) * 0.38);
  color += vec3f(0.98, 0.22, 0.78) * max(measurement, signal) * readoutDeck * (0.32 + scan * 0.52);
  color += vec3f(0.18, 0.96, 0.72) * max(instrument, signal) * sampleBeam * 0.44;
  let structuralMix = (0.34 + total * 0.26) * (1.0 - literalScene);
  return mix(base, color, clamp(structuralMix, 0.0, 0.58));
}

fn atomOperatorOverlays(p: vec2f, t: f32, base: vec3f) -> vec3f {
  let sceneGroup = floor(u.viewport.w);
  var color = base;
  let thermal = max(atomAt(0), atomAt(14));
  let fluid = atomAt(1);
  let stress = atomAt(2);
  let feedback = atomAt(3);
  let orbit = atomAt(4);
  let em = atomAt(5);
  let optical = atomAt(6);
  let quantum = atomAt(7);
  let acoustic = atomAt(8);
  let bio = atomAt(9);
  let chemical = atomAt(10);
  let network = atomAt(11);
  let granular = atomAt(12);
  let instrument = max(atomAt(13), atomAt(17));
  let measurement = atomAt(17);
  let combustion = atomAt(14);
  let phase = atomAt(15);
  let robot = atomAt(16);
  let motion = atomAt(18);
  let density = atomAt(19);
  let emission = atomAt(20);
  let constraint = atomAt(21);
  let signal = atomAt(22);`);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
