/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-primitive@2.0.2/dist/index.mjs
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as f from"../react.js";import*as p from"../react-dom.js";import{Slot as u}from"./75b159e59415b1ff7a97.js";import{jsx as c}from"../jsx-runtime.js";var d=["a","button","div","form","h2","h3","img","input","label","li","nav","ol","p","span","svg","ul"],t=d.reduce((r,i)=>{const o=f.forwardRef((e,a)=>{const{asChild:m,...n}=e,s=m?u:i;return typeof window<"u"&&(window[Symbol.for("radix-ui")]=!0),c(s,{...n,ref:a})});return o.displayName=`Primitive.${i}`,{...r,[i]:o}},{});function v(r,i){r&&p.flushSync(()=>r.dispatchEvent(i))}var l=t;export{t as Primitive,l as Root,v as dispatchDiscreteCustomEvent};
//# sourceMappingURL=/sm/6b2800918c3bf1073d136ae6a16a7c7665b7e13ce08f263dae0cc3a968ba4823.map