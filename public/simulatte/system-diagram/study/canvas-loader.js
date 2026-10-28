// The pinned upstream ESM build owns drawing, the native font picker and canvas gestures.
// Other study scripts remain classic modules; start their coordinator only after the canvas exists.
import * as ExcalidrawLib from './vendor/modern/index.js';
globalThis.ExcalidrawLib = ExcalidrawLib;
await import('./app.js');
