const MCPConverterModule = (config, logger) => {
  if (!config || !logger) {
    console.error("MCPConverterModule requires config and logger.");
    return null;
  }

  const mapMcpTypeToGemini = (mcpType) => {
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
        logger.logEvent(
          "warn",
          `Unsupported MCP type encountered during conversion: ${mcpType}. Mapping to STRING.`
        );
        return "STRING";
    }
  };

  const convertMcpProperties = (mcpProps) => {
    if (!mcpProps || typeof mcpProps !== "object") return {};
    const geminiProps = {};
    for (const key in mcpProps) {
      if (Object.hasOwnProperty.call(mcpProps, key)) {
        if (key === "$schema" || key === "additionalProperties") continue;

        const mcpProp = mcpProps[key];
        if (!mcpProp || typeof mcpProp !== "object") {
          logger.logEvent(
            "warn",
            `Skipping invalid MCP property definition for key: ${key}`
          );
          continue;
        }

        geminiProps[key] = {
          type: mapMcpTypeToGemini(mcpProp.type),
          description: mcpProp.description || `Parameter ${key}`,
        };
        if (Array.isArray(mcpProp.enum) && mcpProp.enum.length > 0) {
          geminiProps[key].enum = mcpProp.enum;
        }
        if (
          mcpProp.type === "array" &&
          mcpProp.items &&
          typeof mcpProp.items === "object"
        ) {
          if (mcpProp.items.type) {
            geminiProps[key].items = {
              type: mapMcpTypeToGemini(mcpProp.items.type),
            };
          } else {
            logger.logEvent(
              "warn",
              `MCP array property '${key}' has items definition without a 'type'. Skipping items conversion.`
            );
          }
        }

        if (mcpProp.type === "object" && mcpProp.properties) {
          logger.logEvent(
            "warn",
            `MCP property '${key}' is a nested object. Gemini FunctionDeclaration parameters generally expect a flat structure. Conversion might be partial or inaccurate.`
          );

          geminiProps[key].properties = convertMcpProperties(
            mcpProp.properties
          );
          if (Array.isArray(mcpProp.required)) {
            geminiProps[key].required = mcpProp.required;
          }
        }
      }
    }
    return geminiProps;
  };

  const mcpToGeminiFunctionDeclaration = (mcpDefinition) => {
    if (!mcpDefinition || typeof mcpDefinition !== "object") {
      throw new Error("Invalid MCP definition object provided for conversion.");
    }
    if (!mcpDefinition.name || typeof mcpDefinition.name !== "string") {
      throw new Error("MCP definition must have a valid 'name' string.");
    }
    if (
      !mcpDefinition.inputSchema ||
      typeof mcpDefinition.inputSchema !== "object"
    ) {
      logger.logEvent(
        "warn",
        `MCP definition for '${mcpDefinition.name}' missing or has invalid 'inputSchema'. Creating declaration with no parameters.`
      );
      return {
        name: mcpDefinition.name,
        description:
          mcpDefinition.description || `Function ${mcpDefinition.name}`,
        parameters: { type: "OBJECT", properties: {} },
      };
    }

    if (mcpDefinition.inputSchema.type?.toLowerCase() !== "object") {
      logger.logEvent(
        "warn",
        `MCP inputSchema type for '${mcpDefinition.name}' is not 'object' (${mcpDefinition.inputSchema.type}). Forcing to OBJECT for Gemini compatibility.`
      );
    }

    const geminiParameters = {
      type: "OBJECT",
      properties: convertMcpProperties(mcpDefinition.inputSchema.properties),
      required: Array.isArray(mcpDefinition.inputSchema.required)
        ? mcpDefinition.inputSchema.required
        : [],
    };

    if (
      Object.keys(geminiParameters.properties).length === 0 &&
      geminiParameters.required.length === 0
    ) {
    } else {
      geminiParameters.required = geminiParameters.required.filter((reqKey) =>
        geminiParameters.properties.hasOwnProperty(reqKey)
      );
    }

    const geminiDeclaration = {
      name: mcpDefinition.name,
      description:
        mcpDefinition.description || `Function ${mcpDefinition.name}`,
      parameters: geminiParameters,
    };

    logger.logEvent(
      "debug",
      `Converted MCP tool '${mcpDefinition.name}' to Gemini FunctionDeclaration.`
    );
    return geminiDeclaration;
  };

  const geminiToMcpFunctionDefinition = (geminiDeclaration) => {
    logger.logEvent(
      "warn",
      "Conversion from Gemini FunctionDeclaration back to MCP is not fully implemented."
    );

    if (!geminiDeclaration || !geminiDeclaration.name) {
      throw new Error(
        "Invalid Gemini declaration provided for conversion back to MCP."
      );
    }
    const mapGeminiTypeToMcp = (geminiType) => {
      switch (geminiType) {
        case "STRING":
          return "string";
        case "INTEGER":
          return "integer";
        case "NUMBER":
          return "number";
        case "BOOLEAN":
          return "boolean";
        case "ARRAY":
          return "array";
        case "OBJECT":
          return "object";
        default:
          return "string";
      }
    };

    const convertGeminiProperties = (geminiProps) => {
      if (!geminiProps) return {};
      const mcpProps = {};
      for (const key in geminiProps) {
        const geminiProp = geminiProps[key];
        mcpProps[key] = {
          type: mapGeminiTypeToMcp(geminiProp.type),
          description: geminiProp.description || "",
        };
        if (geminiProp.enum) mcpProps[key].enum = geminiProp.enum;
      }
      return mcpProps;
    };

    const mcpDefinition = {
      name: geminiDeclaration.name,
      description: geminiDeclaration.description || "",
      inputSchema: {
        type: "object",
        properties: convertGeminiProperties(
          geminiDeclaration.parameters?.properties
        ),
        required: geminiDeclaration.parameters?.required || [],
      },
    };
    return mcpDefinition;
  };

  return {
    mcpToGeminiFunctionDeclaration,
    geminiToMcpFunctionDefinition,
  };
};

export default MCPConverterModule;
