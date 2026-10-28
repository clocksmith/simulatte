/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/points-on-path@0.2.1/lib/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{simplify as m,pointsOnBezierCurves as d}from"./42e2603094a238a54ccc.js";import{parsePath as P,normalize as b,absolutize as k}from"./297c9c1d9ac8ad123b06.js";function z(c,l,p){const f=P(c),g=b(k(f)),o=[];let e=[],n=[0,0],s=[];const i=()=>{s.length>=4&&e.push(...d(s,l)),s=[]},a=()=>{i(),e.length&&(o.push(e),e=[])};for(const{key:r,data:t}of g)switch(r){case"M":a(),n=[t[0],t[1]],e.push(n);break;case"L":i(),e.push([t[0],t[1]]);break;case"C":if(!s.length){const u=e.length?e[e.length-1]:n;s.push([u[0],u[1]])}s.push([t[0],t[1]]),s.push([t[2],t[3]]),s.push([t[4],t[5]]);break;case"Z":i(),e.push([n[0],n[1]]);break}if(a(),!p)return o;const h=[];for(const r of o){const t=m(r,p);t.length&&h.push(t)}return h}export{z as pointsOnPath};
//# sourceMappingURL=/sm/45399304c7ac6ee4516fb43f678a497f24e35a08b1e77f5bceface8181ca511f.map