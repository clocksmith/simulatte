/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/browser-fs-access@0.29.1/dist/file-open-7c801643.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var p=async(t=[{}])=>(Array.isArray(t)||(t=[t]),new Promise((n,c)=>{const e=document.createElement("input");e.type="file";const s=[...t.map(a=>a.mimeTypes||[]),...t.map(a=>a.extensions||[])].join();e.multiple=t[0].multiple||!1,e.accept=s||"";const l=a=>{typeof i=="function"&&i(),n(a)},i=t[0].legacySetup&&t[0].legacySetup(l,()=>i(c),e);e.addEventListener("change",()=>{l(e.multiple?Array.from(e.files):e.files[0])}),e.click()}));export{p as default};
//# sourceMappingURL=/sm/8604a7da0f2e38445a30df48567cbe5f3c7b8446040223ba0d3fd45c6cc3350c.map