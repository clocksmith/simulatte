(function attachSimulatteCompositionGraphscenepacket(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const COMPILED_SHAPE_IDENTITIES = Object.freeze({
      wheel: ['wheel', 'machine'], hammer: ['hammer', 'artifact'], turbine: ['turbine', 'machine'],
      slider: ['slider', 'machine'], panel: ['panel', 'artifact'], meter: ['meter', 'instrument'],
      lens: ['lens', 'instrument'], prism: ['prism', 'instrument'], instrument: ['instrument', 'instrument'],
    });

    function scenePacketRowIdentity(row = {}, process = null, layerSlot = '') {
        const text = [
          row.id,
          row.entityId,
          row.fieldId,
          row.processId,
          row.primitive,
          row.kind,
          row.operator,
          process && process.family,
          layerSlot,
        ].filter(Boolean).join(' ').toLowerCase();
        let type = 'object';
        let category = 'object';
        if (/\bdog|dogs\b/.test(text)) {
          type = 'dog';
          category = 'animal';
        } else if (/\bcat|cats\b/.test(text)) {
          type = 'cat';
          category = 'animal';
        } else if (/water|lake|pool|fluid|ripple|wake/.test(text)) {
          type = 'water';
          category = 'medium';
        } else if (/field|pressure|flow|wake/.test(text)) {
          type = 'field';
          category = 'field';
        } else if (/process|swim|motion|locomotion|buoyancy|drag/.test(text)) {
          type = 'process';
          category = 'process';
        }
        return {
          schema: 'simulatte.sceneEntityIdentity.v1',
          type,
          category,
          label: type,
          renderClass: layerSlot || '',
          primitive: row.primitive || '',
          semanticRef: row.semanticRef || '',
          physicalRef: row.physicalRef || '',
        };
      }

    function assertScenePacketIdentityPreserved(sceneRenderPacket = {}) {
        const failures = [];
        for (const entity of sceneRenderPacket.entities || []) {
          const identity = entity.identity || {};
          const text = [
            entity.id,
            entity.sourceGraphId,
            entity.semanticRef,
            entity.physicalRef,
            ...(entity.sourceIds || []),
          ].filter(Boolean).join(' ').toLowerCase();
          if (/\bcat|surface-cat|primitive-cat/.test(text) && identity.type === 'dog') {
            failures.push({ id: entity.id, expected: 'cat', actual: identity.type });
          }
          if (/\bdog|surface-dog|primitive-dog/.test(text) && identity.type === 'cat') {
            failures.push({ id: entity.id, expected: 'dog', actual: identity.type });
          }
        }
        if (failures.length) {
          const error = new Error(`Phase 6 identity preservation failed: ${failures.map((row) => `${row.id}:${row.expected}->${row.actual}`).join(', ')}`);
          error.failures = failures;
          error.contract = 'simulatte.phase6.identityPreservation.v1';
          throw error;
        }
      }

    function renderInstanceLookup(instances, key) {
        const map = new Map();
        for (const instance of instances || []) {
          const value = instance && instance[key];
          if (!value) continue;
          if (!map.has(value)) map.set(value, []);
          map.get(value).push(instance);
        }
        return map;
      }

    function firstLookup(map, key) {
        const rows = key && map && map.get(key);
        return rows && rows.length ? rows[0] : null;
      }

    function scenePacketEntity({ entity, geometry, material, instance, motion, sceneKind, index, total }) {
        if (!entity || !visualRowAccepted(entity)) return null;
        const initialTransform = scenePacketTransform(entity.pose, index, total, sceneKind);
        const layerSlot = instance && instance.layerSlot ||
          renderInstanceLayerSlot('geometry', geometry || {}, entity, null, sceneKind);
        const identity = scenePacketEntityIdentity(entity, geometry, layerSlot);
        const geometryProgram = objectGeometryProgramForIdentity(identity, geometry || {}, entity, layerSlot);
        const transform = scenePacketReadableTransform(initialTransform, geometryProgram, entity);
        const animation = scenePacketAnimation({
          layerSlot,
          entity,
          motion,
          text: [
            entity.id,
            entity.label,
            entity.kind,
            entity.role,
            entity.shape,
            entity.material,
            geometry && geometry.primitive,
            motion && motion.grammar,
            sceneKind,
          ].filter(Boolean).join(' '),
          index,
        });
        const bounds = scenePacketBounds(transform);
        const renderCodes = scenePacketRenderCodes({
          id: entity.id,
          label: identity.label || entity.label || entity.id,
          sourceGraphId: entity.sourceGraphId || entity.sourceObject || entity.id || '',
          layerSlot,
          identity,
          animation,
          packetKind: 'entity',
        });
        return {
          schema: 'simulatte.sceneEntity.v1',
          id: entity.id,
          label: identity.label || entity.label || entity.id,
          identity,
          semanticRef: entity.semanticRef || '',
          physicalRef: entity.physicalRef || '',
          sourceGraphId: entity.sourceGraphId || entity.sourceObject || entity.id || '',
          sourceIds: entity.sourceIds || [],
          directlyGrounded: entity.directlyGrounded === true,
          supportOnly: entity.supportOnly === true,
          layoutConstraints: (entity.layoutConstraints || []).slice(),
          layoutRelationRoles: (entity.layoutRelationRoles || []).slice(),
          representedEntityIds: uniqueList([
            ...(entity.representedEntityIds || []),
            ...(entity.sourceIds || []),
            entity.sourceGraphId,
            entity.sourceObject,
            geometryProgram.constructionReceipt && geometryProgram.constructionReceipt.targetEntryId,
          ].filter(Boolean)),
          cardinality: Number(entity.cardinality || 1),
          visualTraits: entity.visualTraits || {},
          stateBindings: entity.stateBindings || {},
          layerSlot,
          transform,
          geometry: {
            id: geometry && geometry.id || `geometry:${entity.id}`,
            kind: geometry && geometry.layout || 'anchored',
            primitive: geometry && geometry.primitive || entity.shape || 'procedural-silhouette',
            bounds,
            program: geometryProgram,
            coverage: objectGeometryProgramCoverage(geometryProgram),
            instancing: geometry && geometry.instancing || instancingForEntity(entity),
            constraints: geometry && geometry.constraints || [],
          },
          material: scenePacketMaterial(material, entity, layerSlot),
          animation,
          renderCodes,
          collider: {
            kind: scenePacketColliderKind(layerSlot, entity, geometry),
            bounds,
            pickId: entity.id,
            selectable: true,
          },
          renderPriority: scenePacketDrawablePriority({
            packetKind: 'entity',
            layerSlot,
            identity,
            confidence: entity.confidence || instance && instance.confidence || 0.72,
          }, sceneKind),
          drawOrder: Number(instance && instance.drawOrder || index),
          evidence: uniqueList([
            ...(entity.evidence || []),
            ...(geometry && geometry.evidence || []),
            ...(material && material.evidence || []),
            ...(instance && instance.evidence || []),
          ]).slice(0, 12),
          confidence: Number(entity.confidence || instance && instance.confidence || 0.72),
          reason: entity.reason || instance && instance.reason || 'scene packet entity compiled from accepted VisualIR entity',
        };
      }

    function scenePacketEntityIdentity(entity = {}, geometry = {}, layerSlot = '') {
        const isNetworkLayer = layerSlot === 'node-graph' || layerSlot === 'network-flow';
        const objectText = [
          entity.id,
          entity.sourceObject,
          entity.role,
          entity.kind,
          entity.shape,
          entity.material,
          entity.visualRegime,
          entity.semanticRef,
          entity.physicalRef,
          geometry && geometry.primitive,
          layerSlot,
        ].filter(Boolean).join(' ').toLowerCase();
        const provenanceText = [
          ...(entity.sourceIds || []),
          ...(entity.evidence || []),
        ].filter(Boolean).join(' ').toLowerCase();
        const text = [objectText, provenanceText, entity.label].filter(Boolean).join(' ').toLowerCase();
        let type = 'object';
        let category = 'object';
        const directIdentity = scenePacketDirectEntityIdentity(entity, layerSlot);
        const literalPromptType = scenePacketPromptIdentityType(entity.sourceLabel || entity.label || '');
        if (directIdentity && (!isNetworkLayer || literalPromptType || entity.visualArchetype)) {
          type = directIdentity.type;
          category = directIdentity.category;
        } else if (isNetworkLayer || /node|edge|queue|network|packet|route/.test(objectText)) {
          type = 'network-node';
          category = 'network';
        } else if (/\bdogs?\b/.test(objectText)) {
          type = 'dog';
          category = 'animal';
        } else if (/\bcats?\b/.test(objectText)) {
          type = 'cat';
          category = 'animal';
        } else if (/\b(mouse|mice|gerbil|hamster|animal|mammal|fish|bird|swimmer)\b|animal-body/.test(objectText)) {
          type = 'animal';
          category = 'animal';
        } else if (/\b(flower|flowers|plant|plants|tree|trees|leaf|leaves|root|roots|mangrove|botanical|biomass)\b|botanical-cluster|plant-cluster/.test(objectText)) {
          type = 'plant';
          category = 'biological';
        } else if (/\bwater\b|pool|river|lake|ocean|fluid-volume/.test(objectText)) {
          type = 'water';
          category = 'medium';
        } else if (/smoke|plume|air|gas|fluid|field-envelope|scalar-field/.test(objectText)) {
          type = /smoke|plume/.test(objectText) ? 'smoke' : 'field';
          category = /smoke|plume|air|gas|fluid/.test(objectText) ? 'medium' : 'field';
        } else if (/robot|gripper|armature/.test(objectText)) {
          type = 'robot';
          category = 'machine';
        } else if (/detector|calorimeter|readout|sensor|instrument/.test(objectText)) {
          type = /readout/.test(objectText) ? 'readout' : 'instrument';
          category = 'instrument';
        } else if (/fire|flame|thermal|combust|soot/.test(objectText)) {
          type = 'fire';
          category = 'process';
        } else if (/building|wall|stairwell|surface|boundary/.test(objectText)) {
          type = 'structure';
          category = 'surface';
        } else if (/protein|molecule|bond|cell|membrane/.test(objectText)) {
          type = /protein/.test(objectText) ? 'protein' : 'cell';
          category = 'biological';
        } else if (isNetworkLayer || /node|edge|queue|network|packet|route/.test(text)) {
          type = 'network-node';
          category = 'network';
        } else if (/\bdogs?\b/.test(text)) {
          type = 'dog';
          category = 'animal';
        } else if (/\bcats?\b/.test(text)) {
          type = 'cat';
          category = 'animal';
        } else if (/\b(mouse|mice|gerbil|hamster|animal|mammal|fish|bird|swimmer)\b|animal-body/.test(text)) {
          type = 'animal';
          category = 'animal';
        } else if (/\b(flower|flowers|plant|plants|tree|trees|leaf|leaves|root|roots|mangrove|botanical|biomass)\b|botanical-cluster|plant-cluster/.test(text)) {
          type = 'plant';
          category = 'biological';
        } else if (/\bwater\b|pool|river|lake|ocean|fluid-volume/.test(text)) {
          type = 'water';
          category = 'medium';
        } else if (/smoke|plume|air|gas|fluid|field-envelope|scalar-field/.test(text)) {
          type = /smoke|plume/.test(text) ? 'smoke' : 'field';
          category = /smoke|plume|air|gas|fluid/.test(text) ? 'medium' : 'field';
        } else if (/robot|gripper|armature/.test(text)) {
          type = 'robot';
          category = 'machine';
        } else if (/detector|calorimeter|readout|sensor|instrument/.test(text)) {
          type = /readout/.test(text) ? 'readout' : 'instrument';
          category = 'instrument';
        } else if (/fire|flame|thermal|combust|soot/.test(text)) {
          type = 'fire';
          category = 'process';
        } else if (/building|wall|stairwell|surface|boundary/.test(text)) {
          type = 'structure';
          category = 'surface';
        } else if (/protein|molecule|bond|cell|membrane/.test(text)) {
          type = /protein/.test(text) ? 'protein' : 'cell';
          category = 'biological';
        }
        return {
          schema: 'simulatte.sceneEntityIdentity.v1',
          type,
          category,
          label: directIdentity && directIdentity.label || scenePacketIdentityLabel(type, entity),
          renderClass: layerSlot || '',
          role: entity.role || '',
          sourceLabel: entity.sourceLabel || entity.label || '',
          aliases: entity.aliases || [],
          semanticClass: entity.semanticClass || '',
          visualArchetype: directIdentity && directIdentity.visualArchetype || entity.visualArchetype || '',
          directlyGrounded: entity.directlyGrounded === true,
          primitive: geometry && geometry.primitive || entity.shape || '',
          material: entity.material || '',
          semanticRef: entity.semanticRef || '',
          physicalRef: entity.physicalRef || '',
        };
      }

    function scenePacketDirectEntityIdentity(entity = {}, layerSlot = '') {
        const promptType = entity.directlyGrounded === true
          ? scenePacketPromptIdentityType(entity.sourceLabel || entity.label || '')
          : '';
        if (promptType) {
          return {
            type: promptType,
            category: scenePacketGroundedIdentityCategory(promptType),
            label: entity.sourceLabel || entity.label || promptType,
            visualArchetype: entity.visualArchetype || promptType,
          };
        }
        const compiledShape = String(entity.shape || '').toLowerCase();
        if (COMPILED_SHAPE_IDENTITIES[compiledShape]) {
          const [type, category] = COMPILED_SHAPE_IDENTITIES[compiledShape];
          return {
            type,
            category,
            label: entity.sourceLabel || entity.label || type,
            visualArchetype: entity.visualArchetype || type,
          };
        }
        if (entity.directlyGrounded === true) {
          const sourceLabel = String(entity.sourceLabel || entity.label || entity.role || '').trim();
          const semanticClass = String(entity.semanticClass || '').trim().toLowerCase();
          const visualArchetype = String(entity.visualArchetype || '').trim().toLowerCase();
          const generic = /^(?:agent|biological-agent|body|containing-environment|entity|environment|fluid-medium|material|medium|object|part|term|visual-effect)$/;
          const sourceType = sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const type = scenePacketPromptIdentityType(sourceLabel) ||
            (!generic.test(semanticClass) ? semanticClass : '') || sourceType || visualArchetype;
          if (type) {
            return {
              type,
              category: scenePacketGroundedIdentityCategory(type),
              label: sourceLabel || type,
              visualArchetype: visualArchetype || type,
            };
          }
        }
        const text = [
          entity.id,
          entity.sourceObject,
          entity.role,
          entity.kind === 'medium' || entity.kind === 'field' ? '' : entity.kind,
          entity.visualRegime,
          entity.label,
          entity.semanticRef,
          entity.physicalRef,
        ].filter(Boolean).join(' ').toLowerCase();
        const groundedType = [
          ['bicycle', /\b(bicycle|bike)\b/], ['sofa', /\b(sofa|couch)\b/],
          ['lamp', /\b(?:floor )?lamp\b/], ['airplane', /\b(airplane|aircraft)\b/],
          ['bridge', /\bbridge\b/], ['road', /\broad\b/], ['boat', /\b(boat|vessel)\b/],
          ['cloud', /\bclouds?\b/], ['bird', /\bbirds?\b/], ['fish', /\bfish\b/],
          ['horse', /\bhorses?\b/], ['book', /\bbooks?\b/], ['cup', /\b(cup|mug)\b/],
          ['phone', /\b(phone|smartphone)\b/], ['laptop', /\blaptops?\b/], ['shelf', /\bshel(?:f|ves)\b/],
        ].find(([, pattern]) => pattern.test(text));
        if (groundedType) {
          return {
            type: groundedType[0],
            category: scenePacketGroundedIdentityCategory(groundedType[0]),
            label: entity.sourceLabel || entity.label || groundedType[0],
            visualArchetype: groundedType[0],
          };
        }
        if (/\bblack[- ]hole\b|event[- ]horizon/.test(text)) {
          return { type: 'black-hole', category: 'celestial' };
        }
        if (/\b(tv|television|screen|monitor)\b/.test(text)) {
          return { type: 'television', category: 'artifact' };
        }
        if (/\b(person|human|people|worker|runner)\b/.test(text)) {
          return { type: 'person', category: 'person' };
        }
        if (/\b(chair|stool|seat)\b/.test(text)) {
          return { type: 'chair', category: 'furniture' };
        }
        if (/\b(table|desk|bench)\b/.test(text) && !/relation[- ]table|contact[- ]pair[- ]table/.test(text)) {
          return { type: 'table', category: 'furniture' };
        }
        if (/\b(building|house|skyscraper|apartment)\b/.test(text)) {
          return { type: 'building', category: 'structure' };
        }
        if (/\b(galaxy|nebula)\b/.test(text)) {
          return { type: 'galaxy', category: 'celestial' };
        }
        if (/\b(planets?|moons?)\b/.test(text)) {
          return { type: 'planet', category: 'celestial' };
        }
        if (/\b(stars?|sun)\b/.test(text) && !/starfish/.test(text)) {
          return { type: 'star', category: 'celestial' };
        }
        if (/\b(tree|trees|forest|oak|pine|willow|maple)\b/.test(text)) {
          return { type: 'tree', category: 'plant' };
        }
        if (/\b(flower|flowers|rose|sunflower|orchid)\b/.test(text)) {
          return { type: 'flower', category: 'plant' };
        }
        if (/\b(mountain|mountains|peak|ridge)\b/.test(text)) {
          return { type: 'mountain', category: 'terrain' };
        }
        if (/\b(car|automobile|truck)\b/.test(text)) {
          return { type: 'car', category: 'vehicle' };
        }
        if (/\b(water|lake|pool|river|ocean|pond|beach)\b|fluid[-_ ]volume/.test(text) || layerSlot === 'water-volume') {
          return { type: 'water', category: 'medium' };
        }
        if (layerSlot === 'node-graph' || layerSlot === 'network-flow' || /\b(node|edge|queue|network|packet|route)\b/.test(text)) {
          return { type: 'network-node', category: 'network' };
        }
        if (/\bdogs?\b|(?:^|[-_])dog(?:[-_]|$)|surface[-_ ]dog|entity dog/.test(text)) {
          return { type: 'dog', category: 'animal' };
        }
        if (/\bcats?\b|(?:^|[-_])cat(?:[-_]|$)|surface[-_ ]cat|entity cat/.test(text)) {
          return { type: 'cat', category: 'animal' };
        }
        if (/\b(flower|flowers|plant|plants|tree|trees|leaf|leaves|root|roots|mangrove|botanical)\b|plant[-_ ]cluster|botanical[-_ ]cluster/.test(text)) {
          return { type: 'plant', category: 'biological' };
        }
        if (/\b(robot|gripper|armature)\b/.test(text)) {
          return { type: 'robot', category: 'machine' };
        }
        if (/\b(detector|calorimeter|readout|sensor|instrument)\b/.test(text)) {
          return { type: /readout/.test(text) ? 'readout' : 'instrument', category: 'instrument' };
        }
        return null;
      }

    function scenePacketField({ field, instance, sceneKind, index }) {
        if (!field || !visualRowAccepted(field)) return null;
        const layerSlot = instance && instance.layerSlot ||
          renderInstanceLayerSlot('field', field, null, null, sceneKind);
        const domain = scenePacketFieldDomain(field.geometry, index);
        const animation = scenePacketAnimation({
          layerSlot,
          field,
          text: `${field.id || ''} ${field.kind || ''} ${field.channel || ''} ${field.visualEncoding || ''}`,
          index,
        });
        const identity = {
          schema: 'simulatte.sceneEntityIdentity.v1',
          type: 'field',
          category: 'field',
          label: field.label || field.id || `field-${index + 1}`,
          renderClass: layerSlot,
          role: field.kind || '',
          sourceLabel: field.name || field.id || '',
          primitive: field.visualEncoding || '',
          material: field.materialId || '',
          semanticRef: field.semanticRef || '',
          physicalRef: field.physicalRef || '',
        };
        const renderCodes = scenePacketRenderCodes({
          id: field.id || `field-${index + 1}`,
          label: identity.label,
          sourceGraphId: field.sourceGraphId || field.domainId || field.id || '',
          layerSlot,
          identity,
          animation,
          packetKind: 'field',
        });
        return {
          schema: 'simulatte.sceneField.v1',
          id: field.id || `field-${index + 1}`,
          sourceGraphId: field.sourceGraphId || field.domainId || field.id || '',
          layerSlot,
          identity,
          domain,
          encoding: {
            kind: field.visualEncoding || field.kind || 'scalar-contours',
            channel: field.channel || field.stateBinding || '',
            strength: Number.isFinite(Number(field.strength)) ? Number(field.strength) : 0.58,
          },
          material: {
            id: field.materialId || '',
            shader: shaderForFieldLayer(layerSlot, field),
            opacity: layerSlot === 'water-volume' ? 0.46 : 0.32,
          },
          animation,
          renderCodes,
          renderPriority: scenePacketDrawablePriority({
            packetKind: 'field',
            layerSlot,
            identity,
            confidence: field.confidence || instance && instance.confidence || 0.64,
          }, sceneKind),
          drawOrder: Number(instance && instance.drawOrder || 100 + index),
          evidence: field.evidence || [],
          confidence: Number(field.confidence || instance && instance.confidence || 0.64),
          reason: field.reason || instance && instance.reason || 'scene packet field compiled from accepted VisualIR field',
        };
      }

    function scenePacketEffect({ row, kind, instance, sceneKind, index }) {
        if (!row || !visualRowAccepted(row)) return null;
        const process = kind === 'process' ? row : null;
        const layerSlot = instance && instance.layerSlot ||
          renderInstanceLayerSlot(kind, row, null, process, sceneKind);
        const domain = scenePacketEffectDomain(row, index);
        const animation = scenePacketAnimation({
          layerSlot,
          process: kind === 'process' ? row : null,
          motion: kind === 'motion' ? row : null,
          text: `${row.id || ''} ${row.family || ''} ${row.motion || ''} ${row.grammar || ''} ${row.operator || ''}`,
          index,
        });
        const identity = {
          schema: 'simulatte.sceneEntityIdentity.v1',
          type: kind === 'process' ? 'process' : 'motion',
          category: 'process',
          label: row.label || row.id || `${kind}-${index + 1}`,
          renderClass: layerSlot,
          role: row.family || row.grammar || '',
          sourceLabel: row.label || row.id || '',
          primitive: row.operator || row.motion || '',
          material: row.materialId || '',
          semanticRef: row.semanticRef || '',
          physicalRef: row.physicalRef || '',
        };
        const renderCodes = scenePacketRenderCodes({
          id: row.id || `${kind}-${index + 1}`,
          label: identity.label,
          sourceGraphId: row.sourceGraphId || row.processId || row.id || '',
          layerSlot,
          identity,
          animation,
          packetKind: 'effect',
        });
        return {
          schema: 'simulatte.sceneEffect.v1',
          id: row.id || `${kind}-${index + 1}`,
          type: kind,
          sourceGraphId: row.sourceGraphId || row.processId || row.id || '',
          processId: row.processId || row.id || '',
          affects: row.affects || [],
          layerSlot,
          identity,
          domain,
          material: scenePacketMaterial(row, null, layerSlot),
          animation,
          renderCodes,
          renderPriority: scenePacketDrawablePriority({
            packetKind: 'effect',
            layerSlot,
            identity,
            confidence: row.confidence || instance && instance.confidence || 0.58,
          }, sceneKind),
          drawOrder: Number(instance && instance.drawOrder || 180 + index),
          evidence: row.evidence || [],
          confidence: Number(row.confidence || instance && instance.confidence || 0.58),
          reason: row.reason || instance && instance.reason || `scene packet ${kind} compiled from accepted VisualIR row`,
        };
      }

    function motionForEntity(entity, processById, motionByProcess) {
        if (!entity) return null;
        const id = entity.id;
        const candidates = [];
        for (const process of processById.values()) {
          if (Array.isArray(process.affects) && process.affects.includes(id)) {
            const motion = motionByProcess.get(process.id);
            if (motion) candidates.push(motion);
          }
        }
        return candidates.sort((left, right) => (
          motionOwnershipPriority(right) - motionOwnershipPriority(left) ||
          Number(right.confidence || 0) - Number(left.confidence || 0) ||
          String(left.id || '').localeCompare(String(right.id || ''))
        ))[0] || null;
      }

    function motionOwnershipPriority(motion = {}) {
        const evidence = (motion.evidence || []).join(' ');
        if (/causal-affordance:|prompt-(?:clause|relation):/.test(evidence)) return 3;
        if (/graphics-atom:/.test(evidence)) return 2;
        return 1;
      }

    function scenePacketTransform(pose = {}, index = 0, total = 1, sceneKind = '') {
        const explicitDepth = pose.z != null && Number.isFinite(Number(pose.z)) ? Number(pose.z) : null;
        const path = Array.isArray(pose.points) && pose.points.length
          ? pose.points.map((point) => [
            scenePacketClamp01(point && point[0], 0.5),
            scenePacketClamp01(point && point[1], 0.5),
          ])
          : null;
        const hasSolvedBox = [pose.x, pose.y, pose.w || pose.width, pose.h || pose.height]
          .every((value) => value != null && Number.isFinite(Number(value)));
        if (path && !hasSolvedBox) {
          const bounds = pointsBounds(path);
          return {
            position: [bounds[0] + bounds[2] * 0.5, bounds[1] + bounds[3] * 0.5,
              explicitDepth == null ? scenePacketDepth(index, total) : explicitDepth],
            rotation: [0, 0, Number(pose.rotation || 0)],
            scale: [Math.max(bounds[2], 0.08), Math.max(bounds[3], 0.06), 1],
            anchor: [0.5, 0.5],
            path,
          };
        }
        const fallback = scenePacketFallbackPose(index, total, sceneKind);
        const x = scenePacketClamp01(pose.x, fallback.x);
        const y = scenePacketClamp01(pose.y, fallback.y);
        const w = scenePacketSize(pose.w || pose.width || pose.r && pose.r * 2, fallback.w);
        const h = scenePacketSize(pose.h || pose.height || pose.r && pose.r * 2, fallback.h);
        return {
          position: [x, y, explicitDepth == null ? scenePacketDepth(index, total) : explicitDepth],
          rotation: [0, 0, Number(pose.rotation || pose.angle || 0)],
          scale: [w, h, 1],
          anchor: [0.5, 0.5],
          ...(path ? { path } : {}),
        };
      }

    function scenePacketFallbackPose(index, total, sceneKind) {
        const count = Math.max(1, total);
        const column = index % Math.min(4, count);
        const row = Math.floor(index / Math.max(1, Math.min(4, count)));
        const x = 0.2 + column * 0.2 + (row % 2) * 0.06;
        const yBase = /water|watershed|ocean|restoration|cryosphere/.test(sceneKind) ? 0.62 : 0.36;
        return {
          x: scenePacketClamp01(x, 0.5),
          y: scenePacketClamp01(yBase + row * 0.12, 0.5),
          w: 0.14,
          h: 0.1,
        };
      }

    function scenePacketDepth(index, total) {
        return Number((index / Math.max(1, total) * 0.8).toFixed(3));
      }

    function scenePacketBounds(transform) {
        const position = transform.position || [0.5, 0.5, 0];
        const scale = transform.scale || [0.12, 0.1, 1];
        const x = scenePacketClamp01(position[0] - scale[0] * 0.5, 0);
        const y = scenePacketClamp01(position[1] - scale[1] * 0.5, 0);
        return [
          x,
          y,
          scenePacketClamp01(scale[0], 0.12),
          scenePacketClamp01(scale[1], 0.1),
        ];
      }

    function pointsBounds(points) {
        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return [minX, minY, maxX - minX, maxY - minY];
      }

    function scenePacketMaterial(material, entity, layerSlot = '') {
        const row = material || {};
        const baseMaterialId = row.materialId || row.id || entity && entity.material || 'matte';
        const constructionMaterials = entity && entity.construction && entity.construction.materialHints || [];
        const resolvedMaterial = row.materialId || row.id || '';
        const constructionMaterial = resolvedMaterial ? '' : (
          constructionMaterials.find((id) => id === baseMaterialId) || constructionMaterials[0] || ''
        );
        const materialId = constructionMaterial || baseMaterialId;
        const materialFamily = constructionMaterial
          ? materialFamilyForVisualMaterial(constructionMaterial, entity && entity.visualRegime)
          : row.materialId
          ? materialFamilyForVisualMaterial(row.materialId, entity && entity.visualRegime)
          : row.family || materialFamilyForVisualMaterial(entity && entity.material, entity && entity.visualRegime);
        if (layerSlot === 'node-graph' || layerSlot === 'network-flow') {
          const style = MATERIAL_STYLES.signal || MATERIAL_STYLES.light || MATERIAL_STYLES.matte;
          return {
            id: layerSlot === 'network-flow' ? 'packet-signal' : 'network-node',
            kind: 'network',
            shader: 'charged-trace-glow',
            fill: style.fill,
            stroke: style.stroke,
            opacity: Number.isFinite(Number(row.opacity)) ? Math.max(Number(row.opacity), 0.52) : style.alpha,
            roughness: Number.isFinite(Number(row.roughness)) ? Number(row.roughness) : 0.28,
            metallic: 0.7,
            emissive: true,
            emissiveStrength: 0.36,
          };
        }
        return {
          id: materialId,
          kind: materialFamily,
          shader: row.shader || shaderForMaterialFamily(materialFamily || 'matte'),
          fill: row.fill || '',
          stroke: row.stroke || '',
          opacity: Number.isFinite(Number(row.opacity)) ? Number(row.opacity) : 0.7,
          roughness: Number.isFinite(Number(row.roughness)) ? Number(row.roughness) : materialRoughness(materialFamily),
          metallic: Number.isFinite(Number(row.metallic)) ? Number(row.metallic) : materialFamily === 'metal' ? 0.82 : 0,
          emissive: row.emissive === true,
          emissiveStrength: row.emissive === true ? 0.42 : 0,
        };
      }

    function scenePacketColliderKind(layerSlot, entity, geometry) {
        const text = `${layerSlot || ''} ${entity && entity.kind || ''} ${geometry && geometry.primitive || ''}`.toLowerCase();
        if (/field|water|volume|matrix|plume/.test(text)) return 'bounds';
        if (/track|path|flow|network/.test(text)) return 'polyline';
        if (/agent|body|orbital|bubble|particle/.test(text)) return 'ellipse';
        return 'bounds';
      }

    function scenePacketFieldDomain(geometry = {}, index = 0) {
        if (geometry && geometry.kind === 'directed-field') {
          const from = Array.isArray(geometry.from) ? geometry.from : [0.12, 0.2];
          const to = Array.isArray(geometry.to) ? geometry.to : [0.84, 0.76];
          return {
            kind: 'directed-field',
            from: [scenePacketClamp01(from[0], 0.12), scenePacketClamp01(from[1], 0.2)],
            to: [scenePacketClamp01(to[0], 0.84), scenePacketClamp01(to[1], 0.76)],
            bounds: pointsBounds([from, to]),
          };
        }
        if (geometry && geometry.kind === 'radial-field') {
          const center = Array.isArray(geometry.center) ? geometry.center : [0.5, 0.5];
          const radius = scenePacketSize(geometry.radius, 0.32);
          return {
            kind: 'radial-field',
            center: [scenePacketClamp01(center[0], 0.5), scenePacketClamp01(center[1], 0.5)],
            radius,
            bounds: [
              scenePacketClamp01(center[0] - radius, 0.18),
              scenePacketClamp01(center[1] - radius, 0.18),
              scenePacketClamp01(radius * 2, 0.64),
              scenePacketClamp01(radius * 2, 0.64),
            ],
          };
        }
        if (geometry && geometry.kind === 'graph-field') {
          return {
            kind: 'graph-field',
            bounds: [0.08, 0.12, 0.84, 0.76],
          };
        }
        const inset = 0.05 + (index % 3) * 0.015;
        return {
          kind: 'canvas-field',
          bounds: [inset, inset, 1 - inset * 2, 1 - inset * 2],
        };
      }

    function scenePacketEffectDomain(row = {}, index = 0) {
        const geometry = row && row.geometry || {};
        if (geometry.kind === 'submersion-band' && Array.isArray(geometry.bounds)) {
          return {
            kind: 'submersion-band',
            bounds: scenePacketDomainBounds(geometry.bounds, [0.35, 0.58, 0.3, 0.08]),
          };
        }
        if (Array.isArray(geometry.bounds)) {
          return {
            kind: geometry.kind || 'bounded-effect',
            bounds: scenePacketDomainBounds(geometry.bounds, [0.2, 0.24, 0.6, 0.42]),
          };
        }
        if (row && row.pose && Array.isArray(row.pose.points) && row.pose.points.length) {
          return {
            kind: geometry.kind || 'path-effect',
            bounds: scenePacketDomainBounds(pointsBounds(row.pose.points), [0.2, 0.24, 0.6, 0.42]),
            path: row.pose.points.map((point) => [
              scenePacketClamp01(point && point[0], 0.5),
              scenePacketClamp01(point && point[1], 0.5),
            ]),
          };
        }
        const inset = 0.12 + (index % 4) * 0.025;
        return {
          kind: 'overlay',
          bounds: [inset, inset, 1 - inset * 2, 1 - inset * 2],
        };
      }

    function scenePacketDomainBounds(bounds = [], fallback = [0.12, 0.12, 0.76, 0.76]) {
        return [
          scenePacketClamp01(bounds[0], fallback[0]),
          scenePacketClamp01(bounds[1], fallback[1]),
          scenePacketSize(bounds[2], fallback[2]),
          scenePacketSize(bounds[3], fallback[3]),
        ];
      }

    function shaderForFieldLayer(layerSlot, field) {
        const text = `${layerSlot || ''} ${field && field.visualEncoding || ''} ${field && field.kind || ''}`.toLowerCase();
        if (/water|flow|fluid/.test(text)) return 'advected-ripple-volume';
        if (/thermal|heat|fire/.test(text)) return 'heat-isoband-overlay';
        if (/network|node|queue/.test(text)) return 'node-link-pressure';
        if (/detector|readout|track/.test(text)) return 'instrument-readout-overlay';
        if (/optical|ray|caustic/.test(text)) return 'refractive-caustic';
        return 'scalar-contours';
      }

    function scenePacketLights(lighting = {}, sceneKind = '') {
        if (Array.isArray(lighting.lights) && lighting.lights.length) return lighting.lights.map((row) => ({ ...row }));
        const atmosphere = String(lighting.atmosphere || sceneKind || '').toLowerCase();
        const warm = /thermal|fire|lava|hazard/.test(atmosphere);
        const cool = /water|ice|cryosphere|instrument|network/.test(atmosphere);
        return [
          {
            id: 'key',
            kind: 'directional',
            direction: [-0.36, -0.58, 0.72],
            color: warm ? [1, 0.78, 0.52] : cool ? [0.72, 0.9, 1] : [0.96, 0.96, 0.9],
            intensity: 0.86,
          },
          {
            id: 'fill',
            kind: 'ambient',
            color: [0.28, 0.36, 0.44],
            intensity: 0.34,
          },
        ];
      }

    function scenePacketPasses(entities, fields, effects) {
        const passes = ['background'];
        if ((fields || []).length) passes.push('fields');
        if ((entities || []).length) passes.push('entities');
        if ((effects || []).length) passes.push('effects');
        if ((entities || []).some((row) => row.layerSlot === 'readout-panel')) passes.push('readouts');
        return passes;
      }

    function scenePacketUniformsForVisualIR({ sceneKind = '', entities = [], fields = [], effects = [], graphicsAtoms = {}, visualGenome = {} }) {
        return {
          schema: 'simulatte.sceneRenderPacketUniforms.v1',
          compiler: 'simulatte.visual-ir.scene-render-packet.uniforms.v1',
          phase: 6,
          source: 'sceneRenderPacket.renderCodes',
          sceneId: scenePacketSceneId(sceneKind),
          atomUniforms: scenePacketAtomUniforms(graphicsAtoms),
          sceneMix: scenePacketSceneMixVector(sceneKind, entities, fields, effects),
          visualLayers: scenePacketVisualLayerVector(entities, fields, effects),
          palette: scenePacketGenomePaletteVector(visualGenome),
        };
      }

    function scenePacketGenomePaletteVector(visualGenome = {}) {
        const palette = visualGenome && visualGenome.palette || {};
        const hue = Number.isFinite(Number(palette.hue)) ? Number(palette.hue) : 180;
        const accentHue = Number.isFinite(Number(palette.accentHue)) ? Number(palette.accentHue) : hue + 96;
        const shadowHue = Number.isFinite(Number(palette.shadowHue)) ? Number(palette.shadowHue) : hue + 210;
        const contrast = scenePacketClamp01(palette.contrast, 0.68);
        const lightness = scenePacketClamp01(palette.lightness, 0.54);
        return [
          ...scenePacketHslToRgb(hue, 0.18 + contrast * 0.24, Math.max(0.05, lightness * 0.32)), 1,
          ...scenePacketHslToRgb(hue, 0.44 + contrast * 0.3, lightness), 1,
          ...scenePacketHslToRgb(shadowHue, 0.32 + contrast * 0.22, 0.1 + lightness * 0.22), 1,
          ...scenePacketHslToRgb(accentHue, 0.54 + contrast * 0.28, 0.48 + lightness * 0.24), 1,
        ].map((value) => Number(clamp(Number(value || 0), 0, 1).toFixed(4)));
      }

    function scenePacketHslToRgb(hue, saturation, lightness) {
        const h = (((hue % 360) + 360) % 360) / 360;
        const s = scenePacketClamp01(saturation, 0.6);
        const l = scenePacketClamp01(lightness, 0.5);
        if (s === 0) return [l, l, l];
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [h + 1 / 3, h, h - 1 / 3].map((t) => {
          let v = t;
          if (v < 0) v += 1;
          if (v > 1) v -= 1;
          if (v < 1 / 6) return p + (q - p) * 6 * v;
          if (v < 1 / 2) return q;
          if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
          return p;
        });
      }

    function scenePacketAtomUniforms(graphicsAtoms = {}) {
        const values = graphicsAtoms && graphicsAtoms.uniforms && Array.isArray(graphicsAtoms.uniforms.values)
          ? graphicsAtoms.uniforms.values
          : [];
        const out = new Array(24).fill(0);
        for (let i = 0; i < Math.min(out.length, values.length); i += 1) {
          out[i] = Number(clamp(Number(values[i] || 0), 0, 1).toFixed(4));
        }
        return out;
      }

    function scenePacketSceneMixVector(sceneKind = '', entities = [], fields = [], effects = []) {
        const vector = new Array(SCENE_MIX_SLOTS.length).fill(0);
        scenePacketAddSceneKindMix(vector, sceneKind, 0.58);
        for (const row of [...entities, ...fields, ...effects]) {
          scenePacketAddLayerSceneMix(vector, row.layerSlot, row.renderCodes && row.renderCodes.categoryCode || 0);
        }
        return scenePacketCompressVector(vector, 0.08, 8);
      }

    function scenePacketVisualLayerVector(entities = [], fields = [], effects = []) {
        const vector = new Array(VISUAL_IR_LAYER_SLOTS.length).fill(0);
        const add = (row, value) => {
          const index = VISUAL_IR_LAYER_SLOTS.indexOf(String(row && row.layerSlot || ''));
          if (index >= 0) vector[index] = clamp(vector[index] + value, 0, 1);
        };
        for (const row of entities || []) add(row, 0.96);
        for (const row of fields || []) add(row, 0.72);
        for (const row of effects || []) add(row, 0.58);
        return scenePacketCompressVector(vector, 0.06, 12);
      }

    Object.assign(scope, {
      scenePacketRowIdentity,
      assertScenePacketIdentityPreserved,
      renderInstanceLookup,
      firstLookup,
      scenePacketEntity,
      scenePacketEntityIdentity,
      scenePacketDirectEntityIdentity,
      scenePacketField,
      scenePacketEffect,
      motionForEntity,
      scenePacketTransform,
      scenePacketFallbackPose,
      scenePacketDepth,
      scenePacketBounds,
      pointsBounds,
      scenePacketMaterial,
      scenePacketAnimation,
      animationSpeedForKind,
      animationAmplitudeForKind,
      scenePacketColliderKind,
      scenePacketFieldDomain,
      scenePacketEffectDomain,
      scenePacketDomainBounds,
      shaderForFieldLayer,
      scenePacketLights,
      scenePacketPasses,
      scenePacketUniformsForVisualIR,
      scenePacketAtomUniforms,
      scenePacketSceneMixVector,
      scenePacketVisualLayerVector,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
