/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-id@1.0.0/dist/index.module.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as a from"../react.js";import{useLayoutEffect as f}from"./7afff32b7fd78628de57.js";const u=a.useId||(()=>{});let r=0;function n(t){const[$,e]=a.useState(u());return f(()=>{t||e(o=>o??String(r++))},[t]),t||($?`radix-${$}`:"")}export{n as useId};
//# sourceMappingURL=/sm/d071ff10ff86c0af1e26f550d315b15c819fade50048c51f0fc14156499277c3.map