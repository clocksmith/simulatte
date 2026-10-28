/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/nanoid@4.0.2/index.browser.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
const i="useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";let a=t=>crypto.getRandomValues(new Uint8Array(t)),u=(t,e,l)=>{let n=(2<<Math.log(t.length-1)/Math.LN2)-1,o=-~(1.6*n*e/t.length);return(g=e)=>{let r="";for(;;){let h=l(o),s=o;for(;s--;)if(r+=t[h[s]&n]||"",r.length===g)return r}}},m=(t,e=21)=>u(t,e,a),c=(t=21)=>crypto.getRandomValues(new Uint8Array(t)).reduce((e,l)=>(l&=63,l<36?e+=l.toString(36):l<62?e+=(l-26).toString(36).toUpperCase():l>62?e+="-":e+="_",e),"");export{m as customAlphabet,u as customRandom,c as nanoid,a as random,i as urlAlphabet};
//# sourceMappingURL=/sm/8b2e979c8a34e12394ad7957031909caddfbe5f6cab20c15144556f7e2216059.map