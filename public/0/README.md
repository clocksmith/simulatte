# REPLOID (Reflective Embodiment Providing Logical Oversight for Intelligent DREAMER (Deep Recursive Exploration Around Multimodal Embodying REPLOID)) v0.0.0

REPLOID is a self-contained HTML/CSS/JS application demonstrating a conceptual framework for LLM-driven iterative design, development, tool creation, and potential self-improvement. It operates entirely within the browser, leveraging the Google Gemini API and browser `localStorage` for persistent, versioned artifact storage.

The core idea is to treat every component – UI structure (HTML), styling (CSS), core logic (JS), prompts, diagrams, generated tools, context summaries – as versioned "artifacts". The agent analyzes goals, reads relevant artifacts from the current cycle's state in `localStorage`, proposes changes or new artifacts, and upon successful critique (or skipping critique), saves these outputs associated with the _next_ cycle number back into `localStorage`. This creates a traceable, iterative development history stored directly in the browser.

## Key Concept: Artifacts & LocalStorage Persistence

In this version of REPLOID, the fundamental unit of work and state is the **artifact**.

- **Definition:** An artifact represents a distinct piece of code, data, or text managed by the system. Examples include `reploid.style.main` (CSS), `reploid.body.main` (HTML structure), `reploid.script.core` (core JS logic), `reploid.prompt.core` (LLM prompt), `target.diagram` (JSON), `meta.summary_context` (auto-generated text summary), and any dynamically created tools or target application code.
- **Storage:** All artifacts are stored directly in the browser's `localStorage`.
- **Versioning:** Artifacts are versioned by cycle number. When an artifact is created or modified during cycle `N`, its content is saved under a key associated with cycle `N+1`. The key format is generally `reploid_artifact_ARTIFACT_ID_CYCLE_NUMBER` (e.g., `reploid_artifact_target.body_5`).
- **Initialization (Cycle 0):** On first load or after clearing storage, the application's bootstrap script populates `localStorage` with the essential "Cycle 0" artifacts (core script, styles, body HTML, default prompts, initial target artifacts) using built-in default values.
- **Metadata:** A separate `artifactMetadata` object (stored within the main application state, _not_ as an artifact itself) tracks the ID, type, description, and the _latest_ cycle number for each known artifact. This allows the agent to easily find the most recent version when analyzing the current state.
- **Limits:** Be aware that `localStorage` has size limits (typically 5-10MB per origin), and individual artifact strings also have an internal sanity check (currently ~256KB) to prevent excessively large items that might cause issues.

This approach ensures that the application state, including all generated code and data, persists between browser sessions without requiring a backend server. The main application state (metrics, configuration, logs, artifact metadata) is saved separately under a single key (`x0_state_v0.0`) in `localStorage`.

## How to Use:

1.  **API Key:** Obtain a Google Gemini API key.
    - **Option A (Recommended):** Create a file named `config.js` in the same directory as `index.html` with the content:
      ```javascript
      // File: config.js
      export const APP_CONFIG = {
        API_KEY: "<YOUR_API_KEY>",
        BASE_GEMINI_MODEL: "models/gemini-1.5-flash-latest", // Or another compatible model
      };
      ```
    - **Option B:** Paste your API key directly into the "API Key" field in the UI.
2.  **Open:** Save the main code as `index.html` and open it in a modern web browser (Chrome, Edge, Firefox recommended). The core application logic, styles, and HTML structure will be loaded from `localStorage` (and initialized if missing).
3.  **Configure (Optional):** Adjust configuration settings in the "Configuration" fieldset. Fieldsets are collapsible; click the legend (`[+/-]`) to expand/collapse. Summaries provide a quick overview when collapsed.
4.  **Set Goal:** Define **only ONE** goal per cycle:
    - **System Goal (External):** Design/generate code/UI for a separate application. Input the description in the "System Goal" textarea. Expect `target.*` artifacts to be generated/modified.
    - **Meta Goal (Self-Improvement):** Modify REPLOID's own UI, features, or logic. Input the description in the "Meta Goal" textarea. Expect `reploid.*` artifacts to be generated/modified, potentially requiring sandbox approval (`full_html_source`) for JS changes.
    - **Cumulative Goal:** The first goal entered becomes the "Seed Goal". Subsequent goals are appended to build a cumulative context, which is provided to the LLM.
5.  **Run:** Click "Run Cycle".
6.  **Observe:** Monitor the "Current Cycle Details" section. Artifacts displayed here show their type indicator (e.g., `[JS]`, `[CSS]`), ID, cycle number, source (User, System, LLM, Tool, Human), and whether they were modified (`*`). Check the "Iteration Timeline" for detailed logs and the "Status Indicator". The "Cycle Flow Diagram" provides a visual overview of the process.
7.  **Critique/Pause/Sandbox:**
    - **Auto-Critique:** May run based on probability. Results shown in cycle details and timeline.
    - **Human Intervention:** May pause based on config or manual force. Interact via the dedicated HITL section (collapsible fieldset).
    - **Sandbox:** If a `full_html_source` meta-update is generated, inspect the preview and approve/discard. Approval triggers a state-preserving page reload.
8.  **Self-Modification:** Approved full source changes are applied automatically upon reload. Use "Go Back" to revert the page HTML to a previously saved version (state is preserved/restored via Session Storage for this action).
9.  **State Management:**
    - **Export/Import State:** Saves/loads the main application state (metrics, logs, config, artifact _metadata_, history), **excluding** the actual artifact content which resides in `localStorage`.
    - **Reset Context:** Automatically runs the summarization prompt, saves the result as a new `meta.summary_context` artifact for the _next_ cycle, and updates the current context used by the LLM.
    - **Clear Storage:** **WARNING:** Deletes _all_ REPLOID artifacts and saved state from `localStorage`. Use with caution!

## Key Features (v0.0.0):

- **LocalStorage Persistence:** All artifacts (code, prompts, HTML, CSS, diagrams, summaries) are stored and versioned by cycle in the browser's `localStorage`.
- **Cumulative Goal Context:** Goals build upon each other across cycles.
- **Artifact Metadata Tracking:** Internal state tracks artifact types, descriptions, and latest versions.
- **Collapsible UI Sections:** Fieldsets can be collapsed/expanded for better focus, showing summaries when collapsed.
- **Improved Layout:** Denser configuration grid, more compact metrics display, adjusted prompt area heights.
- **Enhanced Artifact Display:** Shows type indicators and source information for better traceability within a cycle.
- **Cycle Flow Diagram:** Visualizes the core REPLOID execution loop.
- **Client-Side Tool Sandbox:** Dynamic tools are executed in isolated Web Workers.
- **Automatic Context Reset:** Simplifies context management via summarization artifact generation.
- **REPLOID/DREAMER Persona:** With explicit LSD/XYZ deliberation.
- **Unified Cycle View:** Displays inputs, intermediates, and outputs for the current cycle.
- **Detailed Timeline:** Logs API calls, tool usage, decisions, critiques, state changes.
- **Integrated Tool Creation:** Tools defined/implemented as artifacts.
- **Sandbox Preview & Auto Self-Mod:** For safe application of meta-updates.
- **Multi-Mode HITL:** Including direct artifact editing.
- **Genesis State Display:** Shows initial Cycle 0 state loaded from storage.
- **Error Retry & Context Warnings:** Basic resilience and token awareness.

## Limitations & Notes:

- Experimental tool. Expect potential quirks or errors.
- **State Export/Import excludes artifact content.** To fully back up/transfer, you'd need other means to copy `localStorage` data.
- `localStorage` has size limits (typically 5-10MB total). Very long runs or large artifacts could exceed quota. Use "Clear Storage" if needed.
- SVG diagram rendering is functional but basic.
- Dynamic tool execution uses Web Workers for sandboxing, improving security over `new Function()`, but complex/malicious worker code could still potentially cause issues.
- Error handling and retry logic are basic.
- API costs are not tracked.

## NOTES

!!!!!!!IMPOORTANT!!!!!!!!!!!!

TODO: fix fetching, importing, and artifacting in boot strap,

TODO: then make sure to only use artifact saving and loading for cycle

TODO: make sur artifacts know how to operate with eachother (static tools)?

TODO: Make sure tool runner works

TODO: make sure HITL works

TODO: make sure all config params are respected

TODO: make sure
