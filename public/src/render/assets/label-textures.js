import { createTextureFromCanvas } from '../core/texture.js';

export function createRegionLabelTextures(gl, worldConfig) {
  const map = new Map();

  for (const region of worldConfig.regions) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '600 14px JetBrains Mono, IBM Plex Mono, Consolas, monospace';
    const textWidth = Math.ceil(ctx.measureText(region.name).width);
    const width = Math.max(72, textWidth + 12);
    const height = 24;
    canvas.width = width;
    canvas.height = height;

    const draw = canvas.getContext('2d');
    draw.imageSmoothingEnabled = false;
    draw.font = '600 14px JetBrains Mono, IBM Plex Mono, Consolas, monospace';
    draw.fillStyle = 'rgba(0, 0, 0, 0.68)';
    draw.textAlign = 'center';
    draw.textBaseline = 'middle';
    draw.fillText(region.name, width * 0.5 + 1, height * 0.52 + 1);
    draw.fillStyle = '#e8f2ff';
    draw.fillText(region.name, width * 0.5, height * 0.52);

    map.set(region.id, createTextureFromCanvas(gl, canvas, { filter: 'linear' }));
  }

  return map;
}

export function createLandmarkLabelTextures(gl, worldConfig) {
  const map = new Map();

  for (const mark of worldConfig.landmarks) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '700 13px JetBrains Mono, IBM Plex Mono, Consolas, monospace';
    const textWidth = Math.ceil(ctx.measureText(mark.title).width);
    const width = Math.max(104, textWidth + 16);
    const height = 28;
    canvas.width = width;
    canvas.height = height;

    const draw = canvas.getContext('2d');
    draw.imageSmoothingEnabled = false;
    draw.font = '700 13px JetBrains Mono, IBM Plex Mono, Consolas, monospace';
    draw.fillStyle = 'rgba(8, 8, 12, 0.72)';
    draw.textAlign = 'center';
    draw.textBaseline = 'middle';
    draw.fillText(mark.title, width * 0.5 + 1, height * 0.56 + 1);
    draw.fillStyle = '#f4ebff';
    draw.fillText(mark.title, width * 0.5, height * 0.56);

    map.set(mark.id, createTextureFromCanvas(gl, canvas, { filter: 'linear' }));
  }

  return map;
}
