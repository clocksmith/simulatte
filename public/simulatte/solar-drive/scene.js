(function attachSolarScene(root) {
  'use strict';
  const g = root.SimulatteSolarGeometry;
  if (!g) throw new Error('solar_scene_geometry_missing');
  const PI = Math.PI, TAU = PI * 2;
  const IDS = ['solar', 'controller', 'battery', 'flywheel', 'motor', 'chassis'];
  const M = Object.freeze({
    frame: [[0.12, 0.18, 0.18, 0], 0.8, 0.28, 6],
    aluminum: [[0.68, 0.73, 0.75, 0], 0.92, 0.26, 6],
    chrome: [[0.82, 0.85, 0.86, 0], 0.98, 0.13, 6],
    dark: [[0.025, 0.035, 0.04, 0], 0.5, 0.35, 0],
    carbon: [[0.035, 0.045, 0.05, 0], 0.45, 0.36, 1],
    rubber: [[0.027, 0.031, 0.033, 0], 0.02, 0.85, 2],
    copper: [[0.72, 0.31, 0.13, 0], 0.94, 0.23, 6],
    gold: [[0.70, 0.48, 0.14, 0], 0.8, 0.26, 0],
    magnetN: [[0.30, 0.065, 0.045, 0], 0.65, 0.22, 0],
    magnetS: [[0.07, 0.26, 0.24, 0], 0.65, 0.22, 0],
    cell: [[0.13, 0.28, 0.25, 0], 0.6, 0.28, 0],
    pcb: [[0.04, 0.13, 0.085, 0], 0.1, 0.5, 5],
    solar: [[0.008, 0.025, 0.075, 0], 0.5, 0.13, 3],
    ground: [[0.85, 0.84, 0.80, 0], 0, 0.9, 4],
    flow: [[0.15, 0.5, 0.34, 0.5], 0.2, 0.3, 0],
    photon: [[0.9, 0.61, 0.16, 0.7], 0.3, 0.2, 0],
    field: [[0.12, 0.38, 0.47, 0.4], 0.1, 0.4, 0],
  });

  function create(p) {
    const car = p.vehicle === 'car', scooter = p.vehicle === 'scooter';
    const nodes = [];
    const r = p.wheelRadius;
    const wheelX = car ? 1.18 : scooter ? 0.62 : 0.72;
    const solarY = car ? 1.52 : 1.92;
    const length = car ? 2.65 : 1.85;
    const width = Math.max(0.12, p.panelArea / length);
    const anchors = {
      solar: [0, solarY, 0], controller: [car ? 0.90 : 0.35, car ? 0.62 : 0.64, 0],
      battery: [car ? -0.15 : -0.28, car ? 0.40 : 0.68, 0],
      flywheel: [car ? 0.50 : 0.14, car ? 0.62 : 0.57, car ? 0.4 : 0],
      motor: [-wheelX, r, car ? 0 : 0], chassis: [0, 0, 0],
    };
    const expanded = {
      solar: [0, car ? 2.45 : 2.25, -0.15], controller: [car ? 2.2 : 1.95, 1.62, 0.02],
      battery: [car ? -2.1 : -1.95, 1.22, 0.4], flywheel: [-0.15, 1.0, 1.25],
      motor: [car ? 1.9 : 1.4, 0.52, 0.96], chassis: [0, 0, 0],
    };
    function node(mesh, group, position, scale, material, rotation = [0, 0, 0], options = {}) {
      const item = { mesh, group, position, scale, rotation, matrix: g.matrix(position, scale, rotation), material, ...options };
      nodes.push(item); return item;
    }
    function tube(group, a, b, radius, material, options = {}) {
      nodes.push({ mesh: 'cylinder', group, matrix: g.between(a, b, radius), material, ...options });
    }
    function bolts(group, radius, z, count = 12, boltR = 0.007) {
      for (let i = 0; i < count; i += 1) {
        const a = i * TAU / count;
        node('cylinder', group, [Math.cos(a) * radius, Math.sin(a) * radius, z], [boltR, boltR, 0.014], M.chrome);
        node('cylinder', group, [Math.cos(a) * radius, Math.sin(a) * radius, z + 0.008], [boltR * 0.45, boltR * 0.45, 0.002], M.dark);
      }
    }
    node('box', 'ground', [0, -0.018, 0], [180, 0.025, 180], M.ground);
    const wheels = car ? [[-wheelX, r, -0.67], [-wheelX, r, 0.67], [wheelX, r, -0.67], [wheelX, r, 0.67]]
      : [[-wheelX, r, 0], [wheelX, r, 0]];
    for (const center of wheels) {
      node('torus', 'chassis', center, [r, r, car ? 0.95 : scooter ? 0.48 : 0.27], M.rubber);
      node('ring', 'chassis', center, [r * 0.82, r * 0.82, car ? 0.10 : 0.032], M.aluminum);
      node('cylinder', 'chassis', center, [0.042, 0.042, car ? 0.16 : 0.10], M.chrome);
      const count = car ? 10 : scooter ? 12 : 28;
      for (let i = 0; i < count; i += 1) {
        const a = i * TAU / count;
        tube('chassis', g.add(center, [Math.cos(a + 0.28) * 0.05, Math.sin(a + 0.28) * 0.05, i % 2 ? 0.022 : -0.022]),
          g.add(center, [Math.cos(a) * r * 0.80, Math.sin(a) * r * 0.80, 0]), car ? 0.012 : 0.0025,
          M.chrome, { spin: 'wheel', pivot: center });
      }
      node('ring', 'chassis', g.add(center, [0, 0, 0.045]), [r * 0.40, r * 0.40, 0.006], M.chrome);
      node('box', 'chassis', g.add(center, [0.08, 0.08, 0.05]), [0.055, 0.10, 0.035], M.dark);
    }
    if (car) {
      node('box', 'chassis', [0, 0.39, 0], [2.9, 0.10, 1.18], M.carbon);
      for (const z of [-0.54, 0.54]) {
        tube('chassis', [-1.35, 0.5, z], [1.35, 0.5, z], 0.07, M.frame);
        tube('chassis', [-0.95, 0.6, z], [-0.65, 1.40, z], 0.026, M.aluminum);
        tube('chassis', [-0.65, 1.40, z], [0.58, 1.40, z], 0.026, M.aluminum);
        tube('chassis', [0.58, 1.40, z], [1.06, 0.68, z], 0.026, M.aluminum);
        node('box', 'chassis', [0, 0.72, z * 0.54], [0.42, 0.12, 0.37], M.dark);
        node('box', 'chassis', [-0.20, 0.96, z * 0.54], [0.08, 0.46, 0.37], M.dark, [0, 0, 0.12]);
        node('box', 'chassis', [0, 0.57, z * 1.13], [2.1, 0.26, 0.05], M.frame, [0, 0, 0], { shell: true });
      }
      node('box', 'chassis', [1.15, 0.64, 0], [0.72, 0.12, 1.15], M.frame, [0, 0, -0.16]);
      node('box', 'chassis', [-1.22, 0.69, 0], [0.56, 0.13, 1.15], M.frame, [0, 0, 0.08]);
      tube('chassis', [-wheelX, r, -0.67], [-wheelX, r, 0.67], 0.024, M.chrome);
      tube('chassis', [wheelX, r, -0.67], [wheelX, r, 0.67], 0.024, M.chrome);
      for (const z of [-0.42, 0.42]) node('box', 'chassis', [1.48, 0.66, z], [0.025, 0.055, 0.2], M.photon);
      node('torus', 'chassis', [0.59, 1.02, 0.28], [0.13, 0.13, 0.10], M.rubber, [PI / 2, 0.5, 0]);
    } else if (scooter) {
      node('box', 'chassis', [-0.08, 0.27, 0], [1.05, 0.08, 0.28], M.frame);
      node('box', 'chassis', [-0.08, 0.318, 0], [0.84, 0.018, 0.25], M.rubber);
      tube('chassis', [-0.6, r, 0], [-0.45, 0.29, 0], 0.04, M.frame);
      for (const z of [-0.07, 0.07]) tube('chassis', [wheelX, r, z], [0.48, 0.62, z], 0.02, M.chrome);
      tube('chassis', [0.48, 0.55, 0], [0.33, 1.25, 0], 0.035, M.frame);
      tube('chassis', [0.33, 1.25, -0.29], [0.33, 1.25, 0.29], 0.019, M.dark);
    } else {
      const seat = [-0.29, 1.03, 0], bottom = [-0.10, 0.38, 0], head = [0.48, 1.05, 0];
      for (const [a, b] of [[seat, bottom], [seat, head], [bottom, head]]) tube('chassis', a, b, 0.024, M.frame);
      for (const z of [-0.055, 0.055]) {
        const rear = [-wheelX, r, z], front = [wheelX, r, z];
        tube('chassis', rear, seat, 0.013, M.frame); tube('chassis', rear, bottom, 0.014, M.frame);
        tube('chassis', front, [0.49, 0.94, z], 0.017, M.aluminum);
      }
      tube('chassis', seat, [-0.33, 1.16, 0], 0.015, M.chrome);
      node('box', 'chassis', [-0.34, 1.16, 0], [0.24, 0.042, 0.15], M.dark, [0, 0, 0.05]);
      tube('chassis', head, [0.43, 1.22, 0], 0.014, M.chrome);
      tube('chassis', [0.43, 1.22, -0.27], [0.43, 1.22, 0.27], 0.016, M.dark);
      for (const z of [-0.09, 0.09]) {
        tube('chassis', bottom, [-0.04, 0.22, z], 0.012, M.chrome);
        node('box', 'chassis', [-0.04, 0.22, z * 1.5], [0.10, 0.018, 0.08], M.dark);
      }
      node('ring', 'chassis', [-0.10, 0.38, 0.06], [0.08, 0.08, 0.008], M.aluminum);
      for (const y of [-0.065, 0.065]) tube('chassis', [-0.10, 0.38 + y, 0.072], [-wheelX, r + y * 0.45, 0.072], 0.004, M.dark);
    }
    if (p.panelArea > 0) {
      for (const z of [-width * 0.43, width * 0.43]) {
        tube('chassis', [-0.65, car ? 0.75 : 0.58, z * 0.35], [-0.7, solarY - 0.02, z], 0.012, M.aluminum);
        tube('chassis', [0.45, car ? 0.82 : 0.95, z * 0.35], [0.63, solarY - 0.02, z], 0.012, M.aluminum);
      }
      node('box', 'solar', [0, -0.016, 0], [length + 0.035, 0.032, width + 0.035], M.aluminum);
      for (let i = 0; i < 4; i += 1) {
        node('box', 'solar', [(i - 1.5) * length / 4, 0.009, 0], [length / 4 - 0.006, 0.016, width - 0.014], M.solar);
        node('box', 'solar', [(i - 1.5) * length / 4, -0.048, 0], [0.13, 0.045, 0.09], M.dark);
      }
      for (const x of [-length / 2, length / 2]) for (const z of [-width / 2, width / 2]) {
        node('cylinder', 'solar', [x, 0.015, z], [0.009, 0.009, 0.009], M.chrome, [PI / 2, 0, 0]);
      }
    }
    // Pack geometry is a representative cell assembly, not a manufactured cell count.
    const packScale = car ? 2.1 : scooter ? 1.25 : 1;
    const bx = 0.42 * packScale, bz = 0.27 * packScale;
    node('box', 'battery', [0, -0.059, 0], [bx + 0.025, 0.025, bz + 0.025], M.aluminum);
    for (const x of [-bx / 2, bx / 2]) node('box', 'battery', [x, 0, 0], [0.014, 0.14, bz], M.dark);
    for (const z of [-bz / 2, bz / 2]) node('box', 'battery', [0, 0, z], [bx, 0.14, 0.014], M.dark);
    node('box', 'battery', [0, 0.08, 0], [bx, 0.016, bz], M.carbon, [0, 0, 0], { shell: true, separate: [0, 0.18, 0] });
    for (let x = 0; x < 10; x += 1) for (let z = 0; z < 6; z += 1) {
      const pos = [(x - 4.5) * bx / 10.4, 0.013, (z - 2.5) * bz / 6.4];
      const cr = bx / 24;
      node('cylinder', 'battery', pos, [cr, cr, 0.115], M.cell, [PI / 2, 0, 0]);
      node('cylinder', 'battery', g.add(pos, [0, 0.062, 0]), [cr * 0.7, cr * 0.7, 0.006], M.chrome, [PI / 2, 0, 0]);
    }
    for (let z = 0; z < 6; z += 1) node('box', 'battery', [0, 0.08, (z - 2.5) * bz / 6.4], [bx * 0.93, 0.004, 0.009], M.copper);
    node('box', 'battery', [bx / 2 + 0.018, 0.04, 0], [0.027, 0.042, 0.065], M.copper);
    node('box', 'controller', [0, -0.017, 0], [0.29, 0.04, 0.20], M.aluminum);
    node('box', 'controller', [0, 0.012, 0], [0.26, 0.008, 0.18], M.pcb);
    for (let i = 0; i < 9; i += 1) node('box', 'controller', [(i - 4) * 0.027, -0.047, 0], [0.008, 0.045, 0.2], M.aluminum);
    for (let i = 0; i < 3; i += 1) {
      node('cylinder', 'controller', [-0.075 + i * 0.064, 0.04, -0.047], [0.021, 0.021, 0.045], M.dark, [PI / 2, 0, 0]);
      node('torus', 'controller', [-0.085 + i * 0.075, 0.039, 0.042], [0.024, 0.024, 0.11], M.copper, [PI / 2, 0, 0]);
      node('box', 'controller', [-0.083 + i * 0.074, 0.027, -0.001], [0.025, 0.015, 0.022], M.dark);
    }
    for (const z of [-0.064, 0, 0.064]) node('box', 'controller', [0.15, 0.01, z], [0.036, 0.034, 0.042], M.gold);
    node('box', 'controller', [0, 0.072, 0], [0.29, 0.02, 0.2], M.aluminum, [0, 0, 0], { shell: true, separate: [0, 0.15, 0] });

    if (p.flywheel) {
      const fr = p.flywheelRadius;
      const casingR = fr + 0.045;
      node('ring', 'flywheel', [0, 0, 0], [casingR, casingR, 0.33], M.aluminum);
      tube('flywheel', [0, 0, -0.29], [0, 0, 0.29], 0.015, M.chrome);
      for (const side of [-1, 1]) {
        const z = side * 0.083;
        node('ring', 'flywheel', [0, 0, z], [fr, fr, 0.072], M.carbon, [0, 0, 0], { spin: side === 1 ? 'rotor' : 'counterRotor' });
        node('cylinder', 'flywheel', [0, 0, z], [fr * 0.71, fr * 0.71, 0.03], M.aluminum);
        for (let i = 0; i < 12; i += 1) {
          const a = i * TAU / 12;
          node('box', 'flywheel', [Math.cos(a) * fr * 0.81, Math.sin(a) * fr * 0.81, z + side * 0.04],
            [0.032, 0.017, 0.013], i % 2 ? M.magnetS : M.magnetN, [0, 0, a], { spin: side === 1 ? 'rotor' : 'counterRotor' });
        }
        node('ring', 'flywheel', [0, 0, side * 0.155], [fr * 0.72, fr * 0.72, 0.034], M.dark);
        for (let i = 0; i < 16; i += 1) {
          const a = i * TAU / 16;
          node('torus', 'flywheel', [Math.cos(a) * fr * 0.56, Math.sin(a) * fr * 0.56, side * 0.18],
            [0.026, 0.036, 0.09], M.copper, [0, 0, a]);
        }
        node('ring', 'flywheel', [0, 0, side * 0.22], [0.051, 0.051, 0.04], M.magnetS);
        node('ring', 'flywheel', [0, 0, side * 0.255], [0.031, 0.031, 0.017], M.chrome);
        node('cylinder', 'flywheel', [0, 0, side * 0.19], [casingR, casingR, 0.018], M.aluminum,
          [0, 0, 0], { shell: true, separate: [0, 0, side * 0.25] });
        bolts('flywheel', casingR * 0.9, side * 0.18, 16);
      }
      for (const x of [-0.15, 0.15]) node('box', 'flywheel', [x, -casingR, 0], [0.09, 0.035, 0.4], M.dark);
    }
    const mr = car ? 0.18 : 0.12;
    node('ring', 'motor', [0, 0, 0], [mr * 1.3, mr * 1.3, 0.13], M.aluminum);
    node('ring', 'motor', [0, 0, 0.04], [mr, mr, 0.085], M.dark);
    node('cylinder', 'motor', [0, 0, 0.025], [mr * 0.56, mr * 0.56, 0.09], M.chrome, [0, 0, 0], { spin: 'wheel' });
    tube('motor', [0, 0, -0.16], [0, 0, 0.2], 0.015, M.chrome);
    for (let i = 0; i < 24; i += 1) {
      const a = i * TAU / 24;
      node('torus', 'motor', [Math.cos(a) * mr * 0.90, Math.sin(a) * mr * 0.90, 0.07], [0.018, 0.033, 0.16], M.copper, [0, 0, a]);
      node('box', 'motor', [Math.cos(a) * mr * 0.58, Math.sin(a) * mr * 0.58, 0.075], [0.016, 0.020, 0.07],
        i % 2 ? M.magnetS : M.magnetN, [0, 0, a], { spin: 'wheel' });
    }
    for (let i = 0; i < 9; i += 1) node('ring', 'motor', [0, 0, (i - 4) * 0.018], [mr * 1.38, mr * 1.38, 0.005], M.aluminum);
    node('cylinder', 'motor', [0, 0, 0.12], [mr * 1.26, mr * 1.26, 0.017], M.aluminum,
      [0, 0, 0], { shell: true, separate: [0, 0, 0.25] });
    bolts('motor', mr * 1.17, 0.094, 12, 0.006);

    function frame(state, view) {
      const positions = {};
      const groupMatrices = {};
      for (const id of IDS) {
        positions[id] = anchors[id].map((value, i) => value + (expanded[id][i] - value) * view.explode);
        groupMatrices[id] = g.matrix(positions[id], [1, 1, 1], id === 'solar' ? [0, 0, p.tilt * PI / 180] : [0, 0, 0]);
      }
      groupMatrices.ground = g.identity();
      const instances = [];
      const addInstance = (mesh, matrix, material, group) => {
        const code = IDS.indexOf(group) + 1;
        instances.push({ mesh, matrix, color: material[0], material: [material[1], material[2], material[3], code], group });
      };
      for (const n of nodes) {
        if (n.shell && view.cutaway) continue;
        let local = n.matrix;
        if (n.separate && view.explode) local = g.multiply(g.matrix(n.separate.map((v) => v * view.explode)), local);
        if (n.spin) {
          const angle = n.spin === 'wheel' ? -state.wheelAngle : state.rotorAngle * (n.spin === 'counterRotor' ? -1 : 1);
          let rotation = g.matrix([0, 0, 0], [1, 1, 1], [0, 0, angle]);
          if (n.pivot) rotation = g.multiply(g.multiply(g.matrix(n.pivot), rotation), g.matrix(n.pivot.map((v) => -v)));
          local = g.multiply(rotation, local);
        }
        addInstance(n.mesh, g.multiply(groupMatrices[n.group], local), n.material, n.group);
      }
      const flows = [
        ['solar', 'controller', state.flows.pvW, M.photon],
        ['battery', 'controller', state.flows.batteryW, M.flow],
        ['flywheel', 'controller', state.flows.flywheelW, M.copper],
        ['controller', 'motor', state.flows.driveW - state.flows.regenW, M.flow],
      ];
      for (const [from, to, watts, material] of flows) {
        if (from === 'flywheel' && !p.flywheel || from === 'solar' && !p.panelArea) continue;
        const a = positions[from], b = positions[to];
        const control = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 0.16, (a[2] + b[2]) / 2 + 0.20];
        const curve = (t) => a.map((v, i) => (1 - t) ** 2 * v + 2 * (1 - t) * t * control[i] + t ** 2 * b[i]);
        for (let j = 0; j < 16; j += 1) addInstance('cylinder', g.between(curve(j / 16), curve((j + 1) / 16), 0.004), M.dark, from);
        if (view.flows && Math.abs(watts) > 0.2) for (let j = 0; j < 5; j += 1) {
          const phase = ((state.timeS * (0.12 + Math.min(0.35, Math.abs(watts) / 4000)) + j / 5) % 1 + 1) % 1;
          addInstance('sphere', g.matrix(curve(watts > 0 ? phase : 1 - phase), [0.011, 0.011, 0.011]), material, from);
        }
      }
      if (view.fields) for (const id of p.flywheel ? ['motor', 'flywheel'] : ['motor']) {
        const center = positions[id];
        const radius = id === 'motor' ? mr * 1.7 : p.flywheelRadius * 1.5;
        for (let ring = 0; ring < 4; ring += 1) {
          const angle = ring * PI / 4;
          const point = (a) => g.add(center, [Math.sin(a) * radius * Math.cos(angle), Math.sin(a) * radius * Math.sin(angle), Math.cos(a) * 0.30]);
          for (let i = 0; i < 40; i += 1) addInstance('cylinder', g.between(point(i * TAU / 40), point((i + 1) * TAU / 40), 0.0014), M.field, id);
        }
      }
      return { instances, anchors: positions, timeS: state.timeS };
    }
    return Object.freeze({ frame, nodeCount: nodes.length });
  }
  root.SimulatteSolarScene = Object.freeze({ create, IDS });
})(globalThis);
