import fs from 'node:fs';
import path from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  let baseUrl = 'https://simulatte-world.web.app/';
  let expectedSourceSha = null;
  for (const arg of args) {
    if (arg.startsWith('--base-url=')) baseUrl = arg.split('=')[1];
    else if (arg.startsWith('--expected-source-sha=')) expectedSourceSha = arg.split('=')[1];
  }
  if (!baseUrl.endsWith('/')) baseUrl += '/';
  return { baseUrl, expectedSourceSha };
}

async function verifyLiveRelease() {
  const { baseUrl, expectedSourceSha } = parseArgs();
  const results = {
    baseUrl,
    expectedSourceSha,
    checks: {
      versionMatchesMeta: false,
      sourceShaMatches: false,
      scriptsAreStamped: false,
      scriptsUseOneBuild: false,
      scriptsMatchVersion: false,
      everyTierRouteReturnsSuccess: false,
    },
    tierStatus: {},
    pass: false,
  };

  try {
    const versionRes = await fetch(new URL('version.json', baseUrl).toString());
    if (!versionRes.ok) throw new Error(`HTTP ${versionRes.status} fetching version.json`);
    const versionData = await versionRes.json();
    const buildContent = versionData.build || versionData.version || '';

    const htmlRes = await fetch(baseUrl);
    if (!htmlRes.ok) throw new Error(`HTTP ${htmlRes.status} fetching index.html`);
    const htmlText = await htmlRes.text();

    const metaMatch = htmlText.match(/<meta\s+name=["']simulatte-build["']\s+content=["']([^"']+)["']/i);
    const metaContent = metaMatch ? metaMatch[1] : '';

    results.checks.versionMatchesMeta = Boolean(buildContent && metaContent && buildContent === metaContent);

    if (expectedSourceSha) {
      results.checks.sourceShaMatches = Boolean(buildContent && buildContent.startsWith(expectedSourceSha));
    } else {
      results.checks.sourceShaMatches = true;
    }

    const scriptMatches = [...htmlText.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
    const scriptVersions = new Set();
    let totalScripts = 0;
    for (const match of scriptMatches) {
      const src = match[1];
      const url = new URL(src, baseUrl);
      const v = url.searchParams.get('v');
      if (v) {
        scriptVersions.add(v);
        totalScripts += 1;
      }
    }

    results.checks.scriptsAreStamped = totalScripts > 0;
    results.checks.scriptsUseOneBuild = scriptVersions.size === 1;
    results.checks.scriptsMatchVersion = scriptVersions.has(buildContent);

    const tiers = ['city', 'country', 'world', 'solar-system', 'star-chart'];
    let allTiersOk = true;
    for (const tier of tiers) {
      const tierUrl = `${baseUrl}?tier=${tier}`;
      try {
        const tierRes = await fetch(tierUrl);
        results.tierStatus[tier] = { status: tierRes.status, ok: tierRes.ok };
        if (!tierRes.ok) allTiersOk = false;
      } catch (err) {
        results.tierStatus[tier] = { status: 0, error: err.message, ok: false };
        allTiersOk = false;
      }
    }

    results.checks.everyTierRouteReturnsSuccess = allTiersOk;
    results.pass = Object.values(results.checks).every(Boolean);

    console.log(JSON.stringify(results, null, 2));
    if (!results.pass) process.exit(1);
  } catch (error) {
    console.error(`VERIFY-LIVE status=failed reason=${error.message}`);
    process.exit(1);
  }
}

verifyLiveRelease();
