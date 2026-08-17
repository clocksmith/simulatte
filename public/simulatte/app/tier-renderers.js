(function attachTierRenderers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierRenderers = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierRenderers() {
  function drawSolarSystem(view) {
      const { ctx, data, zoom, panX, panY } = view;

      // Draw Sun in center
      ctx.beginPath();
      ctx.arc(panX, panY, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#ffaa33';
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#ff8800';
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // Planets colors and label sizes
      const planetStyle = {
        Sun: { color: '#ffaa33', r: 8 },
        Moon: { color: '#888888', r: 3 },
        Mercury: { color: '#aaaaaa', r: 3.5 },
        Venus: { color: '#eebb88', r: 5.5 },
        Mars: { color: '#ff5533', r: 4.5 },
        Jupiter: { color: '#eeddaa', r: 10 },
        Saturn: { color: '#eacc99', r: 9 },
        Uranus: { color: '#aaddff', r: 7 },
        Neptune: { color: '#5588ff', r: 6.8 }
      };

      // Draw planetary paths and positions
      for (const [name, body] of Object.entries(data)) {
        // Each body is { id, ephemeris: [...] }; tolerate a bare array too.
        const ephemeris = Array.isArray(body) ? body : body?.ephemeris;
        if (!ephemeris || ephemeris.length === 0) continue;
        const style = planetStyle[name] || { color: '#33ff66', r: 4 };

        // 1. Draw Orbit Line
        ctx.beginPath();
        ephemeris.forEach((pt, idx) => {
          // Parse RA and Dec to draw circular orbital approximation coordinates
          const raHours = pt.ra.split(' ').map(Number);
          const raRad = ((raHours[0] + raHours[1]/60 + raHours[2]/3600) * 15 * Math.PI) / 180;
          const dist = pt.distanceAU * zoom;

          const px = panX + Math.cos(raRad) * dist;
          const py = panY + Math.sin(raRad) * dist;

          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 2. Draw Active Planet Body (using the first day's coordinate)
        const currentPt = ephemeris[0];
        const raHours = currentPt.ra.split(' ').map(Number);
        const raRad = ((raHours[0] + raHours[1]/60 + raHours[2]/3600) * 15 * Math.PI) / 180;
        const dist = currentPt.distanceAU * zoom;

        const px = panX + Math.cos(raRad) * dist;
        const py = panY + Math.sin(raRad) * dist;

        ctx.beginPath();
        ctx.arc(px, py, style.r, 0, Math.PI * 2);
        ctx.fillStyle = style.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = style.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw label
        ctx.fillStyle = 'rgba(237, 245, 243, 0.85)';
        ctx.font = '10px sans-serif';
        ctx.fillText(name, px + style.r + 5, py + 3);
      }
    
  }

  function drawStarChart(view) {
      const { ctx, data, zoom, panX, panY, rotX, rotY } = view;

      // Projection parameters
      const cx = panX;
      const cy = panY;

      // Render stars sorted by depth to draw background stars first
      const projected = data.map((star) => {
        // Star RA in decimal hours to radians, Dec in degrees to radians
        const raRad = (star.ra * 15 * Math.PI) / 180;
        const decRad = (star.dec * Math.PI) / 180;

        // Spherical to 3D Cartesian coordinates (ICRS frame)
        const x3d = Math.cos(decRad) * Math.cos(raRad);
        const y3d = Math.cos(decRad) * Math.sin(raRad);
        const z3d = Math.sin(decRad);

        // Apply 3D Rotations (Yaw / rotY, Pitch / rotX)
        const x1 = x3d * Math.cos(rotY) - z3d * Math.sin(rotY);
        const z1 = x3d * Math.sin(rotY) + z3d * Math.cos(rotY);
        const y2 = y3d * Math.cos(rotX) - z1 * Math.sin(rotX);
        const z2 = y3d * Math.sin(rotX) + z1 * Math.cos(rotX);

        // Calculate base plane projection (z=0 projected)
        const yBase = y3d * Math.cos(rotX);

        return {
          star,
          x: x1,
          y: y2,
          z: z2, // depth
          yBase,
        };
      });

      // Sort by depth (z ascending - back to front)
      projected.sort((a, b) => a.z - b.z);

      // 1. Draw Concentric Parsec / Light-Year Grid Rings
      const ringIntervals = [
        { r: 120, pc: 2, ly: '6.5 ly' },
        { r: 240, pc: 5, ly: '16.3 ly' },
        { r: 360, pc: 10, ly: '32.6 ly' },
        { r: 480, pc: 15, ly: '48.9 ly' },
      ];
      ctx.save();
      for (const ring of ringIntervals) {
        const radius = ring.r * (zoom / 400);
        if (radius < 20 || radius > 2500) continue;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 160, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(140, 180, 255, 0.28)';
        ctx.font = '9px monospace';
        ctx.fillText(`${ring.pc} pc (${ring.ly})`, cx + radius + 6, cy - 3);
      }

      // Origin Sol Marker
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe8a3';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fbbc04';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 232, 163, 0.75)';
      ctx.font = '10px monospace';
      ctx.fillText('Sol (0,0,0)', cx + 8, cy + 3);
      ctx.restore();

      // 2. Draw 3D Depth Lines connecting stars to galactic reference plane
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 140, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([1, 4]);
      projected.forEach((p) => {
        if (p.z < -0.2) return;
        const screenX = cx + p.x * zoom;
        const screenY = cy + p.y * zoom;
        const baseY = cy + p.yBase * zoom;
        if (Math.abs(screenY - baseY) > 6) {
          ctx.beginPath();
          ctx.moveTo(screenX, baseY);
          ctx.lineTo(screenX, screenY);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(screenX, baseY, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(100, 140, 255, 0.18)';
          ctx.fill();
        }
      });
      ctx.restore();

      // 3. Draw Stars with Temperature-Accurate Blackbody Spectral Palettes
      projected.forEach((p) => {
        if (p.z < -0.15) return;

        const screenX = cx + p.x * zoom;
        const screenY = cy + p.y * zoom;
        const mag = Number(p.star.magnitude ?? 5.0);

        // Core radius inversely scaled with magnitude (lower mag = brighter)
        const coreRadius = Math.max(1.2, Math.min(9.0, (6.5 - mag) * 1.3));
        const spec = String(p.star.spectralType || 'G').toUpperCase();

        // Multi-tier Planck Blackbody Palette definition
        let coreColor = '#ffffff';
        let coronaColor = 'rgba(200, 220, 255, 0.6)';
        let haloColor = 'rgba(120, 170, 255, 0.15)';

        if (spec.startsWith('O')) {
          coreColor = '#cce0ff';
          coronaColor = 'rgba(100, 160, 255, 0.85)';
          haloColor = 'rgba(60, 120, 255, 0.25)';
        } else if (spec.startsWith('B')) {
          coreColor = '#e0ecff';
          coronaColor = 'rgba(140, 185, 255, 0.8)';
          haloColor = 'rgba(90, 150, 255, 0.2)';
        } else if (spec.startsWith('A')) {
          coreColor = '#ffffff';
          coronaColor = 'rgba(215, 230, 255, 0.75)';
          haloColor = 'rgba(160, 195, 255, 0.18)';
        } else if (spec.startsWith('F')) {
          coreColor = '#fffdf0';
          coronaColor = 'rgba(255, 245, 210, 0.7)';
          haloColor = 'rgba(255, 230, 170, 0.15)';
        } else if (spec.startsWith('G')) {
          coreColor = '#fff8db';
          coronaColor = 'rgba(255, 220, 110, 0.8)';
          haloColor = 'rgba(255, 190, 60, 0.2)';
        } else if (spec.startsWith('K')) {
          coreColor = '#ffecd0';
          coronaColor = 'rgba(255, 175, 80, 0.85)';
          haloColor = 'rgba(240, 130, 40, 0.22)';
        } else if (spec.startsWith('M')) {
          coreColor = '#ffdcd0';
          coronaColor = 'rgba(255, 100, 80, 0.85)';
          haloColor = 'rgba(230, 50, 40, 0.25)';
        }

        // Volumetric Corona Glow
        const coronaRadius = coreRadius * (mag < 2.0 ? 3.8 : 2.2);
        const gradient = ctx.createRadialGradient(screenX, screenY, coreRadius * 0.4, screenX, screenY, coronaRadius);
        gradient.addColorStop(0, coreColor);
        gradient.addColorStop(0.35, coronaColor);
        gradient.addColorStop(1, haloColor);

        ctx.save();
        ctx.beginPath();
        ctx.arc(screenX, screenY, coronaRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core Photosphere
        ctx.beginPath();
        ctx.arc(screenX, screenY, coreRadius, 0, Math.PI * 2);
        ctx.fillStyle = coreColor;
        if (mag < 2.0) {
          ctx.shadowBlur = coreRadius * 3;
          ctx.shadowColor = coronaColor;
        }
        ctx.fill();
        ctx.restore();

        // 4-Point Diffraction Cross for Luminary Stars (mag < 1.2)
        if (mag < 1.2) {
          ctx.save();
          ctx.strokeStyle = coronaColor;
          ctx.lineWidth = 1;
          const spikeLen = coreRadius * 4.2;
          ctx.beginPath();
          ctx.moveTo(screenX - spikeLen, screenY);
          ctx.lineTo(screenX + spikeLen, screenY);
          ctx.moveTo(screenX, screenY - spikeLen);
          ctx.lineTo(screenX, screenY + spikeLen);
          ctx.stroke();
          ctx.restore();
        }

        // Label with Name & Spectral Type
        if (p.star.properName && p.star.properName !== 'Sol') {
          ctx.fillStyle = 'rgba(237, 245, 243, 0.72)';
          ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText(p.star.properName, screenX + coreRadius + 5, screenY + 2);
          if (mag < 3.5) {
            ctx.fillStyle = 'rgba(150, 180, 220, 0.48)';
            ctx.font = '8px monospace';
            ctx.fillText(`${spec} · mag ${mag.toFixed(1)}`, screenX + coreRadius + 5, screenY + 12);
          }
        }
      });
  }

  function drawWorld(view) {
      const { ctx, data, zoom, panX, panY } = view;

      ctx.strokeStyle = 'rgba(51, 255, 102, 0.35)';
      ctx.fillStyle = 'rgba(24, 24, 24, 0.55)';
      ctx.lineWidth = 1;

      if (!data.features) return;

      // Project coordinates (Mercator approximation or simple linear lon/lat bounds scaling)
      data.features.forEach(feature => {
        const geometry = feature.geometry;
        if (!geometry) return;

        const drawPolygon = (coords) => {
          ctx.beginPath();
          coords.forEach((coord, idx) => {
            // Mercator projection conversion
            const lon = coord[0];
            const lat = coord[1];

            // Map lon/lat from -180,180 / -90,90 onto screen coordinates
            const px = panX + (lon * 2.2 * zoom);
            const py = panY - (lat * 2.2 * zoom);

            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        };

        if (geometry.type === 'Polygon') {
          geometry.coordinates.forEach(drawPolygon);
        } else if (geometry.type === 'MultiPolygon') {
          geometry.coordinates.forEach(poly => poly.forEach(drawPolygon));
        }
      });
    
  }

  function drawCountry(view) {
      const { ctx, data, zoom, panX, panY } = view;
      if (!data || !data.nodes) return;
      const bounds = data.bounds || {
        minLon: -125,
        maxLon: -66,
        minLat: 24,
        maxLat: 49,
      };

      // 1. Draw the national boundary
      if (data.boundary && data.boundary.geometry) {
        const geometry = data.boundary.geometry;
        const rings = geometry.type === 'MultiPolygon'
          ? geometry.coordinates.flat(1)
          : geometry.type === 'Polygon'
            ? geometry.coordinates
            : [];
        if (rings.length > 0) {
          ctx.strokeStyle = 'rgba(51, 255, 102, 0.55)';
          ctx.fillStyle = 'rgba(24, 24, 24, 0.65)';
          ctx.lineWidth = 1.4;
          rings.forEach((ring) => {
            if (!Array.isArray(ring) || ring.length < 3) return;
            ctx.beginPath();
            ring.forEach((coord, index) => {
              const projected = view.projectCountryPoint(coord[0], coord[1], bounds);
              if (index === 0) {
                ctx.moveTo(projected.x, projected.y);
              } else {
                ctx.lineTo(projected.x, projected.y);
              }
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          });
        }
      }

      // 2. Draw state boundaries
      if (Array.isArray(data.stateBoundaries) && data.stateBoundaries.length > 0) {
        ctx.strokeStyle = 'rgba(173, 214, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        data.stateBoundaries.forEach((geometry) => {
          const rings = geometry.type === 'MultiPolygon'
            ? geometry.coordinates.flat(1)
            : geometry.type === 'Polygon'
              ? geometry.coordinates
              : geometry.type === 'LineString'
                ? [geometry.coordinates]
                : geometry.type === 'MultiLineString'
                  ? geometry.coordinates
                  : [];
          if (rings.length === 0) return;
          rings.forEach((ring) => {
            if (!Array.isArray(ring) || ring.length < 2) return;
            ctx.beginPath();
            ring.forEach((coord, index) => {
              const projected = view.projectCountryPoint(coord[0], coord[1], bounds);
              if (index === 0) {
                ctx.moveTo(projected.x, projected.y);
              } else {
                ctx.lineTo(projected.x, projected.y);
              }
            });
            ctx.stroke();
          });
        });
        ctx.setLineDash([]);
      }

      // 3. Draw Links
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1.5;
      data.links.forEach(link => {
        const sNode = data.nodes[link.source];
        const tNode = data.nodes[link.target];
        if (!sNode || !tNode) return;

        const sourcePt = view.projectCountryPoint(sNode.lon, sNode.lat, bounds);
        const targetPt = view.projectCountryPoint(tNode.lon, tNode.lat, bounds);
        ctx.beginPath();
        ctx.moveTo(sourcePt.x, sourcePt.y);
        ctx.lineTo(targetPt.x, targetPt.y);
        ctx.stroke();
      });

      // 4. Draw Cities
      data.nodes.forEach(node => {
        const pos = view.projectCountryPoint(node.lon, node.lat, bounds);
        const nodeSize = node.type === 'hub' ? 5 : 3.5;

        ctx.beginPath();
        if (node.type === 'hub') {
          ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#33ff66';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#33ff66';
        } else {
          ctx.arc(pos.x, pos.y, nodeSize, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(237, 245, 243, 0.35)';
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(237, 245, 243, 0.75)';
        ctx.font = '10px sans-serif';
        ctx.fillText(node.city.name, pos.x + nodeSize + 2, pos.y + nodeSize + 2);
      });

      // 5. Draw Moving Agents
      data.agents.forEach(agent => {
        agent.progress += agent.speed;
        if (agent.progress >= 1.0) {
          agent.progress = 0;
          // Set new waypoint path node
          const links = data.links.filter(l => l.source === agent.node);
          if (links.length > 0) {
            agent.routeCursor = (agent.routeCursor || 0) + 1;
            agent.node = links[agent.routeCursor % links.length].target;
          } else {
            agent.node = (agent.node + 1) % data.nodes.length;
          }
        }

        const currentNode = data.nodes[agent.node];
        // Retrieve connected link target if possible
        const outgoing = data.links.filter(l => l.source === agent.node);
        const nextNodeIdx = outgoing.length > 0 ? outgoing[0].target : agent.node;
        // Interpolate position along node connection
        const ax = currentNode.lon + (nextNode.lon - currentNode.lon) * agent.progress;
        const ay = currentNode.lat + (nextNode.lat - currentNode.lat) * agent.progress;
        const pos = view.projectCountryPoint(ax, ay, bounds);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = agent.color;
        ctx.fill();
      });
  }

  function drawDatacenter(view) {
    const { ctx, data, zoom, panX, panY, timeSeconds = 0 } = view;

    // Facility parameters
    const cx = panX;
    const cy = panY;
    const rows = 4;
    const racksPerRow = 8;
    const rackWidth = 28 * zoom;
    const rackDepth = 48 * zoom;
    const rackHeight = 72 * zoom;
    const rowSpacing = 90 * zoom;
    const rackSpacing = 38 * zoom;

    // 1. Draw Facility Floor & Raised Tile Grid
    ctx.save();
    const floorWidth = racksPerRow * rackSpacing + 120 * zoom;
    const floorHeight = rows * rowSpacing + 100 * zoom;
    const floorX = cx - floorWidth / 2;
    const floorY = cy - floorHeight / 2;

    ctx.fillStyle = '#080c14';
    ctx.fillRect(floorX - 40 * zoom, floorY - 40 * zoom, floorWidth + 80 * zoom, floorHeight + 80 * zoom);

    // Floor Grid Lines
    ctx.strokeStyle = 'rgba(70, 110, 180, 0.08)';
    ctx.lineWidth = 1;
    const tileSize = 20 * zoom;
    for (let x = floorX - 40 * zoom; x <= floorX + floorWidth + 40 * zoom; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, floorY - 40 * zoom);
      ctx.lineTo(x, floorY + floorHeight + 40 * zoom);
      ctx.stroke();
    }
    for (let y = floorY - 40 * zoom; y <= floorY + floorHeight + 40 * zoom; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(floorX - 40 * zoom, y);
      ctx.lineTo(floorX + floorWidth + 40 * zoom, y);
      ctx.stroke();
    }

    // 2. Draw Cold / Hot Aisle Containment Bands
    for (let r = 0; r < rows; r++) {
      const rowY = floorY + 40 * zoom + r * rowSpacing;
      const isColdAisle = r % 2 === 0;
      ctx.fillStyle = isColdAisle ? 'rgba(0, 190, 255, 0.04)' : 'rgba(255, 90, 50, 0.04)';
      ctx.fillRect(floorX, rowY - 14 * zoom, floorWidth, 18 * zoom);

      ctx.fillStyle = isColdAisle ? 'rgba(0, 210, 255, 0.25)' : 'rgba(255, 110, 70, 0.25)';
      ctx.font = `${Math.max(8, 10 * zoom)}px monospace`;
      ctx.fillText(isColdAisle ? 'COLD AISLE (INLET 22°C)' : 'HOT AISLE (EXHAUST 42°C)', floorX + 10 * zoom, rowY - 2 * zoom);
    }
    ctx.restore();

    // 3. Draw 32 42U Server Racks in 3D Isometric Projection
    const t = timeSeconds || (Date.now() / 1000);
    const rackStates = data?.racks || [];

    for (let r = 0; r < rows; r++) {
      const rowY = floorY + 50 * zoom + r * rowSpacing;

      for (let c = 0; c < racksPerRow; c++) {
        const rackIndex = r * racksPerRow + c;
        const rackX = floorX + 30 * zoom + c * rackSpacing;
        const state = rackStates[rackIndex] || {};
        const avgTemp = Number(state.avgTempC || 52 + Math.sin(t * 0.5 + rackIndex) * 8);
        const isThrottled = avgTemp > 80;

        // Base Rack Body
        ctx.save();
        ctx.fillStyle = '#111827';
        ctx.strokeStyle = isThrottled ? '#ff3b30' : (state.selected ? '#00e5ff' : 'rgba(75, 85, 99, 0.6)');
        ctx.lineWidth = state.selected ? 2 : 1;
        ctx.fillRect(rackX, rowY, rackWidth, rackDepth);
        ctx.strokeRect(rackX, rowY, rackWidth, rackDepth);

        // Rack Face Panel (Top / Isometric Lid)
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.moveTo(rackX, rowY);
        ctx.lineTo(rackX + 6 * zoom, rowY - 8 * zoom);
        ctx.lineTo(rackX + rackWidth + 6 * zoom, rowY - 8 * zoom);
        ctx.lineTo(rackX + rackWidth, rowY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 8 GPU Server Chassis Units per Rack
        const chassisHeight = (rackDepth - 6 * zoom) / 8;
        for (let u = 0; u < 8; u++) {
          const uY = rowY + 3 * zoom + u * chassisHeight;
          const gpuIndex = rackIndex * 8 + u;
          const gpuTemp = avgTemp + Math.sin(t * 2 + gpuIndex * 0.3) * 4;

          // Chassis Slot
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(rackX + 2 * zoom, uY, rackWidth - 4 * zoom, chassisHeight - 1.5 * zoom);

          // Die Thermal Heatmap Glow (Cool Cyan -> Amber -> Magenta/Red)
          let dieColor = '#00f0ff';
          if (gpuTemp > 78) dieColor = '#ff3366';
          else if (gpuTemp > 65) dieColor = '#ffb300';
          else if (gpuTemp > 55) dieColor = '#00e676';

          ctx.fillStyle = dieColor;
          ctx.fillRect(rackX + 4 * zoom, uY + 1 * zoom, 4 * zoom, chassisHeight - 3.5 * zoom);

          // Activity LED
          const ledBlink = Math.sin(t * 8 + gpuIndex) > 0;
          ctx.fillStyle = ledBlink ? '#00e676' : '#054020';
          ctx.beginPath();
          ctx.arc(rackX + rackWidth - 5 * zoom, uY + chassisHeight / 2, 1.2 * zoom, 0, Math.PI * 2);
          ctx.fill();
        }

        // Rack Label
        ctx.fillStyle = 'rgba(156, 163, 175, 0.7)';
        ctx.font = `${Math.max(7, 8 * zoom)}px monospace`;
        ctx.fillText(`R${r + 1}-${c + 1}`, rackX + 2 * zoom, rowY + rackDepth + 10 * zoom);
        ctx.restore();
      }
    }

    // 4. Overhead High-Speed InfiniBand / NVLink Fiber Trunks & AllReduce Pulses
    ctx.save();
    for (let r = 0; r < rows; r++) {
      const rowY = floorY + 50 * zoom + r * rowSpacing;
      const startX = floorX + 30 * zoom;
      const endX = floorX + 30 * zoom + (racksPerRow - 1) * rackSpacing + rackWidth;

      // Optical Cable Tray Trunk
      ctx.beginPath();
      ctx.moveTo(startX, rowY - 12 * zoom);
      ctx.lineTo(endX, rowY - 12 * zoom);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 2 * zoom;
      ctx.stroke();

      // Traveling AllReduce Gradient Tensor Pulses
      const pulsePhase = (t * 1.8 + r * 0.4) % 1;
      const pulseX = startX + (endX - startX) * pulsePhase;

      ctx.beginPath();
      ctx.arc(pulseX, rowY - 12 * zoom, 4 * zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#00e5ff';
      ctx.shadowBlur = 12 * zoom;
      ctx.shadowColor = '#00e5ff';
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Inter-Row Spine Switch Vertical Fiber Trays
    const spineX = floorX + floorWidth / 2;
    ctx.beginPath();
    ctx.moveTo(spineX, floorY + 20 * zoom);
    ctx.lineTo(spineX, floorY + floorHeight - 20 * zoom);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
    ctx.lineWidth = 3 * zoom;
    ctx.setLineDash([4 * zoom, 4 * zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // 5. CDUs (Coolant Distribution Units) at row ends
    ctx.save();
    for (let r = 0; r < rows; r++) {
      const cduX = floorX + floorWidth - 30 * zoom;
      const cduY = floorY + 50 * zoom + r * rowSpacing;

      ctx.fillStyle = '#0e7490';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.fillRect(cduX, cduY, 18 * zoom, rackDepth);
      ctx.strokeRect(cduX, cduY, 18 * zoom, rackDepth);

      // Coolant pump animation
      const pumpAngle = (t * 4 + r) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cduX + 9 * zoom, cduY + rackDepth / 2);
      ctx.rotate(pumpAngle);
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2 * zoom;
      ctx.beginPath();
      ctx.moveTo(-5 * zoom, 0);
      ctx.lineTo(5 * zoom, 0);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#a5f3fc';
      ctx.font = `${Math.max(6, 7 * zoom)}px monospace`;
      ctx.fillText(`CDU-${r + 1}`, cduX - 2 * zoom, cduY + rackDepth + 8 * zoom);
    }
    ctx.restore();
  }

  return Object.freeze({ drawSolarSystem, drawStarChart, drawWorld, drawCountry, drawDatacenter });
});

