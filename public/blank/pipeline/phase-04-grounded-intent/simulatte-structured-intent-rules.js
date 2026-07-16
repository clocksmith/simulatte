(function attachSimulatteStructuredIntentRules(root, factory) {
  const schema = typeof module === 'object' && module.exports
    ? require('./simulatte-intent-brief-schema.js')
    : root.SimulatteIntentBriefSchema;
  const api = factory(schema || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteStructuredIntentRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStructuredIntentRulesApi(schema = {}) {
  const { slugify = defaultSlugify, uniqueStrings = unique } = schema;

  const STRUCTURED_INTENT_IMPLEMENTATION = Object.freeze({
    id: 'simulatte.deterministic-catalog-grounded-intent-rules.v1',
    kind: 'deterministic-rules',
    runtime: 'javascript',
    role: 'catalog-grounded-structured-intent-draft',
    guardrail: 'may select, connect, or question retrieved catalog IDs; may not invent executable physics',
  });
  const STRUCTURED_INTENT_EXECUTION = Object.freeze({
    schema: 'simulatte.structuredIntentExecution.v1',
    implementation: STRUCTURED_INTENT_IMPLEMENTATION,
    model: Object.freeze({ executed: false, modelId: null, backend: null }),
  });

  const FORCE_TERMS = Object.freeze({
    gravity: ['gravity', 'fall', 'slope', 'orbit'],
    pressure: ['pressure', 'pump', 'steam', 'plume', 'shock'],
    thermal: ['heat', 'hot', 'cool', 'cold', 'lava', 'fire', 'freeze', 'melt'],
    magnetic: ['magnet', 'magnetic', 'coil', 'ferrofluid'],
    electric: ['electric', 'charge', 'ion', 'electron', 'current'],
    fluid: ['flow', 'wind', 'rain', 'river', 'ocean', 'air', 'water'],
    elastic: ['spring', 'membrane', 'fabric', 'tension', 'vibration'],
  });

  const SCALE_RULES = Object.freeze([
    ['scale.quantum', ['quantum', 'electron', 'qubit', 'photon'], 'quantum or electronic scale'],
    ['scale.molecular', ['molecule', 'protein', 'enzyme', 'polymer', 'atom'], 'molecular scale'],
    ['scale.micro', ['cell', 'bacteria', 'microfluidic', 'biofilm'], 'microscopic biological scale'],
    ['scale.human', ['person', 'robot', 'vehicle', 'room', 'bridge', 'machine'], 'human to machine scale'],
    ['scale.geophysical', ['river', 'volcano', 'storm', 'glacier', 'mountain', 'ocean'], 'landscape or weather scale'],
    ['scale.planetary-space', ['planet', 'moon', 'asteroid', 'orbit', 'galaxy', 'comet'], 'planetary or astronomical scale'],
  ]);

  const PROMPT_GROUNDING_ROWS = Object.freeze({
    entities: [
      promptRow('entity.server-rack', 'server rack', ['server rack', 'rack', 'servers'], 'prompt-entities'),
      promptRow('entity.transformer', 'transformer', ['transformer', 'substation'], 'prompt-entities'),
      promptRow('entity.inverter', 'battery inverter', ['inverter', 'battery inverter'], 'prompt-entities'),
      promptRow('entity.cooling-fan', 'cooling fan', ['fan', 'cooling fan'], 'prompt-entities'),
      promptRow('entity.steel-tooling', 'steel tooling', ['tooling', 'steel tooling', 'mold'], 'prompt-entities'),
      promptRow('entity.storm-column', 'storm column', ['supercell', 'thunderstorm', 'storm'], 'prompt-entities'),
      promptRow('entity.hail-core', 'hail core', ['hail', 'graupel'], 'prompt-entities'),
      promptRow('entity.bridge-deck', 'bridge deck', ['bridge', 'deck', 'cable'], 'prompt-entities'),
      promptRow('entity.robot-arm', 'robot arm', ['robot arm', 'robot'], 'prompt-entities'),
      promptRow('entity.microfluidic-channel', 'microfluidic channel', ['microfluidic', 'channel'], 'prompt-entities'),
      promptRow('entity.lava-sheet', 'lava sheet', ['lava', 'magma'], 'prompt-entities'),
      promptRow('entity.rain-droplets', 'rain droplets', ['rain', 'droplet'], 'prompt-entities'),
    ],
    materials: [
      promptRow('material.water', 'water', ['water', 'rain', 'coolant', 'droplet'], 'prompt-materials'),
      promptRow('material.air', 'air', ['air', 'wind', 'steam'], 'prompt-materials'),
      promptRow('material.lava', 'lava', ['lava', 'magma', 'molten rock'], 'prompt-materials'),
      promptRow('material.metal', 'metal', ['metal', 'steel', 'copper'], 'prompt-materials'),
      promptRow('material.plastic', 'plastic polymer', ['plastic', 'polymer'], 'prompt-materials'),
      promptRow('material.silicon', 'silicon', ['silicon', 'chip', 'wafer'], 'prompt-materials'),
      promptRow('material.ice', 'ice', ['ice', 'hail', 'frost'], 'prompt-materials'),
      promptRow('material.soil', 'soil', ['soil', 'sediment', 'sand'], 'prompt-materials'),
      promptRow('material.glass', 'glass', ['glass', 'lens', 'prism'], 'prompt-materials'),
      promptRow('material.biomass', 'biomass', ['algae', 'root', 'coral', 'biofilm'], 'prompt-materials'),
    ],
    phenomena: [
      promptRow('phenomenon.heat-transfer', 'heat transfer', ['heat', 'heats', 'cool', 'cools', 'thermal'], 'prompt-processes'),
      promptRow('phenomenon.phase-change', 'phase change', ['melt', 'melts', 'freeze', 'freezes', 'solidifies', 'vaporizes'], 'prompt-processes'),
      promptRow('phenomenon.feedback-control', 'feedback control', ['feedback', 'controller', 'stabilize', 'stabilizes', 'regulates'], 'prompt-processes'),
      promptRow('phenomenon.advection', 'advection', ['flow', 'flows', 'wind', 'plume', 'airflow'], 'prompt-processes'),
      promptRow('phenomenon.erosion', 'erosion', ['erode', 'erodes', 'erosion', 'sediment'], 'prompt-processes'),
      promptRow('phenomenon.wave-propagation', 'wave propagation', ['wave', 'sound', 'acoustic', 'oscillation'], 'prompt-processes'),
      promptRow('phenomenon.orbital-motion', 'orbital motion', ['orbit', 'orbits', 'resonance', 'gravity'], 'prompt-processes'),
      promptRow('phenomenon.growth', 'growth', ['growth', 'grows', 'biofilm', 'algae'], 'prompt-processes'),
      promptRow('phenomenon.fracture', 'fracture', ['fracture', 'crack', 'impact', 'collision'], 'prompt-processes'),
      promptRow('phenomenon.diffusion', 'diffusion', ['diffuse', 'diffuses', 'concentration'], 'prompt-processes'),
    ],
    environment: [
      promptRow('environment.data-center', 'data center', ['data center', 'server room'], 'prompt-environment'),
      promptRow('environment.grid', 'electrical grid', ['microgrid', 'grid', 'substation'], 'prompt-environment'),
      promptRow('environment.factory', 'manufacturing line', ['factory', 'manufacturing', 'injection molding'], 'prompt-environment'),
      promptRow('environment.weather', 'weather atmosphere', ['storm', 'supercell', 'thunderstorm', 'tornado'], 'prompt-environment'),
      promptRow('environment.watershed', 'watershed terrain', ['river', 'delta', 'watershed', 'shoreline'], 'prompt-environment'),
      promptRow('environment.space', 'space environment', ['planet', 'orbit', 'aurora', 'moon'], 'prompt-environment'),
      promptRow('environment.lab', 'laboratory bench', ['lab', 'bench', 'microfluidic', 'reactor'], 'prompt-environment'),
    ],
  });

  function draftStructuredIntent(input = {}) {
    const prompt = String(input.prompt || '');
    const promptLower = prompt.toLowerCase();
    const evidenceRows = normalizeEvidenceRows(input.evidenceRows || input.retrievedEvidence || []);
    const activationCloud = Array.isArray(input.activationCloud) ? input.activationCloud : [];
    const languageEvidence = input.languageEvidence || {};
    const promptParse = input.promptParse || {};
    const promptGrounding = promptGroundingRows(promptLower, activationCloud, evidenceRows, languageEvidence);
    const entities = rowsByKind(evidenceRows, ['concepts', 'analogs', 'scenes', 'shapes'], promptLower)
      .concat(groundedSpanRows(promptParse, ['entity', 'environment'], evidenceRows, activationCloud))
      .concat(promptGrounding.entities)
      .filter(notRelationLike)
      .slice(0, 18);
    const materials = rowsByKind(evidenceRows, ['materials'], promptLower)
      .concat(groundedSpanRows(promptParse, ['material'], evidenceRows, activationCloud))
      .concat(promptGrounding.materials)
      .slice(0, 18);
    const phenomena = rowsByKind(evidenceRows, ['processes', 'operators', 'relations', 'causalRelations'], promptLower)
      .concat(promptGrounding.phenomena)
      .slice(0, 18);
    const forces = forceRows(promptLower, evidenceRows, activationCloud);
    const fields = fieldRows(promptLower, evidenceRows, activationCloud);
    const environment = environmentRows(promptLower, evidenceRows, promptParse, activationCloud)
      .concat(promptGrounding.environment)
      .slice(0, 18);
    const observables = observableRows(promptLower, promptParse, evidenceRows, activationCloud);
    const timeBehavior = timeRows(promptLower, evidenceRows, activationCloud);
    const visualIntent = visualIntentFor(promptLower, evidenceRows, activationCloud);
    return {
      schema: 'simulatte.structuredIntentDraft.v2',
      execution: STRUCTURED_INTENT_EXECUTION,
      entities: uniqueById(entities).map(intentItem),
      materials: uniqueById(materials).map(intentItem),
      phenomena: uniqueById(phenomena).map(intentItem),
      forces,
      fields,
      environment,
      observables,
      timeBehavior,
      scaleRegime: scaleRegimeFor(promptLower, evidenceRows, activationCloud),
      visualIntent,
      provenance: {
        promptText: Boolean(prompt.trim()),
        evidenceRows: evidenceRows.length,
        languageEvidence: languageEvidence.schema || '',
        activationCloud: activationCloud.length,
        guardrail: STRUCTURED_INTENT_IMPLEMENTATION.guardrail,
      },
    };
  }

  function normalizeEvidenceRows(rows) {
    return (rows || []).filter(Boolean).map((row, index) => ({
      id: row.id || row.cardId || row.primitiveId || `evidence.${index + 1}`,
      label: row.label || row.role || row.phrase || row.cardId || row.primitiveId || row.id || '',
      indexName: row.indexName || row.source || row.type || '',
      semanticType: row.semanticType || row.type || '',
      score: Number(row.score || row.confidence || row.modelScore || 0),
      primitiveHints: row.primitiveHints || (row.primitiveId ? [row.primitiveId] : []),
      operatorHints: row.operatorHints || row.operatorTypes || [],
      materialIds: row.materialIds || (row.materialId ? [row.materialId] : []),
      aliases: row.aliases || row.labels || [],
      evidence: row.evidence || [row.id || row.cardId || row.primitiveId || `evidence.${index + 1}`],
      candidateText: row.candidateText || '',
    }));
  }

  function promptRow(id, label, triggers, indexName) {
    return Object.freeze({ id, label, triggers, indexName, semanticType: indexName, score: 0.74, evidence: ['prompt-text'] });
  }

  function promptGroundingRows(promptLower, activationCloud = [], evidenceRows = [], languageEvidence = {}) {
    const out = { entities: [], materials: [], phenomena: [], environment: [] };
    for (const [group, rows] of Object.entries(PROMPT_GROUNDING_ROWS)) {
      out[group] = rows
        .filter((row) => row.triggers.some((trigger) => promptLower.includes(trigger)))
        .map((row) => ({ row, support: groundingSupport(row, activationCloud, evidenceRows, languageEvidence) }))
        .filter(({ support }) => support.catalogEvidence.length || support.activationIds.length)
        .map((row) => ({
          id: row.row.id,
          label: row.row.label,
          indexName: row.row.indexName,
          semanticType: row.row.semanticType,
          score: Math.max(row.row.score, row.support.score),
          evidence: uniqueStrings([...row.support.evidence, ...row.support.activationIds]).slice(0, 12),
          candidateText: `${row.row.label} is grounded by language span activation and catalog evidence`,
        }));
    }
    return out;
  }

  function rowsByKind(rows, kinds, promptLower) {
    const kindSet = new Set(kinds);
    return rows
      .filter((row) => kindSet.has(row.indexName) || kindSet.has(row.semanticType) || kindSet.has(row.type))
      .filter((row) => row.score >= 0.18 || promptMentionsRow(promptLower, row))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  function spanRows(promptParse, kinds) {
    const kindSet = new Set(kinds);
    return (promptParse.spans || [])
      .filter((span) => kindSet.has(span.kind))
      .map((span) => ({
        id: span.id || `span.${slugify(span.text)}`,
        label: span.text,
        indexName: 'prompt-spans',
        semanticType: span.kind,
        score: 0.72,
        evidence: ['prompt-text'],
      }));
  }

  function groundedSpanRows(promptParse, kinds, evidenceRows, activationCloud) {
    return spanRows(promptParse, kinds)
      .map((row) => ({ row, support: groundingSupport({ ...row, triggers: [row.label, row.id] }, activationCloud, evidenceRows, {}) }))
        .filter(({ support }) => support.catalogEvidence.length || support.activationIds.length)
      .map(({ row, support }) => ({
        ...row,
        evidence: uniqueStrings([...(row.evidence || []), ...support.evidence, ...support.activationIds]).slice(0, 12),
        score: Math.max(Number(row.score || 0), support.score),
      }));
  }

  function groundingSupport(row, activationCloud = [], evidenceRows = [], languageEvidence = {}) {
    const terms = uniqueStrings([row.id, row.label, ...(row.triggers || [])])
      .map((term) => String(term || '').toLowerCase())
      .filter((term) => term.length > 1);
    const activationHits = (activationCloud || []).filter((activation) => terms.some((term) => activationText(activation).includes(term)));
    const evidenceHits = (evidenceRows || []).filter((evidence) => terms.some((term) => rowText(evidence).includes(term)));
    const languageHits = (languageEvidence.spans || []).filter((span) => terms.some((term) => String(span.text || '').toLowerCase().includes(term)));
    const catalogEvidence = uniqueStrings(evidenceHits.map((evidence) => evidence.id)).slice(0, 8);
    const languageEvidenceIds = uniqueStrings(languageHits.map((span) => span.id)).slice(0, 8);
    return {
      activationIds: activationHits.map((activation) => activation.id).slice(0, 8),
      catalogEvidence,
      languageEvidence: languageEvidenceIds,
      evidence: uniqueStrings([...catalogEvidence, ...languageEvidenceIds]).slice(0, 8),
      score: Math.max(
        0,
        ...activationHits.map((activation) => Number(activation.score || 0)),
        ...evidenceHits.map((evidence) => Number(evidence.score || 0))
      ),
    };
  }

  function activationText(activation) {
    return [
      activation.id,
      activation.spanText,
      activation.candidateId,
      activation.candidateLabel,
      activation.candidateKind,
      activation.candidateIndex,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function forceRows(promptLower, rows, activationCloud = []) {
    const out = [];
    for (const [force, terms] of Object.entries(FORCE_TERMS)) {
      const promptHit = terms.some((term) => promptLower.includes(term));
      const evidence = rows.filter((row) => terms.some((term) => rowText(row).includes(term))).map((row) => row.id);
      const activations = activationIdsForTerms(activationCloud, terms);
      if (!evidence.length && !activations.length) continue;
      out.push({
        id: `force.${force}`,
        label: force,
        kind: force,
        evidence: uniqueStrings([...(promptHit ? ['prompt-language'] : []), ...evidence, ...activations]).slice(0, 8),
        confidence: promptHit ? 0.68 : 0.52,
      });
    }
    return out;
  }

  function fieldRows(promptLower, rows, activationCloud = []) {
    const candidates = [
      ['field.temperature', 'temperature field', ['temperature', 'heat', 'thermal', 'lava', 'fire', 'ice']],
      ['field.velocity', 'velocity field', ['flow', 'wind', 'river', 'water', 'air', 'plume']],
      ['field.pressure', 'pressure field', ['pressure', 'shock', 'steam', 'pump']],
      ['field.electromagnetic', 'electromagnetic field', ['magnet', 'coil', 'electric', 'charge', 'plasma']],
      ['field.density', 'density field', ['growth', 'bacteria', 'algae', 'crowd', 'queue']],
      ['field.phase', 'phase field', ['freeze', 'melt', 'boil', 'phase', 'crystal']],
    ];
    return candidates
      .map(([id, label, terms]) => ({
        id,
        label,
        promptHit: terms.some((term) => promptLower.includes(term)),
        evidence: uniqueStrings([...evidenceIdsForTerms(rows, terms), ...activationIdsForTerms(activationCloud, terms)]).slice(0, 8),
      }))
      .filter((row) => row.evidence.length)
      .map((row) => ({
        id: row.id,
        label: row.label,
        evidence: uniqueStrings([...(row.promptHit ? ['prompt-language'] : []), ...row.evidence]).slice(0, 8),
      }));
  }

  function environmentRows(promptLower, rows, promptParse, activationCloud = []) {
    const env = rowsByKind(rows, ['scenes', 'environment'], promptLower).slice(0, 8).map(intentItem);
    for (const span of groundedSpanRows(promptParse, ['environment'], rows, activationCloud).map(intentItem)) env.push(span);
    return uniqueById(env);
  }

  function observableRows(promptLower, promptParse, rows, activationCloud = []) {
    const rowsOut = groundedSpanRows(promptParse, ['observable'], rows, activationCloud).map(intentItem);
    const candidates = [
      ['observable.temperature', 'temperature', ['temperature', 'heat', 'thermal']],
      ['observable.velocity', 'velocity', ['speed', 'velocity', 'flow', 'motion']],
      ['observable.pressure', 'pressure', ['pressure', 'shock']],
      ['observable.damage', 'damage', ['damage', 'fracture', 'break', 'crack']],
      ['observable.energy', 'energy ledger', ['energy', 'power', 'efficiency']],
    ];
    for (const [id, label, terms] of candidates) {
      if (!terms.some((term) => promptLower.includes(term))) continue;
      const evidence = uniqueStrings([...evidenceIdsForTerms(rows, terms), ...activationIdsForTerms(activationCloud, terms)]).slice(0, 8);
      if (!evidence.length) continue;
      rowsOut.push({ id, label, evidence: uniqueStrings(['prompt-language', ...evidence]).slice(0, 8) });
    }
    return uniqueById(rowsOut).slice(0, 10);
  }

  function timeRows(promptLower, evidenceRows, activationCloud = []) {
    const out = [];
    if (/pulse|oscillat|cycle|periodic|wave/.test(promptLower)) out.push({ id: 'time.periodic', label: 'periodic evolution', evidence: ['prompt-language'] });
    const slowTerms = ['growth', 'erode', 'diffus', 'cool', 'heat', 'ferment', 'age'];
    const slowEvidence = uniqueStrings([...evidenceIdsForTerms(evidenceRows, slowTerms), ...activationIdsForTerms(activationCloud, slowTerms)]);
    if (/growth|erode|diffus|cool|heat|ferment|age/.test(promptLower) && slowEvidence.length) {
      out.push({ id: 'time.slow-process', label: 'slow evolving process', evidence: uniqueStrings(['prompt-language', ...slowEvidence]).slice(0, 8) });
    }
    const impulseTerms = ['impact', 'shock', 'explode', 'crash', 'snap'];
    const impulseEvidence = uniqueStrings([...evidenceIdsForTerms(evidenceRows, impulseTerms), ...activationIdsForTerms(activationCloud, impulseTerms)]);
    if (/impact|shock|explode|crash|snap/.test(promptLower) && impulseEvidence.length) {
      out.push({ id: 'time.impulse', label: 'impulse event', evidence: uniqueStrings(['prompt-language', ...impulseEvidence]).slice(0, 8) });
    }
    if (!out.length) out.push({ id: 'time.dynamic', label: 'dynamic simulation', evidence: ['compiler-default'] });
    return out;
  }

  function visualIntentFor(promptLower, rows, activationCloud = []) {
    const sceneKind = sceneKindFor(rows, activationCloud);
    return {
      sceneKind,
      camera: sceneKind.includes('space') ? 'orbital-3d-follow' : sceneKind.includes('molecular') ? 'macro-3d-orbit' : 'cinematic-3d-orbit',
      style: 'semantic-physics-visual-ir',
      lighting: /lava|fire|thermal|plasma/.test(promptLower) ? 'thermal-emission-with-cool-rim' : 'white-lab-key-with-spectrum-accents',
      motionCue: /flow|wind|plume|river/.test(promptLower) ? 'advected-trails' : /impact|collision|shock/.test(promptLower) ? 'shock-rings' : 'state-field-trails',
      evidence: uniqueStrings(['prompt-language', ...rows.slice(0, 4).map((row) => row.id), ...activationCloud.slice(0, 4).map((row) => row.id)]),
    };
  }

  function scaleRegimeFor(promptLower, rows, activationCloud = []) {
    for (const [id, terms, label] of SCALE_RULES) {
      const promptHit = terms.some((term) => promptLower.includes(term));
      const evidence = evidenceIdsForTerms(rows, terms);
      const activations = activationIdsForTerms(activationCloud, terms);
      if (!evidence.length && !activations.length) continue;
      return {
        id,
        label,
        confidence: promptHit ? 0.72 : 0.54,
        evidence: uniqueStrings([...(promptHit ? ['prompt-language'] : []), ...evidence, ...activations]).slice(0, 8),
      };
    }
    return { id: 'scale.human', label: 'human to machine scale', confidence: 0.35, evidence: ['compiler-default'] };
  }

  function sceneKindFor(rows, activationCloud = []) {
    const text = `${rows.map(rowText).join(' ')} ${activationCloud.map(activationText).join(' ')}`;
    if (/space|orbit|planet|moon|asteroid|galaxy|comet|solar/.test(text)) return 'planetary-space';
    if (/cell|protein|enzyme|bacteria|organ|tissue|microbe|mycelium/.test(text)) return 'biology';
    if (/lava|fire|thermal|smoke|plume|combustion/.test(text)) return 'thermal-plume';
    if (/river|ocean|storm|rain|glacier|delta|water|sediment/.test(text)) return 'watershed';
    if (/lens|prism|laser|mirror|photon|optics/.test(text)) return 'optics';
    if (/queue|traffic|market|packet|network|server/.test(text)) return 'city';
    if (/magnet|ferrofluid|coil|field/.test(text)) return 'ferrofluid';
    if (/collision|robot|vehicle|gear|bridge|wheel|turbine/.test(text)) return 'mechanical';
    return 'literal-composite';
  }

  function intentItem(row) {
    return {
      id: row.id || slugify(row.label),
      label: row.label || row.id || '',
      semanticType: row.semanticType || row.indexName || '',
      evidence: row.evidence || [row.id || row.label || 'unknown-evidence'],
      primitiveHints: row.primitiveHints || [],
      operatorHints: row.operatorHints || [],
      materialIds: row.materialIds || [],
      confidence: Number(row.score || row.confidence || 0.5),
    };
  }

  function notRelationLike(row) {
    const text = rowText(row);
    return !/relation\.|operator\.|process\./.test(text);
  }

  function promptMentionsRow(promptLower, row) {
    return [row.label, row.id, ...(row.aliases || [])]
      .filter(Boolean)
      .some((value) => promptLower.includes(String(value).toLowerCase()));
  }

  function evidenceIdsForTerms(rows, terms) {
    return uniqueStrings((rows || [])
      .filter((row) => terms.some((term) => rowText(row).includes(String(term).toLowerCase())))
      .map((row) => row.id || row.label));
  }

  function activationIdsForTerms(rows, terms) {
    return uniqueStrings((rows || [])
      .filter((row) => terms.some((term) => activationText(row).includes(String(term).toLowerCase())))
      .map((row) => row.id || row.candidateId || row.candidateLabel));
  }

  function rowText(row) {
    return [
      row.id,
      row.label,
      row.candidateText,
      row.indexName,
      row.semanticType,
      ...(row.aliases || []),
      ...(row.primitiveHints || []),
      ...(row.operatorHints || []),
      ...(row.materialIds || []),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function uniqueById(rows) {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const key = String(row.id || row.label || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  function defaultSlugify(value) {
    return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  return {
    STRUCTURED_INTENT_EXECUTION,
    STRUCTURED_INTENT_IMPLEMENTATION,
    draftStructuredIntent,
  };
});
