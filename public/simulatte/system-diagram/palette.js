(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument, node ? require('./glyphs.js') : root.SimulatteSystemDiagramGlyphs);
  if (node) module.exports = api; else root.SimulatteSystemDiagramPalette = api;
})(globalThis, function (D, Glyphs) {
  'use strict';
  const DRAG_THRESHOLD = Object.freeze({ mouse: 4, pen: 6, touch: 8 });
  const GROUP_SIZE_STEPS = Object.freeze({ w: 44, h: 28 });
  const NOTE_WIDTH = 200;
  const STACK_STEPS = 3;
  const MAX_STACK = 40;
  let instances = 0;
  const TOOLS = Object.freeze([
    { tool: 'zone', glyph: 'cube', label: 'Zone', description: 'Failure domain such as an availability zone' },
    { tool: 'region', glyph: 'globe', label: 'Region', description: 'Failure domain spanning zones' },
    { tool: 'boundary', glyph: 'bulkhead', label: 'Boundary', description: 'Visual grouping only' },
    { tool: 'note', glyph: 'text', label: 'Note', description: 'Free text on the canvas' },
  ]);

  function matchesClass(klass, query, categoryLabel = '') {
    const haystack = `${klass.label} ${klass.description || ''} ${klass.id} ${klass.category || ''} ${categoryLabel}`.toLowerCase();
    return String(query).trim().toLowerCase().split(/\s+/).filter(Boolean).every(term => haystack.includes(term));
  }

  function create({ host, library, model, canvas, config, onDragStart, onAdd, sheet = 'auto' }) {
    const doc = host.ownerDocument, win = doc.defaultView, UI = globalThis.SimulatteWorldUI;
    const E = config.editor, GRID = E.grid, uid = ++instances;
    const events = new AbortController(), on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { signal: events.signal, ...opts });
    const make = (tag, className, text) => { const el = doc.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
    const button = (label, variant, ariaLabel) => {
      const el = make('button');
      if (UI) UI.SimButton({ element: el, variant, ...(ariaLabel ? { ariaLabel } : {}) }); else el.type = 'button';
      if (label != null) el.textContent = label;
      return el;
    };

    const root = make('section', 'sd-palette');
    root.setAttribute('aria-label', 'Add to diagram');
    root.dataset.sheet = sheet === false ? 'off' : 'auto';
    root.dataset.collapsed = 'false';
    const head = make('div', 'sd-palette-head');
    const toggleWrap = make('span', 'sd-palette-toggle');
    const toggle = button('Add', 'quiet');
    toggle.setAttribute('aria-expanded', 'true');
    toggleWrap.append(toggle);
    const search = make('input');
    search.type = 'search'; search.placeholder = 'Search classes'; search.setAttribute('aria-label', 'Search node classes'); search.autocomplete = 'off';
    if (UI) UI.SimField({ element: search });
    const searchWrap = make('span', 'sd-palette-search');
    searchWrap.append(search);
    head.append(toggleWrap, searchWrap);
    const body = make('div', 'sd-palette-body');
    const tools = make('div', 'sd-palette-tools');
    tools.setAttribute('role', 'group'); tools.setAttribute('aria-label', 'Add group or note');
    const list = make('div', 'sd-palette-list');
    const empty = make('p', 'sd-palette-empty', 'No classes match');
    empty.hidden = true;
    body.append(tools, list, empty);
    root.append(head, body);
    host.append(root);

    // ---- items ----------------------------------------------------------------------------
    function itemContent(el, glyph, label, description) {
      const glyphWrap = make('span', 'sd-palette-glyph');
      glyphWrap.append(Glyphs.create(doc, glyph, 18));
      const text = make('span', 'sd-palette-text');
      text.append(make('span', 'sd-palette-label', label));
      if (description) { const desc = make('span', 'sd-palette-desc', description); desc.title = description; text.append(desc); }
      el.replaceChildren(glyphWrap, text);
      el.setAttribute('aria-label', `Add ${label}`);
      if (description) el.setAttribute('aria-description', description);
    }
    function classItem(klass) {
      const el = button(null, 'quiet');
      itemContent(el, klass.glyph, klass.label, klass.description || '');
      el.dataset.classId = klass.id;
      el.dataset.search = `${klass.label} ${klass.description || ''} ${klass.id} ${klass.categoryLabel || ''}`.toLowerCase();
      bindItem(el, { kind: 'class', classId: klass.id, label: klass.label, glyph: klass.glyph });
      const row = make('div', 'sd-palette-row'); row.setAttribute('role', 'listitem'); row.append(el);
      return row;
    }
    function section(id, label, rows) {
      const el = make('section', 'sd-palette-section');
      el.dataset.section = id;
      const heading = make('h3', 'sd-palette-heading', label);
      heading.id = `sd-palette-${uid}-${id}`;
      const items = make('div', 'sd-palette-items');
      items.setAttribute('role', 'list'); items.setAttribute('aria-labelledby', heading.id);
      items.append(...rows);
      el.append(heading, items);
      return el;
    }
    for (const t of TOOLS) {
      const el = button(null, 'secondary');
      itemContent(el, t.glyph, t.label, '');
      el.setAttribute('aria-label', `Add ${t.label.toLowerCase()}`);
      el.setAttribute('aria-description', t.description);
      el.title = t.description;
      el.dataset.tool = t.tool;
      bindItem(el, { kind: t.tool === 'note' ? 'note' : 'group', groupKind: t.tool, label: t.label, glyph: t.glyph });
      tools.append(el);
    }
    const categoryLabel = id => library.categories.find(c => c.id === id)?.label || id;
    let userSection = null, userKey = null;
    for (const category of library.categories) {
      const rows = library.classOrder.map(id => library.classes[id]).filter(k => k.category === category.id).map(k => classItem({ ...k, categoryLabel: category.label }));
      if (rows.length) list.append(section(category.id, category.label, rows));
    }
    function syncUserClasses() {
      const classes = model.diagram.classes, key = JSON.stringify(classes);
      if (key === userKey) return;
      userKey = key;
      userSection?.remove(); userSection = null;
      if (!classes.length) return;
      const rows = classes.map(k => { const r = D.resolveClass(k.id, model.diagram, library, config); return classItem({ id: k.id, label: k.label, description: r.description, glyph: r.glyph, categoryLabel: categoryLabel(r.category) }); });
      userSection = section('user', 'Diagram classes', rows);
      list.prepend(userSection);
      applyFilter();
    }
    function applyFilter() {
      const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const sectionEl of list.querySelectorAll('.sd-palette-section')) {
        let visible = 0;
        for (const row of sectionEl.querySelectorAll('.sd-palette-row')) {
          const haystack = row.firstChild.dataset.search, match = terms.every(t => haystack.includes(t));
          row.hidden = !match; if (match) visible++;
        }
        sectionEl.hidden = visible === 0; shown += visible;
      }
      empty.hidden = shown > 0;
    }
    on(search, 'input', applyFilter);
    on(search, 'keydown', e => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; applyFilter(); } });
    on(toggle, 'click', () => setCollapsed(root.dataset.collapsed !== 'true'));
    on(search, 'focus', () => setCollapsed(false));
    function setCollapsed(collapsed) {
      root.dataset.collapsed = String(Boolean(collapsed));
      toggle.setAttribute('aria-expanded', String(!collapsed));
    }
    const sheetActive = () => root.dataset.sheet === 'auto' && win.matchMedia?.('(max-width: 700px)').matches;

    // ---- adding ---------------------------------------------------------------------------
    function freeSpot(x, y) {
      const taken = new Set(model.diagram.nodes.map(n => `${n.x},${n.y}`));
      for (let i = 0; i < MAX_STACK && taken.has(`${x},${y}`); i++) { x += GRID * STACK_STEPS; y += GRID * STACK_STEPS; }
      return { x, y };
    }
    function add(spec, center, fromDrop) {
      const snap = canvas.snap;
      let result;
      if (spec.kind === 'class') {
        const spot = freeSpot(snap(center.x - E.nodeWidth / 2), snap(center.y - E.nodeHeight / 2));
        const groupId = canvas.groupAt({ x: spot.x + E.nodeWidth / 2, y: spot.y + E.nodeHeight / 2 });
        result = model.apply({ type: 'addNode', classId: spec.classId, x: spot.x, y: spot.y, ...(groupId ? { groupId } : {}) });
      } else if (spec.kind === 'group') {
        const w = GRID * GROUP_SIZE_STEPS.w, h = GRID * GROUP_SIZE_STEPS.h;
        result = model.apply({ type: 'addGroup', kind: spec.groupKind, x: snap(center.x - w / 2), y: snap(center.y - h / 2), w, h });
      } else {
        result = model.apply({ type: 'addNote', text: 'Note', x: snap(center.x - NOTE_WIDTH / 2), y: snap(center.y - GRID * 3), w: NOTE_WIDTH });
      }
      if (!result.ok) canvas.showHint?.(result.error, 'error');
      else {
        if (fromDrop) (canvas.nodeElement(result.id) || canvas.host).focus({ preventScroll: true });
        if (sheetActive()) setCollapsed(true);
        onAdd?.(result, spec);
      }
      return result;
    }

    // Pointer events (not HTML5 drag and drop) so the same path works with touch.
    let drag = null, suppressClick = null;
    function overCanvas(x, y) {
      const r = canvas.host.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      const hit = doc.elementFromPoint(x, y);
      return Boolean(hit && canvas.host.contains(hit));
    }
    function bindItem(el, spec) {
      on(el, 'click', () => {
        if (suppressClick === el) { suppressClick = null; return; }
        add(spec, canvas.viewportCenter(), false);
      });
      on(el, 'pointerdown', e => {
        if (e.button !== 0) return;
        drag = { el, spec, pointerId: e.pointerId, pointerType: e.pointerType, start: { x: e.clientX, y: e.clientY }, ghost: null };
      });
    }
    function startDrag(d) {
      const ghost = make('div', 'sd-palette-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.append(Glyphs.create(doc, d.spec.glyph, 18), make('span', '', d.spec.label));
      doc.body.append(ghost);
      d.ghost = ghost;
      root.dataset.dragging = 'true';
      onDragStart?.(d.spec);
      if (sheetActive()) setCollapsed(true);
    }
    function moveGhost(d, x, y) {
      d.ghost.style.transform = `translate(${x}px, ${y}px)`;
      d.ghost.dataset.over = String(overCanvas(x, y));
    }
    function endDrag(e, cancelled) {
      const d = drag;
      drag = null;
      if (!d?.ghost) return;
      d.ghost.remove();
      delete root.dataset.dragging;
      suppressClick = d.el;
      win.setTimeout(() => { if (suppressClick === d.el) suppressClick = null; }, 0);
      if (!cancelled && overCanvas(e.clientX, e.clientY)) add(d.spec, canvas.screenToWorld({ x: e.clientX, y: e.clientY }), true);
    }
    on(win, 'pointermove', e => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < (DRAG_THRESHOLD[drag.pointerType] || DRAG_THRESHOLD.mouse)) return;
        startDrag(drag);
      }
      e.preventDefault();
      moveGhost(drag, e.clientX, e.clientY);
    }, { passive: false });
    on(win, 'pointerup', e => { if (drag && drag.pointerId === e.pointerId) endDrag(e, false); });
    on(win, 'pointercancel', e => { if (drag && drag.pointerId === e.pointerId) endDrag(e, true); });
    on(win, 'keydown', e => { if (e.key === 'Escape' && drag?.ghost) endDrag(e, true); });

    const unsubscribe = model.subscribe(event => { if (['classes', 'structure', 'load'].includes(event.kind)) syncUserClasses(); });
    syncUserClasses();
    applyFilter();
    if (sheetActive()) setCollapsed(true);

    return {
      element: root,
      search: text => { search.value = text; applyFilter(); },
      setCollapsed,
      refresh: () => { userKey = null; syncUserClasses(); },
      dispose() { events.abort(); unsubscribe(); drag?.ghost?.remove(); root.remove(); },
    };
  }

  function railClasses(doc, library, config) {
    const singles = [...library.classOrder, ...doc.classes.map(c => c.id)].map(id => D.resolveClass(id, doc, library, config));
    const subsystems = (doc.subsystems || []).map(def => ({
      ...D.resolveClass(`subsystem.${def.id}@${def.version}`, doc, library, config),
      version: def.version, componentCount: def.nodes.length,
    }));
    return [...singles, ...subsystems];
  }

  function createRail({ host, library, model, canvas, config, ui, el, field, message, onInspect, onManage }) {
    const document = host.ownerDocument, $ = id => document.getElementById(id);
    const expanded = new Map();
    const paletteCategory = field(host, 'Category', '', {
      id: 'palette-category', choices: [{ id: '', label: 'All categories' }, ...library.categories]
    });
    $('capability-count').before(paletteCategory.parentElement);

    let paletteKey = '';
    function render() {
      const search = $('palette-search').value, category = paletteCategory.value, doc = model.diagram;
      const key = JSON.stringify([search, category, doc.classes, doc.subsystems]);
      if (key === paletteKey) return;
      paletteKey = key;

      const available = railClasses(doc, library, config);
      const labels = new Map(library.categories.map(c => [c.id, c.label]));
      const visible = available.filter(c => (c.kernel === 'subsystem' || !category || c.category === category) && matchesClass(c, search, labels.get(c.category)));

      const composite = available.filter(c => c.kernel === 'subsystem');
      $('capability-count').textContent = `${available.length - composite.length} single nodes · ${composite.length} expandable subsystems`;
      $('palette').replaceChildren();
      const groups = [{id: 'subsystems', label: 'Expandable subsystems'}, ...library.categories];
      const primitives = el('h3', 'palette-kind-title', 'Single nodes');
      for (const cat of groups) {
        const isSubsystem = cat.id === 'subsystems';
        const classes = visible.filter(c => isSubsystem ? c.kernel === 'subsystem' : c.kernel !== 'subsystem' && c.category === cat.id);
        if (!isSubsystem && !classes.length) continue;
        if (!isSubsystem && !primitives.isConnected) $('palette').append(primitives);
        const group = el('details', 'palette-group');
        group.dataset.category = cat.id;
        group.open = search.trim() ? true : expanded.get(cat.id) !== false;
        group.addEventListener('toggle', () => { if (!search.trim() && group.isConnected) expanded.set(cat.id, group.open); });
        group.append(el('summary', 'palette-category-title', `${cat.label} (${classes.length})`));
        const section = el('div', 'palette-category');
        group.append(section); $('palette').append(group);
        if (isSubsystem) {
          const manage = ui.SimButton({label: 'Create / import', variant: 'quiet', onAction: onManage}).element;
          manage.classList.add('palette-manage'); section.append(manage);
        }
        if (isSubsystem && !classes.length) section.append(el('p', 'palette-empty', composite.length ? 'No matching subsystems.' : 'Save connected nodes as a subsystem, or import a subsystem library.'));


        for (const c of classes) {
          let start = null, ghost = null, moved = false, suppressClick = false;
          const id = c.id;
          const b = ui.SimButton({
            label: c.label, variant: 'quiet',
            onAction: () => {
              if (suppressClick) { suppressClick = false; return; }
              const r = $('diagram').getBoundingClientRect();
              canvas.dropClassAt(id, r.left + r.width / 2, r.top + r.height / 2);
            },
            ariaLabel: `Add ${c.label}`
          }).element;

          b.classList.add('palette-item');
          b.dataset.classId = id;
          b.dataset.type = c.kernel;
          b.setAttribute('aria-description', c.description || '');
          b.title = c.kernel === 'subsystem' ? `${c.label}: expandable subsystem` : c.description || c.label;

          const text = el('span', 'palette-copy');
          text.append(el('span', 'palette-label', c.label), el('span', 'palette-item-kind', c.kernel === 'subsystem' ? `${c.componentCount} components · expandable · v${c.version}` : 'Single node'));
          const icon = el('span', 'component-icon');
          icon.append(Glyphs.create(document, c.glyph, 18));
          b.replaceChildren(icon, text);

          b.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            start = { x: e.clientX, y: e.clientY };
            moved = false;
            b.setPointerCapture(e.pointerId);
          });

          b.addEventListener('pointermove', e => {
            if (!start) return;
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) moved = true;
            if (!moved) return;
            if (!ghost) {
              ghost = el('div', 'drop-preview', c.label);
              document.body.append(ghost);
            }
            ghost.style.left = `${e.clientX + 12}px`;
            ghost.style.top = `${e.clientY - 16}px`;
          });

          b.addEventListener('pointerup', e => {
            if (!start) return;
            const r = $('diagram').getBoundingClientRect();
            if (moved) {
              suppressClick = true;
              if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                canvas.dropClassAt(id, e.clientX, e.clientY);
              } else {
                message('Drop inside the canvas.');
              }
              setTimeout(() => { suppressClick = false; }, 0);
            }
            start = null;
            ghost?.remove();
            ghost = null;
          });

          b.addEventListener('pointercancel', () => { start = null; ghost?.remove(); ghost = null; });
          const row = el('div', 'palette-entry'); row.append(b);
          if (c.kernel === 'subsystem') {
            const inspect = ui.SimButton({ label: 'Inspect', variant: 'quiet', ariaLabel: `Inspect ${c.label} subsystem`, onAction: () => onInspect(c.id) }).element;
            inspect.classList.add('palette-inspect'); row.append(inspect);
          }
          section.append(row);
        }
        ui.adoptTree(group);
      }
    }

    $('palette-search').addEventListener('input', render);
    $('palette-search').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); $('palette-search').value = ''; render(); } });
    paletteCategory.addEventListener('change', render);


    return { render };
  }

  return Object.freeze({ create, matchesClass, createRail, railClasses });
});
