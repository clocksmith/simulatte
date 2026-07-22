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
  const CENTER = Math.floor(DEFAULT_SIZE / 2);
  const SNAKE_LENGTH = 7;
  const CELL_GAP_PX = 6;
  const SNAKE_TRAVEL_DURATION_MS = 1200;
  const SNAKE_COLLAPSE_DURATION_MS = 150;
  const TURN_DELAY_MS = 50;
  const ROTATION_DURATION_MS = 500;
  const TURN_PAUSE_FRACTION = 0.76;
  // Hold at the top-left corner after the diagonal shift before the cycle repeats.
  const CORNER_PAUSE_MS = 850;
  const CYCLE_DURATION_MS = SNAKE_TRAVEL_DURATION_MS + SNAKE_COLLAPSE_DURATION_MS
    + TURN_DELAY_MS + ROTATION_DURATION_MS + CORNER_PAUSE_MS;
  const ROTATION_STEP_DEG = 90 / CENTER;
  // Seven hues evenly spaced around the full 360° color wheel (360 / 7 ≈ 51.43° apart),
  // so the palette sweeps the whole spectrum in even steps rather than bunched named colors.
  const ROYGBIV_HUES = Object.freeze([0, 51, 103, 154, 206, 257, 309]);
  const TRAIL_OPACITIES = Object.freeze([1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.3]);
  const TRAVEL_END = SNAKE_TRAVEL_DURATION_MS / CYCLE_DURATION_MS;
  const COLLAPSE_END = (SNAKE_TRAVEL_DURATION_MS + SNAKE_COLLAPSE_DURATION_MS) / CYCLE_DURATION_MS;
  const TURN_START = (SNAKE_TRAVEL_DURATION_MS + SNAKE_COLLAPSE_DURATION_MS + TURN_DELAY_MS) / CYCLE_DURATION_MS;
  const TURN_END = (SNAKE_TRAVEL_DURATION_MS + SNAKE_COLLAPSE_DURATION_MS + TURN_DELAY_MS + ROTATION_DURATION_MS) / CYCLE_DURATION_MS;
  const COLOR_CYCLE_COUNT = ROYGBIV_HUES.length;
  const HEAD_HUE_HOP_STEP = 5;

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
    const mergedOpacity = segmentIndex === 0 ? 1 : 0;
    const frames = [];
    // Travel: each segment lags the head by its index and holds a constant per-cell
    // opacity, so the body always reads as a clean fade from the bright head to the
    // faint tail — only the head remains after merge.
    for (let headIndex = 0; headIndex <= lastIndex; headIndex += 1) {
      const pathIndex = Math.max(0, headIndex - segmentIndex);
      frames.push({
        transform: cellTransform(path[pathIndex]),
        opacity: trailOpacity(segmentIndex),
        offset: (headIndex / lastIndex) * TRAVEL_END,
        easing: 'steps(1, end)',
      });
    }
    for (let collapseStep = 1; collapseStep <= SNAKE_LENGTH - 1; collapseStep += 1) {
      const pathIndex = Math.min(lastIndex, lastIndex - segmentIndex + collapseStep);
      frames.push({
        transform: cellTransform(path[pathIndex]),
        opacity: collapseStep >= segmentIndex ? mergedOpacity : trailOpacity(segmentIndex),
        offset: TRAVEL_END + ((collapseStep / (SNAKE_LENGTH - 1)) * (COLLAPSE_END - TRAVEL_END)),
        easing: 'steps(1, end)',
      });
    }
    frames.push({
      transform: cellTransform([center, center]),
      opacity: mergedOpacity,
      offset: TURN_START,
      easing: 'steps(1, end)',
    });
    // Diagonal shift along the anti-diagonal toward local [0, size-1]. Combined with the
    // -90° emblem rotation this lands the cell at the VISUAL top-left corner, and it stays
    // top-left across the loop (rotation resets while the cell returns to [0,0]).
    for (let jump = 1; jump <= center; jump += 1) {
      frames.push({
        transform: cellTransform([center - jump, center + jump]),
        opacity: mergedOpacity,
        offset: TURN_START + ((jump / center) * (TURN_END - TURN_START)),
        easing: 'steps(1, end)',
      });
    }
    frames.push({ transform: cellTransform([0, 2 * center]), opacity: mergedOpacity, offset: 1 });
    return frames;
  }

  function colorAt(hueIndex) {
    const wrapped = ((hueIndex % COLOR_CYCLE_COUNT) + COLOR_CYCLE_COUNT) % COLOR_CYCLE_COUNT;
    return `hsl(${ROYGBIV_HUES[wrapped]} 88% 62%)`;
  }

  // Deterministic color, indexed into the ordered ROYGBIV palette — no timeline to
  // sample. The crawl is a FIXED rainbow: segment 0 (the head) always leads with hue 0
  // and the body fades back to the tail, unchanged from iteration to iteration. The
  // palette iteration lives on the diagonal shift: while the snake is gathered for the
  // turn only the top z-layer is on screen, and that single cell carries the color. Its
  // start hue advances +1 per iteration and advances +2 per completed hop — so the shift
  // walks cleanly through every hue across iterations while the active head remains
  // readable.
  function segmentColor(segmentIndex, iteration, completedHops, inTurn) {
    if (inTurn && segmentIndex === SNAKE_LENGTH - 1) {
      return colorAt(segmentIndex + iteration + (HEAD_HUE_HOP_STEP * completedHops));
    }
    return colorAt(segmentIndex);
  }

  // How many diagonal hops have been completed at a given cycle phase (0..1). The
  // thresholds match the position keyframes exactly, so color and geometry step together.
  function completedHopsAt(phase) {
    if (phase <= TURN_START) return 0;
    return Math.min(CENTER, Math.floor(((phase - TURN_START) / (TURN_END - TURN_START)) * CENTER));
  }

  // The grid turns in lock step with the diagonal cell: it holds during each hop and then
  // quickly rotates by ROTATION_STEP_DEG (90 / CENTER = 30°). This makes the turn feel
  // staged while preserving the existing hop timing envelope.
  function rotationCycleKeyframes() {
    const frames = [
      { transform: 'rotate(0deg)', offset: 0, easing: 'steps(1, end)' },
      { transform: 'rotate(0deg)', offset: TURN_START, easing: 'steps(1, end)' },
    ];
    const turnSpan = TURN_END - TURN_START;
    const hopSpan = turnSpan / CENTER;
    const pauseSpan = hopSpan * TURN_PAUSE_FRACTION;
    for (let hop = 1; hop <= CENTER; hop += 1) {
      const fromHopAngle = -ROTATION_STEP_DEG * (hop - 1);
      const toHopAngle = -ROTATION_STEP_DEG * hop;
      const hopStart = TURN_START + ((hop - 1) * hopSpan);
      const hopPause = hopStart + pauseSpan;
      const hopEnd = TURN_START + (hop * hopSpan);
      frames.push({
        transform: `rotate(${fromHopAngle}deg)`,
        offset: hopPause,
        easing: 'steps(1, end)',
      });
      frames.push({
        transform: `rotate(${toHopAngle}deg)`,
        offset: hopEnd,
        easing: 'cubic-bezier(0.12, 0, 0.16, 1)',
      });
    }
    frames.push({ transform: 'rotate(-90deg)', offset: 1 });
    return frames;
  }

  function animateCycle(container, grid, segments, configuration) {
    const view = container.ownerDocument.defaultView;
    const reducedMotion = view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const paint = (iteration, completedHops, inTurn) => {
      segments.forEach((segment, segmentIndex) => {
        const color = segmentColor(segmentIndex, iteration, completedHops, inTurn);
        if (segment.dataset.hue !== color) {
          segment.style.color = color;
          segment.dataset.hue = color;
        }
      });
    };
    // Static fallback: paint the fixed rainbow so the snake is never blank.
    paint(0, 0, false);
    if (reducedMotion || typeof grid.animate !== 'function') return { animations: [], dispose() {} };

    const timing = { duration: CYCLE_DURATION_MS, iterations: Infinity, fill: 'both' };
    const animations = segments.map((segment, segmentIndex) => segment.animate(
      snakeSegmentKeyframes({ path: configuration.path, segmentIndex, size: configuration.size }),
      timing
    ));
    // Rotate the emblem core (grid + snake) around the true emblem center.
    // Falls back to the container if the explicit rotor wrapper is absent.
    const rotationTarget = container.querySelector('.loading-mosaic-shell') || container;
    animations.push(rotationTarget.animate(rotationCycleKeyframes(), timing));
    const clock = animations[0];

    // Advance color by counting hops, not by sampling a timeline: read the geometry
    // clock only to derive the integer (iteration, completedHops) state, and repaint
    // solely when that state changes.
    let rafId = null;
    let lastKey = '';
    const tick = () => {
      const time = Number(clock.currentTime) || 0;
      const iteration = Math.floor(time / CYCLE_DURATION_MS);
      const phase = (time % CYCLE_DURATION_MS) / CYCLE_DURATION_MS;
      const inTurn = phase >= TURN_START;
      const completedHops = completedHopsAt(phase);
      const key = `${iteration}:${completedHops}:${inTurn ? 1 : 0}`;
      if (key !== lastKey) {
        lastKey = key;
        paint(iteration, completedHops, inTurn);
      }
      rafId = view.requestAnimationFrame(tick);
    };
    const body = container.ownerDocument.body;
    const syncPlayback = () => {
      const playing = body?.dataset?.journeyPhase === 'loading';
      animations.forEach((animation) => animation[playing ? 'play' : 'pause']());
      if (playing && rafId === null && typeof view.requestAnimationFrame === 'function') {
        rafId = view.requestAnimationFrame(tick);
      } else if (!playing && rafId !== null) {
        view.cancelAnimationFrame(rafId);
        rafId = null;
      }
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
        if (rafId !== null) view.cancelAnimationFrame(rafId);
        animations.forEach((animation) => animation.cancel());
      },
    };
  }

  function mount(container, size = DEFAULT_SIZE) {
    if (!container) throw new Error('Loading mosaic expected #loading-mosaic');
    if (size !== DEFAULT_SIZE) throw new Error(`Loading mosaic requires a ${DEFAULT_SIZE} x ${DEFAULT_SIZE} grid, received ${size}`);
    container.loadingMosaicController?.dispose?.();
    const shell = container.ownerDocument.createElement('div');
    shell.className = 'loading-mosaic-shell';

    const grid = container.ownerDocument.createElement('div');
    grid.className = 'loading-mosaic-grid';
    const cells = Array.from({ length: size * size }, () => container.ownerDocument.createElement('i'));
    grid.replaceChildren(...cells);

    const snake = container.ownerDocument.createElement('div');
    snake.className = 'loading-mosaic-snake';
    const segments = ROYGBIV_HUES.map((hue, index) => {
      const segment = container.ownerDocument.createElement('b');
      segment.style.setProperty('--segment-hue', hue);
      segment.style.zIndex = String(SNAKE_LENGTH - index);
      return segment;
    });
    snake.replaceChildren(...segments);
    shell.append(grid, snake);
    container.style.setProperty('--mosaic-size', size);
    container.replaceChildren(shell);
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
    HEAD_HUE_HOP_STEP,
    ROTATION_DURATION_MS,
    ROTATION_STEP_DEG,
    TURN_PAUSE_FRACTION,
    ROYGBIV_HUES,
    SNAKE_COLLAPSE_DURATION_MS,
    SNAKE_LENGTH,
    SNAKE_TRAVEL_DURATION_MS,
    TRAIL_OPACITIES,
    TRAVEL_END,
    TURN_END,
    TURN_DELAY_MS,
    TURN_START,
    cellTransform,
    colorAt,
    completedHopsAt,
    mount,
    rotationCycleKeyframes,
    segmentColor,
    snakeSegmentKeyframes,
    spiralCells,
    trailOpacity,
  };
});
