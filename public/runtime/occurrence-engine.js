(function attachAutonomyOccurrenceEngine(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyOccurrences = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyOccurrenceEngineModule() {
  const EFFECT_TYPES = Object.freeze(['signal_state', 'actor_active', 'blocked_segment', 'annotation']);

  function createOccurrenceEngine(catalog, additionalPlugins = []) {
    const registry = new Map();
    [...defaultPlugins(), ...additionalPlugins].forEach((plugin) => registerPlugin(registry, plugin));
    validateCatalog(catalog, registry);
    const orderedPatterns = [...catalog.patterns].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
    const controlledActorIds = [...new Set(orderedPatterns.filter((row) => row.effect.type === 'actor_active').map((row) => row.effect.targetId))].sort();

    function evaluate({ tick, events }) {
      const evaluations = orderedPatterns.map((pattern) => {
        const plugin = registry.get(pattern.pluginId);
        const result = plugin.evaluate({ pattern, tick, events });
        return {
          patternId: pattern.id,
          pluginId: pattern.pluginId,
          priority: pattern.priority,
          active: Boolean(result.active),
          phase: result.phase || null,
          triggerEvidence: result.triggerEvidence || null,
          effect: result.active ? resolveEffect(pattern.effect, result) : null,
        };
      });
      const resolution = resolveEffects(evaluations.filter((row) => row.active));
      resolution.effects.controlledActorIds = controlledActorIds;
      return {
        schema: 'simulatte.autonomyOccurrenceReceipt.v1',
        catalogId: catalog.id,
        tick,
        eventCount: events.length,
        activePatternIds: evaluations.filter((row) => row.active).map((row) => row.patternId),
        evaluations,
        effects: resolution.effects,
        conflicts: resolution.conflicts,
        resolutionRule: 'priority_descending_then_pattern_id_ascending',
      };
    }

    return { schema: 'simulatte.autonomyOccurrenceEngine.v1', catalog, evaluate, pluginIds: [...registry.keys()].sort() };
  }

  function defaultPlugins() {
    return [
      {
        id: 'time.periodic-phase.v1',
        evaluate({ pattern, tick }) {
          const cycleTicks = pattern.trigger.phases.reduce((sum, row) => sum + row.durationTicks, 0);
          let cursor = modulo(tick + pattern.trigger.phaseOffsetTicks, cycleTicks);
          for (const phase of pattern.trigger.phases) {
            if (cursor < phase.durationTicks) {
              return { active: true, phase: phase.id, value: phase.value, triggerEvidence: { tick, cycleTicks, cyclePosition: cursor } };
            }
            cursor -= phase.durationTicks;
          }
          return { active: false };
        },
      },
      {
        id: 'time.window.v1',
        evaluate({ pattern, tick }) {
          const active = tick >= pattern.trigger.startTick && tick <= pattern.trigger.endTickInclusive;
          const span = Math.max(1, pattern.trigger.endTickInclusive - pattern.trigger.startTick);
          const progress = clamp((tick - pattern.trigger.startTick) / span, 0, 1);
          return { active, progress, phase: active ? 'inside_window' : 'outside_window', triggerEvidence: { tick, startTick: pattern.trigger.startTick, endTickInclusive: pattern.trigger.endTickInclusive } };
        },
      },
      {
        id: 'event.window.v1',
        evaluate({ pattern, tick, events }) {
          const matching = events.filter((event) => event.kind === pattern.trigger.eventKind && (!pattern.trigger.sourceId || event.sourceId === pattern.trigger.sourceId))
            .sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id));
          const activation = matching[pattern.trigger.occurrenceIndex || 0];
          if (!activation) return { active: false, phase: 'waiting_for_event', triggerEvidence: { eventKind: pattern.trigger.eventKind, sourceId: pattern.trigger.sourceId || null } };
          const startTick = activation.tick + (pattern.trigger.delayTicks || 0);
          const endTickInclusive = startTick + pattern.trigger.durationTicks - 1;
          return {
            active: tick >= startTick && tick <= endTickInclusive,
            progress: clamp((tick - startTick) / Math.max(1, endTickInclusive - startTick), 0, 1),
            phase: tick < startTick ? 'delay' : tick <= endTickInclusive ? 'event_window' : 'expired',
            triggerEvidence: { eventId: activation.id, eventTick: activation.tick, startTick, endTickInclusive },
          };
        },
      },
    ];
  }

  function registerPlugin(registry, plugin) {
    if (!plugin || typeof plugin.id !== 'string' || typeof plugin.evaluate !== 'function') {
      throw occurrenceError('occurrence_plugin_invalid', 'Occurrence plugin expected an id and evaluate function');
    }
    if (registry.has(plugin.id)) throw occurrenceError('occurrence_plugin_duplicate', `Occurrence plugin ${plugin.id} is already registered`);
    registry.set(plugin.id, plugin);
  }

  function validateCatalog(catalog, registry = new Map(defaultPlugins().map((row) => [row.id, row]))) {
    if (!catalog || catalog.schema !== 'simulatte.autonomyOccurrenceCatalog.v1') {
      throw occurrenceError('occurrence_catalog_invalid', `Expected simulatte.autonomyOccurrenceCatalog.v1, received ${catalog && catalog.schema || 'missing'}`);
    }
    if (!Array.isArray(catalog.patterns) || !catalog.patterns.length) throw occurrenceError('occurrence_patterns_missing', 'Occurrence catalog expected at least one pattern');
    const ids = new Set();
    catalog.patterns.forEach((pattern, index) => {
      if (!pattern || typeof pattern.id !== 'string' || ids.has(pattern.id)) throw occurrenceError('occurrence_pattern_id_invalid', `Pattern ${index} expected a unique id`);
      ids.add(pattern.id);
      if (!registry.has(pattern.pluginId)) throw occurrenceError('occurrence_plugin_unknown', `Pattern ${pattern.id} references unregistered plugin ${pattern.pluginId}`);
      if (!Number.isInteger(pattern.priority)) throw occurrenceError('occurrence_priority_invalid', `Pattern ${pattern.id} priority expected an integer`);
      if (!pattern.trigger || typeof pattern.trigger !== 'object') throw occurrenceError('occurrence_trigger_invalid', `Pattern ${pattern.id} expected a trigger object`);
      if (!pattern.effect || !EFFECT_TYPES.includes(pattern.effect.type)) throw occurrenceError('occurrence_effect_invalid', `Pattern ${pattern.id} effect expected ${EFFECT_TYPES.join(', ')}`);
      validateTrigger(pattern);
    });
    return catalog;
  }

  function validateTrigger(pattern) {
    const trigger = pattern.trigger;
    if (pattern.pluginId === 'time.periodic-phase.v1') {
      if (!Number.isInteger(trigger.phaseOffsetTicks) || !Array.isArray(trigger.phases) || trigger.phases.length < 2 || trigger.phases.some((row) => !row.id || !Number.isInteger(row.durationTicks) || row.durationTicks < 1 || typeof row.value !== 'string')) {
        throw occurrenceError('occurrence_periodic_trigger_invalid', `Pattern ${pattern.id} has an invalid periodic phase trigger`);
      }
    }
    if (pattern.pluginId === 'time.window.v1' && (!Number.isInteger(trigger.startTick) || !Number.isInteger(trigger.endTickInclusive) || trigger.endTickInclusive < trigger.startTick)) {
      throw occurrenceError('occurrence_time_window_invalid', `Pattern ${pattern.id} has an invalid time window`);
    }
    if (pattern.pluginId === 'event.window.v1' && (typeof trigger.eventKind !== 'string' || !Number.isInteger(trigger.durationTicks) || trigger.durationTicks < 1)) {
      throw occurrenceError('occurrence_event_window_invalid', `Pattern ${pattern.id} has an invalid event window`);
    }
  }

  function resolveEffect(effect, pluginResult) {
    const value = effect.valueSource === 'phase' ? pluginResult.value : effect.value;
    return {
      type: effect.type,
      targetId: effect.targetId || null,
      value: value === undefined ? true : value,
      progress: Number.isFinite(pluginResult.progress) ? pluginResult.progress : null,
      metadata: effect.metadata || null,
    };
  }

  function resolveEffects(activeRows) {
    const effects = { signalStates: [], actorStates: [], activeActorIds: [], controlledActorIds: [], blockedSegmentIds: [], annotations: [] };
    const conflicts = [];
    const singletonKeys = new Map();
    activeRows.forEach((row) => {
      const effect = row.effect;
      if (effect.type === 'signal_state') {
        const key = `${effect.type}:${effect.targetId}`;
        if (singletonKeys.has(key)) {
          conflicts.push({ key, winnerPatternId: singletonKeys.get(key), rejectedPatternId: row.patternId });
          return;
        }
        singletonKeys.set(key, row.patternId);
        effects.signalStates.push({ signalId: effect.targetId, state: effect.value, patternId: row.patternId });
      } else if (effect.type === 'actor_active') {
        const key = `${effect.type}:${effect.targetId}`;
        if (singletonKeys.has(key)) {
          conflicts.push({ key, winnerPatternId: singletonKeys.get(key), rejectedPatternId: row.patternId });
          return;
        }
        singletonKeys.set(key, row.patternId);
        effects.activeActorIds.push(effect.targetId);
        effects.controlledActorIds.push(effect.targetId);
        effects.actorStates.push({ actorId: effect.targetId, progress: effect.progress, patternId: row.patternId });
      } else if (effect.type === 'blocked_segment') effects.blockedSegmentIds.push(effect.targetId);
      else if (effect.type === 'annotation') effects.annotations.push({ id: row.patternId, label: String(effect.value), metadata: effect.metadata });
    });
    ['activeActorIds', 'controlledActorIds', 'blockedSegmentIds'].forEach((key) => { effects[key] = [...new Set(effects[key])].sort(); });
    effects.signalStates.sort((left, right) => left.signalId.localeCompare(right.signalId));
    effects.actorStates.sort((left, right) => left.actorId.localeCompare(right.actorId) || left.patternId.localeCompare(right.patternId));
    effects.annotations.sort((left, right) => left.id.localeCompare(right.id));
    return { effects, conflicts };
  }

  function eventRow({ tick, kind, sourceId = null, evidence = null, sequence = 0 }) {
    return { schema: 'simulatte.autonomyEvent.v1', id: `event:${tick}:${sequence}:${kind}:${sourceId || 'none'}`, tick, kind, sourceId, evidence };
  }

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function occurrenceError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyOccurrenceError';
    error.code = code;
    return error;
  }

  return { EFFECT_TYPES, createOccurrenceEngine, defaultPlugins, eventRow, registerPlugin, resolveEffects, validateCatalog };
});
