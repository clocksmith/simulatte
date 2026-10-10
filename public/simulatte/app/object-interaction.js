(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteObjectInteraction = api;
})(globalThis, function(root) {
  function objectsFor(contribution) {
    return (contribution?.objects || []).map(object => ({ ...object,
      layer: contribution.presentation.layers.find(layer => layer.id === object.id) }));
  }
  function actionFor(contribution, targetId, actionId) {
    return contribution?.objects?.find(row => row.id === targetId)?.actions.find(action => !actionId || action.id === actionId) || null;
  }
  function withPreview(contribution, preview) {
    if (!contribution || !preview) return contribution;
    return { ...contribution, provenanceRecords:[...(contribution.provenanceRecords || []), ...(preview.provenanceRecords || [])], objects: [...(contribution.objects || []), ...preview.objects],
      inspections: [...contribution.inspections, ...preview.inspections],
      presentation: { ...contribution.presentation, layers: [...contribution.presentation.layers, ...preview.presentation.layers] } };
  }
  function qualifyPreview(preview) {
    const ids = new Map((preview.provenanceRecords || []).map(row => [row.id, `${preview.id}:${row.id}`]));
    const rename = id => ids.get(id) || id;
    const provenance = value => ({ ...value, evidenceRefs: value.evidenceRefs.map(row => ({ ...row, id:rename(row.id), ...(row.modelReceiptId ? {modelReceiptId:rename(row.modelReceiptId)} : {}) })) });
    return { ...preview,
      provenanceRecords: (preview.provenanceRecords || []).map(row => ({ ...row, id:rename(row.id), parentIds:row.parentIds.map(rename),
        envelope:{...row.envelope,subjectId:rename(row.envelope.subjectId),parentIds:row.envelope.parentIds.map(rename),modelReceiptIds:row.envelope.modelReceiptIds.map(rename)} })),
      presentation:{...preview.presentation,layers:preview.presentation.layers.map(row=>({...row,provenance:row.provenance ? provenance(row.provenance) : row.provenance}))},
      inspections:preview.inspections.map(row=>({...row,fields:row.fields.map(field=>({...field,provenance:provenance(field.provenance)}))})),
    };
  }
  function create({ host, canvas, getSession, projectObjects, onInsets = () => {}, onPreviewChange = () => {} }) {
    let contribution = null, selectedId = null, down = null, tap = null, preview = null, selectionRevision = 0, scenarioKey = null, alternatives = null, openingSelection = true;
    const events = new AbortController();
    const command = (id, input) => getSession().invoke(id, input);
    const identity = value => JSON.stringify([value?.pluginId, value?.controls.controls.map(row => [row.id, row.value])]);
    const combined = () => withPreview(contribution, preview);
    const inspector = root.SimulatteDeclarativeUiHost.createObjectInspector({ host,
      onSelect: id => { void command('select-object', id).catch(() => {}); },
      onAction: async id => {
        if (id === 'focus') return command('focus-object', selectedId);
        if (id === 'dismiss-preview') { preview = null; await onPreviewChange(); render(); return { message: 'Alternative dismissed.' }; }
        const action = actionFor(combined(), selectedId, id);
        if (!action?.available) throw new Error('This action is not currently available.');
        const revision = selectionRevision, generation = getSession().snapshot().generation;
        const input = { targetId: selectedId, actionId: id, ...(action.prepared ? { prepared: { ...action, controls: preview.controls } } : {}) };
        if (action.execution === 'preview') {
          const next = await command('object-preview', input);
          if (revision !== selectionRevision || generation !== getSession().snapshot().generation) throw Object.assign(new Error('Selection changed'), { name: 'AbortError' });
          preview = { ...qualifyPreview(next), generation };
          selectedId = next.objects[0].id;
          await onPreviewChange(); render();
          return { message: 'Alternative drawn. The accepted run is unchanged.' };
        }
        await command(action.execution === 'restart' ? 'object-apply' : 'object-live', input);
        if (action.execution === 'restart') { preview = null; selectedId = action.afterApplyTargetId || selectedId; await onPreviewChange(); render(); }
        return { message: action.execution === 'restart' ? 'Applied and restarted.' : 'Applied to '+combined().objects.find(row=>row.id===input.targetId).label+'.' };
      },
    });
    function render() {
      const all = combined(), objects = objectsFor(all), object = objects.find(row => row.id === selectedId);
      const matching = all?.inspections.filter(row => row.targetIds.includes(selectedId)) || [];
      const fields = matching.sort((a, b) => a.targetIds.length - b.targetIds.length)[0]?.fields || [];
      const actions = object ? [{ id: 'focus', label: 'Focus object' }, ...object.actions.map(action => ({
        id: action.id, label: action.execution === 'restart' && !action.prepared ? `${action.label} · Apply and restart` : action.label, disabled: !action.available,
      }))] : [];
      if (preview) actions.push({ id: 'dismiss-preview', label: 'Dismiss alternative' });
      inspector.render({ objects: alternatives || objects, selectedId: object ? selectedId : null, label: object?.label,
        prompt: alternatives ? 'Overlapping objects: choose…' : 'Select an object…', description: object?.description || '',
        fields: [...fields, ...(object?.actions || []).map(action => ({ id: `proposed:${action.id}`, label: 'Proposed change', value: action.proposedChange }))], actions });
      onInsets(inspector.element);
    }
    function picksAt(event) {
      const rect = canvas.getBoundingClientRect();
      return hitObjects({ x: event.clientX - rect.left, y: event.clientY - rect.top }, projectObjects?.(combined()) || [], objectsFor(combined()));
    }
    canvas.addEventListener('pointerdown', event => { tap = null; down = { x: event.clientX, y: event.clientY }; }, { signal: events.signal });
    canvas.addEventListener('pointercancel', () => { down = null; tap = null; }, { signal: events.signal });
    canvas.addEventListener('pointerup', event => {
      if (!down) return;
      const moved = Math.hypot(down.x - event.clientX, down.y - event.clientY); down = null;
      tap = moved <= 5 ? { clientX:event.clientX, clientY:event.clientY } : null;
    }, { signal: events.signal });
    canvas.addEventListener('click', () => {
      // Complete the tap before mounting controls under it. A touch compatibility click must not close the new inspector.
      if (!tap) return;
      const point = tap; tap = null;
      const picks = picksAt(point);
      if (!picks.length) return;
      const tied = picks.filter(row => row.priority === picks[0].priority && Math.abs(row.distance - picks[0].distance) < 2 && row.shape === 'path');
      if (tied.length > 1) { alternatives = objectsFor(combined()).filter(row => tied.some(hit => hit.id === row.id)); selectedId = null; render(); return; }
      void command('select-object', picks[0].id).catch(() => {});
    }, { signal: events.signal });
    canvas.addEventListener('pointermove', event => { if (!down) canvas.style.cursor = picksAt(event).length ? 'pointer' : ''; }, { signal: events.signal });
    canvas.__simulattePreview = () => preview;
    canvas.__simulatteObjectTargets = () => (projectObjects?.(combined()) || []).filter(row => objectsFor(combined()).some(object => object.id === row.id));
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => onInsets(inspector.element)) : null;
    resize?.observe(inspector.element); resize?.observe(canvas);
    return Object.freeze({
      select(id) { selectionRevision++; selectedId = id; alternatives = null; render(); },
      update(next) {
        const nextKey = identity(next), generation = getSession()?.snapshot().generation ?? 0;
        if (nextKey !== scenarioKey || (preview && preview.generation !== generation)) {
          selectionRevision++; preview = null; scenarioKey = nextKey;
          if (selectedId && !next.objects?.some(row => row.id === selectedId)) selectedId = null;
        }
        contribution = next;
        if(openingSelection){openingSelection=false;if(next.pluginId==='gpu-supercluster'){const first=next.objects.find(row=>row.id.startsWith('rack:'));if(first)selectedId=first.id;}}
        render();
      },
      action(targetId, actionId) {
        const action = actionFor(combined(), targetId, actionId);
        if (!action?.available) throw new Error('Selected object action is unavailable.');
        return structuredClone({ ...action, ...(action.prepared ? { controls: preview.controls } : {}) });
      },
      presentation: () => combined()?.presentation,
      provenanceReceipts: receipts => preview ? receipts.map(receipt => receipt.pluginId === contribution.pluginId
        ? root.SimulatteProvenanceRegistry.createContributionProvenanceReceipt(combined()) : receipt) : receipts,
      preview: () => preview,
      selected: () => selectedId,
      dispose() { delete canvas.__simulattePreview; delete canvas.__simulatteObjectTargets; events.abort(); resize?.disconnect(); inspector.dispose(); },
    });
  }
  function inside(point, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  function hitObjects(point, projected, objects) {
    return projected.flatMap(row => {
      const object = objects.find(object => object.id === row.id); if (!object) return [];
      const points = row.points.filter(Boolean); if (!points.length) return [];
      const { shape, radiusPx, priority } = object.hit;
      const polygon = shape === 'bounds' && row.bounds ? row.bounds : points;
      const distance = ['polygon', 'bounds'].includes(shape) && polygon.length >= 3 && inside(point, polygon) ? 0 : distanceToObject(point, ['polygon','bounds'].includes(shape) && polygon.length>2 ? [...polygon,polygon[0]] : polygon);
      return distance <= radiusPx ? [{ id: row.id, distance, priority, shape, depth: row.depth ?? Math.min(...points.map(p => p.depth ?? 0)) }] : [];
    }).sort((a, b) => b.priority - a.priority || a.distance - b.distance || a.depth - b.depth);
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
  function supportsLiveActions(contribution) {
    return (contribution?.objects || []).some(object => object.actions.some(action => action.execution === 'continue'));
  }
  return Object.freeze({ create, objectsFor, actionFor, withPreview, qualifyPreview, hitObjects, distanceToObject, supportsLiveActions });
});
