(function attachSimulattePhysicsModelphaseruntimelanguage(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const TERM_FALLBACK_CONCEPT_MAX = 6;

    function phaseOutputSchema(phase) {
        return PHASE_OUTPUT_SCHEMAS[Number(phase)] || `simulatte.phase${Number(phase) || 0}.output.v1`;
      }

    function createPhaseEnvelope({ phase, inputSchema, runtimeReceiptId, artifact = {}, receipts = [] }) {
        const phaseNumber = Number(phase);
        if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 8) {
          throw new Error(`Invalid Simulatte phase envelope phase: ${phase}`);
        }
        return {
          schema: phaseOutputSchema(phaseNumber),
          phase: phaseNumber,
          inputSchema: inputSchema || (phaseNumber === 1 ? PHASE_ZERO_INPUT_SCHEMA : phaseOutputSchema(phaseNumber - 1)),
          runtimeReceiptId: String(runtimeReceiptId || 'runtime:unknown'),
          artifact: artifact && typeof artifact === 'object' ? artifact : {},
          receipts: Array.isArray(receipts) ? receipts.filter(Boolean) : [],
        };
      }

    function assertPhaseEnvelope(envelope, phase, label = 'phase boundary') {
        const expected = phaseOutputSchema(phase);
        if (!envelope || envelope.schema !== expected || Number(envelope.phase) !== Number(phase)) {
          const received = envelope && envelope.schema ? envelope.schema : typeof envelope;
          throw new Error(`${label} expected ${expected}, received ${received}`);
        }
        const contract = PHASE_CONTRACTS[Number(phase)];
        if (contract && envelope.inputSchema !== contract.inputSchema) {
          throw new Error(`${label} expected inputSchema ${contract.inputSchema}, received ${envelope.inputSchema || 'missing'}`);
        }
        if (!envelope.artifact || typeof envelope.artifact !== 'object' || Array.isArray(envelope.artifact)) {
          throw new Error(`${label} expected artifact object`);
        }
        for (const key of contract ? contract.artifactKeys : []) {
          if (!(key in envelope.artifact)) {
            throw new Error(`${label} missing artifact.${key}`);
          }
        }
        if (contract) {
          const allowedArtifactKeys = new Set(contract.artifactKeys);
          for (const key of Object.keys(envelope.artifact)) {
            if (!allowedArtifactKeys.has(key)) {
              throw new Error(`${label} unexpected artifact.${key}`);
            }
          }
        }
        if (!Array.isArray(envelope.receipts)) {
          throw new Error(`${label} expected receipts array`);
        }
        const receiptIds = new Set(envelope.receipts.map((receipt) => receipt && receipt.id).filter(Boolean));
        for (const required of contract ? contract.receiptIds : []) {
          if (!receiptIds.has(required)) {
            throw new Error(`${label} missing receipt ${required}`);
          }
        }
        for (const receipt of envelope.receipts) {
          if (!receipt || receipt.schema !== 'simulatte.phaseReceipt.v1') {
            throw new Error(`${label} expected receipt schema simulatte.phaseReceipt.v1`);
          }
        }
        const forbidden = firstForbiddenField(
          envelope.artifact,
          contract ? contract.forbiddenUpstreamReads : []
        );
        if (forbidden) {
          throw new Error(`${label} contains forbidden upstream field ${forbidden}`);
        }
        return envelope;
      }

    function firstForbiddenField(value, forbiddenRows = []) {
        if (!value || typeof value !== 'object' || !forbiddenRows.length) return '';
        const names = new Set(forbiddenRows.filter((field) => !field.includes('.')));
        const paths = forbiddenRows
          .filter((field) => field.includes('.'))
          .map((field) => ({ field, parts: field.split('.') }));
        const stack = [value];
        const seen = new WeakSet();
        while (stack.length) {
          const current = stack.pop();
          if (!current || typeof current !== 'object' || seen.has(current)) continue;
          seen.add(current);
          for (const key of Object.keys(current)) {
            if (names.has(key)) return key;
            const child = current[key];
            if (child && typeof child === 'object') stack.push(child);
          }
          for (const path of paths) {
            if (pathPresentAt(current, path.parts)) return path.field;
          }
        }
        return '';
      }

    function pathPresentAt(value, pathParts) {
        let current = value;
        for (const part of pathParts) {
          if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
            return false;
          }
          current = current[part];
        }
        return true;
      }

    function forbiddenFieldPresent(value, forbidden) {
        return firstForbiddenField(value, forbidden ? [forbidden] : []) === forbidden;
      }

    function dottedPathPresent(value, pathParts) {
        const forbidden = (pathParts || []).join('.');
        return forbiddenFieldPresent(value, forbidden);
      }

    function fieldNamePresent(value, forbidden) {
        return forbiddenFieldPresent(value, forbidden);
      }

    function validatePhaseEnvelope(envelope, phase) {
        return assertPhaseEnvelope(envelope, phase, `Phase ${phase} validator`);
      }

    function validatePhase1RuntimeReady(envelope) {
        return validatePhaseEnvelope(envelope, 1);
      }

    function validatePhase2LanguageGraph(envelope) {
        return validatePhaseEnvelope(envelope, 2);
      }

    function validatePhase3RetrievalRerank(envelope) {
        return validatePhaseEnvelope(envelope, 3);
      }

    function validatePhase4GroundedIntent(envelope) {
        return validatePhaseEnvelope(envelope, 4);
      }

    function validatePhase5SimulationCompile(envelope) {
        return validatePhaseEnvelope(envelope, 5);
      }

    function validatePhase6VisualCompile(envelope) {
        return validatePhaseEnvelope(envelope, 6);
      }

    function validatePhase7RenderExecution(envelope) {
        return validatePhaseEnvelope(envelope, 7);
      }

    function validatePhase8SceneProof(envelope) {
        return validatePhaseEnvelope(envelope, 8);
      }

    function sceneProofApi() {
        if (typeof globalThis !== 'undefined' && globalThis.SimulatteSceneProof) {
          return globalThis.SimulatteSceneProof;
        }
        if (typeof module === 'object' && module.exports && typeof require === 'function') {
          try {
            return require('../phase-08-scene-proof/simulatte-scene-proof.js');
          } catch (_err) {}
        }
        return null;
      }

    function runPhase8SceneProof(phase7Output, options = {}) {
        const api = sceneProofApi();
        if (!api || typeof api.settleSceneProof !== 'function') {
          throw new Error('Phase 8 scene proof requires SimulatteSceneProof.settleSceneProof; load phase-08-scene-proof/simulatte-scene-proof.js');
        }
        return assertPhaseEnvelope(api.settleSceneProof(phase7Output, options), 8, 'Phase 8 output');
      }

    function phaseArtifactSet(...envelopes) {
        const out = {};
        for (const envelope of envelopes) {
          if (!envelope || !envelope.phase) continue;
          out[`phase${envelope.phase}`] = envelope;
        }
        return out;
      }

    function mergePhaseArtifacts(...sets) {
        return sets.reduce((out, set) => {
          if (!set || typeof set !== 'object') return out;
          for (const key of Object.keys(set)) {
            if (/^phase[1-8]$/.test(key) && set[key]) out[key] = set[key];
          }
          return out;
        }, {});
      }

    function runtimeContextFromOptions(options = {}) {
        const receipt = options.promptRuntimeReceipt || options.runtimeReceipt || null;
        const embeddingModel = options.embeddingModel || receipt && receipt.model || null;
        const modelId = embeddingModel && embeddingModel.id || receipt && (receipt.modelId || receipt.id) || '';
        const backend = options.embeddingBackend || receipt && (receipt.providerBackend || receipt.backend || receipt.provider) || '';
        const cacheMode = receipt && (receipt.cacheMode || receipt.cacheBackends) || options.cacheMode || '';
        const runtimeReceiptId = String(
          options.runtimeReceiptId ||
          receipt && (receipt.runtimeReceiptId || receipt.receiptId || receipt.id) ||
          `runtime:${seedFromString([modelId, backend, cacheMode].filter(Boolean).join(':') || 'local').toString(36)}`
        );
        const retrievalEvidence = retrievalEvidenceFromOptions(options);
        return {
          schema: 'simulatte.phaseRuntimeContext.v1',
          runtimeReceiptId,
          modelId: modelId || '',
          backend: backend || '',
          cacheMode: cacheMode || '',
          providerReady: receipt && receipt.providerReady === true,
          noFallback: receipt && receipt.noFallback === true,
          promptRuntimeReceipt: receipt,
          retrievalEvidence,
          retrievalPhase: options.retrievalPhase || '',
          runtimeMode: receipt && receipt.providerReady === true
            ? 'model-backed'
            : options.allowPrototypeFallback === true
              ? 'prototype-fallback'
              : 'unproven',
        };
      }

    function runtimeContextFromPhase(phaseOutput) {
        const artifact = phaseOutput && phaseOutput.artifact || {};
        return artifact.runtimeContext || {
          schema: 'simulatte.phaseRuntimeContext.v1',
          runtimeReceiptId: phaseOutput && phaseOutput.runtimeReceiptId || 'runtime:unknown',
        };
      }

    function retrievalEvidenceFromOptions(options = {}) {
        if (options.phase3RetrievalEvidence && typeof options.phase3RetrievalEvidence === 'object') {
          return sanitizePhase3RetrievalEvidence(options.phase3RetrievalEvidence);
        }
        return sanitizePhase3RetrievalEvidence({
          schema: 'simulatte.phase3.retrievalEvidence.v1',
          rankedPrimitives: arrayClone(options.rankedPrimitives || options.embeddingPriors || options.primitiveMatches),
          rankedCards: arrayClone(options.rankedCards || options.cardMatches || options.surfaceCardMatches),
          rankedUniverseRows: arrayClone(options.rankedUniverseRows || options.universeMatches),
          classification: clonePhaseValue(options.classification || null),
          semanticRag: clonePhaseValue(options.semanticRag || null),
          rerank: clonePhaseValue(options.intentRerank || options.rerank || null),
          dopplerIntent: clonePhaseValue(options.dopplerIntent || null),
          spanRetrieval: clonePhaseValue(options.spanRetrieval || null),
          slotRetrieval: clonePhaseValue(options.slotRetrieval || null),
          evidenceRows: arrayClone(options.evidenceRows),
          universeGraph: clonePhaseValue(options.universeGraph || null),
          components: arrayClone(options.components),
          visualSource: clonePhaseValue(options.visualSource || null),
          params: clonePhaseValue(options.params || {}),
          retrievalPhase: options.retrievalPhase || '',
          model: clonePhaseValue(options.embeddingModel || null),
          backend: options.embeddingBackend || '',
        });
      }

    function sanitizePhase3RetrievalEvidence(evidence = {}) {
        return {
          schema: evidence.schema || 'simulatte.phase3.retrievalEvidence.v1',
          sourcePromptHash: evidence.sourcePromptHash || evidence.promptHash || '',
          rankedPrimitives: arrayClone(evidence.rankedPrimitives || evidence.primitiveMatches),
          primitiveMatches: arrayClone(evidence.primitiveMatches),
          rankedCards: arrayClone(evidence.rankedCards || evidence.cardMatches || evidence.surfaceCardMatches),
          rankedUniverseRows: arrayClone(evidence.rankedUniverseRows || evidence.universeMatches),
          classification: clonePhaseValue(evidence.classification || null),
          semanticRag: clonePhaseValue(evidence.semanticRag || null),
          rerank: clonePhaseValue(evidence.intentRerank || evidence.rerank || null),
          rerankReceipt: clonePhaseValue(evidence.rerankReceipt || null),
          dopplerIntent: clonePhaseValue(evidence.dopplerIntent || null),
          spanRetrieval: clonePhaseValue(evidence.spanRetrieval || null),
          slotRetrieval: clonePhaseValue(evidence.slotRetrieval || null),
          evidenceRows: arrayClone(evidence.evidenceRows),
          universeGraph: clonePhaseValue(evidence.universeGraph || null),
          components: arrayClone(evidence.components),
          visualSource: clonePhaseValue(evidence.visualSource || null),
          params: clonePhaseValue(evidence.params || {}),
          retrievalPhase: evidence.retrievalPhase || '',
          model: clonePhaseValue(evidence.model || evidence.embeddingModel || null),
          backend: evidence.backend || evidence.embeddingBackend || '',
        };
      }

    function withPhase1RetrievalEvidence(phase1Output, retrievalEvidence = {}) {
        assertPhaseEnvelope(phase1Output, 1, 'Phase 1 retrieval carrier');
        const carried = retrievalEvidence && typeof retrievalEvidence === 'object' ? retrievalEvidence : {};
        const existingRuntime = runtimeContextFromPhase(phase1Output);
        const promptIngress = phase1Output.artifact && phase1Output.artifact.promptIngress || {};
        const sourcePromptHash = carried.sourcePromptHash ||
          existingRuntime.retrievalEvidence && existingRuntime.retrievalEvidence.sourcePromptHash ||
          stableTextHash(promptIngress.sourceText || '');
        const runtimeContext = {
          ...existingRuntime,
          retrievalEvidence: clonePhaseValue({
            ...(existingRuntime.retrievalEvidence || {}),
            ...carried,
            schema: carried.schema || 'simulatte.phase3.retrievalEvidence.v1',
            sourcePromptHash,
          }),
          retrievalPhase: carried.retrievalPhase || existingRuntime.retrievalPhase || '',
        };
        return {
          ...phase1Output,
          artifact: {
            ...phase1Output.artifact,
            runtimeContext,
          },
        };
      }

    function clonePhaseValue(value) {
        if (value == null) return value;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_error) {
          if (Array.isArray(value)) return value.map((item) => clonePhaseValue(item));
          if (typeof value === 'object') return { ...value };
          return value;
        }
      }

    function arrayClone(value) {
    	    return Array.isArray(value) ? clonePhaseValue(value) : [];
    	  }

    function stableTextHash(value = '') {
    	    let hash = 2166136261;
    	    const text = String(value || '');
    	    for (let index = 0; index < text.length; index += 1) {
    	      hash ^= text.charCodeAt(index);
    	      hash = Math.imul(hash, 16777619);
    	    }
    	    return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
    	  }

    function phase1CompositionLedger(sourceText = '') {
    	    const sourcePromptHash = stableTextHash(sourceText);
    	    return {
    	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
    	      sourcePromptHash,
    	      sourcePhase: 1,
    	      currentPhase: 1,
    	      entries: [{
    	        id: 'prompt:source',
    	        kind: 'prompt',
    	        label: 'source prompt',
    	        source: 'prompt',
                required: true,
    	        status: 'preserved',
    	        evidenceIds: ['promptIngress.sourceText'],
    	        supportOnly: false,
    	      }],
    	      relations: [],
    	      obligations: [],
    	      phaseDeltas: [{
    	        phase: 1,
    	        entryId: 'prompt:source',
    	        operation: 'preserved',
    	        receiptId: 'phase1-runtime-context',
    	      }],
    	      losses: [],
    	      unsupported: [],
    	      summary: {
    	        entryCount: 1,
    	        relationCount: 0,
    	        obligationCount: 0,
    	        failedCount: 0,
    	      },
    	    };
    	  }

    function sceneLanguageGraphFromLanguageGraph(languageGraph = {}) {
    	    const spans = Array.isArray(languageGraph.spans) ? languageGraph.spans : [];
    	    const predicates = Array.isArray(languageGraph.predicates) ? languageGraph.predicates : [];
    	    const relations = sceneRelationsFromLanguageGraph(languageGraph);
        const termFallbackConcepts = spans
    	      .filter((span) => span.kind === 'term' && !sceneSpanHasKnownRole(span))
	      .slice(0, TERM_FALLBACK_CONCEPT_MAX)
    	      .map((span) => ({
	        ...sceneEntryForSpan(span, 'concept', languageGraph),
    	        semanticClass: 'term',
	        source: 'term-concept-fallback',
    	        required: false,
    	      }));
	    const entities = uniqueById([
	      ...spans
          .filter((span) => span.kind === 'entity' && span.semanticRole !== 'part')
	        .map((span) => sceneEntryForSpan(span, 'entity', languageGraph)),
      ]);
      const parts = uniqueById(spans
        .filter((span) => span.kind === 'entity' && span.semanticRole === 'part')
        .map((span) => sceneEntryForSpan(span, 'part', languageGraph)));
    	    const actions = uniqueById([
    	      ...spans.filter((span) => span.kind === 'process').map((span) => sceneEntryForSpan(span, 'action', languageGraph)),
    	      ...predicates.filter((predicate) => predicate.process).map((predicate) => ({
    	        id: `action:${normalizeForEvidence(predicate.process).replace(/\s+/g, '-')}`,
    	        kind: 'action',
    	        label: predicate.process,
    	        semanticClass: predicate.process === 'swimming' ? 'locomotion-in-fluid' : predicate.process,
    	        source: 'predicate',
    	        sourceSpanIds: [predicate.verbSpanId].filter(Boolean),
                required: Boolean(predicate.verbSpanId),
    	      })),
    	    ]);
    	    const environments = uniqueById(spans
    	      .filter((span) => span.kind === 'environment')
    	      .map((span) => sceneEntryForSpan(span, 'environment', languageGraph)));
    	    const promptMediums = spans
    	      .filter((span) => span.kind === 'material' && WATER_MEDIUM_RE.test(normalizeForEvidence(span.text || span.materialHint || '')))
    	      .map((span) => sceneEntryForSpan(span, 'medium', languageGraph));
    	    const inferredMediums = predicates.some((predicate) => (
    	      predicate.process === 'swimming' ||
    	      predicate.objectRole === 'fluid-medium' ||
    	      predicate.causalAffordance === 'agents-in-water'
    	    )) || environments.some((entry) => WATER_ENVIRONMENT_RE.test(normalizeForEvidence(entry.label)))
    	      ? [{
    	        id: 'medium:water',
    	        kind: 'medium',
    	        label: 'water',
    	        semanticClass: 'fluid-medium',
    	        source: 'inference',
    	        sourceSpanIds: environments.flatMap((entry) => entry.sourceSpanIds || []),
    	        required: false,
    	        inferred: true,
    	      }]
    	      : [];
    	    const mediums = uniqueById([...promptMediums, ...inferredMediums]);
    	    const attributes = spans
    	      .filter((span) => span.kind === 'modifier')
    	      .map((span) => sceneEntryForSpan(span, 'attribute', languageGraph));
        const promotedTermSpanIds = new Set(termFallbackConcepts.flatMap((entry) => entry.sourceSpanIds || []));
    	    const unsupportedSpans = spans.filter((span) => (
    	      span.kind === 'term' && !sceneSpanHasKnownRole(span) && !promotedTermSpanIds.has(span.id)
    	    ));
    	    const negations = sceneNegationsFromLanguageGraph(languageGraph);
    	    return {
    	      schema: SCENE_LANGUAGE_GRAPH_SCHEMA,
    	      sourcePromptHash: stableTextHash(languageGraph.sourceText || ''),
    	      tokens: arrayClone(languageGraph.tokens),
    	      spans: arrayClone(spans),
      entities,
      concepts: termFallbackConcepts,
      parts,
    	      actions,
    	      attributes,
    	      quantities: arrayClone(languageGraph.quantities),
    	      environments,
    	      mediums,
    	      relations,
    	      negations,
    	      unsupportedSpans: unsupportedSpans.map((span) => phaseCarryObject({
    	        id: span.id || '',
    	        text: span.text || '',
    	        reason: 'no typed scene role',
    	      })),
    	      summary: {
        entityCount: entities.length,
        conceptCount: termFallbackConcepts.length,
        partCount: parts.length,
    	        actionCount: actions.length,
    	        environmentCount: environments.length,
    	        mediumCount: mediums.length,
    	        relationCount: relations.length,
    	      },
    	    };
    	  }

	    function sceneEntryForSpan(span = {}, fallbackKind = '', languageGraph = {}) {
    	    const kind = fallbackKind === 'action' ? 'action' :
    	      fallbackKind === 'medium' ? 'medium' :
    	      fallbackKind || span.kind || 'entry';
    	    const target = sceneTargetForSpan(span, kind);
    	    const negated = sceneSpanIsNegated(languageGraph, span);
    	    return {
	      id: sceneEntryIdForSpan(span, kind, languageGraph),
    	      kind,
    	      label: span.text || target,
	      semanticClass: span.semanticRole || span.entityClass || span.materialHint || kind,
	      visualArchetype: span.visualArchetype || '',
	      shapeHints: span.shapeHints || (span.visualArchetype ? [span.visualArchetype] : []),
    	      source: 'prompt',
    	      sourceSpanIds: [span.id].filter(Boolean),
    	      required: negated ? false : true,
    	      inferred: false,
    	      negated,
    	      status: negated ? 'negated' : 'preserved',
    	    };
    	  }

    function sceneEntryIdForSpan(span = {}, kind = '', languageGraph = {}) {
      const target = sceneTargetForSpan(span, kind);
      const baseId = `${kind}:${target}`;
      if (!span.id || !['entity', 'environment', 'medium'].includes(kind)) return baseId;
      const peers = (languageGraph.spans || []).filter((row) => {
        const rowKind = row.kind === 'environment' ? 'environment' :
          row.kind === 'material' ? 'medium' : 'entity';
        return rowKind === kind && sceneTargetForSpan(row, kind) === target;
      });
      const occurrence = peers.findIndex((row) => row.id === span.id);
      return occurrence > 0 ? `${baseId}:${occurrence + 1}` : baseId;
    }

    function sceneTargetForSpan(span = {}, kind = '') {
    	    if (span.entityClass) return normalizeForEvidence(span.entityClass).replace(/\s+/g, '-');
    	    if (kind === 'action') {
    	      const text = normalizeForEvidence(span.text);
    	      if (SWIMMING_RE.test(text)) return 'swimming';
    	      return text.replace(/\s+/g, '-') || 'action';
    	    }
    	    if (kind === 'medium') {
    	      if (span.materialHint) return normalizeForEvidence(span.materialHint).replace(/\s+/g, '-');
    	      if (WATER_MEDIUM_RE.test(normalizeForEvidence(span.text))) return 'water';
    	    }
    	    return normalizeForEvidence(span.text).replace(/\s+/g, '-') || kind || 'entry';
    	  }

    function sceneSpanHasKnownRole(span = {}) {
    	    return ['entity', 'process', 'material', 'environment', 'modifier', 'observable'].includes(span.kind || '');
    	  }

	    function sceneRelationsFromLanguageGraph(languageGraph = {}) {
    	    const relations = [];
    	    for (const predicate of languageGraph.predicates || []) {
    	      const subject = sceneSpanById(languageGraph, predicate.subjectSpanId);
    	      const object = sceneSpanById(languageGraph, predicate.objectSpanId);
    	      if (sceneSpanIsNegated(languageGraph, subject) || sceneSpanIsNegated(languageGraph, object)) continue;
	      const subjectId = subject ? sceneNodeIdForSpan(languageGraph, subject) : '';
	      const actionTarget = predicate.process ? normalizeForEvidence(predicate.process).replace(/\s+/g, '-') : '';
    	      const implicitTarget = predicate.implicitObject
    	        ? normalizeForEvidence(predicate.implicitObject).replace(/\s+/g, '-')
    	        : '';
	      const objectId = object
	        ? sceneNodeIdForSpan(languageGraph, object)
	        : implicitTarget ? `medium:${implicitTarget}` : '';
	      if (subjectId && actionTarget) {
	        relations.push({
	          id: `relation:${sceneRelationIdToken(subjectId)}:${actionTarget}:${sceneRelationIdToken(objectId) || 'world'}`,
	          kind: objectId ? 'agent-action-location' : 'agent-action',
	          from: subjectId,
	          to: `action:${actionTarget}`,
	          target: objectId,
    	          sourceSpanIds: [predicate.subjectSpanId, predicate.verbSpanId, predicate.objectSpanId].filter(Boolean),
    	          required: true,
    	          status: 'preserved',
	          evidenceIds: [predicate.id].filter(Boolean),
	          predicate: predicate.predicate || '',
	          process: predicate.process || '',
	          spatialRelation: predicate.spatialRelation || '',
    	          causalAffordance: predicate.causalAffordance || '',
    	        });
    	      }
	      }
	    for (const relation of languageGraph.relations || []) {
	      if (!relation.relation || relation.relation === 'performs') continue;
	      if (!/^(?:in|inside|into|within|on|onto|at|over|above|under|below|beside|near|outside|around|behind|in-front-of|attached-to|against|through|between|supports|with)$/.test(String(relation.relation))) continue;
	      const subject = sceneSpanById(languageGraph, relation.sourceSpanId);
	      const object = sceneSpanById(languageGraph, relation.targetSpanId);
	      if (!subject || !object || sceneSpanIsNegated(languageGraph, subject) || sceneSpanIsNegated(languageGraph, object)) continue;
	      const from = sceneNodeIdForSpan(languageGraph, subject);
	      const to = sceneNodeIdForSpan(languageGraph, object);
	      if (!from || !to) continue;
	      relations.push({
	        id: `relation:spatial:${sceneRelationIdToken(from)}:${relation.relation}:${sceneRelationIdToken(to)}`,
	        kind: 'spatial-constraint',
	        from,
	        to,
	        target: to,
	        sourceSpanIds: [relation.sourceSpanId, relation.targetSpanId].filter(Boolean),
	        required: true,
	        status: 'preserved',
	        evidenceIds: [relation.id].filter(Boolean),
	        predicate: relation.predicate || relation.relation || '',
	        process: relation.process || 'spatial_constraint',
	        spatialRelation: relation.relation || '',
	        causalAffordance: relation.causalAffordance || '',
	      });
	    }
	    const seen = new Set();
	    return relations.filter((relation) => {
	      const key = [relation.kind, relation.from, relation.to, relation.target,
	        relation.spatialRelation, relation.predicate].join(':');
	      if (seen.has(key)) return false;
	      seen.add(key);
	      return true;
	    });
	  }

	function sceneNodeIdForSpan(languageGraph = {}, span = {}) {
		  const kind = span.kind === 'environment' ? 'environment' : span.kind === 'material' ? 'medium' :
		    span.semanticRole === 'part' ? 'part' : 'entity';
	  return sceneEntryIdForSpan(span, kind, languageGraph);
	}

    function sceneRelationIdToken(value = '') {
      return String(value || '').replace(/:/g, '-');
    }

    function sceneSpanById(languageGraph = {}, id = '') {
    	    return (languageGraph.spans || []).find((span) => span.id === id) || null;
    	  }

    function sceneNegationsFromLanguageGraph(languageGraph = {}) {
    	    return (languageGraph.negations || []).map((negation, index) => phaseCarryObject({
    	      id: negation.id || `negation:${index + 1}`,
    	      text: negation.text || '',
    	      start: negation.start,
    	      end: negation.end,
    	      tokenStart: negation.tokenStart,
    	      tokenEnd: negation.tokenEnd,
    	      source: 'languageGraph.negations',
    	    }));
    	  }

    function sceneSpanIsNegated(languageGraph = {}, span = null) {
    	    if (!span || typeof span !== 'object') return false;
    	    const sourceText = String(languageGraph.sourceText || '').toLowerCase();
    	    if (Number.isFinite(span.start)) {
    	      const prefix = sourceText.slice(Math.max(0, span.start - 24), span.start);
    	      if (new RegExp(`${NEGATION_RE.source}\\s+$`).test(prefix)) return true;
    	    }
    	    const spanTokenStart = Number.isInteger(span.tokenStart) ? span.tokenStart : -1;
    	    const negations = languageGraph.negations || [];
    	    return negations.some((negation) => {
    	      const negToken = Number.isInteger(negation.tokenStart) ? negation.tokenStart : -1;
    	      if (spanTokenStart >= 0 && negToken >= 0) {
    	        return negToken < spanTokenStart && spanTokenStart - negToken <= 3;
    	      }
    	      if (Number.isFinite(negation.end) && Number.isFinite(span.start)) {
    	        return negation.end <= span.start && span.start - negation.end <= 16;
    	      }
    	      return false;
    	    });
    	  }

    function queryPlanFromSceneLanguageGraph(sceneLanguageGraph = {}) {
    	    const slots = [];
    	    const addSlot = (slot) => slots.push(phaseCarryObject(slot));
	    const actionById = new Map((sceneLanguageGraph.actions || []).map((entry) => [entry.id, entry]));
      for (const entry of sceneLanguageGraph.entities || []) {
        if (entry.negated === true) continue;
        addSlot(sceneQuerySlotForEntry(entry, entry.semanticClass === 'biological-agent' ? 'actor' : 'object'));
      }
      for (const entry of sceneLanguageGraph.concepts || []) {
        if (entry.negated === true) continue;
        addSlot(sceneQuerySlotForEntry(entry, 'concept'));
      }
      for (const entry of sceneLanguageGraph.parts || []) {
        if (entry.negated === true) continue;
        addSlot(sceneQuerySlotForEntry(entry, 'part'));
      }
    	    for (const entry of sceneLanguageGraph.actions || []) {
    	      if (entry.negated === true) continue;
    	      addSlot(sceneQuerySlotForEntry(entry, 'action'));
    	    }
    	    for (const entry of sceneLanguageGraph.environments || []) {
    	      if (entry.negated === true) continue;
    	      addSlot(sceneQuerySlotForEntry(entry, 'environment'));
    	    }
    	    for (const entry of sceneLanguageGraph.mediums || []) {
    	      if (entry.negated === true) continue;
    	      addSlot(sceneQuerySlotForEntry(entry, 'medium'));
    	    }
	    for (const relation of sceneLanguageGraph.relations || []) {
	      if (actionById.get(relation.to) && actionById.get(relation.to).negated === true) continue;
	      const hasTypedLocalEvidence = sceneRelationHasTypedLocalEvidence(relation);
	      addSlot({
    	        schema: 'simulatte.sceneQuerySlot.v1',
    	        slotId: `slot.relation.${relation.id.replace(/^relation:/, '').replace(/:/g, '_')}`,
    	        slotRole: 'relation',
    	        entryId: relation.id,
	        relationIds: [relation.id],
	        predicate: relation.predicate || '',
	        process: relation.process || '',
	        spatialRelation: relation.spatialRelation || '',
	        modelEvidenceRequired: !hasTypedLocalEvidence,
	        localEvidenceReason: hasTypedLocalEvidence ? 'phase2-typed-relation' : '',
	        participants: [relation.from, relation.to, relation.target].filter(Boolean),
    	        required: relation.required !== false,
    	        sourceSpanIds: relation.sourceSpanIds || [],
    	        queries: [{
    	          kind: 'embedding',
	          text: [relation.from, relation.predicate, relation.process, relation.spatialRelation,
	            relation.to, relation.target, relation.causalAffordance].filter(Boolean).join(' '),
    	        }],
    	        budgets: { primitive: 4, surfaceCard: 4, universe: 8, support: 2 },
    	        allowedCandidateTypes: ['relation', 'operator', 'primitive', 'surface-card', 'universe-row'],
	      });
	    }
    	    const visualTargets = uniqueList((sceneLanguageGraph.actions || [])
    	      .filter((entry) => entry.negated !== true)
    	      .flatMap((entry) => typeof visualSlotTargetsForAction === 'function' ? visualSlotTargetsForAction(entry) : []));
    	    for (const visual of visualTargets) {
    	      addSlot({
    	        schema: 'simulatte.sceneQuerySlot.v1',
    	        slotId: `slot.visual.${visual}`,
    	        slotRole: 'visual',
    	        entryId: `visual:${visual}`,
    	        required: true,
    	        sourceSpanIds: [],
    	        queries: [{ kind: 'lexical', text: visual.replace(/-/g, ' ') }],
    	        budgets: { primitive: 0, surfaceCard: 4, universe: 2, support: 0 },
    	        allowedCandidateTypes: ['visual-card', 'surface-card', 'render-operator'],
    	      });
    	    }
    	    return {
    	      schema: SCENE_QUERY_PLAN_SCHEMA,
    	      sourcePromptHash: sceneLanguageGraph.sourcePromptHash || '',
    	      slots: uniqueById(slots),
    	      summary: {
    	        slotCount: uniqueById(slots).length,
    	        requiredSlotCount: uniqueById(slots).filter((slot) => slot.required !== false).length,
    	      },
    	    };
	    }

    function sceneRelationHasTypedLocalEvidence(relation = {}) {
      const typedSemantics = relation.process || relation.spatialRelation || relation.predicate;
      const sourceEvidence = (relation.sourceSpanIds || []).length || (relation.evidenceIds || []).length;
      return Boolean(typedSemantics && sourceEvidence);
    }

	    function sceneQuerySlotForEntry(entry = {}, role = 'object') {
    	    const label = entry.label || entry.id || '';
    	    return {
    	      schema: 'simulatte.sceneQuerySlot.v1',
    	      slotId: `slot.${role}.${String(entry.id || label).replace(/^[a-z]+:/, '').replace(/[^a-z0-9]+/gi, '_')}`,
    	      slotRole: role,
    	      entryId: entry.id || '',
	      required: entry.required !== false,
	      inferred: entry.inferred === true,
	      sourceLabel: label,
	      semanticClass: entry.semanticClass || '',
	      visualArchetype: entry.visualArchetype || '',
	      shapeHints: entry.shapeHints || [],
    	      sourceSpanIds: entry.sourceSpanIds || [],
      queries: role === 'part' ? [
        { kind: 'embedding', text: `constructive part ${label} ${entry.semanticClass || ''} geometry attachment articulation material`.trim() },
        { kind: 'lexical', text: label },
      ] : [
        { kind: 'embedding', text: `${label} ${entry.semanticClass || ''}`.trim() },
        { kind: 'lexical', text: label },
      ],
    	      budgets: {
    	        primitive: role === 'actor' || role === 'object' ? 4 : 3,
    	        surfaceCard: role === 'actor' ? 6 : 4,
    	        universe: role === 'relation' ? 8 : 4,
    	        support: role === 'actor' || role === 'environment' ? 0 : 2,
    	      },
    	      allowedCandidateTypes: ['primitive', 'surface-card', 'universe-row'],
    	    };
    	  }

    function phase2CompositionLedger(sceneLanguageGraph = {}, queryPlan = {}, phase1Ledger = null) {
    	    const entries = uniqueById([
    	      ...(phase1Ledger && phase1Ledger.entries || []),
      ...(sceneLanguageGraph.entities || []),
      ...(sceneLanguageGraph.concepts || []),
      ...(sceneLanguageGraph.parts || []),
    	      ...(sceneLanguageGraph.actions || []),
    	      ...(sceneLanguageGraph.environments || []),
    	      ...(sceneLanguageGraph.mediums || []),
    	      ...(sceneLanguageGraph.attributes || []),
    	    ].map((entry) => ({
    	      ...entry,
    	      status: entry.status || 'preserved',
    	      evidenceIds: entry.evidenceIds || entry.sourceSpanIds || [],
    	      supportOnly: entry.supportOnly === true,
    	    })));
    	    const relations = uniqueById(sceneLanguageGraph.relations || []);
    	    const obligations = uniqueById((queryPlan.slots || []).map((slot) => ({
    	      id: slot.entryId || slot.slotId,
    	      kind: slot.slotRole === 'actor' ? 'entity' : slot.slotRole,
	      ownedByPhase: slot.slotRole === 'visual' || slot.slotRole === 'part' ? 6 :
            slot.slotRole === 'relation' || slot.slotRole === 'concept' ? 4 : 3,
    	      sourceRelationId: Array.isArray(slot.relationIds) ? slot.relationIds[0] || '' : '',
    	      required: slot.required !== false,
    	      mustPreserveIds: uniqueList([
    	        slot.entryId,
    	        ...(slot.relationIds || []),
    	      ].filter(Boolean)),
    	      status: slot.slotRole === 'visual' ? 'pending' : 'preserved',
    	      phase: 2,
    	      receiptId: 'phase2-language-graph',
    	    })));
    	    return normalizeCompositionLedger({
    	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
    	      sourcePromptHash: sceneLanguageGraph.sourcePromptHash || phase1Ledger && phase1Ledger.sourcePromptHash || '',
    	      sourcePhase: phase1Ledger && phase1Ledger.sourcePhase || 1,
    	      currentPhase: 2,
    	      entries,
    	      relations,
    	      obligations,
    	      phaseDeltas: [
    	        ...(phase1Ledger && phase1Ledger.phaseDeltas || []),
    	        ...entries.filter((entry) => entry.id !== 'prompt:source').map((entry) => ({
    	          phase: 2,
    	          entryId: entry.id,
    	          operation: 'preserved',
    	          receiptId: 'phase2-language-graph',
    	        })),
    	        ...relations.map((relation) => ({
    	          phase: 2,
    	          relationId: relation.id,
    	          operation: 'preserved',
    	          receiptId: 'phase2-language-graph',
    	        })),
    	      ],
    	      losses: [],
    	      unsupported: sceneLanguageGraph.unsupportedSpans || [],
    	    });
    	  }

    function normalizeCompositionLedger(ledger = {}, overrides = {}) {
    	    const next = {
    	      ...ledger,
    	      ...overrides,
    	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
    	      entries: uniqueById([...(overrides.entries || []), ...(ledger.entries || [])]),
    	      relations: uniqueById([...(overrides.relations || []), ...(ledger.relations || [])]),
    	      obligations: uniqueById([...(overrides.obligations || []), ...(ledger.obligations || [])]),
    	      phaseDeltas: [...(ledger.phaseDeltas || []), ...(overrides.phaseDeltas || [])],
    	      losses: [...(ledger.losses || []), ...(overrides.losses || [])],
    	      unsupported: [...(ledger.unsupported || []), ...(overrides.unsupported || [])],
    	    };
    	    const obligations = next.obligations || [];
    	    next.summary = {
    	      ...(ledger.summary || {}),
    	      ...(overrides.summary || {}),
    	      entryCount: (next.entries || []).length,
    	      relationCount: (next.relations || []).length,
    	      obligationCount: obligations.length,
    	      requiredCount: obligations.filter((row) => row.required).length,
    	      failedCount: obligations.filter((row) => LEDGER_FAILURE_STATUSES.has(row.status)).length,
    	    };
    	    return phaseCarryObject(next);
    	  }

    function advanceCompositionLedger(ledger = null, phase = 0, receiptId = '') {
    	    if (!ledger || typeof ledger !== 'object') return null;
    	    return normalizeCompositionLedger(ledger, {
    	      currentPhase: phase,
    	      phaseDeltas: [{
    	        phase,
    	        operation: 'carried',
    	        receiptId,
    	      }],
    	    });
    	  }

    function runPhase1RuntimeGate(sourceText = '', options = {}) {
    	    const runtimeContext = runtimeContextFromOptions(options);
    	    const promptText = String(sourceText || '').trim();
    	    if (phase1RequiresModelProof(promptText, options, runtimeContext)) {
    	      throw new Error('Phase 1 runtime gate requires promptRuntimeReceipt with providerReady=true for nonblank browser prompt');
    	    }
    	    const receipts = phase1RuntimeReceipts(runtimeContext, options);
    	    const compositionLedger = phase1CompositionLedger(promptText);
    	    return createPhaseEnvelope({
    	      phase: 1,
    	      inputSchema: PHASE_ZERO_INPUT_SCHEMA,
    	      runtimeReceiptId: runtimeContext.runtimeReceiptId,
    	      artifact: {
    	        runtimeContext,
    	        promptIngress: {
    	          schema: 'simulatte.promptIngress.v1',
    	          sourceText: promptText,
    	        },
    	        compositionLedger,
    	      },
    	      receipts,
    	    });
    	  }

    function phase1RequiresModelProof(promptText = '', options = {}, runtimeContext = {}) {
        if (!promptText) return false;
        if (options.allowPrototypeFallback === true) return false;
        if (!isBrowserRuntime()) return false;
        const receipt = runtimeContext.promptRuntimeReceipt || {};
        const rerankerReady = receipt.rerankerRequired === true ? receipt.rerankerReady === true : true;
        return runtimeContext.providerReady !== true || runtimeContext.noFallback !== true || rerankerReady !== true;
      }

    function isBrowserRuntime() {
        if (typeof window !== 'undefined') return true;
        return typeof WorkerGlobalScope !== 'undefined' &&
          typeof self !== 'undefined' &&
          self instanceof WorkerGlobalScope;
      }

    Object.assign(scope, {
      phaseOutputSchema,
      createPhaseEnvelope,
      assertPhaseEnvelope,
      forbiddenFieldPresent,
      dottedPathPresent,
      fieldNamePresent,
      validatePhaseEnvelope,
      validatePhase1RuntimeReady,
      validatePhase2LanguageGraph,
      validatePhase3RetrievalRerank,
      validatePhase4GroundedIntent,
      validatePhase5SimulationCompile,
      validatePhase6VisualCompile,
      validatePhase7RenderExecution,
      validatePhase8SceneProof,
      sceneProofApi,
      runPhase8SceneProof,
      phaseArtifactSet,
      mergePhaseArtifacts,
      runtimeContextFromOptions,
      runtimeContextFromPhase,
      retrievalEvidenceFromOptions,
      sanitizePhase3RetrievalEvidence,
      withPhase1RetrievalEvidence,
      clonePhaseValue,
      arrayClone,
      stableTextHash,
      phase1CompositionLedger,
      sceneLanguageGraphFromLanguageGraph,
      sceneEntryForSpan,
      sceneTargetForSpan,
      sceneSpanHasKnownRole,
      sceneRelationsFromLanguageGraph,
      sceneSpanById,
      sceneNegationsFromLanguageGraph,
      sceneSpanIsNegated,
      queryPlanFromSceneLanguageGraph,
      sceneQuerySlotForEntry,
      phase2CompositionLedger,
      normalizeCompositionLedger,
      advanceCompositionLedger,
      runPhase1RuntimeGate,
      phase1RequiresModelProof,
      isBrowserRuntime,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
