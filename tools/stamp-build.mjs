import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getGitHash() {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir }).toString().trim();
  } catch (err) {
    console.warn('Warning: Failed to retrieve git commit hash. Falling back to timestamp.', err);
    return `timestamp-${Date.now()}`;
  }
}

function main() {
  const buildHash = getGitHash();
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
      fs.writeFileSync(indexPath, indexHtml, 'utf8');
      console.log(`Updated meta tag in public/index.html to build content="${buildHash}"`);
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
