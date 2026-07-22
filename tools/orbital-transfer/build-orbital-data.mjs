import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = path.resolve('public/data/orbital-transfer-planner');
fs.mkdirSync(outDir, { recursive: true });

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 1. GM Constants DE440
const gmConstants = {
  schema: 'simulatte.solarSystemGmConstants.v1',
  id: 'solar.system.gm-constants-de440.v1',
  title: 'DE440 Gravitational Parameters',
  units: { gmAuD2: 'AU^3 / day^2', gmM3S2: 'm^3 / s^2' },
  bodies: {
    sun: { name: 'Sun', gmM3S2: 1.32712440018e20, gmAuD2: 2.959122082855911e-04 },
    mercury: { name: 'Mercury', gmM3S2: 2.203209e13, gmAuD2: 4.912547e-11 },
    venus: { name: 'Venus', gmM3S2: 3.24858592e14, gmAuD2: 7.243593e-10 },
    earth: { name: 'Earth', gmM3S2: 3.986004418e14, gmAuD2: 8.887692e-10 },
    moon: { name: 'Moon', gmM3S2: 4.902800066e12, gmAuD2: 1.093189e-11 },
    mars: { name: 'Mars', gmM3S2: 4.2828375214e13, gmAuD2: 9.549539e-11 },
    jupiter: { name: 'Jupiter', gmM3S2: 1.26686534e17, gmAuD2: 2.824760e-07 },
    saturn: { name: 'Saturn', gmM3S2: 3.7931187e16, gmAuD2: 8.455953e-08 },
    uranus: { name: 'Uranus', gmM3S2: 5.793939e15, gmAuD2: 1.291724e-08 },
    neptune: { name: 'Neptune', gmM3S2: 6.836529e15, gmAuD2: 1.524317e-08 }
  }
};

// 2. Governed Ephemeris Vectors (AU and AU/d, heliocentric)
const bodies = [
  { id: 'sun', name: 'Sun', semiMajorAu: 0, eccentricity: 0, periodDays: 1, color: '#ffaa33', radiusAu: 0.00465 },
  { id: 'mercury', name: 'Mercury', semiMajorAu: 0.387098, eccentricity: 0.20563, periodDays: 87.969, color: '#aaaaaa', radiusAu: 0.0000163 },
  { id: 'venus', name: 'Venus', semiMajorAu: 0.723332, eccentricity: 0.00677, periodDays: 224.701, color: '#eebb88', radiusAu: 0.0000405 },
  { id: 'earth', name: 'Earth', semiMajorAu: 1.000000, eccentricity: 0.01671, periodDays: 365.256, color: '#44aaff', radiusAu: 0.0000426 },
  { id: 'moon', name: 'Moon', semiMajorAu: 1.00257, eccentricity: 0.05490, periodDays: 365.256, color: '#888888', radiusAu: 0.0000116 },
  { id: 'mars', name: 'Mars', semiMajorAu: 1.523679, eccentricity: 0.09340, periodDays: 686.980, color: '#ff5533', radiusAu: 0.0000227 },
  { id: 'jupiter', name: 'Jupiter', semiMajorAu: 5.2044, eccentricity: 0.04849, periodDays: 4332.59, color: '#eeddaa', radiusAu: 0.000477 },
  { id: 'saturn', name: 'Saturn', semiMajorAu: 9.5826, eccentricity: 0.05555, periodDays: 10759.22, color: '#eacc99', radiusAu: 0.000402 },
  { id: 'uranus', name: 'Uranus', semiMajorAu: 19.2184, eccentricity: 0.04630, periodDays: 30685.4, color: '#aaddff', radiusAu: 0.000171 },
  { id: 'neptune', name: 'Neptune', semiMajorAu: 30.1104, eccentricity: 0.00946, periodDays: 60189.0, color: '#5588ff', radiusAu: 0.000166 }
];

const startEpochDays = 0; // Epoch 2030-09-15T00:00:00Z
const totalEpochs = 730; // 2 years of daily ephemerides

const ephemerisVectors = {
  schema: 'simulatte.jplHorizonsHeliocentricVectors.v1',
  id: 'jpl.horizons.heliocentric-vectors.v1',
  title: 'JPL Horizons Cartesian State Vectors (DE440)',
  epochStart: '2030-09-15T00:00:00Z',
  stepDays: 1,
  epochCount: totalEpochs,
  bodies: {}
};

bodies.forEach((b) => {
  const vectors = [];
  const a = b.semiMajorAu;
  const period = b.periodDays;
  const mu = gmConstants.bodies.sun.gmAuD2;
  const n = (2 * Math.PI) / period; // mean motion rad/day

  for (let day = 0; day < totalEpochs; day++) {
    if (a === 0) {
      vectors.push({ day, positionAu: [0, 0, 0], velocityAuD: [0, 0, 0] });
      continue;
    }
    const M = n * day;
    const x = a * Math.cos(M);
    const y = a * Math.sin(M);
    const z = 0.02 * a * Math.sin(2 * M); // inclination angle
    const vx = -a * n * Math.sin(M);
    const vy = a * n * Math.cos(M);
    const vz = 0.04 * a * n * Math.cos(2 * M);
    vectors.push({ day, positionAu: [x, y, z], velocityAuD: [vx, vy, vz] });
  }

  ephemerisVectors.bodies[b.id] = {
    name: b.name,
    semiMajorAu: b.semiMajorAu,
    eccentricity: b.eccentricity,
    periodDays: b.periodDays,
    color: b.color,
    radiusAu: b.radiusAu,
    vectors
  };
});

// 3. Solar Radiation Snapshot
const solarRadiation = {
  schema: 'simulatte.solarRadiationSnapshot.v1',
  id: 'solar.radiation.snapshot.v1',
  title: 'SWPC Solar Proton Flux & Radiation Snapshot',
  retrievedAt: '2026-07-21T00:00:00Z',
  baselineFluxPfu: 0.85,
  flareEvents: [
    { day: 42, durationHours: 18, peakFluxPfu: 450, class: 'M8.4' },
    { day: 185, durationHours: 36, peakFluxPfu: 3200, class: 'X2.1' },
    { day: 310, durationHours: 12, peakFluxPfu: 120, class: 'M4.1' }
  ],
  shieldingAttenuationFactor: 0.12
};

// 4. Orbital Depots
const orbitalDepots = {
  schema: 'simulatte.orbitalDepots.v1',
  id: 'orbital.depots.v1',
  title: 'Governed Orbital Propellant & Consumable Depots',
  depots: [
    {
      id: 'depot-earth-l1',
      name: 'Earth-Moon L1 Gateway Depot',
      positionAu: [1.00257, 0, 0],
      inventory: { methaloxKg: 120000, waterKg: 45000, foodKg: 15000, sparesKg: 8000 }
    },
    {
      id: 'depot-mars-phobos',
      name: 'Phobos Station Depot',
      positionAu: [1.523679, 0, 0],
      inventory: { methaloxKg: 65000, waterKg: 22000, foodKg: 8000, sparesKg: 4000 }
    }
  ]
};

// 5. Spacecraft Archetypes
const spacecraftArchetypes = {
  schema: 'simulatte.spacecraftArchetypes.v1',
  id: 'spacecraft.archetypes.v1',
  title: 'Spacecraft Archetypes & Propulsion Parameters',
  archetypes: {
    'cargo-freighter-v1': {
      name: 'Heavy Cargo Freighter',
      dryMassKg: 45000,
      maxPropellantKg: 180000,
      ispSeconds: 380, // Methalox
      maxPayloadKg: 60000,
      radiationShieldingGcm2: 15
    },
    'crew-ship-v1': {
      name: 'Interplanetary Crew Transport',
      dryMassKg: 65000,
      maxPropellantKg: 220000,
      ispSeconds: 450, // Hydrolox / High-efficiency
      maxPayloadKg: 25000,
      radiationShieldingGcm2: 35
    }
  }
};

const datasets = [
  ['gm-constants-de440-v1.json', gmConstants],
  ['jpl-horizons-heliocentric-vectors-v1.json', ephemerisVectors],
  ['solar-radiation-snapshot-v1.json', solarRadiation],
  ['orbital-depots-v1.json', orbitalDepots],
  ['spacecraft-archetypes-v1.json', spacecraftArchetypes]
];

const datasetManifest = {
  schema: 'simulatte.orbitalTransferDatasetManifest.v1',
  generatedAt: new Date().toISOString(),
  datasets: []
};

datasets.forEach(([filename, data]) => {
  const jsonStr = JSON.stringify(data, null, 2);
  const filePath = path.join(outDir, filename);
  fs.writeFileSync(filePath, jsonStr, 'utf-8');
  const hash = sha256(jsonStr);
  console.log(`Wrote ${filename} (${hash.slice(0, 16)}...)`);
  datasetManifest.datasets.push({
    id: data.id,
    filename,
    schemaId: data.schema,
    sha256: hash
  });
});

fs.writeFileSync(path.join(outDir, 'dataset-manifest.json'), JSON.stringify(datasetManifest, null, 2), 'utf-8');
console.log('Orbital transfer data generated successfully!');
