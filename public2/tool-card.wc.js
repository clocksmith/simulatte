import Utils from "./utils.js";

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host {
        display: block;
        border: 1px solid var(--border-color, #444);
        border-radius: var(--border-radius, 4px);
        padding: var(--padding-md, 1rem);
        background-color: #2a2a2a;
        container-type: inline-size;
    }
     h3 {
        margin-top: 0;
        margin-bottom: var(--padding-sm, 0.5rem);
        font-size: 1.1em;
        color: var(--accent-color, #811dbf);
        word-break: break-all;
    }
    .description {
        font-size: 0.9em;
        margin-bottom: var(--padding-md, 1rem);
        color: #ccc;
    }
    .metadata span {
        display: block;
        font-size: 0.8em;
        color: #aaa;
        margin-bottom: 2px;
    }
     .metadata strong {
        color: #ccc;
        min-width: 80px;
        display: inline-block;
    }
    details {
        margin-top: var(--padding-md, 1rem);
        border-top: 1px dashed var(--border-color, #444);
        padding-top: var(--padding-sm, 0.5rem);
    }
    summary {
        cursor: pointer;
        font-weight: bold;
        margin-bottom: var(--padding-sm, 0.5rem);
    }
    pre {
        margin-top: var(--padding-sm, 0.5rem);
        white-space: pre-wrap;
        word-wrap: break-word;
        max-height: 250px;
    }
    .actions {
        margin-top: var(--padding-md, 1rem);
        border-top: 1px solid var(--border-color, #444);
        padding-top: var(--padding-md, 1rem);
        display: flex;
        flex-wrap: wrap;
        gap: var(--padding-sm, 0.5rem);
        align-items: center;
    }
    button {
        font-size: 0.9em;
        padding: 0.4rem 0.8rem;
    }
    .actions-group {
        display: flex;
        gap: var(--padding-sm);
    }
    .delete-button {
        background-color: var(--error-color) !important;
        margin-left: auto;
    }
    .delete-button:hover {
        background-color: #a71d2a !important;
    }
    #args-container {
        display: none; /* Hidden by default */
        margin-bottom: var(--padding-md);
        width: 100%;
        border-top: 1px dashed var(--border-color, #444);
        padding-top: var(--padding-md);
    }
    #args-container.open {
        display: block;
    }
    .argument-input-group {
        margin-bottom: var(--padding-sm);
    }
    .argument-input-group label {
        display: block;
        margin-bottom: 2px;
    }
    .argument-input-group label span {
        font-size: 0.8em;
        font-weight: normal;
        color: #bbb;
        margin-left: 5px;
    }
     .argument-input-group input[type="checkbox"] {
        margin-right: 5px;
     }

    @container (max-width: 400px) {
         h3 { font-size: 1em; }
         .description { font-size: 0.85em; }
         .actions { flex-direction: column; align-items: flex-start; }
         .actions-group { margin-bottom: var(--padding-sm); }
         .delete-button { margin-left: 0; }
     }

</style>
<h3 id="name">Tool Name</h3>
<p id="description" class="description">Tool description...</p>
<div class="metadata">
    <span><strong>ID:</strong> <code id="tool-id">tool-id</code></span>
    <span><strong>Created:</strong> <span id="created-at">timestamp</span></span>
    <span><strong>Version:</strong> <span id="version">1.0.0</span></span>
</div>

<div id="args-container" class="args-container">
  <details>
    <summary>Execution Arguments</summary>
    <form id="args-form"></form>
  </details>
</div>

<details>
    <summary>View Definition (MCP)</summary>
    <pre><code id="mcp-definition">{}</code></pre>
</details>
<details>
    <summary>View Implementation (JS)</summary>
    <pre><code id="js-implementation">async function run(args) { }</code></pre>
</details>
<div class="actions">
    <div class="actions-group">
        <button class="edit-button" title="Edit the original request for this tool">Edit</button>
        <button class="execute-button" title="Execute this tool">Execute</button>
    </div>
    <button class="delete-button" title="Delete this tool permanently">Delete</button>
</div>
`;

class ToolCardComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._toolData = null;
    this.argsForm = this.shadowRoot.getElementById("args-form");
    this.argsContainer = this.shadowRoot.getElementById("args-container");
  }

  setToolData(data) {
    if (this.isInvalidToolData(data)) {
      console.error(`Invalid tool data passed to tool-card:`, data);
      this.renderError(data);
      return;
    }
    this._toolData = data;
    this.render();
    this.buildArgsForm();
  }

  isInvalidToolData(data) {
    return (
      !data ||
      !data.id ||
      !data.metadata ||
      !data.mcpDefinition ||
      !data.jsImplementation
    );
  }

  renderError(data) {
    this.shadowRoot.getElementById("name").textContent = "Invalid Tool Data";
    this.shadowRoot.getElementById("description").textContent = "";
    this.shadowRoot.getElementById("tool-id").textContent = data?.id || "N/A";
    this.shadowRoot.getElementById("created-at").textContent = "";
    this.shadowRoot.getElementById("version").textContent = "";
    this.shadowRoot.getElementById("mcp-definition").textContent = "";
    this.shadowRoot.getElementById("js-implementation").textContent = "";
    this.argsContainer.style.display = "none"; // Hide args form on error
  }

  render() {
    if (!this._toolData) return;

    const metadata = this._toolData.metadata;
    this.shadowRoot.getElementById("name").textContent = metadata.name || "(Unnamed Tool)";
    this.shadowRoot.getElementById("description").textContent =
      metadata.description || "(No description provided)";
    this.shadowRoot.getElementById("tool-id").textContent = this._toolData.id;
    this.shadowRoot.getElementById("created-at").textContent =
      metadata.createdAt
        ? new Date(metadata.createdAt).toLocaleString()
        : "N/A";
    this.shadowRoot.getElementById("version").textContent = metadata.version || "N/A";

    try {
      this.shadowRoot.getElementById("mcp-definition").textContent = JSON.stringify(this._toolData.mcpDefinition, null, 2);
    } catch (e) {
      const mcpEl = this.shadowRoot.getElementById("mcp-definition");
      mcpEl.textContent = `Error displaying MCP JSON: ${e.message}\n\n${this._toolData.mcpDefinition}`;
      mcpEl.style.color = "var(--error-color)";
    }

    const escape = Utils?.escapeHtml || ((str) => str);
    this.shadowRoot.getElementById("js-implementation").innerHTML = escape(this._toolData.jsImplementation);
  }

  buildArgsForm() {
    this.argsForm.innerHTML = '';
    const props = this._toolData.mcpDefinition?.inputSchema?.properties;
    const required = new Set(this._toolData.mcpDefinition?.inputSchema?.required || []);

    if (!props || Object.keys(props).length === 0) {
        this.argsContainer.style.display = "none";
        return;
    }
    this.argsContainer.style.display = "block";
    this.argsContainer.classList.remove("open"); // Start closed

    for (const paramName in props) {
        if (!Object.hasOwnProperty.call(props, paramName)) continue;

        const prop = props[paramName];
        const group = document.createElement("div");
        group.classList.add("argument-input-group");

        const label = document.createElement("label");
        label.htmlFor = paramName;
        label.textContent = paramName;
        if (prop.description) {
            const descSpan = document.createElement("span");
            descSpan.textContent = ` (${prop.description})`;
            label.appendChild(descSpan);
        }
        group.appendChild(label);

        let input;
        switch (prop.type) {
            case "number":
            case "integer":
                input = document.createElement("input");
                input.type = "number";
                if (prop.type === "integer") input.step = "1";
                break;
            case "boolean":
                input = document.createElement("input");
                input.type = "checkbox";
                 // Place checkbox before label text for convention
                 label.insertBefore(input, label.firstChild);
                break;
            default: // string
                input = document.createElement("input");
                input.type = "text";
                break;
        }

        input.id = paramName;
        input.name = paramName;
        if (required.has(paramName)) {
            input.setAttribute("required", "");
            label.textContent += " *"; // Indicate required
        }

        if (prop.default !== undefined) {
            if (prop.type === "boolean") {
                input.checked = prop.default;
            } else {
                input.value = prop.default;
            }
        }
        // Don't append checkbox again if inserted into label
        if(prop.type !== 'boolean') {
            group.appendChild(input);
        }

        this.argsForm.appendChild(group);
    }
  }

  collectArgs() {
    const args = {};
    const inputs = this.argsForm.querySelectorAll("input"); // Select all input types
    inputs.forEach((input) => {
      const name = input.name;
      const type = this._toolData.mcpDefinition?.inputSchema?.properties[name]?.type;
      let value;

      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number") {
        value = input.valueAsNumber;
        if (isNaN(value)) value = props[input.name]?.default ?? null; // Handle potential NaN
      } else {
        value = input.value;
      }

      if (value !== null && value !== "" ) {
        args[name] = value;
      } else if (input.required) {
        throw new Error(`Missing required argument: ${name}`);
      }
    });
    return args;
  }


  connectedCallback() {
    this.setupActionListeners();
  }

  setupActionListeners() {
    this.setupListener(".delete-button", "click", this._handleDelete);
    this.setupListener(".edit-button", "click", this._handleEdit);
    this.setupListener(".execute-button", "click", this._handleExecute);
     // Toggle args visibility when summary is clicked
    const detailsElement = this.argsContainer.querySelector('details');
    if (detailsElement) {
        detailsElement.addEventListener('toggle', () => {
            this.argsContainer.classList.toggle('open', detailsElement.open);
        });
    }
  }

  setupListener(className, eventType, handler) {
    const button = this.shadowRoot.querySelector(className);
    if (button) {
      button.addEventListener(eventType, handler.bind(this));
    }
  }

  _handleDelete() {
    if (!this._toolData) return;
    this.dispatchCustomEvent("delete-tool", {
      toolId: this._toolData.id,
      toolName: this._toolData.metadata.name,
    });
  }

  _handleEdit() {
    if (!this._toolData || !this._toolData.metadata) return;
    this.dispatchCustomEvent("edit-tool-request", {
      toolId: this._toolData.id,
      originalRequest: this._toolData.metadata.originalRequest
    });
  }

  _handleExecute() {
    if (!this._toolData) return;
    let args;
    const hasArgs = this._toolData.mcpDefinition?.inputSchema?.properties && Object.keys(this._toolData.mcpDefinition.inputSchema.properties).length > 0;

    if (hasArgs && !this.argsContainer.classList.contains('open')) {
        // Open the args section if it has args and isn't open yet
         const detailsElement = this.argsContainer.querySelector('details');
         if (detailsElement) detailsElement.open = true;
         return; // Don't execute yet, let user fill args
    }

    try {
      args = this.collectArgs();
    } catch (e) {
      alert(`Failed to collect arguments: ${e.message}`);
      return;
    }
    this.dispatchCustomEvent("execute-tool", {
      toolId: this._toolData.id,
      toolName: this._toolData.metadata.name,
      args: args,
    });
  }

  dispatchCustomEvent(eventName, detailObj) {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail: detailObj,
        bubbles: true,
        composed: true,
      })
    );
  }
}

// Register the component if not already
customElements.get("tool-card") || customElements.define("tool-card", ToolCardComponent);

export default ToolCardComponent;