(function attachAtmosphericSky(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAtmosphericSky = api;
})(globalThis, function createAtmosphericSky() {
  'use strict';
  // One expression source for the WebGPU and Babylon adapters. Clouds represent
  // declared scenario cover, never an inferred current-weather observation.
  const NOISE = `
fn skyHash(p: vec2<f32>) -> f32 { return fract(sin(dot(p,vec2<f32>(127.1,311.7)))*43758.5453); }
fn skyNoise(p: vec2<f32>) -> f32 {
  let cell: vec2<f32> = floor(p);
  let f: vec2<f32> = fract(p);
  let u: vec2<f32> = f*f*(3.0-2.0*f);
  return mix(mix(skyHash(cell),skyHash(cell+vec2<f32>(1.0,0.0)),u.x),mix(skyHash(cell+vec2<f32>(0.0,1.0)),skyHash(cell+vec2<f32>(1.0)),u.x),u.y);
}
fn skyCloud(p: vec2<f32>) -> f32 {
  return skyNoise(p)*0.5+skyNoise(p*2.03+3.7)*0.25+skyNoise(p*4.11+7.3)*0.125+skyNoise(p*8.23+1.8)*0.0625;
}`;
  const BODY = `
  let d: vec3<f32> = normalize(direction);
  let s: vec3<f32> = normalize(sun);
  let day: f32 = smoothstep(-0.12, 0.12, s.y);
  let height: f32 = max(d.y, 0.0);
  let horizon: f32 = exp(-height * 6.0);
  let lowSun: f32 = 1.0 - smoothstep(0.02, 0.38, s.y);
  let facing: f32 = max(dot(d, s), 0.0);
  let blue: vec3<f32> = mix(vec3<f32>(0.075, 0.24, 0.52), vec3<f32>(0.50, 0.69, 0.82), horizon);
  let sunset: vec3<f32> = vec3<f32>(0.75, 0.25, 0.065) * horizon * lowSun * pow(facing, 6.0);
  let night: vec3<f32> = mix(vec3<f32>(0.002, 0.005, 0.016), vec3<f32>(0.025, 0.04, 0.075), horizon);
  let glow: f32 = pow(facing, 28.0) * (0.15 + lowSun * 0.35);
  let disk: f32 = smoothstep(0.99995, 0.99999, facing) * smoothstep(-0.005, 0.015, d.y);
  let plane: vec2<f32> = d.xz / max(0.16, d.y + 0.20);
  let broad: f32 = skyCloud(plane * 2.0) * 2.0 - 1.0;
  let detail: f32 = skyNoise(plane * 18.0) * 2.0 - 1.0;
  let cloud: f32 = smoothstep(1.0 - cover * 1.85, 1.25 - cover * 1.85, broad * 0.6 + detail * 0.16 + 0.45) * smoothstep(0.02, 0.20, d.y);
  let cloudLight: vec3<f32> = mix(vec3<f32>(0.31, 0.39, 0.48), vec3<f32>(0.95, 0.96, 0.96), 0.5 + broad * 0.25 + facing * 0.25);
  let clear: vec3<f32> = mix(night, blue + sunset + vec3<f32>(1.0, 0.75, 0.43) * glow, day);
  let cloudy: vec3<f32> = mix(clear, cloudLight * day + night, cloud * 0.88);
  return cloudy + vec3<f32>(1.0, 0.90, 0.73) * disk * day * (1.0 - cloud) * 4.0;
`;
  const WGSL = NOISE + `fn atmosphericSky(direction: vec3<f32>, sun: vec3<f32>, cover: f32) -> vec3<f32> { ${BODY} }`;
  const GLSL = NOISE.replace(/fn (\w+)\(p: vec2<f32>\) -> f32/g, 'float $1(vec2 p)').replace(/let (\w+): vec2<f32> =/g, 'vec2 $1 =').replace(/vec([234])<f32>/g, 'vec$1') + `vec3 atmosphericSky(vec3 direction, vec3 sun, float cover) { ${BODY
    .replace(/let (\w+): (vec[234]<f32>|f32) =/g, (_, name, type) => `${type === 'f32' ? 'float' : type.slice(0, 4)} ${name} =`)
    .replace(/vec([234])<f32>/g, 'vec$1')} }`;
  function inverse(matrix) {
    if (!matrix || matrix.length !== 16 || !Array.from(matrix).every(Number.isFinite)) throw Error('sky_camera_matrix_invalid');
    const rows = Array.from({length:4}, (_, i) => Array.from({length:8}, (_, j) => j < 4 ? matrix[j * 4 + i] : Number(j - 4 === i)));
    for (let col=0;col<4;col++) {
      let pivot=col;
      for(let i=col+1;i<4;i++) if(Math.abs(rows[i][col])>Math.abs(rows[pivot][col])) pivot=i;
      if(Math.abs(rows[pivot][col])<1e-12) throw Error('sky_camera_matrix_singular');
      [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
      const divisor=rows[col][col];rows[col]=rows[col].map(v=>v/divisor);
      for(let i=0;i<4;i++) if(i!==col) { const factor=rows[i][col];rows[i]=rows[i].map((v,j)=>v-factor*rows[col][j]); }
    }
    return Float32Array.from({length:16}, (_, i)=>rows[i%4][4+Math.floor(i/4)]);
  }
  function validate(sun, cover) {
    if (!sun || sun.length!==3 || !Array.from(sun).every(Number.isFinite) || Math.hypot(...sun)<1e-6) throw Error('sky_sun_invalid');
    if(!Number.isFinite(cover)||cover<0||cover>1) throw Error('sky_cloud_cover_invalid');
  }
  function create(device, format, sampleCount, depthFormat) {
    const buffer=device.createBuffer({label:'atmospheric-sky-state',size:112,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const module=device.createShaderModule({label:'atmospheric-sky',code:`${WGSL}
      struct Sky { inverseCamera: mat4x4<f32>, eye: vec4<f32>, sun: vec4<f32>, state: vec4<f32> }
      @group(0) @binding(0) var<uniform> sky: Sky;
      struct Vertex { @builtin(position) position: vec4<f32>, @location(0) ndc: vec2<f32> }
      @vertex fn vs(@builtin(vertex_index) i:u32)->Vertex {
        let xy=vec2<f32>(f32((i<<1u)&2u),f32(i&2u))*2.0-1.0;
        var v:Vertex; v.position=vec4<f32>(xy,0.5,1.0);v.ndc=xy;return v;
      }
      @fragment fn fs(v:Vertex)->@location(0) vec4<f32> {
        let p=sky.inverseCamera*vec4<f32>(v.ndc,0.5,1.0);
        let c=atmosphericSky(p.xyz/p.w-sky.eye.xyz,sky.sun.xyz,sky.state.x);
        return vec4<f32>(pow(c/(c+vec3<f32>(0.25)),vec3<f32>(1.0/2.2)),1.0);
      }`});
    const pipeline=device.createRenderPipeline({label:'atmospheric-sky',layout:'auto',vertex:{module,entryPoint:'vs'},
      fragment:{module,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'},
      depthStencil:{format:depthFormat,depthWriteEnabled:false,depthCompare:'always'},multisample:{count:sampleCount}});
    const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]});
    return {draw(pass,{viewProjection,eye,sun,cover=0}) {
      validate(sun,cover);const values=new Float32Array(28);values.set(inverse(viewProjection));values.set([...eye,0],16);values.set([...sun,0],20);values[24]=cover;
      device.queue.writeBuffer(buffer,0,values);pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.draw(3);
    },destroy(){buffer.destroy();}};
  }
  function createBabylon(B,scene,sun,cover=0) {
    validate(sun,cover);
    B.Effect.ShadersStore.simulatteAtmosphereVertexShader=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 direction;void main(){direction=position;gl_Position=worldViewProjection*vec4(position,1.0);}`;
    B.Effect.ShadersStore.simulatteAtmosphereFragmentShader=`precision highp float;varying vec3 direction;uniform vec3 sun;uniform float cover;${GLSL}void main(){vec3 c=atmosphericSky(direction,sun,cover);gl_FragColor=vec4(pow(c/(c+vec3(0.25)),vec3(1.0/2.2)),1.0);}`;
    const material=new B.ShaderMaterial('modeled-atmosphere',scene,'simulatteAtmosphere',{attributes:['position'],uniforms:['worldViewProjection','sun','cover']});
    material.backFaceCulling=false;material.disableDepthWrite=true;material.setVector3('sun',B.Vector3.FromArray(sun));material.setFloat('cover',cover);
    const dome=B.MeshBuilder.CreateSphere('modeled-sky',{diameter:8000,segments:24},scene);dome.material=material;dome.isPickable=false;dome.infiniteDistance=true;dome.renderingGroupId=0;
    return {dispose(){dome.dispose();material.dispose();}};
  }
  return Object.freeze({WGSL,GLSL,inverse,validate,create,createBabylon});
});
