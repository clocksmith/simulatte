(function attachSimulatteCompositionGraphmaterials(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function visualMaterialsForObjects(objects, visualGenome, recipe, causalAffordances = []) {
        const seen = new Set();
        const rows = [];
        for (const object of objects || []) {
          const id = object.material || 'matte';
          if (seen.has(id)) continue;
          seen.add(id);
          const style = MATERIAL_STYLES[id] || MATERIAL_STYLES.matte || MATERIAL_STYLES.light;
          const family = materialFamilyForVisualMaterial(id, object.visualRegime, recipe);
          rows.push({
            id,
            family,
            shader: shaderForMaterialFamily(family),
            fill: style.fill,
            stroke: style.stroke,
            opacity: style.alpha,
            roughness: materialRoughness(family),
            emissive: /thermal|plasma|electric|signal/.test(family),
            evidence: [`material:${id}`, `family:${family}`],
            status: 'accepted',
            confidence: Number.isFinite(Number(object.visualConfidence)) ? Number(object.visualConfidence) : 0.7,
            reason: `material selected from accepted object ${object.id || id}`,
            sourceGraphId: object.visualSourceGraphId || object.id || '',
          });
        }
        const semanticMaterials = semanticRowsFromGenome(visualGenome, 'materials').slice(0, 5);
        for (const row of semanticMaterials) {
          if (seen.has(row.family)) continue;
          seen.add(row.family);
          rows.push({
            id: row.family,
            family: row.family,
            shader: row.shader || shaderForMaterialFamily(row.family),
            fill: `hsl(${row.hue || 180}, 62%, 62%)`,
            stroke: `hsl(${row.hue || 180}, 54%, 32%)`,
            opacity: 0.42,
            roughness: materialRoughness(row.family),
            emissive: /thermal|electric|transparent/.test(row.family),
            evidence: [`semantic-material:${row.id}`],
            status: 'accepted',
            confidence: 0.58,
            reason: 'semantic visual genome material selected from accepted compiled text',
          });
        }
        for (const row of causalAffordances || []) {
          for (const hint of row.shaderHints || []) {
            const id = `causal:${hint}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const family = materialFamilyForAffordanceHint(hint);
            rows.push({
              id,
              family,
              shader: shaderForAffordanceHint(hint, family),
              fill: `hsl(${affordanceHue(row, hint)}, 70%, 62%)`,
              stroke: `hsl(${affordanceHue(row, hint)}, 58%, 30%)`,
              opacity: /volume|mist|steam|veil|transparent/.test(hint) ? 0.34 : 0.58,
              roughness: materialRoughness(family),
              emissive: /emissive|thermal|plasma|laser|glow|heat/.test(hint),
              evidence: [`causal-affordance:${row.id}`, `shader-hint:${hint}`],
              status: 'accepted',
              confidence: 0.68,
              reason: 'causal affordance shader hint accepted for VisualIR material',
            });
          }
        }
        return rows;
      }

    function materialFamilyForAffordanceHint(hint) {
        const text = String(hint || '').toLowerCase();
        if (/steam|mist|volume|veil|water|wet|caustic|vessel/.test(text)) return 'fluid';
        if (/thermal|emissive|crust|heat|lava|runaway|hot/.test(text)) return 'thermal';
        if (/glass|transparent|lens|crystal|frost|ice/.test(text)) return 'transparent';
        if (/metal|circuit|trace|corrosion|battery|chip/.test(text)) return 'metal';
        if (/bio|root|coral|protein|neuron|artery/.test(text)) return 'biological';
        if (/grain|soil|silt|terrain|dust/.test(text)) return 'granular';
        if (/field|signal|magnetic|electric|node/.test(text)) return 'electric';
        return 'matte';
      }

    function shaderForAffordanceHint(hint, family) {
        const text = String(hint || '').toLowerCase();
        if (/phase|front|crust|frost|crystal/.test(text)) return 'phase-boundary-gradient';
        if (/steam|mist|volume|veil|plume/.test(text)) return 'volumetric-scattering';
        if (/vector|field|magnetic|signal/.test(text)) return 'vector-flux-overlay';
        if (/caustic|glass|transparent/.test(text)) return 'refractive-caustic';
        if (/stress|fracture|pressure|strain/.test(text)) return 'stress-isoband-overlay';
        return shaderForMaterialFamily(family);
      }

    function affordanceHue(row, hint) {
        const seed = hashProgram(`${row && row.id || ''}:${hint || ''}`);
        return seed % 360;
      }

    function materialFamilyForVisualMaterial(id, regime, recipe) {
        void recipe;
        const text = `${id || ''} ${regime || ''}`.toLowerCase();
        if (/plasma|radiation|fire|lava|thermal|heat/.test(text)) return 'thermal';
        if (/water|fluid|brine|river|wetland|coolant/.test(text)) return 'fluid';
        if (/glass|ice|quartz|transparent|lens/.test(text)) return 'transparent';
        if (/metal|copper|gold|silicon|graphite|conductor/.test(text)) return 'metal';
        if (/cell|bio|plant|tissue|microbe|microbiome|bacteria|protein|biomass|moss|algae|mycelium/.test(text)) return 'biological';
        if (/soil|sand|rock|grain|ceramic|porcelain|mineral/.test(text)) return 'granular';
        if (/signal|packet|charge|electric|sensor/.test(text)) return 'electric';
        if (/concrete|paper|pigment|artifact/.test(text)) return 'cultural';
        return 'matte';
      }

    function shaderForMaterialFamily(family) {
        const map = {
          thermal: 'emissive-heat-bands',
          fluid: 'advected-ripple-volume',
          transparent: 'caustic-transmission',
          metal: 'brushed-rim-light',
          biological: 'fibrous-cellular-mesh',
          granular: 'particle-strata',
          electric: 'charged-trace-glow',
          cultural: 'aged-surface-grain',
          matte: 'soft-lambert-fill',
        };
        return map[family] || map.matte;
      }

    function materialRoughness(family) {
        if (/transparent|fluid/.test(family)) return 0.18;
        if (/metal|electric/.test(family)) return 0.34;
        if (/granular|cultural/.test(family)) return 0.82;
        return 0.56;
      }

    function visualFieldForField(field, index, sceneKind) {
        const kind = field.kind || field.name || 'force-field';
        return {
          id: field.id || `field-${index + 1}`,
          kind,
          channel: field.channel || field.stateBinding || '',
          visualEncoding: visualEncodingForField(kind, sceneKind),
          strength: Number.isFinite(Number(field.strength)) ? Number(field.strength) : 0.58,
          geometry: visualFieldGeometry(field, kind),
          evidence: [`field:${kind}`, field.channel ? `channel:${field.channel}` : 'compiled-field'],
          sourceGraphId: field.domainId || field.id || '',
          status: field.status || 'accepted',
          confidence: Number.isFinite(Number(field.confidence)) ? Number(field.confidence) : 0.64,
          reason: field.reason || 'field row accepted from renderIR/PhysicsIR channel',
        };
      }

    function visualEncodingForField(kind, sceneKind) {
        if (/measurement|readout|instrument/.test(kind)) return 'readout-bands';
        if (/network|queue/.test(kind) || /digital|civic|venue/.test(sceneKind)) return 'node-link-pressure';
        if (/optical|radiation/.test(kind) || /space|planetary/.test(sceneKind)) return 'ray-cone-caustics';
        if (/thermal|heat/.test(kind) || /energy|hazard/.test(sceneKind)) return 'heat-isobands';
        if (/gravity|flow/.test(kind) || /water|restoration/.test(sceneKind)) return 'topographic-streamlines';
        if (/biological|chemical/.test(kind)) return 'scalar-contours';
        if (/dipole|magnetic/.test(kind)) return 'vector-flux-lines';
        if (/force/.test(kind)) return 'vector-field-lines';
        return 'scalar-contours';
      }

    function visualFieldGeometry(field, kind) {
        if (field.from || field.to) return { kind: 'directed-field', from: field.from || [0.12, 0.2], to: field.to || [0.84, 0.76] };
        if (field.center) return { kind: 'radial-field', center: field.center, radius: field.radius || 0.32 };
        if (/network/.test(kind)) return { kind: 'graph-field' };
        return { kind: 'canvas-field' };
      }

    function visualProcessesForPlan(objects, solverPlan, semantic, sceneKind, causalAffordances = []) {
        const families = uniqueList([
          ...((solverPlan && solverPlan.families) || []),
          ...semanticRowsFromPlan(semantic, 'processes').map((row) => row.family),
        ]).filter((family) => sceneAllowsProcessFamily(sceneKind, family));
        const source = families.length ? families : ['coupled-state'];
        const rows = source.slice(0, 12).map((family, index) => ({
          id: `process:${family}`,
          family,
          operator: visualOperatorForProcessFamily(family, sceneKind),
          affects: affectedEntitiesForProcess(family, objects),
          motion: motionForProcessFamily(family, sceneKind),
          evidence: [`solver:${family}`, `scene:${sceneKind}`],
          order: index,
          status: 'accepted',
          confidence: 0.62,
          reason: 'process accepted from solver family after scene filtering',
        }));
        for (const row of causalAffordances || []) {
          const family = causalAffordanceProcessFamily(row);
          if (rows.some((process) => process.id === `process:${family}`)) continue;
          rows.push({
            id: `process:${family}`,
            family,
            operator: 'causal-affordance-motion',
            affects: affectedEntitiesForAffordance(row, objects),
            motion: (row.motionHints && row.motionHints[0]) || 'causal-state-transition',
            motionHints: row.motionHints || [],
            geometryHint: row.geometry || '',
            evidence: [`causal-affordance:${row.id}`, row.causalRelationId || 'causal-relation'],
            order: rows.length,
            status: 'accepted',
            confidence: 0.74,
            reason: 'causal affordance process accepted from grounded intent receipt',
          });
        }
        return rows.slice(0, 20);
      }

    function sceneAllowsProcessFamily(sceneKind, family) {
        const text = String(family || '').toLowerCase();
        if (/molecular-biology/.test(sceneKind)) {
          return /growth|membrane|fracture|constraint|bond|chemical|reaction|fermentation|advection|coupled/.test(text);
        }
        if (/evolution-ecology/.test(sceneKind)) {
          return /growth|population|nutrient|diffusion|advection|membrane|coupled/.test(text);
        }
        if (/restoration-water/.test(sceneKind)) {
          return /advection|flow|water|gravity|granular|settling|erosion|growth|sediment|coupled/.test(text);
        }
        if (/\b(city|civic-market|digital-network|venue-crowd)\b/.test(sceneKind)) {
          return /network|queue|agent|routing|constraint|delay|ledger|coupled/.test(text);
        }
        if (/robotics-control/.test(sceneKind)) {
          return /network|queue|robot|servo|contact|constraint|collision|friction|electric|feedback|coupled/.test(text);
        }
        if (/planetary-space/.test(sceneKind)) {
          return /orbit|gravity|density|ring|granular|constraint|resonance|coupled/.test(text);
        }
        if (/ocean-cryosphere/.test(sceneKind)) {
          return /advection|flow|phase|fracture|constraint|calving|meltwater|thermal-transfer|phase-transition|wave-field|coupled/.test(text);
        }
        if (/particle-instrument/.test(sceneKind)) {
          return /particle|collision|thermal|heat|field|instrument|measurement|constraint|advection|coupled/.test(text);
        }
        if (/quantum-instrument/.test(sceneKind)) {
          return /quantum|phase|field|measurement|instrument|electric|constraint|coupled/.test(text);
        }
        if (/fire/.test(sceneKind)) {
          return /heat|thermal|combust|reaction|advection|flow|fluid|plume|soot|constraint|coupled/.test(text);
        }
        return true;
      }

    function causalAffordanceProcessFamily(row) {
        return String(row && row.id || 'affordance')
          .replace(/^affordance\./, 'causal-')
          .replace(/[^a-zA-Z0-9_-]+/g, '-');
      }

    function affectedEntitiesForAffordance(row, objects) {
        const triggerText = (row && row.triggers || []).join(' ').toLowerCase();
        const relationText = `${row && row.causalRelationId || ''} ${row && row.geometry || ''}`.toLowerCase();
        return (objects || [])
          .filter((object) => {
            const text = renderObjectText(object);
            return triggerText.split(/\s+/).some((term) => term && text.includes(term)) ||
              relationText.split(/[^a-z0-9]+/).some((term) => term && text.includes(term));
          })
          .slice(0, 8)
          .map((object) => object.id);
      }

    function semanticRowsFromPlan(semantic, key) {
        return semantic && Array.isArray(semantic[key]) ? semantic[key] : [];
      }

    function semanticRowsFromGenome(visualGenome, key) {
        return semanticRowsFromPlan(visualGenome && visualGenome.semanticVisuals, key);
      }

    function visualOperatorForProcessFamily(family, sceneKind) {
        const text = `${family} ${sceneKind}`.toLowerCase();
        if (/heat|thermal|burn|reaction|energy/.test(text)) return 'thermal-front';
        if (/flow|advection|fluid|water|restoration/.test(text)) return 'advected-particles';
        if (/wave|acoustic|pressure|orbit|space/.test(text)) return 'wave-or-orbit-trails';
        if (/network|queue|digital|civic|venue/.test(text)) return 'agent-routing-pulses';
        if (/growth|bio|clinical|ecology/.test(text)) return 'growth-diffusion-front';
        if (/collision|constraint|mechanical|sport/.test(text)) return 'constraint-impulse-arcs';
        if (/magnetic|electric|charge|plasma/.test(text)) return 'field-line-advection';
        if (/granular|erosion|hazard/.test(text)) return 'particle-strata-motion';
        return 'state-pulse-overlay';
      }

    function affectedEntitiesForProcess(family, objects) {
        const text = String(family || '').toLowerCase();
        return (objects || [])
          .filter((object) => {
            const row = renderObjectText(object);
            if (/heat|thermal|burn/.test(text)) return /fire|heat|smoke|metal|air|lava|plasma/.test(row);
            if (/flow|fluid|advection/.test(text)) return /water|flow|river|air|pipe|pump|channel/.test(row);
            if (/network|queue/.test(text)) return /queue|network|agent|sensor|ledger|route/.test(row);
            if (/growth|bio/.test(text)) return /bio|cell|plant|moss|algae|mycelium|patient|tissue/.test(row);
            if (/collision|constraint/.test(text)) return /wheel|wall|body|bridge|hammer|projectile/.test(row);
            return true;
          })
          .slice(0, 8)
          .map((object) => object.id);
      }

    function motionForProcessFamily(family, sceneKind) {
        const operator = visualOperatorForProcessFamily(family, sceneKind);
        const map = {
          'thermal-front': 'rising-plume-and-isobands',
          'advected-particles': 'streamline-advection',
          'wave-or-orbit-trails': 'phase-propagating-arcs',
          'agent-routing-pulses': 'packet-or-agent-pulses',
          'growth-diffusion-front': 'branching-front-expansion',
          'constraint-impulse-arcs': 'impulse-and-contact-ghosts',
          'field-line-advection': 'curling-vector-flux',
          'particle-strata-motion': 'settling-and-shear-bands',
          'state-pulse-overlay': 'bounded-state-pulses',
        };
        return map[operator] || map['state-pulse-overlay'];
      }

    function visualGeometryForEntity(entity, sceneKind) {
        return {
          id: `geometry:${entity.id}`,
          entityId: entity.id,
          primitive: geometryPrimitiveForEntity(entity, sceneKind),
          instancing: instancingForEntity(entity),
          layout: layoutForEntity(entity, sceneKind),
          scale: entity.pose && (entity.pose.w || entity.pose.h || entity.pose.r) ? 'specified' : 'adaptive',
          constraints: geometryConstraintsForEntity(entity),
          sourceGraphId: entity.sourceGraphId || entity.sourceObject || entity.id || '',
          sourceKind: entity.sourceKind || '',
          sourceIds: entity.sourceIds || [],
          status: entity.status || 'accepted',
          confidence: entity.confidence || 0.72,
          reason: entity.reason || 'geometry accepted for visual entity',
          evidence: entity.evidence || [],
        };
      }

    function geometryPrimitiveForEntity(entity, sceneKind) {
        const identityLocal = [
          entity.id,
          entity.sourceObject,
          entity.kind,
          entity.shape,
          entity.material,
          entity.visualRegime,
          entity.role,
        ].join(' ').toLowerCase();
        const local = `${identityLocal} ${entity.label || ''}`.toLowerCase();
        const scene = String(sceneKind || '').toLowerCase();
        if (/\bdogs?\b|(?:^|[-_])dog(?:[-_]|$)|surface[-_ ]dog|primitive[-_ ]dog/.test(identityLocal)) return 'dog-body';
        if (/\bcats?\b|(?:^|[-_])cat(?:[-_]|$)|surface[-_ ]cat|primitive[-_ ]cat/.test(identityLocal)) return 'cat-body';
        if (/\b(dog|dogs|cat|cats|animal|mammal|swimmer)\b|animal-body/.test(identityLocal)) return 'animal-body';
        if (/\b(flower|flowers|plant|plants|tree|trees|leaf|leaves|root|mangrove|botanical|fuel-bed|biomass)\b/.test(identityLocal)) return 'botanical-cluster';
        if (/\b(gut|microbiome|microbe|bacteria|colonies|colony|intestinal|immune|tissue|cell|membrane)\b/.test(identityLocal)) return 'cellular-fold-volume';
        if (/\b(train|railway|rail|subway|dispatch|platform|signal block|signal blocks)\b/.test(identityLocal)) return 'rail-dispatch-grid';
        if (/\b(building|zoning|shadow|sunlight|pedestrian|comfort|city-grid|city grid)\b/.test(identityLocal)) return 'building-shadow-volume';
        if (/\b(network|queue|route|routing|traffic|market|packet|server|parcel)\b/.test(identityLocal)) return 'route-node-graph';
        if (/field|heat|pressure|gravity|dipole/.test(local)) return 'scalar-field-sheet';
        if (/water|fluid|air|smoke|plume|medium/.test(local)) return 'fluid-volume-ribbon';
        if (/surface|wall|building|bridge|vessel|repository/.test(local)) return 'sectioned-surface';
        if (/instrument|sensor|detector|lens|probe/.test(local)) return 'instrument-glyph';
        if (/animal|cell|plant|bio/.test(local)) return 'organic-silhouette';
        if (/orbit|space|planetary/.test(local) || /planetary/.test(scene)) return 'orbital-body';
        if (/digital|civic|venue/.test(scene) && entity.kind === 'agent') return 'route-node-graph';
        return 'procedural-silhouette';
      }

    function instancingForEntity(entity) {
        if (entity.kind === 'agent') return { mode: 'swarm', count: 12 };
        if (entity.kind === 'medium') return { mode: 'particles', count: 48 };
        if (entity.kind === 'field') return { mode: 'grid-samples', count: 64 };
        return { mode: 'single', count: 1 };
      }

    function layoutForEntity(entity, sceneKind) {
        if (/digital|civic|venue/.test(sceneKind)) return 'graph-map';
        if (/planetary/.test(sceneKind)) return 'orbital-depth';
        if (/clinical|chemistry|advanced|cultural/.test(sceneKind)) return 'cutaway-bench';
        if (/restoration|hazard|watershed/.test(sceneKind)) return 'terrain-section';
        return entity.pose && entity.pose.points ? 'path' : 'anchored';
      }

    function geometryConstraintsForEntity(entity) {
        return uniqueList([
          ...(entity.geometryConstraints || []),
          entity.role === 'constraint' ? 'boundary' : '',
          entity.role === 'path' ? 'path-continuity' : '',
          entity.kind === 'medium' ? 'volume-contained' : '',
          entity.kind === 'agent' ? 'non-overlap' : '',
        ].filter(Boolean));
      }

    function visualMotionForProcesses(processes, visualGenome, sceneKind, causalAffordances = []) {
        const rows = (processes || []).map((process, index) => ({
          id: `motion:${process.family}`,
          processId: process.id,
          grammar: process.motion,
          phase: index / Math.max(1, processes.length),
          speed: motionSpeedForScene(sceneKind, process.family),
          density: visualGenome && visualGenome.morphology
            ? visualGenome.morphology.particleDensity || 32
            : 32,
          status: process.status || 'accepted',
          confidence: process.confidence || 0.58,
          reason: `motion accepted for process ${process.id || process.family}`,
          evidence: process.evidence || [],
        }));
        for (const row of causalAffordances || []) {
          const family = causalAffordanceProcessFamily(row);
          rows.push({
            id: `motion:causal:${visualSafeId(row.id || family)}`,
            processId: `process:${family}`,
            grammar: (row.motionHints || []).join('+') || 'causal-state-transition',
            phase: rows.length / Math.max(1, rows.length + 1),
            speed: motionSpeedForScene(row.sceneKind || sceneKind, `${family} ${(row.motionHints || []).join(' ')}`),
            density: Math.max(36, visualGenome && visualGenome.morphology
              ? visualGenome.morphology.particleDensity || 36
              : 36),
            motionHints: row.motionHints || [],
            causalRelationId: row.causalRelationId || '',
            evidence: [`causal-affordance:${row.id || family}`, row.causalRelationId || 'causal-relation'],
            status: 'accepted',
            confidence: 0.72,
            reason: 'causal affordance motion accepted from grounded intent receipt',
          });
        }
        return rows.length ? rows : [{
          id: 'motion:state-pulse',
          processId: 'process:coupled-state',
          grammar: 'bounded-state-pulses',
          phase: 0,
          speed: 0.28,
          density: 24,
          status: 'rejected',
          confidence: 0.2,
          reason: 'fallback motion only; no accepted process motion was available',
        }];
      }

    function visualRenderInstancesForIR(entities, geometry, materials, fields, processes, motion, sceneKind) {
        const materialById = new Map((materials || []).map((row) => [row.id, row]));
        const entityById = new Map((entities || []).map((row) => [row.id, row]));
        const processById = new Map((processes || []).map((row) => [row.id, row]));
        const instances = [];
        for (const row of geometry || []) {
          if (!visualRowAccepted(row)) continue;
          const entity = entityById.get(row.entityId) || null;
          if (entity && !visualRowAccepted(entity)) continue;
          const material = materialById.get(entity && entity.material || '') ||
            materialById.get(row.materialId || '') ||
            materials && materials[0] ||
            null;
          instances.push(visualRenderInstance({
            type: 'geometry',
            row,
            entity,
            material,
            sceneKind,
            drawOrder: Number(row.order || 0),
          }));
        }
        for (const row of fields || []) {
          if (!visualRowAccepted(row)) continue;
          instances.push(visualRenderInstance({
            type: 'field',
            row,
            sceneKind,
            drawOrder: 100 + instances.length,
          }));
        }
        for (const row of processes || []) {
          if (!visualRowAccepted(row)) continue;
          instances.push(visualRenderInstance({
            type: 'process',
            row,
            sceneKind,
            drawOrder: 180 + Number(row.order || 0),
          }));
        }
        for (const row of motion || []) {
          if (!visualRowAccepted(row)) continue;
          instances.push(visualRenderInstance({
            type: 'motion',
            row,
            process: processById.get(row.processId) || null,
            sceneKind,
            drawOrder: 220 + instances.length,
          }));
        }
        return instances
          .sort((a, b) => a.drawOrder - b.drawOrder || a.id.localeCompare(b.id))
          .slice(0, 48);
      }

    function visualRenderInstance({ type, row, entity = null, material = null, process = null, sceneKind, drawOrder }) {
        const sourceGraphId = row.sourceGraphId || entity && (entity.sourceGraphId || entity.sourceObject) || row.entityId || row.id || '';
        const sourceIds = uniqueList([
          sourceGraphId,
          ...(row.sourceIds || []),
          ...(entity && entity.sourceIds || []),
          row.entityId,
          row.processId,
          row.fieldId,
        ].filter(Boolean)).slice(0, 8);
        const layerSlot = renderInstanceLayerSlot(type, row, entity, process, sceneKind);
        const transform = renderInstanceTransform({ type, row, entity, process, sceneKind, drawOrder });
        const geometry = renderInstanceGeometry({ type, row, entity, layerSlot, transform });
        const instanceMaterial = renderInstanceMaterial({ row, entity, material, layerSlot });
        const animation = renderInstanceAnimation({ type, row, entity, process, layerSlot, sceneKind, drawOrder });
        const collider = renderInstanceCollider({ row, entity, layerSlot, geometry, transform });
        const identity = entity ? scenePacketEntityIdentity(entity, row, layerSlot) : scenePacketRowIdentity(row, process, layerSlot);
        return {
          schema: 'simulatte.renderInstance.v1',
          id: `instance:${type}:${visualSafeId(row.id || row.entityId || row.processId || sourceGraphId || 'row')}`,
          type,
          sceneKind,
          layerSlot,
          entityId: row.entityId || entity && entity.id || '',
          geometryId: type === 'geometry' ? row.id || '' : '',
          fieldId: type === 'field' ? row.id || row.fieldId || '' : row.fieldId || '',
          processId: row.processId || process && process.id || (type === 'process' ? row.id || '' : ''),
          materialId: material && material.id || entity && entity.material || row.materialId || '',
          primitive: row.primitive || row.visualEncoding || row.grammar || row.operator || '',
          shader: material && material.shader || row.shader || '',
          transform,
          geometry,
          material: instanceMaterial,
          animation,
          collider,
          identity,
          sourceGraphId,
          sourceIds,
          status: 'accepted',
          confidence: Number(Math.min(
            1,
            Number(row.confidence || 0.62),
            entity ? Number(entity.confidence || 0.72) : 1,
            material ? Number(material.confidence || 0.7) : 1
          ).toFixed(3)),
          reason: row.reason || entity && entity.reason || `accepted ${type} render instance`,
          drawOrder,
          evidence: uniqueList([
            ...(row.evidence || []),
            ...(entity && entity.evidence || []),
            ...(material && material.evidence || []),
          ]).slice(0, 12),
        };
      }

    function renderInstanceTransform({ type, row = {}, entity = null, process = null, sceneKind = '', drawOrder = 0 }) {
        const pose = renderInstancePose(type, row, entity, process, sceneKind, drawOrder);
        return scenePacketTransform(pose, renderInstanceIndex(row, entity, process, drawOrder), 29, sceneKind);
      }

    function renderInstancePose(type, row = {}, entity = null, process = null, sceneKind = '', drawOrder = 0) {
        if (row.pose && typeof row.pose === 'object') return row.pose;
        if (entity && entity.pose && typeof entity.pose === 'object') return entity.pose;
        if (Array.isArray(row.points) && row.points.length) return { points: row.points, rotation: row.rotation || 0 };
        const layerSlot = renderInstanceLayerSlot(type, row, entity, process, sceneKind);
        const seedText = [
          type,
          layerSlot,
          row.id,
          row.entityId,
          row.processId,
          row.fieldId,
          entity && entity.id,
          process && process.id,
          sceneKind,
          drawOrder,
        ].filter(Boolean).join(':');
        const seed = hashProgram(seedText) || 1;
        const jitterX = unitFromSeed(seed, 7) * 0.12 - 0.06;
        const jitterY = unitFromSeed(seed, 11) * 0.1 - 0.05;
        if (type === 'field' || /field|water-volume|organic-matrix|thermal-field|optical-field|chemical-front/.test(layerSlot)) {
          return {
            x: clamp(0.5 + jitterX * 0.35, 0.16, 0.84),
            y: clamp((/water|ocean|watershed|cryosphere/.test(sceneKind) ? 0.6 : 0.48) + jitterY * 0.35, 0.16, 0.84),
            w: 0.72,
            h: /thermal|plume|optical/.test(layerSlot) ? 0.62 : 0.46,
            rotation: unitFromSeed(seed, 13) * 0.12 - 0.06,
          };
        }
        if (type === 'process' || type === 'motion' || /process|network-flow|track-line|causal/.test(layerSlot)) {
          const fromX = clamp(0.18 + unitFromSeed(seed, 17) * 0.24, 0.08, 0.44);
          const fromY = clamp(0.28 + unitFromSeed(seed, 19) * 0.42, 0.12, 0.78);
          const toX = clamp(0.58 + unitFromSeed(seed, 23) * 0.28, 0.48, 0.92);
          const toY = clamp(0.22 + unitFromSeed(seed, 29) * 0.5, 0.1, 0.86);
          return {
            points: [
              [fromX, fromY],
              [clamp((fromX + toX) * 0.5 + jitterX, 0.08, 0.92), clamp((fromY + toY) * 0.5 + jitterY, 0.1, 0.86)],
              [toX, toY],
            ],
            rotation: 0,
          };
        }
        return {
          x: clamp(0.16 + unitFromSeed(seed, 31) * 0.68, 0.08, 0.92),
          y: clamp((/water|ocean|watershed|cryosphere/.test(sceneKind) ? 0.54 : 0.26) + unitFromSeed(seed, 37) * 0.38, 0.1, 0.9),
          w: /readout|detector|robot|orbital|node/.test(layerSlot) ? 0.16 : 0.13,
          h: /readout|detector|robot|orbital|node/.test(layerSlot) ? 0.12 : 0.1,
          rotation: unitFromSeed(seed, 41) * 0.24 - 0.12,
        };
      }

    function renderInstanceIndex(row = {}, entity = null, process = null, drawOrder = 0) {
        const seed = hashProgram([
          row.id,
          row.entityId,
          row.processId,
          row.fieldId,
          entity && entity.id,
          process && process.id,
          drawOrder,
        ].filter(Boolean).join(':'));
        return Math.max(0, Math.floor(seed % 29));
      }

    function renderInstanceGeometry({ type, row = {}, entity = null, layerSlot = '', transform }) {
        const bounds = scenePacketBounds(transform);
        return {
          id: type === 'geometry' ? row.id || `geometry:${entity && entity.id || visualSafeId(layerSlot)}` : row.geometryId || `geometry:${visualSafeId(row.id || layerSlot || type)}`,
          kind: row.layout || row.kind || (type === 'field' ? 'field-layer' : type === 'process' || type === 'motion' ? 'path-layer' : 'anchored'),
          primitive: row.primitive || row.visualEncoding || row.grammar || entity && entity.shape || layerSlot || 'procedural-instance',
          bounds,
          instancing: row.instancing || entity && instancingForEntity(entity) || null,
          constraints: row.constraints || [],
        };
      }

    function renderInstanceMaterial({ row = {}, entity = null, material = null, layerSlot = '' }) {
        const packetMaterial = scenePacketMaterial(material || row, entity, layerSlot);
        return {
          ...packetMaterial,
          id: packetMaterial.id || row.materialId || entity && entity.material || 'matte',
          shader: row.shader || packetMaterial.shader || '',
        };
      }

    function renderInstanceAnimation({ type, row = {}, entity = null, process = null, layerSlot = '', sceneKind = '', drawOrder = 0 }) {
        return scenePacketAnimation({
          layerSlot,
          entity,
          field: type === 'field' ? row : null,
          process: type === 'process' ? row : process,
          motion: type === 'motion' ? row : null,
          text: [
            row.id,
            row.primitive,
            row.visualEncoding,
            row.grammar,
            row.operator,
            entity && entity.behavior && (entity.behavior.processes || []).join(' '),
            entity && (entity.physicsOperators || []).join(' '),
            entity && entity.stateBindings && Object.keys(entity.stateBindings).join(' '),
            entity && entity.label,
            entity && entity.kind,
            process && process.family,
            sceneKind,
          ].filter(Boolean).join(' '),
          index: renderInstanceIndex(row, entity, process, drawOrder),
        });
      }

    function renderInstanceCollider({ row = {}, entity = null, layerSlot = '', geometry = {}, transform }) {
        return {
          kind: scenePacketColliderKind(layerSlot, entity, geometry),
          bounds: scenePacketBounds(transform),
          pickId: row.entityId || row.id || entity && entity.id || '',
          selectable: Boolean(row.entityId || entity && entity.id),
        };
      }

    function sceneRenderPacketForVisualIR(context = {}) {
        const sceneKind = context.sceneKind || 'generic';
        const entities = (context.entities || []).filter(visualRowAccepted);
        const materials = (context.materials || []).filter(visualRowAccepted);
        const fields = (context.fields || []).filter(visualRowAccepted);
        const processes = (context.processes || []).filter(visualRowAccepted);
        const motion = (context.motion || []).filter(visualRowAccepted);
        const geometry = (context.geometry || []).filter(visualRowAccepted);
        const renderInstances = (context.renderInstances || []).filter(visualRowAccepted);
        const geometryByEntity = new Map(geometry.map((row) => [row.entityId, row]));
        const materialById = new Map(materials.map((row) => [row.id, row]));
        const instancesByEntity = renderInstanceLookup(renderInstances, 'entityId');
        const instancesByField = renderInstanceLookup(renderInstances, 'fieldId');
        const instancesByProcess = renderInstanceLookup(renderInstances, 'processId');
        const processById = new Map(processes.map((row) => [row.id, row]));
        const motionByProcess = new Map(motion.map((row) => [row.processId, row]));
        const packetEntities = entities
          .map((entity, index) => scenePacketEntity({
            entity,
            geometry: geometryByEntity.get(entity.id),
            material: materialById.get(entity.material),
            instance: firstLookup(instancesByEntity, entity.id),
            motion: motionForEntity(entity, processById, motionByProcess),
            sceneKind,
            index,
            total: entities.length,
          }))
          .filter(Boolean)
          .slice(0, 32);
        const packetFields = fields
          .map((field, index) => scenePacketField({
            field,
            instance: firstLookup(instancesByField, field.id || field.fieldId),
            sceneKind,
            index,
          }))
          .filter(Boolean)
          .slice(0, 16);
        const packetEffects = [
          ...processes.map((process, index) => scenePacketEffect({
            row: process,
            kind: 'process',
            instance: firstLookup(instancesByProcess, process.id),
            sceneKind,
            index,
          })),
          ...motion.map((row, index) => scenePacketEffect({
            row,
            kind: 'motion',
            instance: firstLookup(instancesByProcess, row.processId),
            sceneKind,
            index,
          })),
        ].filter(Boolean).slice(0, 24);
        const uniforms = scenePacketUniformsForVisualIR({
          sceneKind,
          entities: packetEntities,
          fields: packetFields,
          effects: packetEffects,
          graphicsAtoms: context.graphicsAtoms || {},
          visualGenome: context.visualGenome || {},
        });
        return {
          schema: SCENE_RENDER_PACKET_SCHEMA,
          compiler: 'simulatte.visual-ir.scene-render-packet.compiler.v1',
          sceneKind,
          coordinateSystem: {
            space: 'normalized-canvas',
            origin: 'top-left',
            bounds: [0, 0, 1, 1],
          },
          time: {
            unit: 'seconds',
            stateBinding: 'simulation-time',
          },
          camera: {
            ...(context.camera || {}),
            coordinateSystem: 'normalized-canvas',
          },
          lights: scenePacketLights(context.lighting, sceneKind),
          entities: packetEntities,
          fields: packetFields,
          effects: packetEffects,
          compositionLedger: context.compositionLedger || null,
          uniforms,
          passes: scenePacketPasses(packetEntities, packetFields, packetEffects),
          receipts: {
            entityCount: packetEntities.length,
            fieldCount: packetFields.length,
            effectCount: packetEffects.length,
            source: 'visualIR.acceptedRows',
            primaryArtifact: 'sceneRenderPacket',
            renderCodeCount: packetEntities.length + packetFields.length + packetEffects.length,
    	        compositionLedger: context.compositionLedger ? {
    	          schema: context.compositionLedger.schema || SCENE_COMPOSITION_LEDGER_SCHEMA,
    	          obligationCount: (context.compositionLedger.obligations || []).length,
    	          preservedCount: (context.compositionLedger.obligations || []).filter((row) => row.status === 'preserved').length,
    	          failedCount: (context.compositionLedger.obligations || []).filter((row) => row.status === 'lost' || row.status === 'failed').length,
            } : null,
          },
        };
      }

    Object.assign(scope, {
      visualMaterialsForObjects,
      materialFamilyForAffordanceHint,
      shaderForAffordanceHint,
      affordanceHue,
      materialFamilyForVisualMaterial,
      shaderForMaterialFamily,
      materialRoughness,
      visualFieldForField,
      visualEncodingForField,
      visualFieldGeometry,
      visualProcessesForPlan,
      sceneAllowsProcessFamily,
      causalAffordanceProcessFamily,
      affectedEntitiesForAffordance,
      semanticRowsFromPlan,
      semanticRowsFromGenome,
      visualOperatorForProcessFamily,
      affectedEntitiesForProcess,
      motionForProcessFamily,
      visualGeometryForEntity,
      geometryPrimitiveForEntity,
      instancingForEntity,
      layoutForEntity,
      geometryConstraintsForEntity,
      visualMotionForProcesses,
      visualRenderInstancesForIR,
      visualRenderInstance,
      renderInstanceTransform,
      renderInstancePose,
      renderInstanceIndex,
      renderInstanceGeometry,
      renderInstanceMaterial,
      renderInstanceAnimation,
      renderInstanceCollider,
      sceneRenderPacketForVisualIR,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
