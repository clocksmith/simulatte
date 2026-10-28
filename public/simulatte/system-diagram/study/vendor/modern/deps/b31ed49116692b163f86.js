/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/react-style-singleton@2.2.3/dist/es2015/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as a from"../react.js";import{getNonce as c}from"./a354818ec8c52af4a4e0.js";function l(){if(!document)return null;var t=document.createElement("style");t.type="text/css";var e=c();return e&&t.setAttribute("nonce",e),t}function d(t,e){t.styleSheet?t.styleSheet.cssText=e:t.appendChild(document.createTextNode(e))}function f(t){var e=document.head||document.getElementsByTagName("head")[0];e.appendChild(t)}var r=function(){var t=0,e=null;return{add:function(n){t==0&&(e=l())&&(d(e,n),f(e)),t++},remove:function(){t--,!t&&e&&(e.parentNode&&e.parentNode.removeChild(e),e=null)}}},o=function(){var t=r();return function(e,n){a.useEffect(function(){return t.add(e),function(){t.remove()}},[e&&n])}},s=function(){var t=o(),e=function(n){var u=n.styles,i=n.dynamic;return t(u,i),null};return e};export{o as styleHookSingleton,s as styleSingleton,r as stylesheetSingleton};
//# sourceMappingURL=/sm/ce0bef673aad4c1d610ff176f7474750892e10934508c3d66bf80adbcdee85f0.map