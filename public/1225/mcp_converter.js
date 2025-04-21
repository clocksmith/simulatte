const McpConverter = (cfg, log) => {

  const mcp_to_gemini_type = (type) => {
    switch (type?.toLowerCase()) {
      case 'string': return 'STRING';
      case 'integer': return 'INTEGER';
      case 'number': return 'NUMBER';
      case 'boolean': return 'BOOLEAN';
      case 'array': return 'ARRAY';
      case 'object': return 'OBJECT';
      default:
        log.warn(`Unsupported MCP type: ${type}. Mapping to STRING.`);
        return 'STRING';
    }
  };

  const convert_mcp_props = (mcp_props) => {
    if (!mcp_props || typeof mcp_props !== 'object') return {};
    const gemini_props = {};
    for (const key in mcp_props) {
      if (!Object.hasOwnProperty.call(mcp_props, key)) continue;
      if (key === '$schema' || key === 'additionalProperties') continue;

      const mcp_prop = mcp_props[key];
      if (!mcp_prop || typeof mcp_prop !== 'object') {
        log.warn(`Skipping invalid MCP prop: ${key}`);
        continue;
      }

      gemini_props[key] = {
        type: mcp_to_gemini_type(mcp_prop.type),
        description: mcp_prop.description || `Param ${key}`,
      };
      if (Array.isArray(mcp_prop.enum) && mcp_prop.enum.length > 0) {
        gemini_props[key].enum = mcp_prop.enum;
      }
      if (mcp_prop.type === 'array' && mcp_prop.items?.type) {
        gemini_props[key].items = { type: mcp_to_gemini_type(mcp_prop.items.type) };
      }
      if (mcp_prop.type === 'object' && mcp_prop.properties) {
        log.warn(`MCP prop '${key}' is nested object. Gemini prefers flat. Conversion may be partial.`);
        gemini_props[key].properties = convert_mcp_props(mcp_prop.properties);
        if (Array.isArray(mcp_prop.required)) {
          gemini_props[key].required = mcp_prop.required;
        }
      }
    }
    return gemini_props;
  };

  const mcp_to_gemini_func = (mcp_def) => {
    // This function might not be needed if the LLM generates tools/functions directly
    // based on the new prompt format which doesn't require FunctionDeclarations.
    // Keeping it here in case it's useful later or for other API interactions.
    log.warn('mcp_to_gemini_func might be deprecated for primary generation flow.');
    if (!mcp_def?.name || typeof mcp_def.name !== 'string') {
      throw new Error('MCP def needs valid "name" string.');
    }
    let params = { type: 'OBJECT', properties: {} };
    let required = [];

    if (mcp_def.inputSchema && typeof mcp_def.inputSchema === 'object') {
       if (mcp_def.inputSchema.type?.toLowerCase() !== 'object') {
         log.warn(`MCP inputSchema type for '${mcp_def.name}' not 'object'. Forcing.`);
       }
       params.properties = convert_mcp_props(mcp_def.inputSchema.properties);
       required = Array.isArray(mcp_def.inputSchema.required) ? mcp_def.inputSchema.required : [];
       params.required = required.filter(reqKey => params.properties.hasOwnProperty(reqKey));
    } else {
        log.warn(`MCP def '${mcp_def.name}' missing/invalid 'inputSchema'. No params.`);
    }

    const declaration = {
      name: mcp_def.name,
      description: mcp_def.description || `Function ${mcp_def.name}`,
      parameters: params,
    };
    log.debug(`Converted MCP '${mcp_def.name}' to Gemini FuncDecl.`);
    return declaration;
  };

  return { mcp_to_gemini_func };
};
export default McpConverter;

