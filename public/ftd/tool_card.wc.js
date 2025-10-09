import Utils from './utils.js';

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: block; border: 1px solid #555; border-radius: 4px; padding: 1rem; background: #3a3a3a; container-type: inline-size; margin-bottom: 1rem; cursor: default; }
  :host(.selected) { border-color: var(--accent, #b16ee0); box-shadow: 0 0 5px var(--accent, #b16ee0); }
  :host(.status-pending) { border-left: 5px solid orange; padding-left: calc(1rem - 5px); }
  h3 { margin: 0 0 0.5rem; font-size: 1.1em; color: #b16ee0; word-break: break-all; }
  .desc { font-size: 0.9em; margin-bottom: 1rem; color: #ccc; }
  .meta span { display: block; font-size: 0.8em; color: #aaa; margin-bottom: 2px; }
  .meta strong { color: #ccc; min-width: 60px; display: inline-block; }
  details { margin-top: 1rem; border-top: 1px dashed #555; padding-top: 0.5rem; }
  summary { cursor: pointer; font-weight: bold; margin-bottom: 0.5rem; list-style: none; } /* Remove default marker */
  summary::-webkit-details-marker { display: none; } /* Chrome/Safari */
  summary::before { content: '☛ '; font-size: 0.8em; margin-right: 4px; }
  details[open] > summary::before { content: '▼ '; }
  pre { margin: 0.5rem 0; white-space: pre-wrap; word-wrap: break-word; max-height: 200px; overflow-y: auto; background: #222; padding: 0.5rem; border-radius: 3px; font-size: 0.85em; }
  .actions { margin-top: 1rem; border-top: 1px solid #555; padding-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  button { font-size: 0.9em; padding: 0.4rem 0.8rem; cursor: pointer; border-radius: 3px; border: none; background: #b16ee0; color: white; }
  button:hover:not(:disabled) { opacity: 0.9; }
  button:disabled { opacity: 0.5; cursor: not-allowed;}
  .del-btn { background: #c74754; margin-left: auto; }
  .del-btn:hover:not(:disabled) { background: #a71d2a; }
  .args-form { margin-top: 0.5rem; }
  .arg-group { margin-bottom: 0.5rem; }
  .arg-group label { display: block; margin-bottom: 2px; font-size: 0.9em; }
  .arg-group label span { font-size: 0.8em; color: #bbb; margin-left: 5px; }
  .arg-group input[type=text], .arg-group input[type=number] { width: 100%; padding: 0.3rem; background: #555; color: #eee; border: 1px solid #777; border-radius: 3px; font-size: 0.9em; box-sizing: border-box; }
  .arg-group input[type=checkbox] { margin-right: 5px; vertical-align: middle; }
</style>
<h3 id="name">Tool Name</h3>
<p id="desc" class="desc">Tool description...</p>
<div class="meta">
  <span><strong>ID:</strong> <code id="tool_id">tool-id</code></span>
  <span><strong>Created:</strong> <span id="created">timestamp</span></span>
</div>
<details id="args_details">
  <summary>Arguments</summary>
  <form id="args_form" class="args-form"></form>
</details>
<details>
  <summary>MCP Definition</summary>
  <pre><code id="mcp">{}</code></pre>
</details>
<details>
  <summary>JS Implementation</summary>
  <pre><code id="impl">async function run(args) {}</code></pre>
</details>
<details id="wc_details">
  <summary>Web Component Code</summary>
  <pre><code id="wc">class ToolWC extends HTMLElement {}</code></pre>
</details>
<div class="actions">
  <button class="edit-btn" title="Edit original request">Edit Req</button>
  <button class="exec-btn" title="Execute JS Implementation">Run Logic</button>
  <button class="show-wc-btn" title="Show Web Component UI">Show WC</button>
  <button class="del-btn" title="Delete tool">Delete</button>
</div>
`;

class ToolCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._data = null;
    this._is_pending = false;
    // Cache element references
    this.elems = {
      name: this.shadowRoot.getElementById('name'),
      desc: this.shadowRoot.getElementById('desc'),
      tool_id: this.shadowRoot.getElementById('tool_id'),
      created: this.shadowRoot.getElementById('created'),
      mcp: this.shadowRoot.getElementById('mcp'),
      impl: this.shadowRoot.getElementById('impl'),
      wc: this.shadowRoot.getElementById('wc'),
      wc_details: this.shadowRoot.getElementById('wc_details'),
      args_details: this.shadowRoot.getElementById('args_details'),
      args_form: this.shadowRoot.getElementById('args_form'),
      actions: this.shadowRoot.querySelector('.actions'),
      edit_btn: this.shadowRoot.querySelector('.edit-btn'),
      exec_btn: this.shadowRoot.querySelector('.exec-btn'),
      show_wc_btn: this.shadowRoot.querySelector('.show-wc-btn'),
      del_btn: this.shadowRoot.querySelector('.del-btn'),
    };

    const stopInteractivePropagation = (evt) => {
      const composedPath = evt.composedPath?.() || [];
      const interactive = composedPath.find((node) => {
        const tag = node?.tagName;
        return (
          tag === 'BUTTON' ||
          tag === 'INPUT' ||
          tag === 'SELECT' ||
          tag === 'TEXTAREA' ||
          tag === 'LABEL' ||
          tag === 'SUMMARY' ||
          tag === 'DETAILS'
        );
      });
      if (interactive) {
        evt.stopPropagation();
        evt.stopImmediatePropagation?.();
      }
    };

    this.shadowRoot.addEventListener('click', stopInteractivePropagation, { capture: true });
    this.shadowRoot.addEventListener('pointerdown', stopInteractivePropagation, { capture: true });
  }

  set_data(data, is_pending = false) {
    this._data = data;
    this._is_pending = is_pending;
    if (!data || (!data.id && !data.temp_id) || (!data.mcp && !data.meta) || !data.impl) {
      this.render_error(data);
      return;
    }
    this.render();
    this.build_args();
    this.update_actions();
    this.classList.toggle('status-pending', is_pending);
  }

  get_id() {
      return this._data?.id || this._data?.temp_id;
  }

  render_error(data) {
    this.elems.name.textContent = 'Invalid Tool Data';
    this.elems.desc.textContent = '';
    this.elems.tool_id.textContent = data?.id || data?.temp_id || 'N/A';
    this.elems.created.textContent = 'N/A';
    this.elems.mcp.textContent = '';
    this.elems.impl.textContent = '';
    this.elems.wc.textContent = '';
    this.elems.wc_details.style.display = 'none';
    this.elems.args_form.innerHTML = '';
    this.elems.args_details.style.display = 'none';
    this.elems.actions.style.display = 'none';
  }

  render() {
    const d = this._data;
    const meta = d.meta || {}; // Use meta for approved, mcp for pending
    const mcp_def = d.mcp || meta.mcp || {}; // Get MCP from wherever it is

    this.elems.name.textContent = meta.name || mcp_def.name || '(Unnamed)';
    this.elems.desc.textContent = meta.description || mcp_def.description || '(No description)';
    this.elems.tool_id.textContent = d.id || d.temp_id;
    this.elems.created.textContent = meta.createdAt ? new Date(meta.createdAt).toLocaleString() : 'Pending';

    this.elems.mcp.textContent = Utils.stringify(mcp_def, null, 2);
    this.elems.impl.textContent = d.impl;
    // Show WC code if available directly (pending), otherwise indicate it's stored
    this.elems.wc.textContent = d.wc || (d.wc_ref ? '(Code stored separately)' : '(N/A)');
    this.elems.wc_details.style.display = (d.wc || d.wc_ref) ? 'block' : 'none';
  }

  build_args() {
     this.elems.args_form.innerHTML = '';
     const props = this._data.mcp?.inputSchema?.properties;
     const required = new Set(this._data.mcp?.inputSchema?.required || []);
     if (!props || Object.keys(props).length === 0) {
        this.elems.args_details.style.display = 'none';
        return;
     }
     this.elems.args_details.style.display = 'block';

     for (const name in props) {
        if (!Object.hasOwnProperty.call(props, name)) continue;
        const prop = props[name];
        const group = document.createElement('div');
        group.className = 'arg-group';
        const label = document.createElement('label');
        label.htmlFor = name;
        label.textContent = name;
        if (prop.description) label.innerHTML += ` <span>(${Utils.escape(prop.description)})</span>`;
        if (required.has(name)) label.textContent += ' *';

        let input;
        if (prop.type === 'boolean') {
           input = document.createElement('input');
           input.type = 'checkbox';
           input.checked = prop.default ?? false;
           label.prepend(input, ' ');
        } else {
           input = document.createElement('input');
           input.type = prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text';
           if (prop.type === 'integer') input.step = '1';
           input.value = prop.default ?? '';
        }
        input.id = name;
        input.name = name;
        if (required.has(name)) input.required = true;

        group.appendChild(label);
        if (prop.type !== 'boolean') group.appendChild(input);
        this.elems.args_form.appendChild(group);
     }
  }

  collect_args() {
    const args = {};
    const inputs = this.elems.args_form.querySelectorAll('input');
    let is_valid = true;
    inputs.forEach(input => {
      const name = input.name;
      const props = this._data.mcp?.inputSchema?.properties?.[name];
      let value;
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = input.value === '' ? props?.default ?? null : input.valueAsNumber;
        if (isNaN(value)) value = props?.default ?? null;
      } else {
        value = input.value === '' ? props?.default ?? '' : input.value;
      }

      // Only include if value is present or it's a boolean (always include boolean)
      if (input.type === 'boolean' || (value !== null && value !== '')) {
        args[name] = value;
      } else if (input.required) {
         is_valid = false;
         input.style.borderColor = 'red';
         this.dispatch_event('notify', { msg: `Missing required arg: ${name}`, type: 'warn' });
      } else {
          input.style.borderColor = '';
      }
    });
    if (!is_valid) throw new Error('Missing required arguments.');
    return args;
  }

  update_actions() {
     const show_pending_actions = this._is_pending;
     this.elems.edit_btn.style.display = show_pending_actions ? 'none' : 'inline-block';
     this.elems.exec_btn.style.display = show_pending_actions ? 'none' : 'inline-block';
     this.elems.del_btn.style.display = show_pending_actions ? 'none' : 'inline-block';
     // Always show WC button if WC exists (either directly or via ref)
     this.elems.show_wc_btn.style.display = (this._data.wc || this._data.wc_ref) ? 'inline-block' : 'none';
     // Disable execute if no args form is present but args are defined? No, handle in exec logic.
  }

  connectedCallback() {
    // Use event delegation on the host? Or direct listeners? Direct is simpler here.
    this.elems.edit_btn?.addEventListener('click', () => this.dispatch_event('edit-req', { tool_id: this._data.id, req: this._data.meta?.sourceRequest }));
    this.elems.exec_btn?.addEventListener('click', this.handle_exec.bind(this));
    this.elems.show_wc_btn?.addEventListener('click', () => this.dispatch_event('show-wc', { tool_id: this.get_id(), wc_code: this._data.wc, mcp: this._data.mcp || this._data.meta?.mcp }));
    this.elems.del_btn?.addEventListener('click', () => this.dispatch_event('delete-tool', { tool_id: this._data.id, name: this.elems.name.textContent }));
  }

  handle_exec() {
     try {
        const args = this.collect_args();
        this.dispatch_event('exec-tool', { tool_id: this._data.id, name: this.elems.name.textContent, args });
     } catch (e) {
        console.warn('Arg collection failed', e);
     }
  }

  dispatch_event(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}

customElements.define('tool-card', ToolCard);
export default ToolCard;
