/**
 * Texture Atlas Generator
 * Creates procedural 16-bit style pixel art sprites for all game elements
 */

export class TextureAtlas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.spriteSize = 64; // Each sprite is 64x64
    this.atlas = null;
    this.spriteMap = {};
  }

  // ============ N64-STYLE ENHANCEMENT HELPERS ============

  // Anti-aliased circle (N64-quality smooth edges)
  drawSmoothCircle(ctx, x, y, radius, color) {
    // If color is a gradient object, just draw once without anti-aliasing
    if (typeof color !== 'string') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Draw multiple layers with decreasing opacity for AA (string colors only)
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const r = radius + (i * 0.5);
      const alpha = 1.0 - (i / layers);
      ctx.fillStyle = this.adjustAlpha(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Anti-aliased rounded rectangle
  drawSmoothRoundRect(ctx, x, y, w, h, radius, color) {
    // Draw with slight blur effect
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
  }

  // Cel-shading outline
  drawOutline(ctx, x, y, w, h, outlineColor = '#000', thickness = 1) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = thickness;
    ctx.strokeRect(x, y, w, h);
  }

  // Dithered gradient (N64-style smooth transitions)
  createDitheredGradient(ctx, x1, y1, x2, y2, color1, color2) {
    // Create smoother gradient with more stops
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      gradient.addColorStop(t, `rgb(${r},${g},${b})`);
    }
    return gradient;
  }

  // Ambient occlusion shadow
  drawAO(ctx, x, y, w, h, intensity = 0.3) {
    ctx.fillStyle = `rgba(0, 0, 0, ${intensity})`;
    ctx.fillRect(x, y + h - 2, w, 2);
  }

  // Helper: adjust alpha of color
  adjustAlpha(color, alpha) {
    if (color.startsWith('rgb')) {
      return color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
    }
    const rgb = this.hexToRgb(color);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  // Helper: hex to RGB
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : {r: 0, g: 0, b: 0};
  }

  async generate() {
    console.log('[TextureAtlas] Generating sprites...');

    // Calculate atlas size
    const spritesPerRow = 16;
    const totalSprites = 64; // Estimate
    const rows = Math.ceil(totalSprites / spritesPerRow);

    this.canvas.width = spritesPerRow * this.spriteSize;
    this.canvas.height = rows * this.spriteSize;

    let x = 0;
    let y = 0;
    let index = 0;

    const addSprite = (name, drawFn) => {
      this.ctx.save();
      this.ctx.translate(x * this.spriteSize, y * this.spriteSize);
      drawFn(this.ctx, this.spriteSize);
      this.ctx.restore();

      // Store UV coordinates (0-1 range)
      this.spriteMap[name] = {
        u: x / spritesPerRow,
        v: y / rows,
        uSize: 1 / spritesPerRow,
        vSize: 1 / rows,
        index
      };

      x++;
      if (x >= spritesPerRow) {
        x = 0;
        y++;
      }
      index++;
    };

    // Generate all sprites
    this.generateTileSprites(addSprite);
    this.generateBuildingSprites(addSprite);
    this.generateEntitySprites(addSprite);
    this.generateZoneSprites(addSprite);

    console.log('[TextureAtlas] Generated', index, 'sprites');
    this.atlas = this.canvas;
    return this.atlas;
  }

  generateTileSprites(addSprite) {
    // Grass tile - SNES quality with detailed shading
    addSprite('grass', (ctx, size) => {
      // Create gradient base for depth
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#45b557');
      gradient.addColorStop(0.5, '#3a9d4a');
      gradient.addColorStop(1, '#2e8d3d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      // Add detailed grass blades with multiple shades
      const grassColors = ['#52c764', '#48b559', '#3fa54e', '#368f43', '#2d7938'];

      // Draw individual grass blades
      for (let i = 0; i < 80; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        const color = grassColors[Math.floor(Math.random() * grassColors.length)];
        ctx.fillStyle = color;

        // Grass blade shape (thin vertical line with slight curve)
        ctx.beginPath();
        ctx.moveTo(px, py + 4);
        ctx.quadraticCurveTo(px + Math.random() * 2 - 1, py + 2, px, py);
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        ctx.stroke();
      }

      // Add highlights for sun exposure
      ctx.fillStyle = 'rgba(120, 200, 80, 0.2)';
      for (let i = 0; i < 25; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        ctx.beginPath();
        ctx.arc(px, py, Math.random() * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add shadow patches for depth
      ctx.fillStyle = 'rgba(30, 80, 40, 0.3)';
      for (let i = 0; i < 15; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        ctx.beginPath();
        ctx.arc(px, py, Math.random() * 4 + 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Add occasional flowers/details
      if (Math.random() > 0.5) {
        ctx.fillStyle = '#f0e68c';
        const fx = Math.random() * size;
        const fy = Math.random() * size;
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Dirt tile
    addSprite('dirt', (ctx, size) => {
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(0, 0, size, size);

      // Dirt texture
      ctx.fillStyle = '#a08668';
      for (let i = 0; i < 30; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        ctx.fillRect(px, py, 2, 2);
      }

      ctx.fillStyle = '#6e5d4a';
      for (let i = 0; i < 25; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        ctx.fillRect(px, py, 2, 2);
      }
    });

    // Concrete tile
    addSprite('concrete', (ctx, size) => {
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(0, 0, size, size);

      // Grid pattern
      ctx.strokeStyle = '#656565';
      ctx.lineWidth = 1;
      for (let i = 0; i < size; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
      }

      // Concrete texture
      ctx.fillStyle = '#8a8a8a';
      for (let i = 0; i < 20; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        ctx.fillRect(px, py, 1, 1);
      }
    });

    // Water tile
    addSprite('water', (ctx, size) => {
      ctx.fillStyle = '#3a7bc8';
      ctx.fillRect(0, 0, size, size);

      // Water waves
      ctx.strokeStyle = '#4a8bd8';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const y = (i + 1) * (size / 6);
        ctx.moveTo(0, y);
        for (let x = 0; x < size; x += 8) {
          ctx.quadraticCurveTo(x + 4, y - 4, x + 8, y);
        }
        ctx.stroke();
      }

      // Light reflections
      ctx.fillStyle = '#5a9be8';
      for (let i = 0; i < 15; i++) {
        const px = Math.random() * size;
        const py = Math.random() * size;
        ctx.fillRect(px, py, 2, 2);
      }
    });
  }

  generateBuildingSprites(addSprite) {
    // Path/walkway - High quality brick pattern
    addSprite('path', (ctx, size) => {
      // Base gradient for depth
      const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size);
      gradient.addColorStop(0, '#a8a8a8');
      gradient.addColorStop(1, '#888888');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      // Draw detailed bricks
      const brickColors = ['#a89080', '#9d8270', '#927565', '#a08878'];
      const brickHeight = 8;
      const brickWidth = 16;

      for (let y = 0; y < size; y += brickHeight) {
        const offset = (y / brickHeight) % 2 === 0 ? 0 : brickWidth / 2;

        for (let x = -brickWidth; x < size + brickWidth; x += brickWidth) {
          const bx = x + offset;
          const by = y;

          // Random brick color
          ctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
          ctx.fillRect(bx, by, brickWidth - 1, brickHeight - 1);

          // Brick texture/variation
          ctx.fillStyle = `rgba(${100 + Math.random() * 50}, ${80 + Math.random() * 40}, ${60 + Math.random() * 30}, 0.15)`;
          for (let i = 0; i < 3; i++) {
            const tx = bx + Math.random() * (brickWidth - 2);
            const ty = by + Math.random() * (brickHeight - 2);
            ctx.fillRect(tx, ty, 2, 1);
          }

          // Highlight on top edge
          ctx.fillStyle = 'rgba(200, 180, 160, 0.3)';
          ctx.fillRect(bx, by, brickWidth - 1, 1);

          // Shadow on bottom edge
          ctx.fillStyle = 'rgba(40, 30, 25, 0.3)';
          ctx.fillRect(bx, by + brickHeight - 2, brickWidth - 1, 1);
        }
      }

      // Mortar lines (dark gray)
      ctx.strokeStyle = '#656565';
      ctx.lineWidth = 1.5;

      // Horizontal mortar
      for (let y = 0; y <= size; y += brickHeight) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }

      // Vertical mortar (staggered)
      for (let y = 0; y < size; y += brickHeight) {
        const offset = (y / brickHeight) % 2 === 0 ? 0 : brickWidth / 2;
        for (let x = -brickWidth; x < size + brickWidth; x += brickWidth) {
          ctx.beginPath();
          ctx.moveTo(x + offset, y);
          ctx.lineTo(x + offset, y + brickHeight);
          ctx.stroke();
        }
      }

      // Add weathering effects
      ctx.fillStyle = 'rgba(50, 50, 50, 0.1)';
      for (let i = 0; i < 10; i++) {
        const wx = Math.random() * size;
        const wy = Math.random() * size;
        ctx.beginPath();
        ctx.arc(wx, wy, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Bench
    addSprite('bench', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Grass background
      ctx.fillStyle = '#3a9d4a';
      ctx.fillRect(0, 0, size, size);

      // Bench seat (wood)
      ctx.fillStyle = '#8b5a3c';
      ctx.fillRect(centerX - 20, centerY - 4, 40, 8);

      // Bench back
      ctx.fillRect(centerX - 20, centerY - 16, 4, 16);
      ctx.fillRect(centerX + 16, centerY - 16, 4, 16);
      ctx.fillRect(centerX - 20, centerY - 16, 40, 4);

      // Bench legs
      ctx.fillStyle = '#5c3a24';
      ctx.fillRect(centerX - 18, centerY + 4, 3, 8);
      ctx.fillRect(centerX + 15, centerY + 4, 3, 8);
    });

    // Lamp post (lighting)
    addSprite('lighting', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Grass background
      ctx.fillStyle = '#3a9d4a';
      ctx.fillRect(0, 0, size, size);

      // Post
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(centerX - 2, centerY - 8, 4, 24);

      // Light fixture
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(centerX - 8, centerY - 12, 16, 8);

      // Light glow
      ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 8, 20, 0, Math.PI * 2);
      ctx.fill();

      // Base
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(centerX - 4, centerY + 16, 8, 4);
    });

    // Fountain
    addSprite('fountain', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Grass background
      ctx.fillStyle = '#3a9d4a';
      ctx.fillRect(0, 0, size, size);

      // Fountain basin
      ctx.fillStyle = '#5a7a9a';
      ctx.beginPath();
      ctx.arc(centerX, centerY + 4, 22, 0, Math.PI * 2);
      ctx.fill();

      // Water
      ctx.fillStyle = '#4a9ad8';
      ctx.beginPath();
      ctx.arc(centerX, centerY + 4, 18, 0, Math.PI * 2);
      ctx.fill();

      // Fountain spray
      ctx.fillStyle = '#7ac8ff';
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * 8;
        const y = centerY - 8 + Math.sin(angle) * 8;
        ctx.fillRect(x - 1, y - 8, 2, 8);
      }
    });

    // Security station
    addSprite('security', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Grass background
      ctx.fillStyle = '#3a9d4a';
      ctx.fillRect(0, 0, size, size);

      // Building
      ctx.fillStyle = '#2a4a7a';
      ctx.fillRect(centerX - 16, centerY - 12, 32, 28);

      // Door
      ctx.fillStyle = '#1a2a3a';
      ctx.fillRect(centerX - 6, centerY + 4, 12, 12);

      // Window
      ctx.fillStyle = '#7a9aca';
      ctx.fillRect(centerX - 12, centerY - 8, 8, 8);
      ctx.fillRect(centerX + 4, centerY - 8, 8, 8);

      // Badge/shield
      ctx.fillStyle = '#ffc107';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 18);
      ctx.lineTo(centerX - 6, centerY - 12);
      ctx.lineTo(centerX - 6, centerY - 6);
      ctx.lineTo(centerX, centerY - 2);
      ctx.lineTo(centerX + 6, centerY - 6);
      ctx.lineTo(centerX + 6, centerY - 12);
      ctx.closePath();
      ctx.fill();
    });

    // Maintenance depot
    addSprite('maintenance', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Grass background
      ctx.fillStyle = '#3a9d4a';
      ctx.fillRect(0, 0, size, size);

      // Building
      ctx.fillStyle = '#c67a3a';
      ctx.fillRect(centerX - 16, centerY - 12, 32, 28);

      // Door
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(centerX - 6, centerY + 4, 12, 12);

      // Tools icon
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 3;
      // Wrench
      ctx.beginPath();
      ctx.moveTo(centerX - 8, centerY - 8);
      ctx.lineTo(centerX + 4, centerY - 8);
      ctx.stroke();
      // Hammer
      ctx.beginPath();
      ctx.moveTo(centerX + 6, centerY - 4);
      ctx.lineTo(centerX + 6, centerY + 8);
      ctx.stroke();
    });

    // Programs building
    addSprite('programs', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Grass background
      ctx.fillStyle = '#3a9d4a';
      ctx.fillRect(0, 0, size, size);

      // Building
      ctx.fillStyle = '#9a4a9a';
      ctx.fillRect(centerX - 16, centerY - 12, 32, 28);

      // Door
      ctx.fillStyle = '#6a2a6a';
      ctx.fillRect(centerX - 6, centerY + 4, 12, 12);

      // Book/education icon
      ctx.fillStyle = '#ffc107';
      ctx.fillRect(centerX - 10, centerY - 8, 20, 14);
      ctx.fillStyle = '#9a4a9a';
      ctx.fillRect(centerX - 8, centerY - 6, 2, 10);
      ctx.fillRect(centerX - 2, centerY - 6, 2, 10);
      ctx.fillRect(centerX + 4, centerY - 6, 2, 10);
    });
  }

  generateEntitySprites(addSprite) {
    // Regular visitor (generic person) - N64 PRE-RENDERED QUALITY
    addSprite('visitor', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Legs with N64-style dithered gradient
      const legGradient = this.createDitheredGradient(ctx, centerX - 6, centerY + 16, centerX + 6, centerY + 26, '#4a6a9a', '#2a4a6a');
      ctx.fillStyle = legGradient;
      this.drawSmoothRoundRect(ctx, centerX - 6, centerY + 16, 4, 10, 2, legGradient);
      this.drawSmoothRoundRect(ctx, centerX + 2, centerY + 16, 4, 10, 2, legGradient);

      // Leg ambient occlusion
      this.drawAO(ctx, centerX - 6, centerY + 16, 4, 10, 0.2);
      this.drawAO(ctx, centerX + 2, centerY + 16, 4, 10, 0.2);

      // Shoes with rounded edges
      this.drawSmoothRoundRect(ctx, centerX - 7, centerY + 25, 5, 3, 1, '#1a2a3a');
      this.drawSmoothRoundRect(ctx, centerX + 1, centerY + 25, 5, 3, 1, '#1a2a3a');

      // Body with enhanced N64-style shading
      const bodyGradient = this.createDitheredGradient(ctx, centerX - 8, centerY, centerX + 8, centerY + 16, '#6a9bd8', '#3a6bb8');
      this.drawSmoothRoundRect(ctx, centerX - 8, centerY, 16, 16, 3, bodyGradient);

      // Body specular highlight (stronger N64-style)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(centerX - 5, centerY + 1, 10, 2);

      // Body ambient occlusion at bottom
      this.drawAO(ctx, centerX - 8, centerY, 16, 16, 0.25);

      // Arms with smooth rounded edges
      const armGradient = this.createDitheredGradient(ctx, centerX - 12, centerY + 2, centerX - 8, centerY + 12, '#6a9bd8', '#4a7bc8');
      this.drawSmoothRoundRect(ctx, centerX - 12, centerY + 2, 4, 10, 2, armGradient);
      this.drawSmoothRoundRect(ctx, centerX + 8, centerY + 2, 4, 10, 2, armGradient);

      // Hands with anti-aliased circles
      this.drawSmoothCircle(ctx, centerX - 10, centerY + 12, 2.5, '#ffc8a0');
      this.drawSmoothCircle(ctx, centerX + 10, centerY + 12, 2.5, '#ffc8a0');

      // Neck with smooth transition
      this.drawSmoothRoundRect(ctx, centerX - 2, centerY - 2, 4, 4, 1, '#ffdbac');

      // Head with N64-style radial shading
      const headGradient = ctx.createRadialGradient(centerX - 2, centerY - 10, 2, centerX, centerY - 8, 9);
      headGradient.addColorStop(0, '#fff0d8');
      headGradient.addColorStop(0.7, '#ffe8c8');
      headGradient.addColorStop(1, '#edc8a0');
      this.drawSmoothCircle(ctx, centerX, centerY - 8, 8.5, headGradient);

      // Face ambient occlusion (right side darker)
      ctx.fillStyle = 'rgba(180, 130, 90, 0.25)';
      ctx.beginPath();
      ctx.arc(centerX + 2, centerY - 7, 7, 0, Math.PI * 2);
      ctx.fill();

      // Hair with smoother style
      ctx.fillStyle = '#5a3a2a';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 12, 9, Math.PI, 0);
      ctx.fill();

      // Hair specular highlights (N64-style shine)
      ctx.fillStyle = 'rgba(120, 90, 70, 0.6)';
      ctx.fillRect(centerX - 5, centerY - 14, 3, 3);
      ctx.fillRect(centerX + 2, centerY - 15, 2, 4);

      // Eyes with better definition
      ctx.fillStyle = '#1a1a1a';
      this.drawSmoothCircle(ctx, centerX - 3, centerY - 9, 1.5, '#1a1a1a');
      this.drawSmoothCircle(ctx, centerX + 3, centerY - 9, 1.5, '#1a1a1a');

      // Eye highlights (makes them alive)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(centerX - 3, centerY - 10, 1, 1);
      ctx.fillRect(centerX + 3, centerY - 10, 1, 1);

      // Mouth
      ctx.strokeStyle = '#c8a080';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY - 5, 2, 0, Math.PI);
      ctx.stroke();
    });

    // TV Bike Guy (iconic!)
    addSprite('tv-bike-guy', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Bike
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 3;
      // Wheels
      ctx.beginPath();
      ctx.arc(centerX - 8, centerY + 12, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(centerX + 8, centerY + 12, 6, 0, Math.PI * 2);
      ctx.stroke();
      // Frame
      ctx.beginPath();
      ctx.moveTo(centerX - 8, centerY + 12);
      ctx.lineTo(centerX, centerY);
      ctx.lineTo(centerX + 8, centerY + 12);
      ctx.stroke();

      // Person
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 6, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#c74a4a';
      ctx.fillRect(centerX - 6, centerY, 12, 12);

      // TV on head!
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(centerX - 10, centerY - 20, 20, 16);
      // Screen
      ctx.fillStyle = '#4a9ad8';
      ctx.fillRect(centerX - 8, centerY - 18, 16, 12);
      // Static/noise
      ctx.fillStyle = '#7ac8ff';
      for (let i = 0; i < 20; i++) {
        const px = centerX - 8 + Math.random() * 16;
        const py = centerY - 18 + Math.random() * 12;
        ctx.fillRect(px, py, 1, 1);
      }
      // Antenna
      ctx.strokeStyle = '#5a5a5a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 6, centerY - 20);
      ctx.lineTo(centerX - 10, centerY - 26);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX + 6, centerY - 20);
      ctx.lineTo(centerX + 10, centerY - 26);
      ctx.stroke();
    });

    // Hipster - N64 QUALITY
    addSprite('hipster', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Skinny jeans with N64-style dithered gradient
      const jeansGradient = this.createDitheredGradient(ctx, centerX - 5, centerY + 16, centerX + 5, centerY + 26, '#3a4a6a', '#1a2a3a');
      this.drawSmoothRoundRect(ctx, centerX - 5, centerY + 16, 3, 10, 2, jeansGradient);
      this.drawSmoothRoundRect(ctx, centerX + 2, centerY + 16, 3, 10, 2, jeansGradient);

      // Shoes (vintage boots)
      this.drawSmoothRoundRect(ctx, centerX - 6, centerY + 25, 4, 3, 1, '#4a3a2a');
      this.drawSmoothRoundRect(ctx, centerX + 1, centerY + 25, 4, 3, 1, '#4a3a2a');

      // Flannel shirt with N64-style plaid pattern and shading
      const flannelBase = this.createDitheredGradient(ctx, centerX - 8, centerY, centerX + 8, centerY + 16, '#d75a5a', '#a74a4a');
      this.drawSmoothRoundRect(ctx, centerX - 8, centerY, 16, 16, 3, flannelBase);

      // Plaid stripes with smooth rendering
      ctx.fillStyle = 'rgba(138, 58, 58, 0.7)';
      for (let i = 0; i < 4; i++) {
        this.drawSmoothRoundRect(ctx, centerX - 8 + i * 4, centerY, 2, 16, 1, 'rgba(138, 58, 58, 0.7)');
      }
      // Horizontal plaid
      for (let i = 0; i < 3; i++) {
        this.drawSmoothRoundRect(ctx, centerX - 8, centerY + i * 5, 16, 2, 1, 'rgba(90, 40, 40, 0.5)');
      }

      // Body ambient occlusion
      this.drawAO(ctx, centerX - 8, centerY, 16, 16, 0.2);

      // Arms with smooth edges
      const armGradient = this.createDitheredGradient(ctx, centerX - 12, centerY + 2, centerX - 8, centerY + 12, '#d75a5a', '#b74a4a');
      this.drawSmoothRoundRect(ctx, centerX - 12, centerY + 2, 4, 10, 2, armGradient);
      this.drawSmoothRoundRect(ctx, centerX + 8, centerY + 2, 4, 10, 2, armGradient);

      // Hands (pale hipster skin)
      this.drawSmoothCircle(ctx, centerX - 10, centerY + 12, 2.5, '#ffdbac');
      this.drawSmoothCircle(ctx, centerX + 10, centerY + 12, 2.5, '#ffdbac');

      // Neck
      this.drawSmoothRoundRect(ctx, centerX - 2, centerY - 2, 4, 4, 1, '#ffdbac');

      // Head with N64-style radial shading
      const headGradient = ctx.createRadialGradient(centerX - 2, centerY - 10, 2, centerX, centerY - 8, 9);
      headGradient.addColorStop(0, '#fff0d8');
      headGradient.addColorStop(0.7, '#ffe8c8');
      headGradient.addColorStop(1, '#edc8a0');
      this.drawSmoothCircle(ctx, centerX, centerY - 8, 8.5, headGradient);

      // Beard with texture (key hipster feature)
      const beardGradient = this.createDitheredGradient(ctx, centerX - 6, centerY - 2, centerX + 6, centerY + 4, '#5a3a2a', '#3a2a1a');
      this.drawSmoothRoundRect(ctx, centerX - 6, centerY - 2, 12, 6, 2, beardGradient);

      // Beard highlights (texture)
      ctx.fillStyle = 'rgba(90, 60, 40, 0.5)';
      ctx.fillRect(centerX - 4, centerY, 2, 3);
      ctx.fillRect(centerX + 2, centerY + 1, 2, 2);

      // Thick-rimmed glasses (iconic hipster accessory)
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 2.5;
      // Left lens
      ctx.beginPath();
      ctx.roundRect(centerX - 8, centerY - 12, 6, 6, 1);
      ctx.stroke();
      // Right lens
      ctx.beginPath();
      ctx.roundRect(centerX + 2, centerY - 12, 6, 6, 1);
      ctx.stroke();
      // Bridge
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 2, centerY - 9);
      ctx.lineTo(centerX + 2, centerY - 9);
      ctx.stroke();

      // Lens glare (N64-style reflection)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(centerX - 7, centerY - 11, 3, 2);
      ctx.fillRect(centerX + 3, centerY - 11, 3, 2);

      // Hair (man bun on top)
      ctx.fillStyle = '#5a3a2a';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 12, 9, Math.PI, 0);
      ctx.fill();
      // Man bun
      this.drawSmoothCircle(ctx, centerX + 2, centerY - 15, 3, '#4a2a1a');

      // Eyes behind glasses
      this.drawSmoothCircle(ctx, centerX - 5, centerY - 9, 1.2, '#2a2a2a');
      this.drawSmoothCircle(ctx, centerX + 5, centerY - 9, 1.2, '#2a2a2a');
    });

    // Accordion player - N64 QUALITY
    addSprite('accordion-player', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Legs with N64-style gradient
      const legGradient = this.createDitheredGradient(ctx, centerX - 6, centerY + 16, centerX + 6, centerY + 26, '#3a3a4a', '#1a1a2a');
      this.drawSmoothRoundRect(ctx, centerX - 6, centerY + 16, 4, 10, 2, legGradient);
      this.drawSmoothRoundRect(ctx, centerX + 2, centerY + 16, 4, 10, 2, legGradient);

      // Shoes
      this.drawSmoothRoundRect(ctx, centerX - 7, centerY + 25, 5, 3, 1, '#2a2a2a');
      this.drawSmoothRoundRect(ctx, centerX + 1, centerY + 25, 5, 3, 1, '#2a2a2a');

      // Body/vest with N64-style shading
      const vestGradient = this.createDitheredGradient(ctx, centerX - 8, centerY, centerX + 8, centerY + 16, '#7a5a4a', '#5a3a2a');
      this.drawSmoothRoundRect(ctx, centerX - 8, centerY, 16, 16, 3, vestGradient);

      // Vest buttons (gold)
      for (let i = 0; i < 3; i++) {
        this.drawSmoothCircle(ctx, centerX, centerY + 3 + i * 5, 1.5, '#ffc107');
      }

      // Body ambient occlusion
      this.drawAO(ctx, centerX - 8, centerY, 16, 16, 0.2);

      // LEFT SIDE OF ACCORDION (red with keys)
      const accordionLeftGrad = this.createDitheredGradient(ctx, centerX - 14, centerY + 4, centerX - 4, centerY + 16, '#d74a4a', '#a73a3a');
      this.drawSmoothRoundRect(ctx, centerX - 14, centerY + 4, 10, 12, 2, accordionLeftGrad);

      // Keys on left side (white buttons)
      ctx.fillStyle = '#f0f0f0';
      for (let i = 0; i < 5; i++) {
        this.drawSmoothCircle(ctx, centerX - 11, centerY + 7 + i * 2, 1, '#f0f0f0');
      }

      // Key highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(centerX - 12, centerY + 7 + i * 2, 1, 1);
      }

      // BELLOWS (middle stretchy part)
      ctx.fillStyle = '#8a3a3a';
      for (let i = 0; i < 3; i++) {
        this.drawSmoothRoundRect(ctx, centerX - 6 + i * 4, centerY + 6, 2, 8, 1, '#7a2a2a');
      }
      // Bellows highlights
      ctx.fillStyle = 'rgba(200, 100, 100, 0.5)';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(centerX - 6 + i * 4, centerY + 7, 2, 1);
      }

      // RIGHT SIDE OF ACCORDION (red)
      const accordionRightGrad = this.createDitheredGradient(ctx, centerX + 4, centerY + 4, centerX + 14, centerY + 16, '#d74a4a', '#a73a3a');
      this.drawSmoothRoundRect(ctx, centerX + 4, centerY + 4, 10, 12, 2, accordionRightGrad);

      // Left arm (holding accordion keys)
      const armGradient = this.createDitheredGradient(ctx, centerX - 16, centerY + 4, centerX - 14, centerY + 12, '#8a6a5a', '#6a4a3a');
      this.drawSmoothRoundRect(ctx, centerX - 16, centerY + 4, 4, 8, 2, armGradient);
      // Left hand
      this.drawSmoothCircle(ctx, centerX - 14, centerY + 12, 2.5, '#ffc8a0');

      // Right arm (holding accordion)
      this.drawSmoothRoundRect(ctx, centerX + 12, centerY + 4, 4, 8, 2, armGradient);
      // Right hand
      this.drawSmoothCircle(ctx, centerX + 14, centerY + 12, 2.5, '#ffc8a0');

      // Neck
      this.drawSmoothRoundRect(ctx, centerX - 2, centerY - 2, 4, 4, 1, '#ffdbac');

      // Head with N64-style radial shading
      const headGradient = ctx.createRadialGradient(centerX - 2, centerY - 10, 2, centerX, centerY - 8, 9);
      headGradient.addColorStop(0, '#fff0d8');
      headGradient.addColorStop(0.7, '#ffe8c8');
      headGradient.addColorStop(1, '#edc8a0');
      this.drawSmoothCircle(ctx, centerX, centerY - 8, 8.5, headGradient);

      // Hat (traditional musician cap)
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 12, 10, 4, 0, Math.PI, 0);
      ctx.fill();
      // Hat brim
      ctx.fillRect(centerX - 10, centerY - 12, 20, 3);

      // Eyes
      this.drawSmoothCircle(ctx, centerX - 3, centerY - 9, 1.5, '#2a2a2a');
      this.drawSmoothCircle(ctx, centerX + 3, centerY - 9, 1.5, '#2a2a2a');

      // Eye highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(centerX - 3, centerY - 10, 1, 1);
      ctx.fillRect(centerX + 3, centerY - 10, 1, 1);

      // Mouth (slight smile - enjoying the music)
      ctx.strokeStyle = '#c8a080';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY - 5, 3, 0, Math.PI);
      ctx.stroke();

      // Mustache (old-world musician)
      ctx.fillStyle = '#4a3a2a';
      ctx.beginPath();
      ctx.ellipse(centerX - 3, centerY - 6, 4, 1.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(centerX + 3, centerY - 6, 4, 1.5, 0.3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Dog walker - N64 QUALITY
    addSprite('dog-walker', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // === PERSON ===
      // Person legs
      const personLegGradient = this.createDitheredGradient(ctx, centerX - 13, centerY + 12, centerX - 9, centerY + 22, '#4a6a8a', '#2a4a6a');
      this.drawSmoothRoundRect(ctx, centerX - 13, centerY + 12, 3, 10, 2, personLegGradient);
      this.drawSmoothRoundRect(ctx, centerX - 7, centerY + 12, 3, 10, 2, personLegGradient);

      // Person shoes
      this.drawSmoothRoundRect(ctx, centerX - 14, centerY + 21, 4, 3, 1, '#2a3a4a');
      this.drawSmoothRoundRect(ctx, centerX - 8, centerY + 21, 4, 3, 1, '#2a3a4a');

      // Person body (green jacket)
      const jacketGradient = this.createDitheredGradient(ctx, centerX - 14, centerY - 2, centerX - 2, centerY + 12, '#4a8a5a', '#3a6a4a');
      this.drawSmoothRoundRect(ctx, centerX - 14, centerY - 2, 12, 14, 3, jacketGradient);

      // Jacket zipper
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(centerX - 9, centerY, 2, 10);
      // Zipper pull
      this.drawSmoothCircle(ctx, centerX - 8, centerY + 1, 1.5, '#9a9a9a');

      // Body ambient occlusion
      this.drawAO(ctx, centerX - 14, centerY - 2, 12, 14, 0.2);

      // Person arms
      const armGradient = this.createDitheredGradient(ctx, centerX - 16, centerY + 2, centerX - 14, centerY + 10, '#4a8a5a', '#3a6a4a');
      this.drawSmoothRoundRect(ctx, centerX - 16, centerY + 2, 3, 8, 2, armGradient);
      this.drawSmoothRoundRect(ctx, centerX - 4, centerY + 2, 3, 8, 2, armGradient);

      // Person hands
      this.drawSmoothCircle(ctx, centerX - 15, centerY + 10, 2.5, '#ffc8a0');
      this.drawSmoothCircle(ctx, centerX - 2, centerY + 10, 2.5, '#ffc8a0');

      // Neck
      this.drawSmoothRoundRect(ctx, centerX - 10, centerY - 4, 4, 4, 1, '#ffdbac');

      // Person head with N64-style shading
      const headGradient = ctx.createRadialGradient(centerX - 10, centerY - 10, 2, centerX - 8, centerY - 8, 7);
      headGradient.addColorStop(0, '#fff0d8');
      headGradient.addColorStop(0.7, '#ffe8c8');
      headGradient.addColorStop(1, '#edc8a0');
      this.drawSmoothCircle(ctx, centerX - 8, centerY - 8, 7, headGradient);

      // Hair (ponytail)
      ctx.fillStyle = '#6a4a2a';
      ctx.beginPath();
      ctx.arc(centerX - 8, centerY - 10, 7.5, Math.PI, 0);
      ctx.fill();
      // Ponytail holder
      this.drawSmoothCircle(ctx, centerX - 14, centerY - 10, 2, '#c74a9a');

      // Person eyes
      this.drawSmoothCircle(ctx, centerX - 10, centerY - 9, 1.3, '#2a2a2a');
      this.drawSmoothCircle(ctx, centerX - 6, centerY - 9, 1.3, '#2a2a2a');

      // Eye highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(centerX - 10, centerY - 10, 1, 1);
      ctx.fillRect(centerX - 6, centerY - 10, 1, 1);

      // Person mouth (slight smile)
      ctx.strokeStyle = '#c8a080';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX - 8, centerY - 5, 2, 0, Math.PI);
      ctx.stroke();

      // === DOG ===
      // Dog body with gradient (golden retriever)
      const dogBodyGradient = this.createDitheredGradient(ctx, centerX + 4, centerY + 14, centerX + 16, centerY + 22, '#b8946a', '#8a6a4a');
      this.drawSmoothRoundRect(ctx, centerX + 4, centerY + 14, 12, 8, 3, dogBodyGradient);

      // Dog head
      const dogHeadGradient = this.createDitheredGradient(ctx, centerX + 12, centerY + 10, centerX + 18, centerY + 16, '#c89a6a', '#9a7a5a');
      this.drawSmoothRoundRect(ctx, centerX + 12, centerY + 10, 6, 6, 3, dogHeadGradient);

      // Dog snout
      this.drawSmoothRoundRect(ctx, centerX + 16, centerY + 13, 4, 3, 2, '#a88a6a');

      // Dog nose (black, wet look)
      this.drawSmoothCircle(ctx, centerX + 18, centerY + 14, 1.5, '#1a1a1a');
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(centerX + 18, centerY + 13, 1, 1);

      // Dog ears (floppy)
      const earGradient = this.createDitheredGradient(ctx, centerX + 12, centerY + 8, centerX + 14, centerY + 14, '#9a7a5a', '#7a5a3a');
      this.drawSmoothRoundRect(ctx, centerX + 12, centerY + 10, 2, 6, 2, earGradient);
      this.drawSmoothRoundRect(ctx, centerX + 16, centerY + 10, 2, 6, 2, earGradient);

      // Dog eyes (happy!)
      this.drawSmoothCircle(ctx, centerX + 14, centerY + 12, 1.2, '#3a2a1a');
      this.drawSmoothCircle(ctx, centerX + 17, centerY + 12, 1.2, '#3a2a1a');

      // Dog eye highlights (sparkle)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(centerX + 14, centerY + 11, 1, 1);
      ctx.fillRect(centerX + 17, centerY + 11, 1, 1);

      // Dog legs with gradient
      const dogLegGradient = this.createDitheredGradient(ctx, centerX + 6, centerY + 22, centerX + 8, centerY + 26, '#9a7a5a', '#7a5a3a');
      this.drawSmoothRoundRect(ctx, centerX + 6, centerY + 22, 2, 4, 1, dogLegGradient);
      this.drawSmoothRoundRect(ctx, centerX + 10, centerY + 22, 2, 4, 1, dogLegGradient);
      this.drawSmoothRoundRect(ctx, centerX + 14, centerY + 22, 2, 4, 1, dogLegGradient);

      // Dog tail (wagging!)
      ctx.strokeStyle = '#a88a6a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX + 5, centerY + 16);
      ctx.quadraticCurveTo(centerX + 2, centerY + 12, centerX + 4, centerY + 8);
      ctx.stroke();

      // Tail tip highlight
      this.drawSmoothCircle(ctx, centerX + 4, centerY + 8, 2, '#c8aa8a');

      // === LEASH ===
      ctx.strokeStyle = '#6a4a3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 2, centerY + 10); // From person's hand
      ctx.quadraticCurveTo(centerX + 4, centerY + 12, centerX + 14, centerY + 12); // To dog collar
      ctx.stroke();

      // Dog collar
      ctx.strokeStyle = '#c74a4a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(centerX + 14, centerY + 12, 4, 0, Math.PI * 2);
      ctx.stroke();

      // Collar buckle (metal)
      this.drawSmoothCircle(ctx, centerX + 16, centerY + 11, 1.5, '#d4af37');
    });

    // Tarot reader - N64 QUALITY
    addSprite('tarot-reader', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Table (dark wood) - drawn first so everything sits on top
      const tableGradient = this.createDitheredGradient(ctx, centerX - 16, centerY + 16, centerX + 16, centerY + 20, '#6a4a3a', '#4a2a1a');
      this.drawSmoothRoundRect(ctx, centerX - 16, centerY + 16, 32, 4, 2, tableGradient);

      // Table cloth edge (mystical purple)
      const clothGradient = this.createDitheredGradient(ctx, centerX - 18, centerY + 14, centerX + 18, centerY + 17, '#7a3a7a', '#5a2a5a');
      this.drawSmoothRoundRect(ctx, centerX - 18, centerY + 14, 36, 3, 1, clothGradient);

      // Mystical glow under hands (before robe)
      const glowGradient = ctx.createRadialGradient(centerX, centerY + 8, 0, centerX, centerY + 8, 12);
      glowGradient.addColorStop(0, 'rgba(255, 235, 59, 0.4)');
      glowGradient.addColorStop(1, 'rgba(255, 235, 59, 0)');
      ctx.fillStyle = glowGradient;
      ctx.fillRect(centerX - 12, centerY, 24, 16);

      // Robe with rich N64-style gradient
      const robeGradient = this.createDitheredGradient(ctx, centerX - 12, centerY, centerX + 12, centerY + 18, '#aa5aaa', '#7a3a7a');
      this.drawSmoothRoundRect(ctx, centerX - 12, centerY, 24, 18, 4, robeGradient);

      // Robe embroidery (mystical patterns)
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
      ctx.lineWidth = 1.5;
      // Left pattern
      ctx.beginPath();
      ctx.arc(centerX - 6, centerY + 6, 3, 0, Math.PI * 2);
      ctx.stroke();
      // Right pattern
      ctx.beginPath();
      ctx.arc(centerX + 6, centerY + 6, 3, 0, Math.PI * 2);
      ctx.stroke();
      // Center star
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x1 = centerX + Math.cos(angle) * 2;
        const y1 = centerY + 12 + Math.sin(angle) * 2;
        const x2 = centerX + Math.cos(angle + Math.PI / 5) * 4;
        const y2 = centerY + 12 + Math.sin(angle + Math.PI / 5) * 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Robe ambient occlusion
      this.drawAO(ctx, centerX - 12, centerY, 24, 18, 0.25);

      // Arms/sleeves
      const sleeveGradient = this.createDitheredGradient(ctx, centerX - 14, centerY + 4, centerX - 10, centerY + 12, '#9a4a9a', '#7a3a7a');
      this.drawSmoothRoundRect(ctx, centerX - 14, centerY + 4, 4, 8, 2, sleeveGradient);
      this.drawSmoothRoundRect(ctx, centerX + 10, centerY + 4, 4, 8, 2, sleeveGradient);

      // Hands over crystal ball (mystical pose)
      const handShadow = 'rgba(0, 0, 0, 0.3)';
      ctx.fillStyle = handShadow;
      ctx.fillRect(centerX - 6, centerY + 12, 12, 2);

      this.drawSmoothCircle(ctx, centerX - 8, centerY + 12, 2.5, '#d4a574');
      this.drawSmoothCircle(ctx, centerX + 8, centerY + 12, 2.5, '#d4a574');

      // Rings on fingers (gold)
      this.drawSmoothCircle(ctx, centerX - 9, centerY + 12, 0.8, '#ffd700');
      this.drawSmoothCircle(ctx, centerX + 9, centerY + 12, 0.8, '#ffd700');

      // Crystal ball (centered between hands)
      const crystalGradient = ctx.createRadialGradient(centerX - 1, centerY + 7, 1, centerX, centerY + 8, 4);
      crystalGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      crystalGradient.addColorStop(0.5, 'rgba(200, 200, 255, 0.7)');
      crystalGradient.addColorStop(1, 'rgba(150, 150, 220, 0.5)');
      this.drawSmoothCircle(ctx, centerX, centerY + 8, 4, crystalGradient);

      // Mystical symbol inside crystal ball
      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 6px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☽', centerX, centerY + 8);

      // Neck
      this.drawSmoothRoundRect(ctx, centerX - 2, centerY - 2, 4, 4, 1, '#d4a574');

      // Head with N64-style shading
      const headGradient = ctx.createRadialGradient(centerX - 2, centerY - 8, 2, centerX, centerY - 6, 7);
      headGradient.addColorStop(0, '#ffe8d0');
      headGradient.addColorStop(0.7, '#e8c8b0');
      headGradient.addColorStop(1, '#c8a890');
      this.drawSmoothCircle(ctx, centerX, centerY - 6, 7, headGradient);

      // Headscarf (mystical purple)
      const scarfGradient = this.createDitheredGradient(ctx, centerX - 10, centerY - 14, centerX + 10, centerY - 4, '#8a3a8a', '#6a2a6a');
      this.drawSmoothRoundRect(ctx, centerX - 10, centerY - 14, 20, 10, 3, scarfGradient);

      // Scarf pattern (gold thread)
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX - 8 + i * 5, centerY - 12);
        ctx.lineTo(centerX - 6 + i * 5, centerY - 6);
        ctx.stroke();
      }

      // Scarf jewel (center forehead)
      const jewelGradient = ctx.createRadialGradient(centerX, centerY - 10, 0, centerX, centerY - 10, 2.5);
      jewelGradient.addColorStop(0, '#ff6b9d');
      jewelGradient.addColorStop(0.6, '#c73b6d');
      jewelGradient.addColorStop(1, '#8a1a3a');
      this.drawSmoothCircle(ctx, centerX, centerY - 10, 2.5, jewelGradient);

      // Jewel highlight (sparkle)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(centerX - 1, centerY - 11, 2, 2);

      // Eyes (wise, knowing)
      this.drawSmoothCircle(ctx, centerX - 3, centerY - 7, 1.5, '#3a2a1a');
      this.drawSmoothCircle(ctx, centerX + 3, centerY - 7, 1.5, '#3a2a1a');

      // Eye highlights (mystical gleam)
      ctx.fillStyle = 'rgba(255, 235, 59, 0.9)';
      ctx.fillRect(centerX - 3, centerY - 8, 1, 1);
      ctx.fillRect(centerX + 3, centerY - 8, 1, 1);

      // Tarot cards on table (3 cards spread)
      const cardPositions = [
        { x: centerX - 10, y: centerY + 10 },
        { x: centerX - 2, y: centerY + 11 },
        { x: centerX + 6, y: centerY + 10 }
      ];

      cardPositions.forEach((pos, idx) => {
        // Card backing
        const cardGradient = this.createDitheredGradient(ctx, pos.x, pos.y, pos.x + 5, pos.y + 7, '#f8f8f8', '#d8d8d8');
        this.drawSmoothRoundRect(ctx, pos.x, pos.y, 5, 7, 1, cardGradient);

        // Card border
        ctx.strokeStyle = '#8a6a4a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(pos.x + 0.5, pos.y + 0.5, 4, 6);

        // Mystical symbol on card
        ctx.fillStyle = ['#c74a4a', '#4a7ac7', '#ffeb3b'][idx];
        ctx.font = 'bold 5px serif';
        ctx.textAlign = 'center';
        ctx.fillText(['☼', '☆', '☽'][idx], pos.x + 2.5, pos.y + 4);
      });
    });

    // Activity: Spikeball
    addSprite('spikeball', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Net (trampoline-like)
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(centerX, centerY + 4, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.arc(centerX, centerY + 4, 10, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(centerX + 8, centerY - 12, 6, 0, Math.PI * 2);
      ctx.fill();

      // Players (simple figures)
      ctx.fillStyle = '#4a7bc8';
      ctx.fillRect(centerX - 20, centerY + 6, 6, 10);
      ctx.fillRect(centerX + 14, centerY + 6, 6, 10);
    });

    // Activity: Yoga
    addSprite('yoga', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Yoga mat
      ctx.fillStyle = '#9a4a9a';
      ctx.fillRect(centerX - 16, centerY + 8, 32, 16);

      // Person in yoga pose (sitting cross-legged)
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 6, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#7ac8ff';
      ctx.fillRect(centerX - 8, centerY, 16, 12);

      // Arms in meditation pose
      ctx.fillRect(centerX - 12, centerY + 2, 4, 8);
      ctx.fillRect(centerX + 8, centerY + 2, 4, 8);

      // Legs crossed
      ctx.fillRect(centerX - 10, centerY + 12, 8, 4);
      ctx.fillRect(centerX + 2, centerY + 12, 8, 4);
    });

    // Activity: Outdoor DJ
    addSprite('outdoor-dj', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // DJ booth/table
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(centerX - 18, centerY + 4, 36, 16);

      // Turntables
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.arc(centerX - 10, centerY + 12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX + 10, centerY + 12, 6, 0, Math.PI * 2);
      ctx.fill();

      // DJ person
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 8, 6, 0, Math.PI * 2);
      ctx.fill();

      // Headphones
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY - 8, 10, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();

      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(centerX - 12, centerY - 8, 4, 6);
      ctx.fillRect(centerX + 8, centerY - 8, 4, 6);

      // Body
      ctx.fillStyle = '#c74a4a';
      ctx.fillRect(centerX - 8, centerY - 2, 16, 8);

      // Sound waves
      ctx.strokeStyle = '#4ac7c8';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY + 12, 12 + i * 6, 0, Math.PI);
        ctx.stroke();
      }
    });

    // Activity: Outdoor Film Screening (3x2)
    addSprite('outdoor-film', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Screen
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(centerX - 24, centerY - 16, 48, 28);

      // Screen frame
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 3;
      ctx.strokeRect(centerX - 24, centerY - 16, 48, 28);

      // Projector light (triangle)
      ctx.fillStyle = 'rgba(255, 255, 200, 0.3)';
      ctx.beginPath();
      ctx.moveTo(centerX, centerY + 20);
      ctx.lineTo(centerX - 20, centerY - 10);
      ctx.lineTo(centerX + 20, centerY - 10);
      ctx.closePath();
      ctx.fill();

      // Projector
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(centerX - 6, centerY + 18, 12, 8);

      // Audience silhouettes
      ctx.fillStyle = '#1a1a1a';
      for (let i = 0; i < 5; i++) {
        const x = centerX - 20 + i * 10;
        ctx.beginPath();
        ctx.arc(x, centerY + 16, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Activity: Kombucha Stand (2x1)
    addSprite('kombucha-stand', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Stand table
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(centerX - 20, centerY + 4, 40, 12);

      // Table legs
      ctx.fillStyle = '#6e5d4a';
      ctx.fillRect(centerX - 18, centerY + 16, 3, 10);
      ctx.fillRect(centerX + 15, centerY + 16, 3, 10);

      // Kombucha bottles
      const bottleColors = ['#c74a9a', '#4ac79a', '#c7a74a'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = bottleColors[i];
        ctx.fillRect(centerX - 14 + i * 12, centerY - 4, 6, 12);
        // Bottle cap
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(centerX - 14 + i * 12, centerY - 6, 6, 2);
      }

      // Sign
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(centerX - 16, centerY - 12, 32, 6);
      ctx.fillStyle = '#c74a9a';
      ctx.font = '6px monospace';
      ctx.fillText('KOMBUCHA', centerX - 14, centerY - 8);

      // Vendor
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Activity: Vintage Bike Workshop (2x2)
    addSprite('vintage-bike-workshop', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Workbench
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(centerX - 20, centerY + 8, 40, 12);

      // Bike frame
      ctx.strokeStyle = '#c74a4a';
      ctx.lineWidth = 3;
      // Front wheel
      ctx.beginPath();
      ctx.arc(centerX - 10, centerY + 2, 8, 0, Math.PI * 2);
      ctx.stroke();
      // Back wheel
      ctx.beginPath();
      ctx.arc(centerX + 10, centerY + 2, 8, 0, Math.PI * 2);
      ctx.stroke();
      // Frame
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY + 2);
      ctx.lineTo(centerX, centerY - 8);
      ctx.lineTo(centerX + 10, centerY + 2);
      ctx.stroke();

      // Tools
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(centerX - 18, centerY + 10, 4, 8);
      ctx.fillRect(centerX - 12, centerY + 10, 4, 8);

      // Person working
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX + 8, centerY - 12, 4, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = '#4a4a9a';
      ctx.fillRect(centerX + 4, centerY - 8, 8, 10);
    });

    // Activity: Zine Library (2x1)
    addSprite('zine-library', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Shelving/rack
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(centerX - 22, centerY - 8, 44, 24);

      // Zines (colorful rectangles)
      const zineColors = ['#c74a9a', '#4ac79a', '#c7a74a', '#4a9ac7', '#9a4ac7'];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 5; col++) {
          ctx.fillStyle = zineColors[(row * 5 + col) % 5];
          ctx.fillRect(
            centerX - 20 + col * 8,
            centerY - 6 + row * 10,
            6,
            8
          );
        }
      }

      // Sign
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(centerX - 16, centerY - 16, 32, 6);
      ctx.fillStyle = '#2a2a2a';
      ctx.font = '5px monospace';
      ctx.fillText('FREE ZINES', centerX - 14, centerY - 12);
    });

    // Activity: Avant-Garde Boxing (2x2)
    addSprite('avant-garde-boxing', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Boxing ring corners
      ctx.fillStyle = '#c74a4a';
      ctx.fillRect(centerX - 22, centerY - 22, 6, 6);
      ctx.fillRect(centerX + 16, centerY - 22, 6, 6);
      ctx.fillRect(centerX - 22, centerY + 16, 6, 6);
      ctx.fillRect(centerX + 16, centerY + 16, 6, 6);

      // Ropes
      ctx.strokeStyle = '#f0f0f0';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const y = centerY - 18 + i * 12;
        ctx.beginPath();
        ctx.moveTo(centerX - 22, y);
        ctx.lineTo(centerX + 22, y);
        ctx.stroke();
      }

      // Two boxers
      // Boxer 1
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX - 8, centerY - 8, 5, 0, Math.PI * 2);
      ctx.fill();
      // Boxing gloves
      ctx.fillStyle = '#c74a4a';
      ctx.beginPath();
      ctx.arc(centerX - 14, centerY - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX - 2, centerY - 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Boxer 2
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX + 8, centerY + 2, 5, 0, Math.PI * 2);
      ctx.fill();
      // Boxing gloves
      ctx.fillStyle = '#4a4ac7';
      ctx.beginPath();
      ctx.arc(centerX + 2, centerY + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX + 14, centerY + 8, 4, 0, Math.PI * 2);
      ctx.fill();

      // "Avant-garde" aesthetic - geometric overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(centerX - 12, centerY - 12, 24, 24);
    });

    // Activity: Dogs Off-Leash (single dog)
    addSprite('dogs-off-leash', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Dog body
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(centerX - 6, centerY + 2, 12, 8);

      // Dog head
      ctx.beginPath();
      ctx.arc(centerX - 8, centerY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Ears
      ctx.fillRect(centerX - 12, centerY - 4, 3, 6);
      ctx.fillRect(centerX - 6, centerY - 4, 3, 6);

      // Tail
      ctx.beginPath();
      ctx.moveTo(centerX + 6, centerY + 4);
      ctx.quadraticCurveTo(centerX + 10, centerY - 2, centerX + 12, centerY + 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#8b7355';
      ctx.stroke();

      // Legs
      ctx.fillStyle = '#6e5d4a';
      ctx.fillRect(centerX - 4, centerY + 10, 2, 6);
      ctx.fillRect(centerX, centerY + 10, 2, 6);
      ctx.fillRect(centerX + 2, centerY + 10, 2, 6);
      ctx.fillRect(centerX + 6, centerY + 10, 2, 6);
    });

    // Dog owner (separate sprite for the linked owner)
    addSprite('dog-owner', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Head
      ctx.fillStyle = '#ffdbac';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 8, 6, 0, Math.PI * 2);
      ctx.fill();

      // Hipster beanie
      ctx.fillStyle = '#c74a9a';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 10, 7, Math.PI, 0);
      ctx.fill();

      // Body
      ctx.fillStyle = '#4a9ac7';
      ctx.fillRect(centerX - 6, centerY - 2, 12, 14);

      // Legs
      ctx.fillStyle = '#2a5a7a';
      ctx.fillRect(centerX - 5, centerY + 12, 4, 10);
      ctx.fillRect(centerX + 1, centerY + 12, 4, 10);

      // Arms (one holding leash position)
      ctx.fillStyle = '#4a9ac7';
      ctx.fillRect(centerX - 8, centerY, 2, 8);
      ctx.fillRect(centerX + 6, centerY, 2, 8);

      // Coffee cup in hand (very Brooklyn)
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(centerX + 8, centerY + 6, 4, 6);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(centerX + 8, centerY + 6, 4, 2);
    });

    // Tree sprites
    addSprite('oak-tree', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Trunk
      ctx.fillStyle = '#6e5d4a';
      ctx.fillRect(centerX - 4, centerY + 4, 8, 20);

      // Canopy (full, round)
      ctx.fillStyle = '#2e7d39';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 4, 18, 0, Math.PI * 2);
      ctx.fill();

      // Lighter foliage highlights
      ctx.fillStyle = '#3a9d4a';
      ctx.beginPath();
      ctx.arc(centerX - 6, centerY - 8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX + 6, centerY - 6, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    addSprite('maple-tree', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Trunk
      ctx.fillStyle = '#6e5d4a';
      ctx.fillRect(centerX - 4, centerY + 4, 8, 20);

      // Canopy (maple leaf shape approximation)
      ctx.fillStyle = '#c74a4a'; // Red/orange for fall maple
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 18);
      ctx.lineTo(centerX - 8, centerY - 10);
      ctx.lineTo(centerX - 14, centerY - 6);
      ctx.lineTo(centerX - 8, centerY - 2);
      ctx.lineTo(centerX - 10, centerY + 4);
      ctx.lineTo(centerX, centerY);
      ctx.lineTo(centerX + 10, centerY + 4);
      ctx.lineTo(centerX + 8, centerY - 2);
      ctx.lineTo(centerX + 14, centerY - 6);
      ctx.lineTo(centerX + 8, centerY - 10);
      ctx.closePath();
      ctx.fill();
    });

    addSprite('willow-tree', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Trunk
      ctx.fillStyle = '#6e5d4a';
      ctx.fillRect(centerX - 4, centerY + 4, 8, 20);

      // Drooping branches (willow characteristic)
      ctx.strokeStyle = '#3a9d4a';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const startX = centerX + Math.cos(angle) * 8;
        const startY = centerY - 8 + Math.sin(angle) * 8;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 8);
        ctx.quadraticCurveTo(
          startX,
          startY + 10,
          startX + Math.cos(angle) * 12,
          centerY + 20
        );
        ctx.stroke();
      }

      // Top foliage
      ctx.fillStyle = '#45b557';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 8, 12, 0, Math.PI * 2);
      ctx.fill();
    });

    addSprite('cherry-blossom', (ctx, size) => {
      const centerX = size / 2;
      const centerY = size / 2;

      // Trunk
      ctx.fillStyle = '#6e5d4a';
      ctx.fillRect(centerX - 4, centerY + 4, 8, 20);

      // Pink canopy
      ctx.fillStyle = '#ffb7d5';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 4, 16, 0, Math.PI * 2);
      ctx.fill();

      // Blossoms (small pink circles)
      ctx.fillStyle = '#ffa0c0';
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * 12;
        const y = centerY - 4 + Math.sin(angle) * 12;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // White centers
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * 10;
        const y = centerY - 4 + Math.sin(angle) * 10;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  generateZoneSprites(addSprite) {
    // Recreation zone indicator
    addSprite('zone-recreation', (ctx, size) => {
      ctx.fillStyle = 'rgba(64, 112, 240, 0.3)';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = '#4070f0';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, size - 4, size - 4);

      // Icon: Tennis racket
      ctx.strokeStyle = '#4070f0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2 - 4, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2 + 8);
      ctx.lineTo(size / 2, size / 2 + 20);
      ctx.stroke();
    });

    // Cultural zone indicator
    addSprite('zone-cultural', (ctx, size) => {
      ctx.fillStyle = 'rgba(240, 64, 112, 0.3)';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = '#f04070';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, size - 4, size - 4);

      // Icon: Theater masks
      ctx.fillStyle = '#f04070';
      ctx.beginPath();
      ctx.arc(size / 2 - 8, size / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(size / 2 + 8, size / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Sports zone indicator
    addSprite('zone-sports', (ctx, size) => {
      ctx.fillStyle = 'rgba(240, 176, 64, 0.3)';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = '#f0b040';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, size - 4, size - 4);

      // Icon: Soccer ball
      ctx.fillStyle = '#f0b040';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2 - 8);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(size / 2 + Math.cos(angle) * 8, size / 2 + Math.sin(angle) * 8);
      }
      ctx.closePath();
      ctx.fill();
    });

    // Nature zone indicator
    addSprite('zone-nature', (ctx, size) => {
      ctx.fillStyle = 'rgba(64, 240, 64, 0.3)';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = '#40f040';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, size - 4, size - 4);

      // Icon: Tree
      ctx.fillStyle = '#40f040';
      ctx.fillRect(size / 2 - 2, size / 2 + 6, 4, 12);
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 2 - 12);
      ctx.lineTo(size / 2 - 10, size / 2 + 8);
      ctx.lineTo(size / 2 + 10, size / 2 + 8);
      ctx.closePath();
      ctx.fill();
    });
  }

  getSprite(name) {
    return this.spriteMap[name] || null;
  }

  getAtlasImage() {
    return this.atlas;
  }
}
