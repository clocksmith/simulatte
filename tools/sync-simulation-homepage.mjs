import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { pages, featured } = require('../public/simulation-routes.js');
const path = fileURLToPath(new URL('../public/index.html', import.meta.url));
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states = { available: 'Available', experimental: 'Experimental', 'in-development': 'In development' };
const preview = page => {
  const bytes = fs.readFileSync(fileURLToPath(new URL('../public' + page.previewAsset, import.meta.url)));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `<a class="launch-link" href=".${escape(page.path)}"><img src=".${escape(page.previewAsset)}?v=${hash}" width="1200" height="800" alt="${escape(page.displayName)} simulation" loading="eager"><h2>${escape(page.displayName)}</h2><p>${escape(page.description)}</p></a>`;
};
const row = page => `<li><div><h3>${escape(page.displayName)}</h3><p>${escape(page.description)}</p>${page.limitations ? `<p class="catalog-limit">${escape(page.limitations)}</p>` : ''}</div><span class="catalog-state">${states[page.readiness]}</span>${page.readiness === 'in-development' ? '<span>Not yet open</span>' : `<a href=".${escape(page.path)}" aria-label="Open ${escape(page.displayName)}">Open <span aria-hidden="true">↗</span></a>`}</li>`;
const section = `<!-- SIMULATION_CATALOG_START -->
  <section id="simulation-launch" aria-labelledby="launch-title">
    <header class="launch-masthead"><h1 id="launch-title" class="launch-wordmark">SIMULATTE</h1></header>
    <div class="launch-copy"><p class="launch-kicker">Explore a simulation</p>
      <nav class="launch-simulations" aria-label="Featured simulations">${featured.map(preview).join('\n')}</nav>
      <a class="catalog-entry" href="#all-simulations">All simulations <span aria-hidden="true">↓</span></a>
    </div>
    <section id="all-simulations" class="simulation-catalog" aria-labelledby="catalog-title">
      <h2 id="catalog-title">All simulations</h2><p>Explore ${pages.length} simulations. Experimental experiences include their limitations.</p>
      <ul>${pages.map(row).join('\n')}</ul>
    </section>
  </section>
  <!-- SIMULATION_CATALOG_END -->`;
const original = fs.readFileSync(path, 'utf8');
const pattern = /<!-- SIMULATION_CATALOG_START -->[\s\S]*?<!-- SIMULATION_CATALOG_END -->\s*|<!-- Temporary launch surface\.[\s\S]*?<\/section>\s*(?=<main class="map-workspace")/;
if (!pattern.test(original)) throw new Error('Homepage catalog projection marker missing');
const next = original.replace(pattern, section + '\n  ');
if (process.argv.includes('--check')) {
  if (next !== original) throw new Error('Homepage differs from its route catalog; run tools/sync-simulation-homepage.mjs');
} else fs.writeFileSync(path, next);
