(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./tier-plugin-presentation.js') : root.SimulatteTierPluginPresentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCameraFit = api;
})(globalThis, function(presentation) {
  // Compare leaves room for alternatives; Follow leaves room for actor motion.
  const MODE_FILL = Object.freeze({ overview: 1, compare: 0.85, follow: 0.7, pov: 0.7 });

  function usableViewport({ width, height, insets = {}, padding = 32 }) {
    if (![width, height].every(value => Number.isFinite(value) && value > 0)) return null;
    const inset = (edge, limit) => Math.min(limit, Math.max(0, Number(insets[edge]) || 0));
    const left = inset('left', width), right = width - inset('right', width);
    const top = inset('top', height), bottom = height - inset('bottom', height);
    if (right <= left || bottom <= top) return null;
    // Small canvases still retain drawable space; never manufacture an offscreen fit.
    const pad = Math.min(Math.max(0, padding), (right - left) / 4, (bottom - top) / 4);
    return { left: left + pad, right: right - pad, top: top + pad, bottom: bottom - pad };
  }

  function frameProjection(matrix, options) {
    const viewport = usableViewport({ ...options, padding: 0 });
    if (!viewport) return matrix;
    const { width, height } = options, { left, right, top, bottom } = viewport;
    const sx = (right - left) / width, sy = (bottom - top) / height;
    const tx = (left + right) / width - 1, ty = 1 - (top + bottom) / height;
    const framed = Float32Array.from(matrix);
    for (let column = 0; column < 16; column += 4) {
      framed[column] = sx * matrix[column] + tx * matrix[column + 3];
      framed[column + 1] = sy * matrix[column + 1] + ty * matrix[column + 3];
    }
    return framed;
  }

  function fitPoints(points, options, maxZoom = 250) {
    const viewport = usableViewport(options);
    if (!viewport || !points.length || !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    const { left, right, top, bottom } = viewport;
    const fill = MODE_FILL[options.viewMode] || 1;
    const zoom = Math.min(maxZoom, (right - left) / Math.max(.001, maxX - minX),
      (bottom - top) / Math.max(.001, maxY - minY)) * fill;
    return Object.freeze({ zoom, panX: (left + right) / 2 - (minX + maxX) / 2 * zoom,
      panY: (top + bottom) / 2 - (minY + maxY) / 2 * zoom });
  }

  function fit(options) {
    const { coordinates, coordinateSystem, rotX = 0, rotY = 0, viewMode = 'overview' } = options;
    if (!coordinates?.length) return null;
    const projectionMode = coordinateSystem === 'icrs-cartesian-pc' && viewMode === 'compare' ? 'torus' : 'sphere';
    const points = coordinates.map(p => presentation.projectPoint(p, coordinateSystem,
      { panX: 0, panY: 0, zoom: 1, rotX, rotY, projectionMode }));
    const result = fitPoints(points, options, coordinateSystem === 'icrs-cartesian-pc' ? 4000 : 250);
    return result && Object.freeze({ ...result, projectionMode });
  }

  function measureInsets(canvas, overlays) {
    const insets = { left: 0, right: 0, top: 0, bottom: 0 };
    for (const { edge, rect } of overlays) {
      if (rect.right <= canvas.left || rect.left >= canvas.right || rect.bottom <= canvas.top || rect.top >= canvas.bottom) continue;
      const depth = { left: rect.right - canvas.left, right: canvas.right - rect.left,
        top: rect.bottom - canvas.top, bottom: canvas.bottom - rect.top }[edge];
      if (depth !== undefined) insets[edge] = Math.max(insets[edge], Math.min(depth,
        ['left', 'right'].includes(edge) ? canvas.width : canvas.height));
    }
    return insets;
  }

  return Object.freeze({ fit, fitPoints, usableViewport, measureInsets, frameProjection });
});
