(function attachSimulatteWebGpuRendererpackets(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function pixelSampleForDrawable(row = {}, obligation = {}, width = 0, height = 0, index = 0, total = 1) {
        const point = phase7DrawableSamplePoint(row, index, total, obligation);
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
            x: clamp01(Number(position[0] || 0.5) + dx * Math.cos(rotation) - dy * Math.sin(rotation)),
            y: clamp01(Number(position[1] || 0.5) + dx * Math.sin(rotation) + dy * Math.cos(rotation)),
          };
        }
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
          x: clampInt(Math.round(width * 0.82), 0, Math.max(0, width - 1)),
          y: clampInt(Math.round(height * 0.18), 0, Math.max(0, height - 1)),
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
	          environmentProgram: sceneRenderPacket && sceneRenderPacket.environmentProgram || null,
		          objectRealization: renderData && renderData.objectRealization || objectRealizationForScenePacket(sceneRenderPacket),
		          rendererConsumption: renderData && renderData.rendererConsumption || null,
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
        const objectParts = scenePacketObjectParts(packet).slice(0, GPU_OBJECT_PART_CAPACITY);
        const objectPartData = scenePacketObjectPartStorageVector(objectParts);
        const cameraState = scenePacketCameraState(packet);
        const lightState = scenePacketLightState(packet);
        const objectRealization = scenePacketObjectRealization(packet);
        const spatialHash = scenePacketSpatialHash(packet);
        const summary = sceneRenderPacketSummary(packet);
        return {
          schema: RENDER_DATA_SCHEMA,
          path: 'depth-lit-storage-object-parts-with-uniform-fallback',
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
          objectParts,
          objectPartData,
          objectPartCount: objectParts.length,
          objectPartCapacity: GPU_OBJECT_PART_CAPACITY,
          objectPartSummary: scenePacketObjectPartSummary(objectParts),
          cameraState,
          lightState,
          rendererConsumption: scenePacketRendererConsumption(packet, objectParts, cameraState, lightState),
          objectRealization,
          sceneObjectUniformSummary: sceneObjectUniformSummaryForDrawables(sceneObjectUniforms, uniformDrawables),
          sceneObjectIdentitySummary: scenePacketIdentitySummaryForDrawables(uniformDrawables),
          spatialHash,
          summary,
          metrics: metricsForScenePacket(packet),
          seed: seedForScenePacket(packet, spatialHash, summary),
        };
      }

    const OBJECT_PART_SHAPE_CODES = Object.freeze({
      ellipse: 1,
      box: 2,
      'rounded-box': 3,
      capsule: 4,
      triangle: 5,
      ring: 6,
      star: 7,
      spiral: 8,
      wave: 9,
    });
    const OBJECT_GRAMMAR_PART_REQUIREMENTS = Object.freeze({
      dog: ['body', 'head', 'leg', 'tail'], cat: ['body', 'head', 'leg', 'tail'],
      animal: ['body', 'head', 'leg'], person: ['head', 'torso', 'arm', ['leg', 'thigh']],
      tree: ['trunk', 'branch', 'crown'], flower: ['stem', 'petal', 'center'],
      building: ['shell', 'roof', 'door', 'window'], table: ['top', 'leg'],
      chair: ['back', 'seat', 'leg'], television: ['frame', 'screen', 'stand'],
      robot: ['base', 'arm', 'joint', 'gripper'], conveyor: ['belt', 'roller'],
      parcel: ['carton', 'top', 'tape', 'label'], galaxy: ['halo', 'spiral', 'core'],
      mountain: ['peak', 'snow'], 'server-rack': ['cabinet', 'server', 'status'],
      train: ['locomotive', 'car', 'wheel', 'rail'], 'rail-signal': ['post', 'signal', 'base'],
      'railway-platform': ['platform', 'track', 'canopy', 'support'], 'data-center': ['facility', 'rack', 'cooling', 'status'],
    });

    function scenePacketObjectParts(packet = {}) {
        const rows = scenePacketRows(packet, 'entities')
          .filter((row) => row && row.geometry && row.geometry.program)
          .sort((a, b) => (
            Number(a.geometry.program.zOrder || 0) - Number(b.geometry.program.zOrder || 0) ||
            Number(a.drawOrder || 0) - Number(b.drawOrder || 0) ||
            String(a.id || '').localeCompare(String(b.id || ''))
          ));
        const parts = [];
        for (const row of rows) {
          const program = row.geometry.program || {};
          for (const sourcePart of program.parts || []) {
            const transformed = scenePacketObjectPartTransform(row, sourcePart);
            const fill = scenePacketObjectPartColor(sourcePart.fill);
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
              constructionPartId: sourcePart.id || '',
              constructionConstraintIds: (sourcePart.constructionConstraintIds || []).slice(),
              primitive: sourcePart.primitive || 'rounded-box',
              shapeCode: OBJECT_PART_SHAPE_CODES[sourcePart.primitive] || OBJECT_PART_SHAPE_CODES['rounded-box'],
              center: transformed.center,
              size: transformed.size,
              rotation: transformed.rotation,
              fill,
              opacity: clamp01(Number(sourcePart.opacity == null ? 1 : sourcePart.opacity) * literalOpacity),
              semanticCode: scenePacketSemanticCode(row),
              animationCode: scenePacketAnimationCode(row.animation && row.animation.kind),
              variantCode: Number(row.renderCodes && row.renderCodes.variantCode || scenePacketVariantCode(row)),
              zOrder: Number(program.zOrder || 0) + Number(sourcePart.order || 0) * 0.001,
              depth: scenePacketObjectDepth(row, program, sourcePart),
              roughness: clamp01(Number(sourcePart.roughness != null ? sourcePart.roughness :
                row.material && row.material.roughness != null ? row.material.roughness : 0.56)),
              metallic: clamp01(Number(sourcePart.metallic != null ? sourcePart.metallic :
                row.material && row.material.metallic || 0)),
              emissive: clamp01(Number(sourcePart.emissive != null ? sourcePart.emissive :
                row.material && row.material.emissiveStrength || (row.material && row.material.emissive === true ? 0.42 : 0))),
              literal: program.literal === true,
            });
            if (parts.length >= GPU_OBJECT_PART_CAPACITY) return parts;
          }
        }
        return parts;
      }

    function scenePacketObjectDepth(row = {}, program = {}, part = {}) {
        const position = row.transform && Array.isArray(row.transform.position) ? row.transform.position : [];
        const explicit = Number(position[2]);
        if (Number.isFinite(explicit) && Math.abs(explicit) > 0.0001) {
          return clamp(explicit * 0.25 + 0.5, 0.04, 0.94);
        }
        const zOrder = Number(program.zOrder || 0) + Number(part.order || 0) * 0.001;
        return clamp(0.84 - clamp(zOrder / 64, 0, 1) * 0.66, 0.04, 0.94);
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
        return {
          center: [
            clamp01(Number(position[0] || 0.5) + dx * cosine - dy * sine),
            clamp01(Number(position[1] || 0.5) + dx * sine + dy * cosine),
          ],
          size: [
            Math.max(0.004, Number(localSize[0] || 0.8) * Number(scale[0] || 0.16)),
            Math.max(0.004, Number(localSize[1] || 0.7) * Number(scale[1] || 0.14)),
          ],
          rotation: parentRotation + Number(part.rotation || 0),
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
        const vector = new Float32Array(GPU_OBJECT_PART_CAPACITY * GPU_OBJECT_PART_FLOATS);
        parts.slice(0, GPU_OBJECT_PART_CAPACITY).forEach((row, index) => {
          const offset = index * GPU_OBJECT_PART_FLOATS;
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
        });
        return vector;
      }

    function scenePacketObjectRealization(packet = {}) {
        const rows = scenePacketRows(packet, 'entities').map((row) => {
          const program = row && row.geometry && row.geometry.program || {};
          const coverage = row && row.geometry && row.geometry.coverage || {};
          const scale = row && row.transform && row.transform.scale || [];
          const projectedArea = Number((Number(scale[0] || 0) * Number(scale[1] || 0)).toFixed(5));
          const topologyVerified = scenePacketObjectTopologyVerified(program);
          const semanticFit = program.source === 'phase6-data-owned-part-graph' &&
            /^(?:category-catalog|identity-catalog|prompt-specialized)$/.test(String(program.selectionRole || '')) ||
            Boolean(program.constructionReceipt && program.constructionReceipt.topologyTargetFit === true &&
              program.constructionReceipt.targetIdentityBound === true &&
              (program.constructionReceipt.modelEvaluated === true || program.constructionReceipt.literalSlotMatch === true));
          const readable = projectedArea >= 0.008;
          return {
            schema: 'simulatte.objectRenderRealization.v1',
            entityId: row.id || '',
            identityType: row.identity && row.identity.type || '',
            identityLabels: [
              row.id,
              row.label,
              row.identity && row.identity.label,
              row.identity && row.identity.sourceLabel,
              row.identity && row.identity.type,
              program.constructionReceipt && program.constructionReceipt.targetEntryId,
              ...(row.representedEntityIds || []),
            ].filter(Boolean),
            grammarId: program.grammarId || '',
            renderArchetype: program.visualArchetype || program.identityType || '',
            literal: program.literal === true,
            partCount: Array.isArray(program.parts) ? program.parts.length : 0,
            primitiveCount: Number(coverage.primitiveCount || 0),
            projectedArea,
            topologyVerified,
            semanticFit,
            readable,
            realized: program.literal === true && topologyVerified && semanticFit && readable,
            constructionSource: Boolean(program.constructionReceipt),
            modelEvaluatedConstruction: program.constructionReceipt && program.constructionReceipt.modelEvaluated === true,
            rerankEvaluatedConstruction: program.constructionReceipt && program.constructionReceipt.rerankEvaluated === true,
          };
        });
        const framing = packet && packet.receipts && packet.receipts.framing || {};
        return {
          schema: 'simulatte.objectRenderRealizationSummary.v1',
          entityCount: rows.length,
          realizedCount: rows.filter((row) => row.realized).length,
          literalCount: rows.filter((row) => row.literal).length,
          constructionProgramCount: rows.filter((row) => row.constructionSource).length,
          modelEvaluatedConstructionCount: rows.filter((row) => row.modelEvaluatedConstruction).length,
          topologyVerifiedCount: rows.filter((row) => row.topologyVerified).length,
          semanticFitCount: rows.filter((row) => row.semanticFit).length,
          readableCount: rows.filter((row) => row.readable).length,
          projectedArea: Number(rows.reduce((sum, row) => sum + row.projectedArea, 0).toFixed(5)),
          framingPass: framing.pass === true,
          framing,
          unprovenEntityIds: rows.filter((row) => !row.realized).map((row) => row.entityId),
          rows,
        };
      }

    function scenePacketObjectTopologyVerified(program = {}) {
        const parts = Array.isArray(program.parts) ? program.parts : [];
        const ids = parts.map((part) => String(part.id || '').toLowerCase());
        const grammar = String(program.grammarId || '').replace(/^object-grammar\./, '').replace(/-sitting$/, '');
        const required = OBJECT_GRAMMAR_PART_REQUIREMENTS[grammar];
        if (required) return required.every((token) => (
          (Array.isArray(token) ? token : [token]).some((candidate) => ids.some((id) => id.includes(candidate)))
        ));
        if (program.source === 'phase6-data-owned-part-graph') return parts.length >= 2;
        return Boolean(program.constructionReceipt) && parts.length >= 3 &&
          new Set(parts.map((part) => part.primitive).filter(Boolean)).size >= 2;
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
          keyIntensity: clamp01(Number(key.intensity || 0.86)),
          ambientColor,
          ambientIntensity: clamp01(Number(ambient.intensity || 0.34)),
          sourceLightCount: lights.length,
          consumed: lights.length > 0,
        };
      }

    function scenePacketCameraLightUniformVector(cameraState = {}, lightState = {}, timeSeconds = 0, width = 0, height = 0) {
        const vector = new Float32Array(GPU_OBJECT_UNIFORM_FLOATS);
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
          depthConfigured: true,
          depthEnabled: false,
          normalShading: false,
          perspectiveEnabled: Number(cameraState.perspective || 0) > 0,
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
          row.geometry && row.geometry.program && row.geometry.program.grammarId,
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
      pixelSampleForEnvironmentObligation,
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
      OBJECT_PART_SHAPE_CODES,
      scenePacketObjectParts,
      scenePacketObjectPartTransform,
      scenePacketObjectPartColor,
      scenePacketObjectPartStorageVector,
      scenePacketObjectRealization,
      scenePacketObjectPartSummary,
      scenePacketObjectDepth,
      scenePacketCameraState,
      scenePacketLightState,
      scenePacketCameraLightUniformVector,
      scenePacketRendererConsumption,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
