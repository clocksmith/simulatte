(function attachAutonomyCanvasRenderer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyCanvasRenderer() {
  const COLORS = Object.freeze({
    background: '#f4f1e8',
    grid: 'rgba(39, 48, 43, 0.07)',
    shared: '#89908a',
    protected: '#177a65',
    connector: '#57635e',
    blocked: '#b74938',
    route: '#e0a52b',
    node: '#25312c',
    label: '#314039',
    pedestrian: '#b74938',
    bike: '#162a24',
    parcel: '#e0a52b',
    green: '#2e8b70',
    red: '#c54f3e',
  });

  function createCanvasRenderer(canvas, worldModel) {
    const context = canvas.getContext('2d');
    const bounds = worldModel.world.coordinateSystem.bounds;
    let tracePositions = [];

    function render(snapshot) {
      resizeCanvas(canvas, context);
      const transform = worldTransform(canvas, bounds);
      context.clearRect(0, 0, canvas.width, canvas.height);
      drawBackground(context, canvas, transform);
      drawSegments(context, worldModel, snapshot, transform);
      drawTrace(context, tracePositions, transform);
      drawNodes(context, worldModel, transform);
      drawSignals(context, worldModel, snapshot.state.tick, transform);
      drawActors(context, worldModel, snapshot.state.tick, transform);
      drawAgent(context, snapshot.state, transform);
      const position = snapshot.state.position;
      if (position && (!tracePositions.length || distance(position, tracePositions.at(-1)) > 0.2)) {
        tracePositions.push({ ...position });
      }
    }

    function reset() {
      tracePositions = [];
    }

    return { render, reset };
  }

  function resizeCanvas(canvas, context) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(320, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(260, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  function worldTransform(canvas, bounds) {
    const pad = 52 * Math.min(2, globalThis.devicePixelRatio || 1);
    const width = bounds.maximumX - bounds.minimumX;
    const height = bounds.maximumY - bounds.minimumY;
    const scale = Math.min((canvas.width - pad * 2) / width, (canvas.height - pad * 2) / height);
    const offsetX = (canvas.width - width * scale) / 2 - bounds.minimumX * scale;
    const offsetY = (canvas.height - height * scale) / 2 - bounds.minimumY * scale;
    return { scale, offsetX, offsetY, point: (row) => ({ x: offsetX + row.x * scale, y: offsetY + row.y * scale }) };
  }

  function drawBackground(context, canvas, transform) {
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    const spacing = 20 * transform.scale;
    for (let x = transform.offsetX % spacing; x < canvas.width; x += spacing) line(context, { x, y: 0 }, { x, y: canvas.height });
    for (let y = transform.offsetY % spacing; y < canvas.height; y += spacing) line(context, { x: 0, y }, { x: canvas.width, y });
  }

  function drawSegments(context, worldModel, snapshot, transform) {
    const routeIds = new Set(snapshot.route && snapshot.route.segmentIds || []);
    const blocked = new Set(worldModel.blockedSegmentIds(snapshot.state.tick));
    worldModel.world.segments.forEach((segment) => {
      const points = segment.geometry.map(transform.point);
      strokePath(context, points, '#ffffff', 11 * transform.scale / 4);
      const color = blocked.has(segment.id) ? COLORS.blocked : COLORS[segment.laneType] || COLORS.shared;
      context.setLineDash(blocked.has(segment.id) ? [8, 7] : segment.laneType === 'protected' ? [3, 3] : []);
      strokePath(context, points, color, 4 * transform.scale / 4);
      context.setLineDash([]);
      if (routeIds.has(segment.id)) strokePath(context, points, COLORS.route, 2.2 * transform.scale / 4);
    });
  }

  function drawTrace(context, positions, transform) {
    if (positions.length < 2) return;
    strokePath(context, positions.map(transform.point), 'rgba(22, 42, 36, 0.45)', 2.2);
  }

  function drawNodes(context, worldModel, transform) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    worldModel.world.nodes.forEach((node) => {
      const point = transform.point(node.position);
      context.fillStyle = node.kind === 'delivery' ? COLORS.parcel : COLORS.node;
      context.beginPath();
      context.arc(point.x, point.y, node.kind === 'delivery' ? 6 * ratio : 3.5 * ratio, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = COLORS.label;
      context.font = `${11 * ratio}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillText(node.label, point.x, point.y + 17 * ratio);
    });
  }

  function drawSignals(context, worldModel, tick, transform) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    worldModel.signalRows(tick).forEach((signal) => {
      const point = transform.point(worldModel.node(signal.nodeId).position);
      context.fillStyle = signal.state === 'green' ? COLORS.green : COLORS.red;
      context.beginPath();
      context.arc(point.x + 11 * ratio, point.y - 11 * ratio, 4.5 * ratio, 0, Math.PI * 2);
      context.fill();
    });
  }

  function drawActors(context, worldModel, tick, transform) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    worldModel.activeActors(tick).forEach((actor) => {
      const point = transform.point(actor.position);
      context.strokeStyle = COLORS.pedestrian;
      context.fillStyle = '#fff8f1';
      context.lineWidth = 2 * ratio;
      context.beginPath();
      context.arc(point.x, point.y, 6 * ratio, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(point.x, point.y + 6 * ratio);
      context.lineTo(point.x, point.y + 16 * ratio);
      context.stroke();
    });
  }

  function drawAgent(context, state, transform) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const point = transform.point(state.position);
    context.save();
    context.translate(point.x, point.y);
    context.strokeStyle = COLORS.bike;
    context.fillStyle = COLORS.parcel;
    context.lineWidth = 2.2 * ratio;
    context.beginPath();
    context.arc(-7 * ratio, 5 * ratio, 5 * ratio, 0, Math.PI * 2);
    context.arc(7 * ratio, 5 * ratio, 5 * ratio, 0, Math.PI * 2);
    context.moveTo(-7 * ratio, 5 * ratio);
    context.lineTo(0, -3 * ratio);
    context.lineTo(7 * ratio, 5 * ratio);
    context.lineTo(-1 * ratio, 5 * ratio);
    context.lineTo(-7 * ratio, 5 * ratio);
    context.stroke();
    context.fillRect(-3.5 * ratio, -11 * ratio, 7 * ratio, 6 * ratio);
    context.restore();
  }

  function strokePath(context, points, color, width) {
    if (points.length < 2) return;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }

  function line(context, start, end) {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  return { createCanvasRenderer, worldTransform };
});
