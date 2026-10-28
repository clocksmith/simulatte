/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/fuzzy@0.1.3/lib/fuzzy.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var h={exports:{}},x;function m(){return x||(x=1,(function(z,w){(function(){var u={};z.exports=u,u.simpleFilter=function(e,t){return t.filter(function(r){return u.test(e,r)})},u.test=function(e,t){return u.match(e,t)!==null},u.match=function(e,t,r){r=r||{};var n=0,i=[],f=t.length,o=0,c=0,l=r.pre||"",g=r.post||"",d=r.caseSensitive&&t||t.toLowerCase(),s;e=r.caseSensitive&&e||e.toLowerCase();for(var v=0;v<f;v++)s=t[v],d[v]===e[n]?(s=l+s+g,n+=1,c+=1+c):c=0,o+=c,i[i.length]=s;return n===e.length?(o=d===e?1/0:o,{rendered:i.join(""),score:o}):null},u.filter=function(e,t,r){return!t||t.length===0?[]:typeof e!="string"?t:(r=r||{},t.reduce(function(n,i,f,o){var c=i;r.extract&&(c=r.extract(i));var l=u.match(e,c,r);return l!=null&&(n[n.length]={string:l.rendered,score:l.score,index:f,original:i}),n},[]).sort(function(n,i){var f=i.score-n.score;return f||n.index-i.index}))}})()})(h)),h.exports}var a=m(),y=a.filter,F=a.match,S=a.simpleFilter,q=a.test;export{a as default,y as filter,F as match,S as simpleFilter,q as test};
//# sourceMappingURL=/sm/f043353dc8a1664f83755cb81c45eba467f80eadc96fd9afb50a7c9584b0366d.map