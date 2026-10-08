import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'ptrvilya/cosmi';
async function get(url) {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`COSMI acquisition failed: ${response.status} ${url}`);
  return response.json();
}
const commit = await get(`https://api.github.com/repos/${repository}/commits/main`);
const [tree, releases] = await Promise.all([
  get(`https://api.github.com/repos/${repository}/git/trees/${commit.sha}?recursive=1`),
  get(`https://api.github.com/repos/${repository}/releases`),
]);
if (tree.truncated) throw new Error('COSMI artifact listing is incomplete');
const files = tree.tree.filter(row => row.type === 'blob').map(row => ({ path: row.path, gitBlobSha: row.sha, sizeBytes: row.size }));
const code = files.filter(row => /\.(?:py|js|onnx|wgsl)$/.test(row.path));
const checkpointFiles = files.filter(row => /\.(?:pt|pth|ckpt|safetensors|onnx)$/.test(row.path));
const assets = releases.flatMap(release => release.assets.map(asset => ({ url: asset.browser_download_url, sizeBytes: asset.size, digest: asset.digest })));
const blockers = [];
if (!code.length) blockers.push('Official repository has no model implementation or inference entrypoint');
if (!checkpointFiles.length && !assets.length) blockers.push('Official repository and releases have no checkpoints');
blockers.push('No COSMI checkpoint, SMPL-X mapping, licensed body assets or qualified Doppler motion execution is installed');
const report = { schema: 'simulatte.cosmiAcquisitionReceipt.v1', checkedAt: new Date().toISOString(),
  repositoryUrl: `https://github.com/${repository}`, projectUrl: 'https://ptrvilya.github.io/cosmi/',
  paperUrl: 'https://arxiv.org/abs/2610.03252', commitSha: commit.sha, treeSha: tree.sha,
  files, code, checkpointFiles, releaseAssets: assets, status: 'blocked', blockers,
  inferenceExecuted: false, claim: 'Acquisition evidence only; no procedural fixture is COSMI inference' };
const output = path.join(root, 'artifacts/activity-program/cosmi-acquisition.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(root, output), commitSha: commit.sha, status: report.status, blockers }));
process.exitCode = 2;
