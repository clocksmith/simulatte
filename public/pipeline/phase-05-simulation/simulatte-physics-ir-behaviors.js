(function attachSimulattePhysicsIRbehaviors(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function addBehaviorBundleFromEdge(couplings, operators, fields, from, to, edge, params, receipt, behaviorRelations) {
        const process = behaviorProcessForText(behaviorText(edge, from, to));
        if (!process || process === 'coexists') return false;
        addBehaviorBundle(couplings, operators, fields, from, to, process, edge, params, receipt, behaviorRelations);
        return true;
      }

    function addBehaviorBundlesFromLedger(couplings, operators, fields, domains, ledger, prompt, params, receipt, behaviorRelations) {
        if (!ledger || !Array.isArray(ledger.obligations)) return;
        for (const row of ledger.obligations) {
          if (row.kind !== 'action' && row.kind !== 'relation') continue;
          const process = behaviorProcessForLedgerRow(row, prompt);
          if (!process || process === 'coexists') continue;
          const pair = behaviorDomainsForLedgerRow(row, domains, process);
          if (!pair.from || !pair.to) continue;
          addBehaviorBundle(couplings, operators, fields, pair.from, pair.to, process, row, params, receipt, behaviorRelations);
        }
      }

    function behaviorProcessForLedgerRow(row = {}, prompt = '') {
        const explicit = explicitLedgerProcess(row);
        const direct = behaviorProcessForText(explicit);
        if (direct && direct !== 'coexists') return direct;
        const local = behaviorProcessForText([row.id, row.action, row.process, row.target].filter(Boolean).join(' '));
        if (local && local !== 'coexists') return local;
        return behaviorProcessForText(prompt);
      }

    function explicitLedgerProcess(row = {}) {
        const id = String(row.id || '');
        const parts = id.split(':');
        if (parts[0] === 'action' && parts[1]) return parts[1];
        if (parts[0] === 'relation' && parts[2]) return parts[2];
        return row.action || row.process || '';
      }

    function addBehaviorBundle(couplings, operators, fields, from, to, process, source, params, receipt, behaviorRelations) {
        const opRows = [];
        const add = (type, sourceDomain = from, targetDomain = to) => {
          ensureBehaviorFields(fields, type, sourceDomain, targetDomain, params);
          const op = addBehaviorOperator(operators, type, sourceDomain, targetDomain, params, source) ||
            addCouplingOperator(operators, type, sourceDomain, targetDomain, params, source);
          opRows.push(op);
          couplings.push({
            from: sourceDomain.id,
            to: targetDomain.id,
            type,
            operatorId: op.id,
            processId: process,
          });
        };
        if (process === 'rotate') add('rotational_torque', fluidDomain(from, to) || from, rotationalDomain(from, to) || to);
        else if (process === 'impact') {
          add('rigid_collision', movingDomain(from, to), impactDomain(from, to));
          add('fracture_threshold', impactDomain(from, to), impactDomain(from, to));
        } else if (process === 'flow') {
          const flow = fluidDomain(from, to) || to;
          ensureFlowFields(fields, flow, params);
          opRows.push(addOperator(operators, 'advection', flow, {
            reads: [`flowVelocity:${flow.entityId}`, `viscosity:${flow.entityId}`],
            writes: [`flowVelocity:${flow.entityId}`, `pressure:${flow.entityId}`],
            params: { rate: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.55), 0, 2) },
          }));
          add('pressure_flow_lite', flow, flow);
        } else if (process === 'growth') {
          const target = biologicalDomain(from, to) || to;
          add('growth_decay', target, target);
          add('reaction_diffusion', target, target);
        } else if (process === 'diffusion') add('reaction_diffusion', to, to);
        else if (process === 'heat_transfer' || process === 'cooling') add('heat_transfer', from, to);
        else if (process === 'phase_transition') {
          add('phase_transition', to, to);
          add('heat_transfer', from, to);
        } else if (process === 'network_flow') add('network_flow', networkDomain(from, to) || to, networkDomain(from, to) || to);
        else if (process === 'oscillation' || process === 'orbital') add('wave_field', waveDomain(from, to) || to, waveDomain(from, to) || to);
        else if (process === 'motion') {
          const flow = fluidDomain(from, to);
          if (flow) {
            ensureFlowFields(fields, flow, params);
            opRows.push(addOperator(operators, 'advection', flow, {
              reads: [`flowVelocity:${flow.entityId}`, `viscosity:${flow.entityId}`],
              writes: [`flowVelocity:${flow.entityId}`, `pressure:${flow.entityId}`],
              params: { rate: clamp(Number(params.windSpeed ?? params.flowRate ?? 0.58), 0, 2) },
            }));
          }
          add('rigid_collision', movingDomain(from, to), impactDomain(from, to));
        }
        const operatorTypes = unique(opRows.map((op) => op.type));
        if (!operatorTypes.length) return;
        behaviorRelations.push({
          schema: 'simulatte.behaviorRelation.v1',
          id: `behavior:${process}:${from.entityId}:${to.entityId}`,
          process,
          agentEntityId: from.entityId,
          mediumEntityId: to.entityId,
          relation: source.type || source.kind || 'behavior',
          spatialRelation: source.prepositions && source.prepositions[0] || '',
          operators: operatorTypes,
          evidence: source.evidence || [source.id || 'phase3-composition-ledger'],
          status: 'lowered',
        });
        receipt.exact.push({
          promptSpan: source.id || `${from.entityId} ${process} ${to.entityId}`,
          canonicalId: `behavior.${process}`,
          confidence: source.confidence || 0.68,
          evidence: source.evidence || ['phase3-composition-ledger'],
        });
      }

    function addBehaviorOperator(operators, type, from, to, params) {
        const id = to.entityId;
        if (type === 'growth_decay') {
          return addOperator(operators, type, to, {
            reads: [`density:${id}`, `nutrient:${id}`],
            writes: [`density:${id}`, `nutrient:${id}`],
            params: { rate: clamp01(Number(params.populationGrowth || 0.32)) },
          });
        }
        if (type === 'reaction_diffusion') {
          return addOperator(operators, type, to, {
            reads: [`reactionProgress:${id}`],
            writes: [`reactionProgress:${id}`],
            params: { rate: clamp01(Number(params.catalyst || params.combustibility || 0.46)) },
          });
        }
        if (type === 'network_flow') {
          return addOperator(operators, type, to, {
            reads: [`backlog:${id}`, `throughput:${id}`, `signalDelay:${id}`],
            writes: [`backlog:${id}`, `throughput:${id}`],
            params: { demand: clamp01(Number(params.marketDemand || params.queueBacklog || 0.52)) },
          });
        }
        if (type === 'wave_field') {
          return addOperator(operators, type, to, {
            reads: [`phase:${id}`, `amplitude:${id}`],
            writes: [`phase:${id}`, `amplitude:${id}`],
            params: { frequency: clamp(Number(params.soundFrequency || 0.7), 0.05, 4) },
          });
        }
        return null;
      }

    function behaviorProcessForText(text = '') {
        const value = String(text || '').toLowerCase().replace(/[_-]+/g, ' ');
        const lexicon = languageLexicon && (
          languageLexicon.BEHAVIOR_PROCESS_LEXICON ||
          languageLexicon.LANGUAGE_LEXICON && languageLexicon.LANGUAGE_LEXICON.behaviorProcessLexicon
        ) || [];
        for (const row of lexicon) {
          const phrases = Array.isArray(row && row.phrases) ? row.phrases : [];
          if (phrases.some((phrase) => behaviorPhraseInText(phrase, value))) return row.process || '';
        }
        return '';
      }

    function behaviorPhraseInText(phrase = '', text = '') {
        const normalized = String(phrase || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
        if (!normalized) return false;
        return new RegExp(`\\b${escapeBehaviorPhrase(normalized)}\\b`).test(text);
      }

    function escapeBehaviorPhrase(value = '') {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
      }

    function behaviorDomainsForLedgerRow(row, domains, process) {
        const id = String(row.id || '').replace(/[_-]+/g, ' ').toLowerCase();
        const parts = id.split(':');
        const left = parts[1] || '';
        const right = parts[3] || parts[1] || '';
        const from = bestDomainForText(domains, left, process) || domains[0];
        const to = bestDomainForText(domains, right, process) || bestTargetDomain(domains, process) || from;
        return { from, to };
      }

    function bestDomainForText(domains, text, process) {
        const value = String(text || '').toLowerCase();
        return (domains || []).find((domain) => domainMatches(domain, value)) || bestTargetDomain(domains, process);
      }

    function bestTargetDomain(domains, process) {
        if (process === 'network_flow') return (domains || []).find((domain) => domain.kind === 'network');
        if (process === 'flow') return (domains || []).find((domain) => domain.kind === 'fluid');
        if (process === 'oscillation') return (domains || []).find((domain) => hasTag(domain, 'wave') || domain.kind === 'field');
        if (process === 'growth') return (domains || []).find((domain) => hasTag(domain, 'biological') || hasTag(domain, 'growth'));
        return (domains || []).find((domain) => domain.kind === 'rigidBody') || (domains || [])[0];
      }

    function domainMatches(domain, text) {
        const value = `${domain.entityId || ''} ${domain.materialId || ''} ${(domain.tags || []).join(' ')}`.toLowerCase().replace(/[_-]+/g, ' ');
        return text && text.split(/\s+/).some((term) => term.length > 2 && value.includes(term));
      }

    function ensureBehaviorFields(fields, type, from, to, params) {
        ensureMotionFields(fields, from);
        ensureMotionFields(fields, to);
        if (type === 'rotational_torque') {
          addField(fields, to, 'angularMomentum', 'scalar', 'kg*m2/s', 0);
          addField(fields, to, 'friction', 'scalar', 'ratio', 0.16);
        }
        if (type === 'rigid_collision' || type === 'fracture_threshold') {
          addField(fields, to, 'stress', 'scalar', 'Pa', 0);
          addField(fields, to, 'damage', 'scalar', 'ratio', 0);
          addField(fields, to, 'debris', 'scalar', 'ratio', 0);
        }
        if (type === 'pressure_flow_lite') ensureFlowFields(fields, to, params);
        if (type === 'growth_decay' || type === 'reaction_diffusion') {
          addField(fields, to, 'density', 'scalar', 'ratio', 0.28);
          addField(fields, to, 'nutrient', 'scalar', 'ratio', 0.62);
          addField(fields, to, 'reactionProgress', 'scalar', 'ratio', 0.08);
          addField(fields, to, 'acidity', 'scalar', 'ratio', 0.34);
        }
        if (type === 'heat_transfer' || type === 'phase_transition') {
          addField(fields, from, 'temperature', 'scalar', 'K', materialTemperature(from.materialId, params));
          addField(fields, to, 'temperature', 'scalar', 'K', materialTemperature(to.materialId, params));
          addField(fields, to, 'liquidFraction', 'scalar', 'ratio', to.materialId === 'water' ? 1 : 0);
        }
        if (type === 'network_flow') {
          addField(fields, to, 'backlog', 'scalar', 'ratio', clamp01(Number(params.queueBacklog || 0.35)));
          addField(fields, to, 'throughput', 'scalar', 'ratio', clamp01(Number(params.serviceRate || 0.42)));
          addField(fields, to, 'signalDelay', 'scalar', 's', clamp01(Number(params.networkLatency || params.signalDelay || 0.2)));
        }
        if (type === 'wave_field') {
          addField(fields, to, 'phase', 'scalar', 'rad', 0);
          addField(fields, to, 'amplitude', 'scalar', 'ratio', clamp01(Number(params.waveAmplitude || 0.44)));
        }
      }

    function ensureMotionFields(fields, domain) {
        addField(fields, domain, 'velocity', 'vector2', 'm/s', { x: 0, y: 0 });
        addField(fields, domain, 'force', 'vector2', 'N', { x: 0, y: 0 });
      }

    function ensureFlowFields(fields, domain, params) {
        addField(fields, domain, 'flowVelocity', 'vector2', 'm/s', {
          x: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.55), -2, 2),
          y: 0,
        });
        addField(fields, domain, 'pressure', 'scalar', 'kPa', 0.34);
        addField(fields, domain, 'viscosity', 'scalar', 'Pa*s', materialViscosity(domain.materialId));
        addField(fields, domain, 'erosion', 'scalar', 'ratio', 0);
      }

    function behaviorText(edge, from, to) {
        return [edge.type, edge.processId, edge.relation, edge.causalAffordance, from.entityId, to.entityId].filter(Boolean).join(' ');
      }

    function fluidDomain(a, b) { return [a, b].find((domain) => domain && domain.kind === 'fluid'); }
    function networkDomain(a, b) { return [a, b].find((domain) => domain && domain.kind === 'network'); }
    function waveDomain(a, b) { return [a, b].find((domain) => domain && (hasTag(domain, 'wave') || domain.kind === 'field')); }
    function rotationalDomain(a, b) { return [a, b].find((domain) => domain && isRotationalDomain(domain)); }
    function biologicalDomain(a, b) { return [a, b].find((domain) => domain && (hasTag(domain, 'biological') || hasTag(domain, 'growth') || hasTag(domain, 'protein'))); }
    function movingDomain(a, b) { return [a, b].find((domain) => domain && domain.kind !== 'field') || a || b; }
    function impactDomain(a, b) { return [b, a].find((domain) => domain && domain.kind !== 'fluid') || b || a; }

    Object.assign(scope, {
      addBehaviorBundleFromEdge,
      addBehaviorBundlesFromLedger,
      addBehaviorBundle,
      behaviorProcessForText,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
