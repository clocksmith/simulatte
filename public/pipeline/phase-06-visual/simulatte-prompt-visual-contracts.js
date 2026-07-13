(function attachSimulattePromptVisualContracts(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  const lexiconApi = typeof module === 'object' && module.exports
    ? require('../../data/simulatte-language-lexicon.js')
    : root.SimulatteLanguageLexicon || {};
  const languageLexicon = lexiconApi.LANGUAGE_LEXICON || {};
  const materialVisualValues = languageLexicon.materialVisualValues || {};
  with (scope) {
    function promptGeometryGrammarKey(identityType = '', entity = {}, pose = '') {
      const type = String(identityType || '').toLowerCase();
      const parts = entity.partGraph || [];
      if (type === 'robot' && parts.some((row) => /^(?:arm|eye)$/.test(String(row.semanticClass || '')))) {
        return 'robot-character';
      }
      if (type === 'bird' && pose === 'flight-extended') return 'bird-flying';
      if (type === 'castle') return 'castle';
      return '';
    }

    function selectPromptGeometryProgram(candidates = [], entity = {}) {
      const hasPromptContracts = (entity.partGraph || []).length > 0 || (entity.properties || []).length > 0 ||
        Boolean(entity.poseHint && entity.poseHint.pose);
      const scored = candidates.map((program, index) => ({
        program,
        index,
        score: hasPromptContracts ? promptGeometryCandidateScore(program, entity) : -index,
      })).sort((a, b) => b.score - a.score || a.index - b.index);
      const selected = scored[0] && scored[0].program || candidates[0] || null;
      if (!selected) return null;
      const applied = applyPromptGeometryContracts(selected, entity);
      return {
        ...applied,
        constructionSelectionReceipt: {
          schema: 'simulatte.constructionSelectionReceipt.v1',
          strategy: 'prompt-obligation-coverage',
          selectedGrammarId: applied.grammarId || '',
          candidates: scored.map((row) => ({
            grammarId: row.program.grammarId || '',
            score: row.score,
          })),
        },
      };
    }

    function promptGeometryCandidateScore(program = {}, entity = {}) {
      const partIds = (program.parts || []).map((row) => String(row.id || '').toLowerCase());
      let score = program.literal === true ? 8 : 0;
      for (const part of entity.partGraph || []) {
        const target = promptSingular(part.semanticClass || part.label);
        score += partIds.some((id) => promptPartMatches(id, target)) ? 7 : -9;
      }
      const pose = entity.poseHint && entity.poseHint.pose || '';
      if (pose) score += String(program.grammarId || '').includes(promptPoseGrammarToken(pose)) ? 12 : -8;
      score += Math.min(6, (program.parts || []).length * 0.25);
      return Number(score.toFixed(3));
    }

    function applyPromptGeometryContracts(program = {}, entity = {}) {
      const parts = (program.parts || []).map((row) => ({
        ...row,
        center: (row.center || []).slice(),
        size: (row.size || []).slice(),
      }));
      const bindings = [];
      for (const property of entity.properties || []) {
        if (property.kind !== 'color' || !property.value) continue;
        for (const part of parts) part.fill = property.value;
        bindings.push(promptGeometryBinding(entity.id, '', property));
      }
      for (const scopedPart of entity.partGraph || []) {
        const target = promptSingular(scopedPart.semanticClass || scopedPart.label);
        const matched = parts.filter((row) => promptPartMatches(row.id, target));
        for (const property of scopedPart.properties || []) {
          if (property.kind === 'color' && property.value) {
            for (const part of matched) {
              part.fill = property.value;
              part.emissive = target === 'eye' ? 0.82 : Number(part.emissive || 0);
              if (target === 'eye') part.metallic = 0.04;
            }
          }
          if (property.kind === 'articulation') {
            for (const part of matched) part.articulation = property.value;
          }
          bindings.push(promptGeometryBinding(entity.id, scopedPart.id, property, matched));
        }
        const materialStyle = materialVisualValues[scopedPart.materialId] || null;
        if (materialStyle) {
          for (const part of matched) {
            part.fill = materialStyle.color || part.fill;
            part.roughness = materialStyle.roughness;
            part.metallic = materialStyle.metallic;
            part.texture = materialStyle.texture;
          }
          bindings.push({
            schema: 'simulatte.promptGeometryBinding.v1',
            entityId: entity.id || '',
            partId: scopedPart.id || '',
            propertyKind: 'material',
            value: scopedPart.materialId,
            matchedPartIds: matched.map((row) => row.id),
            status: matched.length ? 'bound' : 'unbound',
          });
        }
      }
      return {
        ...program,
        pose: entity.poseHint && entity.poseHint.pose || program.pose || '',
        parts,
        promptPropertyBindings: bindings,
      };
    }

    function promptGeometryBinding(entityId, partId, property = {}, matched = []) {
      return {
        schema: 'simulatte.promptGeometryBinding.v1',
        entityId: entityId || '',
        partId: partId || '',
        propertyKind: property.kind || '',
        value: property.value || '',
        matchedPartIds: matched.map((row) => row.id),
        status: partId && !matched.length ? 'unbound' : 'bound',
      };
    }

    function applyPromptEnvironmentVisualGenome(visualGenome = {}, environmentPrograms = []) {
      const program = environmentPrograms.find((row) => row.kind === 'sunset');
      if (!program) return visualGenome;
      return {
        ...visualGenome,
        palette: {
          ...(visualGenome.palette || {}),
          hue: 28,
          accentHue: 12,
          shadowHue: 235,
          contrast: 0.78,
          lightness: 0.57,
        },
        environmentProgram: { ...program },
      };
    }

    function applyPromptEnvironmentLighting(lighting = {}, environmentPrograms = []) {
      const program = environmentPrograms.find((row) => row.kind === 'sunset');
      if (!program) return lighting;
      const color = promptHexToRgb(program.color || '#f47b20');
      return {
        ...lighting,
        model: 'sunset-directional',
        atmosphere: 'sunset warm horizon',
        keyHue: 28,
        lights: [
          {
            id: 'sunset-key',
            kind: 'directional',
            direction: (program.lightDirection || [-0.62, -0.3, 0.72]).slice(0, 3),
            color,
            intensity: Number(program.intensity || 1.08),
          },
          { id: 'sky-fill', kind: 'ambient', color: [0.31, 0.24, 0.39], intensity: 0.42 },
        ],
        environmentProgram: { ...program },
      };
    }

    function promptVisualObligationSettlements(obligations = [], entities = [], environmentPrograms = []) {
      const result = {};
      for (const obligation of obligations) {
        const id = String(obligation.id || '');
        if (/^visual:prompt-/.test(id)) {
          result[id] = settlePromptVisualObligation(obligation, entities, environmentPrograms);
        } else if (obligation.kind === 'environment') {
          const target = promptSingular(obligation.target || id.split(':').slice(1).join('-'));
          const program = environmentPrograms.find((row) => promptPartMatches(row.kind, target));
          if (program) {
            result[id] = {
              schema: 'simulatte.promptVisualObligationSettlement.v1',
              status: 'preserved',
              evidence: [`environment-program:${program.kind}`],
            };
          }
        } else if (obligation.kind === 'part' || /:(?:part-composition|material-assignment):/.test(id)) {
          result[id] = settlePromptPartGraphObligation(obligation, entities);
        }
      }
      return result;
    }

    function settlePromptPartGraphObligation(obligation = {}, entities = []) {
      const id = String(obligation.id || '');
      const partTarget = obligation.kind === 'part' ? id.replace(/^part:/, '') :
        (id.match(/:(?:part-composition|material-assignment):(?:entity|part)-([^:]+)$/) || [])[1] || '';
      const materialTarget = (id.match(/relation:medium-([^:]+):material-assignment:/) || [])[1] || '';
      const parts = entities.flatMap((entity) => entity.partGraph || []);
      const matches = parts.filter((part) => promptPartMatches(part.semanticClass || part.label, partTarget));
      const satisfied = matches.length > 0 && (!materialTarget || matches.some((part) => (
        promptPartMatches(part.materialId, materialTarget)
      )));
      const evidence = satisfied ? [materialTarget
        ? `material-binding:${partTarget}:${materialTarget}`
        : `part-binding:${partTarget}`] : [];
      return {
        schema: 'simulatte.promptVisualObligationSettlement.v1',
        status: satisfied ? 'preserved' : 'lost',
        evidence,
      };
    }

    function filterPromptPartSupportEntities(entities = [], renderObjects = []) {
      const partTargets = (renderObjects || []).flatMap((object) => object.partGraph || [])
        .flatMap((part) => [part.semanticClass, part.label].map(promptSingular))
        .filter(Boolean);
      if (!partTargets.length) return entities;
      return entities.filter((entity) => {
        if ((entity.partGraph || []).length) return true;
        const labels = [entity.semanticClass, entity.visualArchetype, entity.label, entity.sourceLabel]
          .map(promptSingular).filter(Boolean);
        return !labels.some((label) => partTargets.some((target) => promptPartMatches(label, target)));
      });
    }

    function settlePromptVisualObligation(obligation = {}, entities = [], environmentPrograms = []) {
      const matchingEntities = entities.filter((entity) => promptEntityMatches(entity, obligation));
      let satisfied = false;
      const evidence = [];
      if (obligation.constraintKind === 'count') {
        satisfied = matchingEntities.some((entity) => Number(entity.cardinality || 1) === Number(obligation.expectedCount));
        if (satisfied) evidence.push(`cardinality:${obligation.targetIdentity}:${obligation.expectedCount}`);
      } else if (obligation.constraintKind === 'pose') {
        satisfied = matchingEntities.some((entity) => (
          entity.poseHint && entity.poseHint.pose === obligation.expectedPose
        ));
        if (satisfied) evidence.push(`pose:${obligation.expectedPose}`);
      } else if (obligation.constraintKind === 'environment') {
        satisfied = environmentPrograms.some((row) => (
          row.kind === obligation.expectedProgram && (!obligation.expectedValue || row.color === obligation.expectedValue)
        ));
        if (satisfied) evidence.push(`environment-program:${obligation.expectedProgram}`, `palette:${obligation.expectedValue}`);
      } else if (obligation.constraintKind === 'property') {
        satisfied = matchingEntities.some((entity) => promptEntityPropertySatisfied(entity, obligation));
        if (!satisfied) {
          satisfied = environmentPrograms.some((row) => (
            obligation.targetIdentity === 'sunset' && row.color === obligation.expectedValue
          ));
        }
        if (satisfied) evidence.push(`property:${obligation.targetIdentity}:${obligation.propertyKind}:${obligation.expectedValue}`);
      }
      return {
        schema: 'simulatte.promptVisualObligationSettlement.v1',
        status: satisfied ? 'preserved' : 'lost',
        evidence,
      };
    }

    function promptEntityPropertySatisfied(entity = {}, obligation = {}) {
      const direct = (entity.properties || []).some((row) => (
        row.kind === obligation.propertyKind && row.value === obligation.expectedValue
      ));
      if (direct) return true;
      return (entity.partGraph || []).some((part) => (
        promptPartMatches(part.semanticClass || part.label, obligation.targetIdentity) && (
          obligation.propertyKind === 'material'
            ? part.materialId === obligation.expectedValue
            : (part.properties || []).some((row) => (
              row.kind === obligation.propertyKind && row.value === obligation.expectedValue
            ))
        )
      ));
    }

    function promptEntityMatches(entity = {}, obligation = {}) {
      const text = [
        entity.id,
        entity.label,
        entity.sourceLabel,
        entity.semanticClass,
        entity.visualArchetype,
        entity.semanticRef,
        entity.physicalRef,
      ].filter(Boolean).join(' ').toLowerCase();
      const target = promptSingular(obligation.targetIdentity || obligation.target);
      if (target && new RegExp(`(?:^|[^a-z0-9])${promptEscapeRegExp(target)}(?:[^a-z0-9]|$)`).test(text)) return true;
      return (entity.partGraph || []).some((part) => promptPartMatches(part.semanticClass || part.label, target));
    }

    function expandPromptCardinalityPackets(rows = []) {
      return rows.flatMap((row) => {
        const count = Math.max(1, Math.min(16, Math.floor(Number(row.cardinality || 1))));
        if (count === 1) return [row];
        return Array.from({ length: count }, (_, index) => promptCardinalityPacket(row, index, count));
      });
    }

    function promptCardinalityPacket(row = {}, index = 0, count = 1) {
      const columns = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);
      const column = index % columns;
      const line = Math.floor(index / columns);
      const transform = row.transform || {};
      const position = (transform.position || [0.5, 0.5, 0]).slice();
      const scale = (transform.scale || [0.16, 0.14, 1]).slice();
      const spacingX = Math.min(0.12, Number(scale[0] || 0.16) * 0.7);
      const spacingY = Math.min(0.09, Number(scale[1] || 0.14) * 0.62);
      position[0] = clamp(Number(position[0] || 0.5) + (column - (columns - 1) / 2) * spacingX, 0.04, 0.96);
      position[1] = clamp(Number(position[1] || 0.5) + (line - (rows - 1) / 2) * spacingY, 0.04, 0.96);
      scale[0] *= Math.max(0.68, 1 / Math.sqrt(columns));
      scale[1] *= Math.max(0.68, 1 / Math.sqrt(rows));
      const bounds = scenePacketBounds({ ...transform, position, scale });
      return {
        ...row,
        id: `${row.id}:instance:${index + 1}`,
        cardinality: 1,
        cardinalityReceipt: {
          schema: 'simulatte.cardinalityRealization.v1',
          sourceEntityId: row.id,
          instanceIndex: index + 1,
          instanceCount: count,
        },
        representedEntityIds: uniqueList([...(row.representedEntityIds || []), row.id]),
        transform: { ...transform, position, scale },
        geometry: { ...(row.geometry || {}), bounds },
        collider: { ...(row.collider || {}), bounds, pickId: `${row.id}:instance:${index + 1}` },
      };
    }

    function promptPartMatches(value = '', target = '') {
      const left = promptSingular(value);
      const right = promptSingular(target);
      return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
    }

    function promptSingular(value = '') {
      const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return normalized.length > 3 && normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
    }

    function promptPoseGrammarToken(pose = '') {
      if (pose === 'flight-extended') return 'flying';
      if (pose === 'seated') return 'sitting';
      return String(pose || '').split('-')[0];
    }

    function promptHexToRgb(value = '') {
      const hex = String(value || '').replace('#', '');
      if (!/^[a-f0-9]{6}$/i.test(hex)) return [1, 0.48, 0.13];
      return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    }

    function promptEscapeRegExp(value = '') {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    Object.assign(scope, {
      promptGeometryGrammarKey,
      selectPromptGeometryProgram,
      applyPromptGeometryContracts,
      applyPromptEnvironmentVisualGenome,
      applyPromptEnvironmentLighting,
      promptVisualObligationSettlements,
      filterPromptPartSupportEntities,
      expandPromptCardinalityPackets,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
