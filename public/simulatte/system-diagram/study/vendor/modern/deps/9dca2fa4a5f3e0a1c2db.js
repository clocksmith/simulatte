/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/tunnel-rat@0.1.2/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import r from"../react.js";import{create as f}from"./be326721e43dcb767c51.js";var u,c;const i=typeof window<"u"&&((u=window.document)!=null&&u.createElement||((c=window.navigator)==null?void 0:c.product)==="ReactNative")?r.useLayoutEffect:r.useEffect;function l(){const o=f(t=>({current:new Array,version:0,set:t}));return{In:({children:t})=>{const n=o(e=>e.set),s=o(e=>e.version);return i(()=>{n(e=>({version:e.version+1}))},[]),i(()=>(n(({current:e})=>({current:[...e,t]})),()=>n(({current:e})=>({current:e.filter(a=>a!==t)}))),[t,s]),null},Out:()=>{const t=o(n=>n.current);return r.createElement(r.Fragment,null,t)}}}export{l as default};
//# sourceMappingURL=/sm/7d22f4f3d5a89c753606b1c5d68ffd8da198db94fb6955af71f17e995283f5b3.map