(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramRunControls = api;
})(globalThis, function (root) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = Object.freeze({
    step: 'M5 4l8 6-8 6zM15 4h2v12h-2z',
    restart: 'M10 4a6 6 0 1 1-6 6h2a4 4 0 1 0 4-4v3L6 5l4-4z',
  });
  const FORM_CONTROLS = /^(INPUT|TEXTAREA|SELECT|OPTION)$/;

  const clockDigits = horizon => Math.max(1, Math.floor(Math.abs(Number(horizon) || 0))).toString().length;

  // Fixed width per horizon so the dock never reflows as time advances.
  function formatClock(time, horizon) {
    const h = Number.isFinite(horizon) ? horizon : 0;
    const t = Math.min(Math.max(Number.isFinite(time) ? time : 0, 0), h || Infinity);
    const width = clockDigits(h) + 2;
    const padded = t.toFixed(1).padStart(width, ' ');
    const total = Number.isInteger(h) ? String(h) : h.toFixed(1);
    return `${padded} / ${total} s`;
  }

  function formatSpeed(speed) {
    if (!Number.isFinite(speed)) return '';
    const text = speed >= 1 ? String(Number(speed.toFixed(2))) : String(Number(speed.toPrecision(2)));
    return `${text}×`;
  }

  function nearestSpeed(speeds, speed) {
    if (!speeds.length) throw Error('Run controls require config.playback.speeds');
    return speeds.reduce((best, s) => (Math.abs(Math.log(s / speed)) < Math.abs(Math.log(best / speed)) ? s : best), speeds[0]);
  }

  // Space toggles play only when focus is outside text entry and outside other controls,
  // so typing in the inspector and activating a focused button keep native behaviour.
  function shouldToggleOnKey(event) {
    if (event.key !== ' ' && event.code !== 'Space') return false;
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
    const target = event.target;
    if (!target || target.nodeType !== 1) return true;
    if (target.isContentEditable) return false;
    if (FORM_CONTROLS.test(target.tagName)) return false;
    if (target.closest?.('button, summary, a[href], [role="menuitem"], [role="menuitemradio"], [contenteditable="true"]')) return false;
    return true;
  }

  function icon(doc, path) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const p = doc.createElementNS(SVG_NS, 'path'); p.setAttribute('d', path); p.setAttribute('fill', 'currentColor');
    svg.append(p); return svg;
  }

  function create(options) {
    const { host, config } = options;
    const ui = root.SimulatteWorldUI;
    if (!ui) throw Error('Run controls require shared World UI');
    if (!host) throw Error('Run controls require a host element');
    const speeds = config?.playback?.speeds;
    if (!Array.isArray(speeds) || !speeds.length) throw Error('Run controls require config.playback.speeds');
    const doc = host.ownerDocument;
    const call = name => () => options[name]?.();
    let state = { running: false, time: 0, horizon: 0, speed: config.playback.defaultSpeed ?? speeds[0], done: false, busy: false };

    const play = ui.SimButton({ document: doc, label: options.idleLabel || 'Play', variant: 'primary', onAction: () => (state.done ? options.onReplay?.() : state.running ? options.onPause?.() : options.onPlay?.()) });
    play.element.classList.add('sd-run-play');
    play.element.dataset.runCommand = 'toggle';

    const stepEl = doc.createElement('button'); stepEl.append(icon(doc, ICONS.step));
    const step = ui.SimButton({ document: doc, element: stepEl, variant: 'icon', ariaLabel: 'Step one round', onAction: call('onStep') });
    stepEl.dataset.runCommand = 'step'; stepEl.title = 'Step one round';

    const restartEl = doc.createElement('button'); restartEl.append(icon(doc, ICONS.restart));
    const restart = ui.SimButton({ document: doc, element: restartEl, variant: 'icon', ariaLabel: 'Restart', onAction: call('onRestart') });
    restartEl.dataset.runCommand = 'restart'; restartEl.title = 'Restart';

    const speedContent = doc.createElement('div');
    const speedMenu = ui.SimMenu({ document: doc, label: 'Speed', content: speedContent });
    speedMenu.element.classList.add('sd-run-speed');
    const speedButtons = speeds.map(s => {
      const b = ui.SimButton({ document: doc, label: formatSpeed(s), variant: 'quiet', onAction: () => options.onSpeed?.(s) }).element;
      b.setAttribute('role', 'menuitemradio'); b.dataset.speed = String(s); speedContent.append(b); return b;
    });

    const clock = doc.createElement('output');
    clock.className = 'wui-clock sd-run-clock'; clock.setAttribute('aria-label', 'Simulation time');
    const clockTime = doc.createElement('span'), clockTotal = doc.createElement('span');
    clockTime.className = 'sd-run-time'; clockTotal.className = 'sd-run-total';
    clock.append(clockTime, clockTotal);

    const moreContent = doc.createElement('div');
    const more = ui.SimMenu({ document: doc, label: 'Run', content: moreContent });
    more.element.classList.add('sd-run-more');
    const replay = ui.SimButton({ document: doc, label: 'Replay', variant: 'quiet', onAction: call('onReplay') });
    const verify = ui.SimButton({ document: doc, label: 'Verify replay', variant: 'quiet', onAction: call('onVerify') });
    replay.element.dataset.runCommand = 'replay'; verify.element.dataset.runCommand = 'verify';
    replay.element.setAttribute('role', 'menuitem'); verify.element.setAttribute('role', 'menuitem');
    moreContent.append(replay.element, verify.element);

    const dock = ui.SimDock({ document: doc, label: 'Playback', children: [play.element, stepEl, restartEl, speedMenu.element, clock, more.element] });
    dock.classList.add('sd-run-dock');
    host.append(dock);

    let rendered = '', clockText = '';
    function update(next = {}) {
      state = { ...state, ...next };
      const speed = nearestSpeed(speeds, Number.isFinite(state.speed) ? state.speed : speeds[0]);
      const label = state.done ? 'Replay' : state.running ? 'Pause' : options.idleLabel || 'Play';
      const key = `${label}|${speed}|${state.busy}|${state.done}`;
      if (key !== rendered) {
        rendered = key;
        play.element.textContent = label;
        play.element.dataset.runState = state.done ? 'done' : state.running ? 'running' : 'paused';
        play.element.setAttribute('aria-pressed', 'false');
        play.setState({ disabled: Boolean(state.busy) });
        step.setState({ disabled: Boolean(state.busy || state.done) });
        restart.setState({ disabled: Boolean(state.busy) });
        replay.setState({ disabled: Boolean(state.busy) });
        verify.setState({ disabled: Boolean(state.busy) });
        speedMenu.trigger.textContent = formatSpeed(speed);
        speedMenu.trigger.setAttribute('aria-label', `Speed: ${formatSpeed(speed)}`);
        speedButtons.forEach((b, i) => b.setAttribute('aria-checked', String(speeds[i] === speed)));
        dock.dataset.running = String(Boolean(state.running));
        dock.dataset.done = String(Boolean(state.done));
      }
      const text = formatClock(state.time, state.horizon);
      if (text !== clockText) {
        clockText = text;
        const cut = text.indexOf(' / ');
        clockTime.textContent = text.slice(0, cut); clockTotal.textContent = text.slice(cut);
        clock.setAttribute('aria-label', `Simulation time ${text.replace(/\u2007/g, '').trim()}`);
      }
    }

    // The page owns document-level listeners; it forwards keydown here and stops if true is returned.
    function handleKey(event) {
      if (!shouldToggleOnKey(event) || state.busy) return false;
      event.preventDefault();
      if (state.done) options.onReplay?.();
      else if (state.running) options.onPause?.();
      else options.onPlay?.();
      return true;
    }

    update();
    return {
      element: dock,
      addAction(element){moreContent.append(element);},
      update,
      handleKey,
      dispose() { speedMenu.dispose(); more.dispose(); dock.remove(); },
    };
  }

  return Object.freeze({ create, formatClock, formatSpeed, nearestSpeed, shouldToggleOnKey });
});
