/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zustand@4.3.7/esm/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{createStore as a}from"./3c868f1524c8a48fdb28.js";export*from"./3c868f1524c8a48fdb28.js";import{useDebugValue as c}from"../react.js";import m from"./b537dbebb42cbe38540e.js";const{useSyncExternalStoreWithSelector:p}=m;function n(e,t=e.getState,o){const r=p(e.subscribe,e.getState,e.getServerState||e.getState,t,o);return c(r),r}const s=e=>{(import.meta.env&&import.meta.env.MODE)!=="production"&&typeof e!="function"&&console.warn("[DEPRECATED] Passing a vanilla store will be unsupported in a future version. Instead use `import { useStore } from 'zustand'`.");const t=typeof e=="function"?a(e):e,o=(r,i)=>n(t,r,i);return Object.assign(o,t),o},u=e=>e?s(e):s;var f=e=>((import.meta.env&&import.meta.env.MODE)!=="production"&&console.warn("[DEPRECATED] Default export is deprecated. Instead use `import { create } from 'zustand'`."),u(e));export{u as create,f as default,n as useStore};
//# sourceMappingURL=/sm/a048b6fd3a79e361abf6dc9003546a6c4aee60b6463f7831f180609f203f97e0.map