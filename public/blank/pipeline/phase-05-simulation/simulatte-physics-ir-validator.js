(function attachSimulattePhysicsIRValidator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsIRValidator = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsIRValidatorApi() {
  const VALIDATION_RECEIPT_SCHEMA = 'simulatte.validationReceipt.v1';

  const OPERATOR_CONTRACTS = Object.freeze({
    heat_source: contract([], ['temperature'], ['thermal']),
    heat_transfer: contract(['temperature'], ['temperature'], ['thermal']),
    advection: contract(['flowVelocity'], ['flowVelocity'], ['fluid']),
    diffusion: contract([], [], ['field']),
    phase_transition: contract(['temperature', 'liquidFraction'], ['liquidFraction'], ['phase']),
    rotational_torque: contract(['flowVelocity', 'angularVelocity'], ['angularVelocity', 'angle'], ['rigidBody']),
    rigid_collision: contract([], ['stress', 'damage'], ['rigidBody', 'solid']),
    fracture_threshold: contract(['stress', 'damage'], ['damage'], ['solid']),
    pressure_flow_lite: contract(['pressure'], ['flowVelocity'], ['fluid']),
    wave_field: contract(['phase', 'amplitude'], ['phase', 'amplitude'], ['field']),
    reaction_diffusion: contract(['reactionProgress'], ['reactionProgress'], ['field']),
    network_flow: contract(['backlog', 'throughput'], ['backlog', 'throughput'], ['network']),
    oscillator: contract(['phase', 'amplitude'], ['phase', 'amplitude'], ['field']),
    growth_decay: contract(['density', 'nutrient'], ['density', 'nutrient'], ['field']),
    particle_deposition: contract(['airborneDensity', 'depositedMass'], ['airborneDensity', 'depositedMass'], ['rigidBody', 'solid', 'fluid', 'field']),
    derive_readout: contract([], [], ['field']),
  });

  function contract(reads, writes, domainKinds) {
    return { reads, writes, domainKinds };
  }

  function validatePhysicsIR(ir = {}) {
    const fields = Array.isArray(ir.stateFields) ? ir.stateFields : [];
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const domainById = new Map((ir.domains || []).map((domain) => [domain.id, domain]));
    const receipt = mergeReceipt(ir.receipt);
    const warnings = [];
    const errors = [];
    const repaired = [];
    const ownedFields = new Set();

    for (const unresolved of receipt.unresolved) {
      if (!unresolved.reason) unresolved.reason = 'not grounded';
    }

    for (const operator of ir.operators || []) {
      const operatorType = operator.type || '';
      const operatorContract = OPERATOR_CONTRACTS[operatorType];
      const domain = domainById.get(operator.domainId);
      if (!operatorContract) {
        addUnsupported(receipt, operator.id, 'operator is not registered', 'static render binding');
        errors.push(`unsupported operator ${operatorType}`);
        continue;
      }
      if (!domain) {
        addUnsupported(receipt, operator.id, 'operator domain is missing', 'operator skipped');
        errors.push(`missing domain ${operator.domainId}`);
        continue;
      }
      if (!compatibleDomain(domain, operatorContract.domainKinds)) {
        receipt.approximate.push({
          promptSpan: operator.id,
          reason: `operator ${operatorType} runs on ${domain.kind} with adapter semantics`,
        });
      }
      for (const fieldId of operator.reads || operator.inputs || []) {
        if (!fieldById.has(fieldId)) {
          addUnsupported(receipt, fieldId, `missing input for ${operatorType}`, 'operator receives neutral value');
          warnings.push(`missing input ${fieldId}`);
        }
      }
      for (const fieldId of operator.writes || operator.outputs || []) {
        const field = fieldById.get(fieldId);
        if (!field) {
          addUnsupported(receipt, fieldId, `missing output for ${operatorType}`, 'operator output ignored');
          warnings.push(`missing output ${fieldId}`);
        } else {
          ownedFields.add(fieldId);
        }
      }
      validateUnits(operator, fieldById, receipt, warnings);
    }

    for (const field of fields) {
      if (isDerivedOnly(field.name)) continue;
      if (!ownedFields.has(field.id) && shouldHaveOwner(field)) {
        receipt.approximate.push({
          promptSpan: field.id,
          reason: 'field is initialized and read but not directly written by a solver',
        });
      }
    }

    for (const domain of ir.domains || []) {
      const hasBoundary = (ir.boundaryConditions || []).some((row) => row.domainId === domain.id);
      if (!hasBoundary) {
        repaired.push({ domainId: domain.id, repair: 'default closed normalized-canvas boundary' });
      }
    }

    const status = errors.length ? 'invalid' : repaired.length || warnings.length ? 'repaired' : 'valid';
    return {
      schema: VALIDATION_RECEIPT_SCHEMA,
      status,
      exact: receipt.exact,
      approximate: receipt.approximate,
      unresolved: receipt.unresolved,
      unsupported: receipt.unsupported,
      warnings,
      errors,
      repairs: repaired,
      metrics: {
        entities: (ir.entities || []).length,
        domains: (ir.domains || []).length,
        fields: fields.length,
        operators: (ir.operators || []).length,
        couplings: (ir.couplings || []).length,
      },
    };
  }

  function validateUnits(operator, fieldById, receipt, warnings) {
    if (operator.type !== 'rotational_torque') return;
    const angularOut = (operator.outputs || []).find((fieldId) => /^angularVelocity:/.test(fieldId));
    const flowIn = (operator.inputs || []).find((fieldId) => /^flowVelocity:/.test(fieldId));
    if (!angularOut || !flowIn) return;
    const flow = fieldById.get(flowIn);
    const angular = fieldById.get(angularOut);
    if (!flow || !angular) return;
    if (flow.units !== 'm/s' || angular.units !== 'rad/s') {
      warnings.push(`unit adapter inserted for ${operator.id}`);
      receipt.approximate.push({
        promptSpan: operator.id,
        reason: 'velocity is converted to angular velocity through turbine coupling parameter',
      });
    }
  }

  function compatibleDomain(domain, kinds) {
    if (!kinds || !kinds.length) return true;
    if (kinds.includes(domain.kind)) return true;
    return kinds.some((kind) => (domain.tags || []).includes(kind));
  }

  function shouldHaveOwner(field) {
    return !['position', 'velocity', 'force', 'torque', 'stress'].includes(field.name);
  }

  function isDerivedOnly(name) {
    return ['position', 'force', 'torque', 'stress'].includes(name);
  }

  function mergeReceipt(receipt = {}) {
    return {
      exact: cloneRows(receipt.exact),
      approximate: cloneRows(receipt.approximate),
      unresolved: cloneRows(receipt.unresolved),
      unsupported: cloneRows(receipt.unsupported),
    };
  }

  function cloneRows(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  }

  function addUnsupported(receipt, promptSpan, reason, fallback) {
    if (receipt.unsupported.some((row) => row.promptSpan === promptSpan && row.reason === reason)) return;
    receipt.unsupported.push({ promptSpan, reason, fallback });
  }

  return {
    VALIDATION_RECEIPT_SCHEMA,
    OPERATOR_CONTRACTS,
    validatePhysicsIR,
  };
});
