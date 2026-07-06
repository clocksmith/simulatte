function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

const GL_SHEET_CACHE = new WeakMap();

function getCacheForGl(gl) {
  let cache = GL_SHEET_CACHE.get(gl);
  if (!cache) {
    cache = new Map();
    GL_SHEET_CACHE.set(gl, cache);
  }
  return cache;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = (event) => reject(new Error(`Failed to load sprite sheet: ${url}`));
    image.src = url;
  });
}

function createTextureFromImage(gl, image, filter = 'nearest') {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const hadPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  const textureFilter = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, hadPremultiply ? 1 : 0);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    texture,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  };
}

function normalizeFrameIndex(index, count) {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  const i = Math.floor(Number.isFinite(index) ? index : 0);
  return ((i % count) + count) % count;
}

function buildFrames(textureRef, frameWidth, frameHeight, columns, rows, frameCount, insetPx = 0) {
  const frames = [];
  const maxCount = Math.min(frameCount, columns * rows);
  const xInset = clamp01(insetPx / Math.max(1, textureRef.width));
  const yInset = clamp01(insetPx / Math.max(1, textureRef.height));

  for (let index = 0; index < maxCount; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);

    const u0 = clamp01((col * frameWidth) / textureRef.width + xInset);
    const v0 = clamp01((row * frameHeight) / textureRef.height + yInset);
    const u1 = clamp01(((col + 1) * frameWidth) / textureRef.width - xInset);
    const v1 = clamp01(((row + 1) * frameHeight) / textureRef.height - yInset);

    frames.push({
      index,
      texture: textureRef.texture,
      width: frameWidth,
      height: frameHeight,
      uv: { u0, v0, u1, v1 }
    });
  }

  return frames;
}

export async function loadSpriteSheet(gl, url, options = {}) {
  const frameWidth = options.frameWidth;
  const frameHeight = options.frameHeight;

  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) {
    throw new Error(`Invalid frame size for sprite sheet: ${url}`);
  }

  const key = [
    url,
    frameWidth,
    frameHeight,
    options.columns || 0,
    options.rows || 0,
    options.frameCount || 0,
    options.filter || 'nearest',
    options.insetPx || 0
  ].join('|');

  const cache = getCacheForGl(gl);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const promise = loadImage(url)
    .then((image) => {
      const textureRef = createTextureFromImage(gl, image, options.filter || 'nearest');
      const columns = Math.max(1, options.columns || Math.floor(textureRef.width / frameWidth));
      const rows = Math.max(1, options.rows || Math.floor(textureRef.height / frameHeight));
      const frameCount = Math.max(1, options.frameCount || columns * rows);
      const frames = buildFrames(
        textureRef,
        frameWidth,
        frameHeight,
        columns,
        rows,
        frameCount,
        options.insetPx || 0
      );

      return {
        url,
        texture: textureRef.texture,
        width: textureRef.width,
        height: textureRef.height,
        frameWidth,
        frameHeight,
        columns,
        rows,
        frameCount: frames.length,
        frames,
        select(index = 0) {
          if (frames.length === 0) {
            return null;
          }
          return frames[normalizeFrameIndex(index, frames.length)];
        }
      };
    })
    .catch((error) => {
      console.warn(`[sprite-sheet-loader] ${error.message}`);
      return null;
    });

  cache.set(key, promise);
  return promise;
}

export function createSpriteSheetSelector() {
  const sheets = new Map();

  return {
    register(id, sheet) {
      if (id && sheet) {
        sheets.set(id, sheet);
      }
    },
    has(id) {
      return sheets.has(id);
    },
    getSheet(id) {
      return sheets.get(id) || null;
    },
    select(id, frameIndex = 0) {
      const sheet = sheets.get(id);
      if (!sheet) {
        return null;
      }
      return sheet.select(frameIndex);
    }
  };
}

export function loopFrame(start, count, elapsedSec, fps = 8) {
  const safeCount = Math.max(1, Math.floor(count || 1));
  const safeStart = Math.max(0, Math.floor(start || 0));
  const frame = Math.floor(Math.max(0, elapsedSec || 0) * Math.max(0.01, fps || 8)) % safeCount;
  return safeStart + frame;
}
