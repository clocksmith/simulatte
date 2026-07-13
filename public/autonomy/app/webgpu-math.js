(function attachAutonomyWebGpuMath(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyGpuMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWebGpuMath() {
  function add(left, right) {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
  }

  function subtract(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
  }

  function scale(vector, amount) {
    return vector.map((value) => value * amount);
  }

  function dot(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  }

  function cross(left, right) {
    return [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0],
    ];
  }

  function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
  }

  function perspective(fieldOfViewRadians, aspect, near, far) {
    const out = new Float32Array(16);
    const focal = 1 / Math.tan(fieldOfViewRadians / 2);
    out[0] = focal / aspect;
    out[5] = focal;
    out[10] = far / (near - far);
    out[11] = -1;
    out[14] = far * near / (near - far);
    return out;
  }

  function orthographic(left, right, bottom, top, near, far) {
    const out = new Float32Array(16);
    out[0] = 2 / (right - left);
    out[5] = 2 / (top - bottom);
    out[10] = 1 / (near - far);
    out[12] = (left + right) / (left - right);
    out[13] = (top + bottom) / (bottom - top);
    out[14] = near / (near - far);
    out[15] = 1;
    return out;
  }

  function lookAt(eye, target, up = [0, 1, 0]) {
    const z = normalize(subtract(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]);
  }

  function multiply(left, right) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[column * 4 + row] =
          left[0 * 4 + row] * right[column * 4 + 0] +
          left[1 * 4 + row] * right[column * 4 + 1] +
          left[2 * 4 + row] * right[column * 4 + 2] +
          left[3 * 4 + row] * right[column * 4 + 3];
      }
    }
    return out;
  }

  function transformPoint(matrix, point) {
    const [x, y, z] = point;
    const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    return [
      (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w,
      (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w,
      (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) / w,
    ];
  }

  return { add, cross, dot, lookAt, multiply, normalize, orthographic, perspective, scale, subtract, transformPoint };
});
