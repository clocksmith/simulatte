(function attachSimulatteUniverseGrounderCandidates(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteUniverseGrounderCandidates = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGrounderCandidatesApi() {
  function candidateRowsForInput(input = {}, operatorHintsForDomains = () => []) {
    const rows = [];
    for (const component of input.components || []) {
      const hints = operatorHintsForDomains(component.domains || []);
      rows.push({
        label: component.role || component.phrase || component.id,
        canonicalId: `primitive.${component.id}`,
        semanticType: component.type || 'body', domains: component.domains || [],
        materialId: component.material || '', materialIds: component.material ? [component.material] : [],
        operatorHints: hints, operatorTypes: hints,
        primitiveHints: component.id ? [component.id] : [], conceptIds: [`primitive.${component.id}`],
        shapeHints: [], sceneHints: [], indexName: 'components',
        confidence: clamp01(Number(component.score || 0.46)), evidence: ['intent-component'],
      });
    }
    for (const row of input.semanticRag && input.semanticRag.openComponents || []) {
      const hints = operatorHintsForDomains(row.domains || []);
      rows.push({
        label: row.phrase || row.role || row.id,
        canonicalId: `semantic.${row.id}`,
        semanticType: row.type || 'component', domains: row.domains || [],
        materialId: row.material || '', materialIds: row.material ? [row.material] : [],
        operatorHints: hints, operatorTypes: hints,
        primitiveHints: row.id ? [row.id] : [], conceptIds: row.id ? [`semantic.${row.id}`] : [],
        shapeHints: [], sceneHints: [], indexName: 'semantic-rag',
        confidence: clamp01(Number(row.score || 0.38)), evidence: ['semantic-rag'],
      });
    }
    for (const row of input.universeMatches && input.universeMatches.candidates || []) {
      if (!row || !row.label) continue;
      rows.push({
        label: row.label, aliases: row.aliases || [],
        canonicalId: row.canonicalId || `universe.${row.id}`,
        semanticType: row.semanticType || 'concept', domains: row.domains || [],
        materialId: row.materialId || '', materialIds: row.materialIds || (row.materialId ? [row.materialId] : []),
        operatorHints: row.operatorHints || row.operatorTypes || [],
        operatorTypes: row.operatorTypes || row.operatorHints || [],
        primitiveHints: row.primitiveHints || [],
        conceptIds: row.conceptIds || (row.canonicalId ? [row.canonicalId] : []),
        shapeHints: row.shapeHints || [], construction: row.construction || null,
        constructionEvidence: row.constructionEvidence === true,
        modelEvaluated: row.modelEvaluated === true,
        modelScore: Number.isFinite(Number(row.modelScore)) ? Number(row.modelScore) : null,
        sceneHints: row.sceneHints || [], indexName: row.indexName || '', rankSignals: row.rankSignals || null,
        confidence: clamp01(Number(row.score || 0.42)), evidence: row.evidence || ['universe-index'],
      });
    }
    for (const row of input.intentBrief && input.intentBrief.retrievedEvidence || []) {
      if (!row || !row.label) continue;
      rows.push({
        id: row.id || row.label, label: row.label, aliases: row.aliases || [],
        canonicalId: row.canonicalId || row.id || `intent.${row.label}`,
        semanticType: row.semanticType || row.indexName || 'intentEvidence', domains: row.domains || [],
        materialId: row.materialId || '', materialIds: row.materialIds || (row.materialId ? [row.materialId] : []),
        operatorHints: row.operatorHints || row.operatorTypes || [],
        operatorTypes: row.operatorTypes || row.operatorHints || [],
        primitiveHints: row.primitiveHints || [], conceptIds: row.conceptIds || [], shapeHints: row.shapeHints || [],
        sourceLabel: row.sourceLabel || '', semanticClass: row.semanticClass || '',
        visualArchetype: row.visualArchetype || '', identityEvidence: row.identityEvidence === true,
        construction: row.construction || null, constructionEvidence: row.constructionEvidence === true,
        modelEvaluated: row.modelEvaluated === true, modelRerankEvaluated: row.modelRerankEvaluated === true,
        sceneHints: row.sceneHints || [], indexName: row.indexName || row.source || 'intent-brief',
        confidence: clamp01(Number(row.score || row.confidence || 0.42)), evidence: row.evidence || [row.id || row.label],
      });
    }
    return rows;
  }

  function clamp01(value) { return Math.max(0, Math.min(1, Number(value || 0))); }
  return Object.freeze({ candidateRowsForInput });
});
