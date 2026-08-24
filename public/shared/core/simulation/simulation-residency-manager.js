(function attachSimulationResidencyManager(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../contracts/multiscale-contracts.js')
    : root.SimulatteMultiscaleContracts;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(contracts, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSimulationResidencyManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulationResidencyManagerApi(contracts, nodeCrypto) {
  const STATES = Object.freeze(['dormant', 'checkpointed', 'aggregate', 'active', 'refining']);

  function createManager(configuration) {
    const {
      id,
      worldSpecContentHash,
      coordinator: initialCoordinator,
      scopes,
      modules,
      ports,
      causalRequiredScopeIds = [],
      fidelityPolicies = {},
    } = configuration || {};
    requireString(id, 'id');
    requireString(worldSpecContentHash, 'worldSpecContentHash');
    if (!initialCoordinator?.snapshot || !initialCoordinator?.setModuleActive) fail('simulation_residency_coordinator_invalid', 'A residency-aware coordinator is required');
    const scopeById = new Map(scopes.map((scope) => [scope.id, scope]));
    const moduleById = new Map(modules.map((module) => [module.id, module]));
    const portById = new Map(ports.map((port) => [port.id, port]));
    const causal = new Set(causalRequiredScopeIds);
    const stateByScope = new Map(scopes.map((scope) => [scope.id, {
      state: scope.simulationResidencyPolicy.defaultState,
      fidelityLevelId: highestFidelity(scope).id,
      visible: true,
      causallyRequired: causal.has(scope.id),
    }]));
    const fullCheckpoints = new Map();
    const scopeCheckpoints = new Map();
    let coordinator = initialCoordinator;
    let ledger = [];

    async function initialize() {
      await coordinator.initialize();
      return snapshot();
    }

    async function runUntil(targetTime) {
      assertCausalScopesAdvancing();
      await coordinator.runUntil(targetTime);
      return snapshot();
    }

    function setInterest({ scopeId, visible, authority }) {
      const scopeState = requireScopeState(scopeId);
      if (typeof visible !== 'boolean') fail('simulation_residency_visibility_invalid', 'visible must be boolean');
      requireString(authority, 'authority');
      scopeState.visible = visible;
      append('interest-observed', scopeId, authority, { visible });
      return snapshot();
    }

    function setCausalRequirement({ scopeId, required, authority, horizon }) {
      const scopeState = requireScopeState(scopeId);
      if (typeof required !== 'boolean') fail('simulation_residency_causality_invalid', 'required must be boolean');
      requireString(authority, 'authority');
      requireString(horizon, 'horizon');
      scopeState.causallyRequired = required;
      append('causal-requirement-changed', scopeId, authority, { required, horizon });
      return snapshot();
    }

    async function checkpointScope({ scopeId, checkpointId, authority }) {
      const scope = requireScope(scopeId);
      const scopeState = requireScopeState(scopeId);
      requireString(checkpointId, 'checkpointId');
      requireString(authority, 'authority');
      assertAllowed(scope, 'checkpointed');
      assertSafeBoundary();
      if (scopeState.causallyRequired) fail('simulation_residency_causal_suspend_forbidden', `Causally required scope ${scopeId} cannot be checkpointed`);
      const full = await coordinator.checkpoint(`${checkpointId}:coordinator`);
      const scoped = await createScopeCheckpoint(scope, full, checkpointId, scopeState.fidelityLevelId);
      fullCheckpoints.set(checkpointId, full);
      scopeCheckpoints.set(checkpointId, scoped);
      coordinator.setModuleActive(scope.moduleInstanceIds, false, `scope-checkpoint:${checkpointId}`);
      scopeState.state = 'checkpointed';
      append('scope-checkpointed', scopeId, authority, { checkpointId, checkpointContentHash: scoped.contentHash });
      return scoped;
    }

    async function restoreScope({ scopeId, checkpointId, authority }) {
      const scopeState = requireScopeState(scopeId);
      const scoped = scopeCheckpoints.get(checkpointId);
      const full = fullCheckpoints.get(checkpointId);
      requireString(authority, 'authority');
      if (!scoped || !full || scoped.scopeId !== scopeId) fail('simulation_residency_checkpoint_unknown', `Unknown checkpoint ${checkpointId} for ${scopeId}`);
      assertSafeBoundary();
      const currentTime = coordinator.snapshot().logicalTime;
      if (currentTime !== full.logicalTime) {
        fail('simulation_residency_checkpoint_rejoin_requires_branch', `Exact checkpoint ${checkpointId} is at ${full.logicalTime}, not current time ${currentTime}`);
      }
      const sourceHash = await scopeStateHash(scopeId);
      await coordinator.restore(full);
      scopeState.state = 'active';
      const transition = fidelityTransition({
        scopeId,
        sourceModelId: modelFor(scopeId, scopeState.fidelityLevelId),
        targetModelId: modelFor(scopeId, scoped.fidelityLevels[0].fidelityLevelId),
        sourceStateHash: sourceHash,
        resultStateHash: await scopeStateHash(scopeId),
        method: 'exact-checkpoint',
        initializationMethod: `scope-checkpoint:${checkpointId}`,
        continuityClaim: 'exact',
      });
      scopeState.fidelityLevelId = scoped.fidelityLevels[0].fidelityLevelId;
      append('scope-restored', scopeId, authority, { checkpointId, transition });
      return transition;
    }

    async function aggregateScope({ scopeId, targetFidelityLevelId, authority }) {
      const scope = requireScope(scopeId);
      const scopeState = requireScopeState(scopeId);
      requireString(authority, 'authority');
      assertAllowed(scope, 'aggregate');
      assertSafeBoundary();
      const target = requireFidelity(scope, targetFidelityLevelId);
      const sourceHash = await scopeStateHash(scopeId);
      const sourceModelId = modelFor(scopeId, scopeState.fidelityLevelId);
      await coordinator.aggregate(scope.moduleInstanceIds, { scopeId, targetFidelityLevelId });
      const policy = requireFidelityPolicy(scopeId);
      const transition = fidelityTransition({
        scopeId,
        sourceModelId,
        targetModelId: target.modelId,
        sourceStateHash: sourceHash,
        resultStateHash: await scopeStateHash(scopeId),
        method: 'coarsen',
        transformationId: policy.coarsenTransformationId,
        preservedQuantities: policy.preservedQuantities,
        discardedInformation: policy.discardedInformation,
        errorBounds: policy.errorBounds,
        initializationMethod: policy.coarsenTransformationId,
        continuityClaim: 'lossy',
      });
      scopeState.state = 'aggregate';
      scopeState.fidelityLevelId = targetFidelityLevelId;
      append('scope-aggregated', scopeId, authority, { transition });
      return transition;
    }

    async function refineScope({ scopeId, targetFidelityLevelId, authority, branchId }) {
      const scope = requireScope(scopeId);
      const scopeState = requireScopeState(scopeId);
      requireString(authority, 'authority');
      requireString(branchId, 'branchId');
      assertAllowed(scope, 'refining');
      assertSafeBoundary();
      if (scopeState.state !== 'aggregate') fail('simulation_residency_refine_source_invalid', `Scope ${scopeId} must be aggregate before qualified refinement`);
      const target = requireFidelity(scope, targetFidelityLevelId);
      const sourceHash = await scopeStateHash(scopeId);
      const sourceModelId = modelFor(scopeId, scopeState.fidelityLevelId);
      scopeState.state = 'refining';
      append('scope-refining', scopeId, authority, { branchId, targetFidelityLevelId });
      const branchCheckpoint = await coordinator.checkpoint(`${id}:${branchId}:source`);
      const child = await coordinator.branch({ id: branchId, checkpoint: branchCheckpoint });
      await child.refine(scope.moduleInstanceIds, { scopeId, targetFidelityLevelId, branchId, method: 'qualified-sampling' });
      coordinator = child;
      const policy = requireFidelityPolicy(scopeId);
      const transition = fidelityTransition({
        scopeId,
        sourceModelId,
        targetModelId: target.modelId,
        sourceStateHash: sourceHash,
        resultStateHash: await scopeStateHash(scopeId),
        method: 'qualified-sampling',
        transformationId: policy.refineTransformationId,
        preservedQuantities: policy.preservedQuantities,
        initializationMethod: policy.refineTransformationId,
        continuityClaim: 'qualified-branch',
        branchId,
      });
      scopeState.state = 'active';
      scopeState.fidelityLevelId = targetFidelityLevelId;
      append('scope-refined', scopeId, authority, { transition });
      return transition;
    }

    async function createScopeCheckpoint(scope, full, checkpointId, fidelityLevelId) {
      const moduleIds = new Set(scope.moduleInstanceIds);
      const moduleImplementations = await Promise.all(scope.moduleInstanceIds.map(async (moduleInstanceId) => {
        const module = moduleById.get(moduleInstanceId);
        return {
          moduleInstanceId,
          implementationId: module.implementationId,
          implementationHash: await sha256({ implementationId: module.implementationId, declaredImplementationHash: module.implementationHash }),
          determinismClass: 'exact',
        };
      }));
      const moduleStates = await Promise.all(scope.moduleInstanceIds.map(async (moduleInstanceId) => ({
        moduleInstanceId,
        stateHash: await sha256(full.states[moduleInstanceId]),
        state: clone(full.states[moduleInstanceId]),
      })));
      const portBuffers = await Promise.all(Object.entries(full.inputBuffers)
        .filter(([portId]) => moduleIds.has(portById.get(portId)?.moduleInstanceId))
        .map(async ([portId, row]) => ({ portId, valueHash: await sha256(row.value), timestamp: row.timestamp, value: clone(row.value) })));
      const value = {
        schema: contracts.SCHEMAS.checkpoint,
        id: checkpointId,
        contentHash: `sha256:${'0'.repeat(64)}`,
        worldSpecContentHash,
        scopeId: scope.id,
        logicalTime: full.logicalTime,
        compatibilityVersion: '1',
        sourceCheckpointId: null,
        moduleImplementations,
        moduleStates,
        reconstructionReferences: [],
        pendingEvents: full.pendingControls.filter((row) => row.targetModuleIds.some((moduleId) => moduleIds.has(moduleId))).map(clone),
        portBuffers,
        couplingState: { coordinatorCheckpointId: full.id, pendingDeliveryCount: full.pendingDeliveries.length },
        fidelityLevels: [{ scopeId: scope.id, fidelityLevelId }],
        omittedScopes: scopes.filter((row) => row.id !== scope.id).map((row) => ({ scopeId: row.id, policy: 'exact-checkpoint', referenceId: full.id })),
      };
      value.contentHash = await sha256({ ...value, contentHash: null });
      return deepFreeze(contracts.validateScopeCheckpoint(value));
    }

    function fidelityTransition(options) {
      const value = {
        schema: contracts.SCHEMAS.fidelity,
        id: `${id}:fidelity:${ledger.length + 1}`,
        scopeId: options.scopeId,
        logicalTime: coordinator.snapshot().logicalTime,
        sourceModelId: options.sourceModelId,
        targetModelId: options.targetModelId,
        sourceStateHash: options.sourceStateHash,
        method: options.method,
        transformationId: options.transformationId || options.initializationMethod,
        preservedQuantities: options.preservedQuantities || [],
        discardedInformation: options.discardedInformation || [],
        errorBounds: options.errorBounds || [],
        initializationMethod: options.initializationMethod,
        causalFrontier: requireScope(options.scopeId).moduleInstanceIds,
        resultStateHash: options.resultStateHash,
        continuityClaim: options.continuityClaim,
        branchId: options.branchId || null,
      };
      return deepFreeze(contracts.validateFidelityTransition(value));
    }

    function snapshot() {
      return deepFreeze({
        id,
        coordinator: coordinator.snapshot(),
        scopes: Object.fromEntries([...stateByScope.entries()].map(([scopeId, state]) => [scopeId, clone(state)])),
        ledgerLength: ledger.length,
      });
    }

    function getLedger() { return deepFreeze(ledger.map(clone)); }
    function getCoordinator() { return coordinator; }
    function getScopeCheckpoint(checkpointId) { return scopeCheckpoints.get(checkpointId) || null; }

    function assertCausalScopesAdvancing() {
      stateByScope.forEach((state, scopeId) => {
        if (state.causallyRequired && ['dormant', 'checkpointed'].includes(state.state)) {
          fail('simulation_residency_causal_scope_inactive', `Causally required scope ${scopeId} is ${state.state}`);
        }
      });
    }

    function assertSafeBoundary() {
      if (!coordinator.snapshot().safeBoundary) fail('simulation_residency_boundary_unsafe', 'Residency transitions require a settled coordinator boundary');
    }

    function requireScope(scopeId) {
      const scope = scopeById.get(scopeId);
      if (!scope) fail('simulation_residency_scope_unknown', `Unknown scope ${scopeId}`);
      return scope;
    }
    function requireScopeState(scopeId) { requireScope(scopeId); return stateByScope.get(scopeId); }
    function requireFidelity(scope, fidelityLevelId) {
      const level = scope.availableFidelityLevels.find((row) => row.id === fidelityLevelId);
      if (!level) fail('simulation_residency_fidelity_unknown', `Unknown fidelity ${fidelityLevelId} for ${scope.id}`);
      return level;
    }
    function modelFor(scopeId, fidelityLevelId) { return requireFidelity(requireScope(scopeId), fidelityLevelId).modelId; }
    function requireFidelityPolicy(scopeId) {
      const policy = fidelityPolicies[scopeId];
      if (!policy) fail('simulation_residency_fidelity_policy_missing', `No fidelity policy for ${scopeId}`);
      return policy;
    }
    function assertAllowed(scope, state) {
      if (!STATES.includes(state) || !scope.simulationResidencyPolicy.allowedStates.includes(state)) fail('simulation_residency_state_forbidden', `${scope.id} does not admit ${state}`);
    }
    function highestFidelity(scope) { return [...scope.availableFidelityLevels].sort((left, right) => right.rank - left.rank)[0]; }
    async function scopeStateHash(scopeId) {
      const scope = requireScope(scopeId);
      const hashes = coordinator.snapshot().moduleStateHashes;
      return sha256(Object.fromEntries(scope.moduleInstanceIds.map((moduleId) => [moduleId, hashes[moduleId]])));
    }
    function append(kind, scopeId, authority, detail) {
      const entry = { schema: 'simulatte.simulation-residency-event/v1', id: `${id}:event:${ledger.length + 1}`, sequence: ledger.length + 1, kind, scopeId, authority, logicalTime: coordinator.snapshot().logicalTime, detail: clone(detail) };
      entry.contentHash = hash(entry);
      ledger.push(deepFreeze(entry));
    }

    return Object.freeze({ aggregateScope, checkpointScope, getCoordinator, getLedger, getScopeCheckpoint, initialize, refineScope, restoreScope, runUntil, setCausalRequirement, setInterest, snapshot });
  }

  function hash(value) {
    const text = canonical(value);
    let result = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) { result ^= text.charCodeAt(index); result = Math.imul(result, 0x01000193); }
    return `fnv1a32:${(result >>> 0).toString(16).padStart(8, '0')}`;
  }
  async function sha256(value) {
    const text = canonical(value);
    if (nodeCrypto) return `sha256:${nodeCrypto.createHash('sha256').update(text).digest('hex')}`;
    if (!globalThis.crypto?.subtle) fail('simulation_residency_sha256_unavailable', 'SHA-256 is required for contract-bound residency records');
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function requireString(value, label) { if (typeof value !== 'string' || !value.length) fail('simulation_residency_string_invalid', `${label} must be a non-empty string`); }
  function fail(code, message) { const error = new Error(`${code}: ${message}`); error.name = 'SimulatteSimulationResidencyError'; error.code = code; throw error; }
  function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }

  return Object.freeze({ STATES, createManager });
});
