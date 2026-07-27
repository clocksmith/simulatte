(function attachSemanticLabelOverlay(root, factory) {
  const math = typeof module === 'object' && module.exports
    ? require('./webgpu-math.js')
    : root.SimulatteAutonomyGpuMath;
  const api = factory(math);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSemanticLabelOverlay = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSemanticLabelOverlay(math) {
  function layout(labels, viewProjection, viewport, measure = defaultMeasure) {
    const placed = [];
    const suppressedIds = [];
    for (const label of labels || []) {
      const anchor = project(label.point, viewProjection, viewport);
      if (!anchor) {
        suppressedIds.push(label.id);
        continue;
      }
      const width = Math.max(24, measure(label.text));
      const box = labelBox(anchor, width, viewport);
      if (placed.some((row) => overlaps(row.box, box))) {
        suppressedIds.push(label.id);
        continue;
      }
      placed.push(Object.freeze({ ...label, anchor: Object.freeze(anchor), box: Object.freeze(box) }));
    }
    return Object.freeze({
      schema: 'simulatte.semanticLabelLayout.v1',
      labels: Object.freeze(placed),
      suppressedIds: Object.freeze(suppressedIds),
    });
  }

  function draw(canvas, labels, viewProjection, viewport) {
    if (!canvas) return emptyReceipt(labels);
    const width = Math.max(1, Number(viewport?.width || canvas.width || 1));
    const height = Math.max(1, Number(viewport?.height || canvas.height || 1));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return emptyReceipt(labels);
    const scale = Math.max(1, width / Math.max(1, Number(canvas.clientWidth || width)));
    context.clearRect(0, 0, width, height);
    context.font = `600 ${Math.round(10 * scale)}px system-ui, sans-serif`;
    const result = layout(
      labels,
      viewProjection,
      { width, height, scale },
      (text) => context.measureText(String(text)).width + 6 * scale,
    );
    result.labels.forEach((label) => {
      context.fillStyle = 'rgba(3, 10, 9, 0.84)';
      context.fillRect(label.box.x, label.box.y, label.box.width, label.box.height);
      context.fillStyle = 'rgba(237, 245, 243, 0.92)';
      context.fillText(
        String(label.text),
        label.box.x + 3 * scale,
        label.box.y + 12 * scale,
      );
    });
    canvas.dataset.semanticLabelCount = String(result.labels.length);
    canvas.dataset.semanticLabelSuppressedCount = String(result.suppressedIds.length);
    return Object.freeze({
      schema: 'simulatte.semanticLabelRenderReceipt.v1',
      inputCount: (labels || []).length,
      visibleIds: Object.freeze(result.labels.map((row) => row.id)),
      suppressedIds: result.suppressedIds,
    });
  }

  function project(point, viewProjection, viewport) {
    if (!point || !viewProjection) return null;
    const clip = math.transformPoint(viewProjection, [
      Number(point.x || 0),
      Number(point.heightM ?? 1.8),
      -Number(point.y || 0),
    ]);
    if (!clip.every(Number.isFinite) || clip[2] < 0 || clip[2] > 1) return null;
    const x = (clip[0] * 0.5 + 0.5) * viewport.width;
    const y = (1 - (clip[1] * 0.5 + 0.5)) * viewport.height;
    if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return null;
    return [x, y];
  }

  function labelBox(anchor, width, viewport) {
    const scale = Number(viewport.scale || 1);
    const height = 16 * scale;
    const gap = 7 * scale;
    const preferredX = anchor[0] + gap;
    const x = preferredX + width <= viewport.width
      ? preferredX
      : Math.max(0, anchor[0] - gap - width);
    return {
      x,
      y: Math.max(0, Math.min(viewport.height - height, anchor[1] - height / 2)),
      width,
      height,
    };
  }

  function overlaps(left, right) {
    return !(
      left.x + left.width + 2 <= right.x
      || right.x + right.width + 2 <= left.x
      || left.y + left.height + 2 <= right.y
      || right.y + right.height + 2 <= left.y
    );
  }

  function defaultMeasure(text) {
    return String(text).length * 7;
  }

  function emptyReceipt(labels) {
    return Object.freeze({
      schema: 'simulatte.semanticLabelRenderReceipt.v1',
      inputCount: (labels || []).length,
      visibleIds: Object.freeze([]),
      suppressedIds: Object.freeze((labels || []).map((row) => row.id)),
    });
  }

  return Object.freeze({ draw, layout, project });
});
