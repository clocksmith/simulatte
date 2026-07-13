(function attachSimulattePhysicsModelspecapi(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function createReactionState(params = {}) {
        const next = { ...templateById('reaction-diffusion').params, ...params };
        const size = FIELD_GRID;
        const a = new Float32Array(size * size).fill(1);
        const b = new Float32Array(size * size);
        const heat = new Float32Array(size * size);
        const center = size / 2;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const dist = Math.hypot(x - center, y - center);
            if (dist < size * 0.12 || hashNoise(x, y) > 0.986) {
              const idx = y * size + x;
              b[idx] = 0.9;
              a[idx] = 0.25;
            }
          }
        }
        return {
          kind: 'reaction-diffusion',
          t: 0,
          size,
          a,
          b,
          heat,
          conversion: 0,
          front: 0,
          entropy: 0,
          params: next,
        };
      }

    function laplace(field, size, x, y) {
        const xm = (x + size - 1) % size;
        const xp = (x + 1) % size;
        const ym = (y + size - 1) % size;
        const yp = (y + 1) % size;
        const c = field[y * size + x];
        return (
          field[y * size + xm] +
          field[y * size + xp] +
          field[ym * size + x] +
          field[yp * size + x] -
          4 * c
        );
      }

    function stepReactionState(inputState, inputParams, dtInput) {
        const params = { ...inputState.params, ...inputParams };
        const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
        const size = inputState.size || FIELD_GRID;
        const a = new Float32Array(inputState.a);
        const b = new Float32Array(inputState.b);
        const heat = new Float32Array(inputState.heat);
        const nextA = new Float32Array(a.length);
        const nextB = new Float32Array(b.length);
        const nextHeat = new Float32Array(heat.length);
        let massB = 0;
        let front = 0;
        let entropy = 0;
        const scale = dt * 8;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const idx = y * size + x;
            const av = a[idx];
            const bv = b[idx];
            const reaction = av * bv * bv * (0.75 + params.catalyst * 0.45);
            const da = params.diffusionA * laplace(a, size, x, y) - reaction + params.feedRate * (1 - av);
            const db = params.diffusionB * laplace(b, size, x, y) + reaction - (params.killRate + params.feedRate) * bv;
            const nvA = clamp(av + da * scale, 0, 1);
            const nvB = clamp(bv + db * scale, 0, 1);
            nextA[idx] = nvA;
            nextB[idx] = nvB;
            nextHeat[idx] = clamp(heat[idx] + reaction * scale * 0.22 - params.cooling * heat[idx] * dt, 0, 1);
            massB += nvB;
            front += Math.abs(nvB - bv);
            const local = clamp01(nvB);
            entropy += local > 0 && local < 1 ? -local * Math.log(local) : 0;
          }
        }
        const cells = size * size;
        return {
          kind: 'reaction-diffusion',
          t: inputState.t + dt,
          size,
          a: nextA,
          b: nextB,
          heat: nextHeat,
          conversion: massB / cells,
          front: front / cells,
          entropy: entropy / cells,
          params,
        };
      }

    function createBlankState(spec) {
        return {
          kind: 'blank-world',
          t: 0,
          params: { ...templateById('blank-world').params, ...spec.params },
          modules: [],
          objects: [],
        };
      }

    function stepBlankState(inputState, spec, dtInput) {
        const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
        return {
          ...inputState,
          t: inputState.t + dt,
          params: { ...inputState.params, ...spec.params },
        };
      }

    function hasModule(specOrState, moduleName) {
        return (specOrState.modules || []).includes(moduleName);
      }

    function isMagneticMachine(spec) {
        return hasModule(spec, 'electromagnetism') &&
          (spec.objects || []).some((object) => /wheel|rotor|slider|magnet/i.test(`${object.id} ${object.role}`));
      }

    function createCustomParticles(spec) {
        const count = 120 + Math.round(clamp(spec.params.complexity ?? 0.5, 0, 1) * 220) + (spec.objects || []).length * 16;
        return Array.from({ length: count }, (_, index) => ({
          x: hashNoise(19, index),
          y: hashNoise(23, index),
          vx: (hashNoise(29, index) - 0.5) * 0.08,
          vy: (hashNoise(31, index) - 0.5) * 0.08,
          phase: hashNoise(37, index),
          kind: index % Math.max(1, (spec.objects || []).length),
        }));
      }

    function createComponentStates(spec) {
        const graphNodes = spec.contract && spec.contract.graph ? spec.contract.graph.nodes || [] : [];
        const graphStates = Object.fromEntries(graphNodes.map((node) => [node.id, node.state || {}]));
        return Object.fromEntries((spec.objects || []).map((object) => [
          object.id,
          {
            ...(graphStates[object.id] || {}),
            ...(object.state || {}),
          },
        ]));
      }

    function stepComponentStates(inputStates, spec, params, dt) {
        const next = {};
        const interactions = interactionTotals(spec.contract);
        const operators = operatorTotals(spec.contract);
        const heatDelta = ((params.heatTransfer || 0) * 0.02 + (operators.heat || 0)) * dt;
        const moistureDelta = ((params.moisture || 0) * 0.01 + Math.min(0, interactions.fire || 0) * 0.02) * dt;
        for (const object of spec.objects || []) {
          const previous = inputStates && inputStates[object.id] ? inputStates[object.id] : object.state || {};
          const isFire = /flame|combustion|fire/.test(object.id);
          const isQueue = /queue|market|traffic/.test(object.id);
          const isWater = /water|river|lake/.test(object.id);
          next[object.id] = {
            temperature: clamp01((previous.temperature ?? 0.5) + heatDelta + (isFire ? 0.018 : 0)),
            moisture: clamp01((previous.moisture ?? 0) + moistureDelta + (isWater ? 0.006 : -0.002) * dt),
            charge: clamp((previous.charge ?? 0) + (params.electricField || 0) * dt * 0.01, -1, 1),
            pressure: clamp01((previous.pressure ?? 0) + (params.pressure || 0) * dt * 0.01),
            backlog: clamp01((previous.backlog ?? 0) + (isQueue ? (params.queueBacklog || 0) * dt * 0.02 : 0)),
            fuel: clamp01((previous.fuel ?? 0) - (isFire ? Math.max(0, params.combustibility || 0) * dt * 0.008 : 0)),
            mass: Math.max(0, (previous.mass ?? 0.2) - (isFire ? dt * 0.001 : 0)),
            velocity: clamp01((previous.velocity ?? 0) + (params.flowRate || params.windSpeed || 0) * dt * 0.02),
            health: clamp01((previous.health ?? 1) - Math.max(0, params.infectionRate || 0) * dt * 0.006),
            inventory: clamp01((previous.inventory ?? 0) + (isQueue ? (params.marketDemand || 0) * dt * 0.012 : 0)),
          };
        }
        return next;
      }

    function componentStatesFromSolverState(spec, solverState) {
        const channels = solverState && solverState.channels || {};
        const baseStates = createComponentStates(spec);
        const renderObjects = spec.renderIR && Array.isArray(spec.renderIR.objects) ? spec.renderIR.objects : [];
        const byPhysicalRef = new Map(renderObjects.map((object) => [object.physicalRef, object]));
        const entries = [];
        for (const object of spec.objects || []) {
          const renderObject = byPhysicalRef.get(object.id) ||
            renderObjects.find((row) => row.semanticRef && String(row.semanticRef).includes(object.id)) ||
            null;
          const entityId = renderObject ? renderObject.physicalRef : object.id;
          entries.push([object.id, {
            ...(baseStates[object.id] || {}),
            ...componentStateForEntity(entityId, channels),
          }]);
        }
        for (const renderObject of renderObjects) {
          if (entries.some(([id]) => id === renderObject.physicalRef)) continue;
          entries.push([renderObject.physicalRef, componentStateForEntity(renderObject.physicalRef, channels)]);
        }
        return Object.fromEntries(entries);
      }

    function componentStateForEntity(entityId, channels) {
        const state = {};
        for (const [channel, value] of Object.entries(channels || {})) {
          if (!channel.endsWith(`:${entityId}`)) continue;
          const key = channel.split(':')[0];
          state[key] = cloneChannelValue(value);
        }
        return state;
      }

    function particlesFromSolverState(spec, solverState) {
        const objects = spec.renderIR && Array.isArray(spec.renderIR.objects)
          ? spec.renderIR.objects
          : [];
        const channels = solverState && solverState.channels || {};
        const rows = [];
        const maxObjects = Math.min(objects.length, 10);
        for (let objectIndex = 0; objectIndex < maxObjects; objectIndex += 1) {
          const object = objects[objectIndex];
          const position = channelVector(channels[`position:${object.physicalRef}`], {
            x: 0.24 + objectIndex * 0.055,
            y: 0.5,
          });
          const velocity = channelVector(
            channels[`flowVelocity:${object.physicalRef}`] || channels[`velocity:${object.physicalRef}`],
            { x: 0, y: 0 }
          );
          const activity = channelMagnitude(channels[`temperature:${object.physicalRef}`]) +
            channelMagnitude(channels[`angularVelocity:${object.physicalRef}`]) +
            channelMagnitude(channels[`damage:${object.physicalRef}`]);
          for (let i = 0; i < 8; i += 1) {
            const phase = hashNoise(objectIndex + 43, i + 11);
            rows.push({
              x: clamp(position.x + (phase - 0.5) * 0.16 + velocity.x * 0.02, 0.02, 0.98),
              y: clamp(position.y + (hashNoise(i + 17, objectIndex + 5) - 0.5) * 0.12 + velocity.y * 0.02, 0.02, 0.98),
              vx: velocity.x * 0.04,
              vy: velocity.y * 0.04,
              phase,
              kind: objectIndex,
              activity,
            });
          }
        }
        return rows;
      }

    function deriveSolverSummary(solverState, spec) {
        if (deriveChannelSummary && solverState && solverState.channels) {
          return deriveChannelSummary(
            solverState.channels,
            spec.solverGraph ? spec.solverGraph.channelMetadata || {} : {}
          );
        }
        return {
          energy: 0,
          motion: 0,
          field: 0,
          matter: 0,
          heat: 0,
          stability: 1,
        };
      }

    function channelVector(value, fallback) {
        if (value && typeof value === 'object') {
          const x = Number(value.x);
          const y = Number(value.y);
          return {
            x: Number.isFinite(x) ? x : fallback.x,
            y: Number.isFinite(y) ? y : fallback.y,
          };
        }
        return fallback;
      }

    function channelMagnitude(value) {
        if (value && typeof value === 'object') {
          const x = Number(value.x || 0);
          const y = Number(value.y || 0);
          return Number.isFinite(x + y) ? Math.hypot(x, y) : 0;
        }
        const number = Number(value);
        return Number.isFinite(number) ? Math.abs(number) : 0;
      }

    function cloneChannelValue(value) {
        if (value && typeof value === 'object') return { ...value };
        return value;
      }

    function createCustomState(spec) {
        const params = { ...templateById('custom-world').params, ...spec.params };
        const solverState = spec.solverGraph && createSolverState
          ? createSolverState(spec.solverGraph)
          : null;
        if (solverState) {
          const summary = solverState.summary || deriveSolverSummary(solverState, spec);
          return {
            kind: 'custom-world',
            t: solverState.t,
            params,
            modules: spec.modules,
            objects: spec.objects,
            solverState,
            channelValues: solverState.channels,
            componentStates: componentStatesFromSolverState(spec, solverState),
            particles: particlesFromSolverState(spec, solverState),
            machine: null,
            fluid: null,
            reaction: null,
            energy: summary.energy,
            motion: summary.motion,
            field: summary.field,
            matter: summary.matter,
            heat: summary.heat,
            stability: summary.stability,
          };
        }
        return {
          kind: 'custom-world',
          t: 0,
          params,
          modules: spec.modules,
          objects: spec.objects,
          componentStates: createComponentStates(spec),
          particles: createCustomParticles({ ...spec, params }),
          machine: isMagneticMachine(spec) ? createState(params) : null,
          fluid: hasModule(spec, 'fluid') ? createFluidState({
            ...params,
            inletFlow: params.inletFlow ?? params.flowRate,
            vortexStrength: params.vortexStrength ?? params.fieldStrength,
          }) : null,
          reaction: hasModule(spec, 'chemistry') ? createReactionState(params) : null,
          energy: 0,
          motion: 0,
          field: 0,
          matter: 0,
          heat: 0,
          stability: 1,
        };
      }

    function stepCustomState(inputState, spec, dtInput) {
        const params = { ...inputState.params, ...spec.params };
        if (spec.solverGraph && stepSolverState) {
          const sourceState = inputState.solverState || (
            createSolverState ? createSolverState(spec.solverGraph) : null
          );
          if (sourceState) {
            const solverState = stepSolverState(sourceState, spec.solverGraph, dtInput);
            const summary = solverState.summary || deriveSolverSummary(solverState, spec);
            return {
              ...inputState,
              t: solverState.t,
              params,
              modules: spec.modules,
              objects: spec.objects,
              solverState,
              channelValues: solverState.channels,
              componentStates: componentStatesFromSolverState(spec, solverState),
              particles: particlesFromSolverState(spec, solverState),
              machine: null,
              fluid: null,
              reaction: null,
              energy: summary.energy,
              motion: summary.motion,
              field: summary.field,
              matter: summary.matter,
              heat: summary.heat,
              stability: summary.stability,
            };
          }
        }
        const contract = spec.contract || null;
        const interactions = interactionTotals(contract);
        const operatorEffect = operatorTotals(contract);
        const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
        const state = {
          ...inputState,
          params,
          modules: spec.modules,
          objects: spec.objects,
          componentStates: stepComponentStates(inputState.componentStates, spec, params, dt),
          particles: inputState.particles.map((particle) => ({ ...particle })),
        };
        if (state.machine) state.machine = stepState(state.machine, params, dt);
        if (state.fluid) {
          state.fluid = stepFluidState(state.fluid, {
            ...params,
            inletFlow: params.inletFlow ?? params.flowRate,
            vortexStrength: params.vortexStrength ?? params.fieldStrength,
          }, dt);
        }
        if (state.reaction) state.reaction = stepReactionState(state.reaction, params, dt);

        const field = (params.fieldStrength || 0) +
          (params.magneticStrength || 0) * 0.7 +
          (params.electricField || 0) * 0.52 +
          (interactions.field || 0) * 0.25 +
          (operatorEffect.field || 0) +
          (hasModule(spec, 'gravity') ? Math.abs(params.gravity || 0) : 0);
        const drive = (params.energyInput || 0) + solarPower({ ...DEFAULT_PARAMS, ...params }) / 900;
        const swirl = (params.turbulence || 0) + (params.vortexStrength || 0) * 0.28;
        const damping = clamp(params.damping ?? params.friction ?? 0.08, 0, 0.95);
        const spring = hasModule(spec, 'elasticity') ? clamp(params.springConstant || 0, 0, 1.6) : 0;
        const thermal = hasModule(spec, 'thermal') ? clamp(params.thermalFlux || params.heatTransfer || 0, 0, 1.5) : 0;
        const wave = hasModule(spec, 'wave') || hasModule(spec, 'acoustics') ? clamp(params.waveAmplitude || 0, 0, 1.2) : 0;
        const acoustic = hasModule(spec, 'acoustics') ? clamp(params.soundFrequency || 0.42, 0.05, 1.4) : 0;
        const buoyancy = hasModule(spec, 'buoyancy') ? clamp(params.buoyancy || 0, -0.4, 1.2) : 0;
        const wind = hasModule(spec, 'fluid') ? clamp(params.windSpeed || 0, -1.2, 1.2) : 0;
        const charge = hasModule(spec, 'electricity') || hasModule(spec, 'plasma') ? clamp(params.charge || params.electricField || 0, -1.2, 1.2) : 0;
        const granular = hasModule(spec, 'granular') ? clamp(params.granularFriction || 0.38, 0, 1) : 0;
        const restitution = hasModule(spec, 'collision') ? clamp(params.restitution || 0.72, 0, 1) : 0;
        const control = hasModule(spec, 'control') ? clamp(params.controlGain || 0, 0, 1.5) : 0;
        const signalNoise = hasModule(spec, 'signal') || hasModule(spec, 'noise') ? clamp(params.signalNoise || 0, 0, 1) : 0;
        const latency = hasModule(spec, 'network') ? clamp(params.networkLatency || params.signalDelay || 0, 0, 1.5) : 0;
        const queue = hasModule(spec, 'queue') ? clamp(params.queueBacklog || 0, 0, 1) : 0;
        const service = hasModule(spec, 'queue') || hasModule(spec, 'logistics') ? clamp(params.serviceRate || 0.5, 0.05, 1.5) : 0;
        const terrain = hasModule(spec, 'terrain') ? clamp(params.terrainSlope || 0, -1, 1) : 0;
        const erosion = hasModule(spec, 'erosion') ? clamp(params.erosionRate || 0, 0, 1) : 0;
        const biology = hasModule(spec, 'biology') ? clamp(params.populationGrowth || 0, 0, 1.4) : 0;
        const infection = hasModule(spec, 'biology') || hasModule(spec, 'diffusion') ? clamp(params.infectionRate || 0, 0, 1.2) : 0;
        const adhesion = hasModule(spec, 'surface') ? clamp(params.adhesion || 0, 0, 1.2) : 0;
        const cohesion = hasModule(spec, 'cohesion') || hasModule(spec, 'material') ? clamp(params.cohesion || 0, 0, 1.2) : 0;
        const phase = hasModule(spec, 'phase-change') ? clamp(params.phaseThreshold || 0.5, 0, 1) : 0;
        const latentHeat = hasModule(spec, 'phase-change') ? clamp(params.latentHeat || 0, 0, 1.4) : 0;
        const market = hasModule(spec, 'economics') || hasModule(spec, 'market') ? clamp(params.marketDemand || 0, 0, 1.5) : 0;
        const elasticity = hasModule(spec, 'economics') || hasModule(spec, 'market') ? clamp(params.priceElasticity || 0, 0, 1.2) : 0;
        const solarRadiation = hasModule(spec, 'radiation') ? clamp((params.irradiance || 0) / 1200, 0, 1.5) : 0;
        const fire = hasModule(spec, 'fire') ? clamp((params.combustibility || 0) + (interactions.fire || 0) * 0.3, 0, 1.2) : 0;
        const water = hasModule(spec, 'water') || hasModule(spec, 'liquid') ? clamp(params.moisture || 0.5, 0, 1) : 0;
        const solid = hasModule(spec, 'solid') || hasModule(spec, 'rock') || hasModule(spec, 'wood') ? clamp(params.hardness || 0, 0, 1.5) : 0;
        const metal = hasModule(spec, 'metal') ? clamp(params.conductivity || 0, 0, 1.5) : 0;
        const magneticMaterial = hasModule(spec, 'magnetic') ? clamp(params.magnetization || params.magneticStrength || 0, 0, 1.5) : 0;
        const glass = hasModule(spec, 'glass') ? clamp(1 - (params.opacity || 0), 0, 1) : 0;
        const atomic = hasModule(spec, 'atomic') ? clamp((params.atomicMass || 28) / 120, 0, 2) : 0;
        const bond = hasModule(spec, 'atomic') || hasModule(spec, 'cohesion') ? clamp(params.bondStrength || 0, 0, 1.5) : 0;
        const ionization = hasModule(spec, 'atomic') || hasModule(spec, 'plasma') ? clamp(params.ionization || 0, 0, 1.5) : 0;
        let motionSum = 0;
        for (let i = 0; i < state.particles.length; i += 1) {
          const p = state.particles[i];
          const cx = p.x - 0.5;
          const cy = p.y - 0.5;
          const radius = Math.max(0.03, Math.hypot(cx, cy));
          const tangentX = -cy / radius;
          const tangentY = cx / radius;
          const noise = hashNoise(Math.floor(state.t * 24), i) - 0.5;
          const phase = state.t * (1.8 + acoustic * 4.2) + p.phase * TAU;
          const waveForce = Math.sin(p.x * 10 + phase) * wave;
          const springForceX = -cx * spring * 0.42;
          const springForceY = -cy * spring * 0.42;
          const electricForce = charge / Math.max(0.08, radius * radius);
          const controlPull = control * (0.5 - radius) * 0.08;
          const queuePulse = queue * Math.sin(state.t * (1.2 + service) + p.phase * TAU) * 0.06;
          const terrainPush = terrain * (0.22 + erosion * 0.18);
          const biologyPush = biology * Math.sin(p.x * 7 + state.t * 0.9) * 0.035;
          const infectionPush = infection * Math.cos(p.y * 9 - state.t * 1.1) * 0.03;
          const cohesionPull = (cohesion + bond * 0.72 + atomic * 0.18) * (0.5 - radius) * 0.05;
          const refractionDrift = glass * Math.sin(p.y * 8 + state.t * 0.7) * 0.026;
          const fireLift = fire * (1 - water * 0.72 + Math.min(0, interactions.fire || 0) * 0.18) * 0.18;
          const materialInertia = 1 + solid * 0.44 + metal * 0.28 + atomic * 0.22;
          p.vx += (
            tangentX * (field + magneticMaterial * 0.46 + ionization * 0.22) * 0.18 +
            drive * (0.04 + market * 0.016 + solarRadiation * 0.018) +
            springForceX +
            cx * (electricForce + magneticMaterial * 0.14 + metal * 0.08) * 0.018 +
            wind * 0.22 +
            controlPull * cx +
            cohesionPull * cx +
            queuePulse +
            terrainPush +
            biologyPush +
            refractionDrift +
            noise * (swirl * 0.18 + thermal * 0.16 + signalNoise * 0.22 + fire * 0.16)
          ) * dt;
          p.vy += (
            tangentY * (field + magneticMaterial * 0.46 + ionization * 0.22) * 0.18 +
            (params.gravity || 0) * 0.34 -
            (buoyancy + water * 0.22) * 0.26 -
            fireLift +
            springForceY +
            waveForce * 0.16 +
            cy * (electricForce + magneticMaterial * 0.14 + metal * 0.08) * 0.014 +
            controlPull * cy +
            cohesionPull * cy -
            terrainPush * 0.34 +
            infectionPush +
            noise * (swirl * 0.12 + thermal * 0.12 + signalNoise * 0.18 + fire * 0.14)
          ) * dt;
          const granularDrag = granular && p.y > 0.63 ? 1 + granular * 2.8 : 1;
          const surfaceDrag = adhesion && (p.y > 0.78 || p.x < 0.12 || p.x > 0.88) ? 1 + adhesion * 2.2 : 1;
          const latencyDrag = 1 + latency * 0.24 + Math.max(0, queue - service * 0.5) * 0.28;
          const waterDrag = 1 + water * 0.55;
          p.vx *= 1 - damping * granularDrag * surfaceDrag * latencyDrag * waterDrag * materialInertia * dt * 2.4;
          p.vy *= 1 - damping * granularDrag * surfaceDrag * latencyDrag * waterDrag * materialInertia * dt * 2.4;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (restitution > 0) {
            if (p.x < 0.04 || p.x > 0.96) {
              p.x = clamp(p.x, 0.04, 0.96);
              p.vx *= -restitution;
            }
            if (p.y < 0.06 || p.y > 0.94) {
              p.y = clamp(p.y, 0.06, 0.94);
              p.vy *= -restitution;
            }
          } else {
            if (p.x < -0.04) p.x = 1.04;
            if (p.x > 1.04) p.x = -0.04;
            if (p.y < -0.04) p.y = 1.04;
            if (p.y > 1.04) p.y = -0.04;
          }
          motionSum += Math.hypot(p.vx, p.vy);
        }

        const machineLedger = state.machine ? energyLedger(state.machine) : null;
        const chemistryHeat = state.reaction ? maxField(state.reaction.heat) : 0;
        const fluidMotion = state.fluid ? state.fluid.vorticity : 0;
        state.t += dt;
        state.energy += (drive + solarRadiation * 0.42 + fire * 0.36 + market * (1 - elasticity * 0.22) + queue * 0.12) * dt * 10;
        state.motion = motionSum / Math.max(1, state.particles.length) +
          (machineLedger ? Math.abs(machineLedger.rpm) / 80 : 0) +
          fluidMotion +
          Math.max(0, interactions.motion || 0) * 0.04 +
          Math.max(0, operatorEffect.motion || 0) * 0.04;
        state.field = field + magneticMaterial * 0.34 + metal * 0.12 + control * 0.16 + signalNoise * 0.08 + latency * 0.05;
        state.matter = (state.fluid ? state.fluid.mixing : 0) +
          (state.reaction ? state.reaction.conversion : 0) +
          granular * 0.12 +
          buoyancy * 0.06 +
          biology * 0.1 +
          erosion * 0.07 +
          cohesion * 0.04 +
          solid * 0.05 +
          atomic * 0.04 +
          (interactions.matter || 0) * 0.08 +
          (operatorEffect.matter || 0) * 0.08;
        state.heat = chemistryHeat +
          (params.heatTransfer || 0) * 0.12 +
          thermal * 0.18 +
          fire * 0.28 +
          solarRadiation * 0.18 +
          metal * 0.05 +
          (interactions.heat || 0) * 0.08 +
          (operatorEffect.heat || 0) * 0.08 +
          (params.plasmaTemperature || 0) * 0.22 +
          latentHeat * Math.max(0, state.heat - phase * 0.1) +
          (machineLedger ? Math.max(0, machineLedger.actuatorPowerW) / 600 : 0);
        state.stability = clamp01(1 -
          Math.abs(state.field - drive) * 0.14 -
          swirl * 0.11 -
          chemistryHeat * 0.08 -
          thermal * 0.04 -
          fire * (0.12 - water * 0.05) -
          Math.abs(charge) * 0.04 -
          ionization * 0.05 -
          signalNoise * 0.07 -
          latency * 0.05 -
          Math.max(0, queue - service) * 0.1 -
          infection * 0.06 +
          control * 0.05 +
          solid * 0.03 +
          bond * 0.03 +
          (interactions.stability || 0) * 0.08 +
          (operatorEffect.stability || 0) * 0.08);
        return state;
      }

    function formatMetric(value, digits = 1) {
        if (!Number.isFinite(value)) return '0';
        return value.toFixed(digits);
      }

    function readoutValues(state, spec) {
        if (spec.templateId === 'blank-world') {
          return {
            modules: '0',
            objects: '0',
            forces: '0',
            sources: '0',
            sinks: '0',
            canvas: formatMetric(state.params.canvasScale, 2),
          };
        }
        if (spec.templateId === 'custom-world') {
          const usesContractReadouts = customSpecHasContractReadouts(spec);
          const channelReadouts = hasCompiledSpecArtifacts(spec) && !usesContractReadouts && state.solverState
            ? channelReadoutValues(state, spec)
            : null;
          if (channelReadouts) return channelReadouts;
          const generic = {
            energy: formatMetric(state.energy, 1),
            motion: formatMetric(state.motion * 100, 1),
            field: formatMetric(state.field, 2),
            matter: formatMetric(state.matter * 100, 0),
            heat: formatMetric(state.heat * 100, 0),
            stability: formatMetric(state.stability * 100, 0),
          };
          const labels = readoutLabelsForSpec(spec);
          return Object.fromEntries(labels.map((label) => [
            label,
            contextualReadoutValue(label, state, spec, generic),
          ]));
        }
        if (spec.templateId === 'fluid-vortex') {
          return {
            flow: formatMetric(state.params.inletFlow, 2),
            pressure: formatMetric(state.pressure, 1),
            vorticity: formatMetric(state.vorticity, 2),
            mixing: formatMetric(state.mixing * 100, 0),
            drag: formatMetric(state.dragLossJ, 1),
            age: formatMetric(state.t, 1),
          };
        }
        if (spec.templateId === 'reaction-diffusion') {
          const massB = state.conversion * state.size * state.size;
          return {
            conversion: formatMetric(state.conversion * 100, 1),
            heat: formatMetric(maxField(state.heat) * 100, 0),
            front: formatMetric(state.front * 1000, 2),
            'mass b': formatMetric(massB, 0),
            entropy: formatMetric(state.entropy, 3),
            time: formatMetric(state.t, 1),
          };
        }
        const ledger = energyLedger(state);
        return {
          rpm: formatMetric(ledger.rpm, 1),
          torque: formatMetric(ledger.torqueNm, 2),
          solar: formatMetric(ledger.solarPowerW, 0),
          load: formatMetric(ledger.loadPowerW, 1),
          actuator: formatMetric(ledger.actuatorPowerW, 1),
          balance: formatMetric(ledger.balanceErrorJ, 2),
        };
      }

    function maxField(field) {
        let max = 0;
        for (const value of field || []) max = Math.max(max, value);
        return max;
      }

    function readoutLabelsForSpec(spec) {
        if (spec.templateId === 'custom-world') {
          if (!hasCompiledSpecArtifacts(spec)) return templateById(spec.templateId).readouts;
          const contract = spec.contract || null;
          if (contract && Array.isArray(contract.readouts) && contract.readouts.length) {
            return contract.readouts.slice(0, 6);
          }
          const renderReadouts = spec.renderIR && Array.isArray(spec.renderIR.readouts)
            ? spec.renderIR.readouts
            : [];
          if (renderReadouts.length) {
            return renderReadouts.slice(0, 6).map((readout) => (
              String(readout.label || readout.channel || 'readout').replace(/([A-Z])/g, ' $1').trim()
            ));
          }
          return templateById(spec.templateId).readouts;
        }
        return templateById(spec.templateId).readouts;
      }

    function customSpecHasContractReadouts(spec) {
        const contract = spec.contract || null;
        return Boolean(contract && Array.isArray(contract.readouts) && contract.readouts.length);
      }

    function hasCompiledSpecArtifacts(spec) {
        const intentBrief = spec && spec.intent && spec.intent.intentBrief;
        return Boolean(
          intentBrief && intentBrief.schema &&
          (
            spec && spec.renderIR && spec.renderIR.schema ||
            spec && spec.universeGraph && spec.universeGraph.schema ||
            spec && spec.physicsIR && spec.physicsIR.schema
          )
        );
      }

    function channelReadoutValues(state, spec) {
        const bindings = spec.renderIR && Array.isArray(spec.renderIR.readouts)
          ? spec.renderIR.readouts
          : spec.physicsIR && Array.isArray(spec.physicsIR.readouts)
            ? spec.physicsIR.readouts
            : [];
        if (!bindings.length) return null;
        const channels = state.solverState && state.solverState.channels || {};
        const rows = bindings.slice(0, 6).map((binding) => {
          const label = String(binding.label || binding.channel || 'readout').replace(/([A-Z])/g, ' $1').trim();
          return [label, formatMetric(channelMagnitude(channels[binding.channel]), 2)];
        });
        if (!rows.length) return null;
        return Object.fromEntries(rows);
      }

    function contextualReadoutValue(label, state, spec, generic) {
        const params = spec.params || {};
        const ledger = state.machine ? energyLedger(state.machine) : null;
        switch (label) {
          case 'fuel load':
            return formatMetric((params.combustibility || 0) * (1 - (params.moisture || 0) * 0.35) * 100, 0);
          case 'burn front':
            return formatMetric((state.heat + state.motion * 0.08) * 100, 0);
          case 'smoke':
            return formatMetric(((params.opacity || 0) * 0.5 + state.heat * 0.3) * 100, 0);
          case 'moisture':
            return formatMetric((params.moisture || 0) * 100, 0);
          case 'wind':
            return formatMetric(Math.abs(params.windSpeed || params.flowRate || 0) * 100, 0);
          case 'containment':
            return formatMetric(state.stability * 100, 0);
          case 'water flow':
            return formatMetric((params.flowRate || params.inletFlow || 0) * 100, 0);
          case 'erosion rate':
            return formatMetric((params.erosionRate || 0) * 100, 0);
          case 'sediment':
            return formatMetric(state.matter * 100, 0);
          case 'slope':
            return formatMetric(Math.abs(params.terrainSlope || params.gravity || 0) * 100, 0);
          case 'terrain loss':
            return formatMetric((state.matter * (params.erosionRate || 0.1)) * 100, 0);
          case 'light':
            return formatMetric((params.lightIntensity || 0) * 100, 0);
          case 'refraction':
            return formatMetric(params.refractiveIndex || 1, 2);
          case 'beam split':
            return formatMetric((state.field + (params.lightIntensity || 0) * 0.2) * 100, 0);
          case 'focus':
            return formatMetric(state.stability * 100, 0);
          case 'grid load':
            return formatMetric((state.energy * 0.12 + (params.marketDemand || 0) * 60) % 100, 0);
          case 'queue backlog':
            return formatMetric((params.queueBacklog || 0) * 100, 0);
          case 'throughput':
            return formatMetric((params.serviceRate || 0) * (1 - (params.queueBacklog || 0) * 0.4) * 100, 0);
          case 'delay':
            return formatMetric((params.networkLatency || params.signalDelay || 0) * 100, 0);
          case 'demand':
            return formatMetric((params.marketDemand || 0) * 100, 0);
          case 'source':
            return formatMetric((params.energyInput || params.irradiance / 1200 || 0) * 100, 0);
          case 'loss':
            return formatMetric((1 - state.stability + state.heat * 0.05) * 100, 0);
          case 'balance':
            return ledger ? formatMetric(ledger.balanceErrorJ, 2) : generic.stability;
          case 'rpm':
            return ledger ? formatMetric(ledger.rpm, 1) : generic.motion;
          case 'timing':
            return formatMetric((params.driveTiming || params.signalDelay || 0) * 100, 0);
          default:
            return generic[label] || '0';
        }
      }

    Object.assign(scope, {
      createReactionState,
      laplace,
      stepReactionState,
      createBlankState,
      stepBlankState,
      hasModule,
      isMagneticMachine,
      createCustomParticles,
      createComponentStates,
      stepComponentStates,
      componentStatesFromSolverState,
      componentStateForEntity,
      particlesFromSolverState,
      deriveSolverSummary,
      channelVector,
      channelMagnitude,
      cloneChannelValue,
      createCustomState,
      stepCustomState,
      formatMetric,
      readoutValues,
      maxField,
      readoutLabelsForSpec,
      customSpecHasContractReadouts,
      hasCompiledSpecArtifacts,
      channelReadoutValues,
      contextualReadoutValue,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
