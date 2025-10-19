/**
 * Input Manager
 * Handles mouse and keyboard input for isometric map interaction
 */

import { DragHandler } from './drag-handler.js';

export class InputManager {
  constructor({ canvas, store }) {
    this.canvas = canvas;
    this.store = store;
    this.dragHandler = new DragHandler({ store });

    // Mouse state
    this.mouse = {
      x: 0,
      y: 0,
      worldX: 0,
      worldY: 0,
      tileX: 0,
      tileY: 0,
      isDown: false,
      button: -1,
      dragStartX: 0,
      dragStartY: 0,
      isDragging: false
    };

    // Keyboard state
    this.keys = new Set();

    // Touch state
    this.touches = new Map();

    // Bound event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }

  initialize() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);

    // Keyboard events
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    console.log('[InputManager] Initialized');
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  handleMouseDown(event) {
    this.mouse.isDown = true;
    this.mouse.button = event.button;
    this.mouse.dragStartX = this.mouse.x;
    this.mouse.dragStartY = this.mouse.y;

    const state = this.store.getState();
    const tool = state.ui.selectedTool;

    // Right-click or middle-click = pan
    if (event.button === 2 || event.button === 1) {
      this.mouse.isDragging = true;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // Left-click = tool action
    if (event.button === 0) {
      // Check if this tool supports dragging
      const dragTools = ['path', 'zone-recreation', 'zone-cultural', 'zone-sports', 'zone-nature', 'bulldoze'];
      if (dragTools.includes(tool)) {
        // Start drag operation
        this.dragHandler.startDrag(this.mouse.tileX, this.mouse.tileY, tool);
      } else {
        // Single-click tool
        this.handleToolAction(tool, this.mouse.tileX, this.mouse.tileY, 'start');
      }
    }
  }

  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const prevX = this.mouse.x;
    const prevY = this.mouse.y;
    this.mouse.x = event.clientX - rect.left;
    this.mouse.y = event.clientY - rect.top;

    // Handle camera pan dragging BEFORE updating world coordinates
    if (this.mouse.isDragging && this.mouse.isDown) {
      const dx = this.mouse.x - prevX;
      const dy = this.mouse.y - prevY;

      const state = this.store.getState();

      // Move camera inversely to mouse movement
      this.store.dispatch({
        type: 'camera:move',
        payload: {
          dx: -dx / state.camera.zoom,
          dy: -dy / state.camera.zoom
        }
      });

      return; // Don't update hover during camera drag
    }

    // Update world coordinates
    const state = this.store.getState();
    this.updateWorldCoordinates(state.camera);

    // Update drag handler if dragging with tool
    if (this.dragHandler.isDraggingActive() && this.mouse.isDown) {
      this.dragHandler.updateDrag(this.mouse.tileX, this.mouse.tileY);
      return; // Don't update hover during tool drag
    }

    // Update hovered tile
    const mapState = state.map;
    if (this.mouse.tileX >= 0 && this.mouse.tileY >= 0 &&
        this.mouse.tileX < mapState.width && this.mouse.tileY < mapState.height) {
      this.store.dispatch({
        type: 'tile:hover',
        payload: { tile: { x: this.mouse.tileX, y: this.mouse.tileY } }
      });
    }
  }

  handleMouseUp(event) {
    this.mouse.isDown = false;

    // End camera pan drag
    if (this.mouse.isDragging) {
      this.mouse.isDragging = false;
      this.canvas.style.cursor = 'default';
      return;
    }

    // End tool drag
    if (this.dragHandler.isDraggingActive()) {
      this.dragHandler.endDrag();
      return;
    }

    const state = this.store.getState();
    const tool = state.ui.selectedTool;

    // Single-click tool action
    if (event.button === 0) {
      this.handleToolAction(tool, this.mouse.tileX, this.mouse.tileY, 'end');
    }
  }

  handleWheel(event) {
    event.preventDefault();

    // Zoom with mouse wheel
    const delta = -Math.sign(event.deltaY) * 0.1;
    this.store.dispatch({
      type: 'camera:zoom',
      payload: { delta }
    });
  }

  handleKeyDown(event) {
    this.keys.add(event.key.toLowerCase());

    // Camera pan with arrow keys or WASD
    const panSpeed = 10;
    if (event.key === 'ArrowUp' || event.key === 'w') {
      this.store.dispatch({ type: 'camera:move', payload: { dx: 0, dy: -panSpeed } });
    }
    if (event.key === 'ArrowDown' || event.key === 's') {
      this.store.dispatch({ type: 'camera:move', payload: { dx: 0, dy: panSpeed } });
    }
    if (event.key === 'ArrowLeft' || event.key === 'a') {
      this.store.dispatch({ type: 'camera:move', payload: { dx: -panSpeed, dy: 0 } });
    }
    if (event.key === 'ArrowRight' || event.key === 'd') {
      this.store.dispatch({ type: 'camera:move', payload: { dx: panSpeed, dy: 0 } });
    }

    // Pause with spacebar
    if (event.key === ' ') {
      event.preventDefault();
      this.store.dispatch({ type: 'game:toggle-pause' });
    }

    // Speed up with +/=
    if (event.key === '+' || event.key === '=') {
      this.store.dispatch({ type: 'game:cycle-speed' });
    }

    // Tool shortcuts
    if (event.key === 'i') {
      this.store.dispatch({ type: 'tool:select', payload: { tool: 'inspect' } });
    }
    if (event.key === 'b') {
      this.store.dispatch({ type: 'tool:select', payload: { tool: 'bulldoze' } });
    }
    if (event.key === 'r') {
      this.store.dispatch({ type: 'tool:select', payload: { tool: 'zone-recreation' } });
    }
    if (event.key === 'c') {
      this.store.dispatch({ type: 'tool:select', payload: { tool: 'zone-cultural' } });
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.key.toLowerCase());
  }

  handleContextMenu(event) {
    event.preventDefault();
  }

  updateWorldCoordinates(camera) {
    // Convert screen coordinates to isometric world coordinates
    const screenX = this.mouse.x - this.canvas.width / 2;
    const screenY = this.mouse.y - this.canvas.height / 2;

    // Account for camera offset and zoom
    const worldX = (screenX / camera.zoom) + camera.x;
    const worldY = (screenY / camera.zoom) + camera.y;

    // Convert isometric screen space to tile coordinates
    // Isometric tile dimensions (in pixels)
    const tileWidth = 64;
    const tileHeight = 32;

    // Inverse isometric projection
    // isoX = (tileX - tileY) * tileWidth/2
    // isoY = (tileX + tileY) * tileHeight/2
    // Solving for tileX and tileY:
    const tileX = (worldX / (tileWidth / 2) + worldY / (tileHeight / 2)) / 2;
    const tileY = (worldY / (tileHeight / 2) - worldX / (tileWidth / 2)) / 2;

    this.mouse.worldX = worldX;
    this.mouse.worldY = worldY;
    this.mouse.tileX = Math.floor(tileX);
    this.mouse.tileY = Math.floor(tileY);
  }

  handleToolAction(tool, tileX, tileY, phase) {
    if (tileX < 0 || tileY < 0) return;

    const state = this.store.getState();
    const { width, height } = state.map;

    if (tileX >= width || tileY >= height) return;

    if (phase === 'end') {
      switch (tool) {
        case 'inspect':
          this.store.dispatch({
            type: 'tile:select',
            payload: { tile: { x: tileX, y: tileY } }
          });
          break;

        case 'bulldoze':
          this.handleBulldoze(tileX, tileY);
          break;

        case 'zone-recreation':
        case 'zone-cultural':
        case 'zone-sports':
        case 'zone-nature':
          this.handleZonePlacement(tool, tileX, tileY);
          break;

        case 'path':
        case 'lighting':
        case 'bench':
        case 'fountain':
        case 'security':
        case 'maintenance':
        case 'programs':
          this.handleBuildingPlacement(tool, tileX, tileY);
          break;

        default:
          console.warn('[InputManager] Unknown tool:', tool);
      }
    }
  }

  handleBulldoze(tileX, tileY) {
    this.store.dispatch({
      type: 'tile:update',
      payload: {
        x: tileX,
        y: tileY,
        updates: { zone: null, building: null }
      }
    });
  }

  handleZonePlacement(zoneTool, tileX, tileY) {
    const zoneType = zoneTool.replace('zone-', '');

    const zone = {
      type: zoneType,
      x: tileX,
      y: tileY,
      width: 1,
      height: 1,
      level: 1
    };

    this.store.dispatch({
      type: 'zone:place',
      payload: { zone }
    });

    this.store.dispatch({
      type: 'tile:update',
      payload: {
        x: tileX,
        y: tileY,
        updates: { zone: zoneType }
      }
    });
  }

  handleBuildingPlacement(buildingTool, tileX, tileY) {
    const buildingCosts = {
      path: 50,
      lighting: 200,
      bench: 100,
      fountain: 500,
      security: 1000,
      maintenance: 800,
      programs: 1200
    };

    const cost = buildingCosts[buildingTool] || 0;
    const state = this.store.getState();

    if (state.resources.budget < cost) {
      console.warn('[InputManager] Insufficient budget');
      return;
    }

    const building = {
      type: buildingTool,
      x: tileX,
      y: tileY,
      cost
    };

    this.store.dispatch({
      type: 'building:place',
      payload: { building }
    });

    this.store.dispatch({
      type: 'tile:update',
      payload: {
        x: tileX,
        y: tileY,
        updates: { building: buildingTool }
      }
    });
  }

  isKeyPressed(key) {
    return this.keys.has(key.toLowerCase());
  }

  getMouseTile() {
    return {
      x: this.mouse.tileX,
      y: this.mouse.tileY
    };
  }
}
