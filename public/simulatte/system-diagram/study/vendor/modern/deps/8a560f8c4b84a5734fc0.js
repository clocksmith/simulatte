/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/react-remove-scroll-bar@2.3.8/dist/es2015/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as l from"../react.js";import{styleSingleton as m}from"./137cbff36dd15ffb6563.js";var i="right-scroll-bar-position",d="width-before-scroll-bar",v="with-scroll-bars-hidden",f="--removed-body-scroll-bar-size",b={left:0,top:0,right:0,gap:0},u=function(n){return parseInt(n||"",10)||0},y=function(n){var r=window.getComputedStyle(document.body),o=r[n==="padding"?"paddingLeft":"marginLeft"],t=r[n==="padding"?"paddingTop":"marginTop"],e=r[n==="padding"?"paddingRight":"marginRight"];return[u(o),u(t),u(e)]},s=function(n){if(n===void 0&&(n="margin"),typeof window>"u")return b;var r=y(n),o=document.documentElement.clientWidth,t=window.innerWidth;return{left:r[0],top:r[1],right:r[2],gap:Math.max(0,t-o+r[2]-r[0])}},w=m(),c="data-scroll-locked",x=function(n,r,o,t){var e=n.left,g=n.top,h=n.right,a=n.gap;return o===void 0&&(o="margin"),`
  .`.concat(v,` {
   overflow: hidden `).concat(t,`;
   padding-right: `).concat(a,"px ").concat(t,`;
  }
  body[`).concat(c,`] {
    overflow: hidden `).concat(t,`;
    overscroll-behavior: contain;
    `).concat([r&&"position: relative ".concat(t,";"),o==="margin"&&`
    padding-left: `.concat(e,`px;
    padding-top: `).concat(g,`px;
    padding-right: `).concat(h,`px;
    margin-left:0;
    margin-top:0;
    margin-right: `).concat(a,"px ").concat(t,`;
    `),o==="padding"&&"padding-right: ".concat(a,"px ").concat(t,";")].filter(Boolean).join(""),`
  }
  
  .`).concat(i,` {
    right: `).concat(a,"px ").concat(t,`;
  }
  
  .`).concat(d,` {
    margin-right: `).concat(a,"px ").concat(t,`;
  }
  
  .`).concat(i," .").concat(i,` {
    right: 0 `).concat(t,`;
  }
  
  .`).concat(d," .").concat(d,` {
    margin-right: 0 `).concat(t,`;
  }
  
  body[`).concat(c,`] {
    `).concat(f,": ").concat(a,`px;
  }
`)},p=function(){var n=parseInt(document.body.getAttribute(c)||"0",10);return isFinite(n)?n:0},S=function(){l.useEffect(function(){return document.body.setAttribute(c,(p()+1).toString()),function(){var n=p()-1;n<=0?document.body.removeAttribute(c):document.body.setAttribute(c,n.toString())}},[])},C=function(n){var r=n.noRelative,o=n.noImportant,t=n.gapMode,e=t===void 0?"margin":t;S();var g=l.useMemo(function(){return s(e)},[e]);return l.createElement(w,{styles:x(g,!r,e,o?"":"!important")})};export{C as RemoveScrollBar,d as fullWidthClassName,s as getGapWidth,v as noScrollbarsClassName,f as removedBarSizeVariable,i as zeroRightClassName};
//# sourceMappingURL=/sm/8412e0af396e505953c552a9adbaca78c47d986f2f6baf35efa95904214c7dc0.map