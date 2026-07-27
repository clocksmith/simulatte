(function attachSimulatteObjectGeometryMorphology(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');

  const MORPHOLOGY_SCHEMA = 'simulatte.objectMorphologyProgram.v1';
  const MORPHOLOGY_RECEIPT_SCHEMA = 'simulatte.objectMorphologyReceipt.v1';
  const GENERIC_PART_TERMS = Object.freeze(new Set([
    'body', 'core', 'detail', 'surface', 'component', 'object', 'part',
  ]));
  const SIGNATURE_CONTOURS = Object.freeze(new Set([
    'arch', 'cloud', 'crescent', 'gear', 'leaf', 'spiral', 'star', 'teardrop',
    'tapered-capsule', 'wave',
  ]));
  const ORGANIC_IDENTITIES = Object.freeze(new Set([
    'animal', 'bird', 'cat', 'cell', 'dog', 'fish', 'flower', 'horse', 'octopus',
    'person', 'plant', 'protein', 'tree',
  ]));
  const MACHINE_IDENTITIES = Object.freeze(new Set([
    'airplane', 'bicycle', 'car', 'conveyor', 'excavator', 'instrument', 'parcel',
    'robot', 'server-rack', 'television', 'train',
  ]));
  const CONTOUR_RULES = Object.freeze([
    ['gear', /\b(?:gear|sprocket|cog|rotor)\b/],
    ['arch', /\b(?:arch|field region|flux loop|handle|horseshoe)\b/],
    ['crescent', /\b(?:crescent|smile|jaw|mandible)\b/],
    ['cloud', /\b(?:canopy|cloud|crown|foam|plume|smoke)\b/],
    ['leaf', /\b(?:ear|fin|leaf|leaves|petal|wing)\b/],
    ['teardrop', /\b(?:beak|flame|muzzle|nose|snout|tip)\b/],
    ['tapered-capsule', /\b(?:arm|branch|leg|link|neck|rail|root|stem|string|tail|tentacle|tusk)\b/],
    ['hexagon', /\b(?:cell|facet|honeycomb|nut)\b/],
    ['shield', /\b(?:apron|chest|hull|shield)\b/],
    ['diamond', /\b(?:blade|kite|rhombus|snow)\b/],
    ['trapezoid', /\b(?:cabin|chassis|cockpit|deck|roof|shell|windshield)\b/],
    ['bevel-box', /\b(?:cabinet|carton|door|frame|greenhouse|panel|screen|window)\b/],
  ]);
  const SURFACE_RULES = Object.freeze([
    ['glass', /\b(?:crystal|glass|glazing|greenhouse|lens|window)\b/],
    ['wood', /\b(?:bark|branch|stool|timber|tree|violin|wood)\b/],
    ['fur', /\b(?:animal|cat|dog|fur|horse|mammal)\b/],
    ['metal', /\b(?:airplane|aluminum|excavator|machine|metal|robot|steel)\b/],
    ['ceramic', /\b(?:ceramic|china|porcelain|pottery|teapot)\b/],
    ['water', /\b(?:fluid|ice|lake|ocean|river|water|wave)\b/],
    ['masonry', /\b(?:brick|building|castle|concrete|masonry|wall)\b/],
    ['fabric', /\b(?:cloth|fabric|seat|upholstery)\b/],
    ['celestial', /\b(?:galaxy|moon|nebula|planet|star|sun)\b/],
    ['instrument', /\b(?:detector|display|instrument|readout|screen|sensor)\b/],
    ['organic', /\b(?:cell|flower|leaf|octopus|person|plant|protein|skin)\b/],
  ]);
  const ACCENT_RULES = Object.freeze([
    ['prism', /\b(?:crystal|glass|glazing|greenhouse|lens|prism|rainbow|window)\b/],
    ['constellation', /\b(?:comet|galaxy|moon|nebula|orbit|planet|star|sun)\b/],
    ['caustic', /\b(?:fluid|lake|ocean|river|water|wave)\b/],
    ['frost', /\b(?:cryogenic|frost|ice|snow)\b/],
    ['ember', /\b(?:combust|fire|flame|lava|thermal|volcano)\b/],
    ['circuit', /\b(?:chiplet|circuit|electromagnet|magnetic|network|robot|semiconductor|server|wafer)\b/],
    ['scan', /\b(?:detector|display|instrument|phototube|readout|screen|sensor)\b/],
    ['pollen', /\b(?:flower|kelp|leaf|mangrove|phloem|plant|plankton|tree)\b/],
    ['iridescent', /\b(?:bird|coral|feather|fish|octopus|wing)\b/],
    ['speedline', /\b(?:airplane|car|conveyor|railway|shipping|train)\b/],
    ['glaze', /\b(?:ceramic|china|porcelain|pottery|teapot)\b/],
  ]);
  const ACCENT_SPEEDS = Object.freeze({
    ambient: 0,
    'soft-rim': 0.04,
    'edge-glint': 0.08,
    prism: 0.07,
    constellation: 0.03,
    caustic: 0.18,
    scan: 0.28,
    circuit: 0.12,
    ember: 0.22,
    frost: 0.025,
    pollen: 0.05,
    iridescent: 0.06,
    speedline: 0.3,
    glaze: 0.03,
  });

  function enhanceObjectGeometryProgram(program = {}, identity = {}, entity = {}) {
    const parts = Array.isArray(program.parts) ? program.parts : [];
    if (!parts.length || program.literal !== true) return program;
    const identityType = morphologySafeId(
      identity.type || program.identityType || entity.semanticClass || 'object'
    );
    const evidenceText = morphologyEvidenceText(program, identity, entity);
    const seedText = [
      entity.id,
      entity.sourceObject,
      identityType,
      program.grammarId,
      entity.constructionApproachSeed,
      entity.constructionApproachAttempt,
    ].filter((value) => value !== '' && value != null).join(':');
    const enhancedParts = parts.map((part, index) => enhanceMorphologyPart(
      part,
      index,
      identityType,
      evidenceText,
      seedText,
      morphologyBoundMaterial(program, part)
    ));
    const receipt = objectMorphologyReceipt(enhancedParts, identityType, program);
    return {
      ...program,
      parts: enhancedParts,
      morphology: {
        schema: MORPHOLOGY_SCHEMA,
        identityType,
        seed: scope.fnv1a32(seedText),
        contourProfiles: receipt.contourProfiles.slice(),
        surfacePatterns: receipt.surfacePatterns.slice(),
        accentPatterns: receipt.accentPatterns.slice(),
      },
      morphologyReceipt: receipt,
    };
  }

  function enhanceMorphologyPart(
    part = {},
    index = 0,
    identityType = 'object',
    evidenceText = '',
    seedText = '',
    boundMaterial = ''
  ) {
    const partText = morphologyPartText(part, identityType, evidenceText);
    const primitive = morphologyContour(part, identityType, partText);
    const surfacePattern = morphologySurfacePattern(part, identityType, evidenceText, boundMaterial);
    const unit = (slot) => scope.inclusiveUnitInterval(`${seedText}:${part.id || index}:${slot}`);
    const accentPattern = morphologyAccentPattern(part, identityType, surfacePattern);
    const organic = ORGANIC_IDENTITIES.has(identityType) || surfacePattern === 'organic' || surfacePattern === 'fur';
    const machine = MACHINE_IDENTITIES.has(identityType) || surfacePattern === 'metal' || surfacePattern === 'instrument';
    const asymmetry = organic ? 0.08 + unit('asymmetry') * 0.22 : unit('asymmetry') * 0.07;
    const taper = morphologyTaper(primitive, partText, unit('taper'));
    const roundness = morphologyRoundness(primitive, organic, machine, unit('roundness'));
    const profile = [
      Number(roundness.toFixed(4)),
      Number(taper.toFixed(4)),
      Number(asymmetry.toFixed(4)),
      Number((unit('profile') * 0.98).toFixed(4)),
    ];
    const patternScale = 4 + Math.round(unit('pattern-scale') * 12);
    const patternStrength = morphologyPatternStrength(surfacePattern, unit('pattern-strength'));
    const rimStrength = surfacePattern === 'glass' ? 0.34 :
      machine ? 0.2 : organic ? 0.16 : 0.12;
    return {
      ...part,
      primitive,
      contourProfile: primitive,
      shapeParameters: profile,
      surfacePattern,
      surfaceParameters: [
        patternScale,
        Number(patternStrength.toFixed(4)),
        Number(rimStrength.toFixed(4)),
        Number((0.04 + unit('micro-detail') * 0.14).toFixed(4)),
      ],
      accentPattern,
      accentParameters: [
        3 + Math.round(unit('accent-scale') * 11),
        Number(morphologyAccentStrength(accentPattern, unit('accent-strength')).toFixed(4)),
        morphologyAccentSpeed(accentPattern),
        Number(unit('accent-phase').toFixed(4)),
      ],
      visualFeatureClass: morphologyFeatureClass(part, identityType),
    };
  }

  function morphologyContour(part = {}, identityType = 'object', partText = '') {
    const matched = CONTOUR_RULES.find(([, pattern]) => pattern.test(partText));
    if (matched) return matched[0];
    const primitive = String(part.primitive || 'rounded-box');
    if (primitive === 'capsule' && ORGANIC_IDENTITIES.has(identityType)) return 'tapered-capsule';
    if (primitive === 'rounded-box' && MACHINE_IDENTITIES.has(identityType)) return 'bevel-box';
    if (primitive === 'ellipse' && ORGANIC_IDENTITIES.has(identityType)) return 'superellipse';
    if (primitive === 'triangle' && MACHINE_IDENTITIES.has(identityType)) return 'trapezoid';
    return primitive;
  }

  function morphologySurfacePattern(
    part = {},
    identityType = 'object',
    evidenceText = '',
    boundMaterial = ''
  ) {
    const matchedBinding = SURFACE_RULES.find(([, pattern]) => pattern.test(boundMaterial));
    if (matchedBinding) return matchedBinding[0];
    const explicit = String(part.texture || '').toLowerCase();
    const matchedExplicit = SURFACE_RULES.find(([, pattern]) => pattern.test(explicit));
    if (matchedExplicit) return matchedExplicit[0];
    const identityMatch = SURFACE_RULES.find(([, pattern]) => pattern.test(identityType.replace(/-/g, ' ')));
    if (identityMatch) return identityMatch[0];
    const materialEvidence = String(evidenceText || '').match(
      /\b(?:aluminum|bark|brick|ceramic|china|cloth|concrete|crystal|fabric|fur|glass|glazing|ice|masonry|metal|porcelain|pottery|steel|timber|water|wood)\b/g
    ) || [];
    if (materialEvidence.length === 1) {
      const evidenceMatch = SURFACE_RULES.find(([, pattern]) => pattern.test(materialEvidence[0]));
      if (evidenceMatch) return evidenceMatch[0];
    }
    const localText = [
      identityType,
      part.id,
      part.sourceHint,
      part.constructionRole,
      part.constructionPartId,
    ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
    const matched = SURFACE_RULES.find(([, pattern]) => pattern.test(localText));
    if (matched) return matched[0];
    if (ORGANIC_IDENTITIES.has(identityType)) return 'organic';
    if (MACHINE_IDENTITIES.has(identityType)) return 'metal';
    return 'solid';
  }

  function morphologyTaper(primitive = '', partText = '', unit = 0.5) {
    if (primitive === 'tapered-capsule') {
      return /\b(?:tail|tentacle|root|tip)\b/.test(partText) ? 0.58 + unit * 0.28 : 0.28 + unit * 0.28;
    }
    if (primitive === 'leaf' || primitive === 'teardrop' || primitive === 'shield') {
      return 0.5 + unit * 0.36;
    }
    return 0.12 + unit * 0.28;
  }

  function morphologyRoundness(primitive = '', organic = false, machine = false, unit = 0.5) {
    if (primitive === 'superellipse') return 0.28 + unit * 0.5;
    if (primitive === 'bevel-box') return 0.08 + unit * 0.28;
    if (organic) return 0.48 + unit * 0.38;
    if (machine) return 0.1 + unit * 0.24;
    return 0.22 + unit * 0.5;
  }

  function morphologyPatternStrength(pattern = 'solid', unit = 0.5) {
    if (pattern === 'solid') return 0.02;
    if (pattern === 'glass') return 0.2 + unit * 0.12;
    if (pattern === 'metal' || pattern === 'instrument') return 0.1 + unit * 0.12;
    return 0.08 + unit * 0.16;
  }

  function morphologyAccentPattern(part = {}, identityType = 'object', surfacePattern = 'solid') {
    if (surfacePattern === 'glass') return 'prism';
    if (surfacePattern === 'water') return 'caustic';
    if (surfacePattern === 'celestial') return 'constellation';
    if (surfacePattern === 'ceramic') return 'glaze';
    const localText = [
      identityType,
      part.id,
      part.sourceHint,
      part.constructionRole,
      part.constructionPartId,
    ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
    const matched = ACCENT_RULES.find(([, pattern]) => pattern.test(localText));
    if (matched) return matched[0];
    if (surfacePattern === 'fur' || surfacePattern === 'organic') return 'soft-rim';
    if (surfacePattern === 'metal') return 'edge-glint';
    if (surfacePattern === 'instrument') return 'scan';
    if (surfacePattern === 'celestial') return 'constellation';
    if (surfacePattern === 'glass') return 'prism';
    if (surfacePattern === 'water') return 'caustic';
    return 'ambient';
  }

  function morphologyBoundMaterial(program = {}, part = {}) {
    const binding = (program.promptPropertyBindings || []).find((row) => (
      row &&
      row.status === 'bound' &&
      row.propertyKind === 'material' &&
      (
        !Array.isArray(row.matchedPartIds) ||
        !row.matchedPartIds.length ||
        row.matchedPartIds.includes(part.id)
      )
    ));
    return String(binding && binding.value || '').toLowerCase();
  }

  function morphologyAccentStrength(pattern = 'ambient', unit = 0.5) {
    if (pattern === 'ambient') return 0.05 + unit * 0.04;
    if (pattern === 'soft-rim' || pattern === 'edge-glint') return 0.1 + unit * 0.08;
    if (pattern === 'scan' || pattern === 'speedline') return 0.12 + unit * 0.09;
    return 0.16 + unit * 0.14;
  }

  function morphologyAccentSpeed(pattern = 'ambient') {
    return Number(ACCENT_SPEEDS[pattern] || 0);
  }

  function objectMorphologyReceipt(parts = [], identityType = 'object', program = {}) {
    const contours = uniqueStrings(parts.map((part) => part.contourProfile || part.primitive));
    const surfaces = uniqueStrings(parts.map((part) => part.surfacePattern));
    const accents = uniqueStrings(parts.map((part) => part.accentPattern));
    const dynamicAccentPartCount = parts.filter((part) => (
      Number(part.accentParameters && part.accentParameters[2] || 0) > 0
    )).length;
    const featureClasses = uniqueStrings(parts.map((part) => part.visualFeatureClass));
    const distinctive = parts.filter((part) => part.visualFeatureClass !== 'generic').length;
    const signatureContourCount = contours.filter((contour) => SIGNATURE_CONTOURS.has(contour)).length;
    const contourDiversity = parts.length ? Math.min(1, contours.length / Math.min(5, parts.length)) : 0;
    const featureCoverage = parts.length ? distinctive / parts.length : 0;
    const topologyWeight = Math.min(1, parts.length / 6);
    const specificityScore = Number((
      contourDiversity * 0.4 +
      featureCoverage * 0.35 +
      topologyWeight * 0.2 +
      (surfaces.some((value) => value !== 'solid') ? 0.05 : 0)
    ).toFixed(4));
    const pass = parts.length >= 2 &&
      (distinctive >= 1 || signatureContourCount >= 1) &&
      (contours.length >= 2 || featureClasses.length >= 3 || signatureContourCount >= 1) &&
      specificityScore >= 0.48;
    return {
      schema: MORPHOLOGY_RECEIPT_SCHEMA,
      identityType,
      grammarId: program.grammarId || '',
      partCount: parts.length,
      distinctivePartCount: distinctive,
      signatureContourCount,
      contourProfiles: contours,
      surfacePatterns: surfaces,
      accentPatterns: accents,
      dynamicAccentPartCount,
      featureClasses,
      boundedContourRuleCount: CONTOUR_RULES.length,
      boundedSurfaceRuleCount: SURFACE_RULES.length,
      boundedAccentRuleCount: ACCENT_RULES.length,
      complexity: `O(${parts.length} parts * ${
        CONTOUR_RULES.length + SURFACE_RULES.length + ACCENT_RULES.length
      } bounded rules)`,
      contourDiversity: Number(contourDiversity.toFixed(4)),
      featureCoverage: Number(featureCoverage.toFixed(4)),
      specificityScore,
      pass,
    };
  }

  function morphologyFeatureClass(part = {}, identityType = 'object') {
    const terms = morphologyTokens([
      part.id,
      part.sourceHint,
      part.constructionRole,
      part.constructionPartId,
    ].filter(Boolean).join(' '));
    const specific = terms.filter((term) => !GENERIC_PART_TERMS.has(term) && term !== identityType);
    return specific[0] || (part.constructionRole && part.constructionRole !== 'detail'
      ? String(part.constructionRole)
      : 'generic');
  }

  function morphologyEvidenceText(program = {}, identity = {}, entity = {}) {
    return [
      identity.type,
      identity.category,
      identity.label,
      identity.material,
      identity.sourceLabel,
      entity.label,
      entity.sourceLabel,
      entity.role,
      entity.material,
      entity.visualArchetype,
      program.identityType,
      program.visualArchetype,
      ...(entity.evidence || []),
      ...((entity.construction && entity.construction.classHints) || []),
      ...((entity.construction && entity.construction.shapeHints) || []),
      ...((entity.construction && entity.construction.materialHints) || []),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function morphologyPartText(part = {}, identityType = 'object', evidenceText = '') {
    return [
      identityType,
      part.id,
      part.sourceHint,
      part.constructionRole,
      part.constructionPartId,
      part.texture,
      evidenceText,
    ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]+/g, ' ');
  }

  function morphologyTokens(value = '') {
    return uniqueStrings(String(value || '').toLowerCase().split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2));
  }

  function uniqueStrings(values = []) {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  }

  function morphologySafeId(value = '') {
    return String(value || 'object').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'object';
  }

  root.SimulattePhaseModuleRegistry.define(
    'compositionGraph',
    'simulatte-object-geometry-morphology.js',
    {
      MORPHOLOGY_SCHEMA,
      MORPHOLOGY_RECEIPT_SCHEMA,
      enhanceObjectGeometryProgram,
      objectMorphologyReceipt,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
