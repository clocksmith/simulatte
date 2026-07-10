(function attachSimulattePhysicsModelstatesolvers(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function addSynthesisComponents(synthesis, addDomain, addComponent, intent = null) {
        if (!synthesis || !synthesis.synthGraph) return;
        for (const node of synthesis.synthGraph.nodes || []) {
          const componentId = slugify(node.id);
          const domains = uniqueList([
            'synth',
            node.nodeType,
            node.class,
            ...(node.materials || []),
            ...(node.behaviors || []),
            ...(node.constraints || []),
          ].filter(Boolean));
          addDomain(...domains);
          addComponent(
            componentId,
            node.nodeType,
            node.label,
            {},
            [],
            node.match ? node.match.score : 0.72,
            {
              layer: 'component',
              domains,
              material: materialForSynthesisNode(node),
              visualRegime: visualRegimeForSynthesisNode(node),
              assembly: node.class || node.cardId,
              phrase: node.match ? node.match.span : node.label,
              source: 'embedding-guided-synth-node',
              primitiveProgram: null,
              geometry: {
                kind: node.nodeType,
                shapes: node.morphology ? node.morphology.shapes || [] : [],
                parts: node.morphology ? node.morphology.parts || [] : [],
                scale: node.morphology ? node.morphology.scale || 'nominal' : 'nominal',
              },
              ports: node.ports || [],
              slots: node.morphology ? node.morphology.parts || [] : [],
              synthesis: {
                cardId: node.cardId,
                nodeType: node.nodeType,
                match: node.match || null,
              },
            }
          );
          if (intent && Array.isArray(intent.conceptGraph)) {
            intent.conceptGraph.push({
              id: componentId,
              score: node.match ? node.match.score : 0.72,
              domains,
              prior: null,
              phrase: node.match ? node.match.span : node.label,
              source: 'embedding-guided-synth-node',
            });
          }
        }
        for (const event of synthesis.synthGraph.events || []) {
          const componentId = slugify(event.id);
          const domains = uniqueList(['synth', 'event', event.type, ...(event.physics || [])]);
          addDomain(...domains);
          addComponent(
            componentId,
            'event',
            event.type,
            {},
            [],
            0.82,
            {
              layer: 'composition',
              domains,
              material: '',
              visualRegime: visualRegimeForSynthesisText(`${event.type} ${(event.physics || []).join(' ')}`),
              assembly: 'event',
              phrase: event.type,
              source: 'embedding-guided-synth-event',
              primitiveProgram: null,
              geometry: { kind: 'event', participants: event.participants || [] },
              ports: event.participants || [],
              slots: event.physics || [],
              synthesis: {
                cardId: event.cardId,
                eventType: event.type,
                participants: event.participants || [],
              },
            }
          );
          if (intent && Array.isArray(intent.conceptGraph)) {
            intent.conceptGraph.push({
              id: componentId,
              score: 0.82,
              domains,
              prior: null,
              phrase: event.type,
              source: 'embedding-guided-synth-event',
            });
          }
        }
        for (const environment of synthesis.synthGraph.environment || []) {
          const label = environment.label || environment.id || 'environment';
          const componentId = `environment-${slugify(environment.id || label)}`;
          const domains = uniqueList(['synth', 'environment', slugify(label)].filter(Boolean));
          addDomain(...domains);
          const environmentRegime = visualRegimeForSynthesisText(label);
          addComponent(
            componentId,
            'environment',
            label,
            {},
            [],
            0.68,
            {
              layer: 'scene',
              domains,
              material: /swamp|marsh|wetland|water/i.test(label) ? 'water' : '',
              visualRegime: environmentRegime,
              assembly: 'environment',
              phrase: label,
              source: 'embedding-guided-synth-environment',
              primitiveProgram: null,
              geometry: { kind: 'environment', label },
              ports: [],
              slots: [],
              synthesis: {
                environmentId: environment.id || label,
                source: environment.source || '',
              },
            }
          );
          if (intent && Array.isArray(intent.conceptGraph)) {
            intent.conceptGraph.push({
              id: componentId,
              score: 0.68,
              domains,
              prior: null,
              phrase: label,
              source: 'embedding-guided-synth-environment',
            });
          }
        }
      }

    function materialForSynthesisNode(node) {
        const materials = node.materials || [];
        if (materials.includes('soft_tissue')) return 'membrane';
        if (materials.includes('ferrofluid')) return 'ferrofluid';
        if (materials.includes('fur')) return 'protein';
        if (materials.includes('steel')) return 'metal';
        if (materials.includes('gold')) return 'gold';
        if (materials.includes('lava')) return 'lava';
        if (materials.includes('ice')) return 'ice';
        if (materials.includes('quartz')) return 'quartz';
        if (materials.includes('leaf')) return 'leaf';
        if (materials.includes('rubber_material')) return 'rubber';
        if (materials.includes('glass_material')) return 'glass';
        if (materials.includes('water_material')) return 'water';
        if (materials.includes('air_material')) return 'air';
        return materials.find((material) => primitiveById(material)) || '';
      }

    function visualRegimeForSynthesisNode(node) {
        const values = [
          node.class,
          ...(node.materials || []),
          ...(node.behaviors || []),
          ...(node.constraints || []),
          node.cardId,
        ].join(' ');
        return visualRegimeForSynthesisText(values);
      }

    function visualRegimeForSynthesisText(values) {
        if (/\bchemical|reaction|polymer|epoxy|plating|catalyst|ammonia|electrolyzer|crystal|glaze|paint/i.test(values)) return 'chemistry';
        if (/\bserver|cyber|blockchain|search|recommendation|compiler|database|logic|tensor|network_packet|packet/i.test(values)) return 'digital';
        if (/\bmarket|policy|carbon|housing|supply|demand|power grid|auction|dispatch|queue|traffic|rail|airport|port/i.test(values)) return 'operations';
        if (/\bspace|planet|asteroid|mars|venus|europa|titan|radio|telescope|probe|orbit|satellite|reentry|rocket|spacecraft/i.test(values)) return 'space';
        if (/\bhurricane|tornado|earthquake|tsunami|storm|wildfire|mine|tunnel|fault|hazard|urban heat|air quality/i.test(values)) return 'hazard';
        if (/\bmammal|rodent|tissue|gait|soft|clinical|hospital|prosthetic|surgery|rehab|organ|cell|dna|ribosome|mitochondria/i.test(values)) return 'biological';
        if (/\becology|fish|bird|pollinator|plant|crop|greenhouse|soil|algae|compost|landfill|oyster|peatland/i.test(values)) return 'ecological';
        if (/\bspacecraft|rocket|orbit|thrust|satellite/i.test(values)) return 'mechanical';
        if (/\bsubmarine|submersible|underwater|diving|swimming/i.test(values)) return 'fluid';
        if (/\bturbine|propeller|rotation|pumping/i.test(values)) return 'mechanical';
        if (/\blava|magma|molten|volcano/i.test(values)) return 'thermal';
        if (/\bpiano|keyboard|instrument|acoustic_resonance/i.test(values)) return 'acoustic';
        if (/\balgae|plant_cluster|glowing|photosynthesis/i.test(values)) return 'biological';
        if (/\bstorm|hurricane|rainstorm/i.test(values)) return 'fluid';
        if (/\bice|quartz|crystal|castle|tower/i.test(values)) return 'phase';
        if (/\bwheel|rotating|axle|apparatus|rigid/i.test(values)) return 'mechanical';
        if (/\bferrofluid|magnetic_fluid|magnetizes|spikes/i.test(values)) return 'magnetic';
        if (/\bwater|flow|pipe|pump/i.test(values)) return 'fluid';
        if (/\bheat|fire|thermal/i.test(values)) return 'thermal';
        if (/\blens|glass|optics/i.test(values)) return 'optical';
        if (/\bmagnet|rotor/i.test(values)) return 'magnetic';
        return 'mechanical';
      }

    function synthesisPrimitiveRows(synthesis) {
        if (!synthesis || typeof groundedPrimitiveRows !== 'function') return [];
        return groundedPrimitiveRows(synthesis, catalog);
      }

    function shouldPreferSynthGraph(promptText, synthesis) {
        if (!synthesis || !synthesis.validation || synthesis.validation.valid !== true) return false;
        if (hasCatalogCriticalDomain(promptText)) return false;
        const graph = synthesis.synthGraph || {};
        const relations = graph.relations || [];
        const events = graph.events || [];
        const hasCompositionalRelation = relations.some((relation) => (
          relation.type === 'inside' ||
          relation.type === 'attached_to' ||
          relation.type === 'drives'
        ));
        const hasWorldEvent = events.some((event) => ['collision', 'falling', 'break'].includes(event.type));
        if ((!hasWorldEvent && !hasCompositionalRelation) || (graph.nodes || []).length < 2) return false;
        return !/\b(perpetual|solar magnetic|magnetic wheel|generator)\b/i.test(String(promptText || ''));
      }

    function hasCatalogCriticalDomain(promptText) {
        return /\b(logistics|warehouse|inventory|supply chain|market|demand|queue|backlog|sensor|feedback|control|controller|data recorder|audit trace|telemetry|traffic|network)\b/i
          .test(String(promptText || ''));
      }

    function synthesisReceipt(synthesis) {
        if (!synthesis) return null;
        return {
          schema: synthesis.schema || SYNTHESIS_SCHEMA || '',
          model: synthesis.model ? synthesis.model.id : '',
          retriever: synthesis.model ? synthesis.model.retriever : '',
          planner: synthesis.model ? synthesis.model.planner : '',
          valid: synthesis.validation ? synthesis.validation.valid : false,
          warnings: synthesis.validation ? synthesis.validation.warnings || [] : [],
          repairs: synthesis.validation ? synthesis.validation.repairs || [] : [],
          nodes: synthesis.synthGraph ? synthesis.synthGraph.nodes.length : 0,
          relations: synthesis.synthGraph ? synthesis.synthGraph.relations.length : 0,
          events: synthesis.synthGraph ? synthesis.synthGraph.events.length : 0,
          groundedPrimitives: synthesis.groundedGraph ? synthesis.groundedGraph.primitiveIds.length : 0,
        };
      }

    function semanticOpenPrimitives(semanticRag) {
        return (semanticRag && semanticRag.openComponents || []).map((component) => ({
          id: component.id,
          type: component.type || 'component',
          role: component.role || component.phrase || component.id,
          layer: component.layer || 'component',
          domains: component.domains || [],
          params: component.params || {},
          controls: component.controls || [],
          score: Number(component.score || 0.42),
          material: component.material || '',
          visualRegime: component.visualRegime || '',
          assembly: component.assembly || '',
          phrase: component.phrase || '',
          source: component.source || 'open-semantic-rag',
          primitiveProgram: component.primitiveProgram || (
            buildPrimitiveProgram ? buildPrimitiveProgram(component) : null
          ),
          recipe: [],
          text: component.phrase || component.role || '',
        }));
      }

    function lexicalSpanPrimitives(promptParse = {}, semanticRag = null) {
        const coveredPhrases = new Set((semanticRag && semanticRag.openComponents || [])
          .map((row) => normalizeLanguageAnchorText(row && (row.phrase || row.role || '')))
          .filter(Boolean));
        return (promptParse && promptParse.spans || [])
          .filter((span) => span && span.text && ['entity', 'material', 'environment', 'process'].includes(span.kind))
          .filter((span) => !languageAnchorSpanIsNegated(promptParse, span))
          .filter((span) => !coveredPhrases.has(normalizeLanguageAnchorText(span.text)))
          .slice(0, 24)
          .map((span, index) => {
            const phrase = String(span.text).trim();
            const visualRegime = visualRegimeForSynthesisText(`${span.kind} ${phrase}`);
            const assembly = span.kind === 'environment' ? 'field' : span.kind === 'material' ? 'material' : span.kind === 'process' ? 'effect' : 'component';
            const id = `language-${slugify(phrase)}-${slugify(span.id || index + 1)}`;
            return {
              id,
              type: assembly,
              role: phrase,
              layer: 'language-anchor',
              domains: uniqueList(['phase2-language-anchor', span.kind, visualRegime]),
              params: {},
              controls: [],
              // These rows preserve otherwise-unmapped prompt language for visual compilation.
              // They deliberately rank below catalog and grounded retrieval evidence so they
              // cannot replace an authoritative Phase 4 concept for the same span.
              score: 0.52,
              material: span.kind === 'material' ? slugify(phrase) : '',
              visualRegime,
              assembly,
              phrase,
              source: 'phase2-language-anchor',
              pinned: true,
              primitiveProgram: buildPrimitiveProgram ? buildPrimitiveProgram({
                id,
                phrase,
                visualRegime,
                assembly,
                seed: index + 1,
              }) : null,
              recipe: [],
              text: phrase,
              languageSpanId: span.id || '',
            };
          });
      }

    function normalizeLanguageAnchorText(value = '') {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      }

    function languageAnchorSpanIsNegated(promptParse = {}, span = {}) {
        const start = Number(span && span.tokenStart);
        if (!Number.isInteger(start)) return false;
        return (promptParse.tokens || []).slice(Math.max(0, start - 3), start)
          .some((token) => /^(without|no|not|never|exclude|avoid)$/.test(String(token && token.text || '').toLowerCase()));
      }

    function dopplerHintPrimitives(dopplerIntent, promptText) {
        const hints = dopplerIntent && Array.isArray(dopplerIntent.primitives)
          ? dopplerIntent.primitives
          : [];
        if (!hints.length) return [];
        const rows = hints
          .map((hint) => {
            const primitive = primitiveById(hint.primitiveId);
            if (!primitive) return null;
            return {
              ...primitive,
              score: Number(Math.max(0.62, Number(hint.score || 0)).toFixed(4)),
              source: 'doppler-residual',
              phrase: hint.reason || primitive.text || primitive.role || '',
            };
          })
          .filter(Boolean);
        return withPrimitiveDependencies(rows, promptText)
          .map((primitive) => {
            const hint = hints.find((item) => item.primitiveId === primitive.id);
            return {
              ...primitive,
              score: Number(Math.max(primitive.score || 0, hint ? hint.score : 0).toFixed(4)),
              source: hint ? 'doppler-residual' : primitive.source || 'doppler-dependency',
              phrase: hint && hint.reason ? hint.reason : primitive.phrase || primitive.text || '',
            };
          });
      }

    function explicitPromptPrimitiveRows(classification, promptText) {
        const prompt = String(promptText || '').toLowerCase();
        if (!classification || !Array.isArray(classification.priors) || !prompt) return [];
        const rows = classification.priors
          .filter((prior) => {
            const id = String(prior.primitiveId || '');
            const phrase = id.replace(/[-_]+/g, ' ');
            return phrase.length > 4 && prompt.includes(phrase);
          })
          .map((prior) => {
            const primitive = primitiveById(prior.primitiveId);
            if (!primitive) return null;
            return {
              ...primitive,
              score: Number(Math.max(Number(prior.score || 0), 0.58).toFixed(4)),
              source: 'prompt-explicit',
              phrase: prior.primitiveId.replace(/[-_]+/g, ' '),
              pinned: true,
            };
          })
          .filter(Boolean);
        const ensure = (primitiveId, score, phrase) => {
          if (rows.some((row) => row.id === primitiveId)) return;
          const primitive = primitiveById(primitiveId);
          if (!primitive) return;
          rows.push({
            ...primitive,
            score,
            source: 'prompt-family',
            phrase,
            pinned: true,
          });
        };
        if (/\bterrain\b/.test(prompt) && /\berosion\b/.test(prompt)) {
          ensure('terrain-heightfield', 0.64, 'terrain erosion');
          ensure('erosion-channel', 0.6, 'terrain erosion');
        }
        if (/\briver\b/.test(prompt) && /\berosion\b/.test(prompt)) {
          ensure('water', 0.58, 'river erosion');
          ensure('fluid-advection', 0.54, 'river erosion');
        }
        if (/\bswim(?:s|ming)?\b|\bswam\b|\bunderwater\b/.test(prompt)) {
          ensure('water', 0.62, 'swimming');
          ensure('fluid-advection', 0.58, 'swimming');
          ensure('pressure', 0.54, 'swimming');
        }
        if (/\bsand\b|\bgrains?\b|\bgranular\b|\bpowder\b/.test(prompt)) {
          ensure('granular-bed', 0.62, 'granular prompt');
          ensure('sand', 0.58, 'granular prompt');
        }
        if (/\bbubbles?\b|\bfloat(?:s|ing)?\b|\bbuoyan(?:t|cy)\b/.test(prompt)) {
          ensure('buoyant-body', 0.62, 'buoyancy prompt');
          ensure('water', 0.56, 'buoyancy prompt');
        }
        if (/\bprismatic\b|\bprism\b|\blaser beam\b/.test(prompt)) {
          ensure('optical-prism', 0.62, 'prismatic optics');
        }
        if (/\b(detector|phototube|calorimeter|instrument|probe|sensor)\b/.test(prompt)) {
          ensure('sensor-array', 0.68, prompt.match(/\b(neutrino detector|particle detector|detector|phototube array|calorimeter)\b/)?.[0] || 'instrument detector');
        }
        if (/\b(readout|readouts|telemetry|measurement)\b/.test(prompt)) {
          ensure('data-recorder', 0.64, prompt.match(/\b(calorimeter readouts|phase readout|readouts?|telemetry|measurement)\b/)?.[0] || 'instrument readout');
        }
        if (/\b(photon|photons|cherenkov|light cone|photon cone|photon cones|laser|beam)\b/.test(prompt)) {
          ensure('light-source', 0.62, prompt.match(/\b(cherenkov|photon cones?|light cone|laser beam|photon)\b/)?.[0] || 'photon cone');
          ensure('optics', 0.6, prompt.match(/\b(cherenkov|photon cones?|light|optics)\b/)?.[0] || 'optical photons');
          ensure('radiation', 0.56, prompt.match(/\b(photon|photons|radiation)\b/)?.[0] || 'photon radiation');
        }
        if (/\b(water tank|underground water tank|tank|pressure vessel|chamber)\b/.test(prompt)) {
          ensure('pressure-vessel', 0.62, prompt.match(/\b(underground water tank|water tank|pressure vessel|chamber|tank)\b/)?.[0] || 'tank boundary');
          ensure('water-volume', 0.6, prompt.match(/\b(underground water tank|water tank|water)\b/)?.[0] || 'water tank');
        }
        if (/\b(neutrino|muon|particle track|particle tracks|collider)\b/.test(prompt)) {
          ensure('particle-set', 0.58, prompt.match(/\b(neutrino|muon|particle tracks?|collider)\b/)?.[0] || 'particle track evidence');
        }
        return rows;
      }

    function mergeRankedPrimitives(...rowSets) {
        const byId = new Map();
        for (const primitive of rowSets.flat()) {
          if (!primitive || !primitive.id) continue;
          const existing = byId.get(primitive.id);
          if (existing) {
            const preferPrimitive = Number(primitive.score || 0) > Number(existing.score || 0);
            byId.set(primitive.id, {
              ...(preferPrimitive ? existing : primitive),
              ...(preferPrimitive ? primitive : existing),
              score: Math.max(Number(existing.score || 0), Number(primitive.score || 0)),
              pinned: Boolean(existing.pinned || primitive.pinned),
            });
          } else {
            byId.set(primitive.id, primitive);
          }
        }
        const sorted = Array.from(byId.values())
          .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id));
        const pinned = sorted.filter((primitive) => primitive.pinned);
        const selected = pinned.slice();
        for (const primitive of sorted) {
          if (selected.length >= 56) break;
          if (primitive.pinned || selected.some((item) => item.id === primitive.id)) continue;
          selected.push(primitive);
        }
        return selected
          .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id));
      }

    function resolveIntentToSpec(intentInput, overrides = {}) {
        const intent = intentInput && intentInput.schema === 'simulatte.intent.v1'
          ? intentInput
          : createIntentFromPrompt('');
        const overrideParams = overrides && overrides.params && typeof overrides.params === 'object'
          ? overrides.params
          : {};
        if (intent.domains.includes('blank')) {
          const plane = intent.components.find((component) => component.id === 'canvas');
          return createSpec('blank-world', {
            name: intent.title || 'Blank Construction Plane',
            description: intent.prompt ? `Intent: ${intent.prompt}` : 'Empty 2d construction surface.',
            params: { ...(plane ? plane.params : {}), ...overrideParams },
            intent,
            phaseArtifacts: intent.phaseArtifacts || null,
          });
        }

        const modules = ['mechanics', 'field', 'energy-ledger'];
        const objects = [];
        const controls = ['energyInput', 'fieldStrength', 'damping', 'complexity'];
        const params = { ...templateById('custom-world').params };
        const contract = intent.resolution && intent.resolution.contract
          ? intent.resolution.contract
          : null;
        const addControl = (key) => {
          if (CONTROL_LIBRARY[key] && !controls.includes(key)) controls.push(key);
        };
        for (const domain of intent.domains) {
          if (!modules.includes(domain)) modules.push(domain);
        }
        for (const component of intent.components) {
          const graphNode = graphNodeForSpec(contract, component.id);
          objects.push({
            id: component.id,
            type: component.type,
            role: component.role,
            layer: component.layer || '',
            domains: component.domains || [],
            material: component.material || '',
            visualRegime: component.visualRegime || '',
            assembly: component.assembly || '',
            phrase: component.phrase || '',
            source: component.source || '',
            primitiveProgram: component.primitiveProgram || null,
            geometry: component.geometry || null,
            ports: component.ports || null,
            slots: component.slots || [],
            synthesis: component.synthesis || null,
            state: graphNode ? graphNode.state : null,
          });
          for (const key of component.controls || []) addControl(key);
          for (const [key, value] of Object.entries(component.params || {})) {
            params[key] = value;
            addControl(key);
          }
        }
        applyContractDefaults(params, contract);
        applyCompiledParameterHints(parameterHintTextForIntent(intent, contract), params, addControl);

        const exactMachine = intent.title === 'Solar Magnetic Perpetual Motion Machine';
        if (exactMachine) {
          Object.assign(params, {
            irradiance: 780,
            sliderAmplitude: 0.42,
            loadTorque: 0.16,
          });
        }
        for (const [key, value] of Object.entries(overrideParams)) {
          if (!Number.isFinite(Number(value))) continue;
          params[key] = Number(value);
          addControl(key);
        }
        if (contract && contract.graph) {
          contract.graph.units = unitsForParams(params);
        }
        return createSpec('custom-world', {
          name: exactMachine ? 'Solar Magnetic Perpetual Motion Machine' : intent.title || 'Custom Physics World',
          description: intent.prompt ? `Intent: ${intent.prompt}` : 'Prompt resolved into 2d simulation components.',
          modules,
          objects,
          controls,
          params,
          intent,
          contract,
          phaseArtifacts: intent.phaseArtifacts || null,
        });
      }

    function createSpecFromPrompt(promptText = '', overrides = {}) {
        return resolveIntentToSpec(createIntentFromPrompt(promptText, overrides), overrides);
      }

    function titleFromPrompt(words) {
        const stop = new Set(['a', 'an', 'and', 'the', 'with', 'to', 'of', 'for', 'from', 'that', 'uses', 'use', 'build', 'make', 'create', 'simulate', 'simulation']);
        const keep = words.filter((word) => !stop.has(word)).slice(0, 6);
        if (!keep.length) return '';
        return keep.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      }

    function seedFromString(text) {
        let hash = 2166136261;
        const str = String(text || '');
        for (let i = 0; i < str.length; i += 1) {
          hash ^= str.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) % 100000;
      }

    function remixSpec(inputSpec, overrides = {}) {
        const spec = normalizeSpec(inputSpec);
        const params = { ...spec.params };
        // Reproducible remix: seed from an explicit override when provided, otherwise
        // from the spec identity. No wall-clock entropy on the compute path, so the
        // same spec (or same seed) always remixes to the same parameters.
        const seed = Number.isFinite(Number(overrides.seed))
          ? Number(overrides.seed)
          : seedFromString(spec.id || spec.name || '');
        let keyIndex = 0;
        for (const [key, , min, max] of controlsForSpec(spec)) {
          const span = Number(max) - Number(min);
          const drift = span * (hashNoise(seed + keyIndex, key.length + spec.id.length) - 0.5) * 0.12;
          params[key] = clamp(Number(params[key]) + drift, Number(min), Number(max));
          keyIndex += 1;
        }
        return createSpec(spec.templateId, {
          ...spec,
          ...overrides,
          id: overrides.id || `${slugify(spec.name)}-remix-${Date.now().toString(36)}`,
          name: overrides.name || `${spec.name} Remix`,
          modules: overrides.modules || spec.modules,
          objects: overrides.objects || spec.objects,
          controls: overrides.controls || spec.controls,
          params: { ...params, ...(overrides.params || {}) },
          remixOf: spec.id,
        });
      }

    function serializeSpec(spec) {
        return JSON.stringify(normalizeSpec(spec), null, 2);
      }

    function deserializeSpec(text) {
        return normalizeSpec(JSON.parse(String(text || '{}')));
      }

    function createSimulationState(spec) {
        const normalized = normalizeSpec(spec);
        if (normalized.templateId === 'blank-world') return createBlankState(normalized);
        if (normalized.templateId === 'custom-world') return createCustomState(normalized);
        if (normalized.templateId === 'fluid-vortex') return createFluidState(normalized.params);
        if (normalized.templateId === 'reaction-diffusion') return createReactionState(normalized.params);
        return createState(normalized.params);
      }

    function stepSimulation(inputState, spec, dt) {
        const normalized = normalizeSpec(spec);
        if (normalized.templateId === 'blank-world') return stepBlankState(inputState, normalized, dt);
        if (normalized.templateId === 'custom-world') return stepCustomState(inputState, normalized, dt);
        if (normalized.templateId === 'fluid-vortex') return stepFluidState(inputState, normalized.params, dt);
        if (normalized.templateId === 'reaction-diffusion') return stepReactionState(inputState, normalized.params, dt);
        return stepState(inputState, normalized.params, dt);
      }

    function solarPower(params) {
        return Math.max(0, params.irradiance) * Math.max(0, params.panelArea) * clamp(params.panelEfficiency, 0, 1);
      }

    function magnetPosition(angle, radius) {
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
      }

    function createState(params = {}) {
        const next = { ...DEFAULT_PARAMS, ...params };
        return {
          kind: 'magnetic-wheel',
          t: 0,
          theta: 0.12,
          omega: 0,
          sliderAngle: 0,
          sliderVelocity: 0,
          solarBufferJ: 0,
          solarInputJ: 0,
          actuatorWorkJ: 0,
          wheelWorkJ: 0,
          loadOutputJ: 0,
          frictionLossJ: 0,
          generatorLossJ: 0,
          lastTorque: 0,
          lastMagneticTorque: 0,
          lastActuatorPower: 0,
          lastSolarPower: solarPower(next),
          lastLoadPower: 0,
          params: next,
        };
      }

    function magneticTorque(state, params) {
        const wheelMagnets = 10;
        const wheelRadius = 1.0;
        const sliderRadius = 1.42;
        const stator = magnetPosition(state.sliderAngle, sliderRadius);
        let torque = 0;
        for (let i = 0; i < wheelMagnets; i += 1) {
          const pole = i % 2 === 0 ? 1 : -1;
          const angle = state.theta + (i / wheelMagnets) * TAU;
          const rotor = magnetPosition(angle, wheelRadius);
          const dx = rotor.x - stator.x;
          const dy = rotor.y - stator.y;
          const dist2 = Math.max(0.055, dx * dx + dy * dy);
          const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
          const forceScale = params.magneticStrength * pole / (dist2 * Math.sqrt(dist2));
          const tangentialForce = (dx * tangent.x + dy * tangent.y) * forceScale;
          torque += tangentialForce * wheelRadius;
        }
        return clamp(torque, -2.8, 2.8);
      }

    function sliderTargetAngle(state, params) {
        const sunCycle = Math.sin(state.t * 0.42);
        const commutation = state.theta + params.sliderPhase * TAU;
        return wrapAngle(commutation + sunCycle * params.sliderAmplitude);
      }

    function stepState(inputState, inputParams, dtInput) {
        const params = { ...inputState.params, ...inputParams };
        const state = { ...inputState, params };
        const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
        const sunPower = solarPower(params);
        state.solarInputJ += sunPower * dt;
        state.solarBufferJ += sunPower * dt;

        const target = sliderTargetAngle(state, params);
        const sliderError = shortestAngle(state.sliderAngle, target);
        const desiredVelocity = clamp(sliderError * 8, -3.6, 3.6);
        const velocityDelta = desiredVelocity - state.sliderVelocity;
        const actuatorPowerRequest = Math.abs(velocityDelta) * 9.5 + Math.abs(desiredVelocity) * 1.2;
        const actuatorPower = Math.min(state.solarBufferJ / dt, actuatorPowerRequest);
        const actuatorScale = actuatorPowerRequest > 0 ? actuatorPower / actuatorPowerRequest : 1;
        state.sliderVelocity += velocityDelta * actuatorScale * clamp(params.actuatorEfficiency, 0.05, 1);
        state.sliderVelocity *= 0.92;
        state.sliderAngle = wrapAngle(state.sliderAngle + state.sliderVelocity * dt);
        state.solarBufferJ = Math.max(0, state.solarBufferJ - actuatorPower * dt);
        state.actuatorWorkJ += actuatorPower * dt;

        let magTorque = magneticTorque(state, params);
        const predictedOmega = state.omega + (magTorque / Math.max(0.05, params.wheelInertia)) * dt;
        const fieldPowerRequest = Math.max(0, magTorque * predictedOmega) / clamp(params.actuatorEfficiency, 0.05, 1);
        const fieldPower = Math.min(state.solarBufferJ / dt, fieldPowerRequest);
        const fieldScale = fieldPowerRequest > 0 ? fieldPower / fieldPowerRequest : 1;
        magTorque *= fieldScale;
        state.solarBufferJ = Math.max(0, state.solarBufferJ - fieldPower * dt);
        state.actuatorWorkJ += fieldPower * dt;
        const loadTorque = Math.sign(state.omega || magTorque || 1) * Math.min(Math.abs(params.loadTorque), Math.abs(state.omega) * 0.18 + 0.08);
        const frictionTorque = state.omega * params.friction;
        const netTorque = magTorque - frictionTorque - loadTorque;
        const alpha = netTorque / Math.max(0.05, params.wheelInertia);
        state.omega += alpha * dt;
        state.omega *= 0.999;
        state.theta = wrapAngle(state.theta + state.omega * dt);

        const magneticPower = magTorque * state.omega;
        const loadPower = Math.max(0, loadTorque * state.omega);
        const frictionPower = Math.max(0, frictionTorque * state.omega);
        const generatorLoss = loadPower * 0.08;
        state.wheelWorkJ += magneticPower * dt;
        state.loadOutputJ += loadPower * dt;
        state.frictionLossJ += frictionPower * dt;
        state.generatorLossJ += generatorLoss * dt;
        state.t += dt;
        state.lastTorque = netTorque;
        state.lastMagneticTorque = magTorque;
        state.lastActuatorPower = actuatorPower + fieldPower;
        state.lastSolarPower = sunPower;
        state.lastLoadPower = loadPower;
        return state;
      }

    function kineticEnergy(state) {
        return 0.5 * state.params.wheelInertia * state.omega * state.omega;
      }

    function energyLedger(state) {
        const stored = kineticEnergy(state) + state.solarBufferJ;
        const spent = state.actuatorWorkJ + state.loadOutputJ + state.frictionLossJ + state.generatorLossJ + stored;
        return {
          solarInputJ: state.solarInputJ,
          actuatorWorkJ: state.actuatorWorkJ,
          wheelKineticJ: kineticEnergy(state),
          loadOutputJ: state.loadOutputJ,
          frictionLossJ: state.frictionLossJ,
          generatorLossJ: state.generatorLossJ,
          solarBufferJ: state.solarBufferJ,
          balanceErrorJ: state.solarInputJ - spent,
          rpm: state.omega * 60 / TAU,
          torqueNm: state.lastTorque,
          magneticTorqueNm: state.lastMagneticTorque,
          solarPowerW: state.lastSolarPower,
          actuatorPowerW: state.lastActuatorPower,
          loadPowerW: state.lastLoadPower,
        };
      }

    function createFluidState(params = {}) {
        const next = { ...templateById('fluid-vortex').params, ...params };
        const particles = Array.from({ length: 360 }, (_, index) => ({
          x: hashNoise(3, index),
          y: hashNoise(7, index),
          vx: 0,
          vy: 0,
          age: hashNoise(11, index),
        }));
        return {
          kind: 'fluid-vortex',
          t: 0,
          particles,
          pressure: 0,
          vorticity: 0,
          mixing: 0,
          dragLossJ: 0,
          flowInputJ: 0,
          params: next,
        };
      }

    function stepFluidState(inputState, inputParams, dtInput) {
        const params = { ...inputState.params, ...inputParams };
        const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
        const state = {
          ...inputState,
          params,
          particles: inputState.particles.map((particle) => ({ ...particle })),
        };
        const obstacle = { x: 0.56, y: 0.52, r: params.obstacleRadius };
        let vorticity = 0;
        let pressure = 0;
        let mixing = 0;
        for (let i = 0; i < state.particles.length; i += 1) {
          const p = state.particles[i];
          const dx = p.x - obstacle.x;
          const dy = p.y - obstacle.y;
          const dist = Math.max(0.018, Math.hypot(dx, dy));
          const nx = dx / dist;
          const ny = dy / dist;
          const wake = Math.exp(-dist / Math.max(0.04, obstacle.r * 2.8));
          const swirl = params.vortexStrength * wake;
          const noise = (hashNoise(Math.floor(state.t * 30), i) - 0.5) * params.turbulence;
          p.vx += (params.inletFlow * 0.55 + -ny * swirl + noise) * dt;
          p.vy += (nx * swirl + params.gravity + noise * 0.35) * dt;
          p.vx *= 1 - params.viscosity * dt * 1.8;
          p.vy *= 1 - params.viscosity * dt * 1.8;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (dist < obstacle.r) {
            p.x = obstacle.x + nx * obstacle.r;
            p.y = obstacle.y + ny * obstacle.r;
            p.vx += nx * 0.4;
            p.vy += ny * 0.4;
            pressure += 1;
          }
          if (p.x > 1.04 || p.y < -0.04 || p.y > 1.04) {
            p.x = -0.03;
            p.y = hashNoise(i, Math.floor(state.t * 10));
            p.vx = params.inletFlow;
            p.vy = 0;
            p.age = 0;
          }
          if (p.x < -0.06) p.x = 1.03;
          p.age = clamp01(p.age + dt * 0.08);
          vorticity += Math.abs(p.vx * ny - p.vy * nx);
          mixing += p.age * (1 - Math.abs(p.y - 0.5) * 1.2);
        }
        const count = state.particles.length || 1;
        state.t += dt;
        state.vorticity = vorticity / count;
        state.pressure = pressure / count * 100;
        state.mixing = clamp01(mixing / count);
        state.flowInputJ += Math.max(0, params.inletFlow) * dt * 12;
        state.dragLossJ += state.vorticity * params.viscosity * dt * 7;
        return state;
      }

    Object.assign(scope, {
      addSynthesisComponents,
      materialForSynthesisNode,
      visualRegimeForSynthesisNode,
      visualRegimeForSynthesisText,
      synthesisPrimitiveRows,
      shouldPreferSynthGraph,
      hasCatalogCriticalDomain,
      synthesisReceipt,
      semanticOpenPrimitives,
      lexicalSpanPrimitives,
      dopplerHintPrimitives,
      explicitPromptPrimitiveRows,
      mergeRankedPrimitives,
      resolveIntentToSpec,
      createSpecFromPrompt,
      titleFromPrompt,
      seedFromString,
      remixSpec,
      serializeSpec,
      deserializeSpec,
      createSimulationState,
      stepSimulation,
      solarPower,
      magnetPosition,
      createState,
      magneticTorque,
      sliderTargetAngle,
      stepState,
      kineticEnergy,
      energyLedger,
      createFluidState,
      stepFluidState,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
