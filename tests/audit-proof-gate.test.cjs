const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('pipeline scoring exits nonzero when a live Scene Proof fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-proof-gate-'));
  const prompt = 'warehouse robot arms sort parcels on conveyor belts';
  const liveReport = path.join(dir, 'live.json');
  const outDir = path.join(dir, 'score');
  fs.writeFileSync(liveReport, JSON.stringify({
    schema: 'simulatte.intentSceneScreenshotAudit.v1',
    intentMode: 'local',
    summary: { ok: false },
    results: [{
      prompt,
      sceneProofVerdict: 'fail',
      phase7PixelReadback: 'pass',
      phase7PixelProofStatus: 'pass',
      phase7PixelRequiredObligationCount: 1,
      phase7PixelSampledObligationCount: 1,
      canvasPerceptualHash: '0123456789abcdef',
    }],
  }));
  try {
    const result = spawnSync(process.execPath, [
      'tools/audit-pipeline-score.mjs',
      '--no-core',
      '--no-adversarial',
      '--no-human',
      '--prompt', prompt,
      '--live-report', liveReport,
      '--out', outDir,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, 'latest.json'), 'utf8'));
    assert.equal(report.verdict, 'fail');
    assert.equal(report.prompts[0].hardFailure, true);
    assert.match(report.failures.join('\n'), /required-live-proof-failed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
