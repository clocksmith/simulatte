(function attachSimulatteSceneAnimation(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function scenePacketAnimation({ layerSlot, entity = null, field = null, process = null, motion = null, text = '', index = 0 }) {
      const value = `${layerSlot || ''} ${text || ''}`.toLowerCase();
      const behaviorProcesses = ((entity && entity.behavior && entity.behavior.processes) || [])
        .map((processName) => String(processName).toLowerCase());
      const behaviorEvidence = [
        ...((entity && entity.behavior && entity.behavior.sourceEvidence) || []),
        ...behaviorProcesses,
      ].join(' ').toLowerCase();
      const behaviorRoles = (entity && entity.behavior && entity.behavior.roles || [])
        .map((role) => String(role).toLowerCase());
      const actionOwnedByEntity = !behaviorRoles.length || behaviorRoles.includes('agent');
      const pose = String(entity && entity.poseHint && entity.poseHint.pose || '').toLowerCase();
      const promptIdentity = entity && (entity.directlyGrounded === true || entity.visualArchetype ||
        /^prompt\./.test(String(entity.semanticRef || entity.physicalRef || '')));
      const promptOwnedLayer = promptOwnedLayerSlotForEntity(entity);
      const naturallyDynamicMedium = promptOwnedLayer
        ? /water-volume|flow-field/.test(promptOwnedLayer)
        : /water-volume|watershed|ocean|river|fluid/.test(value);
      const atlasMotionKind = scenePacketAtlasMotionKind(motion, process);
      const responsiveBehavior = behaviorRoles.includes('medium') &&
        /oscillation|wave|flow|advection|rotation|growth|fracture|collision/.test(behaviorProcesses.join(' '));
      const explicitMotionBehavior = Boolean(pose) || responsiveBehavior ||
        scenePacketMotionHasGroundedOwnership(motion) || actionOwnedByEntity &&
          /action:(?!coexists\b)[a-z0-9-]+|swim|fluid_locomotion|flow|orbit|fly|flight|run|play|rotate|spin|fall|grow|pulse|crash|collid/.test(behaviorEvidence);
      const staticPromptObject = promptIdentity && !naturallyDynamicMedium && !explicitMotionBehavior;
      let kind = 'state-pulse';
      const stateBinding = 'simulation-time';
      if (staticPromptObject) kind = 'static-pose';
      else if (pose === 'play-interaction') kind = 'play-loop';
      else if (pose === 'grasp-hold') kind = 'hold-pose';
      else if (/swim[-_ ]?cycle|swimming[-_ ]?pose|swim[-_ ]?stroke|fluid_locomotion/.test(value)) kind = 'swim-cycle';
      else if (/biological-agent/.test(value) && /water|swim|fluid|watershed|ocean/.test(value)) kind = 'swim-cycle';
      else if (pose === 'flight-extended' || actionOwnedByEntity && /action:(?:fly|flies|flying)\b/.test(behaviorEvidence)) kind = 'flight-path';
      else if (atlasMotionKind) kind = atlasMotionKind;
      else if (/water-volume|flow-field|fluid|advection|streamline|ripple|velocity/.test(value)) kind = 'flow-ripple';
      else if (/detector|track-line|particle/.test(value)) kind = 'particle-track';
      else if (/readout|measurement|telemetry/.test(value)) kind = 'readout-pulse';
      else if (/node-graph|network-flow|queue|packet|route/.test(value)) kind = 'packet-flow';
      else if (/organic-matrix|bubble-volume|fermentation|gas|dough|gluten/.test(value)) kind = 'fermentation-rise';
      else if (/thermal|fire|plume|smoke|combust/.test(value)) kind = 'plume-rise';
      else if (/orbital|orbit|gravity|planet/.test(value)) kind = 'orbital-drift';
      const speedSource = kind === 'flight-path'
        ? animationSpeedForKind(kind)
        : motion && motion.speed || process && process.speed || field && field.speed;
      const speed = Number.isFinite(Number(speedSource)) ? Number(speedSource) : animationSpeedForKind(kind);
      return {
        kind,
        stateBinding,
        speed,
        amplitude: animationAmplitudeForKind(kind),
        phase: Number(((index % 17) / 17).toFixed(3)),
        affects: uniqueList([
          entity && entity.id,
          field && field.id,
          process && process.id,
          motion && motion.processId,
        ].filter(Boolean)),
      };
    }

    function scenePacketMotionHasGroundedOwnership(motion = null) {
      return Boolean(motion && (motion.evidence || []).some((entry) => (
        /^causal-affordance:|^prompt-(?:clause|relation):/.test(String(entry || ''))
      )));
    }

    function scenePacketAtlasMotionKind(motion = null, process = null) {
      const text = [
        motion && motion.grammar,
        motion && motion.motion,
        motion && motion.atomId,
        process && process.motion,
        process && process.family,
        process && process.operator,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!text || /state-pulse-overlay|bounded-state-pulses/.test(text)) return '';
      if (/streamline-advection|phase-propagating-arcs|packet-or-agent-pulses|branching-front-expansion|impulse-and-contact-ghosts|curling-vector-flux|settling-and-shear-bands|rising-plume-and-isobands/.test(text)) {
        return text.split(/\s+/)[0].replace(/[^a-z0-9-]+/g, '-');
      }
      return '';
    }

    function animationSpeedForKind(kind) {
      if (kind === 'flight-path') return 0.62;
      if (kind === 'play-loop') return 0.56;
      if (kind === 'particle-track' || kind === 'packet-flow') return 0.74;
      if (kind === 'swim-cycle' || kind === 'flow-ripple') return 0.48;
      if (kind === 'fermentation-rise' || kind === 'orbital-drift') return 0.24;
      if (kind === 'plume-rise') return 0.58;
      return 0.34;
    }

    function animationAmplitudeForKind(kind) {
      if (kind === 'flight-path') return 0.07;
      if (kind === 'play-loop') return 0.035;
      if (kind === 'swim-cycle') return 0.055;
      if (kind === 'flow-ripple') return 0.04;
      if (kind === 'packet-flow' || kind === 'particle-track') return 0.08;
      if (kind === 'fermentation-rise') return 0.05;
      if (kind === 'plume-rise') return 0.075;
      return 0.035;
    }

    Object.assign(scope, {
      scenePacketAnimation,
      animationSpeedForKind,
      animationAmplitudeForKind,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
