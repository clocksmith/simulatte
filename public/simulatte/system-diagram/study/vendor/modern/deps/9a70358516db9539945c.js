/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/@chevrotain/cst-dts-gen@11.1.1/lib/src/api.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{GAstVisitor as v,NonTerminal as y}from"./0effcb5cb8de9485b978.js";import{values as g,map as r,groupBy as T,some as I,assign as C,flatten as p,upperFirst as f,isArray as O,uniq as E,reduce as $}from"./cff6568aac6d35045b42.js";function B(t){const e=new A,n=g(t);return r(n,i=>e.visitRule(i))}class A extends v{visitRule(e){const n=this.visitEach(e.definition),i=T(n,a=>a.propertyName),o=r(i,(a,N)=>{const h=!I(a,c=>!c.canBeNull);let l=a[0].type;return a.length>1&&(l=r(a,c=>c.type)),{name:N,type:l,optional:h}});return{name:e.name,properties:o}}visitAlternative(e){return this.visitEachAndOverrideWith(e.definition,{canBeNull:!0})}visitOption(e){return this.visitEachAndOverrideWith(e.definition,{canBeNull:!0})}visitRepetition(e){return this.visitEachAndOverrideWith(e.definition,{canBeNull:!0})}visitRepetitionMandatory(e){return this.visitEach(e.definition)}visitRepetitionMandatoryWithSeparator(e){return this.visitEach(e.definition).concat({propertyName:e.separator.name,canBeNull:!0,type:s(e.separator)})}visitRepetitionWithSeparator(e){return this.visitEachAndOverrideWith(e.definition,{canBeNull:!0}).concat({propertyName:e.separator.name,canBeNull:!0,type:s(e.separator)})}visitAlternation(e){return this.visitEachAndOverrideWith(e.definition,{canBeNull:!0})}visitTerminal(e){return[{propertyName:e.label||e.terminalType.name,canBeNull:!1,type:s(e)}]}visitNonTerminal(e){return[{propertyName:e.label||e.nonTerminalName,canBeNull:!1,type:s(e)}]}visitEachAndOverrideWith(e,n){return r(this.visitEach(e),i=>C({},i,n))}visitEach(e){return p(r(e,n=>this.visit(n)))}}function s(t){return t instanceof y?{kind:"rule",name:t.referencedRule.name}:{kind:"token"}}function R(t,e){let n=[];return n=n.concat('import type { CstNode, ICstVisitor, IToken } from "chevrotain";'),n=n.concat(p(r(t,i=>V(i)))),e.includeVisitorInterface&&(n=n.concat(x(e.visitorInterfaceName,t))),n.join(`

`)+`
`}function V(t){const e=W(t),n=b(t);return[e,n]}function W(t){const e=d(t.name),n=u(t.name);return`export interface ${e} extends CstNode {
  name: "${t.name}";
  children: ${n};
}`}function b(t){return`export type ${u(t.name)} = {
  ${r(t.properties,n=>k(n)).join(`
  `)}
};`}function k(t){const e=j(t.type);return`${t.name}${t.optional?"?":""}: ${e}[];`}function x(t,e){return`export interface ${t}<IN, OUT> extends ICstVisitor<IN, OUT> {
  ${r(e,n=>S(n)).join(`
  `)}
}`}function S(t){const e=u(t.name);return`${t.name}(children: ${e}, param?: IN): OUT;`}function j(t){if(O(t)){const e=E(r(t,i=>m(i)));return"("+$(e,(i,o)=>i+" | "+o)+")"}else return m(t)}function m(t){return t.kind==="token"?"IToken":d(t.name)}function d(t){return f(t)+"CstNode"}function u(t){return f(t)+"CstChildren"}const D={includeVisitorInterface:!0,visitorInterfaceName:"ICstNodeVisitor"};function M(t,e){const n=Object.assign(Object.assign({},D),e),i=B(t);return R(i,n)}export{M as generateCstDts};
//# sourceMappingURL=/sm/1e5f36c03d67e39b9fd2316c0a87c822f96bf165de3ec8e5a2102f745585bbee.map