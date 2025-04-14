function renderCycleSVG(cycleData) {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");

  const config = {
    nodeWidth: 160,
    nodeHeight: 65,
    decisionSize: 90,
    padding: 40,
    arrowSize: 8,
    strokeWidth: 2,
    fontSize: 13,
    fontFamily: "monospace",
    lineLabelFontSize: 11,
    colors: {
      step: { fill: "#e0e0e0", stroke: "#555" },
      iteration: { fill: "#d0e0ff", stroke: "#3366cc" },
      intervention: { fill: "#fff0b3", stroke: "#cc8400" },
      decision: { fill: "#e0f0e0", stroke: "#4caf50" },
      start_end: { fill: "#f5f5f5", stroke: "#333" },
      pause: { fill: "#f5e0f5", stroke: "#884488" },
      fail_point: { fill: "#ffdddd", stroke: "#d32f2f" },
      retry_decision: { fill: "#e0f0e0", stroke: "#ff9800" },
      final_intervention: { fill: "#fff0b3", stroke: "#d32f2f" },
      text: "#000",
      line_normal: "#555",
      line_success: "#4caf50",
      line_fail: "#f44336",
      line_retry: "#ff9800",
      line_label_bg: "rgba(255, 255, 255, 0.7)",
    },
  };

  const defs = document.createElementNS(svgNs, "defs");
  const marker = document.createElementNS(svgNs, "marker");
  marker.setAttribute("id", "arrowhead");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerUnits", "strokeWidth");
  marker.setAttribute("markerWidth", config.arrowSize);
  marker.setAttribute("markerHeight", config.arrowSize);
  marker.setAttribute("orient", "auto-start-reverse");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", config.colors.line_normal);
  marker.appendChild(path);
  defs.appendChild(marker);

  ["line_normal", "line_success", "line_fail", "line_retry"].forEach(
    (lineType) => {
      if (lineType === "line_normal") return;
      const markerColor = document.createElementNS(svgNs, "marker");
      markerColor.setAttribute("id", `arrowhead-${lineType}`);
      markerColor.setAttribute("viewBox", "0 0 10 10");
      markerColor.setAttribute("refX", "8");
      markerColor.setAttribute("refY", "5");
      markerColor.setAttribute("markerUnits", "strokeWidth");
      markerColor.setAttribute("markerWidth", config.arrowSize);
      markerColor.setAttribute("markerHeight", config.arrowSize);
      markerColor.setAttribute("orient", "auto-start-reverse");
      const pathColor = document.createElementNS(svgNs, "path");
      pathColor.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      pathColor.setAttribute("fill", config.colors[lineType]);
      markerColor.appendChild(pathColor);
      defs.appendChild(markerColor);
    }
  );

  svg.appendChild(defs);

  function createSvgElement(name, attrs = {}) {
    const el = document.createElementNS(svgNs, name);
    for (const key in attrs) {
      el.setAttribute(key, attrs[key]);
    }
    return el;
  }

  function getNodeById(id) {
    return cycleData.nodes.find((n) => n.id === id);
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const nodeElements = {};
  cycleData.nodes.forEach((node) => {
    const group = createSvgElement("g");
    let shape;
    const style = config.colors[node.type] || config.colors.step;
    const halfWidth =
      (node.type === "decision" || node.type === "retry_decision"
        ? config.decisionSize
        : config.nodeWidth) / 2;
    const halfHeight =
      (node.type === "decision" || node.type === "retry_decision"
        ? config.decisionSize
        : config.nodeHeight) / 2;

    if (node.type === "decision" || node.type === "retry_decision") {
      shape = createSvgElement("path", {
        d: `M ${node.x} ${node.y - halfHeight} L ${node.x + halfWidth} ${
          node.y
        } L ${node.x} ${node.y + halfHeight} L ${node.x - halfWidth} ${
          node.y
        } Z`,
        fill: style.fill,
        stroke: style.stroke,
        "stroke-width": config.strokeWidth,
      });
      node.bounds = {
        top: { x: node.x, y: node.y - halfHeight },
        bottom: { x: node.x, y: node.y + halfHeight },
        left: { x: node.x - halfWidth, y: node.y },
        right: { x: node.x + halfWidth, y: node.y },
      };
    } else {
      const isRound = node.type === "start_end" || node.type === "pause";
      shape = createSvgElement("rect", {
        x: node.x - halfWidth,
        y: node.y - halfHeight,
        width: config.nodeWidth,
        height: config.nodeHeight,
        rx: isRound ? config.nodeHeight / 2 : 8,
        ry: isRound ? config.nodeHeight / 2 : 8,
        fill: style.fill,
        stroke: style.stroke,
        "stroke-width": config.strokeWidth,
      });
      node.bounds = {
        top: { x: node.x, y: node.y - halfHeight },
        bottom: { x: node.x, y: node.y + halfHeight },
        left: { x: node.x - halfWidth, y: node.y },
        right: { x: node.x + halfWidth, y: node.y },
      };
    }
    group.appendChild(shape);

    const text = createSvgElement("text", {
      x: node.x,
      y: node.y,
      fill: config.colors.text,
      "font-family": config.fontFamily,
      "font-size": config.fontSize,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });

    const lines = node.label.split("\n");
    const lineHeight = config.fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const startY = node.y - totalTextHeight / 2 + lineHeight / 2;

    lines.forEach((line, index) => {
      const dy = index === 0 ? startY - node.y : lineHeight;
      const tspan = createSvgElement("tspan", {
        x: node.x,
        dy: `${dy}`,
      });
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    group.appendChild(text);
    svg.appendChild(group);
    nodeElements[node.id] = group;

    const nodeMaxX = node.bounds.right.x;
    const nodeMinX = node.bounds.left.x;
    const nodeMaxY = node.bounds.bottom.y;
    const nodeMinY = node.bounds.top.y;
    minX = Math.min(minX, nodeMinX);
    minY = Math.min(minY, nodeMinY);
    maxX = Math.max(maxX, nodeMaxX);
    maxY = Math.max(maxY, nodeMaxY);
  });

  cycleData.connections.forEach((conn) => {
    const fromNode = getNodeById(conn.from);
    const toNode = getNodeById(conn.to);
    if (!fromNode || !toNode) {
      console.warn("Connection nodes not found:", conn.from, conn.to);
      return;
    }

    let startPoint, endPoint;
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;

    if (Math.abs(dy) > Math.abs(dx)) {
      startPoint = dy > 0 ? fromNode.bounds.bottom : fromNode.bounds.top;
      endPoint = dy > 0 ? toNode.bounds.top : toNode.bounds.bottom;
    } else {
      startPoint = dx > 0 ? fromNode.bounds.right : fromNode.bounds.left;
      endPoint = dx > 0 ? toNode.bounds.left : toNode.bounds.right;
    }

    const lineType = conn.type || "normal";
    const lineStyle =
      config.colors[`line_${lineType}`] || config.colors.line_normal;
    const markerId = `arrowhead${
      lineType === "normal" ? "" : "-" + "line_" + lineType
    }`;

    const line = createSvgElement("line", {
      x1: startPoint.x,
      y1: startPoint.y,
      x2: endPoint.x,
      y2: endPoint.y,
      stroke: lineStyle,
      "stroke-width": config.strokeWidth,
      "marker-end": `url(#${markerId})`,
    });
    svg.appendChild(line);

    if (conn.label) {
      const labelRatio = 0.6;
      const midX = startPoint.x * labelRatio + endPoint.x * (1 - labelRatio);
      const midY = startPoint.y * labelRatio + endPoint.y * (1 - labelRatio);
      const angle = Math.atan2(dy, dx);
      const offsetX = Math.sin(angle) * 10;
      const offsetY = -Math.cos(angle) * 10;

      const textLabel = createSvgElement("text", {
        x: midX + offsetX,
        y: midY + offsetY,
        fill: config.colors.text,
        "font-family": config.fontFamily,
        "font-size": config.lineLabelFontSize,
        "text-anchor": "middle",
        "dominant-baseline": "middle",
      });
      textLabel.textContent = conn.label;

      const labelWidthEstimate =
        conn.label.length * config.lineLabelFontSize * 0.6;
      const labelHeightEstimate = config.lineLabelFontSize;
      const bgRect = createSvgElement("rect", {
        x: midX + offsetX - labelWidthEstimate / 2 - 2,
        y: midY + offsetY - labelHeightEstimate / 2 - 1,
        width: labelWidthEstimate + 4,
        height: labelHeightEstimate + 2,
        fill: config.colors.line_label_bg,
        rx: 3,
        ry: 3,
      });

      svg.insertBefore(bgRect, line);
      svg.insertBefore(textLabel, line);

      minX = Math.min(minX, parseFloat(bgRect.getAttribute("x")));
      minY = Math.min(minY, parseFloat(bgRect.getAttribute("y")));
      maxX = Math.max(
        maxX,
        parseFloat(bgRect.getAttribute("x")) +
          parseFloat(bgRect.getAttribute("width"))
      );
      maxY = Math.max(
        maxY,
        parseFloat(bgRect.getAttribute("y")) +
          parseFloat(bgRect.getAttribute("height"))
      );
    }
  });

  if (isFinite(minX)) {
    const viewBoxX = minX - config.padding;
    const viewBoxY = minY - config.padding;
    const viewBoxWidth = maxX - minX + 2 * config.padding;
    const viewBoxHeight = maxY - minY + 2 * config.padding;
    svg.setAttribute(
      "viewBox",
      `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`
    );
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  } else {
    svg.setAttribute("viewBox", "0 0 800 1400");
  }

  return svg; // Return the created SVG element
}

// Example Usage (assumes cycleFlowData is defined elsewhere):
// document.addEventListener("DOMContentLoaded", () => {
//   // Create the SVG element
//   const svgElement = renderCycleSVG(cycleFlowData);
//
//   // Append the created SVG to a container in the DOM
//   const container = document.getElementById("diagram-container"); // Or document.body
//   if (container) {
//     container.appendChild(svgElement);
//   } else {
//       console.error("Diagram container not found.");
//   }
// });
