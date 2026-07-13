(function attachSimulattePhysicsModelactivationverdicts(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const OBLIGATION_VERDICTS = Object.freeze([
      'strongly-supported',
      'supported',
      'inferred',
      'pending',
      'missing',
      'negated',
    ]);

    function obligationVerdictRows({
      compositionLedger = null,
      acceptedCandidatesBySlot = {},
      slotEvidence = [],
      negativeEvidence = [],
    } = {}) {
      const obligations = compositionLedger && Array.isArray(compositionLedger.obligations)
        ? compositionLedger.obligations
        : [];
      return obligations.map((obligation) => {
        const obligationId = String(obligation.obligationId || obligation.id || '');
        const candidates = candidatesForObligation(obligation, acceptedCandidatesBySlot, slotEvidence);
        const provenance = candidates.map((candidate) => {
          const supportStrength = candidateSupportStrength(candidate);
          return {
            candidateId: candidate.candidateId || candidate.id || candidate.primitiveId || '',
            candidateType: candidate.candidateType || candidate.kind || candidate.type || '',
            supportStrength,
          };
        }).filter((row) => row.candidateId);
        const supportStrength = provenance.reduce((max, row) => Math.max(max, row.supportStrength), 0);
        const negated = obligationHasNegativeEvidence(obligation, negativeEvidence);
        const inferred = obligation.inferred === true || (
          obligation.kind === 'medium' && obligation.required !== true
        );
        let verdict = 'missing';
        if (negated) verdict = 'negated';
        else if (obligation.kind === 'visual') verdict = 'pending';
        else if (inferred) verdict = 'inferred';
        else if (supportStrength >= 0.62) verdict = 'strongly-supported';
        else if (supportStrength > 0) verdict = 'supported';
        else if (obligation.required === false || obligation.status === 'pending') verdict = 'pending';
        return phaseCarryObject({
          schema: 'simulatte.obligationVerdict.v1',
          obligationId,
          kind: obligation.kind || '',
          target: obligation.target || obligation.label || obligationId.replace(/^[a-z]+:/, ''),
          required: obligation.required === true,
          inferred,
          verdict,
          supportStrength: Number(supportStrength.toFixed(4)),
          provenance,
          negationConflict: negated && provenance.length > 0,
        });
      }).filter((row) => row.obligationId);
    }

    function candidatesForObligation(obligation = {}, acceptedCandidatesBySlot = {}, slotEvidence = []) {
      const obligationId = String(obligation.obligationId || obligation.id || '');
      const suffix = normalizeForEvidence(obligationId.replace(/^[a-z]+:/, ''));
      const slotRows = (slotEvidence || []).filter((slot) => {
        const entry = normalizeForEvidence(slot.entryId || '');
        const slotId = normalizeForEvidence(slot.slotId || '');
        return entry === normalizeForEvidence(obligationId) ||
          (suffix && (entry.endsWith(suffix) || slotId.endsWith(suffix)));
      });
      const direct = slotRows.flatMap((slot) => slot.acceptedCandidates || []);
      const fromMap = Object.entries(acceptedCandidatesBySlot || {})
        .filter(([slotId]) => suffix && normalizeForEvidence(slotId).endsWith(suffix))
        .flatMap(([, rows]) => rows || []);
      return uniqueByJson([...direct, ...fromMap]);
    }

    function candidateSupportStrength(candidate = {}) {
      const values = [
        candidate.modelRerankScore,
        candidate.score,
        candidate.finalScore,
        candidate.lexicalScore,
        candidate.confidence,
      ].map(Number).filter(Number.isFinite);
      return Number(Math.max(0, Math.min(1, values.length ? Math.max(...values) : 0)).toFixed(4));
    }

    function obligationHasNegativeEvidence(obligation = {}, negativeEvidence = []) {
      const obligationId = normalizeForEvidence(obligation.obligationId || obligation.id || '');
      const target = normalizeForEvidence(obligation.target || obligation.label || obligationId.replace(/^[a-z]+:/, ''));
      return (negativeEvidence || []).some((row) => {
        const entry = normalizeForEvidence(row.entryId || '');
        const label = normalizeForEvidence(row.label || row.text || '');
        return (obligationId && entry === obligationId) ||
          (target && (entry.endsWith(target) || label === target || label.endsWith(target)));
      });
    }

    function evidenceConflictRows(verdicts = [], slotEvidence = []) {
      const negationConflicts = (verdicts || [])
        .filter((row) => row.negationConflict === true)
        .map((row) => phaseCarryObject({
          schema: 'simulatte.evidenceConflict.v1',
          kind: 'negation-vs-evidence',
          obligationId: row.obligationId || '',
          candidateIds: (row.provenance || []).map((item) => item.candidateId).filter(Boolean),
        }));
      const ambiguityRows = (slotEvidence || []).map((slot) => {
        const candidates = (slot.acceptedCandidates || []).map((candidate) => ({
          candidateId: candidate.candidateId || candidate.id || '',
          supportStrength: candidateSupportStrength(candidate),
        })).filter((candidate) => candidate.candidateId)
          .sort((a, b) => b.supportStrength - a.supportStrength || a.candidateId.localeCompare(b.candidateId));
        if (candidates.length < 2) return null;
        const scoreMargin = Number(Math.abs(candidates[0].supportStrength - candidates[1].supportStrength).toFixed(4));
        if (scoreMargin > 0.05) return null;
        return phaseCarryObject({
          schema: 'simulatte.evidenceConflict.v1',
          kind: 'slot-ambiguity',
          slotId: slot.slotId || '',
          entryId: slot.entryId || '',
          candidateIds: candidates.slice(0, 2).map((candidate) => candidate.candidateId),
          scoreMargin,
        });
      }).filter(Boolean);
      return [...negationConflicts, ...ambiguityRows];
    }

    function conflictsBySlotRows(evidenceConflicts = [], slotEvidence = []) {
      const bySlot = {};
      for (const row of evidenceConflicts || []) {
        const slotId = row.slotId || slotIdForObligationId(row.obligationId, slotEvidence);
        if (!slotId) continue;
        if (!bySlot[slotId]) bySlot[slotId] = [];
        bySlot[slotId].push(row);
      }
      return bySlot;
    }

    function slotIdForObligationId(obligationId = '', slotEvidence = []) {
      const target = normalizeForEvidence(obligationId);
      if (!target) return '';
      const suffix = normalizeForEvidence(String(obligationId || '').replace(/^[a-z]+:/, ''));
      const slot = (slotEvidence || []).find((row) => {
        const entry = normalizeForEvidence(row.entryId || '');
        const slotId = normalizeForEvidence(row.slotId || '');
        return entry === target || (suffix && (entry.endsWith(suffix) || slotId.endsWith(suffix)));
      });
      return slot && slot.slotId || '';
    }

    function negativeEvidenceRows(languageGraph = {}, sceneLanguageGraph = {}) {
    	    const rows = [];
    	    for (const negation of languageGraph.negations || []) {
    	      rows.push(phaseCarryObject({
    	        id: negation.id || `negation:${rows.length + 1}`,
    	        kind: 'negation',
    	        text: negation.text || '',
    	        source: 'language-graph',
    	      }));
    	    }
	    const negatedEntries = [
	      ...(sceneLanguageGraph.entities || []),
	      ...(sceneLanguageGraph.concepts || []),
	      ...(sceneLanguageGraph.parts || []),
	      ...(sceneLanguageGraph.actions || []),
	      ...(sceneLanguageGraph.attributes || []),
	      ...(sceneLanguageGraph.environments || []),
    	      ...(sceneLanguageGraph.mediums || []),
    	    ].filter((entry) => entry.negated === true);
    	    for (const entry of negatedEntries) {
    	      rows.push(phaseCarryObject({
    	        id: `negated:${entry.id || rows.length + 1}`,
    	        kind: 'negated-entry',
    	        entryId: entry.id || '',
    	        label: entry.label || '',
    	        source: 'scene-language-graph',
    	      }));
    	    }
    	    return rows;
    	  }

    function rejectedBySlot(slotEvidence = []) {
    	    return Object.fromEntries((slotEvidence || []).map((slot) => [
    	      slot.slotId,
    	      (slot.rejectedCandidateIds || []).slice(),
    	    ]));
    	  }

    Object.assign(scope, {
      OBLIGATION_VERDICTS,
      obligationVerdictRows,
      candidatesForObligation,
      candidateSupportStrength,
      obligationHasNegativeEvidence,
      evidenceConflictRows,
      conflictsBySlotRows,
      slotIdForObligationId,
      negativeEvidenceRows,
      rejectedBySlot,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
