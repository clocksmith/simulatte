(function attachSimulatteWorldInteractionRuntime(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldInteractionRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldInteractionRuntimeApi() {
  function connect(canvas, options = {}) {
    if (!canvas || typeof canvas.addEventListener !== 'function') return null;
    const renderer = options.renderer || null;
    const enqueueCommand = typeof options.enqueueCommand === 'function'
      ? options.enqueueCommand
      : () => {};
    const getProgram = typeof options.getProgram === 'function'
      ? options.getProgram
      : () => null;
    let sequence = 0;
    let selectedTargetId = '';
    let selectedCapabilities = [];
    let hoveredTargetId = '';
    let grabbedTargetId = '';
    let pointerId = null;
    let previousPoint = [0.5, 0.5];
    const removers = [];

    canvas.tabIndex = Number.isInteger(Number(canvas.tabIndex)) && Number(canvas.tabIndex) >= 0
      ? Number(canvas.tabIndex)
      : 0;
    canvas.dataset.interactionRuntime = 'deterministic-command-queue';
    canvas.dataset.interactionSelectedTarget = '';
    canvas.dataset.interactionHoveredTarget = '';
    canvas.dataset.interactionGrabbedTarget = '';
    canvas.dataset.interactionSequence = '0';

    on('pointerdown', (event) => {
      const hit = pick(event);
      previousPoint = pointForEvent(event, canvas);
      if (!hit.targetId) {
        dispatchAction('clear-selection', '', event, { point: previousPoint });
        selectedTargetId = '';
        selectedCapabilities = [];
        hoveredTargetId = '';
        grabbedTargetId = '';
        pointerId = null;
        syncDataset();
        prevent(event);
        return;
      }
      if (typeof canvas.focus === 'function') canvas.focus({ preventScroll: true });
      selectedTargetId = hit.targetId;
      selectedCapabilities = hit.capabilities.slice();
      grabbedTargetId = hit.capabilities.includes('drag') ? hit.targetId : '';
      pointerId = event.pointerId;
      if (grabbedTargetId && typeof canvas.setPointerCapture === 'function') {
        canvas.setPointerCapture(event.pointerId);
      }
      dispatchBindings('pointerdown', event, hit.targetId, {
        point: previousPoint,
        capabilities: hit.capabilities,
      });
      syncDataset();
      prevent(event);
    });

    on('pointermove', (event) => {
      const point = pointForEvent(event, canvas);
      const delta = [point[0] - previousPoint[0], point[1] - previousPoint[1]];
      if (grabbedTargetId && (pointerId == null || pointerId === event.pointerId)) {
        dispatchBindings('pointerdrag', event, grabbedTargetId, { point, delta });
        previousPoint = point;
        prevent(event);
        return;
      }
      const hit = pick(event);
      if (hit.targetId && hit.targetId !== hoveredTargetId) {
        hoveredTargetId = hit.targetId;
        dispatchBindings('pointermove', event, hit.targetId, {
          point,
          capabilities: hit.capabilities,
        });
        syncDataset();
      } else if (!hit.targetId && hoveredTargetId) {
        dispatchAction('clear-hover', '', event, { point });
        hoveredTargetId = '';
        syncDataset();
      }
      previousPoint = point;
    });

    on('pointerup', (event) => {
      const point = pointForEvent(event, canvas);
      const targetId = grabbedTargetId;
      if (targetId) dispatchBindings('pointerup', event, targetId, { point });
      if (pointerId != null && typeof canvas.releasePointerCapture === 'function') {
        try {
          canvas.releasePointerCapture(pointerId);
        } catch (_error) {
          // Pointer capture may already have been released by the browser.
        }
      }
      pointerId = null;
      grabbedTargetId = '';
      previousPoint = point;
      syncDataset();
      prevent(event);
    });

    on('pointercancel', (event) => {
      if (grabbedTargetId) dispatchAction('release', grabbedTargetId, event, {
        point: pointForEvent(event, canvas),
      });
      pointerId = null;
      grabbedTargetId = '';
      syncDataset();
    });

    on('pointerleave', (event) => {
      if (hoveredTargetId) dispatchAction('clear-hover', '', event, { point: previousPoint });
      hoveredTargetId = '';
      syncDataset();
    });

    on('wheel', (event) => {
      if (!selectedTargetId) return;
      dispatchBindings('wheel', event, selectedTargetId, {
        point: pointForEvent(event, canvas),
        value: Math.sign(Number(event.deltaY || 0)),
        capabilities: selectedCapabilities,
      });
      prevent(event);
    }, { passive: false });

    on('keydown', (event) => {
      const rows = matchingBindings(getProgram(), {
        device: 'keyboard',
        event: 'keydown',
        code: event.code,
      });
      if (!rows.length) return;
      for (const row of rows) {
        const targetId = row.actionId === 'clear-selection' ? '' : selectedTargetId;
        if (!targetId && row.actionId !== 'clear-selection') continue;
        if (targetId && !bindingSupported(row, selectedCapabilities, getProgram())) continue;
        enqueue(row, targetId, {
          source: 'keyboard',
          point: previousPoint,
          delta: row.vector || [0, 0],
        });
        if (row.actionId === 'clear-selection') {
          selectedTargetId = '';
          selectedCapabilities = [];
          grabbedTargetId = '';
          hoveredTargetId = '';
        }
      }
      syncDataset();
      prevent(event);
    });

    function on(type, listener, eventOptions) {
      canvas.addEventListener(type, listener, eventOptions);
      removers.push(() => canvas.removeEventListener(type, listener, eventOptions));
    }

    function pick(event) {
      if (renderer && typeof renderer.pick === 'function') {
        return renderer.pick(event.clientX, event.clientY);
      }
      return {
        schema: 'simulatte.phase7HitTestReceipt.v1',
        hit: false,
        targetId: '',
        capabilities: [],
      };
    }

    function dispatchBindings(eventName, event, targetId, values = {}) {
      const rows = matchingBindings(getProgram(), {
        device: 'pointer',
        event: eventName,
        button: Number(event.button || 0),
      });
      for (const row of rows) {
        if (values.capabilities && !bindingSupported(row, values.capabilities, getProgram())) continue;
        enqueue(row, targetId, { source: 'pointer', ...values });
      }
    }

    function dispatchAction(actionId, targetId, event, values = {}) {
      const binding = {
        id: `runtime:${actionId}`,
        actionId,
        device: event && event.type && event.type.startsWith('key') ? 'keyboard' : 'pointer',
      };
      enqueue(binding, targetId, values);
    }

    function enqueue(row, targetId, values = {}) {
      sequence += 1;
      enqueueCommand(commandForBinding(row, targetId, {
        sequence,
        ...values,
      }));
    }

    function syncDataset() {
      canvas.dataset.interactionSelectedTarget = selectedTargetId;
      canvas.dataset.interactionHoveredTarget = hoveredTargetId;
      canvas.dataset.interactionGrabbedTarget = grabbedTargetId;
      canvas.dataset.interactionSequence = String(sequence);
    }

    return {
      schema: 'simulatte.worldInteractionRuntime.v1',
      reset() {
        if (pointerId != null && typeof canvas.releasePointerCapture === 'function') {
          try {
            canvas.releasePointerCapture(pointerId);
          } catch (_error) {
            // The browser may already have ended pointer capture.
          }
        }
        sequence = 0;
        selectedTargetId = '';
        selectedCapabilities = [];
        hoveredTargetId = '';
        grabbedTargetId = '';
        pointerId = null;
        previousPoint = [0.5, 0.5];
        syncDataset();
      },
      destroy() {
        while (removers.length) removers.pop()();
        canvas.dataset.interactionRuntime = '';
      },
      selectedTargetId() {
        return selectedTargetId;
      },
    };
  }

  function matchingBindings(program = null, input = {}) {
    if (!program || !Array.isArray(program.bindings)) return [];
    return program.bindings.filter((row) => {
      if (row.device !== input.device || row.event !== input.event) return false;
      if (row.code && row.code !== input.code) return false;
      if (Number.isFinite(Number(row.button)) && Number(row.button) !== Number(input.button || 0)) return false;
      return true;
    });
  }

  function bindingSupported(binding, capabilities = [], program = null) {
    const action = program && Array.isArray(program.actions)
      ? program.actions.find((row) => row.id === binding.actionId)
      : null;
    return !action || !action.requiredCapability || capabilities.includes(action.requiredCapability);
  }

  function commandForBinding(binding = {}, targetId = '', values = {}) {
    const point = vector(values.point, [0.5, 0.5]);
    const delta = vector(values.delta || binding.vector, [0, 0]);
    return {
      schema: 'simulatte.interactionCommand.v1',
      sequence: Math.max(0, Math.floor(Number(values.sequence || 0))),
      actionId: String(binding.actionId || ''),
      targetId: String(targetId || ''),
      source: String(values.source || binding.device || 'runtime-input'),
      bindingId: String(binding.id || ''),
      point,
      delta,
      value: Number.isFinite(Number(values.value)) ? Number(values.value) : 0,
    };
  }

  function pointForEvent(event, canvas) {
    const rect = canvas && typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: 1, height: 1 };
    return [
      clamp((Number(event.clientX || 0) - Number(rect.left || 0)) / Math.max(1, Number(rect.width || 1))),
      clamp((Number(event.clientY || 0) - Number(rect.top || 0)) / Math.max(1, Number(rect.height || 1))),
    ];
  }

  function vector(value, fallback) {
    return Array.isArray(value)
      ? [finite(value[0], fallback[0]), finite(value[1], fallback[1])]
      : fallback.slice();
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, Number(value || 0)));
  }

  function prevent(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  return {
    connect,
    matchingBindings,
    bindingSupported,
    commandForBinding,
    pointForEvent,
  };
});
