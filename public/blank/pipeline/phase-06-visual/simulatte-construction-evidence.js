(function attachSimulatteConstructionEvidence(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');
  const substrateApi = typeof module === 'object' && module.exports
    ? require('../../../data/simulatte-construction-substrate.js')
    : root.SimulatteConstructionSubstrate || {};
  const constructionPartRoles = substrateApi.CONSTRUCTION_PART_ROLES || [];
  const constructionTopologies = substrateApi.CONSTRUCTION_TOPOLOGIES || [];
  const constructionLayoutVariants = substrateApi.CONSTRUCTION_LAYOUT_VARIANTS || [];
  const CONSTRUCTION_CANDIDATE_LIMIT = 5;
    function constructionGeometryCandidatesForEntity(identity = {}, geometry = {}, entity = {}) {
      const hypotheses = constructionEvidenceHypotheses(entity, geometry);
      const variants = constructionLayoutVariants.length ? constructionLayoutVariants : [
        { id: 'balanced', spread: 1, aspect: 1, radialStep: 0.72 },
      ];
      const candidates = [];
      for (let hypothesisIndex = 0; hypothesisIndex < hypotheses.length; hypothesisIndex += 1) {
        const hypothesis = hypotheses[hypothesisIndex];
        const variantCount = hypothesisIndex === 0 ? Math.min(3, variants.length) : 1;
        for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
          const program = scope.constructionGeometryProgramForEntity(identity, geometry, entity, {
            construction: hypothesis,
            layoutVariant: variants[variantIndex],
          });
          if (program) candidates.push(program);
          if (candidates.length >= CONSTRUCTION_CANDIDATE_LIMIT) return candidates;
        }
      }
      return candidates;
    }

    function constructionEvidenceHypotheses(entity = {}, geometry = {}) {
      const rows = [
        ...(entity.constructionHypotheses || []),
        entity.construction,
        geometry.construction,
      ].filter((row) => row && row.schema === 'simulatte.constructionProgramInput.v1');
      const seen = new Set();
      const uniqueRows = rows.filter((row) => {
        const key = JSON.stringify([
          row.hypothesisId || '', row.sourceCardIds || [], row.basisIds || [], row.partHints || [],
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => (
        constructionHypothesisPriority(b) - constructionHypothesisPriority(a) ||
        Number(a.hypothesisRank ?? Number.MAX_SAFE_INTEGER) - Number(b.hypothesisRank ?? Number.MAX_SAFE_INTEGER) ||
        String(a.hypothesisId || '').localeCompare(String(b.hypothesisId || ''))
      ));
      const exactRows = uniqueRows.filter((row) => row.provenance && row.provenance.exactTargetMatch === true);
      return (exactRows.length ? exactRows : uniqueRows).slice(0, 3);
    }

    function constructionHypothesisPriority(row = {}) {
      const provenance = row.provenance || {};
      return Number(provenance.exactTargetMatch === true) * 16 +
        Number(provenance.literalSlotMatch === true) * 8 +
        Number(provenance.rerankEvaluated === true) * 4 +
        Number(provenance.modelEvaluated === true) * 2;
    }

    function constructionGraphForEvidence(construction = {}, descriptors = [], layoutVariant = {}, identity = {}) {
      const topologySelection = constructionTopologySelectionForEvidence(construction, descriptors, identity);
      const topology = topologySelection.topology;
      const requested = new Map();
      for (const descriptor of descriptors) {
        const rows = requested.get(descriptor.role) || [];
        rows.push(descriptor);
        requested.set(descriptor.role, rows);
      }
      const nodes = [];
      const topologyOwnsParts = Boolean(topology && (constructionTopologyFromSource(construction) || topologySelection.targetFit));
      const appendNodes = (roleId, count, requiredByTopology = false, topologyNode = null) => {
        const available = requested.get(roleId) || [];
        const total = requiredByTopology && topologyOwnsParts ? count : Math.max(count, available.reduce((sum, row) => sum + Number(row.count || 1), 0));
        for (let index = 0; index < Math.min(12, total); index += 1) {
          const descriptor = constructionDescriptorForRole(available, roleId, index);
          const topologyPrimitive = Array.isArray(topologyNode && topologyNode.primitive)
            ? topologyNode.primitive[index % topologyNode.primitive.length]
            : topologyNode && topologyNode.primitive;
          const topologySize = topologyNode && topologyNode.sizes && topologyNode.sizes.length
            ? topologyNode.sizes[index % topologyNode.sizes.length]
            : null;
          const topologyPartId = topologyNode && topologyNode.partIds && topologyNode.partIds[index];
          nodes.push({
            id: topologyPartId || `${scope.constructionGeometrySafeId(descriptor.id || roleId)}-${index + 1}`,
            role: roleId,
            primitive: topologyPrimitive || descriptor.primitive || constructionPrimitiveForRole(roleId),
            size: topologySize ? topologySize.slice() : null,
            sourceHint: topologyPartId || descriptor.id || '',
            requiredByTopology,
          });
        }
      };
      if (topology) {
        for (const row of topology.nodes || []) appendNodes(row.roleId, Number(row.count || 1), true, row);
      }
      for (const [roleId, rows] of requested.entries()) {
        if (topology && topology.nodes.some((row) => row.roleId === roleId)) continue;
        if (topologyOwnsParts) continue;
        appendNodes(roleId, rows.reduce((sum, row) => sum + Number(row.count || 1), 0), false);
      }
      return {
        schema: 'simulatte.constructionGraph.v1',
        topologyId: topology && topology.id || 'evidence-assembly',
        topologySelectionMethod: topologySelection.method,
        topologyTargetCueScore: topologySelection.targetCueScore,
        topologyTargetFit: topologySelection.targetFit,
        layoutVariantId: layoutVariant.id || 'balanced',
        sourceCardIds: (construction.sourceCardIds || []).slice(),
        basisIds: (construction.basisIds || []).slice(),
        nodes: nodes.slice(0, 28),
        edges: topology ? (topology.edges || []).slice() : constructionInferredEdges(nodes),
      };
    }

    function constructionTopologyForEvidence(construction = {}, descriptors = []) {
      return constructionTopologySelectionForEvidence(construction, descriptors).topology;
    }

    function constructionTopologySelectionForEvidence(construction = {}, descriptors = [], identity = {}) {
      const basisIds = new Set([...(construction.basisIds || []), ...(construction.groundingIds || [])]);
      const roles = new Set(descriptors.map((row) => row.role));
      const targetText = constructionEvidenceText([
        String(construction.targetEntryId || '').replace(/^[a-z]+:/, ''),
        identity.type,
      ]);
      const sourceText = constructionEvidenceText([
        construction.targetEntryId,
        ...(construction.sourceCardIds || []),
        ...(construction.sourceLabels || []),
      ]);
      const evidenceText = constructionEvidenceText([
        sourceText,
        ...(construction.classHints || []),
        ...(construction.shapeHints || []),
        ...(construction.partHints || []),
        ...(construction.behaviorHints || []),
        ...(construction.affordanceHints || []),
      ]);
      const scored = constructionTopologies.map((row) => {
        const topologyRoles = new Set((row.nodes || []).map((nodeRow) => nodeRow.roleId));
        const roleScore = Array.from(topologyRoles).filter((roleId) => roles.has(roleId)).length /
          Math.max(1, topologyRoles.size);
        const basisScore = row.basisIds.some((id) => basisIds.has(id)) ? 1 : 0;
        const cueScore = Math.max(0, ...(row.cues || []).map((cue) => (
          constructionEvidenceCueScore(cue, sourceText, evidenceText)
        )));
        const targetCueScore = Math.max(0, ...(row.cues || []).map((cue) => (
          constructionEvidenceCueScore(cue, targetText, targetText)
        )));
        return {
          row,
          score: cueScore * 0.55 + roleScore * 0.27 + basisScore * 0.18,
          cueScore,
          targetCueScore,
          roleScore,
          basisScore,
        };
      });
      const exactTarget = scored.filter((entry) => entry.targetCueScore >= 1)
        .sort((a, b) => b.targetCueScore - a.targetCueScore ||
          constructionLongestMatchingCue(b.row, targetText) - constructionLongestMatchingCue(a.row, targetText) ||
          a.row.id.localeCompare(b.row.id))[0] || null;
      if (exactTarget) return constructionTopologySelection(exactTarget, 'exact-target-cue', construction, true);
      const sourceTopology = constructionTopologyFromSource(construction);
      if (sourceTopology) {
        const sourceEntry = scored.find((entry) => entry.row.id === sourceTopology.id) || { row: sourceTopology, targetCueScore: 0 };
        const reranked = construction.provenance && construction.provenance.rerankEvaluated === true;
        return constructionTopologySelection(sourceEntry, 'direct-topology-source', construction, reranked);
      }
      const selected = scored.filter((entry) => entry.score >= 0.28)
        .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))[0] || null;
      const reranked = construction.provenance && construction.provenance.rerankEvaluated === true;
      return constructionTopologySelection(selected, selected ? 'evidence-score' : 'none', construction, reranked);
    }

    function constructionTopologySelection(entry = null, method = 'none', construction = {}, inferredFit = false) {
      const targetCueScore = Number(entry && entry.targetCueScore || 0);
      return {
        topology: entry && entry.row || null,
        method,
        targetCueScore: Number(targetCueScore.toFixed(3)),
        targetFit: targetCueScore >= 1 || inferredFit === true,
        sourceCardIds: (construction.sourceCardIds || []).slice(),
      };
    }

    function constructionTopologyFromSource(construction = {}) {
      const ids = (construction.sourceCardIds || []).map((value) => String(value || '').toLowerCase()
        .replace(/^construction[._-]/, '').replace(/_/g, '-'));
      return constructionTopologies.find((row) => ids.includes(row.id)) || null;
    }

    function constructionLongestMatchingCue(topology = {}, targetText = '') {
      return Math.max(0, ...(topology.cues || []).map((cue) => {
        const normalized = constructionEvidenceText([cue]);
        return normalized && ` ${targetText} `.includes(` ${normalized} `) ? normalized.length : 0;
      }));
    }

    function constructionEvidenceText(values = []) {
      return values.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function constructionEvidenceCueScore(cue = '', sourceText = '', evidenceText = '') {
      const normalized = constructionEvidenceText([cue]);
      if (!normalized) return 0;
      if (` ${sourceText} `.includes(` ${normalized} `)) return 1.2;
      if (` ${evidenceText} `.includes(` ${normalized} `)) return 1;
      const tokens = normalized.split(' ');
      const evidenceTokens = new Set(evidenceText.split(' '));
      return tokens.filter((token) => evidenceTokens.has(token)).length / Math.max(2, tokens.length) * 0.72;
    }

    function constructionDescriptorForRole(rows = [], roleId = '', index = 0) {
      let offset = index;
      for (const row of rows) {
        const count = Math.max(1, Number(row.count || 1));
        if (offset < count) return row;
        offset -= count;
      }
      return { id: roleId, role: roleId, primitive: constructionPrimitiveForRole(roleId), count: 1 };
    }

    function constructionPrimitiveForRole(roleId = '') {
      return constructionPartRoles.find((row) => row.id === roleId)?.primitive || 'rounded-box';
    }

    function constructionInferredEdges(nodes = []) {
      const core = nodes.find((row) => row.role === 'core') || nodes[0];
      if (!core) return [];
      return nodes.filter((row) => row !== core).map((row) => `attach:${row.role}:${core.role}`);
    }


    root.SimulattePhaseModuleRegistry.define('compositionGraph', 'simulatte-construction-evidence.js', {
      constructionGeometryCandidatesForEntity,
      constructionEvidenceHypotheses,
      constructionHypothesisPriority,
      constructionGraphForEvidence,
      constructionTopologyForEvidence,
      constructionTopologySelectionForEvidence,
      constructionTopologySelection,
      constructionTopologyFromSource,
      constructionLongestMatchingCue,
      constructionEvidenceText,
      constructionEvidenceCueScore,
      constructionDescriptorForRole,
      constructionPrimitiveForRole,
      constructionInferredEdges,
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
