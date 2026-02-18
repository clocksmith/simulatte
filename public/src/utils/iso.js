import { clamp } from './math.js';

export function tileToScreen(x, y, z, metrics, origin) {
  const sx = origin.x + (x - y) * metrics.tileW * 0.5;
  const sy = origin.y + (x + y) * metrics.tileH * 0.5 - z;
  return { x: sx, y: sy };
}

export function screenToTile(screenX, screenY, metrics, origin, map) {
  const dx = (screenX - origin.x) / (metrics.tileW * 0.5);
  const dy = (screenY - origin.y) / (metrics.tileH * 0.5);

  const tx = Math.floor((dy + dx) * 0.5);
  const ty = Math.floor((dy - dx) * 0.5);

  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) {
    return null;
  }

  return {
    x: clamp(tx, 0, map.width - 1),
    y: clamp(ty, 0, map.height - 1)
  };
}
