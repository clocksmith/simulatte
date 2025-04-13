# REPLOID (Reflective Embodiment Providing Logical Oversight for Intelligent DREAMER (Deep Recursive Exploration Around Multimodal Embodying REPLOID)) v0.0.0

**REPLOID** is an experimental, self-contained HTML/CSS/JS application demonstrating a conceptual framework for LLM-driven iterative design, development, dynamic tool creation, and potential self-improvement. It operates entirely within the browser, leveraging the Google Gemini API and the browser's `localStorage` for persistent, versioned artifact storage. This project explores the possibilities and challenges of creating agents that can not only generate content or code but also reflect on their own structure and potentially modify themselves to better achieve goals, all within the constraints of a standard web browser environment.

The core idea is to treat every component – UI structure (HTML), styling (CSS), core logic (JS), system prompts, diagrams, dynamically generated tools, context summaries – as versioned **artifacts**. The agent, embodied by the persona 'x0' with its dual LSD/XYZ nature, analyzes goals, reads relevant artifacts from the current cycle's state in `localStorage`, proposes changes or new artifacts, and upon successful critique (or skipping critique), saves these outputs associated with the _next_ cycle number back into `localStorage`. This creates a traceable, iterative development history stored directly in the browser, offering a unique approach to agent state management.

## Core Concepts Explained

- **Artifact-Based System:** The fundamental unit of work and state is the **artifact**. This represents any distinct piece of code, data, or text managed by the system (e.g., `reploid.core.style`, `target.script.main`, `reploid.core.sys-prompt`, `meta.summary_context`). Treating everything as an artifact allows for uniform handling, versioning, and potential manipulation by the agent itself.
- **LocalStorage Persistence & Versioning:** All artifacts are stored directly in the browser's `localStorage`, enabling persistence across sessions without a backend. Artifacts are versioned by cycle number; modifications in cycle `N` are saved for cycle `N+1` (e.g., key `_x0_target.body_5`). This creates a verifiable "digital paper trail" of the agent's work.
- **Cycle-Based Operation:** The application operates in discrete cycles. Each cycle represents a 'sense-think-act' loop: define/refine goal, analyze state/artifacts, propose changes, generate/modify artifacts (potentially using tools), undergo critique/review, and apply changes for the next cycle.
- **Dual Persona (x0):** The agent possesses two personalities: LSD-1729 (intuitive, pattern-seeking, optimistic) and XYZ-2048 (logical, rigorous, skeptical). This internal duality, configurable via a balance setting, aims to foster both creative exploration and grounded implementation within the agent's reasoning process. Deliberations between these personas are often logged.
- **Goal-Driven (System vs. Meta):** The agent works towards user-defined goals. **System Goals** focus on generating or modifying external targets (like a separate webpage or application components, represented by `target.*` artifacts). **Meta Goals** focus on modifying REPLOID itself (its UI, logic, prompts, tools, represented by `reploid.*` artifacts). This meta-capability is key to exploring self-improvement.
- **Self-Modification & Sandboxing:** When pursuing Meta goals, the agent can propose modifications to its own core files. Significant changes, especially to JavaScript or the overall HTML structure, often result in the generation of a `full_html_source` artifact. This triggers a **sandbox preview** where the user can inspect the proposed new version of the entire application in an iframe before approving. Approval initiates a state-preserving reload into the modified version.
- **Tool Use & Creation:** The agent can leverage pre-defined **static tools** (like linters, validators) and dynamically **create new tools** by defining their function signature (in JSON format) and generating the corresponding JavaScript implementation. These dynamic tools are executed within Web Workers for basic sandboxing.

## Architectural Overview

REPLOID follows a modular structure primarily orchestrated within `core_reploid_script.js`:

1.  **Bootstrap (`index.html`, `boot-script`):** Handles initial page load, checks for existing state, runs the "Genesis" process (fetching and saving initial Cycle 0 artifacts to `localStorage` if needed), loads core dependencies, and hands off control to the main application script.
2.  **Core Dependencies (`core_utils_script.js`, `core_storage_script.js`):** Provide essential functions for logging, DOM manipulation, string utilities (`Utils`) and interaction with `localStorage`/`sessionStorage` (`Storage`). These are loaded first by the main script.
3.  **`StateManager`:** Manages the main application state object (configuration, metrics, logs, artifact metadata, goals, history). Handles loading, saving, importing/exporting state, and tracking artifact metadata.
4.  **`UI`:** Responsible for rendering all visual components, updating displays (metrics, timeline, cycle details, previews), handling user interactions (button clicks, input changes), managing collapsible sections, and displaying notifications.
5.  **`ApiClient`:** Handles communication with the Google Gemini API, including request formatting, response parsing (especially sanitizing JSON), retry logic, streaming, and tool/function calling integration.
6.  **`CycleLogic`:** Orchestrates the main execution loop. It interprets goals, prepares prompts, calls the `ApiClient`, processes the LLM response, manages critique triggers (auto/human), applies changes via `StateManager` and `Storage`, handles HITL workflows, and initiates sandbox previews or context summarization.
7.  **`ToolRunner`:** Executes both static and dynamic tools. Dynamic tools are run inside sandboxed Web Workers using the implementation code stored as an artifact. Static tools access artifacts via `Storage` based on passed IDs.

## How to Use:

1.  **API Key:** Obtain a Google Gemini API key. This is **required** for the LLM interactions.
    - **Option A (Recommended):** Place your key in a `config.js` file (see previous README example). This avoids exposing the key in `localStorage` or browser history.
    - **Option B:** Paste your API key directly into the "API Key" field in the UI's "Controls" section.
2.  **Open `index.html`:** Load the file in a modern web browser (Chrome, Edge, Firefox recommended). The bootstrap process will initialize artifacts in `localStorage` if it's the first run or if storage was cleared. Interact with the start prompt (Enter/Click/Tap or Esc/Tap & Hold).
3.  **Configure (Optional):** Expand the "Configuration" fieldset (click the legend `[+/-]`) and adjust settings like persona balance, critique probabilities, cycle limits, etc. Collapsed fieldsets show summaries.
4.  **Set ONE Goal:** Define a single objective for the _next_ cycle in the "Goal Input" textarea.
    - **System Goal:** Describe a task for an external application (e.g., "Create a simple calculator UI with buttons for 0-9, +, -, =, C"). Expect `target.*` artifacts.
    - **Meta Goal:** Describe a change to REPLOID itself (e.g., "Add a button to clear the timeline log" or "Improve the styling of the metrics display"). Expect `reploid.*` artifacts or `full_html_source`.
    - _Cumulative Context:_ The first goal is the "Seed Goal". Subsequent goals refine the cumulative context sent to the LLM.
5.  **Run Cycle:** Click the "Run Cycle" button. Click again to "Abort Cycle" if needed.
6.  **Observe:** Monitor the UI:
    - **Current Cycle Details:** Shows inputs, LLM deliberations, proposed changes, applied artifacts (with type, ID, source, mod indicator `*`), and the diagram. Includes a streaming output area for LLM responses.
    - **Iteration Timeline:** Provides fine-grained logs of LLM calls, tool usage, decisions, errors, and state changes.
    - **Status Indicator:** Shows the current agent activity (Idle, Calling API, Applying Changes, Paused, etc.). Includes API progress/token counts.
    - **External UI Preview:** Renders the current state of the `target.*` artifacts.
    - **Metrics:** Track cycle counts, confidence, token usage, etc.
7.  **Critique/Pause/Sandbox:** The cycle might pause for several reasons:
    - **Auto-Critique:** May run based on probability, potentially flagging issues. Results appear in cycle details/timeline. If it fails, it usually forces human review.
    - **Human Intervention (HITL):** Pauses due to low confidence, time limits, random checks, or manual forcing. Use the dedicated "Human Intervention" section to provide feedback, select options, or directly edit artifact code (validation occurs via `code_edit` tool).
    - **Sandbox Preview:** Appears if a `full_html_source` meta-update is generated. Inspect the preview carefully. Approval reloads the page with the new code, preserving state via `sessionStorage`. Discarding continues the cycle with feedback.
8.  **Self-Modification:** Approved sandbox changes take effect on reload. The "Go Back" button uses `sessionStorage` to revert the _page HTML_ to a previous state (if available in history) while attempting to restore the corresponding application state.
9.  **State Management:**
    - **Export/Import State:** Saves/loads the main application state (metrics, logs, config, artifact _metadata_, history). **Crucially, this does _not_ include the actual artifact content stored in `localStorage`.** Use for transferring configuration or analysis, not full backup.
    - **Reset Context:** Triggers the LLM to summarize the current state, replacing the potentially long cumulative goal context with a concise summary artifact (`meta.summary_context`). Helps manage token limits.
    - **Clear Storage:** **WARNING:** Deletes _all_ REPLOID data (`_x0_*` artifacts and state) from `localStorage`. Use with extreme caution! Can be triggered via button or Esc/Tap & Hold on startup.

## Key Features (v0.0.0):

- **LocalStorage Persistence:** Enables serverless operation and state persistence by storing all versioned artifacts locally.
- **Cumulative Goal Context:** Allows the agent to tackle more complex tasks over multiple iterations by building upon previous instructions.
- **Artifact Metadata Tracking:** Provides a structured way to manage and retrieve the latest versions of system components.
- **Collapsible UI Sections w/ Summaries:** Improves UI manageability for complex states.
- **Enhanced Artifact Display:** Clear indicators (`[JS]`, `[CSS]`, `*`, source) improve traceability within a cycle's operations.
- **Cycle Flow Diagram Visualization:** Offers insight into the agent's decision-making process.
- **Client-Side Tool Sandbox (Web Workers):** Enhances safety by isolating dynamically generated tool code execution.
- **Automatic Context Summarization:** Helps manage LLM context window limitations.
- **REPLOID/DREAMER Persona (LSD/XYZ):** Explores balancing creativity and rigor in LLM reasoning.
- **Unified Cycle Detail View:** Consolidates inputs, intermediates, and outputs for analysis.
- **Detailed Timeline Logging:** Crucial for debugging and understanding agent behavior.
- **Integrated Tool Creation & Execution:** Allows the agent to extend its capabilities dynamically (using MCP-like definitions).
- **Sandbox Preview & Auto Self-Mod:** Provides a safety mechanism for applying meta-updates.
- **Multi-Mode HITL:** Offers flexible human oversight (prompt feedback, option selection, direct code editing via tool).
- **Genesis State Display:** Shows the initial state loaded from Cycle 0 artifacts.
- **Error Retry & Context Warnings:** Basic resilience features.
- **Gemini Streaming API Integration:** Provides real-time feedback during LLM generation.
- **Responsive UI:** Adapts layout for different screen sizes.
- **Startup Options:** Allows continuing session or forcing a reset.

## Technical Stack

- **Core:** Vanilla JavaScript (ES6+), HTML5, CSS3 (using CSS Variables extensively)
- **LLM:** Google Gemini API (specifically targeting Flash/Pro models via streaming endpoint)
- **Sandboxing:** Web Workers API
- **Persistence:** Browser `localStorage` API (primary), `sessionStorage` API (for self-mod reloads)

## Limitations & Notes:

- **Experimental:** This is a conceptual demonstration and may contain bugs or behave unexpectedly.
- **State Export/Import Incomplete:** Does **not** include artifact content. Full backup/transfer requires manual `localStorage` handling.
- **`localStorage` Limits:** Browsers typically limit `localStorage` to 5-10MB per origin. Very long runs or extremely large artifacts could exceed quota or cause performance issues. Use "Clear Storage" or manage artifacts carefully. Context summarization helps mitigate this.
- **Diagram Rendering:** Functional but basic SVG implementation.
- **Tool Sandboxing:** Web Workers provide isolation but aren't a foolproof security guarantee against all potential issues in complex worker code. Worker access to external data (like `Storage`) is limited/shimmed.
- **Error Handling:** Basic retry logic exists, but complex failures might require manual intervention or state clearing. API Abort functionality is available.
- **Prompt Sensitivity:** LLM behavior can be sensitive to the wording and structure of the core prompts and user goals.
- **API Costs:** No internal tracking of Gemini API usage costs. Monitor your usage via Google Cloud Console.

## NOTES

**Remaining Development & Testing:**

- **TODO:** **Artifact Relevance Logic:** Improve how the agent determines which artifacts (beyond recent `target.*`/`reploid.*`) are relevant to the current goal, possibly using more sophisticated filtering or dedicated analysis steps.
- **TODO:** **Tool Execution & Testing:**
  - Thoroughly test `ToolRunner` execution for all static tools, ensuring correct artifact content fetching via `artifactId`.
  - Test dynamic tool execution via Web Workers, including the provided `LS_shim` and `StateManager_shim`.
  - Test the `convert_to_gemini_fc` tool with various MCP-style inputs.
  - Test the `code_edit` tool logic and its integration within the HITL flow.
- **TODO:** **HITL Testing:** Thoroughly test all modes of Human-In-The-Loop interaction (Options, Prompt, Code Edit) under various scenarios (e.g., after critique failure, random trigger, low confidence).
- **TODO:** **Configuration Verification:** Systematically verify that _all_ configuration parameters set in the UI (`genesis-config` section) are correctly read from `globalState.cfg` and applied as intended within `CycleLogic` and other relevant modules (e.g., critique probability, cycle limits, confidence thresholds, history limits, model selection).
- **TODO:** **Streaming Robustness:** Test Gemini API streaming edge cases (e.g., connection interruptions, very long responses, handling of streamed function calls vs. text).
- **TODO:** **Responsiveness Testing:** Test the UI layout and styling across a range of browser window sizes and devices to ensure adaptability.
- **TODO:** **Error Handling & Recovery:** Improve handling of unexpected errors during API calls, tool execution, or state management. Consider more robust recovery mechanisms beyond basic retries.
- **TODO:** **Long-Term Stability:** Test the application over extended runs (many cycles) to check for memory leaks, `localStorage` quota issues, or performance degradation.
