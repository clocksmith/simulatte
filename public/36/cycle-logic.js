const CycleLogicModule = (
  config,
  logger,
  Utils,
  storage,
  StateManager,
  ApiClient,
  MCPConverter,
  ToolRunner
) => {
  if (
    !config ||
    !logger ||
    !Utils ||
    !storage ||
    !StateManager ||
    !ApiClient ||
    !MCPConverter ||
    !ToolRunner
  ) {
    logger?.logEvent("error", "CycleLogic requires all core modules.");
    return null;
  }

  let _isRunning = false;
  let isLogicInitialized = false;
  let _currentPromptArtifactId = config.defaultPromptArtifactId;

  const init = () => {
    if (isLogicInitialized) {
      logger.logEvent("warn", "CycleLogic init called multiple times.");
      return;
    }
    logger.logEvent("info", "Initializing CycleLogic...");
    isLogicInitialized = true;
    logger.logEvent("info", "CycleLogic initialized.");
  };

  const isRunning = () => _isRunning;

  const _assembleGeneratorPrompt = (toolRequest) => {
    const promptTemplate = ```
You are an expert tool designer and JavaScript developer. Your task is to create BOTH a valid MCP (Model Context Protocol) tool definition JSON object AND a functional JavaScript implementation string based on the user's request.

User Request:
"${toolRequest}"

Instructions:
1.  **Design the MCP Tool Definition:**
    *   Create a JSON object representing the tool according to MCP schema standards (focus on 'name', 'description', 'inputSchema' with properties, types, descriptions, and required fields).
    *   The tool name should be descriptive, use camelCase or snake_case.
    *   Ensure inputSchema types are standard JSON types ('string', 'number', 'integer', 'boolean', 'array', 'object'). Provide clear descriptions for each parameter.
2.  **Implement the JavaScript Function:**
    *   Write a JavaScript string containing an 'async function run(args)' that takes a single argument 'args' (matching the 'properties' defined in your MCP inputSchema).
    *   The function should perform the requested action and return the result.
    *   Use standard JavaScript (ES6+). You have access to a restricted 'console' object for logging (console.log, console.warn, console.error). Do NOT attempt to access 'window', 'document', or make external network calls directly unless the tool's explicit purpose is to wrap an API call (which is advanced). Keep implementations self-contained if possible.
    *   Handle potential errors gracefully within the function (e.g., using try/catch) and return meaningful error information if necessary.
3.  **Output Format:** Respond ONLY with a single JSON object containing two keys:
    *   \`mcpDefinition\`: The JSON object for the MCP tool definition.
    *   \`jsImplementation\`: The JavaScript code string for the 'async function run(args)'.

Example MCP Definition Structure:
{
  "name": "exampleToolName",
  "description": "A clear description of what the tool does.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param1": { "type": "string", "description": "Description of param1." },
      "param2": { "type": "number", "description": "Description of param2." }
    },
    "required": ["param1"]
  }
}

Example JS Implementation Structure (String):
"async function run(args) {\\n  const { param1, param2 } = args;\\n  console.log('Executing tool with:', args);\\n  try {\\n    const result = param1.toUpperCase() + (param2 || 0);\\n    return { success: true, data: result };\\n  } catch (error) {\\n    console.error('Tool execution failed:', error);\\n    return { success: false, error: error.message };\\n  }\\n}"

Ensure the generated JSON is valid and the JavaScript string is correctly escaped if necessary within the final JSON output.
        ```;
    logger.logEvent(
      "debug",
      "Assembled tool generator prompt for request:",
      toolRequest
    );
    return promptTemplate;
  };

  const generateTool = async (
    toolRequest,
    progressCallback = (type, data) => {}
  ) => {
    if (_isRunning) {
      logger.logEvent(
        "warn",
        "Tool generation request ignored: Already running."
      );
      progressCallback("error", {
        message: "Tool generation already in progress.",
      });
      return null;
    }
    if (
      !toolRequest ||
      typeof toolRequest !== "string" ||
      toolRequest.trim().length === 0
    ) {
      logger.logEvent("error", "Invalid tool request provided.");
      progressCallback("error", { message: "Tool request cannot be empty." });
      return null;
    }

    const state = StateManager.getState();
    if (!state) {
      logger.logEvent("error", "Cannot generate tool: StateManager not ready.");
      progressCallback("error", { message: "System state not available." });
      return null;
    }
    if (!state.apiKey) {
      logger.logEvent("error", "Cannot generate tool: API Key not set.");
      progressCallback("error", { message: "API Key is required." });
      return null;
    }

    _isRunning = true;
    StateManager.incrementCycle();
    progressCallback("status", {
      message: "Starting tool generation cycle...",
      active: true,
    });
    let generatedToolData = null;

    try {
      const prompt = _assembleGeneratorPrompt(toolRequest);
      const modelName = config.defaultModel;
      const apiKey = state.apiKey;

      StateManager.incrementApiCall();
      const apiResult = await ApiClient.callApiWithRetry(
        prompt,
        modelName,
        apiKey,
        [],
        { temperature: 0.3 },
        progressCallback
      );
      StateManager.setLastError(null);

      if (apiResult.type !== "text" || !apiResult.data) {
        throw new Error(
          `API did not return expected text content. Type: ${apiResult.type}, FinishReason: ${apiResult.finishReason}`
        );
      }

      progressCallback("status", {
        message: "Parsing LLM response...",
        active: true,
      });
      const rawJsonResponse = apiResult.data;
      const sanitizedJson = ApiClient.sanitizeLlmJsonResponse(rawJsonResponse);

      if (!sanitizedJson) {
        logger.logEvent(
          "error",
          "Failed to sanitize or extract valid JSON from LLM response.",
          { rawResponse: rawJsonResponse }
        );
        throw new Error(
          "LLM response did not contain valid JSON after sanitization."
        );
      }

      const parsedResponse = JSON.parse(sanitizedJson);

      if (
        !parsedResponse.mcpDefinition ||
        typeof parsedResponse.mcpDefinition !== "object" ||
        !parsedResponse.mcpDefinition.name
      ) {
        throw new Error(
          "LLM response JSON is missing a valid 'mcpDefinition' object with a 'name'."
        );
      }
      if (
        !parsedResponse.jsImplementation ||
        typeof parsedResponse.jsImplementation !== "string"
      ) {
        throw new Error(
          "LLM response JSON is missing a valid 'jsImplementation' string."
        );
      }

      const mcpDef = parsedResponse.mcpDefinition;
      const jsImpl = parsedResponse.jsImplementation;
      const toolId = `${mcpDef.name}-${Utils.generateUUID().substring(0, 8)}`;

      logger.logEvent(
        "info",
        `Successfully generated tool definition and implementation for: ${mcpDef.name} (ID: ${toolId})`
      );
      progressCallback("status", {
        message: `Generated ${mcpDef.name}. Saving...`,
        active: true,
      });

      try {
        const mcpJsonString = JSON.stringify(mcpDef, null, 2);
        storage.setArtifactContent(toolId, "mcp.json", mcpJsonString);
        logger.logEvent(
          "debug",
          `Saved MCP definition artifact: ${storage.getArtifactKey(
            toolId,
            "mcp.json"
          )}`
        );
      } catch (e) {
        logger.logEvent(
          "error",
          `Failed to save MCP definition artifact for ${toolId}`,
          e
        );

        StateManager.incrementErrorCount();
        StateManager.setLastError(`Failed to save MCP artifact: ${e.message}`);
      }

      try {
        storage.setArtifactContent(toolId, "impl.js", jsImpl);
        logger.logEvent(
          "debug",
          `Saved JS implementation artifact: ${storage.getArtifactKey(
            toolId,
            "impl.js"
          )}`
        );
      } catch (e) {
        logger.logEvent(
          "error",
          `Failed to save JS implementation artifact for ${toolId}`,
          e
        );

        StateManager.incrementErrorCount();
        StateManager.setLastError(`Failed to save JS artifact: ${e.message}`);
      }

      StateManager.addTool(toolId, mcpDef, jsImpl, {
        sourceRequest: toolRequest,
      });

      generatedToolData = StateManager.getTool(toolId);

      progressCallback("status", {
        message: "Tool generation complete.",
        active: false,
      });
      progressCallback("success", { tool: generatedToolData });
    } catch (error) {
      logger.logEvent("error", "Tool generation cycle failed.", error);
      StateManager.incrementErrorCount();
      StateManager.setLastError(error.message);
      progressCallback("status", {
        message: `Error: ${error.message}`,
        active: false,
        isError: true,
      });
      progressCallback("error", { message: error.message });
      generatedToolData = null;
    } finally {
      _isRunning = false;

      progressCallback("final", {});
    }
    return generatedToolData;
  };

  const abortGeneration = () => {
    if (_isRunning) {
      logger.logEvent("info", "Attempting to abort tool generation.");
      ApiClient.abortCurrentCall("User abort request");
      _isRunning = false;
    } else {
      logger.logEvent("info", "Abort request ignored: No generation running.");
    }
  };

  return {
    init,
    isRunning,
    generateTool,
    abortGeneration,
  };
};

export default CycleLogicModule;
