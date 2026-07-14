(function attachAutonomyActorGeometry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyActorGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyActorGeometry() {
  const ACTOR_MESH_SCHEMA = 'simulatte.autonomyActorMesh.v1';
  const FLOATS_PER_VERTEX = 13;
  const MATERIAL_MODEL = 'metallic_roughness_vertex_v1';
  const SUPPORTED_ACTOR_KINDS = Object.freeze(['pedestrian', 'bicycle', 'scooter', 'car']);
  const MATERIALS = Object.freeze({
    fabric: Object.freeze([0.02, 0.86]),
    skin: Object.freeze([0.01, 0.68]),
    rubber: Object.freeze([0.01, 0.94]),
    brushedMetal: Object.freeze([0.9, 0.24]),
    paintedMetal: Object.freeze([0.58, 0.2]),
    glass: Object.freeze([0.42, 0.08]),
    polymer: Object.freeze([0.08, 0.55]),
    light: Object.freeze([0.12, 0.18]),
  });
  const COLORS = Object.freeze({
    graphite: Object.freeze([0.045, 0.065, 0.078, 1]),
    rubber: Object.freeze([0.018, 0.023, 0.027, 1]),
    steel: Object.freeze([0.48, 0.56, 0.6, 1]),
    aluminum: Object.freeze([0.62, 0.69, 0.72, 1]),
    glass: Object.freeze([0.035, 0.12, 0.16, 1]),
    carPaint: Object.freeze([0.08, 0.2, 0.25, 1]),
    jacket: Object.freeze([0.035, 0.25, 0.265, 1]),
    trousers: Object.freeze([0.045, 0.055, 0.065, 1]),
    skin: Object.freeze([0.56, 0.4, 0.31, 1]),
    helmet: Object.freeze([0.12, 0.16, 0.18, 1]),
    accent: Object.freeze([0.05, 0.82, 0.78, 1]),
    amber: Object.freeze([1, 0.42, 0.08, 1]),
    whiteLight: Object.freeze([0.72, 0.92, 1, 1]),
    redLight: Object.freeze([0.9, 0.035, 0.06, 1]),
    primaryRing: Object.freeze([0.08, 0.82, 1, 0.72]),
  });

  function addActor(writer, options) {
    const kind = canonicalKind(options.kind);
    const frame = createFrame(options.point, options.heading || 0);
    const motionPhase = Number.isFinite(options.motionPhase) ? options.motionPhase : 0;
    const before = writer.values.length;
    if (options.isPrimary) addGroundRing(writer, frame, kind === 'car' ? 2.7 : 1.18);
    if (kind === 'pedestrian') addPerson(writer, frame, { motionPhase, gait: options.gait || 'walk' });
    else if (kind === 'bicycle') addBicycle(writer, frame, { motionPhase, hasRider: true });
    else if (kind === 'scooter') addScooter(writer, frame, { motionPhase, hasRider: true });
    else addCar(writer, frame);
    return {
      schema: ACTOR_MESH_SCHEMA,
      kind,
      materialModel: MATERIAL_MODEL,
      vertexCount: (writer.values.length - before) / FLOATS_PER_VERTEX,
    };
  }

  function canonicalKind(kind) {
    const aliases = { runner: 'pedestrian', cycle: 'bicycle', delivery_bike: 'bicycle', automobile: 'car' };
    const value = aliases[kind] || kind;
    if (!SUPPORTED_ACTOR_KINDS.includes(value)) throw new Error(`actor_kind_unsupported: expected ${SUPPORTED_ACTOR_KINDS.join(', ')}, received ${kind}`);
    return value;
  }

  function addPerson(writer, frame, { motionPhase = 0, gait = 'walk' } = {}) {
    const strideScale = gait === 'run' ? 0.5 : gait === 'stand' ? 0 : 0.28;
    const stride = Math.sin(motionPhase) * strideScale;
    const leftHip = localPoint(frame, [0, 0.93, -0.12]);
    const rightHip = localPoint(frame, [0, 0.93, 0.12]);
    const leftKnee = localPoint(frame, [stride * 0.34, 0.5, -0.12]);
    const rightKnee = localPoint(frame, [-stride * 0.34, 0.5, 0.12]);
    const leftFoot = localPoint(frame, [stride * 0.78 + 0.08, 0.09, -0.12]);
    const rightFoot = localPoint(frame, [-stride * 0.78 + 0.08, 0.09, 0.12]);
    addLimb(writer, leftHip, leftKnee, 0.075, COLORS.trousers, MATERIALS.fabric);
    addLimb(writer, leftKnee, leftFoot, 0.065, COLORS.trousers, MATERIALS.fabric);
    addLimb(writer, rightHip, rightKnee, 0.075, COLORS.trousers, MATERIALS.fabric);
    addLimb(writer, rightKnee, rightFoot, 0.065, COLORS.trousers, MATERIALS.fabric);
    addOrientedBox(writer, frame, [stride * 0.78 + 0.17, 0.075, -0.12], [0.3, 0.1, 0.12], COLORS.graphite, MATERIALS.rubber);
    addOrientedBox(writer, frame, [-stride * 0.78 + 0.17, 0.075, 0.12], [0.3, 0.1, 0.12], COLORS.graphite, MATERIALS.rubber);
    addEllipsoid(writer, frame, [0, 1.28, 0], [0.22, 0.38, 0.17], COLORS.jacket, MATERIALS.fabric, 10, 6);
    addOrientedBox(writer, frame, [-0.205, 1.34, 0], [0.035, 0.075, 0.31], COLORS.accent, MATERIALS.light, 0.28);
    const leftShoulder = localPoint(frame, [0, 1.5, -0.23]);
    const rightShoulder = localPoint(frame, [0, 1.5, 0.23]);
    const leftElbow = localPoint(frame, [-stride * 0.42, 1.2, -0.27]);
    const rightElbow = localPoint(frame, [stride * 0.42, 1.2, 0.27]);
    const leftHand = localPoint(frame, [-stride * 0.72, 1.02, -0.24]);
    const rightHand = localPoint(frame, [stride * 0.72, 1.02, 0.24]);
    addLimb(writer, leftShoulder, leftElbow, 0.055, COLORS.jacket, MATERIALS.fabric);
    addLimb(writer, leftElbow, leftHand, 0.05, COLORS.skin, MATERIALS.skin);
    addLimb(writer, rightShoulder, rightElbow, 0.055, COLORS.jacket, MATERIALS.fabric);
    addLimb(writer, rightElbow, rightHand, 0.05, COLORS.skin, MATERIALS.skin);
    addCylinderBetween(writer, localPoint(frame, [0, 1.56, 0]), localPoint(frame, [0, 1.64, 0]), 0.075, 8, COLORS.skin, MATERIALS.skin);
    addEllipsoid(writer, frame, [0.015, 1.76, 0], [0.125, 0.15, 0.12], COLORS.skin, MATERIALS.skin, 10, 6);
    addEllipsoid(writer, frame, [-0.025, 1.84, 0], [0.13, 0.08, 0.125], COLORS.helmet, MATERIALS.polymer, 10, 4);
  }

  function addBicycle(writer, frame, { motionPhase = 0, hasRider = true } = {}) {
    const rear = [-0.78, 0.69, 0];
    const front = [0.78, 0.69, 0];
    addWheel(writer, frame, rear, 0.66, 0.042, true);
    addWheel(writer, frame, front, 0.66, 0.042, true);
    const crank = [-0.08, 0.69, 0];
    const seat = [-0.34, 1.34, 0];
    const head = [0.47, 1.3, 0];
    const frameRows = [
      [rear, crank], [crank, seat], [seat, rear], [seat, head], [head, crank], [head, front],
    ];
    frameRows.forEach(([start, end]) => addLocalTube(writer, frame, start, end, 0.032, COLORS.aluminum, MATERIALS.brushedMetal));
    addLocalTube(writer, frame, [0.47, 1.3, -0.055], [0.78, 0.69, -0.055], 0.025, COLORS.graphite, MATERIALS.paintedMetal);
    addLocalTube(writer, frame, [0.47, 1.3, 0.055], [0.78, 0.69, 0.055], 0.025, COLORS.graphite, MATERIALS.paintedMetal);
    addLocalTube(writer, frame, [-0.34, 1.34, 0], [-0.38, 1.52, 0], 0.028, COLORS.steel, MATERIALS.brushedMetal);
    addOrientedBox(writer, frame, [-0.42, 1.53, 0], [0.24, 0.06, 0.16], COLORS.graphite, MATERIALS.polymer);
    addLocalTube(writer, frame, [0.47, 1.3, 0], [0.5, 1.57, 0], 0.025, COLORS.steel, MATERIALS.brushedMetal);
    addLocalTube(writer, frame, [0.5, 1.57, -0.28], [0.5, 1.57, 0.28], 0.024, COLORS.graphite, MATERIALS.polymer);
    const pedalAngle = motionPhase * 1.8;
    const pedalA = [-0.08 + Math.cos(pedalAngle) * 0.16, 0.69 + Math.sin(pedalAngle) * 0.16, -0.08];
    const pedalB = [-0.08 - Math.cos(pedalAngle) * 0.16, 0.69 - Math.sin(pedalAngle) * 0.16, 0.08];
    addLocalTube(writer, frame, pedalA, pedalB, 0.018, COLORS.steel, MATERIALS.brushedMetal);
    if (hasRider) addCyclist(writer, frame, pedalA, pedalB);
  }

  function addCyclist(writer, frame, pedalA, pedalB) {
    const hip = [-0.38, 1.58, 0];
    const shoulder = [0.05, 2.02, 0];
    addEllipsoid(writer, frame, [-0.14, 1.82, 0], [0.26, 0.35, 0.18], COLORS.jacket, MATERIALS.fabric, 10, 6);
    addOrientedBox(writer, frame, [-0.38, 1.87, 0], [0.035, 0.07, 0.3], COLORS.accent, MATERIALS.light, 0.24);
    addEllipsoid(writer, frame, [0.13, 2.2, 0], [0.14, 0.16, 0.135], COLORS.helmet, MATERIALS.polymer, 10, 6);
    [-1, 1].forEach((side, index) => {
      const sideOffset = side * 0.12;
      const knee = [0.02 + (index ? -0.1 : 0.12), 1.13, sideOffset];
      const pedal = index ? pedalB : pedalA;
      addLocalTube(writer, frame, [hip[0], hip[1], sideOffset], knee, 0.07, COLORS.trousers, MATERIALS.fabric);
      addLocalTube(writer, frame, knee, pedal, 0.06, COLORS.trousers, MATERIALS.fabric);
      const elbow = [0.3, 1.83, side * 0.22];
      const hand = [0.5, 1.57, side * 0.25];
      addLocalTube(writer, frame, [shoulder[0], shoulder[1], side * 0.2], elbow, 0.05, COLORS.jacket, MATERIALS.fabric);
      addLocalTube(writer, frame, elbow, hand, 0.045, COLORS.skin, MATERIALS.skin);
    });
  }

  function addScooter(writer, frame, { motionPhase = 0, hasRider = true } = {}) {
    addWheel(writer, frame, [-0.48, 0.18, 0], 0.15, 0.035, false);
    addWheel(writer, frame, [0.5, 0.18, 0], 0.15, 0.035, false);
    addOrientedBox(writer, frame, [0, 0.2, 0], [1.08, 0.09, 0.2], COLORS.graphite, MATERIALS.paintedMetal);
    addLocalTube(writer, frame, [0.43, 0.24, 0], [0.36, 1.17, 0], 0.035, COLORS.aluminum, MATERIALS.brushedMetal);
    addLocalTube(writer, frame, [0.36, 1.17, -0.3], [0.36, 1.17, 0.3], 0.028, COLORS.graphite, MATERIALS.polymer);
    addOrientedBox(writer, frame, [0.51, 0.32, 0], [0.07, 0.1, 0.18], COLORS.whiteLight, MATERIALS.light, 0.65);
    addOrientedBox(writer, frame, [-0.53, 0.28, 0], [0.06, 0.09, 0.16], COLORS.redLight, MATERIALS.light, 0.55);
    if (!hasRider) return;
    const sway = Math.sin(motionPhase) * 0.035;
    addLocalTube(writer, frame, [-0.17, 0.28, -0.1], [-0.15, 0.9, -0.1], 0.065, COLORS.trousers, MATERIALS.fabric);
    addLocalTube(writer, frame, [0.05, 0.28, 0.1], [-0.05, 0.9, 0.1], 0.065, COLORS.trousers, MATERIALS.fabric);
    addEllipsoid(writer, frame, [sway, 1.27, 0], [0.2, 0.34, 0.16], COLORS.jacket, MATERIALS.fabric, 10, 6);
    addOrientedBox(writer, frame, [-0.19, 1.31, 0], [0.035, 0.07, 0.28], COLORS.accent, MATERIALS.light, 0.24);
    addEllipsoid(writer, frame, [0.02, 1.72, 0], [0.125, 0.15, 0.12], COLORS.helmet, MATERIALS.polymer, 10, 6);
    [-1, 1].forEach((side) => {
      addLocalTube(writer, frame, [0.03, 1.46, side * 0.2], [0.25, 1.25, side * 0.25], 0.05, COLORS.jacket, MATERIALS.fabric);
      addLocalTube(writer, frame, [0.25, 1.25, side * 0.25], [0.36, 1.17, side * 0.27], 0.045, COLORS.skin, MATERIALS.skin);
    });
  }

  function addCar(writer, frame) {
    addOrientedBox(writer, frame, [0, 0.56, 0], [4.28, 0.58, 1.82], COLORS.carPaint, MATERIALS.paintedMetal);
    addOrientedBox(writer, frame, [1.25, 0.91, 0], [1.42, 0.22, 1.66], COLORS.carPaint, MATERIALS.paintedMetal);
    addOrientedBox(writer, frame, [-1.5, 0.88, 0], [0.9, 0.2, 1.68], COLORS.carPaint, MATERIALS.paintedMetal);
    addCarCabin(writer, frame);
    for (const forward of [-1.35, 1.35]) {
      for (const right of [-0.91, 0.91]) addWheel(writer, frame, [forward, 0.46, right], 0.36, 0.12, false);
    }
    for (const right of [-0.57, 0.57]) {
      addOrientedBox(writer, frame, [2.15, 0.77, right], [0.07, 0.16, 0.42], COLORS.whiteLight, MATERIALS.light, 0.7);
      addOrientedBox(writer, frame, [-2.15, 0.76, right], [0.07, 0.15, 0.38], COLORS.redLight, MATERIALS.light, 0.62);
    }
    addOrientedBox(writer, frame, [2.17, 0.45, 0], [0.08, 0.12, 1.38], COLORS.graphite, MATERIALS.polymer);
    addOrientedBox(writer, frame, [-2.17, 0.45, 0], [0.08, 0.12, 1.42], COLORS.graphite, MATERIALS.polymer);
  }

  function addCarCabin(writer, frame) {
    const localVertices = [
      [-1.02, 0.93, -0.76], [0.82, 0.93, -0.76], [0.46, 1.52, -0.58], [-0.62, 1.52, -0.58],
      [-1.02, 0.93, 0.76], [0.82, 0.93, 0.76], [0.46, 1.52, 0.58], [-0.62, 1.52, 0.58],
    ];
    const vertices = localVertices.map((row) => localPoint(frame, row));
    const faces = [
      { indices: [1, 5, 6, 2], color: COLORS.glass, material: MATERIALS.glass },
      { indices: [4, 0, 3, 7], color: COLORS.glass, material: MATERIALS.glass },
      { indices: [0, 1, 2, 3], color: COLORS.glass, material: MATERIALS.glass },
      { indices: [5, 4, 7, 6], color: COLORS.glass, material: MATERIALS.glass },
      { indices: [3, 2, 6, 7], color: COLORS.carPaint, material: MATERIALS.paintedMetal },
    ];
    faces.forEach((face) => addQuad(writer, vertices, face.indices, face.color, face.material));
    addLocalTube(writer, frame, [-0.62, 0.94, -0.77], [-0.62, 1.52, -0.59], 0.035, COLORS.graphite, MATERIALS.paintedMetal);
    addLocalTube(writer, frame, [-0.62, 0.94, 0.77], [-0.62, 1.52, 0.59], 0.035, COLORS.graphite, MATERIALS.paintedMetal);
  }

  function addWheel(writer, frame, center, radius, tireRadius, hasSpokes) {
    addTorus(writer, frame, center, radius, tireRadius, COLORS.rubber, MATERIALS.rubber, 16, 6);
    const hubLeft = localPoint(frame, [center[0], center[1], center[2] - tireRadius * 1.45]);
    const hubRight = localPoint(frame, [center[0], center[1], center[2] + tireRadius * 1.45]);
    addCylinderBetween(writer, hubLeft, hubRight, hasSpokes ? 0.045 : radius * 0.34, 10, COLORS.steel, MATERIALS.brushedMetal);
    if (!hasSpokes) return;
    for (let index = 0; index < 8; index += 1) {
      const angle = index / 8 * Math.PI * 2;
      const rim = [center[0] + Math.cos(angle) * radius * 0.86, center[1] + Math.sin(angle) * radius * 0.86, center[2]];
      addLocalTube(writer, frame, center, rim, 0.008, COLORS.steel, MATERIALS.brushedMetal, 5);
    }
  }

  function addGroundRing(writer, frame, radius) {
    const segments = 24;
    const halfWidth = 0.035;
    for (let index = 0; index < segments; index += 1) {
      const left = index / segments * Math.PI * 2;
      const right = (index + 1) / segments * Math.PI * 2;
      const points = [
        [Math.cos(left) * (radius - halfWidth), 0.025, Math.sin(left) * (radius - halfWidth)],
        [Math.cos(left) * (radius + halfWidth), 0.025, Math.sin(left) * (radius + halfWidth)],
        [Math.cos(right) * (radius + halfWidth), 0.025, Math.sin(right) * (radius + halfWidth)],
        [Math.cos(right) * (radius - halfWidth), 0.025, Math.sin(right) * (radius - halfWidth)],
      ].map((row) => localPoint(frame, row));
      addQuad(writer, points, [0, 1, 2, 3], COLORS.primaryRing, MATERIALS.light, 0.7);
    }
  }

  function addOrientedBox(writer, frame, center, size, color, material, emissive = 0) {
    const [length, height, width] = size.map((value) => value / 2);
    const corners = [
      [-length, -height, -width], [length, -height, -width], [length, height, -width], [-length, height, -width],
      [-length, -height, width], [length, -height, width], [length, height, width], [-length, height, width],
    ].map(([forward, up, right]) => localPoint(frame, [center[0] + forward, center[1] + up, center[2] + right]));
    [[0, 1, 2, 3], [5, 4, 7, 6], [1, 5, 6, 2], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0]]
      .forEach((indices) => addQuad(writer, corners, indices, color, material, emissive));
  }

  function addQuad(writer, vertices, indices, color, material, emissive = 0) {
    const [a, b, c, d] = indices.map((index) => vertices[index]);
    const normal = faceNormal(a, b, c);
    writer.triangle(a, b, c, normal, color, emissive, material);
    writer.triangle(a, c, d, normal, color, emissive, material);
  }

  function addEllipsoid(writer, frame, center, radii, color, material, segments = 10, rings = 6) {
    const vertices = [];
    const normals = [];
    for (let ring = 0; ring <= rings; ring += 1) {
      const latitude = -Math.PI / 2 + ring / rings * Math.PI;
      for (let segment = 0; segment <= segments; segment += 1) {
        const longitude = segment / segments * Math.PI * 2;
        const unit = [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)];
        vertices.push(localPoint(frame, [center[0] + unit[0] * radii[0], center[1] + unit[1] * radii[1], center[2] + unit[2] * radii[2]]));
        normals.push(normalize(localDirection(frame, [unit[0] / radii[0], unit[1] / radii[1], unit[2] / radii[2]])));
      }
    }
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * (segments + 1) + segment;
        const b = a + 1;
        const c = a + segments + 2;
        const d = a + segments + 1;
        addSmoothTriangle(writer, vertices, normals, a, b, c, color, material);
        addSmoothTriangle(writer, vertices, normals, a, c, d, color, material);
      }
    }
  }

  function addSmoothTriangle(writer, vertices, normals, a, b, c, color, material) {
    writer.vertex(vertices[a], normals[a], color, 0, material);
    writer.vertex(vertices[b], normals[b], color, 0, material);
    writer.vertex(vertices[c], normals[c], color, 0, material);
  }

  function addTorus(writer, frame, center, radius, tubeRadius, color, material, segments, sides) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a0 = segment / segments * Math.PI * 2;
      const a1 = (segment + 1) / segments * Math.PI * 2;
      for (let side = 0; side < sides; side += 1) {
        const b0 = side / sides * Math.PI * 2;
        const b1 = (side + 1) / sides * Math.PI * 2;
        const rows = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([major, minor]) => torusVertex(frame, center, radius, tubeRadius, major, minor));
        writer.vertex(rows[0].position, rows[0].normal, color, 0, material);
        writer.vertex(rows[1].position, rows[1].normal, color, 0, material);
        writer.vertex(rows[2].position, rows[2].normal, color, 0, material);
        writer.vertex(rows[0].position, rows[0].normal, color, 0, material);
        writer.vertex(rows[2].position, rows[2].normal, color, 0, material);
        writer.vertex(rows[3].position, rows[3].normal, color, 0, material);
      }
    }
  }

  function torusVertex(frame, center, radius, tubeRadius, major, minor) {
    const radial = [Math.cos(major), Math.sin(major), 0];
    const normal = [radial[0] * Math.cos(minor), radial[1] * Math.cos(minor), Math.sin(minor)];
    return {
      position: localPoint(frame, [center[0] + radial[0] * radius + normal[0] * tubeRadius, center[1] + radial[1] * radius + normal[1] * tubeRadius, center[2] + normal[2] * tubeRadius]),
      normal: normalize(localDirection(frame, normal)),
    };
  }

  function addLimb(writer, start, end, radius, color, material) {
    addCylinderBetween(writer, start, end, radius, 8, color, material);
  }

  function addLocalTube(writer, frame, start, end, radius, color, material, segments = 8) {
    addCylinderBetween(writer, localPoint(frame, start), localPoint(frame, end), radius, segments, color, material);
  }

  function addCylinderBetween(writer, start, end, radius, segments, color, material) {
    const axis = normalize(subtract(end, start));
    const reference = Math.abs(axis[1]) < 0.88 ? [0, 1, 0] : [1, 0, 0];
    const tangent = normalize(cross(axis, reference));
    const bitangent = normalize(cross(axis, tangent));
    const startRing = [];
    const endRing = [];
    const normals = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const normal = add(scale(tangent, Math.cos(angle)), scale(bitangent, Math.sin(angle)));
      normals.push(normal);
      startRing.push(add(start, scale(normal, radius)));
      endRing.push(add(end, scale(normal, radius)));
    }
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      writer.vertex(startRing[index], normals[index], color, 0, material);
      writer.vertex(endRing[index], normals[index], color, 0, material);
      writer.vertex(endRing[next], normals[next], color, 0, material);
      writer.vertex(startRing[index], normals[index], color, 0, material);
      writer.vertex(endRing[next], normals[next], color, 0, material);
      writer.vertex(startRing[next], normals[next], color, 0, material);
      writer.triangle(start, startRing[next], startRing[index], scale(axis, -1), color, 0, material);
      writer.triangle(end, endRing[index], endRing[next], axis, color, 0, material);
    }
  }

  function createFrame(point, heading) {
    return {
      origin: [point.x, 0, -point.y],
      forward: [Math.cos(heading), 0, -Math.sin(heading)],
      up: [0, 1, 0],
      right: [Math.sin(heading), 0, Math.cos(heading)],
    };
  }

  function localPoint(frame, [forward, up, right]) {
    return add(frame.origin, add(scale(frame.forward, forward), add(scale(frame.up, up), scale(frame.right, right))));
  }

  function localDirection(frame, [forward, up, right]) {
    return add(scale(frame.forward, forward), add(scale(frame.up, up), scale(frame.right, right)));
  }

  function faceNormal(a, b, c) {
    return normalize(cross(subtract(b, a), subtract(c, a)));
  }

  function add(left, right) {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
  }

  function subtract(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
  }

  function scale(value, amount) {
    return [value[0] * amount, value[1] * amount, value[2] * amount];
  }

  function cross(left, right) {
    return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]];
  }

  function normalize(value) {
    const length = Math.hypot(...value) || 1;
    return value.map((row) => row / length);
  }

  return { ACTOR_MESH_SCHEMA, COLORS, FLOATS_PER_VERTEX, MATERIALS, MATERIAL_MODEL, SUPPORTED_ACTOR_KINDS, addActor, canonicalKind };
});
