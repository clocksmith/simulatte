import ToolCard from "./tool_card.wc.js"; // Import custom element

const UiManager = (cfg, log, Utils, storage, State, Logic, Run) => {
  let ui = {};
  let loaded_wc = new Set();
  let selected_pending_id = null;

  // Map IDs to camelCase keys in ui object
  const get_ui_refs = () => {
    const ids = [
      "app",
      "notify",
      "status",
      "api_key",
      "model_select",
      "save_key_btn",
      "export_btn",
      "import_btn",
      "import_file",
      "log_btn",
      "clear_btn",
      "storage",
      "tool_req",
      "cont_opts",
      "cont_limit",
      "generate_btn",
      "abort_btn",
      "pending_section",
      "pending_list",
      "pending_actions",
      "approve_btn",
      "version_btn",
      "reject_btn",
      "progress_info",
      "progress_iteration",
      "progress_version",
      "progress_total",
      "preview_section",
      "preview_area",
      "close_preview_btn",
      "search_box",
      "sort_box",
      "library",
      "version",
      "manual_versions_count",
      "boot_log",
      "loading", // Add boot/loading if needed
    ];
    const refs = {};
    ids.forEach((id) => {
      // Convert snake_case id to camelCase key
      const key = id.replace(/_([a-z])/g, (match, letter) =>
        letter.toUpperCase()
      );
      refs[key] = Utils.id(id);
    });
    // Add radio buttons separately
    refs.genModeRadios = Utils.qsa('input[name="gen_mode"]');
    return refs;
  };

  const update_status = (msg, active = false, is_error = false) => {
    if (!ui.status) return;
    ui.status.textContent = `Status: ${msg}`;
    ui.status.className = is_error
      ? "status-error"
      : active
      ? "status-active"
      : "status-idle";
  };

  const update_progress = (payload) => {
    if (!ui.progressInfo || !ui.progressIteration || !ui.progressVersion || !ui.progressTotal) return;
    const {
      mode = 'manual',
      iteration = 0,
      iterationTotal = 0,
      version = 0,
      versionTotal = 0,
      totalGenerated = 0,
    } = payload || {};

    ui.progressInfo.classList.remove('hidden');

    const iterLabel = iterationTotal > 0 ? `${iteration}/${iterationTotal}` : `${iteration}`;
    const versionLabel = versionTotal > 0 ? `${version}/${versionTotal}` : `${version}`;
    ui.progressIteration.textContent = `${mode === 'continuous' ? 'C' : 'M'} • ${iterLabel}`;
    ui.progressVersion.textContent = versionLabel;
    ui.progressTotal.textContent = totalGenerated;
  };

  const clear_progress = () => {
    if (!ui.progressInfo) return;
    ui.progressInfo.classList.add('hidden');
    if (ui.progressIteration) ui.progressIteration.textContent = '0 / 0';
    if (ui.progressVersion) ui.progressVersion.textContent = '0 / 0';
    if (ui.progressTotal) ui.progressTotal.textContent = '0';
  };

  const notify = (msg, type = "info", duration = 5000) => {
    if (!ui.notify) return;
    const el = document.createElement("div");
    el.className = `notification type-${type}`;
    // ARIA attributes for accessibility
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    const msgSpan = document.createElement("span");
    msgSpan.textContent = msg;
    el.appendChild(msgSpan);

    const close = document.createElement("button");
    close.innerHTML = "&times;";
    close.setAttribute('aria-label', 'Dismiss notification');
    close.onclick = () => el.remove();
    el.appendChild(close);
    ui.notify.appendChild(el);
    if (duration > 0) setTimeout(() => el.remove(), duration);
  };

  const update_storage_usage = () => {
    if (!ui.storage) return;
    const u = storage.usage();
    if (u.used >= 0) {
      ui.storage.textContent = `${(u.used / 1024).toFixed(
        1
      )}KB (${u.pct.toFixed(1)}%)`;
      ui.storage.style.color =
        u.pct > cfg.storeQuotaWarn * 100 ? "orange" : "inherit";
    } else {
      ui.storage.textContent = `Error`;
      ui.storage.style.color = "red";
    }
  };

  const render_library = () => {
    if (!ui.library) return;
    let tools = State.list_tools();
    ui.library.innerHTML = "";
    const term = (ui.searchBox?.value || "").toLowerCase();
    const sort = ui.sortBox?.value || "name";

    if (term) {
      tools = tools.filter(
        (t) =>
          t.meta?.name?.toLowerCase().includes(term) ||
          t.meta?.description?.toLowerCase().includes(term) ||
          t.id?.toLowerCase().includes(term)
      );
    }
    tools.sort((a, b) => {
      const a_val = sort === "date" ? a.meta?.createdAt : a.meta?.name || "";
      const b_val = sort === "date" ? b.meta?.createdAt : b.meta?.name || "";
      return sort === "date"
        ? new Date(b_val || 0) - new Date(a_val || 0)
        : (a_val || "").localeCompare(b_val || "");
    });

    if (tools.length === 0) {
      ui.library.innerHTML = `<p>No tools found${
        term ? " matching filter" : ""
      }.</p>`;
      return;
    }
    tools.forEach((tool) => {
      const card = document.createElement("tool-card");
      card.set_data(tool, false); // false = not pending
      ui.library.appendChild(card);
    });
  };

  const render_pending = () => {
    const pending = State.get_pending();
    if (!ui.pendingSection || !ui.pendingList || !ui.pendingActions) return;

    if (pending.length === 0) {
      ui.pendingSection.classList.add("hidden");
      ui.pendingList.innerHTML = "";
      ui.pendingActions.classList.add("hidden");
      selected_pending_id = null;
      return;
    }

    ui.pendingSection.classList.remove("hidden");
    ui.pendingActions.classList.remove("hidden");
    ui.pendingList.innerHTML = "";
    let has_selection = false;

    pending.forEach((gen) => {
      const card = document.createElement("tool-card");
      card.set_data(gen, true); // true = pending
      if (gen.temp_id === selected_pending_id) {
        card.classList.add("selected");
        has_selection = true;
      }
      // Add click listener to the card itself for selection
      card.addEventListener("click", () => {
        selected_pending_id = gen.temp_id;
        render_pending(); // Re-render to update selection style
      });
      ui.pendingList.appendChild(card);
    });

    // Enable/disable buttons based on selection
    ui.approveBtn.disabled = !has_selection;
    ui.versionBtn.disabled = !has_selection;
  };

  // Track previously focused element for focus restoration
  let previouslyFocusedElement = null;

  // Focus trap for modal-like sections (preview)
  const setup_focus_trap = (container) => {
    if (!container) return null;

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        ui.closePreviewBtn?.click();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement) return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    container.addEventListener('keydown', handleKeydown);
    return () => container.removeEventListener('keydown', handleKeydown);
  };

  let removeFocusTrap = null;

  // Dynamically loads WC code via script tag and renders preview
  const load_and_show_wc = (tool_id, wc_code_str, mcp_def) => {
    if (!wc_code_str || !mcp_def?.name) {
      notify("Missing WC code or tool name for preview.", "error");
      return;
    }
    // Convert camelCase or snake_case name to kebab-case for tag name
    const kebab_name = mcp_def.name
      .replace(/([A-Z])/g, "-$1") // Add hyphen before caps
      .toLowerCase()
      .replace(/^-/, "") // Remove leading hyphen if first letter was cap
      .replace(/_/g, "-"); // Replace underscores
    const tag_name = `${kebab_name}-${tool_id.substring(0, 4)}`; // Add fragment for uniqueness

    const display_preview = () => {
      if (!ui.previewArea || !ui.previewSection || !ui.closePreviewBtn) return;

      // Store currently focused element for later restoration
      previouslyFocusedElement = document.activeElement;

      try {
        const wc_instance = document.createElement(tag_name);
        ui.previewArea.innerHTML = ""; // Clear previous
        ui.previewArea.appendChild(wc_instance);
        ui.previewSection.classList.remove("hidden");
        ui.previewSection.setAttribute('role', 'dialog');
        ui.previewSection.setAttribute('aria-modal', 'true');
        ui.previewSection.setAttribute('aria-label', `Preview of ${mcp_def.name}`);
        ui.previewSection.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });

        // Setup focus trap and focus close button
        removeFocusTrap = setup_focus_trap(ui.previewSection);
        ui.closePreviewBtn?.focus();
      } catch (e) {
        log.error(`Failed to create WC instance <${tag_name}>`, e);
        notify(`Error creating WC preview: ${e.message}`, "error");
        ui.previewArea.innerHTML = `<p style="color:red;">Preview Error: Could not create element. Check console.</p>`;
        ui.previewSection.classList.remove("hidden");
      }
    };

    if (loaded_wc.has(tag_name) || customElements.get(tag_name)) {
      display_preview(); // Already loaded/defined
    } else {
      try {
        const script = document.createElement("script");
        script.type = "module";
        const blob = new Blob([wc_code_str], {
          type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);
        script.src = url;
        script.onload = () => {
          log.info(`Dynamically loaded WC: ${tag_name}`);
          loaded_wc.add(tag_name); // Track it if needed, though customElements.get is better check
          display_preview();
          URL.revokeObjectURL(url);
          document.head.removeChild(script); // Clean up script tag
        };
        script.onerror = (e) => {
          log.error(`Failed to load WC script <${tag_name}>`, e);
          notify(`Error loading WC script: ${tag_name}`, "error");
          URL.revokeObjectURL(url);
          document.head.removeChild(script);
        };
        document.head.appendChild(script);
      } catch (e) {
        log.error(`Error setting up WC script tag <${tag_name}>`, e);
        notify(`Error loading WC: ${e.message}`, "error");
      }
    }
  };

  // Handles callbacks from CycleLogic during generation
  const generation_callback = (type, data) => {
    log.debug(`Gen CB - Type: ${type}`, data);
    switch (type) {
      case "status":
        update_status(data.msg, data.active, data.is_error);
        break;
      case "progress":
        update_progress(data);
        break;
      case "error":
        notify(`Generation Error: ${data.msg}`, "error");
        // Ensure buttons are re-enabled on error if logic didn't reach 'final'
        ui.generateBtn.disabled = false;
        ui.abortBtn.classList.add("hidden");
        break;
      case "pending":
        render_pending();
        update_status("Pending user review", false);
        break;
      case "auto_approved":
        notify(
          `Tool "${data.tool?.meta?.name}" auto-approved & saved.`,
          "success",
          3000
        );
        render_library(); // Update library as continuous mode saves
        update_storage_usage();
        break;
      case "final":
        ui.generateBtn.disabled = false;
        ui.abortBtn.classList.add("hidden");
        // Set final status unless there's pending items or an error shown
        if (!State.get_pending().length && !State.get_state()?.lastError) {
          update_status("Idle");
        } else if (State.get_pending().length > 0) {
          update_status("Pending user review", false);
        }
        update_storage_usage();
        break;
      // Ignore 'progress', 'result' - handled internally by logic/state
    }
  };

  const setup_listeners = () => {
    ui.saveKeyBtn?.addEventListener("click", () => {
      const key = ui.apiKey?.value.trim() ?? "";
      State.update_session({ apiKey: key });
      notify(key ? "API Key saved for session." : "API Key cleared.", "info");

      // Show visual confirmation
      const indicator = document.getElementById("key_saved_indicator");
      if (indicator && key) {
        indicator.classList.remove("hidden");
        indicator.classList.add("show");
        // Reset animation
        indicator.style.animation = "none";
        indicator.offsetHeight; // Trigger reflow
        indicator.style.animation = null;
        // Hide after animation completes
        setTimeout(() => {
          indicator.classList.add("hidden");
          indicator.classList.remove("show");
        }, 2000);
      }
    });

    ui.modelSelect?.addEventListener("change", (e) => {
      const value = e.target.value || cfg.model;
      State.update_session({ model: value });
      cfg.model = value; // keep runtime config in sync
      notify(`Model set to ${value}.`, "info", 2500);
    });

    ui.generateBtn?.addEventListener("click", () => {
      const req = ui.toolReq?.value.trim() ?? "";
      const mode =
        Utils.qs('input[name="gen_mode"]:checked')?.value || "manual";
      const limit = ui.contLimit?.value || cfg.continuousModeDefaultIterations;
      ui.generateBtn.disabled = true;
      ui.abortBtn.classList.remove("hidden");
      ui.previewSection?.classList.add("hidden"); // Hide preview on new generation
      clear_progress();
      Logic.start_generation(req, mode, limit, generation_callback);
    });

    ui.abortBtn?.addEventListener("click", () => {
      Logic.abort_generation();
      // UI state reset is handled in the 'final' callback or error callback
    });

    ui.genModeRadios?.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        const mode = e.target.value;
        const show_continuous = mode === "continuous";
        ui.contOpts?.classList.toggle("hidden", !show_continuous);
        State.update_session({ mode: mode });
        // Update displayed manual version count
        if (ui.manualVersionsCount)
          ui.manualVersionsCount.textContent =
            mode === "manual" ? cfg.manualModeVersions : "?";
      });
    });

    ui.approveBtn?.addEventListener("click", () => {
      if (!selected_pending_id) {
        notify("Select a pending version to approve.", "warn");
        return;
      }
      const approved_tool = Logic.handle_approval(selected_pending_id);
      if (approved_tool) {
        notify(
          `Tool "${approved_tool.meta.name}" approved and saved.`,
          "success"
        );
        render_library();
        render_pending(); // Clears pending section
        update_storage_usage();
      } else {
        notify("Approval failed. Check logs.", "error");
      }
      selected_pending_id = null; // Reset selection
    });

    ui.rejectBtn?.addEventListener("click", () => {
      if (confirm("Reject all pending generations?")) {
        Logic.handle_rejection();
        render_pending(); // Clears pending section
        notify("Pending generations rejected.", "info");
        selected_pending_id = null; // Reset selection
      }
    });

    ui.versionBtn?.addEventListener("click", () => {
      if (!selected_pending_id) {
        notify("Select a pending version to generate a new variant.", "warn");
        return;
      }
      const pending = State.get_pending().find(
        (p) => p.temp_id === selected_pending_id
      );
      if (!pending?.req) {
        notify(
          "Could not find original request for selected version.",
          "error"
        );
        return;
      }
      ui.generateBtn.disabled = true; // Disable main generate during version gen
      ui.abortBtn.classList.remove("hidden"); // Allow abort
      Logic.generate_version(pending.req, generation_callback);
    });

    ui.exportBtn?.addEventListener("click", () => {
      try {
        const state = State.get_state();
        if (!state) {
          notify("State not available.", "warn");
          return;
        }
        Utils.downloadJson(state, `dtf-state_${Utils.timestamp()}.json`);
        notify("State exported.", "info");
      } catch (e) {
        notify(`Export failed: ${e.message}`, "error");
        log.error("Export failed", e);
      }
    });

    ui.importBtn?.addEventListener("click", () => ui.importFile?.click());
    ui.importFile?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        const imported = JSON.parse(content);
        // Basic validation before attempting save/reload
        if (!imported || typeof imported !== "object" || !imported.version) {
          throw new Error(`Invalid state file format or missing version.`);
        }
        if (imported.version !== cfg.version) {
          throw new Error(
            `Version mismatch (App: ${cfg.version}, File: ${imported.version})`
          );
        }
        storage.save_state(imported); // Let storage handle detailed validation/saving
        notify("State imported successfully. Reloading...", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        notify(`Import failed: ${err.message}`, "error");
        log.error("Import failed", err);
      } finally {
        if (ui.importFile) ui.importFile.value = "";
      }
    });

    ui.logBtn?.addEventListener("click", () => {
      try {
        Utils.downloadText(
          log.getLogBuffer(),
          `dtf-log_${Utils.timestamp()}.txt`
        );
      } catch (e) {
        notify(`Log download failed: ${e.message}`, "error");
        log.error("Log DL failed", e);
      }
    });

    ui.clearBtn?.addEventListener("click", () => {
      if (confirm("WARNING: Delete ALL DTF data (tools, state)?")) {
        try {
          storage.clear_all();
          notify("Storage cleared. Reloading...", "warn");
          setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
          notify(`Clear failed: ${e.message}`, "error");
          log.error("Clear failed", e);
        }
      }
    });

    ui.searchBox?.addEventListener("input", render_library);
    ui.sortBox?.addEventListener("change", render_library);

    // Event delegation for tool card actions from library or pending list
    ui.app?.addEventListener("edit-req", (e) => {
      if (ui.toolReq) {
        log.info(`Editing request for tool ${e.detail.tool_id}`);
        ui.toolReq.value = e.detail.req || "";
        ui.toolReq.focus();
        ui.toolReq.scrollIntoView({ behavior: "smooth", block: "center" });
        if (ui.generateBtn) {
          const original_text = "Generate"; // Assuming default text
          ui.generateBtn.textContent = "Regenerate";
          setTimeout(() => {
            if (ui.generateBtn) ui.generateBtn.textContent = original_text;
          }, 3000);
        }
      }
    });

    ui.app?.addEventListener("exec-tool", async (e) => {
      const { tool_id, name, args } = e.detail;
      const tool = State.get_tool(tool_id);
      if (tool?.impl) {
        update_status(`Executing ${name}...`, true);
        try {
          const result = await Run.run_js(tool.impl, args);
          notify(
            `Tool ${name} executed. Result: ${Utils.stringify(result)}`,
            "info",
            8000
          );
          update_status("Idle");
        } catch (err) {
          notify(`Tool ${name} exec failed: ${err.message}`, "error");
          update_status(`Exec failed`, false, true);
        }
      } else {
        notify(`Could not find JS for ${name}.`, "error");
      }
    });

    ui.app?.addEventListener("show-wc", (e) => {
      const { tool_id, wc_code, mcp } = e.detail;
      let code_to_load = wc_code;
      let mcp_def = mcp;

      // If code/mcp not directly passed (e.g., from approved card), fetch them
      if (!code_to_load || !mcp_def) {
        const tool_data =
          State.get_tool(tool_id) ||
          State.get_pending().find((p) => p.temp_id === tool_id);
        if (!code_to_load && tool_data?.wc_ref) {
          code_to_load = storage.get_artifact(`${tool_id}.wc.js`);
        } else if (!code_to_load && tool_data?.wc) {
          code_to_load = tool_data.wc; // Pending might have code directly
        }
        if (!mcp_def) {
          mcp_def = tool_data?.mcp;
        }
      }

      if (code_to_load && mcp_def) {
        load_and_show_wc(tool_id, code_to_load, mcp_def);
      } else {
        notify(`Could not load WC code or MCP for ${tool_id}`, "error");
      }
    });

    ui.closePreviewBtn?.addEventListener("click", () => {
      // Clean up focus trap
      if (removeFocusTrap) {
        removeFocusTrap();
        removeFocusTrap = null;
      }

      ui.previewSection?.classList.add("hidden");
      ui.previewSection?.removeAttribute('role');
      ui.previewSection?.removeAttribute('aria-modal');
      ui.previewSection?.removeAttribute('aria-label');
      if (ui.previewArea) ui.previewArea.innerHTML = "";

      // Restore focus to previously focused element
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
        previouslyFocusedElement = null;
      }
    });

    ui.app?.addEventListener("delete-tool", (e) => {
      const { tool_id, name } = e.detail;
      if (confirm(`Delete tool "${name}" (${tool_id})?`)) {
        try {
          // Delete artifacts first
          storage.delete_artifact(`${tool_id}.mcp.json`);
          storage.delete_artifact(`${tool_id}.impl.js`);
          storage.delete_artifact(`${tool_id}.wc.js`);
          // Then delete from state
          if (State.delete_tool(tool_id)) {
            notify(`Tool "${name}" deleted.`, "success");
            render_library();
            update_storage_usage();
          } else {
            notify(`Failed delete tool "${name}" state.`, "error");
          }
        } catch (err) {
          notify(`Error deleting: ${err.message}`, "error");
          log.error(`Delete error ${tool_id}`, err);
        }
      }
    });

    // Add listener for pending card selection (using event delegation on the list)
    ui.pendingList?.addEventListener("click", (e) => {
      const card = e.target.closest("tool-card");
      if (card && card.classList.contains("status-pending")) {
        // Ensure it's a pending card
        const id = card.get_id(); // Use method on card to get its ID
        if (id && State.get_pending().some((p) => p.temp_id === id)) {
          selected_pending_id = id;
          render_pending(); // Re-render to update selection style visually
        }
      }
    });
  };

  // Initialize the UI Manager
  const init = async () => {
    log.info("Initializing UiManager...");
    try {
      const res = await fetch("ui_body.html"); // Use snake_case name
      if (!res.ok) throw new Error(`Fetch ui_body.html failed: ${res.status}`);
      const html = await res.text();
      const app_root = Utils.id("app");
      if (app_root) app_root.innerHTML = html;
      else throw new Error("App root #app not found");
      ui = get_ui_refs(); // Get refs after loading body
    } catch (e) {
      log.error("Failed loading UI body", e);
      document.body.innerHTML = `<div style='color:red'><h1>UI Load Error</h1><p>${e.message}</p></div>`;
      return; // Stop initialization if UI fails
    }

    // Ensure custom element is defined (idempotent)
    if (!customElements.get("tool-card")) {
      customElements.define("tool-card", ToolCard);
    }

    // Set initial UI state from config/state
    if (ui.version) ui.version.textContent = cfg.version;
    if (ui.manualVersionsCount)
      ui.manualVersionsCount.textContent = cfg.manualModeVersions;

    const session = State.get_session();
    if (ui.apiKey) ui.apiKey.value = session.apiKey || "";
    if (ui.modelSelect) {
      const currentModel = session.model || cfg.model;
      ui.modelSelect.value = currentModel;
      if (ui.modelSelect.value !== currentModel) {
        // Value not in list; add custom option
        const opt = document.createElement('option');
        opt.value = currentModel;
        opt.textContent = `${currentModel} (custom)`;
        ui.modelSelect.appendChild(opt);
        ui.modelSelect.value = currentModel;
      }
      cfg.model = currentModel;
    }
    ui.genModeRadios?.forEach((r) => (r.checked = r.value === session.mode));
    ui.contOpts?.classList.toggle("hidden", session.mode !== "continuous");
    if (ui.contLimit)
      ui.contLimit.value =
        session.continuousLimit || cfg.continuousModeDefaultIterations;

    update_storage_usage();
    render_library();
    render_pending(); // Render initially (likely empty)
    setup_listeners();
    update_status("Initialized");
    log.info("UiManager initialized.");
  };

  return {
    init,
    notify,
    update_status,
    render_library,
    update_storage_usage,
    render_pending,
  };
};
export default UiManager;
