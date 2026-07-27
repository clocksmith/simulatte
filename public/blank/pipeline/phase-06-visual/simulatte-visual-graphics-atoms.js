(function attachSimulatteVisualGraphicsAtoms(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteVisualGraphicsAtoms = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createVisualGraphicsAtomsApi() {
  const IDENTITY_GRAPHICS_GRAMMARS = Object.freeze({
    'animal-body': Object.freeze({
      geometry: Object.freeze(['identity-animal-torso', 'identity-animal-head', 'identity-animal-limb-rig']),
      materials: Object.freeze(['identity-biological-surface']),
      motion: Object.freeze([]),
      camera: Object.freeze(['identity-animal-three-quarter-framing']),
    }),
    'plant-cluster': Object.freeze({
      geometry: Object.freeze(['identity-plant-stem-cluster', 'identity-plant-radial-crown', 'identity-plant-ground-contact']),
      materials: Object.freeze(['identity-plant-biological-surface']),
      motion: Object.freeze([]),
      camera: Object.freeze(['identity-plant-close-framing']),
    }),
  });

  function compileIdentityGraphicsAtoms(context = {}) {
    const byCategory = {
      geometry: new Map(),
      materials: new Map(),
      motion: new Map(),
      camera: new Map(),
    };
    const receipts = [];
    for (const object of (context.objects || []).filter(isEvidenceObject)) {
      const shape = String(object.shape || '');
      const grammar = IDENTITY_GRAPHICS_GRAMMARS[shape];
      if (!grammar) continue;
      const objectId = String(object.id || object.semanticRef || object.phrase || shape);
      for (const category of Object.keys(byCategory)) {
        for (const atomId of grammar[category] || []) {
          if (!byCategory[category].has(atomId)) {
            byCategory[category].set(atomId, {
              id: atomId,
              category: category === 'materials' ? 'material' : category,
              label: labelize(atomId),
              sourceMappingIds: [],
              sourceObjectIds: [],
              evidence: [],
              stagingOnly: category === 'motion' || category === 'camera',
            });
          }
          const atom = byCategory[category].get(atomId);
          atom.sourceObjectIds.push(objectId);
          atom.evidence.push(`object-identity:${objectId}`, `object-shape:${shape}`);
        }
      }
      receipts.push({
        id: `receipt:identity:${objectId}`,
        reason: `Identity graphics compiled from accepted object shape ${shape}`,
        objectId,
        shape,
        scientificOperator: false,
      });
    }
    return {
      geometry: Array.from(byCategory.geometry.values()),
      materials: Array.from(byCategory.materials.values()),
      motion: Array.from(byCategory.motion.values()),
      camera: Array.from(byCategory.camera.values()),
      receipts,
    };
  }

  function bindGraphicsAtomsToEntities(entities = [], graphicsAtoms = {}) {
    const categories = ['geometry', 'materials', 'motion', 'camera'];
    return (entities || []).map((entity) => {
      const sourceIds = new Set([
        entity.id,
        entity.sourceObject,
        entity.sourceGraphId,
        ...(entity.sourceIds || []),
      ].filter(Boolean).map(String));
      const boundRows = Object.fromEntries(categories.map((category) => [
        category,
        (graphicsAtoms[category] || []).filter((atom) => (
          (atom.sourceObjectIds || []).some((id) => sourceIds.has(String(id)))
        )),
      ]));
      const atomIds = categories.flatMap((category) => boundRows[category].map((row) => row.id));
      if (!atomIds.length) return entity;
      return {
        ...entity,
        graphicsAtomBindings: {
          schema: 'simulatte.entityGraphicsAtomBindings.v1',
          geometry: boundRows.geometry.map((row) => row.id),
          materials: boundRows.materials.map((row) => row.id),
          motion: boundRows.motion.map((row) => row.id),
          camera: boundRows.camera.map((row) => row.id),
          sourceObjectIds: Array.from(sourceIds).sort(),
        },
        evidence: uniqueStrings([
          ...(entity.evidence || []),
          ...atomIds.map((id) => `graphics-atom:${id}`),
        ]),
      };
    });
  }

  function visualCameraWithGraphicsAtoms(camera = {}, atoms = [], entities = []) {
    const ids = (atoms || []).map((row) => row.id);
    const hasAnimalFraming = ids.includes('identity-animal-three-quarter-framing');
    const hasPlantFraming = ids.includes('identity-plant-close-framing');
    const ownedSourceIds = new Set((atoms || [])
      .flatMap((row) => row.sourceObjectIds || [])
      .map(String));
    const promptEntities = (entities || []).filter((entity) => (
      entity.directlyGrounded === true && entity.supportOnly !== true
    ));
    const isolatedOwnedSubjects = promptEntities.length > 0 && promptEntities.every((entity) => (
      [entity.id, entity.sourceObject, entity.sourceGraphId, ...(entity.sourceIds || [])]
        .filter(Boolean)
        .some((id) => ownedSourceIds.has(String(id)))
    ));
    if ((!hasAnimalFraming && !hasPlantFraming) || !isolatedOwnedSubjects) return { ...camera, atoms };
    if (hasPlantFraming && !hasAnimalFraming) {
      return {
        ...camera,
        mode: 'close-focus-depth',
        archetype: 'close-focus',
        framing: 'macro-detail',
        depth: 'layered',
        atoms,
      };
    }
    return {
      ...camera,
      mode: 'grounded-perspective-depth',
      archetype: hasPlantFraming ? 'subject-group-three-quarter' : 'subject-three-quarter',
      framing: hasPlantFraming ? 'group-three-quarter' : 'subject-three-quarter',
      depth: 'layered',
      atoms,
    };
  }

  function compositionTopologyAtoms(context = {}) {
    const genome = context.visualGenome || {};
    const topology = normalizeText(genome.compositionTopology || '').replace(/\s+/g, '-');
    if (!topology) return [];
    return [{
      id: `composition-topology-${topology}`,
      category: 'geometry',
      label: `Composition topology ${topology}`,
      sourceMappingIds: [],
      evidence: [
        `visual-dialect:${genome.visualDialect || 'compiled-scene'}`,
        `composition-topology:${topology}`,
      ],
    }];
  }

  function atomsForCategory(mappings, matched, key, category) {
    const byId = new Map();
    for (const match of matched || []) {
      const row = (mappings || []).find((item) => item.id === match.id);
      for (const atomId of row && row[key] || []) {
        if (!byId.has(atomId)) {
          byId.set(atomId, {
            id: atomId,
            category,
            label: labelize(atomId),
            uniformSlots: match.uniformSlots || row.uniformSlots || [],
            wgslOperators: match.wgslOperators || row.wgslOperators || [],
            sourceMappingIds: [],
            evidence: [],
          });
        }
        const atom = byId.get(atomId);
        atom.sourceMappingIds.push(match.id);
        atom.evidence.push(`mapping:${match.id}`);
      }
    }
    return Array.from(byId.values()).slice(0, 18);
  }

  function uniqueAtomRows(rows = []) {
    const ids = new Set();
    return (rows || []).filter((row) => row && row.id && !ids.has(row.id) && ids.add(row.id));
  }

  function uniqueStrings(rows = []) {
    return Array.from(new Set(rows.filter(Boolean)));
  }

  function isEvidenceObject(object) {
    const source = String(object && object.source || '');
    if (!object || source === 'catalog') return false;
    return Boolean(source || object.phrase || object.semanticRef || object.physicalRef);
  }

  function labelize(value) {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
  }

  return {
    IDENTITY_GRAPHICS_GRAMMARS,
    atomsForCategory,
    bindGraphicsAtomsToEntities,
    compileIdentityGraphicsAtoms,
    compositionTopologyAtoms,
    uniqueAtomRows,
    visualCameraWithGraphicsAtoms,
  };
});
