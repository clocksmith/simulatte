# REPLOID (Reflective Embodiment Providing Logical Oversight for Intelligent DREAMER (Deep Recursive Exploration Around Multimodal Embodying REPLOID)) v0.0.0

# REPLOID (Reflective Embodiment Providing Logical Oversight for Intelligent DREAMER) v0.1.0

**REPLOID** is an experimental, self-contained HTML/CSS/JS application demonstrating a conceptual framework for LLM-driven iterative design, development, dynamic tool creation, and potential self-improvement. It operates entirely within the browser, leveraging the Google Gemini API and the browser's `localStorage` for persistent, versioned artifact storage. This project explores the possibilities and challenges of creating agents that can not only generate content or code but also reflect on their own structure and potentially modify themselves to better achieve goals, all within the constraints of a standard web browser environment.

The core idea is to treat every component – UI structure (HTML), styling (CSS), core logic (JS), system prompts, diagrams, dynamically generated tools, context summaries – as versioned **artifacts**. The agent, embodied by the persona 'x0' with its dual LSD/XYZ nature, analyzes goals, reads relevant artifacts from the current cycle's state in `localStorage`, proposes changes or new artifacts, and upon successful critique (or skipping critique), saves these outputs associated with the _next_ cycle number back into `localStorage`. This creates a traceable, iterative development history stored directly in the browser, offering a unique approach to agent state management.

## Core Concepts Explained

- **Artifact-Based System:** The fundamental unit of work and state is the **artifact**. This represents any distinct piece of code, data, or text managed by the system (e.g., `reploid.core.style`, `target.script.main`, `reploid.core.sys-prompt`, `meta.summary_context`). Treating everything as an artifact allows for uniform handling, versioning, and potential manipulation by the agent itself. Artifact metadata (type, description, latest cycle, source, optional checksum) is tracked by the `StateManager`.
- **LocalStorage Persistence & Versioning:** All artifacts are stored directly in the browser's `localStorage`, enabling persistence across sessions without a backend. Artifacts are versioned by cycle number; modifications proposed in cycle `N` are saved for use in cycle `N+1` (e.g., key `_x0_target.body_5`). This creates a verifiable "digital paper trail" of the agent's work. Basic quota checking is implemented in the `Storage` module to warn about potential limits.
- **Cycle-Based Operation:** The application operates in discrete cycles, orchestrated by `CycleLogic`. Each cycle represents a 'sense-think-act' loop: prepare state, define/refine goal, analyze state/artifacts, assemble prompt, call LLM, process response (including tool calls), trigger critique/review check, apply changes (potentially requiring sandbox approval), and update state for the next cycle.
- **Dual Persona (x0):** The agent possesses two personalities: LSD-1729 (intuitive, pattern-seeking, optimistic) and XYZ-2048 (logical, rigorous, skeptical). This internal duality, configurable via a balance setting, aims to foster both creative exploration and grounded implementation within the agent's reasoning process, reflected in its "musing" outputs.
- **Goal-Driven (System vs. Meta):** The agent works towards user-defined goals. **System Goals** focus on generating or modifying external targets (like a separate webpage or application components, represented by `target.*` artifacts). **Meta Goals** focus on modifying REPLOID itself (its UI, logic, prompts, tools, represented by `reploid.*` artifacts). This meta-capability is key to exploring self-improvement.
- **Self-Modification & Sandboxing:** When pursuing Meta goals, the agent can propose modifications to its own core files. Significant changes, especially to JavaScript or the overall HTML structure, often result in the generation of a `full_html_source` artifact. This triggers a **sandbox preview** where the user can inspect the proposed new version of the entire application in an iframe before approving. Approval initiates a state-preserving reload into the modified version using `sessionStorage`.
- **Tool Use & Creation:** The agent can leverage pre-defined **static tools** (like basic linters, validators, artifact readers/listers, text diff) and dynamically **create new tools** by defining their function signature (in JSON format) and generating the corresponding JavaScript implementation. These dynamic tools are executed within Web Workers by the `ToolRunner` for basic sandboxing, using a `postMessage` interface for controlled data access (e.g., fetching artifact content).
- **Human-In-The-Loop (HITL):** Cycles can be paused for human intervention due to low confidence scores, exceeding time limits, random probability checks, critique failures, explicit user request (`Force Review` button), or unrecoverable errors. The UI provides modes for giving prompt-based feedback, selecting from predefined options, or directly editing artifact code (validated by the `code_edit` tool).
- **State Management & Validation:** The `StateManager` handles the main application state object, including loading/saving, import/export (metadata only), version checking (major/minor/patch), and basic structural validation on load/import. `reploid-boot-script.js` performs initial state and essential artifact checks on startup.

## Architectural Overview

REPLOID follows a modular structure orchestrated primarily within `reploid-core-logic.js` (which is executed by `reploid-boot-script.js` after loading dependencies):

1.  **Bootstrap (`index.html`, `reploid-boot-script.js`):** Handles initial page load, user start interaction (continue/reset), loads core Config/Utils/Storage, checks for existing valid state and essential artifacts, runs the "Genesis" process (fetching and saving initial Cycle 0 artifacts to `localStorage` if needed), loads the main application orchestrator (`reploid-core-logic.js`), and fades out the loading screen.
2.  **Core Dependencies (`reploid-core-utils.js`, `reploid-core-storage.js`):** Provide essential functions for logging (with circular buffer), DOM manipulation, string utilities (`Utils`) and interaction with `localStorage`/`sessionStorage`, including basic quota checks (`Storage`).
3.  **Orchestrator (`reploid-core-logic.js`):** Acts as the entry point after bootstrap. It dynamically loads all other application modules (StateManager, ApiClient, ToolRunner, UI, CycleLogic, DiagramFactory) using a fetch-and-execute pattern, manages dependencies between them, and initiates the `StateManager`, `CycleLogic`, and `UI`.
4.  **`StateManager`:** Manages the main application state object (configuration, metrics, logs, artifact metadata, goals, history). Handles loading, saving, import/exporting state (metadata only), version compatibility checks, and basic state validation.
5.  **`UI`:** Responsible for rendering all visual components based on data from `StateManager`, handling user interactions, managing collapsible sections with summaries, displaying the timeline log (using non-emoji icons), showing cycle artifact details, managing HITL/Sandbox UI states, rendering the target UI preview and cycle diagrams (using the injected `DiagramFactory`), and showing notifications. Includes accessibility enhancements (ARIA roles/labels).
6.  **`ApiClient`:** Handles communication with the Google Gemini API. Manages request formatting, robust streaming response parsing (including function calls), improved JSON sanitization (layered approach), intelligent retry logic (status codes, backoff), and abort control.
7.  **`CycleLogic`:** Orchestrates the main execution loop (`executeCycle` refactored into helper functions). It prepares the cycle state, interprets goals, assembles prompts, calls the `ApiClient`, processes the LLM response, handles critique triggers (auto/human), invokes `ToolRunner` for function calls, applies changes via `StateManager` and `Storage` (`_applyLLMChanges`), manages HITL workflows, initiates sandbox previews or context summarization.
8.  **`ToolRunner`:** Executes both static and dynamic tools. Dynamic tools run inside sandboxed Web Workers with controlled data access via `postMessage`. Static tools access artifacts via `Storage` based on passed IDs or operate on provided arguments. Handles MCP-to-Gemini conversion.
9.  **`DiagramFactory` (`renderCycleSVG` within UI):** Takes diagram JSON data and renders an SVG representation of the cycle flow, used by the UI module.

## How to Use

1.  **API Key:** Obtain a Google Gemini API key. This is **required**.
    - **Option A (Recommended):** Place your key in a `config.js` file at the same level as `index.html`. Create it if it doesn't exist: `window.REPLOID_API_KEY = "YOUR_API_KEY_HERE";`. The app will attempt to load this first.
    - **Option B:** Paste your API key directly into the "API Key" field in the UI's "Controls" section after the app loads. This key will be saved in the application state within `localStorage`.
2.  **Open `index.html`:** Load the file in a modern web browser (Chrome, Edge, Firefox recommended).
3.  **Startup Interaction:**
    - Press `Enter` or Click/Tap: Continue the existing session (loads state from `localStorage`).
    - Press `Space` or Tap & Hold (1s): Resets the application, clears all associated `localStorage` data, and runs the Genesis process to load Cycle 0 artifacts. **Use reset with caution!**
4.  **Configure (Optional):** Expand the "Configuration" fieldset. Adjust settings like persona balance, critique probabilities, cycle limits, model selection, etc. Changes are saved automatically. Fieldsets show summaries when collapsed.
5.  **Set ONE Goal:** Define a single objective for the _next_ cycle in the "Goal Input" textarea. Select the "Goal Type":
    - **System Goal:** Describe a task for an external application (e.g., "Create a simple calculator UI with buttons for 0-9, +, -, =, C"). Expect `target.*` artifacts to be created/modified. The output preview pane will update.
    - **Meta Goal:** Describe a change to REPLOID itself (e.g., "Add a button to clear the timeline log" or "Improve the styling of the metrics display"). Expect `reploid.*` artifacts or `full_html_source` to be generated. May trigger the Sandbox preview.
    - _Cumulative Context:_ The first goal is the "Seed Goal". Subsequent goals refine the cumulative context sent to the LLM. Use the "Reset Context" button to summarize if context grows too large (check "Ctx Tokens" metric).
6.  **Run Cycle:** Click the "Run Cycle" button. The button text changes to "Abort Cycle" while running.
7.  **Observe:** Monitor the UI:
    - **Current Cycle Details:** Shows inputs (goal, context), LLM deliberations/justifications, proposed changes, tool calls/responses, and applied artifacts (with type, ID, source, mod indicator `*`), and the diagram. Includes a streaming output area for LLM responses. Expand/collapse using the legend.
    - **Execution Timeline:** Provides fine-grained logs using non-emoji icons ( ▲ API, ⚙ Tool, ❓ Critique, ☻ Human, ✎ Apply/Artifact, ⛶ State, ☰ Context, ◎ Goal, ↻ Cycle, ⎈ Retry, ✗ Error, ⚠ Warn, ✓ OK). Click cycle summary entries (⚐) to expand/collapse details (future feature, currently visual only).
    - **Status Indicator:** Shows the current agent activity (Idle, Calling API, Applying Changes, Paused, etc.). Includes API progress/token counts.
    - **External UI Preview:** Renders the current state of the `target.*` artifacts.
    - **Metrics:** Track cycle counts, confidence, token usage, etc.
8.  **Critique/Pause/Sandbox/HITL:** The cycle might pause:
    - **Auto-Critique:** May run based on probability. Results appear in cycle details/timeline. Failure usually forces HITL.
    - **Human Intervention (HITL):** Pauses due to low confidence, time limits, random checks, forced review, retry limits, or apply failures. The "Human Intervention Required" section appears. Use the provided options: provide prompt feedback, select checkboxes (if offered), or directly edit artifact code (select artifact, edit text, click "Submit Edits").
    - **Sandbox Preview:** Appears if a `full_html_source` meta-update is generated. Inspect the preview carefully. "Approve and Apply" reloads the page with the new code, preserving state via `sessionStorage`. "Discard" rejects the change and allows the cycle logic to proceed (usually asking for feedback via HITL).
9.  **Self-Modification:** Approved sandbox changes take effect on reload. The "Go Back" button uses `sessionStorage` to revert the _page HTML_ to a previous state (if available in history) while attempting to restore the corresponding application state.
10. **State Management:**
    - **Export/Import State:** Saves/loads the main application state object (metrics, logs, config, artifact _metadata_, history). **Crucially, this does _not_ include the actual artifact content stored in `localStorage`.** It's for transferring configuration or analysis, not full backup/restore. Use with caution between different versions or if `localStorage` has been cleared.
    - **Reset Context:** Triggers the LLM to summarize the current state, replacing the potentially long cumulative goal context with a concise summary artifact (`meta.summary_context`). Helps manage token limits.
    - **Clear Storage:** **WARNING:** Deletes _all_ REPLOID data (`_x0_*` artifacts and state) from `localStorage`. Use with extreme caution!

## Use Case Examples

**Example 1: System Goal - Add a Counter**

1.  **User Goal:** "Create a simple counter UI. It needs a display showing the current count (starting at 0) and two buttons: one to increment and one to decrement." (Goal Type: System)
2.  **Run Cycle 1:**
    - Agent analyzes goal. Decides to create `target.body` (HTML), `target.style.counter` (CSS), `target.script.counter` (JS).
    - LLM generates content for these artifacts. Confidence might be high.
    - Critique might be skipped or pass automatically.
    - `CycleLogic` calls `Storage.setArtifactContent` for the new artifacts for Cycle 1.
    - UI Preview pane updates to show the counter. Timeline logs artifact creation. State increments to Cycle 1.
3.  **User Goal (Cycle 1):** "The counter looks okay, but make the decrement button red."
4.  **Run Cycle 2:**
    - Agent analyzes goal, identifies `target.style.counter` from Cycle 1 as relevant.
    - LLM proposes modification to `target.style.counter`.
    - Confidence might be low (0.6) due to specific styling request.
    - **HITL Triggered:** "Low Confidence (0.60 < 0.75)". Human Intervention section appears.
    - **User Action:** User examines the proposed CSS change in "Current Cycle Details". Finds it acceptable. Enters "Looks good, proceed." in the HITL prompt box and clicks "Submit Feedback".
    - `CycleLogic` receives feedback, logs it. `_applyLLMChanges` saves the modified `target.style.counter` for Cycle 2.
    - UI Preview updates showing the red button. Timeline logs HITL and artifact modification. State increments to Cycle 2.

**Example 2: Meta Goal - Change Timeline Style**

1.  **User Goal:** "Make the error messages in the execution timeline background dark red instead of just red text." (Goal Type: Meta)
2.  **Run Cycle N:**
    - Agent analyzes goal. Identifies `reploid.core.style` as the relevant artifact.
    - LLM proposes modifications to the CSS rules for `.timeline li.error`. Confidence is high (0.9).
    - Auto-critique runs (based on probability) and passes.
    - `CycleLogic` calls `_applyLLMChanges`. The change modifies `reploid.core.style`.
    - **Potential Outcome 1 (Minor CSS Change):** If the change is deemed minor (heuristically, e.g., not changing layout drastically), `_applyLLMChanges` saves `reploid.core.style` for Cycle N+1. **The change is NOT immediately visible.** The user would need to manually reload the page (or wait for a future self-mod reload) to see the effect, as the currently loaded CSS is not swapped. State increments to N+1.
    - **Potential Outcome 2 (Agent decides Full Source needed):** The agent might decide (or be prompted) that modifying core CSS is risky and proposes a `full_html_source` artifact containing the _entire_ new page source with the updated CSS inline or referenced correctly.
    - **Sandbox Triggered:** `_applyLLMChanges` detects `full_html_source`, saves it to `state.lastGeneratedFullSource`, and calls `UI.showMetaSandbox`.
    - **User Action:** User inspects the preview in the sandbox iframe. The timeline errors now have a dark red background. User clicks "Approve and Apply".
    - **Reload:** The application saves essential state to `sessionStorage`, then writes the new HTML source to the document, causing a page reload. `reploid-boot-script.js` runs, finds the session state, `StateManager` restores it (including the Cycle N count), and the application loads using the new `reploid.core.style` (now implicitly part of the loaded HTML or fetched at Cycle N). The user now sees the new style applied. State increments to N+1 upon successful restoration.

## Key Features (v0.1.0)

- **LocalStorage Persistence & Versioning:** Serverless operation, artifact history.
- **Cycle-Based Iteration:** Structured sense-think-act loop.
- **Dual Persona (LSD/XYZ):** Balances creativity and rigor.
- **System vs. Meta Goal Distinction:** Enables external generation and self-modification.
- **Sandbox Preview & Self-Modification:** Safety mechanism for applying meta-updates via page reload and state preservation.
- **Dynamic Tool Creation & Use:** Extensible agent capabilities via sandboxed Web Workers (using `postMessage` for data access).
- **Multi-Mode HITL:** Flexible human oversight (prompt, options, code editing).
- **State Management:** Handles loading, saving, import/export (metadata only), versioning, validation.
- **UI:** Collapsible sections, timeline viewer (non-emoji icons), artifact display, configuration panel, target preview, cycle diagram. Includes basic accessibility features.
- **API Client:** Gemini API streaming, function calling, robust JSON sanitization, intelligent retries.
- **Context Summarization:** Manages LLM context window limits.
- **Storage Quota Awareness:** Basic checks and warnings for localStorage usage.
- **Refactored Logic:** Improved modularity in `CycleLogic`.

## Technical Stack

- **Core:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **LLM:** Google Gemini API (via streaming endpoint)
- **Sandboxing:** Web Workers API
- **Persistence:** Browser `localStorage` API (primary), `sessionStorage` API (for self-mod reloads)

## Limitations & Notes

- **Experimental:** This is a conceptual demonstration and may contain bugs or behave unexpectedly. Use at your own risk.
- **State Export/Import:** **Crucially, Export/Import functionality only handles the application state object (metrics, config, logs, artifact _metadata_). It does NOT include the actual artifact content stored in `localStorage`.** It cannot be used for full backup/restore or transferring a project between browsers/machines. Artifact content must exist independently in the target `localStorage`.
- **`localStorage` Limits:** Browsers typically limit `localStorage` to 5-10MB per origin. While basic usage warnings exist, very long runs or extremely large artifacts could exceed quota, potentially causing `Storage.setArtifactContent` or `Storage.saveState` to fail. Use "Clear Storage" or manage context/artifacts carefully.
- **Self-Modification Risks:** Modifying core JS or HTML is inherently risky. While the sandbox provides a preview, errors in the generated code could break the application upon reload, potentially requiring manual `localStorage` clearing to recover. The state preservation via `sessionStorage` during reload might fail if core logic changes significantly.
- **Tool Sandboxing:** Web Workers provide isolation but aren't a foolproof security guarantee against all potential issues in complex worker code. Worker access to `localStorage` is limited and indirect via `postMessage`.
- **Error Handling:** While improved, complex or chained failures might still require manual intervention or state clearing.
- **Prompt Sensitivity:** LLM behavior is highly sensitive to the system prompts and user goals.
- **API Costs:** No internal tracking of Gemini API usage costs. Monitor your usage via Google Cloud Console.
