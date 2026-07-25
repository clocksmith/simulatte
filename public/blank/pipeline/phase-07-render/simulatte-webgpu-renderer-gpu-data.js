(function attachSimulatteWebGpuRenderergpudata(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

    const WEBGPU_OPTIONAL_FEATURES = Object.freeze([]);

    const WEBGPU_NATIVE_ONLY_FEATURES = Object.freeze([
        'mesh-shader-api',
        'hardware-ray-query',
        'drawIndirectCount',
      ]);

    const WEBGPU_TRANSLATED_TECHNIQUES = Object.freeze([
        'compiled-object-geometry-programs',
        'storage-buffer-object-parts',
        'direct-instanced-bounded-quads',
      ]);

    const DEFAULT_WEBGPU_FEATURE_RECEIPT = Object.freeze({
        schema: 'simulatte.webgpuFeatureReceipt.v1',
        available: Object.freeze([]),
        requested: Object.freeze([]),
        enabled: Object.freeze([]),
        failed: Object.freeze([]),
        used: Object.freeze(['lightweight-background', 'direct-instanced-bounded-quads']),
        unsupportedNativeFeatures: WEBGPU_NATIVE_ONLY_FEATURES,
      });

    const PALETTES = Object.freeze({
        thermal: ['#fff7ed', '#ff3d16', '#17100d', '#7dd3fc'],
        weather: ['#f8fafc', '#67e8f9', '#1e293b', '#a78bfa'],
        water: ['#f8fafc', '#0ea5e9', '#0f172a', '#22c55e'],
        machine: ['#f9fafb', '#94a3b8', '#0f172a', '#ef4444'],
        magnet: ['#f8fafc', '#111827', '#2563eb', '#db2777'],
        optics: ['#ffffff', '#60a5fa', '#ef4444', '#facc15'],
        acoustic: ['#f8fafc', '#38bdf8', '#334155', '#a78bfa'],
        bio: ['#f7fee7', '#22c55e', '#052e16', '#fde047'],
        chemistry: ['#ffffff', '#14b8a6', '#164e63', '#f97316'],
        ice: ['#ffffff', '#7dd3fc', '#1e3a8a', '#c084fc'],
        space: ['#ffffff', '#38bdf8', '#020617', '#f59e0b'],
        network: ['#ffffff', '#2563eb', '#0f172a', '#ef4444'],
        plasma: ['#ffffff', '#a855f7', '#020617', '#22d3ee'],
        molecular: ['#ffffff', '#a3e635', '#1e1b4b', '#fb7185'],
        clinical: ['#ffffff', '#ef4444', '#172554', '#22d3ee'],
        instrument: ['#ffffff', '#22d3ee', '#111827', '#f59e0b'],
        grid: ['#f8fafc', '#facc15', '#111827', '#ef4444'],
        robot: ['#f9fafb', '#38bdf8', '#1f2937', '#f97316'],
        factory: ['#fff7ed', '#94a3b8', '#1e293b', '#fb7185'],
        quantum: ['#f8fafc', '#a78bfa', '#020617', '#22d3ee'],
        agro: ['#f7fee7', '#84cc16', '#14532d', '#f97316'],
        sport: ['#f8fafc', '#60a5fa', '#111827', '#f59e0b'],
        cultural: ['#fffbeb', '#d97706', '#1f2937', '#14b8a6'],
      });

    const ATOM_UNIFORM_SLOTS = Object.freeze([
        'thermal',
        'fluid',
        'stress',
        'feedback',
        'orbital',
        'electromagnetic',
        'optical',
        'quantum',
        'acoustic',
        'biological',
        'chemical',
        'network',
        'granular',
        'instrument',
        'combustion',
        'phase',
        'robotic',
        'measurement',
        'motion',
        'density',
        'emission',
        'constraint',
        'signal',
        'surface',
      ]);

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-gpu-data.js', {
      WEBGPU_OPTIONAL_FEATURES,
      WEBGPU_NATIVE_ONLY_FEATURES,
      WEBGPU_TRANSLATED_TECHNIQUES,
      DEFAULT_WEBGPU_FEATURE_RECEIPT,
      PALETTES,
      ATOM_UNIFORM_SLOTS,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
