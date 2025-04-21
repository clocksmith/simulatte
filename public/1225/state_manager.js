const StateManager = (cfg, log, storage) => {
  let state = null;
  let session = { apiKey: '', mode: 'manual', continuousLimit: cfg.continuousModeDefaultIterations };

  const default_state = () => ({
    version: cfg.version,
    tools: {}, // { [tool_id]: { id, mcp, impl, wc_ref: true, meta } }
    pending: [], // [ { temp_id, req, mcp, impl, wc } ]
    stats: { tools: 0, cyclesRun: 0, apiCalls: 0, errors: 0 },
    lastError: null,
  });

  const validate_state = (loaded) => {
    if (!loaded || typeof loaded !== 'object') return false;
    // Allow importing state from same major version? Or require exact match? Exact for now.
    if (loaded.version !== cfg.version) {
      log.warn(`State version mismatch. Loaded: ${loaded.version}, Expected: ${cfg.version}. Discarding.`);
      return false;
    }
    // Basic structure checks
    return typeof loaded.tools === 'object' && loaded.tools !== null &&
           typeof loaded.stats === 'object' && loaded.stats !== null &&
           Array.isArray(loaded.pending); // Check for pending array
  };

  const load_session = () => {
     try {
        const stored = sessionStorage.getItem(cfg.sessionKey);
        if (stored) {
           const parsed = JSON.parse(stored);
           if (parsed && typeof parsed.apiKey === 'string' && typeof parsed.mode === 'string') {
              // Merge stored session with defaults to ensure all keys exist
              session = { ...session, ...parsed };
              log.info('Session state loaded.');
           } else {
              log.warn('Invalid session state found, using defaults.');
              sessionStorage.setItem(cfg.sessionKey, JSON.stringify(session));
           }
        } else {
           log.info('No session state found, using defaults.');
           sessionStorage.setItem(cfg.sessionKey, JSON.stringify(session));
        }
     } catch (e) {
        log.error('Failed to load or save session state', e);
        sessionStorage.setItem(cfg.sessionKey, JSON.stringify(session)); // Reset on error
     }
  };

  const save_session = () => {
     try {
        sessionStorage.setItem(cfg.sessionKey, JSON.stringify(session));
     } catch (e) {
        log.error('Failed to save session state', e);
     }
  };

  const init = () => {
    const loaded = storage.get_state(); // Uses configured stateKey
    if (loaded && validate_state(loaded)) {
      state = loaded;
      log.info(`State initialized from storage v${state.version}`);
    } else {
      if (loaded) log.warn('Invalid state from storage, initializing default.');
      state = default_state();
      log.info(`State initialized with default v${state.version}`);
      save_state(); // Save initial default state
    }
    // Always clear pending generations on init/reload
    state.pending = [];
    load_session();
  };

  const get_state = () => state;

  const save_state = () => {
    if (!state) throw new Error('State not initialized.');
    try {
      storage.save_state(state); // Uses configured stateKey
      log.debug('State saved.');
    } catch (e) {
      log.error('Failed to save state', e);
      state.lastError = `Save fail: ${e.message}`;
      // Consider notifying UI about save failure
    }
  };

  const get_session = () => session;

  const update_session = (new_session_data) => {
     session = { ...session, ...new_session_data };
     save_session();
  };

  const add_tool = (id, mcp, impl, meta = {}) => {
    if (!state) throw new Error('State not initialized.');
    if (state.tools[id]) log.warn(`Overwriting tool: ${id}`);
    if (!mcp?.name || !impl) throw new Error(`Invalid tool data for ${id}`);

    state.tools[id] = {
      id,
      mcp,
      impl, // Store the JS implementation string
      wc_ref: true, // Indicate WC artifact exists in storage
      meta: {
        createdAt: new Date().toISOString(),
        name: mcp.name,
        description: mcp.description || '(No description)',
        sourceRequest: meta.sourceRequest || '',
        // Add other relevant metadata from meta object if needed
      },
    };
    state.stats.tools = (state.stats.tools || 0) + 1;
    log.info(`Tool added/updated: ${id} (${mcp.name})`);
    save_state();
  };

  const get_tool = (id) => state?.tools?.[id] ?? null;
  const list_tools = () => Object.values(state?.tools || {});

  const delete_tool = (id) => {
    if (state?.tools?.[id]) {
      delete state.tools[id];
      log.info(`Tool deleted from state: ${id}`);
      save_state();
      return true;
    }
    log.warn(`Attempted delete non-existent tool: ${id}`);
    return false;
  };

  const add_pending = (gen) => {
      if (state) {
          state.pending.push(gen);
          save_state(); // Save state after adding pending item
      } else {
          log.error("Cannot add pending generation, state not initialized.");
      }
  };
  const get_pending = () => state?.pending || [];
  const clear_pending = () => {
      if (state) {
          state.pending = [];
          save_state(); // Save state after clearing
      }
  };

  const increment_stat = (stat_name) => {
     if (state?.stats && typeof state.stats[stat_name] === 'number') {
        state.stats[stat_name]++;
     } else if (state?.stats) {
        state.stats[stat_name] = 1; // Initialize if missing
     }
     // Only save state explicitly for major events like cycle runs or errors
     // if (stat_name === 'cyclesRun' || stat_name === 'errors') save_state();
  };

  const set_last_error = (msg) => {
      if (state) state.lastError = msg;
      // Avoid saving state just for lastError update
  };

  return {
    init, get_state, save_state, get_session, update_session,
    add_tool, get_tool, list_tools, delete_tool,
    add_pending, get_pending, clear_pending,
    increment_stat, set_last_error,
  };
};
export default StateManager;

