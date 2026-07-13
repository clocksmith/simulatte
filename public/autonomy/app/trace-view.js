(function attachAutonomyTraceView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyTraceView = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyTraceView() {
  function createTraceView(elements) {
    function renderTick(entry, snapshot) {
      const receipt = entry.payload;
      if (receipt.schema !== 'simulatte.autonomyTickReceipt.v1') {
        renderFailure(receipt);
        return;
      }
      const selected = receipt.bets.find((row) => row.bet.id === receipt.selectedBetId);
      elements.decisionTitle.textContent = selected ? label(selected.bet.action.maneuver) : 'No decision';
      elements.decisionMeta.textContent = selected
        ? `Tick ${receipt.tick} | ${format(selected.utility)} utility | ${format(selected.bet.confidence * 100)}% confidence`
        : `Tick ${receipt.tick}`;
      elements.betList.replaceChildren(...receipt.bets.map((row) => betRow(row, receipt.selectedBetId)));
      const traceRow = document.createElement('article');
      traceRow.className = `trace-row${selected ? ' is-selected' : ''}`;
      const rejected = receipt.bets.filter((row) => !row.gate.accepted).length;
      traceRow.innerHTML = `
        <div class="trace-row-head">
          <span>Tick ${receipt.tick}</span>
          <span>${escapeHtml(selected ? label(selected.bet.action.maneuver) : 'failure')}</span>
        </div>
        <div class="trace-row-meta">${format(receipt.transition.progressDeltaM)} m | ${format(receipt.transition.endSpeedMps)} m/s | ${rejected} gated | ${receipt.settlement.verdict}</div>
      `;
      elements.traceList.prepend(traceRow);
      while (elements.traceList.children.length > 80) elements.traceList.lastElementChild.remove();
      renderMetrics(snapshot, selected, receipt);
    }

    function renderInitial(snapshot) {
      elements.decisionTitle.textContent = 'Awaiting first observation';
      elements.decisionMeta.textContent = 'No action selected';
      elements.betList.replaceChildren();
      elements.traceList.replaceChildren();
      renderMetrics(snapshot, null, null);
    }

    function renderFailure(receipt) {
      elements.decisionTitle.textContent = 'Agent stopped';
      elements.decisionMeta.textContent = receipt.message || receipt.code || 'Runtime failure';
      const traceRow = document.createElement('article');
      traceRow.className = 'trace-row is-failure';
      traceRow.textContent = `${receipt.code || 'runtime_failure'}: ${receipt.message || 'No message'}`;
      elements.traceList.prepend(traceRow);
    }

    function renderMetrics(snapshot, selected, receipt) {
      const state = snapshot.state;
      setText(elements.metricState, state.status);
      setText(elements.metricTick, state.tick);
      setText(elements.metricSpeed, `${format(state.speedMps)} m/s`);
      setText(elements.metricDistance, `${format(state.distanceTraveledM)} m`);
      setText(elements.metricRoute, snapshot.route ? `${snapshot.route.segmentIds.length} segment(s)` : 'unplanned');
      setText(elements.metricBet, selected ? label(selected.bet.action.maneuver) : 'none');
      setText(elements.metricSettlement, receipt ? receipt.settlement.verdict : 'none');
      setText(elements.metricCalibration, `${snapshot.policyMemory.wonBetCount} / ${snapshot.policyMemory.settledBetCount}`);
    }

    return { renderTick, renderInitial, renderFailure };
  }

  function betRow(row, selectedBetId) {
    const element = document.createElement('div');
    const selected = row.bet.id === selectedBetId;
    element.className = `bet-row${selected ? ' is-selected' : ''}${row.gate.accepted ? '' : ' is-rejected'}`;
    const state = selected ? 'selected' : row.gate.accepted ? 'eligible' : row.gate.blockingCheckIds.join(', ');
    element.innerHTML = `
      <span class="bet-name">${escapeHtml(label(row.bet.action.maneuver))}</span>
      <span class="bet-prediction">${format(row.bet.prediction.progressDeltaM)} m | ${row.bet.prediction.clearanceIsLowerBound ? '&gt;=' : ''}${format(row.bet.prediction.minimumClearanceM)} m clear</span>
      <span class="bet-state">${escapeHtml(state)}</span>
    `;
    return element;
  }

  function label(value) {
    return String(value || '').replaceAll('_', ' ').replace(/^./, (row) => row.toUpperCase());
  }

  function format(value) {
    return Number(value || 0).toFixed(1).replace(/\.0$/, '');
  }

  function setText(element, value) {
    if (element) element.textContent = String(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
  }

  return { createTraceView, label, format };
});
