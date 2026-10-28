/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/ts-dedent@2.2.0/esm/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function d(o){for(var f=[],i=1;i<arguments.length;i++)f[i-1]=arguments[i];var n=Array.from(typeof o=="string"?[o]:o);n[n.length-1]=n[n.length-1].replace(/\r?\n([\t ]*)$/,"");var s=n.reduce(function(t,u){var a=u.match(/\n([\t ]+|(?!\s).)/g);return a?t.concat(a.map(function(g){var r,e;return(e=(r=g.match(/[\t ]/g))===null||r===void 0?void 0:r.length)!==null&&e!==void 0?e:0})):t},[]);if(s.length){var h=new RegExp(`
[	 ]{`+Math.min.apply(Math,s)+"}","g");n=n.map(function(t){return t.replace(h,`
`)})}n[0]=n[0].replace(/^\r?\n/,"");var c=n[0];return f.forEach(function(t,u){var a=c.match(/(?:^|\n)( *)$/),g=a?a[1]:"",r=t;typeof t=="string"&&t.includes(`
`)&&(r=String(t).split(`
`).map(function(e,l){return l===0?e:""+g+e}).join(`
`)),c+=r+n[u+1]}),c}export{d as dedent,d as default};
//# sourceMappingURL=/sm/cac2cf42096b7efbcb0d11dc1151a88adfeb3cf303686df4d1e57268f87ee813.map