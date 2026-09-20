import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyHostingSurface } from './hosting-release-checks.mjs';
import { verifyHostingBrowser } from './hosting-browser-check.mjs';
import { prepareAuditOutput } from './audit-output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = { world: 'https://simulatte-world.web.app/', create: 'https://simulatte-create.web.app/' };

export async function main(args = process.argv.slice(2)) {
  const options = { surface: 'both', out: path.join(ROOT, 'artifacts/live-release', new Date().toISOString().replace(/[:.]/g, '-')), chrome: '', 'http-only': false };
  for (const arg of args) {
    if (arg === '--http-only') { options['http-only'] = true; continue; }
    const match = /^--(surface|base-url|expected-build|expected-source-sha|out|chrome)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown argument ${arg}; use --surface=world|create|both, --expected-build=ID, --out=DIR, --chrome=PATH or --http-only`);
    options[match[1]] = match[2];
  }
  if (!['world', 'create', 'both'].includes(options.surface)) throw new Error('Unknown surface');
  if (options['base-url'] && options.surface === 'both') throw new Error('--base-url requires an explicit --surface');
  const expectedBuild = options['expected-build'] || JSON.parse(await fs.readFile(path.join(ROOT, 'public/version.json'))).build;
  if (options['expected-source-sha'] && options['expected-source-sha'] !== expectedBuild.split('-')[0]) throw new Error('Expected source SHA differs from the exact release build');
  const outDir = path.resolve(options.out);
  await prepareAuditOutput(outDir, ['simulatte.liveRelease.v2']);
  const report = { schema: 'simulatte.liveRelease.v2', recordedAt: new Date().toISOString(), expectedBuild,
    scope: options['http-only'] ? 'HTTP identity and entry assets only' : 'HTTP identity, entry assets, browser startup, controls and one fixed Create execution',
    exclusions: ['Simulation correctness', 'Model qualification', 'Physical GPU qualification', 'Human visual adjudication'],
    surfaces: [], browsers: [], pass: false };
  for (const surface of options.surface === 'both' ? ['world', 'create'] : [options.surface]) {
    const baseUrl = new URL(options['base-url'] || TARGETS[surface]).href;
    if (!['http:', 'https:'].includes(new URL(baseUrl).protocol)) throw new Error('Release URL must use HTTP or HTTPS');
    const checked = await verifyHostingSurface({ surface, baseUrl, expectedBuild, packageRoot: path.join(ROOT, '.firebase-hosting', surface) });
    report.surfaces.push(checked);
    if (!options['http-only']) {
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        report.browsers.push(await verifyHostingBrowser({ surface, baseUrl, expectedBuild, viewport, outDir, chromePath: options.chrome }));
      }
    }
  }
  report.pass = report.surfaces.every(surface => surface.pass)
    && (options['http-only'] || report.browsers.length === report.surfaces.length * 2 && report.browsers.every(browser => browser.pass));
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ pass: report.pass, expectedBuild, scope: report.scope, report: path.join(outDir, 'report.json') }));
  if (!report.pass) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
