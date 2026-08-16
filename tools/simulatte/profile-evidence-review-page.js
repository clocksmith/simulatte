const state = {
  data: null,
  filteredRows: [],
  currentRunId: '',
  imageKind: 'canvas',
};

const verdictCopy = Object.freeze({
  recognizability: ['Recognizability', 'Required subjects and outcomes are visually identifiable.'],
  composition: ['Composition', 'Layout communicates the declared relationships without obstruction.'],
  perceptualQuality: ['Perceptual quality', 'The image is legible and stable enough to evaluate.'],
  truthBoundaryLegibility: ['Truth-boundary legibility', 'Observed, modeled, simulated, and unsupported content remain distinguishable.'],
});

const elements = Object.fromEntries([
  'summary', 'run-filter', 'run-select', 'previous-run', 'next-run', 'queue-identity',
  'run-label', 'profile-label', 'review-status', 'prompt-text', 'build-id',
  'world-spec-id', 'scene-packet-id', 'screenshot-id', 'show-canvas', 'show-page',
  'evidence-image', 'evidence-caption', 'review-form', 'reviewer-id', 'verdict-fields',
  'review-note', 'submit-status', 'submit-review', 'review-list',
].map((id) => [id, document.getElementById(id)]));

function shortHash(value, length = 12) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function currentRow() {
  return state.data?.rows.find((row) => row.runId === state.currentRunId) || null;
}

function statusLabel(row) {
  return row?.review?.reviewStatus || (row?.machineStatus === 'blocked' ? 'blocked' : 'pending');
}

function filterRows() {
  const filter = elements['run-filter'].value;
  const rows = [...(state.data?.rows || [])];
  if (filter === 'all') return rows;
  if (filter === 'pending') {
    return rows.sort((left, right) => {
      const leftPending = statusLabel(left) === 'pending' ? 0 : 1;
      const rightPending = statusLabel(right) === 'pending' ? 0 : 1;
      return leftPending - rightPending || left.profileId.localeCompare(right.profileId);
    });
  }
  return rows.filter((row) => statusLabel(row) === filter);
}

function renderRunSelect() {
  state.filteredRows = filterRows();
  const select = elements['run-select'];
  select.replaceChildren();
  for (const row of state.filteredRows) {
    const option = document.createElement('option');
    option.value = row.runId;
    option.textContent = `${statusLabel(row).padEnd(8)} ${row.profileId} / ${row.seedId} / ${row.viewportId}`;
    select.append(option);
  }
  if (!state.filteredRows.some((row) => row.runId === state.currentRunId)) {
    state.currentRunId = state.filteredRows[0]?.runId || state.data?.rows[0]?.runId || '';
  }
  select.value = state.currentRunId;
}

function renderVerdictFields() {
  const fieldset = elements['verdict-fields'];
  const legend = fieldset.querySelector('legend');
  fieldset.replaceChildren(legend);
  for (const field of state.data?.requiredVerdicts || []) {
    const [label, description] = verdictCopy[field] || [field, 'Review this declared visual dimension.'];
    const row = document.createElement('div');
    row.className = 'verdict-row';
    const copy = document.createElement('p');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    strong.textContent = label;
    small.textContent = description;
    copy.append(strong, small);
    row.append(copy, verdictChoice(field, 'pass', 'Pass'), verdictChoice(field, 'fail', 'Fail'));
    fieldset.append(row);
  }
}

function verdictChoice(field, value, labelText) {
  const label = document.createElement('label');
  label.className = 'verdict-choice';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = `verdict-${field}`;
  input.value = value;
  input.dataset.verdictField = field;
  input.required = true;
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function renderSummary() {
  const summary = state.data?.summary || {};
  elements.summary.textContent = `${summary.pass || 0} pass / ${summary.pending || 0} pending / ${summary.conflict || 0} conflict / ${summary.fail || 0} fail`;
  elements['queue-identity'].textContent = `queue ${state.data?.queueSha256 || 'unavailable'}\nindex ${state.data?.evidenceIndexSha256 || 'unavailable'}`;
}

function renderEvidenceImage(row) {
  const evidence = state.imageKind === 'page' ? row.pageScreenshot : row.canvasScreenshot;
  if (!evidence) {
    elements['evidence-image'].removeAttribute('src');
    elements['evidence-image'].alt = '';
    elements['evidence-image'].hidden = true;
    elements['evidence-caption'].textContent = 'Machine evidence did not produce a reviewable screenshot.';
    return;
  }
  elements['evidence-image'].hidden = false;
  elements['evidence-image'].src = `/api/assets/${evidence.sha256}`;
  elements['evidence-image'].alt = `${row.profileId} ${state.imageKind} evidence for ${row.seedId}`;
  elements['evidence-caption'].textContent = `${state.imageKind} sha256:${evidence.sha256}`;
  elements['show-canvas'].setAttribute('aria-pressed', String(state.imageKind === 'canvas'));
  elements['show-page'].setAttribute('aria-pressed', String(state.imageKind === 'page'));
}

function renderReviews(row) {
  const list = elements['review-list'];
  list.replaceChildren();
  const reviews = row.review?.reviews || [];
  if (!reviews.length) {
    const item = document.createElement('li');
    item.textContent = 'No human review receipt is bound to this run.';
    list.append(item);
    return;
  }
  for (const review of reviews) {
    const item = document.createElement('li');
    const failed = Object.entries(review.verdict || {})
      .filter(([field, verdict]) => field !== 'overall' && verdict === 'fail')
      .map(([field]) => verdictCopy[field]?.[0] || field);
    const summary = failed.length ? `fail: ${failed.join(', ')}` : review.verdict?.overall || 'invalid';
    item.textContent = `${review.reviewerId}: ${summary} at ${review.reviewedAt} (${shortHash(review.sha256)})`;
    if (review.note) {
      const note = document.createElement('blockquote');
      note.textContent = review.note;
      item.append(note);
    }
    list.append(item);
  }
}

function clearReviewInputs() {
  elements['review-note'].value = '';
  for (const input of document.querySelectorAll('[data-verdict-field]')) input.checked = false;
}

function renderCurrentRun() {
  const row = currentRow();
  if (!row) return;
  elements['run-select'].value = row.runId;
  elements['run-label'].textContent = `${row.seedId} / ${row.viewportId}`;
  elements['profile-label'].textContent = row.profileId;
  const status = statusLabel(row);
  elements['review-status'].textContent = status;
  elements['review-status'].dataset.status = status;
  elements['prompt-text'].textContent = row.prompt?.text || 'Machine evidence failed before a reviewable prompt artifact was produced.';
  elements['build-id'].textContent = row.buildIdentity?.buildId || 'unavailable';
  elements['world-spec-id'].textContent = row.worldSpec
    ? `${row.worldSpec.id} / ${shortHash(row.worldSpec.sha256)}`
    : 'unavailable';
  elements['scene-packet-id'].textContent = row.scenePacketIdentity
    ? `${row.scenePacketIdentity.lane} / ${shortHash(row.scenePacketIdentity.sha256)}`
    : 'unavailable';
  elements['screenshot-id'].textContent = row.canvasScreenshot
    ? shortHash(row.canvasScreenshot.sha256)
    : 'unavailable';
  elements['submit-review'].disabled = row.machineStatus !== 'ready';
  elements['submit-status'].textContent = row.machineStatus === 'ready'
    ? 'Submission creates a new content-addressed receipt.'
    : 'Machine evidence is not ready for human adjudication.';
  renderEvidenceImage(row);
  renderReviews(row);
  clearReviewInputs();
}

function move(delta) {
  if (!state.filteredRows.length) return;
  const currentIndex = Math.max(0, state.filteredRows.findIndex((row) => row.runId === state.currentRunId));
  const nextIndex = (currentIndex + delta + state.filteredRows.length) % state.filteredRows.length;
  state.currentRunId = state.filteredRows[nextIndex].runId;
  renderCurrentRun();
}

async function loadQueue(preferredRunId = '') {
  const response = await fetch('/api/queue', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Queue request failed with ${response.status}`);
  state.data = await response.json();
  if (preferredRunId) state.currentRunId = preferredRunId;
  renderSummary();
  renderVerdictFields();
  renderRunSelect();
  renderCurrentRun();
  document.body.dataset.reviewReady = 'true';
}

function selectedVerdict() {
  return Object.fromEntries((state.data.requiredVerdicts || []).map((field) => {
    const selected = document.querySelector(`[name="verdict-${field}"]:checked`);
    if (!selected) throw new Error(`Choose pass or fail for ${verdictCopy[field]?.[0] || field}`);
    return [field, selected.value];
  }));
}

async function submitReview(event) {
  event.preventDefault();
  const row = currentRow();
  if (!row) return;
  elements['submit-review'].disabled = true;
  elements['submit-status'].textContent = 'Binding review receipt...';
  try {
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: row.runId,
        reviewerId: elements['reviewer-id'].value,
        verdict: selectedVerdict(),
        note: elements['review-note'].value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Review request failed with ${response.status}`);
    elements['submit-status'].textContent = `Stored immutable receipt ${shortHash(result.reviewSha256)}.`;
    await loadQueue(row.runId);
  } catch (error) {
    elements['submit-status'].textContent = error.message;
    elements['submit-review'].disabled = row.machineStatus !== 'ready';
  }
}

elements['run-filter'].addEventListener('change', () => {
  renderRunSelect();
  renderCurrentRun();
});
elements['run-select'].addEventListener('change', () => {
  state.currentRunId = elements['run-select'].value;
  renderCurrentRun();
});
elements['previous-run'].addEventListener('click', () => move(-1));
elements['next-run'].addEventListener('click', () => move(1));
elements['show-canvas'].addEventListener('click', () => {
  state.imageKind = 'canvas';
  renderEvidenceImage(currentRow());
});
elements['show-page'].addEventListener('click', () => {
  state.imageKind = 'page';
  renderEvidenceImage(currentRow());
});
elements['review-form'].addEventListener('submit', submitReview);

loadQueue().catch((error) => {
  elements.summary.textContent = error.message;
  document.body.dataset.reviewReady = 'error';
});
