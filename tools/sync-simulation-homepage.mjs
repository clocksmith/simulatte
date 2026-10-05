import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { pages, featured } = require('../public/simulation-routes.js');
const path = fileURLToPath(new URL('../public/index.html', import.meta.url));
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const states = { available: 'Available', experimental: 'Experimental', 'in-development': 'In development' };
const preview = page => `<a class="launch-link" href=".${escape(page.path)}">${escape(page.displayName)} <span aria-hidden="true">↗</span></a>`;
const illustration = `<svg class="launch-art" viewBox="0 0 720 680" fill="none" aria-hidden="true">
        <defs>
          <pattern id="launch-grid" width="72" height="72" patternUnits="userSpaceOnUse"><path d="M72 0H0V72"/></pattern>
          <g id="launch-block"><path d="M0 0 42-24 84 0 42 24Z"/><path d="M0 0V-52L42-76 84-52V0M0-52 42-28 84-52M42-28V24"/></g>
        </defs>
        <g class="launch-city">
          <path class="launch-grid" d="M0 0H720V680H0Z" fill="url(#launch-grid)"/>
          <g transform="translate(70 240)"><use href="#launch-block"/><use href="#launch-block" x="110" y="64"/><use href="#launch-block" x="220" y="128"/><use href="#launch-block" x="330" y="192"/></g>
          <g transform="translate(250 130)"><use href="#launch-block"/><use href="#launch-block" x="110" y="64"/><use href="#launch-block" x="220" y="128"/><use href="#launch-block" x="330" y="192"/></g>
          <path class="launch-road" d="M60 360 540 82M135 548 650 250M20 450 500 172M210 625 700 342"/>
        </g>
        <g class="launch-waves" transform="translate(368 370) rotate(-30)">
          <ellipse rx="105" ry="68"/><ellipse rx="166" ry="112"/><ellipse rx="232" ry="160"/><ellipse rx="300" ry="210"/>
        </g>
        <g class="launch-bike" transform="translate(295 310)">
          <circle cx="20" cy="62" r="22"/><circle cx="115" cy="62" r="22"/>
          <path d="M20 62 48 30 84 62H20M88 15 115 62M86 15H103L108 24M29 26H55"/>
          <path d="M53 28Q64 10 83 24L89 34H52ZM50 38H76L80 53H54Z"/>
          <path d="M36 65H85L95 60M14 35Q30 26 45 34M102 36Q120 30 133 43"/>
        </g>
        <path class="launch-cross" d="M50 100H70M60 90V110M630 550H650M640 540V560"/>
      </svg>`;
const row = page => `<li><div><h3>${escape(page.displayName)}</h3><p>${escape(page.description)}</p>${page.limitations ? `<p class="catalog-limit">${escape(page.limitations)}</p>` : ''}</div><span class="catalog-state">${states[page.readiness]}</span>${page.readiness === 'in-development' ? '<span>Not yet open</span>' : `<a href=".${escape(page.path)}" aria-label="Open ${escape(page.displayName)}">Open <span aria-hidden="true">↗</span></a>`}</li>`;
const section = `<!-- SIMULATION_CATALOG_START -->
  <section id="simulation-launch" aria-labelledby="launch-title">
    <header class="launch-masthead"><h1 id="launch-title" class="launch-wordmark">SIMULATTE</h1></header>
    <div class="launch-main"><div class="launch-copy"><p class="launch-kicker">Explore a simulation</p>
      <nav class="launch-simulations" aria-label="Featured simulations">${featured.map(preview).join('\n')}</nav>
      <a class="catalog-entry" href="#all-simulations">All simulations <span aria-hidden="true">↓</span></a>
    </div>${illustration}</div>
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
