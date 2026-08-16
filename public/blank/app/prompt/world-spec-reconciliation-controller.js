(function attachSimulatteWorldSpecReconciliationController(root, factory) {
  const reconciliation = typeof module === 'object' && module.exports
    ? require('../../../shared/contracts/world-spec-reconciliation.js')
    : root.SimulatteWorldSpecReconciliation;
  if (!reconciliation) {
    throw new Error('WorldSpec reconciliation controller requires the reconciliation contract');
  }
  const api = factory(reconciliation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldSpecReconciliationController = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createControllerApi(reconciliation) {
  function connect(documentRoot, options = {}) {
    const dialog = documentRoot.getElementById('world-spec-reconciliation-dialog');
    const summary = documentRoot.getElementById('world-spec-reconciliation-summary');
    const conflict = documentRoot.getElementById('world-spec-reconciliation-conflicts');
    const fields = documentRoot.getElementById('world-spec-reconciliation-fields');
    const preserveButton = documentRoot.getElementById('preserve-world-spec-overrides');
    const freshButton = documentRoot.getElementById('accept-recompiled-world-spec');
    const cancelButton = documentRoot.getElementById('cancel-world-spec-reconciliation');
    if (!dialog || !summary || !conflict || !fields || !preserveButton || !freshButton || !cancelButton) {
      throw new Error('WorldSpec reconciliation controls are incomplete');
    }
    let pending = null;
    let latestReceipt = null;
    const publishRuntime = typeof options.publishRuntime === 'function'
      ? options.publishRuntime
      : () => {};

    function resolve(authoredSpec, compiledSpec) {
      if (!reconciliation.needsReconciliation(authoredSpec)) {
        return Promise.resolve(Object.freeze({ worldSpec: compiledSpec, receipt: null }));
      }
      abort('superseded');
      const plan = reconciliation.createPlan(authoredSpec, compiledSpec);
      renderPlan(plan);
      publishRuntime({
        state: 'active',
        blocking: true,
        stage: 'reconciliation',
        percent: 96,
        message: 'Accepted edits require a decision',
        detail: `${plan.acceptedPatchIds.length} edits, ${plan.conflictCount} compiler conflicts`,
        canvasLoading: false,
      });
      if (typeof options.onPending === 'function') options.onPending(plan);
      return new Promise((resolvePromise) => {
        pending = { authoredSpec, compiledSpec, plan, resolve: resolvePromise };
        dialog.dataset.state = 'pending';
        dialog.dataset.planId = plan.id;
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      });
    }

    function renderPlan(plan) {
      const patchWord = plan.acceptedPatchIds.length === 1 ? 'edit' : 'edits';
      summary.textContent = `${plan.acceptedPatchIds.length} accepted ${patchWord} would be replaced by this compilation.`;
      conflict.textContent = plan.unavailableCount
        ? `${plan.unavailableCount} affected field${plan.unavailableCount === 1 ? '' : 's'} no longer exists. Keeping every edit is unavailable.`
        : plan.conflictCount
          ? `${plan.conflictCount} field${plan.conflictCount === 1 ? '' : 's'} also changed in the new compilation.`
          : 'The new compilation can retain every accepted edit.';
      conflict.dataset.state = plan.unavailableCount ? 'error' : plan.conflictCount ? 'conflict' : 'ready';
      preserveButton.disabled = !plan.preserveAllowed;
      fields.replaceChildren(...plan.effectiveOverrides.map((row) => {
        const item = documentRoot.createElement('li');
        const path = documentRoot.createElement('code');
        path.textContent = row.targetPath;
        const state = documentRoot.createElement('span');
        state.textContent = statusLabel(row.status);
        item.append(path, state);
        return item;
      }));
    }

    function decide(decision) {
      if (!pending) return null;
      const active = pending;
      try {
        const result = reconciliation.applyDecision(
          active.authoredSpec,
          active.compiledSpec,
          decision,
          { planId: active.plan.id, decidedBy: String(options.decidedBy || 'local-user') }
        );
        latestReceipt = result.receipt;
        dialog.dataset.receipt = JSON.stringify(result.receipt);
        finish(active, result, decision);
        publishRuntime({
          state: 'active',
          blocking: false,
          stage: 'reconciliation-settled',
          percent: 97,
          message: decision === 'preserve-overrides'
            ? 'Accepted edits preserved'
            : 'Fresh compilation accepted',
          canvasLoading: false,
        });
        if (typeof options.onDecision === 'function') options.onDecision(result.receipt);
        return result;
      } catch (error) {
        conflict.textContent = error && error.message ? error.message : String(error || 'Reconciliation failed');
        conflict.dataset.state = 'error';
        publishRuntime({
          state: 'error',
          blocking: true,
          stage: 'reconciliation-error',
          percent: 100,
          message: 'WorldSpec reconciliation failed',
          detail: conflict.textContent,
          canvasLoading: false,
        });
        if (typeof options.onError === 'function') options.onError(error);
        return null;
      }
    }

    function abort(reason = 'cancelled') {
      if (!pending) return false;
      const active = pending;
      finish(active, null, reason);
      publishRuntime({
        state: 'ready',
        blocking: false,
        stage: 'reconciliation-cancelled',
        percent: 100,
        message: 'Current edited world retained',
        canvasLoading: false,
      });
      if (typeof options.onCancel === 'function') options.onCancel(reason);
      return true;
    }

    function finish(active, result, state) {
      if (pending !== active) return;
      pending = null;
      dialog.dataset.state = state;
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      active.resolve(result);
    }

    preserveButton.addEventListener('click', () => decide('preserve-overrides'));
    freshButton.addEventListener('click', () => decide('accept-recompiled'));
    cancelButton.addEventListener('click', () => abort('cancelled'));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      abort('cancelled');
    });

    return Object.freeze({
      resolve,
      abort,
      getPlan: () => pending && pending.plan || null,
      getLatestReceipt: () => latestReceipt,
    });
  }

  function statusLabel(status) {
    return Object.freeze({
      'unchanged-baseline': 'compiler unchanged',
      'already-applied': 'already matches',
      'compiler-conflict': 'compiler also changed',
      unavailable: 'field unavailable',
    })[status] || String(status || 'unknown');
  }

  return Object.freeze({ connect, statusLabel });
});
