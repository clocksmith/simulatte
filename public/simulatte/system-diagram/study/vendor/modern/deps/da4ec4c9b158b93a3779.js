/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-slot@1.0.1/dist/index.module.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import m from"./7e28119a254665edde98.js";import{forwardRef as $,Children as s,isValidElement as f,createElement as a,cloneElement as b,Fragment as y}from"../react.js";import{composeRefs as S}from"./ba0ad00898a5de28eda8.js";const p=$((r,o)=>{const{children:e,...n}=r,t=s.toArray(e),l=t.find(x);if(l){const c=l.props.children,i=t.map(d=>d===l?s.count(c)>1?s.only(null):f(c)?c.props.children:null:d);return a(u,m({},n,{ref:o}),f(c)?b(c,void 0,i):null)}return a(u,m({},n,{ref:o}),e)});p.displayName="Slot";const u=$((r,o)=>{const{children:e,...n}=r;return f(e)?b(e,{...v(n,e.props),ref:S(o,e.ref)}):s.count(e)>1?s.only(null):null});u.displayName="SlotClone";const h=({children:r})=>a(y,null,r);function x(r){return f(r)&&r.type===h}function v(r,o){const e={...o};for(const n in o){const t=r[n],l=o[n];/^on[A-Z]/.test(n)?t&&l?e[n]=(...i)=>{l(...i),t(...i)}:t&&(e[n]=t):n==="style"?e[n]={...t,...l}:n==="className"&&(e[n]=[t,l].filter(Boolean).join(" "))}return{...r,...e}}const C=p;export{C as Root,p as Slot,h as Slottable};
//# sourceMappingURL=/sm/2a1c7c56e41232ae954a8fe167cd71228d4ed1836a3207a1eef318831365f8d9.map