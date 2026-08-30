(function attachMultiTierVisualizer(root, factory) {
  const tierFacts = typeof module === 'object' && module.exports
    ? require('./tier-facts.js')
    : root.SimulatteTierFacts;
  const tierPresentation = typeof module === 'object' && module.exports ? require('./tier-plugin-presentation.js') : root.SimulatteTierPluginPresentation;
  const tierRegistry = typeof module === 'object' && module.exports
    ? require('./tier-registry.js')
    : root.SimulatteTierRegistry;
  const api = factory(
    tierFacts,
    tierPresentation,
    root.SimulatteTierRenderers,
    root.SimulatteTierDataLoader,
    tierRegistry
  );
  root.SimulatteMultiTierVisualizer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMultiTierVisualizer(
  tierFacts,
  tierPresentation,
  tierRenderers,
  tierDataLoaderApi,
  tierRegistry
) {
  const TIER_CACHE_BASE_URL = tierCacheBaseUrl();

  // =========================================================================
  // 2. INTERACTIVE Scales VISUALIZER (Solar, Universe, World, Country)
  // =========================================================================
  class TierVisualizer {
    constructor(canvas, containerId) {
      if (!tierRenderers || !tierDataLoaderApi) throw new Error('simulatte_tier_visualizer_dependency_missing');
      this.lifecycle = new AbortController();
      this.dataLoader = tierDataLoaderApi.createTierDataLoader();
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.container = document.getElementById(containerId);
      this.currentTier = 'city';
      this.active = false;
      this.data = null;
      this.animationFrame = null;
      this.currentSolarSystemInterval = null;
      this.currentStarCutoff = null;
      this.defaultView = null;
      this.viewMode = 'overview';

      // Mouse control variables (zoom & pan/orbit)
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1.0;
      this.isDragging = false;
      this.activePointerId = null;
      this.manualViewListeners = new Set();
      this.dragStartX = 0;
      this.dragStartY = 0;

      // 3D rotation coordinates for Star Chart
      this.rotX = 0.2;
      this.rotY = -0.4;
      this.rotZ = 0;

      this.width = 0;
      this.height = 0;
      this.frameCount = 0;
      this.frameCpuMs = [];
      this.canvas.__simulatteCaptureRenderPixels = () => captureCanvasPixels(this.canvas, this.ctx, this.frameCount);
      this.canvas.__simulatteRenderReceipt = () => canvas2dRenderReceipt(this.frameCount, this.frameCpuMs);

      this.hudElement = null;
      this.pluginLayer = tierPresentation?.createLayer({
        width: () => this.width, height: () => this.height, pan: (dx, dy) => { this.panX += dx; this.panY += dy; },
        fit: (target, system) => this.fitPluginPresentationTarget(target, system),
        view: () => ({
          panX: this.panX,
          panY: this.panY,
          zoom: this.zoom,
          rotX: this.rotX,
          rotY: this.rotY,
          currentTier: this.currentTier,
          bounds: this.data?.bounds,
          projectCountry: (x, y, bounds) => this.projectCountryPoint(x, y, bounds),
        }),
      });

      this.setupEvents();
      this.resize();
      this.on(window, 'resize', () => this.resize());
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
      c.style.touchAction = 'none';
      this.on(c, 'pointerdown', (e) => {
        if (this.currentTier === 'city') return;
        if (e.isPrimary === false || this.activePointerId !== null) return;
        e.preventDefault();
        this.notifyManualView('pan-orbit');
        this.isDragging = true;
        this.activePointerId = e.pointerId;
        c.setPointerCapture?.(e.pointerId);
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
      });

      this.on(c, 'pointermove', (e) => {
        if (!this.isDragging || e.pointerId !== this.activePointerId) return;
        e.preventDefault();
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        if (this.currentTier === 'star-chart' || this.currentTier === 'solar-system') {
          // Orbit coordinate-native evidence in 3D.
          this.rotY += dx * 0.005;
          this.rotX += dy * 0.005;
        } else {
          // Pan planar map tiers.
          this.panX += dx;
          this.panY += dy;
        }
      });

      const finishPointerDrag = (e) => {
        if (e.pointerId !== this.activePointerId) return;
        if (c.hasPointerCapture?.(e.pointerId)) c.releasePointerCapture(e.pointerId);
        this.isDragging = false;
        this.activePointerId = null;
      };
      this.on(c, 'pointerup', finishPointerDrag);
      this.on(c, 'pointercancel', finishPointerDrag);

      this.on(c, 'wheel', (e) => {
        if (this.currentTier === 'city') return;
        this.notifyManualView('zoom');
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

    notifyManualView(control) {
      this.manualViewListeners.forEach((listener) => listener({ control, mode: 'free', targetIds: [] }));
    }

    onManualView(listener) {
      this.manualViewListeners.add(listener);
      return () => this.manualViewListeners.delete(listener);
    }

    on(target, type, handler, options = {}) {
      target.addEventListener(type, handler, { ...options, signal: this.lifecycle.signal });
    }

    destroy() {
      this.stop();
      this.removeHud();
      delete this.canvas.__simulatteCaptureRenderPixels;
      delete this.canvas.__simulatteRenderReceipt;
      this.lifecycle.abort();
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

    setExperienceSummary(summary) {
      if (!summary) return;
      this.updateHudContent(summary.title, summary.description, summary.stats, summary.help);
      this.hudElement.dataset.experienceId = summary.experienceId;
    }

    async loadTierCache(relativePath, { required = true, context = 'cache', parser = null, fallback = null } = {}) {
      try {
        const response = await this.dataLoader.fetch(cacheUrl(relativePath));
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
      if (statePayload?.features?.length > 0) return statePayload.features.map((f) => f?.geometry).filter((g) => g?.coordinates);
      const regions = [[-79,-67,39,47],[-81,-73,36,41],[-90,-75,25,36],[-97,-80,37,49],[-106,-89,26,37],[-116,-104,41,49],[-115,-103,31,41],[-125,-116,42,49],[-124,-114,32,42]];
      return regions.map(([x1, x2, y1, y2]) => ({ type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]] }));
    }

    async loadTier(tierName) {
      this.stop();
      this.currentTier = tierName;
      const tier = tierRegistry.tierDefinition(tierName);
      if (!tier) throw new Error(`simulatte_unknown_tier: ${tierName}`);
      this.canvas.hidden = !tier.canvasVisible;

      if (tierName === 'city') {
        this.removeHud();
        return;
      }

      this.active = true;
      this.createHud();

      // Reset transforms
      this.zoom = Number(tier.initialZoom || 1);
      this.panX = this.width / 2;
      this.panY = this.height / 2;

      if (tierName === 'datacenter') {
        this.updateHudContent('Datacenter', 'Loading 256-GPU cluster topology and thermal model...', {}, '');
        try {
          this.data = await this.loadTierCache('../worlds/datacenter-supercluster-v1.json', {
            context: 'datacenter world model'
          });
          this.updateHudContent(
            'Datacenter',
            '3D physical facility view: 32 liquid-cooled 42U racks, 256 GPUs, NVLink mesh, and InfiniBand spine-leaf.',
            tierFacts.extractDatacenterStats ? tierFacts.extractDatacenterStats(this.data) : {}
          );
        } catch (err) {
          console.error('[MultiTierVisualizer] error loading datacenter tier data', err);
          this.data = { racks: Array.from({ length: 32 }, (_, i) => ({ id: `rack-${i}`, avgTempC: 54 })) };
        }
      } else if (tierName === 'solar-system') {
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
        this.updateHudContent('Planet', 'Loading global administrative boundaries...', {}, '');
        try {
          const res = await this.dataLoader.fetch(cacheUrl('world/countries.geojson'));
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} loading local world cache`);
          }
          this.data = await res.json();
          this.updateHudContent('Planet', 'Admin 0 global country borders from Natural Earth geographic assets.', {
            'Database': 'Natural Earth 110m',
            'Countries Features': this.data.features?.length || 0
          });
        } catch (e) {
          console.error('[MultiTierVisualizer] governed world cache missing', e);
          this.data = null;
          this.updateHudContent('Planet', 'Error loading world outline GeoJSON. Run "world" fetch command first.', {}, '');
        }
      } else if (tierName === 'country') {
        this.updateHudContent('Country', 'Loading U.S. geography and major cities...', {}, '');
        try {
          const [worldRes, cityRes] = await Promise.all([
            this.dataLoader.fetch(cacheUrl('world/countries.geojson')),
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

      this.defaultView = Object.freeze({
        zoom: this.zoom,
        panX: this.panX,
        panY: this.panY,
        rotX: this.rotX,
        rotY: this.rotY,
        rotZ: this.rotZ,
      });
      this.loop();
    }

    async loadCountryCities() {
      const response = await this.dataLoader.fetch(cacheUrl('country/us-cities-v1.json'));
      if (!response.ok) {
        return TierVisualizer.FALLBACK_US_CITIES;
      }
      const parsed = await response.json();
      const cities = Array.isArray(parsed) ? parsed : parsed?.cities;
      if (!Array.isArray(cities) || (!Array.isArray(parsed) && parsed.schema !== 'simulatte.countryCityCache.v1')) {
        return TierVisualizer.FALLBACK_US_CITIES;
      }
      const normalized = cities.filter((city) => {
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
      return normalized.length ? normalized : TierVisualizer.FALLBACK_US_CITIES;
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

    fitPluginPresentationTarget(target, coordinateSystem) {
      const countryBounds = this.data?.bounds;
      const evidenceBounds = target?.bounds;
      const fitted = this.currentTier === 'country' && coordinateSystem === 'wgs84'
        ? countryEvidenceView({
          countryBounds,
          evidenceBounds,
          width: this.width,
          height: this.height,
        })
        : coordinateEvidenceView({
          coordinates: target?.coordinates || [],
          coordinateSystem,
          width: this.width,
          height: this.height,
          rotX: this.rotX,
          rotY: this.rotY,
          viewMode: this.viewMode,
        });
      if (!fitted) return false;
      this.zoom = fitted.zoom;
      this.panX = fitted.panX;
      this.panY = fitted.panY;
      return true;
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

    setPluginPresentations(contributions, options = {}) {
      return this.pluginLayer ? this.pluginLayer.set(contributions, options) : Object.freeze([]);
    }

    pluginPresentationReceipt() {
      return this.pluginLayer?.receipt() || Object.freeze([]);
    }

    pluginCameraTargets() {
      return this.pluginLayer?.targets() || Object.freeze([]);
    }

    focusPluginTarget(id) {
      return this.pluginLayer ? this.pluginLayer.focus(id) : false;
    }

    setViewMode(mode) {
      const allowed = ['overview', 'follow', 'pov', 'top', 'free', 'compare'];
      if (!allowed.includes(mode)) throw new Error(`simulatte_tier_view_mode_invalid: ${mode}`);
      this.viewMode = mode;
      this.canvas.dataset.viewMode = mode;
      if (mode === 'overview') this.resetView();
      if (mode === 'top' && ['solar-system', 'star-chart'].includes(this.currentTier)) {
        this.rotX = 0;
        this.rotY = 0;
      }
      return mode;
    }

    resetView() {
      if (!this.defaultView) return false;
      Object.assign(this, this.defaultView);
      return true;
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
      const cpuStartedAt = performance.now();
      const { ctx, width, height } = this;
      ctx.clearRect(0, 0, width, height);

      // Render dark cosmic background
      ctx.fillStyle = '#060606';
      ctx.fillRect(0, 0, width, height);

      if (!this.data) {
        this.recordFrame(cpuStartedAt);
        return;
      }

      ctx.save();

      const rendererMethod = tierRegistry.tierDefinition(this.currentTier)?.rendererMethod;
      if (rendererMethod) {
        const renderer = tierRenderers[rendererMethod];
        if (typeof renderer !== 'function') {
          throw new Error(`simulatte_tier_renderer_missing: ${rendererMethod}`);
        }
        renderer(this);
      }

      if (this.pluginLayer) this.pluginLayer.render(ctx);
      ctx.restore();
      this.recordFrame(cpuStartedAt);
    }

    recordFrame(cpuStartedAt) {
      this.frameCount += 1;
      if (this.frameCpuMs.length >= 512) this.frameCpuMs.shift();
      this.frameCpuMs.push(performance.now() - cpuStartedAt);
      this.canvas.dataset.frameCount = String(this.frameCount);
    }

    // --- DRAW SOLAR SYSTEM ---
    drawSolarSystem() { return tierRenderers.drawSolarSystem(this); }

    // --- DRAW STAR CHART (3D PROJECTION) ---
    drawStarChart() { return tierRenderers.drawStarChart(this); }

    // --- DRAW WORLD (GEOJSON COUNTRIES) ---
    drawWorld() { return tierRenderers.drawWorld(this); }

    // --- DRAW COUNTRY (TRANSIT GRAPH) ---
    drawCountry() { return tierRenderers.drawCountry(this); }
  }

  function tierCacheBaseUrl() {
    try {
      return new URL('./data/simulatte/cache/', document.baseURI).toString();
    } catch (_error) {
      return 'http://localhost/data/simulatte/cache/';
    }
  }

  function cacheUrl(relativePath) {
    return new URL(relativePath, TIER_CACHE_BASE_URL).toString();
  }

  function countryEvidenceView({ countryBounds, evidenceBounds, width, height }) {
    if (
      !countryBounds ||
      !evidenceBounds ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      ![
        countryBounds.minLon, countryBounds.maxLon, countryBounds.minLat, countryBounds.maxLat,
        evidenceBounds.minX, evidenceBounds.maxX, evidenceBounds.minY, evidenceBounds.maxY,
      ].every(Number.isFinite)
    ) return null;
    const countryLonSpan = Math.max(1, countryBounds.maxLon - countryBounds.minLon);
    const countryLatSpan = Math.max(1, countryBounds.maxLat - countryBounds.minLat);
    const evidenceLonSpan = Math.max(2, evidenceBounds.maxX - evidenceBounds.minX) * 1.18;
    const evidenceLatSpan = Math.max(2, evidenceBounds.maxY - evidenceBounds.minY) * 1.18;
    const availableWidth = width * (width < 600 ? 0.84 : 0.58);
    const availableHeight = height * (height < 700 ? 0.48 : 0.58);
    const desiredScale = Math.min(availableWidth / evidenceLonSpan, availableHeight / evidenceLatSpan);
    const scalePerZoom = Math.min(width / countryLonSpan, height / countryLatSpan) * 0.06;
    const zoom = Math.max(0.01, Math.min(250, desiredScale / Math.max(scalePerZoom, 0.0001)));
    const countryCenterX = (countryBounds.minLon + countryBounds.maxLon) / 2;
    const countryCenterY = (countryBounds.minLat + countryBounds.maxLat) / 2;
    const targetCenterX = (evidenceBounds.minX + evidenceBounds.maxX) / 2;
    const targetCenterY = (evidenceBounds.minY + evidenceBounds.maxY) / 2;
    const scale = scalePerZoom * zoom;
    return Object.freeze({
      zoom,
      panX: width / 2 - (targetCenterX - countryCenterX) * scale,
      panY: height / 2 + (targetCenterY - countryCenterY) * scale,
    });
  }

  function coordinateEvidenceView({
    coordinates,
    coordinateSystem,
    width,
    height,
    rotX = 0,
    rotY = 0,
    viewMode = 'overview',
  }) {
    if (
      !Array.isArray(coordinates)
      || !coordinates.length
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || width <= 0
      || height <= 0
    ) return null;
    const projected = coordinates.map((position) => tierPresentation.projectPoint(
      position,
      coordinateSystem,
      { panX: 0, panY: 0, zoom: 1, rotX, rotY, currentTier: null },
    ));
    if (!projected.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
    const minimumX = Math.min(...projected.map((point) => point.x));
    const maximumX = Math.max(...projected.map((point) => point.x));
    const minimumY = Math.min(...projected.map((point) => point.y));
    const maximumY = Math.max(...projected.map((point) => point.y));
    const coverage = viewMode === 'follow' || viewMode === 'pov'
      ? 0.38
      : viewMode === 'compare'
        ? 0.62
        : 0.76;
    const spanX = Math.max(0.000001, maximumX - minimumX);
    const spanY = Math.max(0.000001, maximumY - minimumY);
    const zoom = Math.max(0.01, Math.min(250, Math.min(
      width * coverage / spanX,
      height * coverage / spanY,
    )));
    const centerX = (minimumX + maximumX) / 2;
    const centerY = (minimumY + maximumY) / 2;
    return Object.freeze({
      zoom,
      panX: width / 2 - centerX * zoom,
      panY: height / 2 - centerY * zoom,
    });
  }

  // --- API DECLARATION ---
  function createTierVisualizer(canvas, containerId) {
    return new TierVisualizer(canvas, containerId);
  }

  function captureCanvasPixels(canvas, context, frameCount) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    let binary = '';
    for (let offset = 0; offset < image.data.length; offset += 32768) {
      binary += String.fromCharCode(...image.data.subarray(offset, offset + 32768));
    }
    return {
      schema: 'simulatte.tierRenderPixels.v1',
      width: canvas.width,
      height: canvas.height,
      format: 'rgba8unorm',
      sourceBackend: 'canvas2d',
      sourceFormat: 'rgba8unorm',
      sourceFrameCount: frameCount,
      rgbaBase64: btoa(binary),
    };
  }

  function canvas2dRenderReceipt(frameCount, frameCpuMs) {
    return {
      backend: 'canvas2d',
      frameCount,
      renderCpu: {
        basis: 'main-thread-canvas2d-render',
        sampleCount: frameCpuMs.length,
        totalMs: frameCpuMs.reduce((sum, value) => sum + value, 0),
        maxMs: Math.max(0, ...frameCpuMs),
      },
    };
  }

  return { canvas2dRenderReceipt, captureCanvasPixels, createTierVisualizer, coordinateEvidenceView, countryEvidenceView };
});
