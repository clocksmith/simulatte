(function attachSimulatteWebGpuRendererpackets(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function pixelSampleForDrawable(row = {}, obligation = {}, width = 0, height = 0, index = 0, total = 1) {
        const point = phase7DrawableSamplePoint(row, index, total);
        if (!point) return null;
        const x = clampInt(Math.round(point.x * (width - 1)), 0, Math.max(0, width - 1));
        const y = clampInt(Math.round(point.y * (height - 1)), 0, Math.max(0, height - 1));
        const obligationId = obligation.obligationId || obligation.id || '';
        return {
          schema: 'simulatte.phase7PixelSample.v1',
          id: `gpu:${obligationId || 'visual'}:${row.id || index}:${index + 1}`,
          source: 'webgpu-texture-copy-readback',
          obligationId,
          label: row.label || row.id || obligation.target || obligationId,
          drawableId: row.id || '',
          layerSlot: row.layerSlot || '',
          x,
          y,
          uv: [Number(point.x.toFixed(5)), Number(point.y.toFixed(5))],
          backgroundRgba: [250, 250, 255, 255],
        };
      }

    function phase7DrawableSamplePoint(row = {}, index = 0, total = 1) {
        const domain = row.domain || {};
        if (Array.isArray(domain.center) && domain.center.length >= 2) {
          return { x: clamp01(domain.center[0]), y: clamp01(domain.center[1]) };
        }
        if (Array.isArray(domain.bounds) && domain.bounds.length >= 4) {
          const fieldLike = row.packetKind === 'field' || /field|volume|region/.test(String(domain.kind || ''));
          const fieldOffsets = [
            [0.25, 0.33],
            [0.72, 0.67],
            [0.33, 0.72],
            [0.67, 0.25],
          ];
          const offset = fieldLike
            ? fieldOffsets[Math.abs(Math.floor(index || 0)) % fieldOffsets.length]
            : [0.5, 0.5];
          return {
            x: clamp01(domain.bounds[0] + domain.bounds[2] * offset[0]),
            y: clamp01(domain.bounds[1] + domain.bounds[3] * offset[1]),
          };
        }
        const transform = scenePacketDrawableTransform(row, index, total);
        return { x: clamp01(transform.x), y: clamp01(transform.y) };
      }

    function phase7OutputEnvelope(
        renderExecutionInput,
        sceneRenderPacket,
        renderCount,
        frameMs,
        canvas,
        renderData = null,
        optimization = null
      ) {
    	    const compositionLedger = renderExecutionInput && renderExecutionInput.compositionLedger ||
    	      sceneRenderPacket && sceneRenderPacket.compositionLedger ||
    	      null;
    	    const visualObligationProof = renderObligationProof(
    	      sceneRenderPacket,
    	      renderExecutionInput && renderExecutionInput.visualObligations || [],
    	      compositionLedger,
    	      true,
    	      renderData
    	    );
    	    const visualObligationProofSummary = summarizeRenderObligationProof(visualObligationProof);
    	    const pixelAudit = renderPixelAudit(sceneRenderPacket, renderData, canvas, visualObligationProofSummary, optimization);
    	    return {
    	      schema: PHASE7_OUTPUT_SCHEMA,
          phase: 7,
          inputSchema: renderExecutionInput && renderExecutionInput.inputSchema || 'simulatte.phase6.output.v2',
    	      runtimeReceiptId: renderExecutionInput && renderExecutionInput.runtimeReceiptId || 'runtime:unknown',
    	      artifact: {
    	        renderExecution: {
    	          schema: RENDER_EXECUTION_SCHEMA,
    	          renderExecutionInputSchema: renderExecutionInput && renderExecutionInput.schema || '',
    	          sceneRenderPacketSchema: sceneRenderPacket && sceneRenderPacket.schema || '',
    	          renderDataSchema: renderData && renderData.schema || '',
    	          renderDataKey: renderData && renderData.packetKey || '',
    	          renderPath: renderData && renderData.path || '',
              drawCount: renderData && renderData.drawCount || 0,
              drawSlots: SCENE_PACKET_OBJECT_SLOTS,
              sceneInstanceCapacity: GPU_SCENE_INSTANCE_CAPACITY,
    		          sceneInstanceCount: renderData && renderData.sceneInstanceCount || 0,
    		          optimization,
    		          rendered: true,
    		          packetIdentitySummary: scenePacketIdentitySummary(sceneRenderPacket),
    		          visualObligationProof,
    		          visualObligationProofSummary,
    		          shaderPath: renderData && renderData.path || '',
    		          pixelAudit,
    		          compositionLedger,
    		          renderCount: Number(renderCount || 0),
    	          frameMs: Number(frameMs || 0),
    	          canvas: {
    	            width: canvas && Number(canvas.width || 0) || 0,
    	            height: canvas && Number(canvas.height || 0) || 0,
    	          },
    	        },
    		        compositionLedger,
    		      },
          receipts: [
            {
              id: 'phase7-webgpu-render',
              schema: 'simulatte.phaseReceipt.v1',
              sceneKind: sceneRenderPacket && sceneRenderPacket.sceneKind || '',
              entityCount: scenePacketEntityCount(sceneRenderPacket),
              fieldCount: scenePacketFieldCount(sceneRenderPacket),
              effectCount: scenePacketEffectCount(sceneRenderPacket),
              drawCount: renderData && renderData.drawCount || 0,
    		          renderDataKey: renderData && renderData.packetKey || '',
    		          optimizationPath: optimization && optimization.path || 'uniform-fullscreen',
    		          sceneInstanceCount: optimization && optimization.instanceCount || 0,
    		          indirectDraw: optimization && optimization.indirectDraw || 'cpu-fallback-draw',
    		          visualObligationProofs: visualObligationProofSummary.proofCount,
    		          failedObligations: visualObligationProofSummary.failCount,
    		          unprovenObligations: visualObligationProofSummary.notProvenCount,
    		          pixelAuditStatus: pixelAudit.status,
    		        },
    	      ],
    	    };
    	  }

    function emptySceneRenderPacket(sceneKind = '') {
        return {
          schema: 'simulatte.sceneRenderPacket.v1',
          compiler: 'simulatte.webgpu.empty-scene-render-packet.v1',
          sceneKind,
          coordinateSystem: { space: 'normalized-canvas', origin: 'top-left', bounds: [0, 0, 1, 1] },
          camera: {},
          lights: [],
          entities: [],
          fields: [],
          effects: [],
          uniforms: {
            schema: 'simulatte.sceneRenderPacketUniforms.v1',
            sceneId: SCENE_IDS[sceneKind] ?? 3,
            atomUniforms: new Array(24).fill(0),
            sceneMix: new Array(SCENE_MIX_SLOTS.length).fill(0),
            visualLayers: new Array(VISUAL_IR_LAYER_SLOTS.length).fill(0),
          },
          passes: ['background'],
          receipts: { source: 'missing-compiled-scene-packet' },
        };
      }

    function compileSceneRenderData(packet, sceneKind = '', packetKey = '') {
        const drawables = scenePacketUniformDrawables(packet, sceneKind).slice(0, GPU_SCENE_INSTANCE_CAPACITY);
        const uniformDrawables = drawables.slice(0, SCENE_PACKET_OBJECT_SLOTS);
        const sceneObjectUniforms = scenePacketObjectUniformVectorFromDrawables(uniformDrawables);
        const sceneInstanceData = scenePacketInstanceStorageVectorFromDrawables(drawables);
        const spatialHash = scenePacketSpatialHash(packet);
        const summary = sceneRenderPacketSummary(packet);
        return {
          schema: RENDER_DATA_SCHEMA,
          path: 'storage-scene-instances-with-uniform-fallback',
          packetKey: packetKey || sceneRenderPacketRenderDataKey(packet, sceneKind),
          sceneKind,
          sceneId: scenePacketSceneId(packet, sceneKind),
          entityCount: scenePacketEntityCount(packet),
          fieldCount: scenePacketFieldCount(packet),
          effectCount: scenePacketEffectCount(packet),
          drawCount: drawables.length,
          uniformDrawCount: uniformDrawables.length,
          sceneInstanceCapacity: GPU_SCENE_INSTANCE_CAPACITY,
          sceneInstanceCount: drawables.length,
          drawables,
          features: scenePacketFeatureVector(packet),
          atomUniforms: scenePacketAtomUniformVector(packet),
          sceneMix: scenePacketSceneMixVector(packet, sceneKind),
          visualIrLayers: visualIrLayerVector(packet),
          palette: scenePacketPaletteVector(packet),
          sceneObjectUniforms,
          sceneInstanceData,
          sceneInstanceSummary: scenePacketIdentitySummaryForDrawables(drawables),
          sceneObjectUniformSummary: sceneObjectUniformSummaryForDrawables(sceneObjectUniforms, uniformDrawables),
          sceneObjectIdentitySummary: scenePacketIdentitySummaryForDrawables(uniformDrawables),
          spatialHash,
          summary,
          metrics: metricsForScenePacket(packet),
          seed: seedForScenePacket(packet, spatialHash, summary),
        };
      }

    function scenePacketPaletteVector(packet) {
        const palette = packet && packet.uniforms && Array.isArray(packet.uniforms.palette)
          ? packet.uniforms.palette
          : [];
        return palette.slice(0, 16).map((value) => {
          const numeric = Number(value || 0);
          return Number.isFinite(numeric) ? clamp01(numeric) : 0;
        });
      }

    function sceneRenderPacketRenderDataKey(packet, sceneKind = '') {
        return [
          sceneKind || '',
          scenePacketEntityCount(packet),
          scenePacketFieldCount(packet),
          scenePacketEffectCount(packet),
          scenePacketSpatialHash(packet),
        ].join(':');
      }

    function scenePacketSceneId(packet, sceneKind = '') {
        const value = Number(packet && packet.uniforms && packet.uniforms.sceneId);
        if (Number.isFinite(value)) return value;
        return SCENE_IDS[sceneKind] ?? 3;
      }

    function scenePacketFeatureVector(_packet) {
        return new Float32Array(48);
      }

    function scenePacketAtomUniformVector(packet) {
        return scenePacketUniformVector(packet, 'atomUniforms', 24);
      }

    function scenePacketSceneMixVector(packet, sceneKind = '') {
        const vector = scenePacketUniformVector(packet, 'sceneMix', SCENE_MIX_SLOTS.length);
        if (activeSceneMixSlots(vector)) return compressSceneMixVector(vector);
        addSceneKindMix(vector, sceneKind, 0.52);
        for (const row of scenePacketDrawableRows(packet)) {
          addScenePacketLayerMix(vector, row.layerSlot, row.renderCodes && row.renderCodes.categoryCode || 0);
        }
        return compressSceneMixVector(vector);
      }

    function scenePacketUniformVector(packet, key, length) {
        const values = packet && packet.uniforms && Array.isArray(packet.uniforms[key])
          ? packet.uniforms[key]
          : [];
        const vector = new Float32Array(length);
        for (let i = 0; i < Math.min(length, values.length); i += 1) {
          vector[i] = clamp01(values[i]);
        }
        return vector;
      }

    function scenePacketDrawableRows(packet) {
        return [
          ...scenePacketRows(packet, 'entities').map((row) => ({ ...row, packetKind: 'entity' })),
          ...scenePacketRows(packet, 'fields').map((row) => ({ ...row, packetKind: 'field' })),
          ...scenePacketRows(packet, 'effects').map((row) => ({ ...row, packetKind: 'effect' })),
        ];
      }

    function addScenePacketLayerMix(vector, layerSlot = '', categoryCode = 0) {
        const add = (slot, value) => addSceneMixSlot(vector, slot, value);
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

    function scenePacketEntityCount(packet) {
        return packet && Array.isArray(packet.entities) ? packet.entities.length : 0;
      }

    function scenePacketFieldCount(packet) {
        return packet && Array.isArray(packet.fields) ? packet.fields.length : 0;
      }

    function scenePacketEffectCount(packet) {
        return packet && Array.isArray(packet.effects) ? packet.effects.length : 0;
      }

    function sceneRenderPacketSummary(packet) {
        if (!packet) return 'none';
        const layerSlots = scenePacketLayerList(packet).slice(0, 8).join('+');
        const passes = Array.isArray(packet.passes) ? packet.passes.join('+') : '';
        return [
          packet.schema,
          `entities:${scenePacketEntityCount(packet)}`,
          `fields:${scenePacketFieldCount(packet)}`,
          `effects:${scenePacketEffectCount(packet)}`,
          layerSlots ? `layers:${layerSlots}` : '',
          passes ? `passes:${passes}` : '',
        ].filter(Boolean).join(';');
      }

    function scenePacketLayerList(packet) {
        return Array.from(new Set([
          ...scenePacketRows(packet, 'entities').map((row) => row.layerSlot),
          ...scenePacketRows(packet, 'fields').map((row) => row.layerSlot),
          ...scenePacketRows(packet, 'effects').map((row) => row.layerSlot),
        ].filter(Boolean)));
      }

    function scenePacketRows(packet, key) {
        return packet && Array.isArray(packet[key]) ? packet[key] : [];
      }

    function scenePacketSpatialHash(packet) {
        if (!packet) return 'none';
        const text = [
          packet.sceneKind,
          ...scenePacketRows(packet, 'entities').map((row) => scenePacketRowHashText(row)),
          ...scenePacketRows(packet, 'fields').map((row) => scenePacketRowHashText(row)),
          ...scenePacketRows(packet, 'effects').map((row) => scenePacketRowHashText(row)),
        ].join('|');
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
      }

    function scenePacketRowHashText(row = {}) {
        const transform = row.transform || {};
        const position = Array.isArray(transform.position) ? transform.position : [];
        const scale = Array.isArray(transform.scale) ? transform.scale : [];
        const domain = row.domain || {};
        const bounds = Array.isArray(domain.bounds) ? domain.bounds : row.geometry && row.geometry.bounds || [];
        const identity = row.identity || {};
        return [
          row.id,
          row.layerSlot,
          identity.type,
          identity.category,
          row.sourceGraphId,
          position.map((value) => Number(value || 0).toFixed(3)).join(','),
          scale.map((value) => Number(value || 0).toFixed(3)).join(','),
          bounds.map((value) => Number(value || 0).toFixed(3)).join(','),
          row.animation && row.animation.kind,
        ].filter(Boolean).join(':');
      }

    function scenePacketObjectUniformVector(packet, sceneKind = '') {
        const drawables = scenePacketUniformDrawables(packet, sceneKind).slice(0, SCENE_PACKET_OBJECT_SLOTS);
        return scenePacketObjectUniformVectorFromDrawables(drawables);
      }

    function scenePacketObjectUniformVectorFromDrawables(drawables = []) {
        const vector = new Float32Array(SCENE_PACKET_FLOATS);
        drawables.forEach((row, index) => {
          const transform = scenePacketDrawableTransform(row, index, drawables.length);
          const codes = row.renderCodes || {};
          const layerCode = Number(codes.layerCode || scenePacketLayerCode(row.layerSlot));
          const animationCode = Number(codes.animationCode || scenePacketAnimationCode(row.animation && row.animation.kind));
          const identityCode = Number(codes.semanticCode || 0);
          const categoryCode = Number(codes.categoryCode || scenePacketCategoryCode(row));
          const packetKindCode = Number(codes.packetKindCode || scenePacketKindCode(row.packetKind));
          const objectOffset = index * 4;
          const styleOffset = SCENE_PACKET_OBJECT_SLOTS * 4 + index * 4;
          const identityOffset = SCENE_PACKET_OBJECT_SLOTS * 8 + index * 4;
          vector[objectOffset] = transform.x;
          vector[objectOffset + 1] = transform.y;
          vector[objectOffset + 2] = transform.w;
          vector[objectOffset + 3] = transform.h;
          vector[styleOffset] = layerCode;
          vector[styleOffset + 1] = transform.rotation;
          vector[styleOffset + 2] = animationCode;
          vector[styleOffset + 3] = clamp01(row.confidence || row.material && row.material.opacity || 0.72);
          vector[identityOffset] = identityCode;
          vector[identityOffset + 1] = categoryCode;
          vector[identityOffset + 2] = Number(codes.variantCode ?? scenePacketVariantCode(row));
          vector[identityOffset + 3] = packetKindCode;
        });
        return vector;
      }

    function scenePacketInstanceStorageVectorFromDrawables(drawables = []) {
        const vector = new Float32Array(GPU_SCENE_INSTANCE_CAPACITY * GPU_SCENE_INSTANCE_FLOATS);
        drawables.slice(0, GPU_SCENE_INSTANCE_CAPACITY).forEach((row, index) => {
          const transform = scenePacketDrawableTransform(row, index, drawables.length);
          const codes = row.renderCodes || {};
          const layerCode = Number(codes.layerCode || scenePacketLayerCode(row.layerSlot));
          const animationCode = Number(codes.animationCode || scenePacketAnimationCode(row.animation && row.animation.kind));
          const identityCode = Number(codes.semanticCode || 0);
          const categoryCode = Number(codes.categoryCode || scenePacketCategoryCode(row));
          const packetKindCode = Number(codes.packetKindCode || scenePacketKindCode(row.packetKind));
          const offset = index * GPU_SCENE_INSTANCE_FLOATS;
          vector[offset] = transform.x;
          vector[offset + 1] = transform.y;
          vector[offset + 2] = transform.w;
          vector[offset + 3] = transform.h;
          vector[offset + 4] = layerCode;
          vector[offset + 5] = transform.rotation;
          vector[offset + 6] = animationCode;
          vector[offset + 7] = clamp01(row.confidence || row.material && row.material.opacity || 0.72);
          vector[offset + 8] = identityCode;
          vector[offset + 9] = categoryCode;
          vector[offset + 10] = Number(codes.variantCode ?? scenePacketVariantCode(row));
          vector[offset + 11] = packetKindCode;
        });
        return vector;
      }

    function scenePacketUniformDrawables(packet, sceneKind = '') {
        if (!packet) return [];
        const rows = scenePacketDrawableRows(packet)
          .filter((row) => row && row.layerSlot && (row.renderCodes && row.renderCodes.layerCode || scenePacketLayerCode(row.layerSlot)) > 0);
        rows.sort((a, b) => scenePacketDrawablePriority(b, sceneKind) - scenePacketDrawablePriority(a, sceneKind) ||
          Number(a.drawOrder || 0) - Number(b.drawOrder || 0) ||
          String(a.id || '').localeCompare(String(b.id || '')));
        return rows;
      }

    function scenePacketDrawablePriority(row, sceneKind = '') {
        const explicit = Number(row && row.renderPriority);
        if (Number.isFinite(explicit)) return explicit;
        const layerCode = Number(row && row.renderCodes && row.renderCodes.layerCode || scenePacketLayerCode(row && row.layerSlot));
        const kindCode = Number(row && row.renderCodes && row.renderCodes.packetKindCode || scenePacketKindCode(row && row.packetKind));
        return kindCode * 4 + layerCode * 0.1 + clamp01(row && row.confidence || 0);
      }

    function scenePacketDrawableTransform(row, index = 0, total = 1) {
        const transform = row && row.transform || {};
        const position = Array.isArray(transform.position) ? transform.position : null;
        const scale = Array.isArray(transform.scale) ? transform.scale : null;
        const rotation = Array.isArray(transform.rotation) ? Number(transform.rotation[2] || 0) : 0;
        if (position && scale) {
          return {
            x: clamp01(position[0]),
            y: clamp01(position[1]),
            w: scenePacketSize(scale[0], 0.12),
            h: scenePacketSize(scale[1], 0.1),
            rotation,
          };
        }
        const domain = row && row.domain || {};
        if (Array.isArray(domain.bounds)) {
          return {
            x: clamp01(domain.bounds[0] + domain.bounds[2] * 0.5),
            y: clamp01(domain.bounds[1] + domain.bounds[3] * 0.5),
            w: scenePacketSize(domain.bounds[2], 0.42),
            h: scenePacketSize(domain.bounds[3], 0.32),
            rotation: 0,
          };
        }
        if (Array.isArray(row && row.geometry && row.geometry.bounds)) {
          const bounds = row.geometry.bounds;
          return {
            x: clamp01(bounds[0] + bounds[2] * 0.5),
            y: clamp01(bounds[1] + bounds[3] * 0.5),
            w: scenePacketSize(bounds[2], 0.12),
            h: scenePacketSize(bounds[3], 0.1),
            rotation,
          };
        }
        const angle = total <= 1 ? 0 : index / Math.max(1, total) * Math.PI * 2;
        return {
          x: clamp01(0.5 + Math.cos(angle) * 0.24),
          y: clamp01(0.52 + Math.sin(angle) * 0.18),
          w: 0.13,
          h: 0.1,
          rotation: 0,
        };
      }

    function scenePacketSize(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return clamp(numeric, 0.01, 1);
      }

    function scenePacketLayerCode(layerSlot) {
        const index = VISUAL_IR_LAYER_SLOTS.indexOf(String(layerSlot || ''));
        return index >= 0 ? index + 1 : 0;
      }

    function scenePacketAnimationCode(kind) {
        const value = String(kind || '').toLowerCase();
        if (/swim/.test(value)) return 1;
        if (/flow|ripple/.test(value)) return 2;
        if (/track|particle/.test(value)) return 3;
        if (/readout|measurement/.test(value)) return 4;
        if (/packet|network|route/.test(value)) return 5;
        if (/fermentation|bubble|rise/.test(value)) return 6;
        if (/plume|thermal|fire/.test(value)) return 7;
        if (/orbit|drift/.test(value)) return 8;
        return value ? 9 + Math.floor(scenePacketHashUnit(value) * 56) : 0.5;
      }

    function scenePacketHashUnit(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
          hash ^= text.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967295;
      }

    function scenePacketSemanticCode(row = {}) {
        return Number(row.renderCodes && row.renderCodes.semanticCode || 0);
      }

    function scenePacketCategoryCode(row = {}) {
        if (row.renderCodes && Number.isFinite(Number(row.renderCodes.categoryCode))) {
          return Number(row.renderCodes.categoryCode);
        }
        return row.packetKind === 'entity' ? 10 : row.packetKind === 'field' ? 3 : row.packetKind === 'effect' ? 8 : 0;
      }

    function scenePacketKindCode(kind) {
        if (kind === 'entity') return 1;
        if (kind === 'field') return 2;
        if (kind === 'effect') return 3;
        return 0;
      }

    Object.assign(scope, {
      pixelSampleForDrawable,
      phase7DrawableSamplePoint,
      phase7OutputEnvelope,
      emptySceneRenderPacket,
      compileSceneRenderData,
      sceneRenderPacketRenderDataKey,
      scenePacketSceneId,
      scenePacketFeatureVector,
      scenePacketAtomUniformVector,
      scenePacketSceneMixVector,
      scenePacketUniformVector,
      scenePacketDrawableRows,
      addScenePacketLayerMix,
      scenePacketEntityCount,
      scenePacketFieldCount,
      scenePacketEffectCount,
      sceneRenderPacketSummary,
      scenePacketLayerList,
      scenePacketRows,
      scenePacketSpatialHash,
      scenePacketRowHashText,
      scenePacketObjectUniformVector,
      scenePacketObjectUniformVectorFromDrawables,
      scenePacketInstanceStorageVectorFromDrawables,
      scenePacketUniformDrawables,
      scenePacketDrawablePriority,
      scenePacketDrawableTransform,
      scenePacketSize,
      scenePacketLayerCode,
      scenePacketAnimationCode,
      scenePacketSemanticCode,
      scenePacketCategoryCode,
      scenePacketKindCode,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
