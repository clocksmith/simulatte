/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-use-controllable-state@1.1.0/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as l from"../react.js";import{useCallbackRef as f}from"./df1b46dd534a5b33a60e.js";function v({prop:t,defaultProp:r,onChange:s=()=>{}}){const[e,n]=C({defaultProp:r,onChange:s}),o=t!==void 0,i=o?t:e,u=f(s),d=l.useCallback(c=>{if(o){const a=typeof c=="function"?c(t):c;a!==t&&u(a)}else n(c)},[o,t,n,u]);return[i,d]}function C({defaultProp:t,onChange:r}){const s=l.useState(t),[e]=s,n=l.useRef(e),o=f(r);return l.useEffect(()=>{n.current!==e&&(o(e),n.current=e)},[e,n,o]),s}export{v as useControllableState};
//# sourceMappingURL=/sm/8ff2e58e13cfe414002caedbd2c7a578e8f6d497895cdc8bc583645ebb5c0cd2.map