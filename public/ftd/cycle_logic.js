const CycleLogic = (cfg, log, Utils, storage, State, Api, Mcp, Run) => {
  let is_running = false;
  let is_continuous = false;
  let continuous_counter = 0;
  let continuous_limit = 0;
  let current_request = '';

  const init = () => { log.info('CycleLogic initialized.'); };
  const running = () => is_running;

  const assemble_prompt = (req) => {
    const tpl = storage.get_artifact(cfg.promptTemplateArtifactId);
    if (!tpl) {
      log.error('Prompt template artifact not found!', cfg.promptTemplateArtifactId);
      // Fallback prompt structure
      return `Generate an MCP definition, a JS implementation, and a Web Component based on this request:\n"${req}"\nRespond ONLY with a valid JSON object containing keys "mcp", "impl", and "wc".`;
    }
    return tpl.replace('[[USER_REQUEST]]', req);
  };

  // Validate tool name - must be safe for use as file name and identifier
  const validate_tool_name = (name) => {
    if (!name || typeof name !== 'string') return false;
    // Must start with letter, contain only alphanumeric and underscores, 1-64 chars
    const validNamePattern = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
    return validNamePattern.test(name);
  };

  // Validate MCP schema structure
  const validate_mcp_schema = (mcp) => {
    if (!mcp || typeof mcp !== 'object') return 'MCP must be an object';
    if (!mcp.name || typeof mcp.name !== 'string') return 'MCP missing name';
    if (!validate_tool_name(mcp.name)) return `Invalid tool name: ${mcp.name}. Must be alphanumeric with underscores, starting with a letter, max 64 chars`;
    if (mcp.description && typeof mcp.description !== 'string') return 'MCP description must be a string';
    if (mcp.inputSchema) {
      if (typeof mcp.inputSchema !== 'object') return 'MCP inputSchema must be an object';
      if (mcp.inputSchema.type && mcp.inputSchema.type !== 'object') return 'MCP inputSchema.type must be "object"';
    }
    return null;
  };

  const process_api_response = (api_result, req) => {
    if (api_result.type !== 'text' || !api_result.data) {
      throw new Error(`API bad response. Type: ${api_result.type}, Finish: ${api_result.finishReason}`);
    }
    const sanitized = Api.sanitize_json(api_result.data);
    if (!sanitized) {
      log.error('Failed to sanitize JSON from LLM', { raw: api_result.data.substring(0, 500) });
      throw new Error('LLM response no valid JSON.');
    }

    let parsed;
    try {
      parsed = JSON.parse(sanitized);
    } catch (e) {
      log.error('JSON parse error', { error: e.message, raw: sanitized.substring(0, 500) });
      throw new Error(`LLM response JSON parse error: ${e.message}`);
    }

    // Validate MCP schema
    const mcpError = validate_mcp_schema(parsed.mcp);
    if (mcpError) {
      throw new Error(`Invalid MCP: ${mcpError}`);
    }

    if (!parsed.impl || typeof parsed.impl !== 'string') {
      throw new Error('LLM response missing valid "impl" string.');
    }
    if (parsed.impl.length < 10) {
      throw new Error('LLM response "impl" is too short (minimum 10 characters).');
    }

    if (!parsed.wc || typeof parsed.wc !== 'string') {
      throw new Error('LLM response missing valid "wc" string.');
    }
    if (parsed.wc.length < 10) {
      throw new Error('LLM response "wc" is too short (minimum 10 characters).');
    }

    const temp_id = Utils.uuid();
    return { temp_id, req, mcp: parsed.mcp, impl: parsed.impl, wc: parsed.wc };
  };

  const generate_mock_response = (req) => {
    // Simulation mode: generate a simple mock tool
    const toolName = req.split(' ').slice(0, 3).join('_').replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30) || 'mock_tool';
    return {
      type: 'text',
      data: JSON.stringify({
        mcp: {
          name: toolName,
          description: `Mock tool for: ${req.substring(0, 100)}`,
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input parameter' }
            },
            required: ['input']
          }
        },
        impl: `// Mock implementation for: ${req}\nfunction run(args) {\n  return { result: 'Mock result for: ' + args.input, timestamp: Date.now() };\n}\nreturn run;`,
        wc: `// Mock Web Component for: ${req}\nclass MockComponent extends HTMLElement {\n  connectedCallback() {\n    this.innerHTML = '<div style="padding:1rem;border:2px dashed #b16ee0;border-radius:4px;"><h3>Mock Tool</h3><p>${req.substring(0, 100)}</p><input placeholder="Input..." /><button>Run</button><pre id="output">No output yet</pre></div>';\n    this.querySelector('button').onclick = () => {\n      const input = this.querySelector('input').value;\n      this.querySelector('#output').textContent = 'Mock result for: ' + input;\n    };\n  }\n}\ncustomElements.define('${toolName.replace(/_/g, '-')}', MockComponent);`
      }),
      finishReason: 'STOP'
    };
  };

  const generate_single = async (req, cb) => {
    const session = State.get_session();
    if (!session.apiKey) {
      // Simulation mode: generate mock response
      log.warn('No API key - using simulation mode');
      cb('status', { msg: 'Simulation Mode: Generating mock tool...', active: true });
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate API delay
      const mock_result = generate_mock_response(req);
      State.increment_stat('apiCalls'); // Still count as call for stats
      State.set_last_error(null);
      return process_api_response(mock_result, req);
    }

    const prompt = assemble_prompt(req);
    const gen_cfg_overrides = {
        // Pass specific overrides if needed, otherwise use config defaults
        // temperature: 0.8 // Example override
    };
    State.increment_stat('apiCalls');
    const api_result = await Api.call(
      prompt,
      session.apiKey,
      gen_cfg_overrides,
      cb,
      session.model || cfg.model
    );
    State.set_last_error(null);
    return process_api_response(api_result, req);
  };

  const approve_generation = (pending_gen) => {
    if (!pending_gen) return false;
    const { temp_id, req, mcp, impl, wc } = pending_gen;
    // Generate a unique ID based on name + UUID fragment
    const tool_id = `${mcp.name.replace(/[^a-zA-Z0-9_]/g, '_')}-${Utils.uuid().substring(0, 8)}`;
    try {
      storage.set_artifact(`${tool_id}.mcp.json`, JSON.stringify(mcp, null, 2));
      storage.set_artifact(`${tool_id}.impl.js`, impl);
      storage.set_artifact(`${tool_id}.wc.js`, wc);
      // Add tool to state (stores mcp, impl, wc_ref=true, meta)
      State.add_tool(tool_id, mcp, impl, { sourceRequest: req }); // Pass only needed state parts
      log.info(`Approved and saved tool: ${tool_id} (${mcp.name})`);
      return State.get_tool(tool_id); // Return the saved tool data from state
    } catch (e) {
      log.error(`Failed to save approved tool ${tool_id}`, e);
      State.increment_stat('errors');
      State.set_last_error(`Save failed: ${e.message}`);
      // Clean up potentially partial artifacts
      storage.delete_artifact(`${tool_id}.mcp.json`);
      storage.delete_artifact(`${tool_id}.impl.js`);
      storage.delete_artifact(`${tool_id}.wc.js`);
      return null;
    }
  };

  const start_generation = async (req, mode, limit, cb = () => {}) => {
    if (is_running) {
      log.warn('Generate request ignored: Already running.');
      cb('error', { msg: 'Generation already in progress.' });
      return;
    }
    if (!req?.trim()) {
      cb('error', { msg: 'Tool request cannot be empty.' }); return;
    }
    const session = State.get_session();
    if (!session.apiKey) {
      cb('error', { msg: 'API Key is required.' }); return;
    }

    is_running = true;
    is_continuous = mode === 'continuous';
    continuous_counter = 0;
    continuous_limit = is_continuous ? (parseInt(limit, 10) || cfg.continuousModeDefaultIterations) : 1;
    const versions_to_generate = (mode === 'manual') ? cfg.manualModeVersions : 1;
    current_request = req;
    State.clear_pending();
    State.increment_stat('cyclesRun');
    cb('status', { msg: `Starting ${mode} generation...`, active: true });

    let overall_generated = 0;

    try {
      let generated_count_this_cycle = 0;
      while (is_running && (continuous_counter < continuous_limit || !is_continuous)) {

         if (is_continuous) {
            cb('status', { msg: `Generating iteration ${continuous_counter + 1}/${continuous_limit}...`, active: true });
            generated_count_this_cycle = 0; // Reset for continuous iteration
         } else {
             cb('status', { msg: `Generating ${versions_to_generate} version(s)...`, active: true });
             generated_count_this_cycle = 0; // Reset for manual versions
         }

         // Generate required number of versions (1 for continuous, N for manual)
         for (let v = 0; v < versions_to_generate && is_running; v++) {
             if (versions_to_generate > 1) {
                 cb('status', { msg: `Generating version ${v + 1}/${versions_to_generate}...`, active: true });
             }

             const iterationNumber = is_continuous ? continuous_counter + 1 : 1;
             const iterationTotal = is_continuous ? continuous_limit : 1;
             const versionNumber = is_continuous ? 1 : v + 1;
             const versionTotal = is_continuous ? 1 : versions_to_generate;

             const pending = await generate_single(current_request, cb);
             State.add_pending(pending);
             generated_count_this_cycle++;
             overall_generated++;

             cb('progress', {
               mode,
               iteration: iterationNumber,
               iterationTotal,
               version: versionNumber,
               versionTotal,
               totalGenerated: overall_generated,
             });
         }

         if (!is_running) break; // Aborted during generation loop

         continuous_counter++; // Increment cycle counter

         if (is_continuous) {
           // In continuous mode, we auto-approve the *first* one generated in this iteration
           const just_generated = State.get_pending(); // Assumes add_pending was synchronous enough
           if (just_generated.length > 0) {
               const approved_tool = approve_generation(just_generated[0]); // Approve the first/only one
               if (approved_tool) {
                   cb('auto_approved', { tool: approved_tool });
                   State.clear_pending(); // Clear pending after auto-approval
               } else {
                   cb('error', { msg: `Failed to auto-approve iteration ${continuous_counter}` });
                   // Potentially stop continuous run on error: is_running = false; break;
               }
           }
         } else {
           // Manual mode: stop after generating versions, present for review
           cb('pending', { generations: State.get_pending() });
           is_running = false; // Stop the outer loop
           break;
         }

         // Check continuous limit
         if (is_continuous && continuous_counter >= continuous_limit) {
            cb('status', { msg: `Continuous run finished ${continuous_limit} iterations.`, active: false });
            is_running = false;
            break;
         }
         // Optional delay between continuous calls
         // if (is_continuous && is_running) await Utils.delay(500);
      }
    } catch (error) {
      log.error('Generation cycle failed.', error);
      State.increment_stat('errors');
      State.set_last_error(error.message);
      cb('status', { msg: `Error: ${error.message}`, active: false, isError: true });
      cb('error', { msg: error.message });
    } finally {
      if (is_running) { // If loop finished naturally
         cb('status', { msg: is_continuous ? `Continuous run complete.` : 'Generation complete.', active: false });
      }
      is_running = false;
      is_continuous = false;
      cb('final', {});
    }
  };

  const generate_version = async (req, cb = () => {}) => {
     if (is_running) {
        cb('error', { msg: 'Cannot generate new version while another operation is running.' });
        return;
     }
      if (!req?.trim()) {
        cb('error', { msg: 'Original request is missing.' }); return;
      }
      const session = State.get_session();
      if (!session.apiKey) {
        cb('error', { msg: 'API Key is required.' }); return;
      }

      is_running = true;
      cb('status', { msg: 'Generating new version...', active: true });

      try {
         const pending = await generate_single(req, cb);
         State.add_pending(pending); // Add to existing pending list
         cb('pending', { generations: State.get_pending() }); // Update UI with new list
      } catch (error) {
         log.error('Version generation failed.', error);
         State.increment_stat('errors');
         State.set_last_error(error.message);
         cb('status', { msg: `Version Error: ${error.message}`, active: false, isError: true });
         cb('error', { msg: error.message });
      } finally {
         is_running = false;
         cb('final', {});
      }
  };

  const handle_approval = (temp_id) => {
     const pending = State.get_pending();
     const gen_to_approve = pending.find(p => p.temp_id === temp_id);
     if (!gen_to_approve) {
        log.warn(`Approval failed: Pending generation ${temp_id} not found.`);
        return null;
     }
     const approved_tool = approve_generation(gen_to_approve);
     if (approved_tool) {
        State.clear_pending(); // Clear all pending once one is approved
     }
     return approved_tool;
  };

  const handle_rejection = () => {
     log.info('Pending generations rejected by user.');
     State.clear_pending();
  };

  const abort_generation = () => {
    if (is_running) {
      log.info('Attempting to abort generation.');
      Api.abort('User abort request');
      is_running = false;
      is_continuous = false;
      // Callback handled in start_generation finally block
    } else {
      log.info('Abort request ignored: No generation running.');
    }
  };

  return { init, running, start_generation, generate_version, handle_approval, handle_rejection, abort_generation };
};
export default CycleLogic;
