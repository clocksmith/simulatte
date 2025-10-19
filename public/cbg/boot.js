/**
 * CBG - City Building Game
 * Boot sequence and initialization
 */

import { createStore } from './store.js';
import { InputManager } from './input/input-manager.js';
import { Renderer } from './renderer/webgpu-renderer.js';
import { GameEngine } from './engine/game-engine.js';
import { ZoneManager } from './zones/zone-manager.js';
import { SeasonManager } from './systems/season-manager.js';
import { TimeManager } from './systems/time-manager.js';
import { SpawnManager } from './systems/spawn-manager.js';
import { ServiceManager } from './systems/service-manager.js';
import { InteractionManager } from './systems/interaction-manager.js';
import { EntityBehaviorManager } from './systems/entity-behavior-manager.js';

const store = createStore();
let renderer = null;
let inputManager = null;
let gameEngine = null;
let zoneManager = null;
let seasonManager = null;
let timeManager = null;
let spawnManager = null;
let serviceManager = null;
let interactionManager = null;
let entityBehaviorManager = null;

// DOM elements
let canvas = null;
let loadingEl = null;
let statusEl = null;

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  console.log('[CBG] Initializing City Building Game...');

  try {
    // Step 1: Cache DOM
    console.log('[CBG] Step 1: Caching DOM...');
    cacheDom();

    // Step 2: Check WebGPU support
    console.log('[CBG] Step 2: Checking WebGPU support...');
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser. Please use Chrome/Edge 113+');
    }

    // Step 3: Initialize renderer
    console.log('[CBG] Step 3: Initializing WebGPU renderer...');
    updateLoading('Initializing WebGPU...');
    renderer = new Renderer({ canvas });
    await renderer.initialize();

    // Step 4: Initialize input manager
    console.log('[CBG] Step 4: Initializing input manager...');
    updateLoading('Setting up input...');
    inputManager = new InputManager({ canvas, store });
    inputManager.initialize();

    // Step 5: Initialize managers
    console.log('[CBG] Step 5: Initializing game systems...');
    updateLoading('Loading game systems...');

    zoneManager = new ZoneManager({ store });
    seasonManager = new SeasonManager({ store });
    timeManager = new TimeManager({ store });
    spawnManager = new SpawnManager({ store, zoneManager, seasonManager });
    serviceManager = new ServiceManager({ store });
    interactionManager = new InteractionManager({ store, zoneManager });
    entityBehaviorManager = new EntityBehaviorManager({ store });

    // Step 6: Initialize game engine
    console.log('[CBG] Step 6: Initializing game engine...');
    updateLoading('Starting game engine...');
    gameEngine = new GameEngine({
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
    });
    await gameEngine.initialize();

    // Step 7: Wire UI
    console.log('[CBG] Step 7: Wiring UI...');
    updateLoading('Setting up interface...');
    wireUI();

    // Step 8: Subscribe to store
    console.log('[CBG] Step 8: Subscribing to state changes...');
    store.subscribe(onStateChange);

    // Step 9: Load or create initial state
    console.log('[CBG] Step 9: Loading game state...');
    updateLoading('Loading McCarren Park...');
    await loadInitialState();

    // Step 10: Hide loading, start game
    console.log('[CBG] Step 10: Starting game loop...');
    hideLoading();
    gameEngine.start();

    announce('McCarren Park Simulator ready. Welcome to Williamsburg!');
    console.log('[CBG] Initialization complete!');
  } catch (error) {
    console.error('[CBG] Initialization failed:', error);
    showFatalError(error.message || 'Unknown initialization error');
  }
}

function cacheDom() {
  canvas = document.getElementById('cbg-canvas');
  loadingEl = document.getElementById('cbg-loading');
  statusEl = document.getElementById('cbg-status');

  if (!canvas || !loadingEl || !statusEl) {
    throw new Error('Required DOM elements not found');
  }

  // Set canvas to full viewport size
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    console.log('[CBG] Canvas resized:', canvas.width, 'x', canvas.height, 'DPR:', dpr);

    if (renderer) {
      renderer.resize(canvas.width, canvas.height);
    }
  };

  window.addEventListener('resize', resize);
  resize();
}

function wireUI() {
  // Tool buttons
  document.querySelectorAll('[data-tool]').forEach(button => {
    button.addEventListener('click', () => {
      const tool = button.getAttribute('data-tool');
      store.dispatch({ type: 'tool:select', payload: { tool } });

      // Update active state
      document.querySelectorAll('[data-tool]').forEach(b => {
        b.setAttribute('data-active', 'false');
      });
      button.setAttribute('data-active', 'true');
    });

    // Set initial active state for inspect tool
    if (button.getAttribute('data-tool') === 'inspect') {
      button.setAttribute('data-active', 'true');
    }
  });

  // Command buttons
  document.querySelector('[data-command="toggle-pause"]')?.addEventListener('click', () => {
    store.dispatch({ type: 'game:toggle-pause' });
  });

  document.querySelector('[data-command="speed-up"]')?.addEventListener('click', () => {
    store.dispatch({ type: 'game:cycle-speed' });
  });

  document.querySelector('[data-command="settings"]')?.addEventListener('click', () => {
    store.dispatch({ type: 'ui:open-settings' });
  });
}

async function loadInitialState() {
  // Check localStorage for saved game
  // TEMPORARILY DISABLED FOR TESTING
  // const saved = localStorage.getItem('cbg-save');

  // if (saved) {
  //   try {
  //     const state = JSON.parse(saved);
  //     store.dispatch({ type: 'game:load', payload: state });

  //     // Center camera on map
  //     const mapWidth = state.map.width;
  //     const mapHeight = state.map.height;
  //     store.dispatch({
  //       type: 'camera:set',
  //       payload: {
  //         x: (mapWidth * 32) / 2,
  //         y: (mapHeight * 16) / 2,
  //         zoom: 1.0
  //       }
  //     });
  //     return;
  //   } catch (error) {
  //     console.warn('[CBG] Failed to load saved game:', error);
  //   }
  // }

  // Load default McCarren Park map
  try {
    const response = await fetch('./maps/mccarren-park.json');
    const mapData = await response.json();

    // Initialize tiles array if empty
    if (!mapData.tiles || mapData.tiles.length === 0) {
      console.log('[CBG] Map tiles empty, generating tiles...');
      mapData.tiles = [];
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          mapData.tiles.push({
            x,
            y,
            type: null, // Start empty so grid is visible
            zone: null,
            building: null
          });
        }
      }
    }

    store.dispatch({ type: 'game:new', payload: { mapData } });

    // Center camera on map
    store.dispatch({
      type: 'camera:set',
      payload: {
        x: (mapData.width * 32) / 2,
        y: (mapData.height * 16) / 2,
        zoom: 1.0
      }
    });
  } catch (error) {
    console.warn('[CBG] Failed to load map, creating blank map:', error);
    const defaultMap = createDefaultMap();
    store.dispatch({ type: 'game:new', payload: { mapData: defaultMap } });

    // Center camera on map
    store.dispatch({
      type: 'camera:set',
      payload: {
        x: (defaultMap.width * 32) / 2,
        y: (defaultMap.height * 16) / 2,
        zoom: 1.0
      }
    });
  }
}

function createDefaultMap() {
  // Create a simple 64x64 grid
  const width = 64;
  const height = 64;
  const tiles = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({
        x,
        y,
        type: 'grass',
        zone: null,
        building: null
      });
    }
  }

  return {
    name: 'McCarren Park',
    width,
    height,
    tiles,
    metadata: {
      location: 'Williamsburg, Brooklyn',
      description: 'A 35-acre park serving North Brooklyn'
    }
  };
}

function onStateChange(state) {
  // Update UI to reflect state
  updateStats(state);
  updateInfoPanel(state);

  // Auto-save every state change (debounced by store)
  // TEMPORARILY DISABLED FOR TESTING
  // if (state.game?.initialized) {
  //   try {
  //     localStorage.setItem('cbg-save', JSON.stringify({
  //       map: state.map,
  //       resources: state.resources,
  //       time: state.time,
  //       season: state.season
  //     }));
  //   } catch (error) {
  //     console.warn('[CBG] Failed to save game:', error);
  //   }
  // }
}

function updateStats(state) {
  const budgetEl = document.querySelector('#cbg-budget .cbg-stat__value');
  const populationEl = document.querySelector('#cbg-population .cbg-stat__value');
  const seasonEl = document.querySelector('#cbg-season .cbg-stat__value');
  const timeEl = document.querySelector('#cbg-time .cbg-stat__value');
  const fpsEl = document.querySelector('#cbg-fps .cbg-stat__value');

  if (budgetEl && state.resources) {
    budgetEl.textContent = `$${Math.floor(state.resources.budget).toLocaleString()}`;
  }

  if (populationEl && state.entities) {
    const visitorCount = state.entities.filter(e => e.type === 'visitor').length;
    populationEl.textContent = visitorCount.toString();
  }

  if (seasonEl && state.season) {
    seasonEl.textContent = state.season.current;
    document.body.setAttribute('data-season', state.season.current.toLowerCase());
  }

  if (timeEl && state.time) {
    const hours = Math.floor(state.time.hour);
    const minutes = Math.floor((state.time.hour % 1) * 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    timeEl.textContent = `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  // Update FPS display
  if (fpsEl && gameEngine) {
    const fps = gameEngine.getFPS();
    fpsEl.textContent = fps.toString();
  }
}

function updateInfoPanel(state) {
  const infoBody = document.getElementById('cbg-info-body');
  if (!infoBody) return;

  const { selectedTile, hoveredTile } = state.ui;
  const tile = selectedTile || hoveredTile;

  if (!tile) {
    infoBody.innerHTML = '<p class="cbg-info__placeholder">Click on the map to see details</p>';
    return;
  }

  const { x, y } = tile;
  const tileIndex = y * state.map.width + x;
  const tileData = state.map.tiles[tileIndex];

  if (!tileData) {
    infoBody.innerHTML = '<p class="cbg-info__placeholder">Invalid tile</p>';
    return;
  }

  // Get entities at this location
  const entitiesHere = state.entities.filter(e =>
    Math.floor(e.x) === x && Math.floor(e.y) === y
  );

  // Get zone at this location
  const zone = Object.values(state.zones).find(z => z.x === x && z.y === y);

  // Build info HTML
  let html = `
    <div class="cbg-tile-info">
      <h3>Tile (${x}, ${y})</h3>
      <p><strong>Type:</strong> ${tileData.type || 'grass'}</p>
  `;

  if (tileData.zone) {
    html += `<p><strong>Zone:</strong> ${tileData.zone}</p>`;
  }

  if (tileData.building) {
    html += `<p><strong>Building:</strong> ${tileData.building}</p>`;
  }

  if (zone) {
    html += `<p><strong>Zone Level:</strong> ${zone.level || 1}</p>`;
  }

  if (entitiesHere.length > 0) {
    html += `<hr style="margin: 12px 0; border-color: var(--cbg-border);">`;
    html += `<h4>Activity Here (${entitiesHere.length})</h4>`;
    html += `<ul style="margin: 8px 0; padding-left: 20px; font-size: 12px;">`;
    entitiesHere.forEach(e => {
      const type = e.type === 'visitor' ? e.visitorType :
                   e.type === 'special' ? e.characterType :
                   e.activity || e.type;
      html += `<li>${type}</li>`;
    });
    html += `</ul>`;
  }

  html += `</div>`;
  infoBody.innerHTML = html;
}

function updateLoading(text) {
  if (loadingEl) {
    const textEl = loadingEl.querySelector('.cbg-loading__text');
    if (textEl) textEl.textContent = text;
  }
}

function hideLoading() {
  if (loadingEl) {
    loadingEl.hidden = true;
  }
}

function announce(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
  console.log('[CBG]', message);
}

function showFatalError(message) {
  if (statusEl) {
    statusEl.textContent = `Error: ${message}`;
    statusEl.style.color = 'var(--cbg-danger)';
  }

  if (loadingEl) {
    const textEl = loadingEl.querySelector('.cbg-loading__text');
    if (textEl) {
      textEl.textContent = `Error: ${message}`;
      textEl.style.color = 'var(--cbg-danger)';
    }
    const spinner = loadingEl.querySelector('.cbg-loading__spinner');
    if (spinner) spinner.style.display = 'none';
  }

  // Show error in viewport
  const viewport = document.getElementById('cbg-viewport');
  if (viewport) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 32px;
      background: var(--cbg-surface);
      border: 2px solid var(--cbg-danger);
      border-radius: 8px;
      max-width: 500px;
      text-align: center;
      z-index: 200;
    `;
    errorDiv.innerHTML = `
      <h2 style="color: var(--cbg-danger); margin: 0 0 16px 0;">Initialization Error</h2>
      <p style="margin: 0 0 24px 0;">${message}</p>
      <button onclick="location.reload()" class="cbg-button">Reload</button>
    `;
    viewport.appendChild(errorDiv);
  }
}

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('[CBG] Uncaught error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[CBG] Unhandled rejection:', event.reason);
});

// Export for debugging
if (typeof window !== 'undefined') {
  window.CBG = {
    store,
    renderer,
    gameEngine,
    inputManager,
    zoneManager,
    seasonManager,
    timeManager,
    spawnManager,
    serviceManager
  };
}
