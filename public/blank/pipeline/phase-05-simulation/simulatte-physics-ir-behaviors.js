(function attachSimulattePhysicsIRbehaviors(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function addBehaviorBundleFromEdge(couplings, operators, fields, from, to, edge, params, receipt, behaviorRelations) {
        const process = behaviorProcessForText(edge.processId) ||
          behaviorProcessForText(edge.operatorType) ||
          behaviorProcessForText(behaviorText(edge, from, to));
        if (!process || process === 'coexists') return false;
        addBehaviorBundle(couplings, operators, fields, from, to, process, edge, params, receipt, behaviorRelations);
        return true;
      }

    function addBehaviorBundleFromPartialEdge(couplings, operators, fields, from, to, edge, params, receipt, behaviorRelations) {
        const process = behaviorProcessForText(behaviorText(edge, from, to));
        const target = from || to;
        if (!target) return false;
        if (process === 'combustion') {
          const fuel = combustionFuelDomain(from, to);
          if (!fuel) return false;
          addBehaviorBundle(couplings, operators, fields, fuel, fuel, 'combustion', edge, params, receipt, behaviorRelations);
          return true;
        }
        if (process === 'flow' && target.kind === 'fluid') {
          addBehaviorBundle(couplings, operators, fields, target, target, 'flow', edge, params, receipt, behaviorRelations);
          return true;
        }
        if (process === 'heat_transfer' && !from && to) {
          return addPartialHeatSource(operators, fields, to, edge, params, receipt, behaviorRelations);
        }
        if (edge.operatorType !== 'wave_field' || !edge.provenance?.causalRuleId || !target) return false;
        addBehaviorBundle(couplings, operators, fields, target, target, 'oscillation', edge, params, receipt, behaviorRelations);
        return true;
      }

    function addPartialHeatSource(operators, fields, target, source, params, receipt, behaviorRelations) {
        addField(fields, target, 'temperature', 'scalar', 'K', materialTemperature(target.materialId, params));
        const output = `temperature:${target.entityId}`;
        const operator = addOperator(operators, 'heat_source', target, {
          reads: [],
          writes: [output],
          params: { strength: clamp(Number(params.thermalFlux || params.heatTransfer || 0.5), 0.02, 2) },
          receipt: behaviorChannelReceipt(source, 'heat_source', [], [output]),
        });
        const behaviorId = `behavior:heat_source:${target.entityId}`;
        if (!behaviorRelations.some((row) => row.id === behaviorId)) behaviorRelations.push({
          schema: 'simulatte.behaviorRelation.v1',
          id: behaviorId,
          process: 'heat_transfer',
          agentEntityId: target.entityId,
          mediumEntityId: target.entityId,
          relation: source.type || 'heatTransfer',
          spatialRelation: source.spatialRelation || '',
          operators: ['heat_source'],
          supersedesProcessIds: [],
          evidence: unique([...(source.evidence || []), source.id || 'causal-heat-source']),
          status: 'lowered',
        });
        receipt.exact.push({
          promptSpan: source.id || target.entityId,
          canonicalId: 'behavior.heat_source',
          confidence: source.confidence || 0.68,
          evidence: source.evidence || [],
          operatorId: operator.id,
        });
        return true;
      }

    function addBehaviorBundlesFromNodeActivity(couplings, operators, fields, nodes, domainByNode, params, receipt, behaviorRelations) {
        for (const node of nodes || []) {
          const domain = domainByNode.get(node.id);
          if (!domain || !nodeOwnsExecutableActivity(node)) continue;
          for (const hint of unique([...(node.operatorTypes || []), ...(node.operatorHints || [])])) {
            const process = behaviorProcessForText(hint);
            if (!nodeActivityCanSelfApply(process, domain)) continue;
            if (behaviorRelations.some((row) => (
              row.process === process && row.agentEntityId === domain.entityId && row.mediumEntityId === domain.entityId
            ))) continue;
            const source = {
              ...node,
              id: `node-activity:${node.id}:${process}`,
              kind: 'node-owned-activity',
              evidence: unique([...(node.evidence || []), `operator-hint:${hint}`]),
            };
            addBehaviorBundle(couplings, operators, fields, domain, domain, process, source, params, receipt, behaviorRelations);
          }
        }
      }

    function nodeActivityCanSelfApply(process = '', domain = {}) {
        if (process === 'flow') return domain.kind === 'fluid';
        return ['folding', 'growth', 'network_flow', 'orbital', 'oscillation', 'rotate'].includes(process);
      }

    function nodeOwnsExecutableActivity(node = {}) {
        if (node.supportOnly === true) return false;
        const hints = unique([...(node.operatorTypes || []), ...(node.operatorHints || [])]);
        if (!hints.length) return false;
        const role = String(node.semanticRole || '').toLowerCase();
        const type = String(node.semanticType || node.type || '').toLowerCase();
        return /-process$/.test(role) || /(process|control|event|operator)$/.test(type);
      }

    function addBehaviorBundlesFromLedger(couplings, operators, fields, domains, ledger, prompt, params, receipt, behaviorRelations) {
        if (!ledger || !Array.isArray(ledger.obligations)) return;
        const causalBehaviors = behaviorRelations.filter((row) => (
          (row.evidence || []).some((value) => String(value).startsWith('causal-rule:'))
        ));
        const relationById = new Map((ledger.relations || []).map((row) => [row.id, row]));
        const relationProcesses = new Set(ledger.obligations
          .filter((row) => row.kind === 'relation')
          .map((row) => behaviorProcessForLedgerRow({
            ...row,
            ...(relationById.get(row.sourceRelationId || row.id) || {}),
          }, prompt))
          .filter(Boolean));
        for (const row of ledger.obligations) {
          if (row.kind !== 'action' && row.kind !== 'relation') continue;
          const source = row.kind === 'relation' ? {
            ...row,
            ...(relationById.get(row.sourceRelationId || row.id) || {}),
          } : row;
          const process = behaviorProcessForLedgerRow(source, prompt);
          if (!process || process === 'coexists') continue;
          if (row.kind === 'action' && relationProcesses.has(process)) continue;
          const pair = behaviorDomainsForLedgerRow(source, domains, process);
          if (!pair.from || !pair.to) continue;
          if (causalBehaviors.some((behavior) => (
            sameDomainPair(behavior, pair) && (
              behavior.process === process ||
              (behavior.supersedesProcessIds || []).includes(process)
            )
          ))) continue;
          addBehaviorBundle(couplings, operators, fields, pair.from, pair.to, process, source, params, receipt, behaviorRelations);
        }
      }

    function sameDomainPair(behavior = {}, pair = {}) {
        const expected = new Set([pair.from.entityId, pair.to.entityId]);
        return expected.size <= 2 &&
          expected.has(behavior.agentEntityId) && expected.has(behavior.mediumEntityId);
      }

    function behaviorProcessForLedgerRow(row = {}, prompt = '') {
        const explicit = explicitLedgerProcess(row);
        const direct = behaviorProcessForText(explicit);
        if (direct && direct !== 'coexists') return direct;
        const local = behaviorProcessForText([row.action, row.process, row.predicate].filter(Boolean).join(' '));
        if (local && local !== 'coexists') return local;
        return '';
      }

    function explicitLedgerProcess(row = {}) {
        if (row.process) return row.process;
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
          if (!op.receipt) {
            op.receipt = behaviorChannelReceipt(source, type, op.reads || [], op.writes || []);
          }
          opRows.push(op);
          couplings.push({
            from: sourceDomain.id,
            to: targetDomain.id,
            type,
            operatorId: op.id,
            processId: process,
          });
        };
        const operatorBundle = source.provenance?.groundingPolicy?.operatorBundle ||
          source.groundingPolicy?.operatorBundle || [];
        if (operatorBundle.length) operatorBundle.forEach((type) => add(type));
        else if (process === 'rotate') add('rotational_torque', fluidDomain(from, to) || from, rotationalDomain(from, to) || to);
        else if (process === 'impact') {
          add('rigid_collision', movingDomain(from, to), impactDomain(from, to));
          add('fracture_threshold', impactDomain(from, to), impactDomain(from, to));
        } else if (process === 'flow') {
          const network = networkDomain(from, to);
          if (network) {
            add('network_flow', network, network);
          } else {
          const flow = fluidDomain(from, to) || to;
          ensureFlowFields(fields, flow, params);
          const reads = [`flowVelocity:${flow.entityId}`, `viscosity:${flow.entityId}`];
          const writes = [`flowVelocity:${flow.entityId}`, `pressure:${flow.entityId}`];
          opRows.push(addOperator(operators, 'advection', flow, {
            reads,
            writes,
            params: { rate: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.55), 0, 2) },
            receipt: inferredBehaviorReceipt(source, 'advection', reads, writes),
          }));
          add('pressure_flow_lite', flow, flow);
          }
        } else if (process === 'increase') {
          const network = networkDomain(from, to);
          const fluid = fluidDomain(from, to);
          if (network && !fluid) add('network_flow', network, network);
          else if (fluid) {
            ensureFlowFields(fields, fluid, params);
            opRows.push(addOperator(operators, 'advection', fluid, {
              reads: [`flowVelocity:${fluid.entityId}`, `viscosity:${fluid.entityId}`],
              writes: [`flowVelocity:${fluid.entityId}`, `pressure:${fluid.entityId}`],
              params: { rate: clamp(Number(params.flowRate ?? params.windSpeed ?? 0.55), 0, 2) },
            }));
            add('pressure_flow_lite', fluid, fluid);
          }
        } else if (process === 'leak') {
          const leakDomain = from;
          ensureFlowFields(fields, leakDomain, params);
          add('pressure_flow_lite', leakDomain, leakDomain);
        } else if (process === 'growth') {
          const target = biologicalDomain(from, to);
          if (!target) return;
          add('growth_decay', target, target);
          add('reaction_diffusion', target, target);
        } else if (process === 'combustion') {
          const fuel = combustionFuelDomain(from, to);
          if (fuel) add('combustion', fuel, fuel);
        } else if (process === 'diffusion') add('reaction_diffusion', to, to);
        else if (process === 'deposition') add('particle_deposition', from, to);
        else if (process === 'heat_transfer' || process === 'cooling') add('heat_transfer', from, to);
        else if (process === 'phase_transition') {
          add('phase_transition', to, to);
          add('heat_transfer', from, to);
        } else if (process === 'network_flow') add('network_flow', networkDomain(from, to) || to, networkDomain(from, to) || to);
        else if (process === 'folding') {
          const foldingDomain = biologicalDomain(from, to) || to;
          add('wave_field', foldingDomain, foldingDomain);
        }
        else if (process === 'oscillation' || process === 'orbital') add('wave_field', waveDomain(from, to) || to, waveDomain(from, to) || to);
        else if (process === 'measurement') add('derive_readout', from, to);
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
          supersedesProcessIds: source.provenance?.groundingPolicy?.supersedesProcessIds || [],
          evidence: unique([
            ...(source.evidence || []),
            source.id || 'phase3-composition-ledger',
            source.predicate ? `action:${source.predicate}` : '',
            source.process ? `process:${source.process}` : '',
          ]),
          status: 'lowered',
        });
        receipt.exact.push({
          promptSpan: source.id || `${from.entityId} ${process} ${to.entityId}`,
          canonicalId: `behavior.${process}`,
          confidence: source.confidence || 0.68,
          evidence: source.evidence || ['phase3-composition-ledger'],
        });
      }

    function addBehaviorOperator(operators, type, from, to, params, source = {}) {
        const id = to.entityId;
        if (type === 'rotational_torque' && from.kind !== 'fluid') {
          const reads = [
            `velocity:${from.entityId}`,
            `angle:${id}`,
            `angularVelocity:${id}`,
            `friction:${id}`,
          ];
          const writes = [`angle:${id}`, `angularVelocity:${id}`, `angularMomentum:${id}`];
          return addOperator(operators, type, to, {
            reads,
            writes,
            params: {
              coupling: clamp(Number(params.rotationCoupling || params.fieldStrength || 0.72), 0.05, 2),
              drive: clamp(Number(params.motionDrive || params.flowRate || 0.58), 0, 2),
              inertia: clamp(Number(params.rotationalInertia || 0.62), 0.05, 4),
            },
            receipt: behaviorChannelReceipt(source, type, reads, writes),
          });
        }
        if (type === 'combustion') {
          const fuelChannel = `fuel:${id}`;
          const temperatureChannel = `temperature:${id}`;
          const productChannel = `product:${id}`;
          const smokeChannel = `smoke:${id}`;
          return addOperator(operators, type, to, {
            reads: [fuelChannel, temperatureChannel],
            writes: [fuelChannel, temperatureChannel, productChannel, smokeChannel],
            params: {
              rate: clamp(Number(params.reactionRate ?? params.combustibility ?? 0.48), 0.02, 2),
              ignitionThreshold: clamp(Number(params.ignitionThreshold ?? 0.32), 0, 1.5),
              heatYield: clamp(Number(params.heatYield ?? 0.7), 0, 2),
              smokeFraction: clamp01(Number(params.smokeFraction ?? 0.3)),
            },
            receipt: {
              schema: 'simulatte.solverChannelReceipt.v1',
              operatorType: 'combustion',
              sourceEdgeId: source.id || '',
              evidence: source.evidence || [],
              consumedChannels: [fuelChannel],
              producedChannels: [productChannel, smokeChannel, temperatureChannel],
            },
          });
        }
        if (type === 'growth_decay') {
          const channels = [`density:${id}`, `nutrient:${id}`];
          return addOperator(operators, type, to, {
            reads: channels,
            writes: channels,
            params: { rate: clamp01(Number(params.populationGrowth || 0.32)) },
            receipt: behaviorChannelReceipt(source, type, channels, channels),
          });
        }
        if (type === 'reaction_diffusion') {
          const channels = [`reactionProgress:${id}`];
          return addOperator(operators, type, to, {
            reads: channels,
            writes: channels,
            params: { rate: clamp01(Number(params.catalyst || params.combustibility || 0.46)) },
            receipt: behaviorChannelReceipt(source, type, channels, channels),
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
          const reads = [`phase:${id}`, `amplitude:${id}`];
          return addOperator(operators, type, to, {
            reads,
            writes: reads,
            params: { frequency: clamp(Number(params.soundFrequency || 0.7), 0.05, 4) },
            receipt: inferredBehaviorReceipt(source, type, reads, reads),
          });
        }
        if (type === 'derive_readout') {
          const channels = [`signal:${id}`];
          return addOperator(operators, type, to, {
            reads: channels,
            writes: channels,
            params: {
              gain: clamp(Number(params.measurementGain || 0.76), 0.05, 2),
              frequency: clamp(Number(params.measurementFrequency || 2.4), 0.1, 8),
            },
            receipt: inferredBehaviorReceipt(source, type, channels, channels),
          });
        }
        return null;
      }

    function inferredBehaviorReceipt(source = {}, operatorType = '', reads = [], writes = []) {
        if (!source.inferred || !source.provenance) return null;
        return behaviorChannelReceipt(source, operatorType, reads, writes);
      }

    function behaviorChannelReceipt(source = {}, operatorType = '', reads = [], writes = []) {
        const evidence = unique([
          ...(source.evidence || []),
          ...(source.evidenceIds || []),
          ...(source.sourceSpanIds || []),
          source.receiptId || '',
        ]);
        return {
          schema: 'simulatte.solverChannelReceipt.v1',
          operatorType,
          sourceEdgeId: source.id || '',
          evidence,
          consumedChannels: reads,
          producedChannels: writes,
          ...(source.inferred && source.provenance
            ? { inferenceProvenance: { ...source.provenance } }
            : {}),
        };
      }

    function behaviorProcessForText(text = '') {
        const value = String(text || '').toLowerCase().replace(/[_-]+/g, ' ');
        const lexicon = languageLexicon && (
          languageLexicon.BEHAVIOR_PROCESS_LEXICON ||
          languageLexicon.LANGUAGE_LEXICON && languageLexicon.LANGUAGE_LEXICON.behaviorProcessLexicon
        ) || [];
        const exact = lexicon.find((row) => (
          String(row && row.process || '').toLowerCase().replace(/[_-]+/g, ' ') === value
        ));
        if (exact) return exact.process || '';
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
        const left = String(row.from || parts[1] || '').replace(/^[a-z]+:/, '');
        const right = String(row.target || row.to || parts[3] || parts[1] || '').replace(/^[a-z]+:/, '');
        const from = bestDomainForText(domains, left, process) || domains[0];
        const to = bestDomainForText(domains, right, process) || bestTargetDomain(domains, process) || from;
        return { from, to };
      }

    function bestDomainForText(domains, text, process) {
        const value = String(text || '').toLowerCase().replace(/[_-]+/g, ' ');
        const ranked = (domains || []).map((domain) => ({
          domain,
          score: domainMatchScore(domain, value),
        })).sort((a, b) => b.score - a.score || a.domain.order - b.domain.order);
        return ranked[0] && ranked[0].score > 0 ? ranked[0].domain : bestTargetDomain(domains, process);
      }

    function bestTargetDomain(domains, process) {
        if (process === 'network_flow') return (domains || []).find((domain) => domain.kind === 'network');
        if (process === 'flow') return (domains || []).find((domain) => domain.kind === 'fluid');
        if (process === 'oscillation') return (domains || []).find((domain) => hasTag(domain, 'wave') || domain.kind === 'field');
        if (process === 'growth') return (domains || []).find((domain) => hasTag(domain, 'biological') || hasTag(domain, 'growth'));
        return (domains || []).find((domain) => domain.kind === 'rigidBody') || (domains || [])[0];
      }

    function domainMatchScore(domain, text) {
        const query = String(text || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
        const identity = `${domain.entityId || ''} ${domain.sourceNodeId || ''}`
          .toLowerCase().replace(/[_-]+/g, ' ');
        const evidence = `${domain.materialId || ''} ${(domain.tags || []).join(' ')}`
          .toLowerCase().replace(/[_-]+/g, ' ');
        const identityRows = [domain.entityId, domain.sourceNodeId].map((value) => (
          String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim()
        ));
        const exactIdentity = identityRows.some((value) => (
          value === query || value.endsWith(` ${query}`)
        ));
        const terms = unique(query.split(/\s+/).filter((term) => term.length > 2));
        const identityScore = terms.reduce((score, term) => score + Number(identity.includes(term)) * 3, 0);
        const evidenceScore = terms.reduce((score, term) => score + Number(evidence.includes(term)), 0);
        return Number(exactIdentity) * 12 + identityScore + evidenceScore;
      }

    function ensureBehaviorFields(fields, type, from, to, params) {
        ensureMotionFields(fields, from);
        ensureMotionFields(fields, to);
        if (type === 'rotational_torque') {
          if (from.kind === 'fluid') ensureFlowFields(fields, from, params);
          addField(fields, to, 'angle', 'scalar', 'rad', 0);
          addField(fields, to, 'angularVelocity', 'scalar', 'rad/s', 0);
          addField(fields, to, 'angularMomentum', 'scalar', 'kg*m2/s', 0);
          addField(fields, to, 'friction', 'scalar', 'ratio', 0.16);
        }
        if (type === 'rigid_collision' || type === 'fracture_threshold') {
          addField(fields, to, 'stress', 'scalar', 'Pa', 0);
          addField(fields, to, 'damage', 'scalar', 'ratio', 0);
          addField(fields, to, 'debris', 'scalar', 'ratio', 0);
        }
        if (type === 'pressure_flow_lite') ensureFlowFields(fields, to, params);
        if (type === 'combustion') {
          const ignitionThreshold = clamp(Number(params.ignitionThreshold ?? 0.32), 0, 1.5);
          addField(fields, to, 'fuel', 'scalar', 'ratio', clamp01(Number(params.combustibility ?? 0.72)));
          addField(fields, to, 'temperature', 'scalar', 'K', Math.max(
            materialTemperature(to.materialId, params),
            ignitionThreshold + 0.08
          ));
          addField(fields, to, 'product', 'scalar', 'ratio', 0);
          addField(fields, to, 'smoke', 'scalar', 'ratio', 0);
        }
        if (type === 'growth_decay' || type === 'reaction_diffusion') {
          addField(fields, to, 'density', 'scalar', 'ratio', 0.28);
          addField(fields, to, 'nutrient', 'scalar', 'ratio', 0.62);
          addField(fields, to, 'reactionProgress', 'scalar', 'ratio', 0.08);
          addField(fields, to, 'acidity', 'scalar', 'ratio', 0.34);
        }
        if (type === 'particle_deposition') {
          addField(fields, to, 'airborneDensity', 'scalar', 'ratio', 0.72);
          addField(fields, to, 'depositedMass', 'scalar', 'kg/m2', 0.04);
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
        if (type === 'derive_readout') {
          addField(fields, to, 'signal', 'scalar', 'ratio', 0.08);
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
        void from;
        void to;
        return [edge.processId, edge.type, edge.relation, edge.causalAffordance].filter(Boolean).join(' ');
      }

    function combustionFuelDomain(a, b) {
        return [a, b].find((domain) => domain && (
          hasTag(domain, 'fuel-material') || hasTag(domain, 'fuel-environment') ||
          ['biomass', 'wood', 'fuel'].includes(String(domain.materialId || ''))
        ));
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
      addBehaviorBundleFromPartialEdge,
      addBehaviorBundlesFromLedger,
      addBehaviorBundlesFromNodeActivity,
      addBehaviorBundle,
      behaviorProcessForText,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
