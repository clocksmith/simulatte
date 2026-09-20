(function attachTierRenderers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierRenderers = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierRenderers() {
  function drawSolarSystem(view) {
      if (view.nativeCoordinateSystems?.includes('heliocentric-ecliptic-au')) return;
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
      if (view.nativeCoordinateSystems?.includes('icrs-cartesian-pc')) return;
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
        const nextNode = data.nodes[nextNodeIdx] || currentNode;
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
    const { ctx, data, timeSeconds = 0 } = view;
    const project = (position) => view.projectCoordinatePoint
      ? view.projectCoordinatePoint(position, 'datacenter-cartesian-meters')
      : { x: view.panX + position[0] * view.zoom, y: view.panY - position[1] * view.zoom };
    const racks = Array.isArray(data?.racks) ? data.racks : [];
    if (!racks.length) return;
    const bounds = data.bounds || { minimumMeters: [-18, -11, 0], maximumMeters: [18, 11, 4.5] };
    const [minimumX, minimumY] = bounds.minimumMeters;
    const [maximumX, maximumY] = bounds.maximumMeters;
    const floor = [
      [minimumX, minimumY, 0], [maximumX, minimumY, 0],
      [maximumX, maximumY, 0], [minimumX, maximumY, 0],
    ].map(project);
    const floorGradient = ctx.createLinearGradient(floor[0].x, floor[0].y, floor[2].x, floor[2].y);
    floorGradient.addColorStop(0, '#070c13');
    floorGradient.addColorStop(0.55, '#0d1621');
    floorGradient.addColorStop(1, '#05080d');
    polygon(ctx, floor, floorGradient, 'rgba(120, 185, 225, 0.18)', 1.2);

    ctx.save();
    ctx.lineWidth = 0.7;
    for (let x = minimumX; x <= maximumX; x += 2) {
      line(ctx, [project([x, minimumY, 0.01]), project([x, maximumY, 0.01])], 'rgba(105, 165, 205, 0.075)');
    }
    for (let y = minimumY; y <= maximumY; y += 2) {
      line(ctx, [project([minimumX, y, 0.01]), project([maximumX, y, 0.01])], 'rgba(105, 165, 205, 0.075)');
    }
    ctx.restore();

    const rows = [...new Set(racks.map((rack) => rack.row))].sort((a, b) => a - b);
    rows.forEach((row, index) => {
      const rowRacks = racks.filter((rack) => rack.row === row);
      const centerY = rowRacks.reduce((sum, rack) => sum + rack.yM, 0) / rowRacks.length;
      const cold = index % 2 === 0;
      const band = [
        [minimumX + 1, centerY - 1.25, 0.02], [maximumX - 1, centerY - 1.25, 0.02],
        [maximumX - 1, centerY + 1.25, 0.02], [minimumX + 1, centerY + 1.25, 0.02],
      ].map(project);
      polygon(ctx, band, cold ? 'rgba(35, 196, 255, 0.045)' : 'rgba(255, 107, 82, 0.04)',
        cold ? 'rgba(70, 215, 255, 0.16)' : 'rgba(255, 125, 90, 0.13)', 0.8);
      const label = project([minimumX + 1.4, centerY, 0.05]);
      ctx.fillStyle = cold ? 'rgba(95, 220, 255, 0.55)' : 'rgba(255, 145, 112, 0.48)';
      ctx.font = '500 9px "IBM Plex Mono", monospace';
      ctx.fillText(cold ? 'COLD AISLE' : 'HOT AISLE', label.x, label.y);

      const first = rowRacks[0], last = rowRacks.at(-1);
      const trunk = [project([first.xM, centerY, 3.75]), project([last.xM, centerY, 3.75])];
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(77, 232, 255, 0.28)';
      line(ctx, trunk, 'rgba(77, 232, 255, 0.34)', 1.6);
      const pulse = (timeSeconds * 0.18 + index * 0.21) % 1;
      const pulsePoint = {
        x: trunk[0].x + (trunk[1].x - trunk[0].x) * pulse,
        y: trunk[0].y + (trunk[1].y - trunk[0].y) * pulse,
      };
      ctx.beginPath(); ctx.arc(pulsePoint.x, pulsePoint.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#5ff4ff'; ctx.fill();
      ctx.restore();

      drawDatacenterPrism(ctx, project,
        [maximumX - 2.2, centerY - 0.7, 0], [maximumX - 0.8, centerY + 0.7, 2.4],
        { front: '#093845', side: '#062630', top: '#0d5667', stroke: 'rgba(93, 231, 244, 0.55)' });
      const cdu = project([maximumX - 1.5, centerY, 1.1]);
      ctx.save(); ctx.translate(cdu.x, cdu.y); ctx.rotate(timeSeconds * 2.4 + index);
      ctx.strokeStyle = '#83f2f5'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke(); ctx.restore();
    });

    const spine = [project([0, minimumY + 1, 4.2]), project([0, maximumY - 1, 4.2])];
    ctx.save(); ctx.setLineDash([5, 5]);
    line(ctx, spine, 'rgba(195, 132, 255, 0.48)', 2.2);
    ctx.restore();
  }

  function drawDatacenterMarker(ctx, point, marker, zoom) {
    if (marker.quantityKind !== 'modeled-rack-temperature') return false;
    const width = Math.max(12, Math.min(42, zoom * 1.02));
    const height = width * 1.58;
    const depth = width * 0.28;
    const temperature = Number(marker.quantityValue);
    const heat = temperature >= 80 ? '#ff5c66' : temperature >= 65 ? '#ffb347' : '#4de8ff';
    ctx.save();
    ctx.shadowBlur = temperature >= 65 ? 18 : 9;
    ctx.shadowColor = heat;
    polygon(ctx, [
      { x: point.x - width / 2, y: point.y - height / 2 },
      { x: point.x - width / 2 + depth, y: point.y - height / 2 - depth },
      { x: point.x + width / 2 + depth, y: point.y - height / 2 - depth },
      { x: point.x + width / 2, y: point.y - height / 2 },
    ], '#263746', heat, 1);
    polygon(ctx, [
      { x: point.x + width / 2, y: point.y - height / 2 },
      { x: point.x + width / 2 + depth, y: point.y - height / 2 - depth },
      { x: point.x + width / 2 + depth, y: point.y + height / 2 - depth },
      { x: point.x + width / 2, y: point.y + height / 2 },
    ], '#0b141d', heat, 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#121e29'; ctx.strokeStyle = heat; ctx.lineWidth = 1.4;
    ctx.fillRect(point.x - width / 2, point.y - height / 2, width, height);
    ctx.strokeRect(point.x - width / 2, point.y - height / 2, width, height);
    ctx.fillStyle = heat;
    for (let slot = 0; slot < 8; slot += 1) {
      const slotHeight = (height - 7) / 8;
      const slotY = point.y - height / 2 + 3 + slot * slotHeight;
      ctx.fillStyle = '#071019';
      ctx.fillRect(point.x - width / 2 + 3, slotY, width - 6, Math.max(2, slotHeight - 1.5));
      ctx.fillStyle = heat;
      ctx.fillRect(point.x - width / 2 + 4, slotY + 1, Math.max(1.5, width * 0.09), Math.max(1, slotHeight - 3.5));
      ctx.fillStyle = slot % 3 === 0 ? '#8fffb5' : 'rgba(143, 255, 181, 0.28)';
      ctx.fillRect(point.x + width / 2 - 5, slotY + slotHeight / 2, 1.5, 1.5);
    }
    ctx.font = '600 8px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center'; ctx.fillStyle = heat;
    const [id, temperatureLabel] = marker.label.split(' · ');
    if (width >= 18) ctx.fillText(id, point.x, point.y + height / 2 - 4);
    if (temperatureLabel && (temperature >= 65 || width >= 28)) {
      ctx.fillStyle = '#edf5f3';
      ctx.fillText(width < 24 ? `${Math.round(temperature)}°` : temperatureLabel, point.x, point.y + height / 2 + 12);
    }
    ctx.restore();
    return true;
  }

  function drawDatacenterPrism(ctx, project, minimum, maximum, colors) {
    const [x0, y0, z0] = minimum, [x1, y1, z1] = maximum;
    const p = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(project);
    polygon(ctx, [p[4], p[5], p[6], p[7]], colors.top, colors.stroke, 1);
    polygon(ctx, [p[1], p[2], p[6], p[5]], colors.side, colors.stroke, 1);
    polygon(ctx, [p[0], p[1], p[5], p[4]], colors.front, colors.stroke, 1);
  }

  function polygon(ctx, points, fillStyle, strokeStyle, lineWidth = 1) {
    if (!points.length) return;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }

  function line(ctx, points, strokeStyle, lineWidth = 1) {
    if (points.length < 2) return;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke();
  }

  return Object.freeze({ drawSolarSystem, drawStarChart, drawWorld, drawCountry, drawDatacenter, drawDatacenterMarker });
});
