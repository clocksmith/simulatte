# Isometric Grid Rendering System

**Date:** 2025-01-17
**Category:** Graphics Enhancement
**Files Modified:** `public/cbg/renderer/webgpu-renderer.js`

## Feature
Added a faint gray grid overlay to visualize the isometric tile structure, making it easier for users to see exact tile boundaries when placing zones and buildings.

## Implementation
Created a new `createGridLines()` method (lines 623-698) that generates thin gray outlines for each isometric tile's diamond shape. The grid is rendered as the first layer in `buildVertexData()` so it appears underneath all tiles, entities, and buildings.

The grid generation follows these principles:
- **Color**: Faint gray (RGB: 0.3, 0.3, 0.3) to be subtle and non-intrusive
- **Thickness**: 1px lines for minimal visual weight
- **Edge optimization**: Only draws right and bottom edges of each tile to avoid double-drawing shared edges between adjacent tiles
- **Border handling**: Special cases for x=0 and y=0 to close the left and top edges of the map

Each tile's diamond shape is constructed using thin triangles along the four edges (top-right-bottom-left) using the same vertex format as regular tiles (position, color, tilePos, UV coordinates).

## Initial Performance Issue
The first implementation caused a stack overflow error when using the spread operator (`...`) to push large arrays of grid vertices. With 3,072 tiles and ~12 vertices per tile for grid lines, this exceeded JavaScript's call stack size.

## Resolution
Replaced all `vertices.push(...array)` calls with `vertices = vertices.concat(array)` throughout the renderer. The `concat()` method safely handles large arrays without recursive spreading, eliminating the stack overflow while maintaining the same functionality.
