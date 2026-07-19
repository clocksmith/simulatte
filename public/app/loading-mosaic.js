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
  const SNAKE_LENGTH = 7;
  const CELL_GAP_PX = 2;
  const CYCLE_DURATION_MS = 5200;
  const ROYGBIV_HUES = Object.freeze([0, 28, 56, 120, 210, 250, 290]);
  const TRAVEL_END = 0.66;
  const COLLAPSE_END = 0.75;
  const TURN_START = 0.77;
  const TURN_END = 0.92;

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

  function cellTransform([row, column]) {
    const x = column * 100;
    const y = row * 100;
    const gapX = column * CELL_GAP_PX;
    const gapY = row * CELL_GAP_PX;
    return `translate(calc(${x}% + ${gapX}px), calc(${y}% + ${gapY}px))`;
  }

  function snakeSegmentKeyframes({ path, segmentIndex, size }) {
    const lastIndex = path.length - 1;
    const center = Math.floor(size / 2);
    const frames = [];
    for (let headIndex = 0; headIndex <= lastIndex; headIndex += 1) {
      const pathIndex = Math.max(0, headIndex - segmentIndex);
      frames.push({
        transform: cellTransform(path[pathIndex]),
        offset: (headIndex / lastIndex) * TRAVEL_END,
        easing: 'steps(1, end)',
      });
    }
    for (let collapseStep = 1; collapseStep <= SNAKE_LENGTH - 1; collapseStep += 1) {
      const pathIndex = Math.min(lastIndex, lastIndex - segmentIndex + collapseStep);
      frames.push({
        transform: cellTransform(path[pathIndex]),
        offset: TRAVEL_END + ((collapseStep / (SNAKE_LENGTH - 1)) * (COLLAPSE_END - TRAVEL_END)),
        easing: 'steps(1, end)',
      });
    }
    frames.push({ transform: cellTransform([center, center]), offset: TURN_START, easing: 'steps(1, end)' });
    for (let jump = 1; jump <= center; jump += 1) {
      const coordinate = center - jump;
      frames.push({
        transform: cellTransform([coordinate, coordinate]),
        offset: TURN_START + ((jump / center) * (TURN_END - TURN_START)),
        easing: 'steps(1, end)',
      });
    }
    frames.push({ transform: cellTransform([0, 0]), offset: 1 });
    return frames;
  }

  function rotationCycleKeyframes() {
    return [
      { transform: 'rotate(0deg)', offset: 0 },
      { transform: 'rotate(0deg)', offset: TURN_START, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      { transform: 'rotate(-90deg)', offset: TURN_END },
      { transform: 'rotate(-90deg)', offset: 1 },
    ];
  }

  function animateCycle(container, grid, segments, configuration) {
    const view = container.ownerDocument.defaultView;
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (reducedMotion || typeof grid.animate !== 'function') return { animations: [], dispose() {} };
    const timing = { duration: CYCLE_DURATION_MS, iterations: Infinity, fill: 'both' };
    const animations = segments.map((segment, segmentIndex) => segment.animate(
      snakeSegmentKeyframes({ path: configuration.path, segmentIndex, size: configuration.size }),
      timing
    ));
    animations.push(grid.animate(rotationCycleKeyframes(), {
      ...timing,
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

  function mount(container, size = DEFAULT_SIZE) {
    if (!container) throw new Error('Loading mosaic expected #loading-mosaic');
    if (size !== DEFAULT_SIZE) throw new Error(`Loading mosaic requires a ${DEFAULT_SIZE} x ${DEFAULT_SIZE} grid, received ${size}`);
    container.loadingMosaicController?.dispose?.();
    const grid = container.ownerDocument.createElement('div');
    grid.className = 'loading-mosaic-grid';
    const cells = Array.from({ length: size * size }, () => container.ownerDocument.createElement('i'));
    grid.replaceChildren(...cells);
    const snake = container.ownerDocument.createElement('div');
    snake.className = 'loading-mosaic-snake';
    const segments = ROYGBIV_HUES.map((hue, index) => {
      const segment = container.ownerDocument.createElement('b');
      segment.style.setProperty('--segment-hue', hue);
      segment.style.setProperty('--segment-layer', index + 1);
      return segment;
    });
    snake.replaceChildren(...segments);
    container.style.setProperty('--mosaic-size', size);
    container.replaceChildren(grid, snake);
    const path = spiralCells(size);
    const cycle = animateCycle(container, grid, segments, { path, size });
    const controller = Object.freeze({
      size,
      tileCount: cells.length,
      snakeLength: segments.length,
      direction: 'clockwise-inward',
      rotationDegrees: -90,
      dispose: cycle.dispose,
    });
    container.loadingMosaicController = controller;
    return controller;
  }

  return {
    CELL_GAP_PX,
    COLLAPSE_END,
    CYCLE_DURATION_MS,
    DEFAULT_SIZE,
    ROYGBIV_HUES,
    SNAKE_LENGTH,
    TRAVEL_END,
    TURN_END,
    TURN_START,
    cellTransform,
    mount,
    rotationCycleKeyframes,
    snakeSegmentKeyframes,
    spiralCells,
  };
});
