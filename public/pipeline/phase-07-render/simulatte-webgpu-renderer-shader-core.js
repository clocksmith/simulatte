(function attachSimulatteWebGpuRendererShaderCore(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    scope.WEBGPU_SHADER_PARTS = scope.WEBGPU_SHADER_PARTS || [];
    scope.WEBGPU_SHADER_PARTS.push(`
const GPU_SCENE_INSTANCE_CAPACITY: i32 = ${GPU_SCENE_INSTANCE_CAPACITY};

struct Uniforms {
  viewport: vec4f,
  params: vec4f,
  motion: vec4f,
  loading: vec4f,
  palette0: vec4f,
  palette1: vec4f,
  palette2: vec4f,
  palette3: vec4f,
  features0: vec4f,
  features1: vec4f,
  features2: vec4f,
  features3: vec4f,
  features4: vec4f,
  features5: vec4f,
  features6: vec4f,
  features7: vec4f,
  features8: vec4f,
  features9: vec4f,
  features10: vec4f,
  features11: vec4f,
  atoms0: vec4f,
  atoms1: vec4f,
  atoms2: vec4f,
  atoms3: vec4f,
  atoms4: vec4f,
  atoms5: vec4f,
  sceneMix0: vec4f,
  sceneMix1: vec4f,
  sceneMix2: vec4f,
  sceneMix3: vec4f,
  visualIr0: vec4f,
  visualIr1: vec4f,
  visualIr2: vec4f,
  visualIr3: vec4f,
  visualIr4: vec4f,
  visualIr5: vec4f,
  sceneObj0: vec4f,
  sceneObj1: vec4f,
  sceneObj2: vec4f,
  sceneObj3: vec4f,
  sceneObj4: vec4f,
  sceneObj5: vec4f,
  sceneObj6: vec4f,
  sceneObj7: vec4f,
  sceneStyle0: vec4f,
  sceneStyle1: vec4f,
  sceneStyle2: vec4f,
  sceneStyle3: vec4f,
  sceneStyle4: vec4f,
  sceneStyle5: vec4f,
  sceneStyle6: vec4f,
  sceneStyle7: vec4f,
  sceneIdentity0: vec4f,
  sceneIdentity1: vec4f,
  sceneIdentity2: vec4f,
  sceneIdentity3: vec4f,
  sceneIdentity4: vec4f,
  sceneIdentity5: vec4f,
  sceneIdentity6: vec4f,
  sceneIdentity7: vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct SceneInstance {
  object: vec4f,
  style: vec4f,
  identity: vec4f,
};

@group(0) @binding(1) var<storage, read> visibleSceneInstances: array<SceneInstance>;
@group(0) @binding(2) var<storage, read> sceneStats: array<u32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VsOut;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  out.uv = pos[vertexIndex] * 0.5 + vec2f(0.5);
  return out;
}

fn stripe(v: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width, width + 0.012, abs(fract(v) - 0.5));
}

fn rot(p: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn featureAt(index: i32) -> f32 {
  if (index < 4) { return u.features0[index]; }
  if (index < 8) { return u.features1[index - 4]; }
  if (index < 12) { return u.features2[index - 8]; }
  if (index < 16) { return u.features3[index - 12]; }
  if (index < 20) { return u.features4[index - 16]; }
  if (index < 24) { return u.features5[index - 20]; }
  if (index < 28) { return u.features6[index - 24]; }
  if (index < 32) { return u.features7[index - 28]; }
  if (index < 36) { return u.features8[index - 32]; }
  if (index < 40) { return u.features9[index - 36]; }
  if (index < 44) { return u.features10[index - 40]; }
  if (index < 48) { return u.features11[index - 44]; }
  return 0.0;
}

fn atomAt(index: i32) -> f32 {
  if (index < 4) { return u.atoms0[index]; }
  if (index < 8) { return u.atoms1[index - 4]; }
  if (index < 12) { return u.atoms2[index - 8]; }
  if (index < 16) { return u.atoms3[index - 12]; }
  if (index < 20) { return u.atoms4[index - 16]; }
  return u.atoms5[index - 20];
}

fn sceneMixAt(index: i32) -> f32 {
  if (index < 4) { return u.sceneMix0[index]; }
  if (index < 8) { return u.sceneMix1[index - 4]; }
  if (index < 12) { return u.sceneMix2[index - 8]; }
  return u.sceneMix3[index - 12];
}

fn visualIrAt(index: i32) -> f32 {
  if (index < 4) { return u.visualIr0[index]; }
  if (index < 8) { return u.visualIr1[index - 4]; }
  if (index < 12) { return u.visualIr2[index - 8]; }
  if (index < 16) { return u.visualIr3[index - 12]; }
  if (index < 20) { return u.visualIr4[index - 16]; }
  return u.visualIr5[index - 20];
}

fn storageSceneInstanceCount() -> i32 {
  let rawCount = sceneStats[0];
  if (rawCount == 0u) { return 0; }
  return i32(min(rawCount, u32(GPU_SCENE_INSTANCE_CAPACITY)));
}

fn scenePacketDrawableSlotCount() -> i32 {
  let storageCount = storageSceneInstanceCount();
  if (storageCount > 0) { return storageCount; }
  return 8;
}

fn scenePacketUniformObjectAt(index: i32) -> vec4f {
  if (index < 0 || index > 7) { return vec4f(0.0); }
  if (index == 0) { return u.sceneObj0; }
  if (index == 1) { return u.sceneObj1; }
  if (index == 2) { return u.sceneObj2; }
  if (index == 3) { return u.sceneObj3; }
  if (index == 4) { return u.sceneObj4; }
  if (index == 5) { return u.sceneObj5; }
  if (index == 6) { return u.sceneObj6; }
  return u.sceneObj7;
}

fn scenePacketUniformStyleAt(index: i32) -> vec4f {
  if (index < 0 || index > 7) { return vec4f(0.0); }
  if (index == 0) { return u.sceneStyle0; }
  if (index == 1) { return u.sceneStyle1; }
  if (index == 2) { return u.sceneStyle2; }
  if (index == 3) { return u.sceneStyle3; }
  if (index == 4) { return u.sceneStyle4; }
  if (index == 5) { return u.sceneStyle5; }
  if (index == 6) { return u.sceneStyle6; }
  return u.sceneStyle7;
}

fn scenePacketUniformIdentityAt(index: i32) -> vec4f {
  if (index < 0 || index > 7) { return vec4f(0.0); }
  if (index == 0) { return u.sceneIdentity0; }
  if (index == 1) { return u.sceneIdentity1; }
  if (index == 2) { return u.sceneIdentity2; }
  if (index == 3) { return u.sceneIdentity3; }
  if (index == 4) { return u.sceneIdentity4; }
  if (index == 5) { return u.sceneIdentity5; }
  if (index == 6) { return u.sceneIdentity6; }
  return u.sceneIdentity7;
}

fn scenePacketObjectAt(index: i32) -> vec4f {
  let storageCount = storageSceneInstanceCount();
  if (storageCount > 0 && index >= 0 && index < storageCount) {
    return visibleSceneInstances[index].object;
  }
  return scenePacketUniformObjectAt(index);
}

fn scenePacketStyleAt(index: i32) -> vec4f {
  let storageCount = storageSceneInstanceCount();
  if (storageCount > 0 && index >= 0 && index < storageCount) {
    return visibleSceneInstances[index].style;
  }
  return scenePacketUniformStyleAt(index);
}

fn scenePacketIdentityAt(index: i32) -> vec4f {
  let storageCount = storageSceneInstanceCount();
  if (storageCount > 0 && index >= 0 && index < storageCount) {
    return visibleSceneInstances[index].identity;
  }
  return scenePacketUniformIdentityAt(index);
}

fn scenePacketStrength() -> f32 {
  var total = 0.0;
  let count = scenePacketDrawableSlotCount();
  for (var i = 0; i < GPU_SCENE_INSTANCE_CAPACITY; i = i + 1) {
    if (i >= count) { break; }
    let style = scenePacketStyleAt(i);
    if (style.x > 0.5) {
      total += clamp(style.w, 0.0, 1.0);
    }
  }
  return clamp(total / max(4.0, f32(count) * 0.45), 0.0, 1.0);
}

fn scenePacketLayerColor(layer: f32) -> vec3f {
  if (layer < 1.5) { return vec3f(0.62, 0.78, 0.42); }
  if (layer < 2.5) { return vec3f(0.06, 0.56, 0.95); }
  if (layer < 3.5) { return vec3f(0.12, 0.9, 1.0); }
  if (layer < 4.5) { return vec3f(0.12, 0.46, 1.0); }
  if (layer < 5.5) { return vec3f(0.18, 0.88, 1.0); }
  if (layer < 6.5) { return vec3f(0.94, 1.0, 0.76); }
  if (layer < 7.5) { return vec3f(0.42, 0.78, 1.0); }
  if (layer < 8.5) { return vec3f(0.12, 0.72, 1.0); }
  if (layer < 9.5) { return vec3f(1.0, 0.28, 0.08); }
  if (layer < 10.5) { return vec3f(1.0, 0.92, 0.64); }
  if (layer < 11.5) { return vec3f(0.16, 0.64, 1.0); }
  if (layer < 12.5) { return vec3f(0.72, 0.56, 0.34); }
  if (layer < 13.5) { return vec3f(0.94, 0.72, 0.38); }
  if (layer < 14.5) { return vec3f(0.72, 0.98, 0.86); }
  if (layer < 15.5) { return vec3f(0.9, 0.78, 0.48); }
  if (layer < 16.5) { return vec3f(1.0, 0.84, 0.18); }
  if (layer < 17.5) { return vec3f(0.96, 0.46, 1.0); }
  if (layer < 18.5) { return vec3f(1.0, 0.78, 0.22); }
  if (layer < 19.5) { return vec3f(0.88, 0.94, 1.0); }
  if (layer < 20.5) { return vec3f(0.96, 0.66, 0.22); }
  if (layer < 21.5) { return vec3f(0.9, 0.94, 1.0); }
  if (layer < 22.5) { return vec3f(0.52, 0.82, 1.0); }
  if (layer < 23.5) { return vec3f(0.8, 0.48, 1.0); }
  return vec3f(0.78, 0.92, 1.0);
}

fn scenePacketAnimalMask(local: vec2f, semantic: f32, slot: f32, t: f32) -> f32 {
  let head = vec2f(0.48, -0.04 + sin(t * 1.2 + slot) * 0.035);
  let body = capsuleLine(local, vec2f(-0.38, 0.02), vec2f(0.24, -0.01), 0.18);
  let headDisk = diskMask(local, head, select(0.118, 0.135, semantic < 1.5));
  let tail = capsuleLine(local, vec2f(-0.42, 0.02), vec2f(-0.76, -0.12 + sin(t * 1.8 + slot) * 0.1), 0.045);
  let legs = max(
    capsuleLine(local, vec2f(-0.18, 0.12), vec2f(-0.3, 0.38 + sin(t * 2.2 + slot) * 0.08), 0.034),
    capsuleLine(local, vec2f(0.14, 0.1), vec2f(0.28, 0.35 + cos(t * 2.1 + slot) * 0.07), 0.032)
  );
  let dogEar = max(
    capsuleLine(local, head + vec2f(-0.02, -0.1), head + vec2f(-0.1, -0.24), 0.036),
    capsuleLine(local, head + vec2f(0.04, -0.09), head + vec2f(0.0, -0.24), 0.034)
  );
  let catEar = max(
    smoothstep(0.16, 0.02, length((local - (head + vec2f(-0.055, -0.14))) * vec2f(1.0, 1.5))),
    smoothstep(0.16, 0.02, length((local - (head + vec2f(0.075, -0.14))) * vec2f(1.0, 1.5)))
  );
  let ears = select(catEar, dogEar, semantic < 1.5);
  return max(max(body, headDisk), max(tail, max(legs, ears)));
}

fn scenePacketObjectMask(p: vec2f, obj: vec4f, style: vec4f, identity: vec4f, slot: f32, t: f32) -> f32 {
  if (style.x <= 0.5 || style.w <= 0.01) { return 0.0; }
  let aspect = max(u.viewport.x / max(u.viewport.y, 1.0), 0.1);
  var center = vec2f((obj.x * 2.0 - 1.0) * aspect, (1.0 - obj.y) * 2.0 - 1.0);
  let anim = style.z;
  let amp = 0.025 + style.w * 0.035;
  if (anim < 1.5 && anim > 0.75) {
    center += vec2f(sin(t * 1.4 + slot) * amp * aspect, sin(t * 2.1 + slot * 0.7) * amp * 0.65);
  } else if (anim < 2.5 && anim > 1.5) {
    center += vec2f(sin(t * 0.52 + slot) * amp * 0.38 * aspect, cos(t * 0.47 + slot) * amp * 0.3);
  } else if (anim < 5.5 && anim > 4.5) {
    center += vec2f(fract(t * 0.12 + slot * 0.17) * 0.08 * aspect - 0.04 * aspect, 0.0);
  } else if (anim < 7.5 && anim > 6.5) {
    center += vec2f(sin(t * 0.34 + slot) * amp * 0.25 * aspect, amp * 0.35);
  } else if (anim > 7.5) {
    let a = t * 0.18 + slot;
    center += vec2f(cos(a) * amp * aspect, sin(a) * amp);
  }
  let halfSize = vec2f(max(obj.z * aspect, 0.018), max(obj.w, 0.018));
  let local = rot((p - center) / max(halfSize, vec2f(0.01)), -style.y);
  let layer = style.x;
  let semantic = identity.x;
  var mask = 0.0;
  if (semantic > 0.5 && semantic < 3.5) {
    mask = scenePacketAnimalMask(local, semantic, slot, t);
  } else if (semantic > 3.5 && semantic < 4.5) {
    mask = smoothstep(0.92, 0.52, length(local * vec2f(0.78, 1.26))) *
      (0.72 + 0.28 * stripe(local.y * 5.0 + sin(local.x * 3.0 + t * 0.55), 0.035));
  } else if (semantic > 4.5 && semantic < 6.5) {
    mask = smoothstep(1.0, 0.1, abs(local.x)) * smoothstep(-1.0, 0.9, local.y);
  } else if (semantic > 6.5 && semantic < 7.5) {
    mask = max(capsuleLine(local, vec2f(-0.68, 0.26), vec2f(0.08, -0.08), 0.12),
      capsuleLine(local, vec2f(0.08, -0.08), vec2f(0.62, 0.18), 0.09));
  } else if (semantic > 7.5 && semantic < 9.5) {
    mask = max(rectMask(local, vec2f(0.0), vec2f(0.8, 0.54)), stripe(local.y * 5.0 - t * 0.4, 0.04));
  } else if (semantic > 9.5 && semantic < 10.5) {
    mask = max(diskMask(local, vec2f(-0.5, -0.14), 0.16),
      max(diskMask(local, vec2f(0.18, 0.16), 0.17), capsuleLine(local, vec2f(-0.5, -0.14), vec2f(0.18, 0.16), 0.04)));
  } else if (semantic > 10.5 && semantic < 12.5) {
    mask = max(capsuleLine(local, vec2f(-0.72, -0.18), vec2f(0.68, 0.16), 0.1),
      ellipseRing(local, vec2f(0.08, 0.02), vec2f(1.1, 0.82), 0.46, 0.055));
  } else if (semantic > 12.5 && semantic < 13.5) {
    mask = max(rectMask(local, vec2f(0.0, 0.08), vec2f(0.82, 0.62)),
      rectMask(local, vec2f(-0.28, -0.48), vec2f(0.24, 0.18)));
  } else if (layer < 2.5 || (layer > 12.5 && layer < 14.5) || (layer > 17.5 && layer < 18.5) || (layer > 20.5 && layer < 21.5)) {
    mask = smoothstep(1.05, 0.78, length(local));
  } else if ((layer > 2.5 && layer < 3.5) || (layer > 4.5 && layer < 5.5)) {
    let body = max(ellipseRing(local, vec2f(0.0), vec2f(1.4, 0.82), 0.68, 0.08), rectMask(local, vec2f(0.0), vec2f(0.8, 0.2)));
    mask = body;
  } else if ((layer > 3.5 && layer < 4.5) || (layer > 10.5 && layer < 11.5)) {
    mask = max(diskMask(local, vec2f(0.0), 0.42), max(capsuleLine(local, vec2f(-0.86, -0.42), vec2f(0.0, 0.0), 0.08), capsuleLine(local, vec2f(0.0, 0.0), vec2f(0.82, 0.36), 0.08)));
  } else if ((layer > 5.5 && layer < 6.5) || (layer > 7.5 && layer < 8.5)) {
    mask = capsuleLine(local, vec2f(-0.92, -0.2), vec2f(0.92, 0.22 + sin(t * 0.6 + slot) * 0.18), 0.08);
  } else if (layer > 8.5 && layer < 10.5) {
    mask = max(smoothstep(1.0, 0.1, abs(local.x)) * smoothstep(-1.0, 0.85, local.y), stripe(local.y * 3.0 - t * 0.44, 0.04));
  } else {
    mask = max(rectMask(local, vec2f(0.0), vec2f(0.88, 0.56)), smoothstep(1.08, 0.88, length(local)));
  }
  let pulse = 0.74 + 0.26 * sin(t * (0.6 + anim * 0.09) + slot);
  return clamp(mask * style.w * pulse, 0.0, 1.0);
}

fn sceneRenderPacketScene(p: vec2f, t: f32, base: vec3f) -> vec3f {
  let strength = scenePacketStrength();
  if (strength <= 0.01) { return base; }
  let count = scenePacketDrawableSlotCount();
  var color = mix(base, u.palette2.rgb, strength * 0.08);
  for (var i = 0; i < GPU_SCENE_INSTANCE_CAPACITY; i = i + 1) {
    if (i >= count) { break; }
    let obj = scenePacketObjectAt(i);
    let style = scenePacketStyleAt(i);
    let identity = scenePacketIdentityAt(i);
    let slot = f32(i);
    let mask = scenePacketObjectMask(p, obj, style, identity, slot, t);
    var tone = scenePacketLayerColor(style.x);
    if (identity.x > 0.5 && identity.x < 1.5) {
      tone = vec3f(0.72, 0.52, 0.32);
    } else if (identity.x > 1.5 && identity.x < 2.5) {
      tone = vec3f(0.88, 0.78, 0.56);
    } else if (identity.x > 3.5 && identity.x < 4.5) {
      tone = vec3f(0.04, 0.58, 0.95);
    } else if (identity.x > 5.5 && identity.x < 6.5) {
      tone = vec3f(1.0, 0.24, 0.06);
    }
    let layer = style.x;
    if (layer > 1.5 && layer < 2.5) {
      let ripple = stripe(length((p - vec2f((obj.x * 2.0 - 1.0) * max(u.viewport.x / max(u.viewport.y, 1.0), 0.1), (1.0 - obj.y) * 2.0 - 1.0)) * vec2f(1.0, 0.72)) * 7.0 - t * 0.42, 0.035);
      color += tone * mask * 0.42 + vec3f(0.82, 1.0, 0.96) * ripple * mask * 0.18;
    } else if (layer > 3.5 && layer < 4.5) {
      color += tone * mask * 0.48 + vec3f(1.0, 0.78, 0.18) * mask * stripe((p.x + p.y) * 5.0 - t * 0.7, 0.034) * 0.22;
    } else if (layer > 12.5 && layer < 14.5) {
      color = mix(color, tone, mask * 0.34);
      color += vec3f(0.9, 1.0, 0.82) * mask * starParticleField(p + vec2f(slot * 0.03, t * 0.04), t, 0.12) * 0.16;
    } else {
      color = mix(color, tone, mask * 0.46);
      color += tone * mask * 0.18;
    }
  }
  return mix(base, color, clamp(0.36 + strength * 0.5, 0.0, 0.9));
}

fn sceneField(p: vec2f, t: f32, scene: f32) -> vec3f {
  let heat = u.params.x;
  let flow = u.params.y;
  let density = u.params.z;
  let bloom = u.params.w;
  let motion = u.motion.x;
  var color = mix(u.palette0.rgb, u.palette2.rgb, smoothstep(-0.9, 0.9, p.y));
  let rings = stripe(length(p) * (3.0 + density * 5.0) - t * (0.12 + motion * 0.26), 0.035);
  let waves = stripe(p.x * (3.0 + flow * 4.0) + sin(p.y * 4.0 + t) * 0.12, 0.04);
  let orbit = stripe(atan2(p.y, p.x) / 6.28318 * (5.0 + floor(scene % 7.0)) + length(p) * 1.2 - t * 0.12, 0.035);
  let plume = exp(-abs(p.x + sin(p.y * 4.0 + t * 0.8) * 0.12) * 8.0) * smoothstep(-0.9, 0.72, p.y);
  let grid = 0.0;
  let beam = exp(-abs(rot(p, 0.38 + sin(t * 0.2) * 0.16).y) * 42.0) * smoothstep(-0.8, 0.7, p.x);
  let branch = exp(-abs(sin(p.x * 7.0 + sin(p.y * 5.0 + t * 0.2))) * 5.0) * smoothstep(0.85, -0.4, length(p));
  let sceneGroup = floor(scene);
  let atomSpecific = clamp(max(max(max(atomAt(16), atomAt(7)), max(atomAt(10), atomAt(12))), max(max(atomAt(6), atomAt(9)), atomAt(4))), 0.0, 1.0);
  let commonGain = 1.0 - atomSpecific * 0.46;
  if (sceneGroup == 0.0) {
    color = mix(color, u.palette1.rgb, plume * (0.55 + heat * 0.45));
    color += u.palette3.rgb * rings * 0.18 * commonGain;
  } else if (sceneGroup == 1.0) {
    color = mix(color, u.palette1.rgb, waves * 0.42 + plume * 0.24);
    color += u.palette3.rgb * orbit * 0.16 * commonGain;
  } else if (sceneGroup == 2.0) {
    color = mix(color, u.palette1.rgb, max(waves, branch * 0.7) * 0.44);
    color += u.palette3.rgb * rings * 0.12 * commonGain;
  } else if (sceneGroup == 3.0) {
    let shaft = capsuleLine(p, vec2f(-0.68, -0.14), vec2f(0.62, 0.16), 0.07);
    let rotor = ellipseRing(p, vec2f(0.2, 0.04), vec2f(1.0, 1.0), 0.28, 0.035);
    let contact = stripe(atan2(p.y - 0.04, p.x - 0.2) * 5.0 - t * (0.2 + motion * 0.2), 0.036) * rotor;
    color = mix(color, u.palette2.rgb, 0.18);
    color += u.palette1.rgb * shaft * 0.46;
    color += u.palette3.rgb * max(rotor, contact) * (0.26 + motion * 0.24);
  } else if (sceneGroup == 4.0) {
    let flux = stripe(atan2(p.y, p.x) * 4.0 + length(p) * 3.1 - t * (0.16 + motion * 0.18), 0.034);
    let coil = ellipseRing(p, vec2f(-0.32, -0.05), vec2f(1.45, 0.8), 0.34, 0.045);
    let spikes = pow(max(0.0, sin(atan2(p.y, p.x) * 12.0 + t * 0.7)), 5.0) * smoothstep(0.74, 0.1, length(p));
    color = mix(color, u.palette2.rgb, 0.28);
    color += u.palette1.rgb * flux * (0.24 + bloom * 0.18);
    color += u.palette3.rgb * max(coil, spikes) * 0.5;
  } else if (sceneGroup == 5.0) {
    color = mix(color, u.palette1.rgb, beam * bloom);
    color += u.palette3.rgb * rings * 0.24 * commonGain;
  } else if (sceneGroup == 6.0) {
    let tube = smoothstep(0.34, 0.28, abs(p.y + sin(p.x * 3.8) * 0.04));
    let pressure = stripe(length((p - vec2f(-0.1, 0.0)) * vec2f(1.0, 0.68)) * 7.0 - t * (0.7 + motion * 0.45), 0.028);
    let nodes = stripe(p.x * 7.0 + sin(p.y * 4.0), 0.032) * tube;
    color = mix(color, u.palette2.rgb, 0.22);
    color += u.palette1.rgb * tube * 0.28;
    color += u.palette3.rgb * max(pressure, nodes) * (0.22 + bloom * 0.18);
  } else if (sceneGroup == 7.0 || sceneGroup == 13.0 || sceneGroup == 14.0) {
    color = mix(color, u.palette1.rgb, branch * 0.46);
    color += u.palette3.rgb * rings * 0.12 * commonGain;
  } else if (sceneGroup == 10.0) {
    color = mix(color, u.palette1.rgb, max(rings, orbit) * 0.54);
    color += u.palette3.rgb * exp(-length(p) * 4.0) * 0.26;
  } else if (sceneGroup == 11.0) {
    color = mix(color, u.palette1.rgb, grid * 0.42 + waves * 0.16);
    color += u.palette3.rgb * stripe((p.x + p.y) * 5.0 - t * 0.3, 0.026) * 0.18;
  } else if (sceneGroup == 16.0) {
    let bus = max(stripe(p.x * 7.0 + t * 0.08, 0.05), stripe(p.y * 4.0 - t * 0.05, 0.052));
    let pulse = stripe((p.x + p.y) * 5.0 - t * (0.55 + motion), 0.046);
    let nodeA = exp(-dot(p - vec2f(-0.58, -0.18), p - vec2f(-0.58, -0.18)) * 34.0);
    let nodeB = exp(-dot(p - vec2f(0.36, 0.12), p - vec2f(0.36, 0.12)) * 42.0);
    let nodeC = exp(-dot(p - vec2f(-0.08, 0.48), p - vec2f(-0.08, 0.48)) * 28.0);
    let overload = exp(-abs(length(p - vec2f(0.58, -0.36)) - 0.2) * 20.0);
    let voltageField = 0.5 + 0.5 * sin(p.x * 4.0 + t * 0.22) * cos(p.y * 5.0 - t * 0.18);
    color = mix(vec3f(0.035, 0.055, 0.07), vec3f(0.84, 0.62, 0.12), 0.16 + voltageField * 0.36);
    color = mix(color, vec3f(1.0, 0.82, 0.18), bus * 0.72 + nodeA * 0.78 + nodeB * 0.74 + nodeC * 0.64);
    color += vec3f(1.0, 0.1, 0.035) * (pulse * 0.42 + overload * (0.36 + heat * 0.44));
  } else if (sceneGroup == 17.0) {
    let conveyor = smoothstep(0.2, 0.16, abs(p.y + 0.46)) * max(stripe(p.x * 12.0 - t * 0.42, 0.04), 0.28);
    let shoulder = exp(-abs(length(p - vec2f(-0.36, -0.02)) - 0.28) * 28.0);
    let elbow = exp(-abs(length(p - vec2f(0.08, 0.0)) - 0.24) * 34.0);
    let gripper = exp(-dot(p - vec2f(0.46 + sin(t) * 0.05, -0.12), p - vec2f(0.46 + sin(t) * 0.05, -0.12)) * 58.0);
    color = mix(color, u.palette1.rgb, conveyor * 0.35 + shoulder * 0.34 + elbow * 0.3);
    color += u.palette3.rgb * (gripper * 0.42 + stripe(atan2(p.y + 0.02, p.x + 0.36) + t * 0.5, 0.04) * 0.14);
  } else if (sceneGroup == 18.0) {
    let belt = smoothstep(0.28, 0.2, abs(p.y + 0.42));
    let cadence = max(stripe(p.x * 8.0 - t * 0.28, 0.05), stripe((p.x + p.y) * 5.0, 0.03));
    let die = smoothstep(0.45, 0.0, abs(p.x + 0.18)) * smoothstep(0.26, 0.0, abs(p.y - 0.06));
    let cooling = exp(-abs(p.y - 0.18 - sin(p.x * 8.0 + t) * 0.04) * 16.0);
    color = mix(color, u.palette1.rgb, belt * 0.24 + die * 0.42 + cadence * 0.18);
    color += u.palette3.rgb * cooling * 0.28;
  } else if (sceneGroup == 19.0) {
    let resonator = max(
      exp(-abs(length((p - vec2f(-0.2, 0.0)) * vec2f(1.3, 0.8)) - 0.36) * 24.0),
      exp(-abs(length((p - vec2f(0.28, 0.04)) * vec2f(1.1, 0.9)) - 0.22) * 28.0)
    );
    let fringes = stripe(p.x * 14.0 + sin(p.y * 7.0 + t * 0.4), 0.028);
    let readout = exp(-abs(rot(p, -0.32).y + 0.1) * 48.0) * smoothstep(-0.85, 0.7, p.x);
    color = mix(u.palette2.rgb, u.palette1.rgb, resonator * 0.48 + fringes * 0.12);
    color += u.palette3.rgb * readout * (0.2 + bloom * 0.18);
  } else if (sceneGroup == 20.0) {
    let fluidSignal = atomAt(1);
    let feedbackSignal = atomAt(3);
    let signalSignal = atomAt(22);
    let loopUv = (p - vec2f(0.06, 0.04)) * vec2f(1.1, 0.72);
    let loopRadius = length(loopUv);
    let loopAngle = atan2(loopUv.y, loopUv.x);
    let rows = max(
      stripe(p.x * 8.0 + sin(p.y * 5.0 + t * 0.72) * 0.22, 0.035),
      stripe((p.x - p.y) * 5.0 - t * 0.38, 0.028)
    );
    let nutrientLoop = exp(-abs(loopRadius - 0.45) * 18.0);
    let loopPulse = stripe(loopAngle * 3.0 + t * (0.92 + motion * 0.38), 0.05) * nutrientLoop;
    let waterLane = stripe(loopAngle * 5.0 - t * (1.28 + fluidSignal * 0.34), 0.038) * nutrientLoop;
    let compostCenter = vec2f(-0.52 + sin(t * 0.54) * 0.025, 0.32 + cos(t * 0.46) * 0.02);
    let compost = exp(-dot(p - compostCenter, p - compostCenter) * 18.0);
    let heatBreath = 0.52 + 0.48 * sin(t * 1.18 + p.y * 4.0);
    let gasBubbles = starParticleField(p + vec2f(0.0, t * 0.09), t, 0.12 + fluidSignal * 0.16) * smoothstep(0.68, 0.05, length(p - compostCenter));
    color = mix(color, u.palette1.rgb, rows * 0.3 + nutrientLoop * 0.24 + loopPulse * 0.38);
    color += vec3f(0.18, 0.74, 1.0) * waterLane * (0.3 + fluidSignal * 0.42);
    color += u.palette3.rgb * compost * (0.14 + heat * (0.22 + heatBreath * 0.36));
    color += vec3f(0.9, 1.0, 0.38) * gasBubbles * (0.18 + signalSignal * 0.34);
    color += vec3f(0.2, 0.95, 0.42) * atomFeedbackArcs(p + vec2f(sin(t * 0.42) * 0.08, cos(t * 0.36) * 0.05), t) * max(feedbackSignal, 0.24) * 0.26;
  } else if (sceneGroup == 21.0) {
    let bowl = exp(-abs(p.y - (0.42 * p.x * p.x - 0.42)) * 22.0);
    let trajectory = exp(-abs(length((p - vec2f(sin(t * 0.4) * 0.42, -0.1 + cos(t * 0.4) * 0.16)) * vec2f(1.2, 1.8)) - 0.18) * 24.0);
    let friction = stripe(p.x * 9.0 + p.y * 3.0 + t * 0.25, 0.03);
    color = mix(color, u.palette1.rgb, bowl * 0.5 + trajectory * 0.42);
    color += u.palette3.rgb * friction * smoothstep(0.8, 0.05, abs(p.y + 0.48)) * 0.18;
  } else if (sceneGroup == 22.0) {
    let strata = max(stripe(p.y * 9.0 + sin(p.x * 3.0) * 0.08, 0.045), stripe((p.x - p.y) * 4.0, 0.03));
    let cracks = exp(-abs(sin(p.x * 10.0 + p.y * 6.0 + t * 0.08)) * 8.0);
    color = mix(color, u.palette1.rgb, strata * 0.035);
    color += u.palette3.rgb * cracks * 0.035;
  } else if (sceneGroup == 33.0) {
    let flame = atomThermalPlume(p * vec2f(0.82, 1.08) + vec2f(sin(t * 0.38) * 0.08, -0.1), t);
    let soot = stripe(p.y * 6.0 + sin(p.x * 5.0 + t * 0.25) * 0.5 - t * 0.18, 0.036) * smoothstep(-0.85, 0.65, p.y);
    let ember = starParticleField(p + vec2f(0.0, t * 0.1), t, 0.12 + heat * 0.2);
    color = mix(vec3f(0.08, 0.035, 0.02), u.palette2.rgb, smoothstep(0.2, 0.95, p.y) * 0.5);
    color += vec3f(1.0, 0.22, 0.04) * flame * (0.5 + heat * 0.44);
    color += vec3f(0.95, 0.58, 0.12) * ember * 0.36;
    color = mix(color, vec3f(0.025, 0.025, 0.03), soot * 0.28);
  } else if (sceneGroup == 34.0) {
    let loopA = ellipseRing(p, vec2f(-0.26, 0.04), vec2f(0.85, 1.36), 0.42, 0.034);
    let loopB = ellipseRing(p, vec2f(0.36, -0.08), vec2f(1.2, 0.82), 0.33, 0.028);
    let film = smoothstep(0.72, 0.08, length((p - vec2f(0.02, -0.02)) * vec2f(0.74, 1.05)));
    let phaseBands = 0.5 + 0.5 * sin((p.x * 11.0 + p.y * 7.0) + sin(p.y * 6.0 + t * 0.35) * 1.4);
    let rainbow = vec3f(
      0.56 + 0.44 * sin(phaseBands * 6.28318 + 0.0),
      0.56 + 0.44 * sin(phaseBands * 6.28318 + 2.09),
      0.56 + 0.44 * sin(phaseBands * 6.28318 + 4.18)
    );
    let bubbles = max(
      ellipseRing(p, vec2f(-0.34, -0.18 + sin(t * 0.5) * 0.03), vec2f(1.0), 0.12, 0.025),
      ellipseRing(p, vec2f(0.28, 0.2 + cos(t * 0.42) * 0.035), vec2f(0.9, 1.2), 0.095, 0.022)
    );
    color = mix(vec3f(0.98, 0.98, 1.0), rainbow, film * (0.36 + bloom * 0.24));
    color += vec3f(0.1, 0.12, 0.16) * max(loopA, loopB) * 0.78;
    color += u.palette3.rgb * bubbles * 0.52;
  } else if (sceneGroup == 35.0) {
    let tray = rectMask(p, vec2f(0.0, -0.12), vec2f(0.82, 0.48));
    let wells = max(max(
      ellipseRing(p, vec2f(-0.44, 0.0), vec2f(1.0, 0.8), 0.16, 0.026),
      ellipseRing(p, vec2f(0.0, 0.02), vec2f(1.0, 0.8), 0.16, 0.026)),
      ellipseRing(p, vec2f(0.44, -0.02), vec2f(1.0, 0.8), 0.16, 0.026));
    let specimen = max(max(
      diskMask(p, vec2f(-0.44, 0.0), 0.12),
      diskMask(p, vec2f(0.0, 0.02), 0.1)),
      diskMask(p, vec2f(0.44, -0.02), 0.11));
    let readout = stripe(p.x * 10.0 + p.y * 3.0 - t * 0.2, 0.028) * tray;
    color = mix(color, vec3f(0.12, 0.13, 0.14), tray * 0.46);
    color += u.palette1.rgb * wells * 0.58;
    color += u.palette3.rgb * specimen * (0.28 + density * 0.22);
    color += vec3f(0.72, 0.9, 1.0) * readout * 0.16;
  } else if (sceneGroup == 36.0) {
    let artifact = rectMask(p, vec2f(0.0, -0.04), vec2f(0.66, 0.42));
    let pigment = stripe(p.y * 9.0 + sin(p.x * 5.0 + t * 0.06) * 0.18, 0.034) * artifact;
    let craquelure = atomStressCracks(p * vec2f(1.1, 0.8), t * 0.3) * artifact;
    let humidity = atomFluidRibbons(p + vec2f(0.0, t * 0.04), t * 0.25) * smoothstep(0.88, 0.12, length(p));
    color = mix(color, vec3f(0.22, 0.16, 0.09), artifact * 0.5);
    color += u.palette1.rgb * pigment * 0.38;
    color += vec3f(0.08, 0.1, 0.12) * craquelure * 0.52;
    color += u.palette3.rgb * humidity * 0.14;
  } else {
    color = mix(color, u.palette1.rgb, max(rings * 0.12, waves * 0.1) * commonGain);
    color += u.palette3.rgb * plume * 0.06 * commonGain;
  }
  return color;
}

fn affordanceOverlays(p: vec2f, t: f32, base: vec3f) -> vec3f {
  var color = base;
  let f = u.loading.w;
  let laser = featureAt(7) + featureAt(8);
  let network = featureAt(13) + featureAt(30) + featureAt(31);
  let orbit = featureAt(14) + featureAt(28);
  let bio = featureAt(11) + featureAt(19) + featureAt(23) + featureAt(36);
  let wave = featureAt(10) + featureAt(34);
  color += u.palette3.rgb * laser * exp(-abs(rot(p, 0.18).y) * 54.0) * 0.28;
  color += u.palette1.rgb * network * atomNetworkPressure(p, t) * 0.14;
  color += u.palette3.rgb * orbit * stripe(length(p) * 4.2 - t * 0.15, 0.026) * 0.2;
  color += u.palette1.rgb * bio * exp(-abs(sin(p.x * 6.0 + p.y * 3.0 + t * 0.12)) * 5.0) * 0.1;
  color += u.palette3.rgb * wave * stripe(length(p) * 6.0 - t * 0.55, 0.024) * 0.17;
  return mix(base, color, clamp(f + 0.24, 0.0, 1.0));
}

fn atomThermalPlume(p: vec2f, t: f32) -> f32 {
  let plume = exp(-abs(p.x + sin(p.y * 5.5 + t * 0.65) * 0.12) * 9.0);
  return plume * smoothstep(-0.9, 0.7, p.y);
}

fn atomFluidRibbons(p: vec2f, t: f32) -> f32 {
  return stripe(p.x * 6.0 + sin(p.y * 5.0 + t * 0.42) * 0.55, 0.035);
}

fn atomStressCracks(p: vec2f, t: f32) -> f32 {
  let branch = abs(sin(p.x * 11.0 + p.y * 7.0 + sin(p.y * 4.0 + t * 0.1)));
  return (1.0 - smoothstep(0.02, 0.18, branch)) * smoothstep(0.95, 0.08, length(p));
}

fn atomFeedbackArcs(p: vec2f, t: f32) -> f32 {
  let a = atan2(p.y, p.x) / 6.28318;
  let ring = 1.0 - smoothstep(0.02, 0.06, abs(length(p) - 0.62));
  return ring * stripe(a * 5.0 - t * 0.18, 0.045);
}

fn atomQuantumFringes(p: vec2f, t: f32) -> f32 {
  let fringe = sin(p.x * 18.0 + sin(p.y * 9.0 + t * 0.35) * 1.2);
  return (0.5 + 0.5 * fringe) * smoothstep(0.92, 0.05, length(p * vec2f(1.2, 0.8)));
}

fn atomNetworkPressure(p: vec2f, t: f32) -> f32 {
  let road = max(capsuleLine(p, vec2f(-0.84, -0.32), vec2f(0.76, 0.24), 0.026),
    capsuleLine(p, vec2f(-0.62, 0.38), vec2f(0.72, -0.2), 0.022));
  let pulse = stripe((p.x + p.y) * 5.0 - t * 0.72, 0.03);
  let node = max(exp(-dot(p - vec2f(-0.48, -0.14), p - vec2f(-0.48, -0.14)) * 38.0),
    exp(-dot(p - vec2f(0.44, 0.2), p - vec2f(0.44, 0.2)) * 34.0));
  return max(road * (0.45 + pulse * 0.42), node * (0.82 + pulse * 0.18));
}

fn diskMask(p: vec2f, c: vec2f, r: f32) -> f32 {
  return 1.0 - smoothstep(r, r + 0.035, length(p - c));
}

fn rectMask(p: vec2f, c: vec2f, s: vec2f) -> f32 {
  let d = abs(p - c) - s;
  return 1.0 - smoothstep(0.0, 0.035, max(d.x, d.y));
}

fn capsuleLine(p: vec2f, a: vec2f, b: vec2f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return 1.0 - smoothstep(r, r + 0.025, length(pa - ba * h));
}

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 127.1 + u.motion.z * 311.7) * 43758.5453123);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p + vec2f(u.motion.z, u.motion.w), vec2f(127.1, 311.7))) * 43758.5453123);
}

fn filmNoise(p: vec2f, t: f32) -> f32 {
  let a = sin(p.x * 81.0 + p.y * 37.0 + t * 0.7);
  let b = sin(p.x * 19.0 - p.y * 61.0 + t * 0.37);
  return 0.5 + 0.25 * a + 0.25 * b;
}

fn orb3d(p: vec2f, c: vec2f, r: f32, albedo: vec3f, emissive: vec3f, roughness: f32) -> vec4f {
  let q = (p - c) / max(r, 0.001);
  let d = dot(q, q);
  if (d > 1.0) { return vec4f(0.0); }
  let z = sqrt(max(0.0, 1.0 - d));
  let n = normalize(vec3f(q.x, q.y, z));
  let light = normalize(vec3f(-0.42, 0.58, 0.72));
  let fill = normalize(vec3f(0.58, -0.32, 0.48));
  let view = vec3f(0.0, 0.0, 1.0);
  let key = max(dot(n, light), 0.0);
  let rim = pow(clamp(1.0 - max(dot(n, view), 0.0), 0.0, 1.0), 2.2);
  let spec = pow(max(dot(reflect(-light, n), view), 0.0), mix(18.0, 72.0, clamp(1.0 - roughness, 0.0, 1.0)));
  let fillLight = max(dot(n, fill), 0.0) * 0.24;
  let shade = albedo * (0.18 + key * 0.86 + fillLight) + vec3f(1.0) * spec * 0.38 + u.palette3.rgb * rim * 0.22 + emissive;
  let mask = 1.0 - smoothstep(0.94, 1.0, d);
  return vec4f(shade, mask);
}

fn panel3d(p: vec2f, c: vec2f, s: vec2f, albedo: vec3f, glow: vec3f) -> vec4f {
  let q = (p - c) / max(s, vec2f(0.001));
  let d = max(abs(q.x), abs(q.y));
  let mask = 1.0 - smoothstep(0.96, 1.02, d);
  let bevel = 1.0 - smoothstep(0.72, 1.0, d);
  let line = max(stripe((q.x + 1.0) * 6.0, 0.028), stripe((q.y + 1.0) * 4.0, 0.028));
  let shade = albedo * (0.36 + bevel * 0.42) + glow * line * 0.42 + vec3f(1.0) * pow(max(0.0, 1.0 - d), 3.0) * 0.08;
  return vec4f(shade, mask);
}

fn blendLayer(base: vec3f, layer: vec4f) -> vec3f {
  return mix(base, layer.rgb, clamp(layer.a, 0.0, 1.0));
}

fn perspectiveFloor(p: vec2f, t: f32) -> f32 {
  let horizon = p.y + 0.92;
  let depth = 1.0 / max(0.09, horizon);
  let xLine = stripe(p.x * depth * 1.8 + t * 0.018, 0.016);
  let zLine = stripe(depth * 0.72 - t * 0.035, 0.014);
  let fade = smoothstep(0.34, -0.84, p.y) * smoothstep(-1.08, -0.28, p.y);
  return max(xLine, zLine) * fade;
}

fn ellipseRing(p: vec2f, c: vec2f, s: vec2f, radius: f32, width: f32) -> f32 {
  let q = (p - c) * s;
  return 1.0 - smoothstep(width, width + 0.035, abs(length(q) - radius));
}

fn starParticleField(p: vec2f, t: f32, amount: f32) -> f32 {
  let cell = floor((p + vec2f(1.4, 1.0)) * vec2f(22.0, 16.0));
  let local = fract((p + vec2f(1.4, 1.0)) * vec2f(22.0, 16.0)) - vec2f(0.5);
  let rnd = hash21(cell);
  let sparkle = 1.0 - smoothstep(0.015, 0.09, length(local + vec2f(sin(rnd * 8.0), cos(rnd * 11.0)) * 0.13));
  return sparkle * step(1.0 - amount, rnd) * (0.55 + 0.45 * sin(t * (1.2 + rnd) + rnd * 6.28318));
}

fn atomPhaseBoundary(p: vec2f, t: f32) -> f32 {
  let body = smoothstep(0.84, 0.06, length(p * vec2f(0.9, 1.15)));
  return stripe(length(p) * 5.4 + sin(p.x * 3.0) - t * 0.18, 0.03) * body;
}

fn atomVectorFlow(p: vec2f, t: f32) -> f32 {
  let q = p + vec2f(sin(p.y * 4.0 + t * 0.42) * 0.08, 0.0);`);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
