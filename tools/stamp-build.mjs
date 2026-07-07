import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

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

function publicFiles(dir, baseDir = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...publicFiles(filePath, baseDir));
      continue;
    }
    files.push(path.relative(baseDir, filePath).replaceAll(path.sep, '/'));
  }
  return files.sort();
}

function normalizedDeployContent(relativePath, content) {
  if (relativePath === 'version.json') return null;
  if (relativePath !== 'index.html') return content;
  return content
    .replace(
      /<meta\s+name="simulatte-build"\s+content="[^"]*"\s*\/?>/i,
      '<meta name="simulatte-build" content="BUILD-STAMP">'
    )
    .replace(
      /(<script\s+defer\s+src="\.\/[^"?]+\.js)(?:\?v=[^"]*)?("><\/script>)/g,
      '$1?v=BUILD-STAMP$2'
    );
}

function getDeployContentHash() {
  const publicDir = path.join(rootDir, 'public');
  const hash = crypto.createHash('sha256');
  for (const relativePath of publicFiles(publicDir)) {
    const filePath = path.join(publicDir, relativePath);
    const content = relativePath === 'index.html'
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

function main() {
  const buildHash = `${getGitHash()}-${getDeployContentHash()}`;
  const buildParam = encodeURIComponent(buildHash);
  console.log(`Generated build stamp: ${buildHash}`);

  // 1. Update index.html
  const indexPath = path.join(rootDir, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');
    const metaRegex = /<meta\s+name="simulatte-build"\s+content="[^"]*"\s*\/?>/i;
    
    if (metaRegex.test(indexHtml)) {
      indexHtml = indexHtml.replace(
        metaRegex,
        `<meta name="simulatte-build" content="${buildHash}">`
      );
      const scriptRegex = /(<script\s+defer\s+src=")(\.\/[^"?]+\.js)(?:\?v=[^"]*)?("><\/script>)/g;
      let scriptCount = 0;
      indexHtml = indexHtml.replace(scriptRegex, (_match, open, src, close) => {
        scriptCount += 1;
        return `${open}${src}?v=${buildParam}${close}`;
      });
      fs.writeFileSync(indexPath, indexHtml, 'utf8');
      console.log(`Updated meta tag in public/index.html to build content="${buildHash}"`);
      console.log(`Updated ${scriptCount} deferred script URLs with build query`);
    } else {
      console.warn('Warning: Could not find <meta name="simulatte-build"> in index.html');
    }
  } else {
    console.error(`Error: index.html not found at ${indexPath}`);
  }

  // 2. Write version.json
  const versionPath = path.join(rootDir, 'public', 'version.json');
  const versionData = JSON.stringify({ build: buildHash }, null, 2);
  fs.writeFileSync(versionPath, versionData, 'utf8');
  console.log(`Wrote version.json at ${versionPath}`);
}

main();
