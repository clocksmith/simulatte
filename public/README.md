# DTF (Design Tool Factory) Tool Fabricating DTF ⛮

DTF Tool Factory embodies a generative and iterative process for creating web-based tools: Design Radiates Elegant And Modular Elements RECOMBINED Recursive Element Creator Optimized Meticulously By Infinite Network Evolution. It is a browser-based application leveraging Large Language Models (LLMs), specifically the Gemini API, to dynamically create, manage, preview, and execute JavaScript tools and their corresponding Web Components based on user descriptions.

## Core Capabilities ★

### LLM Tool & WC Generation

Users describe desired functionality; the system prompts the LLM to generate an MCP definition (mcp), the core JS logic (impl), and a Web Component (wc) for the UI.

## Human-in-the-Loop (HITL) Modes

    Manual Approval: Generate multiple versions (configurable) of a tool/WC pair for user review and selection before saving.

    Continuous Generation: Automatically generate and save tools/WCs for a configured number of iterations before pausing.

    Pending Review: A dedicated UI section displays newly generated items awaiting manual approval.

    Web Component Preview: Dynamically load and render generated Web Components in a preview area for immediate visual feedback.

    Tool Library: Approved tools are stored in localStorage and displayed in a searchable, sortable library.

    Code Inspection: Allows viewing the generated MCP JSON, JS implementation, and Web Component source code.

    In-Browser Execution: Runs the core JS logic (impl) of approved tools with user-provided arguments via dynamically generated forms within a sandboxed environment.

    Iteration: Facilitates refinement by allowing users to edit the original request and regenerate tools/WCs.

    State Management: Manages API keys and generation mode settings via sessionStorage and persists the tool library state via localStorage, with export/import functionality.

## Architecture Overview ⛫

The application utilizes a modular vanilla JavaScript structure, configured via config.js. The boot.js script acts as the entry point, importing the configuration and initializing core modules.

User interactions are handled by ui_manager.js, which dynamically renders the interface (from ui_body.html), including the tool_card.wc.js Web Component for displaying tools (both pending and approved). It manages UI state for HITL modes, pending reviews, and WC previews, listening for user actions like searching, sorting, generating, approving, rejecting, or executing tools.

The core generation process is managed by cycle_logic.js. It takes the user's request, constructs a detailed prompt using a template (prompt.txt), and interacts with the Gemini API via api_client.js. The response (containing mcp, impl, wc) is processed and validated. Generated items are initially added to a pending state managed by state_manager.js. Based on the selected mode (manual/continuous) and user actions (approval/rejection), cycle_logic.js coordinates with state_manager.js to either discard pending items or save the approved tool's mcp/impl to the state and store the mcp, impl, and wc code as artifacts using storage.js.

Web Component previews are handled by ui_manager.js, which retrieves the WC code string from storage or the pending state, dynamically injects it using a script tag, and instantiates the custom element in the preview area. Core JS logic execution requests (impl) are passed to tool_runner.js, which executes the code within a controlled environment.
Examples & Use Cases ☞

## DTF supports various workflows

### Simple Calculation Tool (JS Logic Only):

    User Request: "Make a tool calcVat that takes netAmount and vatRate numbers and returns the grossAmount."

    LLM Generates: mcp, impl (similar to previous version), and a basic wc (which might just show inputs and a text output for the result).

    Execution: The tool-card allows running the impl logic directly via the "Run Logic" button.

### Design Tool & Web Component (Color Picker):

    User Request: "Create a simple hex color picker component. It should have a text input for a hex code (e.g., #FF0000), and display a square preview div next to it filled with that color. No complex color wheel needed."

    LLM Generates:

        mcp: Defines hexColor (string) as input.

        impl: A simple function run({ hexColor }) that might validate the hex code and return it, possibly with success status. { success: true, data: { validHex: '#ff0000' } }

        wc: A string containing a Web Component class (<hex-color-picker-xxxx>). Its shadow DOM would contain an <input type="text">, a <div> for the preview, and CSS. Its JS would listen to input changes, update the preview div's backgroundColor, and potentially use the impl function for validation if needed.

    Preview: Clicking "Show WC" on the tool card dynamically loads the WC definition. An instance appears in the preview area, showing the text input and the color swatch, allowing interaction.

    Execution: Clicking "Run Logic" would execute the simple impl function.

### Data Structuring Tool (JS Logic):

    User Request: "Generate a tool parseCsvLine that takes csvLine (string) and headers (array), returning an object mapping headers to values."

    LLM Generates: mcp, impl for CSV parsing, and a basic wc to input the line/headers and display the resulting JSON object.

    Execution: Use "Run Logic" on the card for direct data transformation.

These examples illustrate how DTF now generates not just the core logic but also a corresponding Web Component UI, allowing for immediate visual testing and iteration within the browser, guided by HITL controls.
