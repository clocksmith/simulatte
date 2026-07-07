(function attachSimulatteLoadingCanvasdrawing(root) {
  const scope = root.__SimulatteLoadingCanvasRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

    Object.assign(scope, {
      swizzleColors,
      visitedFromCells,
      markVisited,
      mergeVisited,
      buildOccupancy,
      headCellsBySnakeId,
      isDestructiveBodyCollision,
      isCrossableTail,
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
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
