import { clamp } from '../utils/math.js';
import { tileToScreen, screenToTile } from '../utils/iso.js';
import { createMaterialAtlas } from './assets/material-atlas.js';
import { createSpriteTextures } from './assets/sprite-textures.js';
import { createRegionLabelTextures, createLandmarkLabelTextures } from './assets/label-textures.js';
import { createIsometricViewProjection } from './core/iso-matrix.js';
import {
  clamp01,
  parseColor,
  colorFromCss,
  withAlpha,
  lighten,
  darken
} from './core/color-utils.js';
import { createProgram } from './core/gl-program.js';

function quadraticPoint(p0, p1, p2, t) {
  const inv = 1 - t;
  const x = inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x;
  const y = inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y;
  return { x, y };
}

export class IsoWorldRenderer {
  constructor(canvas, worldConfig) {
    this.canvas = canvas;
    this.worldConfig = worldConfig;
    this.gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true
    });

    this.fallbackCtx = null;

    this.viewport = {
      width: 0,
      height: 0,
      dpr: 1
    };
    this.display = {
      width: 0,
      height: 0
    };
    this.renderScale = 2;

    this.metrics = {
      tileW: 44,
      tileH: 22
    };

    this.origin = { x: 0, y: 0 };

    this.regionTiles = new Set(this.worldConfig.regions.map((region) => `${region.tile.x},${region.tile.y}`));
    this.routes = this._buildRoutes();
    this.palette = this._buildPalette();

    this.colorData = [];
    this.textureCommands = [];
    this.sceneTarget = null;

    if (!this.gl) {
      this.fallbackCtx = canvas.getContext('2d');
      return;
    }

    this._initGl();
    this.materialAtlas = createMaterialAtlas(this.gl, this.palette);
    this.spriteTextures = createSpriteTextures(this.gl, this.worldConfig);
    this.labelTextures = createRegionLabelTextures(this.gl, this.worldConfig);
    this.landmarkLabelTextures = createLandmarkLabelTextures(this.gl, this.worldConfig);
  }

  _buildRoutes() {
    const links = [];
    for (const region of this.worldConfig.regions) {
      for (const parentId of region.unlockRequires || []) {
        links.push({ fromId: parentId, toId: region.id });
      }
    }
    return links;
  }

  _buildPalette() {
    return {
      skyTop: colorFromCss('--sky-a', '#050914'),
      skyMid: colorFromCss('--sky-b', '#0c1730'),
      skyBottom: colorFromCss('--sky-c', '#1a1633'),
      tile: {
        land: colorFromCss('--tile-land', '#1a2236'),
        road: colorFromCss('--tile-road', '#22283f'),
        industrial: colorFromCss('--tile-industrial', '#2a2332'),
        park: colorFromCss('--tile-park', '#182b29'),
        water: colorFromCss('--tile-water', '#11293b'),
        mountain: colorFromCss('--tile-mountain', '#2f3141'),
        plaza: colorFromCss('--tile-plaza', '#2f3550'),
        art: colorFromCss('--tile-art', '#352748')
      },
      line: colorFromCss('--line-soft', 'rgba(120,144,206,0.24)'),
      cursor: colorFromCss('--fg', '#e9f1ff'),
      routeLocked: parseColor('rgba(124, 134, 166, 0.36)'),
      routeReady: parseColor('rgba(230, 201, 115, 0.62)'),
      routeOpen: parseColor('rgba(116, 252, 219, 0.72)'),
      routePulse: parseColor('#c4fff5'),
      lock: parseColor('rgba(209, 219, 255, 0.66)'),
      complete: parseColor('#4ed2a8'),
      shadow: parseColor('rgba(0,0,0,0.38)'),
      landmark: parseColor('#c9b6ff'),
      landmarkMuted: parseColor('rgba(150, 134, 192, 0.34)'),
      region: {
        purple: {
          top: colorFromCss('--region-purple-top', '#6b55a8'),
          east: colorFromCss('--region-purple-east', '#56448a'),
          south: colorFromCss('--region-purple-south', '#44356f'),
          accent: colorFromCss('--region-purple-accent', '#d2c7ff')
        },
        red: {
          top: colorFromCss('--region-red-top', '#a25776'),
          east: colorFromCss('--region-red-east', '#84485f'),
          south: colorFromCss('--region-red-south', '#69384c'),
          accent: colorFromCss('--region-red-accent', '#ffd0d8')
        },
        green: {
          top: colorFromCss('--region-green-top', '#4b8e79'),
          east: colorFromCss('--region-green-east', '#3c7463'),
          south: colorFromCss('--region-green-south', '#2f5d50'),
          accent: colorFromCss('--region-green-accent', '#c9ffe8')
        },
        neutral: {
          top: colorFromCss('--region-neutral-top', '#62708f'),
          east: colorFromCss('--region-neutral-east', '#4f5c79'),
          south: colorFromCss('--region-neutral-south', '#3e4a63'),
          accent: colorFromCss('--region-neutral-accent', '#dbe8ff')
        }
      }
    };
  }

  _initGl() {
    const gl = this.gl;

    const colorVertex = `#version 300 es
      precision highp float;
      in vec2 a_pos;
      in vec4 a_color;
      uniform vec2 u_resolution;
      out vec4 v_color;
      void main() {
        vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        v_color = a_color;
      }
    `;

    const colorFragment = `#version 300 es
      precision highp float;
      in vec4 v_color;
      uniform float u_time;
      out vec4 outColor;
      vec3 posterize(vec3 value, float levels) {
        return floor(value * levels + 0.5) / levels;
      }
      void main() {
        float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
        float dither = (checker - 0.5) / 255.0;
        vec3 rgb = clamp(v_color.rgb + dither, 0.0, 1.0);
        float pulse = 0.004 * sin(u_time * 2.8 + gl_FragCoord.y * 0.07);
        rgb = posterize(clamp(rgb + pulse, 0.0, 1.0), 30.0);
        outColor = vec4(rgb, v_color.a);
      }
    `;

    const textureVertex = `#version 300 es
      precision highp float;
      in vec2 a_pos;
      in vec2 a_uv;
      in float a_depth;
      in vec4 a_tint;
      uniform vec2 u_resolution;
      out vec2 v_uv;
      out vec4 v_tint;
      void main() {
        vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
        float depth = clamp(1.0 - a_depth, 0.0, 1.0) * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
        v_uv = a_uv;
        v_tint = a_tint;
      }
    `;

    const textureFragment = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      in vec4 v_tint;
      uniform sampler2D u_tex;
      uniform float u_time;
      out vec4 outColor;
      vec3 posterize(vec3 value, float levels) {
        return floor(value * levels + 0.5) / levels;
      }
      void main() {
        vec4 texel = texture(u_tex, v_uv);
        vec4 color = texel * v_tint;
        if (color.a < 0.1) {
          discard;
        }
        float grain = fract(sin(dot(gl_FragCoord.xy + vec2(u_time * 37.0, u_time * 23.0), vec2(12.9898, 78.233))) * 43758.5453);
        float jitter = (grain - 0.5) * 0.03;
        vec3 rgb = posterize(clamp(color.rgb + jitter, 0.0, 1.0), 26.0);
        outColor = vec4(rgb, color.a);
      }
    `;

    this.colorProgram = createProgram(gl, colorVertex, colorFragment);
    this.texProgram = createProgram(gl, textureVertex, textureFragment);

    this.colorLoc = {
      pos: gl.getAttribLocation(this.colorProgram, 'a_pos'),
      color: gl.getAttribLocation(this.colorProgram, 'a_color'),
      resolution: gl.getUniformLocation(this.colorProgram, 'u_resolution'),
      time: gl.getUniformLocation(this.colorProgram, 'u_time')
    };

    this.texLoc = {
      pos: gl.getAttribLocation(this.texProgram, 'a_pos'),
      uv: gl.getAttribLocation(this.texProgram, 'a_uv'),
      depth: gl.getAttribLocation(this.texProgram, 'a_depth'),
      tint: gl.getAttribLocation(this.texProgram, 'a_tint'),
      resolution: gl.getUniformLocation(this.texProgram, 'u_resolution'),
      tex: gl.getUniformLocation(this.texProgram, 'u_tex'),
      time: gl.getUniformLocation(this.texProgram, 'u_time')
    };

    this.colorBuffer = gl.createBuffer();
    this.texBuffer = gl.createBuffer();

    const blitVertex = `#version 300 es
      precision highp float;
      in vec2 a_pos;
      in vec2 a_uv;
      out vec2 v_uv;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_uv = a_uv;
      }
    `;
    const blitFragment = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_tex;
      out vec4 outColor;
      void main() {
        outColor = texture(u_tex, v_uv);
      }
    `;
    this.blitProgram = createProgram(gl, blitVertex, blitFragment);
    this.blitLoc = {
      pos: gl.getAttribLocation(this.blitProgram, 'a_pos'),
      uv: gl.getAttribLocation(this.blitProgram, 'a_uv'),
      tex: gl.getUniformLocation(this.blitProgram, 'u_tex')
    };
    this.blitBuffer = gl.createBuffer();
    const blitQuad = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      1, 1, 1, 1,
      -1, -1, 0, 0,
      1, 1, 1, 1,
      -1, 1, 0, 1
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.blitBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, blitQuad, gl.STATIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
  }

  _ensureRenderTarget(width, height) {
    const gl = this.gl;
    if (!gl) {
      return;
    }

    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.sceneTarget && this.sceneTarget.width === w && this.sceneTarget.height === h) {
      return;
    }

    if (this.sceneTarget) {
      gl.deleteFramebuffer(this.sceneTarget.fbo);
      gl.deleteTexture(this.sceneTarget.texture);
      gl.deleteRenderbuffer(this.sceneTarget.depth);
      this.sceneTarget = null;
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`framebuffer incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    this.sceneTarget = {
      width: w,
      height: h,
      texture,
      depth,
      fbo
    };
  }

  _blitToScreen() {
    const gl = this.gl;
    if (!gl || !this.sceneTarget) {
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.blitProgram);
    gl.uniform1i(this.blitLoc.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.blitBuffer);
    const stride = 4 * 4;
    gl.enableVertexAttribArray(this.blitLoc.pos);
    gl.vertexAttribPointer(this.blitLoc.pos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.blitLoc.uv);
    gl.vertexAttribPointer(this.blitLoc.uv, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize(width, height, dpr = Math.min(window.devicePixelRatio || 1, 2)) {
    this.display.width = width;
    this.display.height = height;
    this.viewport.width = Math.max(320, Math.floor(width / this.renderScale));
    this.viewport.height = Math.max(180, Math.floor(height / this.renderScale));
    this.viewport.dpr = dpr;

    const byWidth = (this.viewport.width * 2.18) / (this.worldConfig.map.width + this.worldConfig.map.height);
    const byHeight = (this.viewport.height * 1.58) / (this.worldConfig.map.height + this.worldConfig.map.width * 0.42);
    this.metrics.tileW = Math.floor(clamp(Math.min(byWidth, byHeight), 16, 52));
    this.metrics.tileH = Math.floor(this.metrics.tileW * 0.5);

    this.origin.x = this.viewport.width * 0.5;
    this.origin.y = Math.max(70, this.viewport.height * 0.09);

    this.isoViewProjection = createIsometricViewProjection({
      width: this.viewport.width,
      height: this.viewport.height,
      mapWidth: this.worldConfig.map.width,
      mapHeight: this.worldConfig.map.height,
      zoom: 1
    });

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    if (this.gl) {
      this._ensureRenderTarget(this.viewport.width, this.viewport.height);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  pickTile(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) / Math.max(1, rect.width);
    const sy = (clientY - rect.top) / Math.max(1, rect.height);
    const screenX = sx * this.viewport.width;
    const screenY = sy * this.viewport.height;

    return screenToTile(screenX, screenY, this.metrics, this.origin, this.worldConfig.map);
  }

  _tileType(x, y) {
    const map = this.worldConfig.map;

    if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) {
      return 'water';
    }

    const riverBand = Math.abs(x - (y * 0.9 + 3.2)) < 0.9 && y > 1 && y < map.height - 2;
    const southLake = x >= 8 && x <= 10 && y >= 13 && y <= 15;
    if (riverBand || southLake) {
      return 'water';
    }

    if (Math.abs(x - 11) <= 1 && Math.abs(y - 8) <= 1) {
      return 'plaza';
    }

    if (
      x === 11 ||
      y === 8 ||
      (x === 6 && y >= 4 && y <= 15) ||
      (y === 4 && x >= 5 && x <= 17) ||
      (x === 18 && y >= 3 && y <= 13) ||
      (y === 12 && x >= 11 && x <= 16)
    ) {
      return 'road';
    }

    if ((x >= 16 && y <= 5) || (x >= 19 && y <= 9) || (x <= 3 && y <= 4)) {
      return 'mountain';
    }

    if ((x <= 5 && y >= 12) || (x >= 16 && y >= 12)) {
      return 'industrial';
    }

    if ((x === 9 && y === 6) || (x === 13 && y === 10) || (x === 15 && y === 14) || (x === 7 && y === 9)) {
      return 'art';
    }

    if ((x >= 8 && x <= 14 && y >= 2 && y <= 6) || (x + y) % 5 === 0) {
      return 'park';
    }

    return 'land';
  }

  _tilePolygon(x, y, z = 0) {
    const a = tileToScreen(x, y, z, this.metrics, this.origin);
    const b = tileToScreen(x + 1, y, z, this.metrics, this.origin);
    const c = tileToScreen(x + 1, y + 1, z, this.metrics, this.origin);
    const d = tileToScreen(x, y + 1, z, this.metrics, this.origin);
    const center = tileToScreen(x + 0.5, y + 0.5, z, this.metrics, this.origin);
    return { a, b, c, d, center };
  }

  _pushColorVertex(x, y, color) {
    this.colorData.push(x, y, color[0], color[1], color[2], color[3]);
  }

  _addTriangleColor(p0, p1, p2, c0, c1, c2) {
    this._pushColorVertex(p0.x, p0.y, c0);
    this._pushColorVertex(p1.x, p1.y, c1);
    this._pushColorVertex(p2.x, p2.y, c2);
  }

  _addQuadColor(p0, p1, p2, p3, c0, c1, c2, c3) {
    this._addTriangleColor(p0, p1, p2, c0, c1, c2);
    this._addTriangleColor(p0, p2, p3, c0, c2, c3);
  }

  _addLine(a, b, width, color) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) {
      return;
    }

    const nx = (-dy / len) * width * 0.5;
    const ny = (dx / len) * width * 0.5;

    const p0 = { x: a.x + nx, y: a.y + ny };
    const p1 = { x: b.x + nx, y: b.y + ny };
    const p2 = { x: b.x - nx, y: b.y - ny };
    const p3 = { x: a.x - nx, y: a.y - ny };

    this._addQuadColor(p0, p1, p2, p3, color, color, color, color);
  }

  _addEllipse(center, radiusX, radiusY, color, segments = 18) {
    for (let i = 0; i < segments; i += 1) {
      const t0 = (i / segments) * Math.PI * 2;
      const t1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = { x: center.x + Math.cos(t0) * radiusX, y: center.y + Math.sin(t0) * radiusY };
      const p1 = { x: center.x + Math.cos(t1) * radiusX, y: center.y + Math.sin(t1) * radiusY };
      this._addTriangleColor(center, p0, p1, color, color, color);
    }
  }

  _addQuadraticLine(start, control, end, width, color, options = {}) {
    const steps = options.steps || 22;
    const dashed = Boolean(options.dashed);
    const dashEvery = options.dashEvery || 2;
    const dashOn = options.dashOn || 1;

    let prev = quadraticPoint(start, control, end, 0);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const point = quadraticPoint(start, control, end, t);
      const segmentIndex = i - 1;

      if (!dashed || (segmentIndex % dashEvery) < dashOn) {
        this._addLine(prev, point, width, color);
      }

      prev = point;
    }
  }

  _queueTexturedQuad(textureObj, p0, p1, p2, p3, uv, tint = [1, 1, 1, 1], layerDepth = null) {
    const depth = Number.isFinite(layerDepth)
      ? clamp01(layerDepth)
      : clamp01(Math.max(p0.y, p1.y, p2.y, p3.y) / Math.max(1, this.viewport.height));

    const v = [
      p0.x, p0.y, uv.u0, uv.v0, depth, tint[0], tint[1], tint[2], tint[3],
      p1.x, p1.y, uv.u1, uv.v0, depth, tint[0], tint[1], tint[2], tint[3],
      p2.x, p2.y, uv.u1, uv.v1, depth, tint[0], tint[1], tint[2], tint[3],

      p0.x, p0.y, uv.u0, uv.v0, depth, tint[0], tint[1], tint[2], tint[3],
      p2.x, p2.y, uv.u1, uv.v1, depth, tint[0], tint[1], tint[2], tint[3],
      p3.x, p3.y, uv.u0, uv.v1, depth, tint[0], tint[1], tint[2], tint[3]
    ];

    this.textureCommands.push({
      texture: textureObj.texture,
      data: v
    });
  }

  _queueSprite(textureObj, x, y, width, height, tint = [1, 1, 1, 1], depth = null) {
    const halfW = width * 0.5;
    const p0 = { x: x - halfW, y: y - height };
    const p1 = { x: x + halfW, y: y - height };
    const p2 = { x: x + halfW, y: y };
    const p3 = { x: x - halfW, y: y };
    const uv = textureObj.uv || { u0: 0, v0: 0, u1: 1, v1: 1 };
    this._queueTexturedQuad(textureObj, p0, p1, p2, p3, uv, tint, depth);
  }

  _renderFallback() {
    if (!this.fallbackCtx) {
      return;
    }

    const ctx = this.fallbackCtx;
    const { width, height } = this.viewport;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#070d1b');
    bg.addColorStop(1, '#12182c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#e7f0ff';
    ctx.font = '16px monospace';
    ctx.fillText('WebGL2 unavailable.', 28, 42);
    ctx.fillText('Simulatte world requires GPU shaders for 3.5D rendering.', 28, 68);
  }

  _pushBackground(elapsed) {
    const w = this.viewport.width;
    const h = this.viewport.height;

    const top = this.palette.skyTop;
    const mid = this.palette.skyMid;
    const bottom = this.palette.skyBottom;

    const p0 = { x: 0, y: 0 };
    const p1 = { x: w, y: 0 };
    const p2 = { x: w, y: h };
    const p3 = { x: 0, y: h };
    this._addQuadColor(p0, p1, p2, p3, top, top, bottom, bottom);

    const horizonY = h * 0.62;
    const glow = withAlpha(parseColor('#78a4ff'), 0.14);
    const transparent = withAlpha(parseColor('#78a4ff'), 0);
    this._addQuadColor(
      { x: 0, y: horizonY - 24 },
      { x: w, y: horizonY - 24 },
      { x: w, y: horizonY + 52 },
      { x: 0, y: horizonY + 52 },
      transparent,
      transparent,
      glow,
      glow
    );

    const gridColor = withAlpha(parseColor('#8ea4df'), 0.08);
    const offset = Math.floor((elapsed * 10) % 24);
    for (let x = -offset; x < w + 24; x += 24) {
      this._addLine({ x, y: 0 }, { x, y: h }, 1, gridColor);
    }
  }

  _pushTiles(elapsed) {
    const map = this.worldConfig.map;

    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const type = this._tileType(x, y);
        const cellUv = this.materialAtlas.uvs[type];
        const points = this._tilePolygon(x, y, 0);

        const base = this.palette.tile[type] || this.palette.tile.land;
        const noise = (Math.sin((x * 13.7 + y * 9.2 + elapsed * 0.8)) + 1) * 0.5;
        const lit = lighten(base, 0.07 + noise * 0.05);
        const shadow = darken(base, 0.2 - noise * 0.06);

        this._addQuadColor(points.a, points.b, points.c, points.d, lit, lit, shadow, shadow);

        this._queueTexturedQuad(
          this.materialAtlas,
          points.a,
          points.b,
          points.c,
          points.d,
          cellUv,
          [1, 1, 1, 0.45]
        );

        if (this.regionTiles.has(`${x},${y}`)) {
          const glowAlpha = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(elapsed * 2 + x * 0.43 + y * 0.29));
          const glow = withAlpha(parseColor('#a4c0ff'), glowAlpha);
          this._addQuadColor(points.a, points.b, points.c, points.d, glow, glow, glow, glow);
        }

        this._addLine(points.a, points.b, 1, withAlpha(this.palette.line, 0.22));
        this._addLine(points.b, points.c, 1, withAlpha(this.palette.line, 0.16));
      }
    }
  }

  _pushScenery(elapsed) {
    const map = this.worldConfig.map;

    for (let y = 1; y < map.height - 1; y += 1) {
      for (let x = 1; x < map.width - 1; x += 1) {
        if (this.regionTiles.has(`${x},${y}`)) {
          continue;
        }

        const type = this._tileType(x, y);
        const center = tileToScreen(x + 0.5, y + 0.5, 5, this.metrics, this.origin);
        const hash = ((x * 7349 + y * 9151) % 997) / 997;

        if (type === 'park' && hash > 0.65) {
          const canopy = withAlpha(parseColor('#58b795'), 0.66);
          const trunk = withAlpha(parseColor('#345247'), 0.72);
          this._addEllipse({ x: center.x, y: center.y - 3 }, 3.8, 3.2, canopy, 12);
          this._addQuadColor(
            { x: center.x - 1, y: center.y - 2 },
            { x: center.x + 1, y: center.y - 2 },
            { x: center.x + 1, y: center.y + 3 },
            { x: center.x - 1, y: center.y + 3 },
            trunk,
            trunk,
            trunk,
            trunk
          );
        }

        if (type === 'industrial' && hash > 0.9) {
          const stack = withAlpha(parseColor('#8a739f'), 0.66);
          this._addQuadColor(
            { x: center.x - 2, y: center.y - 8 },
            { x: center.x + 2, y: center.y - 8 },
            { x: center.x + 2, y: center.y - 2 },
            { x: center.x - 2, y: center.y - 2 },
            stack,
            stack,
            stack,
            stack
          );
        }
      }
    }
  }

  _pushRoutes(viewModel, elapsed) {
    const byId = new Map(viewModel.regions.map((region) => [region.id, region]));

    let routeIndex = 0;
    for (const route of this.routes) {
      const from = byId.get(route.fromId);
      const to = byId.get(route.toId);
      if (!from || !to) {
        continue;
      }

      const start = tileToScreen(from.tile.x + 0.5, from.tile.y + 0.5, 20, this.metrics, this.origin);
      const end = tileToScreen(to.tile.x + 0.5, to.tile.y + 0.5, 20, this.metrics, this.origin);
      const bend = {
        x: (start.x + end.x) * 0.5,
        y: (start.y + end.y) * 0.5 - 24
      };

      const isReady = from.completed;
      const isOpen = to.unlocked;

      if (isOpen) {
        this._addQuadraticLine(start, bend, end, 4.5, withAlpha(this.palette.routeOpen, 0.22));
        this._addQuadraticLine(start, bend, end, 2.1, this.palette.routeOpen);
      } else if (isReady) {
        this._addQuadraticLine(start, bend, end, 1.6, this.palette.routeReady, {
          dashed: true,
          dashEvery: 3,
          dashOn: 2
        });
      } else {
        this._addQuadraticLine(start, bend, end, 1.2, this.palette.routeLocked, {
          dashed: true,
          dashEvery: 3,
          dashOn: 1
        });
      }

      if (isOpen && !to.completed) {
        const t = (elapsed * 0.22 + routeIndex * 0.17) % 1;
        const pulse = quadraticPoint(start, bend, end, t);
        const glowFx = this.spriteTextures.getWorldFx?.(4);
        const dotFx = this.spriteTextures.getWorldFx?.(3);
        if (glowFx && dotFx) {
          this._queueSprite(glowFx, pulse.x, pulse.y + 2, 16, 16, [1, 1, 1, 0.8]);
          this._queueSprite(dotFx, pulse.x, pulse.y + 1, 9, 9, [1, 1, 1, 0.92]);
        } else {
          this._addEllipse(pulse, 5.2, 5.2, withAlpha(this.palette.routeOpen, 0.2), 18);
          this._addEllipse(pulse, 2.4, 2.4, this.palette.routePulse, 18);
        }
      }

      routeIndex += 1;
    }
  }

  _pushRegions(viewModel, elapsed) {
    const sorted = viewModel.regions.slice().sort((a, b) => (a.tile.x + a.tile.y) - (b.tile.x + b.tile.y));

    for (const region of sorted) {
      const tones = this.palette.region[region.color] || this.palette.region.neutral;
      const isTerrain = region.form === 'terrain';

      const selectedBoost = region.selected ? (isTerrain ? 2 : 12) : 0;
      const completeBoost = region.completed ? (isTerrain ? 1 : 5) : 0;
      const baseHeight = Number.isFinite(region.elevation)
        ? region.elevation
        : region.kind === 'private'
          ? 34
          : 44;
      const pulse = Math.sin(elapsed * 2 + region.tile.x * 0.44) * (isTerrain ? 0.8 : 1.5);
      const h = baseHeight + selectedBoost + completeBoost + pulse;

      const inset = isTerrain ? 0.11 : region.kind === 'private' ? 0.19 : 0.15;
      const nw = tileToScreen(region.tile.x + inset, region.tile.y + inset, h, this.metrics, this.origin);
      const ne = tileToScreen(region.tile.x + 1 - inset, region.tile.y + inset, h, this.metrics, this.origin);
      const se = tileToScreen(region.tile.x + 1 - inset, region.tile.y + 1 - inset, h, this.metrics, this.origin);
      const sw = tileToScreen(region.tile.x + inset, region.tile.y + 1 - inset, h, this.metrics, this.origin);

      const nw0 = tileToScreen(region.tile.x + inset, region.tile.y + inset, 0, this.metrics, this.origin);
      const ne0 = tileToScreen(region.tile.x + 1 - inset, region.tile.y + inset, 0, this.metrics, this.origin);
      const se0 = tileToScreen(region.tile.x + 1 - inset, region.tile.y + 1 - inset, 0, this.metrics, this.origin);
      const sw0 = tileToScreen(region.tile.x + inset, region.tile.y + 1 - inset, 0, this.metrics, this.origin);

      const ground = tileToScreen(region.tile.x + 0.5, region.tile.y + 0.56, 0, this.metrics, this.origin);
      this._addEllipse(ground, isTerrain ? 16 : 19, isTerrain ? 7 : 9, this.palette.shadow, 20);

      if (isTerrain) {
        this._addQuadColor(
          nw,
          ne,
          se,
          sw,
          lighten(tones.top, 0.24),
          lighten(tones.top, 0.18),
          darken(tones.top, 0.2),
          darken(tones.top, 0.22)
        );
      } else {
        this._addQuadColor(ne, se, se0, ne0, tones.east, tones.east, darken(tones.east, 0.24), darken(tones.east, 0.24));
        this._addQuadColor(sw, se, se0, sw0, tones.south, tones.south, darken(tones.south, 0.26), darken(tones.south, 0.26));
        this._addQuadColor(
          nw,
          ne,
          se,
          sw,
          lighten(tones.top, 0.2),
          lighten(tones.top, 0.14),
          darken(tones.top, 0.24),
          darken(tones.top, 0.28)
        );
      }

      if (!region.unlocked) {
        this._addLine(nw, se, 1.3, this.palette.lock);
        this._addLine(ne, sw, 1.3, this.palette.lock);
      }

      if (region.completed) {
        const badge = tileToScreen(region.tile.x + 0.78, region.tile.y + 0.2, h + 6, this.metrics, this.origin);
        const completionBadge = this.spriteTextures.getWorldFx?.(7);
        if (completionBadge) {
          this._queueSprite(completionBadge, badge.x, badge.y + 1, 16, 16, [1, 1, 1, 0.96]);
        } else {
          this._addEllipse(badge, 5, 5, this.palette.complete, 20);
          this._addLine({ x: badge.x - 2.4, y: badge.y + 0.2 }, { x: badge.x - 0.4, y: badge.y + 2.2 }, 1.3, parseColor('#0b1724'));
          this._addLine({ x: badge.x - 0.4, y: badge.y + 2.2 }, { x: badge.x + 2.9, y: badge.y - 2.1 }, 1.3, parseColor('#0b1724'));
        }
      }

      if (region.unlocked && !region.completed) {
        const beacon = tileToScreen(region.tile.x + 0.5, region.tile.y + 0.5, h + 14, this.metrics, this.origin);
        const alpha = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(elapsed * 5 + region.tile.x));
        const pulseColor = withAlpha(this.palette.routeOpen, alpha);
        this._addLine({ x: beacon.x, y: beacon.y - 8 }, { x: beacon.x - 4, y: beacon.y - 2 }, 1.4, pulseColor);
        this._addLine({ x: beacon.x, y: beacon.y - 8 }, { x: beacon.x + 4, y: beacon.y - 2 }, 1.4, pulseColor);
        this._addLine({ x: beacon.x - 4, y: beacon.y - 2 }, { x: beacon.x + 4, y: beacon.y - 2 }, 1.4, pulseColor);
      }

      if (region.selected) {
        const alpha = 0.5 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 8));
        const selectColor = withAlpha(parseColor('#cce0ff'), alpha);
        this._addLine(nw, ne, 2, selectColor);
        this._addLine(ne, se, 2, selectColor);
        this._addLine(se, sw, 2, selectColor);
        this._addLine(sw, nw, 2, selectColor);

        const ringFx = this.spriteTextures.getWorldFx?.(Math.sin(elapsed * 12) > 0 ? 1 : 2);
        if (ringFx) {
          const ringPos = tileToScreen(region.tile.x + 0.5, region.tile.y + 0.5, h + 12, this.metrics, this.origin);
          this._queueSprite(ringFx, ringPos.x, ringPos.y + 3, 18, 18, [1, 1, 1, 0.86]);
        }
      }

      if (!isTerrain) {
        const prism = this.spriteTextures.getPrism?.(region);
        if (prism) {
          const iconAnchor = tileToScreen(region.tile.x + 0.5, region.tile.y + 0.5, h + 18, this.metrics, this.origin);
          const iconSize = region.kind === 'private' ? 52 : 46;
          const alpha = region.unlocked ? 0.96 : 0.74;
          this._queueSprite(prism, iconAnchor.x, iconAnchor.y + 4, iconSize, iconSize, [1, 1, 1, alpha]);
        }
      }

      const labelTexture = this.labelTextures.get(region.id);
      if (labelTexture) {
        const labelPos = tileToScreen(region.tile.x + 0.5, region.tile.y + 0.5, h + (isTerrain ? 20 : 26), this.metrics, this.origin);
        const width = Math.max(64, labelTexture.width * 0.84);
        const height = 17;
        const plate = this.spriteTextures.getRegionLabelPlate?.(region);
        if (plate) {
          this._queueSprite(plate, labelPos.x, labelPos.y, width + 12, height + 6, [1, 1, 1, 0.92]);
        }
        this._queueSprite(labelTexture, labelPos.x, labelPos.y, width, height, [1, 1, 1, 0.94]);

        if (!region.unlocked) {
          const lockFx = this.spriteTextures.getWorldFx?.(14);
          if (lockFx) {
            this._queueSprite(lockFx, labelPos.x + width * 0.38, labelPos.y - 1, 10, 10, [1, 1, 1, 0.9]);
          }
        }
      }
    }
  }

  _pushLandmarks(viewModel, elapsed) {
    for (const mark of this.worldConfig.landmarks) {
      const x = mark.tile.x;
      const y = mark.tile.y;
      const center = tileToScreen(x + 0.5, y + 0.5, 10, this.metrics, this.origin);
      const discovered = viewModel.discoveredLandmarks.has(mark.id);
      const pulse = 0.45 + 0.55 * Math.sin(elapsed * 4 + mark.tile.x);
      const icon = this.spriteTextures.getLandmark?.(mark.id, elapsed, discovered);

      if (discovered) {
        const topTone = lighten(this.palette.landmark, 0.22);
        const eastTone = darken(this.palette.landmark, 0.2);
        const southTone = darken(this.palette.landmark, 0.34);

        const zTop = 18 + pulse * 2.2;
        const zBase = 5;

        const nw = tileToScreen(x + 0.22, y + 0.22, zTop, this.metrics, this.origin);
        const ne = tileToScreen(x + 0.78, y + 0.22, zTop, this.metrics, this.origin);
        const se = tileToScreen(x + 0.78, y + 0.78, zTop, this.metrics, this.origin);
        const sw = tileToScreen(x + 0.22, y + 0.78, zTop, this.metrics, this.origin);

        const nw0 = tileToScreen(x + 0.22, y + 0.22, zBase, this.metrics, this.origin);
        const ne0 = tileToScreen(x + 0.78, y + 0.22, zBase, this.metrics, this.origin);
        const se0 = tileToScreen(x + 0.78, y + 0.78, zBase, this.metrics, this.origin);
        const sw0 = tileToScreen(x + 0.22, y + 0.78, zBase, this.metrics, this.origin);

        this._addEllipse(center, 18 + pulse * 4.5, 9 + pulse * 2.2, withAlpha(this.palette.landmark, 0.18 + pulse * 0.16), 22);
        this._addQuadColor(ne, se, se0, ne0, eastTone, eastTone, darken(eastTone, 0.18), darken(eastTone, 0.18));
        this._addQuadColor(sw, se, se0, sw0, southTone, southTone, darken(southTone, 0.16), darken(southTone, 0.16));
        this._addQuadColor(nw, ne, se, sw, topTone, lighten(topTone, 0.06), darken(topTone, 0.08), darken(topTone, 0.12));
        this._addLine(nw, ne, 1.6, withAlpha(parseColor('#f0e4ff'), 0.56));
        this._addLine(ne, se, 1.4, withAlpha(parseColor('#b89fe0'), 0.46));
        this._addLine(se, sw, 1.4, withAlpha(parseColor('#b89fe0'), 0.42));
        this._addLine(sw, nw, 1.6, withAlpha(parseColor('#f0e4ff'), 0.52));

        const beaconTop = tileToScreen(x + 0.5, y + 0.5, zTop + 24 + pulse * 2, this.metrics, this.origin);
        this._addLine(
          { x: beaconTop.x, y: beaconTop.y - 10 },
          { x: beaconTop.x, y: beaconTop.y + 14 },
          2.4,
          withAlpha(parseColor('#f4e9ff'), 0.22 + pulse * 0.18)
        );
        this._addEllipse(beaconTop, 8 + pulse * 2.4, 4.4 + pulse * 1.5, withAlpha(parseColor('#f0e1ff'), 0.26 + pulse * 0.22), 18);

        if (icon) {
          const iconAnchor = tileToScreen(x + 0.5, y + 0.5, zTop + 18 + pulse * 1.8, this.metrics, this.origin);
          this._queueSprite(icon, iconAnchor.x, iconAnchor.y + 2, 46, 46, [1, 1, 1, 0.98]);
        }

        const labelTexture = this.landmarkLabelTextures?.get(mark.id);
        if (labelTexture) {
          const labelAnchor = tileToScreen(x + 0.5, y + 0.5, zTop + 42 + pulse * 1.4, this.metrics, this.origin);
          const width = Math.max(110, labelTexture.width * 0.92);
          const height = 24;
          const plate = this.spriteTextures.getLandmarkLabelPlate?.(true);
          if (plate) {
            this._queueSprite(plate, labelAnchor.x, labelAnchor.y, width + 16, height + 5, [1, 1, 1, 0.96]);
          }
          this._queueSprite(labelTexture, labelAnchor.x, labelAnchor.y, width, height, [1, 1, 1, 0.98]);
        }
      } else {
        const zTop = 12 + pulse * 1.2;
        const zBase = 3;

        const nw = tileToScreen(x + 0.28, y + 0.28, zTop, this.metrics, this.origin);
        const ne = tileToScreen(x + 0.72, y + 0.28, zTop, this.metrics, this.origin);
        const se = tileToScreen(x + 0.72, y + 0.72, zTop, this.metrics, this.origin);
        const sw = tileToScreen(x + 0.28, y + 0.72, zTop, this.metrics, this.origin);

        const nw0 = tileToScreen(x + 0.28, y + 0.28, zBase, this.metrics, this.origin);
        const ne0 = tileToScreen(x + 0.72, y + 0.28, zBase, this.metrics, this.origin);
        const se0 = tileToScreen(x + 0.72, y + 0.72, zBase, this.metrics, this.origin);
        const sw0 = tileToScreen(x + 0.28, y + 0.72, zBase, this.metrics, this.origin);

        const mutedTop = withAlpha(lighten(this.palette.landmarkMuted, 0.2), 0.55);
        const mutedEast = withAlpha(darken(this.palette.landmarkMuted, 0.2), 0.5);
        const mutedSouth = withAlpha(darken(this.palette.landmarkMuted, 0.36), 0.5);

        this._addQuadColor(ne, se, se0, ne0, mutedEast, mutedEast, mutedEast, mutedEast);
        this._addQuadColor(sw, se, se0, sw0, mutedSouth, mutedSouth, mutedSouth, mutedSouth);
        this._addQuadColor(nw, ne, se, sw, mutedTop, mutedTop, mutedTop, mutedTop);

        if (icon) {
          const iconAnchor = tileToScreen(x + 0.5, y + 0.5, zTop + 14, this.metrics, this.origin);
          this._queueSprite(icon, iconAnchor.x, iconAnchor.y + 2, 34, 34, [0.86, 0.84, 0.94, 0.5]);
        }

        const muted = withAlpha(this.palette.landmarkMuted, 0.36 + pulse * 0.18);
        this._addEllipse(center, 3.4 + pulse * 1.6, 2.8 + pulse * 0.9, muted, 18);
        this._addEllipse(center, 1.3 + pulse * 0.5, 1.3 + pulse * 0.5, withAlpha(parseColor('#e0d1ff'), 0.34), 14);
      }
    }
  }

  _pushCursor(cursor, elapsed) {
    const a = tileToScreen(cursor.x, cursor.y, 0, this.metrics, this.origin);
    const b = tileToScreen(cursor.x + 1, cursor.y, 0, this.metrics, this.origin);
    const c = tileToScreen(cursor.x + 1, cursor.y + 1, 0, this.metrics, this.origin);
    const d = tileToScreen(cursor.x, cursor.y + 1, 0, this.metrics, this.origin);

    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 10);
    const color = withAlpha(this.palette.cursor, 0.42 + pulse * 0.5);
    this._addLine(a, b, 2.2, color);
    this._addLine(b, c, 2.2, color);
    this._addLine(c, d, 2.2, color);
    this._addLine(d, a, 2.2, color);

    const ringFx = this.spriteTextures.getWorldFx?.(Math.sin(elapsed * 7) > 0 ? 1 : 2);
    if (ringFx) {
      const ring = tileToScreen(cursor.x + 0.5, cursor.y + 0.5, 8, this.metrics, this.origin);
      this._queueSprite(ringFx, ring.x, ring.y + 3, 22, 22, [1, 1, 1, 0.64]);
    }

    const arrow = tileToScreen(cursor.x + 0.5, cursor.y + 0.5, 12 + pulse * 2, this.metrics, this.origin);
    const cursorTexture = this.spriteTextures.getCursor?.(elapsed) || this.spriteTextures.get('cursor');
    if (cursorTexture) {
      this._queueSprite(cursorTexture, arrow.x, arrow.y + 4, 18, 18, [1, 1, 1, 0.98]);
    }
  }

  _flushColor() {
    if (this.colorData.length === 0) {
      return;
    }

    const gl = this.gl;
    const data = new Float32Array(this.colorData);

    gl.useProgram(this.colorProgram);
    gl.uniform2f(this.colorLoc.resolution, this.viewport.width, this.viewport.height);
    if (this.colorLoc.time) {
      gl.uniform1f(this.colorLoc.time, this.timeSec || 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const stride = 6 * 4;
    gl.enableVertexAttribArray(this.colorLoc.pos);
    gl.vertexAttribPointer(this.colorLoc.pos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.colorLoc.color);
    gl.vertexAttribPointer(this.colorLoc.color, 4, gl.FLOAT, false, stride, 2 * 4);

    gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
  }

  _flushTextures() {
    if (this.textureCommands.length === 0) {
      return;
    }

    const gl = this.gl;

    gl.useProgram(this.texProgram);
    gl.uniform2f(this.texLoc.resolution, this.viewport.width, this.viewport.height);
    gl.uniform1i(this.texLoc.tex, 0);
    if (this.texLoc.time) {
      gl.uniform1f(this.texLoc.time, this.timeSec || 0);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuffer);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const batches = new Map();
    for (const command of this.textureCommands) {
      const bucket = batches.get(command.texture) || [];
      bucket.push(...command.data);
      batches.set(command.texture, bucket);
    }

    for (const [texture, packed] of batches) {
      const vertexData = new Float32Array(packed);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);

      const stride = 9 * 4;
      gl.enableVertexAttribArray(this.texLoc.pos);
      gl.vertexAttribPointer(this.texLoc.pos, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(this.texLoc.uv);
      gl.vertexAttribPointer(this.texLoc.uv, 2, gl.FLOAT, false, stride, 2 * 4);
      gl.enableVertexAttribArray(this.texLoc.depth);
      gl.vertexAttribPointer(this.texLoc.depth, 1, gl.FLOAT, false, stride, 4 * 4);
      gl.enableVertexAttribArray(this.texLoc.tint);
      gl.vertexAttribPointer(this.texLoc.tint, 4, gl.FLOAT, false, stride, 5 * 4);

      gl.drawArrays(gl.TRIANGLES, 0, vertexData.length / 9);
    }

    gl.disable(gl.DEPTH_TEST);
  }

  render(viewModel, nowMs = performance.now()) {
    if (!this.gl) {
      this._renderFallback();
      return;
    }

    const gl = this.gl;
    const elapsed = nowMs * 0.001;
    this.timeSec = elapsed;

    this.colorData.length = 0;
    this.textureCommands.length = 0;

    if (!this.sceneTarget) {
      this._ensureRenderTarget(this.viewport.width, this.viewport.height);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget ? this.sceneTarget.fbo : null);
    gl.viewport(0, 0, this.viewport.width, this.viewport.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this._pushBackground(elapsed);
    this._pushTiles(elapsed);
    this._pushScenery(elapsed);
    this._pushRoutes(viewModel, elapsed);
    this._pushRegions(viewModel, elapsed);
    this._pushLandmarks(viewModel, elapsed);
    this._pushCursor(viewModel.cursor, elapsed);

    this._flushColor();
    this._flushTextures();
    this._blitToScreen();
  }
}
