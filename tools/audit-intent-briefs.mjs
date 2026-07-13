#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const lab = require('../public/blank/app/simulation/simulation-lab.js');

const DEFAULT_PROMPTS = Object.freeze([
  'lava heats rain into steam while wind bends ash over a basalt delta',
  'laser scans a copper plate through a glass lens and makes a moving hot spot',
  'mangrove roots stabilize soil while storm surge erodes the shoreline',
  'speaker membrane drives pressure waves through fog in a narrow hallway',
  'planetary rings shear around a shepherd moon with icy particle density waves',
]);

const prompts = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PROMPTS;
const rows = prompts.map((prompt) => {
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const brief = spec.intent && spec.intent.intentBrief || null;
  return {
    prompt,
    hasBrief: Boolean(brief),
    evidence: brief ? (brief.retrievedEvidence || []).length : 0,
    causalEdges: brief ? (brief.causalGraph || []).length : 0,
    assumptions: brief ? (brief.assumptions || []).length : 0,
    unsupported: brief ? (brief.unsupported || []).length : 0,
    degraded: brief ? (brief.degradedTo || []).length : 0,
    visualAffordances: brief && brief.visualIntent ? (brief.visualIntent.affordances || []).length : 0,
    shaderHints: brief && brief.visualIntent ? (brief.visualIntent.shaderHints || []).length : 0,
    motionHints: brief && brief.visualIntent ? (brief.visualIntent.motionHints || []).length : 0,
    sceneKind: brief && brief.visualIntent ? brief.visualIntent.sceneKind : '',
    validation: brief && brief.validation ? brief.validation.valid : false,
  };
});
const report = {
  schema: 'simulatte.intentBriefAudit.v1',
  promptCount: rows.length,
  ok: rows.every((row) => row.hasBrief && row.validation && row.causalEdges >= 1),
  rows,
};
console.log(JSON.stringify(report, null, 2));
