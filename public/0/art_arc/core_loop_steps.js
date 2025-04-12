const cycleFlowData = {
  nodes: [
    // Core Steps (Vertical Flow - Shifted Right)
    { id: "start", label: "Start Cycle", type: "start_end", x: 400, y: 50 },
    { id: "step1", label: "1. Define Goal", type: "step", x: 400, y: 150 },
    { id: "step2", label: "2. Analyze", type: "iteration", x: 400, y: 250 }, // Target for retry loop
    { id: "step3", label: "3. Propose", type: "iteration", x: 400, y: 350 },
    {
      id: "step4",
      label: "4. Generate Artifacts",
      type: "iteration",
      x: 400,
      y: 450,
    },
    {
      id: "decision_gen",
      label: "Generation OK?",
      type: "decision",
      x: 400,
      y: 550,
    },
    {
      id: "step5",
      label: "5. Critique Trigger?",
      type: "decision",
      x: 400,
      y: 650,
    },
    { id: "step7", label: "7. Refine & Apply", type: "step", x: 400, y: 980 }, // Target for final intervention result
    {
      id: "decision_apply",
      label: "Apply OK?",
      type: "decision",
      x: 400,
      y: 1080,
    },

    // Step 6 Variants (Branching Around Step 5)
    {
      id: "step6_human",
      label: "6a. Human\nIntervention",
      type: "intervention",
      x: 150,
      y: 780,
    }, // Moved left and down
    {
      id: "step6_auto",
      label: "6b. Auto Critique",
      type: "step",
      x: 400,
      y: 780,
    },
    {
      id: "decision_auto_crit",
      label: "Critique Pass?",
      type: "decision",
      x: 400,
      y: 880,
    },
    {
      id: "step6_skip",
      label: "6c. Critique Skipped",
      type: "step",
      x: 650,
      y: 780,
    }, // Moved right

    // Failure Handling & Retry Loop (Left Side)
    {
      id: "fail_point_gen",
      label: "Generation\nFailed",
      type: "fail_point",
      x: 150,
      y: 550,
    }, // Fail point from step 4 decision
    {
      id: "fail_point_apply",
      label: "Apply\nFailed",
      type: "fail_point",
      x: 150,
      y: 1080,
    }, // Fail point from step 7 decision
    {
      id: "decision_retry_limit",
      label: "Retry Limit\nReached?",
      type: "retry_decision",
      x: 150,
      y: 880,
    }, // Decision to retry or force intervention
    {
      id: "human_intervention_final",
      label: "Forced Human\nIntervention (Fail)",
      type: "final_intervention",
      x: 150,
      y: 980,
    }, // Final intervention node

    // End Points (Bottom Right / Center)
    {
      id: "end_success",
      label: "End\n(Success)",
      type: "start_end",
      x: 650,
      y: 1180,
    },
    {
      id: "pause_sandbox",
      label: "Pause\n(Sandbox Review)",
      type: "pause",
      x: 400,
      y: 1180,
    },
    // Removed separate end_fail nodes, failure now goes to retry logic
  ],
  connections: [
    // Main Flow Down
    { from: "start", to: "step1", type: "normal" },
    { from: "step1", to: "step2", type: "normal" },
    { from: "step2", to: "step3", type: "normal" },
    { from: "step3", to: "step4", type: "normal" },
    { from: "step4", to: "decision_gen", type: "normal" },
    { from: "decision_gen", to: "step5", type: "success", label: "OK" }, // Generation OK path

    // Critique Trigger Branches (Step 5)
    { from: "step5", to: "step6_human", type: "normal", label: "Human Req." }, // To left human node
    { from: "step5", to: "step6_auto", type: "normal", label: "Auto-Critique" }, // Down to auto critique
    { from: "step5", to: "step6_skip", type: "normal", label: "Skip Critique" }, // To right skip node

    // Auto Critique Branches (After Step 6b)
    { from: "step6_auto", to: "decision_auto_crit", type: "normal" },
    { from: "decision_auto_crit", to: "step7", type: "success", label: "Pass" }, // Auto-crit passes -> Step 7
    {
      from: "decision_auto_crit",
      to: "step6_human",
      type: "fail",
      label: "Fail",
    }, // Auto-crit fails -> Human Intervention

    // Convergence to Step 7 (Refine & Apply)
    {
      from: "step6_human",
      to: "step7",
      type: "normal",
      label: "Input Provided",
    }, // Human provides input -> Step 7
    { from: "step6_skip", to: "step7", type: "normal" }, // Skip critique -> Step 7
    {
      from: "human_intervention_final",
      to: "step7",
      type: "normal",
      label: "Input Provided",
    }, // Final intervention -> Step 7

    // Apply Decision Branches (After Step 7)
    { from: "step7", to: "decision_apply", type: "normal" },
    { from: "decision_apply", to: "end_success", type: "success", label: "OK" }, // Apply OK -> Success
    {
      from: "decision_apply",
      to: "pause_sandbox",
      type: "normal",
      label: "Sandbox",
    }, // Apply needs Sandbox -> Pause

    // Failure Paths to Retry Logic
    { from: "decision_gen", to: "fail_point_gen", type: "fail", label: "Fail" }, // Generation fails -> Fail Point Gen
    {
      from: "decision_apply",
      to: "fail_point_apply",
      type: "fail",
      label: "Fail",
    }, // Apply fails -> Fail Point Apply
    { from: "fail_point_gen", to: "decision_retry_limit", type: "normal" }, // Connect fail points to retry decision
    { from: "fail_point_apply", to: "decision_retry_limit", type: "normal" },

    // Retry Loop Logic
    {
      from: "decision_retry_limit",
      to: "step2",
      type: "retry",
      label: "Retry (Limit OK)",
    }, // Retry limit OK -> Loop back to Step 2
    {
      from: "decision_retry_limit",
      to: "human_intervention_final",
      type: "fail",
      label: "Limit Reached",
    }, // Retry limit reached -> Force final intervention
  ],
};

function renderCycleSVG(cycleData, svgId) {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.getElementById(svgId);
  if (!svg) {
    console.error("SVG element not found:", svgId);
    return;
  }
  // Clear previous content
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // --- Configuration (UPDATED FOR SIZE) ---
  const config = {
    nodeWidth: 160, // Increased width
    nodeHeight: 65, // Increased height
    decisionSize: 90, // Increased decision node size (diameter)
    padding: 40, // Increased padding
    arrowSize: 8, // Slightly larger arrow
    strokeWidth: 2, // Slightly thicker lines
    fontSize: 13, // Larger font
    fontFamily: "monospace",
    lineLabelFontSize: 11, // Larger line label font
    colors: {
      // Colors remain the same, adjust if desired
      step: { fill: "#e0e0e0", stroke: "#555" },
      iteration: { fill: "#d0e0ff", stroke: "#3366cc" },
      intervention: { fill: "#fff0b3", stroke: "#cc8400" },
      decision: { fill: "#e0f0e0", stroke: "#4caf50" },
      start_end: { fill: "#f5f5f5", stroke: "#333" },
      pause: { fill: "#f5e0f5", stroke: "#884488" },
      fail_point: { fill: "#ffdddd", stroke: "#d32f2f" }, // New style for failure points
      retry_decision: { fill: "#e0f0e0", stroke: "#ff9800" }, // Distinct decision color
      final_intervention: { fill: "#fff0b3", stroke: "#d32f2f" }, // Intervention due to failure
      text: "#000",
      line_normal: "#555",
      line_success: "#4caf50",
      line_fail: "#f44336",
      line_retry: "#ff9800", // Color for retry loop line
      line_label_bg: "rgba(255, 255, 255, 0.7)",
    },
  };

  // --- Add Arrowhead Marker Definition ---
  const defs = document.createElementNS(svgNs, "defs");
  const marker = document.createElementNS(svgNs, "marker");
  marker.setAttribute("id", "arrowhead");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8"); // Position arrow tip slightly before line end
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerUnits", "strokeWidth");
  marker.setAttribute("markerWidth", config.arrowSize);
  marker.setAttribute("markerHeight", config.arrowSize);
  marker.setAttribute("orient", "auto-start-reverse");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", config.colors.line_normal); // Default color, will be updated per line
  marker.appendChild(path);
  defs.appendChild(marker);

  // Add separate markers for different line colors if needed (optional but better)
  ["line_normal", "line_success", "line_fail", "line_retry"].forEach(
    (lineType) => {
      if (lineType === "line_normal") return; // Already created default
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

  // --- Helper Functions ---
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

  // Find diagram bounds for viewBox
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  // --- Render Nodes ---
  const nodeElements = {}; // Store node elements for connection positioning
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
      // Draw rhombus for decision
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
      // Draw rectangle for other types
      const isRound = node.type === "start_end" || node.type === "pause";
      shape = createSvgElement("rect", {
        x: node.x - halfWidth,
        y: node.y - halfHeight,
        width: config.nodeWidth,
        height: config.nodeHeight,
        rx: isRound ? config.nodeHeight / 2 : 8, // Slightly more rounded corners
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

    // Add text label
    const text = createSvgElement("text", {
      x: node.x,
      y: node.y,
      fill: config.colors.text,
      "font-family": config.fontFamily,
      "font-size": config.fontSize,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });

    // Handle multi-line text
    const lines = node.label.split("\n");
    const lineHeight = config.fontSize * 1.2; // Spacing between lines
    const totalTextHeight = lines.length * lineHeight;
    // Adjust start Y to center the block of text vertically
    const startY = node.y - totalTextHeight / 2 + lineHeight / 2; // Start near the top baseline

    lines.forEach((line, index) => {
      // For the first line, dy is the offset from the node's y to the first line's baseline.
      // For subsequent lines, dy is the spacing (lineHeight).
      const dy = index === 0 ? startY - node.y : lineHeight;
      const tspan = createSvgElement("tspan", {
        x: node.x,
        dy: `${dy}`, // Use dy for relative positioning
      });
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    group.appendChild(text);
    svg.appendChild(group);
    nodeElements[node.id] = group; // Store group for potential future use

    // Update bounds tracking
    const nodeMaxX = node.bounds.right.x;
    const nodeMinX = node.bounds.left.x;
    const nodeMaxY = node.bounds.bottom.y;
    const nodeMinY = node.bounds.top.y;
    minX = Math.min(minX, nodeMinX);
    minY = Math.min(minY, nodeMinY);
    maxX = Math.max(maxX, nodeMaxX);
    maxY = Math.max(maxY, nodeMaxY);
  });

  // --- Render Connections ---
  cycleData.connections.forEach((conn) => {
    const fromNode = getNodeById(conn.from);
    const toNode = getNodeById(conn.to);
    if (!fromNode || !toNode) {
      console.warn("Connection nodes not found:", conn.from, conn.to);
      return;
    }

    // Determine start and end points (connect appropriate edges)
    // Basic connection point logic (can be improved for complex layouts)
    let startPoint, endPoint;
    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;

    if (Math.abs(dy) > Math.abs(dx)) {
      // Primarily vertical
      startPoint = dy > 0 ? fromNode.bounds.bottom : fromNode.bounds.top;
      endPoint = dy > 0 ? toNode.bounds.top : toNode.bounds.bottom;
    } else {
      // Primarily horizontal
      startPoint = dx > 0 ? fromNode.bounds.right : fromNode.bounds.left;
      endPoint = dx > 0 ? toNode.bounds.left : toNode.bounds.right;
    }

    const lineType = conn.type || "normal";
    const lineStyle =
      config.colors[`line_${lineType}`] || config.colors.line_normal;
    const markerId = `arrowhead${
      lineType === "normal" ? "" : "-" + "line_" + lineType
    }`; // Use specific marker ID

    // Draw the line
    const line = createSvgElement("line", {
      x1: startPoint.x,
      y1: startPoint.y,
      x2: endPoint.x,
      y2: endPoint.y,
      stroke: lineStyle,
      "stroke-width": config.strokeWidth,
      "marker-end": `url(#${markerId})`, // Apply specific arrowhead
    });
    svg.appendChild(line);

    // Add connection label if present
    if (conn.label) {
      // Position label slightly offset from the midpoint towards the start node for clarity
      const labelRatio = 0.6; // 0.5 is midpoint, > 0.5 moves towards start
      const midX = startPoint.x * labelRatio + endPoint.x * (1 - labelRatio);
      const midY = startPoint.y * labelRatio + endPoint.y * (1 - labelRatio);
      // Add small offset perpendicular to the line direction
      const angle = Math.atan2(dy, dx);
      const offsetX = Math.sin(angle) * 10; // Offset distance
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

      // Add a small background rect for readability (estimate size)
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

      // Insert background behind text
      svg.insertBefore(bgRect, line); // Insert background before line
      svg.insertBefore(textLabel, line); // Insert text before line

      // Update bounds for label background
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

  // --- Set ViewBox ---
  if (isFinite(minX)) {
    const viewBoxX = minX - config.padding;
    const viewBoxY = minY - config.padding;
    const viewBoxWidth = maxX - minX + 2 * config.padding;
    const viewBoxHeight = maxY - minY + 2 * config.padding;
    svg.setAttribute(
      "viewBox",
      `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`
    );
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet"); // Ensure scaling is centered
  } else {
    // Default viewbox if no elements rendered
    svg.setAttribute("viewBox", "0 0 800 1400"); // Increased default size
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Expects DOM to have <svg id="cycleDiagram" ...></svg>
  renderCycleSVG(cycleFlowData, "cycleDiagram");
});
