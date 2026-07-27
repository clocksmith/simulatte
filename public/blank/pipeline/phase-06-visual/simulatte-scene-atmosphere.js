(function attachSimulatteSceneAtmosphere(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');

  const ATMOSPHERE_MOTIFS = Object.freeze({
    thermal: 'heat-ribbons',
    water: 'layered-caustics',
    mechanical: 'architectural-horizon',
    magnetic: 'field-aurora',
    optical: 'prismatic-bloom',
    acoustic: 'concentric-wavefronts',
    biological: 'floating-organic-motes',
    chemical: 'reaction-bubbles',
    orbital: 'nebula-starfield',
    network: 'pulsed-node-grid',
    energy: 'luminous-aurora',
    robotic: 'machine-scan-horizon',
    granular: 'suspended-dust',
    instrument: 'measurement-scan',
    phase: 'faceted-boundary',
    hazard: 'embers-and-warning-glow',
  });

  function scenePacketAtmosphereProgram(sceneMix = []) {
    const slots = scope.SCENE_MIX_SLOTS || [];
    const layers = slots.map((slot, index) => ({
      id: `atmosphere:${slot}`,
      slot,
      motif: ATMOSPHERE_MOTIFS[slot] || 'ambient-gradient',
      intensity: Number(Number(sceneMix[index] || 0).toFixed(4)),
    })).filter((row) => row.intensity >= 0.08)
      .sort((left, right) => right.intensity - left.intensity || left.slot.localeCompare(right.slot))
      .slice(0, 8);
    return {
      schema: 'simulatte.sceneAtmosphereProgram.v1',
      compiler: 'phase6-scene-mix-atmosphere',
      source: 'sceneRenderPacket.uniforms.sceneMix',
      dominantSlot: layers[0] && layers[0].slot || 'ambient',
      layers,
      layerCount: layers.length,
      boundedSlotCount: slots.length,
      complexity: `O(${slots.length})`,
    };
  }

  root.SimulattePhaseModuleRegistry.define(
    'compositionGraph',
    'simulatte-scene-atmosphere.js',
    {
      ATMOSPHERE_MOTIFS,
      scenePacketAtmosphereProgram,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
