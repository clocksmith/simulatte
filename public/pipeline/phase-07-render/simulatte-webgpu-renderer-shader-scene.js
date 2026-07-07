(function attachSimulatteWebGpuRendererShaderScene(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    scope.WEBGPU_SHADER_PARTS = scope.WEBGPU_SHADER_PARTS || [];
    scope.WEBGPU_SHADER_PARTS.push(`  let surface = atomAt(23);
  let networkLocal = network * (1.0 - clamp(max(max(robot, chemical), max(granular, fluid)) * 0.76, 0.0, 0.9));
  color += vec3f(1.0, 0.32, 0.08) * thermal * atomThermalPlume(p, t) * 0.34;
  color += vec3f(0.12, 0.56, 0.92) * fluid * max(atomFluidRibbons(p, t), atomVectorFlow(p, t)) * 0.22;
  color += vec3f(1.0, 0.86, 0.24) * stress * max(atomStressCracks(p, t), atomConstraintPads(p, t)) * 0.28;
  color += vec3f(0.34, 0.9, 1.0) * feedback * max(atomFeedbackArcs(p, t), atomSignalPulses(p, t)) * 0.22;
  color += vec3f(0.95, 0.82, 1.0) * quantum * atomQuantumFringes(p, t) * 0.24;
  color += vec3f(0.92, 0.68, 0.18) * networkLocal * max(atomNetworkPressure(p, t), atomPacketPulses(p, t)) * 0.2;
  color += vec3f(0.72, 0.8, 1.0) * optical * max(atomOpticalCaustics(p, t), atomRayCones(p, t)) * 0.24;
  color += vec3f(0.7, 0.85, 1.0) * em * max(atomFluxLines(p, t), atomChargeShell(p, t)) * 0.2;
  color += vec3f(0.8, 0.9, 1.0) * acoustic * max(atomAcousticRings(p, t), atomStandingNodes(p, t)) * 0.18;
  color += vec3f(0.3, 0.86, 0.42) * bio * max(atomBiologicalBranches(p, t), atomDensityFront(p, t)) * 0.12;
  color += vec3f(0.76, 0.48, 1.0) * chemical * max(atomChemicalClouds(p, t), atomReactionFront(p, t)) * 0.08;
  color += vec3f(0.86, 0.72, 0.42) * granular * max(atomGranularStrata(p, t), atomSedimentMotion(p, t)) * 0.16;
  color += vec3f(0.1, 0.95, 1.0) * instrument * atomInstrumentReadout(p, t) * 0.28;
  let detectorHit = diskMask(p, vec2f(-0.72 + fract(t * 0.76) * 1.44, 0.28 + sin(t * 1.1) * 0.2), 0.085);
  let detectorTrack = capsuleLine(p, vec2f(-0.88, -0.22 + sin(t * 0.7) * 0.12), vec2f(0.88, 0.18 + cos(t * 0.64) * 0.16), 0.024);
  color += vec3f(0.26, 1.0, 0.95) * instrument * detectorHit * 0.78;
  color += vec3f(0.92, 1.0, 0.8) * instrument * detectorTrack * (0.32 + stripe(t * 2.0, 0.32) * 0.34);
  color += vec3f(1.0, 0.18, 0.04) * combustion * max(atomCombustionFront(p, t), atomSootColumn(p, t)) * 0.3;
  color += vec3f(0.75, 0.92, 1.0) * phase * max(atomPhaseBoundary(p, t), atomLatentHeatBand(p, t)) * 0.18;
  color += vec3f(0.9, 0.92, 0.96) * robot * max(atomRobotWorkcell(p, t), atomContactForces(p, t)) * 0.14;
  color += u.palette1.rgb * density * exp(-abs(sin(p.x * 8.0) + cos(p.y * 6.0 + t * 0.12)) * 2.4) * 0.08;
  color += u.palette3.rgb * emission * exp(-abs(rot(p, 0.72).y) * 34.0) * 0.18;
  color += vec3f(1.0, 0.92, 0.36) * constraint * atomConstraintPads(p, t) * 0.22;
  color += u.palette3.rgb * signal * max(atomSignalPulses(p, t), atomReadoutPulse(p, t)) * 0.18;
  color += u.palette1.rgb * surface * stripe(max(abs(p.x), abs(p.y)) * 5.0 + t * 0.08, 0.028) * 0.12;
  color += u.palette3.rgb * motion * stripe(length(p) * 4.8 - t * 0.62, 0.02) * 0.14;
  color += u.palette3.rgb * orbit * max(atomOrbitalTrails(p, t), atomGravityWell(p, t)) * 0.18;
  color += vec3f(0.96, 0.82, 0.46) * min(bio, fluid) * atomGlutenStrands(p, t) * 0.16;
  color += vec3f(0.7, 0.96, 0.86) * min(bio, fluid) * atomFermentationBubbles(p, t) * 0.22;
  color += vec3f(1.0, 0.42, 0.72) * min(bio, chemical) * atomAcidityGradient(p, t) * 0.18;
  color += vec3f(0.98, 0.22, 0.78) * max(measurement, signal) * atomMeasurementBands(p, t) * 0.2;
  let robotCarrier = rectMask(p, vec2f(-0.78 + fract(t * 0.72) * 1.56, -0.48), vec2f(0.12, 0.075));
  let robotCarrierUpper = rectMask(p, vec2f(-0.78 + fract(t * 0.58 + 0.24) * 1.56, 0.34), vec2f(0.16, 0.095));
  let robotConveyorUpper = rectMask(p, vec2f(0.0, 0.34), vec2f(0.94, 0.07)) *
    (0.34 + stripe(p.x * 13.0 - t * 3.4, 0.06) * 0.66);
  let robotSweep = capsuleLine(p, vec2f(-0.52, 0.12), vec2f(sin(t * 1.65) * 0.62, -0.1 + cos(t * 1.2) * 0.18), 0.032);
  color += vec3f(1.0, 0.64, 0.12) * robot * robotCarrier * 0.82;
  color += vec3f(1.0, 0.76, 0.18) * robot * robotCarrierUpper * 0.86;
  color += vec3f(0.08, 0.38, 0.9) * robot * robotConveyorUpper * 0.52;
  color += vec3f(0.82, 0.95, 1.0) * robot * robotSweep * 0.48;
  let dispatchTokenA = diskMask(p, vec2f(-0.84 + fract(t * 0.62) * 1.68, 0.18), 0.07);
  let dispatchTokenB = rectMask(p, vec2f(-0.72 + fract(t * 0.48 + 0.38) * 1.44, -0.18), vec2f(0.1, 0.075));
  let dispatchTrack = max(
    capsuleLine(p, vec2f(-0.86, 0.18), vec2f(0.86, 0.18), 0.024),
    capsuleLine(p, vec2f(-0.7, -0.18), vec2f(0.72, -0.18), 0.022)
  );
  color += vec3f(0.2, 0.74, 1.0) * networkLocal * dispatchTrack * 0.46;
  color += vec3f(1.0, 0.82, 0.22) * networkLocal * max(dispatchTokenA, dispatchTokenB) * 0.78;
  let literalScene = 0.0;
  return mix(base, color, clamp(0.34 + robot * 0.18, 0.0, 0.56) * (1.0 - literalScene));
}

fn graphComposedVisualIrScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  var color = base;
  let biologicalAgent = visualIrAt(0);
  let waterVolume = visualIrAt(1);
  let detectorGeometry = visualIrAt(2);
  let nodeGraph = visualIrAt(3);
  let readoutPanel = visualIrAt(4);
  let trackLine = visualIrAt(5);
  let fieldSheet = visualIrAt(6);
  let flowField = visualIrAt(7);
  let thermalField = visualIrAt(8);
  let opticalField = visualIrAt(9);
  let networkFlow = visualIrAt(10);
  let materialSurface = visualIrAt(11);
  let organicMatrix = visualIrAt(12);
  let bubbleVolume = visualIrAt(13);
  let constraintSurface = visualIrAt(14);
  let causalAffordance = visualIrAt(15);
  let processPulse = visualIrAt(16);
  let particleSwarm = visualIrAt(17);
  let robotArmature = visualIrAt(18);
  let granularStrata = visualIrAt(19);
  let orbitalBody = visualIrAt(20);
  let acousticWaveguide = visualIrAt(21);
  let chemicalFront = visualIrAt(22);
  let phaseBoundary = visualIrAt(23);
  let layerTotal = clamp(
    biologicalAgent + waterVolume + detectorGeometry + nodeGraph + readoutPanel + trackLine +
    fieldSheet + flowField + thermalField + opticalField + networkFlow + materialSurface +
    organicMatrix + bubbleVolume + constraintSurface + causalAffordance + processPulse +
    particleSwarm + robotArmature + granularStrata + orbitalBody + acousticWaveguide +
    chemicalFront + phaseBoundary,
    0.0,
    12.0
  );

  let waterBody = smoothstep(0.34, 0.0, abs(p.y + 0.32 + sin(p.x * 2.4 + t * 0.08) * 0.08)) *
    (1.0 - smoothstep(0.72, 1.24, abs(p.x)));
  let waterRidges = max(atomFluidRibbons(p + vec2f(0.0, t * 0.04), t), atomVectorFlow(p, t)) * waterBody;
  color = mix(color, vec3f(0.02, 0.2, 0.32), waterVolume * waterBody * 0.48);
  color += vec3f(0.12, 0.64, 1.0) * waterVolume * waterRidges * 0.42;

  let animalCenterA = vec2f(-0.34 + sin(t * 0.42) * 0.05, -0.11 + sin(t * 0.7) * 0.05);
  let animalCenterB = vec2f(0.32 + cos(t * 0.36) * 0.045, 0.1 + cos(t * 0.54) * 0.04);
  let animalLocalA = rot(p - animalCenterA, 0.12 + sin(t * 0.3) * 0.06);
  let animalLocalB = rot(p - animalCenterB, -0.22 + cos(t * 0.28) * 0.06);
  let animalBodyA = max(capsuleLine(animalLocalA, vec2f(-0.22, -0.02), vec2f(0.18, 0.02), 0.095),
    max(diskMask(animalLocalA, vec2f(0.26, 0.04), 0.073), capsuleLine(animalLocalA, vec2f(-0.28, -0.02), vec2f(-0.44, -0.1 + sin(t) * 0.04), 0.028)));
  let animalBodyB = max(capsuleLine(animalLocalB, vec2f(-0.18, 0.0), vec2f(0.2, 0.04), 0.082),
    max(diskMask(animalLocalB, vec2f(0.27, 0.05), 0.062), capsuleLine(animalLocalB, vec2f(-0.24, 0.0), vec2f(-0.38, 0.12 + cos(t) * 0.035), 0.024)));
  let swimWake = max(
    capsuleLine(p, animalCenterA - vec2f(0.34, 0.08), animalCenterA - vec2f(0.08, 0.01), 0.018),
    capsuleLine(p, animalCenterB - vec2f(0.32, -0.08), animalCenterB - vec2f(0.08, -0.02), 0.016)
  );
  let bioWater = min(biologicalAgent, waterVolume);
  color += vec3f(0.74, 0.62, 0.42) * biologicalAgent * max(animalBodyA, animalBodyB) * 0.82;
  color += vec3f(0.85, 1.0, 0.96) * bioWater * swimWake * (0.34 + waterRidges * 0.28);

  let detectorShell = max(
    ellipseRing(p, vec2f(0.0, -0.02), vec2f(0.76, 1.12), 0.62, 0.032),
    ellipseRing(p, vec2f(0.0, -0.02), vec2f(1.08, 0.72), 0.44, 0.022)
  );
  let detectorSegments = detectorShell * max(stripe(atan2(p.y + 0.02, p.x) * 9.0 + t * 0.1, 0.036),
    stripe(length(p) * 8.0, 0.024));
  let detectorPanel = panel3d(p, vec2f(0.0, 0.58), vec2f(0.86, 0.12), vec3f(0.02, 0.055, 0.08), vec3f(0.1, 0.94, 1.0));
  color += vec3f(0.16, 0.9, 1.0) * detectorGeometry * detectorShell * 0.56;
  color += vec3f(1.0, 0.72, 0.18) * detectorGeometry * detectorSegments * 0.28;
  color = mix(color, detectorPanel.rgb, detectorGeometry * readoutPanel * detectorPanel.a * 0.58);

  let trackA = capsuleLine(p, vec2f(-0.86, -0.2 + sin(t * 0.42) * 0.06), vec2f(0.82, 0.24 + cos(t * 0.38) * 0.08), 0.017);
  let trackB = capsuleLine(p, vec2f(-0.74, 0.32), vec2f(0.58, -0.34 + sin(t * 0.34) * 0.08), 0.014);
  let hitA = diskMask(p, vec2f(-0.78 + fract(t * 0.68) * 1.56, -0.16 + sin(t * 0.9) * 0.1), 0.065);
  let hitB = diskMask(p, vec2f(0.7 - fract(t * 0.54) * 1.4, 0.28 + cos(t * 0.78) * 0.12), 0.052);
  color += vec3f(0.92, 1.0, 0.76) * trackLine * max(trackA, trackB) * 0.58;
  color += vec3f(0.2, 1.0, 0.92) * max(trackLine, detectorGeometry) * max(hitA, hitB) * 0.66;

  let readoutShape = max(atomInstrumentReadout(p, t), atomMeasurementBands(p, t));
  color += vec3f(0.18, 0.88, 1.0) * readoutPanel * readoutShape * 0.5;

  let graphEdgeA = capsuleLine(p, vec2f(-0.62, -0.22), vec2f(0.0, 0.16), 0.019);
  let graphEdgeB = capsuleLine(p, vec2f(0.0, 0.16), vec2f(0.58, -0.1), 0.019);
  let graphEdgeC = capsuleLine(p, vec2f(-0.42, 0.42), vec2f(0.0, 0.16), 0.016);
  let graphEdgeD = capsuleLine(p, vec2f(0.58, -0.1), vec2f(0.46, 0.42), 0.016);
  let graphNodes = max(max(diskMask(p, vec2f(-0.62, -0.22), 0.065), diskMask(p, vec2f(0.0, 0.16), 0.076)),
    max(max(diskMask(p, vec2f(0.58, -0.1), 0.062), diskMask(p, vec2f(-0.42, 0.42), 0.054)), diskMask(p, vec2f(0.46, 0.42), 0.054)));
  let graphPulse = stripe((p.x + p.y) * 5.8 - t * 0.78, 0.033) * max(max(graphEdgeA, graphEdgeB), max(graphEdgeC, graphEdgeD));
  color += vec3f(0.12, 0.48, 1.0) * nodeGraph * max(max(graphEdgeA, graphEdgeB), max(graphEdgeC, graphEdgeD)) * 0.54;
  color += vec3f(1.0, 0.78, 0.18) * max(nodeGraph, networkFlow) * max(graphNodes, graphPulse) * 0.48;
  color += vec3f(0.16, 0.72, 1.0) * networkFlow * atomPacketPulses(p, t) * 0.36;

  let surfaceBody = panel3d(p, vec2f(0.0, -0.1), vec2f(0.78, 0.28), vec3f(0.18, 0.16, 0.13), vec3f(0.9, 0.74, 0.42));
  color = mix(color, surfaceBody.rgb, materialSurface * surfaceBody.a * 0.28);
  color += vec3f(1.0, 0.82, 0.24) * constraintSurface * max(atomStressCracks(p, t), atomConstraintPads(p, t)) * 0.36;

  let dough = smoothstep(0.72, 0.06, length((p - vec2f(0.02, -0.06)) * vec2f(0.78, 1.16)));
  color = mix(color, vec3f(0.38, 0.24, 0.14), organicMatrix * dough * 0.42);
  color += vec3f(0.96, 0.78, 0.4) * organicMatrix * atomGlutenStrands(p, t) * 0.46;
  color += vec3f(0.72, 0.98, 0.86) * bubbleVolume * max(atomFermentationBubbles(p, t), starParticleField(p, t, 0.09)) * 0.54;

  let fieldGrid = max(stripe(p.x * 6.0 + sin(p.y * 3.0), 0.024), stripe(p.y * 5.2 + cos(p.x * 2.5), 0.024)) *
    (1.0 - smoothstep(0.72, 1.22, length(p)));
  color += vec3f(0.4, 0.78, 1.0) * fieldSheet * fieldGrid * 0.25;
  color += vec3f(0.12, 0.72, 1.0) * flowField * max(atomVectorFlow(p, t), atomFluidRibbons(p, t)) * 0.34;
  color += vec3f(1.0, 0.28, 0.08) * thermalField * max(atomThermalPlume(p, t), atomCombustionFront(p, t)) * 0.38;
  color += vec3f(1.0, 0.92, 0.64) * opticalField * max(atomOpticalCaustics(p, t), atomRayCones(p, t)) * 0.36;
  color += vec3f(0.52, 0.82, 1.0) * acousticWaveguide * max(atomAcousticRings(p, t), atomStandingNodes(p, t)) * 0.32;
  color += vec3f(0.8, 0.48, 1.0) * chemicalFront * max(atomChemicalClouds(p, t), atomReactionFront(p, t)) * 0.32;
  color += vec3f(0.78, 0.92, 1.0) * phaseBoundary * max(atomPhaseBoundary(p, t), atomLatentHeatBand(p, t)) * 0.3;
  color += vec3f(0.96, 0.66, 0.22) * granularStrata * max(atomGranularStrata(p, t), atomSedimentMotion(p, t)) * 0.34;
  color += vec3f(0.9, 0.94, 1.0) * orbitalBody * max(atomOrbitalTrails(p, t), atomGravityWell(p, t)) * 0.32;
  color += vec3f(1.0, 0.78, 0.22) * particleSwarm * starParticleField(p + vec2f(0.0, t * 0.08), t, 0.2) * 0.48;
  color += vec3f(0.88, 0.94, 1.0) * robotArmature * max(atomRobotWorkcell(p, t), atomContactForces(p, t)) * 0.36;

  let causalArrowA = capsuleLine(p, vec2f(-0.62, 0.54), vec2f(0.34, 0.38 + sin(t * 0.34) * 0.05), 0.018);
  let causalArrowHead = max(
    capsuleLine(p, vec2f(0.34, 0.38), vec2f(0.22, 0.48), 0.016),
    capsuleLine(p, vec2f(0.34, 0.38), vec2f(0.2, 0.3), 0.016)
  );
  let processRings = stripe(length((p - vec2f(0.02, 0.02)) * vec2f(1.0, 0.82)) * 5.6 - t * 0.52, 0.026) *
    (1.0 - smoothstep(0.62, 1.1, length(p)));
  color += vec3f(1.0, 0.86, 0.18) * causalAffordance * max(causalArrowA, causalArrowHead) * 0.56;
  color += vec3f(0.96, 0.46, 1.0) * processPulse * processRings * 0.28;

  return mix(base, color, clamp(0.16 + layerTotal * 0.055, 0.0, 0.78));
}

fn composedVisualIrScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  var color = base;
  let thermalScene = sceneMixAt(0);
  let waterScene = sceneMixAt(1);
  let mechanicalScene = sceneMixAt(2);
  let magneticScene = sceneMixAt(3);
  let opticalScene = sceneMixAt(4);
  let acousticScene = sceneMixAt(5);
  let biologicalScene = sceneMixAt(6);
  let chemicalScene = sceneMixAt(7);
  let orbitalScene = sceneMixAt(8);
  let networkScene = sceneMixAt(9);
  let energyScene = sceneMixAt(10);
  let roboticScene = sceneMixAt(11);
  let granularScene = sceneMixAt(12);
  let instrumentScene = sceneMixAt(13);
  let phaseScene = sceneMixAt(14);
  let hazardScene = sceneMixAt(15);
  let sceneTotal = clamp(
    thermalScene + waterScene + mechanicalScene + magneticScene + opticalScene + acousticScene +
    biologicalScene + chemicalScene + orbitalScene + networkScene + energyScene + roboticScene +
    granularScene + instrumentScene + phaseScene + hazardScene,
    0.0,
    6.0
  );

  let ground = smoothstep(0.08, 0.0, abs(p.y + 0.52 + sin(p.x * 2.8 + t * 0.08) * 0.06));
  let waterPath = smoothstep(0.065, 0.0, abs(p.y + 0.12 + sin(p.x * 3.2 + t * 0.1) * 0.14));
  let sedimentFan = smoothstep(0.52, 0.04, length((p - vec2f(0.46, -0.36)) * vec2f(1.15, 0.72)));
  let flowBands = max(atomFluidRibbons(p + vec2f(0.0, t * 0.035), t), atomVectorFlow(p, t));
  color = mix(color, vec3f(0.04, 0.11, 0.08), waterScene * 0.1);
  color += vec3f(0.06, 0.52, 0.96) * waterScene * max(waterPath, flowBands * 0.46) * 0.46;
  color += vec3f(0.72, 0.52, 0.22) * max(waterScene, granularScene) * max(ground, sedimentFan) * 0.22;

  let fireBed = panel3d(p, vec2f(0.0, -0.58), vec2f(0.84, 0.12), vec3f(0.16, 0.055, 0.025), vec3f(1.0, 0.24, 0.04)).w;
  color += vec3f(1.0, 0.24, 0.04) * thermalScene * max(atomThermalPlume(p, t), fireBed) * 0.42;
  color += vec3f(0.98, 0.7, 0.2) * max(thermalScene, phaseScene) * atomLatentHeatBand(p, t) * 0.18;

  let mechanicalLinks = max(
    capsuleLine(p, vec2f(-0.72, -0.16), vec2f(0.62, 0.18), 0.055),
    ellipseRing(p, vec2f(0.22, 0.04), vec2f(1.0, 1.0), 0.27, 0.032)
  );
  color += vec3f(0.86, 0.9, 0.96) * mechanicalScene * mechanicalLinks * 0.38;
  color += vec3f(1.0, 0.78, 0.2) * max(mechanicalScene, granularScene) * atomStressCracks(p, t) * 0.24;

  color += vec3f(0.32, 0.64, 1.0) * magneticScene * atomFluxLines(p, t) * 0.36;
  color += vec3f(0.96, 0.16, 0.82) * max(magneticScene, energyScene) * atomChargeShell(p, t) * 0.26;

  let filmBody = smoothstep(0.78, 0.08, length((p - vec2f(0.02, -0.02)) * vec2f(0.7, 1.04)));
  let spectral = vec3f(
    0.58 + 0.42 * sin(p.x * 9.0 + p.y * 6.0 + t * 0.16),
    0.58 + 0.42 * sin(p.x * 9.0 + p.y * 6.0 + t * 0.16 + 2.09),
    0.58 + 0.42 * sin(p.x * 9.0 + p.y * 6.0 + t * 0.16 + 4.18)
  );
  color = mix(color, spectral, opticalScene * filmBody * 0.24);
  color += vec3f(1.0, 0.95, 0.78) * opticalScene * max(atomOpticalCaustics(p, t), atomRayCones(p, t)) * 0.34;
  color += vec3f(0.72, 0.96, 1.0) * max(opticalScene, energyScene) * atomQuantumFringes(p, t) * 0.22;

  color += vec3f(0.45, 0.78, 1.0) * acousticScene * max(atomAcousticRings(p, t), atomStandingNodes(p, t)) * 0.38;

  let branch = branchWeb(p + vec2f(0.08, 0.1), t);
  let cells = max(
    diskMask(p, vec2f(-0.42 + sin(t * 0.36) * 0.06, -0.12), 0.095),
    diskMask(p, vec2f(0.34 + cos(t * 0.31) * 0.05, 0.18), 0.08)
  );
  color += vec3f(0.24, 0.88, 0.34) * biologicalScene * max(branch, cells) * 0.42;
  color += vec3f(0.72, 0.96, 0.86) * min(biologicalScene + waterScene, 1.0) * atomFermentationBubbles(p, t) * 0.2;

  color += vec3f(0.72, 0.42, 1.0) * chemicalScene * max(atomChemicalClouds(p, t), atomReactionFront(p, t)) * 0.24;
  color += vec3f(1.0, 0.44, 0.72) * max(chemicalScene, phaseScene) * atomAcidityGradient(p, t) * 0.18;

  color = mix(color, vec3f(0.012, 0.02, 0.06), orbitalScene * smoothstep(1.1, 0.1, length(p)) * 0.28);
  color += vec3f(0.82, 0.94, 1.0) * orbitalScene * starParticleField(p, t, 0.14 + orbitalScene * 0.12) * 0.58;
  color += u.palette3.rgb * orbitalScene * max(atomOrbitalTrails(p, t), atomGravityWell(p, t)) * 0.32;

  color += vec3f(0.16, 0.56, 1.0) * networkScene * max(atomNetworkPressure(p, t), atomPacketPulses(p, t)) * 0.42;
  color += vec3f(1.0, 0.76, 0.18) * max(networkScene, instrumentScene) * atomSignalPulses(p, t) * 0.26;

  color += vec3f(0.86, 0.2, 1.0) * energyScene * ellipseRing(p, vec2f(0.0, 0.02), vec2f(1.2, 0.72), 0.52, 0.04) * 0.36;
  color += vec3f(0.18, 0.92, 1.0) * energyScene * stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.0 - t * 0.28, 0.032) * smoothstep(0.95, 0.08, length(p)) * 0.22;

  color += vec3f(0.86, 0.92, 0.96) * roboticScene * max(atomRobotWorkcell(p, t), atomContactForces(p, t)) * 0.42;
  color += vec3f(1.0, 0.58, 0.16) * roboticScene * rectMask(p, vec2f(-0.78 + fract(t * 0.62) * 1.56, -0.48), vec2f(0.13, 0.08)) * 0.58;

  let strata = atomGranularStrata(p, t);
  let pile = smoothstep(0.08, 0.0, abs(p.y + 0.58 - abs(p.x) * 0.34)) * smoothstep(0.78, 0.04, abs(p.x));
  color += vec3f(0.72, 0.5, 0.22) * granularScene * max(strata, pile) * 0.42;
  color += vec3f(1.0, 0.66, 0.22) * granularScene * starParticleField(p + vec2f(0.0, t * 0.04), t, 0.12) * 0.18;

  let readout = max(atomInstrumentReadout(p, t), atomMeasurementBands(p, t));
  let detector = max(
    diskMask(p, vec2f(-0.72 + fract(t * 0.7) * 1.44, 0.26 + sin(t * 1.1) * 0.2), 0.08),
    capsuleLine(p, vec2f(-0.86, -0.22 + sin(t * 0.7) * 0.12), vec2f(0.86, 0.18 + cos(t * 0.64) * 0.16), 0.022)
  );
  color += vec3f(0.12, 0.9, 1.0) * instrumentScene * readout * 0.42;
  color += vec3f(0.92, 1.0, 0.82) * instrumentScene * detector * 0.34;

  color += vec3f(0.72, 0.92, 1.0) * phaseScene * max(atomPhaseBoundary(p, t), atomLatentHeatBand(p, t)) * 0.26;
  color += vec3f(1.0, 0.22, 0.05) * hazardScene * max(atomCombustionFront(p, t), stripe(length(p) * 5.8 - t * 0.3, 0.03)) * 0.34;
  color += vec3f(0.1, 0.64, 1.0) * hazardScene * atomDensityFront(p, t) * 0.22;

  return mix(base, color, clamp(0.18 + sceneTotal * 0.08, 0.0, 0.72));
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4f {
  let resolution = max(u.viewport.xy, vec2f(1.0));
  let uv = input.uv;
  let aspect = resolution.x / resolution.y;
  var p = uv * 2.0 - vec2f(1.0);
  p.x *= aspect;
  let t = u.viewport.z;
  let scene = u.viewport.w;
  var color = sceneField(p, t, scene);
  color = atomStructuralScene(p, t, color);
  color = affordanceOverlays(p, t, color);
  color = cinematic3dScene(p, t, scene, color);
  color = graphComposedVisualIrScene(p, t, color);
  color = composedVisualIrScene(p, t, color);
  color = sceneRenderPacketScene(p, t, color);
  color = atomOperatorOverlays(p, t, color);
  let vignette = smoothstep(1.45, 0.18, length(p));
  color = mix(color * 0.78, color, vignette);
  color = pow(max(color, vec3f(0.0)), vec3f(0.92));
  return vec4f(color, 1.0);
}
`);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
