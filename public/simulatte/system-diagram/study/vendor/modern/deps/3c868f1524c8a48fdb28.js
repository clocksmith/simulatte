/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zustand@4.3.7/esm/vanilla.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const u=t=>{let e;const n=new Set,s=(o,i)=>{const r=typeof o=="function"?o(e):o;if(!Object.is(r,e)){const l=e;e=i??typeof r!="object"?r:Object.assign({},e,r),n.forEach(b=>b(e,l))}},c=()=>e,a={setState:s,getState:c,subscribe:o=>(n.add(o),()=>n.delete(o)),destroy:()=>{(import.meta.env&&import.meta.env.MODE)!=="production"&&console.warn("[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected."),n.clear()}};return e=t(s,c,a),a},d=t=>t?u(t):u;var p=t=>((import.meta.env&&import.meta.env.MODE)!=="production"&&console.warn("[DEPRECATED] Default export is deprecated. Instead use import { createStore } from 'zustand/vanilla'."),d(t));export{d as createStore,p as default};
//# sourceMappingURL=/sm/22f03b569c3d6b1615b659c91903faece8e21278d5b32b124aa9abc4cec27f44.map