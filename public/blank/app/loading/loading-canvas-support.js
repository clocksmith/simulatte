(function attachSimulatteLoadingCanvasSupport(root, factory) {
  const api = factory();
  root.SimulatteLoadingCanvasSupport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLoadingCanvasSupport() {
  const MIN_SNAKES = 2;
  const MAX_SNAKES = 16;
  const START_LENGTH = 8;
  const MIN_SPAWN_LENGTH = 2;
  const MAX_SNAKE_LENGTH = 64;
  const TARGET_CELL_PX = 32;
  const MIN_CELL_PX = 18;
  const MAX_CELL_PX = 40;
  const LOOP_TURN_BONUS = 5.2;
  const OPEN_AREA_BONUS = 0.72;
  const NOVEL_CELL_BONUS = 8.2;
  const VISITED_CELL_PENALTY = 9.5;
  const RECENT_TRAIL_PENALTY = 5.4;
  const VISITED_MEMORY_CELLS = 160;
  const HEAD_TO_HEAD_COLLISION_SHARE = 0.58;
  const HEAD_TO_BODY_COLLISION_SHARE = 0.46;
  const HEAD_TO_HEAD_TARGET_BONUS = 13;
  const HEAD_TO_BODY_TARGET_BONUS = 10;
  const RECT_STRAIGHT_MIN = 3;
  const RECT_STRAIGHT_MAX = 8;
  const RECT_STRAIGHT_BONUS = 6.4;
  const RECT_TURN_BONUS = 2.1;
  const SPIRAL_SPAWN_ATTEMPTS = 180;
  const STEP_MS = 260;
  const MIN_SPEED_MULTIPLIER = 0.5;
  const MAX_SPEED_MULTIPLIER = 4;
  const FADE_MS = 160;
  const SEGMENT_FADE_MS = 180;
  const SEGMENT_STAGGER_MS = 34;
  const MIN_TAIL_ALPHA = 0.3;
  const GHOST_ALPHA = 0.28;

  const DIRECTIONS = Object.freeze([
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ]);

  const ROYGBIV_SPECTRUM = Object.freeze([
    '#ff9fbd',
    '#ffc98b',
    '#f6e899',
    '#bdeca1',
    '#9ee8cf',
    '#9bdcff',
    '#b8b5ff',
    '#d7a8ff',
  ]);

  function swizzleColors(colors) {
    const unique = [];
    for (const color of colors) {
      if (!unique.includes(color)) unique.push(color);
    }
    const fallback = unique.length ? unique : [ROYGBIV_SPECTRUM[0]];
    const swizzled = [];
    const half = Math.ceil(fallback.length / 2);
    for (let i = 0; i < half; i += 1) {
      swizzled.push(fallback[i % fallback.length]);
      if (fallback[i + half]) swizzled.push(fallback[i + half]);
    }
    return swizzled.slice(0, 6);
  }

  function visitedFromCells(cells) {
    const visited = new Set();
    for (const cell of cells || []) {
      visited.add(cellKey(cell));
    }
    return visited;
  }

  function markVisited(snake, cell) {
    if (!snake || !cell) return;
    if (!snake.visited) snake.visited = new Set();
    snake.visited.add(cellKey(cell));
    while (snake.visited.size > VISITED_MEMORY_CELLS) {
      snake.visited.delete(snake.visited.values().next().value);
    }
  }

  function mergeVisited(snakes) {
    const visited = new Set();
    for (const snake of snakes || []) {
      for (const key of snake.visited || []) {
        visited.add(key);
        if (visited.size >= VISITED_MEMORY_CELLS) return visited;
      }
      for (const cell of snake.cells || []) {
        visited.add(cellKey(cell));
        if (visited.size >= VISITED_MEMORY_CELLS) return visited;
      }
    }
    return visited;
  }

  function buildOccupancy(snakes) {
    const occupied = new Map();
    for (const snake of snakes) {
      const head = snake.cells[0];
      const length = snake.cells.length;
      snake.cells.forEach((cell, index) => {
        occupied.set(cellKey(cell), { id: snake.id, index, length, head });
      });
    }
    return occupied;
  }

  function headCellsBySnakeId(occupied) {
    const heads = new Map();
    for (const owner of occupied.values()) {
      if (owner.index === 0) heads.set(owner.id, owner.head);
    }
    return heads;
  }

  function isDestructiveBodyCollision(owner, snakeId) {
    return Boolean(owner && owner.id !== snakeId && owner.index > 0);
  }

  function findParent(parent, id) {
    const next = parent.get(id);
    if (next === id || !parent.has(next)) return id;
    const root = findParent(parent, next);
    parent.set(id, root);
    return root;
  }

  function alphaForCell(index, length) {
    if (length <= 1) return 1;
    const age = index / (length - 1);
    return 1 - easeInFastOut(age) * (1 - MIN_TAIL_ALPHA);
  }

  function colorWithAlpha(hex, alpha) {
    const value = String(hex || ROYGBIV_SPECTRUM[0]).replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
  }

  function primeSnakeAnimation(snake, fromCells, toCells, now, speed) {
    const source = cloneCells(fromCells || []);
    snake.drawFrom = alignCells(source, toCells);
    snake.drawFromLength = source.length;
    snake.drawTo = cloneCells(toCells);
    snake.stepStartedAt = Number(now || 0);
    snake.stepMs = Math.max(16, Number(speed || STEP_MS));
  }

  function segmentEnterAlpha(snake, index, now) {
    if (!snake || !Number.isFinite(Number(snake.enterStartedAt))) return 1;
    const elapsed = Number(now || 0) - Number(snake.enterStartedAt || 0) - index * SEGMENT_STAGGER_MS;
    return easeInFastOut(clamp(elapsed / SEGMENT_FADE_MS, 0, 1));
  }

  function segmentExitAlpha(snake, index, length, now) {
    if (!snake || !Number.isFinite(Number(snake.exitStartedAt))) return 0;
    const tailFirstIndex = Math.max(0, Number(length || 0) - 1 - index);
    const elapsed = Number(now || 0) - Number(snake.exitStartedAt || 0) - tailFirstIndex * SEGMENT_STAGGER_MS;
    return 1 - easeInFastOut(clamp(elapsed / SEGMENT_FADE_MS, 0, 1));
  }

  function exitSnakeComplete(snake, now) {
    const length = snake && Array.isArray(snake.cells) ? snake.cells.length : 0;
    if (!length) return true;
    return Number(now || 0) - Number(snake.exitStartedAt || 0) >
      SEGMENT_FADE_MS + length * SEGMENT_STAGGER_MS;
  }

  function alignCells(fromCells, toCells) {
    const source = cloneCells(fromCells || []);
    const target = cloneCells(toCells || []);
    if (!target.length) return source;
    if (!source.length) return cloneCells(target);
    while (source.length < target.length) {
      source.push({ ...source[source.length - 1] });
    }
    return source;
  }

  function cloneCells(cells) {
    return (cells || []).map((cell) => ({ x: cell.x, y: cell.y }));
  }

  function lerpCell(from, to, t) {
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
  }

  function easeOutCubic(value) {
    const t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInFastOut(value) {
    const t = clamp(value, 0, 1);
    if (t < 0.22) return 0.42 * Math.pow(t / 0.22, 2);
    const rest = (t - 0.22) / 0.78;
    return 0.42 + 0.58 * (1 - Math.pow(1 - rest, 2.8));
  }

  function directionFromTrail(cells, fallback) {
    if (!cells || cells.length < 2) return fallback || DIRECTIONS[0];
    return directionFromCells(cells[1], cells[0]);
  }

  function directionFromCells(from, to) {
    const dx = clamp(to.x - from.x, -1, 1);
    const dy = clamp(to.y - from.y, -1, 1);
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return { x: dx, y: 0 };
    if (dy !== 0) return { x: 0, y: dy };
    return {
      x: 1,
      y: 0,
    };
  }

  function sameDirection(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function sameCell(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function invertDirection(direction) {
    return { x: -direction.x, y: -direction.y };
  }

  function turnDirection(direction, bias) {
    const sign = bias < 0 ? -1 : 1;
    return {
      x: -direction.y * sign,
      y: direction.x * sign,
    };
  }

  function addCells(cell, direction) {
    return { x: cell.x + direction.x, y: cell.y + direction.y };
  }

  function insideBoard(cell, board) {
    return cell.x >= 0 && cell.y >= 0 && cell.x < board.cols && cell.y < board.rows;
  }

  function cellKey(cell) {
    return `${cell.x},${cell.y}`;
  }

  function stageCode(stage) {
    const value = String(stage || '').toLowerCase();
    if (/manifest|start/.test(value)) return 0.08;
    if (/cache/.test(value)) return 0.18;
    if (/indexes/.test(value)) return 0.3;
    if (/reranker/.test(value)) return 0.48;
    if (/model-load|model/.test(value)) return 0.42;
    if (/retrieval-start/.test(value)) return 0.5;
    if (/embed/.test(value)) return 0.56;
    if (/span-refined|span-retrieval/.test(value)) return 0.68;
    if (/classification/.test(value)) return 0.78;
    if (/compile/.test(value)) return 0.88;
    if (/visual/.test(value)) return 0.94;
    return 0.5;
  }

  function createRng(seed) {
    let value = seed >>> 0;
    return function rng() {
      value += 0x6D2B79F5;
      let next = value;
      next = Math.imul(next ^ next >>> 15, next | 1);
      next ^= next + Math.imul(next ^ next >>> 7, next | 61);
      return ((next ^ next >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    MIN_SNAKES,
    MAX_SNAKES,
    START_LENGTH,
    MIN_SPAWN_LENGTH,
    MAX_SNAKE_LENGTH,
    TARGET_CELL_PX,
    MIN_CELL_PX,
    MAX_CELL_PX,
    LOOP_TURN_BONUS,
    OPEN_AREA_BONUS,
    NOVEL_CELL_BONUS,
    VISITED_CELL_PENALTY,
    RECENT_TRAIL_PENALTY,
    VISITED_MEMORY_CELLS,
    HEAD_TO_HEAD_COLLISION_SHARE,
    HEAD_TO_BODY_COLLISION_SHARE,
    HEAD_TO_HEAD_TARGET_BONUS,
    HEAD_TO_BODY_TARGET_BONUS,
    RECT_STRAIGHT_MIN,
    RECT_STRAIGHT_MAX,
    RECT_STRAIGHT_BONUS,
    RECT_TURN_BONUS,
    SPIRAL_SPAWN_ATTEMPTS,
    STEP_MS,
    MIN_SPEED_MULTIPLIER,
    MAX_SPEED_MULTIPLIER,
    FADE_MS,
    SEGMENT_FADE_MS,
    SEGMENT_STAGGER_MS,
    MIN_TAIL_ALPHA,
    GHOST_ALPHA,
    DIRECTIONS,
    ROYGBIV_SPECTRUM,
    swizzleColors,
    visitedFromCells,
    markVisited,
    mergeVisited,
    buildOccupancy,
    headCellsBySnakeId,
    isDestructiveBodyCollision,
    findParent,
    alphaForCell,
    colorWithAlpha,
    primeSnakeAnimation,
    segmentEnterAlpha,
    segmentExitAlpha,
    exitSnakeComplete,
    alignCells,
    cloneCells,
    lerpCell,
    easeOutCubic,
    easeInFastOut,
    directionFromTrail,
    directionFromCells,
    sameDirection,
    sameCell,
    invertDirection,
    turnDirection,
    addCells,
    insideBoard,
    cellKey,
    stageCode,
    createRng,
    clamp,
  };
});
