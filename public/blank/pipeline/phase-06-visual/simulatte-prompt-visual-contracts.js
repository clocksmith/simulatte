(function attachSimulattePromptVisualContracts(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  const lexiconApi = typeof module === 'object' && module.exports
    ? require('../../../data/simulatte-language-lexicon.js')
    : root.SimulatteLanguageLexicon || {};
  const languageLexicon = lexiconApi.LANGUAGE_LEXICON || {};
  const materialVisualValues = languageLexicon.materialVisualValues || {};
  with (scope) {
    const CONSTRUCTION_APPROACH_IDS = Object.freeze({
      anchor: 'category-catalog',
      targeted: 'prompt-obligation-coverage',
      control: 'deterministic-control',
    });

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
      const approach = promptConstructionApproach(entity);
      const rejected = new Set(approach.rejectedGrammarIds);
      const construction = entity.construction || (entity.constructionHypotheses || [])[0] || {};
      const hasPromptContracts = (entity.partGraph || []).length > 0 || (entity.properties || []).length > 0 ||
        Boolean(entity.poseHint && entity.poseHint.pose) || Boolean(
          construction.provenance && construction.provenance.exactTargetMatch === true &&
          (construction.provenance.targetIdentityBound === true || promptConstructionSourceNamesTarget(construction))
        );
      const scored = candidates.map((program, index) => {
        const obligationScore = hasPromptContracts ? promptGeometryCandidateScore(program, entity) : -index;
        return {
          program,
          index,
          obligationScore,
          rejected: rejected.has(String(program.grammarId || '')),
          score: promptConstructionCandidateScore(program, entity, approach, index, obligationScore),
        };
      }).sort((a, b) => b.score - a.score ||
        Number(b.program.selectionRole === 'model-construction' && b.program.constructionReceipt?.topologyTargetFit === true) -
        Number(a.program.selectionRole === 'model-construction' && a.program.constructionReceipt?.topologyTargetFit === true) ||
        a.index - b.index);
      const selectedRow = scored.find((row) => !row.rejected) || scored[0] || null;
      const searchExhausted = scored.length > 0 && scored.every((row) => row.rejected);
      const selected = selectedRow && selectedRow.program || candidates[0] || null;
      if (!selected) return null;
      const applied = applyPromptGeometryContracts(selected, entity);
      return {
        ...applied,
        constructionSelectionReceipt: {
          schema: 'simulatte.constructionSelectionReceipt.v3',
          strategy: approach.id,
          seed: approach.seed,
          attempt: approach.attempt,
          rejectedGrammarIds: approach.rejectedGrammarIds.slice(),
          searchExhausted,
          selectedGrammarId: applied.grammarId || '',
          candidates: scored.map((row) => ({
            grammarId: row.program.grammarId || '',
            selectionRole: row.program.selectionRole || '',
            score: row.score,
            obligationScore: row.obligationScore,
            targetFitScore: promptConstructionTargetFit(row.program, entity),
            status: row === selectedRow
              ? searchExhausted ? 'selected-after-exhaustion' : 'selected'
              : row.rejected ? 'rejected' : 'eligible',
          })),
        },
      };
    }

    function promptConstructionApproach(entity = {}) {
      const requested = String(entity.constructionApproachId || CONSTRUCTION_APPROACH_IDS.targeted);
      const known = Object.values(CONSTRUCTION_APPROACH_IDS).includes(requested);
      if (!known) {
        throw new Error(`Phase 6 construction approach expected one of ${Object.values(CONSTRUCTION_APPROACH_IDS).join(', ')}, received ${requested}`);
      }
      const seed = Number(entity.constructionApproachSeed || 0);
      if (!Number.isInteger(seed) || seed < 0) {
        throw new Error(`Phase 6 construction approach seed expected a non-negative integer, received ${entity.constructionApproachSeed}`);
      }
      const attempt = Number(entity.constructionApproachAttempt || 0);
      if (!Number.isInteger(attempt) || attempt < 0) {
        throw new Error(`Phase 6 construction approach attempt expected a non-negative integer, received ${entity.constructionApproachAttempt}`);
      }
      const rejectedGrammarIds = uniqueList(entity.constructionApproachRejectedGrammarIds || [])
        .map((value) => String(value || '').trim()).filter(Boolean).slice(0, 64);
      return { id: requested, seed, attempt, rejectedGrammarIds };
    }

    function promptConstructionCandidateScore(program, entity, approach, index, obligationScore) {
      if (approach.id === CONSTRUCTION_APPROACH_IDS.targeted) return obligationScore;
      if (approach.id === CONSTRUCTION_APPROACH_IDS.anchor) {
        return program.selectionRole === 'category-catalog' ? 3 :
          program.selectionRole === 'identity-catalog' ? 2 : program.selectionRole === 'prompt-specialized' ? 0 : 1;
      }
      return promptConstructionControlScore(program, entity, approach.seed, index);
    }

    function promptConstructionControlScore(program = {}, entity = {}, seed = 0, index = 0) {
      const text = `${seed}:${entity.id || entity.sourceObject || 'entity'}:${program.grammarId || index}`;
      let hash = 2166136261;
      for (let offset = 0; offset < text.length; offset += 1) {
        hash ^= text.charCodeAt(offset);
        hash = Math.imul(hash, 16777619);
      }
      return Number(((hash >>> 0) / 4294967295).toFixed(9));
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
      const constructionCoverage = promptConstructionEvidenceCoverage(program, entity);
      score += constructionCoverage * 18;
      if (program.selectionRole === 'prompt-specialized') score += 28;
      if (program.selectionRole === 'identity-catalog') score += 24;
      if (program.selectionRole === 'model-construction') score += 3;
      if (program.constructionReceipt && program.constructionReceipt.rerankEvaluated === true) score += 2;
      if (program.constructionReceipt && program.constructionReceipt.topologyTargetFit === true) score += 3;
      score += promptConstructionTargetFit(program, entity);
      if (program.unsupportedIdentity === true) score -= 40;
      if ((program.parts || []).length <= 1) score -= 24;
      score += Math.min(6, (program.parts || []).length * 0.25);
      return Number(score.toFixed(3));
    }

    function promptConstructionTargetFit(program = {}, entity = {}) {
      const target = promptConstructionTarget(entity);
      if (!target) return 0;
      const programIdentities = [
        program.identityType,
        program.visualArchetype,
        program.constructionReceipt && program.constructionReceipt.topologyId,
        String(program.grammarId || '').replace(/^object-grammar[.]/, ''),
      ].map(promptSingular).filter(Boolean);
      const identityMatch = programIdentities.some((identity) => promptPartMatches(identity, target));
      if (program.selectionRole === 'model-construction' && program.constructionReceipt) {
        return program.constructionReceipt.topologyTargetFit === true ? 20 : -32;
      }
      return identityMatch ? 25 : -24;
    }

    function promptConstructionTarget(entity = {}) {
      const construction = entity.construction || (entity.constructionHypotheses || [])[0] || {};
      return promptSingular(String(construction.targetEntryId || '').replace(/^[a-z]+:/, ''));
    }

    function promptConstructionSourceNamesTarget(construction = {}) {
      const target = promptSingular(String(construction.targetEntryId || '').replace(/^[a-z]+:/, ''));
      return Boolean(target) && (construction.sourceCardIds || []).some((id) => (
        promptSingular(String(id || '').replace(/^construction[._-]/, '')) === target
      ));
    }

    function promptConstructionEvidenceCoverage(program = {}, entity = {}) {
      const construction = entity.construction || {};
      const hints = construction.partHints || [];
      const receipted = Number(program.constructionReceipt && program.constructionReceipt.evidencePartCoverage);
      if (Number.isFinite(receipted)) return clamp(receipted, 0, 1);
      if (!hints.length) return 0;
      const partTerms = (program.parts || []).flatMap((row) => [
        row.id, row.constructionRole, row.sourceHint,
      ]).map(promptSingular).filter(Boolean);
      const matched = hints.filter((hint) => {
        const target = promptSingular(hint);
        return partTerms.some((term) => promptPartMatches(term, target));
      }).length;
      return matched / hints.length;
    }

    function applyPromptGeometryContracts(program = {}, entity = {}) {
      const parts = (program.parts || []).map((row, index) => ({
        ...row,
        center: (row.center || []).slice(),
        size: (row.size || []).slice(),
        rotation: promptPosePartRotation(row, index, entity),
      }));
      const bindings = [];
      for (const property of entity.properties || []) {
        if (!property.value) continue;
        if (property.kind === 'color') {
          const matched = promptEntityColorParts(parts);
          for (const part of matched) part.fill = property.value;
          bindings.push(promptGeometryBinding(entity.id, '', property, matched));
        }
        if (property.kind === 'material') {
          const materialStyle = materialVisualValues[property.value] || null;
          if (!materialStyle) {
            bindings.push(promptGeometryBinding(entity.id, '', property, []));
            continue;
          }
          const matched = promptEntityMaterialParts(parts, property.value);
          for (const part of matched) {
            part.fill = materialStyle.color || part.fill;
            part.roughness = materialStyle.roughness;
            part.metallic = materialStyle.metallic;
            part.texture = materialStyle.texture;
          }
          bindings.push(promptGeometryBinding(entity.id, '', property, matched));
        }
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

    function promptEntityColorParts(parts = []) {
      const primaryRoles = new Set(['core', 'head', 'appendage', 'panel']);
      const matched = parts.filter((part) => primaryRoles.has(String(part.constructionRole || '')));
      return matched.length ? matched : parts;
    }

    function promptEntityMaterialParts(parts = [], material = '') {
      if (material !== 'glass') return parts;
      const glassRoles = new Set(['core', 'panel', 'opening', 'field']);
      const matched = parts.filter((part) => glassRoles.has(String(part.constructionRole || '')));
      return matched.length ? matched : parts;
    }

    function promptPosePartRotation(part = {}, index = 0, entity = {}) {
      const base = Number(part.rotation || 0);
      const pose = String(entity.poseHint && entity.poseHint.pose || '');
      const partId = String(part.id || part.constructionRole || '');
      if (pose === 'play-interaction' && /arm|leg|tail|hand|foot|appendage/.test(partId)) {
        return Number((base + (index % 2 ? 0.32 : -0.32)).toFixed(3));
      }
      if (pose === 'grasp-hold' && /arm|tentacle|hand|appendage|gripper/.test(partId)) {
        return Number((base + (index % 2 ? -0.48 : 0.48)).toFixed(3));
      }
      return base;
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

    function mergeConstructionVisualObligations(compositionLedger = null, sceneRenderPacket = {}) {
      const additions = constructionVisualObligationsForScenePacket(sceneRenderPacket, compositionLedger);
      if (!additions.length) return compositionLedger;
      const source = compositionLedger || {};
      const byId = new Map((source.obligations || []).map((row) => [row.id, row]));
      for (const row of additions) byId.set(row.id, row);
      const obligations = Array.from(byId.values());
      const lost = additions.filter((row) => row.status === 'lost');
      return {
        ...source,
        obligations,
        phaseDeltas: [
          ...(source.phaseDeltas || []),
          ...additions.map((row) => ({
            phase: 6,
            entryId: row.id,
            operation: row.status === 'lost' ? 'lost' : 'preserved',
            receiptId: 'phase6-construction-visual-contract',
          })),
        ],
        losses: [
          ...(source.losses || []),
          ...lost.map((row) => ({
            id: `loss:phase6:${row.id}`,
            phase: 6,
            entryId: row.id,
            reason: 'prompt identity has no evidence-backed construction graph',
            sourceReceiptId: 'phase6-construction-visual-contract',
            nextRequiredAction: 'select a model-ranked construction hypothesis with visible parts',
          })),
        ],
        summary: {
          obligationCount: obligations.length,
          preservedCount: obligations.filter((row) => row.status === 'preserved').length,
          loweredCount: obligations.filter((row) => row.status === 'lowered').length,
          failedCount: obligations.filter((row) => row.status === 'lost' || row.status === 'failed').length,
        },
      };
    }

    function constructionVisualObligationsForScenePacket(sceneRenderPacket = {}, compositionLedger = null) {
      const obligations = [];
      for (const entity of sceneRenderPacket.entities || []) {
        const program = entity.geometry && entity.geometry.program || {};
        const identity = entity.identity && entity.identity.type || program.identityType || entity.label || entity.id;
        const base = promptSafeId(entity.id || identity);
        if (program.unsupportedIdentity === true) {
          const requiredRows = requiredIdentityObligationsForEntity(entity, compositionLedger);
          if (compositionLedger && (!requiredRows.length || requiredRows.every((row) => (
            sceneRenderPacketHasAlternateLiteralIdentity(sceneRenderPacket, entity, row)
          )))) continue;
          obligations.push(constructionVisualObligation({
            id: `visual:construction:${base}:support`,
            entity,
            identity,
            constraintKind: 'construction-support',
            status: 'lost',
            expectedLiteral: true,
            selectedGrammarId: program.grammarId || '',
          }));
          continue;
        }
        const graph = program.constructionGraph || null;
        if (!graph || program.selectionRole !== 'model-construction') continue;
        const parts = program.parts || [];
        const receipt = program.constructionReceipt || {};
        obligations.push(constructionVisualObligation({
          id: `visual:construction:${base}:topology`,
          entity,
          identity,
          constraintKind: 'construction-topology',
          status: graph.topologyId && parts.length ? 'preserved' : 'lost',
          expectedTopology: graph.topologyId || '',
          expectedConstraintCount: (graph.edges || []).length,
          selectedGrammarId: program.grammarId || '',
          modelEvaluated: receipt.modelEvaluated === true,
          rerankEvaluated: receipt.rerankEvaluated === true,
        }));
        const byRole = new Map();
        for (const part of parts) {
          const role = String(part.constructionRole || '').trim();
          if (!role) continue;
          byRole.set(role, (byRole.get(role) || 0) + 1);
        }
        for (const [role, count] of Array.from(byRole.entries()).slice(0, 8)) {
          obligations.push(constructionVisualObligation({
            id: `visual:construction:${base}:part:${promptSafeId(role)}`,
            entity,
            identity,
            constraintKind: 'construction-part',
            status: count > 0 ? 'preserved' : 'lost',
            expectedPartRole: role,
            expectedCount: count,
            selectedGrammarId: program.grammarId || '',
            modelEvaluated: receipt.modelEvaluated === true,
            rerankEvaluated: receipt.rerankEvaluated === true,
          }));
        }
      }
      return obligations;
    }

    function requiredIdentityObligationsForEntity(entity = {}, compositionLedger = null) {
      return ((compositionLedger && compositionLedger.obligations) || []).filter((row) => (
        row && row.required === true && ['entity', 'object', 'environment', 'medium'].includes(row.kind) &&
        promptEntityMatches(entity, {
          targetIdentity: row.target || String(row.id || row.obligationId || '').replace(/^[a-z]+:/, ''),
        })
      ));
    }

    function sceneRenderPacketHasAlternateLiteralIdentity(sceneRenderPacket = {}, sourceEntity = {}, obligation = {}) {
      const targetIdentity = obligation.target || String(obligation.id || obligation.obligationId || '')
        .replace(/^[a-z]+:/, '');
      return (sceneRenderPacket.entities || []).some((entity) => {
        const program = entity.geometry && entity.geometry.program || {};
        return entity !== sourceEntity && program.literal === true && program.unsupportedIdentity !== true &&
          promptEntityMatches(entity, { targetIdentity });
      });
    }

    function constructionVisualObligation(options = {}) {
      return {
        schema: 'simulatte.constructionVisualObligation.v1',
        id: options.id,
        kind: 'visual',
        ownedByPhase: 6,
        required: true,
        phase: 6,
        status: options.status,
        target: options.identity,
        targetIdentity: options.identity,
        targetEntityId: options.entity.id || '',
        constraintKind: options.constraintKind,
        expectedLiteral: options.expectedLiteral === true,
        expectedTopology: options.expectedTopology || '',
        expectedConstraintCount: Number(options.expectedConstraintCount || 0),
        expectedPartRole: options.expectedPartRole || '',
        expectedCount: Number(options.expectedCount || 0),
        selectedGrammarId: options.selectedGrammarId || '',
        modelEvaluated: options.modelEvaluated === true,
        rerankEvaluated: options.rerankEvaluated === true,
        visualEvidence: options.status === 'preserved'
          ? [`geometry-program:${options.selectedGrammarId}`]
          : [],
      };
    }

    function promptSafeId(value = '') {
      return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function settlePromptPartGraphObligation(obligation = {}, entities = []) {
      const id = String(obligation.id || '');
      const partTarget = obligation.kind === 'part' ? id.replace(/^part:/, '') :
        (id.match(/:(?:part-composition|material-assignment):(?:entity|part)-([^:]+)$/) || [])[1] || '';
      const materialTarget = (id.match(/relation:medium-([^:]+):material-assignment:/) || [])[1] || '';
      const parts = entities.flatMap((entity) => entity.partGraph || []);
      const matches = parts.filter((part) => promptPartMatches(part.semanticClass || part.label, partTarget));
      const directEntityMaterial = materialTarget && entities.some((entity) => (
        promptEntityMatches(entity, { targetIdentity: partTarget }) && (entity.properties || []).some((property) => (
          property.kind === 'material' && promptPartMatches(property.value, materialTarget)
        ))
      ));
      const satisfied = Boolean(directEntityMaterial) || matches.length > 0 && (!materialTarget || matches.some((part) => (
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
      const identities = [
        entity.id,
        entity.label,
        entity.sourceLabel,
        entity.semanticClass,
        entity.visualArchetype,
        entity.semanticRef,
        entity.physicalRef,
        entity.identity && entity.identity.type,
        entity.identity && entity.identity.label,
        entity.identity && entity.identity.sourceLabel,
        ...(entity.representedEntityIds || []),
      ].filter(Boolean);
      const target = promptSingular(obligation.targetIdentity || obligation.target);
      if (target && identities.some((identity) => promptPartMatches(identity, target))) return true;
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
      const sourceWidth = Number(scale[0] || 0.16);
      const sourceHeight = Number(scale[1] || 0.14);
      const groupWidth = Math.min(0.48, Math.max(sourceWidth, sourceWidth * columns * 0.82));
      const groupHeight = Math.min(0.46, Math.max(sourceHeight, sourceHeight * rows * 0.82));
      const fit = Math.min(
        1,
        groupWidth / Math.max(sourceWidth, sourceWidth * columns * 1.12),
        groupHeight / Math.max(sourceHeight, sourceHeight * rows * 1.12)
      );
      scale[0] = sourceWidth * fit;
      scale[1] = sourceHeight * fit;
      const spacingX = Number(scale[0] || 0.16) * 1.12;
      const spacingY = Number(scale[1] || 0.14) * 1.12;
      position[0] = clamp(Number(position[0] || 0.5) + (column - (columns - 1) / 2) * spacingX, 0.04, 0.96);
      position[1] = clamp(Number(position[1] || 0.5) + (line - (rows - 1) / 2) * spacingY, 0.04, 0.96);
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
        animation: row.animation ? {
          ...row.animation,
          phase: Number(((Number(row.animation.phase || 0) + index / count) % 1).toFixed(3)),
        } : row.animation,
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
      return normalized.length > 3 && normalized.endsWith('s') && !/(?:ss|us|is)$/.test(normalized)
        ? normalized.slice(0, -1) : normalized;
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
      CONSTRUCTION_APPROACH_IDS,
      promptGeometryGrammarKey,
      selectPromptGeometryProgram,
      applyPromptGeometryContracts,
      applyPromptEnvironmentVisualGenome,
      applyPromptEnvironmentLighting,
      promptVisualObligationSettlements,
      mergeConstructionVisualObligations,
      constructionVisualObligationsForScenePacket,
      filterPromptPartSupportEntities,
      expandPromptCardinalityPackets,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
