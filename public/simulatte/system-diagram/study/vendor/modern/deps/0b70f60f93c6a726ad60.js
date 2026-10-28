/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/browser-fs-access@0.29.1/dist/directory-open-01563666.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var y=async(e=[{}])=>(Array.isArray(e)||(e=[e]),e[0].recursive=e[0].recursive||!1,new Promise((s,l)=>{const r=document.createElement("input");r.type="file",r.webkitdirectory=!0;const a=t=>{typeof i=="function"&&i(),s(t)},i=e[0].legacySetup&&e[0].legacySetup(a,()=>i(l),r);r.addEventListener("change",()=>{let t=Array.from(r.files);e[0].recursive?e[0].recursive&&e[0].skipDirectory&&(t=t.filter(c=>c.webkitRelativePath.split("/").every(n=>!e[0].skipDirectory({name:n,kind:"directory"})))):t=t.filter(c=>c.webkitRelativePath.split("/").length===2),a(t)}),r.click()}));export{y as default};
//# sourceMappingURL=/sm/fe7d4870470e29c30698f7cad2f95669f95ea274b5cadb340767373a0d629723.map