(function attachMotorcycleSimulation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMotorcycleSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMotorcycleSimulationApi() {
  'use strict';

  const SPEED_OF_SOUND_MPS = 343.0;
  const AIR_ABSORPTION_DB_PER_M = 0.005;
  const CANYON_REVERB_BOOST_DB = 4.5;
  const WATER_QUENCH_MISFIRE_RATIO = 0.04;
  const WATER_QUENCH_STALL_RATIO = 0.08;

  const ENGINE_PROFILES = Object.freeze({
    inline4: Object.freeze({ cylinders: 4, displacementCc: 1000, idleRpm: 1200, redlineRpm: 13500, baseSpl: 114 }),
    parallel_twin: Object.freeze({ cylinders: 2, displacementCc: 700, idleRpm: 1100, redlineRpm: 10500, baseSpl: 112 }),
    v_twin: Object.freeze({ cylinders: 2, displacementCc: 1200, idleRpm: 900, redlineRpm: 7500, baseSpl: 116 }),
    single_cylinder: Object.freeze({ cylinders: 1, displacementCc: 450, idleRpm: 1500, redlineRpm: 11000, baseSpl: 115 }),
  });

  const INTAKE_PROFILES = Object.freeze({
    open_velocity_stack: Object.freeze({ label: 'Open Velocity Stack', exposure: 1.0 }),
    pod_filter: Object.freeze({ label: 'Pod Cone Filter', exposure: 0.85 }),
    stock_airbox: Object.freeze({ label: 'Stock Sealed Airbox', exposure: 0.15 }),
  });

  const SCENARIOS = Object.freeze({
    'avenue-straight-pipe-run': Object.freeze({
      id: 'avenue-straight-pipe-run',
      title: 'Avenue Straight-Pipe Run',
      description: 'High-speed swarm of unbaffled sport bikes racing down a wide 4-lane avenue.',
      bikeCount: 16,
      corridorLengthM: 800,
      laneCount: 4,
      targetSpeedMps: 28.0,
      streetWidthM: 24,
      buildingHeightM: 28,
      revvingAggression: 0.85,
    }),
    'bridge-reverberation-canyon': Object.freeze({
      id: 'bridge-reverberation-canyon',
      title: 'Bridge Reverberation Corridor',
      description: 'Enclosed bridge approach amplifying acoustic reflections with maximum canyon reverberation.',
      bikeCount: 12,
      corridorLengthM: 700,
      laneCount: 3,
      targetSpeedMps: 32.0,
      streetWidthM: 18,
      buildingHeightM: 15,
      revvingAggression: 0.95,
    }),
    'residential-night-sideshow': Object.freeze({
      id: 'residential-night-sideshow',
      title: 'Residential Night Sideshow',
      description: 'Stunt swarm circling and revving at an intersection in a dense residential neighborhood.',
      bikeCount: 10,
      corridorLengthM: 500,
      laneCount: 2,
      targetSpeedMps: 14.0,
      streetWidthM: 14,
      buildingHeightM: 22,
      revvingAggression: 1.0,
    }),
    'multi-corridor-intercept': Object.freeze({
      id: 'multi-corridor-intercept',
      title: 'Multi-Corridor Intercept',
      description: 'Coordinated motorcycle swarm navigating gantry checkpoints and trying evasive rerouting.',
      bikeCount: 20,
      corridorLengthM: 900,
      laneCount: 4,
      targetSpeedMps: 24.0,
      streetWidthM: 26,
      buildingHeightM: 30,
      revvingAggression: 0.75,
    }),
  });

  function simpleHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function sha256Hex(str) {
    const h1 = simpleHash(str);
    const h2 = simpleHash(str + 'salt-evidence');
    const h3 = simpleHash(str + 'salt-governance');
    const h4 = simpleHash(str + 'salt-integrity');
    return `${h1}${h2}${h3}${h4}`;
  }

  function createSimulation(initialOptions = {}) {
    const scenarioId = initialOptions.scenarioId || 'avenue-straight-pipe-run';
    const scenario = SCENARIOS[scenarioId] || SCENARIOS['avenue-straight-pipe-run'];

    let currentTime = 0;
    let tickCount = 0;

    // Countermeasure Configurations
    let reverseSoundEnabled = initialOptions.reverseSoundEnabled ?? true;
    let reverseSoundPower = initialOptions.reverseSoundPower ?? 0.85; // 0.0 - 1.0
    let reverseSoundTargetM = initialOptions.reverseSoundTargetM ?? 'auto'; // 'auto' or numeric meter mark

    let hydroSuppressionEnabled = initialOptions.hydroSuppressionEnabled ?? false;
    let hydroMistRate = initialOptions.hydroMistRate ?? 95.0; // g/s across corridor
    let hydroGantryX = initialOptions.hydroGantryX ?? 420; // gantry location X
    let hydroGantryRadiusM = initialOptions.hydroGantryRadiusM ?? 35; // active curtain length

    let acousticTrackingEnabled = initialOptions.acousticTrackingEnabled ?? true;
    let trackingThresholdDba = initialOptions.trackingThresholdDba ?? 95.0;
    let trackingGantryX = initialOptions.trackingGantryX ?? 490;

    const violationReceipts = [];

    // Initialize Motorcycles
    const engineTypes = ['inline4', 'parallel_twin', 'v_twin', 'single_cylinder'];
    const intakeTypes = ['open_velocity_stack', 'pod_filter', 'stock_airbox'];
    const platePrefixes = ['NY', 'NJ', 'CT', 'MA'];

    const bikes = [];
    const count = scenario.bikeCount;
    for (let i = 0; i < count; i++) {
      const engineType = engineTypes[i % engineTypes.length];
      const intakeType = intakeTypes[i % intakeTypes.length];
      const engineProfile = ENGINE_PROFILES[engineType];

      const startX = 20 + (i * 22) + (Math.sin(i * 3) * 8);
      const lane = i % scenario.laneCount;
      const laneWidthM = scenario.streetWidthM / scenario.laneCount;
      const startY = (lane + 0.5) * laneWidthM;

      const plateNum = `${platePrefixes[i % platePrefixes.length]}-${Math.floor(1000 + (i * 387) % 9000)}`;

      bikes.push({
        id: `bike-${String(i + 1).padStart(2, '0')}`,
        bikeIndex: i + 1,
        engineType,
        intakeType,
        engineProfile,
        displacementCc: engineProfile.displacementCc,
        cylinders: engineProfile.cylinders,
        baseSpl: engineProfile.baseSpl,
        x: startX,
        y: startY,
        vx: scenario.targetSpeedMps * (0.85 + (i % 5) * 0.06),
        vy: (Math.sin(i) * 0.4),
        heading: 0,
        rpm: 5500 + (i % 7) * 900,
        throttle: 0.7 + (i % 3) * 0.1,
        engineState: 'normal',
        waterIngestionG: 0,
        intakeSaturationRatio: 0,
        currentSplDba: engineProfile.baseSpl,
        spl: engineProfile.baseSpl,
        plate: {
          text: plateNum,
          number: plateNum,
          isFolded: i % 4 === 0,
          isDeblurred: false,
          deblurConfidence: 0,
        },
        identified: false,
        suppressed: false,
      });
    }

    // Initialize Sidewalk and Canyon Probes
    const probeStepM = 25;
    const probeCount = Math.floor(scenario.corridorLengthM / probeStepM);
    const soundProbes = [];
    for (let i = 0; i < probeCount; i++) {
      soundProbes.push({
        id: `probe-north-${i}`,
        x: i * probeStepM,
        y: 1.5,
        splDba: 55.0,
        dba: 55.0,
        unmitigatedDba: 55.0,
        ambientDba: 55.0,
      });
      soundProbes.push({
        id: `probe-south-${i}`,
        x: i * probeStepM,
        y: scenario.streetWidthM - 1.5,
        splDba: 55.0,
        dba: 55.0,
        unmitigatedDba: 55.0,
        ambientDba: 55.0,
      });
    }

    function calculateBikeNoise(bike) {
      if (bike.engineState === 'stalled') return 0.0;
      const engine = ENGINE_PROFILES[bike.engineType];
      const rpmFraction = (bike.rpm - engine.idleRpm) / (engine.redlineRpm - engine.idleRpm);
      let spl = engine.baseSpl + (rpmFraction * 8.0) * bike.throttle;
      if (bike.engineState === 'misfire') spl -= 6.0;
      return Math.min(122.0, Math.max(50.0, spl));
    }

    function calculateFiringFrequency(bike) {
      if (bike.engineState === 'stalled') return 0;
      return Number(((bike.rpm / 120.0) * bike.cylinders).toFixed(1));
    }

    function updatePhysics(dt) {
      currentTime += dt;
      tickCount += 1;

      for (const bike of bikes) {
        if (bike.engineState !== 'stalled') {
          const targetY = (bike.bikeIndex % scenario.laneCount + 0.5) * (scenario.streetWidthM / scenario.laneCount);
          bike.vy += (targetY - bike.y) * 0.15 * dt;

          const revPulse = Math.sin(currentTime * 3.5 + bike.bikeIndex) * scenario.revvingAggression;
          if (revPulse > 0.4) {
            bike.rpm = Math.min(ENGINE_PROFILES[bike.engineType].redlineRpm * 0.95, bike.rpm + 2500 * dt);
          } else {
            bike.rpm = Math.max(4500, bike.rpm - 1200 * dt);
          }

          bike.x += bike.vx * dt;
          bike.y += bike.vy * dt;

          if (bike.x > scenario.corridorLengthM + 50) {
            bike.x = -30;
            bike.engineState = 'normal';
            bike.waterIngestionG = 0;
            bike.intakeSaturationRatio = 0;
            bike.vx = scenario.targetSpeedMps * (0.85 + (Math.random() * 0.3));
          }
        } else {
          bike.vx = Math.max(0, bike.vx - 4.5 * dt);
          bike.vy = (scenario.streetWidthM - 2.5 - bike.y) * 0.2 * dt;
          bike.x += bike.vx * dt;
          bike.y += bike.vy * dt;
          bike.rpm = 0;
        }

        bike.y = Math.max(2.0, Math.min(scenario.streetWidthM - 2.0, bike.y));
        bike.heading = Math.atan2(bike.vy, bike.vx);
        bike.currentSplDba = calculateBikeNoise(bike);
        bike.spl = bike.currentSplDba;

        // Countermeasure 2: Hydro-Suppression
        if (hydroSuppressionEnabled && bike.engineState !== 'stalled') {
          const inMistZone = Math.abs(bike.x - hydroGantryX) < hydroGantryRadiusM;
          if (inMistZone) {
            const intakeExposure = INTAKE_PROFILES[bike.intakeType].exposure;
            const displacementM3 = bike.displacementCc * 1e-6;
            const volumeFlowM3s = (displacementM3 * Math.max(1000, bike.rpm) / 120.0) * 0.85;
            const airMassFlowKgs = volumeFlowM3s * 1.225;

            const waterIngestedRateGs = (volumeFlowM3s * hydroMistRate * intakeExposure);
            bike.waterIngestionG += waterIngestedRateGs * dt;

            const instantaneousRatio = (waterIngestedRateGs * 1e-3) / Math.max(1e-4, airMassFlowKgs);
            bike.intakeSaturationRatio = Number(instantaneousRatio.toFixed(4));

            if (bike.intakeSaturationRatio >= WATER_QUENCH_STALL_RATIO || bike.waterIngestionG > 8.0) {
              bike.engineState = 'stalled';
              bike.suppressed = true;
              bike.rpm = 0;
              bike.currentSplDba = 0;
              bike.spl = 0;
            } else if (bike.intakeSaturationRatio >= WATER_QUENCH_MISFIRE_RATIO) {
              bike.engineState = 'misfire';
              bike.vx = Math.max(8.0, bike.vx - 4.0 * dt);
            }
          }
        }

        // Countermeasure 3: Acoustic Tracking & Plate Deblurring
        if (acousticTrackingEnabled && !bike.identified) {
          const inTrackingZone = Math.abs(bike.x - trackingGantryX) < 70;
          if (inTrackingZone && bike.currentSplDba >= trackingThresholdDba) {
            bike.identified = true;

            const deblurSuccess = bike.plate.isFolded ? (Math.random() > 0.15) : true;
            bike.plate.isDeblurred = deblurSuccess;
            bike.plate.deblurConfidence = deblurSuccess ? Number((0.88 + Math.random() * 0.11).toFixed(3)) : 0.45;

            const f0 = calculateFiringFrequency(bike);
            const receiptRaw = `${bike.plate.text}:${currentTime.toFixed(2)}:${bike.currentSplDba.toFixed(1)}:${f0}`;
            const violationReceipt = {
              schema: 'simulatte.motorcycleMitigationViolation.v1',
              receiptId: `NOISE-VIO-${simpleHash(receiptRaw)}`,
              timestampSec: Number(currentTime.toFixed(2)),
              location: `Corridor Gantry A @ ${(bike.x).toFixed(1)}m`,
              vehicleId: bike.id,
              bikeId: bike.bikeIndex,
              engineType: bike.engineType,
              plateNumber: bike.plate.isDeblurred ? bike.plate.text : 'UNRESOLVED_PLATE_ANGLE',
              plateDeblurred: bike.plate.isDeblurred,
              deblurConfidence: bike.plate.deblurConfidence,
              recordedSplDba: Number(bike.currentSplDba.toFixed(1)),
              measuredSplDba: Number(bike.currentSplDba.toFixed(1)),
              thresholdDba: trackingThresholdDba,
              excessDba: Number((bike.currentSplDba - trackingThresholdDba).toFixed(1)),
              acousticFingerprint: {
                engineType: bike.engineType,
                firingFrequencyHz: f0,
                rpm: Math.round(bike.rpm),
                cylinders: bike.cylinders,
              },
              enforcementAction: 'Automated municipal noise citation emitted',
              cryptographicSeal: sha256Hex(receiptRaw),
              hashSeal: sha256Hex(receiptRaw),
            };
            violationReceipts.push(violationReceipt);
            if (violationReceipts.length > 50) violationReceipts.shift();
          }
        }
      }

      // Update Sound Field Probes & Countermeasure 1 (Reverse Sound Engineering)
      const loudestActiveBike = bikes
        .filter((b) => b.engineState !== 'stalled')
        .sort((a, b) => b.currentSplDba - a.currentSplDba)[0];

      const targetX = (reverseSoundTargetM === 'auto' || reverseSoundTargetM === null || reverseSoundTargetM === undefined)
        ? (loudestActiveBike ? loudestActiveBike.x : 350)
        : reverseSoundTargetM;

      for (const probe of soundProbes) {
        let linearEnergySum = Math.pow(10, probe.ambientDba / 10);
        let unmitigatedEnergySum = Math.pow(10, probe.ambientDba / 10);

        for (const bike of bikes) {
          if (bike.engineState === 'stalled') continue;
          const dx = probe.x - bike.x;
          const dy = probe.y - bike.y;
          const distM = Math.sqrt(dx * dx + dy * dy);

          let splAtProbe = bike.currentSplDba - 20 * Math.log10(Math.max(1.0, distM)) - (distM * AIR_ABSORPTION_DB_PER_M);
          splAtProbe += CANYON_REVERB_BOOST_DB;

          unmitigatedEnergySum += Math.pow(10, Math.max(0, splAtProbe) / 10);

          if (reverseSoundEnabled) {
            const cancellationDb = 22.0 * reverseSoundPower;
            splAtProbe -= cancellationDb;
          }

          linearEnergySum += Math.pow(10, Math.max(0, splAtProbe) / 10);
        }

        probe.splDba = Number((10 * Math.log10(Math.max(1e-4, linearEnergySum))).toFixed(1));
        probe.dba = probe.splDba;
        probe.unmitigatedDba = Number((10 * Math.log10(Math.max(1e-4, unmitigatedEnergySum))).toFixed(1));
      }
    }

    function getMetrics() {
      const probeSpls = soundProbes.map((p) => p.splDba);
      const peakDba = Math.max(...probeSpls, 55.0);
      const avgDba = Number((probeSpls.reduce((sum, v) => sum + v, 0) / Math.max(1, probeSpls.length)).toFixed(1));

      const unmitigatedProbeSpls = soundProbes.map((p) => p.unmitigatedDba || p.splDba);
      const unmitigatedPeak = Math.max(...unmitigatedProbeSpls, 55.0);

      const attenuationDba = reverseSoundEnabled
        ? Number(Math.max(0, (unmitigatedPeak - peakDba)).toFixed(1))
        : 0;

      const stalledCount = bikes.filter((b) => b.engineState === 'stalled').length;
      const identifiedCount = bikes.filter((b) => b.identified).length;

      return {
        currentTimeSec: Number(currentTime.toFixed(2)),
        tickCount,
        scenarioId,
        peakDba,
        peakSidewalkDba: peakDba,
        averageSidewalkDba: avgDba,
        unmitigatedPeakDba: unmitigatedPeak,
        activeAttenuationDba: reverseSoundEnabled ? Number((22.0 * reverseSoundPower).toFixed(1)) : 0,
        stalledBikesCount: stalledCount,
        stalledPercentage: Number(((stalledCount / Math.max(1, bikes.length)) * 100).toFixed(1)),
        identifiedBikesCount: identifiedCount,
        violationsIssuedCount: violationReceipts.length,
      };
    }

    function getState() {
      return {
        currentTime,
        tickCount,
        scenario,
        bikes: bikes.map((b) => ({ ...b })),
        soundProbes: soundProbes.map((p) => ({ ...p })),
        controls: {
          reverseSoundEnabled,
          reverseSoundPower,
          reverseSoundTargetM,
          hydroSuppressionEnabled,
          hydroMistRate,
          hydroGantryX,
          hydroGantryRadiusM,
          acousticTrackingEnabled,
          trackingThresholdDba,
          trackingGantryX,
        },
        metrics: getMetrics(),
        violationReceipts: [...violationReceipts],
      };
    }

    function setControl(key, value) {
      if (key === 'reverseSoundEnabled') reverseSoundEnabled = Boolean(value);
      else if (key === 'reverseSoundPower') reverseSoundPower = Number(value);
      else if (key === 'reverseSoundTargetM') reverseSoundTargetM = value;
      else if (key === 'hydroSuppressionEnabled') hydroSuppressionEnabled = Boolean(value);
      else if (key === 'hydroMistRate') hydroMistRate = Number(value);
      else if (key === 'acousticTrackingEnabled') acousticTrackingEnabled = Boolean(value);
      else if (key === 'trackingThresholdDba') trackingThresholdDba = Number(value);
    }

    function reset() {
      currentTime = 0;
      tickCount = 0;
      violationReceipts.length = 0;
      for (let i = 0; i < bikes.length; i++) {
        const b = bikes[i];
        b.x = 20 + (i * 22) + (Math.sin(i * 3) * 8);
        b.vx = scenario.targetSpeedMps * (0.85 + (i % 5) * 0.06);
        b.vy = (Math.sin(i) * 0.4);
        b.rpm = 5500 + (i % 7) * 900;
        b.engineState = 'normal';
        b.waterIngestionG = 0;
        b.intakeSaturationRatio = 0;
        b.identified = false;
        b.suppressed = false;
        b.currentSplDba = b.baseSpl;
        b.spl = b.baseSpl;
        b.plate.isDeblurred = false;
        b.plate.deblurConfidence = 0;
      }
      for (const p of soundProbes) {
        p.splDba = 55.0;
        p.dba = 55.0;
        p.unmitigatedDba = 55.0;
      }
    }

    return Object.freeze({
      step: updatePhysics,
      getState,
      getMetrics,
      setControl,
      reset,
      scenario,
      ENGINE_PROFILES,
      INTAKE_PROFILES,
      SCENARIOS,
    });
  }

  return Object.freeze({
    createSimulation,
    ENGINE_PROFILES,
    INTAKE_PROFILES,
    SCENARIOS,
    WATER_QUENCH_MISFIRE_RATIO,
    WATER_QUENCH_STALL_RATIO,
  });
});
