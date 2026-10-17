(function attachWorldUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteWorldUI = api;
})(globalThis, function worldUi() {
  'use strict';
  const VARIANTS = Object.freeze(['primary', 'secondary', 'quiet', 'danger', 'icon']);
  const buttons = new WeakMap(), menus = new WeakMap(), sheets = new WeakMap(), inspectors = new WeakMap();
  const docFor = options => options.document || options.element?.ownerDocument || document;
  const node = (doc, tag, className, text) => {
    const el = doc.createElement(tag); el.className = className || '';
    if (text != null) el.textContent = text; return el;
  };
  const visible = el => !el.disabled && !el.hidden && el.getClientRects().length > 0;
  const focusable = el => [...el.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')].filter(visible);
  function SimButton(options = {}) {
    const doc = docFor(options), el = options.element || node(doc, 'button', '', options.label);
    const variant = options.variant || 'secondary';
    if (!VARIANTS.includes(variant)) throw Error('Unknown SimButton variant: ' + variant);
    el.classList.remove('sim-action', 'sim-action-primary'); el.classList.add('wui-button');
    el.dataset.wui = 'button'; el.dataset.variant = variant;
    if (el.tagName === 'BUTTON') el.type = 'button';
    if (options.label != null) el.textContent = options.label;
    if (options.ariaLabel) el.setAttribute('aria-label', options.ariaLabel);
    if (variant === 'icon' && !el.getAttribute('aria-label')) throw Error('Icon buttons require an accessible label');
    if (buttons.has(el)) return buttons.get(el);
    let pending = false, previousDisabled = el.disabled;
    const api = { element: el, setState(state = {}) {
      if ('selected' in state) el.dataset.selected = String(state.selected);
      if ('disabled' in state) { previousDisabled = Boolean(state.disabled); if (!pending) el.disabled = previousDisabled; }
      if ('pending' in state && pending !== Boolean(state.pending)) {
        if (state.pending) previousDisabled = el.disabled;
        pending = Boolean(state.pending); el.setAttribute('aria-busy', String(pending)); el.disabled = pending || previousDisabled;
      }
      if ('error' in state) { el.dataset.state = state.error ? 'error' : 'idle'; if (state.error) el.title = String(state.error); else el.removeAttribute('title'); }
    } };
    if (options.onAction) el.addEventListener('click', async () => {
      if (pending) return;
      api.setState({ pending: true, error: null });
      try { await options.onAction(); }
      catch (error) { api.setState({ error: error.message }); options.onError?.(error); }
      finally { api.setState({ pending: false }); }
    });
    buttons.set(el, api); return api;
  }
  function SimDisclosure({ title, children = [], document: doc = document }) {
    const el = node(doc, 'details', 'wui-disclosure'), summary = node(doc, 'summary', '', title);
    SimButton({ element: summary, variant: 'quiet' }); el.append(summary, ...children); return el;
  }
  function SimDock({ children = [], label, document: doc = document }) {
    const el = node(doc, 'div', 'wui-dock'); el.setAttribute('role', 'group'); el.setAttribute('aria-label', label);
    el.append(...children); return el;
  }
  function SimMenu(options = {}) {
    const doc = docFor(options), el = options.element || node(doc, 'details', '');
    if (menus.has(el)) return menus.get(el);
    const trigger = el.querySelector(':scope > summary') || node(doc, 'summary', '', options.label);
    const content = options.content || el.querySelector(':scope > div') || node(doc, 'div');
    el.className = 'wui-menu'; content.className = 'wui-menu-content'; content.dataset.wui = 'menu';
    SimButton({ element: trigger, variant: 'quiet' }); trigger.classList.add('wui-menu-trigger');
    trigger.setAttribute('aria-haspopup', 'menu'); content.setAttribute('role', 'menu'); content.setAttribute('aria-label', options.label || trigger.textContent);
    el.append(trigger, content);
    const events = new AbortController();
    function items() { return [...content.querySelectorAll('button')].filter(visible); }
    function position() {
      const r = trigger.getBoundingClientRect(), view = doc.defaultView;
      content.style.left = `${Math.max(12, Math.min(r.left, view.innerWidth - 272))}px`;
      content.style.top = `${r.top > view.innerHeight / 2 ? Math.max(12, r.top - content.offsetHeight - 8) : r.bottom + 8}px`;
    }
    function close(restore = true) { el.open = false; trigger.setAttribute('aria-expanded', 'false'); if (restore) trigger.focus({ preventScroll: true }); }
    function open() { el.open = true; trigger.setAttribute('aria-expanded', 'true'); position(); (items().find(x => x.getAttribute('aria-checked') === 'true') || items()[0])?.focus(); }
    el.addEventListener('toggle', () => { trigger.setAttribute('aria-expanded', String(el.open)); if (el.open) position(); }, { signal: events.signal });
    trigger.addEventListener('click', e => { e.preventDefault(); if(el.open)close();else open(); }, { signal: events.signal });
    trigger.addEventListener('keydown', e => { if (['ArrowDown','ArrowUp'].includes(e.key)) { e.preventDefault(); open(); } }, { signal: events.signal });
    content.addEventListener('keydown', e => {
      const list = items(), at = list.indexOf(doc.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        const index = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (e.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
        list[index]?.focus();
      } else if (e.key === 'Tab') close(false);
    }, { signal: events.signal, capture: true });
    content.addEventListener('click', e => { if (e.target.closest('button')) close(); }, { signal: events.signal });
    doc.addEventListener('pointerdown', e => { if (el.open && !el.contains(e.target)) close(false); }, { signal: events.signal });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && el.open) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, { signal: events.signal });
    doc.defaultView.addEventListener('resize', () => { if (el.open) position(); }, { signal: events.signal });
    const api = { element: el, trigger, content, open, close, dispose: () => events.abort() }; menus.set(el, api); return api;
  }
  function menuFromSelect(select, label) {
    const doc = select.ownerDocument, content = node(doc, 'div');
    const menu = SimMenu({ document: doc, label, content }); const choices = new Map();
    select.hidden = true;
    function sync() {
      for (const option of select.options) {
        let b = choices.get(option.value);
        if (!b) {
          b = SimButton({ document: doc, label: option.textContent, variant: 'quiet', onAction: () => {
            select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); sync();
          } }).element; b.setAttribute('role', 'menuitemradio'); choices.set(option.value, b); content.append(b);
        }
        b.textContent = option.textContent; b.disabled = select.disabled || option.disabled;
        b.setAttribute('aria-checked', String(option.selected));
      }
      for (const [value,b] of choices) if (![...select.options].some(o => o.value === value)) { b.remove(); choices.delete(value); }
      menu.trigger.textContent = select.selectedOptions[0]?.textContent || label;
      menu.trigger.setAttribute('aria-label', `${label}: ${menu.trigger.textContent}`);
    }
    const observer = new MutationObserver(sync); observer.observe(select, { subtree: true, childList: true, attributes: true });
    select.addEventListener('change', sync); sync();
    return { ...menu, sync, dispose() { observer.disconnect(); select.removeEventListener('change', sync); menu.dispose(); } };
  }
  function SimSheet(options = {}) {
    const doc = docFor(options), el = options.element || node(doc, 'section', '');
    if (sheets.has(el)) return sheets.get(el);
    el.classList.add('wui-sheet'); el.dataset.wui = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', options.label || el.getAttribute('aria-label') || 'Details');
    const backdrop = options.backdrop || node(doc, 'div', 'wui-sheet-backdrop'); backdrop.className = 'wui-sheet-backdrop';
    if (!backdrop.isConnected) doc.body.append(backdrop);
    let previous; const events = new AbortController();
    function close({ restoreFocus = true } = {}) {
      el.hidden = true; el.inert = true; el.setAttribute('aria-hidden', 'true'); el.classList.remove('is-open'); backdrop.hidden = true;
      options.trigger?.setAttribute('aria-expanded', 'false'); if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
    }
    function open() {
      previous = doc.activeElement; el.hidden = false; el.inert = false; el.setAttribute('aria-hidden', 'false'); el.classList.add('is-open'); backdrop.hidden = false;
      options.trigger?.setAttribute('aria-expanded', 'true'); (options.closeButton || focusable(el)[0] || el).focus({ preventScroll: true });
    }
    backdrop.addEventListener('click', () => close(), { signal: events.signal });
    if (!options.externalTrigger) {
      options.trigger?.addEventListener('click', open, { signal: events.signal });
      options.closeButton?.addEventListener('click', () => close(), { signal: events.signal });
    }
    doc.addEventListener('keydown', e => {
      if (el.hidden) return;
      if (e.key === 'Escape' && !el.querySelector('.wui-menu[open]')) { e.preventDefault(); close(); }
      if (e.key !== 'Tab') return;
      const list = focusable(el), first = list[0], last = list.at(-1);
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first?.focus(); }
    }, { signal: events.signal });
    close({ restoreFocus: false });
    const api = { element: el, open, close, dispose() { events.abort(); close({ restoreFocus: false }); } }; sheets.set(el, api); return api;
  }
  function SimMetric(options = {}) {
    const doc = docFor(options), el = node(doc, 'section', 'wui-metric');
    const label = node(doc, 'div', 'wui-metric-label'), value = node(doc, 'p', 'wui-metric-value'), basis = node(doc, 'p', 'wui-metric-basis');
    el.append(label,value,basis);
    function update(data) {
      for (const key of ['subject','value','unit','timeBasis','freshness','validity']) if (data[key] == null) throw Error(`SimMetric requires ${key}`);
      if (!['governing','supporting','detail'].includes(data.level)) throw Error('Unknown metric level');
      el.dataset.level=data.level; el.dataset.freshness=data.freshness; el.dataset.validity=data.validity;
      label.textContent=data.subject; value.textContent=`${data.value}${data.unit ? ' '+data.unit : ''}`;
      basis.textContent=`${data.timeBasis} · ${data.freshness} · ${data.validity}`;
      el.setAttribute('aria-label', `${data.subject}: ${value.textContent}. ${basis.textContent}`);
    }
    if (options.data) update(options.data); return { element: el, update };
  }
  function placeInspector(scene, rack, panel, gap = 16) {
    if (!rack || scene.width < 700 || panel.height > scene.height - 2*gap
      || ![rack.left,rack.right,rack.top,rack.bottom].every(Number.isFinite)
      || rack.right < 0 || rack.left > scene.width || rack.bottom < 0 || rack.top > scene.height) return null;
    const y = Math.max(gap,Math.min((rack.top+rack.bottom-panel.height)/2,scene.height-panel.height-gap));
    for (const x of [rack.right+gap,rack.left-panel.width-gap]) if (x>=gap && x+panel.width<=scene.width-gap) return { x,y };
    return null;
  }
  function SimInspector({ host, onSelect, onAction, onError, returnFocus, prominentFields = [] }) {
    const doc=host.ownerDocument, el=node(doc,'section','wui-inspector'); el.dataset.wui='inspector'; el.setAttribute('aria-label','Object inspector'); el.tabIndex=-1;
    const heading=node(doc,'header','wui-inspector-heading'), title=node(doc,'h2','wui-inspector-title'), condition=node(doc,'p','wui-inspector-condition');
    const dismiss=async()=>{await onSelect(null);returnFocus?.focus({preventScroll:true});};
    const close=SimButton({document:doc,label:'×',ariaLabel:'Close inspector',variant:'icon',onAction:dismiss}).element;
    heading.append(title,close);
    const selector=node(doc,'select','wui-field'); selector.dataset.wui='field'; selector.setAttribute('aria-label','Inspect object'); selector.addEventListener('change',()=>onSelect(selector.value||null));
    const summary=node(doc,'dl','wui-inspector-facts'), actions=node(doc,'div','wui-inspector-actions'), message=node(doc,'p','wui-feedback'), explanation=node(doc,'p'); message.setAttribute('role','status');
    const facts=node(doc,'dl','wui-inspector-facts'), related=node(doc,'div','wui-control-row');
    const details=SimDisclosure({document:doc,title:'Details',children:[explanation,related,facts]});
    el.append(selector,heading,condition,summary,actions,message,details); host.append(el);
    const cells=new Map(), buttonsById=new Map(); let current, revision=0, busy=false, optionsKey='', relatedKey='';
    function render(input) {
      const changed=current?.selectedId!==input.selectedId; current=input;
      if(changed){revision++;busy=false;message.textContent='';details.open=false;for(const b of buttonsById.values())b.element.remove();buttonsById.clear();}
      el.hidden=!input.selectedId;
      const key=input.objects.map(o=>o.id).join('|');
      if(key!==optionsKey){optionsKey=key;selector.replaceChildren(...[{id:'',label:input.prompt},...input.objects].map(o=>{const n=node(doc,'option','',o.label);n.value=o.id;return n;}));}
      if(doc.activeElement!==selector)selector.value=input.selectedId||'';
      if(!input.selectedId)return;
      const object=input.objects.find(o=>o.id===input.selectedId);
      title.textContent=input.label; condition.textContent=object?.condition||''; explanation.textContent=input.description||'';
      const ids=new Set(input.fields.map(f=>f.id));for(const [id,cell]of cells)if(!ids.has(id)){cell.el.remove();cells.delete(id);}
      for(const f of input.fields){let cell=cells.get(f.id);if(!cell){const row=node(doc,'div','wui-inspector-fact'),term=node(doc,'dt','wui-inspector-term'),value=node(doc,'dd','wui-inspector-value');row.append(term,value);cell={el:row,term,value};cells.set(f.id,cell);(prominentFields.includes(f.id)?summary:facts).append(row);}cell.term.textContent=f.label;cell.value.textContent=`${typeof f.value==='number'?Number(f.value.toPrecision(5)):f.value}${f.unit?' '+f.unit:''}`;}
      const peers=(object?.relatedIds||[]).map(id=>input.objects.find(o=>o.id===id)).filter(Boolean),nextRelated=peers.map(o=>o.id).join('|');
      if(relatedKey!==nextRelated){relatedKey=nextRelated;related.replaceChildren(...peers.map(o=>{const b=SimButton({document:doc,label:o.label,variant:'quiet',onAction:()=>onSelect(o.id)}).element;b.dataset.relatedObject=o.id;return b;}));}
      for(const [id,b]of buttonsById)if(!input.actions.some(a=>a.id===id)){b.element.remove();buttonsById.delete(id);}
      input.actions.forEach((a,index)=>{
        let b=buttonsById.get(a.id);
        if(!b){b=SimButton({document:doc,label:a.label,variant:index===0?'primary':'quiet',onAction:async()=>{
          const actionRevision=revision;busy=true;message.dataset.state='pending';message.textContent='Pending';reflect();
          try{const result=await onAction(a.id);if(revision===actionRevision){message.dataset.state='applied';message.textContent=result?.message||'Applied';}}
          catch(error){if(revision===actionRevision){message.dataset.state='error';message.textContent=error.name==='AbortError'?'Cancelled':error.message;}onError?.(error);throw error;}
          finally{if(revision===actionRevision){busy=false;reflect();}}
        }});b.element.dataset.objectAction=a.id;buttonsById.set(a.id,b);actions.append(b.element);}
        b.element.textContent=a.label; b.element.dataset.variant=index===0?'primary':'quiet';
        if(actions.children[index]!==b.element)actions.insertBefore(b.element,actions.children[index]||null);
      });reflect();
    }
    function reflect(){for(const a of current?.actions||[])buttonsById.get(a.id)?.setState({disabled:busy||a.disabled===true});}
    function position(scene,target){
      const rect=scene.getBoundingClientRect(),points=target?.bounds?.length?target.bounds:target?.points;
      const rack=points?.length?{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}:null;
      const p=placeInspector(rect,rack,el.getBoundingClientRect());el.dataset.placement=rect.width<700?'sheet':p?'anchor':'edge';
      el.style.left=p?`${p.x}px`:'';el.style.top=p?`${p.y}px`:'';
    }
    const escape=e=>{if(e.key==='Escape'&&!el.hidden){e.preventDefault();e.stopPropagation();dismiss().catch(error=>{message.textContent=error.message;onError?.(error);});}};el.addEventListener('keydown',escape);
    const api={element:el,selector,render,position,dispose(){el.remove();selector.remove();}}; inspectors.set(el,api); return api;
  }
  function SimTooltip({ target, text }) {
    const doc=target.ownerDocument, el=node(doc,'span','wui-tooltip',text);el.id=`wui-tip-${++SimTooltip.counter}`;el.setAttribute('role','tooltip');el.hidden=true;target.after(el);target.setAttribute('aria-describedby',el.id);
    const show=()=>{el.hidden=false;const r=target.getBoundingClientRect(),v=doc.defaultView;el.style.left=`${Math.max(12,Math.min(r.left,v.innerWidth-el.offsetWidth-12))}px`;el.style.top=`${r.bottom+el.offsetHeight+12<v.innerHeight?r.bottom+8:Math.max(12,r.top-el.offsetHeight-8)}px`;},hide=()=>{el.hidden=true;};target.addEventListener('focus',show);target.addEventListener('blur',hide);target.addEventListener('pointerenter',show);target.addEventListener('pointerleave',hide);target.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});return el;
  }
  SimTooltip.counter=0;
  function adoptTree(host) {
    function adopt(el) {
      if(el.matches('button,summary')&&!el.dataset.wui)SimButton({element:el,variant:el.classList.contains('sim-action-primary')?'primary':el.tagName==='SUMMARY'?'quiet':'secondary'});
      if(el.matches('select,input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea')&&!el.dataset.wui){el.classList.add('wui-field');el.dataset.wui='field';}
      if(el.matches('details')&&!el.classList.contains('wui-menu'))el.classList.add('wui-disclosure');
    }
    host.querySelectorAll('button,summary,select,input,textarea,details').forEach(adopt);
    const observer=new MutationObserver(records=>{for(const record of records)for(const n of record.addedNodes)if(n.nodeType===1){adopt(n);n.querySelectorAll('button,summary,select,input,textarea,details').forEach(adopt);}});
    observer.observe(host,{subtree:true,childList:true});return()=>observer.disconnect();
  }
  return Object.freeze({ SimButton, SimDock, SimMenu, SimSheet, SimInspector, SimMetric, SimTooltip, SimDisclosure, menuFromSelect, adoptTree, placeInspector, getSheet:el=>sheets.get(el), getInspector:el=>inspectors.get(el), VARIANTS });
});
