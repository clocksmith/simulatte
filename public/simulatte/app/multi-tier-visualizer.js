(function attachMultiTierVisualizer(root, factory) {
  const tierFacts = typeof module === 'object' && module.exports
    ? require('./tier-facts.js')
    : root.SimulatteTierFacts;
  const tierPresentation = typeof module === 'object' && module.exports ? require('./tier-plugin-presentation.js') : root.SimulatteTierPluginPresentation;
  const api = factory(tierFacts, tierPresentation);
  root.SimulatteMultiTierVisualizer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMultiTierVisualizer(tierFacts, tierPresentation) {
  const TIER_CACHE_BASE_URL = tierCacheBaseUrl();

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
      this.currentSolarSystemInterval = null;
      this.currentStarCutoff = null;

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
      this.pluginLayer = tierPresentation?.createLayer({
        width: () => this.width, height: () => this.height, pan: (dx, dy) => { this.panX += dx; this.panY += dy; },
        view: () => ({ panX: this.panX, panY: this.panY, zoom: this.zoom, currentTier: this.currentTier, bounds: this.data?.bounds, projectCountry: (x, y, bounds) => this.projectCountryPoint(x, y, bounds) }),
      });

      this.setupEvents();
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    // United States city fallback used when the national city fixture is not yet fetched.
    static get FALLBACK_US_CITIES() {
      return [
        { id: 'dc', name: 'Washington', lat: 38.9072, lon: -77.0369, state: 'DC', population: 689545 },
        { id: 'ny', name: 'New York', lat: 40.7128, lon: -74.0060, state: 'NY', population: 8336817 },
        { id: 'chi', name: 'Chicago', lat: 41.8781, lon: -87.6298, state: 'IL', population: 2670400 },
        { id: 'hou', name: 'Houston', lat: 29.7604, lon: -95.3698, state: 'TX', population: 2328000 },
        { id: 'phi', name: 'Philadelphia', lat: 39.9526, lon: -75.1652, state: 'PA', population: 1568000 },
        { id: 'phx', name: 'Phoenix', lat: 33.4484, lon: -112.0740, state: 'AZ', population: 1709000 },
        { id: 'la', name: 'Los Angeles', lat: 34.0522, lon: -118.2437, state: 'CA', population: 3898747 },
        { id: 'sfo', name: 'San Francisco', lat: 37.7749, lon: -122.4194, state: 'CA', population: 808988 },
        { id: 'dal', name: 'Dallas', lat: 32.7767, lon: -96.7970, state: 'TX', population: 1343000 },
        { id: 'mia', name: 'Miami', lat: 25.7617, lon: -80.1918, state: 'FL', population: 470914 },
        { id: 'sea', name: 'Seattle', lat: 47.6062, lon: -122.3321, state: 'WA', population: 749256 },
        { id: 'atl', name: 'Atlanta', lat: 33.7490, lon: -84.3880, state: 'GA', population: 498715 },
        { id: 'den', name: 'Denver', lat: 39.7392, lon: -104.9903, state: 'CO', population: 715522 },
        { id: 'boston', name: 'Boston', lat: 42.3601, lon: -71.0589, state: 'MA', population: 675000 }
      ];
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

    async loadTierCache(relativePath, { required = true, context = 'cache', parser = null, fallback = null } = {}) {
      try {
        const response = await fetch(cacheUrl(relativePath));
        if (!response.ok) {
          if (required) {
            throw new Error(`HTTP ${response.status} loading ${context}`);
          }
          return fallback;
        }
        const payload = await response.json();
        return parser ? parser(payload) : payload;
      } catch (e) {
        if (required) {
          throw e;
        }
        console.warn(`[MultiTierVisualizer] optional ${context} missing`, e);
        return fallback;
      }
    }

    async loadTierFacts(relativePath) {
      return this.loadTierCache(relativePath, {
        required: false,
        context: relativePath,
        fallback: null
      });
    }


    getFirstBodyInterval(data) {
      if (!data || typeof data !== 'object') return null;
      for (const key of Object.keys(data)) {
        const body = data[key];
        const points = Array.isArray(body) ? body : body?.ephemeris;
        if (Array.isArray(points) && points.length) {
          const first = points[0]?.datetime;
          const last = points[points.length - 1]?.datetime;
          if (first && last) {
            return `${first} to ${last}`;
          }
        }
      }
      return null;
    }

    extractStateBoundaryGeometries(statePayload) {
      if (!statePayload || !Array.isArray(statePayload.features)) return [];
      return statePayload.features
        .map((feature) => feature?.geometry)
        .filter((geometry) => geometry && Array.isArray(geometry.coordinates));
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
          const [payload, facts] = await Promise.all([
            this.loadTierCache('space/solar-system.json', {
              context: 'solar-system cache',
              parser: (raw) => raw
            }),
            this.loadTierFacts('space/solar-system-facts.json')
          ]);

          this.data = payload;
          this.currentSolarSystemInterval = this.getFirstBodyInterval(this.data);
          if (!this.data || typeof this.data !== 'object') {
            throw new Error('Solar-system payload was not a valid object');
          }
          this.updateHudContent(
            'Solar System',
            'Heliocentric orbits showing planetary positions and distances from Earth.',
            tierFacts.extractSolarSystemStats(facts, {
              bodyCount: this.data ? Object.keys(this.data).length : 0,
              interval: this.currentSolarSystemInterval
            })
          );
        } catch (e) {
          console.error('[MultiTierVisualizer] local solar-system cache missing', e);
          this.data = null;
          this.updateHudContent('Solar System', 'Error loading ephemerides data. Run "solar-system" fetch command first.', {}, '');
        }
      } else if (tierName === 'star-chart') {
        this.zoom = 280.0;
        this.rotX = 0.3;
        this.rotY = -0.5;
        this.updateHudContent('Universe', 'Loading stellar catalog database...', {}, '');
        try {
          const [parsed, facts] = await Promise.all([
            this.loadTierCache('space/star-chart.json', {
              context: 'star catalog cache',
              parser: (raw) => raw
            }),
            this.loadTierFacts('space/universe-facts.json')
          ]);
          // The catalog is { schema, count, stars: [...] }; the renderer wants the array.
          this.data = Array.isArray(parsed) ? parsed : (parsed.stars || []);
          if (!Array.isArray(this.data) || this.data.length === 0) {
            throw new Error('Star catalog was empty or malformed');
          }
          this.currentStarCutoff = parsed?.maxMagnitude;
          this.updateHudContent(
            'Universe',
            'Hipparcos/Yale/Gliese 3D celestial coordinates color-coded by spectral class.',
            tierFacts.extractUniverseStats(facts, {
              visibleStars: this.data?.length || 0,
              magnitudeCutoff: this.currentStarCutoff
            })
          );
        } catch (e) {
          console.error('[MultiTierVisualizer] local star catalog missing', e);
          this.data = null;
          this.updateHudContent('Universe', 'Error loading star catalog. Run "star-chart" fetch command first.', {}, '');
        }
      } else if (tierName === 'world') {
        this.zoom = 1.4;
        this.updateHudContent('Planet', 'Loading global administrative boundaries...', {}, '');
        try {
          const res = await fetch(cacheUrl('world/countries.geojson'));
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} loading local world cache`);
          }
          this.data = await res.json();
          this.updateHudContent('Planet', 'Admin 0 global country borders from Natural Earth geographic assets.', {
            'Database': 'Natural Earth 110m',
            'Countries Features': this.data.features?.length || 0
          });
        } catch (e) {
          console.warn('[MultiTierVisualizer] local world cache missing, trying remote fallback', e);
          try {
            const fallback = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson');
            if (!fallback.ok) {
              throw new Error(`HTTP ${fallback.status} loading remote world cache`);
            }
            this.data = await fallback.json();
            this.updateHudContent('Planet', 'Loaded Global country borders from Natural Earth fallback cache.', {
              'Database': 'Natural Earth 110m (remote fallback)',
              'Countries Features': this.data.features?.length || 0,
              'Source': 'raw.githubusercontent.com'
            });
          } catch (fallbackError) {
            console.error(fallbackError);
            this.updateHudContent('Planet', 'Error loading world outline GeoJSON. Run "world" fetch command first.', {}, '');
          }
        }
      } else if (tierName === 'country') {
        this.zoom = 8.0;
        this.updateHudContent('Country', 'Loading U.S. geography and major cities...', {}, '');
        try {
          const [worldRes, cityRes] = await Promise.all([
            fetch(cacheUrl('world/countries.geojson')),
            this.loadCountryCities(),
          ]);
          const statePayload = await this.loadTierCache('country/us-states.geojson', {
            required: false,
            context: 'US state cache',
            fallback: null
          });
          if (!worldRes.ok) {
            throw new Error(`HTTP ${worldRes.status} loading local world cache`);
          }

          const countries = await worldRes.json();
          const countryFeature = this.findCountryFeature(countries, ['United States of America', 'United States']);
          if (!countryFeature) {
            throw new Error('Could not find United States boundary in local world cache');
          }

          const cityPayload = await cityRes;
          this.data = this.buildCountryTierData(countryFeature, cityPayload, statePayload);
          this.updateHudContent('Country', 'United States administrative boundary and major city nodes.', {
            'Country': countryFeature.properties?.NAME || 'United States',
            'State boundaries': this.data.stateBoundaryCount || 0,
            'City nodes': this.data.nodes.length,
            'Network links': this.data.links.length,
            'Autonomous fleet': `${this.data.agents.length} agents`
          });
        } catch (e) {
          console.warn('[MultiTierVisualizer] local country cache missing, using fallback network', e);
          try {
            this.data = this.buildCountryTierDataFallback();
            this.updateHudContent('Country', 'Using fallback national topology. Local cache unavailable.', {
              'Country': 'United States',
              'City nodes': this.data.nodes.length,
              'Network links': this.data.links.length,
              'Autonomous fleet': `${this.data.agents.length} agents`
            });
          } catch (fallbackError) {
            console.error(fallbackError);
            this.updateHudContent('Country', 'Error loading national geography data. Run the city/world data command first.', {}, '');
          }
        }
      }

      this.loop();
    }

    async loadCountryCities() {
      const response = await fetch(cacheUrl('country/us-cities-v1.json'));
      if (!response.ok) {
        return TierVisualizer.FALLBACK_US_CITIES;
      }
      const parsed = await response.json();
      if (!Array.isArray(parsed)) {
        return TierVisualizer.FALLBACK_US_CITIES;
      }
      const cities = parsed.filter((city) => {
        return city && Number.isFinite(city.lat) && Number.isFinite(city.lon) && city.name;
      }).map((city, index) => {
        return {
          id: city.id || `city-${index}`,
          name: city.name,
          state: city.state || '',
          lat: city.lat,
          lon: city.lon,
          population: city.population || 0
        };
      });
      return cities.length ? cities : TierVisualizer.FALLBACK_US_CITIES;
    }

    buildCountryTierData(countryFeature, cities, statePayload = null) {
      const stateBoundaries = this.extractStateBoundaryGeometries(statePayload);
      const normalizedCities = cities.slice(0, 80).map((city, index) => ({
        id: city.id || `city-${index}`,
        name: city.name || `City ${index + 1}`,
        state: city.state || '',
        lon: Number(city.lon),
        lat: Number(city.lat),
        population: Number(city.population || 0),
        type: index < 3 ? 'hub' : 'city'
      }));
      const nodes = normalizedCities.map((city) => ({
        id: city.id,
        city,
        lon: city.lon,
        lat: city.lat,
        type: city.type
      }));

      const bounds = this.computeFeatureBounds(countryFeature);
      const links = [];
      const linkSet = new Set();
      for (let i = 0; i < nodes.length; i += 1) {
        const source = nodes[i];
        const distances = nodes
          .map((target, targetIndex) => ({ targetIndex, dist: this.haversineKm(source.lat, source.lon, target.lat, target.lon) }))
          .filter((entry) => entry.targetIndex !== i)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 2);
        distances.forEach((entry) => {
          const sourceId = source.id;
          const targetId = nodes[entry.targetIndex].id;
          const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;
          if (!linkSet.has(key)) {
            links.push({ source: i, target: entry.targetIndex });
            linkSet.add(key);
          }
        });
      }

      const agents = [];
      const agentCount = Math.max(24, Math.min(nodes.length * 2, 120));
      for (let i = 0; i < agentCount; i += 1) {
        agents.push({
          node: i % nodes.length,
          progress: (i * 31) % 100 / 100,
          speed: 0.004 + ((i % 7) * 0.0009),
          color: i % 5 === 0 ? '#33ff66' : 'rgba(237, 245, 243, 0.7)'
        });
      }

      return {
        boundary: countryFeature,
        stateBoundaries,
        stateBoundaryCount: stateBoundaries.length,
        nodes,
        links,
        agents,
        bounds
      };
    }

    buildCountryTierDataFallback() {
      return this.buildCountryTierData(
        {
          type: 'Feature',
          properties: { NAME: 'United States' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-125, 24],
              [-67, 24],
              [-67, 49],
              [-125, 49],
              [-125, 24]
            ]]
          }
        },
        TierVisualizer.FALLBACK_US_CITIES
      );
    }

    findCountryFeature(worldData, namesToMatch) {
      if (!worldData || !Array.isArray(worldData.features)) {
        return null;
      }
      const want = namesToMatch.map((value) => String(value).toLowerCase());
      for (const feature of worldData.features) {
        const props = feature.properties || {};
        const values = [
          props.ADMIN,
          props.NAME,
          props.NAME_LONG,
          props.NAME_EN,
        ];
        if (values.some((value) => want.includes(String(value || '').toLowerCase()))) {
          return feature;
        }
      }
      for (const feature of worldData.features) {
        if ((feature.properties && (feature.properties.ADM0_A3 === 'USA' || feature.properties.SOV_A3 === 'USA')) || feature.id === 'USA') {
          return feature;
        }
      }
      return worldData.features[0] || null;
    }

    computeFeatureBounds(feature) {
      const bounds = {
        minLon: Number.POSITIVE_INFINITY,
        maxLon: Number.NEGATIVE_INFINITY,
        minLat: Number.POSITIVE_INFINITY,
        maxLat: Number.NEGATIVE_INFINITY
      };
      const geometry = feature && feature.geometry;
      if (!geometry || !Array.isArray(geometry.coordinates)) {
        return { minLon: -125, maxLon: -66, minLat: 24, maxLat: 49 };
      }

      const coordinates = this.extractPolygonCoordinates(geometry);
      coordinates.forEach((pair) => {
        if (!pair || pair.length < 2) return;
        const lon = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        bounds.minLon = Math.min(bounds.minLon, lon);
        bounds.maxLon = Math.max(bounds.maxLon, lon);
        bounds.minLat = Math.min(bounds.minLat, lat);
        bounds.maxLat = Math.max(bounds.maxLat, lat);
      });

      if (!Number.isFinite(bounds.minLon) || !Number.isFinite(bounds.maxLon) || !Number.isFinite(bounds.minLat) || !Number.isFinite(bounds.maxLat)) {
        return { minLon: -125, maxLon: -66, minLat: 24, maxLat: 49 };
      }
      return bounds;
    }

    extractPolygonCoordinates(geometry) {
      if (geometry.type === 'Polygon') {
        return geometry.coordinates.flat();
      }
      if (geometry.type === 'MultiPolygon') {
        const flat = [];
        geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => ring.forEach((coord) => flat.push(coord))));
        return flat;
      }
      return [];
    }

    projectCountryPoint(lon, lat, bounds) {
      const lonRange = bounds.maxLon - bounds.minLon;
      const latRange = bounds.maxLat - bounds.minLat;
      const lonSpan = lonRange || 1;
      const latSpan = latRange || 1;
      const cx = (bounds.minLon + bounds.maxLon) / 2;
      const cy = (bounds.minLat + bounds.maxLat) / 2;
      const scale = Math.min(this.width / lonSpan, this.height / latSpan) * 0.6 * (this.zoom / 10);
      const x = this.panX + ((lon - cx) * scale);
      const y = this.panY - ((lat - cy) * scale);
      return { x, y };
    }

    haversineKm(lat1, lon1, lat2, lon2) {
      const toRadians = (value) => (value * Math.PI) / 180;
      const earthRadius = 6371;
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);
      const normalizedLat1 = toRadians(lat1);
      const normalizedLat2 = toRadians(lat2);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(normalizedLat1) * Math.cos(normalizedLat2) * Math.sin(dLon / 2) ** 2;
      return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    setPluginPresentations(contributions) {
      return this.pluginLayer ? this.pluginLayer.set(contributions) : Object.freeze([]);
    }

    focusPluginTarget(id) {
      return this.pluginLayer ? this.pluginLayer.focus(id) : false;
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

      if (this.pluginLayer) this.pluginLayer.render(ctx);
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
          ? geometry.coordinates.map((polygon) => polygon[0]).flat(1)
          : geometry.type === 'Polygon'
            ? geometry.coordinates
            : [];
        if (rings.length > 0) {
          ctx.strokeStyle = 'rgba(51, 255, 102, 0.35)';
          ctx.fillStyle = 'rgba(24, 24, 24, 0.65)';
          ctx.lineWidth = 1.2;
          rings.forEach((ring) => {
            if (!Array.isArray(ring) || ring.length < 3) return;
            ctx.beginPath();
            ring.forEach((coord, index) => {
              const projected = this.projectCountryPoint(coord[0], coord[1], bounds);
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
        ctx.strokeStyle = 'rgba(173, 214, 255, 0.35)';
        ctx.lineWidth = 0.7;
        ctx.setLineDash([5, 4]);
        data.stateBoundaries.forEach((geometry) => {
          const rings = geometry.type === 'MultiPolygon'
            ? geometry.coordinates.map((polygon) => polygon[0]).flat(1)
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
              const projected = this.projectCountryPoint(coord[0], coord[1], bounds);
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

        const sourcePt = this.projectCountryPoint(sNode.lon, sNode.lat, bounds);
        const targetPt = this.projectCountryPoint(tNode.lon, tNode.lat, bounds);
        ctx.beginPath();
        ctx.moveTo(sourcePt.x, sourcePt.y);
        ctx.lineTo(targetPt.x, targetPt.y);
        ctx.stroke();
      });

      // 4. Draw Cities
      data.nodes.forEach(node => {
        const pos = this.projectCountryPoint(node.lon, node.lat, bounds);
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
        const pos = this.projectCountryPoint(ax, ay, bounds);

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = agent.color;
        ctx.fill();
      });
    }
  }

  function tierCacheBaseUrl() {
    try {
      return new URL('./data/simulatte/cache/', document.baseURI).toString();
    } catch (_error) {
      return 'https://simulatte.world/data/simulatte/cache/';
    }
  }

  function cacheUrl(relativePath) {
    return new URL(relativePath, TIER_CACHE_BASE_URL).toString();
  }

  // --- API DECLARATION ---
  function createTierVisualizer(canvas, containerId) {
    return new TierVisualizer(canvas, containerId);
  }

  return { createTierVisualizer };
});
