(function attachSimulatteLoadingCanvas(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteLoadingCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLoadingCanvasApi(root) {
  const MIN_SNAKES = 2;
  const MAX_SNAKES = 10;
  const START_LENGTH = 7;
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
  const CROSSABLE_BODY_PORTION = 0.16;
  const HEAD_TO_HEAD_COLLISION_SHARE = 0.58;
  const HEAD_TO_BODY_COLLISION_SHARE = 0.46;
  const HEAD_TO_HEAD_TARGET_BONUS = 13;
  const HEAD_TO_BODY_TARGET_BONUS = 10;
  const RECT_STRAIGHT_MIN = 3;
  const RECT_STRAIGHT_MAX = 8;
  const RECT_STRAIGHT_BONUS = 6.4;
  const RECT_TURN_BONUS = 2.1;
  const STEP_MS = 260;
  const MIN_STEP_MS = 150;
  const STAGE_SPEEDUP_MS = 40;
  const FADE_MS = 160;
  const MIN_TAIL_ALPHA = 0.3;
  const GHOST_ALPHA = 0.28;
  const RAIL_HEIGHT_PX = 8;
  const RAIL_MARGIN_PX = 28;
  const RAIL_MIN_WIDTH_PX = 190;
  const RAIL_MAX_WIDTH_PORTION = 0.58;
  const RAIL_TILE_GAP_PX = 3;
  const RAIL_MIN_TILE_PX = 5;
  const RAIL_SWEEP_CYCLE_MS = 5000;
  const RAIL_SWEEP_TRAIL = 0.28;
  const RAIL_SWEEP_DOMAIN = 1.8;
  const RAIL_SWEEP_OFFSET = -0.4;
  const RAIL_SWEEP_B_OFFSET = 0.1;
  const RAIL_SWEEP_C_OFFSET = 0.5;
  const RAIL_TRAIL_DECAY_EXP = 2.6;
  const RAIL_TRAIL_NOISE = 0.3;
  const RAIL_FILLED_GHOST_ALPHA = 0.18;
  const RAIL_UNFILLED_GHOST_ALPHA = 0.035;
  const RAIL_INDETERMINATE_GHOST_ALPHA = 0.06;
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
      this.indeterminate = false;
      this.heartbeat = false;
      this.lastStepAt = 0;
      this.tick = 0;
      this.lastSizeKey = '';
      this.board = null;
      this.snakes = [];
      this.nextSnakeId = 1;
      this.rng = createRng(0x51a7e5);
      this.canvas.dataset.renderer = 'multi-snake-loading-canvas';
      this.canvas.dataset.loadingStyle = 'pastel-rainbow-determinate-cell-sweep';
      this.canvas.hidden = true;
    }

    setLoading(active, percent, stage, options = {}) {
      const nextActive = Boolean(active);
      this.progress = clamp(Number(percent || 0) / 100, 0, 1);
      this.stageCode = stageCode(stage);
      this.indeterminate = Boolean(options.indeterminate);
      this.heartbeat = Boolean(options.heartbeat);
      this.canvas.dataset.progress = String(Math.trunc(this.progress * 100 + 0.5));
      this.canvas.dataset.stage = String(stage || '');
      this.canvas.dataset.progressMode = this.indeterminate ? 'indeterminate' : 'determinate';
      this.canvas.dataset.heartbeat = this.heartbeat ? 'true' : 'false';
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
      const speed = Math.max(MIN_STEP_MS, STEP_MS - this.stageCode * STAGE_SPEEDUP_MS);
      if (!this.lastStepAt || now - this.lastStepAt >= speed) {
        this.advanceSwarm(now, speed);
        this.lastStepAt = now;
      }
      this.draw(now);
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
      const target = this.targetSnakeCount();
      while (this.snakes.length < target) {
        this.spawnSnake(this.spawnLength());
      }
    }

    targetDensity() {
      const progress = clamp(Number(this.progress || 0), 0, 1);
      const stage = clamp(Number(this.stageCode || 0), 0, 1);
      const source = this.indeterminate
        ? Math.max(progress, stage * 0.8)
        : Math.max(progress, stage * 0.35);
      return Math.pow(clamp(source, 0, 1), 0.85);
    }

    targetSnakeCount() {
      return Math.max(
        MIN_SNAKES,
        Math.round(MIN_SNAKES + this.targetDensity() * (MAX_SNAKES - MIN_SNAKES))
      );
    }

    targetSnakeLength() {
      return Math.round(START_LENGTH + this.targetDensity() * (MAX_SNAKE_LENGTH - START_LENGTH));
    }

    spawnLength() {
      const span = 2 + Math.floor(this.targetDensity() * 5);
      return START_LENGTH + Math.floor(this.rng() * Math.max(1, span));
    }

    spawnSnake(length = START_LENGTH) {
      if (!this.board || this.snakes.length >= MAX_SNAKES) return false;
      const occupied = buildOccupancy(this.snakes);
      for (let attempt = 0; attempt < 240; attempt += 1) {
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
        return this.addSnake(cells, direction);
      }
      for (const direction of DIRECTIONS) {
        for (let y = 1; y < this.board.rows - 1; y += 1) {
          for (let x = 1; x < this.board.cols - 1; x += 1) {
            const cells = spawnCellsAt(x, y, direction, length, this.board, occupied);
            if (cells.length) return this.addSnake(cells, direction);
          }
        }
      }
      return false;
    }

    addSnake(cells, direction) {
      const snake = {
        id: this.nextSnakeId++,
        cells,
        direction,
        colors: [ROYGBIV_SPECTRUM[Math.floor(this.rng() * ROYGBIV_SPECTRUM.length)]],
        growthEvery: 4 + Math.floor(this.rng() * 5),
        phase: Math.floor(this.rng() * 17),
        turnBias: this.rng() < 0.5 ? -1 : 1,
        loopiness: 0.72 + this.rng() * 0.38,
        straightRunLeft: rectangularRunLength(this.rng),
        rectangularity: 0.72 + this.rng() * 0.28,
        visited: visitedFromCells(cells),
      };
      primeSnakeAnimation(snake, cells, cells, 0, STEP_MS);
      this.snakes.push(snake);
      return true;
    }

    advanceSwarm(now, speed) {
      if (!this.board) return;
      this.tick += 1;
      this.enforcePopulation();
      const density = this.targetDensity();
      const targetLength = this.targetSnakeLength();
      const drawFromById = new Map(this.snakes.map((snake) => [
        snake.id,
        cloneCells(snake.drawTo || snake.cells),
      ]));
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
        const previousHead = snake.cells[0];
        const previousDirection = snake.direction;
        const target = insideBoard(plan.target, this.board)
          ? plan.target
          : addCells(snake.cells[0], invertDirection(snake.direction));
        plan.actualTarget = target;
        const nextDirection = insideBoard(target, this.board)
          ? directionFromCells(previousHead, target)
          : previousDirection;
        snake.direction = nextDirection;
        snake.cells.unshift(target);
        markVisited(snake, target);
        updateRectangularCadence(snake, previousDirection, nextDirection, this.rng);
        const canGrow = snake.cells.length < targetLength;
        const growing = canGrow && (
          snake.cells.length < START_LENGTH ||
          (this.tick + snake.phase) % snake.growthEvery === 0 ||
          density > 0.68 && (this.tick + snake.phase) % 3 === 0
        );
        if (!growing) snake.cells.pop();
        if (snake.cells.length > targetLength) snake.cells.length = targetLength;
        if (snake.cells.length > MAX_SNAKE_LENGTH) snake.cells.length = MAX_SNAKE_LENGTH;
      }

      this.resolveCollisionPlans(plans, occupiedBefore, drawFromById);
      this.enforcePopulation();
      for (const snake of this.snakes) {
        primeSnakeAnimation(
          snake,
          drawFromById.get(snake.id) || snake.drawTo || snake.cells,
          snake.cells,
          now,
          speed
        );
      }
    }

    enforcePopulation() {
      const target = this.targetSnakeCount();
      while (this.snakes.length < target) {
        if (!this.spawnSnake(this.spawnLength())) break;
      }
      if (this.snakes.length > MAX_SNAKES) {
        this.snakes.sort((a, b) => b.cells.length - a.cells.length);
        this.snakes.length = MAX_SNAKES;
      }
    }

    resolveCollisionPlans(plans, occupiedBefore, drawFromById) {
      const parent = new Map(this.snakes.map((snake) => [snake.id, snake.id]));
      const union = (a, b) => {
        if (!parent.has(a) || !parent.has(b)) return;
        const rootA = findParent(parent, a);
        const rootB = findParent(parent, b);
        if (rootA !== rootB) parent.set(rootB, rootA);
      };

      const activeBefore = new Map(this.snakes.map((snake) => [snake.id, snake]));
      const plansById = new Map(plans.map((plan) => [plan.snake.id, plan]));
      const oldHeadsById = headCellsBySnakeId(occupiedBefore);
      const headTargets = new Map();
      for (const plan of plans) {
        if (!activeBefore.has(plan.snake.id)) continue;
        const targetKey = cellKey(plan.actualTarget || plan.target);
        const oldOwner = occupiedBefore.get(targetKey);
        if (oldOwner && oldOwner.id !== plan.snake.id && oldOwner.index === 0) {
          union(plan.snake.id, oldOwner.id);
        }
        const sameTarget = headTargets.get(targetKey);
        if (sameTarget && sameTarget !== plan.snake.id) union(plan.snake.id, sameTarget);
        headTargets.set(targetKey, plan.snake.id);
      }

      const ids = Array.from(activeBefore.keys());
      for (let a = 0; a < ids.length; a += 1) {
        for (let b = a + 1; b < ids.length; b += 1) {
          const idA = ids[a];
          const idB = ids[b];
          const planA = plansById.get(idA);
          const planB = plansById.get(idB);
          const oldHeadA = oldHeadsById.get(idA);
          const oldHeadB = oldHeadsById.get(idB);
          if (!planA || !planB || !oldHeadA || !oldHeadB) continue;
          const targetA = planA.actualTarget || planA.target;
          const targetB = planB.actualTarget || planB.target;
          if (sameCell(targetA, oldHeadB) && sameCell(targetB, oldHeadA)) {
            union(idA, idB);
          }
        }
      }

      const groups = new Map();
      for (const snake of this.snakes) {
        const rootId = findParent(parent, snake.id);
        if (!groups.has(rootId)) groups.set(rootId, []);
        groups.get(rootId).push(snake);
      }

      const merged = [];
      const headMergedIds = new Set();
      for (const group of groups.values()) {
        if (group.length === 1) {
          merged.push(group[0]);
          continue;
        }
        group.forEach((snake) => headMergedIds.add(snake.id));
        merged.push(combineSnakes(group, this.board, this.nextSnakeId++, drawFromById));
      }
      this.snakes = merged.slice(0, MAX_SNAKES);

      const activeAfterMerge = new Map(this.snakes.map((snake) => [snake.id, snake]));
      const absorbedIds = new Set();
      for (const plan of plans) {
        if (headMergedIds.has(plan.snake.id) || absorbedIds.has(plan.snake.id)) continue;
        const attacker = activeAfterMerge.get(plan.snake.id);
        if (!attacker) continue;
        const owner = occupiedBefore.get(cellKey(plan.actualTarget || plan.target));
        if (owner && headMergedIds.has(owner.id)) continue;
        if (!isDestructiveBodyCollision(owner, attacker.id)) continue;
        const victim = activeAfterMerge.get(owner.id);
        if (!victim || victim.id === attacker.id || absorbedIds.has(victim.id)) continue;
        absorbSnake(attacker, victim, this.board, drawFromById);
        absorbedIds.add(victim.id);
        activeAfterMerge.delete(victim.id);
      }
      this.snakes = this.snakes.filter((snake) => !absorbedIds.has(snake.id)).slice(0, MAX_SNAKES);
    }

    clear() {
      if (!this.ctx) return;
      this.ctx.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
    }

    draw(now) {
      const ctx = this.ctx;
      if (!ctx || !this.board) return;
      const width = this.canvas.width;
      const height = this.canvas.height;
      if (!width || !height) return;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      drawGrid(ctx, this.board, width, height);
      for (const snake of this.snakes) {
        drawSnake(ctx, this.board, snake, now);
      }
      drawProgressRail(ctx, width, height, this.progress, this.indeterminate, now, this.stageCode);
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

  function spawnCellsAt(x, y, direction, length, board, occupied) {
    const cells = [];
    for (let i = 0; i < length; i += 1) {
      const cell = { x: x - direction.x * i, y: y - direction.y * i };
      if (!insideBoard(cell, board) || occupied.has(cellKey(cell))) return [];
      cells.push(cell);
    }
    return cells;
  }

  function drawGrid(ctx, board, width, height) {
    const wash = ctx.createLinearGradient(0, 0, width, height);
    ROYGBIV_SPECTRUM.forEach((color, index) => {
      wash.addColorStop(index / Math.max(1, ROYGBIV_SPECTRUM.length - 1), color);
    });
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(132, 120, 154, 0.18)';
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

  function drawSnake(ctx, board, snake, now) {
    const cell = board.cell;
    const fromCells = snake.drawFrom || snake.cells;
    const toCells = snake.drawTo || snake.cells;
    const fromLength = Number(snake.drawFromLength || fromCells.length);
    const raw = snake.stepMs ? (now - (snake.stepStartedAt || 0)) / snake.stepMs : 1;
    const progress = clamp(raw, 0, 1);
    const motion = easeOutCubic(progress);
    const fade = easeInFastOut(progress);
    for (let index = fromLength - 1; index >= toCells.length; index -= 1) {
      const color = snake.colors[index % snake.colors.length];
      drawTile(ctx, board, fromCells[index], color, alphaForCell(index, fromCells.length) * (1 - fade) * GHOST_ALPHA);
    }
    for (let index = toCells.length - 1; index >= 0; index -= 1) {
      const target = toCells[index];
      const source = fromCells[index] || fromCells[index - 1] || fromCells[fromCells.length - 1] || target;
      const part = lerpCell(source, target, motion);
      const color = snake.colors[index % snake.colors.length];
      const appears = index < fromLength ? 1 : fade;
      drawTile(ctx, board, part, color, alphaForCell(index, toCells.length) * appears, {
        head: index === 0,
      });
    }
  }

  function drawTile(ctx, board, part, color, alpha, options = {}) {
    if (!part || alpha <= 0.01) return;
    const cell = board.cell;
    const inset = Math.max(2, Math.round(cell * (options.head ? 0.08 : 0.12)));
    const x = part.x * cell + inset;
    const y = part.y * cell + inset;
    const size = cell - inset * 2;
    ctx.shadowColor = colorWithAlpha(color, alpha * (options.head ? 0.42 : 0.22));
    ctx.shadowBlur = options.head ? 14 : 6;
    ctx.fillStyle = colorWithAlpha(color, alpha);
    ctx.fillRect(x, y, size, size);
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 255, 255, ${clamp(alpha * 0.24, 0, 0.42)})`;
    ctx.fillRect(x + 1, y + 1, Math.max(1, size - 2), Math.max(1, Math.round(size * 0.22)));
  }

  function drawProgressRail(ctx, width, height, progress, indeterminate, now, stage) {
    const available = Math.max(RAIL_MIN_WIDTH_PX, width - RAIL_MARGIN_PX * 2);
    const railWidth = Math.min(available, Math.max(RAIL_MIN_WIDTH_PX, width * RAIL_MAX_WIDTH_PORTION));
    const x = Math.max(RAIL_MARGIN_PX, (width - railWidth) * 0.5);
    const y = Math.max(RAIL_MARGIN_PX, height - RAIL_MARGIN_PX - RAIL_HEIGHT_PX);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.74)';
    ctx.fillRect(x, y, railWidth, RAIL_HEIGHT_PX);
    ctx.fillStyle = 'rgba(132, 120, 154, 0.18)';
    ctx.fillRect(x, y, railWidth, 1);
    drawDeterministicRailTiles(ctx, x, y, railWidth, RAIL_HEIGHT_PX, progress, indeterminate, now, stage);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.18 + clamp(stage, 0, 1) * 0.18})`;
    ctx.fillRect(x, y, railWidth, 2);
  }

  function drawDeterministicRailTiles(ctx, x, y, width, height, progress, indeterminate, now, stage) {
    const rawCols = Math.floor((width + RAIL_TILE_GAP_PX) / (RAIL_MIN_TILE_PX + RAIL_TILE_GAP_PX));
    const cols = Math.max(24, rawCols);
    const tileWidth = Math.max(2, (width - RAIL_TILE_GAP_PX * (cols - 1)) / cols);
    const motionSpeed = 1 + clamp(stage, 0, 1) * 0.46;
    const cycle = Math.max(1200, RAIL_SWEEP_CYCLE_MS / motionSpeed);
    const phaseA = normalizedPhase(now, cycle, 0);
    const phaseB = normalizedPhase(now, cycle, RAIL_SWEEP_B_OFFSET);
    const phaseC = normalizedPhase(now, cycle, RAIL_SWEEP_C_OFFSET);
    const posA = RAIL_SWEEP_OFFSET + easeInOutQuad(phaseA) * RAIL_SWEEP_DOMAIN;
    const posB = RAIL_SWEEP_OFFSET + easeInOutQuint(phaseB) * RAIL_SWEEP_DOMAIN;
    const posC = RAIL_SWEEP_OFFSET + easeInOutQuad(phaseC) * RAIL_SWEEP_DOMAIN;
    const fillEdge = clamp(progress, 0, 1);
    for (let index = 0; index < cols; index += 1) {
      const tileProgress = cols === 1 ? 1 : index / (cols - 1);
      const filled = indeterminate || tileProgress <= fillEdge;
      const baseAlpha = indeterminate
        ? RAIL_INDETERMINATE_GHOST_ALPHA
        : filled ? RAIL_FILLED_GHOST_ALPHA : RAIL_UNFILLED_GHOST_ALPHA;
      const noise = tileNoise(index) * RAIL_TRAIL_NOISE;
      const trailAlpha = filled
        ? Math.max(
          railTrailAlpha(posA, tileProgress, noise),
          railTrailAlpha(posB, tileProgress, noise),
          railTrailAlpha(posC, tileProgress, noise)
        )
        : 0;
      const alpha = clamp(Math.max(baseAlpha, trailAlpha), 0, 1);
      if (alpha <= 0.005) continue;
      const color = ROYGBIV_SPECTRUM[index % ROYGBIV_SPECTRUM.length];
      ctx.fillStyle = colorWithAlpha(color, alpha);
      ctx.fillRect(x + index * (tileWidth + RAIL_TILE_GAP_PX), y, tileWidth, height);
    }
  }

  function railTrailAlpha(position, tileProgress, noise) {
    const distance = position - tileProgress;
    if (distance < 0 || distance > RAIL_SWEEP_TRAIL) return 0;
    const normalized = distance / RAIL_SWEEP_TRAIL;
    return clamp(
      Math.pow(1 - normalized, RAIL_TRAIL_DECAY_EXP) +
        Math.sin(normalized * Math.PI) * noise,
      0,
      1
    );
  }

  function normalizedPhase(now, cycle, offset) {
    return (((Number(now || 0) / cycle) - offset) % 1 + 1) % 1;
  }

  function tileNoise(index) {
    const x = Math.sin((index + 1) * 12.9898) * 43758.5453;
    return x - Math.floor(x) - 0.5;
  }

  function easeInOutQuad(value) {
    const t = clamp(value, 0, 1);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function easeInOutQuint(value) {
    const t = clamp(value, 0, 1);
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  }

  function chooseDirection(snake, board, occupied, rng) {
    const current = snake.direction;
    const wantsHeadToHead = rng() < HEAD_TO_HEAD_COLLISION_SHARE;
    const wantsBodyMerge = rng() < HEAD_TO_BODY_COLLISION_SHARE;
    const straightRunLeft = Math.max(0, Number(snake.straightRunLeft || 0));
    const rectangularity = clamp(Number(snake.rectangularity || 0.82), 0.4, 1.2);
    let best = current;
    let bestScore = -Infinity;
    for (const direction of DIRECTIONS) {
      const target = addCells(snake.cells[0], direction);
      let score = rng() * 0.5;
      if (!insideBoard(target, board)) score -= 1000;
      const preferredTurn = turnDirection(current, snake.turnBias || 1);
      const oppositeTurn = turnDirection(current, -(snake.turnBias || 1));
      if (sameDirection(direction, current)) {
        score += 1.1 + straightRunLeft * RECT_STRAIGHT_BONUS * rectangularity;
      }
      if (sameDirection(direction, preferredTurn)) {
        const turnBonus = straightRunLeft > 0 ? RECT_TURN_BONUS : LOOP_TURN_BONUS;
        score += turnBonus * (snake.loopiness || 0.85);
      }
      if (sameDirection(direction, oppositeTurn)) {
        const turnBonus = straightRunLeft > 0 ? RECT_TURN_BONUS * 0.45 : LOOP_TURN_BONUS * 0.22;
        score += turnBonus;
      }
      if (sameDirection(direction, invertDirection(current))) score -= 7;
      score += openNeighborCount(target, board, occupied) * 0.7;
      score += openAreaScore(target, board, occupied) * OPEN_AREA_BONUS;
      score += visitedCellScore(target, snake);
      score -= ownTrailAdjacency(target, snake) * RECENT_TRAIL_PENALTY;
      score += wallDistanceScore(target, board) * 0.18;
      const owner = occupied.get(cellKey(target));
      if (owner && owner.id === snake.id && !isCrossableTail(owner)) score -= 900;
      if (owner && owner.id === snake.id && isCrossableTail(owner)) score += 0.8;
      if (owner && owner.id !== snake.id) {
        if (owner.index === 0) {
          score += wantsHeadToHead ? HEAD_TO_HEAD_TARGET_BONUS : HEAD_TO_HEAD_TARGET_BONUS * 0.3;
        } else if (isCrossableTail(owner)) {
          score += 1.2;
        } else {
          score += wantsBodyMerge ? HEAD_TO_BODY_TARGET_BONUS : -3.5;
        }
      }
      const headPressure = nearbyHeadPressure(target, snake, occupied);
      score += wantsHeadToHead ? headPressure * 1.2 : -headPressure * 0.35;
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

  function openNeighborCount(cell, board, occupied) {
    let count = 0;
    for (const direction of DIRECTIONS) {
      const next = addCells(cell, direction);
      if (!insideBoard(next, board)) continue;
      const owner = occupied.get(cellKey(next));
      if (!owner || isCrossableTail(owner)) count += 1;
    }
    return count;
  }

  function openAreaScore(cell, board, occupied) {
    if (!insideBoard(cell, board)) return -100;
    const seen = new Set([cellKey(cell)]);
    const queue = [{ cell, depth: 0 }];
    let score = 0;
    while (queue.length) {
      const item = queue.shift();
      const owner = occupied.get(cellKey(item.cell));
      if (owner && !isCrossableTail(owner)) continue;
      score += 1 / (item.depth + 1);
      if (item.depth >= 4) continue;
      for (const direction of DIRECTIONS) {
        const next = addCells(item.cell, direction);
        const key = cellKey(next);
        if (!insideBoard(next, board) || seen.has(key)) continue;
        seen.add(key);
        queue.push({ cell: next, depth: item.depth + 1 });
      }
    }
    return score;
  }

  function visitedCellScore(target, snake) {
    if (!snake || !snake.visited || !snake.visited.has(cellKey(target))) return NOVEL_CELL_BONUS;
    return -VISITED_CELL_PENALTY;
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

  function updateRectangularCadence(snake, previousDirection, nextDirection, rng) {
    if (!snake) return;
    if (sameDirection(previousDirection, nextDirection)) {
      snake.straightRunLeft = Math.max(0, Number(snake.straightRunLeft || 0) - 1);
      return;
    }
    snake.straightRunLeft = rectangularRunLength(rng);
    snake.turnBias = snake.turnBias === 1 ? -1 : 1;
  }

  function rectangularRunLength(rng) {
    const random = typeof rng === 'function' ? rng() : 0.5;
    return RECT_STRAIGHT_MIN + Math.floor(random * (RECT_STRAIGHT_MAX - RECT_STRAIGHT_MIN + 1));
  }

  function combineSnakes(group, board, nextId, drawFromById) {
    const primary = group.slice().sort((a, b) => b.cells.length - a.cells.length)[0];
    const colors = swizzleColors(group.flatMap((snake) => snake.colors));
    const cells = stitchCells(group, board).slice(0, MAX_SNAKE_LENGTH);
    const id = primary.id || nextId;
    const fromCells = stitchCellRows(
      group.map((snake) => drawFromById.get(snake.id) || snake.drawTo || snake.cells),
      board
    ).slice(0, MAX_SNAKE_LENGTH);
    drawFromById.set(id, alignCells(fromCells, cells));
    return {
      id,
      cells,
      direction: directionFromTrail(cells, primary.direction),
      colors,
      growthEvery: Math.max(4, Math.min(...group.map((snake) => snake.growthEvery || 6))),
      phase: primary.phase || 0,
      turnBias: primary.turnBias || 1,
      loopiness: Math.max(...group.map((snake) => snake.loopiness || 0.85)),
      straightRunLeft: Math.max(...group.map((snake) => Number(snake.straightRunLeft || 0))),
      rectangularity: Math.max(...group.map((snake) => Number(snake.rectangularity || 0.82))),
      visited: mergeVisited(group),
    };
  }

  function absorbSnake(attacker, victim, board, drawFromById) {
    const cells = stitchCellRows([attacker.cells, victim.cells], board).slice(0, MAX_SNAKE_LENGTH);
    const fromCells = stitchCellRows([
      drawFromById.get(attacker.id) || attacker.drawTo || attacker.cells,
      drawFromById.get(victim.id) || victim.drawTo || victim.cells,
    ], board).slice(0, MAX_SNAKE_LENGTH);
    attacker.cells = cells;
    attacker.direction = directionFromTrail(cells, attacker.direction);
    attacker.colors = swizzleColors(attacker.colors.concat(victim.colors));
    attacker.growthEvery = Math.max(3, Math.min(attacker.growthEvery || 6, victim.growthEvery || 6));
    attacker.loopiness = Math.max(attacker.loopiness || 0.85, victim.loopiness || 0.85);
    attacker.straightRunLeft = Math.max(
      Number(attacker.straightRunLeft || 0),
      Number(victim.straightRunLeft || 0),
      RECT_STRAIGHT_MIN
    );
    attacker.rectangularity = Math.max(
      Number(attacker.rectangularity || 0.82),
      Number(victim.rectangularity || 0.82)
    );
    attacker.visited = mergeVisited([attacker, victim]);
    drawFromById.set(attacker.id, alignCells(fromCells, cells));
  }

  function stitchCells(group, board) {
    return stitchCellRows(group.map((snake) => snake.cells), board);
  }

  function stitchCellRows(rows, board) {
    const cells = [];
    const seen = new Set();
    for (const row of rows) {
      for (const cell of row || []) {
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
    return Boolean(owner && owner.id !== snakeId && owner.index > 0 && !isCrossableTail(owner));
  }

  function isCrossableTail(owner) {
    if (!owner || owner.index === 0 || owner.length <= 1) return false;
    return owner.index >= Math.ceil(owner.length * (1 - CROSSABLE_BODY_PORTION));
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

  return { createController };
});
