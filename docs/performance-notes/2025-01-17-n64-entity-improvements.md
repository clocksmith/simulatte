# N64-Style Entity Rendering Improvements

**Date:** 2025-01-17
**Category:** Graphics Enhancement
**Files Modified:** `public/cbg/renderer/webgpu-renderer.js`, `public/cbg/systems/spawn-manager.js`

## Overview
Significantly improved entity (people, activities) rendering with N64-style techniques including drop shadows, dynamic lighting, and distance fog. Also fixed spawning logic to be zone-based.

## Graphics Enhancements

### 1. Drop Shadows (Lines 916-960)
Added proper N64-style drop shadows under all entities:
- **Shadow Type**: Elliptical, flattened (squashed vertically)
- **Implementation**: 8-point ellipse rendered as dark triangles on ground
- **Adaptive Size**: Larger shadows for multi-tile entities, smaller for people
- **Projection**: Shadows offset slightly down (Y+2) to appear on ground plane
- **Color**: Pure black (0,0,0) for maximum contrast

This is exactly how N64 games like *Ocarina of Time* and *Banjo-Kazooie* rendered character shadows - simple elliptical blobs that ground the characters visually.

### 2. Dynamic Lighting for Entities (Lines 1033-1049)
Entities now respond to time-of-day lighting, matching tile lighting:
- **Same lighting calculation** as tiles (ambient + directional)
- **Brightness modulation**: Entities darken at night (0.3), brighten during day (0.6)
- **Consistent with environment**: People and objects match the world lighting

Before this, entities were always full-bright, making them look "pasted on". Now they're integrated into the scene lighting.

### 3. Distance Fog / Depth Cueing (Lines 526-528, 1044-1049)
Implemented N64-style atmospheric perspective:
- **Tiles**: Darken by up to 30% based on Y position (further back = darker)
- **Entities**: Same depth factor applied to maintain consistency
- **Range**: 0.7-1.0 multiplier (subtle but effective)
- **Effect**: Creates sense of depth in isometric view

N64 games heavily used distance fog to hide draw distance and create atmosphere. We use depth cueing (vertical darkening) which works better for isometric views.

### 4. Improved Entity Scale (Lines 997-1006, 1013-1016)
Fixed entity sizing to be more reasonable:
- **People**: 10px base size (down from 16px)
- **Multi-tile activities**: 8px base with 0.8 scale multiplier
- **Result**: Entities fit properly within tiles, no more giants

## Gameplay Improvements

### Zone-Based Spawning (spawn-manager.js:75-117, 141-170)
Fixed spawning logic to make gameplay sense:

**Before:**
- Visitors spawned at map edges regardless of zones
- Wandered empty grass with nothing to do
- TV bike guy appeared immediately on empty map
- No connection between zones and visitors

**After:**
- **No spawning without zones** (line 76-80) - visitors only appear if you build attractions
- **Spawn AT zones** (line 95) - visitors appear in the areas you create
- **Move between zones** (line 98) - visitors travel from activity to activity
- **Special characters in zones** (line 149) - Williamsburg characters (TV bike guy, accordion player, etc.) only appear near attractions

This creates the classic SimCity/park management gameplay loop: build zones → visitors appear → they use your facilities.

## Visual Comparison

**Before:**
- No shadows - entities floated unrealistically
- Always full-bright - looked pasted on
- No depth - everything same brightness regardless of position
- Giant people - sizing was off
- Random spawning - visitors appeared on empty grass

**After:**
- Elliptical drop shadows ground entities
- Time-of-day lighting integration
- Distance fog creates depth and atmosphere
- Proper scaling - entities fit tiles
- Zone-based spawning - visitors use your park

## Technical Details

### Shadow Rendering
Shadows are rendered FIRST (before the entity sprite) so they appear underneath. The ellipse is created using 8 triangular segments radiating from center, creating a smooth circular shape. The Y-radius is 40% of X-radius for proper ground projection.

### Lighting Integration
Entities query the cached game state (`this.lastState`) for current time, calculate the same lighting values as tiles, and apply them to vertex colors. This ensures consistent lighting across the entire scene with zero shader modifications.

### Performance Impact
- **Shadow vertices**: +24 vertices per entity (8 triangles × 3 vertices)
- **FPS**: Still 120 FPS - the additional geometry is trivial
- **Depth cueing**: CPU-side calculation, negligible cost

## Remaining Improvements

To reach full N64 quality, consider:
1. **Enhanced sprite generation** - The procedural sprites in texture-atlas.js are basic. Could add:
   - Better shading and gradients
   - Anti-aliasing
   - More detail and variation
   - Pre-rendered 3D look (like Donkey Kong Country)

2. **Particle effects** - Add simple particle systems:
   - Dust clouds when people walk
   - Sparkles for activities
   - Weather effects (rain, snow)

3. **Animation frames** - Currently sprites are static. Add:
   - Walk cycles
   - Activity animations
   - Idle poses

4. **Screen-space effects** - Post-processing:
   - Bloom for bright areas
   - Color grading
   - Scanline filter for authentic N64 feel

The foundation is now solid - shadows, lighting, and depth are working. The sprites themselves need more art love to reach true N64 pre-rendered quality.
