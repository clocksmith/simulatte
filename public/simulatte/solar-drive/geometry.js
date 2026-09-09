(function attachSolarGeometry(root) {
  'use strict';
  const TAU = Math.PI * 2;
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function multiply(a, b) {
    const o = new Float32Array(16);
    for (let col = 0; col < 4; col += 1) for (let row = 0; row < 4; row += 1) {
      o[col * 4 + row] = a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1]
        + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
    return o;
  }
  function matrix(position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const [x, y, z] = rotation;
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    return new Float32Array([
      cy * cz * scale[0], cy * sz * scale[0], -sy * scale[0], 0,
      (sx * sy * cz - cx * sz) * scale[1], (sx * sy * sz + cx * cz) * scale[1], sx * cy * scale[1], 0,
      (cx * sy * cz + sx * sz) * scale[2], (cx * sy * sz - sx * cz) * scale[2], cx * cy * scale[2], 0,
      ...position, 1,
    ]);
  }
  function between(a, b, radius) {
    const d = sub(b, a), z = norm(d), x = norm(cross(Math.abs(z[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0], z)), y = cross(z, x);
    const length = Math.hypot(...d);
    return new Float32Array([...x.map((v) => v * radius), 0, ...y.map((v) => v * radius), 0,
      ...z.map((v) => v * length), 0, ...a.map((v, i) => (v + b[i]) / 2), 1]);
  }
  function lookAt(eye, target) {
    const z = norm(sub(eye, target)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function perspective(aspect, fov = 0.65, near = 0.05, far = 100) {
    const f = 1 / Math.tan(fov / 2);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1,
      0, 0, far * near / (near - far), 0]);
  }
  function orthographic(size, near = 0.1, far = 40) {
    return new Float32Array([1 / size, 0, 0, 0, 0, 1 / size, 0, 0, 0, 0, 1 / (near - far), 0, 0, 0, near / (near - far), 1]);
  }
  function project(m, p, width, height) {
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0) return null;
    return { x: ((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w * 0.5 + 0.5) * width,
      y: (0.5 - (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w * 0.5) * height,
      z: (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w, w };
  }
  function meshLibrary() {
    const output = {};
    let data;
    const vertex = (p, n) => data.push(...p, ...n);
    const quad = (points, normals) => {
      for (const i of [0, 1, 2, 0, 2, 3]) vertex(points[i], normals[i] || normals[0]);
    };
    data = [];
    for (const [n, u, v] of [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    ]) quad([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => n.map((x, i) => (x + a * u[i] + b * v[i]) / 2)), [n]);
    output.box = new Float32Array(data);
    for (const shape of ['cylinder', 'ring']) {
      data = [];
      const inner = shape === 'ring' ? 0.74 : 0;
      for (let i = 0; i < 64; i += 1) {
        const a = i / 64 * TAU, b = (i + 1) / 64 * TAU;
        const point = (angle, radius, z) => [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
        quad([point(a, 1, -0.5), point(b, 1, -0.5), point(b, 1, 0.5), point(a, 1, 0.5)],
          [point(a, 1, 0), point(b, 1, 0), point(b, 1, 0), point(a, 1, 0)]);
        if (inner) quad([point(a, inner, 0.5), point(b, inner, 0.5), point(b, inner, -0.5), point(a, inner, -0.5)],
          [point(a, -1, 0), point(b, -1, 0), point(b, -1, 0), point(a, -1, 0)]);
        for (const z of [-0.5, 0.5]) quad([point(a, inner, z), point(a, 1, z), point(b, 1, z), point(b, inner, z)], [[0, 0, Math.sign(z)]]);
      }
      output[shape] = new Float32Array(data);
    }
    for (const shape of ['torus', 'sphere']) {
      data = [];
      const rows = shape === 'torus' ? 16 : 20;
      const point = (i, j) => {
        const a = i / 64 * TAU, b = j / rows * (shape === 'torus' ? TAU : Math.PI);
        const n = shape === 'torus' ? [Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)]
          : [Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)];
        const p = shape === 'torus' ? [(0.9 + 0.1 * Math.cos(b)) * Math.cos(a), (0.9 + 0.1 * Math.cos(b)) * Math.sin(a), 0.1 * Math.sin(b)] : n;
        return { p, n };
      };
      for (let i = 0; i < 64; i += 1) for (let j = 0; j < rows; j += 1) {
        const corners = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
        quad(corners.map((v) => v.p), corners.map((v) => v.n));
      }
      output[shape] = new Float32Array(data);
    }
    return output;
  }
  root.SimulatteSolarGeometry = Object.freeze({ add, sub, dot, cross, norm, identity, multiply, matrix, between, lookAt, perspective, orthographic, project, meshLibrary });
})(globalThis);
