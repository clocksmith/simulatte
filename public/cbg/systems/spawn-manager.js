/**
 * Spawn Manager
 * Spawns Williamsburg characters and special events
 */

import { ENTITY_DIMENSIONS, getRenderSize, isMultiTile } from '../config/entity-config.js';

export class SpawnManager {
  constructor({ store, zoneManager, seasonManager }) {
    this.store = store;
    this.zoneManager = zoneManager;
    this.seasonManager = seasonManager;

    this.spawnTimer = 0;
    this.visitorSpawnInterval = 2.0; // Spawn visitors every 2 seconds
    this.specialSpawnInterval = 5.0; // Special characters every 5 seconds
    this.specialSpawnTimer = 0;
    this.activitySpawnInterval = 10.0; // Activities every 10 seconds
    this.activitySpawnTimer = 0;
  }

  async initialize() {
    // Don't spawn TV bike guy on init - wait for zones to be created
    console.log('[SpawnManager] Initialized - waiting for zones before spawning');
    console.log('[SpawnManager] Spawn intervals: Visitors=2s, Special=5s, Activities=10s');
    console.log('[SpawnManager] All entities have EQUAL spawn probability');
  }

  update(dt) {
    const state = this.store.getState();

    // Update entity lifetimes
    this.updateEntityLifetimes(dt);

    // Spawn regular visitors
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.visitorSpawnInterval) {
      this.spawnTimer = 0;
      this.trySpawnVisitor();
    }

    // Spawn special Williamsburg characters
    this.specialSpawnTimer += dt;
    if (this.specialSpawnTimer >= this.specialSpawnInterval) {
      this.specialSpawnTimer = 0;
      this.trySpawnSpecialCharacter();
    }

    // Spawn activities (stationary multi-tile entities)
    this.activitySpawnTimer += dt;
    if (this.activitySpawnTimer >= this.activitySpawnInterval) {
      this.activitySpawnTimer = 0;
      this.trySpawnActivity();
    }
  }

  updateEntityLifetimes(dt) {
    const state = this.store.getState();

    state.entities.forEach(entity => {
      if (entity.lifetime !== undefined) {
        const newLifetime = entity.lifetime - dt;

        if (newLifetime <= 0) {
          // Remove entity
          this.store.dispatch({
            type: 'entity:remove',
            payload: { entityId: entity.id }
          });
        } else {
          // Update lifetime
          this.store.dispatch({
            type: 'entity:update',
            payload: {
              entityId: entity.id,
              updates: { lifetime: newLifetime }
            }
          });
        }
      }
    });
  }

  trySpawnVisitor() {
    const state = this.store.getState();

    // ONLY spawn visitors if there are zones
    const zonedTiles = state.map.tiles.filter(t => t.zone);
    if (zonedTiles.length === 0) {
      // No zones = no visitors (nothing to visit!)
      return;
    }

    // Cap visitor count
    const currentVisitors = state.entities.filter(e => e.type === 'visitor').length;
    const maxVisitors = 50 + state.stats.happiness; // More happiness = more visitors

    if (currentVisitors >= maxVisitors) return;

    // Spawn rate depends on time of day and season
    const timeOfDay = this.getTimeOfDay(state.time.hour);
    const spawnChance = this.getVisitorSpawnChance(timeOfDay, state.season.current);

    if (Math.random() > spawnChance) return;

    // Pick a random zone tile as spawn point (visitors spawn AT zones)
    const spawnZone = zonedTiles[Math.floor(Math.random() * zonedTiles.length)];

    // Pick a different zone as target (visitors go between zones)
    const targetZone = zonedTiles[Math.floor(Math.random() * zonedTiles.length)];

    // Create visitor
    const visitorType = this.getRandomVisitorType(state.season.current);
    const dimensions = ENTITY_DIMENSIONS[visitorType] || ENTITY_DIMENSIONS['visitor'];

    const entity = {
      id: `visitor-${Date.now()}-${Math.random()}`,
      type: 'visitor',
      visitorType,
      x: spawnZone.x + Math.random() * 0.3, // Spawn within tile, with proper spacing
      y: spawnZone.y + Math.random() * 0.3,
      targetX: targetZone.x + Math.random() * 0.3,
      targetY: targetZone.y + Math.random() * 0.3,
      speed: 2.0,
      lifetime: 300 + Math.random() * 300, // 5-10 minutes

      // Add dimension data from config
      renderSize: dimensions.renderSize,
      widthInTiles: dimensions.widthInTiles,
      heightInTiles: dimensions.heightInTiles,
      dimensions: {
        height: dimensions.height, // feet
        width: dimensions.width, // feet
      },

      // Interaction state
      interacting: false,
      interactionType: null,
      interactionWith: null,
    };

    this.store.dispatch({
      type: 'entity:spawn',
      payload: { entity }
    });
  }

  trySpawnSpecialCharacter() {
    // Williamsburg characters with mobility flags - EQUAL PROBABILITY
    const specialCharacters = [
      // Mobile characters (walk/move around)
      { type: 'tv-bike-guy', weight: 1 },
      { type: 'accordion-player', weight: 1 },
      { type: 'dog-walker', weight: 1 },
      { type: 'jogger', weight: 1 },
      { type: 'cyclist', weight: 1 },
      { type: 'hipster', weight: 1 },

      // Stationary characters (stay in one spot)
      { type: 'tarot-reader', weight: 1 },
    ];

    // Weighted random selection
    const totalWeight = specialCharacters.reduce((sum, char) => sum + char.weight, 0);
    let random = Math.random() * totalWeight;

    for (const char of specialCharacters) {
      random -= char.weight;
      if (random <= 0) {
        this.spawnSpecialCharacter(char.type);
        return;
      }
    }

    // Fallback
    this.spawnSpecialCharacter('hipster');
  }

  spawnSpecialCharacter(characterType) {
    const state = this.store.getState();

    // Special characters also only spawn if there are zones
    const zonedTiles = state.map.tiles.filter(t => t.zone);
    if (zonedTiles.length === 0) {
      // No zones = no special characters
      return;
    }

    // Spawn at a random zone
    const spawnZone = zonedTiles[Math.floor(Math.random() * zonedTiles.length)];
    const targetZone = zonedTiles[Math.floor(Math.random() * zonedTiles.length)];

    // Get dimensions from config
    const dimensions = ENTITY_DIMENSIONS[characterType] || ENTITY_DIMENSIONS['visitor'];

    // Check if entity is mobile or stationary
    const isMobile = dimensions.mobile !== false; // Default to mobile unless explicitly false
    const speed = dimensions.speed || 1.5;

    const entity = {
      id: `special-${characterType}-${Date.now()}`,
      type: 'special',
      characterType,
      x: spawnZone.x + Math.random() * 0.3,
      y: spawnZone.y + Math.random() * 0.3,
      // Stationary entities stay at spawn position
      targetX: isMobile ? targetZone.x + Math.random() * 0.3 : spawnZone.x,
      targetY: isMobile ? targetZone.y + Math.random() * 0.3 : spawnZone.y,
      speed: isMobile ? speed : 0, // Speed = 0 for stationary entities
      lifetime: 600, // 10 minutes

      // Add dimension data from config
      renderSize: dimensions.renderSize,
      widthInTiles: dimensions.widthInTiles,
      heightInTiles: dimensions.heightInTiles,
      dimensions: {
        height: dimensions.height, // feet
        width: dimensions.width, // feet
      },
      stationary: !isMobile,
      mobile: isMobile,

      // Interaction state
      interacting: false,
      interactionType: null,
      interactionWith: null,
    };

    this.store.dispatch({
      type: 'entity:spawn',
      payload: { entity }
    });

    console.log(`[SpawnManager] Spawned special character: ${characterType} in zone (${dimensions.renderSize}px, ${dimensions.height}ft tall)`);
  }

  getTimeOfDay(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 20) return 'evening';
    return 'night';
  }

  getVisitorSpawnChance(timeOfDay, season) {
    const baseChances = {
      morning: 0.3,
      afternoon: 0.8,
      evening: 0.6,
      night: 0.1
    };

    const seasonMultipliers = {
      Spring: 1.0,
      Summer: 1.3,
      Fall: 0.9,
      Winter: 0.5
    };

    return (baseChances[timeOfDay] || 0.5) * (seasonMultipliers[season] || 1.0);
  }

  getRandomVisitorType(season) {
    const types = [
      'hipster',
      'yuppie',
      'old-new-yorker',
      'artist',
      'musician',
      'dog-owner',
      'parent',
      'tourist',
      'jogger',
      'cyclist'
    ];

    // Seasonal adjustments
    if (season === 'Summer') {
      types.push('sunbather', 'swimmer', 'tourist');
    }
    if (season === 'Winter') {
      types.push('ice-skater');
    }

    return types[Math.floor(Math.random() * types.length)];
  }

  trySpawnActivity() {
    const state = this.store.getState();

    // Only spawn activities if there are zones
    const zonedTiles = state.map.tiles.filter(t => t.zone);
    if (zonedTiles.length === 0) {
      return;
    }

    // Cap total activity count
    const currentActivities = state.entities.filter(e => e.type === 'activity').length;
    const maxActivities = 30; // Max 30 activities on map

    if (currentActivities >= maxActivities) return;

    // EQUAL PROBABILITY for all activity types
    const activities = [
      // Small activities (2-tile)
      { type: 'yoga', weight: 1 },
      { type: 'kombucha-stand', weight: 1 },
      { type: 'zine-library', weight: 1 },

      // Medium activities (4-tile)
      { type: 'spikeball', weight: 1 },
      { type: 'outdoor-dj', weight: 1 },
      { type: 'vintage-bike-workshop', weight: 1 },

      // Large activities (9-tile)
      { type: 'avant-garde-boxing', weight: 1 },

      // Extra large activities (16-tile)
      { type: 'dogs-off-leash', weight: 1 },

      // Massive activities (20-tile)
      { type: 'outdoor-film', weight: 1 },
    ];

    // Weighted random selection
    const totalWeight = activities.reduce((sum, act) => sum + act.weight, 0);
    let random = Math.random() * totalWeight;

    for (const activity of activities) {
      random -= activity.weight;
      if (random <= 0) {
        this.spawnActivity(activity.type);
        return;
      }
    }

    // Fallback
    this.spawnActivity('yoga');
  }

  spawnActivity(activityType) {
    const state = this.store.getState();

    // Only spawn if there are zones
    const zonedTiles = state.map.tiles.filter(t => t.zone);
    if (zonedTiles.length === 0) {
      return;
    }

    // Get dimensions from config
    const dimensions = ENTITY_DIMENSIONS[activityType];
    if (!dimensions) {
      console.warn(`[SpawnManager] No dimensions found for activity: ${activityType}`);
      return;
    }

    // Get tile footprint
    const tilesOccupied = dimensions.tilesOccupied || { x: 1, y: 1 };

    // Try to find a suitable spawn location (with space for multi-tile)
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const spawnZone = zonedTiles[Math.floor(Math.random() * zonedTiles.length)];

      // Check if there's enough clear space around this location
      if (this.hasSpaceForActivity(spawnZone.x, spawnZone.y, tilesOccupied)) {
        // Center multi-tile entities on their footprint
        // For a 2x2 entity, add 0.5 to center it on those tiles
        const centerOffsetX = (tilesOccupied.x - 1) * 0.5;
        const centerOffsetY = (tilesOccupied.y - 1) * 0.5;

        const entity = {
          id: `activity-${activityType}-${Date.now()}`,
          type: 'activity',
          activityType,
          x: spawnZone.x + centerOffsetX,
          y: spawnZone.y + centerOffsetY,
          targetX: spawnZone.x + centerOffsetX, // Activities don't move
          targetY: spawnZone.y + centerOffsetY,
          speed: 0, // Stationary
          lifetime: 900, // 15 minutes

          // Add dimension data from config
          renderSize: dimensions.renderSize,
          widthInTiles: dimensions.widthInTiles || tilesOccupied.x,
          heightInTiles: dimensions.heightInTiles || tilesOccupied.y,
          tilesOccupied,
          dimensions: {
            height: dimensions.height || dimensions.screenHeight || dimensions.ringSize || dimensions.areaSize,
            width: dimensions.width || dimensions.screenWidth || dimensions.ringSize || dimensions.areaSize,
          },

          // Stationary flags
          stationary: true,
          mobile: false,

          // Activity-specific properties
          maxPlayers: dimensions.maxPlayers || 1,
          currentPlayers: 0,
          vendor: dimensions.vendor || false,
          attractsAudience: dimensions.attractsAudience || false,
          audienceRadius: dimensions.audienceRadius || 0,

          // Interaction state
          interacting: false,
          interactionType: null,
          interactionWith: null,
        };

        this.store.dispatch({
          type: 'entity:spawn',
          payload: { entity }
        });

        console.log(`[SpawnManager] Spawned activity: ${activityType} at (${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}) - ${tilesOccupied.x}×${tilesOccupied.y} tiles (${dimensions.renderSize}px render size)`);
        return;
      }
    }

    // Couldn't find space after max attempts
    console.log(`[SpawnManager] Could not find space for activity: ${activityType} (${tilesOccupied.x}×${tilesOccupied.y} tiles)`);
  }

  hasSpaceForActivity(x, y, tilesOccupied) {
    const state = this.store.getState();

    // Check if any existing activity is too close
    const minDistance = Math.max(tilesOccupied.x, tilesOccupied.y) + 2; // 2 tile buffer

    for (const entity of state.entities) {
      if (entity.type === 'activity') {
        const dx = Math.abs(entity.x - x);
        const dy = Math.abs(entity.y - y);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance) {
          return false; // Too close to another activity
        }
      }
    }

    return true; // Space is clear
  }
}
