(function attachWorldSurfaceShader(root, factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SimulatteWorldSurfaceShader=api;
})(globalThis,function createWorldSurfaceShader(){
  function create(shadowCode){
    if(typeof shadowCode!=='string'||!shadowCode.length)throw Error('surface_shadow_shader_missing');
    return `${shadowCode}
struct Uniforms {
  viewProjection: mat4x4<f32>,
  cameraPosition: vec4<f32>,
  lightDirection: vec4<f32>,
  fogColorDensity: vec4<f32>,
  timeViewport: vec4<f32>,
}

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) emissive: f32,
  @location(4) material: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) emissive: f32,
  @location(4) material: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.clipPosition = uniforms.viewProjection * vec4<f32>(input.position, 1.0);
  output.worldPosition = input.position;
  output.normal = input.normal;
  output.color = input.color;
  output.emissive = input.emissive;
  output.material = input.material;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let normal = normalize(input.normal);
  let lightDirection = normalize(-uniforms.lightDirection.xyz);
  let viewDirection = normalize(uniforms.cameraPosition.xyz - input.worldPosition);
  let halfDirection = normalize(lightDirection + viewDirection);
  let visibility = sunVisibility(input.worldPosition);
  let diffuse = max(dot(normal, lightDirection), 0.0) * visibility;
  let roughness = clamp(input.material.y, 0.06, 1.0);
  let metallic = clamp(input.material.x, 0.0, 1.0);
  let specularPower = mix(180.0, 7.0, roughness);
  let fresnelBase = mix(vec3<f32>(0.035), input.color.rgb, vec3<f32>(metallic));
  let fresnel = fresnelBase + (vec3<f32>(1.0) - fresnelBase) * pow(1.0 - max(dot(viewDirection, halfDirection), 0.0), 5.0);
  let specular = fresnel * pow(max(dot(normal, halfDirection), 0.0), specularPower) * mix(1.3, 0.18, roughness);
  let rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0) * 0.08;
  // Static roads, buildings, and grid lines must remain temporally stable.
  // Only high-emissive dynamic signals are allowed to pulse; animating every
  // map fragment makes thin geometry shimmer as the camera moves.
  let pulse = select(1.0, 0.82 + 0.18 * sin(uniforms.timeViewport.x * 2.4 + input.worldPosition.x * 0.018 - input.worldPosition.z * 0.012), input.emissive > 1.4);
  let facadeCoordinates = select(input.worldPosition.xy,input.worldPosition.zy,abs(normal.x)>abs(normal.z));
  let facadeFootprint = fwidth(facadeCoordinates / vec2<f32>(2.6,3.2));
  var surface = input.color.rgb;
  if (uniforms.lightDirection.w > 0.5 && input.worldPosition.y > 1.5 && abs(normal.y) < 0.1 && input.material.x < 0.1) {
    let uv = abs(fract(facadeCoordinates / vec2<f32>(2.6,3.2)) - 0.5);
    let window = (1.0 - smoothstep(0.24,0.30,uv.x)) * (1.0 - smoothstep(0.26,0.33,uv.y));
    let detail = 1.0 - smoothstep(0.12,0.35,max(facadeFootprint.x,facadeFootprint.y));
    let mortar = smoothstep(0.47,0.495,abs(fract(input.worldPosition.y*3.0)-0.5));
    surface *= 1.0 - mortar * detail * 0.08;
    surface = mix(surface,vec3<f32>(0.07,0.14,0.19),window * detail * 0.72);
  }
  let albedo = mix(surface, sqrt(max(surface, vec3<f32>(0.0))), uniforms.lightDirection.w);
  let skyAmbient = mix(vec3<f32>(0.22,0.24,0.27),vec3<f32>(0.30,0.37,0.47),max(normal.y,0.0));
  let sunlight = mix(vec3<f32>(1.0,0.94,0.84),vec3<f32>(1.0,0.62,0.34),1.0-smoothstep(0.05,0.45,lightDirection.y));
  let diffuseColor = albedo * mix(vec3<f32>(0.2 + diffuse * 0.74),skyAmbient + sunlight * diffuse * 0.90,uniforms.lightDirection.w) * (1.0 - metallic * 0.38);
  let lit = diffuseColor + specular * visibility + input.color.rgb * rim + input.color.rgb * input.emissive * pulse;
  let toneMapped = lit / (lit + vec3<f32>(0.85));
  let cameraDistance = distance(uniforms.cameraPosition.xyz, input.worldPosition);
  let fogAmount = clamp(1.0 - exp(-cameraDistance * uniforms.fogColorDensity.w), 0.0, 0.88);
  return vec4<f32>(mix(toneMapped, uniforms.fogColorDensity.rgb, fogAmount), input.color.a);
}
`;
  }
  return Object.freeze({create});
});
