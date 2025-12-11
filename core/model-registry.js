// Attention support: 'unknown' = not tested, 'real' = exports attention, 'synthetic' = no attention in ONNX
export const MODEL_CATALOG = {
  // SmolLM2 - Nov 2024
  'HuggingFaceTB/SmolLM2-1.7B-Instruct': {
    id: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    name: 'SmolLM2 1.7B',
    size: '1.7B',
    downloadSize: '1.0GB',
    vram: '2GB',
    capabilities: ['quality', 'smart'],
    provider: 'huggingface',
    released: '2024',
    recommended: false,
    engine: 'transformers',
    dtype: 'q4',
    attention: 'unknown' // TODO: test
  },
  'HuggingFaceTB/SmolLM2-360M-Instruct': {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    name: 'SmolLM2 360M',
    size: '360M',
    downloadSize: '724MB',
    vram: '400MB',
    capabilities: ['balanced', 'fast'],
    provider: 'huggingface',
    released: '2024',
    recommended: true,
    engine: 'transformers',
    dtype: 'fp16',
    attention: 'unknown' // TODO: test
  },
  'HuggingFaceTB/SmolLM2-135M-Instruct': {
    id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    name: 'SmolLM2 135M',
    size: '135M',
    downloadSize: '270MB',
    vram: '200MB',
    capabilities: ['ultra-fast', 'lightweight'],
    provider: 'huggingface',
    released: '2024',
    recommended: true,
    engine: 'transformers',
    dtype: 'fp16',
    attention: 'unknown' // TODO: test
  },
  // Qwen 2.5 - Sep 2024
  'onnx-community/Qwen2.5-1.5B-Instruct': {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    name: 'Qwen 2.5 1.5B',
    size: '1.5B',
    downloadSize: '950MB',
    vram: '1.8GB',
    capabilities: ['quality', 'multilingual'],
    provider: 'alibaba',
    released: '2024',
    recommended: false,
    engine: 'transformers',
    dtype: 'q4f16',
    attention: 'synthetic' // ONNX export doesn't include attention
  },
  'onnx-community/Qwen2.5-0.5B-Instruct': {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen 2.5 0.5B',
    size: '0.5B',
    downloadSize: '350MB',
    vram: '600MB',
    capabilities: ['fast', 'multilingual'],
    provider: 'alibaba',
    released: '2024',
    recommended: false,
    engine: 'transformers',
    dtype: 'q4f16',
    attention: 'synthetic' // ONNX export doesn't include attention
  },
  // Llama 3.2 - Sep 2024
  'onnx-community/Llama-3.2-1B-Instruct': {
    id: 'onnx-community/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 1B',
    size: '1B',
    downloadSize: '700MB',
    vram: '1.2GB',
    capabilities: ['balanced'],
    provider: 'meta',
    released: '2024',
    recommended: false,
    engine: 'transformers',
    dtype: 'q4f16',
    attention: 'synthetic' // ONNX export doesn't include attention
  },
  // TinyLlama - Jan 2024
  'onnx-community/TinyLlama-1.1B-Chat-v1.0': {
    id: 'onnx-community/TinyLlama-1.1B-Chat-v1.0',
    name: 'TinyLlama 1.1B',
    size: '1.1B',
    downloadSize: '600MB',
    vram: '1.2GB',
    capabilities: ['balanced', 'fast'],
    provider: 'tinyllama',
    released: '2024',
    recommended: false,
    engine: 'transformers',
    dtype: 'q4f16',
    attention: 'synthetic' // ONNX export doesn't include attention
  },
  // Gemma 2 2B - Jun 2024
  'onnx-community/gemma-2-2b-it': {
    id: 'onnx-community/gemma-2-2b-it',
    name: 'Gemma 2 2B',
    size: '2B',
    downloadSize: '1.3GB',
    vram: '2.5GB',
    capabilities: ['quality', 'smart'],
    provider: 'google',
    released: '2024',
    recommended: false,
    engine: 'transformers',
    dtype: 'q4f16',
    attention: 'synthetic' // ONNX export doesn't include attention
  }
};

// Helper to categorize models by size
export const MODEL_SIZE_CATEGORIES = {
  small: ['HuggingFaceTB/SmolLM2-135M-Instruct', 'HuggingFaceTB/SmolLM2-360M-Instruct', 'onnx-community/Qwen2.5-0.5B-Instruct', 'onnx-community/TinyLlama-1.1B-Chat-v1.0'],
  medium: ['onnx-community/Llama-3.2-1B-Instruct', 'onnx-community/Qwen2.5-1.5B-Instruct', 'HuggingFaceTB/SmolLM2-1.7B-Instruct', 'onnx-community/gemma-2-2b-it'],
  experimental: []
};

export const DEFAULT_MODEL = 'HuggingFaceTB/SmolLM2-360M-Instruct';

// Provider colors for UI - using lighter colors for better contrast on dark backgrounds
export const PROVIDER_COLORS = {
  google: '#5ec879',      // Light green (better contrast)
  meta: '#5a9cf5',        // Light blue (better contrast)
  alibaba: '#ffaa55',     // Light orange (better contrast)
  microsoft: '#66d4ff',   // Light cyan (better contrast)
  huggingface: '#ffe066', // Light yellow (better contrast)
  tinyllama: '#c084fc'    // Light purple (better contrast)
};