import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAuditHost, findChrome } from './browser-session.mjs';
import { verifyHostingBrowser } from '../hosting-browser-check.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = root + 'artifacts/2026-10-04-catalog/homepage';
await fs.mkdir(output, { recursive: true });
const html = await fs.readFile(root + 'public/index.html', 'utf8');
const expectedBuild = html.match(/name="simulatte-build" content="([^"]+)"/)[1];
const host = await createAuditHost({ publicRoot: root + 'public' });
const reports = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const report = await verifyHostingBrowser({ surface: 'world', baseUrl: host.baseUrl, expectedBuild,
      viewport, outDir: output, chromePath: findChrome() });
    reports.push(report);
    console.log(JSON.stringify({ viewport, pass: report.pass, errors: report.errors, checks: report.observation?.checks }));
  }
} finally {
  await host.close();
  await fs.writeFile(output + '/browser.json', JSON.stringify({ reports }, null, 2) + '\n');
}
if (reports.length !== 2 || reports.some(row => !row.pass)) process.exitCode = 1;
