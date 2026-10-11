(function attachActivityEditor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteActivityEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function activityEditor() {
  function connect(documentRoot, { revise }) {
    const host = documentRoot.getElementById('create-activity-editor');
    if (!host || typeof revise !== 'function') throw new Error('Activity editor requires a host and revision command');
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
      const isSupport = ['seat', 'support'].includes(object.kind);
      const x = isSupport ? number(form, 'Position X (m)', object.position[0]) : null;
      const radius = number(form, 'Radius (m)', object.radius);
      const seat = object.kind === 'seat' ? number(form, 'Seat height (m)', object.seatHeight) : null;
      const support = object.kind === 'support' ? number(form, 'Surface height (m)', object.supportHeight) : null;
      const fill = object.liquidContainer ? number(form, 'Cup fill (%)', object.liquidContainer.fillFraction * 100) : null;
      if (fill) { fill.min = 0; fill.max = 100; }
      radius.min = '0';
      form.append(button('Apply object changes', null, 'submit'));
      form.addEventListener('submit', event => {
        event.preventDefault();
        const changes = { radius: Number(radius.value) };
        if (x) changes.position = [Number(x.value), Number(seat?.value ?? support?.value ?? object.position[1])];
        if (seat) changes.seatHeight = Number(seat.value);
        if (support) changes.supportHeight = Number(support.value);
        if (fill) changes.liquidFillFraction = Number(fill.value) / 100;
        void apply({ objectId: object.id, changes });
      });
      section.append(button('Remove object', () => void apply({ objectId: object.id, remove: true })));
    }
    function timeline(program) {
      const section = element('div'); section.className = 'activity-timeline'; content.append(section);
      section.append(element('h3', 'Actions'));
      section.append(button('Swap hands', () => void apply({ swapHands: true })));
      for (const action of program.actions) {
        const detail = element('details'); section.append(detail);
        const participants = [action.objectId, action.supportObjectId].filter(Boolean).map(labelFor).join(' → ');
        detail.append(element('summary', `${action.startSeconds}–${action.endSeconds}s · ${action.action}${participants ? ` · ${participants}` : ''}${action.hand ? ` · ${action.hand} hand` : ''}`));
        const form = element('form'); form.className = 'activity-edit-fields'; detail.append(form);
        const hand = action.hand ? select(form, 'Hand', action.hand, [['left', 'Left'], ['right', 'Right']]) : null;
        const duration = number(form, 'Duration (s)', action.durationSeconds); duration.min = '0.001'; duration.max = 120;
        const after = select(form, 'Start', action.timing.after, [['', 'At the start'],
          ...program.actions.filter(row => row.id !== action.id).map(row => [row.id, `After ${row.action}${row.objectId ? ` · ${labelFor(row.objectId)}` : ''}`])]);
        const object = action.objectId ? select(form, 'Uses object', action.objectId,
          program.objects.map(row => [row.id, labelFor(row.id)])) : null;
        const support = action.supportObjectId ? select(form, 'Place on', action.supportObjectId,
          program.objects.map(row => [row.id, labelFor(row.id)])) : null;
        form.append(button('Apply action changes', null, 'submit'));
        form.addEventListener('submit', event => {
          event.preventDefault();
          const changes = { afterActionId: after.value || null, durationSeconds: Number(duration.value) };
          if (hand) changes.hand = hand.value;
          if (object) changes.objectId = object.value;
          if (support) changes.supportObjectId = support.value;
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
