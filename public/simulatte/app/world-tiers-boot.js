(function attachWorldTiersBoot(root, factory) {
  const lifecycle = typeof module === 'object' && module.exports
    ? require('./mount-lifecycle.js')
    : root.SimulatteMountLifecycle;
  const tierRegistry = typeof module === 'object' && module.exports
    ? require('./tier-registry.js')
    : root.SimulatteTierRegistry;
  const experiencePresentation = typeof module === 'object' && module.exports
    ? require('./experience-presentation.js')
    : root.SimulatteExperiencePresentation;
  const api = factory(root, lifecycle, tierRegistry, experiencePresentation);
  root.SimulatteWorldTiersBoot = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTiersBoot(root, lifecycleApi, tierRegistry, experiencePresentationApi) {
  if (!tierRegistry) throw new Error('world_tiers_boot_tier_registry_missing');
  if (!experiencePresentationApi) throw new Error('world_tiers_boot_experience_presentation_missing');
  const TIER_LABELS = tierRegistry.TIER_LABELS;
  const GITHUB_EXPERIENCE_DOC_BASE_URL = 'https://github.com/clocksmith/simulatte/blob/main/docs/simulatte/experiences/';
  const EXPERIENCE_DOC_PATHS = Object.freeze({
    'cable-trader-pickup-v1': 'cable-trader.md',
    'neighborhood-bulk-pool-v1': 'neighborhood-bulk-pool.md',
    'nyc-development-atlas-v1': 'nyc-development-atlas.md',
    'sun-walker-v1': 'sun-walker.md',
    'food-recall-us-v1': 'food-recall.md',
    'grid-resilience-us-v1': 'grid-resilience.md',
    'maritime-trade-global-v1': 'maritime-trade.md',
    'subsea-network-global-v1': 'subsea-network.md',
    'orbital-transfer-planner-v1': 'orbital-transfer-planner.md',
    'asteroid-defense-v1': 'asteroid-defense.md',
    'interstellar-relay-network-v1': 'interstellar-relay-network.md',
  });
  const PROFILE_LABELS = Object.freeze({
    'cable-trader-pickup-v1': 'Cable Trader',
    'neighborhood-bulk-pool-v1': 'Neighborhood Bulk Pool',
    'nyc-development-atlas-v1': 'NYC Development Atlas',
    'sun-walker-v1': 'Sun Walker',
    'food-recall-us-v1': 'Food Recall (US)',
    'grid-resilience-us-v1': 'Grid Resilience',
    'maritime-trade-global-v1': 'Maritime Trade (Global)',
    'subsea-network-global-v1': 'Subsea Network',
    'orbital-transfer-planner-v1': 'Orbital Transfer Planner',
    'asteroid-defense-v1': 'Asteroid Defense',
    'interstellar-relay-network-v1': 'Interstellar Relay Network',
  });

  function experienceDocUrl(profileId) {
    const path = EXPERIENCE_DOC_PATHS[String(profileId || '')];
    return path ? `${GITHUB_EXPERIENCE_DOC_BASE_URL}${path}` : null;
  }

  function updateExperienceDocLink(link, profileId) {
    if (!link) return null;
    const url = experienceDocUrl(profileId);
    link.hidden = !url;
    if (!url) {
      link.removeAttribute?.('href');
      return null;
    }
    const label = labelForProfile(profileId);
    link.href = url;
    link.setAttribute?.('aria-label', `Open ${label} documentation on GitHub`);
    link.title = `Read how ${label} works`;
    return url;
  }

  // The app shell is the single owner of "which app is mounted". The router hands it a route
  // parsed from the URL path; the shell tears down whatever is mounted and boots the app the
  // route names — never a page reload. boot(tier, experience) -> { tier, experience, dispose }
  // dispatches to the city app or the governed tier explorer. Experience may be null, in which
  // case the loader resolves the tier's default and the shell canonicalizes the URL to match.
  function createAppShell({ router, boot, landing, documentationLink = null }) {
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
          beginRouteLoad(route);
          const updated = await current.updateRoute(route);
          if (generationAtStart !== generation) return;
          Object.assign(current, updated || {});
          router.canonicalize(currentRouteState(current));
          finishRouteLoad();
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
      validateResolvedRoute(acceptedRoute, booted);
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
      const grid = landing.querySelector('.tier-cards-grid');
      const setParallax = (x, y) => { landing.style.setProperty('--parallax-x', x.toFixed(3)); landing.style.setProperty('--parallax-y', y.toFixed(3)); };
      grid?.addEventListener('mousemove', (event) => { const rect = grid.getBoundingClientRect(); landing.classList.add('is-parallax'); setParallax(((event.clientX - rect.left) / rect.width - .5) * 2, ((event.clientY - rect.top) / rect.height - .5) * 2); });
      landing.addEventListener('click', (event) => { const card = event.target && event.target.closest && event.target.closest('.tier-card'); if (card && card.dataset.tier) void router.navigate({ tier: card.dataset.tier, experience: null }); });
    }

    function start() { wireLanding(); return router.start((route) => renderRoute(route)); }
    return Object.freeze({ start, renderRoute });
  }

  // Wires the scale (tier) dropdown and reflects the active tier. Selecting a different tier asks
  // the shell to navigate (URL push) rather than reloading. All listeners are bound to the boot's
  // AbortController signal so a re-boot never double-binds the persistent toolbar elements.
  function wireTierControls(ctx) {
    const { elements, tierVisualizer, profileSelectUi, signal } = ctx;
    const activeTier = ctx.activeTier || 'city';
    const on = (target, type, handler, options) => target.addEventListener(type, handler, { ...(options || {}), signal });
    function close() { elements.worldTierControl.classList.remove('open'); elements.worldTierTrigger.setAttribute('aria-expanded','false'); elements.worldTierOptions.hidden=true; }
    on(elements.worldTierTrigger,'click',(event)=>{event.stopPropagation();const open=!elements.worldTierControl.classList.contains('open');elements.worldTierControl.classList.toggle('open',open);elements.worldTierTrigger.setAttribute('aria-expanded',String(open));elements.worldTierOptions.hidden=!open;});
    on(window,'click',close);
    const options=[...elements.worldTierOptions.querySelectorAll('.select-option')];
    options.forEach((option)=>on(option,'click',(event)=>{event.stopPropagation();const tier=option.dataset.value;close();if(tier!==activeTier){ctx.onSelectTier?.(tier);} }));
    options.forEach((option)=>option.classList.toggle('selected',option.dataset.value===activeTier));
    elements.worldTierLabel.textContent=TIER_LABELS[activeTier]||'Select scale';
    const hasProfiles=ctx.hasProfiles!==false;
    elements.applicationProfileControl.classList.toggle('is-empty',!hasProfiles);
    elements.applicationProfileTrigger.disabled=!hasProfiles;
    elements.applicationProfileTrigger.setAttribute('aria-disabled',String(!hasProfiles));
    if(hasProfiles)profileSelectUi?.sync(); else elements.applicationProfileLabel.textContent='No experiences for this scale';
    return async function selectWorldTier(tier){ if(tier!==activeTier){ctx.onSelectTier?.(tier);return;} if(tierVisualizer)await tierVisualizer.loadTier(tier); };
  }

  async function bootGovernedTierExplorer(ctx,tier,requestedProfileId,options={}) {
    const required=['SimulatteTierApplicationLoader','SimulattePluginRuntime','SimulatteGeneratedPluginRegistry','SimulatteDeclarativeUiHost','SimulatteApplicationProfileSelect','SimulatteCityInterface','SimulatteMainView','SimulattePluginRandom','SimulattePluginScheduler','SimulattePluginCompute','SimulattePluginEnvironment','SimulattePluginGeography','SimulatteSimulationClock','SimulatteViewDirector','SimulatteAutonomyReceipts','SimulatteTierRunController'];
    const missing=required.find((name)=>!root[name]);
    if(missing)throw new Error(`tier_boot_dependency_missing: ${missing}`);
    const elements=ctx.collectElements();
    const lifecycle=lifecycleApi.create(options.signal);
    const on=lifecycle.on;
    root.SimulatteCityInterface.wireInterfaceControls(elements,lifecycle.signal);
    let data=null;
    let tierVisualizer=null;
    let profileSelectUi=null;
    let interaction=null;
    let activeScenario=null;
    let runtime=null;
    let pluginUi=null;
    let simulationClock=null;
    let viewDirector=null;
    let runController=null;
    let removeManualView=null;
    let lastPluginContributions=Object.freeze([]);
    let disposed=false;
    const requestedSimulation = options.simulation || null;
    const requestedRoute = options.routeState || {};
    let activeCameraMode = requestedRoute.camera || null;
    const runtimeLog = root.SimulatteAutonomyRuntimeLog || root.SimulatteRuntimeLog;
    const loadTrace = runtimeLog?.createLoadTrace?.(runtimeLog, {
      details: {
        tier,
        requestedProfileId,
        route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null,
        scenarioId: requestedSimulation?.scenarioId || null,
      },
    }) || null;
    const timedLoadStage = (name, operation, details = {}) => loadTrace?.run(name, operation, details) || operation();

    function selectTierViewMode(mode){
      activeCameraMode=mode==='bird'?'overview':mode;
      [
        [elements.cameraFollow, 'follow'],
        [elements.cameraPov, 'pov'],
        [elements.cameraBird, 'overview'],
        [elements.cameraTop, 'top'],
        [elements.cameraFree, 'free'],
        [elements.cameraCompare, 'compare'],
      ].forEach(([button, buttonMode]) => {
        const active=mode===buttonMode;
        button.classList.toggle('is-active',active);
        button.setAttribute('aria-pressed',String(active));
      });
    }
    function governedTierRoute(simulation=simulationRouteState()){return {tier,experience:data.applicationProfile.id,world:data.world.id,profile:data.applicationProfile.id,camera:activeCameraMode,simulation};}
    function tierRouteError(kind,requested,resolved){const error=new Error(`Requested ${kind} ${requested}; resolved ${resolved}`);error.code=`route_${kind}_resolution_mismatch`;return error;}
    function applyTierCamera(mode,navigate=false){
      const canonical=mode==='bird'?'overview':mode;
      const supported=new Set(data.applicationProfile.experience?.supportedViews||['overview','free']);
      if(!supported.has(canonical))throw tierRouteError('camera',canonical,[...supported].join(','));
      const target=preferredTierCameraTarget(tierVisualizer.pluginCameraTargets?.()||[],canonical);
      if(['follow','pov','compare'].includes(canonical)&&!target)throw tierRouteError('camera',canonical,'target unavailable');
      const directorMode=['top','free'].includes(canonical)?'free':canonical;
      viewDirector?.setManualOverride({mode:directorMode,targetIds:target?[target.sourceId]:[]});
      tierVisualizer.setViewMode?.(canonical);
      if(target)tierVisualizer.focusPluginTarget?.(target.id);
      selectTierViewMode(canonical);
      if(navigate)void ctx.navigate?.(governedTierRoute(),{replace:true});
      return canonical;
    }
    function wireTierViewControls(){
      const supportedViews=new Set(data.applicationProfile.experience?.supportedViews||['overview','free']);
      elements.cameraFollow.hidden=!supportedViews.has('follow');
      elements.cameraPov.hidden=!supportedViews.has('pov');
      elements.cameraBird.hidden=!supportedViews.has('overview');
      elements.cameraTop.hidden=!supportedViews.has('top');
      elements.cameraFree.hidden=!supportedViews.has('free');
      elements.cameraCompare.hidden=!supportedViews.has('compare');
      elements.cameraBird.textContent='Overview';
      elements.cameraTop.textContent='Top';
      elements.cameraFree.textContent='Free';
      elements.cameraCompare.textContent='Compare';
      selectTierViewMode(data.applicationProfile.experience?.defaultView||'overview');
      [[elements.cameraBird,'overview'],[elements.cameraFollow,'follow'],[elements.cameraPov,'pov'],[elements.cameraTop,'top'],[elements.cameraFree,'free'],[elements.cameraCompare,'compare']]
        .forEach(([button,mode])=>on(button,'click',()=>applyTierCamera(mode,true)));
    }

    async function dispose(){
      if(disposed)return;
      disposed=true;
      simulationClock?.pause();
      runController?.dispose();
      lifecycle.abort();
      removeManualView?.();
      const resources={runtime,pluginUi,profileSelectUi,tierVisualizer};
      runtime=null;pluginUi=null;profileSelectUi=null;tierVisualizer=null;
      await lifecycleApi.disposeAll([
        {resource:'plugin-runtime',dispose:()=>resources.runtime?.dispose()},
        {resource:'plugin-ui',dispose:()=>resources.pluginUi?.dispose?.()},
        {resource:'profile-select',dispose:()=>resources.profileSelectUi?.dispose()},
        {resource:'tier-visualizer',dispose:()=>resources.tierVisualizer?.destroy()},
        {resource:'body-state',dispose:()=>document.body.classList.remove('world-explorer')},
      ]);
    }

    function environmentSnapshots(){ const ids=['us.environment.snapshot.v1']; return Object.fromEntries(ids.flatMap((id)=>{try{const value=data.dataCatalog.optional(id);return value?[[id,value]]:[];}catch(_error){return[];}})); }
    function createCorePorts(scenario){
      return Object.freeze({
        clock:createScenarioClock(scenario),
        worldQuery:Object.freeze({query:()=>data.world}),
        routing:Object.freeze({contribute:()=>{}}),
        tier:Object.freeze({schema:'simulatte.tierQuery.v1',id:tier,worldId:data.world.id,profileId:data.applicationProfile.id,snapshot:()=>data.world}),
        ui:Object.freeze({slot:'inspector'}),
        receipts:Object.freeze({createReceiptChain:root.SimulatteAutonomyReceipts.createReceiptChain,appendReceiptEntry:root.SimulatteAutonomyReceipts.appendReceiptEntry,sha256Hex:root.SimulatteAutonomyReceipts.sha256Hex,verifyReceiptChain:root.SimulatteAutonomyReceipts.verifyReceiptChain}),
        random:root.SimulattePluginRandom.createRandomPort({rootSeed:scenario.seed,scenarioId:scenario.id}),
        scheduler:root.SimulattePluginScheduler.createSchedulerPort({}),
        compute:root.SimulattePluginCompute.createComputePort({workerPool:null}),
        environment:root.SimulattePluginEnvironment.createEnvironmentPort({snapshots:environmentSnapshots()}),
        geography:root.SimulattePluginGeography.createGeographyPort({world:data.world}),
      });
    }

    async function activateScenario(scenario,routeSimulation=null){
      pluginUi?.dispose?.();
      if(runtime)await runtime.dispose();
      runtime=await root.SimulattePluginRuntime.createPluginRuntime({registry:root.SimulatteGeneratedPluginRegistry,profile:data.applicationProfile,scenario,dataCatalog:data.dataCatalog,artifactStore:data.artifactStore,registryBaseUrl:data.registryBaseUrl,corePorts:createCorePorts(scenario)});
      pluginUi=root.SimulatteDeclarativeUiHost.createDeclarativeUiHost({
        rootElements:{inspector:elements.pluginInspector,map:elements.pluginMapUi},
        onAction:async({pluginId,actionId,command,values})=>{
          if(command?.kind==='camera.focus'){viewDirector?.setManualOverride({mode:'free',targetIds:[command.targetId]});tierVisualizer.focusPluginTarget?.(`plugin:${pluginId}:${command.targetId}`);return;}
          await runtime.dispatchAction(pluginId,actionId,{values,scenario:activeScenario,routeObjective:data.applicationProfile.routeObjective});
          renderPlugins();
        },
        onControlChange:async({pluginId,values})=>{
          if (ctx.navigate) {
            const simulation=simulationRouteState();
            await ctx.navigate({
              tier,
              experience: data.applicationProfile.id,
              simulation: { ...simulation, parameters: { ...simulation.parameters, [pluginId]: values } },
            }, { replace: true });
            return;
          }
          if(!runController||runController.snapshot().ownerPluginId!==pluginId)return;
          root.SimulatteTierRunController.clearStoredReceipt(root.sessionStorage,data.applicationProfile.id);
          root.__simulatteTierRunReceipt=null;
          root.__simulatteComparisonExecutionReceipts=Object.freeze([]);
          ctx.setJourneyPhase?.('loading');
          ctx.setRuntimeStatus?.(elements,'Applying controls','loading');
          await new Promise((resolve)=>requestAnimationFrame(resolve));
          try{
            await runController.applyControls(values);
            ctx.setJourneyPhase?.('ready');
            ctx.setRuntimeStatus?.(elements,'Ready','ready');
          }
          catch(error){reportRunFailure(error);throw error;}
        },
        onError:(error)=>reportRunFailure(error),
      });
      renderPlugins();
      if(routeSimulation){
        const accepted=acceptedRouteParameters(routeSimulation);
        Object.entries(accepted).forEach(([pluginId,values])=>pluginUi.setValues(pluginId,values));
        if(Object.keys(accepted).length)renderPlugins();
      }
    }
    function renderPlugins(){
      if(!runtime)return;
      const context={scenario:activeScenario,compositionSize:runtime.activePluginIds.length};
      const platform=runtime.platformV4(context);
      lastPluginContributions=platform.contributions;
      pluginUi.render(runtime.views(context),platform.contributions);
      const controlCount=platform.contributions.reduce((total,contribution)=>total+contribution.controls.controls.length,0);
      elements.decisionsButton.textContent=controlCount?`Controls (${controlCount})`:'Evidence';
      renderTierSummary(root.__simulatteTierRunState?.state||'idle');
      tierVisualizer.removeHud?.();
      const simulationTimeMs=Math.max(0,...platform.contributions.map((contribution)=>contribution.state?.simulationTimeMs||0));
      tierVisualizer.setPluginPresentations?.(platform.contributions.map((contribution)=>({pluginId:contribution.pluginId,presentation:contribution.presentation})),{simulationTimeMs,provenanceReceipts:platform.provenanceReceipts});
      if(!simulationClock)simulationClock=root.SimulatteSimulationClock.createClock({timeline:platform.timeline});
      simulationClock.useTimeline(platform.timeline,{atMs:simulationTimeMs});
      const previousViewState=viewDirector?.snapshot();
      const manualDecision=previousViewState?.manualOverride?previousViewState.decision:null;
      viewDirector=root.SimulatteViewDirector.createViewDirector({provenanceReceipts:platform.provenanceReceipts});
      platform.contributions.forEach((contribution)=>contribution.presentation.viewIntents.forEach((intent)=>{
        const hosted=Object.freeze({...intent,id:`${contribution.pluginId}:${intent.id}`});
        viewDirector.submit(hosted,{source:contribution.pluginId});
      }));
      if(manualDecision)viewDirector.setManualOverride({mode:manualDecision.mode,targetIds:manualDecision.targetIds});
      const viewState=viewDirector.snapshot();
      if(!viewState.manualOverride&&viewState.decision.source!=='core-fallback'){
        const sourceIntentId=viewState.decision.intentId?.slice(`${viewState.decision.source}:`.length)||null;
        const intentTargetId=sourceIntentId?`plugin:${viewState.decision.source}:${sourceIntentId}`:null;
        const subjectTargetIds=viewState.decision.targetIds.map((id)=>`plugin:${viewState.decision.source}:${id}`);
        const candidates=['overview','compare'].includes(viewState.decision.mode)
          ?[intentTargetId,...subjectTargetIds].filter(Boolean)
          :[...subjectTargetIds,intentTargetId].filter(Boolean);
        tierVisualizer.setViewMode?.(viewState.decision.mode);
        candidates.some((id)=>tierVisualizer.focusPluginTarget?.(id));
        selectTierViewMode(viewState.decision.mode);
      }
      root.__simulattePluginPlatformV4=Object.freeze({receipt:platform.receipt,contributions:platform.contributions,contributionSources:platform.contributionSources,provenance:platform.provenanceCoverage,clock:simulationClock.receipt(),view:viewDirector.receipt(),compositor:tierVisualizer.pluginPresentationReceipt?.()||[]});
    }
    function renderTierSummary(runState){
      root.SimulatteMainView.renderExperienceSummary(elements,experienceHudSummary({
        profileId:data.applicationProfile.id,
        profile:data.applicationProfile,
        profileLabel:elements.applicationProfileLabel.textContent,
        scenario:activeScenario,
        contributions:lastPluginContributions,
        runState,
        playback:root.__simulatteTierRunState||null,
        comparisonReceipts:root.__simulatteComparisonExecutionReceipts||[],
      }));
    }
    function renderScenario(){root.SimulatteApplicationProfileSelect.renderInteraction(interaction,activeScenario,elements);elements.missionField.hidden=true;elements.scenarioField.hidden=false;elements.startButton.hidden=false;elements.shuffleButton.hidden=interaction.scenarios.length<2;elements.pauseButton.hidden=true;elements.resumeButton.hidden=true;elements.replayButton.hidden=true;elements.newMissionButton.hidden=true;elements.dockMoreButton.hidden=true;elements.playbackStrip.hidden=true;elements.playbackSpeedControl.hidden=true;elements.playbackTimelineControl.hidden=true;elements.playbackTimeline.value='0';elements.playbackTimeline.max='0';elements.playbackProgress.textContent='0 / 0';elements.modelSelectionControls?.replaceChildren();}
    function scenarioForRoute(simulation){
      const scenarioId=simulation?.scenarioId||null;
      const seed=simulation?.seed||null;
      if(!scenarioId&&!seed)return interaction.defaultScenario;
      const scenario=interaction.scenarios.find((row)=>(!scenarioId||row.id===scenarioId)&&(!seed||row.seed===seed));
      if(!scenario)throw tierRouteError('scenario',[scenarioId,seed].filter(Boolean).join('/'),'declared profile scenario');
      return scenario;
    }
    function acceptedRouteParameters(simulation){
      const requested=simulation?.parameters||{};
      const accepted={};
      Object.entries(requested).forEach(([pluginId,values])=>{
        if(!runtime.activePluginIds.includes(pluginId))throw tierRouteError('parameter-owner',pluginId,runtime.activePluginIds.join(','));
        if(!values||typeof values!=='object'||Array.isArray(values))throw tierRouteError('parameters',pluginId,'object');
        const declared=pluginUi.values(pluginId);
        const unknown=Object.keys(values).filter((key)=>!Object.prototype.hasOwnProperty.call(declared,key));
        if(unknown.length)throw tierRouteError('parameter',`${pluginId}.${unknown.join(',')}`,'declared control');
        if(Object.keys(values).length)accepted[pluginId]=values;
      });
      return accepted;
    }
    function simulationRouteState(){
      const parameters={};
      runtime.activePluginIds.forEach((pluginId)=>{
        const values=pluginUi.values(pluginId);
        if(Object.keys(values).length)parameters[pluginId]=values;
      });
      return {scenarioId:activeScenario.id,seed:activeScenario.seed,parameters};
    }
    async function updateSimulationFromRoute(nextSimulation){
      const nextScenario=scenarioForRoute(nextSimulation);
      const scenarioChanged=nextScenario.id!==activeScenario.id||nextScenario.seed!==activeScenario.seed;
      const requestedParameters=acceptedRouteParameters(nextSimulation);
      const owner=data.applicationProfile.interaction.simulationOwnerPluginId||runtime.activePluginIds[0];
      if(scenarioChanged){
        runController?.dispose();
        root.SimulatteTierRunController.clearStoredReceipt(root.sessionStorage,data.applicationProfile.id);
        root.__simulatteTierRunReceipt=null;
        root.__simulatteTierRunState=null;
        root.__simulatteComparisonExecutionReceipts=Object.freeze([]);
        pluginUi.resetValues();
        activeScenario=nextScenario;
        renderScenario();
        await activateScenario(activeScenario,nextSimulation);
        configureRunController(owner);
      }else{
        // The URL is authoritative. Clear controls first so removing a query
        // parameter cannot resurrect a stale in-memory value.
        pluginUi.resetValues();
        renderPlugins();
        Object.entries(requestedParameters).forEach(([pluginId,values])=>pluginUi.setValues(pluginId,values));
        if(Object.keys(requestedParameters).length)renderPlugins();
        if(requestedParameters[owner])await runController?.applyControls(requestedParameters[owner]);
      }
      return simulationRouteState();
    }
    async function updateRouteFromUrl(route){
      if(route.profile&&route.profile!==data.applicationProfile.id)throw tierRouteError('profile',route.profile,data.applicationProfile.id);
      if(route.world&&route.world!==data.world.id)throw tierRouteError('world',route.world,data.world.id);
      if(route.camera&&route.camera!==activeCameraMode)applyTierCamera(route.camera);
      if(root.SimulatteRouter.queryForSimulation(route.simulation)!==root.SimulatteRouter.queryForSimulation(simulationRouteState()))await updateSimulationFromRoute(route.simulation||null);
      return governedTierRoute();
    }
    function reportRunFailure(error){
      if(root.__simulatteLastFailError?.message===error.message)return;
      root.__simulatteLastFailError={message:error.message,code:error.code||null};
      ctx.setJourneyPhase?.('failed');
      ctx.setRuntimeStatus?.(elements,'Stopped','error');
      (root.SimulatteAutonomyRuntimeLog||root.SimulatteRuntimeLog)?.error?.('tier.run.failed',{message:error.message,code:error.code||null});
    }
    function configureRunController(owner){
      runController?.dispose();
      root.__simulatteTierRunReceipt=null;
      root.__simulatteTierRunState=null;
      root.__simulatteLastFailError=null;
      root.__simulatteComparisonExecutionReceipts=Object.freeze([]);
      runController=root.SimulatteTierRunController.createController({
        getRuntime:()=>runtime,
        ownerPluginId:owner,
        scenario:activeScenario,
        profileId:data.applicationProfile.id,
        comparisonRequired:data.applicationProfile.experience?.comparisonMode!=='none',
        stepDelayMs:data.applicationProfile.interaction.stepDelayMs,
        getControlValues:(pluginId)=>pluginUi.values(pluginId),
        setControlValues:(pluginId,values)=>pluginUi.setValues(pluginId,values),
        storage:root.sessionStorage,
        render:renderPlugins,
        resetRuntime:()=>activateScenario(activeScenario),
        buildReceipt:({actionResult,settlement,parameterValues})=>Object.freeze({schema:'simulatte.tierRunReceipt.v1',tier,profileId:data.applicationProfile.id,scenario:activeScenario,parameterValues,actionResult,settlement,pluginRuntime:runtime.runtimeReceipt(),loadReceipt:data.receipt}),
        onState:(state)=>{
          root.__simulatteTierRunState=state;
          const isRunning=state.state==='running';
          const isPaused=state.state==='paused';
          const isSettled=state.state==='settled';
          const isProgressive=state.totalSteps>1;
          const shellPhase=isSettled?'completed':state.state==='idle'?'ready':state.state;
          elements.startButton.hidden=state.state!=='idle'&&!(isSettled&&!isProgressive);
          elements.pauseButton.hidden=!isRunning||!isProgressive;
          elements.resumeButton.hidden=!isPaused||!isProgressive;
          elements.stepButton.hidden=!isPaused||!isProgressive;
          elements.resetButton.hidden=!isProgressive||(!isRunning&&!isPaused);
          elements.replayButton.hidden=!isSettled||!isProgressive;
          elements.dockMoreButton.hidden=true;
          const statusLabel=root.SimulatteMainView.renderPlayback(elements,shellPhase,{
            ...state,
            phase:shellPhase,
            clock:{playbackRate:state.playbackRate},
          });
          elements.startButton.disabled=false;
          renderTierSummary(state.state);
          if(isRunning||isPaused){ctx.setJourneyPhase?.(isPaused?'paused':'running');ctx.setRuntimeStatus?.(elements,statusLabel,isPaused?'paused':'active');}
          else if(state.state==='idle'&&document.body.dataset.journeyPhase==='completed'){ctx.setJourneyPhase?.('ready');ctx.setRuntimeStatus?.(elements,'Resetting scenario','loading');}
        },
        onReceipt:(receipt)=>{
          root.__simulatteTierRunReceipt=receipt;
          root.__simulatteComparisonExecutionReceipts=Object.freeze(
            receipt.actionResult.comparisonExecutionReceipts
              || [receipt.actionResult.comparisonExecutionReceipt].filter(Boolean)
          );
          ctx.setJourneyPhase?.('completed');
          ctx.setRuntimeStatus?.(elements,'Complete','ready');
        },
        onError:reportRunFailure,
      });
    }
    try {
      document.body.classList.add('world-explorer');
      ctx.setJourneyPhase?.('loading');
      ctx.setRuntimeStatus?.(elements,'Loading experience','loading');
      if(!root.SimulatteWorldRuntimeLoader?.loadSelectedProduct)throw new Error('tier_boot_runtime_loader_missing');
      await timedLoadStage('runtime.bootstrap', () => root.SimulatteWorldRuntimeLoader.loadSelectedProduct({tierId:tier,profileId:requestedProfileId||null}));
      lifecycle.throwIfAborted();
      data=await timedLoadStage('application.data', () => root.SimulatteTierApplicationLoader.loadTierApplication({tier,requestedProfileId:requestedProfileId||null,fetchImpl:lifecycle.fetch}));
      lifecycle.throwIfAborted();
      if(requestedRoute.profile&&requestedRoute.profile!==data.applicationProfile.id)throw tierRouteError('profile',requestedRoute.profile,data.applicationProfile.id);
      if(requestedRoute.world&&requestedRoute.world!==data.world.id)throw tierRouteError('world',requestedRoute.world,data.world.id);
      tierVisualizer=ctx.createTierVisualizer(elements.overlayCanvas,'world-tier-control');
      removeManualView=tierVisualizer.onManualView?.(()=>{
        viewDirector?.setManualOverride({mode:'free',targetIds:[]});
        tierVisualizer.setViewMode?.('free');
        selectTierViewMode('free');
        void ctx.navigate?.(governedTierRoute(),{replace:true});
      });
      await timedLoadStage('tier.visualizer', () => tierVisualizer.loadTier(tier));
      lifecycle.throwIfAborted();
      populateProfileSelect(elements.applicationProfile,data.profileEntries,data.applicationProfile.id);
      profileSelectUi=root.SimulatteApplicationProfileSelect.createApplicationProfileSelect({select:elements.applicationProfile,root:elements.applicationProfileControl,trigger:elements.applicationProfileTrigger,label:elements.applicationProfileLabel,listbox:elements.applicationProfileOptions});
      elements.applicationProfile.disabled=false;
      elements.applicationProfileTrigger.disabled=false;
      profileSelectUi.sync();
      on(elements.applicationProfile,'change',()=>{const value=elements.applicationProfile.value;if(value&&value!==data.applicationProfile.id)ctx.navigate?.({tier,experience:value});});
      wireTierControls({elements,tierVisualizer,profileSelectUi,activeTier:tier,hasProfiles:true,signal:lifecycle.signal,onSelectTier:ctx.onSelectTier});
      wireTierViewControls();
      interaction=root.SimulatteApplicationProfileSelect.resolveInteraction(data.applicationProfile,{});
      root.SimulatteMainView.configureExperienceShell(elements,{
        interactionMode:interaction.mode,
        profile:data.applicationProfile,
        tier,
      });
      const storedRun=root.SimulatteTierRunController.readStoredReceipt(root.sessionStorage,data.applicationProfile.id);
      const routeScenario=requestedSimulation?scenarioForRoute(requestedSimulation):null;
      activeScenario=routeScenario||(
        !requestedSimulation && interaction.scenarios.find((scenario)=>(
          scenario.id===storedRun?.scenario?.id&&scenario.seed===storedRun?.scenario?.seed
        ))
      )||interaction.defaultScenario;
      renderScenario();
      await timedLoadStage('scenario.activation', () => activateScenario(activeScenario,requestedSimulation), { profileId: data.applicationProfile.id });
      lifecycle.throwIfAborted();
      applyTierCamera(requestedRoute.camera||data.applicationProfile.experience?.defaultView||'overview');
      const owner=data.applicationProfile.interaction.simulationOwnerPluginId||runtime.activePluginIds[0];
      configureRunController(owner);
      on(elements.startButton,'click',()=>{void runController.start().catch(reportRunFailure);});
      on(elements.pauseButton,'click',()=>runController.pause());
      on(elements.resumeButton,'click',()=>{void runController.resume().catch(reportRunFailure);});
      on(elements.stepButton,'click',()=>{void runController.step().catch(reportRunFailure);});
      on(elements.resetButton,'click',()=>{void runController.reset().catch(reportRunFailure);});
      on(elements.replayButton,'click',()=>{void runController.replay().catch(reportRunFailure);});
      on(elements.playbackSpeed,'change',()=>{runController.setPlaybackRate(Number(elements.playbackSpeed.value));});
      on(elements.playbackTimeline,'change',()=>{void runController.seek(Number(elements.playbackTimeline.value)).catch(reportRunFailure);});
      on(elements.shuffleButton,'click',async()=>{
        const nextScenario=root.SimulatteApplicationProfileSelect.nextScenario(interaction,activeScenario.id);
        if (ctx.navigate) {
          await ctx.navigate({
            tier,
            experience: data.applicationProfile.id,
            simulation: { scenarioId: nextScenario.id, seed: nextScenario.seed },
          });
          return;
        }
        runController?.dispose();
        elements.shuffleButton.disabled=true;
        elements.startButton.disabled=true;
        ctx.setJourneyPhase?.('loading');
        ctx.setRuntimeStatus?.(elements,'Loading scenario','loading');
        activeScenario=nextScenario;
        renderScenario();
        elements.shuffleButton.disabled=true;
        elements.startButton.disabled=true;
        try{
          await activateScenario(activeScenario);
          configureRunController(owner);
          ctx.setJourneyPhase?.('ready');
          ctx.setRuntimeStatus?.(elements,'Ready','ready');
        }catch(error){
          ctx.setJourneyPhase?.('failed');
          ctx.setRuntimeStatus?.(elements,'Stopped','error');
          root.__simulatteLastFailError={message:error.message,code:error.code||null};
          (root.SimulatteAutonomyRuntimeLog||root.SimulatteRuntimeLog)?.error?.('tier.scenario.activation.failed',{message:error.message,code:error.code||null});
        }finally{
          elements.shuffleButton.disabled=false;
          elements.startButton.disabled=false;
        }
      });
      on(window,'pagehide',()=>{void dispose();},{once:true});
      const restored=await timedLoadStage('first.render', () => runController.restore(), {
        profileId: data.applicationProfile.id,
        scenarioId: activeScenario.id,
      });
      lifecycle.throwIfAborted();
      if(!restored){ctx.setJourneyPhase?.('ready');ctx.setRuntimeStatus?.(elements,'Ready','ready');}
      loadTrace?.complete({
        profileId: data.applicationProfile.id,
        interactionMode: interaction.mode,
        scenarioId: activeScenario.id,
        pluginCount: runtime.activePluginIds.length,
      });
      return Object.freeze({
        tier,
        experience: data.applicationProfile.id,
        world: data.world.id,
        profile: data.applicationProfile.id,
        camera: activeCameraMode,
        simulation: simulationRouteState(),
        dispose,
        updateRoute: updateRouteFromUrl,
        updateSimulation: updateSimulationFromRoute,
      });
    } catch (error) {
      loadTrace?.fail(error, { profileId: data?.applicationProfile?.id || requestedProfileId || null });
      await dispose();
      throw error;
    }
  }

  function populateProfileSelect(select,entries,selectedId){select.replaceChildren(...entries.map((entry)=>{const option=document.createElement('option');option.value=entry.id;option.textContent=labelForProfile(entry.id);option.selected=entry.id===selectedId;return option;}));select.value=selectedId;}
  function labelForProfile(id){if(PROFILE_LABELS[id])return PROFILE_LABELS[id];return String(id).replace(/-v\d+$/,'').split('-').filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');}
  function experienceHudSummary(options) { return experiencePresentationApi.summarize(options); }
  function createScenarioClock(scenario = {}) {
    const source = String(scenario?.epochStart || scenario?.startInstant || '').trim();
    const milliseconds = Date.parse(source);
    if (!source || !Number.isFinite(milliseconds)) {
      const unavailable = () => {
        const error = new Error('world_tiers_clock_scenario_instant_invalid: clock.read.v1 requires scenario.epochStart or scenario.startInstant');
        error.code = 'world_tiers_clock_scenario_instant_invalid';
        error.evidence = Object.freeze({ scenarioId: String(scenario?.id || ''), source });
        throw error;
      };
      return Object.freeze({ instantForMission: unavailable, now: unavailable, iso: unavailable });
    }
    const instant = new Date(milliseconds).toISOString();
    return Object.freeze({ instantForMission: () => instant, now: () => milliseconds, iso: () => instant });
  }
  function preferredTierCameraTarget(targets, mode) {
    return [...(targets || [])]
      .filter((target) => target.viewMode === mode || (mode === 'pov' && target.viewMode === 'follow'))
      .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))[0]
      || null;
  }

  return Object.freeze({
    TIER_LABELS,
    PROFILE_LABELS,
    EXPERIENCE_DOC_PATHS,
    experienceDocUrl,
    updateExperienceDocLink,
    createAppShell,
    wireTierControls,
    bootGovernedTierExplorer,
    experienceHudSummary,
    createScenarioClock,
    preferredTierCameraTarget,
    labelForProfile,
    populateProfileSelect,
  });
});
