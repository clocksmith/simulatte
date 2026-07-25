(function attachSimulatteScenePacketContract(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteScenePacketContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createScenePacketContract() {
  const DEFAULT_SCENE_ID = 3;
  const SCENE_IDS = Object.freeze({
    'thermal-plume': 0,
    fire: 33,
    'weather-atmosphere': 1,
    watershed: 2,
    ocean: 23,
    'mechanical-fluid': 3,
    mechanical: 3,
    'structural-mechanics': 24,
    ferrofluid: 4,
    'magnetic-machine': 4,
    optics: 5,
    'optics-thermal': 5,
    'thin-film': 34,
    acoustic: 6,
    biology: 7,
    ecology: 25,
    'evolution-ecology': 25,
    'restoration-water': 26,
    'agro-waste-loop': 20,
    'chemistry-lab': 8,
    'material-tray': 35,
    cryosphere: 27,
    'ocean-cryosphere': 27,
    'planetary-space': 10,
    'digital-network': 11,
    city: 28,
    'civic-market': 29,
    'venue-crowd': 30,
    'advanced-energy': 12,
    'grid-energy': 16,
    'molecular-biology': 13,
    'clinical-control': 14,
    'particle-instrument': 15,
    'quantum-instrument': 19,
    atomic: 19,
    'robotics-control': 17,
    'manufacturing-line': 18,
    granular: 22,
    'sport-motion': 21,
    'cultural-material': 36,
    'hazard-atmosphere': 31,
    'space-instrument': 32,
  });
  const SCENE_MIX_SLOTS = Object.freeze([
    'thermal',
    'water',
    'mechanical',
    'magnetic',
    'optical',
    'acoustic',
    'biological',
    'chemical',
    'orbital',
    'network',
    'energy',
    'robotic',
    'granular',
    'instrument',
    'phase',
    'hazard',
  ]);
  const VISUAL_IR_LAYER_SLOTS = Object.freeze([
    'biological-agent',
    'water-volume',
    'detector-geometry',
    'node-graph',
    'readout-panel',
    'track-line',
    'field-sheet',
    'flow-field',
    'thermal-field',
    'optical-field',
    'network-flow',
    'material-surface',
    'organic-matrix',
    'bubble-volume',
    'constraint-surface',
    'causal-affordance',
    'process-pulse',
    'particle-swarm',
    'robot-armature',
    'granular-strata',
    'orbital-body',
    'acoustic-waveguide',
    'chemical-front',
    'phase-boundary',
  ]);
  const LAYER_SCENE_MIX = Object.freeze({
    'biological-agent': ['biological', 0.72],
    'organic-matrix': ['biological', 0.72],
    'water-volume': ['water', 0.64],
    'flow-field': ['water', 0.64],
    'bubble-volume': ['water', 0.64],
    'detector-geometry': ['instrument', 0.72],
    'readout-panel': ['instrument', 0.72],
    'track-line': ['instrument', 0.72],
    'node-graph': ['network', 0.72],
    'network-flow': ['network', 0.72],
    'thermal-field': ['thermal', 0.7],
    'optical-field': ['optical', 0.68],
    'chemical-front': ['chemical', 0.66],
    'robot-armature': ['robotic', 0.68],
    'granular-strata': ['granular', 0.66],
    'orbital-body': ['orbital', 0.68],
    'acoustic-waveguide': ['acoustic', 0.68],
    'phase-boundary': ['phase', 0.64],
    'particle-swarm': ['instrument', 0.38],
  });

  function scenePacketSceneId(sceneKind = '') {
    return SCENE_IDS[String(sceneKind || '')] ?? DEFAULT_SCENE_ID;
  }

  function scenePacketAddSceneKindMix(vector, sceneKind, strength = 0.32) {
    const value = String(sceneKind || '').toLowerCase();
    if (!value) return;
    const add = (slot, amount = strength) => scenePacketAddSlot(vector, slot, amount);
    if (/thermal|fire|plume|weather/.test(value)) add('thermal');
    if (/watershed|ocean|fluid|restoration|cryosphere/.test(value)) add('water');
    if (/mechanical|structural|sport/.test(value)) add('mechanical');
    if (/magnetic|ferrofluid/.test(value)) add('magnetic');
    if (/optics|thin-film|quantum/.test(value)) add('optical');
    if (/acoustic/.test(value)) add('acoustic');
    if (/biology|ecology|clinical|agro|molecular/.test(value)) add('biological');
    if (/chemistry|material|cultural/.test(value)) add('chemical');
    if (/planetary|space|atomic/.test(value)) add('orbital');
    if (/digital|city|civic|venue|network|grid/.test(value)) add('network');
    if (/energy|grid|advanced|plasma/.test(value)) add('energy');
    if (/robot|manufacturing|factory/.test(value)) add('robotic');
    if (/granular/.test(value)) add('granular');
    if (/instrument|particle|detector/.test(value)) add('instrument');
    if (/phase|thin-film|cryosphere/.test(value)) add('phase', strength * 0.8);
    if (/hazard|storm|wildfire|tsunami|earthquake/.test(value)) add('hazard');
  }

  function scenePacketAddLayerSceneMix(vector, layerSlot = '', categoryCode = 0) {
    const add = (slot, value) => scenePacketAddSlot(vector, slot, value);
    const layer = LAYER_SCENE_MIX[String(layerSlot || '')];
    if (layer) add(layer[0], layer[1]);
    if (categoryCode === 5) add('instrument', 0.32);
    if (categoryCode === 6) add('network', 0.32);
    if (categoryCode === 9) add('biological', 0.32);
  }

  function scenePacketAddSlot(vector, slot, value) {
    const index = SCENE_MIX_SLOTS.indexOf(slot);
    if (index < 0) return;
    vector[index] = clamp01(Number(vector[index] || 0) + Number(value || 0));
  }

  function scenePacketCompressVector(input, threshold = 0.035, maxSlots = 12) {
    const ranked = Array.from(input || [], (value, index) => ({
      index,
      value: clamp01(Number(value || 0)),
    })).sort((a, b) => b.value - a.value || a.index - b.index);
    const out = new Array((input || []).length).fill(0);
    ranked.slice(0, maxSlots).forEach((entry, rank) => {
      if (entry.value < threshold) return;
      const gain = rank === 0 ? 1 : rank < 4 ? 0.92 : rank < 8 ? 0.76 : 0.54;
      out[entry.index] = Number(clamp01(entry.value * gain).toFixed(4));
    });
    return out;
  }

  function activeSceneMixSlots(vector, threshold = 0.035) {
    return Array.from(vector || []).filter((value) => Number(value) >= threshold).length;
  }

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  return Object.freeze({
    DEFAULT_SCENE_ID,
    SCENE_IDS,
    SCENE_MIX_SLOTS,
    VISUAL_IR_LAYER_SLOTS,
    LAYER_SCENE_MIX,
    scenePacketSceneId,
    scenePacketAddSceneKindMix,
    scenePacketAddLayerSceneMix,
    scenePacketAddSlot,
    scenePacketCompressVector,
    activeSceneMixSlots,
  });
});
