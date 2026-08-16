(function attachSimulatteWorldProofSemantic(root, factory) {
  const intentProof = typeof module === 'object' && module.exports
    ? require('./world-proof-intent.js')
    : root.SimulatteWorldProofIntent;
  if (!intentProof) throw new Error('SimulatteWorldProofSemantic requires intent proof contracts');
  const api = factory(intentProof);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProofSemantic = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSemanticProofApi(
  intentProofContract
) {
  const SEMANTIC_PROVENANCE_LEDGER_SCHEMA = 'simulatte.semanticProvenanceLedger.v1';
  const SEMANTIC_PROVENANCE_BINDING_SCHEMA = 'simulatte.semanticProvenanceBinding.v1';
  const SEMANTIC_PROOF_RECEIPT_SCHEMA = 'simulatte.semanticProofReceipt.v1';
  const PHASE2_OUTPUT_SCHEMA = 'simulatte.phase2.output.v1';
  const PHASE4_OUTPUT_SCHEMA = 'simulatte.phase4.output.v2';
  const HASH_PREFIX = 'fnv1a32:';
  const MAX_BINDINGS = 2048;
  const SEMANTIC_KINDS = Object.freeze(new Set([
    'entity', 'relation', 'property', 'quantity', 'negation',
  ]));
  const AUTHORITIES = Object.freeze(new Set([
    'prompt', 'compilerInference', 'userOverride', 'governedPack', 'plugin', 'runtimeState',
  ]));

  class SemanticProofError extends Error {
    constructor(message, path = '$.semanticProof') {
      super(`${message} at ${path}`);
      this.name = 'SemanticProofError';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
        value[key] === undefined ? [] : [[key, canonicalValue(value[key])]]
      )));
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

  function fnv1a32(value) {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(String(value || ''));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function hashValue(value) {
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(value)).toString(16).padStart(8, '0')}`;
  }

  function contentHash(value) {
    const copy = canonicalValue(value || {});
    delete copy.contentHash;
    return hashValue(copy);
  }

  function uniqueStrings(rows = []) {
    return [...new Set((rows || [])
      .filter((row) => row !== null && row !== undefined && String(row))
      .map(String))].sort();
  }

  function normalizedIdentity(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).map((token) => (
        token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)
          ? token.slice(0, -1) : token
      )).join(' ');
  }

  function rowIdentityValues(row = {}) {
    return uniqueStrings([
      row.id, row.canonicalId, row.spanId, row.label, row.sourceLabel,
      row.semanticClass, row.semanticType, row.nodeType,
    ].map(normalizedIdentity));
  }

  function matchingRequirements(requirements, options = {}) {
    const spanIds = new Set(options.sourceSpanIds || []);
    const identities = new Set((options.identities || []).map(normalizedIdentity).filter(Boolean));
    const predicates = new Set((options.predicates || []).map(normalizedIdentity).filter(Boolean));
    const kinds = new Set(options.kinds || []);
    return (requirements.requirements || []).filter((row) => {
      if (kinds.size && !kinds.has(row.kind)) return false;
      const sourceOverlap = (row.sourceSpanIds || []).some((spanId) => spanIds.has(spanId));
      if (options.requireSourceOverlap) return sourceOverlap;
      if (sourceOverlap) return true;
      if ([row.label, ...row.targetIds].map(normalizedIdentity).some((value) => identities.has(value))) {
        return true;
      }
      return [row.predicate, row.label].map(normalizedIdentity).some((value) => predicates.has(value));
    });
  }

  function nodeEvidenceIds(node = {}, provenance = {}) {
    return uniqueStrings([
      ...(node.evidence || []),
      ...(provenance.evidenceIds || []),
      node.spanId,
      node.indexName ? `index:${node.indexName}` : '',
      provenance.source ? `source:${provenance.source}` : '',
      ...(node.constructionProvenance || []).flatMap((row) => [
        row && row.candidateId,
        row && row.source ? `source:${row.source}` : '',
      ]),
    ]);
  }

  function semanticAuthority(row, sourceSpanIds, patchIds, evidenceIds, authorityHint = '') {
    if (patchIds.length) return 'userOverride';
    const declared = row && row.authorship && row.authorship.authority ||
      row && row.provenance && row.provenance.authority || '';
    if (declared && declared !== 'userOverride' && AUTHORITIES.has(declared)) return declared;
    if (authorityHint && AUTHORITIES.has(authorityHint)) return authorityHint;
    const source = [
      row && row.source,
      row && row.indexName,
      ...evidenceIds,
    ].join(' ').toLowerCase();
    if (/\bplugin\b/.test(source)) return 'plugin';
    if (/\bgoverned[- ]?pack\b/.test(source)) return 'governedPack';
    return sourceSpanIds.length ? 'prompt' : 'compilerInference';
  }

  function pathOverlap(patchPath, targetPath) {
    return patchPath === targetPath ||
      patchPath.startsWith(`${targetPath}/`) ||
      targetPath.startsWith(`${patchPath}/`);
  }

  function patchIdsForPath(patches, targetPath, kind) {
    return uniqueStrings((patches || []).filter((patch) => {
      const patchPath = String(patch && patch.targetPath || '');
      if (!patchPath) return false;
      if (kind !== 'entity') return pathOverlap(patchPath, targetPath);
      if (patchPath === targetPath || targetPath.startsWith(`${patchPath}/`)) return true;
      if (!patchPath.startsWith(`${targetPath}/`)) return false;
      return /\/(?:id|canonicalId|label|sourceLabel|semanticClass|semanticType|nodeType)$/.test(patchPath);
    }).map((patch) => patch.id));
  }

  function provenanceSatisfied(authority, sourceSpanIds, evidenceIds, patchIds) {
    if (authority === 'userOverride') return patchIds.length > 0;
    if (authority === 'runtimeState') return false;
    if (authority === 'prompt') return sourceSpanIds.length > 0 && evidenceIds.length > 0;
    return evidenceIds.length > 0;
  }

  function semanticBinding(input = {}) {
    const sourceSpanIds = uniqueStrings(input.sourceSpanIds);
    const evidenceIds = uniqueStrings(input.evidenceIds);
    const patchIds = patchIdsForPath(input.patches, input.targetPath, input.kind);
    const authority = semanticAuthority(
      input.row,
      sourceSpanIds,
      patchIds,
      evidenceIds,
      input.authorityHint
    );
    const proven = provenanceSatisfied(authority, sourceSpanIds, evidenceIds, patchIds);
    return canonicalValue({
      schema: SEMANTIC_PROVENANCE_BINDING_SCHEMA,
      id: String(input.id || ''),
      kind: String(input.kind || ''),
      targetId: String(input.targetId || ''),
      targetPath: String(input.targetPath || ''),
      label: String(input.label || input.targetId || ''),
      valueHash: hashValue(input.value),
      authority,
      sourceSpanIds,
      evidenceIds,
      patchIds,
      status: proven ? 'proven' : 'missing',
      reason: proven
        ? authority === 'userOverride'
          ? 'The current semantic value is bound to an append-only user patch'
          : 'The current semantic value retains source-bound grounding evidence'
        : authority === 'runtimeState'
          ? 'Runtime state cannot author the declared semantic graph'
          : 'The current semantic value has no sufficient source-bound provenance',
    });
  }

  function relationPredicates(row = {}) {
    return uniqueStrings([
      row.type, row.kind, row.relation, row.predicate, row.process,
      row.processId, row.spatialRelation,
    ].map(normalizedIdentity));
  }

  function relationSourceSpans(row, graph, requirements) {
    const nodeById = new Map((graph.nodes || []).map((node) => [String(node.id || ''), node]));
    const endpointNodes = [row.from || row.source, row.to || row.target]
      .map((id) => nodeById.get(String(id || ''))).filter(Boolean);
    const endpointSpans = endpointNodes.map((node) => node.spanId).filter(Boolean);
    const matches = matchingRequirements(requirements, {
      sourceSpanIds: [...(row.sourceSpanIds || []), ...endpointSpans],
      identities: endpointNodes.flatMap(rowIdentityValues),
      predicates: relationPredicates(row),
      kinds: ['relation', 'action'],
    });
    return {
      matches,
      sourceSpanIds: uniqueStrings([
        ...(row.sourceSpanIds || []),
        ...endpointSpans,
        ...matches.flatMap((requirement) => requirement.sourceSpanIds || []),
      ]),
    };
  }

  function graphProjection(bindings) {
    return bindings.map((row) => ({
      id: row.id,
      kind: row.kind,
      targetId: row.targetId,
      targetPath: row.targetPath,
      valueHash: row.valueHash,
    })).sort((a, b) => a.id.localeCompare(b.id));
  }

  function createSemanticProvenanceLedger(requirements, phase4Artifact = {}, options = {}) {
    intentProofContract.validateIntentRequirementLedger(requirements);
    const groundedIntent = phase4Artifact.groundedIntent || {};
    const graph = groundedIntent.acceptedGraph || {};
    const scene = phase4Artifact.groundedSceneContract || groundedIntent.groundedSceneContract || {};
    const provenanceByEntry = scene.provenanceByEntry || groundedIntent.provenanceByNode || {};
    const patches = options.patches || [];
    const bindings = [];
    for (const [nodeIndex, node] of (graph.nodes || []).entries()) {
      const nodeId = String(node.id || node.canonicalId || `node-${nodeIndex}`);
      const nodePath = `/universeGraph/nodes/${nodeIndex}`;
      const provenance = provenanceByEntry[nodeId] || {};
      const nodeRequirements = matchingRequirements(requirements, {
        sourceSpanIds: [node.spanId].filter(Boolean),
        identities: rowIdentityValues(node),
        kinds: ['entity', 'concept', 'part', 'environment', 'medium', 'material', 'observable', 'term'],
        requireSourceOverlap: Boolean(node.spanId),
      });
      const nodeSources = uniqueStrings([
        node.spanId,
        ...nodeRequirements.flatMap((row) => row.sourceSpanIds || []),
      ]);
      const evidenceIds = uniqueStrings([
        ...nodeEvidenceIds(node, provenance),
      ]);
      bindings.push(semanticBinding({
        id: `semantic:entity:${nodeId}`,
        kind: 'entity',
        targetId: nodeId,
        targetPath: nodePath,
        label: node.label || node.sourceLabel || nodeId,
        value: {
          id: node.id || '',
          canonicalId: node.canonicalId || '',
          label: node.label || '',
          sourceLabel: node.sourceLabel || '',
          semanticClass: node.semanticClass || '',
          semanticType: node.semanticType || node.nodeType || '',
        },
        row: node,
        authorityHint: node.spanId ? 'prompt' : 'compilerInference',
        sourceSpanIds: nodeSources,
        evidenceIds,
        patches,
      }));
      for (const [propertyIndex, property] of (node.properties || []).entries()) {
        const propertyRequirements = matchingRequirements(requirements, {
          sourceSpanIds: property.sourceSpanIds || [],
          identities: [node.label, node.sourceLabel, property.kind],
          predicates: [property.kind],
          kinds: ['attribute', 'material'],
          requireSourceOverlap: Boolean((property.sourceSpanIds || []).length),
        });
        bindings.push(semanticBinding({
          id: `semantic:property:${nodeId}:${property.kind || propertyIndex}:${propertyIndex}`,
          kind: 'property',
          targetId: `${nodeId}:property:${property.kind || propertyIndex}`,
          targetPath: `${nodePath}/properties/${propertyIndex}`,
          label: `${node.label || nodeId} ${property.kind || 'property'}`,
          value: { kind: property.kind || '', value: property.value },
          row: property,
          sourceSpanIds: uniqueStrings([
            ...(property.sourceSpanIds || []),
            ...propertyRequirements.flatMap((row) => row.sourceSpanIds || []),
          ]),
          evidenceIds: uniqueStrings([
            ...evidenceIds,
          ]),
          patches,
        }));
      }
      if (Number.isFinite(Number(node.cardinality))) {
        const quantityRequirements = matchingRequirements(requirements, {
          sourceSpanIds: [node.spanId].filter(Boolean),
          identities: rowIdentityValues(node),
          kinds: ['quantity'],
          requireSourceOverlap: Boolean(node.spanId),
        }).filter((row) => Number(row.value) === Number(node.cardinality));
        const quantityEvidence = (graph.promptVisualObligations || []).filter((row) => (
          row.constraintKind === 'count' && Number(row.expectedCount) === Number(node.cardinality) &&
          (!row.targetNodeId || row.targetNodeId === nodeId)
        )).map((row) => row.id);
        bindings.push(semanticBinding({
          id: `semantic:quantity:${nodeId}:cardinality`,
          kind: 'quantity',
          targetId: `${nodeId}:cardinality`,
          targetPath: `${nodePath}/cardinality`,
          label: `${node.label || nodeId} cardinality`,
          value: { cardinality: Number(node.cardinality) },
          row: node,
          sourceSpanIds: uniqueStrings(quantityRequirements.flatMap((row) => row.sourceSpanIds || [])),
          evidenceIds: uniqueStrings([
            ...evidenceIds,
            ...quantityEvidence,
          ]),
          patches,
        }));
      }
    }
    const graphEdgeIds = new Set();
    for (const [edgeIndex, edge] of (graph.edges || []).entries()) {
      const edgeId = String(edge.id || `edge-${edgeIndex}`);
      graphEdgeIds.add(edgeId);
      const provenance = relationSourceSpans(edge, graph, requirements);
      bindings.push(semanticBinding({
        id: `semantic:relation:${edgeId}`,
        kind: 'relation',
        targetId: edgeId,
        targetPath: `/universeGraph/edges/${edgeIndex}`,
        label: relationPredicates(edge)[0] || edgeId,
        value: {
          id: edge.id || '', type: edge.type || edge.kind || '',
          from: edge.from || edge.source || '', to: edge.to || edge.target || '',
          predicate: edge.predicate || '', processId: edge.processId || '',
          spatialRelation: edge.spatialRelation || '',
        },
        row: edge,
        sourceSpanIds: provenance.sourceSpanIds,
        evidenceIds: uniqueStrings([
          ...(edge.evidence || []), ...(edge.evidenceIds || []),
        ]),
        patches,
      }));
    }
    for (const [relationIndex, relation] of (scene.acceptedRelations || []).entries()) {
      const relationId = String(relation.id || `accepted-relation-${relationIndex}`);
      if (graphEdgeIds.has(relationId)) continue;
      const provenance = relationSourceSpans(relation, graph, requirements);
      bindings.push(semanticBinding({
        id: `semantic:relation:accepted:${relationId}`,
        kind: 'relation',
        targetId: relationId,
        targetPath: `/phase4/groundedSceneContract/acceptedRelations/${relationIndex}`,
        label: relationPredicates(relation)[0] || relationId,
        value: relation,
        row: relation,
        sourceSpanIds: provenance.sourceSpanIds,
        evidenceIds: uniqueStrings([
          ...(relation.evidence || []), ...(relation.evidenceIds || []),
        ]),
        patches: [],
      }));
    }
    const negativeEvidence = groundedIntent.negativeEvidence || [];
    const genericNegationEvidence = negativeEvidence
      .filter((row) => row.kind === 'negation').map((row) => row.id);
    for (const requirement of (requirements.requirements || []).filter((row) => row.polarity === 'forbidden')) {
      const identities = new Set([requirement.label, ...requirement.targetIds]
        .map(normalizedIdentity).filter(Boolean));
      const matchingNegative = negativeEvidence.filter((row) => {
        if (row.kind === 'negation') return false;
        return [row.entryId, row.label, row.text, row.id]
          .map(normalizedIdentity).some((value) => identities.has(value));
      });
      bindings.push(semanticBinding({
        id: `semantic:negation:${requirement.id}`,
        kind: 'negation',
        targetId: requirement.id,
        targetPath: `/phase4/groundedIntent/negativeEvidence/${requirement.id}`,
        label: requirement.label,
        value: {
          requirementId: requirement.id,
          polarity: requirement.polarity,
          targetIds: requirement.targetIds,
        },
        row: requirement,
        sourceSpanIds: requirement.sourceSpanIds,
        evidenceIds: uniqueStrings([
          ...genericNegationEvidence,
          ...matchingNegative.map((row) => row.id),
        ]),
        patches: [],
      }));
    }
    bindings.sort((a, b) => a.id.localeCompare(b.id));
    if (bindings.length > MAX_BINDINGS) {
      throw new SemanticProofError(`Semantic binding count exceeds ${MAX_BINDINGS}`);
    }
    const provenCount = bindings.filter((row) => row.status === 'proven').length;
    const missingCount = bindings.length - provenCount;
    const ledger = {
      schema: SEMANTIC_PROVENANCE_LEDGER_SCHEMA,
      contentHash: '',
      graphHash: hashValue(graphProjection(bindings)),
      requirementLedgerHash: String(requirements.contentHash || ''),
      status: missingCount ? 'fail' : bindings.length ? 'pass' : 'not-proven',
      bindingCount: bindings.length,
      provenCount,
      missingCount,
      bindings,
    };
    ledger.contentHash = contentHash(ledger);
    return validateSemanticProvenanceLedger(ledger, requirements);
  }

  function validateSemanticProvenanceLedger(ledger, requirements = null) {
    requireObject(ledger, '$.semanticProvenance');
    requireExactKeys(ledger, [
      'schema', 'contentHash', 'graphHash', 'requirementLedgerHash', 'status',
      'bindingCount', 'provenCount', 'missingCount', 'bindings',
    ], '$.semanticProvenance');
    if (ledger.schema !== SEMANTIC_PROVENANCE_LEDGER_SCHEMA ||
        !['pass', 'fail', 'not-proven'].includes(ledger.status)) {
      throw new SemanticProofError('Invalid semantic provenance ledger schema or status');
    }
    if (!Array.isArray(ledger.bindings) || ledger.bindings.length > MAX_BINDINGS) {
      throw new SemanticProofError('Semantic bindings must be bounded');
    }
    ledger.bindings.forEach(validateSemanticBinding);
    requireUniqueIds(ledger.bindings, '$.semanticProvenance.bindings');
    requireNonnegativeIntegers(ledger, ['bindingCount', 'provenCount', 'missingCount']);
    const provenCount = ledger.bindings.filter((row) => row.status === 'proven').length;
    const missingCount = ledger.bindings.length - provenCount;
    if (ledger.bindingCount !== ledger.bindings.length || ledger.provenCount !== provenCount ||
        ledger.missingCount !== missingCount) {
      throw new SemanticProofError('Semantic provenance summary does not close');
    }
    const expectedStatus = missingCount ? 'fail' : ledger.bindings.length ? 'pass' : 'not-proven';
    if (ledger.status !== expectedStatus) throw new SemanticProofError('Semantic ledger status does not match bindings');
    if (requirements && ledger.requirementLedgerHash !== requirements.contentHash) {
      throw new SemanticProofError('Semantic ledger does not bind the intent requirements');
    }
    validateNamedHash(ledger.requirementLedgerHash, '$.semanticProvenance.requirementLedgerHash');
    validateHash(ledger.graphHash, hashValue(graphProjection(ledger.bindings)), '$.semanticProvenance.graphHash');
    validateHash(ledger.contentHash, contentHash(ledger), '$.semanticProvenance.contentHash');
    return ledger;
  }

  function validateSemanticBinding(row, index) {
    const path = `$.semanticProvenance.bindings[${index}]`;
    requireObject(row, path);
    requireExactKeys(row, [
      'schema', 'id', 'kind', 'targetId', 'targetPath', 'label', 'valueHash',
      'authority', 'sourceSpanIds', 'evidenceIds', 'patchIds', 'status', 'reason',
    ], path);
    if (row.schema !== SEMANTIC_PROVENANCE_BINDING_SCHEMA || !SEMANTIC_KINDS.has(row.kind) ||
        !AUTHORITIES.has(row.authority) || !['proven', 'missing'].includes(row.status)) {
      throw new SemanticProofError('Invalid semantic provenance binding', path);
    }
    if (!row.id || !row.targetId || !row.targetPath || !row.label || !row.reason) {
      throw new SemanticProofError('Incomplete semantic provenance binding', path);
    }
    requireStringArray(row.sourceSpanIds, `${path}.sourceSpanIds`);
    requireStringArray(row.evidenceIds, `${path}.evidenceIds`);
    requireStringArray(row.patchIds, `${path}.patchIds`);
    validateNamedHash(row.valueHash, `${path}.valueHash`);
    const proven = provenanceSatisfied(row.authority, row.sourceSpanIds, row.evidenceIds, row.patchIds);
    if ((row.status === 'proven') !== proven) {
      throw new SemanticProofError('Semantic binding status does not match its provenance', path);
    }
  }

  function semanticBindingIdentity(spec = {}) {
    const phase2 = spec.phaseArtifacts && spec.phaseArtifacts.phase2 || {};
    const phase4 = spec.phaseArtifacts && spec.phaseArtifacts.phase4 || {};
    const requirements = phase2.artifact && phase2.artifact.intentRequirements || null;
    const ledger = phase4.artifact && phase4.artifact.semanticProvenance || null;
    let contractValid = false;
    try {
      if (phase2.schema !== PHASE2_OUTPUT_SCHEMA || phase4.schema !== PHASE4_OUTPUT_SCHEMA) {
        throw new SemanticProofError('Semantic binding requires canonical Phase 2 and Phase 4 outputs');
      }
      intentProofContract.validateIntentRequirementLedger(requirements);
      validateSemanticProvenanceLedger(ledger, requirements);
      const reconstructed = createSemanticProvenanceLedger(requirements, phase4.artifact, {
        patches: spec.authorship && spec.authorship.patches || [],
      });
      if (canonicalJson(reconstructed) !== canonicalJson(ledger)) {
        throw new SemanticProofError('Semantic provenance does not match the current accepted graph');
      }
      contractValid = true;
    } catch (_error) {
      contractValid = false;
    }
    return {
      provenanceLedgerHash: String(ledger && ledger.contentHash || ''),
      graphHash: String(ledger && ledger.graphHash || ''),
      bindingCount: Number(ledger && ledger.bindingCount || 0),
      provenCount: Number(ledger && ledger.provenCount || 0),
      missingCount: Number(ledger && ledger.missingCount || 0),
      contractValid,
    };
  }

  function createSemanticProofReceipt(options = {}) {
    const spec = options.spec || {};
    const binding = options.binding || {};
    const phase2 = spec.phaseArtifacts && spec.phaseArtifacts.phase2 || {};
    const phase4 = spec.phaseArtifacts && spec.phaseArtifacts.phase4 || {};
    let requirements = phase2.artifact && phase2.artifact.intentRequirements || null;
    let ledger = phase4.artifact && phase4.artifact.semanticProvenance || null;
    let error = null;
    try {
      if (phase2.schema !== PHASE2_OUTPUT_SCHEMA || phase4.schema !== PHASE4_OUTPUT_SCHEMA) {
        throw new SemanticProofError('Semantic proof requires the canonical Phase 2 and Phase 4 outputs');
      }
      intentProofContract.validateIntentRequirementLedger(requirements);
      validateSemanticProvenanceLedger(ledger, requirements);
      const reconstructed = createSemanticProvenanceLedger(requirements, phase4.artifact, {
        patches: spec.authorship && spec.authorship.patches || [],
      });
      if (canonicalJson(reconstructed) !== canonicalJson(ledger)) {
        throw new SemanticProofError('Phase 4 semantic provenance does not match grounded evidence');
      }
    } catch (caught) {
      error = caught;
      requirements = {};
      ledger = {};
    }
    const failureCode = error ? 'semantic-contract-invalid'
      : ledger.status === 'fail' ? 'semantic-provenance-missing'
        : ledger.status === 'not-proven' ? 'semantic-graph-empty' : '';
    const status = error || ledger.status === 'fail' ? 'fail'
      : ledger.status === 'not-proven' ? 'not-proven' : 'pass';
    const receipt = {
      schema: SEMANTIC_PROOF_RECEIPT_SCHEMA,
      contentHash: '',
      status,
      failureCode,
      reason: error ? String(error.message || error)
        : status === 'pass'
          ? 'Every accepted semantic fact retains source-bound provenance'
          : status === 'not-proven'
            ? 'The accepted semantic graph contains no facts to prove'
            : 'At least one accepted semantic fact lacks source-bound provenance',
      worldSpecContentHash: String(binding.worldSpec && binding.worldSpec.contentHash || ''),
      worldSpecRevision: Number(binding.worldSpec && binding.worldSpec.revision || 0),
      promptHash: String(binding.worldSpec && binding.worldSpec.promptHash || ''),
      phase2Schema: String(phase2.schema || ''),
      phase4Schema: String(phase4.schema || ''),
      requirementLedgerHash: String(requirements.contentHash || ''),
      provenanceLedgerHash: String(ledger.contentHash || ''),
      graphHash: String(ledger.graphHash || ''),
      bindingCount: Number(ledger.bindingCount || 0),
      provenCount: Number(ledger.provenCount || 0),
      missingCount: Number(ledger.missingCount || 0),
      bindings: Array.isArray(ledger.bindings) ? ledger.bindings : [],
    };
    receipt.contentHash = contentHash(receipt);
    return validateSemanticProofReceipt(receipt);
  }

  function validateSemanticProofReceipt(receipt) {
    requireObject(receipt, '$.semanticProofReceipt');
    requireExactKeys(receipt, [
      'schema', 'contentHash', 'status', 'failureCode', 'reason',
      'worldSpecContentHash', 'worldSpecRevision', 'promptHash', 'phase2Schema',
      'phase4Schema', 'requirementLedgerHash', 'provenanceLedgerHash', 'graphHash',
      'bindingCount', 'provenCount', 'missingCount', 'bindings',
    ], '$.semanticProofReceipt');
    if (receipt.schema !== SEMANTIC_PROOF_RECEIPT_SCHEMA ||
        !['pass', 'fail', 'not-proven'].includes(receipt.status)) {
      throw new SemanticProofError('Invalid semantic proof receipt schema or status');
    }
    for (const key of [
      'failureCode', 'reason', 'worldSpecContentHash', 'promptHash', 'phase2Schema',
      'phase4Schema', 'requirementLedgerHash', 'provenanceLedgerHash', 'graphHash',
    ]) {
      if (typeof receipt[key] !== 'string') throw new SemanticProofError(`Semantic receipt ${key} must be a string`);
    }
    requireNonnegativeIntegers(receipt, [
      'worldSpecRevision', 'bindingCount', 'provenCount', 'missingCount',
    ]);
    if (!Array.isArray(receipt.bindings) || receipt.bindings.length > MAX_BINDINGS) {
      throw new SemanticProofError('Semantic receipt bindings must be bounded');
    }
    receipt.bindings.forEach(validateSemanticBinding);
    const provenCount = receipt.bindings.filter((row) => row.status === 'proven').length;
    if (receipt.bindingCount !== receipt.bindings.length || receipt.provenCount !== provenCount ||
        receipt.missingCount !== receipt.bindings.length - provenCount) {
      throw new SemanticProofError('Semantic receipt counts do not close');
    }
    const expectedStatus = receipt.missingCount ? 'fail' : receipt.bindingCount ? 'pass' : 'not-proven';
    if (!receipt.failureCode && receipt.status !== expectedStatus) {
      throw new SemanticProofError('Semantic receipt status does not match bindings');
    }
    if (receipt.status === 'pass' && (
      receipt.phase2Schema !== PHASE2_OUTPUT_SCHEMA || receipt.phase4Schema !== PHASE4_OUTPUT_SCHEMA
    )) throw new SemanticProofError('Passing semantic receipt does not bind canonical phase schemas');
    if (receipt.status === 'pass' && (
      receipt.failureCode || !receipt.worldSpecContentHash || !receipt.promptHash ||
      !receipt.requirementLedgerHash || !receipt.provenanceLedgerHash || !receipt.graphHash
    )) throw new SemanticProofError('Passing semantic receipt is incomplete');
    validateHash(receipt.contentHash, contentHash(receipt), '$.semanticProofReceipt.contentHash');
    return receipt;
  }

  function semanticProofStatus(receipt, binding) {
    if (!receipt) return 'not-proven';
    try {
      validateSemanticProofReceipt(receipt);
    } catch (_error) {
      return 'fail';
    }
    const worldSpec = binding && binding.worldSpec || {};
    const semantic = binding && binding.semantic || {};
    const phases = binding && Array.isArray(binding.phases) ? binding.phases : [];
    const phase2 = phases.find((row) => row.phase === 2) || {};
    const phase4 = phases.find((row) => row.phase === 4) || {};
    const matches = semantic.contractValid === true &&
      receipt.worldSpecContentHash === String(worldSpec.contentHash || '') &&
      receipt.worldSpecRevision === Number(worldSpec.revision || 0) &&
      receipt.promptHash === String(worldSpec.promptHash || '') &&
      receipt.phase2Schema === String(phase2.schema || '') &&
      receipt.phase4Schema === String(phase4.schema || '') &&
      receipt.provenanceLedgerHash === String(semantic.provenanceLedgerHash || '') &&
      receipt.graphHash === String(semantic.graphHash || '') &&
      receipt.bindingCount === Number(semantic.bindingCount || 0) &&
      receipt.provenCount === Number(semantic.provenCount || 0) &&
      receipt.missingCount === Number(semantic.missingCount || 0);
    return matches ? receipt.status : 'fail';
  }

  function requireObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SemanticProofError('Expected an object', path);
    }
  }

  function requireExactKeys(value, allowed, path) {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!expected.has(key)) throw new SemanticProofError(`Unknown field ${key}`, `${path}.${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new SemanticProofError(`Missing field ${key}`, `${path}.${key}`);
    }
  }

  function requireStringArray(value, path) {
    if (!Array.isArray(value) || value.some((row) => typeof row !== 'string' || !row) ||
        new Set(value).size !== value.length) {
      throw new SemanticProofError('Expected unique string array', path);
    }
  }

  function requireNonnegativeIntegers(value, keys) {
    for (const key of keys) {
      if (!Number.isInteger(value[key]) || value[key] < 0) {
        throw new SemanticProofError(`Expected nonnegative integer ${key}`);
      }
    }
  }

  function requireUniqueIds(rows, path) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new SemanticProofError('IDs must be unique', path);
    }
  }

  function validateNamedHash(value, path) {
    if (typeof value !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(value)) {
      throw new SemanticProofError('Expected named FNV-1a hash', path);
    }
  }

  function validateHash(value, expected, path) {
    validateNamedHash(value, path);
    if (value !== expected) throw new SemanticProofError('Content hash does not match canonical content', path);
  }

  return Object.freeze({
    SEMANTIC_PROVENANCE_LEDGER_SCHEMA,
    SEMANTIC_PROVENANCE_BINDING_SCHEMA,
    SEMANTIC_PROOF_RECEIPT_SCHEMA,
    SemanticProofError,
    createSemanticProvenanceLedger,
    validateSemanticProvenanceLedger,
    semanticBindingIdentity,
    createSemanticProofReceipt,
    validateSemanticProofReceipt,
    semanticProofStatus,
  });
});
