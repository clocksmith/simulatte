(function attachSimulattePromptModelSelection(root, factory) {
  const consent = typeof module === 'object' && module.exports
    ? require('../../../neural-model-consent.js')
    : root.SimulatteNeuralModelConsent;
  const selection = typeof module === 'object' && module.exports
    ? require('../../../model-selection.js')
    : root.SimulatteModelSelection;
  if (!consent || !selection) throw new Error('Prompt model selection requires consent and selection dependencies');
  const api = factory(consent, selection);
  root.SimulattePromptModelSelection = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPromptModelSelectionApi(consentApi, selectionApi) {
  async function create(root) {
    const neuralNote = root.getElementById('blank-neural-model-note');
    const consentGate = await consentApi.createGate({
      root,
      lockUrl: '../data/simulatte-embedder/model-runtime-lock.json',
      toggle: root.getElementById('blank-neural-models'),
      dialog: root.getElementById('neural-model-dialog'),
      surface: 'blank',
      status(enabled, bundle) {
        if (!neuralNote) return;
        neuralNote.textContent = enabled
          ? `Model consent granted; ${bundle.totalSize} available locally`
          : 'No neural model consent';
      },
    });
    return selectionApi.createController({
      root,
      container: root.getElementById('model-selection-controls'),
      configUrl: '../data/pipeline-model-selection.json',
      modelRuntimeLockUrl: '../data/simulatte-embedder/model-runtime-lock.json',
      surfaceId: 'blank',
      consentGate,
    });
  }

  function classificationTierId(controller) {
    return controller.selectedRuntimeRef('bounded-classification').id;
  }

  return Object.freeze({ create, classificationTierId });
});
