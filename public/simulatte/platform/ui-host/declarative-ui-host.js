(function attachDeclarativeUiHost(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDeclarativeUiHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDeclarativeUiHostModule(contracts) {
  function createDeclarativeUiHost({ rootElement, rootElements = null, onAction }) {
    const roots = rootElements || { inspector: rootElement };
    const requiredSlots = ['inspector', 'map'];
    const controlValues = new Map();
    if (!roots.inspector || typeof roots.inspector.replaceChildren !== 'function') throw uiError('plugin_ui_root_invalid', 'Declarative UI host expected an inspector root element', null);
    Object.entries(roots).forEach(([slot, element]) => {
      if (!requiredSlots.includes(slot) || !element || typeof element.replaceChildren !== 'function') throw uiError('plugin_ui_root_invalid', `Declarative UI host received an invalid ${slot} root`, null);
    });
    if (typeof onAction !== 'function') throw uiError('plugin_ui_action_handler_missing', 'Declarative UI host expected an action handler', null);

    function render(contributions, v4Contributions = []) {
      const documentRef = roots.inspector.ownerDocument;
      const fragments = Object.fromEntries(Object.keys(roots).map((slot) => [slot, documentRef.createDocumentFragment()]));
      const v4ControlIds = new Map(v4Contributions.map((contribution) => [
        contribution.pluginId,
        new Set(contribution.controls.controls.map((control) => control.id)),
      ]));
      v4Contributions.forEach((contribution) => {
        if (contribution.controls.controls.length) {
          fragments.inspector.append(renderControls(documentRef, contribution.pluginId, contribution.controls.controls, controlValues));
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
            description.textContent = String(row.value);
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
      v4Contributions.forEach((contribution) => {
        contribution.inspections.forEach((inspection) => {
          fragments.inspector.append(renderInspection(documentRef, contribution.pluginId, inspection));
        });
      });
      Object.entries(roots).forEach(([slot, element]) => element.replaceChildren(fragments[slot]));
    }

    function values(pluginId) {
      return Object.fromEntries(
        [...(controlValues.get(pluginId) || new Map())].map(([id, value]) => [id, Array.isArray(value) ? [...value] : value])
      );
    }

    function dispose() {
      controlValues.clear();
      Object.values(roots).forEach((element) => element.replaceChildren());
    }

    return Object.freeze({ render, values, dispose });
  }

  function renderControls(documentRef, pluginId, controls, controlValues) {
    const section = documentRef.createElement('details');
    section.className = 'evidence-section plugin-evidence plugin-parameter-section';
    section.dataset.pluginId = pluginId;
    section.dataset.controlCount = String(controls.length);
    section.open = true;
    const heading = documentRef.createElement('summary');
    heading.textContent = `Experiment parameters (${controls.length})`;
    const explanation = documentRef.createElement('p');
    explanation.className = 'plugin-parameter-note';
    explanation.textContent = 'These values are applied when you start or replay the simulation.';
    const values = controlValues.get(pluginId) || new Map();
    controlValues.set(pluginId, values);
    controls.forEach((control) => {
      if (!values.has(control.id)) values.set(control.id, cloneControlValue(control.value));
    });
    const fields = controls.length <= 6
      ? renderControlFields(documentRef, pluginId, controls, values)
      : renderControlGroups(documentRef, pluginId, controls, values);
    section.append(heading, explanation, fields);
    return section;
  }

  function renderControlGroups(documentRef, pluginId, controls, values) {
    const container = documentRef.createElement('div');
    container.className = 'plugin-control-groups';
    groupControls(controls).forEach((group, index) => {
      const section = documentRef.createElement('details');
      section.className = 'plugin-control-group';
      section.open = index === 0;
      const heading = documentRef.createElement('summary');
      heading.textContent = `${group.label} (${group.controls.length})`;
      section.append(heading, renderControlFields(documentRef, pluginId, group.controls, values));
      container.append(section);
    });
    return container;
  }

  function renderControlFields(documentRef, pluginId, controls, values) {
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
      const updateValue = () => values.set(control.id, readControlInput(input, control));
      input.addEventListener('input', updateValue);
      input.addEventListener('change', updateValue);
      label.append(caption, input);
      fields.append(label);
    });
    return fields;
  }

  function groupControls(controls) {
    const groups = [
      { label: 'Scenario', pattern: /(scenario|campaign|mission|route|departure|epoch|preset|demand|failure|commodity|hazard|vessel|cable|family|origin|destination|terminal)/i, controls: [] },
      { label: 'Policy', pattern: /(policy|priority|weight|objective|threshold|preference|recall|allocation|routing|strategy|handling|intervention)/i, controls: [] },
      { label: 'Resources and uncertainty', pattern: /(ensemble|clone|sample|uncertainty|retry|budget|resource|crew|inventory|capacity|speed|duration|days|time|detour|refriger|weather|canopy|emission|storage|reserve)/i, controls: [] },
      { label: 'Advanced model', pattern: null, controls: [] },
    ];
    controls.forEach((control) => {
      const searchable = `${control.id} ${control.label}`;
      const group = groups.find((candidate) => candidate.pattern?.test(searchable)) || groups.at(-1);
      group.controls.push(control);
    });
    return groups.filter((group) => group.controls.length);
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
      return [...input.selectedOptions].map((option) => typedOptionValue(option.value, control.options));
    }
    if (['number', 'range'].includes(control.kind)) return Number(input.value);
    if (control.kind === 'select') return typedOptionValue(input.value, control.options);
    return input.value;
  }

  function typedOptionValue(value, options) {
    return (options || []).find((option) => String(option.value) === value)?.value ?? value;
  }

  function cloneControlValue(value) {
    return Array.isArray(value) ? [...value] : value;
  }

  function domId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
  }

  function renderInspection(documentRef, pluginId, inspection) {
    const section = documentRef.createElement('details');
    section.className = 'evidence-section plugin-evidence';
    section.dataset.pluginId = pluginId;
    section.dataset.targetIds = inspection.targetIds.join(' ');
    const heading = documentRef.createElement('summary');
    heading.textContent = inspection.label;
    section.append(heading);
    const rows = documentRef.createElement('dl');
    rows.className = 'plugin-facts';
    inspection.fields.forEach((field) => {
      const container = documentRef.createElement('div');
      const term = documentRef.createElement('dt');
      const description = documentRef.createElement('dd');
      term.textContent = field.label;
      description.textContent = field.unit === null ? String(field.value) : `${field.value} ${field.unit}`;
      description.title = provenanceSummary(field.provenance);
      description.dataset.origin = field.provenance.axes.origin;
      description.dataset.temporalStatus = field.provenance.axes.temporalStatus;
      description.dataset.evidenceIds = field.provenance.evidenceRefs.map((row) => row.id).join(' ');
      container.append(term, description);
      rows.append(container);
    });
    section.append(rows);
    return section;
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

  function uiError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginUiError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { createDeclarativeUiHost };
});
