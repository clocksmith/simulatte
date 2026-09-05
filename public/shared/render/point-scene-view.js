(function attachPointSceneView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePointSceneView = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPointSceneView() {
  const COLORS = ['#79b8ff', '#f6bd60', '#95d5b2', '#e99acb', '#b9a0ff', '#ff968a'];
  function bounds(frames) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    frames.forEach((frame) => frame.points.forEach((point) => {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    }));
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) throw new Error('point_scene_bounds_invalid');
    const span = Math.max(maxX - minX, maxY - minY, 1);
    return { minX: minX - span * .08, maxX: maxX + span * .08, minY: minY - span * .08, maxY: maxY + span * .08 };
  }
  function projection(box, width, height) {
    const padding = 42;
    const scale = Math.min(Math.max(1, width - 2 * padding) / (box.maxX - box.minX), Math.max(1, height - 2 * padding) / (box.maxY - box.minY));
    return (point) => ({ x: width / 2 + (point.x - (box.minX + box.maxX) / 2) * scale, y: height / 2 - (point.y - (box.minY + box.maxY) / 2) * scale });
  }
  function create(canvas, { onSelect = () => {} } = {}) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('point_scene_canvas2d_unavailable');
    let scene = null, box = null, disposed = false, projected = [];
    function draw() {
      if (disposed || !scene) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#10161f'; context.fillRect(0, 0, rect.width, rect.height);
      const project = projection(box, rect.width, rect.height);
      context.lineWidth = 1; context.strokeStyle = '#273544'; context.fillStyle = '#a5b3c2'; context.font = '11px system-ui';
      for (let tick = 0; tick <= 4; tick += 1) {
        const x = box.minX + (box.maxX - box.minX) * tick / 4;
        const y = box.minY + (box.maxY - box.minY) * tick / 4;
        const a = project({ x, y: box.minY }), b = project({ x, y: box.maxY });
        const c = project({ x: box.minX, y }), d = project({ x: box.maxX, y });
        context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.moveTo(c.x, c.y); context.lineTo(d.x, d.y); context.stroke();
        context.fillText(x.toPrecision(3), a.x - 10, a.y + 18);
        context.fillText(y.toPrecision(3), 4, c.y + 3);
      }
      projected = scene.points.map((point, index) => {
        const position = project(point);
        context.fillStyle = COLORS[index % COLORS.length];
        context.beginPath(); context.arc(position.x, position.y, 5, 0, Math.PI * 2); context.fill();
        if (scene.points.length <= 24) context.fillText(point.label.slice(0, 24), position.x + 9, position.y - 8);
        return { ...position, point };
      });
      canvas.dataset.rendererBackend = 'canvas2d';
      canvas.dataset.programHash = scene.programHash;
      canvas.dataset.pointCount = String(scene.points.length);
      canvas.dataset.step = String(scene.step);
    }
    function select(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const nearest = projected.map((row) => ({ row, distance: Math.hypot(row.x - x, row.y - y) })).sort((a, b) => a.distance - b.distance)[0];
      if (nearest?.distance <= 20) onSelect(nearest.row.point);
    }
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    canvas.addEventListener('click', select);
    function render(next, nextBounds) {
      if (disposed) throw new Error('point_scene_disposed');
      if (next?.schema !== 'simulatte.pointScene.v1' || !Array.isArray(next.points) || next.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('point_scene_invalid');
      scene = next; box = nextBounds; draw();
    }
    function dispose() { if (disposed) return; disposed = true; observer.disconnect(); canvas.removeEventListener('click', select); projected = []; scene = null; }
    return Object.freeze({ render, dispose });
  }
  return Object.freeze({ create, bounds, projection });
});
