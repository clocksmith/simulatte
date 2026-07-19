(function attachSimulatteLoadingCanvas(root, factory) {
  const support = typeof module === 'object' && module.exports
    ? require('./loading-canvas-support.js')
    : root.SimulatteLoadingCanvasSupport;
  const api = factory(support, root);
  root.SimulatteLoadingCanvas = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLoadingCanvas(support, root) {
  if (!support) {
    throw new Error('SimulatteLoadingCanvas requires loading-canvas-support.js to load first.');
  }
  const {
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
  } = support;

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
      this.exitSnakes = [];
      this.nextSnakeId = 1;
      this.frameNow = 0;
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
      this.frameNow = Number(now || 0);
      this.resize();
      const speed = this.targetStepMs();
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
      this.exitSnakes = [];
      this.nextSnakeId = 1;
      if (!this.board) return;
      const target = this.targetSnakeCount();
      while (this.snakes.length < target) {
        this.spawnSnake(this.spawnLength(), this.frameNow);
      }
    }

    targetDensity() {
      const progress = clamp(Number(this.progress || 0), 0, 1);
      const stage = clamp(Number(this.stageCode || 0), 0, 1);
      const source = this.indeterminate
        ? Math.max(progress, stage * 0.8)
        : progress;
      return Math.pow(clamp(source, 0, 1), 0.85);
    }

    targetSpeedMultiplier() {
      const progress = clamp(Number(this.progress || 0), 0, 1);
      const stage = clamp(Number(this.stageCode || 0), 0, 1);
      const source = this.indeterminate ? Math.max(progress, stage) : progress;
      return MIN_SPEED_MULTIPLIER +
        clamp(source, 0, 1) * (MAX_SPEED_MULTIPLIER - MIN_SPEED_MULTIPLIER);
    }

    targetStepMs() {
      return STEP_MS / this.targetSpeedMultiplier();
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

    spawnSnake(length = START_LENGTH, now = this.frameNow) {
      if (!this.board || this.snakes.length >= MAX_SNAKES) return false;
      const occupied = buildOccupancy(this.snakes);
      for (let attempt = 0; attempt < SPIRAL_SPAWN_ATTEMPTS; attempt += 1) {
        const direction = DIRECTIONS[Math.floor(this.rng() * DIRECTIONS.length)];
        const x = 2 + Math.floor(this.rng() * Math.max(1, this.board.cols - 4));
        const y = 2 + Math.floor(this.rng() * Math.max(1, this.board.rows - 4));
        const cells = spawnSpiralCellsAt(x, y, direction, length, this.board, occupied);
        if (!cells.length) continue;
        return this.addSnake(cells, directionFromTrail(cells, direction), now);
      }
      for (const direction of DIRECTIONS) {
        for (let y = 1; y < this.board.rows - 1; y += 1) {
          for (let x = 1; x < this.board.cols - 1; x += 1) {
            const cells = spawnCellsAt(x, y, direction, length, this.board, occupied);
            if (cells.length) return this.addSnake(cells, direction, now);
          }
        }
      }
      return false;
    }

    addSnake(cells, direction, now = this.frameNow) {
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
        enterStartedAt: Number(now || 0),
      };
      primeSnakeAnimation(snake, cells, cells, 0, STEP_MS);
      this.snakes.push(snake);
      return true;
    }

    advanceSwarm(now, speed) {
      if (!this.board) return;
      this.frameNow = Number(now || 0);
      this.tick += 1;
      this.enforcePopulation(now);
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
          stalled: !direction,
          target: direction ? addCells(snake.cells[0], direction) : { ...snake.cells[0] },
        };
      });

      for (const plan of plans) {
        const snake = plan.snake;
        if (!this.snakes.includes(snake)) continue;
        if (plan.stalled) continue;
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
      this.enforcePopulation(now);
      for (const snake of this.snakes) {
        primeSnakeAnimation(
          snake,
          drawFromById.get(snake.id) || snake.drawTo || snake.cells,
          snake.cells,
          now,
          speed
        );
      }
      this.pruneExitSnakes(now);
    }

    enforcePopulation(now = this.frameNow) {
      const target = this.targetSnakeCount();
      while (this.snakes.length < target) {
        const length = this.spawnLength();
        if (!this.spawnSnake(length, now) &&
          !this.spawnSnake(START_LENGTH, now) &&
          !this.spawnSnake(MIN_SPAWN_LENGTH, now)) {
          break;
        }
      }
      if (this.snakes.length > target) {
        this.snakes.sort((a, b) => b.cells.length - a.cells.length);
        const removed = this.snakes.splice(target);
        removed.forEach((snake) => this.queueExitSnake(snake, now));
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
        this.queueExitSnake(victim, this.frameNow);
        absorbedIds.add(victim.id);
        activeAfterMerge.delete(victim.id);
      }
      this.snakes = this.snakes.filter((snake) => !absorbedIds.has(snake.id)).slice(0, MAX_SNAKES);
    }

    queueExitSnake(snake, now = this.frameNow) {
      if (!snake || !snake.cells || !snake.cells.length) return;
      this.exitSnakes.push({
        id: `exit:${snake.id}:${Math.round(Number(now || 0))}`,
        cells: cloneCells(snake.drawTo || snake.cells),
        colors: Array.isArray(snake.colors) && snake.colors.length ? snake.colors.slice() : [ROYGBIV_SPECTRUM[0]],
        exitStartedAt: Number(now || 0),
      });
      this.pruneExitSnakes(now);
    }

    pruneExitSnakes(now = this.frameNow) {
      this.exitSnakes = (this.exitSnakes || []).filter((snake) => !exitSnakeComplete(snake, now));
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
      this.pruneExitSnakes(now);
      for (const snake of this.exitSnakes) {
        drawExitSnake(ctx, this.board, snake, now);
      }
      for (const snake of this.snakes) {
        drawSnake(ctx, this.board, snake, now);
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

  function spawnCellsAt(x, y, direction, length, board, occupied) {
    const cells = [];
    for (let i = 0; i < length; i += 1) {
      const cell = { x: x - direction.x * i, y: y - direction.y * i };
      if (!insideBoard(cell, board) || occupied.has(cellKey(cell))) return [];
      cells.push(cell);
    }
    return cells;
  }

  function spawnSpiralCellsAt(x, y, direction, length, board, occupied) {
    const cells = [{ x, y }];
    if (!insideBoard(cells[0], board) || occupied.has(cellKey(cells[0]))) return [];
    let cursor = { x, y };
    let walk = invertDirection(direction);
    let legLength = 1;
    while (cells.length < length) {
      for (let leg = 0; leg < 2 && cells.length < length; leg += 1) {
        for (let step = 0; step < legLength && cells.length < length; step += 1) {
          cursor = addCells(cursor, walk);
          if (!insideBoard(cursor, board) || occupied.has(cellKey(cursor))) return [];
          cells.push({ x: cursor.x, y: cursor.y });
        }
        walk = turnDirection(walk, 1);
      }
      legLength += 1;
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
      const appears = (index < fromLength ? 1 : fade) * segmentEnterAlpha(snake, index, now);
      drawTile(ctx, board, part, color, alphaForCell(index, toCells.length) * appears, {
        head: index === 0,
      });
    }
  }

  function drawExitSnake(ctx, board, snake, now) {
    const cells = snake.cells || [];
    for (let index = cells.length - 1; index >= 0; index -= 1) {
      const color = snake.colors[index % snake.colors.length];
      const alpha = alphaForCell(index, cells.length) * segmentExitAlpha(snake, index, cells.length, now) * GHOST_ALPHA;
      drawTile(ctx, board, cells[index], color, alpha);
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

  function chooseDirection(snake, board, occupied, rng) {
    const current = snake.direction;
    const wantsHeadToHead = rng() < HEAD_TO_HEAD_COLLISION_SHARE;
    const wantsBodyMerge = rng() < HEAD_TO_BODY_COLLISION_SHARE;
    const straightRunLeft = Math.max(0, Number(snake.straightRunLeft || 0));
    const rectangularity = clamp(Number(snake.rectangularity || 0.82), 0.4, 1.2);
    let best = null;
    let bestScore = -Infinity;
    for (const direction of DIRECTIONS) {
      const target = addCells(snake.cells[0], direction);
      if (!insideBoard(target, board)) continue;
      const owner = occupied.get(cellKey(target));
      if (owner && owner.id === snake.id) continue;
      let score = rng() * 0.5;
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
      if (owner && owner.id !== snake.id) {
        if (owner.index === 0) {
          score += wantsHeadToHead ? HEAD_TO_HEAD_TARGET_BONUS : HEAD_TO_HEAD_TARGET_BONUS * 0.3;
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
      if (!owner) count += 1;
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
      if (owner) continue;
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

  return { createController };
});
