/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-use-size@1.1.0/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as z from"../react.js";import{useLayoutEffect as n}from"./4014da1ac5c51da2e777.js";function u(r){const[h,e]=z.useState(void 0);return n(()=>{if(r){e({width:r.offsetWidth,height:r.offsetHeight});const f=new ResizeObserver(i=>{if(!Array.isArray(i)||!i.length)return;const b=i[0];let o,t;if("borderBoxSize"in b){const s=b.borderBoxSize,d=Array.isArray(s)?s[0]:s;o=d.inlineSize,t=d.blockSize}else o=r.offsetWidth,t=r.offsetHeight;e({width:o,height:t})});return f.observe(r,{box:"border-box"}),()=>f.unobserve(r)}else e(void 0)},[r]),h}export{u as useSize};
//# sourceMappingURL=/sm/b309f2dabd425904e851d3a8fab9318f79961fbd6f75f473652acf1ece42df7d.map