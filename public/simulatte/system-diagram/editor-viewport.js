(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramViewport = api;
})(globalThis, function () {
  'use strict';
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const PADDING = 48, KEEP_VISIBLE = 64;
  function area(rect, insets = {}) {
    const left = insets.left || 0, top = insets.top || 0;
    return { left, top, width: Math.max(1, rect.width - left - (insets.right || 0)), height: Math.max(1, rect.height - top - (insets.bottom || 0)) };
  }
  function board(content, grid) {
    const snap = value => Math.round(value / grid) * grid;
    if (!content) return {x: 0, y: 0, w: 1600, h: 1000};
    const x = snap(Math.min(0, content.x - 280)), y = snap(Math.min(0, content.y - 200));
    return {x, y, w: snap(Math.max(1600, content.x + content.w + 280)) - x, h: snap(Math.max(1000, content.y + content.h + 200)) - y};
  }
  function minimumZoom(content, rect, editor, insets) {
    if (!content) return editor.minZoom;
    const a = area(rect, insets);
    return Math.max(editor.fitMinZoom || editor.minZoom, Math.min(editor.minZoom, Math.max(1, a.width - 2 * PADDING) / Math.max(1, content.w), Math.max(1, a.height - 2 * PADDING) / Math.max(1, content.h)));
  }
  function constrain(view, rect, content, bounds, editor, insets) {
    const zoom = clamp(view.zoom, minimumZoom(content, rect, editor, insets), editor.maxZoom), a = area(rect, insets);
    const box = content || bounds;
    const axis = (value, origin, size, pixels, inset) => {
      const span = pixels / zoom, visible = Math.min(KEEP_VISIBLE / zoom, size, span);
      return clamp(value + inset / zoom, origin - span + visible, origin + size - visible) - inset / zoom;
    };
    const bounded = { x: axis(view.x || 0, box.x, box.w, a.width, a.left), y: axis(view.y || 0, box.y, box.h, a.height, a.top), zoom };
    // A graph's bounding box can contain large empty gaps. Keep an actual visible
    // component, group or note in reach rather than stopping inside that gap.
    if (!content?.anchors?.length) return bounded;
    return content.anchors.map(anchor => ({
      x: axis(bounded.x, anchor.x, anchor.w, a.width, a.left),
      y: axis(bounded.y, anchor.y, anchor.h, a.height, a.top), zoom
    })).reduce((best, candidate) => Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) < Math.hypot(best.x - bounded.x, best.y - bounded.y) ? candidate : best);
  }
  function fit(content, rect, editor, insets) {
    const a = area(rect, insets), box = content || {x: -160, y: -100, w: 320, h: 200};
    const zoom = clamp(Math.min(Math.max(1, a.width - 2 * PADDING) / Math.max(1, box.w), Math.max(1, a.height - 2 * PADDING) / Math.max(1, box.h), 1.25), minimumZoom(content, rect, editor, insets), editor.maxZoom);
    return {zoom, x: box.x + box.w / 2 - (a.left + a.width / 2) / zoom, y: box.y + box.h / 2 - (a.top + a.height / 2) / zoom};
  }
  return Object.freeze({area, board, minimumZoom, constrain, fit});
});
