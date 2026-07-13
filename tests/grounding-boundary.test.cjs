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
