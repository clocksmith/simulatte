# CBG - McCarren Park Simulator

An isometric park management game set in McCarren Park, Williamsburg Brooklyn. Built with pure TypeScript, WebGPU, and zero dependencies.

## Features

### Graphics System
- **16-bit Pixel Art**: Procedurally generated texture atlas with detailed sprites
- **WebGPU Rendering**: Hardware-accelerated isometric projection
- **Textured Tiles**: Grass with variation, brick paths, wavy water, concrete patterns
- **Detailed Buildings**: Lamp posts with glowing lights, wooden benches, fountains with spray, service buildings with icons
- **Character Sprites**: TV Bike Guy with actual TV!, hipsters with beards, accordion players, dog walkers, tarot readers, DJs with turntables

### Building Tools
- **Drag-to-Draw Paths**: Click and drag to paint continuous paths using Bresenham line algorithm
- **Rectangular Zones**: Click and drag to create rectangular zones like SimCity 2000
- **Real-time Preview**: White ghost overlay shows what will be placed during drag
- **Budget Management**: Automatic cost calculation and validation for bulk operations

### Gameplay
- **SimCity-Style Zoning**: Recreation, Cultural, Sports, and Nature zones spawn activities
- **Seasonal System**: 4 seasons with different activities and spawn rates
- **Williamsburg Culture**: Spikeball, outdoor DJs, accordion players, tarot readers, dogs off-leash
- **Time Simulation**: Dynamic day/night cycle with visitor patterns
- **Park Services**: Lighting, security, maintenance, and programs (like SimCity's power/police/fire/schools)

## Controls

### Mouse
- **Left Click + Drag**: Draw paths or create rectangular zones
- **Right Click + Drag**: Pan camera
- **Mouse Wheel**: Zoom in/out
- **Left Click (Inspect)**: View tile information

### Keyboard
- **Arrow Keys / WASD**: Pan camera
- **Space**: Pause/Resume
- **+/=**: Cycle game speed (1x → 2x → 4x)
- **I**: Inspect tool
- **B**: Bulldoze tool
- **R**: Recreation zone
- **C**: Cultural zone

## Architecture

### Core Systems
- **store.js**: Redux-style state management with immutability
- **boot.js**: Initialization sequence and module coordination
- **webgpu-renderer.js**: Isometric renderer with texture sampling (WGSL shaders)
- **input-manager.js**: Mouse/keyboard handling with isometric coordinate conversion
- **drag-handler.js**: Drag-to-draw system with line/rectangle algorithms

### Game Systems
- **zone-manager.js**: SimCity-style zone spawning with rules
- **season-manager.js**: Seasonal transitions and temperature simulation
- **time-manager.js**: Day/night cycle and time progression
- **spawn-manager.js**: Character and visitor spawning (TV bike guy!)
- **service-manager.js**: Park service management

### Assets
- **texture-atlas.js**: Procedural 16-bit sprite generator (920 lines!)

## Technical Details

### WebGPU Rendering Pipeline
1. **Texture Atlas**: 64x64 sprites generated on canvas, uploaded to GPU
2. **Vertex Shader**: Converts tile coordinates to isometric world space, applies camera transform
3. **Fragment Shader**: Samples texture atlas with UV coordinates, mixes with vertex color for tinting
4. **Vertex Format**: 9 floats per vertex (position, color, tilePos, UV)
5. **Batch Rendering**: All tiles/buildings/entities rendered in single draw call

### Sprite System
- **Texture Atlas**: 16x16 grid of 64x64 sprites (1024x1024 total)
- **UV Mapping**: Each sprite has normalized UV coordinates (0-1 range)
- **Nearest Neighbor Sampling**: Preserves pixelated 16-bit aesthetic
- **Procedural Generation**: All sprites generated at runtime via Canvas 2D API

### Drag System
- **Bresenham Line Algorithm**: Smooth continuous lines for paths
- **Rectangular Selection**: Min/max coordinate calculation for zones
- **Preview State**: Stored in Redux store, rendered with white ghost overlay
- **Batched Operations**: Applies all changes at once on mouse up

## Browser Support

Requires WebGPU:
- Chrome/Edge 113+
- Safari 17+ (partial support)
- Firefox Nightly (experimental)

## Performance

- **Target**: 60 FPS
- **Rendering**: Single GPU draw call per frame
- **Vertex Count**: ~60,000 vertices for 64x64 map with entities
- **Texture Memory**: ~4MB for 1024x1024 RGBA atlas
- **State Updates**: Immutable updates with structural sharing

## Code Stats

- **Total Files**: 18
- **Total Lines**: ~7,000+
- **Main Systems**: 14 TypeScript modules
- **No Build Required**: Pure ES6 modules

## Development

No build process required. Just serve and run:

```bash
# Any static server works
python -m http.server 8000

# Or use Firebase
firebase serve
```

Open `http://localhost:8000/public/cbg/` in Chrome/Edge.

## What's Next

- Entity pathfinding and movement
- Animated sprites (walking, playing)
- Weather system
- More Williamsburg characters
- Save/load system
- Multiple maps beyond McCarren Park
- OpenStreetMap import

## Credits

Inspired by SimCity 2000 and the vibrant culture of Williamsburg, Brooklyn.

Built with modern Web APIs as part of the Simulatte collection.
