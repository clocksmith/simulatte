import { createTextureFromCanvas } from '../core/texture.js';
import { loadSpriteSheet } from './sprite-sheet-loader.js';

const TILE_TYPES = ['land', 'road', 'industrial', 'park', 'water', 'mountain', 'plaza', 'art'];
const TERRAIN_SHEET_URL = '/assets/sprites/simulatte_terrain_tiles.png';

const TILE_CELL = {
  land: [0, 0],
  road: [1, 0],
  industrial: [2, 0],
  park: [3, 0],
  water: [0, 1],
  mountain: [1, 1],
  plaza: [2, 1],
  art: [3, 1]
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function parseColor(value, fallback = '#ffffff') {
  const source = (value || fallback || '#ffffff').trim();

  if (source.startsWith('#')) {
    const hex = source.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b, 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
  }

  const rgba = source.match(/rgba?\(([^)]+)\)/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => part.trim());
    const r = clamp01(Number(parts[0]) / 255);
    const g = clamp01(Number(parts[1]) / 255);
    const b = clamp01(Number(parts[2]) / 255);
    const a = parts.length > 3 ? clamp01(Number(parts[3])) : 1;
    return [r, g, b, a];
  }

  return parseColor(fallback, '#ffffff');
}

function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], alpha];
}

function lighten(color, amount) {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3]
  ];
}

function darken(color, amount) {
  return [
    color[0] * (1 - amount),
    color[1] * (1 - amount),
    color[2] * (1 - amount),
    color[3]
  ];
}

function colorCss(color, alpha = color[3]) {
  const r = Math.round(clamp01(color[0]) * 255);
  const g = Math.round(clamp01(color[1]) * 255);
  const b = Math.round(clamp01(color[2]) * 255);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
}

function ditherFill(ctx, x0, y0, width, height, hi, lo, seed = 0, step = 2) {
  for (let y = y0; y < y0 + height; y += step) {
    for (let x = x0; x < x0 + width; x += step) {
      const noise = (x * 31 + y * 17 + seed * 13) % 19;
      ctx.fillStyle = noise < 10 ? hi : lo;
      ctx.fillRect(x, y, step, step);
    }
  }
}

function drawMaterialCell(ctx, palette, type, x0, y0, cell, seed) {
  const base = palette.tile[type] || palette.tile.land;
  const hi = colorCss(lighten(base, 0.24));
  const lo = colorCss(darken(base, 0.28));
  const mid = colorCss(withAlpha(base, 1));

  ditherFill(ctx, x0, y0, cell, cell, hi, lo, seed, 2);

  ctx.fillStyle = colorCss(withAlpha(lighten(base, 0.08), 0.35));
  for (let i = 0; i < 12; i += 1) {
    const xx = x0 + ((i * 11 + seed * 3) % (cell - 5)) + 2;
    const yy = y0 + ((i * 19 + seed * 5) % (cell - 5)) + 2;
    ctx.fillRect(xx, yy, 2, 2);
  }

  if (type === 'land') {
    ctx.fillStyle = 'rgba(156, 216, 168, 0.22)';
    for (let i = 0; i < 64; i += 1) {
      const xx = x0 + ((i * 7 + seed * 13) % (cell - 3)) + 1;
      const yy = y0 + ((i * 13 + seed * 17) % (cell - 3)) + 1;
      if ((xx + yy + i) % 3 === 0) {
        ctx.fillRect(xx, yy, 1, 1);
      }
    }
  } else if (type === 'road') {
    ctx.strokeStyle = 'rgba(206, 219, 239, 0.36)';
    ctx.lineWidth = 1;
    for (let y = y0 + 7; y < y0 + cell; y += 11) {
      ctx.beginPath();
      ctx.moveTo(x0 + 3, y);
      ctx.lineTo(x0 + cell - 3, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(18, 24, 36, 0.3)';
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y0 + Math.floor(cell * 0.5));
    ctx.lineTo(x0 + cell - 4, y0 + Math.floor(cell * 0.5));
    ctx.stroke();
  } else if (type === 'industrial') {
    ctx.strokeStyle = 'rgba(218, 200, 240, 0.28)';
    ctx.lineWidth = 1;
    for (let x = x0 + 4; x < x0 + cell; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, y0 + 2);
      ctx.lineTo(x, y0 + cell - 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(234, 226, 248, 0.24)';
    for (let i = 0; i < 12; i += 1) {
      const xx = x0 + 5 + ((i * 9) % (cell - 12));
      const yy = y0 + 5 + ((i * 11) % (cell - 12));
      ctx.fillRect(xx, yy, 2, 2);
    }
  } else if (type === 'park') {
    ctx.fillStyle = 'rgba(161, 242, 202, 0.22)';
    for (let i = 0; i < 84; i += 1) {
      const xx = x0 + ((i * 13 + seed * 7) % (cell - 4)) + 1;
      const yy = y0 + ((i * 5 + seed * 19) % (cell - 4)) + 1;
      if ((i + xx + yy) % 2 === 0) {
        ctx.fillRect(xx, yy, 2, 2);
      }
    }
  } else if (type === 'water') {
    ctx.strokeStyle = 'rgba(172, 224, 255, 0.36)';
    ctx.lineWidth = 1.25;
    for (let y = y0 + 7; y < y0 + cell; y += 9) {
      ctx.beginPath();
      for (let x = 0; x <= cell; x += 5) {
        const yy = y + Math.sin((x + y + seed) * 0.16) * 1.6;
        if (x === 0) {
          ctx.moveTo(x0 + x, yy);
        } else {
          ctx.lineTo(x0 + x, yy);
        }
      }
      ctx.stroke();
    }
  } else if (type === 'mountain') {
    ctx.strokeStyle = 'rgba(225, 234, 255, 0.3)';
    ctx.lineWidth = 1.2;
    for (let x = x0 + 6; x < x0 + cell - 2; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x - 5, y0 + cell - 4);
      ctx.lineTo(x, y0 + 8 + ((x + seed) % 4));
      ctx.lineTo(x + 5, y0 + cell - 4);
      ctx.stroke();
    }
  } else if (type === 'plaza') {
    ctx.strokeStyle = 'rgba(212, 226, 255, 0.28)';
    ctx.lineWidth = 1;
    for (let x = x0 + 1; x < x0 + cell; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, y0 + 1);
      ctx.lineTo(x, y0 + cell - 1);
      ctx.stroke();
    }
    for (let y = y0 + 1; y < y0 + cell; y += 8) {
      ctx.beginPath();
      ctx.moveTo(x0 + 1, y);
      ctx.lineTo(x0 + cell - 1, y);
      ctx.stroke();
    }
  } else if (type === 'art') {
    ctx.fillStyle = 'rgba(235, 194, 255, 0.22)';
    for (let y = 0; y < cell; y += 6) {
      for (let x = 0; x < cell; x += 6) {
        if (((x + y) / 6 + seed) % 2 === 0) {
          ctx.fillRect(x0 + x + 1, y0 + y + 1, 4, 4);
        }
      }
    }
  }

  ctx.strokeStyle = colorCss(withAlpha(lighten(base, 0.3), 0.32));
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, cell - 1, cell - 1);
  ctx.strokeStyle = colorCss(withAlpha(darken(base, 0.44), 0.32));
  ctx.strokeRect(x0 + 1.5, y0 + 1.5, cell - 3, cell - 3);
  ctx.fillStyle = colorCss(withAlpha(parseColor('#000000'), 0.1));
  ctx.fillRect(x0, y0 + cell - 4, cell, 4);
  ctx.fillStyle = colorCss(withAlpha(parseColor('#ffffff'), 0.08));
  ctx.fillRect(x0, y0, cell, 3);

  if (type === 'road') {
    ctx.strokeStyle = mid;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0 + 6, y0 + Math.floor(cell * 0.5));
    ctx.lineTo(x0 + cell - 6, y0 + Math.floor(cell * 0.5));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function createMaterialAtlas(gl, palette) {
  const size = 256;
  const cols = 4;
  const cell = size / cols;

  const atlas = document.createElement('canvas');
  atlas.width = size;
  atlas.height = size;
  const ctx = atlas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let seed = 1;
  for (const type of TILE_TYPES) {
    const [cx, cy] = TILE_CELL[type];
    const x0 = cx * cell;
    const y0 = cy * cell;
    drawMaterialCell(ctx, palette, type, x0, y0, cell, seed);
    seed += 11;
  }

  const inset = 1.25;
  const uvs = {};
  for (const type of TILE_TYPES) {
    const [cx, cy] = TILE_CELL[type];
    const x0 = (cx * cell + inset) / size;
    const y0 = (cy * cell + inset) / size;
    const x1 = ((cx + 1) * cell - inset) / size;
    const y1 = ((cy + 1) * cell - inset) / size;
    uvs[type] = { u0: x0, v0: y0, u1: x1, v1: y1 };
  }

  const texture = createTextureFromCanvas(gl, atlas, { filter: 'nearest' });
  const atlasRef = {
    ...texture,
    uvs
  };

  // Prefer the authored terrain sprite sheet when available; keep procedural atlas as fallback.
  loadSpriteSheet(gl, TERRAIN_SHEET_URL, {
    frameWidth: 64,
    frameHeight: 32,
    columns: 8,
    rows: 1,
    frameCount: 8,
    insetPx: 0.5,
    filter: 'nearest'
  }).then((sheet) => {
    if (!sheet) {
      return;
    }

    const nextUvs = {};
    for (let i = 0; i < TILE_TYPES.length; i += 1) {
      const frame = sheet.select(i);
      if (!frame) {
        return;
      }
      nextUvs[TILE_TYPES[i]] = frame.uv;
    }

    const previousTexture = atlasRef.texture;
    atlasRef.texture = sheet.texture;
    atlasRef.width = sheet.width;
    atlasRef.height = sheet.height;
    atlasRef.uvs = nextUvs;

    if (previousTexture && previousTexture !== sheet.texture) {
      gl.deleteTexture(previousTexture);
    }
  });

  return atlasRef;
}
