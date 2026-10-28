// Study workspace: the Excalidraw canvas (vendored 0.17.6) driven by an authored composable study.
// Each stage's authored graph is drawn fresh; the learner's edits are kept per stage as an overlay,
// saved in this browser and exported with the untouched authored document.
(function (root) {
  'use strict';
  const {React, ReactDOM, ExcalidrawLib: X, SimulatteComposableStudy: Study, SimulatteStudyScene: Scene, SimulatteSpatialLayout: Spatial, SimulatteStageShortcuts: StageShortcuts, SimulatteStudyGuide: StudyGuide, SimulatteStudyWorkspace: Store, SimulatteStudyPanels: P} = root;
  for (const [name, value] of Object.entries({React, ReactDOM, X, Study, Scene, Store, P})) if (!value) throw Error(`Study workspace needs ${name} loaded first`);
  const {createElement: h, useState, useEffect, useRef, useCallback, useMemo} = React;
  const {Excalidraw, MainMenu, Footer, Sidebar} = X;
  const DATA = new URL('../../../data/system-diagram/', document.baseURI);
  const EMBED_ROLE=root.SimulatteStudyLiveInput.role(root), COMPACT=!!EMBED_ROLE, READ_ONLY=EMBED_ROLE==='observer';
  const STUDY_KEY='simulatte.studyMode.v1';
  const comparison=new URLSearchParams(root.location.search).get('compare');
  const workspaceKey=ref=>Store.storageKey(ref)+(comparison?'::compare:'+comparison:'');
  const Theme=root.SimulatteStudyTheme;
  const THEME_KEY = 'simulatte.theme.v1', SIDEBAR = 'study', CONNECTED = '#1971c2';
  const TABS = [['practice','Practice'], ['stage', 'Stage'], ['inspect', 'Inspect'], ['approach', 'Approach'], ['problem', 'Problem'], ['file', 'File']];

  const storage = {
    get(key) { try { return root.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { root.localStorage.setItem(key, value); },
  };
  function initialTheme() {
    return Theme.resolve(Theme.preference(storage.get(THEME_KEY)),root.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  async function fetchText(url) { const response = await fetch(url); if (!response.ok) throw Error(`${url.pathname}: HTTP ${response.status}`); return response.text(); }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], {type: 'application/json'})), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const clock = () => new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
  function readQuery() { const q = new URLSearchParams(root.location.search); return {problem: q.get('problem'), approach: q.get('approach'), stage: q.has('stage') ? Number(q.get('stage')) : null}; }
  function writeQuery(ws) {
    const q = new URLSearchParams(root.location.search);
    q.set('problem', ws.document.problem.referenceId); q.set('approach', ws.view.solutionId); q.set('stage', String(ws.view.stageIndex + 1));
    root.history.replaceState(null, '', `/lucyd?${q}`);
  }
  // Keys typed in study controls (pickers, stepper, sidebar) must not reach Excalidraw's canvas shortcuts,
  // which listen on its container. Escape still closes menus and the sidebar.
  const isolateKeys = event => { if (event.key !== 'Escape') event.stopPropagation(); };
  const solutionOf = ws => ws?.document.solutions.find(s => s.id === ws.view.solutionId) || null;
  const graphOf = ws => { const s = solutionOf(ws); return ws.view.stageIndex < 0 ? s.initialGraph : s.stages[ws.view.stageIndex].graph; };
  const stageKeyOf = ws => Store.stageKey(solutionOf(ws), ws.view.stageIndex);

  function App() {
    const apiRef = useRef(null), wsRef = useRef(null), authoredRef = useRef([]), loadingRef = useRef(false), versionRef = useRef(-1);
    const renderGeneration = useRef(0), pointerActive = useRef(false), reviewCache=useRef({ref:null,others:[]});
    const selectionRef = useRef(''), themeRef = useRef(initialTheme()), timers = useRef({}), publishedRef = useRef(new Map()), catalogueRef = useRef([]), fileInput = useRef(null), loadRef = useRef(0);
    const [api, setApi] = useState(null);
    const [themeMode,setThemeMode]=useState(()=>Theme.preference(storage.get(THEME_KEY)));
    const themeModeRef=useRef(themeMode);
    const applyTheme=useCallback((mode,persist=true)=>{
      mode=Theme.preference(mode);themeModeRef.current=mode;setThemeMode(mode);
      const resolved=Theme.resolve(mode,root.matchMedia('(prefers-color-scheme: dark)').matches);
      themeRef.current=resolved;document.documentElement.dataset.theme=resolved;
      if(apiRef.current?.getAppState().theme!==resolved)apiRef.current?.updateScene({appState:{theme:resolved},captureUpdate:X.CaptureUpdateAction.NEVER});
      if(persist)try{storage.set(THEME_KEY,mode);}catch{}
    },[]);
    useEffect(()=>{const media=root.matchMedia('(prefers-color-scheme: dark)'),change=()=>{if(themeModeRef.current==='system')applyTheme('system',false);};applyTheme(themeModeRef.current,false);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[api,applyTheme]);
    const [catalogue, setCatalogue] = useState([]);
    const [ws, setWsState] = useState(null);
    const [built, setBuilt] = useState(null);
    const [selection, setSelection] = useState([]);
    const [saveStatus, setSaveStatus] = useState('Nothing loaded yet');
    const [notice, setNotice] = useState(null);
    const [preview, setPreview] = useState(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [docked, setDocked] = useState(false);
    const [answerFirst,setAnswerFirst]=useState(()=>storage.get('simulatte.answerFirst.v1')==='on');
    const Practice=root.SimulatteStudyPractice;
    const enablePractice=()=>{setAnswerFirst(true);storage.set('simulatte.answerFirst.v1','on');apiRef.current?.toggleSidebar({name:SIDEBAR,tab:'practice',force:true});};
    const [studyMode,setStudyMode]=useState(()=>storage.get(STUDY_KEY)!=='off');
    const studyModeRef=useRef(studyMode);studyModeRef.current=studyMode;
    const toggleStudyMode=()=>setStudyMode(current=>{const next=!current;try{storage.set(STUDY_KEY,next?'on':'off');}catch{}return next;});
    const setWs = next => { wsRef.current = next; setWsState(next); };
    const solution = solutionOf(ws);
    // Read-only view for scripted acceptance checks; it exposes state, never mutators.
    useEffect(() => { root.SimulatteStudyInspector = Object.freeze({ready: () => !!apiRef.current && !!wsRef.current, elements: () => apiRef.current?.getSceneElements() || [], files: () => Object.keys(apiRef.current?.getFiles() || {}), appState: () => apiRef.current?.getAppState() || null, workspace: () => wsRef.current}); }, []);

    const save = useCallback(() => {
      if(READ_ONLY)return;
      clearTimeout(timers.current.save);
      timers.current.save = setTimeout(() => {
        const current = wsRef.current; if (!current) return;
        try { storage.set(workspaceKey(current.document.problem.referenceId), Store.serialize(current)); setSaveStatus(`Saved in ${comparison?"this comparison window":"this browser"} at ${clock()}`); }
        catch (error) { setSaveStatus(`Not saved in this browser (${error.message}). Export to keep your work.`); }
      }, 300);
    }, []);

    // Draw the current stage: authored scene plus this stage's overlay. Navigation never enters undo history.
    const render = useCallback((next, {fit = false} = {}) => {
      const excalidraw = apiRef.current; if (!excalidraw || !next) return;
      const generation = ++renderGeneration.current;
      const sol = solutionOf(next);
      const result = Scene.build(next.document, sol, next.view.stageIndex, {collapsed: next.view.collapsed, showRemoved: next.view.showRemoved});
      const authored = X.restoreElements(result.elements, null);
      const overlay = Store.overlayFor(next, sol.id, stageKeyOf(next));
      authoredRef.current = authored;
      loadingRef.current = true;
      if (overlay?.files) excalidraw.addFiles(Object.values(overlay.files));
      excalidraw.updateScene({elements: X.restoreElements(Scene.applyOverlay(authored, overlay), null, {repairBindings:true,refreshDimensions:true}), appState: {selectedElementIds: {}, editingTextElement: null, currentItemFontFamily: Spatial.metrics.fontFamily, name: `${next.document.problem.referenceId} ${sol.title}`}, captureUpdate: X.CaptureUpdateAction.NEVER});
      excalidraw.history.clear();
      versionRef.current = X.getSceneVersion(excalidraw.getSceneElementsIncludingDeleted());
      loadingRef.current = false;
      if (fit) root.requestAnimationFrame(() => {
        if (renderGeneration.current !== generation) return;
        const minimum=Spatial.policy.layout.minimumReadingZoom,state=excalidraw.getAppState();
        const boxes=authored.filter(e=>e.customData?.study?.role==='node');
        const width=Math.max(...boxes.map(e=>e.x+e.width))-Math.min(...boxes.map(e=>e.x)),height=Math.max(...boxes.map(e=>e.y+e.height))-Math.min(...boxes.map(e=>e.y));
        const changed=boxes.filter(e=>e.customData.study.change),wouldShrink=Math.min((state.width-150)/width,(state.height-180)/height)<minimum;
        excalidraw.scrollToContent(wouldShrink&&changed.length?changed:undefined,{fitToContent:true,minZoom:minimum,maxZoom:1,animate:false,canvasOffsets:{top:92,bottom:!COMPACT&&studyModeRef.current?300:76,left:20,right:document.querySelector('.sw-sidebar')?.getBoundingClientRect().width+20||20}});
      });
      setBuilt(result); writeQuery(next);
    }, []);

    // Turn whatever is on the canvas into this stage's overlay.
    const capture = useCallback(() => {
      if(READ_ONLY)return;
      clearTimeout(timers.current.capture);
      const excalidraw = apiRef.current, current = wsRef.current; if (!excalidraw || !current) return;
      const sol = solutionOf(current), key = stageKeyOf(current), previous = Store.overlayFor(current, sol.id, key);
      const overlay = Scene.diff(authoredRef.current, excalidraw.getSceneElementsIncludingDeleted(), previous);
      const fileIds = overlay.elements.filter(el => el.type === 'image' && el.fileId).map(el => el.fileId);
      if (fileIds.length) { const files = excalidraw.getFiles(); overlay.files = Object.fromEntries(fileIds.filter(id => files[id]).map(id => [id, files[id]])); }
      const next = Store.withOverlay(current, sol.id, key, overlay, Scene.isEmpty);
      if (Study.same(next.overlays, current.overlays)) return;
      setWs(next); save();
    }, [save]);

    const onChange = useCallback((elements, appState) => {
      const selected = Object.keys(appState.selectedElementIds || {}).filter(id => appState.selectedElementIds[id]).sort().join(',');
      if (selected !== selectionRef.current) { selectionRef.current = selected; setSelection(selected ? selected.split(',') : []); }
      if (appState.theme !== themeRef.current) {
        themeRef.current = appState.theme; themeModeRef.current=appState.theme;setThemeMode(appState.theme);document.documentElement.dataset.theme = appState.theme;
        try { storage.set(THEME_KEY, appState.theme); } catch { /* preference only */ }
      }
      if (loadingRef.current || !wsRef.current) return;
      const version = X.getSceneVersion(elements);
      if (version === versionRef.current) return;
      versionRef.current = version;
      clearTimeout(timers.current.capture); timers.current.capture = setTimeout(capture, 250);
    }, [capture]);

    const navigate = useCallback((patch, options) => {
      if (!wsRef.current) return;
      capture();
      const next = Store.withView(wsRef.current, patch);
      setWs(next); render(next, options || {fit: patch.stageIndex !== undefined || patch.solutionId !== undefined}); save();
    }, [capture, render, save]);

    // A problem load finishes asynchronously; only the newest load may replace the workspace, so a slow
    // response can never undo navigation or a later choice made while it was in flight.
    const openProblem = useCallback(async (referenceId, view = {}) => {
      const load = ++loadRef.current;
      if (wsRef.current && !READ_ONLY) { capture(); clearTimeout(timers.current.save); try { storage.set(workspaceKey(wsRef.current.document.problem.referenceId), Store.serialize(wsRef.current)); } catch { /* reported on next save */ } }
      const item = catalogueRef.current.find(c => c.referenceId === referenceId);
      try {
        if(!item?.path && storage.get(workspaceKey(referenceId))){const next=Store.parse(storage.get(workspaceKey(referenceId))).workspace;await Spatial.prepare(next.document);if(load!==loadRef.current)return;setWs(next);render(next,{fit:true});return;}
        if (!item?.path) throw Error(`${referenceId} is not in the study catalogue`);
        const published = Study.parse(await fetchText(new URL(`composable-solutions/${item.path}`, DATA)));
        if (load !== loadRef.current) return;
        publishedRef.current.set(referenceId, published);
        let next = null, status = 'Published solution loaded. Your edits will be saved in this browser.';
        const saved = storage.get(workspaceKey(referenceId))||(comparison?storage.get(Store.storageKey(referenceId)):null);
        if (saved) {
          try { next = Store.parse(saved).workspace; status = 'Restored your saved workspace from this browser.'; }
          catch (error) { status = `Your saved workspace could not be read (${error.message}); showing the published version.`; }
        }
        next = next ? Store.refreshExplanations(next,published) : Store.create(published);
        await Spatial.prepare(next.document);
        if (load !== loadRef.current) return;
        if (view.resetStage) next = Store.withView(next, {stageIndex:0, collapsed:[], showRemoved:false});
        const sol = next.document.solutions.find(s => s.id === view.approach);
        if (sol) next = Store.withView(next, {solutionId: sol.id, stageIndex: Number.isInteger(view.stage) && view.stage >= 0 && view.stage <= sol.stages.length ? view.stage - 1 : 0});
        setWs(next); render(next, {fit: true}); setSaveStatus(status);
      } catch (error) { if (load === loadRef.current) setNotice({title: `Could not open ${referenceId}`, message: error.message}); }
    }, [capture, render]);

    // Boot: catalogue from the generated manifest plus titles and attribution from problems.json.
    useEffect(() => {
      if (!api) return;
      (async () => {
        try {
          // Use the same font for measured layout and the first restored canvas.
          await Promise.all(['18px Nunito', '16px Nunito'].map(font => document.fonts.load(font)));
          const [manifest, problems, policy, metrics] = await Promise.all(['composable-solutions/manifest.json','problems.json','spatial-policy.json','study-font-metrics.json'].map(p => fetchText(new URL(p, DATA)).then(JSON.parse)));
          Spatial.configure(policy, metrics);
          const byRef = new Map(problems.problems.map(p => [p.referenceId, p]));
          const list = manifest.problems.map(p => ({...byRef.get(p.referenceId), referenceId: p.referenceId, path: p.path, title: byRef.get(p.referenceId)?.title || p.referenceId}));
          catalogueRef.current = list; setCatalogue(list);
          const query = readQuery(), start = list.find(p => p.referenceId === query.problem) || list[0];
          if (start && !root.SimulatteStudyLiveInput.enabled(root)) await openProblem(start.referenceId, query);
          if(root.SimulatteStudyLiveInput.enabled(root))root.parent.postMessage({type:'lucyd.live.ready'},root.location.origin);
        } catch (error) { setNotice({title: 'Could not load the study catalogue', message: error.message}); }
      })();
    }, [api, openProblem]);
    useEffect(() => { document.documentElement.dataset.theme = themeRef.current; }, []);

    // Excalidraw drops the pointer on pointercancel without settling its draft, so the next tap
    // completes a stale draft. When the browser cancels a pointer (system gesture, palm rejection),
    // end the gesture here and discard the shape that was being created; nothing half-drawn remains.
    useEffect(() => {
      if (!api) return undefined;
      const container = document.querySelector('.excalidraw');
      const onCancel = event => {
        if (!event.isTrusted) return;
        const state = api.getAppState(), draft = state.newElement;
        root.dispatchEvent(new PointerEvent('pointerup', {pointerId: event.pointerId, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY, bubbles: true}));
        if (!draft) return;
        root.setTimeout(() => {
          const elements = api.getSceneElementsIncludingDeleted();
          if (!elements.some(el => el.id === draft.id && !el.isDeleted)) return;
          api.updateScene({elements: elements.map(el => (el.id === draft.id ? X.newElementWith(el, {isDeleted: true}) : el)), appState: {selectedElementIds: {}, newElement: null, editingTextElement: null}, captureUpdate: X.CaptureUpdateAction.NEVER});
        }, 0);
      };
      container?.addEventListener('pointercancel', onCancel, true);
      return () => container?.removeEventListener('pointercancel', onCancel, true);
    }, [api]);

    const onFile = async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      try { const parsed = Store.parse(await file.text()); await Spatial.prepare(parsed.workspace.document); setPreview({parsed, name:file.name}); }
      catch (error) { setNotice({title: `${file.name} was not imported`, message: `${error.message}. Your current workspace is unchanged.`}); }
    };
    const confirmImport = () => {
      const {parsed} = preview; ++loadRef.current; setPreview(null);
      if (wsRef.current) capture();
      const next = parsed.workspace, ref = next.document.problem.referenceId;
      if (!catalogueRef.current.some(c => c.referenceId === ref)) { const list = [...catalogueRef.current, {referenceId: ref, title: `${next.document.problem.studyLabel} (imported)`}]; catalogueRef.current = list; setCatalogue(list); }
      setWs(next); render(next, {fit: true}); save();
    };
    // A paired local workbench may supply unverified design documents. Ordinary hosted pages
    // never enable this input. Only the actual same-origin parent can send or receive a workspace.
    useEffect(() => {
      const Live=root.SimulatteStudyLiveInput;
      if(!api || !Live.enabled(root))return;
      let revision=-1, generation=0;
      const send=(type,extra={})=>root.parent.postMessage({type,...extra},root.location.origin);
      const receive=async event=>{
        if(!Live.allowed(event,root))return;
        const value=event.data;
        if(value?.type==='lucyd.problem.open' && catalogueRef.current.some(c=>c.referenceId===value.referenceId)){await openProblem(value.referenceId,{resetStage:true});return;}
        if(value?.type==='lucyd.workspace.request'){
          capture();const current=wsRef.current;
          if(current)send('lucyd.workspace',{requestId:value.requestId,workspace:JSON.parse(Store.serialize(current))});
          return;
        }
        if(value?.type!=='lucyd.live.workspace' || !Number.isSafeInteger(value.revision) || value.revision<=revision)return;
        const mine=++generation,load=loadRef.current;
        try{
          const incoming=Store.parse(JSON.stringify(value.workspace)).workspace;
          await Spatial.prepare(incoming.document);
          if(mine!==generation||load!==loadRef.current)return;
          ++loadRef.current;capture();
          const next=READ_ONLY||value.preserveEdits===false?incoming:Live.merge(wsRef.current,incoming,Store);
          const ref=next.document.problem.referenceId;
          if(!catalogueRef.current.some(c=>c.referenceId===ref)){
            const list=[...catalogueRef.current,{referenceId:ref,title:next.document.problem.studyLabel}];catalogueRef.current=list;setCatalogue(list);
          }
          const first=!wsRef.current;revision=value.revision;setWs(next);render(next,{fit:first||!!value.fit});save();
          setSaveStatus('Live suggestions updated. Your stage edits are preserved.');send('lucyd.live.applied',{revision});
        }catch(error){send('lucyd.live.error',{message:error.message});}
      };
      root.addEventListener('message',receive);
      return()=>{++generation;root.removeEventListener('message',receive);};
    },[api,capture,render,save,openProblem]);
    const exportWorkspace = () => { capture(); const current = wsRef.current; if (current) download(`${current.document.problem.referenceId.toLowerCase()}-study-workspace.json`, Store.serialize(current)); };
    const exportAuthored = () => { const current = wsRef.current; if (current) download(`${current.document.problem.referenceId.toLowerCase()}.json`, Study.serialize(current.document)); };
    const discardEdits = () => {
      setConfirmDiscard(false);
      const current = wsRef.current, published = current && publishedRef.current.get(current.document.problem.referenceId);
      if (!published) { setNotice({title: 'No published version', message: 'This workspace was imported and has no published version in the catalogue.'}); return; }
      const next = Store.create(published); setWs(next); render(next, {fit: true}); save();
    };
    const resetStage = () => { const current = wsRef.current; const next = Store.withOverlay(current, solutionOf(current).id, stageKeyOf(current), null, Scene.isEmpty); setWs(next); render(next); save(); };
    const toggleCollapse = nodeId => { const set = new Set(wsRef.current.view.collapsed); if (set.has(nodeId)) set.delete(nodeId); else set.add(nodeId); navigate({collapsed: [...set]}); };

    // What the current selection is, in study terms.
    const info = useMemo(() => {
      if (!ws || !solution || !api) return null;
      if (!selection.length) return {kind: 'none'};
      const all = api.getSceneElements(), byId = new Map(all.map(el => [el.id, el]));
      let elements = selection.map(id => byId.get(id)).filter(Boolean).map(el => (el.containerId && byId.get(el.containerId)) || el);
      elements = [...new Map(elements.map(el => [el.id, el])).values()];
      if (elements.length !== 1) return {kind: 'multiple', count: elements.length};
      const el = elements[0], study = el.customData?.study, graph = graphOf(ws), doc = ws.document;
      const nodes = new Map(graph.nodes.map(n => [n.id, n])), contracts = new Map(doc.contracts.map(c => [c.id, c]));
      if (!study || study.role === 'user-connection-label') {
        if (el.type !== 'arrow') return {kind: 'sketch'};
        const end = side => byId.get(el[side]?.elementId)?.customData?.study?.nodeId;
        const connection = el.customData?.studyConnection || null, match = Scene.portMatches(doc, graph, end('startBinding'), end('endBinding'));
        return {kind: 'arrow', element: el, connection, contract: connection && contracts.get(connection.contractId), options: match.options, reason: match.reason};
      }
      if (study.role === 'edge') { const edge = graph.edges.find(e => e.id === study.edgeId); return edge && {kind: 'edge', edge, from: nodes.get(edge.from.nodeId), to: nodes.get(edge.to.nodeId), contract: contracts.get(edge.contractId), change: study.change}; }
      if (study.role === 'port-mapping') { const sub = doc.subsystems.find(s => s.id === nodes.get(study.nodeId)?.subsystemId); return {kind: 'mapping', port: sub?.ports.find(p => p.id === study.portId)}; }
      const node = nodes.get(study.nodeId);
      if (!node) return {kind: 'sketch'};
      return {kind: 'node', node, definition: doc.components.find(c => c.id === node.definitionId), subsystem: node.subsystemId && doc.subsystems.find(s => s.id === node.subsystemId),
        parent: node.parentId && nodes.get(node.parentId), change: study.change, collapsed: ws.view.collapsed.includes(node.id)};
    }, [ws, solution, selection, api]);

    // Give a learner-drawn arrow a typed contract, or turn it back into a sketch. Both are undoable.
    const connect = option => {
      const excalidraw = apiRef.current, arrow = info?.element; if (!excalidraw || !arrow) return;
      const hasLabel = (arrow.boundElements || []).some(b => b.type === 'text');
      const label = hasLabel ? null : X.restoreElements([Scene.labelFor(arrow, option.contractId, CONNECTED)], null)[0];
      const elements = excalidraw.getSceneElementsIncludingDeleted().map(el => el.id !== arrow.id ? el : X.newElementWith(el, {strokeColor: CONNECTED,
        customData: {...(el.customData || {}), studyConnection: {...option, mode: 'request-response', labelId: label?.id || null}}, boundElements: [...(el.boundElements || []), ...(label ? [{type: 'text', id: label.id}] : [])]}));
      excalidraw.updateScene({elements: label ? [...elements, label] : elements, captureUpdate: X.CaptureUpdateAction.IMMEDIATELY});
    };
    const disconnect = () => {
      const excalidraw = apiRef.current, arrow = info?.element; if (!excalidraw || !arrow) return;
      const labelId = arrow.customData?.studyConnection?.labelId;
      const elements = excalidraw.getSceneElementsIncludingDeleted().map(el => {
        if (el.id === labelId) return X.newElementWith(el, {isDeleted: true});
        if (el.id !== arrow.id) return el;
        const {studyConnection, ...rest} = el.customData || {};
        return X.newElementWith(el, {strokeColor: '#1e1e1e', customData: rest, boundElements: (el.boundElements || []).filter(b => b.id !== labelId)});
      });
      excalidraw.updateScene({elements, captureUpdate: X.CaptureUpdateAction.IMMEDIATELY});
    };

    const stageIndex = ws?.view.stageIndex ?? 0, minIndex = solution?.initialGraph.nodes.length ? -1 : 0;
    const edited = !!(ws && solution && Store.overlayFor(ws, solution.id, stageKeyOf(ws)));
    const stageTitle = solution ? (stageIndex < 0 ? 'Starting point' : solution.stages[stageIndex].title) : 'Loading';
    const editedStages = ws ? Object.values(ws.overlays).reduce((n, stages) => n + Object.keys(stages).length, 0) : 0;
    const entry = catalogue.find(c => c.referenceId === ws?.document.problem.referenceId);
    const followups = useMemo(() => new Map((entry?.followups || []).map(f => [f.id, f])), [entry]);
    // Steps are relative to the latest workspace, not the last render, so quick repeated clicks never re-request a stage.
    const step = delta => {
      const current = wsRef.current, sol = solutionOf(current); if (!sol) return;
      const lowest = sol.initialGraph.nodes.length ? -1 : 0, target = Math.max(lowest, Math.min(sol.stages.length - 1, current.view.stageIndex + delta));
      if (target !== current.view.stageIndex) navigate({stageIndex: target});
    };
    useEffect(() => {
      if (!api) return;
      const onStageKey = event => {
        const modalOpen=!!document.querySelector('dialog[open]');
        if(COMPACT)return;
        const delta=StageShortcuts.direction(event,api.getAppState(),modalOpen);
        if (!delta || pointerActive.current || !wsRef.current) return;
        event.preventDefault(); event.stopImmediatePropagation(); step(delta);
      };
      const down=e=>{if(e.target?.closest?.('canvas'))pointerActive.current=true;},up=()=>{pointerActive.current=false;};
      root.addEventListener('keydown',onStageKey,true);root.addEventListener('pointerdown',down,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',up,true);root.addEventListener('blur',up);
      return () => {root.removeEventListener('keydown',onStageKey,true);root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',up,true);root.removeEventListener('blur',up);};
    },[api,navigate]);
    const stepper = solution && h(P.Stepper, {stageIndex, minIndex, count: solution.stages.length, title: stageTitle, edited, onStep: step, onReset: resetStage});
    const pickers = h(P.Pickers, {catalogue, referenceId: ws?.document.problem.referenceId, solutions: ws?.document.solutions, solutionId: ws?.view.solutionId,
      onProblem: ref => {if(root.SimulatteStudyLiveInput.enabled(root))root.parent.postMessage({type:'lucyd.user.navigation'},root.location.origin);openProblem(ref,{resetStage:true});},
      onSolution: id => navigate({solutionId: id, stageIndex: 0,collapsed:[],showRemoved:false}, {fit: true})});
    const trigger = h(Sidebar.Trigger, {name: SIDEBAR, tab: 'stage', title: 'Study notes', className: 'sw-trigger'}, 'Notes');
    const openStudy = () => apiRef.current?.toggleSidebar({name: SIDEBAR, tab: 'stage', force: true});
    const patchPractice=patch=>{const current=wsRef.current,sol=solutionOf(current),stage=sol.stages[current.view.stageIndex];if(!stage)return;setWs(Practice.update(current,sol,stage,patch));save();};
    const reviewItems=()=>{const current=wsRef.current,ref=current.document.problem.referenceId;if(reviewCache.current.ref!==ref){const others=[];try{for(let i=0;i<root.localStorage.length;i++){const key=root.localStorage.key(i);if(key.startsWith(Store.STORAGE_PREFIX)&&key!==Store.storageKey(ref)){try{others.push(Store.parse(root.localStorage.getItem(key)).workspace);}catch{}}}}catch{}reviewCache.current={ref,others};}return Practice.due([current,...reviewCache.current.others]);};
    const concealed=ws&&solution?Practice.hidden(ws,solution,solution.stages[stageIndex],answerFirst):false;
    const panel = tab => {
      if (!ws || !solution) return h('p', {className: 'sw-muted'}, 'Loading study…');
      if(tab==='practice')return h(Practice.Panel,{workspace:ws,solution,stageIndex,onPatch:patchPractice,reviewItems:reviewItems(),onOpen:async item=>{await openProblem(item.referenceId,{approach:item.solutionId,stage:item.stageIndex+1});const current=wsRef.current,sol=solutionOf(current);if(current.document.problem.referenceId!==item.referenceId||sol.id!==item.solutionId)return;setWs(Practice.beginReview(current,sol,sol.stages[current.view.stageIndex]));save();enablePractice();},onCompare:id=>{const other=ws.document.solutions.find(s=>s.id===id),q=new URLSearchParams({problem:ws.document.problem.referenceId,approach:id,stage:String(Math.min(stageIndex+1,other.stages.length)),compare:id});root.open('/lucyd?'+q,'lucyd-compare-'+id,'popup,width='+Math.floor(screen.availWidth/2)+',height='+screen.availHeight+',left='+Math.floor(screen.availWidth/2));}});
      if (tab === 'stage') return [h('div', {key: 'p', className: 'sw-sidebar-controls'}, pickers, h('div', {className: 'sw-mobile-only'}, stepper)), h(P.StagePanel, {key: 's',concealed,solution, stageIndex, built, edited, onReset: resetStage, showRemoved: ws.view.showRemoved, onToggleRemoved: v => navigate({showRemoved: v}), followups})];
      if (tab === 'inspect') return h(P.InspectPanel, {info, onToggleCollapse: () => toggleCollapse(info.node.id), onConnect: connect, onDisconnect: disconnect});
      if (tab === 'approach') return h(P.ApproachPanel, {solution});
      if (tab === 'problem') return h(P.ProblemPanel, {document: ws.document, entry});
      return h(P.FilePanel, {saveStatus, editedStages, outdated: !!publishedRef.current.get(ws.document.problem.referenceId) && !Study.same(publishedRef.current.get(ws.document.problem.referenceId), ws.document),
        onImport: () => fileInput.current?.click(), onExport: exportWorkspace, onExportAuthored: exportAuthored, onUsePublished: () => setConfirmDiscard(true)});
    };

    return h('div', {className: 'sw-root', 'data-role': EMBED_ROLE||'study'},
      h(Excalidraw, {
        excalidrawAPI: value => { if (value && apiRef.current !== value) { apiRef.current = value; setApi(value); } },
        initialData: {elements: [], appState: {theme: themeRef.current, viewBackgroundColor: '#ffffff', currentItemFontFamily: 6}},
        onChange, autoFocus: true, name: 'Lucyd', viewModeEnabled: READ_ONLY?true:undefined,
        UIOptions: {canvasActions: {loadScene: false, saveToActiveFile: false, export: false}},
        renderTopRightUI: isMobile => (isMobile||COMPACT ? null : h('div', {className: 'sw-top', onKeyDown: isolateKeys}, pickers, trigger)),
      },
      COMPACT ? h(MainMenu, null) : h(MainMenu, null,
        h(MainMenu.Item, {onSelect: openStudy}, 'Study notes and stages'),
        h(MainMenu.Item, {onSelect: toggleStudyMode}, `Study mode: ${studyMode?'On':'Off'}`),
        h(MainMenu.Item, {onSelect: () => fileInput.current?.click()}, 'Import study JSON…'),
        h(MainMenu.Item, {onSelect: exportWorkspace}, 'Export study workspace'),
        h(MainMenu.Item, {onSelect: exportAuthored}, 'Export authored document'),
        h(MainMenu.Item, {onSelect: resetStage}, 'Reset this stage'),
        h(MainMenu.Separator, null),
        h(MainMenu.DefaultItems.SaveAsImage, null),
        h('label',{className:'sw-theme-control',onKeyDown:isolateKeys},h('span',null,'Theme'),h('select',{'aria-label':'Color theme',value:themeMode,onChange:e=>applyTheme(e.target.value)},['system','light','dark'].map(mode=>h('option',{key:mode,value:mode},mode[0].toUpperCase()+mode.slice(1))))),
        h(MainMenu.DefaultItems.ChangeCanvasBackground, null),
        h(MainMenu.DefaultItems.Help, null),
        h(MainMenu.Separator, null),
        // The simulation editor reads the same study document through the shared architecture model,
        // so this approach opens there as design stages beside the problem's runnable approaches.
        h(MainMenu.ItemLink, {href: ws && solution ? `../../../system-diagram?problem=${encodeURIComponent(ws.document.problem.referenceId)}&approach=design-${encodeURIComponent(solution.id)}` : '../../../system-diagram'}, ws && solution ? 'Open this approach in the simulation editor' : 'Open simulation editor')),
      !COMPACT&&h(Footer, null, h('div', {className: 'sw-footer', onKeyDown: isolateKeys},
        h('button',{className:'sw-mode-toggle','aria-label':'Study mode','aria-pressed':studyMode,onClick:toggleStudyMode,title:'Show or hide the solution sequence guide'},'Study'),h('button',{className:'sw-button',onClick:enablePractice,title:'Answer the stage question before reading; track weak spots'},'Practice'),
        !studyMode&&h('div',{className:'sw-compact-stepper'},stepper),
        h('span', {className: 'sw-save', role: 'status'}, saveStatus))),
      !COMPACT&&h(Sidebar, {name: SIDEBAR, docked, onDock: setDocked, className: 'sw-sidebar'},
        h(Sidebar.Header, null, h('span', {className: 'sw-sidebar-title'}, ws ? `${ws.document.problem.referenceId} · ${solution?.title || ''}` : 'Study')),
        h(Sidebar.Tabs, {onKeyDown: isolateKeys},
          h(Sidebar.TabTriggers, null, TABS.map(([tab, label]) => h(Sidebar.TabTrigger, {key: tab, tab}, label))),
          TABS.map(([tab]) => h(Sidebar.Tab, {key: tab, tab}, panel(tab)))))),
      !COMPACT&&studyMode&&solution&&h('div',{className:'sw-guide-wrap sw-footer','aria-label':'Study sequence guide',onKeyDown:isolateKeys},stepper,h(StudyGuide,{solution,stageIndex,concealed,onReveal:()=>patchPractice({revealed:true}),onSelect:i=>navigate({stageIndex:i})})),
      h('input', {ref: fileInput, type: 'file', accept: 'application/json,.json', hidden: true, onChange: onFile, 'aria-label': 'Study JSON file'}),
      h(P.Dialog, {open: !!preview, title: 'Open this study file?', onClose: () => setPreview(null), actions: [{label: 'Cancel', onClick: () => setPreview(null)}, {label: 'Export current first', onClick: exportWorkspace}, {label: 'Replace current workspace', primary: true, onClick: confirmImport}]},
        preview && (() => { const s = Store.summary(preview.parsed.workspace); return h('div', null, h('p', null, h('b', null, `${s.referenceId} · ${s.studyLabel}`)), h('ul', {className: 'sw-list'}, s.approaches.map(a => h('li', {key: a}, a))),
          h('p', null, `${s.editedStages} edited stage${s.editedStages === 1 ? '' : 's'} in ${preview.name}. Your current ${s.referenceId} workspace in this browser will be replaced.`)); })()),
      h(P.Dialog, {open: !!notice, title: notice?.title || '', onClose: () => setNotice(null), actions: [{label: 'Close', primary: true, onClick: () => setNotice(null)}]}, h('p', {role: 'alert'}, notice?.message)),
      h(P.Dialog, {open: confirmDiscard, title: 'Discard your edits?', onClose: () => setConfirmDiscard(false), actions: [{label: 'Keep my edits', onClick: () => setConfirmDiscard(false)}, {label: 'Export first', onClick: exportWorkspace}, {label: 'Discard and load published', primary: true, onClick: discardEdits}]},
        h('p', null, `All edited stages for ${ws?.document.problem.referenceId} return to the published authored solution.`)));
  }

  ReactDOM.createRoot(document.getElementById('app')).render(h(App));
})(globalThis);
