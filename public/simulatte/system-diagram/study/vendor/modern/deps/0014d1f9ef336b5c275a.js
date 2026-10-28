/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/browser-fs-access@0.29.1/dist/file-save-745eba88.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var y=async(e,t=[{}],s=null,p=!1,o=null)=>{Array.isArray(t)||(t=[t]),t[0].fileName=t[0].fileName||"Untitled";const n=[];let i=null;if(e instanceof Blob&&e.type?i=e.type:e.headers&&e.headers.get("content-type")&&(i=e.headers.get("content-type")),t.forEach((a,r)=>{n[r]={description:a.description||"",accept:{}},a.mimeTypes?(r===0&&i&&a.mimeTypes.push(i),a.mimeTypes.map(d=>{n[r].accept[d]=a.extensions||[]})):i&&(n[r].accept[i]=a.extensions||[])}),s)try{await s.getFile()}catch(a){if(s=null,p)throw a}const c=s||await window.showSaveFilePicker({suggestedName:t[0].fileName,id:t[0].id,startIn:t[0].startIn,types:n,excludeAcceptAllOption:t[0].excludeAcceptAllOption||!1});!s&&o&&o();const l=await c.createWritable();return"stream"in e?(await e.stream().pipeTo(l),c):"body"in e?(await e.body.pipeTo(l),c):(await l.write(await e),await l.close(),c)};export{y as default};
//# sourceMappingURL=/sm/c078095b9feaeb37844a1b153ae7308e6cc62b35cfb22b7558a36b44d0ec9604.map