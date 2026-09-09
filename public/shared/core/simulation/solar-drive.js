(function attachSolarDrive(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSolarDriveModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function solarDriveModel() {
  'use strict';
  const G = 9.80665;
  const RHO = 1.225;
  const WH = 3600;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const rad = (x) => x * Math.PI / 180;
  const NUMBER_BOUNDS = Object.freeze({
    stepS: [0.005, 0.1], durationS: [1, 86400], targetKph: [0, 130],
    irradiance: [0, 1200], ambient: [-20, 55], cloud: [0, 1], shade: [0, 1],
    sunElevation: [0, 90], tilt: [-45, 60], wind: [0, 25], grade: [-20, 20],
    panelArea: [0, 12], pvEfficiency: [0.05, 0.35], pvTempCoeff: [-0.01, 0],
    mpptEfficiency: [0.5, 1], panelKgM2: [0, 20], canopyCdA: [0, 0.5],
    riderKg: [0, 300], chassisKg: [5, 3000], wheelMassKg: [0, 100],
    wheelRadius: [0.08, 0.6], cdA: [0.05, 2], crr: [0, 0.05],
    motorRatedW: [50, 200000], torqueNm: [1, 2000], motorEffPeak: [0.5, 0.99],
    batteryWh: [0, 100000], batterySoc: [0, 1], batteryW: [0, 250000],
    batteryChargeW: [0, 150000], batteryEfficiency: [0.5, 1], batteryWhKg: [50, 300],
    flywheelMass: [0.1, 100], flywheelRadius: [0.05, 0.6], flywheelTip: [10, 300],
    flywheelMinFraction: [0.1, 0.9], flywheelInitialFraction: [0, 1],
    flywheelW: [0, 100000], flywheelEfficiency: [0.5, 1], housingKg: [0.5, 150],
    windageW: [0, 100], bearingW: [0, 100], auxW: [0, 3000],
    thermalCapacity: [100, 200000], cooling: [0.1, 500], throttleC: [60, 140], cutoffC: [80, 180],
  });

  function validate(p) {
    if (!p || typeof p !== 'object') throw new Error('solar_parameters_missing');
    const keys = new Set([...Object.keys(NUMBER_BOUNDS), 'vehicle', 'route', 'flywheel']);
    for (const key of Object.keys(p)) if (!keys.has(key)) throw new Error(`solar_parameter_unknown: ${key}`);
    for (const [key, [lo, hi]] of Object.entries(NUMBER_BOUNDS)) {
      if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) {
        throw new Error(`solar_parameter_invalid: ${key} must be ${lo}..${hi}`);
      }
    }
    if (!['bicycle', 'scooter', 'car'].includes(p.vehicle)) throw new Error('solar_vehicle_invalid');
    if (!['flat', 'rolling', 'commute'].includes(p.route)) throw new Error('solar_route_invalid');
    if (typeof p.flywheel !== 'boolean') throw new Error('solar_flywheel_switch_invalid');
    if (p.cutoffC <= p.throttleC) throw new Error('solar_thermal_limits_invalid');
    return p;
  }

  function properties(p) {
    const rotorMaxJ = p.flywheel ? 0.5 * p.flywheelMass * p.flywheelTip ** 2 : 0;
    const massKg = p.riderKg + p.chassisKg + p.wheelMassKg + p.panelArea * p.panelKgM2
      + p.batteryWh / p.batteryWhKg + (p.flywheel ? p.flywheelMass + p.housingKg : 0);
    return {
      massKg, effectiveMassKg: massKg + p.wheelMassKg,
      batteryMaxJ: p.batteryWh * WH, rotorMaxJ,
      rotorMinJ: rotorMaxJ * p.flywheelMinFraction ** 2,
      cdA: p.cdA + p.canopyCdA * p.panelArea,
    };
  }

  function solar(p, timeS) {
    const cloud = p.route === 'commute' ? clamp(p.cloud + 0.45 * Math.max(0, Math.sin(timeS / 37)), 0, 1) : p.cloud;
    const incidence = p.sunElevation === 0 ? 0 : 0.85 * Math.max(0, Math.sin(rad(p.sunElevation + p.tilt)))
      + 0.15 * (1 + Math.cos(rad(p.tilt))) / 2;
    const poa = p.irradiance * incidence * (1 - cloud) * (1 - p.shade);
    const panelC = p.ambient + 25 * poa / 800 / (1 + 0.08 * p.wind);
    const incidentW = poa * p.panelArea;
    const electricalW = incidentW * clamp(p.pvEfficiency * (1 + p.pvTempCoeff * (panelC - 25)), 0, 1);
    return { poa, panelC, incidentW, electricalW, busW: electricalW * p.mpptEfficiency, cloud };
  }

  function road(p, s) {
    const grade = p.grade + (p.route === 'rolling' ? 4 * Math.sin(s.distanceM * 2 * Math.PI / 800) : 0);
    const cycle = s.timeS % 100;
    const target = p.route === 'commute' && cycle >= 65 && cycle < 80 ? 0 : p.targetKph / 3.6;
    return { grade, angle: Math.atan(grade / 100), target };
  }

  function motorEfficiency(p, speed, force) {
    const speedFraction = clamp(speed / (p.vehicle === 'car' ? 30 : 12), 0, 1);
    const load = clamp(Math.abs(force) * p.wheelRadius / p.torqueNm, 0, 1);
    return clamp(p.motorEffPeak - 0.20 * (1 - speedFraction) ** 2
      - 0.10 * (1 - load) ** 2 - 0.035 * load ** 2, 0.45, p.motorEffPeak);
  }

  function initial(p) {
    validate(p);
    const q = properties(p);
    const s = {
      step: 0, timeS: 0, speedMs: 0, distanceM: 0, elevationM: 0,
      batteryJ: q.batteryMaxJ * p.batterySoc,
      flywheelJ: q.rotorMaxJ * p.flywheelInitialFraction ** 2,
      motorC: p.ambient, wheelAngle: 0, rotorAngle: 0,
      ledger: { incidentJ: 0, panelLossJ: 0, mpptLossJ: 0, auxiliaryJ: 0, parasiticJ: 0,
        storageLossJ: 0, motorLossJ: 0, rollingJ: 0, aeroJ: 0, frictionBrakeJ: 0,
        curtailedJ: 0, regenJ: 0, tractionJ: 0 },
      flows: { pvW: 0, driveW: 0, batteryW: 0, flywheelW: 0, regenW: 0, auxiliaryW: 0,
        curtailedW: 0, motorLossW: 0, reserveW: 0, unservedAuxW: 0 },
      status: 'ready', residualJ: 0,
    };
    s.initialJ = s.batteryJ + s.flywheelJ;
    return s;
  }

  function storedEnergy(p, s) {
    const q = properties(p);
    return s.batteryJ + s.flywheelJ + 0.5 * q.effectiveMassKg * s.speedMs ** 2 + q.massKg * G * s.elevationM;
  }

  function losses(s) {
    return Object.entries(s.ledger).reduce((sum, [key, value]) =>
      ['incidentJ', 'regenJ', 'tractionJ'].includes(key) ? sum : sum + value, 0);
  }

  function step(p, previous) {
    if (previous.timeS >= p.durationS - 1e-8) return previous;
    const dt = Math.min(p.stepS, p.durationS - previous.timeS);
    const q = properties(p);
    const s = { ...previous, ledger: { ...previous.ledger }, flows: {} };
    const l = s.ledger;
    const sun = solar(p, s.timeS);
    const terrain = road(p, s);
    const batteryBefore = s.batteryJ;
    const rotorBefore = s.flywheelJ;
    const speedFraction = q.rotorMaxJ > 0 ? Math.sqrt(s.flywheelJ / q.rotorMaxJ) : 0;
    const rotorDragJ = Math.min(s.flywheelJ, p.flywheel ? p.windageW * speedFraction ** 3 * dt : 0);
    s.flywheelJ -= rotorDragJ;
    l.parasiticJ += rotorDragJ;
    l.incidentJ += sun.incidentW * dt;
    l.panelLossJ += (sun.incidentW - sun.electricalW) * dt;
    l.mpptLossJ += (sun.electricalW - sun.busW) * dt;
    const solarBusJ = sun.busW * dt;
    const batBudget = Math.min(s.batteryJ * p.batteryEfficiency, p.batteryW * dt);
    const rotorBudget = Math.min(Math.max(0, s.flywheelJ - q.rotorMinJ) * p.flywheelEfficiency, p.flywheelW * dt);
    const auxRequestJ = (p.auxW + (p.flywheel ? p.bearingW : 0)) * dt;
    let auxJ = Math.min(auxRequestJ, solarBusJ + batBudget + rotorBudget);
    const availableBusJ = Math.max(0, solarBusJ + batBudget + rotorBudget - auxJ);
    const thermal = clamp((p.cutoffC - s.motorC) / (p.cutoffC - p.throttleC), 0, 1);
    const rollingForce = q.massKg * G * p.crr * Math.cos(terrain.angle);
    const gravityForce = q.massKg * G * Math.sin(terrain.angle);
    const aero = (v) => 0.5 * RHO * q.cdA * (v + p.wind) ** 2;
    const accelRequest = clamp((terrain.target - s.speedMs) / 0.85, -2.4, 1.2);
    const forceRequest = q.effectiveMassKg * accelRequest + rollingForce + gravityForce + aero(s.speedMs);
    const eta = motorEfficiency(p, s.speedMs, forceRequest);
    const brakingForce = Math.max(0, -forceRequest);
    const driveLimit = Math.min(Math.max(0, forceRequest), p.torqueNm / p.wheelRadius * thermal);
    const startV = s.speedMs;
    function forces(endV) {
      const mid = (startV + endV) / 2;
      const ds = mid * dt;
      const drive = Math.min(driveLimit, p.motorRatedW * thermal / Math.max(mid, 0.001),
        availableBusJ * eta / Math.max(ds, 1e-12));
      return { drive, resistance: rollingForce + gravityForce + aero(mid), ds, mid };
    }
    function equation(endV) {
      const f = forces(endV);
      return q.effectiveMassKg * (endV - startV) / dt - f.drive + brakingForce + f.resistance;
    }
    let endV = 0;
    let travel = 0;
    let f;
    if (equation(0) >= 0) {
      f = forces(0);
      const stoppingForce = brakingForce + f.resistance - f.drive;
      travel = startV > 0 && stoppingForce > 0 ? 0.5 * q.effectiveMassKg * startV ** 2 / stoppingForce : 0;
    } else {
      let lo = 0;
      let hi = startV + 8 * dt + 1;
      for (let i = 0; i < 42; i += 1) {
        const mid = (lo + hi) / 2;
        if (equation(mid) > 0) hi = mid; else lo = mid;
      }
      endV = (lo + hi) / 2;
      f = forces(endV);
      travel = f.ds;
    }
    const driveJ = f.drive * travel;
    const driveBusJ = driveJ / eta;
    const brakeJ = brakingForce * travel;
    const regenEta = eta * clamp(f.mid / 2, 0, 1);
    const regenCandidateJ = Math.min(brakeJ, p.torqueNm / p.wheelRadius * thermal * travel, p.motorRatedW * thermal * dt) * regenEta;
    auxJ = Math.min(auxRequestJ, solarBusJ + batBudget + rotorBudget + regenCandidateJ);
    const directRegenJ = Math.min(regenCandidateJ, Math.max(0, auxJ - solarBusJ));
    let deficit = Math.max(0, auxJ + driveBusJ - solarBusJ - directRegenJ);
    let batDraw = 0;
    let rotorDraw = Math.min(rotorBudget, Math.max(0, deficit - p.motorRatedW * 0.35 * dt));
    deficit -= rotorDraw;
    batDraw = Math.min(batBudget, deficit);
    deficit -= batDraw;
    rotorDraw += Math.min(rotorBudget - rotorDraw, deficit);
    s.batteryJ = Math.max(0, s.batteryJ - batDraw / p.batteryEfficiency);
    s.flywheelJ = Math.max(0, s.flywheelJ - rotorDraw / p.flywheelEfficiency);
    l.storageLossJ += batDraw * (1 / p.batteryEfficiency - 1) + rotorDraw * (1 / p.flywheelEfficiency - 1);
    let solarSurplus = Math.max(0, solarBusJ - auxJ - driveBusJ);
    let batCharge = 0;
    let rotorCharge = 0;
    const charge = (energy) => {
      let remaining = energy;
      // A store never charges and discharges in the same fixed step.
      if (batDraw === 0) {
        const into = Math.min(remaining, Math.max(0, p.batteryChargeW * dt - batCharge),
          Math.max(0, q.batteryMaxJ - s.batteryJ) / p.batteryEfficiency);
        s.batteryJ += into * p.batteryEfficiency;
        batCharge += into;
        l.storageLossJ += into * (1 - p.batteryEfficiency);
        remaining -= into;
      }
      if (rotorDraw === 0 && p.flywheel) {
        const into = Math.min(remaining, Math.max(0, p.flywheelW * dt - rotorCharge),
          Math.max(0, q.rotorMaxJ - s.flywheelJ) / p.flywheelEfficiency);
        s.flywheelJ += into * p.flywheelEfficiency;
        rotorCharge += into;
        l.storageLossJ += into * (1 - p.flywheelEfficiency);
        remaining -= into;
      }
      return remaining;
    };
    solarSurplus = charge(solarSurplus);
    const regenJ = regenCandidateJ - charge(regenCandidateJ - directRegenJ);
    const regenShaftJ = regenEta > 0 ? regenJ / regenEta : 0;
    const motorLossJ = driveBusJ - driveJ + regenShaftJ - regenJ;
    l.auxiliaryJ += auxJ;
    l.motorLossJ += motorLossJ;
    l.rollingJ += rollingForce * travel;
    l.aeroJ += aero(f.mid) * travel;
    l.frictionBrakeJ += Math.max(0, brakeJ - regenShaftJ);
    l.curtailedJ += solarSurplus;
    l.regenJ += regenJ;
    l.tractionJ += driveJ;
    s.speedMs = endV;
    s.distanceM += travel;
    s.elevationM += Math.sin(terrain.angle) * travel;
    s.step += 1;
    s.timeS = Math.min(p.durationS, s.step * p.stepS);
    s.wheelAngle += travel / p.wheelRadius;
    s.rotorAngle += (p.flywheel ? Math.sqrt(2 * s.flywheelJ / p.flywheelMass) / p.flywheelRadius : 0) * dt / 120;
    s.motorC += (motorLossJ - p.cooling * (s.motorC - p.ambient) * dt) / p.thermalCapacity;
    s.flows = {
      pvW: sun.busW, driveW: driveJ / dt, batteryW: (batDraw - batCharge) / dt,
      flywheelW: (rotorDraw - rotorCharge) / dt, regenW: regenJ / dt,
      auxiliaryW: auxJ / dt, curtailedW: solarSurplus / dt, motorLossW: motorLossJ / dt,
      reserveW: (s.batteryJ + s.flywheelJ - batteryBefore - rotorBefore) / dt,
      unservedAuxW: (auxRequestJ - auxJ) / dt,
    };
    s.status = s.timeS >= p.durationS - 1e-8 ? 'complete'
      : thermal === 0 ? 'thermal-limit'
        : s.speedMs < 0.05 && terrain.target > 0 && availableBusJ < 0.01 ? 'energy-depleted' : 'running';
    s.residualJ = s.initialJ + l.incidentJ - storedEnergy(p, s) - losses(s);
    return s;
  }

  function telemetry(p, s) {
    const q = properties(p);
    return {
      ...q, ...s.flows, ...solar(p, s.timeS), ...road(p, s),
      speedKph: s.speedMs * 3.6,
      batterySoc: q.batteryMaxJ ? s.batteryJ / q.batteryMaxJ : 0,
      flywheelFraction: q.rotorMaxJ ? Math.sqrt(s.flywheelJ / q.rotorMaxJ) : 0,
      flywheelUsableWh: Math.max(0, s.flywheelJ - q.rotorMinJ) / WH,
      rpm: p.flywheel ? Math.sqrt(2 * s.flywheelJ / p.flywheelMass) / p.flywheelRadius * 60 / (2 * Math.PI) : 0,
      heatWh: losses(s) / WH,
      energyErrorWh: s.residualJ / WH,
    };
  }

  function run(p, stepCount = Math.ceil(p.durationS / p.stepS)) {
    validate(p);
    if (!Number.isInteger(stepCount) || stepCount < 0 || stepCount > 1728000) throw new Error('solar_step_budget_invalid');
    let state = initial(p);
    for (let i = 0; i < stepCount; i += 1) state = step(p, state);
    return state;
  }
  return Object.freeze({ validate, properties, solar, road, initial, step, run, telemetry, storedEnergy, losses, NUMBER_BOUNDS });
});
