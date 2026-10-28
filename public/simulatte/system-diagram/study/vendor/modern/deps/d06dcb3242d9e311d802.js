/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-use-callback-ref@1.0.0/dist/index.module.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{useRef as t,useEffect as u,useMemo as a}from"../react.js";function n(c){const e=t(c);return u(()=>{e.current=c}),a(()=>(...f)=>{var r;return(r=e.current)===null||r===void 0?void 0:r.call(e,...f)},[])}export{n as useCallbackRef};
//# sourceMappingURL=/sm/f98a0a08e237f55ca6610a06eb9abd886c9c67d01b4bd70c5815ba0349e9027b.map