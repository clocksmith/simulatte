import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (value, message) => { if (!value) throw new Error(message); };
const attribute = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];

export function entryAssets(html, baseUrl) {
  const base = new URL(attribute(html.match(/<base\b[^>]*>/i)?.[0] || '', 'href') || '.', baseUrl);
  return [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)].flatMap(([tag]) => {
    const script = /^<script/i.test(tag);
    if (!script && attribute(tag, 'rel') !== 'stylesheet') return [];
    const reference = attribute(tag, script ? 'src' : 'href');
    if (!reference) return [];
    const url = new URL(reference.replaceAll('&amp;', '&'), base);
    if (url.origin !== new URL(baseUrl).origin) return [];
    return [{ url: url.href, kind: script ? 'script' : 'style', deferred: /\sdefer(?:\s|>|=)/i.test(tag) }];
  });
}

export async function verifyHostingSurface({ surface, baseUrl, expectedBuild, packageRoot, fetchImpl = fetch }) {
  const result = { surface, baseUrl, expectedBuild, checks: {}, assets: [], errors: [], pass: false };
  const readRemote = async (url, type) => {
    const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    requireValue(response.ok, `HTTP ${response.status}: ${url}`);
    const mime = response.headers.get('content-type') || '';
    requireValue(type.test(mime), `Unexpected content type ${mime}: ${url}`);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      requireValue(size <= 16 * 1024 * 1024, `Release resource exceeds 16 MiB: ${url}`);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  try {
    requireValue(['world', 'create'].includes(surface), 'Unknown hosting surface');
    requireValue(/^[a-f0-9]{40}-[a-f0-9]{12}$/.test(expectedBuild), 'An exact source-and-content build identity is required');
    const localVersion = JSON.parse(await fs.readFile(path.join(packageRoot, 'version.json'), 'utf8'));
    requireValue(localVersion.build === expectedBuild, 'Packaged build differs from expected release; package the intended release first');
    const version = JSON.parse(await readRemote(new URL('version.json', baseUrl), /application\/json/i));
    result.observedBuild = version.build;
    requireValue(version.build === expectedBuild, `Live build differs: expected ${expectedBuild}, received ${version.build}`);
    result.checks.exactBuild = true;
    const receipt = JSON.parse(await readRemote(new URL('hosting-surface.json', baseUrl), /application\/json/i));
    const localReceipt = JSON.parse(await fs.readFile(path.join(packageRoot, 'hosting-surface.json'), 'utf8'));
    requireValue(receipt.id === `simulatte-${surface}` && receipt.schema === 'simulatte.hostingSurface.v1', 'Wrong hosting surface identity');
    result.package = { expected: localReceipt, observed: receipt };
    result.checks.packageIdentity = receipt.inventorySha256 === localReceipt.inventorySha256;
    if (!result.checks.packageIdentity) result.errors.push('Live package inventory differs from the expected package');
    result.inventorySha256 = receipt.inventorySha256;
    const html = await readRemote(baseUrl, /text\/html/i);
    const localHtml = await fs.readFile(path.join(packageRoot, 'index.html'));
    result.checks.entrypointBytes = digest(html) === digest(localHtml);
    if (!result.checks.entrypointBytes) result.errors.push('Live entrypoint bytes differ from the packaged entrypoint');
    const text = html.toString();
    const meta = [...text.matchAll(/<meta\b[^>]*>/gi)].find(([tag]) => attribute(tag, 'name') === 'simulatte-build');
    requireValue(attribute(meta?.[0] || '', 'content') === expectedBuild, 'HTML build metadata differs from version.json');
    result.checks.entrypointIdentity = true;
    const assets = entryAssets(text, baseUrl);
    requireValue(assets.some(asset => asset.kind === 'script' && asset.deferred), 'Entrypoint has no deferred application scripts');
    // Bounded batches retain a result for every asset, including failures.
    for (let offset = 0; offset < assets.length; offset += 4) {
      await Promise.all(assets.slice(offset, offset + 4).map(async asset => {
        const row = { ...asset, pass: false };
        result.assets.push(row);
        try {
          const url = new URL(asset.url), stamp = url.searchParams.get('v');
          requireValue(!asset.deferred || stamp === expectedBuild, `Deferred script has no matching build stamp: ${asset.url}`);
          requireValue(!stamp || stamp === expectedBuild, `Asset has a different build stamp: ${asset.url}`);
          const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
          const localPath = path.resolve(packageRoot, relative);
          requireValue(localPath.startsWith(path.resolve(packageRoot) + path.sep), 'Asset escapes package');
          const remote = await readRemote(asset.url, asset.kind === 'script' ? /(?:java|ecma)script/i : /text\/css/i);
          row.sha256 = digest(remote);
          requireValue(row.sha256 === digest(await fs.readFile(localPath)), `Live asset bytes differ: ${asset.url}`);
          row.pass = true;
        } catch (error) { row.error = error.message; }
      }));
    }
    result.assets.sort((a, b) => a.url.localeCompare(b.url));
    result.checks.entryAssets = result.assets.every(asset => asset.pass);
    result.pass = Object.values(result.checks).every(Boolean);
  } catch (error) { result.errors.push(error.message); }
  return result;
}
