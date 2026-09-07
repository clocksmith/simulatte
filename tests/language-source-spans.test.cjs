const test = require('node:test');
const assert = require('node:assert/strict');
const language = require('../public/blank/pipeline/phase-02-language/simulatte-language-evidence.js');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');

test('runtime ingress and Phase 2 retain original whitespace and UTF-16 source coordinates', () => {
  const prompt = '  🌕 Three\t glass lanterns\n circle a tree.\n  The tree never moves.  ';
  const runtime = model.runPhase1RuntimeGate(prompt, { deterministicRuntime: true });
  assert.equal(runtime.artifact.promptIngress.sourceText, prompt);
  const result = model.runPhase2LanguageGraph(runtime);
  assert.equal(result.artifact.languageGraph.sourceText, prompt);
  for (const token of result.artifact.languageGraph.tokens) {
    assert.equal(prompt.slice(token.start, token.end).toLowerCase(), token.text.toLowerCase());
  }
});

test('normalized evidence retains source spans across tabs, newlines, Unicode and repeated mentions', () => {
  const prompt = '  🌕 Three\t glass lanterns\n circle a tree;\t tree never moves.  ';
  const evidence = language.extractLanguageEvidence(prompt);
  assert.equal(evidence.normalizedText, '🌕 Three glass lanterns circle a tree; tree never moves.');
  assert.equal(evidence.normalization.coordinateSystem, 'utf16-half-open');
  for (const token of evidence.tokens) {
    assert.equal(token.sourceSpans.length, 1);
    assert.equal(token.sourceSpans[0].text, token.text);
  }
  const trees = evidence.tokens.filter(token => token.text === 'tree');
  assert.equal(trees.length, 2);
  assert.notEqual(trees[0].sourceSpans[0].start, trees[1].sourceSpans[0].start);
  for (const rows of Object.values(evidence).filter(Array.isArray)) {
    for (const row of rows) for (const span of row.sourceSpans || []) {
      assert.equal(prompt.slice(span.start, span.end), span.text);
      assert.ok(span.start >= 0 && span.end <= prompt.length);
    }
  }
  const negation = evidence.negations.find(row => row.text === 'never');
  assert.equal(negation.sourceSpans[0].start, prompt.indexOf('never'));
  const clause = evidence.clauses.find(row => row.text.includes('Three'));
  assert.match(clause.sourceSpans[0].text, /Three\t glass lanterns\n/);
});

test('normalization is reversible using retained verbatim segments and original source', () => {
  for (const source of ['', ' \n\t ', 'İ 🌕\r\n\t A', '\tA\u00a0B\n']) {
    const mapping = language.normalizeSourceWhitespace(source);
    assert.equal(mapping.text, source.replace(/\s+/g, ' ').trim());
    assert.equal(mapping.segments.map(segment => segment.kind === 'whitespace' ? ' ' : source.slice(segment.sourceStart, segment.sourceEnd)).join(''), mapping.text);
    assert.doesNotThrow(() => language.extractLanguageEvidence(source));
  }
});

test('authored WorldSpec projection preserves the original request through retrieval and grounding', () => {
  const prompt = '  two\t cats  ';
  const spec = model.createSpecFromPrompt(prompt, { deterministicRuntime: true });
  assert.equal(spec.intent.prompt, prompt);
  assert.equal(spec.source.prompt, prompt);
  assert.equal(spec.phaseArtifacts.phase1.artifact.promptIngress.sourceText, prompt);
  assert.equal(spec.phaseArtifacts.phase2.artifact.languageGraph.sourceText, prompt);
});
