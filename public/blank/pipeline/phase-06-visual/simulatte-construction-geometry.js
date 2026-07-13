(function attachSimulatteConstructionGeometry(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  const substrateApi = typeof module === 'object' && module.exports
    ? require('../../../data/simulatte-construction-substrate.js')
    : root.SimulatteConstructionSubstrate || {};
  const constructionPartRoles = substrateApi.CONSTRUCTION_PART_ROLES || [];
  const constructionTopologies = substrateApi.CONSTRUCTION_TOPOLOGIES || [];
  const constructionLayoutVariants = substrateApi.CONSTRUCTION_LAYOUT_VARIANTS || [];
  with (scope) {
    const CONSTRUCTION_GEOMETRY_SCHEMA = 'simulatte.constructiveGeometryProgram.v1';
    const CONSTRUCTION_CANDIDATE_LIMIT = 5;
    const NUMBER_WORDS = Object.freeze({
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
      nine: 9, ten: 10, eleven: 11, twelve: 12, sixteen: 16,
    });

    function constructionGeometryProgramForEntity(identity = {}, geometry = {}, entity = {}, options = {}) {
      const construction = options.construction || entity.construction || geometry.construction || null;
      if (!construction || construction.schema !== 'simulatte.constructionProgramInput.v1') return null;
      const layoutVariant = options.layoutVariant || constructionLayoutVariants[0] || {
        id: 'balanced', spread: 1, aspect: 1, radialStep: 0.72,
      };
      const descriptors = constructionPartDescriptors(construction);
      const materialPalette = constructionMaterialPalette(construction.materialHints || []);
      const geometryPartHints = construction.sourcePartHints && construction.sourcePartHints.length
        ? construction.sourcePartHints
        : construction.partHints || [];
      const graph = constructionGraphForEvidence(construction, descriptors, layoutVariant);
      const graphParts = constructionGraphParts(graph, materialPalette, layoutVariant);
      const topologyParts = graphParts.length ? graphParts : constructionTopologyParts(construction, materialPalette);
      const parts = topologyParts.length ? topologyParts : constructionParts(descriptors, materialPalette);
      if (!parts.length) return null;
      const sourceIds = construction.sourceCardIds || [];
      const provenance = construction.provenance
        ? [construction.provenance]
        : entity.constructionProvenance || [];
      const identityType = String(identity.type || construction.targetEntryId || 'constructed-object')
        .replace(/^[a-z]+:/, '');
      return {
        schema: 'simulatte.objectGeometryProgram.v1',
        constructionSchema: CONSTRUCTION_GEOMETRY_SCHEMA,
        grammarId: `object-grammar.constructive.${constructionGeometrySafeId(
          graph.topologyId || sourceIds[0] || identityType
        )}.${constructionGeometrySafeId(layoutVariant.id)}`,
        identityType,
        visualArchetype: (construction.shapeHints || [])[0] || 'constructed-object',
        pose: '',
        literal: true,
        minScale: constructionMinimumScale(construction, parts.length),
        zOrder: 30,
        parts,
        source: 'phase3-model-construction-evidence',
        sourcePrimitive: geometry.primitive || entity.shape || '',
        selectionRole: 'model-construction',
        constructionGraph: graph,
        constructionReceipt: {
          schema: 'simulatte.constructiveGeometryReceipt.v1',
          sourceCardIds: sourceIds.slice(),
          basisIds: (construction.basisIds || []).slice(),
          inputPartHintCount: geometryPartHints.length,
          realizedPartCount: parts.length,
          modelEvaluated: provenance.some((row) => row.modelEvaluated === true),
          rerankEvaluated: provenance.some((row) => row.rerankEvaluated === true),
          literalSlotMatch: provenance.some((row) => row.literalSlotMatch === true),
          exactTargetMatch: provenance.some((row) => row.exactTargetMatch === true),
          targetIdentityBound: provenance.some((row) => row.targetIdentityBound === true),
          targetEntryId: construction.targetEntryId || '',
          candidateIds: provenance.map((row) => row.candidateId).filter(Boolean),
          hypothesisId: construction.hypothesisId || sourceIds[0] || '',
          topologyId: graph.topologyId,
          topologySelectionMethod: graph.topologySelectionMethod,
          topologyTargetCueScore: graph.topologyTargetCueScore,
          topologyTargetFit: graph.topologyTargetFit,
          layoutVariantId: layoutVariant.id,
          evidencePartCoverage: constructionEvidencePartCoverage(parts, geometryPartHints),
        },
      };
    }

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
          const program = constructionGeometryProgramForEntity(identity, geometry, entity, {
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

    function constructionGraphForEvidence(construction = {}, descriptors = [], layoutVariant = {}) {
      const topologySelection = constructionTopologySelectionForEvidence(construction, descriptors);
      const topology = topologySelection.topology;
      const requested = new Map();
      for (const descriptor of descriptors) {
        const rows = requested.get(descriptor.role) || [];
        rows.push(descriptor);
        requested.set(descriptor.role, rows);
      }
      const nodes = [];
      const topologySource = Boolean(constructionTopologyFromSource(construction));
      const appendNodes = (roleId, count, requiredByTopology = false, topologyNode = null) => {
        const available = requested.get(roleId) || [];
        const total = Math.max(count, available.reduce((sum, row) => sum + Number(row.count || 1), 0));
        for (let index = 0; index < Math.min(12, total); index += 1) {
          const descriptor = constructionDescriptorForRole(available, roleId, index);
          const topologyPrimitive = Array.isArray(topologyNode && topologyNode.primitive)
            ? topologyNode.primitive[index % topologyNode.primitive.length]
            : topologyNode && topologyNode.primitive;
          const topologySize = topologyNode && topologyNode.sizes && topologyNode.sizes.length
            ? topologyNode.sizes[index % topologyNode.sizes.length]
            : null;
          nodes.push({
            id: `${constructionGeometrySafeId(descriptor.id || roleId)}-${index + 1}`,
            role: roleId,
            primitive: topologyPrimitive || descriptor.primitive || constructionPrimitiveForRole(roleId),
            size: topologySize ? topologySize.slice() : null,
            sourceHint: descriptor.id || '',
            requiredByTopology,
          });
        }
      };
      if (topology) {
        for (const row of topology.nodes || []) appendNodes(row.roleId, Number(row.count || 1), true, row);
      }
      for (const [roleId, rows] of requested.entries()) {
        if (topology && topology.nodes.some((row) => row.roleId === roleId)) continue;
        if (topology && topologySource) continue;
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

    function constructionTopologySelectionForEvidence(construction = {}, descriptors = []) {
      const basisIds = new Set([...(construction.basisIds || []), ...(construction.groundingIds || [])]);
      const roles = new Set(descriptors.map((row) => row.role));
      const targetText = constructionEvidenceText([
        String(construction.targetEntryId || '').replace(/^[a-z]+:/, ''),
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

    function constructionGraphParts(graph = {}, palette = [], layoutVariant = {}) {
      const byRole = new Map();
      for (const nodeRow of graph.nodes || []) {
        const rows = byRole.get(nodeRow.role) || [];
        rows.push(nodeRow);
        byRole.set(nodeRow.role, rows);
      }
      const placements = new Map();
      for (const [roleId, rows] of byRole.entries()) {
        rows.forEach((nodeRow, index) => {
          const placement = constructionPlacementForRole(roleId, index, rows.length, graph.topologyId, layoutVariant);
          placements.set(nodeRow.id, {
            ...placement,
            size: nodeRow.size || placement.size,
            constraintIds: [],
          });
        });
      }
      const constraintReceipts = applyConstructionGraphConstraints(graph, byRole, placements);
      graph.constraints = constraintReceipts;
      const parts = [];
      const spread = Number(layoutVariant.spread || 1);
      const aspect = Number(layoutVariant.aspect || 1);
      const add = (nodeRow, placement, roleIndex) => {
        parts.push({
          ...constructionGeometryPart(
            nodeRow.id,
            nodeRow.primitive,
            [placement.center[0] * spread, placement.center[1] * aspect],
            placement.size,
            palette[parts.length % Math.max(1, palette.length)],
            placement.rotation || 0
          ),
          order: parts.length,
          constructionRole: nodeRow.role,
          constructionRoleIndex: roleIndex,
          sourceHint: nodeRow.sourceHint || '',
          constructionConstraintIds: (placement.constraintIds || []).slice(),
          opacity: nodeRow.role === 'field' ? 0.2 : nodeRow.role === 'opening' ? 0.76 : 1,
        });
      };
      const roleDepth = ['field', 'core', 'panel', 'support', 'appendage', 'joint', 'opening', 'path', 'detail', 'sensor'];
      for (const [roleId, rows] of [...byRole.entries()].sort((a, b) => roleDepth.indexOf(a[0]) - roleDepth.indexOf(b[0]))) {
        rows.forEach((nodeRow, index) => add(nodeRow, placements.get(nodeRow.id), index));
      }
      return normalizeConstructionParts(parts);
    }

    function normalizeConstructionParts(parts = []) {
      if (!parts.length) return parts;
      const bounds = parts.map((part) => {
        const rotation = Number(part.rotation || 0);
        const width = Number(part.size && part.size[0] || 0.1);
        const height = Number(part.size && part.size[1] || 0.1);
        const halfWidth = (Math.abs(Math.cos(rotation)) * width + Math.abs(Math.sin(rotation)) * height) * 0.5;
        const halfHeight = (Math.abs(Math.sin(rotation)) * width + Math.abs(Math.cos(rotation)) * height) * 0.5;
        return [part.center[0] - halfWidth, part.center[1] - halfHeight,
          part.center[0] + halfWidth, part.center[1] + halfHeight];
      });
      const left = Math.min(...bounds.map((row) => row[0]));
      const top = Math.min(...bounds.map((row) => row[1]));
      const right = Math.max(...bounds.map((row) => row[2]));
      const bottom = Math.max(...bounds.map((row) => row[3]));
      const width = Math.max(0.01, right - left);
      const height = Math.max(0.01, bottom - top);
      const factor = Math.min(1, 0.94 / width, 0.94 / height);
      const center = [(left + right) * 0.5, (top + bottom) * 0.5];
      return parts.map((part) => ({
        ...part,
        center: [(part.center[0] - center[0]) * factor, (part.center[1] - center[1]) * factor],
        size: [part.size[0] * factor, part.size[1] * factor],
      }));
    }

    function applyConstructionGraphConstraints(graph = {}, byRole = new Map(), placements = new Map()) {
      return (graph.edges || []).map((edge, index) => {
        const [operation, sourceRole = '', targetRole = '', anchor = ''] = String(edge || '').split(':');
        const sources = byRole.get(sourceRole) || [];
        const targets = byRole.get(targetRole) || [];
        const anchorTargets = byRole.get(anchor) || [];
        const id = `constraint-${index + 1}`;
        const applied = constructionConstraintOperation(
          operation, sources, targets, anchor, placements, graph.topologyId, id, anchorTargets
        );
        return {
          id,
          operation,
          sourceRole,
          targetRole,
          anchor,
          sourceNodeIds: sources.map((row) => row.id),
          targetNodeIds: targets.map((row) => row.id),
          applied,
        };
      });
    }

    function constructionConstraintOperation(
      operation = '', sources = [], targets = [], anchor = '', placements = new Map(), topologyId = '', constraintId = '',
      anchorTargets = []
    ) {
      if (!sources.length) return false;
      const target = constructionTargetPlacement(targets, placements, anchor);
      const set = (nodeRow, next) => constructionSetPlacement(placements, nodeRow, next, constraintId);
      if (operation === 'attach') {
        sources.forEach((nodeRow, index) => set(nodeRow, constructionAttachedPlacement(
          placements.get(nodeRow.id), target, anchor, index, sources.length, nodeRow.role
        )));
        return true;
      }
      if (operation === 'mirror') {
        sources.forEach((nodeRow, index) => set(nodeRow, constructionMirroredPlacement(
          placements.get(nodeRow.id), target, anchor, index, sources.length, nodeRow.role
        )));
        return true;
      }
      if (operation === 'radial' || operation === 'orbit' || operation === 'surround') {
        const radius = operation === 'surround' ? 0.12 : operation === 'orbit' ? 0.36 : 0.3;
        sources.forEach((nodeRow, index) => {
          const span = anchor === 'below' ? Math.PI * 0.72 : Math.PI * 2;
          const start = anchor === 'below' ? Math.PI * 0.14 : -Math.PI * 0.5;
          const angle = start + span * index / Math.max(1, sources.length - (anchor === 'below' ? 1 : 0));
          const current = placements.get(nodeRow.id) || {};
          set(nodeRow, {
            ...current,
            center: [target.center[0] + Math.cos(angle) * radius, target.center[1] + Math.sin(angle) * radius],
            rotation: operation === 'orbit' ? angle + Math.PI * 0.5 : angle,
            size: operation === 'surround'
              ? [Math.max(current.size[0], 0.72 - index * 0.06), Math.max(current.size[1], 0.48 - index * 0.04)]
              : current.size,
          });
        });
        return true;
      }
      if (operation === 'chain') {
        const targetRotation = Number(target.rotation || 0);
        let endpoint = targets.length
          ? [
              target.center[0] + Math.cos(targetRotation) * target.size[0] * 0.34,
              target.center[1] - Math.sin(targetRotation) * target.size[0] * 0.34 - target.size[1] * 0.32,
            ]
          : [-0.3, 0.26];
        sources.forEach((nodeRow, index) => {
          const current = placements.get(nodeRow.id) || {};
          const rotation = anchor === 'boom'
            ? (index === 0 ? 0.78 : -0.52 - (index - 1) * 0.28)
            : -0.82 + index * 0.48;
          const length = Math.max(0.18, Number(current.size && current.size[0] || 0.38) * 0.94);
          const center = [
            endpoint[0] + Math.cos(rotation) * length * 0.5,
            endpoint[1] - Math.sin(rotation) * length * 0.5,
          ];
          set(nodeRow, { ...current, center, rotation });
          endpoint = [
            center[0] + Math.cos(rotation) * length * 0.5,
            center[1] - Math.sin(rotation) * length * 0.5,
          ];
        });
        return true;
      }
      if (operation === 'pair') {
        sources.forEach((nodeRow, index) => {
          const paired = targets[index % Math.max(1, targets.length)];
          const pairedPlacement = paired && placements.get(paired.id) || target;
          const rotation = Number(pairedPlacement.rotation || 0);
          const endOffset = anchor === 'ends' ? Number(pairedPlacement.size && pairedPlacement.size[0] || 0) * 0.47 : 0;
          set(nodeRow, {
            ...(placements.get(nodeRow.id) || {}),
            center: [
              pairedPlacement.center[0] + Math.cos(rotation) * endOffset,
              pairedPlacement.center[1] - Math.sin(rotation) * endOffset,
            ],
          });
        });
        return true;
      }
      if (operation === 'parallel') {
        sources.forEach((nodeRow, index) => {
          const current = placements.get(nodeRow.id) || {};
          const vertical = anchor === 'vertical';
          const below = anchor === 'below';
          set(nodeRow, {
            ...current,
            center: vertical
              ? [target.center[0] - 0.075 + index * 0.05, target.center[1] - 0.04]
              : [target.center[0], target.center[1] + (below ? 0.25 : -0.18) + index * (below ? 0.08 : 0.12)],
            size: vertical
              ? [Math.max(current.size[0], target.size[1] * 1.35), Math.min(current.size[1], 0.025)]
              : [Math.max(current.size[0], 0.76), Math.min(current.size[1], below ? 0.11 : 0.07)],
            rotation: vertical ? 1.57 : 0,
          });
        });
        return true;
      }
      if (operation === 'span' && anchorTargets.length) {
        const targetPlacements = [...targets, ...anchorTargets].map((row) => placements.get(row.id)).filter(Boolean);
        const verticalExtent = (row) => {
          const rotation = Number(row.rotation || 0);
          return Math.abs(Math.sin(rotation)) * Number(row.size[0] || 0) * 0.5 +
            Math.abs(Math.cos(rotation)) * Number(row.size[1] || 0) * 0.5;
        };
        const top = Math.min(...targetPlacements.map((row) => row.center[1] - verticalExtent(row)));
        const bottom = Math.max(...targetPlacements.map((row) => row.center[1] + verticalExtent(row)));
        const centerX = targetPlacements.reduce((sum, row) => sum + row.center[0], 0) / targetPlacements.length;
        sources.forEach((nodeRow, index) => set(nodeRow, {
          ...(placements.get(nodeRow.id) || {}),
          center: [centerX + (index - (sources.length - 1) * 0.5) * 0.05, (top + bottom) * 0.5],
          size: [Math.max(0.2, bottom - top), 0.025],
          rotation: 1.57,
        }));
        return true;
      }
      if (operation === 'stack') {
        const spacing = anchor === 'spread' ? 0.24 : anchor === 'contour' ? 0.13 : 0.11;
        sources.forEach((nodeRow, index) => {
          const current = placements.get(nodeRow.id) || {};
          const centered = index - (sources.length - 1) * 0.5;
          set(nodeRow, { ...current, center: [target.center[0], target.center[1] + centered * spacing] });
        });
        return true;
      }
      if (operation === 'grid' || operation === 'network' || operation === 'scatter') {
        const columns = Math.max(2, Math.ceil(Math.sqrt(sources.length)));
        sources.forEach((nodeRow, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const jitter = operation === 'scatter' ? ((index * 0.61803398875) % 1 - 0.5) * 0.08 : 0;
          set(nodeRow, {
            ...(placements.get(nodeRow.id) || {}),
            center: [
              target.center[0] + (column - (columns - 1) * 0.5) * 0.2 + jitter,
              target.center[1] + (row - (Math.ceil(sources.length / columns) - 1) * 0.5) * 0.17 - jitter,
            ],
          });
        });
        return true;
      }
      if (operation === 'inside') {
        sources.forEach((nodeRow, index) => set(nodeRow, {
          ...(placements.get(nodeRow.id) || {}),
          center: [target.center[0] + (index - (sources.length - 1) * 0.5) * 0.08, target.center[1]],
          size: [Math.min(0.26, target.size[0] * 0.42), Math.min(0.3, target.size[1] * 0.52)],
        }));
        return true;
      }
      if (operation === 'mesh') {
        sources.forEach((nodeRow, index) => {
          const angle = index * Math.PI * 2 / Math.max(1, sources.length);
          set(nodeRow, {
            ...(placements.get(nodeRow.id) || {}),
            center: [target.center[0] + Math.cos(angle) * 0.22, target.center[1] + Math.sin(angle) * 0.18],
          });
        });
        return true;
      }
      if (operation === 'through') {
        sources.forEach((nodeRow, index) => set(nodeRow, {
          ...(placements.get(nodeRow.id) || {}),
          center: [target.center[0], target.center[1] + (index - (sources.length - 1) * 0.5) * 0.13],
          size: [Math.max(0.76, target.size[0]), 0.055],
          rotation: index % 2 ? 0.12 : -0.12,
        }));
        return true;
      }
      return false;
    }

    function constructionTargetPlacement(targets = [], placements = new Map(), anchor = '') {
      const rows = targets.map((row) => placements.get(row.id)).filter(Boolean);
      if (!rows.length) return { center: [0, 0], size: [0.68, 0.54] };
      if (anchor === 'end' || anchor === 'end-down') return rows[rows.length - 1];
      if (anchor === 'start') return rows[0];
      if (anchor === 'top') return rows.slice().sort((a, b) => a.center[1] - b.center[1])[0];
      if (anchor === 'below') return rows.slice().sort((a, b) => b.center[1] - a.center[1])[0];
      return {
        center: [
          rows.reduce((sum, row) => sum + row.center[0], 0) / rows.length,
          rows.reduce((sum, row) => sum + row.center[1], 0) / rows.length,
        ],
        size: [Math.max(...rows.map((row) => row.size[0])), Math.max(...rows.map((row) => row.size[1]))],
      };
    }

    function constructionSetPlacement(placements, nodeRow, next = {}, constraintId = '') {
      const current = placements.get(nodeRow.id) || { center: [0, 0], size: [0.2, 0.2], rotation: 0, constraintIds: [] };
      placements.set(nodeRow.id, {
        ...current,
        ...next,
        center: (next.center || current.center).slice(),
        size: (next.size || current.size).slice(),
        constraintIds: uniqueList([...(current.constraintIds || []), constraintId]),
      });
    }

    function constructionAttachedPlacement(current = {}, target = {}, anchor = '', index = 0, count = 1, role = '') {
      const centered = index - (count - 1) * 0.5;
      const targetRotation = Number(target.rotation || 0);
      const longitudinal = Math.max(0.2, Number(target.size && target.size[0] || 0.2) * 0.54) +
        Math.max(0, Number(current.size && current.size[0] || 0.2) * 0.2);
      const offsets = {
        start: [-Math.cos(targetRotation) * longitudinal, Math.sin(targetRotation) * longitudinal + centered * 0.13],
        end: [Math.cos(targetRotation) * longitudinal, -Math.sin(targetRotation) * longitudinal + centered * 0.13],
        'end-down': [Math.cos(targetRotation) * longitudinal, -Math.sin(targetRotation) * longitudinal + centered * 0.13],
        top: [centered * 0.24, -constructionVerticalAttachmentOffset(current, target)],
        'top-left': [-target.size[0] * 0.22 + centered * 0.18, -constructionVerticalAttachmentOffset(current, target)],
        below: [centered * 0.24, constructionVerticalAttachmentOffset(current, target)],
        front: [centered * 0.15, -0.08], side: [0.36, centered * 0.15], center: [0, 0],
      };
      const offset = offsets[anchor] || [centered * 0.18, 0];
      const vertical = anchor === 'top' && role === 'appendage';
      return {
        ...current,
        center: [target.center[0] + offset[0], target.center[1] + offset[1]],
        size: current.size,
        rotation: vertical ? 1.57 : anchor === 'center' ? 0 : anchor === 'end-down' ? targetRotation + 0.9 : current.rotation,
      };
    }

    function constructionVerticalAttachmentOffset(current = {}, target = {}) {
      const verticalExtent = (row) => {
        const size = row.size || [0.2, 0.2];
        const rotation = Number(row.rotation || 0);
        return Math.abs(Math.sin(rotation)) * Number(size[0] || 0) +
          Math.abs(Math.cos(rotation)) * Number(size[1] || 0);
      };
      return Math.max(0.12, verticalExtent(target) * 0.42 + verticalExtent(current) * 0.32);
    }

    function constructionMirroredPlacement(current = {}, target = {}, anchor = '', index = 0, count = 1, role = '') {
      const unit = count <= 1 ? 0 : (index - (count - 1) * 0.5) / Math.max(1, (count - 1) * 0.5);
      if (anchor === 'below') {
        return { ...current, center: [target.center[0] + unit * 0.36, target.center[1] + 0.31], rotation: 1.57 };
      }
      if (anchor === 'ends') {
        return { ...current, center: [target.center[0] + unit * 0.39, target.center[1] + 0.2] };
      }
      return {
        ...current,
        center: [target.center[0] + unit * 0.36, target.center[1]],
        rotation: role === 'support' ? 1.57 : unit * 0.14,
      };
    }

    function constructionPlacementForRole(roleId, index, count, topologyId, variant = {}) {
      const centered = index - (count - 1) / 2;
      const unit = count <= 1 ? 0 : centered / Math.max(1, (count - 1) / 2);
      const angle = index * 2.399963 + Number(variant.radialStep || 0.72);
      if (roleId === 'core') {
        return { center: [centered * 0.22, 0], size: [count > 1 ? 0.46 : 0.68, 0.54], rotation: 0 };
      }
      if (roleId === 'head') return { center: [0.34, -0.13 + centered * 0.15], size: [0.3, 0.3], rotation: 0 };
      if (roleId === 'support') {
        const x = count <= 2 ? unit * 0.27 : unit * 0.38;
        const y = /branching/.test(topologyId) ? 0.2 - index * 0.08 : 0.31;
        return { center: [x, y], size: [0.38, 0.1], rotation: 1.57 + unit * 0.08 };
      }
      if (roleId === 'appendage') {
        if (/articulated-machine/.test(topologyId)) {
          return { center: [-0.22 + index * 0.24, 0.22 - index * 0.2], size: [0.42, 0.09], rotation: -0.82 + index * 0.52 };
        }
        return { center: [Math.cos(angle) * 0.34, Math.sin(angle) * 0.27], size: [0.4, 0.085], rotation: angle };
      }
      if (roleId === 'joint') {
        if (/wheeled|conveyor/.test(topologyId)) {
          return { center: [unit * 0.36, 0.3 - Math.floor(index / 2) * 0.08], size: [0.2, 0.2], rotation: 0 };
        }
        return { center: [Math.cos(angle) * 0.29, Math.sin(angle) * 0.24], size: [0.18, 0.18], rotation: 0 };
      }
      if (roleId === 'panel') {
        return { center: [unit * 0.31, -0.1 + Math.floor(index / 2) * 0.2], size: [0.4, 0.27], rotation: unit * 0.22 };
      }
      if (roleId === 'sensor') {
        return { center: [0.23 + centered * 0.13, -0.22 + Math.abs(centered) * 0.025], size: [0.1, 0.1], rotation: 0 };
      }
      if (roleId === 'opening') return { center: [centered * 0.2, 0.14], size: [0.2, 0.25], rotation: 0 };
      if (roleId === 'path') return { center: [0, -0.24 + index * 0.17], size: [0.82, 0.055], rotation: index % 2 ? 0.08 : -0.08 };
      if (roleId === 'field') {
        return { center: [Math.cos(angle) * 0.16, Math.sin(angle) * 0.13], size: [0.72 - index * 0.08, 0.52 - index * 0.05], rotation: angle * 0.1 };
      }
      return { center: [Math.cos(angle) * 0.27, Math.sin(angle) * 0.22], size: [0.15, 0.14], rotation: angle * 0.16 };
    }

    function constructionEvidencePartCoverage(parts = [], hints = []) {
      if (!hints.length) return 1;
      const realized = new Set(parts.flatMap((part) => [
        constructionGeometrySafeId(part.id),
        constructionGeometrySafeId(part.constructionRole),
        constructionGeometrySafeId(part.sourceHint),
      ]).filter(Boolean));
      const matched = hints.filter((hint) => {
        const descriptor = constructionDescriptor(hint);
        const terms = [constructionGeometrySafeId(hint), descriptor && descriptor.role].filter(Boolean);
        return terms.some((term) => Array.from(realized).some((value) => value.includes(term) || term.includes(value)));
      }).length;
      return Number((matched / hints.length).toFixed(4));
    }

    function constructionPartDescriptors(construction = {}) {
      const sourceHints = construction.sourcePartHints && construction.sourcePartHints.length
        ? construction.sourcePartHints
        : construction.partHints || [];
      const hints = uniqueList(sourceHints).slice(0, 20);
      const descriptors = hints.map((hint) => constructionDescriptor(hint)).filter(Boolean);
      if (!descriptors.some((row) => row.role === 'core')) {
        descriptors.unshift({ id: 'structural-core', role: 'core', primitive: constructionCorePrimitive(construction), count: 1 });
      }
      if (descriptors.length === 1) {
        descriptors.push({ id: 'surface-detail', role: 'detail', primitive: 'ellipse', count: 2 });
      }
      return descriptors;
    }

    function constructionTopologyParts(construction = {}, palette = []) {
      const evidence = [
        ...(construction.classHints || []),
        ...(construction.shapeHints || []),
        ...(construction.basisIds || []),
        ...(construction.sourceCardIds || []),
        ...(construction.partHints || []),
      ].join(' ').toLowerCase();
      const color = (index) => palette[index % Math.max(1, palette.length)];
      const row = (id, primitive, center, size, colorIndex, rotation = 0) => (
        constructionGeometryPart(id, primitive, center, size, color(colorIndex), rotation)
      );
      if (/ocean[_ .-]wave|fluid[_ -]surface|wavefront|foam line/.test(evidence)) {
        return [
          row('water-body', 'wave', [0, 0.12], [0.98, 0.58], 0),
          row('crest', 'wave', [0, -0.16], [0.94, 0.2], 2),
          row('foam-line', 'capsule', [0.02, -0.28], [0.88, 0.05], 1, -0.04),
          row('trough', 'wave', [-0.04, 0.28], [0.86, 0.16], 3),
        ];
      }
      if (/sea[_ .-]ice|cryosphere[_ -]surface|plate[_ -]field|ice floe/.test(evidence)) {
        return [
          row('floe-left', 'rounded-box', [-0.28, 0.04], [0.46, 0.38], 1, -0.12),
          row('floe-center', 'rounded-box', [0.05, -0.08], [0.42, 0.35], 0, 0.08),
          row('floe-right', 'rounded-box', [0.34, 0.1], [0.38, 0.3], 2, -0.06),
          row('pressure-ridge', 'capsule', [0.02, -0.27], [0.7, 0.07], 1, 0.12),
          row('crack-seam', 'capsule', [-0.08, 0.15], [0.62, 0.035], 3, -0.48),
          row('brine-channel', 'capsule', [0.16, 0.22], [0.45, 0.04], 2, 0.32),
        ];
      }
      if (/environment[_ .-]fjord|glacial[_ -]basin|fjord|cliff walls/.test(evidence)) {
        return [
          row('water-basin', 'wave', [0, 0.2], [0.94, 0.46], 0),
          row('cliff-left', 'triangle', [-0.4, -0.02], [0.42, 0.82], 3, 0.08),
          row('cliff-right', 'triangle', [0.4, -0.02], [0.42, 0.82], 3, -0.08),
          row('shore-left', 'capsule', [-0.3, 0.29], [0.48, 0.06], 2, -0.28),
          row('shore-right', 'capsule', [0.3, 0.29], [0.48, 0.06], 2, 0.28),
          row('glacier-mouth', 'rounded-box', [0, -0.28], [0.36, 0.24], 1),
        ];
      }
      if (/environment[_ .-]glacier|cryosphere[_ -]mass|ice[_ -]mass|layered[_ -]wedge|crevasse/.test(evidence)) {
        return [
          row('ice-tongue', 'triangle', [-0.08, 0.08], [0.92, 0.76], 0, 1.57),
          row('upper-ice', 'rounded-box', [-0.2, -0.24], [0.56, 0.32], 1, -0.06),
          row('terminus', 'triangle', [0.36, 0.12], [0.34, 0.55], 2, 1.5),
          row('crevasse-left', 'capsule', [-0.25, -0.08], [0.34, 0.035], 3, 1.02),
          row('crevasse-right', 'capsule', [0.02, -0.02], [0.38, 0.035], 3, 0.92),
          row('meltwater', 'wave', [0.18, 0.34], [0.52, 0.12], 2),
          row('bedrock-contact', 'capsule', [-0.12, 0.38], [0.72, 0.08], 3, -0.04),
        ];
      }
      if (/articulated[_ -]machine|linked[_ -]rigid[_ -]bodies|articulated[_ -]gripper/.test(evidence)) {
        return [
          row('base', 'rounded-box', [-0.3, 0.32], [0.4, 0.22], 3),
          row('lower-link', 'capsule', [-0.16, 0.08], [0.5, 0.14], 0, -0.78),
          row('elbow-joint', 'ring', [0.02, -0.08], [0.2, 0.2], 2),
          row('upper-link', 'capsule', [0.22, -0.2], [0.5, 0.13], 1, 0.46),
          row('wrist-joint', 'ring', [0.4, -0.18], [0.15, 0.15], 2),
          row('gripper-left', 'capsule', [0.5, -0.28], [0.24, 0.07], 3, 0.82),
          row('gripper-right', 'capsule', [0.5, -0.1], [0.24, 0.07], 3, -0.82),
        ];
      }
      if (/transport[_ -]machine|belt[_ -]loop|conveyor/.test(evidence)) {
        return [
          row('belt', 'rounded-box', [0, 0.04], [0.96, 0.34], 3),
          row('lane', 'rounded-box', [0, -0.02], [0.82, 0.13], 1),
          row('roller-left', 'ring', [-0.38, 0.2], [0.18, 0.18], 0),
          row('roller-right', 'ring', [0.38, 0.2], [0.18, 0.18], 0),
        ];
      }
      if (/\b(parcel|package|carton|shipping box)\b/.test(evidence)) {
        return [
          row('carton', 'rounded-box', [0, 0.04], [0.82, 0.72], 0),
          row('top', 'rounded-box', [0, -0.32], [0.82, 0.12], 1),
          row('tape-vertical', 'rounded-box', [0, 0.01], [0.12, 0.76], 2),
          row('label', 'rounded-box', [0.22, 0.12], [0.25, 0.18], 3),
        ];
      }
      if (/human[_ -]body|upright[_ -]articulated/.test(evidence)) {
        return [
          row('head', 'ellipse', [0, -0.37], [0.24, 0.2], 2),
          row('torso', 'rounded-box', [0, -0.08], [0.34, 0.42], 0),
          row('left-arm', 'capsule', [-0.23, -0.04], [0.42, 0.1], 2, 1.82),
          row('right-arm', 'capsule', [0.23, -0.04], [0.42, 0.1], 2, 1.32),
          row('left-leg', 'capsule', [-0.11, 0.3], [0.46, 0.13], 1, 1.5),
          row('right-leg', 'capsule', [0.11, 0.3], [0.46, 0.13], 1, 1.64),
        ];
      }
      if (/mammal|rodent|articulated[_ -]body|small-mammal|large-mammal/.test(evidence)) {
        return [
          row('torso', 'ellipse', [-0.08, 0.02], [0.64, 0.46], 0),
          row('head', 'ellipse', [0.31, -0.09], [0.3, 0.36], 1),
          row('front-leg', 'capsule', [0.16, 0.3], [0.36, 0.1], 0, 1.36),
          row('rear-leg', 'capsule', [-0.27, 0.3], [0.37, 0.1], 0, 1.76),
          row('tail', 'capsule', [-0.43, -0.07], [0.37, 0.08], 1, -0.42),
          row('eye', 'ellipse', [0.38, -0.13], [0.05, 0.05], 3),
        ];
      }
      if (/plant|branching[_ -]structure|plant-body/.test(evidence)) {
        return [
          row('trunk', 'capsule', [0, 0.2], [0.58, 0.13], 3, 1.57),
          row('branch-left', 'capsule', [-0.16, -0.05], [0.36, 0.08], 3, -0.62),
          row('branch-right', 'capsule', [0.17, -0.08], [0.34, 0.08], 3, 0.58),
          row('canopy-left', 'ellipse', [-0.2, -0.25], [0.48, 0.42], 0),
          row('canopy-right', 'ellipse', [0.2, -0.24], [0.48, 0.42], 1),
          row('canopy-top', 'ellipse', [0, -0.39], [0.48, 0.4], 1),
        ];
      }
      if (/built[_ -]environment|building|architectural|operations[_ -]scene/.test(evidence)) {
        return [
          row('shell', 'rounded-box', [0, 0.08], [0.82, 0.82], 0),
          row('roof', 'triangle', [0, -0.42], [0.9, 0.28], 1),
          row('door', 'rounded-box', [0, 0.35], [0.2, 0.28], 3),
          row('window-left', 'rounded-box', [-0.25, -0.12], [0.18, 0.16], 2),
          row('window-right', 'rounded-box', [0.25, -0.12], [0.18, 0.16], 2),
        ];
      }
      if (/winged[_ -]body|aircraft/.test(evidence)) {
        return [
          row('body', 'capsule', [0, 0], [0.9, 0.18], 0),
          row('wing-left', 'triangle', [-0.02, 0.13], [0.58, 0.36], 1, 0.08),
          row('wing-right', 'triangle', [-0.02, -0.13], [0.58, 0.36], 2, 3.22),
          row('tail', 'triangle', [-0.38, -0.12], [0.28, 0.26], 3, -0.12),
        ];
      }
      if (/wheeled[_ -]vehicle|frame[_ -]with[_ -]wheels/.test(evidence)) {
        return [
          row('chassis', 'rounded-box', [0, 0.02], [0.76, 0.34], 0),
          row('wheel-left', 'ring', [-0.29, 0.25], [0.25, 0.25], 3),
          row('wheel-right', 'ring', [0.29, 0.25], [0.25, 0.25], 3),
          row('cabin', 'rounded-box', [0.08, -0.2], [0.46, 0.28], 2),
        ];
      }
      if (/flat[_ -]panel|electrical[_ -]network|display/.test(evidence)) {
        return [
          row('frame', 'rounded-box', [0, -0.08], [0.94, 0.7], 3),
          row('screen', 'rounded-box', [0, -0.08], [0.8, 0.56], 2),
          row('stem', 'rounded-box', [0, 0.31], [0.09, 0.22], 0),
          row('stand', 'rounded-box', [0, 0.43], [0.42, 0.1], 0),
        ];
      }
      if (/fluid[_ -](?:domain|channel)|natural[_ -]environment/.test(evidence)) {
        return [
          row('fluid-body', 'wave', [0, 0.08], [0.98, 0.72], 0),
          row('shore-boundary', 'capsule', [0, 0.35], [0.9, 0.08], 3),
          row('surface-highlight', 'wave', [0, -0.12], [0.92, 0.3], 2),
        ];
      }
      return [];
    }

    function constructionDescriptor(hint = '') {
      const text = String(hint || '').toLowerCase().trim();
      if (!text) return null;
      const count = constructionPartCount(text);
      const rule = constructionPartRoles.find((row) => [row.id, ...row.terms].some((term) => (
        new RegExp(`(?:^|[^a-z0-9])${constructionEscapeRegExp(term)}(?:[^a-z0-9]|$)`).test(text)
      ))) || constructionPartRoles.find((row) => row.id === 'detail');
      const roleId = rule && rule.id || 'detail';
      const primitive = /round|ellipsoid|sphere|soft|organic/.test(text) && roleId === 'core'
        ? 'ellipse'
        : /handle/.test(text)
          ? 'ring'
        : /aperture|cavity|lens|eye|camera/.test(text)
          ? 'ring'
          : rule && rule.primitive || 'rounded-box';
      const minimumCount = roleId === 'support' && /leg|foot|feet/.test(text) ? 2 : 1;
      return { id: text, role: roleId, primitive, count: Math.max(minimumCount, count) };
    }

    function constructionParts(descriptors = [], palette = []) {
      const parts = [];
      const counts = new Map();
      for (const descriptor of descriptors) {
        const limit = Math.min(8, descriptor.count || 1);
        for (let index = 0; index < limit && parts.length < 24; index += 1) {
          const roleIndex = counts.get(descriptor.role) || 0;
          counts.set(descriptor.role, roleIndex + 1);
          parts.push(constructionPart(descriptor, roleIndex, index, palette, parts.length));
        }
      }
      return parts.map((part, order) => ({ ...part, order }));
    }

    function constructionPart(descriptor, roleIndex, repeatIndex, palette, order) {
      const color = palette[order % palette.length];
      const id = `${constructionGeometrySafeId(descriptor.id)}-${repeatIndex + 1}`;
      if (descriptor.role === 'core') {
        return constructionGeometryPart(id, descriptor.primitive, [0, 0], [0.68, 0.58], color);
      }
      if (descriptor.role === 'support') {
        const direction = roleIndex % 2 ? 1 : -1;
        const rank = Math.floor(roleIndex / 2);
        return constructionGeometryPart(id, descriptor.primitive, [direction * (0.2 + rank * 0.1), 0.3], [0.11, 0.38], color, 1.57);
      }
      if (descriptor.role === 'appendage') {
        const angle = -1.1 + roleIndex * 0.78;
        return constructionGeometryPart(id, descriptor.primitive,
          [Math.cos(angle) * 0.34, Math.sin(angle) * 0.3], [0.42, 0.09], color, angle);
      }
      if (descriptor.role === 'joint') {
        const angle = roleIndex * 2.39996;
        return constructionGeometryPart(id, descriptor.primitive,
          [Math.cos(angle) * 0.29, Math.sin(angle) * 0.24], [0.18, 0.18], color);
      }
      if (descriptor.role === 'panel') {
        const direction = roleIndex % 2 ? 1 : -1;
        return constructionGeometryPart(id, descriptor.primitive,
          [direction * 0.3, -0.08 + Math.floor(roleIndex / 2) * 0.22], [0.38, 0.24], color, direction * 0.18);
      }
      if (descriptor.role === 'sensor') {
        const x = (roleIndex - 1) * 0.16;
        return constructionGeometryPart(id, descriptor.primitive, [x, -0.32], [0.16, 0.16], color);
      }
      if (descriptor.role === 'opening') {
        const x = (roleIndex % 3 - 1) * 0.2;
        const y = -0.06 + Math.floor(roleIndex / 3) * 0.2;
        return constructionGeometryPart(id, descriptor.primitive, [x, y], [0.18, 0.2], color);
      }
      const angle = roleIndex * 2.39996;
      return constructionGeometryPart(id, descriptor.primitive,
        [Math.cos(angle) * 0.22, Math.sin(angle) * 0.18], [0.12, 0.12], color);
    }

    function constructionGeometryPart(id, primitive, center, size, fill, rotation = 0) {
      return { id, primitive, center, size, rotation, fill, opacity: 1 };
    }

    function constructionCorePrimitive(construction = {}) {
      const text = (construction.shapeHints || []).join(' ').toLowerCase();
      return /round|sphere|orb|organic|soft|ellipsoid/.test(text) ? 'ellipse' : 'rounded-box';
    }

    function constructionPartCount(text = '') {
      const numeral = String(text).match(/\b(\d{1,2})\b/);
      if (numeral) return Math.max(1, Math.min(8, Number(numeral[1])));
      const word = Object.keys(NUMBER_WORDS).find((key) => new RegExp(`\\b${key}\\b`).test(text));
      if (word) return Math.min(8, NUMBER_WORDS[word]);
      return /(?:s|feet|leaves)\b/.test(text) ? 2 : 1;
    }

    function constructionMaterialPalette(materialHints = []) {
      const text = materialHints.join(' ').toLowerCase();
      if (/wood|bark|timber/.test(text)) return ['#765035', '#9a704b', '#c19a6b', '#4f3728'];
      if (/plant|leaf|biomass|tissue|organic|fur/.test(text)) return ['#4f8b62', '#79aa6d', '#b88760', '#315d48'];
      if (/glass|crystal|ice|water/.test(text)) return ['#75b8cb', '#a9d9df', '#5d8fb0', '#d5eef0'];
      if (/metal|steel|iron|aluminum|silicon/.test(text)) return ['#647685', '#9eabb4', '#3d4d59', '#c7d0d5'];
      if (/stone|rock|concrete|ceramic/.test(text)) return ['#756f68', '#a39a8e', '#554f4a', '#c0b6a8'];
      if (/fire|plasma|emissive/.test(text)) return ['#d85b36', '#f0a345', '#f4d36b', '#7e342b'];
      return ['#59788b', '#8ba5b2', '#d09a5d', '#405764'];
    }

    function constructionMinimumScale(construction = {}, partCount = 1) {
      const text = (construction.scaleHints || []).join(' ').toLowerCase();
      const base = /microscopic|tiny|small/.test(text) ? 0.12 : /large|architectural|landscape|orbital/.test(text) ? 0.28 : 0.2;
      return [Math.min(0.4, base + partCount * 0.004), Math.min(0.38, base * 0.82 + partCount * 0.003)];
    }

    function constructionGeometrySafeId(value = '') {
      return String(value || 'constructed-object').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'constructed-object';
    }

    function constructionEscapeRegExp(value = '') {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    Object.assign(scope, {
      CONSTRUCTION_GEOMETRY_SCHEMA,
      constructionGeometryProgramForEntity,
      constructionGeometryCandidatesForEntity,
      constructionPartDescriptors,
      constructionTopologyParts,
      constructionGraphForEvidence,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
