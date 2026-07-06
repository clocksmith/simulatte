import path from 'node:path';
import { createRequire } from 'node:module';
import {
  INDEX_DEFINITIONS,
  INDEX_BY_NAME,
  UNIVERSE_DIR,
  artifactPath,
  cloneJson,
  createManifest,
  mergeDocuments,
  normalizeAliases,
  normalizeIndex,
  readJson,
  readManifest,
  uniqueSorted,
  writeJson,
} from './simulatte-universe-utils.mjs';

const require = createRequire(import.meta.url);

const DEFAULT_DOCS = Object.freeze({
  concepts: [
    concept('concept.ferrofluid-lens', 'ferrofluid lens', 'optic.ferrofluid_lens', 'adaptiveOptic', ['fluid', 'magnetism', 'optics', 'thermal'], 'ferrofluid', ['magnetic_field', 'field_refraction', 'heat_transfer'], ['magnetic fluid lens', 'liquid optic', 'field-shaped lens']),
    concept('concept.copper-coil', 'copper coil', 'component.copper_coil', 'actuator', ['electromagnetism', 'thermal', 'control'], 'copper', ['magnetic_field', 'heat_transfer'], ['electromagnet coil', 'induction coil']),
    concept('concept.subway-grid', 'subway queue grid', 'system.subway_queue_grid', 'networkSystem', ['network', 'control', 'queue'], 'silicon', ['network_flow', 'controller_response'], ['transit queue', 'rerouting grid', 'power surge network']),
    concept('concept.brine-vent', 'undersea brine vent', 'environment.brine_vent', 'geophysicalFlow', ['fluid', 'thermal', 'pressure', 'phase'], 'brine', ['pressure_flow_lite', 'crystallization', 'heat_transfer'], ['hydrothermal vent', 'pressure brine', 'crystal vent']),
    concept('concept.acoustic-levitator', 'acoustic levitator', 'apparatus.acoustic_levitator', 'waveApparatus', ['wave', 'acoustic', 'particle', 'granular'], 'brass', ['wave_field', 'particle_sorting'], ['standing wave sorter', 'dust levitator', 'brass tube resonator']),
    concept('concept.thin-film-loop', 'thin film wire loop', 'surface.thin_film_loop', 'surfaceFilm', ['surface', 'optics', 'fracture', 'fluid'], 'thin-film', ['surface_tension', 'fracture_threshold', 'field_refraction'], ['soap film loop', 'laser bubble film', 'fracturing membrane']),
    concept('concept.mycelium-gel', 'mycelium nutrient gel', 'biofilm.mycelium_gel', 'biofilm', ['biology', 'diffusion', 'fluid', 'wave'], 'nutrient-gel', ['growth_decay', 'reaction_diffusion', 'wave_field'], ['fungal membrane', 'nutrient gel wave', 'mycelium pump']),
    concept('concept.ceramic-kiln', 'ceramic kiln', 'apparatus.ceramic_kiln', 'thermalKiln', ['thermal', 'material', 'fracture', 'phase'], 'porcelain', ['heat_transfer', 'fracture_threshold', 'sintering'], ['porcelain kiln', 'sintering kiln', 'humid ceramic chamber']),
    concept('concept.mirror-swarm', 'orbiting mirror swarm', 'orbital.mirror_swarm', 'opticalArray', ['optics', 'orbit', 'control', 'thermal'], 'glass', ['field_reflection', 'field_refraction', 'heat_transfer', 'solar_concentration'], ['heliostat swarm', 'mirror satellite swarm', 'sunlight focus array']),
    concept('concept.warehouse-robot-pallet', 'warehouse robot pallet jam', 'logistics.warehouse_robot_pallet', 'logisticsRobot', ['network', 'control', 'electrical', 'fluid'], 'battery-electrolyte', ['network_flow', 'controller_response', 'electrochemical_potential', 'leak_flow'], ['warehouse robots', 'battery pallet', 'leaking pallet jam']),
    concept('concept.molten-salt-foam-battery', 'molten salt graphite foam battery', 'electrochem.molten_salt_foam_battery', 'electrochemicalStack', ['electrical', 'thermal', 'fluid', 'material'], 'molten-salt', ['electrochemical_potential', 'heat_transfer', 'porous_flow'], ['graphite foam battery', 'molten salt cell', 'porous battery stack']),
    concept('concept.protoplanetary-disk', 'protoplanetary dust disk', 'astro.protoplanetary_dust_disk', 'astrophysicalFlow', ['astronomy', 'fluid', 'gravity', 'thermal'], 'silicate-dust', ['fluid-advection', 'heat_transfer', 'particle_sorting'], ['planet forming disk', 'dust accretion disk', 'young star disk']),
    concept('concept.neutron-star-crustquake', 'neutron star crustquake', 'astro.neutron_star_crustquake', 'relativisticMaterialFailure', ['astronomy', 'fracture', 'magnetism', 'thermal'], 'iron-lattice', ['fracture_threshold', 'magnetic_field', 'heat_transfer'], ['starquake', 'magnetar crust fracture', 'gamma burst crust']),
    concept('concept.supercell-updraft', 'supercell rotating updraft', 'weather.supercell_rotating_updraft', 'atmosphericFlow', ['weather', 'fluid', 'thermal', 'electric'], 'humid-air', ['pressure_flow_lite', 'heat_transfer', 'electrostatic_discharge'], ['thunderstorm updraft', 'mesocyclone', 'storm cell']),
    concept('concept.subduction-slab', 'subduction slab system', 'geology.subduction_slab', 'geophysicalCutaway', ['geology', 'thermal', 'pressure', 'fracture'], 'basalt-slab', ['pressure_flow_lite', 'heat_transfer', 'fracture_threshold'], ['tectonic slab', 'mantle wedge', 'subduction zone']),
    concept('concept.tokamak-plasma', 'tokamak plasma confinement', 'fusion.tokamak_plasma_confinement', 'electromagneticPlasma', ['plasma', 'magnetism', 'thermal', 'control'], 'deuterium-tritium-plasma', ['magnetic_field', 'heat_transfer', 'controller_response'], ['fusion plasma', 'magnetic bottle', 'toroidal confinement']),
    concept('concept.nanopore-dna', 'nanopore DNA translocation', 'nano.nanopore_dna_translocation', 'molecularTransport', ['nanotech', 'biology', 'electric', 'fluid'], 'dna-strand', ['pressure_flow_lite', 'electrochemical_potential', 'diffusion'], ['DNA through pore', 'ionic nanopore', 'single molecule sensor']),
    concept('concept.heart-valve-flow', 'heart valve blood flow', 'bio.heart_valve_blood_flow', 'biomechanicalFlow', ['biology', 'fluid', 'mechanical', 'medical'], 'blood', ['pressure_flow_lite', 'rigid_collision', 'controller_response'], ['valve leaflet flow', 'cardiac pumping', 'blood vortex']),
    concept('concept.biofilm-reactor', 'biofilm nutrient reactor', 'bio.biofilm_nutrient_reactor', 'microbialTransport', ['biology', 'diffusion', 'fluid', 'growth'], 'nutrient-gel', ['reaction_diffusion', 'growth_decay', 'pressure_flow_lite'], ['microbial mat reactor', 'oxygen gradient biofilm', 'nutrient gel colony']),
    concept('concept.corrosion-cell', 'steel electrolyte corrosion cell', 'chem.steel_electrolyte_corrosion_cell', 'electrochemicalSurface', ['chemistry', 'electric', 'material', 'diffusion'], 'steel-electrolyte', ['electrochemical_potential', 'diffusion', 'fracture_threshold'], ['rust cell', 'anode cathode corrosion', 'pitting corrosion']),
    concept('concept.additive-powder-bed', 'additive ceramic powder bed', 'manufacturing.ceramic_powder_bed', 'manufacturingThermalProcess', ['manufacturing', 'thermal', 'material', 'phase'], 'ceramic-powder', ['heat_transfer', 'sintering', 'phase_change'], ['laser powder bed', 'ceramic additive manufacturing', 'sintered powder layer']),
    concept('concept.subway-agent-queue', 'subway platform agent queue', 'urban.subway_platform_agent_queue', 'crowdNetwork', ['urban', 'queue', 'control', 'transport'], 'human-agents', ['network_flow', 'controller_response', 'queue_service'], ['platform crowd queue', 'train boarding flow', 'transit agent model']),
    concept('concept.mycorrhizal-exchange', 'mycorrhizal phosphate exchange', 'ecology.mycorrhizal_phosphate_exchange', 'ecologicalExchange', ['ecology', 'biology', 'diffusion', 'growth'], 'mycelium', ['reaction_diffusion', 'growth_decay', 'diffusion'], ['root fungus exchange', 'hyphae phosphate flow', 'soil nutrient network']),
    concept('concept.double-pendulum-chaos', 'double pendulum chaos', 'math.double_pendulum_chaos', 'chaoticMechanism', ['math', 'chaos', 'mechanical', 'energy'], 'steel-arms', ['chaotic_dynamics', 'modal_vibration'], ['double pendulum', 'chaotic swing', 'phase space lobes']),
    concept('concept.lorenz-attractor-flow', 'Lorenz attractor flow', 'math.lorenz_attractor_flow', 'nonlinearField', ['math', 'chaos', 'fluid', 'visualization'], 'attractor-tracer', ['attractor_flow', 'convective_flow'], ['strange attractor', 'butterfly attractor', 'chaotic convection']),
    concept('concept.boolean-circuit-propagation', 'boolean circuit propagation', 'compute.boolean_circuit_propagation', 'digitalLogicSystem', ['computation', 'logic', 'electrical', 'control'], 'silicon-logic', ['logic_propagation', 'controller_response'], ['logic gate circuit', 'digital circuit', 'truth table propagation']),
    concept('concept.neural-activation-volume', 'neural activation volume', 'compute.neural_activation_volume', 'learnedFieldSystem', ['computation', 'learning', 'field', 'statistics'], 'activation-field', ['activation_transport', 'tensor_flow'], ['activation map', 'neural network volume', 'feature field']),
    concept('concept.nuclear-reactor-core', 'nuclear reactor core', 'nuclear.reactor_core', 'neutronThermalSystem', ['nuclear', 'thermal', 'control', 'radiation'], 'uranium-fuel', ['neutron_transport', 'heat_transfer', 'controller_response'], ['reactor core', 'control rods', 'neutron flux']),
    concept('concept.inertial-fusion-pellet', 'inertial fusion pellet', 'fusion.inertial_fusion_pellet', 'implosionPlasmaSystem', ['fusion', 'plasma', 'thermal', 'pressure'], 'frozen-deuterium', ['implosion_compression', 'heat_transfer', 'radiation_transport'], ['fusion pellet', 'laser implosion', 'compressed fuel capsule']),
    concept('concept.pharmacokinetic-delivery', 'pharmacokinetic drug delivery', 'medical.pharmacokinetic_delivery', 'biochemicalTransport', ['medical', 'biology', 'diffusion', 'control'], 'lipid-particle', ['pharmacokinetic_transport', 'diffusion'], ['drug delivery', 'dose response', 'lipid nanoparticle transport']),
    concept('concept.immune-cascade', 'immune cascade', 'medical.immune_cascade', 'biologicalNetwork', ['medical', 'biology', 'network', 'reaction'], 'immune-cells', ['immune_binding', 'reaction_diffusion'], ['immune response', 'antigen binding', 'cytokine cascade']),
    concept('concept.bone-remodeling', 'bone remodeling', 'medical.bone_remodeling', 'biomechanicalMaterial', ['medical', 'biology', 'solid', 'growth'], 'trabecular-bone', ['bone_remodeling', 'fracture_threshold'], ['trabecular bone', 'osteoblast osteoclast', 'mechanical remodeling']),
    concept('concept.suspension-bridge-cable', 'suspension bridge cable', 'structure.suspension_bridge_cable', 'civilStructure', ['architecture', 'solid', 'mechanical', 'wind'], 'bridge-cable-steel', ['cable_load_transfer', 'modal_vibration'], ['bridge cable', 'deck oscillation', 'suspension span']),
    concept('concept.seismic-isolator', 'seismic isolator', 'structure.seismic_isolator', 'seismicControlSystem', ['architecture', 'solid', 'control', 'earthquake'], 'elastomer-bearing', ['seismic_isolation', 'modal_vibration'], ['base isolator', 'earthquake bearing', 'seismic damping']),
    concept('concept.turbofan-compressor', 'turbofan compressor', 'aero.turbofan_compressor', 'rotatingFlowMachine', ['aerospace', 'fluid', 'thermal', 'mechanical'], 'titanium-blades', ['compressor_flow', 'heat_transfer'], ['jet engine compressor', 'fan stage', 'blade stall']),
    concept('concept.ev-drivetrain', 'electric vehicle drivetrain', 'vehicle.ev_drivetrain', 'electromechanicalSystem', ['vehicle', 'electric', 'mechanical', 'control'], 'battery-copper-stack', ['drivetrain_torque', 'electrochemical_potential', 'controller_response'], ['EV drivetrain', 'motor inverter', 'torque vectoring']),
    concept('concept.acoustic-hall', 'orchestra hall acoustics', 'acoustic.orchestra_hall', 'acousticField', ['acoustic', 'wave', 'architecture'], 'acoustic-air', ['acoustic_ray_field', 'wave_field'], ['concert hall acoustics', 'reverberation field', 'sound reflection']),
    concept('concept.modal-violin-string', 'violin string modal vibration', 'acoustic.violin_string_modal_vibration', 'modalWaveSystem', ['acoustic', 'wave', 'mechanical'], 'violin-string', ['modal_vibration', 'wave_field'], ['violin string', 'standing wave mode', 'bowed string resonance']),
    concept('concept.climate-carbon-cycle', 'climate carbon cycle', 'climate.carbon_cycle', 'planetaryExchangeSystem', ['climate', 'atmosphere', 'ecology', 'thermal'], 'atmospheric-carbon', ['climate_exchange', 'heat_transfer'], ['carbon cycle', 'climate feedback', 'ocean atmosphere exchange']),
    concept('concept.vertical-farm-canopy', 'vertical farm canopy', 'agriculture.vertical_farm_canopy', 'controlledEcology', ['agriculture', 'biology', 'fluid', 'control'], 'nutrient-mist', ['canopy_transpiration', 'reaction_diffusion', 'controller_response'], ['vertical farm', 'hydroponic canopy', 'nutrient mist grow tower']),
    concept('concept.orbital-docking', 'orbital docking control', 'space.orbital_docking_control', 'orbitalControlSystem', ['space', 'control', 'mechanical', 'orbit'], 'docking-aluminum', ['attitude_control', 'controller_response'], ['spacecraft docking', 'rendezvous control', 'docking port alignment']),
    concept('concept.superconducting-qubit', 'superconducting qubit', 'quantum.superconducting_qubit', 'quantumCircuitSystem', ['quantum', 'electrical', 'thermal', 'control'], 'niobium-film', ['quantum_coherence', 'controller_response'], ['qubit chip', 'Josephson junction', 'microwave resonator']),
    concept('concept.electron-microscope-column', 'electron microscope column', 'instrument.electron_microscope_column', 'chargedParticleOptic', ['instrument', 'electric', 'magnetism', 'imaging'], 'electron-beam-vacuum', ['charged_particle_optics', 'magnetic_field'], ['electron beam column', 'microscope lens stack', 'charged beam focusing']),
    concept('concept.graphene-strain-sheet', 'graphene strain sheet', 'nano.graphene_strain_sheet', 'nanomaterialSurface', ['nanotech', 'solid', 'electric', 'surface'], 'graphene', ['strain_field', 'surface_tension'], ['graphene wrinkle', '2D material strain', 'nano membrane ripple']),
    concept('concept.photonic-crystal', 'photonic crystal slab', 'optic.photonic_crystal_slab', 'waveBandgapSystem', ['optics', 'wave', 'material'], 'photonic-dielectric', ['photonic_bandgap', 'wave_field'], ['photonic crystal', 'bandgap waveguide', 'dielectric lattice']),
    concept('concept.lava-tube-flow', 'lava tube flow', 'geology.lava_tube_flow', 'geophysicalFlow', ['geology', 'thermal', 'fluid', 'phase'], 'basalt-melt', ['viscous_advection', 'heat_transfer'], ['lava tube', 'basalt melt channel', 'volcanic flow']),
    concept('concept.glacier-crevasse', 'glacier crevasse field', 'earth.glacier_crevasse_field', 'cryosphereFailure', ['earth', 'ice', 'fracture', 'fluid'], 'glacier-ice', ['ice_fracture', 'heat_transfer'], ['glacier crack', 'blue ice crevasse', 'ice shelf fracture']),
    concept('concept.river-delta-plume', 'river delta plume', 'earth.river_delta_plume', 'sedimentTransportSystem', ['earth', 'fluid', 'sediment', 'coastal'], 'river-sediment', ['sediment_transport', 'pressure_flow_lite'], ['delta plume', 'distributary channel', 'silt deposition']),
    concept('concept.wind-turbine-wake', 'wind turbine wake', 'energy.wind_turbine_wake', 'aeroEnergySystem', ['energy', 'fluid', 'mechanical', 'control'], 'turbulent-air', ['wake_shedding', 'controller_response'], ['turbine wake', 'rotor farm flow', 'tip vortex wake']),
    concept('concept.carbon-capture-column', 'carbon capture column', 'climate.carbon_capture_column', 'chemicalSeparator', ['climate', 'chemistry', 'fluid', 'diffusion'], 'amine-solvent', ['gas_absorption', 'diffusion'], ['CO2 absorber', 'amine capture column', 'packed bed capture']),
    concept('concept.desalination-membrane', 'desalination membrane', 'water.desalination_membrane', 'membraneSeparator', ['water', 'fluid', 'pressure', 'diffusion'], 'polymer-membrane', ['membrane_transport', 'pressure_flow_lite'], ['reverse osmosis', 'salt rejection membrane', 'spiral desalination module']),
    concept('concept.drone-swarm', 'drone swarm consensus', 'robotics.drone_swarm_consensus', 'distributedControlSystem', ['robotics', 'control', 'network', 'vehicle'], 'quadrotor-composite', ['swarm_consensus', 'controller_response'], ['drone swarm', 'formation control', 'multi agent flight']),
    concept('concept.soft-robot-gripper', 'soft robot gripper', 'robotics.soft_robot_gripper', 'softActuatorSystem', ['robotics', 'fluid', 'solid', 'control'], 'silicone-elastomer', ['soft_actuation', 'pressure_flow_lite'], ['pneumatic gripper', 'soft actuator', 'compliant grasp']),
    concept('concept.neuron-synapse', 'neuron synapse transmission', 'bio.neuron_synapse_transmission', 'bioelectricJunction', ['biology', 'electric', 'chemical', 'network'], 'neural-tissue', ['synaptic_transmission', 'electrochemical_potential'], ['synapse', 'spike transmission', 'vesicle release']),
    concept('concept.kidney-nephron', 'kidney nephron filtration', 'bio.kidney_nephron_filtration', 'organTransportSystem', ['biology', 'medical', 'fluid', 'diffusion'], 'kidney-tissue', ['selective_filtration', 'membrane_transport'], ['nephron', 'renal filtration', 'tubule reabsorption']),
    concept('concept.epidemic-contact-graph', 'epidemic contact graph', 'society.epidemic_contact_graph', 'agentNetworkSystem', ['society', 'network', 'biology', 'risk'], 'human-contacts', ['epidemic_spread', 'network_flow'], ['infection network', 'contact tracing graph', 'disease spread model']),
    concept('concept.power-grid-islanding', 'power grid islanding', 'energy.power_grid_islanding', 'electricalNetworkSystem', ['energy', 'electrical', 'network', 'control'], 'grid-copper', ['grid_load_flow', 'controller_response'], ['grid islanding', 'substation balancing', 'frequency drift']),
    concept('concept.adaptive-telescope', 'adaptive telescope mirror', 'optic.adaptive_telescope_mirror', 'precisionOpticControl', ['optics', 'control', 'wave', 'astronomy'], 'adaptive-glass', ['wavefront_correction', 'controller_response'], ['adaptive optics', 'segmented telescope mirror', 'wavefront actuator']),
    concept('concept.reentry-plasma-sheath', 'reentry plasma sheath', 'space.reentry_plasma_sheath', 'hypersonicThermalSystem', ['space', 'plasma', 'thermal', 'fluid'], 'ionized-air', ['shock_ionization', 'heat_transfer'], ['reentry plasma', 'capsule blackout', 'ablative shock layer']),
    concept('concept.particle-collider-event', 'particle collider event', 'physics.particle_collider_event', 'highEnergyDetectorSystem', ['physics', 'particle', 'field', 'instrument'], 'muon-tracks', ['particle_cascade', 'charged_particle_optics'], ['collider event', 'muon track detector', 'collision vertex']),
    concept('concept.planetary-ring-resonance', 'planetary ring resonance', 'astro.planetary_ring_resonance', 'orbitalGranularSystem', ['astronomy', 'gravity', 'granular', 'orbit'], 'ice-boulders', ['orbital_resonance', 'particle_sorting'], ['shepherd moon ring', 'ring gap resonance', 'orbital density wave']),
    concept('concept.ocean-eddy-upwelling', 'ocean eddy upwelling', 'earth.ocean_eddy_upwelling', 'geophysicalVortexSystem', ['earth', 'fluid', 'ecology', 'thermal'], 'saltwater-vorticity', ['vortex_transport', 'climate_exchange'], ['mesoscale eddy', 'nutrient upwelling', 'rotating ocean current']),
    concept('concept.mangrove-flood-buffer', 'mangrove flood buffer', 'ecology.mangrove_flood_buffer', 'coastalEcologyShield', ['ecology', 'fluid', 'sediment', 'climate'], 'mangrove-roots', ['flood_attenuation', 'sediment_transport'], ['mangrove storm surge', 'tidal root buffer', 'coastal flood shield']),
    concept('concept.termite-ventilation', 'termite mound ventilation', 'biology.termite_mound_ventilation', 'bioThermalArchitecture', ['biology', 'fluid', 'thermal', 'architecture'], 'clay-pores', ['porous_flow', 'heat_transfer'], ['termite mound chimney', 'colony ventilation', 'porous bio architecture']),
    concept('concept.insect-wing-vortex', 'insect wing vortex lift', 'bio.insect_wing_vortex_lift', 'unsteadyAeroBiomechanics', ['biology', 'fluid', 'mechanical', 'wave'], 'chitin-wing', ['vortex_lift', 'modal_vibration'], ['insect flight', 'leading edge vortex', 'flexible wing lift']),
    concept('concept.gut-microbiome-exchange', 'gut microbiome metabolite exchange', 'bio.gut_microbiome_exchange', 'microbialEcologyTransport', ['biology', 'chemistry', 'diffusion', 'fluid'], 'microbial-colonies', ['metabolite_exchange', 'reaction_diffusion'], ['gut microbiome', 'intestinal metabolite exchange', 'mucus microbial colony']),
    concept('concept.eye-aqueous-drainage', 'eye aqueous drainage', 'medical.eye_aqueous_drainage', 'biomedicalPressureSystem', ['medical', 'fluid', 'pressure', 'optics'], 'clear-aqueous-fluid', ['pressure_flow_lite', 'selective_filtration'], ['aqueous humor', 'trabecular mesh drainage', 'eye pressure flow']),
    concept('concept.dna-repair-fork', 'DNA repair replication fork', 'bio.dna_repair_fork', 'molecularCorrectionSystem', ['biology', 'molecular', 'control', 'reaction'], 'chromatin-strands', ['molecular_transport', 'logic_propagation'], ['DNA repair', 'replication fork correction', 'mismatch repair']),
    concept('concept.mitochondria-atp-gradient', 'mitochondria ATP gradient', 'bio.mitochondria_atp_gradient', 'bioenergeticMembraneSystem', ['biology', 'energy', 'chemical', 'membrane'], 'proton-gradient', ['membrane_transport', 'electrochemical_potential'], ['ATP synthase', 'proton gradient', 'mitochondrial energy conversion']),
    concept('concept.aquifer-contamination-plume', 'aquifer contamination plume', 'earth.aquifer_contamination_plume', 'porousGroundwaterSystem', ['earth', 'fluid', 'chemistry', 'diffusion'], 'groundwater-plume', ['porous_flow', 'sediment_transport'], ['groundwater contaminant plume', 'aquifer cleanup', 'porous strata dispersion']),
    concept('concept.bridge-scour', 'bridge pier scour', 'infrastructure.bridge_pier_scour', 'hydraulicStructureRisk', ['infrastructure', 'fluid', 'sediment', 'solid'], 'river-sediment', ['sediment_transport', 'wake_shedding'], ['bridge scour', 'pier erosion', 'horseshoe vortex sediment']),
    concept('concept.railway-dispatch', 'railway dispatch conflict resolution', 'logistics.railway_dispatch_conflict_resolution', 'transportNetworkControl', ['transport', 'network', 'control', 'queue'], 'train-agents', ['network_flow', 'swarm_consensus'], ['rail dispatch', 'signal block conflict', 'train timetable routing']),
    concept('concept.submarine-cable-signal', 'submarine cable signal attenuation', 'network.submarine_cable_signal_attenuation', 'fiberNetworkSystem', ['network', 'optics', 'ocean', 'infrastructure'], 'fiber-glass', ['field_refraction', 'network_flow'], ['submarine fiber cable', 'seafloor repeater signal', 'undersea internet cable']),
    concept('concept.edge-data-center-heat', 'edge data center heat recirculation', 'compute.edge_data_center_heat_recirculation', 'thermalComputeFacility', ['computation', 'thermal', 'fluid', 'control'], 'server-racks', ['heat_transfer', 'controller_response'], ['data center cooling', 'server rack heat', 'hot aisle recirculation']),
    concept('concept.metal-melt-pool', 'metal additive melt pool', 'manufacturing.metal_additive_melt_pool', 'laserManufacturingThermalSystem', ['manufacturing', 'thermal', 'fluid', 'material'], 'stainless-powder', ['laser_sintering', 'viscous_advection'], ['metal melt pool', 'laser powder bed fusion', 'solidification track']),
    concept('concept.sourdough-fermentation', 'sourdough fermentation matrix', 'food.sourdough_fermentation_matrix', 'foodBioreactorSystem', ['food', 'biology', 'growth', 'diffusion'], 'flour-water', ['growth_decay', 'gas_absorption'], ['sourdough fermentation', 'dough gas bubbles', 'microbial rise']),
    concept('concept.social-belief-cascade', 'social belief cascade', 'society.social_belief_cascade', 'informationEpidemicSystem', ['society', 'network', 'agent', 'risk'], 'message-packets', ['epidemic_spread', 'network_flow'], ['misinformation cascade', 'belief spread graph', 'correction pulse network']),
    concept('concept.public-health-triage', 'public health triage resource allocation', 'society.public_health_triage', 'healthQueueSystem', ['society', 'medical', 'queue', 'control'], 'patient-agents', ['agent_queueing', 'controller_response'], ['clinic triage', 'resource allocation', 'patient queue risk']),
    concept('concept.city-zoning-shadow', 'city zoning shadow allocation', 'urban.city_zoning_shadow_allocation', 'urbanGeometryConstraintSystem', ['urban', 'optics', 'architecture', 'policy'], 'building-masses', ['solar_concentration', 'field_reflection'], ['zoning shadow', 'sunlight allocation', 'building envelope model']),
    concept('concept.chemical-clock', 'chemical clock reaction', 'chem.chemical_clock_reaction', 'oscillatingChemistrySystem', ['chemistry', 'reaction', 'wave', 'time'], 'belousov-solution', ['chemical_oscillation', 'reaction_diffusion'], ['chemical clock', 'Belousov reaction', 'oscillating solution']),
    concept('concept.polymer-curing', 'polymer curing crosslink network', 'material.polymer_curing_crosslink_network', 'polymerMaterialTransform', ['chemistry', 'material', 'thermal', 'solid'], 'epoxy-resin', ['crosslinking_cure', 'heat_transfer'], ['epoxy curing', 'resin crosslinking', 'gel front']),
    concept('concept.electroplating-bath', 'electroplating bath deposition', 'manufacturing.electroplating_bath_deposition', 'electrochemicalManufacturing', ['manufacturing', 'electric', 'chemistry', 'surface'], 'nickel-ions', ['electrochemical_deposition', 'electrochemical_potential'], ['electroplating', 'nickel deposition', 'cathode coating']),
    concept('concept.artwork-aging', 'artwork material aging', 'culture.artwork_material_aging', 'culturalMaterialSystem', ['culture', 'material', 'chemistry', 'humidity'], 'pigment-film', ['cultural_decay', 'diffusion'], ['paint drying', 'oil paint aging', 'museum preservation']),
    concept('concept.crowd-venue-flow', 'crowd venue flow', 'society.crowd_venue_flow', 'crowdAcousticQueueSystem', ['society', 'crowd', 'acoustic', 'queue'], 'crowd-agents', ['crowd_acoustic_flow', 'agent_queueing'], ['festival crowd', 'stadium egress', 'restaurant order queue']),
    concept('concept.recreational-trajectory', 'recreational trajectory dynamics', 'motion.recreational_trajectory_dynamics', 'humanMotionMechanics', ['sport', 'mechanical', 'fluid', 'solid'], 'rider-agents', ['recreational_motion', 'rigid_collision'], ['skatepark flow', 'ski carving', 'surf break', 'sailing tactics']),
    concept('concept.radio-telescope-beamforming', 'radio telescope beamforming', 'astro.radio_telescope_beamforming', 'distributedWaveInstrument', ['astronomy', 'wave', 'network', 'instrument'], 'radio-dishes', ['beamforming_control', 'wave_field'], ['radio array', 'beamforming baseline', 'phase calibration']),
    concept('concept.deep-space-link', 'deep space link budget', 'space.deep_space_link_budget', 'spaceCommunicationNetwork', ['space', 'network', 'radiation', 'control'], 'microwave-signals', ['deep_space_link', 'network_flow'], ['deep space network', 'link budget', 'probe communication']),
    concept('concept.asteroid-mining-sorting', 'asteroid mining material sorting', 'space.asteroid_mining_material_sorting', 'lowGravityResourceSystem', ['space', 'robotics', 'granular', 'material'], 'robotic-miners', ['low_gravity_sorting', 'particle_sorting'], ['asteroid mining', 'low gravity sorting', 'rubble resource site']),
    concept('concept.planetary-surface-transport', 'planetary surface transport', 'space.planetary_surface_transport', 'planetaryEnvironmentFlow', ['space', 'fluid', 'granular', 'thermal'], 'charged-dust', ['planetary_surface_transport', 'electrostatic_transport'], ['Mars dust storm', 'Titan methane river', 'Venus cloud balloon']),
    concept('concept.europa-tidal-ice', 'Europa tidal ice flexing', 'space.europa_tidal_ice_flexing', 'icyMoonGeophysics', ['space', 'ice', 'fracture', 'ocean'], 'ice-shell', ['tidal_ice_flexing', 'ice_fracture'], ['Europa ocean', 'tidal flexing', 'ice shell cracks']),
    concept('concept.gravitational-lens', 'gravitational lens shear', 'astro.gravitational_lens_shear', 'relativisticOpticalField', ['astronomy', 'gravity', 'optics', 'field'], 'mass-field', ['gravitational_lensing', 'field_refraction'], ['dark matter lens', 'galaxy cluster shear', 'lensing arc']),
    concept('concept.population-genetics', 'population genetics selection drift', 'bio.population_genetics_selection_drift', 'evolutionaryAgentSystem', ['biology', 'statistics', 'network', 'agent'], 'allele-agents', ['population_selection', 'network_flow'], ['allele drift', 'selection pressure', 'island genetics']),
    concept('concept.ecosystem-succession', 'ecosystem succession competition', 'ecology.ecosystem_succession_competition', 'ecologicalLandscapeSystem', ['ecology', 'growth', 'competition', 'terrain'], 'plant-cohorts', ['ecosystem_succession', 'growth_decay'], ['plant succession', 'disturbed landscape recovery', 'cohort competition']),
    concept('concept.collective-animal-motion', 'collective animal motion', 'bio.collective_animal_motion', 'animalSwarmSystem', ['biology', 'agent', 'fluid', 'network'], 'animal-agents', ['collective_motion', 'swarm_consensus'], ['fish school', 'bird flock', 'animal trail', 'pollinator network']),
    concept('concept.agriculture-system-rotation', 'agriculture rotation and controlled growth', 'agriculture.rotation_controlled_growth', 'agroEcologicalControlSystem', ['agriculture', 'biology', 'soil', 'control'], 'soil-nutrients', ['agriculture_rotation', 'canopy_transpiration'], ['crop rotation', 'greenhouse climate', 'fish farm aeration', 'algae bioreactor']),
    concept('concept.waste-resource-loop', 'waste resource loop', 'infrastructure.waste_resource_loop', 'circularMaterialSystem', ['waste', 'chemistry', 'biology', 'logistics'], 'organic-waste', ['waste_bioreaction', 'gas_absorption'], ['compost pile', 'landfill gas', 'recycling sorter']),
    concept('concept.infrastructure-excavation', 'infrastructure excavation and underground safety', 'infrastructure.excavation_underground_safety', 'civilSubsurfaceSystem', ['infrastructure', 'geology', 'fluid', 'safety'], 'rock-face', ['infrastructure_excavation', 'fracture_threshold'], ['tunnel boring', 'mine ventilation', 'subsurface alignment']),
    concept('concept.natural-hazard-propagation', 'natural hazard propagation', 'earth.natural_hazard_propagation', 'hazardDynamicsSystem', ['earth', 'weather', 'fluid', 'fracture'], 'hazard-field', ['natural_hazard_propagation', 'convective_flow'], ['earthquake rupture', 'tsunami generation', 'hurricane eye', 'tornado debris']),
    concept('concept.urban-exposure-field', 'urban exposure field', 'urban.urban_exposure_field', 'urbanEnvironmentalSystem', ['urban', 'thermal', 'acoustic', 'optics'], 'urban-surfaces', ['urban_exposure_field', 'heat_transfer'], ['urban heat island', 'noise pollution', 'light pollution', 'air quality valley']),
    concept('concept.civic-market-network', 'civic market network', 'society.civic_market_network', 'economicPolicyNetwork', ['society', 'market', 'network', 'policy'], 'market-agents', ['market_network_flow', 'agent_queueing'], ['housing market', 'power market', 'carbon credit audit', 'supply demand bullwhip']),
    concept('concept.cyber-information-system', 'cyber information system', 'compute.cyber_information_system', 'digitalNetworkRiskSystem', ['computation', 'network', 'security', 'learning'], 'network-packets', ['cyber_attack_spread', 'belief_cascade'], ['cybersecurity alert', 'blockchain mempool', 'recommendation drift', 'search ranking pipeline']),
    concept('concept.assistive-medical-control', 'assistive medical control', 'medical.assistive_medical_control', 'clinicalMechatronicSystem', ['medical', 'robotics', 'control', 'biology'], 'tissue-mesh', ['rehabilitation_control', 'soft_actuation'], ['robot surgery', 'prosthetic hand', 'rehab gait', 'hospital bedflow']),
    concept('concept.environmental-remediation', 'environmental remediation and restoration', 'environment.environmental_remediation_restoration', 'restorationEngineeringSystem', ['environment', 'water', 'ecology', 'chemistry'], 'water-table', ['environmental_remediation', 'membrane_transport'], ['water treatment', 'peatland restoration', 'oyster reef', 'desertification front']),
    concept('concept.advanced-energy-chemistry', 'advanced energy chemistry', 'energy.advanced_energy_chemistry', 'energyChemistrySystem', ['energy', 'nuclear', 'chemistry', 'plasma'], 'plasma-ribbon', ['stellarator_confinement', 'catalyst_reaction'], ['nuclear waste repository', 'fusion stellarator', 'hydrogen electrolyzer', 'ammonia synthesis']),
  ],
  materials: [
    material('material.ferrofluid', 'ferrofluid', 'ferrofluid', ['magnetic fluid'], { magnetization: 0.74, viscosity: 0.36, refractiveIndex: 1.67 }),
    material('material.copper', 'copper', 'copper', ['conductive coil metal'], { conductivity: 0.95, heatTransfer: 0.68 }),
    material('material.brine', 'pressure brine', 'brine', ['saline vent fluid'], { pressure: 0.86, viscosity: 0.58, crystallization: 0.72 }),
    material('material.brass-dust', 'brass dust', 'brass', ['resonator dust'], { granularFriction: 0.28, soundFrequency: 0.74 }),
    material('material.thin-film', 'thin film', 'thin-film', ['soap film', 'membrane film'], { surfaceTension: 0.86, opacity: 0.22, hardness: 0.18 }),
    material('material.nutrient-gel', 'nutrient gel', 'nutrient-gel', ['bio gel'], { moisture: 0.82, viscosity: 0.64, populationGrowth: 0.84 }),
    material('material.silicon', 'silicon control substrate', 'silicon', ['routing silicon'], { conductivity: 0.72, signalDelay: 0.26 }),
    material('material.porcelain', 'cracked porcelain', 'porcelain', ['ceramic', 'kiln clay', 'sintered ceramic'], { hardness: 0.82, heatTransfer: 0.52, bondStrength: 0.46 }),
    material('material.graphite-foam', 'graphite foam', 'graphite-foam', ['porous carbon foam', 'foam stack'], { conductivity: 0.78, permeability: 0.66, density: 0.22 }),
    material('material.molten-salt', 'molten salt electrolyte', 'molten-salt', ['liquid salt', 'salt battery electrolyte'], { conductivity: 0.72, heatCapacity: 0.86, viscosity: 0.42 }),
    material('material.battery-electrolyte', 'leaking battery electrolyte', 'battery-electrolyte', ['battery leak', 'electrolyte spill'], { conductivity: 0.76, moisture: 0.82, reactionRate: 0.62 }),
    material('material.silicate-dust', 'silicate dust', 'silicate-dust', ['planet dust', 'cosmic silicate grains'], { density: 0.42, opacity: 0.62, heatCapacity: 0.28 }),
    material('material.iron-lattice', 'iron lattice', 'iron-lattice', ['neutron crust iron', 'magnetar crust lattice'], { density: 0.98, hardness: 0.96, conductivity: 0.84 }),
    material('material.humid-air', 'humid air', 'humid-air', ['moist atmosphere', 'storm inflow'], { moisture: 0.86, heatCapacity: 0.58, viscosity: 0.08 }),
    material('material.basalt-slab', 'basalt slab', 'basalt-slab', ['oceanic crust slab', 'subducting basalt'], { density: 0.86, hardness: 0.78, heatCapacity: 0.44 }),
    material('material.deuterium-tritium-plasma', 'deuterium tritium plasma', 'deuterium-tritium-plasma', ['fusion plasma', 'tokamak fuel'], { conductivity: 0.96, heatCapacity: 0.92, opacity: 0.24 }),
    material('material.dna-strand', 'DNA strand', 'dna-strand', ['nucleic acid strand', 'single molecule DNA'], { conductivity: 0.22, viscosity: 0.34, moisture: 0.88 }),
    material('material.steel-electrolyte', 'steel electrolyte interface', 'steel-electrolyte', ['corroding steel in electrolyte'], { conductivity: 0.66, reactionRate: 0.72, moisture: 0.8 }),
    material('material.ceramic-powder', 'ceramic powder', 'ceramic-powder', ['sintering powder', 'additive powder bed'], { hardness: 0.54, heatTransfer: 0.46, porosity: 0.72 }),
    material('material.human-agents', 'human agents', 'human-agents', ['crowd agents', 'pedestrian bodies'], { density: 0.46, signalDelay: 0.32, friction: 0.28 }),
    material('material.steel-arms', 'steel pendulum arms', 'steel-arms', ['pendulum rods', 'rigid steel arms'], { density: 0.78, hardness: 0.74, damping: 0.18 }),
    material('material.attractor-tracer', 'attractor tracer field', 'attractor-tracer', ['phase space tracer', 'chaos ribbon'], { opacity: 0.32, flowVelocity: 0.66, signalDelay: 0.12 }),
    material('material.silicon-logic', 'silicon logic gates', 'silicon-logic', ['logic substrate', 'CMOS gates'], { conductivity: 0.82, signalDelay: 0.18, heatTransfer: 0.42 }),
    material('material.activation-field', 'activation field', 'activation-field', ['tensor activation volume', 'feature field'], { density: 0.36, signalDelay: 0.22, opacity: 0.54 }),
    material('material.uranium-fuel', 'uranium fuel', 'uranium-fuel', ['reactor fuel pellets', 'fissile fuel'], { density: 0.94, heatCapacity: 0.62, reactionRate: 0.78 }),
    material('material.frozen-deuterium', 'frozen deuterium fuel', 'frozen-deuterium', ['fusion ice fuel', 'DT capsule layer'], { density: 0.64, heatCapacity: 0.38, reactionRate: 0.86 }),
    material('material.lipid-particle', 'lipid particle', 'lipid-particle', ['drug carrier', 'lipid nanoparticle'], { diffusionRate: 0.58, moisture: 0.82, reactionRate: 0.34 }),
    material('material.immune-cells', 'immune cells', 'immune-cells', ['T cells', 'macrophages', 'antibody agents'], { populationGrowth: 0.62, reactionRate: 0.74, mobility: 0.48 }),
    material('material.trabecular-bone', 'trabecular bone', 'trabecular-bone', ['porous bone', 'bone lattice'], { hardness: 0.76, porosity: 0.44, bondStrength: 0.72 }),
    material('material.bridge-cable-steel', 'bridge cable steel', 'bridge-cable-steel', ['suspension cable', 'prestressed cable'], { hardness: 0.84, bondStrength: 0.9, damping: 0.22 }),
    material('material.elastomer-bearing', 'elastomer bearing', 'elastomer-bearing', ['seismic rubber bearing', 'base isolator'], { damping: 0.82, strainLimit: 0.68, hardness: 0.24 }),
    material('material.titanium-blades', 'titanium blades', 'titanium-blades', ['fan blades', 'compressor blades'], { hardness: 0.82, heatTransfer: 0.48, density: 0.58 }),
    material('material.battery-copper-stack', 'battery copper stack', 'battery-copper-stack', ['motor windings and cells', 'EV power stack'], { conductivity: 0.9, heatCapacity: 0.58, voltage: 0.78 }),
    material('material.acoustic-air', 'acoustic air', 'acoustic-air', ['concert hall air', 'sound field medium'], { soundFrequency: 0.72, viscosity: 0.08, damping: 0.18 }),
    material('material.violin-string', 'violin string', 'violin-string', ['bowed string', 'tensioned string'], { tension: 0.76, damping: 0.2, soundFrequency: 0.82 }),
    material('material.atmospheric-carbon', 'atmospheric carbon', 'atmospheric-carbon', ['CO2 reservoir', 'carbon pool'], { concentration: 0.58, heatCapacity: 0.5, reactionRate: 0.28 }),
    material('material.nutrient-mist', 'nutrient mist', 'nutrient-mist', ['hydroponic aerosol', 'grow mist'], { moisture: 0.88, concentration: 0.54, diffusionRate: 0.64 }),
    material('material.docking-aluminum', 'docking aluminum', 'docking-aluminum', ['spacecraft docking frame', 'aluminum bus'], { density: 0.38, hardness: 0.62, thermalExpansion: 0.46 }),
    material('material.niobium-film', 'niobium film', 'niobium-film', ['superconducting trace', 'qubit metal'], { conductivity: 0.98, heatCapacity: 0.18, signalDelay: 0.06 }),
    material('material.electron-beam-vacuum', 'electron beam vacuum', 'electron-beam-vacuum', ['microscope column vacuum', 'charged beam medium'], { pressure: 0.02, conductivity: 0.08, opacity: 0.04 }),
    material('material.graphene', 'graphene', 'graphene', ['2D carbon sheet', 'graphene membrane'], { conductivity: 0.94, hardness: 0.7, thickness: 0.02 }),
    material('material.photonic-dielectric', 'photonic dielectric', 'photonic-dielectric', ['dielectric lattice', 'bandgap slab'], { refractiveIndex: 0.84, opacity: 0.18, reflectance: 0.46 }),
    material('material.basalt-melt', 'basalt melt', 'basalt-melt', ['lava', 'molten basalt'], { viscosity: 0.76, heatCapacity: 0.72, temperature: 0.9 }),
    material('material.glacier-ice', 'glacier ice', 'glacier-ice', ['blue ice', 'ice shelf'], { hardness: 0.44, bondStrength: 0.52, heatCapacity: 0.64 }),
    material('material.river-sediment', 'river sediment', 'river-sediment', ['silt water', 'delta sediment'], { particleDensity: 0.68, settlingVelocity: 0.46, viscosity: 0.36 }),
    material('material.turbulent-air', 'turbulent air', 'turbulent-air', ['wake air', 'rotor flow'], { flowVelocity: 0.86, viscosity: 0.08, turbulence: 0.88 }),
    material('material.amine-solvent', 'amine solvent', 'amine-solvent', ['CO2 capture solvent', 'absorber liquid'], { reactionRate: 0.72, viscosity: 0.4, concentration: 0.76 }),
    material('material.polymer-membrane', 'polymer membrane', 'polymer-membrane', ['reverse osmosis film', 'salt rejection membrane'], { permeability: 0.34, pressure: 0.82, selectivity: 0.88 }),
    material('material.quadrotor-composite', 'quadrotor composite', 'quadrotor-composite', ['drone frame', 'carbon quadrotor'], { density: 0.28, hardness: 0.62, batteryState: 0.7 }),
    material('material.silicone-elastomer', 'silicone elastomer', 'silicone-elastomer', ['soft robot silicone', 'pneumatic elastomer'], { strainLimit: 0.86, damping: 0.52, hardness: 0.16 }),
    material('material.neural-tissue', 'neural tissue', 'neural-tissue', ['synaptic tissue', 'neuronal membrane'], { conductivity: 0.38, reactionRate: 0.54, moisture: 0.86 }),
    material('material.kidney-tissue', 'kidney tissue', 'kidney-tissue', ['renal tissue', 'nephron epithelium'], { permeability: 0.62, concentration: 0.58, moisture: 0.9 }),
    material('material.human-contacts', 'human contacts', 'human-contacts', ['contact graph agents', 'social contacts'], { density: 0.58, mobility: 0.54, reactionRate: 0.42 }),
    material('material.grid-copper', 'grid copper', 'grid-copper', ['transmission conductor', 'substation bus'], { conductivity: 0.96, voltage: 0.88, heatTransfer: 0.48 }),
    material('material.adaptive-glass', 'adaptive glass', 'adaptive-glass', ['telescope mirror glass', 'actuated mirror segment'], { reflectance: 0.92, stiffness: 0.76, thermalExpansion: 0.22 }),
    material('material.ionized-air', 'ionized air', 'ionized-air', ['plasma sheath air', 'reentry plasma'], { conductivity: 0.78, temperature: 0.94, opacity: 0.72 }),
    material('material.muon-tracks', 'muon tracks', 'muon-tracks', ['charged particle paths', 'detector tracks'], { conductivity: 0.18, opacity: 0.28, momentum: 0.86 }),
    material('material.ice-boulders', 'ice ring boulders', 'ice-boulders', ['ring particles', 'icy debris'], { density: 0.36, hardness: 0.32, collisionRate: 0.72 }),
    material('material.saltwater-vorticity', 'saltwater vorticity', 'saltwater-vorticity', ['ocean eddy water', 'rotating seawater'], { flowVelocity: 0.78, turbulence: 0.66, salinity: 0.72 }),
    material('material.mangrove-roots', 'mangrove roots', 'mangrove-roots', ['tidal roots', 'coastal root maze'], { permeability: 0.58, roughness: 0.82, damping: 0.7 }),
    material('material.clay-pores', 'clay pores', 'clay-pores', ['porous mound clay', 'ventilation pores'], { permeability: 0.42, moisture: 0.52, heatCapacity: 0.46 }),
    material('material.chitin-wing', 'chitin wing membrane', 'chitin-wing', ['insect wing membrane', 'veined chitin'], { stiffness: 0.56, damping: 0.18, strainLimit: 0.72 }),
    material('material.microbial-colonies', 'microbial colonies', 'microbial-colonies', ['gut microbes', 'microbiome colonies'], { populationGrowth: 0.76, reactionRate: 0.68, diffusionRate: 0.48 }),
    material('material.clear-aqueous-fluid', 'clear aqueous fluid', 'clear-aqueous-fluid', ['aqueous humor', 'eye chamber fluid'], { pressure: 0.52, viscosity: 0.16, refractiveIndex: 0.62 }),
    material('material.chromatin-strands', 'chromatin strands', 'chromatin-strands', ['DNA chromatin', 'replication strands'], { bondStrength: 0.64, reactionRate: 0.58, signalDelay: 0.22 }),
    material('material.proton-gradient', 'proton gradient', 'proton-gradient', ['membrane proton pool', 'bioelectric gradient'], { voltage: 0.74, concentration: 0.82, conductivity: 0.42 }),
    material('material.groundwater-plume', 'groundwater plume', 'groundwater-plume', ['contaminant plume', 'aquifer solute'], { concentration: 0.76, permeability: 0.58, diffusionRate: 0.5 }),
    material('material.train-agents', 'train agents', 'train-agents', ['scheduled trains', 'rail vehicles'], { density: 0.42, signalDelay: 0.34, velocity: 0.64 }),
    material('material.fiber-glass', 'fiber glass cable', 'fiber-glass', ['optical fiber', 'undersea cable glass'], { refractiveIndex: 0.86, attenuation: 0.22, hardness: 0.5 }),
    material('material.server-racks', 'server racks', 'server-racks', ['compute racks', 'edge servers'], { heatTransfer: 0.78, powerDraw: 0.86, airflowResistance: 0.54 }),
    material('material.stainless-powder', 'stainless powder', 'stainless-powder', ['metal powder', 'steel powder bed'], { porosity: 0.62, heatTransfer: 0.54, meltingPoint: 0.84 }),
    material('material.flour-water', 'flour water dough', 'flour-water', ['dough matrix', 'hydrated flour'], { moisture: 0.72, viscosity: 0.66, populationGrowth: 0.58 }),
    material('material.message-packets', 'message packets', 'message-packets', ['social messages', 'belief tokens'], { signalDelay: 0.28, infectivity: 0.64, density: 0.5 }),
    material('material.patient-agents', 'patient agents', 'patient-agents', ['clinic patients', 'triage agents'], { density: 0.5, acuity: 0.66, delay: 0.42 }),
    material('material.building-masses', 'building masses', 'building-masses', ['urban envelopes', 'zoning volumes'], { opacity: 0.82, reflectance: 0.34, height: 0.76 }),
    material('material.belousov-solution', 'Belousov solution', 'belousov-solution', ['oscillating chemical solution', 'chemical clock mix'], { reactionRate: 0.82, diffusionRate: 0.58, opacity: 0.42 }),
    material('material.epoxy-resin', 'epoxy resin', 'epoxy-resin', ['curing resin', 'polymer gel'], { viscosity: 0.72, heatCapacity: 0.5, bondStrength: 0.76 }),
    material('material.nickel-ions', 'nickel ions', 'nickel-ions', ['plating electrolyte', 'metal ions'], { conductivity: 0.78, concentration: 0.66, reactionRate: 0.62 }),
    material('material.pigment-film', 'pigment film', 'pigment-film', ['paint layer', 'varnished pigment'], { opacity: 0.82, diffusionRate: 0.22, brittleness: 0.44 }),
    material('material.crowd-agents', 'crowd agents', 'crowd-agents', ['venue people', 'fan agents'], { density: 0.64, mobility: 0.48, delay: 0.42 }),
    material('material.rider-agents', 'rider agents', 'rider-agents', ['sport motion agents', 'athlete paths'], { velocity: 0.7, friction: 0.38, stability: 0.58 }),
    material('material.radio-dishes', 'radio dishes', 'radio-dishes', ['antenna array dishes', 'baseline receivers'], { reflectance: 0.84, signalDelay: 0.2, aperture: 0.82 }),
    material('material.microwave-signals', 'microwave signals', 'microwave-signals', ['space link carriers', 'radio downlink'], { attenuation: 0.48, frequency: 0.72, signalDelay: 0.7 }),
    material('material.robotic-miners', 'robotic miners', 'robotic-miners', ['low gravity mining robots', 'anchored harvesters'], { mobility: 0.42, batteryState: 0.66, contactForce: 0.58 }),
    material('material.charged-dust', 'charged dust', 'charged-dust', ['electrostatic dust', 'planetary dust grains'], { particleDensity: 0.62, conductivity: 0.2, charge: 0.72 }),
    material('material.ice-shell', 'ice shell', 'ice-shell', ['icy moon shell', 'briny cracked ice'], { hardness: 0.52, heatCapacity: 0.68, bondStrength: 0.58 }),
    material('material.mass-field', 'mass field', 'mass-field', ['gravitational mass map', 'dark matter field'], { density: 0.88, opacity: 0.08, curvature: 0.82 }),
    material('material.allele-agents', 'allele agents', 'allele-agents', ['genetic variants', 'population alleles'], { populationGrowth: 0.54, mobility: 0.34, fitness: 0.62 }),
    material('material.plant-cohorts', 'plant cohorts', 'plant-cohorts', ['succession cohorts', 'vegetation patches'], { populationGrowth: 0.68, moisture: 0.48, density: 0.56 }),
    material('material.animal-agents', 'animal agents', 'animal-agents', ['swarm animals', 'flocking bodies'], { mobility: 0.82, density: 0.5, signalDelay: 0.16 }),
    material('material.soil-nutrients', 'soil nutrients', 'soil-nutrients', ['field nutrient pools', 'agricultural soil chemistry'], { concentration: 0.64, moisture: 0.52, diffusionRate: 0.38 }),
    material('material.organic-waste', 'organic waste', 'organic-waste', ['compost feedstock', 'waste layers'], { moisture: 0.66, heatCapacity: 0.58, reactionRate: 0.72 }),
    material('material.rock-face', 'rock face', 'rock-face', ['tunnel rock', 'excavation face'], { hardness: 0.82, fractureToughness: 0.66, moisture: 0.28 }),
    material('material.hazard-field', 'hazard field', 'hazard-field', ['storm and rupture field', 'hazard plume'], { flowVelocity: 0.86, pressure: 0.72, turbulence: 0.78 }),
    material('material.urban-surfaces', 'urban surfaces', 'urban-surfaces', ['asphalt roofs', 'street canyon surfaces'], { heatCapacity: 0.76, reflectance: 0.28, roughness: 0.58 }),
    material('material.market-agents', 'market agents', 'market-agents', ['household and generator agents', 'policy actors'], { density: 0.48, delay: 0.36, volatility: 0.64 }),
    material('material.network-packets', 'network packets', 'network-packets', ['digital traffic packets', 'transaction messages'], { signalDelay: 0.18, infectivity: 0.52, throughput: 0.74 }),
    material('material.tissue-mesh', 'tissue mesh', 'tissue-mesh', ['surgical tissue model', 'clinical soft tissue'], { strainLimit: 0.66, moisture: 0.82, contactForce: 0.42 }),
    material('material.water-table', 'water table', 'water-table', ['restoration groundwater', 'peat water level'], { pressure: 0.5, moisture: 0.88, permeability: 0.58 }),
    material('material.plasma-ribbon', 'plasma ribbon', 'plasma-ribbon', ['stellarator plasma', 'twisted plasma surface'], { conductivity: 0.94, temperature: 0.9, density: 0.48 }),
  ],
  processes: [
    processDoc('process.heat', 'heat', 'heat_transfer', ['heat_transfer'], ['laser heats', 'thermal drive', 'warms']),
    processDoc('process.reroute', 'reroute', 'network_control', ['network_flow', 'controller_response'], ['reroutes', 'queue rerouting', 'network surge']),
    processDoc('process.crystallize', 'crystallize', 'phase', ['crystallization', 'heat_transfer'], ['crystallizes', 'forms crystals', 'phase locks']),
    processDoc('process.levitate', 'levitate', 'wave_sorting', ['wave_field', 'particle_sorting'], ['levitates', 'standing wave', 'sorts dust']),
    processDoc('process.fracture-film', 'fracture film', 'surface_fracture', ['surface_tension', 'fracture_threshold'], ['bubbles fracture', 'film tears', 'ruptures']),
    processDoc('process.pump-growth', 'pump growth', 'growth_diffusion', ['growth_decay', 'reaction_diffusion'], ['pumps nutrient', 'mycelium waves', 'membrane grows']),
    processDoc('process.sinter', 'sinter', 'thermal_sintering', ['heat_transfer', 'sintering'], ['sinters', 'kiln firing', 'ceramic densifies']),
    processDoc('process.focus-sunlight', 'focus sunlight', 'solar_concentration', ['field_reflection', 'solar_concentration'], ['focuses sunlight', 'concentrates solar light', 'heliostat aim']),
    processDoc('process.warehouse-jam', 'warehouse jam', 'network_congestion', ['network_flow', 'controller_response'], ['robots jam', 'pallet jam', 'logistics blockage']),
    processDoc('process.leak-electrolyte', 'leak electrolyte', 'leak_flow', ['pressure_flow_lite', 'electrochemical_potential'], ['leaking battery', 'electrolyte leak', 'spill flow']),
    processDoc('process.breathe-porous-stack', 'breathe porous stack', 'porous_exchange', ['porous_flow', 'electrochemical_potential'], ['breathes through foam', 'gas exchange', 'porous stack flow']),
    processDoc('process.accretion', 'accretion', 'orbital_accretion', ['fluid-advection', 'particle_sorting', 'heat_transfer'], ['dust accretes', 'spiral inward', 'planet formation']),
    processDoc('process.crustquake', 'crustquake fracture', 'magnetic_fracture', ['fracture_threshold', 'magnetic_field'], ['starquake', 'crust slip', 'magnetar fracture']),
    processDoc('process.atmospheric-convection', 'atmospheric convection', 'convective_flow', ['pressure_flow_lite', 'heat_transfer'], ['rotating updraft', 'storm convection', 'thermal plume']),
    processDoc('process.subduction', 'subduction sinking', 'geologic_subduction', ['pressure_flow_lite', 'heat_transfer', 'fracture_threshold'], ['slab sinks', 'mantle wedge', 'tectonic convergence']),
    processDoc('process.plasma-confinement', 'plasma confinement', 'magnetic_confinement', ['magnetic_field', 'heat_transfer', 'controller_response'], ['tokamak confinement', 'magnetic bottle', 'fusion plasma']),
    processDoc('process.nanopore-translocation', 'nanopore translocation', 'molecular_transport', ['pressure_flow_lite', 'electrochemical_potential', 'diffusion'], ['DNA translocates', 'ionic current', 'single molecule sensing']),
    processDoc('process.cardiac-pumping', 'cardiac pumping', 'biomechanical_pump', ['pressure_flow_lite', 'rigid_collision'], ['heart valve pumps', 'blood flow vortex', 'leaflet closure']),
    processDoc('process.electrochemical-corrosion', 'electrochemical corrosion', 'corrosion_cell', ['electrochemical_potential', 'diffusion'], ['pitting corrosion', 'anode cathode', 'rust front']),
    processDoc('process.powder-bed-sintering', 'powder bed sintering', 'laser_sintering', ['heat_transfer', 'sintering', 'phase_change'], ['laser sinters powder', 'melt pool', 'additive layer']),
    processDoc('process.crowd-queueing', 'crowd queueing', 'agent_queueing', ['network_flow', 'controller_response'], ['platform queue', 'crowd bottleneck', 'service rate']),
    processDoc('process.chaotic-swing', 'chaotic swing', 'chaotic_dynamics', ['chaotic_dynamics', 'modal_vibration'], ['double pendulum swing', 'sensitive initial conditions', 'phase lobe crossing']),
    processDoc('process.attractor-advection', 'attractor advection', 'attractor_flow', ['attractor_flow', 'convective_flow'], ['Lorenz attractor', 'strange attractor flow', 'chaotic trajectory']),
    processDoc('process.logic-propagation', 'logic propagation', 'logic_propagation', ['logic_propagation', 'controller_response'], ['gate delay', 'boolean propagation', 'signal through circuit']),
    processDoc('process.activation-transport', 'activation transport', 'activation_transport', ['activation_transport', 'tensor_flow'], ['activation diffusion', 'feature propagation', 'tensor volume flow']),
    processDoc('process.neutron-transport', 'neutron transport', 'neutron_transport', ['neutron_transport', 'heat_transfer'], ['neutron flux', 'moderation', 'control rod absorption']),
    processDoc('process.implosion-compression', 'implosion compression', 'implosion_compression', ['implosion_compression', 'radiation_transport', 'heat_transfer'], ['fusion implosion', 'capsule compression', 'laser drive symmetry']),
    processDoc('process.pharmacokinetic-transport', 'pharmacokinetic transport', 'pharmacokinetic_transport', ['pharmacokinetic_transport', 'diffusion'], ['dose response', 'drug diffusion', 'bloodstream uptake']),
    processDoc('process.immune-binding', 'immune binding', 'immune_binding', ['immune_binding', 'reaction_diffusion'], ['antibody binding', 'cytokine cascade', 'immune recognition']),
    processDoc('process.bone-turnover', 'bone turnover', 'bone_remodeling', ['bone_remodeling', 'fracture_threshold'], ['osteoblast growth', 'osteoclast resorption', 'load remodeling']),
    processDoc('process.cable-load-transfer', 'cable load transfer', 'cable_load_transfer', ['cable_load_transfer', 'modal_vibration'], ['deck load transfer', 'suspension cable tension', 'bridge oscillation']),
    processDoc('process.seismic-isolation', 'seismic isolation', 'seismic_isolation', ['seismic_isolation', 'modal_vibration'], ['base isolation', 'earthquake damping', 'bearing displacement']),
    processDoc('process.compressor-flow', 'compressor flow', 'compressor_flow', ['compressor_flow', 'heat_transfer'], ['fan compression', 'blade stall', 'pressure ratio rise']),
    processDoc('process.drivetrain-torque', 'drivetrain torque', 'drivetrain_torque', ['drivetrain_torque', 'electrochemical_potential'], ['motor torque', 'inverter current', 'wheel slip control']),
    processDoc('process.acoustic-reverberation', 'acoustic reverberation', 'acoustic_ray_field', ['acoustic_ray_field', 'wave_field'], ['hall reverb', 'early reflections', 'sound ray field']),
    processDoc('process.modal-string-resonance', 'modal string resonance', 'modal_vibration', ['modal_vibration', 'wave_field'], ['standing string mode', 'bowed resonance', 'harmonic mode']),
    processDoc('process.carbon-exchange', 'carbon exchange', 'climate_exchange', ['climate_exchange', 'heat_transfer'], ['carbon flux', 'ocean atmosphere exchange', 'climate feedback']),
    processDoc('process.canopy-transpiration', 'canopy transpiration', 'canopy_transpiration', ['canopy_transpiration', 'reaction_diffusion'], ['stomatal flux', 'nutrient mist uptake', 'plant water exchange']),
    processDoc('process.docking-control', 'docking control', 'attitude_control', ['attitude_control', 'controller_response'], ['rendezvous alignment', 'reaction wheel correction', 'docking port capture']),
    processDoc('process.josephson-oscillation', 'Josephson oscillation', 'quantum_coherence', ['quantum_coherence', 'controller_response'], ['qubit phase', 'microwave pulse', 'Josephson junction oscillation']),
    processDoc('process.charged-particle-focusing', 'charged particle focusing', 'charged_particle_optics', ['charged_particle_optics', 'magnetic_field'], ['electron beam focus', 'lens stack', 'charged particle optics']),
    processDoc('process.strain-wrinkling', 'strain wrinkling', 'strain_field', ['strain_field', 'surface_tension'], ['graphene wrinkle', '2D strain field', 'membrane ripple']),
    processDoc('process.bandgap-guidance', 'bandgap guidance', 'photonic_bandgap', ['photonic_bandgap', 'wave_field'], ['photonic bandgap', 'defect waveguide', 'dielectric lattice guidance']),
    processDoc('process.viscous-advection', 'viscous advection', 'viscous_advection', ['viscous_advection', 'heat_transfer'], ['lava flow', 'molten basalt advection', 'cooling crust']),
    processDoc('process.ice-fracture', 'ice fracture', 'ice_fracture', ['ice_fracture', 'fracture_threshold'], ['crevasse opening', 'ice crack growth', 'glacier fracture']),
    processDoc('process.sediment-transport', 'sediment transport', 'sediment_transport', ['sediment_transport', 'pressure_flow_lite'], ['delta deposition', 'silt plume', 'bed load transport']),
    processDoc('process.wake-shedding', 'wake shedding', 'wake_shedding', ['wake_shedding', 'pressure_flow_lite'], ['turbine wake', 'tip vortex shedding', 'velocity deficit']),
    processDoc('process.gas-absorption', 'gas absorption', 'gas_absorption', ['gas_absorption', 'diffusion'], ['CO2 absorption', 'amine solvent loading', 'packed bed mass transfer']),
    processDoc('process.membrane-osmosis', 'membrane osmosis', 'membrane_transport', ['membrane_transport', 'pressure_flow_lite'], ['reverse osmosis', 'salt rejection', 'permeate flow']),
    processDoc('process.swarm-consensus', 'swarm consensus', 'swarm_consensus', ['swarm_consensus', 'controller_response'], ['formation consensus', 'local graph control', 'collision avoidance']),
    processDoc('process.soft-actuation', 'soft actuation', 'soft_actuation', ['soft_actuation', 'pressure_flow_lite'], ['pneumatic bending', 'compliant grasp', 'elastomer chamber pressure']),
    processDoc('process.synaptic-transmission', 'synaptic transmission', 'synaptic_transmission', ['synaptic_transmission', 'electrochemical_potential'], ['spike crosses synapse', 'vesicle release', 'receptor gating']),
    processDoc('process.selective-filtration', 'selective filtration', 'selective_filtration', ['selective_filtration', 'membrane_transport'], ['nephron filtration', 'ion reabsorption', 'osmotic gradient']),
    processDoc('process.epidemic-spread', 'epidemic spread', 'epidemic_spread', ['epidemic_spread', 'network_flow'], ['infection spread', 'contact graph transmission', 'exposure cascade']),
    processDoc('process.grid-load-flow', 'grid load flow', 'grid_load_flow', ['grid_load_flow', 'controller_response'], ['frequency drift', 'substation load balance', 'grid islanding']),
    processDoc('process.wavefront-correction', 'wavefront correction', 'wavefront_correction', ['wavefront_correction', 'controller_response'], ['adaptive mirror correction', 'phase residual', 'guide star feedback']),
    processDoc('process.shock-ionization', 'shock ionization', 'shock_ionization', ['shock_ionization', 'heat_transfer'], ['reentry plasma sheath', 'bow shock ionization', 'capsule blackout']),
    processDoc('process.particle-cascade', 'particle cascade', 'particle_cascade', ['particle_cascade', 'charged_particle_optics'], ['collision plume', 'secondary particle shower', 'detector track cascade']),
    processDoc('process.orbital-resonance', 'orbital resonance', 'orbital_resonance', ['orbital_resonance', 'particle_sorting'], ['shepherd resonance', 'density wave', 'ring gap formation']),
    processDoc('process.vortex-transport', 'vortex transport', 'vortex_transport', ['vortex_transport', 'pressure_flow_lite'], ['eddy circulation', 'vorticity transport', 'nutrient upwelling']),
    processDoc('process.flood-attenuation', 'flood attenuation', 'flood_attenuation', ['flood_attenuation', 'sediment_transport'], ['storm surge buffering', 'tidal flood damping', 'root roughness attenuation']),
    processDoc('process.vortex-lift', 'vortex lift', 'vortex_lift', ['vortex_lift', 'wake_shedding'], ['leading edge vortex', 'unsteady lift', 'wing stroke vortex']),
    processDoc('process.metabolite-exchange', 'metabolite exchange', 'metabolite_exchange', ['metabolite_exchange', 'reaction_diffusion'], ['microbial metabolite flow', 'mucus diffusion', 'colony exchange']),
    processDoc('process.orbital-fiber-routing', 'fiber signal routing', 'fiber_signal_routing', ['field_refraction', 'network_flow'], ['optical signal attenuation', 'repeater routing', 'fiber channel loss']),
    processDoc('process.thermal-recirculation', 'thermal recirculation', 'thermal_recirculation', ['heat_transfer', 'controller_response'], ['hot aisle recirculation', 'server cooling loop', 'rack airflow feedback']),
    processDoc('process.belief-cascade', 'belief cascade', 'belief_cascade', ['epidemic_spread', 'network_flow'], ['message cascade', 'belief spread', 'correction pulse']),
    processDoc('process.chemical-oscillation', 'chemical oscillation', 'chemical_oscillation', ['chemical_oscillation', 'reaction_diffusion'], ['chemical clock bands', 'oscillating reaction', 'concentration wave']),
    processDoc('process.crosslinking-cure', 'crosslinking cure', 'crosslinking_cure', ['crosslinking_cure', 'heat_transfer'], ['polymer crosslinks', 'gel front advances', 'resin cures']),
    processDoc('process.electrochemical-deposition', 'electrochemical deposition', 'electrochemical_deposition', ['electrochemical_deposition', 'electrochemical_potential'], ['metal ions plate', 'cathode deposition', 'coating thickness grows']),
    processDoc('process.cultural-decay', 'cultural decay', 'cultural_decay', ['cultural_decay', 'diffusion'], ['paint oxidizes', 'paper buffers humidity', 'varnish ages']),
    processDoc('process.crowd-acoustic-flow', 'crowd acoustic flow', 'crowd_acoustic_flow', ['crowd_acoustic_flow', 'agent_queueing'], ['crowd moves through sound fields', 'egress wave', 'venue queue']),
    processDoc('process.recreational-motion', 'recreational motion', 'recreational_motion', ['recreational_motion', 'rigid_collision'], ['rider trajectory', 'edge carving', 'wave riding']),
    processDoc('process.beamforming-control', 'beamforming control', 'beamforming_control', ['beamforming_control', 'wave_field'], ['radio dishes phase align', 'baseline calibrates', 'beam lobe steers']),
    processDoc('process.deep-space-link', 'deep space link', 'deep_space_link', ['deep_space_link', 'network_flow'], ['microwave downlink', 'link budget closes', 'probe signal routes']),
    processDoc('process.low-gravity-sorting', 'low gravity sorting', 'low_gravity_sorting', ['low_gravity_sorting', 'particle_sorting'], ['robot miners sort rubble', 'ore grade separates', 'dust lofts']),
    processDoc('process.planetary-surface-transport', 'planetary surface transport', 'planetary_surface_transport', ['planetary_surface_transport', 'pressure_flow_lite'], ['dust lifts', 'methane river flows', 'cloud balloon drifts']),
    processDoc('process.electrostatic-transport', 'electrostatic transport', 'electrostatic_transport', ['electrostatic_transport', 'electrochemical_potential'], ['charged dust lifts', 'electric field moves particles', 'surface charge sorts grains']),
    processDoc('process.tidal-ice-flexing', 'tidal ice flexing', 'tidal_ice_flexing', ['tidal_ice_flexing', 'ice_fracture'], ['ice shell flexes', 'cracks open', 'tidal heat cycles']),
    processDoc('process.gravitational-lensing', 'gravitational lensing', 'gravitational_lensing', ['gravitational_lensing', 'field_refraction'], ['mass field shears light', 'lensing arcs form', 'galaxy image distorts']),
    processDoc('process.population-selection', 'population selection', 'population_selection', ['population_selection', 'network_flow'], ['alleles drift', 'selection pressure changes', 'migration shifts frequencies']),
    processDoc('process.ecosystem-succession', 'ecosystem succession', 'ecosystem_succession', ['ecosystem_succession', 'growth_decay'], ['plant cohorts compete', 'habitat recovers', 'shade changes growth']),
    processDoc('process.collective-motion', 'collective motion', 'collective_motion', ['collective_motion', 'swarm_consensus'], ['flock turns', 'fish align', 'animals choose trails']),
    processDoc('process.agriculture-rotation', 'agriculture rotation', 'agriculture_rotation', ['agriculture_rotation', 'canopy_transpiration'], ['nutrients replenish', 'greenhouse vents', 'bioreactor mixes light']),
    processDoc('process.waste-bioreaction', 'waste bioreaction', 'waste_bioreaction', ['waste_bioreaction', 'gas_absorption'], ['compost heats', 'landfill methane collects', 'recycling sorter classifies']),
    processDoc('process.infrastructure-excavation', 'infrastructure excavation', 'infrastructure_excavation', ['infrastructure_excavation', 'fracture_threshold'], ['tunnel face cuts', 'mine air clears', 'rock breaks']),
    processDoc('process.natural-hazard-propagation', 'natural hazard propagation', 'natural_hazard_propagation', ['natural_hazard_propagation', 'convective_flow'], ['rupture propagates', 'tsunami lifts', 'hurricane spins', 'tornado lofts debris']),
    processDoc('process.urban-exposure-field', 'urban exposure field', 'urban_exposure_field', ['urban_exposure_field', 'heat_transfer'], ['heat island stores energy', 'noise propagates', 'light scatters', 'particles disperse']),
    processDoc('process.market-network-flow', 'market network flow', 'market_network_flow', ['market_network_flow', 'agent_queueing'], ['prices pressure parcels', 'power bids clear', 'carbon credits verify']),
    processDoc('process.cyber-attack-spread', 'cyber attack spread', 'cyber_attack_spread', ['cyber_attack_spread', 'network_flow'], ['attack propagates', 'transactions compete', 'query routes through shards']),
    processDoc('process.recommender-feedback', 'recommender feedback', 'recommender_feedback', ['recommender_feedback', 'tensor_flow'], ['preferences drift', 'feedback loop reinforces', 'embedding clusters move']),
    processDoc('process.rehabilitation-control', 'rehabilitation control', 'rehabilitation_control', ['rehabilitation_control', 'controller_response'], ['force feedback guides motion', 'prosthetic grip adapts', 'gait trial learns']),
    processDoc('process.environmental-remediation', 'environmental remediation', 'environmental_remediation', ['environmental_remediation', 'membrane_transport'], ['filter basin nitrifies', 'peat rewets', 'reef attenuates waves']),
    processDoc('process.geologic-isolation', 'geologic isolation', 'geologic_isolation', ['geologic_isolation', 'heat_transfer'], ['canister heat decays', 'repository isolates dose', 'bentonite swells']),
    processDoc('process.stellarator-confinement', 'stellarator confinement', 'stellarator_confinement', ['stellarator_confinement', 'magnetic_confinement'], ['plasma ribbon twists', 'magnetic islands form', 'heat flux maps']),
    processDoc('process.electrolysis-stack', 'electrolysis stack', 'electrolysis_stack', ['electrolysis_stack', 'electrochemical_potential'], ['water splits', 'ions cross membrane', 'hydrogen bubbles leave']),
    processDoc('process.catalyst-reaction', 'catalyst reaction', 'catalyst_reaction', ['catalyst_reaction', 'gas_absorption'], ['ammonia forms', 'gas reacts in bed', 'equilibrium shifts']),
  ],
  relations: [
    relation('relation.field-coupling', 'field couples', 'fieldCoupling', ['magnetic_field', 'field_refraction'], ['magnetizes', 'focuses', 'refracts']),
    relation('relation.queue-routing', 'queue routes', 'networkFeedback', ['network_flow', 'controller_response'], ['reroutes', 'backs up', 'surges']),
    relation('relation.pressure-growth', 'pressure forms', 'phaseFlow', ['pressure_flow_lite', 'crystallization'], ['crystallizes', 'vents', 'pushes']),
    relation('relation.acoustic-sorting', 'acoustic sorts', 'waveParticleCoupling', ['wave_field', 'particle_sorting'], ['levitates', 'traps', 'sorts']),
    relation('relation.surface-rupture', 'surface ruptures', 'surfaceFailure', ['surface_tension', 'fracture_threshold'], ['fractures', 'tears', 'bubbles']),
    relation('relation.bio-pump', 'biofilm pumps', 'growthTransport', ['growth_decay', 'reaction_diffusion'], ['grows', 'diffuses', 'waves']),
    relation('relation.kiln-sintering', 'kiln sinters ceramic', 'thermalMaterialTransform', ['heat_transfer', 'sintering'], ['kiln sinters', 'porcelain densifies', 'ceramic firing']),
    relation('relation.solar-concentration', 'mirror swarm focuses sunlight', 'opticalConcentration', ['field_reflection', 'solar_concentration'], ['mirror swarm focuses', 'sunlight on pond', 'orbital heliostat']),
    relation('relation.warehouse-jam', 'robots jam around pallet', 'networkCongestion', ['network_flow', 'controller_response'], ['robots jam', 'blocked pallet', 'warehouse congestion']),
    relation('relation.electrochemical-breathing', 'battery breathes through porous foam', 'porousElectrochemistry', ['porous_flow', 'electrochemical_potential'], ['breathes through graphite foam', 'molten salt circulates', 'porous electrode exchange']),
    relation('relation.orbital-dust-growth', 'dust accretes around young star', 'orbitalGrowth', ['fluid-advection', 'particle_sorting'], ['accretion disk', 'planet formation', 'dust spiral']),
    relation('relation.magnetic-crust-failure', 'magnetic stress fractures dense crust', 'fieldDrivenFailure', ['magnetic_field', 'fracture_threshold'], ['starquake', 'magnetar crust', 'gamma burst trigger']),
    relation('relation.convective-storm-feedback', 'thermal plume drives rotating storm', 'atmosphericFeedback', ['pressure_flow_lite', 'heat_transfer'], ['supercell updraft', 'storm inflow', 'mesocyclone']),
    relation('relation.geologic-pressure-transform', 'slab pressure drives melt and fracture', 'geologicTransform', ['pressure_flow_lite', 'heat_transfer', 'fracture_threshold'], ['subduction', 'mantle wedge', 'earthquake plane']),
    relation('relation.plasma-field-control', 'magnetic field confines hot plasma', 'fieldConfinement', ['magnetic_field', 'controller_response'], ['tokamak', 'plasma confinement', 'toroidal field']),
    relation('relation.molecular-current-sense', 'molecule motion changes ionic current', 'molecularSensing', ['electrochemical_potential', 'pressure_flow_lite'], ['nanopore', 'DNA translocation', 'ionic channel']),
    relation('relation.valve-flow-coupling', 'flexible valve gates blood vortex', 'biomechanicalCoupling', ['pressure_flow_lite', 'rigid_collision'], ['heart valve', 'leaflet motion', 'blood vortex']),
    relation('relation.microbe-nutrient-coupling', 'nutrient gradient feeds microbial growth', 'growthTransport', ['reaction_diffusion', 'growth_decay'], ['biofilm', 'oxygen gradient', 'microbial mat']),
    relation('relation.electrode-surface-loss', 'electrolyte potential removes metal surface', 'electrochemicalSurfaceLoss', ['electrochemical_potential', 'diffusion'], ['corrosion cell', 'pitting', 'anode cathode']),
    relation('relation.agent-service-bottleneck', 'agent arrivals exceed service capacity', 'queueBottleneck', ['network_flow', 'controller_response'], ['subway platform', 'crowd queue', 'bottleneck']),
    relation('relation.chaos-energy-exchange', 'pendulum energy exchanges through chaotic phase lobes', 'chaoticEnergyExchange', ['chaotic_dynamics', 'modal_vibration'], ['double pendulum', 'phase space', 'energy exchange']),
    relation('relation.logic-delay-cascade', 'logic gates cascade signal delay through a circuit', 'digitalCausality', ['logic_propagation', 'controller_response'], ['boolean circuit', 'gate delay', 'truth table']),
    relation('relation.neutron-heat-feedback', 'neutron flux drives core heat feedback', 'neutronThermalFeedback', ['neutron_transport', 'heat_transfer'], ['reactor core', 'neutron flux', 'control rods']),
    relation('relation.implosion-symmetry', 'laser drive symmetry compresses fusion fuel', 'radiationCompression', ['implosion_compression', 'radiation_transport'], ['fusion pellet', 'capsule compression', 'laser symmetry']),
    relation('relation.drug-dose-gradient', 'drug carrier concentration shapes tissue dose', 'biochemicalTransport', ['pharmacokinetic_transport', 'diffusion'], ['dose response', 'lipid particle', 'tissue uptake']),
    relation('relation.immune-recognition', 'immune agents bind antigens and amplify response', 'immuneNetworkCoupling', ['immune_binding', 'reaction_diffusion'], ['antigen', 'cytokine', 'immune cascade']),
    relation('relation.load-remodeling', 'mechanical load remodels porous bone lattice', 'growthMechanics', ['bone_remodeling', 'fracture_threshold'], ['bone turnover', 'trabecular lattice', 'load adaptation']),
    relation('relation.cable-deck-coupling', 'cables transfer deck loads into modal bridge motion', 'structuralCoupling', ['cable_load_transfer', 'modal_vibration'], ['suspension bridge', 'deck load', 'cable tension']),
    relation('relation.base-isolation-damping', 'elastomer bearings decouple ground motion from structure', 'seismicDamping', ['seismic_isolation', 'modal_vibration'], ['seismic isolator', 'base bearing', 'earthquake damping']),
    relation('relation.compressor-pressure-rise', 'rotor blades raise pressure while heat accumulates', 'rotatingFlowCompression', ['compressor_flow', 'heat_transfer'], ['compressor stage', 'blade stall', 'pressure ratio']),
    relation('relation.drivetrain-power-loop', 'battery current and inverter control set wheel torque', 'electromechanicalLoop', ['drivetrain_torque', 'electrochemical_potential'], ['EV drivetrain', 'motor torque', 'wheel slip']),
    relation('relation.acoustic-reflection-field', 'room geometry shapes reverberant acoustic rays', 'waveBoundaryField', ['acoustic_ray_field', 'wave_field'], ['orchestra hall', 'reflection ray', 'reverb field']),
    relation('relation.string-modal-locking', 'bow force locks string into standing vibration modes', 'modalWaveCoupling', ['modal_vibration', 'wave_field'], ['violin string', 'bow force', 'standing mode']),
    relation('relation.carbon-climate-feedback', 'carbon reservoirs exchange heat trapping mass', 'planetaryFeedback', ['climate_exchange', 'heat_transfer'], ['carbon cycle', 'climate feedback', 'ocean uptake']),
    relation('relation.canopy-water-control', 'stomatal control couples nutrient mist to plant growth', 'controlledEcologyExchange', ['canopy_transpiration', 'reaction_diffusion'], ['vertical farm', 'stomata', 'nutrient mist']),
    relation('relation.orbital-attitude-capture', 'attitude control aligns docking ports before capture', 'orbitalControlCoupling', ['attitude_control', 'controller_response'], ['orbital docking', 'reaction wheel', 'rendezvous']),
    relation('relation.qubit-phase-readout', 'microwave pulses perturb coherent qubit phase', 'quantumControlCoupling', ['quantum_coherence', 'controller_response'], ['qubit', 'Josephson junction', 'phase readout']),
    relation('relation.electron-beam-lens', 'magnetic lenses focus charged particles through vacuum', 'chargedParticleOpticCoupling', ['charged_particle_optics', 'magnetic_field'], ['electron microscope', 'beam focus', 'lens stack']),
    relation('relation.graphene-strain-mobility', 'wrinkle strain redirects charge mobility across graphene', 'nanoSurfaceCoupling', ['strain_field', 'surface_tension'], ['graphene', 'wrinkle', 'strain field']),
    relation('relation.photonic-bandgap-channel', 'dielectric periodicity opens a guided optical bandgap', 'photonicWaveCoupling', ['photonic_bandgap', 'wave_field'], ['photonic crystal', 'bandgap', 'waveguide']),
    relation('relation.lava-cooling-front', 'viscous lava advection thickens cooling crust', 'thermalGeoflow', ['viscous_advection', 'heat_transfer'], ['lava tube', 'basalt melt', 'cooling crust']),
    relation('relation.ice-stress-crevasse', 'tensile stress opens crevasses through glacier ice', 'cryosphereFailure', ['ice_fracture', 'fracture_threshold'], ['glacier', 'crevasse', 'ice stress']),
    relation('relation.delta-sediment-fan', 'river velocity loss deposits sediment into delta lobes', 'sedimentFlowDeposition', ['sediment_transport', 'pressure_flow_lite'], ['river delta', 'silt plume', 'deposition']),
    relation('relation.rotor-wake-array', 'upstream turbine wakes reduce downstream rotor inflow', 'aeroFarmCoupling', ['wake_shedding', 'pressure_flow_lite'], ['wind farm', 'turbine wake', 'velocity deficit']),
    relation('relation.solvent-co2-loading', 'amine solvent absorbs CO2 through packed contact area', 'chemicalSeparation', ['gas_absorption', 'diffusion'], ['carbon capture', 'amine solvent', 'packed column']),
    relation('relation.osmotic-salt-rejection', 'pressure drives water through membrane while salt is rejected', 'membraneSeparation', ['membrane_transport', 'pressure_flow_lite'], ['desalination', 'reverse osmosis', 'salt rejection']),
    relation('relation.swarm-neighbor-consensus', 'local neighbor rules stabilize distributed drone formation', 'distributedControl', ['swarm_consensus', 'controller_response'], ['drone swarm', 'formation control', 'collision avoidance']),
    relation('relation.soft-pressure-grasp', 'internal pressure bends elastomer chambers into compliant contact', 'softActuationCoupling', ['soft_actuation', 'pressure_flow_lite'], ['soft gripper', 'pneumatic chamber', 'contact patch']),
    relation('relation.synapse-chemical-spike', 'vesicle chemistry transmits electrical spike timing', 'bioelectricChemicalCoupling', ['synaptic_transmission', 'electrochemical_potential'], ['synapse', 'spike', 'receptor']),
    relation('relation.nephron-osmotic-filter', 'osmotic gradient filters and reabsorbs solutes through nephron tubules', 'organTransportCoupling', ['selective_filtration', 'membrane_transport'], ['nephron', 'filtration', 'reabsorption']),
    relation('relation.contact-transmission', 'network contacts propagate exposure across agents', 'epidemicNetworkCoupling', ['epidemic_spread', 'network_flow'], ['epidemic graph', 'contact tracing', 'infection cascade']),
    relation('relation.grid-frequency-balance', 'load flow imbalance shifts frequency across grid islands', 'electricalNetworkFeedback', ['grid_load_flow', 'controller_response'], ['grid islanding', 'frequency drift', 'substation load']),
    relation('relation.wavefront-actuator-loop', 'mirror actuators cancel atmospheric phase error', 'opticalControlLoop', ['wavefront_correction', 'controller_response'], ['adaptive optics', 'phase residual', 'guide star']),
    relation('relation.reentry-shock-heating', 'hypersonic shock ionizes air and heats the capsule surface', 'hypersonicThermalCoupling', ['shock_ionization', 'heat_transfer'], ['reentry plasma', 'bow shock', 'heat shield']),
    relation('relation.detector-track-cascade', 'charged collision products leave track cascades through detector layers', 'particleDetectorCoupling', ['particle_cascade', 'charged_particle_optics'], ['collider event', 'muon track', 'collision vertex']),
    relation('relation.shepherd-ring-gap', 'shepherd moon resonance sorts icy ring particles into gaps', 'orbitalGranularCoupling', ['orbital_resonance', 'particle_sorting'], ['planetary rings', 'shepherd moon', 'density wave']),
    relation('relation.eddy-nutrient-bloom', 'ocean vorticity lifts nutrients into ecological growth zones', 'vortexEcologyCoupling', ['vortex_transport', 'climate_exchange'], ['ocean eddy', 'upwelling', 'plankton response']),
    relation('relation.root-flood-damping', 'mangrove root roughness slows storm surge and traps sediment', 'coastalShieldCoupling', ['flood_attenuation', 'sediment_transport'], ['mangrove roots', 'flood buffer', 'sediment capture']),
    relation('relation.insect-vortex-lift', 'flexible wing stroke sustains leading edge vortices for lift', 'unsteadyAeroCoupling', ['vortex_lift', 'wake_shedding'], ['insect wing', 'chitin membrane', 'vortex lift']),
    relation('relation.microbiome-metabolite-loop', 'microbial colonies exchange metabolites across mucus gradients', 'microbialExchangeCoupling', ['metabolite_exchange', 'reaction_diffusion'], ['gut microbiome', 'metabolite exchange', 'mucus gradient']),
    relation('relation.aqueous-pressure-drainage', 'eye chamber pressure drains through selective trabecular mesh', 'biomedicalPressureDrainage', ['pressure_flow_lite', 'selective_filtration'], ['aqueous humor', 'trabecular mesh', 'eye pressure']),
    relation('relation.fiber-repeater-attenuation', 'undersea repeaters restore attenuating optical fiber signals', 'fiberNetworkCoupling', ['field_refraction', 'network_flow'], ['submarine cable', 'signal attenuation', 'repeater route']),
    relation('relation.server-thermal-loop', 'rack heat recirculates between cooling aisles under controller limits', 'thermalComputeControl', ['thermal_recirculation', 'heat_transfer'], ['data center heat', 'server racks', 'cooling aisle']),
    relation('relation.social-correction-cascade', 'belief packets cascade through social edges against correction pulses', 'informationEpidemicCoupling', ['belief_cascade', 'epidemic_spread'], ['misinformation cascade', 'belief spread', 'correction pulse']),
    relation('relation.chemical-clock-wave', 'reaction diffusion creates timed color waves', 'oscillatingChemistryCoupling', ['chemical_oscillation', 'reaction_diffusion'], ['chemical clock', 'concentration wave', 'oscillation']),
    relation('relation.resin-cure-front', 'polymer bonds and heat advance a curing gel front', 'polymerCureCoupling', ['crosslinking_cure', 'heat_transfer'], ['epoxy resin', 'crosslinking', 'gel front']),
    relation('relation.venue-queue-sound', 'crowd density and sound fields reshape venue movement', 'crowdVenueCoupling', ['crowd_acoustic_flow', 'agent_queueing'], ['festival crowd', 'stadium egress', 'restaurant queue']),
    relation('relation.space-link-budget', 'distance and noise limit deep space microwave links', 'spaceNetworkCoupling', ['deep_space_link', 'network_flow'], ['deep space network', 'probe signal', 'link budget']),
    relation('relation.low-gravity-ore-sort', 'robot contacts sort rubble in weak gravity', 'lowGravityResourceCoupling', ['low_gravity_sorting', 'particle_sorting'], ['asteroid mining', 'ore grade', 'dust lofting']),
    relation('relation.mass-field-shear', 'mass field curvature shears background light into arcs', 'relativisticOpticCoupling', ['gravitational_lensing', 'field_refraction'], ['dark matter lens', 'galaxy cluster', 'lensing arc']),
    relation('relation.selection-migration-drift', 'migration and fitness pressure change allele frequencies', 'evolutionaryNetworkCoupling', ['population_selection', 'network_flow'], ['allele drift', 'island population', 'selection']),
    relation('relation.collective-neighbor-motion', 'local neighbor rules produce flocking and schooling motion', 'collectiveMotionCoupling', ['collective_motion', 'swarm_consensus'], ['fish school', 'bird flock', 'pollinator network']),
    relation('relation.hazard-flow-damage', 'fluid and rupture fields propagate hazard damage', 'hazardPropagationCoupling', ['natural_hazard_propagation', 'convective_flow'], ['earthquake', 'tsunami', 'hurricane', 'tornado']),
    relation('relation.digital-risk-feedback', 'network traffic spreads attacks and feedback signals', 'digitalRiskCoupling', ['cyber_attack_spread', 'network_flow'], ['cybersecurity alert', 'blockchain mempool', 'search engine']),
    relation('relation.clinical-force-learning', 'feedback control adapts assistive medical motion', 'clinicalControlCoupling', ['rehabilitation_control', 'controller_response'], ['robot surgery', 'prosthetic hand', 'rehab gait']),
    relation('relation.energy-chemistry-conversion', 'fields and catalysts convert energy carriers through membranes and beds', 'energyChemistryCoupling', ['stellarator_confinement', 'catalyst_reaction'], ['stellarator', 'electrolyzer', 'ammonia synthesis']),
  ],
  operators: [
    operator('operator.magnetic-field', 'magnetic field', 'magnetic_field', ['magnetism', 'fluid'], ['magnetization', 'fieldStrength'], ['magnet', 'magnetism', 'magnetic-core']),
    operator('operator.field-refraction', 'field refraction', 'field_refraction', ['optics', 'field'], ['refractiveIndex', 'irradiance'], ['lens', 'optical-prism', 'optics-bench']),
    operator('operator.field-reflection', 'field reflection', 'field_reflection', ['optics', 'field'], ['reflectance', 'irradiance'], ['mirror', 'optics-bench']),
    operator('operator.heat-transfer', 'heat transfer', 'heat_transfer', ['thermal', 'transport'], ['temperature', 'heatFlux'], ['heat-transfer', 'thermal-source', 'heater']),
    operator('operator.network-flow', 'network flow', 'network_flow', ['network', 'control'], ['backlog', 'throughput', 'signalDelay'], ['graph-network', 'queue-server', 'city-grid', 'traffic-system']),
    operator('operator.controller-response', 'controller response', 'controller_response', ['control', 'feedback'], ['setpoint', 'error', 'response'], ['controller', 'feedback-controller', 'state-machine']),
    operator('operator.pressure-flow', 'pressure flow', 'pressure_flow_lite', ['fluid', 'pressure'], ['pressure', 'flowVelocity'], ['pressure', 'pump', 'pipe', 'moving-fluid']),
    operator('operator.crystallization', 'crystallization', 'crystallization', ['phase', 'thermal'], ['temperature', 'crystalDensity'], ['crystallization', 'crystal-growth', 'nucleation']),
    operator('operator.wave-field', 'wave field', 'wave_field', ['wave', 'acoustic'], ['waveAmplitude', 'frequency'], ['wave-propagation', 'wave-source', 'acoustic-emitter', 'acoustic-propagation']),
    operator('operator.particle-sorting', 'particle sorting', 'particle_sorting', ['particle', 'granular'], ['particleDensity', 'sortingForce'], ['particle-set', 'granular-bed', 'powder-bed']),
    operator('operator.surface-tension', 'surface tension', 'surface_tension', ['surface', 'fluid'], ['curvature', 'filmThickness'], ['surface-tension', 'capillary-action', 'membrane']),
    operator('operator.fracture-threshold', 'fracture threshold', 'fracture_threshold', ['solid', 'fracture'], ['stress', 'damage'], ['fracture-mechanics', 'glass-pane', 'rock-wall']),
    operator('operator.growth-decay', 'growth decay', 'growth_decay', ['biology', 'growth'], ['density', 'nutrient'], ['growth-decay', 'population-field', 'biological-colony', 'mycelium']),
    operator('operator.reaction-diffusion', 'reaction diffusion', 'reaction_diffusion', ['biology', 'reaction', 'diffusion'], ['concentration', 'reactionRate'], ['diffusion', 'chemical-reaction', 'growth-decay']),
    operator('operator.sintering', 'sintering', 'sintering', ['thermal', 'material'], ['temperature', 'bondStrength', 'porosity'], ['heat-transfer', 'phase-change-material', 'ceramic']),
    operator('operator.solar-concentration', 'solar concentration', 'solar_concentration', ['optics', 'thermal'], ['irradiance', 'reflectance'], ['mirror', 'radiation', 'light-source']),
    operator('operator.leak-flow', 'leak flow', 'leak_flow', ['fluid', 'electrical'], ['pressure', 'flowVelocity', 'conductivity'], ['battery-electrolyte', 'moving-fluid']),
    operator('operator.porous-flow', 'porous flow', 'porous_flow', ['fluid', 'material'], ['permeability', 'pressure', 'flowVelocity'], ['porous-filter', 'foam', 'membrane']),
    operator('operator.electrochemical-potential', 'electrochemical potential', 'electrochemical_potential', ['electrical', 'chemical'], ['conductivity', 'voltage'], ['battery-electrolyte', 'battery-circuit']),
    operator('operator.orbital-accretion', 'orbital accretion', 'orbital_accretion', ['astronomy', 'particle', 'thermal'], ['density', 'velocity', 'temperature'], ['particle-set', 'radiation', 'energy-ledger']),
    operator('operator.magnetic-fracture', 'magnetic fracture', 'magnetic_fracture', ['magnetism', 'fracture', 'thermal'], ['stress', 'damage', 'fieldStrength'], ['fracture-mechanics', 'magnetism', 'energy-ledger']),
    operator('operator.convective-flow', 'convective flow', 'convective_flow', ['weather', 'fluid', 'thermal'], ['temperature', 'pressure', 'flowVelocity'], ['moving-fluid', 'thermal-source', 'pressure']),
    operator('operator.geologic-subduction', 'geologic subduction', 'geologic_subduction', ['geology', 'pressure', 'thermal'], ['pressure', 'temperature', 'stress'], ['rock-mass', 'terrain-heightfield', 'heat-transfer']),
    operator('operator.magnetic-confinement', 'magnetic confinement', 'magnetic_confinement', ['plasma', 'magnetism', 'control'], ['fieldStrength', 'temperature', 'density'], ['magnetism', 'plasma-arc', 'feedback-controller']),
    operator('operator.molecular-transport', 'molecular transport', 'molecular_transport', ['biology', 'nano', 'fluid'], ['concentration', 'pressure', 'conductivity'], ['diffusion', 'membrane', 'sensor-array']),
    operator('operator.biomechanical-pump', 'biomechanical pump', 'biomechanical_pump', ['biology', 'fluid', 'mechanical'], ['pressure', 'flowVelocity', 'strain'], ['pump', 'moving-fluid', 'membrane']),
    operator('operator.corrosion-cell', 'corrosion cell', 'corrosion_cell', ['chemistry', 'electric', 'surface'], ['conductivity', 'reactionRate', 'damage'], ['electric-field', 'diffusion', 'fracture-mechanics']),
    operator('operator.laser-sintering', 'laser sintering', 'laser_sintering', ['manufacturing', 'thermal', 'phase'], ['temperature', 'bondStrength', 'porosity'], ['heat-transfer', 'phase-change-material', 'powder-bed']),
    operator('operator.agent-queueing', 'agent queueing', 'agent_queueing', ['crowd', 'queue', 'network'], ['backlog', 'throughput', 'delay'], ['queue-server', 'network-link', 'sensor-array']),
    operator('operator.fluid-advection', 'fluid advection', 'fluid-advection', ['fluid', 'transport'], ['flowVelocity', 'vorticity', 'concentration'], ['moving-fluid', 'fluid-advection', 'vector-field']),
    operator('operator.rigid-collision', 'rigid collision', 'rigid_collision', ['solid', 'mechanical'], ['velocity', 'mass', 'contactForce'], ['collision', 'collision-boundary', 'contact-manifold']),
    operator('operator.queue-service', 'queue service', 'queue_service', ['queue', 'network'], ['arrivalRate', 'serviceRate', 'backlog'], ['queue', 'queue-server', 'event-queue']),
    operator('operator.chaotic-dynamics', 'chaotic dynamics', 'chaotic_dynamics', ['math', 'mechanical', 'energy'], ['angle', 'angularVelocity', 'energy'], ['oscillator', 'vector-field', 'energy-ledger']),
    operator('operator.attractor-flow', 'attractor flow', 'attractor_flow', ['math', 'chaos', 'field'], ['position', 'velocity', 'divergence'], ['vector-field', 'vector-field', 'vector-field']),
    operator('operator.logic-propagation', 'logic propagation', 'logic_propagation', ['computation', 'electrical'], ['gateDelay', 'signalState', 'fanout'], ['state-machine', 'state-machine', 'state-machine']),
    operator('operator.tensor-flow', 'tensor flow', 'tensor_flow', ['computation', 'field'], ['activation', 'gradient', 'weight'], ['matrix-tensor', 'matrix-tensor', 'graph-network']),
    operator('operator.activation-transport', 'activation transport', 'activation_transport', ['computation', 'learning'], ['activation', 'gradient', 'signalDelay'], ['matrix-tensor', 'matrix-tensor', 'sensor-array']),
    operator('operator.neutron-transport', 'neutron transport', 'neutron_transport', ['nuclear', 'thermal'], ['flux', 'absorption', 'temperature'], ['radiation', 'thermal-source', 'energy-ledger']),
    operator('operator.radiation-transport', 'radiation transport', 'radiation_transport', ['radiation', 'thermal'], ['irradiance', 'opacity', 'temperature'], ['radiation', 'light-source', 'thermal-source']),
    operator('operator.implosion-compression', 'implosion compression', 'implosion_compression', ['fusion', 'pressure'], ['pressure', 'density', 'symmetry'], ['pressure', 'plasma-arc', 'energy-ledger']),
    operator('operator.pharmacokinetic-transport', 'pharmacokinetic transport', 'pharmacokinetic_transport', ['biology', 'medical', 'diffusion'], ['concentration', 'clearance', 'dose'], ['diffusion', 'moving-fluid', 'membrane']),
    operator('operator.immune-binding', 'immune binding', 'immune_binding', ['biology', 'reaction', 'network'], ['affinity', 'reactionRate', 'population'], ['chemical-reaction', 'population-field', 'graph-network']),
    operator('operator.bone-remodeling', 'bone remodeling', 'bone_remodeling', ['biology', 'solid', 'growth'], ['strain', 'density', 'damage'], ['growth-decay', 'porous-filter', 'fracture-mechanics']),
    operator('operator.modal-vibration', 'modal vibration', 'modal_vibration', ['wave', 'solid', 'acoustic'], ['frequency', 'amplitude', 'damping'], ['wave-propagation', 'oscillator', 'acoustic-emitter']),
    operator('operator.cable-load-transfer', 'cable load transfer', 'cable_load_transfer', ['solid', 'structure'], ['tension', 'load', 'deflection'], ['spring-constraint', 'bridge-span', 'spring-constraint']),
    operator('operator.seismic-isolation', 'seismic isolation', 'seismic_isolation', ['solid', 'control'], ['damping', 'displacement', 'stiffness'], ['spring-constraint', 'terrain-heightfield', 'feedback-controller']),
    operator('operator.compressor-flow', 'compressor flow', 'compressor_flow', ['fluid', 'aerospace'], ['pressure', 'flowVelocity', 'temperature'], ['moving-fluid', 'turbine', 'pressure']),
    operator('operator.drivetrain-torque', 'drivetrain torque', 'drivetrain_torque', ['vehicle', 'electrical'], ['torque', 'voltage', 'slip'], ['motor', 'wheel', 'battery-circuit']),
    operator('operator.acoustic-ray-field', 'acoustic ray field', 'acoustic_ray_field', ['acoustic', 'wave'], ['soundFrequency', 'reflectance', 'damping'], ['acoustic-emitter', 'wave-propagation', 'acoustic-room']),
    operator('operator.climate-exchange', 'climate exchange', 'climate_exchange', ['climate', 'ecology', 'thermal'], ['concentration', 'temperature', 'flux'], ['atmosphere-chamber', 'moving-fluid', 'energy-ledger']),
    operator('operator.canopy-transpiration', 'canopy transpiration', 'canopy_transpiration', ['biology', 'fluid', 'control'], ['moisture', 'irradiance', 'stomatalConductance'], ['leaf', 'diffusion', 'sensor-array']),
    operator('operator.attitude-control', 'attitude control', 'attitude_control', ['space', 'control'], ['quaternionError', 'angularVelocity', 'torque'], ['vehicle-chassis', 'bearing-friction', 'feedback-controller']),
    operator('operator.quantum-coherence', 'quantum coherence', 'quantum_coherence', ['quantum', 'electrical'], ['phase', 'decoherence', 'driveAmplitude'], ['state-machine', 'wave-propagation', 'sensor-array']),
    operator('operator.charged-particle-optics', 'charged particle optics', 'charged_particle_optics', ['electric', 'magnetism', 'instrument'], ['fieldStrength', 'focusError', 'beamEnergy'], ['electric-field', 'magnetism', 'sensor-array']),
    operator('operator.strain-field', 'strain field', 'strain_field', ['solid', 'surface'], ['strain', 'stress', 'curvature'], ['membrane', 'surface-tension', 'fracture-mechanics']),
    operator('operator.photonic-bandgap', 'photonic bandgap', 'photonic_bandgap', ['optics', 'wave'], ['refractiveIndex', 'frequency', 'phase'], ['optics-bench', 'wave-propagation', 'crystal-lattice']),
    operator('operator.viscous-advection', 'viscous advection', 'viscous_advection', ['fluid', 'thermal'], ['viscosity', 'flowVelocity', 'temperature'], ['moving-fluid', 'heat-transfer', 'terrain-heightfield']),
    operator('operator.ice-fracture', 'ice fracture', 'ice_fracture', ['ice', 'solid'], ['stress', 'damage', 'temperature'], ['fracture-mechanics', 'terrain-heightfield', 'moving-fluid']),
    operator('operator.sediment-transport', 'sediment transport', 'sediment_transport', ['fluid', 'granular'], ['particleDensity', 'flowVelocity', 'settlingVelocity'], ['particle-set', 'moving-fluid', 'terrain-heightfield']),
    operator('operator.wake-shedding', 'wake shedding', 'wake_shedding', ['fluid', 'aerospace'], ['vorticity', 'flowVelocity', 'turbulence'], ['moving-fluid', 'turbine', 'vector-field']),
    operator('operator.gas-absorption', 'gas absorption', 'gas_absorption', ['chemistry', 'diffusion'], ['concentration', 'reactionRate', 'surfaceArea'], ['chemical-reaction', 'diffusion', 'porous-filter']),
    operator('operator.membrane-transport', 'membrane transport', 'membrane_transport', ['fluid', 'diffusion'], ['pressure', 'permeability', 'selectivity'], ['membrane', 'diffusion', 'pressure']),
    operator('operator.swarm-consensus', 'swarm consensus', 'swarm_consensus', ['robotics', 'network', 'control'], ['neighborError', 'velocity', 'separation'], ['graph-network', 'vehicle-traffic', 'sensor-array']),
    operator('operator.soft-actuation', 'soft actuation', 'soft_actuation', ['robotics', 'fluid', 'solid'], ['pressure', 'strain', 'contactForce'], ['membrane', 'pump', 'contact-manifold']),
    operator('operator.synaptic-transmission', 'synaptic transmission', 'synaptic_transmission', ['biology', 'electrical', 'chemical'], ['voltage', 'concentration', 'delay'], ['electric-field', 'chemical-reaction', 'network-link']),
    operator('operator.selective-filtration', 'selective filtration', 'selective_filtration', ['biology', 'fluid', 'diffusion'], ['pressure', 'selectivity', 'concentration'], ['membrane', 'porous-filter', 'moving-fluid']),
    operator('operator.epidemic-spread', 'epidemic spread', 'epidemic_spread', ['network', 'biology', 'agent'], ['contactRate', 'infectivity', 'susceptibility'], ['graph-network', 'population-field', 'queue-server']),
    operator('operator.grid-load-flow', 'grid load flow', 'grid_load_flow', ['electrical', 'network', 'control'], ['voltage', 'frequency', 'load'], ['graph-network', 'electric-field', 'feedback-controller']),
    operator('operator.wavefront-correction', 'wavefront correction', 'wavefront_correction', ['optics', 'control', 'wave'], ['phaseError', 'actuatorStroke', 'irradiance'], ['mirror', 'wave-propagation', 'feedback-controller']),
    operator('operator.shock-ionization', 'shock ionization', 'shock_ionization', ['plasma', 'thermal', 'fluid'], ['temperature', 'pressure', 'conductivity'], ['plasma-arc', 'thermal-source', 'moving-fluid']),
    operator('operator.particle-cascade', 'particle cascade', 'particle_cascade', ['particle', 'instrument'], ['energy', 'momentum', 'branching'], ['particle-set', 'sensor-array', 'vector-field']),
    operator('operator.orbital-resonance', 'orbital resonance', 'orbital_resonance', ['astronomy', 'gravity'], ['orbitalPhase', 'eccentricity', 'density'], ['particle-set', 'particle-set', 'energy-ledger']),
    operator('operator.vortex-transport', 'vortex transport', 'vortex_transport', ['fluid', 'earth'], ['vorticity', 'flowVelocity', 'concentration'], ['vector-field', 'moving-fluid', 'terrain-heightfield']),
    operator('operator.flood-attenuation', 'flood attenuation', 'flood_attenuation', ['fluid', 'ecology'], ['waterLevel', 'roughness', 'sedimentLoad'], ['moving-fluid', 'terrain-heightfield', 'porous-filter']),
    operator('operator.vortex-lift', 'vortex lift', 'vortex_lift', ['fluid', 'mechanical'], ['circulation', 'angleOfAttack', 'lift'], ['wing', 'vector-field', 'moving-fluid']),
    operator('operator.metabolite-exchange', 'metabolite exchange', 'metabolite_exchange', ['biology', 'chemistry'], ['concentration', 'reactionRate', 'diffusionRate'], ['chemical-reaction', 'diffusion', 'population-field']),
    operator('operator.thermal-recirculation', 'thermal recirculation', 'thermal_recirculation', ['thermal', 'control'], ['temperature', 'airflow', 'powerDraw'], ['heat-transfer', 'moving-fluid', 'feedback-controller']),
    operator('operator.belief-cascade', 'belief cascade', 'belief_cascade', ['network', 'agent'], ['infectivity', 'trust', 'correctionRate'], ['graph-network', 'population-field', 'network-link']),
    operator('operator.chemical-oscillation', 'chemical oscillation', 'chemical_oscillation', ['chemistry', 'wave'], ['concentration', 'reactionRate', 'phase'], ['chemical-reaction', 'diffusion-reaction-front', 'vector-field']),
    operator('operator.crosslinking-cure', 'crosslinking cure', 'crosslinking_cure', ['chemistry', 'material'], ['bondStrength', 'temperature', 'viscosity'], ['chemical-reaction', 'heat-transfer', 'phase-change-material']),
    operator('operator.electrochemical-deposition', 'electrochemical deposition', 'electrochemical_deposition', ['electric', 'chemistry'], ['voltage', 'currentDensity', 'thickness'], ['electric-field', 'battery-circuit', 'chemical-reaction']),
    operator('operator.cultural-decay', 'cultural decay', 'cultural_decay', ['material', 'humidity'], ['moisture', 'oxidation', 'brittleness'], ['diffusion', 'heat-transfer', 'membrane']),
    operator('operator.crowd-acoustic-flow', 'crowd acoustic flow', 'crowd_acoustic_flow', ['crowd', 'acoustic'], ['density', 'soundFrequency', 'delay'], ['population-field', 'graph-network', 'wave-propagation']),
    operator('operator.recreational-motion', 'recreational motion', 'recreational_motion', ['mechanical', 'sport'], ['velocity', 'friction', 'stability'], ['vector-field', 'collision', 'moving-fluid']),
    operator('operator.beamforming-control', 'beamforming control', 'beamforming_control', ['wave', 'network'], ['phaseError', 'signalDelay', 'aperture'], ['sensor-array', 'wave-propagation', 'feedback-controller']),
    operator('operator.deep-space-link', 'deep space link', 'deep_space_link', ['space', 'network'], ['attenuation', 'signalDelay', 'frequency'], ['network-link', 'radiation', 'sensor-array']),
    operator('operator.low-gravity-sorting', 'low gravity sorting', 'low_gravity_sorting', ['space', 'granular'], ['particleDensity', 'contactForce', 'escapeVelocity'], ['particle-set', 'vehicle-chassis', 'contact-manifold']),
    operator('operator.planetary-surface-transport', 'planetary surface transport', 'planetary_surface_transport', ['space', 'fluid'], ['flowVelocity', 'particleDensity', 'temperature'], ['terrain-heightfield', 'particle-set', 'moving-fluid']),
    operator('operator.electrostatic-transport', 'electrostatic transport', 'electrostatic_transport', ['electric', 'particle'], ['charge', 'fieldStrength', 'particleDensity'], ['electric-field', 'particle-set', 'vector-field']),
    operator('operator.tidal-ice-flexing', 'tidal ice flexing', 'tidal_ice_flexing', ['ice', 'fracture'], ['stress', 'strain', 'temperature'], ['fracture-mechanics', 'terrain-heightfield', 'moving-fluid']),
    operator('operator.gravitational-lensing', 'gravitational lensing', 'gravitational_lensing', ['astronomy', 'optics'], ['curvature', 'density', 'shear'], ['vector-field', 'radiation', 'optics-bench']),
    operator('operator.population-selection', 'population selection', 'population_selection', ['biology', 'statistics'], ['fitness', 'migration', 'frequency'], ['population-field', 'graph-network', 'state-machine']),
    operator('operator.ecosystem-succession', 'ecosystem succession', 'ecosystem_succession', ['ecology', 'growth'], ['density', 'nutrient', 'shade'], ['population-field', 'terrain-heightfield', 'growth-decay']),
    operator('operator.collective-motion', 'collective motion', 'collective_motion', ['agent', 'motion'], ['alignment', 'separation', 'velocity'], ['population-field', 'vector-field', 'graph-network']),
    operator('operator.agriculture-rotation', 'agriculture rotation', 'agriculture_rotation', ['agriculture', 'soil'], ['nutrient', 'moisture', 'yield'], ['leaf', 'terrain-heightfield', 'diffusion']),
    operator('operator.waste-bioreaction', 'waste bioreaction', 'waste_bioreaction', ['waste', 'biology'], ['temperature', 'reactionRate', 'gasPressure'], ['chemical-reaction', 'heat-transfer', 'porous-filter']),
    operator('operator.infrastructure-excavation', 'infrastructure excavation', 'infrastructure_excavation', ['infrastructure', 'geology'], ['torque', 'damage', 'flowVelocity'], ['terrain-heightfield', 'fracture-mechanics', 'moving-fluid']),
    operator('operator.natural-hazard-propagation', 'natural hazard propagation', 'natural_hazard_propagation', ['earth', 'weather'], ['pressure', 'vorticity', 'damage'], ['moving-fluid', 'terrain-heightfield', 'vector-field']),
    operator('operator.urban-exposure-field', 'urban exposure field', 'urban_exposure_field', ['urban', 'environment'], ['temperature', 'soundFrequency', 'opacity'], ['heat-transfer', 'vector-field', 'sensor-array']),
    operator('operator.market-network-flow', 'market network flow', 'market_network_flow', ['market', 'network'], ['price', 'backlog', 'volatility'], ['graph-network', 'queue-server', 'network-link']),
    operator('operator.cyber-attack-spread', 'cyber attack spread', 'cyber_attack_spread', ['network', 'security'], ['infectivity', 'throughput', 'latency'], ['graph-network', 'network-link', 'state-machine']),
    operator('operator.recommender-feedback', 'recommender feedback', 'recommender_feedback', ['learning', 'network'], ['activation', 'gradient', 'drift'], ['matrix-tensor', 'graph-network', 'state-machine']),
    operator('operator.rehabilitation-control', 'rehabilitation control', 'rehabilitation_control', ['medical', 'control'], ['force', 'error', 'fatigue'], ['sensor-array', 'feedback-controller', 'contact-manifold']),
    operator('operator.environmental-remediation', 'environmental remediation', 'environmental_remediation', ['environment', 'water'], ['concentration', 'permeability', 'flowVelocity'], ['porous-filter', 'moving-fluid', 'chemical-reaction']),
    operator('operator.geologic-isolation', 'geologic isolation', 'geologic_isolation', ['nuclear', 'geology'], ['temperature', 'pressure', 'dose'], ['heat-transfer', 'terrain-heightfield', 'porous-filter']),
    operator('operator.stellarator-confinement', 'stellarator confinement', 'stellarator_confinement', ['plasma', 'magnetism'], ['fieldStrength', 'temperature', 'density'], ['magnetism', 'plasma-arc', 'vector-field']),
    operator('operator.electrolysis-stack', 'electrolysis stack', 'electrolysis_stack', ['energy', 'chemistry'], ['voltage', 'conductivity', 'flowVelocity'], ['battery-circuit', 'membrane', 'moving-fluid']),
    operator('operator.catalyst-reaction', 'catalyst reaction', 'catalyst_reaction', ['chemistry', 'thermal'], ['reactionRate', 'pressure', 'temperature'], ['chemical-reaction', 'porous-filter', 'heat-transfer']),
  ],
  shapes: [
    shape('shape.lens-disc', 'lens disc', 'disc', ['optics', 'surface'], ['lens', 'optics-bench'], ['convex', 'transparent', 'field-shaped']),
    shape('shape.coil-ring', 'coil ring', 'ring', ['magnetism', 'thermal'], ['copper', 'magnetic-core'], ['looped', 'conductive', 'actuator']),
    shape('shape.queue-grid', 'queue grid', 'grid', ['network', 'control'], ['city-grid', 'transit-map', 'graph-network'], ['station nodes', 'routing lines']),
    shape('shape.vent-column', 'vent column', 'column', ['fluid', 'pressure'], ['pipe', 'pressure', 'crystal-growth'], ['plume', 'stratified', 'seafloor']),
    shape('shape.resonator-tube', 'resonator tube', 'tube', ['wave', 'acoustic'], ['acoustic-emitter', 'wave-propagation'], ['standing waves', 'particle traps']),
    shape('shape.film-loop', 'film loop', 'loop', ['surface', 'fracture'], ['surface-tension', 'membrane'], ['thin membrane', 'iridescent boundary']),
    shape('shape.branching-membrane', 'branching membrane', 'branching-network', ['biology', 'diffusion'], ['mycelium', 'membrane', 'growth-decay'], ['hyphae', 'gel channels']),
    shape('shape.kiln-chamber', 'kiln chamber', 'chamber', ['thermal', 'material'], ['heater', 'phase-change-material'], ['ceramic chamber', 'brick shell']),
    shape('shape.mirror-swarm-array', 'mirror swarm array', 'array', ['optics', 'control'], ['mirror', 'light-source'], ['orbiting mirrors', 'heliostat facets']),
    shape('shape.pallet-stack', 'pallet stack', 'stack', ['network', 'electrical'], ['warehouse', 'battery'], ['warehouse pallet', 'blocked stack']),
    shape('shape.porous-cell-stack', 'porous cell stack', 'cell-stack', ['electrical', 'fluid'], ['battery-electrolyte', 'porous-filter'], ['graphite foam stack', 'electrochemical cells']),
    shape('shape.disk-annulus', 'disk annulus', 'annulus', ['astronomy', 'particle'], ['particle-set', 'radiation'], ['accretion ring', 'orbital disk']),
    shape('shape.crust-fault-plane', 'crust fault plane', 'fault-plane', ['fracture', 'magnetism'], ['fracture-mechanics', 'magnetism'], ['dense crust shear plane']),
    shape('shape.rotating-updraft-column', 'rotating updraft column', 'vortex-column', ['weather', 'fluid'], ['moving-fluid', 'pressure'], ['mesocyclone column', 'storm updraft']),
    shape('shape.subduction-wedge', 'subduction wedge', 'wedge-cutaway', ['geology', 'pressure'], ['rock-mass', 'terrain-heightfield'], ['slab wedge', 'mantle wedge']),
    shape('shape.toroidal-plasma', 'toroidal plasma', 'torus', ['plasma', 'magnetism'], ['plasma-arc', 'magnetism'], ['tokamak torus', 'magnetic bottle']),
    shape('shape.nanopore-channel', 'nanopore channel', 'nano-channel', ['nano', 'biology'], ['membrane', 'sensor-array'], ['pore channel', 'ionic constriction']),
    shape('shape.valve-leaflet', 'valve leaflet', 'flexible-leaflet', ['biology', 'fluid'], ['membrane', 'moving-fluid'], ['heart valve leaflet']),
    shape('shape.platform-queue-lane', 'platform queue lane', 'queue-lane', ['urban', 'crowd'], ['queue-server', 'network-link'], ['boarding lane', 'service queue']),
    shape('shape.phase-space-lobes', 'phase space lobes', 'vector-field', ['math', 'chaos'], ['vector-field', 'vector-field'], ['lobes', 'chaotic trajectory']),
    shape('shape.logic-gate-array', 'logic gate array', 'gate-array', ['computation', 'logic'], ['state-machine', 'state-machine'], ['gate grid', 'boolean graph']),
    shape('shape.activation-volume', 'activation volume', 'volume-field', ['computation', 'field'], ['matrix-tensor', 'matrix-tensor'], ['feature volume', 'neural field']),
    shape('shape.reactor-core-stack', 'reactor core stack', 'core-stack', ['nuclear', 'thermal'], ['thermal-source', 'radiation'], ['fuel rods', 'control rod stack']),
    shape('shape.fusion-capsule', 'fusion capsule', 'capsule', ['fusion', 'pressure'], ['plasma-arc', 'pressure'], ['pellet shell', 'implosion capsule']),
    shape('shape.drug-gradient-tissue', 'drug gradient tissue', 'tissue-gradient', ['medical', 'diffusion'], ['diffusion', 'moving-fluid'], ['dose field', 'tissue uptake']),
    shape('shape.immune-contact-graph', 'immune contact graph', 'agent-graph', ['biology', 'network'], ['graph-network', 'chemical-reaction'], ['immune network', 'antigen graph']),
    shape('shape.trabecular-lattice', 'trabecular lattice', 'porous-lattice', ['biology', 'solid'], ['porous-filter', 'fracture-mechanics'], ['bone lattice', 'porous strut field']),
    shape('shape.suspension-span', 'suspension span', 'cable-span', ['structure', 'solid'], ['spring-constraint', 'bridge-span'], ['deck and cable', 'suspension bridge']),
    shape('shape.base-isolator-stack', 'base isolator stack', 'damper-stack', ['structure', 'control'], ['spring-constraint', 'terrain-heightfield'], ['rubber bearing', 'isolator layer']),
    shape('shape.compressor-annulus', 'compressor annulus', 'annulus-blade-row', ['aerospace', 'fluid'], ['turbine', 'moving-fluid'], ['blade row', 'compressor stage']),
    shape('shape.drivetrain-axle-map', 'drivetrain axle map', 'powertrain-map', ['vehicle', 'electrical'], ['motor', 'wheel', 'battery-circuit'], ['torque path', 'motor inverter loop']),
    shape('shape.reverberation-shell', 'reverberation shell', 'acoustic-shell', ['acoustic', 'wave'], ['acoustic-emitter', 'acoustic-room'], ['sound ray shell', 'reflection field']),
    shape('shape.string-mode-ribbon', 'string mode ribbon', 'standing-wave-ribbon', ['acoustic', 'wave'], ['wave-propagation', 'oscillator'], ['harmonic envelope', 'modal ribbon']),
    shape('shape.carbon-reservoir-map', 'carbon reservoir map', 'reservoir-network', ['climate', 'network'], ['atmosphere-chamber', 'moving-fluid'], ['carbon pools', 'climate exchange map']),
    shape('shape.vertical-canopy-stack', 'vertical canopy stack', 'stacked-canopy', ['agriculture', 'biology'], ['leaf', 'diffusion'], ['grow tower', 'leaf shelf stack']),
    shape('shape.docking-frame', 'docking frame', 'orbital-frame', ['space', 'control'], ['vehicle-chassis', 'bearing-friction'], ['rendezvous frame', 'capture ring']),
    shape('shape.qubit-resonator-grid', 'qubit resonator grid', 'circuit-grid', ['quantum', 'electrical'], ['state-machine', 'wave-propagation'], ['qubit islands', 'microwave resonator grid']),
    shape('shape.microscope-lens-column', 'microscope lens column', 'beam-column', ['instrument', 'field'], ['magnetism', 'electric-field'], ['aperture stack', 'electron lens column']),
    shape('shape.graphene-wrinkle-sheet', 'graphene wrinkle sheet', 'nano-sheet', ['nanotech', 'surface'], ['membrane', 'surface-tension'], ['2D wrinkle mesh', 'carbon sheet']),
    shape('shape.photonic-lattice-slab', 'photonic lattice slab', 'periodic-slab', ['optics', 'wave'], ['crystal-lattice', 'wave-propagation'], ['dielectric lattice', 'bandgap channel']),
    shape('shape.lava-tube-channel', 'lava tube channel', 'subsurface-channel', ['geology', 'fluid'], ['terrain-heightfield', 'moving-fluid'], ['basalt channel', 'cave flow tube']),
    shape('shape.crevasse-field', 'crevasse field', 'fracture-field', ['ice', 'fracture'], ['fracture-mechanics', 'terrain-heightfield'], ['ice cracks', 'glacier fracture mesh']),
    shape('shape.delta-distributary-fan', 'delta distributary fan', 'branching-fan', ['earth', 'fluid'], ['terrain-heightfield', 'particle-set'], ['delta lobes', 'sediment fan']),
    shape('shape.turbine-wake-column', 'turbine wake column', 'vortex-wake', ['energy', 'fluid'], ['turbine', 'vector-field'], ['rotor wake', 'tip vortex column']),
    shape('shape.absorber-packed-column', 'absorber packed column', 'packed-column', ['chemistry', 'fluid'], ['porous-filter', 'chemical-reaction'], ['CO2 absorber', 'packed bed column']),
    shape('shape.spiral-membrane-module', 'spiral membrane module', 'spiral-module', ['water', 'membrane'], ['membrane', 'pressure'], ['reverse osmosis spiral', 'membrane envelope']),
    shape('shape.swarm-formation-graph', 'swarm formation graph', 'moving-agent-graph', ['robotics', 'network'], ['graph-network', 'vehicle-traffic'], ['drone formation', 'neighbor graph']),
    shape('shape.soft-gripper-fingers', 'soft gripper fingers', 'compliant-fingers', ['robotics', 'solid'], ['membrane', 'contact-manifold'], ['pneumatic fingers', 'elastomer chambers']),
    shape('shape.synaptic-cleft', 'synaptic cleft', 'micro-gap', ['biology', 'electric'], ['network-link', 'chemical-reaction'], ['neuron cleft', 'vesicle release gap']),
    shape('shape.nephron-loop', 'nephron loop', 'tubule-loop', ['biology', 'fluid'], ['membrane', 'porous-filter'], ['renal tubule', 'loop of Henle']),
    shape('shape.epidemic-contact-network', 'epidemic contact network', 'weighted-agent-network', ['society', 'network'], ['graph-network', 'population-field'], ['contact graph', 'transmission network']),
    shape('shape.grid-island-network', 'grid island network', 'power-network', ['energy', 'electrical'], ['graph-network', 'electric-field'], ['substation islands', 'transmission graph']),
    shape('shape.segmented-mirror-aperture', 'segmented mirror aperture', 'segmented-aperture', ['optics', 'control'], ['mirror', 'feedback-controller'], ['adaptive mirror', 'actuator segment field']),
    shape('shape.reentry-shock-shell', 'reentry shock shell', 'shock-shell', ['space', 'plasma'], ['plasma-arc', 'thermal-source'], ['bow shock', 'plasma sheath']),
    shape('shape.detector-layer-slice', 'detector layer slice', 'instrument-slice', ['particle', 'instrument'], ['sensor-array', 'particle-set'], ['calorimeter slice', 'track chamber']),
    shape('shape.ring-density-wave', 'ring density wave', 'orbital-ring', ['astronomy', 'granular'], ['particle-set', 'particle-set'], ['ring gap', 'shepherded wave']),
    shape('shape.coastal-root-maze', 'coastal root maze', 'root-maze', ['ecology', 'fluid'], ['porous-filter', 'terrain-heightfield'], ['mangrove roots', 'tidal baffle']),
    shape('shape.microbiome-fold', 'microbiome fold', 'intestinal-fold', ['biology', 'diffusion'], ['population-field', 'diffusion'], ['mucus fold', 'colony layer']),
    shape('shape.trabecular-mesh', 'trabecular mesh', 'biological-mesh', ['medical', 'fluid'], ['membrane', 'porous-filter'], ['eye drainage mesh', 'pressure filter']),
    shape('shape.rail-conflict-graph', 'rail conflict graph', 'transport-graph', ['transport', 'network'], ['graph-network', 'queue-server'], ['signal blocks', 'dispatch graph']),
    shape('shape.fiber-seafloor-route', 'fiber seafloor route', 'route-line', ['network', 'ocean'], ['network-link', 'optics-bench'], ['submarine route', 'repeater chain']),
    shape('shape.cooling-aisle-grid', 'cooling aisle grid', 'thermal-grid', ['computation', 'thermal'], ['heat-transfer', 'moving-fluid'], ['hot aisle', 'rack grid']),
    shape('shape.social-belief-basin', 'social belief basin', 'belief-network', ['society', 'network'], ['graph-network', 'population-field'], ['belief cluster', 'correction basin']),
    shape('shape.reaction-dish-wave', 'reaction dish wave', 'dish-field', ['chemistry', 'wave'], ['chemical-reaction', 'diffusion-reaction-front'], ['clock dish', 'concentration bands']),
    shape('shape.venue-flow-graph', 'venue flow graph', 'crowd-venue', ['crowd', 'queue'], ['population-field', 'graph-network'], ['stage field', 'egress concourse']),
    shape('shape.orbital-link-baseline', 'orbital link baseline', 'antenna-baseline', ['space', 'wave'], ['sensor-array', 'network-link'], ['dish array', 'probe link cone']),
    shape('shape.planetary-surface-section', 'planetary surface section', 'planetary-cutaway', ['space', 'terrain'], ['terrain-heightfield', 'particle-set'], ['dust layer', 'ice shell', 'methane delta']),
    shape('shape.ecology-agent-landscape', 'ecology agent landscape', 'agent-landscape', ['ecology', 'agent'], ['population-field', 'terrain-heightfield'], ['cohort patches', 'animal paths']),
    shape('shape.infrastructure-hazard-map', 'infrastructure hazard map', 'hazard-map', ['infrastructure', 'earth'], ['terrain-heightfield', 'vector-field'], ['rupture plane', 'storm path']),
    shape('shape.digital-service-graph', 'digital service graph', 'service-graph', ['network', 'compute'], ['graph-network', 'network-link'], ['service nodes', 'packet paths']),
    shape('shape.clinical-control-field', 'clinical control field', 'clinical-field', ['medical', 'control'], ['sensor-array', 'feedback-controller'], ['force tips', 'gait trials']),
    shape('shape.energy-reactor-stack', 'energy reactor stack', 'energy-stack', ['energy', 'chemistry'], ['plasma-arc', 'battery-circuit'], ['coil cage', 'membrane stack', 'catalyst bed']),
  ],
  scenes: [
    scene('scene.ferrofluid-optics', 'ferrofluid optics bench', 'ferrofluid', ['optic.ferrofluid_lens', 'component.copper_coil'], ['shape.lens-disc', 'shape.coil-ring'], ['optics-bench', 'lens', 'magnet']),
    scene('scene.transit-surge', 'transit surge grid', 'city', ['system.subway_queue_grid'], ['shape.queue-grid'], ['city-grid', 'traffic-system', 'queue-server']),
    scene('scene.brine-crystal-vent', 'brine crystal vent', 'watershed', ['environment.brine_vent'], ['shape.vent-column'], ['brine', 'pressure', 'crystallization']),
    scene('scene.acoustic-dust-sorter', 'acoustic dust sorter', 'acoustic', ['apparatus.acoustic_levitator'], ['shape.resonator-tube'], ['acoustic-emitter', 'particle-set', 'wave-propagation']),
    scene('scene.thin-film-fracture', 'thin film fracture rig', 'thin-film', ['surface.thin_film_loop'], ['shape.film-loop'], ['surface-tension', 'membrane', 'fracture-mechanics']),
    scene('scene.mycelium-gel-pump', 'mycelium gel pump', 'biology', ['biofilm.mycelium_gel'], ['shape.branching-membrane'], ['mycelium', 'growth-decay', 'diffusion']),
    scene('scene.ceramic-kiln-sintering', 'ceramic kiln sintering chamber', 'material-tray', ['apparatus.ceramic_kiln'], ['shape.kiln-chamber'], ['heater', 'phase-change-material', 'fracture-mechanics']),
    scene('scene.orbital-mirror-pond', 'orbiting mirror swarm over algae pond', 'optics', ['orbital.mirror_swarm'], ['shape.mirror-swarm-array'], ['mirror', 'radiation', 'ecology-pond']),
    scene('scene.warehouse-battery-jam', 'warehouse robots around leaking battery pallet', 'city', ['logistics.warehouse_robot_pallet'], ['shape.pallet-stack'], ['warehouse', 'market-queue', 'battery-electrolyte']),
    scene('scene.molten-salt-foam-stack', 'molten salt graphite foam battery stack', 'material-tray', ['electrochem.molten_salt_foam_battery'], ['shape.porous-cell-stack'], ['battery-electrolyte', 'carbon', 'porous-filter']),
    scene('scene.protoplanetary-disk', 'protoplanetary accretion disk', 'astral', ['astro.protoplanetary_dust_disk'], ['shape.disk-annulus'], ['particle-set', 'radiation', 'energy-ledger']),
    scene('scene.neutron-star-crustquake', 'neutron star crustquake cutaway', 'astral', ['astro.neutron_star_crustquake'], ['shape.crust-fault-plane'], ['fracture-mechanics', 'magnetism', 'thermal-source']),
    scene('scene.supercell-updraft', 'supercell rotating updraft', 'storm', ['weather.supercell_rotating_updraft'], ['shape.rotating-updraft-column'], ['moving-fluid', 'pressure', 'thermal-source']),
    scene('scene.subduction-slab', 'subduction slab cutaway', 'terrain-cutaway', ['geology.subduction_slab'], ['shape.subduction-wedge'], ['rock-mass', 'terrain-heightfield', 'heat-transfer']),
    scene('scene.tokamak-confinement', 'tokamak plasma confinement chamber', 'material-tray', ['fusion.tokamak_plasma_confinement'], ['shape.toroidal-plasma'], ['plasma-arc', 'magnetism', 'feedback-controller']),
    scene('scene.nanopore-translocation', 'nanopore molecule sensor', 'microscopy', ['nano.nanopore_dna_translocation'], ['shape.nanopore-channel'], ['membrane', 'sensor-array', 'diffusion']),
    scene('scene.heart-valve-flow', 'heart valve flow cutaway', 'biology', ['bio.heart_valve_blood_flow'], ['shape.valve-leaflet'], ['moving-fluid', 'membrane', 'pressure']),
    scene('scene.subway-platform-queue', 'subway platform queue field', 'city', ['urban.subway_platform_agent_queue'], ['shape.platform-queue-lane'], ['queue-server', 'network-link', 'traffic-system']),
    scene('scene.double-pendulum-chaos', 'double pendulum chaos lab', 'lab', ['math.double_pendulum_chaos'], ['shape.phase-space-lobes'], ['vector-field', 'oscillator', 'energy-ledger']),
    scene('scene.boolean-circuit-propagation', 'boolean circuit propagation board', 'circuit', ['compute.boolean_circuit_propagation'], ['shape.logic-gate-array'], ['state-machine', 'state-machine', 'state-machine']),
    scene('scene.neural-activation-volume', 'neural activation volume explorer', 'compute', ['compute.neural_activation_volume'], ['shape.activation-volume'], ['matrix-tensor', 'matrix-tensor', 'graph-network']),
    scene('scene.nuclear-reactor-core', 'nuclear reactor core cutaway', 'reactor', ['nuclear.reactor_core'], ['shape.reactor-core-stack'], ['radiation', 'thermal-source', 'energy-ledger']),
    scene('scene.inertial-fusion-pellet', 'inertial fusion pellet implosion', 'fusion', ['fusion.inertial_fusion_pellet'], ['shape.fusion-capsule'], ['plasma-arc', 'pressure', 'radiation']),
    scene('scene.pharmacokinetic-delivery', 'pharmacokinetic tissue delivery', 'medical', ['medical.pharmacokinetic_delivery'], ['shape.drug-gradient-tissue'], ['diffusion', 'moving-fluid', 'membrane']),
    scene('scene.immune-cascade', 'immune cascade contact field', 'biology', ['medical.immune_cascade'], ['shape.immune-contact-graph'], ['graph-network', 'chemical-reaction', 'population-field']),
    scene('scene.bone-remodeling', 'trabecular bone remodeling lattice', 'biology', ['medical.bone_remodeling'], ['shape.trabecular-lattice'], ['porous-filter', 'fracture-mechanics', 'growth-decay']),
    scene('scene.suspension-bridge-cable', 'suspension bridge cable dynamics', 'structure', ['structure.suspension_bridge_cable'], ['shape.suspension-span'], ['spring-constraint', 'bridge-span', 'wave-propagation']),
    scene('scene.seismic-isolator', 'seismic base isolator stack', 'structure', ['structure.seismic_isolator'], ['shape.base-isolator-stack'], ['spring-constraint', 'terrain-heightfield', 'feedback-controller']),
    scene('scene.turbofan-compressor', 'turbofan compressor stage', 'aerospace', ['aero.turbofan_compressor'], ['shape.compressor-annulus'], ['turbine', 'moving-fluid', 'pressure']),
    scene('scene.ev-drivetrain', 'electric vehicle drivetrain torque map', 'vehicle', ['vehicle.ev_drivetrain'], ['shape.drivetrain-axle-map'], ['motor', 'wheel', 'battery-circuit']),
    scene('scene.acoustic-hall', 'orchestra hall reverberation field', 'acoustic', ['acoustic.orchestra_hall'], ['shape.reverberation-shell'], ['acoustic-emitter', 'acoustic-room', 'wave-propagation']),
    scene('scene.modal-violin-string', 'violin string modal ribbon', 'acoustic', ['acoustic.violin_string_modal_vibration'], ['shape.string-mode-ribbon'], ['oscillator', 'wave-propagation', 'acoustic-emitter']),
    scene('scene.climate-carbon-cycle', 'climate carbon exchange map', 'planet', ['climate.carbon_cycle'], ['shape.carbon-reservoir-map'], ['atmosphere-chamber', 'moving-fluid', 'energy-ledger']),
    scene('scene.vertical-farm-canopy', 'vertical farm canopy control stack', 'agriculture', ['agriculture.vertical_farm_canopy'], ['shape.vertical-canopy-stack'], ['leaf', 'diffusion', 'sensor-array']),
    scene('scene.orbital-docking', 'orbital docking control frame', 'space', ['space.orbital_docking_control'], ['shape.docking-frame'], ['vehicle-chassis', 'bearing-friction', 'feedback-controller']),
    scene('scene.superconducting-qubit', 'superconducting qubit chip', 'quantum', ['quantum.superconducting_qubit'], ['shape.qubit-resonator-grid'], ['state-machine', 'wave-propagation', 'sensor-array']),
    scene('scene.electron-microscope-column', 'electron microscope lens column', 'instrument', ['instrument.electron_microscope_column'], ['shape.microscope-lens-column'], ['magnetism', 'electric-field', 'sensor-array']),
    scene('scene.graphene-strain-sheet', 'graphene wrinkle strain sheet', 'nanotech', ['nano.graphene_strain_sheet'], ['shape.graphene-wrinkle-sheet'], ['membrane', 'surface-tension', 'electric-field']),
    scene('scene.photonic-crystal', 'photonic crystal bandgap slab', 'optics', ['optic.photonic_crystal_slab'], ['shape.photonic-lattice-slab'], ['crystal-lattice', 'wave-propagation', 'optics-bench']),
    scene('scene.lava-tube-flow', 'lava tube flow cutaway', 'volcano', ['geology.lava_tube_flow'], ['shape.lava-tube-channel'], ['terrain-heightfield', 'moving-fluid', 'heat-transfer']),
    scene('scene.glacier-crevasse', 'glacier crevasse fracture field', 'cryosphere', ['earth.glacier_crevasse_field'], ['shape.crevasse-field'], ['fracture-mechanics', 'terrain-heightfield', 'moving-fluid']),
    scene('scene.river-delta-plume', 'river delta sediment plume', 'coastal', ['earth.river_delta_plume'], ['shape.delta-distributary-fan'], ['terrain-heightfield', 'particle-set', 'moving-fluid']),
    scene('scene.wind-turbine-wake', 'wind turbine wake farm', 'energy', ['energy.wind_turbine_wake'], ['shape.turbine-wake-column'], ['turbine', 'vector-field', 'moving-fluid']),
    scene('scene.carbon-capture-column', 'carbon capture absorber column', 'chemical-plant', ['climate.carbon_capture_column'], ['shape.absorber-packed-column'], ['porous-filter', 'chemical-reaction', 'diffusion']),
    scene('scene.desalination-membrane', 'desalination membrane module', 'water', ['water.desalination_membrane'], ['shape.spiral-membrane-module'], ['membrane', 'pressure', 'diffusion']),
    scene('scene.drone-swarm', 'drone swarm consensus field', 'robotics', ['robotics.drone_swarm_consensus'], ['shape.swarm-formation-graph'], ['graph-network', 'vehicle-traffic', 'sensor-array']),
    scene('scene.soft-robot-gripper', 'soft robot gripper contact', 'robotics', ['robotics.soft_robot_gripper'], ['shape.soft-gripper-fingers'], ['membrane', 'pump', 'contact-manifold']),
    scene('scene.neuron-synapse', 'neuron synapse transmission cleft', 'biology', ['bio.neuron_synapse_transmission'], ['shape.synaptic-cleft'], ['electric-field', 'chemical-reaction', 'network-link']),
    scene('scene.kidney-nephron', 'kidney nephron filtration loop', 'biology', ['bio.kidney_nephron_filtration'], ['shape.nephron-loop'], ['membrane', 'porous-filter', 'moving-fluid']),
    scene('scene.epidemic-contact-graph', 'epidemic contact graph spread', 'society', ['society.epidemic_contact_graph'], ['shape.epidemic-contact-network'], ['graph-network', 'population-field', 'queue-server']),
    scene('scene.power-grid-islanding', 'power grid islanding network', 'energy', ['energy.power_grid_islanding'], ['shape.grid-island-network'], ['graph-network', 'electric-field', 'feedback-controller']),
    scene('scene.adaptive-telescope', 'adaptive telescope segmented mirror', 'astronomy', ['optic.adaptive_telescope_mirror'], ['shape.segmented-mirror-aperture'], ['mirror', 'wave-propagation', 'feedback-controller']),
    scene('scene.reentry-plasma-sheath', 'reentry plasma sheath cutaway', 'space', ['space.reentry_plasma_sheath'], ['shape.reentry-shock-shell'], ['plasma-arc', 'thermal-source', 'moving-fluid']),
    scene('scene.particle-collider-event', 'particle collider detector event', 'instrument', ['physics.particle_collider_event'], ['shape.detector-layer-slice'], ['sensor-array', 'particle-set', 'vector-field']),
    scene('scene.planetary-ring-resonance', 'planetary ring resonance field', 'astral', ['astro.planetary_ring_resonance'], ['shape.ring-density-wave'], ['particle-set', 'particle-set', 'energy-ledger']),
    scene('scene.mangrove-flood-buffer', 'mangrove tidal flood buffer', 'coastal', ['ecology.mangrove_flood_buffer'], ['shape.coastal-root-maze'], ['porous-filter', 'terrain-heightfield', 'moving-fluid']),
    scene('scene.gut-microbiome-exchange', 'gut microbiome exchange fold', 'biology', ['bio.gut_microbiome_exchange'], ['shape.microbiome-fold'], ['population-field', 'chemical-reaction', 'diffusion']),
    scene('scene.eye-aqueous-drainage', 'eye aqueous pressure drainage', 'medical', ['medical.eye_aqueous_drainage'], ['shape.trabecular-mesh'], ['membrane', 'pressure', 'porous-filter']),
    scene('scene.railway-dispatch', 'railway dispatch conflict graph', 'transport', ['logistics.railway_dispatch_conflict_resolution'], ['shape.rail-conflict-graph'], ['graph-network', 'queue-server', 'feedback-controller']),
    scene('scene.submarine-cable-signal', 'submarine cable signal route', 'network', ['network.submarine_cable_signal_attenuation'], ['shape.fiber-seafloor-route'], ['network-link', 'optics-bench', 'sensor-array']),
    scene('scene.edge-data-center-heat', 'edge data center cooling grid', 'compute', ['compute.edge_data_center_heat_recirculation'], ['shape.cooling-aisle-grid'], ['heat-transfer', 'moving-fluid', 'feedback-controller']),
    scene('scene.social-belief-cascade', 'social belief cascade network', 'society', ['society.social_belief_cascade'], ['shape.social-belief-basin'], ['graph-network', 'population-field', 'network-link']),
    scene('scene.chemical-clock', 'chemical clock reaction dish', 'chemistry', ['chem.chemical_clock_reaction'], ['shape.reaction-dish-wave'], ['chemical-reaction', 'diffusion-reaction-front', 'vector-field']),
    scene('scene.crowd-venue-flow', 'crowd venue flow field', 'society', ['society.crowd_venue_flow'], ['shape.venue-flow-graph'], ['population-field', 'graph-network', 'wave-propagation']),
    scene('scene.space-link-array', 'space link and radio array', 'space', ['astro.radio_telescope_beamforming', 'space.deep_space_link_budget'], ['shape.orbital-link-baseline'], ['sensor-array', 'network-link', 'radiation']),
    scene('scene.planetary-surface-transport', 'planetary surface transport section', 'space', ['space.planetary_surface_transport', 'space.europa_tidal_ice_flexing'], ['shape.planetary-surface-section'], ['terrain-heightfield', 'particle-set', 'moving-fluid']),
    scene('scene.ecology-agent-landscape', 'ecology and animal agent landscape', 'ecology', ['ecology.ecosystem_succession_competition', 'bio.collective_animal_motion'], ['shape.ecology-agent-landscape'], ['population-field', 'terrain-heightfield', 'graph-network']),
    scene('scene.infrastructure-hazard-map', 'infrastructure and hazard map', 'earth', ['infrastructure.excavation_underground_safety', 'earth.natural_hazard_propagation'], ['shape.infrastructure-hazard-map'], ['terrain-heightfield', 'vector-field', 'moving-fluid']),
    scene('scene.digital-service-graph', 'digital service graph risk field', 'compute', ['compute.cyber_information_system'], ['shape.digital-service-graph'], ['graph-network', 'network-link', 'matrix-tensor']),
    scene('scene.clinical-control-field', 'clinical control and assistive motion', 'medical', ['medical.assistive_medical_control'], ['shape.clinical-control-field'], ['sensor-array', 'feedback-controller', 'contact-manifold']),
    scene('scene.advanced-energy-chemistry', 'advanced energy chemistry stack', 'energy', ['energy.advanced_energy_chemistry'], ['shape.energy-reactor-stack'], ['plasma-arc', 'battery-circuit', 'chemical-reaction']),
  ],
  synonyms: [
    synonym('synonym.liquid-optic', 'liquid optic', 'optic.ferrofluid_lens', 'concept', ['fluid lens', 'adaptive lens']),
    synonym('synonym.induction-coil', 'induction coil', 'component.copper_coil', 'concept', ['electromagnet coil']),
    synonym('synonym.rerouting-grid', 'rerouting grid', 'system.subway_queue_grid', 'concept', ['transit queue', 'subway queue']),
    synonym('synonym.hydrothermal-vent', 'hydrothermal vent', 'environment.brine_vent', 'concept', ['pressure brine vent']),
    synonym('synonym.standing-wave-sorter', 'standing wave sorter', 'apparatus.acoustic_levitator', 'concept', ['acoustic levitator']),
    synonym('synonym.soap-film-loop', 'soap film loop', 'surface.thin_film_loop', 'concept', ['thin film loop']),
    synonym('synonym.fungal-membrane', 'fungal membrane', 'biofilm.mycelium_gel', 'concept', ['mycelium membrane']),
    synonym('synonym.kiln-sintering', 'kiln sintering', 'apparatus.ceramic_kiln', 'concept', ['kiln', 'sinters', 'cracked porcelain']),
    synonym('synonym.mirror-swarm-sunlight', 'mirror swarm sunlight', 'orbital.mirror_swarm', 'concept', ['orbiting mirror swarm', 'focuses sunlight', 'solar mirror swarm']),
    synonym('synonym.warehouse-robot-jam', 'warehouse robot jam', 'logistics.warehouse_robot_pallet', 'concept', ['robots jam', 'leaking battery pallet', 'warehouse robots']),
    synonym('synonym.molten-salt-graphite-foam', 'molten salt graphite foam', 'electrochem.molten_salt_foam_battery', 'concept', ['molten salt', 'graphite foam', 'foam stack', 'breathes through foam']),
    synonym('synonym.planet-forming-disk', 'planet forming disk', 'astro.protoplanetary_dust_disk', 'concept', ['protoplanetary disk', 'dust accretion', 'young star disk']),
    synonym('synonym.starquake', 'starquake', 'astro.neutron_star_crustquake', 'concept', ['neutron star crustquake', 'magnetar fracture']),
    synonym('synonym.mesocyclone', 'mesocyclone', 'weather.supercell_rotating_updraft', 'concept', ['supercell updraft', 'rotating storm']),
    synonym('synonym.subduction-zone', 'subduction zone', 'geology.subduction_slab', 'concept', ['tectonic slab', 'mantle wedge']),
    synonym('synonym.tokamak', 'tokamak', 'fusion.tokamak_plasma_confinement', 'concept', ['fusion plasma', 'magnetic confinement']),
    synonym('synonym.nanopore', 'nanopore sensor', 'nano.nanopore_dna_translocation', 'concept', ['DNA through pore', 'ionic current sensor']),
    synonym('synonym.heart-valve', 'heart valve flow', 'bio.heart_valve_blood_flow', 'concept', ['blood valve vortex', 'cardiac leaflet']),
    synonym('synonym.platform-crowd', 'platform crowd queue', 'urban.subway_platform_agent_queue', 'concept', ['subway queue', 'boarding bottleneck']),
    synonym('synonym.double-pendulum-chaos', 'double pendulum chaos', 'math.double_pendulum_chaos', 'concept', ['chaotic pendulum', 'phase space pendulum']),
    synonym('synonym.lorenz-attractor-flow', 'Lorenz attractor', 'math.lorenz_attractor_flow', 'concept', ['strange attractor', 'chaotic convection attractor']),
    synonym('synonym.boolean-circuit', 'boolean circuit', 'compute.boolean_circuit_propagation', 'concept', ['logic gates', 'digital circuit propagation']),
    synonym('synonym.neural-activation-volume', 'neural activation volume', 'compute.neural_activation_volume', 'concept', ['activation map', 'feature tensor volume']),
    synonym('synonym.reactor-core', 'reactor core', 'nuclear.reactor_core', 'concept', ['nuclear core', 'control rod reactor']),
    synonym('synonym.fusion-pellet', 'fusion pellet', 'fusion.inertial_fusion_pellet', 'concept', ['inertial confinement pellet', 'laser implosion capsule']),
    synonym('synonym.drug-delivery', 'drug delivery', 'medical.pharmacokinetic_delivery', 'concept', ['dose response', 'lipid nanoparticle transport']),
    synonym('synonym.immune-response', 'immune response', 'medical.immune_cascade', 'concept', ['antigen binding', 'cytokine cascade']),
    synonym('synonym.bone-remodeling', 'bone remodeling', 'medical.bone_remodeling', 'concept', ['trabecular remodeling', 'osteoblast osteoclast balance']),
    synonym('synonym.bridge-cable', 'bridge cable', 'structure.suspension_bridge_cable', 'concept', ['suspension span', 'deck oscillation']),
    synonym('synonym.seismic-isolator', 'seismic isolator', 'structure.seismic_isolator', 'concept', ['base isolation bearing', 'earthquake damper']),
    synonym('synonym.turbofan-compressor', 'turbofan compressor', 'aero.turbofan_compressor', 'concept', ['jet compressor', 'blade stall compressor']),
    synonym('synonym.ev-drivetrain', 'EV drivetrain', 'vehicle.ev_drivetrain', 'concept', ['electric motor inverter', 'torque vector drivetrain']),
    synonym('synonym.orchestra-hall', 'orchestra hall acoustics', 'acoustic.orchestra_hall', 'concept', ['concert hall reverb', 'acoustic ray field']),
    synonym('synonym.violin-string-mode', 'violin string mode', 'acoustic.violin_string_modal_vibration', 'concept', ['bowed string resonance', 'standing string wave']),
    synonym('synonym.carbon-cycle', 'carbon cycle', 'climate.carbon_cycle', 'concept', ['climate feedback', 'ocean atmosphere carbon exchange']),
    synonym('synonym.vertical-farm', 'vertical farm', 'agriculture.vertical_farm_canopy', 'concept', ['hydroponic grow tower', 'nutrient mist canopy']),
    synonym('synonym.orbital-docking', 'orbital docking', 'space.orbital_docking_control', 'concept', ['spacecraft rendezvous', 'docking port alignment']),
    synonym('synonym.superconducting-qubit', 'superconducting qubit', 'quantum.superconducting_qubit', 'concept', ['qubit chip', 'Josephson junction circuit']),
    synonym('synonym.electron-microscope', 'electron microscope column', 'instrument.electron_microscope_column', 'concept', ['electron beam focusing', 'charged particle lens stack']),
    synonym('synonym.graphene-wrinkle', 'graphene wrinkle', 'nano.graphene_strain_sheet', 'concept', ['2D material strain', 'graphene strain sheet']),
    synonym('synonym.photonic-crystal', 'photonic crystal', 'optic.photonic_crystal_slab', 'concept', ['bandgap slab', 'dielectric waveguide lattice']),
    synonym('synonym.lava-tube', 'lava tube', 'geology.lava_tube_flow', 'concept', ['basalt melt channel', 'volcanic tube flow']),
    synonym('synonym.glacier-crevasse', 'glacier crevasse', 'earth.glacier_crevasse_field', 'concept', ['ice fracture field', 'blue ice crack']),
    synonym('synonym.river-delta', 'river delta plume', 'earth.river_delta_plume', 'concept', ['silt deposition fan', 'distributary delta']),
    synonym('synonym.wind-turbine-wake', 'wind turbine wake', 'energy.wind_turbine_wake', 'concept', ['rotor wake', 'wind farm velocity deficit']),
    synonym('synonym.carbon-capture', 'carbon capture column', 'climate.carbon_capture_column', 'concept', ['amine absorber', 'CO2 packed column']),
    synonym('synonym.desalination', 'desalination membrane', 'water.desalination_membrane', 'concept', ['reverse osmosis module', 'salt rejection membrane']),
    synonym('synonym.drone-swarm', 'drone swarm', 'robotics.drone_swarm_consensus', 'concept', ['quadrotor formation', 'swarm consensus']),
    synonym('synonym.soft-gripper', 'soft robot gripper', 'robotics.soft_robot_gripper', 'concept', ['pneumatic soft actuator', 'compliant gripper']),
    synonym('synonym.synapse', 'neuron synapse', 'bio.neuron_synapse_transmission', 'concept', ['spike transmission', 'synaptic cleft']),
    synonym('synonym.nephron', 'kidney nephron', 'bio.kidney_nephron_filtration', 'concept', ['renal filtration loop', 'tubule reabsorption']),
    synonym('synonym.epidemic-graph', 'epidemic contact graph', 'society.epidemic_contact_graph', 'concept', ['infection network', 'contact tracing graph']),
    synonym('synonym.grid-islanding', 'power grid islanding', 'energy.power_grid_islanding', 'concept', ['frequency drift island', 'substation island network']),
    synonym('synonym.adaptive-telescope', 'adaptive telescope', 'optic.adaptive_telescope_mirror', 'concept', ['adaptive optics mirror', 'segmented wavefront correction']),
    synonym('synonym.reentry-plasma', 'reentry plasma sheath', 'space.reentry_plasma_sheath', 'concept', ['capsule blackout plasma', 'hypersonic shock sheath']),
    synonym('synonym.collider-event', 'collider event', 'physics.particle_collider_event', 'concept', ['muon detector tracks', 'collision vertex']),
    synonym('synonym.planetary-rings', 'planetary rings', 'astro.planetary_ring_resonance', 'concept', ['shepherd moon resonance', 'ring density wave']),
    synonym('synonym.ocean-eddy', 'ocean eddy', 'earth.ocean_eddy_upwelling', 'concept', ['mesoscale eddy', 'nutrient upwelling']),
    synonym('synonym.mangrove-buffer', 'mangrove flood buffer', 'ecology.mangrove_flood_buffer', 'concept', ['storm surge roots', 'tidal root maze']),
    synonym('synonym.termite-vent', 'termite ventilation', 'biology.termite_mound_ventilation', 'concept', ['mound chimney', 'colony airflow']),
    synonym('synonym.microbiome-exchange', 'gut microbiome exchange', 'bio.gut_microbiome_exchange', 'concept', ['intestinal metabolite exchange', 'mucus colony flow']),
    synonym('synonym.aquifer-plume', 'aquifer contaminant plume', 'earth.aquifer_contamination_plume', 'concept', ['groundwater contamination', 'porous strata plume']),
    synonym('synonym.rail-dispatch', 'rail dispatch', 'logistics.railway_dispatch_conflict_resolution', 'concept', ['train signal block conflict', 'timetable routing']),
    synonym('synonym.data-center-cooling', 'data center cooling', 'compute.edge_data_center_heat_recirculation', 'concept', ['server rack heat', 'hot aisle recirculation']),
    synonym('synonym.belief-cascade', 'belief cascade', 'society.social_belief_cascade', 'concept', ['misinformation cascade', 'social correction pulse']),
    synonym('synonym.chemical-clock', 'chemical clock', 'chem.chemical_clock_reaction', 'concept', ['Belousov reaction', 'oscillating chemical dish']),
    synonym('synonym.polymer-cure', 'polymer curing', 'material.polymer_curing_crosslink_network', 'concept', ['epoxy crosslinking', 'resin gel front']),
    synonym('synonym.venue-flow', 'venue crowd flow', 'society.crowd_venue_flow', 'concept', ['festival crowd', 'stadium egress', 'restaurant queue']),
    synonym('synonym.deep-space-link', 'deep space link budget', 'space.deep_space_link_budget', 'concept', ['probe downlink', 'microwave space signal']),
    synonym('synonym.planetary-dust', 'planetary dust transport', 'space.planetary_surface_transport', 'concept', ['Mars dust storm', 'Titan methane river', 'Venus balloon']),
    synonym('synonym.population-genetics', 'population genetics', 'bio.population_genetics_selection_drift', 'concept', ['allele drift', 'selection migration']),
    synonym('synonym.collective-motion', 'collective animal motion', 'bio.collective_animal_motion', 'concept', ['fish school', 'bird flock', 'pollinator graph']),
    synonym('synonym.hazard-propagation', 'natural hazard propagation', 'earth.natural_hazard_propagation', 'concept', ['earthquake rupture', 'tsunami generation', 'hurricane eye']),
    synonym('synonym.cyber-system', 'cyber information system', 'compute.cyber_information_system', 'concept', ['cybersecurity alert', 'blockchain mempool', 'search ranking pipeline']),
    synonym('synonym.energy-chemistry', 'advanced energy chemistry', 'energy.advanced_energy_chemistry', 'concept', ['fusion stellarator', 'hydrogen electrolyzer', 'ammonia catalyst bed']),
  ],
  analogs: [
    analog('analog.ferrofluid-lens', 'laser heats ferrofluid lens over copper coil', ['optic.ferrofluid_lens', 'component.copper_coil'], ['magnetic_field', 'field_refraction', 'heat_transfer']),
    analog('analog.subway-surge-grid', 'subway queue grid reroutes after power surge', ['system.subway_queue_grid'], ['network_flow', 'controller_response']),
    analog('analog.brine-vent', 'undersea vent crystallizes pressure brine', ['environment.brine_vent'], ['pressure_flow_lite', 'crystallization', 'heat_transfer']),
    analog('analog.acoustic-dust-levitator', 'acoustic levitator sorts dust in brass tube', ['apparatus.acoustic_levitator'], ['wave_field', 'particle_sorting']),
    analog('analog.thin-film-fracture', 'thin film laser bubbles fracture on wire loop', ['surface.thin_film_loop'], ['surface_tension', 'fracture_threshold', 'field_refraction']),
    analog('analog.mycelium-gel-pump', 'mycelium membrane pumps nutrient gel waves', ['biofilm.mycelium_gel'], ['growth_decay', 'reaction_diffusion', 'wave_field']),
    analog('analog.ceramic-kiln-sintering', 'ceramic kiln sinters cracked porcelain in humid air', ['apparatus.ceramic_kiln'], ['heat_transfer', 'sintering', 'fracture_threshold']),
    analog('analog.orbital-mirror-pond', 'orbiting mirror swarm focuses sunlight on algae pond', ['orbital.mirror_swarm'], ['field_reflection', 'solar_concentration', 'heat_transfer']),
    analog('analog.warehouse-battery-jam', 'warehouse robots jam around a leaking battery pallet', ['logistics.warehouse_robot_pallet'], ['network_flow', 'controller_response', 'leak_flow']),
    analog('analog.molten-salt-foam-battery', 'molten salt battery breathes through a graphite foam stack', ['electrochem.molten_salt_foam_battery'], ['electrochemical_potential', 'porous_flow', 'heat_transfer']),
    analog('analog.protoplanetary-disk', 'silicate dust accretes around a young star disk', ['astro.protoplanetary_dust_disk'], ['orbital_accretion', 'fluid-advection', 'heat_transfer']),
    analog('analog.neutron-star-crustquake', 'magnetic stress fractures an iron neutron star crust', ['astro.neutron_star_crustquake'], ['magnetic_fracture', 'fracture_threshold', 'magnetic_field']),
    analog('analog.supercell-updraft', 'humid air convects inside a rotating supercell updraft', ['weather.supercell_rotating_updraft'], ['convective_flow', 'pressure_flow_lite', 'heat_transfer']),
    analog('analog.subduction-slab', 'basalt slab sinks under continental crust and heats the mantle wedge', ['geology.subduction_slab'], ['geologic_subduction', 'pressure_flow_lite', 'heat_transfer']),
    analog('analog.tokamak-plasma', 'deuterium tritium plasma is confined inside a toroidal magnetic bottle', ['fusion.tokamak_plasma_confinement'], ['magnetic_confinement', 'magnetic_field', 'controller_response']),
    analog('analog.nanopore-dna', 'DNA strand translocates through a charged nanopore channel', ['nano.nanopore_dna_translocation'], ['molecular_transport', 'electrochemical_potential', 'diffusion']),
    analog('analog.heart-valve-flow', 'blood pumps through flexible heart valve leaflets', ['bio.heart_valve_blood_flow'], ['biomechanical_pump', 'pressure_flow_lite', 'rigid_collision']),
    analog('analog.corrosion-cell', 'steel electrolyte corrodes across an anode cathode surface', ['chem.steel_electrolyte_corrosion_cell'], ['corrosion_cell', 'electrochemical_potential', 'diffusion']),
    analog('analog.powder-bed-sintering', 'ceramic powder sinters under a laser scan path', ['manufacturing.ceramic_powder_bed'], ['laser_sintering', 'heat_transfer', 'sintering']),
    analog('analog.subway-platform-queue', 'human agents queue at a subway platform edge during train boarding', ['urban.subway_platform_agent_queue'], ['agent_queueing', 'network_flow', 'controller_response']),
    analog('analog.double-pendulum-chaos', 'steel arms exchange energy through chaotic double pendulum phase lobes', ['math.double_pendulum_chaos'], ['chaotic_dynamics', 'modal_vibration']),
    analog('analog.lorenz-attractor-flow', 'a traced Lorenz field advects through a strange attractor', ['math.lorenz_attractor_flow'], ['attractor_flow', 'convective_flow']),
    analog('analog.boolean-circuit-propagation', 'boolean logic gates propagate delayed signals through a circuit graph', ['compute.boolean_circuit_propagation'], ['logic_propagation', 'controller_response']),
    analog('analog.neural-activation-volume', 'neural activations move through a tensor volume with gradient flow', ['compute.neural_activation_volume'], ['activation_transport', 'tensor_flow']),
    analog('analog.nuclear-reactor-core', 'uranium fuel rods exchange neutron flux and heat under control rods', ['nuclear.reactor_core'], ['neutron_transport', 'heat_transfer', 'controller_response']),
    analog('analog.inertial-fusion-pellet', 'laser radiation compresses a frozen deuterium capsule into an imploding fusion pellet', ['fusion.inertial_fusion_pellet'], ['implosion_compression', 'radiation_transport', 'heat_transfer']),
    analog('analog.pharmacokinetic-delivery', 'lipid particles diffuse drug dose through tissue concentration gradients', ['medical.pharmacokinetic_delivery'], ['pharmacokinetic_transport', 'diffusion']),
    analog('analog.immune-cascade', 'immune cells bind antigens and amplify a cytokine reaction network', ['medical.immune_cascade'], ['immune_binding', 'reaction_diffusion']),
    analog('analog.bone-remodeling', 'trabecular bone remodels density in response to mechanical strain', ['medical.bone_remodeling'], ['bone_remodeling', 'fracture_threshold']),
    analog('analog.suspension-bridge-cable', 'bridge cable tension transfers deck load into modal vibration', ['structure.suspension_bridge_cable'], ['cable_load_transfer', 'modal_vibration']),
    analog('analog.seismic-isolator', 'elastomer bearings isolate a structure from earthquake base motion', ['structure.seismic_isolator'], ['seismic_isolation', 'modal_vibration']),
    analog('analog.turbofan-compressor', 'titanium compressor blades raise air pressure while heat builds through the stage', ['aero.turbofan_compressor'], ['compressor_flow', 'heat_transfer']),
    analog('analog.ev-drivetrain', 'battery current and inverter control drive wheel torque through an electric drivetrain', ['vehicle.ev_drivetrain'], ['drivetrain_torque', 'electrochemical_potential', 'controller_response']),
    analog('analog.acoustic-hall', 'orchestra hall boundaries reflect acoustic rays into a reverberant sound field', ['acoustic.orchestra_hall'], ['acoustic_ray_field', 'wave_field']),
    analog('analog.modal-violin-string', 'bowed violin string tension locks into modal standing waves', ['acoustic.violin_string_modal_vibration'], ['modal_vibration', 'wave_field']),
    analog('analog.climate-carbon-cycle', 'atmospheric carbon exchanges between ocean and air as a climate feedback loop', ['climate.carbon_cycle'], ['climate_exchange', 'heat_transfer']),
    analog('analog.vertical-farm-canopy', 'nutrient mist and stomatal transpiration regulate a vertical farm canopy', ['agriculture.vertical_farm_canopy'], ['canopy_transpiration', 'reaction_diffusion', 'controller_response']),
    analog('analog.orbital-docking', 'spacecraft attitude control aligns docking frames before capture', ['space.orbital_docking_control'], ['attitude_control', 'controller_response']),
    analog('analog.superconducting-qubit', 'niobium Josephson junctions preserve qubit phase under microwave control', ['quantum.superconducting_qubit'], ['quantum_coherence', 'controller_response']),
    analog('analog.electron-microscope-column', 'charged particles focus through a magnetic microscope lens column', ['instrument.electron_microscope_column'], ['charged_particle_optics', 'magnetic_field']),
    analog('analog.graphene-strain-sheet', 'graphene wrinkles redirect strain and charge mobility across a nano sheet', ['nano.graphene_strain_sheet'], ['strain_field', 'surface_tension']),
    analog('analog.photonic-crystal', 'dielectric lattice periodicity guides light through a photonic bandgap channel', ['optic.photonic_crystal_slab'], ['photonic_bandgap', 'wave_field']),
    analog('analog.lava-tube-flow', 'basalt melt advects through a lava tube while the crust cools', ['geology.lava_tube_flow'], ['viscous_advection', 'heat_transfer']),
    analog('analog.glacier-crevasse', 'tensile stress opens fracture fields across glacier ice', ['earth.glacier_crevasse_field'], ['ice_fracture', 'fracture_threshold']),
    analog('analog.river-delta-plume', 'river sediment deposits into distributary delta plumes as flow velocity falls', ['earth.river_delta_plume'], ['sediment_transport', 'pressure_flow_lite']),
    analog('analog.wind-turbine-wake', 'turbine rotors shed helical wakes that reduce downstream inflow', ['energy.wind_turbine_wake'], ['wake_shedding', 'pressure_flow_lite']),
    analog('analog.carbon-capture-column', 'amine solvent absorbs carbon dioxide through a packed capture column', ['climate.carbon_capture_column'], ['gas_absorption', 'diffusion']),
    analog('analog.desalination-membrane', 'pressure drives water across a selective membrane while salt is rejected', ['water.desalination_membrane'], ['membrane_transport', 'pressure_flow_lite']),
    analog('analog.drone-swarm', 'neighbor consensus keeps a drone swarm in formation while avoiding collisions', ['robotics.drone_swarm_consensus'], ['swarm_consensus', 'controller_response']),
    analog('analog.soft-robot-gripper', 'pneumatic pressure bends silicone chambers into compliant grasp contact', ['robotics.soft_robot_gripper'], ['soft_actuation', 'pressure_flow_lite']),
    analog('analog.neuron-synapse', 'vesicle chemistry transmits spike timing across a synaptic cleft', ['bio.neuron_synapse_transmission'], ['synaptic_transmission', 'electrochemical_potential']),
    analog('analog.kidney-nephron', 'nephron tubules filter blood and reabsorb solutes across membranes', ['bio.kidney_nephron_filtration'], ['selective_filtration', 'membrane_transport']),
    analog('analog.epidemic-contact-graph', 'infection exposure spreads through weighted human contact networks', ['society.epidemic_contact_graph'], ['epidemic_spread', 'network_flow']),
    analog('analog.power-grid-islanding', 'load flow imbalance splits a power grid into frequency drifting islands', ['energy.power_grid_islanding'], ['grid_load_flow', 'controller_response']),
    analog('analog.adaptive-telescope', 'segmented mirror actuators correct wavefront phase error from a guide star', ['optic.adaptive_telescope_mirror'], ['wavefront_correction', 'controller_response']),
    analog('analog.reentry-plasma-sheath', 'hypersonic shock ionizes air into a hot plasma sheath around a capsule', ['space.reentry_plasma_sheath'], ['shock_ionization', 'heat_transfer']),
    analog('analog.particle-collider-event', 'charged collision products branch into detector track cascades', ['physics.particle_collider_event'], ['particle_cascade', 'charged_particle_optics']),
    analog('analog.planetary-ring-resonance', 'shepherd moon resonance sorts icy ring boulders into density waves', ['astro.planetary_ring_resonance'], ['orbital_resonance', 'particle_sorting']),
    analog('analog.ocean-eddy-upwelling', 'rotating saltwater vorticity lifts nutrients into an ocean bloom zone', ['earth.ocean_eddy_upwelling'], ['vortex_transport', 'climate_exchange']),
    analog('analog.mangrove-flood-buffer', 'mangrove roots attenuate floodwater and trap sediment in tidal channels', ['ecology.mangrove_flood_buffer'], ['flood_attenuation', 'sediment_transport']),
    analog('analog.insect-wing-vortex', 'a flexible chitin wing sustains vortex lift during a stroke envelope', ['bio.insect_wing_vortex_lift'], ['vortex_lift', 'wake_shedding']),
    analog('analog.gut-microbiome-exchange', 'microbial colonies exchange metabolites through intestinal mucus gradients', ['bio.gut_microbiome_exchange'], ['metabolite_exchange', 'reaction_diffusion']),
    analog('analog.aquifer-contamination-plume', 'a groundwater plume disperses through porous aquifer strata', ['earth.aquifer_contamination_plume'], ['porous_flow', 'sediment_transport']),
    analog('analog.bridge-scour', 'river sediment erodes around a bridge pier through horseshoe vortices', ['infrastructure.bridge_pier_scour'], ['sediment_transport', 'wake_shedding']),
    analog('analog.railway-dispatch', 'train agents resolve signal block conflicts across a railway graph', ['logistics.railway_dispatch_conflict_resolution'], ['network_flow', 'swarm_consensus']),
    analog('analog.edge-data-center-heat', 'server rack heat recirculates between cooling aisles under control feedback', ['compute.edge_data_center_heat_recirculation'], ['thermal_recirculation', 'heat_transfer']),
    analog('analog.social-belief-cascade', 'belief packets cascade through social graph edges against correction pulses', ['society.social_belief_cascade'], ['belief_cascade', 'epidemic_spread']),
    analog('analog.chemical-clock', 'reaction diffusion creates oscillating color bands in a chemical clock dish', ['chem.chemical_clock_reaction'], ['chemical_oscillation', 'reaction_diffusion']),
    analog('analog.polymer-curing', 'epoxy resin crosslinks through a heated mold as a gel front advances', ['material.polymer_curing_crosslink_network'], ['crosslinking_cure', 'heat_transfer']),
    analog('analog.crowd-venue-flow', 'venue crowds move through sound fields and exit queues under capacity limits', ['society.crowd_venue_flow'], ['crowd_acoustic_flow', 'agent_queueing']),
    analog('analog.deep-space-link', 'microwave signals close a noisy link budget between Earth dishes and probes', ['space.deep_space_link_budget'], ['deep_space_link', 'network_flow']),
    analog('analog.asteroid-mining-sorting', 'robot miners sort ore grade rubble under weak asteroid gravity', ['space.asteroid_mining_material_sorting'], ['low_gravity_sorting', 'particle_sorting']),
    analog('analog.gravitational-lens', 'dark matter mass fields shear background galaxies into lensing arcs', ['astro.gravitational_lens_shear'], ['gravitational_lensing', 'field_refraction']),
    analog('analog.collective-animal-motion', 'local neighbor rules create fish schools bird flocks and pollinator paths', ['bio.collective_animal_motion'], ['collective_motion', 'swarm_consensus']),
    analog('analog.natural-hazard-propagation', 'rupture water wind and debris fields propagate natural hazard damage', ['earth.natural_hazard_propagation'], ['natural_hazard_propagation', 'convective_flow']),
    analog('analog.cyber-information-system', 'network packets carry attacks transactions recommendations and ranked queries across service graphs', ['compute.cyber_information_system'], ['cyber_attack_spread', 'network_flow']),
    analog('analog.advanced-energy-chemistry', 'plasma confinement membranes and catalyst beds convert advanced energy carriers', ['energy.advanced_energy_chemistry'], ['stellarator_confinement', 'catalyst_reaction']),
  ],
});

async function main() {
  const existingManifest = await readManifest();
  const manifest = createManifest(existingManifest || {});
  manifest.generator = {
    schema: 'simulatte.semanticUniverseGenerator.v1',
    sources: [
      'simulatte-physics-catalog',
      'simulatte-semantic-surface-cards',
      'simulatte-grounding-basis-cards',
    ],
  };
  await writeJson(path.join(UNIVERSE_DIR, 'manifest.json'), manifest);

  const generatedDocs = generatedUniverseDocs();
  for (const definition of INDEX_DEFINITIONS) {
    if (definition.name === 'affordances') continue;
    const current = await readJson(artifactPath(definition.artifact), {});
    const builderDocs = [
      ...(DEFAULT_DOCS[definition.name] || []),
      ...(generatedDocs[definition.name] || []),
    ];
    const builderDocIds = new Set(builderDocs.map((doc) => doc && doc.id).filter(Boolean));
    const handAuthored = (current.documents || []).filter((doc) => (
      doc
      && doc.id
      && (!doc.provenance || doc.provenance.generated !== true)
      && !builderDocIds.has(doc.id)
    ));
    const docs = mergeDocuments(handAuthored, builderDocs);
    const index = normalizeIndex(definition.name, current, docs.map((doc) => normalizeDocument(definition.name, doc)));
    addSemanticFeatures(index);
    await writeJson(artifactPath(definition.artifact), index);
  }

  const affordanceDefinition = INDEX_BY_NAME.affordances;
  const affordances = await readJson(artifactPath(affordanceDefinition.artifact), null);
  if (!affordances) {
    await writeJson(artifactPath(affordanceDefinition.artifact), normalizeIndex('affordances', {}, []));
  }

  console.log(JSON.stringify({
    universeDir: UNIVERSE_DIR,
    manifest: 'manifest.json',
    indexes: INDEX_DEFINITIONS.map((definition) => definition.artifact.replace(/^\.\//, '')),
  }, null, 2));
}

function normalizeDocument(indexName, doc) {
  return {
    ...doc,
    aliases: normalizeAliases(doc.aliases || []),
    domains: uniqueSorted(doc.domains || []),
    operatorHints: uniqueSorted(doc.operatorHints || []),
    primitiveHints: uniqueSorted(doc.primitiveHints || []),
  };
}

function generatedUniverseDocs() {
  const catalog = require('../public/pipeline/phase-06-simulation/simulatte-physics-catalog.js');
  const ragApi = require('../public/pipeline/phase-03-retrieval/simulatte-semantic-rag.js');
  const graphApi = require('../public/pipeline/phase-05-grounded-intent/simulatte-graph-synthesis.js');
  const primitiveIds = new Set((catalog.PHYSICAL_PRIMITIVES || []).map((primitive) => primitive.id));
  const cards = [
    ...(ragApi.SEMANTIC_SURFACE_CARDS || []),
    ...(ragApi.GROUNDING_BASIS_CARDS || []),
    ...synthesisCardsForUniverse(graphApi.SURFACE_CARD_LIBRARY || []),
  ];
  const docs = {
    concepts: [],
    materials: [],
    processes: [],
    relations: [],
    operators: [],
    shapes: [],
    scenes: [],
    synonyms: [],
    analogs: [],
  };
  const operatorTypes = new Set();
  const materialIds = new Set();
  const shapeIds = new Set();

  for (const primitive of catalog.PHYSICAL_PRIMITIVES || []) {
    const row = conceptFromPrimitive(primitive);
    docs.concepts.push(row);
    if (primitive.layer === 'material') {
      docs.materials.push(materialFromPrimitive(primitive));
      materialIds.add(primitive.id);
    }
    if (['field', 'process', 'constraint'].includes(primitive.type) || primitive.layer === 'physics') {
      const operatorDoc = operatorFromPrimitive(primitive);
      docs.operators.push(operatorDoc);
      operatorTypes.add(operatorDoc.operatorType);
    }
    if (primitive.layer === 'scene') {
      const sceneDoc = sceneFromPrimitive(primitive);
      docs.scenes.push(sceneDoc);
    }
    if (['body', 'component', 'material', 'field', 'source', 'sink'].includes(primitive.type)) {
      const shapeDoc = shapeFromPrimitive(primitive);
      docs.shapes.push(shapeDoc);
      shapeIds.add(shapeDoc.id);
    }
    docs.synonyms.push(...synonymsForTarget(row.canonicalId, 'concept', primitiveAliases(primitive), `primitive-${primitive.id}`));
  }

  for (const [operatorId, registry] of Object.entries(catalog.OPERATOR_REGISTRY || {})) {
    const operatorType = normalizeOperatorType(operatorId);
    docs.operators.push(generated({
      id: `operator.${slug(operatorId)}`,
      label: labelFromId(operatorId),
      operatorType,
      domains: uniqueSorted([operatorId, ...(registry.inputs || []), ...(registry.outputs || [])]),
      stateVariables: uniqueSorted(registry.state || []),
      primitiveHints: primitiveHintsForText(`${operatorId} ${(registry.inputs || []).join(' ')} ${(registry.outputs || []).join(' ')}`, primitiveIds),
    }, 'operator-registry'));
    operatorTypes.add(operatorType);
  }

  for (const card of cards) {
    const conceptDoc = conceptFromCard(card, primitiveIds);
    docs.concepts.push(conceptDoc);
    docs.synonyms.push(...synonymsForTarget(conceptDoc.canonicalId, 'concept', card.labels || [], card.id));
    const materialHints = normalizeHints(card.materialHints || []);
    for (const hint of materialHints) {
      docs.materials.push(materialFromHint(hint));
      materialIds.add(materialIdForHint(hint));
    }
    for (const hint of normalizeHints([
      ...(card.behaviorHints || []),
      ...(card.affordanceHints || []),
      ...(card.eventHints || []),
    ])) {
      const operatorType = normalizeOperatorType(hint);
      operatorTypes.add(operatorType);
      docs.operators.push(operatorFromHint(hint, card, primitiveIds));
      docs.processes.push(processFromHint(hint, card, primitiveIds));
      docs.relations.push(relationFromHint(hint, card, primitiveIds));
    }
    for (const hint of normalizeHints(card.relationHints || [])) {
      const operatorType = normalizeOperatorType(hint);
      operatorTypes.add(operatorType);
      docs.operators.push(operatorFromHint(hint, card, primitiveIds));
      docs.relations.push(relationFromHint(hint, card, primitiveIds));
    }
    for (const hint of normalizeHints(card.shapeHints || [])) {
      const shapeDoc = shapeFromHint(hint, card, primitiveIds);
      docs.shapes.push(shapeDoc);
      shapeIds.add(shapeDoc.id);
    }
    if (card.type === 'environment' || card.type === 'scene') {
      docs.scenes.push(sceneFromCard(card, primitiveIds));
    }
  }

  for (const primitive of catalog.COMPOSITION_LIBRARY || []) {
    docs.scenes.push(sceneFromPrimitive(primitive));
  }

  for (const doc of docs.concepts) {
    const hints = normalizeHints(doc.operatorHints || []);
    for (const hint of hints) operatorTypes.add(hint);
  }
  for (const doc of docs.operators) operatorTypes.add(doc.operatorType);

  for (const doc of docs.concepts) {
    docs.analogs.push(analogFromConcept(doc));
  }

  return Object.fromEntries(Object.entries(docs).map(([name, rows]) => [
    name,
    uniqueRows(rows).map((doc) => finalizeGeneratedDoc(doc, name, {
      materialIds,
      operatorTypes,
      shapeIds,
      primitiveIds,
    })),
  ]));
}

function conceptFromPrimitive(primitive) {
  const canonicalId = `primitive.${primitive.id}`;
  return generated({
    id: `concept.primitive-${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    canonicalId,
    semanticType: `${primitive.layer || primitive.type || 'physical'}Primitive`,
    domains: uniqueSorted([primitive.layer, primitive.type, ...(primitive.domains || [])]),
    materialId: primitive.layer === 'material' ? primitive.id : primitive.material || '',
    operatorHints: operatorHintsForText(primitiveText(primitive)),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function materialFromPrimitive(primitive) {
  return generated({
    id: `material.${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    materialId: primitive.id,
    properties: cloneJson(primitive.properties || {}),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function operatorFromPrimitive(primitive) {
  return generated({
    id: `operator.primitive-${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    operatorType: normalizeOperatorType(primitive.id),
    domains: uniqueSorted([primitive.layer, primitive.type, ...(primitive.domains || [])]),
    stateVariables: uniqueSorted(primitive.controls || []),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function shapeFromPrimitive(primitive) {
  return generated({
    id: `shape.primitive-${slug(primitive.id)}`,
    label: `${primitive.label || labelFromId(primitive.id)} form`,
    aliases: primitiveAliases(primitive),
    shapeKind: shapeKindForText(primitiveText(primitive)),
    domains: uniqueSorted([primitive.layer, primitive.type, ...(primitive.domains || [])]),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function sceneFromPrimitive(primitive) {
  return generated({
    id: `scene.primitive-${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    sceneKind: sceneKindForText(primitiveText(primitive)),
    conceptIds: [`primitive.${primitive.id}`],
    shapeIds: [`shape.primitive-${slug(primitive.id)}`],
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function conceptFromCard(card, primitiveIds) {
  const label = (card.labels && card.labels[0]) || labelFromId(card.id);
  const materialHints = normalizeHints(card.materialHints || []);
  const operatorHints = normalizeHints([
    ...(card.behaviorHints || []),
    ...(card.affordanceHints || []),
    ...(card.eventHints || []),
    ...(card.relationHints || []),
  ]).map(normalizeOperatorType);
  return generated({
    id: `concept.card-${slug(card.id)}`,
    label,
    aliases: card.labels || [],
    canonicalId: card.id,
    semanticType: card.type || 'concept',
    domains: uniqueSorted([
      card.type,
      ...(card.classHints || []),
      ...(card.shapeHints || []),
      ...(card.scaleHints || []),
    ]),
    materialId: materialHints.length ? materialIdForHint(materialHints[0]) : '',
    operatorHints,
    primitiveHints: uniqueSorted([
      ...normalizeHints(card.primitiveHints || []),
      ...primitiveHintsForText(cardText(card), primitiveIds),
    ]),
  }, 'semantic-surface-card');
}

function materialFromHint(hint) {
  const materialId = materialIdForHint(hint);
  return generated({
    id: `material.${slug(materialId)}`,
    label: labelFromId(hint),
    aliases: [hint],
    materialId,
    properties: {},
    primitiveHints: [],
  }, 'semantic-surface-card');
}

function operatorFromHint(hint, card, primitiveIds) {
  const operatorType = normalizeOperatorType(hint);
  return generated({
    id: `operator.${slug(operatorType)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    operatorType,
    domains: uniqueSorted([card.type, ...(card.classHints || []), ...(card.behaviorHints || [])]),
    stateVariables: [],
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function processFromHint(hint, card, primitiveIds) {
  const operatorType = normalizeOperatorType(hint);
  return generated({
    id: `process.${slug(operatorType)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    process: operatorType,
    operatorHints: [operatorType],
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function relationFromHint(hint, card, primitiveIds) {
  const operatorType = normalizeOperatorType(hint);
  return generated({
    id: `relation.${slug(operatorType)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    edgeType: operatorType,
    operatorHints: [operatorType],
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function shapeFromHint(hint, card, primitiveIds) {
  return generated({
    id: `shape.${slug(hint)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    shapeKind: shapeKindForText(hint),
    domains: uniqueSorted([card.type, ...(card.classHints || [])]),
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function sceneFromCard(card, primitiveIds) {
  const label = (card.labels && card.labels[0]) || labelFromId(card.id);
  return generated({
    id: `scene.card-${slug(card.id)}`,
    label,
    aliases: card.labels || [],
    sceneKind: sceneKindForText(cardText(card)),
    conceptIds: [card.id],
    shapeIds: normalizeHints(card.shapeHints || []).map((hint) => `shape.${slug(hint)}`),
    primitiveHints: uniqueSorted([
      ...normalizeHints(card.primitiveHints || []),
      ...primitiveHintsForText(cardText(card), primitiveIds),
    ]),
  }, 'semantic-surface-card');
}

function synthesisCardsForUniverse(cards) {
  return (cards || []).map((card) => {
    const grounding = card.grounding || {};
    return {
      id: `synthesis.${card.id}`,
      type: card.type,
      labels: card.labels || [],
      description: card.text || '',
      classHints: grounding.classes || [],
      shapeHints: grounding.shapes || [],
      partHints: grounding.parts || [],
      materialHints: grounding.materials || [],
      behaviorHints: grounding.behaviors || [],
      affordanceHints: grounding.ports || [],
      relationHints: grounding.constraints || [],
      primitiveHints: grounding.primitiveIds || [],
    };
  });
}

function analogFromConcept(doc) {
  return generated({
    id: `analog.${slug(doc.canonicalId || doc.id)}`,
    label: doc.label,
    concepts: [doc.canonicalId],
    operators: normalizeHints(doc.operatorHints || []),
  }, doc.provenance && doc.provenance.source || 'generated-concept');
}

function synonymsForTarget(targetId, targetKind, aliases, source) {
  return normalizeAliases(aliases || []).map((alias) => generated({
    id: `synonym.${slug(`${targetKind}-${targetId}-${alias}`)}`,
    label: alias,
    aliases: [alias],
    targetId,
    targetKind,
  }, source));
}

function finalizeGeneratedDoc(doc, indexName, refs) {
  const next = { ...doc };
  if (indexName === 'concepts') {
    next.operatorHints = normalizeHints(next.operatorHints || []).filter((hint) => refs.operatorTypes.has(hint));
    if (next.materialId && !refs.materialIds.has(next.materialId)) next.materialId = '';
  }
  if (indexName === 'affordances') {
    next.operatorTypes = normalizeHints(next.operatorTypes || []).filter((hint) => refs.operatorTypes.has(hint));
    next.materialIds = normalizeHints(next.materialIds || []).filter((hint) => refs.materialIds.has(hint));
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
    next.shapeHints = normalizeHints(next.shapeHints || []).filter((hint) => refs.shapeIds.has(hint));
  }
  if (['operators', 'processes', 'relations'].includes(indexName)) {
    next.operatorHints = normalizeHints(next.operatorHints || []).filter((hint) => refs.operatorTypes.has(hint));
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
  }
  if (indexName === 'shapes') {
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
  }
  if (indexName === 'scenes') {
    next.shapeIds = normalizeHints(next.shapeIds || []).filter((hint) => refs.shapeIds.has(hint));
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
  }
  return next;
}

function addSemanticFeatures(index) {
  const ragApi = require('../public/pipeline/phase-03-retrieval/simulatte-semantic-rag.js');
  const featureDim = Number(ragApi.FEATURE_DIM || 384);
  const packed = new Float32Array(index.documents.length * featureDim);
  index.documents = index.documents.map((doc, order) => {
    const candidateText = universeCandidateText(doc);
    const vector = ragApi.buildSemanticFeatureVector(candidateText, featureDim);
    packed.set(vector, order * featureDim);
    return { ...doc, candidateText };
  });
  index.featureModelId = 'simulatte-semantic-feature-v1';
  index.featureDim = featureDim;
  index.featurePackedBase64 = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength).toString('base64');
}

function generated(doc, source) {
  return {
    ...doc,
    provenance: {
      schema: 'simulatte.universeDocProvenance.v1',
      generated: true,
      source,
    },
  };
}

function uniqueRows(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (!row || !row.id) continue;
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? mergeRow(existing, row) : row);
  }
  return [...byId.values()];
}

function mergeRow(a, b) {
  return {
    ...a,
    ...b,
    aliases: uniqueSorted([...(a.aliases || []), ...(b.aliases || [])]),
    domains: uniqueSorted([...(a.domains || []), ...(b.domains || [])]),
    operatorHints: uniqueSorted([...(a.operatorHints || []), ...(b.operatorHints || [])]),
    primitiveHints: uniqueSorted([...(a.primitiveHints || []), ...(b.primitiveHints || [])]),
    conceptIds: uniqueSorted([...(a.conceptIds || []), ...(b.conceptIds || [])]),
    shapeIds: uniqueSorted([...(a.shapeIds || []), ...(b.shapeIds || [])]),
    concepts: uniqueSorted([...(a.concepts || []), ...(b.concepts || [])]),
    operators: uniqueSorted([...(a.operators || []), ...(b.operators || [])]),
  };
}

function universeCandidateText(doc) {
  return [
    doc.id,
    doc.label,
    doc.canonicalId,
    doc.semanticType,
    doc.materialId,
    doc.operatorType,
    doc.process,
    doc.edgeType,
    doc.shapeKind,
    doc.sceneKind,
    ...(doc.aliases || []),
    ...(doc.domains || []),
    ...(doc.operatorHints || []),
    ...(doc.primitiveHints || []),
  ].filter(Boolean).join(' ');
}

function primitiveText(primitive) {
  return [
    primitive.id,
    primitive.label,
    primitive.type,
    primitive.layer,
    primitive.role,
    primitive.text,
    ...(primitive.domains || []),
    ...(primitive.recipe || []),
    ...(primitive.controls || []),
  ].filter(Boolean).join(' ');
}

function cardText(card) {
  return [
    card.id,
    card.type,
    ...(card.labels || []),
    card.description,
    ...(card.primitiveHints || []),
    ...(card.classHints || []),
    ...(card.shapeHints || []),
    ...(card.partHints || []),
    ...(card.materialHints || []),
    ...(card.behaviorHints || []),
    ...(card.affordanceHints || []),
    ...(card.relationHints || []),
    ...(card.eventHints || []),
    ...(card.scaleHints || []),
  ].filter(Boolean).join(' ');
}

function primitiveAliases(primitive) {
  return uniqueSorted([
    primitive.id,
    primitive.label,
    ...(String(primitive.text || '').split(/\s+/).filter((token) => token.length > 3).slice(0, 6)),
  ]);
}

function primitiveHintsForText(text, primitiveIds) {
  const haystack = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const out = [];
  for (const id of primitiveIds) {
    const label = id.replace(/-/g, ' ');
    if (haystack.includes(` ${label} `) || haystack.includes(` ${id.toLowerCase()} `)) out.push(id);
    if (out.length >= 8) break;
  }
  return uniqueSorted(out);
}

function operatorHintsForText(text) {
  const lower = String(text || '').toLowerCase();
  const pairs = [
    ['magnetic_field', /magnet|dipole|flux/],
    ['field_refraction', /lens|prism|optic|laser|light|glass/],
    ['field_reflection', /mirror|reflect/],
    ['heat_transfer', /heat|thermal|temperature|sun|laser|cool/],
    ['network_flow', /network|queue|traffic|market|route|logistics/],
    ['controller_response', /controller|feedback|control|state machine/],
    ['pressure_flow_lite', /pressure|pipe|pump|flow|fluid|water|brine/],
    ['crystallization', /crystal|lattice|nucleation/],
    ['wave_field', /wave|acoustic|sound|resonance|oscillat/],
    ['particle_sorting', /particle|dust|granular|powder|sort/],
    ['surface_tension', /surface|film|membrane|bubble|capillary/],
    ['fracture_threshold', /fracture|crack|break|rupture|impact/],
    ['growth_decay', /growth|biology|cell|mycelium|plant|population/],
    ['reaction_diffusion', /reaction|diffusion|chemical|enzyme|catalyst/],
  ];
  return uniqueSorted(pairs.filter(([, pattern]) => pattern.test(lower)).map(([operatorType]) => operatorType));
}

function shapeKindForText(text) {
  const lower = String(text || '').toLowerCase();
  if (/grid|network|graph|queue|traffic/.test(lower)) return 'grid';
  if (/building|structure|room|warehouse|factory|house|apartment|office|school|hospital|stairwell|corridor|hallway|basement|garage|roof|shed|cabin|box|shell/.test(lower)) return 'building-shell';
  if (/ring|coil|loop|wheel|rotor|circle/.test(lower)) return 'ring';
  if (/tube|pipe|channel|vessel|column/.test(lower)) return 'tube';
  if (/branch|tree|root|mycelium|river/.test(lower)) return 'branching-network';
  if (/film|membrane|sheet|panel|surface/.test(lower)) return 'sheet';
  if (/lens|disc|disk|sphere|ball/.test(lower)) return 'disc';
  if (/wing|airfoil|bird/.test(lower)) return 'winged-body';
  if (/body|animal|human|mammal|robot/.test(lower)) return 'articulated-body';
  return 'body';
}

function sceneKindForText(text) {
  const lower = String(text || '').toLowerCase();
  if (/city|traffic|queue|market|warehouse|logistics|network/.test(lower)) return 'city';
  if (/acoustic|sound|wave|resonance|tube/.test(lower)) return 'acoustic';
  if (/biology|cell|mycelium|plant|animal|organism|growth|reef|algae/.test(lower)) return 'biology';
  if (/film|surface|membrane|bubble/.test(lower)) return 'thin-film';
  if (/magnet|coil|rotor|stator|motor/.test(lower)) return 'magnetic-machine';
  if (/lens|prism|mirror|optic|laser|light/.test(lower)) return 'optics';
  if (/river|water|terrain|erosion|brine|pressure|fluid/.test(lower)) return 'watershed';
  if (/fire|thermal|heat|plume|smoke/.test(lower)) return 'thermal-plume';
  if (/granular|sand|powder|grain/.test(lower)) return 'granular';
  return 'literal-composite';
}

function materialIdForHint(hint) {
  return String(hint || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'material';
}

function normalizeOperatorType(hint) {
  const normalized = String(hint || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'operator';
  const aliases = {
    fluid_flow: 'pressure_flow_lite',
    growth: 'growth_decay',
    pressure_flow: 'pressure_flow_lite',
  };
  return aliases[normalized] || normalized;
}

function normalizeHints(values) {
  return uniqueSorted(values || []).map((value) => String(value).trim()).filter(Boolean);
}

function labelFromId(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'item';
}

function slug(value) {
  return String(value || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'item';
}

function concept(id, label, canonicalId, semanticType, domains, materialId, operatorHints, aliases) {
  return { id, label, aliases, canonicalId, semanticType, domains, materialId, operatorHints };
}

function material(id, label, materialId, aliases, properties) {
  return { id, label, aliases, materialId, properties };
}

function processDoc(id, label, process, operatorHints, aliases) {
  return { id, label, aliases, process, operatorHints };
}

function relation(id, label, edgeType, operatorHints, aliases) {
  return { id, label, aliases, edgeType, operatorHints };
}

function operator(id, label, operatorType, domains, stateVariables, primitiveHints) {
  return { id, label, operatorType, domains, stateVariables, primitiveHints };
}

function shape(id, label, shapeKind, domains, primitiveHints, aliases) {
  return { id, label, aliases, shapeKind, domains, primitiveHints };
}

function scene(id, label, sceneKind, conceptIds, shapeIds, primitiveHints) {
  return { id, label, aliases: [], sceneKind, conceptIds, shapeIds, primitiveHints };
}

function synonym(id, label, targetId, targetKind, aliases) {
  return { id, label, aliases, targetId, targetKind };
}

function analog(id, label, concepts, operators) {
  return { id, label, concepts, operators };
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
