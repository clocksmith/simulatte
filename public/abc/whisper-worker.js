// Whisper Web Worker - runs speech recognition off the main thread
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2';

// Configure for best performance
// Try WebGPU first, fall back to WASM
let useWebGPU = false;

async function checkWebGPU() {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        useWebGPU = true;
        env.backends.onnx.wasm.proxy = false;
        self.postMessage({ type: 'status', status: 'info', message: 'Using WebGPU acceleration' });
        return true;
      }
    } catch (e) {
      console.log('WebGPU not available:', e);
    }
  }
  // Fall back to WASM with multi-threading
  env.backends.onnx.wasm.numThreads = navigator.hardwareConcurrency || 4;
  self.postMessage({ type: 'status', status: 'info', message: 'Using WASM (CPU)' });
  return false;
}

let whisperPipeline = null;
let isLoading = false;
let isProcessing = false; // Lock to prevent concurrent transcriptions
let currentModel = 'Xenova/whisper-base.en';
let isPageHidden = false; // Track visibility state
let lastProgressUpdate = 0; // Throttle progress updates

// Track download progress across all files
const downloadProgress = new Map();

function updateTotalProgress(force = false) {
  // Throttle updates when page is hidden to avoid overwhelming message queue
  const now = Date.now();
  if (!force && isPageHidden && now - lastProgressUpdate < 1000) {
    return; // Only update once per second when hidden
  }
  lastProgressUpdate = now;

  let totalLoaded = 0;
  let totalSize = 0;
  const files = [];

  for (const [file, info] of downloadProgress) {
    totalLoaded += info.loaded || 0;
    totalSize += info.total || 0;
    if (info.total > 0 && info.loaded < info.total) {
      files.push(file);
    }
  }

  const percent = totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;
  const currentFile = files.length > 0 ? files[0] : '';

  self.postMessage({
    type: 'status',
    status: 'downloading',
    progress: percent,
    file: currentFile,
    fileCount: downloadProgress.size,
    activeFiles: files.length,
    loaded: totalLoaded,
    total: totalSize
  });
}

// Handle messages from main thread
self.onmessage = async (e) => {
  const { type, data, model, hidden } = e.data;

  switch (type) {
    case 'load':
      // Model can be 'tiny', 'base', or 'small'
      if (model) {
        currentModel = `Xenova/whisper-${model}.en`;
      }
      await loadModel();
      break;
    case 'transcribe':
      await transcribe(data);
      break;
    case 'visibility':
      isPageHidden = hidden;
      // When page becomes visible again, send current progress immediately
      if (!hidden && isLoading) {
        updateTotalProgress(true);
      }
      break;
  }
};

async function loadModel() {
  if (isLoading || whisperPipeline) return;
  isLoading = true;

  try {
    // Check for WebGPU support
    await checkWebGPU();

    self.postMessage({ type: 'status', status: 'loading', progress: 0, model: currentModel });

    // Configure pipeline options
    const pipelineOptions = {
      progress_callback: (progress) => {
        const file = progress.file || progress.name || '';
        const fileName = file.split('/').pop() || file;

        if (progress.status === 'progress') {
          downloadProgress.set(fileName, {
            loaded: progress.loaded || 0,
            total: progress.total || 0
          });
          updateTotalProgress();
        } else if (progress.status === 'done') {
          const info = downloadProgress.get(fileName);
          if (info) {
            info.loaded = info.total;
            updateTotalProgress();
          }
        } else if (progress.status === 'initiate') {
          downloadProgress.set(fileName, { loaded: 0, total: 0 });
          self.postMessage({
            type: 'status',
            status: 'initiate',
            file: fileName
          });
        } else if (progress.status === 'ready') {
          self.postMessage({ type: 'status', status: 'loading', progress: 100 });
        }
      }
    };

    // Use WebGPU device if available
    if (useWebGPU) {
      pipelineOptions.device = 'webgpu';
    }

    whisperPipeline = await pipeline(
      'automatic-speech-recognition',
      currentModel,
      pipelineOptions
    );

    self.postMessage({ type: 'status', status: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }

  isLoading = false;
}

async function transcribe(audioData) {
  if (!whisperPipeline) {
    self.postMessage({ type: 'error', error: 'Model not loaded' });
    return;
  }

  // Skip if already processing (WebGPU can't handle concurrent sessions)
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const float32Data = new Float32Array(audioData);

    // Check for silence
    let sumSquares = 0;
    for (let i = 0; i < float32Data.length; i++) {
      sumSquares += float32Data[i] * float32Data[i];
    }
    const rms = Math.sqrt(sumSquares / float32Data.length);

    if (rms < 0.005) {
      self.postMessage({ type: 'result', text: '', silent: true, processingTime: 0 });
      isProcessing = false;
      return;
    }

    // Run Whisper
    const startTime = performance.now();
    const result = await whisperPipeline(float32Data);
    const processingTime = Math.round(performance.now() - startTime);

    const text = result?.text || '';
    self.postMessage({ type: 'result', text, processingTime });

  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  } finally {
    isProcessing = false;
  }
}
