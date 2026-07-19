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
  const TRAIL_OPACITIES = Object.freeze([1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.3]);
  const TRAVEL_END = 0.66;
  const COLLAPSE_END = 0.75;
  const TURN_START = 0.77;
  const TURN_END = 0.92;
  const COLOR_CYCLE_COUNT = ROYGBIV_HUES.length;

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

  function trailOpacity(segmentIndex) {
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= TRAIL_OPACITIES.length) {
      throw new Error(`Loading mosaic expected a snake segment from 0 to ${TRAIL_OPACITIES.length - 1}, received ${segmentIndex}`);
    }
    return TRAIL_OPACITIES[segmentIndex];
  }

  function snakeSegmentKeyframes({ path, segmentIndex, size }) {
    const lastIndex = path.length - 1;
    const center = Math.floor(size / 2);
    const frames = [];
    for (let headIndex = 0; headIndex <= lastIndex; headIndex += 1) {
      const pathIndex = Math.max(0, headIndex - segmentIndex);
      frames.push({
        transform: cellTransform(path[pathIndex]),
        opacity: headIndex <= segmentIndex ? (segmentIndex === SNAKE_LENGTH - 1 ? 1 : 0) : trailOpacity(segmentIndex),
        offset: (headIndex / lastIndex) * TRAVEL_END,
        easing: 'steps(1, end)',
      });
    }
    for (let collapseStep = 1; collapseStep <= SNAKE_LENGTH - 1; collapseStep += 1) {
      const pathIndex = Math.min(lastIndex, lastIndex - segmentIndex + collapseStep);
      frames.push({
        transform: cellTransform(path[pathIndex]),
        opacity: collapseStep >= segmentIndex ? 1 : trailOpacity(segmentIndex),
        offset: TRAVEL_END + ((collapseStep / (SNAKE_LENGTH - 1)) * (COLLAPSE_END - TRAVEL_END)),
        easing: 'steps(1, end)',
      });
    }
    frames.push({ transform: cellTransform([center, center]), opacity: 1, offset: TURN_START, easing: 'steps(1, end)' });
    for (let jump = 1; jump <= center; jump += 1) {
      const coordinate = center - jump;
      frames.push({
        transform: cellTransform([coordinate, coordinate]),
        opacity: 1,
        offset: TURN_START + ((jump / center) * (TURN_END - TURN_START)),
        easing: 'steps(1, end)',
      });
    }
    frames.push({ transform: cellTransform([0, 0]), opacity: 1, offset: 1 });
    return frames;
  }

  function colorAt(segmentIndex, cycleShift) {
    const colorIndex = ((segmentIndex + cycleShift) % COLOR_CYCLE_COUNT + COLOR_CYCLE_COUNT) % COLOR_CYCLE_COUNT;
    return `hsl(${ROYGBIV_HUES[colorIndex]} 88% 62%)`;
  }

  function snakeColorKeyframes(segmentIndex) {
    const frames = [];
    for (let cycle = 0; cycle < COLOR_CYCLE_COUNT; cycle += 1) {
      const offset = (localOffset) => (cycle + localOffset) / COLOR_CYCLE_COUNT;
      frames.push({ color: colorAt(segmentIndex, cycle), offset: offset(0), easing: 'steps(1, end)' });
      frames.push({ color: colorAt(segmentIndex, cycle), offset: offset(TURN_START), easing: 'steps(1, end)' });
      for (let jump = 1; jump <= 3; jump += 1) {
        const jumpOffset = TURN_START + ((jump / 3) * (TURN_END - TURN_START));
        frames.push({ color: colorAt(segmentIndex, cycle - (jump * 2)), offset: offset(jumpOffset), easing: 'steps(1, end)' });
      }
      frames.push({ color: colorAt(segmentIndex, cycle + 1), offset: offset(1), easing: 'steps(1, end)' });
    }
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
    segments.forEach((segment, segmentIndex) => animations.push(segment.animate(
      snakeColorKeyframes(segmentIndex),
      { ...timing, duration: CYCLE_DURATION_MS * COLOR_CYCLE_COUNT }
    )));
    animations.push(grid.animate(rotationCycleKeyframes(), timing));
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
    COLOR_CYCLE_COUNT,
    COLLAPSE_END,
    CYCLE_DURATION_MS,
    DEFAULT_SIZE,
    ROYGBIV_HUES,
    SNAKE_LENGTH,
    TRAIL_OPACITIES,
    TRAVEL_END,
    TURN_END,
    TURN_START,
    cellTransform,
    mount,
    rotationCycleKeyframes,
    snakeColorKeyframes,
    snakeSegmentKeyframes,
    spiralCells,
    trailOpacity,
  };
});
