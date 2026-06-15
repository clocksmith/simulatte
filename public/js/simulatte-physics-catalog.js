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

  const MATH_PRIMITIVE_LIBRARY = Object.freeze([
    { id: 'scalar-field', type: 'field', text: 'scalar field density heat pressure concentration potential' },
    { id: 'vector-field', type: 'field', text: 'vector field velocity force direction flow gradient' },
    { id: 'particle-set', type: 'material', text: 'particle set points agents grains droplets molecules' },
    { id: 'rigid-body', type: 'body', text: 'rigid body mass inertia rotation collision' },
    { id: 'soft-body', type: 'body', text: 'soft body deformation cloth jelly elastic mesh' },
    { id: 'graph-network', type: 'field', text: 'graph network nodes edges links routing topology' },
    { id: 'grid-heightfield', type: 'material', text: 'grid heightfield raster terrain scalar samples' },
    { id: 'constraint', type: 'constraint', text: 'constraint joint boundary limit relation' },
    { id: 'source-sink', type: 'source', text: 'source sink input output emitter drain reservoir' },
    { id: 'oscillator', type: 'field', text: 'oscillator sine wave resonance periodic phase' },
    { id: 'noise-process', type: 'field', text: 'noise process stochastic jitter random uncertainty' },
    { id: 'delay', type: 'constraint', text: 'delay lag buffer memory latency feedback' },
    { id: 'threshold', type: 'constraint', text: 'threshold trigger switch gate activation cutoff' },
    { id: 'queue', type: 'process', text: 'queue backlog service arrivals departures wait line' },
    { id: 'conservation-ledger', type: 'ledger', text: 'conservation ledger balance mass energy accounting' },
  ].map((item) => toCatalogItem('math', item)));

  const PHYSICS_PRIMITIVE_LIBRARY = Object.freeze([
    { id: 'gravity', type: 'field', controls: ['gravity'], text: 'gravity weight orbit acceleration well' },
    { id: 'collision', type: 'constraint', controls: ['restitution'], text: 'collision impact contact restitution bounce' },
    { id: 'friction', type: 'loss', controls: ['friction'], text: 'friction drag resistance damping loss' },
    { id: 'elasticity', type: 'constraint', controls: ['springConstant'], text: 'elasticity spring stretch compression restoring force' },
    { id: 'pressure', type: 'field', controls: ['pressure'], text: 'pressure compression gas liquid vessel' },
    { id: 'buoyancy', type: 'field', controls: ['buoyancy'], text: 'buoyancy float lift density displacement' },
    { id: 'fluid-advection', type: 'field', controls: ['flowRate'], text: 'fluid advection flow transport velocity stream' },
    { id: 'diffusion', type: 'field', controls: ['diffusionA', 'diffusionB'], text: 'diffusion spread gradient concentration mixing' },
    { id: 'heat-transfer', type: 'field', controls: ['heatTransfer'], text: 'heat transfer conduction convection temperature' },
    { id: 'radiation', type: 'source', controls: ['irradiance'], text: 'radiation sunlight emission photons energy' },
    { id: 'combustion', type: 'process', controls: ['combustibility'], text: 'combustion burning fuel oxygen flame heat smoke' },
    { id: 'phase-change', type: 'process', controls: ['phaseThreshold'], text: 'phase change melt freeze boil vaporize condense' },
    { id: 'optics', type: 'field', controls: ['refractiveIndex'], text: 'optics light reflection refraction lens prism' },
    { id: 'electromagnetism', type: 'field', controls: ['electricField'], text: 'electromagnetism charge current voltage field' },
    { id: 'magnetism', type: 'field', controls: ['magnetization'], text: 'magnetism poles magnetic field attraction repulsion' },
    { id: 'chemical-reaction', type: 'process', controls: ['reactionRate'], text: 'chemical reaction reactants products catalyst rate' },
    { id: 'erosion', type: 'process', controls: ['erosionRate'], text: 'erosion sediment carve river terrain weathering' },
    { id: 'growth-decay', type: 'process', controls: ['populationGrowth'], text: 'growth decay population biomass infection exponential' },
  ].map((item) => toCatalogItem('physics', item)));

  const MATERIAL_PRIMITIVE_LIBRARY = Object.freeze([
    { id: 'water', type: 'material', controls: ['viscosity', 'moisture'], text: 'water liquid wet river lake droplet' },
    { id: 'air', type: 'material', controls: ['pressure', 'windSpeed'], text: 'air gas atmosphere wind pressure' },
    { id: 'steam', type: 'material', controls: ['thermalFlux', 'pressure'], text: 'steam vapor hot gas phase change' },
    { id: 'smoke', type: 'material', controls: ['turbulence', 'signalNoise'], text: 'smoke particles plume fire advection' },
    { id: 'fire-plasma', type: 'material', controls: ['plasmaTemperature'], text: 'fire plasma ionized hot flame glow' },
    { id: 'ice', type: 'material', controls: ['phaseThreshold', 'hardness'], text: 'ice frozen water solid cold slippery' },
    { id: 'oil', type: 'material', controls: ['viscosity'], text: 'oil viscous liquid fuel slick' },
    { id: 'sand', type: 'material', controls: ['granularFriction'], text: 'sand grains granular pile sediment' },
    { id: 'soil', type: 'material', controls: ['moisture', 'erosionRate'], text: 'soil dirt earth porous organic' },
    { id: 'clay', type: 'material', controls: ['adhesion', 'moisture'], text: 'clay sticky ceramic wet plasticity' },
    { id: 'rock', type: 'material', controls: ['hardness'], text: 'rock stone mineral boulder solid' },
    { id: 'metal', type: 'material', controls: ['conductivity', 'hardness'], text: 'metal conductor iron copper steel dense' },
    { id: 'magnetized-metal', type: 'material', controls: ['magnetization'], text: 'magnetized metal ferromagnetic poles field' },
    { id: 'glass', type: 'material', controls: ['refractiveIndex', 'opacity'], text: 'glass transparent silica lens brittle' },
    { id: 'wood', type: 'material', controls: ['combustibility', 'moisture'], text: 'wood timber fiber organic fuel' },
    { id: 'rubber', type: 'material', controls: ['elasticity', 'damping'], text: 'rubber elastic soft high friction' },
    { id: 'fabric', type: 'material', controls: ['membraneTension'], text: 'fabric cloth weave soft body' },
    { id: 'concrete', type: 'material', controls: ['hardness', 'density'], text: 'concrete stone aggregate structural wall' },
    { id: 'plastic', type: 'material', controls: ['hardness', 'combustibility'], text: 'plastic polymer lightweight solid' },
    { id: 'fuel', type: 'material', controls: ['combustibility'], text: 'fuel gasoline biomass combustible energy' },
    { id: 'biomass', type: 'material', controls: ['populationGrowth', 'moisture'], text: 'biomass plant organic growth fuel' },
  ].map((item) => toCatalogItem('material', item)));

  const PRIMITIVE_LIBRARY = uniqueCatalogItems(
    MATH_PRIMITIVE_LIBRARY,
    PHYSICS_PRIMITIVE_LIBRARY,
    MATERIAL_PRIMITIVE_LIBRARY
  );

  const COMPONENT_LIBRARY = Object.freeze([
    { id: 'sun-lamp', recipe: ['radiation', 'heat-transfer', 'light-source'], text: 'sun lamp radiative light heat source' },
    { id: 'flame', recipe: ['combustion', 'heat-transfer', 'smoke', 'fluid-advection'], text: 'flame combustion heat light smoke flow' },
    { id: 'river', recipe: ['water', 'fluid-advection', 'erosion', 'grid-heightfield'], text: 'river flowing water channel erosion' },
    { id: 'lake', recipe: ['water', 'pressure', 'buoyancy'], text: 'lake still water reservoir buoyancy' },
    { id: 'cloud', recipe: ['air', 'water', 'diffusion', 'fluid-advection'], text: 'cloud vapor droplets air flow' },
    { id: 'wind-field-component', recipe: ['air', 'vector-field', 'fluid-advection'], text: 'wind field moving air vector flow' },
    { id: 'rock-wall', recipe: ['rock', 'collision', 'constraint'], text: 'rock wall hard boundary collision' },
    { id: 'terrain-patch', recipe: ['grid-heightfield', 'soil', 'rock', 'erosion'], text: 'terrain patch heightfield soil rock' },
    { id: 'pipe', recipe: ['constraint', 'pressure', 'fluid-advection'], text: 'pipe boundary pressure fluid transport' },
    { id: 'pump', recipe: ['source-sink', 'pressure', 'fluid-advection'], text: 'pump source pressure flow' },
    { id: 'valve', recipe: ['threshold', 'constraint', 'pressure'], text: 'valve threshold flow control' },
    { id: 'fan', recipe: ['vector-field', 'air', 'motor'], text: 'fan air flow rotor motor' },
    { id: 'motor', recipe: ['electromagnetism', 'rigid-body', 'conservation-ledger'], text: 'motor electromagnetic rotation load' },
    { id: 'generator', recipe: ['magnetism', 'rigid-body', 'conservation-ledger'], text: 'generator magnetic rotation output' },
    { id: 'battery', recipe: ['source-sink', 'chemical-reaction', 'conservation-ledger'], text: 'battery stored energy chemical source' },
    { id: 'heater', recipe: ['heat-transfer', 'source-sink'], text: 'heater thermal source' },
    { id: 'cooler', recipe: ['heat-transfer', 'source-sink'], text: 'cooler thermal sink radiator' },
    { id: 'lens', recipe: ['glass', 'optics'], text: 'lens glass refraction focus light' },
    { id: 'mirror', recipe: ['metal', 'optics'], text: 'mirror reflective metal light' },
    { id: 'prism', recipe: ['glass', 'optics'], text: 'prism glass spectrum refraction' },
    { id: 'magnet', recipe: ['magnetized-metal', 'magnetism'], text: 'magnet poles field attraction' },
    { id: 'wheel', recipe: ['rigid-body', 'collision'], text: 'wheel rotating rigid body axle' },
    { id: 'gear', recipe: ['rigid-body', 'constraint', 'collision'], text: 'gear teeth rotation constraint' },
    { id: 'sensor', recipe: ['scalar-field', 'noise-process'], text: 'sensor measurement signal noise' },
    { id: 'controller', recipe: ['delay', 'threshold', 'sensor'], text: 'controller feedback delay threshold' },
  ].map((item) => toCatalogItem('component', { ...item, type: 'component' })));

  const COMPOSITION_LIBRARY = Object.freeze([
    { id: 'forest-fire', recipe: ['flame', 'wood', 'air', 'smoke', 'wind-field-component'], text: 'forest fire wood flame smoke wind spread' },
    { id: 'river-erosion', recipe: ['river', 'terrain-patch', 'sand', 'soil'], text: 'river erosion terrain sediment watershed' },
    { id: 'steam-engine', recipe: ['heater', 'water', 'steam', 'pressure', 'wheel'], text: 'steam engine heat water pressure wheel' },
    { id: 'wind-tunnel', recipe: ['fan', 'air', 'sensor', 'rigid-body'], text: 'wind tunnel air fan drag sensor' },
    { id: 'optics-bench', recipe: ['sun-lamp', 'lens', 'mirror', 'prism', 'glass'], text: 'optics bench light lens mirror prism' },
    { id: 'magnetic-motor', recipe: ['magnet', 'metal', 'wheel', 'motor', 'controller'], text: 'magnetic motor rotor magnet controller' },
    { id: 'chemical-reactor', recipe: ['chemical-reaction', 'heater', 'cooler', 'sensor'], text: 'chemical reactor reaction heat flow control' },
    { id: 'greenhouse', recipe: ['sun-lamp', 'glass', 'air', 'water', 'biomass'], text: 'greenhouse glass solar heat growth' },
    { id: 'weather-cell', recipe: ['air', 'water', 'heat-transfer', 'pressure', 'cloud'], text: 'weather cell air water pressure cloud' },
    { id: 'supply-chain', recipe: ['queue', 'graph-network', 'source-sink', 'conservation-ledger'], text: 'supply chain queue network inventory flow' },
    { id: 'infection-spread', recipe: ['growth-decay', 'diffusion', 'graph-network', 'delay'], text: 'infection spread population graph delay' },
    { id: 'traffic-system', recipe: ['queue', 'graph-network', 'controller', 'sensor'], text: 'traffic system network queues signals' },
    { id: 'market-queue', recipe: ['queue', 'source-sink', 'delay', 'conservation-ledger'], text: 'market queue demand service backlog' },
    { id: 'power-grid', recipe: ['graph-network', 'source-sink', 'conservation-ledger', 'delay'], text: 'power grid network source load stability' },
  ].map((item) => toCatalogItem('composition', { ...item, type: 'composition' })));

  const SCENE_LIBRARY = Object.freeze([
    { id: 'lab-bench', recipe: ['optics-bench', 'chemical-reactor', 'sensor'], text: 'lab bench instruments glass reactor optics' },
    { id: 'desert-solar-field', recipe: ['sun-lamp', 'sand', 'power-grid'], text: 'desert solar field radiation sand grid' },
    { id: 'mountain-watershed', recipe: ['river-erosion', 'rock', 'soil'], text: 'mountain watershed river erosion valley' },
    { id: 'factory-floor', recipe: ['motor', 'generator', 'pipe', 'sensor'], text: 'factory floor machines pipes control' },
    { id: 'city-grid', recipe: ['traffic-system', 'power-grid', 'market-queue'], text: 'city grid traffic power market' },
    { id: 'forest', recipe: ['forest-fire', 'biomass', 'water', 'air'], text: 'forest biomass wood fire water air' },
    { id: 'coastline-storm', recipe: ['weather-cell', 'water', 'wind-field-component'], text: 'coastline storm wind water pressure' },
    { id: 'reactor-room', recipe: ['chemical-reactor', 'heater', 'cooler', 'sensor'], text: 'reactor room heat chemistry control' },
    { id: 'warehouse', recipe: ['supply-chain', 'queue', 'sensor'], text: 'warehouse logistics queue inventory' },
    { id: 'transit-map', recipe: ['traffic-system', 'graph-network', 'queue'], text: 'transit map routes queues network' },
    { id: 'marketplace', recipe: ['market-queue', 'supply-chain'], text: 'marketplace demand supply queue' },
    { id: 'biological-colony', recipe: ['infection-spread', 'biomass', 'growth-decay'], text: 'biological colony growth diffusion infection' },
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
  });

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

  const PHYSICAL_PRIMITIVES = uniqueCatalogItems(
    PRIMITIVE_LIBRARY,
    COMPONENT_LIBRARY,
    COMPOSITION_LIBRARY,
    SCENE_LIBRARY,
    BASE_CATALOG_ITEMS
  );

  const EXAMPLE_INTENTS = Object.freeze([
    {
      id: 'magnetic-machine',
      label: 'W',
      prompt: 'sunlit rotor with alternating magnets, moving slider, solar input, load torque, bearing drag, and conservation meter',
      params: {
        irradiance: 1040,
        magneticStrength: 0.9,
        sliderAmplitude: 0.68,
        sliderPhase: 0.12,
        loadTorque: 0.28,
        friction: 0.055,
        driveTiming: 0.64,
      },
    },
    {
      id: 'dry-combustion',
      label: 'X',
      prompt: 'dry pine litter combustion with a wind band, smoke lift, water line, rock break, damp pockets, and thermal spread',
      params: {
        combustibility: 0.88,
        moisture: 0.18,
        windSpeed: 0.52,
        flowRate: 0.38,
        heatTransfer: 0.74,
        opacity: 0.62,
        damping: 0.07,
      },
    },
    {
      id: 'prismatic-rail',
      label: 'Y',
      prompt: 'collimated white beam through glass lens, prism, mirror rail, sensor plane, refractive split, and prismatic rays',
      params: {
        lightIntensity: 0.92,
        refractiveIndex: 1.68,
        opacity: 0.08,
        fieldStrength: 0.62,
        heatTransfer: 0.14,
        signalNoise: 0.04,
      },
    },
    {
      id: 'service-loop',
      label: 'Z',
      prompt: 'rush-hour service loop with signal delay, power feeder, demand queue, load zone, noisy packets, and throughput meter',
      params: {
        queueBacklog: 0.78,
        serviceRate: 0.42,
        marketDemand: 0.74,
        networkLatency: 0.44,
        signalDelay: 0.32,
        signalNoise: 0.18,
      },
    },
    {
      id: 'rain-cut',
      label: 'P',
      prompt: 'steep rain channel cutting sand and soil around rock ridges with water flow, erosion, sediment fan, and gravity slope',
      params: {
        flowRate: 0.82,
        erosionRate: 0.62,
        terrainSlope: 0.54,
        gravity: 0.18,
        granularFriction: 0.32,
        moisture: 0.76,
      },
    },
    {
      id: 'matter-tray',
      label: 'Q',
      prompt: 'water air rock wood metal glass magnetized metal gravity heat diffusion sample tray',
      params: {
        density: 0.74,
        hardness: 0.76,
        conductivity: 0.72,
        magnetization: 0.68,
        refractiveIndex: 1.58,
        moisture: 0.66,
        heatTransfer: 0.45,
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
      geometry: object.geometry || null,
      ports: object.ports || null,
      slots: object.slots || [],
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

  function primitiveText(primitive) {
    return `${primitive.id} ${primitive.type} ${primitive.role} ${primitive.domains.join(' ')} ${primitive.text || ''}`;
  }

  function materialPropertiesForId(id) {
    return {
      ...MATERIAL_PROPERTY_DEFAULTS,
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
      layer: primitive.layer || '',
      type: primitive.type,
      role: primitive.role,
      geometry: contract && contract.geometry ? contract.geometry[primitive.id] || geometryForPrimitive(primitive) : geometryForPrimitive(primitive),
      ports: contract && contract.ports ? contract.ports[primitive.id] || portsForPrimitive(primitive) : portsForPrimitive(primitive),
      material: contract && contract.materials ? contract.materials[primitive.id] || null : null,
      state: stateForPrimitive(primitive, contract),
      order: index,
    };
  }

  function graphEdgesForNodes(nodes, primitives) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges = [];
    const addEdge = (from, to, channel, reason) => {
      if (!from || !to || from === to || edges.length >= 96) return;
      const id = `${from}->${to}:${channel}:${reason}`;
      if (edges.some((edge) => edge.id === id)) return;
      edges.push({ id, from, to, channel, reason });
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
    const expanded = primitives
      .filter((primitive) => primitive.id !== topIdentity)
      .slice(0, 8)
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

  function compileGraphIR(primitives, promptText, contract, params = {}) {
    const nodes = (primitives || []).map((primitive, index) => graphNodeForPrimitive(primitive, contract, index));
    const graph = {
      schema: 'simulatte.graphIR.v1',
      units: unitsForParams(params),
      nodes,
      edges: graphEdgesForNodes(nodes, primitives),
      operators: operatorsForPrimitives(primitives),
      conservation: conservationForPrimitives(primitives),
      temporal: temporalEventsForPrimitives(primitives),
      validation: null,
      explanation: null,
    };
    graph.validation = validateGraphIR(graph, primitives, promptText);
    graph.explanation = promptExplanation(promptText, primitives, contract, graph);
    return graph;
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
    return {
      id: primitive.id,
      layer: primitive.layer || '',
      geometry: geometryForPrimitive(primitive),
      material: primitive.layer === 'material' || MATERIAL_PROFILES[primitive.id]
        ? materialPropertiesForId(primitive.id)
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
    if (has('granular-bed')) {
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
    if (has('terrain-heightfield', 'erosion-channel')) {
      ensure('terrain-heightfield', 0.64);
      ensure('erosion-channel', 0.58);
      ensure('flow-inlet', 0.44);
    }
    if (has('phase-change-material')) {
      ensure('thermal-source', 0.56);
      ensure('cooling-field', 0.44);
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
    if (has('sun-lamp', 'radiation')) {
      ensure('light-source', 0.56);
      ensure('heat-transfer', 0.48);
    }
    if (has('flame', 'combustion', 'fire-plasma', 'forest-fire')) {
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
    layoutForPrimitives,
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
    vectorScore,
    withPrimitiveDependencies,
    wrapAngle,
  };
});
