(function attachSimulatteWebGpuRendererpixelproof(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function scenePacketVariantCode(row = {}) {
        const text = `${row.id || ''}:${row.label || ''}:${row.sourceGraphId || ''}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967295;
      }

    function scenePacketIdentityLabel(row = {}) {
    	    const identity = row.identity || {};
    	    return identity.sourceLabel || identity.label || identity.type || row.label || row.id || row.layerSlot || 'object';
    	  }

    function scenePacketIdentitySummary(packet, sceneKind = '') {
        const drawables = scenePacketUniformDrawables(packet, sceneKind).slice(0, SCENE_PACKET_OBJECT_SLOTS);
        return scenePacketIdentitySummaryForDrawables(drawables);
      }

    function scenePacketIdentitySummaryForDrawables(drawables = []) {
        return drawables.map((row, index) => {
          const transform = scenePacketDrawableTransform(row, index, drawables.length);
          const identity = row.identity || {};
          return [
            `${index}:${scenePacketIdentityLabel(row)}`,
            identity.category || row.packetKind || '',
            row.layerSlot || '',
            `@${Number(transform.x || 0).toFixed(2)},${Number(transform.y || 0).toFixed(2)}`,
          ].filter(Boolean).join(':');
        }).join(';') || 'none';
      }

    function sceneObjectUniformSummary(vector, packet = null, sceneKind = '') {
        const drawables = packet ? scenePacketUniformDrawables(packet, sceneKind).slice(0, SCENE_PACKET_OBJECT_SLOTS) : [];
        return sceneObjectUniformSummaryForDrawables(vector, drawables);
      }

    function sceneObjectUniformSummaryForDrawables(vector, drawables = []) {
        const rows = [];
        for (let i = 0; i < SCENE_PACKET_OBJECT_SLOTS; i += 1) {
          const styleOffset = SCENE_PACKET_OBJECT_SLOTS * 4 + i * 4;
          const identityOffset = SCENE_PACKET_OBJECT_SLOTS * 8 + i * 4;
          const layerCode = vector && vector[styleOffset] || 0;
          if (layerCode <= 0) continue;
          const layer = VISUAL_IR_LAYER_SLOTS[Math.max(0, Math.floor(layerCode) - 1)] || 'unknown';
          const semanticCode = vector && vector[identityOffset] || 0;
          const label = drawables[i] ? scenePacketIdentityLabel(drawables[i]) : `semantic-${Number(semanticCode || 0).toFixed(0)}`;
          rows.push(`${i}:${label}:${layer}@${Number(vector[i * 4] || 0).toFixed(2)},${Number(vector[i * 4 + 1] || 0).toFixed(2)}`);
        }
        return rows.join(';') || 'none';
      }

    function addScenePacketLayers(vector, packet, sceneKind = '') {
        if (!packet) return;
        const addRow = (row, strength) => {
          if (!row || !row.layerSlot) return;
          addVisualIrLayerSlot(vector, row.layerSlot, strength);
        };
        for (const row of scenePacketRows(packet, 'entities')) addRow(row, 0.96);
        for (const row of scenePacketRows(packet, 'fields')) addRow(row, 0.72);
        for (const row of scenePacketRows(packet, 'effects')) addRow(row, 0.58);
      }

    function visualIrLayerVector(packet) {
        const vector = scenePacketUniformVector(packet, 'visualLayers', VISUAL_IR_LAYER_SLOTS.length);
        if (activeVisualIrLayerSlots(vector)) return compressVisualIrLayerVector(vector);
        addScenePacketLayers(vector, packet);
        return compressVisualIrLayerVector(vector);
      }

    function addVisualIrLayerSlot(vector, slot, value) {
        const index = VISUAL_IR_LAYER_SLOTS.indexOf(slot);
        if (index < 0) return;
        vector[index] = clamp01(vector[index] + value);
      }

    function compressVisualIrLayerVector(input) {
        const vector = new Float32Array(VISUAL_IR_LAYER_SLOTS.length);
        const ranked = Array.from(input || []).map((value, index) => ({
          index,
          value: clamp01(value),
        })).sort((a, b) => b.value - a.value || a.index - b.index);
        ranked.forEach((entry, rank) => {
          if (entry.value < 0.06) return;
          const gain = rank === 0 ? 1.12 : rank < 6 ? 0.94 : rank < 12 ? 0.7 : 0.46;
          vector[entry.index] = clamp01(entry.value * gain);
        });
        return vector;
      }

    function visualIrLayerSummary(vector) {
        return Array.from(vector || [])
          .map((value, index) => ({ slot: VISUAL_IR_LAYER_SLOTS[index], value: clamp01(value) }))
          .filter((entry) => entry.value >= 0.06)
          .sort((a, b) => b.value - a.value || a.slot.localeCompare(b.slot))
          .slice(0, 10)
          .map((entry) => `${entry.slot}:${entry.value.toFixed(2)}`)
          .join(',');
      }

    function activeVisualIrLayerSlots(vector) {
        return Array.from(vector || []).filter((value) => clamp01(value) >= 0.06).length;
      }

    function addSceneKindMix(vector, sceneKind, strength = 0.32) {
        const value = String(sceneKind || '').toLowerCase();
        if (!value) return;
        if (/thermal|fire|plume|weather/.test(value)) addSceneMixSlot(vector, 'thermal', strength);
        if (/watershed|ocean|fluid|restoration|cryosphere/.test(value)) addSceneMixSlot(vector, 'water', strength);
        if (/mechanical|structural|sport/.test(value)) addSceneMixSlot(vector, 'mechanical', strength);
        if (/magnetic|ferrofluid/.test(value)) addSceneMixSlot(vector, 'magnetic', strength);
        if (/optics|thin-film|quantum/.test(value)) addSceneMixSlot(vector, 'optical', strength);
        if (/acoustic/.test(value)) addSceneMixSlot(vector, 'acoustic', strength);
        if (/biology|ecology|clinical|agro|molecular/.test(value)) addSceneMixSlot(vector, 'biological', strength);
        if (/chemistry|material|cultural/.test(value)) addSceneMixSlot(vector, 'chemical', strength);
        if (/planetary|space|atomic/.test(value)) addSceneMixSlot(vector, 'orbital', strength);
        if (/digital|city|civic|venue|network|grid/.test(value)) addSceneMixSlot(vector, 'network', strength);
        if (/energy|grid|advanced|plasma/.test(value)) addSceneMixSlot(vector, 'energy', strength);
        if (/robot|manufacturing|factory/.test(value)) addSceneMixSlot(vector, 'robotic', strength);
        if (/granular/.test(value)) addSceneMixSlot(vector, 'granular', strength);
        if (/instrument|particle|detector/.test(value)) addSceneMixSlot(vector, 'instrument', strength);
        if (/phase|thin-film|cryosphere/.test(value)) addSceneMixSlot(vector, 'phase', strength * 0.8);
        if (/hazard|storm|wildfire|tsunami|earthquake/.test(value)) addSceneMixSlot(vector, 'hazard', strength);
      }

    function addSceneMixSlot(vector, slot, value) {
        const index = SCENE_MIX_SLOTS.indexOf(slot);
        if (index < 0) return;
        vector[index] = clamp01(vector[index] + value);
      }

    function compressSceneMixVector(input) {
        const vector = new Float32Array(SCENE_MIX_SLOTS.length);
        const ranked = Array.from(input || []).map((value, index) => ({
          index,
          value: clamp01(value),
        })).sort((a, b) => b.value - a.value || a.index - b.index);
        ranked.forEach((entry, rank) => {
          if (entry.value < 0.08) return;
          const gain = rank === 0 ? 1 : rank < 4 ? 0.92 : rank < 8 ? 0.76 : 0.54;
          vector[entry.index] = clamp01(entry.value * gain);
        });
        if (!ranked.length || ranked[0].value < 0.08) {
          addSceneMixSlot(vector, 'mechanical', 0.42);
        }
        return vector;
      }

    function sceneMixSummary(vector) {
        return Array.from(vector || [])
          .map((value, index) => ({ slot: SCENE_MIX_SLOTS[index], value: clamp01(value) }))
          .filter((entry) => entry.value >= 0.08)
          .sort((a, b) => b.value - a.value || a.slot.localeCompare(b.slot))
          .slice(0, 8)
          .map((entry) => `${entry.slot}:${entry.value.toFixed(2)}`)
          .join(',');
      }

    function activeSceneMixSlots(vector) {
        return Array.from(vector || []).filter((value) => clamp01(value) >= 0.08).length;
      }

    function featureStrength(features) {
        let total = 0;
        for (const value of features || []) total += value;
        return clamp(total / 4, 0, 1);
      }

    function metricsForScenePacket(packet) {
        const layers = new Set(scenePacketLayerList(packet));
        const entityCount = scenePacketEntityCount(packet);
        const fieldCount = scenePacketFieldCount(packet);
        const effectCount = scenePacketEffectCount(packet);
        return {
          heat: layers.has('thermal-field') || layers.has('phase-boundary') ? 0.72 : 0.35,
          flow: layers.has('water-volume') || layers.has('flow-field') || layers.has('network-flow') ? 0.66 : 0.42,
          density: clamp01(0.36 + entityCount * 0.035 + fieldCount * 0.025),
          bloom: layers.has('optical-field') || layers.has('readout-panel') || effectCount > 2 ? 0.82 : 0.58,
          motion: layers.has('track-line') || layers.has('process-pulse') || layers.has('acoustic-waveguide') ? 0.76 : 0.42,
        };
      }

    function paletteForScene(sceneKind, atoms, compiledPalette = null) {
        const compiled = paletteVectorToVec4(compiledPalette);
        if (compiled) return compiled;
        const dominant = dominantAtomSlot(atoms);
        if (dominant === 'quantum') return paletteToVec4(PALETTES.quantum);
        if (dominant === 'robotic') return paletteToVec4(PALETTES.robot);
        if (dominant === 'network' || dominant === 'feedback') return paletteToVec4(PALETTES.network);
        if (dominant === 'optical') return paletteToVec4(PALETTES.optics);
        if (dominant === 'orbital') return paletteToVec4(PALETTES.space);
        if (dominant === 'chemical') return paletteToVec4(PALETTES.chemistry);
        if (dominant === 'biological') return paletteToVec4(PALETTES.bio);
        if (dominant === 'acoustic') return paletteToVec4(PALETTES.acoustic);
        if (dominant === 'granular') return paletteToVec4(PALETTES.cultural);
        if (dominant === 'thermal' || dominant === 'combustion') return paletteToVec4(PALETTES.thermal);
        if (dominant === 'fluid') return paletteToVec4(PALETTES.water);
        if (dominant === 'stress') return paletteToVec4(PALETTES.factory);
        if (dominant === 'electromagnetic') return paletteToVec4(PALETTES.magnet);
        if (sceneKind === 'thin-film') return paletteToVec4(PALETTES.optics);
        if (sceneKind === 'magnetic-machine') return paletteToVec4(PALETTES.magnet);
        if (sceneKind === 'fire') return paletteToVec4(PALETTES.thermal);
        if (sceneKind === 'ocean' || sceneKind === 'ocean-cryosphere') return paletteToVec4(PALETTES.water);
        if (sceneKind === 'structural-mechanics') return paletteToVec4(PALETTES.factory);
        if (sceneKind === 'material-tray') return paletteToVec4(PALETTES.factory);
        if (sceneKind === 'evolution-ecology' || sceneKind === 'restoration-water') return paletteToVec4(PALETTES.bio);
        if (sceneKind === 'city' || sceneKind === 'civic-market' || sceneKind === 'venue-crowd') return paletteToVec4(PALETTES.network);
        if (sceneKind === 'particle-instrument' || sceneKind === 'space-instrument') return paletteToVec4(PALETTES.instrument);
        if (sceneKind === 'hazard-atmosphere') return paletteToVec4(PALETTES.weather);
        if (sceneKind === 'advanced-energy') return paletteToVec4(PALETTES.plasma);
        if (sceneKind === 'thermal-plume') return paletteToVec4(PALETTES.thermal);
        if (sceneKind === 'grid-energy') return paletteToVec4(PALETTES.grid);
        if (sceneKind === 'robotics-control') return paletteToVec4(PALETTES.robot);
        if (sceneKind === 'manufacturing-line') return paletteToVec4(PALETTES.factory);
        if (sceneKind === 'quantum-instrument') return paletteToVec4(PALETTES.quantum);
        if (sceneKind === 'agro-waste-loop') return paletteToVec4(PALETTES.agro);
        if (sceneKind === 'sport-motion') return paletteToVec4(PALETTES.sport);
        if (sceneKind === 'cultural-material') return paletteToVec4(PALETTES.cultural);
        return paletteToVec4(PALETTES.machine);
      }

    function paletteVectorToVec4(values = null) {
        if (!Array.isArray(values) || values.length < 16) return null;
        const out = [];
        for (let index = 0; index < 4; index += 1) {
          const offset = index * 4;
          out.push(new Float32Array([
            clamp01(values[offset]),
            clamp01(values[offset + 1]),
            clamp01(values[offset + 2]),
            clamp01(values[offset + 3] || 1),
          ]));
        }
        return out;
      }

    function dominantAtomSlot(atoms) {
        if (!atoms || !atoms.length) return '';
        let best = { index: -1, value: 0 };
        for (let i = 0; i < atoms.length; i += 1) {
          if (atoms[i] > best.value) best = { index: i, value: atoms[i] };
        }
        if (best.value < 0.18) return '';
        return ATOM_UNIFORM_SLOTS[best.index] || '';
      }

    function paletteToVec4(colors) {
        return colors.map((color) => {
          const rgb = hexToRgb(color);
          return new Float32Array([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1]);
        });
      }

    function hexToRgb(hex) {
        const normalized = String(hex || '#ffffff').replace('#', '');
        const value = Number.parseInt(normalized.length === 3
          ? normalized.split('').map((c) => `${c}${c}`).join('')
          : normalized, 16);
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
      }

    function dynamicMetric(base, state, key) {
        const fields = state && state.fields || {};
        const fieldValue = Number(fields[key] || fields.temperature || fields.pressure || 0);
        return clamp01(Number(base || 0) * 0.76 + clamp01(fieldValue) * 0.24);
      }

    async function requestWebGpuDevice(adapter) {
        const available = adapterFeatureList(adapter);
        const optional = WEBGPU_OPTIONAL_FEATURES.filter((feature) => adapterFeatureHas(adapter, feature));
        const attempts = [
          optional,
          optional.filter((feature) => !feature.startsWith('chromium-')),
          [],
        ];
        const tried = new Set();
        const failures = [];
        for (const features of attempts) {
          const key = features.join('|');
          if (tried.has(key)) continue;
          tried.add(key);
          try {
            const descriptor = features.length ? { requiredFeatures: features } : {};
            return {
              device: await adapter.requestDevice(descriptor),
              receipt: {
                schema: 'simulatte.webgpuFeatureReceipt.v1',
                available,
                requested: features,
                enabled: features,
                failed: failures,
                used: ['uniform-fullscreen-fallback'],
                unsupportedNativeFeatures: WEBGPU_NATIVE_ONLY_FEATURES.slice(),
              },
            };
          } catch (err) {
            failures.push({
              requested: features,
              message: err && err.message ? err.message : 'WebGPU requestDevice failed',
            });
          }
        }
        throw new Error(failures.length ? failures[failures.length - 1].message : 'WebGPU requestDevice failed');
      }

    function adapterFeatureList(adapter) {
        try {
          return Array.from(adapter && adapter.features || []).map(String).sort();
        } catch (_err) {
          return [];
        }
      }

    function adapterFeatureHas(adapter, feature) {
        try {
          return Boolean(adapter && adapter.features && typeof adapter.features.has === 'function' && adapter.features.has(feature));
        } catch (_err) {
          return false;
        }
      }

    function webgpuFeatureSummary(receipt = {}) {
        const enabled = Array.isArray(receipt.enabled) && receipt.enabled.length
          ? receipt.enabled.join('+')
          : 'standard';
        const used = Array.isArray(receipt.used) && receipt.used.length
          ? receipt.used.join('+')
          : 'uniform-fullscreen-fallback';
        return `enabled:${enabled};used:${used}`;
      }

    function seedForScenePacket(packet, spatialHash = '', summary = '') {
        const text = [
          packet && packet.sceneKind,
          spatialHash || scenePacketSpatialHash(packet),
          summary || sceneRenderPacketSummary(packet),
        ].filter(Boolean).join('|');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967295;
      }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

    function clamp01(value) {
        return clamp(Number(value || 0), 0, 1);
      }

    function clampInt(value, min, max) {
        const parsed = Math.round(Number(value || 0));
        if (!Number.isFinite(parsed)) return min;
        return Math.max(min, Math.min(max, parsed));
      }

    Object.assign(scope, {
      scenePacketVariantCode,
      scenePacketIdentityLabel,
      scenePacketIdentitySummary,
      scenePacketIdentitySummaryForDrawables,
      sceneObjectUniformSummary,
      sceneObjectUniformSummaryForDrawables,
      addScenePacketLayers,
      visualIrLayerVector,
      addVisualIrLayerSlot,
      compressVisualIrLayerVector,
      visualIrLayerSummary,
      activeVisualIrLayerSlots,
      addSceneKindMix,
      addSceneMixSlot,
      compressSceneMixVector,
      sceneMixSummary,
      activeSceneMixSlots,
      featureStrength,
      metricsForScenePacket,
      paletteForScene,
      paletteVectorToVec4,
      dominantAtomSlot,
      paletteToVec4,
      hexToRgb,
      dynamicMetric,
      requestWebGpuDevice,
      adapterFeatureList,
      adapterFeatureHas,
      webgpuFeatureSummary,
      seedForScenePacket,
      clamp,
      clamp01,
      clampInt,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
