/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@excalidraw/markdown-to-text@0.1.2/dist/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var a={},c;function d(){if(c)return a;c=1,Object.defineProperty(a,"__esModule",{value:!0}),a.removeMarkdown=void 0;var g=function(l,e){e===void 0&&(e={listUnicodeChar:""}),e=e||{},e.listUnicodeChar=e.hasOwnProperty("listUnicodeChar")?e.listUnicodeChar:!1,e.stripListLeaders=e.hasOwnProperty("stripListLeaders")?e.stripListLeaders:!0,e.gfm=e.hasOwnProperty("gfm")?e.gfm:!0,e.useImgAltText=e.hasOwnProperty("useImgAltText")?e.useImgAltText:!0,e.preserveLinks=e.hasOwnProperty("preserveLinks")?e.preserveLinks:!1;var r=l||"";r=r.replace(/^(-\s*?|\*\s*?|_\s*?){3,}\s*$/gm,"");try{e.stripListLeaders&&(e.listUnicodeChar?r=r.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm,e.listUnicodeChar+" $1"):r=r.replace(/^([\s\t]*)([\*\-\+]|\d+\.)\s+/gm,"$1")),e.gfm&&(r=r.replace(/\n={2,}/g,`
`).replace(/~{3}.*\n/g,"").replace(/~~/g,"").replace(/`{3}.*\n/g,"")),e.preserveLinks&&(r=r.replace(/\[(.*?)\][\[\(](.*?)[\]\)]/g,"$1 ($2)")),r=r.replace(/<[^>]*>/g,"").replace(/^[=\-]{2,}\s*$/g,"").replace(/\[\^.+?\](\: .*?$)?/g,"").replace(/\s{0,2}\[.*?\]: .*?$/g,"").replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g,e.useImgAltText?"$1":"").replace(/\[(.*?)\][\[\(].*?[\]\)]/g,"$1").replace(/^\s{0,3}>\s?/g,"").replace(/(^|\n)\s{0,3}>\s?/g,`

`).replace(/^\s{1,2}\[(.*?)\]: (\S+)( ".*?")?\s*$/g,"").replace(/^(\n)?\s{0,}#{1,6}\s+| {0,}(\n)?\s{0,}#{0,} {0,}(\n)?\s{0,}$/gm,"$1$2$3").replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g,"$2").replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g,"$2").replace(/(`{3,})(.*?)\1/gm,"$2").replace(/`(.+?)`/g,"$1").replace(/\n{2,}/g,`

`)}catch(t){return console.error(t),l}return r};return a.removeMarkdown=g,a}var s=d(),u=s.__esModule,v=s.removeMarkdown;export{u as __esModule,s as default,v as removeMarkdown};
//# sourceMappingURL=/sm/f7784c09d07f0eac0313c902ce78d5319941f5c6307d3b19448823fc812b9218.map