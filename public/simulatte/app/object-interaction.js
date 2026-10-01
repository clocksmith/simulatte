(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteObjectInteraction = api;
})(globalThis, function(root) {
  const DESCRIPTIONS = Object.freeze({
    'gpu-supercluster': 'Racks compute, then wait for one another to exchange gradients. Slow a rack to see its dependencies wait.',
    'sun-walker': 'This route balances walking time and sun exposure within the allowed detour. Preview a different preference before starting a new walk.',
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
    let contribution = null, selectedId = null, down = null, preview = null, selectionRevision = 0, scenarioKey = null;
    const events = new AbortController();
    const command = (id, input) => getSession().invoke(id, input);
    const identity = value => JSON.stringify([value?.pluginId, value?.state?.scenarioId,
      value?.controls.controls.map(row => [row.id, row.value])]);
    const inspector = root.SimulatteDeclarativeUiHost.createObjectInspector({ host,
      onSelect: id => { void command('select-object', id).catch(() => {}); },
      onAction: async id => {
        if (id === 'focus') return command('focus-object', selectedId);
        if (id === 'straggler') {
          const fields = selectedFields();
          const rackId = selectedId.slice(5), slowdown = fields.find(row => row.id === 'slowdown')?.value ? 0 : 95;
          await command('straggler', { rackId, slowdown });
          return { message: slowdown ? `${rackId}: compute speed reduced by 95%.` : `${rackId}: normal compute speed restored.` };
        }
        const action = actionFor(contribution, selectedId);
        if (!action) throw new Error('No supported action for this object');
        if (id === 'preview') {
          const revision = selectionRevision, generation = getSession().snapshot().generation;
          const original = selectedFields().map(row => ({ ...row }));
          const next = await command('preview-controls', action.values);
          if(revision!==selectionRevision || generation!==getSession().snapshot().generation)throw Object.assign(new Error('Selection changed'),{name:'AbortError'});
          preview = { original, next, generation };
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
      if (layer?.quantity) {
        const { kind, value, unit } = layer.quantity;
        const walking = contribution.pluginId === 'sun-walker';
        const progress = walking && ['actor.pedestrian.route-progress', 'destination.arrival'].includes(kind);
        const label = contribution.pluginId === 'gpu-supercluster' ? 'Current task progress' : progress ? 'Walk completed'
          : walking ? (kind === 'occlusion.shadow-length' ? 'Shadow length' : kind.startsWith('exposure.') ? 'Time sampled on segment' : 'Direct sun on route') : kind;
        fields.unshift({ id: 'quantity', label, value: progress ? value * 100 : value, unit: progress ? 'percent' : unit });
      }
      return fields.map(field => {
        if (contribution.pluginId !== 'gpu-supercluster') return field;
        if (field.id === 'task') return { ...field, unit: null, value: ({ forward: 'Forward pass', backward: 'Backward pass', allreduce: 'Gradient exchange', waiting: 'Waiting for racks' })[field.value] || field.value };
        return field.unit === 'dependency' ? { ...field, unit: null } : field;
      });
    }
    function render() {
      if (preview && preview.generation !== getSession().snapshot().generation) preview = null;
      const objects = objectsFor(contribution);
      const object = objects.find(row => row.id === selectedId);
      const action = object ? actionFor(contribution, selectedId) : null;
      const fields = selectedFields().slice(0, 10);
      const actions = object ? [{ id: 'focus', label: 'Focus object' }] : [];
      if (object && contribution.pluginId === 'gpu-supercluster' && selectedId.startsWith('rack:')) {
        actions.push({ id: 'straggler', label: selectedFields().find(row => row.id === 'slowdown')?.value ? 'Restore rack' : 'Slow rack', disabled: contribution.state.status === 'settled' });
      }
      if (action) {
        fields.unshift({ id: 'proposed-change', label: 'Proposed change', value: action.label });
        if (['sun-walker', 'orbital-transfer-planner'].includes(contribution.pluginId)) actions.push({ id: 'preview', label: contribution.pluginId === 'sun-walker' ? (action.values.directSunWeight ? 'Preview shade' : 'Preview shortest walk') : 'Preview change' });
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
        prompt: contribution?.pluginId === 'gpu-supercluster' ? 'Select a rack or link…' : contribution?.pluginId === 'sun-walker' ? 'Select walker or route…' : 'Select an object…',
        description: DESCRIPTIONS[contribution?.pluginId] || '', fields, actions });
      onInsets(inspector.element);
    }
    canvas.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY }; }, { signal: events.signal });
    canvas.addEventListener('pointercancel', () => { down = null; }, { signal: events.signal });
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
      update(next) {
        const nextKey = identity(next);
        if (nextKey !== scenarioKey) { selectionRevision++; preview = null; scenarioKey = nextKey; }
        contribution = next; render();
      },
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
