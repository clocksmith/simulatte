(function attachSimulatteLoadingCanvasconfig(root) {
  const scope = root.__SimulatteLoadingCanvasRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

    const CROSSABLE_BODY_PORTION = 0.16;

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

    Object.assign(scope, {
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
      CROSSABLE_BODY_PORTION,
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
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
