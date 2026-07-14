#!/usr/bin/env node
// Sealed place-resolution population generator.
//
// Sealing model: rows are derived deterministically from a SECRET seed the
// operator supplies (or /dev/urandom when omitted). The seed is never
// stored, printed, or committed. The repository commits only a commitment
// receipt: population SHA-256, row count, class mix, and the generator's own
// hash. Anyone holding the sealed file can verify it against the commitment;
// nobody can reconstruct rows from the repository alone.
//
// Contamination boundary, stated plainly: the generator's mutation CLASSES
// are public (this file), so the sealed set measures robustness to known
// transformation families on unknown rows. It contains no paraphrase rows:
// machine generation cannot author landmark paraphrases without a human in
// the loop, and any authored here would transit the assistant session that
// also tunes the resolver. Paraphrase promotion evidence requires a
// custodian-authored set this tool cannot provide.
//
// Custody: move the emitted file off this machine (or into private storage
// the evaluation host cannot read until opening). The evaluator's
// --sealed-open flag records a one-time opening receipt.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const missionApi = require('../../public/mission/mission-compiler.js');
const SEALED_DIR = path.join(ROOT, 'tools/samer/autonomy/sealed');
const SEALED_PATH = path.join(SEALED_DIR, 'sealed-place-population-v1.json');
const COMMITMENT_PATH = path.join(ROOT, 'tools/samer/autonomy/sealed-place-population-v1.commitment.json');
const WORLD_PATH = 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json';
const EMBODIMENT_PATH = 'public/data/autonomy/embodiments/delivery-bike-v1.json';
const OUT_OF_WORLD = Object.freeze([
  'Central Park', 'Times Square', 'Prospect Park', 'DUMBO', 'Harlem',
  'Coney Island', 'Battery Park', 'Bryant Park', 'Astoria', 'Red Hook',
]);

function rng(seedBuffer) {
  let counter = 0;
  return () => {
    const digest = crypto.createHash('sha256')
      .update(seedBuffer)
      .update(String(counter++))
      .digest();
    return digest.readUInt32BE(0) / 0xffffffff;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length) % list.length];
}

const MUTATIONS = Object.freeze({
  delete_char(random, text) {
    const index = 1 + Math.floor(random() * (text.length - 2));
    return text.slice(0, index) + text.slice(index + 1);
  },
  transpose(random, text) {
    const index = 1 + Math.floor(random() * (text.length - 3));
    return text.slice(0, index) + text[index + 1] + text[index] + text.slice(index + 2);
  },
  double_char(random, text) {
    const index = 1 + Math.floor(random() * (text.length - 2));
    return text.slice(0, index) + text[index] + text.slice(index);
  },
  substitute(random, text) {
    const index = 1 + Math.floor(random() * (text.length - 2));
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return text.slice(0, index) + pick(random, [...letters]) + text.slice(index + 1);
  },
  drop_space(random, text) {
    return text.includes(' ') ? text.replace(' ', '') : text;
  },
  lowercase() {
    return null; // applied at row level
  },
});

function mutate(random, label, depth) {
  const operators = Object.keys(MUTATIONS).filter((name) => name !== 'lowercase');
  let value = label;
  const applied = [];
  for (let step = 0; step < depth; step += 1) {
    const operator = pick(random, operators);
    const next = MUTATIONS[operator](random, value);
    if (next && next !== value) {
      value = next;
      applied.push(operator);
    }
  }
  return { value, applied };
}

function main() {
  const seedArgIndex = process.argv.indexOf('--seed');
  const seedBuffer = seedArgIndex > 0
    ? Buffer.from(String(process.argv[seedArgIndex + 1]), 'utf8')
    : crypto.randomBytes(32);
  const random = rng(seedBuffer);

  const world = JSON.parse(fs.readFileSync(path.join(ROOT, WORLD_PATH), 'utf8'));
  const embodiment = JSON.parse(fs.readFileSync(path.join(ROOT, EMBODIMENT_PATH), 'utf8'));
  const eligible = new Set(missionApi.eligiblePlaceNodeIds(world, embodiment.kind));
  const places = world.nodes
    .filter((node) => node.label && eligible.has(node.id))
    .map((node) => node.label)
    .sort();
  if (places.length < 4) throw new Error(`expected governed place labels, found ${places.length}`);

  const probes = [];
  let sequence = 0;
  const add = (kind, role, sourceText, gold, meta = {}) => {
    probes.push({ probeId: `sealed-${String(++sequence).padStart(3, '0')}`, kind, role, sourceText, gold, ...meta });
  };
  const sentence = (origin, destination) => `Deliver the parcel by bike from ${origin} to ${destination}.`;
  const otherPlace = (label) => pick(random, places.filter((row) => row !== label));

  for (const place of places) {
    // Graded typo depths: 1 (inside the constrained bound), 2 and 3 (beyond).
    for (const depth of [1, 2, 3]) {
      const mutation = mutate(random, place, depth);
      if (mutation.value === place) continue;
      add(depth === 1 ? 'typo_within' : 'typo_beyond', 'destination',
        sentence(otherPlace(place), mutation.value),
        { outcome: 'resolve', placeLabel: place },
        { mutationDepth: depth, operators: mutation.applied });
    }
    // Case robustness.
    if (random() > 0.5) {
      add('case_variant', 'destination', sentence(otherPlace(place), place.toLowerCase()),
        { outcome: 'resolve', placeLabel: place });
    }
  }
  // Shared-token ambiguity, constructed from the label inventory itself.
  const tokenCounts = new Map();
  for (const place of places) {
    for (const token of place.split(/\s+/)) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }
  for (const [token, count] of tokenCounts) {
    if (count >= 2 && token.length > 3) {
      add('ambiguous', 'destination', sentence(pick(random, places), token),
        { outcome: 'refuse', candidates: places.filter((place) => place.includes(token)) });
    }
  }
  for (const name of OUT_OF_WORLD) {
    if (random() > 0.4) {
      add('out_of_world', 'destination', sentence(pick(random, places), name), { outcome: 'refuse' });
    }
  }

  const population = {
    schema: 'simulatte.sealedPlacePopulation.v1',
    id: 'sealed-place-population-v1',
    population: 'sealed_promotion',
    excludedClasses: ['paraphrase'],
    exclusionReason: 'Machine generation cannot author landmark paraphrases without transiting the tuning session; paraphrase promotion needs a custodian-authored set.',
    probes,
  };
  const serialized = `${JSON.stringify(population, null, 2)}\n`;
  const populationSha256 = crypto.createHash('sha256').update(serialized).digest('hex');
  fs.mkdirSync(SEALED_DIR, { recursive: true });
  fs.writeFileSync(SEALED_PATH, serialized);

  const kindCounts = {};
  for (const probe of probes) kindCounts[probe.kind] = (kindCounts[probe.kind] || 0) + 1;
  const commitment = {
    schema: 'simulatte.sealedPopulationCommitment.v1',
    id: 'sealed-place-population-v1',
    createdAt: new Date().toISOString(),
    populationSha256,
    rowCount: probes.length,
    kindCounts,
    generatorSha256: crypto.createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    worldSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, WORLD_PATH))).digest('hex'),
    custody: 'Move tools/samer/autonomy/sealed/ off the evaluation host. The directory is gitignored. Opening is one-time via evaluate-place-resolution --corpus <path> --sealed-open, which appends to the openings log.',
    openings: [],
  };
  fs.writeFileSync(COMMITMENT_PATH, `${JSON.stringify(commitment, null, 2)}\n`);
  console.log(`SEALED-POPULATION rows=${probes.length} sha256=${populationSha256.slice(0, 16)}… commitment=${path.relative(ROOT, COMMITMENT_PATH)} sealedFile=${path.relative(ROOT, SEALED_PATH)} (gitignored, custody required)`);
}

main();
