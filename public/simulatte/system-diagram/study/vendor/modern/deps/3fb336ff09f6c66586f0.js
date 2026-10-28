/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-focus-guards@1.1.1/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as a from"../react.js";var t=0;function n(e){return o(),e.children}function o(){a.useEffect(()=>{const e=document.querySelectorAll("[data-radix-focus-guard]");return document.body.insertAdjacentElement("afterbegin",e[0]??r()),document.body.insertAdjacentElement("beforeend",e[1]??r()),t++,()=>{t===1&&document.querySelectorAll("[data-radix-focus-guard]").forEach(u=>u.remove()),t--}},[])}function r(){const e=document.createElement("span");return e.setAttribute("data-radix-focus-guard",""),e.tabIndex=0,e.style.outline="none",e.style.opacity="0",e.style.position="fixed",e.style.pointerEvents="none",e}var c=n;export{n as FocusGuards,c as Root,o as useFocusGuards};
//# sourceMappingURL=/sm/cc3fa7cac2ca3d9e752870eb422e4a7189c9bffbc9302304f3c5c855734ddf17.map