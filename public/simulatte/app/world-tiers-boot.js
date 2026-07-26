(function attachWorldTiersBoot(root, factory) {
  const lifecycle = typeof module === 'object' && module.exports
    ? require('./mount-lifecycle.js')
    : root.SimulatteMountLifecycle;
  const tierRegistry = typeof module === 'object' && module.exports
    ? require('./tier-registry.js')
    : root.SimulatteTierRegistry;
  const api = factory(root, lifecycle, tierRegistry);
  root.SimulatteWorldTiersBoot = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTiersBoot(root, lifecycleApi, tierRegistry) {
  if (!tierRegistry) throw new Error('world_tiers_boot_tier_registry_missing');
  const TIER_LABELS = tierRegistry.TIER_LABELS;
  const PROFILE_LABELS = Object.freeze({
    'cable-trader-pickup-v1': 'Cable Trader',
    'safety-explorer-v1': 'Safety Explorer',
    'sun-walker-v1': 'Sun Walker',
    'food-recall-us-v1': 'Food Recall (US)',
    'maritime-trade-global-v1': 'Maritime Trade (Global)',
    'orbital-transfer-planner-v1': 'Orbital Transfer Planner',
    'interstellar-relay-network-v1': 'Interstellar Relay Network',
  });

  // The app shell is the single owner of "which app is mounted". The router hands it a route
  // parsed from the URL path; the shell tears down whatever is mounted and boots the app the
  // route names — never a page reload. boot(tier, experience) -> { tier, experience, dispose }
  // dispatches to the city app or the governed tier explorer. Experience may be null, in which
  // case the loader resolves the tier's default and the shell canonicalizes the URL to match.
  function createAppShell({ router, boot, landing }) {
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

    function showLanding() {
      landing?.classList.remove('hidden');
      try { document.body.classList.remove('world-explorer'); } catch (_error) { /* no document */ }
    }

    async function renderRoute(route) {
      const generationAtStart = ++generation;
      if (!route || !route.tier) {
        cancelPending();
        await teardown();
        showLanding();
        return;
      }
      if (current && current.tier === route.tier) {
        const wantedExperience = route.experience || current.experience;
        if (wantedExperience === current.experience) {
          router.canonicalize({ tier: current.tier, experience: current.experience });
          return;
        }
      }
      cancelPending();
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
        booted = await boot(route.tier, route.experience || null, { signal: attempt.signal });
      } catch (error) {
        if (attempt.signal.aborted || generationAtStart !== generation) return;
        // A genuinely unknown/removed experience id should not strand the visitor. Any failure
        // inside a known experience must remain visible instead of silently booting a different
        // product and producing evidence for the wrong route.
        if(route.experience&&error?.code==='application_profile_unknown') {
          try {
            booted = await boot(route.tier, null, { signal: attempt.signal });
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
      current = { tier: booted.tier, experience: booted.experience, dispose: booted.dispose };
      router.canonicalize({ tier: booted.tier, experience: booted.experience });
    }

    function reflectRoute(route) {
      try {
        const label = document.getElementById('world-tier-label');
        if (label && TIER_LABELS[route.tier]) label.textContent = TIER_LABELS[route.tier];
        document.querySelectorAll('#world-tier-options .select-option').forEach((option) => option.classList.toggle('selected', option.dataset.value === route.tier));
        const experienceLabel = document.getElementById('application-profile-label');
        if (experienceLabel) experienceLabel.textContent = route.experience ? labelForProfile(route.experience) : 'Loading experience';
      } catch (_error) { /* toolbar not present yet */ }
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
    const required=['SimulatteTierApplicationLoader','SimulattePluginRuntime','SimulatteGeneratedPluginRegistry','SimulatteDeclarativeUiHost','SimulatteApplicationProfileSelect','SimulattePluginRandom','SimulattePluginScheduler','SimulattePluginCompute','SimulattePluginEnvironment','SimulattePluginGeography','SimulatteSimulationClock','SimulatteViewDirector','SimulatteAutonomyReceipts','SimulatteTierRunController'];
    const missing=required.find((name)=>!root[name]);
    if(missing)throw new Error(`tier_boot_dependency_missing: ${missing}`);
    const elements=ctx.collectElements();
    const lifecycle=lifecycleApi.create(options.signal);
    const on=lifecycle.on;
    let data=null;
    let tierVisualizer=null;
    let profileSelectUi=null;
    let interaction=null;
    let activeScenario=null;
    let runtime=null;
    let pluginUi=null;
    let simulationClock=null;
    let viewDirector=null;
    let viewIntentIds=new Set();
    let runController=null;
    let removeManualView=null;
    let disposed=false;

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
        {resource:'tier-visualizer',dispose:()=>resources.tierVisualizer?.stop()},
        {resource:'body-state',dispose:()=>document.body.classList.remove('world-explorer')},
      ]);
    }

    function environmentSnapshots(){ const ids=['us.environment.snapshot.v1']; return Object.fromEntries(ids.flatMap((id)=>{try{const value=data.dataCatalog.optional(id);return value?[[id,value]]:[];}catch(_error){return[];}})); }
    function createCorePorts(scenario){
      return Object.freeze({
        clock:Object.freeze({instantForMission:()=>scenario?.epochStart||new Date().toISOString(),now:()=>Date.now(),iso:()=>new Date().toISOString()}),
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

    async function activateScenario(scenario){
      pluginUi?.dispose?.();
      if(runtime)await runtime.dispose();
      runtime=await root.SimulattePluginRuntime.createPluginRuntime({registry:root.SimulatteGeneratedPluginRegistry,profile:data.applicationProfile,scenario,dataCatalog:data.dataCatalog,artifactStore:data.artifactStore,registryBaseUrl:data.registryBaseUrl,corePorts:createCorePorts(scenario)});
      pluginUi=root.SimulatteDeclarativeUiHost.createDeclarativeUiHost({rootElements:{inspector:elements.pluginInspector,map:elements.pluginMapUi,hud:elements.pluginHudUi},onAction:async({pluginId,actionId,command,values})=>{
        if(command?.kind==='camera.focus'){viewDirector?.setManualOverride({mode:'free',targetIds:[command.targetId]});tierVisualizer.focusPluginTarget?.(`plugin:${pluginId}:${command.targetId}`);return;}
        await runtime.dispatchAction(pluginId,actionId,{values,scenario:activeScenario,routeObjective:data.applicationProfile.routeObjective});
        renderPlugins();
      }});
      renderPlugins();
    }
    function renderPlugins(){
      if(!runtime)return;
      const context={scenario:activeScenario,compositionSize:runtime.activePluginIds.length};
      const platform=runtime.platformV4(context);
      pluginUi.render(runtime.views(context),platform.contributions);
      const simulationTimeMs=Math.max(0,...platform.contributions.map((contribution)=>contribution.state?.simulationTimeMs||0));
      tierVisualizer.setPluginPresentations?.(platform.contributions.map((contribution)=>({pluginId:contribution.pluginId,presentation:contribution.presentation})),{simulationTimeMs,provenanceReceipts:platform.provenanceReceipts});
      if(!simulationClock)simulationClock=root.SimulatteSimulationClock.createClock({timeline:platform.timeline});
      simulationClock.useTimeline(platform.timeline,{atMs:simulationTimeMs});
      const previousViewState=viewDirector?.snapshot();
      const manualDecision=previousViewState?.manualOverride?previousViewState.decision:null;
      viewDirector=root.SimulatteViewDirector.createViewDirector({provenanceReceipts:platform.provenanceReceipts});
      viewIntentIds=new Set();
      platform.contributions.forEach((contribution)=>contribution.presentation.viewIntents.forEach((intent)=>{
        const hosted=Object.freeze({...intent,id:`${contribution.pluginId}:${intent.id}`});
        viewDirector.submit(hosted,{source:contribution.pluginId});
        viewIntentIds.add(hosted.id);
      }));
      if(manualDecision)viewDirector.setManualOverride({mode:manualDecision.mode,targetIds:manualDecision.targetIds});
      const viewState=viewDirector.snapshot();
      if(!viewState.manualOverride&&viewState.decision.source!=='core-fallback'){
        const targetId=viewState.decision.targetIds.find((id)=>tierVisualizer.focusPluginTarget?.(`plugin:${viewState.decision.source}:${id}`));
        if(!targetId&&viewState.decision.intentId){
          const sourceIntentId=viewState.decision.intentId.slice(`${viewState.decision.source}:`.length);
          tierVisualizer.focusPluginTarget?.(`plugin:${viewState.decision.source}:${sourceIntentId}`);
        }
      }
      root.__simulattePluginPlatformV4=Object.freeze({receipt:platform.receipt,contributions:platform.contributions,contributionSources:platform.contributionSources,provenance:platform.provenanceCoverage,clock:simulationClock.receipt(),view:viewDirector.receipt(),compositor:tierVisualizer.pluginPresentationReceipt?.()||[]});
    }
    function renderScenario(){root.SimulatteApplicationProfileSelect.renderInteraction(interaction,activeScenario,elements);elements.missionField.hidden=true;elements.scenarioField.hidden=false;elements.startButton.hidden=false;elements.shuffleButton.hidden=interaction.scenarios.length<2;elements.pauseButton.hidden=true;elements.resumeButton.hidden=true;elements.replayButton.hidden=true;elements.newMissionButton.hidden=true;elements.modelSelectionControls?.replaceChildren();}
    function configureRunController(owner){
      runController?.dispose();
      root.__simulatteTierRunReceipt=null;
      root.__simulatteTierRunState=null;
      root.__simulatteComparisonExecutionReceipts=Object.freeze([]);
      runController=root.SimulatteTierRunController.createController({
        getRuntime:()=>runtime,
        ownerPluginId:owner,
        scenario:activeScenario,
        profileId:data.applicationProfile.id,
        storage:root.sessionStorage,
        render:renderPlugins,
        resetRuntime:()=>activateScenario(activeScenario),
        buildReceipt:({actionResult,settlement})=>Object.freeze({schema:'simulatte.tierRunReceipt.v1',tier,profileId:data.applicationProfile.id,scenario:activeScenario,actionResult,settlement,pluginRuntime:runtime.runtimeReceipt(),loadReceipt:data.receipt}),
        onState:(state)=>{
          root.__simulatteTierRunState=state;
          const isRunning=state.state==='running';
          const isPaused=state.state==='paused';
          const isSettled=state.state==='settled';
          elements.startButton.hidden=state.state!=='idle';
          elements.pauseButton.hidden=!isRunning;
          elements.resumeButton.hidden=!isPaused;
          elements.stepButton.hidden=!isPaused;
          elements.replayButton.hidden=!isSettled;
          elements.startButton.disabled=false;
          if(isRunning||isPaused){ctx.setJourneyPhase?.(isPaused?'paused':'running');ctx.setRuntimeStatus?.(elements,isPaused?'Paused':'Running scenario',isPaused?'paused':'active');}
          else if(state.state==='idle'&&document.body.dataset.journeyPhase==='completed'){ctx.setJourneyPhase?.('ready');ctx.setRuntimeStatus?.(elements,'Resetting scenario','loading');}
        },
        onReceipt:(receipt)=>{
          root.__simulatteTierRunReceipt=receipt;
          root.__simulatteComparisonExecutionReceipts=Object.freeze([receipt.actionResult.comparisonExecutionReceipt]);
          ctx.setJourneyPhase?.('completed');
          ctx.setRuntimeStatus?.(elements,'Complete','ready');
        },
        onError:(error)=>{ctx.setJourneyPhase?.('failed');ctx.setRuntimeStatus?.(elements,'Stopped','error');root.SimulatteRuntimeLog?.error?.('tier.run.failed',{message:error.message,code:error.code||null});},
      });
    }
    try {
      document.body.classList.add('world-explorer');
      ctx.setJourneyPhase?.('loading');
      ctx.setRuntimeStatus?.(elements,'Loading experience','loading');
      if(!root.SimulatteWorldRuntimeLoader?.loadSelectedProduct)throw new Error('tier_boot_runtime_loader_missing');
      await root.SimulatteWorldRuntimeLoader.loadSelectedProduct({tierId:tier,profileId:requestedProfileId||null});
      lifecycle.throwIfAborted();
      data=await root.SimulatteTierApplicationLoader.loadTierApplication({tier,requestedProfileId:requestedProfileId||null,fetchImpl:lifecycle.fetch});
      lifecycle.throwIfAborted();
      tierVisualizer=ctx.createTierVisualizer(elements.overlayCanvas,'world-tier-control');
      removeManualView=tierVisualizer.onManualView?.(()=>viewDirector?.setManualOverride({mode:'free',targetIds:[]}));
      await tierVisualizer.loadTier(tier);
      lifecycle.throwIfAborted();
      populateProfileSelect(elements.applicationProfile,data.profileEntries,data.applicationProfile.id);
      profileSelectUi=root.SimulatteApplicationProfileSelect.createApplicationProfileSelect({select:elements.applicationProfile,root:elements.applicationProfileControl,trigger:elements.applicationProfileTrigger,label:elements.applicationProfileLabel,listbox:elements.applicationProfileOptions});
      elements.applicationProfile.disabled=false;
      elements.applicationProfileTrigger.disabled=false;
      profileSelectUi.sync();
      on(elements.applicationProfile,'change',()=>{const value=elements.applicationProfile.value;if(value&&value!==data.applicationProfile.id)ctx.navigate?.({tier,experience:value});});
      wireTierControls({elements,tierVisualizer,profileSelectUi,activeTier:tier,hasProfiles:true,signal:lifecycle.signal,onSelectTier:ctx.onSelectTier});
      interaction=root.SimulatteApplicationProfileSelect.resolveInteraction(data.applicationProfile,{});
      const storedRun=root.SimulatteTierRunController.readStoredReceipt(root.sessionStorage,data.applicationProfile.id);
      activeScenario=interaction.scenarios.find((scenario)=>(
        scenario.id===storedRun?.scenario?.id&&scenario.seed===storedRun?.scenario?.seed
      ))||interaction.defaultScenario;
      renderScenario();
      await activateScenario(activeScenario);
      lifecycle.throwIfAborted();
      const owner=data.applicationProfile.interaction.simulationOwnerPluginId||runtime.activePluginIds[0];
      configureRunController(owner);
      on(elements.startButton,'click',()=>{void runController.start().catch(()=>{});});
      on(elements.pauseButton,'click',()=>runController.pause());
      on(elements.resumeButton,'click',()=>runController.resume());
      on(elements.stepButton,'click',()=>{void runController.step().catch(()=>{});});
      on(elements.replayButton,'click',()=>{void runController.replay().catch(()=>{});});
      on(elements.shuffleButton,'click',async()=>{
        runController?.dispose();
        elements.shuffleButton.disabled=true;
        elements.startButton.disabled=true;
        ctx.setJourneyPhase?.('loading');
        ctx.setRuntimeStatus?.(elements,'Loading scenario','loading');
        activeScenario=root.SimulatteApplicationProfileSelect.nextScenario(interaction,activeScenario.id);
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
          root.SimulatteRuntimeLog?.error?.('tier.scenario.activation.failed',{message:error.message,code:error.code||null});
        }finally{
          elements.shuffleButton.disabled=false;
          elements.startButton.disabled=false;
        }
      });
      on(window,'pagehide',()=>{void dispose();},{once:true});
      const restored=await runController.restore();
      if(!restored){ctx.setJourneyPhase?.('ready');ctx.setRuntimeStatus?.(elements,'Ready','ready');}
      return Object.freeze({ tier, experience: data.applicationProfile.id, dispose });
    } catch (error) {
      await dispose();
      throw error;
    }
  }

  function populateProfileSelect(select,entries,selectedId){select.replaceChildren(...entries.map((entry)=>{const option=document.createElement('option');option.value=entry.id;option.textContent=labelForProfile(entry.id);option.selected=entry.id===selectedId;return option;}));select.value=selectedId;}
  function labelForProfile(id){if(PROFILE_LABELS[id])return PROFILE_LABELS[id];return String(id).replace(/-v\d+$/,'').split('-').filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');}

  return Object.freeze({ TIER_LABELS, PROFILE_LABELS, createAppShell, wireTierControls, bootGovernedTierExplorer, labelForProfile, populateProfileSelect });
});
