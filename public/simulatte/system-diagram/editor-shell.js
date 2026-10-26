(function (root) {
  'use strict';
  function create({canvas, document: doc = document}) {
    const win = doc.defaultView, events = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, {...options, signal: events.signal});
    const palette = {panel: doc.querySelector('.palette-panel'), toggle: doc.getElementById('palette-toggle')};
    const properties = {panel: doc.querySelector('.properties-panel'), toggle: doc.getElementById('properties-toggle')};
    const menu = doc.getElementById('workspace-menu'), compact = win.matchMedia('(max-width: 700px)');
    let expanded = false;
    function syncPalette() {
      palette.panel.inert = false; palette.panel.dataset.open = 'true';
      doc.body.dataset.paletteExpanded = String(compact.matches && expanded);
      palette.toggle.setAttribute('aria-expanded', String(!compact.matches || expanded));
      palette.toggle.setAttribute('aria-label', expanded ? 'Collapse component library' : 'Expand component library');
    }
    function close({focus = false} = {}) {
      const active = properties.toggle.getAttribute('aria-expanded') === 'true';
      properties.panel.inert = true; properties.panel.dataset.open = 'false';
      properties.toggle.setAttribute('aria-expanded', 'false');
      expanded = false; syncPalette(); menu.open = false; updateInsets();
      if (focus && active) properties.toggle.focus({preventScroll: true});
    }
    on(palette.toggle, 'click', () => { const open = !expanded; close(); expanded = open; syncPalette(); updateInsets(); });
    on(palette.panel.querySelector('[data-close-drawer]'), 'click', () => { expanded = false; syncPalette(); updateInsets(); palette.toggle.focus({preventScroll: true}); });
    on(properties.toggle, 'click', () => {
      const open = properties.toggle.getAttribute('aria-expanded') !== 'true';
      close();
      if (open) {properties.panel.inert = false; properties.panel.dataset.open = 'true'; properties.toggle.setAttribute('aria-expanded', 'true'); properties.panel.querySelector('input,button,select')?.focus({preventScroll: true});}
      updateInsets();
    });
    on(properties.panel.querySelector('[data-close-drawer]'), 'click', () => close({focus: true}));
    on(doc.getElementById('palette'), 'click', event => {if (compact.matches && event.target.closest('.palette-item')) close();});
    on(menu, 'click', event => {if (event.target.closest('#document-actions button,#edit-actions button,#view-actions button')) menu.open = false;});
    on(doc.getElementById('preset'), 'change', () => {menu.open = false;});
    on(menu, 'toggle', () => {if (menu.open) {expanded = false; syncPalette(); properties.panel.inert = true; properties.panel.dataset.open = 'false'; properties.toggle.setAttribute('aria-expanded', 'false'); updateInsets();}});
    on(doc.getElementById('diagram'), 'pointerdown', event => {
      if (!event.target.closest('.sd-node,.sd-group,.sd-edge,.sd-note,.sd-port')) close();
    }, {capture: true});
    on(doc, 'keydown', event => {
      if (event.key !== 'Escape' || doc.querySelector('dialog[open]')) return;
      if (properties.toggle.getAttribute('aria-expanded') === 'true' || compact.matches && expanded) {close({focus: true}); event.preventDefault(); event.stopPropagation();}
      if (menu.open) {menu.open = false; menu.querySelector('summary').focus({preventScroll: true}); event.preventDefault(); event.stopPropagation();}
      const json = doc.getElementById('document-panel');
      if (json.open) {json.open = false; json.querySelector('summary').focus({preventScroll: true});}
    }, {capture: true});
    function updateInsets() {
      const rect = doc.getElementById('diagram').getBoundingClientRect();
      const task = doc.querySelector('.lucyd-task-bar')?.getBoundingClientRect();
      const step = doc.querySelector('.interview-stepper:not([hidden])')?.getBoundingClientRect();
      const right = properties.panel.dataset.open === 'true' ? properties.panel.getBoundingClientRect().width + 12 : 12;
      canvas.setInsets({top: Math.max(12, (task?.bottom || rect.top) - rect.top + 12), bottom: step ? rect.bottom - step.top + 12 : 24,
        left: Math.max(12, palette.panel.getBoundingClientRect().right - rect.left + 12), right});
    }
    const seen = new WeakSet(), resize = new win.ResizeObserver(updateInsets);
    function observe() {
      for (const el of [doc.querySelector('.app-header'), palette.panel, doc.querySelector('.lucyd-task-bar'), doc.querySelector('.interview-stepper')].filter(Boolean)) {
        if (!seen.has(el)) {seen.add(el); resize.observe(el);}
      }
      updateInsets();
    }
    const mutation = new win.MutationObserver(observe);
    mutation.observe(doc.querySelector('.canvas-panel'), {childList: true});
    on(compact, 'change', () => {expanded = false; syncPalette(); updateInsets();});
    on(win, 'resize', updateInsets);
    close(); observe();
    return Object.freeze({close, updateInsets, dispose() {events.abort(); resize.disconnect(); mutation.disconnect(); delete doc.body.dataset.paletteExpanded;}});
  }
  root.SimulatteSystemDiagramShell = Object.freeze({create});
})(globalThis);
