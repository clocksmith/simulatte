const DEG = Math.PI / 180;
export const ISO_Y_DEGREES = 45;
export const ISO_X_DEGREES = 35.264;

function identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (right - left);
  const bt = 1 / (top - bottom);
  const nf = 1 / (near - far);

  return new Float32Array([
    2 * lr, 0, 0, 0,
    0, 2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    -(right + left) * lr,
    -(top + bottom) * bt,
    (far + near) * nf,
    1
  ]);
}

function rotateX(angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1
  ]);
}

function rotateY(angleRad) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ]);
}

function translate(tx, ty, tz) {
  const out = identity();
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  return out;
}

function scale(sx, sy, sz) {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1
  ]);
}

export function createIsometricViewProjection(options) {
  const width = Math.max(1, options.width || 1);
  const height = Math.max(1, options.height || 1);
  const mapWidth = Math.max(1, options.mapWidth || 1);
  const mapHeight = Math.max(1, options.mapHeight || 1);
  const zoom = Math.max(0.25, options.zoom || 1);

  const span = Math.max(mapWidth, mapHeight) * 0.75 / zoom;
  const aspect = width / height;

  const left = -span * aspect;
  const right = span * aspect;
  const bottom = -span;
  const top = span;

  const projection = ortho(left, right, bottom, top, -200, 200);
  const rotY = rotateY(ISO_Y_DEGREES * DEG);
  const rotX = rotateX(ISO_X_DEGREES * DEG);

  const center = translate(-(mapWidth * 0.5), 0, -(mapHeight * 0.5));
  const model = multiply(rotX, multiply(rotY, center));

  const sceneScale = scale(1, 1.6, 1);
  return multiply(projection, multiply(sceneScale, model));
}
