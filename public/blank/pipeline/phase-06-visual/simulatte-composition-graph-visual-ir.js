(function attachSimulatteCompositionGraphvisualir(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');

    function wakeFieldRowsForSwimmingAgents(agents = []) {
        return (agents || []).map((entity, index) => {
          const pose = entity.pose || scope.swimmingAgentPose(entity, index, agents.length, scope.swimmingAgentSpecies(entity));
          const species = scope.swimmingAgentSpecies(entity) || 'animal';
          const radius = species === 'dog' ? 0.145 : 0.105;
          const center = [
            scope.clamp(Number(pose.x || 0.5) - Number(pose.w || 0.14) * 0.36, 0.08, 0.92),
            scope.clamp(Number(pose.y || 0.62) + Number(pose.h || 0.08) * 0.12, 0.08, 0.92),
          ];
          return {
            id: `visual:wake:${scope.visualSafeId(entity.id)}`,
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
            evidence: scope.uniqueList([
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
          const pose = entity.pose || scope.swimmingAgentPose(entity, index, agents.length, scope.swimmingAgentSpecies(entity));
          const species = scope.swimmingAgentSpecies(entity) || 'animal';
          rows.push({
            id: `visual:swim-pose:${scope.visualSafeId(entity.id)}`,
            family: 'swimming-pose',
            operator: 'swim-stroke-silhouette',
            motion: 'swim-cycle',
            affects: [entity.id],
            pose: {
              points: swimmingPosePath(pose, species),
              rotation: Number(pose.rotation || 0),
            },
            materialId: scope.speciesSwimMaterialId(species),
            sourceGraphId: entity.sourceGraphId || entity.id,
            evidence: scope.uniqueList([
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
            id: `visual:submersion:${scope.visualSafeId(entity.id)}`,
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
            evidence: scope.uniqueList([
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
          [scope.clamp(x - w * reach, 0.05, 0.95), scope.clamp(y + h * 0.08, 0.05, 0.95)],
          [scope.clamp(x, 0.05, 0.95), scope.clamp(y - h * 0.12, 0.05, 0.95)],
          [scope.clamp(x + w * 0.62, 0.05, 0.95), scope.clamp(y + h * 0.1, 0.05, 0.95)],
        ];
      }

    function submersionBoundsForPose(pose = {}) {
        const x = Number(pose.x || 0.5);
        const y = Number(pose.y || 0.62);
        const w = Number(pose.w || 0.14);
        const h = Number(pose.h || 0.08);
        return [
          scope.clamp(x - w * 0.58, 0.02, 0.96),
          scope.clamp(y, 0.02, 0.96),
          scope.clamp(w * 1.16, 0.04, 0.5),
          scope.clamp(h * 0.56, 0.025, 0.24),
        ];
      }

    function isSwimmingWaterEntity(entity = {}, sceneKind = '', spec = {}) {
        if (!hasSwimmingSceneSignal(spec, sceneKind)) return false;
        if (scope.swimmingAgentSpecies(entity)) return false;
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
        const text = scope.swimmingEntityText(entity);
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
          geometryConstraints: scope.uniqueList([
            ...(entity.geometryConstraints || []),
            'contains-swimming-agents',
            'waterline-overlap',
          ]),
          evidence: scope.uniqueList([
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
          species: scope.uniqueList(agents.map(scope.swimmingAgentSpecies).filter(Boolean)),
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
        const dogMaterialIds = scope.uniqueList((renderInstances || [])
          .filter((row) => row.type === 'geometry' &&
            row.layerSlot === 'biological-agent' &&
            row.identity &&
            row.identity.type === 'dog')
          .map((row) => row.materialId || row.material && row.material.id)
          .filter((id) => id === scope.speciesSwimMaterialId('dog')));
        const catMaterialIds = scope.uniqueList((renderInstances || [])
          .filter((row) => row.type === 'geometry' &&
            row.layerSlot === 'biological-agent' &&
            row.identity &&
            row.identity.type === 'cat')
          .map((row) => row.materialId || row.material && row.material.id)
          .filter((id) => id === scope.speciesSwimMaterialId('cat')));
        const swimRows = scope.uniqueList((renderInstances || [])
          .filter((row) => /visual:swim-pose|visual-swim-pose/.test([
            row.id,
            row.processId,
          ].filter(Boolean).join(' ').toLowerCase()))
          .map((row) => row.processId || row.id)
          .filter(Boolean));
        const wakeRows = scope.uniqueList([
          ...(fields || [])
            .filter((row) => /^visual:wake:/.test(String(row.id || '')) ||
              /agent-wake-ripple-trail/.test(String(row.visualEncoding || '')))
            .map((row) => row.id),
        ].filter(Boolean));
        const submersionRows = scope.uniqueList([
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
          promptVisualSettlements: scope.promptVisualObligationSettlements(
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
            schema: scope.SCENE_COMPOSITION_LEDGER_SCHEMA,
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
          if (relationType === 'occurs-in') return subject.length && object.length ? scope.uniqueList([...subject, ...object]) : [];
          const normalizedId = normalizeVisualEvidenceText(id);
          const constraint = rows.filter((candidate) => candidate.evidenceText.includes(normalizedId))
            .map((candidate) => `phase6:${candidate.source}:${candidate.id}`);
          return subject.length && object.length && constraint.length
            ? scope.uniqueList([...subject, ...object, ...constraint, `layout-relation:${id}`])
            : [];
        }
        if (id === 'action:coexists') {
          return scope.uniqueList((sourceObligations || [])
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
          if (subject.length && object.length && exact.length) return scope.uniqueList([...subject, ...exact, ...object]);
          const sourceRelation = sourceRelations.find((candidate) => candidate.id === id);
          const spatial = sourceRelation && sourceRelations.find((candidate) => (
            candidate !== sourceRelation && candidate.kind === 'spatial-constraint' &&
            candidate.from === sourceRelation.from &&
            (candidate.target || candidate.to) === (sourceRelation.target || sourceRelation.to)
          ));
          if (spatial) {
            const spatialEvidence = genericVisualEvidence({ ...row, id: spatial.id }, rows, sourceObligations, sourceEntries, sourceRelations);
            if (spatialEvidence.length) return scope.uniqueList([...spatialEvidence, `relation-source:${id}`]);
          }
          return subject.length && object.length && (!process.length ? parts[2] === 'coexists' : true)
            ? scope.uniqueList([...subject, ...process, ...object])
            : [];
        }
        if (row.kind === 'action') {
          const target = visualObligationTarget(row);
          const owner = sourceRelations.find((relation) => relation.to === row.id ||
            [relation.predicate, relation.process].some((value) =>
              normalizeVisualEvidenceText(value) === normalizeVisualEvidenceText(target)));
          const owned = owner && visualEvidenceForTarget(String(owner.from || '').replace(/^[a-z]+:/, ''), rows);
          return owned && owned.length ? owned : visualEvidenceForLedgerAction(target, rows, sourceEntries);
        }
        return visualEvidenceForTarget(visualObligationTarget(row), rows);
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
        return scope.uniqueList((sourceEntries || []).filter((entry) => entry && entry.kind === 'action' && entry.source === 'prompt' &&
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
        return scope.uniqueList(normalizeVisualEvidenceText(value)
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

    root.SimulattePhaseModuleRegistry.define('compositionGraph', 'simulatte-composition-graph-visual-ir.js', {
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
      augmentVisualReceiptsWithIntentBrief,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
