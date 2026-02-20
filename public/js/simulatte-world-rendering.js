function bindMeshVertexLayout() {
  const stride = 5 * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, meshRender.vertexBuffer);
  gl.enableVertexAttribArray(meshShader.loc.aPos);
  gl.enableVertexAttribArray(meshShader.loc.aHeight);
  gl.enableVertexAttribArray(meshShader.loc.aSlope);
  gl.enableVertexAttribArray(meshShader.loc.aFade);
  gl.vertexAttribPointer(meshShader.loc.aPos, 2, gl.FLOAT, false, stride, 0);
  gl.vertexAttribPointer(meshShader.loc.aHeight, 1, gl.FLOAT, false, stride, 2 * 4);
  gl.vertexAttribPointer(meshShader.loc.aSlope, 1, gl.FLOAT, false, stride, 3 * 4);
  gl.vertexAttribPointer(meshShader.loc.aFade, 1, gl.FLOAT, false, stride, 4 * 4);
}

function initMeshRenderer() {
  const vertexSource = `
    attribute vec2 aPos;
    attribute float aHeight;
    attribute float aSlope;
    attribute float aFade;

    uniform float uWidth;
    uniform float uHeight;
    uniform float uRotation;
    uniform float uPitch;
    uniform float uScale;
    uniform float uCameraScale;
    uniform float uWorldXScale;
    uniform float uWorldYScale;
    uniform float uWorldYSlopeScale;
    uniform float uWorldXOffset;
    uniform float uWorldYOffset;

    varying float vFade;
    varying float vHeight;
    varying float vSlope;

    void main() {
      float c = cos(uRotation);
      float s = sin(uRotation);
      float cx = aPos.x * c - aPos.y * s;
      float cy = aPos.x * s + aPos.y * c;
      float cp = cos(uPitch);
      float sp = sin(uPitch);
      float cyTilted = cy * cp - aHeight * sp;
      float hTilted = aHeight * cp + cy * sp;
      float perspective = 1.0 / max(1.0 + 0.06 * cyTilted + 0.05, 0.28);
      float sx = (uWidth * 0.5 + uWorldXOffset * uScale) +
        (cx * uWorldXScale * perspective * uScale * uCameraScale);
      float sy = (uHeight * uWorldYOffset) -
        (hTilted * uWorldYScale * uScale * uCameraScale) +
        ((-cyTilted * uWorldYSlopeScale) * perspective * uScale * uCameraScale);

      float depth = 0.5 + (cyTilted - hTilted * 0.12) * 0.012;
      float z = clamp(2.0 * depth - 1.0, -1.0, 0.995);

      gl_Position = vec4(
        (sx / uWidth) * 2.0 - 1.0,
        1.0 - (sy / uHeight) * 2.0,
        z,
        1.0
      );

      vFade = aFade;
      vHeight = aHeight;
      vSlope = aSlope;
    }
  `;

  const fragmentSource = `
    precision highp float;

    varying float vFade;
    varying float vHeight;
    varying float vSlope;

    uniform float uTileAlpha;
    uniform float uLineAlpha;
    uniform float uShadingEnabled;
    uniform float uClipEnabled;
    uniform float uClipMargin;
    uniform float uWidth;
    uniform float uHeight;
    uniform float uHeightMin;
    uniform float uHeightMax;

    void main() {
      if (uClipEnabled > 0.5) {
        if (gl_FragCoord.x < -uClipMargin || gl_FragCoord.x > (uWidth + uClipMargin) ||
            gl_FragCoord.y < -uClipMargin || gl_FragCoord.y > (uHeight + uClipMargin)) {
          discard;
        }
      }

      float fade = clamp(vFade, 0.0, 1.0);
      if (uShadingEnabled > 0.5) {
        float range = max(uHeightMax - uHeightMin, 0.0001);
        float depth = clamp((vHeight - uHeightMin) / range, 0.0, 1.0);
        float slope = clamp(vSlope * 0.65, 0.0, 1.0);

        // Broad tonal gradient: 0.1 at lowest valleys -> 0.9 across most terrain.
        float broad = smoothstep(0.0, 0.82, depth);
        float baseTone = mix(0.10, 0.90, broad);

        // Final peak lift to pure white near the absolute height maximum.
        float peakLift = 0.10 * smoothstep(0.82, 1.0, depth);
        float slopeAtten = 0.08 * slope * (1.0 - smoothstep(0.90, 1.0, depth));
        float tone = clamp(baseTone + peakLift - slopeAtten, 0.10, 1.0);
        float alphaCurve = depth * depth;
        float alpha = mix(1.44, 0.48, alphaCurve);
        gl_FragColor = vec4(tone, tone, tone, uTileAlpha * alpha * fade);
      } else {
        gl_FragColor = vec4(0.0, 0.0, 0.0, uLineAlpha * fade);
      }
    }
  `;

  meshShader.program = createProgram(vertexSource, fragmentSource);
  [
    'uWidth',
    'uHeight',
    'uRotation',
    'uPitch',
    'uScale',
    'uCameraScale',
    'uWorldXScale',
    'uWorldYScale',
    'uWorldYSlopeScale',
    'uWorldXOffset',
    'uWorldYOffset',
    'uTileAlpha',
    'uLineAlpha',
    'uShadingEnabled',
    'uClipEnabled',
    'uClipMargin',
    'uHeightMin',
    'uHeightMax',
  ].forEach((u) => {
    meshShader.loc[u] = gl.getUniformLocation(meshShader.program, u);
  });
  ['aPos', 'aHeight', 'aSlope', 'aFade'].forEach((a) => {
    meshShader.loc[a] = gl.getAttribLocation(meshShader.program, a);
  });

  meshRender.count = mesh.lines;
  meshRender.min = -mesh.horizonHalfRange;
  meshRender.step = (2 * mesh.horizonHalfRange) / (meshRender.count - 1);
  meshRender.vertices = new Float32Array(meshRender.count * meshRender.count * 5);
  meshRender.heights = new Float32Array(meshRender.count * meshRender.count);

  for (let i = 0; i < meshRender.count; i++) {
    const x = meshRender.min + i * meshRender.step;
    for (let j = 0; j < meshRender.count; j++) {
      const z = meshRender.min + j * meshRender.step;
      const index = (i * meshRender.count + j) * 5;
      meshRender.vertices[index] = x;
      meshRender.vertices[index + 1] = z;
    }
  }

  const triCount = (meshRender.count - 1) * (meshRender.count - 1) * 2;
  const triIndex = new Uint16Array(triCount * 3);
  let ti = 0;
  for (let i = 0; i < meshRender.count - 1; i++) {
    for (let j = 0; j < meshRender.count - 1; j++) {
      const a = i * meshRender.count + j;
      const b = (i + 1) * meshRender.count + j;
      const c = (i + 1) * meshRender.count + (j + 1);
      const d = i * meshRender.count + (j + 1);
      triIndex[ti++] = a;
      triIndex[ti++] = b;
      triIndex[ti++] = c;
      triIndex[ti++] = a;
      triIndex[ti++] = c;
      triIndex[ti++] = d;
    }
  }

  const lineCount = meshRender.count * (meshRender.count - 1) * 2;
  const lineIndex = new Uint16Array(lineCount * 2);
  let li = 0;
  for (let j = 0; j < meshRender.count; j++) {
    for (let i = 0; i < meshRender.count - 1; i++) {
      lineIndex[li++] = i * meshRender.count + j;
      lineIndex[li++] = (i + 1) * meshRender.count + j;
    }
  }
  for (let i = 0; i < meshRender.count; i++) {
    for (let j = 0; j < meshRender.count - 1; j++) {
      lineIndex[li++] = i * meshRender.count + j;
      lineIndex[li++] = i * meshRender.count + (j + 1);
    }
  }

  meshRender.triIndexCount = triIndex.length;
  meshRender.lineIndexCount = lineIndex.length;

  meshRender.vertexBuffer = gl.createBuffer();
  meshRender.triIndexBuffer = gl.createBuffer();
  meshRender.lineIndexBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, meshRender.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, meshRender.vertices, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshRender.triIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triIndex, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshRender.lineIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndex, gl.STATIC_DRAW);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearDepth(1.0);
  gl.clearColor(1, 1, 1, 1);

  initMarbleRenderer();
  initMarbleShadowRenderer();
}

function initMarbleRenderer() {
  const vertexSource = `
    uniform float uWidth;
    uniform float uHeight;
    uniform float uScreenX;
    uniform float uScreenY;
    uniform float uDepth;
    uniform float uRadius;

    void main() {
      float x = (uScreenX / uWidth) * 2.0 - 1.0;
      float y = 1.0 - (uScreenY / uHeight) * 2.0;
      gl_Position = vec4(x, y, uDepth, 1.0);
      gl_PointSize = max(2.0, uRadius);
    }
  `;

  const fragmentSource = `
    precision highp float;
    uniform float uOpacity;
    uniform float uGroundNx;
    uniform float uGroundNz;
    uniform float uRotation;
    uniform float uPitch;

    void main() {
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      float r = length(uv);
      if (r > 1.0) discard;

      float z = sqrt(max(0.0, 1.0 - r * r));
      vec3 sphereN = normalize(vec3(uv, z));

      float c = cos(uRotation);
      float s = sin(uRotation);
      float cp = cos(uPitch);
      float sp = sin(uPitch);

      vec3 g = normalize(vec3(-uGroundNx, 1.0, -uGroundNz));
      float gx = g.x * c - g.z * s;
      float gz = g.x * s + g.z * c;
      float gy = gz * cp - g.y * sp;
      float gh = g.y * cp + gz * sp;
      vec3 groundN = normalize(vec3(gx, gy, gh));

      vec3 lightLocal = normalize(vec3(-0.4, 0.9, 1.0));
      float lx = lightLocal.x * c - lightLocal.z * s;
      float lz = lightLocal.x * s + lightLocal.z * c;
      float ly = lz * cp - lightLocal.y * sp;
      float lh = lightLocal.y * cp + lz * sp;
      vec3 lightDir = normalize(vec3(lx, ly, lh));

      vec3 view = normalize(vec3(0.0, 0.25, 1.0));
      float diff = max(dot(groundN, lightDir), 0.0);
      float gloss = pow(max(dot(sphereN, normalize(lightDir + view)), 0.0), 22.0);
      float rim = pow(1.0 - clamp(dot(sphereN, view), 0.0, 1.0), 4.0);

      float ambient = mix(0.42, 1.0, z);
      vec3 tone = vec3(0.16) * (ambient + 0.45 * diff) + vec3(gloss * 0.38) + vec3(rim * 0.06);
      tone = clamp(tone, 0.0, 1.0);

      gl_FragColor = vec4(tone, uOpacity);
    }
  `;

  marbleShader.program = createProgram(vertexSource, fragmentSource);
  [
    'uWidth',
    'uHeight',
    'uScreenX',
    'uScreenY',
    'uDepth',
    'uRadius',
    'uGroundNx',
    'uGroundNz',
    'uRotation',
    'uPitch',
    'uOpacity',
  ].forEach((u) => {
    marbleShader.loc[u] = gl.getUniformLocation(marbleShader.program, u);
  });
}

function initMarbleShadowRenderer() {
  const vertexSource = `
    attribute vec3 aPos;
    uniform float uWidth;
    uniform float uHeight;
    uniform float uRotation;
    uniform float uPitch;
    uniform float uScale;
    uniform float uCameraScale;
    uniform float uWorldXScale;
    uniform float uWorldYScale;
    uniform float uWorldYSlopeScale;
    uniform float uWorldXOffset;
    uniform float uWorldYOffset;
    uniform float uRadius;
    uniform float uLift;

    void main() {
      float x = aPos.x;
      float z = aPos.y;
      float h = aPos.z;

      float c = cos(uRotation);
      float s = sin(uRotation);
      float cx = x * c - z * s;
      float cy = x * s + z * c;

      float cp = cos(uPitch);
      float sp = sin(uPitch);
      float cyTilted = cy * cp - h * sp;
      float hTilted = h * cp + cy * sp;
      float perspective = 1.0 / max(1.0 + 0.04 * cyTilted + 0.05, 0.18);

      float sx = (uWidth * 0.5 + uWorldXOffset * uScale) +
        (cx * uWorldXScale * perspective * uScale * uCameraScale);
      float sy = (uHeight * uWorldYOffset) -
        (hTilted * uWorldYScale * uScale * uCameraScale) +
        ((-cyTilted * uWorldYSlopeScale) * perspective * uScale * uCameraScale);

      float depth = 0.5 + (cyTilted - hTilted * 0.12) * 0.012;
      float zClip = clamp(2.0 * (depth - 0.0008) - 1.0, -1.0, 0.995);

      gl_Position = vec4(
        (sx / uWidth) * 2.0 - 1.0,
        1.0 - ((sy + uLift) / uHeight) * 2.0,
        zClip,
        1.0
      );

      gl_PointSize = max(2.0, uRadius);
    }
  `;

  const fragmentSource = `
    precision highp float;
    uniform float uOpacity;

    void main() {
      vec2 uv = gl_PointCoord * 2.0 - 1.0;
      vec2 ellipse = vec2(uv.x * 0.52, uv.y * 1.9);
      float r2 = dot(ellipse, ellipse);
      if (r2 > 1.0) discard;

      float alpha = pow(1.0 - r2, 2.0);
      alpha *= (0.5 + 0.5 * clamp(1.0 - uv.y, 0.0, 1.0));
      gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity * alpha);
    }
  `;

  marbleShadowShader.program = createProgram(vertexSource, fragmentSource);
  [
    'uWidth',
    'uHeight',
    'uRotation',
    'uPitch',
    'uScale',
    'uCameraScale',
    'uWorldXScale',
    'uWorldYScale',
    'uWorldYSlopeScale',
    'uWorldXOffset',
    'uWorldYOffset',
    'uRadius',
    'uLift',
    'uOpacity',
  ].forEach((u) => {
    marbleShadowShader.loc[u] = gl.getUniformLocation(marbleShadowShader.program, u);
  });
  marbleShadowShader.loc.aPos = gl.getAttribLocation(marbleShadowShader.program, 'aPos');

  marbleShadowShader.buffer = gl.createBuffer();
  marbleShadowShader.data = new Float32Array(3);
  gl.bindBuffer(gl.ARRAY_BUFFER, marbleShadowShader.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, marbleShadowShader.data, gl.DYNAMIC_DRAW);
}

function updateMeshSamples() {
  const { count, step, min, vertices, heights } = meshRender;
  const inv2s = 0.5 / step;
  let hMin = Infinity;
  let hMax = -Infinity;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const index = i * count + j;
      const x = min + i * step;
      const z = min + j * step;
      const h = fieldHeightStatic(x, z);
      const v = index * 5;
      heights[index] = h;
      vertices[v + 2] = h;
      vertices[v + 3] = 0;
      vertices[v + 4] = clamp01(horizonFade(x, z));
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
    }
  }

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const index = i * count + j;
      const v = index * 5;
      const hL = heights[(i > 0 ? i - 1 : i) * count + j];
      const hR = heights[(i < count - 1 ? i + 1 : i) * count + j];
      const hD = heights[i * count + (j > 0 ? j - 1 : j)];
      const hU = heights[i * count + (j < count - 1 ? j + 1 : j)];
      vertices[v + 3] = Math.hypot((hR - hL) * inv2s, (hU - hD) * inv2s);
    }
  }

  meshRender.heightMin = hMin;
  meshRender.heightMax = hMax;

  gl.bindBuffer(gl.ARRAY_BUFFER, meshRender.vertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, meshRender.vertices);
}

function drawMeshGridWebGL() {
  updateMeshSamples();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(meshShader.program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);

  const solidTiles = renderSettings.tileAlpha >= 0.999;
  gl.depthMask(solidTiles);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1.0, 1.0);

  bindMeshVertexLayout();

  gl.uniform1f(meshShader.loc.uWidth, canvas.width);
  gl.uniform1f(meshShader.loc.uHeight, canvas.height);
  gl.uniform1f(meshShader.loc.uRotation, state.rotation);
  gl.uniform1f(meshShader.loc.uPitch, state.pitch);
  gl.uniform1f(meshShader.loc.uScale, dpr);
  gl.uniform1f(meshShader.loc.uCameraScale, worldProjection.cameraScale);
  gl.uniform1f(meshShader.loc.uWorldXScale, worldProjection.xScale);
  gl.uniform1f(meshShader.loc.uWorldYScale, worldProjection.yScale);
  gl.uniform1f(meshShader.loc.uWorldYSlopeScale, worldProjection.ySlopeScale);
  gl.uniform1f(meshShader.loc.uWorldXOffset, worldProjection.xOffset);
  gl.uniform1f(meshShader.loc.uWorldYOffset, worldProjection.yOffset);
  gl.uniform1f(meshShader.loc.uClipEnabled, mesh.clipMode ? 1 : 0);
  gl.uniform1f(meshShader.loc.uClipMargin, mesh.clipMargin);
  gl.uniform1f(meshShader.loc.uHeightMin, meshRender.heightMin);
  gl.uniform1f(meshShader.loc.uHeightMax, meshRender.heightMax);

  if (renderSettings.tileAlpha > 0.0001) {
    gl.uniform1f(meshShader.loc.uShadingEnabled, 1);
    gl.uniform1f(meshShader.loc.uTileAlpha, renderSettings.tileAlpha);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshRender.triIndexBuffer);
    gl.drawElements(gl.TRIANGLES, meshRender.triIndexCount, gl.UNSIGNED_SHORT, 0);
  }

  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.depthMask(false);

  const effectiveLineAlpha = renderSettings.lineAlpha * renderSettings.tileAlpha;
  if (effectiveLineAlpha > 0.0001) {
    gl.uniform1f(meshShader.loc.uShadingEnabled, 0);
    gl.uniform1f(meshShader.loc.uLineAlpha, effectiveLineAlpha);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshRender.lineIndexBuffer);
    gl.drawElements(gl.LINES, meshRender.lineIndexCount, gl.UNSIGNED_SHORT, 0);
  }

  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);

  drawMarbleWebGL();
}

function drawMarbleWebGL() {
  const isPortal = state.phase === 'portal';
  const portalPoint = isPortal ? state.portalSettlePoint || state.portalTarget : null;
  const metrics = isPortal ? state.portalTargetMetrics : null;

  const marblePoint = portalPoint
    ? { x: portalPoint.x, z: portalPoint.z }
    : { x: state.x, z: state.z };

  const h = metrics && Number.isFinite(metrics.h) ? metrics.h : fieldHeightStatic(marblePoint.x, marblePoint.z);
  const rawSlope =
    metrics && Number.isFinite(metrics.slopeX) && Number.isFinite(metrics.slopeZ)
      ? { x: metrics.slopeX, z: metrics.slopeZ }
      : staticHeightGradient(marblePoint.x, marblePoint.z, dynamics.normalSampleEps);

  const slope = isPortal
    ? rawSlope
    : (() => {
        const normalBlend = clamp01(state.frameDt * dynamics.normalSmoothing);
        state.marbleSlopeX += (rawSlope.x - state.marbleSlopeX) * normalBlend;
        state.marbleSlopeZ += (rawSlope.z - state.marbleSlopeZ) * normalBlend;
        return { x: state.marbleSlopeX, z: state.marbleSlopeZ };
      })();

  const contactTerms = projectScreenTerms(
    marblePoint.x,
    marblePoint.z,
    h,
    state.rotation,
    state.pitch,
    worldProjection.cameraScale,
    worldProjection.ySlopeScale
  );

  const contactScreenX = (width() * 0.5 + worldProjection.xOffset + contactTerms.x) * dpr;
  const contactScreenY = (height() * worldProjection.yOffset + contactTerms.y) * dpr;
  const cameraScale = Math.max(0.12, worldProjection.cameraScale / baseWorldProjection.cameraScale);

  let radius = 6.7 * contactTerms.scale * cameraScale * 3;
  if (metrics && Number.isFinite(metrics.radius)) {
    radius = metrics.radius;
  }

  const shadowRadius = radius * 1.4;
  const opacity = 1;

  const liftProbe = 0.25;
  const liftedTerms = projectScreenTerms(
    marblePoint.x,
    marblePoint.z,
    h + liftProbe,
    state.rotation,
    state.pitch,
    worldProjection.cameraScale,
    worldProjection.ySlopeScale
  );

  const liftDx = (liftedTerms.x - contactTerms.x) * dpr;
  const liftDy = (liftedTerms.y - contactTerms.y) * dpr;
  const liftLen = Math.hypot(liftDx, liftDy);
  const liftScale = liftLen > 1e-6 ? radius / liftLen : 0;
  const targetScreenX = contactScreenX + liftDx * liftScale;
  const targetScreenY = contactScreenY + liftDy * liftScale;

  const targetDepth =
    metrics && Number.isFinite(metrics.depth)
      ? metrics.depth
      : clamp(2.0 * (liftedTerms.depth - 0.0011) - 1.0, -1.0, 0.995);

  const renderBlend = isPortal ? 1 : clamp01(state.frameDt * dynamics.renderSmoothing);
  if (!Number.isFinite(state.marbleRenderX)) {
    state.marbleRenderX = targetScreenX;
    state.marbleRenderY = targetScreenY;
    state.marbleRenderDepth = targetDepth;
  } else {
    state.marbleRenderX += (targetScreenX - state.marbleRenderX) * renderBlend;
    state.marbleRenderY += (targetScreenY - state.marbleRenderY) * renderBlend;
    state.marbleRenderDepth += (targetDepth - state.marbleRenderDepth) * renderBlend;
  }

  marbleShadowShader.data[0] = marblePoint.x;
  marbleShadowShader.data[1] = marblePoint.z;
  marbleShadowShader.data[2] = h;
  gl.bindBuffer(gl.ARRAY_BUFFER, marbleShadowShader.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, marbleShadowShader.data);

  gl.useProgram(marbleShadowShader.program);
  gl.uniform1f(marbleShadowShader.loc.uWidth, canvas.width);
  gl.uniform1f(marbleShadowShader.loc.uHeight, canvas.height);
  gl.uniform1f(marbleShadowShader.loc.uRotation, state.rotation);
  gl.uniform1f(marbleShadowShader.loc.uPitch, state.pitch);
  gl.uniform1f(marbleShadowShader.loc.uScale, dpr);
  gl.uniform1f(marbleShadowShader.loc.uCameraScale, worldProjection.cameraScale);
  gl.uniform1f(marbleShadowShader.loc.uWorldXScale, worldProjection.xScale);
  gl.uniform1f(marbleShadowShader.loc.uWorldYScale, worldProjection.yScale);
  gl.uniform1f(marbleShadowShader.loc.uWorldYSlopeScale, worldProjection.ySlopeScale);
  gl.uniform1f(marbleShadowShader.loc.uWorldXOffset, worldProjection.xOffset);
  gl.uniform1f(marbleShadowShader.loc.uWorldYOffset, worldProjection.yOffset);
  gl.uniform1f(marbleShadowShader.loc.uRadius, shadowRadius);
  gl.uniform1f(marbleShadowShader.loc.uLift, 0.0);
  gl.uniform1f(marbleShadowShader.loc.uOpacity, opacity * 0.24);

  gl.enableVertexAttribArray(marbleShadowShader.loc.aPos);
  gl.vertexAttribPointer(marbleShadowShader.loc.aPos, 3, gl.FLOAT, false, 0, 0);
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.POINTS, 0, 1);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
  gl.disableVertexAttribArray(marbleShadowShader.loc.aPos);

  gl.useProgram(marbleShader.program);
  gl.uniform1f(marbleShader.loc.uWidth, canvas.width);
  gl.uniform1f(marbleShader.loc.uHeight, canvas.height);
  gl.uniform1f(marbleShader.loc.uScreenX, state.marbleRenderX);
  gl.uniform1f(marbleShader.loc.uScreenY, state.marbleRenderY);
  gl.uniform1f(marbleShader.loc.uDepth, state.marbleRenderDepth);
  gl.uniform1f(marbleShader.loc.uRadius, radius * 2.0);
  gl.uniform1f(marbleShader.loc.uRotation, state.rotation);
  gl.uniform1f(marbleShader.loc.uPitch, state.pitch);
  gl.uniform1f(marbleShader.loc.uGroundNx, slope.x);
  gl.uniform1f(marbleShader.loc.uGroundNz, slope.z);
  gl.uniform1f(marbleShader.loc.uOpacity, opacity);

  gl.drawArrays(gl.POINTS, 0, 1);
}

function drawAnchors() {
  ctx.font = '11px "SF Mono", "Menlo", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const anchor of Object.values(anchors)) {
    const marker = holeCenters[anchor.id] || anchor.point;
    const h = fieldHeightStatic(marker.x, marker.z);
    const p = toScreen(marker.x, marker.z, h);
    const text = anchor.label;
    const metrics = ctx.measureText(text);
    const paddingX = 8;
    const rectWidth = metrics.width + paddingX * 2;
    const rectHeight = 16;

    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.4;
    ctx.fillRect(p.x - rectWidth * 0.5, p.y - rectHeight * 0.5, rectWidth, rectHeight);
    ctx.strokeRect(p.x - rectWidth * 0.5, p.y - rectHeight * 0.5, rectWidth, rectHeight);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.9;
    ctx.strokeText(text, p.x, p.y);

    ctx.fillStyle = '#000';
    ctx.fillText(text, p.x, p.y);
  }
}

function render() {
  ctx.clearRect(0, 0, width(), height());
  drawMeshGridWebGL();
  drawAnchors();

  if (state.phase === 'portal' || !detailEl.hidden) {
    syncArrivalDetailPosition();
  }
}

function tick(now) {
  const dt = Math.min(0.05, (now - state.lastT) / 1000 || 0.016);
  state.lastT = now;
  state.frameDt = dt;
  const nowSec = now * 0.001;
  terrainPerturbationTimeSec = nowSec;

  const hasPortalTravel = Boolean(state.portalFlight);
  const isPortalPhase = state.phase === 'portal';

  if (!isPortalPhase || hasPortalTravel) {
    updatePeaks(dt);
    updateModeDynamics(dt);
    updateAnchorSpreads(dt);
  }

  if (state.phase === 'field') {
    stepPhysics(dt);
    maybeArrive();
  } else if (state.phase === 'portal') {
    if (state.portalFlight) {
      updatePortalFlight(dt);
    }
  }

  updateIdleCinematic(nowSec, dt);
  render();
  requestAnimationFrame(tick);
}

let simulatteWorldStarted = false;

function startSimulatteWorld() {
  if (simulatteWorldStarted) {
    return;
  }
  simulatteWorldStarted = true;

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setMode(button.dataset.mode, Number(button.dataset.step || '1'));
    });
  });

  alphaModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setTileAlphaMode(button.dataset.alphaMode || '1.0');
    });
  });

  canvas.addEventListener('pointerdown', startRotation, { passive: false });
  canvas.addEventListener('pointermove', updateRotation, { passive: false });
  canvas.addEventListener('pointerup', endRotation, { passive: false });
  canvas.addEventListener('pointercancel', endRotation, { passive: false });
  canvas.addEventListener('pointerleave', endRotation, { passive: false });
  canvas.addEventListener('pointerout', endRotation, { passive: false });

  jitterBtn.addEventListener('click', jitter);
  resetBtn.addEventListener('click', reset);
  mainResetBtn.addEventListener('click', reset);

  window.addEventListener('resize', resize);

  resize();
  initMeshRenderer();
  setTileAlphaMode(renderSettings.tileAlpha);
  reset();
  requestAnimationFrame(tick);
}

window.SimulatteWorldRuntime = {
  start: startSimulatteWorld,
  isStarted: () => simulatteWorldStarted,
};
