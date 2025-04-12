const ToolRunner = {
  // Receives logger, staticTools list, and dynamicTools list via runTool
  runTool: async (
    toolName,
    toolArgs,
    injectedStaticTools,
    injectedDynamicTools
  ) => {
    logger.logEvent("info", `Run tool: ${toolName}`);
    const staticTool = injectedStaticTools.find((t) => t.name === toolName);
    if (staticTool) {
      switch (toolName) {
        case "code_linter":
          const code = toolArgs.code || "";
          let hasError = false;
          // Basic checks (these are simplistic examples)
          if (
            toolArgs.language === "html" &&
            code.includes("<script") &&
            !code.includes("</script>")
          )
            hasError = true;
          if (
            toolArgs.language === "json" ||
            toolArgs.language === "javascript"
          ) {
            if (
              (code.match(/{/g) || []).length !==
              (code.match(/}/g) || []).length
            )
              hasError = true;
            if (
              (code.match(/\(/g) || []).length !==
              (code.match(/\)/g) || []).length
            )
              hasError = true;
          }
          // Add more robust linting if needed (e.g., using a library via Worker)
          return {
            result: `Basic lint ${hasError ? "failed" : "passed"} for ${
              toolArgs.language
            }.`,
            linting_passed: !hasError,
          };
        case "json_validator":
          // ... (implementation as before)
          try {
            JSON.parse(toolArgs.json_string);
            return { result: "JSON structure is valid.", valid: true };
          } catch (e) {
            return { result: `JSON invalid: ${e.message}`, valid: false };
          }
        case "diagram_schema_validator":
          // ... (implementation as before)
          const d = toolArgs.diagram_json;
          if (
            !d ||
            typeof d !== "object" ||
            !Array.isArray(d.nodes) ||
            !Array.isArray(d.connections)
          ) {
            // Assuming 'nodes' and 'connections' based on previous context
            return {
              result:
                "Diagram JSON schema invalid (missing nodes/connections array).",
              schema_valid: false,
            };
          }
          if (d.nodes.some((c) => !c.id || !c.label || !c.type)) {
            // Example validation
            return {
              result:
                "Diagram JSON schema invalid (node missing id/label/type).",
              schema_valid: false,
            };
          }
          // Add more checks as needed
          return {
            result: "Diagram JSON schema appears valid.",
            schema_valid: true,
          };
        case "svg_diagram_renderer":
          // ** DECOUPLING NOTE: **
          // The original version called UI.renderCycleSVGToMarkup, creating tight coupling.
          // A truly decoupled tool would need the SVG generation logic extracted
          // into a standalone function that doesn't rely on UI state or DOM elements.
          // For now, returning a placeholder or error.
          logger.logEvent(
            "warn",
            "svg_diagram_renderer tool called - returning placeholder due to decoupling."
          );
          return {
            // svgMarkup: "<svg><text fill='orange'>SVG Rendering Placeholder (Tool Decoupled)</text></svg>",
            error:
              "SVG rendering tool is currently decoupled and cannot generate markup.",
          };
        // To fix, you'd need:
        // 1. Extract the SVG rendering logic from UI into a pure function (e.g., in Utils).
        // 2. Call that pure function here:
        // try {
        //    const svgMarkup = Utils.generateDiagramSvgMarkup(toolArgs.diagram_json); // Assuming it exists
        //    return { svgMarkup: svgMarkup };
        // } catch (e) {
        //    logger.logEvent("error", `SVG rendering tool failed: ${e.message}`);
        //    return { error: `Failed to render SVG: ${e.message}` };
        // }
        case "token_counter":
          // ... (implementation as before)
          return {
            token_estimate: Math.floor((toolArgs.text || "").length / 4),
          };
        case "self_correction":
          // ... (implementation as before)
          logger.logEvent(
            "warn",
            "Self-correction tool called (triggering retry logic)."
          );
          // This tool might signal CycleLogic rather than returning data
          return {
            result:
              "Self-correction acknowledged. Cycle will attempt retry if applicable.",
            signal_retry: true,
          };
        default:
          throw new Error(`Unknown static tool: ${toolName}`);
      }
    }

    // Dynamic Tool Execution (remains mostly the same, uses injected list)
    const dynamicTool = injectedDynamicTools.find(
      (t) => t.declaration.name === toolName
    );
    if (dynamicTool) {
      if (!dynamicTool.implementation) {
        throw new Error(
          `Dynamic tool '${toolName}' has no implementation defined in state.`
        );
      }
      logger.logEvent(
        "info",
        `Executing dynamic tool '${toolName}' in Web Worker sandbox.`
      );

      return new Promise((resolve, reject) => {
        // Web Worker code remains the same
        const workerCode = `
                  self.onmessage = async (event) => {
                      const { toolCode, toolArgs } = event.data;
                      try {
                          // Use AsyncFunction constructor carefully
                          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                          const func = new AsyncFunction('params', toolCode); // 'params' is the argument name inside the code
                          const result = await func(toolArgs);
                          self.postMessage({ success: true, result: result });
                      } catch (e) {
                          self.postMessage({ success: false, error: e.message });
                      } finally {
                          self.close(); // Close worker after execution
                      }
                  };
              `;
        let worker = null;
        let timeoutId = null;
        let workerUrl = null;

        try {
          const blob = new Blob([workerCode], {
            type: "application/javascript",
          });
          workerUrl = URL.createObjectURL(blob);
          worker = new Worker(workerUrl);

          timeoutId = setTimeout(() => {
            logger.logEvent(
              "error",
              `Dynamic tool '${toolName}' timed out after 10 seconds.`
            );
            if (worker) worker.terminate();
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            reject(
              new Error(`Dynamic tool '${toolName}' execution timed out.`)
            );
          }, 10000); // 10 second timeout

          worker.onmessage = (event) => {
            clearTimeout(timeoutId);
            if (event.data.success) {
              logger.logEvent(
                "info",
                `Dynamic tool '${toolName}' execution succeeded.`
              );
              resolve({ result: event.data.result, success: true });
            } else {
              logger.logEvent(
                "error",
                `Dynamic tool '${toolName}' execution failed in worker: ${event.data.error}`
              );
              // Don't reject with the raw error, wrap it
              reject(
                new Error(
                  `Dynamic tool '${toolName}' failed: ${event.data.error}`
                )
              );
            }
            // Worker closes itself now
            // if (worker) worker.terminate();
            if (workerUrl) URL.revokeObjectURL(workerUrl);
          };

          worker.onerror = (error) => {
            clearTimeout(timeoutId);
            logger.logEvent(
              "error",
              `Web Worker error for tool '${toolName}': ${error.message}`
            );
            reject(
              new Error(
                `Worker error for dynamic tool '${toolName}': ${error.message}`
              )
            );
            // Worker closes itself now
            // if (worker) worker.terminate();
            if (workerUrl) URL.revokeObjectURL(workerUrl);
          };

          worker.postMessage({
            toolCode: dynamicTool.implementation,
            toolArgs: toolArgs,
          });
        } catch (e) {
          clearTimeout(timeoutId); // Clear timeout if setup fails
          logger.logEvent(
            "error",
            `Error setting up worker for '${toolName}': ${e.message}`
          );
          if (worker) worker.terminate();
          if (workerUrl) URL.revokeObjectURL(workerUrl);
          reject(
            new Error(
              `Failed to initialize worker for tool '${toolName}': ${e.message}`
            )
          );
        }
      });
    }

    throw new Error(`Tool not found: ${toolName}`);
  },
};
