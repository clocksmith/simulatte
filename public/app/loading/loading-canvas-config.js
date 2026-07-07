(function attachSimulatteLoadingCanvasconfig(root) {
  const scope = root.__SimulatteLoadingCanvasRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

    const SPIRAL_SPAWN_ATTEMPTS = 180;

    const STEP_MS = 260;

    const MIN_STEP_MS = 150;

    const STAGE_SPEEDUP_MS = 40;

    const FADE_MS = 160;

    const SEGMENT_FADE_MS = 180;

    const SEGMENT_STAGGER_MS = 34;

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

    Object.assign(scope, {
      MIN_SNAKES,
      MAX_SNAKES,
      START_LENGTH,
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
      MIN_STEP_MS,
      STAGE_SPEEDUP_MS,
      FADE_MS,
      SEGMENT_FADE_MS,
      SEGMENT_STAGGER_MS,
      MIN_TAIL_ALPHA,
      GHOST_ALPHA,
      RAIL_HEIGHT_PX,
      RAIL_MARGIN_PX,
      RAIL_MIN_WIDTH_PX,
      RAIL_MAX_WIDTH_PORTION,
      RAIL_TILE_GAP_PX,
      RAIL_MIN_TILE_PX,
      RAIL_SWEEP_CYCLE_MS,
      RAIL_SWEEP_TRAIL,
      RAIL_SWEEP_DOMAIN,
      RAIL_SWEEP_OFFSET,
      RAIL_SWEEP_B_OFFSET,
      RAIL_SWEEP_C_OFFSET,
      RAIL_TRAIL_DECAY_EXP,
      RAIL_TRAIL_NOISE,
      RAIL_FILLED_GHOST_ALPHA,
      RAIL_UNFILLED_GHOST_ALPHA,
      RAIL_INDETERMINATE_GHOST_ALPHA,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
