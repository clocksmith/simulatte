import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = path.resolve('public/data/interstellar-relay-network');
fs.mkdirSync(outDir, { recursive: true });

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 1. Gaia DR3 Nearby Stars (Cartesian Parsecs & Light Years)
const gaiaNeighborhood = {
  schema: 'simulatte.gaiaDr3StellarNeighborhood.v1',
  id: 'gaia.dr3.stellar-neighborhood.v1',
  title: 'Gaia DR3 Astrometric Neighborhood (20 Light Years)',
  epoch: 'J2016.0',
  stars: [
    { id: 'star-sun', name: 'Sun (Sol)', raDeg: 0, decDeg: 0, parallaxMas: 0, distPc: 0, posPc: [0, 0, 0], spectralClass: 'G2V', absMag: 4.83 },
    { id: 'star-alpha-centauri-a', name: 'Alpha Centauri A', raDeg: 219.90, decDeg: -60.83, parallaxMas: 754.81, distPc: 1.325, posPc: [-0.94, -0.91, -0.12], spectralClass: 'G2V', absMag: 4.38 },
    { id: 'star-proxima-centauri', name: 'Proxima Centauri', raDeg: 217.43, decDeg: -62.68, parallaxMas: 768.07, distPc: 1.302, posPc: [-0.92, -0.90, -0.11], spectralClass: 'M5.5V', absMag: 15.60 },
    { id: 'star-barnard', name: "Barnard's Star", raDeg: 269.45, decDeg: 4.69, parallaxMas: 546.98, distPc: 1.828, posPc: [-0.02, 1.82, 0.15], spectralClass: 'M4.0V', absMag: 13.25 },
    { id: 'star-wolf-359', name: 'Wolf 359', raDeg: 164.12, decDeg: 7.01, parallaxMas: 415.18, distPc: 2.409, posPc: [-2.23, 0.64, 0.29], spectralClass: 'M6.0V', absMag: 16.55 },
    { id: 'star-lalande-21185', name: 'Lalande 21185', raDeg: 165.83, decDeg: 35.97, parallaxMas: 392.64, distPc: 2.547, posPc: [-1.98, 0.50, 1.50], spectralClass: 'M2.0V', absMag: 10.44 },
    { id: 'star-sirius-a', name: 'Sirius A', raDeg: 101.28, decDeg: -16.72, parallaxMas: 379.21, distPc: 2.637, posPc: [-0.50, -2.48, -0.76], spectralClass: 'A1V', absMag: 1.42 },
    { id: 'star-epsilon-eridani', name: 'Epsilon Eridani', raDeg: 53.23, decDeg: -9.46, parallaxMas: 310.58, distPc: 3.219, posPc: [1.88, -2.52, -0.53], spectralClass: 'K2V', absMag: 6.19 }
  ]
};

// 2. Laser Transceiver Specifications
const transceivers = {
  schema: 'simulatte.laserRelayTransceivers.v1',
  id: 'laser.relay.transceivers.v1',
  title: 'Coherent Optical Deep Space Transceivers',
  transceivers: {
    'deep-space-node-v1': {
      name: 'Class-1 Deep Space Laser Gateway',
      laserPowerKw: 50,
      apertureDiameterM: 5.0,
      wavelengthNm: 1550,
      peakDataRateGbps: 100,
      pointingPrecisionArcsec: 0.005
    },
    'relay-probe-v1': {
      name: 'Interstellar Probe Laser Terminal',
      laserPowerKw: 5,
      apertureDiameterM: 1.5,
      wavelengthNm: 1550,
      peakDataRateGbps: 10,
      pointingPrecisionArcsec: 0.02
    }
  }
};

// 3. ISM Dust Attenuation
const dustAttenuation = {
  schema: 'simulatte.interstellarDustAttenuation.v1',
  id: 'interstellar.dust.attenuation.v1',
  title: 'Local Interstellar Cloud Dust & Electron Density',
  localCloudDensityAtomsCm3: 0.1,
  extinctionMagPerPc: 0.0002,
  dispersionMeasurePcCm3: 0.05
};

const datasets = [
  ['gaia-dr3-stellar-neighborhood-v1.json', gaiaNeighborhood],
  ['laser-relay-transceivers-v1.json', transceivers],
  ['interstellar-dust-attenuation-v1.json', dustAttenuation]
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
console.log('Interstellar relay network data generated successfully!');
