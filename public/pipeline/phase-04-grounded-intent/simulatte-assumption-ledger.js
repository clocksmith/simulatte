(function attachSimulatteAssumptionLedger(root, factory) {
  const schema = typeof module === 'object' && module.exports
    ? require('./simulatte-intent-brief-schema.js')
    : root.SimulatteIntentBriefSchema;
  const api = factory(schema || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteAssumptionLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAssumptionLedgerApi(schema = {}) {
  const { slugify = defaultSlugify, uniqueStrings = unique, uniqueById } = schema;
  if (typeof uniqueById !== 'function') throw new Error('Intent brief uniqueById contract unavailable');

  const ASSUMPTION_RULES = Object.freeze([
    assumption('assumption.rain-is-water', ['rain', 'storm', 'droplet'], 'water rain', 'Precipitation is treated as liquid water unless acid, methane, ammonia, or other chemistry is stated.', ['acid rain changes corrosion and pH response', 'methane rain changes cryogenic phase behavior']),
    assumption('assumption.lava-is-basaltic', ['lava', 'magma', 'volcano'], 'basaltic lava', 'Molten rock is treated as basaltic silicate lava unless the prompt names a composition.', ['rhyolite raises viscosity', 'komatiite lowers viscosity']),
    assumption('assumption.air-atmosphere', ['wind', 'plume', 'smoke', 'storm', 'cloud'], 'air atmosphere', 'Open weather scenes use an air atmosphere with bounded humidity and pressure.', ['vacuum removes buoyant plume dynamics', 'dense alien atmosphere changes drag and refraction']),
    assumption('assumption.earth-gravity', ['fall', 'falling', 'river', 'rain', 'avalanche', 'turbine', 'wheel'], 'earth-normal gravity', 'Gravity defaults to earth-normal for human-scale scenes unless planetary setting is stated.', ['lunar gravity changes ballistic arcs', 'microgravity changes containment and flow']),
    assumption('assumption.continuum-fluid', ['river', 'ocean', 'air', 'wind', 'smoke', 'lava', 'brine'], 'continuum fluid', 'Fluid is lowered to continuum or particle-fluid approximation rather than molecular dynamics.', ['molecular scale requires Brownian or atomistic operators']),
    assumption('assumption.rigid-machine', ['gear', 'wheel', 'turbine', 'robot', 'vehicle', 'bridge'], 'rigid machine parts', 'Machines are rigid-body assemblies with explicit joints and constraints unless soft compliance is requested.', ['flexible-body machine requires soft-body coupling']),
    assumption('assumption.biological-field', ['cell', 'bacteria', 'algae', 'mycelium', 'tissue', 'organ'], 'coarse biological field', 'Biological growth and signaling compile to reaction-diffusion or agent fields unless molecular detail is requested.', ['protein atomistic folding requires molecular chain operators']),
    assumption('assumption.optics-geometric', ['lens', 'mirror', 'prism', 'laser', 'caustic'], 'geometric optics', 'Optical scenes default to rays, refraction, reflection, and caustic fields unless wave interference is stated.', ['interference requires phase-field optics']),
    assumption('assumption.thermal-lumped', ['heat', 'cool', 'burn', 'freeze', 'melt'], 'lumped thermal field', 'Thermal response is lowered to bounded heat transfer and phase fields unless full combustion chemistry is requested.', ['full combustion chemistry requires reaction networks']),
    assumption('assumption.network-queue', ['traffic', 'market', 'queue', 'packet', 'dispatch'], 'queue network', 'Social, logistics, and compute systems are lowered to network flow and queue operators.', ['individual cognition is not simulated']),
    assumption('assumption.space-two-body', ['orbit', 'moon', 'planet', 'asteroid', 'satellite'], 'reduced orbital model', 'Orbital scenes use reduced n-body or curve-path dynamics unless relativistic effects are requested.', ['relativistic lensing requires field approximation']),
    assumption('assumption.visual-deterministic', ['beautiful', 'cinematic', 'render', 'scene', 'visual'], 'procedural visual mapping', 'Visual style is derived from simulation semantics and causal roles, not from a scene template bucket.', ['photoreal offline path would need a different renderer']),
    assumption('assumption.acid-rain-chemistry', ['acid rain', 'acidic', 'corrosion'], 'acid rain chemistry', 'Acid rain is treated as a dissolved corrosive species on wet surfaces unless a specific acid and concentration are stated.', ['sulfuric acid changes reaction rate', 'nitric acid changes corrosion products']),
    assumption('assumption.battery-cell-lumped', ['battery', 'runaway', 'electrolyte'], 'lumped battery cell model', 'Battery packs are represented as coupled thermal-electrochemical cells, not full electrode microstructure.', ['electrode-scale model changes diffusion and heat source geometry']),
    assumption('assumption.crystal-facet-growth', ['crystal', 'nucleation', 'supersaturated'], 'facet growth approximation', 'Crystal growth uses seed, supersaturation, facet boundary, and solute depletion fields.', ['atom-by-atom lattice growth requires molecular dynamics']),
    assumption('assumption.protein-coarse-grain', ['protein', 'fold', 'hydrophobic'], 'coarse protein folding', 'Protein folding is reduced to coarse chain relaxation, contact hints, and energy basin visuals.', ['all-atom folding requires molecular force fields']),
    assumption('assumption.neural-signal-coarse', ['neuron', 'synapse', 'axon'], 'coarse neural signal', 'Neural prompts compile to network pulse and membrane state fields, not full ion-channel biophysics.', ['Hodgkin-Huxley detail requires channel-specific parameters']),
    assumption('assumption.vascular-compliant-tube', ['blood', 'artery', 'vessel'], 'compliant vessel flow', 'Blood flow uses pressure-driven fluid through elastic vessel boundaries.', ['non-Newtonian blood detail changes viscosity and wall coupling']),
    assumption('assumption.cryosphere-continuum-ice', ['glacier', 'ice shelf', 'calving'], 'continuum ice shelf', 'Glacier calving uses phase, fracture, and rigid block approximations over a continuum ice mass.', ['crevasse-resolved ice mechanics changes fracture topology']),
    assumption('assumption.weather-column-vorticity', ['tornado', 'vortex', 'wind shear'], 'coarse vortex weather', 'Tornado and vortex prompts use bounded vorticity and particle fields, not full atmospheric DNS.', ['full turbulent weather requires a larger fluid solver']),
    assumption('assumption.semiconductor-thermal-map', ['chip', 'wafer', 'semiconductor'], 'semiconductor thermal map', 'Chip prompts use network/power load and heat diffusion over simplified die geometry.', ['transistor-level simulation changes source layout']),
    assumption('assumption.crowd-agent-field', ['crowd', 'exit', 'bottleneck'], 'crowd agent field', 'Crowd motion is represented by agent particles, density fields, and queue pressure.', ['individual intent modeling is an external policy layer']),
    assumption('assumption.bridge-linear-modes', ['bridge', 'cable', 'wind resonance'], 'bridge modal approximation', 'Bridge resonance uses structural modes, damping, and stress visualization rather than full finite element mesh.', ['full FEA requires mesh and material boundary conditions']),
    assumption('assumption.plasma-fluid-field', ['plasma', 'tokamak', 'magnetic confinement'], 'plasma fluid field', 'Plasma confinement uses field-force and ribbon approximations instead of kinetic particle-in-cell detail.', ['PIC simulation changes particle and field resolution']),
    assumption('assumption.microfluidic-surface-tension', ['microfluidic', 'droplet', 'junction'], 'microfluidic droplet approximation', 'Microfluidic droplets use pressure flow, channel boundaries, and surface tension visual constraints.', ['contact-angle data changes split threshold']),
  ]);

  const UNSUPPORTED_RULES = Object.freeze([
    unsupported('unsupported.full-quantum-many-body', ['exact quantum', 'full quantum', 'many body wavefunction'], 'Exact many-body quantum evolution is not executable in the browser path.', 'phase-field or particle-track approximation'),
    unsupported('unsupported.relativistic-fluid-full-fidelity', ['relativistic fluid', 'general relativity fluid', 'spacetime hydrodynamics'], 'Full relativistic hydrodynamics is outside the deterministic browser solver set.', 'curved field and particle plume approximation'),
    unsupported('unsupported.consciousness', ['soul', 'consciousness', 'qualia'], 'Non-physical mental essence has no simulator primitive mapping.', 'observable proxy or agent-state readout'),
    unsupported('unsupported.full-cell-biochemistry', ['entire cell', 'complete metabolism', 'all proteins'], 'Complete cellular biochemistry cannot be represented as a single finite browser simulation graph.', 'reaction-diffusion compartments and selected pathways'),
    unsupported('unsupported.all-weather-climate', ['entire climate', 'whole earth weather', 'full climate'], 'Planet-wide climate at full fidelity exceeds the local deterministic scene scope.', 'regional atmosphere column and fluid field approximation'),
    unsupported('unsupported.full-turbulence-dns', ['direct numerical simulation', 'full turbulence', 'all eddies'], 'Full direct numerical turbulence is outside the current browser solver set.', 'vorticity field, particles, and advected tracer approximation'),
    unsupported('unsupported.all-atom-protein', ['all atom protein', 'every atom protein', 'atomistic folding'], 'All-atom protein dynamics is not represented by the deterministic scene compiler.', 'coarse chain folding and contact map approximation'),
    unsupported('unsupported.full-human-physiology', ['entire human body', 'whole body physiology', 'all organs full fidelity'], 'Whole-body physiology at full fidelity is not a single executable Simulatte graph.', 'selected organ or vascular subsystem approximation'),
    unsupported('unsupported.full-kinetic-plasma', ['particle in cell plasma', 'full kinetic plasma', 'every charged particle'], 'Full kinetic plasma particle-in-cell simulation is outside the current local scene path.', 'magnetized plasma ribbon and field-force approximation'),
  ]);

  function assumption(id, triggers, label, statement, alternatives) {
    return { id, triggers, label, statement, alternatives };
  }

  function unsupported(id, triggers, reason, fallback) {
    return { id, triggers, reason, fallback };
  }

  function buildAssumptionLedger(input = {}) {
    const prompt = String(input.prompt || '').toLowerCase();
    const evidenceText = evidenceHaystack(input.evidenceRows || input.retrievedEvidence || []);
    const haystack = `${prompt} ${evidenceText}`;
    const assumptions = [];
    const alternatives = [];
    const unsupported = [];
    const degradedTo = [];
    for (const rule of ASSUMPTION_RULES) {
      if (!matchesAny(haystack, rule.triggers)) continue;
      assumptions.push({
        id: rule.id,
        label: rule.label,
        statement: rule.statement,
        evidence: evidenceIdsForTerms(input.evidenceRows || [], rule.triggers).slice(0, 6),
        confidence: promptIncludesAny(prompt, rule.triggers) ? 0.78 : 0.56,
      });
      for (const alt of rule.alternatives || []) {
        alternatives.push({
          id: `${rule.id}.${slugify(alt)}`,
          assumptionId: rule.id,
          label: alt,
          changes: alternativeChange(alt),
        });
      }
    }
    for (const rule of UNSUPPORTED_RULES) {
      if (!matchesAny(prompt, rule.triggers)) continue;
      unsupported.push({
        id: rule.id,
        label: rule.triggers[0],
        reason: rule.reason,
        evidence: ['prompt-text'],
      });
      degradedTo.push({
        id: `${rule.id}.degraded`,
        unsupportedId: rule.id,
        label: rule.fallback,
        reason: `Unsupported request degraded to ${rule.fallback}`,
        executable: true,
      });
    }
    const negativeKnowledge = unsupported.map((row) => ({
      id: `${row.id}.negative-knowledge`,
      label: row.label,
      statement: row.reason,
      policy: 'do-not-invent-primitive',
    }));
    return {
      schema: 'simulatte.assumptionLedger.v1',
      assumptions: uniqueById(assumptions),
      alternatives: uniqueById(alternatives),
      unsupported: uniqueById(unsupported),
      degradedTo: uniqueById(degradedTo),
      negativeKnowledge: uniqueById(negativeKnowledge),
    };
  }

  function evidenceHaystack(rows) {
    return (rows || []).map((row) => [
      row.id,
      row.label,
      row.candidateText,
      row.semanticType,
      row.indexName,
      ...(row.aliases || []),
      ...(row.operatorHints || []),
      ...(row.primitiveHints || []),
    ].filter(Boolean).join(' ')).join(' ').toLowerCase();
  }

  function evidenceIdsForTerms(rows, terms) {
    const ids = [];
    for (const row of rows || []) {
      const text = [row.id, row.label, row.candidateText, ...(row.aliases || [])].join(' ').toLowerCase();
      if (terms.some((term) => text.includes(String(term).toLowerCase()))) ids.push(row.id || row.label);
    }
    return uniqueStrings(ids);
  }

  function alternativeChange(text) {
    if (/acid/.test(text)) return 'adds corrosion, pH, and material response';
    if (/methane|ammonia/.test(text)) return 'changes phase thresholds and material palette';
    if (/lunar|microgravity/.test(text)) return 'changes acceleration, settling, and trajectories';
    if (/molecular|atomistic/.test(text)) return 'changes solver family and scale regime';
    if (/interference/.test(text)) return 'adds phase and wavefront fields';
    return 'changes operator parameters or required primitives';
  }

  function matchesAny(text, terms) {
    return (terms || []).some((term) => String(text || '').includes(String(term).toLowerCase()));
  }

  function promptIncludesAny(prompt, terms) {
    return matchesAny(prompt, terms);
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  function defaultSlugify(value) {
    return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  return {
    ASSUMPTION_RULES,
    UNSUPPORTED_RULES,
    buildAssumptionLedger,
  };
});
