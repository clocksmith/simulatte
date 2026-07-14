(function attachSimulattePhysicsModelactivationfusion(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function phase3SlotEvidenceStatus(slot = {}, acceptedCandidates = [], supportOnlyCandidates = []) {
    		    if (slot.slotRole === 'visual') return 'pending';
    		    if (acceptedCandidates.length > 0) {
    		      return slot.slotRole === 'medium' && slot.inferred === true ? 'expanded' : 'preserved';
    		    }
    		    if (supportOnlyCandidates.length > 0) return 'pending';
    	    return slot.required === false ? 'unsupported' : 'lost';
    	  }

    function phase3CandidateType(row = {}) {
    	    if (row.cardId || row.visualHints || row.shapeHints) return 'surface-card';
    	    if (row.canonicalId || row.conceptId) return 'universe-row';
    	    if (row.operatorType || row.operatorTypes) return 'operator';
    	    return 'primitive';
    	  }

    function phase3AcceptedCandidatesBySlot(slotEvidence = []) {
    	    return Object.fromEntries((slotEvidence || [])
    	      .filter((slot) => (slot.acceptedCandidates || []).length > 0)
    	      .map((slot) => [
    	        slot.slotId,
    	        (slot.acceptedCandidates || []).slice(),
    	      ]));
    	  }

    function phase3SupportOnlyCandidates(primitiveCuration = {}, slotEvidence = []) {
    	    return uniqueById([
    	      ...(primitiveCuration.supportPrimitives || []).map((row) => phase3EvidenceBucketRow(row)),
    	      ...(slotEvidence || []).flatMap((slot) => (slot.candidates || [])
    	        .filter((candidate) => candidate.supportOnly === true)
    	        .map((candidate) => ({
    	          id: candidate.candidateId,
    	          label: candidate.candidateText,
    	          slotId: slot.slotId,
    	          slotRole: slot.slotRole,
    	          supportOnly: true,
    	          reason: candidate.reason,
    	        }))),
    	    ]);
    	  }

    function phase3RejectedGenericCandidates(primitiveCuration = {}, typedEvidenceBuckets = {}) {
    	    const buckets = typedEvidenceBuckets.buckets || {};
    	    return uniqueById([
    	      ...(primitiveCuration.rejectedSupportPrimitives || []).filter(phase3SupportRowIsGeneric).map((row) => phase3EvidenceBucketRow(row)),
    	      ...(buckets.rejectedGenericEvidence || []),
    	    ]);
    	  }

    function phase3MissingRequiredSlots(queryPlan = {}, acceptedCandidatesBySlot = {}) {
    	    return (queryPlan.slots || []).filter((slot) => {
    	      if (slot.required === false) return false;
    	      if (slot.slotRole === 'visual') return false;
    	      return !(acceptedCandidatesBySlot[slot.slotId] || []).length;
    	    }).map((slot) => phaseCarryObject({
    	      schema: 'simulatte.phase3MissingRequiredSlot.v1',
    	      id: slot.slotId || slot.entryId || '',
    	      slotId: slot.slotId || '',
    	      slotRole: slot.slotRole || '',
    	      entryId: slot.entryId || '',
    	      required: true,
    	      status: 'lost',
    	      reason: 'required retrieval slot had no literal candidate evidence',
    	    }));
    	  }

    function phase3RerankReceipt(sourceReceipt = null, queryPlan = {}, slotEvidence = [], missingRequiredSlots = [], slotRetrieval = null) {
        const hasModelSlotRetrieval = slotRetrieval && Number(
          slotRetrieval.modelEvidenceSlotCount || slotRetrieval.embeddedSlotCount || 0
        ) > 0;
    		    return phaseCarryObject({
    		      schema: 'simulatte.phase3SlotAwareRerankReceipt.v1',
    		      sourceSchema: sourceReceipt && sourceReceipt.schema || '',
    		      sourceBackend: sourceReceipt && (sourceReceipt.backend || sourceReceipt.modelBackend) || '',
    		      sourceModelId: sourceReceipt && (sourceReceipt.modelId || sourceReceipt.rerankerModelId) || '',
    		      mode: hasModelSlotRetrieval ? 'model-slot-aware-rerank' : 'slot-aware-retrieval-gate',
    		      queryPlanSchema: queryPlan.schema || '',
    		      slotRetrievalSchema: slotRetrieval && slotRetrieval.schema || '',
    		      embeddedSlotCount: slotRetrieval && Number(slotRetrieval.embeddedSlotCount || 0) || 0,
              promptEmbeddingSlotCount: slotRetrieval && Number(slotRetrieval.promptEmbeddingSlotCount || 0) || 0,
              modelEvidenceSlotCount: slotRetrieval && Number(slotRetrieval.modelEvidenceSlotCount || 0) || 0,
              slotEmbeddingDurationMs: slotRetrieval && Number(slotRetrieval.slotEmbeddingDurationMs || 0) || 0,
    		      slotRerankCallCount: slotRetrieval && Number(slotRetrieval.rerankCallCount || 0) || 0,
    		      slotRetrievalCandidateCount: slotRetrieval && Number(slotRetrieval.candidateCount || 0) || 0,
    		      slotCount: slotEvidence.length,
    	      requiredSlotCount: queryPlan.summary && queryPlan.summary.requiredSlotCount || 0,
    	      satisfiedSlotCount: (slotEvidence || []).filter((row) => row.acceptedCount > 0).length,
    	      supportOnlySlotCount: (slotEvidence || []).filter((row) => row.acceptedCount === 0 && row.supportOnlyCount > 0).length,
    	      missingRequiredSlotCount: missingRequiredSlots.length,
    	      missingRequiredSlotIds: missingRequiredSlots.map((row) => row.slotId).filter(Boolean),
    	      source: sourceReceipt || null,
    	    });
    	  }

    function phase3CompositionLedger(
    	    typedEvidenceBuckets = {},
    	    languageGraph = {},
    	    sourceLedger = null,
    	    queryPlan = {},
    	    acceptedCandidatesBySlot = {},
    	    missingRequiredSlots = []
    	  ) {
    	    const buckets = typedEvidenceBuckets.buckets || {};
    	    const sourceObligations = sourceLedger && Array.isArray(sourceLedger.obligations) ? sourceLedger.obligations : [];
    	    const obligations = sourceObligations.map((row) => ({
    	      ...row,
    	      status: phase3ObligationStatus(row, acceptedCandidatesBySlot, missingRequiredSlots),
    	      phase: 3,
    	      receiptId: 'phase3-retrieval-rerank',
    	    }));
    	    const add = (row) => obligations.push(phaseCarryObject(row));
        const bucketRowsBySlotRole = {
          actor: buckets.literalPromptObjects || [],
          object: buckets.literalPromptObjects || [],
          part: buckets.literalPromptObjects || [],
          action: buckets.actionEvidence || [],
          environment: buckets.environmentEvidence || [],
          medium: buckets.materialMediumEvidence || [],
        };
        const slotKindByRole = {
          actor: 'entity',
          object: 'entity',
          part: 'part',
          action: 'action',
          environment: 'environment',
          medium: 'medium',
        };
        for (const slot of queryPlan.slots || []) {
          const kind = slotKindByRole[slot.slotRole || ''];
          if (!kind || !slot.entryId) continue;
          const target = String(slot.entryId).replace(/^[a-z]+:/, '');
          if (!target) continue;
          const evidenceRows = phase3FilterRowsForEntry(bucketRowsBySlotRole[slot.slotRole] || [], slot.entryId);
          const accepted = (acceptedCandidatesBySlot[slot.slotId] || []).length > 0;
          const row = {
            id: slot.entryId,
            kind,
            required: slot.required !== false,
            target,
            sourceEvidenceIds: evidenceRows.map((item) => item.id).filter(Boolean).slice(0, 6),
            status: accepted || evidenceRows.length ? 'preserved' : 'pending',
            phase: 3,
          };
          if (kind === 'medium') {
            row.inferred = slot.inferred === true ||
              !phase3PhraseInPrompt(target.replace(/-/g, ' '), languageGraph.sourceText || '');
            if (accepted || evidenceRows.length) row.status = 'expanded';
          }
          add(row);
        }
        const hasCarriedRelationObligations = sourceObligations.some((row) => row.kind === 'relation');
        if (!hasCarriedRelationObligations) {
          for (const predicate of languageGraph.predicates || []) {
            if (!predicate.process || predicate.negated === true) continue;
            const subject = phase3SpanTextById(languageGraph, predicate.subjectSpanId);
            if (!subject) continue;
            const subjectTarget = normalizeForEvidence(subject).replace(/\s+/g, '-');
            const objectText = phase3SpanTextById(languageGraph, predicate.objectSpanId) ||
              predicate.objectText ||
              predicate.implicitObject ||
              '';
            const objectTarget = normalizeForEvidence(objectText).replace(/\s+/g, '-');
            add({
              id: `relation:${subjectTarget}:${predicate.process}:${objectTarget || 'world'}`,
              kind: 'relation',
              required: true,
              subject: subjectTarget,
              action: predicate.process,
              object: objectTarget,
              spatialRelation: predicate.spatialRelation || '',
              causalAffordance: predicate.causalAffordance || '',
              status: 'preserved',
              phase: 3,
            });
          }
        }
        for (const slot of queryPlan.slots || []) {
          if (slot.slotRole !== 'visual' || !slot.entryId) continue;
          add({
            id: slot.entryId,
            kind: 'visual',
            required: slot.required !== false,
            target: String(slot.entryId).replace(/^visual:/, ''),
            status: 'pending',
            phase: 3,
          });
        }
    	    const losses = (missingRequiredSlots || []).map((slot) => ({
    	      id: `loss:${slot.slotId}`,
    	      phase: 3,
    	      entryId: slot.entryId || '',
    	      reason: slot.reason || 'required slot missing',
    	      sourceReceiptId: 'phase3-retrieval-rerank',
    	      nextRequiredAction: 'add slot evidence or mark unsupported',
    	    }));
    	    return normalizeCompositionLedger(sourceLedger || {}, {
    	      sourcePhase: sourceLedger && sourceLedger.sourcePhase || 2,
    	      currentPhase: 3,
    	      obligations: uniqueById(obligations),
    	      phaseDeltas: (queryPlan.slots || []).map((slot) => ({
    	        phase: 3,
    	        entryId: slot.entryId || '',
    	        operation: (acceptedCandidatesBySlot[slot.slotId] || []).length ? 'preserved' : 'lost',
    	        receiptId: 'phase3-retrieval-rerank',
    	      })),
    	      losses,
    	    });
    	  }

    function phase3ObligationStatus(row = {}, acceptedCandidatesBySlot = {}, missingRequiredSlots = []) {
    	    if (row.status === 'pending' || row.kind === 'visual') return row.status || 'pending';
    	    const missing = (missingRequiredSlots || []).some((slot) => slot.entryId === row.id);
    	    if (missing) return 'lost';
    	    const suffix = row.id ? row.id.replace(/^[a-z]+:/, '') : '';
    	    const slotId = Object.keys(acceptedCandidatesBySlot || {}).find((key) => key.endsWith(suffix));
    	    if (slotId && (acceptedCandidatesBySlot[slotId] || []).length) return 'preserved';
    	    return row.status || 'preserved';
    	  }

    function phase3SpanTextById(languageGraph = {}, id = '') {
        const span = (languageGraph.spans || []).find((row) => row.id === id);
        return span && span.text || '';
      }

    function phase3PrimitiveCandidateDecision(row = {}, prompt = '', spans = [], predicates = [], relations = []) {
        const source = String(row.source || '');
        const id = String(row.id || row.primitiveId || '');
        const label = String(row.label || row.role || row.phrase || id || '');
        const layer = String(row.layer || row.type || '').toLowerCase();
        const text = normalizeForEvidence([
          id,
          label,
          row.phrase,
          row.role,
          row.material,
          row.visualRegime,
          ...(row.domains || []),
        ].filter(Boolean).join(' '));
        if (source === 'semantic-surface-grounder') {
          if (phase3RowMatchesTypedIdentitySpan(row, spans)) {
            return { role: 'candidate', matchKind: 'literal-surface-card', reason: 'surface card matches prompt span' };
          }
          return { role: 'support', matchKind: 'surface-association-support', reason: 'surface card identity lacks prompt evidence' };
        }
        if (source === 'open-semantic-rag') {
          if (phase3RowMatchesTypedIdentitySpan(row, spans)) {
            return { role: 'candidate', matchKind: 'literal-open-component', reason: 'open semantic component matches prompt span' };
          }
          return { role: 'support', matchKind: 'open-association-support', reason: 'open component identity lacks prompt evidence' };
        }
        if (/^embedding-guided-synth-(?:node|environment)/.test(source)) {
          if (phase3GeneratedRowMatchesTypedIdentitySpan(row, spans)) {
            return { role: 'candidate', matchKind: 'literal-synth-node', reason: 'synthesized node is prompt object' };
          }
          return { role: 'support', matchKind: 'synth-association-support', reason: 'synthesized row identity lacks prompt evidence' };
        }
        if (source === 'embedding-guided-graph-synthesis') {
          return { role: 'support', matchKind: 'synth-primitive-support', reason: 'synthesized primitive is implementation support' };
        }
        if (source === 'prompt-explicit') {
          return { role: 'candidate', matchKind: 'explicit-primitive', reason: 'primitive id appears in prompt' };
        }
        if (source === 'doppler-residual') {
          return { role: 'candidate', matchKind: 'model-intent-evidence', reason: 'model intent receipt selected primitive' };
        }
        if (source === 'prompt-family' && id === 'water' && phase3LanguageImpliesWater(prompt, predicates, relations)) {
          return { role: 'candidate', matchKind: 'implied-fluid-medium', reason: 'swimming language implies visible water medium' };
        }
        if (source === 'prompt-family') {
          if (phase3RowDirectlyMatchesPrompt({ ...row, phrase: '' }, prompt, spans)) {
            return { role: 'candidate', matchKind: 'direct-prompt-family', reason: 'prompt family primitive identity appears in prompt' };
          }
          return { role: 'support', matchKind: 'prompt-family-support', reason: 'prompt family support primitive is not literal prompt object' };
        }
        if (phase3RowDirectlyMatchesPrompt(row, prompt, spans)) {
          return { role: 'candidate', matchKind: 'literal-lexical', reason: 'primitive identity appears in prompt language' };
        }
        if (/^(math|physics|material|constraint|loss|field|process|body)$/.test(layer)) {
          return { role: 'support', matchKind: 'recipe-support', reason: 'unprompted implementation primitive from recipe expansion' };
        }
        return { role: 'support', matchKind: 'nonliteral-support', reason: 'retrieved row lacks direct prompt evidence' };
      }

    function phase3RowMatchesTypedIdentitySpan(row = {}, spans = []) {
        const spanTexts = (spans || [])
          .filter((span) => /^(entity|environment|material|observable|term)$/.test(span.kind || ''))
          .map((span) => normalizeForEvidence(span.text))
          .filter(Boolean);
        const values = [row.phrase, row.label, row.sourceLabel]
          .map((value) => normalizeForEvidence(value))
          .filter((value) => value && !phase3GenericPromptMatchValue(value));
      return values.some((value) => spanTexts.some((spanText) => (
          phase3PhraseInPrompt(value, spanText) && phase3PhraseInPrompt(spanText, value)
        )));
      }

    function phase3GeneratedRowMatchesTypedIdentitySpan(row = {}, spans = []) {
        const identity = normalizeForEvidence(row.role || row.label || row.id)
          .replace(/\b(?:a|b|c|\d+)$/, '').trim();
        if (!identity || phase3GenericPromptMatchValue(identity)) return false;
        return (spans || [])
          .filter((span) => /^(entity|environment|material|term)$/.test(span.kind || ''))
          .map((span) => normalizeForEvidence(span.text))
          .some((spanText) => (
            phase3PhraseInPrompt(identity, spanText) && phase3PhraseInPrompt(spanText, identity)
          ));
      }

    function phase3RowDirectlyMatchesPrompt(row = {}, prompt = '', spans = []) {
        if (!prompt) return false;
        const promptText = normalizeForEvidence(prompt);
        const spanTexts = (spans || [])
          .filter((span) => /^(entity|material|environment|process|observable)$/.test(span.kind || ''))
          .map((span) => normalizeForEvidence(span.text))
          .filter(Boolean);
        const values = [
          row.id,
          row.primitiveId,
          row.label,
          !/^embedding-guided-synth-/.test(row.source || '') || normalizeForEvidence(row.phrase) !== promptText
            ? row.phrase
            : '',
          row.role,
        ].map((value) => normalizeForEvidence(value)).filter(Boolean);
        return values.some((value) => {
          if (!value || phase3GenericPromptMatchValue(value)) return false;
          const containingSpans = spanTexts.filter((spanText) => phase3PhraseInPrompt(value, spanText));
          if (containingSpans.length) {
            return containingSpans.some((spanText) => phase3PhraseInPrompt(spanText, value));
          }
          if (phase3PhraseInPrompt(value, promptText)) return true;
          return false;
        });
      }

    function phase3PhraseInPrompt(value = '', promptText = '') {
        const phrase = normalizeForEvidence(value);
        const prompt = normalizeForEvidence(promptText);
        if (!phrase || !prompt) return false;
        if (prompt.includes(phrase)) return true;
        const terms = phrase.split(/\s+/).filter((term) => term.length > 2);
        if (!terms.length || terms.length > 3) return false;
        return terms.every((term) => {
          const singular = term.endsWith('s') ? term.slice(0, -1) : term;
          return new RegExp(`\\b${singular}(?:s|es)?\\b`).test(prompt);
        });
      }

    function phase3GenericPromptMatchValue(value = '') {
        return PHASE3_GENERIC_PROMPT_MATCH_VALUES.has(normalizeForEvidence(value));
      }

    function phase3LanguageImpliesWater(prompt = '', predicates = [], relations = []) {
        if (/\b(water|lake|pool|pond|river|ocean|beach|underwater|swim|swims|swimming|swam)\b/.test(prompt)) return true;
        return (predicates || []).some((predicate) => (
          predicate.process === 'swimming' &&
          (predicate.objectRole === 'fluid-medium' || predicate.objectRole === 'containing-environment')
        )) || (relations || []).some((relation) => (
          relation.causalAffordance === 'agents-in-water' ||
          relation.targetText === 'water'
        ));
      }

    function phase3PrimitiveSort(a = {}, b = {}) {
        return Number(b.score || 0) - Number(a.score || 0) ||
          String(a.id || a.primitiveId || '').localeCompare(String(b.id || b.primitiveId || ''));
      }

    function retrievalGroundingEvidence(
    	    retrievalEvidence = {},
    	    primitiveCuration = {},
    	    typedEvidenceBuckets = null,
    	    compositionLedger = null,
    	    languageGraph = {},
    	    queryPlan = null,
    	    slotEvidence = [],
    	    acceptedCandidatesBySlot = {},
    	    missingRequiredSlots = []
      ) {
        const components = phase3GroundingComponents(retrievalEvidence.components, primitiveCuration, languageGraph);
        const acceptedComponentIds = new Set(components
          .filter((row) => row.supportOnly !== true)
          .map((row) => row.id || row.primitiveId || row.canonicalId)
          .filter(Boolean));
        const rejectedComponentIds = (retrievalEvidence.components || [])
          .map((row) => row && (row.id || row.primitiveId || row.canonicalId))
          .filter((id) => id && !acceptedComponentIds.has(id));
        return {
          schema: 'simulatte.retrievalGroundingEvidence.v1',
          intentBrief: null,
          acceptedGraph: null,
          rejectedGraph: null,
          contract: null,
          universeGraphCandidates: phaseCarryObject(retrievalEvidence.universeGraph || null),
          components: phaseCarryObject(components),
          rejectedComponentIds: phaseCarryObject(rejectedComponentIds),
          assumptions: [],
          unsupported: [],
          visualSource: phaseCarryObject(retrievalEvidence.visualSource || null),
          params: phaseCarryObject(retrievalEvidence.params || {}),
          languageEvidence: null,
    	      typedEvidenceBuckets: phaseCarryObject(typedEvidenceBuckets || null),
    	      slotRetrieval: phaseCarryObject(retrievalEvidence.slotRetrieval || null),
    	      compositionLedger: phaseCarryObject(compositionLedger || null),
    	      languageGraph: phaseCarryObject(languageGraph || null),
    	      queryPlan: phaseCarryObject(queryPlan || null),
    	      slotEvidence: phaseCarryObject(slotEvidence || []),
    	      acceptedCandidatesBySlot: phaseCarryObject(acceptedCandidatesBySlot || {}),
    	      missingRequiredSlots: phaseCarryObject(missingRequiredSlots || []),
    	    };
    	  }

    function phase3GroundingComponents(components = [], primitiveCuration = {}, languageGraph = {}) {
        const rows = Array.isArray(components) ? components : [];
        const candidateById = new Map((primitiveCuration.rankedPrimitives || [])
          .map((row) => [row.id || row.primitiveId, row]));
        const supportById = new Map((primitiveCuration.supportPrimitives || [])
          .map((row) => [row.id || row.primitiveId, row]));
        return rows.flatMap((component) => {
          const id = component && (component.id || component.primitiveId || component.canonicalId);
          const candidate = candidateById.get(id);
          const support = supportById.get(id);
          if (candidate) {
            return {
              ...component,
              retrievalRole: 'candidate',
              matchKind: candidate.matchKind || component.matchKind || '',
              supportOnly: false,
              supportReason: '',
            };
          }
          if (support) {
            if (/association-support$/.test(support.matchKind || '')) return [];
            return [{
              ...component,
              retrievalRole: 'support',
              matchKind: support.matchKind || component.matchKind || '',
              supportOnly: true,
              supportReason: support.supportReason || support.reason || 'support primitive not literal prompt object',
            }];
          }
          if (/^embedding-guided-synth-/.test(component && component.source || '')) {
            const decision = phase3SynthComponentDecision(component, languageGraph);
            if (decision.role !== 'candidate') return [];
            return [{
              ...component,
              retrievalRole: 'candidate',
              matchKind: decision.matchKind,
              supportOnly: false,
              supportReason: '',
            }];
          }
          return [component];
        });
      }

    function phase3SynthComponentDecision(component = {}, languageGraph = {}) {
        const prompt = String(languageGraph.sourceText || '');
        const identity = normalizeForEvidence(component.role || component.label || component.id);
        const identityCore = identity.replace(/\b(?:artifact|assembly|entity|environment|material|object)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const typedEntities = (languageGraph.spans || [])
          .filter((span) => span.kind === 'entity')
          .map((span) => normalizeForEvidence(span.text))
          .filter(Boolean);
        const conflictsWithTypedEntity = typedEntities.some((spanText) => (
          phase3PhraseInPrompt(identity, spanText) && !phase3PhraseInPrompt(spanText, identity)
        ));
        const match = component.synthesis && component.synthesis.match || {};
        const matchedSpan = String(match.span || '').trim();
        const directSurfaceReceipt = Boolean(
          matchedSpan &&
          normalizeForEvidence(matchedSpan) !== normalizeForEvidence(prompt) &&
          /surface-card/.test(match.source || '')
        );
        if (!conflictsWithTypedEntity && (
          phase3PhraseInPrompt(identity, prompt) ||
          phase3PhraseInPrompt(identityCore, prompt) ||
          directSurfaceReceipt
        )) {
          return { role: 'candidate', matchKind: 'literal-synth-node', reason: 'synthesized node identity appears in prompt' };
        }
        if (/^embedding-guided-synth-event/.test(component.source || '')) {
          const eventProcess = phase3BehaviorProcessForText(identity);
          const promptProcess = phase3BehaviorProcessForText(prompt);
          if (eventProcess && eventProcess === promptProcess) {
            return { role: 'candidate', matchKind: 'prompt-derived-synth-event', reason: 'synthesized event matches the prompt process vocabulary' };
          }
        }
        return { role: 'support', matchKind: 'synth-association-support', reason: 'synthesized row identity lacks prompt evidence' };
      }

    function phase3BehaviorProcessForText(text = '') {
        const value = normalizeForEvidence(text);
        const rows = languageLexicon && (
          languageLexicon.BEHAVIOR_PROCESS_LEXICON ||
          languageLexicon.LANGUAGE_LEXICON && languageLexicon.LANGUAGE_LEXICON.behaviorProcessLexicon
        ) || [];
        for (const row of rows) {
          if ((row.phrases || []).some((phrase) => phase3PhraseInPrompt(phrase, value))) return row.process || '';
        }
        return '';
      }

    function phaseCarryIntentBrief(intentBrief = null) {
        if (!intentBrief || typeof intentBrief !== 'object') return null;
        const { activationCloud, ...rest } = intentBrief;
        return phaseCarryObject({
          ...rest,
          activationRows: Array.isArray(activationCloud) ? activationCloud : [],
        });
      }

    function phaseCarryObject(value) {
        return stripForbiddenCarryFields(value, new Set(PHASE_CARRY_FORBIDDEN_FIELD_NAMES));
      }

    function stripForbiddenCarryFields(value, forbiddenNames) {
        if (Array.isArray(value)) return value.map((item) => stripForbiddenCarryFields(item, forbiddenNames));
        if (!value || typeof value !== 'object') return value;
        const out = {};
        for (const [key, child] of Object.entries(value)) {
          if (forbiddenNames.has(key)) continue;
          out[key] = stripForbiddenCarryFields(child, forbiddenNames);
        }
        return out;
      }

    function activationCloudFromPhase3Artifact(artifact = {}) {
        const retrievalRerankResult = artifact.retrievalRerankResult || {};
        const groundingEvidence = retrievalRerankResult.groundingEvidence || {};
        const intentBrief = groundingEvidence.intentBrief || {};
        const languageEvidence = languageEvidenceFromPhase3Artifact(artifact, intentBrief, groundingEvidence);
        const candidateEvidence = normalizedEvidenceRowsFromPhase3(retrievalRerankResult, intentBrief);
        const builtActivations = buildActivationCloud
          ? buildActivationCloud({ languageEvidence, evidenceRows: candidateEvidence })
          : [];
        const fallbackActivations = activationRowsFromIntentBrief(intentBrief);
        const weightedActivations = builtActivations.length ? builtActivations : fallbackActivations;
        const summary = summarizeActivationCloud
          ? summarizeActivationCloud(weightedActivations)
          : {
            schema: 'simulatte.activationCloudSummary.v1',
            activationCount: weightedActivations.length,
          };
        const intentBriefWithEvidence = {
          ...(intentBrief || {}),
          languageEvidence: intentBrief.languageEvidence || languageEvidence,
          retrievedEvidence: Array.isArray(intentBrief.retrievedEvidence) && intentBrief.retrievedEvidence.length
            ? intentBrief.retrievedEvidence
            : candidateEvidence,
    	      activationSummary: intentBrief.activationSummary || summary,
    	      typedEvidenceBuckets: intentBrief.typedEvidenceBuckets || retrievalRerankResult.typedEvidenceBuckets || null,
    	      compositionLedger: intentBrief.compositionLedger || retrievalRerankResult.compositionLedger || null,
    	      queryPlan: intentBrief.queryPlan || retrievalRerankResult.queryPlan || null,
    	      slotEvidence: intentBrief.slotEvidence || retrievalRerankResult.slotEvidence || [],
    	      acceptedCandidatesBySlot: intentBrief.acceptedCandidatesBySlot || retrievalRerankResult.acceptedCandidatesBySlot || {},
    	      missingRequiredSlots: intentBrief.missingRequiredSlots || retrievalRerankResult.missingRequiredSlots || [],
    	    };
    	    const negativeEvidence = negativeEvidenceRows(artifact.languageGraph || {}, artifact.sceneLanguageGraph || {});
    	    const allObligationVerdicts = obligationVerdictRows({
    	      compositionLedger: retrievalRerankResult.compositionLedger || null,
    	      acceptedCandidatesBySlot: retrievalRerankResult.acceptedCandidatesBySlot || {},
    	      slotEvidence: retrievalRerankResult.slotEvidence || [],
    	      negativeEvidence,
    	    });
    	    const obligationVerdicts = allObligationVerdicts.filter((row) => row.verdict !== 'negated');
    	    const evidenceConflicts = evidenceConflictRows(allObligationVerdicts, retrievalRerankResult.slotEvidence || []);
    	    const slotActivations = slotActivationsFromSlotEvidence(retrievalRerankResult.slotEvidence || []);
    	    const relationActivations = slotActivations.filter((row) => row.slotRole === 'relation');
    	    const supportActivations = supportActivationsFromRetrieval(retrievalRerankResult);
    	    return {
    	      schema: ACTIVATION_CLOUD_SCHEMA,
    	      languageEvidence: phaseCarryObject(languageEvidence),
    	      candidateEvidence: candidateEvidence.map((row) => phaseCarryObject(row)),
    	      weightedActivations,
    	      slotActivations,
    	      relationActivations,
    		      supportActivations,
    		      queryPlan: phaseCarryObject(retrievalRerankResult.queryPlan || groundingEvidence.queryPlan || null),
    		      slotEvidence: phaseCarryObject(retrievalRerankResult.slotEvidence || groundingEvidence.slotEvidence || []),
    		      acceptedCandidatesBySlot: phaseCarryObject(
    		        retrievalRerankResult.acceptedCandidatesBySlot ||
    		        groundingEvidence.acceptedCandidatesBySlot ||
    		        {}
    		      ),
    		      missingRequiredSlots: phaseCarryObject(
    		        retrievalRerankResult.missingRequiredSlots ||
    		        groundingEvidence.missingRequiredSlots ||
    		        []
    		      ),
    		      typedEvidenceBuckets: phaseCarryObject(retrievalRerankResult.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || null),
    		      compositionLedger: phaseCarryObject(retrievalRerankResult.compositionLedger || groundingEvidence.compositionLedger || null),
    	      coverageBySlot: slotCoverageBySlot(retrievalRerankResult.queryPlan || {}, retrievalRerankResult.acceptedCandidatesBySlot || {}),
    	      coverageByObligation: coverageByObligation(
    	        retrievalRerankResult.compositionLedger || null,
    	        retrievalRerankResult.acceptedCandidatesBySlot || {}
    	      ),
    	      obligationVerdicts,
    	      negativeEvidence,
    	      conflictsBySlot: conflictsBySlotRows(evidenceConflicts, retrievalRerankResult.slotEvidence || []),
    	      evidenceConflicts,
    	      rejectedBySlot: rejectedBySlot(retrievalRerankResult.slotEvidence || []),
    	      coverage: activationCoverage(intentBriefWithEvidence, summary, languageEvidence, candidateEvidence),
    	      conflicts: uniqueByJson([
    	        ...(intentBrief.coverageGaps || []),
    	        ...(intentBrief.causalQuestions || []),
          ]),
          rejectedMatches: intentBrief.alternatives || retrievalRerankResult.rejectedMatches || [],
          evidenceBySpan: evidenceBySpanRows(intentBriefWithEvidence, languageEvidence, candidateEvidence),
          summary,
          groundingEvidence: phaseCarryObject({
            ...groundingEvidence,
            intentBrief: intentBriefWithEvidence,
    	        languageEvidence,
    	        typedEvidenceBuckets: retrievalRerankResult.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || null,
    	        compositionLedger: retrievalRerankResult.compositionLedger || groundingEvidence.compositionLedger || null,
    		        queryPlan: retrievalRerankResult.queryPlan || groundingEvidence.queryPlan || null,
    		        slotEvidence: retrievalRerankResult.slotEvidence || groundingEvidence.slotEvidence || [],
    		        acceptedCandidatesBySlot: retrievalRerankResult.acceptedCandidatesBySlot || groundingEvidence.acceptedCandidatesBySlot || {},
    		        missingRequiredSlots: retrievalRerankResult.missingRequiredSlots || groundingEvidence.missingRequiredSlots || [],
    		      }),
    		    };
    		  }

    function slotActivationsFromSlotEvidence(slotEvidence = []) {
    	    return (slotEvidence || []).flatMap((slot) => (slot.candidates || [])
    	      .filter((candidate) => candidate.decision === 'accept')
    	      .map((candidate, index) => phaseCarryObject({
    	        id: `activation.${slot.slotId || 'slot'}.${index + 1}`,
    	        slotId: slot.slotId || '',
    	        slotRole: slot.slotRole || '',
    	        entryId: slot.entryId || '',
    	        relationIds: slot.relationIds || [],
    	        candidateId: candidate.candidateId || '',
    	        candidateKind: candidate.candidateType || '',
    	        candidateLabel: candidate.candidateText || '',
    	        score: Number(candidate.score || 0),
    	        source: 'phase3-slot-evidence',
    	        supportOnly: false,
    	      })));
    	  }

    function supportActivationsFromRetrieval(retrievalRerankResult = {}) {
    	    return (retrievalRerankResult.supportOnlyCandidates || []).map((row, index) => phaseCarryObject({
    	      id: `support.activation.${index + 1}`,
    	      slotId: row.slotId || 'support',
    	      slotRole: row.slotRole || 'support',
    	      candidateId: row.id || row.candidateId || '',
    	      candidateLabel: row.label || row.candidateText || '',
    	      source: 'phase3-support-only',
    	      supportOnly: true,
    	      reason: row.reason || row.supportReason || '',
    	    }));
    	  }

    function slotCoverageBySlot(queryPlan = {}, acceptedCandidatesBySlot = {}) {
    	    return Object.fromEntries((queryPlan.slots || []).map((slot) => {
    	      const accepted = acceptedCandidatesBySlot[slot.slotId] || [];
    	      return [slot.slotId, {
    	        slotRole: slot.slotRole || '',
    	        entryId: slot.entryId || '',
    	        required: slot.required !== false,
    	        status: accepted.length ? 'covered' : slot.required === false ? 'optional' : 'missing',
    	        candidateIds: accepted.map((candidate) => candidate.id || candidate.candidateId || '').filter(Boolean),
    	      }];
    	    }));
    	  }

    function coverageByObligation(compositionLedger = null, acceptedCandidatesBySlot = {}) {
    	    const obligations = compositionLedger && Array.isArray(compositionLedger.obligations)
    	      ? compositionLedger.obligations
    	      : [];
    	    const acceptedSlotIds = Object.keys(acceptedCandidatesBySlot || {});
    	    return Object.fromEntries(obligations.map((row) => {
    	      const obligationId = String(row.obligationId || row.id || '');
    	      const suffix = obligationId.replace(/^[a-z]+:/, '');
    	      const slotId = acceptedSlotIds.find((key) => suffix && key.endsWith(suffix));
    	      const evidenceCount = slotId ? (acceptedCandidatesBySlot[slotId] || []).length : 0;
    	      return [obligationId, phaseCarryObject({
    	        kind: row.kind || '',
    	        required: row.required === true,
    	        status: row.status || '',
    	        covered: evidenceCount > 0,
    	        evidenceCount,
    	        slotId: slotId || '',
    	      })];
    	    }));
    	  }

    function activationRowsFromIntentBrief(intentBrief = {}) {
        const grounded = intentBrief.groundedInterpretation || {};
        if (Array.isArray(intentBrief.activationRows)) return intentBrief.activationRows;
        if (Array.isArray(intentBrief.activationCloud)) return intentBrief.activationCloud;
        return (grounded.acceptedActivations || []).map((row) => ({
          id: row.id || row.candidateId || row.candidateLabel || '',
          spanId: row.spanId || '',
          spanKind: row.spanKind || '',
          spanText: row.spanText || '',
          candidateId: row.candidateId || '',
          candidateLabel: row.candidateLabel || row.label || '',
          candidateKind: row.candidateKind || row.kind || '',
          score: Number(row.score || row.confidence || 0),
          source: row.source || 'intent-brief-grounding',
        }));
      }

    function activationCoverage(intentBrief = {}, summary = {}, languageEvidence = {}, candidateEvidence = []) {
        const spans = languageEvidence.spans || intentBrief.languageEvidence && intentBrief.languageEvidence.spans || [];
        const confidence = Number(intentBrief.confidence || summary.confidence || 0);
        return {
          schema: 'simulatte.activationCoverage.v1',
          confidence: Number((confidence || Math.min(0.92, 0.28 + candidateEvidence.length * 0.015)).toFixed(3)),
          evidenceCount: candidateEvidence.length || (intentBrief.retrievedEvidence || []).length,
          spanCount: spans.length,
          activationCount: Number(summary.activationCount || 0),
        };
      }

    function evidenceBySpanRows(intentBrief = {}, languageEvidence = null, candidateEvidence = null) {
        const spans = languageEvidence && languageEvidence.spans || intentBrief.languageEvidence && intentBrief.languageEvidence.spans || [];
        const evidence = candidateEvidence || intentBrief.retrievedEvidence || [];
        return spans.map((span) => ({
          spanId: span.id || '',
          text: span.text || '',
          evidenceIds: evidence
            .filter((row) => evidenceSupportsSpan(row, span))
            .map((row) => row.id || row.candidateId || row.cardId || row.primitiveId || '')
            .filter(Boolean),
        }));
      }

    function evidenceSupportsSpan(row = {}, span = {}) {
        const spanId = String(span.id || '');
        const spanText = normalizeForEvidence(span.text);
        const rowSpan = String(row.spanId || row.span || '');
        if (spanId && rowSpan.includes(spanId)) return true;
        const rowText = normalizeForEvidence([
          row.label,
          row.id,
          row.candidateId,
          row.canonicalId,
          row.phrase,
          ...(row.aliases || []),
        ].filter(Boolean).join(' '));
        if (!spanText || !rowText) return false;
        return rowText.includes(spanText) || spanText.includes(rowText);
      }

    function languageEvidenceFromPhase3Artifact(artifact = {}, intentBrief = {}, groundingEvidence = {}) {
        if (artifact.languageGraph && artifact.languageGraph.schema) {
          return languageEvidenceFromLanguageGraph(artifact.languageGraph);
        }
        if (groundingEvidence.languageEvidence) return phaseCarryObject(groundingEvidence.languageEvidence);
        if (intentBrief.languageEvidence) return phaseCarryObject(intentBrief.languageEvidence);
        return languageEvidenceFromLanguageGraph({});
      }

    function languageEvidenceFromLanguageGraph(languageGraph = {}) {
        const spans = (languageGraph.spans || []).map((span, index) => ({
          id: span.id || `span.${index + 1}`,
          kind: span.kind || 'term',
          text: span.text || '',
          start: span.start,
          end: span.end,
          tokenStart: span.tokenStart,
          tokenEnd: span.tokenEnd,
          entityClass: span.entityClass || '',
          semanticRole: span.semanticRole || '',
          visualArchetype: span.visualArchetype || '',
          materialHint: span.materialHint || '',
          shapeHints: arrayClone(span.shapeHints || []),
        })).filter((span) => span.text);
        const spanById = new Map(spans.map((span) => [span.id, span]));
        const predicateFrames = (languageGraph.clauses || []).map((clause, index) => {
          const subject = spanById.get(clause.subjectSpanId) || {};
          const predicate = spanById.get(clause.verbSpanId) || {};
          const object = spanById.get(clause.objectSpanId) || {};
          const text = [subject.text, predicate.text || clause.process, object.text].filter(Boolean).join(' ');
          return {
            id: clause.id || `predicate.${index + 1}`,
            subject: subject.text || '',
            predicate: predicate.text || clause.process || '',
            object: object.text || '',
            result: '',
            text,
          };
        }).filter((frame) => frame.text);
        const rawText = String(languageGraph.sourceText || '');
        return {
          schema: 'simulatte.languageEvidence.v1',
          rawText,
          normalizedText: rawText.toLowerCase(),
          spans,
          predicateFrames,
          quantities: languageGraph.quantities || [],
          negations: languageGraph.negations || [],
          relations: languageGraph.relations || [],
          clauses: languageGraph.clauses || [],
          summary: {
            spanCount: spans.length,
            predicateFrameCount: predicateFrames.length,
            hasCausalLanguage: /\b(cause|drives|because|feedback|controls|forces|moves|flows|heats|cools|reacts|collides)\b/i.test(rawText),
          },
        };
      }

    function normalizedEvidenceRowsFromPhase3(retrievalRerankResult = {}, intentBrief = {}) {
        const rows = [];
        // Prompt-owned typed slots define identity. Reserve their place before
        // bulk retrieval rows so a large model result cannot evict them from
        // the bounded Phase 4 grounding input.
        addEvidenceRows(rows, (retrievalRerankResult.slotEvidence || []).flatMap((slot) => (
          (slot.acceptedCandidates || []).filter((row) => row.source === 'prompt-typed-slot')
        )), 'prompt-typed-slot');
        addEvidenceRows(rows, retrievalRerankResult.evidenceRows, 'retrieval-evidence');
        addEvidenceRows(rows, intentBrief.retrievedEvidence, 'intent-brief');
        addEvidenceRows(rows, retrievalRerankResult.rankedPrimitives, 'primitive-index');
        addEvidenceRows(rows, retrievalRerankResult.rankedCards, 'visual-card-index');
        addEvidenceRows(rows, candidateList(retrievalRerankResult.rankedUniverseRows), 'universe-index');
        addEvidenceRows(rows, retrievalRerankResult.semanticRag && retrievalRerankResult.semanticRag.openComponents, 'semantic-rag');
        addEvidenceRows(rows, retrievalRerankResult.spanRetrieval && retrievalRerankResult.spanRetrieval.matches, 'span-retrieval');
        return uniqueEvidenceRows(rows).slice(0, 320);
      }

    function addEvidenceRows(out, value, source) {
        candidateList(value).forEach((row, index) => {
          const normalized = normalizeCandidateEvidenceRow(row, source, index);
          if (normalized) out.push(normalized);
        });
      }

    function candidateList(value) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return [];
        if (Array.isArray(value.candidates)) return value.candidates;
        if (Array.isArray(value.matches)) return value.matches;
        if (Array.isArray(value.rows)) return value.rows;
        if (Array.isArray(value.openComponents)) return value.openComponents;
        return [];
      }

    function normalizeCandidateEvidenceRow(row = {}, source = 'candidate', index = 0) {
        if (!row || typeof row !== 'object') return null;
        const label = String(
          row.label ||
          row.name ||
          row.title ||
          row.phrase ||
          row.role ||
          row.primitiveId ||
          row.cardId ||
          row.canonicalId ||
          row.id ||
          ''
        ).trim();
        if (!label) return null;
        const id = String(
          row.id ||
          row.candidateId ||
          row.primitiveId ||
          row.cardId ||
          row.canonicalId ||
          `${source}.${slugify(label) || index + 1}`
        );
        const score = Number(row.score || row.confidence || row.similarity || row.finalScore || row.weight || 0.35);
        return phaseCarryObject({
          id,
          label,
          sourceLabel: row.sourceLabel || '',
          aliases: arrayClone(row.aliases),
          canonicalId: row.canonicalId || row.conceptId || row.primitiveId || row.cardId || id,
          semanticType: row.semanticType || row.type || row.kind || row.category || '',
          semanticClass: row.semanticClass || '',
          visualArchetype: row.visualArchetype || '',
          identityEvidence: row.identityEvidence === true,
          indexName: row.indexName || row.source || source,
          score: Number((Number.isFinite(score) ? score : 0.35).toFixed(4)),
          domains: arrayClone(row.domains || row.modules),
          materialId: row.materialId || row.material || '',
          materialIds: arrayClone(row.materialIds || (row.materialId || row.material ? [row.materialId || row.material] : [])),
          operatorHints: uniqueList([...(row.operatorHints || []), ...(row.operatorTypes || [])]).slice(0, 12),
          operatorTypes: uniqueList([...(row.operatorTypes || []), ...(row.operatorHints || [])]).slice(0, 12),
          primitiveHints: uniqueList([row.primitiveId, ...(row.primitiveHints || [])].filter(Boolean)).slice(0, 12),
          visualHints: uniqueList([...(row.visualHints || []), ...(row.shapeHints || []), ...(row.sceneHints || [])]).slice(0, 12),
          shapeHints: arrayClone(row.shapeHints),
          sceneHints: arrayClone(row.sceneHints),
          conceptIds: arrayClone(row.conceptIds || (row.canonicalId ? [row.canonicalId] : [])),
          evidence: arrayClone(row.evidence || [id]),
          source,
          retrievalRole: row.retrievalRole || '',
          supportOnly: row.supportOnly === true,
          matchKind: row.matchKind || '',
          supportReason: row.supportReason || '',
        });
      }

    function uniqueEvidenceRows(rows = []) {
        const seen = new Set();
        return rows.filter((row) => {
          const key = `${row.id}:${normalizeForEvidence(row.label)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

    function normalizeForEvidence(value = '') {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      }

    Object.assign(scope, {
      phase3SlotEvidenceStatus,
      phase3CandidateType,
      phase3AcceptedCandidatesBySlot,
      phase3SupportOnlyCandidates,
      phase3RejectedGenericCandidates,
      phase3MissingRequiredSlots,
      phase3RerankReceipt,
      phase3CompositionLedger,
      phase3ObligationStatus,
      phase3SpanTextById,
      phase3PrimitiveCandidateDecision,
      phase3RowMatchesTypedIdentitySpan,
      phase3GeneratedRowMatchesTypedIdentitySpan,
      phase3RowDirectlyMatchesPrompt,
      phase3PhraseInPrompt,
      phase3GenericPromptMatchValue,
      phase3LanguageImpliesWater,
      phase3PrimitiveSort,
      retrievalGroundingEvidence,
      phase3GroundingComponents,
      phaseCarryIntentBrief,
      phaseCarryObject,
      stripForbiddenCarryFields,
      activationCloudFromPhase3Artifact,
      slotActivationsFromSlotEvidence,
      supportActivationsFromRetrieval,
      slotCoverageBySlot,
      coverageByObligation,
      activationRowsFromIntentBrief,
      activationCoverage,
      evidenceBySpanRows,
      evidenceSupportsSpan,
      languageEvidenceFromPhase3Artifact,
      languageEvidenceFromLanguageGraph,
      normalizedEvidenceRowsFromPhase3,
      addEvidenceRows,
      candidateList,
      normalizeCandidateEvidenceRow,
      uniqueEvidenceRows,
      normalizeForEvidence,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
