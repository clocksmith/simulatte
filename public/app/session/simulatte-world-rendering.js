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
        vec3 lowTone = vec3(0.02, 0.09, 0.08);
        vec3 midTone = vec3(0.10, 0.20, 0.17);
        vec3 highTone = vec3(0.72, 0.95, 0.32);
        vec3 slopeTone = vec3(0.55, 0.30, 0.78);
        vec3 terrainColor = mix(lowTone, midTone, tone);
        terrainColor = mix(terrainColor, highTone, smoothstep(0.68, 1.0, depth));
        terrainColor = mix(terrainColor, slopeTone, slope * 0.16);
        float alphaCurve = depth * depth;
        float alpha = mix(1.12, 0.74, alphaCurve);
        gl_FragColor = vec4(terrainColor, uTileAlpha * alpha * fade);
      } else {
        gl_FragColor = vec4(0.68, 1.00, 0.42, uLineAlpha * fade);
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
  gl.disable(gl.DITHER);
  gl.clearDepth(1.0);
  gl.clearColor(0.02, 0.023, 0.021, 1);

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
      vec3 baseTint = vec3(0.14, 0.32, 0.28);
      vec3 highlightTint = vec3(0.86, 1.00, 0.46);
      vec3 tone = baseTint * (ambient + 0.55 * diff) + highlightTint * (gloss * 0.42) + vec3(rim * 0.08);
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

  const marbleTerms = projectMarbleScreenTerms(
    marblePoint.x,
    marblePoint.z,
    h,
    state.rotation,
    state.pitch,
    worldProjection.cameraScale,
    worldProjection.ySlopeScale,
    null
  );
  const radius = marbleTerms.radius;
  const contactScreenX = (width() * 0.5 + worldProjection.xOffset + marbleTerms.xTerm) * dpr;
  const contactScreenY = (height() * worldProjection.yOffset + marbleTerms.yTerm) * dpr;
  const shadowRadius = radius * 1.4;
  const opacity = 1;
  const targetScreenX = contactScreenX;
  const targetScreenY = contactScreenY;

  const targetDepth = marbleTerms.depth;

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

function clearWorldCanvas() {
  if (!gl) return;
  gl.clearColor(0.015, 0.017, 0.016, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function shortCanvasLabel(value, max = 22) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}.` : text;
}

function roundRectPath(x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function sceneObjectColors(object) {
  if (object.kind === 'shock') {
    return object.active
      ? { edge: '#ff806f', fill: 'rgba(70, 14, 12, 0.78)', text: '#ffd0c7', bar: '#ff806f' }
      : { edge: '#f6c85f', fill: 'rgba(54, 42, 12, 0.68)', text: '#ffe29d', bar: '#f6c85f' };
  }
  if (object.kind === 'resource') {
    return object.state === 'low'
      ? { edge: '#f6c85f', fill: 'rgba(36, 30, 10, 0.78)', text: '#fff0b5', bar: '#f6c85f' }
      : { edge: '#6be0c3', fill: 'rgba(6, 37, 32, 0.78)', text: '#d7fff4', bar: '#6be0c3' };
  }
  return object.state === 'strained'
    ? { edge: '#ff806f', fill: 'rgba(58, 15, 13, 0.78)', text: '#ffd0c7', bar: '#ff806f' }
    : { edge: '#d7ff6f', fill: 'rgba(23, 32, 10, 0.78)', text: '#f3f3ec', bar: '#d7ff6f' };
}

function objectIsHighlighted(object) {
  return Boolean(
    object &&
      object.id &&
      Array.isArray(scenarioApp.highlightObjectIds) &&
      scenarioApp.highlightObjectIds.includes(String(object.id))
  );
}

function sceneObjectPoint(object, index, total) {
  const base = simulationPoints[object.axis] || simulationPoints.setup;
  const safeTotal = Math.max(1, total);
  const phaseByKind = object.kind === 'resource' ? 0.58 : object.kind === 'shock' ? 1.05 : 0.12;
  const radiusByKind = object.kind === 'shock' ? 0.42 : object.kind === 'resource' ? 0.86 : 0.78;
  const displayRun = typeof getDisplayRun === 'function' ? getDisplayRun() : scenarioApp.run;
  const angle = phaseByKind + (index / safeTotal) * Math.PI * 2 + (displayRun ? displayRun.tick * 0.02 : 0);
  return {
    x: base.x + Math.cos(angle) * radiusByKind,
    z: base.z + Math.sin(angle) * radiusByKind,
  };
}

function sceneObjectScreenSlot(object, index, total) {
  const isWide = width() >= 900;
  const leftReserve = isWide ? 462 : 12;
  const rightReserve = isWide ? 18 : 12;
  const available = Math.max(320, width() - leftReserve - rightReserve);
  const rowGap = isWide ? 62 : 56;
  const top = isWide ? Math.max(175, height() * 0.22) : Math.max(330, height() * 0.62);
  const kind = object.kind || 'actor';

  if (kind === 'shock') {
    const spread = Math.min(0.34, 0.12 * Math.max(1, total - 1));
    const start = 0.26 - spread * 0.5;
    return {
      x: leftReserve + available * (start + index * 0.16),
      y: top + 36,
    };
  }

  if (kind === 'resource') {
    return {
      x: leftReserve + available * 0.57,
      y: top + 128 + index * rowGap,
    };
  }

  return {
    x: leftReserve + available * 0.28,
    y: top + 128 + index * rowGap,
  };
}

function clampSceneScreen(point) {
  const cardHalfW = 76;
  const cardHalfH = 27;
  const leftReserve = width() >= 900 ? 462 : 12;
  let x = clamp(point.x, leftReserve + cardHalfW, width() - cardHalfW - 14);
  let y = clamp(point.y, 28 + cardHalfH, height() - cardHalfH - 18);
  if (width() >= 900 && x > width() - 460 && y > height() - 250) {
    y = Math.min(y, height() - 280);
  }
  return { x, y };
}

function layoutSceneObjects(sceneObjects) {
  const groups = sceneObjects.reduce((acc, object) => {
    if (!acc[object.kind]) acc[object.kind] = [];
    acc[object.kind].push(object);
    return acc;
  }, {});
  const seen = {};
  return sceneObjects.map((object) => {
    const group = groups[object.kind] || sceneObjects;
    const index = seen[object.kind] || 0;
    seen[object.kind] = index + 1;
    const worldPoint = sceneObjectPoint(object, index, group.length);
    const h = fieldHeightStatic(worldPoint.x, worldPoint.z);
    const projected = toScreen(worldPoint.x, worldPoint.z, h);
    const slot = sceneObjectScreenSlot(object, index, group.length);
    return {
      object,
      worldPoint,
      screen: clampSceneScreen(slot),
      rawScreen: projected,
    };
  });
}

function drawLineBetween(a, b, color, alpha, widthPx = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = widthPx;
  ctx.beginPath();
  ctx.moveTo(a.screen.x, a.screen.y);
  ctx.lineTo(b.screen.x, b.screen.y);
  ctx.stroke();
  ctx.restore();
}

function drawSceneObjectLinks(items) {
  const actors = items.filter((item) => item.object.kind === 'actor');
  const resources = items.filter((item) => item.object.kind === 'resource');
  const shocks = items.filter((item) => item.object.kind === 'shock' && item.object.active);
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.006);

  actors.forEach((actor, index) => {
    if (!resources.length) return;
    const resource = resources[index % resources.length];
    const color = actor.object.state === 'strained' ? '#ff806f' : '#6be0c3';
    drawLineBetween(resource, actor, color, 0.2, 1);
  });

  shocks.forEach((shock) => {
    actors.slice(0, 3).forEach((actor) => drawLineBetween(shock, actor, '#ff806f', 0.16 + pulse * 0.12, 1.4));
    resources.slice(0, 2).forEach((resource) => drawLineBetween(shock, resource, '#f6c85f', 0.13 + pulse * 0.1, 1.2));
  });
}

function drawEffectWave(x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color.replace('ALPHA', String(alpha)));
  gradient.addColorStop(1, color.replace('ALPHA', '0'));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawScenarioEffects(run, items) {
  const effects = run && run.map && run.map.effects ? run.map.effects : null;
  if (!effects) return;

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
  const actors = items.filter((item) => item.object.kind === 'actor');
  const resources = items.filter((item) => item.object.kind === 'resource');
  const shocks = items.filter((item) => item.object.kind === 'shock');
  const activeShocks = shocks.filter((item) => item.object.active);
  const allTargets = activeShocks.length ? activeShocks : shocks;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (effects.kind === 'transit-heat') {
    allTargets.forEach((item, index) => {
      const radius = 74 + effects.load * 70 + pulse * 20 + index * 9;
      drawEffectWave(item.screen.x, item.screen.y, radius, 'rgba(255, 111, 72, ALPHA)', 0.18);
    });

    ctx.strokeStyle = `rgba(107, 224, 195, ${0.24 + (1 - effects.coverageGap) * 0.34})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    [...resources, ...actors].slice(0, 6).forEach((item, index) => {
      if (index === 0) ctx.moveTo(item.screen.x, item.screen.y);
      else ctx.lineTo(item.screen.x, item.screen.y);
    });
    ctx.stroke();

    ctx.setLineDash([10, 9]);
    ctx.strokeStyle = `rgba(255, 128, 111, ${0.16 + effects.coverageGap * 0.32})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (effects.kind === 'housing') {
    actors.slice(0, 4).forEach((item, index) => {
      const stress = clamp01(Number(item.object.value || 0));
      const x = item.screen.x - 38 + index * 4;
      const y = item.screen.y + 38;
      ctx.fillStyle = `rgba(246, 200, 95, ${0.12 + stress * 0.22})`;
      ctx.fillRect(x, y, 24, 38);
      ctx.strokeStyle = `rgba(246, 200, 95, ${0.24 + stress * 0.34})`;
      ctx.strokeRect(x, y, 24, 38);
    });
    allTargets.forEach((item) => {
      drawEffectWave(item.screen.x, item.screen.y, 70 + effects.load * 60, 'rgba(255, 128, 111, ALPHA)', 0.13);
    });
  } else if (effects.kind === 'power') {
    const nodes = [...resources, ...actors].slice(0, 7);
    nodes.forEach((item, index) => {
      const next = nodes[(index + 1) % nodes.length];
      if (!next) return;
      const unstable = effects.coverageGap + effects.load * 0.45;
      ctx.strokeStyle = `rgba(246, 200, 95, ${0.18 + unstable * 0.34})`;
      ctx.lineWidth = 2 + pulse * unstable * 2;
      ctx.beginPath();
      ctx.moveTo(item.screen.x, item.screen.y);
      ctx.lineTo(next.screen.x, next.screen.y);
      ctx.stroke();
    });
    allTargets.forEach((item) => {
      drawGlyph('power', item.screen.x - 13, item.screen.y - 44, '#f6c85f');
    });
  } else if (effects.kind === 'supply') {
    const path = [...resources, ...actors].slice(0, 7);
    ctx.strokeStyle = `rgba(107, 224, 195, ${0.16 + (1 - effects.coverageGap) * 0.3})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    path.forEach((item, index) => {
      if (index === 0) ctx.moveTo(item.screen.x, item.screen.y);
      else ctx.lineTo(item.screen.x, item.screen.y);
    });
    ctx.stroke();
    path.forEach((item, index) => {
      const offset = ((performance.now() * 0.018 + index * 21) % 36) - 18;
      ctx.strokeStyle = '#f6c85f';
      ctx.strokeRect(item.screen.x - 7 + offset * 0.12, item.screen.y - 47, 14, 11);
    });
  } else if (effects.kind === 'agents') {
    const nodes = [...actors, ...resources].slice(0, 8);
    nodes.forEach((item, index) => {
      nodes.slice(index + 1).forEach((next) => {
        const trust = 1 - effects.trustGap;
        ctx.strokeStyle = `rgba(215, 255, 111, ${0.08 + trust * 0.16})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(item.screen.x, item.screen.y);
        ctx.lineTo(next.screen.x, next.screen.y);
        ctx.stroke();
      });
    });
    allTargets.forEach((item) => {
      drawEffectWave(item.screen.x, item.screen.y, 58 + effects.load * 52, 'rgba(255, 128, 111, ALPHA)', 0.12);
    });
  } else {
    allTargets.forEach((item) => {
      drawEffectWave(item.screen.x, item.screen.y, 62 + effects.load * 60, 'rgba(255, 128, 111, ALPHA)', 0.11);
    });
  }

  ctx.restore();
}

function glyphTypeForObject(object) {
  const text = `${object.label || ''} ${object.sublabel || ''}`.toLowerCase();
  if (object.kind === 'shock') return text.includes('heat') ? 'heat' : 'shock';
  if (/bus|transit|rider|driver|commute|shuttle/.test(text)) return 'bus';
  if (/cooling|heat/.test(text)) return 'heat';
  if (/hospital|health|emergency/.test(text)) return 'hospital';
  if (/battery|power|grid|energy|utility|generation/.test(text)) return 'power';
  if (/house|housing|unit|rent|shelter|resident/.test(text)) return 'house';
  if (/warehouse|inventory|supply|port|transport|factory|retail/.test(text)) return 'box';
  if (/agent|auditor|policy|planner|seller|buyer/.test(text)) return 'agent';
  return object.kind === 'resource' ? 'box' : 'building';
}

function drawGlyph(type, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;

  if (type === 'bus') {
    roundRectPath(x, y + 5, 25, 14, 3);
    ctx.stroke();
    ctx.fillRect(x + 5, y + 8, 5, 4);
    ctx.fillRect(x + 13, y + 8, 5, 4);
    ctx.beginPath();
    ctx.arc(x + 7, y + 21, 2, 0, Math.PI * 2);
    ctx.arc(x + 19, y + 21, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'heat') {
    ctx.beginPath();
    ctx.arc(x + 13, y + 13, 6, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + 13 + Math.cos(a) * 9, y + 13 + Math.sin(a) * 9);
      ctx.lineTo(x + 13 + Math.cos(a) * 12, y + 13 + Math.sin(a) * 12);
      ctx.stroke();
    }
  } else if (type === 'hospital') {
    ctx.strokeRect(x + 4, y + 4, 18, 20);
    ctx.beginPath();
    ctx.moveTo(x + 13, y + 8);
    ctx.lineTo(x + 13, y + 20);
    ctx.moveTo(x + 7, y + 14);
    ctx.lineTo(x + 19, y + 14);
    ctx.stroke();
  } else if (type === 'power') {
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 2);
    ctx.lineTo(x + 7, y + 15);
    ctx.lineTo(x + 15, y + 15);
    ctx.lineTo(x + 10, y + 26);
    ctx.lineTo(x + 22, y + 10);
    ctx.lineTo(x + 14, y + 10);
    ctx.closePath();
    ctx.stroke();
  } else if (type === 'house') {
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 13);
    ctx.lineTo(x + 13, y + 4);
    ctx.lineTo(x + 23, y + 13);
    ctx.stroke();
    ctx.strokeRect(x + 6, y + 13, 14, 12);
  } else if (type === 'agent') {
    const nodes = [
      [x + 7, y + 8],
      [x + 19, y + 10],
      [x + 12, y + 22],
    ];
    ctx.beginPath();
    ctx.moveTo(nodes[0][0], nodes[0][1]);
    ctx.lineTo(nodes[1][0], nodes[1][1]);
    ctx.lineTo(nodes[2][0], nodes[2][1]);
    ctx.closePath();
    ctx.stroke();
    nodes.forEach(([nx, ny]) => {
      ctx.beginPath();
      ctx.arc(nx, ny, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (type === 'shock') {
    ctx.beginPath();
    ctx.moveTo(x + 13, y + 3);
    ctx.lineTo(x + 24, y + 24);
    ctx.lineTo(x + 2, y + 24);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 13, y + 9);
    ctx.lineTo(x + 13, y + 17);
    ctx.moveTo(x + 13, y + 21);
    ctx.lineTo(x + 13, y + 22);
    ctx.stroke();
  } else {
    ctx.strokeRect(x + 4, y + 8, 18, 16);
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 8);
    ctx.lineTo(x + 10, y + 3);
    ctx.lineTo(x + 22, y + 8);
    ctx.moveTo(x + 9, y + 13);
    ctx.lineTo(x + 17, y + 13);
    ctx.moveTo(x + 9, y + 18);
    ctx.lineTo(x + 17, y + 18);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSceneObjectCard(item) {
  const { object, screen } = item;
  const colors = sceneObjectColors(object);
  const value = clamp01(Number(object.value || 0));
  const kind = String(object.kind || 'item').toUpperCase();
  const title = shortCanvasLabel(object.label, 22);
  const sub = shortCanvasLabel(object.valueLabel || object.sublabel || '', 22);
  const x = Math.round(screen.x - 70);
  const y = Math.round(screen.y - 16);

  if (object.kind === 'shock' && object.active) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.007);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 35 + pulse * 18, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 128, 111, ${0.18 + pulse * 0.18})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (objectIsHighlighted(object)) {
    const pulse = 0.45 + 0.55 * Math.sin(performance.now() * 0.01);
    ctx.save();
    ctx.strokeStyle = `rgba(215, 255, 111, ${0.48 + pulse * 0.3})`;
    ctx.lineWidth = 2.4;
    roundRectPath(x - 8, y - 8, 156, 60, 8);
    ctx.stroke();
    ctx.restore();
  }

  drawGlyph(glyphTypeForObject(object), x, y + 2, colors.edge);

  ctx.font = '9px "SF Mono", "Menlo", "Consolas", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colors.edge;
  ctx.fillText(kind, x + 34, y + 1);

  ctx.font = '11px "SF Mono", "Menlo", "Consolas", monospace';
  ctx.fillStyle = colors.text;
  ctx.fillText(title, x + 34, y + 13);

  ctx.font = '9px "SF Mono", "Menlo", "Consolas", monospace';
  ctx.fillStyle = 'rgba(243, 243, 236, 0.62)';
  ctx.fillText(sub, x + 34, y + 27);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(x + 34, y + 41, 104, 2);
  ctx.fillStyle = colors.bar;
  ctx.fillRect(x + 34, y + 41, 104 * value, 2);
}

function boardMetricsArea() {
  const isWide = width() >= 900;
  const leftReserve = isWide ? 462 : 12;
  const rightReserve = isWide ? 18 : 12;
  const available = Math.max(320, width() - leftReserve - rightReserve);
  const top = isWide ? Math.max(175, height() * 0.22) : Math.max(330, height() * 0.62);
  return {
    x: leftReserve + available * (isWide ? 0.77 : 0.74),
    y: top + 102,
    w: Math.min(isWide ? 190 : 82, available * 0.22),
  };
}

function drawBoardBackdrop(run) {
  const isWide = width() >= 900;
  const leftReserve = isWide ? 462 : 12;
  const rightReserve = isWide ? 18 : 12;
  const available = Math.max(320, width() - leftReserve - rightReserve);
  const top = isWide ? Math.max(155, height() * 0.19) : Math.max(322, height() * 0.6);
  const lanes = [
    ['shocks', 0.08, 0.26, '#ff806f'],
    ['actors', 0.27, 0.50, '#d7ff6f'],
    ['resources', 0.51, 0.73, '#6be0c3'],
    ['signals', 0.74, 0.96, '#f6c85f'],
  ];

  ctx.save();
  ctx.fillStyle = 'rgba(7, 16, 14, 0.58)';
  ctx.fillRect(0, 0, width(), height());

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.lineWidth = 1;
  for (let x = leftReserve; x < width(); x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height());
    ctx.stroke();
  }
  for (let y = 0; y < height(); y += 36) {
    ctx.beginPath();
    ctx.moveTo(leftReserve, y);
    ctx.lineTo(width(), y);
    ctx.stroke();
  }

  lanes.forEach(([label, start, end, color]) => {
    const x = leftReserve + available * start;
    const laneW = Math.max(isWide ? 80 : 58, available * (end - start));
    const bottom = Math.min(height() - 20, top + 430);
    ctx.fillStyle = `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.035)`;
    ctx.fillRect(x, top + 26, laneW, bottom - top - 28);
    ctx.strokeStyle = `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.18)`;
    ctx.strokeRect(x, top + 26, laneW, bottom - top - 28);
    ctx.font = '10px "SF Mono", "Menlo", "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(label.toUpperCase(), x + 10, top + 10);
  });

  if (isWide && run && run.scenario) {
    ctx.font = '12px "SF Mono", "Menlo", "Consolas", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(243, 243, 236, 0.78)';
    ctx.fillText(shortCanvasLabel(run.scenario.title, 46), leftReserve + 22, top - 30);
  }

  ctx.restore();
}

function drawSignalBars(hotspots) {
  const area = boardMetricsArea();
  ctx.save();
  ctx.font = '10px "SF Mono", "Menlo", "Consolas", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  hotspots.slice(0, 4).forEach((hotspot, index) => {
    const y = area.y + index * 42;
    const intensity = clamp01(Number(hotspot.intensity || 0));
    const isSupport = hotspot.polarity === 'support';
    const color = isSupport ? '#6be0c3' : '#ff806f';
    const label = shortCanvasLabel(hotspot.label || ScenarioEngine.AXIS_LABELS[hotspot.axis] || hotspot.axis, 20);

    ctx.fillStyle = color;
    ctx.fillText(label.toUpperCase(), area.x, y);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(area.x, y + 17, area.w, 2);
    ctx.fillStyle = color;
    ctx.fillRect(area.x, y + 17, area.w * intensity, 2);
  });

  ctx.restore();
}

function drawSimulationLayer() {
  const run = typeof getDisplayRun === 'function' ? getDisplayRun() : scenarioApp.run;
  if (!run || !run.map) return;

  const hotspots = Array.isArray(run.map.hotspots) ? run.map.hotspots : [];
  const sceneObjects = Array.isArray(run.map.sceneObjects)
    ? run.map.sceneObjects
    : (Array.isArray(run.map.markers) ? run.map.markers.map((marker) => ({
        id: marker.id,
        kind: 'actor',
        label: marker.label,
        axis: marker.axis,
        value: marker.pressure,
        valueLabel: `pressure ${Math.round((marker.pressure || 0) * 100)}`,
        state: marker.pressure > 0.62 ? 'strained' : 'active',
      })) : []);

  ctx.save();
  const items = layoutSceneObjects(sceneObjects);
  if (typeof syncParticleField === 'function') {
    syncParticleField(run, items);
  }
  drawScenarioEffects(run, items);
  drawSceneObjectLinks(items);
  items.forEach(drawSceneObjectCard);
  drawSignalBars(hotspots);
  ctx.restore();
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.strokeStyle = '#d7ff6f';
    ctx.lineWidth = 1.4;
    ctx.fillRect(p.x - rectWidth * 0.5, p.y - rectHeight * 0.5, rectWidth, rectHeight);
    ctx.strokeRect(p.x - rectWidth * 0.5, p.y - rectHeight * 0.5, rectWidth, rectHeight);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.lineWidth = 0.9;
    ctx.strokeText(text, p.x, p.y);

    ctx.fillStyle = '#f3f3ec';
    ctx.fillText(text, p.x, p.y);
  }
}

function render() {
  const displayRun = typeof getDisplayRun === 'function' ? getDisplayRun() : scenarioApp.run;
  ctx.clearRect(0, 0, width(), height());
  clearWorldCanvas();
  drawBoardBackdrop(displayRun);
  drawSimulationLayer();
}

function tick(now) {
  const dt = Math.min(0.05, (now - state.lastT) / 1000 || 0.016);
  state.lastT = now;
  state.frameDt = dt;
  const nowSec = now * 0.001;
  terrainPerturbationTimeSec = nowSec;
  const transitioning = typeof updateRunTransition === 'function' && updateRunTransition(now);

  if (scenarioApp.running && scenarioApp.run) {
    scenarioApp.stepCarry += dt * scenarioApp.runRate;
    if (scenarioApp.stepCarry >= 1) {
      scenarioApp.stepCarry = 0;
      advanceScenarioStep();
    }
  }

  if (transitioning) {
    updateScenarioMetrics();
    renderModelSpec();
    renderReplay();
    renderRoomState();
  }
  clearExpiredHighlight();
  render();
  if (typeof renderParticleField === 'function') {
    renderParticleField(dt);
  }
  requestAnimationFrame(tick);
}

let simulatteWorldStarted = false;

function startSimulatteWorld() {
  if (simulatteWorldStarted) {
    return;
  }
  simulatteWorldStarted = true;

  bindScenarioControls();

  if (window.SimulatteParticleField && particleCanvas) {
    scenarioApp.particleField = window.SimulatteParticleField.create(particleCanvas, { count: 620 });
    if (particleStateEl) {
      particleStateEl.textContent = scenarioApp.particleField.status;
    }
  }

  if (jitterBtn) jitterBtn.addEventListener('click', jitter);
  if (resetBtn) resetBtn.addEventListener('click', reset);
  if (mainResetBtn) mainResetBtn.addEventListener('click', reset);

  window.addEventListener('resize', resize);

  resize();
  reset();
  if (!loadSavedScenario()) {
    createScenarioFromPrompt(scenarioPromptEl ? scenarioPromptEl.value : '');
  }
  requestAnimationFrame(tick);
}

window.SimulatteWorldRuntime = {
  start: startSimulatteWorld,
  isStarted: () => simulatteWorldStarted,
};
