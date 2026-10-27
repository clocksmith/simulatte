(function (root) {
  'use strict';
  const MIN_INSET_CANVAS = 160;
  function create({canvas, document: doc = document}) {
    const win = doc.defaultView, events = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, {...options, signal: events.signal});
    const palette = {panel: doc.querySelector('.palette-panel'), toggle: doc.getElementById('palette-toggle')};
    const properties = {panel: doc.querySelector('.properties-panel'), toggle: doc.getElementById('properties-toggle')};
    const menu = doc.getElementById('workspace-menu'), compact = win.matchMedia('(max-width: 700px)');
    const layout = doc.querySelector('.editor-layout'), storageKey = 'simulatte.lucyd.componentRail.v1';
    let expanded = !compact.matches, width = 208;
    try { const saved=JSON.parse(win.localStorage.getItem(storageKey));if(saved){expanded=Boolean(saved.expanded);if(Number.isFinite(saved.width))width=saved.width;} } catch {}
    const dragger=doc.createElement('div');dragger.className='lucyd-rail-resizer';dragger.tabIndex=0;dragger.setAttribute('role','separator');dragger.setAttribute('aria-label','Resize component library');dragger.setAttribute('aria-orientation','vertical');layout.append(dragger);
    const maxWidth=()=>Math.min(280,Math.max(160,win.innerWidth-96));
    function save(){try{win.localStorage.setItem(storageKey,JSON.stringify({expanded,width}));}catch{}}
    function size(value){width=Math.max(160,Math.min(maxWidth(),value));syncPalette();updateInsets();save();}
    on(dragger,'pointerdown',event=>{if(!expanded)return;event.preventDefault();dragger.setPointerCapture(event.pointerId);size(event.clientX);});
    on(dragger,'pointermove',event=>{if(dragger.hasPointerCapture(event.pointerId))size(event.clientX);});
    on(dragger,'pointerup',event=>{if(dragger.hasPointerCapture(event.pointerId))dragger.releasePointerCapture(event.pointerId);});
    on(dragger,'keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();size(event.key==='Home'?160:event.key==='End'?280:width+(event.key==='ArrowRight'?10:-10));});
    function syncPalette() {
      palette.panel.inert = false; palette.panel.dataset.open = 'true';
      doc.body.dataset.paletteExpanded = String(expanded);
      const panelWidth=expanded?Math.max(160,Math.min(maxWidth(),width)):56;
      layout.style.setProperty('--lucyd-rail-width',`${compact.matches?56:panelWidth}px`);
      layout.style.setProperty('--lucyd-palette-width',`${panelWidth}px`);
      dragger.hidden=!expanded||compact.matches;dragger.setAttribute('aria-valuemin','160');dragger.setAttribute('aria-valuemax',String(maxWidth()));dragger.setAttribute('aria-valuenow',String(Math.min(maxWidth(),width)));
      palette.toggle.textContent=expanded?'‹':'›';
      palette.toggle.setAttribute('aria-expanded', String(expanded));
      palette.toggle.setAttribute('aria-label', expanded ? 'Collapse component library' : 'Expand component library');
    }
    // On phones an expanded rail beside an open drawer leaves no canvas, so dismissal also collapses the rail.
    function close({focus = false, collapseRail = false} = {}) {
      const active = properties.toggle.getAttribute('aria-expanded') === 'true';
      const collapsed = collapseRail && compact.matches && expanded;
      if (collapsed) {expanded = false; save();}
      properties.panel.inert = true; properties.panel.dataset.open = 'false';
      properties.toggle.setAttribute('aria-expanded', 'false');
      syncPalette(); menu.open = false; updateInsets();
      if (focus && active) properties.toggle.focus({preventScroll: true});
      else if (focus && collapsed) palette.toggle.focus({preventScroll: true});
    }
    on(palette.toggle, 'click', () => { const open = !expanded; close(); expanded = open; syncPalette(); updateInsets();save(); });
    on(palette.panel.querySelector('[data-close-drawer]'), 'click', () => { expanded = false; syncPalette(); updateInsets();save(); palette.toggle.focus({preventScroll: true}); });
    on(properties.toggle, 'click', () => {
      const open = properties.toggle.getAttribute('aria-expanded') !== 'true';
      close({collapseRail: open});
      if (open) {properties.panel.inert = false; properties.panel.dataset.open = 'true'; properties.toggle.setAttribute('aria-expanded', 'true'); properties.panel.querySelector('input,button,select')?.focus({preventScroll: true});}
      updateInsets();
    });
    on(properties.panel.querySelector('[data-close-drawer]'), 'click', () => close({focus: true}));

    on(menu, 'click', event => {if (event.target.closest('#document-actions button,#edit-actions button,#view-actions button')) menu.open = false;});
    on(doc.getElementById('preset'), 'change', () => {menu.open = false;});
    on(menu, 'toggle', () => {if (menu.open) {syncPalette(); properties.panel.inert = true; properties.panel.dataset.open = 'false'; properties.toggle.setAttribute('aria-expanded', 'false'); updateInsets();}});
    on(doc.getElementById('diagram'), 'pointerdown', event => {
      if (!event.target.closest('.sd-node,.sd-group,.sd-edge,.sd-note,.sd-port')) close({collapseRail: true});
    }, {capture: true});
    // Run menus and the task bar open beneath an expanded phone rail, so a workspace tap also collapses it.
    // Collapsing on click, not pointerdown, keeps the tapped control under the finger until it activates.
    on(doc.querySelector('.canvas-panel'), 'click', () => {
      if (compact.matches && expanded) {expanded = false; save(); syncPalette(); updateInsets();}
    }, {capture: true});
    on(doc, 'keydown', event => {
      if (event.key !== 'Escape' || doc.querySelector('dialog[open]')) return;
      if (properties.toggle.getAttribute('aria-expanded') === 'true' || compact.matches && expanded) {close({focus: true, collapseRail: true}); event.preventDefault(); event.stopPropagation();}
      if (menu.open) {menu.open = false; menu.querySelector('summary').focus({preventScroll: true}); event.preventDefault(); event.stopPropagation();}
      const json = doc.getElementById('document-panel');
      if (json.open) {json.open = false; json.querySelector('summary').focus({preventScroll: true});}
    }, {capture: true});
    function updateInsets() {
      const rect = doc.getElementById('diagram').getBoundingClientRect();
      const task = doc.querySelector('.lucyd-task-bar')?.getBoundingClientRect();
      const step = doc.querySelector('.interview-stepper:not([hidden])')?.getBoundingClientRect();
      const playback = doc.querySelector('.sd-run-dock')?.getBoundingClientRect();
      const left = compact.matches ? 12 : Math.max(12, palette.panel.getBoundingClientRect().right - rect.left + 12);
      const drawer = properties.panel.dataset.open === 'true' ? properties.panel.getBoundingClientRect().width + 12 : 12;
      // A drawer that would leave almost no canvas overlays it instead; otherwise Fit collapses the camera to a dot.
      const right = rect.width - left - drawer >= MIN_INSET_CANVAS ? drawer : 12;
      canvas.setInsets({top: Math.max(12, (task?.bottom || rect.top) - rect.top + 12), bottom: Math.max(step ? rect.bottom - step.top + 12 : 24, playback ? rect.bottom - playback.top + 12 : 24),
        left, right});
    }
    const seen = new WeakSet(), resize = new win.ResizeObserver(updateInsets);
    function observe() {
      for (const el of [doc.querySelector('.app-header'), palette.panel, properties.panel, doc.querySelector('.lucyd-task-bar'), doc.querySelector('.interview-stepper'), doc.querySelector('.sd-run-dock')].filter(Boolean)) {
        if (!seen.has(el)) {seen.add(el); resize.observe(el);}
      }
      updateInsets();
    }
    const mutation = new win.MutationObserver(observe);
    mutation.observe(doc.querySelector('.canvas-panel'), {childList: true});
    on(compact, 'change', () => {syncPalette(); updateInsets();});
    on(win, 'resize', () => {syncPalette();updateInsets();});
    close(); observe();
    return Object.freeze({close, updateInsets, setExpanded(value){expanded=Boolean(value);syncPalette();updateInsets();save();}, getRailState:()=>({expanded,width:expanded?Math.min(maxWidth(),width):56}), dispose() {events.abort(); resize.disconnect(); mutation.disconnect(); delete doc.body.dataset.paletteExpanded;dragger.remove();}});
  }
  root.SimulatteSystemDiagramShell = Object.freeze({create});
})(globalThis);
