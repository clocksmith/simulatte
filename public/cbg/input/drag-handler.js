/**
 * Drag Handler
 * Handles drag-to-draw operations for paths and rectangular zones
 */

export class DragHandler {
  constructor({ store }) {
    this.store = store;
    this.isDragging = false;
    this.dragStart = null;
    this.dragCurrent = null;
    this.dragTool = null;
    this.previewTiles = [];
  }

  startDrag(tileX, tileY, tool) {
    this.isDragging = true;
    this.dragStart = { x: tileX, y: tileY };
    this.dragCurrent = { x: tileX, y: tileY };
    this.dragTool = tool;
    this.updatePreview();
  }

  updateDrag(tileX, tileY) {
    if (!this.isDragging) return;

    this.dragCurrent = { x: tileX, y: tileY };
    this.updatePreview();
  }

  endDrag() {
    if (!this.isDragging) return;

    // Apply the action to all preview tiles
    this.applyDrag();

    // Clear drag state
    this.isDragging = false;
    this.dragStart = null;
    this.dragCurrent = null;
    this.dragTool = null;
    this.previewTiles = [];

    // Clear preview from store
    this.store.dispatch({
      type: 'ui:clear-preview'
    });
  }

  cancelDrag() {
    this.isDragging = false;
    this.dragStart = null;
    this.dragCurrent = null;
    this.dragTool = null;
    this.previewTiles = [];

    this.store.dispatch({
      type: 'ui:clear-preview'
    });
  }

  updatePreview() {
    if (!this.isDragging || !this.dragStart || !this.dragCurrent) return;

    const tiles = this.calculateDragTiles();
    this.previewTiles = tiles;

    // Update store with preview
    this.store.dispatch({
      type: 'ui:set-preview',
      payload: {
        tiles,
        tool: this.dragTool
      }
    });
  }

  calculateDragTiles() {
    const { x: x1, y: y1 } = this.dragStart;
    const { x: x2, y: y2 } = this.dragCurrent;

    const tool = this.dragTool;

    // Path tool: draw line
    if (tool === 'path') {
      return this.calculateLineTiles(x1, y1, x2, y2);
    }

    // Zone tools: draw rectangle
    if (tool.startsWith('zone-')) {
      return this.calculateRectangleTiles(x1, y1, x2, y2);
    }

    // Bulldoze: rectangle
    if (tool === 'bulldoze') {
      return this.calculateRectangleTiles(x1, y1, x2, y2);
    }

    // Other building tools: line
    return this.calculateLineTiles(x1, y1, x2, y2);
  }

  calculateLineTiles(x1, y1, x2, y2) {
    // Bresenham's line algorithm
    const tiles = [];
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      tiles.push({ x, y });

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return tiles;
  }

  calculateRectangleTiles(x1, y1, x2, y2) {
    const tiles = [];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        tiles.push({ x, y });
      }
    }

    return tiles;
  }

  applyDrag() {
    const state = this.store.getState();
    const { width, height } = state.map;

    // Filter valid tiles
    const validTiles = this.previewTiles.filter(
      tile => tile.x >= 0 && tile.x < width && tile.y >= 0 && tile.y < height
    );

    if (validTiles.length === 0) return;

    const tool = this.dragTool;

    // Apply based on tool type
    if (tool === 'bulldoze') {
      validTiles.forEach(tile => {
        this.store.dispatch({
          type: 'tile:update',
          payload: {
            x: tile.x,
            y: tile.y,
            updates: { zone: null, building: null }
          }
        });
      });
      return;
    }

    if (tool === 'path') {
      const pathCost = 50;
      const totalCost = validTiles.length * pathCost;

      if (state.resources.budget < totalCost) {
        console.warn('[DragHandler] Insufficient budget for paths');
        return;
      }

      validTiles.forEach(tile => {
        this.store.dispatch({
          type: 'building:place',
          payload: {
            building: {
              type: 'path',
              x: tile.x,
              y: tile.y,
              cost: pathCost
            }
          }
        });

        this.store.dispatch({
          type: 'tile:update',
          payload: {
            x: tile.x,
            y: tile.y,
            updates: { building: 'path' }
          }
        });
      });
      return;
    }

    if (tool.startsWith('zone-')) {
      const zoneType = tool.replace('zone-', '');

      // Create one big zone or individual zones?
      // Let's create individual zone tiles for flexibility
      validTiles.forEach(tile => {
        const zoneId = `zone-${Date.now()}-${tile.x}-${tile.y}`;

        this.store.dispatch({
          type: 'zone:place',
          payload: {
            zoneId,
            zone: {
              type: zoneType,
              x: tile.x,
              y: tile.y,
              width: 1,
              height: 1,
              level: 1
            }
          }
        });

        this.store.dispatch({
          type: 'tile:update',
          payload: {
            x: tile.x,
            y: tile.y,
            updates: { zone: zoneType }
          }
        });
      });
      return;
    }

    // Other building tools (lighting, bench, etc.)
    const buildingCosts = {
      lighting: 200,
      bench: 100,
      fountain: 500,
      security: 1000,
      maintenance: 800,
      programs: 1200
    };

    const cost = buildingCosts[tool] || 0;
    const totalCost = validTiles.length * cost;

    if (state.resources.budget < totalCost) {
      console.warn('[DragHandler] Insufficient budget');
      return;
    }

    validTiles.forEach(tile => {
      this.store.dispatch({
        type: 'building:place',
        payload: {
          building: {
            type: tool,
            x: tile.x,
            y: tile.y,
            cost
          }
        }
      });

      this.store.dispatch({
        type: 'tile:update',
        payload: {
          x: tile.x,
          y: tile.y,
          updates: { building: tool }
        }
      });
    });
  }

  isDraggingActive() {
    return this.isDragging;
  }

  getPreviewTiles() {
    return this.previewTiles;
  }
}
