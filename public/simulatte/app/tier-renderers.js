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
      const projected = data.map(star => {
        // Star RA in decimal hours to radians
        const raRad = (star.ra * 15 * Math.PI) / 180;
        const decRad = (star.dec * Math.PI) / 180;

        // Spherical to 3D Cartesian coordinates
        let x3d = Math.cos(decRad) * Math.cos(raRad);
        let y3d = Math.cos(decRad) * Math.sin(raRad);
        let z3d = Math.sin(decRad);

        // Apply 3D Rotations
        // 1. Rotate Y (rotY)
        let x1 = x3d * Math.cos(rotY) - z3d * Math.sin(rotY);
        let z1 = x3d * Math.sin(rotY) + z3d * Math.cos(rotY);
        
        // 2. Rotate X (rotX)
        let y2 = y3d * Math.cos(rotX) - z1 * Math.sin(rotX);
        let z2 = y3d * Math.sin(rotX) + z1 * Math.cos(rotX);

        return {
          star,
          x: x1,
          y: y2,
          z: z2 // depth
        };
      });

      // Sort by depth (z ascending - back to front)
      projected.sort((a, b) => a.z - b.z);

      // Draw constellation grid rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 150, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw stars
      projected.forEach(p => {
        // Skip stars behind coordinate projection plane (optional, but keeps view clean)
        if (p.z < -0.1) return;

        const screenX = cx + p.x * zoom;
        const screenY = cy + p.y * zoom;

        // Star size by magnitude (smaller mag = brighter/larger)
        const size = Math.max(0.5, Math.min(8.0, (6.0 - p.star.magnitude) * 1.2));
        
        // Star color by spectral type
        let color = 'rgba(255, 255, 255, 0.85)';
        const spec = p.star.spectralType || '';
        if (spec.startsWith('O')) color = 'rgba(155, 176, 255, 0.95)';
        else if (spec.startsWith('B')) color = 'rgba(170, 191, 255, 0.9)';
        else if (spec.startsWith('A')) color = 'rgba(202, 215, 255, 0.95)';
        else if (spec.startsWith('F')) color = 'rgba(248, 247, 255, 0.9)';
        else if (spec.startsWith('G')) color = 'rgba(255, 244, 234, 0.95)'; // Like Sol
        else if (spec.startsWith('K')) color = 'rgba(255, 210, 161, 0.9)';
        else if (spec.startsWith('M')) color = 'rgba(255, 140, 110, 0.95)';

        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        
        // Add glow to very bright stars
        if (p.star.magnitude < 1.8) {
          ctx.shadowBlur = size * 2.5;
          ctx.shadowColor = color;
        }

        ctx.fill();
        ctx.shadowBlur = 0; // reset

        // Draw proper names for major stars
        if (p.star.properName && p.star.properName !== 'Sol') {
          ctx.fillStyle = 'rgba(237, 245, 243, 0.5)';
          ctx.font = '9px sans-serif';
          ctx.fillText(p.star.properName, screenX + size + 4, screenY + 3);
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
        const nextNode = data.nodes[nextNodeIdx];

        if (!currentNode || !nextNode) return;

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

  return Object.freeze({ drawSolarSystem, drawStarChart, drawWorld, drawCountry });
});
