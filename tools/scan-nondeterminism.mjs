#!/usr/bin/env node
// scan-nondeterminism.mjs
//
// Dependency-free determinism scanner for Simulatte's physics/solver modules.
//
// Reproducible simulation requires that the execution path (PhysicsIR build,
// solver compilation, per-step integration) contain NO wall-clock or entropy
// sources. This scanner tokenizes each module just enough to strip comments and
// string/template literals (so matches inside text are not flagged), then reports
// any call to a non-deterministic API on the determinism-critical surface.
//
// The renderer/UI/loop layer is intentionally NOT scanned: `performance.now()`
// for frame pacing and `requestAnimationFrame` for the draw loop are legitimate
// there. Keep that boundary explicit — determinism is a property of the compute
// path, not the presentation path.
//
// Usage:
//   node tools/scan-nondeterminism.mjs            # scan default critical set
//   node tools/scan-nondeterminism.mjs --json     # machine-readable report
//   node tools/scan-nondeterminism.mjs --all      # scan every public runtime module
//
// Exit code: 0 = clean, 1 = violation(s) on the critical surface.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const publicDir = join(root, 'public');
const pipelineDir = join(publicDir, 'pipeline');
const appDir = join(publicDir, 'app');
const workersDir = join(publicDir, 'workers');
const solversDir = join(pipelineDir, 'phase-06-simulation', 'solvers');

// Determinism-critical modules: the compute path from prompt → executable state.
const CRITICAL = [
  join(pipelineDir, 'phase-06-simulation', 'simulatte-physics-model.js'),
  join(pipelineDir, 'phase-06-simulation', 'simulatte-physics-ir.js'),
  join(pipelineDir, 'phase-06-simulation', 'simulatte-physics-ir-validator.js'),
  join(pipelineDir, 'phase-06-simulation', 'simulatte-solver-compiler.js'),
  join(pipelineDir, 'phase-06-simulation', 'simulatte-solver-registry.js'),
  join(pipelineDir, 'phase-07-visual', 'simulatte-composition-graph.js'),
  join(pipelineDir, 'phase-06-simulation', 'simulatte-render-ir.js'),
];

// Non-deterministic / non-reproducible call signatures. Each entry is a label
// plus a matcher that runs against the comment/string-stripped source.
const FORBIDDEN = [
  { id: 'Math.random', re: /\bMath\s*\.\s*random\s*\(/g },
  { id: 'Date.now', re: /\bDate\s*\.\s*now\s*\(/g },
  // Only argless constructors are non-deterministic; `new Date(0)` / `new Date(ms)`
  // are fixed instants and are deliberately allowed (e.g. epoch defaults).
  { id: 'new Date()', re: /\bnew\s+Date\s*\(\s*\)/g },
  { id: 'Date()', re: /(?<![.\w])Date\s*\(\s*\)/g },
  { id: 'performance.now', re: /\bperformance\s*\.\s*now\s*\(/g },
  { id: 'crypto.getRandomValues', re: /\bcrypto\s*\.\s*getRandomValues\s*\(/g },
  { id: 'crypto.randomUUID', re: /\bcrypto\s*\.\s*randomUUID\s*\(/g },
  { id: 'setTimeout', re: /\bsetTimeout\s*\(/g },
  { id: 'setInterval', re: /\bsetInterval\s*\(/g },
  { id: 'requestAnimationFrame', re: /\brequestAnimationFrame\s*\(/g },
];

// Strip line comments, block comments, and string/template literals, replacing
// each with same-length whitespace so character offsets (and line numbers) are
// preserved for accurate reporting. This is a small state machine, not a full
// parser, but it is exact for the constructs above — enough to avoid the false
// positives a naive grep would produce on text like "Math.random in a comment".
function stripNonCode(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const blank = (ch) => (ch === '\n' ? '\n' : ' ');
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out.push(blank(src[i])); i += 1; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out.push(' ', ' '); i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(blank(src[i])); i += 1; }
      if (i < n) { out.push(' ', ' '); i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out.push(' '); i += 1;
      while (i < n) {
        if (src[i] === '\\') { out.push(' ', ' '); i += 2; continue; }
        if (src[i] === quote) { out.push(' '); i += 1; break; }
        out.push(blank(src[i])); i += 1;
      }
      continue;
    }
    out.push(c); i += 1;
  }
  return out.join('');
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

function scanFile(absPath) {
  const src = readFileSync(absPath, 'utf8');
  const code = stripNonCode(src);
  const findings = [];
  for (const rule of FORBIDDEN) {
    rule.re.lastIndex = 0;
    let match;
    while ((match = rule.re.exec(code)) !== null) {
      findings.push({ rule: rule.id, line: lineOf(code, match.index) });
    }
  }
  return findings;
}

function listJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJsFiles(file));
    else if (entry.name.endsWith('.js')) files.push(file);
  }
  return files;
}

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const scanAll = args.has('--all');

let targets;
if (scanAll) {
  targets = [
    ...listJsFiles(appDir),
    ...listJsFiles(pipelineDir),
    ...listJsFiles(workersDir),
  ];
} else {
  targets = [
    ...CRITICAL,
    ...listJsFiles(solversDir),
  ];
}

const report = [];
for (const file of targets) {
  let findings = [];
  try {
    findings = scanFile(file);
  } catch (error) {
    report.push({ file: relative(root, file), error: String(error.message) });
    continue;
  }
  if (findings.length) report.push({ file: relative(root, file), findings });
}

const violationCount = report.reduce((sum, r) => sum + (r.findings ? r.findings.length : 0), 0);

if (asJson) {
  process.stdout.write(`${JSON.stringify({
    schema: 'simulatte.determinismScan.v1',
    scannedFiles: targets.length,
    violationCount,
    report,
  }, null, 2)}\n`);
} else {
  process.stdout.write(`Determinism scan — ${targets.length} module(s) on the critical surface\n`);
  if (!report.length) {
    process.stdout.write('  ✓ clean: no non-deterministic calls on the compute path\n');
  } else {
    for (const entry of report) {
      if (entry.error) {
        process.stdout.write(`  ! ${entry.file}: ${entry.error}\n`);
        continue;
      }
      process.stdout.write(`  ✗ ${entry.file}\n`);
      for (const f of entry.findings) {
        process.stdout.write(`      L${f.line}  ${f.rule}\n`);
      }
    }
    process.stdout.write(`\n  ${violationCount} violation(s) across ${report.length} file(s)\n`);
  }
}

process.exit(violationCount > 0 ? 1 : 0);
