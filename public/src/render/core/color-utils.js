function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function parseHexColor(source) {
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
  return null;
}

export function parseColor(value, fallback = '#ffffff') {
  const source = (value || fallback || '#ffffff').trim();

  if (source.startsWith('#')) {
    const color = parseHexColor(source);
    if (color) {
      return color;
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

export function colorFromCss(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return parseColor(raw || fallback, fallback);
}

export function withAlpha(color, alpha) {
  return [color[0], color[1], color[2], alpha];
}

export function lighten(color, amount) {
  return [
    color[0] + (1 - color[0]) * amount,
    color[1] + (1 - color[1]) * amount,
    color[2] + (1 - color[2]) * amount,
    color[3]
  ];
}

export function darken(color, amount) {
  return [
    color[0] * (1 - amount),
    color[1] * (1 - amount),
    color[2] * (1 - amount),
    color[3]
  ];
}

export function colorCss(color, alpha = color[3]) {
  const r = Math.round(clamp01(color[0]) * 255);
  const g = Math.round(clamp01(color[1]) * 255);
  const b = Math.round(clamp01(color[2]) * 255);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
}

export { clamp01 };
