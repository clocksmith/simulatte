(function attachAppShell(root, factory) {
  const lifecycle = typeof module === 'object' && module.exports ? require('./mount-lifecycle.js') : root.SimulatteMountLifecycle;
  const api = factory(lifecycle);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAppShell = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAppShellModule(lifecycleApi) {
  if (!lifecycleApi) throw new Error('app_shell_lifecycle_missing');
  function createAppShell({ router, boot, landing, documentationLink = null, updateExperienceDocLink, labelForProfile, tierLabels: TIER_LABELS }) {
    let current = null; // { tier, experience, dispose }
    let pending = null;
    let generation = 0;

    function cancelPending() {
      pending?.abort();
      pending = null;
    }

    async function teardown() {
      if (!current) return;
      const mounted = current;
      current = null;
      try { await mounted.dispose?.(); } catch (_error) { /* teardown is best-effort */ }
    }

    function beginRouteLoad(route) {
      try {
        document.body.dataset.routeLoading = 'true';
        document.body.dataset.journeyPhase = 'loading';
        const status = document.getElementById('loading-status');
        if (status) status.textContent = route?.experience ? 'Loading experience' : 'Loading world';
        clearExperienceSummary();
      } catch (_error) { /* no document */ }
    }

    function finishRouteLoad() {
      try {
        delete document.body.dataset.routeLoading;
        if (document.body.dataset.journeyPhase === 'loading') {
          document.body.dataset.journeyPhase = 'ready';
        }
      } catch (_error) { /* no document */ }
    }

    function isLifecycleNeutralRouteUpdate(route) {
      if (!current || route.experience !== current.experience) return false;
      const currentRoute = currentRouteState(current);
      const resolvedRoute = {
        ...route,
        world: route.world || currentRoute.world,
        profile: route.profile || currentRoute.profile,
        camera: route.camera || currentRoute.camera,
      };
      return router.hrefFor({
        ...currentRoute,
        camera: resolvedRoute.camera,
      }) === router.hrefFor(resolvedRoute);
    }

    function showLanding() {
      landing?.classList.remove('hidden');
      updateExperienceDocLink(documentationLink, null);
      try {
        finishRouteLoad();
        document.body.dataset.journeyPhase = 'ready';
        document.body.classList.remove('world-explorer');
        delete document.body.dataset.experienceShell;
        delete document.body.dataset.experienceId;
        delete document.body.dataset.experienceKind;
        const summary=document.getElementById('experience-summary');
        const cameraControls=document.getElementById('camera-controls');
        if(summary)summary.hidden=true;
        if(cameraControls)cameraControls.hidden=true;
      } catch (_error) { /* no document */ }
    }

    async function renderRoute(route) {
      const generationAtStart = ++generation;
      let acceptedRoute = route;
      if (!route || !route.tier) {
        cancelPending();
        showLanding();
        await teardown();
        return;
      }
      if (current && current.tier === route.tier) {
        if (route.experience === current.experience
          && router.hrefFor({
            tier: current.tier,
            experience: current.experience,
            world: current.world,
            profile: current.profile,
            camera: current.camera,
            simulation: current.simulation || null,
          }) === router.hrefFor(route)) {
          router.canonicalize(currentRouteState(current));
          return;
        }
        if (route.experience === current.experience && typeof current.updateRoute === 'function') {
          cancelPending();
          const requiresLoad = !isLifecycleNeutralRouteUpdate(route);
          if (requiresLoad) beginRouteLoad(route);
          const updated = await current.updateRoute(route);
          if (generationAtStart !== generation) return;
          Object.assign(current, updated || {});
          router.canonicalize(currentRouteState(current));
          if (requiresLoad) finishRouteLoad();
          return;
        }
        if (route.experience === current.experience && typeof current.updateSimulation === 'function') {
          cancelPending();
          beginRouteLoad(route);
          const updated = await current.updateSimulation(route.simulation || null);
          if (generationAtStart !== generation) return;
          if (updated) current.simulation = updated;
          const canonical = { tier: current.tier, experience: current.experience };
          if (current.simulation) canonical.simulation = current.simulation;
          router.canonicalize(canonical);
          finishRouteLoad();
          return;
        }
      }
      cancelPending();
      beginRouteLoad(route);
      await teardown();
      if (generationAtStart !== generation) return;
      landing?.classList.add('hidden');
      // The URL already decided the tier, so drive the toolbar from it synchronously — before the
      // async load — so the scale/experience controls never disagree with the address bar (e.g.
      // "/city" must never show "Select scale" while loading).
      reflectRoute(route);
      const attempt = lifecycleApi.create();
      pending = attempt;
      let booted;
      try {
        booted = await boot(route.tier, route.experience || null, {
          signal: attempt.signal,
          simulation: route.simulation || null,
          routeState: route,
        });
      } catch (error) {
        if (attempt.signal.aborted || generationAtStart !== generation) return;
        // A genuinely unknown/removed experience id should not strand the visitor. Any failure
        // inside a known experience must remain visible instead of silently booting a different
        // product and producing evidence for the wrong route.
        if (route.experience && (error?.code === 'application_profile_unknown' || error?.code === 'tier_profile_unknown')) {
          try {
            booted = await boot(route.tier, null, {
              signal: attempt.signal,
              simulation: route.simulation || null,
              routeState: { tier: route.tier, experience: null, world: null, profile: null, camera: route.camera, simulation: route.simulation || null },
            });
            acceptedRoute = { tier: route.tier, experience: null, world: null, profile: null, camera: route.camera, simulation: route.simulation || null };
          } catch (retryError) {
            if (attempt.signal.aborted || generationAtStart !== generation) return;
            if (pending === attempt) pending = null;
            attempt.abort(retryError);
            showLanding();
            throw retryError;
          }
        } else {
          if (pending === attempt) pending = null;
          attempt.abort(error);
          showLanding();
          throw error;
        }
      }
      if (pending === attempt) pending = null;
      if (attempt.signal.aborted || generationAtStart !== generation) {
        try { await booted.dispose?.(); } catch (_error) { /* superseded */ }
        return;
      }
      try {
        validateResolvedRoute(acceptedRoute, booted);
      } catch (error) {
        attempt.abort(error);
        try { await booted.dispose?.(); } finally { showLanding(); }
        throw error;
      }
      current = {
        tier: booted.tier,
        experience: booted.experience,
        world: booted.world,
        profile: booted.profile || booted.experience,
        camera: booted.camera,
        simulation: booted.simulation || route.simulation || null,
        dispose: booted.dispose,
        updateRoute: booted.updateRoute,
        updateSimulation: booted.updateSimulation,
      };
      reflectRoute(current);
      router.canonicalize(currentRouteState(current));
      finishRouteLoad();
    }

    function currentRouteState(value) {
      const route = {
        tier: value.tier,
        experience: value.experience,
        world: value.world || null,
        profile: value.profile || value.experience || null,
        camera: value.camera || null,
      };
      if (value.simulation) route.simulation = value.simulation;
      return route;
    }

    function validateResolvedRoute(route, booted) {
      const resolvedProfile = booted.profile || booted.experience;
      if (route.profile && route.profile !== resolvedProfile) throw routeResolutionError('route_profile_resolution_mismatch', `Requested profile ${route.profile}; resolved ${resolvedProfile}`);
      if (route.world && route.world !== booted.world) throw routeResolutionError('route_world_resolution_mismatch', `Requested world ${route.world}; resolved ${booted.world}`);
      if (route.camera && route.camera !== booted.camera) throw routeResolutionError('route_camera_resolution_mismatch', `Requested camera ${route.camera}; resolved ${booted.camera}`);
    }

    function routeResolutionError(code, message) {
      const error = new Error(message);
      error.code = code;
      return error;
    }

    function reflectRoute(route) {
      updateExperienceDocLink(documentationLink, route.experience);
      try {
        const label = document.getElementById('world-tier-label');
        if (label && TIER_LABELS[route.tier]) label.textContent = TIER_LABELS[route.tier];
        document.querySelectorAll('#world-tier-options .select-option').forEach((option) => option.classList.toggle('selected', option.dataset.value === route.tier));
        const experienceLabel = document.getElementById('application-profile-label');
        if (experienceLabel) experienceLabel.textContent = route.experience ? labelForProfile(route.experience) : 'Loading experience';
      } catch (_error) { /* toolbar not present yet */ }
    }

    function clearExperienceSummary() {
      try {
        const summary = document.getElementById('experience-summary');
        const stats = document.getElementById('experience-summary-stats');
        if (summary) {
          summary.hidden = true;
          delete summary.dataset.experienceId;
        }
        stats?.replaceChildren();
      } catch (_error) { /* no document */ }
    }

    function wireLanding() {
      if (!landing) return;
      const grid = landing.querySelector('.hex-constellation-container') || landing.querySelector('.tier-cards-grid');
      const setParallax = (x, y) => { landing.style.setProperty('--parallax-x', x.toFixed(3)); landing.style.setProperty('--parallax-y', y.toFixed(3)); };
      grid?.addEventListener('mousemove', (event) => { const rect = grid.getBoundingClientRect(); landing.classList.add('is-parallax'); setParallax(((event.clientX - rect.left) / rect.width - .5) * 2, ((event.clientY - rect.top) / rect.height - .5) * 2); });
      landing.addEventListener('click', (event) => { const card = event.target && event.target.closest && (event.target.closest('.hex-satellite') || event.target.closest('.tier-card')); if (card && card.dataset.tier) void router.navigate({ tier: card.dataset.tier, experience: card.dataset.defaultProfile || null }); });
    }

    function start() { wireLanding(); return router.start((route) => renderRoute(route)); }
    return Object.freeze({ start, renderRoute });
  }


  return Object.freeze({ create: createAppShell });
});
