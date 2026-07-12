(function attachSimulatteObjectGeometryGrammars(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const OBJECT_GEOMETRY_PROGRAM_SCHEMA = 'simulatte.objectGeometryProgram.v1';

    const OBJECT_GEOMETRY_GRAMMARS = Object.freeze({
      dog: grammar('dog', [0.22, 0.12], 32, [
        part('body', 'ellipse', [-0.08, 0.02], [0.62, 0.46], '#9a6337'),
        part('head', 'ellipse', [0.31, -0.08], [0.31, 0.38], '#a96f3f'),
        part('muzzle', 'ellipse', [0.45, 0.01], [0.19, 0.17], '#d5aa72'),
        part('ear-left', 'capsule', [0.23, -0.31], [0.12, 0.27], '#4a2a1b', -0.35),
        part('ear-right', 'capsule', [0.37, -0.3], [0.11, 0.26], '#4a2a1b', 0.24),
        part('front-leg', 'capsule', [0.16, 0.3], [0.11, 0.34], '#7b4728', 1.3),
        part('back-leg', 'capsule', [-0.27, 0.29], [0.11, 0.36], '#7b4728', 1.82),
        part('tail', 'capsule', [-0.43, -0.06], [0.37, 0.1], '#7b4728', -0.34),
        part('eye', 'ellipse', [0.39, -0.12], [0.045, 0.055], '#17110d'),
      ]),
      cat: grammar('cat', [0.19, 0.115], 33, [
        part('body', 'ellipse', [-0.08, 0.03], [0.59, 0.43], '#c8a46b'),
        part('head', 'ellipse', [0.31, -0.08], [0.29, 0.37], '#d8b87d'),
        part('ear-left', 'triangle', [0.23, -0.34], [0.15, 0.25], '#9a774a'),
        part('ear-right', 'triangle', [0.39, -0.34], [0.15, 0.25], '#9a774a'),
        part('front-leg', 'capsule', [0.15, 0.3], [0.08, 0.34], '#aa8656', 1.35),
        part('back-leg', 'capsule', [-0.28, 0.29], [0.08, 0.34], '#aa8656', 1.78),
        part('tail', 'capsule', [-0.43, -0.11], [0.43, 0.075], '#aa8656', -0.58),
        part('eye-left', 'ellipse', [0.27, -0.1], [0.04, 0.055], '#14221a'),
        part('eye-right', 'ellipse', [0.37, -0.1], [0.04, 0.055], '#14221a'),
      ]),
      animal: grammar('animal', [0.2, 0.12], 30, [
        part('body', 'ellipse', [-0.08, 0.02], [0.64, 0.48], '#9f7650'),
        part('head', 'ellipse', [0.32, -0.08], [0.3, 0.38], '#b88a5d'),
        part('front-leg', 'capsule', [0.15, 0.3], [0.1, 0.34], '#79543a', 1.4),
        part('back-leg', 'capsule', [-0.3, 0.3], [0.1, 0.34], '#79543a', 1.72),
        part('tail', 'capsule', [-0.44, -0.06], [0.34, 0.09], '#79543a', -0.4),
      ]),
      person: grammar('person', [0.13, 0.29], 34, [
        part('head', 'ellipse', [0, -0.36], [0.25, 0.2], '#d7a06f'),
        part('hair', 'ellipse', [0, -0.43], [0.25, 0.11], '#33251f'),
        part('torso', 'rounded-box', [0, -0.06], [0.34, 0.42], '#356ea8'),
        part('left-arm', 'capsule', [-0.23, -0.03], [0.12, 0.42], '#d7a06f', 1.82),
        part('right-arm', 'capsule', [0.23, -0.03], [0.12, 0.42], '#d7a06f', 1.32),
        part('left-leg', 'capsule', [-0.11, 0.31], [0.14, 0.45], '#26384f', 1.5),
        part('right-leg', 'capsule', [0.11, 0.31], [0.14, 0.45], '#26384f', 1.64),
      ]),
      'person-sitting': grammar('person-sitting', [0.13, 0.25], 34, [
        part('head', 'ellipse', [0, -0.34], [0.25, 0.2], '#d7a06f'),
        part('hair', 'ellipse', [0, -0.41], [0.25, 0.11], '#33251f'),
        part('torso', 'rounded-box', [0, -0.08], [0.34, 0.43], '#356ea8'),
        part('left-arm', 'capsule', [-0.2, -0.02], [0.11, 0.38], '#d7a06f', 0.45),
        part('right-arm', 'capsule', [0.21, -0.01], [0.11, 0.38], '#d7a06f', -0.45),
        part('left-thigh', 'capsule', [-0.14, 0.2], [0.36, 0.1], '#26384f'),
        part('right-thigh', 'capsule', [0.14, 0.2], [0.36, 0.1], '#26384f'),
        part('left-shin', 'capsule', [-0.27, 0.36], [0.1, 0.32], '#26384f', 1.57),
        part('right-shin', 'capsule', [0.27, 0.36], [0.1, 0.32], '#26384f', 1.57),
      ]),
      tree: grammar('tree', [0.2, 0.36], 12, [
        part('trunk', 'rounded-box', [0, 0.22], [0.18, 0.56], '#6d4024'),
        part('branch-left', 'capsule', [-0.16, -0.02], [0.34, 0.09], '#704226', -0.62),
        part('branch-right', 'capsule', [0.17, -0.07], [0.33, 0.09], '#704226', 0.58),
        part('crown-left', 'ellipse', [-0.22, -0.25], [0.5, 0.44], '#2d7c43'),
        part('crown-right', 'ellipse', [0.22, -0.23], [0.5, 0.46], '#378b4d'),
        part('crown-top', 'ellipse', [0, -0.39], [0.5, 0.44], '#43a45c'),
      ]),
      plant: grammar('plant', [0.16, 0.28], 15, [
        part('stem', 'capsule', [0, 0.18], [0.09, 0.58], '#397347', 1.57),
        part('leaf-left', 'ellipse', [-0.18, 0.02], [0.35, 0.18], '#55a95c', -0.48),
        part('leaf-right', 'ellipse', [0.18, -0.1], [0.35, 0.18], '#63bb68', 0.48),
        part('crown', 'ellipse', [0, -0.33], [0.5, 0.34], '#48a756'),
      ]),
      flower: grammar('flower', [0.14, 0.25], 16, [
        part('stem', 'capsule', [0, 0.22], [0.07, 0.55], '#43844b', 1.57),
        part('petal-left', 'ellipse', [-0.17, -0.29], [0.3, 0.22], '#e96f9d', -0.55),
        part('petal-right', 'ellipse', [0.17, -0.29], [0.3, 0.22], '#ef83aa', 0.55),
        part('petal-top', 'ellipse', [0, -0.41], [0.27, 0.25], '#f294b8'),
        part('center', 'ellipse', [0, -0.29], [0.18, 0.16], '#f6c746'),
      ]),
      building: grammar('building', [0.32, 0.48], 3, [
        part('shell', 'rounded-box', [0, 0.08], [0.82, 0.82], '#9aa6b2'),
        part('roof', 'triangle', [0, -0.42], [0.9, 0.28], '#4b5563'),
        part('door', 'rounded-box', [0, 0.35], [0.2, 0.28], '#3f4c59'),
        part('window-left-top', 'rounded-box', [-0.25, -0.15], [0.18, 0.16], '#8ad4ec'),
        part('window-right-top', 'rounded-box', [0.25, -0.15], [0.18, 0.16], '#8ad4ec'),
        part('window-left-low', 'rounded-box', [-0.25, 0.14], [0.18, 0.16], '#7dc2dc'),
        part('window-right-low', 'rounded-box', [0.25, 0.14], [0.18, 0.16], '#7dc2dc'),
      ]),
      stairwell: grammar('stairwell', [0.3, 0.4], 4, [
        part('wall', 'rounded-box', [0, 0], [0.92, 0.9], '#7d858c'),
        part('step-low', 'rounded-box', [-0.2, 0.31], [0.5, 0.13], '#bbc0c3'),
        part('step-mid', 'rounded-box', [0, 0.13], [0.5, 0.13], '#aeb4b8'),
        part('step-high', 'rounded-box', [0.2, -0.05], [0.5, 0.13], '#9fa6ab'),
        part('rail', 'capsule', [0.08, -0.18], [0.72, 0.06], '#39434a', -0.62),
      ]),
      table: grammar('table', [0.29, 0.19], 22, [
        part('top', 'rounded-box', [0, -0.22], [0.9, 0.2], '#8a552f'),
        part('left-leg', 'rounded-box', [-0.32, 0.18], [0.12, 0.62], '#6d3f24'),
        part('right-leg', 'rounded-box', [0.32, 0.18], [0.12, 0.62], '#6d3f24'),
      ]),
      chair: grammar('chair', [0.16, 0.23], 24, [
        part('back', 'rounded-box', [0, -0.28], [0.62, 0.18], '#7b4c2b'),
        part('back-left', 'rounded-box', [-0.25, -0.06], [0.1, 0.55], '#6c3f24'),
        part('back-right', 'rounded-box', [0.25, -0.06], [0.1, 0.55], '#6c3f24'),
        part('seat', 'rounded-box', [0, 0.06], [0.68, 0.18], '#96603a'),
        part('left-leg', 'rounded-box', [-0.22, 0.32], [0.1, 0.48], '#5c351f'),
        part('right-leg', 'rounded-box', [0.22, 0.32], [0.1, 0.48], '#5c351f'),
      ]),
      television: grammar('television', [0.24, 0.18], 23, [
        part('frame', 'rounded-box', [0, -0.08], [0.94, 0.7], '#202833'),
        part('screen', 'rounded-box', [0, -0.08], [0.8, 0.56], '#3e9bc4'),
        part('screen-light', 'rounded-box', [-0.12, -0.16], [0.45, 0.24], '#9ee8f2', -0.08, 0.72),
        part('stem', 'rounded-box', [0, 0.31], [0.09, 0.22], '#252d36'),
        part('stand', 'rounded-box', [0, 0.43], [0.42, 0.1], '#252d36'),
      ]),
      galaxy: grammar('galaxy', [0.5, 0.42], 2, [
        part('halo', 'ellipse', [0, 0], [0.92, 0.72], '#25336f', -0.16, 0.34),
        part('spiral', 'spiral', [0, 0], [0.94, 0.82], '#9bc9ff', -0.18),
        part('core', 'ellipse', [0, 0], [0.18, 0.14], '#fff1b5'),
        part('star-one', 'star', [-0.32, -0.18], [0.08, 0.08], '#ffffff'),
        part('star-two', 'star', [0.31, 0.16], [0.06, 0.06], '#d9f1ff'),
      ]),
      star: grammar('star', [0.08, 0.08], 18, [
        part('star', 'star', [0, 0], [0.9, 0.9], '#fff2a6'),
        part('core', 'ellipse', [0, 0], [0.32, 0.32], '#ffffff'),
      ]),
      planet: grammar('planet', [0.11, 0.11], 19, [
        part('planet', 'ellipse', [0, 0], [0.82, 0.82], '#4b8cc9'),
        part('shade', 'ellipse', [0.17, 0.03], [0.55, 0.75], '#235187', 0, 0.72),
        part('ring', 'ring', [0, 0], [0.98, 0.38], '#d7c79b', -0.18),
      ]),
      'black-hole': grammar('black-hole', [0.22, 0.22], 17, [
        part('accretion-outer', 'ring', [0, 0], [0.98, 0.44], '#f3a448', -0.22),
        part('accretion-inner', 'ring', [0, 0], [0.7, 0.29], '#ffe1a0', -0.22),
        part('event-horizon', 'ellipse', [0, 0], [0.42, 0.42], '#02030a'),
      ]),
      water: grammar('water', [0.5, 0.26], 1, [
        part('water-body', 'wave', [0, 0.08], [0.98, 0.72], '#247fb5', 0, 0.72),
        part('water-highlight', 'wave', [0, -0.12], [0.92, 0.3], '#7dd9ee', 0, 0.62),
      ]),
      mountain: grammar('mountain', [0.35, 0.32], 7, [
        part('peak-left', 'triangle', [-0.2, 0.08], [0.72, 0.78], '#66716f'),
        part('peak-right', 'triangle', [0.23, 0.13], [0.64, 0.67], '#7a8580'),
        part('snow', 'triangle', [-0.2, -0.15], [0.27, 0.25], '#eef5f4'),
      ]),
      car: grammar('car', [0.25, 0.13], 25, [
        part('body', 'rounded-box', [0, 0.08], [0.9, 0.42], '#c43f3f'),
        part('cabin', 'rounded-box', [0.08, -0.2], [0.48, 0.32], '#75b9d0'),
        part('wheel-left', 'ring', [-0.29, 0.28], [0.22, 0.22], '#1d2329'),
        part('wheel-right', 'ring', [0.3, 0.28], [0.22, 0.22], '#1d2329'),
      ]),
      bicycle: grammar('bicycle', [0.25, 0.14], 25, [
        part('wheel-left', 'ring', [-0.32, 0.2], [0.34, 0.34], '#20272d'),
        part('wheel-right', 'ring', [0.33, 0.2], [0.34, 0.34], '#20272d'),
        part('frame-low', 'capsule', [-0.06, 0.08], [0.58, 0.08], '#dc5a35', 0.46),
        part('frame-high', 'capsule', [0.04, -0.02], [0.5, 0.08], '#e66b42', -0.55),
        part('fork', 'capsule', [0.24, -0.02], [0.48, 0.07], '#4e5962', 1.25),
        part('handlebar', 'capsule', [0.28, -0.29], [0.24, 0.06], '#303940'),
        part('seat', 'rounded-box', [-0.14, -0.21], [0.2, 0.08], '#2b3034'),
      ]),
      sofa: grammar('sofa', [0.28, 0.18], 22, [
        part('base', 'rounded-box', [0, 0.18], [0.9, 0.34], '#82634f'),
        part('back', 'rounded-box', [0, -0.18], [0.88, 0.42], '#9a7760'),
        part('arm-left', 'rounded-box', [-0.43, 0.02], [0.16, 0.48], '#6f5140'),
        part('arm-right', 'rounded-box', [0.43, 0.02], [0.16, 0.48], '#6f5140'),
        part('cushion-left', 'rounded-box', [-0.2, 0.08], [0.36, 0.22], '#b09178'),
        part('cushion-right', 'rounded-box', [0.2, 0.08], [0.36, 0.22], '#aa876f'),
      ]),
      lamp: grammar('lamp', [0.13, 0.28], 24, [
        part('base', 'ellipse', [0, 0.4], [0.5, 0.14], '#58616a'),
        part('stem', 'capsule', [0, 0.06], [0.08, 0.65], '#707b84', 1.57),
        part('shade', 'triangle', [0, -0.3], [0.62, 0.42], '#d7b45d'),
        part('bulb', 'ellipse', [0, -0.25], [0.18, 0.18], '#fff2b0'),
      ]),
      airplane: grammar('airplane', [0.28, 0.15], 18, [
        part('fuselage', 'capsule', [0, 0], [0.9, 0.18], '#d5dde2'),
        part('wing-left', 'triangle', [-0.02, 0.13], [0.58, 0.36], '#8998a4', 0.08),
        part('wing-right', 'triangle', [-0.02, -0.13], [0.58, 0.36], '#a8b5bd', 3.22),
        part('tail', 'triangle', [-0.38, -0.12], [0.28, 0.26], '#60717e', -0.12),
        part('cockpit', 'ellipse', [0.32, -0.02], [0.2, 0.12], '#4f93b3'),
      ]),
      bridge: grammar('bridge', [0.34, 0.18], 8, [
        part('deck', 'rounded-box', [0, 0.02], [0.96, 0.16], '#65717b'),
        part('pier-left', 'rounded-box', [-0.32, 0.28], [0.12, 0.5], '#8a949b'),
        part('pier-right', 'rounded-box', [0.32, 0.28], [0.12, 0.5], '#8a949b'),
        part('cable-left', 'capsule', [-0.22, -0.18], [0.58, 0.05], '#d4d9dc', -0.5),
        part('cable-right', 'capsule', [0.22, -0.18], [0.58, 0.05], '#d4d9dc', 0.5),
      ]),
      road: grammar('road', [0.4, 0.14], 6, [
        part('surface', 'rounded-box', [0, 0], [0.98, 0.62], '#444b50', -0.08),
        part('lane-left', 'capsule', [-0.25, 0], [0.28, 0.035], '#f3d66d', -0.08),
        part('lane-center', 'capsule', [0.08, 0], [0.28, 0.035], '#f3d66d', -0.08),
        part('lane-right', 'capsule', [0.4, 0], [0.18, 0.035], '#f3d66d', -0.08),
      ]),
      river: grammar('river', [0.4, 0.2], 3, [
        part('channel', 'wave', [0, 0], [0.96, 0.62], '#3f91ad', -0.08, 0.9),
        part('current', 'wave', [0.04, -0.02], [0.84, 0.24], '#83d1df', -0.08, 0.72),
        part('bank-upper', 'capsule', [0, -0.32], [0.98, 0.12], '#617c57', -0.08),
        part('bank-lower', 'capsule', [0, 0.32], [0.98, 0.12], '#738b61', -0.08),
      ]),
      boat: grammar('boat', [0.24, 0.16], 20, [
        part('hull', 'triangle', [0, 0.16], [0.9, 0.42], '#2f6684', 3.14),
        part('deck', 'rounded-box', [0, -0.02], [0.62, 0.16], '#d2b98b'),
        part('cabin', 'rounded-box', [0.08, -0.2], [0.32, 0.28], '#e5e9e7'),
        part('window', 'rounded-box', [0.1, -0.22], [0.2, 0.12], '#76b8d0'),
      ]),
      cloud: grammar('cloud', [0.26, 0.14], 5, [
        part('left', 'ellipse', [-0.25, 0.05], [0.48, 0.5], '#dce6ec'),
        part('middle', 'ellipse', [0, -0.08], [0.58, 0.62], '#eef5f7'),
        part('right', 'ellipse', [0.28, 0.04], [0.5, 0.48], '#d7e1e7'),
        part('base', 'rounded-box', [0, 0.15], [0.82, 0.24], '#d4dfe5'),
      ]),
      bird: grammar('bird', [0.18, 0.12], 29, [
        part('body', 'ellipse', [0, 0.03], [0.58, 0.46], '#5b83a3'),
        part('head', 'ellipse', [0.3, -0.11], [0.28, 0.28], '#739ab7'),
        part('wing', 'ellipse', [-0.08, -0.03], [0.45, 0.3], '#315f83', -0.35),
        part('beak', 'triangle', [0.48, -0.1], [0.2, 0.15], '#e3a338', 1.57),
        part('tail', 'triangle', [-0.4, 0.04], [0.3, 0.3], '#294f6c', -1.57),
      ]),
      fish: grammar('fish', [0.2, 0.11], 29, [
        part('body', 'ellipse', [-0.05, 0], [0.7, 0.55], '#3e92af'),
        part('tail', 'triangle', [-0.46, 0], [0.42, 0.48], '#2f758f', -1.57),
        part('fin', 'triangle', [-0.02, 0.2], [0.3, 0.25], '#6bc0ca', 3.14),
        part('eye', 'ellipse', [0.2, -0.08], [0.06, 0.06], '#111b20'),
      ]),
      horse: grammar('horse', [0.23, 0.15], 30, [
        part('body', 'ellipse', [-0.05, 0], [0.7, 0.48], '#8a5a38'),
        part('neck', 'capsule', [0.27, -0.18], [0.42, 0.16], '#9b6842', 1.0),
        part('head', 'ellipse', [0.4, -0.3], [0.3, 0.22], '#a06c45'),
        part('front-leg', 'capsule', [0.2, 0.31], [0.1, 0.5], '#704329', 1.57),
        part('back-leg', 'capsule', [-0.28, 0.31], [0.1, 0.5], '#704329', 1.57),
        part('tail', 'capsule', [-0.44, -0.02], [0.4, 0.08], '#4f3021', -0.7),
      ]),
      book: grammar('book', [0.18, 0.14], 21, [
        part('cover', 'rounded-box', [0, 0], [0.82, 0.9], '#8e3f3d', -0.08),
        part('pages', 'rounded-box', [0.04, 0], [0.68, 0.78], '#eee1bd', -0.08),
        part('spine', 'rounded-box', [-0.36, 0], [0.1, 0.9], '#5e2928', -0.08),
      ]),
      cup: grammar('cup', [0.14, 0.16], 24, [
        part('body', 'rounded-box', [-0.05, 0.08], [0.58, 0.72], '#d9e5e8'),
        part('rim', 'ellipse', [-0.05, -0.28], [0.58, 0.16], '#f5fbfc'),
        part('handle', 'ring', [0.3, 0.02], [0.38, 0.46], '#c2d4d8'),
      ]),
      phone: grammar('phone', [0.12, 0.22], 25, [
        part('frame', 'rounded-box', [0, 0], [0.58, 0.96], '#20272e'),
        part('screen', 'rounded-box', [0, 0], [0.48, 0.8], '#4ba0c2'),
        part('camera', 'ellipse', [-0.15, -0.37], [0.08, 0.08], '#0e151b'),
        part('home', 'ellipse', [0, 0.4], [0.07, 0.07], '#9aa6ad'),
      ]),
      laptop: grammar('laptop', [0.24, 0.17], 24, [
        part('screen-frame', 'rounded-box', [0, -0.18], [0.78, 0.58], '#303a44'),
        part('screen', 'rounded-box', [0, -0.19], [0.66, 0.45], '#4c9abd'),
        part('base', 'rounded-box', [0, 0.27], [0.94, 0.25], '#7e8992'),
        part('keyboard', 'rounded-box', [0, 0.23], [0.68, 0.11], '#39444d'),
      ]),
      shelf: grammar('shelf', [0.22, 0.25], 10, [
        part('left-support', 'rounded-box', [-0.4, 0], [0.1, 0.92], '#76543b'),
        part('right-support', 'rounded-box', [0.4, 0], [0.1, 0.92], '#76543b'),
        part('top', 'rounded-box', [0, -0.38], [0.86, 0.1], '#936b4b'),
        part('middle', 'rounded-box', [0, 0], [0.86, 0.1], '#936b4b'),
        part('bottom', 'rounded-box', [0, 0.38], [0.86, 0.1], '#936b4b'),
      ]),
      robot: grammar('robot', [0.23, 0.22], 28, [
        part('base', 'rounded-box', [-0.28, 0.3], [0.4, 0.22], '#65717e'),
        part('arm-lower', 'capsule', [-0.14, 0.08], [0.48, 0.14], '#aeb8c2', -0.78),
        part('joint', 'ellipse', [0.02, -0.08], [0.2, 0.2], '#e18a31'),
        part('arm-upper', 'capsule', [0.22, -0.2], [0.48, 0.13], '#bac5ce', 0.46),
        part('gripper-left', 'capsule', [0.43, -0.25], [0.22, 0.08], '#404a54', 0.82),
        part('gripper-right', 'capsule', [0.43, -0.11], [0.22, 0.08], '#404a54', -0.82),
      ]),
      conveyor: grammar('conveyor', [0.32, 0.16], 20, [
        part('belt', 'rounded-box', [0, 0], [0.96, 0.36], '#3f4d56'),
        part('lane', 'rounded-box', [0, -0.05], [0.82, 0.14], '#73838d'),
        part('roller-left', 'ring', [-0.38, 0.19], [0.18, 0.18], '#252e34'),
        part('roller-right', 'ring', [0.38, 0.19], [0.18, 0.18], '#252e34'),
        part('parcel', 'rounded-box', [0.16, -0.25], [0.24, 0.27], '#c48a45'),
      ]),
      parcel: grammar('parcel', [0.2, 0.17], 27, [
        part('carton', 'rounded-box', [0, 0.04], [0.82, 0.72], '#b97938'),
        part('top', 'rounded-box', [0, -0.32], [0.82, 0.12], '#d49a54'),
        part('tape-vertical', 'rounded-box', [0, 0.01], [0.12, 0.76], '#e3c27d'),
        part('tape-horizontal', 'rounded-box', [0, -0.12], [0.82, 0.1], '#d9b56e'),
        part('label', 'rounded-box', [0.22, 0.12], [0.25, 0.18], '#f2ead8'),
      ]),
      'server-rack': grammar('server-rack', [0.2, 0.3], 21, [
        part('cabinet', 'rounded-box', [0, 0], [0.78, 0.94], '#27343e'),
        part('server-top', 'rounded-box', [0, -0.27], [0.62, 0.16], '#597182'),
        part('server-mid', 'rounded-box', [0, 0], [0.62, 0.16], '#4d6576'),
        part('server-low', 'rounded-box', [0, 0.27], [0.62, 0.16], '#415968'),
        part('status-light', 'ellipse', [0.23, -0.27], [0.06, 0.06], '#67d69a'),
      ]),
      instrument: grammar('instrument', [0.22, 0.17], 26, [
        part('case', 'rounded-box', [0, 0], [0.92, 0.76], '#344252'),
        part('display', 'rounded-box', [0, -0.13], [0.66, 0.3], '#65c7da'),
        part('dial-left', 'ring', [-0.22, 0.23], [0.18, 0.18], '#d7e0e6'),
        part('dial-right', 'ring', [0.22, 0.23], [0.18, 0.18], '#d7e0e6'),
      ]),
      wheel: grammar('wheel', [0.2, 0.2], 24, [
        part('rim', 'ring', [0, 0], [0.94, 0.94], '#687680'),
        part('hub', 'ellipse', [0, 0], [0.22, 0.22], '#d08b3e'),
        part('spoke-horizontal', 'capsule', [0, 0], [0.72, 0.06], '#9aa6ad'),
        part('spoke-vertical', 'capsule', [0, 0], [0.72, 0.06], '#9aa6ad', 1.57),
        part('spoke-diagonal-a', 'capsule', [0, 0], [0.68, 0.05], '#7e8b94', 0.78),
        part('spoke-diagonal-b', 'capsule', [0, 0], [0.68, 0.05], '#7e8b94', -0.78),
      ]),
      hammer: grammar('hammer', [0.24, 0.15], 25, [
        part('handle', 'capsule', [-0.13, 0.16], [0.76, 0.12], '#7f4f2f', 0.82),
        part('head', 'rounded-box', [0.23, -0.2], [0.48, 0.27], '#8c989f', 0.82),
        part('face', 'rounded-box', [0.42, -0.38], [0.18, 0.3], '#c2cbd0', 0.82),
      ]),
      turbine: grammar('turbine', [0.23, 0.23], 24, [
        part('outer-ring', 'ring', [0, 0], [0.92, 0.92], '#596873'),
        part('hub', 'ellipse', [0, 0], [0.24, 0.24], '#e5a64d'),
        part('blade-one', 'capsule', [0.22, -0.18], [0.5, 0.13], '#aab8c1', -0.58),
        part('blade-two', 'capsule', [-0.22, -0.18], [0.5, 0.13], '#93a3ad', 0.58),
        part('blade-three', 'capsule', [0, 0.28], [0.5, 0.13], '#bcc7cd', 1.57),
      ]),
      slider: grammar('slider', [0.28, 0.13], 25, [
        part('rail', 'capsule', [0, 0.14], [0.94, 0.09], '#5f6c75'),
        part('carriage', 'rounded-box', [0.08, -0.06], [0.34, 0.44], '#b7c1c8'),
        part('magnet', 'rounded-box', [0.08, -0.08], [0.22, 0.22], '#d25c55'),
        part('stop-left', 'rounded-box', [-0.43, 0.08], [0.08, 0.34], '#36424a'),
        part('stop-right', 'rounded-box', [0.43, 0.08], [0.08, 0.34], '#36424a'),
      ]),
      panel: grammar('panel', [0.28, 0.18], 22, [
        part('frame', 'rounded-box', [0, 0], [0.94, 0.82], '#3d4c57'),
        part('cells', 'rounded-box', [0, 0], [0.82, 0.68], '#286f9b'),
        part('grid-vertical', 'capsule', [0, 0], [0.05, 0.65], '#82c7dd', 1.57),
        part('grid-horizontal', 'capsule', [0, 0], [0.79, 0.05], '#82c7dd'),
        part('highlight', 'rounded-box', [-0.19, -0.16], [0.32, 0.23], '#8de0ed', 0, 0.55),
      ]),
      meter: grammar('meter', [0.2, 0.18], 25, [
        part('case', 'rounded-box', [0, 0], [0.9, 0.82], '#3d4852'),
        part('dial', 'ring', [0, -0.08], [0.54, 0.54], '#d9e4e9'),
        part('needle', 'capsule', [0.08, -0.13], [0.38, 0.05], '#e56d55', -0.52),
        part('readout', 'rounded-box', [0, 0.31], [0.54, 0.18], '#6bc3d3'),
      ]),
      lens: grammar('lens', [0.16, 0.2], 26, [
        part('glass', 'ellipse', [0, 0], [0.62, 0.92], '#9ee8f2', 0, 0.55),
        part('rim', 'ring', [0, 0], [0.72, 0.98], '#4f8da8'),
        part('focus-axis', 'capsule', [0, 0], [0.94, 0.04], '#e8cf72'),
      ]),
      prism: grammar('prism', [0.2, 0.19], 26, [
        part('glass-body', 'triangle', [0, 0], [0.82, 0.86], '#9ee8f2', 0, 0.52),
        part('input-ray', 'capsule', [-0.38, 0.06], [0.42, 0.04], '#f2df8a'),
        part('spectrum', 'wave', [0.3, -0.02], [0.52, 0.28], '#e87588'),
      ]),
      ice: grammar('ice', [0.22, 0.22], 18, [
        part('facet-left', 'triangle', [-0.2, 0.08], [0.58, 0.76], '#8ed5ec', -0.2, 0.82),
        part('facet-right', 'triangle', [0.2, 0.08], [0.58, 0.76], '#b9edf6', 0.2, 0.78),
        part('frozen-core', 'ellipse', [0, 0.08], [0.34, 0.42], '#e5fbff', 0, 0.72),
        part('melt-line', 'wave', [0, 0.38], [0.78, 0.12], '#4fa8cf'),
      ]),
      waveguide: grammar('waveguide', [0.3, 0.14], 26, [
        part('tube', 'capsule', [0, 0], [0.92, 0.32], '#b88742'),
        part('bore', 'capsule', [0, 0], [0.78, 0.13], '#253746'),
        part('pressure-node-left', 'ring', [-0.24, 0], [0.18, 0.18], '#8de0ea'),
        part('pressure-node-right', 'ring', [0.24, 0], [0.18, 0.18], '#8de0ea'),
      ]),
      'particle-cloud': grammar('particle-cloud', [0.24, 0.18], 27, [
        part('grain-left', 'ellipse', [-0.31, 0.16], [0.13, 0.13], '#c5aa77'),
        part('grain-mid', 'ellipse', [-0.08, -0.12], [0.11, 0.11], '#e0c38b'),
        part('grain-right', 'ellipse', [0.27, 0.08], [0.14, 0.14], '#b89863'),
        part('grain-top', 'ellipse', [0.08, -0.31], [0.09, 0.09], '#ead39e'),
        part('pressure-band', 'wave', [0, 0], [0.94, 0.36], '#79cad8', 0, 0.64),
      ]),
      structure: grammar('structure', [0.22, 0.2], 8, [
        part('body', 'rounded-box', [0, 0], [0.88, 0.78], '#87929c'),
        part('support-left', 'rounded-box', [-0.3, 0.24], [0.12, 0.42], '#5d6872'),
        part('support-right', 'rounded-box', [0.3, 0.24], [0.12, 0.42], '#5d6872'),
      ], false),
      object: grammar('object', [0.16, 0.14], 20, [
        part('body', 'rounded-box', [0, 0], [0.88, 0.78], '#778592'),
      ], false),
    });

    const SEMANTIC_LAYER_GEOMETRY_GRAMMARS = Object.freeze({
      'track-line': grammar('semantic-track-apparatus', [0.28, 0.2], 28, [
        part('apparatus-ring', 'ring', [0, 0], [0.72, 0.72], '#62b7d1'),
        part('track-a', 'capsule', [-0.12, -0.08], [0.76, 0.05], '#e9cc68', 0.34),
        part('track-b', 'capsule', [0.08, 0.12], [0.68, 0.045], '#eb7f6d', -0.42),
      ]),
      'detector-geometry': grammar('semantic-detector', [0.25, 0.2], 27, [
        part('detector-shell', 'rounded-box', [0, 0], [0.9, 0.78], '#384c61'),
        part('detector-ring', 'ring', [0, -0.03], [0.58, 0.58], '#71c5d4'),
        part('readout', 'rounded-box', [0, 0.28], [0.56, 0.16], '#d6a953'),
      ]),
      'biological-agent': grammar('semantic-organic', [0.24, 0.22], 30, [
        part('body', 'ellipse', [0, 0], [0.72, 0.62], '#57946e'),
        part('branch-left', 'capsule', [-0.24, 0.12], [0.55, 0.08], '#80b37c', -0.62),
        part('branch-right', 'capsule', [0.24, -0.12], [0.55, 0.08], '#9bc58b', 0.62),
        part('nucleus', 'ellipse', [0.12, -0.08], [0.18, 0.18], '#d6b25c'),
      ]),
      'node-graph': grammar('semantic-node-graph', [0.26, 0.2], 24, [
        part('node-left', 'rounded-box', [-0.3, 0], [0.28, 0.3], '#4d8ca7'),
        part('node-center', 'rounded-box', [0, -0.12], [0.3, 0.32], '#68a7bc'),
        part('node-right', 'rounded-box', [0.3, 0.08], [0.28, 0.3], '#d49755'),
        part('edge', 'capsule', [0, 0.02], [0.74, 0.05], '#b9d3dc'),
      ]),
      'network-flow': grammar('semantic-network-flow', [0.28, 0.18], 23, [
        part('lane-upper', 'capsule', [0, -0.2], [0.9, 0.1], '#467a92'),
        part('lane-center', 'capsule', [0, 0], [0.9, 0.1], '#559bb1'),
        part('lane-lower', 'capsule', [0, 0.2], [0.9, 0.1], '#6fb3c1'),
        part('payload', 'rounded-box', [0.22, 0], [0.2, 0.2], '#dc9b4d'),
      ]),
      'organic-matrix': grammar('semantic-organic-matrix', [0.28, 0.22], 25, [
        part('matrix', 'rounded-box', [0, 0], [0.92, 0.78], '#b89b72', 0, 0.75),
        part('strand-a', 'wave', [0, -0.16], [0.82, 0.18], '#ead9ae', 0.08),
        part('strand-b', 'wave', [0, 0.16], [0.82, 0.18], '#d9c38d', -0.08),
      ]),
      'bubble-volume': grammar('semantic-bubble-volume', [0.24, 0.22], 26, [
        part('bubble-large', 'ring', [-0.18, 0.08], [0.42, 0.42], '#e7d69c'),
        part('bubble-medium', 'ring', [0.22, -0.14], [0.3, 0.3], '#f0e0ad'),
        part('bubble-small', 'ring', [0.25, 0.22], [0.2, 0.2], '#d6bd77'),
      ]),
      'orbital-body': grammar('semantic-orbital-body', [0.26, 0.24], 29, [
        part('body', 'ellipse', [0, 0], [0.46, 0.46], '#7894b8'),
        part('ring-inner', 'ring', [0, 0], [0.72, 0.34], '#d5bd75', -0.18),
        part('ring-outer', 'ring', [0, 0], [0.94, 0.48], '#a3b8cf', -0.18, 0.7),
      ]),
      'thermal-field': grammar('semantic-thermal-plume', [0.24, 0.26], 31, [
        part('source', 'rounded-box', [0, 0.32], [0.5, 0.2], '#59443d'),
        part('plume-left', 'wave', [-0.12, -0.04], [0.36, 0.68], '#dd6b3e', 1.42, 0.78),
        part('plume-right', 'wave', [0.14, -0.16], [0.32, 0.7], '#e8aa51', 1.68, 0.68),
      ]),
      'robot-armature': grammar('semantic-robot-armature', [0.25, 0.22], 30, [
        part('base', 'rounded-box', [-0.28, 0.28], [0.36, 0.22], '#495762'),
        part('arm-lower', 'capsule', [-0.12, 0.04], [0.54, 0.13], '#9aa9b3', -0.82),
        part('joint', 'ring', [0.08, -0.16], [0.22, 0.22], '#e09b43'),
        part('arm-upper', 'capsule', [0.28, -0.18], [0.48, 0.12], '#bdc8ce', 0.28),
        part('gripper', 'triangle', [0.5, -0.12], [0.24, 0.24], '#3c4852', 1.57),
      ]),
      'water-volume': grammar('semantic-flow-domain', [0.32, 0.2], 5, [
        part('domain', 'wave', [0, 0], [0.96, 0.58], '#3e8eaa', -0.08, 0.9),
        part('flow-a', 'wave', [0, -0.14], [0.84, 0.14], '#8cd1dc', -0.08),
        part('flow-b', 'wave', [0, 0.16], [0.78, 0.12], '#65b8c9', -0.08),
      ]),
      'field-sheet': grammar('semantic-field-sheet', [0.3, 0.22], 18, [
        part('field', 'rounded-box', [0, 0], [0.92, 0.78], '#314c60', 0, 0.45),
        part('vector-a', 'capsule', [-0.18, -0.14], [0.62, 0.06], '#70c1d4', 0.28),
        part('vector-b', 'capsule', [0.16, 0.14], [0.62, 0.06], '#d5ad59', 0.28),
      ]),
      'chemical-front': grammar('semantic-chemical-front', [0.28, 0.22], 20, [
        part('cloud-left', 'ellipse', [-0.22, 0], [0.5, 0.56], '#6daf95', 0, 0.72),
        part('cloud-right', 'ellipse', [0.22, 0], [0.5, 0.56], '#a47bb4', 0, 0.72),
        part('front', 'wave', [0, 0], [0.18, 0.82], '#ead36e', 1.57),
      ]),
      'phase-boundary': grammar('semantic-phase-boundary', [0.28, 0.22], 19, [
        part('phase-a', 'rounded-box', [-0.24, 0], [0.46, 0.76], '#4d86a1', 0, 0.72),
        part('phase-b', 'rounded-box', [0.24, 0], [0.46, 0.76], '#cf8157', 0, 0.72),
        part('boundary', 'capsule', [0, 0], [0.08, 0.82], '#f2df93', 1.57),
      ]),
      'granular-strata': grammar('semantic-granular', [0.28, 0.22], 16, [
        part('strata', 'rounded-box', [0, 0.2], [0.92, 0.42], '#8d7457'),
        part('grain-left', 'ellipse', [-0.26, -0.16], [0.28, 0.28], '#c4a36d'),
        part('grain-center', 'ellipse', [0.02, -0.24], [0.34, 0.34], '#a98a5d'),
        part('grain-right', 'ellipse', [0.3, -0.12], [0.24, 0.24], '#d0b47b'),
      ]),
      'material-surface': grammar('semantic-structured-object', [0.26, 0.22], 17, [
        part('body', 'rounded-box', [0, 0], [0.88, 0.72], '#687783'),
        part('section', 'rounded-box', [0, -0.08], [0.58, 0.34], '#91a4af'),
        part('support-left', 'rounded-box', [-0.3, 0.28], [0.12, 0.34], '#46535d'),
        part('support-right', 'rounded-box', [0.3, 0.28], [0.12, 0.34], '#46535d'),
      ]),
    });

    function grammar(id, minScale, zOrder, parts, literal = true) {
      return Object.freeze({ id, minScale: Object.freeze(minScale), zOrder, parts: Object.freeze(parts), literal });
    }

    function part(id, primitive, center, size, fill, rotation = 0, opacity = 1) {
      return Object.freeze({
        id,
        primitive,
        center: Object.freeze(center),
        size: Object.freeze(size),
        rotation,
        fill,
        opacity,
      });
    }

    function objectGeometryProgramForIdentity(identity = {}, geometry = {}, entity = {}, layerSlot = '') {
      const identityType = objectGeometryIdentityType(identity, geometry, entity);
      const semanticIdentityType = String(identity.type || '').toLowerCase() || identityType;
      const evidenceText = [
        identity.sourceLabel,
        identity.label,
        entity.label,
        entity.role,
        ...(entity.evidence || []),
        ...(entity.behavior && entity.behavior.sourceEvidence || []),
      ]
        .filter(Boolean).join(' ').toLowerCase();
      const pose = identityType === 'person' && /\b(sit|sits|sitting|seated)\b/.test(evidenceText)
        ? 'sitting'
        : '';
      const visualArchetype = String(identity.visualArchetype || '').toLowerCase();
      const selectedKey = pose === 'sitting'
        ? 'person-sitting'
        : OBJECT_GEOMETRY_GRAMMARS[visualArchetype] ? visualArchetype : identityType;
      const explicit = OBJECT_GEOMETRY_GRAMMARS[selectedKey] || null;
      const constructionReceipt = objectGeometryConstructionReceipt(entity);
      if (explicit) {
        return objectGeometryProgram(explicit, {
          identityType: semanticIdentityType,
          visualArchetype: selectedKey,
          pose,
          source: 'phase6-data-owned-part-graph',
          sourcePrimitive: geometry.primitive || entity.shape || '',
          constructionReceipt,
        });
      }
      const constructed = constructionGeometryProgramForEntity(
        { ...identity, type: semanticIdentityType, visualArchetype: visualArchetype || identityType },
        geometry,
        entity
      );
      if (constructed) return constructed;
      const semantic = !explicit && promptIdentityCanOwnSemanticGeometry(identity, entity)
        ? semanticGeometryGrammarForLayer(layerSlot)
        : null;
      const selected = explicit || semantic || OBJECT_GEOMETRY_GRAMMARS.object;
      const semanticGrammarId = semantic
        ? `object-grammar.semantic.${semantic.id}.${objectGeometrySafeId(identityType)}`
        : '';
      return {
        schema: OBJECT_GEOMETRY_PROGRAM_SCHEMA,
        grammarId: semanticGrammarId || `object-grammar.${selected.id}`,
        identityType,
        visualArchetype: visualArchetype || selectedKey,
        pose,
        literal: selected.literal === true && Boolean(explicit || semantic),
        minScale: selected.minScale.slice(),
        zOrder: selected.zOrder,
        parts: selected.parts.map((row, order) => ({ ...row, center: row.center.slice(), size: row.size.slice(), order })),
        source: semantic ? 'phase6-semantic-layer-geometry-grammar' : 'phase6-object-geometry-grammar',
        sourcePrimitive: geometry.primitive || entity.shape || '',
      };
    }

    function objectGeometryProgram(selected, options = {}) {
      return {
        schema: OBJECT_GEOMETRY_PROGRAM_SCHEMA,
        grammarId: `object-grammar.${selected.id}`,
        identityType: options.identityType || selected.id,
        visualArchetype: options.visualArchetype || selected.id,
        pose: options.pose || '',
        literal: selected.literal === true,
        minScale: selected.minScale.slice(),
        zOrder: selected.zOrder,
        parts: selected.parts.map((row, order) => ({
          ...row,
          center: row.center.slice(),
          size: row.size.slice(),
          order,
        })),
        source: options.source || 'phase6-data-owned-part-graph',
        sourcePrimitive: options.sourcePrimitive || '',
        constructionReceipt: options.constructionReceipt || null,
      };
    }

    function objectGeometryConstructionReceipt(entity = {}) {
      const construction = entity.construction || {};
      const provenance = entity.constructionProvenance || [];
      if (!construction.schema && !provenance.length) return null;
      return {
        schema: 'simulatte.constructiveGeometryReceipt.v1',
        sourceCardIds: (construction.sourceCardIds || []).slice(),
        basisIds: (construction.basisIds || []).slice(),
        inputPartHintCount: (construction.partHints || []).length,
        modelEvaluated: provenance.some((row) => row.modelEvaluated === true),
        rerankEvaluated: provenance.some((row) => row.rerankEvaluated === true),
        literalSlotMatch: provenance.some((row) => row.literalSlotMatch === true),
        exactTargetMatch: provenance.some((row) => row.exactTargetMatch === true),
        candidateIds: provenance.map((row) => row.candidateId).filter(Boolean),
      };
    }

    function semanticGeometryGrammarForLayer(layerSlot = '') {
      const slot = String(layerSlot || '').toLowerCase();
      if (SEMANTIC_LAYER_GEOMETRY_GRAMMARS[slot]) return SEMANTIC_LAYER_GEOMETRY_GRAMMARS[slot];
      if (/optical|acoustic|flow-field/.test(slot)) return SEMANTIC_LAYER_GEOMETRY_GRAMMARS['field-sheet'];
      if (/process|causal|readout/.test(slot)) return SEMANTIC_LAYER_GEOMETRY_GRAMMARS['material-surface'];
      return SEMANTIC_LAYER_GEOMETRY_GRAMMARS['material-surface'];
    }

    function promptIdentityCanOwnSemanticGeometry(identity = {}, entity = {}) {
      if (!(identity.directlyGrounded === true || entity.directlyGrounded === true ||
        /^prompt\./.test(String(entity.semanticRef || entity.physicalRef || '')))) return false;
      const type = String(entity.semanticClass || '').toLowerCase();
      const refs = `${entity.id || ''} ${entity.sourceObject || ''} ${entity.semanticRef || ''}`.toLowerCase();
      return !/^(action|event|modifier|operator|process|property|relation|state)$/.test(type) &&
        !/\bprompt[-.]?(?:action|relation|modifier)[-.:]/.test(refs);
    }

    function objectGeometrySafeId(value = '') {
      return String(value || 'object').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'object';
    }

    function objectGeometryIdentityType(identity = {}, geometry = {}, entity = {}) {
      const direct = String(identity.type || '').toLowerCase();
      if (OBJECT_GEOMETRY_GRAMMARS[direct]) return direct;
      const constructionArchetype = objectGeometryConstructionArchetype(entity.construction || {});
      if (constructionArchetype) return constructionArchetype;
      const text = [
        direct,
        identity.label,
        identity.sourceLabel,
        identity.visualArchetype,
        identity.primitive,
        geometry.primitive,
        entity.id,
        entity.label,
        entity.sourceObject,
        entity.semanticRef,
        ...((entity.construction && entity.construction.sourceCardIds) || []),
        ...((entity.construction && entity.construction.classHints) || []),
        ...((entity.construction && entity.construction.shapeHints) || []),
      ].filter(Boolean).join(' ').toLowerCase();
      const rules = [
        ['black-hole', /\bblack[- ]hole\b|event[- ]horizon/],
        ['television', /\b(tv|television|screen|monitor)\b/],
        ['building', /\b(building|house|skyscraper|apartment)\b/],
        ['person', /\b(person|human|people|worker|runner)\b/],
        ['chair', /\b(chair|stool|seat)\b/],
        ['table', /\b(table|desk|bench)\b/],
        ['galaxy', /\b(galaxy|nebula)\b/],
        ['planet', /\b(planet|moon|world)\b/],
        ['star', /\b(star|sun)\b/],
        ['tree', /\b(tree|trees|forest|oak|pine|willow|maple)\b/],
        ['flower', /\b(flower|rose|sunflower|orchid)\b/],
        ['mountain', /\b(mountain|mountains|peak|ridge)\b/],
        ['car', /\b(car|automobile|vehicle|truck)\b/],
        ['robot', /\b(robot|robotic|manipulator|gripper|servo[- ]arm)\b/],
        ['conveyor', /\b(conveyor|belt[- ]loop|transport[- ]machine)\b/],
        ['parcel', /\b(parcel|package|carton|shipping[- ]box)\b/],
        ['server-rack', /\b(server[- ]rack|server rack|rack cabinet)\b/],
      ];
      const match = rules.find(([, pattern]) => pattern.test(text));
      return match ? match[0] : direct || 'object';
    }

    function objectGeometryConstructionArchetype(construction = {}) {
      const ids = (construction.sourceCardIds || []).map((value) => objectGeometrySafeId(value));
      const aliases = [
        ['robot', /(?:^|-)(?:robot-arm|robot-gripper)$/],
        ['conveyor', /(?:^|-)conveyor$/],
        ['parcel', /(?:^|-)(?:parcel|package|carton)$/],
        ['server-rack', /(?:^|-)server-rack$/],
      ];
      const match = aliases.find(([, pattern]) => ids.some((id) => pattern.test(id)));
      return match ? match[0] : '';
    }

    function scenePacketReadableTransform(transform = {}, program = {}) {
      const position = Array.isArray(transform.position) ? transform.position.slice() : [0.5, 0.5, 0];
      const scale = Array.isArray(transform.scale) ? transform.scale.slice() : [0.16, 0.14, 1];
      const minScale = Array.isArray(program.minScale) ? program.minScale : [0.16, 0.14];
      scale[0] = Math.max(Number(scale[0] || 0), Number(minScale[0] || 0));
      scale[1] = Math.max(Number(scale[1] || 0), Number(minScale[1] || 0));
      position[0] = clamp(Number(position[0] || 0.5), scale[0] * 0.52, 1 - scale[0] * 0.52);
      position[1] = clamp(Number(position[1] || 0.5), scale[1] * 0.52, 1 - scale[1] * 0.52);
      return { ...transform, position, scale };
    }

    function objectGeometryProgramCoverage(program = {}) {
      const parts = Array.isArray(program.parts) ? program.parts : [];
      return {
        schema: 'simulatte.objectGeometryCoverage.v1',
        grammarId: program.grammarId || '',
        identityType: program.identityType || '',
        literal: program.literal === true,
        partCount: parts.length,
        primitiveCount: new Set(parts.map((row) => row.primitive).filter(Boolean)).size,
        partIds: parts.map((row) => row.id).filter(Boolean),
        minScale: Array.isArray(program.minScale) ? program.minScale.slice(0, 2) : [],
        realized: program.literal === true && parts.length >= 2,
      };
    }

    Object.assign(scope, {
      OBJECT_GEOMETRY_PROGRAM_SCHEMA,
      OBJECT_GEOMETRY_GRAMMARS,
      SEMANTIC_LAYER_GEOMETRY_GRAMMARS,
      objectGeometryProgramForIdentity,
      objectGeometryIdentityType,
      scenePacketReadableTransform,
      objectGeometryProgramCoverage,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
