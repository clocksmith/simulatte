import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = path.resolve('public/data/maritime-trade-global');
fs.mkdirSync(outDir, { recursive: true });

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// 1. World Ports (NGA WPI Major Hubs)
const worldPorts = {
  schema: 'simulatte.worldPortsWpi.v1',
  id: 'world.ports.wpi.v1',
  title: 'NGA World Port Index Major Shipping Hubs',
  ports: [
    { id: 'port-singapore', name: 'Port of Singapore', wpiNumber: 49910, lat: 1.264, lon: 103.84, country: 'SG', berths: 67, maxDraftM: 16.0 },
    { id: 'port-shanghai', name: 'Port of Shanghai', wpiNumber: 62450, lat: 31.23, lon: 121.47, country: 'CN', berths: 125, maxDraftM: 15.5 },
    { id: 'port-rotterdam', name: 'Port of Rotterdam', wpiNumber: 10840, lat: 51.95, lon: 4.14, country: 'NL', berths: 84, maxDraftM: 24.0 },
    { id: 'port-los-angeles', name: 'Port of Los Angeles', wpiNumber: 56320, lat: 33.74, lon: -118.27, country: 'US', berths: 45, maxDraftM: 16.5 },
    { id: 'port-suez-north', name: 'Port Said (Suez North)', wpiNumber: 44920, lat: 31.26, lon: 32.30, country: 'EG', berths: 22, maxDraftM: 20.1 },
    { id: 'port-panama-colon', name: 'Port of Colón (Panama)', wpiNumber: 15480, lat: 9.36, lon: -79.90, country: 'PA', berths: 18, maxDraftM: 15.2 },
    { id: 'port-santos', name: 'Port of Santos', wpiNumber: 18690, lat: -23.96, lon: -46.30, country: 'BR', berths: 32, maxDraftM: 14.5 },
    { id: 'port-busan', name: 'Port of Busan', wpiNumber: 60110, lat: 35.10, lon: 129.04, country: 'KR', berths: 56, maxDraftM: 16.0 }
  ]
};

// 2. Maritime Vessel Classes
const vesselClasses = {
  schema: 'simulatte.maritimeVesselClasses.v1',
  id: 'maritime.vessel.classes.v1',
  title: 'Global Merchant Vessel Classes & Performance',
  classes: {
    'ultra-large-container-v1': {
      name: 'Ultra Large Container Vessel (ULCV)',
      teuCapacity: 24000,
      designSpeedKnots: 21.5,
      fuelConsTonsDay: 185,
      co2TonsPerNm: 0.042
    },
    'panamax-bulk-v1': {
      name: 'Panamax Dry Bulk Carrier',
      dwtTons: 75000,
      designSpeedKnots: 14.0,
      fuelConsTonsDay: 32,
      co2TonsPerNm: 0.028
    },
    'vlcc-tanker-v1': {
      name: 'Very Large Crude Carrier (VLCC)',
      dwtTons: 300000,
      designSpeedKnots: 15.5,
      fuelConsTonsDay: 80,
      co2TonsPerNm: 0.065
    }
  }
};

// 3. Ocean Chokepoints
const oceanChokepoints = {
  schema: 'simulatte.oceanChokepoints.v1',
  id: 'ocean.chokepoints.v1',
  title: 'Critical Strategic Maritime Passages',
  chokepoints: [
    { id: 'choke-suez', name: 'Suez Canal', lat: 30.5, lon: 32.3, maxDraftM: 20.1, dailyCapacityVessels: 106, feeUsdPerTeu: 95 },
    { id: 'choke-malacca', name: 'Strait of Malacca', lat: 2.5, lon: 101.5, minWidthNm: 1.5, dailyCapacityVessels: 250 },
    { id: 'choke-panama', name: 'Panama Canal (Neopanamax)', lat: 9.1, lon: -79.7, maxDraftM: 15.2, dailyCapacityVessels: 36, feeUsdPerTeu: 140 }
  ]
};

// 4. Shipping Lanes (Coordinates)
const shippingLanes = {
  schema: 'simulatte.shippingLaneRoutes.v1',
  id: 'shipping.lane.routes.v1',
  title: 'Major Intercontinental Maritime Trade Corridors',
  corridors: [
    {
      id: 'route-asia-europe',
      name: 'Asia-Europe Mainline',
      originPort: 'port-shanghai',
      destinationPort: 'port-rotterdam',
      distanceNm: 10500,
      waypoints: [
        [31.23, 121.47], [22.3, 114.1], [1.26, 103.84], [6.0, 80.0],
        [12.5, 43.3], [30.5, 32.3], [36.0, -5.3], [51.95, 4.14]
      ]
    },
    {
      id: 'route-transpacific',
      name: 'Transpacific Eastbound',
      originPort: 'port-shanghai',
      destinationPort: 'port-los-angeles',
      distanceNm: 5700,
      waypoints: [
        [31.23, 121.47], [35.0, 140.0], [45.0, -160.0], [33.74, -118.27]
      ]
    }
  ]
};

// 5. Weather Snapshot
const weatherSnapshot = {
  schema: 'simulatte.maritimeWeatherSnapshot.v1',
  id: 'maritime.weather.snapshot.v1',
  title: 'Global Ocean Sea State & Meteorological Snapshot',
  retrievedAt: '2026-07-21T00:00:00Z',
  zones: [
    { zoneId: 'north-atlantic', avgWaveHeightM: 3.4, windSpeedKnots: 22, currentSpeedKnots: 1.2 },
    { zoneId: 'indian-ocean', avgWaveHeightM: 2.1, windSpeedKnots: 14, currentSpeedKnots: 0.8 },
    { zoneId: 'north-pacific', avgWaveHeightM: 4.2, windSpeedKnots: 28, currentSpeedKnots: 1.5 }
  ]
};

const datasets = [
  ['world-ports-wpi-v1.json', worldPorts],
  ['maritime-vessel-classes-v1.json', vesselClasses],
  ['ocean-chokepoints-v1.json', oceanChokepoints],
  ['shipping-lane-routes-v1.json', shippingLanes],
  ['maritime-weather-snapshot-v1.json', weatherSnapshot]
];

const datasetManifest = {
  schema: 'simulatte.maritimeDatasetManifest.v1',
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
console.log('Maritime trade global data generated successfully!');
