// Study workspace: the Excalidraw canvas (vendored 0.17.6) driven by an authored composable study.
// Each stage's authored graph is drawn fresh; the learner's edits are kept per stage as an overlay,
// saved in this browser and exported with the untouched authored document.
(function (root) {
  'use strict';
  const {React, ReactDOM, ExcalidrawLib: X, SimulatteComposableStudy: Study, SimulatteStudyScene: Scene, SimulatteStudyWorkspace: Store, SimulatteStudyPanels: P} = root;
  for (const [name, value] of Object.entries({React, ReactDOM, X, Study, Scene, Store, P})) if (!value) throw Error(`Study workspace needs ${name} loaded first`);
  const {createElement: h, useState, useEffect, useRef, useCallback, useMemo} = React;
  const {Excalidraw, MainMenu, Footer, Sidebar} = X;
  const DATA = new URL('../../../data/system-diagram/', root.location.href);
  const THEME_KEY = 'simulatte.theme.v1', SIDEBAR = 'study', CONNECTED = '#1971c2';
  const TABS = [['stage', 'Stage'], ['inspect', 'Inspect'], ['approach', 'Approach'], ['problem', 'Problem'], ['file', 'File']];

  const storage = {
    get(key) { try { return root.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { root.localStorage.setItem(key, value); },
  };
  function initialTheme() {
    const saved = storage.get(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : root.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
    root.history.replaceState(null, '', `${root.location.pathname}?${q}`);
  }
  // Keys typed in study controls (pickers, stepper, sidebar) must not reach Excalidraw's canvas shortcuts,
  // which listen on its container. Escape still closes menus and the sidebar.
  const isolateKeys = event => { if (event.key !== 'Escape') event.stopPropagation(); };
  const solutionOf = ws => ws?.document.solutions.find(s => s.id === ws.view.solutionId) || null;
  const graphOf = ws => { const s = solutionOf(ws); return ws.view.stageIndex < 0 ? s.initialGraph : s.stages[ws.view.stageIndex].graph; };
  const stageKeyOf = ws => Store.stageKey(solutionOf(ws), ws.view.stageIndex);

  function App() {
    const apiRef = useRef(null), wsRef = useRef(null), authoredRef = useRef([]), loadingRef = useRef(false), versionRef = useRef(-1);
    const selectionRef = useRef(''), themeRef = useRef(initialTheme()), timers = useRef({}), publishedRef = useRef(new Map()), catalogueRef = useRef([]), fileInput = useRef(null);
    const [api, setApi] = useState(null);
    const [catalogue, setCatalogue] = useState([]);
    const [ws, setWsState] = useState(null);
    const [built, setBuilt] = useState(null);
    const [selection, setSelection] = useState([]);
    const [saveStatus, setSaveStatus] = useState('Nothing loaded yet');
    const [notice, setNotice] = useState(null);
    const [preview, setPreview] = useState(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [docked, setDocked] = useState(false);
    const setWs = next => { wsRef.current = next; setWsState(next); };
    const solution = solutionOf(ws);
    // Read-only view for scripted acceptance checks; it exposes state, never mutators.
    useEffect(() => { root.SimulatteStudyInspector = Object.freeze({ready: () => !!apiRef.current && !!wsRef.current, elements: () => apiRef.current?.getSceneElements() || [], files: () => Object.keys(apiRef.current?.getFiles() || {}), appState: () => apiRef.current?.getAppState() || null, workspace: () => wsRef.current}); }, []);

    const save = useCallback(() => {
      clearTimeout(timers.current.save);
      timers.current.save = setTimeout(() => {
        const current = wsRef.current; if (!current) return;
        try { storage.set(Store.storageKey(current.document.problem.referenceId), Store.serialize(current)); setSaveStatus(`Saved in this browser at ${clock()}`); }
        catch (error) { setSaveStatus(`Not saved in this browser (${error.message}). Export to keep your work.`); }
      }, 300);
    }, []);

    // Draw the current stage: authored scene plus this stage's overlay. Navigation never enters undo history.
    const render = useCallback((next, {fit = false} = {}) => {
      const excalidraw = apiRef.current; if (!excalidraw || !next) return;
      const sol = solutionOf(next);
      const result = Scene.build(next.document, sol, next.view.stageIndex, {collapsed: next.view.collapsed, showRemoved: next.view.showRemoved});
      const authored = X.restoreElements(result.elements, null);
      const overlay = Store.overlayFor(next, sol.id, stageKeyOf(next));
      authoredRef.current = authored;
      loadingRef.current = true;
      if (overlay?.files) excalidraw.addFiles(Object.values(overlay.files));
      excalidraw.updateScene({elements: X.restoreElements(Scene.applyOverlay(authored, overlay), null), appState: {selectedElementIds: {}, editingElement: null, name: `${next.document.problem.referenceId} ${sol.title}`}, commitToHistory: false});
      excalidraw.history.clear();
      versionRef.current = X.getSceneVersion(excalidraw.getSceneElementsIncludingDeleted());
      loadingRef.current = false;
      if (fit) root.requestAnimationFrame(() => excalidraw.scrollToContent(undefined, {fitToContent: true}));
      setBuilt(result); writeQuery(next);
    }, []);

    // Turn whatever is on the canvas into this stage's overlay.
    const capture = useCallback(() => {
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
        themeRef.current = appState.theme; document.documentElement.dataset.theme = appState.theme;
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
      setWs(next); render(next, options); save();
    }, [capture, render, save]);

    const openProblem = useCallback(async (referenceId, view = {}) => {
      if (wsRef.current) { capture(); clearTimeout(timers.current.save); try { storage.set(Store.storageKey(wsRef.current.document.problem.referenceId), Store.serialize(wsRef.current)); } catch { /* reported on next save */ } }
      const item = catalogueRef.current.find(c => c.referenceId === referenceId);
      try {
        if (!item?.path) throw Error(`${referenceId} is not in the study catalogue`);
        const published = Study.parse(await fetchText(new URL(`composable-solutions/${item.path}`, DATA)));
        publishedRef.current.set(referenceId, published);
        let next = null, status = 'Published solution loaded. Your edits will be saved in this browser.';
        const saved = storage.get(Store.storageKey(referenceId));
        if (saved) {
          try { next = Store.parse(saved).workspace; status = 'Restored your saved workspace from this browser.'; }
          catch (error) { status = `Your saved workspace could not be read (${error.message}); showing the published version.`; }
        }
        next ||= Store.create(published);
        const sol = next.document.solutions.find(s => s.id === view.approach);
        if (sol) next = Store.withView(next, {solutionId: sol.id, stageIndex: Number.isInteger(view.stage) && view.stage >= 0 && view.stage <= sol.stages.length ? view.stage - 1 : 0});
        setWs(next); render(next, {fit: true}); setSaveStatus(status);
      } catch (error) { setNotice({title: `Could not open ${referenceId}`, message: error.message}); }
    }, [capture, render]);

    // Boot: catalogue from the generated manifest plus titles and attribution from problems.json.
    useEffect(() => {
      if (!api) return;
      (async () => {
        try {
          // Excalidraw 0.17 redraws only unbound text when a font arrives; every study label is bound, so load Virgil first.
          await Promise.all(['16px Virgil', '14px Virgil'].map(font => document.fonts?.load(font))).catch(() => {});
          const [manifest, problems] = await Promise.all([fetchText(new URL('composable-solutions/manifest.json', DATA)), fetchText(new URL('problems.json', DATA))].map(p => p.then(JSON.parse)));
          const byRef = new Map(problems.problems.map(p => [p.referenceId, p]));
          const list = manifest.problems.map(p => ({...byRef.get(p.referenceId), referenceId: p.referenceId, path: p.path, title: byRef.get(p.referenceId)?.title || p.referenceId}));
          catalogueRef.current = list; setCatalogue(list);
          const query = readQuery(), start = list.find(p => p.referenceId === query.problem) || list[0];
          if (start) await openProblem(start.referenceId, query);
        } catch (error) { setNotice({title: 'Could not load the study catalogue', message: error.message}); }
      })();
    }, [api, openProblem]);
    useEffect(() => { document.documentElement.dataset.theme = themeRef.current; }, []);

    // Excalidraw 0.17 drops the pointer on pointercancel but never ends the gesture, so the next tap
    // completes a stale draft. When the browser cancels a pointer (system gesture, palm rejection),
    // end the gesture here and discard the shape that was being created; nothing half-drawn remains.
    useEffect(() => {
      if (!api) return undefined;
      const container = document.querySelector('.excalidraw');
      const onCancel = event => {
        if (!event.isTrusted) return;
        const draft = api.getAppState().draggingElement;
        root.dispatchEvent(new PointerEvent('pointerup', {pointerId: event.pointerId, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY, bubbles: true}));
        if (!draft) return;
        root.setTimeout(() => {
          const elements = api.getSceneElementsIncludingDeleted();
          if (!elements.some(el => el.id === draft.id && !el.isDeleted)) return;
          api.updateScene({elements: elements.map(el => (el.id === draft.id ? X.newElementWith(el, {isDeleted: true}) : el)), appState: {selectedElementIds: {}, draggingElement: null}, commitToHistory: false});
        }, 0);
      };
      container?.addEventListener('pointercancel', onCancel, true);
      return () => container?.removeEventListener('pointercancel', onCancel, true);
    }, [api]);

    const onFile = async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      try { setPreview({parsed: Store.parse(await file.text()), name: file.name}); }
      catch (error) { setNotice({title: `${file.name} was not imported`, message: `${error.message}. Your current workspace is unchanged.`}); }
    };
    const confirmImport = () => {
      const {parsed} = preview; setPreview(null);
      if (wsRef.current) capture();
      const next = parsed.workspace, ref = next.document.problem.referenceId;
      if (!catalogueRef.current.some(c => c.referenceId === ref)) { const list = [...catalogueRef.current, {referenceId: ref, title: `${next.document.problem.studyLabel} (imported)`}]; catalogueRef.current = list; setCatalogue(list); }
      setWs(next); render(next, {fit: true}); save();
    };
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
      excalidraw.updateScene({elements: label ? [...elements, label] : elements, commitToHistory: true});
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
      excalidraw.updateScene({elements, commitToHistory: true});
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
    const stepper = solution && h(P.Stepper, {stageIndex, minIndex, count: solution.stages.length, title: stageTitle, edited, onStep: step, onReset: resetStage});
    const pickers = h(P.Pickers, {catalogue, referenceId: ws?.document.problem.referenceId, solutions: ws?.document.solutions, solutionId: ws?.view.solutionId,
      onProblem: ref => openProblem(ref), onSolution: id => navigate({solutionId: id, stageIndex: 0}, {fit: true})});
    const trigger = h(Sidebar.Trigger, {name: SIDEBAR, tab: 'stage', title: 'Study notes', className: 'sw-trigger'}, 'Study');
    const openStudy = () => apiRef.current?.toggleSidebar({name: SIDEBAR, tab: 'stage', force: true});
    const panel = tab => {
      if (!ws || !solution) return h('p', {className: 'sw-muted'}, 'Loading study…');
      if (tab === 'stage') return [h('div', {key: 'p', className: 'sw-sidebar-controls'}, pickers, h('div', {className: 'sw-mobile-only'}, stepper)), h(P.StagePanel, {key: 's', solution, stageIndex, built, edited, onReset: resetStage, showRemoved: ws.view.showRemoved, onToggleRemoved: v => navigate({showRemoved: v}), followups})];
      if (tab === 'inspect') return h(P.InspectPanel, {info, onToggleCollapse: () => toggleCollapse(info.node.id), onConnect: connect, onDisconnect: disconnect});
      if (tab === 'approach') return h(P.ApproachPanel, {solution});
      if (tab === 'problem') return h(P.ProblemPanel, {document: ws.document, entry});
      return h(P.FilePanel, {saveStatus, editedStages, outdated: !!publishedRef.current.get(ws.document.problem.referenceId) && !Study.same(publishedRef.current.get(ws.document.problem.referenceId), ws.document),
        onImport: () => fileInput.current?.click(), onExport: exportWorkspace, onExportAuthored: exportAuthored, onUsePublished: () => setConfirmDiscard(true)});
    };

    return h('div', {className: 'sw-root'},
      h(Excalidraw, {
        excalidrawAPI: value => { if (value && apiRef.current !== value) { apiRef.current = value; setApi(value); } },
        initialData: {elements: [], appState: {theme: themeRef.current, viewBackgroundColor: '#ffffff', currentItemFontFamily: 1}},
        onChange, autoFocus: true, name: 'Lucyd study',
        UIOptions: {canvasActions: {loadScene: false, saveToActiveFile: false, export: false}},
        renderTopRightUI: isMobile => (isMobile ? null : h('div', {className: 'sw-top', onKeyDown: isolateKeys}, pickers, trigger)),
      },
      h(MainMenu, null,
        h(MainMenu.Item, {onSelect: openStudy}, 'Study notes and stages'),
        h(MainMenu.Item, {onSelect: () => fileInput.current?.click()}, 'Import study JSON…'),
        h(MainMenu.Item, {onSelect: exportWorkspace}, 'Export study workspace'),
        h(MainMenu.Item, {onSelect: exportAuthored}, 'Export authored document'),
        h(MainMenu.Item, {onSelect: resetStage}, 'Reset this stage'),
        h(MainMenu.Separator, null),
        h(MainMenu.DefaultItems.SaveAsImage, null),
        h(MainMenu.DefaultItems.ToggleTheme, null),
        h(MainMenu.DefaultItems.ChangeCanvasBackground, null),
        h(MainMenu.DefaultItems.Help, null),
        h(MainMenu.Separator, null),
        h(MainMenu.ItemLink, {href: '../../../system-diagram'}, 'Open simulation editor')),
      h(Footer, null, h('div', {className: 'sw-footer', onKeyDown: isolateKeys}, stepper, h('span', {className: 'sw-save', role: 'status'}, saveStatus))),
      h(Sidebar, {name: SIDEBAR, docked, onDock: setDocked, className: 'sw-sidebar'},
        h(Sidebar.Header, null, h('span', {className: 'sw-sidebar-title'}, ws ? `${ws.document.problem.referenceId} · ${solution?.title || ''}` : 'Study')),
        h(Sidebar.Tabs, {onKeyDown: isolateKeys},
          h(Sidebar.TabTriggers, null, TABS.map(([tab, label]) => h(Sidebar.TabTrigger, {key: tab, tab}, label))),
          TABS.map(([tab]) => h(Sidebar.Tab, {key: tab, tab}, panel(tab)))))),
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
