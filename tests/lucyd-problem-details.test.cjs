'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../public/simulatte/system-diagram/problem-details.js');
test('legacy notes become a brief, indented interface, requirements and followups without duplicating the prompt',()=>{
  const input='* **Prompt:** Implement a cache.\n  ```java\n  interface Storage {\n      void fetch();\n  }\n  ```\n* **Key Requirements:**\n  1. **Concurrency:** Share pending fetches.\n\nAdditional practice prompt (not verified):\n[Company IC6] Implement a cache again.\nRace handling: What happens when a fetch fails?';
  const r=B.migrate(input,'systems-coding');
  assert.equal(r.description,'Implement a cache.');
  assert.equal(r.details.interfaces[0].code,'interface Storage {\n    void fetch();\n}');
  assert.deepEqual(r.details.requirements,['Concurrency: Share pending fetches.']);
  assert.deepEqual(r.followups,[{id:'discussion-1',title:'Race handling',prompt:'What happens when a fetch fails?'}]);
  assert.equal(B.validate(r.details),r.details);
});
test('references need explicit scope and secure URLs; background cannot masquerade as question provenance',()=>{
  const d=B.empty('coding'),ref={id:'reference',title:'Technical documentation',url:'https://example.com/docs',scope:'background',note:'Documents the API, not this question.'};
  d.references=[ref];assert.doesNotThrow(()=>B.validate(d));
  for(const patch of [{scope:'company-published'},{url:'javascript:alert(1)'},{url:'https://secret@example.com/'},{note:''}])assert.throws(()=>B.validate({...d,references:[{...ref,...patch}]}),/reference/);
  assert.throws(()=>B.validate({...d,references:[ref,ref]}),/reference/);
  assert.throws(()=>B.validate({...d,exerciseType:'unknown'}),/structured/);
});
test('rendering preserves code as text, exposes source distinctions, and keeps hints collapsed',()=>{
  function el(tag){return {tag,children:[],append(...rows){this.children.push(...rows);}};}
  const details=B.empty('systems-coding');details.interfaces=[{language:'java',code:'String s = "<script>";\n    fetch();'}];details.requirements=['Keep a memory bound.'];details.hints=['Use a map.'];details.references=[{id:'format',title:'Company guide',url:'https://example.com/guide',scope:'interview-format',note:'Does not confirm the question.'}];
  const tree=B.render({createElement:el},{description:'Implement a cache.',provenance:{kind:'authored-practice'},details});
  const all=e=>[e,...e.children.flatMap(all)],rows=all(tree);
  assert.equal(rows.find(e=>e.tag==='code').textContent,details.interfaces[0].code);
  assert.equal(rows.find(e=>e.tag==='details').open,undefined);
  assert.ok(rows.some(e=>e.textContent?.includes('provenance is unverified')));
  assert.ok(rows.some(e=>e.textContent?.includes('Interview-format reference')));
  assert.equal(rows.filter(e=>e.tag==='script').length,0);
});
