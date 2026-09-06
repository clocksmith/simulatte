(function attachMeshLibrary(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMeshLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMeshLibraryApi() {
  const MAX_VERTICES = 65536;
  function invalid(message) { return Object.assign(new Error(message), { code: 'render_mesh_invalid' }); }
  function vector(value, length, label) {
    if (!value || value.length !== length || !Array.from(value).every(Number.isFinite)) throw invalid(`Invalid ${label}`);
    return Array.from(value);
  }
  function normalize(input) {
    if (!input || typeof input.id !== 'string' || !input.id.trim()) throw invalid('Mesh requires an id');
    const positions = input.positions;
    if (!positions?.length || positions.length % 9 || positions.length > MAX_VERTICES * 3) throw invalid('Expected bounded triangle-list positions');
    const points = vector(positions, positions.length, 'positions').map(Math.fround);
    if (!points.every(Number.isFinite)) throw invalid('Positions must fit GPU float32 storage');
    const normals = input.normals ? vector(input.normals, points.length, 'normals') : [];
    for (let i = 0; i < points.length; i += 9) {
      const a = points.slice(i, i + 3), b = points.slice(i + 3, i + 6), c = points.slice(i + 6, i + 9);
      const u = b.map((x, j) => x - a[j]), v = c.map((x, j) => x - a[j]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(...n);
      if (!length || !Number.isFinite(length)) throw invalid('Degenerate mesh triangle');
      if (!input.normals) normals.push(...n.map(x => x / length), ...n.map(x => x / length), ...n.map(x => x / length));
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(...normals.slice(i, i + 3));
      if (!length || !Number.isFinite(length)) throw invalid('Invalid mesh normal length');
      for (let j = 0; j < 3; j++) normals[i + j] /= length;
    }
    const color = vector(input.material?.color || [0.7, 0.72, 0.75, 1], 4, 'material color');
    const metallic = input.material?.metallic ?? 0;
    const roughness = input.material?.roughness ?? 0.7;
    const emissive = input.material?.emissive ?? 0;
    if (!color.every(x => x >= 0 && x <= 1) || ![metallic, roughness].every(x => Number.isFinite(x) && x >= 0 && x <= 1) || !Number.isFinite(Math.fround(emissive)) || emissive < 0) throw invalid('Invalid material');
    return Object.freeze({ id: input.id, positions: Object.freeze(points), normals: Object.freeze(normals),
      material: Object.freeze({ color: Object.freeze(color), metallic, roughness, emissive }) });
  }
  function create(meshes = []) {
    if (!Array.isArray(meshes) || meshes.length > 256) throw invalid('Expected at most 256 mesh declarations');
    const byId = new Map();
    for (const input of meshes) {
      const mesh = normalize(input);
      if (byId.has(mesh.id)) throw invalid(`Duplicate mesh ${mesh.id}`);
      byId.set(mesh.id, mesh);
    }
    return Object.freeze({
      ids: Object.freeze([...byId.keys()]),
      has: id => byId.has(id),
      get(id) { if (!byId.has(id)) throw invalid(`Unknown mesh ${id}`); return byId.get(id); },
      entries: () => Object.freeze([...byId.values()]),
    });
  }
  return Object.freeze({ create, MAX_VERTICES });
});
