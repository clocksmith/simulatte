/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@radix-ui/react-primitive@1.0.1/dist/index.module.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import m from"./7e28119a254665edde98.js";import{forwardRef as n,useEffect as p,createElement as d}from"../react.js";import{flushSync as $}from"../react-dom.js";import{Slot as l}from"./da4ec4c9b158b93a3779.js";const u=["a","button","div","h2","h3","img","label","li","nav","ol","p","span","svg","ul"],r=u.reduce((t,e)=>{const f=n((o,i)=>{const{asChild:c,...s}=o,a=c?l:e;return p(()=>{window[Symbol.for("radix-ui")]=!0},[]),d(a,m({},s,{ref:i}))});return f.displayName=`Primitive.${e}`,{...t,[e]:f}},{});function v(t,e){t&&$(()=>t.dispatchEvent(e))}const b=r;export{r as Primitive,b as Root,v as dispatchDiscreteCustomEvent};
//# sourceMappingURL=/sm/28a3cba96cb3d72abac47ebee02db57e7fb093fec57597cb51b21f69e806875f.map