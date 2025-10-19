/**
 * Zone Manager
 * Handles SimCity-style zoning with spawn rules
 */

export class ZoneManager {
  constructor({ store }) {
    this.store = store;
    this.spawnTimer = 0;
    this.spawnInterval = 5.0; // Try to spawn something every 5 seconds
  }

  async initialize() {
    console.log('[ZoneManager] Initialized');
  }

  update(dt) {
    this.spawnTimer += dt;

    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.trySpawnInZones();
    }
  }

  trySpawnInZones() {
    const state = this.store.getState();
    const zones = Object.values(state.zones);

    if (zones.length === 0) return;

    // Pick a random zone to potentially spawn in
    const zone = zones[Math.floor(Math.random() * zones.length)];

    // Check if zone has capacity for more activities
    const activitiesInZone = state.entities.filter(
      e => Math.floor(e.x) === zone.x && Math.floor(e.y) === zone.y
    );

    const maxActivitiesPerZone = 3;
    if (activitiesInZone.length >= maxActivitiesPerZone) {
      return;
    }

    // Spawn based on zone type and season
    this.spawnInZone(zone, state.season.current);
  }

  spawnInZone(zone, season) {
    const spawnData = this.getSpawnDataForZone(zone.type, season);

    if (spawnData.length === 0) return;

    // Pick random activity from possible spawns
    const activity = spawnData[Math.floor(Math.random() * spawnData.length)];

    // Check if there's enough space for multi-tile spawns
    const width = activity.size.w;
    const height = activity.size.h;

    // For multi-tile spawns, check if all required tiles are available
    if (width > 1 || height > 1) {
      if (!this.hasSpaceForEntity(zone.x, zone.y, width, height)) {
        return; // Not enough space
      }
    }

    // Calculate center position for multi-tile entities
    const centerX = zone.x + (width - 1) / 2;
    const centerY = zone.y + (height - 1) / 2;

    // Create entity
    const entity = {
      id: `entity-${Date.now()}-${Math.random()}`,
      type: 'activity',
      activity: activity.name,
      x: centerX + (Math.random() - 0.5) * 0.3,
      y: centerY + (Math.random() - 0.5) * 0.3,
      width: width,
      height: height,
      lifetime: activity.duration,
      maxLifetime: activity.duration,
      permanent: activity.permanent || false
    };

    this.store.dispatch({
      type: 'entity:spawn',
      payload: { entity }
    });

    console.log(`[ZoneManager] Spawned ${activity.name} (${width}x${height}) in ${zone.type} zone`);

    // Special case: dogs-off-leash spawns with an owner at 2+ tile distance
    if (activity.name === 'dogs-off-leash') {
      this.spawnDogOwner(entity);
    }
  }

  getSpawnDataForZone(zoneType, season) {
    const spawnRules = {
      recreation: [
        { name: 'spikeball', duration: 120, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'frisbee', duration: 90, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'picnic', duration: 180, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 1 } },
        { name: 'yoga', duration: 60, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'dogs-off-leash', duration: 300, seasons: ['all'], size: { w: 1, h: 1 }, multiZone: true },
        { name: 'outdoor-dj', duration: 240, seasons: ['summer'], size: { w: 2, h: 2 } },
        { name: 'bocce', duration: 150, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'outdoor-film', duration: 360, seasons: ['summer', 'fall'], size: { w: 3, h: 2 } },
        { name: 'kombucha-stand', duration: 200, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 1 } }
      ],
      cultural: [
        { name: 'accordion-player', duration: 180, seasons: ['all'], size: { w: 1, h: 1 } },
        { name: 'tarot-reader', duration: 240, seasons: ['all'], size: { w: 2, h: 1 } },
        { name: 'street-artist', duration: 300, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 2 } },
        { name: 'street-performer', duration: 120, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'poet', duration: 150, seasons: ['all'], size: { w: 1, h: 1 } },
        { name: 'vintage-seller', duration: 200, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 1 } },
        { name: 'food-vendor', duration: 180, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 2 } },
        { name: 'vintage-bike-workshop', duration: 300, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 2 } },
        { name: 'zine-library', duration: 240, seasons: ['all'], size: { w: 2, h: 1 } }
      ],
      sports: [
        { name: 'basketball', duration: 90, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 2 } },
        { name: 'soccer', duration: 120, seasons: ['spring', 'summer', 'fall'], size: { w: 3, h: 3 } },
        { name: 'tennis', duration: 90, seasons: ['spring', 'summer', 'fall'], size: { w: 3, h: 3 } },
        { name: 'track-runner', duration: 60, seasons: ['all'], size: { w: 1, h: 1 } },
        { name: 'handball', duration: 60, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'baseball', duration: 150, seasons: ['spring', 'summer', 'fall'], size: { w: 2, h: 2 } },
        { name: 'dogs-off-leash', duration: 300, seasons: ['all'], size: { w: 1, h: 1 }, multiZone: true },
        { name: 'avant-garde-boxing', duration: 180, seasons: ['all'], size: { w: 2, h: 2 } }
      ],
      nature: [
        { name: 'oak-tree', duration: 9999, seasons: ['all'], size: { w: 1, h: 1 }, permanent: true },
        { name: 'maple-tree', duration: 9999, seasons: ['all'], size: { w: 1, h: 1 }, permanent: true },
        { name: 'willow-tree', duration: 9999, seasons: ['all'], size: { w: 2, h: 2 }, permanent: true },
        { name: 'cherry-blossom', duration: 9999, seasons: ['spring'], size: { w: 1, h: 1 }, permanent: true },
        { name: 'bird-watcher', duration: 240, seasons: ['spring', 'fall'], size: { w: 1, h: 1 } },
        { name: 'photographer', duration: 180, seasons: ['all'], size: { w: 1, h: 1 } },
        { name: 'meditation', duration: 120, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'gardener', duration: 300, seasons: ['spring', 'summer', 'fall'], size: { w: 1, h: 1 } },
        { name: 'dogs-off-leash', duration: 300, seasons: ['all'], size: { w: 1, h: 1 }, multiZone: true }
      ]
    };

    const rules = spawnRules[zoneType] || [];

    // Filter by season
    const seasonLower = season.toLowerCase();
    return rules.filter(rule =>
      rule.seasons.includes('all') || rule.seasons.includes(seasonLower)
    );
  }

  getZoneAt(x, y) {
    const state = this.store.getState();
    return Object.values(state.zones).find(zone => zone.x === x && zone.y === y);
  }

  removeZone(zoneId) {
    this.store.dispatch({
      type: 'zone:remove',
      payload: { zoneId }
    });
  }

  hasSpaceForEntity(x, y, width, height) {
    const state = this.store.getState();

    // Check if all tiles in the area are within map bounds
    if (x < 0 || y < 0 || x + width > state.map.width || y + height > state.map.height) {
      return false;
    }

    // Check if any entity already occupies this space
    for (let checkY = y; checkY < y + height; checkY++) {
      for (let checkX = x; checkX < x + width; checkX++) {
        const entitiesHere = state.entities.filter(e => {
          const entityWidth = e.width || 1;
          const entityHeight = e.height || 1;
          const entityMinX = Math.floor(e.x - entityWidth / 2);
          const entityMaxX = Math.ceil(e.x + entityWidth / 2);
          const entityMinY = Math.floor(e.y - entityHeight / 2);
          const entityMaxY = Math.ceil(e.y + entityHeight / 2);

          return checkX >= entityMinX && checkX < entityMaxX &&
                 checkY >= entityMinY && checkY < entityMaxY;
        });

        if (entitiesHere.length > 0) {
          return false;
        }
      }
    }

    return true;
  }

  spawnDogOwner(dogEntity) {
    const state = this.store.getState();

    // Find a valid position for the owner (2+ tiles away from dog)
    const minDistance = 2;
    const maxDistance = 5;
    const attempts = 20;

    for (let i = 0; i < attempts; i++) {
      // Random angle and distance
      const angle = Math.random() * Math.PI * 2;
      const distance = minDistance + Math.random() * (maxDistance - minDistance);

      const ownerX = dogEntity.x + Math.cos(angle) * distance;
      const ownerY = dogEntity.y + Math.sin(angle) * distance;

      // Check if position is valid (within map bounds and not occupied)
      if (ownerX >= 0 && ownerY >= 0 &&
          ownerX < state.map.width && ownerY < state.map.height) {

        // Check if owner position is available
        const tileX = Math.floor(ownerX);
        const tileY = Math.floor(ownerY);

        if (this.hasSpaceForEntity(tileX, tileY, 1, 1)) {
          // Spawn the owner
          const owner = {
            id: `entity-${Date.now()}-${Math.random()}`,
            type: 'activity',
            activity: 'dog-owner',
            x: ownerX,
            y: ownerY,
            width: 1,
            height: 1,
            lifetime: dogEntity.lifetime,
            maxLifetime: dogEntity.maxLifetime,
            linkedTo: dogEntity.id // Link owner to dog
          };

          this.store.dispatch({
            type: 'entity:spawn',
            payload: { entity: owner }
          });

          console.log(`[ZoneManager] Spawned dog owner at distance ${distance.toFixed(1)} tiles`);
          return;
        }
      }
    }

    console.warn('[ZoneManager] Could not find valid position for dog owner');
  }
}
