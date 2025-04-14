const ToolRunner = (() => {
  function mapMcpTypeToGemini(mcpType) {
    switch (mcpType?.toLowerCase()) {
      case "string":
        return "STRING";
      case "integer":
        return "INTEGER";
      case "number":
        return "NUMBER";
      case "boolean":
        return "BOOLEAN";
      case "array":
        return "ARRAY";
      case "object":
        return "OBJECT";
      default:
        return "TYPE_UNSPECIFIED";
    }
  }

  function convertMcpPropertiesToGemini(mcpProps) {
    if (!mcpProps) return {};
    const geminiProps = {};
    for (const key in mcpProps) {
      const mcpProp = mcpProps[key];
      geminiProps[key] = {
        type: mapMcpTypeToGemini(mcpProp.type),
        description: mcpProp.description || "",
      };
      if (mcpProp.enum) {
        geminiProps[key].enum = mcpProp.enum;
      }
      if (mcpProp.type === "array" && mcpProp.items) {
        geminiProps[key].items = {
          type: mapMcpTypeToGemini(mcpProp.items.type),
        };
      }
      if (mcpProp.type === "object" && mcpProp.properties) {
        geminiProps[key].properties = convertMcpPropertiesToGemini(
          mcpProp.properties
        );
        if (mcpProp.required) {
          geminiProps[key].required = mcpProp.required;
        }
      }
    }
    return geminiProps;
  }

  async function runToolInternal(
    toolName,
    toolArgs,
    injectedStaticTools,
    injectedDynamicTools
  ) {
    if (!window.LS || !window.StateManager) {
      throw new Error(
        "ToolRunner requires global LS (Storage) and StateManager."
      );
    }
    const logger = window.Utils?.logger || console;

    logger.logEvent("info", `Run tool: ${toolName}`);
    const staticTool = injectedStaticTools.find((t) => t.name === toolName);

    if (staticTool) {
      let artifactContent;
      let artifactMetaData;
      if (
        toolArgs &&
        toolArgs.artifactId &&
        typeof toolArgs.cycle === "number"
      ) {
        artifactContent = LS.getArtifactContent(
          toolArgs.artifactId,
          toolArgs.cycle
        );
        artifactMetaData = StateManager.getArtifactMetadata(
          toolArgs.artifactId
        ); // Assumes StateManager is global
        if (artifactContent === null) {
          throw new Error(
            `Artifact content not found for ${toolArgs.artifactId} cycle ${toolArgs.cycle}`
          );
        }
      }

      switch (toolName) {
        case "code_linter":
          const code = artifactContent;
          let hasError = false;
          try {
            if (toolArgs.language === "json") {
              JSON.parse(code);
            } else if (
              toolArgs.language === "html" &&
              code.includes("<script") &&
              !code.includes("</script>")
            ) {
              hasError = true;
            } else if (
              toolArgs.language === "javascript" &&
              ((code.match(/{/g) || []).length !==
                (code.match(/}/g) || []).length ||
                (code.match(/\(/g) || []).length !==
                  (code.match(/\)/g) || []).length)
            ) {
              hasError = true;
            }
            // Placeholder for more robust linting
          } catch (e) {
            hasError = true;
          }
          return {
            result: `Basic lint ${hasError ? "failed" : "passed"} for ${
              toolArgs.language
            }.`,
            linting_passed: !hasError,
          };

        case "json_validator":
          try {
            JSON.parse(artifactContent);
            return { result: "JSON structure is valid.", valid: true };
          } catch (e) {
            return { result: `JSON invalid: ${e.message}`, valid: false };
          }

        case "read_artifact":
          return {
            content: artifactContent,
            artifactId: toolArgs.artifactId,
            cycle: toolArgs.cycle,
          };

        case "list_artifacts":
          const allMeta = StateManager.getAllArtifactMetadata();
          let filtered = Object.values(allMeta);
          if (toolArgs.filterType) {
            filtered = filtered.filter(
              (meta) =>
                meta.type &&
                meta.type.toUpperCase() === toolArgs.filterType.toUpperCase()
            );
          }
          if (toolArgs.filterPattern) {
            try {
              const regex = new RegExp(toolArgs.filterPattern);
              filtered = filtered.filter((meta) => regex.test(meta.id));
            } catch (e) {
              throw new Error(`Invalid regex pattern: ${e.message}`);
            }
          }
          return {
            artifacts: toolArgs.includeCycle
              ? filtered.map((meta) => ({
                  id: meta.id,
                  latestCycle: meta.latestCycle,
                  type: meta.type,
                }))
              : filtered.map((meta) => meta.id),
          };

        case "diff_text":
          const linesA = (toolArgs.textA || "").split("\n");
          const linesB = (toolArgs.textB || "").split("\n");
          if (toolArgs.textA === toolArgs.textB) {
            return { differences: 0, result: "Texts are identical." };
          }
          const diff = [];
          const maxLen = Math.max(linesA.length, linesB.length);
          let diffCount = 0;
          for (let i = 0; i < maxLen; i++) {
            if (linesA[i] !== linesB[i]) {
              diff.push(
                `L${i + 1}: A='${linesA[i] || ""}' B='${linesB[i] || ""}'`
              );
              diffCount++;
            }
          }
          return {
            differences: diffCount,
            result: `Found ${diffCount} differing lines.`,
            details: diff.slice(0, 20),
          }; // Limit details

        case "convert_to_gemini_fc":
          const mcpDef = toolArgs.mcpToolDefinition;
          if (
            !mcpDef ||
            !mcpDef.name ||
            !mcpDef.inputSchema ||
            mcpDef.inputSchema.type !== "object"
          ) {
            throw new Error(
              "Invalid MCP tool definition provided for conversion."
            );
          }
          const geminiDecl = {
            name: mcpDef.name,
            description: mcpDef.description || "",
            parameters: {
              type: "OBJECT",
              properties: convertMcpPropertiesToGemini(
                mcpDef.inputSchema.properties
              ),
              required: mcpDef.inputSchema.required || [],
            },
          };
          return { geminiFunctionDeclaration: geminiDecl };

        case "code_edit":
          const { artifactId, cycle, newContent } = toolArgs;
          const originalContent = LS.getArtifactContent(artifactId, cycle);
          if (originalContent === null) {
            throw new Error(
              `Original artifact not found for ${artifactId} cycle ${cycle}`
            );
          }
          let isValid = true;
          let validationError = null;
          const meta = StateManager.getArtifactMetadata(artifactId);

          if (meta.type === "JSON") {
            try {
              JSON.parse(newContent);
            } catch (e) {
              isValid = false;
              validationError = `Invalid JSON: ${e.message}`;
            }
          }
          // Add other type-specific validations if needed

          return {
            success: isValid,
            validatedContent: isValid ? newContent : null,
            error: validationError,
            originalContent: originalContent, // Return original for comparison if needed
            artifactId: artifactId,
            cycle: cycle,
            contentChanged: newContent !== originalContent,
          };

        default:
          logger.logEvent(
            "warn",
            `Static tool '${toolName}' execution logic not fully implemented or recognized.`
          );
          return {
            success: true,
            message: `Static tool ${toolName} placeholder executed.`,
            argsReceived: toolArgs,
          };
      }
    }

    const dynamicTool = injectedDynamicTools.find(
      (t) => t.declaration.name === toolName
    );
    if (dynamicTool) {
      if (!dynamicTool.implementation) {
        throw new Error(
          `Dynamic tool '${toolName}' has no implementation defined.`
        );
      }
      logger.logEvent(
        "info",
        `Executing dynamic tool '${toolName}' in Web Worker sandbox.`
      );

      return new Promise((resolve, reject) => {
        const workerCode = `
                self.onmessage = async (event) => {
                    const { toolCode, toolArgs } = event.data;
                    try {
                        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                        const func = new AsyncFunction('params', 'LS', 'StateManager', toolCode + '\\n\\nreturn await run(params);'); // Inject LS, StateManager
                        const result = await func(toolArgs, self.LS_shim, self.StateManager_shim); // Pass shims
                        self.postMessage({ success: true, result: result });
                    } catch (e) {
                        self.postMessage({ success: false, error: e.message });
                    } finally {
                        self.close();
                    }
                };

                // Basic shims for read-only access if needed by tool code
                self.LS_shim = {
                   getArtifactContent: (id, cycle) => self.localStorage.getItem(\`_x0_\${id}_\${cycle}\`),
                   // Add other LS functions if tools *absolutely* need them (use cautiously)
                };
                // Avoid passing full StateManager unless necessary and carefully implemented
                self.StateManager_shim = {
                    getArtifactMetadata: (id) => {
                       // This would require passing the *entire* metadata object to the worker,
                       // or making another async call back, which complicates things.
                       // Best practice: If a dynamic tool needs metadata, it should be passed in 'toolArgs'.
                       console.warn('StateManager_shim.getArtifactMetadata called, but not fully implemented in worker.');
                       return { id: id, type: 'UNKNOWN', latestCycle: -1};
                    },
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
            logger.logEvent("error", `Dynamic tool '${toolName}' timed out.`);
            if (worker) worker.terminate();
            if (workerUrl) URL.revokeObjectURL(workerUrl);
            reject(
              new Error(`Dynamic tool '${toolName}' execution timed out.`)
            );
          }, 10000);
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
              reject(
                new Error(
                  `Dynamic tool '${toolName}' failed: ${event.data.error}`
                )
              );
            }
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
            if (workerUrl) URL.revokeObjectURL(workerUrl);
          };
          worker.postMessage({
            toolCode: dynamicTool.implementation,
            toolArgs: toolArgs,
          });
        } catch (e) {
          clearTimeout(timeoutId);
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
  }

  return {
    runTool: runToolInternal,
  };
})();
window.ToolRunner = ToolRunner;
