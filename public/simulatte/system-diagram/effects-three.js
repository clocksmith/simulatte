import * as THREE from './vendor/three/three.module.js';
import './effects-model.js';

// Optional three.js layer for Lucyd run effects. SVG keeps parts, ports, labels and hit-testing;
// this layer draws traffic, connection flow and failure effects beneath them from the same run view.
const M = globalThis.SimulatteSystemDiagramEffectsModel;
if (!M) throw Error('Effects layer requires effects-model.js');

const PARTICLE_VERTEX = `
attribute vec3 tint; attribute float size; attribute float alpha; attribute float shape;
uniform float pixelRatio;
varying vec3 vTint; varying float vAlpha; varying float vShape;
void main() { vTint = tint; vAlpha = alpha; vShape = shape; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pixelRatio; }`;
const PARTICLE_FRAGMENT = `
uniform float glow;
varying vec3 vTint; varying float vAlpha; varying float vShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  float core = vShape < 0.5 ? smoothstep(0.5, 0.38, r) : smoothstep(0.14, 0.04, abs(r - 0.4));
  float halo = glow * exp(-r * r * 5.0) * 0.55;
  gl_FragColor = vec4(vTint, clamp(core + halo, 0.0, 1.0) * vAlpha);
}`;
const FLOW_VERTEX = `
attribute float along; attribute float side; varying float vAlong; varying float vSide;
void main() { vAlong = along; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FLOW_FRAGMENT = `
uniform vec3 color; uniform float phase; uniform float spacing; uniform float opacity; uniform float pulse; uniform float simTime;
varying float vAlong; varying float vSide;
void main() {
  float s = abs(vSide);
  float core = smoothstep(0.32, 0.08, s), glow = exp(-s * s * 5.0);
  float f = fract((vAlong - phase) / spacing);
  float bead = smoothstep(0.0, 0.06, f) * smoothstep(0.28, 0.1, f);
  float beat = mix(1.0, 0.5 + 0.5 * sin(simTime * 9.0), pulse);
  gl_FragColor = vec4(color, opacity * beat * (0.18 * glow + core * (0.2 + 0.8 * bead) + 0.35 * glow * bead));
}`;
const GLOW_VERTEX = `
attribute vec4 data; attribute vec2 boxSize; varying vec2 vUv; varying vec4 vData; varying vec2 vBox;
void main() { vUv = uv; vData = data; vBox = boxSize; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
// data = (queue strength, fault flag, pulse age 0..1 or -1, unused); the node box fills the inner margin of the quad.
const GLOW_FRAGMENT = `
uniform vec3 queueColor; uniform vec3 dangerColor; uniform float margin; uniform float simTime;
varying vec2 vUv; varying vec4 vData; varying vec2 vBox;
float boxDistance(vec2 p, vec2 halfSize) { vec2 d = abs(p) - halfSize; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 p = (vUv - 0.5) * (vBox + 2.0 * margin);
  float d = boxDistance(p, vBox * 0.5 - 6.0) - 6.0;
  if (d < 0.0) discard;
  float queue = vData.x * exp(-d / 14.0) * 0.55;
  float fault = vData.y * exp(-d / 10.0) * (0.45 + 0.35 * sin(simTime * 9.0));
  float age = vData.z, ring = 0.0;
  if (age >= 0.0) ring = (1.0 - age) * smoothstep(5.0, 0.0, abs(d - age * margin));
  vec3 color = mix(queueColor, dangerColor, clamp((fault + ring) / max(queue + fault + ring, 0.0001), 0.0, 1.0));
  gl_FragColor = vec4(color, clamp(queue + fault + ring, 0.0, 1.0));
}`;

function cssColor(element, name) {
  return M.parseColor(element.ownerDocument.defaultView.getComputedStyle(element).getPropertyValue(name));
}

export function create({host, svg, sampleFor, nodeBox, getView, config, onFail = () => {}}) {
  const win = host.ownerDocument.defaultView;
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: 'high-performance'});
  if (!renderer.capabilities.isWebGL2) { renderer.dispose(); throw Error('WebGL2 is unavailable'); }
  const canvas = renderer.domElement;
  canvas.className = 'sd-effects-canvas'; canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, svg);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  let palette, dark;
  const blending = () => dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  function readPalette() {
    palette = {request: cssColor(host, '--sd-payload-request'), message: cssColor(host, '--sd-payload-message'), language: cssColor(host, '--sd-payload-language'),
      danger: cssColor(host, '--wui-danger'), flow: cssColor(host, '--sd-series-1'), warn: cssColor(host, '--sd-warn')};
    dark = M.luminance(cssColor(host, '--wui-paper')) < 0.5;
  }
  readPalette();

  const limit = config.engine.transitRenderLimit, buffers = M.particleBuffers(limit), particleGeometry = new THREE.BufferGeometry();
  for (const [name, array, width] of [['position', buffers.position, 3], ['tint', buffers.tint, 3], ['size', buffers.size, 1], ['alpha', buffers.alpha, 1], ['shape', buffers.shape, 1]]) {
    particleGeometry.setAttribute(name, new THREE.BufferAttribute(array, width).setUsage(THREE.DynamicDrawUsage));
  }
  const particleMaterial = new THREE.ShaderMaterial({vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT, transparent: true, depthTest: false, depthWrite: false,
    uniforms: {pixelRatio: {value: 1}, glow: {value: 1}}, blending: blending()});
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.frustumCulled = false; particles.renderOrder = 2; scene.add(particles);

  const flows = new Map(); // edgeId -> {mesh, key}
  function flowMesh(flow) {
    const r = M.ribbon(flow.sample, flow.halfWidth), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
    geometry.setAttribute('along', new THREE.BufferAttribute(r.along, 1));
    geometry.setAttribute('side', new THREE.BufferAttribute(r.side, 1));
    geometry.setIndex(r.index);
    const material = new THREE.ShaderMaterial({vertexShader: FLOW_VERTEX, fragmentShader: FLOW_FRAGMENT, transparent: true, depthTest: false, depthWrite: false, blending: blending(),
      uniforms: {color: {value: new THREE.Color()}, phase: {value: 0}, spacing: {value: flow.spacing}, opacity: {value: 0.6}, pulse: {value: 0}, simTime: {value: 0}}});
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 1;
    return mesh;
  }
  function syncFlows(view) {
    const seen = new Set();
    for (const flow of M.edgeFlows(view.edges, sampleFor)) {
      seen.add(flow.id);
      const key = `${flow.d}|${flow.halfWidth}`;
      let entry = flows.get(flow.id);
      if (!entry || entry.key !== key) { if (entry) { scene.remove(entry.mesh); entry.mesh.geometry.dispose(); entry.mesh.material.dispose(); } entry = {mesh: flowMesh(flow), key}; flows.set(flow.id, entry); scene.add(entry.mesh); }
      const u = entry.mesh.material.uniforms, error = flow.state === 'error' || flow.state === 'faulted';
      u.color.value.setRGB(...(error ? palette.danger : palette.flow));
      u.phase.value = view.t * flow.speed; u.simTime.value = view.t; u.pulse.value = flow.faulted ? 1 : 0; u.opacity.value = error ? 0.9 : 0.8;
      entry.mesh.visible = true;
    }
    for (const [id, entry] of flows) if (!seen.has(id)) { scene.remove(entry.mesh); entry.mesh.geometry.dispose(); entry.mesh.material.dispose(); flows.delete(id); }
  }

  const margin = M.PULSE.reach, glowCapacity = 256, quad = new THREE.PlaneGeometry(1, 1), glowData = new Float32Array(glowCapacity * 4), glowBox = new Float32Array(glowCapacity * 2);
  quad.setAttribute('data', new THREE.InstancedBufferAttribute(glowData, 4).setUsage(THREE.DynamicDrawUsage));
  quad.setAttribute('boxSize', new THREE.InstancedBufferAttribute(glowBox, 2).setUsage(THREE.DynamicDrawUsage));
  const glowMaterial = new THREE.ShaderMaterial({vertexShader: GLOW_VERTEX, fragmentShader: GLOW_FRAGMENT, transparent: true, depthTest: false, depthWrite: false, blending: blending(),
    uniforms: {queueColor: {value: new THREE.Color()}, dangerColor: {value: new THREE.Color()}, margin: {value: margin}, simTime: {value: 0}}});
  const glows = new THREE.InstancedMesh(quad, glowMaterial, glowCapacity);
  glows.frustumCulled = false; glows.renderOrder = 0; glows.count = 0; scene.add(glows);
  let previousNodes = null, previousTime = 0, pulses = [];
  const matrix = new THREE.Matrix4();
  function syncGlows(view) {
    if (previousNodes && view.t < previousTime) pulses = [];
    pulses = M.livePulses([...pulses, ...M.nodeEvents(previousNodes, view.nodes, view.t)], view.t);
    previousNodes = view.nodes; previousTime = view.t;
    const byId = new Map(M.nodeGlows(view.nodes).map(g => [g.id, {...g, age: -1}]));
    for (const pulse of pulses) { const g = byId.get(pulse.id) || {id: pulse.id, queue: 0, faulted: false, age: -1}; g.age = Math.max(g.age, M.pulseAge(pulse, view.t)); byId.set(pulse.id, g); }
    let n = 0;
    for (const g of byId.values()) {
      const box = nodeBox(g.id);
      if (!box || n >= glowCapacity) continue;
      matrix.makeScale(box.w + 2 * margin, box.h + 2 * margin, 1).setPosition(box.x + box.w / 2, -(box.y + box.h / 2), 0);
      glows.setMatrixAt(n, matrix);
      glowData.set([g.queue, g.faulted ? 1 : 0, g.age, 0], n * 4); glowBox.set([box.w, box.h], n * 2); n++;
    }
    glows.count = n; glows.instanceMatrix.needsUpdate = true; quad.attributes.data.needsUpdate = true; quad.attributes.boxSize.needsUpdate = true;
    glowMaterial.uniforms.queueColor.value.setRGB(...palette.warn); glowMaterial.uniforms.dangerColor.value.setRGB(...palette.danger); glowMaterial.uniforms.simTime.value = view.t;
  }
  let view = null, frame = null, lost = false, drawn = '';
  function size() {
    const r = host.getBoundingClientRect(), ratio = Math.min(2, win.devicePixelRatio || 1);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    const s = renderer.getSize(new THREE.Vector2());
    if (s.x !== Math.round(r.width) || s.y !== Math.round(r.height)) renderer.setSize(Math.round(r.width), Math.round(r.height), false);
    particleMaterial.uniforms.pixelRatio.value = ratio;
    return r;
  }
  function draw() {
    frame = null;
    if (lost || !view) return;
    const r = size(), v = getView(), key = `${v.x}|${v.y}|${v.zoom}|${r.width}|${r.height}|${view.t}|${view.transit?.length}`;
    camera.left = v.x; camera.right = v.x + r.width / v.zoom; camera.top = -v.y; camera.bottom = -(v.y + r.height / v.zoom); camera.updateProjectionMatrix();
    if (key !== drawn) {
      const count = M.writeParticles(buffers, {t: view.t, transit: view.transit, sampleFor, palette});
      particleGeometry.setDrawRange(0, count);
      for (const name of ['position', 'tint', 'size', 'alpha', 'shape']) particleGeometry.attributes[name].needsUpdate = true;
      host.dataset.effectsParticles = String(count);
    }
    drawn = key;
    renderer.render(scene, camera);
    frame = win.requestAnimationFrame(watch);
  }
  // Camera changes while paused still need a redraw; the watcher only renders when something moved.
  let lastCamera = '';
  function watch() {
    frame = null;
    if (lost || !view) return;
    const v = getView(), r = host.getBoundingClientRect(), key = `${v.x}|${v.y}|${v.zoom}|${r.width}|${r.height}`;
    if (key !== lastCamera) { lastCamera = key; draw(); return; }
    frame = win.requestAnimationFrame(watch);
  }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; if (frame) win.cancelAnimationFrame(frame); frame = null; onFail('WebGL context lost'); });
  const scheme = win.matchMedia('(prefers-color-scheme: dark)'), themeChanged = () => { readPalette(); for (const m of [particleMaterial, glowMaterial, ...[...flows.values()].map(e => e.mesh.material)]) { m.blending = blending(); m.needsUpdate = true; } drawn = ''; };
  scheme.addEventListener('change', themeChanged);
  const theme = new win.MutationObserver(themeChanged); theme.observe(host.ownerDocument.documentElement, {attributes: true, attributeFilter: ['data-theme']});

  return Object.freeze({
    render(next) {
      if (lost) return;
      view = next; syncFlows(view); syncGlows(view);
      if (frame) win.cancelAnimationFrame(frame);
      draw();
    },
    clear() {
      view = null; previousNodes = null; pulses = []; drawn = '';
      if (frame) win.cancelAnimationFrame(frame); frame = null;
      particleGeometry.setDrawRange(0, 0); glows.count = 0;
      for (const entry of flows.values()) entry.mesh.visible = false;
      if (!lost) renderer.render(scene, camera);
    },
    dispose() {
      if (frame) win.cancelAnimationFrame(frame); frame = null; view = null;
      scheme.removeEventListener('change', themeChanged); theme.disconnect();
      for (const entry of flows.values()) { entry.mesh.geometry.dispose(); entry.mesh.material.dispose(); }
      flows.clear(); particleGeometry.dispose(); particleMaterial.dispose(); quad.dispose(); glowMaterial.dispose(); renderer.dispose(); canvas.remove();
    },
  });
}
