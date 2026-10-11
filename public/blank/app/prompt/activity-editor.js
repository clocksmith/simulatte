(function attachActivityEditor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteActivityEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function activityEditor() {
  function connect(documentRoot, { revise, objectChanges }) {
    const host = documentRoot.getElementById('create-activity-editor');
    if (!host || typeof revise !== 'function' || typeof objectChanges !== 'function') throw new Error('Activity editor requires a host and revision command');
    let snapshot = null, key = '', selectedId = '', lastSelectedId = '', disposed = false, pending = false;
    const element = (tag, text = '') => { const node = documentRoot.createElement(tag); node.textContent = text; return node; };
    const labelFor = id => snapshot.nodes.find(node => node.id === id)?.label || id;
    const status = element('p'); status.className = 'sim-status'; status.setAttribute('role', 'status');
    const content = element('div'); content.className = 'activity-editor-content';
    host.append(content, status);
    function field(form, label, node) {
      const wrapper = element('label', label); wrapper.append(node); form.append(wrapper); return node;
    }
    function select(form, label, value, options) {
      const node = element('select'); node.className = 'sim-field';
      for (const [id, text] of options) { const option = element('option', text); option.value = id; node.append(option); }
      node.value = value ?? ''; return field(form, label, node);
    }
    function number(form, label, value, step = 'any') {
      const node = element('input'); node.className = 'sim-field'; node.type = 'number'; node.step = step;
      node.value = value; node.required = true; return field(form, label, node);
    }
    function button(text, action, type = 'button') {
      const node = element('button', text); node.type = type; node.className = 'sim-action';
      if (action) node.addEventListener('click', action); return node;
    }
    function busy() {
      const blocked = pending || ['active', 'loading'].includes(snapshot?.state);
      for (const node of content.querySelectorAll('button, input, select')) node.disabled = blocked;
    }
    async function apply(revision) {
      pending = true; busy(); status.textContent = 'Preparing revision'; status.dataset.state = 'active';
      try {
        await revise(revision);
        if (disposed) return;
        status.textContent = 'Revision applied'; status.dataset.state = 'ready';
      } catch (error) {
        if (disposed || error.name === 'AbortError') return;
        status.textContent = `Previous activity remains visible. ${error.message}`; status.dataset.state = 'error';
      } finally { pending = false; if (!disposed) busy(); }
    }
    function objectEditor(program) {
      const section = element('div'); section.className = 'activity-object-editor'; content.append(section);
      const picker = select(section, 'Object', selectedId, program.objects.map(object => [object.id, labelFor(object.id)]));
      picker.addEventListener('change', () => { selectedId = picker.value; key = ''; render(); });
      const object = program.objects.find(row => row.id === selectedId);
      if (!object) return;
      const roles = program.actions.filter(action => action.objectId === object.id || action.supportObjectId === object.id)
        .map(action => `${action.action}${action.hand ? ` · ${action.hand} hand` : ''}`);
      section.append(element('p', roles.join(', ')));
      const form = element('form'); form.className = 'activity-edit-fields'; section.append(form);
      const properties = (object.authoringFields || []).map(descriptor => {
        const input = number(form, descriptor.label, descriptor.value);
        if (descriptor.min !== undefined) input.min = descriptor.min;
        if (descriptor.max !== undefined) input.max = descriptor.max;
        return { descriptor, input };
      });
      form.append(button('Apply object changes', null, 'submit'));
      form.addEventListener('submit', event => {
        event.preventDefault();
        const values = Object.fromEntries(properties.map(({ descriptor, input }) => [`${descriptor.key}:${descriptor.axis ?? ''}`, input.value]));
        void apply({ objectId: object.id, changes: objectChanges(object, values) });
      });
      section.append(button('Remove object', () => void apply({ objectId: object.id, remove: true })));
    }
    function timeline(program) {
      const section = element('div'); section.className = 'activity-timeline'; content.append(section);
      section.append(element('h3', 'Actions'));
      section.append(button('Swap hands', () => void apply({ swapHands: true })));
      for (const action of program.actions) {
        const detail = element('details'); section.append(detail);
        const participantLabels = [action.objectId, action.supportObjectId].filter(Boolean).map(labelFor).join(' → ');
        detail.append(element('summary', `${action.startSeconds}–${action.endSeconds}s · ${action.action}${participantLabels ? ` · ${participantLabels}` : ''}${action.hand ? ` · ${action.hand} hand` : ''}`));
        const form = element('form'); form.className = 'activity-edit-fields'; detail.append(form);
        const parameters = (action.component.contract?.parameters || []).map(descriptor => ({ descriptor,
          input: select(form, descriptor.label, action[descriptor.key], descriptor.values.map(value => [value, value])) }));
        const duration = number(form, 'Duration (s)', action.durationSeconds); duration.min = '0.001'; duration.max = 120;
        const after = select(form, 'Start', action.timing.after, [['', 'At the start'],
          ...program.actions.filter(row => row.id !== action.id).map(row => [row.id, `After ${row.action}${row.objectId ? ` · ${labelFor(row.objectId)}` : ''}`])]);
        const participants = (action.component.contract?.participants || []).filter(role => role.editable).map(role => ({ role,
          input: select(form, role.label, action[role.slot], program.objects.filter(object =>
            role.capabilities.every(capability => object.capabilities.includes(capability))).map(object => [object.id, labelFor(object.id)])) }));
        form.append(button('Apply action changes', null, 'submit'));
        form.addEventListener('submit', event => {
          event.preventDefault();
          const changes = { afterActionId: after.value || null, durationSeconds: Number(duration.value) };
          for (const { descriptor, input } of parameters) changes[descriptor.key] = input.value;
          for (const { role, input } of participants) changes[role.slot] = input.value;
          void apply({ actionId: action.id, changes });
        });
      }
    }
    function render() {
      const program = snapshot.activity;
      host.hidden = !snapshot.visible || !program || !program.actions.length;
      if (host.hidden) return;
      const selected = snapshot.selectedObjectId;
      if (selected !== lastSelectedId && selected && program.objects.some(row => row.id === selected)) selectedId = selected;
      lastSelectedId = selected;
      if (!program.objects.some(row => row.id === selectedId)) selectedId = program.objects[0]?.id || '';
      const nextKey = `${snapshot.worldSpecHash}:${selectedId}`;
      if (key !== nextKey) {
        key = nextKey; content.replaceChildren();
        if (program.objects.length) objectEditor(program);
        timeline(program);
      }
      busy();
    }
    return Object.freeze({ sync(next) { snapshot = next; if (!disposed) render(); }, dispose() { disposed = true; host.replaceChildren(); } });
  }
  return Object.freeze({ connect });
});
