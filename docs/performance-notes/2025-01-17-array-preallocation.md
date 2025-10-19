# Array Pre-Allocation Optimization - 6 FPS to 120 FPS

**Date:** 2025-01-17
**Category:** Performance Optimization
**Files Modified:** `public/cbg/renderer/webgpu-renderer.js`
**Hardware:** MacBook M3 with 120Hz display

## Issue
The game was running at an unacceptable 6-26 FPS on high-end M3 hardware, far below the expected 60-120 FPS target for a "SNES-level" 2D isometric game.

## Root Cause Analysis

**Phase 1: Grid Rendering (6 FPS)**
Initial profiling revealed the grid rendering system was creating massive vertex arrays every frame. The combination of:
1. Grid generation for all visible tiles (creating ~50,000+ floats)
2. Using `Array.concat()` to merge arrays
3. JavaScript's array growth overhead when repeatedly concatenating

This resulted in 6 FPS performance.

**Phase 2: Without Grid (26 FPS)**
Disabling the grid improved performance to 26 FPS, but this was still 4-5x slower than expected. The bottleneck shifted to the tile rendering loop where we were using:
- `vertices.concat(tileVertices)` - Creates a new array every time
- `vertices.push(...tileVertices)` - Still causes array resizing

With ~150-200 visible tiles per frame, each creating 54 floats (6 vertices × 9 floats/vertex), we were constantly reallocating arrays.

**Phase 3: Pre-Allocated Array (120 FPS)**
The solution was to eliminate all dynamic array operations by:
1. Pre-calculating the maximum vertex count needed
2. Pre-allocating a single typed array at the start
3. Using direct index assignment instead of push/concat
4. Trimming the array to actual size at the end

## Implementation

### Before (26 FPS):
```javascript
let vertices = [];
// ... later in loop:
vertices = vertices.concat(tileVertices); // Allocates new array!
```

### After (120 FPS):
```javascript
const estimatedVertices = tilesInView * 54 * 2; // Calculate upfront
const vertices = new Array(estimatedVertices); // Pre-allocate once
let vertexIndex = 0;

// ... later in loop:
for (let i = 0; i < tileVertices.length; i++) {
  vertices[vertexIndex++] = tileVertices[i]; // Direct assignment, no reallocation
}

vertices.length = vertexIndex; // Trim to actual size once at end
```

## Key Optimizations

1. **Single Allocation**: Array is allocated once at the start of frame, not thousands of times during rendering
2. **Index-Based Assignment**: Direct array indexing is much faster than push/concat
3. **Conservative Estimation**: Pre-allocating 2x the estimated size ensures we never need to grow the array
4. **Final Trim**: Setting `array.length` at the end is cheap and returns unused memory

## Performance Impact
- **Before**: 26 FPS (without grid), 6 FPS (with grid)
- **After**: 120 FPS (matches display refresh rate)
- **Improvement**: 20x faster (26 → 120 FPS), 4.6x improvement even without grid overhead
- **Frame Budget**: 8.3ms per frame at 120 FPS, well under budget now

## Technical Insight
This optimization is a textbook example of avoiding "death by a thousand cuts" in JavaScript. While a single array concat seems harmless, doing it 200+ times per frame creates massive GC pressure and CPU overhead. Pre-allocation is a fundamental optimization technique in high-performance JavaScript applications, especially games.

The M3's GPU can easily handle the WebGPU rendering - the bottleneck was entirely on the JavaScript side with array operations. This highlights that even with modern hardware, algorithmic efficiency still matters enormously.
