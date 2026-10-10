(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SimulatteFieldExperimentDrawing = api;
})(globalThis, function () {
  function draw(canvas, config, state, selection = null, yaw = 0.65) {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1),
      width = Math.max(1, canvas.clientWidth),
      height = width;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("field_canvas_unavailable");
    ctx.scale(ratio, ratio);
    const style = getComputedStyle(canvas),
      ink = style.getPropertyValue("--sim-ink").trim(),
      paper = style.getPropertyValue("--sim-glass").trim(),
      accent = style.getPropertyValue("--sim-accent").trim();
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    const extent = config.params.size * config.params.spacing,
      margin = width * 0.06,
      scale = (width - 2 * margin) / extent,
      hits = [];
    if (config.view === "cells") {
      if (state.boundary !== null) {
        ctx.strokeStyle = ink;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(margin + state.boundary * scale, margin);
        ctx.lineTo(margin + state.boundary * scale, height - margin);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const cell of state.cells) {
        const x = margin + cell.x * scale,
          y = margin + cell.y * scale,
          r = Math.sqrt(cell.area / Math.PI) * scale;
        ctx.fillStyle = cell.producer
          ? "hsl(34 78% 55%)"
          : `hsl(${160 + Math.min(1, cell.signal) * 55} 55% ${35 + Math.min(1, cell.signal) * 25}%)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle =
          cell.id === selection?.id || selection?.lineageId === cell.lineageId
            ? accent
            : paper;
        ctx.lineWidth = cell.id === selection?.id ? 3 : 1;
        ctx.stroke();
        hits.push({
          id: cell.id,
          x,
          y,
          worldX: cell.x,
          worldY: cell.y,
          lineageId: cell.lineageId,
          radius: r,
        });
      }
    } else if (config.view === "terrain") {
      const n = config.params.size,
        unit = (width * 0.58) / extent,
        c = Math.cos(yaw),
        s = Math.sin(yaw);
      const project = (x, y, z) => {
        const dx = x - extent / 2,
          dy = y - extent / 2;
        return [
          width / 2 + (dx * c - dy * s) * unit,
          height * 0.57 + (dx * s + dy * c) * unit * 0.45 - z * unit * 1.8,
        ];
      };
      const cells = [];
      for (let i = 0; i < n * n; i++) {
        const x = (i % n) * config.params.spacing,
          y = Math.floor(i / n) * config.params.spacing,
          z = state.height[i];
        const points = [
          [x, y],
          [x + config.params.spacing, y],
          [x + config.params.spacing, y + config.params.spacing],
          [x, y + config.params.spacing],
        ].map(([a, b]) => project(a, b, z));
        const center = project(
          x + config.params.spacing / 2,
          y + config.params.spacing / 2,
          z,
        );
        cells.push({
          i,
          points,
          center,
          depth: (x - extent / 2) * s + (y - extent / 2) * c,
          x: x + config.params.spacing / 2,
          y: y + config.params.spacing / 2,
        });
      }
      cells.sort((a, b) => a.depth - b.depth);
      for (const cell of cells) {
        const water = state.water[cell.i];
        ctx.fillStyle =
          water > 0.008
            ? `hsl(202 65% ${35 + Math.min(25, water * 100)}%)`
            : `hsl(${38 + state.height[cell.i] * 4} 28% ${24 + state.height[cell.i] * 3}%)`;
        ctx.beginPath();
        cell.points.forEach(([x, y], i) =>
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
        );
        ctx.closePath();
        ctx.fill();
        if (cell.i === selection?.index) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        hits.push({
          id: `site:${cell.i}`,
          index: cell.i,
          x: cell.center[0],
          y: cell.center[1],
          worldX: cell.x,
          worldY: cell.y,
        });
      }
    } else if (config.view === "phase") {
      const n = config.params.size,
        cellSize = (width - 2 * margin) / n;
      for (let i = 0; i < n * n; i++) {
        const x = margin + (i % n) * cellSize,
          y = margin + Math.floor(i / n) * cellSize,
          phi = state.phase[i],
          temperature = state.temperature[i],
          grain = state.grain[i];
        ctx.fillStyle =
          phi > 0.35
            ? `hsl(${35 + grain * 75} 65% ${25 + phi * 40}%)`
            : `hsl(${205 - Math.max(-1, Math.min(1, temperature)) * 35} 42% ${18 + Math.max(0, temperature + 0.75) * 22}%)`;
        ctx.fillRect(x, y, cellSize + 0.25, cellSize + 0.25);
        hits.push({
          id: `site:${i}`,
          index: i,
          grainId: grain,
          x: x + cellSize / 2,
          y: y + cellSize / 2,
          worldX: ((i % n) + 0.5) * config.params.spacing,
          worldY: (Math.floor(i / n) + 0.5) * config.params.spacing,
        });
      }
      if (selection) {
        const hit = hits.find((row) => row.id === selection.id);
        if (hit) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(
            hit.x - cellSize,
            hit.y - cellSize,
            cellSize * 2,
            cellSize * 2,
          );
        }
      }
    } else throw Error("field_view_unsupported");
    if (config.view === "cells" && selection?.id === "region") {
      ctx.strokeStyle = accent;
      const x = margin + selection.worldX * scale,
        y = margin + selection.worldY * scale;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }
    return { hits, width, height, view: config.view, margin, scale, extent };
  }
  function pick(frame, x, y) {
    if (!frame.hits.length) return null;
    const nearest = frame.hits.reduce((best, row) =>
      Math.hypot(row.x - x, row.y - y) < Math.hypot(best.x - x, best.y - y)
        ? row
        : best,
    );
    if (
      frame.view === "cells" &&
      Math.hypot(nearest.x - x, nearest.y - y) > nearest.radius + 8
    )
      return {
        id: "region",
        worldX: Math.max(
          0,
          Math.min(frame.extent, (x - frame.margin) / frame.scale),
        ),
        worldY: Math.max(
          0,
          Math.min(frame.extent, (y - frame.margin) / frame.scale),
        ),
      };
    return nearest;
  }
  function inspect(config, state, selection) {
    if (!selection) return "Select a cell or region.";
    if (config.view === "cells") {
      const cell = state.cells.find((c) => c.id === selection.id);
      if (selection.id === "region")
        return `Region at ${selection.worldX.toFixed(1)}, ${selection.worldY.toFixed(1)}: move the signaling source or place a boundary here.`;
      if (!cell)
        return "The selected cell is no longer alive; its lineage remains highlighted.";
      const descendants = state.cells.filter(
        (c) => c.lineageId === cell.lineageId,
      ).length;
      return `${cell.id}: ${cell.producer ? "signaling source" : cell.growthRate > 0 ? "growing" : "shrinking or growth-limited"} · signal ${cell.signal.toFixed(3)} · ${cell.neighbors} neighbors · ${descendants} living cells in this lineage.`;
    }
    if (config.view === "terrain") {
      const i = selection.index;
      return `Region ${i}: elevation ${state.height[i].toFixed(3)} m · water depth ${state.water[i].toFixed(3)} m · suspended sediment ${state.sediment[i].toFixed(4)} m equivalent. Drag to rotate the view.`;
    }
    const i = selection.index,
      grain = state.seeds[state.grain[i]];
    return `Region ${i}: solid fraction ${state.phase[i].toFixed(3)} · undercooling ${state.temperature[i].toFixed(3)} · ${grain.id} orientation ${((grain.orientation * 180) / Math.PI).toFixed(1)}°. Solid growth releases heat into its surroundings.`;
  }
  return Object.freeze({ draw, pick, inspect });
});
