/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-id@1.1.0/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as r from"../react.js";import{useLayoutEffect as e}from"./4014da1ac5c51da2e777.js";var f=r.useId||(()=>{}),s=0;function n(t){const[o,u]=r.useState(f());return e(()=>{t||u(a=>a??String(s++))},[t]),t||(o?`radix-${o}`:"")}export{n as useId};
//# sourceMappingURL=/sm/9504ce56641d967344f5f495785f2a0dc30097af436710f113eaae2f6c683870.map