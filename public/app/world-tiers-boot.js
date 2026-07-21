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

  // Wire the toolbar tier dropdown and build the selectWorldTier router onto an
  // already-started app. Returns selectWorldTier so the caller can route to the
  // initial tier. `ctx` supplies the start() closure dependencies.
  function wireTierControls(ctx) {
    const { elements, stopLoop, tierVisualizer, profileSelectUi } = ctx;

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
        await selectWorldTier(opt.dataset.value);
        closeWorldTierDropdown();
      });
    });

    async function selectWorldTier(tier) {
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
  async function bootLanding(ctx) {
    const { startApp } = ctx;
    const landing = document.getElementById('world-tiers-landing-page');
    const view = (landing && landing.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);

    // If the visitor already has a specific experience selected (?profile=...) — e.g.
    // after switching the application-profile dropdown, which reloads the page — skip
    // the scale picker and boot the city app in place, so it loads the experience
    // instead of bouncing back to the landing screen. Same fallback if the landing
    // markup is missing for any reason.
    let hasProfile = false;
    try { hasProfile = view ? new URL(view.location.href).searchParams.has('profile') : false; }
    catch (_error) { hasProfile = false; }
    if (!landing || hasProfile) {
      if (landing) landing.classList.add('hidden');
      await startApp('city');
      return;
    }
    let chosen = false;
    const chooseTier = async (tier) => {
      if (chosen) return;
      chosen = true;
      // Fade the splash out fast (CSS ~120ms) and let it fully clear BEFORE kicking off
      // the heavy asset load. Otherwise the load blocks the main thread mid-fade and the
      // loading screen behind bleeds through a half-faded splash.
      landing.classList.add('hidden');
      await new Promise((resolve) => view.setTimeout(resolve, 160));
      await startApp(tier);
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
