(function attachWorldTiersBoot(root, factory) {
  const api = factory();
  root.SimulatteWorldTiersBoot = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTiersBoot() {
  const TIER_LABELS = {
    city: 'City',
    country: 'Country',
    world: 'Planet',
    'solar-system': 'Solar System',
    'star-chart': 'Universe',
  };

  // The URL is the source of truth for the active scale. ?tier=<key> drives the boot
  // and keeps the toolbar dropdown in sync; changing the dropdown rewrites it in place.
  function readTierFromUrl(view) {
    try {
      const tier = new URL(view.location.href).searchParams.get('tier');
      return tier && TIER_LABELS[tier] ? tier : null;
    } catch (_error) { return null; }
  }

  function writeTierParam(view, tier) {
    try {
      const url = new URL(view.location.href);
      if (url.searchParams.get('tier') === tier) return;
      url.searchParams.set('tier', tier);
      view.history.replaceState(view.history.state, '', url.toString());
    } catch (_error) { /* URL sync is best-effort */ }
  }

  // Reflect the active scale in the toolbar label immediately on boot — before the
  // heavy City load — so the dropdown matches the URL instead of sitting on the
  // "Select scale" placeholder for the whole load (selectWorldTier only runs at the end).
  function setTierLabel(tier) {
    try {
      const label = document.getElementById('world-tier-label');
      if (label && TIER_LABELS[tier]) label.textContent = TIER_LABELS[tier];
    } catch (_error) { /* best-effort */ }
  }

  // Wire the toolbar tier dropdown and build the selectWorldTier router onto an
  // already-started app. Returns selectWorldTier so the caller can route to the
  // initial tier. `ctx` supplies the start() closure dependencies.
  function wireTierControls(ctx) {
    const { elements, stopLoop, tierVisualizer, profileSelectUi, reloadForCity = false } = ctx;

    function closeWorldTierDropdown() {
      elements.worldTierControl.classList.remove('open');
      elements.worldTierTrigger.setAttribute('aria-expanded', 'false');
      elements.worldTierOptions.hidden = true;
    }

    elements.worldTierTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (elements.worldTierControl.classList.contains('open')) {
        closeWorldTierDropdown();
      } else {
        elements.worldTierControl.classList.add('open');
        elements.worldTierTrigger.setAttribute('aria-expanded', 'true');
        elements.worldTierOptions.hidden = false;
      }
    });
    window.addEventListener('click', () => closeWorldTierDropdown());

    const tierOptions = elements.worldTierOptions.querySelectorAll('.select-option');
    tierOptions.forEach((opt) => {
      opt.addEventListener('click', async (event) => {
        event.stopPropagation();
        writeTierParam(window, opt.dataset.value);
        await selectWorldTier(opt.dataset.value);
        closeWorldTierDropdown();
      });
    });

    async function selectWorldTier(tier) {
      // In the lightweight world-explorer, the full City engine was never loaded, so
      // switching to City reloads into the URL-driven full boot instead of a blank canvas.
      if (reloadForCity && tier === 'city') {
        const url = new URL(window.location.href);
        url.searchParams.set('tier', 'city');
        window.location.assign(url.toString());
        return;
      }
      // Hide the landing page if still visible.
      elements.worldTiersLandingPage.classList.add('hidden');
      // Stop the city loop when routing to a non-city scale.
      if (tier !== 'city') stopLoop();
      tierOptions.forEach((opt) => opt.classList.toggle('selected', opt.dataset.value === tier));
      elements.worldTierLabel.textContent = TIER_LABELS[tier] || 'Select scale';

      // Scope the secondary "plugins" dropdown to the active world. Every current
      // plugin is a City plugin, so other scales show a disabled "none yet" state.
      const cityPlugins = tier === 'city';
      elements.applicationProfileControl.classList.toggle('is-empty', !cityPlugins);
      elements.applicationProfileTrigger.disabled = !cityPlugins;
      elements.applicationProfileTrigger.setAttribute('aria-disabled', String(!cityPlugins));
      if (cityPlugins) {
        profileSelectUi?.sync();
      } else {
        elements.applicationProfileControl.classList.remove('open');
        elements.applicationProfileTrigger.setAttribute('aria-expanded', 'false');
        elements.applicationProfileOptions.hidden = true;
        elements.applicationProfileLabel.textContent = 'No plugins for this scale';
      }

      await tierVisualizer.loadTier(tier);
    }

    return selectWorldTier;
  }

  // Show the tier selector immediately and gate asset loading until the visitor
  // picks a tier. Hovering the tier cards parallaxes the wordmark + accent lines.
  // Lightweight standalone explorer for the non-City scales: it renders the tier's own
  // 2D visualizer straight onto the overlay canvas with just that tier's small dataset,
  // skipping the ~80 MB City load and the WebGPU renderer entirely.
  async function bootWorldExplorer(ctx, tier) {
    const { collectElements, setJourneyPhase, setRuntimeStatus, createTierVisualizer } = ctx;
    const elements = collectElements();
    document.body.classList.add('world-explorer');
    setJourneyPhase('loading');
    setRuntimeStatus?.(elements, 'Loading world', 'loading');
    const tierVisualizer = createTierVisualizer(elements.overlayCanvas, 'world-tier-control');
    const selectWorldTier = wireTierControls({
      elements, stopLoop: () => {}, tierVisualizer, profileSelectUi: null, reloadForCity: true,
    });
    await selectWorldTier(tier);
    setJourneyPhase('ready');
    setRuntimeStatus?.(elements, 'Ready', 'active');
  }

  async function bootLanding(ctx) {
    const { startApp } = ctx;
    // A non-City scale boots the lightweight explorer instead of the full City engine.
    const routeTier = (tier) => (tier !== 'city' && ctx.createTierVisualizer
      ? bootWorldExplorer(ctx, tier)
      : startApp(tier));
    const landing = document.getElementById('world-tiers-landing-page');
    const view = (landing && landing.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);

    // The URL decides whether to show the picker: if it already selects a scale
    // (?tier=) or an experience (?profile=, which implies the city scale), skip the
    // landing and boot that scale in place. The dropdowns then reflect the same URL
    // state. Same direct-boot fallback if the landing markup is missing.
    let hasProfile = false;
    try { hasProfile = view ? new URL(view.location.href).searchParams.has('profile') : false; }
    catch (_error) { hasProfile = false; }
    const urlTier = view ? readTierFromUrl(view) : null;
    if (!landing || urlTier || hasProfile) {
      const tier = urlTier || 'city';
      if (view) writeTierParam(view, tier);
      setTierLabel(tier);
      if (landing) landing.classList.add('hidden');
      await routeTier(tier);
      return;
    }
    let chosen = false;
    const chooseTier = async (tier) => {
      if (chosen) return;
      chosen = true;
      // Record the chosen scale in the URL so the dropdown and reloads stay in sync.
      if (view) writeTierParam(view, tier);
      setTierLabel(tier);
      // Fade the splash out fast (CSS ~120ms) and let it fully clear BEFORE kicking off
      // the heavy asset load. Otherwise the load blocks the main thread mid-fade and the
      // loading screen behind bleeds through a half-faded splash.
      landing.classList.add('hidden');
      await new Promise((resolve) => view.setTimeout(resolve, 160));
      await routeTier(tier);
    };

    // Parallax: track the pointer across the tier grid and hand a normalized
    // offset (-1..1 on each axis) to the wordmark via CSS custom properties.
    // The header layers translate by different magnitudes for a depth effect.
    const grid = landing.querySelector('.tier-cards-grid');
    const cards = Array.from(landing.querySelectorAll('.tier-card'));
    const setParallax = (px, py) => {
      landing.style.setProperty('--parallax-x', px.toFixed(3));
      landing.style.setProperty('--parallax-y', py.toFixed(3));
    };
    if (grid) {
      grid.addEventListener('mousemove', (event) => {
        const rect = grid.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const py = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        landing.classList.add('is-parallax');
        setParallax(px, py);
      });
      grid.addEventListener('mouseleave', () => {
        landing.classList.remove('is-parallax');
        setParallax(0, 0);
      });
    }

    cards.forEach((card) => {
      card.addEventListener('click', () => { void chooseTier(card.dataset.tier); });
    });
  }

  return { wireTierControls, bootLanding };
});
