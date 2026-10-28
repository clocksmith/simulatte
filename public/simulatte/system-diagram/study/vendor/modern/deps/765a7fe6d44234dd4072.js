/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@braintree/sanitize-url@6.0.2/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t={},n;function g(){if(n)return t;n=1,Object.defineProperty(t,"__esModule",{value:!0}),t.sanitizeUrl=void 0;var u=/^([^\w]*)(javascript|data|vbscript)/im,l=/&#(\w+)(^\w|;)?/g,s=/&(newline|tab);/gi,o=/[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim,c=/^.+(:|&colon;)/gim,v=[".","/"];function d(e){return v.indexOf(e[0])>-1}function f(e){return e.replace(l,function(r,i){return String.fromCharCode(i)})}function h(e){var r=f(e||"").replace(s,"").replace(o,"").trim();if(!r)return"about:blank";if(d(r))return r;var i=r.match(c);if(!i)return r;var m=i[0];return u.test(m)?"about:blank":r}return t.sanitizeUrl=h,t}var a=g(),p=a.__esModule,x=a.sanitizeUrl;export{p as __esModule,a as default,x as sanitizeUrl};
//# sourceMappingURL=/sm/ea2e77024c3402633f84958ff3607a062ceee7c644cfd0ecb23cc04b14b36812.map