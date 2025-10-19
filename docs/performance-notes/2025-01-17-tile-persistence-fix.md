# Tile Persistence Fix - Zone and Path Placement

**Date:** 2025-01-17
**Category:** Game Mechanics
**Files Modified:** `public/cbg/boot.js`

## Issue
When users attempted to place zones (recreation, cultural, sports, nature) or paths on the map, the changes would not persist or be visible. The drag-to-draw functionality appeared to work (preview was visible), but upon releasing the mouse, nothing would appear on the map.

## Root Cause
The McCarren Park map file (`public/cbg/maps/mccarren-park.json`) contained an empty `tiles` array. When the drag handler dispatched `tile:update` actions to modify tiles at specific coordinates, the store reducer attempted to update tiles that didn't exist. The zone and building data was being stored in the state's `zones` and `buildings` objects, but without corresponding tile data, the renderer had nothing to display.

## Solution
Added tile array initialization in `boot.js` at lines 206-221. When loading the McCarren Park map, if the tiles array is empty or missing, the code now generates a full grid of tiles based on the map's width and height (64×48 = 3,072 tiles). Each tile is initialized with:
- `x, y`: Tile coordinates
- `type`: 'grass' (default terrain)
- `zone`: null (can be set to recreation, cultural, sports, nature)
- `building`: null (can be set to path, bench, fountain, etc.)

This ensures that when users place zones or buildings, the `tile:update` reducer can properly modify existing tile objects, and the renderer can display them correctly by reading the tile's zone and building properties.
