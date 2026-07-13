(function attachSimulatteCompositionGraphvisualir(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function wakeFieldRowsForSwimmingAgents(agents = []) {
        return (agents || []).map((entity, index) => {
          const pose = entity.pose || swimmingAgentPose(entity, index, agents.length, swimmingAgentSpecies(entity));
          const species = swimmingAgentSpecies(entity) || 'animal';
          const radius = species === 'dog' ? 0.145 : 0.105;
          const center = [
            clamp(Number(pose.x || 0.5) - Number(pose.w || 0.14) * 0.36, 0.08, 0.92),
            clamp(Number(pose.y || 0.62) + Number(pose.h || 0.08) * 0.12, 0.08, 0.92),
          ];
          return {
            id: `visual:wake:${visualSafeId(entity.id)}`,
            kind: 'wake-ripple-field',
            channel: entity.stateBindings && entity.stateBindings.wake || `wake:${entity.id}`,
            visualEncoding: 'agent-wake-ripple-trail',
            strength: species === 'dog' ? 0.78 : 0.68,
            geometry: {
              kind: 'radial-field',
              center,
              radius,
            },
            materialId: 'wake-ripple',
            sourceGraphId: entity.sourceGraphId || entity.id,
            affects: [entity.id],
            evidence: uniqueList([
              `agent:${entity.id}`,
              `species:${species}`,
              'visual-obligation:wake-ripples',
              'operator:wake_generation',
            ]),
            status: 'accepted',
            confidence: 0.88,
            reason: 'wake ripple field lowered from swimming-agent water contact',
          };
        });
      }

    function swimmingEffectRowsForAgents(agents = []) {
        const rows = [];
        for (const [index, entity] of (agents || []).entries()) {
          const pose = entity.pose || swimmingAgentPose(entity, index, agents.length, swimmingAgentSpecies(entity));
          const species = swimmingAgentSpecies(entity) || 'animal';
          rows.push({
            id: `visual:swim-pose:${visualSafeId(entity.id)}`,
            family: 'swimming-pose',
            operator: 'swim-stroke-silhouette',
            motion: 'swim-cycle',
            affects: [entity.id],
            pose: {
              points: swimmingPosePath(pose, species),
              rotation: Number(pose.rotation || 0),
            },
            materialId: speciesSwimMaterialId(species),
            sourceGraphId: entity.sourceGraphId || entity.id,
            evidence: uniqueList([
              `agent:${entity.id}`,
              `species:${species}`,
              'visual-obligation:swimming-pose',
              'operator:fluid_locomotion',
            ]),
            order: -42 + index,
            status: 'accepted',
            confidence: 0.88,
            reason: 'swimming pose effect lowered from fluid locomotion behavior',
          });
          rows.push({
            id: `visual:submersion:${visualSafeId(entity.id)}`,
            family: 'partial-submersion',
            operator: 'submersion-mask',
            motion: 'waterline-mask-lock',
            affects: [entity.id],
            geometry: {
              kind: 'submersion-band',
              bounds: submersionBoundsForPose(pose),
            },
            materialId: 'submersion-mask',
            sourceGraphId: entity.sourceGraphId || entity.id,
            evidence: uniqueList([
              `agent:${entity.id}`,
              `species:${species}`,
              'visual-obligation:partial-submersion',
              'operator:partial_submersion',
              'stateBinding:submersion',
            ]),
            order: -34 + index,
            status: 'accepted',
            confidence: 0.88,
            reason: 'partial submersion effect lowered from swimming-agent waterline state',
          });
        }
        return rows;
      }

    function swimmingPosePath(pose = {}, species = 'animal') {
        const x = Number(pose.x || 0.5);
        const y = Number(pose.y || 0.62);
        const w = Number(pose.w || 0.14);
        const h = Number(pose.h || 0.08);
        const reach = species === 'dog' ? 0.74 : 0.58;
        return [
          [clamp(x - w * reach, 0.05, 0.95), clamp(y + h * 0.08, 0.05, 0.95)],
          [clamp(x, 0.05, 0.95), clamp(y - h * 0.12, 0.05, 0.95)],
          [clamp(x + w * 0.62, 0.05, 0.95), clamp(y + h * 0.1, 0.05, 0.95)],
        ];
      }

    function submersionBoundsForPose(pose = {}) {
        const x = Number(pose.x || 0.5);
        const y = Number(pose.y || 0.62);
        const w = Number(pose.w || 0.14);
        const h = Number(pose.h || 0.08);
        return [
          clamp(x - w * 0.58, 0.02, 0.96),
          clamp(y, 0.02, 0.96),
          clamp(w * 1.16, 0.04, 0.5),
          clamp(h * 0.56, 0.025, 0.24),
        ];
      }

    function isSwimmingWaterEntity(entity = {}, sceneKind = '', spec = {}) {
        if (!hasSwimmingSceneSignal(spec, sceneKind)) return false;
        if (swimmingAgentSpecies(entity)) return false;
        const text = swimmingWaterEntityText(entity);
        if (/\bwater|lake|pool|pond|river|ocean|fluid|fluid-volume/.test(text)) return true;
        return entity.kind === 'medium' &&
          /\bwater|lake|pool|pond|river|ocean|fluid|fluid-volume/.test(String(entity.material || entity.shape || '').toLowerCase());
      }

    function swimmingWaterEntityText(entity = {}) {
        return [
          entity.id,
          entity.sourceObject,
          entity.semanticRef,
          entity.physicalRef,
          entity.role,
          entity.kind,
          entity.shape,
          entity.material,
          entity.visualRegime,
          ...(entity.sourceIds || []),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function hasSwimmingSceneSignal(spec = {}, sceneKind = '') {
        const text = [
          sceneKind,
          spec && spec.renderIR && (spec.renderIR.intentText || spec.renderIR.prompt || ''),
          spec && spec.renderIR && spec.renderIR.compositionLedger &&
            (spec.renderIR.compositionLedger.obligations || []).map((row) => row.id).join(' '),
          spec && spec.solverGraph && (spec.solverGraph.steps || []).map((row) => row.operatorType || row.solverId).join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        return /\bswim|fluid_locomotion|wake-ripples|partial-submersion|partial_submersion/.test(text);
      }

    function lowerSwimmingWaterEntity(entity = {}) {
        const text = swimmingEntityText(entity);
        const isLake = /\blake/.test(text);
        return {
          ...entity,
          kind: 'medium',
          role: isLake ? 'containing-lake-water' : 'containing-water-medium',
          material: 'water',
          shape: 'fluid-volume-ribbon',
          pose: {
            ...(entity.pose || {}),
            x: 0.5,
            y: isLake ? 0.64 : 0.66,
            w: isLake ? 0.82 : 0.74,
            h: isLake ? 0.34 : 0.3,
            rotation: 0,
          },
          geometryConstraints: uniqueList([
            ...(entity.geometryConstraints || []),
            'contains-swimming-agents',
            'waterline-overlap',
          ]),
          evidence: uniqueList([
            ...(entity.evidence || []),
            'visual-obligation:partial-submersion',
            'visual-obligation:wake-ripples',
          ]),
          confidence: Math.max(Number.isFinite(Number(entity.confidence)) ? Number(entity.confidence) : 0, 0.82),
          reason: 'water container lowered to overlap swimming agents and wake fields',
        };
      }

    function swimmingVisualLoweringReceipt(agents = [], materials = [], fields = [], processes = []) {
        return {
          id: 'receipt:swimming-visual-obligations',
          schema: 'simulatte.phaseReceipt.v1',
          agentCount: agents.length,
          agentIds: agents.map((row) => row.id).slice(0, 12),
          species: uniqueList(agents.map(swimmingAgentSpecies).filter(Boolean)),
          materialIds: materials.map((row) => row.id).slice(0, 12),
          wakeFieldIds: fields.map((row) => row.id).slice(0, 12),
          effectIds: processes.map((row) => row.id).slice(0, 12),
          lowered: agents.length > 0,
        };
      }

    function causalAffordancesFromSpec(spec, sceneKind = '') {
        const affordances = spec && spec.renderIR && spec.renderIR.causalAffordances || [];
        return Array.isArray(affordances)
          ? affordances.filter((row) => sceneAllowsCausalAffordance(row, sceneKind)).slice(0, 8)
          : [];
      }

    function visualCompositionLedgerForSpec(spec = {}, entities = [], renderInstances = [], processes = [], fields = []) {
        const sourceLedger = spec && spec.renderIR && spec.renderIR.compositionLedger || null;
        const sourceObligations = sourceLedger && Array.isArray(sourceLedger.obligations) ? sourceLedger.obligations : [];
        const sourceEntries = sourceLedger && Array.isArray(sourceLedger.entries) ? sourceLedger.entries : [];
        const sourceRelations = sourceLedger && Array.isArray(sourceLedger.relations) ? sourceLedger.relations : [];
        const identities = new Set((renderInstances || [])
          .map((row) => row.identity && row.identity.type)
          .filter(Boolean));
        const entityText = (entities || []).map((entity) => [
          entity.id,
          entity.label,
          entity.semanticRef,
          entity.physicalRef,
          entity.shape,
          entity.material,
          entity.behavior && (entity.behavior.processes || []).join(' '),
          (entity.physicsOperators || []).join(' '),
          entity.stateBindings && Object.keys(entity.stateBindings).join(' '),
        ].filter(Boolean).join(' ')).join(' ').toLowerCase();
        const renderText = [
          ...(renderInstances || []).map((row) => [
            row.id,
            row.layerSlot,
            row.primitive,
            row.animation && row.animation.kind,
            row.material && (row.material.id || row.material.shader || row.material),
            row.identity && row.identity.type,
          ].filter(Boolean).join(' ')),
          ...(processes || []).map((row) => `${row.id || ''} ${row.family || ''} ${row.motion || ''}`),
          ...(fields || []).map((row) => `${row.id || ''} ${row.kind || ''} ${row.visualEncoding || ''}`),
        ].join(' ').toLowerCase();
        const behaviorOperators = new Set((spec.renderIR && spec.renderIR.behaviorRelations || [])
          .flatMap((row) => row.operators || []));
        const dogMaterialIds = uniqueList((renderInstances || [])
          .filter((row) => row.type === 'geometry' &&
            row.layerSlot === 'biological-agent' &&
            row.identity &&
            row.identity.type === 'dog')
          .map((row) => row.materialId || row.material && row.material.id)
          .filter((id) => id === speciesSwimMaterialId('dog')));
        const catMaterialIds = uniqueList((renderInstances || [])
          .filter((row) => row.type === 'geometry' &&
            row.layerSlot === 'biological-agent' &&
            row.identity &&
            row.identity.type === 'cat')
          .map((row) => row.materialId || row.material && row.material.id)
          .filter((id) => id === speciesSwimMaterialId('cat')));
        const swimRows = uniqueList((renderInstances || [])
          .filter((row) => /visual:swim-pose|visual-swim-pose/.test([
            row.id,
            row.processId,
          ].filter(Boolean).join(' ').toLowerCase()))
          .map((row) => row.processId || row.id)
          .filter(Boolean));
        const wakeRows = uniqueList([
          ...(fields || [])
            .filter((row) => /^visual:wake:/.test(String(row.id || '')) ||
              /agent-wake-ripple-trail/.test(String(row.visualEncoding || '')))
            .map((row) => row.id),
        ].filter(Boolean));
        const submersionRows = uniqueList([
          ...(processes || [])
            .filter((row) => /^visual:submersion:/.test(String(row.id || '')) ||
              /submersion-mask/.test(String(row.operator || '')))
            .map((row) => row.id),
        ].filter(Boolean));
        const genericVisualRows = visualEvidenceRows(entities, renderInstances, processes, fields);
        const sceneVisualRow = genericVisualRows.slice().sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0] || null;
        const sceneVisualTarget = sceneVisualRow && sceneVisualRow.nameText || 'compiled scene packet';
        const genericEvidenceByObligation = Object.fromEntries(sourceObligations.map((row) => [
          row.id || '',
          genericVisualEvidence(row, genericVisualRows, sourceObligations, sourceEntries, sourceRelations),
        ]));
        const facts = {
          hasDog: identities.has('dog') || /\bdog|surface-dog|primitive-dog/.test(entityText),
          hasCat: identities.has('cat') || /\bcat|surface-cat|primitive-cat/.test(entityText),
          hasWater: identities.has('water') || /\bwater|lake|pool|fluid/.test(entityText),
          hasLake: /\blake|primitive-lake/.test(entityText),
          hasSwimming: /swim-cycle|swimming|fluid_locomotion/.test(`${entityText} ${renderText}`) || behaviorOperators.has('fluid_locomotion'),
          hasWake: /wake|ripple|flow-ripple/.test(`${entityText} ${renderText}`) || behaviorOperators.has('wake_generation'),
          hasSubmersion: /submersion|partial_submersion/.test(`${entityText} ${renderText}`) || behaviorOperators.has('partial_submersion'),
          hasSpeciesDistinct: dogMaterialIds.length > 0 && catMaterialIds.length > 0 &&
            dogMaterialIds.some((dogId) => catMaterialIds.every((catId) => catId !== dogId)),
          dogMaterialIds,
          catMaterialIds,
          swimRows,
          wakeRows,
          submersionRows,
          genericEvidenceByObligation,
          promptVisualSettlements: promptVisualObligationSettlements(
            sourceObligations, entities, spec.renderIR && spec.renderIR.environmentPrograms || []
          ),
        };
        const obligations = sourceObligations.map((row) => {
          const status = visualObligationStatus(row, facts);
          return {
            ...row,
            status,
            phase: 6,
            visualEvidence: visualObligationEvidence(row, facts),
          };
        });
        if (!obligations.some((row) => row.id === 'visual:compiled-scene-packet')) {
          const visualEvidence = sceneVisualRow ? [`phase6:${sceneVisualRow.source}:${sceneVisualRow.id}`] : [];
          obligations.push({ id: 'visual:compiled-scene-packet', kind: 'visual', ownedByPhase: 6, target: sceneVisualTarget, required: true, status: visualEvidence.length ? 'preserved' : 'lost', phase: 6, visualEvidence });
        }
    	    return {
    	      ...(sourceLedger || {}),
    	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
    	      sourcePhase: sourceLedger && sourceLedger.sourcePhase || 3,
    	      currentPhase: 7,
    	      entries: sourceLedger && sourceLedger.entries || [],
    	      relations: sourceLedger && sourceLedger.relations || [],
    	      obligations,
    	      phaseDeltas: [
    	        ...(sourceLedger && sourceLedger.phaseDeltas || []),
    	        ...obligations.map((row) => ({
    	          phase: 6,
    	          entryId: row.id,
    	          operation: row.status === 'lost' ? 'lost' : 'preserved',
    	          receiptId: 'phase6-visual-compile',
    	        })),
    	      ],
    	      losses: [
    	        ...(sourceLedger && sourceLedger.losses || []),
    	        ...obligations.filter((row) => row.status === 'lost').map((row) => ({
    	          id: `loss:phase6:${row.id}`,
    	          phase: 6,
    	          entryId: row.id,
    	          reason: 'visual obligation not present in scene packet',
    	          sourceReceiptId: 'phase6-visual-compile',
    	          nextRequiredAction: 'compile required visual identity or mark unsupported',
    	        })),
    	      ],
    	      unsupported: sourceLedger && sourceLedger.unsupported || [],
    	      facts,
    	      summary: {
    	        obligationCount: obligations.length,
    	        preservedCount: obligations.filter((row) => row.status === 'preserved').length,
    	        loweredCount: obligations.filter((row) => row.status === 'lowered').length,
    	        failedCount: obligations.filter((row) => row.status === 'lost' || row.status === 'failed').length,
    	      },
    	    };
    	  }

    function visualObligationStatus(row = {}, facts = {}) {
        const promptSettlement = facts.promptVisualSettlements && facts.promptVisualSettlements[row.id];
        if (promptSettlement) return promptSettlement.status;
        if (genericVisualEvidenceForObligation(row, facts).length) return 'preserved';
        if (row.id === 'entity:dog') return facts.hasDog ? 'preserved' : 'lost';
        if (row.id === 'entity:cat') return facts.hasCat ? 'preserved' : 'lost';
        if (row.id === 'environment:lake') return facts.hasLake ? 'preserved' : 'lost';
        if (row.id === 'medium:water') return facts.hasWater ? 'preserved' : 'lost';
        if (row.id === 'action:swimming') return facts.hasSwimming ? 'preserved' : 'lost';
        if (row.id === 'relation:dog:swimming:lake') return facts.hasDog && facts.hasLake && facts.hasSwimming ? 'preserved' : 'lost';
        if (row.id === 'relation:cat:swimming:lake') return facts.hasCat && facts.hasLake && facts.hasSwimming ? 'preserved' : 'lost';
        if (row.id === 'visual:species-distinct-silhouettes') return facts.hasDog && facts.hasCat && facts.hasSpeciesDistinct ? 'preserved' : 'lost';
        if (row.id === 'visual:swimming-pose') return facts.hasSwimming && facts.swimRows && facts.swimRows.length ? 'preserved' : 'lost';
        if (row.id === 'visual:wake-ripples') return facts.hasWake && facts.wakeRows && facts.wakeRows.length ? 'preserved' : 'lost';
        if (row.id === 'visual:partial-submersion') return facts.hasSubmersion && facts.submersionRows && facts.submersionRows.length ? 'preserved' : 'lost';
        return row.required === true ? 'lost' : row.status || 'preserved';
      }

    function visualObligationEvidence(row = {}, facts = {}) {
        const promptSettlement = facts.promptVisualSettlements && facts.promptVisualSettlements[row.id];
        const evidence = promptSettlement ? promptSettlement.evidence.slice() : genericVisualEvidenceForObligation(row, facts).slice();
        if (/dog/.test(row.id) && facts.hasDog) evidence.push('scene-identity:dog');
        if (/cat/.test(row.id) && facts.hasCat) evidence.push('scene-identity:cat');
        if (/species-distinct/.test(row.id) && facts.hasDog && facts.hasCat) {
          evidence.push('scene-identity:dog', 'scene-identity:cat');
          for (const id of facts.dogMaterialIds || []) evidence.push(`material:${id}`);
          for (const id of facts.catMaterialIds || []) evidence.push(`material:${id}`);
        }
        if (/lake/.test(row.id) && facts.hasLake) evidence.push('scene-identity:lake');
        if (/water/.test(row.id) && facts.hasWater) evidence.push('scene-identity:water');
        if (/swimming|swimming-pose/.test(row.id) && facts.hasSwimming) {
          evidence.push('animation:swim-cycle', ...(facts.swimRows || []));
        }
        if (/wake/.test(row.id) && facts.hasWake) evidence.push(...(facts.wakeRows || []));
        if (/submersion/.test(row.id) && facts.hasSubmersion) evidence.push(...(facts.submersionRows || []));
        return evidence;
      }

    function genericVisualEvidenceForObligation(row = {}, facts = {}) {
        const byObligation = facts && facts.genericEvidenceByObligation || {};
        return Array.isArray(byObligation[row.id || '']) ? byObligation[row.id || ''].slice() : [];
      }

    function visualEvidenceRows(entities = [], renderInstances = [], processes = [], fields = []) {
        const rows = [];
        const append = (source, row, index) => {
          if (!row) return;
          const identity = row.identity || {};
          const nameText = normalizeVisualEvidenceText(
            identity.sourceLabel || row.label || row.id || ''
          );
          const values = [
            row.id,
            row.label,
            row.semanticRef,
            row.physicalRef,
            row.sourceGraphId,
            row.sourceObject,
            row.layerSlot,
            row.processId,
            row.family,
            row.motion,
            row.kind,
            identity.label,
            identity.type,
            identity.sourceLabel,
            identity.renderClass,
            ...(row.sourceIds || []),
            ...(row.evidence || []),
            ...(row.behavior && row.behavior.sourceEvidence || []),
          ];
          const text = normalizeVisualEvidenceText(values.filter(Boolean).join(' '));
          if (!text) return;
          rows.push({
            id: String(row.id || `${source}:${index}`),
            source,
            text,
            nameText,
            evidenceText: normalizeVisualEvidenceText([
              ...(row.evidence || []), ...(row.behavior && row.behavior.sourceEvidence || []),
            ].join(' ')),
            identityText: normalizeVisualEvidenceText([identity.type, identity.label].filter(Boolean).join(' ')),
            referenceText: normalizeVisualEvidenceText([
              row.semanticRef, row.physicalRef, row.sourceGraphId, ...(row.sourceIds || []),
            ].filter(Boolean).join(' ')),
            priority: Number(row.renderPriority || row.confidence || 0) + (/\blight\b|emissive/.test(JSON.stringify(row.material || '')) ? 1 : 0),
          });
        };
        (entities || []).forEach((row, index) => append('entity', row, index));
        (renderInstances || []).forEach((row, index) => append('render-instance', row, index));
        (processes || []).forEach((row, index) => append('process', row, index));
        (fields || []).forEach((row, index) => append('field', row, index));
        return rows;
      }

    function genericVisualEvidence(row = {}, rows = [], sourceObligations = [], sourceEntries = [], sourceRelations = []) {
        const id = String(row.id || row.obligationId || '');
        const parts = id.split(':');
        if (id === 'action:spatial-constraint') {
          return rows.filter((candidate) => /\blayout relation\b/.test(candidate.evidenceText))
            .map((candidate) => `phase6:${candidate.source}:${candidate.id}`);
        }
        if (parts[0] === 'relation' && parts[1] === 'spatial' && parts.length >= 5) {
          const subjectTarget = parts[2].replace(/^[a-z]+-/, '');
          const relationType = parts[3].replace(/_/g, '-');
          const objectTarget = parts.slice(4).join(' ').replace(/^[a-z]+-/, '');
          const subject = relationType === 'occurs-in'
            ? visualEvidenceForLedgerAction(subjectTarget, rows, sourceEntries)
            : visualEvidenceForTarget(subjectTarget, rows);
          const object = visualEvidenceForTarget(objectTarget, rows);
          if (relationType === 'occurs-in') return subject.length && object.length ? uniqueList([...subject, ...object]) : [];
          const normalizedId = normalizeVisualEvidenceText(id);
          const constraint = rows.filter((candidate) => candidate.evidenceText.includes(normalizedId))
            .map((candidate) => `phase6:${candidate.source}:${candidate.id}`);
          return subject.length && object.length && constraint.length
            ? uniqueList([...subject, ...object, ...constraint, `layout-relation:${id}`])
            : [];
        }
        if (id === 'action:coexists') {
          return uniqueList((sourceObligations || [])
            .filter((candidate) => String(candidate.id || '').split(':')[2] === 'coexists')
            .flatMap((candidate) => genericVisualEvidence(candidate, rows, [], sourceEntries, sourceRelations)));
        }
        if (parts[0] === 'relation' && parts.length >= 4) {
          const subject = visualEvidenceForTarget(parts[1].replace(/^[a-z]+-/, ''), rows);
          const process = parts[2] === 'coexists' ? [] : visualEvidenceForLedgerAction(parts[2], rows, sourceEntries);
          const target = parts.slice(3).join(' ').replace(/^[a-z]+-/, '');
          const object = target === 'world' ? ['scene:world'] : visualEvidenceForTarget(target, rows);
          const exact = rows.filter((candidate) => candidate.evidenceText.includes(normalizeVisualEvidenceText(id)))
            .map((candidate) => `phase6:${candidate.source}:${candidate.id}`);
          if (subject.length && object.length && exact.length) return uniqueList([...subject, ...exact, ...object]);
          const sourceRelation = sourceRelations.find((candidate) => candidate.id === id);
          const spatial = sourceRelation && sourceRelations.find((candidate) => (
            candidate !== sourceRelation && candidate.kind === 'spatial-constraint' &&
            candidate.from === sourceRelation.from &&
            (candidate.target || candidate.to) === (sourceRelation.target || sourceRelation.to)
          ));
          if (spatial) {
            const spatialEvidence = genericVisualEvidence({ ...row, id: spatial.id }, rows, sourceObligations, sourceEntries, sourceRelations);
            if (spatialEvidence.length) return uniqueList([...spatialEvidence, `relation-source:${id}`]);
          }
          return subject.length && object.length && (!process.length ? parts[2] === 'coexists' : true)
            ? uniqueList([...subject, ...process, ...object])
            : [];
        }
        return row.kind === 'action'
          ? visualEvidenceForLedgerAction(visualObligationTarget(row), rows, sourceEntries)
          : visualEvidenceForTarget(visualObligationTarget(row), rows);
      }

    function visualEvidenceForLedgerAction(target = '', rows = [], sourceEntries = []) {
        const direct = visualEvidenceForTarget(target, rows, true);
        if (direct.length) return direct;
        const normalized = normalizeVisualEvidenceText(target);
        const promptEntry = (sourceEntries || []).find((entry) => entry && entry.kind === 'action' && entry.source === 'prompt' &&
          normalizeVisualEvidenceText(entry.label || String(entry.id || '').replace(/^action:/, '')) === normalized);
        const promptSpanIds = new Set(promptEntry && promptEntry.sourceSpanIds || []);
        const normalizedPredicate = promptEntry && (sourceEntries || []).find((entry) => entry && entry.kind === 'action' && entry.source === 'predicate' &&
          (entry.sourceSpanIds || []).some((id) => promptSpanIds.has(id)));
        if (normalizedPredicate) {
          return visualEvidenceForTarget(normalizedPredicate.label || normalizedPredicate.id, rows, true);
        }
        const predicate = (sourceEntries || []).find((entry) => entry && entry.kind === 'action' && entry.source === 'predicate' &&
          normalizeVisualEvidenceText(entry.label || String(entry.id || '').replace(/^action:/, '')) === normalized);
        if (!predicate) return [];
        const spanIds = new Set(predicate.sourceSpanIds || []);
        return uniqueList((sourceEntries || []).filter((entry) => entry && entry.kind === 'action' && entry.source === 'prompt' &&
          (entry.sourceSpanIds || []).some((id) => spanIds.has(id))).flatMap((entry) => visualEvidenceForTarget(entry.label || entry.id, rows, true)));
      }

    function visualEvidenceForTarget(target = '', rows = [], allowEvidence = false) {
        const terms = visualEvidenceTokens(target);
        if (!terms.length) return [];
        const matches = (rows || [])
          .map((row, index) => ({
            row,
            index,
            score: terms.reduce((sum, term) => sum + (visualEvidenceTextHasTerm(row.text, term) ? 1 : 0), 0),
            specificity: Math.max(
              visualEvidenceSpecificity(row.nameText, terms),
              terms.every((term) => visualEvidenceTextHasTerm(row.identityText, term)) ? 1 : 0,
              terms.every((term) => visualEvidenceTextHasTerm(row.referenceText, term)) ? 1 : 0,
              allowEvidence && terms.every((term) => visualEvidenceTextHasTerm(row.evidenceText, term)) ? 1 : 0
            ),
          }))
          .filter((entry) => entry.score === terms.length && entry.specificity >= 0.5)
          .sort((left, right) => right.specificity - left.specificity || right.score - left.score || left.index - right.index)
          .slice(0, 2);
        return matches.map((entry) => `phase6:${entry.row.source}:${entry.row.id}`);
      }

    function visualEvidenceSpecificity(nameText = '', targetTerms = []) {
        const nameTerms = visualEvidenceTokens(nameText);
        if (!nameTerms.length || !targetTerms.length) return 0;
        if (!targetTerms.every((term) => nameTerms.includes(term))) return 0;
        return targetTerms.length / nameTerms.length;
      }

    function visualObligationTarget(row = {}) {
        const explicit = String(row.target || '').trim();
        if (explicit) return explicit;
        return String(row.obligationId || row.id || '')
          .replace(/^[a-z]+:/, '')
          .replace(/[:_-]+/g, ' ')
          .trim();
      }

    function visualEvidenceTokens(value = '') {
        const ignored = new Set([
          'and', 'the', 'with', 'from', 'into', 'over', 'under', 'across', 'through',
          'between', 'within', 'without', 'around', 'near', 'onto', 'that', 'this',
        ]);
        return uniqueList(normalizeVisualEvidenceText(value)
          .split(' ')
          .filter((term) => term.length > 2 && !ignored.has(term))
          .map((term) => visualEvidenceStem(term)));
      }

    function visualEvidenceTextHasTerm(text = '', term = '') {
        const normalized = normalizeVisualEvidenceText(text);
        return normalized.split(' ').some((token) => visualEvidenceStem(token) === term);
      }

    function visualEvidenceStem(term = '') {
        const value = String(term || '');
        if (value.endsWith('ing') && value.length > 5) return value.slice(0, -3).replace(/(.)\1$/, '$1');
        if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
        return value.endsWith('s') && value.length > 4 ? value.slice(0, -1) : value;
      }

    function normalizeVisualEvidenceText(value = '') {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      }

    function visualCompositionLedgerReceipt(compositionLedger = null) {
        const obligations = compositionLedger && Array.isArray(compositionLedger.obligations)
          ? compositionLedger.obligations
          : [];
        return {
          id: 'receipt:composition-ledger',
          schema: 'simulatte.phaseReceipt.v1',
          obligationCount: obligations.length,
          preservedCount: obligations.filter((row) => row.status === 'preserved').length,
          lostCount: obligations.filter((row) => row.status === 'lost').length,
          lostIds: obligations.filter((row) => row.status === 'lost').map((row) => row.id).slice(0, 16),
        };
      }

    function sceneAllowsCausalAffordance(row, sceneKind = '') {
        const rowScene = String(row && row.sceneKind || '').toLowerCase();
        const scene = String(sceneKind || '').toLowerCase();
        if (!rowScene || !scene || rowScene === scene) return true;
        if (scene === 'particle-instrument') {
          return [
            'thermal-plume',
            'mechanical',
            'ferrofluid',
            'digital-network',
            'space-instrument',
            'quantum-instrument',
            'materials-lab',
          ].includes(rowScene);
        }
        const families = [
          ['civic-market', 'digital-network', 'venue-crowd', 'city'],
          ['watershed', 'restoration-water', 'geology-water', 'ocean', 'cryosphere', 'ocean-cryosphere'],
          ['biology', 'evolution-ecology', 'molecular-biology', 'clinical-control', 'agriculture'],
          ['fire', 'thermal-plume', 'fire-weather', 'weather-atmosphere', 'thermal-fluid'],
          ['planetary-space', 'space-instrument', 'aerospace'],
          ['optics', 'optics-thermal', 'thin-film'],
          ['mechanical', 'mechanical-fluid', 'robotics-control', 'structural-geology', 'structural-weather'],
          ['chemistry-lab', 'advanced-energy', 'materials-lab', 'grid-energy'],
        ];
        return families.some((family) => family.includes(scene) && family.includes(rowScene));
      }

    function visualGraphicsAtomsForIR(context) {
        if (visualOperatorCompiler && typeof visualOperatorCompiler.compileVisualGraphicsAtoms === 'function') {
          return visualOperatorCompiler.compileVisualGraphicsAtoms(context);
        }
        return {
          schema: 'simulatte.graphicsAtomPlan.v1',
          atlas: 'simulatte.visualOperatorAtlas.v1',
          compiler: 'missing-visual-operator-compiler',
          atlasId: 'missing-runtime-atlas',
          source: 'fallback-graphics-atom-plan',
          mappings: [],
          geometry: [],
          fields: [],
          materials: [],
          processes: [],
          motion: [],
          camera: [],
          uniforms: {
            schema: 'simulatte.graphicsAtomUniforms.v1',
            order: [],
            values: [],
            bySlot: {},
          },
          wgslOperators: [],
          rejections: [],
          receipts: [],
        };
      }

    function visualMaterialsForGraphicsAtoms(atoms = []) {
        return (atoms || []).map((atom, index) => {
          const family = materialFamilyForGraphicsAtom(atom.id);
          const hue = hashProgram(atom.id || index) % 360;
          return {
            id: `atom:${atom.id}`,
            family,
            shader: shaderForGraphicsMaterialAtom(atom.id, family),
            fill: `hsl(${hue}, 70%, 62%)`,
            stroke: `hsl(${hue}, 58%, 30%)`,
            opacity: /transparent|vapor|fluid|glass/.test(atom.id) ? 0.34 : 0.52,
            roughness: materialRoughness(family),
            emissive: /emissive|hot|flame|plasma|signal|spectral/.test(atom.id),
            evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
            status: 'accepted',
            confidence: 0.66,
            reason: 'graphics atom material compiled from accepted VisualIR operator mapping',
          };
        });
      }

    function materialFamilyForGraphicsAtom(id) {
        const text = String(id || '').toLowerCase();
        if (/hot|thermal|flame|plasma|emissive|heat/.test(text)) return 'thermal';
        if (/vapor|fluid|wet|ripple|water|pressure/.test(text)) return 'fluid';
        if (/transparent|glass|caustic|phase|crystal/.test(text)) return 'transparent';
        if (/metal|trace|coil|instrument|brushed/.test(text)) return 'metal';
        if (/bio|cell|fibrous|membrane/.test(text)) return 'biological';
        if (/granular|soil|strata/.test(text)) return 'granular';
        if (/signal|charged|monitor|electric/.test(text)) return 'electric';
        return 'matte';
      }

    function shaderForGraphicsMaterialAtom(id, family) {
        const text = String(id || '').toLowerCase();
        if (/hot|thermal|flame|emissive/.test(text)) return 'atom-emissive-gradient';
        if (/vapor|fluid|wet|ripple/.test(text)) return 'atom-volume-ripple';
        if (/caustic|transparent|glass|crystal/.test(text)) return 'atom-refractive-caustic';
        if (/signal|charged|trace|monitor/.test(text)) return 'atom-signal-trace';
        if (/fracture|deformed/.test(text)) return 'atom-stress-material';
        return shaderForMaterialFamily(family);
      }

    function visualFieldsForGraphicsAtoms(atoms = [], sceneKind = '') {
        return (atoms || []).map((atom, index) => {
          const id = `atom-field:${atom.id}`;
          const kind = fieldKindForGraphicsAtom(atom.id);
          return {
            id,
            kind,
            channel: atom.id,
            visualEncoding: fieldEncodingForGraphicsAtom(atom.id, sceneKind),
            strength: Number((0.56 + (hashProgram(atom.id) % 31) / 100).toFixed(2)),
            geometry: visualFieldGeometry({ id, kind }, kind),
            evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
            atomId: atom.id,
            status: 'accepted',
            confidence: 0.66,
            reason: 'graphics atom field compiled from accepted VisualIR operator mapping',
          };
        });
      }

    function fieldKindForGraphicsAtom(id) {
        const text = String(id || '').toLowerCase();
        if (/heat|thermal|soot|latent/.test(text)) return 'thermal';
        if (/queue|network|setpoint|state|error/.test(text)) return 'network-flow';
        if (/velocity|pressure|flow/.test(text)) return 'flow';
        if (/stress|impulse|force|constraint/.test(text)) return 'force-field';
        if (/gravity|barycenter/.test(text)) return 'gravity';
        if (/phase|caustic|ray|optical/.test(text)) return 'optical-rays';
        if (/measurement|uncertainty|readout|telemetry|probe|sample/.test(text)) return 'measurement-field';
        if (/sediment|slope|granular|grain|soil|terrain/.test(text)) return 'granular-gradient';
        if (/nutrient|density|growth|bio|cell|membrane|organic/.test(text)) return 'biological-gradient';
        if (/acidity|acid|chemical|reaction|concentration/.test(text)) return 'chemical-gradient';
        if (/flux|charge|magnetic|electromagnetic/.test(text)) return 'dipole';
        return 'state-field';
      }

    function fieldEncodingForGraphicsAtom(id, sceneKind) {
        const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
        if (/heat|thermal|latent/.test(text)) return 'heat-isobands';
        if (/velocity|flow|slope|sediment/.test(text)) return 'topographic-streamlines';
        if (/stress|impulse|force/.test(text)) return 'vector-flux-lines';
        if (/gravity|barycenter|orbit/.test(text)) return 'ray-cone-caustics';
        if (/caustic|phase|ray|optical/.test(text)) return 'ray-cone-caustics';
        if (/measurement|uncertainty|readout|telemetry|probe|sample/.test(text)) return 'readout-bands';
        if (/queue|network|state/.test(text)) return 'node-link-pressure';
        return 'scalar-contours';
      }

    function visualProcessesForGraphicsAtoms(atoms = [], objects = [], sceneKind = '') {
        return (atoms || []).map((atom, index) => ({
          id: `atom-process:${atom.id}`,
          family: atom.id,
          operator: processOperatorForGraphicsAtom(atom.id, sceneKind),
          affects: affectedEntitiesForGraphicsAtom(atom.id, objects),
          motion: motionGrammarForGraphicsAtom(atom.id, sceneKind),
          evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
          order: 200 + index,
          atomId: atom.id,
          status: 'accepted',
          confidence: 0.64,
          reason: 'graphics atom process compiled from accepted VisualIR operator mapping',
        }));
      }

    function processOperatorForGraphicsAtom(id, sceneKind) {
        const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
        if (/thermal|heat|flame|phase/.test(text)) return 'thermal-front';
        if (/flow|transport|pressure|settling|erosion/.test(text)) return 'advected-particles';
        if (/orbit|wave|resonant|phase/.test(text)) return 'wave-or-orbit-trails';
        if (/feedback|routing|queue|control|measurement/.test(text)) return 'agent-routing-pulses';
        if (/growth|diffusion-limited|cell/.test(text)) return 'growth-diffusion-front';
        if (/fracture|contact|impulse|force/.test(text)) return 'constraint-impulse-arcs';
        if (/field|charge|flux|spark/.test(text)) return 'field-line-advection';
        return 'state-pulse-overlay';
      }

    function affectedEntitiesForGraphicsAtom(id, objects) {
        const text = String(id || '').toLowerCase();
        return (objects || []).filter((object) => {
          const row = renderObjectText(object);
          if (/heat|thermal|phase|flame/.test(text)) return /heat|fire|lava|air|metal|steam|ice/.test(row);
          if (/flow|pressure|transport/.test(text)) return /flow|fluid|water|air|pipe|river|coolant/.test(row);
          if (/network|queue|control|feedback|measurement/.test(text)) return /sensor|network|queue|server|controller|agent/.test(row);
          if (/orbit|gravity/.test(text)) return /orbit|space|planet|rocket|body/.test(row);
          if (/fracture|stress|contact/.test(text)) return /wall|solid|bridge|body|impact|constraint/.test(row);
          return true;
        }).slice(0, 8).map((object) => object.id);
      }

    function motionGrammarForGraphicsAtom(id, sceneKind) {
        return motionForProcessFamily(id, sceneKind);
      }

    function visualGeometryForGraphicsAtoms(atoms = [], sceneKind = '') {
        return (atoms || []).map((atom, index) => ({
          id: `geometry:atom:${visualSafeId(atom.id)}`,
          entityId: `graphics-atom:${visualSafeId(atom.id)}`,
          primitive: geometryPrimitiveForGraphicsAtom(atom.id, sceneKind),
          sceneKind,
          label: atom.label || atom.id,
          description: `Graphics atom ${atom.id}`,
          evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
          order: 200 + index,
          atomId: atom.id,
          status: 'accepted',
          confidence: 0.64,
          reason: 'graphics atom geometry compiled from accepted VisualIR operator mapping',
        }));
      }

    function geometryPrimitiveForGraphicsAtom(id, sceneKind) {
        const text = `${id || ''} ${sceneKind || ''}`.toLowerCase();
        if (/composition-topology.*(?:conveyor|ladder|lattice|branching)/.test(text)) return 'route-node-graph';
        if (/composition-topology.*(?:cutaway|stack|corridor|basin|field-map)/.test(text)) return 'sectioned-surface';
        if (/composition-topology.*specimen/.test(text)) return 'instrument-glyph';
        if (/composition-topology.*orbit/.test(text)) return 'orbital-body';
        if (/composition-topology.*radial/.test(text)) return 'optical-field-sheet';
        if (/node[-_ ]?link|graph|route|routing/.test(text)) return 'route-node-graph';
        if (/parcel|grid/.test(text)) return 'parcel-cell-grid';
        if (/agent|controller|feedback/.test(text)) return 'agent-token-swarm';
        if (/plume|volume|tube|flow|cloud|flame/.test(text)) return 'fluid-volume-ribbon';
        if (/sheet|surface|solid|strata|terrain|phase|fuel|wall/.test(text)) return 'sectioned-surface';
        if (/instrument|probe|readout|sensor|resonator/.test(text)) return 'instrument-glyph';
        if (/organic|cell|branch|membrane/.test(text)) return 'organic-silhouette';
        if (/orbit|gravity|trajectory|astral/.test(text)) return 'orbital-body';
        if (/ray|caustic|optical/.test(text)) return 'optical-field-sheet';
        if (/field|flux|pressure|stress/.test(text)) return 'scalar-field-sheet';
        return 'procedural-silhouette';
      }

    function visualMotionForGraphicsAtoms(atoms = [], visualGenome = {}, sceneKind = '') {
        return (atoms || []).map((atom, index) => ({
          id: `motion:atom:${visualSafeId(atom.id)}`,
          processId: `atom-process:${atom.id}`,
          grammar: motionGrammarForGraphicsAtom(atom.id, sceneKind),
          phase: index / Math.max(1, atoms.length),
          speed: motionSpeedForScene(sceneKind, atom.id),
          density: Math.max(24, visualGenome && visualGenome.morphology
            ? visualGenome.morphology.particleDensity || 24
            : 24),
          atomId: atom.id,
          evidence: [`graphics-atom:${atom.id}`, ...(atom.evidence || [])],
          status: 'accepted',
          confidence: 0.62,
          reason: 'graphics atom motion compiled from accepted VisualIR operator mapping',
        }));
      }

    function uniqueVisualRows(rows) {
        const seen = new Set();
        const out = [];
        for (const row of rows || []) {
          const key = String(row && (row.id || row.atomId || row.family || row.kind) || '');
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push(row);
        }
        return out;
      }

    function visualGeometryForCausalAffordances(affordances, sceneKind) {
        return (affordances || []).map((row, index) => ({
          id: `geometry:causal:${visualSafeId(row.id || `affordance-${index + 1}`)}`,
          entityId: `affordance:${visualSafeId(row.id || `affordance-${index + 1}`)}`,
          primitive: geometryPrimitiveForAffordance(row, sceneKind),
          sceneKind: row.sceneKind || sceneKind,
          label: row.id || `causal affordance ${index + 1}`,
          description: row.geometry || 'hand-authored causal visual affordance',
          shaderHints: row.shaderHints || [],
          motionHints: row.motionHints || [],
          causalRelationId: row.causalRelationId || '',
          evidence: [`causal-affordance:${row.id || index}`, row.causalRelationId || 'causal-relation'],
          order: 100 + index,
          status: 'accepted',
          confidence: 0.74,
          reason: 'causal affordance geometry accepted from grounded intent receipt',
        }));
      }

    function geometryPrimitiveForAffordance(row, sceneKind) {
        const text = `${row && row.geometry || ''} ${row && row.sceneKind || ''} ${sceneKind || ''}`.toLowerCase();
        if (/plume|steam|smoke|funnel|aurora|curtain|volume|cloud/.test(text)) return 'volume-ribbon';
        if (/orbit|ring|field|magnetic|pressure|wave|caustic|ray/.test(text)) return 'field-curve-set';
        if (/heightfield|terrain|delta|slope|soil|reef|glacier|ocean/.test(text)) return 'heightfield-slice';
        if (/network|queue|node|shard|warehouse|supply|controller/.test(text)) return 'node-link-volume';
        if (/tube|pipe|artery|droplet|channel|flow/.test(text)) return 'transparent-flow-tube';
        if (/robot|bridge|turbine|rotor|chip|metal|valve/.test(text)) return 'cutaway-machine';
        if (/protein|neuron|root|coral|biomass|algae/.test(text)) return 'organic-branch-volume';
        return 'semantic-3d-affordance';
      }

    function augmentVisualReceiptsWithIntentBrief(receipts, spec, sceneKind) {
        const brief = spec && spec.renderIR && spec.renderIR.intentBriefReceipt ||
          spec && spec.universeGraph && spec.universeGraph.intentBrief ||
          null;
        if (!brief) return receipts;
        const row = {
          schema: 'simulatte.visualIntentBriefReceipt.v1',
          sceneKind,
          evidenceCount: (brief.retrievedEvidence || []).length,
          causalEdges: (brief.causalGraph || []).map((edge) => ({
            id: edge.id,
            relationType: edge.relationType,
            operatorType: edge.operatorType,
            sourceLabel: edge.sourceLabel,
            targetLabel: edge.targetLabel,
            mechanism: edge.mechanism,
          })).slice(0, 16),
          assumptions: (brief.assumptions || []).map((assumption) => ({
            id: assumption.id,
            label: assumption.label,
            statement: assumption.statement,
          })).slice(0, 12),
          unsupported: (brief.unsupported || []).map((item) => ({
            id: item.id,
            label: item.label,
            reason: item.reason,
          })).slice(0, 12),
          degradedTo: (brief.degradedTo || []).map((item) => ({
            id: item.id,
            label: item.label,
            reason: item.reason,
          })).slice(0, 12),
          visualAffordances: brief.visualIntent && Array.isArray(brief.visualIntent.affordances)
            ? brief.visualIntent.affordances.slice(0, 8)
            : [],
          visualAffordanceCount: brief.visualIntent &&
            Array.isArray(brief.visualIntent.affordances)
            ? brief.visualIntent.affordances.length
            : 0,
          causalEdgeCount: (brief.causalGraph || []).length,
          assumptionCount: (brief.assumptions || []).length,
          unsupportedCount: (brief.unsupported || []).length,
          degradedCount: (brief.degradedTo || []).length,
          evidenceIds: (brief.retrievedEvidence || []).map((item) => item.id).filter(Boolean).slice(0, 24),
          causalEdgeIds: (brief.causalGraph || []).map((edge) => edge.id || edge.ruleId).filter(Boolean).slice(0, 16),
          shaderHints: brief.visualIntent && brief.visualIntent.shaderHints || [],
          motionHints: brief.visualIntent && brief.visualIntent.motionHints || [],
        };
        if (Array.isArray(receipts)) return [...receipts, row];
        return { ...(receipts || {}), intentBrief: row };
      }

    Object.assign(scope, {
      wakeFieldRowsForSwimmingAgents,
      swimmingEffectRowsForAgents,
      swimmingPosePath,
      submersionBoundsForPose,
      isSwimmingWaterEntity,
      swimmingWaterEntityText,
      hasSwimmingSceneSignal,
      lowerSwimmingWaterEntity,
      swimmingVisualLoweringReceipt,
      causalAffordancesFromSpec,
      visualCompositionLedgerForSpec,
      visualObligationStatus,
      visualObligationEvidence,
      visualCompositionLedgerReceipt,
      sceneAllowsCausalAffordance,
      visualGraphicsAtomsForIR,
      visualMaterialsForGraphicsAtoms,
      materialFamilyForGraphicsAtom,
      shaderForGraphicsMaterialAtom,
      visualFieldsForGraphicsAtoms,
      fieldKindForGraphicsAtom,
      fieldEncodingForGraphicsAtom,
      visualProcessesForGraphicsAtoms,
      processOperatorForGraphicsAtom,
      affectedEntitiesForGraphicsAtom,
      motionGrammarForGraphicsAtom,
      visualGeometryForGraphicsAtoms,
      geometryPrimitiveForGraphicsAtom,
      visualMotionForGraphicsAtoms,
      uniqueVisualRows,
      visualGeometryForCausalAffordances,
      geometryPrimitiveForAffordance,
      augmentVisualReceiptsWithIntentBrief,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
