(function attachSimulatteObjectGeometryGrammars(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const OBJECT_GEOMETRY_PROGRAM_SCHEMA = 'simulatte.objectGeometryProgram.v1';

    const OBJECT_GEOMETRY_GRAMMARS = Object.freeze({
      dog: grammar('dog', [0.22, 0.12], 32, [
        part('body', 'ellipse', [-0.08, 0.02], [0.62, 0.46], '#9a6337'),
        part('head', 'ellipse', [0.31, -0.08], [0.31, 0.38], '#a96f3f'),
        part('muzzle', 'ellipse', [0.45, 0.01], [0.19, 0.17], '#d5aa72'),
        part('ear-left', 'capsule', [0.23, -0.31], [0.12, 0.27], '#4a2a1b', -0.35),
        part('ear-right', 'capsule', [0.37, -0.3], [0.11, 0.26], '#4a2a1b', 0.24),
        part('front-leg', 'capsule', [0.16, 0.3], [0.11, 0.34], '#7b4728', 1.3),
        part('back-leg', 'capsule', [-0.27, 0.29], [0.11, 0.36], '#7b4728', 1.82),
        part('tail', 'capsule', [-0.43, -0.06], [0.37, 0.1], '#7b4728', -0.34),
        part('eye', 'ellipse', [0.39, -0.12], [0.045, 0.055], '#17110d'),
      ]),
      cat: grammar('cat', [0.19, 0.115], 33, [
        part('body', 'ellipse', [-0.08, 0.03], [0.59, 0.43], '#c8a46b'),
        part('head', 'ellipse', [0.31, -0.08], [0.29, 0.37], '#d8b87d'),
        part('ear-left', 'triangle', [0.23, -0.34], [0.15, 0.25], '#9a774a'),
        part('ear-right', 'triangle', [0.39, -0.34], [0.15, 0.25], '#9a774a'),
        part('front-leg', 'capsule', [0.15, 0.3], [0.08, 0.34], '#aa8656', 1.35),
        part('back-leg', 'capsule', [-0.28, 0.29], [0.08, 0.34], '#aa8656', 1.78),
        part('tail', 'capsule', [-0.43, -0.11], [0.43, 0.075], '#aa8656', -0.58),
        part('eye-left', 'ellipse', [0.27, -0.1], [0.04, 0.055], '#14221a'),
        part('eye-right', 'ellipse', [0.37, -0.1], [0.04, 0.055], '#14221a'),
      ]),
      animal: grammar('animal', [0.2, 0.12], 30, [
        part('body', 'ellipse', [-0.08, 0.02], [0.64, 0.48], '#9f7650'),
        part('head', 'ellipse', [0.32, -0.08], [0.3, 0.38], '#b88a5d'),
        part('front-leg', 'capsule', [0.15, 0.3], [0.1, 0.34], '#79543a', 1.4),
        part('back-leg', 'capsule', [-0.3, 0.3], [0.1, 0.34], '#79543a', 1.72),
        part('tail', 'capsule', [-0.44, -0.06], [0.34, 0.09], '#79543a', -0.4),
      ]),
      person: grammar('person', [0.13, 0.29], 34, [
        part('head', 'ellipse', [0, -0.36], [0.25, 0.2], '#d7a06f'),
        part('hair', 'ellipse', [0, -0.43], [0.25, 0.11], '#33251f'),
        part('torso', 'rounded-box', [0, -0.06], [0.34, 0.42], '#356ea8'),
        part('left-arm', 'capsule', [-0.23, -0.03], [0.12, 0.42], '#d7a06f', 1.82),
        part('right-arm', 'capsule', [0.23, -0.03], [0.12, 0.42], '#d7a06f', 1.32),
        part('left-leg', 'capsule', [-0.11, 0.31], [0.14, 0.45], '#26384f', 1.5),
        part('right-leg', 'capsule', [0.11, 0.31], [0.14, 0.45], '#26384f', 1.64),
      ]),
      'person-sitting': grammar('person-sitting', [0.13, 0.25], 34, [
        part('head', 'ellipse', [0, -0.34], [0.25, 0.2], '#d7a06f'),
        part('hair', 'ellipse', [0, -0.41], [0.25, 0.11], '#33251f'),
        part('torso', 'rounded-box', [0, -0.08], [0.34, 0.43], '#356ea8'),
        part('left-arm', 'capsule', [-0.2, -0.02], [0.11, 0.38], '#d7a06f', 0.45),
        part('right-arm', 'capsule', [0.21, -0.01], [0.11, 0.38], '#d7a06f', -0.45),
        part('left-thigh', 'capsule', [-0.14, 0.2], [0.36, 0.1], '#26384f'),
        part('right-thigh', 'capsule', [0.14, 0.2], [0.36, 0.1], '#26384f'),
        part('left-shin', 'capsule', [-0.27, 0.36], [0.1, 0.32], '#26384f', 1.57),
        part('right-shin', 'capsule', [0.27, 0.36], [0.1, 0.32], '#26384f', 1.57),
      ]),
      tree: grammar('tree', [0.2, 0.36], 12, [
        part('trunk', 'rounded-box', [0, 0.22], [0.18, 0.56], '#6d4024'),
        part('branch-left', 'capsule', [-0.16, -0.02], [0.34, 0.09], '#704226', -0.62),
        part('branch-right', 'capsule', [0.17, -0.07], [0.33, 0.09], '#704226', 0.58),
        part('crown-left', 'ellipse', [-0.22, -0.25], [0.5, 0.44], '#2d7c43'),
        part('crown-right', 'ellipse', [0.22, -0.23], [0.5, 0.46], '#378b4d'),
        part('crown-top', 'ellipse', [0, -0.39], [0.5, 0.44], '#43a45c'),
      ]),
      plant: grammar('plant', [0.16, 0.28], 15, [
        part('stem', 'capsule', [0, 0.18], [0.09, 0.58], '#397347', 1.57),
        part('leaf-left', 'ellipse', [-0.18, 0.02], [0.35, 0.18], '#55a95c', -0.48),
        part('leaf-right', 'ellipse', [0.18, -0.1], [0.35, 0.18], '#63bb68', 0.48),
        part('crown', 'ellipse', [0, -0.33], [0.5, 0.34], '#48a756'),
      ]),
      flower: grammar('flower', [0.14, 0.25], 16, [
        part('stem', 'capsule', [0, 0.22], [0.07, 0.55], '#43844b', 1.57),
        part('petal-left', 'ellipse', [-0.17, -0.29], [0.3, 0.22], '#e96f9d', -0.55),
        part('petal-right', 'ellipse', [0.17, -0.29], [0.3, 0.22], '#ef83aa', 0.55),
        part('petal-top', 'ellipse', [0, -0.41], [0.27, 0.25], '#f294b8'),
        part('center', 'ellipse', [0, -0.29], [0.18, 0.16], '#f6c746'),
      ]),
      building: grammar('building', [0.32, 0.48], 3, [
        part('shell', 'rounded-box', [0, 0.08], [0.82, 0.82], '#9aa6b2'),
        part('roof', 'triangle', [0, -0.42], [0.9, 0.28], '#4b5563'),
        part('door', 'rounded-box', [0, 0.35], [0.2, 0.28], '#3f4c59'),
        part('window-left-top', 'rounded-box', [-0.25, -0.15], [0.18, 0.16], '#8ad4ec'),
        part('window-right-top', 'rounded-box', [0.25, -0.15], [0.18, 0.16], '#8ad4ec'),
        part('window-left-low', 'rounded-box', [-0.25, 0.14], [0.18, 0.16], '#7dc2dc'),
        part('window-right-low', 'rounded-box', [0.25, 0.14], [0.18, 0.16], '#7dc2dc'),
      ]),
      table: grammar('table', [0.29, 0.19], 22, [
        part('top', 'rounded-box', [0, -0.22], [0.9, 0.2], '#8a552f'),
        part('left-leg', 'rounded-box', [-0.32, 0.18], [0.12, 0.62], '#6d3f24'),
        part('right-leg', 'rounded-box', [0.32, 0.18], [0.12, 0.62], '#6d3f24'),
      ]),
      chair: grammar('chair', [0.16, 0.23], 24, [
        part('back', 'rounded-box', [0, -0.28], [0.62, 0.18], '#7b4c2b'),
        part('back-left', 'rounded-box', [-0.25, -0.06], [0.1, 0.55], '#6c3f24'),
        part('back-right', 'rounded-box', [0.25, -0.06], [0.1, 0.55], '#6c3f24'),
        part('seat', 'rounded-box', [0, 0.06], [0.68, 0.18], '#96603a'),
        part('left-leg', 'rounded-box', [-0.22, 0.32], [0.1, 0.48], '#5c351f'),
        part('right-leg', 'rounded-box', [0.22, 0.32], [0.1, 0.48], '#5c351f'),
      ]),
      television: grammar('television', [0.24, 0.18], 23, [
        part('frame', 'rounded-box', [0, -0.08], [0.94, 0.7], '#202833'),
        part('screen', 'rounded-box', [0, -0.08], [0.8, 0.56], '#3e9bc4'),
        part('screen-light', 'rounded-box', [-0.12, -0.16], [0.45, 0.24], '#9ee8f2', -0.08, 0.72),
        part('stem', 'rounded-box', [0, 0.31], [0.09, 0.22], '#252d36'),
        part('stand', 'rounded-box', [0, 0.43], [0.42, 0.1], '#252d36'),
      ]),
      galaxy: grammar('galaxy', [0.5, 0.42], 2, [
        part('halo', 'ellipse', [0, 0], [0.92, 0.72], '#25336f', -0.16, 0.34),
        part('spiral', 'spiral', [0, 0], [0.94, 0.82], '#9bc9ff', -0.18),
        part('core', 'ellipse', [0, 0], [0.18, 0.14], '#fff1b5'),
        part('star-one', 'star', [-0.32, -0.18], [0.08, 0.08], '#ffffff'),
        part('star-two', 'star', [0.31, 0.16], [0.06, 0.06], '#d9f1ff'),
      ]),
      star: grammar('star', [0.08, 0.08], 18, [
        part('star', 'star', [0, 0], [0.9, 0.9], '#fff2a6'),
        part('core', 'ellipse', [0, 0], [0.32, 0.32], '#ffffff'),
      ]),
      planet: grammar('planet', [0.11, 0.11], 19, [
        part('planet', 'ellipse', [0, 0], [0.82, 0.82], '#4b8cc9'),
        part('shade', 'ellipse', [0.17, 0.03], [0.55, 0.75], '#235187', 0, 0.72),
        part('ring', 'ring', [0, 0], [0.98, 0.38], '#d7c79b', -0.18),
      ]),
      'black-hole': grammar('black-hole', [0.22, 0.22], 17, [
        part('accretion-outer', 'ring', [0, 0], [0.98, 0.44], '#f3a448', -0.22),
        part('accretion-inner', 'ring', [0, 0], [0.7, 0.29], '#ffe1a0', -0.22),
        part('event-horizon', 'ellipse', [0, 0], [0.42, 0.42], '#02030a'),
      ]),
      water: grammar('water', [0.5, 0.26], 1, [
        part('water-body', 'wave', [0, 0.08], [0.98, 0.72], '#247fb5', 0, 0.72),
        part('water-highlight', 'wave', [0, -0.12], [0.92, 0.3], '#7dd9ee', 0, 0.62),
      ]),
      mountain: grammar('mountain', [0.35, 0.32], 7, [
        part('peak-left', 'triangle', [-0.2, 0.08], [0.72, 0.78], '#66716f'),
        part('peak-right', 'triangle', [0.23, 0.13], [0.64, 0.67], '#7a8580'),
        part('snow', 'triangle', [-0.2, -0.15], [0.27, 0.25], '#eef5f4'),
      ]),
      car: grammar('car', [0.25, 0.13], 25, [
        part('body', 'rounded-box', [0, 0.08], [0.9, 0.42], '#c43f3f'),
        part('cabin', 'rounded-box', [0.08, -0.2], [0.48, 0.32], '#75b9d0'),
        part('wheel-left', 'ring', [-0.29, 0.28], [0.22, 0.22], '#1d2329'),
        part('wheel-right', 'ring', [0.3, 0.28], [0.22, 0.22], '#1d2329'),
      ]),
      robot: grammar('robot', [0.23, 0.22], 28, [
        part('base', 'rounded-box', [-0.28, 0.3], [0.4, 0.22], '#65717e'),
        part('arm-lower', 'capsule', [-0.14, 0.08], [0.48, 0.14], '#aeb8c2', -0.78),
        part('joint', 'ellipse', [0.02, -0.08], [0.2, 0.2], '#e18a31'),
        part('arm-upper', 'capsule', [0.22, -0.2], [0.48, 0.13], '#bac5ce', 0.46),
        part('gripper-left', 'capsule', [0.43, -0.25], [0.22, 0.08], '#404a54', 0.82),
        part('gripper-right', 'capsule', [0.43, -0.11], [0.22, 0.08], '#404a54', -0.82),
      ]),
      instrument: grammar('instrument', [0.22, 0.17], 26, [
        part('case', 'rounded-box', [0, 0], [0.92, 0.76], '#344252'),
        part('display', 'rounded-box', [0, -0.13], [0.66, 0.3], '#65c7da'),
        part('dial-left', 'ring', [-0.22, 0.23], [0.18, 0.18], '#d7e0e6'),
        part('dial-right', 'ring', [0.22, 0.23], [0.18, 0.18], '#d7e0e6'),
      ]),
      structure: grammar('structure', [0.22, 0.2], 8, [
        part('body', 'rounded-box', [0, 0], [0.88, 0.78], '#87929c'),
        part('support-left', 'rounded-box', [-0.3, 0.24], [0.12, 0.42], '#5d6872'),
        part('support-right', 'rounded-box', [0.3, 0.24], [0.12, 0.42], '#5d6872'),
      ], false),
      object: grammar('object', [0.16, 0.14], 20, [
        part('body', 'rounded-box', [0, 0], [0.88, 0.78], '#778592'),
      ], false),
    });

    const OBJECT_COMPOSITION_LAYOUTS = Object.freeze({
      water: layout(1, [[0.5, 0.72, 0.78, 0.3]]),
      galaxy: layout(1, [[0.34, 0.43, 0.48, 0.4]]),
      'black-hole': layout(1, [[0.52, 0.47, 0.24, 0.22]]),
      building: layout(1, [[0.5, 0.55, 0.44, 0.54]]),
      television: layout(1, [[0.76, 0.43, 0.23, 0.17]]),
      table: layout(2, [[0.55, 0.68, 0.31, 0.18], [0.72, 0.7, 0.25, 0.16]]),
      chair: layout(2, [[0.37, 0.64, 0.16, 0.23], [0.65, 0.64, 0.16, 0.23]]),
      person: layout(6, [[0.32, 0.47, 0.13, 0.28], [0.58, 0.48, 0.13, 0.28]]),
      tree: layout(4, [[0.13, 0.58, 0.15, 0.3], [0.87, 0.58, 0.15, 0.3]]),
      plant: layout(5, [[0.18, 0.68, 0.14, 0.25], [0.82, 0.68, 0.14, 0.25]]),
      flower: layout(6, [[0.22, 0.69, 0.13, 0.23], [0.78, 0.69, 0.13, 0.23]]),
      mountain: layout(3, [[0.5, 0.54, 0.42, 0.34], [0.2, 0.57, 0.3, 0.28]]),
      dog: layout(3, [[0.35, 0.57, 0.22, 0.12], [0.25, 0.64, 0.2, 0.11], [0.43, 0.66, 0.18, 0.1]]),
      cat: layout(3, [[0.62, 0.58, 0.19, 0.115], [0.72, 0.65, 0.18, 0.11], [0.55, 0.67, 0.17, 0.1]]),
      star: layout(8, [[0.17, 0.2, 0.09, 0.09], [0.72, 0.18, 0.07, 0.07], [0.82, 0.72, 0.06, 0.06]]),
      planet: layout(4, [[0.75, 0.43, 0.14, 0.14], [0.61, 0.72, 0.1, 0.1], [0.83, 0.67, 0.08, 0.08]]),
      car: layout(4, [[0.3, 0.76, 0.25, 0.13], [0.68, 0.76, 0.25, 0.13]]),
      robot: layout(4, [[0.5, 0.56, 0.24, 0.23], [0.73, 0.58, 0.21, 0.2]]),
      instrument: layout(4, [[0.78, 0.72, 0.19, 0.14], [0.2, 0.72, 0.19, 0.14]]),
    });

    function layout(limit, placements) {
      return Object.freeze({ limit, placements: Object.freeze(placements.map((row) => Object.freeze(row))) });
    }

    function grammar(id, minScale, zOrder, parts, literal = true) {
      return Object.freeze({ id, minScale: Object.freeze(minScale), zOrder, parts: Object.freeze(parts), literal });
    }

    function part(id, primitive, center, size, fill, rotation = 0, opacity = 1) {
      return Object.freeze({
        id,
        primitive,
        center: Object.freeze(center),
        size: Object.freeze(size),
        rotation,
        fill,
        opacity,
      });
    }

    function objectGeometryProgramForIdentity(identity = {}, geometry = {}, entity = {}) {
      const identityType = objectGeometryIdentityType(identity, geometry, entity);
      const evidenceText = [identity.sourceLabel, identity.label, entity.label, entity.role]
        .filter(Boolean).join(' ').toLowerCase();
      const pose = identityType === 'person' && /\b(sit|sits|sitting|seated)\b/.test(evidenceText)
        ? 'sitting'
        : '';
      const selectedKey = pose === 'sitting' ? 'person-sitting' : identityType;
      const selected = OBJECT_GEOMETRY_GRAMMARS[selectedKey] || OBJECT_GEOMETRY_GRAMMARS.object;
      return {
        schema: OBJECT_GEOMETRY_PROGRAM_SCHEMA,
        grammarId: `object-grammar.${selected.id}`,
        identityType,
        pose,
        literal: selected.literal === true,
        minScale: selected.minScale.slice(),
        zOrder: selected.zOrder,
        parts: selected.parts.map((row, order) => ({ ...row, center: row.center.slice(), size: row.size.slice(), order })),
        source: 'phase6-object-geometry-grammar',
        sourcePrimitive: geometry.primitive || entity.shape || '',
      };
    }

    function objectGeometryIdentityType(identity = {}, geometry = {}, entity = {}) {
      const direct = String(identity.type || '').toLowerCase();
      if (OBJECT_GEOMETRY_GRAMMARS[direct]) return direct;
      const text = [
        direct,
        identity.label,
        identity.sourceLabel,
        identity.primitive,
        geometry.primitive,
        entity.id,
        entity.label,
        entity.sourceObject,
        entity.semanticRef,
      ].filter(Boolean).join(' ').toLowerCase();
      const rules = [
        ['black-hole', /\bblack[- ]hole\b|event[- ]horizon/],
        ['television', /\b(tv|television|screen|monitor)\b/],
        ['building', /\b(building|house|skyscraper|apartment)\b/],
        ['person', /\b(person|human|people|worker|runner)\b/],
        ['chair', /\b(chair|stool|seat)\b/],
        ['table', /\b(table|desk|bench)\b/],
        ['galaxy', /\b(galaxy|nebula)\b/],
        ['planet', /\b(planet|moon|world)\b/],
        ['star', /\b(star|sun)\b/],
        ['tree', /\b(tree|trees|forest|oak|pine|willow|maple)\b/],
        ['flower', /\b(flower|rose|sunflower|orchid)\b/],
        ['mountain', /\b(mountain|mountains|peak|ridge)\b/],
        ['car', /\b(car|automobile|vehicle|truck)\b/],
      ];
      const match = rules.find(([, pattern]) => pattern.test(text));
      return match ? match[0] : direct || 'object';
    }

    function scenePacketReadableTransform(transform = {}, program = {}) {
      const position = Array.isArray(transform.position) ? transform.position.slice() : [0.5, 0.5, 0];
      const scale = Array.isArray(transform.scale) ? transform.scale.slice() : [0.16, 0.14, 1];
      const minScale = Array.isArray(program.minScale) ? program.minScale : [0.16, 0.14];
      scale[0] = Math.max(Number(scale[0] || 0), Number(minScale[0] || 0));
      scale[1] = Math.max(Number(scale[1] || 0), Number(minScale[1] || 0));
      position[0] = clamp(Number(position[0] || 0.5), scale[0] * 0.52, 1 - scale[0] * 0.52);
      position[1] = clamp(Number(position[1] || 0.5), scale[1] * 0.52, 1 - scale[1] * 0.52);
      return { ...transform, position, scale };
    }

    function objectGeometryProgramCoverage(program = {}) {
      const parts = Array.isArray(program.parts) ? program.parts : [];
      return {
        schema: 'simulatte.objectGeometryCoverage.v1',
        grammarId: program.grammarId || '',
        identityType: program.identityType || '',
        literal: program.literal === true,
        partCount: parts.length,
        primitiveCount: new Set(parts.map((row) => row.primitive).filter(Boolean)).size,
        minScale: Array.isArray(program.minScale) ? program.minScale.slice(0, 2) : [],
        realized: program.literal === true && parts.length >= 2,
      };
    }

    function scenePacketComposeLiteralEntities(entities = []) {
      const counts = new Map();
      const keptByType = new Map();
      const output = [];
      for (const entity of entities) {
        const program = entity && entity.geometry && entity.geometry.program || {};
        const type = String(entity && entity.identity && entity.identity.type || program.identityType || '');
        const composition = program.literal === true && OBJECT_COMPOSITION_LAYOUTS[type];
        if (!composition) {
          output.push(entity);
          continue;
        }
        const count = counts.get(type) || 0;
        counts.set(type, count + 1);
        if (count >= composition.limit) {
          const representedBy = keptByType.get(type);
          if (representedBy) {
            representedBy.representedEntityIds = uniqueList([
              ...(representedBy.representedEntityIds || [representedBy.id]),
              entity.id,
              ...(entity.representedEntityIds || []),
            ]);
          }
          continue;
        }
        const placement = type === 'person' && program.pose === 'sitting'
          ? [0.37, 0.51, 0.13, 0.25]
          : composition.placements[count % composition.placements.length];
        const existing = entity.transform || {};
        const transform = {
          ...existing,
          position: [placement[0], placement[1], Number(existing.position && existing.position[2] || 0)],
          rotation: [0, 0, 0],
          scale: [placement[2], placement[3], 1],
        };
        const bounds = [
          transform.position[0] - transform.scale[0] * 0.5,
          transform.position[1] - transform.scale[1] * 0.5,
          transform.scale[0],
          transform.scale[1],
        ];
        const composed = {
          ...entity,
          representedEntityIds: uniqueList([entity.id, ...(entity.representedEntityIds || [])]),
          transform,
          geometry: { ...entity.geometry, bounds },
          collider: { ...entity.collider, bounds },
        };
        if (!keptByType.has(type)) keptByType.set(type, composed);
        output.push(composed);
      }
      return output;
    }

    Object.assign(scope, {
      OBJECT_GEOMETRY_PROGRAM_SCHEMA,
      OBJECT_GEOMETRY_GRAMMARS,
      objectGeometryProgramForIdentity,
      objectGeometryIdentityType,
      scenePacketReadableTransform,
      objectGeometryProgramCoverage,
      OBJECT_COMPOSITION_LAYOUTS,
      scenePacketComposeLiteralEntities,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
