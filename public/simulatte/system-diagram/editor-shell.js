(function (root) {
  'use strict';
  function create({canvas, document: doc = document}) {
    const win = doc.defaultView, events = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, {...options, signal: events.signal});
    const panels = ['palette', 'properties'].map(name => ({name, panel: doc.querySelector(`.${name}-panel`), toggle: doc.getElementById(`${name}-toggle`)}));
    const menu = doc.getElementById('workspace-menu');
    function close({focus = false} = {}) {
      const active = panels.find(p => p.toggle.getAttribute('aria-expanded') === 'true');
      for (const p of panels) {p.panel.inert = true; p.panel.dataset.open = 'false'; p.toggle.setAttribute('aria-expanded', 'false');}
      menu.open = false;
      if (focus) active?.toggle.focus({preventScroll: true});
    }
    for (const p of panels) {
      on(p.toggle, 'click', () => {
        const open = p.toggle.getAttribute('aria-expanded') !== 'true';
        close();
        if (open) {p.panel.inert = false; p.panel.dataset.open = 'true'; p.toggle.setAttribute('aria-expanded', 'true'); p.panel.querySelector('input,button,select')?.focus({preventScroll: true});}
      });
      on(p.panel.querySelector('[data-close-drawer]'), 'click', () => close({focus: true}));
    }
    on(doc.getElementById('palette'), 'click', e => {if (e.target.closest('.palette-item')) close();});
    on(menu, 'click', e => {if (e.target.closest('#document-actions button,#edit-actions button,#view-actions button')) menu.open = false;});
    on(doc.getElementById('preset'), 'change', () => {menu.open = false;});
    on(menu, 'toggle', () => {if (menu.open) for (const p of panels) {p.panel.inert = true; p.panel.dataset.open = 'false'; p.toggle.setAttribute('aria-expanded', 'false');}});
    on(doc.getElementById('diagram'), 'pointerdown', e => {
      if (!e.target.closest('.sd-node,.sd-group,.sd-edge,.sd-note,.sd-port')) close();
    }, {capture: true});
    on(doc, 'keydown', e => {
      if (e.key !== 'Escape' || doc.querySelector('dialog[open]')) return;
      if (panels.some(p => p.toggle.getAttribute('aria-expanded') === 'true')) {close({focus: true}); e.preventDefault(); e.stopPropagation();}
      if (menu.open) {menu.open = false; menu.querySelector('summary').focus({preventScroll:true}); e.preventDefault(); e.stopPropagation();}
      const json = doc.getElementById('document-panel');
      if (json.open) {json.open = false; json.querySelector('summary').focus({preventScroll: true});}
    }, {capture: true});
    function updateInsets() {
      const top = doc.querySelector('.app-header').getBoundingClientRect().bottom + 12;
      canvas.setInsets({top, bottom: 40, left: 24, right: 24});
    }
    const resize = new win.ResizeObserver(updateInsets);
    resize.observe(doc.querySelector('.app-header'));
    close(); updateInsets();
    return Object.freeze({close, updateInsets, dispose() {events.abort(); resize.disconnect();}});
  }
  root.SimulatteSystemDiagramShell = Object.freeze({create});
})(globalThis);
