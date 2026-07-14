(function attachSimulatteCausalPhysicsGraph(root, factory) {
  const schema = typeof module === 'object' && module.exports
    ? require('./simulatte-intent-brief-schema.js')
    : root.SimulatteIntentBriefSchema;
  const api = factory(schema || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteCausalPhysicsGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCausalPhysicsGraphApi(schema = {}) {
  const { slugify = defaultSlugify, uniqueStrings = unique } = schema;

  const CAUSAL_RELATION_RULES = Object.freeze([
    relation('causal.lava-heats-rain', ['lava', 'magma', 'volcano'], ['rain', 'water', 'ice', 'snow'], 'heatTransfer', 'heat_transfer', 'hot molten rock transfers heat into water or ice', connectedPathPolicy(['near'], 3)),
    relation('causal.lava-vaporizes-rain', ['lava', 'magma'], ['rain', 'droplet', 'water'], 'phaseChange', 'phase_transition', 'rain droplets vaporize when crossing the hot lava boundary'),
    relation('causal.rain-cools-lava-crust', ['rain', 'water', 'storm'], ['lava', 'magma', 'molten'], 'heatTransfer', 'heat_transfer', 'cool precipitation extracts heat and grows a crust boundary'),
    relation('causal.heat-drives-plume', ['heat', 'fire', 'lava', 'combustion'], ['smoke', 'steam', 'plume', 'air'], 'fluidForce', 'advection', 'buoyancy lifts heated gas and particles'),
    relation('causal.steam-buoyancy-plume', ['steam', 'hot vapor', 'boiling', 'thermal plume'], ['plume', 'ash', 'cloud', 'air'], 'fluidForce', 'advection', 'heated vapor becomes buoyant and lifts suspended droplets or ash into a visible plume'),
    relation('causal.combustion-heats-smoke', ['combustion', 'fire', 'flame', 'burning'], ['smoke', 'exhaust', 'air', 'soot'], 'heatTransfer', 'heat_transfer', 'reaction heat warms exhaust products and drives soot-rich smoke upward'),
    relation('causal.wind-advects-smoke', ['wind', 'storm', 'air'], ['smoke', 'steam', 'ash', 'cloud'], 'fluidForce', 'advection', 'wind advects suspended particles and vapor'),
    relation('causal.pressure-drives-flow', ['pressure', 'pump', 'valve'], ['water', 'brine', 'air', 'pipe'], 'fluidForce', 'pressure_flow_lite', 'pressure gradient drives flow through a boundary'),
    relation('causal.gravity-drives-sediment', ['gravity', 'slope', 'hill'], ['sand', 'sediment', 'soil', 'rock'], 'fluidForce', 'pressure_flow_lite', 'gravity pulls grains through terrain channels'),
    relation('causal.river-erodes-sediment', ['rain', 'river', 'water', 'runoff', 'storm surge', 'surge'], ['soil', 'sand', 'terrain', 'delta', 'basalt', 'sediment', 'shoreline', 'coast'], 'erosion', 'pressure_flow_lite', 'water flow removes and transports surface material'),
    relation('causal.magnet-deflects-ferrofluid', ['magnet', 'magnetic', 'electric', 'field', 'coil'], ['ferrofluid', 'ion', 'electron', 'plasma', 'charge'], 'fieldForce', 'wave_field', 'field gradients deflect charged or magnetized matter'),
    relation('causal.magnetic-slider-drives-machine-field', ['moving magnetic slider', 'magnetic slider'], ['machine', 'wheel', 'rotor'], 'fieldForce', 'wave_field', 'the moving magnetic slider changes the machine field that couples into the rotor', evidenceQualifiedPolicy(['moving', 'powered'], { supersedesProcessIds: ['spatial_constraint'] })),
    relation('causal.lens-refracts-beam', ['light', 'laser', 'beam', 'lamp', 'sunlight'], ['lens', 'prism', 'water'], 'refraction', 'wave_field', 'optical field bends through refractive media', typedCooccurrencePolicy()),
    relation('causal.photon-cones-propagate-to-phototubes', ['photon cones', 'photon cone'], ['phototube array', 'phototube'], 'refraction', 'wave_field', 'photon paths propagate through the detector volume to the phototube array', typedCooccurrencePolicy()),
    relation('causal.thin-film-forms-interference', ['thin film', 'soap film', 'film thickness'], ['iridescent interference', 'interference', 'iridescence'], 'refraction', 'wave_field', 'path length through a thin film shifts reflected phase and produces iridescent interference', typedCooccurrencePolicy()),
    relation('causal.particle-track-produces-detector-readout', ['muon tracks', 'particle tracks'], ['detector slice', 'particle detector', 'detector'], 'measurement', 'derive_readout', 'charged particle tracks crossing detector layers deposit energy and produce a detector signal', directSpatialPolicy('through')),
    relation('causal.energy-deposition-produces-calorimeter-pulse', ['detector slice', 'particle detector', 'energy deposition'], ['calorimeter pulses', 'calorimeter pulse'], 'measurement', 'derive_readout', 'energy deposited in detector material becomes a bounded calorimeter pulse', directSpatialPolicy('with')),
    relation('causal.fermentation-grows-gas-pockets', ['sourdough fermentation'], ['gas bubbles'], 'growthCoupling', 'growth_decay', 'microbial fermentation converts dough nutrients into expanding gas pockets', typedCooccurrencePolicy()),
    relation('causal.acoustic-source-drives-standing-pressure-wave', ['acoustic levitator', 'levitator', 'brass tube'], ['standing pressure waves'], 'waveCoupling', 'wave_field', 'the acoustic source drives a standing pressure field inside the resonant tube', typedCooccurrencePolicy()),
    relation('causal.laser-heats-metal', ['laser', 'beam', 'hot spot'], ['metal', 'copper', 'plate', 'steel'], 'heatTransfer', 'heat_transfer', 'focused optical power raises local metal temperature'),
    relation('causal.impact-fractures-glass', ['projectile', 'hammer', 'impact', 'collision', 'crash'], ['glass', 'wall', 'rock', 'metal', 'ice'], 'collision', 'rigid_collision', 'impulse transfers stress and damage'),
    relation('causal.speaker-drives-air-wave', ['speaker', 'piano', 'oscillator', 'vibration'], ['air', 'water', 'bridge', 'membrane'], 'waveCoupling', 'wave_field', 'oscillation launches a pressure or displacement wave'),
    relation('causal.nutrients-grow-algae', ['nutrient', 'light', 'sun', 'water'], ['plant', 'algae', 'biofilm', 'mycelium', 'cell'], 'growthCoupling', 'growth_decay', 'resource availability changes biological density'),
    relation('causal.chemical-diffuses-through-gel', ['chemical', 'salt', 'oxygen', 'metabolite'], ['water', 'gel', 'tissue', 'soil'], 'diffusion', 'diffusion', 'concentration gradient spreads a dissolved species'),
    relation('causal.arrivals-create-queue', ['demand', 'arrival', 'arrivals', 'packet', 'traffic'], ['queue', 'server', 'intersection', 'platform'], 'networkFlow', 'network_flow', 'arrivals increase backlog and delay', evidenceQualifiedPolicy(['demand', 'arrival', 'arrivals', 'packet'])),
    relation('causal.gravity-curves-orbit', ['planet', 'planetary', 'moon', 'star', 'gravity'], ['satellite', 'asteroid', 'ring', 'rings', 'comet'], 'orbitalGravity', 'oscillator', 'central gravity bends trajectory into orbit or resonance'),
    relation('causal.cooling-freezes-water', ['cooling', 'cold', 'freezer'], ['water', 'brine', 'droplet'], 'phaseChange', 'phase_transition', 'temperature drop moves liquid toward solid fraction'),
    relation('causal.heating-melts-ice', ['heat', 'laser', 'fire', 'thermal', 'warm air'], ['ice', 'snow', 'frost', 'metal', 'wax', 'plastic', 'rock'], 'phaseChange', 'phase_transition', 'temperature rise moves solid toward liquid fraction'),
    relation('causal.turbine-extracts-flow', ['water', 'wind', 'steam', 'flow'], ['turbine', 'rotor', 'wheel', 'blade'], 'torqueTransfer', 'rotational_torque', 'flow momentum becomes rotor torque'),
    relation('causal.controller-adjusts-valve', ['controller', 'sensor', 'feedback'], ['motor', 'valve', 'robot', 'pump', 'fan', 'cooling', 'aisle'], 'controlLoop', 'network_flow', 'measurement updates actuator state'),
    relation('causal.acid-rain-corrodes-metal', ['acid', 'acid rain', 'corrosive'], ['metal', 'steel', 'copper', 'roof'], 'diffusion', 'reaction_diffusion', 'acidic droplets diffuse across a metal surface and advance corrosion'),
    relation('causal.battery-heat-runaway', ['battery', 'cell', 'electrolyte'], ['heat', 'thermal', 'runaway', 'neighbor cell'], 'heatTransfer', 'heat_transfer', 'excess heat propagates through a cell stack and raises runaway risk'),
    relation('causal.supersaturation-crystallizes-seed', ['supersaturated', 'solution', 'solute'], ['seed', 'crystal', 'nucleation'], 'phaseChange', 'phase_transition', 'solute attaches to seed facets and grows a crystal boundary'),
    relation('causal.hydrophobic-collapse-folds-protein', ['hydrophobic', 'solvent', 'water'], ['protein', 'chain', 'fold'], 'growthCoupling', 'growth_decay', 'coarse molecular chain relaxes toward a lower exposure folded state'),
    relation('causal.synapse-triggers-neuron', ['synapse', 'neurotransmitter', 'signal'], ['neuron', 'axon', 'membrane'], 'networkFlow', 'network_flow', 'synaptic input changes membrane state and launches a signal pulse'),
    relation('causal.pressure-drives-blood-flow', ['pressure', 'heart', 'pulse'], ['blood', 'artery', 'vessel'], 'fluidForce', 'pressure_flow_lite', 'pressure gradient drives pulsing fluid through a compliant vessel'),
    relation('causal.warming-calves-glacier', ['warming', 'heat', 'ocean'], ['glacier', 'ice shelf', 'ice cliff'], 'phaseChange', 'phase_transition', 'heat weakens ice boundary and promotes calving blocks', evidenceQualifiedPolicy(['warming', 'heat', 'warms'])),
    relation('causal.wind-shear-forms-vortex', ['wind shear', 'shear', 'storm'], ['vortex', 'tornado', 'funnel'], 'fluidForce', 'advection', 'opposed air streams roll into a concentrated rotating column'),
    relation('causal.wind-shear-advects-thunderstorm', ['wind shear'], ['thunderstorm'], 'fluidForce', 'advection', 'wind shear transports and tilts the thunderstorm flow field', evidenceQualifiedPolicy(['grows', 'updraft', 'tilts'])),
    relation('causal.wind-shear-advects-supercell', ['wind shear'], ['supercell'], 'fluidForce', 'advection', 'wind shear transports and tilts the supercell flow field', evidenceQualifiedPolicy(['grows', 'updraft', 'tilts'])),
    relation('causal.storm-updraft-grows-hail', ['supercell', 'thunderstorm', 'updraft', 'storm'], ['hail', 'ice', 'graupel'], 'phaseChange', 'phase_transition', 'storm updraft cycles droplets through freezing layers and grows hail cores', evidenceQualifiedPolicy(['grows', 'updraft', 'freezing'])),
    relation('causal.solar-wind-drives-aurora', ['solar wind', 'charged particles', 'magnetosphere'], ['aurora', 'upper atmosphere', 'ionosphere'], 'fieldForce', 'wave_field', 'charged particles follow magnetic field lines and excite atmospheric emission'),
    relation('causal.current-heats-chip', ['current', 'power', 'compute', 'server', 'rack'], ['chip', 'silicon', 'trace', 'wafer', 'heat', 'cooling', 'aisle'], 'heatTransfer', 'heat_transfer', 'electrical power dissipates as heat in semiconductor traces'),
    relation('causal.data-center-cooling-feedback', ['data center', 'controller', 'sensor', 'feedback', 'thermal policy'], ['server', 'rack', 'fan', 'cooling', 'aisle'], 'controlLoop', 'network_flow', 'rack temperature sensors adjust fans and cooling aisles'),
    relation('causal.zoning-pressure-constrains-parcels', ['zoning', 'constraint', 'constraints', 'pressure', 'market'], ['housing', 'parcel', 'parcels', 'household', 'agents'], 'networkFlow', 'network_flow', 'zoning constraints and demand pressure redistribute household agents across parcels'),
    relation('causal.volcanic-heat-feeds-lava-river', ['volcano', 'lava', 'melt', 'melts', 'molten', 'crystal', 'tower', 'towers'], ['lava', 'river', 'flow'], 'phaseChange', 'phase_transition', 'heated volcanic material and melting boundaries feed a flowing lava river'),
    relation('causal.inverter-stabilizes-transformer-load', ['microgrid', 'battery', 'inverter', 'frequency control'], ['transformer', 'grid', 'load', 'overload'], 'controlLoop', 'network_flow', 'inverter feedback shifts battery power to stabilize transformer load and grid frequency'),
    relation('causal.query-loads-index-shards', ['query', 'request', 'search'], ['index', 'shard', 'database'], 'networkFlow', 'network_flow', 'requests route through index shards and increase load'),
    relation('causal.delay-amplifies-supply-chain', ['delay', 'demand', 'forecast'], ['inventory', 'warehouse', 'supply'], 'networkFlow', 'network_flow', 'delayed feedback amplifies order and inventory oscillations'),
    relation('causal.narrow-exit-jams-crowd', ['crowd', 'agent', 'people'], ['exit', 'door', 'bottleneck'], 'networkFlow', 'network_flow', 'agent arrivals compress at a narrow service boundary'),
    relation('causal.wind-excites-bridge', ['wind', 'gust', 'vortex'], ['bridge', 'cable', 'deck'], 'waveCoupling', 'wave_field', 'periodic aerodynamic load excites structural modes', evidenceQualifiedPolicy(['resonance', 'vortex', 'shedding'])),
    relation('causal.wind-drives-upwelling', ['wind', 'surface stress'], ['upwelling', 'nutrient', 'deep water'], 'fluidForce', 'advection', 'wind stress displaces surface water and pulls deep water upward'),
    relation('causal.heat-bleaches-coral', ['heat', 'warming', 'thermal stress'], ['coral', 'reef', 'algae'], 'growthCoupling', 'growth_decay', 'thermal stress reduces symbiotic algae density in coral tissue'),
    relation('causal.root-network-stabilizes-soil', ['mangrove', 'root', 'roots', 'root network'], ['soil', 'shoreline', 'sediment', 'slope', 'bank'], 'growthCoupling', 'growth_decay', 'biological roots increase soil cohesion and resist erosion'),
    relation('causal.magnetic-field-confines-plasma', ['magnetic', 'field', 'coil'], ['plasma', 'tokamak', 'ionized gas'], 'fieldForce', 'wave_field', 'magnetic flux constrains charged plasma motion'),
    relation('causal.robot-applies-contact-force', ['robot'], ['tool', 'surface', 'object', 'parcel', 'parcels', 'sample holder'], 'collision', 'rigid_collision', 'actuated rigid link transfers contact force into a target surface', evidenceQualifiedPolicy(['contact force', 'contacts', 'twists'], { operatorBundle: ['rigid_collision'] })),
    relation('causal.rider-carves-bowl', ['skateboard rider'], ['bowl'], 'torqueTransfer', 'rotational_torque', 'the rider follows the curved bowl under centripetal acceleration and rolling friction', evidenceQualifiedPolicy(['carves', 'centripetal', 'friction loss'], { supersedesProcessIds: ['flow'] })),
    relation('causal.wind-loads-fabric', ['wind', 'airflow', 'gust'], ['fabric', 'sail', 'canopy', 'membrane'], 'fluidForce', 'advection', 'air pressure deforms flexible fabric under anchored constraints'),
    relation('causal.pressure-splits-droplet', ['pressure', 'pump', 'channel'], ['droplet', 'microfluidic', 'junction'], 'fluidForce', 'pressure_flow_lite', 'pressure-driven channel flow splits a droplet at a junction'),
    relation('causal.wildfire-wind-spreads-embers', ['wildfire', 'wind', 'gust', 'dry fuel'], ['ember', 'fireline', 'spot fire', 'forest'], 'fluidForce', 'advection', 'wind lofts burning embers ahead of the fireline and ignites new fuel patches'),
    relation('causal.oxygen-feeds-combustion', ['oxygen', 'air', 'ventilation'], ['flame', 'fire', 'combustion'], 'diffusion', 'reaction_diffusion', 'oxygen diffuses into the reaction zone and increases flame intensity'),
    relation('causal.condensation-grows-cloud', ['cooling', 'humid air', 'dew point'], ['cloud', 'fog', 'droplet'], 'phaseChange', 'phase_transition', 'cooling humid air nucleates droplets and grows a visible cloud volume'),
    relation('causal.earthquake-shakes-building', ['earthquake', 'fault', 'seismic wave'], ['building', 'tower', 'bridge', 'foundation'], 'waveCoupling', 'wave_field', 'seismic waves couple ground motion into structural oscillation and stress'),
    relation('causal.snow-load-bends-roof', ['snow', 'ice load', 'accumulation'], ['roof', 'beam', 'truss'], 'collision', 'rigid_collision', 'accumulated snow applies distributed load and bends structural members'),
    relation('causal.rocket-exhaust-accelerates-vehicle', ['rocket', 'exhaust', 'nozzle', 'plume'], ['vehicle', 'capsule', 'payload'], 'fluidForce', 'pressure_flow_lite', 'high-speed exhaust transfers momentum and accelerates the vehicle body'),
    relation('causal.parachute-drag-slows-capsule', ['parachute', 'air drag', 'canopy'], ['capsule', 'payload', 'lander'], 'fluidForce', 'advection', 'inflated canopy increases drag and reduces descent velocity'),
    relation('causal.electric-field-accelerates-ions', ['electric field', 'electrode', 'voltage'], ['ion', 'electron', 'plasma', 'charged particle'], 'fieldForce', 'wave_field', 'electric field gradients accelerate charged particles along field direction'),
    relation('causal.voltage-drives-current-through-circuit', ['voltage', 'battery', 'potential'], ['current', 'circuit', 'load', 'wire'], 'networkFlow', 'network_flow', 'potential difference drives charge flow through circuit paths'),
    relation('causal.evaporation-cools-surface', ['evaporation', 'dry air', 'wind'], ['surface', 'skin', 'water film', 'pond'], 'heatTransfer', 'heat_transfer', 'phase change removes latent heat from the remaining surface'),
    relation('causal.groundwater-dissolves-limestone', ['groundwater', 'acidic water', 'carbonic acid'], ['limestone', 'karst', 'cave', 'rock'], 'diffusion', 'reaction_diffusion', 'weak acid diffuses through cracks and dissolves carbonate rock'),
    relation('causal.permafrost-thaw-releases-methane', ['warming', 'heat', 'thaw'], ['permafrost', 'methane', 'soil gas'], 'phaseChange', 'phase_transition', 'thawing frozen soil opens pore space and releases trapped methane'),
    relation('causal.infection-contact-spreads-virus', ['infection', 'contact', 'infected host'], ['virus', 'host', 'population'], 'networkFlow', 'network_flow', 'contacts transfer infectious particles through a population network'),
    relation('causal.antibiotic-inhibits-bacteria', ['antibiotic', 'drug', 'dose'], ['bacteria', 'biofilm', 'cell wall'], 'growthCoupling', 'growth_decay', 'drug concentration suppresses bacterial growth and shrinks viable biomass'),
    relation('causal.enzyme-catalyzes-reaction', ['enzyme', 'catalyst', 'active site'], ['substrate', 'reaction', 'product'], 'diffusion', 'reaction_diffusion', 'enzyme binding lowers the reaction barrier and accelerates product formation'),
    relation('causal.traffic-signal-meters-intersection', ['traffic signal', 'controller', 'green light'], ['cars', 'intersection', 'queue'], 'controlLoop', 'network_flow', 'signal timing gates vehicle flow and changes queue density'),
    relation('causal.hydraulic-pressure-clamps-brake', ['hydraulic pressure', 'brake fluid', 'pedal'], ['brake pad', 'rotor', 'wheel'], 'fluidForce', 'pressure_flow_lite', 'hydraulic pressure transfers pedal force into clamp force on a rotating rotor'),
    relation('causal.wave-interference-forms-standing-pattern', ['oscillator', 'wave', 'reflection'], ['standing wave', 'membrane', 'water', 'sound'], 'waveCoupling', 'wave_field', 'opposed waves interfere and create stable nodes and antinodes'),
    relation('causal.tidal-gravity-drives-coastal-flow', ['moon', 'tide', 'gravity'], ['ocean', 'coast', 'estuary', 'current'], 'orbitalGravity', 'oscillator', 'tidal gravity raises water level gradients and drives coastal currents'),
    relation('causal.pollinator-transfers-pollen', ['bee', 'pollinator', 'insect'], ['pollen', 'flower', 'seed', 'plant'], 'growthCoupling', 'growth_decay', 'pollinator visits move pollen between flowers and enable seed growth'),
    relation('causal.black-hole-tides-stretch-star', ['black hole', 'tidal force', 'gravity well'], ['star', 'gas stream', 'accretion disk'], 'orbitalGravity', 'oscillator', 'extreme gravity gradients stretch stellar material into an accretion stream'),
    relation('causal.supernova-shock-compresses-cloud', ['supernova', 'shock wave', 'blast'], ['molecular cloud', 'gas cloud', 'dust', 'star formation'], 'waveCoupling', 'wave_field', 'expanding shock front compresses interstellar gas into denser star-forming knots'),
    relation('causal.radiation-pressure-drives-solar-sail', ['sunlight', 'radiation pressure', 'photon'], ['solar sail', 'spacecraft', 'sail'], 'fieldForce', 'wave_field', 'photon momentum pushes reflective sail material and changes spacecraft trajectory'),
    relation('causal.static-charge-clings-dust', ['static charge', 'triboelectric', 'electric field'], ['dust', 'powder', 'surface', 'fabric'], 'fieldForce', 'wave_field', 'charge separation attracts fine particles onto nearby surfaces'),
    relation('causal.freeze-thaw-cracks-rock', ['freeze', 'thaw', 'ice expansion'], ['rock', 'crack', 'cliff', 'pavement'], 'phaseChange', 'phase_transition', 'water expands during freezing and drives cracks through brittle material'),
    relation('causal.landslide-dams-river', ['landslide', 'slope failure', 'debris flow'], ['river', 'valley', 'water', 'lake'], 'fluidForce', 'pressure_flow_lite', 'failed slope debris blocks river flow and backs water into a temporary lake'),
    relation('causal.vegetation-shades-stream-cooling', ['vegetation', 'tree canopy', 'shade'], ['stream', 'water temperature', 'fish habitat'], 'heatTransfer', 'heat_transfer', 'canopy shade reduces solar heating and lowers stream temperature'),
    relation('causal.irrigation-salinizes-soil', ['irrigation', 'evaporation', 'salty water'], ['soil', 'salt', 'crop root'], 'diffusion', 'diffusion', 'evaporation leaves dissolved salts behind and concentrates them near crop roots'),
    relation('causal.fertilizer-runoff-eutrophies-lake', ['fertilizer', 'runoff', 'nutrient'], ['lake', 'algae bloom', 'oxygen'], 'growthCoupling', 'growth_decay', 'nutrient runoff accelerates algae growth and depletes dissolved oxygen'),
    relation('causal.predator-controls-prey-population', ['predator', 'hunting', 'consumption'], ['prey', 'population', 'herd'], 'growthCoupling', 'growth_decay', 'predation reduces prey growth rate and creates population oscillation'),
    relation('causal.mycorrhiza-transfers-nutrients', ['mycorrhiza', 'fungal network', 'root'], ['plant', 'nutrient', 'carbon'], 'networkFlow', 'network_flow', 'fungal root networks exchange mineral nutrients and carbon between plants'),
    relation('causal.insulin-lowers-blood-glucose', ['insulin', 'pancreas', 'dose'], ['glucose', 'blood sugar', 'cell uptake'], 'controlLoop', 'network_flow', 'insulin signal increases cellular glucose uptake and lowers blood glucose concentration'),
    relation('causal.ventilator-pressure-inflates-lung', ['ventilator', 'positive pressure', 'airflow'], ['lung', 'alveoli', 'chest'], 'fluidForce', 'pressure_flow_lite', 'positive airway pressure inflates compliant lung tissue and expands alveoli'),
    relation('causal.ultrasound-reflects-tissue-boundary', ['ultrasound', 'acoustic pulse', 'probe'], ['tissue boundary', 'organ', 'echo'], 'waveCoupling', 'wave_field', 'acoustic impedance changes reflect ultrasound pulses back to the probe'),
    relation('causal.radiation-damages-dna', ['radiation', 'ionizing particle', 'uv light'], ['dna', 'cell', 'mutation'], 'diffusion', 'reaction_diffusion', 'high-energy radiation breaks molecular bonds and increases DNA damage probability'),
    relation('causal.heat-treatment-hardens-steel', ['heat treatment', 'furnace', 'temperature'], ['steel', 'grain', 'hardness'], 'heatTransfer', 'heat_transfer', 'controlled heating changes steel grain structure and hardness'),
    relation('causal.quenching-locks-martensite', ['quench', 'oil bath', 'rapid cooling'], ['steel', 'martensite', 'hardness'], 'phaseChange', 'phase_transition', 'rapid cooling locks a hard martensitic phase into steel'),
    relation('causal.vibration-compacts-granular-bed', ['vibration', 'shaker', 'oscillation'], ['sand', 'powder', 'granular bed'], 'waveCoupling', 'wave_field', 'vibration rearranges grains and increases packing density'),
    relation('causal.electrolysis-splits-water', ['electrolysis', 'voltage', 'electrode'], ['water', 'hydrogen', 'oxygen'], 'diffusion', 'reaction_diffusion', 'electric current drives chemical reactions that split water into gases'),
    relation('causal.osmosis-swells-cell', ['osmosis', 'salt gradient', 'concentration'], ['cell', 'membrane', 'water'], 'diffusion', 'diffusion', 'water crosses a semipermeable membrane toward higher solute concentration and swells the cell'),
    relation('causal.solar-panel-converts-light-current', ['sunlight', 'photon', 'solar panel'], ['current', 'electron', 'circuit'], 'fieldForce', 'wave_field', 'photons excite charge carriers and create electrical current in a photovoltaic circuit'),
    relation('causal.transformer-induction-steps-voltage', ['alternating current', 'coil', 'magnetic flux'], ['voltage', 'secondary coil', 'transformer'], 'fieldForce', 'wave_field', 'changing magnetic flux induces voltage in a secondary winding'),
    relation('causal.market-shock-propagates-liquidity', ['market shock', 'sell order', 'panic'], ['liquidity', 'price', 'order book'], 'networkFlow', 'network_flow', 'large orders consume liquidity and propagate price movement through the order book'),
    relation('causal.price-signal-shifts-demand', ['price', 'subsidy', 'tax'], ['demand', 'consumer', 'market'], 'networkFlow', 'network_flow', 'price changes shift agent demand and redistribute market flow'),
    relation('causal.conveyor-speed-creates-bottleneck', ['conveyor', 'feed rate', 'line speed'], ['station', 'bottleneck', 'queue'], 'networkFlow', 'network_flow', 'upstream line speed exceeding station capacity creates a manufacturing queue'),
    relation('causal.robot-vision-corrects-grasp', ['camera', 'vision', 'pose estimate'], ['robot', 'gripper', 'object'], 'controlLoop', 'network_flow', 'vision feedback corrects gripper pose before contact with the object'),
    relation('causal.wind-turbine-yaw-aligns-rotor', ['wind direction', 'yaw controller', 'sensor'], ['wind turbine', 'rotor', 'nacelle'], 'controlLoop', 'network_flow', 'yaw feedback rotates the nacelle to align the rotor with incoming wind'),
    relation('causal.levee-constrains-floodwater', ['levee', 'embankment', 'barrier'], ['floodwater', 'river', 'city'], 'fluidForce', 'pressure_flow_lite', 'raised barriers constrain floodwater path and redirect hydraulic pressure'),
    relation('causal.chlorine-disinfects-water', ['chlorine', 'disinfectant', 'dose'], ['water', 'bacteria', 'pathogen'], 'diffusion', 'reaction_diffusion', 'chlorine diffuses through water and inactivates pathogens'),
    relation('causal.sound-vibration-sorts-particles', ['sound', 'acoustic wave', 'vibration'], ['particle', 'powder', 'grain'], 'waveCoupling', 'wave_field', 'acoustic pressure nodes separate particles by size or density'),
    relation('causal.capillary-action-wicks-water', ['capillary', 'wick', 'porous fiber'], ['water', 'liquid', 'fabric', 'soil'], 'fluidForce', 'pressure_flow_lite', 'surface tension and narrow pores pull liquid upward against gravity'),
    relation('causal.surface-tension-rounds-droplet', ['surface tension', 'interface', 'meniscus'], ['droplet', 'bubble', 'liquid bead'], 'fluidForce', 'pressure_flow_lite', 'surface energy pulls liquid boundaries toward rounded shapes'),
    relation('causal.thermal-expansion-buckles-rail', ['heat', 'sun', 'thermal expansion'], ['rail', 'bridge deck', 'pipe'], 'heatTransfer', 'heat_transfer', 'temperature rise expands constrained material and creates buckling stress'),
    relation('causal.cyclic-load-fatigues-crack', ['cyclic load', 'vibration', 'repeated stress'], ['crack', 'metal', 'beam', 'shaft'], 'waveCoupling', 'wave_field', 'repeated stress cycles grow microscopic cracks through a material'),
    relation('causal.gear-torque-drives-wheel', ['gear', 'motor', 'torque'], ['wheel', 'axle', 'rotor'], 'torqueTransfer', 'rotational_torque', 'gear contact transfers motor torque into wheel rotation'),
    relation('causal.flywheel-smooths-power-pulse', ['flywheel', 'inertia', 'rotor'], ['power pulse', 'shaft speed', 'machine'], 'torqueTransfer', 'rotational_torque', 'rotational inertia stores energy and smooths torque ripple'),
    relation('causal.co2-traps-infrared-heat', ['carbon dioxide', 'greenhouse gas', 'infrared'], ['atmosphere', 'surface heat', 'climate'], 'heatTransfer', 'heat_transfer', 'greenhouse gases absorb outgoing infrared radiation and warm the lower atmosphere'),
    relation('causal.ocean-acidification-dissolves-shell', ['carbon dioxide', 'acidification', 'low ph'], ['shell', 'coral skeleton', 'carbonate'], 'diffusion', 'reaction_diffusion', 'acidified seawater shifts carbonate chemistry and dissolves shell material'),
    relation('causal.soil-moisture-triggers-slope-failure', ['soil moisture', 'rain infiltration', 'pore pressure'], ['slope', 'landslide', 'soil mass'], 'fluidForce', 'pressure_flow_lite', 'water raises pore pressure and reduces slope strength'),
    relation('causal.drought-stresses-crop-growth', ['drought', 'dry soil', 'water deficit'], ['crop', 'leaf', 'yield'], 'growthCoupling', 'growth_decay', 'water deficit closes stomata and reduces plant growth'),
    relation('causal.beaver-dam-slows-stream', ['beaver dam', 'woody debris', 'barrier'], ['stream', 'pond', 'sediment'], 'fluidForce', 'pressure_flow_lite', 'dam structures slow stream velocity and trap sediment upstream'),
    relation('causal.wetland-filters-nitrate', ['wetland', 'microbe', 'plant root'], ['nitrate', 'water', 'runoff'], 'diffusion', 'reaction_diffusion', 'wetland flow paths and microbes remove nitrate from runoff water'),
    relation('causal.compost-microbes-heat-pile', ['microbe', 'compost', 'organic matter'], ['heat', 'steam', 'pile'], 'heatTransfer', 'heat_transfer', 'microbial metabolism releases heat inside decomposing organic material'),
    relation('causal.photosynthesis-stores-sugar', ['sunlight', 'chlorophyll', 'leaf'], ['sugar', 'plant biomass', 'oxygen'], 'growthCoupling', 'growth_decay', 'photosynthesis converts light and carbon dioxide into stored biomass'),
    relation('causal.transpiration-pulls-xylem-water', ['transpiration', 'leaf evaporation', 'stomata'], ['xylem', 'root water', 'plant stem'], 'fluidForce', 'pressure_flow_lite', 'evaporation from leaves creates tension that pulls water upward through xylem'),
    relation('causal.immune-response-clears-pathogen', ['immune cell', 'antibody', 'inflammation'], ['pathogen', 'virus', 'bacteria'], 'growthCoupling', 'growth_decay', 'immune activity reduces viable pathogen density over time'),
    relation('causal.neural-feedback-stabilizes-posture', ['inner ear', 'proprioception', 'feedback'], ['muscle', 'posture', 'balance'], 'controlLoop', 'network_flow', 'sensory feedback adjusts muscle activation to stabilize body posture'),
    relation('causal.ph-gradient-drives-electrophoresis', ['electric field', 'gel', 'charge'], ['dna', 'protein', 'band'], 'fieldForce', 'wave_field', 'charged molecules migrate through gel according to size and charge'),
    relation('causal.solvent-dissolves-polymer', ['solvent', 'chemical bath', 'swelling agent'], ['polymer', 'plastic', 'coating'], 'diffusion', 'reaction_diffusion', 'solvent diffuses into polymer chains and weakens cohesive bonds'),
    relation('causal.humidity-swells-wood', ['humidity', 'water vapor', 'moisture'], ['wood', 'fiber', 'door'], 'diffusion', 'diffusion', 'water vapor diffuses into wood fibers and expands the grain'),
    relation('causal.cement-hydration-heats-concrete', ['cement', 'water', 'hydration'], ['concrete', 'heat', 'curing'], 'heatTransfer', 'heat_transfer', 'hydration reactions release heat as concrete cures'),
    relation('causal.polymer-crosslinking-hardens-resin', ['uv light', 'catalyst', 'crosslinking'], ['resin', 'polymer', 'solid part'], 'diffusion', 'reaction_diffusion', 'chemical crosslinks connect polymer chains and harden the resin'),
    relation('causal.maglev-field-lifts-train', ['magnetic field', 'electromagnet', 'levitation coil'], ['train', 'track', 'vehicle'], 'fieldForce', 'wave_field', 'magnetic forces lift and stabilize the vehicle above the guideway'),
    relation('causal.traffic-wave-propagates-jam', ['braking', 'traffic density', 'reaction delay'], ['traffic jam', 'cars', 'road'], 'networkFlow', 'network_flow', 'delayed driver responses propagate stop-and-go waves through dense traffic'),
    relation('causal.cache-miss-loads-database', ['cache miss', 'request', 'query'], ['database', 'latency', 'backend'], 'networkFlow', 'network_flow', 'missed cache lookup routes requests to slower backend storage and increases latency'),
    relation('causal.rate-limiter-stabilizes-api', ['rate limiter', 'quota', 'backpressure'], ['api', 'queue', 'server load'], 'controlLoop', 'network_flow', 'backpressure throttles incoming requests and stabilizes service load'),
    relation('causal.heat-pump-moves-heat-indoors', ['compressor', 'refrigerant', 'heat pump'], ['indoor air', 'coil', 'heat'], 'heatTransfer', 'heat_transfer', 'refrigerant cycle moves heat from a cold source into indoor air'),
    relation('causal.centrifuge-separates-blood', ['centrifuge', 'rotation', 'spin'], ['blood', 'plasma', 'cells'], 'fluidForce', 'pressure_flow_lite', 'rotation separates suspended blood components by density'),
    relation('causal.laser-trap-holds-bead', ['laser trap', 'optical tweezers', 'focused beam'], ['bead', 'particle', 'cell'], 'fieldForce', 'wave_field', 'focused light gradient holds a microscopic particle near the beam focus'),
    relation('causal.noise-cancellation-destructively-interferes', ['anti-noise', 'speaker', 'phase inverted wave'], ['sound', 'noise', 'pressure wave'], 'waveCoupling', 'wave_field', 'phase-inverted sound destructively interferes with unwanted pressure waves'),
    relation('causal.avalanche-snowpack-fails-slope', ['avalanche', 'snowpack', 'weak layer'], ['slope', 'snow slab', 'valley'], 'collision', 'rigid_collision', 'weak snow layers lose shear strength and release a sliding slab down the slope'),
    relation('causal.glacier-melt-feeds-river', ['glacier melt', 'meltwater', 'warming'], ['river', 'flood', 'stream'], 'phaseChange', 'phase_transition', 'warming converts ice into meltwater that feeds downstream river flow'),
    relation('causal.sea-ice-albedo-cools-ocean', ['sea ice', 'albedo', 'snow cover'], ['ocean', 'surface heat', 'climate'], 'heatTransfer', 'heat_transfer', 'bright ice reflects sunlight and reduces ocean surface heat absorption'),
    relation('causal.breakwater-reduces-shore-erosion', ['breakwater', 'reef', 'seawall'], ['wave', 'shoreline', 'erosion'], 'fluidForce', 'pressure_flow_lite', 'coastal barriers dissipate incoming wave energy before it reaches the shoreline'),
    relation('causal.storm-surge-overtops-barrier', ['storm surge', 'hurricane', 'sea level'], ['barrier', 'levee', 'coast'], 'fluidForce', 'pressure_flow_lite', 'elevated storm water exceeds barrier height and spills inland'),
    relation('causal.lightning-ignites-tree', ['lightning', 'electric discharge', 'storm'], ['tree', 'fire', 'forest'], 'heatTransfer', 'heat_transfer', 'electrical discharge deposits heat into dry tree material and starts combustion'),
    relation('causal.dust-aerosols-seed-clouds', ['dust', 'aerosol', 'nuclei'], ['cloud', 'droplet', 'rain'], 'phaseChange', 'phase_transition', 'aerosol nuclei give water vapor surfaces for condensation and droplet growth'),
    relation('causal.ozone-absorbs-uv-radiation', ['ozone', 'stratosphere', 'ozone layer'], ['uv', 'surface', 'dna'], 'heatTransfer', 'heat_transfer', 'ozone absorbs ultraviolet radiation before it reaches lower surfaces and cells'),
    relation('causal.mining-tailings-contaminate-river', ['tailings', 'mine runoff', 'heavy metal'], ['river', 'sediment', 'fish'], 'diffusion', 'reaction_diffusion', 'dissolved contaminants and fine tailings move into river sediment and aquatic habitat'),
    relation('causal.filtration-removes-particles', ['filter', 'membrane', 'porous media'], ['particle', 'water', 'air'], 'fluidForce', 'pressure_flow_lite', 'porous barriers trap suspended particles while allowing carrier fluid through'),
    relation('causal.reverse-osmosis-desalinates-water', ['pressure', 'reverse osmosis', 'membrane'], ['salt', 'freshwater', 'brine'], 'fluidForce', 'pressure_flow_lite', 'applied pressure forces water across a membrane while rejecting dissolved salt'),
    relation('causal.fermentation-produces-gas', ['yeast', 'fermentation', 'sugar'], ['gas', 'dough', 'alcohol'], 'growthCoupling', 'growth_decay', 'microbes metabolize sugar and release carbon dioxide or alcohol products'),
    relation('causal.cooking-heat-denatures-protein', ['cooking heat', 'pan', 'boiling'], ['protein', 'egg', 'meat'], 'heatTransfer', 'heat_transfer', 'heat unfolds protein structures and changes food texture'),
    relation('causal.freezer-burn-dehydrates-food', ['freezer', 'dry air', 'sublimation'], ['food', 'ice crystal', 'surface'], 'phaseChange', 'phase_transition', 'ice sublimates from exposed frozen food and leaves dehydrated porous surface patches'),
    relation('causal.ultraviolet-cures-photoresist', ['uv lithography', 'mask', 'photoresist'], ['wafer', 'pattern', 'polymer'], 'diffusion', 'reaction_diffusion', 'ultraviolet exposure changes photoresist chemistry through a mask pattern'),
    relation('causal.etchant-removes-copper', ['etchant', 'acid', 'chemical bath'], ['copper', 'circuit trace', 'mask'], 'diffusion', 'reaction_diffusion', 'chemical etchant dissolves exposed copper while masked traces remain'),
    relation('causal.sintering-fuses-powder', ['sintering', 'furnace', 'heat'], ['powder', 'ceramic', 'metal part'], 'phaseChange', 'phase_transition', 'high temperature diffuses particle boundaries together and densifies the powder body'),
    relation('causal.pressure-compacts-powder-tablet', ['press', 'pressure', 'die'], ['powder', 'tablet', 'pellet'], 'collision', 'rigid_collision', 'compressive die force packs loose powder into a dense tablet form'),
    relation('causal.antenna-radiates-radio-wave', ['antenna', 'oscillating current', 'transmitter'], ['radio wave', 'air', 'receiver'], 'waveCoupling', 'wave_field', 'oscillating current in an antenna launches electromagnetic waves through space'),
    relation('causal.signal-noise-corrupts-packet', ['noise', 'interference', 'bit error'], ['packet', 'signal', 'channel'], 'networkFlow', 'network_flow', 'channel interference changes bits and corrupts transmitted packets'),
    relation('causal.encryption-key-blocks-attacker', ['encryption', 'key', 'cipher'], ['attacker', 'data', 'plaintext'], 'networkFlow', 'network_flow', 'secret keys transform readable data into ciphertext that blocks unauthorized interpretation'),
    relation('causal.quorum-replication-survives-node-failure', ['replica', 'quorum', 'consensus'], ['node failure', 'database', 'ledger'], 'networkFlow', 'network_flow', 'replicated quorum state keeps a database or ledger available through node failure'),
    relation('causal.battery-charging-plates-lithium', ['charging current', 'lithium ion', 'anode'], ['battery', 'electrode', 'plating'], 'diffusion', 'reaction_diffusion', 'excess charging current deposits lithium onto electrode surfaces'),
    relation('causal.sei-layer-slows-battery-degradation', ['sei layer', 'electrolyte', 'passivation'], ['electrode', 'battery', 'lithium'], 'diffusion', 'reaction_diffusion', 'passivation layer limits further electrolyte reaction at the electrode boundary'),
    relation('causal.friction-heats-brake-pad', ['friction', 'brake', 'sliding contact'], ['heat', 'rotor', 'pad'], 'heatTransfer', 'heat_transfer', 'sliding contact converts kinetic energy into heat at the brake interface'),
    relation('causal.lubrication-reduces-wear', ['oil', 'lubricant', 'film'], ['gear', 'bearing', 'wear'], 'fluidForce', 'pressure_flow_lite', 'thin lubricant film separates moving surfaces and reduces abrasive contact'),
    relation('causal.crane-counterweight-balances-load', ['counterweight', 'crane', 'torque'], ['load', 'boom', 'hook'], 'torqueTransfer', 'rotational_torque', 'counterweight torque balances the suspended load around the crane pivot'),
    relation('causal.wind-sandblasts-surface', ['wind', 'sand', 'abrasion'], ['surface', 'paint', 'rock'], 'collision', 'rigid_collision', 'wind-driven grains impact exposed surfaces and remove material'),
    relation('causal.gravitational-lensing-bends-light', ['galaxy', 'mass', 'gravity'], ['light', 'image', 'quasar'], 'orbitalGravity', 'wave_field', 'mass curves spacetime enough to bend background light into arcs or multiple images'),
    relation('causal.doppler-shift-changes-observed-frequency', ['relative motion', 'velocity', 'source'], ['frequency', 'wave', 'observer'], 'waveCoupling', 'wave_field', 'relative motion compresses or stretches wavefront spacing at the observer'),
    relation('causal.mantle-convection-drives-plate-motion', ['mantle convection', 'heat', 'asthenosphere'], ['tectonic plate', 'rift', 'subduction zone'], 'fluidForce', 'advection', 'slow convective mantle flow drags rigid plates and opens or closes boundaries'),
    relation('causal.subduction-melts-mantle-wedge', ['subduction', 'oceanic plate', 'water-rich slab'], ['mantle wedge', 'magma', 'volcanic arc'], 'phaseChange', 'phase_transition', 'descending hydrated crust lowers melting temperature and feeds volcanic magma'),
    relation('causal.tsunami-shoaling-amplifies-wave', ['tsunami', 'shallow water', 'continental shelf'], ['wave height', 'coast', 'runup'], 'waveCoupling', 'wave_field', 'long waves slow in shallow water and convert speed into greater height'),
    relation('causal.sprinkler-cools-fire', ['sprinkler', 'water spray', 'fire suppression'], ['flame', 'smoke', 'fuel'], 'heatTransfer', 'heat_transfer', 'water droplets absorb heat and cool burning fuel below sustained combustion'),
    relation('causal.smoke-detector-triggers-alarm', ['smoke detector', 'smoke', 'sensor'], ['alarm', 'building', 'evacuation'], 'controlLoop', 'network_flow', 'smoke particles change sensor state and trigger an alarm signal'),
    relation('causal.drip-irrigation-wets-root-zone', ['drip irrigation', 'emitter', 'water'], ['root zone', 'soil moisture', 'crop'], 'fluidForce', 'pressure_flow_lite', 'low-rate emitters concentrate water near roots and raise local soil moisture'),
    relation('causal.pesticide-selects-resistant-pests', ['pesticide', 'selection pressure', 'spray'], ['resistant pest', 'population', 'crop'], 'growthCoupling', 'growth_decay', 'susceptible pests die faster and resistant variants become a larger fraction'),
    relation('causal.vaccine-primes-immune-memory', ['vaccine', 'antigen', 'dose'], ['immune memory', 'antibody', 'infection'], 'growthCoupling', 'growth_decay', 'antigen exposure expands memory cells that respond faster to later infection'),
    relation('causal.herd-immunity-blocks-transmission', ['immune population', 'vaccination', 'recovered hosts'], ['infection chain', 'virus', 'outbreak'], 'networkFlow', 'network_flow', 'immune hosts interrupt transmission paths through the contact network'),
    relation('causal.clotting-seals-wound', ['platelet', 'clotting factor', 'injury'], ['wound', 'blood flow', 'fibrin'], 'growthCoupling', 'growth_decay', 'platelets and fibrin accumulate at the injury and reduce blood loss'),
    relation('causal.kidney-filters-urea', ['kidney', 'glomerulus', 'filtration pressure'], ['urea', 'blood', 'urine'], 'fluidForce', 'pressure_flow_lite', 'pressure filtration moves small solutes from blood into forming urine'),
    relation('causal.dialysis-membrane-clears-solutes', ['dialysis', 'membrane', 'dialysate'], ['urea', 'blood', 'solute'], 'diffusion', 'diffusion', 'solute concentration gradients move waste across the dialysis membrane'),
    relation('causal.wind-chill-cools-skin', ['wind', 'cold air', 'convection'], ['skin', 'body heat', 'temperature'], 'heatTransfer', 'heat_transfer', 'moving cold air removes heat from exposed skin faster than still air'),
    relation('causal.urban-heat-island-warms-air', ['asphalt', 'concrete', 'city'], ['urban air', 'night temperature', 'heat island'], 'heatTransfer', 'heat_transfer', 'dark built surfaces store solar heat and release it into urban air'),
    relation('causal.asphalt-runoff-heats-stream', ['hot asphalt', 'stormwater', 'parking lot'], ['stream', 'water temperature', 'aquatic habitat'], 'heatTransfer', 'heat_transfer', 'runoff over heated pavement transfers heat into receiving streams'),
    relation('causal.uv-photodegrades-plastic', ['ultraviolet', 'sunlight', 'radiation'], ['plastic', 'polymer chain', 'microplastic'], 'diffusion', 'reaction_diffusion', 'UV photons break polymer bonds and embrittle exposed plastic'),
    relation('causal.galvanic-corrosion-eats-metal', ['galvanic couple', 'saltwater', 'electrolyte'], ['metal', 'anode', 'hull'], 'diffusion', 'reaction_diffusion', 'electrochemical potential drives anodic metal dissolution through the electrolyte'),
    relation('causal.sacrificial-anode-protects-hull', ['sacrificial anode', 'zinc', 'magnesium'], ['steel hull', 'pipe', 'corrosion'], 'diffusion', 'reaction_diffusion', 'more reactive anode corrodes preferentially and protects the structural metal'),
    relation('causal.catalytic-converter-oxidizes-exhaust', ['catalytic converter', 'platinum', 'hot catalyst'], ['exhaust', 'carbon monoxide', 'nitrogen oxide'], 'diffusion', 'reaction_diffusion', 'hot catalyst surfaces accelerate reactions that convert pollutants into safer gases'),
    relation('causal.evaporative-cooler-chills-air', ['evaporative cooler', 'wet pad', 'dry air'], ['air temperature', 'room', 'humidity'], 'phaseChange', 'phase_transition', 'water evaporation absorbs heat from passing air and lowers dry-bulb temperature'),
    relation('causal.compressor-raises-gas-pressure', ['compressor', 'piston', 'impeller'], ['gas', 'pressure', 'tank'], 'fluidForce', 'pressure_flow_lite', 'mechanical work squeezes gas into smaller volume and raises pressure'),
    relation('causal.nozzle-atomizes-spray', ['nozzle', 'pressure', 'jet'], ['droplet', 'mist', 'spray'], 'fluidForce', 'pressure_flow_lite', 'high-speed jet breaks liquid into smaller droplets through shear and instability'),
    relation('causal.cavitation-erodes-impeller', ['cavitation', 'vapor bubble', 'low pressure'], ['impeller', 'pump', 'metal surface'], 'phaseChange', 'phase_transition', 'collapsing vapor bubbles create microjets that pit nearby metal surfaces'),
    relation('causal.acoustic-feedback-squeals-microphone', ['microphone', 'speaker', 'feedback'], ['squeal', 'sound', 'amplifier'], 'waveCoupling', 'wave_field', 'amplified sound re-enters the microphone and reinforces a resonant tone'),
    relation('causal.seismic-isolator-damps-building', ['base isolator', 'rubber bearing', 'seismic damper'], ['building', 'floor acceleration', 'earthquake'], 'waveCoupling', 'wave_field', 'flexible isolators lengthen motion period and reduce transmitted acceleration'),
    relation('causal.tuned-mass-damper-reduces-sway', ['tuned mass damper', 'counter mass', 'pendulum'], ['tower', 'sway', 'wind vibration'], 'waveCoupling', 'wave_field', 'out-of-phase damper motion absorbs energy from building sway'),
    relation('causal.fresnel-lens-concentrates-sunlight', ['fresnel lens', 'sunlight', 'concentrator'], ['hot spot', 'solar receiver', 'heat'], 'refraction', 'wave_field', 'segmented lens facets bend incoming rays toward a small receiver area'),
    relation('causal.polarization-filter-blocks-glare', ['polarizer', 'polarized light', 'filter'], ['glare', 'reflection', 'camera'], 'refraction', 'wave_field', 'polarization filter blocks selected light orientation and reduces reflected glare'),
    relation('causal.hall-sensor-measures-current', ['hall sensor', 'magnetic field', 'current'], ['measurement', 'wire', 'controller'], 'fieldForce', 'wave_field', 'current-generated magnetic field shifts Hall voltage and provides a measurement signal'),
    relation('causal.gyroscope-feedback-stabilizes-drone', ['gyroscope', 'imu', 'attitude feedback'], ['drone', 'rotor', 'orientation'], 'controlLoop', 'network_flow', 'attitude sensors update rotor speeds to counter tilt and stabilize flight'),
    relation('causal.tooling-cools-molded-plastic', ['injection molding', 'cooling', 'cooling line', 'steel tooling'], ['plastic', 'polymer', 'mold', 'part'], 'phaseChange', 'phase_transition', 'cold steel tooling removes heat from polymer and solidifies the molded part'),
  ]);

  function relation(id, sources, targets, relationType, operatorType, mechanism, groundingPolicy = null) {
    return {
      id, sources, targets, relationType, operatorType, mechanism,
      groundingPolicy: groundingPolicy || defaultGroundingPolicy(operatorType),
    };
  }

  function typedCooccurrencePolicy() {
    return { mode: 'typed-cooccurrence', maxPathDepth: 0 };
  }

  function directSpatialPolicy(relationName) {
    return { mode: 'direct-spatial', requiredSpatialRelations: [relationName], maxPathDepth: 1 };
  }

  function connectedPathPolicy(relations, maxPathDepth) {
    return { mode: 'connected-path', requiredSpatialRelations: relations, maxPathDepth };
  }

  function evidenceQualifiedPolicy(terms, options = {}) {
    return { mode: 'evidence-qualified', requiredEvidenceTerms: terms, maxPathDepth: 2, ...options };
  }

  function defaultGroundingPolicy(operatorType) {
    return ['heat_transfer', 'phase_transition'].includes(operatorType)
      ? connectedPathPolicy(['near'], 3)
      : connectedPathPolicy([], 2);
  }

  function buildCausalPhysicsGraph(input = {}) {
    const prompt = languageEvidenceText(input).toLowerCase();
    const structured = input.structuredIntent || {};
    const evidenceRows = input.evidenceRows || input.retrievedEvidence || [];
    const nodes = intentNodes(structured, evidenceRows);
    const edges = [];
    for (const rule of CAUSAL_RELATION_RULES) {
      const predicatePair = predicateBoundNodePair(input.languageEvidence, nodes, rule);
      const source = predicatePair?.source || bestNodeForTerms(nodes, rule.sources, '', prompt);
      const target = predicatePair?.target || bestNodeForTerms(nodes, rule.targets, source && source.id, prompt);
      const evidence = strongEvidenceIdsForRule(evidenceRows, rule);
      const policyEvidence = groundingPolicyEvidence(prompt, rule);
      const promptHit = termsHit(prompt, rule.sources) && termsHit(prompt, rule.targets) &&
        policyEvidence.accepted;
      if (!source || !target || !promptHit) continue;
      edges.push({
        id: `${rule.id}.${edges.length + 1}`,
        ruleId: rule.id,
        relationType: rule.relationType,
        processId: processIdForRelation(rule.relationType),
        operatorType: rule.operatorType,
        sourceRef: source.id,
        targetRef: target.id,
        sourceLabel: source.label,
        targetLabel: target.label,
        mechanism: rule.mechanism,
        groundingPolicy: { ...rule.groundingPolicy },
        groundingPolicyEvidence: policyEvidence,
        primitiveHints: primitiveHintsForEvidence(evidenceRows, evidence),
        evidence: uniqueStrings([
          ...evidence, `causal-rule:${rule.id}`, ...(promptHit ? ['prompt-text'] : []),
        ]),
        confidence: promptHit ? 0.86 : 0.62,
      });
    }
    const acceptedEdges = uniqueEdges([...edges, ...phaseEdgesFromAcceptedHeat(edges)]);
    return {
      schema: 'simulatte.causalPhysicsGraph.v1',
      nodes,
      edges: acceptedEdges.slice(0, 32),
      coverage: {
        candidateNodes: nodes.length,
        edgeCount: acceptedEdges.length,
        ruleCount: CAUSAL_RELATION_RULES.length,
      },
    };
  }

  function phaseEdgesFromAcceptedHeat(edges = []) {
    return edges.flatMap((edge, index) => {
      if (edge.operatorType !== 'heat_transfer') return [];
      const rule = CAUSAL_RELATION_RULES.find((candidate) => (
        candidate.operatorType === 'phase_transition' &&
        candidate.sources.includes('heat') && termsHit(edge.targetLabel, candidate.targets)
      ));
      if (!rule) return [];
      return [{
        id: `${rule.id}.derived.${index + 1}`,
        ruleId: rule.id,
        relationType: rule.relationType,
        processId: processIdForRelation(rule.relationType),
        operatorType: rule.operatorType,
        sourceRef: edge.sourceRef,
        targetRef: edge.targetRef,
        sourceLabel: edge.sourceLabel,
        targetLabel: edge.targetLabel,
        mechanism: rule.mechanism,
        groundingPolicy: { ...rule.groundingPolicy },
        groundingPolicyEvidence: edge.groundingPolicyEvidence || { accepted: true, matchedEvidenceTerms: [] },
        primitiveHints: edge.primitiveHints || [],
        evidence: [`causal-rule:${rule.id}`, `causal-edge:${edge.id}`],
        confidence: Math.min(Number(edge.confidence || 0.66), 0.82),
        inferred: true,
        derivedFromEdgeId: edge.id,
      }];
    });
  }

  function languageEvidenceText(input = {}) {
    const evidence = input.languageEvidence || {};
    const rows = [
      evidence.normalizedText,
      ...(evidence.spans || []).map((row) => row.text),
      ...(evidence.clauses || []).map((row) => row.text),
      ...(evidence.predicateFrames || []).flatMap((row) => [
        row.text,
        row.subject,
        row.predicate,
        row.object,
        row.result,
        row.condition,
      ]),
    ].filter(Boolean);
    if (rows.length) return uniqueStrings(rows).join(' ');
    return String(input.prompt || '');
  }

  function intentNodes(structured, evidenceRows) {
    const rows = [];
    for (const group of ['entities', 'materials', 'phenomena', 'forces', 'fields', 'environment', 'observables']) {
      for (const item of structured[group] || []) {
        rows.push({
          id: item.id || `${group}.${slugify(item.label)}`,
          label: item.label || item.id || group,
          group,
          evidence: item.evidence || [],
          primitiveHints: item.primitiveHints || [],
          operatorHints: item.operatorHints || [],
          retrievedEvidence: false,
        });
      }
    }
    for (const row of evidenceRows || []) {
      const label = row.label || row.id || row.candidateText || '';
      if (!label) continue;
      rows.push({
        id: row.id || `${row.indexName || 'evidence'}.${slugify(label)}`,
        label,
        group: row.indexName || row.semanticType || 'evidence',
        evidence: [row.id || label],
        primitiveHints: row.primitiveHints || [],
        operatorHints: row.operatorHints || row.operatorTypes || [],
        retrievedEvidence: true,
      });
    }
    return uniqueNodes(rows).slice(0, 96);
  }

  function bestNodeForTerms(nodes, terms, excludeId = '', prompt = '') {
    let best = null;
    let bestScore = 0;
    for (const node of nodes || []) {
      if (node.id === excludeId) continue;
      const text = `${node.id} ${node.label} ${node.group} ${(node.primitiveHints || []).join(' ')} ${(node.operatorHints || []).join(' ')}`;
      let score = 0;
      for (const term of terms || []) {
        if (phraseHit(text, term)) score += 1.1;
      }
      if (score > 0 && phraseHit(prompt, node.label)) score += 4;
      if (score > 0 && node.retrievedEvidence !== true) score += 1.5;
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  }

  function predicateBoundNodePair(languageEvidence = {}, nodes = [], rule = {}) {
    const spansById = new Map((languageEvidence.spans || []).map((span) => [span.id, span]));
    for (const clause of languageEvidence.clauses || []) {
      const sourceSpan = spansById.get(clause.subjectSpanId);
      const targetSpan = spansById.get(clause.objectSpanId);
      if (!sourceSpan || !targetSpan) continue;
      if (!termsHit(sourceSpan.text, rule.sources) || !termsHit(targetSpan.text, rule.targets)) continue;
      const source = nodes.find((node) => node.id === sourceSpan.id);
      const target = nodes.find((node) => node.id === targetSpan.id && node.id !== sourceSpan.id);
      if (source && target) return { source, target };
    }
    for (const frame of languageEvidence.predicateFrames || []) {
      const source = nodeForPredicateSegment(nodes, rule.sources, frame.subject, 'tail');
      const target = nodeForPredicateSegment(nodes, rule.targets, frame.object, 'head', source?.id);
      if (source && target) return { source, target };
    }
    return null;
  }

  function nodeForPredicateSegment(nodes, terms, segment, edge, excludeId = '') {
    const value = ` ${normalizePhraseText(segment)} `;
    let best = null;
    let bestPosition = edge === 'tail' ? -1 : Number.POSITIVE_INFINITY;
    for (const node of nodes || []) {
      if (node.id === excludeId || !termsHit(node.label, terms)) continue;
      const needle = ` ${normalizePhraseText(node.label)} `;
      const position = value.indexOf(needle);
      if (position < 0) continue;
      const boundary = edge === 'tail' ? position + needle.length : position;
      if ((edge === 'tail' && boundary > bestPosition) || (edge !== 'tail' && boundary < bestPosition)) {
        best = node;
        bestPosition = boundary;
      }
    }
    return best;
  }

  function termsHit(text, terms) {
    return (terms || []).some((term) => phraseHit(text, term));
  }

  function groundingPolicyEvidence(text, rule = {}) {
    const policy = rule.groundingPolicy || typedCooccurrencePolicy();
    const requiredTerms = policy.requiredEvidenceTerms || [];
    const matchedEvidenceTerms = requiredTerms.filter((term) => termsHit(text, [term]));
    const evidenceAccepted = !requiredTerms.length || matchedEvidenceTerms.length > 0;
    const requiredRelations = policy.requiredSpatialRelations || [];
    const spatialAccepted = policy.mode !== 'direct-spatial' || requiredRelations.some((relationName) => (
      orderedRelationHit(text, rule.sources, relationName, rule.targets)
    ));
    return { accepted: evidenceAccepted && spatialAccepted, matchedEvidenceTerms, requiredRelations };
  }

  function orderedRelationHit(text, sources, connector, targets) {
    const value = ` ${normalizePhraseText(text)} `;
    const relationName = normalizePhraseText(connector);
    if (!relationName) return true;
    for (const source of sources || []) {
      const sourceNeedle = ` ${normalizePhraseText(source)} `;
      const sourceIndex = value.indexOf(sourceNeedle);
      if (sourceIndex < 0) continue;
      const connectorNeedle = ` ${relationName} `;
      const connectorIndex = value.indexOf(connectorNeedle, sourceIndex + sourceNeedle.length - 1);
      if (connectorIndex < 0) continue;
      for (const target of targets || []) {
        const targetNeedle = ` ${normalizePhraseText(target)} `;
        if (value.indexOf(targetNeedle, connectorIndex + connectorNeedle.length - 1) >= 0) return true;
      }
    }
    return false;
  }

  function phraseHit(text, phrase) {
    const value = normalizePhraseText(text);
    const needle = normalizePhraseText(phrase);
    return Boolean(needle) && ` ${value} `.includes(` ${needle} `);
  }

  function normalizePhraseText(value) {
    return String(value || '').toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function evidenceIdsForRule(rows, rule) {
    const ids = [];
    const terms = [...rule.sources, ...rule.targets, rule.operatorType, rule.relationType];
    for (const row of rows || []) {
      const text = [
        row.id,
        row.label,
        row.candidateText,
        row.semanticType,
        row.indexName,
        ...(row.aliases || []),
        ...(row.operatorHints || []),
        ...(row.operatorTypes || []),
        ...(row.primitiveHints || []),
      ].join(' ').toLowerCase();
      if (terms.some((term) => text.includes(String(term).toLowerCase()))) ids.push(row.id || row.label);
    }
    return uniqueStrings(ids).slice(0, 8);
  }

  function strongEvidenceIdsForRule(rows, rule) {
    const ids = [];
    const normalizedRule = normalizeCausalKey(rule.id);
    for (const row of rows || []) {
      const text = rowEvidenceText(row);
      const normalized = normalizeCausalKey(text);
      const exactRule = normalized.includes(normalizedRule);
      const sameRowSourceTarget = termsHit(text, rule.sources) && termsHit(text, rule.targets);
      if (exactRule || sameRowSourceTarget) ids.push(row.id || row.label);
    }
    return uniqueStrings(ids).slice(0, 8);
  }

  function rowEvidenceText(row) {
    return [
      row.id,
      row.label,
      row.candidateText,
      row.semanticType,
      row.indexName,
      ...(row.aliases || []),
      ...(row.operatorHints || []),
      ...(row.operatorTypes || []),
      ...(row.primitiveHints || []),
    ].join(' ').toLowerCase();
  }

  function normalizeCausalKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/causal[-.]/g, 'causal.')
      .replace(/[^a-z0-9.]+/g, '-');
  }

  function primitiveHintsForEvidence(rows, evidenceIds) {
    const idSet = new Set(evidenceIds || []);
    return uniqueStrings((rows || [])
      .filter((row) => idSet.has(row.id) || idSet.has(row.label))
      .flatMap((row) => row.primitiveHints || []));
  }

  function processIdForRelation(type) {
    const map = {
      heatTransfer: 'heat_transfer',
      phaseChange: 'phase_transition',
      fluidForce: 'flow',
      erosion: 'flow',
      fieldForce: 'oscillation',
      refraction: 'oscillation',
      collision: 'impact',
      waveCoupling: 'oscillation',
      growthCoupling: 'growth',
      diffusion: 'diffusion',
      networkFlow: 'network_flow',
      orbitalGravity: 'oscillation',
      torqueTransfer: 'rotate',
      controlLoop: 'network_flow',
      measurement: 'measurement',
    };
    return map[type] || 'interact';
  }

  function uniqueNodes(rows) {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const key = `${row.id}:${row.label}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueEdges(edges) {
    const seen = new Set();
    return (edges || []).filter((edge) => {
      const key = `${edge.relationType}:${edge.sourceRef}:${edge.targetRef}:${edge.operatorType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  function defaultSlugify(value) {
    return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  return {
    CAUSAL_RELATION_RULES,
    buildCausalPhysicsGraph,
  };
});
