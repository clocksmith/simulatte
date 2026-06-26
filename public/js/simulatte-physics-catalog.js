(function attachSimulattePhysicsCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsCatalog() {
  const TAU = Math.PI * 2;
  const FIELD_GRID = 52;

  const TEMPLATE_LIBRARY = Object.freeze([
    {
      id: 'magnetic-wheel',
      name: 'Solar Magnetic Wheel',
      kind: 'newtonian-electromagnetic',
      description: 'Powered stator slider, rotor magnets, motor load, friction, and energy accounting.',
      modules: ['mechanics', 'electromagnetism', 'solar', 'control', 'energy-ledger'],
      objects: [
        { id: 'rotor-wheel', type: 'body', role: 'rotating wheel with alternating magnetic poles' },
        { id: 'stator-slider', type: 'actuator', role: 'solar-powered moving magnetic slider' },
        { id: 'solar-panel', type: 'source', role: 'bounded energy input' },
        { id: 'motor-load', type: 'sink', role: 'useful output load' },
      ],
      readouts: ['rpm', 'torque', 'solar', 'load', 'actuator', 'balance'],
      params: {
        irradiance: 780,
        panelArea: 0.42,
        panelEfficiency: 0.24,
        magneticStrength: 0.62,
        sliderPhase: 0.18,
        sliderAmplitude: 0.42,
        loadTorque: 0.16,
        friction: 0.045,
        wheelInertia: 0.72,
        actuatorEfficiency: 0.54,
      },
      controls: [
        ['irradiance', 'sun irradiance', 0, 1200, 10],
        ['magneticStrength', 'magnetic strength', 0, 1.5, 0.01],
        ['sliderPhase', 'slider phase', -0.5, 0.5, 0.01],
        ['sliderAmplitude', 'solar slider travel', 0, 1.1, 0.01],
        ['loadTorque', 'motor load', 0, 0.8, 0.01],
        ['friction', 'bearing friction', 0, 0.16, 0.002],
      ],
    },
    {
      id: 'fluid-vortex',
      name: 'Fluid Vortex Tank',
      kind: 'fluid-particles',
      description: 'A particle fluid tank with inlet flow, viscosity, obstacle wake, turbulence, and drag loss.',
      modules: ['mechanics', 'fluid', 'turbulence', 'obstacle', 'energy-ledger'],
      objects: [
        { id: 'inlet', type: 'source', role: 'flow input' },
        { id: 'fluid-particles', type: 'material', role: 'moving particle fluid' },
        { id: 'wake-obstacle', type: 'constraint', role: 'obstacle producing pressure and wake' },
      ],
      readouts: ['flow', 'pressure', 'vorticity', 'mixing', 'drag', 'age'],
      params: {
        inletFlow: 0.62,
        viscosity: 0.18,
        vortexStrength: 0.74,
        obstacleRadius: 0.16,
        turbulence: 0.22,
        gravity: 0.05,
      },
      controls: [
        ['inletFlow', 'inlet flow', 0, 1.4, 0.01],
        ['viscosity', 'viscosity', 0.01, 0.65, 0.01],
        ['vortexStrength', 'vortex strength', 0, 1.6, 0.01],
        ['obstacleRadius', 'obstacle radius', 0.04, 0.28, 0.01],
        ['turbulence', 'turbulence', 0, 0.85, 0.01],
        ['gravity', 'gravity bias', -0.4, 0.4, 0.01],
      ],
    },
    {
      id: 'reaction-diffusion',
      name: 'Reaction Diffusion Chemistry',
      kind: 'chemical-field',
      description: 'Gray-Scott-style reaction front with feed, kill, diffusion, catalyst, heat, and cooling.',
      modules: ['chemistry', 'diffusion', 'thermal', 'field', 'energy-ledger'],
      objects: [
        { id: 'reactant-a', type: 'material', role: 'feedstock field' },
        { id: 'reactant-b', type: 'material', role: 'reaction product field' },
        { id: 'catalyst-front', type: 'field', role: 'catalyzed reaction front' },
      ],
      readouts: ['conversion', 'heat', 'front', 'mass b', 'entropy', 'time'],
      params: {
        feedRate: 0.037,
        killRate: 0.061,
        diffusionA: 0.92,
        diffusionB: 0.48,
        catalyst: 0.64,
        cooling: 0.22,
      },
      controls: [
        ['feedRate', 'feed rate', 0.005, 0.08, 0.001],
        ['killRate', 'kill rate', 0.03, 0.09, 0.001],
        ['diffusionA', 'diffusion a', 0.2, 1.4, 0.01],
        ['diffusionB', 'diffusion b', 0.1, 0.9, 0.01],
        ['catalyst', 'catalyst', 0, 1.2, 0.01],
        ['cooling', 'cooling', 0, 0.8, 0.01],
      ],
    },
    {
      id: 'custom-world',
      name: 'Generated Physics World',
      kind: 'modular-physics',
      description: 'A composed world assembled from prompt-selected modules, objects, forces, materials, sources, and sinks.',
      modules: ['mechanics', 'field', 'energy-ledger'],
      objects: [
        { id: 'body-a', type: 'body', role: 'movable physical object' },
        { id: 'field-a', type: 'field', role: 'force field affecting motion' },
      ],
      readouts: ['energy', 'motion', 'field', 'matter', 'heat', 'stability'],
      params: {
        energyInput: 0.62,
        fieldStrength: 0.48,
        driveTiming: 0.5,
        flowRate: 0.2,
        viscosity: 0.18,
        reactionRate: 0.28,
        heatTransfer: 0.24,
        gravity: 0.06,
        damping: 0.08,
        complexity: 0.5,
        springConstant: 0.44,
        restitution: 0.72,
        thermalFlux: 0.24,
        refractiveIndex: 1.42,
        lightIntensity: 0.56,
        soundFrequency: 0.42,
        waveAmplitude: 0.32,
        buoyancy: 0.28,
        density: 0.54,
        granularFriction: 0.38,
        charge: 0.42,
        electricField: 0.34,
        plasmaTemperature: 0.28,
        windSpeed: 0.24,
        membraneTension: 0.48,
        pressure: 0.36,
        controlGain: 0.46,
        signalNoise: 0.18,
        signalDelay: 0.22,
        queueBacklog: 0.34,
        serviceRate: 0.58,
        networkLatency: 0.26,
        terrainSlope: 0.28,
        erosionRate: 0.22,
        populationGrowth: 0.32,
        infectionRate: 0.18,
        adhesion: 0.24,
        cohesion: 0.36,
        phaseThreshold: 0.52,
        latentHeat: 0.34,
        marketDemand: 0.42,
        priceElasticity: 0.38,
        hardness: 0.52,
        conductivity: 0.34,
        combustibility: 0.24,
        moisture: 0.28,
        opacity: 0.46,
        magnetization: 0.42,
        atomicMass: 32,
        bondStrength: 0.52,
        ionization: 0.18,
        albedo: 0.34,
      },
      controls: [
        ['energyInput', 'energy input', 0, 1.5, 0.01],
        ['fieldStrength', 'field strength', 0, 1.6, 0.01],
        ['driveTiming', 'drive timing', 0, 1, 0.01],
        ['flowRate', 'flow rate', 0, 1.4, 0.01],
        ['viscosity', 'viscosity', 0.01, 0.65, 0.01],
        ['reactionRate', 'reaction rate', 0, 1.2, 0.01],
        ['heatTransfer', 'heat transfer', 0, 1.2, 0.01],
        ['gravity', 'gravity', -0.5, 0.5, 0.01],
        ['damping', 'damping', 0, 0.35, 0.005],
        ['complexity', 'world complexity', 0, 1, 0.01],
        ['controlGain', 'control gain', 0, 1.5, 0.01],
        ['signalNoise', 'signal noise', 0, 1, 0.01],
        ['queueBacklog', 'queue backlog', 0, 1, 0.01],
        ['terrainSlope', 'terrain slope', -1, 1, 0.01],
        ['populationGrowth', 'population growth', 0, 1.4, 0.01],
      ],
    },
    {
      id: 'blank-world',
      name: 'Blank Construction Plane',
      kind: 'blank-construction',
      description: 'An empty simulation plane with no modules or objects until the builder prompt creates them.',
      modules: [],
      objects: [],
      readouts: ['modules', 'objects', 'forces', 'sources', 'sinks', 'canvas'],
      params: {
        guideDensity: 0.42,
        canvasScale: 0.62,
      },
      controls: [
        ['guideDensity', 'guide density', 0, 1, 0.01],
        ['canvasScale', 'canvas scale', 0.2, 1, 0.01],
      ],
    },
  ]);

  const CONTROL_LIBRARY = Object.freeze({
    irradiance: ['irradiance', 'sun irradiance', 0, 1200, 10],
    magneticStrength: ['magneticStrength', 'magnetic strength', 0, 1.5, 0.01],
    sliderPhase: ['sliderPhase', 'slider phase', -0.5, 0.5, 0.01],
    sliderAmplitude: ['sliderAmplitude', 'solar slider travel', 0, 1.1, 0.01],
    loadTorque: ['loadTorque', 'motor load', 0, 0.8, 0.01],
    friction: ['friction', 'bearing friction', 0, 0.16, 0.002],
    wheelInertia: ['wheelInertia', 'wheel inertia', 0.08, 1.8, 0.01],
    energyInput: ['energyInput', 'energy input', 0, 1.5, 0.01],
    fieldStrength: ['fieldStrength', 'field strength', 0, 1.6, 0.01],
    driveTiming: ['driveTiming', 'drive timing', 0, 1, 0.01],
    flowRate: ['flowRate', 'flow rate', 0, 1.4, 0.01],
    inletFlow: ['inletFlow', 'inlet flow', 0, 1.4, 0.01],
    viscosity: ['viscosity', 'viscosity', 0.01, 0.65, 0.01],
    vortexStrength: ['vortexStrength', 'vortex strength', 0, 1.6, 0.01],
    obstacleRadius: ['obstacleRadius', 'obstacle radius', 0.04, 0.28, 0.01],
    turbulence: ['turbulence', 'turbulence', 0, 0.85, 0.01],
    reactionRate: ['reactionRate', 'reaction rate', 0, 1.2, 0.01],
    feedRate: ['feedRate', 'feed rate', 0.005, 0.08, 0.001],
    killRate: ['killRate', 'kill rate', 0.03, 0.09, 0.001],
    diffusionA: ['diffusionA', 'diffusion a', 0.2, 1.4, 0.01],
    diffusionB: ['diffusionB', 'diffusion b', 0.1, 0.9, 0.01],
    catalyst: ['catalyst', 'catalyst', 0, 1.2, 0.01],
    cooling: ['cooling', 'cooling', 0, 0.8, 0.01],
    heatTransfer: ['heatTransfer', 'heat transfer', 0, 1.2, 0.01],
    gravity: ['gravity', 'gravity', -0.5, 0.5, 0.01],
    damping: ['damping', 'damping', 0, 0.35, 0.005],
    complexity: ['complexity', 'world complexity', 0, 1, 0.01],
    springConstant: ['springConstant', 'spring constant', 0, 1.6, 0.01],
    restitution: ['restitution', 'collision restitution', 0, 1, 0.01],
    thermalFlux: ['thermalFlux', 'thermal flux', 0, 1.4, 0.01],
    refractiveIndex: ['refractiveIndex', 'refractive index', 1, 2.2, 0.01],
    lightIntensity: ['lightIntensity', 'light intensity', 0, 1.5, 0.01],
    soundFrequency: ['soundFrequency', 'sound frequency', 0.05, 1.4, 0.01],
    waveAmplitude: ['waveAmplitude', 'wave amplitude', 0, 1.2, 0.01],
    buoyancy: ['buoyancy', 'buoyancy', -0.4, 1.2, 0.01],
    density: ['density', 'material density', 0.05, 1.5, 0.01],
    granularFriction: ['granularFriction', 'granular friction', 0, 1, 0.01],
    charge: ['charge', 'charge', -1.2, 1.2, 0.01],
    electricField: ['electricField', 'electric field', 0, 1.5, 0.01],
    plasmaTemperature: ['plasmaTemperature', 'plasma temperature', 0, 1.5, 0.01],
    windSpeed: ['windSpeed', 'wind speed', -1.2, 1.2, 0.01],
    membraneTension: ['membraneTension', 'membrane tension', 0, 1.5, 0.01],
    pressure: ['pressure', 'pressure', 0, 1.5, 0.01],
    controlGain: ['controlGain', 'control gain', 0, 1.5, 0.01],
    signalNoise: ['signalNoise', 'signal noise', 0, 1, 0.01],
    signalDelay: ['signalDelay', 'signal delay', 0, 1, 0.01],
    queueBacklog: ['queueBacklog', 'queue backlog', 0, 1, 0.01],
    serviceRate: ['serviceRate', 'service rate', 0.05, 1.5, 0.01],
    networkLatency: ['networkLatency', 'network latency', 0, 1.5, 0.01],
    terrainSlope: ['terrainSlope', 'terrain slope', -1, 1, 0.01],
    erosionRate: ['erosionRate', 'erosion rate', 0, 1, 0.01],
    populationGrowth: ['populationGrowth', 'population growth', 0, 1.4, 0.01],
    infectionRate: ['infectionRate', 'infection rate', 0, 1.2, 0.01],
    adhesion: ['adhesion', 'adhesion', 0, 1.2, 0.01],
    cohesion: ['cohesion', 'cohesion', 0, 1.2, 0.01],
    phaseThreshold: ['phaseThreshold', 'phase threshold', 0, 1, 0.01],
    latentHeat: ['latentHeat', 'latent heat', 0, 1.4, 0.01],
    marketDemand: ['marketDemand', 'market demand', 0, 1.5, 0.01],
    priceElasticity: ['priceElasticity', 'price elasticity', 0, 1.2, 0.01],
    hardness: ['hardness', 'hardness', 0, 1.5, 0.01],
    conductivity: ['conductivity', 'conductivity', 0, 1.5, 0.01],
    combustibility: ['combustibility', 'combustibility', 0, 1.2, 0.01],
    moisture: ['moisture', 'moisture', 0, 1, 0.01],
    opacity: ['opacity', 'opacity', 0, 1, 0.01],
    magnetization: ['magnetization', 'magnetization', 0, 1.5, 0.01],
    atomicMass: ['atomicMass', 'atomic mass', 1, 240, 1],
    bondStrength: ['bondStrength', 'bond strength', 0, 1.5, 0.01],
    ionization: ['ionization', 'ionization', 0, 1.5, 0.01],
    albedo: ['albedo', 'albedo', 0, 1, 0.01],
    guideDensity: ['guideDensity', 'guide density', 0, 1, 0.01],
    canvasScale: ['canvasScale', 'canvas scale', 0.2, 1, 0.01],
  });

  const TOKEN_SYNONYMS = Object.freeze({
    air: ['fluid', 'gas'],
    audio: ['sound', 'acoustic'],
    beam: ['light', 'optics'],
    biological: ['biology', 'population'],
    bounce: ['collision', 'restitution'],
    bubbles: ['buoyancy', 'fluid'],
    burn: ['fire', 'thermal'],
    carbon: ['atomic', 'material'],
    ceramic: ['mineral', 'solid'],
    city: ['queue', 'network', 'logistics'],
    climate: ['terrain', 'erosion', 'thermal'],
    controller: ['control', 'feedback'],
    copper: ['metal', 'conductor'],
    crystal: ['lattice', 'mineral'],
    current: ['electric', 'field'],
    delay: ['latency', 'buffer'],
    demand: ['market', 'economics'],
    disease: ['infection', 'biology'],
    economy: ['market', 'economics'],
    electron: ['atomic', 'charge'],
    feedback: ['control', 'sensor'],
    fire: ['flame', 'thermal'],
    flame: ['fire', 'thermal'],
    gas: ['fluid', 'pressure'],
    glass: ['silica', 'optics'],
    generator: ['motor', 'load'],
    gold: ['metal', 'conductor'],
    granular: ['sand', 'particle'],
    heat: ['thermal'],
    infection: ['biology', 'front'],
    internet: ['network', 'latency'],
    iron: ['metal', 'magnetic'],
    ion: ['atomic', 'plasma'],
    laser: ['light', 'optics'],
    lens: ['optics', 'refraction'],
    lattice: ['crystal', 'atomic'],
    logistics: ['queue', 'network'],
    magnet: ['magnetic', 'electromagnetism'],
    magnets: ['magnet', 'magnetic'],
    material: ['matter'],
    market: ['economics', 'demand'],
    metal: ['conductor', 'solid'],
    melt: ['phase', 'thermal'],
    mineral: ['rock', 'crystal'],
    molecule: ['chemistry', 'reaction'],
    motor: ['rotor', 'load'],
    network: ['graph', 'latency'],
    noise: ['signal', 'sensor'],
    optics: ['light', 'refraction'],
    particle: ['material'],
    predator: ['biology', 'population'],
    pressure: ['fluid', 'gas'],
    prism: ['optics', 'refraction'],
    queue: ['backlog', 'service'],
    rock: ['stone', 'mineral'],
    sand: ['granular', 'particle'],
    sensor: ['signal', 'control'],
    service: ['queue', 'backlog'],
    silica: ['glass', 'mineral'],
    silver: ['metal', 'conductor'],
    smoke: ['fluid', 'gas'],
    solar: ['sun', 'energy'],
    sound: ['acoustic', 'wave'],
    spring: ['elastic'],
    steel: ['metal', 'magnetic'],
    stone: ['rock', 'mineral'],
    steam: ['thermal', 'fluid'],
    sun: ['solar', 'energy', 'radiation'],
    supply: ['logistics', 'market'],
    terrain: ['heightfield', 'erosion'],
    water: ['fluid', 'liquid'],
    waves: ['wave'],
    wind: ['air', 'fluid'],
    wood: ['organic', 'combustible'],
  });

  const SEMANTIC_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'be', 'build', 'by', 'create', 'do', 'for', 'from',
    'have', 'in', 'into', 'is', 'it', 'make', 'of', 'on', 'or', 'simulate', 'simulation',
    'that', 'the', 'this', 'to', 'use', 'uses', 'with', 'world',
  ]);

  const BASE_CATALOG_ITEMS = Object.freeze([
    {
      id: 'energy-ledger',
      type: 'ledger',
      role: 'conservation accounting for inputs, stored energy, useful output, and loss',
      domains: ['energy-ledger'],
      controls: ['energyInput', 'damping'],
      params: { energyInput: 0.62, damping: 0.08 },
      text: 'energy ledger conservation input output loss accounting efficiency power work joule',
    },
    {
      id: 'rigid-body',
      type: 'body',
      role: 'movable mass with inertia, momentum, and damping',
      domains: ['mechanics'],
      controls: ['energyInput', 'damping', 'density'],
      params: { energyInput: 0.54, damping: 0.08, density: 0.62 },
      text: 'body mass rigid object inertia velocity acceleration newtonian mechanics momentum',
    },
    {
      id: 'rotor-wheel',
      type: 'body',
      role: 'rotating wheel with alternating magnetic poles',
      domains: ['mechanics', 'rotational-mechanics', 'electromagnetism'],
      controls: ['magneticStrength', 'wheelInertia', 'damping'],
      params: { magneticStrength: 0.62, damping: 0.045 },
      text: 'rotor wheel flywheel magnetic poles spin axle motor perpetual generator torque',
    },
    {
      id: 'stator-slider',
      type: 'actuator',
      role: 'moving magnetic slider with controllable phase and travel',
      domains: ['electromagnetism', 'control'],
      controls: ['sliderAmplitude', 'sliderPhase', 'driveTiming', 'magneticStrength'],
      params: { sliderAmplitude: 0.42, sliderPhase: 0.18, driveTiming: 0.48, magneticStrength: 0.62 },
      text: 'stator slider moving magnet magnetic actuator phase travel timing commutation',
    },
    {
      id: 'solar-panel',
      type: 'source',
      role: 'bounded solar energy input',
      domains: ['solar', 'energy-ledger'],
      controls: ['irradiance', 'energyInput'],
      params: { irradiance: 780, energyInput: 0.78 },
      text: 'solar panel sunlight sun irradiance photovoltaic bounded energy source',
    },
    {
      id: 'motor-load',
      type: 'sink',
      role: 'useful motor or generator load',
      domains: ['mechanics', 'energy-ledger'],
      controls: ['loadTorque', 'friction'],
      params: { loadTorque: 0.16, friction: 0.045 },
      text: 'motor generator load output torque work useful power sink',
    },
    {
      id: 'bearing-friction',
      type: 'loss',
      role: 'mechanical friction and bearing loss',
      domains: ['mechanics', 'energy-ledger'],
      controls: ['friction', 'damping'],
      params: { friction: 0.045, damping: 0.08 },
      text: 'friction damping bearing drag loss resistance heat',
    },
    {
      id: 'gravity-source',
      type: 'field',
      role: 'gravity or acceleration field',
      domains: ['gravity', 'mechanics'],
      controls: ['gravity', 'fieldStrength'],
      params: { gravity: 0.18, fieldStrength: 0.42 },
      text: 'gravity orbit falling acceleration pendulum weight attraction well',
    },
    {
      id: 'spring-constraint',
      type: 'constraint',
      role: 'elastic spring restoring force',
      domains: ['elasticity', 'mechanics'],
      controls: ['springConstant', 'damping'],
      params: { springConstant: 0.72, damping: 0.055 },
      text: 'spring elastic oscillator pendulum restoring force hooke tension bounce',
    },
    {
      id: 'collision-boundary',
      type: 'constraint',
      role: 'solid boundary with collision restitution',
      domains: ['collision', 'mechanics'],
      controls: ['restitution', 'damping'],
      params: { restitution: 0.72, damping: 0.045 },
      text: 'collision bounce wall boundary restitution contact rigid impact',
    },
    {
      id: 'flow-inlet',
      type: 'source',
      role: 'fluid or gas inlet',
      domains: ['fluid', 'advection'],
      controls: ['inletFlow', 'flowRate', 'pressure'],
      params: { inletFlow: 0.62, flowRate: 0.45, pressure: 0.36 },
      text: 'fluid water air gas inlet stream flow pressure smoke pipe',
    },
    {
      id: 'flow-outlet',
      type: 'sink',
      role: 'fluid or gas outlet',
      domains: ['fluid', 'advection'],
      controls: ['flowRate', 'pressure'],
      params: { flowRate: 0.45, pressure: 0.28 },
      text: 'outlet drain exhaust flow exit pressure sink',
    },
    {
      id: 'moving-fluid',
      type: 'material',
      role: 'advected particle fluid',
      domains: ['fluid', 'advection'],
      controls: ['viscosity', 'density', 'flowRate'],
      params: { viscosity: 0.18, density: 0.48, flowRate: 0.45 },
      text: 'fluid particles water air smoke liquid gas viscosity material advection',
    },
    {
      id: 'wake-obstacle',
      type: 'constraint',
      role: 'obstacle producing pressure and wake',
      domains: ['fluid', 'turbulence'],
      controls: ['obstacleRadius', 'vortexStrength', 'pressure'],
      params: { obstacleRadius: 0.16, vortexStrength: 0.54, pressure: 0.48 },
      text: 'obstacle baffle wake vortex pressure drag turbulence eddy',
    },
    {
      id: 'turbulence-field',
      type: 'field',
      role: 'unsteady flow perturbation',
      domains: ['fluid', 'turbulence'],
      controls: ['turbulence', 'vortexStrength', 'windSpeed'],
      params: { turbulence: 0.32, vortexStrength: 0.7, windSpeed: 0.22 },
      text: 'turbulence swirl vortex storm chaos wind eddy unstable flow',
    },
    {
      id: 'reactant-a',
      type: 'material',
      role: 'feedstock chemical field',
      domains: ['chemistry', 'diffusion'],
      controls: ['feedRate', 'diffusionA', 'reactionRate'],
      params: { feedRate: 0.037, diffusionA: 0.92, reactionRate: 0.34 },
      text: 'chemical chemistry reactant feedstock molecule reagent diffusion gray scott',
    },
    {
      id: 'reactant-b',
      type: 'material',
      role: 'reaction product field',
      domains: ['chemistry', 'diffusion'],
      controls: ['killRate', 'diffusionB', 'reactionRate'],
      params: { killRate: 0.061, diffusionB: 0.48, reactionRate: 0.34 },
      text: 'product reaction molecule decay kill diffusion compound chemistry',
    },
    {
      id: 'catalyst-front',
      type: 'field',
      role: 'catalyzed reaction and heat front',
      domains: ['chemistry', 'thermal'],
      controls: ['catalyst', 'reactionRate', 'heatTransfer'],
      params: { catalyst: 0.64, reactionRate: 0.42, heatTransfer: 0.32 },
      text: 'catalyst reaction front chemistry heat molecular crystal grow pattern',
    },
    {
      id: 'cooling-field',
      type: 'sink',
      role: 'thermal loss and cooling path',
      domains: ['thermal', 'energy-ledger'],
      controls: ['cooling', 'heatTransfer'],
      params: { cooling: 0.22, heatTransfer: 0.24 },
      text: 'cooling cold heat sink thermal loss radiator temperature',
    },
    {
      id: 'thermal-source',
      type: 'source',
      role: 'heat source driving Brownian motion and transfer',
      domains: ['thermal', 'mechanics'],
      controls: ['thermalFlux', 'heatTransfer'],
      params: { thermalFlux: 0.48, heatTransfer: 0.46 },
      text: 'heat thermal source hot temperature conduction convection brownian',
    },
    {
      id: 'optical-prism',
      type: 'field',
      role: 'refractive prism that splits light paths',
      domains: ['optics', 'field'],
      controls: ['refractiveIndex', 'lightIntensity'],
      params: { refractiveIndex: 1.42, lightIntensity: 0.66 },
      text: 'prism optics light laser refraction rainbow caustic lens beam split',
    },
    {
      id: 'light-source',
      type: 'source',
      role: 'directed light beam input',
      domains: ['optics', 'energy-ledger'],
      controls: ['lightIntensity', 'energyInput'],
      params: { lightIntensity: 0.66, energyInput: 0.42 },
      text: 'light laser beam photon ray source optics sunlight',
    },
    {
      id: 'acoustic-emitter',
      type: 'source',
      role: 'sound pressure wave emitter',
      domains: ['acoustics', 'wave'],
      controls: ['soundFrequency', 'waveAmplitude', 'pressure'],
      params: { soundFrequency: 0.42, waveAmplitude: 0.36, pressure: 0.42 },
      text: 'sound acoustic audio pressure wave speaker resonance standing tone',
    },
    {
      id: 'wave-source',
      type: 'field',
      role: 'surface or membrane wave driver',
      domains: ['wave', 'mechanics'],
      controls: ['waveAmplitude', 'soundFrequency', 'membraneTension'],
      params: { waveAmplitude: 0.42, soundFrequency: 0.34, membraneTension: 0.48 },
      text: 'wave ripple surface membrane oscillation sine resonance water string',
    },
    {
      id: 'buoyant-body',
      type: 'body',
      role: 'body with density and buoyant lift',
      domains: ['buoyancy', 'fluid', 'mechanics'],
      controls: ['buoyancy', 'density', 'gravity'],
      params: { buoyancy: 0.42, density: 0.42, gravity: 0.08 },
      text: 'buoyancy float bubble balloon boat density lift water air submerged',
    },
    {
      id: 'granular-bed',
      type: 'material',
      role: 'granular material with frictional pile behavior',
      domains: ['granular', 'collision'],
      controls: ['granularFriction', 'gravity', 'density'],
      params: { granularFriction: 0.48, gravity: 0.18, density: 0.76 },
      text: 'sand granular powder grains pile avalanche friction material particle',
    },
    {
      id: 'electric-field',
      type: 'field',
      role: 'electric force field acting on charged particles',
      domains: ['electricity', 'field'],
      controls: ['electricField', 'charge', 'fieldStrength'],
      params: { electricField: 0.42, charge: 0.38, fieldStrength: 0.52 },
      text: 'electric field charge electron voltage current ion electromagnetic force',
    },
    {
      id: 'plasma-arc',
      type: 'material',
      role: 'ionized plasma arc with heat and field coupling',
      domains: ['plasma', 'electricity', 'thermal'],
      controls: ['plasmaTemperature', 'electricField', 'thermalFlux'],
      params: { plasmaTemperature: 0.52, electricField: 0.62, thermalFlux: 0.44 },
      text: 'plasma arc ion glow discharge lightning electric heat magnetic',
    },
    {
      id: 'wind-field',
      type: 'field',
      role: 'moving air field with drag and lift',
      domains: ['fluid', 'advection'],
      controls: ['windSpeed', 'turbulence', 'flowRate'],
      params: { windSpeed: 0.36, turbulence: 0.24, flowRate: 0.34 },
      text: 'wind air airflow lift drag breeze gust smoke vortex',
    },
    {
      id: 'pressure-vessel',
      type: 'constraint',
      role: 'pressurized chamber boundary',
      domains: ['pressure', 'fluid'],
      controls: ['pressure', 'restitution', 'density'],
      params: { pressure: 0.62, restitution: 0.7, density: 0.58 },
      text: 'pressure vessel chamber tank gas compressed container boundary',
    },
    {
      id: 'sun-star',
      type: 'source',
      role: 'radiating star with light, heat, and solar flux',
      domains: ['solar', 'radiation', 'thermal', 'optics'],
      controls: ['irradiance', 'lightIntensity', 'thermalFlux', 'albedo'],
      params: { irradiance: 980, lightIntensity: 0.82, thermalFlux: 0.58, albedo: 0.22 },
      text: 'sun star solar sunlight radiation light heat stellar photosphere daylight',
    },
    {
      id: 'fire-front',
      type: 'source',
      role: 'combustion front that turns fuel into heat, light, and smoke',
      domains: ['fire', 'thermal', 'chemistry', 'fluid'],
      controls: ['combustibility', 'thermalFlux', 'reactionRate', 'moisture'],
      params: { combustibility: 0.62, thermalFlux: 0.72, reactionRate: 0.58, moisture: 0.16 },
      text: 'fire flame combustion burning fuel smoke heat light ignition ember blaze',
    },
    {
      id: 'water-volume',
      type: 'material',
      role: 'liquid water mass with flow, buoyancy, and thermal capacity',
      domains: ['water', 'fluid', 'liquid', 'thermal'],
      controls: ['viscosity', 'density', 'buoyancy', 'heatTransfer', 'moisture'],
      params: { viscosity: 0.12, density: 0.68, buoyancy: 0.5, heatTransfer: 0.46, moisture: 0.9 },
      text: 'water liquid ocean river lake droplet fluid wet moisture surface tension',
    },
    {
      id: 'rock-mass',
      type: 'material',
      role: 'hard mineral rock with mass, terrain, fracture, and erosion response',
      domains: ['rock', 'mineral', 'solid', 'terrain'],
      controls: ['hardness', 'density', 'erosionRate', 'restitution'],
      params: { hardness: 0.86, density: 0.92, erosionRate: 0.08, restitution: 0.24 },
      text: 'rock stone mineral boulder basalt granite hard solid terrain fracture',
    },
    {
      id: 'wood-fiber',
      type: 'material',
      role: 'organic wood fiber with moisture, grain, stiffness, and combustion',
      domains: ['wood', 'organic', 'solid', 'fire'],
      controls: ['combustibility', 'moisture', 'hardness', 'bondStrength'],
      params: { combustibility: 0.68, moisture: 0.34, hardness: 0.42, bondStrength: 0.46 },
      text: 'wood timber tree fiber cellulose organic grain combustible fuel',
    },
    {
      id: 'metal-conductor',
      type: 'material',
      role: 'metal conductor with density, heat flow, and electric current',
      domains: ['metal', 'solid', 'electricity', 'thermal'],
      controls: ['conductivity', 'density', 'hardness', 'heatTransfer'],
      params: { conductivity: 0.84, density: 0.94, hardness: 0.72, heatTransfer: 0.68 },
      text: 'metal conductor copper silver gold steel iron current heat dense malleable',
    },
    {
      id: 'magnetic-core',
      type: 'material',
      role: 'magnetic material core with magnetization and field coupling',
      domains: ['magnetic', 'electromagnetism', 'metal', 'field'],
      controls: ['magnetization', 'magneticStrength', 'conductivity', 'fieldStrength'],
      params: { magnetization: 0.72, magneticStrength: 0.72, conductivity: 0.42, fieldStrength: 0.58 },
      text: 'magnet magnetic ferromagnetic iron steel core poles field lodestone',
    },
    {
      id: 'glass-pane',
      type: 'material',
      role: 'transparent glass that refracts, reflects, and transmits light',
      domains: ['glass', 'optics', 'solid', 'mineral'],
      controls: ['refractiveIndex', 'opacity', 'hardness', 'lightIntensity'],
      params: { refractiveIndex: 1.52, opacity: 0.14, hardness: 0.56, lightIntensity: 0.5 },
      text: 'glass silica transparent pane lens window optics refraction reflection brittle',
    },
    {
      id: 'ceramic-shell',
      type: 'material',
      role: 'brittle ceramic mineral shell with heat resistance and hardness',
      domains: ['ceramic', 'mineral', 'solid', 'thermal'],
      controls: ['hardness', 'heatTransfer', 'density', 'restitution'],
      params: { hardness: 0.82, heatTransfer: 0.18, density: 0.66, restitution: 0.18 },
      text: 'ceramic clay porcelain mineral brittle insulator heat resistant shell',
    },
    {
      id: 'crystal-lattice',
      type: 'material',
      role: 'ordered crystal lattice with bonds, symmetry, and optical response',
      domains: ['crystal', 'lattice', 'mineral', 'optics'],
      controls: ['bondStrength', 'refractiveIndex', 'hardness', 'density'],
      params: { bondStrength: 0.74, refractiveIndex: 1.62, hardness: 0.78, density: 0.58 },
      text: 'crystal lattice quartz salt diamond ordered mineral symmetry facet',
    },
    {
      id: 'atom-core',
      type: 'material',
      role: 'atomic nucleus and shell proxy for mass, charge, and bonding',
      domains: ['atomic', 'matter', 'chemistry'],
      controls: ['atomicMass', 'charge', 'bondStrength', 'density'],
      params: { atomicMass: 28, charge: 0.08, bondStrength: 0.42, density: 0.36 },
      text: 'atom atomic nucleus proton neutron shell element matter particle mass',
    },
    {
      id: 'electron-cloud',
      type: 'field',
      role: 'mobile electron cloud that carries charge and conductivity',
      domains: ['atomic', 'electricity', 'field'],
      controls: ['charge', 'conductivity', 'electricField', 'ionization'],
      params: { charge: -0.72, conductivity: 0.72, electricField: 0.46, ionization: 0.24 },
      text: 'electron cloud orbital charge current electricity valence carrier field',
    },
    {
      id: 'ion-pair',
      type: 'material',
      role: 'charged ion pair with attraction, repulsion, and plasma coupling',
      domains: ['atomic', 'plasma', 'chemistry', 'electricity'],
      controls: ['ionization', 'charge', 'electricField', 'bondStrength'],
      params: { ionization: 0.58, charge: 0.48, electricField: 0.44, bondStrength: 0.34 },
      text: 'ion ionic charged cation anion plasma electrolyte attraction repulsion',
    },
    {
      id: 'molecular-bond',
      type: 'constraint',
      role: 'chemical bond constraint between atoms or molecules',
      domains: ['atomic', 'chemistry', 'cohesion'],
      controls: ['bondStrength', 'cohesion', 'thermalFlux', 'reactionRate'],
      params: { bondStrength: 0.66, cohesion: 0.48, thermalFlux: 0.18, reactionRate: 0.28 },
      text: 'molecule molecular bond covalent ionic chemical atom chain compound',
    },
    {
      id: 'feedback-controller',
      type: 'controller',
      role: 'closed-loop controller that steers fields toward a target',
      domains: ['control', 'signal'],
      controls: ['controlGain', 'signalDelay', 'damping'],
      params: { controlGain: 0.58, signalDelay: 0.18, damping: 0.07 },
      text: 'feedback controller pid control gain loop target servo regulator stability',
    },
    {
      id: 'sensor-array',
      type: 'sensor',
      role: 'distributed sensors that measure state with noise',
      domains: ['signal', 'measurement'],
      controls: ['signalNoise', 'signalDelay', 'fieldStrength'],
      params: { signalNoise: 0.18, signalDelay: 0.16, fieldStrength: 0.34 },
      text: 'sensor array measurement signal observation telemetry noisy data monitor probe',
    },
    {
      id: 'delay-buffer',
      type: 'constraint',
      role: 'lagged memory buffer that delays action and flow',
      domains: ['control', 'network'],
      controls: ['signalDelay', 'networkLatency', 'damping'],
      params: { signalDelay: 0.36, networkLatency: 0.22, damping: 0.09 },
      text: 'delay latency lag buffer memory pipeline postponed action feedback queue',
    },
    {
      id: 'queue-server',
      type: 'process',
      role: 'arrival queue with service capacity and backlog pressure',
      domains: ['queue', 'operations'],
      controls: ['queueBacklog', 'serviceRate', 'marketDemand'],
      params: { queueBacklog: 0.42, serviceRate: 0.58, marketDemand: 0.32 },
      text: 'queue backlog server service arrival wait line congestion operations bottleneck',
    },
    {
      id: 'network-link',
      type: 'field',
      role: 'network edge with latency, packet flow, and capacity loss',
      domains: ['network', 'signal'],
      controls: ['networkLatency', 'signalNoise', 'serviceRate'],
      params: { networkLatency: 0.32, signalNoise: 0.16, serviceRate: 0.52 },
      text: 'network graph link packet latency bandwidth relay internet distributed node',
    },
    {
      id: 'terrain-heightfield',
      type: 'material',
      role: 'heightfield terrain that redirects flow and motion',
      domains: ['terrain', 'geometry'],
      controls: ['terrainSlope', 'density', 'gravity'],
      params: { terrainSlope: 0.28, density: 0.62, gravity: 0.08 },
      text: 'terrain heightfield landscape slope mountain valley ground surface elevation',
    },
    {
      id: 'erosion-channel',
      type: 'process',
      role: 'flow-carved erosion channel that transports material',
      domains: ['terrain', 'erosion', 'fluid'],
      controls: ['erosionRate', 'flowRate', 'terrainSlope'],
      params: { erosionRate: 0.28, flowRate: 0.42, terrainSlope: 0.22 },
      text: 'erosion river channel sediment carve drainage water terrain flow',
    },
    {
      id: 'phase-change-material',
      type: 'material',
      role: 'material that melts, freezes, or boils around a threshold',
      domains: ['phase-change', 'thermal'],
      controls: ['phaseThreshold', 'latentHeat', 'thermalFlux'],
      params: { phaseThreshold: 0.52, latentHeat: 0.48, thermalFlux: 0.36 },
      text: 'phase change melt freeze boil evaporate ice steam latent heat threshold material',
    },
    {
      id: 'adhesion-film',
      type: 'constraint',
      role: 'surface adhesion layer that sticks bodies to boundaries',
      domains: ['surface', 'mechanics'],
      controls: ['adhesion', 'cohesion', 'damping'],
      params: { adhesion: 0.34, cohesion: 0.24, damping: 0.1 },
      text: 'adhesion sticky surface contact glue friction wetting boundary',
    },
    {
      id: 'cohesive-cluster',
      type: 'field',
      role: 'cohesive attraction that clusters nearby particles',
      domains: ['cohesion', 'material'],
      controls: ['cohesion', 'density', 'fieldStrength'],
      params: { cohesion: 0.44, density: 0.58, fieldStrength: 0.38 },
      text: 'cohesion cluster aggregate flock swarm attraction material droplets',
    },
    {
      id: 'population-field',
      type: 'actor',
      role: 'growing population density affected by resources and pressure',
      domains: ['biology', 'population'],
      controls: ['populationGrowth', 'density', 'energyInput'],
      params: { populationGrowth: 0.36, density: 0.48, energyInput: 0.52 },
      text: 'population biology ecosystem growth agents people cells colony species resource',
    },
    {
      id: 'infection-front',
      type: 'field',
      role: 'spreading front over a population or contact graph',
      domains: ['biology', 'diffusion'],
      controls: ['infectionRate', 'diffusionB', 'signalDelay'],
      params: { infectionRate: 0.24, diffusionB: 0.46, signalDelay: 0.18 },
      text: 'infection disease epidemic contagion spread front biology diffusion contact',
    },
    {
      id: 'market-demand',
      type: 'source',
      role: 'demand pressure that pulls resources through a system',
      domains: ['economics', 'market'],
      controls: ['marketDemand', 'priceElasticity', 'serviceRate'],
      params: { marketDemand: 0.52, priceElasticity: 0.38, serviceRate: 0.5 },
      text: 'market demand price economics consumer supply trade scarcity incentive',
    },
    {
      id: 'logistics-node',
      type: 'process',
      role: 'warehouse or hub that routes inventory between flows',
      domains: ['logistics', 'queue', 'network'],
      controls: ['queueBacklog', 'serviceRate', 'networkLatency'],
      params: { queueBacklog: 0.36, serviceRate: 0.62, networkLatency: 0.24 },
      text: 'logistics warehouse inventory supply chain route hub transport port delivery',
    },
    {
      id: 'noise-field',
      type: 'field',
      role: 'stochastic disturbance field that perturbs measurements and motion',
      domains: ['noise', 'signal'],
      controls: ['signalNoise', 'turbulence', 'fieldStrength'],
      params: { signalNoise: 0.28, turbulence: 0.18, fieldStrength: 0.22 },
      text: 'noise stochastic random disturbance uncertainty jitter sensor signal measurement',
    },
    {
      id: 'data-recorder',
      type: 'ledger',
      role: 'trace recorder for state history, events, and audit output',
      domains: ['data', 'energy-ledger'],
      controls: ['signalNoise', 'serviceRate'],
      params: { signalNoise: 0.08, serviceRate: 0.72 },
      text: 'data recorder trace audit history event log telemetry receipt measurement',
    },
  ]);

  function toCatalogItem(layer, item) {
    const id = String(item.id);
    const label = item.label || labelize(id);
    const idTerms = id.split(/[-_]+/).filter((term) => term.length > 2);
    const domains = uniqueList([...(item.domains || []), layer, id, ...idTerms]);
    return {
      id,
      label,
      type: item.type || layer,
      layer,
      role: item.role || `${label} ${layer}`,
      domains,
      controls: item.controls || [],
      params: item.params || {},
      recipe: item.recipe || [],
      text: `${label} ${item.text || ''} ${domains.join(' ')} ${(item.recipe || []).join(' ')}`,
    };
  }

  function uniqueCatalogItems(...groups) {
    const seen = new Set();
    const out = [];
    for (const group of groups) {
      for (const item of group) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return Object.freeze(out);
  }

  const LAYER_STACK = Object.freeze([
    { id: 'math', index: 1, composes: [], role: 'numeric containers, topology, operators, and invariants' },
    { id: 'physics', index: 2, composes: ['math'], role: 'physical operators over math forms' },
    { id: 'material', index: 3, composes: ['physics'], role: 'matter profiles over physical operators' },
    { id: 'component', index: 4, composes: ['material'], role: 'usable parts made from materials' },
    { id: 'composition', index: 5, composes: ['component'], role: 'systems assembled from parts' },
    { id: 'scene', index: 6, composes: ['composition'], role: 'world frames assembled from systems' },
  ]);

  const LAYER_INDEX = Object.freeze(Object.fromEntries(
    LAYER_STACK.map((layer) => [layer.id, layer.index])
  ));

  const COMPILER_INPUT_PLANE = Object.freeze({
    id: 'compiler',
    role: 'natural language, embeddings, semantic retrieval, and local model hints select and fill layers without becoming a layer',
    inputs: ['prompt', 'seed', 'embedding-priors', 'doppler-hints', 'semantic-rag'],
    emits: ['target-layer', 'ranked-primitives', 'slot-fills', 'physical-graph-deltas'],
    targetLayers: LAYER_STACK.map((layer) => layer.id),
  });

  const MATH_PRIMITIVE_LIBRARY = Object.freeze([
    { id: 'scalar', type: 'field', text: 'single numeric degree value parameter coordinate' },
    { id: 'vector', type: 'field', text: 'ordered numeric tuple direction magnitude basis coordinate' },
    { id: 'matrix-tensor', type: 'field', text: 'matrix tensor transform jacobian covariance multilinear array' },
    { id: 'scalar-field', type: 'field', text: 'scalar field sampled numeric value over domain' },
    { id: 'vector-field', type: 'field', text: 'vector field sampled tuple over domain' },
    { id: 'grid-lattice', type: 'field', text: 'grid lattice raster cells indices neighbors stencil' },
    { id: 'grid-heightfield', type: 'field', text: 'heightfield raster scalar samples surface elevation grid' },
    { id: 'particle-set', type: 'field', text: 'particle set points agents samples ids attributes' },
    { id: 'graph-network', type: 'field', text: 'graph network nodes edges links routing topology' },
    { id: 'curve-path', type: 'field', text: 'curve path polyline spline ordered samples arc length' },
    { id: 'surface-boundary', type: 'constraint', text: 'surface boundary domain edge interface normal' },
    { id: 'signed-distance-field', type: 'field', text: 'signed distance field implicit surface distance normal' },
    { id: 'distribution-noise', type: 'field', text: 'distribution noise random sample stochastic uncertainty seed' },
    { id: 'threshold', type: 'constraint', text: 'threshold comparator crossing gate activation cutoff' },
    { id: 'constraint', type: 'constraint', text: 'constraint relation invariant boundary limit equation' },
    { id: 'source-sink', type: 'source', text: 'source sink boundary condition input output port reservoir' },
    { id: 'oscillator', type: 'field', text: 'oscillator periodic basis sine phase cycle waveform' },
    { id: 'delay', type: 'constraint', text: 'delay lag buffer memory latency feedback state' },
    { id: 'queue', type: 'process', text: 'queue ordered buffer arrivals departures service discipline' },
    { id: 'conservation-ledger', type: 'ledger', text: 'conservation ledger invariant balance accounting quantity' },
    { id: 'unit-dimension', type: 'ledger', text: 'unit dimension base exponent measure conversion schema' },
    { id: 'time-step', type: 'constraint', text: 'time step integrator tick delta stability schedule' },
    { id: 'kernel', type: 'field', text: 'kernel stencil neighborhood weighting filter convolution' },
    { id: 'gradient', type: 'field', text: 'gradient differential operator local slope derivative' },
    { id: 'divergence', type: 'field', text: 'divergence differential operator outward rate field' },
    { id: 'curl', type: 'field', text: 'curl differential operator circulation rotation field' },
    { id: 'laplacian', type: 'field', text: 'laplacian differential operator curvature second derivative' },
    { id: 'interpolation', type: 'field', text: 'interpolation resampling lerp spline blend lookup' },
    { id: 'sampling', type: 'field', text: 'sampling discretization probe rasterization monte carlo' },
    { id: 'coordinate-frame', type: 'field', text: 'coordinate frame origin axes basis orientation transform' },
    { id: 'affine-transform', type: 'field', text: 'affine transform translate rotate scale shear homogeneous map' },
    { id: 'quaternion', type: 'field', text: 'quaternion orientation rotation algebra normalized tuple' },
    { id: 'simplex-mesh', type: 'field', text: 'simplex mesh triangles tetrahedra indexed topology cells' },
    { id: 'polygon-mesh', type: 'field', text: 'polygon mesh vertices faces uv normals topology' },
    { id: 'voxel-grid', type: 'field', text: 'voxel grid discrete volume cells occupancy samples' },
    { id: 'sparse-grid', type: 'field', text: 'sparse grid hashed cells active tiles hierarchy' },
    { id: 'adaptive-tree', type: 'field', text: 'adaptive tree subdivision quadtree octree hierarchy' },
    { id: 'neighbor-list', type: 'field', text: 'neighbor list local pairs adjacency proximity lookup' },
    { id: 'adjacency-matrix', type: 'field', text: 'adjacency matrix graph connectivity relation table' },
    { id: 'incidence-matrix', type: 'field', text: 'incidence matrix graph node edge relation table' },
    { id: 'constraint-graph', type: 'constraint', text: 'constraint graph equations dependencies limits joints' },
    { id: 'event-queue', type: 'process', text: 'event queue scheduled transitions ordering triggers' },
    { id: 'ring-buffer', type: 'process', text: 'ring buffer cyclic samples streaming history window' },
    { id: 'state-vector', type: 'field', text: 'state vector packed variables phase coordinates' },
    { id: 'state-machine', type: 'process', text: 'state machine finite modes transitions guards' },
    { id: 'markov-chain', type: 'process', text: 'markov chain stochastic states transitions probabilities' },
    { id: 'random-walk', type: 'process', text: 'random walk stochastic path brownian steps diffusion basis' },
    { id: 'basis-function', type: 'field', text: 'basis function projection interpolation polynomial spline' },
    { id: 'spectral-basis', type: 'field', text: 'spectral basis frequency modes harmonics transform' },
    { id: 'level-set', type: 'field', text: 'level set implicit contour crossing interface' },
    { id: 'interval-bound', type: 'constraint', text: 'interval bound min max clamp domain range' },
    { id: 'distance-metric', type: 'field', text: 'distance metric norm geodesic nearest measure' },
    { id: 'potential-field', type: 'field', text: 'potential field abstract scalar basin attractor landscape' },
  ].map((item) => toCatalogItem('math', item)));

  const PHYSICS_PRIMITIVE_LIBRARY = Object.freeze([
    { id: 'rigid-body', type: 'body', controls: ['density'], recipe: ['vector', 'matrix-tensor', 'constraint', 'time-step'], text: 'rigid body inertia rotation contact momentum' },
    { id: 'soft-body', type: 'body', controls: ['membraneTension'], recipe: ['particle-set', 'grid-lattice', 'constraint', 'time-step'], text: 'soft body deformation elasticity mesh continuum' },
    { id: 'gravity', type: 'field', controls: ['gravity'], recipe: ['vector-field', 'gradient', 'unit-dimension'], text: 'gravity weight orbit acceleration well' },
    { id: 'collision', type: 'constraint', controls: ['restitution'], recipe: ['surface-boundary', 'constraint', 'time-step'], text: 'collision impact contact restitution bounce' },
    { id: 'friction', type: 'loss', controls: ['friction'], recipe: ['vector', 'constraint', 'kernel'], text: 'friction drag resistance damping loss' },
    { id: 'elasticity', type: 'constraint', controls: ['springConstant'], recipe: ['constraint', 'oscillator', 'gradient'], text: 'elasticity spring stretch compression restoring force' },
    { id: 'pressure', type: 'field', controls: ['pressure'], recipe: ['scalar-field', 'gradient', 'unit-dimension'], text: 'pressure compression gas liquid vessel' },
    { id: 'buoyancy', type: 'field', controls: ['buoyancy'], recipe: ['scalar-field', 'vector-field', 'gradient'], text: 'buoyancy float lift density displacement' },
    { id: 'fluid-advection', type: 'field', controls: ['flowRate'], recipe: ['vector-field', 'particle-set', 'time-step'], text: 'fluid advection flow transport velocity stream' },
    { id: 'diffusion', type: 'field', controls: ['diffusionA', 'diffusionB'], recipe: ['scalar-field', 'laplacian', 'time-step'], text: 'diffusion spread gradient concentration mixing' },
    { id: 'heat-transfer', type: 'field', controls: ['heatTransfer'], recipe: ['scalar-field', 'laplacian', 'unit-dimension'], text: 'heat transfer conduction convection temperature' },
    { id: 'radiation', type: 'source', controls: ['irradiance'], recipe: ['vector-field', 'sampling', 'source-sink'], text: 'radiation sunlight emission photons energy' },
    { id: 'combustion', type: 'process', controls: ['combustibility'], recipe: ['threshold', 'scalar-field', 'conservation-ledger'], text: 'combustion burning fuel oxygen flame heat smoke' },
    { id: 'phase-change', type: 'process', controls: ['phaseThreshold'], recipe: ['threshold', 'scalar-field', 'unit-dimension'], text: 'phase change melt freeze boil vaporize condense' },
    { id: 'optics', type: 'field', controls: ['refractiveIndex'], recipe: ['vector-field', 'surface-boundary', 'sampling'], text: 'optics light reflection refraction lens prism' },
    { id: 'electromagnetism', type: 'field', controls: ['electricField'], recipe: ['vector-field', 'curl', 'divergence'], text: 'electromagnetism charge current voltage field' },
    { id: 'magnetism', type: 'field', controls: ['magnetization'], recipe: ['vector-field', 'curl', 'gradient'], text: 'magnetism poles magnetic field attraction repulsion' },
    { id: 'chemical-reaction', type: 'process', controls: ['reactionRate'], recipe: ['scalar-field', 'kernel', 'time-step'], text: 'chemical reaction reactants products catalyst rate' },
    { id: 'erosion', type: 'process', controls: ['erosionRate'], recipe: ['grid-heightfield', 'vector-field', 'gradient'], text: 'erosion sediment carve river terrain weathering' },
    { id: 'growth-decay', type: 'process', controls: ['populationGrowth'], recipe: ['scalar-field', 'graph-network', 'time-step'], text: 'growth decay population biomass infection exponential' },
    { id: 'contact-manifold', type: 'constraint', controls: ['restitution'], recipe: ['surface-boundary', 'constraint', 'neighbor-list', 'time-step'], text: 'contact manifold normals penetration pairs restitution' },
    { id: 'impulse-response', type: 'process', controls: ['restitution'], recipe: ['vector', 'matrix-tensor', 'constraint', 'time-step'], text: 'impulse response impact momentum correction collision solve' },
    { id: 'joint-constraint', type: 'constraint', controls: ['friction'], recipe: ['constraint-graph', 'matrix-tensor', 'time-step'], text: 'joint constraint hinge slider revolute prismatic articulation' },
    { id: 'angular-dynamics', type: 'field', controls: ['wheelInertia'], recipe: ['vector', 'quaternion', 'matrix-tensor', 'time-step'], text: 'angular dynamics spin torque orientation inertia rotation' },
    { id: 'fracture-mechanics', type: 'process', controls: ['hardness'], recipe: ['surface-boundary', 'threshold', 'gradient', 'event-queue'], text: 'fracture crack shatter tear shear brittle stress' },
    { id: 'plastic-deformation', type: 'process', controls: ['hardness'], recipe: ['matrix-tensor', 'gradient', 'threshold', 'constraint'], text: 'plastic deformation bend yield dent permanent strain' },
    { id: 'granular-contact', type: 'constraint', controls: ['granularFriction'], recipe: ['particle-set', 'neighbor-list', 'constraint'], text: 'granular contact grains pile avalanche packing' },
    { id: 'viscous-flow', type: 'field', controls: ['viscosity'], recipe: ['vector-field', 'laplacian', 'time-step'], text: 'viscous flow shear drag laminar resistance liquid' },
    { id: 'turbulence', type: 'field', controls: ['turbulence'], recipe: ['vector-field', 'curl', 'spectral-basis', 'time-step'], text: 'turbulence eddies vortices cascade chaotic flow' },
    { id: 'surface-tension', type: 'constraint', controls: ['cohesion'], recipe: ['surface-boundary', 'gradient', 'constraint'], text: 'surface tension droplets meniscus cohesion interface' },
    { id: 'capillary-action', type: 'field', controls: ['adhesion'], recipe: ['curve-path', 'surface-boundary', 'gradient'], text: 'capillary action wick porous tube wetting' },
    { id: 'wave-propagation', type: 'field', controls: ['waveAmplitude'], recipe: ['scalar-field', 'oscillator', 'laplacian', 'time-step'], text: 'wave propagation ripple oscillation standing traveling' },
    { id: 'acoustic-propagation', type: 'field', controls: ['soundFrequency'], recipe: ['scalar-field', 'oscillator', 'laplacian', 'time-step'], text: 'acoustic sound propagation compression vibration resonance' },
    { id: 'radiative-transfer', type: 'source', controls: ['irradiance'], recipe: ['vector-field', 'sampling', 'source-sink'], text: 'radiative transfer emission absorption scattering light' },
    { id: 'charge-transport', type: 'field', controls: ['electricField'], recipe: ['graph-network', 'vector-field', 'conservation-ledger'], text: 'charge transport current drift conductor ion flow' },
    { id: 'electrolysis', type: 'process', controls: ['reactionRate'], recipe: ['threshold', 'graph-network', 'conservation-ledger'], text: 'electrolysis electrode electrolyte gas separation reaction' },
    { id: 'ionization', type: 'process', controls: ['ionization'], recipe: ['threshold', 'scalar-field', 'source-sink'], text: 'ionization plasma electron ion excitation discharge' },
    { id: 'bonding', type: 'constraint', controls: ['bondStrength'], recipe: ['constraint-graph', 'distance-metric', 'threshold'], text: 'bonding covalent ionic metallic molecular cohesion' },
    { id: 'cohesion', type: 'constraint', controls: ['cohesion'], recipe: ['particle-set', 'neighbor-list', 'kernel'], text: 'cohesion aggregation clumping attraction clusters droplets' },
    { id: 'adsorption', type: 'process', controls: ['adhesion'], recipe: ['surface-boundary', 'threshold', 'sampling'], text: 'adsorption surface attachment coating absorption sticking' },
    { id: 'catalysis', type: 'process', controls: ['catalyst'], recipe: ['kernel', 'graph-network', 'time-step'], text: 'catalysis reaction acceleration enzyme surface pathway' },
    { id: 'nucleation', type: 'process', controls: ['phaseThreshold'], recipe: ['distribution-noise', 'threshold', 'particle-set'], text: 'nucleation seed crystal bubble droplet phase origin' },
    { id: 'crystallization', type: 'process', controls: ['bondStrength'], recipe: ['grid-lattice', 'constraint-graph', 'time-step'], text: 'crystallization lattice ordered solid mineral growth' },
    { id: 'osmosis', type: 'field', controls: ['diffusionA'], recipe: ['surface-boundary', 'scalar-field', 'gradient'], text: 'osmosis membrane selective solvent concentration flow' },
    { id: 'orbital-dynamics', type: 'field', controls: ['gravity'], recipe: ['curve-path', 'vector', 'time-step'], text: 'orbital dynamics orbit ellipse gravity trajectory period' },
  ].map((item) => toCatalogItem('physics', item)));

  const MATERIAL_PRIMITIVE_LIBRARY = Object.freeze([
    { id: 'water', type: 'material', controls: ['viscosity', 'moisture'], recipe: ['pressure', 'fluid-advection', 'phase-change'], text: 'water liquid wet river lake droplet' },
    { id: 'air', type: 'material', controls: ['pressure', 'windSpeed'], recipe: ['pressure', 'fluid-advection', 'diffusion'], text: 'air gas atmosphere wind pressure' },
    { id: 'steam', type: 'material', controls: ['thermalFlux', 'pressure'], recipe: ['pressure', 'heat-transfer', 'phase-change'], text: 'steam vapor hot gas phase change' },
    { id: 'smoke', type: 'material', controls: ['turbulence', 'signalNoise'], recipe: ['fluid-advection', 'diffusion'], text: 'smoke particles plume fire advection' },
    { id: 'fire-plasma', type: 'material', controls: ['plasmaTemperature'], recipe: ['combustion', 'heat-transfer', 'radiation'], text: 'fire plasma ionized hot flame glow' },
    { id: 'ice', type: 'material', controls: ['phaseThreshold', 'hardness'], recipe: ['phase-change', 'friction', 'collision'], text: 'ice frozen water solid cold slippery' },
    { id: 'oil', type: 'material', controls: ['viscosity'], recipe: ['fluid-advection', 'friction', 'combustion'], text: 'oil viscous liquid fuel slick' },
    { id: 'sand', type: 'material', controls: ['granularFriction'], recipe: ['friction', 'collision', 'erosion'], text: 'sand grains granular pile sediment' },
    { id: 'soil', type: 'material', controls: ['moisture', 'erosionRate'], recipe: ['erosion', 'diffusion', 'growth-decay'], text: 'soil dirt earth porous organic' },
    { id: 'clay', type: 'material', controls: ['adhesion', 'moisture'], recipe: ['friction', 'pressure', 'phase-change'], text: 'clay sticky ceramic wet plasticity' },
    { id: 'rock', type: 'material', controls: ['hardness'], recipe: ['collision', 'pressure', 'erosion'], text: 'rock stone mineral boulder solid' },
    { id: 'metal', type: 'material', controls: ['conductivity', 'hardness'], recipe: ['heat-transfer', 'electromagnetism', 'collision'], text: 'metal conductor iron copper steel dense' },
    { id: 'magnetized-metal', type: 'material', controls: ['magnetization'], recipe: ['magnetism', 'electromagnetism', 'collision'], text: 'magnetized metal ferromagnetic poles field' },
    { id: 'glass', type: 'material', controls: ['refractiveIndex', 'opacity'], recipe: ['optics', 'collision', 'heat-transfer'], text: 'glass transparent silica lens brittle' },
    { id: 'wood', type: 'material', controls: ['combustibility', 'moisture'], recipe: ['combustion', 'heat-transfer', 'growth-decay'], text: 'wood timber fiber organic fuel' },
    { id: 'rubber', type: 'material', controls: ['elasticity', 'damping'], recipe: ['elasticity', 'friction', 'heat-transfer'], text: 'rubber elastic soft high friction' },
    { id: 'fabric', type: 'material', controls: ['membraneTension'], recipe: ['soft-body', 'diffusion', 'combustion'], text: 'fabric cloth weave soft body' },
    { id: 'concrete', type: 'material', controls: ['hardness', 'density'], recipe: ['collision', 'pressure', 'heat-transfer'], text: 'concrete stone aggregate structural wall' },
    { id: 'plastic', type: 'material', controls: ['hardness', 'combustibility'], recipe: ['collision', 'heat-transfer', 'combustion'], text: 'plastic polymer lightweight solid' },
    { id: 'fuel', type: 'material', controls: ['combustibility'], recipe: ['combustion', 'heat-transfer', 'chemical-reaction'], text: 'fuel gasoline biomass combustible energy' },
    { id: 'biomass', type: 'material', controls: ['populationGrowth', 'moisture'], recipe: ['growth-decay', 'combustion', 'diffusion'], text: 'biomass plant organic growth fuel' },
    { id: 'brine', type: 'material', controls: ['conductivity', 'viscosity'], recipe: ['fluid-advection', 'electromagnetism', 'diffusion'], text: 'brine salt water electrolyte conductive liquid' },
    { id: 'mercury', type: 'material', controls: ['density', 'conductivity'], recipe: ['fluid-advection', 'electromagnetism', 'optics'], text: 'mercury liquid metal dense conductive reflective' },
    { id: 'copper', type: 'material', controls: ['conductivity', 'heatTransfer'], recipe: ['electromagnetism', 'heat-transfer', 'collision'], text: 'copper conductor metal wire heat current' },
    { id: 'silicon', type: 'material', controls: ['conductivity', 'refractiveIndex'], recipe: ['electromagnetism', 'optics', 'radiation'], text: 'silicon semiconductor crystal photovoltaic glassy' },
    { id: 'carbon', type: 'material', controls: ['conductivity', 'bondStrength'], recipe: ['chemical-reaction', 'electromagnetism', 'collision'], text: 'carbon graphite diamond organic lattice bond' },
    { id: 'gel', type: 'material', controls: ['viscosity', 'cohesion'], recipe: ['soft-body', 'diffusion', 'pressure'], text: 'gel hydrogel soft wet polymer membrane' },
    { id: 'foam', type: 'material', controls: ['density', 'buoyancy'], recipe: ['soft-body', 'buoyancy', 'diffusion'], text: 'foam bubbles light porous fluid surface' },
    { id: 'membrane', type: 'material', controls: ['membraneTension', 'diffusionA'], recipe: ['soft-body', 'diffusion', 'elasticity'], text: 'membrane film skin permeable elastic boundary' },
    { id: 'leaf', type: 'material', controls: ['albedo', 'moisture'], recipe: ['growth-decay', 'radiation', 'diffusion'], text: 'leaf plant photosynthesis biomass transpiration surface' },
    { id: 'mycelium', type: 'material', controls: ['populationGrowth', 'cohesion'], recipe: ['growth-decay', 'diffusion', 'elasticity'], text: 'mycelium fungal branching biological network hyphae' },
    { id: 'protein', type: 'material', controls: ['bondStrength', 'phaseThreshold'], recipe: ['chemical-reaction', 'soft-body', 'phase-change'], text: 'protein folded molecule biological soft matter' },
    { id: 'bacteria', type: 'material', controls: ['populationGrowth', 'infectionRate'], recipe: ['growth-decay', 'diffusion', 'chemical-reaction'], text: 'bacteria microbes colony growth diffusion biology' },
    { id: 'hydrogen', type: 'material', controls: ['pressure'], recipe: ['pressure', 'diffusion', 'combustion'], text: 'hydrogen light gas molecule fuel star plasma' },
    { id: 'oxygen', type: 'material', controls: ['pressure'], recipe: ['pressure', 'diffusion', 'combustion'], text: 'oxygen gas oxidizer respiration combustion molecule' },
    { id: 'nitrogen', type: 'material', controls: ['pressure'], recipe: ['pressure', 'diffusion', 'fluid-advection'], text: 'nitrogen inert gas atmosphere molecule' },
    { id: 'helium', type: 'material', controls: ['pressure'], recipe: ['pressure', 'diffusion', 'buoyancy'], text: 'helium noble gas light buoyant balloon' },
    { id: 'carbon-dioxide', type: 'material', controls: ['pressure'], recipe: ['pressure', 'diffusion', 'radiative-transfer'], text: 'carbon dioxide gas greenhouse dissolved bubble' },
    { id: 'methane', type: 'material', controls: ['combustibility'], recipe: ['combustion', 'pressure', 'chemical-reaction'], text: 'methane gas fuel hydrocarbon molecule' },
    { id: 'ammonia', type: 'material', controls: ['reactionRate'], recipe: ['chemical-reaction', 'diffusion', 'pressure'], text: 'ammonia reactive gas nitrogen compound' },
    { id: 'ethanol', type: 'material', controls: ['viscosity', 'combustibility'], recipe: ['combustion', 'fluid-advection', 'chemical-reaction'], text: 'ethanol alcohol liquid fuel solvent' },
    { id: 'gasoline', type: 'material', controls: ['combustibility', 'viscosity'], recipe: ['combustion', 'fluid-advection', 'chemical-reaction'], text: 'gasoline hydrocarbon fuel volatile liquid' },
    { id: 'diesel', type: 'material', controls: ['combustibility', 'viscosity'], recipe: ['combustion', 'fluid-advection', 'heat-transfer'], text: 'diesel heavy fuel oil combustion liquid' },
    { id: 'salt', type: 'material', controls: ['conductivity'], recipe: ['bonding', 'diffusion', 'electromagnetism'], text: 'salt ionic crystal dissolved electrolyte' },
    { id: 'sugar', type: 'material', controls: ['bondStrength'], recipe: ['bonding', 'diffusion', 'chemical-reaction'], text: 'sugar crystal molecule dissolving organic' },
    { id: 'acid', type: 'material', controls: ['reactionRate'], recipe: ['chemical-reaction', 'diffusion', 'electrolysis'], text: 'acid corrosive solution ion reaction' },
    { id: 'base', type: 'material', controls: ['reactionRate'], recipe: ['chemical-reaction', 'diffusion', 'electrolysis'], text: 'base alkaline solution ion reaction' },
    { id: 'dna', type: 'material', controls: ['bondStrength'], recipe: ['bonding', 'chemical-reaction', 'diffusion'], text: 'dna strand genetic polymer helix nucleotide' },
    { id: 'rna', type: 'material', controls: ['bondStrength'], recipe: ['bonding', 'chemical-reaction', 'diffusion'], text: 'rna strand genetic polymer folding nucleotide' },
    { id: 'lipid', type: 'material', controls: ['membraneTension'], recipe: ['surface-tension', 'soft-body', 'diffusion'], text: 'lipid membrane vesicle bilayer fat molecule' },
    { id: 'enzyme', type: 'material', controls: ['catalyst'], recipe: ['catalysis', 'chemical-reaction', 'bonding'], text: 'enzyme catalyst protein reaction pathway' },
    { id: 'cellulose', type: 'material', controls: ['bondStrength'], recipe: ['bonding', 'soft-body', 'combustion'], text: 'cellulose plant fiber polymer wood paper' },
    { id: 'starch', type: 'material', controls: ['bondStrength'], recipe: ['bonding', 'diffusion', 'chemical-reaction'], text: 'starch organic polymer granule food' },
    { id: 'ceramic', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'fracture-mechanics'], text: 'ceramic fired clay brittle insulating solid' },
    { id: 'porcelain', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'fracture-mechanics'], text: 'porcelain ceramic glassy brittle white' },
    { id: 'quartz', type: 'material', controls: ['refractiveIndex'], recipe: ['optics', 'collision', 'crystallization'], text: 'quartz silica crystal transparent mineral' },
    { id: 'granite', type: 'material', controls: ['hardness'], recipe: ['collision', 'fracture-mechanics', 'heat-transfer'], text: 'granite igneous rock mineral grains' },
    { id: 'basalt', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'phase-change'], text: 'basalt volcanic rock dark mineral' },
    { id: 'limestone', type: 'material', controls: ['hardness'], recipe: ['collision', 'chemical-reaction', 'erosion'], text: 'limestone carbonate rock erosion acid' },
    { id: 'marble', type: 'material', controls: ['hardness'], recipe: ['collision', 'fracture-mechanics', 'optics'], text: 'marble crystalline stone polished mineral' },
    { id: 'obsidian', type: 'material', controls: ['hardness'], recipe: ['collision', 'fracture-mechanics', 'optics'], text: 'obsidian volcanic glass brittle black' },
    { id: 'asphalt', type: 'material', controls: ['viscosity'], recipe: ['viscous-flow', 'collision', 'heat-transfer'], text: 'asphalt tar aggregate road viscous solid' },
    { id: 'paper', type: 'material', controls: ['combustibility'], recipe: ['soft-body', 'combustion', 'capillary-action'], text: 'paper cellulose sheet porous absorbent' },
    { id: 'cardboard', type: 'material', controls: ['combustibility'], recipe: ['soft-body', 'combustion', 'collision'], text: 'cardboard layered paper corrugated packaging' },
    { id: 'wax', type: 'material', controls: ['phaseThreshold'], recipe: ['phase-change', 'combustion', 'heat-transfer'], text: 'wax soft melt candle hydrophobic' },
    { id: 'leather', type: 'material', controls: ['elasticity'], recipe: ['soft-body', 'friction', 'heat-transfer'], text: 'leather hide flexible organic sheet' },
    { id: 'cotton', type: 'material', controls: ['membraneTension'], recipe: ['soft-body', 'capillary-action', 'combustion'], text: 'cotton fiber fabric absorbent cellulose' },
    { id: 'wool', type: 'material', controls: ['membraneTension'], recipe: ['soft-body', 'friction', 'heat-transfer'], text: 'wool fiber fabric insulation animal' },
    { id: 'nylon', type: 'material', controls: ['elasticity'], recipe: ['soft-body', 'elasticity', 'friction'], text: 'nylon polymer fiber strong fabric' },
    { id: 'polyethylene', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'chemical-reaction'], text: 'polyethylene plastic polymer flexible sheet' },
    { id: 'resin', type: 'material', controls: ['viscosity'], recipe: ['viscous-flow', 'chemical-reaction', 'phase-change'], text: 'resin sticky polymer curing liquid' },
    { id: 'epoxy', type: 'material', controls: ['bondStrength'], recipe: ['bonding', 'chemical-reaction', 'fracture-mechanics'], text: 'epoxy adhesive cured polymer bond' },
    { id: 'gold', type: 'material', controls: ['conductivity'], recipe: ['electromagnetism', 'heat-transfer', 'collision'], text: 'gold noble metal conductor dense soft' },
    { id: 'silver', type: 'material', controls: ['conductivity'], recipe: ['electromagnetism', 'heat-transfer', 'optics'], text: 'silver reflective conductor noble metal' },
    { id: 'aluminum', type: 'material', controls: ['conductivity'], recipe: ['electromagnetism', 'heat-transfer', 'collision'], text: 'aluminum light metal conductor frame' },
    { id: 'iron', type: 'material', controls: ['magnetization'], recipe: ['magnetism', 'electromagnetism', 'collision'], text: 'iron ferromagnetic metal dense structural' },
    { id: 'titanium', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'fracture-mechanics'], text: 'titanium strong light metal aerospace' },
    { id: 'nickel', type: 'material', controls: ['magnetization'], recipe: ['magnetism', 'electromagnetism', 'heat-transfer'], text: 'nickel metal magnetic alloy conductor' },
    { id: 'zinc', type: 'material', controls: ['conductivity'], recipe: ['electromagnetism', 'chemical-reaction', 'collision'], text: 'zinc metal coating battery reactive' },
    { id: 'lead', type: 'material', controls: ['density'], recipe: ['collision', 'radiation', 'heat-transfer'], text: 'lead dense soft metal shielding' },
    { id: 'tin', type: 'material', controls: ['phaseThreshold'], recipe: ['phase-change', 'electromagnetism', 'collision'], text: 'tin soft metal solder coating' },
    { id: 'platinum', type: 'material', controls: ['catalyst'], recipe: ['catalysis', 'electromagnetism', 'heat-transfer'], text: 'platinum noble metal catalyst conductor' },
    { id: 'brass', type: 'material', controls: ['conductivity'], recipe: ['electromagnetism', 'heat-transfer', 'collision'], text: 'brass copper zinc alloy metal' },
    { id: 'bronze', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'electromagnetism'], text: 'bronze copper tin alloy bearing' },
    { id: 'steel', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'electromagnetism'], text: 'steel iron carbon alloy structural conductor' },
    { id: 'stainless-steel', type: 'material', controls: ['hardness'], recipe: ['collision', 'heat-transfer', 'electromagnetism'], text: 'stainless steel corrosion resistant alloy' },
    { id: 'graphene', type: 'material', controls: ['conductivity'], recipe: ['electromagnetism', 'bonding', 'heat-transfer'], text: 'graphene carbon sheet conductor lattice' },
    { id: 'diamond', type: 'material', controls: ['hardness'], recipe: ['bonding', 'collision', 'optics'], text: 'diamond carbon crystal hard transparent' },
  ].map((item) => toCatalogItem('material', item)));

  const PRIMITIVE_LIBRARY = uniqueCatalogItems(
    MATH_PRIMITIVE_LIBRARY,
    PHYSICS_PRIMITIVE_LIBRARY,
    MATERIAL_PRIMITIVE_LIBRARY
  );

  const COMPONENT_LIBRARY = Object.freeze([
    { id: 'sun-lamp', recipe: ['glass', 'metal', 'silicon'], text: 'sun lamp radiative light heat source' },
    { id: 'flame', recipe: ['fire-plasma', 'smoke', 'air', 'wood', 'fuel'], text: 'flame combustion heat light smoke flow' },
    { id: 'river', recipe: ['water', 'soil', 'rock', 'sand'], text: 'river flowing water channel erosion' },
    { id: 'lake', recipe: ['water', 'rock', 'sand'], text: 'lake still water reservoir buoyancy' },
    { id: 'cloud', recipe: ['air', 'water', 'steam'], text: 'cloud vapor droplets air flow' },
    { id: 'wind-field-component', recipe: ['air', 'smoke', 'foam'], text: 'wind field moving air vector flow' },
    { id: 'rock-wall', recipe: ['rock', 'concrete'], text: 'rock wall hard boundary collision' },
    { id: 'terrain-patch', recipe: ['soil', 'rock', 'sand', 'clay'], text: 'terrain patch heightfield soil rock' },
    { id: 'pipe', recipe: ['metal', 'plastic', 'rubber'], text: 'pipe boundary pressure fluid transport' },
    { id: 'pump', recipe: ['metal', 'rubber', 'water', 'copper'], text: 'pump source pressure flow' },
    { id: 'valve', recipe: ['metal', 'rubber', 'plastic'], text: 'valve threshold flow control' },
    { id: 'fan', recipe: ['metal', 'plastic', 'air', 'copper'], text: 'fan air flow rotor motor' },
    { id: 'motor', recipe: ['metal', 'copper', 'magnetized-metal'], text: 'motor electromagnetic rotation load' },
    { id: 'generator', recipe: ['metal', 'copper', 'magnetized-metal'], text: 'generator magnetic rotation output' },
    { id: 'battery', recipe: ['metal', 'copper', 'carbon', 'brine'], text: 'battery stored energy chemical source' },
    { id: 'heater', recipe: ['metal', 'copper', 'concrete'], text: 'heater thermal source' },
    { id: 'cooler', recipe: ['metal', 'water', 'copper'], text: 'cooler thermal sink radiator' },
    { id: 'lens', recipe: ['glass'], text: 'lens glass refraction focus light' },
    { id: 'mirror', recipe: ['glass', 'metal'], text: 'mirror reflective metal light' },
    { id: 'prism', recipe: ['glass'], text: 'prism glass spectrum refraction' },
    { id: 'magnet', recipe: ['magnetized-metal', 'metal'], text: 'magnet poles field attraction' },
    { id: 'wheel', recipe: ['metal', 'rubber'], text: 'wheel rotating rigid body axle' },
    { id: 'gear', recipe: ['metal', 'plastic'], text: 'gear teeth rotation constraint' },
    { id: 'sensor', recipe: ['silicon', 'glass', 'metal'], text: 'sensor measurement signal noise' },
    { id: 'controller', recipe: ['silicon', 'copper', 'plastic'], text: 'controller feedback delay threshold' },
    { id: 'atomic-sample', recipe: ['hydrogen', 'oxygen', 'carbon', 'silicon'], text: 'atomic sample element proxy charge bond mass' },
    { id: 'molecular-chain', recipe: ['protein', 'dna', 'rna', 'polyethylene'], text: 'molecular chain polymer folding bonding strand' },
    { id: 'crystal-slab', recipe: ['quartz', 'diamond', 'salt', 'silicon'], text: 'crystal slab lattice facets fracture optics' },
    { id: 'electrolyte-cell', recipe: ['brine', 'salt', 'acid', 'base', 'copper'], text: 'electrolyte cell ions electrodes charge transport' },
    { id: 'gas-volume', recipe: ['air', 'oxygen', 'nitrogen', 'helium', 'carbon-dioxide'], text: 'gas volume pressure diffusion buoyancy plume' },
    { id: 'liquid-droplet', recipe: ['water', 'oil', 'ethanol', 'mercury'], text: 'liquid droplet surface tension viscosity wetting' },
    { id: 'powder-bed', recipe: ['sand', 'salt', 'sugar', 'clay'], text: 'powder bed grains packing granular contact' },
    { id: 'polymer-sheet', recipe: ['plastic', 'nylon', 'polyethylene', 'rubber'], text: 'polymer sheet flexible membrane elasticity' },
    { id: 'biological-cell', recipe: ['membrane', 'lipid', 'protein', 'dna', 'water'], text: 'biological cell membrane protein dna diffusion' },
    { id: 'membrane-vesicle', recipe: ['lipid', 'membrane', 'water', 'protein'], text: 'membrane vesicle bilayer pressure diffusion' },
    { id: 'soil-column', recipe: ['soil', 'sand', 'clay', 'water'], text: 'soil column porous water capillary erosion' },
    { id: 'metal-beam', recipe: ['steel', 'iron', 'aluminum', 'stainless-steel'], text: 'metal beam structural load heat conductor' },
    { id: 'glass-pane', recipe: ['glass', 'quartz', 'silicon'], text: 'glass pane transparent brittle optical surface' },
    { id: 'ceramic-tile', recipe: ['ceramic', 'porcelain', 'clay'], text: 'ceramic tile brittle hard heat surface' },
    { id: 'adhesive-joint', recipe: ['epoxy', 'resin', 'wax', 'plastic'], text: 'adhesive joint bonded polymer curing interface' },
  ].map((item) => toCatalogItem('component', { ...item, type: 'component' })));

  const COMPOSITION_LIBRARY = Object.freeze([
    { id: 'forest-fire', recipe: ['flame', 'wind-field-component', 'river', 'rock-wall'], text: 'forest fire wood flame smoke wind spread' },
    { id: 'river-erosion', recipe: ['river', 'terrain-patch', 'rock-wall'], text: 'river erosion terrain sediment watershed' },
    { id: 'steam-engine', recipe: ['heater', 'pipe', 'pump', 'wheel', 'cooler'], text: 'steam engine heat water pressure wheel' },
    { id: 'wind-tunnel', recipe: ['fan', 'sensor', 'rock-wall'], text: 'wind tunnel air fan drag sensor' },
    { id: 'optics-bench', recipe: ['sun-lamp', 'lens', 'mirror', 'prism', 'sensor'], text: 'optics bench light lens mirror prism' },
    { id: 'magnetic-motor', recipe: ['magnet', 'wheel', 'motor', 'controller', 'sensor'], text: 'magnetic motor rotor magnet controller' },
    { id: 'chemical-reactor', recipe: ['heater', 'cooler', 'sensor', 'pipe', 'valve'], text: 'chemical reactor reaction heat flow control' },
    { id: 'greenhouse', recipe: ['sun-lamp', 'lens', 'river', 'sensor', 'pipe'], text: 'greenhouse glass solar heat growth' },
    { id: 'weather-cell', recipe: ['cloud', 'wind-field-component', 'sensor'], text: 'weather cell air water pressure cloud' },
    { id: 'supply-chain', recipe: ['controller', 'sensor', 'pipe', 'valve'], text: 'supply chain queue network inventory flow' },
    { id: 'infection-spread', recipe: ['sensor', 'controller', 'pipe', 'valve'], text: 'infection spread population graph delay' },
    { id: 'traffic-system', recipe: ['controller', 'sensor', 'fan', 'valve'], text: 'traffic system network queues signals' },
    { id: 'market-queue', recipe: ['controller', 'sensor', 'battery'], text: 'market queue demand service backlog' },
    { id: 'power-grid', recipe: ['generator', 'battery', 'controller', 'sensor'], text: 'power grid network source load stability' },
    { id: 'materials-lab', recipe: ['atomic-sample', 'crystal-slab', 'liquid-droplet', 'gas-volume'], text: 'materials lab samples phases fields measurements' },
    { id: 'molecular-bench', recipe: ['molecular-chain', 'membrane-vesicle', 'biological-cell', 'sensor'], text: 'molecular bench polymers membranes cells reactions' },
    { id: 'electrolysis-demo', recipe: ['electrolyte-cell', 'battery', 'sensor', 'gas-volume'], text: 'electrolysis demo electrolyte gas electrodes current' },
    { id: 'crystal-growth', recipe: ['crystal-slab', 'liquid-droplet', 'heater', 'cooler'], text: 'crystal growth nucleation cooling lattice sample' },
    { id: 'polymer-line', recipe: ['polymer-sheet', 'adhesive-joint', 'heater', 'sensor'], text: 'polymer line curing sheet adhesive heat' },
    { id: 'soil-hydrology', recipe: ['soil-column', 'liquid-droplet', 'pipe', 'sensor'], text: 'soil hydrology infiltration capillary erosion' },
    { id: 'aerosol-chamber', recipe: ['gas-volume', 'liquid-droplet', 'fan', 'sensor'], text: 'aerosol chamber droplets gas flow measurement' },
  ].map((item) => toCatalogItem('composition', { ...item, type: 'composition' })));

  const SCENE_LIBRARY = Object.freeze([
    { id: 'lab-bench', recipe: ['optics-bench', 'chemical-reactor'], text: 'lab bench instruments glass reactor optics' },
    { id: 'desert-solar-field', recipe: ['power-grid', 'greenhouse'], text: 'desert solar field radiation sand grid' },
    { id: 'mountain-watershed', recipe: ['river-erosion', 'weather-cell'], text: 'mountain watershed river erosion valley' },
    { id: 'factory-floor', recipe: ['magnetic-motor', 'steam-engine', 'chemical-reactor'], text: 'factory floor machines pipes control' },
    { id: 'city-grid', recipe: ['traffic-system', 'power-grid', 'market-queue'], text: 'city grid traffic power market' },
    { id: 'forest', recipe: ['forest-fire', 'weather-cell'], text: 'forest biomass wood fire water air' },
    { id: 'coastline-storm', recipe: ['weather-cell', 'river-erosion'], text: 'coastline storm wind water pressure' },
    { id: 'reactor-room', recipe: ['chemical-reactor', 'power-grid'], text: 'reactor room heat chemistry control' },
    { id: 'warehouse', recipe: ['supply-chain', 'market-queue'], text: 'warehouse logistics queue inventory' },
    { id: 'transit-map', recipe: ['traffic-system', 'supply-chain'], text: 'transit map routes queues network' },
    { id: 'marketplace', recipe: ['market-queue', 'supply-chain'], text: 'marketplace demand supply queue' },
    { id: 'biological-colony', recipe: ['infection-spread', 'greenhouse'], text: 'biological colony growth diffusion infection' },
    { id: 'materials-studio', recipe: ['materials-lab', 'crystal-growth'], text: 'materials studio samples crystals phases instruments' },
    { id: 'molecular-studio', recipe: ['molecular-bench', 'polymer-line'], text: 'molecular studio polymers membranes cells reactions' },
    { id: 'wet-lab', recipe: ['electrolysis-demo', 'molecular-bench'], text: 'wet lab electrolyte cell biology reaction measurement' },
    { id: 'geology-table', recipe: ['soil-hydrology', 'crystal-growth'], text: 'geology table soil minerals water crystals' },
    { id: 'atmosphere-chamber', recipe: ['aerosol-chamber', 'weather-cell'], text: 'atmosphere chamber gas droplets wind sensors' },
  ].map((item) => toCatalogItem('scene', { ...item, type: 'scene' })));

  const MATERIAL_PROPERTY_SCHEMA = Object.freeze([
    ['density', 0.5],
    ['hardness', 0.2],
    ['heatCapacity', 0.45],
    ['conductivity', 0.2],
    ['combustibility', 0],
    ['moisture', 0.1],
    ['opacity', 0.5],
    ['refractiveIndex', 1],
    ['magnetization', 0],
    ['viscosity', 0.2],
    ['phasePoint', 0.5],
  ]);

  const MATERIAL_PROPERTY_DEFAULTS = Object.freeze(Object.fromEntries(MATERIAL_PROPERTY_SCHEMA));

  const MATERIAL_PROFILES = Object.freeze({
    water: { density: 0.62, heatCapacity: 0.92, moisture: 1, viscosity: 0.16, phasePoint: 0.5 },
    air: { density: 0.08, heatCapacity: 0.18, opacity: 0.04, viscosity: 0.04 },
    steam: { density: 0.12, heatCapacity: 0.72, moisture: 0.48, opacity: 0.18, phasePoint: 0.74 },
    smoke: { density: 0.16, heatCapacity: 0.26, opacity: 0.72, viscosity: 0.18 },
    'fire-plasma': { density: 0.08, conductivity: 0.82, opacity: 0.42, phasePoint: 0.92 },
    ice: { density: 0.58, hardness: 0.5, heatCapacity: 0.68, moisture: 0.82, phasePoint: 0.2 },
    oil: { density: 0.46, heatCapacity: 0.46, combustibility: 0.74, viscosity: 0.58 },
    sand: { density: 0.72, hardness: 0.44, heatCapacity: 0.36, opacity: 0.9, viscosity: 0.02 },
    soil: { density: 0.58, hardness: 0.22, heatCapacity: 0.42, moisture: 0.36, opacity: 0.95 },
    clay: { density: 0.62, hardness: 0.28, moisture: 0.48, opacity: 0.95, viscosity: 0.72 },
    rock: { density: 0.86, hardness: 0.88, heatCapacity: 0.32, opacity: 1 },
    metal: { density: 0.92, hardness: 0.72, heatCapacity: 0.3, conductivity: 0.9, opacity: 1 },
    'magnetized-metal': { density: 0.92, hardness: 0.74, conductivity: 0.72, magnetization: 0.92, opacity: 1 },
    glass: { density: 0.54, hardness: 0.56, conductivity: 0.08, opacity: 0.08, refractiveIndex: 1.52 },
    wood: { density: 0.42, hardness: 0.36, heatCapacity: 0.34, combustibility: 0.76, moisture: 0.28 },
    rubber: { density: 0.34, hardness: 0.18, heatCapacity: 0.44, combustibility: 0.24, viscosity: 0.44 },
    fabric: { density: 0.2, hardness: 0.04, combustibility: 0.58, moisture: 0.28, opacity: 0.72 },
    concrete: { density: 0.78, hardness: 0.78, heatCapacity: 0.34, opacity: 1 },
    plastic: { density: 0.28, hardness: 0.26, heatCapacity: 0.42, combustibility: 0.36, opacity: 0.62 },
    fuel: { density: 0.44, heatCapacity: 0.28, combustibility: 0.94, viscosity: 0.22 },
    biomass: { density: 0.34, heatCapacity: 0.5, combustibility: 0.66, moisture: 0.44, opacity: 0.86 },
    brine: { density: 0.68, heatCapacity: 0.86, conductivity: 0.62, moisture: 1, viscosity: 0.22 },
    mercury: { density: 1, hardness: 0.08, conductivity: 0.78, opacity: 1, viscosity: 0.16 },
    copper: { density: 0.9, hardness: 0.58, heatCapacity: 0.28, conductivity: 0.96, opacity: 1 },
    silicon: { density: 0.52, hardness: 0.62, conductivity: 0.34, opacity: 0.52, refractiveIndex: 1.74 },
    carbon: { density: 0.62, hardness: 0.74, heatCapacity: 0.4, conductivity: 0.48, opacity: 1 },
    gel: { density: 0.4, hardness: 0.05, heatCapacity: 0.76, moisture: 0.84, viscosity: 0.82 },
    foam: { density: 0.08, hardness: 0.02, heatCapacity: 0.28, opacity: 0.36, viscosity: 0.28 },
    membrane: { density: 0.18, hardness: 0.08, heatCapacity: 0.44, moisture: 0.4, opacity: 0.5 },
    leaf: { density: 0.16, heatCapacity: 0.52, combustibility: 0.42, moisture: 0.62, opacity: 0.72 },
    mycelium: { density: 0.18, hardness: 0.04, heatCapacity: 0.5, moisture: 0.68, opacity: 0.64 },
    protein: { density: 0.24, hardness: 0.08, heatCapacity: 0.48, moisture: 0.55, phasePoint: 0.58 },
    bacteria: { density: 0.12, hardness: 0.02, heatCapacity: 0.5, moisture: 0.72, opacity: 0.3 },
  });

  const METAL_MATERIAL_IDS = new Set([
    'gold', 'silver', 'aluminum', 'iron', 'titanium', 'nickel', 'zinc',
    'lead', 'tin', 'platinum', 'brass', 'bronze', 'steel', 'stainless-steel',
  ]);
  const GAS_MATERIAL_IDS = new Set([
    'hydrogen', 'oxygen', 'nitrogen', 'helium', 'carbon-dioxide', 'methane',
    'ammonia',
  ]);
  const MINERAL_MATERIAL_IDS = new Set([
    'ceramic', 'porcelain', 'quartz', 'granite', 'basalt', 'limestone',
    'marble', 'obsidian', 'diamond',
  ]);
  const ORGANIC_MATERIAL_IDS = new Set([
    'ethanol', 'gasoline', 'diesel', 'sugar', 'starch', 'wax', 'leather',
    'cotton', 'wool', 'cellulose',
  ]);
  const POLYMER_MATERIAL_IDS = new Set([
    'nylon', 'polyethylene', 'resin', 'epoxy', 'paper', 'cardboard',
  ]);
  const BIO_MOLECULE_MATERIAL_IDS = new Set([
    'dna', 'rna', 'lipid', 'enzyme',
  ]);

  function generatedMaterialPropertiesForId(id) {
    if (METAL_MATERIAL_IDS.has(id)) {
      return { density: 0.82, hardness: 0.64, heatCapacity: 0.3, conductivity: 0.82, opacity: 1 };
    }
    if (GAS_MATERIAL_IDS.has(id)) {
      return { density: 0.08, heatCapacity: 0.22, opacity: 0.05, viscosity: 0.05 };
    }
    if (MINERAL_MATERIAL_IDS.has(id)) {
      return { density: 0.74, hardness: 0.82, heatCapacity: 0.32, opacity: 0.92, refractiveIndex: 1.38 };
    }
    if (ORGANIC_MATERIAL_IDS.has(id)) {
      return { density: 0.36, hardness: 0.16, heatCapacity: 0.48, combustibility: 0.62, viscosity: 0.28 };
    }
    if (POLYMER_MATERIAL_IDS.has(id)) {
      return { density: 0.3, hardness: 0.22, heatCapacity: 0.44, combustibility: 0.34, viscosity: 0.4 };
    }
    if (BIO_MOLECULE_MATERIAL_IDS.has(id)) {
      return { density: 0.22, hardness: 0.04, heatCapacity: 0.52, moisture: 0.68, viscosity: 0.55 };
    }
    if (id === 'graphene') return { density: 0.36, hardness: 0.68, conductivity: 0.98, opacity: 0.24 };
    if (id === 'acid' || id === 'base') return { density: 0.5, heatCapacity: 0.74, conductivity: 0.58, moisture: 1, viscosity: 0.18 };
    if (id === 'salt') return { density: 0.64, hardness: 0.38, conductivity: 0.34, opacity: 0.78 };
    return {};
  }

  const GEOMETRY_PROFILES = Object.freeze({
    field: { shape: 'scalar field', dimension: '2d', spatial: 'continuous' },
    material: { shape: 'particle cloud', dimension: '2d', spatial: 'volume' },
    body: { shape: 'rigid body', dimension: '2d', spatial: 'object' },
    constraint: { shape: 'boundary', dimension: '2d', spatial: 'edge' },
    source: { shape: 'source/sink', dimension: '2d', spatial: 'port' },
    sink: { shape: 'source/sink', dimension: '2d', spatial: 'port' },
    process: { shape: 'process node', dimension: '2d', spatial: 'node' },
    ledger: { shape: 'ledger node', dimension: '2d', spatial: 'node' },
    component: { shape: 'component body', dimension: '2d', spatial: 'object' },
    composition: { shape: 'system graph', dimension: '2d', spatial: 'zones' },
    scene: { shape: 'scene plane', dimension: '2d', spatial: 'camera' },
  });

  const GEOMETRY_OVERRIDES = Object.freeze({
    river: { shape: 'flow path', dimension: '2d', spatial: 'channel' },
    lake: { shape: 'volume', dimension: '2d', spatial: 'basin' },
    pipe: { shape: 'boundary', dimension: '2d', spatial: 'channel' },
    lens: { shape: 'surface', dimension: '2d', spatial: 'optic' },
    mirror: { shape: 'surface', dimension: '2d', spatial: 'optic' },
    prism: { shape: 'surface', dimension: '2d', spatial: 'optic' },
    wheel: { shape: 'rigid body', dimension: '2d', spatial: 'rotor' },
    gear: { shape: 'rigid body', dimension: '2d', spatial: 'rotor' },
    'rock-wall': { shape: 'boundary', dimension: '2d', spatial: 'barrier' },
    'terrain-patch': { shape: 'heightfield', dimension: '2d', spatial: 'terrain' },
    'graph-network': { shape: 'graph/network', dimension: '2d', spatial: 'nodes/edges' },
    'grid-heightfield': { shape: 'grid/heightfield', dimension: '2d', spatial: 'terrain' },
  });

  const PORT_PROFILES = Object.freeze({
    source: { accepts: ['signal'], outputs: ['energy', 'matter', 'flow'] },
    sink: { accepts: ['energy', 'matter', 'flow'], outputs: ['loss'] },
    field: { accepts: ['energy', 'signal'], outputs: ['force'] },
    material: { accepts: ['force', 'heat', 'flow'], outputs: ['matter'] },
    body: { accepts: ['force'], outputs: ['motion'] },
    process: { accepts: ['matter', 'energy', 'signal'], outputs: ['matter', 'heat', 'signal'] },
    controller: { accepts: ['signal'], outputs: ['signal'] },
    sensor: { accepts: ['matter', 'heat', 'light', 'force'], outputs: ['signal'] },
    ledger: { accepts: ['energy', 'matter', 'signal'], outputs: ['trace'] },
    'sun-lamp': { accepts: ['signal'], outputs: ['light', 'heat', 'energy'] },
    flame: { accepts: ['fuel', 'air', 'heat'], outputs: ['heat', 'light', 'smoke'] },
    river: { accepts: ['water', 'force'], outputs: ['flow', 'matter'] },
    pipe: { accepts: ['flow'], outputs: ['flow'] },
    pump: { accepts: ['energy', 'flow'], outputs: ['flow', 'pressure'] },
    valve: { accepts: ['flow', 'signal'], outputs: ['flow'] },
    fan: { accepts: ['energy', 'signal'], outputs: ['flow', 'force'] },
    motor: { accepts: ['energy', 'signal'], outputs: ['force', 'motion', 'heat'] },
    generator: { accepts: ['motion', 'force'], outputs: ['energy', 'heat'] },
    battery: { accepts: ['energy'], outputs: ['energy'] },
    lens: { accepts: ['light'], outputs: ['light'] },
    mirror: { accepts: ['light'], outputs: ['light'] },
    prism: { accepts: ['light'], outputs: ['light'] },
    magnet: { accepts: ['force'], outputs: ['force'] },
    controller: { accepts: ['signal'], outputs: ['signal'] },
  });

  const INTERACTION_RULES = Object.freeze([
    { id: 'water-suppresses-fire', when: ['water', 'combustion'], effect: 'moisture cools the burn front', params: { fire: -0.42, heat: -0.22 } },
    { id: 'dry-wood-burns', when: ['wood', 'combustion'], effect: 'dry fuel increases flame spread', params: { fire: 0.34, smoke: 0.22 } },
    { id: 'metal-conducts-heat', when: ['metal', 'heat-transfer'], effect: 'metal spreads heat through bodies', params: { heat: 0.2, field: 0.08 } },
    { id: 'glass-refracts-light', when: ['glass', 'optics'], effect: 'glass bends and splits light paths', params: { field: 0.16, optics: 0.42 } },
    { id: 'magnetized-metal-field', when: ['magnetized-metal', 'magnetism'], effect: 'magnetic material responds to fields', params: { field: 0.32, motion: 0.12 } },
    { id: 'sand-erodes', when: ['sand', 'erosion'], effect: 'granular sediment moves with flow', params: { matter: 0.22, stability: -0.05 } },
    { id: 'clay-sticks', when: ['clay', 'constraint'], effect: 'adhesive material resists sliding', params: { matter: 0.12, motion: -0.12 } },
    { id: 'water-carries-erosion', when: ['water', 'erosion'], effect: 'flow carves terrain and transports sediment', params: { matter: 0.24, motion: 0.08 } },
    { id: 'air-feeds-flame', when: ['air', 'combustion'], effect: 'oxygen and wind feed combustion', params: { fire: 0.18, motion: 0.06 } },
    { id: 'controller-closes-loop', when: ['controller', 'sensor'], effect: 'signals close the feedback path', params: { stability: 0.16, field: 0.06 } },
  ]);

  const RECIPE_SLOT_LIBRARY = Object.freeze({
    'forest-fire': [
      { slot: 'fuel bed', accepts: ['wood', 'biomass', 'fuel'], required: true },
      { slot: 'ignition', accepts: ['flame', 'combustion', 'heat-transfer'], required: true },
      { slot: 'oxygen', accepts: ['air', 'wind-field-component'], required: true },
      { slot: 'moisture', accepts: ['water', 'soil'], required: false },
      { slot: 'spread front', accepts: ['fluid-advection', 'smoke'], required: true },
    ],
    'river-erosion': [
      { slot: 'water source', accepts: ['river', 'water'], required: true },
      { slot: 'terrain', accepts: ['terrain-patch', 'grid-heightfield'], required: true },
      { slot: 'sediment', accepts: ['sand', 'soil', 'rock'], required: true },
      { slot: 'slope force', accepts: ['gravity', 'fluid-advection'], required: true },
    ],
    'optics-bench': [
      { slot: 'emitter', accepts: ['sun-lamp', 'light-source'], required: true },
      { slot: 'refractor', accepts: ['lens', 'prism', 'glass'], required: true },
      { slot: 'reflector', accepts: ['mirror', 'metal'], required: false },
      { slot: 'measurement', accepts: ['sensor'], required: false },
    ],
    'magnetic-motor': [
      { slot: 'rotor', accepts: ['wheel', 'rigid-body'], required: true },
      { slot: 'field source', accepts: ['magnet', 'magnetism'], required: true },
      { slot: 'load', accepts: ['motor', 'generator', 'conservation-ledger'], required: true },
      { slot: 'timing', accepts: ['controller', 'sensor'], required: false },
    ],
    'power-grid': [
      { slot: 'network', accepts: ['graph-network'], required: true },
      { slot: 'source', accepts: ['source-sink', 'generator', 'battery'], required: true },
      { slot: 'load', accepts: ['queue', 'conservation-ledger'], required: true },
    ],
  });

  const SCENE_LAYOUTS = Object.freeze({
    'lab-bench': { grammar: 'bench', zones: ['source-left', 'optic-center', 'sensor-right'], camera: 'top' },
    'desert-solar-field': { grammar: 'field rows', zones: ['sun-left', 'panels-center', 'grid-right'], camera: 'wide' },
    'mountain-watershed': { grammar: 'downhill channel', zones: ['ridge-left', 'river-center', 'basin-right'], camera: 'map' },
    'factory-floor': { grammar: 'process line', zones: ['machines-left', 'pipes-center', 'control-right'], camera: 'plan' },
    'city-grid': { grammar: 'orthogonal network', zones: ['routes', 'loads', 'queues'], camera: 'map' },
    forest: { grammar: 'patch spread', zones: ['fuel-bed', 'ignition', 'wind'], camera: 'wide' },
    'coastline-storm': { grammar: 'front over coast', zones: ['water-left', 'wind-center', 'land-right'], camera: 'map' },
    'reactor-room': { grammar: 'vessel loop', zones: ['heater', 'reactor', 'cooler', 'sensor'], camera: 'top' },
    warehouse: { grammar: 'hub and queues', zones: ['inbound', 'storage', 'outbound'], camera: 'plan' },
    'transit-map': { grammar: 'route graph', zones: ['nodes', 'edges', 'queues'], camera: 'map' },
    marketplace: { grammar: 'supply demand loop', zones: ['supply-left', 'queue-center', 'demand-right'], camera: 'plan' },
    'biological-colony': { grammar: 'colony spread', zones: ['growth', 'diffusion', 'boundary'], camera: 'macro' },
  });

  const CONTEXTUAL_READOUT_RULES = Object.freeze([
    { id: 'forest-fire', when: ['forest-fire'], labels: ['fuel load', 'burn front', 'smoke', 'moisture', 'wind', 'containment'] },
    { id: 'river-erosion', when: ['river-erosion'], labels: ['water flow', 'erosion rate', 'sediment', 'slope', 'terrain loss', 'stability'] },
    { id: 'optics-bench', when: ['optics-bench'], labels: ['light', 'refraction', 'beam split', 'focus', 'heat', 'stability'] },
    { id: 'city-grid', when: ['city-grid'], labels: ['grid load', 'queue backlog', 'throughput', 'delay', 'demand', 'stability'] },
    { id: 'power-grid', when: ['power-grid'], labels: ['grid load', 'source', 'loss', 'delay', 'balance', 'stability'] },
    { id: 'magnetic-motor', when: ['magnetic-motor'], labels: ['rpm', 'field', 'load', 'timing', 'loss', 'balance'] },
    { id: 'generic', when: [], labels: ['energy', 'motion', 'field', 'matter', 'heat', 'stability'] },
  ]);

  const UNIT_DIMENSIONS = Object.freeze({
    acceleration: { unit: 'm/s^2', base: { length: 1, time: -2 } },
    angle: { unit: 'rad', base: { angle: 1 } },
    area: { unit: 'm^2', base: { length: 2 } },
    charge: { unit: 'C', base: { current: 1, time: 1 } },
    dimensionless: { unit: '1', base: {} },
    energy: { unit: 'J', base: { mass: 1, length: 2, time: -2 } },
    force: { unit: 'N', base: { mass: 1, length: 1, time: -2 } },
    heat: { unit: 'K', base: { temperature: 1 } },
    inventory: { unit: 'item', base: { count: 1 } },
    length: { unit: 'm', base: { length: 1 } },
    mass: { unit: 'kg', base: { mass: 1 } },
    opacity: { unit: 'alpha', base: {} },
    pressure: { unit: 'Pa', base: { mass: 1, length: -1, time: -2 } },
    probability: { unit: 'p', base: {} },
    rate: { unit: '1/s', base: { time: -1 } },
    time: { unit: 's', base: { time: 1 } },
    velocity: { unit: 'm/s', base: { length: 1, time: -1 } },
  });

  const PARAM_UNIT_SCHEMA = Object.freeze({
    adhesion: { dimension: 'probability', unit: 'p' },
    albedo: { dimension: 'probability', unit: 'p' },
    atomicMass: { dimension: 'mass', unit: 'u' },
    bondStrength: { dimension: 'force', unit: 'N' },
    buoyancy: { dimension: 'force', unit: 'N' },
    catalyst: { dimension: 'rate', unit: '1/s' },
    charge: { dimension: 'charge', unit: 'C' },
    cohesion: { dimension: 'force', unit: 'N' },
    combustibility: { dimension: 'probability', unit: 'p' },
    complexity: { dimension: 'dimensionless', unit: '1' },
    conductivity: { dimension: 'rate', unit: 'W/(m*K)' },
    controlGain: { dimension: 'dimensionless', unit: 'gain' },
    cooling: { dimension: 'rate', unit: '1/s' },
    damping: { dimension: 'rate', unit: '1/s' },
    density: { dimension: 'mass', unit: 'kg/m^3' },
    diffusionA: { dimension: 'rate', unit: 'm^2/s' },
    diffusionB: { dimension: 'rate', unit: 'm^2/s' },
    driveTiming: { dimension: 'time', unit: 'phase' },
    electricField: { dimension: 'force', unit: 'N/C' },
    energyInput: { dimension: 'energy', unit: 'J/s' },
    erosionRate: { dimension: 'rate', unit: 'm/s' },
    feedRate: { dimension: 'rate', unit: '1/s' },
    fieldStrength: { dimension: 'force', unit: 'N' },
    flowRate: { dimension: 'rate', unit: 'm^3/s' },
    friction: { dimension: 'probability', unit: 'p' },
    granularFriction: { dimension: 'probability', unit: 'p' },
    gravity: { dimension: 'acceleration', unit: 'm/s^2' },
    hardness: { dimension: 'pressure', unit: 'Pa' },
    heatTransfer: { dimension: 'rate', unit: 'W/K' },
    infectionRate: { dimension: 'rate', unit: '1/s' },
    inletFlow: { dimension: 'rate', unit: 'm^3/s' },
    ionization: { dimension: 'probability', unit: 'p' },
    irradiance: { dimension: 'energy', unit: 'W/m^2' },
    killRate: { dimension: 'rate', unit: '1/s' },
    latentHeat: { dimension: 'energy', unit: 'J/kg' },
    lightIntensity: { dimension: 'energy', unit: 'lm' },
    loadTorque: { dimension: 'force', unit: 'N*m' },
    magneticStrength: { dimension: 'force', unit: 'T' },
    magnetization: { dimension: 'force', unit: 'A/m' },
    marketDemand: { dimension: 'inventory', unit: 'item/s' },
    membraneTension: { dimension: 'force', unit: 'N/m' },
    moisture: { dimension: 'probability', unit: 'p' },
    networkLatency: { dimension: 'time', unit: 's' },
    obstacleRadius: { dimension: 'length', unit: 'm' },
    opacity: { dimension: 'opacity', unit: 'alpha' },
    phaseThreshold: { dimension: 'heat', unit: 'K' },
    plasmaTemperature: { dimension: 'heat', unit: 'K' },
    populationGrowth: { dimension: 'rate', unit: '1/s' },
    pressure: { dimension: 'pressure', unit: 'Pa' },
    priceElasticity: { dimension: 'dimensionless', unit: 'elasticity' },
    queueBacklog: { dimension: 'inventory', unit: 'item' },
    reactionRate: { dimension: 'rate', unit: '1/s' },
    refractiveIndex: { dimension: 'dimensionless', unit: 'n' },
    restitution: { dimension: 'probability', unit: 'p' },
    serviceRate: { dimension: 'rate', unit: 'item/s' },
    signalDelay: { dimension: 'time', unit: 's' },
    signalNoise: { dimension: 'probability', unit: 'p' },
    sliderAmplitude: { dimension: 'length', unit: 'm' },
    sliderPhase: { dimension: 'angle', unit: 'rad' },
    soundFrequency: { dimension: 'rate', unit: 'Hz' },
    springConstant: { dimension: 'force', unit: 'N/m' },
    terrainSlope: { dimension: 'angle', unit: 'grade' },
    thermalFlux: { dimension: 'energy', unit: 'W/m^2' },
    turbulence: { dimension: 'dimensionless', unit: '1' },
    viscosity: { dimension: 'pressure', unit: 'Pa*s' },
    vortexStrength: { dimension: 'rate', unit: '1/s' },
    waveAmplitude: { dimension: 'length', unit: 'm' },
    wheelInertia: { dimension: 'mass', unit: 'kg*m^2' },
    windSpeed: { dimension: 'velocity', unit: 'm/s' },
  });

  const CONSERVATION_RULES = Object.freeze([
    { id: 'energy-ledger', when: ['energy-ledger'], tracks: ['energy'], suppliedBy: ['source'], lostTo: ['heat', 'load'] },
    { id: 'fluid-mass', when: ['water', 'fluid-advection'], tracks: ['mass'], suppliedBy: ['source-sink'], lostTo: ['flow-outlet'] },
    { id: 'combustion-mass-energy', when: ['combustion', 'wood'], tracks: ['mass', 'energy'], suppliedBy: ['fuel', 'air'], lostTo: ['heat', 'smoke'] },
    { id: 'optical-energy', when: ['optics', 'light-source'], tracks: ['energy'], suppliedBy: ['light-source'], lostTo: ['absorption'] },
    { id: 'magnetic-momentum', when: ['magnetism', 'rigid-body'], tracks: ['momentum', 'energy'], suppliedBy: ['field'], lostTo: ['friction'] },
    { id: 'queue-inventory', when: ['queue'], tracks: ['inventory'], suppliedBy: ['source-sink'], lostTo: ['service'] },
    { id: 'population-count', when: ['growth-decay'], tracks: ['population'], suppliedBy: ['growth'], lostTo: ['decay'] },
    { id: 'charge-balance', when: ['electricity'], tracks: ['charge'], suppliedBy: ['electric-field'], lostTo: ['ground'] },
  ]);

  const OPERATOR_REGISTRY = Object.freeze({
    advection: { inputs: ['flow', 'matter'], outputs: ['matter'], state: ['velocity'], conserves: ['mass'] },
    buoyancy: { inputs: ['force', 'matter'], outputs: ['force', 'motion'], state: ['density'], conserves: ['mass'] },
    combustion: { inputs: ['fuel', 'air', 'heat'], outputs: ['heat', 'light', 'smoke'], state: ['fuel', 'temperature'], conserves: ['energy'] },
    collision: { inputs: ['motion', 'boundary'], outputs: ['force', 'motion'], state: ['velocity'], conserves: ['momentum'] },
    diffusion: { inputs: ['matter'], outputs: ['matter'], state: ['concentration'], conserves: ['mass'] },
    erosion: { inputs: ['flow', 'terrain'], outputs: ['matter'], state: ['sediment', 'height'], conserves: ['mass'] },
    growthDecay: { inputs: ['matter', 'energy'], outputs: ['population'], state: ['health', 'population'], conserves: ['population'] },
    heatTransfer: { inputs: ['heat'], outputs: ['heat'], state: ['temperature'], conserves: ['energy'] },
    magnetism: { inputs: ['force', 'field'], outputs: ['force', 'motion'], state: ['charge', 'velocity'], conserves: ['energy'] },
    phaseChange: { inputs: ['heat', 'matter'], outputs: ['matter'], state: ['temperature', 'phase'], conserves: ['mass', 'energy'] },
    queueService: { inputs: ['inventory', 'signal'], outputs: ['inventory'], state: ['backlog'], conserves: ['inventory'] },
    refraction: { inputs: ['light'], outputs: ['light'], state: ['refractiveIndex'], conserves: ['energy'] },
  });

  const OPERATOR_MATCHES = Object.freeze({
    'fluid-advection': 'advection',
    water: 'advection',
    buoyancy: 'buoyancy',
    combustion: 'combustion',
    flame: 'combustion',
    collision: 'collision',
    diffusion: 'diffusion',
    erosion: 'erosion',
    'growth-decay': 'growthDecay',
    'heat-transfer': 'heatTransfer',
    magnetism: 'magnetism',
    'magnetized-metal': 'magnetism',
    'phase-change': 'phaseChange',
    'phase-change-material': 'phaseChange',
    queue: 'queueService',
    'queue-server': 'queueService',
    optics: 'refraction',
    glass: 'refraction',
    lens: 'refraction',
    prism: 'refraction',
  });

  const TEMPORAL_GRAMMAR = Object.freeze([
    { id: 'ignition', when: ['combustion'], trigger: 'heat above ignition threshold', outputs: ['flame', 'smoke'] },
    { id: 'rainfall', when: ['river-erosion'], trigger: 'water source increases flow', outputs: ['erosion', 'sediment'] },
    { id: 'overload', when: ['power-grid'], trigger: 'demand exceeds service rate', outputs: ['queue backlog', 'loss'] },
    { id: 'phase-threshold-crossing', when: ['phase-change'], trigger: 'temperature crosses phase point', outputs: ['phase change'] },
    { id: 'controller-response', when: ['controller', 'sensor'], trigger: 'measured error crosses threshold', outputs: ['signal'] },
    { id: 'failure-recovery', when: ['queue'], trigger: 'backlog saturates then service catches up', outputs: ['delay', 'throughput'] },
  ]);

  const LAYERED_PRIMITIVES = uniqueCatalogItems(
    PRIMITIVE_LIBRARY,
    COMPONENT_LIBRARY,
    COMPOSITION_LIBRARY,
    SCENE_LIBRARY
  );

  const PHYSICAL_PRIMITIVES = uniqueCatalogItems(
    LAYERED_PRIMITIVES,
    BASE_CATALOG_ITEMS
  );

  const EXAMPLE_INTENTS = Object.freeze([
    {
      id: 'ferrofluid-lens',
      label: 'Lens',
      prompt: 'laser heats ferrofluid lens over copper coil',
      params: {
        irradiance: 1040,
        magnetization: 0.74,
        refractiveIndex: 1.67,
        heatTransfer: 0.68,
        viscosity: 0.36,
        damping: 0.05,
      },
    },
    {
      id: 'subway-surge-grid',
      label: 'Grid',
      prompt: 'subway queue grid reroutes after power surge',
      params: {
        queueBacklog: 0.84,
        serviceRate: 0.32,
        marketDemand: 0.78,
        networkLatency: 0.62,
        signalDelay: 0.48,
        signalNoise: 0.18,
      },
    },
    {
      id: 'brine-vent',
      label: 'Vent',
      prompt: 'undersea vent crystallizes pressure brine',
      params: {
        flowRate: 0.88,
        heatTransfer: 0.76,
        pressure: 0.86,
        erosionRate: 0.34,
        viscosity: 0.58,
        turbulence: 0.72,
      },
    },
    {
      id: 'acoustic-dust-levitator',
      label: 'Wave',
      prompt: 'acoustic levitator sorts dust in brass tube',
      params: {
        waveAmplitude: 0.82,
        soundFrequency: 0.74,
        pressure: 0.7,
        granularFriction: 0.28,
        damping: 0.04,
        signalNoise: 0.12,
      },
    },
    {
      id: 'thin-film-fracture',
      label: 'Film',
      prompt: 'thin film laser bubbles fracture on wire loop',
      params: {
        surfaceTension: 0.86,
        refractiveIndex: 1.58,
        opacity: 0.22,
        energyInput: 0.72,
        hardness: 0.18,
        damping: 0.03,
      },
    },
    {
      id: 'mycelium-gel-pump',
      label: 'Bio',
      prompt: 'mycelium membrane pumps nutrient gel waves',
      params: {
        populationGrowth: 0.84,
        diffusionA: 0.76,
        moisture: 0.82,
        viscosity: 0.64,
        lightIntensity: 0.32,
        waveAmplitude: 0.34,
      },
    },
  ]);

  const DEFAULT_PARAMS = Object.freeze({ ...TEMPLATE_LIBRARY[0].params });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function wrapAngle(angle) {
    const wrapped = angle % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
  }

  function shortestAngle(from, to) {
    let delta = wrapAngle(to) - wrapAngle(from);
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    return delta;
  }

  function hashNoise(seed, index) {
    const x = Math.sin((seed + 1) * 12.9898 + (index + 1) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function slugify(value) {
    return String(value || 'simulation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 52) || 'simulation';
  }

  function templateById(templateId) {
    return TEMPLATE_LIBRARY.find((template) => template.id === templateId) || TEMPLATE_LIBRARY[0];
  }

  function normalizeControl(control) {
    if (Array.isArray(control)) return control;
    if (typeof control === 'string') return CONTROL_LIBRARY[control] || [control, labelize(control), 0, 1, 0.01];
    if (control && control.key) {
      return [
        control.key,
        control.label || labelize(control.key),
        Number(control.min ?? 0),
        Number(control.max ?? 1),
        Number(control.step ?? 0.01),
      ];
    }
    return ['value', 'value', 0, 1, 0.01];
  }

  function labelize(key) {
    return String(key || 'value')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .toLowerCase();
  }

  function controlsForSpec(specOrTemplate) {
    return (specOrTemplate.controls || templateById(specOrTemplate.templateId || specOrTemplate.id).controls || [])
      .map(normalizeControl);
  }

  function controlsByKey(specOrTemplate) {
    return Object.fromEntries(controlsForSpec(specOrTemplate).map((control) => [control[0], control]));
  }

  function normalizeParams(template, params, controls = controlsForSpec(template)) {
    const controlsMap = Object.fromEntries(controls.map((control) => [control[0], control]));
    const base = { ...template.params, ...(params || {}) };
    return Object.fromEntries(Object.entries(base).map(([key, value]) => {
      const control = controlsMap[key];
      if (!control) return [key, Number(value)];
      return [key, clamp(Number(value), Number(control[2]), Number(control[3]))];
    }));
  }

  function normalizeObjects(objects, fallback = []) {
    const source = Array.isArray(objects) && objects.length ? objects : fallback;
    return source.map((object, index) => ({
      id: slugify(object.id || object.name || `object-${index + 1}`),
      type: String(object.type || 'body'),
      role: String(object.role || object.name || 'physical object'),
      layer: object.layer || '',
      domains: uniqueList(object.domains || []),
      material: object.material || '',
      visualRegime: object.visualRegime || '',
      assembly: object.assembly || '',
      phrase: object.phrase || '',
      source: object.source || '',
      primitiveProgram: object.primitiveProgram || null,
      geometry: object.geometry || null,
      ports: object.ports || null,
      slots: object.slots || [],
      synthesis: object.synthesis || null,
      state: object.state || null,
    }));
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  function meaningfulTokens(text) {
    const raw = String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && token.length > 1 && !SEMANTIC_STOPWORDS.has(token));
    const out = [];
    for (const token of raw) {
      const singular = token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
      out.push(singular);
      for (const synonym of TOKEN_SYNONYMS[singular] || TOKEN_SYNONYMS[token] || []) {
        out.push(synonym);
      }
    }
    return out;
  }

  function addVectorFeature(vector, key, weight) {
    vector.set(key, (vector.get(key) || 0) + weight);
  }

  function buildIntentVector(text) {
    const tokens = meaningfulTokens(text);
    const vector = new Map();
    for (const token of tokens) {
      addVectorFeature(vector, `w:${token}`, 1);
      const padded = `^${token}$`;
      for (const n of [3, 4]) {
        if (padded.length < n) continue;
        for (let i = 0; i <= padded.length - n; i += 1) {
          addVectorFeature(vector, `g:${padded.slice(i, i + n)}`, 0.38);
        }
      }
    }
    for (let i = 0; i < tokens.length - 1; i += 1) {
      addVectorFeature(vector, `b:${tokens[i]}_${tokens[i + 1]}`, 0.72);
    }
    return vector;
  }

  function vectorScore(intentVector, candidateVector) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [key, weight] of intentVector) {
      normA += weight * weight;
      if (candidateVector.has(key)) dot += weight * candidateVector.get(key);
    }
    for (const weight of candidateVector.values()) {
      normB += weight * weight;
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  function primitiveById(id) {
    return PHYSICAL_PRIMITIVES.find((primitive) => primitive.id === id) || null;
  }

  function layerForId(id, primitives = LAYERED_PRIMITIVES) {
    const primitive = (primitives || []).find((item) => item.id === id);
    return primitive ? primitive.layer : null;
  }

  function lowerLayerFor(layerId) {
    const index = LAYER_INDEX[layerId];
    if (!index || index <= 1) return null;
    const lower = LAYER_STACK.find((layer) => layer.index === index - 1);
    return lower ? lower.id : null;
  }

  function validateLayerAdjacency(primitives = LAYERED_PRIMITIVES) {
    const byId = new Map((primitives || []).map((primitive) => [primitive.id, primitive]));
    const errors = [];
    for (const primitive of primitives || []) {
      const expectedChildLayer = lowerLayerFor(primitive.layer);
      const recipe = primitive.recipe || [];
      if (!expectedChildLayer && recipe.length) {
        errors.push({
          id: primitive.id,
          layer: primitive.layer,
          reason: 'base-layer-has-recipe',
          expectedChildLayer: null,
          childIds: recipe.slice(),
        });
        continue;
      }
      for (const childId of recipe) {
        const child = byId.get(childId);
        if (!child) {
          errors.push({
            id: primitive.id,
            layer: primitive.layer,
            childId,
            reason: 'missing-child',
            expectedChildLayer,
          });
          continue;
        }
        if (child.layer !== expectedChildLayer) {
          errors.push({
            id: primitive.id,
            layer: primitive.layer,
            childId,
            childLayer: child.layer,
            reason: 'non-adjacent-child',
            expectedChildLayer,
          });
        }
      }
    }
    return {
      schema: 'simulatte.layerAdjacency.v1',
      valid: errors.length === 0,
      layerStack: LAYER_STACK.map((layer) => ({
        id: layer.id,
        index: layer.index,
        composes: layer.composes.slice(),
      })),
      compilerInputPlane: COMPILER_INPUT_PLANE.id,
      checked: (primitives || []).length,
      errors,
    };
  }

  function primitiveText(primitive) {
    return `${primitive.id} ${primitive.type} ${primitive.role} ${primitive.domains.join(' ')} ${primitive.text || ''}`;
  }

  function materialPropertiesForId(id) {
    return {
      ...MATERIAL_PROPERTY_DEFAULTS,
      ...generatedMaterialPropertiesForId(id),
      ...(MATERIAL_PROFILES[id] || {}),
    };
  }

  function geometryForPrimitive(primitive) {
    if (!primitive) return GEOMETRY_PROFILES.body;
    return {
      ...(GEOMETRY_PROFILES[primitive.type] || GEOMETRY_PROFILES.body),
      ...(GEOMETRY_OVERRIDES[primitive.id] || {}),
    };
  }

  function portsForPrimitive(primitive) {
    if (!primitive) return { accepts: [], outputs: [] };
    const base = PORT_PROFILES[primitive.type] || { accepts: [], outputs: [] };
    const override = PORT_PROFILES[primitive.id] || {};
    return {
      accepts: uniqueList([...(base.accepts || []), ...(override.accepts || [])]),
      outputs: uniqueList([...(base.outputs || []), ...(override.outputs || [])]),
    };
  }

  function recipeSlotsForId(id) {
    return (RECIPE_SLOT_LIBRARY[id] || []).map((slot) => ({
      slot: slot.slot,
      accepts: uniqueList(slot.accepts || []),
      required: Boolean(slot.required),
    }));
  }

  function primitiveTokenSet(primitives) {
    const tokens = new Set();
    for (const primitive of primitives || []) {
      tokens.add(primitive.id);
      tokens.add(primitive.layer);
      tokens.add(primitive.type);
      for (const domain of primitive.domains || []) tokens.add(domain);
    }
    return tokens;
  }

  function matchingInteractionRules(primitives) {
    const tokens = primitiveTokenSet(primitives);
    return INTERACTION_RULES
      .filter((rule) => (rule.when || []).every((token) => tokens.has(token)))
      .map((rule) => ({
        id: rule.id,
        when: uniqueList(rule.when || []),
        effect: rule.effect,
        params: { ...(rule.params || {}) },
      }));
  }

  function unitsForParams(params = {}) {
    return Object.fromEntries(Object.keys(params).sort().map((key) => [
      key,
      PARAM_UNIT_SCHEMA[key] || { dimension: 'dimensionless', unit: '1' },
    ]));
  }

  function conservationForPrimitives(primitives) {
    const tokens = primitiveTokenSet(primitives);
    return CONSERVATION_RULES
      .filter((rule) => (rule.when || []).every((token) => tokens.has(token)))
      .map((rule) => ({
        id: rule.id,
        tracks: uniqueList(rule.tracks || []),
        suppliedBy: uniqueList(rule.suppliedBy || []),
        lostTo: uniqueList(rule.lostTo || []),
      }));
  }

  function operatorsForPrimitives(primitives) {
    const out = [];
    const seen = new Set();
    for (const primitive of primitives || []) {
      const keys = uniqueList([primitive.id, primitive.type, primitive.layer, ...(primitive.domains || [])]);
      for (const key of keys) {
        const operatorId = OPERATOR_MATCHES[key];
        if (!operatorId || seen.has(operatorId)) continue;
        const operator = OPERATOR_REGISTRY[operatorId];
        if (!operator) continue;
        seen.add(operatorId);
        out.push({
          id: operatorId,
          inputs: uniqueList(operator.inputs || []),
          outputs: uniqueList(operator.outputs || []),
          state: uniqueList(operator.state || []),
          conserves: uniqueList(operator.conserves || []),
        });
      }
    }
    return out;
  }

  function stateForPrimitive(primitive, contract) {
    const material = contract && contract.materials ? contract.materials[primitive.id] : null;
    const ports = contract && contract.ports ? contract.ports[primitive.id] || { accepts: [], outputs: [] } : { accepts: [], outputs: [] };
    const domains = new Set([primitive.id, primitive.type, primitive.layer, ...(primitive.domains || [])]);
    const state = {
      temperature: material ? material.phasePoint || 0.5 : 0.5,
      moisture: material ? material.moisture || 0 : domains.has('water') ? 1 : 0,
      charge: domains.has('electricity') || domains.has('plasma') ? 0.32 : 0,
      pressure: domains.has('pressure') || ports.outputs.includes('pressure') ? 0.42 : 0,
      backlog: domains.has('queue') ? 0.34 : 0,
      fuel: material ? material.combustibility || 0 : domains.has('combustion') ? 0.45 : 0,
      mass: material ? material.density || 0.5 : primitive.type === 'body' ? 0.6 : 0.2,
      velocity: domains.has('fluid') || domains.has('motion') || primitive.type === 'body' ? 0.18 : 0,
      health: domains.has('biology') ? 0.72 : 1,
      inventory: domains.has('inventory') || domains.has('queue') || domains.has('market') ? 0.36 : 0,
    };
    return Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Number(value.toFixed(4))]));
  }

  function graphNodeForPrimitive(primitive, contract, index) {
    return {
      id: primitive.id,
      nodeType: physicalNodeTypeForPrimitive(primitive),
      layer: primitive.layer || '',
      type: primitive.type,
      role: primitive.role,
      geometry: contract && contract.geometry ? contract.geometry[primitive.id] || geometryForPrimitive(primitive) : geometryForPrimitive(primitive),
      ports: contract && contract.ports ? contract.ports[primitive.id] || portsForPrimitive(primitive) : portsForPrimitive(primitive),
      material: contract && contract.materials ? contract.materials[primitive.id] || null : null,
      state: stateForPrimitive(primitive, contract),
      visualRegime: primitive.visualRegime || firstDomainRegime(primitive),
      solverRequirements: solverRequirementsForPrimitive(primitive),
      primitiveProgram: primitive.primitiveProgram || null,
      source: primitive.source || 'catalog',
      order: index,
    };
  }

  function physicalNodeTypeForPrimitive(primitive) {
    const text = primitiveText(primitive).toLowerCase();
    if (
      /^flame$|fire-front|thermal-source/.test(primitive.id) ||
      primitive.type === 'source' ||
      /source|lamp|sun|inlet|emitter|battery|generator/.test(text)
    ) return 'source';
    if (primitive.type === 'sink' || /sink|load|outlet|loss|drain/.test(text)) return 'sink';
    if (primitive.type === 'sensor' || /sensor|meter|readout|recorder|probe/.test(text)) return 'sensor';
    if (primitive.type === 'controller' || /controller|feedback|control|actuator/.test(text)) return 'controller';
    if (primitive.type === 'constraint' || /wall|boundary|constraint|barrier/.test(text)) return 'boundary';
    if (primitive.layer === 'material' || primitive.type === 'material') return 'materialField';
    if (primitive.layer === 'physics' || /diffusion|combustion|magnetism|optics|reaction|advection/.test(text)) return 'operator';
    if (primitive.type === 'body' || /wheel|rotor|mass|rigid|spring/.test(text)) return 'rigidBody';
    return 'domain';
  }

  function firstDomainRegime(primitive) {
    const text = primitiveText(primitive).toLowerCase();
    if (/fire|heat|thermal|combust|smoke|plasma/.test(text)) return 'thermal';
    if (/fluid|water|flow|river|air|wind/.test(text)) return 'fluid';
    if (/glass|light|lens|prism|mirror|optic/.test(text)) return 'optical';
    if (/magnet|magnetic|rotor|motor/.test(text)) return 'magnetic';
    if (/electric|charge|copper|silicon/.test(text)) return 'electrical';
    if (/sand|soil|rock|grain|terrain|erosion/.test(text)) return 'granular';
    if (/cell|bacteria|mycelium|biology|growth/.test(text)) return 'biological';
    if (/membrane|gel|foam|soft/.test(text)) return 'soft';
    if (/sound|acoustic|wave/.test(text)) return 'acoustic';
    if (/phase|melt|freeze|boil|ice|steam/.test(text)) return 'phase';
    if (/atom|molecule|ion|crystal|lattice/.test(text)) return 'atomic';
    if (/queue|network|traffic|market|logistics/.test(text)) return 'network';
    return '';
  }

  function solverRequirementsForPrimitive(primitive) {
    const regime = primitive.visualRegime || firstDomainRegime(primitive);
    const map = {
      fluid: ['velocity', 'density'],
      thermal: ['temperature', 'fuel', 'smoke'],
      optical: ['rayBatch', 'surfaceNormal', 'causticAccumulation'],
      magnetic: ['flux', 'force'],
      electrical: ['charge', 'potential'],
      granular: ['height', 'sediment'],
      biological: ['population', 'nutrient'],
      soft: ['tension', 'displacement'],
      acoustic: ['phase', 'amplitude'],
      phase: ['phase', 'latentHeat'],
      atomic: ['bond', 'charge'],
      network: ['backlog', 'throughput'],
    };
    return map[regime] || ['scalar'];
  }

  function graphEdgesForNodes(nodes, primitives) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges = [];
    const addEdge = (from, to, channel, reason) => {
      if (!from || !to || from === to || edges.length >= 96) return;
      const id = `${from}->${to}:${channel}:${reason}`;
      if (edges.some((edge) => edge.id === id)) return;
      edges.push({ id, from, to, channel, type: edgeTypeForChannel(channel), reason });
    };
    for (const primitive of primitives || []) {
      for (const childId of primitive.recipe || []) {
        if (byId.has(primitive.id) && byId.has(childId)) {
          addEdge(childId, primitive.id, 'recipe', 'slot');
        }
      }
    }
    for (const source of nodes) {
      for (const target of nodes) {
        if (source === target) continue;
        for (const output of source.ports.outputs || []) {
          if ((target.ports.accepts || []).includes(output)) {
            addEdge(source.id, target.id, output, 'port');
          }
        }
      }
    }
    return edges;
  }

  function edgeTypeForChannel(channel) {
    const value = String(channel || '');
    if (/energy|heat|thermal/.test(value)) return 'transfersEnergy';
    if (/matter|material|fuel|sediment|flow/.test(value)) return 'transfersMass';
    if (/constraint|recipe|slot/.test(value)) return 'constrains';
    if (/light|spectrum/.test(value)) return 'refracts';
    if (/force|field|magnet|gravity/.test(value)) return 'constrains';
    if (/signal|trace|measure/.test(value)) return 'measures';
    if (/pressure|fluid|velocity/.test(value)) return 'advects';
    return 'couples';
  }

  function validateGraphIR(graph, primitives, promptText = '') {
    const ids = new Set((graph.nodes || []).map((node) => node.id));
    const tokens = primitiveTokenSet(primitives);
    const prompt = String(promptText || '').toLowerCase();
    const warnings = [];
    const repairs = [];
    const needs = (id, required, message, repair) => {
      if (!tokens.has(id)) return;
      if (required.some((item) => tokens.has(item))) return;
      warnings.push(message);
      repairs.push(repair);
    };
    needs('combustion', ['wood', 'fuel', 'biomass'], 'combustion needs a fuel-bearing material', 'add wood, fuel, or biomass');
    needs('combustion', ['air'], 'combustion needs an oxygen/air source', 'add air or wind field');
    if (prompt.includes('optic') || prompt.includes('lens') || prompt.includes('prism')) {
      needs('optics', ['light-source', 'sun-lamp'], 'optics needs a light input', 'add light source or sun lamp');
    }
    needs('queue', ['source-sink', 'market-demand', 'logistics-node'], 'queue needs arrivals or logistics context', 'add source/sink or logistics node');
    if (ids.has('rock') && tokens.has('queue') && !prompt.includes('logistics')) {
      warnings.push('rock cannot be served by a queue unless wrapped by logistics');
      repairs.push('add logistics-node or remove queue from raw rock material');
    }
    return {
      status: warnings.length ? 'repaired' : 'valid',
      warnings,
      repairs,
    };
  }

  function temporalEventsForPrimitives(primitives) {
    const tokens = primitiveTokenSet(primitives);
    return TEMPORAL_GRAMMAR
      .filter((event) => (event.when || []).every((token) => tokens.has(token)))
      .map((event) => ({
        id: event.id,
        trigger: event.trigger,
        outputs: uniqueList(event.outputs || []),
      }));
  }

  function promptExplanation(promptText, primitives, contract, graph) {
    const topIdentity = contract.topLevel && contract.topLevel[0] || primitives[0] && primitives[0].id || 'world';
    const promptTerms = new Set(meaningfulTokens(promptText));
    const expanded = primitives
      .filter((primitive) => primitive.id !== topIdentity)
      .sort((a, b) => {
        const aScore = primitivePromptIdentityScore(a, promptTerms);
        const bScore = primitivePromptIdentityScore(b, promptTerms);
        return bScore - aScore || Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id);
      })
      .slice(0, 10)
      .map((primitive) => primitive.id);
    return {
      prompt: String(promptText || '').trim(),
      topIdentity,
      expanded,
      interactions: (contract.interactions || []).map((rule) => rule.id),
      operators: (graph.operators || []).map((operator) => operator.id),
      conservation: (graph.conservation || []).map((rule) => rule.id),
      validation: graph.validation,
    };
  }

  function primitivePromptIdentityScore(primitive, promptTerms) {
    if (!primitive || !promptTerms || !promptTerms.size) return 0;
    const idTerms = String(primitive.id || '').split(/[-_]+/).filter((term) => term.length > 2);
    const domainTerms = (primitive.domains || [])
      .flatMap((domain) => String(domain || '').split(/[-_]+/))
      .filter((term) => term.length > 2);
    const terms = uniqueList([...idTerms, ...domainTerms]);
    let score = terms.reduce((total, term) => total + (promptTerms.has(term) ? 1 : 0), 0);
    if (promptTerms.has(primitive.id)) score += 6;
    if (idTerms.length && idTerms.every((term) => promptTerms.has(term))) score += 4;
    if (primitive.source === 'open-semantic-rag') score -= 0.25;
    return score;
  }

  function compileGraphIR(primitives, promptText, contract, params = {}) {
    const nodes = (primitives || []).map((primitive, index) => graphNodeForPrimitive(primitive, contract, index));
    const graph = {
      schema: 'simulatte.physicalGraph.v1',
      units: unitsForParams(params),
      nodes,
      edges: graphEdgesForNodes(nodes, primitives),
      operators: operatorsForPrimitives(primitives),
      conservation: conservationForPrimitives(primitives),
      temporal: temporalEventsForPrimitives(primitives),
      coverage: coverageForPrompt(promptText, primitives, nodes),
      quality: null,
      validation: null,
      explanation: null,
    };
    graph.validation = validateGraphIR(graph, primitives, promptText);
    graph.explanation = promptExplanation(promptText, primitives, contract, graph);
    graph.quality = qualityForGraph(graph);
    return graph;
  }

  function coverageForPrompt(promptText, primitives, nodes) {
    const terms = uniqueList(meaningfulTokens(promptText));
    const rows = terms.map((term) => {
      const exact = (primitives || []).find((primitive) => {
        const text = primitiveText(primitive).toLowerCase();
        return primitive.id.includes(term) || text.split(/[^a-z0-9]+/).includes(term);
      });
      if (exact) return coverageRow(term, 'exactPrimitive', exact.id, 1);
      const open = (nodes || []).find((node) => node.source === 'open-semantic-rag' && String(node.role || '').includes(term));
      if (open) return coverageRow(term, 'openComponent', open.id, 0.82);
      const operator = (nodes || []).find((node) => (node.solverRequirements || []).some((item) => item.includes(term)));
      if (operator) return coverageRow(term, 'operatorState', operator.id, 0.68);
      return coverageRow(term, 'residual', '', 0);
    });
    return {
      schema: 'simulatte.promptCoverage.v1',
      terms: rows,
      residual: rows.filter((row) => row.kind === 'residual').map((row) => row.term),
    };
  }

  function coverageRow(term, kind, target, score) {
    return { term, kind, target, score: Number(score.toFixed(3)) };
  }

  function qualityForGraph(graph) {
    const total = graph.coverage && graph.coverage.terms.length || 0;
    const residual = graph.coverage && graph.coverage.residual.length || 0;
    const validationPenalty = graph.validation && graph.validation.status === 'repaired' ? 0.08 : 0;
    const coverage = total ? 1 - residual / total : 1;
    return {
      schema: 'simulatte.physicalQuality.v1',
      coverage: Number(coverage.toFixed(3)),
      residualTerms: graph.coverage ? graph.coverage.residual : [],
      score: Number(clamp(coverage - validationPenalty, 0, 1).toFixed(3)),
    };
  }

  function classifyPromptLayer(promptText, rankedPrimitives = []) {
    const prompt = String(promptText || '').toLowerCase();
    const says = (...terms) => terms.some((term) => prompt.includes(term));
    if (says('forest fire')) return 'composition';
    if (says('city', 'forest', 'coastline', 'warehouse', 'marketplace', 'lab bench', 'scene')) return 'scene';
    if (says('system', 'engine', 'reactor', 'grid', 'forest fire', 'erosion', 'bench')) return 'composition';
    if (says('component', 'motor', 'pump', 'valve', 'lens', 'mirror', 'magnet', 'sensor')) return 'component';
    if (says('material', 'element', 'water', 'wood', 'metal', 'glass', 'rock', 'sand')) return 'material';
    if (says('gravity', 'collision', 'diffusion', 'radiation', 'combustion', 'magnetism')) return 'physics';
    if (says('field', 'particle', 'graph', 'constraint', 'queue', 'ledger')) return 'math';
    const firstLayer = rankedPrimitives.find((primitive) => primitive.layer)?.layer;
    return firstLayer || 'composition';
  }

  function topLevelPrimitivesForLayer(primitives, layerFocus) {
    const ordered = primitives || [];
    const layerOrder = {
      scene: ['scene', 'composition', 'component'],
      composition: ['composition', 'scene', 'component'],
      component: ['component', 'composition'],
      material: ['material', 'component'],
      physics: ['physics', 'component'],
      math: ['math', 'physics'],
    }[layerFocus] || ['composition', 'scene', 'component'];
    const picked = [];
    for (const layer of layerOrder) {
      for (const primitive of ordered) {
        if (primitive.layer === layer && !picked.some((item) => item.id === primitive.id)) {
          picked.push(primitive);
        }
        if (picked.length >= 4) return picked;
      }
    }
    return ordered.slice(0, 4);
  }

  function layoutForPrimitives(primitives) {
    const ids = new Set((primitives || []).map((primitive) => primitive.id));
    for (const id of ids) {
      if (SCENE_LAYOUTS[id]) return { id, ...SCENE_LAYOUTS[id] };
    }
    if (ids.has('forest-fire')) return { id: 'forest', ...SCENE_LAYOUTS.forest };
    if (ids.has('river-erosion')) return { id: 'mountain-watershed', ...SCENE_LAYOUTS['mountain-watershed'] };
    if (ids.has('optics-bench')) return { id: 'lab-bench', ...SCENE_LAYOUTS['lab-bench'] };
    if (ids.has('power-grid') || ids.has('traffic-system')) return { id: 'city-grid', ...SCENE_LAYOUTS['city-grid'] };
    return { id: 'freeform', grammar: 'radial assembly', zones: ['source', 'field', 'matter'], camera: 'plan' };
  }

  function readoutsForPrimitives(primitives) {
    const tokens = primitiveTokenSet(primitives);
    const rule = CONTEXTUAL_READOUT_RULES.find((item) => (
      item.when.length && item.when.every((token) => tokens.has(token))
    )) || CONTEXTUAL_READOUT_RULES.find((item) => item.id === 'generic');
    return [...rule.labels];
  }

  function contractForPrimitive(primitive) {
    if (!primitive) return null;
    const materialId = primitive.material || primitive.id;
    return {
      id: primitive.id,
      layer: primitive.layer || '',
      geometry: geometryForPrimitive(primitive),
      material: primitive.layer === 'material' || MATERIAL_PROFILES[materialId] || primitive.material
        ? materialPropertiesForId(materialId)
        : null,
      ports: portsForPrimitive(primitive),
      slots: recipeSlotsForId(primitive.id),
    };
  }

  function contractSummaryForPrimitives(primitives, promptText = '') {
    const rows = primitives || [];
    const layerFocus = classifyPromptLayer(promptText, rows);
    const topLevel = topLevelPrimitivesForLayer(rows, layerFocus);
    const contracts = rows.map(contractForPrimitive).filter(Boolean);
    const materials = Object.fromEntries(contracts
      .filter((contract) => contract.material)
      .map((contract) => [contract.id, contract.material]));
    const ports = Object.fromEntries(contracts.map((contract) => [contract.id, contract.ports]));
    const geometry = Object.fromEntries(contracts.map((contract) => [contract.id, contract.geometry]));
    const recipeSlots = Object.fromEntries(contracts
      .filter((contract) => contract.slots.length)
      .map((contract) => [contract.id, contract.slots]));
    const summary = {
      schema: 'simulatte.layerContract.v1',
      layerStack: LAYER_STACK.map((layer) => ({
        id: layer.id,
        index: layer.index,
        composes: layer.composes.slice(),
        role: layer.role,
      })),
      compilerInputPlane: {
        id: COMPILER_INPUT_PLANE.id,
        role: COMPILER_INPUT_PLANE.role,
        targetLayers: COMPILER_INPUT_PLANE.targetLayers.slice(),
      },
      adjacency: validateLayerAdjacency(),
      layerFocus,
      topLevel: topLevel.map((primitive) => primitive.id),
      materials,
      interactions: matchingInteractionRules(rows),
      ports,
      geometry,
      recipeSlots,
      layout: layoutForPrimitives(rows),
      readouts: readoutsForPrimitives(rows),
    };
    summary.graph = compileGraphIR(rows, promptText, summary);
    return summary;
  }

  function explicitPrimitiveScore(prompt, primitive) {
    const text = ` ${String(prompt || '').toLowerCase()} `;
    const terms = meaningfulTokens(primitiveText(primitive));
    const promptTerms = new Set(meaningfulTokens(prompt));
    const uniqueTerms = Array.from(new Set(terms)).filter((term) => term.length > 3);
    let hits = 0;
    for (const term of uniqueTerms) {
      if (text.includes(` ${term} `) || text.includes(term.replace(/-/g, ' '))) hits += 1;
    }
    let score = Math.min(0.32, hits * 0.045);
    const idTerms = primitive.id.split(/[-_]+/).filter((term) => term.length > 3);
    if (idTerms.some((term) => promptTerms.has(term))) score += 0.24;
    if ((primitive.domains || []).some((domain) => promptTerms.has(domain))) score += 0.18;
    return Math.min(0.62, score);
  }

  function rankPhysicalPrimitives(promptText = '', options = {}) {
    const prompt = String(promptText || '').trim();
    if (!prompt || /\b(blank|empty|scratch)\b/i.test(prompt)) return [];
    const max = Number.isFinite(options.max) ? options.max : 32;
    const intentVector = buildIntentVector(prompt);
    const ranked = PHYSICAL_PRIMITIVES
      .filter((primitive) => primitive.id !== 'energy-ledger')
      .map((primitive) => {
        const candidateVector = buildIntentVector(primitiveText(primitive));
        const score = vectorScore(intentVector, candidateVector) + explicitPrimitiveScore(prompt, primitive);
        return { ...primitive, score: Number(score.toFixed(4)) };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const topScore = ranked[0] ? ranked[0].score : 0;
    if (topScore < 0.22) return [];
    const threshold = Math.max(0.075, topScore * 0.34);
    return ranked.filter((primitive) => primitive.score >= threshold).slice(0, max);
  }

  function withPrimitiveDependencies(rankedPrimitives, promptText = '') {
    const prompt = String(promptText || '').toLowerCase();
    const byId = new Map(PHYSICAL_PRIMITIVES.map((primitive) => [primitive.id, primitive]));
    const rows = [];
    const rowsById = new Map();
    const seen = new Set();
    const ensure = (id, score = 0.18, depth = 0) => {
      const primitive = byId.get(id);
      if (!primitive) return;
      const existing = rowsById.get(id);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        return;
      }
      seen.add(id);
      const row = { ...primitive, score };
      rows.push(row);
      rowsById.set(id, row);
      if (depth > 8) return;
      const nextScore = Math.max(0.08, Number((score * 0.86).toFixed(4)));
      for (const childId of primitive.recipe || []) {
        ensure(childId, nextScore, depth + 1);
      }
    };
    for (const primitive of rankedPrimitives) ensure(primitive.id, primitive.score);
    const has = (...ids) => ids.some((id) => seen.has(id));
    const says = (...terms) => terms.some((term) => prompt.includes(term));
    const fireRequested = has('flame', 'forest-fire', 'fire-front') ||
      says('fire', 'flame', 'burn', 'burning', 'combust', 'wildfire', 'smoke');

    if (has('rotor-wheel', 'stator-slider', 'solar-panel') || says('perpetual', 'magnetic wheel', 'generator')) {
      ensure('rotor-wheel', 0.84);
      ensure('stator-slider', 0.82);
      ensure('solar-panel', 0.78);
      ensure('motor-load', 0.7);
      ensure('bearing-friction', 0.64);
    }
    if (has('flow-inlet', 'moving-fluid', 'wake-obstacle', 'turbulence-field', 'wind-field', 'pressure-vessel')) {
      ensure('flow-inlet', 0.72);
      ensure('moving-fluid', 0.7);
      ensure('flow-outlet', 0.5);
    }
    if (says('turbulent', 'turbulence', 'vortex', 'wake', 'swirl')) {
      ensure('turbulence-field', 0.72);
      ensure('wake-obstacle', 0.66);
      ensure('moving-fluid', 0.62);
    }
    if (has('reactant-a', 'reactant-b', 'catalyst-front')) {
      ensure('reactant-a', 0.7);
      ensure('reactant-b', 0.68);
      ensure('catalyst-front', 0.66);
      ensure('cooling-field', 0.52);
    }
    if (has('thermal-source') || says('hot', 'heat', 'cooling')) {
      ensure('thermal-source', 0.62);
      ensure('cooling-field', 0.52);
    }
    if (has('optical-prism', 'light-source')) {
      ensure('light-source', 0.68);
      ensure('optical-prism', 0.66);
    }
    if (has('acoustic-emitter', 'wave-source')) {
      ensure('acoustic-emitter', 0.68);
      ensure('wave-source', 0.62);
    }
    if (has('spring-constraint', 'collision-boundary', 'gravity-source')) {
      ensure('rigid-body', 0.56);
    }
    if (says('spring', 'elastic', 'collisions', 'collision')) {
      ensure('spring-constraint', 0.72);
      ensure('elasticity', 0.66);
      ensure('collision-boundary', 0.56);
      ensure('rigid-body', 0.52);
    }
    if (has('granular-bed')) {
      ensure('collision-boundary', 0.52);
      ensure('gravity-source', 0.46);
    }
    if (says('sand', 'granular', 'grain', 'grains', 'sediment')) {
      ensure('granular-bed', 0.68);
      ensure('sand', 0.58);
      ensure('collision-boundary', 0.52);
      ensure('gravity-source', 0.46);
    }
    if (has('buoyant-body')) {
      ensure('moving-fluid', 0.54);
      ensure('gravity-source', 0.42);
    }
    if (says('bubble', 'bubbles', 'float', 'floating', 'buoyant', 'buoyancy')) {
      ensure('buoyant-body', 0.7);
      ensure('moving-fluid', 0.54);
    }
    if (has('electric-field', 'plasma-arc')) {
      ensure('electric-field', 0.68);
      ensure('plasma-arc', 0.62);
      ensure('thermal-source', 0.5);
    }
    if (has('sun-star')) {
      ensure('light-source', 0.62);
      ensure('thermal-source', 0.56);
      ensure('energy-ledger', 0.42);
    }
    if (has('fire-front', 'wood-fiber')) {
      ensure('fire-front', 0.68);
      ensure('thermal-source', 0.56);
      ensure('cooling-field', 0.36);
    }
    if (has('water-volume')) {
      ensure('moving-fluid', 0.62);
      ensure('flow-inlet', 0.44);
      ensure('buoyant-body', 0.42);
    }
    if (has('rock-mass', 'ceramic-shell', 'crystal-lattice')) {
      ensure('rock-mass', 0.54);
      ensure('terrain-heightfield', 0.42);
      ensure('collision-boundary', 0.38);
    }
    if (has('metal-conductor')) {
      ensure('electric-field', 0.52);
      ensure('thermal-source', 0.34);
    }
    if (has('magnetic-core')) {
      ensure('electric-field', 0.48);
      ensure('metal-conductor', 0.42);
    }
    if (has('glass-pane')) {
      ensure('light-source', 0.5);
      ensure('optical-prism', 0.48);
    }
    if (has('atom-core', 'electron-cloud', 'ion-pair', 'molecular-bond')) {
      ensure('atom-core', 0.58);
      ensure('electron-cloud', 0.52);
      ensure('molecular-bond', 0.48);
      ensure('ion-pair', 0.42);
    }
    if (has('feedback-controller', 'sensor-array', 'delay-buffer')) {
      ensure('sensor-array', 0.66);
      ensure('feedback-controller', 0.64);
      ensure('delay-buffer', 0.48);
    }
    if (has('queue-server', 'logistics-node', 'network-link')) {
      ensure('queue-server', 0.62);
      ensure('network-link', 0.56);
      ensure('logistics-node', 0.54);
    }
    if (says('logistics', 'logistics node', 'warehouse', 'inventory', 'supply chain', 'transport')) {
      ensure('logistics-node', 0.74);
      ensure('network-link', 0.58);
      ensure('queue-server', 0.52);
    }
    if (has('terrain-heightfield', 'erosion-channel')) {
      ensure('terrain-heightfield', 0.64);
      ensure('erosion-channel', 0.58);
      ensure('flow-inlet', 0.44);
    }
    if (has('phase-change-material')) {
      ensure('thermal-source', 0.56);
      ensure('cooling-field', 0.44);
    }
    if (has('brine', 'mercury', 'copper', 'silicon', 'carbon')) {
      ensure('electric-field', 0.58);
      ensure('thermal-source', 0.42);
      ensure('crystal-lattice', 0.34);
    }
    if (has('gel', 'foam', 'membrane')) {
      ensure('cohesive-cluster', 0.56);
      ensure('adhesion-film', 0.44);
      ensure('wave-source', 0.36);
    }
    if (has('leaf', 'mycelium', 'protein', 'bacteria')) {
      ensure('population-field', 0.62);
      ensure('diffusion', 0.44);
      ensure('growth-decay', 0.42);
    }
    if (has('phase-change') || says('phase change', 'melt', 'freeze', 'boil', 'steam')) {
      ensure('phase-change-material', 0.7);
      ensure('thermal-source', 0.56);
      ensure('cooling-field', 0.44);
    }
    if (has('adhesion-film', 'cohesive-cluster')) {
      ensure('adhesion-film', 0.54);
      ensure('cohesive-cluster', 0.52);
    }
    if (has('population-field', 'infection-front')) {
      ensure('population-field', 0.62);
      ensure('infection-front', 0.56);
      ensure('reactant-a', 0.34);
    }
    if (has('market-demand', 'logistics-node')) {
      ensure('market-demand', 0.58);
      ensure('queue-server', 0.42);
    }
    if (has('noise-field', 'data-recorder')) {
      ensure('noise-field', 0.52);
      ensure('sensor-array', 0.42);
      ensure('data-recorder', 0.38);
    }
    if (says('data recorder', 'recorder', 'trace', 'audit', 'receipt')) {
      ensure('data-recorder', 0.74);
      ensure('noise-field', 0.56);
      ensure('sensor-array', 0.5);
    }
    if (has('sun-lamp', 'radiation')) {
      ensure('light-source', 0.56);
      ensure('heat-transfer', 0.48);
    }
    if (fireRequested && has('flame', 'combustion', 'fire-plasma', 'forest-fire')) {
      ensure('flame', 0.64);
      ensure('combustion', 0.58);
      ensure('heat-transfer', 0.5);
      ensure('smoke', 0.44);
    }
    if (has('river', 'river-erosion', 'water')) {
      ensure('water', 0.58);
      ensure('fluid-advection', 0.52);
      ensure('erosion', 0.44);
    }
    if (has('glass', 'lens', 'mirror', 'prism', 'optics-bench')) {
      ensure('optics', 0.58);
      ensure('glass', 0.5);
      ensure('light-source', 0.44);
    }
    if (has('magnet', 'magnetic-motor', 'magnetized-metal')) {
      ensure('magnetism', 0.58);
      ensure('magnetized-metal', 0.52);
      ensure('electromagnetism', 0.42);
    }
    if (!rows.some((primitive) => primitive.type === 'body' || primitive.type === 'material')) {
      ensure('rigid-body', 0.42);
    }
    ensure('energy-ledger', 0.34);
    return rows
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 40);
  }

  return {
    BASE_CATALOG_ITEMS,
    COMPILER_INPUT_PLANE,
    CONSERVATION_RULES,
    CONTROL_LIBRARY,
    COMPONENT_LIBRARY,
    COMPOSITION_LIBRARY,
    CONTEXTUAL_READOUT_RULES,
    DEFAULT_PARAMS,
    EXAMPLE_INTENTS,
    FIELD_GRID,
    GEOMETRY_OVERRIDES,
    GEOMETRY_PROFILES,
    INTERACTION_RULES,
    LAYERED_PRIMITIVES,
    LAYER_INDEX,
    LAYER_STACK,
    MATERIAL_PRIMITIVE_LIBRARY,
    MATERIAL_PROFILES,
    MATERIAL_PROPERTY_DEFAULTS,
    MATERIAL_PROPERTY_SCHEMA,
    MATH_PRIMITIVE_LIBRARY,
    OPERATOR_MATCHES,
    OPERATOR_REGISTRY,
    PARAM_UNIT_SCHEMA,
    PHYSICAL_PRIMITIVES,
    PHYSICS_PRIMITIVE_LIBRARY,
    PORT_PROFILES,
    PRIMITIVE_LIBRARY,
    RECIPE_SLOT_LIBRARY,
    SCENE_LAYOUTS,
    SCENE_LIBRARY,
    SEMANTIC_STOPWORDS,
    TAU,
    TEMPLATE_LIBRARY,
    TEMPORAL_GRAMMAR,
    TOKEN_SYNONYMS,
    buildIntentVector,
    clamp,
    clamp01,
    classifyPromptLayer,
    compileGraphIR,
    conservationForPrimitives,
    contractForPrimitive,
    contractSummaryForPrimitives,
    controlsByKey,
    controlsForSpec,
    explicitPrimitiveScore,
    geometryForPrimitive,
    graphEdgesForNodes,
    graphNodeForPrimitive,
    hashNoise,
    labelize,
    layerForId,
    layoutForPrimitives,
    lowerLayerFor,
    meaningfulTokens,
    materialPropertiesForId,
    matchingInteractionRules,
    normalizeControl,
    normalizeObjects,
    normalizeParams,
    operatorsForPrimitives,
    portsForPrimitive,
    primitiveById,
    primitiveTokenSet,
    primitiveText,
    rankPhysicalPrimitives,
    readoutsForPrimitives,
    recipeSlotsForId,
    shortestAngle,
    slugify,
    stateForPrimitive,
    templateById,
    temporalEventsForPrimitives,
    toCatalogItem,
    uniqueCatalogItems,
    uniqueList,
    unitsForParams,
    validateGraphIR,
    validateLayerAdjacency,
    vectorScore,
    withPrimitiveDependencies,
    wrapAngle,
  };
});
