# REPLOID (Reflective Embodiment Providing Logical Oversight for Intelligent DREAMER) v0.0.0

This is a self-contained HTML/CSS/JS application demonstrating a conceptual framework for LLM-driven iterative design, tool creation, and potential self-improvement. It leverages the Google Gemini API with function calling capabilities to:

- Analyze user-defined goals (external "System" or self-improvement "Meta").
- Deliberate between "LSD" (intuitive) and "XYZ" (logical) personas based on configurable percentage influence before acting.
- Generate artifacts like modular code (`head_html`, `body_html`, `style_css`, `script_js_array`), diagrams (JSON/SVG), new tool definitions/implementations, prompts, analysis text, or its _own complete source code_ (`full_html_source`), displayed within a unified cycle view.
- Execute defined tools (static or dynamic) on the client-side based on LLM requests.
- Trigger automated or human critique cycles based on confidence, time, probability, or cycle count settings.
- Offer multiple Human-in-the-Loop modes (selecting options, providing prompts, editing specific artifacts).
- Preview full source code changes in a sandbox before applying.
- Automatically handle self-modification via reload, preserving state and history.
- Manage state via export/import and summarization, including preserving the initial "Genesis" state (JSON and SVG).
- Attempt automatic retries for certain API errors.
- Warn when approaching context token limits.

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
2.  **Open:** Save the main code as `index.html` and open it in a modern web browser (Chrome, Edge, Firefox recommended).
3.  **Configure (Optional):** Adjust configuration settings like Persona Balance (LSD %), critique triggers, etc.
4.  **Set Goal:** Define **only ONE** goal per cycle:
    - **System Goal (External):**
      - **Purpose:** Design/generate code/UI for an application _separate_ from REPLOID. Can include deciding to create helper tools.
      - **Input:** Describe the desired system/component/task in the "System Goal" textarea.
      - **Expected Artifacts:** Within the "Current Cycle Details", expect modular `head_html`, `body_html`, `style_css`, `script_js_array` (list of script objects). If a tool is created: `proposed_new_tool_declaration` (JSON) and `generated_tool_implementation_js` (JS string). Also potentially `updated_diagram_json` or `updated_diagram_svg`.
      - **Display:** Artifacts shown in the "Current Cycle Details" section, UI preview in the bottom iframe.
    - **Meta Goal (Self-Improvement):**
      - **Purpose:** Modify REPLOID's own UI, features, or logic. Can include creating tools needed for the improvement.
      - **Input:** Describe the self-improvement in the "Meta Goal" textarea (e.g., "Improve layout", "Add config option").
      - **Expected Artifacts:** Within the "Current Cycle Details", expect _either_ modular `head_html`, `body_html`, `style_css` (for non-script changes) _OR_ a `full_html_source` string (required for script changes). If a tool is created as part of the improvement, its declaration (`proposed_new_tool_declaration`) and implementation (within the `full_html_source`'s script) are generated.
      - **Behavior:**
        - _Modular:_ Updates internal state, visible as artifacts in "Current Cycle Details".
        - _Full Source:_ Shows a **Sandbox Preview**. If approved, the engine preserves state, reloads with the new source, and restores state.
5.  **Run:** Click "Run Cycle".
6.  **Observe:** Monitor the "Current Cycle Details" section as it populates with artifacts (prompts, LLM responses, code, diagrams, etc.). Check the "Iteration Timeline" for a log of actions (API calls, tool runs, decisions) and the "Status Indicator".
7.  **Critique/Pause/Sandbox:**
    - **Auto-Critique:** Runs automatically based on probability if checks pass. Results shown in "Current Cycle Details" and timeline.
    - **Human Intervention:** May pause based on config (confidence, time, probability, cycle count) or manual force. Select interaction mode (Options, Prompt, Edit Code) when prompted in the dedicated HITL section.
    - **Sandbox:** If a full source meta-update is generated, inspect the preview in the sandbox iframe and click "Approve & Apply" or "Discard".
8.  **Self-Modification:** Full source changes are applied automatically _after_ sandbox approval. Use "Go Back" to revert to a previously saved full source version.
9.  **State Management:** Use "Export State", "Import State", or "Summarize" (for text summary/context saving) as needed. Note the context token warning.

## Key Features (v0.0.2):

- **REPLOID/DREAMER Persona:** With explicit LSD/XYZ deliberation based on percentage weights.
- **Unified Artifact Display:** Shows all inputs, intermediate results, and outputs for the current cycle in one place.
- **Enhanced Timeline:** Logs detailed steps including API calls, tool usage, decisions, critiques, and state changes.
- **Integrated Tool Creation:** Tools defined/implemented as part of System or Meta goals, shown as artifacts.
- **Client-Side Tool Execution:** Runs static/dynamic tools in the browser.
- **Sandbox Preview:** Safely preview full source meta-updates before applying.
- **Automated Self-Modification:** Handles approved full-source updates with state/history preservation.
- **Multi-Mode HITL:** Flexible human intervention options including direct artifact editing.
- **Genesis State Preservation:** Displays the initial state (JSON & SVG) for reference.
- **Error Retry:** Attempts to automatically retry certain network/API errors.
- **Context Awareness:** Warns when token count nears limits.
- **Status Indicator:** Provides real-time feedback on API/Tool activity.

## Limitations & Notes:

- Experimental tool. Expect potential quirks or errors.
- SVG rendering is basic.
- Modular meta-updates affect internal state but don't dynamically update the running DOM structure (only content within existing elements if targeted).
- Dynamic tool JS runs via `new Function()` – use caution.
- Error handling and retry logic are basic.
- API costs are not tracked.
- Timeline summarization is basic (only marks completed cycles, no expand/collapse yet).

```

```
