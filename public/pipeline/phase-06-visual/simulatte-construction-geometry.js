(function attachSimulatteConstructionGeometry(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const CONSTRUCTION_GEOMETRY_SCHEMA = 'simulatte.constructiveGeometryProgram.v1';
    const NUMBER_WORDS = Object.freeze({
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
      nine: 9, ten: 10, eleven: 11, twelve: 12, sixteen: 16,
    });

    function constructionGeometryProgramForEntity(identity = {}, geometry = {}, entity = {}) {
      const construction = entity.construction || geometry.construction || null;
      if (!construction || construction.schema !== 'simulatte.constructionProgramInput.v1') return null;
      const descriptors = constructionPartDescriptors(construction);
      const materialPalette = constructionMaterialPalette(construction.materialHints || []);
      const topologyParts = constructionTopologyParts(construction, materialPalette);
      const parts = topologyParts.length ? topologyParts : constructionParts(descriptors, materialPalette);
      if (!parts.length) return null;
      const sourceIds = construction.sourceCardIds || [];
      const provenance = entity.constructionProvenance || [];
      const identityType = String(identity.type || construction.targetEntryId || 'constructed-object')
        .replace(/^[a-z]+:/, '');
      return {
        schema: 'simulatte.objectGeometryProgram.v1',
        constructionSchema: CONSTRUCTION_GEOMETRY_SCHEMA,
        grammarId: `object-grammar.constructive.${constructionGeometrySafeId(sourceIds[0] || identityType)}`,
        identityType,
        visualArchetype: (construction.shapeHints || [])[0] || 'constructed-object',
        pose: '',
        literal: true,
        minScale: constructionMinimumScale(construction, parts.length),
        zOrder: 30,
        parts,
        source: 'phase3-model-construction-evidence',
        sourcePrimitive: geometry.primitive || entity.shape || '',
        constructionReceipt: {
          schema: 'simulatte.constructiveGeometryReceipt.v1',
          sourceCardIds: sourceIds.slice(),
          basisIds: (construction.basisIds || []).slice(),
          inputPartHintCount: (construction.partHints || []).length,
          realizedPartCount: parts.length,
          modelEvaluated: provenance.some((row) => row.modelEvaluated === true),
          rerankEvaluated: provenance.some((row) => row.rerankEvaluated === true),
          literalSlotMatch: provenance.some((row) => row.literalSlotMatch === true),
          exactTargetMatch: provenance.some((row) => row.exactTargetMatch === true),
          candidateIds: provenance.map((row) => row.candidateId).filter(Boolean),
        },
      };
    }

    function constructionPartDescriptors(construction = {}) {
      const hints = uniqueList([
        ...(construction.partHints || []),
        ...(construction.shapeHints || []),
      ]).slice(0, 20);
      const descriptors = hints.map((hint) => constructionDescriptor(hint)).filter(Boolean);
      if (!descriptors.some((row) => row.role === 'core')) {
        descriptors.unshift({ id: 'structural-core', role: 'core', primitive: constructionCorePrimitive(construction), count: 1 });
      }
      if (descriptors.length === 1) {
        descriptors.push({ id: 'surface-detail', role: 'detail', primitive: 'ellipse', count: 2 });
      }
      return descriptors;
    }

    function constructionTopologyParts(construction = {}, palette = []) {
      const evidence = [
        ...(construction.classHints || []),
        ...(construction.shapeHints || []),
        ...(construction.basisIds || []),
        ...(construction.sourceCardIds || []),
        ...(construction.partHints || []),
      ].join(' ').toLowerCase();
      const color = (index) => palette[index % Math.max(1, palette.length)];
      const row = (id, primitive, center, size, colorIndex, rotation = 0) => (
        constructionGeometryPart(id, primitive, center, size, color(colorIndex), rotation)
      );
      if (/ocean[_ .-]wave|fluid[_ -]surface|wavefront|foam line/.test(evidence)) {
        return [
          row('water-body', 'wave', [0, 0.12], [0.98, 0.58], 0),
          row('crest', 'wave', [0, -0.16], [0.94, 0.2], 2),
          row('foam-line', 'capsule', [0.02, -0.28], [0.88, 0.05], 1, -0.04),
          row('trough', 'wave', [-0.04, 0.28], [0.86, 0.16], 3),
        ];
      }
      if (/sea[_ .-]ice|cryosphere[_ -]surface|plate[_ -]field|ice floe/.test(evidence)) {
        return [
          row('floe-left', 'rounded-box', [-0.28, 0.04], [0.46, 0.38], 1, -0.12),
          row('floe-center', 'rounded-box', [0.05, -0.08], [0.42, 0.35], 0, 0.08),
          row('floe-right', 'rounded-box', [0.34, 0.1], [0.38, 0.3], 2, -0.06),
          row('pressure-ridge', 'capsule', [0.02, -0.27], [0.7, 0.07], 1, 0.12),
          row('crack-seam', 'capsule', [-0.08, 0.15], [0.62, 0.035], 3, -0.48),
          row('brine-channel', 'capsule', [0.16, 0.22], [0.45, 0.04], 2, 0.32),
        ];
      }
      if (/environment[_ .-]fjord|glacial[_ -]basin|fjord|cliff walls/.test(evidence)) {
        return [
          row('water-basin', 'wave', [0, 0.2], [0.94, 0.46], 0),
          row('cliff-left', 'triangle', [-0.4, -0.02], [0.42, 0.82], 3, 0.08),
          row('cliff-right', 'triangle', [0.4, -0.02], [0.42, 0.82], 3, -0.08),
          row('shore-left', 'capsule', [-0.3, 0.29], [0.48, 0.06], 2, -0.28),
          row('shore-right', 'capsule', [0.3, 0.29], [0.48, 0.06], 2, 0.28),
          row('glacier-mouth', 'rounded-box', [0, -0.28], [0.36, 0.24], 1),
        ];
      }
      if (/environment[_ .-]glacier|cryosphere[_ -]mass|ice[_ -]mass|layered[_ -]wedge|crevasse/.test(evidence)) {
        return [
          row('ice-tongue', 'triangle', [-0.08, 0.08], [0.92, 0.76], 0, 1.57),
          row('upper-ice', 'rounded-box', [-0.2, -0.24], [0.56, 0.32], 1, -0.06),
          row('terminus', 'triangle', [0.36, 0.12], [0.34, 0.55], 2, 1.5),
          row('crevasse-left', 'capsule', [-0.25, -0.08], [0.34, 0.035], 3, 1.02),
          row('crevasse-right', 'capsule', [0.02, -0.02], [0.38, 0.035], 3, 0.92),
          row('meltwater', 'wave', [0.18, 0.34], [0.52, 0.12], 2),
          row('bedrock-contact', 'capsule', [-0.12, 0.38], [0.72, 0.08], 3, -0.04),
        ];
      }
      if (/articulated[_ -]machine|linked[_ -]rigid[_ -]bodies|articulated[_ -]gripper/.test(evidence)) {
        return [
          row('base', 'rounded-box', [-0.3, 0.32], [0.4, 0.22], 3),
          row('lower-link', 'capsule', [-0.16, 0.08], [0.5, 0.14], 0, -0.78),
          row('elbow-joint', 'ring', [0.02, -0.08], [0.2, 0.2], 2),
          row('upper-link', 'capsule', [0.22, -0.2], [0.5, 0.13], 1, 0.46),
          row('wrist-joint', 'ring', [0.4, -0.18], [0.15, 0.15], 2),
          row('gripper-left', 'capsule', [0.5, -0.28], [0.24, 0.07], 3, 0.82),
          row('gripper-right', 'capsule', [0.5, -0.1], [0.24, 0.07], 3, -0.82),
        ];
      }
      if (/transport[_ -]machine|belt[_ -]loop|conveyor/.test(evidence)) {
        return [
          row('belt', 'rounded-box', [0, 0.04], [0.96, 0.34], 3),
          row('lane', 'rounded-box', [0, -0.02], [0.82, 0.13], 1),
          row('roller-left', 'ring', [-0.38, 0.2], [0.18, 0.18], 0),
          row('roller-right', 'ring', [0.38, 0.2], [0.18, 0.18], 0),
        ];
      }
      if (/\b(parcel|package|carton|shipping box)\b/.test(evidence)) {
        return [
          row('carton', 'rounded-box', [0, 0.04], [0.82, 0.72], 0),
          row('top', 'rounded-box', [0, -0.32], [0.82, 0.12], 1),
          row('tape-vertical', 'rounded-box', [0, 0.01], [0.12, 0.76], 2),
          row('label', 'rounded-box', [0.22, 0.12], [0.25, 0.18], 3),
        ];
      }
      if (/human[_ -]body|upright[_ -]articulated/.test(evidence)) {
        return [
          row('head', 'ellipse', [0, -0.37], [0.24, 0.2], 2),
          row('torso', 'rounded-box', [0, -0.08], [0.34, 0.42], 0),
          row('left-arm', 'capsule', [-0.23, -0.04], [0.42, 0.1], 2, 1.82),
          row('right-arm', 'capsule', [0.23, -0.04], [0.42, 0.1], 2, 1.32),
          row('left-leg', 'capsule', [-0.11, 0.3], [0.46, 0.13], 1, 1.5),
          row('right-leg', 'capsule', [0.11, 0.3], [0.46, 0.13], 1, 1.64),
        ];
      }
      if (/mammal|rodent|articulated[_ -]body|small-mammal|large-mammal/.test(evidence)) {
        return [
          row('torso', 'ellipse', [-0.08, 0.02], [0.64, 0.46], 0),
          row('head', 'ellipse', [0.31, -0.09], [0.3, 0.36], 1),
          row('front-leg', 'capsule', [0.16, 0.3], [0.36, 0.1], 0, 1.36),
          row('rear-leg', 'capsule', [-0.27, 0.3], [0.37, 0.1], 0, 1.76),
          row('tail', 'capsule', [-0.43, -0.07], [0.37, 0.08], 1, -0.42),
          row('eye', 'ellipse', [0.38, -0.13], [0.05, 0.05], 3),
        ];
      }
      if (/plant|branching[_ -]structure|plant-body/.test(evidence)) {
        return [
          row('trunk', 'capsule', [0, 0.2], [0.58, 0.13], 3, 1.57),
          row('branch-left', 'capsule', [-0.16, -0.05], [0.36, 0.08], 3, -0.62),
          row('branch-right', 'capsule', [0.17, -0.08], [0.34, 0.08], 3, 0.58),
          row('canopy-left', 'ellipse', [-0.2, -0.25], [0.48, 0.42], 0),
          row('canopy-right', 'ellipse', [0.2, -0.24], [0.48, 0.42], 1),
          row('canopy-top', 'ellipse', [0, -0.39], [0.48, 0.4], 1),
        ];
      }
      if (/built[_ -]environment|building|architectural|operations[_ -]scene/.test(evidence)) {
        return [
          row('shell', 'rounded-box', [0, 0.08], [0.82, 0.82], 0),
          row('roof', 'triangle', [0, -0.42], [0.9, 0.28], 1),
          row('door', 'rounded-box', [0, 0.35], [0.2, 0.28], 3),
          row('window-left', 'rounded-box', [-0.25, -0.12], [0.18, 0.16], 2),
          row('window-right', 'rounded-box', [0.25, -0.12], [0.18, 0.16], 2),
        ];
      }
      if (/winged[_ -]body|aircraft/.test(evidence)) {
        return [
          row('body', 'capsule', [0, 0], [0.9, 0.18], 0),
          row('wing-left', 'triangle', [-0.02, 0.13], [0.58, 0.36], 1, 0.08),
          row('wing-right', 'triangle', [-0.02, -0.13], [0.58, 0.36], 2, 3.22),
          row('tail', 'triangle', [-0.38, -0.12], [0.28, 0.26], 3, -0.12),
        ];
      }
      if (/wheeled[_ -]vehicle|frame[_ -]with[_ -]wheels/.test(evidence)) {
        return [
          row('chassis', 'rounded-box', [0, 0.02], [0.76, 0.34], 0),
          row('wheel-left', 'ring', [-0.29, 0.25], [0.25, 0.25], 3),
          row('wheel-right', 'ring', [0.29, 0.25], [0.25, 0.25], 3),
          row('cabin', 'rounded-box', [0.08, -0.2], [0.46, 0.28], 2),
        ];
      }
      if (/flat[_ -]panel|electrical[_ -]network|display/.test(evidence)) {
        return [
          row('frame', 'rounded-box', [0, -0.08], [0.94, 0.7], 3),
          row('screen', 'rounded-box', [0, -0.08], [0.8, 0.56], 2),
          row('stem', 'rounded-box', [0, 0.31], [0.09, 0.22], 0),
          row('stand', 'rounded-box', [0, 0.43], [0.42, 0.1], 0),
        ];
      }
      if (/fluid[_ -](?:domain|channel)|natural[_ -]environment/.test(evidence)) {
        return [
          row('fluid-body', 'wave', [0, 0.08], [0.98, 0.72], 0),
          row('shore-boundary', 'capsule', [0, 0.35], [0.9, 0.08], 3),
          row('surface-highlight', 'wave', [0, -0.12], [0.92, 0.3], 2),
        ];
      }
      return [];
    }

    function constructionDescriptor(hint = '') {
      const text = String(hint || '').toLowerCase().trim();
      if (!text) return null;
      const count = constructionPartCount(text);
      if (/body|core|torso|case|shell|container|hull|frame|mass|volume/.test(text)) {
        return { id: text, role: 'core', primitive: /round|ellipsoid|sphere|soft|organic/.test(text) ? 'ellipse' : 'rounded-box', count: 1 };
      }
      if (/leg|foot|feet|support|pillar|pier|column|stand|root/.test(text)) {
        return { id: text, role: 'support', primitive: /pillar|pier|column|stand/.test(text) ? 'rounded-box' : 'capsule', count: Math.max(2, count) };
      }
      if (/arm|limb|branch|cable|pipe|tail|neck|strand|rod|beam|spoke/.test(text)) {
        return { id: text, role: 'appendage', primitive: 'capsule', count: Math.max(1, count) };
      }
      if (/wheel|ring|orbit|joint|bearing|loop/.test(text)) {
        return { id: text, role: 'joint', primitive: 'ring', count: Math.max(1, count) };
      }
      if (/wing|leaf|fin|blade|petal|panel|deck|roof|screen|surface|plane/.test(text)) {
        return { id: text, role: 'panel', primitive: /wing|leaf|fin|blade|petal/.test(text) ? 'triangle' : 'rounded-box', count: Math.max(1, count) };
      }
      if (/head|sensor|eye|lens|camera|antenna|node|knob|light/.test(text)) {
        return { id: text, role: 'sensor', primitive: /lens|eye|camera/.test(text) ? 'ring' : 'ellipse', count: Math.max(1, count) };
      }
      if (/door|window|opening|aperture|mouth|cavity|interior/.test(text)) {
        return { id: text, role: 'opening', primitive: /aperture|cavity/.test(text) ? 'ring' : 'rounded-box', count: Math.max(1, count) };
      }
      return { id: text, role: 'detail', primitive: /line|track|path|vein/.test(text) ? 'capsule' : 'ellipse', count: Math.max(1, count) };
    }

    function constructionParts(descriptors = [], palette = []) {
      const parts = [];
      const counts = new Map();
      for (const descriptor of descriptors) {
        const limit = Math.min(8, descriptor.count || 1);
        for (let index = 0; index < limit && parts.length < 24; index += 1) {
          const roleIndex = counts.get(descriptor.role) || 0;
          counts.set(descriptor.role, roleIndex + 1);
          parts.push(constructionPart(descriptor, roleIndex, index, palette, parts.length));
        }
      }
      return parts.map((part, order) => ({ ...part, order }));
    }

    function constructionPart(descriptor, roleIndex, repeatIndex, palette, order) {
      const color = palette[order % palette.length];
      const id = `${constructionGeometrySafeId(descriptor.id)}-${repeatIndex + 1}`;
      if (descriptor.role === 'core') {
        return constructionGeometryPart(id, descriptor.primitive, [0, 0], [0.68, 0.58], color);
      }
      if (descriptor.role === 'support') {
        const direction = roleIndex % 2 ? 1 : -1;
        const rank = Math.floor(roleIndex / 2);
        return constructionGeometryPart(id, descriptor.primitive, [direction * (0.2 + rank * 0.1), 0.3], [0.11, 0.38], color, 1.57);
      }
      if (descriptor.role === 'appendage') {
        const angle = -1.1 + roleIndex * 0.78;
        return constructionGeometryPart(id, descriptor.primitive,
          [Math.cos(angle) * 0.34, Math.sin(angle) * 0.3], [0.42, 0.09], color, angle);
      }
      if (descriptor.role === 'joint') {
        const angle = roleIndex * 2.39996;
        return constructionGeometryPart(id, descriptor.primitive,
          [Math.cos(angle) * 0.29, Math.sin(angle) * 0.24], [0.18, 0.18], color);
      }
      if (descriptor.role === 'panel') {
        const direction = roleIndex % 2 ? 1 : -1;
        return constructionGeometryPart(id, descriptor.primitive,
          [direction * 0.3, -0.08 + Math.floor(roleIndex / 2) * 0.22], [0.38, 0.24], color, direction * 0.18);
      }
      if (descriptor.role === 'sensor') {
        const x = (roleIndex - 1) * 0.16;
        return constructionGeometryPart(id, descriptor.primitive, [x, -0.32], [0.16, 0.16], color);
      }
      if (descriptor.role === 'opening') {
        const x = (roleIndex % 3 - 1) * 0.2;
        const y = -0.06 + Math.floor(roleIndex / 3) * 0.2;
        return constructionGeometryPart(id, descriptor.primitive, [x, y], [0.18, 0.2], color);
      }
      const angle = roleIndex * 2.39996;
      return constructionGeometryPart(id, descriptor.primitive,
        [Math.cos(angle) * 0.22, Math.sin(angle) * 0.18], [0.12, 0.12], color);
    }

    function constructionGeometryPart(id, primitive, center, size, fill, rotation = 0) {
      return { id, primitive, center, size, rotation, fill, opacity: 1 };
    }

    function constructionCorePrimitive(construction = {}) {
      const text = (construction.shapeHints || []).join(' ').toLowerCase();
      return /round|sphere|orb|organic|soft|ellipsoid/.test(text) ? 'ellipse' : 'rounded-box';
    }

    function constructionPartCount(text = '') {
      const numeral = String(text).match(/\b(\d{1,2})\b/);
      if (numeral) return Math.max(1, Math.min(8, Number(numeral[1])));
      const word = Object.keys(NUMBER_WORDS).find((key) => new RegExp(`\\b${key}\\b`).test(text));
      if (word) return Math.min(8, NUMBER_WORDS[word]);
      return /(?:s|feet|leaves)\b/.test(text) ? 2 : 1;
    }

    function constructionMaterialPalette(materialHints = []) {
      const text = materialHints.join(' ').toLowerCase();
      if (/wood|bark|timber/.test(text)) return ['#765035', '#9a704b', '#c19a6b', '#4f3728'];
      if (/plant|leaf|biomass|tissue|organic|fur/.test(text)) return ['#4f8b62', '#79aa6d', '#b88760', '#315d48'];
      if (/glass|crystal|ice|water/.test(text)) return ['#75b8cb', '#a9d9df', '#5d8fb0', '#d5eef0'];
      if (/metal|steel|iron|aluminum|silicon/.test(text)) return ['#647685', '#9eabb4', '#3d4d59', '#c7d0d5'];
      if (/stone|rock|concrete|ceramic/.test(text)) return ['#756f68', '#a39a8e', '#554f4a', '#c0b6a8'];
      if (/fire|plasma|emissive/.test(text)) return ['#d85b36', '#f0a345', '#f4d36b', '#7e342b'];
      return ['#59788b', '#8ba5b2', '#d09a5d', '#405764'];
    }

    function constructionMinimumScale(construction = {}, partCount = 1) {
      const text = (construction.scaleHints || []).join(' ').toLowerCase();
      const base = /microscopic|tiny|small/.test(text) ? 0.12 : /large|architectural|landscape|orbital/.test(text) ? 0.28 : 0.2;
      return [Math.min(0.4, base + partCount * 0.004), Math.min(0.38, base * 0.82 + partCount * 0.003)];
    }

    function constructionGeometrySafeId(value = '') {
      return String(value || 'constructed-object').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'constructed-object';
    }

    Object.assign(scope, {
      CONSTRUCTION_GEOMETRY_SCHEMA,
      constructionGeometryProgramForEntity,
      constructionPartDescriptors,
      constructionTopologyParts,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
