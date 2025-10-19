/**
 * Entity Behavior Manager
 * Handles entity movement, pathfinding, and AI behaviors
 */

export class EntityBehaviorManager {
  constructor({ store }) {
    this.store = store;
  }

  async initialize() {
    console.log('[EntityBehaviorManager] Initialized');
  }

  update(dt) {
    const state = this.store.getState();

    // Update all mobile entities
    state.entities.forEach(entity => {
      // Skip stationary entities
      if (entity.stationary || entity.speed === 0 || entity.mobile === false) {
        return;
      }

      this.updateEntityMovement(entity, dt, state);
    });
  }

  updateEntityMovement(entity, dt, state) {
    // Calculate distance to target
    const dx = entity.targetX - entity.x;
    const dy = entity.targetY - entity.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If reached target (within 0.1 tiles), pick a new target
    if (distance < 0.1) {
      this.pickNewTarget(entity, state);
      return;
    }

    // Move towards target
    const speed = entity.speed || 1.0;
    const moveDistance = speed * dt;

    // Normalize direction and apply movement
    if (distance > 0) {
      const dirX = dx / distance;
      const dirY = dy / distance;

      const newX = entity.x + dirX * moveDistance;
      const newY = entity.y + dirY * moveDistance;

      // Update entity position
      this.store.dispatch({
        type: 'entity:update',
        payload: {
          entityId: entity.id,
          updates: {
            x: newX,
            y: newY
          }
        }
      });
    }
  }

  pickNewTarget(entity, state) {
    // Get all zone tiles
    const zonedTiles = state.map.tiles.filter(t => t.zone);
    if (zonedTiles.length === 0) return;

    // Pick a random zone as new target
    const targetZone = zonedTiles[Math.floor(Math.random() * zonedTiles.length)];

    this.store.dispatch({
      type: 'entity:update',
      payload: {
        entityId: entity.id,
        updates: {
          targetX: targetZone.x + Math.random() * 0.3,
          targetY: targetZone.y + Math.random() * 0.3
        }
      }
    });
  }
}
