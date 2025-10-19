/**
 * WebGPU Renderer
 * High-performance isometric tile renderer using WebGPU with texture support
 */

import { TextureAtlas } from '../assets/texture-atlas.js';

export class Renderer {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.device = null;
    this.context = null;
    this.format = null;
    this.pipeline = null;
    this.vertexBuffer = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.texture = null;
    this.sampler = null;
    this.textureAtlas = null;

    // Rendering state
    this.tileWidth = 64;
    this.tileHeight = 32;
  }

  async initialize() {
    console.log('[Renderer] Initializing WebGPU...');

    // Request adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    this.device = await adapter.requestDevice();
    console.log('[Renderer] GPU device acquired');

    // Configure canvas context
    this.context = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied'
    });

    console.log('[Renderer] Canvas configured, format:', this.format);

    // Generate texture atlas
    console.log('[Renderer] Generating texture atlas...');
    this.textureAtlas = new TextureAtlas();
    await this.textureAtlas.generate();
    const atlasImage = this.textureAtlas.getAtlasImage();
    console.log('[Renderer] Texture atlas generated:', atlasImage.width, 'x', atlasImage.height);

    // Create WebGPU texture from atlas
    await this.createTextureFromAtlas(atlasImage);

    // Create rendering pipeline
    await this.createPipeline();

    // Create buffers
    this.createBuffers();

    console.log('[Renderer] Initialized successfully');
  }

  async createTextureFromAtlas(atlasCanvas) {
    // Create image bitmap from canvas
    const imageBitmap = await createImageBitmap(atlasCanvas);

    // Create texture
    this.texture = this.device.createTexture({
      label: 'Texture Atlas',
      size: [imageBitmap.width, imageBitmap.height, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    // Copy image to texture
    this.device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture: this.texture },
      [imageBitmap.width, imageBitmap.height]
    );

    // Create sampler with bilinear filtering for SNES-quality smooth graphics
    this.sampler = this.device.createSampler({
      label: 'Texture Sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      maxAnisotropy: 16 // High quality anisotropic filtering
    });

    console.log('[Renderer] WebGPU texture created');
  }

  async createPipeline() {
    // Shader code for isometric rendering with texture support
    const shaderCode = `
      struct Uniforms {
        cameraX: f32,
        cameraY: f32,
        zoom: f32,
        screenWidth: f32,
        screenHeight: f32,
        lightDirX: f32,
        lightDirY: f32,
        lightDirZ: f32,
        ambientLight: f32,
      };

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var textureSampler: sampler;
      @group(0) @binding(2) var textureData: texture_2d<f32>;

      struct VertexInput {
        @location(0) position: vec2f,
        @location(1) color: vec3f,
        @location(2) tilePos: vec2f,
        @location(3) uv: vec2f,
      };

      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) color: vec3f,
        @location(1) uv: vec2f,
      };

      @vertex
      fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;

        // Convert tile coordinates to isometric world space
        let tileX = input.tilePos.x;
        let tileY = input.tilePos.y;

        // Isometric projection
        let isoX = (tileX - tileY) * 32.0;
        let isoY = (tileX + tileY) * 16.0;

        // Add vertex offset
        let worldX = isoX + input.position.x;
        let worldY = isoY + input.position.y;

        // Apply camera and zoom
        let cameraOffsetX = worldX - uniforms.cameraX;
        let cameraOffsetY = worldY - uniforms.cameraY;

        let zoomedX = cameraOffsetX * uniforms.zoom;
        let zoomedY = cameraOffsetY * uniforms.zoom;

        // Convert to clip space (-1 to 1)
        let clipX = (zoomedX / uniforms.screenWidth) * 2.0;
        let clipY = -(zoomedY / uniforms.screenHeight) * 2.0;

        output.position = vec4f(clipX, clipY, 0.0, 1.0);
        output.color = input.color;
        output.uv = input.uv;

        return output;
      }

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        // Sample texture
        let texColor = textureSample(textureData, textureSampler, input.uv);

        // Mix texture with vertex color (lighting baked into vertex color)
        let finalColor = texColor.rgb * input.color;

        return vec4f(finalColor, texColor.a);
      }
    `;

    const shaderModule = this.device.createShaderModule({
      label: 'Isometric Tile Shader',
      code: shaderCode
    });

    // Create pipeline layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: 'Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {}
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {}
        }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: 'Pipeline Layout',
      bindGroupLayouts: [bindGroupLayout]
    });

    // Create render pipeline
    this.pipeline = this.device.createRenderPipeline({
      label: 'Isometric Render Pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: 9 * 4, // 2 (pos) + 3 (color) + 2 (tilePos) + 2 (uv) = 9 floats
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: 'float32x2'
            },
            {
              // color
              shaderLocation: 1,
              offset: 2 * 4,
              format: 'float32x3'
            },
            {
              // tilePos
              shaderLocation: 2,
              offset: 5 * 4,
              format: 'float32x2'
            },
            {
              // uv
              shaderLocation: 3,
              offset: 7 * 4,
              format: 'float32x2'
            }
          ]
        }]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{
          format: this.format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha'
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha'
            }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    // Create uniform buffer
    // 9 floats: camera(3) + screen(2) + lightDir(3) + ambient(1)
    this.uniformBuffer = this.device.createBuffer({
      label: 'Uniform Buffer',
      size: 9 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Create bind group (will be updated after texture is created)
    this.bindGroupLayout = bindGroupLayout;
    this.updateBindGroup();

    console.log('[Renderer] Pipeline created');
  }

  updateBindGroup() {
    if (!this.device || !this.uniformBuffer || !this.texture || !this.sampler) return;

    this.bindGroup = this.device.createBindGroup({
      label: 'Bind Group',
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer }
        },
        {
          binding: 1,
          resource: this.sampler
        },
        {
          binding: 2,
          resource: this.texture.createView()
        }
      ]
    });

    console.log('[Renderer] Bind group updated');
  }

  createBuffers() {
    // Create a large vertex buffer for tiles
    // We'll update this each frame
    const maxTiles = 10000;
    const verticesPerTile = 6; // 2 triangles
    const floatsPerVertex = 9; // 2 pos + 3 color + 2 tilePos + 2 uv

    const bufferSize = maxTiles * verticesPerTile * floatsPerVertex * 4; // * 4 for bytes

    this.vertexBuffer = this.device.createBuffer({
      label: 'Vertex Buffer',
      size: bufferSize,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    console.log('[Renderer] Buffers created');
  }

  render(state) {
    if (!this.device || !this.pipeline) return;

    // Cache state for later use (sky color, lighting)
    this.lastState = state;

    // Update uniforms
    this.updateUniforms(state.camera);

    // Build vertex data from map, UI, and entities
    const vertices = this.buildVertexData(state.map, state.ui, state.entities || [], state.camera);

    if (vertices.length === 0) {
      // Clear screen only
      this.clearScreen();
      return;
    }

    // Write vertex data to buffer
    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array(vertices)
    );

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Render Command Encoder'
    });

    // Get current texture from canvas
    const textureView = this.context.getCurrentTexture().createView();

    // Dark background (sky removed for now, but lighting still works)
    const renderPass = commandEncoder.beginRenderPass({
      label: 'Render Pass',
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.08, g: 0.08, b: 0.08, a: 1.0 }, // Very dark gray
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.draw(vertices.length / 9); // 9 floats per vertex

    renderPass.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);
  }

  updateUniforms(camera) {
    // Calculate light direction based on time of day
    const hour = this.lastState?.time?.hour || 12;

    // Light comes from top-left in day, changes angle at night
    const lightAngle = (hour / 24) * Math.PI * 2; // Full rotation over 24 hours
    const lightDirX = Math.cos(lightAngle) * 0.7;
    const lightDirY = Math.sin(lightAngle) * 0.3;
    const lightDirZ = 0.6; // Always some downward angle

    // Ambient light changes with time (darker at night)
    let ambientLight = 0.6; // Default day
    if (hour < 6 || hour >= 20) {
      ambientLight = 0.3; // Night
    } else if (hour < 7 || hour >= 19) {
      ambientLight = 0.45; // Dawn/Dusk
    }

    const uniforms = new Float32Array([
      camera.x,
      camera.y,
      camera.zoom,
      this.canvas.width,
      this.canvas.height,
      lightDirX,
      lightDirY,
      lightDirZ,
      ambientLight
    ]);

    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      uniforms
    );
  }

  buildVertexData(map, ui, entities, camera) {
    const { tiles, width, height } = map;

    // Calculate visible tile bounds for frustum culling
    const visibleBounds = this.calculateVisibleTileBounds(camera, width, height);

    const tilesInView = (visibleBounds.maxX - visibleBounds.minX + 1) * (visibleBounds.maxY - visibleBounds.minY + 1);

    // Debug logging (only occasionally to avoid spam)
    if (!this._debugCounter) this._debugCounter = 0;
    this._debugCounter++;
    if (this._debugCounter % 60 === 0) {
      console.log(`[Renderer] Tiles in view: ${tilesInView} | Bounds: (${visibleBounds.minX},${visibleBounds.minY}) to (${visibleBounds.maxX},${visibleBounds.maxY})`);
    }

    // FIRST: Draw grid lines as background layer (only for visible tiles)
    const ENABLE_GRID = true; // Grid now optimized!

    // Pre-allocate vertex array for better performance
    // Each tile = 6 vertices (2 triangles) * 9 floats = 54 floats
    // Grid adds ~12 vertices per tile edge = ~108 floats per tile
    // Estimate: visible tiles * (54 for tile + 108 for grid) * 2 buffer
    const estimatedVertices = tilesInView * 162 * 2; // Generous buffer for grid + tiles
    const vertices = new Array(estimatedVertices);
    let vertexIndex = 0;

    if (ENABLE_GRID) {
      const startGrid = performance.now();
      const gridStartIndex = vertexIndex;
      // Write grid directly into pre-allocated array
      vertexIndex = this.createGridLinesDirect(vertices, vertexIndex, width, height, visibleBounds);
      const gridTime = performance.now() - startGrid;
      const gridVerticesWritten = vertexIndex - gridStartIndex;

      if (this._debugCounter % 60 === 0) {
        console.log(`[Renderer] Grid: ${gridTime.toFixed(2)}ms | ${gridVerticesWritten} floats (${(gridVerticesWritten / 9).toFixed(0)} vertices)`);
      }
    }

    // Define tile colors based on type/zone
    const tileColors = {
      grass: [0.25, 0.6, 0.28],
      dirt: [0.55, 0.45, 0.25],
      concrete: [0.45, 0.45, 0.45],
      water: [0.2, 0.45, 0.75],
      recreation: [0.4, 0.7, 0.95],
      cultural: [0.95, 0.4, 0.7],
      sports: [0.95, 0.7, 0.4],
      nature: [0.4, 0.95, 0.4]
    };

    const buildingColors = {
      path: [0.6, 0.6, 0.6],
      lighting: [0.95, 0.95, 0.5],
      bench: [0.5, 0.35, 0.2],
      fountain: [0.5, 0.75, 0.95],
      security: [0.2, 0.35, 0.75],
      maintenance: [0.75, 0.5, 0.2],
      programs: [0.75, 0.2, 0.75]
    };

    // Iterate through visible tiles only (frustum culling)
    const startTiles = performance.now();
    let tilesRendered = 0;

    // Get lighting info once for all tiles (performance optimization)
    const hour = this.lastState?.time?.hour || 12;
    const lightAngle = (hour / 24) * Math.PI * 2;
    const lightIntensity = 0.5 + Math.cos(lightAngle) * 0.2; // Varies 0.3-0.7
    let ambient = 0.6;
    if (hour < 6 || hour >= 20) ambient = 0.3;
    else if (hour < 7 || hour >= 19) ambient = 0.45;

    for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y++) {
      for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x++) {
        // Bounds check
        if (x < 0 || x >= width || y < 0 || y >= height) continue;

        const tileIndex = y * width + x;
        const tile = tiles[tileIndex];

        if (!tile) continue;

        // Skip empty tiles (just show grid underneath)
        if (!tile.type && !tile.zone && !tile.building) continue;

        tilesRendered++;

        // Determine tile color (default to grass if type is present)
        let baseColor = tileColors[tile.type] || tileColors.grass;

        // Override with zone color if zoned
        if (tile.zone && tileColors[tile.zone]) {
          baseColor = tileColors[tile.zone];
        }

        // N64-style lighting: apply directional light and ambient (calculated once above)
        // Apply lighting to base color
        let color = [
          baseColor[0] * (ambient + lightIntensity * 0.4),
          baseColor[1] * (ambient + lightIntensity * 0.4),
          baseColor[2] * (ambient + lightIntensity * 0.4)
        ];

        // N64-style distance fog/depth cueing (tiles further from camera are darker)
        // Calculate distance from camera center
        const dx = x - camera.x;
        const dy = y - camera.y;
        const distanceFromCamera = Math.sqrt(dx * dx + dy * dy);

        // Fog based on distance from camera (not absolute map position)
        // Adjust fog range based on zoom level (more zoom = less fog)
        const fogDistance = 20 / camera.zoom; // Fog starts at ~20 tiles from camera
        const fogIntensity = Math.min(1, distanceFromCamera / fogDistance);
        const depthFactor = Math.max(0.7, 1.0 - fogIntensity * 0.3); // 0.7-1.0 range
        color = [color[0] * depthFactor, color[1] * depthFactor, color[2] * depthFactor];

        // Add ambient occlusion at tile edges (N64 style)
        const edgeDarken = 0.85;
        const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        if (isEdge) {
          color = [color[0] * edgeDarken, color[1] * edgeDarken, color[2] * edgeDarken];
        }

        // Highlight hovered tile
        let isHovered = false;
        if (ui.hoveredTile && ui.hoveredTile.x === x && ui.hoveredTile.y === y) {
          color = [Math.min(1, color[0] * 1.4), Math.min(1, color[1] * 1.4), Math.min(1, color[2] * 1.4)];
          isHovered = true;
        }

        // Highlight selected tile
        if (ui.selectedTile && ui.selectedTile.x === x && ui.selectedTile.y === y) {
          color = [Math.min(1, color[0] * 1.6), Math.min(1, color[1] * 1.6), Math.min(1, color[2] * 1.6)];
        }

        // Add tile vertices (isometric diamond) with texture
        const spriteName = tile.zone || tile.type || 'grass';
        const tileVertices = this.createIsometricTileVertices(x, y, color, spriteName);

        // Copy directly into pre-allocated array
        for (let i = 0; i < tileVertices.length; i++) {
          vertices[vertexIndex++] = tileVertices[i];
        }

        // Add outline for tiles
        if (isHovered || (ui.selectedTile && ui.selectedTile.x === x && ui.selectedTile.y === y)) {
          const outlineColor = [1, 1, 1];
          const outlineVertices = this.createTileOutline(x, y, outlineColor);
          for (let i = 0; i < outlineVertices.length; i++) {
            vertices[vertexIndex++] = outlineVertices[i];
          }
        }

        // Add building if present
        if (tile.building && buildingColors[tile.building]) {
          const buildingColor = [1, 1, 1]; // White tint for texture
          const buildingVertices = this.createBuildingVertices(x, y, buildingColor, tile.building);
          for (let i = 0; i < buildingVertices.length; i++) {
            vertices[vertexIndex++] = buildingVertices[i];
          }
        }
      }
    }

    const tilesTime = performance.now() - startTiles;

    if (this._debugCounter % 60 === 0) {
      console.log(`[Renderer] Tiles rendered: ${tilesRendered} | Tile processing: ${tilesTime.toFixed(2)}ms`);
    }

    // Render entities (people, characters, activities)
    if (entities && entities.length > 0) {
      entities.forEach(entity => {
        const entityVertices = this.createEntityVertices(entity);
        if (entityVertices.length > 0) {
          for (let i = 0; i < entityVertices.length; i++) {
            vertices[vertexIndex++] = entityVertices[i];
          }
        }
      });
    }

    // Render preview tiles during drag
    if (ui.preview && ui.preview.tiles && ui.preview.tiles.length > 0) {
      const previewColor = [1, 1, 1]; // White ghost
      const previewSprite = ui.preview.tool || 'grass';

      ui.preview.tiles.forEach(tile => {
        // Semi-transparent preview (achieved with lighter color)
        const ghostColor = [0.7, 0.7, 0.7];
        const previewVertices = this.createIsometricTileVertices(tile.x, tile.y, ghostColor, previewSprite);
        for (let i = 0; i < previewVertices.length; i++) {
          vertices[vertexIndex++] = previewVertices[i];
        }

        // White outline for preview
        const outlineVertices = this.createTileOutline(tile.x, tile.y, [1, 1, 1]);
        for (let i = 0; i < outlineVertices.length; i++) {
          vertices[vertexIndex++] = outlineVertices[i];
        }
      });
    }

    // Trim array to actual size
    vertices.length = vertexIndex;

    if (this._debugCounter % 60 === 0) {
      console.log(`[Renderer] Total vertices: ${vertexIndex} | Vertex floats: ${vertexIndex * 4} bytes`);
    }

    return vertices;
  }

  createIsometricTileVertices(tileX, tileY, color, spriteName) {
    // Isometric tile is a diamond shape
    // We'll create it as 2 triangles (6 vertices)
    const w = this.tileWidth / 2;
    const h = this.tileHeight / 2;

    // Four corners of the diamond
    const top = [0, -h];
    const right = [w, 0];
    const bottom = [0, h];
    const left = [-w, 0];

    // Get UV coordinates for sprite
    const sprite = this.textureAtlas.getSprite(spriteName) || this.textureAtlas.getSprite('grass');
    const u = sprite.u;
    const v = sprite.v;
    const uSize = sprite.uSize;
    const vSize = sprite.vSize;

    // UV coordinates for the four corners (mapping to sprite corners)
    const uvTop = [u + uSize * 0.5, v];
    const uvRight = [u + uSize, v + vSize * 0.5];
    const uvBottom = [u + uSize * 0.5, v + vSize];
    const uvLeft = [u, v + vSize * 0.5];

    // Two triangles: top-right-bottom, top-bottom-left
    const vertices = [];

    // Triangle 1: top, right, bottom
    vertices.push(...top, ...color, tileX, tileY, ...uvTop);
    vertices.push(...right, ...color, tileX, tileY, ...uvRight);
    vertices.push(...bottom, ...color, tileX, tileY, ...uvBottom);

    // Triangle 2: top, bottom, left
    vertices.push(...top, ...color, tileX, tileY, ...uvTop);
    vertices.push(...bottom, ...color, tileX, tileY, ...uvBottom);
    vertices.push(...left, ...color, tileX, tileY, ...uvLeft);

    return vertices;
  }

  createBuildingVertices(tileX, tileY, color, buildingType) {
    // Render building sprite
    const w = this.tileWidth / 2;
    const h = this.tileHeight / 2;
    const offsetY = -this.tileHeight / 3; // Raise it up

    const top = [0, -h + offsetY];
    const right = [w, 0 + offsetY];
    const bottom = [0, h + offsetY];
    const left = [-w, 0 + offsetY];

    // Get UV coordinates for building sprite
    const sprite = this.textureAtlas.getSprite(buildingType) || this.textureAtlas.getSprite('path');
    const u = sprite.u;
    const v = sprite.v;
    const uSize = sprite.uSize;
    const vSize = sprite.vSize;

    // UV coordinates for the four corners
    const uvTop = [u + uSize * 0.5, v];
    const uvRight = [u + uSize, v + vSize * 0.5];
    const uvBottom = [u + uSize * 0.5, v + vSize];
    const uvLeft = [u, v + vSize * 0.5];

    const vertices = [];

    // Triangle 1
    vertices.push(...top, ...color, tileX, tileY, ...uvTop);
    vertices.push(...right, ...color, tileX, tileY, ...uvRight);
    vertices.push(...bottom, ...color, tileX, tileY, ...uvBottom);

    // Triangle 2
    vertices.push(...top, ...color, tileX, tileY, ...uvTop);
    vertices.push(...bottom, ...color, tileX, tileY, ...uvBottom);
    vertices.push(...left, ...color, tileX, tileY, ...uvLeft);

    return vertices;
  }

  calculateVisibleTileBounds(camera, mapWidth, mapHeight) {
    // Calculate which tiles are visible based on camera position and zoom
    const screenWidth = this.canvas.width;
    const screenHeight = this.canvas.height;

    // Calculate world space bounds of the screen
    const halfScreenWidth = screenWidth / (2 * camera.zoom);
    const halfScreenHeight = screenHeight / (2 * camera.zoom);

    // Convert world bounds to tile coordinates with padding
    const padding = 5; // Extra tiles around edges for safety
    const minWorldX = camera.x - halfScreenWidth;
    const maxWorldX = camera.x + halfScreenWidth;
    const minWorldY = camera.y - halfScreenHeight;
    const maxWorldY = camera.y + halfScreenHeight;

    // Isometric conversion (approximate, conservative bounds)
    // For isometric, we need to check both X and Y ranges
    const tileWidth = 64;
    const tileHeight = 32;

    // Conservative approach for isometric view
    // Isometric tiles need wider bounds due to diamond shape
    // Use larger padding and account for isometric projection
    const isoPadding = padding * 3; // Triple padding for isometric safety

    const minTileX = Math.floor(minWorldX / tileWidth) - isoPadding;
    const maxTileX = Math.ceil(maxWorldX / tileWidth) + isoPadding;
    const minTileY = Math.floor(minWorldY / tileHeight) - isoPadding;
    const maxTileY = Math.ceil(maxWorldY / tileHeight) + isoPadding;

    const bounds = {
      minX: Math.max(0, minTileX),
      maxX: Math.min(mapWidth - 1, maxTileX),
      minY: Math.max(0, minTileY),
      maxY: Math.min(mapHeight - 1, maxTileY)
    };

    // Debug: Log bounds EVERY frame when zoomed in to debug issue
    if (!this._boundsDebugCounter) this._boundsDebugCounter = 0;
    this._boundsDebugCounter++;
    const expectedTiles = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);

    // Only log occasionally now that culling is working
    if (this._boundsDebugCounter % 120 === 0) {
      console.log(`[Frustum] Camera zoom: ${camera.zoom.toFixed(2)} | Rendering ${expectedTiles} tiles`);
    }

    return bounds;
  }

  createGridLinesDirect(vertices, startIndex, width, height, visibleBounds) {
    // Create faint gray grid lines for visible tiles only
    // Write directly into pre-allocated array for performance
    let idx = startIndex;

    // N64-style: Grid brightness changes with time of day
    const hour = this.lastState?.time?.hour || 12;
    let gridBrightness = 0.8; // Day
    if (hour < 6 || hour >= 20) gridBrightness = 0.4; // Night
    else if (hour < 7 || hour >= 19) gridBrightness = 0.6; // Dawn/Dusk

    const gridColor = [gridBrightness, gridBrightness, gridBrightness];
    const w = this.tileWidth / 2;
    const h = this.tileHeight / 2;
    const thickness = 1.5; // Slightly thicker lines for visibility

    // Use grass sprite UV (just needs something)
    const sprite = this.textureAtlas.getSprite('grass');
    const u = sprite.u + sprite.uSize * 0.5;
    const v = sprite.v + sprite.vSize * 0.5;

    // Helper to write vertex
    const writeVertex = (px, py, tileX, tileY) => {
      vertices[idx++] = px;
      vertices[idx++] = py;
      vertices[idx++] = gridColor[0];
      vertices[idx++] = gridColor[1];
      vertices[idx++] = gridColor[2];
      vertices[idx++] = tileX;
      vertices[idx++] = tileY;
      vertices[idx++] = u;
      vertices[idx++] = v;
    };

    // Draw grid lines for each visible tile only
    for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y++) {
      for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x++) {
        // Bounds check
        if (x < 0 || x >= width || y < 0 || y >= height) continue;

        const top = [0, -h];
        const right = [w, 0];
        const bottom = [0, h];
        const left = [-w, 0];

        // Only draw right and bottom edges to avoid double-drawing lines
        // Right edge (from top to right)
        if (x < width - 1) {
          const topInner = [top[0] + thickness, top[1]];
          const rightInner = [right[0] - thickness, right[1]];

          writeVertex(top[0], top[1], x, y);
          writeVertex(topInner[0], topInner[1], x, y);
          writeVertex(right[0], right[1], x, y);

          writeVertex(topInner[0], topInner[1], x, y);
          writeVertex(rightInner[0], rightInner[1], x, y);
          writeVertex(right[0], right[1], x, y);
        }

        // Bottom edge (from right to bottom)
        if (y < height - 1) {
          const rightInner = [right[0], right[1] + thickness];
          const bottomInner = [bottom[0] + thickness, bottom[1]];

          writeVertex(right[0], right[1], x, y);
          writeVertex(rightInner[0], rightInner[1], x, y);
          writeVertex(bottom[0], bottom[1], x, y);

          writeVertex(rightInner[0], rightInner[1], x, y);
          writeVertex(bottomInner[0], bottomInner[1], x, y);
          writeVertex(bottom[0], bottom[1], x, y);
        }

        // Left edge (close left side of map)
        if (x === 0) {
          const topInner = [top[0] - thickness, top[1]];
          const leftInner = [left[0] + thickness, left[1]];

          writeVertex(top[0], top[1], x, y);
          writeVertex(left[0], left[1], x, y);
          writeVertex(topInner[0], topInner[1], x, y);

          writeVertex(topInner[0], topInner[1], x, y);
          writeVertex(left[0], left[1], x, y);
          writeVertex(leftInner[0], leftInner[1], x, y);
        }

        // Top edge (close top side of map)
        if (y === 0) {
          const leftInner = [left[0], left[1] - thickness];
          const bottomInner = [bottom[0] - thickness, bottom[1]];

          writeVertex(left[0], left[1], x, y);
          writeVertex(leftInner[0], leftInner[1], x, y);
          writeVertex(bottom[0], bottom[1], x, y);

          writeVertex(leftInner[0], leftInner[1], x, y);
          writeVertex(bottomInner[0], bottomInner[1], x, y);
          writeVertex(bottom[0], bottom[1], x, y);
        }
      }
    }

    return idx; // Return new index position
  }

  createTileOutline(tileX, tileY, color) {
    // Create a thin outline around the tile
    const w = this.tileWidth / 2;
    const h = this.tileHeight / 2;
    const thickness = 2; // pixels

    const top = [0, -h];
    const right = [w, 0];
    const bottom = [0, h];
    const left = [-w, 0];

    // Use grass sprite UV (just needs something)
    const sprite = this.textureAtlas.getSprite('grass');
    const uv = [sprite.u + sprite.uSize * 0.5, sprite.v + sprite.vSize * 0.5];

    const vertices = [];

    // Create 4 thin triangles forming the outline
    // Top edge (from top to right)
    vertices.push(...top, ...color, tileX, tileY, ...uv);
    vertices.push(top[0] - thickness, top[1], ...color, tileX, tileY, ...uv);
    vertices.push(...right, ...color, tileX, tileY, ...uv);

    // Right edge (from right to bottom)
    vertices.push(...right, ...color, tileX, tileY, ...uv);
    vertices.push(right[0], right[1] + thickness, ...color, tileX, tileY, ...uv);
    vertices.push(...bottom, ...color, tileX, tileY, ...uv);

    // Bottom edge (from bottom to left)
    vertices.push(...bottom, ...color, tileX, tileY, ...uv);
    vertices.push(bottom[0] + thickness, bottom[1], ...color, tileX, tileY, ...uv);
    vertices.push(...left, ...color, tileX, tileY, ...uv);

    // Left edge (from left to top)
    vertices.push(...left, ...color, tileX, tileY, ...uv);
    vertices.push(left[0], left[1] - thickness, ...color, tileX, tileY, ...uv);
    vertices.push(...top, ...color, tileX, tileY, ...uv);

    return vertices;
  }

  createEntityVertices(entity) {
    // Render entities with textured sprites + N64-style drop shadow
    let vertices = [];

    // FIRST: Render drop shadow (N64 style)
    const shadowVertices = this.createEntityShadow(entity);
    for (let i = 0; i < shadowVertices.length; i++) {
      vertices.push(shadowVertices[i]);
    }

    // THEN: Render actual sprite on top
    const spriteVertices = this.createEntitySprite(entity);
    for (let i = 0; i < spriteVertices.length; i++) {
      vertices.push(spriteVertices[i]);
    }

    return vertices;
  }

  createEntityShadow(entity) {
    // N64-style drop shadow - dark ellipse on ground
    const vertices = [];

    const entityWidth = entity.width || 1;
    const entityHeight = entity.height || 1;
    const isMultiTile = entityWidth > 1 || entityHeight > 1;

    // Shadow size and offset
    const shadowSize = isMultiTile ? 12 : 8;
    const shadowOffsetY = 2; // Offset down from entity position
    const shadowColor = [0.0, 0.0, 0.0]; // Black shadow, will be semi-transparent via alpha

    // Create flattened ellipse shape (4 triangles forming rough circle)
    const centerX = 0;
    const centerY = shadowOffsetY;
    const radiusX = shadowSize;
    const radiusY = shadowSize * 0.4; // Squashed vertically for ground projection

    // Use a single dark pixel from texture (grass sprite center works)
    const sprite = this.textureAtlas.getSprite('grass');
    const u = sprite.u + sprite.uSize * 0.5;
    const v = sprite.v + sprite.vSize * 0.5;

    // Create 8-point ellipse
    const points = 8;
    for (let i = 0; i < points; i++) {
      const angle1 = (i / points) * Math.PI * 2;
      const angle2 = ((i + 1) / points) * Math.PI * 2;

      const x1 = centerX + Math.cos(angle1) * radiusX;
      const y1 = centerY + Math.sin(angle1) * radiusY;
      const x2 = centerX + Math.cos(angle2) * radiusX;
      const y2 = centerY + Math.sin(angle2) * radiusY;

      // Triangle from center to edge points
      vertices.push(
        centerX, centerY, ...shadowColor, entity.x, entity.y, u, v,
        x1, y1, ...shadowColor, entity.x, entity.y, u, v,
        x2, y2, ...shadowColor, entity.x, entity.y, u, v
      );
    }

    return vertices;
  }

  createEntitySprite(entity) {
    // Render the actual entity sprite
    const vertices = [];

    // Determine sprite name
    let spriteName = 'visitor';
    if (entity.type === 'special' && entity.characterType) {
      spriteName = entity.characterType;
    } else if (entity.type === 'visitor' && entity.visitorType) {
      // Map visitor types to sprite names
      const visitorSpriteMap = {
        'hipster': 'hipster',
        'dog-owner': 'dog-walker',
        'default': 'visitor'
      };
      spriteName = visitorSpriteMap[entity.visitorType] || 'visitor';
    } else if (entity.type === 'activity' && entity.activityType) {
      spriteName = entity.activityType;

      // Debug log for activities
      if (!this._activityDebug) this._activityDebug = {};
      if (!this._activityDebug[entity.id]) {
        console.log(`[Renderer] Rendering activity: ${spriteName} at (${entity.x.toFixed(1)}, ${entity.y.toFixed(1)}) tilesOccupied:`, entity.tilesOccupied);
        this._activityDebug[entity.id] = true;
      }
    }

    // Get sprite UV
    const sprite = this.textureAtlas.getSprite(spriteName);
    if (!sprite) {
      console.warn(`[Renderer] No sprite found for: ${spriteName}, using visitor fallback`);
    }
    const spriteData = sprite || this.textureAtlas.getSprite('visitor');
    const u = spriteData.u;
    const v = spriteData.v;
    const uSize = spriteData.uSize;
    const vSize = spriteData.vSize;

    // Get entity dimensions from tilesOccupied or fallback to widthInTiles/heightInTiles
    let entityWidth = 1;
    let entityHeight = 1;

    if (entity.tilesOccupied) {
      // Multi-tile entities (activities)
      entityWidth = entity.tilesOccupied.x;
      entityHeight = entity.tilesOccupied.y;
    } else if (entity.widthInTiles || entity.heightInTiles) {
      // Single-tile entities with sub-tile dimensions
      entityWidth = entity.widthInTiles || 1;
      entityHeight = entity.heightInTiles || 1;
    }

    // For multi-tile entities, scale the sprite proportionally
    const isMultiTile = entity.tilesOccupied && (entity.tilesOccupied.x > 1 || entity.tilesOccupied.y > 1);

    // Use renderSize from entity config if available, otherwise use defaults
    let size, height;
    if (entity.renderSize) {
      // Entity has scaled render size from config (entity-config.js)
      size = entity.renderSize;
      height = isMultiTile ? 8 : 15;
    } else if (isMultiTile) {
      // Multi-tile activities (sports fields, stages, etc.)
      size = 8;
      height = 8;
    } else {
      // Single-tile entities (people, small activities) - fallback
      size = 10;
      height = 15;
    }

    const centerX = 0;
    const centerY = -height;

    // Scale width and height for multi-tile entities
    let sizeX, sizeY;
    if (isMultiTile) {
      // Multi-tile entities: scale based on tile footprint in isometric space
      // Each tile is a diamond: half-width=32px, half-height=16px
      const tileHalfWidth = 32;  // Half of tileWidth (64px)
      const tileHalfHeight = 16;  // Half of tileHeight (32px)

      // Multiply by number of tiles to get full footprint
      sizeX = entityWidth * tileHalfWidth;   // e.g., 2x2 = 64px half-width
      sizeY = entityHeight * tileHalfHeight;  // e.g., 2x2 = 32px half-height

      // Debug log for multi-tile entities (occasionally)
      if (!this._multiTileDebug) this._multiTileDebug = {};
      if (!this._multiTileDebug[entity.id]) {
        console.log(`[Renderer] Multi-tile entity: ${entity.activityType || entity.type} - ${entityWidth}×${entityHeight} tiles - sprite size: ${sizeX*2}×${sizeY*2}px`);
        this._multiTileDebug[entity.id] = true;
      }
    } else {
      // Single-tile entities: use size directly (people, small items)
      sizeX = size;
      sizeY = size;
    }

    const top = [centerX, centerY - sizeY];
    const right = [centerX + sizeX, centerY];
    const bottom = [centerX, centerY + sizeY];
    const left = [centerX - sizeX, centerY];

    // UV coordinates for corners
    const uvTop = [u + uSize * 0.5, v];
    const uvRight = [u + uSize, v + vSize * 0.5];
    const uvBottom = [u + uSize * 0.5, v + vSize];
    const uvLeft = [u, v + vSize * 0.5];

    // N64-style lighting for entities (match tile lighting)
    const hour = this.lastState?.time?.hour || 12;
    const lightAngle = (hour / 24) * Math.PI * 2;
    const lightIntensity = 0.5 + Math.cos(lightAngle) * 0.2;
    let ambient = 0.6;
    if (hour < 6 || hour >= 20) ambient = 0.3;
    else if (hour < 7 || hour >= 19) ambient = 0.45;

    // Apply lighting to entity
    let brightness = ambient + lightIntensity * 0.4;

    // Distance fog for entities (match tile camera-relative fog)
    const state = this.lastState;
    if (state && state.camera) {
      const camera = state.camera;
      const dx = entity.x - camera.x;
      const dy = entity.y - camera.y;
      const distanceFromCamera = Math.sqrt(dx * dx + dy * dy);

      // Match tile fog calculation
      const fogDistance = 20 / camera.zoom;
      const fogIntensity = Math.min(1, distanceFromCamera / fogDistance);
      const depthFactor = Math.max(0.7, 1.0 - fogIntensity * 0.3);
      brightness *= depthFactor;
    }

    const color = [brightness, brightness, brightness];

    // Two triangles for the sprite
    vertices.push(...top, ...color, entity.x, entity.y, ...uvTop);
    vertices.push(...right, ...color, entity.x, entity.y, ...uvRight);
    vertices.push(...bottom, ...color, entity.x, entity.y, ...uvBottom);

    vertices.push(...top, ...color, entity.x, entity.y, ...uvTop);
    vertices.push(...bottom, ...color, entity.x, entity.y, ...uvBottom);
    vertices.push(...left, ...color, entity.x, entity.y, ...uvLeft);

    return vertices;
  }

  getLastState() {
    return this.lastState;
  }

  calculateSkyColor(hour) {
    // N64-style sky gradient based on time of day
    // Smooth transitions between day/night cycle

    // Dawn: 5-7 AM - warm orange/pink
    // Day: 7 AM - 5 PM - bright blue
    // Dusk: 5-7 PM - orange/purple
    // Night: 7 PM - 5 AM - dark blue/purple

    if (hour >= 5 && hour < 7) {
      // Dawn - warm orange transitioning to blue
      const t = (hour - 5) / 2; // 0 to 1
      return {
        r: 0.8 - t * 0.3,   // 0.8 -> 0.5
        g: 0.5 + t * 0.2,   // 0.5 -> 0.7
        b: 0.6 + t * 0.3    // 0.6 -> 0.9
      };
    } else if (hour >= 7 && hour < 17) {
      // Day - bright blue sky
      return { r: 0.53, g: 0.81, b: 0.98 }; // Light sky blue
    } else if (hour >= 17 && hour < 19) {
      // Dusk - blue to orange/purple
      const t = (hour - 17) / 2; // 0 to 1
      return {
        r: 0.53 + t * 0.35,  // 0.53 -> 0.88
        g: 0.81 - t * 0.36,  // 0.81 -> 0.45
        b: 0.98 - t * 0.33   // 0.98 -> 0.65
      };
    } else {
      // Night - dark blue/purple
      return { r: 0.12, g: 0.15, b: 0.28 }; // Dark night blue
    }
  }

  clearScreen() {
    const commandEncoder = this.device.createCommandEncoder();
    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.08, g: 0.08, b: 0.08, a: 1.0 }, // Dark gray
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  resize(width, height) {
    // Canvas is already resized by boot.js
    console.log('[Renderer] Resized to', width, 'x', height);
  }

  destroy() {
    if (this.vertexBuffer) {
      this.vertexBuffer.destroy();
    }
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    if (this.device) {
      this.device.destroy();
    }
  }
}
