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
    const { elements, stopLoop, tierVisualizer, profileSelectUi, getLandingAnimator } = ctx;

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
      // Hide the landing page and stop the symmetry animation if still visible.
      elements.worldTiersLandingPage.classList.add('hidden');
      getLandingAnimator()?.stop();
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
  // picks a tier. The symmetry animation is the only thing that runs before a pick.
  async function bootLanding(ctx) {
    const { MultiTier, startApp, setLandingAnimator } = ctx;
    const landing = document.getElementById('world-tiers-landing-page');
    const symmetryCanvas = document.getElementById('symmetry-canvas');
    if (!landing || !symmetryCanvas) { await startApp('city'); return; }

    const landingAnimator = MultiTier.createSymmetryAnimator(symmetryCanvas);
    setLandingAnimator(landingAnimator);
    landingAnimator.start();

    let chosen = false;
    const chooseTier = async (tier) => {
      if (chosen) return;
      chosen = true;
      landing.classList.add('hidden');
      landingAnimator.stop();
      await startApp(tier);
    };

    landing.querySelectorAll('.tier-card').forEach((card) => {
      card.addEventListener('mousemove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
      });
      card.addEventListener('mouseenter', () => landingAnimator.setHoveredTier(card.dataset.tier));
      card.addEventListener('mouseleave', () => landingAnimator.setHoveredTier(null));
      card.addEventListener('click', () => { void chooseTier(card.dataset.tier); });
    });
    landing.querySelector('.landing-skip-btn')?.addEventListener('click', () => { void chooseTier('city'); });
  }

  return { wireTierControls, bootLanding };
});
