/**
 * Game Engine
 * Main game loop and system coordination
 */

export class GameEngine {
  constructor({
    store,
    renderer,
    inputManager,
    zoneManager,
    seasonManager,
    timeManager,
    spawnManager,
    serviceManager,
    interactionManager,
    entityBehaviorManager
  }) {
    this.store = store;
    this.renderer = renderer;
    this.inputManager = inputManager;
    this.zoneManager = zoneManager;
    this.seasonManager = seasonManager;
    this.timeManager = timeManager;
    this.spawnManager = spawnManager;
    this.serviceManager = serviceManager;
    this.interactionManager = interactionManager;
    this.entityBehaviorManager = entityBehaviorManager;

    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedDeltaTime = 1000 / 60; // 60 FPS for physics/logic
    this.renderDeltaTime = 1000 / 60; // 60 FPS for rendering

    this.frameCount = 0;
    this.fpsUpdateTime = 0;
    this.currentFPS = 0;

    // Bind methods
    this.loop = this.loop.bind(this);
  }

  async initialize() {
    console.log('[GameEngine] Initializing...');

    // Initialize all systems
    await this.zoneManager.initialize();
    await this.seasonManager.initialize();
    await this.timeManager.initialize();
    await this.spawnManager.initialize();
    await this.serviceManager.initialize();

    console.log('[GameEngine] All systems initialized');
  }

  start() {
    if (this.running) return;

    console.log('[GameEngine] Starting game loop...');
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    console.log('[GameEngine] Stopping game loop...');
    this.running = false;
  }

  loop(currentTime) {
    if (!this.running) return;

    // Calculate delta time
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Update FPS counter
    this.updateFPS(currentTime, deltaTime);

    // Get current state
    const state = this.store.getState();

    // Fixed timestep updates for game logic
    if (!state.game.paused) {
      this.accumulator += deltaTime * state.game.speed;

      while (this.accumulator >= this.fixedDeltaTime) {
        this.fixedUpdate(this.fixedDeltaTime / 1000); // Convert to seconds
        this.accumulator -= this.fixedDeltaTime;
      }
    }

    // Render
    this.render();

    // Continue loop
    requestAnimationFrame(this.loop);
  }

  fixedUpdate(dt) {
    // Update game tick
    this.store.dispatch({ type: 'game:tick' });

    // Update time
    this.timeManager.update(dt);

    // Update season
    this.seasonManager.update(dt);

    // Update zones (spawn buildings/activities)
    this.zoneManager.update(dt);

    // Update spawn manager (spawn characters)
    this.spawnManager.update(dt);

    // Update entity behaviors (movement, AI)
    this.entityBehaviorManager.update(dt);

    // Update interaction manager (entity interactions)
    this.interactionManager.update(dt);

    // Update services
    this.serviceManager.update(dt);

    // Update resources (income/expenses)
    this.updateResources(dt);

    // Update stats
    this.updateStats(dt);
  }

  render() {
    const state = this.store.getState();
    this.renderer.render(state);
  }

  updateResources(dt) {
    const state = this.store.getState();

    // Calculate income from visitors
    const visitorIncome = state.entities.filter(e => e.type === 'visitor').length * 0.1;

    // Calculate expenses from services
    const serviceExpenses =
      state.services.lighting.coverage * 0.01 +
      state.services.security.coverage * 0.02 +
      state.services.maintenance.coverage * 0.015 +
      state.services.programs.coverage * 0.025;

    const totalIncome = visitorIncome;
    const totalExpenses = serviceExpenses;

    // Update every second (dt is per-frame, accumulate)
    if (!this.resourceAccumulator) this.resourceAccumulator = 0;
    this.resourceAccumulator += dt;

    if (this.resourceAccumulator >= 1.0) {
      this.store.dispatch({
        type: 'resources:update',
        payload: {
          income: totalIncome,
          expenses: totalExpenses,
          budget: state.resources.budget + totalIncome - totalExpenses
        }
      });
      this.resourceAccumulator = 0;
    }
  }

  updateStats(dt) {
    const state = this.store.getState();

    // Calculate visitor count
    const visitorCount = state.entities.filter(e => e.type === 'visitor').length;

    // Calculate happiness (based on services and cleanliness)
    const serviceCoverage = (
      state.services.lighting.coverage +
      state.services.security.coverage +
      state.services.maintenance.coverage +
      state.services.programs.coverage
    ) / 4;

    const happiness = Math.min(100, serviceCoverage * 0.5 + state.stats.cleanliness * 0.5);

    // Calculate safety (based on security service)
    const safety = Math.min(100, 50 + state.services.security.coverage * 0.5);

    // Cleanliness decreases over time, increased by maintenance
    let cleanliness = state.stats.cleanliness - dt * 0.1; // Decay
    cleanliness += state.services.maintenance.coverage * dt * 0.2; // Maintenance boost
    cleanliness = Math.max(0, Math.min(100, cleanliness));

    this.store.dispatch({
      type: 'stats:update',
      payload: {
        visitorCount,
        happiness: Math.floor(happiness),
        safety: Math.floor(safety),
        cleanliness: Math.floor(cleanliness)
      }
    });
  }

  updateFPS(currentTime, deltaTime) {
    this.frameCount++;
    this.fpsUpdateTime += deltaTime;

    if (this.fpsUpdateTime >= 1000) {
      this.currentFPS = this.frameCount;
      this.frameCount = 0;
      this.fpsUpdateTime = 0;
    }
  }

  getFPS() {
    return this.currentFPS;
  }

  destroy() {
    this.stop();
    this.inputManager.destroy();
    this.renderer.destroy();
  }
}
