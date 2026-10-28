/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-compose-refs@1.1.1/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as i from"../react.js";function l(n,o){if(typeof n=="function")return n(o);n!=null&&(n.current=o)}function f(...n){return o=>{let u=!1;const c=n.map(t=>{const e=l(t,o);return!u&&typeof e=="function"&&(u=!0),e});if(u)return()=>{for(let t=0;t<c.length;t++){const e=c[t];typeof e=="function"?e():l(n[t],null)}}}}function s(...n){return i.useCallback(f(...n),n)}export{f as composeRefs,s as useComposedRefs};
//# sourceMappingURL=/sm/616894b644e0526fd34778d50521a69a8ae87a4a7c6028cd1e7d5e0592872be7.map