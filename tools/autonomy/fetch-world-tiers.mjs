#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const CACHE_DIR = path.join(ROOT, 'public/data/autonomy/cache');

// Ensure cache directories exist
function ensureDirs() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'countries'), { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'world'), { recursive: true });
  fs.mkdirSync(path.join(CACHE_DIR, 'space'), { recursive: true });
}

// Log formatting
function log(msg) {
  console.log(`[WORLD-TIERS] ${msg}`);
}

function logError(msg, err) {
  console.error(`[WORLD-TIERS-ERROR] ${msg}`, err);
}

// Parse bounds string: "south,west,north,east"
function parseBounds(str) {
  const parts = str.split(',').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error('Bounds must be format: south,west,north,east');
  }
  return { south: parts[0], west: parts[1], north: parts[2], east: parts[3] };
}

// Format date to YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Fetch helper with standard timeout and headers
// Fetch helper using system curl to avoid TLS/headers restrictions
async function fetchWithRetry(url, options = {}) {
  const headers = {
    ...options.headers
  };
  
  let headerFlags = Object.entries(headers)
    .map(([key, val]) => `-H '${key}: ${val.replace(/'/g, "'\\''")}'`)
    .join(' ');
    
  let methodFlag = options.method ? `-X ${options.method}` : '';
  let bodyFlag = '';
  if (options.body) {
    bodyFlag = `-d '${options.body.replace(/'/g, "'\\''")}'`;
  }
  
  const cmd = `curl -sS -L ${methodFlag} ${bodyFlag} ${headerFlags} '${url.replace(/'/g, "'\\''")}'`;
  const buffer = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 });
  
  return {
    ok: true,
    status: 200,
    async json() {
      const text = buffer.toString('utf8');
      try {
        return JSON.parse(text);
      } catch (err) {
        console.error("[WORLD-TIERS] Failed to parse JSON response. Response text first 500 chars:\n", text.slice(0, 500));
        throw err;
      }
    },
    async text() { return buffer.toString('utf8'); },
    async arrayBuffer() { return buffer.buffer; }
  };
}

// ---------------------------------------------------------
// TIER 1: City Tier (OSM Overpass API)
// ---------------------------------------------------------
async function runCity(args) {
  const name = args.find(a => a.startsWith('--name='))?.split('=')[1] || 'nyc-core';
  const boundsStr = args.find(a => a.startsWith('--bounds='))?.split('=')[1] || '40.705,-74.015,40.745,-73.94';
  const outPath = args.find(a => a.startsWith('--out='))?.split('=')[1] || path.join(ROOT, `public/data/autonomy/worlds/${name}-raw-osm.json`);

  log(`City Tier: name=${name} bounds=[${boundsStr}]`);
  const bounds = parseBounds(boundsStr);

  // Query Overpass for highway ways and nodes inside the bbox
  const query = `[out:json][timeout:60];
(
  way["highway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out body;
>;
out skel qt;`;

  const url = 'https://overpass-api.de/api/interpreter';
  log(`Requesting Overpass API for bounds: ${boundsStr}...`);
  
  const response = await fetchWithRetry(url, {
    method: 'POST',
    body: 'data=' + query,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = await response.json();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  log(`Saved City raw OSM data to ${outPath} (elements=${data.elements?.length || 0})`);
}

// ---------------------------------------------------------
// TIER 2: Country Tier (Geofabrik PBF downloads)
// ---------------------------------------------------------
async function runCountry(args) {
  const name = args.find(a => a.startsWith('--name='))?.split('=')[1] || 'liechtenstein';
  const outPath = args.find(a => a.startsWith('--out='))?.split('=')[1] || path.join(CACHE_DIR, 'countries', `${name}.osm.pbf`);

  log(`Country Tier: name=${name}`);
  log('Fetching Geofabrik registry index to find download URL...');
  
  const registryUrl = 'https://download.geofabrik.de/index-v1.json';
  const response = await fetchWithRetry(registryUrl);
  const registry = await response.json();

  // Find country matching the name in features
  const feature = registry.features.find(f => {
    const idParts = f.properties.id.split('/');
    const shortName = idParts[idParts.length - 1];
    return shortName.toLowerCase() === name.toLowerCase() || f.properties.name.toLowerCase() === name.toLowerCase();
  });

  if (!feature) {
    throw new Error(`Country name "${name}" not found in Geofabrik registry.`);
  }

  const pbfUrl = feature.properties.urls.pbf;
  if (!pbfUrl) {
    throw new Error(`PBF URL not available for country "${name}"`);
  }

  log(`Downloading PBF for "${feature.properties.name}" from ${pbfUrl}...`);
  const downloadResponse = await fetchWithRetry(pbfUrl);
  const arrayBuffer = await downloadResponse.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
  log(`Saved Country PBF to ${outPath} (${arrayBuffer.byteLength} bytes)`);
}

// ---------------------------------------------------------
// TIER 3: World Tier (Natural Earth global borders)
// ---------------------------------------------------------
async function runWorld(args) {
  const outPath = args.find(a => a.startsWith('--out='))?.split('=')[1] || path.join(CACHE_DIR, 'world', 'countries.geojson');

  log('World Tier: Downloading global boundaries (Natural Earth)...');
  
  // Natural Earth 1:110m scale simplified country boundaries GeoJSON
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
  
  const response = await fetchWithRetry(url);
  const data = await response.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  log(`Saved World boundaries GeoJSON to ${outPath} (features=${data.features?.length || 0})`);
}

// ---------------------------------------------------------
// TIER 4: Solar System Tier (NASA JPL Horizons API)
// ---------------------------------------------------------
async function runSolarSystem(args) {
  const startStr = args.find(a => a.startsWith('--start='))?.split('=')[1] || formatDate(new Date());
  const stopDate = new Date();
  stopDate.setDate(stopDate.getDate() + 7);
  const stopStr = args.find(a => a.startsWith('--stop='))?.split('=')[1] || formatDate(stopDate);
  const outPath = args.find(a => a.startsWith('--out='))?.split('=')[1] || path.join(CACHE_DIR, 'space', 'solar-system.json');

  log(`Solar System Tier: range=[${startStr} to ${stopStr}]`);

  // Target Major Celestial Bodies
  const bodies = {
    Sun: '10',
    Moon: '301',
    Mercury: '199',
    Venus: '299',
    Mars: '499',
    Jupiter: '599',
    Saturn: '699',
    Uranus: '799',
    Neptune: '899'
  };

  const results = {};

  for (const [name, id] of Object.entries(bodies)) {
    log(`Querying NASA JPL Horizons for body: ${name} (ID: ${id})...`);
    // Center: '500@0' (Solar System Barycenter), Quantities: '1,20' (RA/DEC, distance)
    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='${id}'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='500@0'&START_TIME='${startStr}'&STOP_TIME='${stopStr}'&STEP_SIZE='1d'&QUANTITIES='1,20'`;
    
    try {
      const response = await fetchWithRetry(url);
      const data = await response.json();
      
      // Parse the results from the result string
      const lines = data.result?.split('\n') || [];
      const ephemeris = [];
      let inData = false;

      for (const line of lines) {
        if (line.includes('$$SOE')) {
          inData = true;
          continue;
        }
        if (line.includes('$$EOE')) {
          inData = false;
          break;
        }
        if (inData && line.trim()) {
          // Parse columns: Date, RA (hh mm ss), DEC (dd mm ss), Delta (distance in AU)
          // Line format typically starts with Date/Time, followed by quantities
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 8) {
            const dateStr = parts[0] + ' ' + parts[1];
            const ra = parts.slice(2, 5).join(' ');
            const dec = parts.slice(5, 8).join(' ');
            const range = Number(parts[parts.length - 2]); // Delta (AU)
            ephemeris.push({ datetime: dateStr, ra, dec, distanceAU: range });
          }
        }
      }

      results[name] = { id, ephemeris };
    } catch (err) {
      logError(`Failed to fetch Horizons ephemeris for ${name}`, err);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  log(`Saved Solar System ephemerides to ${outPath}`);
}

// ---------------------------------------------------------
// TIER 5: Star Chart / Universe Tier (HYG Star Catalog)
// ---------------------------------------------------------
async function runStarChart(args) {
  const maxMag = Number(args.find(a => a.startsWith('--magnitude='))?.split('=')[1] || '6.0');
  const outPath = args.find(a => a.startsWith('--out='))?.split('=')[1] || path.join(CACHE_DIR, 'space', 'star-chart.json');

  log(`Star Chart Tier: maxMagnitude=${maxMag}`);
  log('Downloading HYG Star Catalog (Hipparcos, Yale, Gliese)...');

  const url = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
  const response = await fetchWithRetry(url);
  const csvText = await response.text();

  log('Parsing star catalog CSV...');
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  
  const idIndex = headers.indexOf('id');
  const hipIndex = headers.indexOf('hip');
  const properIndex = headers.indexOf('proper');
  const raIndex = headers.indexOf('ra');
  const decIndex = headers.indexOf('dec');
  const distIndex = headers.indexOf('dist');
  const magIndex = headers.indexOf('mag');
  const spectIndex = headers.indexOf('spect');

  const stars = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Quick CSV split (supports simple split as HYG is clean)
    const cols = line.split(',').map(val => val.replace(/^"|"$/g, '').trim());
    const mag = Number(cols[magIndex]);
    
    if (mag <= maxMag) {
      stars.push({
        id: cols[idIndex],
        hip: cols[hipIndex] || null,
        properName: cols[properIndex] || null,
        ra: Number(cols[raIndex]),       // Right Ascension (hours)
        dec: Number(cols[decIndex]),     // Declination (degrees)
        distancePc: Number(cols[distIndex]), // Distance (parsecs)
        magnitude: mag,
        spectralType: cols[spectIndex] || null
      });
    }
  }

  // Sort by brightness (magnitude ascending)
  stars.sort((a, b) => a.magnitude - b.magnitude);

  const catalog = {
    schema: 'simulatte.starCatalog.v1',
    maxMagnitude: maxMag,
    count: stars.length,
    stars
  };

  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
  log(`Saved Star Chart catalog to ${outPath} (starsCount=${stars.length})`);
}

// ---------------------------------------------------------
// Main CLI Entrypoint
// ---------------------------------------------------------
async function main() {
  ensureDirs();
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === 'help') {
    console.log([
      'Usage:',
      '  node tools/autonomy/fetch-world-tiers.mjs city [--name=nyc-core] [--bounds=south,west,north,east] [--out=path]',
      '  node tools/autonomy/fetch-world-tiers.mjs country [--name=liechtenstein] [--out=path]',
      '  node tools/autonomy/fetch-world-tiers.mjs world [--out=path]',
      '  node tools/autonomy/fetch-world-tiers.mjs solar-system [--start=YYYY-MM-DD] [--stop=YYYY-MM-DD] [--out=path]',
      '  node tools/autonomy/fetch-world-tiers.mjs star-chart [--magnitude=6.0] [--out=path]'
    ].join('\n'));
    process.exit(0);
  }

  const subArgs = args.slice(1);
  try {
    if (cmd === 'city') {
      await runCity(subArgs);
    } else if (cmd === 'country') {
      await runCountry(subArgs);
    } else if (cmd === 'world') {
      await runWorld(subArgs);
    } else if (cmd === 'solar-system') {
      await runSolarSystem(subArgs);
    } else if (cmd === 'star-chart') {
      await runStarChart(subArgs);
    } else {
      throw new Error(`Unknown command: ${cmd}`);
    }
    log(`Command "${cmd}" completed successfully.`);
  } catch (err) {
    logError(`Command "${cmd}" failed:`, err);
    process.exit(1);
  }
}

main();
