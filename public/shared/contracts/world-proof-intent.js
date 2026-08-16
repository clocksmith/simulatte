(function attachSimulatteWorldProofIntent(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProofIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createIntentProofApi() {
  const INTENT_REQUIREMENT_LEDGER_SCHEMA = 'simulatte.intentRequirementLedger.v1';
  const INTENT_REQUIREMENT_SCHEMA = 'simulatte.intentRequirement.v1';
  const INTENT_SETTLEMENT_LEDGER_SCHEMA = 'simulatte.intentSettlementLedger.v1';
  const INTENT_SETTLEMENT_SCHEMA = 'simulatte.intentSettlement.v1';
  const INTENT_PROOF_RECEIPT_SCHEMA = 'simulatte.intentProofReceipt.v1';
  const PHASE2_OUTPUT_SCHEMA = 'simulatte.phase2.output.v1';
  const PHASE4_OUTPUT_SCHEMA = 'simulatte.phase4.output.v2';
  const HASH_PREFIX = 'fnv1a32:';
  const MAX_REQUIREMENTS = 256;
  const REQUIREMENT_KINDS = Object.freeze(new Set([
    'entity', 'concept', 'part', 'action', 'environment', 'medium',
    'attribute', 'quantity', 'relation', 'material', 'observable', 'term',
  ]));
  const SEMANTIC_SPAN_KINDS = Object.freeze(new Set([
    'entity', 'term', 'process', 'modifier', 'quantity', 'material',
    'environment', 'observable',
  ]));
  const SETTLEMENT_STATUSES = Object.freeze([
    'accepted', 'explicitly-refused', 'unresolved', 'lost',
  ]);

  class IntentProofError extends Error {
    constructor(message, path = '$.intentProof') {
      super(`${message} at ${path}`);
      this.name = 'IntentProofError';
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
    return [...new Set((rows || []).map(String).filter(Boolean))].sort();
  }

  function semanticSpans(languageGraph = {}) {
    return (languageGraph.spans || []).filter((row) => (
      row && row.id && SEMANTIC_SPAN_KINDS.has(String(row.kind || ''))
    ));
  }

  function sceneEntries(sceneLanguageGraph = {}) {
    return [
      ...(sceneLanguageGraph.entities || []),
      ...(sceneLanguageGraph.concepts || []),
      ...(sceneLanguageGraph.parts || []),
      ...(sceneLanguageGraph.actions || []),
      ...(sceneLanguageGraph.environments || []),
      ...(sceneLanguageGraph.mediums || []),
      ...(sceneLanguageGraph.attributes || []),
    ].filter((row) => row && row.id);
  }

  function entriesBySpan(entries = []) {
    const map = new Map();
    for (const entry of entries) {
      for (const spanId of entry.sourceSpanIds || []) {
        const rows = map.get(spanId) || [];
        rows.push(entry);
        map.set(spanId, rows);
      }
    }
    return map;
  }

  function normalizedRequirement(input = {}) {
    return canonicalValue({
      schema: INTENT_REQUIREMENT_SCHEMA,
      id: String(input.id || ''),
      kind: String(input.kind || 'term'),
      label: String(input.label || ''),
      critical: input.critical !== false,
      polarity: input.polarity === 'forbidden' ? 'forbidden' : 'required',
      sourceSpanIds: uniqueStrings(input.sourceSpanIds),
      targetIds: uniqueStrings(input.targetIds),
      value: input.value === undefined ? null : input.value,
      unit: String(input.unit || ''),
      predicate: String(input.predicate || ''),
    });
  }

  function entryRequirement(entry) {
    return normalizedRequirement({
      id: `intent:${entry.kind || 'term'}:${entry.id}`,
      kind: REQUIREMENT_KINDS.has(entry.kind) ? entry.kind : 'term',
      label: entry.label || entry.id,
      critical: true,
      polarity: entry.negated === true ? 'forbidden' : 'required',
      sourceSpanIds: entry.sourceSpanIds,
      targetIds: [entry.id],
    });
  }

  function modifierRequirements(languageGraph, sceneLanguageGraph, bySpan) {
    const spans = new Map((languageGraph.spans || []).map((row) => [row.id, row]));
    const attributes = sceneLanguageGraph.attributes || [];
    const boundAttributeSpans = new Set();
    const requirements = (languageGraph.modifiers || []).map((row) => {
      const modifier = spans.get(row.modifierSpanId) || {};
      const targets = bySpan.get(row.targetSpanId) || [];
      const matchingAttributes = attributes.filter((entry) => (
        (entry.sourceSpanIds || []).includes(row.modifierSpanId)
      ));
      boundAttributeSpans.add(row.modifierSpanId);
      const forbidden = [...targets, ...matchingAttributes].some((entry) => entry.negated === true);
      return normalizedRequirement({
        id: `intent:attribute:${row.id || row.modifierSpanId}`,
        kind: 'attribute',
        label: modifier.text || row.relation || 'attribute',
        polarity: forbidden ? 'forbidden' : 'required',
        sourceSpanIds: [row.modifierSpanId, row.targetSpanId],
        targetIds: [...matchingAttributes.map((entry) => entry.id), ...targets.map((entry) => entry.id)],
        value: row.value === undefined ? modifier.propertyValue : row.value,
        predicate: row.relation || modifier.modifierRelation || '',
      });
    });
    for (const entry of attributes) {
      if ((entry.sourceSpanIds || []).some((spanId) => boundAttributeSpans.has(spanId))) continue;
      if (!(entry.sourceSpanIds || []).length) continue;
      requirements.push(entryRequirement(entry));
    }
    return requirements;
  }

  function quantityRequirements(languageGraph, bySpan) {
    const spans = new Map((languageGraph.spans || []).map((row) => [row.id, row]));
    return (languageGraph.quantities || []).map((row) => {
      const quantitySpan = spans.get(row.quantitySpanId) || {};
      const targets = bySpan.get(row.targetSpanId) || [];
      return normalizedRequirement({
        id: `intent:quantity:${row.id || row.quantitySpanId}`,
        kind: 'quantity',
        label: quantitySpan.text || String(row.value),
        sourceSpanIds: [row.quantitySpanId, row.targetSpanId],
        targetIds: targets.map((entry) => entry.id),
        value: Number(row.value),
        unit: row.unit || '',
        predicate: row.unit === 'instances' ? 'exact-count' : 'quantity',
      });
    });
  }

  function relationRequirements(sceneLanguageGraph) {
    const selected = new Map();
    for (const row of sceneLanguageGraph.relations || []) {
      if (!row || row.required !== true || !(row.sourceSpanIds || []).length) continue;
      const predicate = row.spatialRelation || row.predicate || row.process || row.kind || '';
      const key = `${uniqueStrings(row.sourceSpanIds).join(',')}:${predicate}`;
      const current = selected.get(key);
      if (!current || row.kind === 'spatial-constraint') selected.set(key, row);
    }
    return [...selected.values()].map((row) => normalizedRequirement({
      id: `intent:relation:${row.id}`,
      kind: 'relation',
      label: row.spatialRelation || row.predicate || row.process || row.kind || 'relation',
      sourceSpanIds: row.sourceSpanIds,
      targetIds: [row.from, row.to, row.target],
      predicate: row.spatialRelation || row.predicate || row.process || row.kind || '',
    }));
  }

  function fallbackRequirements(languageGraph, requirements) {
    const covered = new Set(requirements.flatMap((row) => row.sourceSpanIds));
    return semanticSpans(languageGraph).flatMap((span) => {
      if (covered.has(span.id)) return [];
      const kind = ({ process: 'action', modifier: 'attribute' })[span.kind] || span.kind;
      return [normalizedRequirement({
        id: `intent:${kind}:${span.id}`,
        kind: REQUIREMENT_KINDS.has(kind) ? kind : 'term',
        label: span.text || span.id,
        sourceSpanIds: [span.id],
        targetIds: [],
        value: span.value === undefined ? span.propertyValue : span.value,
        predicate: span.modifierRelation || '',
      })];
    });
  }

  function createIntentRequirementLedger(input = {}) {
    const languageGraph = input.languageGraph || {};
    const sceneLanguageGraph = input.sceneLanguageGraph || {};
    if (languageGraph.schema !== 'simulatte.languageGraph.v1') {
      throw new IntentProofError('Expected simulatte.languageGraph.v1', '$.languageGraph.schema');
    }
    if (sceneLanguageGraph.schema !== 'simulatte.sceneLanguageGraph.v1') {
      throw new IntentProofError('Expected simulatte.sceneLanguageGraph.v1', '$.sceneLanguageGraph.schema');
    }
    const entries = sceneEntries(sceneLanguageGraph);
    const bySpan = entriesBySpan(entries);
    const attributeSpanIds = new Set((sceneLanguageGraph.attributes || [])
      .flatMap((row) => row.sourceSpanIds || []));
    let requirements = entries
      .filter((entry) => entry.kind !== 'attribute' && (entry.sourceSpanIds || []).length)
      .map(entryRequirement);
    requirements.push(...modifierRequirements(languageGraph, sceneLanguageGraph, bySpan));
    requirements.push(...quantityRequirements(languageGraph, bySpan));
    requirements.push(...relationRequirements(sceneLanguageGraph));
    requirements.push(...fallbackRequirements(languageGraph, requirements));
    requirements = [...new Map(requirements.map((row) => [row.id, row])).values()]
      .filter((row) => !(
        row.kind === 'attribute' && row.sourceSpanIds.every((spanId) => !attributeSpanIds.has(spanId)) &&
        !languageGraph.modifiers.some((modifier) => row.sourceSpanIds.includes(modifier.modifierSpanId))
      ))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (requirements.length > MAX_REQUIREMENTS) {
      throw new IntentProofError(`Intent requirement count exceeds ${MAX_REQUIREMENTS}`);
    }
    const spans = semanticSpans(languageGraph);
    const covered = new Set(requirements.flatMap((row) => row.sourceSpanIds));
    const ledger = {
      schema: INTENT_REQUIREMENT_LEDGER_SCHEMA,
      contentHash: '',
      sourcePromptHash: hashValue(String(languageGraph.sourceText || '')),
      requirementCount: requirements.length,
      criticalRequirementCount: requirements.filter((row) => row.critical).length,
      semanticSpanCount: spans.length,
      coveredSemanticSpanCount: spans.filter((span) => covered.has(span.id)).length,
      uncoveredSemanticSpanIds: spans.filter((span) => !covered.has(span.id)).map((span) => span.id).sort(),
      requirements,
    };
    ledger.contentHash = contentHash(ledger);
    return validateIntentRequirementLedger(ledger);
  }

  function settlementContext(phase4Artifact = {}) {
    const groundedIntent = phase4Artifact.groundedIntent || {};
    const graph = groundedIntent.acceptedGraph || {};
    const rejectedGraph = groundedIntent.rejectedGraph || {};
    const nodes = graph.nodes || [];
    const unsupported = [
      ...(graph.unsupported || []),
      ...(groundedIntent.unsupported || []),
      ...(phase4Artifact.groundedSceneContract && phase4Artifact.groundedSceneContract.unsupported || []),
      ...(groundedIntent.groundedSceneContract && groundedIntent.groundedSceneContract.unsupported || []),
    ];
    const unresolved = [
      ...(graph.unresolved || []),
      ...(rejectedGraph.unresolved || []),
    ];
    return {
      graph,
      nodes,
      edges: graph.edges || [],
      visualObligations: graph.promptVisualObligations || [],
      negativeEvidence: groundedIntent.negativeEvidence || [],
      unsupported,
      unresolved,
      rejected: rejectedGraph.rejected || [],
    };
  }

  function nodesForRequirement(requirement, context) {
    const spans = new Set(requirement.sourceSpanIds);
    return context.nodes.filter((node) => node.spanId && spans.has(String(node.spanId)));
  }

  function rowEvidenceId(row, prefix, index) {
    return String(row && (row.id || row.canonicalId || row.spanId) || `${prefix}:${index}`);
  }

  function rowMatchesRequirement(row, requirement, nodes = []) {
    const expected = new Set([
      ...requirement.sourceSpanIds,
      ...requirement.targetIds,
      ...nodes.flatMap((node) => [node.id, node.canonicalId, node.spanId, node.label]),
    ].map(String).filter(Boolean));
    const received = [
      row && row.id,
      row && row.canonicalId,
      row && row.spanId,
      row && row.entryId,
      row && row.targetId,
      row && row.label,
      row && row.text,
    ].map(String).filter(Boolean).flatMap((value) => [value, value.replace(/^unsupported:/, '')]);
    return received.some((value) => expected.has(value));
  }

  function matchingRows(rows, requirement, nodes, prefix) {
    return (rows || []).map((row, index) => ({ row, id: rowEvidenceId(row, prefix, index) }))
      .filter(({ row }) => rowMatchesRequirement(row, requirement, nodes));
  }

  function acceptedEvidence(requirement, context, nodes) {
    if (requirement.polarity === 'forbidden') {
      return context.negativeEvidence
        .filter((row) => requirement.targetIds.includes(String(row.entryId || '')))
        .map((row, index) => rowEvidenceId(row, 'negative', index));
    }
    if (['entity', 'concept', 'part', 'environment', 'medium', 'material', 'term', 'observable'].includes(requirement.kind)) {
      return nodes.map((node) => String(node.id || node.canonicalId || node.spanId)).filter(Boolean);
    }
    if (requirement.kind === 'attribute') {
      return nodes.flatMap((node) => (node.properties || []).flatMap((property) => {
        const spans = property.sourceSpanIds || [];
        if (!requirement.sourceSpanIds.some((spanId) => spans.includes(spanId))) return [];
        return [`property:${node.id || node.canonicalId}:${property.kind || requirement.predicate}`];
      }));
    }
    if (requirement.kind === 'quantity') {
      return context.visualObligations.filter((row) => (
        row.constraintKind === 'count' && Number(row.expectedCount) === Number(requirement.value) &&
        (!row.targetNodeId || nodes.some((node) => node.id === row.targetNodeId))
      )).map((row) => String(row.id || '')).filter(Boolean);
    }
    if (requirement.kind === 'action') {
      const predicate = String(requirement.predicate || requirement.label || '').toLowerCase();
      return context.edges.filter((edge) => (
        [edge.processId, edge.predicate, edge.type].map((value) => String(value || '').toLowerCase()).includes(predicate)
      )).map((edge) => String(edge.id || '')).filter(Boolean);
    }
    if (requirement.kind === 'relation') {
      const nodeIds = new Set(nodes.map((node) => String(node.id || '')));
      const predicate = String(requirement.predicate || requirement.label || '').toLowerCase();
      return context.edges.filter((edge) => {
        const values = [edge.type, edge.predicate, edge.spatialRelation, edge.processId]
          .map((value) => String(value || '').toLowerCase());
        const endpoints = [String(edge.from || ''), String(edge.to || '')];
        return values.includes(predicate) && endpoints.every((id) => !id || nodeIds.has(id));
      }).map((edge) => String(edge.id || '')).filter(Boolean);
    }
    return [];
  }

  function settleRequirement(requirement, context) {
    const nodes = nodesForRequirement(requirement, context);
    const accepted = acceptedEvidence(requirement, context, nodes);
    if (requirement.polarity === 'forbidden' && accepted.length) {
      return settlementRow(requirement, 'accepted', accepted, 'Phase 4 retained the extracted prohibition');
    }
    const refused = matchingRows(context.unsupported, requirement, nodes, 'unsupported');
    const refusedNodes = nodes.filter((node) => matchingRows(context.unsupported, requirement, [node], 'unsupported').length);
    if (refused.length || refusedNodes.length) {
      return settlementRow(
        requirement,
        'explicitly-refused',
        uniqueStrings(refused.map((row) => row.id)),
        'Phase 4 explicitly reported the requirement as unsupported'
      );
    }
    if (accepted.length) return settlementRow(requirement, 'accepted', accepted, 'Phase 4 retained the extracted requirement');
    const unresolved = matchingRows(context.unresolved, requirement, nodes, 'unresolved');
    if (unresolved.length) {
      return settlementRow(
        requirement,
        'unresolved',
        uniqueStrings(unresolved.map((row) => row.id)),
        'Phase 4 retained an unresolved requirement'
      );
    }
    const rejected = matchingRows(context.rejected, requirement, nodes, 'rejected');
    if (rejected.length) {
      return settlementRow(
        requirement,
        'explicitly-refused',
        uniqueStrings(rejected.map((row) => row.id)),
        'Phase 4 explicitly rejected the requirement'
      );
    }
    return settlementRow(requirement, 'lost', [], 'No Phase 4 acceptance, refusal, or unresolved evidence retained the requirement');
  }

  function settlementRow(requirement, status, evidenceIds, reason) {
    return canonicalValue({
      schema: INTENT_SETTLEMENT_SCHEMA,
      id: `settlement:${requirement.id}`,
      requirementId: requirement.id,
      kind: requirement.kind,
      label: requirement.label,
      critical: requirement.critical,
      polarity: requirement.polarity,
      sourceSpanIds: requirement.sourceSpanIds,
      status,
      evidenceIds: uniqueStrings(evidenceIds),
      reason,
    });
  }

  function settlementStatus(settlements) {
    const critical = settlements.filter((row) => row.critical);
    if (critical.some((row) => row.status === 'lost')) return 'fail';
    if (critical.some((row) => row.status === 'unresolved')) return 'not-proven';
    return 'pass';
  }

  function createIntentSettlementLedger(requirementLedger, phase4Artifact = {}) {
    validateIntentRequirementLedger(requirementLedger);
    const settlements = requirementLedger.requirements
      .map((requirement) => settleRequirement(requirement, settlementContext(phase4Artifact)));
    const counts = {
      acceptedCount: settlements.filter((row) => row.critical && row.status === 'accepted').length,
      explicitRefusalCount: settlements.filter((row) => row.critical && row.status === 'explicitly-refused').length,
      unresolvedCount: settlements.filter((row) => row.critical && row.status === 'unresolved').length,
      lostCount: settlements.filter((row) => row.critical && row.status === 'lost').length,
    };
    const ledger = {
      schema: INTENT_SETTLEMENT_LEDGER_SCHEMA,
      contentHash: '',
      requirementLedgerHash: requirementLedger.contentHash,
      status: settlementStatus(settlements),
      criticalRequirementCount: requirementLedger.criticalRequirementCount,
      acceptedCount: counts.acceptedCount,
      explicitRefusalCount: counts.explicitRefusalCount,
      unresolvedCount: counts.unresolvedCount,
      lostCount: counts.lostCount,
      settlements,
    };
    ledger.contentHash = contentHash(ledger);
    return validateIntentSettlementLedger(ledger, requirementLedger);
  }

  function intentBindingIdentity(spec = {}) {
    const phase2 = spec.phaseArtifacts && spec.phaseArtifacts.phase2 || {};
    const phase4 = spec.phaseArtifacts && spec.phaseArtifacts.phase4 || {};
    const requirements = phase2.artifact && phase2.artifact.intentRequirements || null;
    const settlement = phase4.artifact && phase4.artifact.intentSettlement || null;
    return {
      sourcePromptPresent: Boolean(String(spec.source && spec.source.prompt || '').trim()),
      requirementLedgerHash: String(requirements && requirements.contentHash || ''),
      settlementLedgerHash: String(settlement && settlement.contentHash || ''),
      criticalRequirementCount: Number(requirements && requirements.criticalRequirementCount || 0),
    };
  }

  function createIntentProofReceipt(options = {}) {
    const spec = options.spec || {};
    const binding = options.binding || {};
    const phase2 = spec.phaseArtifacts && spec.phaseArtifacts.phase2 || {};
    const phase4 = spec.phaseArtifacts && spec.phaseArtifacts.phase4 || {};
    let requirements = phase2.artifact && phase2.artifact.intentRequirements || null;
    let settlement = phase4.artifact && phase4.artifact.intentSettlement || null;
    let error = null;
    try {
      if (phase2.schema !== PHASE2_OUTPUT_SCHEMA || phase4.schema !== PHASE4_OUTPUT_SCHEMA) {
        throw new IntentProofError('Intent proof requires the canonical Phase 2 and Phase 4 outputs');
      }
      const reconstructed = createIntentRequirementLedger({
        languageGraph: phase2.artifact && phase2.artifact.languageGraph,
        sceneLanguageGraph: phase2.artifact && phase2.artifact.sceneLanguageGraph,
      });
      if (String(phase2.artifact && phase2.artifact.languageGraph && phase2.artifact.languageGraph.sourceText || '') !==
          String(spec.source && spec.source.prompt || '')) {
        throw new IntentProofError('Phase 2 language source does not match the WorldSpec prompt');
      }
      validateIntentRequirementLedger(requirements);
      if (canonicalJson(reconstructed) !== canonicalJson(requirements)) {
        throw new IntentProofError('Phase 2 intent requirements do not match the language artifacts');
      }
      validateIntentSettlementLedger(settlement, requirements);
      const userOverride = phase4.artifact && phase4.artifact.groundedIntent &&
        phase4.artifact.groundedIntent.authorship &&
        phase4.artifact.groundedIntent.authorship.authority === 'userOverride';
      if (!userOverride) {
        const reconstructedSettlement = createIntentSettlementLedger(requirements, phase4.artifact);
        if (canonicalJson(reconstructedSettlement) !== canonicalJson(settlement)) {
          throw new IntentProofError('Phase 4 intent settlement does not match grounded evidence');
        }
      }
    } catch (caught) {
      error = caught;
      requirements = {};
      settlement = {};
    }
    const sourcePresent = Boolean(String(spec.source && spec.source.prompt || '').trim());
    const uncovered = Array.isArray(requirements.uncoveredSemanticSpanIds)
      ? requirements.uncoveredSemanticSpanIds : [];
    const failureCode = error ? 'intent-contract-invalid'
      : !sourcePresent ? 'intent-source-missing'
        : uncovered.length ? 'intent-extraction-gap'
          : settlement.status === 'fail' ? 'intent-requirement-lost'
            : settlement.status === 'not-proven' ? 'intent-requirement-unresolved' : '';
    const status = failureCode === 'intent-requirement-unresolved'
      ? 'not-proven' : failureCode ? 'fail' : 'pass';
    const receipt = {
      schema: INTENT_PROOF_RECEIPT_SCHEMA,
      contentHash: '',
      status,
      failureCode,
      reason: error ? String(error.message || error)
        : status === 'pass'
          ? 'Every extracted critical requirement was accepted or explicitly refused'
          : status === 'not-proven'
            ? 'At least one extracted critical requirement remains unresolved'
            : 'Intent proof did not account for every extracted critical requirement',
      worldSpecContentHash: String(binding.worldSpec && binding.worldSpec.contentHash || ''),
      worldSpecRevision: Number(binding.worldSpec && binding.worldSpec.revision || 0),
      promptHash: String(binding.worldSpec && binding.worldSpec.promptHash || ''),
      phase2Schema: String(phase2.schema || ''),
      phase4Schema: String(phase4.schema || ''),
      requirementLedgerHash: String(requirements.contentHash || ''),
      settlementLedgerHash: String(settlement.contentHash || ''),
      requirementCount: Number(requirements.requirementCount || 0),
      criticalRequirementCount: Number(requirements.criticalRequirementCount || 0),
      acceptedCount: Number(settlement.acceptedCount || 0),
      explicitRefusalCount: Number(settlement.explicitRefusalCount || 0),
      unresolvedCount: Number(settlement.unresolvedCount || 0),
      lostCount: Number(settlement.lostCount || 0),
      uncoveredSemanticSpanIds: uniqueStrings(uncovered),
      settlements: Array.isArray(settlement.settlements) ? settlement.settlements : [],
    };
    receipt.contentHash = contentHash(receipt);
    return validateIntentProofReceipt(receipt);
  }

  function validateIntentRequirementLedger(ledger) {
    requireObject(ledger, '$.intentRequirements');
    requireExactKeys(ledger, [
      'schema', 'contentHash', 'sourcePromptHash', 'requirementCount',
      'criticalRequirementCount', 'semanticSpanCount', 'coveredSemanticSpanCount',
      'uncoveredSemanticSpanIds', 'requirements',
    ], '$.intentRequirements');
    if (ledger.schema !== INTENT_REQUIREMENT_LEDGER_SCHEMA) throw new IntentProofError('Unexpected requirement-ledger schema');
    if (!Array.isArray(ledger.requirements) || ledger.requirements.length > MAX_REQUIREMENTS) throw new IntentProofError('Requirements must be bounded');
    ledger.requirements.forEach(validateRequirement);
    requireUniqueIds(ledger.requirements, '$.intentRequirements.requirements');
    const criticalCount = ledger.requirements.filter((row) => row.critical).length;
    if (ledger.requirementCount !== ledger.requirements.length || ledger.criticalRequirementCount !== criticalCount) {
      throw new IntentProofError('Requirement summary does not match rows');
    }
    requireNonnegativeIntegers(ledger, ['requirementCount', 'criticalRequirementCount', 'semanticSpanCount', 'coveredSemanticSpanCount']);
    requireStringArray(ledger.uncoveredSemanticSpanIds, '$.intentRequirements.uncoveredSemanticSpanIds');
    if (ledger.semanticSpanCount !== ledger.coveredSemanticSpanCount + ledger.uncoveredSemanticSpanIds.length) {
      throw new IntentProofError('Semantic span coverage summary does not close');
    }
    validateHash(ledger.contentHash, contentHash(ledger), '$.intentRequirements.contentHash');
    validateNamedHash(ledger.sourcePromptHash, '$.intentRequirements.sourcePromptHash');
    return ledger;
  }

  function validateRequirement(row, index) {
    const path = `$.intentRequirements.requirements[${index}]`;
    requireObject(row, path);
    requireExactKeys(row, [
      'schema', 'id', 'kind', 'label', 'critical', 'polarity', 'sourceSpanIds',
      'targetIds', 'value', 'unit', 'predicate',
    ], path);
    if (row.schema !== INTENT_REQUIREMENT_SCHEMA || !REQUIREMENT_KINDS.has(row.kind)) throw new IntentProofError('Invalid intent requirement schema or kind', path);
    if (!row.id || !row.label || typeof row.critical !== 'boolean' || !['required', 'forbidden'].includes(row.polarity)) throw new IntentProofError('Invalid intent requirement identity', path);
    requireStringArray(row.sourceSpanIds, `${path}.sourceSpanIds`, true);
    requireStringArray(row.targetIds, `${path}.targetIds`);
    if (!['string', 'number'].includes(typeof row.value) && row.value !== null) throw new IntentProofError('Requirement value must be string, number, or null', `${path}.value`);
    if (typeof row.value === 'number' && !Number.isFinite(row.value)) throw new IntentProofError('Requirement number must be finite', `${path}.value`);
    if (typeof row.unit !== 'string' || typeof row.predicate !== 'string') throw new IntentProofError('Requirement unit and predicate must be strings', path);
  }

  function validateIntentSettlementLedger(ledger, requirements = null) {
    requireObject(ledger, '$.intentSettlement');
    requireExactKeys(ledger, [
      'schema', 'contentHash', 'requirementLedgerHash', 'status',
      'criticalRequirementCount', 'acceptedCount', 'explicitRefusalCount',
      'unresolvedCount', 'lostCount', 'settlements',
    ], '$.intentSettlement');
    if (ledger.schema !== INTENT_SETTLEMENT_LEDGER_SCHEMA || !['pass', 'fail', 'not-proven'].includes(ledger.status)) throw new IntentProofError('Invalid intent-settlement ledger schema or status');
    if (!Array.isArray(ledger.settlements) || ledger.settlements.length > MAX_REQUIREMENTS) throw new IntentProofError('Settlements must be bounded');
    ledger.settlements.forEach(validateSettlement);
    requireUniqueIds(ledger.settlements, '$.intentSettlement.settlements');
    requireNonnegativeIntegers(ledger, ['criticalRequirementCount', 'acceptedCount', 'explicitRefusalCount', 'unresolvedCount', 'lostCount']);
    const critical = ledger.settlements.filter((row) => row.critical);
    const counts = {
      acceptedCount: critical.filter((row) => row.status === 'accepted').length,
      explicitRefusalCount: critical.filter((row) => row.status === 'explicitly-refused').length,
      unresolvedCount: critical.filter((row) => row.status === 'unresolved').length,
      lostCount: critical.filter((row) => row.status === 'lost').length,
    };
    if (ledger.criticalRequirementCount !== critical.length || Object.keys(counts).some((key) => ledger[key] !== counts[key])) throw new IntentProofError('Settlement summary does not match rows');
    if (ledger.status !== settlementStatus(ledger.settlements)) throw new IntentProofError('Settlement status does not match rows');
    if (requirements) {
      if (ledger.requirementLedgerHash !== requirements.contentHash || ledger.settlements.length !== requirements.requirements.length) throw new IntentProofError('Settlement does not bind every requirement');
      const expectedIds = requirements.requirements.map((row) => row.id).sort();
      const settledIds = ledger.settlements.map((row) => row.requirementId).sort();
      if (canonicalJson(expectedIds) !== canonicalJson(settledIds)) throw new IntentProofError('Settlement requirement IDs do not close');
    }
    validateNamedHash(ledger.requirementLedgerHash, '$.intentSettlement.requirementLedgerHash');
    validateHash(ledger.contentHash, contentHash(ledger), '$.intentSettlement.contentHash');
    return ledger;
  }

  function validateSettlement(row, index) {
    const path = `$.intentSettlement.settlements[${index}]`;
    requireObject(row, path);
    requireExactKeys(row, [
      'schema', 'id', 'requirementId', 'kind', 'label', 'critical', 'polarity',
      'sourceSpanIds', 'status', 'evidenceIds', 'reason',
    ], path);
    if (row.schema !== INTENT_SETTLEMENT_SCHEMA || !SETTLEMENT_STATUSES.includes(row.status) || !REQUIREMENT_KINDS.has(row.kind)) throw new IntentProofError('Invalid intent settlement', path);
    if (!row.id || !row.requirementId || !row.label || typeof row.critical !== 'boolean' || !['required', 'forbidden'].includes(row.polarity) || !row.reason) throw new IntentProofError('Incomplete intent settlement', path);
    requireStringArray(row.sourceSpanIds, `${path}.sourceSpanIds`, true);
    requireStringArray(row.evidenceIds, `${path}.evidenceIds`);
    if (['accepted', 'explicitly-refused', 'unresolved'].includes(row.status) && !row.evidenceIds.length) throw new IntentProofError('Settled intent row requires evidence', path);
  }

  function validateIntentProofReceipt(receipt) {
    requireObject(receipt, '$.intentProofReceipt');
    requireExactKeys(receipt, [
      'schema', 'contentHash', 'status', 'failureCode', 'reason',
      'worldSpecContentHash', 'worldSpecRevision', 'promptHash', 'phase2Schema',
      'phase4Schema', 'requirementLedgerHash', 'settlementLedgerHash',
      'requirementCount', 'criticalRequirementCount', 'acceptedCount',
      'explicitRefusalCount', 'unresolvedCount', 'lostCount',
      'uncoveredSemanticSpanIds', 'settlements',
    ], '$.intentProofReceipt');
    if (receipt.schema !== INTENT_PROOF_RECEIPT_SCHEMA || !['pass', 'fail', 'not-proven'].includes(receipt.status)) throw new IntentProofError('Invalid intent-proof receipt schema or status');
    for (const key of ['failureCode', 'reason', 'worldSpecContentHash', 'promptHash', 'phase2Schema', 'phase4Schema', 'requirementLedgerHash', 'settlementLedgerHash']) {
      if (typeof receipt[key] !== 'string') throw new IntentProofError(`Intent receipt ${key} must be a string`);
    }
    requireNonnegativeIntegers(receipt, ['worldSpecRevision', 'requirementCount', 'criticalRequirementCount', 'acceptedCount', 'explicitRefusalCount', 'unresolvedCount', 'lostCount']);
    requireStringArray(receipt.uncoveredSemanticSpanIds, '$.intentProofReceipt.uncoveredSemanticSpanIds');
    if (!Array.isArray(receipt.settlements) || receipt.settlements.length > MAX_REQUIREMENTS) throw new IntentProofError('Intent receipt settlements must be bounded');
    receipt.settlements.forEach(validateSettlement);
    const critical = receipt.settlements.filter((row) => row.critical);
    const total = receipt.acceptedCount + receipt.explicitRefusalCount + receipt.unresolvedCount + receipt.lostCount;
    if (receipt.requirementCount !== receipt.settlements.length || receipt.criticalRequirementCount !== critical.length || total !== critical.length) throw new IntentProofError('Intent receipt counts do not close');
    const expectedStatus = receipt.lostCount || receipt.uncoveredSemanticSpanIds.length ? 'fail'
      : receipt.unresolvedCount ? 'not-proven' : 'pass';
    if (!receipt.failureCode && receipt.status !== expectedStatus) throw new IntentProofError('Intent receipt status does not match rows');
    if (receipt.status === 'pass' && (
      receipt.phase2Schema !== PHASE2_OUTPUT_SCHEMA || receipt.phase4Schema !== PHASE4_OUTPUT_SCHEMA
    )) throw new IntentProofError('Passing intent receipt does not bind the canonical phase schemas');
    if (receipt.status === 'pass' && (receipt.failureCode || !receipt.worldSpecContentHash || !receipt.promptHash || !receipt.requirementLedgerHash || !receipt.settlementLedgerHash)) throw new IntentProofError('Passing intent receipt is incomplete');
    validateHash(receipt.contentHash, contentHash(receipt), '$.intentProofReceipt.contentHash');
    return receipt;
  }

  function intentProofStatus(receipt, binding) {
    if (!receipt) return 'not-proven';
    try {
      validateIntentProofReceipt(receipt);
    } catch (_error) {
      return 'fail';
    }
    const worldSpec = binding && binding.worldSpec || {};
    const intent = binding && binding.intent || {};
    const phases = binding && Array.isArray(binding.phases) ? binding.phases : [];
    const phase2 = phases.find((row) => row.phase === 2) || {};
    const phase4 = phases.find((row) => row.phase === 4) || {};
    const matches = receipt.worldSpecContentHash === String(worldSpec.contentHash || '') &&
      receipt.worldSpecRevision === Number(worldSpec.revision || 0) &&
      receipt.promptHash === String(worldSpec.promptHash || '') &&
      receipt.phase2Schema === String(phase2.schema || '') &&
      receipt.phase4Schema === String(phase4.schema || '') &&
      receipt.requirementLedgerHash === String(intent.requirementLedgerHash || '') &&
      receipt.settlementLedgerHash === String(intent.settlementLedgerHash || '') &&
      receipt.criticalRequirementCount === Number(intent.criticalRequirementCount || 0);
    return matches ? receipt.status : 'fail';
  }

  function requireObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntentProofError('Expected an object', path);
  }

  function requireExactKeys(value, allowed, path) {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) if (!expected.has(key)) throw new IntentProofError(`Unknown field ${key}`, `${path}.${key}`);
    for (const key of allowed) if (!Object.hasOwn(value, key)) throw new IntentProofError(`Missing field ${key}`, `${path}.${key}`);
  }

  function requireStringArray(value, path, nonempty = false) {
    if (!Array.isArray(value) || value.some((row) => typeof row !== 'string' || !row) || new Set(value).size !== value.length || (nonempty && !value.length)) throw new IntentProofError('Expected unique string array', path);
  }

  function requireNonnegativeIntegers(value, keys) {
    for (const key of keys) if (!Number.isInteger(value[key]) || value[key] < 0) throw new IntentProofError(`Expected nonnegative integer ${key}`);
  }

  function requireUniqueIds(rows, path) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new IntentProofError('IDs must be unique', path);
  }

  function validateNamedHash(value, path) {
    if (typeof value !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(value)) throw new IntentProofError('Expected named FNV-1a hash', path);
  }

  function validateHash(value, expected, path) {
    validateNamedHash(value, path);
    if (value !== expected) throw new IntentProofError('Content hash does not match canonical content', path);
  }

  return Object.freeze({
    INTENT_REQUIREMENT_LEDGER_SCHEMA,
    INTENT_REQUIREMENT_SCHEMA,
    INTENT_SETTLEMENT_LEDGER_SCHEMA,
    INTENT_SETTLEMENT_SCHEMA,
    INTENT_PROOF_RECEIPT_SCHEMA,
    IntentProofError,
    createIntentRequirementLedger,
    validateIntentRequirementLedger,
    createIntentSettlementLedger,
    validateIntentSettlementLedger,
    intentBindingIdentity,
    createIntentProofReceipt,
    validateIntentProofReceipt,
    intentProofStatus,
  });
});
