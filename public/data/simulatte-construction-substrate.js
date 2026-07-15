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
      node('core', 1, 'ellipse', [[0.42, 0.52]], ['mantle']),
      node('appendage', 8, 'capsule', [[0.5, 0.065]], [
        'tentacle-1', 'tentacle-2', 'tentacle-3', 'tentacle-4',
        'tentacle-5', 'tentacle-6', 'tentacle-7', 'tentacle-8',
      ]),
      node('sensor', 2, 'ellipse', [[0.09, 0.09]], ['eye-left', 'eye-right']),
    ], ['radial:appendage:core:below', 'attach:sensor:core:front'], [
      'octopus', 'squid', 'cephalopod', 'tentacle',
    ], 'medium'),
    topology('resonant-instrument', ['ground.wave-event'], [
      node('core', 3, ['ellipse', 'rounded-box', 'ellipse'], [[0.34, 0.3], [0.2, 0.2], [0.46, 0.4]], ['upper-bout', 'waist', 'lower-bout']),
      node('appendage', 1, 'capsule', [[0.48, 0.075]], ['neck']),
      node('path', 4, 'capsule', [[0.8, 0.018]], ['string-1', 'string-2', 'string-3', 'string-4']),
      node('detail', 1, 'rounded-box', [[0.24, 0.055]], ['bridge']),
      node('opening', 2, 'capsule', [[0.18, 0.025]], ['soundhole-left', 'soundhole-right']),
      node('joint', 2, 'rounded-box', [[0.07, 0.03]], ['tuning-peg-left', 'tuning-peg-right']),
    ], ['stack:core::contour', 'attach:appendage:core:top', 'span:path:core:appendage', 'attach:detail:core:center', 'mirror:opening:core:inner-sides', 'attach:joint:appendage:top-close'], [
      'resonant body', 'acoustic device', 'musical instrument', 'violin', 'guitar', 'string', 'membrane',
    ], 'small'),
    topology('resonant-cavity', ['ground.wave-event', 'ground.electrical-network'], [
      node('core', 1, 'rounded-box', [[0.68, 0.38]]), node('opening', 2, 'ring', [[0.2, 0.13]]),
      node('path', 3, 'capsule', [[0.72, 0.035]]), node('sensor', 2, 'ellipse', [[0.1, 0.1]]),
      node('field', 2, 'ring', [[0.5, 0.28]]),
    ], ['inside:opening:core', 'network:path:opening', 'attach:sensor:path:ends', 'surround:field:core'], [
      'resonant cavity', 'microwave resonator', 'electromagnetic resonator', 'coupling port', 'waveguide cavity',
    ], 'small'),
    topology('circuit-assembly', ['ground.electrical-network', 'ground.instrumented-bench'], [
      node('panel', 2, 'rounded-box', [[0.72, 0.52]]), node('path', 6, 'capsule', [[0.52, 0.025]]),
      node('sensor', 4, 'ring', [[0.11, 0.11]]), node('detail', 4, 'rounded-box', [[0.1, 0.07]]),
    ], ['stack:panel', 'network:path:sensor', 'grid:sensor:panel', 'attach:detail:path'], [
      'circuit assembly', 'qubit chip', 'integrated circuit', 'feedline', 'readout chip', 'electronic board',
    ], 'tiny'),
    topology('architectural-enclosure', ['ground.infrastructure-system'], [
      node('core', 1, 'rounded-box', [[0.78, 0.68]]), node('panel', 2, 'triangle', [[0.48, 0.22]]),
      node('opening', 5, 'rounded-box', [[0.17, 0.16]]), node('support', 2, 'capsule', [[0.68, 0.05]]),
      node('detail', 2, 'rounded-box', [[0.11, 0.09]]),
    ], ['attach:panel:core:top', 'grid:opening:core', 'mirror:support:core:sides', 'attach:detail:core:front'], [
      'transparent shell', 'enclosure', 'greenhouse', 'hospital', 'building', 'house', 'warehouse',
      'office', 'school', 'architectural',
    ], 'large'),
    topology('heavy-equipment', ['ground.lifting-machine', 'ground.articulated-machine'], [
      node('core', 1, 'rounded-box', [[0.68, 0.36]]), node('head', 1, 'rounded-box', [[0.32, 0.28]]),
      node('path', 2, 'capsule', [[0.74, 0.15]]), node('appendage', 2, 'capsule', [[0.46, 0.12]]),
      node('joint', 2, 'ring', [[0.16, 0.16]]), node('panel', 1, 'triangle', [[0.3, 0.26]]),
    ], ['parallel:path:core:below', 'attach:head:core:top-left', 'chain:appendage:core:boom', 'pair:joint:appendage:ends', 'attach:panel:appendage:end-down'], [
      'excavator', 'crane', 'lifting machine', 'boom cable', 'heavy equipment', 'bucket',
    ], 'large'),
    topology('layered-object', ['ground.membrane-structure', 'ground.flexible-cable'], [
      node('panel', 5), node('support', 1), node('detail', 2),
    ], ['stack:panel', 'attach:support:panel:side', 'attach:detail:panel:front'], [
      'sheet stack', 'layered material', 'pages', 'cover', 'book',
    ]),
    topology('folded-surface', ['ground.membrane-structure', 'ground.biological-tissue'], [
      node('panel', 6, ['capsule', 'ellipse'], [[0.58, 0.12]]), node('path', 4, 'capsule', [[0.46, 0.035]]),
      node('field', 2, 'ellipse', [[0.68, 0.5]]), node('detail', 5, 'ellipse', [[0.08, 0.08]]),
    ], ['stack:panel::spread', 'through:path:panel', 'surround:field:panel', 'scatter:detail:panel'], [
      'folded surface', 'intestinal folds', 'folded membrane', 'villi', 'layered tissue',
    ]),
    topology('clustered-colony', ['ground.biological-colony', 'ground.branching-network'], [
      node('core', 6, 'ellipse', [[0.18, 0.14]]), node('path', 4, 'capsule', [[0.32, 0.025]]),
      node('field', 2, 'ellipse', [[0.64, 0.48]]), node('sensor', 3, 'ring', [[0.08, 0.08]]),
    ], ['scatter:core:field', 'network:path:core', 'surround:field:core', 'attach:sensor:core'], [
      'clustered colony', 'gut microbiome', 'microbiome colonies', 'microbial community', 'cell cluster',
    ], 'microscopic'),
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
    topology('linear-control-network', ['ground.constrained-vehicle', 'ground.network-system'], [
      node('path', 3, 'capsule', [[0.78, 0.045]]), node('core', 4, 'rounded-box', [[0.18, 0.12]]),
      node('sensor', 4, 'ellipse', [[0.09, 0.09]]), node('detail', 3, 'rounded-box', [[0.12, 0.07]]),
    ], ['parallel:path', 'grid:core:path', 'attach:sensor:core:top', 'attach:detail:path'], [
      'linear control network', 'railway dispatch', 'dispatch line',
    ], 'large'),
    topology('rail-vehicle', ['ground.constrained-vehicle', 'ground.wheeled-vehicle'], [
      node('core', 3, 'rounded-box', [[0.3, 0.25]]), node('head', 1, 'rounded-box', [[0.28, 0.3]]),
      node('joint', 8, 'ring', [[0.1, 0.1]]), node('detail', 4, 'rounded-box', [[0.1, 0.08]]),
    ], ['chain:core', 'attach:head:core:front', 'pair:joint:core:below', 'grid:detail:core'], [
      'rail vehicle', 'train', 'train agent', 'train agents', 'locomotive', 'railcar', 'train car',
    ], 'large'),
    topology('rail-signal-array', ['ground.network-system', 'ground.infrastructure-system'], [
      node('support', 4, 'capsule', [[0.08, 0.5]]), node('sensor', 8, 'ellipse', [[0.1, 0.1]]),
      node('detail', 4, 'rounded-box', [[0.13, 0.1]]), node('path', 2, 'capsule', [[0.76, 0.035]]),
    ], ['grid:support:path', 'pair:sensor:support:top', 'attach:detail:support', 'parallel:path'], [
      'rail signal array', 'railway signal blocks', 'signal blocks', 'signal block', 'rail signal',
    ], 'large'),
    topology('railway-platform', ['ground.infrastructure-system', 'ground.constrained-vehicle'], [
      node('panel', 3, 'rounded-box', [[0.74, 0.16]]), node('support', 6, 'capsule', [[0.08, 0.34]]),
      node('path', 2, 'capsule', [[0.78, 0.04]]), node('detail', 4, 'rounded-box', [[0.13, 0.09]]),
    ], ['parallel:panel', 'mirror:support:panel:below', 'parallel:path:panel', 'attach:detail:panel:top'], [
      'railway platform', 'railway platforms', 'platform slot', 'platform slots', 'station platform',
    ], 'large'),
    topology('corridor-array', ['ground.operations-scene', 'ground.thermal-machine'], [
      node('core', 4, 'rounded-box', [[0.2, 0.62]]), node('path', 3, 'capsule', [[0.76, 0.06]]),
      node('field', 2, 'rounded-box', [[0.72, 0.22]]), node('sensor', 3, 'ellipse', [[0.08, 0.08]]),
    ], ['grid:core', 'parallel:path:core', 'through:field:path', 'attach:sensor:core:front'], [
      'corridor array', 'cooling aisles', 'server aisle', 'rack corridor', 'data center aisle',
    ], 'large'),
    topology('data-center-facility', ['ground.operations-scene', 'ground.thermal-machine', 'ground.infrastructure-system'], [
      node('core', 5, 'rounded-box', [[0.17, 0.54]]), node('path', 3, 'capsule', [[0.72, 0.055]]),
      node('field', 2, 'rounded-box', [[0.68, 0.18]]), node('sensor', 5, 'ellipse', [[0.07, 0.07]]),
      node('detail', 5, 'rounded-box', [[0.1, 0.06]]),
    ], ['grid:core', 'parallel:path:core', 'through:field:path', 'attach:sensor:core:front', 'grid:detail:core'], [
      'data center facility', 'edge data center', 'data center', 'server facility', 'compute facility',
    ], 'large'),
    topology('container', ['ground.container', 'ground.fluid-vessel'], [
      node('core', 1), node('opening', 1), node('appendage', 1), node('detail', 1),
    ], ['inside:opening:core', 'attach:appendage:core:side'], ['container', 'vessel', 'hollow boundary']),
    topology('stool', ['ground.household-object'], [
      node('core', 1, 'rounded-box', [[0.78, 0.2]], ['seat']),
      node('support', 4, 'capsule', [[0.42, 0.07]], ['leg-1', 'leg-2', 'leg-3', 'leg-4']),
    ], ['mirror:support:core:below'], ['stool'], 'small'),
    topology('teapot', ['ground.container'], [
      node('core', 1, 'ellipse', [[0.58, 0.46]], ['pot-body']),
      node('opening', 1, 'ring', [[0.2, 0.12]], ['lid-rim']),
      node('appendage', 2, ['triangle', 'ring'], [[0.54, 0.16], [0.46, 0.48]], ['spout', 'handle']),
      node('detail', 1, 'rounded-box', [[0.14, 0.1]], ['lid-knob']),
    ], ['attach:opening:core:top', 'mirror:appendage:core:outer-sides', 'attach:detail:opening:top'], ['teapot', 'kettle'], 'small'),
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
    topology('ocean-wave', ['ground.wave-event', 'ground.fluid-domain'], [
      node('field', 3, 'wave', [[0.92, 0.28], [0.82, 0.2], [0.72, 0.14]]),
      node('path', 2, 'capsule', [[0.78, 0.04]]), node('detail', 4, 'ellipse', [[0.07, 0.04]]),
    ], ['stack:field::contour', 'parallel:path:field', 'scatter:detail:field'], [
      'waves', 'wave', 'ocean wave', 'ocean waves', 'wavefront',
    ], 'large'),
    topology('sea-ice', ['ground.natural-environment', 'ground.fluid-domain'], [
      node('panel', 4, 'rounded-box', [[0.42, 0.3], [0.36, 0.27]]),
      node('path', 3, 'capsule', [[0.54, 0.035]]), node('detail', 3, 'triangle', [[0.12, 0.1]]),
    ], ['scatter:panel', 'through:path:panel', 'scatter:detail:panel'], [
      'sea ice', 'sea-ice', 'ice floe', 'ice floes', 'floe field',
    ], 'large'),
    topology('fjord', ['ground.natural-environment', 'ground.fluid-domain'], [
      node('field', 1, 'wave', [[0.82, 0.42]]), node('support', 2, 'triangle', [[0.4, 0.78]]),
      node('path', 2, 'capsule', [[0.58, 0.05]]), node('detail', 2, 'rounded-box', [[0.22, 0.14]]),
    ], ['inside:field:support', 'mirror:support:field:sides', 'parallel:path:field', 'attach:detail:support'], [
      'fjord', 'fjords', 'glacial basin', 'cliff walls',
    ], 'large'),
    topology('glacier', ['ground.natural-environment', 'ground.granular-terrain'], [
      node('core', 3, ['triangle', 'rounded-box'], [[0.7, 0.58], [0.48, 0.3]]),
      node('path', 3, 'capsule', [[0.46, 0.035]]), node('field', 1, 'wave', [[0.52, 0.12]]),
      node('detail', 2, 'triangle', [[0.18, 0.2]]),
    ], ['stack:core::contour', 'through:path:core', 'attach:field:core:below', 'scatter:detail:core'], [
      'glacier', 'glaciers', 'ice mass', 'ice tongue', 'crevasse',
    ], 'large'),
    topology('operations-environment', ['ground.operations-scene'], [
      node('core', 3), node('path', 3), node('sensor', 3), node('detail', 4),
    ], ['grid:core', 'network:path:core', 'attach:sensor:core'], ['operations scene', 'service network', 'queue', 'logistics']),
    topology('celestial-system', ['ground.celestial-body', 'ground.space-phenomenon'], [
      node('core', 2), node('path', 2), node('field', 2), node('detail', 4),
    ], ['orbit:path:core', 'surround:field:core', 'scatter:detail:field'], ['celestial', 'orbital', 'space phenomenon', 'planet']),
    topology('ring-system', ['ground.celestial-body', 'ground.space-phenomenon', 'ground.wave-event'], [
      node('core', 2, 'ellipse', [[0.3, 0.3]]), node('joint', 4, 'ring', [[0.7, 0.42]]),
      node('path', 4, 'ring', [[0.76, 0.48]]), node('field', 2, 'ring', [[0.86, 0.56]]),
      node('detail', 6, 'ellipse', [[0.06, 0.06]]),
    ], ['orbit:path:core', 'surround:joint:core', 'stack:field::contour', 'scatter:detail:field'], [
      'ring system', 'planetary rings', 'density waves', 'orbital gaps', 'resonant rings', 'ring particles',
    ], 'astronomical'),
    topology('porous-matrix', ['ground.material-sample', 'ground.pressure-membrane'], [
      node('core', 1, 'rounded-box', [[0.78, 0.58]]), node('opening', 8, 'ellipse', [[0.11, 0.09]]),
      node('path', 4, 'capsule', [[0.28, 0.025]]), node('field', 2, 'ellipse', [[0.7, 0.5]]),
    ], ['inside:opening:core', 'network:path:opening', 'surround:field:core'], [
      'porous matrix', 'dough matrix', 'gas bubbles', 'foam cells', 'fermentation bubbles', 'porous material',
    ]),
    topology('fiber-network', ['ground.flexible-cable', 'ground.branching-network'], [
      node('path', 8, 'capsule', [[0.48, 0.025]]), node('joint', 5, 'ellipse', [[0.07, 0.07]]),
      node('field', 1, 'rounded-box', [[0.72, 0.54]]),
    ], ['network:path:joint', 'inside:joint:field', 'through:path:field'], [
      'fiber network', 'gluten strands', 'filament mesh', 'polymer strands', 'woven fibers',
    ]),
    topology('molecular-chain', ['ground.flexible-cable', 'ground.biological-tissue'], [
      node('path', 8, 'capsule', [[0.24, 0.035]]), node('joint', 7, 'ellipse', [[0.075, 0.075]]),
      node('detail', 6, 'ring', [[0.1, 0.1]]), node('field', 2, 'ellipse', [[0.68, 0.5]]),
    ], ['chain:path', 'pair:joint:path:chain-ends', 'pair:detail:joint', 'surround:field:path'], [
      'molecular chain', 'protein', 'protein folding', 'protein chain', 'amino acid chain', 'polypeptide',
    ], 'microscopic'),
    topology('particle-cloud', ['ground.material-sample', 'ground.fluid-domain'], [
      node('detail', 10, 'ellipse', [[0.07, 0.07]]), node('field', 3, 'ellipse', [[0.64, 0.46]]),
      node('path', 2, 'capsule', [[0.4, 0.025]]),
    ], ['scatter:detail:field', 'stack:field::contour', 'through:path:field'], [
      'particle cloud', 'plume', 'collision plume', 'smoke plume', 'thermal plume',
      'metabolites', 'soot particles', 'suspended matter', 'aerosol', 'molecular exchange',
    ], 'microscopic'),
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
    'pair', 'parallel', 'radial', 'scatter', 'span', 'stack', 'surround', 'through',
  ]);

  function role(id, terms, primitive) {
    return Object.freeze({ id, terms: Object.freeze(terms), primitive });
  }

  function node(roleId, count, primitive = '', sizes = [], partIds = []) {
    return Object.freeze({
      roleId,
      count,
      primitive: Array.isArray(primitive) ? Object.freeze(primitive) : primitive,
      sizes: Object.freeze(sizes.map((size) => Object.freeze(size))),
      partIds: Object.freeze(partIds),
    });
  }

  function topology(id, basisIds, nodes, edges, cues = [], scaleHint = 'medium') {
    return Object.freeze({
      id,
      basisIds: Object.freeze(basisIds),
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      cues: Object.freeze(cues),
      scaleHint,
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
