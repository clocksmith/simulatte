/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/jotai@2.9.3/esm/react/utils.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{useCallback as a,useMemo as i}from"../react.js";import{useSetAtom as u,useAtom as l,useStore as f}from"./759d099bcb18fa06dc37.js";import{RESET as p}from"./6f688b382ab880cdb28f.js";import{atom as A}from"./f8e896a0213b33a40fc2.js";function h(e,t){const o=u(e,t);return a(()=>o(p),[o])}function y(e,t,o){(import.meta.env?import.meta.env.MODE:void 0)!=="production"&&console.warn("[DEPRECATED] useReducerAtom is deprecated and will be removed in the future. Please create your own version using the recipe. https://github.com/pmndrs/jotai/pull/2467");const[n,r]=l(e,o),s=a(c=>{r(d=>t(d,c))},[r,t]);return[n,s]}function S(e,t){const o=i(()=>A(null,(n,r,...s)=>e(n,r,...s)),[e]);return u(o,t)}const m=new WeakMap;function v(e,t){const o=f(t),n=E(o);for(const[r,s]of e)(!n.has(r)||t?.dangerouslyForceHydrate)&&(n.add(r),o.set(r,s))}const E=e=>{let t=m.get(e);return t||(t=new WeakSet,m.set(e,t)),t};export{S as useAtomCallback,v as useHydrateAtoms,y as useReducerAtom,h as useResetAtom};
//# sourceMappingURL=/sm/a9c17aef4db620110178d9a1435e08cadf5d588d8d2657d8826c1d437958df9e.map