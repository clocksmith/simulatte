(function attachSimulatteScenarioEnginescenariobuild(root) {
  const scope = root.__SimulatteScenarioEngineRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

    function clamp01(value) {
        return clamp(value, 0, 1);
      }

    function lerp(from, to, amount) {
        return from + (to - from) * amount;
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

    function nodeFromActor(actor) {
        return {
          id: actor.id,
          kind: 'actor',
          label: actor.name,
          role: actor.role,
          pressure: actor.pressure,
        };
      }

    function nodeFromResource(resource) {
        return {
          id: resource.id,
          kind: 'resource',
          label: resource.name,
          role: resource.role,
          level: resource.level,
        };
      }

    function nodeFromShock(shock) {
        return {
          id: shock.id,
          kind: 'shock',
          label: shock.name,
          intensity: shock.intensity,
          startsAt: shock.step,
        };
      }

    function stockFromResource(resource, index) {
        return {
          id: `stock-${resource.id}`,
          label: resource.name,
          kind: 'capacity',
          ownerId: resource.id,
          value: clamp(Number(resource.level ?? 50), 0, 100),
          baseline: clamp(Number(resource.level ?? 50), 0, 100),
          floor: 0,
          ceiling: 100,
          unit: 'index',
          order: index,
        };
      }

    function compileWorldSpec(inputScenario) {
        const scenario = normalizeScenario(inputScenario);
        const actorNodes = scenario.actors.map(nodeFromActor);
        const resourceNodes = scenario.resources.map(nodeFromResource);
        const shockNodes = scenario.shocks.map(nodeFromShock);
        const goalNodes = scenario.goals.map((goal) => ({
          id: goal.id,
          kind: 'goal',
          label: goal.text,
          target: goal.target,
        }));
        const stocks = [
          { id: 'stock-system-load', label: 'System load', kind: 'metric', value: 0, baseline: 0, floor: 0, ceiling: 100, unit: 'index', order: 100 },
          { id: 'stock-service-coverage', label: 'Service coverage', kind: 'metric', value: 0, baseline: 0, floor: 0, ceiling: 100, unit: 'index', order: 101 },
          { id: 'stock-public-trust', label: 'Public trust', kind: 'metric', value: 0, baseline: 0, floor: 0, ceiling: 100, unit: 'index', order: 102 },
          ...scenario.resources.map(stockFromResource),
        ];
        const causalRules = scenario.rules.map((rule, index) => {
          const actor = scenario.actors[index % Math.max(1, scenario.actors.length)];
          const resource = scenario.resources[index % Math.max(1, scenario.resources.length)];
          const shock = scenario.shocks[index % Math.max(1, scenario.shocks.length)];
          return {
            id: rule.id,
            label: `Rule ${index + 1}`,
            text: rule.text,
            weight: rule.weight,
            when: shock ? `${shock.name} is active or pressure exceeds baseline` : 'pressure exceeds baseline',
            affects: [
              actor && actor.id,
              resource && resource.id,
              'stock-system-load',
              'stock-service-coverage',
            ].filter(Boolean),
          };
        });
        const flows = causalRules.map((rule, index) => {
          const shock = scenario.shocks[index % Math.max(1, scenario.shocks.length)];
          const resource = scenario.resources[index % Math.max(1, scenario.resources.length)];
          const actor = scenario.actors[index % Math.max(1, scenario.actors.length)];
          return {
            id: `flow-${rule.id}`,
            ruleId: rule.id,
            from: shock ? shock.id : resource && resource.id,
            through: resource && resource.id,
            to: actor && actor.id,
            sign: index % 2 === 0 ? 'stress' : 'mitigation',
            strength: clamp01(0.42 + index * 0.08),
          };
        });

        return {
          schema: 'simulatte.worldSpec.v1',
          title: scenario.title,
          prompt: scenario.prompt,
          domain: scenario.domain,
          visual: scenario.visual,
          seed: scenario.seed,
          stepsPlanned: scenario.stepsPlanned,
          nodes: [...actorNodes, ...resourceNodes, ...shockNodes, ...goalNodes],
          stocks,
          flows,
          causalRules,
          metrics: ['load', 'coverage', 'trust', 'stability'],
          renderer: {
            scene: 'magnetic-board',
            particles: 'webgpu-if-available',
            fallback: 'canvas-2d',
          },
          assumptions: scenario.assumptions.slice(),
        };
      }

    function stocksForState(resources, metrics, worldSpec) {
        const byResourceId = Object.fromEntries((resources || []).map((resource) => [resource.id, resource]));
        return (worldSpec.stocks || []).map((stock) => {
          let value = stock.value;
          if (stock.id === 'stock-system-load') value = metrics.load;
          else if (stock.id === 'stock-service-coverage') value = metrics.coverage;
          else if (stock.id === 'stock-public-trust') value = metrics.trust;
          else if (stock.ownerId && byResourceId[stock.ownerId]) value = byResourceId[stock.ownerId].level;
          return {
            ...stock,
            value: clamp(Number(value ?? 0), stock.floor ?? 0, stock.ceiling ?? 100),
          };
        });
      }

    function stockDeltas(previousStocks, nextStocks) {
        const previousById = Object.fromEntries((previousStocks || []).map((stock) => [stock.id, stock]));
        return (nextStocks || [])
          .map((stock) => {
            const prev = previousById[stock.id];
            const delta = stock.value - (prev ? prev.value : stock.baseline || 0);
            return {
              id: stock.id,
              label: stock.label,
              from: prev ? prev.value : stock.baseline || 0,
              to: stock.value,
              delta,
            };
          })
          .filter((change) => Math.abs(change.delta) >= 0.1);
      }

    function activeRulesForStep(scenario, tick, shockLoad) {
        return scenario.rules
          .map((rule, index) => {
            const shock = scenario.shocks[index % Math.max(1, scenario.shocks.length)];
            const fires =
              shockLoad > 0.08 ||
              (shock && tick >= shock.step) ||
              (tick + index) % Math.max(2, scenario.rules.length) === 0;
            if (!fires) return null;
            return {
              id: rule.id,
              text: rule.text,
              weight: rule.weight,
              shockId: shock && tick >= shock.step ? shock.id : '',
            };
          })
          .filter(Boolean);
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
        const worldSpec = compileWorldSpec(scenario);
        const resourceLevel = average(scenario.resources, (resource) => resource.level, 50);
        const actorPressure = average(scenario.actors, (actor) => actor.pressure, 30);
        const initialLoad = clamp(26 + actorPressure * 0.28 - resourceLevel * 0.1, 0, 100);
        const initialCoverage = clamp(64 + resourceLevel * 0.2 - actorPressure * 0.18, 0, 100);
        const initialTrust = clamp(68 - actorPressure * 0.12 + scenario.rules.length * 1.5, 0, 100);
        const metrics = {
          load: initialLoad,
          coverage: initialCoverage,
          trust: initialTrust,
          stability: clamp((100 - initialLoad + initialCoverage + initialTrust) / 3, 0, 100),
        };
        const stocks = stocksForState(scenario.resources, metrics, worldSpec);
        return {
          scenario,
          worldSpec,
          tick: 0,
          complete: false,
          metrics,
          stocks,
          actors: scenario.actors.map((actor) => ({ ...actor })),
          resources: scenario.resources.map((resource) => ({ ...resource })),
          activeShocks: [],
          replay: [
            {
              step: 0,
              title: 'Board setup committed',
              text: `${scenario.title} is ready with ${scenario.actors.length} actors, ${scenario.resources.length} resources, ${scenario.rules.length} rules, and ${scenario.shocks.length} shocks.`,
              changes: ['Initial state placed on the Simulatte board.'],
              cause: {
                firedRules: [],
                stockDeltas: stocks.map((stock) => ({
                  id: stock.id,
                  label: stock.label,
                  from: stock.baseline || 0,
                  to: stock.value,
                  delta: stock.value - (stock.baseline || 0),
                })),
              },
              affects: [
                ...scenario.actors.slice(0, 4).map((actor) => actor.id),
                ...scenario.resources.slice(0, 4).map((resource) => resource.id),
                ...scenario.shocks.slice(0, 3).map((shock) => shock.id),
              ],
              assumptions: scenario.assumptions.slice(0, 2),
            },
          ],
          map: buildMapSignals(metrics, scenario, 0, worldSpec, stocks, []),
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

    function buildMapSignals(metrics, scenario, tick, worldSpec, stocks, firedRules) {
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
          worldSpec: worldSpec
            ? {
                schema: worldSpec.schema,
                nodes: worldSpec.nodes.length,
                stocks: worldSpec.stocks.length,
                flows: worldSpec.flows.length,
                rules: worldSpec.causalRules.length,
              }
            : null,
          visual: scenario.visual || visualKindForScenario(scenario.prompt, scenario.domain),
          status: metrics.stability >= 62 ? 'stable' : metrics.stability >= 42 ? 'strained' : 'critical',
          hotspots: [
            { axis: 'stress', label: 'System load', intensity: risk, polarity: 'risk' },
            { axis: 'access', label: 'Access gap', intensity: accessRisk, polarity: 'risk' },
              { axis: 'trust', label: 'Trust gap', intensity: trustRisk, polarity: 'risk' },
              { axis: 'resources', label: 'Working capacity', intensity: stability, polarity: 'support' },
          ],
          sceneObjects,
          causalLinks: (worldSpec && worldSpec.flows ? worldSpec.flows : []).slice(0, 8),
          stocks: (stocks || []).map((stock) => ({
            id: stock.id,
            label: stock.label,
            value: stock.value,
            kind: stock.kind,
          })),
          firedRules: (firedRules || []).map((rule) => ({
            id: rule.id,
            text: rule.text,
            shockId: rule.shockId,
          })),
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
        const worldSpec = prev.worldSpec || compileWorldSpec(scenario);
        const tick = prev.tick + 1;
        const shockLoad = activeShockLoad(scenario, tick);
        const newShocks = scenario.shocks.filter((shock) => shock.step === tick);
        const firedRules = activeRulesForStep(scenario, tick, shockLoad);
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
        const stocks = stocksForState(resources, metrics, worldSpec);
        const deltas = stockDeltas(prev.stocks, stocks);
        const changes = [
          `Load ${formatDelta(load - prev.metrics.load)} to ${Math.round(load)}.`,
          `Coverage ${formatDelta(coverage - prev.metrics.coverage)} to ${Math.round(coverage)}.`,
          `Trust ${formatDelta(trust - prev.metrics.trust)} to ${Math.round(trust)}.`,
        ];

        if (newShocks.length) {
          changes.unshift(`New shock: ${newShocks.map((shock) => shock.name).join(', ')}.`);
        }
        if (firedRules.length) {
          changes.push(`${firedRules.length} causal rule${firedRules.length === 1 ? '' : 's'} fired.`);
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
          cause: {
            firedRules,
            stockDeltas: deltas.slice(0, 8),
          },
          affects: [
            ...newShocks.map((shock) => shock.id),
            pressureActor && pressureActor.id,
            weakResource && weakResource.id,
          ].filter(Boolean),
          assumptions: scenario.assumptions.slice(0, 2),
        };

        const replay = [replayItem, ...prev.replay].slice(0, MAX_REPLAY);
        const complete = tick >= scenario.stepsPlanned;
        const map = buildMapSignals(metrics, { ...scenario, actors, resources }, tick, worldSpec, stocks, firedRules);

        return {
          ...prev,
          tick,
          complete,
          metrics,
          stocks,
          worldSpec,
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
          worldSpec: run.worldSpec
            ? {
                nodes: run.worldSpec.nodes.length,
                stocks: run.worldSpec.stocks.length,
                flows: run.worldSpec.flows.length,
                rules: run.worldSpec.causalRules.length,
              }
            : null,
        };
      }

    function indexById(items) {
        return Object.fromEntries((items || []).map((item) => [item.id, item]));
      }

    function interpolateMetrics(fromMetrics, toMetrics, amount) {
        const from = fromMetrics || {};
        const to = toMetrics || {};
        const keys = Array.from(new Set([...Object.keys(from), ...Object.keys(to)]));
        return Object.fromEntries(keys.map((key) => [
          key,
          lerp(Number(from[key] || 0), Number(to[key] || 0), amount),
        ]));
      }

    function interpolateActors(fromActors, toActors, amount) {
        const fromById = indexById(fromActors);
        return (toActors || []).map((actor) => {
          const from = fromById[actor.id] || actor;
          return {
            ...actor,
            pressure: lerp(Number(from.pressure || 0), Number(actor.pressure || 0), amount),
          };
        });
      }

    function interpolateResources(fromResources, toResources, amount) {
        const fromById = indexById(fromResources);
        return (toResources || []).map((resource) => {
          const from = fromById[resource.id] || resource;
          return {
            ...resource,
            level: lerp(Number(from.level || 0), Number(resource.level || 0), amount),
          };
        });
      }

    function interpolateStocks(fromStocks, toStocks, amount) {
        const fromById = indexById(fromStocks);
        return (toStocks || []).map((stock) => {
          const from = fromById[stock.id] || stock;
          return {
            ...stock,
            value: lerp(Number(from.value || 0), Number(stock.value || 0), amount),
          };
        });
      }

    Object.assign(scope, {
      clamp,
      clamp01,
      lerp,
      slugify,
      hashString,
      seededNoise,
      itemId,
      listFromLines,
      scoreTemplate,
      chooseTemplate,
      visualKindForScenario,
      actorFromTuple,
      resourceFromTuple,
      shockFromTuple,
      ruleFromText,
      goalFromText,
      buildScenarioFromPrompt,
      normalizeScenario,
      nodeFromActor,
      nodeFromResource,
      nodeFromShock,
      stockFromResource,
      compileWorldSpec,
      stocksForState,
      stockDeltas,
      activeRulesForStep,
      applyScenarioEdits,
      average,
      createRunState,
      activeShockLoad,
      buildMapSignals,
      buildVisualEffects,
      stepRun,
      formatDelta,
      runSteps,
      summarizeRun,
      indexById,
      interpolateMetrics,
      interpolateActors,
      interpolateResources,
      interpolateStocks,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
