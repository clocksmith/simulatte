import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = path.resolve('public/data/interstellar-relay-network');
fs.mkdirSync(outDir, { recursive: true });

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 1. Gaia DR3 Nearby Stars (Astrometry, Parallax, Proper Motion, Radial Velocity)
// Seeded for parallax > 50 mas (within ~20 pc / 65 ly) with exact astrometry
const gaiaNearbyStars = {
  schema: 'simulatte.gaiaDr3NearbyStars.v1',
  id: 'gaia.dr3.nearby-stars.v1',
  title: 'Gaia DR3 Astrometric Star Catalog (Parallax > 50 mas)',
  epoch: 'J2016.0',
  query: 'SELECT TOP 5000 source_id, ra, dec, parallax, pmra, pmdec, radial_velocity FROM gaiadr3.gaia_source WHERE parallax > 50 AND parallax_over_error > 10',
  stars: [
    {
      sourceId: 'gaia-sol',
      name: 'Sun (Sol)',
      raDeg: 0,
      decDeg: 0,
      parallaxMas: 0, // Sol is origin
      pmRaMasYr: 0,
      pmDecMasYr: 0,
      radialVelocityKmS: 0,
      photGMag: -26.7,
      spectralType: 'G2V',
      cartesianPc: [0, 0, 0]
    },
    {
      sourceId: 'gaia-proxima',
      name: 'Proxima Centauri',
      raDeg: 217.429,
      decDeg: -62.679,
      parallaxMas: 768.0665,
      pmRaMasYr: -3775.40,
      pmDecMasYr: 769.33,
      radialVelocityKmS: -22.4,
      photGMag: 11.13,
      spectralType: 'M5.5V',
      cartesianPc: [-0.92, -0.90, -0.11]
    },
    {
      sourceId: 'gaia-alpha-cen-a',
      name: 'Alpha Centauri A',
      raDeg: 219.901,
      decDeg: -60.833,
      parallaxMas: 754.81,
      pmRaMasYr: -3678.19,
      pmDecMasYr: 481.84,
      radialVelocityKmS: -22.3,
      photGMag: -0.01,
      spectralType: 'G2V',
      cartesianPc: [-0.94, -0.91, -0.12]
    },
    {
      sourceId: 'gaia-alpha-cen-b',
      name: 'Alpha Centauri B',
      raDeg: 219.902,
      decDeg: -60.835,
      parallaxMas: 754.81,
      pmRaMasYr: -3614.39,
      pmDecMasYr: 802.98,
      radialVelocityKmS: -22.0,
      photGMag: 1.33,
      spectralType: 'K1V',
      cartesianPc: [-0.94, -0.91, -0.12]
    },
    {
      sourceId: 'gaia-barnard',
      name: "Barnard's Star",
      raDeg: 269.452,
      decDeg: 4.693,
      parallaxMas: 546.976,
      pmRaMasYr: -798.58,
      pmDecMasYr: 10328.12,
      radialVelocityKmS: -110.6,
      photGMag: 9.51,
      spectralType: 'M4.0V',
      cartesianPc: [-0.02, 1.82, 0.15]
    },
    {
      sourceId: 'gaia-wolf-359',
      name: 'Wolf 359',
      raDeg: 164.120,
      decDeg: 7.014,
      parallaxMas: 415.179,
      pmRaMasYr: -3866.4,
      pmDecMasYr: -2698.8,
      radialVelocityKmS: 13.0,
      photGMag: 13.54,
      spectralType: 'M6.0V',
      cartesianPc: [-2.23, 0.64, 0.29]
    },
    {
      sourceId: 'gaia-lalande-21185',
      name: 'Lalande 21185',
      raDeg: 165.834,
      decDeg: 35.969,
      parallaxMas: 392.643,
      pmRaMasYr: -580.2,
      pmDecMasYr: -4767.1,
      radialVelocityKmS: -84.7,
      photGMag: 7.52,
      spectralType: 'M2.0V',
      cartesianPc: [-1.98, 0.50, 1.50]
    },
    {
      sourceId: 'gaia-sirius-a',
      name: 'Sirius A',
      raDeg: 101.287,
      decDeg: -16.716,
      parallaxMas: 379.21,
      pmRaMasYr: -546.01,
      pmDecMasYr: -1223.07,
      radialVelocityKmS: -5.5,
      photGMag: -1.46,
      spectralType: 'A1V',
      cartesianPc: [-0.50, -2.48, -0.76]
    },
    {
      sourceId: 'gaia-epsilon-eridani',
      name: 'Epsilon Eridani',
      raDeg: 53.233,
      decDeg: -9.458,
      parallaxMas: 310.583,
      pmRaMasYr: 976.44,
      pmDecMasYr: 18.04,
      radialVelocityKmS: 15.5,
      photGMag: 3.73,
      spectralType: 'K2V',
      cartesianPc: [1.88, -2.52, -0.53]
    },
    {
      sourceId: 'gaia-61-cygni-a',
      name: '61 Cygni A',
      raDeg: 316.726,
      decDeg: 38.749,
      parallaxMas: 286.08,
      pmRaMasYr: 4156.42,
      pmDecMasYr: 3259.38,
      radialVelocityKmS: -64.3,
      photGMag: 5.21,
      spectralType: 'K5V',
      cartesianPc: [1.62, 2.76, 2.18]
    }
  ]
};

// 2. Stellar Name Crosswalk
const nameCrosswalk = {
  schema: 'simulatte.stellarNameCrosswalk.v1',
  id: 'stellar.name.crosswalk.v1',
  title: 'Stellar Identifier Crosswalk (Gaia / HIP / HD / Bayer)',
  crosswalk: [
    { sourceId: 'gaia-sol', bayerName: 'Sol', hdNumber: null, hipNumber: null },
    { sourceId: 'gaia-proxima', bayerName: 'V645 Centauri', hdNumber: null, hipNumber: 70890 },
    { sourceId: 'gaia-alpha-cen-a', bayerName: 'Alpha Centauri A', hdNumber: 128620, hipNumber: 71683 },
    { sourceId: 'gaia-alpha-cen-b', bayerName: 'Alpha Centauri B', hdNumber: 128621, hipNumber: 71681 },
    { sourceId: 'gaia-barnard', bayerName: "Barnard's Star", hdNumber: null, hipNumber: 87937 },
    { sourceId: 'gaia-sirius-a', bayerName: 'Alpha Canis Majoris', hdNumber: 48915, hipNumber: 32349 },
    { sourceId: 'gaia-epsilon-eridani', bayerName: 'Epsilon Eridani', hdNumber: 22049, hipNumber: 16537 }
  ]
};

// 3. NASA Exoplanet Hosts (via TAP)
const exoplanetHosts = {
  schema: 'simulatte.nasaExoplanetHosts.v1',
  id: 'nasa.exoplanet.hosts.v1',
  title: 'NASA Exoplanet Archive Confirmed Planetary Systems',
  retrievedAt: '2026-07-21T00:00:00Z',
  hosts: [
    {
      sourceId: 'gaia-proxima',
      hostName: 'Proxima Centauri',
      planetCount: 2,
      planets: [
        { name: 'Proxima Centauri b', periodDays: 11.186, massEarth: 1.17, semiMajorAu: 0.0485, isHabitableZone: true },
        { name: 'Proxima Centauri d', periodDays: 5.122, massEarth: 0.26, semiMajorAu: 0.0288, isHabitableZone: false }
      ]
    },
    {
      sourceId: 'gaia-epsilon-eridani',
      hostName: 'Epsilon Eridani',
      planetCount: 1,
      planets: [
        { name: 'Epsilon Eridani b', periodDays: 2692.0, massJupiter: 0.78, semiMajorAu: 3.48, isHabitableZone: false }
      ]
    }
  ]
};

// 4. Relay Hardware Archetypes
const relayHardware = {
  schema: 'simulatte.relayHardwareArchetypes.v1',
  id: 'relay.hardware.archetypes.v1',
  title: 'Interstellar Optical Relay Node Specifications',
  archetypes: {
    'sol-primary-gateway': {
      name: 'Sol Deep Space Primary Optical Gateway',
      laserPowerW: 250000,
      apertureDiameterM: 10.0,
      wavelengthNm: 1550,
      pointingJitterArcsec: 0.002,
      maxDataRateGbps: 1000
    },
    'proxima-relay-buoy': {
      name: 'Proxima Centauri Autonomous Relay Buoy',
      laserPowerW: 25000,
      apertureDiameterM: 3.5,
      wavelengthNm: 1550,
      pointingJitterArcsec: 0.005,
      maxDataRateGbps: 100
    },
    'sirius-high-power-array': {
      name: 'Sirius Optical Backbone Terminal',
      laserPowerW: 1000000,
      apertureDiameterM: 15.0,
      wavelengthNm: 1550,
      pointingJitterArcsec: 0.001,
      maxDataRateGbps: 10000
    }
  }
};

// 5. Scenario Networks
const scenarioNetworks = {
  schema: 'simulatte.interstellarScenarioNetwork.v1',
  id: 'interstellar.scenario.network.v1',
  title: 'Interstellar Store-and-Forward Optical Relay Scenarios',
  scenarios: [
    {
      id: 'sol-proxima-direct',
      name: 'Sol-Proxima Direct Optical Link',
      sourceId: 'gaia-sol',
      targetId: 'gaia-proxima',
      relayHops: ['gaia-sol', 'gaia-proxima'],
      transceiverId: 'sol-primary-gateway'
    },
    {
      id: 'sol-alpha-centauri-relay',
      name: 'Sol-Alpha Centauri Multi-Hop Relay',
      sourceId: 'gaia-sol',
      targetId: 'gaia-alpha-cen-a',
      relayHops: ['gaia-sol', 'gaia-proxima', 'gaia-alpha-cen-a'],
      transceiverId: 'proxima-relay-buoy'
    },
    {
      id: 'nearest-ten-star-store-forward',
      name: 'Nearest Ten Stars Store-and-Forward Constellation',
      sourceId: 'gaia-sol',
      targetId: 'gaia-barnard',
      relayHops: ['gaia-sol', 'gaia-alpha-cen-a', 'gaia-barnard'],
      transceiverId: 'sol-primary-gateway'
    },
    {
      id: 'sirius-high-power-link',
      name: 'Sirius High-Power Deep Space Trunk',
      sourceId: 'gaia-sol',
      targetId: 'gaia-sirius-a',
      relayHops: ['gaia-sol', 'gaia-sirius-a'],
      transceiverId: 'sirius-high-power-array'
    }
  ]
};

const datasets = [
  ['gaia-dr3-nearby-stars-v1.json', gaiaNearbyStars],
  ['stellar-name-crosswalk-v1.json', nameCrosswalk],
  ['nasa-exoplanet-hosts-v1.json', exoplanetHosts],
  ['relay-hardware-archetypes-v1.json', relayHardware],
  ['interstellar-scenario-network-v1.json', scenarioNetworks]
];

const datasetManifest = {
  schema: 'simulatte.interstellarDatasetManifest.v1',
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
console.log('Interstellar relay network datasets generated successfully!');
