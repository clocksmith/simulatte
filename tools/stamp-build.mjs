import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ENTRYPOINTS, HOSTING_SURFACES, parseSurfaceArgs, sourceFiles } from './hosting-surface-inputs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getGitHash() {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir }).toString().trim();
  } catch (err) {
    console.warn('Warning: Failed to retrieve git commit hash. Falling back to content-only stamp.', err);
    return 'nogit';
  }
}

function normalizedDeployContent(relativePath, content) {
  if (relativePath === 'version.json') return null;
  if (!ENTRYPOINTS.includes(relativePath)) return content;
  return content
    .replace(
      /<meta\s+name="simulatte-build"\s+content="[^"]*"\s*\/?>/i,
      '<meta name="simulatte-build" content="BUILD-STAMP">'
    )
    .replace(
      /(<script\s+defer\s+src="(?:\.\/|\.\.\/|\/)[^"?]+\.js)(?:\?v=[^"]*)?(")/g,
      '$1?v=BUILD-STAMP$2'
    )
    .replace(
      /(<link\b[^>]*\bhref=")((?:\.\/|\.\.\/)[^"?]+\.css)(?:\?v=[^"]*)?(")/g,
      '$1$2?v=BUILD-STAMP$3'
    );
}

function getDeployContentHash() {
  const publicDir = path.join(rootDir, 'public');
  const hash = crypto.createHash('sha256');
  for (const relativePath of sourceFiles(publicDir).sort()) {
    const filePath = path.join(publicDir, relativePath);
    const content = ENTRYPOINTS.includes(relativePath)
      ? fs.readFileSync(filePath, 'utf8')
      : fs.readFileSync(filePath);
    const normalized = normalizedDeployContent(relativePath, content);
    if (normalized === null) continue;
    hash.update(relativePath);
    hash.update('\0');
    hash.update(normalized);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

function stampEntrypoint(relativePath, buildHash, buildParam) {
  const indexPath = path.join(rootDir, 'public', relativePath);
  if (fs.existsSync(indexPath)) {
    const original = fs.readFileSync(indexPath, 'utf8');
    let indexHtml = original;
    const metaRegex = /<meta\s+name="simulatte-build"\s+content="[^"]*"\s*\/?>/i;
    
    if (metaRegex.test(indexHtml)) {
      indexHtml = indexHtml.replace(
        metaRegex,
        `<meta name="simulatte-build" content="${buildHash}">`
      );
      const scriptRegex = /(<script\s+defer\s+src=")((?:\.\/|\.\.\/|\/)[^"?]+\.js)(?:\?v=[^"]*)?(")/g;
      const stylesheetRegex = /(<link\b[^>]*\bhref=")((?:\.\/|\.\.\/)[^"?]+\.css)(?:\?v=[^"]*)?(")/g;
      let scriptCount = 0;
      let stylesheetCount = 0;
      indexHtml = indexHtml.replace(scriptRegex, (_match, open, src, close) => {
        scriptCount += 1;
        return `${open}${src}?v=${buildParam}${close}`;
      });
      indexHtml = indexHtml.replace(stylesheetRegex, (_match, open, href, close) => {
        stylesheetCount += 1;
        return `${open}${href}?v=${buildParam}${close}`;
      });
      if (indexHtml === original) {
        console.log(`Unchanged public/${relativePath}`);
        return;
      }
      fs.writeFileSync(indexPath, indexHtml, 'utf8');
      console.log(`Updated public/${relativePath} to build content="${buildHash}"`);
      console.log(`Updated ${scriptCount} deferred script URLs in public/${relativePath}`);
      console.log(`Updated ${stylesheetCount} stylesheet URLs in public/${relativePath}`);
    } else {
      throw new Error(`Could not find <meta name="simulatte-build"> in public/${relativePath}`);
    }
  } else {
    throw new Error(`Entrypoint not found at ${indexPath}`);
  }
}

function main() {
  const { surfaces } = parseSurfaceArgs(process.argv.slice(2));
  const entrypoints = surfaces.flatMap(surface => HOSTING_SURFACES[surface].entrypoints);
  sourceFiles(path.join(rootDir, 'public'), entrypoints);
  for (const entrypoint of entrypoints) {
    const source = fs.readFileSync(path.join(rootDir, 'public', entrypoint), 'utf8');
    if (!/<meta\s+name="simulatte-build"\s+content="[^"]*"\s*\/?>/i.test(source)) {
      throw new Error(`Could not find <meta name="simulatte-build"> in public/${entrypoint}`);
    }
  }
  const buildHash = `${getGitHash()}-${getDeployContentHash()}`;
  const buildParam = encodeURIComponent(buildHash);
  console.log(`Generated build stamp: ${buildHash}`);

  for (const entrypoint of entrypoints) stampEntrypoint(entrypoint, buildHash, buildParam);

  const versionPath = path.join(rootDir, 'public', 'version.json');
  const versionData = JSON.stringify({ build: buildHash }, null, 2);
  if (!fs.existsSync(versionPath) || fs.readFileSync(versionPath, 'utf8') !== versionData) {
    fs.writeFileSync(versionPath, versionData, 'utf8');
    console.log(`Wrote version.json at ${versionPath}`);
  } else console.log('Unchanged public/version.json');
  if (surfaces.length === 1) console.log('Only selected entrypoints were stamped. The other surface is not prepared for this global build; prepare both for shared changes.');
}

try { main(); } catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
