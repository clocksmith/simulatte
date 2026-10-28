/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/browser-fs-access@0.29.1/dist/file-open-002ab408.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const l=async e=>{const a=await e.getFile();return a.handle=e,a};var p=async(e=[{}])=>{Array.isArray(e)||(e=[e]);const a=[];e.forEach((i,c)=>{a[c]={description:i.description||"",accept:{}},i.mimeTypes?i.mimeTypes.map(n=>{a[c].accept[n]=i.extensions||[]}):a[c].accept["*/*"]=i.extensions||[]});const t=await window.showOpenFilePicker({id:e[0].id,startIn:e[0].startIn,types:a,multiple:e[0].multiple||!1,excludeAcceptAllOption:e[0].excludeAcceptAllOption||!1}),s=await Promise.all(t.map(l));return e[0].multiple?s:s[0]};export{p as default};
//# sourceMappingURL=/sm/0f01405ecc795f9e290824766ade86c60d561cf92c3ac0cfa33f6d20c85ef21b.map