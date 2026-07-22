(function attachWorldTiersBoot(root, factory) {
  const api = factory(root);
  root.SimulatteWorldTiersBoot = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTiersBoot(root) {
  const TIER_LABELS = Object.freeze({ city:'City', country:'Country', world:'Planet', 'solar-system':'Solar System', 'star-chart':'Universe' });
  const PROFILE_TIER = Object.freeze({
    'food-recall-us-v1':'country', 'maritime-trade-global-v1':'world',
    'orbital-transfer-planner-v1':'solar-system', 'interstellar-relay-network-v1':'star-chart',
  });

  function readTierFromUrl(view) {
    try { const tier=new URL(view.location.href).searchParams.get('tier'); return tier&&TIER_LABELS[tier]?tier:null; } catch(_error){ return null; }
  }
  function readProfileFromUrl(view) { try { return new URL(view.location.href).searchParams.get('profile'); } catch(_error){ return null; } }
  function writeTierParam(view,tier) { try { const url=new URL(view.location.href); url.searchParams.set('tier',tier); view.history.replaceState(view.history.state,'',url.toString()); } catch(_error){} }
  function setTierLabel(tier) { try { const label=document.getElementById('world-tier-label'); if(label&&TIER_LABELS[tier])label.textContent=TIER_LABELS[tier]; } catch(_error){} }
  function navigateTier(view,tier) { const url=new URL(view.location.href); url.searchParams.set('tier',tier); url.searchParams.delete('profile'); view.location.assign(url.toString()); }

  function wireTierControls(ctx) {
    const { elements, tierVisualizer, profileSelectUi } = ctx;
    const activeTier = ctx.activeTier || readTierFromUrl(window) || 'city';
    function close() { elements.worldTierControl.classList.remove('open'); elements.worldTierTrigger.setAttribute('aria-expanded','false'); elements.worldTierOptions.hidden=true; }
    elements.worldTierTrigger.addEventListener('click',(event)=>{event.stopPropagation();const open=!elements.worldTierControl.classList.contains('open');elements.worldTierControl.classList.toggle('open',open);elements.worldTierTrigger.setAttribute('aria-expanded',String(open));elements.worldTierOptions.hidden=!open;});
    window.addEventListener('click',close);
    const options=[...elements.worldTierOptions.querySelectorAll('.select-option')];
    options.forEach((option)=>option.addEventListener('click',(event)=>{event.stopPropagation();const tier=option.dataset.value;close();if(tier!==activeTier){ctx.beforeTierChange?.();navigateTier(window,tier);} }));
    options.forEach((option)=>option.classList.toggle('selected',option.dataset.value===activeTier));
    elements.worldTierLabel.textContent=TIER_LABELS[activeTier]||'Select scale';
    const hasProfiles=ctx.hasProfiles!==false;
    elements.applicationProfileControl.classList.toggle('is-empty',!hasProfiles);
    elements.applicationProfileTrigger.disabled=!hasProfiles;
    elements.applicationProfileTrigger.setAttribute('aria-disabled',String(!hasProfiles));
    if(hasProfiles)profileSelectUi?.sync(); else elements.applicationProfileLabel.textContent='No experiences for this scale';
    return async function selectWorldTier(tier){ if(tier!==activeTier){navigateTier(window,tier);return;} if(tierVisualizer)await tierVisualizer.loadTier(tier); };
  }

  async function bootGovernedTierExplorer(ctx,tier) {
    const required=['SimulatteTierApplicationLoader','SimulattePluginRuntime','SimulatteGeneratedPluginRegistry','SimulatteDeclarativeUiHost','SimulatteApplicationProfileSelect','SimulattePluginRandom','SimulattePluginScheduler','SimulattePluginCompute','SimulattePluginEnvironment','SimulattePluginGeography','SimulatteAutonomyReceipts'];
    const missing=required.find((name)=>!root[name]);
    if(missing)throw new Error(`tier_boot_dependency_missing: ${missing}`);
    const elements=ctx.collectElements();
    document.body.classList.add('world-explorer');
    ctx.setJourneyPhase?.('loading'); ctx.setRuntimeStatus?.(elements,'Loading experience','loading');
    const requestedProfileId=readProfileFromUrl(window);
    const data=await root.SimulatteTierApplicationLoader.loadTierApplication({tier,requestedProfileId});
    const tierVisualizer=ctx.createTierVisualizer(elements.overlayCanvas,'world-tier-control');
    await tierVisualizer.loadTier(tier);
    populateProfiles(elements.applicationProfile,data.profileEntries,data.applicationProfile.id);
    const profileSelectUi=root.SimulatteApplicationProfileSelect.createApplicationProfileSelect({select:elements.applicationProfile,root:elements.applicationProfileControl,trigger:elements.applicationProfileTrigger,label:elements.applicationProfileLabel,listbox:elements.applicationProfileOptions});
    elements.applicationProfile.disabled=false; elements.applicationProfileTrigger.disabled=false; profileSelectUi.sync();
    elements.applicationProfile.addEventListener('change',()=>{const url=new URL(window.location.href);url.searchParams.set('tier',tier);url.searchParams.set('profile',elements.applicationProfile.value);window.location.assign(url.toString());});
    wireTierControls({elements,tierVisualizer,profileSelectUi,activeTier:tier,hasProfiles:true,beforeTierChange:()=>{void runtime?.dispose();}});

    const interaction=root.SimulatteApplicationProfileSelect.resolveInteraction(data.applicationProfile,{});
    let activeScenario=interaction.defaultScenario;
    let runtime=null;
    let pluginUi=null;

    function environmentSnapshots(){ const ids=['us.environment.snapshot.v1']; return Object.fromEntries(ids.flatMap((id)=>{try{const value=data.dataCatalog.optional(id);return value?[[id,value]]:[];}catch(_error){return[];}})); }
    function createCorePorts(scenario){
      return Object.freeze({
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
      if(runtime)await runtime.dispose();
      runtime=await root.SimulattePluginRuntime.createPluginRuntime({registry:root.SimulatteGeneratedPluginRegistry,profile:data.applicationProfile,scenario,dataCatalog:data.dataCatalog,artifactStore:data.artifactStore,registryBaseUrl:data.registryBaseUrl,corePorts:createCorePorts(scenario)});
      pluginUi=root.SimulatteDeclarativeUiHost.createDeclarativeUiHost({rootElements:{inspector:elements.pluginInspector,map:elements.pluginMapUi,hud:elements.pluginHudUi},onAction:async({pluginId,actionId,command,values})=>{
        if(command?.kind==='camera.focus'){tierVisualizer.focusPluginTarget?.(`plugin:${pluginId}:${command.targetId}`);return;}
        await runtime.dispatchAction(pluginId,actionId,{values,scenario:activeScenario,routeObjective:data.applicationProfile.routeObjective});
        renderPlugins();
      }});
      renderPlugins();
    }
    function renderPlugins(){ if(!runtime)return;pluginUi.render(runtime.views({scenario:activeScenario,compositionSize:runtime.activePluginIds.length}));tierVisualizer.setPluginPresentations?.(runtime.presentations({scenario:activeScenario})); }
    function renderScenario(){root.SimulatteApplicationProfileSelect.renderInteraction(interaction,activeScenario,elements);elements.missionField.hidden=true;elements.scenarioField.hidden=false;elements.startButton.hidden=false;elements.shuffleButton.hidden=interaction.scenarios.length<2;elements.pauseButton.hidden=true;elements.resumeButton.hidden=true;elements.replayButton.hidden=true;elements.newMissionButton.hidden=true;elements.modelSelectionControls?.replaceChildren();}
    renderScenario();
    await activateScenario(activeScenario);
    const owner=data.applicationProfile.interaction.simulationOwnerPluginId||runtime.activePluginIds[0];
    elements.startButton.addEventListener('click',async()=>{try{elements.startButton.disabled=true;ctx.setJourneyPhase?.('running');ctx.setRuntimeStatus?.(elements,'Running scenario','active');const actionResult=await runtime.dispatchAction(owner,'scenario.run',{scenario:activeScenario,values:{}});if(!actionResult||actionResult.status!=='settled')throw new Error(`tier_scenario_action_refused: ${owner} returned ${actionResult?.status||'missing'}`);const settlement=await runtime.settle({scenario:activeScenario,actionResult});root.__simulatteTierRunReceipt=Object.freeze({schema:'simulatte.tierRunReceipt.v1',tier,profileId:data.applicationProfile.id,scenario:activeScenario,actionResult,settlement,pluginRuntime:runtime.runtimeReceipt(),loadReceipt:data.receipt});renderPlugins();ctx.setJourneyPhase?.('completed');ctx.setRuntimeStatus?.(elements,'Complete','ready');}catch(error){ctx.setJourneyPhase?.('failed');ctx.setRuntimeStatus?.(elements,'Stopped','error');throw error;}finally{elements.startButton.disabled=false;}});
    elements.shuffleButton.addEventListener('click',async()=>{activeScenario=root.SimulatteApplicationProfileSelect.nextScenario(interaction,activeScenario.id);renderScenario();await activateScenario(activeScenario);});
    window.addEventListener('pagehide',()=>{void runtime?.dispose();profileSelectUi.dispose();tierVisualizer.stop();},{once:true});
    ctx.setJourneyPhase?.('ready');ctx.setRuntimeStatus?.(elements,'Ready','ready');
  }

  function populateProfiles(select,entries,selectedId){select.replaceChildren(...entries.map((entry)=>{const option=document.createElement('option');option.value=entry.id;option.textContent=labelForProfile(entry.id);option.selected=entry.id===selectedId;return option;}));select.value=selectedId;}
  function labelForProfile(id){return id.split('-').map((part)=>part==='v1'?'':part.charAt(0).toUpperCase()+part.slice(1)).filter(Boolean).join(' ');}

  async function bootLanding(ctx){
    const landing=document.getElementById('world-tiers-landing-page');
    const view=(landing&&landing.ownerDocument.defaultView)||(typeof window!=='undefined'?window:null);
    const profile=view?readProfileFromUrl(view):null;
    let tier=view?readTierFromUrl(view):null;
    if(!tier&&profile&&PROFILE_TIER[profile])tier=PROFILE_TIER[profile];
    const routeTier=async(selected)=>{ if(selected==='city')return ctx.startApp('city'); if(!ctx.createTierVisualizer)throw new Error('tier_visualizer_missing'); return bootGovernedTierExplorer(ctx,selected); };
    if(!landing||tier||profile){tier=tier||'city';if(view)writeTierParam(view,tier);setTierLabel(tier);landing?.classList.add('hidden');await routeTier(tier);return;}
    let chosen=false;
    const choose=async(selected)=>{if(chosen)return;chosen=true;if(view)writeTierParam(view,selected);setTierLabel(selected);landing.classList.add('hidden');await new Promise((resolve)=>view.setTimeout(resolve,160));await routeTier(selected);};
    const grid=landing.querySelector('.tier-cards-grid');
    const setParallax=(x,y)=>{landing.style.setProperty('--parallax-x',x.toFixed(3));landing.style.setProperty('--parallax-y',y.toFixed(3));};
    grid?.addEventListener('mousemove',(event)=>{const rect=grid.getBoundingClientRect();landing.classList.add('is-parallax');setParallax(((event.clientX-rect.left)/rect.width-.5)*2,((event.clientY-rect.top)/rect.height-.5)*2);});
    grid?.addEventListener('mouseleave',()=>{landing.classList.remove('is-parallax');setParallax(0,0);});
    [...landing.querySelectorAll('.tier-card')].forEach((card)=>card.addEventListener('click',()=>{void choose(card.dataset.tier);}));
  }

  return Object.freeze({ TIER_LABELS, readTierFromUrl, writeTierParam, wireTierControls, bootGovernedTierExplorer, bootLanding });
});
