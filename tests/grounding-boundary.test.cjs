const assert = require('node:assert/strict');
const test = require('node:test');

const candidates = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-universe-grounder-candidates.js');
const grounder = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-universe-grounder.js');

test('support-only retrieval evidence cannot become a renderable grounded identity', () => {
  const support = {
    id: 'prompt.concept.renderer',
    label: 'renderer',
    canonicalId: 'prompt.concept.renderer',
    semanticType: 'concept',
    indexName: 'prompt-typed-slot',
    identityEvidence: true,
    supportOnly: true,
    score: 1,
  };
  const rows = candidates.candidateRowsForInput({
    universeMatches: { candidates: [support] },
    intentBrief: { retrievedEvidence: [support] },
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.supportOnly === true));

  const graph = grounder.groundUniverseGraph({
    prompt: 'renderer layers soot',
    promptParse: {
      prompt: 'renderer layers soot',
      spans: [{ id: 'span1', text: 'renderer', kind: 'term' }],
      clauses: [],
    },
    universeMatches: { candidates: [support] },
    intentBrief: { retrievedEvidence: [support] },
  });
  const renderer = graph.nodes.find((node) => node.label.toLowerCase() === 'renderer');
  assert.ok(renderer);
  assert.equal(renderer.supportOnly, true);
  assert.equal(renderer.directlyGrounded, false);
  assert.equal(graph.nodes.filter((node) => node.supportOnly !== true).length, 0);
});

test('a conflicting duplicate cannot promote prompt concept evidence into an entity', () => {
  const support = {
    id: 'prompt.concept.renderer',
    label: 'renderer',
    canonicalId: 'prompt.concept.renderer',
    semanticType: 'concept',
    indexName: 'prompt-typed-slot',
    identityEvidence: true,
    supportOnly: true,
    score: 1,
  };
  const conflicting = {
    ...support,
    id: 'retrieved.renderer',
    indexName: 'universe-index',
    supportOnly: false,
    score: 0.8,
  };
  const graph = grounder.groundUniverseGraph({
    prompt: 'renderer layers soot',
    promptParse: {
      prompt: 'renderer layers soot',
      spans: [{ id: 'span1', text: 'renderer', kind: 'term' }],
      clauses: [],
    },
    universeMatches: { candidates: [support, conflicting] },
    intentBrief: { retrievedEvidence: [support, conflicting] },
  });
  const renderer = graph.nodes.find((node) => node.label.toLowerCase() === 'renderer');
  assert.ok(renderer);
  assert.equal(renderer.supportOnly, true);
  assert.equal(renderer.directlyGrounded, false);
});

test('a synthesized context match cannot inject an unrelated physical identity', () => {
  const prompt = 'warehouse fire with smoke';
  const promptRows = ['warehouse', 'fire', 'smoke'].map((label) => ({
    id: `prompt.body.${label}`,
    label,
    canonicalId: `prompt.body.${label}`,
    semanticType: 'body',
    indexName: 'prompt-typed-slot',
    identityEvidence: true,
    supportOnly: false,
    score: 1,
    aliases: [label],
  }));
  const graph = grounder.groundUniverseGraph({
    prompt,
    promptParse: {
      prompt,
      spans: promptRows.map((row, index) => ({
        id: `span${index + 1}`,
        text: row.label,
        kind: 'entity',
        entityClass: row.label,
      })),
      clauses: [],
    },
    components: [{
      id: 'rocket-a',
      role: 'rocket',
      phrase: 'fire',
      source: 'embedding-guided-synth-node',
      score: 0.99,
      type: 'assembly',
      domains: ['rigidBody'],
    }],
    universeMatches: { candidates: promptRows },
    intentBrief: { retrievedEvidence: promptRows },
  });
  const fire = graph.nodes.find((node) => node.label.toLowerCase() === 'fire');

  assert.ok(fire);
  assert.equal(graph.nodes.some((node) => /rocket/.test(`${node.id} ${node.label}`)), false);
  assert.equal((fire.aliases || []).some((alias) => /rocket/.test(alias)), false);
  assert.equal((fire.primitiveHints || []).includes('rocket-a'), false);
  assert.ok(graph.rejected.some((row) => (
    row.label === 'rocket' && row.reason === 'generated row identity lacks prompt evidence'
  )));
});

test('qualified candidate ids do not cross-pollinate unrelated prompt nodes', () => {
  const promptRows = [
    { label: 'warehouse', primitiveHint: 'warehouse-shell' },
    { label: 'smoke', primitiveHint: 'smoke-plume' },
  ].map(({ label, primitiveHint }) => ({
    id: `prompt.body.${label}`,
    label,
    canonicalId: `prompt.body.${label}`,
    semanticType: 'body',
    indexName: 'prompt-typed-slot',
    identityEvidence: true,
    supportOnly: false,
    score: 1,
    aliases: [label],
    primitiveHints: [primitiveHint],
  }));
  const graph = grounder.groundUniverseGraph({
    prompt: 'warehouse smoke',
    promptParse: {
      prompt: 'warehouse smoke',
      spans: promptRows.map((row, index) => ({
        id: `span${index + 1}`,
        text: row.label,
        kind: 'entity',
        entityClass: row.label,
      })),
      clauses: [],
    },
    universeMatches: { candidates: promptRows },
    intentBrief: { retrievedEvidence: [] },
  });
  const mappings = new Map(graph.primitiveMapping.rows.map((row) => [row.label.toLowerCase(), row]));

  assert.deepEqual(mappings.get('warehouse').primitiveHints, ['warehouse-shell']);
  assert.deepEqual(mappings.get('smoke').primitiveHints, ['smoke-plume']);
  assert.deepEqual(graph.candidateMatchReceipt, {
    schema: 'simulatte.groundingCandidateMatchReceipt.v1',
    policy: 'exact-identity-or-unqualified-label-overlap',
    nodeCount: 2,
    candidateRowCount: 2,
    pairEvaluationCount: 4,
    matchedRowCount: 2,
    scanPasses: 1,
  });
});
