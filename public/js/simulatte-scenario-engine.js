(function attachSimulatteScenarioEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteScenarioEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createEngine() {
  const MAX_REPLAY = 64;
  const DEFAULT_STEPS = 12;

  const AXIS_LABELS = {
    setup: 'Setup',
    actors: 'Actors',
    resources: 'Resources',
    stress: 'Stress',
    access: 'Access',
    trust: 'Trust',
  };

  const TEMPLATE_LIBRARY = [
    {
      id: 'transit-heatwave',
      match: ['transit', 'train', 'bus', 'strike', 'heatwave', 'commute'],
      title: 'Transit Strike During Heatwave',
      domain: 'civic systems',
      visual: 'transit-heat',
      actors: [
        ['transit-agency', 'Transit agency', 'operator', 38],
        ['riders', 'Riders', 'public', 42],
        ['emergency-ops', 'Emergency ops', 'coordinator', 32],
        ['employers', 'Employers', 'constraint setter', 28],
      ],
      resources: [
        ['buses', 'Available buses', 58, 'mobile capacity'],
        ['cooling-centers', 'Cooling centers', 44, 'public relief'],
        ['driver-hours', 'Driver hours', 36, 'labor capacity'],
      ],
      rules: [
        'Heat raises rider risk when transit access falls.',
        'Emergency shuttles improve access but consume driver hours.',
        'Employer flexibility reduces peak load.',
      ],
      shocks: [
        ['strike', 'Driver strike', 0.62, 1],
        ['heatwave', 'Heatwave escalation', 0.52, 2],
      ],
      goals: [
        'Keep essential trips above 55%.',
        'Prevent cooling access from dropping below 45%.',
        'Stabilize public trust by the final step.',
      ],
    },
    {
      id: 'housing-shortage',
      match: ['housing', 'rent', 'zoning', 'eviction', 'shelter', 'homeless'],
      title: 'Housing Shortage Response',
      domain: 'housing',
      visual: 'housing',
      actors: [
        ['residents', 'Residents', 'households', 44],
        ['city-housing', 'City housing office', 'policy operator', 35],
        ['landlords', 'Landlords', 'supply owner', 30],
        ['builders', 'Builders', 'capacity provider', 27],
      ],
      resources: [
        ['available-units', 'Available units', 34, 'supply'],
        ['rental-aid', 'Rental aid', 46, 'stabilizer'],
        ['permits', 'Permit throughput', 42, 'future supply'],
      ],
      rules: [
        'Low supply increases household pressure.',
        'Rental aid reduces displacement risk while funds last.',
        'Permit throughput improves future supply with a delay.',
      ],
      shocks: [
        ['rent-spike', 'Rent spike', 0.56, 1],
        ['shelter-cap', 'Shelter capacity limit', 0.38, 3],
      ],
      goals: [
        'Keep displacement pressure below 60%.',
        'Increase available units before the final step.',
        'Avoid exhausting rental aid.',
      ],
    },
    {
      id: 'energy-outage',
      match: ['energy', 'power', 'grid', 'outage', 'battery', 'storm'],
      title: 'Power Outage Recovery',
      domain: 'energy',
      visual: 'power',
      actors: [
        ['utility', 'Utility operators', 'grid owner', 36],
        ['hospitals', 'Hospitals', 'critical load', 48],
        ['households', 'Households', 'public load', 38],
        ['microgrids', 'Microgrid operators', 'resilience node', 24],
      ],
      resources: [
        ['generation', 'Generation reserve', 52, 'supply'],
        ['battery', 'Battery reserve', 48, 'buffer'],
        ['repair-crews', 'Repair crews', 40, 'recovery'],
      ],
      rules: [
        'Critical loads receive priority during scarcity.',
        'Battery reserve reduces outage pressure until depleted.',
        'Repair crews convert outage pressure into restored capacity.',
      ],
      shocks: [
        ['storm', 'Storm damage', 0.58, 1],
        ['peak-load', 'Peak load surge', 0.42, 2],
      ],
      goals: [
        'Restore service coverage above 65%.',
        'Keep hospital load protected.',
        'End with usable battery reserve.',
      ],
    },
    {
      id: 'supply-delay',
      match: ['supply', 'shipping', 'factory', 'inventory', 'shortage', 'port'],
      title: 'Supply Chain Delay',
      domain: 'supply chain',
      visual: 'supply',
      actors: [
        ['supplier', 'Supplier', 'upstream', 34],
        ['warehouse', 'Warehouse', 'buffer', 30],
        ['retailers', 'Retailers', 'demand edge', 42],
        ['customers', 'Customers', 'demand source', 36],
      ],
      resources: [
        ['inventory', 'Inventory', 46, 'buffer'],
        ['transport', 'Transport slots', 38, 'capacity'],
        ['cash', 'Cash reserve', 50, 'stabilizer'],
      ],
      rules: [
        'Inventory absorbs late shipments until buffers run down.',
        'Transport slots reduce backlog but raise cash pressure.',
        'Customer trust falls when fulfillment misses pile up.',
      ],
      shocks: [
        ['port-delay', 'Port delay', 0.54, 1],
        ['demand-spike', 'Demand spike', 0.36, 3],
      ],
      goals: [
        'Keep fulfillment coverage above 60%.',
        'Prevent inventory from collapsing.',
        'Recover customer trust by the final step.',
      ],
    },
    {
      id: 'agent-market',
      match: ['agent', 'agents', 'market', 'economy', 'competition', 'policy'],
      title: 'Agent Market Test',
      domain: 'agent society',
      visual: 'agents',
      actors: [
        ['planner', 'Planner agent', 'allocator', 28],
        ['seller', 'Seller agent', 'resource owner', 34],
        ['buyer', 'Buyer agent', 'demand source', 36],
        ['auditor', 'Auditor agent', 'policy check', 22],
      ],
      resources: [
        ['tokens', 'Trade tokens', 55, 'exchange'],
        ['goods', 'Goods', 50, 'supply'],
        ['policy-budget', 'Policy budget', 46, 'governance'],
      ],
      rules: [
        'Agents trade to satisfy goals while staying within policy.',
        'Audits reduce bad trades but consume policy budget.',
        'Scarcity increases pressure and exposes brittle strategies.',
      ],
      shocks: [
        ['scarcity', 'Resource scarcity', 0.46, 1],
        ['bad-signal', 'Bad signal', 0.34, 4],
      ],
      goals: [
        'Keep policy violations low.',
        'Maintain useful trades through scarcity.',
        'Promote strategies that recover after bad signals.',
      ],
    },
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function slugify(value) {
    return String(value || 'scenario')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'scenario';
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededNoise(seed, step, salt) {
    const x = Math.sin((seed + 1) * 12.9898 + (step + 1) * 78.233 + salt * 37.719) * 43758.5453;
    return x - Math.floor(x);
  }

  function itemId(prefix, name, index) {
    return `${prefix}-${slugify(name)}-${index + 1}`;
  }

  function listFromLines(value) {
    if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
    return String(value || '')
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function scoreTemplate(template, prompt) {
    const lower = prompt.toLowerCase();
    return template.match.reduce((score, word) => score + (lower.includes(word) ? 1 : 0), 0);
  }

  function chooseTemplate(prompt) {
    const text = String(prompt || '').trim();
    let best = TEMPLATE_LIBRARY[0];
    let bestScore = -1;
    for (const template of TEMPLATE_LIBRARY) {
      const score = scoreTemplate(template, text);
      if (score > bestScore) {
        best = template;
        bestScore = score;
      }
    }
    return best;
  }

  function visualKindForScenario(prompt, domain) {
    const template = chooseTemplate(prompt);
    if (template && template.visual) return template.visual;
    const text = `${prompt || ''} ${domain || ''}`.toLowerCase();
    if (/transit|train|bus|heat|commute/.test(text)) return 'transit-heat';
    if (/housing|rent|shelter|unit/.test(text)) return 'housing';
    if (/power|grid|energy|battery|storm/.test(text)) return 'power';
    if (/supply|port|shipping|warehouse|inventory/.test(text)) return 'supply';
    if (/agent|market|policy|trade/.test(text)) return 'agents';
    return 'systems';
  }

  function actorFromTuple(tuple, index) {
    return {
      id: tuple[0] || itemId('actor', tuple[1], index),
      name: tuple[1] || `Actor ${index + 1}`,
      role: tuple[2] || 'participant',
      pressure: clamp(Number(tuple[3] ?? 30), 0, 100),
    };
  }

  function resourceFromTuple(tuple, index) {
    return {
      id: tuple[0] || itemId('resource', tuple[1], index),
      name: tuple[1] || `Resource ${index + 1}`,
      level: clamp(Number(tuple[2] ?? 50), 0, 100),
      role: tuple[3] || 'capacity',
    };
  }

  function shockFromTuple(tuple, index) {
    return {
      id: tuple[0] || itemId('shock', tuple[1], index),
      name: tuple[1] || `Shock ${index + 1}`,
      intensity: clamp01(Number(tuple[2] ?? 0.35)),
      step: Math.max(1, Math.floor(Number(tuple[3] ?? index + 1))),
    };
  }

  function ruleFromText(text, index) {
    return {
      id: itemId('rule', text, index),
      text,
      weight: 1,
    };
  }

  function goalFromText(text, index) {
    return {
      id: itemId('goal', text, index),
      text,
      target: 0.6,
    };
  }

  function buildScenarioFromPrompt(prompt, overrides) {
    const text = String(prompt || '').trim() || 'simulate a transit strike during a heatwave';
    const template = chooseTemplate(text);
    const title = overrides && overrides.title ? String(overrides.title) : template.title;
    const seed = hashString(`${template.id}:${text}`);
    const scenario = {
      id: `${template.id}-${seed.toString(16)}`,
      title,
      prompt: text,
      domain: template.domain,
      visual: template.visual || visualKindForScenario(text, template.domain),
      seed,
      stepsPlanned: DEFAULT_STEPS,
      createdAt: new Date(0).toISOString(),
      actors: template.actors.map(actorFromTuple),
      resources: template.resources.map(resourceFromTuple),
      rules: template.rules.map(ruleFromText),
      shocks: template.shocks.map(shockFromTuple),
      goals: template.goals.map(goalFromText),
      assumptions: [
        'The run uses a deterministic scenario ruleset owned by Simulatte.',
        'Scenario terms are interpreted through editable templates.',
        'Map changes show relative pressure, not real-world prediction.',
      ],
    };
    return normalizeScenario(applyScenarioEdits(scenario, overrides || {}));
  }

  function normalizeScenario(raw) {
    const base = raw || {};
    const prompt = String(base.prompt || '').trim() || 'simulate a transit strike during a heatwave';
    const title = String(base.title || chooseTemplate(prompt).title || 'Scenario').trim();
    const seed = Number.isFinite(Number(base.seed)) ? Number(base.seed) >>> 0 : hashString(`${title}:${prompt}`);
    const actors = Array.isArray(base.actors) ? base.actors : [];
    const resources = Array.isArray(base.resources) ? base.resources : [];
    const rules = Array.isArray(base.rules) ? base.rules : [];
    const shocks = Array.isArray(base.shocks) ? base.shocks : [];
    const goals = Array.isArray(base.goals) ? base.goals : [];

    return {
      id: String(base.id || `${slugify(title)}-${seed.toString(16)}`),
      title,
      prompt,
      domain: String(base.domain || chooseTemplate(prompt).domain || 'world model'),
      visual: String(base.visual || visualKindForScenario(prompt, base.domain)),
      seed,
      stepsPlanned: clamp(Math.floor(Number(base.stepsPlanned || DEFAULT_STEPS)), 4, 40),
      createdAt: String(base.createdAt || new Date(0).toISOString()),
      actors: actors.length
        ? actors.map((actor, index) => ({
            id: String(actor.id || itemId('actor', actor.name, index)),
            name: String(actor.name || `Actor ${index + 1}`).trim(),
            role: String(actor.role || 'participant').trim(),
            pressure: clamp(Number(actor.pressure ?? 30), 0, 100),
          }))
        : chooseTemplate(prompt).actors.map(actorFromTuple),
      resources: resources.length
        ? resources.map((resource, index) => ({
            id: String(resource.id || itemId('resource', resource.name, index)),
            name: String(resource.name || `Resource ${index + 1}`).trim(),
            role: String(resource.role || 'capacity').trim(),
            level: clamp(Number(resource.level ?? 50), 0, 100),
          }))
        : chooseTemplate(prompt).resources.map(resourceFromTuple),
      rules: rules.length
        ? rules.map((rule, index) => ({
            id: String(rule.id || itemId('rule', rule.text, index)),
            text: String(rule.text || `Rule ${index + 1}`).trim(),
            weight: clamp(Number(rule.weight ?? 1), 0, 3),
          }))
        : chooseTemplate(prompt).rules.map(ruleFromText),
      shocks: shocks.length
        ? shocks.map((shock, index) => ({
            id: String(shock.id || itemId('shock', shock.name, index)),
            name: String(shock.name || `Shock ${index + 1}`).trim(),
            intensity: clamp01(Number(shock.intensity ?? 0.35)),
            step: Math.max(1, Math.floor(Number(shock.step ?? index + 1))),
          }))
        : chooseTemplate(prompt).shocks.map(shockFromTuple),
      goals: goals.length
        ? goals.map((goal, index) => ({
            id: String(goal.id || itemId('goal', goal.text, index)),
            text: String(goal.text || `Goal ${index + 1}`).trim(),
            target: clamp01(Number(goal.target ?? 0.6)),
          }))
        : chooseTemplate(prompt).goals.map(goalFromText),
      assumptions: Array.isArray(base.assumptions)
        ? base.assumptions.map(String).map((x) => x.trim()).filter(Boolean)
        : [
            'The run uses a deterministic scenario ruleset owned by Simulatte.',
            'Scenario terms are interpreted through editable templates.',
            'Map changes show relative pressure, not real-world prediction.',
          ],
    };
  }

  function applyScenarioEdits(scenario, edits) {
    if (!edits) return scenario;
    const next = { ...scenario };
    if (edits.title !== undefined) next.title = String(edits.title).trim() || scenario.title;
    if (edits.prompt !== undefined) next.prompt = String(edits.prompt).trim() || scenario.prompt;
    if (edits.domain !== undefined) next.domain = String(edits.domain).trim() || scenario.domain;
    if (edits.actorsText !== undefined) {
      next.actors = listFromLines(edits.actorsText).map((name, index) => ({
        id: itemId('actor', name, index),
        name,
        role: index === 0 ? 'primary actor' : 'participant',
        pressure: clamp(28 + index * 6, 0, 100),
      }));
    }
    if (edits.resourcesText !== undefined) {
      next.resources = listFromLines(edits.resourcesText).map((name, index) => ({
        id: itemId('resource', name, index),
        name,
        role: index === 0 ? 'core resource' : 'support resource',
        level: clamp(58 - index * 7, 10, 90),
      }));
    }
    if (edits.rulesText !== undefined) {
      next.rules = listFromLines(edits.rulesText).map(ruleFromText);
    }
    if (edits.shocksText !== undefined) {
      next.shocks = listFromLines(edits.shocksText).map((name, index) => ({
        id: itemId('shock', name, index),
        name,
        intensity: clamp01(0.42 + index * 0.08),
        step: index + 1,
      }));
    }
    if (edits.goalsText !== undefined) {
      next.goals = listFromLines(edits.goalsText).map(goalFromText);
    }
    return next;
  }

  function average(items, getter, fallback) {
    if (!items.length) return fallback;
    return items.reduce((sum, item) => sum + getter(item), 0) / items.length;
  }

  function createRunState(inputScenario) {
    const scenario = normalizeScenario(inputScenario);
    const resourceLevel = average(scenario.resources, (resource) => resource.level, 50);
    const actorPressure = average(scenario.actors, (actor) => actor.pressure, 30);
    const initialLoad = clamp(26 + actorPressure * 0.28 - resourceLevel * 0.1, 0, 100);
    const initialCoverage = clamp(64 + resourceLevel * 0.2 - actorPressure * 0.18, 0, 100);
    const initialTrust = clamp(68 - actorPressure * 0.12 + scenario.rules.length * 1.5, 0, 100);
    return {
      scenario,
      tick: 0,
      complete: false,
      metrics: {
        load: initialLoad,
        coverage: initialCoverage,
        trust: initialTrust,
        stability: clamp((100 - initialLoad + initialCoverage + initialTrust) / 3, 0, 100),
      },
      actors: scenario.actors.map((actor) => ({ ...actor })),
      resources: scenario.resources.map((resource) => ({ ...resource })),
      activeShocks: [],
      replay: [
        {
          step: 0,
          title: 'Board setup committed',
          text: `${scenario.title} is ready with ${scenario.actors.length} actors, ${scenario.resources.length} resources, ${scenario.rules.length} rules, and ${scenario.shocks.length} shocks.`,
          changes: ['Initial state placed on the Simulatte board.'],
          affects: [
            ...scenario.actors.slice(0, 4).map((actor) => actor.id),
            ...scenario.resources.slice(0, 4).map((resource) => resource.id),
            ...scenario.shocks.slice(0, 3).map((shock) => shock.id),
          ],
          assumptions: scenario.assumptions.slice(0, 2),
        },
      ],
      map: buildMapSignals({
        load: initialLoad,
        coverage: initialCoverage,
        trust: initialTrust,
        stability: clamp((100 - initialLoad + initialCoverage + initialTrust) / 3, 0, 100),
      }, scenario, 0),
    };
  }

  function activeShockLoad(scenario, tick) {
    return scenario.shocks
      .filter((shock) => tick >= shock.step)
      .reduce((sum, shock) => {
        const age = tick - shock.step;
        const decay = Math.max(0.35, 1 - age * 0.08);
        return sum + shock.intensity * decay;
      }, 0);
  }

  function buildMapSignals(metrics, scenario, tick) {
    const risk = clamp01(metrics.load / 100);
    const accessRisk = clamp01((100 - metrics.coverage) / 100);
    const trustRisk = clamp01((100 - metrics.trust) / 100);
    const stability = clamp01(metrics.stability / 100);
    const actors = scenario.actors.slice(0, 4);
    const resources = scenario.resources.slice(0, 4);
    const shocks = scenario.shocks.slice(0, 3);
    const actorAxes = ['actors', 'access', 'trust', 'setup'];
    const resourceAxes = ['resources', 'access', 'trust', 'setup'];
    const shockAxes = ['stress', 'actors', 'resources'];
    const sceneObjects = [
      ...actors.map((actor, index) => ({
        id: actor.id,
        kind: 'actor',
        label: actor.name,
        sublabel: actor.role,
        axis: actorAxes[index % actorAxes.length],
        value: clamp01(actor.pressure / 100),
        valueLabel: `pressure ${Math.round(actor.pressure)}`,
        state: actor.pressure >= 62 ? 'strained' : 'active',
      })),
      ...resources.map((resource, index) => ({
        id: resource.id,
        kind: 'resource',
        label: resource.name,
        sublabel: resource.role,
        axis: resourceAxes[index % resourceAxes.length],
        value: clamp01(resource.level / 100),
        valueLabel: `capacity ${Math.round(resource.level)}`,
        state: resource.level <= 34 ? 'low' : 'available',
      })),
      ...shocks.map((shock, index) => ({
        id: shock.id,
        kind: 'shock',
        label: shock.name,
        sublabel: tick >= shock.step ? 'active shock' : `step ${shock.step}`,
        axis: shockAxes[index % shockAxes.length],
        value: clamp01(shock.intensity),
        valueLabel: tick >= shock.step ? `impact ${Math.round(shock.intensity * 100)}` : `step ${shock.step}`,
        state: tick >= shock.step ? 'active' : 'scheduled',
        active: tick >= shock.step,
        step: shock.step,
      })),
    ];

    return {
      tick,
      visual: scenario.visual || visualKindForScenario(scenario.prompt, scenario.domain),
      status: metrics.stability >= 62 ? 'stable' : metrics.stability >= 42 ? 'strained' : 'critical',
      hotspots: [
        { axis: 'stress', label: 'System load', intensity: risk, polarity: 'risk' },
        { axis: 'access', label: 'Access gap', intensity: accessRisk, polarity: 'risk' },
          { axis: 'trust', label: 'Trust gap', intensity: trustRisk, polarity: 'risk' },
          { axis: 'resources', label: 'Working capacity', intensity: stability, polarity: 'support' },
      ],
      sceneObjects,
      effects: buildVisualEffects(metrics, scenario, tick),
      markers: actors.map((actor, index) => ({
        id: actor.id,
        label: actor.name,
        axis: index % 2 === 0 ? 'actors' : 'setup',
        pressure: clamp01(actor.pressure / 100),
      })),
    };
  }

  function buildVisualEffects(metrics, scenario, tick) {
    const activeShockIds = scenario.shocks.filter((shock) => tick >= shock.step).map((shock) => shock.id);
    const load = clamp01(metrics.load / 100);
    const coverageGap = clamp01((100 - metrics.coverage) / 100);
    const trustGap = clamp01((100 - metrics.trust) / 100);
    return {
      kind: scenario.visual || visualKindForScenario(scenario.prompt, scenario.domain),
      load,
      coverageGap,
      trustGap,
      stability: clamp01(metrics.stability / 100),
      activeShockIds,
      activeShockCount: activeShockIds.length,
      pulse: clamp01(load * 0.65 + coverageGap * 0.25 + trustGap * 0.1),
    };
  }

  function stepRun(inputRunState) {
    const prev = inputRunState || createRunState();
    if (prev.complete) return prev;
    const scenario = prev.scenario;
    const tick = prev.tick + 1;
    const shockLoad = activeShockLoad(scenario, tick);
    const newShocks = scenario.shocks.filter((shock) => shock.step === tick);
    const mitigation =
      average(prev.resources, (resource) => resource.level, 50) / 100 * 0.46 +
      scenario.rules.length * 0.035 +
      scenario.goals.length * 0.018;
    const noise = seededNoise(scenario.seed, tick, 5) - 0.5;
    const load = clamp(prev.metrics.load + shockLoad * 16 - mitigation * 8 + noise * 4, 0, 100);
    const coverage = clamp(prev.metrics.coverage - shockLoad * 10 + mitigation * 7 - Math.max(0, load - 70) * 0.07, 0, 100);
    const trust = clamp(prev.metrics.trust - Math.max(0, load - 48) * 0.08 + mitigation * 4 - newShocks.length * 2, 0, 100);
    const stability = clamp((100 - load + coverage + trust) / 3, 0, 100);

    const resources = prev.resources.map((resource, index) => {
      const drift = shockLoad * (5 + index) - mitigation * 4 + (seededNoise(scenario.seed, tick, index + 11) - 0.5) * 2;
      return { ...resource, level: clamp(resource.level - drift, 0, 100) };
    });

    const actors = prev.actors.map((actor, index) => {
      const recovery = mitigation * 5 + coverage * 0.018;
      const pressure = clamp(actor.pressure + shockLoad * (6 + index) - recovery, 0, 100);
      return { ...actor, pressure };
    });

    const metrics = { load, coverage, trust, stability };
    const changes = [
      `Load ${formatDelta(load - prev.metrics.load)} to ${Math.round(load)}.`,
      `Coverage ${formatDelta(coverage - prev.metrics.coverage)} to ${Math.round(coverage)}.`,
      `Trust ${formatDelta(trust - prev.metrics.trust)} to ${Math.round(trust)}.`,
    ];

    if (newShocks.length) {
      changes.unshift(`New shock: ${newShocks.map((shock) => shock.name).join(', ')}.`);
    }

    const pressureActor = actors.reduce((winner, actor) => (actor.pressure > winner.pressure ? actor : winner), actors[0]);
    const weakResource = resources.reduce((winner, resource) => (resource.level < winner.level ? resource : winner), resources[0]);
    const title = newShocks.length
      ? `${newShocks[0].name} hits the world`
      : stability >= prev.metrics.stability
        ? 'Board absorbs pressure'
        : 'Pressure propagates';
    const text =
      stability >= 62
        ? `${scenario.title} remains stable. ${weakResource.name} is the main capacity watchpoint.`
        : stability >= 42
          ? `${scenario.title} is strained. ${pressureActor.name} carries the highest pressure.`
          : `${scenario.title} is critical. The run needs more capacity or different rules.`;

    const replayItem = {
      step: tick,
      title,
      text,
      changes,
      affects: [
        ...newShocks.map((shock) => shock.id),
        pressureActor && pressureActor.id,
        weakResource && weakResource.id,
      ].filter(Boolean),
      assumptions: scenario.assumptions.slice(0, 2),
    };

    const replay = [replayItem, ...prev.replay].slice(0, MAX_REPLAY);
    const complete = tick >= scenario.stepsPlanned;
    const map = buildMapSignals(metrics, { ...scenario, actors, resources }, tick);

    return {
      ...prev,
      tick,
      complete,
      metrics,
      actors,
      resources,
      activeShocks: scenario.shocks.filter((shock) => tick >= shock.step),
      replay,
      map,
    };
  }

  function formatDelta(value) {
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded}`;
    return String(rounded);
  }

  function runSteps(runState, count) {
    let next = runState;
    const steps = Math.max(0, Math.floor(Number(count || 0)));
    for (let i = 0; i < steps; i += 1) {
      next = stepRun(next);
      if (next.complete) break;
    }
    return next;
  }

  function summarizeRun(runState) {
    const run = runState || createRunState();
    const outcome =
      run.metrics.stability >= 62
        ? 'stable'
        : run.metrics.stability >= 42
          ? 'strained'
          : 'critical';
    return {
      outcome,
      title: run.scenario.title,
      text: `${run.scenario.title} ends ${outcome}: load ${Math.round(run.metrics.load)}, coverage ${Math.round(run.metrics.coverage)}, trust ${Math.round(run.metrics.trust)}.`,
      metrics: { ...run.metrics },
    };
  }

  function toEditableText(items, key) {
    return (items || []).map((item) => item[key] || item.name || item.text || '').filter(Boolean).join('\n');
  }

  function scenarioToEditable(scenario) {
    const normalized = normalizeScenario(scenario);
    return {
      title: normalized.title,
      prompt: normalized.prompt,
      actorsText: toEditableText(normalized.actors, 'name'),
      resourcesText: toEditableText(normalized.resources, 'name'),
      rulesText: toEditableText(normalized.rules, 'text'),
      shocksText: toEditableText(normalized.shocks, 'name'),
      goalsText: toEditableText(normalized.goals, 'text'),
    };
  }

  return {
    AXIS_LABELS,
    TEMPLATE_LIBRARY: TEMPLATE_LIBRARY.map((template) => ({
      id: template.id,
      title: template.title,
      domain: template.domain,
      prompt: template.match.slice(0, 3).join(' '),
    })),
    applyScenarioEdits,
    buildScenarioFromPrompt,
    createRunState,
    normalizeScenario,
    runSteps,
    scenarioToEditable,
    stepRun,
    summarizeRun,
  };
});
