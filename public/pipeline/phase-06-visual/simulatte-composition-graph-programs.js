(function attachSimulatteCompositionGraphprograms(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function semanticVisualRows(text, seed, rules, kind, tokens) {
        return rules
          .map((rule, index) => {
            const matchesPattern = rule.pattern.test(text);
            const matchedTokens = (tokens || []).filter((token) => rule.terms.includes(token));
            if (!matchedTokens.length) return null;
            const tokenBoost = Math.min(0.28, matchedTokens.length * 0.07);
            const score = Number((rule.weight + tokenBoost + unitFromSeed(seed, index + rule.salt) * 0.06).toFixed(3));
            return {
              id: `${kind}.${rule.id}`,
              family: rule.family,
              label: rule.label,
              overlay: rule.overlay,
              shader: rule.shader,
              motion: rule.motion,
              score,
              hue: normalizeHue(rule.hue + Math.round((unitFromSeed(seed, index + 101) - 0.5) * 38)),
              matchedTokens,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
          .slice(0, 9);
      }

    function atlasAddressableTokens(tokens) {
        const terms = new Set([
          ...SEMANTIC_ARCHETYPE_RULES.flatMap((rule) => rule.terms),
          ...SEMANTIC_MATERIAL_RULES.flatMap((rule) => rule.terms),
          ...SEMANTIC_PROCESS_RULES.flatMap((rule) => rule.terms),
        ]);
        return uniqueList((tokens || []).filter((token) => terms.has(token)));
      }

    function semanticRule(id, family, label, pattern, terms, overlay, hue, weight, salt) {
        return { id, family, label, pattern, terms, overlay, hue, weight, salt };
      }

    function semanticMaterialRule(id, family, pattern, terms, shader, hue, weight, salt) {
        return { id, family, label: `${id} material`, pattern, terms, shader, hue, weight, salt };
      }

    function semanticProcessRule(id, family, pattern, terms, overlay, motion, hue, weight, salt) {
        return { id, family, label: `${id} process`, pattern, terms, overlay, motion, hue, weight, salt };
      }

    function isPromptGroundedGenomeObject(object) {
        const source = String(object && object.source || '');
        return /^embedding-guided-synth|open-semantic-rag|doppler-residual|render-ir/.test(source) ||
          Boolean(source && source !== 'catalog' && object && object.phrase);
      }

    function genomeMotifs(text, sceneKind, objects, fields) {
        const motifs = [];
        const scene = String(sceneKind || '').toLowerCase();
        const add = (...values) => values.forEach((value) => {
          if (value && !motifs.includes(value)) motifs.push(value);
        });
        const transitDispatch = /\b(railway|rail|dispatch|signal block|signal blocks|train|platform|headway|transit)\b/.test(text);
        const urbanShadow = /\b(zoning|shadow|building mass|building masses|sunlight|pedestrian|comfort|parcel)\b/.test(text);
        const animalSubject = /\b(dog|dogs|cat|cats|animal|animals|mammal|mammals|rider|bird|fish|reptile|amphibian|insect)\b/.test(text);
        const plantSubject = /\b(flower|flowers|tree|trees|plant|plants|leaf|leaves|root|roots|mangrove|forest|biomass)\b/.test(text);
        if (sceneKind === 'fire' || sceneKind === 'thermal-plume') add('ember-shear', 'smoke-strata', 'charred-edges');
        if (sceneKind === 'acoustic') add('pressure-rings', 'waveguide-lines', 'resonant-slits');
        if (sceneKind === 'planetary-space') add('orbital-arcs', 'limb-glow', 'trajectory-dust');
        if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'digital-network') add('route-weave', 'signal-ticks', 'node-ledger');
        if (sceneKind === 'civic-market' && transitDispatch) add('track-ladder', 'platform-slots', 'headway-pulses');
        if (sceneKind === 'civic-market' && urbanShadow) add('parcel-zoning-grid', 'solar-shadow-cells', 'comfort-isobands');
        if ((sceneKind === 'biology' || sceneKind === 'watershed') && animalSubject) {
          add('animal-gait-cells', 'limb-track-pairs', 'fur-contour-bands');
        }
        if ((sceneKind === 'biology' || sceneKind === 'watershed') && plantSubject) {
          add('petal-radial-growth', 'stem-node-lattice', 'leaf-vein-mesh');
        }
        if (sceneKind === 'optics' || sceneKind === 'quantum-instrument' || sceneKind === 'particle-instrument') add('caustic-ribs', 'spectral-slices', 'thin-line-optics');
        if (sceneKind === 'biology' || sceneKind === 'molecular-biology' || sceneKind === 'restoration-water') add('branch-network', 'cellular-mesh', 'membrane-rims');
        if (sceneKind === 'granular') add('grain-strata', 'impact-trails', 'sorting-bands');
        if (sceneAllowsMotifFamily(scene, 'architecture') &&
          !transitDispatch &&
          /building|tower|castle|house|room|wall|structure|street|city|warehouse|factory|office|school|hospital|stairwell|corridor|hallway|basement|garage|roof|shed|cabin/.test(text)) {
          add('architectural-grid', 'occluded-windows', 'structural-silhouette');
        }
        if (sceneAllowsMotifFamily(scene, 'fire') &&
          /fire|flame|burn|smoke|ember|ash|plume|heat/.test(text)) {
          add('ember-shear', 'smoke-strata', 'charred-edges');
        }
        if (sceneAllowsMotifFamily(scene, 'water') &&
          /water|river|brine|rain|swamp|wetland|erosion|sediment|delta|ocean|pond|swim|swimming/.test(text)) {
          add('flow-contours', 'sediment-bands', 'wet-refraction');
        }
        if (sceneAllowsMotifFamily(scene, 'optics') &&
          /glass|lens|prism|laser|optics|mirror|sunlight|beam|photon|caustic|film/.test(text)) {
          add('caustic-ribs', 'spectral-slices', 'thin-line-optics');
        }
        if (sceneAllowsMotifFamily(scene, 'magnetic') &&
          /magnet|magnetic|coil|current|ferrofluid|dipole|rotor/.test(text)) {
          add('flux-hatching', 'dipole-dust', 'coil-shadow');
        }
        if (sceneAllowsMotifFamily(scene, 'granular') &&
          /grain|sand|bead|sieve|powder|avalanche|granular/.test(text)) {
          add('grain-strata', 'impact-trails', 'sorting-bands');
        }
        const biologicalMotifPattern = scene === 'watershed'
          ? /biology|cell|bacteria|mycelium|membrane|protein|leaf|plant|dog|cat|animal|flower|tree|forest|mangrove|root|biomass|ecology|ecological/
          : /biology|cell|bacteria|mycelium|membrane|growth|protein|leaf|plant|dog|cat|animal|flower|tree|forest|root|biomass|ecology|ecological/;
        if (sceneAllowsMotifFamily(scene, 'biology') && biologicalMotifPattern.test(text)) {
          add('branch-network', 'cellular-mesh', 'membrane-rims');
        }
        if (sceneAllowsMotifFamily(scene, 'acoustic') &&
          /sound|acoustic|resonance|wave|tube|instrument/.test(text)) {
          add('pressure-rings', 'waveguide-lines', 'resonant-slits');
        }
        if (sceneAllowsMotifFamily(scene, 'fracture') &&
          /crack|fracture|collision|impact|hammer|projectile|break/.test(text)) {
          add('fracture-lines', 'stress-rulers', 'impact-ghosts');
        }
        if (sceneAllowsMotifFamily(scene, 'network') &&
          (/queue|traffic|market|network|grid|sensor|ledger|power|subway/.test(text) || sceneKind === 'city')) {
          add('route-weave', 'signal-ticks', 'node-ledger');
        }
        const fieldKinds = uniqueList((fields || []).map((field) => field.kind)).join(' ');
        if (/reaction|combustion/.test(fieldKinds)) add('reaction-front');
        if (/optical/.test(fieldKinds)) add('ray-stack');
        if (/network/.test(fieldKinds)) add('route-weave');
        if (!motifs.length) {
          const regimes = uniqueList((objects || []).map((object) => object.visualRegime)).filter(Boolean);
          add(...regimes.slice(0, 3).map((regime) => `${regime}-field`));
        }
        return motifs.slice(0, 9);
      }

    function sceneAllowsMotifFamily(sceneKind, family) {
        const scene = String(sceneKind || '').toLowerCase();
        if (family === 'architecture') return /city|civic|digital|venue|mechanical|fire|literal|robotics|manufacturing|structural/.test(scene);
        if (family === 'fire') return /fire|thermal-plume|hazard|weather-atmosphere/.test(scene);
        if (family === 'water') return /watershed|water|restoration|ocean|cryosphere|optics|thin-film|biology|ecology|particle-instrument/.test(scene);
        if (family === 'optics') return /optics|thin-film|quantum|particle|space|planetary|cultural-material/.test(scene);
        if (family === 'magnetic') return /magnetic|ferrofluid|grid-energy|advanced-energy|electric|particle-instrument/.test(scene);
        if (family === 'granular') return /granular|watershed|geology|restoration|ocean-cryosphere/.test(scene);
        if (family === 'biology') return /biology|ecology|restoration|agro|clinical|watershed/.test(scene);
        if (family === 'acoustic') return /acoustic/.test(scene);
        if (family === 'fracture') return /mechanical|robotics|literal|particle|structural|ocean-cryosphere/.test(scene);
        if (family === 'network') return /city|civic|digital|venue|grid-energy|network|logistics|robotics/.test(scene);
        return true;
      }

    function genomePalette(sceneKind, motifs, _seed, paletteAnchor = '') {
        const sceneHue = {
          'advanced-energy': 286,
          'agro-waste-loop': 92,
          atomic: 246,
          'chemical-lab': 166,
          'chemistry-lab': 166,
          'clinical-control': 348,
          'civic-market': 188,
          'cultural-material': 28,
          cryosphere: 202,
          'digital-network': 214,
          ecology: 128,
          'evolution-ecology': 122,
          fire: 22,
          'grid-energy': 52,
          'hazard-atmosphere': 12,
          'literal-composite': 148,
          'manufacturing-line': 32,
          'mechanical-fluid': 204,
          'molecular-biology': 276,
          ocean: 196,
          'ocean-cryosphere': 206,
          optics: 208,
          'optics-thermal': 34,
          'particle-instrument': 192,
          'planetary-space': 232,
          'quantum-instrument': 266,
          'restoration-water': 172,
          'robotics-control': 24,
          'space-instrument': 226,
          'sport-motion': 44,
          'structural-mechanics': 356,
          city: 172,
          watershed: 194,
          'magnetic-machine': 278,
          'material-tray': 42,
          biology: 116,
          acoustic: 196,
          ferrofluid: 238,
          'thin-film': 302,
          granular: 38,
          'thermal-plume': 18,
          mechanical: 206,
          'literal-composite': 148,
        };
        const anchorHue = {
          'industrial-amber-cyan': 34,
          'precision-violet-steel': 274,
          'field-green-ochre': 78,
          'chlorophyll-green': 122,
          'microbe-teal': 156,
          'ferment-amber': 38,
          'protein-violet': 276,
          'transit-cyan-amber': 198,
          'solar-concrete-violet': 282,
          'crowd-coral-indigo': 346,
          'market-amber-blue': 42,
          'fire-orange-charcoal': 18,
          'wildfire-amber-green': 54,
          'kiln-orange-steel': 22,
          'ice-blue-slate': 204,
          'sediment-aqua-ochre': 188,
        };
        const motifShift = motifs.includes('animal-gait-cells') ? -68
          : motifs.includes('petal-radial-growth') ? 46
            : motifs.includes('track-ladder') ? -24
              : motifs.includes('parcel-zoning-grid') ? 58
                : motifs.includes('architectural-grid') ? 34
                  : motifs.includes('caustic-ribs') ? 74
                    : motifs.includes('branch-network') ? -36
                      : motifs.includes('route-weave') ? 18
                        : 0;
        const hue = normalizeHue((anchorHue[paletteAnchor] ?? sceneHue[sceneKind] ?? 156) + motifShift);
        const accentHue = normalizeHue(hue + 96);
        const shadowHue = normalizeHue(hue + 216);
        return {
          hue,
          accentHue,
          shadowHue,
          warmth: /amber|orange|fire|kiln|coral/.test(paletteAnchor) ? 0.72 : 0.42,
          contrast: /steel|concrete|slate/.test(paletteAnchor) ? 0.68 : 0.72,
          lightness: /charcoal|slate/.test(paletteAnchor) ? 0.5 : 0.58,
        };
      }

    function genomeMorphology(sceneKind, motifs, seed, objects, fields, visualDna = null, semanticVisuals = null, compositionTopology = '') {
        const motifText = motifs.join(' ');
        const layoutMode = /animal-gait/.test(motifText) ? 'field-map'
          : /petal-radial/.test(motifText) ? 'radial'
            : /route|network|ledger/.test(motifText) || sceneKind === 'city' ? 'network'
              : /architecture|structural|fracture/.test(motifText) ? 'section'
                : /flow|sediment|smoke|grain/.test(motifText) ? 'strata'
                  : /caustic|flux|pressure|ray/.test(motifText) ? 'radial'
                    : (TOPOLOGY_LAYOUT_MODE[compositionTopology] || 'strata');
        const textureKind = /animal-gait|fur-contour/.test(motifText)
          ? 'contour-hatch'
          : /petal-radial|leaf-vein/.test(motifText) ? 'cutaway-lines'
            : /caustic|ray|spectral/.test(motifText) ? 'spectral-ribs'
              : /grain|sediment|strata/.test(motifText) ? 'grain-scan'
                : /architecture|route|network|grid/.test(motifText) ? 'woven-grid'
                  : (TOPOLOGY_TEXTURE_KIND[compositionTopology] || 'contour-hatch');
        const objectCount = Math.max(1, (objects || []).length);
        const fieldCount = Math.max(1, (fields || []).length);
        const dnaDensity = visualDna && Number.isFinite(visualDna.densityBias) ? visualDna.densityBias : 1;
        const semanticLayerCount = semanticVisuals && semanticVisuals.quality
          ? Math.min(8, Number(semanticVisuals.quality.layerCount) || 0)
          : 0;
        return {
          layoutMode,
          textureKind,
          strokeWeight: Number((0.7 + unitFromSeed(seed, 9) * 1.7).toFixed(3)),
          grain: Number((0.22 + unitFromSeed(seed, 10) * 0.62).toFixed(3)),
          bandCount: 5 + Math.round(unitFromSeed(seed, 11) * 11),
          particleDensity: Math.round((18 + unitFromSeed(seed, 12) * 70 + Math.min(42, fieldCount * 4)) * dnaDensity),
          flowCurl: Number((0.14 + unitFromSeed(seed, 13) * 0.72).toFixed(3)),
          objectScale: Number((0.86 + unitFromSeed(seed, 14) * 0.34 + Math.min(0.22, objectCount * 0.006)).toFixed(3)),
          fieldComplexity: 3 + Math.round(unitFromSeed(seed, 15) * 6) + Math.min(4, fieldCount) + semanticLayerCount,
          asymmetry: Number((0.18 + unitFromSeed(seed, 16) * 0.74).toFixed(3)),
        };
      }

    const TOPOLOGY_LAYOUT_MODE = Object.freeze({
      radial: 'radial', ladder: 'section', lattice: 'network', cutaway: 'section',
      basin: 'strata', orbit: 'radial', conveyor: 'network', branching: 'network',
      stack: 'strata', plume: 'strata', corridor: 'section', 'field-map': 'field-map',
      specimen: 'specimen',
    });

    const TOPOLOGY_TEXTURE_KIND = Object.freeze({
      radial: 'spectral-ribs', ladder: 'woven-grid', lattice: 'woven-grid',
      cutaway: 'cutaway-lines', basin: 'grain-scan', orbit: 'spectral-ribs',
      conveyor: 'woven-grid', branching: 'contour-hatch', stack: 'grain-scan',
      plume: 'contour-hatch', corridor: 'cutaway-lines', 'field-map': 'contour-hatch',
      specimen: 'cutaway-lines',
    });

    function normalizeHue(value) {
        return ((Math.round(value) % 360) + 360) % 360;
      }

    function unitFromSeed(seed, salt) {
        return hashProgram(`${seed}:${salt}`) / 4294967295;
      }

    function prioritizeObjectsForScene(objects, sceneKind) {
        const rows = (objects || []).map((object, index) => ({
          object,
          index,
          priority: sceneObjectPriority(object, sceneKind),
        }));
        const filtered = rows.filter((row) => row.priority >= 0);
        const source = filtered.length ? filtered : rows;
        return source
          .sort((a, b) => b.priority - a.priority || a.index - b.index)
          .slice(0, 24)
          .map((row) => row.object);
      }

    function visualObjectAcceptanceLedger(objects, sceneKind, spec) {
        const promptText = compiledPromptTextForSelection(spec);
        const rows = (objects || []).map((object, index) => {
          const receipt = visualObjectAcceptanceReceipt(object, sceneKind, promptText, index);
          return { object, index, ...receipt };
        });
        const hasPromptGrounded = rows.some((row) => row.promptGrounded);
        for (const row of rows) {
          const decision = visualObjectAcceptanceDecision(row.object, sceneKind, promptText, hasPromptGrounded);
          row.status = decision.status;
          row.reason = decision.reason;
          row.confidence = decision.confidence;
          row.promptGrounded = row.promptGrounded || decision.promptGrounded === true;
          row.supportOnly = decision.supportOnly === true;
        }
        if (!rows.some((row) => row.status === 'accepted') && rows.length) {
          const best = rows
            .slice()
            .sort((a, b) => sceneObjectPriority(b.object, sceneKind) - sceneObjectPriority(a.object, sceneKind) || a.index - b.index)[0];
          best.status = 'accepted';
          best.reason = 'last visual seed retained because no prompt-grounded visual object survived';
          best.confidence = 0.35;
          best.supportOnly = true;
        }
        const receipts = rows.map((row) => visualObjectAcceptanceSummary(row));
        const accepted = rows
          .filter((row) => row.status === 'accepted')
          .map((row) => annotateAcceptedVisualObject(row.object, row));
        const rejected = rows
          .filter((row) => row.status !== 'accepted')
          .map((row) => visualObjectAcceptanceSummary(row));
        const acceptedRows = receipts.filter((row) => row.status === 'accepted');
        return {
          accepted,
          rejected,
          receipts,
          summary: {
            schema: 'simulatte.visualObjectAcceptanceLedger.v1',
            sceneKind,
            promptGroundedCount: rows.filter((row) => row.promptGrounded).length,
            acceptedCount: acceptedRows.length,
            rejectedCount: receipts.length - acceptedRows.length,
            acceptedIds: acceptedRows.map((row) => row.id).slice(0, 16),
            rejectedIds: receipts.filter((row) => row.status !== 'accepted').map((row) => row.id).slice(0, 16),
            rows: receipts.slice(0, 32),
          },
        };
      }

    function visualObjectAcceptanceReceipt(object, sceneKind, promptText, index) {
        const source = String(object && object.source || '');
        const phrase = object && (object.phrase || object.role || object.id) || '';
        const promptGrounded = !/\b(?:without|no|not|never|exclude|avoid)\b/i.test(phrase) && visualPromptGroundedObject(object, promptText);
        return {
          schema: 'simulatte.visualObjectAcceptance.v1',
          id: object && object.id || `object-${index + 1}`,
          sourceGraphId: object && object.id || '',
          sourceKind: source || 'compiled-object',
          sourceIds: uniqueList([
            object && object.id,
            object && object.semanticRef,
            object && object.physicalRef,
          ].filter(Boolean)).slice(0, 6),
          sceneKind,
          phrase,
          promptGrounded,
          status: 'rejected',
          confidence: 0,
          reason: '',
        };
      }

    function visualPromptGroundedObject(object, promptText) {
        const source = String(object && object.source || '');
        const phrase = object && (object.phrase || object.role || object.id) || '';
        if (source === 'semantic-surface-grounder') return phraseMatchesPrompt(phrase, promptText);
        if (/^embedding-guided-synth-environment/.test(source) && phrase && !phraseMatchesPrompt(phrase, promptText)) {
          return false;
        }
        if (/^embedding-guided-synth/.test(source) && phrase) {
          return phraseMatchesPrompt(phrase, promptText) || /\b(event|node)\b/.test(source);
        }
        return isPromptGroundedComponent(object, promptText);
      }

    function visualObjectAcceptanceDecision(object, sceneKind, promptText, hasPromptGrounded) {
        const source = String(object && object.source || '');
        const phrase = object && (object.phrase || object.role || object.id) || '';
        const phraseMatched = phraseMatchesPrompt(phrase, promptText);
        const promptGrounded = !/\b(?:without|no|not|never|exclude|avoid)\b/i.test(phrase) && visualPromptGroundedObject(object, promptText);
        if (promptGrounded) {
          return {
            status: 'accepted',
            reason: 'source graph row is prompt-grounded visual intent',
            confidence: phraseMatched ? 0.96 : 0.86,
            promptGrounded: true,
          };
        }
        if (/^embedding-guided-synth-environment/.test(source) && hasPromptGrounded) {
          return {
            status: 'rejected',
            reason: 'embedding-near environment did not match prompt surface terms',
            confidence: 0.18,
            supportOnly: true,
          };
        }
        if (source === 'catalog') {
          if (catalogSupportIsPrompted(object, promptText)) {
            return {
              status: 'accepted',
              reason: 'catalog support is explicitly named by the prompt',
              confidence: 0.72,
              supportOnly: false,
            };
          }
          if (hasPromptGrounded) {
            return {
              status: 'rejected',
              reason: 'catalog solver support kept out of visual evidence',
              confidence: 0.22,
              supportOnly: true,
            };
          }
        }
        if (source && source !== 'catalog' && phraseMatched && !/\b(?:without|no|not|never|exclude|avoid)\b/i.test(phrase)) {
          return {
            status: 'accepted',
            reason: 'compiled source row phrase matches prompt evidence',
            confidence: 0.82,
            promptGrounded: true,
          };
        }
        if (!/\b(?:without|no|not|never|exclude|avoid)\b/i.test(phrase) && sceneCompatibleSupportComponent(object, sceneKind, promptText)) {
          return hasPromptGrounded
            ? {
              status: 'rejected',
              reason: 'scene-compatible support is not source-linked to prompt visual intent',
              confidence: 0.34,
              supportOnly: true,
            }
            : {
              status: 'accepted',
              reason: 'scene-compatible support retained only to seed a sparse visual graph',
              confidence: 0.48,
              supportOnly: true,
            };
        }
        return {
          status: 'rejected',
          reason: 'row is neither prompt-grounded nor compatible visual support',
          confidence: 0.12,
          supportOnly: true,
        };
      }

    function annotateAcceptedVisualObject(object, row) {
        return {
          ...object,
          visualStatus: 'accepted',
          visualConfidence: row.confidence,
          visualReason: row.reason,
          visualSourceGraphId: row.sourceGraphId,
          visualSourceKind: row.sourceKind,
          visualSourceIds: row.sourceIds,
          visualSupportOnly: row.supportOnly === true,
        };
      }

    function visualObjectAcceptanceSummary(row) {
        return {
          schema: row.schema,
          id: row.id,
          sourceGraphId: row.sourceGraphId,
          sourceKind: row.sourceKind,
          sourceIds: row.sourceIds,
          sceneKind: row.sceneKind,
          phrase: row.phrase,
          status: row.status,
          confidence: row.confidence,
          reason: row.reason,
          promptGrounded: row.promptGrounded === true,
          supportOnly: row.supportOnly === true,
        };
      }

    function sceneObjectPriority(object, sceneKind) {
        const source = String(object && object.source || '');
        if (source === 'phase2-language-anchor' || sceneKind === 'robotics-control' && source === 'open-semantic-rag' && /(?:protein\s+)?sample\s+holder/.test(object.phrase || '')) return 11;
        const isCatalog = source === 'catalog';
        const text = [
          object.id,
          object.shape,
          object.material,
          object.visualRegime,
          object.role,
          object.phrase,
          object.assembly,
          object.source,
        ].join(' ').toLowerCase();
        if (/^embedding-guided-synth/.test(object.source || '')) return 12;
        const expandedPriority = expandedSceneObjectPriority(text, object, sceneKind);
        if (Number.isFinite(expandedPriority)) return expandedPriority;
        if (isPromptGroundedComponent(object)) return promptGroundedScenePriority(text, object, sceneKind);
        if (sceneKind === 'fire') {
          if (/optic|prism|lens|mirror|queue|traffic|network|river|water|erosion|sediment|terrain|growth-decay|population/.test(text)) return -1;
          if (/flame|fire|smoke|fuel|wood|thermal|heat|plume|pine|wind|air|ridge/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'thermal-plume') {
          if (/optic|prism|lens|mirror|queue|traffic|network/.test(text)) return -1;
          if (/thermal|plume|smoke|heat|cooling|fin|air|metal|conductor|sensor/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'ferrofluid') {
          if (/flame-front|fuel-bed|fire|smoke|queue|traffic/.test(text)) return -1;
          if (/ferrofluid|magnet|coil|current|copper|conductor|dipole|field|spike/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'thin-film') {
          if (/flame-front|fuel-bed|fire|queue|traffic|terrain/.test(text)) return -1;
          if (/soap|film|bubble|wire|loop|foam|membrane|light|optic|interference|air/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'granular') {
          if (/flame-front|fuel-bed|fire|smoke|optic|lens|prism/.test(text)) return -1;
          if (/granular|grain|bead|sieve|avalanche|powder|sand|rock|sediment|gravity/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'mechanical') {
          if (/embedding-guided-synth/.test(text)) return 10;
          if (/collision|friction|rigid-body|soft-body|wheel|wall|constraint|surface-boundary|energy-ledger|metal|rubber/.test(text)) return 6;
          return -1;
        }
        if (sceneKind === 'literal-composite') {
          if (/embedding-guided-synth/.test(text)) return 10;
          if (/black hole|singularity|swamp|wetland|hammer|gold|glass|fractur|collision|constraint|rigid-body/.test(text)) return 8;
          return -1;
        }
        if (sceneKind === 'city') {
          if (/flame-front|fuel-bed|fire|smoke|wood|thermal/.test(text)) return -1;
          if (/network|queue|traffic|market|power|sensor|ledger|delay|controller/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'optics') {
          if (/flame-front|fuel-bed|fire|smoke|wood|thermal/.test(text)) return -1;
          if (/optic|prism|lens|mirror|light|ray|glass|sensor|lamp/.test(text)) return 8;
          if (/water|fluid|flow|advection|pressure/.test(text)) return 4;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'watershed') {
          if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
          if (/catalog/.test(text)) {
            if (/water|river|flow|terrain|heightfield|erosion|channel|sand|soil|clay|rock|sediment|gravity|granular|grain|slope/.test(text)) return 6;
            return -1;
          }
          if (/water|river|flow|swim|swimming|terrain|mountain|mountaint|tree|plant|forest|erosion|sand|soil|rock|sediment|gravity|granular|grain|bead|sieve|avalanche|powder/.test(text)) return 8;
          return 2;
        }
        if (sceneKind === 'magnetic-machine') {
          if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
          if (/\b(rotor-wheel|stator-slider|solar-panel|motor-load)\b/.test(text)) return 10;
          if (/magnet|ferrofluid|coil|current|conductor|copper|rotor|stator|wheel|slider|solar|panel|motor|load|flux|dipole/.test(text)) return 8;
          return isCatalog ? -1 : 2;
        }
        if (sceneKind === 'biology') {
          if (/flame-front|fire|smoke|thermal/.test(text) ||
            (/fuel-bed/.test(text) && !/flower|plant|tree|leaf|root|biomass|ecological|biological/.test(text))) {
            return -1;
          }
          if (/catalog/.test(text)) {
            if (/leaf|soil|wood|root|gel|membrane|soft-body|growth-decay|diffusion|nutrient|biomass|water/.test(text)) return 5;
            return -1;
          }
          if (/dog|cat|mouse|gerbil|hamster|animal|mammal|flower|tree|plant|leaf|root|bio|cell|bacteria|mycelium|protein|gel|membrane|growth|infection/.test(text)) return 8;
          return 2;
        }
        if (sceneKind === 'acoustic') {
          if (/flame-front|fuel-bed|fire|smoke|thermal/.test(text)) return -1;
          if (/acoustic|sound|wave|pressure|resonance|emitter|tube|water|brass|membrane/.test(text)) return 8;
          return 1;
        }
        return 2;
      }

    function promptGroundedScenePriority(text, object, sceneKind) {
        const source = String(object && object.source || '');
        const directBoost = /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-family|prompt-explicit|render-ir|doppler-residual/.test(source) ? 2 : 0;
        if (sceneKind === 'biology') {
          if (/dog|cat|mouse|gerbil|hamster|animal|mammal|flower|tree|plant|leaf|root|biomass|soft_tissue|soft-tissue|gel|membrane|growth|bio/.test(text)) {
            return 9 + directBoost;
          }
          return 5 + directBoost;
        }
        if (sceneKind === 'watershed') {
          if (/dog|cat|mouse|gerbil|hamster|animal|mammal|swim|swimming|water|pool|river|flow|pressure|fluid-advection|terrain|mountain|mountaint|tree|plant|forest|soil|rock|sediment/.test(text)) {
            return 9 + directBoost;
          }
          return 4 + directBoost;
        }
        if (sceneKind === 'mechanical') {
          if (/wheel|collision|crash|impact|constraint|animal-body|dog|cat|mouse|gerbil|hamster/.test(text)) return 7 + directBoost;
          return 4 + directBoost;
        }
        return 4 + directBoost;
      }

    function expandedSceneObjectPriority(text, object, sceneKind) {
        const source = String(object && object.source || '');
        const direct = /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-explicit|render-ir|doppler-residual/.test(source);
        const directBoost = direct ? 3 : 0;
        const reject = (pattern) => (pattern.test(text) ? -1 : null);
        const keep = (pattern, score = 6) => (pattern.test(text) ? score + directBoost : null);
        const fallback = () => (direct ? 3 : -1);
        const choose = (...values) => values.find((value) => value !== null && value !== undefined);

        if (sceneKind === 'particle-instrument') {
          return choose(
            keep(/\b(collider|muon|particle|track|collision|plume|detector|calorimeter|field line|instrument|sensor|heat|thermal|electromagnetic|magnetic)\b/, 7),
            reject(/\b(queue|traffic|market|soil|bacteria|robot|warehouse)\b/),
            fallback()
          );
        }
        if (sceneKind === 'restoration-water') {
          return choose(
            keep(/\b(mangrove|root|storm|surge|sediment|brackish|tidal|channel|water|fluid|terrain|soil|biomass|granular|gravity|growth|ecological)\b/, 7),
            reject(/\b(magnet|optic|lens|thermal-source|queue|traffic|robot)\b/),
            fallback()
          );
        }
        if (sceneKind === 'evolution-ecology') {
          return choose(
            keep(/\b(microbiome|colony|colonies|metabolite|intestinal|immune|sampling|bacteria|cell|membrane|population|nutrient|diffusion|biological|ecology|organism)\b/, 7),
            reject(/\b(magnet|electromagnet|optics?|thermal-source|phase-change|queue|traffic|robot|warehouse)\b/),
            fallback()
          );
        }
        if (sceneKind === 'molecular-biology') {
          return choose(
            keep(/\b(protein|fold|bond|constraint|energy|molecular|chain|solvent|enzyme|ribosome|fermentation|sourdough|gluten|dough|yeast|bubble|acid|chemical|biological|soft-body|population)\b/, 7),
            reject(/\b(robot|warehouse|magnet|electromagnet|optics?|queue|traffic|thermal-source|phase-change-material)\b/),
            fallback()
          );
        }
        if (sceneKind === 'digital-network') {
          return choose(
            keep(/\b(server|rack|data center|cooling|aisle|controller|network|packet|queue|signal|heat|thermal|sensor|silicon|coolant)\b/, 7),
            reject(/\b(magnet|protein|bacteria|terrain|glacier|robot arm)\b/),
            fallback()
          );
        }
        if (sceneKind === 'civic-market') {
          return choose(
            keep(/\b(railway|dispatch|signal|block|train|agent|platform|slot|zoning|shadow|building|sunlight|pedestrian|parcel|market|queue|network|ledger|constraint)\b/, 7),
            reject(/\b(flame|smoke|protein|glacier|bacteria)\b/),
            fallback()
          );
        }
        if (sceneKind === 'planetary-space') {
          return choose(
            keep(/\b(planet|planetary|ring|moon|resonance|orbit|orbital|gravity|gap|boulder|ice|space|trajectory|density wave)\b/, 7),
            reject(/\b(queue|robot|warehouse|bacteria|thermal-source|fluid-advection|acoustic-emitter)\b/),
            fallback()
          );
        }
        if (sceneKind === 'ocean-cryosphere') {
          return choose(
            reject(/\b(acoustic-emitter|resonator|queue|network|robot|thermal-source|granular-bed)\b/),
            keep(/\b(glacier|calving|fjord|sea ice|iceberg|ice|ocean|water|wave|cryosphere|shelf|fluid|phase|fracture|stress|terrain)\b/, 7),
            fallback()
          );
        }
        if (sceneKind === 'robotics-control') {
          return choose(
            reject(/\b(bacteria|glacier|plasma|fire|thermal-source|fluid-advection)\b/),
            keep(/\b(robot|robotic|arm|gripper|servo|workcell|manipulator|warehouse|conveyor|parcel|sort|task|sensor|feedback|force|contact|collision|friction|motor|metal|protein|sample holder)\b/, 7),
            fallback()
          );
        }
        return null;
      }

    function layoutObjectsForScene(objects, sceneKind, spec, visualGenome = null) {
        if (sceneKind === 'mechanical') return layoutMechanicalObjects(objects);
        if (sceneKind === 'thin-film') return layoutThinFilmObjects(objects);
        if (sceneKind === 'ferrofluid') return layoutFerrofluidObjects(objects);
        if (sceneKind === 'thermal-plume') return layoutThermalPlumeObjects(objects);
        if (sceneKind === 'literal-composite') return layoutLiteralCompositeObjects(objects);
        return layoutGenericSemanticObjects(objects, sceneKind, visualGenome);
      }

    function layoutGenericSemanticObjects(objects, sceneKind = '', visualGenome = null) {
        const slots = layoutSlotsForGenome(visualGenome);
        let entityIndex = 0;
        let fieldIndex = 0;
        let readoutIndex = 0;
        return objects.map((object) => {
          if (object && object.pose && (Number.isFinite(Number(object.pose.x)) || Array.isArray(object.pose.points))) return object;
          const text = renderObjectText(object);
          const genomeSeed = visualGenome && visualGenome.seed || 1;
          const seed = hashProgram(`${genomeSeed}:${sceneKind}:${object && object.id || ''}:${text}`) || 1;
          const asymmetry = visualGenome && visualGenome.morphology ? visualGenome.morphology.asymmetry || 0.3 : 0.3;
          const jitterX = (unitFromSeed(seed, 3) - 0.5) * (0.035 + asymmetry * 0.08);
          const jitterY = (unitFromSeed(seed, 5) - 0.5) * (0.035 + asymmetry * 0.08);
          if (/field|flow|plume|matrix|volume|water|thermal|optical|chemical|gradient/.test(text)) {
            const y = /water|ocean|watershed|cryosphere/.test(sceneKind) ? 0.64 : 0.52;
            fieldIndex += 1;
            return withPose(object, clamp(0.5 + jitterX, 0.12, 0.88), clamp(y + jitterY + fieldIndex * 0.015, 0.14, 0.86), 0, [0.68, 0.42]);
          }
          if (/readout|meter|telemetry|panel|scope|measurement/.test(text)) {
            const x = readoutIndex % 2 ? 0.84 : 0.16;
            const y = 0.18 + Math.floor(readoutIndex / 2) * 0.12;
            readoutIndex += 1;
            return withPose(object, clamp(x + jitterX, 0.08, 0.92), clamp(y + jitterY, 0.08, 0.9), 0, [0.16, 0.1]);
          }
          const slot = slots[entityIndex % slots.length];
          const row = Math.floor(entityIndex / slots.length);
          entityIndex += 1;
          return withPose(
            object,
            clamp(slot[0] + jitterX, 0.08, 0.92),
            clamp(slot[1] + row * 0.08 + jitterY, 0.08, 0.92),
            unitFromSeed(seed, 7) * 0.2 - 0.1,
            [0.14 + unitFromSeed(seed, 11) * 0.08, 0.1 + unitFromSeed(seed, 13) * 0.06]
          );
        });
      }

    function layoutSlotsForGenome(visualGenome = null) {
        const mode = visualGenome && visualGenome.morphology && visualGenome.morphology.layoutMode || '';
        if (mode === 'network') return [[0.16, 0.24], [0.38, 0.2], [0.62, 0.24], [0.84, 0.32], [0.25, 0.58], [0.5, 0.54], [0.75, 0.6], [0.5, 0.82]];
        if (mode === 'radial') return [[0.5, 0.26], [0.68, 0.38], [0.72, 0.6], [0.52, 0.74], [0.3, 0.62], [0.24, 0.4], [0.5, 0.5], [0.82, 0.48]];
        if (mode === 'strata') return [[0.2, 0.24], [0.42, 0.3], [0.66, 0.38], [0.82, 0.46], [0.24, 0.58], [0.5, 0.66], [0.74, 0.74], [0.5, 0.84]];
        if (mode === 'section') return [[0.18, 0.28], [0.36, 0.34], [0.58, 0.4], [0.78, 0.48], [0.28, 0.7], [0.54, 0.68], [0.78, 0.74], [0.12, 0.58]];
        return [[0.18, 0.34], [0.38, 0.28], [0.62, 0.32], [0.82, 0.42], [0.24, 0.66], [0.5, 0.62], [0.74, 0.68], [0.5, 0.82]];
      }

    function layoutMechanicalObjects(objects) {
        let wheelIndex = 0;
        let animalIndex = 0;
        const wheelCount = objects.filter((object) => object.shape === 'wheel').length;
        const wheelSlots = wheelCount > 1 ? [[0.36, 0.56], [0.64, 0.56]] : [[0.42, 0.56]];
        return objects.map((object) => {
          const text = renderObjectText(object);
          if (object.shape === 'wheel') {
            const slot = wheelSlots[Math.min(wheelIndex, wheelSlots.length - 1)];
            wheelIndex += 1;
            return withPose(object, slot[0], slot[1], 0, [0.27, 0.27]);
          }
          if (object.shape === 'animal-body') {
            const slot = wheelSlots[Math.min(animalIndex, wheelSlots.length - 1)];
            animalIndex += 1;
            return withPose(object, slot[0], slot[1] + 0.015, 0.02, [0.17, 0.105]);
          }
          if (/wall|constraint|surface-boundary/.test(text)) return withPose(object, 0.78, 0.56, 0.02, [0.055, 0.34]);
          if (/collision|impact|crash|fractur/.test(text)) return withPose(object, 0.56, 0.51, 0, [0.12, 0.09]);
          if (/energy-ledger|meter/.test(text)) return withPose(object, 0.18, 0.78, -0.04, [0.11, 0.08]);
          return object;
        });
      }

    function layoutThinFilmObjects(objects) {
        let bubbleIndex = 0;
        const bubbleSlots = [[0.42, 0.43], [0.57, 0.51], [0.48, 0.58], [0.62, 0.4]];
        return objects.map((object) => {
          if (object.shape === 'film') return withPose(object, 0.5, 0.47, 0.02, [0.46, 0.34]);
          if (object.shape === 'wire-loop') return withPose(object, 0.5, 0.47, 0, [0.52, 0.38]);
          if (object.shape === 'bubble') {
            const slot = bubbleSlots[bubbleIndex % bubbleSlots.length];
            bubbleIndex += 1;
            return withPose(object, slot[0], slot[1], 0, [0.12, 0.12]);
          }
          return object;
        });
      }

    function layoutFerrofluidObjects(objects) {
        let conductorIndex = 0;
        return objects.map((object) => {
          const text = renderObjectText(object);
          if (/ferrofluid/.test(text)) return withPose(object, 0.5, 0.62, 0, [0.34, 0.18]);
          if (object.shape === 'coil') return withPose(object, 0.5, 0.34, 0.02, [0.32, 0.2]);
          if (/current|pulsing|dipole|field-envelope/.test(text)) return withPose(object, 0.5, 0.46, 0, [0.42, 0.3]);
          if (/copper|conductor|magnet|metal/.test(text)) {
            const x = conductorIndex % 2 ? 0.72 : 0.28;
            conductorIndex += 1;
            return withPose(object, x, 0.55, conductorIndex % 2 ? 0.1 : -0.1, [0.14, 0.09]);
          }
          return object;
        });
      }

    function layoutThermalPlumeObjects(objects) {
        return objects.map((object) => {
          const text = renderObjectText(object);
          if (object.shape === 'cooling-fins') return withPose(object, 0.5, 0.76, 0, [0.46, 0.18]);
          if (/thermal plume|plume|heat|thermal-source/.test(text)) {
            if (object.shape === 'flow-path') {
              return withPathPose(object, [[0.5, 0.76], [0.52, 0.55], [0.48, 0.28]]);
            }
            return withPose(object, 0.5, 0.6, 0, [0.12, 0.09]);
          }
          if (/air|smoke/.test(text)) return withPose(object, 0.56, 0.4, 0, [0.12, 0.1]);
          return object;
        });
      }

    function layoutLiteralCompositeObjects(objects) {
        return objects.map((object) => {
          const text = renderObjectText(object);
          const identity = `${object.id || ''} ${object.shape || ''} ${object.material || ''} ${object.role || ''}`.toLowerCase();
          if (/black hole|singularity/.test(identity) || /black hole|singularity/.test(text)) {
            return withPose(object, 0.78, 0.32, 0, [0.28, 0.28]);
          }
          if (/swamp|wetland/.test(identity) || /swamp|wetland/.test(text)) {
            return withPose(object, 0.46, 0.75, 0, [0.56, 0.22]);
          }
          if (/hammer/.test(identity)) return withPose(object, 0.48, 0.5, -0.38, [0.22, 0.14]);
          if (/gold/.test(identity)) return withPose(object, 0.34, 0.58, 0.05, [0.24, 0.08]);
          if (/glass|lens|prism/.test(identity)) return withPose(object, 0.58, 0.49, 0.08, [0.16, 0.14]);
          if (/fractur|collision|impact/.test(text)) return withPose(object, 0.61, 0.45, 0, [0.12, 0.09]);
          return object;
        });
      }

    function renderObjectText(object) {
        return [
          object && object.id,
          object && object.shape,
          object && object.material,
          object && object.role,
          object && object.phrase,
          object && object.assembly,
          object && object.source,
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function withPose(object, x, y, rotation = 0, size = null) {
        const pose = { ...(object.pose || {}), x, y, rotation };
        delete pose.points;
        if (size) {
          pose.w = size[0];
          pose.h = size[1];
        }
        return { ...object, pose };
      }

    function withPathPose(object, points) {
        return { ...object, pose: { ...(object.pose || {}), points } };
      }

    function renderRegistryRef() {
        try {
          if (typeof module === 'object' && module.exports) {
            return require('../phase-05-simulation/simulatte-render-registry.js');
          }
        } catch (error) {
          /* fall through to global lookup */
        }
        const scope = typeof globalThis !== 'undefined' ? globalThis : window;
        return (scope && scope.SimulatteRenderRegistry) || null;
      }
    Object.assign(scope, {
      semanticVisualRows,
      atlasAddressableTokens,
      semanticRule,
      semanticMaterialRule,
      semanticProcessRule,
      isPromptGroundedGenomeObject,
      genomeMotifs,
      sceneAllowsMotifFamily,
      genomePalette,
      genomeMorphology,
      normalizeHue,
      unitFromSeed,
      prioritizeObjectsForScene,
      visualObjectAcceptanceLedger,
      visualObjectAcceptanceReceipt,
      visualPromptGroundedObject,
      visualObjectAcceptanceDecision,
      annotateAcceptedVisualObject,
      visualObjectAcceptanceSummary,
      sceneObjectPriority,
      promptGroundedScenePriority,
      expandedSceneObjectPriority,
      layoutObjectsForScene,
      layoutGenericSemanticObjects,
      layoutMechanicalObjects,
      layoutThinFilmObjects,
      layoutFerrofluidObjects,
      layoutThermalPlumeObjects,
      layoutLiteralCompositeObjects,
      renderObjectText,
      withPose,
      withPathPose,
      renderRegistryRef,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
