/**
 * Entity Configuration & Scaling System
 *
 * SCALING BASELINE:
 * - Each tile = 5 feet × 5 feet (1.52m × 1.52m)
 * - This allows people to appear larger and more detailed
 * - Multi-tile entities like DJs and projectors properly span multiple tiles
 * - All entities are scaled relative to this baseline
 */

export const TILE_SCALE = {
  feetPerTile: 5,
  metersPerTile: 1.52,
  pixelsPerFoot: 12.8, // 64px tile / 5 feet = 12.8 px/ft
};

/**
 * Entity Physical Dimensions
 * All dimensions in feet, converted to tiles for rendering
 * With 5 feet per tile, a 6 foot person is ~1.2 tiles tall
 */
export const ENTITY_DIMENSIONS = {
  // PEOPLE (5.5-6 feet tall, 1.5-2 feet wide) - MOBILE
  visitor: {
    height: 5.5, // feet
    width: 1.8,
    heightInTiles: 1.1,  // 5.5 / 5
    widthInTiles: 0.36,  // 1.8 / 5
    renderSize: 16, // Bigger due to new scale
    mobile: true,
    speed: 2.0,
  },

  hipster: {
    height: 5.8,
    width: 1.8,
    heightInTiles: 1.16,
    widthInTiles: 0.36,
    renderSize: 16,
    mobile: true,
    speed: 1.8,
  },

  'accordion-player': {
    height: 5.6,
    width: 3.0, // Wider due to accordion
    heightInTiles: 1.12,
    widthInTiles: 0.6,
    renderSize: 18,
    mobile: true,  // Street performer, walks around
    speed: 1.2,
  },

  'dog-walker': {
    height: 5.7,
    width: 2.0,
    heightInTiles: 1.14,
    widthInTiles: 0.4,
    renderSize: 16,
    mobile: true,
    speed: 2.5,
    companion: 'dog', // Has a dog companion
  },

  dog: {
    height: 2.0, // To shoulder
    length: 3.0,
    heightInTiles: 0.4,
    lengthInTiles: 0.6,
    renderSize: 12,
  },

  'tarot-reader': {
    height: 5.4,
    width: 5.0, // Includes table (now properly sized)
    heightInTiles: 1.08,
    widthInTiles: 1.0,
    tilesOccupied: { x: 1, y: 1 },
    renderSize: 20,
    stationary: true, // STATIC - doesn't move
    mobile: false,
  },

  'tv-bike-guy': {
    height: 6.5, // Includes TV on head
    width: 4.0, // Includes bike
    heightInTiles: 1.3,
    widthInTiles: 0.8,
    renderSize: 18,
    mobile: true,  // Rides around!
    speed: 4.5,
  },

  jogger: {
    height: 5.6,
    width: 1.6,
    heightInTiles: 1.12,
    widthInTiles: 0.32,
    renderSize: 16,
    mobile: true,
    speed: 3.5,  // Faster than walking
  },

  cyclist: {
    height: 5.8,
    width: 3.0,  // Includes bike
    heightInTiles: 1.16,
    widthInTiles: 0.6,
    renderSize: 18,
    mobile: true,
    speed: 5.0,  // Fastest
  },

  // ACTIVITIES (multi-tile, scaled to 5ft/tile)
  spikeball: {
    diameter: 3.0, // Net is 3ft diameter
    playArea: 7.0, // Play area around net
    heightInTiles: 0.6,
    tilesOccupied: { x: 2, y: 2 }, // 2×2 tiles (10ft × 10ft)
    renderSize: 24,
    maxPlayers: 4,
    stationary: true,  // STATIC
    mobile: false,
  },

  yoga: {
    matLength: 6.0, // Standard yoga mat
    matWidth: 2.0,
    heightInTiles: 0.2, // Mat on ground
    tilesOccupied: { x: 2, y: 1 }, // 2×1 tiles
    renderSize: 18,
    maxPlayers: 1,
    stationary: true,  // STATIC
    mobile: false,
  },

  'outdoor-dj': {
    boothWidth: 8.0,  // DJ booth is 8ft wide
    boothDepth: 6.0,  // 6ft deep
    heightInTiles: 1.2, // Booth height
    tilesOccupied: { x: 2, y: 2 }, // 2×2 tiles (10ft × 10ft)
    renderSize: 32,
    maxPlayers: 1,
    attractsAudience: true,
    audienceRadius: 5.0, // Tiles
    stationary: true,  // STATIC - DJs don't walk around
    mobile: false,
  },

  'outdoor-film': {
    screenWidth: 15.0,  // 15ft screen
    screenHeight: 10.0, // 10ft tall
    viewingArea: 20.0,  // 20ft viewing area in front
    tilesOccupied: { x: 4, y: 5 }, // 4×5 tiles (20ft × 25ft total area)
    renderSize: 48,
    maxPlayers: 30,
    attractsAudience: true,
    audienceRadius: 4.0,
    stationary: true,  // STATIC - projector doesn't move
    mobile: false,
  },

  'kombucha-stand': {
    tableWidth: 6.0,
    tableDepth: 4.0,
    tilesOccupied: { x: 2, y: 1 }, // 2×1 tiles (10ft × 5ft)
    renderSize: 24,
    maxPlayers: 1,
    vendor: true,
    stationary: true,  // STATIC
    mobile: false,
  },

  'vintage-bike-workshop': {
    width: 10.0,
    depth: 10.0,
    tilesOccupied: { x: 2, y: 2 }, // 2×2 tiles
    renderSize: 28,
    maxPlayers: 3,
    vendor: true,
    stationary: true,  // STATIC
    mobile: false,
  },

  'zine-library': {
    rackWidth: 10.0,
    rackDepth: 4.0,
    tilesOccupied: { x: 2, y: 1 }, // 2×1 tiles
    renderSize: 24,
    maxPlayers: 4,
    stationary: true,  // STATIC
    mobile: false,
  },

  'avant-garde-boxing': {
    ringSize: 15.0, // Boxing ring is ~15ft×15ft
    tilesOccupied: { x: 3, y: 3 }, // 3×3 tiles
    renderSize: 32,
    maxPlayers: 2,
    stationary: true,  // STATIC
    mobile: false,
  },

  'dogs-off-leash': {
    areaSize: 20.0, // Dog run area
    tilesOccupied: { x: 4, y: 4 }, // 4×4 tiles (20ft × 20ft)
    renderSize: 28,
    maxPlayers: 8, // Multiple dogs
    stationary: true,  // STATIC - the area doesn't move
    mobile: false,
  },
};

/**
 * Entity Interaction Matrix
 * Defines what happens when entity type A encounters entity type B
 *
 * Interaction types:
 * - 'greet': Brief acknowledgment, wave
 * - 'chat': Stop and talk for a bit
 * - 'join': Join the activity
 * - 'observe': Watch from nearby
 * - 'play': Play together (dogs, kids)
 * - 'perform': One performs, other watches
 * - 'transaction': Exchange (buy kombucha, etc.)
 * - 'ignore': No interaction
 */
export const ENTITY_INTERACTIONS = {
  // Person-to-Person interactions
  'visitor + visitor': {
    type: 'greet',
    chance: 0.3,
    duration: 2, // seconds
    animation: 'wave',
    proximity: 0.3, // tiles
  },

  'visitor + hipster': {
    type: 'chat',
    chance: 0.2,
    duration: 5,
    animation: 'talk',
    proximity: 0.4,
    dialogue: ['Cool beard!', 'Where did you get that flannel?'],
  },

  'hipster + hipster': {
    type: 'chat',
    chance: 0.6,
    duration: 10,
    animation: 'talk',
    proximity: 0.3,
    dialogue: ['Have you tried the new kombucha place?', 'I was into this park before it was cool'],
  },

  'visitor + accordion-player': {
    type: 'observe',
    chance: 0.7,
    duration: 8,
    animation: 'watch',
    proximity: 1.5,
    tipsChance: 0.3, // 30% chance to give tip
  },

  'visitor + dog-walker': {
    type: 'greet',
    chance: 0.8, // People love dogs
    duration: 4,
    animation: 'pet-dog',
    proximity: 0.5,
    dialogue: ['Can I pet your dog?', 'What a cute dog!'],
  },

  'dog-walker + dog-walker': {
    type: 'chat',
    chance: 0.9, // Dog owners always chat
    duration: 15,
    animation: 'talk',
    proximity: 0.6,
    dialogue: ['How old is your dog?', 'They are so playful!'],
    dogsInteract: true, // Triggers dog-dog interaction
  },

  'visitor + tarot-reader': {
    type: 'transaction',
    chance: 0.4,
    duration: 30, // Tarot reading takes time
    animation: 'sit-down',
    proximity: 0.5,
    cost: 10,
  },

  'hipster + tarot-reader': {
    type: 'transaction',
    chance: 0.6, // Hipsters love mystical stuff
    duration: 35,
    animation: 'sit-down',
    proximity: 0.5,
    cost: 10,
  },

  'visitor + tv-bike-guy': {
    type: 'observe',
    chance: 1.0, // Everyone stops to watch TV bike guy!
    duration: 3,
    animation: 'point',
    proximity: 1.0,
    dialogue: ['What the...?', 'Only in Williamsburg!'],
  },

  // Person-to-Activity interactions
  'visitor + spikeball': {
    type: 'join',
    chance: 0.4,
    duration: 120, // 2 minutes of play
    animation: 'play-spikeball',
    proximity: 0.8,
    requiresSlot: true, // Max 4 players
  },

  'visitor + yoga': {
    type: 'join',
    chance: 0.3,
    duration: 300, // 5 minutes
    animation: 'yoga-pose',
    proximity: 0.5,
    requiresSlot: true,
  },

  'hipster + yoga': {
    type: 'join',
    chance: 0.7, // Hipsters love yoga
    duration: 360,
    animation: 'yoga-pose',
    proximity: 0.5,
    requiresSlot: true,
  },

  'visitor + outdoor-dj': {
    type: 'observe',
    chance: 0.6,
    duration: 60, // Dance for a minute
    animation: 'dance',
    proximity: 2.0,
  },

  'hipster + outdoor-dj': {
    type: 'observe',
    chance: 0.8,
    duration: 120,
    animation: 'head-bob',
    proximity: 2.5,
  },

  'visitor + outdoor-film': {
    type: 'observe',
    chance: 0.7,
    duration: 600, // Watch for 10 minutes
    animation: 'sit-watch',
    proximity: 2.0,
    requiresSlot: true,
  },

  'visitor + kombucha-stand': {
    type: 'transaction',
    chance: 0.3,
    duration: 10,
    animation: 'buy',
    proximity: 0.5,
    cost: 8,
  },

  'hipster + kombucha-stand': {
    type: 'transaction',
    chance: 0.9, // Hipsters love kombucha
    duration: 15,
    animation: 'buy',
    proximity: 0.5,
    cost: 8,
    dialogue: ['Is this the lavender ginger?', 'Do you have the small batch?'],
  },

  'visitor + vintage-bike-workshop': {
    type: 'observe',
    chance: 0.3,
    duration: 20,
    animation: 'watch',
    proximity: 1.0,
  },

  'hipster + vintage-bike-workshop': {
    type: 'join',
    chance: 0.7,
    duration: 180, // 3 minutes working on bike
    animation: 'work-on-bike',
    proximity: 0.8,
    requiresSlot: true,
  },

  'visitor + zine-library': {
    type: 'join',
    chance: 0.4,
    duration: 45,
    animation: 'browse',
    proximity: 0.6,
  },

  'hipster + zine-library': {
    type: 'join',
    chance: 0.8,
    duration: 90,
    animation: 'browse',
    proximity: 0.6,
  },

  'visitor + avant-garde-boxing': {
    type: 'observe',
    chance: 0.6,
    duration: 30,
    animation: 'watch',
    proximity: 1.5,
  },

  'dog-walker + dogs-off-leash': {
    type: 'join',
    chance: 0.9,
    duration: 180,
    animation: 'unleash-dog',
    proximity: 1.0,
  },

  // Dog-to-Dog interactions
  'dog + dog': {
    type: 'play',
    chance: 0.9,
    duration: 20,
    animation: 'play-together',
    proximity: 0.5,
  },

  // Special character interactions
  'accordion-player + visitor': {
    type: 'perform',
    chance: 1.0, // Always performing when visitors are near
    duration: -1, // Continuous
    animation: 'play-accordion',
    proximity: 3.0,
  },
};

/**
 * Get interaction for two entity types
 * @param {string} type1 - First entity type
 * @param {string} type2 - Second entity type
 * @returns {object|null} Interaction configuration or null
 */
export function getInteraction(type1, type2) {
  // Try direct lookup
  const key1 = `${type1} + ${type2}`;
  if (ENTITY_INTERACTIONS[key1]) {
    return ENTITY_INTERACTIONS[key1];
  }

  // Try reverse lookup
  const key2 = `${type2} + ${type1}`;
  if (ENTITY_INTERACTIONS[key2]) {
    return ENTITY_INTERACTIONS[key2];
  }

  return null;
}

/**
 * Get render size for entity type based on real-world dimensions
 * @param {string} entityType - Entity type
 * @returns {number} Render size in pixels
 */
export function getRenderSize(entityType) {
  const config = ENTITY_DIMENSIONS[entityType];
  return config ? config.renderSize : 10; // Default 10px
}

/**
 * Check if entity occupies multiple tiles
 * @param {string} entityType - Entity type
 * @returns {boolean}
 */
export function isMultiTile(entityType) {
  const config = ENTITY_DIMENSIONS[entityType];
  if (!config || !config.tilesOccupied) return false;
  return config.tilesOccupied.x > 1 || config.tilesOccupied.y > 1;
}
