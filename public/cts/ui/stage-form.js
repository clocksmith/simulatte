import { getStageDefinition, listStageDefinitions } from '../engine/stages/index.js';
import { debounce } from '../utils.js';

export class StageForm {
  constructor({ form, metaTarget, bus, store }) {
    this.form = form;
    this.metaTarget = metaTarget;
    this.bus = bus;
    this.store = store;
    this.currentStageId = null;
    this.lastRenderedStageId = null;
    this.debouncedUpdate = debounce(this.persistChanges.bind(this), 120);

    this.form?.addEventListener('input', (event) => this.onInput(event));
    this.form?.addEventListener('change', (event) => this.onInput(event));
  }

  render({ scenario, stageId }) {
    if (!this.form) return;
    if (!scenario || !stageId) {
      this.form.innerHTML = '<div class="cts-form__placeholder">Select a stage to configure its parameters.</div>';
      this.currentStageId = null;
      this.lastRenderedStageId = null;
      if (this.metaTarget) this.metaTarget.textContent = '';
      return;
    }

    const stage = scenario.timeline.find((item) => item.id === stageId);
    if (!stage) return;

    // Skip re-rendering if the same stage is still selected
    // This prevents losing focus when typing in fields
    if (this.lastRenderedStageId === stageId) {
      return;
    }

    this.currentStageId = stage.id;
    this.lastRenderedStageId = stage.id;

    const definitions = listStageDefinitions();
    const def = definitions.find((entry) => entry.type === stage.type);
    const fields = def?.fields || [];

    const fragment = document.createDocumentFragment();

    fragment.appendChild(this.renderStageHeader(stage, def, definitions));
    const params = stage.params || {};
    fields.forEach((field) => fragment.appendChild(this.renderField(field, params)));

    this.form.textContent = '';
    this.form.appendChild(fragment);

    if (this.metaTarget) {
      this.metaTarget.innerHTML = `
        <div>Type: ${stage.type.replace(/_/g, ' ')}</div>
        <div>Updated: ${new Date(stage.updatedAt || Date.now()).toLocaleString()}</div>
      `;
    }
  }

  renderStageHeader(stage, def, definitions = listStageDefinitions()) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cts-form-field';

    const label = document.createElement('label');
    label.textContent = 'Stage Name';
    label.setAttribute('for', 'cts-stage-name');

    const input = document.createElement('input');
    input.id = 'cts-stage-name';
    input.name = 'stageName';
    input.value = stage.name || def?.label || stage.type;
    input.dataset.field = 'name';

    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Stage Type';
    typeLabel.setAttribute('for', 'cts-stage-type');
    typeLabel.className = 'cts-form-field__secondary-label';

    const select = document.createElement('select');
    select.id = 'cts-stage-type';
    select.name = 'stageType';
    select.dataset.field = 'type';

    definitions.forEach((entry) => {
      const option = document.createElement('option');
      option.value = entry.type;
      option.textContent = `${entry.label} (${entry.type})`;
      if (entry.type === stage.type) option.selected = true;
      select.appendChild(option);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(typeLabel);
    wrapper.appendChild(select);
    return wrapper;
  }

  renderField(field, params) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cts-form-field';

    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `field-${field.key}`;

    let input;
    const fieldValue = readParam(params, field.key);

    switch (field.type) {
      case 'text':
        input = document.createElement('input');
        input.type = 'text';
        input.value = fieldValue ?? '';
        break;
      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        if (typeof field.min === 'number') input.min = field.min;
        if (typeof field.max === 'number') input.max = field.max;
        if (typeof field.step === 'number') input.step = field.step;
        input.value = fieldValue ?? '';
        break;
      case 'currency':
        input = document.createElement('input');
        input.type = 'number';
        input.min = field.min ?? '0';
        input.step = field.step ?? '1000';
        input.value = fieldValue ?? '';
        break;
      case 'percent':
        input = document.createElement('input');
        input.type = 'number';
        input.min = field.min ?? '0';
        input.max = field.max ?? '1';
        input.step = field.step ?? '0.01';
        input.value = fieldValue ?? '';
        input.placeholder = '0.10 → 10%';
        break;
      case 'checkbox':
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(fieldValue);
        input.value = 'true';
        break;
      case 'select':
        input = document.createElement('select');
        (field.options || []).forEach((optionDef) => {
          const option = document.createElement('option');
          option.value = optionDef.value;
          option.textContent = optionDef.label;
          if (optionDef.value === fieldValue) option.selected = true;
          input.appendChild(option);
        });
        break;
      case 'founder-list':
        input = document.createElement('textarea');
        input.rows = 4;
        input.placeholder = 'Ada=6000000\nGrace=3000000';
        input.value = formatFounders(fieldValue || params.founders);
        break;
      default:
        input = document.createElement('input');
        input.type = 'text';
        input.value = fieldValue ?? '';
        break;
    }

    input.id = `field-${field.key}`;
    input.dataset.field = field.key;
    input.dataset.fieldType = field.type;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  onInput(event) {
    const target = event.target;
    if (!target || !target.dataset.field) return;
    const fieldKey = target.dataset.field;
    const fieldType = target.dataset.fieldType;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    if (fieldKey === 'name') {
      this.debouncedUpdate({ name: value });
      return;
    }

    if (fieldKey === 'type') {
      const def = getStageDefinition(value);
      this.debouncedUpdate({
        type: value,
        name: def?.label,
        params: def?.defaults ? def.defaults() : {}
      });
      return;
    }

    if (!this.currentStageId) return;

    const payload = {};
    if (fieldType === 'founder-list') {
      payload.params = {
        founders: parseFounders(value)
      };
    } else if (fieldKey.includes('.')) {
      const [parentKey, childKey] = fieldKey.split('.');
      payload.params = { [parentKey]: { [childKey]: parseValue(value, fieldType) } };
    } else {
      payload.params = { [fieldKey]: parseValue(value, fieldType) };
    }

    this.debouncedUpdate(payload);
  }

  persistChanges(changes) {
    if (!this.currentStageId) return;
    this.store.dispatch({
      type: 'stage:update',
      payload: {
        stageId: this.currentStageId,
        changes
      }
    });
  }
}

function formatFounders(founders) {
  if (!Array.isArray(founders)) return '';
  return founders.map((founder) => `${founder.name || 'Founder'}=${founder.shares || 0}`).join('\n');
}

function parseFounders(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, shares] = line.split('=');
      return {
        name: (name || '').trim(),
        shares: Number((shares || '').replace(/[^0-9.-]/g, '')) || 0
      };
    });
}

function parseValue(value, type) {
  switch (type) {
    case 'number':
      return value === '' ? '' : Number(value);
    case 'currency':
      return value === '' ? '' : Number(value);
    case 'percent':
      return value === '' ? '' : Number(value);
    case 'checkbox':
      return Boolean(value);
    default:
      return value;
  }
}

function readParam(params, key) {
  if (!key.includes('.')) {
    return params[key];
  }
  return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), params);
}
