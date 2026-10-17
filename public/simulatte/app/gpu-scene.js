(function attachGpuScene(root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteGpuScene = api;
})(globalThis, function gpuScene(root) {
  'use strict';

  // Coordinates are CSS pixels relative to the scene. No placement may obscure
  // the selected rack; a narrow or offscreen scene uses the adjacent document dock.
  function placeInspector(scene, rack, panel, gap = 16) {
    if (!rack || scene.width < 700 || panel.height > scene.height - gap * 2
        || rack.right < 0 || rack.left > scene.width || rack.bottom < 0 || rack.top > scene.height) return null;
    const clamp = (v, max) => Math.max(gap, Math.min(v, max - gap));
    const x = clamp((rack.left + rack.right - panel.width) / 2, scene.width - panel.width);
    const y = clamp((rack.top + rack.bottom - panel.height) / 2, scene.height - panel.height);
    const candidates = [
      { x: rack.right + gap, y }, { x: rack.left - panel.width - gap, y },
      { x, y: rack.bottom + gap }, { x, y: rack.top - panel.height - gap },
    ];
    return candidates.find(p => p.x >= gap && p.y >= gap
      && p.x + panel.width <= scene.width - gap && p.y + panel.height <= scene.height - gap
      && (p.x >= rack.right + gap || p.x + panel.width <= rack.left - gap
        || p.y >= rack.bottom + gap || p.y + panel.height <= rack.top - gap)) || null;
  }

  function mount() {
    const doc = root.document, q = s => doc.querySelector(s);
    const host = q('.simulation-stage'), stage = q('.canvas-shell'), drawer = q('#decisions-drawer');
    const canvas = q('#overlay-canvas'), menu = q('#decisions-button');
    doc.body.dataset.experienceUi = 'gpu-scene';
    doc.body.classList.add('sim-app');
    const node = (tag, className, text) => {
      const el = doc.createElement(tag); if (className) el.className = className;
      if (text) el.textContent = text; return el;
    };
    const button = (text, action) => {
      const el = node('button', 'sim-action', text); el.type = 'button';
      el.addEventListener('click', action); return el;
    };
    const disclosure = (title, children) => {
      const el = node('details', 'gpu-scene__section');
      el.append(node('summary', '', title), ...children); return el;
    };
    const error = node('p', 'gpu-scene__error'); error.setAttribute('role', 'status');
    async function command(id, value) {
      try {
        if (!root.SimulatteActiveSession) throw Error('Simulation controls are not ready.');
        const result = await root.SimulatteActiveSession.invoke(id, value); error.textContent = ''; return result;
      } catch (reason) { error.textContent = reason.message; }
    }
    const header = node('header', 'gpu-scene__header');
    const home = node('a', 'gpu-scene__home', 'Simulations'); home.href = '/';
    const heading = node('h1', '', 'GPU Cluster');
    const playback = node('div', 'gpu-scene__playback');
    playback.append(q('#start-button'), q('#pause-button'), q('#resume-button'));
    for (const control of playback.children) control.classList.remove('sim-action-primary');
    menu.textContent = 'Menu'; menu.setAttribute('aria-label', 'Menu: simulation controls');
    header.append(home, heading, playback, menu);
    const intro = node('div', 'gpu-scene__intro');
    const status = node('span', 'gpu-scene__status', 'Preparing'); status.setAttribute('role', 'status');
    intro.append(node('p', '', 'One training job. Every rack depends on the others.'), status);
    const hint = node('p', 'gpu-scene__hint', 'Select a rack to slow it down and see who waits.');
    const dock = node('div', 'gpu-scene__dock');
    const readouts = q('#experience-readouts');
    const storage = node('div'); storage.hidden = true;
    const oldChildren = [...host.children];
    host.classList.add('gpu-scene'); stage.classList.add('gpu-scene__stage');
    host.replaceChildren(header, intro, stage, hint, dock, readouts, error, storage);
    for (const child of oldChildren) if (!host.contains(child)) storage.append(child);

    drawer.classList.add('gpu-scene__drawer');
    q('#decisions-close').setAttribute('aria-label', 'Close menu');
    const restart = button('Restart', () => command('restart'));
    const replay = button('Replay', () => command('replay'));
    restart.dataset.sceneCommand = 'restart'; replay.dataset.sceneCommand = 'replay';
    const actions = node('div', 'gpu-scene__actions'); actions.append(restart, replay);
    const speed = q('#playback-speed-control');
    const appearance = button('Appearance', () => {
      root.SimulatteTheme?.cyclePreference(); root.dispatchEvent(new Event('experience-appearance'));
    });
    const camera = q('#camera-menu');
    camera.classList.add('gpu-scene__camera');
    const rackLabel = node('label', 'gpu-scene__rack-label', 'Inspect a rack');
    const rackHelp = node('p', 'gpu-scene__note', 'Choose here or select a rack in the scene. Inspection does not pause the job.');
    const secondary = node('section', 'gpu-scene__secondary');
    secondary.setAttribute('aria-label', 'Simulation controls');
    secondary.append(actions, speed, rackLabel, rackHelp, camera, appearance);
    drawer.querySelector('header').after(secondary);
    const context = q('#experience-readouts-context');
    const measurements = q('#show-measurements').closest('label');
    drawer.append(disclosure('Measurements and legend', [context, measurements]));
    const configuration = q('#plugin-inspector');
    const configurationSection = disclosure('Configuration and evidence', [configuration]);
    q('#scene-actions').before(configurationSection);
    const runtime = q('#runtime-details');
    runtime.hidden = false; q('#runtime-details-close').hidden = true;
    drawer.append(disclosure('Runtime details', [runtime]));
    storage.append(q('#runtime-toggle'));

    let inspector, selector, opened = false, lastSelected = '', disposed = false, interacted = false;
    stage.addEventListener('pointerdown', () => { interacted = true; }, { once: true });
    function adoptInspector() {
      const next = host.querySelector('.sim-object-inspector');
      if (!next || next === inspector) return;
      inspector = next; inspector.tabIndex = -1;
      selector = inspector.querySelector('select'); selector.setAttribute('aria-label', 'Inspect a rack');
      rackLabel.append(selector);
      secondary.append(inspector.querySelector('[aria-pressed]'));
      selector.addEventListener('change', () => {
        q('#decisions-close').click();
        requestAnimationFrame(() => {
          (inspector.querySelector('[data-object-action="straggler"]') || inspector).focus({ preventScroll: true });
          if (inspector.dataset.placement === 'dock') inspector.scrollIntoView({ block: 'nearest' });
        });
      });
      const body = inspector.lastElementChild;
      const paragraphs = body.querySelectorAll(':scope > p');
      const detail = disclosure('Why it matters', [paragraphs[2], ...body.querySelectorAll(':scope > details')]);
      body.append(detail);
      inspector.querySelector('[aria-label="Close inspector"]').addEventListener('click', () => canvas.focus({ preventScroll: true }));
      dock.append(inspector);
    }
    function positionInspector() {
      if (!inspector) return;
      const selected = selector.value;
      inspector.hidden = !selected;
      if (!selected) { lastSelected = ''; return; }
      if (selected !== lastSelected) {
        inspector.querySelector('.gpu-scene__section').open = false;
        lastSelected = selected;
      }
      const target = canvas.__simulatteObjectTargets?.().find(item => item.id === selected);
      const points = target?.bounds?.length ? target.bounds : target?.points;
      const rack = points?.length ? {
        left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)),
      } : null;
      const rect = stage.getBoundingClientRect();
      const panel = inspector.getBoundingClientRect();
      const placement = placeInspector(rect, rack, { width: Math.min(300, rect.width - 24), height: panel.height });
      const parent = placement ? stage : dock;
      if (inspector.parentElement !== parent) {
        const active = inspector.contains(doc.activeElement) ? doc.activeElement : null;
        parent.append(inspector); active?.focus({ preventScroll: true });
      }
      inspector.dataset.placement = placement ? 'anchor' : 'dock';
      inspector.style.left = placement ? `${placement.x}px` : '';
      inspector.style.top = placement ? `${placement.y}px` : '';
    }
    function refresh() {
      if (disposed) return;
      adoptInspector();
      const state = root.SimulatteActiveSession?.snapshot();
      if (!opened && inspector && state?.preparation === 'ready') {
        opened = true; if (!interacted) void command('select-object', null);
      }
      const text = state?.visibleStatus || 'Preparing';
      if (status.textContent !== text) status.textContent = text;
      for (const [el, id] of [[restart, 'restart'], [replay, 'replay']]) {
        el.disabled = !state?.operations.some(op => op.id === id && op.available);
      }
      positionInspector();
    }
    // Projection follows camera movement even when execution is paused.
    let animation;
    function frame() { positionInspector(); if (!disposed) animation = requestAnimationFrame(frame); }
    const timer = setInterval(refresh, 200); refresh(); animation = requestAnimationFrame(frame);
    root.addEventListener('pagehide', () => { disposed = true; clearInterval(timer); cancelAnimationFrame(animation); }, { once: true });
    root.__simulatteGpuScene = { stage, header, drawer };
  }
  return { mount, placeInspector };
});
