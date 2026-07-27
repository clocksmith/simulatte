(function attachSimulatteWebGpuRendererMorphology(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

  const OBJECT_PART_SHAPE_CODES = Object.freeze({
    ellipse: 1,
    box: 2,
    'rounded-box': 3,
    capsule: 4,
    triangle: 5,
    ring: 6,
    star: 7,
    spiral: 8,
    wave: 9,
    superellipse: 10,
    trapezoid: 11,
    diamond: 12,
    teardrop: 13,
    leaf: 14,
    crescent: 15,
    arch: 16,
    hexagon: 17,
    shield: 18,
    gear: 19,
    cloud: 20,
    'tapered-capsule': 21,
    'bevel-box': 22,
  });
  const OBJECT_PART_SURFACE_CODES = Object.freeze({
    solid: 0,
    fur: 1,
    wood: 2,
    metal: 3,
    glass: 4,
    organic: 5,
    fabric: 6,
    masonry: 7,
    water: 8,
    celestial: 9,
    instrument: 10,
    ceramic: 11,
  });
  const OBJECT_PART_ACCENT_CODES = Object.freeze({
    ambient: 0,
    'soft-rim': 1,
    'edge-glint': 2,
    prism: 3,
    constellation: 4,
    caustic: 5,
    scan: 6,
    circuit: 7,
    ember: 8,
    frost: 9,
    pollen: 10,
    iridescent: 11,
    speedline: 12,
    glaze: 13,
  });

  function scenePacketObjectPartMorphology(sourcePart = {}) {
    const primitive = String(sourcePart.primitive || 'rounded-box');
    const shapeParameters = fixedVector(sourcePart.shapeParameters, 4, [0.3, 0.2, 0, 0.5]);
    const surfacePattern = String(sourcePart.surfacePattern || 'solid');
    const sourceSurface = fixedVector(sourcePart.surfaceParameters, 4, [6, 0.02, 0.12, 0.08]);
    const accentPattern = String(sourcePart.accentPattern || 'ambient');
    const accentParameters = fixedVector(sourcePart.accentParameters, 4, [6, 0.06, 0, 0]);
    return {
      primitive,
      shapeCode: OBJECT_PART_SHAPE_CODES[primitive] || OBJECT_PART_SHAPE_CODES['rounded-box'],
      contourProfile: String(sourcePart.contourProfile || primitive),
      shapeParameters,
      surfacePattern,
      surfaceCode: OBJECT_PART_SURFACE_CODES[surfacePattern] || 0,
      surfaceParameters: sourceSurface,
      accentPattern,
      accentCode: OBJECT_PART_ACCENT_CODES[accentPattern] || 0,
      accentParameters,
      visualFeatureClass: String(sourcePart.visualFeatureClass || 'generic'),
    };
  }

  function writeObjectPartMorphology(vector, offset, row = {}) {
    const shape = fixedVector(row.shapeParameters, 4, [0.3, 0.2, 0, 0.5]);
    const surface = fixedVector(row.surfaceParameters, 4, [6, 0.02, 0.12, 0.08]);
    const accent = fixedVector(row.accentParameters, 4, [6, 0.06, 0, 0]);
    vector[offset + 24] = shape[0];
    vector[offset + 25] = shape[1];
    vector[offset + 26] = shape[2];
    vector[offset + 27] = shape[3];
    vector[offset + 28] = Number(row.surfaceCode || 0);
    vector[offset + 29] = surface[0];
    vector[offset + 30] = surface[1];
    vector[offset + 31] = surface[2] + surface[3];
    vector[offset + 32] = Number(row.accentCode || 0);
    vector[offset + 33] = accent[0];
    vector[offset + 34] = accent[1];
    vector[offset + 35] = accent[2];
    vector[offset + 36] = accent[3];
    vector[offset + 37] = 0;
    vector[offset + 38] = 0;
    vector[offset + 39] = 0;
  }

  function scenePacketMorphologySummary(parts = []) {
    const contours = unique(parts.map((row) => row.contourProfile));
    const surfaces = unique(parts.map((row) => row.surfacePattern));
    const accents = unique(parts.map((row) => row.accentPattern));
    const dynamicAccentPartCount = parts.filter((row) => (
      Number(row.accentParameters && row.accentParameters[2] || 0) > 0
    )).length;
    const featureClasses = unique(parts.map((row) => row.visualFeatureClass)
      .filter((value) => value && value !== 'generic'));
    return {
      schema: 'simulatte.phase7MorphologySubmission.v1',
      submittedPartCount: parts.length,
      contourProfiles: contours,
      surfacePatterns: surfaces,
      accentPatterns: accents,
      featureClasses,
      contourProfileCount: contours.length,
      surfacePatternCount: surfaces.length,
      accentPatternCount: accents.length,
      dynamicAccentPartCount,
      distinctiveFeatureCount: featureClasses.length,
    };
  }

  function fixedVector(value, length, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    return Array.from({ length }, (_, index) => {
      const number = Number(source[index] ?? fallback[index] ?? 0);
      return Number.isFinite(number) ? number : Number(fallback[index] || 0);
    });
  }

  function unique(values = []) {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  }

  root.SimulattePhaseModuleRegistry.define(
    'webGpuRenderer',
    'simulatte-webgpu-renderer-morphology.js',
    {
      OBJECT_PART_SHAPE_CODES,
      OBJECT_PART_SURFACE_CODES,
      OBJECT_PART_ACCENT_CODES,
      scenePacketObjectPartMorphology,
      writeObjectPartMorphology,
      scenePacketMorphologySummary,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
