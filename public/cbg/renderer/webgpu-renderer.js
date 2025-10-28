/**
 * WebGPU Renderer
 * High-performance isometric tile renderer using WebGPU with texture support
 */

import { TextureAtlas } from '../assets/texture-atlas.js';
import {
  createGPUContext,
  createDefaultSampler,
  createTextureFromCanvas,
  resizeCanvasToDisplaySize
} from './gpu-helpers.js';

const FLOATS_PER_VERTEX = 9;
const VERTICES_PER_QUAD = 6;
const FLOATS_PER_QUAD = FLOATS_PER_VERTEX * VERTICES_PER_QUAD;
const UNIFORM_FLOAT_COUNT = 12;
const UNIFORM_BUFFER_SIZE = UNIFORM_FLOAT_COUNT * 4;

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
    this.gridCache = null;
    this.contextInfo = null;
    this.showGrid = true;

    // Rendering state
    this.tileWidth = 64;
    this.tileHeight = 32;
    this.halfTileWidth = this.tileWidth / 2;
    this.halfTileHeight = this.tileHeight / 2;

    this.vertexScratch = new Float32Array(FLOATS_PER_QUAD * 256);
    this.vertexFloatCapacity = this.vertexScratch.length;
    this.lastVertexCount = 0;
    this.devicePixelRatio = 1;

    this.tileColors = {
      grass: [0.25, 0.6, 0.28],
      dirt: [0.55, 0.45, 0.25],
      concrete: [0.45, 0.45, 0.45],
      water: [0.2, 0.45, 0.75],
      recreation: [0.4, 0.7, 0.95],
      cultural: [0.95, 0.4, 0.7],
      sports: [0.95, 0.7, 0.4],
      nature: [0.4, 0.95, 0.4]
    };

    this.buildingColors = {
      path: [0.6, 0.6, 0.6],
      lighting: [0.95, 0.95, 0.5],
      bench: [0.5, 0.35, 0.2],
      fountain: [0.5, 0.75, 0.95],
      security: [0.2, 0.35, 0.75],
      maintenance: [0.75, 0.5, 0.2],
      programs: [0.75, 0.2, 0.75]
    };
  }

  async initialize() {
    console.log('[Renderer] Initializing WebGPU...');

    const { width, height, dpr } = resizeCanvasToDisplaySize(this.canvas, { maxDevicePixelRatio: 2 });
    this.devicePixelRatio = dpr;

    this.contextInfo = await createGPUContext(this.canvas, { powerPreference: 'high-performance' });
    if (this.contextInfo.type !== 'webgpu') {
      throw new Error('WebGPU adapter not available; WebGL fallback is not yet implemented in this build.');
    }

    this.device = this.contextInfo.device;
    this.context = this.contextInfo.context;
    this.format = this.contextInfo.format;

    console.log('[Renderer] Canvas configured, format:', this.format, '| size:', width, 'x', height, '| DPR:', dpr.toFixed(2));

    // Generate texture atlas
    console.log('[Renderer] Generating texture atlas...');
    this.textureAtlas = new TextureAtlas();
    await this.textureAtlas.generate();
    const atlasImage = this.textureAtlas.getAtlasImage();
    console.log('[Renderer] Texture atlas generated:', atlasImage.width, 'x', atlasImage.height);

    // Create GPU texture & sampler from atlas
    await this.createTextureFromAtlas(atlasImage);

    // Create rendering pipeline
    await this.createPipeline();

    // Create buffers
    this.createBuffers();

    console.log('[Renderer] Initialized successfully');
  }

  async createTextureFromAtlas(atlasCanvas) {
    const { texture } = await createTextureFromCanvas(this.device, atlasCanvas, {
      label: 'Texture Atlas',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    this.texture = texture;
    this.sampler = createDefaultSampler(this.device, {
      label: 'Texture Sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear'
    });

    console.log('[Renderer] Texture atlas uploaded to GPU');
  }

  async createPipeline() {
    // Shader code for isometric rendering with texture support
    const shaderCode = `
      struct Uniforms {
        view: vec4f;   // cameraX, cameraY, zoom, fogDensity
        screen: vec4f; // screenWidth, screenHeight, sunIntensity, dayMix
        light: vec4f;  // lightDirX, lightDirY, lightDirZ, ambient
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
        @location(2) cameraOffset: vec2f,
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
        let cameraOffsetX = worldX - uniforms.view.x;
        let cameraOffsetY = worldY - uniforms.view.y;

        let zoomedX = cameraOffsetX * uniforms.view.z;
        let zoomedY = cameraOffsetY * uniforms.view.z;

        // Convert to clip space (-1 to 1)
        let clipX = (zoomedX / uniforms.screen.x) * 2.0;
        let clipY = -(zoomedY / uniforms.screen.y) * 2.0;

        output.position = vec4f(clipX, clipY, 0.0, 1.0);
        output.color = input.color;
        output.uv = input.uv;
        output.cameraOffset = vec2f(cameraOffsetX, cameraOffsetY);

        return output;
      }

      fn computeFog(distance: f32, density: f32) -> f32 {
        let fog = exp(-density * distance);
        return clamp(fog, 0.0, 1.0);
      }

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        // Sample texture
        let texColor = textureSample(textureData, textureSampler, input.uv);

        let baseColor = texColor.rgb * input.color;

        // Dynamic lighting (Lambert) with ambient
        let lightDir = normalize(vec3f(uniforms.light.x, uniforms.light.y, uniforms.light.z));
        let lambert = clamp(dot(lightDir, vec3f(0.0, 0.0, 1.0)), 0.0, 1.0);
        let litColor = baseColor * (uniforms.light.w + lambert * uniforms.screen.z);

        // Fog based on distance from camera
        let distance = length(input.cameraOffset);
        let fogFactor = computeFog(distance, uniforms.view.w);

        // Time-of-day tint (night → dawn → day)
        let fogColor = mix(vec3f(0.06, 0.07, 0.10), vec3f(0.28, 0.32, 0.45), uniforms.screen.w);

        let finalColor = mix(fogColor, litColor, fogFactor);
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
    this.uniformBuffer = this.device.createBuffer({
      label: 'Uniform Buffer',
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // Create bind group (will be updated after texture is created)
    this.bindGroupLayout = bindGroupLayout;
    this.updateBindGroup();

    console.log('[Renderer] Pipeline created');
  }

  _ensureScratchCapacity(minFloats, copyUntil = 0) {
    if (minFloats <= this.vertexFloatCapacity) return;
    let newCapacity = this.vertexFloatCapacity || FLOATS_PER_QUAD * 256;
    while (newCapacity < minFloats) {
      newCapacity *= 2;
    }
    const newBuffer = new Float32Array(newCapacity);
    if (copyUntil > 0 && this.vertexScratch) {
      newBuffer.set(this.vertexScratch.subarray(0, copyUntil));
    }
    this.vertexScratch = newBuffer;
    this.vertexFloatCapacity = newCapacity;
  }

  _reserveFloats(offset, floatsNeeded) {
    const required = offset + floatsNeeded;
    if (required > this.vertexFloatCapacity) {
      this._ensureScratchCapacity(required, offset);
    }
  }

  _writeVertex(buffer, offset, px, py, color, tileX, tileY, uvx, uvy) {
    buffer[offset++] = px;
    buffer[offset++] = py;
    buffer[offset++] = color[0];
    buffer[offset++] = color[1];
    buffer[offset++] = color[2];
    buffer[offset++] = tileX;
    buffer[offset++] = tileY;
    buffer[offset++] = uvx;
    buffer[offset++] = uvy;
    return offset;
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

    const vertexFloatCount = this.buildVertexData(state.map, state.ui, state.entities || [], state.camera);

    if (vertexFloatCount === 0) {
      // Clear screen only
      this.clearScreen();
      return;
    }

    const vertexView = this.vertexScratch.subarray(0, vertexFloatCount);
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexView, 0, vertexFloatCount);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'Render Command Encoder'
    });

    // Get current texture from canvas
    const textureView = this.context.getCurrentTexture().createView();

    // Dark background (sky removed for now, but lighting still works)
    const sky = this.calculateSkyColor(this.lastState?.time?.hour ?? 12);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'Render Pass',
      colorAttachments: [{
        view: textureView,
        clearValue: { r: sky.r, g: sky.g, b: sky.b, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.draw(Math.floor(vertexFloatCount / FLOATS_PER_VERTEX));

    renderPass.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);
  }

  updateUniforms(camera) {
    // Calculate light direction based on time of day
    const hour = this.lastState?.time?.hour ?? 12;
    const normalizedHour = ((hour % 24) + 24) % 24 / 24; // 0-1

    const sunTheta = normalizedHour * Math.PI * 2;
    const lightDirX = Math.cos(sunTheta) * 0.7;
    const lightDirY = Math.sin(sunTheta) * 0.25;
    const lightDirZ = 0.75;

    const dayMix = Math.max(0, Math.sin(normalizedHour * Math.PI));
    const ambientLight = 0.28 + 0.42 * dayMix;
    const sunIntensity = 0.35 + 0.65 * dayMix;

    // Fog scales with zoom (closer zoom -> lighter fog) and night time -> denser fog
    const zoomFactor = Math.max(0.2, Math.min(2.5, camera.zoom || 1));
    let fogDensity = 0.0015 * (2.0 - Math.min(1.8, zoomFactor));
    fogDensity *= 1.1 - 0.4 * dayMix;

    const uniforms = new Float32Array(UNIFORM_FLOAT_COUNT);
    uniforms.set([
      camera.x,
      camera.y,
      camera.zoom,
      fogDensity,
      this.canvas.width,
      this.canvas.height,
      sunIntensity,
      dayMix,
      lightDirX,
      lightDirY,
      lightDirZ,
      ambientLight
    ]);

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }

  buildVertexData(map, ui, entities, camera) {
    if (!map || !map.tiles) return 0;

    const { tiles, width, height } = map;
    const visibleBounds = this.calculateVisibleTileBounds(camera, width, height);
    const tilesInView = Math.max(0, (visibleBounds.maxX - visibleBounds.minX + 1) * (visibleBounds.maxY - visibleBounds.minY + 1));

    if (tilesInView === 0) {
      return 0;
    }

    const baseEstimate = FLOATS_PER_QUAD * (tilesInView * 3 + 64);
    this._ensureScratchCapacity(baseEstimate, 0);
    let offset = 0;
    const buffer = this.vertexScratch;

    offset = this.writeGridLayer(buffer, offset, width, height, visibleBounds);
    offset = this.writeTilesLayer(buffer, offset, tiles, width, height, visibleBounds, ui, camera);
    offset = this.writeEntityLayer(buffer, offset, entities);
    offset = this.writePreviewLayer(buffer, offset, ui);

    this.lastVertexCount = Math.floor(offset / FLOATS_PER_VERTEX);
    return offset;
  }

  writeGridLayer(buffer, offset, width, height, visibleBounds) {
    if (!this.showGrid) return offset;
    return this.createGridLinesDirect(buffer, offset, width, height, visibleBounds);
  }

  writeTilesLayer(buffer, offset, tiles, width, height, visibleBounds, ui, camera) {
    if (!tiles) return offset;

    const hour = this.lastState?.time?.hour ?? 12;
    const normalizedHour = ((hour % 24) + 24) % 24 / 24;
    const sunTheta = normalizedHour * Math.PI * 2;
    const sunContribution = 0.35 + Math.cos(sunTheta) * 0.2;
    const ambientBase = 0.32 + 0.28 * Math.max(0, Math.sin(normalizedHour * Math.PI));

    const zoom = Math.max(0.2, camera.zoom || 1);
    const fogDistance = 1200 / zoom;

    const hovered = ui?.hoveredTile;
    const selected = ui?.selectedTile;

    for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y++) {
      for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x++) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const tileIndex = y * width + x;
        const tile = tiles[tileIndex];
        if (!tile) continue;
        if (!tile.type && !tile.zone && !tile.building) continue;

        let baseColor = this.tileColors[tile.type] || this.tileColors.grass;
        if (tile.zone && this.tileColors[tile.zone]) {
          baseColor = this.tileColors[tile.zone];
        }

        const color = [
          baseColor[0] * (ambientBase + sunContribution * 0.45),
          baseColor[1] * (ambientBase + sunContribution * 0.45),
          baseColor[2] * (ambientBase + sunContribution * 0.45)
        ];

        const tileWorldX = (x - y) * this.halfTileWidth;
        const tileWorldY = (x + y) * this.halfTileHeight;
        const dx = tileWorldX - camera.x;
        const dy = tileWorldY - camera.y;
        const distance = Math.hypot(dx, dy);
        const fogFactor = Math.max(0.65, 1.0 - Math.min(1.0, distance / fogDistance) * 0.35);
        color[0] *= fogFactor;
        color[1] *= fogFactor;
        color[2] *= fogFactor;

        const edgeDarken = 0.9;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          color[0] *= edgeDarken;
          color[1] *= edgeDarken;
          color[2] *= edgeDarken;
        }

        let isHighlighted = false;
        if (hovered && hovered.x === x && hovered.y === y) {
          color[0] = Math.min(1, color[0] * 1.25);
          color[1] = Math.min(1, color[1] * 1.25);
          color[2] = Math.min(1, color[2] * 1.25);
          isHighlighted = true;
        }

        if (selected && selected.x === x && selected.y === y) {
          color[0] = Math.min(1, color[0] * 1.35);
          color[1] = Math.min(1, color[1] * 1.35);
          color[2] = Math.min(1, color[2] * 1.35);
          isHighlighted = true;
        }

        const spriteName = tile.sprite || tile.zone || tile.type || 'grass';
        offset = this.emitIsometricTile(buffer, offset, x, y, color, spriteName);

        if (isHighlighted) {
          offset = this.emitTileOutline(buffer, offset, x, y, [1, 1, 1]);
        }

        if (tile.building && this.buildingColors[tile.building]) {
          offset = this.emitBuilding(buffer, offset, x, y, [1, 1, 1], tile.building);
        }
      }
    }

    return offset;
  }

  writeEntityLayer(buffer, offset, entities) {
    if (!entities || entities.length === 0) return offset;
    for (const entity of entities) {
      offset = this.emitEntity(buffer, offset, entity);
    }
    return offset;
  }

  writePreviewLayer(buffer, offset, ui) {
    if (!ui?.preview?.tiles || ui.preview.tiles.length === 0) return offset;
    const sprite = ui.preview.tool || 'grass';
    const ghostColor = [0.72, 0.72, 0.72];

    for (const tile of ui.preview.tiles) {
      offset = this.emitIsometricTile(buffer, offset, tile.x, tile.y, ghostColor, sprite);
      offset = this.emitTileOutline(buffer, offset, tile.x, tile.y, [1, 1, 1]);
    }

    return offset;
  }

  emitIsometricTile(buffer, offset, tileX, tileY, color, spriteName) {
    const w = this.halfTileWidth;
    const h = this.halfTileHeight;

    const top = [0, -h];
    const right = [w, 0];
    const bottom = [0, h];
    const left = [-w, 0];

    const sprite = this.textureAtlas.getSprite(spriteName) || this.textureAtlas.getSprite('grass');
    const u = sprite.u;
    const v = sprite.v;
    const uSize = sprite.uSize;
    const vSize = sprite.vSize;

    const uvTop = [u + uSize * 0.5, v];
    const uvRight = [u + uSize, v + vSize * 0.5];
    const uvBottom = [u + uSize * 0.5, v + vSize];
    const uvLeft = [u, v + vSize * 0.5];

    this._reserveFloats(offset, FLOATS_PER_QUAD);
    offset = this._writeVertex(buffer, offset, top[0], top[1], color, tileX, tileY, uvTop[0], uvTop[1]);
    offset = this._writeVertex(buffer, offset, right[0], right[1], color, tileX, tileY, uvRight[0], uvRight[1]);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, tileX, tileY, uvBottom[0], uvBottom[1]);

    offset = this._writeVertex(buffer, offset, top[0], top[1], color, tileX, tileY, uvTop[0], uvTop[1]);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, tileX, tileY, uvBottom[0], uvBottom[1]);
    offset = this._writeVertex(buffer, offset, left[0], left[1], color, tileX, tileY, uvLeft[0], uvLeft[1]);

    return offset;
  }

  emitBuilding(buffer, offset, tileX, tileY, color, buildingType) {
    const w = this.halfTileWidth;
    const h = this.halfTileHeight;
    const offsetY = -this.tileHeight / 3;

    const top = [0, -h + offsetY];
    const right = [w, offsetY];
    const bottom = [0, h + offsetY];
    const left = [-w, offsetY];

    const sprite = this.textureAtlas.getSprite(buildingType) || this.textureAtlas.getSprite('path');
    const u = sprite.u;
    const v = sprite.v;
    const uSize = sprite.uSize;
    const vSize = sprite.vSize;

    const uvTop = [u + uSize * 0.5, v];
    const uvRight = [u + uSize, v + vSize * 0.5];
    const uvBottom = [u + uSize * 0.5, v + vSize];
    const uvLeft = [u, v + vSize * 0.5];

    this._reserveFloats(offset, FLOATS_PER_QUAD);
    offset = this._writeVertex(buffer, offset, top[0], top[1], color, tileX, tileY, uvTop[0], uvTop[1]);
    offset = this._writeVertex(buffer, offset, right[0], right[1], color, tileX, tileY, uvRight[0], uvRight[1]);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, tileX, tileY, uvBottom[0], uvBottom[1]);

    offset = this._writeVertex(buffer, offset, top[0], top[1], color, tileX, tileY, uvTop[0], uvTop[1]);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, tileX, tileY, uvBottom[0], uvBottom[1]);
    offset = this._writeVertex(buffer, offset, left[0], left[1], color, tileX, tileY, uvLeft[0], uvLeft[1]);

    return offset;
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
          this._reserveFloats(idx, FLOATS_PER_VERTEX * 6);
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
          this._reserveFloats(idx, FLOATS_PER_VERTEX * 6);
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
          this._reserveFloats(idx, FLOATS_PER_VERTEX * 6);
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
          this._reserveFloats(idx, FLOATS_PER_VERTEX * 6);
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

  emitTileOutline(buffer, offset, tileX, tileY, color) {
    const w = this.halfTileWidth;
    const h = this.halfTileHeight;
    const thickness = 2;

    const top = [0, -h];
    const right = [w, 0];
    const bottom = [0, h];
    const left = [-w, 0];

    const sprite = this.textureAtlas.getSprite('grass');
    const uvx = sprite.u + sprite.uSize * 0.5;
    const uvy = sprite.v + sprite.vSize * 0.5;

    this._reserveFloats(offset, FLOATS_PER_VERTEX * 12);

    offset = this._writeVertex(buffer, offset, top[0], top[1], color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, top[0] - thickness, top[1], color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, right[0], right[1], color, tileX, tileY, uvx, uvy);

    offset = this._writeVertex(buffer, offset, right[0], right[1], color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, right[0], right[1] + thickness, color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, tileX, tileY, uvx, uvy);

    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, bottom[0] + thickness, bottom[1], color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, left[0], left[1], color, tileX, tileY, uvx, uvy);

    offset = this._writeVertex(buffer, offset, left[0], left[1], color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, left[0], left[1] - thickness, color, tileX, tileY, uvx, uvy);
    offset = this._writeVertex(buffer, offset, top[0], top[1], color, tileX, tileY, uvx, uvy);

    return offset;
  }

  emitEntity(buffer, offset, entity) {
    offset = this.emitEntityShadow(buffer, offset, entity);
    offset = this.emitEntitySprite(buffer, offset, entity);
    return offset;
  }

  emitEntityShadow(buffer, offset, entity) {
    const entityWidth = entity.width || 1;
    const entityHeight = entity.height || 1;
    const isMultiTile = entityWidth > 1 || entityHeight > 1;

    const shadowSize = isMultiTile ? 12 : 8;
    const shadowOffsetY = 2;
    const shadowColor = [0.0, 0.0, 0.0];

    const sprite = this.textureAtlas.getSprite('grass');
    const u = sprite.u + sprite.uSize * 0.5;
    const v = sprite.v + sprite.vSize * 0.5;

    const points = 8;
    this._reserveFloats(offset, points * FLOATS_PER_VERTEX * 3);

    const anchorX = entity.x ?? 0;
    const anchorY = entity.y ?? 0;

    for (let i = 0; i < points; i++) {
      const angle1 = (i / points) * Math.PI * 2;
      const angle2 = ((i + 1) / points) * Math.PI * 2;

      const x1 = Math.cos(angle1) * shadowSize;
      const y1 = shadowOffsetY + Math.sin(angle1) * (shadowSize * 0.4);
      const x2 = Math.cos(angle2) * shadowSize;
      const y2 = shadowOffsetY + Math.sin(angle2) * (shadowSize * 0.4);

      offset = this._writeVertex(buffer, offset, 0, shadowOffsetY, shadowColor, anchorX, anchorY, u, v);
      offset = this._writeVertex(buffer, offset, x1, y1, shadowColor, anchorX, anchorY, u, v);
      offset = this._writeVertex(buffer, offset, x2, y2, shadowColor, anchorX, anchorY, u, v);
    }

    return offset;
  }

  emitEntitySprite(buffer, offset, entity) {
    let spriteName = 'visitor';
    if (entity.type === 'special' && entity.characterType) {
      spriteName = entity.characterType;
    } else if (entity.type === 'visitor' && entity.visitorType) {
      const visitorSpriteMap = {
        'hipster': 'hipster',
        'dog-owner': 'dog-walker',
        'default': 'visitor'
      };
      spriteName = visitorSpriteMap[entity.visitorType] || 'visitor';
    } else if (entity.type === 'activity' && entity.activityType) {
      spriteName = entity.activityType;
      if (!this._activityDebug) this._activityDebug = {};
      if (entity.id && !this._activityDebug[entity.id]) {
        console.log(`[Renderer] Rendering activity: ${spriteName}`);
        this._activityDebug[entity.id] = true;
      }
    }

    const sprite = this.textureAtlas.getSprite(spriteName) || this.textureAtlas.getSprite('visitor');
    const u = sprite.u;
    const v = sprite.v;
    const uSize = sprite.uSize;
    const vSize = sprite.vSize;

    let entityWidth = 1;
    let entityHeight = 1;
    if (entity.tilesOccupied) {
      entityWidth = entity.tilesOccupied.x;
      entityHeight = entity.tilesOccupied.y;
    } else if (entity.widthInTiles || entity.heightInTiles) {
      entityWidth = entity.widthInTiles || 1;
      entityHeight = entity.heightInTiles || 1;
    }

    const isMultiTile = entity.tilesOccupied && (entity.tilesOccupied.x > 1 || entity.tilesOccupied.y > 1);

    let size;
    let height;
    if (entity.renderSize) {
      size = entity.renderSize;
      height = isMultiTile ? 8 : 15;
    } else if (isMultiTile) {
      size = 8;
      height = 8;
    } else {
      size = 10;
      height = 15;
    }

    let sizeX;
    let sizeY;
    if (isMultiTile) {
      sizeX = entityWidth * this.halfTileWidth;
      sizeY = entityHeight * this.halfTileHeight;
    } else {
      sizeX = size;
      sizeY = size;
    }

    const centerX = 0;
    const centerY = -height;

    const top = [centerX, centerY - sizeY];
    const right = [centerX + sizeX, centerY];
    const bottom = [centerX, centerY + sizeY];
    const left = [centerX - sizeX, centerY];

    const uvTop = [u + uSize * 0.5, v];
    const uvRight = [u + uSize, v + vSize * 0.5];
    const uvBottom = [u + uSize * 0.5, v + vSize];
    const uvLeft = [u, v + vSize * 0.5];

    const hour = this.lastState?.time?.hour || 12;
    const lightAngle = (hour / 24) * Math.PI * 2;
    const lightIntensity = 0.5 + Math.cos(lightAngle) * 0.2;
    let ambient = 0.6;
    if (hour < 6 || hour >= 20) ambient = 0.3;
    else if (hour < 7 || hour >= 19) ambient = 0.45;

    let brightness = ambient + lightIntensity * 0.4;

    if (this.lastState?.camera) {
      const camera = this.lastState.camera;
      const dx = (entity.x ?? 0) - camera.x;
      const dy = (entity.y ?? 0) - camera.y;
      const distance = Math.hypot(dx, dy);
      const fogDistance = 20 / Math.max(camera.zoom || 1, 0.1);
      const fogFactor = Math.max(0.7, 1.0 - Math.min(1, distance / fogDistance) * 0.3);
      brightness *= fogFactor;
    }

    const color = [brightness, brightness, brightness];
    const anchorX = entity.x ?? 0;
    const anchorY = entity.y ?? 0;

    this._reserveFloats(offset, FLOATS_PER_QUAD);
    offset = this._writeVertex(buffer, offset, top[0], top[1], color, anchorX, anchorY, uvTop[0], uvTop[1]);
    offset = this._writeVertex(buffer, offset, right[0], right[1], color, anchorX, anchorY, uvRight[0], uvRight[1]);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, anchorX, anchorY, uvBottom[0], uvBottom[1]);

    offset = this._writeVertex(buffer, offset, top[0], top[1], color, anchorX, anchorY, uvTop[0], uvTop[1]);
    offset = this._writeVertex(buffer, offset, bottom[0], bottom[1], color, anchorX, anchorY, uvBottom[0], uvBottom[1]);
    offset = this._writeVertex(buffer, offset, left[0], left[1], color, anchorX, anchorY, uvLeft[0], uvLeft[1]);

    return offset;
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
    const sky = this.calculateSkyColor(this.lastState?.time?.hour ?? 12);

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: sky.r, g: sky.g, b: sky.b, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  resize(width, height) {
    const { dpr } = resizeCanvasToDisplaySize(this.canvas, {
      maxDevicePixelRatio: 2
    });
    this.devicePixelRatio = dpr;

    if (this.context && this.device) {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied'
      });
    }
  }

  destroy() {
    if (this.vertexBuffer) {
      this.vertexBuffer.destroy();
    }
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    if (this.texture) {
      this.texture.destroy();
    }
    if (this.device) {
      this.device.destroy();
    }
  }
}
