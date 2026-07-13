(function attachSimulatteConstructionSubstrate(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteConstructionSubstrate = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createConstructionSubstrate() {
  const CONSTRUCTION_SUBSTRATE_SCHEMA = 'simulatte.constructionSubstrate.v1';

  const CONSTRUCTION_PART_ROLES = Object.freeze([
    role('core', ['body', 'core', 'torso', 'case', 'shell', 'hull', 'frame', 'mass', 'volume', 'chassis', 'facade'], 'ellipse'),
    role('head', ['head', 'cockpit', 'cab', 'cabin', 'control room'], 'ellipse'),
    role('support', ['leg', 'foot', 'feet', 'support', 'pillar', 'pier', 'column', 'stand', 'root', 'bridge'], 'capsule'),
    role('appendage', ['arm', 'limb', 'branch', 'cable', 'pipe', 'tail', 'neck', 'strand', 'rod', 'beam', 'spoke', 'tentacle', 'boom', 'handle', 'spout'], 'capsule'),
    role('joint', ['wheel', 'ring', 'orbit', 'joint', 'bearing', 'roller', 'loop', 'hub', 'axle'], 'ring'),
    role('panel', ['wing', 'leaf', 'fin', 'blade', 'petal', 'panel', 'deck', 'roof', 'screen', 'surface', 'plane', 'sail', 'membrane', 'page', 'cover'], 'triangle'),
    role('sensor', ['sensor', 'eye', 'lens', 'camera', 'antenna', 'node', 'knob', 'light', 'readout'], 'ellipse'),
    role('opening', ['door', 'window', 'opening', 'aperture', 'mouth', 'cavity', 'interior', 'gate', 'bucket'], 'rounded-box'),
    role('path', ['track', 'route', 'string', 'trace', 'vein', 'channel', 'rail', 'belt', 'seam'], 'capsule'),
    role('field', ['field', 'atmosphere', 'halo', 'plume', 'cloud', 'canopy', 'crown'], 'ellipse'),
    role('detail', ['surface', 'label', 'key', 'button', 'handle', 'spout', 'load', 'sample'], 'rounded-box'),
  ]);

  const CONSTRUCTION_TOPOLOGIES = Object.freeze([
    topology('cephalopod', ['ground.swimmer-body'], [
      node('core', 1), node('appendage', 8), node('sensor', 2),
    ], ['radial:appendage:core:below', 'attach:sensor:core:front'], [
      'octopus', 'squid', 'cephalopod', 'tentacle',
    ]),
    topology('resonant-instrument', ['ground.wave-event'], [
      node('core', 2), node('appendage', 1), node('path', 4), node('support', 1), node('detail', 2),
    ], ['stack:core', 'attach:appendage:core:end', 'parallel:path:core', 'attach:support:core:center'], [
      'resonant body', 'acoustic device', 'musical instrument', 'violin', 'guitar', 'string', 'membrane',
    ]),
    topology('architectural-enclosure', ['ground.infrastructure-system'], [
      node('core', 1), node('panel', 2), node('opening', 5), node('support', 2), node('detail', 2),
    ], ['attach:panel:core:top', 'grid:opening:core', 'mirror:support:core:below', 'attach:detail:core:front'], [
      'transparent shell', 'enclosure', 'greenhouse', 'hospital', 'building', 'house', 'warehouse',
      'office', 'school', 'architectural',
    ]),
    topology('heavy-equipment', ['ground.lifting-machine', 'ground.articulated-machine'], [
      node('core', 1), node('head', 1), node('path', 2), node('appendage', 3), node('joint', 3), node('opening', 1),
    ], ['parallel:path:core', 'attach:head:core:top', 'chain:appendage:core', 'pair:joint:appendage', 'attach:opening:appendage:end'], [
      'excavator', 'crane', 'lifting machine', 'boom cable', 'heavy equipment', 'bucket',
    ]),
    topology('layered-object', ['ground.membrane-structure', 'ground.flexible-cable'], [
      node('panel', 5), node('support', 1), node('detail', 2),
    ], ['stack:panel', 'attach:support:panel:side', 'attach:detail:panel:front'], [
      'sheet stack', 'layered material', 'pages', 'cover', 'book',
    ]),
    topology('quadruped', ['ground.small-mammal-body', 'ground.large-mammal-body'], [
      node('core', 1), node('head', 1), node('support', 4), node('appendage', 1), node('sensor', 2),
    ], ['attach:head:core:end', 'mirror:support:core:below', 'attach:appendage:core:start'], ['mammal', 'quadruped', 'gait', 'fur']),
    topology('articulated-organism', ['ground.articulated-body', 'ground.biological-tissue'], [
      node('core', 1), node('head', 1), node('appendage', 4), node('joint', 4), node('sensor', 2),
    ], ['attach:head:core:end', 'radial:appendage:core', 'pair:joint:appendage'], ['articulated body', 'human body', 'upright articulated']),
    topology('winged-body', ['ground.winged-body'], [
      node('core', 1), node('head', 1), node('panel', 2), node('appendage', 1), node('sensor', 2),
    ], ['attach:head:core:end', 'mirror:panel:core:sides', 'attach:appendage:core:start'], ['winged body', 'bird', 'aircraft', 'flight']),
    topology('swimmer-body', ['ground.swimmer-body'], [
      node('core', 1), node('head', 1), node('panel', 3), node('sensor', 2),
    ], ['attach:head:core:end', 'mirror:panel:core:sides'], ['streamlined body', 'swimmer body', 'fish', 'aquatic body']),
    topology('segmented-body', ['ground.segmented-body'], [
      node('core', 3), node('support', 6), node('sensor', 2),
    ], ['chain:core', 'mirror:support:core:below'], ['segmented body', 'arthropod', 'segments']),
    topology('branching-organism', ['ground.plant-body', 'ground.branching-network'], [
      node('support', 1), node('appendage', 4), node('panel', 6), node('field', 2),
    ], ['attach:appendage:support:top', 'radial:panel:appendage', 'surround:field:appendage'], ['plant body', 'branching structure', 'tree', 'plant']),
    topology('wheeled-machine', ['ground.wheeled-vehicle', 'ground.constrained-vehicle'], [
      node('core', 1), node('joint', 4), node('head', 1), node('sensor', 2),
    ], ['mirror:joint:core:below', 'attach:head:core:top'], ['wheeled vehicle', 'vehicle', 'chassis', 'wheel']),
    topology('articulated-machine', ['ground.articulated-machine', 'ground.rigid-machine'], [
      node('support', 1), node('appendage', 3), node('joint', 3), node('detail', 1), node('sensor', 1),
    ], ['chain:appendage', 'pair:joint:appendage', 'attach:appendage:support:top'], ['articulated machine', 'linked rigid', 'robot arm', 'gripper']),
    topology('rotating-machine', ['ground.rotating-apparatus', 'ground.gear-train'], [
      node('joint', 3), node('support', 2), node('path', 1), node('sensor', 1),
    ], ['mesh:joint', 'attach:joint:support:top', 'surround:path:joint'], ['rotating apparatus', 'gear train', 'rotor', 'wheel']),
    topology('conveyor-machine', ['ground.conveyor', 'ground.machine-line'], [
      node('path', 2), node('joint', 4), node('support', 2), node('sensor', 2), node('detail', 3),
    ], ['parallel:path', 'mirror:joint:path:ends', 'attach:support:path:below'], ['conveyor', 'belt loop', 'machine line']),
    topology('container', ['ground.container', 'ground.fluid-vessel'], [
      node('core', 1), node('opening', 1), node('appendage', 1), node('detail', 1),
    ], ['inside:opening:core', 'attach:appendage:core:side'], ['container', 'vessel', 'hollow boundary']),
    topology('fluid-system', ['ground.fluid-network', 'ground.thermal-fluid-machine'], [
      node('path', 4), node('joint', 3), node('core', 2), node('sensor', 2),
    ], ['network:path:joint', 'attach:core:path', 'attach:sensor:joint'], ['fluid network', 'connected channels', 'pipe valve pump']),
    topology('structural-span', ['ground.structural-span', 'ground.infrastructure-system'], [
      node('panel', 1), node('support', 3), node('appendage', 2), node('path', 1),
    ], ['attach:support:panel:below', 'mirror:appendage:panel:sides', 'parallel:path:panel'], ['structural span', 'bridge', 'deck', 'pier']),
    topology('instrument', ['ground.instrumented-bench', 'ground.optical-element', 'ground.electrical-network'], [
      node('core', 1), node('sensor', 3), node('path', 3), node('panel', 1), node('detail', 2),
    ], ['attach:sensor:core', 'network:path:sensor', 'attach:panel:core:front'], ['instrument', 'optical element', 'detector', 'sensor']),
    topology('natural-environment', ['ground.natural-environment', 'ground.granular-terrain', 'ground.fluid-domain'], [
      node('field', 3), node('path', 2), node('detail', 4),
    ], ['stack:field', 'through:path:field', 'scatter:detail:field'], ['natural environment', 'terrain', 'fluid domain']),
    topology('operations-environment', ['ground.operations-scene'], [
      node('core', 3), node('path', 3), node('sensor', 3), node('detail', 4),
    ], ['grid:core', 'network:path:core', 'attach:sensor:core'], ['operations scene', 'service network', 'queue', 'logistics']),
    topology('celestial-system', ['ground.celestial-body', 'ground.space-phenomenon'], [
      node('core', 2), node('path', 2), node('field', 2), node('detail', 4),
    ], ['orbit:path:core', 'surround:field:core', 'scatter:detail:field'], ['celestial', 'orbital', 'space phenomenon', 'planet']),
    topology('supported-surface', ['ground.household-object', 'ground.material-sample'], [
      node('core', 1), node('support', 4), node('opening', 1), node('detail', 2),
    ], ['mirror:support:core:below', 'attach:opening:core:front', 'attach:detail:core'], ['household object', 'supported surface', 'furniture', 'table', 'chair', 'stool']),
  ]);

  const CONSTRUCTION_LAYOUT_VARIANTS = Object.freeze([
    Object.freeze({ id: 'balanced', spread: 1, aspect: 1, radialStep: 0.72 }),
    Object.freeze({ id: 'elongated', spread: 1.16, aspect: 0.78, radialStep: 0.58 }),
    Object.freeze({ id: 'compact', spread: 0.84, aspect: 1.12, radialStep: 0.86 }),
  ]);

  const CONSTRUCTION_OPERATIONS = Object.freeze([
    'attach', 'chain', 'grid', 'inside', 'mesh', 'mirror', 'network', 'orbit',
    'pair', 'parallel', 'radial', 'scatter', 'stack', 'surround', 'through',
  ]);

  function role(id, terms, primitive) {
    return Object.freeze({ id, terms: Object.freeze(terms), primitive });
  }

  function node(roleId, count) {
    return Object.freeze({ roleId, count });
  }

  function topology(id, basisIds, nodes, edges, cues = []) {
    return Object.freeze({
      id,
      basisIds: Object.freeze(basisIds),
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      cues: Object.freeze(cues),
    });
  }

  return Object.freeze({
    schema: CONSTRUCTION_SUBSTRATE_SCHEMA,
    CONSTRUCTION_SUBSTRATE_SCHEMA,
    CONSTRUCTION_PART_ROLES,
    CONSTRUCTION_TOPOLOGIES,
    CONSTRUCTION_LAYOUT_VARIANTS,
    CONSTRUCTION_OPERATIONS,
  });
});
