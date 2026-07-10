(function attachSimulatteCompositionGraphvisualgenome(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function scenePacketAddSceneKindMix(vector, sceneKind, strength = 0.32) {
        const value = String(sceneKind || '').toLowerCase();
        if (!value) return;
        const add = (slot, amount = strength) => scenePacketAddSlot(vector, SCENE_MIX_SLOTS, slot, amount);
        if (/thermal|fire|plume|weather/.test(value)) add('thermal');
        if (/watershed|ocean|fluid|restoration|cryosphere/.test(value)) add('water');
        if (/mechanical|structural|sport/.test(value)) add('mechanical');
        if (/magnetic|ferrofluid/.test(value)) add('magnetic');
        if (/optics|thin-film|quantum/.test(value)) add('optical');
        if (/acoustic/.test(value)) add('acoustic');
        if (/biology|ecology|clinical|agro|molecular/.test(value)) add('biological');
        if (/chemistry|material|cultural/.test(value)) add('chemical');
        if (/planetary|space|atomic/.test(value)) add('orbital');
        if (/digital|city|civic|venue|network|grid/.test(value)) add('network');
        if (/energy|grid|advanced|plasma/.test(value)) add('energy');
        if (/robot|manufacturing|factory/.test(value)) add('robotic');
        if (/granular/.test(value)) add('granular');
        if (/instrument|particle|detector/.test(value)) add('instrument');
        if (/phase|thin-film|cryosphere/.test(value)) add('phase', strength * 0.8);
        if (/hazard|storm|wildfire|tsunami|earthquake/.test(value)) add('hazard');
      }

    function scenePacketAddLayerSceneMix(vector, layerSlot = '', categoryCode = 0) {
        const add = (slot, value) => scenePacketAddSlot(vector, SCENE_MIX_SLOTS, slot, value);
        switch (String(layerSlot || '')) {
          case 'biological-agent':
          case 'organic-matrix':
            add('biological', 0.72);
            break;
          case 'water-volume':
          case 'flow-field':
          case 'bubble-volume':
            add('water', 0.64);
            break;
          case 'detector-geometry':
          case 'readout-panel':
          case 'track-line':
            add('instrument', 0.72);
            break;
          case 'node-graph':
          case 'network-flow':
            add('network', 0.72);
            break;
          case 'thermal-field':
            add('thermal', 0.7);
            break;
          case 'optical-field':
            add('optical', 0.68);
            break;
          case 'chemical-front':
            add('chemical', 0.66);
            break;
          case 'robot-armature':
            add('robotic', 0.68);
            break;
          case 'granular-strata':
            add('granular', 0.66);
            break;
          case 'orbital-body':
            add('orbital', 0.68);
            break;
          case 'acoustic-waveguide':
            add('acoustic', 0.68);
            break;
          case 'phase-boundary':
            add('phase', 0.64);
            break;
          case 'particle-swarm':
            add('instrument', 0.38);
            break;
          default:
            break;
        }
        if (categoryCode === 5) add('instrument', 0.32);
        if (categoryCode === 6) add('network', 0.32);
        if (categoryCode === 9) add('biological', 0.32);
      }

    function scenePacketAddSlot(vector, slots, slot, value) {
        const index = slots.indexOf(slot);
        if (index < 0) return;
        vector[index] = clamp(vector[index] + value, 0, 1);
      }

    function scenePacketCompressVector(input, threshold, maxSlots) {
        const ranked = (input || []).map((value, index) => ({
          index,
          value: clamp(Number(value || 0), 0, 1),
        })).sort((a, b) => b.value - a.value || a.index - b.index);
        const out = new Array(input.length).fill(0);
        ranked.slice(0, maxSlots).forEach((entry, rank) => {
          if (entry.value < threshold) return;
          const gain = rank === 0 ? 1 : rank < 4 ? 0.92 : rank < 8 ? 0.76 : 0.54;
          out[entry.index] = Number(clamp(entry.value * gain, 0, 1).toFixed(4));
        });
        return out;
      }

    function scenePacketRenderCodes({ id = '', label = '', sourceGraphId = '', layerSlot = '', identity = {}, animation = {}, packetKind = '' }) {
        return {
          schema: 'simulatte.sceneRenderCodes.v1',
          layerCode: scenePacketLayerCode(layerSlot),
          animationCode: scenePacketAnimationCode(animation && animation.kind),
          semanticCode: scenePacketSemanticCode(identity),
          categoryCode: scenePacketCategoryCode(identity, packetKind),
          variantCode: scenePacketVariantCode(id, label, sourceGraphId),
          packetKindCode: scenePacketKindCode(packetKind),
        };
      }

    function scenePacketLayerCode(layerSlot) {
        const index = VISUAL_IR_LAYER_SLOTS.indexOf(String(layerSlot || ''));
        return index >= 0 ? index + 1 : 0;
      }

    function scenePacketAnimationCode(kind) {
        const value = String(kind || '').toLowerCase();
        switch (value) {
          case 'swim-cycle': return 1;
          case 'flow-ripple': return 2;
          case 'particle-track': return 3;
          case 'readout-pulse': return 4;
          case 'packet-flow': return 5;
          case 'fermentation-rise': return 6;
          case 'plume-rise': return 7;
          case 'orbital-drift': return 8;
          default: return value ? scenePacketStableCode(value, 9, 64) : 0.5;
        }
      }

    function scenePacketSemanticCode(identity = {}) {
        const value = String(identity.type || '').toLowerCase();
        switch (value) {
          case 'dog': return 1;
          case 'cat': return 2;
          case 'animal': return 3;
          case 'water': return 4;
          case 'smoke': return 5;
          case 'fire': return 6;
          case 'robot': return 7;
          case 'instrument': return 8;
          case 'readout': return 9;
          case 'network-node': return 10;
          case 'protein': return 11;
          case 'cell': return 12;
          case 'structure': return 13;
          case 'field': return 14;
          default: {
            const text = [
              identity.type,
              identity.category,
              identity.renderClass,
              identity.sourceLabel,
              identity.primitive,
              identity.semanticRef,
              identity.physicalRef,
            ].filter(Boolean).join(':').toLowerCase();
            return text ? scenePacketStableCode(text, 15, 96) : 0;
          }
        }
      }

    function scenePacketCategoryCode(identity = {}, packetKind = '') {
        switch (String(identity.category || '').toLowerCase()) {
          case 'animal': return 1;
          case 'medium': return 2;
          case 'field': return 3;
          case 'surface': return 4;
          case 'instrument': return 5;
          case 'network': return 6;
          case 'machine': return 7;
          case 'process': return 8;
          case 'biological': return 9;
          case 'entity':
          case 'object': return 10;
          default:
            return packetKind === 'entity' ? 10 : packetKind === 'field' ? 3 : packetKind === 'effect' ? 8 : 0;
        }
      }

    function scenePacketKindCode(kind) {
        if (kind === 'entity') return 1;
        if (kind === 'field') return 2;
        if (kind === 'effect') return 3;
        return 0;
      }

    function scenePacketVariantCode(id = '', label = '', sourceGraphId = '') {
        const text = `${id}:${label}:${sourceGraphId}`;
        return scenePacketHashUnit(text);
      }

    function scenePacketStableCode(text, min, max) {
        const unit = scenePacketHashUnit(text);
        return min + Math.floor(unit * Math.max(1, max - min + 1));
      }

    function scenePacketHashUnit(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return Number(((hash >>> 0) / 4294967295).toFixed(6));
      }

    function scenePacketDrawablePriority(row = {}, sceneKind = '') {
        const layer = String(row.layerSlot || '');
        const scene = String(sceneKind || '').toLowerCase();
        const identity = row.identity || {};
        let score = row.packetKind === 'entity' ? 8 : row.packetKind === 'field' ? 3 : 2;
        if (identity.type && identity.type !== 'object' && identity.type !== 'field') score += 4;
        if (identity.category === 'animal') score += 5;
        if (identity.category === 'medium') score += 3;
        if (layer === 'water-volume') score += /water|ocean|watershed|restoration|cryosphere/.test(scene) ? 6 : 4;
        if (layer === 'biological-agent') score += 5;
        if (layer === 'detector-geometry' || layer === 'track-line' || layer === 'readout-panel') score += 5;
        if (layer === 'node-graph' || layer === 'network-flow') score += 5;
        if (layer === 'organic-matrix' || layer === 'bubble-volume') score += 5;
        if (layer === 'thermal-field' || layer === 'phase-boundary') score += 4;
        if (layer === 'field-sheet' || layer === 'flow-field') score += 2;
        score += clamp(Number(row.confidence || 0), 0, 1) * 2;
        return Number(score.toFixed(3));
      }

    function scenePacketSceneId(sceneKind = '') {
        const ids = {
          'thermal-plume': 0,
          fire: 33,
          'weather-atmosphere': 1,
          watershed: 2,
          ocean: 23,
          'mechanical-fluid': 3,
          mechanical: 3,
          'structural-mechanics': 24,
          ferrofluid: 4,
          'magnetic-machine': 4,
          optics: 5,
          'optics-thermal': 5,
          'thin-film': 34,
          acoustic: 6,
          biology: 7,
          ecology: 25,
          'evolution-ecology': 25,
          'restoration-water': 26,
          'agro-waste-loop': 20,
          'chemistry-lab': 8,
          'material-tray': 35,
          cryosphere: 27,
          'ocean-cryosphere': 27,
          'planetary-space': 10,
          'digital-network': 11,
          city: 28,
          'civic-market': 29,
          'venue-crowd': 30,
          'advanced-energy': 12,
          'grid-energy': 16,
          'molecular-biology': 13,
          'clinical-control': 14,
          'particle-instrument': 15,
          'quantum-instrument': 19,
          atomic: 19,
          'robotics-control': 17,
          'manufacturing-line': 18,
          granular: 22,
          'sport-motion': 21,
          'cultural-material': 36,
          'hazard-atmosphere': 31,
          'space-instrument': 32,
        };
        return ids[String(sceneKind || '')] ?? 3;
      }

    function scenePacketClamp01(value, fallback = 0) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? clamp(numeric, 0, 1) : fallback;
      }

    function scenePacketSize(value, fallback = 0.1) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? clamp(numeric, 0.01, 1) : fallback;
      }

    function renderInstanceLayerSlot(type, row = {}, entity = null, process = null, sceneKind = '') {
        const text = [
          type,
          row.id,
          row.primitive,
          row.kind,
          row.visualEncoding,
          row.grammar,
          row.operator,
          row.materialId,
          ...(row.affects || []),
          entity && entity.kind,
          entity && entity.shape,
          entity && entity.role,
          entity && entity.material,
          process && process.family,
        ].filter(Boolean).join(' ').toLowerCase();
        const scene = String(sceneKind || '').toLowerCase();
        const networkScene = /\b(city|civic-market|digital-network|venue-crowd|network)\b/.test(scene);
        const biologicalText = text.replace(/\b(parcel[-_ ]?cell[-_ ]?grid|cell[-_ ]?grid|grid[-_ ]?cell|grid[-_ ]?cells)\b/g, ' ');
        if (/causal[-_ ]?affordance|causal[-_ ]?relation|cause|causes|produces|drives|modulates/.test(text)) {
          return 'causal-affordance';
        }
        if (/wake[-_ ]?ripple|wake_generation|agent[-_ ]?wake|ripple[-_ ]?trail/.test(text)) return 'flow-field';
        if (/partial[-_ ]?submersion|partial_submersion|submersion[-_ ]?mask|waterline|body_water_contact/.test(text)) return 'process-pulse';
        if (/swim[-_ ]?pose|swim[-_ ]?stroke|swim[-_ ]?cycle|fluid_locomotion/.test(text) && (type === 'process' || type === 'motion')) return 'process-pulse';
        if (networkScene && /\b(flow[-_ ]?path|flows?|fluid|field|route|routing|queue|network|packet|traffic|backlog|throughput)\b/.test(text)) {
          return /\b(node|nodes|graph)\b/.test(text) ? 'node-graph' : 'network-flow';
        }
        if (/thermal|heat|combust|flame|fire|smoke|soot|plasma/.test(text)) return 'thermal-field';
        if (/detector|calorimeter|instrument/.test(text)) return 'detector-geometry';
        if (/readout|measurement|telemetry/.test(text)) return 'readout-panel';
        if (/\b(gluten|dough|sourdough|ferment|fermentation|organic[-_ ]?matrix|porous[-_ ]?dough|strand[-_ ]?network|matrix)\b/.test(text)) {
          return 'organic-matrix';
        }
        if (/\b(bubble|bubbles|gas[-_ ]?pocket|foam)\b/.test(text)) return 'bubble-volume';
        if (/dog|cat|animal|biological|cell|organic|soft|flower|plant|tree|leaf|root|mangrove|botanical|biomass|plant-cluster|botanical-cluster/.test(biologicalText)) return 'biological-agent';
        if (/\b(node|nodes|graph|queue|route|routing|network|rail|railway|parcel|dispatch|platform|signal|packet|traffic|backlog|throughput)\b/.test(text)) {
          return /\b(queue|route|routing|network[-_ ]?flow|queue-pressure|backlog|throughput|dispatch|signal|packet|traffic)\b/.test(text)
            ? 'network-flow'
            : 'node-graph';
        }
        if (/\b(track|tracks|trajectory|muon|collider|particle[-_ ]?track|particle[-_ ]?instrument)\b/.test(text)) return 'track-line';
        if (/water|fluid|ripple|volume-ribbon/.test(text)) return 'water-volume';
        if (/optical|ray|caustic|spectral/.test(text)) return 'optical-field';
        if (/field|scalar|vector|pressure|force/.test(text)) return 'field-sheet';
        if (/robot|gripper|servo/.test(text)) return 'robot-armature';
        if (/granular|sediment|grain|strata/.test(text)) return 'granular-strata';
        if (/orbit|planet|moon/.test(text)) return 'orbital-body';
        if (/acoustic|waveguide|sound/.test(text)) return 'acoustic-waveguide';
        if (/chemical|acid|reaction|diffusion/.test(text)) return 'chemical-front';
        if (/phase|melt|freeze|transition/.test(text)) return 'phase-boundary';
        if (/motion|pulse|process/.test(text)) return 'process-pulse';
        return type === 'field' ? 'field-sheet' : type === 'process' || type === 'motion' ? 'process-pulse' : 'material-surface';
      }

    function visualRowAccepted(row = {}) {
        return row.status !== 'rejected';
      }

    function visualRejectedRowsForIR(rendererPlan = {}, graphicsAtoms = {}) {
        const objectRows = rendererPlan && rendererPlan.visualObjectLedger &&
          Array.isArray(rendererPlan.visualObjectLedger.rows)
          ? rendererPlan.visualObjectLedger.rows
          : [];
        return [
          ...objectRows
            .filter((row) => row.status !== 'accepted')
            .map((row) => ({
              schema: 'simulatte.visualRejectedRow.v1',
              id: row.id,
              sourceGraphId: row.sourceGraphId,
              sourceKind: row.sourceKind,
              status: row.status,
              reason: row.reason,
              supportOnly: row.supportOnly === true,
            })),
          ...((graphicsAtoms && graphicsAtoms.rejections) || []).map((row, index) => ({
            schema: 'simulatte.visualRejectedRow.v1',
            id: row.id || `graphics-atom-rejection-${index + 1}`,
            sourceKind: 'graphics-atom',
            status: 'rejected',
            reason: row.reason || row.message || 'graphics atom rejected by visual operator compiler',
          })),
        ].slice(0, 48);
      }

    function motionSpeedForScene(sceneKind, family) {
        const text = `${sceneKind} ${family}`.toLowerCase();
        if (/explosion|hazard|packet|signal|plasma|collision/.test(text)) return 0.74;
        if (/growth|cultural|repository|clinical/.test(text)) return 0.22;
        if (/queue|traffic|flow|orbit|wave/.test(text)) return 0.46;
        return 0.34;
      }

    function visualOperatorsForIR(
        entities,
        materials,
        fields,
        processes,
        geometry,
        motion,
        recipe,
        causalAffordances = [],
        graphicsAtoms = {}
      ) {
        const base = [
          visualOperator('camera-frame', 'camera', 'sets explanatory view before drawing'),
          visualOperator('material-shaders', 'material', 'draws material-specific surface and volume cues'),
          visualOperator('geometry-instances', 'geometry', 'places objects, agents, media, and instruments'),
          visualOperator('field-overlays', 'field', 'renders scalar/vector fields as contours, rays, or graph pressure'),
          visualOperator('process-motion', 'process', 'animates evolving physical processes'),
          visualOperator('receipt-marks', 'receipt', 'adds minimal evidence ticks for why marks exist'),
        ];
        if ((recipe && recipe.layerPlan || []).includes('diagnostics')) {
          base.push(visualOperator('diagnostic-sightlines', 'annotation', 'draws instrument sightlines and readout paths'));
        }
        if ((fields || []).some((field) => /network|node-link/.test(field.visualEncoding))) {
          base.push(visualOperator('agent-network-routing', 'field', 'draws queue and routing pressure through graph edges'));
        }
        if ((materials || []).some((material) => material.emissive)) {
          base.push(visualOperator('emissive-bloom', 'lighting', 'adds bounded glow for hot or charged materials'));
        }
        if ((geometry || []).some((row) => row.primitive === 'volume-ribbon')) {
          base.push(visualOperator('volume-ribbons', 'geometry', 'renders transparent media and plumes with depth'));
        }
        if ((motion || []).some((row) => /orbit|wave/.test(row.grammar))) {
          base.push(visualOperator('phase-trails', 'motion', 'renders orbit, acoustic, or wave phase trails'));
        }
        if ((causalAffordances || []).length) {
          base.push(visualOperator(
            'causal-affordance-program',
            'process',
            'composes hand-authored causal geometry, shader, and motion hints'
          ));
        }
        if (graphicsAtomCount(graphicsAtoms)) {
          base.push(visualOperator(
            'visual-operator-atlas',
            'operator-basis',
            'composes reusable graphics atoms from grounded physical operators'
          ));
        }
        return base;
      }

    function visualOperator(id, stage, reason) {
        return { id, stage, reason };
      }

    function visualReceiptsForIR(
        entities,
        materials,
        fields,
        processes,
        operators,
        rendererPlan,
        causalAffordances = [],
        graphicsAtoms = {},
        renderInstances = []
      ) {
        const objectLedger = rendererPlan && rendererPlan.visualObjectLedger || {};
        const acceptedObjectCount = Number(objectLedger.acceptedCount || entities.length || 0);
        const rejectedObjectCount = Number(objectLedger.rejectedCount || 0);
        return [
          {
            id: 'receipt:entities',
            reason: `${entities.length} grounded visual entities compiled from graph objects`,
            count: entities.length,
            acceptedCount: entities.filter(visualRowAccepted).length,
            rejectedSourceObjectCount: rejectedObjectCount,
            sourceGraphIds: entities.map((row) => row.sourceGraphId || row.sourceObject || row.id).filter(Boolean).slice(0, 16),
          },
          {
            id: 'receipt:materials',
            reason: `${materials.length} material shader rows selected from object materials and semantic plan`,
            count: materials.length,
            acceptedCount: materials.filter(visualRowAccepted).length,
          },
          {
            id: 'receipt:fields',
            reason: `${fields.length} visible field encodings compiled from PhysicsIR/render fields`,
            count: fields.length,
            acceptedCount: fields.filter(visualRowAccepted).length,
          },
          {
            id: 'receipt:processes',
            reason: `${processes.length} process motion grammars compiled from solver families`,
            count: processes.length,
            acceptedCount: processes.filter(visualRowAccepted).length,
          },
          {
            id: 'receipt:visual-object-acceptance',
            reason: `${acceptedObjectCount} accepted visual graph objects; ${rejectedObjectCount} support objects rejected from visual evidence`,
            count: acceptedObjectCount + rejectedObjectCount,
            acceptedCount: acceptedObjectCount,
            rejectedCount: rejectedObjectCount,
            acceptedIds: (objectLedger.acceptedIds || []).slice(0, 16),
            rejectedIds: (objectLedger.rejectedIds || []).slice(0, 16),
          },
          {
            id: 'receipt:render-instances',
            reason: `${renderInstances.length} explicit render instances compiled from accepted VisualIR rows`,
            count: renderInstances.length,
            acceptedCount: renderInstances.filter(visualRowAccepted).length,
            instanceIds: renderInstances.map((row) => row.id).slice(0, 16),
            layerSlots: uniqueList(renderInstances.map((row) => row.layerSlot).filter(Boolean)).slice(0, 16),
          },
          {
            id: 'receipt:operators',
            reason: `${operators.length} low-level renderer operators scheduled`,
            count: operators.length,
          },
          {
            id: 'receipt:recipe',
            reason: rendererPlan && rendererPlan.visualRecipe
              ? `handwritten style recipe ${rendererPlan.visualRecipe.sceneKind} provides defaults only`
              : 'no style recipe; VisualIR uses object and field structure',
            count: rendererPlan && rendererPlan.visualRecipe ? 1 : 0,
          },
          {
            id: 'receipt:causal-affordances',
            reason: `${(causalAffordances || []).length} causal affordance rows compiled into visual program hints`,
            count: (causalAffordances || []).length,
            affordanceIds: (causalAffordances || []).map((row) => row.id).slice(0, 12),
            causalRelationIds: uniqueList((causalAffordances || []).map((row) => row.causalRelationId).filter(Boolean)).slice(0, 12),
            shaderHints: uniqueList((causalAffordances || []).flatMap((row) => row.shaderHints || [])).slice(0, 16),
            motionHints: uniqueList((causalAffordances || []).flatMap((row) => row.motionHints || [])).slice(0, 16),
          },
          {
            id: 'receipt:graphics-atoms',
            reason: `${graphicsAtomCount(graphicsAtoms)} reusable graphics atoms compiled from the visual operator atlas`,
            count: graphicsAtomCount(graphicsAtoms),
            atlasId: graphicsAtoms && graphicsAtoms.atlasId || '',
            compiler: graphicsAtoms && graphicsAtoms.compiler || '',
            mappingIds: (graphicsAtoms && graphicsAtoms.mappings || []).map((row) => row.id).slice(0, 12),
            uniformSlots: graphicsAtoms && graphicsAtoms.uniforms &&
              Object.keys(graphicsAtoms.uniforms.bySlot || {}).filter((slot) => graphicsAtoms.uniforms.bySlot[slot] > 0),
            wgslOperators: (graphicsAtoms && graphicsAtoms.wgslOperators || []).slice(0, 16),
            geometryAtoms: (graphicsAtoms && graphicsAtoms.geometry || []).map((row) => row.id).slice(0, 12),
            fieldAtoms: (graphicsAtoms && graphicsAtoms.fields || []).map((row) => row.id).slice(0, 12),
            materialAtoms: (graphicsAtoms && graphicsAtoms.materials || []).map((row) => row.id).slice(0, 12),
            processAtoms: (graphicsAtoms && graphicsAtoms.processes || []).map((row) => row.id).slice(0, 12),
            motionAtoms: (graphicsAtoms && graphicsAtoms.motion || []).map((row) => row.id).slice(0, 12),
            languageSignalCount: (graphicsAtoms && graphicsAtoms.languageSignals || []).length,
            languageSignals: (graphicsAtoms && graphicsAtoms.languageSignals || [])
              .map((row) => row.id || row.kind || row.text)
              .filter(Boolean)
              .slice(0, 12),
          },
        ];
      }

    function graphicsAtomCount(graphicsAtoms = {}) {
        return ['geometry', 'fields', 'materials', 'processes', 'motion', 'camera']
          .reduce((total, key) => total + ((graphicsAtoms[key] || []).length), 0);
      }

    function visualSafeId(value) {
        return String(value || 'row').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'row';
      }

    function visualScaleForScene(sceneKind, entities) {
        const text = `${sceneKind} ${(entities || []).map((entity) => entity.label).join(' ')}`.toLowerCase();
        if (/cell|protein|micro|molecule|catalyst|biofilm/.test(text)) return 'micro';
        if (/planet|orbit|space|galaxy|comet|asteroid/.test(text)) return 'orbital';
        if (/city|market|traffic|hospital|warehouse|railway|zoning/.test(text)) return 'system';
        if (/terrain|watershed|hazard|atmosphere|storm|reef|peatland/.test(text)) return 'landscape';
        return 'bench';
      }

    function visualCameraForScene(sceneKind, recipe, entities, visualGenome = null) {
        const scale = visualScaleForScene(sceneKind, entities);
        const scaleTier = visualGenome && visualGenome.scaleTier || scale;
        const archetype = visualGenome && visualGenome.cameraArchetype || '';
        const mode = recipe && recipe.camera ||
          (scale === 'micro' ? 'microscopic-cutaway-depth'
            : scale === 'orbital' ? 'orbital-depth'
              : scale === 'system' ? 'network-map-depth'
                : scale === 'landscape' ? 'topographic-cutaway-depth'
                  : 'instrumented-lab-depth');
        return {
          mode,
          scale,
          scaleTier,
          archetype,
          framing: /network|system|map/.test(mode) ? 'wide-system' : /micro/.test(mode) ? 'macro-detail' : 'explanatory-three-quarter',
          depth: /depth|cutaway|orbital/.test(mode) ? 'layered' : 'flat',
        };
      }

    function visualLightingForScene(sceneKind, recipe, visualGenome) {
        const palette = visualGenome && visualGenome.palette || {};
        const text = `${sceneKind} ${recipe && recipe.materialLanguage || ''}`.toLowerCase();
        const model = /space|optics|transparent|orbital/.test(text) ? 'spectral-rim'
          : /clinical|chemistry|cultural/.test(text) ? 'instrumented-clinical'
            : /hazard|thermal|plasma|energy/.test(text) ? 'volumetric-emissive'
              : /water|restoration|ecology/.test(text) ? 'underwater-atmospheric'
                : /digital|civic|venue/.test(text) ? 'monitor-and-map'
                  : 'soft-lab';
        return {
          model,
          keyHue: palette.hue || 180,
          rimHue: palette.accentHue || 220,
          shadowHue: palette.shadowHue || 34,
          contrast: palette.contrast || 0.68,
        };
      }

    function visualGenomeForComposition(graph, objects, fields, solverPlan, spec, sceneKind) {
        const genomeObjects = genomeSourceObjects(objects);
        const compiledText = compiledVisualGenomeText(graph, genomeObjects, fields, solverPlan, spec, sceneKind);
        const objectSignature = uniqueList((genomeObjects || []).map((object) => [
          object.id,
          object.shape,
          object.material,
          object.role,
          object.phrase,
          object.assembly,
          object.visualRegime,
        ].filter(Boolean).join(':'))).join('|');
        const fieldSignature = uniqueList((fields || []).map((field) => field.kind || field.channel)).join('|');
        const solverSignature = uniqueList([
          ...((solverPlan && solverPlan.executableSteps) || []),
          ...((solverPlan && solverPlan.steps) || []),
        ]).join('|');
        const seedText = [compiledText, sceneKind, objectSignature, fieldSignature, solverSignature].join('|');
        const seed = hashProgram(seedText) || 1;
        const directObjectSignature = uniqueList((genomeObjects || [])
          .filter(isPromptGroundedGenomeObject)
          .map((object) => [
            object.id,
            object.shape,
            object.material,
            object.role,
            object.phrase,
            object.assembly,
            object.visualRegime,
          ].filter(Boolean).join(':'))).join('|');
        const motifText = `${compiledText} ${directObjectSignature}`.toLowerCase();
        const tokens = compiledTokensForGenome(compiledText);
        const visualDna = compiledDnaForGenome(compiledText, seed);
        const motifs = genomeMotifs(motifText, sceneKind, genomeObjects, fields);
        const semanticVisuals = semanticVisualsForGenome(compiledText, genomeObjects, fields, sceneKind, seed, tokens);
        const dialectPlan = visualDialectPlanForGenome({
          sceneKind,
          objects: genomeObjects,
          fields,
          solverPlan,
          semanticVisuals,
        });
        const visualDialect = dialectPlan.visualDialect;
        const compositionTopology = dialectPlan.compositionTopology;
        const scaleTier = dialectPlan.scaleTier;
        const cameraArchetype = dialectPlan.cameraArchetype;
        const palette = genomePalette(sceneKind, motifs, seed, dialectPlan.paletteAnchor);
        const morphology = genomeMorphology(sceneKind, motifs, seed, genomeObjects, fields, visualDna, semanticVisuals, compositionTopology);
        return {
          schema: VISUAL_GENOME_SCHEMA,
          id: `vg_${seed.toString(36).padStart(6, '0')}`,
          seed,
          sourceHash: hashProgram(compiledText),
          source: 'compiled-artifact-seeded-procedural',
          sceneKind,
          visualDialect,
          compositionTopology,
          cameraArchetype,
          scaleTier,
          evidence: dialectPlan.evidence,
          dialect: {
            geometryGrammar: dialectPlan.geometryGrammar,
            layoutGrammar: dialectPlan.layoutGrammar,
            motionGrammar: dialectPlan.motionGrammar,
            paletteAnchor: dialectPlan.paletteAnchor,
          },
          palette,
          morphology,
          motifs,
          tokens,
          visualDna,
          semanticVisuals,
          objectSignature: hashProgram(objectSignature),
          fieldSignature: hashProgram(fieldSignature),
          stochastic: {
            mode: 'deterministic-compiled-artifact-seeded',
            sampler: 'hash-noise',
            dimensions: [
              'semantic-atlas',
              'semantic-archetype',
              'material-shader',
              'process-overlay',
              'ngram-dna',
              'texture',
              'motif',
              'field-density',
            ],
          },
        };
      }

    function genomeSourceObjects(objects) {
        return (objects || []).filter((object) => {
          const source = String(object && object.source || '');
          if (source && source !== 'catalog') return true;
          if (object && (object.semanticRef || object.physicalRef)) return true;
          return false;
        });
      }

    function compiledVisualGenomeText(graph, objects, fields, solverPlan, spec, sceneKind) {
        const visualAffordances = causalAffordancesFromSpec(spec, sceneKind);
        return [
          sceneKind,
          ...(objects || []).map((object) => [
            object.id,
            object.shape,
            object.material,
            object.role,
            object.phrase,
            object.assembly,
            object.visualRegime,
            object.source,
            object.semanticRef,
            object.physicalRef,
          ].filter(Boolean).join(' ')),
          ...(fields || []).map((field) => [
            field.id,
            field.kind,
            field.channel,
            field.stateBinding,
            field.domainId,
          ].filter(Boolean).join(' ')),
          ...((solverPlan && solverPlan.executableSteps) || []),
          ...((solverPlan && solverPlan.steps) || []),
          ...visualAffordances.map((row) => [
            row.id,
            row.causalRelationId,
            row.sceneKind,
            row.geometry,
            ...(row.shaderHints || []),
            ...(row.motionHints || []),
          ].filter(Boolean).join(' ')),
        ].filter(Boolean).join(' ').toLowerCase();
      }

    function compiledTokensForGenome(value) {
        const stop = new Set([
          'and', 'with', 'the', 'into', 'from', 'over', 'under', 'while',
          'primitive', 'semantic', 'open', 'generated', 'component', 'material',
          'process', 'physics', 'sample', 'field', 'domain', 'state', 'visual',
          'render', 'body', 'catalog', 'prompt', 'derived', 'generic',
        ]);
        return uniqueList(String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s-]+/g, ' ')
          .split(/\s+/)
          .map((token) => token.replace(/^-+|-+$/g, ''))
          .flatMap((token) => token.split('-'))
          .map((token) => token.replace(/^-+|-+$/g, ''))
          .filter((token) => token.length > 2 && !/^\d+$/.test(token) && !stop.has(token))
          .slice(0, 96));
      }

    function compiledDnaForGenome(compiledText, seed) {
        const rawTokens = compiledTokensForGenome(compiledText).slice(0, 24);
        const sourceTokens = rawTokens.length ? rawTokens : ['blank'];
        const ngrams = [];
        for (let n = 1; n <= 3; n += 1) {
          for (let index = 0; index <= sourceTokens.length - n; index += 1) {
            const text = sourceTokens.slice(index, index + n).join(' ');
            const hash = hashProgram(`${n}:${index}:${text}:${seed}`);
            ngrams.push({
              text,
              n,
              index,
              hash,
              lane: hash % 7,
              mark: hash % 9,
              hue: normalizeHue(hash % 360),
              weight: Number((0.42 + unitFromSeed(hash, n + index + 1) * 0.58).toFixed(3)),
            });
          }
        }
        const selected = ngrams
          .sort((a, b) => a.index - b.index || b.n - a.n || a.text.localeCompare(b.text))
          .slice(0, 32);
        const hash = hashProgram(selected.map((row) => `${row.n}:${row.index}:${row.text}:${row.hash}`).join('|'));
        return {
          schema: 'simulatte.compiledVisualDna.v1',
          catalog: PROCEDURAL_VISUAL_BASE && PROCEDURAL_VISUAL_BASE.schema || 'simulatte.proceduralVisualBase.v1',
          hash,
          tokenCount: sourceTokens.length,
          ngramCount: ngrams.length,
          ngrams: selected,
          paletteShift: Math.round(unitFromSeed(hash || seed, 41) * 160) - 80,
          densityBias: Number((0.72 + unitFromSeed(hash || seed, 43) * 1.1).toFixed(3)),
          laneBias: Math.round(unitFromSeed(hash || seed, 47) * 6),
        };
      }

    function semanticVisualsForGenome(compiledText, objects, fields, sceneKind, seed, tokens) {
        const text = String(compiledText || '').toLowerCase();
        const sourceTokens = tokens && tokens.length ? tokens : compiledTokensForGenome(compiledText);
        const archetypes = semanticVisualRows(text, seed, SEMANTIC_ARCHETYPE_RULES, 'archetype', sourceTokens);
        const materials = semanticVisualRows(text, seed, SEMANTIC_MATERIAL_RULES, 'material', sourceTokens);
        const processes = semanticVisualRows(text, seed, SEMANTIC_PROCESS_RULES, 'process', sourceTokens);
        const overlayIds = uniqueList([
          ...archetypes.map((row) => row.overlay),
          ...materials.map((row) => row.shader),
          ...processes.map((row) => row.overlay),
        ].filter(Boolean)).slice(0, 18);
        const matchedTokens = uniqueList([
          ...archetypes.flatMap((row) => row.matchedTokens || []),
          ...materials.flatMap((row) => row.matchedTokens || []),
          ...processes.flatMap((row) => row.matchedTokens || []),
        ]);
        const addressableTokens = atlasAddressableTokens(sourceTokens);
        const coverage = addressableTokens.length
          ? Number((matchedTokens.filter((token) => addressableTokens.includes(token)).length / addressableTokens.length).toFixed(3))
          : 1;
        const signatureText = [
          sceneKind,
          ...archetypes.map((row) => row.id),
          ...materials.map((row) => row.id),
          ...processes.map((row) => row.id),
          ...overlayIds,
        ].join('|');
        return {
          schema: 'simulatte.semanticVisualPlan.v1',
          atlas: SEMANTIC_VISUAL_ATLAS && SEMANTIC_VISUAL_ATLAS.schema || 'simulatte.semanticVisualAtlas.v1',
          signature: hashProgram(signatureText),
          sceneKind,
          archetypes,
          materials,
          processes,
          overlays: overlayIds,
          quality: {
            semanticTokens: sourceTokens.length,
            addressableTokens: addressableTokens.length,
            matchedTokens: matchedTokens.length,
            coverage,
            unmatchedTokens: addressableTokens.filter((token) => !matchedTokens.includes(token)),
            layerCount: archetypes.length + materials.length + processes.length,
          },
        };
      }

    Object.assign(scope, {
      scenePacketAddSceneKindMix,
      scenePacketAddLayerSceneMix,
      scenePacketAddSlot,
      scenePacketCompressVector,
      scenePacketRenderCodes,
      scenePacketLayerCode,
      scenePacketAnimationCode,
      scenePacketSemanticCode,
      scenePacketCategoryCode,
      scenePacketKindCode,
      scenePacketVariantCode,
      scenePacketDrawablePriority,
      scenePacketSceneId,
      scenePacketClamp01,
      scenePacketSize,
      renderInstanceLayerSlot,
      visualRowAccepted,
      visualRejectedRowsForIR,
      motionSpeedForScene,
      visualOperatorsForIR,
      visualOperator,
      visualReceiptsForIR,
      graphicsAtomCount,
      visualSafeId,
      visualScaleForScene,
      visualCameraForScene,
      visualLightingForScene,
      visualGenomeForComposition,
      genomeSourceObjects,
      compiledVisualGenomeText,
      compiledTokensForGenome,
      compiledDnaForGenome,
      semanticVisualsForGenome,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
