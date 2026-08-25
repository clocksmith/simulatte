(function attachEarthVirginiaReference(root, factory) {
  const worldSpecApi = typeof module === 'object' && module.exports
    ? require('../../shared/contracts/world-spec.js')
    : root.SimulatteWorldSpec;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../shared/contracts/multiscale-contracts.js')
    : root.SimulatteMultiscaleContracts;
  const coordinatorApi = typeof module === 'object' && module.exports
    ? require('../../shared/core/simulation/multirate-coordinator.js')
    : root.SimulatteMultirateCoordinator;
  const residencyApi = typeof module === 'object' && module.exports
    ? require('../../shared/core/simulation/simulation-residency-manager.js')
    : root.SimulatteSimulationResidencyManager;
  const spatialApi = typeof module === 'object' && module.exports
    ? require('./world-tile-manager.js')
    : root.SimulatteWorldTileManager;
  const subseaApi = typeof module === 'object' && module.exports
    ? require('../../shared/plugins/subsea-network-global/multiscale-module.js')
    : root.SimulatteSubseaMultiscaleModule;
  const gpuApi = typeof module === 'object' && module.exports
    ? require('../../shared/plugins/gpu-supercluster/multiscale-modules.js')
    : root.SimulatteGpuMultiscaleModules;
  const api = factory(worldSpecApi, contracts, coordinatorApi, residencyApi, spatialApi, subseaApi, gpuApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteEarthVirginiaDatacenterReference = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createEarthVirginiaReferenceApi(
  worldSpecApi,
  contracts,
  coordinatorApi,
  residencyApi,
  spatialApi,
  subseaApi,
  gpuApi
) {
  const WORLD_ID = 'earth-virginia-datacenter-v1';
  const AUTHORITY = 'earth-virginia-reference-world/v1';

  function createReferenceWorld({ datasets, subseaConfig, gpuConfig, executionAdapter = null }) {
    const scenario = {
      scenarioId: 'atlantic-single-cut',
      capacityScenarioId: 'modeled-atlantic-capacity-v1',
      repairScenarioId: 'atlantic-repair-resources-v1',
      failedResourceIds: ['marea:spain'],
      excludedLandingIds: [],
      allocationPolicyId: 'proportional-fair',
      repairPolicyId: 'unmet-demand-first',
      repairResourceCount: 2,
      essentialServiceWeight: 3,
      seed: 'subsea-atlantic-001',
    };
    const subsea = subseaApi.createSubseaCapacityModule({
      datasets,
      config: subseaConfig,
      scenario,
      failureTimeSeconds: 3600,
      cadenceSeconds: 60,
    });
    const datacenter = gpuApi.createDatacenterModules({
      config: gpuConfig,
      baselineDeliveredGbps: subsea.reference.baseline.deliveredGbps,
      contractedCapacityGbps: 400,
      cadenceSeconds: 60,
      arrivalUtilization: 0.98,
    });
    const modules = [subsea.descriptor, ...datacenter.modules];
    const compositionGraph = createCompositionGraph();
    const renderProgram = createRenderProgram({
      deliveredCapacityMaximum: subsea.reference.baseline.deliveredGbps,
      wanCapacityMaximum: datacenter.reference.contractedCapacityGbps,
      throughputMaximum: datacenter.reference.maximumStepsPerHour,
    });
    contracts.validateWorldComposition(compositionGraph);
    const worldSpec = worldSpecApi.finalizeWorldSpec({
      id: WORLD_ID,
      templateId: 'recursive-multiscale-reference/v1',
      name: 'Earth and Virginia Datacenter Reference World',
      kind: 'recursive-multiscale-co-simulation',
      description: 'A governed Atlantic cable intervention causally constrains a Virginia datacenter training workload.',
      source: {
        schema: 'simulatte.worldSpecSource.v1',
        prompt: 'Model one Atlantic cable failure and its effect on one Virginia GPU datacenter.',
        compilerConfig: {
          schema: 'simulatte.recursiveReferenceCompilerConfig.v1',
          profile: WORLD_ID,
          failureTimeSeconds: 3600,
        },
      },
      authorship: {
        schema: 'simulatte.worldSpecAuthoring.v2',
        revision: 0,
        sources: [{ id: 'reference-program', authority: 'governedPack', label: 'Repository-governed reference composition' }],
        fieldProvenance: [],
        patches: [],
        reconciliations: [],
      },
      determinism: {
        schema: 'simulatte.worldSpecDeterminism.v1',
        requiredClasses: ['simulation-reproducible', 'replay-identified'],
        seed: null,
        simulationTolerance: 1e-9,
        pixelPolicy: null,
      },
      dependencies: {
        schema: 'simulatte.worldSpecDependencies.v1',
        governedPacks: [],
        plugins: [
          { id: 'subsea-network-global', version: '1.0.0' },
          { id: 'gpu-supercluster', version: '1.0.0' },
        ],
        assets: [],
      },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
      unsupportedRequirements: [],
      unresolvedAmbiguities: [],
      modules: modules.map((module) => module.id),
      objects: [
        { id: 'earth', kind: 'recursive-world-scope' },
        { id: 'virginia-datacenter', kind: 'recursive-world-scope' },
        { id: 'virginia-rack-01', kind: 'recursive-world-scope' },
        { id: 'virginia-node-0001', kind: 'recursive-world-scope' },
        { id: 'virginia-gpu-0001', kind: 'recursive-world-scope' },
      ],
      controls: [],
      params: {
        failureResourceId: 'marea:spain',
        failureTimeSeconds: 3600,
        virginiaContractedCapacityGbps: 400,
        idleGpuPowerFraction: 0.1,
        scheduledGpuPowerFloorFraction: 0.2,
        moduleImplementations: modules.map((module) => ({
          id: module.id,
          implementationId: module.implementationId,
          implementationHash: module.implementationHash,
        })),
        sourceScenarioIdentity: subsea.reference.scenarioIdentity,
      },
      compositionGraph,
      renderProgram,
      physicalSpec: {
        schema: 'simulatte.recursiveReferencePhysicalSpec.v1',
        claimBoundary: 'Deterministic modeled coupling under declared data, scheduler policy, and solver assumptions; not current network or datacenter operations.',
        causalObligations: [
          causalObligation('subsea-capacity-decreases', subseaApi.OUTPUT_PORT_ID, 'decreases'),
          causalObligation('wan-capacity-decreases', gpuApi.IDS.gatewayOutput, 'decreases'),
          causalObligation('scheduler-throughput-decreases', gpuApi.IDS.schedulerThroughputOutput, 'decreases'),
          causalObligation('cluster-power-decreases', gpuApi.IDS.clusterPowerOutput, 'decreases'),
          causalObligation('cluster-temperature-decreases', gpuApi.IDS.clusterTemperatureOutput, 'decreases'),
        ],
      },
    });

    const coordinator = coordinatorApi.createCoordinator({
      id: `${WORLD_ID}:serial`,
      worldSpecContentHash: worldSpec.contentHash,
      modules,
      ports: compositionGraph.ports,
      couplingPlan: compositionGraph.couplingPlan,
      initialPortValues: {
        [gpuApi.IDS.gatewayInput]: subsea.reference.baseline.deliveredGbps,
        [gpuApi.IDS.schedulerInput]: datacenter.reference.contractedCapacityGbps,
        [gpuApi.IDS.clusterRunnableInput]: 1,
        [gpuApi.IDS.clusterThroughputInput]: datacenter.reference.maximumStepsPerHour,
      },
      executionAdapter,
    });
    const simulationResidency = residencyApi.createManager({
      id: `${WORLD_ID}:simulation-residency`,
      worldSpecContentHash: worldSpec.contentHash,
      coordinator,
      scopes: compositionGraph.scopes,
      modules,
      ports: compositionGraph.ports,
      causalRequiredScopeIds: ['earth', 'virginia-datacenter'],
      fidelityPolicies: {
        'virginia-datacenter': {
          coarsenTransformationId: 'gpu-supercluster.rack-to-facility-aggregate/v1',
          refineTransformationId: 'gpu-supercluster.qualified-rack-sampling/v1',
          preservedQuantities: ['total IT power', 'total facility power', 'peak junction temperature', 'scheduler throughput'],
          discardedInformation: ['per-rack thermal distribution'],
          errorBounds: [{ quantity: 'declared facility aggregates', absolute: 0, relative: 0 }],
        },
      },
    });
    function createSpatialResidency({ representations, tileOptions }) {
      return spatialApi.createRecursiveSpatialResidencyManager({
        scopes: compositionGraph.scopes,
        representations,
        tileOptions,
        simulationResidencySnapshot: () => simulationResidency.snapshot(),
      });
    }
    return Object.freeze({
      worldSpec,
      coordinator,
      simulationResidency,
      createSpatialResidency,
      reference: deepFreeze({ subsea: subsea.reference, datacenter: datacenter.reference }),
    });
  }

  function createCompositionGraph() {
    const ports = [
      sampledPort(subseaApi.OUTPUT_PORT_ID, subseaApi.MODULE_ID, 'output', 'delivered network capacity', 'Gbps', 'data-rate', 0, null),
      sampledPort(gpuApi.IDS.gatewayInput, gpuApi.IDS.gatewayModule, 'input', 'delivered network capacity', 'Gbps', 'data-rate', 0, null),
      sampledPort(gpuApi.IDS.gatewayOutput, gpuApi.IDS.gatewayModule, 'output', 'available datacenter WAN capacity', 'Gbps', 'data-rate', 0, 400),
      sampledPort(gpuApi.IDS.schedulerInput, gpuApi.IDS.schedulerModule, 'input', 'available datacenter WAN capacity', 'Gbps', 'data-rate', 0, 400),
      sampledPort(gpuApi.IDS.schedulerRunnableOutput, gpuApi.IDS.schedulerModule, 'output', 'runnable workload fraction', 'ratio', 'dimensionless', 0, 1),
      sampledPort(gpuApi.IDS.schedulerThroughputOutput, gpuApi.IDS.schedulerModule, 'output', 'training scheduler throughput', 'steps/hour', 'frequency', 0, null),
      sampledPort(gpuApi.IDS.clusterRunnableInput, gpuApi.IDS.clusterModule, 'input', 'runnable workload fraction', 'ratio', 'dimensionless', 0, 1),
      sampledPort(gpuApi.IDS.clusterThroughputInput, gpuApi.IDS.clusterModule, 'input', 'training scheduler throughput', 'steps/hour', 'frequency', 0, null),
      sampledPort(gpuApi.IDS.clusterPowerOutput, gpuApi.IDS.clusterModule, 'output', 'cluster IT power', 'kW', 'power', 0, null),
      sampledPort(gpuApi.IDS.clusterFacilityPowerOutput, gpuApi.IDS.clusterModule, 'output', 'facility power', 'kW', 'power', 0, null),
      sampledPort(gpuApi.IDS.clusterTemperatureOutput, gpuApi.IDS.clusterModule, 'output', 'peak junction temperature', 'degC', 'temperature', -273.15, null),
    ];
    return deepFreeze({
      frames: [wgs84Frame(), earthFrame(), datacenterFrame(), rackFrame(), nodeFrame(), gpuFrame()],
      frameAdapters: [wgs84EcefAdapter()],
      scopes: [earthScope(), datacenterScope(), rackScope(), nodeScope(), gpuScope()],
      ports,
      couplingPlan: {
        schema: contracts.SCHEMAS.coupling,
        id: 'earth-virginia-coupling-plan-v1',
        edges: [
          coupling('subsea-to-wan', subseaApi.OUTPUT_PORT_ID, gpuApi.IDS.gatewayInput),
          coupling('wan-to-scheduler', gpuApi.IDS.gatewayOutput, gpuApi.IDS.schedulerInput),
          coupling('scheduler-runnable-to-cluster', gpuApi.IDS.schedulerRunnableOutput, gpuApi.IDS.clusterRunnableInput),
          coupling('scheduler-throughput-to-cluster', gpuApi.IDS.schedulerThroughputOutput, gpuApi.IDS.clusterThroughputInput),
        ],
        coupledSolvers: [],
      },
    });
  }

  function sampledPort(id, moduleInstanceId, direction, quantity, unit, dimension, minimum, maximum) {
    return {
      schema: contracts.SCHEMAS.port,
      id,
      moduleInstanceId,
      direction,
      kind: 'sampled-state',
      quantity,
      dataSchemaId: 'simulatte.scalarQuantity/v1',
      shape: [],
      unit,
      dimension,
      coordinateFrameId: null,
      cadence: { kind: 'fixed', intervalSeconds: 60 },
      timestampSemantics: 'sample-time',
      latencySeconds: 0,
      interpolationPolicy: 'hold',
      aggregationPolicy: 'last',
      uncertainty: { kind: 'none', unit: null, confidenceLevel: null },
      provenanceRequired: false,
      determinismClass: 'exact',
      authority: AUTHORITY,
      validRange: { minimum, maximum },
      missingDataBehavior: 'reject',
      backpressurePolicy: 'block',
    };
  }

  function coupling(id, sourcePortId, destinationPortId) {
    return {
      id,
      sourcePortId,
      destinationPortId,
      adapterId: null,
      communicationCadence: { kind: 'fixed', intervalSeconds: 60 },
      delaySeconds: 0,
      initializationRule: 'declared reference baseline',
      samplingPolicy: 'hold',
      errorPolicy: 'stop',
      convergencePolicyId: null,
      proofObligationIds: [`proof:${id}`],
    };
  }

  function createRenderProgram({ deliveredCapacityMaximum, wanCapacityMaximum, throughputMaximum }) {
    return deepFreeze({
      schema: 'simulatte.recursive-render-program/v1',
      representations: [
        {
          id: 'earth-subsea-network-aggregate',
          scopeId: 'earth',
          coordinateFrameId: 'earth-ecef-meters',
          fidelityLevelId: 'earth:declared-detail',
          primitives: [
            { id: 'earth-body', kind: 'sphere', center: [0, 0, 0], radius: 6371000, semanticRole: 'planet' },
            {
              id: 'marea-corridor',
              kind: 'polyline',
              points: [[1234095, -4820158, 3981168], [4068017, -160379, 4891530]],
              widthMeters: 18000,
              semanticRole: 'subsea-capacity-corridor',
            },
          ],
        },
        {
          id: 'virginia-datacenter-aggregate',
          scopeId: 'virginia-datacenter',
          coordinateFrameId: 'virginia-datacenter-local-meters',
          fidelityLevelId: 'virginia-datacenter:facility-aggregate',
          primitives: [{ id: 'facility-shell', kind: 'box', center: [0, 0, 12], size: [240, 160, 24], semanticRole: 'datacenter' }],
        },
        {
          id: 'virginia-rack-01-detail',
          scopeId: 'virginia-rack-01',
          coordinateFrameId: 'virginia-rack-01-local-meters',
          fidelityLevelId: 'virginia-rack-01:declared-detail',
          primitives: [{ id: 'rack-shell', kind: 'box', center: [0, 0, 1.1], size: [0.8, 1.2, 2.2], semanticRole: 'compute-rack' }],
        },
        {
          id: 'virginia-node-0001-detail',
          scopeId: 'virginia-node-0001',
          coordinateFrameId: 'virginia-node-0001-local-meters',
          fidelityLevelId: 'virginia-node-0001:declared-detail',
          primitives: [{ id: 'node-chassis', kind: 'box', center: [0, 0, 0], size: [0.5, 0.8, 0.16], semanticRole: 'compute-node' }],
        },
        {
          id: 'virginia-gpu-0001-detail',
          scopeId: 'virginia-gpu-0001',
          coordinateFrameId: 'virginia-gpu-0001-local-meters',
          fidelityLevelId: 'virginia-gpu-0001:declared-detail',
          primitives: [{ id: 'gpu-board', kind: 'box', center: [0, 0, 0], size: [0.3, 0.12, 0.04], semanticRole: 'gpu' }],
        },
      ],
      cameraTargets: [
        { id: 'earth', scopeId: 'earth', coordinateFrameId: 'earth-ecef-meters', position: [0, 0, 0], distanceMeters: 18000000 },
        { id: 'facility', scopeId: 'virginia-datacenter', coordinateFrameId: 'virginia-datacenter-local-meters', position: [0, 0, 12], distanceMeters: 600 },
        { id: 'rack', scopeId: 'virginia-rack-01', coordinateFrameId: 'virginia-rack-01-local-meters', position: [0, 0, 1.1], distanceMeters: 5 },
        { id: 'node', scopeId: 'virginia-node-0001', coordinateFrameId: 'virginia-node-0001-local-meters', position: [0, 0, 0], distanceMeters: 1.6 },
        { id: 'gpu', scopeId: 'virginia-gpu-0001', coordinateFrameId: 'virginia-gpu-0001-local-meters', position: [0, 0, 0], distanceMeters: 0.8 },
      ],
      stateBindings: [
        stateBinding('subsea-capacity', subseaApi.OUTPUT_PORT_ID, 'earth-subsea-network-aggregate', 'capacity', 'Gbps', 0, deliveredCapacityMaximum),
        stateBinding('datacenter-wan', gpuApi.IDS.gatewayOutput, 'virginia-datacenter-aggregate', 'wan-capacity', 'Gbps', 0, wanCapacityMaximum),
        stateBinding('scheduler-throughput', gpuApi.IDS.schedulerThroughputOutput, 'virginia-datacenter-aggregate', 'throughput', 'steps/hour', 0, throughputMaximum),
        stateBinding('cluster-it-power', gpuApi.IDS.clusterPowerOutput, 'virginia-node-0001-detail', 'it-power', 'kW', 0, null),
        stateBinding('cluster-facility-power', gpuApi.IDS.clusterFacilityPowerOutput, 'virginia-datacenter-aggregate', 'facility-power', 'kW', 0, null),
        stateBinding('cluster-temperature', gpuApi.IDS.clusterTemperatureOutput, 'virginia-gpu-0001-detail', 'temperature', 'degC', -273.15, null),
      ],
    });
  }

  function stateBinding(id, sourcePortId, representationId, visualChannel, unit, minimum, maximum) {
    return {
      id,
      sourcePortId,
      representationId,
      visualChannel,
      unit,
      mapping: { kind: 'linear-clamped-when-bounded', minimum, maximum },
      interpolationPolicy: 'hold',
    };
  }

  function causalObligation(id, sourcePortId, comparison) {
    return { id, sourcePortId, comparison, required: true };
  }

  function earthFrame() {
    return {
      schema: contracts.SCHEMAS.frame,
      id: 'earth-ecef-meters',
      axes: axes('meter'),
      handedness: 'right',
      origin: { kind: 'absolute', values: [0, 0, 0], referenceFrameId: null },
      epoch: null,
      precision: 0.01,
      bounds: { minimum: [-7000000, -7000000, -7000000], maximum: [7000000, 7000000, 7000000] },
      transformToParent: null,
    };
  }

  function wgs84Frame() {
    return {
      schema: contracts.SCHEMAS.frame,
      id: 'earth-wgs84',
      axes: [
        { id: 'latitude', unit: 'degree', direction: 'positive' },
        { id: 'longitude', unit: 'degree', direction: 'positive' },
        { id: 'height', unit: 'meter', direction: 'positive' },
      ],
      handedness: 'not-applicable',
      origin: { kind: 'absolute', values: [0, 0, 0], referenceFrameId: null },
      epoch: 'WGS84',
      precision: 0.0000001,
      bounds: { minimum: [-90, -180, -12000], maximum: [90, 180, 1000000] },
      transformToParent: null,
    };
  }

  function wgs84EcefAdapter() {
    return {
      id: 'earth-wgs84-to-ecef-v1',
      sourceFrameId: 'earth-wgs84',
      destinationFrameId: 'earth-ecef-meters',
      method: 'wgs84-ecef',
      direction: 'bidirectional',
      parameters: { semiMajorAxisMeters: 6378137, inverseFlattening: 298.257223563 },
      authority: 'simulatte.coordinate-frame-adapter/wgs84-v1',
    };
  }

  function datacenterFrame() {
    const translation = contracts.transformCoordinate(wgs84EcefAdapter(), [39.0438, -77.4874, 100]);
    return {
      schema: contracts.SCHEMAS.frame,
      id: 'virginia-datacenter-local-meters',
      axes: axes('meter'),
      handedness: 'right',
      origin: { kind: 'reference', values: [0, 0, 0], referenceFrameId: 'earth-ecef-meters' },
      epoch: null,
      precision: 0.001,
      bounds: { minimum: [-1000, -1000, -100], maximum: [1000, 1000, 300] },
      transformToParent: {
        parentFrameId: 'earth-ecef-meters',
        translation,
        rotationQuaternion: [0, 0, 0, 1],
        scale: 1,
      },
    };
  }

  function rackFrame() {
    return childFrame({
      id: 'virginia-rack-01-local-meters',
      parentFrameId: 'virginia-datacenter-local-meters',
      translation: [0, 0, 0],
      precision: 0.0001,
      bounds: { minimum: [-2, -2, 0], maximum: [2, 2, 3] },
    });
  }

  function gpuFrame() {
    return childFrame({
      id: 'virginia-gpu-0001-local-meters',
      parentFrameId: 'virginia-node-0001-local-meters',
      translation: [0, 0, 0],
      precision: 0.00001,
      bounds: { minimum: [-0.5, -0.5, -0.2], maximum: [0.5, 0.5, 0.2] },
    });
  }

  function nodeFrame() {
    return childFrame({
      id: 'virginia-node-0001-local-meters',
      parentFrameId: 'virginia-rack-01-local-meters',
      translation: [0, 0, 1.1],
      precision: 0.00001,
      bounds: { minimum: [-0.6, -0.9, -0.3], maximum: [0.6, 0.9, 0.3] },
    });
  }

  function childFrame({ id, parentFrameId, translation, precision, bounds }) {
    return {
      schema: contracts.SCHEMAS.frame,
      id,
      axes: axes('meter'),
      handedness: 'right',
      origin: { kind: 'reference', values: [0, 0, 0], referenceFrameId: parentFrameId },
      epoch: null,
      precision,
      bounds,
      transformToParent: {
        parentFrameId,
        translation,
        rotationQuaternion: [0, 0, 0, 1],
        scale: 1,
      },
    };
  }

  function axes(unit) {
    return [
      { id: 'x', unit, direction: 'positive' },
      { id: 'y', unit, direction: 'positive' },
      { id: 'z', unit, direction: 'positive' },
    ];
  }

  function earthScope() {
    return scope({
      id: 'earth',
      parentScopeId: null,
      coordinateFrameId: 'earth-ecef-meters',
      bounds: { minimum: [-7000000, -7000000, -7000000], maximum: [7000000, 7000000, 7000000] },
      childScopeIds: ['virginia-datacenter'],
      moduleInstanceIds: [subseaApi.MODULE_ID],
      renderRepresentationIds: ['earth-subsea-network-aggregate'],
      fidelityLevels: [{ id: 'earth:declared-detail', modelId: 'earth:current-model', rank: 1 }],
      residencyStates: ['active'],
    });
  }

  function datacenterScope() {
    return scope({
      id: 'virginia-datacenter',
      parentScopeId: 'earth',
      coordinateFrameId: 'virginia-datacenter-local-meters',
      bounds: { minimum: [-1000, -1000, -100], maximum: [1000, 1000, 300] },
      childScopeIds: ['virginia-rack-01'],
      moduleInstanceIds: [gpuApi.IDS.gatewayModule, gpuApi.IDS.schedulerModule, gpuApi.IDS.clusterModule],
      renderRepresentationIds: ['virginia-datacenter-aggregate'],
      fidelityLevels: [
        { id: 'virginia-datacenter:facility-aggregate', modelId: 'gpu-supercluster.facility-aggregate/v1', rank: 0 },
        { id: 'virginia-datacenter:declared-detail', modelId: 'gpu-supercluster.rack-detail/v1', rank: 1 },
      ],
      residencyStates: ['dormant', 'checkpointed', 'aggregate', 'active', 'refining'],
    });
  }

  function rackScope() {
    return scope({
      id: 'virginia-rack-01',
      parentScopeId: 'virginia-datacenter',
      coordinateFrameId: 'virginia-rack-01-local-meters',
      bounds: { minimum: [-2, -2, 0], maximum: [2, 2, 3] },
      childScopeIds: ['virginia-node-0001'],
      moduleInstanceIds: [],
      renderRepresentationIds: ['virginia-rack-01-detail'],
      fidelityLevels: [{ id: 'virginia-rack-01:declared-detail', modelId: 'gpu-supercluster.rack-detail/v1', rank: 1 }],
      residencyStates: ['dormant', 'checkpointed', 'aggregate', 'active', 'refining'],
    });
  }

  function nodeScope() {
    return scope({
      id: 'virginia-node-0001',
      parentScopeId: 'virginia-rack-01',
      coordinateFrameId: 'virginia-node-0001-local-meters',
      bounds: { minimum: [-0.6, -0.9, -0.3], maximum: [0.6, 0.9, 0.3] },
      childScopeIds: ['virginia-gpu-0001'],
      moduleInstanceIds: [],
      renderRepresentationIds: ['virginia-node-0001-detail'],
      fidelityLevels: [{ id: 'virginia-node-0001:declared-detail', modelId: 'gpu-supercluster.node-detail/v1', rank: 1 }],
      residencyStates: ['dormant', 'checkpointed', 'aggregate', 'active', 'refining'],
    });
  }

  function gpuScope() {
    return scope({
      id: 'virginia-gpu-0001',
      parentScopeId: 'virginia-node-0001',
      coordinateFrameId: 'virginia-gpu-0001-local-meters',
      bounds: { minimum: [-0.5, -0.5, -0.2], maximum: [0.5, 0.5, 0.2] },
      childScopeIds: [],
      moduleInstanceIds: [],
      renderRepresentationIds: ['virginia-gpu-0001-detail'],
      fidelityLevels: [{ id: 'virginia-gpu-0001:declared-detail', modelId: 'gpu-supercluster.gpu-detail/v1', rank: 1 }],
      residencyStates: ['dormant', 'checkpointed', 'aggregate', 'active', 'refining'],
    });
  }

  function scope({ id, parentScopeId, coordinateFrameId, bounds, childScopeIds, moduleInstanceIds, renderRepresentationIds, fidelityLevels, residencyStates }) {
    return {
      schema: contracts.SCHEMAS.scope,
      id,
      parentScopeId,
      coordinateFrameId,
      spatialBounds: { kind: 'axis-aligned-box', ...bounds },
      temporalDomain: { startTime: 0, endTime: 720 * 3600, timeUnit: 'second' },
      childScopeIds,
      moduleInstanceIds,
      stateOwnerModuleIds: [...moduleInstanceIds],
      availableFidelityLevels: fidelityLevels,
      simulationResidencyPolicy: { allowedStates: residencyStates, defaultState: 'active' },
      spatialResidencyPolicy: { allowedStates: ['absent', 'requested', 'staged', 'resident', 'pinned', 'evicting'], defaultState: 'absent' },
      renderRepresentationIds,
      controlIds: [],
      proofObligationIds: [`proof:${id}:causal-state`],
    };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ WORLD_ID, createCompositionGraph, createReferenceWorld });
});
