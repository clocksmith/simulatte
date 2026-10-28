/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/points-on-curve@0.2.0/lib/curve-to-bezier.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function c(t){return[...t]}function a(t,f=0){const s=t.length;if(s<3)throw new Error("A curve must have at least three points.");const l=[];if(s===3)l.push(c(t[0]),c(t[1]),c(t[2]),c(t[2]));else{const r=[];r.push(t[0],t[0]);for(let e=1;e<t.length;e++)r.push(t[e]),e===t.length-1&&r.push(t[e]);const u=[],h=1-f;l.push(c(r[0]));for(let e=1;e+2<r.length;e++){const o=r[e];u[0]=[o[0],o[1]],u[1]=[o[0]+(h*r[e+1][0]-h*r[e-1][0])/6,o[1]+(h*r[e+1][1]-h*r[e-1][1])/6],u[2]=[r[e+1][0]+(h*r[e][0]-h*r[e+2][0])/6,r[e+1][1]+(h*r[e][1]-h*r[e+2][1])/6],u[3]=[r[e+1][0],r[e+1][1]],l.push(u[1],u[2],u[3])}}return l}export{a as curveToBezier};
//# sourceMappingURL=/sm/20b2049b572ee0b11bc40208122040a3ff3ec9c142501441516b7d9a630827a3.map