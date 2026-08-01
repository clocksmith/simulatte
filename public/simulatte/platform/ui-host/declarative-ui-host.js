(function attachDeclarativeUiHost(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDeclarativeUiHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDeclarativeUiHostModule(contracts) {
  const INITIAL_INSPECTION_COUNT = 12;
  const EAGER_INSPECTION_COUNT = 3;

  function createDeclarativeUiHost({
    rootElement,
    rootElements = null,
    onAction,
    onControlChange = null,
    onError = null,
  }) {
    const roots = rootElements || { inspector: rootElement };
    const requiredSlots = ['inspector', 'map'];
    const controlValues = new Map();
    if (!roots.inspector || typeof roots.inspector.replaceChildren !== 'function') throw uiError('plugin_ui_root_invalid', 'Declarative UI host expected an inspector root element', null);
    Object.entries(roots).forEach(([slot, element]) => {
      if (!requiredSlots.includes(slot) || !element || typeof element.replaceChildren !== 'function') throw uiError('plugin_ui_root_invalid', `Declarative UI host received an invalid ${slot} root`, null);
    });
    if (typeof onAction !== 'function') throw uiError('plugin_ui_action_handler_missing', 'Declarative UI host expected an action handler', null);
    if (onControlChange !== null && typeof onControlChange !== 'function') {
      throw uiError('plugin_ui_control_handler_invalid', 'Declarative UI host expected a control-change function', null);
    }
    if (onError !== null && typeof onError !== 'function') {
      throw uiError('plugin_ui_error_handler_invalid', 'Declarative UI host expected an error handler function', null);
    }

    function render(contributions, v4Contributions = []) {
      const documentRef = roots.inspector.ownerDocument;
      const fragments = Object.fromEntries(Object.keys(roots).map((slot) => [slot, documentRef.createDocumentFragment()]));
      const v4ControlIds = new Map(v4Contributions.map((contribution) => [
        contribution.pluginId,
        new Set(contribution.controls.controls.map((control) => control.id)),
      ]));
      v4Contributions.forEach((contribution) => {
        if (contribution.controls.controls.length) {
          fragments.inspector.append(renderControls(
            documentRef,
            contribution.pluginId,
            contribution.controls.controls,
            controlValues,
            onControlChange,
            values,
          ));
        }
      });
      [...contributions].sort((left, right) => left.view.slot.localeCompare(right.view.slot) || left.pluginId.localeCompare(right.pluginId)).forEach(({ pluginId, view }) => {
        contracts.validateUiContribution(pluginId, view);
        if (!view || !fragments[view.slot]) return;
        const legacyFields = (view.fields || []).filter((field) => !v4ControlIds.get(pluginId)?.has(field.id));
        if (!view.rows.length && !legacyFields.length && !view.actions.length) return;
        const section = documentRef.createElement(view.slot === 'inspector' ? 'details' : 'section');
        section.className = view.slot === 'inspector' ? 'evidence-section plugin-evidence' : `plugin-${view.slot}-card sim-surface`;
        section.dataset.pluginId = pluginId;
        const heading = documentRef.createElement(view.slot === 'inspector' ? 'summary' : 'strong');
        heading.textContent = view.title;
        section.append(heading);
        if (view.rows.length) {
          const rows = documentRef.createElement('dl');
          rows.className = 'plugin-facts';
          view.rows.forEach((row) => {
            const container = documentRef.createElement('div');
            const term = documentRef.createElement('dt');
            const description = documentRef.createElement('dd');
            term.textContent = row.label;
            description.textContent = formatFieldValue(row.value, null);
            container.append(term, description);
            rows.append(container);
          });
          section.append(rows);
        }
        const fields = new Map();
        if (legacyFields.length) {
          const controls = documentRef.createElement('div');
          controls.className = 'plugin-controls';
          legacyFields.forEach((field) => {
            const label = documentRef.createElement('label');
            const caption = documentRef.createElement('span');
            caption.textContent = field.label;
            const input = field.type === 'select' ? documentRef.createElement('select') : documentRef.createElement('input');
            input.className = 'sim-field';
            input.dataset.pluginField = field.id;
            if (field.type === 'select') field.options.forEach((option) => {
              const node = documentRef.createElement('option');
              node.value = String(option.value);
              node.textContent = option.label;
              input.append(node);
            });
            else input.type = field.type;
            if (field.type === 'number') {
              if (field.minimum !== undefined) input.min = String(field.minimum);
              if (field.maximum !== undefined) input.max = String(field.maximum);
              if (field.step !== undefined) input.step = String(field.step);
            }
            input.value = String(field.value ?? '');
            fields.set(field.id, input);
            label.append(caption, input);
            controls.append(label);
          });
          section.append(controls);
        }
        if (view.actions.length) {
          const actions = documentRef.createElement('div');
          actions.className = 'plugin-actions';
          view.actions.forEach((action) => {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'sim-action';
            button.textContent = action.label;
            button.addEventListener('click', async () => {
              button.disabled = true;
              button.dataset.actionStatus = 'applying';
              try {
                await onAction({
                  pluginId,
                  actionId: action.id,
                  command: action.command || null,
                  values: {
                    ...values(pluginId),
                    ...Object.fromEntries([...fields].map(([id, input]) => [id, input.value])),
                  },
                });
                button.dataset.actionStatus = 'applied';
              } catch (error) {
                button.dataset.actionStatus = 'failed';
                onError?.(error, { actionId: action.id, pluginId });
              } finally {
                button.disabled = false;
              }
            });
            actions.append(button);
          });
          section.append(actions);
        }
        fragments[view.slot].append(section);
      });
      v4Contributions.forEach((contribution) => fragments.inspector.append(
        ...renderInspectionCollection(documentRef, contribution.pluginId, contribution.inspections)
      ));
      Object.entries(roots).forEach(([slot, element]) => element.replaceChildren(fragments[slot]));
    }

    function values(pluginId) {
      return Object.fromEntries(
        [...(controlValues.get(pluginId) || new Map())].map(([id, value]) => [id, Array.isArray(value) ? [...value] : value])
      );
    }

    function setValues(pluginId, nextValues) {
      if (!nextValues || typeof nextValues !== 'object' || Array.isArray(nextValues)) {
        throw uiError('plugin_ui_control_values_invalid', 'Declarative UI host expected an object of control values', { pluginId });
      }
      const current = controlValues.get(pluginId) || new Map();
      Object.entries(nextValues).forEach(([id, value]) => {
        if (!current.has(id)) {
          throw uiError('plugin_ui_control_unknown', 'Declarative UI host received an undeclared control value', { id, pluginId });
        }
        current.set(id, cloneControlValue(value));
      });
      controlValues.set(pluginId, current);
      return values(pluginId);
    }

    function resetValues(pluginId = null) {
      if (pluginId === null) controlValues.clear();
      else controlValues.delete(pluginId);
    }

    function dispose() {
      controlValues.clear();
      Object.values(roots).forEach((element) => element.replaceChildren());
    }

    return Object.freeze({ render, values, setValues, resetValues, dispose });
  }

  function renderControls(
    documentRef,
    pluginId,
    controls,
    controlValues,
    onControlChange,
    readValues,
  ) {
    const section = documentRef.createElement('details');
    section.className = 'evidence-section plugin-evidence plugin-parameter-section';
    section.dataset.pluginId = pluginId;
    section.dataset.controlCount = String(controls.length);
    section.open = true;
    const heading = documentRef.createElement('summary');
    heading.textContent = `Controls (${controls.length})`;
    const values = controlValues.get(pluginId) || new Map();
    controlValues.set(pluginId, values);
    const activeControlIds = new Set(controls.map((control) => control.id));
    [...values.keys()].forEach((id) => {
      if (!activeControlIds.has(id)) values.delete(id);
    });
    controls.forEach((control) => {
      if (!values.has(control.id)) values.set(control.id, cloneControlValue(control.value));
    });
    const fields = renderControlFields(
      documentRef,
      pluginId,
      controls,
      values,
      onControlChange,
      readValues,
    );
    section.append(heading, fields);
    return section;
  }

  function renderControlFields(
    documentRef,
    pluginId,
    controls,
    values,
    onControlChange,
    readValues,
  ) {
    const fields = documentRef.createElement('div');
    fields.className = 'plugin-controls';
    controls.forEach((control) => {
      const label = documentRef.createElement('label');
      const caption = documentRef.createElement('span');
      caption.textContent = control.label;
      const input = createControlInput(documentRef, control, values.get(control.id));
      input.id = `plugin-control-${domId(pluginId)}-${domId(control.id)}`;
      input.className = 'sim-field';
      input.dataset.pluginControl = control.id;
      label.htmlFor = input.id;
      let appliedValue = cloneControlValue(values.get(control.id));
      let applyRevision = 0;
      const updateValue = () => {
        const nextValue = readControlInput(input, control);
        if (nextValue === undefined) return undefined;
        values.set(control.id, nextValue);
        return nextValue;
      };
      if (control.kind === 'range') input.addEventListener('input', updateValue);
      input.addEventListener('change', async () => {
        const nextValue = updateValue();
        if (nextValue === undefined) {
          values.set(control.id, cloneControlValue(appliedValue));
          writeControlInput(input, control, appliedValue);
          return;
        }
        if (!onControlChange) return;
        const revision = ++applyRevision;
        input.dataset.applyStatus = 'applying';
        try {
          await onControlChange({
            pluginId,
            controlId: control.id,
            values: readValues(pluginId),
          });
          if (revision !== applyRevision) return;
          appliedValue = cloneControlValue(nextValue);
          input.dataset.applyStatus = 'applied';
        } catch (_error) {
          if (revision !== applyRevision) return;
          values.set(control.id, cloneControlValue(appliedValue));
          writeControlInput(input, control, appliedValue);
          input.dataset.applyStatus = 'failed';
        }
      });
      label.append(caption, input);
      fields.append(label);
    });
    return fields;
  }

  function createControlInput(documentRef, control, currentValue) {
    if (['select', 'multiselect'].includes(control.kind)) {
      const input = documentRef.createElement('select');
      input.multiple = control.kind === 'multiselect';
      if (input.multiple) input.size = Math.min(6, Math.max(2, (control.options || []).length));
      (control.options || []).forEach((option) => {
        const node = documentRef.createElement('option');
        node.value = String(option.value);
        node.textContent = option.label;
        node.selected = control.kind === 'multiselect'
          ? currentValue.includes(option.value)
          : currentValue === option.value;
        input.append(node);
      });
      return input;
    }
    const input = documentRef.createElement('input');
    input.type = control.kind === 'toggle' ? 'checkbox' : control.kind;
    if (control.minimum !== null) input.min = String(control.minimum);
    if (control.maximum !== null) input.max = String(control.maximum);
    if (control.step !== null) input.step = String(control.step);
    if (control.kind === 'toggle') input.checked = Boolean(currentValue);
    else input.value = String(currentValue);
    return input;
  }

  function readControlInput(input, control) {
    if (control.kind === 'toggle') return input.checked;
    if (control.kind === 'multiselect') {
      const selected = [...input.selectedOptions].map((option) => typedOptionValue(option.value, control.options));
      return selected.length ? selected : undefined;
    }
    if (['number', 'range'].includes(control.kind)) {
      if (String(input.value).trim() === '') return undefined;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return undefined;
      if (Number.isFinite(control.minimum) && value < control.minimum) return undefined;
      if (Number.isFinite(control.maximum) && value > control.maximum) return undefined;
      return value;
    }
    if (control.kind === 'select') return typedOptionValue(input.value, control.options);
    return input.value;
  }

  function typedOptionValue(value, options) {
    return (options || []).find((option) => String(option.value) === value)?.value ?? value;
  }

  function cloneControlValue(value) {
    return Array.isArray(value) ? [...value] : value;
  }

  function writeControlInput(input, control, value) {
    if (control.kind === 'toggle') {
      input.checked = Boolean(value);
      return;
    }
    if (control.kind === 'multiselect') {
      input.children.forEach((option) => {
        option.selected = (value || []).some((entry) => String(entry) === option.value);
      });
      return;
    }
    input.value = String(value ?? '');
  }

  function domId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  function renderInspection(documentRef, pluginId, inspection, eager = false) {
    const section = documentRef.createElement('details');
    section.className = 'evidence-section plugin-evidence';
    section.dataset.pluginId = pluginId;
    section.dataset.targetIds = inspection.targetIds.join(' ');
    const heading = documentRef.createElement('summary');
    heading.textContent = inspection.label;
    section.append(heading);
    let hydrated = false;
    const hydrate = () => {
      if (hydrated) return;
      hydrated = true;
      const rows = documentRef.createElement('dl');
      rows.className = 'plugin-facts';
      inspection.fields.forEach((field) => {
        const container = documentRef.createElement('div');
        const term = documentRef.createElement('dt');
        const description = documentRef.createElement('dd');
        term.textContent = field.label;
        description.textContent = formatFieldValue(field.value, field.unit);
        description.title = provenanceSummary(field.provenance);
        description.dataset.origin = field.provenance.axes.origin;
        description.dataset.temporalStatus = field.provenance.axes.temporalStatus;
        description.dataset.evidenceIds = field.provenance.evidenceRefs.map((row) => row.id).join(' ');
        container.append(term, description);
        rows.append(container);
      });
      section.append(rows);
    };
    if (eager) hydrate();
    else section.addEventListener('toggle', () => { if (section.open) hydrate(); });
    return section;
  }

  function renderInspectionCollection(documentRef, pluginId, inspections) {
    const initial = inspections.slice(0, INITIAL_INSPECTION_COUNT).map((inspection, index) => (
      renderInspection(documentRef, pluginId, inspection, index < EAGER_INSPECTION_COUNT)
    ));
    const deferred = inspections.slice(INITIAL_INSPECTION_COUNT);
    if (!deferred.length) return initial;
    const section = documentRef.createElement('details');
    section.className = 'evidence-section plugin-evidence plugin-deferred-inspections';
    section.dataset.pluginId = pluginId;
    section.dataset.deferredInspectionCount = String(deferred.length);
    const heading = documentRef.createElement('summary');
    heading.textContent = `More evidence (${deferred.length})`;
    section.append(heading);
    let hydrated = false;
    section.addEventListener('toggle', () => {
      if (!section.open || hydrated) return;
      hydrated = true;
      deferred.forEach((inspection) => section.append(
        renderInspection(documentRef, pluginId, inspection, false)
      ));
    });
    return [...initial, section];
  }

  function provenanceSummary(provenance) {
    const uncertainty = provenance.axes.uncertainty
      ? `${provenance.axes.uncertainty.kind} uncertainty`
      : 'no declared uncertainty';
    const evidence = provenance.evidenceRefs.length
      ? provenance.evidenceRefs.map((row) => row.rowId ? `${row.datasetId} row ${row.rowId}` : row.id).join(', ')
      : 'legacy evidence unavailable';
    return `${provenance.axes.origin}; ${provenance.axes.temporalStatus}; ${uncertainty}; evidence: ${evidence}`;
  }

  function formatFieldValue(value, unit) {
    let text;
    if (value === null || value === undefined) text = 'Not available';
    else if (Array.isArray(value)) {
      text = value.every((entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry))
        ? value.map((entry) => String(entry)).join(', ')
        : stableJson(value);
    } else if (typeof value === 'object') text = stableJson(value);
    else text = String(value);
    return unit === null || unit === undefined ? text : `${text} ${unit}`;
  }

  function stableJson(value) {
    return JSON.stringify(sortObject(value), null, 2);
  }

  function sortObject(value) {
    if (Array.isArray(value)) return value.map(sortObject);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortObject(value[key])])
    );
  }

  function uiError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginUiError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { INITIAL_INSPECTION_COUNT, createDeclarativeUiHost, formatFieldValue };
});
