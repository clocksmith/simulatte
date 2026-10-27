(function (root) {
  'use strict';
  const RAIL = Object.freeze({collapsed: 56, min: 160, max: 360, minCanvas: 320, compactMargin: 96, step: 10});

  // One component for both side rails: a collapsed strip or an expanded panel resized from its inner edge.
  // On phones the footprint stays collapsed and an expanded rail overlays the workspace.
  function createRail({doc, win, on, layout, compact, side, panel, toggle, label, storageKey, defaultExpanded, defaultWidth, usableWhenCollapsed, vars, flag, otherFootprint, onChange}) {
    const left = side === 'left';
    let expanded = defaultExpanded, width = defaultWidth;
    try { const saved = JSON.parse(win.localStorage.getItem(storageKey)); if (saved) { expanded = Boolean(saved.expanded); if (Number.isFinite(saved.width)) width = saved.width; } } catch {}
    const resizer = doc.createElement('div');
    resizer.className = 'lucyd-rail-resizer'; resizer.dataset.side = side; resizer.tabIndex = 0;
    resizer.setAttribute('role', 'separator'); resizer.setAttribute('aria-label', `Resize ${label}`); resizer.setAttribute('aria-orientation', 'vertical');
    layout.append(resizer);
    toggle.classList.add('lucyd-rail-toggle'); toggle.dataset.side = side;
    const maxWidth = () => Math.min(RAIL.max, Math.max(RAIL.min, win.innerWidth - (compact.matches ? RAIL.compactMargin : otherFootprint() + RAIL.minCanvas)));
    const panelWidth = () => expanded ? Math.max(RAIL.min, Math.min(maxWidth(), width)) : RAIL.collapsed;
    const footprint = () => compact.matches ? RAIL.collapsed : panelWidth();
    // The neighbour bound uses this rail's requested width, so the two rails never bound each other recursively.
    const requested = () => compact.matches || !expanded ? RAIL.collapsed : Math.max(RAIL.min, Math.min(RAIL.max, width));
    function save() { try { win.localStorage.setItem(storageKey, JSON.stringify({expanded, width})); } catch {} }
    function sync() {
      layout.style.setProperty(vars.footprint, `${footprint()}px`);
      layout.style.setProperty(vars.width, `${panelWidth()}px`);
      doc.body.dataset[flag] = String(expanded);
      const usable = expanded || usableWhenCollapsed;
      panel.inert = !usable; panel.dataset.open = String(usable);
      resizer.hidden = !expanded || compact.matches;
      resizer.setAttribute('aria-valuemin', String(RAIL.min)); resizer.setAttribute('aria-valuemax', String(maxWidth())); resizer.setAttribute('aria-valuenow', String(panelWidth()));
      toggle.textContent = expanded === left ? '‹' : '›';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${label}`);
    }
    function size(value) { width = Math.max(RAIL.min, Math.min(maxWidth(), value)); save(); sync(); onChange(); }
    const edgeWidth = clientX => left ? clientX : win.innerWidth - clientX;
    on(resizer, 'pointerdown', event => { if (!expanded) return; event.preventDefault(); resizer.setPointerCapture(event.pointerId); size(edgeWidth(event.clientX)); });
    on(resizer, 'pointermove', event => { if (resizer.hasPointerCapture(event.pointerId)) size(edgeWidth(event.clientX)); });
    on(resizer, 'pointerup', event => { if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId); });
    // Arrow keys move the inner edge, so the widening key points toward the canvas on both sides.
    on(resizer, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const grow = event.key === (left ? 'ArrowRight' : 'ArrowLeft');
      size(event.key === 'Home' ? RAIL.min : event.key === 'End' ? RAIL.max : panelWidth() + (grow ? RAIL.step : -RAIL.step));
    });
    function setExpanded(value) { expanded = Boolean(value); save(); sync(); onChange(); }
    return {
      side, panel, toggle, sync, footprint, requested, setExpanded,
      get expanded() { return expanded; },
      state: () => ({expanded, width: panelWidth()}),
      dispose() { resizer.remove(); delete doc.body.dataset[flag]; },
    };
  }

  function create({canvas, document: doc = document}) {
    const win = doc.defaultView, events = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, {...options, signal: events.signal});
    const menu = doc.getElementById('workspace-menu'), compact = win.matchMedia('(max-width: 700px)');
    const layout = doc.querySelector('.editor-layout');
    const rails = {};
    const shared = {doc, win, on, layout, compact, onChange: () => updateInsets()};
    rails.left = createRail({...shared, side: 'left', panel: doc.querySelector('.palette-panel'), toggle: doc.getElementById('palette-toggle'), label: 'component library',
      storageKey: 'simulatte.lucyd.componentRail.v1', defaultExpanded: !compact.matches, defaultWidth: 208, usableWhenCollapsed: true,
      vars: {footprint: '--lucyd-rail-width', width: '--lucyd-palette-width'}, flag: 'paletteExpanded', otherFootprint: () => rails.right?.requested() ?? RAIL.collapsed});
    rails.right = createRail({...shared, side: 'right', panel: doc.querySelector('.properties-panel'), toggle: doc.getElementById('properties-toggle'), label: 'properties',
      storageKey: 'simulatte.lucyd.propertiesRail.v1', defaultExpanded: false, defaultWidth: 340, usableWhenCollapsed: false,
      vars: {footprint: '--lucyd-properties-rail-width', width: '--lucyd-properties-width'}, flag: 'propertiesExpanded', otherFootprint: () => rails.left.requested()});
    const both = [rails.left, rails.right];
    const syncAll = () => { for (const rail of both) rail.sync(); };

    // Phone overlays are exclusive and dismissible; desktop rails stay until their toggle collapses them.
    function collapseOverlays({focus = false} = {}) {
      if (!compact.matches) return false;
      const open = both.filter(rail => rail.expanded);
      for (const rail of open) rail.setExpanded(false);
      if (focus && open.length) open.at(-1).toggle.focus({preventScroll: true});
      return open.length > 0;
    }
    function close({focus = false} = {}) { const collapsed = collapseOverlays({focus}); menu.open = false; updateInsets(); return collapsed; }
    for (const rail of both) {
      const other = rail === rails.left ? rails.right : rails.left;
      on(rail.toggle, 'click', () => {
        const open = !rail.expanded;
        if (open && compact.matches) other.setExpanded(false);
        menu.open = false; rail.setExpanded(open);
        if (open && !rail.panel.inert && rail === rails.right) rail.panel.querySelector('input,button,select')?.focus({preventScroll: true});
      });
      on(rail.panel.querySelector('[data-close-drawer]'), 'click', () => { rail.setExpanded(false); rail.toggle.focus({preventScroll: true}); });
    }

    // On phones a chosen component should land in view, so picking one collapses the component overlay.
    on(rails.left.panel, 'click', event => {if (compact.matches && event.target.closest?.('.palette-item')) rails.left.setExpanded(false);});
    on(menu, 'click', event => {if (event.target.closest('#document-actions button,#edit-actions button,#view-actions button')) menu.open = false;});
    on(doc.getElementById('preset'), 'change', () => {menu.open = false;});
    on(menu, 'toggle', () => {if (menu.open) collapseOverlays();});
    on(doc.getElementById('diagram'), 'pointerdown', event => {
      if (!event.target.closest('.sd-node,.sd-group,.sd-edge,.sd-note,.sd-port')) collapseOverlays();
    }, {capture: true});
    on(doc, 'keydown', event => {
      if (event.key !== 'Escape' || doc.querySelector('dialog[open]')) return;
      if (collapseOverlays({focus: true})) {event.preventDefault(); event.stopPropagation();}
      if (menu.open) {menu.open = false; menu.querySelector('summary').focus({preventScroll: true}); event.preventDefault(); event.stopPropagation();}
      const json = doc.getElementById('document-panel');
      if (json.open) {json.open = false; json.querySelector('summary').focus({preventScroll: true});}
    }, {capture: true});
    // Rails take layout space beside the canvas, and phone overlays never shrink it, so side insets stay fixed.
    function updateInsets() {
      const rect = doc.getElementById('diagram').getBoundingClientRect();
      const task = doc.querySelector('.lucyd-task-bar')?.getBoundingClientRect();
      const step = doc.querySelector('.interview-stepper:not([hidden])')?.getBoundingClientRect();
      const playback = doc.querySelector('.sd-run-dock')?.getBoundingClientRect();
      canvas.setInsets({top: Math.max(12, (task?.bottom || rect.top) - rect.top + 12), bottom: Math.max(step ? rect.bottom - step.top + 12 : 24, playback ? rect.bottom - playback.top + 12 : 24), left: 12, right: 12});
    }
    const seen = new WeakSet(), resize = new win.ResizeObserver(updateInsets);
    function observe() {
      for (const el of [doc.querySelector('.app-header'), rails.left.panel, rails.right.panel, doc.querySelector('.lucyd-task-bar'), doc.querySelector('.interview-stepper'), doc.querySelector('.sd-run-dock')].filter(Boolean)) {
        if (!seen.has(el)) {seen.add(el); resize.observe(el);}
      }
      updateInsets();
    }
    const mutation = new win.MutationObserver(observe);
    mutation.observe(doc.querySelector('.canvas-panel'), {childList: true});
    on(compact, 'change', () => {if (compact.matches && rails.left.expanded && rails.right.expanded) rails.right.setExpanded(false); syncAll(); updateInsets();});
    on(win, 'resize', () => {syncAll(); updateInsets();});
    if (compact.matches && rails.left.expanded && rails.right.expanded) rails.right.setExpanded(false);
    syncAll(); menu.open = false; observe();
    const railFor = side => rails[side === 'right' ? 'right' : 'left'];
    return Object.freeze({close, updateInsets,
      setExpanded(value) { rails.left.setExpanded(value); },
      setRailExpanded(side, value) { railFor(side).setExpanded(value); },
      getRailState: (side = 'left') => railFor(side).state(),
      dispose() { events.abort(); resize.disconnect(); mutation.disconnect(); for (const rail of both) rail.dispose(); }});
  }
  root.SimulatteSystemDiagramShell = Object.freeze({create});
})(globalThis);
