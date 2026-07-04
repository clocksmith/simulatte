(function attachSimulatteLoadingCanvas(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteLoadingCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLoadingCanvasApi(root) {
  const MIN_SNAKES = 6;
  const MAX_SNAKES = 10;
  const START_LENGTH = 9;
  const SPLIT_LENGTH = 34;
  const MIN_SPLIT_LENGTH = 8;
  const MAX_SNAKE_LENGTH = 58;
  const TOTAL_CELL_LIMIT = 230;
  const TARGET_CELL_PX = 32;
  const MIN_CELL_PX = 18;
  const MAX_CELL_PX = 40;
  const LOOP_TURN_BONUS = 5.2;
  const TRAIL_ORBIT_BONUS = 1.7;
  const STEP_MS = 82;
  const FADE_MS = 160;
  const DIRECTIONS = Object.freeze([
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ]);
  const PASTEL_RAINBOW = Object.freeze([
    '#ff6fa3',
    '#ff9f45',
    '#ffe457',
    '#61e06f',
    '#42cfff',
    '#748bff',
    '#c66bff',
  ]);

  function createController(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    return new SnakeLoadingCanvas(canvas, options);
  }

  class SnakeLoadingCanvas {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
      this.maxDpr = Number(options.maxDpr || 1.25);
      this.active = false;
      this.running = false;
      this.raf = 0;
      this.stopTimer = 0;
      this.progress = 0;
      this.stageCode = 0;
      this.lastStepAt = 0;
      this.tick = 0;
      this.lastSizeKey = '';
      this.board = null;
      this.snakes = [];
      this.nextSnakeId = 1;
      this.rng = createRng(0x51a7e5);
      this.canvas.dataset.renderer = 'multi-snake-loading-canvas';
      this.canvas.hidden = true;
    }

    setLoading(active, percent, stage) {
      const nextActive = Boolean(active);
      this.progress = clamp(Number(percent || 0) / 100, 0, 1);
      this.stageCode = stageCode(stage);
      if (nextActive) {
        this.show();
        return;
      }
      this.hide();
    }

    show() {
      this.active = true;
      this.canvas.hidden = false;
      this.canvas.dataset.state = 'active';
      this.canvas.classList.add('is-active');
      if (this.stopTimer) {
        root.clearTimeout(this.stopTimer);
        this.stopTimer = 0;
      }
      if (!this.running) {
        this.running = true;
        this.lastStepAt = 0;
        this.raf = root.requestAnimationFrame((now) => this.frame(now));
      }
    }

    hide() {
      this.active = false;
      this.canvas.dataset.state = 'idle';
      this.canvas.classList.remove('is-active');
      if (this.stopTimer) root.clearTimeout(this.stopTimer);
      this.stopTimer = root.setTimeout(() => this.stop(), FADE_MS + 40);
    }

    stop() {
      this.stopTimer = 0;
      if (this.raf) root.cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.running = false;
      this.canvas.hidden = true;
      this.clear();
    }

    frame(now) {
      if (!this.running) return;
      this.resize();
      const speed = Math.max(32, STEP_MS - this.stageCode * 34);
      if (!this.lastStepAt || now - this.lastStepAt >= speed) {
        this.advanceSwarm();
        this.lastStepAt = now;
      }
      this.draw(now * 0.001);
      this.raf = root.requestAnimationFrame((time) => this.frame(time));
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(this.maxDpr, root.devicePixelRatio || 1));
      const width = Math.max(2, Math.floor(rect.width * dpr));
      const height = Math.max(2, Math.floor(rect.height * dpr));
      const key = `${width}x${height}`;
      if (key === this.lastSizeKey) return;
      this.canvas.width = width;
      this.canvas.height = height;
      this.lastSizeKey = key;
      this.board = fullPageBoard(width, height);
      this.resetSwarm();
    }

    resetSwarm() {
      this.snakes = [];
      this.nextSnakeId = 1;
      if (!this.board) return;
      while (this.snakes.length < MIN_SNAKES) {
        this.spawnSnake();
      }
    }

    spawnSnake(length = START_LENGTH) {
      if (!this.board || this.snakes.length >= MAX_SNAKES) return false;
      const occupied = buildOccupancy(this.snakes);
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const direction = DIRECTIONS[Math.floor(this.rng() * DIRECTIONS.length)];
        const x = 2 + Math.floor(this.rng() * Math.max(1, this.board.cols - 4));
        const y = 2 + Math.floor(this.rng() * Math.max(1, this.board.rows - 4));
        const cells = [];
        for (let i = 0; i < length; i += 1) {
          const cell = { x: x - direction.x * i, y: y - direction.y * i };
          if (!insideBoard(cell, this.board) || occupied.has(cellKey(cell))) {
            cells.length = 0;
            break;
          }
          cells.push(cell);
        }
        if (!cells.length) continue;
        this.snakes.push({
          id: this.nextSnakeId++,
          cells,
          direction,
          colors: [PASTEL_RAINBOW[Math.floor(this.rng() * PASTEL_RAINBOW.length)]],
          growthEvery: 4 + Math.floor(this.rng() * 5),
          phase: Math.floor(this.rng() * 17),
          turnBias: this.rng() < 0.5 ? -1 : 1,
          loopiness: 0.72 + this.rng() * 0.38,
        });
        return true;
      }
      return false;
    }

    advanceSwarm() {
      if (!this.board) return;
      this.tick += 1;
      this.enforcePopulation();
      const occupiedBefore = buildOccupancy(this.snakes);
      const plans = this.snakes.map((snake) => {
        const direction = chooseDirection(snake, this.board, occupiedBefore, this.rng);
        return {
          snake,
          direction,
          target: addCells(snake.cells[0], direction),
        };
      });

      for (const plan of plans) {
        const snake = plan.snake;
        if (!this.snakes.includes(snake)) continue;
        const target = insideBoard(plan.target, this.board)
          ? plan.target
          : addCells(snake.cells[0], invertDirection(snake.direction));
        plan.actualTarget = target;
        snake.direction = insideBoard(target, this.board) ? directionFromCells(snake.cells[0], target) : snake.direction;
        snake.cells.unshift(target);
        const growing = snake.cells.length < START_LENGTH ||
          (this.tick + snake.phase) % snake.growthEvery === 0 ||
          this.progress > 0.72 && (this.tick + snake.phase) % 3 === 0;
        if (!growing) snake.cells.pop();
        if (snake.cells.length > MAX_SNAKE_LENGTH) snake.cells.length = MAX_SNAKE_LENGTH;
      }

      this.combineCollisionGroups(plans, occupiedBefore);
      this.splitOversizedSnakes();
      this.enforcePopulation();
    }

    enforcePopulation() {
      while (this.snakes.length < MIN_SNAKES) {
        if (!this.spawnSnake(START_LENGTH - 1 + Math.floor(this.rng() * 4))) break;
      }
      if (this.snakes.length > MAX_SNAKES) {
        this.snakes.sort((a, b) => b.cells.length - a.cells.length);
        this.snakes.length = MAX_SNAKES;
      }
    }

    combineCollisionGroups(plans, occupiedBefore) {
      const parent = new Map(this.snakes.map((snake) => [snake.id, snake.id]));
      const union = (a, b) => {
        const rootA = findParent(parent, a);
        const rootB = findParent(parent, b);
        if (rootA !== rootB) parent.set(rootB, rootA);
      };

      const headTargets = new Map();
      for (const plan of plans) {
        if (!this.snakes.includes(plan.snake)) continue;
        const targetKey = cellKey(plan.actualTarget || plan.target);
        const oldOwner = occupiedBefore.get(targetKey);
        if (oldOwner && oldOwner.id !== plan.snake.id) union(plan.snake.id, oldOwner.id);
        const sameTarget = headTargets.get(targetKey);
        if (sameTarget && sameTarget !== plan.snake.id) union(plan.snake.id, sameTarget);
        headTargets.set(targetKey, plan.snake.id);
      }

      const groups = new Map();
      for (const snake of this.snakes) {
        const rootId = findParent(parent, snake.id);
        if (!groups.has(rootId)) groups.set(rootId, []);
        groups.get(rootId).push(snake);
      }

      const merged = [];
      for (const group of groups.values()) {
        if (group.length === 1) {
          merged.push(group[0]);
          continue;
        }
        merged.push(combineSnakes(group, this.board, this.nextSnakeId++));
      }
      this.snakes = merged.slice(0, MAX_SNAKES);
    }

    splitOversizedSnakes() {
      for (let i = 0; i < this.snakes.length && this.snakes.length < MAX_SNAKES; i += 1) {
        const snake = this.snakes[i];
        if (snake.cells.length < SPLIT_LENGTH) continue;
        let cells = snake.cells.slice();
        if (totalCellCount(this.snakes) > TOTAL_CELL_LIMIT) {
          cells = shedCellsForSplit(cells);
        }
        if (cells.length < MIN_SPLIT_LENGTH * 2) continue;
        const splitAt = Math.floor(cells.length * 0.56);
        const headCells = cells.slice(0, splitAt);
        const tailCells = cells.slice(splitAt).reverse();
        if (tailCells.length < MIN_SPLIT_LENGTH) continue;
        snake.cells = headCells;
        snake.direction = directionFromTrail(headCells, snake.direction);
        const childColors = rotateColors(snake.colors);
        this.snakes.push({
          id: this.nextSnakeId++,
          cells: tailCells,
          direction: directionFromTrail(tailCells, invertDirection(snake.direction)),
          colors: childColors,
          growthEvery: 5 + Math.floor(this.rng() * 5),
          phase: Math.floor(this.rng() * 17),
          turnBias: -snake.turnBias || 1,
          loopiness: snake.loopiness || 0.85,
        });
      }
    }

    clear() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
    }

    draw(time) {
      const ctx = this.ctx;
      if (!ctx || !this.board) return;
      const width = this.canvas.width;
      const height = this.canvas.height;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      drawGrid(ctx, this.board, width, height);
      for (const snake of this.snakes) {
        drawSnake(ctx, this.board, snake);
      }
      ctx.restore();
    }
  }

  function fullPageBoard(width, height) {
    const shortAxis = Math.min(width, height);
    const shortAxisCells = Math.max(10, Math.floor(shortAxis / TARGET_CELL_PX));
    const cell = Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.round(shortAxis / shortAxisCells)));
    return {
      x: 0,
      y: 0,
      width,
      height,
      cell,
      cols: Math.max(12, Math.ceil(width / cell)),
      rows: Math.max(10, Math.ceil(height / cell)),
    };
  }

  function drawGrid(ctx, board, width, height) {
    ctx.fillStyle = '#f8f8f9';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(198, 201, 207, 0.62)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= board.cols; x += 1) {
      const px = x * board.cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
      ctx.stroke();
    }
    for (let y = 0; y <= board.rows; y += 1) {
      const py = y * board.cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
      ctx.stroke();
    }
  }

  function drawSnake(ctx, board, snake) {
    const cell = board.cell;
    for (let index = snake.cells.length - 1; index >= 0; index -= 1) {
      const part = snake.cells[index];
      const alpha = alphaForCell(index, snake.cells.length);
      const color = snake.colors[index % snake.colors.length];
      ctx.fillStyle = colorWithAlpha(color, alpha);
      const inset = Math.max(2, Math.round(cell * 0.12));
      ctx.fillRect(
        part.x * cell + inset,
        part.y * cell + inset,
        cell - inset * 2,
        cell - inset * 2
      );
    }
  }

  function chooseDirection(snake, board, occupied, rng) {
    const current = snake.direction;
    let best = current;
    let bestScore = -Infinity;
    for (const direction of DIRECTIONS) {
      const target = addCells(snake.cells[0], direction);
      let score = rng() * 0.5;
      if (!insideBoard(target, board)) score -= 1000;
      const preferredTurn = turnDirection(current, snake.turnBias || 1);
      const oppositeTurn = turnDirection(current, -(snake.turnBias || 1));
      if (sameDirection(direction, current)) score += 1.1;
      if (sameDirection(direction, preferredTurn)) score += LOOP_TURN_BONUS * (snake.loopiness || 0.85);
      if (sameDirection(direction, oppositeTurn)) score += LOOP_TURN_BONUS * 0.22;
      if (sameDirection(direction, invertDirection(current))) score -= 7;
      score += openNeighborCount(target, board, occupied, snake.id) * 1.4;
      score += ownTrailAdjacency(target, snake) * TRAIL_ORBIT_BONUS * (snake.loopiness || 0.85);
      score += wallDistanceScore(target, board) * 0.35;
      const owner = occupied.get(cellKey(target));
      if (owner && owner.id === snake.id) score -= 900;
      if (owner && owner.id !== snake.id) score -= 18;
      const headPressure = nearbyHeadPressure(target, snake, occupied);
      score -= headPressure * 2.2;
      if (score > bestScore) {
        bestScore = score;
        best = direction;
      }
    }
    return best;
  }

  function nearbyHeadPressure(target, snake, occupied) {
    let pressure = 0;
    for (const owner of occupied.values()) {
      if (!owner.head || owner.id === snake.id) continue;
      const distance = Math.abs(owner.head.x - target.x) + Math.abs(owner.head.y - target.y);
      if (distance <= 3) pressure += 4 - distance;
    }
    return pressure;
  }

  function openNeighborCount(cell, board, occupied, snakeId) {
    let count = 0;
    for (const direction of DIRECTIONS) {
      const next = addCells(cell, direction);
      if (!insideBoard(next, board)) continue;
      const owner = occupied.get(cellKey(next));
      if (!owner || owner.id === snakeId) count += 1;
    }
    return count;
  }

  function wallDistanceScore(cell, board) {
    if (!insideBoard(cell, board)) return -100;
    return Math.min(cell.x, cell.y, board.cols - 1 - cell.x, board.rows - 1 - cell.y);
  }

  function ownTrailAdjacency(target, snake) {
    let count = 0;
    for (let index = 3; index < snake.cells.length; index += 1) {
      const cell = snake.cells[index];
      const distance = Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y);
      if (distance === 1) count += 1;
      if (count >= 3) return count;
    }
    return count;
  }

  function combineSnakes(group, board, nextId) {
    const primary = group.slice().sort((a, b) => b.cells.length - a.cells.length)[0];
    const colors = swizzleColors(group.flatMap((snake) => snake.colors));
    const cells = stitchCells(group, board).slice(0, MAX_SNAKE_LENGTH);
    return {
      id: primary.id || nextId,
      cells,
      direction: directionFromTrail(cells, primary.direction),
      colors,
      growthEvery: Math.max(4, Math.min(...group.map((snake) => snake.growthEvery || 6))),
      phase: primary.phase || 0,
      turnBias: primary.turnBias || 1,
      loopiness: Math.max(...group.map((snake) => snake.loopiness || 0.85)),
    };
  }

  function stitchCells(group, board) {
    const cells = [];
    const seen = new Set();
    for (const snake of group) {
      for (const cell of snake.cells) {
        const key = cellKey(cell);
        if (seen.has(key) || !insideBoard(cell, board)) continue;
        seen.add(key);
        cells.push({ x: cell.x, y: cell.y });
      }
    }
    return cells.length ? cells : [{ x: Math.floor(board.cols / 2), y: Math.floor(board.rows / 2) }];
  }

  function swizzleColors(colors) {
    const unique = [];
    for (const color of colors) {
      if (!unique.includes(color)) unique.push(color);
    }
    const fallback = unique.length ? unique : [PASTEL_RAINBOW[0]];
    const swizzled = [];
    const half = Math.ceil(fallback.length / 2);
    for (let i = 0; i < half; i += 1) {
      swizzled.push(fallback[i % fallback.length]);
      if (fallback[i + half]) swizzled.push(fallback[i + half]);
    }
    return swizzled.slice(0, 6);
  }

  function rotateColors(colors) {
    const source = colors.length ? colors : [PASTEL_RAINBOW[0]];
    return source.slice(1).concat(source[0]);
  }

  function shedCellsForSplit(cells) {
    const removable = Math.max(0, cells.length - MIN_SPLIT_LENGTH * 2);
    if (!removable) return cells;
    const loss = Math.min(removable, Math.max(2, Math.ceil(cells.length * 0.18)));
    const start = Math.max(MIN_SPLIT_LENGTH, Math.floor(cells.length * 0.62));
    return cells.slice(0, start).concat(cells.slice(start + loss));
  }

  function buildOccupancy(snakes) {
    const occupied = new Map();
    for (const snake of snakes) {
      const head = snake.cells[0];
      snake.cells.forEach((cell, index) => {
        occupied.set(cellKey(cell), { id: snake.id, index, head });
      });
    }
    return occupied;
  }

  function findParent(parent, id) {
    const next = parent.get(id);
    if (next === id || !parent.has(next)) return id;
    const root = findParent(parent, next);
    parent.set(id, root);
    return root;
  }

  function totalCellCount(snakes) {
    return snakes.reduce((sum, snake) => sum + snake.cells.length, 0);
  }

  function alphaForCell(index, length) {
    if (length <= 1) return 1;
    return 1 - index / (length - 1) * 0.9;
  }

  function colorWithAlpha(hex, alpha) {
    const value = String(hex || PASTEL_RAINBOW[0]).replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0.1, 1)})`;
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
    if (/model-load|model/.test(value)) return 0.42;
    if (/embed/.test(value)) return 0.56;
    if (/span-retrieval/.test(value)) return 0.68;
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

  return { createController };
});
