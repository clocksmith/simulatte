(function (root) {
  'use strict';
  function create({canvas, document: doc = document}) {
    const win = doc.defaultView, events = new AbortController();
    const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, {...options, signal: events.signal});
    const panels = ['palette', 'properties'].map(name => ({name, panel: doc.querySelector(`.${name}-panel`), toggle: doc.getElementById(`${name}-toggle`)}));
    const menus = ['document-menu', 'edit-menu'].map(id => doc.getElementById(id));
    const narrow = win.matchMedia('(max-width:900px)');
    const menuLayout = () => {for (const menu of menus) menu.open = !narrow.matches;};
    on(narrow, 'change', menuLayout); menuLayout();
    function close({focus = false} = {}) {
      const active = panels.find(p => p.toggle.getAttribute('aria-expanded') === 'true');
      for (const p of panels) {p.panel.inert = true; p.panel.dataset.open = 'false'; p.toggle.setAttribute('aria-expanded', 'false');}
      if (narrow.matches) for (const menu of menus) menu.open = false;
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
    on(doc.getElementById('document-actions'), 'click', e => {if (narrow.matches && e.target.closest('button')) menus[0].open = false;});
    on(doc.getElementById('diagram'), 'pointerdown', e => {
      if (!e.target.closest('.sd-node,.sd-group,.sd-edge,.sd-note,.sd-port')) close();
    }, {capture: true});
    on(doc, 'keydown', e => {
      if (e.key !== 'Escape' || doc.querySelector('dialog[open]')) return;
      if (panels.some(p => p.toggle.getAttribute('aria-expanded') === 'true')) {close({focus: true}); e.preventDefault(); e.stopPropagation();}
      if (narrow.matches) for (const menu of menus) if (menu.open) {menu.open = false; menu.querySelector('summary').focus({preventScroll:true});}
      const json = doc.getElementById('document-panel');
      if (json.open) {json.open = false; json.querySelector('summary').focus({preventScroll: true});}
    }, {capture: true});
    function updateInsets() {
      doc.documentElement.style.setProperty('--editor-header-bottom', `${doc.querySelector('.app-header').getBoundingClientRect().bottom + 8}px`);
      const top = Math.max(...['.app-header', '.workspace-toolbar'].map(selector => doc.querySelector(selector).getBoundingClientRect().bottom)) + 12;
      canvas.setInsets({top, bottom: 76, left: 24, right: 24});
    }
    const resize = new win.ResizeObserver(updateInsets);
    resize.observe(doc.querySelector('.app-header')); resize.observe(doc.querySelector('.workspace-toolbar'));
    close(); updateInsets();
    return Object.freeze({close, updateInsets, dispose() {events.abort(); resize.disconnect();}});
  }
  root.SimulatteSystemDiagramShell = Object.freeze({create});
})(globalThis);
