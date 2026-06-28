import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public/models/simulatte-visual-cards');
const INDEX_PATH = path.join(OUT_DIR, 'visual-card-index-v1.json');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');

const SCHEMA = 'simulatte.visualCardIndex.v1';
const MANIFEST_SCHEMA = 'simulatte.visualCardManifest.v1';
const SLICE_COUNT = 512;

const PALETTES = [
  'thermal', 'optical', 'mineral', 'biological', 'electric', 'civic', 'aqueous', 'metallic',
  'atmospheric', 'volcanic', 'cryogenic', 'clinical', 'industrial', 'astral', 'agricultural', 'synthetic',
];

const SCENE_DOMAINS = [
  entry('warehouse', 'civic', ['warehouse', 'fulfillment center', 'loading dock'], ['route grid', 'inventory aisles', 'pallet stacks']),
  entry('city street', 'civic', ['city street', 'intersection', 'urban canyon'], ['road lanes', 'signals', 'pedestrian flow']),
  entry('subway station', 'transport', ['subway station', 'platform', 'tunnel'], ['platform edge', 'rail lines', 'queue zones']),
  entry('hospital ward', 'medical', ['hospital ward', 'triage room', 'clinic'], ['beds', 'monitors', 'staff flow']),
  entry('school corridor', 'civic', ['school corridor', 'classroom hall'], ['lockers', 'doors', 'crowd pockets']),
  entry('factory floor', 'manufacturing', ['factory floor', 'assembly line'], ['machines', 'belts', 'work cells']),
  entry('electronics bench', 'electronics', ['electronics bench', 'circuit lab'], ['breadboards', 'wires', 'sensor rigs']),
  entry('data center', 'electronics', ['data center', 'server room'], ['racks', 'cable trays', 'cooling aisles']),
  entry('greenhouse', 'agriculture', ['greenhouse', 'growing house'], ['crop rows', 'misters', 'sun panels']),
  entry('orchard', 'agriculture', ['orchard', 'fruit grove'], ['tree rows', 'soil paths', 'irrigation lines']),
  entry('wetland', 'ecology', ['wetland', 'marsh', 'swamp'], ['reed beds', 'water pools', 'mud banks']),
  entry('coral reef', 'ecology', ['coral reef', 'reef wall'], ['coral shelves', 'fish paths', 'wave caustics']),
  entry('algae pond', 'ecology', ['algae pond', 'bio pond'], ['green surface', 'baffles', 'sun exposure']),
  entry('forest canopy', 'ecology', ['forest canopy', 'woodland'], ['trunks', 'branches', 'understory']),
  entry('desert dune', 'geology', ['desert dune', 'sand field'], ['dune ridges', 'wind ripples', 'dust sheets']),
  entry('mountain watershed', 'hydrology', ['mountain watershed', 'rain basin'], ['ridges', 'streams', 'sediment fans']),
  entry('river delta', 'hydrology', ['river delta', 'alluvial fan'], ['split channels', 'silt bars', 'wet edges']),
  entry('undersea vent', 'ocean', ['undersea vent', 'hydrothermal vent'], ['vent chimney', 'brine plume', 'mineral crust']),
  entry('harbor', 'ocean', ['harbor', 'dock basin'], ['piers', 'boat wakes', 'mooring lines']),
  entry('submarine trench', 'ocean', ['submarine trench', 'deep sea'], ['pressure layers', 'silt floor', 'dark water']),
  entry('volcano', 'geology', ['volcano', 'lava cone'], ['lava channels', 'ash plume', 'black slopes']),
  entry('cave', 'geology', ['cave', 'karst chamber'], ['stalactites', 'drip pools', 'rock walls']),
  entry('crystal cavern', 'geology', ['crystal cavern', 'quartz cave'], ['faceted crystals', 'dark voids', 'reflections']),
  entry('ice shelf', 'cryosphere', ['ice shelf', 'glacier edge'], ['cracks', 'blue ice', 'melt channels']),
  entry('storm cell', 'weather', ['storm cell', 'thunderhead'], ['cloud bands', 'rain shafts', 'charge zones']),
  entry('thermal plume', 'weather', ['thermal plume', 'heat column'], ['rising bands', 'cool edges', 'sensor lines']),
  entry('wind tunnel', 'fluid', ['wind tunnel', 'flow lab'], ['test body', 'streamlines', 'pressure taps']),
  entry('wave tank', 'fluid', ['wave tank', 'water flume'], ['surface waves', 'baffles', 'tracer particles']),
  entry('optical bench', 'optics', ['optical bench', 'laser table'], ['rails', 'lens mounts', 'beam paths']),
  entry('mirror array', 'optics', ['mirror array', 'solar mirror swarm'], ['reflectors', 'focus point', 'tracking arcs']),
  entry('ferrofluid dish', 'electromagnetism', ['ferrofluid dish', 'magnetic fluid tray'], ['spike pool', 'coils', 'field rings']),
  entry('battery stack', 'energy', ['battery stack', 'electrochemical cell'], ['plates', 'separator layers', 'leak paths']),
  entry('power grid', 'energy', ['power grid', 'substation'], ['transformers', 'transmission lines', 'load nodes']),
  entry('solar farm', 'energy', ['solar farm', 'panel field'], ['panel rows', 'sun path', 'inverter boxes']),
  entry('wind farm', 'energy', ['wind farm', 'turbine field'], ['towers', 'wake lanes', 'terrain grid']),
  entry('rocket pad', 'aerospace', ['rocket pad', 'launch site'], ['tower', 'flame trench', 'exhaust plume']),
  entry('orbital station', 'aerospace', ['orbital station', 'space habitat'], ['modules', 'solar wings', 'orbit arcs']),
  entry('asteroid field', 'astronomy', ['asteroid field', 'debris belt'], ['rocks', 'dust trails', 'gravity wells']),
  entry('black hole lens', 'astronomy', ['black hole lens', 'singularity field'], ['accretion ring', 'lensing arcs', 'star streaks']),
  entry('robot arena', 'robotics', ['robot arena', 'automation floor'], ['robot paths', 'charging pads', 'obstacles']),
  entry('drone corridor', 'robotics', ['drone corridor', 'air route'], ['flight lanes', 'altitude bands', 'beacons']),
  entry('rail yard', 'transport', ['rail yard', 'switching yard'], ['tracks', 'switches', 'cars']),
  entry('airport apron', 'transport', ['airport apron', 'runway edge'], ['taxi lines', 'service carts', 'jet wash']),
  entry('traffic control room', 'civic', ['traffic control room', 'operations center'], ['screens', 'network maps', 'alert queues']),
  entry('market floor', 'economics', ['market floor', 'trading pit'], ['orders', 'queues', 'price flows']),
  entry('courtroom', 'social', ['courtroom', 'hearing room'], ['seating', 'evidence table', 'attention lines']),
  entry('concert hall', 'acoustics', ['concert hall', 'auditorium'], ['seats', 'stage shell', 'standing waves']),
  entry('brass tube resonator', 'acoustics', ['brass tube resonator', 'acoustic tube'], ['tube wall', 'pressure nodes', 'dust suspension']),
  entry('kitchen', 'domestic', ['kitchen', 'cooking station'], ['burner', 'steam', 'utensils']),
  entry('laundry room', 'domestic', ['laundry room', 'wash cycle'], ['drum', 'water lines', 'fabric motion']),
  entry('aquarium', 'ecology', ['aquarium', 'tank habitat'], ['glass walls', 'bubbles', 'plants']),
  entry('beehive', 'ecology', ['beehive', 'honeycomb'], ['hex cells', 'swarm paths', 'wax layers']),
  entry('ant colony', 'ecology', ['ant colony', 'soil nest'], ['tunnels', 'chambers', 'traffic flows']),
  entry('kiln room', 'manufacturing', ['kiln room', 'ceramic kiln'], ['hot chamber', 'shelves', 'cracked clay']),
  entry('forge', 'manufacturing', ['forge', 'metal workshop'], ['anvil', 'hot metal', 'sparks']),
  entry('textile loom', 'manufacturing', ['textile loom', 'weaving floor'], ['threads', 'shuttle paths', 'fabric sheet']),
  entry('chemical reactor', 'chemistry', ['chemical reactor', 'reaction vessel'], ['vessel', 'mixing plume', 'sensor ports']),
  entry('pharmacy lab', 'chemistry', ['pharmacy lab', 'formulation bench'], ['vials', 'powders', 'pipettes']),
  entry('molecular lattice', 'chemistry', ['molecular lattice', 'crystal lattice'], ['nodes', 'bonds', 'vibration modes']),
  entry('protein fold', 'biology', ['protein fold', 'molecular biology scene'], ['folded ribbons', 'binding pocket', 'charge sites']),
  entry('heart pump', 'biology', ['heart pump', 'vascular loop'], ['chambers', 'valves', 'blood flow']),
  entry('brain network', 'biology', ['brain network', 'neural field'], ['nodes', 'axons', 'signal pulses']),
  entry('soil microbiome', 'biology', ['soil microbiome', 'microbial colony'], ['pores', 'roots', 'diffusion clouds']),
  entry('snow town', 'weather', ['snow town', 'winter street'], ['snow layers', 'heat leaks', 'tracks']),
];

const MATERIALS = [
  entry('water', 'fluid', ['water', 'clear liquid'], ['ripples', 'refraction', 'foam edge']),
  entry('brine', 'fluid', ['brine', 'salty water'], ['dense layers', 'crystal edge', 'pressure shimmer']),
  entry('oil', 'fluid', ['oil', 'viscous liquid'], ['rainbow slick', 'thick bands', 'surface tension']),
  entry('lava', 'thermal', ['lava', 'magma'], ['glow cracks', 'black crust', 'viscous flow']),
  entry('smoke', 'gas', ['smoke', 'soot plume'], ['soft curls', 'dark veil', 'shear bands']),
  entry('steam', 'gas', ['steam', 'hot vapor'], ['white plume', 'condensation', 'thermal rise']),
  entry('air', 'gas', ['air', 'wind'], ['streamlines', 'pressure field', 'dust tracer']),
  entry('glass', 'transparent', ['glass', 'transparent pane'], ['caustics', 'reflections', 'edge highlights']),
  entry('mirror', 'optical', ['mirror', 'reflector'], ['specular glints', 'beam bounce', 'metal backing']),
  entry('lens glass', 'transparent', ['lens glass', 'curved optics'], ['focus cone', 'chromatic fringe', 'clear edge']),
  entry('ice', 'cryogenic', ['ice', 'frozen water'], ['blue facets', 'cracks', 'frost haze']),
  entry('quartz', 'mineral', ['quartz', 'crystal'], ['facets', 'internal glints', 'hex columns']),
  entry('basalt', 'mineral', ['basalt', 'dark volcanic rock'], ['column joints', 'black roughness', 'mineral flecks']),
  entry('obsidian', 'volcanic-glass', ['obsidian', 'black volcanic glass'], ['glassy fracture', 'black reflection', 'sharp chipped edge']),
  entry('granite', 'mineral', ['granite', 'speckled stone'], ['speckles', 'hard edges', 'block grain']),
  entry('sand', 'granular', ['sand', 'fine grains'], ['grain cloud', 'dune ripples', 'pile angle']),
  entry('dust', 'granular', ['dust', 'fine powder'], ['suspended points', 'settling sheets', 'light haze']),
  entry('clay', 'ceramic', ['clay', 'wet ceramic'], ['soft cracks', 'smooth surface', 'wheel rings']),
  entry('porcelain', 'ceramic', ['porcelain', 'white ceramic'], ['glaze shine', 'thin cracks', 'chips']),
  entry('concrete', 'composite', ['concrete', 'aggregate'], ['aggregate chips', 'rebar shadows', 'rough slab']),
  entry('wood', 'organic', ['wood', 'timber'], ['grain lines', 'rings', 'char edge']),
  entry('paper', 'organic', ['paper', 'thin sheet'], ['fibers', 'folds', 'burn edge']),
  entry('fabric', 'textile', ['fabric', 'cloth'], ['woven threads', 'folds', 'tension wrinkles']),
  entry('rubber', 'polymer', ['rubber', 'elastic material'], ['matte stretch', 'compression marks', 'black surface']),
  entry('plastic', 'polymer', ['plastic', 'synthetic polymer'], ['smooth shell', 'mold seams', 'gloss patches']),
  entry('silicone', 'polymer', ['silicone', 'soft polymer'], ['gel body', 'rounded edge', 'translucency']),
  entry('foam', 'porous', ['foam', 'bubbled material'], ['cell pores', 'lightness', 'irregular edge']),
  entry('gel', 'soft', ['gel', 'jelly material'], ['translucent body', 'slow waves', 'soft boundary']),
  entry('moss', 'biological', ['moss', 'green moss'], ['fibers', 'spores', 'humid texture']),
  entry('algae', 'biological', ['algae', 'green biomass'], ['floating mats', 'cell clusters', 'pond sheen']),
  entry('mycelium', 'biological', ['mycelium', 'fungal network'], ['branch threads', 'node clusters', 'growth front']),
  entry('wax', 'biological-wax', ['wax', 'honeycomb wax'], ['hex comb', 'amber translucency', 'soft cells']),
  entry('leaf tissue', 'biological', ['leaf', 'plant tissue'], ['veins', 'stomata dots', 'green gradient']),
  entry('blood', 'biological-fluid', ['blood', 'red fluid'], ['pulse wave', 'viscous path', 'cell dots']),
  entry('bone', 'biological-mineral', ['bone', 'calcified tissue'], ['porous matrix', 'ivory color', 'fracture edge']),
  entry('protein gel', 'biochemical', ['protein gel', 'biopolymer'], ['fold lines', 'gel matrix', 'binding dots']),
  entry('copper', 'metal', ['copper', 'conductive metal'], ['warm highlights', 'oxidation', 'wire coils']),
  entry('steel', 'metal', ['steel', 'hard metal'], ['cool reflections', 'machined edges', 'scratches']),
  entry('brass', 'metal', ['brass', 'yellow alloy'], ['warm shine', 'tube wall', 'tarnish edge']),
  entry('gold', 'metal', ['gold', 'precious metal'], ['yellow gleam', 'soft reflection', 'heavy slab']),
  entry('aluminum', 'metal', ['aluminum', 'light metal'], ['brushed streaks', 'pale reflection', 'thin sheet']),
  entry('graphite', 'carbon', ['graphite', 'carbon foam'], ['dark pores', 'layer flakes', 'conductive paths']),
  entry('silicon', 'semiconductor', ['silicon', 'chip substrate'], ['wafer grid', 'iridescence', 'circuit traces']),
  entry('ceramic oxide', 'ceramic', ['ceramic oxide', 'insulator'], ['matte white', 'micro cracks', 'heat stains']),
  entry('battery electrolyte', 'electrochemical', ['electrolyte', 'battery fluid'], ['leak path', 'ion glow', 'corrosion edge']),
  entry('salt crystal', 'mineral', ['salt crystal', 'ionic crystal'], ['cubic facets', 'white grains', 'dissolve edge']),
  entry('acid', 'chemical', ['acid', 'corrosive liquid'], ['etch marks', 'fume edge', 'bright hazard tint']),
  entry('base solution', 'chemical', ['base solution', 'alkaline liquid'], ['slick surface', 'reaction cloud', 'pale tint']),
  entry('plasma', 'thermal-electric', ['plasma', 'ionized gas'], ['glow core', 'filaments', 'electric fringe']),
  entry('ferrofluid', 'magnetic-fluid', ['ferrofluid', 'magnetic fluid'], ['spikes', 'black mirror', 'field response']),
  entry('mercury', 'liquid-metal', ['mercury', 'liquid metal'], ['silver globules', 'high reflection', 'surface beads']),
  entry('soil', 'organic-mineral', ['soil', 'earth'], ['crumbs', 'roots', 'moist patches']),
  entry('mud', 'organic-fluid', ['mud', 'wet soil'], ['slump flow', 'dark streaks', 'sediment water']),
  entry('snow', 'cryogenic', ['snow', 'powder snow'], ['soft grains', 'blue shadows', 'wind crust']),
  entry('ash', 'thermal-residue', ['ash', 'burn residue'], ['gray flakes', 'char dust', 'settled layer']),
  entry('soot concrete', 'composite', ['soot concrete', 'burnt wall'], ['black stains', 'aggregate', 'heat cracks']),
  entry('wet algae glass', 'hybrid', ['wet algae glass', 'biofilm glass'], ['green smear', 'refraction', 'slippery film']),
  entry('graphite foam', 'porous-carbon', ['graphite foam', 'carbon foam'], ['porous stack', 'dark shine', 'conductive mesh']),
  entry('cracked porcelain', 'ceramic', ['cracked porcelain', 'broken ceramic'], ['white glaze', 'crack network', 'sharp chips']),
  entry('molten salt', 'thermal-chemical', ['molten salt', 'hot salt'], ['orange pool', 'white crust', 'ion glow']),
  entry('nutrient gel', 'biological-soft', ['nutrient gel', 'growth medium'], ['translucent green', 'diffusion clouds', 'cells']),
  entry('magnet wire', 'electromagnetic', ['magnet wire', 'enameled copper'], ['coil turns', 'field halo', 'thin insulation']),
  entry('carbon fiber', 'composite', ['carbon fiber', 'woven composite'], ['black weave', 'light streaks', 'anisotropy']),
  entry('aerogel', 'porous', ['aerogel', 'light porous solid'], ['pale translucency', 'soft edge', 'micro pores']),
  entry('neon gas', 'gas-electric', ['neon gas', 'glowing gas'], ['colored glow', 'tube edge', 'ion trace']),
];

const PROCESSES = [
  entry('burn', 'thermal', ['burn', 'combust', 'flame', 'fire'], ['flame front', 'smoke trail', 'charred edge']),
  entry('smolder', 'thermal', ['smolder', 'slow burn'], ['low glow', 'ash creep', 'thin smoke']),
  entry('melt', 'thermal', ['melt', 'liquefy'], ['drips', 'soft edge', 'glow transition']),
  entry('freeze', 'cryogenic', ['freeze', 'solidify'], ['ice front', 'crystals', 'blue edge']),
  entry('boil', 'thermal-fluid', ['boil', 'bubble'], ['bubbles', 'steam', 'surface churn']),
  entry('condense', 'phase', ['condense', 'dew'], ['droplets', 'fog edge', 'cool gradient']),
  entry('flow', 'fluid', ['flow', 'stream'], ['streamlines', 'advected particles', 'curl']),
  entry('erode', 'hydrology', ['erode', 'carve'], ['cut channels', 'sediment fan', 'height loss']),
  entry('sediment', 'granular-fluid', ['sediment', 'settle'], ['fallout bands', 'silt layers', 'delta growth']),
  entry('diffuse', 'transport', ['diffuse', 'spread'], ['soft gradient', 'plume cloud', 'concentration rings']),
  entry('leak', 'failure', ['leak', 'spill'], ['droplet path', 'corrosion halo', 'wet trail']),
  entry('pump', 'mechanical-fluid', ['pump', 'pulse'], ['pressure wave', 'valve motion', 'flow loop']),
  entry('compress', 'mechanical', ['compress', 'squeeze'], ['strain bands', 'shortening', 'pressure marks']),
  entry('fracture', 'mechanical', ['fracture', 'crack'], ['crack tree', 'shards', 'stress lines']),
  entry('collide', 'mechanical', ['collide', 'impact'], ['impulse flash', 'motion ghost', 'deformation']),
  entry('roll', 'mechanical', ['roll', 'wheel'], ['contact patch', 'rotation arc', 'friction trail']),
  entry('rotate', 'mechanical', ['rotate', 'spin'], ['angular trails', 'hub blur', 'radial ticks']),
  entry('oscillate', 'wave', ['oscillate', 'vibrate'], ['standing wave', 'phase bands', 'node points']),
  entry('resonate', 'acoustic', ['resonate', 'ring'], ['pressure rings', 'antinodes', 'tube modes']),
  entry('levitate', 'acoustic-magnetic', ['levitate', 'suspend'], ['floating nodes', 'force rings', 'shadow gap']),
  entry('sort', 'granular', ['sort', 'sieve'], ['separated streams', 'bins', 'particle sizes']),
  entry('filter', 'porous', ['filter', 'screen'], ['mesh', 'captured particles', 'clean stream']),
  entry('focus', 'optical', ['focus', 'converge'], ['light cone', 'caustic spot', 'ray bundle']),
  entry('reflect', 'optical', ['reflect', 'mirror'], ['bounce rays', 'specular highlight', 'angle marks']),
  entry('refract', 'optical', ['refract', 'bend light'], ['split rays', 'prism colors', 'interface bend']),
  entry('interfere', 'optical-wave', ['interfere', 'thin film'], ['rainbow bands', 'phase rings', 'fringe nodes']),
  entry('magnetize', 'electromagnetic', ['magnetize', 'align field'], ['flux lines', 'dipole dust', 'pole colors']),
  entry('induce current', 'electromagnetic', ['induce current', 'coil'], ['field loop', 'wire glow', 'eddy trace']),
  entry('charge', 'electric', ['charge', 'ionize'], ['sparks', 'potential lines', 'glow nodes']),
  entry('discharge', 'electric', ['discharge', 'arc'], ['branch lightning', 'bright core', 'afterglow']),
  entry('queue', 'operations', ['queue', 'wait'], ['backlog lanes', 'service node', 'delay color']),
  entry('reroute', 'network', ['reroute', 'redirect'], ['path switch', 'blocked link', 'new route']),
  entry('jam', 'operations', ['jam', 'clog'], ['blocked nodes', 'dense cluster', 'red pressure']),
  entry('grow', 'biology', ['grow', 'sprout'], ['growth front', 'branch tips', 'nutrient draw']),
  entry('decay', 'biology', ['decay', 'rot'], ['darkening', 'fragmentation', 'mass loss']),
  entry('infect', 'biology', ['infect', 'spread pathogen'], ['front line', 'color shift', 'cells']),
  entry('photosynthesize', 'biology-energy', ['photosynthesize', 'light growth'], ['sun rays', 'green uptake', 'oxygen dots']),
  entry('fold', 'biochemistry', ['fold', 'protein fold'], ['ribbon movement', 'binding pocket', 'contact points']),
  entry('bind', 'chemistry', ['bind', 'attach'], ['lock sites', 'bridge bonds', 'snap fit']),
  entry('react', 'chemistry', ['react', 'chemical reaction'], ['reaction cloud', 'heat color', 'product particles']),
  entry('crystallize', 'chemistry', ['crystallize', 'nucleate'], ['facets', 'seed points', 'growth planes']),
  entry('sinter', 'ceramic', ['sinter', 'kiln heat'], ['neck growth', 'shrinkage', 'heat bands']),
  entry('corrode', 'chemistry', ['corrode', 'rust'], ['pitted surface', 'green edge', 'loss mask']),
  entry('evaporate', 'phase', ['evaporate', 'dry'], ['vanishing film', 'vapor wisps', 'salt rings']),
  entry('mix', 'fluid-chemical', ['mix', 'stir'], ['swirls', 'color blend', 'eddies']),
  entry('separate', 'fluid-chemical', ['separate', 'phase split'], ['layers', 'interface line', 'droplets']),
  entry('orbit', 'gravity', ['orbit', 'circle'], ['ellipses', 'trail fading', 'central body']),
  entry('collapse', 'gravity', ['collapse', 'fall inward'], ['infall lines', 'dark core', 'compression']),
  entry('radiate', 'energy', ['radiate', 'emit'], ['rays', 'glow falloff', 'wavefronts']),
  entry('absorb', 'energy', ['absorb', 'capture'], ['dark halo', 'incoming arrows', 'stored glow']),
  entry('cool', 'thermal', ['cool', 'remove heat'], ['blue gradient', 'heat sink', 'contracting plume']),
  entry('heat', 'thermal', ['heat', 'warm'], ['red gradient', 'thermal waves', 'expansion']),
  entry('measure', 'instrumentation', ['measure', 'sense'], ['tick marks', 'probe line', 'readout glow']),
  entry('control', 'systems', ['control', 'feedback'], ['loop arrows', 'gain node', 'stability band']),
  entry('balance', 'systems', ['balance', 'equilibrate'], ['counter flows', 'center line', 'equal bars']),
  entry('transport', 'logistics', ['transport', 'move goods'], ['routes', 'payload icons', 'dock nodes']),
  entry('assemble', 'manufacturing', ['assemble', 'build'], ['parts snapping', 'tool path', 'fixture grid']),
  entry('weave', 'textile', ['weave', 'interlace'], ['threads', 'over-under pattern', 'tension']),
  entry('cut', 'manufacturing', ['cut', 'slice'], ['tool line', 'separated edge', 'chips']),
  entry('weld', 'manufacturing', ['weld', 'join metal'], ['arc glow', 'seam bead', 'heat tint']),
  entry('breathe', 'biology-fluid', ['breathe', 'ventilate'], ['in-out flow', 'expanding chamber', 'air paths']),
  entry('signal', 'electronics', ['signal', 'transmit'], ['pulses', 'antenna rings', 'wave packets']),
  entry('compute', 'electronics', ['compute', 'process data'], ['logic grid', 'bit flow', 'state cells']),
  entry('swarm', 'collective', ['swarm', 'flock'], ['many agents', 'alignment vectors', 'density pockets']),
];

const COMPOSITIONS = [
  entry('inside', 'spatial', ['inside', 'within'], ['container frame', 'occlusion', 'nested scale']),
  entry('over', 'spatial', ['over', 'above'], ['layer separation', 'shadow', 'vertical relation']),
  entry('under', 'spatial', ['under', 'below'], ['covering plane', 'pressure', 'hidden area']),
  entry('through', 'spatial', ['through', 'passing through'], ['portal', 'tunnel', 'cross section']),
  entry('around', 'spatial', ['around', 'encircling'], ['ring path', 'wrapped field', 'central object']),
  entry('between', 'spatial', ['between'], ['gap', 'two anchors', 'interaction zone']),
  entry('across', 'spatial', ['across'], ['span', 'bridge line', 'start/end points']),
  entry('along', 'spatial', ['along'], ['path following', 'parallel guide', 'direction']),
  entry('colliding with', 'interaction', ['colliding with', 'impacting'], ['impact point', 'deformation', 'motion vectors']),
  entry('leaking from', 'interaction', ['leaking from'], ['source break', 'droplets', 'wet trail']),
  entry('burning in', 'interaction', ['burning in'], ['flame region', 'smoke ceiling', 'char mask']),
  entry('growing on', 'interaction', ['growing on'], ['root contact', 'spread front', 'surface adherence']),
  entry('flowing into', 'interaction', ['flowing into'], ['inlet', 'pooling', 'mixing area']),
  entry('focusing onto', 'interaction', ['focusing onto', 'onto'], ['ray cone', 'target spot', 'energy density']),
  entry('resonating inside', 'interaction', ['resonating inside'], ['standing waves', 'walls', 'nodes']),
  entry('sorting through', 'interaction', ['sorting through'], ['sieve grid', 'two streams', 'bins']),
  entry('orbiting around', 'interaction', ['orbiting around'], ['elliptic trail', 'center mass', 'phase dots']),
  entry('charging', 'interaction', ['charging'], ['potential lines', 'storage meter', 'spark nodes']),
  entry('cooling with', 'interaction', ['cooling with'], ['heat sink', 'blue flow', 'thermal gradient']),
  entry('heating with', 'interaction', ['heating with'], ['source glow', 'expansion', 'red gradient']),
  entry('controlled by', 'system', ['controlled by'], ['feedback arrows', 'controller box', 'sensor loops']),
  entry('measured by', 'system', ['measured by'], ['probe', 'readout panel', 'sample line']),
  entry('queued at', 'system', ['queued at', 'at'], ['service point', 'backlog lane', 'waiting agents']),
  entry('rerouted by', 'system', ['rerouted by'], ['broken link', 'alternate path', 'switch node']),
  entry('split into', 'transform', ['split into', 'into'], ['branching outputs', 'fork', 'conservation marks']),
  entry('merged with', 'transform', ['merged with'], ['confluence', 'combined flow', 'blend zone']),
  entry('phase-changing into', 'transform', ['phase-changing into'], ['interface', 'old/new material', 'latent heat']),
  entry('crystallizing from', 'transform', ['crystallizing from', 'from'], ['nucleation points', 'facets', 'mother liquid']),
  entry('fracturing under', 'transform', ['fracturing under'], ['stress field', 'crack paths', 'load arrows']),
  entry('compressed by', 'transform', ['compressed by'], ['pressure plates', 'shortening', 'strain color']),
  entry('woven through', 'transform', ['woven through'], ['over-under paths', 'tension', 'fabric field']),
  entry('swarming around', 'collective', ['swarming around'], ['agents', 'alignment arrows', 'density ring']),
  entry('mapped as', 'view', ['mapped as'], ['diagram layer', 'legend bands', 'abstract field']),
  entry('cut away', 'view', ['cut away'], ['section plane', 'interior parts', 'hatching']),
  entry('magnified as', 'view', ['magnified as'], ['zoom window', 'detail inset', 'scale jump']),
  entry('projected onto', 'view', ['projected onto'], ['screen plane', 'shadow projection', 'coordinate grid']),
  entry('balanced against', 'system', ['balanced against'], ['two sides', 'constraint line', 'equalizing flow']),
  entry('stored in', 'system', ['stored in'], ['reservoir', 'capacity fill', 'boundary']),
  entry('released from', 'system', ['released from', 'from'], ['gate', 'burst trail', 'outlet']),
  entry('triggered by', 'system', ['triggered by'], ['event marker', 'causal arrow', 'threshold line']),
  entry('shielded by', 'spatial', ['shielded by'], ['barrier', 'shadow zone', 'blocked rays']),
  entry('illuminated by', 'optical', ['illuminated by'], ['light source', 'falloff', 'highlight']),
  entry('reflected between', 'optical', ['reflected between'], ['mirror pair', 'bounce path', 'multipath rays']),
  entry('refracted through', 'optical', ['refracted through'], ['interface bend', 'spectrum', 'transparent body']),
  entry('magnetized by', 'field', ['magnetized by'], ['dipole lines', 'pole labels', 'aligned particles']),
  entry('grounded through', 'field', ['grounded through'], ['return path', 'potential drop', 'contact point']),
  entry('pressurized inside', 'field', ['pressurized inside'], ['pressure contours', 'walls', 'bulging membrane']),
  entry('diffusing across', 'field', ['diffusing across'], ['gradient', 'soft front', 'particles']),
  entry('advected by', 'field', ['advected by'], ['velocity vectors', 'tracers', 'curl']),
  entry('stabilized by', 'system', ['stabilized by'], ['feedback damping', 'safe band', 'controller']),
  entry('destabilized by', 'system', ['destabilized by'], ['oscillation growth', 'red threshold', 'runaway arrow']),
  entry('anchored to', 'spatial', ['anchored to'], ['fixed point', 'tether', 'load line']),
  entry('suspended from', 'spatial', ['suspended from'], ['hanger', 'gravity line', 'sway arc']),
  entry('folded into', 'transform', ['folded into'], ['crease lines', 'compact form', 'overlaps']),
  entry('expanded from', 'transform', ['expanded from'], ['growth arrows', 'larger boundary', 'source point']),
  entry('sampled by', 'instrumentation', ['sampled by'], ['sample points', 'probe', 'data trace']),
  entry('classified into', 'instrumentation', ['classified into'], ['bins', 'labels', 'decision boundary']),
  entry('rendered as', 'view', ['rendered as'], ['style layer', 'glyph mapping', 'palette swatches']),
  entry('damaged by', 'failure', ['damaged by'], ['cracks', 'burn marks', 'missing material']),
  entry('repaired by', 'failure', ['repaired by'], ['patches', 'healing front', 'stabilizers']),
  entry('conserved across', 'physics', ['conserved across'], ['ledger', 'in/out arrows', 'balance marks']),
  entry('exchanged with', 'physics', ['exchanged with'], ['two reservoirs', 'bidirectional arrows', 'rate labels']),
  entry('coupled to', 'physics', ['coupled to'], ['linked fields', 'synchrony', 'phase relation']),
  entry('decoupled from', 'physics', ['decoupled from'], ['broken link', 'independent layers', 'gap']),
];

const OBJECTS = [
  'building', 'bridge', 'turbine', 'robot', 'battery', 'mirror', 'lens', 'coil',
  'pond', 'vent', 'kiln', 'tube', 'tree', 'mushroom', 'heart', 'server rack',
  'rocket', 'submarine', 'volcano', 'crystal tower', 'queue', 'traffic grid', 'storm cloud', 'sieve',
  'loom', 'reactor', 'drone', 'gearbox', 'pump', 'circuit', 'sensor', 'river channel',
  'reef', 'warehouse pallet', 'glass pane', 'magnetic dish', 'protein fold', 'neural net', 'snow roof', 'solar panel',
  'rail switch', 'market stall', 'greenhouse row', 'beehive', 'ant tunnel', 'black hole', 'asteroid', 'wind rotor',
  'ceramic shelf', 'forge anvil', 'textile sheet', 'molecular lattice', 'pressure vessel', 'data cable', 'acoustic resonator', 'fluid valve',
  'membrane', 'grain pile', 'foam stack', 'graphite plate', 'algae mat', 'wet concrete', 'ice crack', 'smoke plume',
];

const VARIANTS = [
  'wide establishing view', 'cutaway section', 'macro inspection', 'topographic map',
  'instrumented lab view', 'dynamic motion trace', 'damaged failure state', 'system diagram',
];

const MARK_SYSTEMS = [
  'contour-lines', 'vector-streams', 'cellular-patches', 'fracture-webs',
  'ray-bundles', 'particle-swarms', 'volumetric-veils', 'mechanical-arcs',
  'network-nodes', 'layered-strata', 'field-rings', 'glyph-free-silhouettes',
  'heat-isobands', 'pressure-isobars', 'flow-ribbons', 'crystal-facets',
];

const TEXTURE_BASES = [
  'grain-noise', 'marble-veins', 'brushed-anisotropy', 'wet-caustics',
  'ash-speckle', 'fiber-weave', 'biofilm-mottle', 'frost-dendrites',
  'circuit-traces', 'silt-settling', 'smoke-curling', 'lens-interference',
  'pitted-corrosion', 'foam-cells', 'magnetic-spikes', 'plasma-filaments',
];

const LIGHTING_MODELS = [
  'raking-lab-light', 'backlit-translucency', 'thermal-emission', 'specular-studio',
  'underwater-caustic', 'street-sodium-vapor', 'moonlit-cryosphere', 'clinical-flat',
  'industrial-overhead', 'laser-line-scan', 'storm-flash', 'orbital-rim-light',
  'greenhouse-diffuse', 'forge-glow', 'monitor-light', 'diagrammatic-ambient',
];

const MOTION_CUES = [
  'advected-tracers', 'stroboscopic-ghosts', 'curl-vorticity', 'pulse-fronts',
  'impact-shock-rings', 'orbit-fade-trails', 'queue-backlog-waves', 'growth-tip-sprouts',
  'fallout-settling', 'standing-wave-nodes', 'feedback-loop-arrows', 'diffusion-softening',
  'phase-boundary-crawl', 'fracture-propagation', 'swarm-alignment', 'thermal-rise-plumes',
];

const EDGE_TREATMENTS = [
  'hard-machined-edge', 'soft-atmospheric-edge', 'glowing-hot-edge', 'wet-meniscus-edge',
  'cracked-brittle-edge', 'fibrous-torn-edge', 'transparent-caustic-edge', 'granular-pile-edge',
  'charred-irregular-edge', 'frozen-frosted-edge', 'corroded-pitted-edge', 'diagram-cutline-edge',
  'magnetic-field-edge', 'organic-growing-edge', 'optical-fringe-edge', 'compressed-strain-edge',
];

const DENSITY_FIELDS = [
  'sparse-readout', 'dense-turbulence', 'banded-gradient', 'clustered-agents',
  'radial-falloff', 'channelized-flow', 'porous-percolation', 'layered-deposition',
  'lattice-regularity', 'branching-network', 'pressure-hotspot', 'phase-separated',
  'uniform-instrument-grid', 'swarm-flocking', 'thermal-plume-density', 'optical-caustic-density',
];

const DEPTH_MODELS = [
  'flat-diagram-depth', 'cutaway-depth-stack', 'macro-shallow-depth', 'aerial-map-depth',
  'tunnel-perspective-depth', 'orbital-depth-parallax', 'fluid-volume-depth', 'dense-room-depth',
  'microscope-slice-depth', 'mountain-relief-depth', 'transparent-layer-depth', 'machine-section-depth',
];

const USER_COVERAGE_LINES = String.raw`
visual.scene.asteroid-belt.iron-nickel-meteorite.collide.within.wide-establishing-view|Asteroid belt|Iron-nickel meteorite|Collision|Within|High velocity planetary debris fracturing into reflective metallic fragments with glowing ejecta cones and structural fragmentation vectors tracked across a wide cosmic starfield
visual.material.neutron-star.degenerate-neutron-matter.spin.inside.macro-inspection|Neutron star|Degenerate neutron matter|Spin|Inside|Ultradense plasma layers rotating at relativistic speeds with frame dragging warped magnetic field lines and intense gravitational lensing boundaries
visual.process.nebula-cradle.silicate-dust.condense.across.topographic-map|Nebula stellar nursery|Silicate dust|Condensation|Across|Deep space contour lines showing dust density gradients where self gravitating dust knots transition to embryonic protostellar cores with local temperature fields
visual.composition.solar-corona.hydrogen-plasma.reconnect.under.thermal-imaging-profile|Solar corona|Hydrogen plasma|Magnetic reconnection|Under|Bright magnetic loop arcs snapping and releasing thermal energy flares mapped via white hot temperature scales and localized heat flux vectors
visual.scene.exoplanet-atmosphere.methane-ice.sublime.through.spectroscopic-signature|Exoplanet atmosphere|Methane ice|Sublimation|Through|Phase change lines and absorption bands overlaying ice crystals transitioning directly to gas inside a turbulent violet atmospheric background
visual.material.pulsar-jet.gamma-radiation.pulse.along.dynamic-motion-trace|Pulsar pole|Gamma ray photon stream|Pulsation|Along|High frequency energy pulses radiating outward in tight collimated beams with particle velocity graphs and time series wave envelopes
visual.process.supernova-remnant.heavy-elements.expand.around.wide-establishing-view|Supernova remnant shell|Vaporized heavy elements|Expansion|Around|Multi layered fast moving filament shells of nickel gold and iron colliding with cold interstellar gas showing shockwave boundaries
visual.composition.satellite-constellation.xenon-fuel.ionize.across.orbital-vector-map|Low Earth orbit|Xenon ion propellant|Ionization|Across|Pale blue thruster exhausts emitting from orbiting nodes with satellite trajectories horizon lines and orbital inclination vectors
visual.scene.galactic-core.stellar-cluster.gravitate.around.deep-space-render|Galactic center|Mass dense star cluster|Gravitation|Around|Keplerian orbital paths warped into tight high velocity ellipses circling the invisible event horizon of a central black hole
visual.material.comet-tail.diatomic-carbon.fluoresce.under.stroboscopic-exposure|Comet inner coma|Diatomic carbon gas|Fluorescence|Under|Glowing green gas arcs excited by solar wind captured in frozen time slices showing solar radiation pressure deflection vectors
visual.scene.canopy-forest.sapwood-vines.swing.across.dynamic-motion-trace|Rainforest canopy|Sapwood vines|Swing|Across|Monkeys swinging through dense vertical vines with skeletal trace lines velocity vectors and center of mass tracking dots
visual.scene.greyhound-track.synthetic-turf.sprint.along.stroboscopic-exposure|Greyhound racetrack|Synthetic turf|Sprint|Along|Running greyhounds captured at high frame rate with muscle contraction sequences turf particle spray and joint angle markers
visual.material.deep-sea-hydrothermal-vent.mineral-crust.precipitate.around.cutaway-section|Abyssal seafloor vent|Polymetallic sulfide crust|Precipitation|Around|Internal cross section of a vent chimney showing superheated black water exiting into cold ocean with rapid mineral crystallization layers
visual.process.mitosis.chromatin.segregate.inside.macro-inspection|Dividing eukaryotic cell|Chromatin fiber|Segregation|Inside|Sister chromatids pulling apart along spindle fibers with molecular motor vectors and centromere tension indicators
visual.composition.termite-mound.saliva-mud.hollow.through.cutaway-section|Termite spire|Saliva saturated mud|Tunneling|Through|Cross sectional slice of ventilation chimneys showing microclimatic air flow directions egg chambers and moisture gradients
visual.scene.coral-bleaching.calcium-carbonate.dissolve.under.macro-inspection|Dying coral reef|Calcium carbonate skeleton|Dissolution|Under|Porous coral polyps losing symbiotic algae under high ocean acidity with localized pH gradients and structural degradation zones
visual.material.spider-web.glycoprotein.anchor.between.isometric-voxel-grid|Spider web|Glycoprotein silk|Anchoring|Between|Sticky protein micro droplets anchor silk tensioned between branches mapped onto a three dimensional digital voxel coordinate grid
visual.process.photosynthesis.electron-carrier.transfer.inside.system-diagram|Chloroplast thylakoid membrane|Proton gradient|Electron transfer|Inside|Photosystem II schematic with light capture water splitting electron flow arrows and ATP synthase rotary motion
visual.composition.salmon-run.river-bed-gravel.spawn.along.dynamic-motion-trace|Shallow river rapid|River bed gravel|Spawning|Along|Salmon leaping over gravel beds with splashing fluid dynamics tail beat frequency plots and upstream current velocity lines
visual.scene.pitcher-plant.enzymatic-fluid.digest.inside.macro-inspection|Pitcher plant interior|Enzymatic digestive fluid|Digestion|Inside|Chitinous insect shell breaking down inside acidic digestive juices with surface tension curves and nutrient uptake vectors
visual.material.lichen-colony.symbiotic-algae.respire.over.topographic-map|Granite rock face|Lichen thallus|Respiration|Over|Gas exchange pathways over stony rock topography with oxygen concentration gradients and moisture absorption patches
visual.process.mycorrhizal-network.phosphate-ions.exchange.between.microscopic-flux-plot|Root rhizosphere|Phosphate ions|Symbiotic exchange|Between|Fungal hyphae penetrating plant root cell walls with directional nutrient flow arrows and concentration velocity graphs
visual.composition.jellyfish-bloom.bioluminescent-protein.pulse.through.wide-establishing-view|Pelagic ocean|Bioluminescent protein|Pulsation|Through|Thousands of bioluminescent jellyfish drifting in dark deep sea water with light emission decay curves and drift vectors
visual.scene.bacterial-biofilm.extracellular-polymeric-substance.colonize.across.macro-inspection|Medical catheter tube|Extracellular polymeric substance|Colonization|Across|Micro colonies of bacteria embedding in a self produced slime layer with nutrient channel networks and cell signaling nodes
visual.material.beehive-cell.beeswax-honey.seal.inside.macro-inspection|Brood comb|Beeswax and honey|Capping|Inside|Honeycomb cells filled with amber honey sealed with wax plates showing wax gland structures and cell angle measurements
visual.scene.city-intersections.petroleum-exhaust.accelerate.through.dynamic-motion-trace|Urban intersection|Petroleum exhaust|Acceleration|Through|Vehicles accelerating past platform queues with emission plume dispersion contours speed vectors and lane changing trails
visual.scene.high-speed-rail.magnetic-track.levitate.along.wide-establishing-view|Elevated rail corridor|Magnetic track|Levitation|Along|Maglev train floating over guide rails with eddy current heat profiles velocity lines and suspension height metrics
visual.material.micro-electronics-bench.molten-solder.dispense.onto.isometric-voxel-grid|Automated assembly line|Molten solder|Dispensing|Onto|Solder droplets bonding semiconductor chip leads to a circuit board mapped on a micro scale Cartesian voxel grid
visual.process.container-terminal.steel-gantry.hoist.above.system-diagram|Container port|Steel gantry cranes|Hoisting|Above|Loading flow chart with crane arm load capacities truck queue paths container ship hull lines and shipping lane vectors
visual.composition.nuclear-submarine.reactor-cooling-water.circulate.inside.cutaway-section|Submarine reactor room|Pressurized cooling water|Circulation|Inside|Secondary steam loop piping cutaway with heat exchanger tubes coolant flow velocity vectors and radiation shield layers
visual.scene.concrete-demolition.silica-dust.shatter.under.stroboscopic-exposure|Controlled implosion site|Silica dust|Fragmentation|Under|Structural concrete columns fracturing under explosive loads with shock wave boundaries and debris velocity vectors
visual.material.wind-turbine-blade.fiberglass-epoxy.rotate.across.airflow-field-map|Offshore wind farm|Fiberglass epoxy composite|Rotation|Across|Turbine blades spinning through dynamic air currents with pressure differential zones tip vortex spirals and drag forces
visual.process.geothermal-well.superheated-brine.flash.through.system-diagram|Flash power plant|Superheated volcanic brine|Flashing|Through|Flow schematic showing high pressure deep well feed transitioning to low pressure steam separators with turbine blade interfaces
visual.composition.evaporation-ponds.lithium-brine.crystallize.in.topographic-map|Lithium mine salt flats|Concentrated lithium brine|Crystallization|In|Salt pond terrace contours showing salinity levels chemical concentration fields and crystal crust growth boundaries
visual.scene.sorting-hub.cardboard-shreds.divert.along.dynamic-motion-trace|Recycling facility conveyor|Cardboard paper pulp|Diversion|Along|Cardboard pieces sorted by pneumatic air jets with sorting gate states air vector paths and mass flow tracking metrics
visual.material.suspension-bridge.tensile-steel-cable.tension.under.stress-distribution-map|Estuary bridge span|Tensile steel cable|Tension|Under|Bridge hanger cables loaded under traffic weight with finite element stress lines wind load shear vectors and anchor point loads
visual.process.desalination-facility.sea-salt-solution.filter.inside.cutaway-section|Reverse osmosis chamber|Sea salt solution|Filtration|Inside|Micro porous polymer membrane cutaway with sodium ions rejected at the surface clean water permeate paths and brine reject flow
visual.composition.grain-silo.dry-maize.discharge.through.granular-velocity-plot|Agricultural elevator|Dry maize kernels|Discharging|Through|Flow funnel profiles of grain falling through a bottom chute with friction drag layers shear stress lines and mass flow velocity
visual.scene.hydroelectric-generator.turbulent-water.discharge.under.wide-establishing-view|Dam tailrace channel|Aerated water|Discharge|Under|High velocity water exiting turbine drafts into a river bed with hydraulic jump waves vortex fields and concrete erosion plates
visual.material.space-elevator.carbon-nanotube-web.climb.across.orbital-vector-map|Upper thermosphere|Carbon nanotube composite web|Climbing|Across|Ascent climber car moving up the cable with coriolis force distortion solar radiation vector lines and orbital horizon angles
visual.scene.tokamak-fusion.deuterium-tritium.confine.inside.magnetic-flux-profile|Tokamak chamber|Deuterium tritium plasma|Magnetic confinement|Inside|Poloidal and toroidal magnetic field lines looping through plasma with heat flux vectors and plasma density zones
visual.material.cryogenic-dewar.liquid-helium-ii.creep.over.macro-inspection|Low temperature lab|Superfluid liquid helium II|Rollin film creep|Over|Frictionless fluid film climbing inner glass walls with gravity defying thickness profiles and temperature gradient lines
visual.process.graphene-sheet.charge-carrier.conduct.across.molecular-dynamics-simulation|Nano electronic substrate|Two dimensional electron gas|Conduction|Across|Electrons traversing a hexagonal carbon lattice with scattering events quantum interference patterns and lattice phonon waves
visual.composition.hydrogen-fuel-cell.proton-exchange-membrane.hydrate.between.cutaway-section|Clean energy fuel cell|Perfluorosulfonic acid membrane|Proton hydration|Between|Membrane cross section showing hydronium ions moving through sulfonic acid channels from anode to cathode with gas diffusion layers
visual.scene.mass-spectrometer.ionized-gas.deflect.through.instrumented-lab-view|Vacuum analyzer tube|High mass ionized gas|Magnetic deflection|Through|Ion trajectories curving in a magnetic field with mass to charge ratio lanes detector slit alignment and voltage gradient lines
visual.material.thermal-shield.silica-aerogel.freeze.under.thermal-imaging-profile|Extreme insulation test|Ultra low density silica aerogel|Cryogenic insulation|Under|Liquid nitrogen vapor on one side of aerogel with a blowtorch on the other showing the thermal insulation layer
visual.process.photonic-filter.silica-nanospheres.diffract.inside.refractive-index-plot|Optoelectronic waveguide|Colloidal silica nanospheres|Photonic bandgap diffraction|Inside|Ordered colloidal arrays bending light beams with local refractive index boundaries and electromagnetic field strength vectors
visual.composition.battery-anode.lithium-intercalate.insert.into.molecular-dynamics-simulation|Battery cell|Layered graphite structure|Lithium intercalation|Into|Lithium atoms fitting into carbon planes with lattice expansion forces electron density clouds and solvent molecule shells
visual.scene.electromagnet.ferrofluid-bath.spike.around.instrumented-lab-view|Magnetic fluid bench|Magnetite doped oil|Spiking|Around|Ferrofluid spike arrays forming along magnetic field lines with flux density lines surface tension coordinates and coil voltage
visual.material.piezo-actuator.lead-zirconate-titanate.compress.under.stress-distribution-map|Precision stage assembly|Lead zirconate titanate PZT|Piezoelectric compression|Under|Crystal unit cells changing shape under applied voltage with polarization axes mechanical stress vectors and strain gauges
visual.process.molding-die.thermoset-epoxy.polymerize.inside.macro-inspection|Electronics packaging die|Thermoset epoxy resin|Polymerization curing|Inside|Liquid resin crosslinking into a solid polymer matrix with exothermic heat fronts shrinkage cracks and viscosity zones
visual.composition.hadron-detector.liquid-hydrogen.boil.along.particle-track-plot|Bubble chamber tank|Superheated liquid hydrogen|Localized boiling|Along|Spiral subatomic particle tracks formed by micro bubble trails with external magnetic field lines and event vertices
visual.scene.adsorption-column.hydrated-zeolite.exchange.inside.cutaway-section|Gas separation cylinder|Crystalline aluminosilicate zeolite|Adsorptive separation|Inside|Zeolite pore cross section trapping nitrogen while oxygen passes with molecular sieving action and thermal regeneration fronts
visual.material.stent-deployment.nitinol-mesh.expand.under.thermal-imaging-profile|Surgical training simulator|Nitinol shape memory alloy|Thermal phase change expansion|Under|Nitinol mesh expanding inside an artery wall with temperature induced austenitic transformation front
visual.process.reactor-moderator.heavy-water.decelerate.through.system-diagram|Nuclear reactor core|Deuterium oxide heavy water|Neutron thermalization|Through|Core schematic showing fast neutrons scattering off deuterium molecules reducing kinetic energy down to thermal energy loops
visual.scene.tectonic-plate.fault-clay.shear.along.cutaway-section|Fault zone beneath the crust|Friction heated gouge clay|Shearing|Along|Sliding crust layers with high pressure fluid pathways shear displacement lines and frictional heat distribution profiles
visual.material.thunderstorm.ionized-channel.discharge.under.stroboscopic-exposure|Atmospheric storm system|Ionized air plasma lightning channel|Dielectric breakdown discharge|Under|Stepped leader paths and return strokes frozen in microseconds with corona expansion envelopes and magnetic shock fronts
visual.process.desert-valley.sand-quartz.saltate.across.topographic-map|Crescent sand dune|Wind blown quartz sand|Saltation transport|Across|Wind vector maps showing sand grains bouncing and impacting with windward shear stresses and lee side avalanche planes
visual.composition.fjords.meltwater-glacier.calve.into.wide-establishing-view|Arctic glacier terminus|Fractured ice and meltwater|Calving|Into|Giant ice blocks separating from glacier walls with internal shear stress planes buoyancy displacement waves and splash dynamics
visual.scene.thermal-basin.boiling-silica.spout.through.wide-establishing-view|Geothermal geyser pool|Mineralized superheated water|Geyser eruption spout|Through|Steam driven water jets erupting from underground silica vents with subsurface pressure profiles and cooling sinter terraces
visual.material.lithosphere.oceanic-basalt.melt.under.cutaway-section|Mantle subduction interface|Hydrated oceanic basalt|Partial melting|Under|Earth crust sliding into mantle with water release pathways magma chamber formation and solidus liquidus isotherms
visual.process.tornado-funnel.dusty-silt.swirl.around.airflow-field-map|Agricultural plain|Loam silt dust|Vortex swirling|Around|Tornado vortex wind vectors showing dynamic pressure dips updraft speed contours and centrifugal dust ejection zones
visual.composition.karst-system.limestone-solution.drip.from.macro-inspection|Cave chamber ceiling|Calcium bicarbonate saturated water|Stalactite precipitation|From|Mineral rich water drops falling from stalactite tips with calcite ring growth planes and evaporation rates
visual.scene.convective-cell.water-droplets.condense.within.meteorological-radar-view|Active thunderstorm cell|Water vapor and supercooled droplets|Latent heat condensation|Within|Cross sectional doppler radar showing updrafts dense precipitation zones and convective cell boundary flows
visual.material.tundra.peat-ice-permafrost.thaw.along.topographic-map|Subarctic peat bog|Peat ice and permafrost|Permafrost degradation thaw|Along|Thermal maps showing sinking soil terraces expanding thermokarst lakes and methane release pathways
visual.process.polluted-forest.acid-solution.deposit.over.environmental-impact-map|High altitude pine forest|Acid rain sulfuric nitric solution|Wet deposition|Over|pH level map showing needle canopy damage soil calcium depletion indices and runoff stream acidification
visual.composition.oceanic-subgyre.suspended-polystyrene.circulate.in.current-drift-map|Pelagic convergence zone|Microplastic fragments|Subgyre accumulation|In|Sea surface current paths showing garbage patch boundaries plastic particle count densities and convergence eddies
visual.scene.magma-chamber.buoyant-peridotite.rise.under.cutaway-section|Beneath a volcanic island|Semi molten mantle rock peridotite|Diapiric upwelling buoyancy|Under|Earth mantle cutaway showing mantle plume pathways local density shifts and crustal deformation vectors
visual.material.salt-lake.brine-crust.crack.under.wide-establishing-view|Dry endorheic basin|Evaporated halite crust|Desiccation cracking|Under|Polygonal mud crack fields stretching to the horizon with expansion tension zones and salt evaporation margins
visual.process.meteorological-front.dense-cold-air.wedge.under.meteorological-radar-view|Midwestern storm line|Cold air mass|Frontal wedging|Under|Cross sectional weather map showing warm air forced upward convective rain band locations and frontal wind shifts
visual.scene.quantum-circuit.niobium-qubits.entangle.across.phase-state-map|Cryogenic processor dilution fridge|Superconducting niobium qubits|Quantum entanglement|Across|State constellation diagram showing qubit coupling vectors phase coherence metrics and microwave control pulse paths
visual.material.photolithography.polymeric-photoresist.etch.under.microscopic-sem-view|Semiconductor cleanroom|Light sensitive polymer resist|Plasma etch development|Under|Sub 10nm silicon channel profiles with ion bombard direction pattern edge roughness and resist mask residues
visual.process.tensor-core.activation-elements.propagate.through.system-diagram|AI accelerator chip|Floating point activations|Matrix multiply accumulate propagation|Through|Processing core schematic showing register file buses systolic array multipliers and memory access corridors
visual.composition.datacenter-manifold.dielectric-fluid.boil.inside.thermal-imaging-profile|Two phase immersion cooling tank|Fluorinated dielectric liquid|Nucleate boiling heat transfer|Inside|Server blade heat sinks with vapor bubble nucleation sites vapor chimney risers and cold plate thermal maps
visual.scene.optical-transceiver.laser-photons.refract.along.optical-power-plot|Fiber optic connection port|Monomode glass core|Optical refraction|Along|Laser beams reflecting through fiber cores with signal dispersion curves core cladding boundary and decibel loss plots
visual.material.magnetic-platter.cobalt-alloy.magnetize.under.magnetic-force-microscopy|Hard disk drive surface|Granular cobalt alloy thin film|Magnetic domain write|Under|Microscopic magnetic domains representing binary state tracks with read write head paths and domain transition boundaries
visual.process.semiconductor-laser.indium-phosphide.emit.into.optical-bench-projection|Laser diode testing bench|Indium phosphide gain medium|Stimulated emission|Into|Waveguide exit aperture with optical beam divergence cones spectral line width graphs and optical axis alignment rails
visual.composition.silicon-puf.entropy-cells.challenge.within.system-diagram|Hardware security module|Manufacturing variant silicon gates|Physically unclonable function lookup|Within|Circuit diagram showing manufacturing path mismatches voltage frequency margins and digital challenge response key lines
visual.scene.switch-fabric.data-packets.route.through.latency-topology-map|Core network switch|Ethernet frame queues|Non blocking routing|Through|Routing map showing queue buffers port connection lanes packet drop locations and microseconds latency scales
visual.material.oled-display.organic-molecules.luminesce.under.subpixel-macro-inspection|Mobile display panel|Organic phosphorescent molecules|Electroluminescent emission|Under|Red green blue subpixel arrays with charge injection pathways organic layer stacks and pixel color filter borders
visual.process.haptic-device.dielectric-elastomer.contract.along.stroboscopic-exposure|VR glove actuator bench|Flexible dielectric elastomer|Electrostatic contraction|Along|Elastomer sheets contracting under high voltage with deflection profiles strain gauges and actuation time series
visual.composition.printed-circuit-board.copper-buses.induct.across.instrumented-lab-view|High speed server motherboard|Copper transmission buses|Signal inductance|Across|Traces carrying high frequency signals with electromagnetic field envelopes crosstalk vector lines and scope probes
visual.scene.lidar-bench.laser-pulses.scatter.around.point-cloud-grid|Autonomous vehicle lidar sensor|Nanosecond laser pulses|ToF ranging|Around|Laser beams sweeping across a street with reflection targets distance calculations and resulting 3D coordinate point cloud
visual.material.biosensor.functionalized-silver.conduct.across.stress-distribution-map|Flexible medical diagnostic patch|Printed silver nanoparticle ink|Bio impedance tracking|Across|Conductive traces flexing on patient skin with structural micro cracks local resistance graphs and mechanical strain lines
visual.process.silicon-anode.lithium-atoms.expand.inside.microscopic-sem-view|Solid state battery|Silicon anode material|Lithiation induced volume expansion|Inside|Silicon microparticles expanding and fracturing under charging with lithiation fronts mechanical stress lines and contact loss
visual.scene.archaeological-trench.loam-strata.excavate.under.photogrammetric-mesh|Bronze Age dig site|Stratified loam and ash layers|Stratigraphic excavation|Under|Dig trench grid with soil color profiles artifact location markers soil composition readouts and excavation level lines
visual.material.suture-interface.synthetic-mesh.suture.across.surgical-microscope-view|Hernia repair zone|Biocompatible monofilament mesh|Suture anchoring|Across|Abdominal wall repair view with mesh fiber weaves needle entry arcs suture knot tensions and tissue anchor points
visual.process.grain-silo.wheat-dust.explode.inside.cutaway-section|Agricultural storage complex|Dispersed dry wheat dust|Dust explosion propagation|Inside|Steel silo structure split open by internal pressure with combustion front waves air intake vectors and pressure wave lines
visual.composition.bunker-tank.marine-diesel.combust.along.maritime-trade-route|Ship engine cylinder|Low sulfur marine diesel|Piston compression combustion|Along|Combustion chamber cutaway showing fuel spray plumes flame fronts cylinder pressure plots and maritime route tracks
visual.scene.market-floor.order-slips.shred.around.sentiment-index-plot|Historic trading pit floor|Paper order slips|Transaction disposal|Around|Discarded order slips falling on a trading floor overlaying a realtime price trend line and market index
visual.material.velodrome-track.carbon-laminate.spin.along.dynamic-motion-trace|Cycling track curve|Carbon fiber wheel laminate|Centrifugal tire rotation|Along|Bicycle tires moving on a pine wood track with tire deformation contact patches wheel speed vectors and rider lean angles
visual.process.foundry-crucible.molten-bronze.cast.into.instrumented-lab-view|Sculptural casting floor|Molten copper tin alloy bronze|Gravity casting flow|Into|Liquid metal filling a ceramic shell mold with temperature profiles vent gas paths and metal shrinkage rates
visual.composition.archery-range.carbon-epoxy.flex.under.stroboscopic-exposure|Outdoor target range|Carbon epoxy composite shaft|Archer paradox flexure|Under|High speed progression of an arrow leaving the bow with shaft vibration waves nock disengagement arcs and target trajectories
visual.scene.cleanroom-wet-bench.deionized-water.rinse.over.microscopic-sem-view|Semiconductor cleaning station|Deionized water film|Wafer surface rinse|Over|Ultra pure water sweeping away microparticles from a silicon substrate with fluid shear stress and particle adhesion lines
visual.material.well-plate.serum-fluid.incubate.inside.laboratory-well-plate|Medical diagnostic laboratory|Dried blood serum|Antibody incubation|Inside|ELISA test wells showing micro titer plates colorimetric enzyme reaction lines and absorption value graphs
visual.process.rotary-printing.offset-ink.transfer.onto.stroboscopic-exposure|High speed newsprint press|Pigmented oil based ink|Offset plate transfer|Onto|Roller contact nip lines transferring ink to a paper web with plate wear points ink feed thickness and paper speed
visual.composition.rooftop.asphalt-shingles.radiate.over.thermal-imaging-profile|Urban residential block|Asphalt composition shingles|Radiant heat emission|Over|Building roofs under afternoon sun with thermal maps heat conduction vectors and convective air plumes
visual.scene.mine-shaft.slurry-fluid.pump.through.geological-section|Deep underground gold mine|High density tailings slurry|Slurry transport|Through|Mine pipe cross section showing solid liquid distribution pipe wall shear stresses slurry flow speed and mine depth
visual.material.electric-kiln.cobalt-carbonate.fuse.inside.kiln-inspection-view|Pottery firing studio|Silica cobalt glaze melt|Glaze fusion sintering|Inside|Ceramic surface melting into a blue glass coating with bubble release craters glaze pool flow directions and temperature gauges
visual.process.orbital-tracker.laser-photons.triangulate.between.orbital-vector-map|Satellite laser ranging station|Pulsed laser photon stream|Time of flight triangulation|Between|Laser beams connecting ground stations with an orbiting satellite with satellite orbits Earth grid coordinates and range calculations
`;

const USER_COVERAGE_LINES_101_200 = String.raw`
visual.scene.cosmic-web.dark-matter-halos.cluster.along.large-scale-structure-map|Cosmic web large scale structure|Dark matter halos|Gravitational clustering|Along|Galaxy filaments threading through void boundaries with lensing contours halo merger vectors and web scale density gradients
visual.material.interstellar-cloud.polycyclic-aromatic-hydrocarbons.glow.under.infrared-survey-view|Dusty interstellar cloud|Polycyclic aromatic hydrocarbons|Infrared fluorescence glow|Under|Carbon molecules fluorescing inside dusty star forming gas with infrared survey bands and embedded protostar knots
visual.process.protoplanetary-disk.ice-coated-grains.accrete.around.orbital-vector-map|Young protoplanetary disk|Ice coated dust grains|Planetesimal accretion|Around|Dust grains sticking into planetesimal rings around a young star with snowline bands gas drag and collision vectors
visual.composition.rogue-planet.frozen-nitrogen-dunes.drift.across.wide-establishing-view|Rogue planet cryogenic desert|Frozen nitrogen dunes|Wind drift|Across|Wind carved nitrogen terrain under faint starlight with dune migration streaks cold haze and black horizon shadows
visual.scene.europa-ocean.salty-ice-shell.fracture.through.cutaway-section|Europa ocean ice shell|Salty ice shell|Tidal fracture|Through|Cracked ice shell over liquid ocean with tidal flex heat vectors brine channels and plume fault geometry
visual.material.mars-regolith.perchlorate-dust.oxidize.over.topographic-map|Martian oxidizing soil plain|Perchlorate dust|UV oxidation|Over|Red soil chemistry under ultraviolet exposure with dust devil trails perchlorate patches and rover sampling contours
visual.process.venus-clouddeck.sulfuric-acid-droplets.circulate.within.atmospheric-profile|Venus superrotating cloud deck|Sulfuric acid droplets|Atmospheric circulation|Within|Acid haze bands in super rotating atmosphere with layered wind vectors ultraviolet absorber streaks and thermal depth markers
visual.composition.titan-lake.liquid-methane-rain.collect.inside.cryogenic-landscape|Titan polar lake basin|Liquid methane rain|Cryogenic collection|Inside|Hydrocarbon rain feeding black polar lakes with drainage channels orange haze and low temperature shoreline ripples
visual.scene.ringed-planet.icy-ring-particles.shear.along.orbital-vector-map|Ringed planet particle disk|Icy ring particles|Orbital shear|Along|Ring gaps shepherd moon wakes particle density waves and differential velocity ribbons around a giant planet
visual.material.lunar-polar-crater.water-ice.sublime.under.thermal-shadow-map|Permanently shadowed lunar crater|Water ice in regolith|Vacuum sublimation|Under|Ice trapped in cold crater soil with thermal shadow maps neutron signatures and sunlit rim temperature contrast
visual.process.early-earth.iron-rich-ocean.precipitate.across.geochemical-map|Anoxic early Earth ocean|Iron rich seawater|Iron precipitation|Across|Banded iron formation layers growing below an anoxic sky with oxygen fronts and seafloor chemical gradients
visual.composition.alkaline-vent.proton-gradient.drive.within.origin-of-life-cutaway|Alkaline hydrothermal vent pores|Natural proton gradient|Proto metabolic driving|Within|Mineral pores pH gradients proto metabolic channels and iron sulfur surfaces inside an origin of life cutaway
visual.scene.rna-world.nucleotide-soup.replicate.inside.molecular-dynamics-simulation|Wet mineral RNA world pocket|Nucleotide soup|Template replication|Inside|RNA strands copying inside wet mineral pockets with base pairing errors magnesium ions and thermal cycling boundaries
visual.material.viral-capsid.protein-shell.assemble.around.macro-inspection|Virus assembly site|Protein capsid shell|Geometric assembly|Around|Capsid proteins locking around genetic material with icosahedral seams electrostatic patches and packaging pressure markers
visual.process.archaea-mat.methane-bubbles.release.through.microbial-flux-plot|Anaerobic archaea sediment mat|Methane bubble clusters|Microbial gas release|Through|Sediment layers producing methane bubbles with microbial flux graphs redox bands and trapped gas pockets
visual.composition.human-gut-microbiome.short-chain-fatty-acids.diffuse.between.biological-network-map|Human gut microbiome ecosystem|Short chain fatty acids|Metabolite diffusion|Between|Microbial colonies exchanging metabolites with gut wall uptake arrows pH zones and colony interaction networks
visual.scene.neuron-synapse.neurotransmitter-vesicles.release.into.macro-inspection|Neuron synapse terminal|Neurotransmitter vesicles|Synaptic release|Into|Vesicles fusing with membrane receptor activation fields calcium channels and postsynaptic response traces
visual.material.retina-photoreceptor.opsin-pigment.isomerize.under.optical-response-plot|Retina photoreceptor disc stack|Opsin pigment molecule|Photon isomerization|Under|Photon absorption triggering signal cascades with opsin shape change ion channel response and optical sensitivity curves
visual.process.inner-ear-hair-cells.endolymph-wave.transduce.along.microscopic-motion-trace|Inner ear hair cell row|Endolymph wave motion|Mechanotransduction|Along|Vibration bending stereocilia into neural signals with tip link strain basilar membrane phase and firing traces
visual.composition.lung-alveoli.oxygen-molecules.exchange.across.cutaway-section|Lung alveolar capillary interface|Oxygen molecules|Gas exchange|Across|Oxygen diffusion through capillary membranes with surfactant film red blood cells and partial pressure gradients
visual.scene.immune-lymph-node.t-cells.scan.through.dynamic-motion-trace|Immune lymph node network|T cells|Antigen scanning|Through|Immune cells navigating antigen presenting networks with chemokine trails contact dwell times and follicle boundaries
visual.material.bone-marrow.hematopoietic-stem-cells.differentiate.inside.cell-lineage-map|Bone marrow stem niche|Hematopoietic stem cells|Blood lineage differentiation|Inside|Blood cell lineages branching from stem niches with cytokine gradients stromal support and fate tree colors
visual.process.embryo-gastrulation.cell-sheets.fold.into.developmental-morphology-view|Embryo gastrulation field|Cell sheets|Morphogenetic folding|Into|Tissue layers bending into body axis structures with cell traction arrows morphogen stripes and germ layer boundaries
visual.composition.skin-wound.fibrin-matrix.clot.over.macro-inspection|Skin wound surface|Fibrin matrix|Clot formation|Over|Platelet mesh collagen repair inflammation gradients and epithelial closing front across a wound bed
visual.scene.elephant-savanna.dry-grass.trample.along.ecological-motion-map|Elephant savanna corridor|Dry grass stems|Herd trampling|Along|Herd paths reshaping vegetation and dust flows with footprint compaction water seeking routes and grazing edges
visual.material.bird-feather.keratin-barbs.interlock.across.macro-inspection|Bird feather vane|Keratin barbs and barbules|Microhook interlocking|Across|Feather microhooks airflow smoothing iridescent edges and barbule alignment under macro inspection
visual.process.bat-cave.ultrasound-waves.echo.between.acoustic-field-map|Bat cave chamber|Ultrasound pressure waves|Echolocation echoing|Between|Echolocation cones reflecting from cave walls with delay rings prey silhouettes and acoustic intensity lobes
visual.composition.whale-song.seawater-pressure-waves.propagate.through.ocean-acoustic-profile|Open ocean sound channel|Seawater pressure waves|Long range propagation|Through|Low frequency whale sound paths bending through ocean layers with bathymetry shadows and spectrogram harmonics
visual.scene.octopus-den.changing-chromatophores.camouflage.over.dynamic-color-map|Octopus rocky den|Changing chromatophore pigment field|Adaptive camouflage|Over|Skin pigment cells matching rock texture with papillae changes neural color control and background sampling patches
visual.material.snail-shell.aragonite-crystal.grow.around.spiral-geometry-view|Snail shell growth edge|Aragonite crystal layers|Spiral shell growth|Around|Calcium carbonate spiral deposition with growth bands mantle edge chemistry and logarithmic coil geometry
visual.process.butterfly-wing.chitin-scales.interfere.under.nanostructure-optics-view|Butterfly wing scale field|Chitin scale ridges|Structural color interference|Under|Nanoscale ridges producing color with diffraction angles polarized light and microscopic scale stacks
visual.composition.frog-pond.gelatinous-eggs.develop.inside.wetland-macro-view|Frog pond egg cluster|Gelatinous egg matrix|Embryo development|Inside|Transparent egg clusters showing embryos forming cell stages oxygen diffusion and wetland plant reflections
visual.scene.wheat-field.starch-granules.fill.within.agricultural-growth-map|Irrigated wheat field|Starch granules|Grain filling|Within|Grain heads accumulating starch under sun and irrigation with canopy moisture maps and harvest maturity bands
visual.material.rice-paddy.anaerobic-mud.emit.through.methane-flux-map|Flooded rice paddy|Anaerobic mud|Methane emission|Through|Flooded soil producing greenhouse gas bubbles between rice stems with root exudates and flux chamber readings
visual.process.vineyard-grapes.sugar-solution.ferment.inside.biochemical-cutaway|Fermenting grape vat|Sugar solution|Yeast fermentation|Inside|Yeast converting sugars into ethanol and CO2 inside grape must with bubble trails and flavor compound gradients
visual.composition.coffee-roaster.cellulose-beans.pyrolyze.within.thermal-profile|Coffee roasting drum|Cellulose rich coffee beans|Bean pyrolysis|Within|Beans browning oils emerging and aromatic compounds forming with first crack pulses and thermal profile curves
visual.scene.bread-dough.gluten-network.rise.inside.macro-inspection|Proofing bread dough|Gluten network|Yeast rise|Inside|Yeast bubbles stretching elastic protein strands with gas pockets humidity control and dough expansion grid
visual.material.cheese-rind.microbial-culture.ripen.over.surface-colony-map|Aging cheese rind surface|Microbial culture colony|Surface ripening|Over|Molds and bacteria transforming milk proteins with rind colony map salt gradients and humidity spots
visual.process.beer-brew-kettle.hop-resins.isomerize.through.chemical-process-view|Beer brew kettle|Hop resin compounds|Alpha acid isomerization|Through|Bitter compounds dissolving in boiling wort with steam plumes hop particle flow and chemical conversion curves
visual.composition.vertical-farm.nutrient-mist.feed.between.system-diagram|Vertical farm root rack|Nutrient mist aerosol|Hydroponic feeding|Between|Hydroponic roots LED spectra sensor controlled flow and nutrient dosing loops between stacked trays
visual.scene.floodplain.clay-silt.deposit.across.hydrological-map|River floodplain basin|Clay silt sediment|Overbank deposition|Across|River overflow laying sediment ribbons with levee breaks flow velocity and soil texture bands
visual.material.mangrove-root.saltwater-filter.through.ecosystem-cutaway|Mangrove root zone|Saltwater and suspended sediment|Root filtration|Through|Roots excluding salt while stabilizing mud with pore pressure channels fish nurseries and tidal flushing
visual.process.wildfire-forest.resinous-wood.flashover.through.thermal-imaging-profile|Resinous forest canopy|Resinous wood fuel|Canopy flashover|Through|Canopy fire spread ember vectors radiant heat plume and crown ignition thresholds in thermal profile
visual.composition.postfire-soil.biochar-ash.recover.over.ecological-succession-map|Postfire forest floor|Biochar ash soil layer|Ecological recovery|Over|Nutrients seedlings erosion risk and regrowth patches mapped across burn severity zones
visual.scene.monsoon-city.stormwater-runoff.surge.through.infrastructure-map|Monsoon city drainage network|Stormwater runoff|Flood surge|Through|Streets drains floodwater paths overflow nodes and pump station constraints during intense rainfall
visual.material.airport-runway.rubber-deposits.shear.under.friction-map|Airport runway touchdown zone|Rubber tire deposits|Braking shear|Under|Tire marks braking heat rain film skid risk and friction coefficient bands across runway surface
visual.process.elevator-shaft.steel-cable.lift.along.cutaway-section|Elevator shaft cutaway|Steel cable and counterweight system|Vertical lifting|Along|Counterweights pulleys load vectors safety brakes and cabin position inside a shaft section
visual.composition.skyscraper-frame.wind-load.oscillate.through.structural-mode-shape|Skyscraper structural frame|Wind load pressure field|Structural oscillation|Through|Building sway tuned mass damper stress nodes and mode shape curves through tall frame geometry
visual.scene.water-treatment-plant.activated-carbon.adsorb.inside.process-diagram|Water treatment filter plant|Activated carbon bed|Contaminant adsorption|Inside|Contaminant molecules trapped in porous filter beds with breakthrough curves backwash lines and flow headers
visual.material.landfill-cell.municipal-waste.decompose.under.environmental-section|Engineered landfill cell|Municipal waste strata|Anaerobic decomposition|Under|Methane wells leachate drains waste layers settlement gauges and liner protection below a capped cell
visual.process.metro-map.passenger-flow.distribute.across.civic-network-map|Urban metro rail map|Passenger flow density|Network distribution|Across|Crowd movement station load transfer pressure and train headway waves across a civic transit graph
visual.composition.emergency-room.triage-tags.prioritize.between.operations-dashboard|Emergency room operations board|Triage tags|Clinical prioritization|Between|Patient queues treatment bays urgency colors resource bottlenecks and handoff timers in an operations dashboard
visual.scene.court-record.evidence-documents.link.through.knowledge-graph-view|Court record knowledge graph|Evidence documents|Evidentiary linking|Through|Timelines testimony links contradiction markers exhibits and case arguments connected through a legal knowledge graph
visual.material.library-archive.acidic-paper.yellow.over.conservation-macro-view|Library archive shelf|Acidic paper fibers|Paper yellowing|Over|Cellulose decay humidity damage preservation patches and brittle fiber cracks in a conservation macro view
visual.process.printing-press.cmyk-ink.register.across.high-speed-inspection|High speed color printing press|CMYK ink layers|Registration alignment|Across|Color plates aligning over paper web with registration marks plate drift and camera inspection overlays
visual.composition.music-studio.sound-waves.mix.between.spectral-analysis-view|Music studio mixing desk|Layered sound waves|Audio mixing|Between|Tracks combining in frequency bands stereo field panning and compressor envelopes across spectral analysis view
visual.scene.theater-stage.tungsten-light.cast.over.lighting-design-map|Theater stage lighting plan|Tungsten light beams|Stage casting|Over|Spotlights shadows blocking paths color gels and scenic focus zones on a lighting design map
visual.material.oil-paint.linseed-binder.dry.through.cross-section-macro|Oil painting cross section|Linseed oil binder|Oxidative drying|Through|Pigment layers oxidizing into hardened film with crackle boundaries varnish sheen and drying front layers
visual.process.ceramic-wheel.wet-clay.center.along.rotational-motion-trace|Ceramic wheel studio|Wet clay body|Wheel centering|Along|Hands shaping clay under spin and water film with wobble correction pressure rings and rotational trace
visual.composition.glassblowing-pipe.molten-silica.inflate.into.thermal-workshop-view|Glassblowing hot shop|Molten silica glass|Breath inflation|Into|Glowing bubble forming with breath pressure wall thickness gauges and furnace color in thermal workshop view
visual.scene.textile-dye-vat.indigo-molecules.reduce.inside.chemical-bath-view|Indigo textile dye vat|Indigo dye molecules|Chemical reduction|Inside|Cloth dipping oxidation color shift dye gradients and reducing bath chemistry around submerged fibers
visual.material.violin-string.steel-core.vibrate.along.acoustic-mode-map|Violin string bridge span|Steel core string|String vibration|Along|Harmonics bow contact standing waves and bridge coupling across an acoustic mode map
visual.process.choral-hall.human-voices.resonate.within.spatial-audio-map|Choral concert hall|Human voice wavefronts|Architectural resonance|Within|Overlapping vocal wavefronts in architecture with reverberation tails choir placement and spatial audio lobes
visual.composition.football-field.grass-turf.compress.under.motion-capture-view|Football field turf surface|Grass turf blades|Cleat compression|Under|Cleat pressure body trajectories turf deformation and impact forces under a motion capture overlay
visual.scene.swimming-pool.chlorinated-water.turbulate.around.fluid-dynamics-view|Competition swimming pool lane|Chlorinated water|Swimmer turbulence|Around|Swimmer vortices lane wake surface waves bubbles and drag fields in fluid dynamics view
visual.material.ski-slope.compacted-snow.melt.under.friction-thermal-map|Groomed ski slope|Compacted snow crystals|Frictional melting|Under|Ski edges meltwater film crystal shear and pressure heating across a friction thermal map
visual.process.climbing-wall.chalk-powder.adhere.over.contact-force-map|Indoor climbing wall|Chalk powder|Adhesion and grip|Over|Grip points friction zones hand pressure and chalk residue mapped across holds and contact forces
visual.composition.surgical-robot.titanium-instruments.pivot.through.endoscopic-view|Surgical robot endoscopic field|Titanium instruments|Robotic pivoting|Through|Tool paths tissue boundaries precision arcs and remote center of motion inside an endoscopic view
visual.scene.mri-scanner.hydrogen-protons.precess.inside.medical-imaging-diagram|MRI scanner bore|Hydrogen protons|Magnetic precession|Inside|Magnetic gradients RF pulses slice selection and proton spin phase inside a medical imaging diagram
visual.material.ultrasound-gel.acoustic-couplant.transmit.between.clinical-wave-map|Clinical ultrasound probe interface|Ultrasound gel couplant|Acoustic transmission|Between|Impedance matching between probe and tissue with wave fronts reflection losses and coupling layer thickness
visual.process.insulin-pump.microfluidic-dose.release.through.device-cutaway|Insulin pump cartridge|Microfluidic insulin dose|Pulsed dose release|Through|Cartridge cannula flow pulses dose ledger and occlusion sensor paths inside a device cutaway
visual.composition.vaccine-vial.lipid-nanoparticles.suspend.inside.pharmaceutical-macro-view|Cold chain vaccine vial|Lipid nanoparticles|Suspension stability|Inside|Particles suspended in cold chain vial fluid with glass wall frost and concentration stability bands
visual.scene.operating-room.sterile-airflow.laminarize.over.clinical-flow-map|Operating room clean zone|Sterile filtered airflow|Laminar flow control|Over|Filtered air sheets preventing contamination with surgical lights door turbulence and sterile field boundaries
visual.material.dental-enamel.hydroxyapatite.demineralize.under.macro-inspection|Dental enamel surface|Hydroxyapatite mineral|Acid demineralization|Under|Acid attack pores and remineralization boundary across enamel rods under macro inspection
visual.process.kidney-nephron.urea-solution.filter.through.biological-cutaway|Kidney nephron unit|Urea rich filtrate solution|Renal filtration|Through|Glomerulus tubules osmotic gradients and urea concentration changes inside a biological cutaway
visual.composition.liver-lobule.bile-salts.transport.between.microvascular-map|Liver lobule microstructure|Bile salts|Canalicular transport|Between|Sinusoids hepatocytes bile canaliculi and portal triads connected by microvascular flow routes
visual.scene.ai-datacenter.gpu-heat.export.through.thermal-topology-map|AI datacenter rack hall|GPU heat field|Heat export|Through|Racks coolant flow workload hotspots and heat rejection loops in a thermal topology map
visual.material.hbm-stack.silicon-interposer.route.across.semiconductor-package-view|Advanced GPU package|Silicon interposer signal grid|High bandwidth routing|Across|Memory stacks microbumps signal paths and power delivery across a semiconductor package view
visual.process.robot-hand.force-sensors.grip.around.haptic-feedback-map|Robot hand gripper|Force sensor arrays|Adaptive gripping|Around|Tactile arrays controlling object pressure with slip detection contact patches and haptic feedback map
visual.composition.warehouse-fleet.autonomous-carts.negotiate.between.routing-simulation-view|Warehouse robot fleet|Autonomous cart agents|Multi agent negotiation|Between|Robots avoiding jams in aisle networks with task priority route swaps and congestion forecasts
visual.scene.smartphone-camera.cmos-pixels.integrate.under.sensor-macro-view|Smartphone camera sensor|CMOS pixel wells|Photon charge integration|Under|Photons accumulating charge across pixel wells with microlenses color filters and rolling shutter timing
visual.material.satellite-antenna.gold-plated-mesh.deploy.across.orbital-engineering-view|Satellite deployable antenna|Gold plated mesh reflector|Orbital deployment|Across|Folded antenna opening in space with hinge geometry tension lines and Earth limb background
visual.process.radio-telescope.microwave-signals.correlate.between.interferometry-map|Radio telescope array|Microwave sky signals|Interferometric correlation|Between|Dishes combining sky signals into baselines with phase delays uv coverage and synthesized beam
visual.composition.blockchain-ledger.hash-blocks.link.through.system-diagram|Blockchain ledger timeline|Hash linked blocks|Cryptographic linking|Through|Blocks forks confirmations and hash paths connected through a consensus system diagram
visual.scene.quantum-network.entangled-photons.teleport.between.phase-state-map|Quantum communication network|Entangled photons|Quantum teleportation|Between|Paired photons Bell measurement fiber links and classical channel reconciliation in phase state space
visual.material.privacy-screen.liquid-crystal-align.under.polarization-view|Privacy screen LCD layer|Liquid crystal molecules|Polarization alignment|Under|LCD molecules rotating light transmission with polarizer angles viewing cone limits and privacy cutoff band
visual.process.voice-assistant.audio-features.embed.through.neural-network-map|Voice assistant inference stack|Audio feature tensors|Neural embedding|Through|Spectrogram tokens moving through attention layers with phoneme regions intent vectors and confidence scores
visual.composition.search-index.document-vectors.cluster.across.embedding-space-view|Search embedding index|Document vector field|Semantic clustering|Across|Semantic clusters query vector nearest neighbors and score falloff across embedding space view
visual.scene.financial-clearinghouse.settlement-messages.reconcile.between.operations-dashboard|Financial clearinghouse operations desk|Settlement messages|Ledger reconciliation|Between|Ledgers matching transactions exceptions netting windows and counterparty risk in operations dashboard
visual.material.identity-card.holographic-foil.diffract.under.security-inspection-view|Identity card inspection table|Holographic security foil|Optical diffraction|Under|Anti counterfeit rainbow layers microtext guilloche patterns and tilt dependent verification bands
visual.process.voting-precinct.paper-ballots.tabulate.inside.civic-audit-view|Voting precinct count room|Paper ballots|Ballot tabulation|Inside|Ballots sorted counted audited with chain of custody markers observer stations and discrepancy bins
visual.composition.supply-chain.pallet-rfid-tags.track.through.logistics-network-map|Supply chain logistics map|Pallet RFID tags|Shipment tracking|Through|Shipments moving across warehouses trucks ports and scanners with dwell time and exception routes
visual.scene.earthquake-city.reinforced-concrete.resonate.under.seismic-mode-map|Earthquake city block|Reinforced concrete frames|Seismic resonance|Under|Buildings shaking under ground motion waves with mode shapes soft stories and damage probability bands
visual.material.fire-sprinkler-water.mist.atomize.over.emergency-response-view|Fire sprinkler spray zone|Water mist droplets|Droplet atomization|Over|Droplets cooling smoke and flame zones with spray cone coverage heat absorption and visibility clearing
visual.process.avalanche-slope.snow-slab.release.along.terrain-hazard-map|Avalanche starting zone|Layered snow slab|Slab release|Along|Slab fracture runout path buried weak layers and terrain traps on a hazard map
visual.composition.hurricane-eye.seawater-aerosols.spiral.around.satellite-radar-view|Hurricane eye and eyewall|Seawater aerosols|Cyclonic spiral motion|Around|Eyewall bands rainfall rate wind vectors and ocean spray spiraling around a calm eye
visual.scene.carbon-capture-column.amine-solution.absorb.inside.industrial-cutaway|Industrial carbon capture absorber|Amine solution|CO2 absorption|Inside|CO2 binding in packed tower fluid with solvent loading heat release and flue gas flow
visual.material.green-roof.substrate-soil.retain.over.urban-water-map|Urban green roof system|Substrate soil layer|Stormwater retention|Over|Plants absorbing stormwater above city buildings with drain delay curves root uptake and runoff reduction
visual.process.rewilded-river.woody-debris.redirect.across.ecological-flow-map|Rewilded river reach|Woody debris structures|Channel redirection|Across|Logs reshaping channels habitat pools sediment bars and floodplain reconnection in ecological flow map
visual.composition.planetary-boundaries.human-emissions.couple.within.earth-system-dashboard|Planetary boundaries dashboard|Human emissions and extraction flows|Earth system coupling|Within|Atmosphere biosphere industry oceans and feedback loops connected in one systems map with risk thresholds
`;

const EXTREME_BOUNDARY_LINES = String.raw`
visual.scene.cosmic-microwave-background.primordial-plasma.fluctuate.across.sky-anisotropy-map|Primordial universe at recombination epoch|Recombining hydrogen plasma|Thermal fluctuation|Across|Micro kelvin temperature variations mapped onto a spherical sky projection showing cold and hot acoustic oscillation spots
visual.material.intergalactic-void.dark-energy.expand.through.wide-establishing-view|Cosmic void between galaxy filaments|Dark energy|Spacetime expansion|Through|Expanding spatial geometry pushing distant galaxy clusters apart with stretched metric grids across a wide cosmological view
visual.process.cosmic-string.topological-defect.vibrate.between.spacetime-curvature-plot|Early universe phase transition boundary|Relic cosmic string|Relativistic vibration|Between|One dimensional energy defects warping localized gravitational fields with gravity lensing shear profiles and spacetime curvature metrics
visual.composition.black-hole-singularity.gravitational-field.warp.around.ray-traced-lensing-grid|Event horizon interior|Infinitely compressed mass|Gravitational collapse|Around|Infinite curvature warping coordinate lines toward a central point with distorted starfield light rays and coordinate grid lines
visual.scene.quasar-engine.supermassive-black-hole.accrete.into.wide-establishing-view|Active galactic nucleus|Superheated accretion gas|Mass accretion|Into|Gas spiraling into a central event horizon while relativistic plasma jets eject perpendicular to the rotation plane across a wide active galaxy perspective
visual.material.magnetar-crust.neutron-star-matter.fracture.under.magnetic-field-map|Magnetar surface|Crystalline neutron iron crust|Crustal starquake fracture|Under|Starquake faults shearing under extreme magnetic tension with high intensity magnetic flux loops and gamma ray burst trigger points
visual.process.hawking-radiation.virtual-particles.separate.at.event-horizon-section|Black hole boundary|Virtual particle pairs|Quantum pair separation|At|Vacuum fluctuations splitting near the event horizon with one particle descending while the other escapes as radiation in a cross sectional view
visual.composition.galaxy-supercluster.dark-matter-filaments.web.across.large-scale-structure-map|Cosmic web|Dark matter scaffolding|Filamental accretion|Across|Large scale matter distribution showing supercluster nodes connected by dark matter bridges with cosmic voids and filament density vectors
visual.scene.gravitational-wave-event.binary-neutron-stars.merge.under.laser-interferometer-grid|Kilonova progenitor|Coalescing neutron stars|Gravitational wave emission|Under|Inspiral orbital paths emitting spacetime ripples mapped onto a three dimensional metric strain grid
visual.material.stellar-core.carbon-oxygen-ash.fuse.inside.nucleosynthesis-diagram|Late stage massive star core|Carbon oxygen ash|Nuclear fusion|Inside|Nucleosynthesis loops showing helium capture steps transitioning carbon to oxygen neon and silicon with core thermal pressure vectors
visual.process.accretion-disk.relativistic-plasma.shear.along.orbital-vector-map|Microquasar system|Relativistic ionized plasma|Differential shear rotation|Along|High velocity plasma rings orbiting at fraction of light speeds with relativistic Doppler shifts and orbital speed vectors
visual.composition.gamma-ray-burst.ultra-relativistic-particles.collimated.through.wide-establishing-view|Collapsar star death|Relativistic electron positron plasma|Jet collimation|Through|Symmetrical high energy jets piercing through stellar envelope layers into the interstellar medium across a wide astronomical view
visual.scene.brown-dwarf.deuterium-plasma.fuse.under.thermal-imaging-profile|Substellar object interior|Deuterium fuel mixture|Core fusion|Under|Convective transport loops carrying thermal energy from weak deuterium fusion to the surface shown in temperature gradients
visual.material.stellar-wind.charged-protons.deflect.around.magnetospheric-contour-map|Outer magnetosphere|High velocity stellar wind|Magnetospheric deflection|Around|Bow shock boundaries and magnetic field lines redirecting charged particles with magnetotail plasma currents and solar wind vectors
visual.process.kilonova-shell.neutron-rich-isotopes.decay.within.spectroscopic-signature|Post merger expansion shell|Rapid neutron capture isotopes|Radioactive decay|Within|Expanding ejecta shell emitting light as heavy isotopes decay with absorption lines and expansion velocity plots
visual.composition.red-giant-envelope.convective-cells.boil.over.wide-establishing-view|Red giant star surface|Low density hydrogen gas|Super convective boiling|Over|Giant convective cells forming temporary hot spots on the stellar disk with mass loss wind plumes across a wide stellar view
visual.scene.outer-core-dynamo.liquid-iron.circulate.inside.geodynamo-flux-profile|Outer core boundary|Liquid iron nickel alloy|Convective circulation|Inside|Helical convection columns driven by Earth rotation showing Coriolis deflection thermal plumes and self sustaining magnetic induction lines
visual.material.mantle-transition-zone.ringwoodite-crystal.hydrate.under.cutaway-section|Mantle transition zone|High pressure mineral ringwoodite|Structural hydration|Under|Mantle mineral lattice containing trapped hydroxyl ions with mineral phase change boundaries and seismic shear velocity shifts
visual.process.primordial-accretion.iron-chondrite.melt.into.geological-section|Early Earth core differentiation|Molten iron silicate mixture|Gravitational iron rain separation|Into|Primordial planetesimal core forming as liquid iron sinks through silicate mantle layers with gravitational descent vectors
visual.composition.lower-mantle.post-perovskite-slabs.deform.along.seismic-tomography-map|Core mantle boundary layer|High pressure post perovskite phase|Plastic deformation|Along|Descending cold oceanic plate remnants spreading laterally over the outer core boundary with seismic anisotropy vectors
visual.scene.continental-rifting.asthenosphere-basalt.upwell.under.topographic-map|Active rift valley|Decompressing asthenospheric basalt|Decompression melting and upwelling|Under|Lithosphere pulling apart above a mantle upwelling zone with tectonic fault offsets and rift shoulder topography
visual.material.oceanic-trench.serpentinized-peridotite.dehydrate.within.subduction-section|Deep subduction zone|Hydrated peridotite|Deserpentinization|Within|Subducting slab releasing locked water into the wedge shaped asthenosphere with seismicity zones and partial melt regions
visual.process.hydrothermal-serpentinization.olivine-brine.react.along.geochemical-map|Deep seafloor mantle exposure|Olivine and seawater|Exothermic serpentinization|Along|Seawater reacting with mantle olivine producing serpentine minerals magnetite and hydrogen with heat flux values
visual.composition.deep-lithosphere.kimberlite-pipe.erupt.through.cutaway-section|Cratonic lithosphere root|Volatile rich kimberlite magma|Supersonic volcanic ascent|Through|Magma conduit erupting from diamond stability depths to the surface with fluidization zones and pressure relief profiles
visual.scene.snowball-earth.cryogenian-glacier.grind.over.wide-establishing-view|Neoproterozoic equatorial margin|Global sea ice sheet|Glacial abrasion|Over|Equatorial continental margins scraped by global glaciers depicting ice pack fault lines and debris deposits
visual.material.hadal-trench.pelagic-sediment.compact.along.geological-section|Deep trench axis|Pelagic biogenic sediment layer|Tectonic compaction|Along|Seafloor sediments squeezed into an accretionary prism with pore fluid expulsion pathways and tectonic thrust planes
visual.process.primordial-degassing.volcanic-steam.condense.into.wide-establishing-view|Hadean atmosphere|Volatile volcanic steam gases|Atmospheric condensation|Into|Water vapor condensing from a dense carbon dioxide atmosphere to form the first oceans across a wide primordial landscape
visual.composition.great-oxidation-event.photosynthetic-oxygen.accumulate.across.geochemical-map|Paleoproterozoic shallow ocean|Biogenic free oxygen|Ocean atmosphere oxygenation|Across|Iron rich waters oxidizing to form banded iron formations with global marine oxygen saturation values
visual.scene.coal-swamp.carboniferous-peat.compress.under.stratigraphic-section|Carboniferous delta system|Plant peat|Diagenetic compaction|Under|Lycopsid forest debris burying and transforming into lignite coal with compaction ratios and sediment overburden
visual.material.paleocene-thermal-maximum.biogenic-methane.release.through.ecological-succession-map|PETM ocean floor|Clathrate methane gas|Clathrate destabilization release|Through|Methane hydrates dissociating and releasing gas plumes into seawater with oceanic temperature and pH metrics
visual.process.ice-age-interglacial.loess-silt.deposit.over.topographic-map|Pleistocene steppe margin|Wind blown loess silt|Eolian deposition|Over|Steppe wind maps depositing silty soil blankets over regional topography with windward accumulation contours
visual.composition.impact-crater-ejecta.tektite-glass.scatter.around.wide-establishing-view|Impact ejecta blanket|Molten tektite glass|Supersonic impact scatter|Around|Molten rock droplets cooling into aerodynamic glass shapes in the upper atmosphere with ballistic reentry vectors across a wide view
visual.scene.quark-gluon-plasma.deconfined-quarks.annihilate.inside.microscopic-flux-plot|Heavy ion collision chamber|Deconfined quarks and gluons|Relativistic annihilation|Inside|Subatomic plasma state showing color charge flux tubes scattering events and hadronization boundaries
visual.material.bose-einstein-condensate.rubidium-atoms.overlap.under.phase-state-map|Magnetic trap laboratory|Ultracold rubidium atoms|Quantum wave function overlap|Under|Atomic wave packets expanding and merging into a single macroscopic quantum state with velocity distribution peaks
visual.process.casimir-plates.vacuum-fluctuations.exclude.between.cutaway-section|Micro electromechanical cavity|Virtual electromagnetic waves|Casimir exclusion|Between|Two parallel plates reflecting virtual photons showing wavelength exclusion inside the cavity and attractive force vectors
visual.composition.radioactive-decay-chain.uranium-nucleus.fission.into.particle-track-plot|Fission ionization chamber|Uranium 235 isotope nucleus|Induced nuclear fission|Into|Thermal neutron absorption triggering asymmetric nuclear splitting with daughter nuclei paths and fast neutron trajectories
visual.scene.calabi-yau-manifold.string-dimensions.compactify.within.mathematical-mesh|Six dimensional Calabi Yau projection|Superstring dimensional components|Spatial compactification|Within|Extra dimensions curled into complex geometric shapes showing manifold intersection curves and string vibration modes
visual.material.superconducting-junction.cooper-pairs.tunnel.across.phase-state-map|Josephson junction|Paired superconducting electrons|Quantum tunneling|Across|Cooper pairs crossing a thin insulating barrier showing quantum phase coherence and current phase relation curves
visual.process.double-slit-interference.coherent-photons.diffract.onto.optical-response-plot|Optical slit assembly|Coherent laser photon stream|Wave function diffraction|Onto|Single photons passing through double slits and forming interference bands on a sensor with detection probability density
visual.composition.schrodinger-box.superposition-states.decohere.under.instrumented-lab-view|Sealed quantum measurement chamber|Superposition state qubit|Environmental decoherence|Under|Qubit state interacting with thermal environment showing quantum superposition decay curves and classical state transition
visual.scene.endolithic-lithoautotroph.basalt-pore-brine.respire.inside.macro-inspection|Deep igneous crust|Endolithic iron oxidizing bacteria|Chemolithoautotrophic respiration|Inside|Microbes colonizing basalt micro fractures showing iron oxidation crusts and local metabolic fluid pathways
visual.material.halophilic-archaea.hypersaline-brine.metabolize.over.microbial-flux-plot|Deep salt lake bottom|Halophilic archaea|Purple membrane phototrophy|Over|Archaea colonies using bacteriorhodopsin to capture solar energy with proton pumping routes and ATP generation plots
visual.process.methanogenesis.deep-coal-bed.digest.within.biological-cutaway|Deep unminable coal seam|Methanogenic archaea consortia|Syntrophic methanogenesis|Within|Microbes digesting organic coal matrices to produce methane with acetate and hydrogen exchange routes
visual.composition.global-carbon-cycle.marine-carbonate.dissolve.under.system-diagram|Pelagic carbonate compensation depth|Calcium carbonate shells|Carbonate dissolution|Under|Planktonic shells sinking and dissolving beneath the lysocline with ocean carbon chemistry and alkalinity maps
visual.scene.abiotic-catalysis.iron-sulfide-membranes.proton-gate.within.origin-of-life-cutaway|Primordial alkaline hydrothermal vent chimney|Semi permeable iron sulfide membranes|Abiotic proton gradient catalysis|Within|Porous inorganic walls separating alkaline fluid from acidic seawater showing proton movement paths
visual.material.cryptobiotic-crust.cyanobacteria-sheaths.desiccate.over.macro-inspection|Arid soil surface|Filamentous cyanobacteria sheaths|Desiccation protection|Over|Soil particles bound by dried extracellular polysaccharide sheath networks showing mechanical stability fields and water binding regions
visual.process.nitrogen-fixation.root-nodules-bacteria.reduce.inside.biological-cutaway|Legume root cell interior|Symbiotic rhizobia bacteria|Enzymatic nitrogen reduction|Inside|Bacteroids using nitrogenase to reduce atmospheric nitrogen to ammonia with oxygen protection barriers and carbon nitrogen exchange
visual.composition.benthic-sediment.anaerobic-microbes.reduce-sulfate.through.microscopic-flux-plot|Seafloor sediment boundary|Sulfate reducing bacterial consortia|Dissimilatory sulfate reduction|Through|Marine sediment pore cross section showing sulfate consumption sulfide precipitation and anaerobic metabolic flux
visual.scene.thermal-death.entropy-gradients.dissipate.across.system-diagram|Thermodynamic closed system|Dissipating heat gradients|Entropic decay|Across|Heat energy dispersing across a system map showing thermal equilibration boundaries and system entropy increases
visual.material.cellular-automaton.digital-grid-states.evolve.within.mathematical-mesh|Infinite two dimensional discrete space|Binary active inactive cell matrix|State rule evolution|Within|Discrete cell states changing based on local neighbors showing emergent pattern boundaries and complex structures
visual.process.chaotic-attractor.phase-space-trajectory.orbit.around.phase-state-map|Continuous dynamical system|Phase space coordinate trace|Chaotic orbit attraction|Around|Phase coordinates orbiting in a Lorenz like attractor shape showing sensitivity divergence angles and state boundaries
visual.composition.percolation-network.pore-clusters.connect.under.stress-distribution-map|Fractured reservoir rock|Micro pore networks|Connectivity percolation|Under|Pore channels connecting to form continuous fluid pathways showing percolation thresholds and rock pressure distribution
visual.scene.turbulent-flow.shear-layers.eddy.along.fluid-dynamics-view|Boundary layer pipe flow|High velocity fluid|Turbulent eddy cascade|Along|High velocity boundary currents breaking into smaller turbulent vortices showing energy dissipation regions and velocity profiles
visual.material.holographic-boundary.bulk-spacetime.project.onto.phase-state-map|Anti de Sitter space boundary|Holographic conformal field theory|Dimensional boundary projection|Onto|Lower dimensional boundary quantum states projecting higher dimensional bulk spacetime gravity with entanglement entropy maps
visual.process.self-organized-criticality.sandpile-slope.avalanche.along.terrain-hazard-map|Granular sand heap|Sliding sand particles|Power law avalanche|Along|Sandpile slope collapsing in discrete bursts showing stress buildup points avalanche size frequencies and safety slopes
visual.composition.information-channel.parity-bits.correct.through.latency-topology-map|Noise limited digital transmission|Shannon information stream|Error correcting parity verification|Through|Bitstream containing transmission errors corrected by parity verification algorithms with parity matrices and signal latency levels
visual.scene.dyson-sphere.megastructure-panels.re-radiate.around.wide-establishing-view|Stellar scale mega engineering|Carbon graphene collector panels|Solar capture and waste heat re radiation|Around|Stellar collectors surrounding a star showing collected solar flux vectors and infrared radiation signatures in a wide cosmic view
visual.material.interstellar-ramjet.magnetic-field.scoop.along.orbital-vector-map|Relativistic interstellar transit|Compressed interstellar hydrogen gas|Electromagnetic scoop funneling|Along|Giant magnetic field cones capturing thin interstellar gas with particle density profiles and magnetic intake field lines
visual.process.wormhole-throat.negative-energy.stabilize.between.spacetime-curvature-plot|Einstein Rosen bridge|Exotic negative mass energy field|Spacetime stabilization|Between|Curved spacetime throat connecting two distant areas of the universe with exotic energy distribution fields
visual.composition.exoplanet-ocean.supercritical-water.convect.inside.atmospheric-profile|Deep water world envelope|Supercritical fluid water phase|Supercritical convection|Inside|Transition zone between gas and high pressure ice showing fluid density convective plumes and phase boundaries
visual.scene.vacuum-decay.metastable-higgs-bubble.expand.through.wide-establishing-view|Speculative cosmic bubble boundary|New true vacuum phase|Speed of light vacuum expansion|Through|Cosmic bubble of true vacuum expanding through the metastable vacuum shown in a wide cosmological view
visual.material.baryonic-matter.primordial-nucleosynthesis.fuse.inside.nucleosynthesis-diagram|Cosmic nucleosynthesis shortly after Big Bang|Primordial protons and neutrons|Fusion of first nuclei|Inside|Nuclear reactions producing deuterium helium and trace lithium with cosmic expansion rates and thermal decay plots
visual.process.tidal-disruption.star-envelope.strip.around.ray-traced-lensing-grid|Black hole proximity|Stripped stellar envelope gas|Tidal forces stripping|Around|Star falling apart near a supermassive black hole showing gas stream orbits and gravitational lensing
visual.composition.kardashev-civilization.laser-beacons.modulate.across.galactic-core-map|Type III galaxy civilization|Collimated laser communication beams|Interstellar transmission modulation|Across|High speed communication signals connecting star systems across the galaxy with signal latency scales and connection pathways
`;

const HANDWRITTEN_UNIVERSE_LINES = String.raw`
visual.scene.cosmic-microwave-background.primordial-photons.redshift.across.deep-space-render|Observable universe microwave background|Primordial photon field|Cosmological redshift|Across|All sky anisotropy map with faint temperature ripples stretched into spherical harmonics and early universe density seeds
visual.material.dark-matter-halo.collisionless-particles.cluster.around.gravitational-lensing-map|Galaxy cluster halo|Collisionless dark matter candidate field|Gravitational clustering|Around|Invisible mass contours bending background galaxies with shear arrows caustic arcs and baryonic gas offsets
visual.process.inflation-field.quantum-vacuum-fluctuations.expand.within.phase-state-map|Inflationary spacetime patch|Quantum vacuum fluctuation foam|Exponential expansion|Within|Microscopic fluctuation cells stretched beyond horizon scale with scalar field slope markers and reheating boundaries
visual.composition.protoplanetary-disk.icy-pebbles.accrete.into.orbital-vector-map|Young stellar disk|Icy silicate pebble swarm|Planetesimal accretion|Into|Pebble streams spiraling into growing embryos with collision kernels snowline bands and gas drag velocity arrows
visual.scene.mars-dust-storm.iron-oxide-aerosols.suspend.over.meteorological-radar-view|Martian global storm|Iron oxide aerosol dust|Atmospheric suspension|Over|Planet scale orange dust veil with opacity contours solar attenuation curves and pressure tide overlays
visual.material.europa-ocean.salty-brine.convect.under.cutaway-section|Europa ice shell ocean|Magnesium sulfate brine|Tidal convection|Under|Subsurface ocean cells rolling beneath cracked ice with plume vents salinity gradients and tidal flex heat bands
visual.process.titan-lakes.liquid-methane.evaporate.along.spectroscopic-signature|Titan hydrocarbon lake shore|Liquid methane ethane mixture|Cryogenic evaporation|Along|Orange haze shoreline with vapor flux arrows methane absorption bands and wavelet ripples in low gravity
visual.composition.venus-clouds.sulfuric-acid-droplets.circulate.within.thermal-imaging-profile|Venusian cloud deck|Sulfuric acid droplet layer|Superrotation circulation|Within|Layered yellow cloud belts with wind shear vectors ultraviolet absorber patches and descending thermal waves
visual.scene.lunar-regolith.charged-dust.levitate.above.stroboscopic-exposure|Moon terminator surface|Electrostatically charged regolith dust|Photoelectric levitation|Above|Fine lunar grains hovering above crater rims with terminator electric fields and low sun shadow bands
visual.material.kuiper-belt.nitrogen-ice.fracture.under.wide-establishing-view|Distant icy body crust|Frozen nitrogen methane shell|Thermal contraction fracturing|Under|Blue white crust splitting into polygonal cracks with starfield backlight and sublimation haze margins
visual.process.orion-shock-front.ionized-hydrogen.propagate.through.deep-space-render|Orion molecular cloud edge|Ionized hydrogen emission gas|Radiation front propagation|Through|Pink ionization wall carving dusty gas with bow shocks embedded stars and photon flux vectors
visual.composition.gravitational-wave-detector.laser-interferometer.strain.between.instrumented-lab-view|Kilometer scale interferometer|Coherent laser beam path|Spacetime strain measurement|Between|Vacuum arm layout with phase shift readouts mirror suspensions and passing wave chirp trace
visual.scene.planetary-magnetosphere.solar-wind-plasma.deflect.around.magnetic-flux-profile|Earth magnetosphere|Solar wind plasma stream|Magnetic deflection|Around|Bow shock cavity with magnetopause field lines auroral current sheets and charged particle density bands
visual.material.asteroid-core.olivine-metal-matrix.differentiate.inside.cutaway-section|Primitive asteroid interior|Olivine metal chondritic matrix|Thermal differentiation|Inside|Rock metal grains separating into dense pockets with heat isotherms impact cracks and isotope sampling markers
visual.process.comet-nucleus.frozen-volatiles.outgas.from.wide-establishing-view|Comet sunward surface|Frozen water carbon dioxide volatiles|Jet outgassing|From|Sunlit pits firing dusty gas jets with rotating nucleus shadow and radiation pressure tail vectors
visual.composition.ring-system.water-ice-particles.resonate.within.orbital-vector-map|Saturn ring gap|Water ice particle sheet|Orbital resonance|Within|Ringlets sculpted by moon resonance waves with density wakes shepherd orbit lines and particle collision arcs
visual.scene.red-giant-envelope.ionized-helium.pulsate.along.thermal-imaging-profile|Expanded red giant star|Ionized helium shell|Radial pulsation|Along|Layered stellar envelope breathing outward with opacity zones acoustic mode rings and cooling outer atmosphere
visual.material.white-dwarf.carbon-oxygen-crystal.cool.inside.macro-inspection|White dwarf core|Carbon oxygen crystalline lattice|Degenerate cooling|Inside|Diamond like stellar lattice with electron pressure bands cooling fronts and crystallization fraction contours
visual.process.planetary-nebula.oxygen-iii-ions.emit.around.spectroscopic-signature|Planetary nebula shell|Doubly ionized oxygen gas|Forbidden line emission|Around|Green blue shell rings with spectral peaks expansion arrows and fading central star ultraviolet field
visual.composition.exoplanet-transit.starlight-curve.occlude.across.optical-power-plot|Distant star disk|Transit light curve photons|Planetary occlusion|Across|Tiny planet silhouette crossing stellar limb with brightness dip graph limb darkening and orbital chord
visual.scene.impact-crater.ejecta-breccia.excavate.under.geological-section|Fresh impact basin|Shocked breccia and melt glass|Crater excavation|Under|Cross section of transient cavity collapse with ejecta curtain ballistic paths and fractured basement uplift
visual.material.mercury-tail.sodium-atoms.fluoresce.along.spectroscopic-signature|Mercury exosphere tail|Escaping sodium atoms|Solar fluorescence|Along|Yellow sodium stream trailing behind Mercury with radiation pressure arrows and resonant emission bands
visual.process.gas-giant-belt.ammonia-clouds.shear.between.meteorological-radar-view|Jupiter belt boundary|Ammonia ice cloud particles|Zonal wind shear|Between|Alternating cloud bands sliding past each other with vortex rolls lightning cells and jet stream arrows
visual.composition.aurora-curtain.oxygen-nitrogen-plasma.cascade.down.magnetic-flux-profile|Polar upper atmosphere|Excited oxygen nitrogen plasma|Electron cascade|Down|Green violet auroral curtains falling along field lines with altitude color bands and particle precipitation cones
visual.scene.space-weather-forecast.proton-flux.surge.through.system-diagram|Heliophysics operations center|Solar energetic proton flux|Radiation storm surge|Through|Forecast board with Parker spiral paths satellite hazard zones proton fluence plots and alert thresholds
visual.material.microgravity-flame.blue-fuel-vapor.diffuse.around.macro-inspection|Orbital combustion chamber|Lean blue fuel vapor|Spherical flame diffusion|Around|Round cool flame shell floating in microgravity with oxygen depletion field and sootless reaction boundary
visual.process.lagrange-swarm.solar-sail-film.stabilize.between.orbital-vector-map|Sun Earth L1 platform|Reflective solar sail film|Lagrange station keeping|Between|Triangular sailcraft balancing radiation pressure and gravity with halo orbit tracks and thrust trim vectors
visual.composition.cryo-sample-return.asteroid-ice.preserve.inside.instrumented-lab-view|Planetary sample capsule|Pristine asteroid ice grains|Cryogenic preservation|Inside|Sealed cold chamber with contamination shields vapor traps isotope tags and frost crystal monitoring probes
visual.scene.deep-space-antenna.radio-waves.focus.onto.optical-bench-projection|Desert radio telescope array|Centimeter wavelength radio waves|Parabolic focusing|Onto|Dish fields aiming at a faint spacecraft beacon with interference fringes delay lines and signal gain plots
visual.material.interstellar-medium.polycyclic-aromatics.glow.under.deep-space-render|Diffuse interstellar cloud|Polycyclic aromatic hydrocarbon dust|Infrared glow|Under|Wispy brown red dust filaments glowing under ultraviolet starlight with emission band labels and grain size contours
visual.scene.subduction-trench.serpentinized-mantle.dehydrate.under.geological-section|Ocean trench subduction zone|Serpentinized mantle wedge|Metamorphic dehydration|Under|Descending slab releasing water into mantle wedge with blueschist markers melt pathways and earthquake hypocenter dots
visual.material.peatland.methane-bubbles.ebulliate.through.topographic-map|Boreal peatland pool|Methane bubble clusters|Ebullition release|Through|Bog surface map with bubble plumes rising through peat mats and methane flux hotspots
visual.process.atmospheric-river.water-vapor-transport.feed.into.meteorological-radar-view|Pacific storm corridor|Integrated water vapor plume|Moisture transport|Into|Long vapor ribbon feeding mountain rainfall with precipitable water scale wind barbs and orographic lift zones
visual.composition.landslide-scar.saturated-clay.slump.down.cutaway-section|Hillslope failure plane|Waterlogged clay layer|Rotational slump|Down|Curved slip surface beneath broken terrain with pore pressure readings trees tilting and debris lobe motion arrows
visual.scene.glacier-bed.rock-flour-grit.abraid.along.geological-section|Glacial valley floor|Rock flour grit slurry|Basal abrasion|Along|Ice base dragging grit over bedrock with striation lines meltwater pockets and sliding velocity readouts
visual.material.hurricane-eyewall.sea-spray-aerosols.spin.around.meteorological-radar-view|Tropical cyclone eyewall|Sea spray aerosol mist|Cyclonic spin|Around|Radar ring of convective towers with spray flux arrows pressure contours and rainband spiral structure
visual.process.monsoon-soil.black-cotton-clay.swell.under.environmental-impact-map|Seasonal farmland soil|Montmorillonite clay|Hydration swelling|Under|Cracked soil polygons swelling shut during rain with moisture fronts and foundation stress risk markers
visual.composition.volcanic-ashfall.pumice-glass.settle.over.environmental-impact-map|Downwind eruption corridor|Pumice glass ash particles|Ash deposition|Over|Isopach map of ash load over towns rivers and crops with collapse risk and respiratory hazard bands
visual.scene.permafrost-coast.ice-rich-silt.erode.along.wide-establishing-view|Arctic coastline bluff|Ice rich silt permafrost|Thermoerosion retreat|Along|Coastal bluff collapsing into waves with thaw slump arcs exposed ice wedges and sediment plume fans
visual.material.river-meander.suspended-silt.deposit.inside.topographic-map|Meandering floodplain bend|Suspended fine silt|Point bar deposition|Inside|Curved river map with inner bend accretion layers cutbank erosion vectors and flood stage marks
visual.process.kelp-forest.giant-kelp-fronds.oscillate.within.dynamic-motion-trace|Temperate kelp forest|Flexible kelp fronds|Wave driven oscillation|Within|Underwater forest swaying in orbital waves with blade bend traces holdfast forces and fish path ribbons
visual.composition.hypoxic-zone.dissolved-oxygen.deplete.under.current-drift-map|Coastal dead zone|Dissolved oxygen field|Biological oxygen depletion|Under|Bottom water oxygen map with fish avoidance paths algal decay plumes and density stratification layers
visual.scene.coral-spawning.gamete-clouds.rise.through.wide-establishing-view|Reef night spawning event|Buoyant coral gamete bundles|Synchronized release|Through|Pink white reproductive clouds rising above reef heads with moon phase markers and current dispersal arrows
visual.material.deep-ocean-snow.organic-detritus.sink.through.macro-inspection|Mesopelagic water column|Marine snow aggregate flakes|Sinking aggregation|Through|Fragile detritus clumps falling in dark water with bacterial halos sinking rates and grazing tracks
visual.process.seagrass-meadow.carbon-rich-sediment.store.under.topographic-map|Blue carbon meadow|Organic carbon sediment|Long term burial|Under|Seafloor meadow map with root mats carbon density cores and disturbance plume boundaries
visual.composition.estuary-salt-wedge.brackish-water.intrude.under.geological-section|River mouth estuary|Dense saline wedge|Saltwater intrusion|Under|Layered freshwater over saltwater cross section with mixing interface turbidity maximum and tide phase arrows
visual.scene.mangrove-root-zone.anoxic-mud.filter.through.cutaway-section|Mangrove swamp roots|Anoxic sulfide mud|Biogeochemical filtration|Through|Tangled roots trapping sediment with redox gradients crab burrows and tidal flushing vectors
visual.material.lake-turnover.cold-oxygenated-water.mix.through.current-drift-map|Temperate lake basin|Oxygen rich cold water|Seasonal turnover mixing|Through|Lake depth section with sinking surface water rising nutrients and temperature isopleths
visual.process.reef-fish-school.silver-scales.swarm.around.dynamic-motion-trace|Tropical reef channel|Reflective fish scale field|Collective schooling|Around|Dense fish school wrapping around coral spurs with alignment vectors flash waves and predator avoidance gaps
visual.composition.ocean-acidification.aragonite-saturation.drop.across.environmental-impact-map|Global ocean chemistry grid|Aragonite saturation state|Acidification decline|Across|World map of carbonate chemistry with shellfish risk zones current paths and pH trend lines
visual.scene.hydrothermal-brine-pool.dense-saline-fluid.pool.inside.cutaway-section|Seafloor brine lake|Hypersaline dense brine|Density pooling|Inside|Underwater lake edge with shimmering interface mussel beds methane bubbles and salinity gradient walls
visual.material.sea-ice.brine-channels.freeze.within.macro-inspection|Polar sea ice slab|Concentrated brine inclusions|Channel freezing|Within|Blue ice microstructure showing brine pockets closing around salt crystals with thermal gradient arrows
visual.process.dune-field.quartz-grains.avalanche.down.topographic-map|Star dune slip face|Rounded quartz sand grains|Granular avalanche|Down|Slope map with cascading sand sheets angle of repose contours and wind ripple memory lines
visual.composition.rainforest-evapotranspiration.water-vapor.recycle.over.meteorological-radar-view|Amazon forest canopy|Leaf released water vapor|Moisture recycling|Over|Canopy vapor flux rising into clouds with stomatal conductance patches and rainfall feedback arrows
visual.scene.sphagnum-bog.acidic-peat.accumulate.within.environmental-impact-map|Raised bog dome|Sphagnum peat fibers|Carbon accumulation|Within|Layered peat column with water table line preserved pollen grains and slow carbon storage bands
visual.material.fire-cloud.pyrocumulonimbus-ash.charge.inside.meteorological-radar-view|Wildfire storm cloud|Pyrocumulonimbus ash ice mix|Electrification charging|Inside|Fire generated thunderhead with ash lofting lightning charge zones and plume top overshoot
visual.process.snow-avalanche.ice-granules.flow.down.dynamic-motion-trace|Alpine avalanche path|Fragmented snow granules|Powder flow runout|Down|White turbulent snow cloud racing downslope with entrainment zones velocity arrows and impact pressure bands
visual.composition.mudflat-tides.fine-clay-crabs.biotrurbate.across.topographic-map|Intertidal mudflat|Fine clay and crab pellets|Bioturbation mixing|Across|Tidal flat map with burrow spirals sediment oxygen rings and meandering drainage rills
visual.scene.immune-synapse.t-cell-receptors.bind.against.macro-inspection|T cell antigen contact zone|Clustered receptor proteins|Antigen binding|Against|Circular immune synapse with receptor islands actin flow arrows and signaling microcluster intensity maps
visual.material.neuron-axon.myelin-sheath.insulate.along.microscopic-flux-plot|Peripheral nerve fiber|Lipid myelin sheath|Saltatory insulation|Along|Segmented myelin wraps around axon nodes with ion current jumps and conduction speed markers
visual.process.blood-clot.fibrin-mesh.polymerize.within.macro-inspection|Wound clot interface|Fibrin protein mesh|Coagulation polymerization|Within|Red platelet field threaded by fibrin strands with thrombin gradient arrows and clot stiffness contours
visual.composition.kidney-nephron.sodium-ions.reabsorb.through.system-diagram|Renal nephron tubule|Sodium ion filtrate|Tubular reabsorption|Through|Nephron schematic with transporter gates osmotic water paths and medullary concentration gradient bars
visual.scene.lung-alveoli.surfactant-film.stretch.within.macro-inspection|Alveolar air sac cluster|Pulmonary surfactant film|Breathing stretch|Within|Tiny alveoli expanding with surface tension curves capillary oxygen exchange and elastic recoil arrows
visual.material.pancreatic-islet.insulin-vesicles.release.into.microscopic-flux-plot|Pancreatic islet tissue|Insulin secretory vesicles|Hormone exocytosis|Into|Beta cells releasing vesicles into capillaries with glucose sensor channels and secretion pulse graphs
visual.process.synaptic-cleft.neurotransmitter.diffuse.across.macro-inspection|Chemical synapse gap|Neurotransmitter molecule cloud|Synaptic diffusion|Across|Vesicle release plume crossing receptor membrane with reuptake pumps and postsynaptic voltage trace
visual.composition.lymph-node.antigen-presenting-cells.sort.within.system-diagram|Lymph node follicle|Antigen presenting cell population|Immune sorting|Within|Node architecture map with T cell zones B cell follicles antigen routes and clonal expansion rings
visual.scene.retina-photoreceptor.rhodopsin-photons.transduce.inside.microscopic-sem-view|Retinal rod outer segment|Rhodopsin activated photons|Phototransduction cascade|Inside|Stacked disc membranes converting light into ion channel closure with cyclic GMP arrows and response curve
visual.material.inner-ear-hair-cell.stereocilia-bundles.bend.under.macro-inspection|Cochlear organ of Corti|Actin stereocilia bundle|Mechanical bending|Under|Hair bundle deflecting under traveling wave with tip link tension and frequency place map
visual.process.gut-microbiome.short-chain-fatty-acids.ferment.within.microscopic-flux-plot|Colon mucus ecosystem|Short chain fatty acids|Microbial fermentation|Within|Bacterial colonies digesting fiber with acetate butyrate gradients epithelial uptake arrows and pH pockets
visual.composition.bone-remodeling.hydroxyapatite.resorb.between.macro-inspection|Trabecular bone surface|Hydroxyapatite mineral matrix|Osteoclast resorption|Between|Bone pit with osteoclast edge osteoblast refill front calcium release and mechanical load vectors
visual.scene.embryo-gastrulation.cell-sheets.fold.in.molecular-dynamics-simulation|Early embryo gastrula|Epithelial cell sheet|Morphogenetic folding|In|Colored germ layer sheet folding inward with cell traction arrows morphogen gradients and lineage boundary labels
visual.material.chloroplast-stroma.rubisco-enzymes.fix.inside.system-diagram|Plant chloroplast stroma|Rubisco enzyme complex|Carbon fixation|Inside|Calvin cycle diagram inside chloroplast with CO2 entry sugar output and ATP NADPH flow arrows
visual.process.root-cap.mucilage-gel.lubricate.along.macro-inspection|Growing root tip|Polysaccharide mucilage gel|Soil lubrication|Along|Root cap sliding through grains with gel halo friction reduction arrows and microbial attachment dots
visual.composition.xylem-vessels.water-columns.tension.up.microscopic-flux-plot|Tree xylem column|Cohesive water column|Transpiration tension pull|Up|Vertical vessel tubes under negative pressure with cavitation bubbles leaf demand and root uptake arrows
visual.scene.migrating-butterflies.chitin-wings.navigate.across.dynamic-motion-trace|Monarch migration corridor|Chitin wing membrane|Solar compass navigation|Across|Orange flight paths over terrain with wing beat traces magnetic cues and wind drift corrections
visual.material.octopus-skin.chromatophore-pigments.expand.over.macro-inspection|Cephalopod skin surface|Chromatophore pigment sacs|Rapid camouflage expansion|Over|Pigment cells blooming across skin with neural control lines texture papillae and background matching swatches
visual.process.bird-flock.feather-airfoils.align.around.airflow-field-map|Starling murmuration field|Feathered wing airfoils|Collective alignment|Around|Thousands of birds forming a shifting cloud with local neighbor vectors lift traces and predator pressure voids
visual.composition.elephant-memory.hippocampal-patterns.reactivate.within.phase-state-map|Elephant social brain|Hippocampal memory pattern|Memory reactivation|Within|Abstract neural map with place cell fields kinship links recall waves and emotional salience gradients
visual.scene.fungal-fairy-ring.mycelial-front.expand.around.topographic-map|Grassland fungal colony|Radial mycelium mat|Nutrient front expansion|Around|Circular fairy ring map with greener growth edge nitrogen depletion core and hyphal density contours
visual.material.desert-cactus.waxy-cuticle.resist.over.thermal-imaging-profile|Saguaro cactus skin|Waxy cuticle layer|Evaporative resistance|Over|Ribbed cactus surface with stomatal pockets heat load bands and water loss suppression arrows
visual.process.predator-prey-savanna.muscle-tendons.accelerate.along.dynamic-motion-trace|Savanna chase path|Elastic muscle tendon system|Burst acceleration|Along|Cheetah and gazelle stride traces with tendon recoil curves dust plumes and turning force vectors
visual.composition.whale-song.ocean-pressure-waves.propagate.through.acoustic-spectrogram|Open ocean sound channel|Low frequency pressure wave field|Acoustic propagation|Through|Blue sound channel cross section with whale calls bending through density layers and spectrogram harmonics
visual.scene.neural-organoid.stem-cell-clusters.differentiate.inside.macro-inspection|Lab grown brain organoid|Stem cell neural progenitors|Cell differentiation|Inside|Transparent organoid with radial neuron layers calcium waves and lineage color fate markers
visual.material.viral-capsid.rna-genome.package.within.molecular-dynamics-simulation|Virus assembly pocket|Single stranded RNA genome|Genome packaging|Within|Icosahedral capsid closing around coiled RNA with electrostatic charge maps and portal motor arrows
visual.process.ecg-heartbeat.electric-wavefront.depolarize.through.system-diagram|Cardiac conduction network|Bioelectric depolarization wave|Heartbeat propagation|Through|Heart diagram with SA node pulse bundle branches ventricular activation and ECG trace alignment
visual.composition.wound-healing.collagen-fibers.align.across.macro-inspection|Skin repair boundary|Collagen fiber scaffold|Scar alignment|Across|Closing wound edges with fibroblast tracks collagen orientation tensors and angiogenesis sprouts
visual.scene.cancer-tumor.hypoxic-core.invade.into.microscopic-flux-plot|Solid tumor microenvironment|Hypoxic cancer cell mass|Invasive growth|Into|Tumor edge pushing into tissue with oxygen gradient maps blood vessel recruitment and matrix degradation fronts
visual.material.vaccine-lipid-nanoparticle.mrna.release.inside.system-diagram|Intracellular delivery vesicle|Lipid nanoparticle mRNA cargo|Endosomal release|Inside|Nanoparticle escaping endosome with lipid shell rupture mRNA translation route and immune sensor labels
visual.process.antibiotic-resistance.plasmid-dna.transfer.between.macro-inspection|Bacterial conjugation bridge|Plasmid DNA loop|Horizontal gene transfer|Between|Two bacteria connected by pilus with plasmid copy moving across and resistance gene markers
visual.composition.epidemiology-contact-network.aerosol-particles.spread.through.latency-topology-map|Indoor exposure network|Respiratory aerosol particles|Transmission spread|Through|Room contact graph with airflow paths exposure probabilities mask barriers and time delay infection edges
visual.scene.nanopore-sequencer.ionic-current.modulate.through.instrumented-lab-view|Portable sequencing pore|Ionic current in electrolyte|Nucleotide modulation|Through|DNA strand threading through nanopore with current squiggle trace base calls and pore voltage clamps
visual.material.bioengineered-scaffold.hydrogel-matrix.seed.within.macro-inspection|Tissue engineering scaffold|Porous hydrogel matrix|Cell seeding|Within|3D scaffold filled with cells nutrient perfusion streams and elastic modulus color bands
visual.process.protein-protein-interface.amino-acid-sidechains.lock.against.molecular-dynamics-simulation|Molecular docking pocket|Amino acid side chains|Binding interface lock|Against|Two folded proteins docking with hydrogen bond lines hydrophobic patches and binding energy contours
visual.composition.circadian-clock.per-protein.oscillate.within.phase-state-map|Cell nucleus clock circuit|PER CRY regulatory proteins|Circadian oscillation|Within|Feedback loop diagram with protein accumulation phase wheel gene expression pulses and light reset arrows
visual.scene.smart-grid.substation-transformer.balance.between.system-diagram|Urban smart grid substation|High voltage transformer oil|Load balancing|Between|Network schematic with feeder loads battery buffers tap changer states and frequency stability bands
visual.material.green-hydrogen-electrolyzer.proton-membrane.split.through.cutaway-section|PEM electrolyzer stack|Hydrated proton membrane|Water splitting|Through|Cell stack cutaway with oxygen bubbles hydrogen channels catalyst layers and current density maps
visual.process.carbon-capture.amine-solvent.absorb.inside.instrumented-lab-view|Post combustion capture tower|Amine solvent stream|CO2 chemical absorption|Inside|Packed column with flue gas rising solvent falling heat of reaction zones and loading curves
visual.composition.district-heating.steam-pipes.exchange.between.thermal-imaging-profile|Urban heating tunnel|Pressurized steam network|Thermal exchange|Between|Pipe trench heat map with building demand nodes condensate return arrows and leak hotspots
visual.scene.wastewater-bioreactor.activated-sludge.digest.within.cutaway-section|Municipal treatment basin|Activated sludge floc|Aerobic digestion|Within|Tank cross section with bubble diffusers microbial flocs nutrient removal bands and clarifier flow routes
visual.material.pumped-hydro-reservoir.water-head.store.above.topographic-map|Mountain energy reservoir|Elevated water mass|Gravitational storage|Above|Twin reservoirs on terrain map with penstock arrows turbine state and water head energy contours
visual.process.solar-thermal-tower.molten-nitrate-salt.circulate.through.thermal-imaging-profile|Concentrated solar tower|Molten nitrate salt loop|Thermal circulation|Through|Heliostat field focusing sunlight on receiver with hot salt pipes storage tank layers and heat losses
visual.composition.microreactor.triso-fuel-kernels.contain.inside.cutaway-section|Compact nuclear microreactor|TRISO ceramic fuel particles|Fission containment|Inside|Fuel pebble cutaway with coated kernels neutron flux contours heat pipes and graphite moderator paths
visual.scene.offshore-platform.drilling-mud.pump.down.geological-section|Deepwater drilling rig|Weighted drilling mud|Wellbore circulation|Down|Riser and borehole schematic with mud pressure gradients cuttings return annulus and blowout preventer states
visual.material.blast-furnace.coke-iron-ore.reduce.inside.thermal-imaging-profile|Integrated steel furnace|Coke and iron ore charge|Carbothermic reduction|Inside|Tall furnace section with burden layers hot blast tuyeres slag tap and carbon monoxide flow arrows
visual.process.cement-kiln.clinker-nodules.sinter.along.kiln-inspection-view|Rotary cement kiln|Limestone clay clinker nodules|Clinker sintering|Along|Rotating kiln tube with flame zone mineral phase changes and tumbling granular bed trajectories
visual.composition.paper-mill.pulp-fibers.drain.across.instrumented-lab-view|Fourdrinier paper machine|Cellulose pulp slurry|Sheet drainage|Across|Wet fiber mat forming on moving wire with vacuum boxes water removal curves and fiber orientation maps
visual.scene.brewery-fermenter.yeast-sugar.metabolize.inside.cutaway-section|Stainless fermentation tank|Yeast sugar wort|Alcoholic fermentation|Inside|Foaming tank cutaway with CO2 bubble rise sugar depletion gradient and temperature jacket control
visual.material.vaccine-freezer.phase-change-gel.buffer.around.thermal-imaging-profile|Cold chain shipping box|Phase change gel packs|Thermal buffering|Around|Insulated parcel map with gel melt fronts vial temperature probes and ambient heat infiltration arrows
visual.process.autoclave-steam.saturated-vapor.sterilize.through.system-diagram|Hospital sterilizer chamber|Saturated steam vapor|Sterilization penetration|Through|Chamber load diagram with steam contact paths spore kill curve pressure cycle and condensate drains
visual.composition.fertilizer-plant.ammonia-gas.synthesize.inside.instrumented-lab-view|Haber Bosch reactor train|Nitrogen hydrogen ammonia gas|Catalytic synthesis|Inside|Reactor vessels with catalyst beds pressure loops heat recovery exchangers and equilibrium conversion graphs
visual.scene.cold-storage-warehouse.ammonia-refrigerant.evaporate.through.system-diagram|Industrial freezer facility|Ammonia refrigerant|Evaporative cooling|Through|Refrigeration piping schematic with compressor stages evaporator coils frost buildup and product temperature lanes
visual.material.robotic-welder.argon-shield-gas.protect.around.dynamic-motion-trace|Automated welding cell|Argon shielding gas envelope|Arc shielding|Around|Robot torch path with blue arc molten pool gas coverage cone and bead geometry metrics
visual.process.injection-mold.polypropylene-melt.fill.into.macro-inspection|Plastic injection mold cavity|Molten polypropylene|Cavity filling|Into|Transparent mold view with advancing polymer front weld lines cooling channels and shrinkage vectors
visual.composition.clean-water-pump.ceramic-impeller.rotate.inside.cutaway-section|Village water pump housing|Ceramic impeller and water|Rotational pumping|Inside|Pump cutaway with impeller vortices pressure rise contours bearing loads and outlet flow gauges
visual.scene.electroplating-bath.nickel-ions.deposit.onto.instrumented-lab-view|Metal finishing tank|Nickel ion electrolyte|Electrodeposition|Onto|Cathode surface growing shiny metal layer with current density hotspots bubble trails and bath chemistry probes
visual.material.smart-window.electrochromic-oxide.tint.across.optical-power-plot|Building facade glass|Electrochromic tungsten oxide|Voltage tinting|Across|Window pane changing transmission state with ion insertion bands sunlight heat gain plots and control wires
visual.process.hvac-duct.fiberglass-filter.capture.through.cutaway-section|Building air handler|Fiberglass filter fibers|Particle capture|Through|Duct cross section with dust trajectories captured on fibers pressure drop curve and clean airflow lanes
visual.composition.elevator-brake.steel-cable.lock.under.stress-distribution-map|High rise elevator shaft|Steel hoist cable|Emergency braking|Under|Cable and brake assembly with load paths friction heat zones governor signal and cabin deceleration plot
visual.scene.supply-chain-graph.inventory-tokens.delay.through.latency-topology-map|Global supply network|Inventory token packets|Delay propagation|Through|Ports warehouses and factories linked by lag arrows backlog waves and bullwhip amplification contours
visual.material.blockchain-mempool.transaction-packets.queue.inside.system-diagram|Distributed ledger node|Pending transaction packets|Mempool queuing|Inside|Node dashboard with fee tiers block assembly funnel propagation latency and orphan risk branches
visual.process.neural-network.attention-weights.align.across.phase-state-map|Transformer attention head|Attention weight matrix|Context alignment|Across|Heatmap of token interactions with query key vectors residual streams and emergent attention diagonals
visual.composition.compiler-pipeline.syntax-tokens.lower.into.system-diagram|Programming language compiler|Syntax tree token stream|IR lowering|Into|Parse tree transforming into intermediate representation with optimization passes control flow graphs and register allocation bands
visual.scene.database-shard.write-ahead-log.replicate.between.latency-topology-map|Distributed database cluster|Write ahead log entries|Consensus replication|Between|Leader follower nodes exchanging logs with quorum ticks conflict markers and recovery timeline
visual.material.gpu-memory.hbm-banks.stream.through.system-diagram|GPU memory subsystem|High bandwidth memory bursts|Memory streaming|Through|HBM stack lanes feeding compute units with cache misses bank conflicts and bandwidth saturation colors
visual.process.network-router.tcp-packets.congest.around.latency-topology-map|Internet backbone router|TCP packet queues|Congestion formation|Around|Router ports filling with packets with dropped flows ECN marks and queue delay heat rings
visual.composition.zero-knowledge-proof.polynomial-commitments.verify.within.phase-state-map|Cryptographic proof circuit|Polynomial commitment field elements|Proof verification|Within|Algebraic constraints folding into verifier transcript with challenge scalars gates and soundness margin bars
visual.scene.quantum-error-correction.syndrome-bits.decode.across.system-diagram|Surface code lattice|Syndrome measurement bits|Error decoding|Across|Checkerboard qubit lattice with defect chains matching graph paths and correction operator overlays
visual.material.optical-fiber.erbium-dopants.amplify.along.optical-power-plot|Long haul fiber amplifier|Erbium doped glass core|Optical amplification|Along|Pump lasers exciting dopant ions with signal gain curve noise figure and wavelength channel bands
visual.process.satellite-downlink.qam-symbols.modulate.through.spectroscopic-signature|Ground station receiver chain|QAM radio symbol stream|Digital modulation|Through|Constellation diagram beside antenna beam with noise cloud carrier phase error and demodulation decision regions
visual.composition.cybersecurity-soc.alert-events.triage.within.system-diagram|Security operations center|Alert event stream|Incident triage|Within|Dashboard graph with correlated alerts kill chain phases analyst queues and containment decision branches
visual.scene.data-privacy-ledger.consent-tokens.expire.along.sentiment-index-plot|Consent management system|Personal data permission tokens|Policy expiration|Along|Timeline of consent states with revocation paths retention windows and compliance risk color bands
visual.material.virtual-reality-scene.depth-buffer.occlude.within.point-cloud-grid|VR rendering pipeline|Depth buffer fragments|Occlusion testing|Within|Layered z buffer cells resolving hidden surfaces with headset frustum rays and latency budget meters
visual.process.search-engine-index.term-vectors.rank.across.latency-topology-map|Search retrieval cluster|Sparse dense term vectors|Result ranking|Across|Documents flowing through inverted index vector reranker and click feedback loops with score distributions
visual.composition.social-graph.reputation-signals.diffuse.through.sentiment-index-plot|Online trust network|Reputation score signals|Social diffusion|Through|Account network with trust edges moderation flags sentiment waves and influence decay gradients
visual.scene.machine-vision-factory.feature-maps.detect.onto.instrumented-lab-view|Automated inspection line|Convolutional feature maps|Defect detection|Onto|Camera frames projected over parts with activation heatmaps bounding boxes reject gates and confidence traces
visual.material.edge-device.sensor-noise.filter.inside.system-diagram|Embedded sensor board|Noisy analog signal stream|Kalman filtering|Inside|Microcontroller pipeline with noisy samples prediction correction loop covariance ellipses and actuator output
visual.process.robot-swarm.local-rules.emerge.around.dynamic-motion-trace|Warehouse robot swarm floor|Local rule state packets|Emergent coordination|Around|Many robots avoiding obstacles with neighbor fields task allocation trails and charging station flow balance
visual.composition.digital-twin.city-telemetry.assimilate.into.topographic-map|Smart city digital twin|Live telemetry streams|State assimilation|Into|Urban 3D map updating with traffic energy air quality feeds and forecast uncertainty envelopes
visual.scene.algorithmic-market.limit-orders.match.inside.sentiment-index-plot|Electronic exchange order book|Limit order queue depth|Price matching|Inside|Bid ask ladders colliding into trades with spread bands liquidity pockets and volatility pulses
visual.material.electronic-voting.audit-trails.verify.between.system-diagram|Election audit system|Cryptographic ballot audit trails|End to end verification|Between|Ballot hashes linked to tally proofs with risk limiting sample paths and observer check marks
visual.process.education-classroom.concept-maps.scaffold.across.system-diagram|Learning analytics classroom|Student concept map edges|Knowledge scaffolding|Across|Topic graph growing with prerequisite links misconception flags and practice feedback loops
visual.composition.court-docket.case-files.prioritize.within.latency-topology-map|Judicial scheduling office|Case file workload tokens|Docket prioritization|Within|Calendar queue network with filing deadlines resource constraints and urgency heat colors
visual.scene.public-health-dashboard.vaccination-records.cluster.over.environmental-impact-map|Regional health dashboard|Vaccination record points|Coverage clustering|Over|County map with immunization pockets outbreak risk boundaries and clinic access travel bands
visual.material.disaster-response.supplies-pallets.route.through.system-diagram|Emergency logistics hub|Relief supply pallet inventory|Route allocation|Through|Warehouse and road network with demand nodes blocked bridges helicopter drops and stockout gauges
visual.process.city-budget.tax-revenue.allocate.between.sentiment-index-plot|Municipal finance board|Tax revenue flow lines|Budget allocation|Between|Sankey diagram of services schools transit parks and debt with public sentiment overlay
visual.composition.legal-contract.obligation-clauses.bind.within.system-diagram|Contract review workspace|Obligation clause graph|Legal binding|Within|Clause dependency network with parties deadlines breach paths and redlined risk annotations
visual.scene.museum-gallery.visitor-attention.flow.around.dynamic-motion-trace|Art museum floor|Visitor attention gaze traces|Exhibit flow|Around|Gallery map with foot traffic streams dwell time heatmaps and line of sight cones
visual.material.orchestra-hall.sound-waves.interfere.within.acoustic-spectrogram|Symphony concert hall|Reflected acoustic wave field|Room interference|Within|Seat map with early reflections reverberation tails standing nodes and spectrogram of brass strings
visual.process.language-evolution.phoneme-shifts.drift.across.phase-state-map|Historical language family tree|Phoneme feature vectors|Sound change drift|Across|Branching linguistic map with vowel shifts cognate links migration arrows and time depth bands
visual.composition.library-catalog.metadata-records.link.between.system-diagram|Research library index|Bibliographic metadata records|Semantic linking|Between|Catalog graph connecting authors subjects editions and citations with classification shelf bands
visual.scene.newsroom-verification.source-claims.crosscheck.against.system-diagram|Investigative newsroom desk|Source claim evidence snippets|Fact verification|Against|Claim evidence matrix with confidence scores provenance chains contradiction flags and publication gate
visual.material.theater-stage.light-gels.blend.over.stroboscopic-exposure|Live theater stage rig|Colored lighting gel beams|Stage color blending|Over|Spotlight cones crossing performers with cue timeline color wash gradients and shadow masks
visual.process.film-editing.timeline-shots.splice.along.dynamic-motion-trace|Film editing workstation|Shot clip timeline strips|Narrative splicing|Along|Video timeline with cuts transitions audio waveforms continuity marks and pacing rhythm graph
visual.composition.music-theory.chord-progressions.resolve.into.phase-state-map|Jazz harmony worksheet|Chord function tokens|Harmonic resolution|Into|Circle of fifths and voice leading graph with tension release arrows and modal color regions
visual.scene.food-web.energy-biomass.transfer.through.environmental-impact-map|Grassland food web|Biomass energy packets|Trophic transfer|Through|Species network with energy loss pyramids predator prey links and seasonal productivity bands
visual.material.crop-field.nitrogen-fertilizer.leach.under.topographic-map|Irrigated cornfield|Nitrate fertilizer solution|Groundwater leaching|Under|Field map with nitrate plumes tile drainage flow lines root uptake zones and well risk markers
visual.process.greenhouse-climate.co2-air.enrich.within.system-diagram|Controlled greenhouse bay|CO2 enriched air mixture|Climate enrichment|Within|Crop rows under sensors with CO2 dosing fans humidity loops and photosynthesis response curves
visual.composition.vertical-farm.led-photons.schedule.over.system-diagram|Indoor farm rack|Programmable LED photon flux|Light scheduling|Over|Stacked plant trays with spectrum timelines nutrient lines growth metrics and energy cost bands
visual.scene.precision-vineyard.soil-moisture-map.irrigate.along.topographic-map|Hillside vineyard blocks|Soil moisture telemetry field|Variable irrigation|Along|Vineyard contour map with drip zones sensor readings evapotranspiration estimates and grape stress colors
visual.material.cheese-cave.microbial-rind.ripen.over.macro-inspection|Aging cheese cave|Microbial rind biofilm|Controlled ripening|Over|Cheese wheel surface with mold colonies salt diffusion rings humidity readings and flavor compound arrows
visual.process.bread-dough.gluten-network.proof.inside.macro-inspection|Bakery proofing chamber|Hydrated gluten network|Yeast proofing|Inside|Dough bubble matrix expanding with CO2 pockets gluten strands temperature humidity and fermentation rate graphs
visual.composition.coffee-roaster.bean-cellulose.pyrolyze.inside.thermal-imaging-profile|Coffee roasting drum|Green coffee bean cellulose|Thermal pyrolysis|Inside|Rotating drum with bean color transition first crack acoustic ticks and volatile aroma release paths
visual.scene.fishery-sonar.fish-bladder-echoes.scatter.under.point-cloud-grid|Commercial fishing grounds|Swim bladder acoustic echoes|Sonar scattering|Under|Water column point cloud of fish schools with depth sounder beams and catch quota overlays
visual.material.rice-paddy.methane-rich-mud.emit.through.environmental-impact-map|Flooded rice terrace|Methane rich anoxic mud|Methane emission|Through|Terrace map with bubbles rising between rice stems microbial zones and irrigation gate states
visual.process.forest-firebreak.dry-needles.ignite.along.wide-establishing-view|Managed pine firebreak|Dry needle fuel bed|Prescribed ignition|Along|Flame line moving through cleared corridor with fuel moisture gauges smoke columns and containment vectors
visual.composition.urban-heat-island.asphalt-concrete.store.over.thermal-imaging-profile|Downtown street canyon|Asphalt concrete heat mass|Heat storage|Over|Thermal city map with shaded cool pockets roof temperatures traffic heat plumes and nighttime release bands
visual.scene.airport-runway.deicing-glycol.spray.onto.dynamic-motion-trace|Winter airport apron|Deicing glycol fluid|Spray application|Onto|Truck booms coating aircraft wings with droplet trajectories freezing point curves and runoff collection paths
visual.material.cargo-aircraft.composite-wing.flex.under.stress-distribution-map|Freighter wing structure|Carbon composite wing panel|Aeroelastic flexure|Under|Wing surface bending under turbulence with spar loads strain gauges and vortex wake ribbons
visual.process.port-crane.container-stack.optimize.between.system-diagram|Automated container yard|Container stack state grid|Yard optimization|Between|Crane move plan with stack reshuffles truck appointments ship bays and bottleneck heat markers
visual.composition.bus-rapid-transit.passenger-flow.board.through.latency-topology-map|Urban bus station|Passenger queue flow|All door boarding|Through|Station platform graph with tap in rates bus dwell time and crowd density lanes
visual.scene.bicycle-intersection.reflective-paint.guide.across.topographic-map|Protected bike crossing|Reflective thermoplastic lane paint|Traffic guidance|Across|Intersection map with cyclist desire lines signal phases conflict zones and night reflectance swatches
visual.material.harbor-breakwater.concrete-tetrapods.dissipate.against.wide-establishing-view|Storm harbor breakwater|Reinforced concrete tetrapods|Wave energy dissipation|Against|Armored shoreline with incoming waves breaking into spray turbulence pressure loads and erosion shadows
visual.process.rail-signal-system.track-circuits.detect.along.system-diagram|Railway signaling block|Track circuit current loops|Train detection|Along|Track diagram with occupied blocks relay states switch points and safe braking distance bands
visual.composition.pedestrian-crowd.personal-space.compress.within.dynamic-motion-trace|Stadium exit concourse|Human crowd density field|Crowd compression|Within|People moving through narrowing exits with pressure zones flow lanes and intervention gate controls
visual.scene.wildfire-evacuation.road-capacity-queues.jam.through.latency-topology-map|Foothill evacuation network|Vehicle queue capacity|Evacuation congestion|Through|Road graph with blocked links shelter destinations departure waves and smoke hazard arrival time
visual.material.water-main.cast-iron-pipe.corrode.under.geological-section|Buried water main trench|Aged cast iron pipe|Underground corrosion|Under|Pipe wall thinning beneath street with soil chemistry bands leak plume and pressure drop sensors
visual.process.warehouse-picking.human-robot-tasks.assign.between.system-diagram|Fulfillment picking floor|Task assignment tokens|Human robot scheduling|Between|Aisle map with worker routes robot carts priority orders and congestion avoidance fields
visual.composition.hotel-elevator-demand.waiting-riders.queue.at.latency-topology-map|High rise hotel lobby|Passenger request events|Elevator dispatch queuing|At|Shaft diagram with calls cars capacity wait time histograms and dispatch decision regions
visual.scene.carnival-ride.steel-arms.rotate.around.dynamic-motion-trace|Fairground swing ride|Painted steel arm structure|Centripetal rotation|Around|Night ride arcs with cable tension vectors passenger silhouettes and colored light motion trails
visual.material.ice-rink.zamboni-water.freeze.over.macro-inspection|Indoor skating rink|Thin resurfacing water film|Ice sheet freezing|Over|Glossy rink surface with freezing front blade grooves temperature probes and skater trajectory marks
visual.process.stadium-wave.audience-motion.propagate.around.dynamic-motion-trace|Sports stadium bowl|Crowd body motion wave|Human wave propagation|Around|Seats lighting sequentially with standing spectators phase lag arrows and acoustic cheer amplitude bands
visual.composition.restaurant-kitchen.heat-smoke-queues.balance.between.system-diagram|Busy restaurant line|Cooking heat smoke and orders|Kitchen throughput balance|Between|Stations linked by ticket queues grill heat plumes ventilation paths and plated dish timing bands
visual.scene.market-sentiment.option-skew.twist.across.sentiment-index-plot|Options trading desk|Implied volatility surface|Volatility skew twist|Across|3D surface of strikes and maturities with trader flow arrows risk smiles and shock scenario paths
visual.material.inflation-basket.price-index-items.weight.within.sentiment-index-plot|Consumer price basket|Weighted item price changes|Inflation weighting|Within|Basket components expanding unevenly with contribution bars wage overlay and household stress contours
visual.process.legal-precedent.case-citations.cascade.through.system-diagram|Common law citation network|Judicial precedent edges|Citation cascade|Through|Court opinion graph with landmark nodes dissent branches jurisdiction filters and doctrinal influence arrows
visual.composition.negotiation-table.offer-signals.converge.between.phase-state-map|Diplomatic negotiation room|Offer concession signals|Bargaining convergence|Between|Two party payoff space with red lines compromise frontier trust updates and mediator intervention paths
visual.scene.memory-palace.spatial-cues.encode.inside.phase-state-map|Cognitive memory palace|Spatial cue associations|Mnemonic encoding|Inside|Imagined rooms linked to facts with recall strength glow temporal decay curves and route traversal arrows
visual.material.attention-economy.clickstream-events.compete.over.sentiment-index-plot|Social feed ranking surface|Clickstream attention events|Engagement competition|Over|Posts fighting for screen position with scroll depth curves fatigue signals and recommender weight bands
visual.process.collective-delusion.false-beliefs.reinforce.within.latency-topology-map|Online echo chamber|False belief tokens|Reinforcement loop|Within|Clustered accounts amplifying claims with trust bubbles correction resistance and rumor mutation paths
visual.composition.demographic-transition.age-cohorts.shift.across.topographic-map|National population pyramid|Age cohort bands|Demographic shifting|Across|Population pyramid morphing through time with dependency ratios birth rate arrows and migration pulses
visual.scene.supply-demand-market.price-signals.clear.between.phase-state-map|Commodity exchange board|Price signal field|Market clearing|Between|Supply and demand curves crossing with inventory shocks producer response and consumer surplus regions
visual.material.public-opinion.poll-samples.aggregate.into.sentiment-index-plot|Election polling model|Weighted survey response samples|Opinion aggregation|Into|Pollster streams combining into forecast bands demographic weights house effects and uncertainty cones
visual.process.urban-gentrification.rent-pressure.displace.through.environmental-impact-map|Changing neighborhood map|Rent pressure field|Residential displacement|Through|Parcel map with rising rents tenant moves business turnover and transit investment gradients
visual.composition.classroom-discussion.idea-tokens.branch.around.system-diagram|Seminar table|Spoken idea tokens|Collaborative branching|Around|Conversation graph blooming around participants with topic threads turn taking rhythms and unresolved question knots
visual.scene.crisis-rumor-network.unverified-claims.spread.across.latency-topology-map|Disaster information network|Unverified claim packets|Rumor propagation|Across|Message graph with source uncertainty correction delays emotional amplification and official update bridges
visual.material.cultural-memory.archival-fragments.preserve.within.photogrammetric-mesh|Community archive room|Fragile archival fragments|Cultural preservation|Within|Digitized objects floating in mesh space with provenance labels oral history threads and decay risk overlays
visual.process.vote-counting.paper-ballots.tally.through.system-diagram|Election counting center|Paper ballot stacks|Transparent tallying|Through|Ballots moving through scanners audits observers challenged piles and precinct level result flow
visual.composition.labor-strike.picket-lines.block.along.topographic-map|Factory gate protest|Picket line human chain|Work stoppage blocking|Along|Gate map with worker lines delivery reroutes management response zones and media attention gradients
visual.scene.insurance-risk.claim-events.pool.across.sentiment-index-plot|Actuarial risk pool|Claim event distributions|Risk pooling|Across|Histograms of losses combined across policyholders with deductible thresholds reserve bands and catastrophe tail
visual.material.trust-network.reciprocity-credits.exchange.between.latency-topology-map|Mutual aid network|Reciprocity credit tokens|Resource exchange|Between|Community graph with favors food rides childcare loops and trust replenishment markers
visual.process.creative-draft.sketch-layers.iterate.over.stroboscopic-exposure|Artist studio desk|Transparent sketch layer stack|Creative iteration|Over|Successive drawing revisions overlaying each other with erased paths decision forks and composition balance guides
visual.composition.narrative-arc.character-motives.transform.through.phase-state-map|Novel plot board|Character motive vectors|Narrative transformation|Through|Plot beats connected by motivation arrows conflict intensity curves and emotional state shifts
visual.scene.mathematical-proof.lemma-dependencies.link.between.system-diagram|Blackboard proof workspace|Lemma dependency graph|Logical implication linking|Between|Theorem nodes connected by implication arrows counterexample traps and proof strategy branches
visual.material.probability-simplex.belief-mass.shift.across.phase-state-map|Bayesian inference simplex|Belief probability mass|Posterior updating|Across|Triangular probability surface with prior point likelihood pull vectors and posterior uncertainty ellipse
visual.process.fractal-coastline.iteration-segments.recurse.within.topographic-map|Mathematical coastline model|Recursive segment geometry|Fractal recursion|Within|Jagged boundary repeated at multiple scales with dimension estimate rulers and self similarity highlights
visual.composition.category-theory.morphism-arrows.compose.between.system-diagram|Abstract category diagram|Morphism arrow set|Functor composition|Between|Objects and arrows commuting through diagrams with natural transformation sheets and equivalence path labels
visual.scene.game-theory-payoff.strategy-fields.equilibrate.within.phase-state-map|Strategic payoff landscape|Mixed strategy probability fields|Nash equilibration|Within|Payoff surface with best response arrows saddle points and basin of attraction colors
visual.material.information-entropy.bit-distribution.disperse.across.sentiment-index-plot|Message uncertainty model|Bit probability distribution|Entropy dispersion|Across|Probability bars flattening into high entropy state with compression limits and surprise measure ticks
visual.process.chaotic-attractor.state-trajectories.fold.around.dynamic-motion-trace|Lorenz phase space|Continuous state trajectory line|Chaotic folding|Around|Butterfly attractor loops with nearby paths diverging Lyapunov arrows and section plane crossings
visual.composition.optimization-landscape.gradient-vectors.descend.along.phase-state-map|Loss surface valley|Gradient vector field|Descent optimization|Along|Contour surface with optimizer steps momentum overshoot saddle avoidance and learning rate annotations
visual.scene.formal-language.parse-stack.reduce.inside.system-diagram|Compiler parser automaton|Parse stack symbols|Grammar reduction|Inside|Shift reduce parser table with stack states token stream and syntax tree growth
visual.material.time-series-anomaly.residual-errors.spike.through.sentiment-index-plot|Monitoring dashboard|Residual error signal|Anomaly spike detection|Through|Forecast band pierced by sudden residual spikes with alert thresholds and root cause tags
visual.process.control-system.pid-error.dampen.toward.phase-state-map|Feedback control loop|PID error signal|Stabilizing damping|Toward|Setpoint response curve with overshoot decay proportional integral derivative terms and actuator saturation zones
visual.composition.quantum-state.bloch-vector.precess.around.phase-state-map|Single qubit state sphere|Bloch vector amplitude phase|Quantum precession|Around|Vector rotating on Bloch sphere with pulse gates measurement axes and decoherence shadow
visual.scene.topology-knot.braided-strands.transform.through.isometric-voxel-grid|Mathematical knot space|Braided strand curve|Topological deformation|Through|Knot diagram lifted into voxel grid with Reidemeister moves crossing signs and invariant labels
visual.material.logic-circuit.boolean-signals.resolve.into.system-diagram|Boolean algebra circuit|Truth value signal wires|Logical resolution|Into|Gate network reducing conditions into output bit with Karnaugh grouping and hazard pulse markers
visual.process.evolutionary-search.candidate-genomes.mutate.across.phase-state-map|Evolutionary algorithm population|Candidate genome bitstrings|Mutation selection|Across|Fitness landscape with genomes moving through selection bottlenecks crossover links and diversity preservation fields
visual.composition.constraint-satisfaction.variable-domains.prune.within.system-diagram|Puzzle solver workspace|Variable domain sets|Constraint propagation|Within|Grid of variable domains shrinking under constraints with contradiction flags and search tree branches
visual.scene.music-spectrogram.overtones.interfere.across.acoustic-spectrogram|Harmonic sound analysis|Overtone frequency bands|Spectral interference|Across|Spectrogram layers showing beating partials formant bands amplitude envelopes and phase cancellation pockets
visual.material.color-space.gamut-polygons.map.into.phase-state-map|Color management chart|RGB Lab gamut polygons|Perceptual mapping|Into|Overlapping color gamuts with clipped regions white point arrows and delta E contours
visual.process.robot-motion-planner.configuration-space.search.through.point-cloud-grid|Robot arm configuration space|Obstacle occupancy cells|Path planning search|Through|High dimensional slices with collision volumes reachable sets and planned trajectory tube
visual.composition.ethical-decision.utility-values.balance.against.system-diagram|Ethics review matrix|Competing utility value tokens|Normative balancing|Against|Stakeholder values weighed across harms benefits rights and uncertainty with deliberation pathways
visual.scene.dream-state.memory-fragments.blend.within.phase-state-map|Sleeping brain dream field|Fragmented episodic memory traces|Associative blending|Within|Surreal memory islands dissolving into each other with REM pulses emotional salience and narrative jumps
visual.material.ocean-freight-ledger.bill-of-lading-events.chain.through.system-diagram|Shipping documentation ledger|Bill of lading event records|Custody chain tracking|Through|Cargo documents passing through carriers ports customs brokers and insurers with signature checkpoints and liability handoff lines
visual.process.food-recall.lot-codes.trace.back.latency-topology-map|Food safety traceability desk|Lot code batch identifiers|Recall trace back|Back|Supply chain graph reversing from contaminated shelf item to farm processor cooler and truck routes
visual.composition.school-lunch-line.nutrition-portions.allocate.between.system-diagram|Public school cafeteria|Nutrition portion tokens|Meal allocation|Between|Tray flow balancing protein vegetables cost constraints allergy flags and student queue timing bands
visual.scene.courtroom-jury.evidence-exhibits.weigh.against.phase-state-map|Jury deliberation room|Evidence exhibit packets|Burden of proof weighing|Against|Evidence board with credibility arrows reasonable doubt thresholds testimony conflicts and verdict state transitions
visual.material.prison-library.paperbacks.circulate.through.latency-topology-map|Correctional facility library|Paperback book inventory|Restricted circulation|Through|Book movement map with request slips review gates cell block delivery and overdue return loops
visual.process.hospital-triage.symptom-vectors.prioritize.within.system-diagram|Emergency department triage bay|Patient symptom vector stream|Clinical prioritization|Within|Triage board ranking acuity vital signs room availability and care path handoff arrows
visual.composition.pharmacy-counter.prescription-tokens.verify.between.system-diagram|Retail pharmacy counter|Prescription authorization tokens|Medication verification|Between|Insurance checks drug interaction graph pharmacist review bins and pickup queue timing
visual.scene.dental-enamel.fluoride-ions.remineralize.over.macro-inspection|Tooth enamel surface|Fluoride ion solution|Enamel remineralization|Over|Microscopic tooth surface with mineral patches acid damage pits saliva film and ion exchange arrows
visual.material.eye-surgery.cornea-collagen.ablate.under.optical-power-plot|Laser eye surgery field|Corneal collagen lamellae|Excimer ablation|Under|Cornea curvature changing under laser pulses with depth profile rings refractive correction map and cooling intervals
visual.process.prosthetic-knee.hydraulic-fluid.dampen.along.dynamic-motion-trace|Adaptive prosthetic knee joint|Hydraulic damping fluid|Gait damping|Along|Walking cycle trace with valve state changes load transfer angles and stance swing phase timing
visual.composition.sleep-apnea.airway-soft-tissue.collapse.inside.macro-inspection|Upper airway sleep model|Soft palate tissue|Obstructive collapse|Inside|Airway passage narrowing during sleep with pressure drop airflow turbulence and oxygen saturation timeline
visual.scene.hemodialysis-filter.blood-plasma.diffuse.through.cutaway-section|Dialysis cartridge hollow fiber bundle|Blood plasma solutes|Membrane diffusion|Through|Thousands of fibers exchanging toxins into dialysate with flow arrows concentration gradients and pressure gauges
visual.material.vaccine-vial.glass-cold-chain.fog.over.thermal-imaging-profile|Cold vaccine vial tray|Borosilicate vial glass|Condensation fogging|Over|Cold vials warming under room air with dew point halos label barcodes and temperature excursion markers
visual.process.pathology-slide.stained-tissue.classify.across.microscopic-sem-view|Digital pathology scanner|Stained tissue morphology patches|Cell classification|Across|Whole slide heatmap with tumor margins nuclei detections stain channels and pathologist annotation layers
visual.composition.public-bathhouse.steam-humidity.condense.on.thermal-imaging-profile|Communal bathhouse ceiling|Humid steam film|Surface condensation|On|Warm vapor collecting on tiles with droplet growth paths ventilation arrows and thermal comfort gradients
visual.scene.fire-station.dispatch-signals.route.through.latency-topology-map|Emergency dispatch center|Radio dispatch signal packets|Incident routing|Through|City incident map with truck availability station coverage response paths and traffic priority corridors
visual.material.flood-barrier.aluminum-panels.lock.against.stress-distribution-map|Temporary flood defense line|Interlocking aluminum panels|Hydrostatic load locking|Against|Flood panels resisting brown water pressure with gasket compression anchor loads and overtopping risk marks
visual.process.ambulance-route.traffic-signals.preempt.along.system-diagram|Urban emergency corridor|Traffic light control states|Signal preemption|Along|Ambulance path clearing intersections with green wave timing cross traffic holds and patient arrival clock
visual.composition.elevator-evacuation.smoke-control.pressurize.within.system-diagram|High rise smoke refuge system|Pressurized clean air zones|Smoke control pressurization|Within|Building section with stairwell pressure fans smoke doors refuge floors and evacuation flow arrows
visual.scene.library-silence.sound-pressure.dampen.within.acoustic-spectrogram|Quiet reading room|Low amplitude sound pressure field|Acoustic damping|Within|Shelves and carpets absorbing footsteps with reverberation decay curves whisper bands and quiet zone contours
visual.material.piano-string.steel-wire.resonate.along.acoustic-spectrogram|Grand piano string bed|Tempered steel piano wire|Harmonic resonance|Along|String vibrating beside hammer felt with overtone spectrum bridge coupling and soundboard radiation arrows
visual.process.ceramic-studio.clay-slip.throw.around.dynamic-motion-trace|Pottery wheel studio|Wet clay slip body|Wheel throwing|Around|Clay rising under hands on rotating wheel with spiral grooves pressure zones and wall thickness profile
visual.composition.textile-dye.indigo-molecules.bind.into.macro-inspection|Natural dye vat|Indigo dye molecules|Fiber dye binding|Into|Blue dye entering cotton threads with oxidation color change rinsing streaks and weave magnification
visual.scene.glassblower-shop.molten-glass.inflate.within.thermal-imaging-profile|Glassblowing hot shop|Molten soda lime glass|Bubble inflation|Within|Glowing glass bubble expanding on blowpipe with heat gradients wall thickness bands and tool contact marks
visual.material.printmaking-plate.etched-copper.ink.within.macro-inspection|Etching press plate|Etched copper grooves|Ink retention|Within|Copper plate grooves holding black ink with wiping marks paper pressure and transferred line density
visual.process.bookbinding-thread.linen-cord.sew.through.stroboscopic-exposure|Bindery sewing frame|Waxed linen thread|Signature sewing|Through|Folded paper signatures stitched onto cords with needle arcs tension marks and spine alignment guides
visual.composition.photography-darkroom.silver-halide.develop.under.macro-inspection|Analog darkroom tray|Silver halide emulsion|Chemical development|Under|Photographic image appearing in developer bath with grain density contrast curves and red safelight reflections
visual.scene.skatepark-concrete.polyurethane-wheels.grind.along.dynamic-motion-trace|Concrete skatepark bowl|Polyurethane wheel and deck trucks|Rail grinding|Along|Skater board tracing coping with sparks friction marks body rotation and speed ghost silhouettes
visual.material.swimming-pool.chlorinated-water.turbulate.around.airflow-field-map|Competition pool lane|Chlorinated water volume|Swimmer turbulence|Around|Swimmer wake vortices around lane ropes with stroke timing bubbles and drag reduction streamlines
visual.process.climbing-wall.chalk-dust.grip.against.stress-distribution-map|Indoor climbing route|Magnesium carbonate chalk dust|Friction grip|Against|Handholds coated in chalk with finger force vectors slip risk patches and route sequence labels
visual.composition.ski-slope.snow-crystals.compact.under.topographic-map|Groomed ski piste|Compacted snow crystal layer|Ski compaction|Under|Slope map with ski pressure tracks crystal fracture zones edge bite arcs and avalanche caution bands
visual.scene.sailing-regatta.canvas-sails.trim.across.airflow-field-map|Coastal sail race course|Woven sailcloth membrane|Aerodynamic trimming|Across|Boats tacking through wind vectors with sail camber pressure fields wake lines and tactical laylines
visual.material.marathon-shoe.foam-midsole.compress.along.stress-distribution-map|Road running shoe sole|Expanded foam midsole|Stride compression|Along|Footfall sequence with foam rebound heat strain maps contact patch and runner cadence graph
visual.process.basketball-arc.leather-ball.spin.through.dynamic-motion-trace|Indoor basketball court|Leather ball surface|Backspin trajectory|Through|Ball arcing toward hoop with spin axis drag curve hand release vector and rim collision probability
visual.composition.cricket-pitch.red-ball-seam.swing.through.airflow-field-map|Cricket pitch lane|Raised seam cricket ball|Aerodynamic swing|Through|Ball moving through air with seam angle boundary layer asymmetry and batter reaction timeline
visual.scene.chessboard.strategy-branches.prune.within.system-diagram|Tournament chessboard|Candidate move tree|Search pruning|Within|Board position expanding into branches with evaluation scores forced lines and clock pressure markers
visual.material.origami-paper.crease-memory.fold.into.phase-state-map|Origami worktable|Creased cellulose sheet|Mountain valley folding|Into|Paper transforming into crane with crease pattern graph layer collisions and fold sequence arrows
visual.process.calligraphy-ink.capillary-flow.spread.along.macro-inspection|Calligrapher rice paper|Carbon ink capillary flow|Brushstroke spreading|Along|Ink feathering through fibers with brush pressure trace wet edge and pigment density gradient
visual.composition.mosaic-wall.ceramic-tiles.align.across.isometric-voxel-grid|Public mosaic mural|Glazed ceramic tile tesserae|Pattern alignment|Across|Small colored tiles arranged on grid with grout spacing perspective guide and symbolic image emergence
visual.scene.culinary-stock.collagen-gelatin.extract.into.thermal-imaging-profile|Soup stock pot|Bone collagen gelatin molecules|Thermal extraction|Into|Simmering pot with collagen dissolving into broth fat droplets convection rolls and aroma compound paths
visual.material.sourdough-starter.microbial-culture.bubble.within.macro-inspection|Fermentation jar|Wild yeast bacteria culture|Gas bubble growth|Within|Starter matrix rising with bubble networks acidity bands feeding schedule ticks and gluten web strands
visual.process.chocolate-tempering.cocoa-butter-crystals.align.under.thermal-imaging-profile|Chocolate tempering slab|Cocoa butter crystal forms|Polymorph alignment|Under|Glossy chocolate cooling with beta crystal domains temperature curve spatula strokes and snap quality gauge
visual.composition.pickling-jar.salt-brine.osmose.through.macro-inspection|Fermentation jar|Salt brine and vegetable cells|Osmotic preservation|Through|Cucumber cells losing water into brine with lactobacillus bubbles acidity gradient and spice particles
visual.scene.tea-infusion.polyphenols.diffuse.through.macro-inspection|Glass teacup|Tea polyphenol molecules|Hot water infusion|Through|Amber plumes blooming from tea leaves with convection curls tannin concentration and cooling surface ripples
visual.material.cast-iron-pan.seasoned-oil.polymerize.over.macro-inspection|Kitchen skillet surface|Polymerized seasoning oil|Heat curing|Over|Black pan surface gaining glossy polymer film with smoke point markers and microscopic roughness filling
visual.process.freezer-burn.ice-crystals.sublime.from.macro-inspection|Frozen food package|Surface ice crystals|Freezer sublimation|From|Ice crystals disappearing from food surface with dry air flow dehydration patches and packaging leak paths
visual.composition.green-roof.sedum-roots.retain.within.environmental-impact-map|Urban green roof bed|Sedum root soil mat|Stormwater retention|Within|Roof layers holding rainwater with drain delay curves root uptake arrows and cooling benefit zones
visual.scene.home-insulation.cellulose-fiber.slow.through.thermal-imaging-profile|Residential wall cavity|Blown cellulose fiber|Heat flow slowing|Through|Wall section with thermal gradient blocked by fiber pockets moisture risk and stud bridge losses
visual.material.solar-roof.perovskite-film.degrade.under.spectroscopic-signature|Experimental solar roof tile|Perovskite photovoltaic film|Humidity degradation|Under|Cell layer darkening under moisture with spectral efficiency loss ion migration and encapsulation cracks
visual.process.rain-garden.runoff-water.infiltrate.into.topographic-map|Curbside rain garden|Urban runoff water|Soil infiltration|Into|Street runoff entering planted basin with pollutant capture zones root paths and overflow relief arrows
visual.composition.home-battery.lithium-iron-phosphate.cycle.between.system-diagram|Residential battery cabinet|Lithium iron phosphate cell pack|Charge discharge cycling|Between|Battery modules balancing house solar grid loads with state of charge bands and inverter flows
visual.scene.apartment-plumbing.greywater-flow.reuse.through.system-diagram|Apartment greywater system|Soap diluted greywater|Water reuse routing|Through|Sink shower and garden loops with filter stages storage tank levels and sanitation boundaries
visual.material.heat-pump.refrigerant-r32.compress.inside.thermal-imaging-profile|Residential heat pump unit|R32 refrigerant vapor|Vapor compression|Inside|Compressor loop with evaporator condenser expansion valve and indoor outdoor heat arrows
visual.process.smart-thermostat.occupancy-signals.learn.within.system-diagram|Home climate controller|Occupancy sensor signal history|Adaptive schedule learning|Within|Thermostat model updating comfort setpoints with presence timeline energy price and weather forecast inputs
visual.composition.noise-canceling-headphones.inverse-wave.emit.against.acoustic-spectrogram|Headphone ear cup|Inverse pressure wave field|Active cancellation|Against|Incoming noise waveform met by opposite phase speaker output with residual error spectrum
visual.scene.recycling-sorter.near-infrared-signals.classify.across.instrumented-lab-view|Materials recovery facility|Near infrared reflectance signatures|Polymer classification|Across|Conveyor items scanned into spectral classes with air jets bins and contamination flags
visual.material.compost-pile.thermophilic-microbes.heat.inside.thermal-imaging-profile|Backyard compost heap|Thermophilic microbial biomass|Biological heating|Inside|Pile core glowing warm with oxygen channels moisture pockets decomposition stages and turning fork paths
visual.process.street-tree-root.asphalt-cracks.lift.under.stress-distribution-map|Sidewalk tree pit|Expanding root and asphalt slab|Root heave|Under|Roots pushing pavement upward with crack paths trip hazards water uptake and soil compaction zones
visual.composition.houseplant-stomata.water-vapor.release.over.macro-inspection|Indoor leaf surface|Stomatal water vapor flux|Transpiration release|Over|Leaf pores opening with humidity boundary layer light exposure and droplet evaporation trails
visual.scene.pet-aquarium.nitrifying-bacteria.convert.within.system-diagram|Home aquarium biofilter|Ammonia nitrite nitrate stream|Nitrogen cycle conversion|Within|Filter sponge ecosystem converting waste with bacterial colonies oxygen bubbles and fish health gauges
visual.material.laundry-detergent.surfactant-micelles.encapsulate.around.macro-inspection|Washing machine drum|Surfactant micelle molecules|Oil soil encapsulation|Around|Micelles surrounding grease droplets in tumbling water with fabric fibers and rinse dilution arrows
visual.process.inkjet-printer.pigment-droplets.eject.onto.stroboscopic-exposure|Desktop inkjet printer head|Pigment ink droplets|Piezoelectric ejection|Onto|Droplets firing from nozzles onto paper grid with dot gain alignment marks and color channel timing
visual.composition.microwave-oven.water-dipoles.rotate.within.thermal-imaging-profile|Microwave oven cavity|Water molecule dipoles|Dielectric heating rotation|Within|Food cross section heating unevenly with standing wave hot spots turntable motion and steam pockets
visual.scene.wifi-apartment.radio-multipath.reflect.between.latency-topology-map|Apartment wireless environment|WiFi radio wave paths|Multipath reflection|Between|Rooms filled with bouncing signals dead zones router beams and device throughput heatmap
visual.material.touchscreen.finger-capacitance.distort.over.instrumented-lab-view|Capacitive touchscreen panel|Finger electric field coupling|Touch capacitance distortion|Over|Transparent electrode grid sensing fingertip with capacitance delta map and gesture trace
visual.process.refrigerator-defrost.ice-buildup.melt.from.thermal-imaging-profile|Refrigerator evaporator coil|Frost ice accumulation|Defrost melting|From|Coil fins shedding frost with heater bands drip tray flow and temperature recovery curve
visual.composition.elevator-button.contact-film.close.inside.macro-inspection|Elevator button switch|Gold plated contact film|Electrical contact closure|Inside|Button cutaway with spring travel contact bounce waveform and indicator light circuit
visual.scene.sidewalk-rain.oil-sheen.interfere.over.macro-inspection|Wet city sidewalk|Thin oil film on water|Color interference|Over|Rainbow patches on puddle with film thickness rings shoe ripples and reflected streetlights
visual.material.soap-bubble.thin-film.drain.along.macro-inspection|Soap bubble surface|Nanometer detergent film|Gravity drainage|Along|Iridescent bubble film thinning downward with black spots marangoni flows and rupture risk zones
visual.process.candle-wick.paraffin-melt.capillary-rise.through.macro-inspection|Burning candle wick|Liquid paraffin wax|Capillary fuel rise|Through|Molten wax climbing braided wick with flame zones soot trail and pool boundary
visual.composition.window-frost.water-vapor.crystallize.on.macro-inspection|Cold window pane|Water vapor frost crystals|Dendritic crystallization|On|Fern like frost growing over glass with nucleation seeds temperature gradient and sunrise melt edge
visual.scene.train-station-clock.synchronized-pulses.tick.across.system-diagram|Rail station timekeeping network|Synchronized clock pulse signals|Time distribution|Across|Platform clocks linked by timing pulses with train departure boards drift correction and passenger flow
visual.material.braille-page.paper-embossing.touch.along.macro-inspection|Braille printed page|Embossed cellulose dots|Tactile reading|Along|Finger moving over raised dot cells with pressure maps line tracking and semantic word grouping
visual.process.escalator-steps.steel-treads.loop.under.dynamic-motion-trace|Transit escalator well|Ribbed steel step chain|Continuous step cycling|Under|Steps folding into comb plate with motor torque path passenger load and emergency stop zones
visual.composition.vending-machine.coin-sensor.detect.through.system-diagram|Vending machine coin path|Conductive coin token|Coin validation sensing|Through|Coin rolling past optical and inductive sensors with reject gate path and credit logic
visual.scene.bicycle-chain.lubricant-film.shear.along.macro-inspection|Bicycle drivetrain chain|Viscous lubricant boundary film|Chain shear lubrication|Along|Chain rollers moving over sprocket teeth with oil film thickness grit particles and wear heat maps
visual.material.umbrella-fabric.raindrop-beads.roll.off.dynamic-motion-trace|Rain umbrella canopy|Hydrophobic woven polyester fabric|Droplet roll off|Off|Water beads racing down sloped fabric with contact angle labels seam leakage risks and wind gust deformation
`;

const HANDWRITTEN_UNIVERSE_LINES_501_721 = String.raw`
visual.scene.memory-palace.synaptic-cues.retrieve.through.cognitive-map|Human memory palace|Synaptic cue fragments|Associative recall|Through|Rooms of remembered objects lighting up along retrieval paths with activation trails confidence halos and interference shadows
visual.scene.polar-research-camp.ice-core-bubbles.archive.inside.stratigraphic-section|Antarctic research camp|Ancient air bubble inclusions|Climate archive preservation|Inside|Ice core layers stacked beside field tents with gas bubble ages isotope curves and storm accumulation bands
visual.scene.nanorobot-swarm.drug-payloads.navigate.through.microvascular-map|Tumor capillary network|Targeted drug payload particles|Autonomous navigation|Through|Microscale robots moving through branching vessels with chemical gradients wall collision traces and delivery probability fields
visual.scene.cave-painting-gallery.ochre-pigments.bind.over.conservation-macro-view|Paleolithic cave wall|Iron ochre pigment film|Mineral binding|Over|Hand stencils and animal marks embedded in calcite crust with humidity damage edges and pigment grain inspection windows
visual.scene.judicial-case-map.evidence-claims.contradict.between.knowledge-graph-view|Judicial case workspace|Documented evidence claims|Contradiction detection|Between|Nodes of testimony exhibits statutes and timestamps linked by conflict arcs provenance tags and confidence bands
visual.scene.disaster-waterline.chlorine-residual.diffuse.through.infrastructure-map|Emergency water distribution line|Chlorine disinfectant residual|Public health diffusion|Through|Temporary pipes and tanks with residual concentration contours usage queues leak points and contamination risk overlays
visual.scene.orbital-debris-cloud.aluminum-shards.cascade.across.orbital-vector-map|Low Earth orbit debris shell|Fragmented aluminum spacecraft shards|Collision cascade|Across|Thousands of tracked fragments crossing orbital lanes with conjunction risk cones and altitude decay curves
visual.scene.fungal-bioreactor.mycelium-mats.digest.inside.bioprocess-cutaway|Industrial fungal bioreactor|Living mycelium mats|Enzymatic digestion|Inside|Stacked trays of white fungal networks consuming waste fibers with humidity control lines and nutrient uptake gradients
visual.scene.autonomous-farm.soil-nitrate-map.steer.across.agricultural-growth-map|Precision agriculture field|Soil nitrate measurements|Robotic steering|Across|Autonomous tractors following nutrient contour lines with crop health patches irrigation lanes and variable rate application tracks
visual.scene.coral-night-dive.fluorescent-proteins.glow.under.optical-response-plot|Night reef survey|Fluorescent coral protein pigments|Excited fluorescence|Under|Blue excitation lights revealing green and red coral signatures with diver transects and spectral response curves
visual.scene.city-heat-island.asphalt-thermal-mass.radiate.over.urban-water-map|Dense urban neighborhood|Asphalt and concrete heat stores|Nighttime radiative release|Over|Roof and street heat map with tree shade deficits building exhaust plumes and cooling corridor proposals
visual.scene.glacier-lake-outburst.moraine-dam-boulders.fail.through.terrain-hazard-map|High mountain moraine lake|Unstable moraine boulder dam|Outburst flood failure|Through|Lake water breaking through loose debris with flood wave routes settlement exposure zones and sediment pulse arrows
visual.scene.battery-recycling-line.black-mass-slurry.separate.inside.industrial-cutaway|Battery recycling facility|Lithium nickel cobalt black mass slurry|Hydrometallurgical separation|Inside|Crushed cell powder moving through leach tanks filters and solvent extraction columns with metal recovery gauges
visual.scene.textile-microfiber-ocean.polyester-filaments.shed.through.current-drift-map|Laundry wastewater outfall|Polyester microfiber filaments|Synthetic fiber shedding|Through|Colored fibers leaving pipes into coastal currents with plankton contact points and filtration capture statistics
visual.scene.underground-mycorrhiza.carbon-sugars.exchange.between.biological-network-map|Forest root zone|Plant carbon sugar exudates|Symbiotic resource exchange|Between|Roots and fungal hyphae trading carbon and phosphorus with branch weights seasonal pulses and moisture barriers
visual.scene.heliostat-field.mirror-facets.track.onto.optical-bench-projection|Solar thermal tower field|Motorized mirror facets|Solar tracking focus|Onto|Thousands of mirrors aiming sunlight at a tower receiver with aim point jitter heat flux maps and shadow scheduling
visual.scene.perovskite-solar-cell.charge-carriers.recombine.inside.semiconductor-package-view|Thin film photovoltaic cell|Hybrid perovskite charge carriers|Carrier recombination|Inside|Layer stack showing electrons holes grain boundaries trap states and luminescence loss channels
visual.scene.anticyclone-dust-plume.saharan-minerals.transport.across.meteorological-radar-view|Transatlantic dust outbreak|Saharan mineral aerosol plume|Long range transport|Across|Dust optical depth swath crossing ocean trade winds with deposition zones cloud seeding effects and satellite tracks
visual.scene.rainforest-firebreak.humid-leaf-litter.resist.along.ecological-succession-map|Rainforest reserve edge|Moist leaf litter and understory plants|Firebreak resistance|Along|Forest boundary holding against flame fingers with humidity gradients canopy gaps ember paths and regrowth patches
visual.scene.fish-market-cold-chain.ice-slurry.preserve.through.operations-dashboard|Seafood market logistics|Crushed ice slurry coolant|Perishable preservation|Through|Fish crates moving through docks trucks and stalls with temperature excursions spoilage risk and sensor timestamps
visual.scene.vineyard-frost-fans.cold-air-drainage.mix.above.agricultural-growth-map|Hillside vineyard|Cold air drainage layer|Frost protection mixing|Above|Fans stirring temperature inversion over grape rows with bud damage risk and terrain channel contours
visual.scene.data-market-orderbook.bid-ask-liquidity.shift.between.operations-dashboard|Electronic trading venue|Bid ask liquidity ladder|Order book shifting|Between|Price levels filling and draining with queue positions hidden liquidity markers and volatility burst traces
visual.scene.endocrine-feedback-axis.hormone-pulses.regulate.between.system-diagram|Human endocrine axis|Hormone pulse signals|Feedback regulation|Between|Hypothalamus pituitary gland loops with timed hormone bursts receptor sensitivity and suppression arrows
visual.scene.language-model-attention.token-vectors.attend.across.neural-network-map|Transformer attention block|Context token vectors|Attention weighting|Across|Tokens linked by attention weights with head specialization bands residual streams and probability mass movement
visual.scene.topology-proof-space.open-sets.cover.within.mathematical-mesh|Abstract topology proof space|Open set collection|Compact cover reasoning|Within|Nested colored regions covering a manifold with refinement arrows boundary exceptions and proof dependency paths
visual.scene.legal-contract-network.obligation-clauses.trigger.through.knowledge-graph-view|Commercial contract graph|Obligation clause nodes|Condition triggering|Through|Clauses activating across parties dates deliverables and remedies with dependency arcs and breach risk markers
visual.scene.museum-conservation-vault.humidity-buffering-gel.stabilize.inside.conservation-macro-view|Museum artifact vault|Humidity buffering silica gel|Conservation stabilization|Inside|Artifacts sealed in drawers with humidity capsules corrosion coupons light exposure logs and preservation envelopes
visual.scene.jazz-improvisation-stage.brass-harmonics.respond.between.spectral-analysis-view|Live jazz ensemble stage|Brass overtone harmonics|Call and response improvisation|Between|Saxophone and trumpet phrases trading motifs through spectral bands rhythmic grids and audience energy pulses
visual.scene.urban-river-restoration.woody-debris.slow.along.ecological-flow-map|Restored urban river reach|Engineered woody debris structures|Flow slowing|Along|Log jams shaping pools riffles and floodplain reconnection with fish habitat pockets and bank erosion arrows
visual.scene.coastal-salt-marsh.blue-carbon-sediment.accrete.over.environmental-impact-map|Tidal salt marsh platform|Organic blue carbon sediment|Vertical accretion|Over|Marsh surface rising with sediment traps root mats tidal creeks and sea level stress bands
visual.scene.desert-solar-still.condensed-water.collect.inside.thermal-workshop-view|Arid survival still|Condensed potable water droplets|Solar distillation collection|Inside|Plastic sheet funneling evaporated moisture into a cup with sun angle heat gradients and brine residue
visual.scene.border-relief-queue.identity-documents.verify.through.operations-dashboard|Humanitarian processing center|Identity document packets|Eligibility verification|Through|Queue lanes forms translators aid desks and verification stamps mapped with wait pressure and exception routes
visual.scene.gene-editing-lab.guide-rna.target.inside.molecular-dynamics-simulation|Genome editing bench|Guide RNA Cas complex|Sequence targeting|Inside|RNA guide docking to DNA with mismatch sites repair templates fluorescence readouts and off target warning paths
visual.scene.avalanche-rescue-grid.beacon-signals.triangulate.across.terrain-hazard-map|Mountain rescue slope|Radio beacon signals|Victim triangulation|Across|Searchers sweeping avalanche debris with signal strength lobes probe lines burial depth and safe approach corridors
visual.scene.airport-baggage-system.rfid-tags.route.through.logistics-network-map|Airport baggage tunnel|RFID tagged luggage|Automated routing|Through|Suitcases moving across belts diverters scanners and carts with missed connection alerts and load balancing lanes
visual.scene.farm-soil-carbon.root-exudates.store.under.agricultural-growth-map|Regenerative crop field|Root exudate carbon compounds|Soil carbon storage|Under|Crop roots feeding microbes below no till residue with aggregate formation carbon pools and moisture retention zones
visual.scene.wetland-mosquito-plume.co2-gradient.attract.through.ecological-motion-map|Wetland dusk habitat|Carbon dioxide odor plume|Mosquito host seeking|Through|Insect flight paths weaving through reeds and odor gradients with wind shear humidity and predator avoidance fields
visual.scene.urban-traffic-noise.pressure-waves.reflect.between.acoustic-field-map|Elevated roadway canyon|Vehicle noise pressure waves|Acoustic reflection|Between|Sound fields bouncing off building facades with barrier shadows window exposure levels and frequency heat strips
visual.scene.refinery-flare-stack.hydrocarbon-vapors.combust.above.thermal-imaging-profile|Petrochemical flare stack|Waste hydrocarbon vapor stream|Emergency combustion|Above|Tall flame plume with steam assist rings radiation zones soot opacity and safety perimeter overlays
visual.scene.powder-bed-printer.titanium-particles.sinter.across.instrumented-lab-view|Additive manufacturing chamber|Titanium powder bed particles|Laser sintering|Across|Laser path fusing metal grains with melt pool temperature recoater marks and residual stress vectors
visual.scene.library-knowledge-graph.catalog-records.link.through.knowledge-graph-view|Research library catalog|Bibliographic metadata records|Semantic linking|Through|Authors subjects citations and editions connected by graph edges with provenance stamps and discovery paths
visual.scene.classroom-peer-learning.idea-tokens.spread.between.civic-network-map|Collaborative classroom|Student idea tokens|Peer knowledge diffusion|Between|Desks and discussion groups exchanging concept cards with misconception sinks and understanding growth traces
visual.scene.neurovascular-unit.oxygen-glucose.exchange.across.biological-cutaway|Brain capillary interface|Oxygen and glucose supply molecules|Neurovascular exchange|Across|Astrocytes neurons and vessels coupled by metabolic demand with perfusion response curves and barrier transport channels
visual.scene.coral-reef-acoustics.fish-calls.propagate.through.ocean-acoustic-profile|Healthy reef soundscape|Fish and shrimp acoustic pulses|Habitat sound propagation|Through|Reef crackle and calls spreading through water with larval attraction zones and noise masking overlays
visual.scene.asteroid-mining-smelter.nickel-ore-melt.refine.inside.orbital-engineering-view|Orbital resource refinery|Nickel iron ore melt|Vacuum refining|Inside|Rotating smelter separating metal slag and volatiles with solar furnace mirrors and mass driver loading arcs
visual.scene.deep-space-hibernation-pod.metabolic-heat.throttle.inside.clinical-flow-map|Interstellar crew hibernation pod|Low metabolism thermal output|Metabolic throttling|Inside|Sleeper capsule with perfusion loops drug dosing charts neural monitoring and heat rejection fins
visual.scene.cloud-computing-region.workload-packets.failover.between.latency-topology-map|Distributed cloud region|Workload request packets|Regional failover|Between|Data centers rerouting traffic during outage with latency contours health checks and replication lag indicators
visual.scene.quantum-error-correction-surface.syndrome-bits.decode.across.phase-state-map|Surface code processor|Stabilizer syndrome bits|Error decoding|Across|Plaquette lattice flashing correction chains with measurement rounds logical boundaries and decoder confidence fields
visual.scene.shipwreck-reef.iron-hull-corrosion.colonize.over.wide-establishing-view|Sunken ship reef|Corroding iron hull surface|Ecological colonization|Over|Rusting beams covered by sponges fish and coral with current shadows corrosion flakes and habitat succession zones
visual.scene.orbital-solar-power.microwave-beam.transmit.to.ground-energy-map|Space solar power station|Microwave power transmission beam|Orbital energy transfer|To|Huge arrays sending controlled beam to rectenna fields with exclusion zone contours and conversion efficiency gauges
visual.material.metamaterial-cloak.split-ring-resonators.bend.around.electromagnetic-field-map|Laboratory cloaking shell|Split ring resonator metamaterial|Electromagnetic wave bending|Around|Microwave fronts curving around a hidden object with anisotropic cells phase delays and scattering nulls
visual.material.synthetic-diamond.nitrogen-vacancy-centers.sense.inside.magnetic-force-microscopy|Quantum sensing chip|Diamond nitrogen vacancy defects|Magnetic field sensing|Inside|Pink diamond lattice with spin readout spots microwave drive loops and nanoscale magnetic sample contours
visual.material.kelp-alginate.hydrogel-network.swell.inside.macro-inspection|Biopolymer capsule|Kelp alginate hydrogel network|Osmotic swelling|Inside|Transparent gel beads expanding in solution with crosslink density maps and controlled release dye fronts
visual.material.zeolite-framework.aluminosilicate-pores.sieve.through.cutaway-section|Molecular sieve pellet|Aluminosilicate zeolite pore lattice|Molecular sieving|Through|Cage shaped pores admitting small gas molecules while blocking larger ones with adsorption heat bands
visual.material.graphene-oxide.flake-sheets.stack.across.molecular-dynamics-simulation|Nanomaterial membrane|Graphene oxide flake sheets|Lamellar stacking|Across|Overlapping carbon sheets forming nanochannels with oxygen groups water layers and ion rejection paths
visual.material.perovskite-film.mixed-halide-ions.migrate.under.semiconductor-package-view|Photovoltaic absorber film|Mixed halide ion lattice|Field driven ion migration|Under|Perovskite grains showing iodide bromide drift trap formation and hysteresis loops under bias
visual.material.chitosan-bandage.amine-groups.bind.over.clinical-flow-map|Wound dressing surface|Chitosan polymer amine groups|Antimicrobial binding|Over|Biopolymer mesh contacting wound fluid with bacterial membranes adhesion zones and moisture absorption patches
visual.material.hempcrete-wall.lime-binder-carbonate.within.environmental-section|Low carbon building wall|Hemp shiv lime binder composite|Carbonation curing|Within|Porous wall section hardening as CO2 diffuses through lime matrix with moisture buffering and insulation cells
visual.material.mycelium-leather.fungal-fibers.tangle.across.textile-inspection-view|Biofabricated sheet|Compressed fungal fiber network|Fiber entanglement|Across|Mycelium leather surface with branching strands pressed into grain patterns and tensile test direction markers
visual.material.basalt-fiber.roving-strands.tension.under.stress-distribution-map|Composite reinforcement tow|Continuous basalt fiber strands|Tensile loading|Under|Dark mineral fibers stretched through resin with load sharing arrows fracture initiation points and weave alignment
visual.material.e-ink-pigment.microcapsules.flip.under.subpixel-macro-inspection|E paper display film|Charged black white pigment microcapsules|Electrophoretic flipping|Under|Tiny capsules switching visible particles under electrode grids with ghosting traces and refresh waveform panels
visual.material.shape-memory-polymer.crosslinks.recover.after.thermal-imaging-profile|Programmable polymer strip|Thermally activated crosslink network|Shape recovery|After|Deformed strip returning to memorized form with heat front maps strain release and hinge curvature guides
visual.material.thermochromic-dye.leuco-molecules.switch.under.optical-response-plot|Color changing coating|Leuco dye molecules|Temperature color switching|Under|Printed patches changing hue along a heat gradient with activation thresholds and reversible color curves
visual.material.liquid-crystal-droplets.director-fields.align.between.polarization-view|Smart glass layer|Liquid crystal droplet director fields|Polarization alignment|Between|Milky film clearing under voltage with crossed polarizers domain textures and transmission percentage readouts
visual.material.programmable-matter.voxel-actuators.reconfigure.within.isometric-voxel-grid|Modular matter slab|Voxel scale actuator modules|Shape reconfiguration|Within|Cubic elements rearranging into tools and surfaces with neighbor locks power buses and motion constraints
visual.material.ionogel-electrolyte.ionic-liquid.confine.inside.electrochemical-cutaway|Flexible supercapacitor gel|Ionic liquid trapped in polymer network|Ion confinement|Inside|Gel electrolyte between carbon electrodes with ion crowding layers voltage windows and bending strain maps
visual.material.gallium-droplet.liquid-metal-skin.rupture.under.macro-inspection|Room temperature liquid metal bead|Gallium oxide skin shell|Surface rupture|Under|Silver droplet splitting through thin oxide skin with wetting tracks and electrical contact probes
visual.material.sodium-vapor.discharge-lines.emit.inside.spectroscopic-signature|Low pressure lamp tube|Excited sodium vapor atoms|Spectral line emission|Inside|Golden lamp plasma with D line peaks electrode sheaths and pressure broadening graph
visual.material.carbon-black-ink.conductive-particles.percolate.across.microscopic-sem-view|Printed sensor trace|Carbon black nanoparticle ink|Conductive percolation|Across|Black ink film drying into connected particle chains with resistance drop curve and crack islands
visual.material.amyloid-fibrils.beta-sheets.aggregate.along.molecular-dynamics-simulation|Protein aggregation assay|Amyloid beta sheet fibrils|Pathological aggregation|Along|Long protein fibers nucleating from monomers with seeded ends toxic oligomers and binding dye fluorescence
visual.material.melanin-granules.eumelanin-polymers.absorb.under.optical-response-plot|Skin pigment cell|Eumelanin polymer granules|Broadband light absorption|Under|Dark granules shielding nuclei with UV intensity gradients scattering halos and photochemical protection zones
visual.material.collagen-scaffold.triple-helix-fibers.crosslink.within.macro-inspection|Tissue engineering scaffold|Collagen triple helix fibers|Enzymatic crosslinking|Within|Fibrous matrix stiffening as cells attach with pore size measures strain fields and growth factor spots
visual.material.crispr-cas-complex.guide-rna-cleave.at.molecular-dynamics-simulation|Genome editing complex|Cas nuclease with guide RNA|Targeted DNA cleavage|At|Protein RNA complex gripping DNA at protospacer site with cut marks mismatch bases and repair pathway arrows
visual.material.lipid-bilayer.phospholipid-headgroups.self-assemble.into.molecular-dynamics-simulation|Cell membrane patch|Amphiphilic phospholipid molecules|Bilayer self assembly|Into|Lipids closing into a membrane sheet with hydrophobic core water interface and curvature stress
visual.material.mrna-strand.ribosome-codons.translate.through.biological-cutaway|Cell cytoplasm translation site|Messenger RNA codon sequence|Ribosomal translation|Through|Ribosome crawling along mRNA with tRNA arrivals nascent protein chain and codon timing ticks
visual.material.exosome-vesicles.membrane-cargo.fuse.with.cellular-uptake-map|Intercellular signaling fluid|Exosome lipid vesicles|Membrane fusion uptake|With|Small vesicles docking to cell surfaces with receptor matching cargo release and extracellular flow lines
visual.material.prion-protein.misfolded-conformers.template.along.molecular-dynamics-simulation|Neural tissue protein field|Misfolded prion conformers|Conformation templating|Along|Misfolded proteins converting neighbors into aggregates with propagation fronts and clearance failure markers
visual.material.silkworm-silk.fibroin-fibers.draw.through.textile-inspection-view|Silk reeling station|Fibroin protein fiber filament|Fiber drawing|Through|Golden silk filaments unwinding from cocoons with tensile alignment birefringence and humidity control gauges
visual.material.nacre-tablet.aragonite-plates.stack.within.macro-inspection|Mollusk shell interior|Aragonite nacre tablets|Brick mortar stacking|Within|Iridescent shell layers showing mineral tablets organic mortar crack deflection and growth fronts
visual.material.biochar-charcoal.porous-carbon.adsorb.inside.environmental-section|Soil amendment granule|Porous biochar carbon matrix|Nutrient adsorption|Inside|Black charcoal pores holding ions and water with microbial habitat pockets and cation exchange markers
visual.material.compost-leachate.dissolved-organics.seep.through.environmental-section|Compost pile drain layer|Dissolved organic leachate|Nutrient seepage|Through|Brown liquid moving through decomposing layers with microbial heat zones ammonia plumes and runoff capture trench
visual.material.pollen-grains.exine-shells.disperse.across.macro-inspection|Flowering meadow air|Sculpted pollen grain shells|Wind dispersal|Across|Spiky pollen grains drifting above petals with allergen count bands and turbulent eddy paths
visual.material.airborne-spores.chitin-walls.germinate.on.macro-inspection|Damp indoor surface|Fungal spores with chitin walls|Surface germination|On|Spores landing on wet material and extending hyphae with humidity halos and colony start points
visual.material.microplastic-fibers.polymer-strands.fragment.into.environmental-impact-map|Coastal sediment sample|Weathered plastic fiber strands|Fragmentation into microplastics|Into|Colored fibers breaking into smaller pieces with abrasion history toxic additive halos and ingestion risk icons
visual.material.volcanic-glass.hydration-rind.grow.over.geological-section|Obsidian artifact edge|Hydrated volcanic glass rind|Hydration layer growth|Over|Thin alteration bands creeping inward from glass surface with age calibration ticks and diffusion fronts
visual.material.rare-earth-magnets.neodymium-domains.align.under.magnetic-force-microscopy|Permanent magnet rotor|Neodymium iron boron magnetic domains|Domain alignment|Under|Microscopic magnetic domains locking orientation with coercivity curves grain boundaries and demagnetization risk
visual.material.superconducting-cable.cooper-pair-current.flow.through.cryogenic-cutaway|Cryogenic power cable|Superconducting Cooper pair current|Zero resistance flow|Through|Cold cable cross section with current density bands quench sensors and liquid nitrogen channels
visual.material.molten-glass.viscous-silicate.stretch.into.thermal-workshop-view|Glassblowing furnace gather|Viscous molten silicate|Thermal stretching|Into|Orange glass strand pulled into form with viscosity bands bubble seeds and cooling skin gradients
visual.material.refractory-brick.alumina-grains.insulate.under.thermal-imaging-profile|Kiln wall lining|Alumina refractory brick grains|High temperature insulation|Under|Brick cross section blocking furnace heat with pore network thermal gradients and spall cracks
visual.material.recycled-aluminum.dross-inclusions.separate.inside.industrial-cutaway|Scrap remelt furnace|Molten recycled aluminum with dross inclusions|Flux assisted separation|Inside|Silver metal bath shedding oxide dross with skimmer paths alloy readings and impurity pockets
visual.material.ceramic-matrix-composite.silicon-carbide-fibers.bridge.across.stress-distribution-map|Turbine hot section coupon|Silicon carbide fiber ceramic matrix|Crack bridging|Across|Ceramic crack held by fibers with pullout lengths thermal shock marks and load transfer arrows
visual.material.aerated-concrete.air-voids.insulate.within.environmental-section|Lightweight concrete block|Entrained air void concrete|Thermal insulation|Within|Porous block wall showing heat path detours moisture migration and compressive load cells
visual.material.photochromic-glass.silver-halide-clusters.darken.under.optical-response-plot|Adaptive eyeglass lens|Silver halide photochromic clusters|UV darkening response|Under|Lens tint deepening in sunlight with molecular state arrows recovery curve and glare reduction zones
visual.material.archival-ink.carbon-pigments.persist.over.conservation-macro-view|Manuscript preservation sheet|Carbon black archival ink|Long term pigment persistence|Over|Ink strokes sitting in paper fibers with fading comparison patches humidity damage and fiber capillary paths
visual.material.asphalt-binder.bitumen-polymers.rut.under.friction-map|Highway pavement surface|Bitumen polymer asphalt binder|Traffic rutting|Under|Road lane depressions forming under wheel loads with temperature softening and aggregate skeleton stress maps
visual.material.marine-snow.lipid-rich-detritus.aggregate.through.ocean-acoustic-profile|Twilight ocean water column|Lipid rich organic detritus flakes|Particle aggregation|Through|Soft detritus clusters sinking with bacterial respiration halos sonar scatter and carbon export rates
visual.material.ferrocement-wire-mesh.reinforce.inside.stress-distribution-map|Thin shell water tank|Steel wire mesh cement composite|Crack reinforcement|Inside|Cement shell section with wire mesh arresting cracks hoop stress vectors and water pressure gradients
visual.material.conductive-polymer.polyaniline-chains.dope.across.electrochemical-cutaway|Flexible electrode film|Polyaniline conductive polymer chains|Chemical doping|Across|Green polymer film gaining conductivity as dopant ions enter with redox fronts and bend test traces
visual.material.nanoporous-gold.ligament-network.coarsen.under.microscopic-sem-view|Catalyst nanoporous metal|Gold ligament network|Surface coarsening|Under|Sponge like gold ligaments thickening during heat exposure with active site loss and pore size histograms
visual.process.audit-log.immutable-events.append.through.system-diagram|Compliance event stream|Immutable audit log records|Append only recording|Through|Events entering a tamper evident ledger with hash links actor stamps retention windows and anomaly flags
visual.process.compiler-pipeline.source-tokens.lower.into.system-diagram|Programming language compiler|Source code token stream|Intermediate representation lowering|Into|Tokens parsing into abstract syntax trees then IR blocks with optimization passes and error spans
visual.process.neural-training.gradient-tensors.backpropagate.through.neural-network-map|Model training run|Gradient tensor fields|Backpropagation update|Through|Layer weights receiving gradients with loss curves activation heatmaps optimizer momentum and vanishing gradient warnings
visual.process.bayesian-inference.prior-beliefs.update.with.evidence-flow-map|Probabilistic reasoning model|Prior belief distribution|Bayesian evidence updating|With|Probability curves shifting after observations with likelihood surfaces posterior credible regions and decision thresholds
visual.process.genetic-mutation.base-pairs.substitute.within.molecular-dynamics-simulation|DNA replication site|Nucleotide base pair sequence|Point mutation substitution|Within|Double helix copying with mismatch base insertion repair enzyme paths and mutation probability markers
visual.process.chromosomal-recombination.homologous-arms.exchange.between.cell-lineage-map|Meiotic chromosome pair|Homologous chromatid arms|Crossover recombination|Between|Chromosome segments crossing and swapping with chiasma sites spindle orientation and inheritance color bands
visual.process.transcription-factor.dna-promoter.bind.at.molecular-dynamics-simulation|Gene promoter region|Transcription factor protein complex|Promoter binding|At|Protein docking onto DNA motif with enhancer loops occupancy graphs and RNA polymerase recruitment arrows
visual.process.ribosome-translation.amino-acids.chain.along.biological-cutaway|Ribosome tunnel|Amino acid monomer supply|Peptide elongation|Along|Amino acids joining into a chain through ribosome exit tunnel with codon steps and energy costs
visual.process.protein-folding.hydrophobic-residues.collapse.into.molecular-dynamics-simulation|Folding protein chain|Hydrophobic amino acid residues|Hydrophobic collapse|Into|Protein ribbon folding around buried residues with energy funnel contours and misfold trap pockets
visual.process.chaperone-refolding.misfolded-protein.release.from.biochemical-cutaway|Cell stress response|Misfolded client protein|Chaperone assisted refolding|From|Protein released from chaperone chamber with ATP cycle marks corrected fold and aggregation avoidance zone
visual.process.self-assembly.colloidal-particles.order.into.phase-state-map|Colloidal suspension chamber|Charged colloidal particles|Crystal self assembly|Into|Particles arranging into lattice domains with defect boundaries nucleation seeds and Brownian motion trails
visual.process.enzyme-catalysis.transition-state.stabilize.inside.biochemical-cutaway|Enzyme active site|Transition state substrate complex|Catalytic stabilization|Inside|Substrate bent inside pocket with energy barrier graph charged residues and product release arrows
visual.process.circadian-clock.gene-expression.oscillate.within.biological-network-map|Cellular circadian oscillator|Clock gene expression levels|Daily molecular oscillation|Within|Feedback loop genes rising and falling with light entrainment phase delay and protein degradation paths
visual.process.firefly-synchrony.light-pulses.lock.across.ecological-motion-map|Firefly meadow|Bioluminescent pulse signals|Phase synchronization|Across|Insects flashing together over grass with local coupling waves phase drift and crowd coherence fronts
visual.process.network-congestion.packet-queues.jam.inside.latency-topology-map|Internet router fabric|Packet queue buffers|Congestion jamming|Inside|Buffers filling across ports with dropped packets backpressure signals and latency spike heatmaps
visual.process.multi-agent-negotiation.utility-bids.converge.between.operations-dashboard|Autonomous marketplace|Agent utility bid messages|Negotiation convergence|Between|Agents trading offers and counteroffers with Pareto frontier marks deadlines and agreement probability
visual.process.spectrum-auction.frequency-blocks.allocate.across.civic-network-map|Telecom auction room|Radio spectrum block rights|Auction allocation|Across|Frequency bands assigned to bidders with bid ladders interference maps and coverage obligation lines
visual.process.payment-settlement.net-obligations.clear.between.operations-dashboard|Financial clearing network|Net obligation messages|Settlement clearing|Between|Banks exchanging payment obligations with netting cycles liquidity queues and unresolved exception markers
visual.process.dispute-arbitration.claim-evidence.weigh.inside.knowledge-graph-view|Arbitration case chamber|Submitted claim evidence|Evidentiary weighing|Inside|Arguments evidence exhibits and rules balanced on decision graph with credibility scores and burden shifts
visual.process.civic-vote.paper-ballots.reconcile.through.civic-audit-view|Election audit room|Paper ballot batches|Audit reconciliation|Through|Ballots sampled and matched to tallies with chain of custody seals discrepancy buckets and recount thresholds
visual.process.deliberative-polling.opinion-samples.shift.after.civic-network-map|Public deliberation forum|Opinion sample distributions|Preference shift after discussion|After|Citizen clusters moving across issue space with information packets moderator interventions and confidence intervals
visual.process.weather-data-assimilation.sensor-observations.merge.into.meteorological-radar-view|Numerical weather center|Satellite radar buoy observations|Data assimilation|Into|Observation points pulled into forecast grid with residual vectors model bias and uncertainty plumes
visual.process.urban-growth-simulation.land-use-cells.evolve.across.current-drift-map|Metropolitan planning model|Land use cellular grid|Scenario simulation|Across|Residential industrial green cells changing under zoning transit and flood constraints with growth fronts
visual.process.supply-optimization.inventory-levels.balance.between.logistics-network-map|Retail supply network|Inventory level signals|Multi node optimization|Between|Warehouses and stores rebalancing stock with demand forecasts transport limits and shortage penalties
visual.process.chemical-equilibrium.reactants-products.balance.within.chemical-process-view|Reaction vessel state|Reactant and product concentration pools|Equilibrium balancing|Within|Forward and reverse arrows stabilizing concentrations with temperature pressure shifts and Le Chatelier response
visual.process.population-bifurcation.species-density.split.under.ecological-succession-map|Ecological model landscape|Species density state variable|Bifurcation splitting|Under|Population curve branching into alternate stable states with control parameter slider and tipping threshold
visual.process.reservoir-percolation.water-paths.connect.through.geological-section|Porous aquifer rock|Water filled pore channels|Percolation connectivity|Through|Isolated pore clusters suddenly linking into a continuous flow path with threshold surface and pressure drops
visual.process.cloud-nucleation.aerosol-seeds.activate.within.atmospheric-profile|Rising cloud parcel|Aerosol cloud condensation nuclei|Droplet nucleation activation|Within|Water vapor condensing on particles with supersaturation curve size spectrum and updraft cooling arrows
visual.process.metal-annealing.grain-boundaries.migrate.under.thermal-imaging-profile|Heat treated alloy sample|Metal crystal grain boundaries|Annealing migration|Under|Grains growing and defects disappearing under heat with hardness map and recrystallization front
visual.process.quench-hardening.martensite-needles.form.inside.microscopic-sem-view|Steel quench tank|Austenite transforming to martensite needles|Rapid quench transformation|Inside|Needle shaped martensite plates forming through steel with cooling rate bands and residual stress fields
visual.process.rock-spallation.thermal-stress.flake.off.geological-section|Desert rock face|Thermally stressed outer rock shell|Spallation flaking|Off|Rock surface peeling into sheets under sun cycles with crack fronts and temperature expansion mismatch
visual.process.metal-fatigue.microcracks.propagate.under.stress-distribution-map|Aircraft wing coupon|Cyclic stress microcracks|Fatigue crack propagation|Under|Tiny cracks growing from rivet holes with load cycles beach marks and failure probability curves
visual.process.glacier-creep.ice-crystals.deform.along.cutaway-section|Deep glacier ice column|Interlocking ice crystal grains|Slow plastic creep|Along|Crystal fabric bending under gravity with basal sliding velocity and blue strain ellipses
visual.process.pump-cavitation.vapor-bubbles.collapse.inside.instrumented-lab-view|Centrifugal pump impeller|Vapor bubble cavities|Cavitation collapse|Inside|Bubbles imploding near blades with pressure dips pitting zones acoustic bursts and efficiency loss graph
visual.process.food-emulsion.oil-droplets.disperse.within.macro-inspection|Mayonnaise mixing bowl|Oil droplet emulsion phase|Shear emulsification|Within|Droplets breaking into stable sizes with surfactant shells viscosity ridges and mixing blade trails
visual.process.water-treatment-flocculation.clay-particles.cluster.into.process-diagram|Clarifier tank|Suspended clay particles|Coagulant flocculation|Into|Fine particles clumping into settling flocs with polymer bridges mixing zones and turbidity decline curve
visual.process.aeration-basin.microbubbles.transfer.into.system-diagram|Wastewater aeration tank|Oxygen microbubble plume|Gas transfer aeration|Into|Bubble columns feeding microbes with dissolved oxygen contours blower energy and sludge circulation loops
visual.process.sludge-dewatering.polymer-flocs.compress.under.industrial-cutaway|Belt press station|Polymer bound sludge flocs|Mechanical dewatering compression|Under|Wet sludge squeezed between belts with filtrate drains cake dryness and pressure roller sequence
visual.process.tree-grafting.cambium-layers.join.along.agricultural-growth-map|Orchard graft union|Exposed cambium tissue layers|Vascular graft union|Along|Scion and rootstock healing together with callus bridge sap flow and compatibility marks
visual.process.vine-pruning.dormant-canes.remove.from.agricultural-growth-map|Winter vineyard row|Dormant grape cane wood|Selective pruning removal|From|Cut canes leaving bud positions with future shoot predictions disease entry risk and trellis geometry
visual.process.pollination-orchard.pollen-loads.transfer.between.ecological-motion-map|Fruit orchard bloom|Pollen grain loads|Insect mediated transfer|Between|Bee paths carrying pollen among flowers with compatibility matrix wind assistance and fruit set probability
visual.process.bird-migration.magnetic-cues.guide.along.ecological-motion-map|Continental flyway|Magnetic compass cue signals|Seasonal migration guidance|Along|Flocks moving along coastlines and stars with magnetic inclination bands stopover energy and weather detours
visual.process.bear-hibernation.fat-reserves.mobilize.inside.biological-cutaway|Winter den metabolism|Stored fat reserve molecules|Metabolic hibernation mobilization|Inside|Sleeping animal cross section with low heart rate heat conservation and fat oxidation timeline
visual.process.photoswitching-azobenzene.molecular-bonds.flip.under.optical-response-plot|Photoactive polymer surface|Azobenzene molecular switches|Light driven isomerization|Under|Molecules toggling shape under UV and visible light with surface contraction and response cycles
visual.process.phase-locking.oscillator-signals.align.between.spectral-analysis-view|Coupled oscillator bench|Electronic oscillator phase signals|Phase locking|Between|Two waveforms pulling into shared frequency with beat notes lock range and phase error decay
visual.process.database-checkpoint.memory-pages.flush.to.system-diagram|Database storage engine|Dirty memory pages|Checkpoint flushing|To|Changed pages written to disk with write ahead log positions latency spikes and recovery boundaries
visual.process.transaction-rollback.partial-writes.revert.after.system-diagram|Database transaction log|Partial write records|Rollback recovery|After|Failed transaction unwinding through log entries with undo records locks released and consistency restored
visual.composition.climate-feedback.ice-albedo.couple.within.earth-system-dashboard|Polar climate system|Ice albedo feedback signal|Coupled within climate system|Within|Sea ice reflectivity and temperature reinforcing each other with feedback arrows thresholds and seasonal hysteresis
visual.composition.microbiome-drug.metabolites-modulate.between.biological-network-map|Gut pharmacology network|Microbial drug metabolite products|Modulated between microbes and host|Between|Drug molecules transformed by bacteria then routed to liver enzymes with response variability map
visual.composition.algorithmic-bias.training-data.weighted-by.knowledge-graph-view|Machine learning dataset|Historical training data labels|Weighted by sampling bias|By|Dataset groups feeding model decisions with imbalance bars feedback loops and fairness constraint overlays
visual.composition.water-rights.river-flows.allocated-between.civic-network-map|Watershed governance board|River flow allocation rights|Allocated between users|Between|Farms cities ecosystems and treaties sharing flow volumes with drought priorities and legal constraint edges
visual.composition.food-web.energy-biomass.pyramid-under.ecological-succession-map|Grassland trophic web|Energy biomass pools|Pyramid under trophic levels|Under|Producers herbivores predators stacked with energy loss arrows population shocks and seasonal biomass pulses
visual.composition.noise-canceling.headphone-waves.invert-against.acoustic-field-map|Active headphone cup|Opposing pressure waveforms|Inverted against ambient noise|Against|Incoming noise wave and generated antiphase wave canceling at ear with residual frequency pockets
visual.composition.blockchain-bridge.locked-assets.mirror-between.system-diagram|Cross chain bridge protocol|Locked asset state records|Mirrored between chains|Between|Assets locked on one ledger and minted on another with validator signatures finality risk and failure paths
visual.composition.cultural-diffusion.shared-symbols.spread.through.civic-network-map|Regional communication network|Shared cultural symbols|Spread through social links|Through|Symbols moving across families schools media and migration routes with adoption clusters and resistance boundaries
visual.composition.disease-surveillance.case-reports.sampled-from.operations-dashboard|Public health surveillance system|Reported case records|Sampled from population|From|Clinics labs and wastewater feeding case signals into dashboard with undercount corrections and alert thresholds
visual.composition.antibiotic-stewardship.prescription-patterns.audited-through.clinical-flow-map|Hospital pharmacy program|Antibiotic prescription records|Audited through stewardship review|Through|Orders checked against cultures resistance data and guidelines with de escalation paths and ward heatmaps
visual.composition.ecological-corridor.animal-movement.routed-around.infrastructure-map|Wildlife crossing network|Animal movement paths|Routed around roads|Around|Habitat patches connected by overpasses culverts and fence funnels with mortality hotspots and migration traces
visual.composition.music-counterpoint.melody-lines.interlock-between.spectral-analysis-view|Baroque score space|Independent melody lines|Interlocked between voices|Between|Voice lines weaving around each other on staff and spectrum with dissonance suspensions and resolution arrows
visual.composition.supply-contract.price-index.hedged-against.operations-dashboard|Commodity supply agreement|Price index exposure|Hedged against volatility|Against|Contract clauses linked to futures positions with trigger bands margin calls and delivery schedule risks
visual.composition.carbon-market.offset-claims.verified-by.civic-audit-view|Carbon registry platform|Offset project claim records|Verified by audit evidence|By|Projects credits baselines and satellite checks linked with permanence risks and double count warnings
visual.composition.federated-learning.model-updates.aggregated-between.neural-network-map|Privacy preserving training network|Encrypted client model updates|Aggregated between devices|Between|Phones and servers exchanging gradients with secure aggregation masks drift scores and personalization branches
visual.composition.city-zoning.height-limits.constrain-under.infrastructure-map|Urban planning map|Building height regulation surfaces|Constrained under zoning rules|Under|Parcels extruded to allowed heights with transit overlays shadows affordability bonuses and variance requests
visual.composition.cognitive-dissonance.belief-states.tension-between.cognitive-map|Human belief network|Conflicting belief state nodes|Tension between commitments|Between|Mental model graph with incompatible claims stress weights rationalization routes and evidence repair paths
visual.composition.software-dependencies.package-versions.resolve-through.system-diagram|Application build graph|Package version constraints|Resolved through dependency solver|Through|Dependency tree selecting compatible versions with conflict edges lockfile pins and vulnerability overlays
visual.composition.forest-edge.microclimate.gradients.layered-under.ecological-succession-map|Forest fragment edge|Temperature humidity light gradients|Layered under canopy structure|Under|Edge to interior transect showing light penetration wind drying invasive species and seedling survival bands
visual.composition.hydrogen-economy.electrolyzer-output.connected-to.energy-flow-map|Regional clean fuel system|Green hydrogen production stream|Connected to storage and demand|To|Electrolyzers pipelines caverns and vehicles linked with renewable curtailment and pressure storage levels
visual.composition.ocean-fisheries.catch-limits.thresholded-by.environmental-impact-map|Marine fishery quota system|Catch limit control variables|Thresholded by stock assessments|By|Fleet effort restrained by biomass estimates recruitment uncertainty and protected habitat zones
visual.composition.vaccine-cold-chain.temperature-logs.authenticated-by.operations-dashboard|Immunization logistics chain|Temperature logger records|Authenticated by custody chain|By|Vials moving through warehouses clinics and coolers with excursions signatures and dose viability markers
visual.composition.martian-habitat.regolith-shielding.layered-over.cutaway-section|Mars surface habitat|Compacted regolith radiation shield|Layered over living module|Over|Buried habitat section with cosmic ray attenuation dust seals thermal mass and rover access tunnels
visual.composition.recommender-system.user-embeddings.ranked-against.embedding-space-view|Content recommendation model|User preference embedding vector|Ranked against item vectors|Against|User vector probing item cloud with nearest neighbors novelty penalty and feedback loop trails
visual.composition.archival-provenance.digital-records.linked-through.knowledge-graph-view|Digital archive provenance graph|Preservation metadata records|Linked through custody events|Through|Files checksums curators migrations and rights statements connected with integrity alarms and access paths
visual.composition.wind-grid.battery-storage.buffered-between.energy-flow-map|Renewable power grid|Battery storage state of charge|Buffered between wind and load|Between|Wind farm output smoothed through batteries with ramp limits frequency support and demand peaks
visual.composition.hospital-air-pressure.isolation-rooms.ventilated-through.clinical-flow-map|Hospital infection control wing|Negative pressure room airflow|Ventilated through filters|Through|Air moving from hallway to room to HEPA exhaust with door leaks pathogen particles and pressure gauges
visual.composition.deepfake-detection.pixel-artifacts.correlated-with.security-inspection-view|Media forensics lab|Pixel level artifact signals|Correlated with synthetic generation|With|Face video frames linked to compression noise blink timing and model fingerprint heatmaps
visual.composition.space-mission-risk.failure-modes.decomposed-into.system-diagram|Spacecraft mission assurance board|Failure mode risk register|Decomposed into subsystems|Into|Propulsion power thermal software and operations risk blocks connected to mitigations and probability severity grids
visual.composition.protein-design.sequence-motifs.mapped-onto.molecular-dynamics-simulation|Computational protein design model|Amino acid sequence motifs|Mapped onto folded structure|Onto|Sequence pattern colored across 3D protein with binding pocket constraints and stability score contours
visual.composition.urban-microgrid.load-shedding.prioritized-between.operations-dashboard|Islanded neighborhood microgrid|Critical load priority list|Prioritized between circuits|Between|Homes clinic pumps and batteries switched by priority with outage boundaries and voltage stability traces
visual.composition.water-desalination.brine-plume.diluted-with.current-drift-map|Desalination outfall coast|Concentrated brine discharge plume|Diluted with seawater current|With|Dense saline plume sinking and spreading with diffuser jets benthic risk zones and mixing efficiency markers
visual.composition.satellite-imagery.crop-stress.projected-through.agricultural-growth-map|Remote sensing crop model|Multispectral vegetation stress signal|Projected through field grid|Through|NDVI anomalies over farm parcels with irrigation faults disease patches and yield forecast overlays
visual.composition.language-translation.syntax-tree.transformed-into.knowledge-graph-view|Machine translation engine|Source language syntax tree|Transformed into target structure|Into|Parse branches rearranged across languages with alignment links idiom warnings and semantic preservation scores
visual.composition.psychedelic-therapy.default-mode-network.modulated-under.neural-network-map|Clinical neurotherapy session|Default mode network connectivity|Modulated under guided treatment|Under|Brain network connectivity loosening and reconnecting with session phases safety monitors and integration notes
visual.composition.magnetic-reconnection.field-lines.braided-through.magnetic-flux-profile|Plasma current sheet|Braided magnetic field lines|Braided through reconnection zone|Through|Field lines snapping and rejoining with particle acceleration exhaust jets and heat release contours
visual.composition.urban-tree-canopy.shade-benefits.equity-weighted-by.infrastructure-map|City forestry plan|Tree canopy shade service|Equity weighted by neighborhood need|By|Canopy gaps over heat vulnerable blocks with planting priority scores sidewalk constraints and cooling benefit arrows
visual.composition.synthetic-biology.gene-circuit.tuned-by.biochemical-cutaway|Engineered cell circuit|Regulatory gene module|Tuned by inducer concentration|By|Promoters repressors and reporters adjusting expression with dose response curves and burden limits
visual.composition.robot-swarm.task-allocation.federated-between.routing-simulation-view|Multi robot worksite|Task assignment messages|Federated between local agents|Between|Robots dividing jobs without central controller with auction bids congestion maps and recharge constraints
visual.composition.ocean-current-forecast.sensor-buoys.assimilated-into.current-drift-map|Coastal forecast model|Drifter and buoy sensor data|Assimilated into current field|Into|Current map corrected by floats radar and tide gauges with uncertainty ellipses and rescue drift paths
visual.composition.identity-wallet.credentials.verified-through.security-inspection-view|Digital identity wallet|Verifiable credential records|Verified through cryptographic proofs|Through|Credential cards producing zero knowledge proofs with issuer keys revocation checks and disclosure controls
visual.composition.nuclear-waste-repository.bentonite-buffer.insulated-by.geological-section|Deep geological repository|Bentonite clay buffer barrier|Insulated by host rock|By|Waste canisters sealed in tunnels with swelling clay groundwater paths radionuclide delay and heat decay curves
visual.composition.ai-safety-evals.capability-tests.thresholded-under.operations-dashboard|Model evaluation harness|Capability test result vectors|Thresholded under deployment policy|Under|Eval suites gating release decisions with risk categories regression deltas and mitigation checkmarks
visual.composition.biogeochemical-cycle.nitrogen-fluxes.coupled-with.earth-system-dashboard|Planetary nitrogen cycle|Nitrogen flux reservoirs|Coupled with ecosystems and industry|With|Atmosphere soils oceans farms and combustion linked by fixation denitrification and fertilizer leakage arrows
visual.composition.maritime-routing.weather-windows.optimized-around.logistics-network-map|Ocean shipping optimizer|Forecast weather window fields|Optimized around voyage constraints|Around|Ships choosing routes around storms currents fuel prices port slots and emission zones
visual.composition.financial-contagion.counterparty-risk.propagates-through.operations-dashboard|Banking network stress test|Counterparty exposure matrix|Propagates through defaults|Through|Institutions connected by obligations with shock transmission liquidity buffers and systemic risk heat
visual.composition.remote-surgery.latency-jitter.compensated-by.clinical-flow-map|Teleoperation surgical suite|Network latency jitter signal|Compensated by control prediction|By|Robot instruments following surgeon commands with delay buffers safety constraints and tissue force feedback
visual.composition.material-passport.building-components.indexed-by.knowledge-graph-view|Circular construction registry|Reusable building component records|Indexed by material passports|By|Beams panels windows and fixtures tagged with provenance carbon value and reuse compatibility links
visual.composition.biodiversity-offset.habitat-hectares.accounted-through.environmental-impact-map|Conservation offset ledger|Habitat hectare accounting units|Accounted through ecological metrics|Through|Lost and restored habitats compared by species quality location and time lag risk maps
visual.composition.education-pathway.skill-competencies.scaffolded-around.civic-network-map|Learning pathway planner|Skill competency nodes|Scaffolded around prerequisites|Around|Lessons projects assessments and mentors arranged around prerequisite graph with mastery evidence trails
visual.composition.cryptographic-signature.private-key.bound.to.security-inspection-view|Secure signing enclave|Private key material and signatures|Bound to hardware identity|To|Key stored in enclave signing messages with attestation chain side channel warning and verification route
visual.composition.invasive-species.spread-fronts.constrained-by.ecological-succession-map|Invasive plant management area|Propagule pressure spread fronts|Constrained by barriers|By|Infestation patches advancing until rivers roads and treatment zones redirect seed dispersal paths
visual.composition.digital-twin.sensor-streams.superimposed-over.infrastructure-map|Industrial plant digital twin|Live sensor telemetry streams|Superimposed over 3D asset map|Over|Pipes valves motors and readings aligned to twin geometry with anomaly colors and maintenance predictions
visual.composition.genetic-ancestry.haplotype-blocks.inferred-from.cell-lineage-map|Population genetics study|Inherited haplotype block segments|Inferred from genotype markers|From|Chromosome segments colored by ancestry with recombination breakpoints uncertainty bands and migration paths
visual.composition.seismic-retrofit.load-paths.hardened-into.structural-mode-shape|Old masonry building|New steel bracing load paths|Hardened into structure|Into|Retrofit braces and dampers redirecting earthquake forces with drift limits crack risk and mode shapes
visual.composition.public-transit-headways.arrival-times.synchronized-across.civic-network-map|Transit operations center|Bus and train arrival intervals|Synchronized across network|Across|Routes timed to transfer pulses with bunching corrections passenger demand and signal priority windows
visual.composition.organoid-culture.morphogen-gradients.pattern-inside.biological-cutaway|Stem cell organoid dish|Morphogen gradient chemical fields|Pattern inside tissue aggregate|Inside|Mini organ developing zones under growth factors with cell fate colors and lumen formation outlines
visual.composition.quantum-annealer.energy-landscape.tunneled-through.phase-state-map|Quantum optimization processor|Energy landscape barrier states|Tunneled through annealing path|Through|Qubits searching minima across rugged surface with transverse field schedule and avoided crossing labels
visual.composition.social-trust.reputation-scores.diffused-through.civic-network-map|Online community graph|Reputation score signals|Diffused through interactions|Through|Users exchanging trust signals with moderation interventions brigading alarms and bridge node influence
visual.composition.humanitarian-supply.needs-assessments.matched-against.logistics-network-map|Disaster response logistics cell|Needs assessment demand signals|Matched against supply inventory|Against|Shelter food medicine and transport matched to damaged regions with bottlenecks and unmet demand bands
visual.composition.marine-protected-area.enforcement-patrols.routed-around.current-drift-map|Ocean reserve enforcement map|Patrol vessel track plans|Routed around illegal fishing risk|Around|Patrol routes shaped by vessel sightings currents fuel limits and protected habitat priority
visual.composition.agroforestry-canopy.light-fractions.layered-under.agricultural-growth-map|Agroforestry field design|Fractional canopy light distribution|Layered under tree rows|Under|Crops growing beneath trees with shade bands root competition wind shelter and yield stability zones
visual.composition.edge-computing.inference-tasks.offloaded-between.latency-topology-map|IoT edge compute mesh|Inference task packets|Offloaded between nearby nodes|Between|Sensors phones gateways and microservers sharing inference load with latency budgets and battery limits
visual.composition.mental-health-care.patient-signals.triaged-through.clinical-flow-map|Behavioral health coordination board|Patient risk signal records|Triaged through care pathways|Through|Screenings messages appointments and crisis flags routed to clinicians with escalation thresholds and privacy boundaries
visual.composition.reef-restoration.coral-fragments.grafted-onto.ecological-succession-map|Coral nursery restoration plot|Nursery grown coral fragments|Grafted onto degraded reef|Onto|Coral fragments attached to reef substrate with survival tags thermal stress and fish recruitment paths
visual.composition.space-weather-grid.geomagnetic-storms.buffered-by.energy-flow-map|Electric grid control room|Geomagnetic induced current risk|Buffered by transformer controls|By|Transmission network under solar storm with neutral currents relay actions and blackout risk zones
visual.composition.misinformation-spread.claim-variants.mutated-through.knowledge-graph-view|Information integrity graph|Rumor claim variants|Mutated through resharing paths|Through|Claims changing across platforms with source lineage fact checks amplification loops and correction reach
visual.composition.aquifer-recharge.stormwater-infiltration.stored-under.geological-section|Managed aquifer recharge basin|Stormwater infiltration plume|Stored under alluvial aquifer|Under|Water sinking through soil vadose zone and aquifer layers with clogging risk and well recovery cones
visual.composition.satellite-megaconstellation.collision-avoidance.negotiated-between.orbital-vector-map|Orbital traffic management system|Conjunction warning messages|Negotiated between operators|Between|Satellites coordinating avoidance burns with covariance ellipses priority rules and fuel cost paths
visual.composition.neural-symbolic-reasoning.logic-rules.grounded-in.embedding-space-view|Hybrid reasoning engine|Logic rule constraints|Grounded in vector representations|In|Symbolic rules anchored to embedding clusters with proof chains counterexamples and semantic drift warnings
visual.composition.watercolor-paper.pigment-wash.diffused-under.conservation-macro-view|Watercolor painting surface|Pigment wash in paper fibers|Diffused under cellulose texture|Under|Transparent color spreading beneath paper grain with tide marks granulation and drying edge blooms
visual.composition.biomimetic-architecture.ventilation-flows.modeled-after.ecosystem-cutaway|Passive cooling building|Airflow chimney design variables|Modeled after termite mound|After|Building section borrowing mound ventilation with buoyancy shafts temperature zones and sensor controlled louvers
visual.composition.autonomous-vehicle.intent-predictions.fused-between.routing-simulation-view|Urban autonomous driving stack|Predicted pedestrian vehicle intents|Fused between sensors|Between|Camera lidar radar and map predictions merging around intersection agents with uncertainty cones and braking envelopes
visual.composition.global-supply-shock.inventory-buffers.depleted-through.logistics-network-map|Global manufacturing supply graph|Safety stock inventory buffers|Depleted through demand shock|Through|Factories ports suppliers and retailers losing buffers with bullwhip waves reroute options and shortage alerts
visual.composition.deep-learning-interpretability.feature-attributions.projected-onto.neural-network-map|Model interpretability view|Feature attribution scores|Projected onto network activations|Onto|Input regions and hidden units colored by contribution with saliency saturation and counterfactual paths
`;

function entry(id, family, labels, visualFeatures) {
  return { id, family, labels, visualFeatures };
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pick(rows, index, stride = 1) {
  return rows[(index * stride) % rows.length];
}

function pickBySeed(rows, seed, stride = 1) {
  return rows[Math.abs(seed * stride) % rows.length];
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function proceduralRecipeFor({
  type,
  globalOrder,
  cardId,
  scene,
  material,
  process,
  composition,
  object,
  variant,
  palette,
}) {
  const seed = hashText([
    cardId,
    scene.family,
    material.family,
    process.family,
    composition.family,
    object,
    variant,
  ].join('|'));
  const visualGrammar = pickBySeed(MARK_SYSTEMS, seed + globalOrder, 3);
  const textureBasis = pickBySeed(TEXTURE_BASES, seed + globalOrder, 5);
  const lightingModel = pickBySeed(LIGHTING_MODELS, seed + globalOrder, 7);
  const motionCue = pickBySeed(MOTION_CUES, seed + globalOrder, 11);
  const edgeTreatment = pickBySeed(EDGE_TREATMENTS, seed + globalOrder, 13);
  const densityField = pickBySeed(DENSITY_FIELDS, seed + globalOrder, 17);
  const depthModel = pickBySeed(DEPTH_MODELS, seed + globalOrder, 19);
  const signature = slug([
    type,
    scene.id,
    material.id,
    process.id,
    composition.id,
    object,
    variant,
    palette,
    visualGrammar,
    textureBasis,
    lightingModel,
    motionCue,
    edgeTreatment,
    densityField,
    depthModel,
  ].join('-'));
  return {
    schema: 'simulatte.visualRecipe.v1',
    signature,
    visualGrammar,
    textureBasis,
    lightingModel,
    motionCue,
    edgeTreatment,
    densityField,
    depthModel,
    colorStrategy: `${palette}-${material.family}-${process.family}`,
    shapeLanguage: `${scene.family}-${composition.family}-${slug(object)}`,
    stochasticSeeds: {
      structure: seed,
      material: hashText(`${material.id}|${cardId}`),
      process: hashText(`${process.id}|${cardId}`),
      composition: hashText(`${composition.id}|${cardId}`),
    },
    numericControls: {
      density: Number((((seed % 71) + 20) / 100).toFixed(2)),
      contrast: Number(((((seed >>> 3) % 61) + 35) / 100).toFixed(2)),
      motion: Number(((((seed >>> 7) % 67) + 25) / 100).toFixed(2)),
      roughness: Number(((((seed >>> 11) % 73) + 18) / 100).toFixed(2)),
    },
  };
}

function createSceneCard(index) {
  const scene = SCENE_DOMAINS[index % SCENE_DOMAINS.length];
  const variant = VARIANTS[Math.floor(index / SCENE_DOMAINS.length) % VARIANTS.length];
  const material = pick(MATERIALS, index, 5);
  const process = pick(PROCESSES, index, 7);
  const composition = pick(COMPOSITIONS, index, 11);
  return createCard('scene', index, scene, material, process, composition, variant);
}

function createMaterialCard(index) {
  const material = MATERIALS[index % MATERIALS.length];
  const variant = VARIANTS[Math.floor(index / MATERIALS.length) % VARIANTS.length];
  const scene = pick(SCENE_DOMAINS, index, 3);
  const process = pick(PROCESSES, index, 13);
  const composition = pick(COMPOSITIONS, index, 17);
  return createCard('material', index, scene, material, process, composition, variant);
}

function createProcessCard(index) {
  const process = PROCESSES[index % PROCESSES.length];
  const variant = VARIANTS[Math.floor(index / PROCESSES.length) % VARIANTS.length];
  const scene = pick(SCENE_DOMAINS, index, 19);
  const material = pick(MATERIALS, index, 23);
  const composition = pick(COMPOSITIONS, index, 29);
  return createCard('process', index, scene, material, process, composition, variant);
}

function createCompositionCard(index) {
  const composition = COMPOSITIONS[index % COMPOSITIONS.length];
  const variant = VARIANTS[Math.floor(index / COMPOSITIONS.length) % VARIANTS.length];
  const scene = pick(SCENE_DOMAINS, index, 31);
  const material = pick(MATERIALS, index, 37);
  const process = pick(PROCESSES, index, 41);
  return createCard('composition', index, scene, material, process, composition, variant);
}

function createCard(type, localIndex, scene, material, process, composition, variant, anchorOptions = null) {
  const options = anchorOptions && typeof anchorOptions === 'object'
    ? anchorOptions
    : { object: anchorOptions };
  const globalOrder = {
    scene: 0,
    material: SLICE_COUNT,
    process: SLICE_COUNT * 2,
    composition: SLICE_COUNT * 3,
  }[type] + localIndex;
  const object = options.object || pick(OBJECTS, globalOrder, 7);
  const palette = PALETTES[globalOrder % PALETTES.length];
  const generatedCardId = [
    'visual',
    type,
    slug(scene.id),
    slug(material.id),
    slug(process.id),
    slug(composition.id),
    slug(object),
    slug(variant),
  ].join('.');
  const cardId = options.cardId || generatedCardId;
  const labels = [
    `${scene.labels[0]} ${process.labels[0]}`,
    `${material.labels[0]} ${composition.labels[0]} ${object}`,
    `${variant} ${scene.labels[0]}`,
  ];
  const visualFeatures = unique([
    ...scene.visualFeatures,
    ...material.visualFeatures,
    ...process.visualFeatures,
    ...composition.visualFeatures,
  ]).slice(0, 12);
  const recipe = proceduralRecipeFor({
    type,
    globalOrder,
    cardId,
    scene,
    material,
    process,
    composition,
    object,
    variant,
    palette,
  });
  const candidateParts = [
    `simulatte visual card ${cardId}`,
    `type ${type}`,
    `scene ${scene.labels.join(' ')}`,
    `domain ${scene.family}`,
    `material ${material.labels.join(' ')}`,
    `material family ${material.family}`,
    `process ${process.labels.join(' ')}`,
    `process family ${process.family}`,
    `composition ${composition.labels.join(' ')}`,
    `composition family ${composition.family}`,
    `object ${object}`,
    `variant ${variant}`,
    `palette ${palette}`,
    `visual features ${visualFeatures.join(' ')}`,
    `visual recipe ${recipe.visualGrammar} ${recipe.textureBasis} ${recipe.lightingModel} ${recipe.motionCue}`,
    options.visualDescription ? `render description ${options.visualDescription}` : '',
    options.sourceExampleId ? `source example ${options.sourceExampleId}` : '',
    `render signature ${recipe.signature}`,
    `render intent ${scene.labels[0]} ${composition.labels[0]} ${material.labels[0]} ${object} while ${process.labels[0]}`,
  ].filter(Boolean);
  return {
    schema: 'simulatte.visualCard.v1',
    cardId,
    sourceExampleId: options.sourceExampleId || undefined,
    sourceGroup: options.sourceGroup || undefined,
    visualDescription: options.visualDescription || undefined,
    type,
    order: globalOrder,
    labels,
    facets: {
      scene: scene.id,
      domain: scene.family,
      material: material.id,
      materialFamily: material.family,
      process: process.id,
      processFamily: process.family,
      composition: composition.id,
      compositionFamily: composition.family,
      object,
      variant,
    },
    renderHints: {
      sceneKind: sceneKindFor(scene, process),
      paletteFamily: palette,
      geometry: geometryFor(scene, object),
      materialShader: shaderFor(material),
      processOverlay: overlayFor(process),
      compositionLayout: layoutFor(composition),
      camera: cameraFor(variant),
      layers: layerStackFor(type, scene, material, process, composition),
      negativeSpace: negativeSpaceFor(variant),
      proceduralRecipe: recipe,
    },
    retrieval: {
      tokens: unique(candidateParts.join(' ').toLowerCase().match(/[a-z0-9]+/g) || []).slice(0, 80),
      aliases: unique([...scene.labels, ...material.labels, ...process.labels, ...composition.labels]),
    },
    candidateText: candidateParts.join('\n'),
  };
}

function sceneKindFor(scene, process) {
  if (process.family.includes('optical') || scene.family === 'optics') return 'optics';
  if (process.family.includes('acoustic') || scene.family === 'acoustics') return 'acoustic';
  if (scene.family === 'civic' || scene.family === 'transport' || scene.family === 'economics') return 'city';
  if (scene.family === 'hydrology' || scene.family === 'ocean' || process.family.includes('fluid')) return 'watershed';
  if (scene.family === 'ecology' || scene.family === 'biology') return 'biology';
  if (scene.family === 'energy' || scene.family === 'electromagnetism') return 'magnetic-machine';
  if (process.family.includes('thermal')) return 'fire';
  if (scene.family === 'geology') return 'literal-composite';
  return 'generic';
}

function geometryFor(scene, object) {
  if (/turbine|rotor|gear|wheel/.test(object)) return 'rotating-mechanism-cutaway';
  const map = {
    civic: 'civic-block-and-route-grid',
    transport: 'transport-lane-and-platform-grid',
    medical: 'clinical-bay-layout',
    manufacturing: 'machine-cell-and-fixture-grid',
    electronics: 'circuit-rack-and-cable-topology',
    agriculture: 'row-crop-and-irrigation-grid',
    ecology: 'habitat-patch-and-flow-boundary',
    geology: 'strata-and-cavity-cross-section',
    hydrology: 'watershed-channel-contours',
    ocean: 'bathymetric-basin-section',
    cryosphere: 'fractured-ice-shelf-plane',
    weather: 'atmospheric-column-stack',
    fluid: 'instrumented-flow-channel',
    optics: 'optical-rail-ray-frame',
    electromagnetism: 'field-coil-radial-grid',
    energy: 'power-node-and-line-network',
    aerospace: 'launch-and-orbit-reference-frame',
    astronomy: 'gravitational-radial-lensing-frame',
    robotics: 'robot-path-obstacle-arena',
    economics: 'market-flow-queue-topology',
    social: 'attention-and-role-space',
    acoustics: 'standing-wave-resonator-section',
    domestic: 'domestic-appliance-room-cutaway',
    chemistry: 'reaction-vessel-molecular-inset',
    biology: 'organism-network-microstructure',
  };
  return map[scene.family] || 'layered-scene-field';
}

function shaderFor(material) {
  const map = {
    fluid: 'refractive-ripple',
    thermal: 'emissive-heat-glow',
    gas: 'volumetric-wisp',
    transparent: 'caustic-transparent',
    optical: 'specular-reflection',
    cryogenic: 'frost-facet',
    mineral: 'faceted-strata',
    granular: 'particle-bed',
    ceramic: 'glazed-crack',
    composite: 'aggregate-surface',
    organic: 'fibrous-grain',
    textile: 'woven-thread',
    polymer: 'smooth-elastic',
    porous: 'cellular-pore',
    soft: 'soft-translucent',
    biological: 'living-fiber',
    'biological-wax': 'warm-wax-honeycomb',
    metal: 'brushed-metal',
    carbon: 'dark-layered-carbon',
    semiconductor: 'circuit-wafer',
    electrochemical: 'ion-leak',
    chemical: 'reactive-liquid',
    'magnetic-fluid': 'ferrofluid-spike',
    'liquid-metal': 'mirror-droplet',
  };
  return map[material.family] || 'semantic-material';
}

function overlayFor(process) {
  const map = {
    thermal: 'heat-front',
    cryogenic: 'ice-front-crystallization',
    'thermal-fluid': 'boiling-churn-surface',
    phase: 'phase-boundary-crawl',
    fluid: 'flow-trails',
    hydrology: 'erosion-cuts',
    'granular-fluid': 'sediment-fallout-bands',
    transport: 'diffusion-transport-cloud',
    failure: 'damage-mask',
    'mechanical-fluid': 'pressure-pulse-loop',
    mechanical: 'motion-impulse',
    wave: 'phase-bands',
    acoustic: 'pressure-rings',
    'acoustic-magnetic': 'levitation-force-nodes',
    granular: 'sorting-bands',
    porous: 'filtration-capture-front',
    optical: 'ray-caustics',
    'optical-wave': 'interference-fringe-field',
    electromagnetic: 'flux-lines',
    electric: 'charge-paths',
    operations: 'queue-pulses',
    network: 'route-switches',
    biology: 'growth-front',
    'biology-energy': 'photosynthetic-uptake-rays',
    biochemistry: 'folding-contact-map',
    chemistry: 'reaction-cloud',
    ceramic: 'sinter-neck-growth',
    'fluid-chemical': 'multiphase-mixing-vortices',
    gravity: 'orbit-trails',
    energy: 'radiation-wavefronts',
    instrumentation: 'probe-scan-readout',
    systems: 'feedback-loop',
    logistics: 'payload-route-traces',
    manufacturing: 'toolpath-and-fixture-motion',
    textile: 'weave-tension-paths',
    'biology-fluid': 'ventilation-cycle-flow',
    electronics: 'signal-pulse-grid',
    collective: 'swarm-density-vectors',
  };
  return map[process.family] || 'semantic-process';
}

function layoutFor(composition) {
  const map = {
    spatial: 'spatial-relation-layout',
    interaction: 'interaction-focus-layout',
    system: 'system-flow-layout',
    transform: 'before-after-transform-layout',
    collective: 'agent-collective-layout',
    view: 'diagrammatic-view-layout',
    optical: 'optical-projection-layout',
    field: 'field-coupling-layout',
    instrumentation: 'instrument-sampling-layout',
    failure: 'damage-repair-layout',
    physics: 'conservation-exchange-layout',
  };
  return map[composition.family] || 'semantic-composition-layout';
}

function cameraFor(variant) {
  if (/macro/.test(variant)) return 'macro-inspection';
  if (/cutaway/.test(variant)) return 'section-cutaway';
  if (/topographic|system diagram/.test(variant)) return 'orthographic-map';
  if (/dynamic/.test(variant)) return 'motion-follow';
  return 'wide-composition';
}

function negativeSpaceFor(variant) {
  if (/system diagram|instrumented/.test(variant)) return 'reserved-readout-band';
  if (/macro/.test(variant)) return 'tight-subject-crop';
  if (/wide/.test(variant)) return 'environmental-breathing-room';
  return 'balanced-field';
}

function layerStackFor(type, scene, material, process, composition) {
  return unique([
    'background-field',
    `${scene.family}-archetype`,
    `${material.family}-material-shader`,
    `${process.family}-process-overlay`,
    `${composition.family}-composition-relation`,
    type === 'composition' ? 'relationship-emphasis' : '',
    type === 'process' ? 'motion-emphasis' : '',
    type === 'material' ? 'surface-detail-emphasis' : '',
    type === 'scene' ? 'environment-emphasis' : '',
  ].filter(Boolean));
}

function findEntry(rows, id, label) {
  const entry = rows.find((row) => row.id === id);
  if (!entry) throw new Error(`Missing ${label} ${id}`);
  return entry;
}

function findVariant(id) {
  if (!VARIANTS.includes(id)) throw new Error(`Missing variant ${id}`);
  return id;
}

function findObject(id) {
  if (!OBJECTS.includes(id)) throw new Error(`Missing object ${id}`);
  return id;
}

function titleFromSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .join(' ');
}

function wordsFromText(value) {
  return String(value || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function inferSceneFamily(sceneId, label) {
  const text = `${sceneId} ${label}`.toLowerCase();
  if (/star|galaxy|cosmic|nebula|pulsar|comet|orbit|space|planet|lunar|mars|venus|titan|europa|kuiper|magnetosphere|asteroid/.test(text)) return 'astronomy';
  if (/ocean|reef|estuary|lake|river|mangrove|seagrass|hydrothermal|fishery|tide|brine/.test(text)) return 'ocean';
  if (/volcan|glacier|dune|fault|subduction|karst|mantle|crater|permafrost|basalt|geyser|tectonic/.test(text)) return 'geology';
  if (/storm|hurricane|monsoon|front|atmosphere|weather|aurora|cloud|rain|tornado|wind/.test(text)) return 'weather';
  if (/cell|neuron|immune|kidney|lung|heart|retina|tumor|vaccine|biofilm|microbiome|chloroplast|organ/.test(text)) return 'biology';
  if (/hospital|surgery|dialysis|dental|pharmacy|clinical|pathology|vaccine|prosthetic/.test(text)) return 'medical';
  if (/grid|reactor|solar|hydrogen|battery|electrolyzer|tokamak|substation|fuel cell|heat pump/.test(text)) return 'energy';
  if (/chip|gpu|network|database|router|quantum|compiler|algorithm|data|security|laser|fiber|display|sensor/.test(text)) return 'computing';
  if (/factory|kiln|furnace|mill|mold|foundry|warehouse|port|crane|press|plating|welding/.test(text)) return 'manufacturing';
  if (/city|street|airport|rail|bus|elevator|school|library|court|museum|market|apartment|home/.test(text)) return 'civic';
  if (/farm|crop|greenhouse|vineyard|rice|compost|forest|bog|paddy|food|kitchen|brewery|bakery/.test(text)) return 'agriculture';
  if (/proof|logic|probability|category|fractal|game theory|dream|memory|ethic|language|music|narrative/.test(text)) return 'abstract';
  return 'open-world';
}

function inferMaterialFamily(materialId, label) {
  const text = `${materialId} ${label}`.toLowerCase();
  if (/photon|laser|radio|light|wave|spectral|optical/.test(text)) return 'optical';
  if (/plasma|ionized|electron|proton|qubit|charge|electric|magnetic|field/.test(text)) return 'electromagnetic';
  if (/water|brine|fluid|slurry|oil|glycol|steam|refrigerant|coolant|mud|gel|serum|blood/.test(text)) return 'fluid';
  if (/gas|aerosol|vapor|air|methane|ammonia|hydrogen|oxygen|co2|exhaust/.test(text)) return 'gas';
  if (/ice|snow|frost|helium|cryogenic|permafrost|frozen/.test(text)) return 'cryogenic';
  if (/steel|iron|nickel|copper|aluminum|metal|bronze|cobalt|nitinol|pzt|gantry|cable/.test(text)) return 'metal';
  if (/silicon|chip|qubit|semiconductor|photoresist|transistor|circuit|gpu|oled/.test(text)) return 'semiconductor';
  if (/protein|rna|dna|cell|enzyme|insulin|collagen|chromatin|microbial|bacteria|algae|lichen|mycelium/.test(text)) return 'biological';
  if (/paper|fiber|wood|cotton|linen|cardboard|cellulose|textile|fabric/.test(text)) return 'organic-fiber';
  if (/sand|silt|clay|basalt|quartz|silica|limestone|regolith|soil|dust|ash|mineral|zeolite/.test(text)) return 'mineral';
  if (/polymer|plastic|epoxy|resin|elastomer|rubber|polystyrene|surfactant|membrane/.test(text)) return 'polymer';
  if (/probability|token|signal|record|metadata|order|claim|value|belief|syntax|state/.test(text)) return 'information';
  return 'semantic-material';
}

function inferProcessFamily(processId, label) {
  const text = `${processId} ${label}`.toLowerCase();
  if (/collide|spin|swing|sprint|rotate|compress|flex|tension|hoist|climb|shatter|shear|grip/.test(text)) return 'mechanical';
  if (/condense|sublime|evaporate|melt|freeze|thaw|boil|heat|cool|thermal|pyrolyze|sinter|fuse/.test(text)) return 'thermal';
  if (/pulse|resonate|oscillate|wave|sound|acoustic|tick/.test(text)) return 'wave';
  if (/refract|fluoresce|emit|luminesce|diffract|focus|scatter|triangulate/.test(text)) return 'optical';
  if (/ionize|magnetize|conduct|induct|deflect|charge|discharge|entangle|confine/.test(text)) return 'electromagnetic';
  if (/flow|pump|circulate|discharge|filter|infiltrate|leach|mix|diffuse|transport/.test(text)) return 'fluid';
  if (/grow|digest|respire|colonize|spawn|ferment|bind|differentiate|heal|infect|release/.test(text)) return 'biology';
  if (/rank|route|queue|verify|allocate|prioritize|classify|schedule|match|optimize|learn|search/.test(text)) return 'systems';
  if (/erode|deposit|crack|rise|drip|wedge|calve|saltate|slump|avalanche|spout/.test(text)) return 'geophysical';
  if (/exchange|absorb|polymerize|etch|hydrate|precipitate|reduce|oxidize|dissolve|remineralize/.test(text)) return 'chemistry';
  if (/compose|balance|resolve|transform|iterate|encode|infer|equilibrate|prune/.test(text)) return 'abstract';
  return 'semantic-process';
}

function inferCompositionFamily(compositionId, label) {
  const text = `${compositionId} ${label}`.toLowerCase();
  if (/inside|within|through|across|along|around|between|under|over|above|below|into|from|onto|against|down|up|off|on|toward|back|at/.test(text)) return 'spatial';
  if (/system|diagram|map|plot|profile|grid|signature|view/.test(text)) return 'view';
  return 'semantic-composition';
}

function visualFeaturesFor(label, description) {
  return unique([
    ...String(label || '').toLowerCase().split(/\s+/).filter(Boolean),
    ...wordsFromText(description).slice(0, 18),
  ]).slice(0, 12);
}

function entryForAnchor(anchor, kind, baseRows) {
  const id = anchor[kind];
  const label = anchor[`${kind}Label`] || titleFromSlug(id);
  const base = baseRows.find((row) => row.id === id);
  const family = base && base.family || {
    scene: inferSceneFamily,
    material: inferMaterialFamily,
    process: inferProcessFamily,
    composition: inferCompositionFamily,
  }[kind](id, label);
  return entry(
    id,
    family,
    unique([label.toLowerCase(), titleFromSlug(id), ...(base && base.labels || [])]).slice(0, 5),
    unique([
      ...visualFeaturesFor(label, anchor.visualDescription),
      ...(base && base.visualFeatures || []),
    ]).slice(0, 12)
  );
}

function objectForAnchor(anchor) {
  if (anchor.object) return anchor.object;
  const words = titleFromSlug(anchor.scene).split(/\s+/).filter(Boolean);
  return words.slice(-2).join(' ') || 'semantic subject';
}

function parseCoverageLines(block, sourceGroup) {
  return block.trim().split(/\n+/).filter(Boolean).map((line, index) => {
    const parts = line.split('|').map((part) => part.trim());
    if (parts.length !== 6) {
      throw new Error(`Coverage line ${sourceGroup}:${index + 1} must have 6 pipe-delimited fields`);
    }
    const [cardId, sceneLabel, materialLabel, processLabel, compositionLabel, visualDescription] = parts;
    const idParts = cardId.split('.');
    if ((idParts.length !== 7 && idParts.length !== 6) || idParts[0] !== 'visual') {
      throw new Error(`Coverage line ${sourceGroup}:${index + 1} has invalid card id ${cardId}`);
    }
    const [, type, scene, material, processOrComposition, compositionOrVariant, maybeVariant] = idParts;
    const compactId = idParts.length === 6;
    const process = compactId ? slug(processLabel) : processOrComposition;
    const composition = compactId ? processOrComposition : compositionOrVariant;
    const variantSlug = compactId ? compositionOrVariant : maybeVariant;
    return {
      type,
      scene,
      material,
      process,
      composition,
      variant: titleFromSlug(variantSlug),
      sceneLabel,
      materialLabel,
      processLabel,
      compositionLabel,
      visualDescription,
      cardId,
      sourceExampleId: cardId,
      sourceGroup,
    };
  });
}

function assignAnchorSlots(anchors) {
  const usedByType = Object.fromEntries(['scene', 'material', 'process', 'composition'].map((type) => [type, new Set()]));
  for (const anchor of anchors) {
    if (!usedByType[anchor.type]) throw new Error(`Unknown visual card anchor type ${anchor.type}`);
    if (anchor.localIndex == null) continue;
    if (usedByType[anchor.type].has(anchor.localIndex)) {
      throw new Error(`Duplicate anchor slot ${anchor.type}:${anchor.localIndex}`);
    }
    usedByType[anchor.type].add(anchor.localIndex);
  }
  return anchors.map((anchor) => {
    if (anchor.localIndex != null) return anchor;
    for (let localIndex = 0; localIndex < SLICE_COUNT; localIndex += 1) {
      if (!usedByType[anchor.type].has(localIndex)) {
        usedByType[anchor.type].add(localIndex);
        return { ...anchor, localIndex };
      }
    }
    throw new Error(`No anchor slots remain for ${anchor.type}`);
  });
}

function sourceAnchors() {
  const anchors = [
    {
      type: 'scene',
      localIndex: 0,
      scene: 'warehouse',
      material: 'soot concrete',
      process: 'burn',
      composition: 'burning in',
      object: 'building',
      variant: 'damaged failure state',
      cardId: 'visual.scene.warehouse.soot-concrete.burn.burning-in.building.damaged-failure-state',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'warehouse fire burning through soot stained concrete walls with smoke layers heat damage masks and collapse risk vectors',
    },
    {
      type: 'scene',
      localIndex: 1,
      scene: 'algae pond',
      material: 'algae',
      process: 'photosynthesize',
      composition: 'growing on',
      object: 'pond',
      variant: 'wide establishing view',
      cardId: 'visual.scene.algae-pond.algae.photosynthesize.growing-on.pond.wide-establishing-view',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'green algae mat spreading across pond water with sunlight uptake bands oxygen bubbles and nutrient bloom gradients',
    },
    {
      type: 'scene',
      localIndex: 2,
      scene: 'warehouse',
      material: 'steel',
      process: 'control',
      composition: 'controlled by',
      object: 'robot',
      variant: 'system diagram',
      cardId: 'visual.scene.warehouse.steel.control.controlled-by.robot.system-diagram',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'warehouse robots controlling steel shelf routes through scanner nodes task queues and collision avoidance corridors',
    },
    {
      type: 'material',
      localIndex: 0,
      scene: 'battery stack',
      material: 'battery electrolyte',
      process: 'leak',
      composition: 'leaking from',
      object: 'battery',
      variant: 'macro inspection',
      cardId: 'visual.material.battery-stack.battery-electrolyte.leak.leaking-from.battery.macro-inspection',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'battery electrolyte leaking from cell seams with corrosion halos ion trails separator damage and safety sensor callouts',
    },
    {
      type: 'material',
      localIndex: 1,
      scene: 'wind farm',
      material: 'moss',
      process: 'grow',
      composition: 'growing on',
      object: 'turbine',
      variant: 'macro inspection',
      cardId: 'visual.material.wind-farm.moss.grow.growing-on.turbine.macro-inspection',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'moss colonizing turbine surfaces with damp fibers spores edge creep and blade maintenance inspection marks',
    },
    {
      type: 'process',
      localIndex: 0,
      scene: 'brass tube resonator',
      material: 'dust',
      process: 'resonate',
      composition: 'resonating inside',
      object: 'tube',
      variant: 'instrumented lab view',
      cardId: 'visual.process.brass-tube-resonator.dust.resonate.resonating-inside.tube.instrumented-lab-view',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'dust levitating inside a brass resonator tube along acoustic pressure nodes with microphones and frequency readouts',
    },
    {
      type: 'process',
      localIndex: 1,
      scene: 'orbital station',
      material: 'mirror',
      process: 'orbit',
      composition: 'orbiting around',
      object: 'mirror',
      variant: 'dynamic motion trace',
      cardId: 'visual.process.orbital-station.mirror.orbit.orbiting-around.mirror.dynamic-motion-trace',
      sourceGroup: 'diagnostic-anchor',
      visualDescription: 'mirror panels orbiting around station modules with reflection arcs attitude drift and dynamic orbital motion traces',
    },
    {
      type: 'scene',
      localIndex: 10,
      scene: 'subway station',
      material: 'mercury',
      process: 'signal',
      composition: 'through',
      object: 'rail switch',
      variant: 'dynamic motion trace',
      cardId: 'visual.scene.subway-station.mercury.signal.through.dynamic-motion-trace',
      visualDescription: 'silver liquid pulses running through rail tunnels with reflected platform lights',
    },
    {
      type: 'material',
      localIndex: 10,
      scene: 'coral reef',
      material: 'aerogel',
      process: 'diffuse',
      composition: 'inside',
      object: 'reef',
      variant: 'macro inspection',
      cardId: 'visual.material.coral-reef.aerogel.diffuse.inside.macro-inspection',
      visualDescription: 'pale porous aerogel reef cells with colored diffusion clouds and micro bubble halos',
    },
    {
      type: 'process',
      localIndex: 10,
      scene: 'black hole lens',
      material: 'glass',
      process: 'refract',
      composition: 'around',
      object: 'black hole',
      variant: 'wide establishing view',
      cardId: 'visual.process.black-hole-lens.glass.refract.around.wide-establishing-view',
      visualDescription: 'starfield warped through glassy lens shells around an accretion ring',
    },
    {
      type: 'composition',
      localIndex: 10,
      scene: 'hospital ward',
      material: 'blood',
      process: 'pump',
      composition: 'controlled by',
      object: 'pump',
      variant: 'system diagram',
      cardId: 'visual.composition.hospital-ward.blood.pump.controlled-by.system-diagram',
      visualDescription: 'vascular pump loop with monitors feedback arrows valves and pulse wave overlays',
    },
    {
      type: 'scene',
      localIndex: 11,
      scene: 'textile loom',
      material: 'carbon fiber',
      process: 'weave',
      composition: 'across',
      object: 'textile sheet',
      variant: 'cutaway section',
      cardId: 'visual.scene.textile-loom.carbon-fiber.weave.across.cutaway-section',
      visualDescription: 'black fiber strands crossing shuttle paths in a mechanical loom cutaway',
    },
    {
      type: 'material',
      localIndex: 11,
      scene: 'ice shelf',
      material: 'neon gas',
      process: 'discharge',
      composition: 'under',
      object: 'ice crack',
      variant: 'wide establishing view',
      cardId: 'visual.material.ice-shelf.neon-gas.discharge.under.wide-establishing-view',
      visualDescription: 'glowing neon arcs trapped beneath blue cracked ice',
    },
    {
      type: 'process',
      localIndex: 11,
      scene: 'beehive',
      material: 'wax',
      process: 'swarm',
      composition: 'around',
      object: 'beehive',
      variant: 'topographic map',
      cardId: 'visual.process.beehive.wax.swarm.around.topographic-map',
      visualDescription: 'honeycomb topology with agent density fields and flight vector rings',
    },
    {
      type: 'composition',
      localIndex: 11,
      scene: 'optical bench',
      material: 'lens glass',
      process: 'focus',
      composition: 'focusing onto',
      object: 'lens',
      variant: 'instrumented lab view',
      cardId: 'visual.composition.optical-bench.lens-glass.focus.onto.instrumented-lab-view',
      visualDescription: 'rails lens mounts beam cones caustic target and measurement ticks',
    },
    {
      type: 'scene',
      localIndex: 12,
      scene: 'data center',
      material: 'snow',
      process: 'cool',
      composition: 'through',
      object: 'server rack',
      variant: 'system diagram',
      cardId: 'visual.scene.data-center.snow.cool.through.system-diagram',
      visualDescription: 'cold airflow lanes through server racks with frost gradients and thermal readouts',
    },
    {
      type: 'material',
      localIndex: 12,
      scene: 'volcano',
      material: 'graphite foam',
      process: 'absorb',
      composition: 'over',
      object: 'graphite plate',
      variant: 'macro inspection',
      cardId: 'visual.material.volcano.graphite-foam.absorb.over.macro-inspection',
      visualDescription: 'porous carbon foam absorbing orange lava glow on black basalt slopes',
    },
    {
      type: 'process',
      localIndex: 12,
      scene: 'market floor',
      material: 'paper',
      process: 'queue',
      composition: 'queued at',
      object: 'queue',
      variant: 'dynamic motion trace',
      cardId: 'visual.process.market-floor.paper.queue.at.dynamic-motion-trace',
      visualDescription: 'paper order slips forming backlog lanes around service nodes and price flow trails',
    },
    {
      type: 'composition',
      localIndex: 12,
      scene: 'brass tube resonator',
      material: 'dust',
      process: 'levitate',
      composition: 'resonating inside',
      object: 'tube',
      variant: 'cutaway section',
      cardId: 'visual.composition.brass-tube-resonator.dust.levitate.inside.cutaway-section',
      visualDescription: 'suspended dust nodes in a brass acoustic tube with pressure bands',
    },
    {
      type: 'scene',
      localIndex: 13,
      scene: 'soil microbiome',
      material: 'mycelium',
      process: 'grow',
      composition: 'through',
      object: 'mushroom',
      variant: 'macro inspection',
      cardId: 'visual.scene.soil-microbiome.mycelium.grow.through.macro-inspection',
      visualDescription: 'branching fungal threads through soil pores with nutrient gradients',
    },
    {
      type: 'material',
      localIndex: 13,
      scene: 'rocket pad',
      material: 'molten salt',
      process: 'heat',
      composition: 'released from',
      object: 'vent',
      variant: 'wide establishing view',
      cardId: 'visual.material.rocket-pad.molten-salt.heat.released-from.wide-establishing-view',
      visualDescription: 'orange thermal salt vents spilling from launch infrastructure',
    },
    {
      type: 'process',
      localIndex: 13,
      scene: 'traffic control room',
      material: 'silicon',
      process: 'reroute',
      composition: 'between',
      object: 'traffic grid',
      variant: 'system diagram',
      cardId: 'visual.process.traffic-control-room.silicon.reroute.between.system-diagram',
      visualDescription: 'chip like city map with broken links alternate paths and alert queues',
    },
    {
      type: 'composition',
      localIndex: 13,
      scene: 'crystal cavern',
      material: 'quartz',
      process: 'crystallize',
      composition: 'crystallizing from',
      object: 'crystal tower',
      variant: 'macro inspection',
      cardId: 'visual.composition.crystal-cavern.quartz.crystallize.from.macro-inspection',
      visualDescription: 'nucleation seeds forming faceted growth planes in dark cave fluid',
    },
    {
      type: 'scene',
      localIndex: 14,
      scene: 'ant colony',
      material: 'acid',
      process: 'erode',
      composition: 'along',
      object: 'ant tunnel',
      variant: 'cutaway section',
      cardId: 'visual.scene.ant-colony.acid.erode.along.cutaway-section',
      visualDescription: 'underground tunnels with corrosive channels carving through soil chambers',
    },
    {
      type: 'material',
      localIndex: 14,
      scene: 'orbital station',
      material: 'mirror',
      process: 'reflect',
      composition: 'reflected between',
      object: 'mirror',
      variant: 'wide establishing view',
      cardId: 'visual.material.orbital-station.mirror.reflect.between.wide-establishing-view',
      visualDescription: 'solar mirror arrays bouncing light between station modules and orbit arcs',
    },
    {
      type: 'process',
      localIndex: 14,
      scene: 'kiln room',
      material: 'porcelain',
      process: 'sinter',
      composition: 'inside',
      object: 'ceramic shelf',
      variant: 'instrumented lab view',
      cardId: 'visual.process.kiln-room.porcelain.sinter.inside.instrumented-lab-view',
      visualDescription: 'ceramic shelves heat bands shrinkage marks and glaze crack formation',
    },
    {
      type: 'composition',
      localIndex: 14,
      scene: 'wave tank',
      material: 'oil',
      process: 'separate',
      composition: 'split into',
      object: 'fluid valve',
      variant: 'topographic map',
      cardId: 'visual.composition.wave-tank.oil.separate.into.topographic-map',
      visualDescription: 'wave flume map with oil water layers interface lines droplets and baffle fields',
    },
    ...parseCoverageLines(USER_COVERAGE_LINES, 'user-coverage-list-100'),
    ...parseCoverageLines(USER_COVERAGE_LINES_101_200, 'user-coverage-list-101-200'),
    ...parseCoverageLines(EXTREME_BOUNDARY_LINES, 'extreme-boundary-list-64'),
    ...parseCoverageLines(HANDWRITTEN_UNIVERSE_LINES, 'handwritten-universe-300'),
    ...parseCoverageLines(HANDWRITTEN_UNIVERSE_LINES_501_721, 'handwritten-universe-501-721'),
  ];
  return assignAnchorSlots(anchors);
}

function cardForAnchor(anchor) {
  return createCard(
      anchor.type,
      anchor.localIndex,
      entryForAnchor(anchor, 'scene', SCENE_DOMAINS),
      entryForAnchor(anchor, 'material', MATERIALS),
      entryForAnchor(anchor, 'process', PROCESSES),
      entryForAnchor(anchor, 'composition', COMPOSITIONS),
      anchor.variant,
      {
        object: objectForAnchor(anchor),
        cardId: anchor.cardId,
        sourceExampleId: anchor.sourceExampleId || anchor.cardId,
        sourceGroup: anchor.sourceGroup || (anchor.cardId ? 'curated-anchor' : undefined),
        visualDescription: anchor.visualDescription,
      }
    );
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildCards() {
  return sourceAnchors().map(cardForAnchor);
}

function countBy(cards, selector) {
  return cards.reduce((counts, card) => {
    const key = selector(card);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function uniqueCount(cards, selector) {
  return new Set(cards.map(selector).filter(Boolean)).size;
}

function sourceExampleCards(cards) {
  return cards.filter((card) => card.sourceExampleId);
}

function coverageForCards(cards) {
  const sourceExamples = sourceExampleCards(cards).length;
  return {
    scenes: uniqueCount(cards, (card) => card.facets.scene),
    materials: uniqueCount(cards, (card) => card.facets.material),
    processes: uniqueCount(cards, (card) => card.facets.process),
    compositions: uniqueCount(cards, (card) => card.facets.composition),
    objects: uniqueCount(cards, (card) => card.facets.object),
    variants: uniqueCount(cards, (card) => card.facets.variant),
    palettes: uniqueCount(cards, (card) => card.renderHints.paletteFamily),
    proceduralRecipeSignatures: uniqueCount(cards, (card) => card.renderHints.proceduralRecipe.signature),
    sourceExamples,
    generatedScaffoldCards: cards.length - sourceExamples,
  };
}

function validateCards(cards) {
  const ids = new Set();
  const signatures = new Set();
  for (const card of cards) {
    if (!card.sourceExampleId) throw new Error(`Visual card ${card.cardId} is not backed by a source example`);
    if (ids.has(card.cardId)) throw new Error(`Duplicate visual card id ${card.cardId}`);
    ids.add(card.cardId);
    const signature = card.renderHints
      && card.renderHints.proceduralRecipe
      && card.renderHints.proceduralRecipe.signature;
    if (!signature) throw new Error(`Visual card ${card.cardId} is missing a procedural recipe signature`);
    if (signatures.has(signature)) throw new Error(`Duplicate visual recipe signature ${signature}`);
    signatures.add(signature);
    if (!card.candidateText || card.candidateText.split(/\s+/).length < 40) {
      throw new Error(`Visual card ${card.cardId} has weak candidate text`);
    }
    if (!card.renderHints || !card.renderHints.layers || card.renderHints.layers.length < 5) {
      throw new Error(`Visual card ${card.cardId} has weak render hints`);
    }
  }
}

async function main() {
  const cards = buildCards();
  validateCards(cards);
  const sourceCards = sourceExampleCards(cards);
  const coverage = coverageForCards(cards);
  const index = {
    schema: SCHEMA,
    id: 'simulatte-visual-card-index-v1',
    documentCount: cards.length,
    generator: {
      schema: 'simulatte.visualCardGenerator.v1',
      script: 'tools/build-visual-card-index.mjs',
      strategy: 'source-authored-natural-language-visual-card-index',
      sourcePolicy: {
        exportedDocuments: 'literal-source-examples-only',
        generatedScaffoldCards: 0,
        maxSlotsPerType: SLICE_COUNT,
      },
    },
    counts: {
      byType: countBy(cards, (card) => card.type),
      byDomain: countBy(cards, (card) => card.facets.domain),
      byMaterialFamily: countBy(cards, (card) => card.facets.materialFamily),
      byProcessFamily: countBy(cards, (card) => card.facets.processFamily),
      byCompositionFamily: countBy(cards, (card) => card.facets.compositionFamily),
      byGeometry: countBy(cards, (card) => card.renderHints.geometry),
      byProcessOverlay: countBy(cards, (card) => card.renderHints.processOverlay),
      byCompositionLayout: countBy(cards, (card) => card.renderHints.compositionLayout),
      byVisualGrammar: countBy(cards, (card) => card.renderHints.proceduralRecipe.visualGrammar),
      byTextureBasis: countBy(cards, (card) => card.renderHints.proceduralRecipe.textureBasis),
      byLightingModel: countBy(cards, (card) => card.renderHints.proceduralRecipe.lightingModel),
      byMotionCue: countBy(cards, (card) => card.renderHints.proceduralRecipe.motionCue),
      bySourceGroup: countBy(sourceCards, (card) => card.sourceGroup || 'ungrouped-source'),
    },
    curatedSourceIds: sourceCards.map((card) => card.sourceExampleId),
    documents: cards,
  };
  const manifest = {
    schema: MANIFEST_SCHEMA,
    id: 'simulatte-visual-cards-v1',
    indexes: {
      visualCards: {
        kind: 'visual-card-index',
        artifact: './visual-card-index-v1.json',
        documentSchema: SCHEMA,
        documentCount: cards.length,
      },
    },
    coverage,
    generator: index.generator,
  };
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    schema: 'simulatte.visualCardBuildReport.v1',
    ok: true,
    indexPath: path.relative(ROOT, INDEX_PATH),
    manifestPath: path.relative(ROOT, MANIFEST_PATH),
    documentCount: cards.length,
    coverage: manifest.coverage,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
