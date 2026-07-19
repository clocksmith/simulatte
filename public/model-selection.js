(function attachSimulatteModelSelection(root, factory) {
  const api = factory();
  root.SimulatteModelSelection = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createModelSelectionApi() {
  const CONFIG_SCHEMA = 'simulatte.pipelineModelSelection.v1';
  const RECEIPT_SCHEMA = 'simulatte.pipelineModelSelectionReceipt.v1';

  async function createController(options) {
    const rootNode = options.root || document;
    const container = typeof options.container === 'string'
      ? rootNode.getElementById(options.container)
      : options.container;
    if (!container) throw new Error('Model selection controls container is required');
    const config = options.config || await loadJson(options.configUrl, options.fetchImpl);
    const lock = options.modelRuntimeLock || await loadJson(options.modelRuntimeLockUrl, options.fetchImpl);
    const state = createState(config, lock, options.surfaceId, options.storage || storageFor(rootNode));
    const consentGate = options.consentGate || null;
    const onChange = typeof options.onChange === 'function' ? options.onChange : null;
    const selects = new Map();

    function render() {
      container.replaceChildren();
      for (const slot of state.surface.slots) {
        const row = rootNode.createElement('label');
        row.className = 'model-selection-row';
        const label = rootNode.createElement('span');
        label.className = 'model-selection-label';
        label.textContent = slot.label;
        const select = rootNode.createElement('select');
        select.className = 'model-selection-select';
        select.dataset.modelSlot = slot.id;
        select.setAttribute('aria-label', slot.label);
        for (const optionId of slot.optionIds) {
          const modelOption = state.optionsById.get(optionId);
          const option = rootNode.createElement('option');
          option.value = modelOption.id;
          option.textContent = modelOption.id === slot.defaultOptionId
            ? `${modelOption.label} (default)`
            : modelOption.label;
          select.append(option);
        }
        select.value = state.selections[slot.id];
        select.disabled = slot.optionIds.length === 1;
        const note = rootNode.createElement('span');
        note.className = 'model-selection-note';
        note.dataset.modelSlotNote = slot.id;
        note.textContent = state.optionsById.get(select.value).note || '';
        select.addEventListener('change', () => changeSelection(slot.id, select.value));
        row.append(label, select, note);
        container.append(row);
        selects.set(slot.id, select);
      }
    }

    async function changeSelection(slotId, optionId) {
      const previous = { ...state.selections };
      try {
        setSelection(state, slotId, optionId);
        const selected = state.optionsById.get(optionId);
        if (selected.requiresConsent && (!consentGate || await consentGate.requestEnable() !== true)) {
          state.selections = previous;
        }
      } catch (error) {
        state.selections = previous;
        syncControls();
        throw error;
      }
      persistState(state);
      syncControls();
      emitChange(rootNode, container, receipt(state));
      if (onChange) onChange(receipt(state));
    }

    function syncControls() {
      for (const slot of state.surface.slots) {
        const select = selects.get(slot.id);
        if (!select) continue;
        select.value = state.selections[slot.id];
        const note = container.querySelector(`[data-model-slot-note="${slot.id}"]`);
        if (note) note.textContent = state.optionsById.get(select.value).note || '';
      }
    }

    async function ensureConsent() {
      const requiresConsent = selectedOptions(state).some((row) => row.requiresConsent);
      if (!requiresConsent) return true;
      return Boolean(consentGate && await consentGate.requestEnable());
    }

    render();
    return Object.freeze({
      config,
      modelRuntimeLock: lock,
      surface: state.surface,
      ensureConsent,
      receipt: () => receipt(state),
      selectedOption: (slotId) => selectedOption(state, slotId),
      selectedRuntimeRef: (slotId) => selectedOption(state, slotId).runtimeRef,
      setSelection: changeSelection,
      setDisabled(disabled) {
        for (const select of selects.values()) select.disabled = disabled || select.options.length === 1;
      },
    });
  }

  function createState(config, lock, surfaceId, storage) {
    validateConfig(config, lock);
    const surface = config.surfaces.find((row) => row.id === surfaceId);
    if (!surface) throw new Error(`Model selection surface is unknown: ${surfaceId}`);
    const optionsById = new Map(config.options.map((row) => [row.id, Object.freeze({ ...row })]));
    const selections = Object.fromEntries(surface.slots.map((slot) => [slot.id, slot.defaultOptionId]));
    const stored = readStoredSelections(storage, config.id, surface.id);
    for (const slot of surface.slots) {
      if (slot.optionIds.includes(stored[slot.id])) selections[slot.id] = stored[slot.id];
    }
    const state = { config, lock, surface, optionsById, selections, storage };
    for (const slot of surface.slots) {
      const selected = optionsById.get(selections[slot.id]);
      if ((selected.requiresSelections || []).length) setSelection(state, slot.id, selected.id);
    }
    return state;
  }

  function setSelection(state, slotId, optionId, visited = new Set()) {
    const slot = state.surface.slots.find((row) => row.id === slotId);
    if (!slot) throw new Error(`Model selection slot is unknown: ${slotId}`);
    if (!slot.optionIds.includes(optionId)) throw new Error(`${optionId} is not supported for ${slotId}`);
    const visitKey = `${slotId}:${optionId}`;
    if (visited.has(visitKey)) throw new Error(`Model selection dependency cycle at ${visitKey}`);
    visited.add(visitKey);
    state.selections[slotId] = optionId;
    const selected = state.optionsById.get(optionId);
    for (const dependency of selected.requiresSelections || []) {
      setSelection(state, dependency.slotId, dependency.optionId, visited);
    }
    repairDependents(state);
  }

  function repairDependents(state) {
    for (const slot of state.surface.slots) {
      const selected = state.optionsById.get(state.selections[slot.id]);
      const dependenciesMet = (selected.requiresSelections || []).every((dependency) => (
        state.selections[dependency.slotId] === dependency.optionId
      ));
      if (!dependenciesMet) state.selections[slot.id] = slot.defaultOptionId;
    }
  }

  function selectedOption(state, slotId) {
    const optionId = state.selections[slotId];
    const selected = state.optionsById.get(optionId);
    if (!selected) throw new Error(`Model selection is missing for ${slotId}`);
    return selected;
  }

  function selectedOptions(state) {
    return state.surface.slots.map((slot) => selectedOption(state, slot.id));
  }

  function receipt(state) {
    return Object.freeze({
      schema: RECEIPT_SCHEMA,
      configId: state.config.id,
      modelRuntimeLock: Object.freeze({ id: state.lock.id, number: state.lock.number }),
      surfaceId: state.surface.id,
      selections: Object.freeze(state.surface.slots.map((slot) => {
        const selected = selectedOption(state, slot.id);
        return Object.freeze({
          slotId: slot.id,
          jobId: slot.jobId,
          optionId: selected.id,
          kind: selected.kind,
          runtimeRef: Object.freeze({ ...selected.runtimeRef }),
        });
      })),
    });
  }

  function validateConfig(config, lock) {
    if (!config || config.schema !== CONFIG_SCHEMA) throw new Error(`Model selection config expected ${CONFIG_SCHEMA}`);
    if (!lock || lock.schema !== 'simulatte.modelRuntimeLock.v1') throw new Error('Model selection requires a valid runtime lock');
    if (config.modelRuntimeLock.id !== lock.id || Number(config.modelRuntimeLock.number) !== Number(lock.number)) {
      throw new Error(`Model selection config expects ${config.modelRuntimeLock.id} #${config.modelRuntimeLock.number}, received ${lock.id} #${lock.number}`);
    }
    const optionsById = uniqueById(config.options, 'model selection option');
    const tiersById = new Map((lock.classification && lock.classification.tiers || []).map((row) => [row.id, row]));
    for (const modelOption of config.options) {
      const reference = modelOption.runtimeRef || {};
      if (reference.kind === 'classification-tier') {
        const tier = tiersById.get(reference.id);
        if (!tier) throw new Error(`Model selection option ${modelOption.id} references unknown tier ${reference.id}`);
        if (tier.availability !== 'browser-ready') throw new Error(`Model selection option ${modelOption.id} references unavailable tier ${reference.id}`);
      }
      if (reference.kind === 'embedding' && reference.id !== lock.embedding.id) {
        throw new Error(`Model selection option ${modelOption.id} references unpinned embedding ${reference.id}`);
      }
    }
    uniqueById(config.surfaces, 'model selection surface');
    for (const surface of config.surfaces) {
      const slotsById = uniqueById(surface.slots, `${surface.id} model selection slot`);
      for (const slot of surface.slots) {
        if (!slot.optionIds.includes(slot.defaultOptionId)) throw new Error(`${surface.id}.${slot.id} default is not selectable`);
        for (const optionId of slot.optionIds) {
          if (!optionsById.has(optionId)) throw new Error(`${surface.id}.${slot.id} references unknown option ${optionId}`);
        }
      }
      for (const slot of surface.slots) {
        for (const optionId of slot.optionIds) {
          for (const dependency of optionsById.get(optionId).requiresSelections || []) {
            const dependencySlot = slotsById.get(dependency.slotId);
            if (!dependencySlot || !dependencySlot.optionIds.includes(dependency.optionId)) {
              throw new Error(`${surface.id}.${slot.id} has unsatisfied dependency ${dependency.slotId}:${dependency.optionId}`);
            }
          }
        }
      }
    }
    const blank = config.surfaces.find((surface) => surface.id === 'blank');
    const classificationSlot = blank && blank.slots.find((slot) => slot.id === 'bounded-classification');
    const classificationDefault = classificationSlot && optionsById.get(classificationSlot.defaultOptionId);
    if (!classificationDefault || classificationDefault.runtimeRef.id !== lock.classification.execution.defaultCompactCandidateId) {
      throw new Error('Blank classification default differs from the numbered runtime lock');
    }
    return true;
  }

  function uniqueById(rows, label) {
    if (!Array.isArray(rows) || !rows.length) throw new Error(`${label} rows are required`);
    const map = new Map();
    for (const row of rows) {
      if (!row || !String(row.id || '').trim()) throw new Error(`${label} id is required`);
      if (map.has(row.id)) throw new Error(`${label} id is duplicated: ${row.id}`);
      map.set(row.id, row);
    }
    return map;
  }

  function readStoredSelections(storage, configId, surfaceId) {
    try {
      const value = JSON.parse(storage.getItem(storageKey(configId, surfaceId)) || '{}');
      return value && value.schema === 'simulatte.pipelineModelSelectionState.v1' ? value.selections || {} : {};
    } catch (_error) {
      return {};
    }
  }

  function persistState(state) {
    try {
      state.storage.setItem(storageKey(state.config.id, state.surface.id), JSON.stringify({
        schema: 'simulatte.pipelineModelSelectionState.v1',
        selections: state.selections,
      }));
    } catch (_error) {}
  }

  function storageKey(configId, surfaceId) {
    return `simulatte.modelSelection.${configId}.${surfaceId}`;
  }

  function storageFor(rootNode) {
    return rootNode.defaultView && rootNode.defaultView.localStorage || localStorage;
  }

  async function loadJson(url, fetchImpl = fetch) {
    if (!url) throw new Error('Model selection JSON URL is required');
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Model selection request failed for ${url} (${response.status})`);
    return response.json();
  }

  function emitChange(rootNode, container, detail) {
    const EventCtor = rootNode.defaultView && rootNode.defaultView.CustomEvent || globalThis.CustomEvent;
    if (EventCtor) container.dispatchEvent(new EventCtor('model-selection-change', { detail }));
  }

  return Object.freeze({
    CONFIG_SCHEMA,
    RECEIPT_SCHEMA,
    createController,
    createState,
    receipt,
    selectedOption,
    setSelection,
    validateConfig,
  });
});
