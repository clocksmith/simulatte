/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-use-escape-keydown@1.1.0/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as r from"../react.js";import{useCallbackRef as s}from"./df1b46dd534a5b33a60e.js";function c(n,e=globalThis?.document){const t=s(n);r.useEffect(()=>{const o=a=>{a.key==="Escape"&&t(a)};return e.addEventListener("keydown",o,{capture:!0}),()=>e.removeEventListener("keydown",o,{capture:!0})},[t,e])}export{c as useEscapeKeydown};
//# sourceMappingURL=/sm/8a0b51adb37955eb96d57745e3612a11514a677b3c5e9af34861a5cc90dec479.map