# Performance & Optimization Notes

This directory contains dated technical documentation of performance optimizations, graphics improvements, and game mechanics enhancements made to the Simulatte project.

## Purpose
- Track technical improvements over time
- Document optimization techniques and their impact
- Provide reference for future development decisions
- Help onboarding developers understand the system architecture

## File Naming Convention
`YYYY-MM-DD-descriptive-name.md`

Example: `2025-01-17-frustum-culling.md`

## Categories
Each note should include one of these categories:
- **Performance Optimization**: Changes that improve frame rate, reduce memory usage, or enhance responsiveness
- **Graphics Enhancement**: Visual improvements, rendering techniques, or shader optimizations
- **Game Mechanics**: Gameplay systems, simulation logic, or user interaction improvements
- **Bug Fix**: Critical fixes that unblocked functionality

## Document Structure
Each note should contain:
1. **Title**: Clear description of the change
2. **Date**: When the change was implemented
3. **Category**: Type of improvement
4. **Files Modified**: List of affected files
5. **Issue/Feature**: What problem was solved or feature added
6. **Solution/Implementation**: Technical details (1-3 paragraphs)
7. **Impact** (if applicable): Performance metrics, before/after comparisons

## Current Notes

### Prior Sessions
- `PREV-texture-atlas-system.md` - Procedural 16-bit sprite generation system (920+ lines, 50+ sprites)
- `PREV-bilinear-texture-filtering.md` - SNES-quality filtering with 16x anisotropic filtering

### 2025-01-17 Session
- `2025-01-17-boot-syntax-fix.md` - Fixed initialization syntax error
- `2025-01-17-tile-persistence-fix.md` - Enabled zone/path placement persistence
- `2025-01-17-grid-rendering.md` - Added isometric grid visualization
- `2025-01-17-frustum-culling.md` - Implemented viewport-based rendering optimization (3-4x FPS boost)
- `2025-01-17-array-preallocation.md` - **CRITICAL: 6 FPS → 120 FPS by pre-allocating vertex arrays (20x performance boost)**
- `2025-01-17-n64-graphics-upgrade.md` - **MAJOR: Upgraded from SNES to N64-level graphics (dynamic lighting, ambient occlusion)**
- `2025-01-17-n64-entity-improvements.md` - **MAJOR: Added drop shadows, distance fog, dynamic lighting for entities + zone-based spawning**
