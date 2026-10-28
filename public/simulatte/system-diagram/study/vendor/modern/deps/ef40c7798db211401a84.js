/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/dayjs@1.11.19/plugin/isoWeek.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var o={exports:{}},v=o.exports,h;function x(){return h||(h=1,(function(k,$){(function(a,u){k.exports=u()})(v,(function(){var a="day";return function(u,y,d){var f=function(e){return e.add(4-e.isoWeekday(),a)},s=y.prototype;s.isoWeekYear=function(){return f(this).year()},s.isoWeek=function(e){if(!this.$utils().u(e))return this.add(7*(e-this.isoWeek()),a);var t,r,i,n,c=f(this),p=(t=this.isoWeekYear(),r=this.$u,i=(r?d.utc:d)().year(t).startOf("year"),n=4-i.isoWeekday(),i.isoWeekday()>4&&(n+=7),i.add(n,a));return c.diff(p,"week")+1},s.isoWeekday=function(e){return this.$utils().u(e)?this.day()||7:this.day(this.day()%7?e:e-7)};var W=s.startOf;s.startOf=function(e,t){var r=this.$utils(),i=!!r.u(t)||t;return r.p(e)==="isoweek"?i?this.date(this.date()-(this.isoWeekday()-1)).startOf("day"):this.date(this.date()-1-(this.isoWeekday()-1)+7).endOf("day"):W.bind(this)(e,t)}}}))})(o)),o.exports}var O=x();export{O as default};
//# sourceMappingURL=/sm/c8244b35f0e4f4df6fc5f7fc251b6e82b5bcba31d7c976fa3bb18a3b555ce30b.map