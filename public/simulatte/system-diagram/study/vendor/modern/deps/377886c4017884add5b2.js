/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/dayjs@1.11.19/plugin/advancedFormat.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t={exports:{}},m=t.exports,u;function w(){return u||(u=1,(function(d,v){(function(f,a){d.exports=a()})(m,(function(){return function(f,a){var s=a.prototype,o=s.format;s.format=function(c){var e=this,i=this.$locale();if(!this.isValid())return o.bind(this)(c);var n=this.$utils(),g=(c||"YYYY-MM-DDTHH:mm:ssZ").replace(/\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g,(function(r){switch(r){case"Q":return Math.ceil((e.$M+1)/3);case"Do":return i.ordinal(e.$D);case"gggg":return e.weekYear();case"GGGG":return e.isoWeekYear();case"wo":return i.ordinal(e.week(),"W");case"w":case"ww":return n.s(e.week(),r==="w"?1:2,"0");case"W":case"WW":return n.s(e.isoWeek(),r==="W"?1:2,"0");case"k":case"kk":return n.s(String(e.$H===0?24:e.$H),r==="k"?1:2,"0");case"X":return Math.floor(e.$d.getTime()/1e3);case"x":return e.$d.getTime();case"z":return"["+e.offsetName()+"]";case"zzz":return"["+e.offsetName("long")+"]";default:return r}}));return o.bind(this)(g)}}}))})(t)),t.exports}var l=w();export{l as default};
//# sourceMappingURL=/sm/91890232516e179d3714a0efb933568fe91b426a79e82e2a32d34e72b34452aa.map