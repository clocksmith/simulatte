#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const OUTPUT_DIR = path.join(ROOT, 'public/data/orbital-transfer-planner');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'synthetic-heliocentric-vectors-v1.json');

function buildSyntheticOrbitalFixture() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const epochStart = '2030-09-15T00:00:00Z';
  const epochCount = 730;
  const stepDays = 1;

  const bodies = {
    sun: { name: 'Sun', color: '#ffaa33', radiusAu: 0.00465047, vectors: [] },
    earth: { name: 'Earth', color: '#44aaff', radiusAu: 0.00004264, vectors: [] },
    mars: { name: 'Mars', color: '#ff5533', radiusAu: 0.00002266, vectors: [] },
  };

  const startMs = Date.parse(epochStart);
  for (let i = 0; i < epochCount; i += 1) {
    const epoch = new Date(startMs + (i * stepDays * 86_400_000)).toISOString();
    const tDays = i * stepDays;

    bodies.sun.vectors.push({ epoch, positionAu: [0, 0, 0], velocityAuPerDay: [0, 0, 0] });

    const earthAngle = (2 * Math.PI * tDays) / 365.256;
    const earthR = 1.0;
    const earthV = (2 * Math.PI * earthR) / 365.256;
    bodies.earth.vectors.push({
      epoch,
      positionAu: [Number((earthR * Math.cos(earthAngle)).toFixed(8)), Number((earthR * Math.sin(earthAngle)).toFixed(8)), 0],
      velocityAuPerDay: [Number((-earthV * Math.sin(earthAngle)).toFixed(8)), Number((earthV * Math.cos(earthAngle)).toFixed(8)), 0],
    });

    const marsAngle = (2 * Math.PI * tDays) / 686.98;
    const marsR = 1.524;
    const marsV = (2 * Math.PI * marsR) / 686.98;
    bodies.mars.vectors.push({
      epoch,
      positionAu: [Number((marsR * Math.cos(marsAngle)).toFixed(8)), Number((marsR * Math.sin(marsAngle)).toFixed(8)), 0],
      velocityAuPerDay: [Number((-marsV * Math.sin(marsAngle)).toFixed(8)), Number((marsV * Math.cos(marsAngle)).toFixed(8)), 0],
    });
  }

  const fixture = {
    schema: 'simulatte.syntheticHeliocentricVectors.v1',
    id: 'synthetic.orbital.heliocentric-vectors.v1',
    title: 'Synthetic two-body heliocentric orbital fixture',
    epochStart,
    stepDays,
    epochCount,
    sourceKind: 'synthetic_analytic_fixture',
    provenance: {
      source: 'Analytic circular Keplerian orbit generator',
      retrievedAt: new Date().toISOString(),
      claimBoundary: 'Analytic deterministic fixture for tests and offline demonstrations; not JPL Horizons data.',
    },
    bodies,
  };

  const text = `${JSON.stringify(fixture, null, 2)}\n`;
  fs.writeFileSync(OUTPUT_PATH, text);
  console.log(`SYNTHETIC-ORBITAL-FIXTURE status=written file=${OUTPUT_PATH} vectors=${epochCount} sha256=${crypto.createHash('sha256').update(text).digest('hex')}`);
}

buildSyntheticOrbitalFixture();
