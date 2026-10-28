/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-use-controllable-state@1.0.0/dist/index.module.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{useCallback as i,useState as C,useRef as h,useEffect as $}from"../react.js";import{useCallbackRef as u}from"./d06dcb3242d9e311d802.js";function p({prop:e,defaultProp:l,onChange:c=()=>{}}){const[t,n]=v({defaultProp:l,onChange:c}),o=e!==void 0,f=o?e:t,s=u(c),d=i(r=>{if(o){const a=typeof r=="function"?r(e):r;a!==e&&s(a)}else n(r)},[o,e,n,s]);return[f,d]}function v({defaultProp:e,onChange:l}){const c=C(e),[t]=c,n=h(t),o=u(l);return $(()=>{n.current!==t&&(o(t),n.current=t)},[t,n,o]),c}export{p as useControllableState};
//# sourceMappingURL=/sm/84025aae8c1b3b3a134f453cfd197f6b916475fc7a8d183782e1190be7cc2430.map