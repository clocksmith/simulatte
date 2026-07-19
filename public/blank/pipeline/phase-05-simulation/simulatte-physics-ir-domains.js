(function attachSimulattePhysicsIRSupport(root) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const languageLexicon = typeof module === 'object' && module.exports
    ? require('../../../data/simulatte-language-lexicon.js')
    : root.SimulatteLanguageLexicon;
  const operatorStage = typeof module === 'object' && module.exports
    ? require('./simulatte-operator-stage.js')
    : root.SimulatteOperatorStage;
  if (!catalog || !languageLexicon || !operatorStage) {
    throw new Error('SimulattePhysicsIRSupport requires catalog, language lexicon, and operator stage');
  }

  const PHYSICAL_IR_SCHEMA = 'simulatte.physicalIR.v1';
  const SCENE_COMPOSITION_LEDGER_SCHEMA = 'simulatte.sceneCompositionLedger.v1';
  const TAU = Math.PI * 2;
  const {
    clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
    clamp01 = (value) => Math.max(0, Math.min(1, value)),
    slugify = defaultSlugify,
    uniqueList = unique,
  } = catalog;
  const DOMAIN_KIND_BY_HINT = Object.freeze({
    fluid: 'fluid',
    thermal: 'field',
    phase: 'solid',
    solid: 'solid',
    fracture: 'solid',
    rigidBody: 'rigidBody',
    collision: 'rigidBody',
    rotationalMechanics: 'rigidBody',
    particles: 'particleSet',
    field: 'field',
    wave: 'field',
    oscillator: 'field',
    network: 'network',
    control: 'network',
    growth: 'field',
    terrain: 'solid',
    reaction: 'field',
    water: 'fluid',
    lake: 'fluid',
    pool: 'fluid',
    pond: 'fluid',
    river: 'fluid',
    ocean: 'fluid',
    beach: 'fluid',
  });

    function readoutsForIR(fields, operators, observables) {
        const readouts = [];
        for (const observable of observables || []) {
          const field = fields.find((row) => row.name === observable.channel || row.id.startsWith(`${observable.channel}:`));
          readouts.push({ label: observable.label, channel: field ? field.id : observable.channel, source: 'prompt-observable' });
        }
        for (const name of ['angularVelocity', 'temperature', 'damage', 'liquidFraction', 'backlog', 'throughput']) {
          const field = fields.find((row) => row.name === name);
          if (field && !readouts.some((row) => row.channel === field.id)) {
            readouts.push({ label: name, channel: field.id, source: 'compiler-default' });
          }
        }
        if (!readouts.length && operators.length) {
          readouts.push({ label: 'activity', channel: operators[0].outputs[0] || operators[0].id, source: 'compiler-default' });
        }
        return readouts.slice(0, 8);
      }

    function materialTemperature(material, params) {
        if (material === 'lava' || material === 'fire') return clamp(Number(params.temperature || 0.92), 0, 2);
        if (material === 'ice') return clamp(Number(params.temperature || 0.14), 0, 1);
        if (material === 'water') return clamp(Number(params.temperature || 0.36), 0, 1);
        return clamp(Number(params.temperature || params.thermalFlux || 0.38), 0, 1.4);
      }

    function materialHeatStrength(material, params) {
        if (material === 'lava') return clamp(Number(params.heatTransfer || 1.05), 0.1, 2);
        if (material === 'fire') return clamp(Number(params.combustibility || 0.86), 0.1, 2);
        return clamp(Number(params.heatTransfer || 0.38), 0.05, 1.4);
      }

    function materialMeltPoint(material) {
        if (material === 'ice') return 0.32;
        if (material === 'metal') return 1.6;
        if (material === 'rock') return 1.1;
        return 0.56;
      }

    function materialViscosity(material) {
        if (material === 'lava') return 0.82;
        if (material === 'water') return 0.18;
        if (material === 'air') return 0.04;
        return 0.34;
      }

    function materialDensity(material) {
        if (material === 'metal') return 1.1;
        if (material === 'rock') return 1.3;
        if (material === 'wood') return 0.62;
        return 0.86;
      }

    function materialFromDomains(domains) {
        const text = (domains || []).join(' ');
        if (/lava/.test(text)) return 'lava';
        if (/smoke/.test(text)) return 'smoke';
        if (/dust|powder/.test(text)) return 'dust';
        if (/water|fluid|lake|pool|pond|river|ocean|beach/.test(text)) return 'water';
        if (/metal|mechanic|rigid/.test(text)) return 'metal';
        if (/rock|solid|fracture/.test(text)) return 'rock';
        if (/bio|biological|growth|protein/.test(text)) return 'biomass';
        return '';
      }

    function boundsForField(name) {
        if (name === 'temperature') return [0, 2];
        if (name === 'angularVelocity') return [-24, 24];
        if (name === 'angle') return [0, TAU];
        if (name === 'flowVelocity' || name === 'velocity' || name === 'force' || name === 'strokeForce' || name === 'buoyancy') return [-4, 4];
        if (name === 'swimPhase') return [0, TAU];
        if (['damage', 'liquidFraction', 'density', 'nutrient', 'reactionProgress', 'backlog', 'throughput', 'drag', 'submersion', 'wake', 'fuel', 'product', 'smoke'].includes(name)) {
          return [0, 1];
        }
        return [0, 1.5];
      }

    function anchorValue(domain, axis) {
        const ref = domain.geometryRef || {};
        if (Array.isArray(ref.anchor)) return ref.anchor[axis] || 0.5;
        if (Array.isArray(ref.bounds)) return ref.bounds[axis] || 0.5;
        return 0.5;
      }

    function hasTag(domain, value) {
        return (domain.tags || []).includes(value) || domain.materialId === value;
      }

    function hasOperatorHint(domain, value) {
        return (domain.operatorHints || []).includes(value) || (domain.tags || []).includes(value);
      }

    function isRotationalDomain(domain) {
        const text = `${domain.entityId || ''} ${domain.materialId || ''} ${(domain.tags || []).join(' ')}`.toLowerCase();
        return hasTag(domain, 'rotationalMechanics') || /\b(turbine|rotor|wheel|rotation|shaft|blade)\b/.test(text);
      }

    function isAnimalDomain(domain = {}) {
        const text = `${domain.entityId || ''} ${domain.materialId || ''} ${(domain.tags || []).join(' ')}`.toLowerCase();
        return /\b(dog|cat|animal|mammal|small-mammal|medium-mammal|small_mammal|medium_mammal|gait-force|gait_force|fur)\b/.test(text);
      }

    function isWaterDomain(domain = {}) {
        const text = `${domain.entityId || ''} ${domain.materialId || ''} ${(domain.tags || []).join(' ')}`.toLowerCase();
        return domain.kind === 'fluid' || /\b(water|lake|pool|pond|river|ocean|beach|fluid)\b/.test(text);
      }

    function hasFieldTarget(domain, name) {
        if (name === 'temperature') return hasTag(domain, 'thermal') || ['lava', 'fire', 'ice', 'water', 'metal', 'rock'].includes(domain.materialId);
        if (name === 'liquidFraction') return hasTag(domain, 'phase') || domain.materialId === 'ice';
        return true;
      }

    function unique(values) {
        return Array.from(new Set((values || []).filter(Boolean)));
      }

    function lowerCompositionLedgerForPhysics(ledger = null, behaviorRelations = []) {
        if (!ledger || typeof ledger !== 'object') return null;
        const loweredBehaviors = new Set((behaviorRelations || []).flatMap((relation) => [
          `relation:${semanticAnimalType(relation.agentEntityId)}:swimming:${semanticWaterType(relation.mediumEntityId)}`,
          'action:swimming',
          `action:${relation.process}`,
          `relation:${relation.agentEntityId}:${relation.process}:${relation.mediumEntityId}`,
          ...(relation.evidence || []),
        ]));
        const obligations = (ledger.obligations || []).map((row) => {
          if (loweredBehaviors.has(row.id)) {
            return {
              ...row,
              status: 'lowered',
              phase: 6,
              loweredTo: unique((behaviorRelations || []).flatMap((relation) => relation.operators || [])),
            };
          }
          if (row.kind === 'visual') return { ...row, status: row.status || 'pending', phase: row.phase || 3 };
          return row;
        });
    	    return {
    	      ...ledger,
    	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
    	      sourcePhase: ledger.sourcePhase || 3,
    	      currentPhase: 6,
          obligations,
          summary: {
            ...(ledger.summary || {}),
            obligationCount: obligations.length,
            loweredCount: obligations.filter((row) => row.status === 'lowered').length,
          },
        };
      }

    function semanticAnimalType(entityId = '') {
        const text = String(entityId || '').toLowerCase();
        if (/\bdog/.test(text)) return 'dog';
        if (/\bcat/.test(text)) return 'cat';
        return 'animal';
      }

    function semanticWaterType(entityId = '') {
        const text = String(entityId || '').toLowerCase();
        if (/\blake/.test(text)) return 'lake';
        if (/\bwater/.test(text)) return 'water';
        return 'water';
      }

    function defaultSlugify(value) {
        return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
      }

    const api = Object.freeze({
      catalog,
      languageLexicon,
      ...operatorStage,
      PHYSICAL_IR_SCHEMA,
      SCENE_COMPOSITION_LEDGER_SCHEMA,
      TAU,
      clamp,
      clamp01,
      slugify,
      uniqueList,
      DOMAIN_KIND_BY_HINT,
      readoutsForIR,
      materialTemperature,
      materialHeatStrength,
      materialMeltPoint,
      materialViscosity,
      materialDensity,
      materialFromDomains,
      boundsForField,
      anchorValue,
      hasTag,
      hasOperatorHint,
      isRotationalDomain,
      isAnimalDomain,
      isWaterDomain,
      hasFieldTarget,
      unique,
      lowerCompositionLedgerForPhysics,
      semanticAnimalType,
      semanticWaterType,
      defaultSlugify,
    });

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePhysicsIRSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
