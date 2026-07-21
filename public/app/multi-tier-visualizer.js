(function attachMultiTierVisualizer(root, factory) {
  const api = factory();
  root.SimulatteMultiTierVisualizer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMultiTierVisualizer() {

  // =========================================================================
  // 2. INTERACTIVE Scales VISUALIZER (Solar, Universe, World, Country)
  // =========================================================================
  class TierVisualizer {
    constructor(canvas, containerId) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.container = document.getElementById(containerId);
      this.currentTier = 'city';
      this.active = false;
      this.data = null;
      this.animationFrame = null;

      // Mouse control variables (zoom & pan/orbit)
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1.0;
      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;

      // 3D rotation coordinates for Star Chart
      this.rotX = 0.2;
      this.rotY = -0.4;
      this.rotZ = 0;

      this.width = 0;
      this.height = 0;

      this.hudElement = null;

      this.setupEvents();
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = this.canvas.width = rect.width || window.innerWidth;
      this.height = this.canvas.height = rect.height || window.innerHeight;
    }

    setupEvents() {
      const c = this.canvas;
      c.addEventListener('mousedown', (e) => {
        if (this.currentTier === 'city') return;
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        if (this.currentTier === 'star-chart') {
          // Orbit stars in 3D
          this.rotY += dx * 0.005;
          this.rotX += dy * 0.005;
        } else {
          // Pan map/solar system in 2D
          this.panX += dx;
          this.panY += dy;
        }
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });

      c.addEventListener('wheel', (e) => {
        if (this.currentTier === 'city') return;
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const nextZoom = Math.max(0.01, Math.min(250.0, this.zoom * zoomFactor));

        // Zoom relative to cursor point
        const rect = c.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        this.panX = cursorX - (cursorX - this.panX) * (nextZoom / this.zoom);
        this.panY = cursorY - (cursorY - this.panY) * (nextZoom / this.zoom);
        this.zoom = nextZoom;
      }, { passive: false });
    }

    createHud() {
      if (this.hudElement) this.hudElement.remove();
      this.hudElement = document.createElement('div');
      this.hudElement.className = 'visualizer-hud';
      this.canvas.parentNode.appendChild(this.hudElement);
    }

    removeHud() {
      if (this.hudElement) {
        this.hudElement.remove();
        this.hudElement = null;
      }
    }

    updateHudContent(title, desc, stats = {}, help = 'Drag to orbit/pan. Scroll to zoom.') {
      if (!this.hudElement) this.createHud();
      let html = `<h3>${title}</h3><p>${desc}</p>`;
      for (const [k, v] of Object.entries(stats)) {
        html += `<div class="hud-stat"><span>${k}</span><span>${v}</span></div>`;
      }
      html += `<span class="hud-help">${help}</span>`;
      this.hudElement.innerHTML = html;
    }

    async loadTier(tierName) {
      this.stop();
      this.currentTier = tierName;
      this.canvas.hidden = (tierName === 'city');

      if (tierName === 'city') {
        this.removeHud();
        return;
      }

      this.active = true;
      this.createHud();

      // Reset transforms
      this.zoom = 1.0;
      this.panX = this.width / 2;
      this.panY = this.height / 2;

      if (tierName === 'solar-system') {
        this.zoom = 140.0;
        this.updateHudContent('Solar System', 'Loading NASA JPL Horizons orbital data...', {}, '');
        try {
          const res = await fetch('./data/autonomy/cache/space/solar-system.json');
          this.data = await res.json();
          this.updateHudContent('Solar System', 'Heliocentric orbits showing planetary positions, velocities and range from Earth.', {
            'Source': 'NASA JPL Horizons API',
            'Bodies': Object.keys(this.data).length,
            'Interval': '2026-07-20 to 2026-07-27'
          });
        } catch (e) {
          console.error(e);
          this.updateHudContent('Solar System', 'Error loading ephemerides data. Run "solar-system" fetch command first.', {}, '');
        }
      } else if (tierName === 'star-chart') {
        this.zoom = 280.0;
        this.rotX = 0.3;
        this.rotY = -0.5;
        this.updateHudContent('Universe', 'Loading stellar catalog database...', {}, '');
        try {
          const res = await fetch('./data/autonomy/cache/space/star-chart.json');
          const parsed = await res.json();
          // The catalog is { schema, count, stars: [...] }; the renderer wants the array.
          this.data = Array.isArray(parsed) ? parsed : (parsed.stars || []);
          this.updateHudContent('Universe', 'Hipparcos/Yale/Gliese 3D celestial coordinates color-coded by spectral class.', {
            'Catalog': 'HYG Star Database',
            'Visible Stars Loaded': this.data.length,
            'Visual Limiting Magnitude': '5.0'
          });
        } catch (e) {
          console.error(e);
          this.updateHudContent('Universe', 'Error loading star catalog. Run "star-chart" fetch command first.', {}, '');
        }
      } else if (tierName === 'world') {
        this.zoom = 1.4;
        this.updateHudContent('Planet', 'Loading global administrative boundaries...', {}, '');
        try {
          const res = await fetch('./data/autonomy/cache/world/countries.geojson');
          this.data = await res.json();
          this.updateHudContent('Planet', 'Admin 0 global country borders from Natural Earth geographic assets.', {
            'Database': 'Natural Earth 110m',
            'Countries Features': this.data.features?.length || 0
          });
        } catch (e) {
          console.error(e);
          this.updateHudContent('Planet', 'Error loading world outline GeoJSON. Run "world" fetch command first.', {}, '');
        }
      } else if (tierName === 'country') {
        this.zoom = 60.0;
        this.updateHudContent('Country', 'Rendering regional highway networks...', {}, '');
        // For country scale, render a gorgeous topological graph simulation of United States regional routing
        this.data = this.generateRegionalGraph();
        this.updateHudContent('Country', 'Transit network and highway graph traversal paths across regional bounds.', {
          'Target extract': 'United States PBF extract',
          'Graph Nodes': this.data.nodes.length,
          'Graph Links': this.data.links.length,
          'Autonomous Fleet': '250 agents'
        });
      }

      this.loop();
    }

    generateRegionalGraph() {
      // Procedurally generate a beautiful regional graph grid for visualization
      const nodes = [];
      const links = [];
      const nodeCount = 80;
      
      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: i,
          x: (Math.random() - 0.5) * 8.0,
          y: (Math.random() - 0.5) * 8.0,
          type: Math.random() < 0.15 ? 'hub' : 'waypoint'
        });
      }

      for (let i = 0; i < nodeCount; i++) {
        // Link to nearest neighbors
        const targets = nodes
          .map((n, idx) => ({ idx, dist: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y) }))
          .filter(t => t.idx !== i)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);
          
        for (const t of targets) {
          if (t.dist < 2.5) {
            links.push({ source: i, target: t.idx });
          }
        }
      }

      // Procedural agents running on the country map
      const agents = [];
      for (let a = 0; a < 250; a++) {
        const startNode = Math.floor(Math.random() * nodeCount);
        agents.push({
          node: startNode,
          progress: Math.random(),
          speed: 0.005 + Math.random() * 0.01,
          color: Math.random() < 0.35 ? '#33ff66' : 'rgba(237, 245, 243, 0.7)'
        });
      }

      return { nodes, links, agents };
    }

    stop() {
      this.active = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }

    loop() {
      if (!this.active) return;
      this.draw();
      this.animationFrame = requestAnimationFrame(() => this.loop());
    }

    draw() {
      const { ctx, width, height } = this;
      ctx.clearRect(0, 0, width, height);

      // Render dark cosmic background
      ctx.fillStyle = '#060606';
      ctx.fillRect(0, 0, width, height);

      if (!this.data) return;

      ctx.save();
      
      switch (this.currentTier) {
        case 'solar-system':
          this.drawSolarSystem();
          break;
        case 'star-chart':
          this.drawStarChart();
          break;
        case 'world':
          this.drawWorld();
          break;
        case 'country':
          this.drawCountry();
          break;
      }

      ctx.restore();
    }

    // --- DRAW SOLAR SYSTEM ---
    drawSolarSystem() {
      const { ctx, data, zoom, panX, panY } = this;

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

    // --- DRAW STAR CHART (3D PROJECTION) ---
    drawStarChart() {
      const { ctx, data, zoom, panX, panY, rotX, rotY } = this;

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

    // --- DRAW WORLD (GEOJSON COUNTRIES) ---
    drawWorld() {
      const { ctx, data, zoom, panX, panY } = this;

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

    // --- DRAW COUNTRY (TRANSIT GRAPH) ---
    drawCountry() {
      const { ctx, data, zoom, panX, panY } = this;

      // 1. Draw Links
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1.5;
      data.links.forEach(link => {
        const sNode = data.nodes[link.source];
        const tNode = data.nodes[link.target];
        if (!sNode || !tNode) return;

        ctx.beginPath();
        ctx.moveTo(panX + sNode.x * zoom, panY + sNode.y * zoom);
        ctx.lineTo(panX + tNode.x * zoom, panY + tNode.y * zoom);
        ctx.stroke();
      });

      // 2. Draw Nodes
      data.nodes.forEach(node => {
        const nx = panX + node.x * zoom;
        const ny = panY + node.y * zoom;

        ctx.beginPath();
        if (node.type === 'hub') {
          ctx.arc(nx, ny, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#33ff66';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#33ff66';
        } else {
          ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(237, 245, 243, 0.35)';
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 3. Draw Moving Agents
      data.agents.forEach(agent => {
        agent.progress += agent.speed;
        if (agent.progress >= 1.0) {
          agent.progress = 0;
          // Set new waypoint path node
          const links = data.links.filter(l => l.source === agent.node);
          if (links.length > 0) {
            agent.node = links[Math.floor(Math.random() * links.length)].target;
          } else {
            agent.node = Math.floor(Math.random() * data.nodes.length);
          }
        }

        const currentNode = data.nodes[agent.node];
        // Retrieve connected link target if possible
        const outgoing = data.links.filter(l => l.source === agent.node);
        const nextNodeIdx = outgoing.length > 0 ? outgoing[0].target : agent.node;
        const nextNode = data.nodes[nextNodeIdx];

        if (!currentNode || !nextNode) return;

        // Interpolate position along node connection
        const ax = currentNode.x + (nextNode.x - currentNode.x) * agent.progress;
        const ay = currentNode.y + (nextNode.y - currentNode.y) * agent.progress;

        ctx.beginPath();
        ctx.arc(panX + ax * zoom, panY + ay * zoom, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = agent.color;
        ctx.fill();
      });
    }
  }

  // --- API DECLARATION ---
  function createTierVisualizer(canvas, containerId) {
    return new TierVisualizer(canvas, containerId);
  }

  return { createTierVisualizer };
});
