(function attachSimulatteWebGpuRendererpackets(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

    const OBJECT_PART_DEPTH_BIAS = Object.freeze({ field: 0.006, appendage: 0.003, support: 0.003, core: 0, head: -0.001, panel: -0.001, path: -0.001, opening: -0.002, joint: -0.002, detail: -0.003, sensor: -0.004 });
    function pixelSampleForDrawable(row = {}, obligation = {}, width = 0, height = 0, index = 0, total = 1) {
        const point = phase7DrawableSamplePoint(row, index, total, obligation);
        if (!point) return null;
        const x = scope.clampInt(Math.round(point.x * (width - 1)), 0, Math.max(0, width - 1));
        const y = scope.clampInt(Math.round(point.y * (height - 1)), 0, Math.max(0, height - 1));
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
          constraintKind: obligation.constraintKind || '',
          expectedValue: obligation.expectedValue || '',
        };
      }

    function phase7DrawableSamplePoint(row = {}, index = 0, total = 1, obligation = {}) {
        const program = row.geometry && row.geometry.program || null;
        if (program && Array.isArray(program.parts) && program.parts.length) {
          const target = String(obligation.targetIdentity || obligation.target || '').toLowerCase();
          const targeted = program.parts.filter((part) => target && String(part.id || '').toLowerCase().includes(target));
          const part = (targeted.length ? targeted : program.parts).slice().sort((a, b) => (
            Number(b.size && b.size[0] || 0) * Number(b.size && b.size[1] || 0) -
            Number(a.size && a.size[0] || 0) * Number(a.size && a.size[1] || 0)
          ))[0];
          const transform = row.transform || {};
          const position = Array.isArray(transform.position) ? transform.position : [0.5, 0.5];
          const scale = Array.isArray(transform.scale) ? transform.scale : [0.16, 0.14];
          const center = Array.isArray(part.center) ? part.center : [0, 0];
          const rotation = Number(transform.rotation && transform.rotation[2] || 0);
          const dx = Number(center[0] || 0) * Number(scale[0] || 0.16);
          const dy = Number(center[1] || 0) * Number(scale[1] || 0.14);
          return {
            x: scope.clamp01(Number(position[0] || 0.5) + dx * Math.cos(rotation) - dy * Math.sin(rotation)),
            y: scope.clamp01(Number(position[1] || 0.5) + dx * Math.sin(rotation) + dy * Math.cos(rotation)),
          };
        }
        const domain = row.domain || {};
        if (Array.isArray(domain.center) && domain.center.length >= 2) {
          return { x: scope.clamp01(domain.center[0]), y: scope.clamp01(domain.center[1]) };
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
            x: scope.clamp01(domain.bounds[0] + domain.bounds[2] * offset[0]),
            y: scope.clamp01(domain.bounds[1] + domain.bounds[3] * offset[1]),
          };
        }
        const transform = scenePacketDrawableTransform(row, index, total);
        return { x: scope.clamp01(transform.x), y: scope.clamp01(transform.y) };
      }

    function pixelSampleForEnvironmentObligation(obligation = {}, width = 0, height = 0) {
        const obligationId = obligation.obligationId || obligation.id || '';
        return {
          schema: 'simulatte.phase7PixelSample.v1',
          id: `gpu:${obligationId}:background`,
          source: 'webgpu-texture-copy-readback',
          obligationId,
          label: obligation.target || 'environment',
          drawableId: 'background',
          layerSlot: 'background',
          x: scope.clampInt(Math.round(width * 0.82), 0, Math.max(0, width - 1)),
          y: scope.clampInt(Math.round(height * 0.18), 0, Math.max(0, height - 1)),
          uv: [0.82, 0.18],
          backgroundRgba: [250, 250, 255, 255],
          constraintKind: obligation.constraintKind || '',
          expectedValue: obligation.expectedValue || '',
        };
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
          const visualObligationProof = scope.renderObligationProof(
            sceneRenderPacket,
            renderExecutionInput && renderExecutionInput.visualObligations || [],
            compositionLedger,
            true,
            renderData
          );
          const visualObligationProofSummary = scope.summarizeRenderObligationProof(visualObligationProof);
          const pixelAudit = scope.renderPixelAudit(sceneRenderPacket, renderData, canvas, visualObligationProofSummary, optimization);
          const interactionReceipt = scope.phase7InteractionReceipt(
            renderExecutionInput,
            renderData,
            sceneRenderPacket
          );
          const simulationReceipt = renderExecutionInput && renderExecutionInput.simulationState &&
            renderExecutionInput.simulationState.solverState &&
            renderExecutionInput.simulationState.solverState.executionReceipt || null;
          return {
            schema: scope.PHASE7_OUTPUT_SCHEMA,
          phase: 7,
          inputSchema: renderExecutionInput && renderExecutionInput.inputSchema || 'simulatte.phase6.output.v2',
            runtimeReceiptId: renderExecutionInput && renderExecutionInput.runtimeReceiptId || 'runtime:unknown',
            artifact: {
              renderExecution: {
                schema: scope.RENDER_EXECUTION_SCHEMA,
                worldProofBinding: renderExecutionInput && renderExecutionInput.worldProofBinding || null,
                replayBaseline: renderExecutionInput && renderExecutionInput.replayBaseline || null,
                intentReceipt: renderExecutionInput && renderExecutionInput.intentReceipt || null,
                semanticReceipt: renderExecutionInput && renderExecutionInput.semanticReceipt || null,
                compilerDeterminismReceipt: renderExecutionInput &&
                  renderExecutionInput.compilerDeterminismReceipt || null,
                simulationReproducibilityReceipt: renderExecutionInput &&
                  renderExecutionInput.simulationReproducibilityReceipt || null,
                safetyReceipt: renderExecutionInput && renderExecutionInput.safetyReceipt || null,
                renderExecutionInputSchema: renderExecutionInput && renderExecutionInput.schema || '',
                sceneRenderPacketSchema: sceneRenderPacket && sceneRenderPacket.schema || '',
                renderDataSchema: renderData && renderData.schema || '',
                renderDataKey: renderData && renderData.packetKey || '',
                renderPath: renderData && renderData.path || '',
              drawCount: renderData && renderData.drawCount || 0,
              drawSlots: scope.SCENE_PACKET_OBJECT_SLOTS,
              sceneInstanceCapacity: scope.GPU_OBJECT_PART_CAPACITY,
              sceneInstanceCount: renderData && renderData.objectPartCount || 0,
                  optimization,
                  rendered: true,
            packetIdentitySummary: scope.scenePacketIdentitySummary(sceneRenderPacket),
            environmentProgram: sceneRenderPacket && sceneRenderPacket.environmentProgram || null,
              atmosphereProgram: renderData && renderData.atmosphereProgram || null,
              objectRealization: renderData && renderData.objectRealization ||
                scope.objectRealizationForScenePacket(sceneRenderPacket),
              rendererConsumption: renderData && renderData.rendererConsumption || null,
              interactionReceipt,
              simulationReceipt,
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
              indirectDraw: optimization && optimization.indirectDraw || 'not-used-direct-instancing',
                  visualObligationProofs: visualObligationProofSummary.proofCount,
                  failedObligations: visualObligationProofSummary.failCount,
                  unprovenObligations: visualObligationProofSummary.notProvenCount,
              pixelAuditStatus: pixelAudit.status,
              cameraConsumed: renderData && renderData.rendererConsumption && renderData.rendererConsumption.cameraConsumed === true,
              lightCountConsumed: renderData && renderData.rendererConsumption && renderData.rendererConsumption.lightCountConsumed || 0,
              materialCountConsumed: renderData && renderData.rendererConsumption && renderData.rendererConsumption.materialCountConsumed || 0,
              depthEnabled: renderData && renderData.rendererConsumption && renderData.rendererConsumption.depthEnabled === true,
              contourProfileCount: renderData && renderData.morphologySubmission &&
                renderData.morphologySubmission.contourProfileCount || 0,
              surfacePatternCount: renderData && renderData.morphologySubmission &&
                renderData.morphologySubmission.surfacePatternCount || 0,
              accentPatternCount: renderData && renderData.morphologySubmission &&
                renderData.morphologySubmission.accentPatternCount || 0,
              atmosphereLayerCount: renderData && renderData.atmosphereProgram &&
                renderData.atmosphereProgram.layerCount || 0,
              interactionStatus: interactionReceipt.status,
              interactionCommandCount: interactionReceipt.commandCount,
              interactionChangedChannelCount: interactionReceipt.changedChannelCount,
              interactionVisualStateConsumed: interactionReceipt.visualStateConsumed,
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
            sceneId: scope.SCENE_IDS[sceneKind] ?? 3,
            atomUniforms: new Array(24).fill(0),
            sceneMix: new Array(scope.SCENE_MIX_SLOTS.length).fill(0),
            visualLayers: new Array(scope.VISUAL_IR_LAYER_SLOTS.length).fill(0),
          },
          passes: ['background'],
          receipts: { source: 'missing-compiled-scene-packet' },
        };
      }

    function compileSceneRenderData(packet, sceneKind = '', packetKey = '') {
        const drawables = scenePacketUniformDrawables(packet, sceneKind);
        const uniformDrawables = drawables.slice(0, scope.SCENE_PACKET_OBJECT_SLOTS);
        const sceneObjectUniforms = scenePacketObjectUniformVectorFromDrawables(uniformDrawables);
        const sourceObjectParts = scenePacketObjectParts(packet, Number.POSITIVE_INFINITY);
        const objectParts = sourceObjectParts.slice(0, scope.GPU_OBJECT_PART_CAPACITY);
        const objectPartData = scenePacketObjectPartStorageVector(objectParts);
        const cameraState = scenePacketCameraState(packet);
        const lightState = scenePacketLightState(packet);
        const objectRealization = scope.scenePacketObjectRealization(packet, objectParts);
        const spatialHash = scenePacketSpatialHash(packet);
        const summary = sceneRenderPacketSummary(packet);
        return {
          schema: scope.RENDER_DATA_SCHEMA,
          path: 'depth-lit-prompt-conditioned-contours-surfaces-and-atmospheres',
          packetKey: packetKey || sceneRenderPacketRenderDataKey(packet, sceneKind),
          sceneKind,
          sceneId: scenePacketResolvedSceneId(packet, sceneKind),
          entityCount: scenePacketEntityCount(packet),
          fieldCount: scenePacketFieldCount(packet),
          effectCount: scenePacketEffectCount(packet),
          drawCount: objectParts.length + 1,
          drawCallCount: objectParts.length ? 2 : 1,
          semanticDrawableCount: drawables.length,
          uniformDrawCount: uniformDrawables.length,
          sceneInstanceCapacity: scope.GPU_OBJECT_PART_CAPACITY,
          sceneInstanceCount: objectParts.length,
          drawables,
          features: scenePacketFeatureVector(packet),
          atomUniforms: scenePacketAtomUniformVector(packet),
          sceneMix: scenePacketSceneMixVector(packet, sceneKind),
          atmosphereProgram: packet && packet.uniforms && packet.uniforms.atmosphere || null,
          visualIrLayers: scope.visualIrLayerVector(packet),
          palette: scenePacketPaletteVector(packet),
          sceneObjectUniforms,
          semanticDrawableSummary: scope.scenePacketIdentitySummaryForDrawables(drawables),
          sceneInstanceSummary: scenePacketObjectPartSummary(objectParts),
          objectParts,
          objectPartData,
          objectPartCount: objectParts.length,
          sourceObjectPartCount: sourceObjectParts.length,
          objectPartTruncated: sourceObjectParts.length !== objectParts.length,
          objectPartFloatStride: scope.GPU_OBJECT_PART_FLOATS,
          objectPartCapacity: scope.GPU_OBJECT_PART_CAPACITY,
          objectPartSummary: scenePacketObjectPartSummary(objectParts),
          morphologySubmission: scope.scenePacketMorphologySummary(objectParts),
          cameraState,
          lightState,
          rendererConsumption: scenePacketRendererConsumption(packet, objectParts, cameraState, lightState),
          objectRealization,
          sceneObjectUniformSummary: scope.sceneObjectUniformSummaryForDrawables(sceneObjectUniforms, uniformDrawables),
          sceneObjectIdentitySummary: scope.scenePacketIdentitySummaryForDrawables(uniformDrawables),
          spatialHash,
          summary,
          metrics: scope.metricsForScenePacket(packet),
          seed: scope.seedForScenePacket(packet, spatialHash, summary),
        };
      }

    function scenePacketObjectParts(packet = {}, capacity = scope.GPU_OBJECT_PART_CAPACITY) {
        const rows = scenePacketRows(packet, 'entities')
          .filter((row) => (
            row &&
            row.geometry &&
            row.geometry.program &&
            row.geometry.program.literal === true
          ))
          .sort((a, b) => (
            Number(a.geometry.program.zOrder || 0) - Number(b.geometry.program.zOrder || 0) ||
            Number(a.drawOrder || 0) - Number(b.drawOrder || 0) ||
            String(a.id || '').localeCompare(String(b.id || ''))
          ));
        const parts = [];
        for (const row of rows) {
          const program = row.geometry.program || {};
          for (const sourcePart of scope.scenePacketConstructionParts(program)) {
            const transformed = scenePacketObjectPartTransform(row, sourcePart);
            const fill = scenePacketObjectPartColor(sourcePart.fill);
            const morphology = scope.scenePacketObjectPartMorphology(sourcePart);
            const materialOpacity = Number(row.material && row.material.opacity || 0.72);
            const literalOpacity = program.literal === true ? Math.max(0.9, materialOpacity) : materialOpacity;
            parts.push({
              schema: 'simulatte.objectRenderPart.v1',
              id: `${row.id}:${sourcePart.id}`,
              entityId: row.id,
              identityType: row.identity && row.identity.type || program.identityType || 'object',
              grammarId: program.grammarId || '',
              constructionRole: sourcePart.constructionRole || '',
              constructionRoleIndex: Number(sourcePart.constructionRoleIndex || 0),
              constructionPartId: sourcePart.constructionPartId || sourcePart.id || '',
              constructionConstraintIds: (sourcePart.constructionConstraintIds || []).slice(),
              primitive: morphology.primitive,
              shapeCode: morphology.shapeCode,
              contourProfile: morphology.contourProfile,
              shapeParameters: morphology.shapeParameters,
              surfacePattern: morphology.surfacePattern,
              surfaceCode: morphology.surfaceCode,
              surfaceParameters: morphology.surfaceParameters,
              accentPattern: morphology.accentPattern,
              accentCode: morphology.accentCode,
              accentParameters: morphology.accentParameters,
              visualFeatureClass: morphology.visualFeatureClass,
              center: transformed.center,
              size: transformed.size,
              rotation: transformed.rotation,
              fill,
              opacity: scope.clamp01(Number(sourcePart.opacity == null ? 1 : sourcePart.opacity) * literalOpacity),
              semanticCode: scenePacketSemanticCode(row),
              animationCode: scenePacketAnimationCode(row.animation && row.animation.kind),
              animationSpeed: Math.max(0, Number(row.animation && row.animation.speed || 0)),
              animationAmplitude: Math.max(0, Number(row.animation && row.animation.amplitude || 0)),
              animationPhase: scope.clamp01(Number(row.animation && row.animation.phase || 0)),
              variantCode: Number(row.renderCodes && row.renderCodes.variantCode || scope.scenePacketVariantCode(row)),
              zOrder: Number(program.zOrder || 0) + Number(sourcePart.order || 0) * 0.001,
              depth: scenePacketObjectDepth(row, program, sourcePart),
              roughness: scope.clamp01(Number(sourcePart.roughness != null ? sourcePart.roughness :
                row.material && row.material.roughness != null ? row.material.roughness : 0.56)),
              metallic: scope.clamp01(Number(sourcePart.metallic != null ? sourcePart.metallic :
                row.material && row.material.metallic || 0)),
              emissive: scope.clamp01(Number(sourcePart.emissive != null ? sourcePart.emissive :
                row.material && row.material.emissiveStrength || (row.material && row.material.emissive === true ? 0.42 : 0))),
              literal: program.literal === true,
            });
            if (parts.length >= capacity) return parts;
          }
        }
        return parts;
      }

    function scenePacketObjectDepth(row = {}, program = {}, part = {}) {
        const position = row.transform && Array.isArray(row.transform.position) ? row.transform.position : [];
        const partDepthPosition = Number(part.interactionDepthPosition);
        const explicit = Number.isFinite(partDepthPosition) ? partDepthPosition : Number(position[2]);
        const roleBias = Number(OBJECT_PART_DEPTH_BIAS[String(part.constructionRole || '')] || 0);
        if (Number.isFinite(explicit) && Math.abs(explicit) > 0.0001) {
          return scope.clamp(explicit * 0.25 + 0.5 + roleBias, 0.04, 0.94);
        }
        const zOrder = Number(program.zOrder || 0) + Number(part.order || 0) * 0.001;
        return scope.clamp(0.84 - scope.clamp(zOrder / 64, 0, 1) * 0.66 + roleBias, 0.04, 0.94);
      }

    function scenePacketObjectPartTransform(row = {}, part = {}) {
        const transform = row.transform || {};
        const position = Array.isArray(transform.position) ? transform.position : [0.5, 0.5, 0];
        const scale = Array.isArray(transform.scale) ? transform.scale : [0.16, 0.14, 1];
        const parentRotation = Number(transform.rotation && transform.rotation[2] || 0);
        const localCenter = Array.isArray(part.center) ? part.center : [0, 0];
        const localSize = Array.isArray(part.size) ? part.size : [0.8, 0.7];
        const dx = Number(localCenter[0] || 0) * Number(scale[0] || 0.16);
        const dy = Number(localCenter[1] || 0) * Number(scale[1] || 0.14);
        const cosine = Math.cos(parentRotation);
        const sine = Math.sin(parentRotation);
        const localRotation = Number(part.rotation || 0);
        const localCosine = Math.cos(localRotation);
        const localSine = Math.sin(localRotation);
        const scaleX = Number(scale[0] || 0.16);
        const scaleY = Number(scale[1] || 0.14);
        return {
          center: [
            scope.clamp01(Number(position[0] || 0.5) + dx * cosine - dy * sine),
            scope.clamp01(Number(position[1] || 0.5) + dx * sine + dy * cosine),
          ],
          size: [
            Math.max(0.004, Number(localSize[0] || 0.8) * Math.hypot(localCosine * scaleX, localSine * scaleY)),
            Math.max(0.004, Number(localSize[1] || 0.7) * Math.hypot(localSine * scaleX, localCosine * scaleY)),
          ],
          rotation: parentRotation + Math.atan2(localSine * scaleY, localCosine * scaleX),
        };
      }

    function scenePacketObjectPartColor(value = '') {
        const normalized = String(value || '#7b8794').replace('#', '');
        const hex = normalized.length === 3
          ? normalized.split('').map((token) => `${token}${token}`).join('')
          : normalized.padEnd(6, '0').slice(0, 6);
        const parsed = Number.parseInt(hex, 16);
        if (!Number.isFinite(parsed)) return [0.48, 0.53, 0.58, 1];
        return [
          ((parsed >> 16) & 255) / 255,
          ((parsed >> 8) & 255) / 255,
          (parsed & 255) / 255,
          1,
        ];
      }

    function scenePacketObjectPartStorageVector(parts = []) {
        const vector = new Float32Array(scope.GPU_OBJECT_PART_CAPACITY * scope.GPU_OBJECT_PART_FLOATS);
        parts.slice(0, scope.GPU_OBJECT_PART_CAPACITY).forEach((row, index) => {
          const offset = index * scope.GPU_OBJECT_PART_FLOATS;
          vector[offset] = Number(row.center && row.center[0] || 0.5);
          vector[offset + 1] = Number(row.center && row.center[1] || 0.5);
          vector[offset + 2] = Number(row.size && row.size[0] || 0.1);
          vector[offset + 3] = Number(row.size && row.size[1] || 0.1);
          vector[offset + 4] = Number(row.rotation || 0);
          vector[offset + 5] = Number(row.shapeCode || 0);
          vector[offset + 6] = Number(row.opacity || 0);
          vector[offset + 7] = Number(row.animationCode || 0);
          vector[offset + 8] = Number(row.fill && row.fill[0] || 0);
          vector[offset + 9] = Number(row.fill && row.fill[1] || 0);
          vector[offset + 10] = Number(row.fill && row.fill[2] || 0);
          vector[offset + 11] = Number(row.fill && row.fill[3] || 1);
          vector[offset + 12] = Number(row.semanticCode || 0);
          vector[offset + 13] = Number(row.variantCode || 0);
          vector[offset + 14] = Number(row.zOrder || 0);
          vector[offset + 15] = row.literal === true ? 1 : 0;
          vector[offset + 16] = Number(row.roughness || 0);
          vector[offset + 17] = Number(row.metallic || 0);
          vector[offset + 18] = Number(row.emissive || 0);
          vector[offset + 19] = Number(row.depth || 0.5);
          vector[offset + 20] = Number(row.animationSpeed || 0);
          vector[offset + 21] = Number(row.animationAmplitude || 0);
          vector[offset + 22] = Number(row.animationPhase || 0);
          vector[offset + 23] = 0;
          scope.writeObjectPartMorphology(vector, offset, row);
        });
        return vector;
      }

    function scenePacketCameraState(packet = {}) {
        const camera = packet.camera || {};
        const text = [camera.mode, camera.depth, camera.framing, camera.scale,
          camera.scaleTier, camera.archetype, packet.cameraArchetype].filter(Boolean).join(' ').toLowerCase();
        const perspective = /orbital|perspective|three-quarter|depth/.test(text) ? 0.34 :
          /cutaway|layered/.test(text) ? 0.24 : 0.08;
        const zoom = /macro|micro|detail/.test(text) ? 1.16 : /wide|map|landscape|orbital/.test(text) ? 0.9 : 1;
        const tilt = /ground|three-quarter|cutaway/.test(text) ? 0.16 : 0;
        return {
          schema: 'simulatte.phase7CameraState.v1',
          mode: camera.mode || '',
          archetype: camera.archetype || packet.cameraArchetype || '',
          perspective,
          zoom,
          tilt,
          focalDepth: 0.5,
          consumed: Object.keys(camera).length > 1,
        };
      }

    function scenePacketLightState(packet = {}) {
        const lights = Array.isArray(packet.lights) ? packet.lights : [];
        const key = lights.find((light) => light.kind === 'directional') || {};
        const ambient = lights.find((light) => light.kind === 'ambient') || {};
        const direction = Array.isArray(key.direction) ? key.direction.slice(0, 3) : [-0.36, -0.58, 0.72];
        const keyColor = Array.isArray(key.color) ? key.color.slice(0, 3) : [0.96, 0.96, 0.9];
        const ambientColor = Array.isArray(ambient.color) ? ambient.color.slice(0, 3) : [0.28, 0.36, 0.44];
        return {
          schema: 'simulatte.phase7LightState.v1',
          direction,
          keyColor,
          keyIntensity: scope.clamp01(Number(key.intensity || 0.86)),
          ambientColor,
          ambientIntensity: scope.clamp01(Number(ambient.intensity || 0.34)),
          sourceLightCount: lights.length,
          consumed: lights.length > 0,
        };
      }

    function scenePacketCameraLightUniformVector(cameraState = {}, lightState = {}, timeSeconds = 0, width = 0, height = 0) {
        const vector = new Float32Array(scope.GPU_OBJECT_UNIFORM_FLOATS);
        vector.set([width, height, timeSeconds, 0], 0);
        vector.set([
          Number(cameraState.perspective || 0), Number(cameraState.zoom || 1),
          Number(cameraState.tilt || 0), Number(cameraState.focalDepth || 0.5),
        ], 4);
        vector.set([
          Number(lightState.direction && lightState.direction[0] || -0.36),
          Number(lightState.direction && lightState.direction[1] || -0.58),
          Number(lightState.direction && lightState.direction[2] || 0.72),
          Number(lightState.keyIntensity || 0.86),
        ], 8);
        vector.set([
          Number(lightState.keyColor && lightState.keyColor[0] || 0.96),
          Number(lightState.keyColor && lightState.keyColor[1] || 0.96),
          Number(lightState.keyColor && lightState.keyColor[2] || 0.9),
          1,
        ], 12);
        vector.set([
          Number(lightState.ambientColor && lightState.ambientColor[0] || 0.28),
          Number(lightState.ambientColor && lightState.ambientColor[1] || 0.36),
          Number(lightState.ambientColor && lightState.ambientColor[2] || 0.44),
          Number(lightState.ambientIntensity || 0.34),
        ], 16);
        return vector;
      }

    function scenePacketRendererConsumption(packet = {}, objectParts = [], cameraState = {}, lightState = {}) {
        const materialCount = scenePacketRows(packet, 'entities').filter((row) => row.material).length;
        const atmosphere = packet && packet.uniforms && packet.uniforms.atmosphere || null;
        const constructionPrograms = scenePacketRows(packet, 'entities').filter((row) => (
          row.geometry && row.geometry.program && row.geometry.program.constructionReceipt
        ));
        return {
          schema: 'simulatte.phase7RendererConsumption.v1',
          cameraConfigured: cameraState.consumed === true,
          sourceLightCount: lightState.consumed === true ? Number(lightState.sourceLightCount || 0) : 0,
          sourceMaterialCount: materialCount,
          cameraConsumed: false,
          lightCountConsumed: 0,
          materialCountConsumed: 0,
          objectPartCount: objectParts.length,
          sourceObjectPartCount: objectParts.length,
          objectSubmissionConfigured: true,
          objectSubmissionConsumed: false,
          semanticCodesConsumed: false,
          morphologySubmission: scope.scenePacketMorphologySummary(objectParts),
          atmosphereConfigured: atmosphere &&
            atmosphere.schema === 'simulatte.sceneAtmosphereProgram.v1',
          atmosphereLayerCount: Number(atmosphere && atmosphere.layerCount || 0),
          atmosphereConsumed: false,
          depthConfigured: true,
          depthEnabled: false,
          normalShading: false,
          perspectiveEnabled: Number(cameraState.perspective || 0) > 0,
          interactionHitTestingConfigured: packet && packet.interactionProgram &&
            packet.interactionProgram.schema === 'simulatte.sceneInteractionProgram.v1',
          interactionHitTestingConsumed: false,
          interactionTargetCount: Number(
            packet && packet.interactionProgram && packet.interactionProgram.targetCount || 0
          ),
          interactionVisualStateConsumed: false,
          constructionProgramCount: constructionPrograms.length,
          modelEvaluatedConstructionCount: constructionPrograms.filter((row) => (
            row.geometry.program.constructionReceipt && row.geometry.program.constructionReceipt.modelEvaluated === true
          )).length,
        };
      }

    function scenePacketObjectPartSummary(parts = []) {
        const identities = new Set(parts.map((row) => row.identityType).filter(Boolean));
        const grammars = new Set(parts.map((row) => row.grammarId).filter(Boolean));
        return `parts:${parts.length};identities:${Array.from(identities).join('+')};grammars:${Array.from(grammars).join('+')}`;
      }

    function scenePacketPaletteVector(packet) {
        const palette = packet && packet.uniforms && Array.isArray(packet.uniforms.palette)
          ? packet.uniforms.palette
          : [];
        return palette.slice(0, 16).map((value) => {
          const numeric = Number(value || 0);
          return Number.isFinite(numeric) ? scope.clamp01(numeric) : 0;
        });
      }

    function sceneRenderPacketRenderDataKey(packet, sceneKind = '') {
        return [
          sceneKind || '',
          scenePacketEntityCount(packet),
          scenePacketFieldCount(packet),
          scenePacketEffectCount(packet),
          scenePacketSpatialHash(packet),
          scenePacketRenderDataHash(packet),
        ].join(':');
      }

    function scenePacketRenderDataHash(packet) {
        return scope.scenePacketRenderEvidenceHash(packet || {});
      }

    function stableRenderDataValue(value) {
        return scope.stableRenderEvidenceValue(value);
      }

    function scenePacketResolvedSceneId(packet, sceneKind = '') {
        const value = Number(packet && packet.uniforms && packet.uniforms.sceneId);
        if (Number.isFinite(value)) return value;
        return scope.SCENE_IDS[sceneKind] ?? 3;
      }

    function scenePacketFeatureVector(_packet) {
        return new Float32Array(48);
      }

    function scenePacketAtomUniformVector(packet) {
        return scenePacketUniformVector(packet, 'atomUniforms', 24);
      }

    function scenePacketSceneMixVector(packet, sceneKind = '') {
        const vector = scenePacketUniformVector(packet, 'sceneMix', scope.SCENE_MIX_SLOTS.length);
        if (scope.activeSceneMixSlots(vector)) return scope.compressSceneMixVector(vector);
        scope.addSceneKindMix(vector, sceneKind, 0.52);
        for (const row of scenePacketDrawableRows(packet)) {
          scope.addScenePacketLayerMix(vector, row.layerSlot, row.renderCodes && row.renderCodes.categoryCode || 0);
        }
        return scope.compressSceneMixVector(vector);
      }

    function scenePacketUniformVector(packet, key, length) {
        const values = packet && packet.uniforms && Array.isArray(packet.uniforms[key])
          ? packet.uniforms[key]
          : [];
        const vector = new Float32Array(length);
        for (let i = 0; i < Math.min(length, values.length); i += 1) {
          vector[i] = scope.clamp01(values[i]);
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
        return scope.fnv1a32(text).toString(16).padStart(8, '0');
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
          row.geometry && row.geometry.program && row.geometry.program.grammarId,
          position.map((value) => Number(value || 0).toFixed(3)).join(','),
          scale.map((value) => Number(value || 0).toFixed(3)).join(','),
          bounds.map((value) => Number(value || 0).toFixed(3)).join(','),
          row.animation && row.animation.kind,
        ].filter(Boolean).join(':');
      }

    function scenePacketObjectUniformVector(packet, sceneKind = '') {
        const drawables = scenePacketUniformDrawables(packet, sceneKind).slice(0, scope.SCENE_PACKET_OBJECT_SLOTS);
        return scenePacketObjectUniformVectorFromDrawables(drawables);
      }

    function scenePacketObjectUniformVectorFromDrawables(drawables = []) {
        const vector = new Float32Array(scope.SCENE_PACKET_FLOATS);
        drawables.forEach((row, index) => {
          const transform = scenePacketDrawableTransform(row, index, drawables.length);
          const codes = row.renderCodes || {};
          const layerCode = Number(codes.layerCode || scenePacketLayerCode(row.layerSlot));
          const animationCode = Number(codes.animationCode || scenePacketAnimationCode(row.animation && row.animation.kind));
          const identityCode = Number(codes.semanticCode || 0);
          const categoryCode = Number(codes.categoryCode || scenePacketCategoryCode(row));
          const packetKindCode = Number(codes.packetKindCode || scenePacketKindCode(row.packetKind));
          const objectOffset = index * 4;
          const styleOffset = scope.SCENE_PACKET_OBJECT_SLOTS * 4 + index * 4;
          const identityOffset = scope.SCENE_PACKET_OBJECT_SLOTS * 8 + index * 4;
          vector[objectOffset] = transform.x;
          vector[objectOffset + 1] = transform.y;
          vector[objectOffset + 2] = transform.w;
          vector[objectOffset + 3] = transform.h;
          vector[styleOffset] = layerCode;
          vector[styleOffset + 1] = transform.rotation;
          vector[styleOffset + 2] = animationCode;
          vector[styleOffset + 3] = scope.clamp01(row.confidence || row.material && row.material.opacity || 0.72);
          vector[identityOffset] = identityCode;
          vector[identityOffset + 1] = categoryCode;
          vector[identityOffset + 2] = Number(codes.variantCode ?? scope.scenePacketVariantCode(row));
          vector[identityOffset + 3] = packetKindCode;
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
        return kindCode * 4 + layerCode * 0.1 + scope.clamp01(row && row.confidence || 0);
      }

    function scenePacketDrawableTransform(row, index = 0, total = 1) {
        const transform = row && row.transform || {};
        const position = Array.isArray(transform.position) ? transform.position : null;
        const scale = Array.isArray(transform.scale) ? transform.scale : null;
        const rotation = Array.isArray(transform.rotation) ? Number(transform.rotation[2] || 0) : 0;
        if (position && scale) {
          return {
            x: scope.clamp01(position[0]),
            y: scope.clamp01(position[1]),
            w: scenePacketSize(scale[0], 0.12),
            h: scenePacketSize(scale[1], 0.1),
            rotation,
          };
        }
        const domain = row && row.domain || {};
        if (Array.isArray(domain.bounds)) {
          return {
            x: scope.clamp01(domain.bounds[0] + domain.bounds[2] * 0.5),
            y: scope.clamp01(domain.bounds[1] + domain.bounds[3] * 0.5),
            w: scenePacketSize(domain.bounds[2], 0.42),
            h: scenePacketSize(domain.bounds[3], 0.32),
            rotation: 0,
          };
        }
        if (Array.isArray(row && row.geometry && row.geometry.bounds)) {
          const bounds = row.geometry.bounds;
          return {
            x: scope.clamp01(bounds[0] + bounds[2] * 0.5),
            y: scope.clamp01(bounds[1] + bounds[3] * 0.5),
            w: scenePacketSize(bounds[2], 0.12),
            h: scenePacketSize(bounds[3], 0.1),
            rotation,
          };
        }
        const angle = total <= 1 ? 0 : index / Math.max(1, total) * Math.PI * 2;
        return {
          x: scope.clamp01(0.5 + Math.cos(angle) * 0.24),
          y: scope.clamp01(0.52 + Math.sin(angle) * 0.18),
          w: 0.13,
          h: 0.1,
          rotation: 0,
        };
      }

    function scenePacketSize(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return scope.clamp(numeric, 0.01, 1);
      }

    function scenePacketLayerCode(layerSlot) {
        const index = scope.VISUAL_IR_LAYER_SLOTS.indexOf(String(layerSlot || ''));
        return index >= 0 ? index + 1 : 0;
      }

    function scenePacketAnimationCode(kind) {
        const value = String(kind || '').toLowerCase();
        if (/static/.test(value)) return 0.5;
        if (/swim/.test(value)) return 1;
        if (/flow|ripple|streamline|curling|settling|shear/.test(value)) return 2;
        if (/track|particle|impulse|contact/.test(value)) return 3;
        if (/readout|measurement/.test(value)) return 4;
        if (/packet|network|route/.test(value)) return 5;
        if (/fermentation|bubble|rise|branching|growth/.test(value)) return 6;
        if (/plume|thermal|fire/.test(value)) return 7;
        if (/orbit|drift|phase-propagating/.test(value)) return 8;
        if (/flight|fly/.test(value)) return 10;
        return value ? 9 + Math.floor(scenePacketHashUnit(value) * 56) : 0.5;
      }

    function scenePacketHashUnit(text) {
        return scope.inclusiveUnitInterval(text);
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

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-packets.js', {
      pixelSampleForDrawable,
      pixelSampleForEnvironmentObligation,
      phase7DrawableSamplePoint,
      phase7OutputEnvelope,
      emptySceneRenderPacket,
      compileSceneRenderData,
      sceneRenderPacketRenderDataKey,
      scenePacketRenderDataHash,
      stableRenderDataValue,
      scenePacketResolvedSceneId,
      scenePacketFeatureVector,
      scenePacketAtomUniformVector,
      scenePacketSceneMixVector,
      scenePacketUniformVector,
      scenePacketDrawableRows,
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
      scenePacketUniformDrawables,
      scenePacketDrawablePriority,
      scenePacketDrawableTransform,
      scenePacketSize,
      scenePacketLayerCode,
      scenePacketAnimationCode,
      scenePacketSemanticCode,
      scenePacketCategoryCode,
      scenePacketKindCode,
      scenePacketObjectParts,
      scenePacketObjectPartTransform,
      scenePacketObjectPartColor,
      scenePacketObjectPartStorageVector,
      scenePacketObjectPartSummary,
      scenePacketObjectDepth,
      scenePacketCameraState,
      scenePacketLightState,
      scenePacketCameraLightUniformVector,
      scenePacketRendererConsumption,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
