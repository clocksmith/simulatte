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
        color: var(--accent-color, #007bff);
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
    }
    button {
        font-size: 0.9em;
        padding: 0.4rem 0.8rem;
    }
    .delete-button {
        background-color: var(--error-color, #dc3545) !important; 
         margin-left: auto; 
    }
    .delete-button:hover {
        background-color: #a71d2a !important;
    }

     @container (max-width: 350px) {
         h3 { font-size: 1em; }
         .description { font-size: 0.85em; }
         .actions { justify-content: space-between; } 
         .delete-button { margin-left: 0; } 
     }


</style>
<h3 id="name">Tool Name</h3>
<p class="description" id="description">Tool description...</p>
<div class="metadata">
    <span><strong>ID:</strong> <code id="tool-id">tool-id</code></span>
    <span><strong>Created:</strong> <span id="created-at">timestamp</span></span>
    <span><strong>Version:</strong> <span id="version">1.0.0</span></span>
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
    <button class="execute-button" title="Execute this tool">Execute</button>
    <button class="delete-button" title="Delete this tool permanently">Delete</button>
</div>
`;

class ToolCardComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._toolData = null;
  }

  setToolData(data) {
    if (
      !data ||
      !data.id ||
      !data.metadata ||
      !data.mcpDefinition ||
      !data.jsImplementation
    ) {
      console.error("Invalid tool data passed to tool-card:", data);

      this.shadowRoot.getElementById("name").textContent = "Invalid Tool Data";
      this.shadowRoot.getElementById("description").textContent = "";
      this.shadowRoot.getElementById("tool-id").textContent = data?.id || "N/A";
      this.shadowRoot.getElementById("created-at").textContent = "";
      this.shadowRoot.getElementById("version").textContent = "";
      this.shadowRoot.getElementById("mcp-definition").textContent = "";
      this.shadowRoot.getElementById("js-implementation").textContent = "";

      return;
    }
    this._toolData = data;
    this.render();
  }

  render() {
    if (!this._toolData) return;

    const nameEl = this.shadowRoot.getElementById("name");
    const descEl = this.shadowRoot.getElementById("description");
    const idEl = this.shadowRoot.getElementById("tool-id");
    const createdEl = this.shadowRoot.getElementById("created-at");
    const versionEl = this.shadowRoot.getElementById("version");
    const mcpEl = this.shadowRoot.getElementById("mcp-definition");
    const jsEl = this.shadowRoot.getElementById("js-implementation");

    nameEl.textContent = this._toolData.metadata.name || "(Unnamed Tool)";
    descEl.textContent =
      this._toolData.metadata.description || "(No description provided)";
    idEl.textContent = this._toolData.id;
    createdEl.textContent = this._toolData.metadata.createdAt
      ? new Date(this._toolData.metadata.createdAt).toLocaleString()
      : "N/A";
    versionEl.textContent = this._toolData.metadata.version || "N/A";

    try {
      mcpEl.textContent = JSON.stringify(this._toolData.mcpDefinition, null, 2);
    } catch (e) {
      mcpEl.textContent = `Error displaying MCP JSON: ${e.message}\n\n${this._toolData.mcpDefinition}`;
      mcpEl.style.color = "var(--error-color, red)";
    }

    const escape = Utils?.escapeHtml || ((str) => str);
    jsEl.innerHTML = escape(this._toolData.jsImplementation);
  }

  connectedCallback() {
    this.shadowRoot
      .querySelector(".delete-button")
      .addEventListener("click", () => {
        if (this._toolData) {
          this.dispatchEvent(
            new CustomEvent("delete-tool", {
              detail: {
                toolId: this._toolData.id,
                toolName: this._toolData.metadata.name,
              },
              bubbles: true,
              composed: true,
            })
          );
        }
      });

    this.shadowRoot
      .querySelector(".execute-button")
      .addEventListener("click", () => {
        if (this._toolData) {
          let args = {};
          const props = this._toolData.mcpDefinition?.inputSchema?.properties;
          if (props && Object.keys(props).length > 0) {
            try {
              const argsString = prompt(
                `Enter arguments as JSON for ${
                  this._toolData.metadata.name
                }:\n${JSON.stringify(
                  Object.keys(props)
                )}\nExample: {"param1": "value1", ...}`
              );
              if (argsString === null) {
                return;
              }
              args = argsString.trim() ? JSON.parse(argsString) : {}; // Handle empty input as empty object
            } catch (e) {
              alert(`Invalid JSON input: ${e.message}`);
              return;
            }
          } else {
            console.log(
              `Executing ${this._toolData.metadata.name} with no arguments.`
            );
          }

          this.dispatchEvent(
            new CustomEvent("execute-tool", {
              detail: {
                toolId: this._toolData.id,
                toolName: this._toolData.metadata.name,
                args: args,
              },
              bubbles: true,
              composed: true,
            })
          );
        }
      });
  }
}

export default ToolCardComponent;
