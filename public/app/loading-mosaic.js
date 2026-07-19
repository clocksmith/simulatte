(function attachLoadingMosaic(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteLoadingMosaic = api;
  if (typeof document !== 'undefined') {
    const start = () => api.mount(document.getElementById('loading-mosaic'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLoadingMosaic() {
  const DEFAULT_SIZE = 7;
  const CYCLE_DURATION_MS = 4400;
  const ROYGBIV_HUES = Object.freeze([0, 28, 56, 120, 210, 250, 290]);
  const TURN_START = 0.42;
  const TURN_END = 0.5;
  const EXPAND_START = 0.52;
  const EXPAND_END = 0.86;

  function spiralCells(size) {
    if (!Number.isInteger(size) || size < 1) throw new Error(`Loading mosaic expected a positive integer size, received ${size}`);
    const cells = [];
    let top = 0;
    let right = size - 1;
    let bottom = size - 1;
    let left = 0;
    while (top <= bottom && left <= right) {
      for (let column = left; column <= right; column += 1) cells.push([top, column]);
      top += 1;
      for (let row = top; row <= bottom; row += 1) cells.push([row, right]);
      right -= 1;
      if (top <= bottom) {
        for (let column = right; column >= left; column -= 1) cells.push([bottom, column]);
        bottom -= 1;
      }
      if (left <= right) {
        for (let row = bottom; row >= top; row -= 1) cells.push([row, left]);
        left += 1;
      }
    }
    return cells;
  }

  function orientedSpiralCells(size, quarterTurns = 0, outward = false) {
    const turns = ((quarterTurns % 4) + 4) % 4;
    const rotate = ([row, column]) => {
      let next = [row, column];
      for (let turn = 0; turn < turns; turn += 1) next = [next[1], size - 1 - next[0]];
      return next;
    };
    const cells = spiralCells(size).map(rotate);
    return outward ? cells.reverse() : cells;
  }

  function tileCycleKeyframes({ size, row, column, step, restingOpacity }) {
    const count = size * size;
    const center = Math.floor(size / 2);
    const rest = { opacity: restingOpacity, transform: 'translate(0%, 0%) scale(0.82)' };
    if (row === center && column === center) {
      return [
        { ...rest, offset: 0 },
        { opacity: 0.94, transform: 'translate(0%, 0%) scale(1)', offset: TURN_START - 0.025 },
        { opacity: 1, transform: 'translate(0%, 0%) scale(1.08)', offset: TURN_START },
        { opacity: 1, transform: 'translate(0%, 0%) scale(1.08)', offset: TURN_END },
        { ...rest, offset: TURN_END + 0.04 },
        { ...rest, offset: 1 },
      ];
    }
    const denominator = Math.max(1, count - 1);
    const collapseAt = 0.045 + ((step / denominator) * 0.345);
    const collapseActiveAt = collapseAt + 0.012;
    const collapseDoneAt = collapseAt + 0.028;
    const expandRank = count - 1 - step;
    const expandAt = EXPAND_START + ((expandRank / denominator) * (EXPAND_END - EXPAND_START));
    const expandActiveAt = expandAt + 0.012;
    const expandDoneAt = expandAt + 0.03;
    const translateX = (center - column) * 100;
    const translateY = (center - row) * 100;
    const collapsed = `translate(${translateX}%, ${translateY}%) scale(0.16)`;
    return [
      { ...rest, offset: 0 },
      { ...rest, offset: collapseAt },
      { opacity: 0.9, transform: 'translate(0%, 0%) scale(1)', offset: collapseActiveAt },
      { opacity: 0, transform: collapsed, offset: collapseDoneAt },
      { opacity: 0, transform: collapsed, offset: TURN_END },
      { opacity: 0, transform: collapsed, offset: expandAt },
      { opacity: 0.9, transform: collapsed, offset: expandActiveAt },
      { opacity: 0.76, transform: 'translate(0%, 0%) scale(1)', offset: expandDoneAt },
      { ...rest, offset: Math.min(0.94, expandDoneAt + 0.035) },
      { ...rest, offset: 1 },
    ];
  }

  function rotationCycleKeyframes(degrees) {
    return [
      { transform: 'rotate(0deg)', offset: 0 },
      { transform: 'rotate(0deg)', offset: TURN_START, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      { transform: `rotate(${degrees}deg)`, offset: TURN_END },
      { transform: `rotate(${degrees}deg)`, offset: 1 },
    ];
  }

  function animateCycle(container, tiles, configuration) {
    const view = container.ownerDocument.defaultView;
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (reducedMotion || typeof container.animate !== 'function') return { animations: [], dispose() {} };
    const animations = tiles.map(({ element, row, column, step, restingOpacity }) => element.animate(
      tileCycleKeyframes({ size: configuration.size, row, column, step, restingOpacity }),
      { duration: CYCLE_DURATION_MS, iterations: Infinity, fill: 'both' }
    ));
    animations.push(container.animate(rotationCycleKeyframes(configuration.rotationDegrees), {
      duration: CYCLE_DURATION_MS,
      iterations: Infinity,
      fill: 'both',
      iterationComposite: 'accumulate',
    }));
    const body = container.ownerDocument.body;
    const syncPlayback = () => {
      const method = body?.dataset?.journeyPhase === 'loading' ? 'play' : 'pause';
      animations.forEach((animation) => animation[method]());
    };
    const observer = typeof MutationObserver === 'function' && body
      ? new MutationObserver(syncPlayback)
      : null;
    observer?.observe(body, { attributes: true, attributeFilter: ['data-journey-phase'] });
    syncPlayback();
    return {
      animations,
      dispose() {
        observer?.disconnect();
        animations.forEach((animation) => animation.cancel());
      },
    };
  }

  function mount(container, size = DEFAULT_SIZE, random = Math.random) {
    if (!container) throw new Error('Loading mosaic expected #loading-mosaic');
    container.loadingMosaicController?.dispose?.();
    const quarterTurns = Math.floor(random() * 4) % 4;
    const rotationDegrees = random() >= 0.5 ? 90 : -90;
    const orderByCell = new Map(orientedSpiralCells(size, quarterTurns, false).map(([row, column], index) => [`${row}:${column}`, index]));
    const tiles = [];
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const tile = container.ownerDocument.createElement('i');
        const step = orderByCell.get(`${row}:${column}`);
        const tone = ROYGBIV_HUES[step % ROYGBIV_HUES.length];
        const restingOpacity = 0.025 + (((row + column * 2) % 5) * 0.012);
        tile.style.setProperty('--spiral-step', step);
        tile.style.setProperty('--tile-hue', tone);
        tile.style.setProperty('--tile-opacity', restingOpacity.toFixed(3));
        tiles.push({ element: tile, row, column, step, restingOpacity });
      }
    }
    container.style.setProperty('--mosaic-size', size);
    container.replaceChildren(...tiles.map((tile) => tile.element));
    const cycle = animateCycle(container, tiles, { size, rotationDegrees });
    const controller = Object.freeze({
      size,
      tileCount: tiles.length,
      quarterTurns,
      direction: 'inward-outward',
      rotationDegrees,
      dispose: cycle.dispose,
    });
    container.loadingMosaicController = controller;
    return controller;
  }

  return {
    CYCLE_DURATION_MS,
    DEFAULT_SIZE,
    EXPAND_END,
    EXPAND_START,
    ROYGBIV_HUES,
    TURN_END,
    TURN_START,
    mount,
    orientedSpiralCells,
    rotationCycleKeyframes,
    spiralCells,
    tileCycleKeyframes,
  };
});
