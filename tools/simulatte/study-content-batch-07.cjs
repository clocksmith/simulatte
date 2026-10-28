'use strict';
// Batch-owned authoring data. These are logical objects/functions, not deployed services.
const {problem,contract,component,builder}=require('./study-solution-author.cjs');
function author(spec){
 const p=problem(spec.id,spec.title,spec.scope,spec.requirements.map((text,i)=>({id:'r'+i,text})),spec.references.map((r,i)=>({id:'ref'+i,title:r[0],url:r[1],supports:r[2],scope:'background'})));
 for(const a of spec.approaches){
  const prefix=spec.id.toLowerCase()+'.'+a.id;
  contract(p,prefix+'.command',spec.request,spec.response);
  component(p,prefix+'.caller',spec.caller||'Caller','client','Invoke the documented API and retain returned outcomes.',['caller-owned input']);
  component(p,prefix+'.owner',a.owner,'module',a.responsibility,a.state);
  const b=builder(p,a.id,a.title,a.choose,a.tradeoffs,[spec.assumption,'All added requirements and walkthroughs are authored practice. Graphs specify design; reference tests prove only named bounded mechanisms.']);
  b.stage('Expose '+a.owner,a.question,a.responsibility,s=>{s.add('caller',prefix+'.caller');s.add('owner',prefix+'.owner');s.link('command','caller','owner',prefix+'.command',spec.local===false?'request-response':'local-call');},[a.invariant],['behavior','boundary']);
  for(const [i,n]of a.steps.entries()){
   const cid=prefix+'.'+n.id;
   contract(p,cid,n.request,n.response);
   component(p,cid,n.label,n.kind||'module',n.reason,n.state);
   b.stage(n.title,n.question,n.reason,s=>{s.add(n.id,cid);s.link('use-'+n.id,n.from||'owner',n.id,cid,n.kind==='store'?'storage':'local-call');},[n.invariant],n.checks||['behavior','boundary']);
  }
  b.api(spec.local===false?'POST':'CALL',spec.api,JSON.stringify(spec.request),JSON.stringify(spec.response),spec.errors,'owner');
  for(const [i,algorithm]of a.code.entries())b.algorithm('mechanism-'+i,algorithm[0],algorithm[1],algorithm[2]);
  for(const [i,c]of spec.cases.entries())b.check(i===0?'behavior':i===1?'boundary':'case'+i,c[0],c[1],c[2],p.problem.requirements.map(r=>r.id));
  const labels=new Map([['command','invoke API'],...a.steps.map(n=>['use-'+n.id,n.title])]);
  for(const stage of b.solution.stages){for(const op of stage.operations)if(op.edge)op.edge.label=labels.get(op.edge.id);for(const edge of stage.graph.edges)edge.label=labels.get(edge.id);}
  const c=b.solution.acceptanceCases[0];c.evidence={kind:'reference-test',testFile:'tools/simulatte/study-reference/batch-'+spec.batch+'-mechanisms.test.mjs',testName:spec.test};
 }
 return p;
}

const SPEC_0={
  "batch": "07",
  "id": "L036",
  "title": "LazyArray: deferred pipelines and pull cursors",
  "scope": "Authored implementation study of the catalogue LazyArray interface. Compare a persistent operation plan executed in one fused loop with immutable pull-cursor factories. No distributed components, implicit memoization or parallel evaluation. indexOf returns the index in the transformed, filtered output and uses Object.is equality; collect starts a fresh traversal.",
  "requirements": ["map/filter append in O(1) without invoking user callbacks; branches cannot mutate another chain.", "indexOf short-circuits in output order; collect traverses once with no intermediate arrays.", "Fuse adjacent maps without moving callbacks across filters; define repeat consumption, callback exceptions and source ownership."],
  "references": [["Java stream operations", "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html", "Lazy intermediate operations and short-circuit terminal consumption; the repeatable LazyArray policy is authored."]],
  "request": {"method": "map|filter|collect|indexOf", "callback": "function(T)->U|boolean for intermediate operation", "target": "value for indexOf"},
  "response": {"intermediate": "new LazyArray<U> sharing immutable history", "terminal": "U[] or transformed-output index; -1 if absent"},
  "api": "LazyArray.map/filter/collect/indexOf",
  "errors": "TypeError nonfunction callback; callback exception propagates; no partial array returned",
  "assumption": "Input array is shallow-copied at construction; object mutation remains visible. Callbacks may have effects; their original order is preserved.",
  "test": "batch-07 lazy: deferred branching and exact short circuit",
  "cases": [["A mapped/filtered source and counters on callbacks.", "Build two branches, consume indexOf on one, then collect the other.", "No callback runs at construction; short circuit stops after the first output match; branches retain independent plans."], ["Empty input, all elements filtered out, NaN target, and a throwing callback.", "Consume repeatedly.", "Return [] or -1 for absence; Object.is matches NaN; a throw stops traversal and later fresh traversal restarts."]],
  approaches: [
    {
      "id": "fused-plan",
      "title": "Persistent operation plan and fused loop",
      "owner": "Plan facade",
      "responsibility": "Append one immutable operation cell; terminals compile the reversed history once and drive source values in order.",
      "state": ["source snapshot", "tail operation cell"],
      "choose": "Many short-lived branches share one source and terminals can pay O(k) plan compilation.",
      "tradeoffs": ["O(k) terminal setup and O(n*k) worst-case callback work.", "Map fusion reduces dispatch and intermediate allocation, not the number of user map callbacks."],
      "question": "What happens before a terminal consumes data?",
      "invariant": "Intermediate operations call no user code.",
      steps: [
        {"id": "history", "label": "Persistent history", "title": "Record map/filter in O(1)", "question": "Can adding a branch copy the entire pipeline?", "reason": "Link a new {previous,kind,fn} cell to the prior tail; never append into an array shared by branches.", "state": ["immutable operation cells"], "invariant": "Each append allocates one cell and preserves earlier tails.", "request": {"kind": "map|filter", "fn": "callback", "previous": "cell|null"}, "response": {"tail": "new immutable cell"}},
        {"id": "source", "label": "Source snapshot", "title": "Choose source ownership", "question": "What if the caller edits its original array?", "reason": "Shallow-copy the source once; do not recopy on each intermediate call. Objects referenced by the copy are not deep frozen.", "state": ["snapshot of element references"], "invariant": "Chain construction adds O(1) work after source construction.", "request": {"input": "T[]"}, "response": {"snapshot": "readonly T[]"}, "kind": "store"},
        {"id": "compiler", "label": "Plan compiler", "title": "Compile consecutive maps", "question": "Where can fusion change observable callback order?", "reason": "Reverse the operation history once; coalesce only adjacent map descriptors into iterative map runs. Never hoist a filter or recursively nest a long composed function.", "state": ["terminal-local compiled descriptors"], "invariant": "A failed predicate prevents every later map for that element.", "request": {"tail": "operation cell"}, "response": {"runs": "ordered map runs and filters"}, "from": "history"},
        {"id": "driver", "label": "Fused driver", "title": "Traverse without intermediates", "question": "Can collect allocate one array per operation?", "reason": "For each source item, thread one local value through map runs and filters; rejected items continue the outer source loop.", "state": ["source index", "current local value"], "invariant": "No intermediate output array exists between operators.", "request": {"snapshot": "readonly T[]", "runs": "compiled descriptors"}, "response": {"next": "accepted value or exhaustion"}, "from": "compiler"},
        {"id": "terminal", "label": "Output ordinal", "title": "Short circuit indexOf", "question": "Does a filtered-out item consume an output index?", "reason": "Increment output ordinal only after all filters pass; Object.is comparison returns immediately at the first match.", "state": ["output ordinal"], "invariant": "No callback runs for source elements after a terminal match.", "request": {"value": "accepted U", "target": "U", "ordinal": "integer >=0"}, "response": {"result": "match index or continue"}, "from": "driver"},
        {"id": "failure", "label": "Exception boundary", "title": "Stop on callback failure", "question": "Can later callbacks run after an exception?", "reason": "Use normal propagation through the terminal loop; discard the terminal-local accumulator and preserve the immutable plan.", "state": ["no retained partial accumulator"], "invariant": "An exception does not mark the reusable plan consumed.", "request": {"callbackResult": "U or thrown error"}, "response": {"outcome": "value or same error"}, "from": "driver"},
        {"id": "restart", "label": "Fresh traversal factory", "title": "Make repeated consumption explicit", "question": "Can two terminals share cursor position?", "reason": "Create source and output counters per terminal; retain source snapshot and plan only, without caching results or sharing iteration state.", "state": ["fresh per-terminal cursor"], "invariant": "Two consumers have independent positions and each reruns callbacks.", "request": {"terminal": "collect|indexOf"}, "response": {"cursor": "fresh traversal state"}, "from": "terminal"},
      ],
      "code": [["owner", "map(fn) { return new Plan(source, {previous: tail, kind: \"map\", fn}); }\nfilter(fn) { return new Plan(source, {previous: tail, kind: \"filter\", fn}); }\nterminal(target, collect) {\n const ops = compileIteratively(tail); const output=[]; let ordinal=0;\n sourceLoop: for (const original of source) { let value=original;\n  for (const op of ops) { if (op.kind===\"filter\") { if (!op.fn(value)) continue sourceLoop; }\n   else for (const fn of op.mapRun) value=fn(value); }\n  if (!collect && Object.is(value,target)) return ordinal;\n  if (collect) output.push(value); ordinal++;\n } return collect ? output : -1;\n}", ["O(1) append; O(k) terminal compilation; no source element after a hit is evaluated."]]],
    },
    {
      "id": "pull-cursors",
      "title": "Pull cursor factories over persistent descriptors",
      "owner": "Cursor factory",
      "responsibility": "Retain immutable operator descriptors; create a pull machine per consumer whose next() resumes at the next accepted output.",
      "state": ["source snapshot", "descriptor tail"],
      "choose": "Consumers need incremental next() as well as terminal methods, with independent cancellation.",
      "tradeoffs": ["A pull cursor retains suspended traversal state.", "Wrapper-per-operator recursion can overflow; flatten descriptor history before iterating."],
      "question": "Who owns progress when consumers interleave?",
      "invariant": "Each consumer owns its own cursor state.",
      steps: [
        {"id": "descriptors", "label": "Descriptor spine", "title": "Retain immutable cursor recipes", "question": "Can two lazy branches share mutation?", "reason": "Append a descriptor cell with a previous pointer; it describes a cursor factory and holds no live cursor.", "state": ["immutable descriptor spine"], "invariant": "Descriptor append never calls next or a callback.", "request": {"previous": "descriptor|null", "operator": "map|filter", "fn": "callback"}, "response": {"descriptor": "new tail"}},
        {"id": "factory", "label": "Cursor allocator", "title": "Allocate independent pull state", "question": "Can one terminal exhaust another?", "reason": "Flatten descriptor spine once when opening a consumer; allocate source index and output ordinal privately.", "state": ["source index", "output ordinal"], "invariant": "Opening a cursor evaluates no source elements.", "request": {"tail": "descriptor", "source": "readonly T[]"}, "response": {"cursor": "independent pull machine"}, "from": "descriptors"},
        {"id": "pull", "label": "next state machine", "title": "Pull one surviving item", "question": "How does filter request another source value?", "reason": "next() loops source candidates and runs descriptors until one survives, then suspends with the next source index.", "state": ["candidate value", "program counter"], "invariant": "One next call yields at most one output.", "request": {"cursor": "pull state"}, "response": {"item": "{done:boolean,value?:U}"}, "from": "factory"},
        {"id": "fusion", "label": "Map-run executor", "title": "Fuse map dispatch on pull", "question": "May fusion cross a filter?", "reason": "Compile adjacent map descriptors into array runs; evaluate each user callback in order for only the pulled candidate.", "state": ["map-run function references"], "invariant": "Fusion preserves side-effect and throw order.", "request": {"mapRun": "function[]", "value": "T"}, "response": {"value": "U"}, "from": "pull"},
        {"id": "search", "label": "Pull search", "title": "Stop the upstream cursor", "question": "How is a match propagated upstream?", "reason": "indexOf calls next until Object.is succeeds, then closes that consumer; no extra next call is made.", "state": ["matched output index"], "invariant": "Short circuit is demand cessation, not source prefetch.", "request": {"target": "U", "next": "cursor.next"}, "response": {"index": "integer or -1"}, "from": "pull"},
        {"id": "close", "label": "Cursor close", "title": "Release consumer state", "question": "Can a closed cursor resume by accident?", "reason": "Set closed before dropping retained temporary references; next after close returns done, while a new consumer remains valid.", "state": ["closed flag"], "invariant": "Closing a consumer cannot mutate its parent descriptor recipe.", "request": {"cursorId": "terminal-local identity"}, "response": {"closed": "true"}, "from": "search"},
        {"id": "collect", "label": "Collector", "title": "Materialize only at terminal", "question": "Where does the result array live?", "reason": "Collect repeatedly calls next into one terminal-owned output array; no map or filter owns an intermediate collection.", "state": ["terminal output array"], "invariant": "Exceptions close this cursor and propagate without caching partial output.", "request": {"next": "pull function"}, "response": {"output": "U[]"}, "from": "pull"},
      ],
      "code": [["owner", "append(kind, fn) { return new CursorFactory(source, {previous: tail, kind, fn}); }\nopen() { const ops=flattenAndFuse(tail); let i=0, closed=false;\n return { next() { if(closed) return {done:true};\n  outer: while(i<source.length) { let value=source[i++];\n   for(const op of ops) { if(op.kind===\"filter\") {if(!op.fn(value)) continue outer;}\n    else for(const fn of op.mapRun) value=fn(value); }\n   return {done:false,value}; } closed=true; return {done:true};\n }, close() {closed=true;} };\n}", ["Descriptor construction is O(1); consumers are independent; no eager prefetch."]]],
    },
  ],
};
function l036(){return author(SPEC_0);}
const SPEC_1={
  "batch": "07",
  "id": "L037",
  "title": "NewString: weighted ropes and implicit treaps",
  "scope": "Authored local data-structure study. Compare a height-balanced chunk rope with a randomized implicit treap. Positions count Unicode scalar values, not bytes or grapheme clusters. Insertion of m new characters costs at least O(m); deletion that frees m characters may also cost O(m). Sub-linear targets apply to indexed navigation and structural splicing, not input copying or reclamation.",
  "requirements": ["Read, insert and delete preserve sequence order with checked half-open ranges and scalar indices.", "Maintain subtree sizes and the chosen balance invariant after splits and joins.", "Account for inserted bytes, removed-node reclamation, snapshots and invalid ranges without promising impossible O(log n) total copying."],
  "references": [["Ropey", "https://docs.rs/ropey/latest/ropey/", "Segmented Unicode text and character-indexed operations. Balance and complexity below are authored design requirements."]],
  "request": {"operation": "read|insert|deleteRange", "index": "scalar integer 0..length; read excludes length", "text": "UTF-8 string for insert", "length": "nonnegative scalar count for delete"},
  "response": {"read": "one Unicode scalar", "mutation": "new version and scalar length"},
  "api": "NewString.read/insert/deleteRange",
  "errors": "RangeError invalid index/range; invalid text rejected by chosen encoding policy; allocation failure leaves old root intact",
  "assumption": "One local writer or external writer lock; immutable nodes permit readers to pin a root. Chunk size B is bounded; byte/scalar conversion scans at most B bytes.",
  "test": "batch-07 rope: weighted split and splice match scalar arrays",
  "cases": [["A rope containing a supplementary Unicode scalar and multiple chunks.", "Split, insert and delete at every legal boundary.", "Flattened text matches the scalar-array oracle and cached subtree weights equal actual lengths."], ["Empty text, zero-length edits, end insertion and invalid range.", "Apply each operation and retain a previously pinned root.", "Boundary semantics are explicit; invalid edits fail before publishing; old snapshots remain unchanged."]],
  approaches: [
    {
      "id": "avl-rope",
      "title": "Height-balanced chunk rope with path copying",
      "owner": "Rope facade",
      "responsibility": "Validate scalar ranges, split weighted tree and join bounded chunks; publish a new balanced root only after a successful edit.",
      "state": ["current root", "version"],
      "choose": "Worst-case logarithmic navigation and stable root snapshots matter.",
      "tradeoffs": ["Height and weight repairs complicate split/join.", "Path copying allocates O(log n) structure plus inserted chunks; reclaiming old snapshots needs a policy."],
      "question": "What is the unit of an index?",
      "invariant": "Every weight and public position counts the same Unicode scalar unit.",
      steps: [
        {"id": "leaves", "label": "Bounded leaf chunks", "title": "Bound local scans", "question": "Can a single leaf grow without limit?", "reason": "Store at most B bytes per leaf, splitting on scalar boundaries; retain both byte and scalar length.", "state": ["chunk bytes", "scalar count"], "invariant": "No split creates invalid UTF-8.", "request": {"text": "validated UTF-8", "maxBytes": "B"}, "response": {"leaves": "bounded valid chunks"}, "kind": "store"},
        {"id": "weights", "label": "Weighted internal nodes", "title": "Navigate by left weight", "question": "Which side contains index i?", "reason": "Store left scalar weight and total subtree count; subtract left weight only when descending right.", "state": ["left count", "total count"], "invariant": "Cached counts equal child totals after every structural operation.", "request": {"node": "left/right children", "index": "scalar offset"}, "response": {"child": "selected subtree", "offset": "relative index"}, "from": "leaves"},
        {"id": "split", "label": "Weighted split", "title": "Split at an exact boundary", "question": "What happens inside a chunk?", "reason": "Descend by weight, split at a valid scalar boundary, and reconstruct only nodes on the search path.", "state": ["temporary left/right roots"], "invariant": "concat(left,right) restores the original scalar sequence.", "request": {"root": "balanced rope", "offset": "0..length"}, "response": {"left": "prefix rope", "right": "suffix rope"}, "from": "weights"},
        {"id": "join", "label": "Height-aware join", "title": "Splice without flattening", "question": "Must insert copy the existing text?", "reason": "Join by descending the taller spine; allocate input chunks once and repair path metadata.", "state": ["candidate root"], "invariant": "insert(i,s) equals join(prefix,s,suffix).", "request": {"left": "rope", "right": "rope"}, "response": {"root": "joined rope"}, "from": "split"},
        {"id": "rotations", "label": "AVL repair", "title": "Restore height balance", "question": "Can repeated front insertions create a linked list?", "reason": "Apply single or double rotations on repaired paths and recompute heights and weights bottom-up.", "state": ["node heights"], "invariant": "Absolute child-height difference is at most one after publication.", "request": {"node": "possibly unbalanced candidate"}, "response": {"root": "balanced candidate"}, "from": "join"},
        {"id": "snapshots", "label": "Pinned roots", "title": "Keep read snapshots stable", "question": "Can a reader see half an edit?", "reason": "Immutable nodes retain old roots; publish the new root in one writer transition. Snapshots own root references.", "state": ["root references", "publication version"], "invariant": "Existing readers never observe partially repaired weights.", "request": {"candidate": "balanced root", "expectedVersion": "integer"}, "response": {"published": "new root/version"}, "from": "rotations"},
        {"id": "reclaim", "label": "Chunk reclamation", "title": "Account for edit costs", "question": "Does deleting a million characters cost O(log n) total?", "reason": "Detach a range structurally in logarithmic navigation work, then account separately for removed-node destruction and retained snapshots.", "state": ["retired roots", "live snapshot references"], "invariant": "Reclamation cannot free nodes reachable from a pinned root.", "request": {"retiredRoot": "detached subtree"}, "response": {"released": "unreferenced chunks"}, "from": "snapshots"},
      ],
      "code": [["owner", "insert(i,text) { checkInsertRange(i); [a,b]=split(root,i);\n middle=buildBalancedBoundedChunks(text);\n candidate=join(join(a,middle),b); assertWeightsAndAvl(candidate);\n publish(candidate); }\ndeleteRange(i,m) { checkRange(i,m); [a,tail]=split(root,i);\n [removed,b]=split(tail,m); publish(join(a,b)); retire(removed); }\nread(i) { checkReadRange(i); n=root; while(!n.leaf) {\n if(i<n.left.count)n=n.left; else {i-=n.left.count; n=n.right;} }\n return scalarAt(n.chunk,i); }", ["Navigation and path repair are O(log chunkCount) with enforced AVL balance; input and reclamation costs are additional."]]],
    },
    {
      "id": "implicit-treap",
      "title": "Implicit treap with subtree counts",
      "owner": "Treap facade",
      "responsibility": "Use in-order position instead of explicit keys; heap priorities choose structure while subtree counts select positions.",
      "state": ["root", "priority generator state"],
      "choose": "Expected logarithmic edits and simpler split/merge code fit an owned random-seed policy.",
      "tradeoffs": ["Worst-case depth is linear; expected bounds assume independent priorities.", "A public deterministic seed is reproducible but permits adversarial priority patterns; production needs protected randomness or a height guard."],
      "question": "What replaces explicit character keys?",
      "invariant": "In-order sequence defines position; priorities never define text order.",
      steps: [
        {"id": "chunks", "label": "Treap chunks", "title": "Store ordered text chunks", "question": "Where are characters owned?", "reason": "Each treap node owns a bounded scalar chunk plus left/right children and a stable priority.", "state": ["chunk", "priority"], "invariant": "Priority collisions use a stable unique tie-breaker.", "request": {"text": "scalar sequence", "priority": "random uint64", "nodeId": "unique integer"}, "response": {"node": "chunk treap node"}, "kind": "store"},
        {"id": "sizes", "label": "Subtree totals", "title": "Maintain implicit positions", "question": "How does an offset avoid explicit renumbering?", "reason": "Store total left/chunk/right scalar counts and repair after changing any child pointer.", "state": ["cached subtree count"], "invariant": "No edit renumbers untouched nodes.", "request": {"node": "treap node"}, "response": {"count": "left+chunk+right"}, "from": "chunks"},
        {"id": "partition", "label": "Position split", "title": "Partition by scalar rank", "question": "How is an offset inside a node handled?", "reason": "Split the chunk into two valid bounded chunks and merge each piece with its corresponding subtree using fresh ordered priorities.", "state": ["temporary roots"], "invariant": "The concatenation of split outputs preserves every scalar once.", "request": {"root": "treap", "rank": "0..count"}, "response": {"left": "prefix", "right": "suffix"}, "from": "sizes"},
        {"id": "merge", "label": "Priority merge", "title": "Join adjacent sequences", "question": "Why may arbitrary trees not be merged by key?", "reason": "Inputs represent consecutive text ranges. Select lower priority root and recursively merge only its touching child; repair counts.", "state": ["candidate tree"], "invariant": "Heap ordering and in-order text both survive merge.", "request": {"left": "prefix tree", "right": "suffix tree"}, "response": {"root": "merged tree"}, "from": "partition"},
        {"id": "edit", "label": "Range splice", "title": "Implement edit algebra", "question": "How are read and delete related to split?", "reason": "Insert splits once and merges input; delete splits twice and merges survivors. Read follows subtree ranks without changing root.", "state": ["edit-local temporary roots"], "invariant": "No existing node priority changes merely because its index shifted.", "request": {"operation": "insert|delete|read", "index": "scalar rank"}, "response": {"result": "value or candidate root"}, "from": "merge"},
        {"id": "publication", "label": "Root publication", "title": "Isolate readers from mutation", "question": "Can a concurrent reader follow a changed pointer?", "reason": "Path-copy changed nodes and atomically publish a new immutable root under a single writer version check.", "state": ["root version"], "invariant": "Writer conflicts retry from a new root; no partially edited path is public.", "request": {"expectedRoot": "pinned root", "candidate": "new tree"}, "response": {"version": "next integer"}, "from": "edit"},
        {"id": "depth", "label": "Height guard", "title": "Handle pathological priorities", "question": "What if the random tree becomes deep?", "reason": "Track depth against a declared guard; rebuild with fresh priorities or reject the operation with old root intact. This is a fallback policy with explicit linear rebuild cost.", "state": ["depth metric", "rebuild generation"], "invariant": "Expected complexity is not reported as a worst-case bound.", "request": {"candidate": "treap", "maxDepth": "configured guard"}, "response": {"accepted": "boolean", "rebuildCost": "visited node count"}, "from": "publication"},
      ],
      "code": [["owner", "count(n)=n?count(n.left)+n.chunk.scalarCount+count(n.right):0;\nmerge(a,b) { if(!a)return b; if(!b)return a;\n if(priority(a)<priority(b)) return copy(a,{right:merge(a.right,b)},recomputeCount);\n return copy(b,{left:merge(a,b.left)},recomputeCount); }\ninsert(i,s) { [a,b]=splitByCount(root,i); publish(merge(merge(a,buildChunks(s)),b)); }\ndeleteRange(i,m) { [a,t]=splitByCount(root,i); [gone,b]=splitByCount(t,m);\n publish(merge(a,b)); retire(gone); }", ["Expected O(log n) navigation under independent priorities; inserted length and freed nodes remain separate costs."]]],
    },
  ],
};
function l037(){return author(SPEC_1);}
const SPEC_2={
  "batch": "07",
  "id": "L038",
  "title": "Ordered IPv4 firewall: scan and priority trie",
  "scope": "Authored implementation study of ordered ALLOW/DENY IPv4 CIDR rules. First match in original rule order wins; this is deliberately different from longest-prefix routing. Invalid input fails closed; no matching rule defaults to DENY. IPv6, packet transport and stateful firewall connection tracking are out of scope.",
  "requirements": ["Parse exactly four decimal octets and prefix length 0..32, normalizing network host bits.", "Return the minimum original rule ordinal among all matching prefixes.", "Publish complete immutable rule versions; malformed updates cannot partially replace active policy."],
  "references": [["RFC 4632 CIDR", "https://www.rfc-editor.org/rfc/rfc4632", "IPv4 prefix addressing; first-rule priority is the explicit authored firewall policy, not longest-prefix routing."]],
  "request": {"operation": "check|replaceRules", "address": "strict dotted-decimal IPv4", "rules": "ordered [{action:ALLOW|DENY,cidr:string}]"},
  "response": {"decision": "ALLOW|DENY", "ruleOrdinal": "integer|null", "policyVersion": "integer"},
  "api": "IpFirewall.check/replaceRules",
  "errors": "Malformed address returns DENY with invalid-input reason; invalid policy replacement rejects without publication",
  "assumption": "Unsigned 32-bit arithmetic; /0 is handled explicitly because shift by 32 is language-dependent. Leading zeros are rejected except the octet 0.",
  "test": "batch-07 firewall: priority trie agrees with ordered scan",
  "cases": [["An early /8 DENY and later /32 ALLOW cover one address, followed by reversed order.", "Check both immutable versions with linear and trie lookup.", "Minimum original ordinal wins, regardless of prefix specificity."], ["/0, /32, 255.255.255.255, malformed input and no matching prefix.", "Parse and check each address.", "Unsigned comparisons and explicit /0 work; malformed or unmatched input is denied; failed updates preserve old version."]],
  approaches: [
    {
      "id": "ordered-scan",
      "title": "Precompiled ordered rule array",
      "owner": "Rule-array firewall",
      "responsibility": "Parse once, normalize network and mask, then test immutable rules in original order until a match.",
      "state": ["active rule array", "policy version"],
      "choose": "Rule lists are small or updates are frequent and predictable O(r) checks are acceptable.",
      "tradeoffs": ["Lookup is O(r) in the number of rules.", "Simple contiguous storage is easy to audit; no speculative throughput claim."],
      "question": "Which rule wins when prefixes overlap?",
      "invariant": "The first matching array entry determines the action.",
      steps: [
        {"id": "parser", "label": "IPv4 parser", "title": "Parse strict unsigned IPv4", "question": "Can octal or signed parsing change an address?", "reason": "Require exactly four canonical decimal octets in 0..255 and accumulate an unsigned 32-bit integer.", "state": ["no retained state"], "invariant": "Reject whitespace, signs, shorthand and extra components.", "request": {"address": "string"}, "response": {"ip": "uint32 or invalid"}},
        {"id": "mask", "label": "CIDR normalizer", "title": "Normalize network prefixes", "question": "How is /0 evaluated?", "reason": "Validate prefix length; /0 has mask zero, /32 all bits, otherwise construct an unsigned high-bit mask; clear host bits.", "state": ["normalized mask/network"], "invariant": "A host address in a CIDR rule is normalized, not interpreted as a different prefix.", "request": {"cidr": "address/prefix"}, "response": {"network": "uint32", "mask": "uint32"}, "from": "parser"},
        {"id": "array", "label": "Compiled rule array", "title": "Retain original priority", "question": "Can sorting improve speed without changing behavior?", "reason": "Keep rule ordinal with normalized network, mask and action; do not sort by prefix length.", "state": ["ordered compiled rules"], "invariant": "Original rule order remains authoritative.", "request": {"rules": "validated Rule[]"}, "response": {"compiled": "{network,mask,action,ordinal}[]"}, "from": "mask", "kind": "store"},
        {"id": "match", "label": "Bitwise matcher", "title": "Match without allocation", "question": "What arithmetic must be unsigned?", "reason": "Compare unsigned (ip & mask) with unsigned network; short circuit at the first hit.", "state": ["current array ordinal"], "invariant": "One check reads exactly one policy version.", "request": {"ip": "uint32", "compiled": "ordered rules"}, "response": {"matched": "first ordinal or none"}, "from": "array"},
        {"id": "default", "label": "Explicit default", "title": "Deny unmatched addresses", "question": "What if no rule covers an address?", "reason": "Return DENY with no rule ordinal and the current policy version; malformed input takes a separate deny reason.", "state": ["default policy constant"], "invariant": "Absence never silently becomes ALLOW.", "request": {"match": "ordinal|null"}, "response": {"decision": "ALLOW|DENY", "reason": "rule|unmatched|invalid"}, "from": "match"},
        {"id": "candidate", "label": "Policy compiler", "title": "Reject partial updates", "question": "Can one invalid rule leave half a policy active?", "reason": "Build and validate a candidate array privately; require every action and CIDR to parse before publication.", "state": ["candidate array"], "invariant": "Compilation failure cannot alter active rules.", "request": {"newRules": "Rule[]"}, "response": {"candidate": "validated immutable array"}, "from": "mask"},
        {"id": "publish", "label": "Atomic version slot", "title": "Publish one complete version", "question": "Can a reader combine two updates?", "reason": "Swap the immutable array/version pair once; readers pin one pair for their entire scan.", "state": ["active pair", "retired reader references"], "invariant": "Policy ordinal and result version refer to the same snapshot.", "request": {"candidate": "compiled array"}, "response": {"version": "new integer"}, "from": "candidate"},
      ],
      "code": [["owner", "check(address) { const snapshot=active; const ip=parseStrictIPv4(address);\n if(ip===INVALID)return deny(\"invalid\",snapshot.version);\n for(const r of snapshot.rules) if(unsigned(ip&r.mask)===r.network)\n  return {decision:r.action,ruleOrdinal:r.ordinal,policyVersion:snapshot.version};\n return deny(\"unmatched\",snapshot.version);\n}\nreplaceRules(rules) { const candidate=rules.map(compileChecked);\n active=immutablePair(candidate,active.version+1); }", ["O(r) lookup; original priority and complete policy snapshots are preserved."]]],
    },
    {
      "id": "priority-trie",
      "title": "Binary prefix trie with minimum-ordinal selection",
      "owner": "Trie firewall",
      "responsibility": "Store each prefix at its bit-depth node; traverse the address path and select minimum original ordinal over all matching ancestor prefixes.",
      "state": ["active trie root/version"],
      "choose": "Lookup volume dominates updates and O(32) bit traversal justifies additional memory.",
      "tradeoffs": ["Up to O(32*r) nodes before path compression.", "Update builds cost more and duplicate prefixes must retain the earliest ordinal."],
      "question": "Why is deepest-prefix selection wrong?",
      "invariant": "The winning rule has smallest ordinal, not greatest depth.",
      steps: [
        {"id": "decode", "label": "Strict address decoder", "title": "Validate the bit path", "question": "May malformed input enter the trie?", "reason": "Canonical dotted-decimal parser produces one uint32; invalid input fails closed before traversal.", "state": ["no independent state"], "invariant": "Bit 31 is handled as an unsigned network-order bit.", "request": {"address": "strict IPv4 string"}, "response": {"ip": "uint32 or invalid"}},
        {"id": "root", "label": "Prefix-zero root", "title": "Represent /0 at the root", "question": "Where does a catch-all rule live?", "reason": "Root stores earliest /0 candidate; each rule descends exactly prefixLength bits after masking network host bits.", "state": ["root candidate", "child zero/one pointers"], "invariant": "A /0 candidate participates in every valid lookup.", "request": {"rules": "validated ordered rules"}, "response": {"root": "trie"}, "from": "decode", "kind": "store"},
        {"id": "insert", "label": "Ordinal-aware insertion", "title": "Retain duplicate prefix priority", "question": "Can a later exact prefix replace an earlier one?", "reason": "At a prefix node retain the candidate with lowest ordinal, including its action; do not overwrite with a later conflicting action.", "state": ["candidate ordinal/action"], "invariant": "A trie node candidate is earliest for that exact prefix.", "request": {"node": "prefix node", "rule": "{ordinal,action,prefix}"}, "response": {"candidate": "minimum ordinal"}, "from": "root"},
        {"id": "walk", "label": "Address-path walker", "title": "Collect ancestor matches", "question": "Which trie nodes can match an IPv4 address?", "reason": "Visit root and at most 32 nodes following each address bit; update best when candidate ordinal is lower.", "state": ["depth", "best candidate"], "invariant": "Unvisited sibling prefixes cannot match the address.", "request": {"root": "immutable trie", "ip": "uint32"}, "response": {"best": "minimum ordinal or none"}, "from": "root"},
        {"id": "decision", "label": "Priority reducer", "title": "Prefer order over specificity", "question": "What if a /8 appears before a /32?", "reason": "Choose lowest ordinal among root/path candidates; deny if none. Do not use longest-prefix APIs as a substitute.", "state": ["selected ordinal"], "invariant": "Trie and ordered scan agree for the same policy.", "request": {"candidates": "matching path candidates"}, "response": {"decision": "ALLOW|DENY", "ordinal": "integer|null"}, "from": "walk"},
        {"id": "build", "label": "Private trie builder", "title": "Build replacement versions", "question": "Can concurrent readers see partially inserted prefixes?", "reason": "Construct the entire next trie privately and validate counts/ordinals; never mutate the pinned active root.", "state": ["candidate root"], "invariant": "An invalid CIDR aborts the complete replacement.", "request": {"rules": "ordered Rule[]"}, "response": {"candidate": "complete trie/version"}, "from": "insert"},
        {"id": "swap", "label": "Root-version publication", "title": "Swap the policy snapshot", "question": "How are old readers released?", "reason": "Publish a root/version pair atomically and retain old immutable nodes until pinned readers complete.", "state": ["root pair", "reader references"], "invariant": "One check reports exactly one policy version.", "request": {"candidate": "root pair"}, "response": {"active": "published pair"}, "from": "build"},
      ],
      "code": [["owner", "lookup(ip) { let node=active.root, best=null;\n for(let depth=0; node && depth<=32; depth++) {\n  if(node.candidate && (!best || node.candidate.ordinal<best.ordinal)) best=node.candidate;\n  if(depth===32)break; node=node.child[(ip >>> (31-depth)) & 1];\n } return best ?? DEFAULT_DENY;\n}\n// During build, root handles /0; exact prefix duplicates retain minimum ordinal.\n// Publish the entire root/version pair only after every rule parses.", ["At most 33 nodes visited; first-match semantics agree with ordered scan."]]],
    },
  ],
};
function l038(){return author(SPEC_2);}
const SPEC_3={
  "batch": "07",
  "id": "L039",
  "title": "Comment stripping with explicit lexical states",
  "scope": "Authored local lexer for a deliberately small language: // and -- line comments, nonnested /* */ blocks, single/double quoted strings, backslash escapes and doubled quote escapes. Preserve newline characters and replace each comment with separating whitespace to prevent token joining. No regex literals, template interpolation, nested comments, dollar quoting or full SQL dialect claim.",
  "requirements": ["Keep comment-looking delimiters inside quoted literals unchanged; respect escaped and doubled quotes.", "Carry block/quote/line state across chunks; two-character delimiters can straddle chunks.", "Preserve line boundaries and token separation; reject unterminated block comments or quoted strings explicitly at EOF."],
  "references": [["SQLite comments", "https://www.sqlite.org/lang_comment.html", "SQL line/block delimiters and comments as whitespace. This authored lexer additionally supports // and backslash escapes."]],
  "request": {"operation": "feed|finish", "chunk": "string of Unicode code units", "grammar": "fixed declared subset"},
  "response": {"output": "comment-free text preserving newlines and token separation", "diagnostic": "unterminated block|string or none"},
  "api": "CommentStripper.feed/finish",
  "errors": "finish throws SyntaxError for unterminated block or quoted literal; feed after finish rejects",
  "assumption": "Text indices and source offsets use UTF-16 code units. No nested comment interpretation; block closes at the first */. Lexer subset is pinned, not guessed from file extension.",
  "test": "batch-07 lexer: delimiters quotes chunks and token separation",
  "cases": [["Quoted delimiters, escaped quotes, doubled quotes, // and -- lines, and multiline blocks.", "Feed whole input and every possible two-chunk split to both implementations.", "Outputs match; strings remain byte-for-byte; comment text disappears while newlines and separating whitespace remain."], ["The sequences /*/, ///*, a*/b, and an unterminated string.", "Finish the lexer.", "/*/ reports unterminated block; ///* is a line comment; a*/b is ordinary text; unterminated strings report an error."]],
  approaches: [
    {
      "id": "stream-dfa",
      "title": "Incremental deterministic character machine",
      "owner": "Lexer state machine",
      "responsibility": "Consume characters once with state CODE, SINGLE, DOUBLE, LINE or BLOCK; preserve one pending delimiter character across chunks.",
      "state": ["lexical state", "pending character", "escape flag"],
      "choose": "Streaming input must emit output without retaining the full source.",
      "tradeoffs": ["Boundary handling is more intricate than a whole-buffer scan.", "Memory is O(1) lexical state plus caller-owned output; emitted output cannot be rolled back after a late error."],
      "question": "Which characters are allowed to open comments?",
      "invariant": "Only CODE state recognizes comment openers.",
      steps: [
        {"id": "lookahead", "label": "Pending lookahead", "title": "Delay ambiguous final characters", "question": "What if a chunk ends with slash?", "reason": "Hold at most one undecided /, -, quote or block-star until the next code unit or explicit EOF resolves it.", "state": ["pending code unit"], "invariant": "feed boundaries cannot change output.", "request": {"chunk": "string", "pending": "code unit|null"}, "response": {"ready": "resolved character pair"}},
        {"id": "quote", "label": "Quote transitions", "title": "Protect quoted delimiters", "question": "Can /* inside a string open a block?", "reason": "Enter matching quote state from CODE; copy characters verbatim and treat delimiter bytes only as literal content while quoted.", "state": ["quote kind"], "invariant": "A delimiter inside a literal never changes comment state.", "request": {"char": "code unit", "state": "CODE|SINGLE|DOUBLE"}, "response": {"state": "updated state", "emit": "literal bytes"}, "from": "lookahead"},
        {"id": "escape", "label": "Escape handling", "title": "Handle escaped and doubled quotes", "question": "Does an escaped quote close the string?", "reason": "Backslash copies the following code unit literally; doubled matching quotes remain inside the same literal.", "state": ["escape flag", "pending quote"], "invariant": "Escapes preserve original bytes and do not reinterpret adjacent comment markers.", "request": {"quote": "single|double", "next": "code unit"}, "response": {"closed": "boolean", "emit": "unchanged bytes"}, "from": "quote"},
        {"id": "line", "label": "Line comment state", "title": "Drop line payload", "question": "Does CRLF terminate one or two comments?", "reason": "On // or -- emit one separator then discard until CR or LF; copy newline code units and return to CODE.", "state": ["LINE state"], "invariant": "Newlines survive exactly as supplied.", "request": {"state": "LINE", "char": "code unit"}, "response": {"emit": "newline or empty", "nextState": "LINE|CODE"}, "from": "lookahead"},
        {"id": "block", "label": "Block comment state", "title": "Close the first block terminator", "question": "Does /* inside a block nest?", "reason": "After /* emit one separator, drop nonnewline content until first */; internal /* is plain comment content.", "state": ["BLOCK state", "star pending"], "invariant": "/*/ cannot close itself because no complete */ follows the opener.", "request": {"state": "BLOCK", "pair": "two code units"}, "response": {"closed": "boolean", "emit": "newlines only"}, "from": "lookahead"},
        {"id": "separator", "label": "Output sink", "title": "Prevent token concatenation", "question": "Does a/**/b become ab?", "reason": "Append the opener separator and retained newlines to a terminal-owned output sink; never join lexical tokens across removed comments.", "state": ["emitted output"], "invariant": "a/**/b becomes a b.", "request": {"fragment": "literal|separator|newline"}, "response": {"output": "append-only text"}, "from": "block"},
        {"id": "eof", "label": "EOF transition", "title": "Validate final lexical state", "question": "Is an unterminated block silently accepted?", "reason": "Flush ordinary pending characters, finish a line comment at EOF, and reject BLOCK or unclosed quote state. Mark finished exactly once.", "state": ["finished flag"], "invariant": "EOF is explicit and independent from chunk completion.", "request": {"state": "current state", "pending": "code unit|null"}, "response": {"done": "true or SyntaxError"}, "from": "escape"},
      ],
      "code": [["owner", "feed(chunk) { appendToPending(chunk);\n while(canResolveNextCharacter()) {\n  if(inQuote) copyWithEscapeAndDoubledQuoteRules();\n  else if(inLine) discardExceptNewline();\n  else if(inBlock) discardUntilFirstStarSlashKeepingNewlines();\n  else if(nextPairIsCommentOpener()) {emit(\" \"); enterComment(); consumePair();}\n  else copyAndMaybeEnterQuote();\n }\n}\nfinish() { resolvePendingAtEOF(); if(inBlock||inQuote)throw SyntaxError(); finished=true; }", ["A single pass with bounded pending state; quoted content and newlines are preserved."]]],
    },
    {
      "id": "span-scanner",
      "title": "Whole-buffer lexical spans and reconstruction",
      "owner": "Span tokenizer",
      "responsibility": "Retain the source, tokenize nonoverlapping literal/comment/plain spans, then reconstruct from source slices and comment whitespace.",
      "state": ["source buffer", "span list"],
      "choose": "Source mapping and diagnostics matter more than streaming memory.",
      "tradeoffs": ["O(n) source and span retention.", "Two-pass reconstruction simplifies mapping but delays output until lexical validation succeeds."],
      "question": "Why tokenize before deleting text?",
      "invariant": "Comment deletion never changes scanner offsets in the original source.",
      steps: [
        {"id": "buffer", "label": "Immutable source buffer", "title": "Retain stable offsets", "question": "Can removing a block shift later diagnostics?", "reason": "Read the entire input into an immutable source and use half-open code-unit ranges.", "state": ["source string"], "invariant": "Every span refers to original input offsets.", "request": {"chunks": "string[]"}, "response": {"source": "immutable text"}, "kind": "store"},
        {"id": "literal", "label": "Literal-span scanner", "title": "Skip complete quoted spans", "question": "Can a regex safely find every comment?", "reason": "At a quote, scan matching delimiter with escapes/doubled-quote rules and emit a literal span without scanning its body for comments.", "state": ["quote start", "scan offset"], "invariant": "Literal spans copy source bytes exactly.", "request": {"source": "text", "start": "quote offset"}, "response": {"span": "literal [start,end)"}, "from": "buffer"},
        {"id": "lineSpan", "label": "Line-span scanner", "title": "Record line comments", "question": "Where does a line comment end?", "reason": "At CODE // or -- record through the last nonnewline character; leave CR/LF to the next plain span.", "state": ["line span endpoints"], "invariant": "A line comment may end at EOF without error.", "request": {"start": "opener offset", "source": "text"}, "response": {"span": "comment [start,end)"}, "from": "buffer"},
        {"id": "blockSpan", "label": "Block-span scanner", "title": "Record nonnested blocks", "question": "What happens to nested-looking delimiters?", "reason": "At CODE /* search the first */ while counting newlines for diagnostics; reject EOF with no closer.", "state": ["block span endpoints"], "invariant": "No nested block grammar is inferred.", "request": {"start": "block opener offset", "source": "text"}, "response": {"span": "block [start,end)"}, "from": "buffer"},
        {"id": "spans", "label": "Ordered span list", "title": "Check coverage before output", "question": "Can a character be both literal and comment?", "reason": "Append adjacent disjoint spans covering source exactly once; keep original start/end and span kind.", "state": ["ordered spans"], "invariant": "No overlap, gap or reordered source interval is permitted.", "request": {"span": "plain|literal|line|block with offsets"}, "response": {"spans": "complete ordered partition"}, "from": "literal", "kind": "store"},
        {"id": "render", "label": "Whitespace reconstruction", "title": "Reconstruct without joining tokens", "question": "How do source offsets map to output?", "reason": "Copy plain/literal slices; replace each comment with one space plus its original CR/LF code units. Record emitted intervals for source mapping.", "state": ["output pieces", "source map"], "invariant": "a/**/b retains a token boundary and line counts stay stable.", "request": {"source": "original text", "spans": "validated partition"}, "response": {"text": "stripped text", "map": "source/output ranges"}, "from": "spans"},
        {"id": "diagnostic", "label": "Atomic result boundary", "title": "Return only validated output", "question": "Can callers receive half a stripped file?", "reason": "Validate every span and EOF state before joining output pieces; errors report original opener offset without returning a successful partial result.", "state": ["diagnostic offset"], "invariant": "Malformed input returns no successful output artifact.", "request": {"validation": "complete or failure", "pieces": "string[]"}, "response": {"result": "complete text or SyntaxError"}, "from": "render"},
      ],
      "code": [["owner", "strip(source) { const spans=[]; let i=0;\n while(i<source.length) {\n  if(isQuote(source[i])) {const end=scanQuoted(source,i); spans.push(literal(i,end));i=end;}\n  else if(isLineOpener(source,i)) {const end=scanToNewline(source,i+2);spans.push(comment(i,end));i=end;}\n  else if(source.startsWith(\"/*\",i)) {const end=scanFirstClosingPair(source,i+2);\n   if(end<0)throw SyntaxError(\"unterminated block at \"+i);spans.push(comment(i,end));i=end;}\n  else {spans.push(plain(i,i+1));i++;}\n }\n return spans.map(s=>s.comment?\" \"+newlines(source.slice(s.start,s.end)):source.slice(s.start,s.end)).join(\"\");\n}", ["Original offsets remain stable; memory O(n); no full-language parser claim."]]],
    },
  ],
};
function l039(){return author(SPEC_3);}
module.exports={l036,l037,l038,l039};
