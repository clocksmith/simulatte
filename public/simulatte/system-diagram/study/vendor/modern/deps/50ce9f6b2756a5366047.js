/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/nanoid@3.3.3/index.browser.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
let i="useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict",a=t=>crypto.getRandomValues(new Uint8Array(t)),u=(t,e,l)=>{let n=(2<<Math.log(t.length-1)/Math.LN2)-1,o=-~(1.6*n*e/t.length);return(g=e)=>{let r="";for(;;){let h=l(o),s=o;for(;s--;)if(r+=t[h[s]&n]||"",r.length===g)return r}}},m=(t,e=21)=>u(t,e,a),p=(t=21)=>crypto.getRandomValues(new Uint8Array(t)).reduce((e,l)=>(l&=63,l<36?e+=l.toString(36):l<62?e+=(l-26).toString(36).toUpperCase():l>62?e+="-":e+="_",e),"");export{m as customAlphabet,u as customRandom,p as nanoid,a as random,i as urlAlphabet};
//# sourceMappingURL=/sm/c084996ca751f8acd088cef5ab78d420acfe2818d38c593b4212aedbf07cba83.map