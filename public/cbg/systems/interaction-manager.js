/**
 * Interaction Manager
 * Handles entity-to-entity interactions within zones
 */

import { getInteraction, ENTITY_DIMENSIONS } from '../config/entity-config.js';

export class InteractionManager {
  constructor({ store, zoneManager }) {
    this.store = store;
    this.zoneManager = zoneManager;

    // Track active interactions
    this.activeInteractions = new Map(); // entityId -> interaction state

    // Track entity positions for spatial queries
    this.spatialGrid = new Map(); // "x,y" -> [entityIds]

    this.updateInterval = 0.5; // Check for interactions every 0.5 seconds
    this.updateTimer = 0;
  }

  update(dt) {
    this.updateTimer += dt;

    if (this.updateTimer >= this.updateInterval) {
      this.updateTimer = 0;
      this.updateSpatialGrid();
      this.checkForInteractions();
      this.updateActiveInteractions(dt);
    } else {
      // Still update active interactions every frame for smooth animation
      this.updateActiveInteractions(dt);
    }
  }

  /**
   * Build spatial grid for fast proximity queries
   */
  updateSpatialGrid() {
    this.spatialGrid.clear();
    const state = this.store.getState();

    state.entities.forEach(entity => {
      const gridX = Math.floor(entity.x);
      const gridY = Math.floor(entity.y);

      // Add to grid cells (include nearby cells for interactions)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${gridX + dx},${gridY + dy}`;
          if (!this.spatialGrid.has(key)) {
            this.spatialGrid.set(key, []);
          }
          this.spatialGrid.get(key).push(entity.id);
        }
      }
    });
  }

  /**
   * Check for new interactions between entities
   */
  checkForInteractions() {
    const state = this.store.getState();
    const entities = state.entities;

    // Group entities by zone for intra-zone interactions
    const entitiesByZone = new Map();

    entities.forEach(entity => {
      // Find which zone this entity is in
      const tile = state.map.tiles.find(t =>
        Math.floor(t.x) === Math.floor(entity.x) &&
        Math.floor(t.y) === Math.floor(entity.y)
      );

      if (tile && tile.zone) {
        if (!entitiesByZone.has(tile.zone)) {
          entitiesByZone.set(tile.zone, []);
        }
        entitiesByZone.get(tile.zone).push(entity);
      }
    });

    // Check interactions within each zone
    entitiesByZone.forEach((zoneEntities, zoneName) => {
      this.checkZoneInteractions(zoneEntities, zoneName);
    });
  }

  /**
   * Check for interactions between entities in the same zone
   */
  checkZoneInteractions(entities, zoneName) {
    // Check each pair of entities
    for (let i = 0; i < entities.length; i++) {
      const entity1 = entities[i];

      // Skip if already in an interaction
      if (this.activeInteractions.has(entity1.id)) {
        continue;
      }

      for (let j = i + 1; j < entities.length; j++) {
        const entity2 = entities[j];

        // Skip if already in an interaction
        if (this.activeInteractions.has(entity2.id)) {
          continue;
        }

        // Check if these entity types can interact
        const type1 = this.getEntityType(entity1);
        const type2 = this.getEntityType(entity2);

        const interaction = getInteraction(type1, type2);
        if (!interaction) {
          continue;
        }

        // Check proximity
        const distance = this.getDistance(entity1, entity2);
        if (distance > interaction.proximity) {
          continue;
        }

        // Check random chance
        if (Math.random() > interaction.chance) {
          continue;
        }

        // Start interaction!
        this.startInteraction(entity1, entity2, interaction);
        break; // entity1 is now busy
      }
    }
  }

  /**
   * Start an interaction between two entities
   */
  startInteraction(entity1, entity2, interactionConfig) {
    const interactionId = `${entity1.id}-${entity2.id}`;

    const interaction = {
      id: interactionId,
      entity1Id: entity1.id,
      entity2Id: entity2.id,
      type: interactionConfig.type,
      config: interactionConfig,
      startTime: Date.now(),
      duration: interactionConfig.duration,
      timeRemaining: interactionConfig.duration,
    };

    // Mark both entities as busy
    this.activeInteractions.set(entity1.id, interaction);
    this.activeInteractions.set(entity2.id, interaction);

    // Update entity states
    this.store.dispatch({
      type: 'entity:update',
      payload: {
        entityId: entity1.id,
        updates: {
          interacting: true,
          interactionType: interactionConfig.type,
          interactionWith: entity2.id,
        }
      }
    });

    this.store.dispatch({
      type: 'entity:update',
      payload: {
        entityId: entity2.id,
        updates: {
          interacting: true,
          interactionType: interactionConfig.type,
          interactionWith: entity1.id,
        }
      }
    });

    // Log interaction (for debugging)
    console.log(`[InteractionManager] ${this.getEntityType(entity1)} + ${this.getEntityType(entity2)}: ${interactionConfig.type} (${interactionConfig.duration}s)`);

    // Show dialogue if available
    if (interactionConfig.dialogue && interactionConfig.dialogue.length > 0) {
      const message = interactionConfig.dialogue[Math.floor(Math.random() * interactionConfig.dialogue.length)];
      this.showDialogue(entity1, message);
    }

    // Emit interaction event for visual effects
    this.store.dispatch({
      type: 'interaction:start',
      payload: {
        interactionId,
        entity1: entity1.id,
        entity2: entity2.id,
        type: interactionConfig.type,
      }
    });
  }

  /**
   * Update active interactions
   */
  updateActiveInteractions(dt) {
    const completedInteractions = new Set();

    this.activeInteractions.forEach((interaction, entityId) => {
      // Skip if already marked complete
      if (completedInteractions.has(interaction.id)) {
        return;
      }

      // Update timer
      if (interaction.duration > 0) {
        interaction.timeRemaining -= dt;

        if (interaction.timeRemaining <= 0) {
          // Interaction complete
          this.endInteraction(interaction);
          completedInteractions.add(interaction.id);
        }
      }
    });
  }

  /**
   * End an interaction
   */
  endInteraction(interaction) {
    // Remove from active interactions
    this.activeInteractions.delete(interaction.entity1Id);
    this.activeInteractions.delete(interaction.entity2Id);

    // Update entity states
    this.store.dispatch({
      type: 'entity:update',
      payload: {
        entityId: interaction.entity1Id,
        updates: {
          interacting: false,
          interactionType: null,
          interactionWith: null,
        }
      }
    });

    this.store.dispatch({
      type: 'entity:update',
      payload: {
        entityId: interaction.entity2Id,
        updates: {
          interacting: false,
          interactionType: null,
          interactionWith: null,
        }
      }
    });

    // Emit interaction end event
    this.store.dispatch({
      type: 'interaction:end',
      payload: {
        interactionId: interaction.id,
      }
    });

    console.log(`[InteractionManager] Interaction ended: ${interaction.id}`);
  }

  /**
   * Show dialogue bubble above entity
   */
  showDialogue(entity, message) {
    // Dispatch event for UI to show dialogue
    this.store.dispatch({
      type: 'entity:dialogue',
      payload: {
        entityId: entity.id,
        message,
        duration: 3, // 3 seconds
      }
    });
  }

  /**
   * Get entity type (handles special cases)
   */
  getEntityType(entity) {
    if (entity.type === 'visitor') {
      return entity.visitorType || 'visitor';
    } else if (entity.type === 'special') {
      return entity.characterType;
    } else if (entity.type === 'activity') {
      return entity.activityType;
    }
    return entity.type;
  }

  /**
   * Calculate distance between two entities (in tiles)
   */
  getDistance(entity1, entity2) {
    const dx = entity1.x - entity2.x;
    const dy = entity1.y - entity2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get entities near a position
   */
  getNearbyEntities(x, y, radius) {
    const state = this.store.getState();
    const nearby = [];

    state.entities.forEach(entity => {
      const distance = Math.sqrt(
        (entity.x - x) ** 2 + (entity.y - y) ** 2
      );

      if (distance <= radius) {
        nearby.push(entity);
      }
    });

    return nearby;
  }

  /**
   * Check if entity can interact (not busy)
   */
  canInteract(entityId) {
    return !this.activeInteractions.has(entityId);
  }
}
