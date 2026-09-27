(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteObjectInteraction = api;
})(globalThis, function(root) {
  const DESCRIPTIONS = Object.freeze({
    'gpu-supercluster': 'Racks compute forward and backward passes, then wait for dependent racks before exchanging gradients. A straggler changes this running computation.',
    'sun-walker': 'The route balances walking time and direct sun within the allowed detour. Preview another preference before applying it to a new walk.',
    'subsea-network-global': 'Service depends on available cable capacity and allocation policy. Failures and repairs below recalculate the scenario.',
    'grid-resilience-us': 'Demand, generation and storage determine served load. Policy changes recalculate the regional dispatch scenario.',
    'orbital-transfer-planner': 'The selected solution balances transfer time and delta-v. Preview a different objective before restarting the transfer.',
    'interstellar-relay-network': 'Packets transmit, wait for contacts, propagate and process at relays before delivery. Sending here starts a newly calculated transmission.',
  });
  function objectsFor(contribution) {
    return (contribution?.presentation.layers || []).filter(row => !['label'].includes(row.kind))
      .map(layer => ({ id: layer.id, label: layer.label, layer }));
  }
  function actionFor(contribution, selectedId) {
    const controls = Object.fromEntries(contribution.controls.controls.map(row => [row.id, row]));
    const values = Object.fromEntries(contribution.controls.controls.map(row => [row.id, structuredClone(row.value)]));
    const next = id => {
      const control = controls[id]; if (!control) return null;
      const options = control.options || [];
      return options[(options.findIndex(row => row.value === control.value) + 1) % options.length]?.value;
    };
    const change = (id, value, label) => value === null || value === undefined ? null : ({ values: { ...values, [id]: value }, label });
    switch (contribution.pluginId) {
      case 'sun-walker': return change('directSunWeight', Number(values.directSunWeight) > 0 ? 0 : 5,
        Number(values.directSunWeight) > 0 ? 'Prefer shortest walk' : 'Prefer shade');
      case 'grid-resilience-us': return change('storagePolicyId', next('storagePolicyId'), `Storage: ${next('storagePolicyId')}`);
      case 'orbital-transfer-planner': return change('timeWeight', Number(values.timeWeight) > 0.05 ? 0.01 : 0.2,
        Number(values.timeWeight) > 0.05 ? 'Prioritize delta-v' : 'Prioritize flight time');
      case 'interstellar-relay-network': {
        const star = selectedId.startsWith('star:') ? selectedId.slice(5) : null;
        if (star && star !== values.sourceId && controls.targetId.options.some(row => row.value === star)) return change('targetId', star, 'Send packet to this endpoint');
        return { values, label: 'Send packet' };
      }
      case 'subsea-network-global': {
        const resource = controls.failedResourceIds?.options?.find(row => selectedId === `corridor:${row.value}` || selectedId === row.value);
        if (resource) {
          const failed = (values.failedResourceIds || []).filter(id => id !== 'none');
          const removing = failed.includes(resource.value);
          const ids = removing ? failed.filter(id => id !== resource.value) : [...failed, resource.value];
          return change('failedResourceIds', ids, removing ? 'Restore resource' : 'Fail resource');
        }
        return change('repairPolicyId', next('repairPolicyId'), `Repair policy: ${next('repairPolicyId')}`);
      }
      default: return null;
    }
  }
  function create({ host, canvas, getSession, projectObjects, onInsets = () => {} }) {
    let contribution = null, selectedId = null, down = null, preview = null, selectionRevision = 0;
    const events = new AbortController();
    const command = (id, input) => getSession().invoke(id, input);
    const inspector = root.SimulatteDeclarativeUiHost.createObjectInspector({ host,
      onSelect: id => { void command('select-object', id).catch(() => {}); },
      onAction: async id => {
        if (id === 'focus') return command('focus-object', selectedId);
        if (id === 'straggler') {
          const fields = selectedFields();
          return command('straggler', { rackId: selectedId.slice(5), slowdown: fields.find(row => row.id === 'slowdown')?.value ? 0 : 95 });
        }
        const action = actionFor(contribution, selectedId);
        if (!action) throw new Error('No supported action for this object');
        if (id === 'preview') {
          const revision = selectionRevision;
          const original = selectedFields().map(row => ({ ...row }));
          const next = await command('preview-controls', action.values);
          if(revision!==selectionRevision)throw Object.assign(new Error('Selection changed'),{name:'AbortError'});
          preview = { original, next };
          render();
          return { message: 'Preview calculated. Current simulation is unchanged. Apply and restart to use it.' };
        }
        await command('apply-controls', action.values);
        return { message: 'Applied and restarted' };
      },
    });
    function selectedFields() {
      if (!contribution) return [];
      const matching = contribution.inspections.filter(row => row.targetIds.includes(selectedId));
      const inspections = matching.length ? [matching.sort((a,b)=>a.targetIds.length-b.targetIds.length)[0]] : ['sun-walker', 'orbital-transfer-planner', 'interstellar-relay-network'].includes(contribution.pluginId) ? contribution.inspections : [];
      const layer = objectsFor(contribution).find(row => row.id === selectedId)?.layer;
      const fields = inspections.flatMap(row => row.fields);
      if (layer?.quantity) fields.unshift({ id: 'quantity', label: layer.quantity.kind, value: layer.quantity.value, unit: layer.quantity.unit });
      return fields;
    }
    function render() {
      const objects = objectsFor(contribution);
      const object = objects.find(row => row.id === selectedId);
      const action = object ? actionFor(contribution, selectedId) : null;
      const fields = selectedFields().slice(0, 10);
      const actions = object ? [{ id: 'focus', label: 'Focus object' }] : [];
      if (object && contribution.pluginId === 'gpu-supercluster' && selectedId.startsWith('rack:')) {
        actions.push({ id: 'straggler', label: selectedFields().find(row => row.id === 'slowdown')?.value ? 'Remove straggler' : 'Introduce straggler', disabled: contribution.state.status === 'settled' });
      }
      if (action) {
        fields.push({ id: 'proposed-change', label: 'Proposed change', value: action.label });
        if (['sun-walker', 'orbital-transfer-planner'].includes(contribution.pluginId)) actions.push({ id: 'preview', label: 'Preview change' });
        actions.push({ id: 'apply', label: contribution.pluginId === 'interstellar-relay-network' ? 'Send packet · Apply and restart' : 'Apply and restart' });
      }
      if (contribution?.pluginId === 'interstellar-relay-network') {
        const ids = new Set(contribution.state.eventIds);
        fields.push({ id: 'events', label: 'Packet events', value: contribution.events.filter(row => ids.has(row.id)).slice(-4).map(row => row.kind).join(' → ') });
      }
      if (preview) {
        fields.push({ id: 'previous-solution', label: 'Current solution at preview', value: preview.original.slice(0, 3).map(row => `${row.label}: ${row.value}`).join(' · ') });
        fields.push({ id: 'preview-solution', label: 'Recalculated preview', value: preview.next.inspections.flatMap(row => row.fields).slice(0, 6).map(row => `${row.label}: ${row.value}`).join(' · ') });
      }
      inspector.render({ objects, selectedId: object ? selectedId : null, label: object?.label,
        description: DESCRIPTIONS[contribution?.pluginId] || '', fields, actions });
      onInsets(inspector.element);
    }
    canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; }, { signal: events.signal });
    canvas.addEventListener('pointerup', event => {
      if (!down) return;
      const moved = Math.hypot(down.x - event.clientX, down.y - event.clientY); down = null;
      if (moved > 5) return;
      const rect = canvas.getBoundingClientRect(), point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const picks = (projectObjects?.(contribution) || []).map(row => ({ id: row.id, distance: distanceToObject(point, row.points) })).sort((a, b) => a.distance - b.distance);
      if (picks[0]?.distance < 24) void command('select-object', picks[0].id).catch(() => {});
    }, { signal: events.signal });
    canvas.__simulatteObjectTargets = () => projectObjects?.(contribution) || [];
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => onInsets(inspector.element)) : null;
    resize?.observe(inspector.element); resize?.observe(canvas);
    return Object.freeze({
      select(id) { selectionRevision++; selectedId = id; preview = null; render(); },
      update(next) { contribution = next; render(); },
      selected: () => selectedId,
      dispose() { delete canvas.__simulatteObjectTargets; events.abort(); resize?.disconnect(); inspector.dispose(); },
    });
  }
  function distanceToObject(point, points = []) {
    let distance = Infinity;
    points.forEach((p, i) => {
      if (!p) return;
      distance = Math.min(distance, Math.hypot(point.x - p.x, point.y - p.y));
      const b = points[i + 1]; if (!b) return;
      const dx = b.x - p.x, dy = b.y - p.y, t = Math.max(0, Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / (dx * dx + dy * dy || 1)));
      distance = Math.min(distance, Math.hypot(point.x - p.x - t * dx, point.y - p.y - t * dy));
    });
    return distance;
  }
  return Object.freeze({ create, objectsFor, actionFor, distanceToObject });
});
