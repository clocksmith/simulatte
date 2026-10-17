(function attachDeclarativeUiHost(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const components = typeof module === 'object' && module.exports ? require('../../../shared/design/control-components.js') : root.SimulatteControlComponents;
  const api = factory(contracts, components);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteDeclarativeUiHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDeclarativeUiHostModule(contracts, components) {
  const INITIAL_INSPECTION_COUNT = 12;
  const EAGER_INSPECTION_COUNT = 3;
  const LARGE_OPTION_VISIBLE_LIMIT = 80;

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
    const controlGroups = new Map();
    const acceptedValues = new Map();
    const controlNodes = new Map(), controlRevisions = new Map();
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
      const focused = documentRef.activeElement;
      const focusedId = focused?.id && Object.values(roots).some((element) => element.contains?.(focused)) ? focused.id : null;
      const uiState = Object.fromEntries(Object.entries(roots).map(([slot, element]) => [slot, {
        scrollTop: element.scrollTop,
        open: new Map([...(element.querySelectorAll?.('details') || [])].map(row => [row.dataset.uiKey, row.open])),
      }]));
      const drafts = [...(roots.inspector.querySelectorAll?.('[data-plugin-control]') || [])].flatMap((input) => {
        const pluginId = input.closest('[data-plugin-id]')?.dataset.pluginId;
        const controlId = input.dataset.pluginControl;
        const applied = acceptedValues.get(pluginId)?.get(controlId);
        const definition = v4Contributions.find(row => row.pluginId === pluginId)?.controls.controls.find(row => row.id === controlId);
        const current = input.dataset.controlComponent && definition ? components.read(input, definition) : input.multiple ? [...input.selectedOptions].map((row) => row.value)
          : input.type === 'checkbox' ? input.checked : input.value;
        const same = Array.isArray(current) ? Array.isArray(applied)
          && JSON.stringify(current.map(String).sort()) === JSON.stringify(applied.map(String).sort())
          : String(current) === String(applied);
        if (applied === undefined || (same
          && input.dataset.applyStatus !== 'draft')) return [];
        return [{ id: input.id, value: current, applyStatus: input.dataset.applyStatus || '' }];
      });
      const fragments = Object.fromEntries(Object.keys(roots).map((slot) => [slot, documentRef.createDocumentFragment()]));
      const parameterSections = new Map();
      const v4ControlIds = new Map(v4Contributions.map((contribution) => [
        contribution.pluginId,
        new Set(contribution.controls.controls.map((control) => control.id)),
      ]));
      v4Contributions.forEach((contribution) => {
        if (contribution.controls.controls.length) {
          const section = renderControls(
            documentRef,
            contribution.pluginId,
            contribution.controls.controls,
            controlValues,
            onControlChange,
            values, controlGroups, onError, acceptedValues, controlNodes, controlRevisions,
            contribution.controls.title || null,
          );
          parameterSections.set(contribution.pluginId, section);
          if(section.primaryControls.children.length)(fragments.map||fragments.inspector).append(section.primaryControls);
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
        section.dataset.uiKey = `view:${pluginId}:${view.slot}`;
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
            input.id = `plugin-field-${domId(pluginId)}-${domId(field.id)}`;
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
          const configurationActions = documentRef.createElement('div');
          configurationActions.className = 'plugin-actions';
          const parameterSection = parameterSections.get(pluginId);
          view.actions.forEach((action) => {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'sim-action';
            button.textContent = action.label;
            button.dataset.pluginAction = action.id;
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
            if (parameterSection && /\.configuration\.(apply|reset)$/.test(action.id)) configurationActions.append(button);
            else actions.append(button);
          });
          if (configurationActions.children.length) parameterSection.append(configurationActions);
          if (actions.children.length) section.append(actions);
        }
        fragments[view.slot].append(section);
      });
      v4Contributions.forEach((contribution) => fragments.inspector.append(
        ...renderInspectionCollection(documentRef, contribution.pluginId, contribution.inspections)
      ));
      v4Contributions.forEach((contribution) => {
        const section = parameterSections.get(contribution.pluginId);
        if (section) fragments.inspector.append(section);
      });
      Object.entries(roots).forEach(([slot, element]) => element.replaceChildren(fragments[slot]));
      Object.entries(roots).forEach(([slot, element]) => {
        [...(element.querySelectorAll?.('details') || [])].forEach(row => {
          if (uiState[slot].open.has(row.dataset.uiKey)) row.open = uiState[slot].open.get(row.dataset.uiKey);
        });
        element.scrollTop = uiState[slot].scrollTop;
      });
      for (const draft of drafts) {
        const input = documentRef.getElementById(draft.id);
        if (!input) continue;
        if (input.dataset.controlComponent) components.write(input, draft.value);
        else if (input.multiple) [...input.options].forEach((row) => { row.selected = draft.value.includes(row.value); });
        else if (input.type === 'checkbox') input.checked = draft.value;
        else input.value = draft.value;
        input.dataset.applyStatus = draft.applyStatus;
      }
      if (focusedId) documentRef.getElementById(focusedId)?.focus({ preventScroll: true });
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
      acceptedValues.set(pluginId, new Map(current));
      return values(pluginId);
    }

    function resetValues(pluginId = null) {
      for(const [key,revision] of controlRevisions)if(pluginId===null||key.startsWith(pluginId+':'))controlRevisions.set(key,revision+1);
      if (pluginId === null) { controlValues.clear(); acceptedValues.clear(); controlNodes.clear(); }
      else { controlValues.delete(pluginId); acceptedValues.delete(pluginId); for (const key of controlNodes.keys()) if (key.startsWith(pluginId+':')) controlNodes.delete(key); }
    }

    function dispose() {
      for(const [key,revision] of controlRevisions)controlRevisions.set(key,revision+1);
      controlValues.clear(); acceptedValues.clear(); controlNodes.clear();
      Object.values(roots).forEach((element) => element.replaceChildren());
    }

    return Object.freeze({ render, values, acceptedValues: id => Object.fromEntries([...(acceptedValues.get(id) || [])].map(([key,value])=>[key,cloneControlValue(value)])), setValues, resetValues, dispose });
  }

  function renderControls(
    documentRef,
    pluginId,
    controls,
    controlValues,
    onControlChange,
    readValues, controlGroups, onError, acceptedValues, controlNodes, controlRevisions,
    customTitle = null,
  ) {
    const section = documentRef.createElement('details');
    section.className = 'evidence-section plugin-evidence plugin-parameter-section';
    section.dataset.pluginId = pluginId;
    section.dataset.controlCount = String(controls.length);
    const key = `params:${pluginId}`;
    section.dataset.uiKey = key;
    section.open = controlGroups.get(key) ?? false;
    section.addEventListener('toggle', () => controlGroups.set(key, section.open));
    const heading = documentRef.createElement('summary');
    heading.textContent = customTitle || `Advanced Parameters (${controls.length})`;
    const values = controlValues.get(pluginId) || new Map();
    controlValues.set(pluginId, values);
    const activeControlIds = new Set(controls.map((control) => control.id));
    [...values.keys()].forEach((id) => {
      if (!activeControlIds.has(id)) values.delete(id);
    });
    controls.forEach((control) => {
      if (!values.has(control.id)) values.set(control.id, cloneControlValue(control.value));
    });
    section.append(heading);
    const primary=documentRef.createElement('section');primary.className='plugin-primary-controls';primary.dataset.pluginId=pluginId;primary.dataset.uiKey=`primary:${pluginId}`;
    if (!acceptedValues.has(pluginId)) acceptedValues.set(pluginId, new Map(values));
    const accepted=acceptedValues.get(pluginId);
    for(const id of accepted.keys())if(!activeControlIds.has(id))accepted.delete(id);
    for(const control of controls)if(!accepted.has(control.id))accepted.set(control.id,cloneControlValue(control.value));
    const editing = { controls, inputs: new Map(), applied: acceptedValues.get(pluginId), revisions: controlRevisions, controlNodes };
    const groups = new Map();
    controls.forEach(control => {
      let name = '';
      let label = control.label;
      if (control.group) {
        name = String(control.group).trim();
      } else {
        const match = control.label.match(/^([^:·]+)\s*[:·]\s*(.+)$/);
        if (match) {
          name = match[1].trim();
          label = match[2];
        }
      }
      const groupKey=`${control.placement==='primary'?'primary':'advanced'}:${name}`;
      if (!groups.has(groupKey)) groups.set(groupKey, {name,primary:control.placement==='primary',rows:[]});
      groups.get(groupKey).rows.push({ ...control, label });
    });
    [...groups.values()].forEach(({name,rows,primary:isPrimary}, index) => {
      const fields = renderControlFields(documentRef, pluginId, rows, values, onControlChange, readValues, onError, editing);
      if(isPrimary){primary.append(fields);return;}
      if (!name) { section.append(fields); return; }
      const group = documentRef.createElement('details');
      group.className = 'plugin-control-group';
      const groupKey = `${pluginId}:${name}`;
      group.dataset.uiKey = groupKey;
      group.open = controlGroups.get(groupKey) ?? index === 0;
      group.addEventListener('toggle', () => controlGroups.set(groupKey, group.open));
      const title = documentRef.createElement('summary');
      title.textContent = `${name} (${rows.length})`;
      group.append(title, fields);
      section.append(group);
    });
    section.primaryControls=primary;
    return section;
  }

  function renderControlFields(
    documentRef,
    pluginId,
    controls,
    values,
    onControlChange,
    readValues, onError, editing,
  ) {
    const fields = documentRef.createElement('div');
    fields.className = 'plugin-controls';
    controls.forEach((control) => {
      const label = documentRef.createElement(control.purpose === 'choice' || control.purpose === 'multiple' ? 'div' : 'label');
      const caption = documentRef.createElement('span');
      caption.textContent = control.label + (control.unit ? ` (${control.unit})` : '');
      const key = `${pluginId}:${control.id}`;
      const identity = JSON.stringify([control.kind, control.purpose, control.options]);
      const previous = editing.controlNodes.get(key);
      const input = previous?.identity === identity ? previous.input : createControlInput(documentRef, control, values.get(control.id));
      editing.controlNodes.set(key, { identity, input });
      writeControlInput(input, control, values.get(control.id));
      input.id = `plugin-control-${domId(pluginId)}-${domId(control.id)}`;
      if (input.dataset.controlComponent) for (const radio of input.querySelectorAll('input')) {radio.name = key;radio.id=`${input.id}-option-${encodeURIComponent(radio.value)}`;}
      input.className = input.dataset.controlComponent === 'multiple' ? 'sim-field sim-checkbox-group' : input.dataset.controlComponent === 'choice' ? 'sim-field sim-segmented' : 'sim-field';
      input.dataset.pluginControl = control.id;
      input.dataset.sessionCategory = control.scope || 'scenario';
      input.dataset.requiresRestart = String((control.application || 'restart') === 'restart');
      input.dataset.application = control.application || 'restart';
      input.disabled = control.available === false;
      editing.inputs.set(control.id, input);
      const peers = control.selectionGroup ? editing.controls.filter(row => row.selectionGroup === control.selectionGroup) : [control];
      const revisionKey = `${pluginId}:` + (control.selectionGroup ? `group:${control.selectionGroup}` : `control:${control.id}`);
      const optionSearch = createOptionSearch(documentRef, control, input);
      label.htmlFor = input.id;
      const readout = control.kind === 'range' ? documentRef.createElement('output') : null;
      if (readout) { readout.htmlFor = input.id; readout.textContent = String(values.get(control.id)); }

      let appliedValue = cloneControlValue(values.get(control.id));
      const updateValue = () => {
        const nextValue = readControlInput(input, control);
        if (nextValue === undefined) return undefined;
        if (control.selectionGroup) {
          const displaced = peers.find(row => row.id !== control.id && values.get(row.id) === nextValue);
          if (displaced) {
            const previous = values.get(control.id);
            values.set(displaced.id, previous);
            writeControlInput(editing.inputs.get(displaced.id), displaced, previous);
          }
        }
        values.set(control.id, nextValue);
        if (readout) readout.textContent = String(nextValue);
        return nextValue;
      };
      input._controlUpdate = updateValue;
      input._controlChange = async () => {
        const nextValue = updateValue();
        if (nextValue === undefined) {
          values.set(control.id, cloneControlValue(appliedValue));
          writeControlInput(input, control, appliedValue);
          if (readout) readout.textContent = String(appliedValue);
          return;
        }
        if (!onControlChange) return;
        const revision = (editing.revisions.get(revisionKey) || 0) + 1;
        editing.revisions.set(revisionKey, revision);
        const requestedValues = readValues(pluginId);
        input.dataset.applyStatus = 'applying';
        input.dataset.acceptedValue = JSON.stringify(editing.applied.get(control.id));
        input.setAttribute?.('aria-busy', 'true');
        try {
          const outcome = await onControlChange({
            pluginId,
            controlId: control.id,
            control,
            values: requestedValues,
          });
          if (revision !== editing.revisions.get(revisionKey)) return;
          if (outcome?.status === 'draft') {
            input.dataset.applyStatus = 'draft';
            input.title = 'Unapplied draft. Use Apply configuration to restart with these values, or Reset draft.';
            return;
          }
          peers.forEach(row => editing.applied.set(row.id, cloneControlValue(requestedValues[row.id])));
          appliedValue = cloneControlValue(nextValue);
          input.dataset.applyStatus = 'applied';
          input.dataset.acceptedValue = JSON.stringify(nextValue);
        } catch (error) {
          if (revision !== editing.revisions.get(revisionKey)) return;
          peers.forEach(row => {
            const restored = cloneControlValue(editing.applied.get(row.id));
            values.set(row.id, restored);
            writeControlInput(editing.inputs.get(row.id), row, restored);
          });
          if (readout) readout.textContent = String(editing.applied.get(control.id));
          input.dataset.applyStatus = 'failed';
          onError?.(error, { controlId: control.id, pluginId });
        } finally { if(revision===editing.revisions.get(revisionKey))input.setAttribute?.('aria-busy', 'false'); }
      };
      if (!input._controlBound) {
        input._controlBound = true;
        if (control.kind === 'range') input.addEventListener('input', () => input._controlUpdate());
        input.addEventListener('change', () => input._controlChange());
      }
      if(input.dataset.controlComponent)input.querySelector('legend').textContent=caption.textContent;
      label.append(...(input.dataset.controlComponent ? [] : [caption]), ...(optionSearch ? [optionSearch, input] : [input]), ...(readout ? [readout] : []));
      fields.append(label);
    });
    return fields;
  }

  function createControlInput(documentRef, control, currentValue) {
    const component = control.purpose && components.create(documentRef, control, currentValue);
    if (component) return component;
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
    if (control.kind === 'toggle') input.setAttribute?.('role', 'switch');
    if (control.minimum !== null) input.min = String(control.minimum);
    if (control.maximum !== null) input.max = String(control.maximum);
    if (control.step !== null) input.step = String(control.step);
    if (control.kind === 'toggle') input.checked = Boolean(currentValue);
    else input.value = String(currentValue);
    return input;
  }

  function createOptionSearch(documentRef, control, select) {
    if (!['select', 'multiselect'].includes(control.kind)
      || (control.options || []).length <= LARGE_OPTION_VISIBLE_LIMIT) return null;
    const search = documentRef.createElement('input');
    search.type = 'search';
    search.className = 'sim-field plugin-option-search';
    search.placeholder = `Search ${control.label.toLowerCase()}`;
    search.autocomplete = 'off';
    search.dataset.pluginControlSearch = control.id;
    search.dataset.visibleOptionLimit = String(LARGE_OPTION_VISIBLE_LIMIT);
    const applyFilter = () => filterSelectOptions(select, search.value);
    search.addEventListener('input', applyFilter);
    select.addEventListener('change', applyFilter);
    applyFilter();
    return search;
  }

  function filterSelectOptions(select, query) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    let admitted = 0;
    [...select.children].forEach((option) => {
      if (option.tagName === 'LEGEND') return;
      const checkbox = select.dataset.controlComponent ? option.querySelector('input') : null;
      const selected = checkbox ? checkbox.checked : option.selected;
      const matches = !normalizedQuery
        || `${option.textContent} ${option.value}`.toLocaleLowerCase().includes(normalizedQuery);
      const visible = selected || (matches && admitted < LARGE_OPTION_VISIBLE_LIMIT);
      option.hidden = !visible;
      if (visible && !selected) admitted += 1;
    });
  }

  function readControlInput(input, control) {
    if (input.dataset.controlComponent) return components.read(input, control);
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
    if (input?.dataset.controlComponent) { components.write(input, value); return; }
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
    section.dataset.uiKey = `inspection:${pluginId}:${inspection.id}`;
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
    section.dataset.uiKey = `inspections:${pluginId}:deferred`;
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

  // Measurement updates patch keyed text nodes; inputs and focus retain their identity.
  function createObjectInspector({ host, onSelect, onAction, onError }) {
    const doc = host.ownerDocument;
    if (doc.body?.dataset.worldUi === 'true') {
      const ui = doc.defaultView.SimulatteWorldUI;
      if (!ui) throw Error('World UI components must load before object inspection');
      const inspector = ui.SimInspector({ host, onSelect, onAction, onError, returnFocus: host.querySelector('canvas'), prominentFields: (host.dataset.inspectorFields || '').split(',').filter(Boolean) });
      return { ...inspector, render: input => inspector.render(host.presentInspection ? host.presentInspection(input) : input) };
    }
    const root = doc.createElement('section'); root.className = 'sim-object-inspector sim-surface';
    root.setAttribute('aria-label', 'Object inspector');
    const select = doc.createElement('select'); select.className = 'sim-field'; select.setAttribute('aria-label', 'Inspect object');
    const header = doc.createElement('header'); header.className = 'sim-object-heading';
    const close = doc.createElement('button'); close.type = 'button'; close.className = 'sim-action';
    close.textContent = '×'; close.setAttribute('aria-label', 'Close inspector');
    const more = doc.createElement('button'); more.type = 'button'; more.className = 'sim-action';
    more.textContent = 'All'; more.title = 'Include links and sampled segments'; more.setAttribute('aria-pressed', 'false');
    let includeAll = false, lastRender = null;
    more.addEventListener('click', () => { includeAll = !includeAll; more.setAttribute('aria-pressed', String(includeAll)); render(lastRender); });
    close.addEventListener('click', () => onSelect(null)); header.append(select, more, close);
    const body = doc.createElement('div'); body.hidden = true;
    const title = doc.createElement('strong'), condition = doc.createElement('p'), explanation = doc.createElement('p'), facts = doc.createElement('dl');
    const details = doc.createElement('details'), detailLabel = doc.createElement('summary'); detailLabel.textContent = 'Detailed quantities'; details.append(detailLabel, facts);
    const actions = doc.createElement('div'); actions.className = 'sim-object-actions';
    const message = doc.createElement('p'); message.setAttribute('role', 'status');
    const related = doc.createElement('details'), relatedLabel = doc.createElement('summary'), relatedObjects = doc.createElement('div');
    related.className = 'sim-object-related'; related.hidden = true; related.append(relatedLabel, relatedObjects);
    body.append(title, condition, actions, message, explanation, related, details); root.append(header, body); host.append(root);
    let relatedKey = '';
    const cells = new Map(), buttons = new Map(); let optionsKey = '', busy = false, current = null, selectionRevision = 0;
    select.addEventListener('change', () => onSelect(select.value || null));
    async function act(id) {
      const revision = selectionRevision;
      busy = true; reflectButtons(); message.textContent = 'Pending';
      try { const result = await onAction(id); if (revision === selectionRevision) message.textContent = result?.message || 'Applied'; }
      catch (error) { if (revision === selectionRevision) message.textContent = error.name === 'AbortError' ? 'Cancelled' : error.message; if (error.name !== 'AbortError') onError?.(error); }
      finally { if (revision === selectionRevision) { busy = false; reflectButtons(); } }
    }
    function reflectButtons() {
      for (const action of current?.actions || []) {
        const button = buttons.get(action.id); if (button) { button.disabled = busy || action.disabled === true; button.textContent = action.label; }
      }
    }
    function render(input) {
        if (!input) return;
        lastRender = input;
        const { objects: allObjects, selectedId, label, description, prompt = 'Select an object…', fields = [], actions: nextActions = [] } = input;
        const objects = allObjects.filter(row => includeAll || row.inSelector !== false || row.id === selectedId);
        more.hidden = !allObjects.some(row => row.inSelector === false);
        more.textContent = `${includeAll ? 'Hide' : 'Show'} ${[...new Set(allObjects.filter(row => row.inSelector === false).map(row => row.selectionGroup || 'more objects'))].join(' and ')}`;
        if (current?.selectedId !== selectedId) { selectionRevision++; busy = false; message.textContent = ''; body.scrollTop = 0; }
        current = { actions: nextActions, selectedId };
        const key = objects.map(row => row.id).join('|');
        if (key !== optionsKey) {
          optionsKey = key;
          select.replaceChildren(...[{ id: '', label: prompt }, ...objects].map(row => {
            const option = doc.createElement('option'); option.value = row.id; option.textContent = row.label; return option;
          }));
        }
        [{ label: prompt }, ...objects].forEach((row, index) => { const option = select.children[index]; if (option && option.textContent !== row.label) option.textContent = row.label; });
        close.hidden = !selectedId;
        if (doc.activeElement !== select && select.value !== (selectedId || '')) select.value = selectedId || ''; body.hidden = !selectedId;
        if (!selectedId) return;
        const selected = allObjects.find(row => row.id === selectedId);
        title.textContent = label; condition.textContent = selected?.condition || ''; explanation.textContent = description;
        const peers = (selected?.relatedIds || []).map(id => allObjects.find(row => row.id === id)).filter(Boolean);
        const nextRelatedKey = JSON.stringify(peers.map(row => [row.id, row.label]));
        related.hidden = !peers.length; relatedLabel.textContent = `Connected objects (${peers.length})`;
        if (nextRelatedKey !== relatedKey) {
          relatedKey = nextRelatedKey;
          relatedObjects.replaceChildren(...peers.map(row => {
            const button = doc.createElement('button'); button.type = 'button'; button.className = 'sim-action';
            button.dataset.relatedObject = row.id; button.textContent = row.label;
            button.addEventListener('click', () => onSelect(row.id)); return button;
          }));
        }
        const ids = new Set(fields.map(row => row.id));
        for (const [id, cell] of cells) if (!ids.has(id)) { cell.node.remove(); cells.delete(id); }
        for (const field of fields) {
          let cell = cells.get(field.id);
          if (!cell) {
            const node = doc.createElement('div'), term = doc.createElement('dt'), value = doc.createElement('dd');
            node.append(term, value); facts.append(node); cell = { node, term, value }; cells.set(field.id, cell);
          }
          cell.term.textContent = field.label;
          const text = formatFieldValue(typeof field.value === 'number' ? Number(field.value.toPrecision(5)) : field.value, field.unit);
          if (cell.value.textContent !== text) cell.value.textContent = text;
        }
        const actionIds = new Set(nextActions.map(row => row.id));
        for (const [id, button] of buttons) if (!actionIds.has(id)) { button.remove(); buttons.delete(id); }
        for (const action of nextActions) if (!buttons.has(action.id)) {
          const button = doc.createElement('button'); button.type = 'button'; button.className = 'sim-action';
          button.dataset.objectAction = action.id; button.addEventListener('click', () => { void act(action.id); });
          actions.append(button); buttons.set(action.id, button);
        }
        nextActions.forEach((action, index) => {
          const button = buttons.get(action.id);
          if (actions.children[index] !== button) actions.insertBefore(button, actions.children[index] || null);
        });
        reflectButtons();
    }
    return Object.freeze({ element: root, render,
      dispose() { root.remove(); },
    });
  }

  function uiError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginUiError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return {
    INITIAL_INSPECTION_COUNT,
    LARGE_OPTION_VISIBLE_LIMIT,
    createDeclarativeUiHost,
    createObjectInspector,
    filterSelectOptions,
    formatFieldValue,
  };
});
