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

test('part construction requires parent geometry bindings and matching pixel proof', async () => {
  const { phase3ConstructionGate } = await import('../tools/visual-audit-report.mjs');
  const row = {
    phase3SlotCandidates: [{ slotId: 'slot.part.eye', slotRole: 'part', required: true, candidates: [] }],
    phase3SlotEvidence: [{ slotId: 'slot.part.eye', entryId: 'part:eye' }],
    phase7VisualObligationProof: [{ obligationId: 'part:eye', required: true, status: 'pass',
      geometrySatisfied: true, packetSatisfied: true, pixelSatisfied: true }],
    sceneRenderPacketIdentities: [{ id: 'robot-1', literal: true, grammarId: 'object-grammar.robot-character',
      partIds: ['eye-left', 'eye-right'], propertyBindings: [{ schema: 'simulatte.promptGeometryBinding.v1',
        entityId: 'robot-1', partId: 'prompt-part-eye', status: 'bound', matchedPartIds: ['eye-left', 'eye-right'] }] }]
  };
  assert.equal(phase3ConstructionGate(row).missingSlots.length, 0);
  assert.equal(phase3ConstructionGate({ ...row, phase7VisualObligationProof: JSON.stringify(row.phase7VisualObligationProof) }).missingSlots.length, 0);
  for (const corrupt of [
    copy => { copy.sceneRenderPacketIdentities[0].partIds = ['eye-left']; },
    copy => { copy.sceneRenderPacketIdentities[0].propertyBindings[0].entityId = 'another-robot'; },
    copy => { copy.sceneRenderPacketIdentities[0].propertyBindings[0].partId = 'prompt-part-arm'; },
    copy => { copy.phase7VisualObligationProof[0].pixelSatisfied = false; },
    copy => { copy.phase7VisualObligationProof[0].obligationId = 'part:arm'; },
    copy => { copy.sceneRenderPacketIdentities[0].unsupportedIdentity = true; }
  ]) {
    const copy = structuredClone(row); corrupt(copy);
    assert.equal(phase3ConstructionGate(copy).missingSlots.length, 1);
  }
});
