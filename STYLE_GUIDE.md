# Simulatte Style Guide
001. Purpose: Simulatte is a browser-native natural-language simulation pipeline.
002. The prompt is source code; every visible artifact must trace back to it.
003. The compiled world model is the contract, not the visual template.
004. The visible simulation is product truth and must carry prompt-specific meaning.
005. Do not hide unsupported prompt content behind plausible visuals.
006. Do not let broad scene buckets override compiled semantic evidence.
007. Treat each phase boundary as a typed pipeline boundary.
008. Prefer explicit receipts over implicit behavior.
009. Fail closed when a required model, index, cache, schema, or provider is missing.
010. Do not silently switch to prototype or local fallback in production paths.
011. Use deterministic local rules only when their receipts say they are local rules.
012. Keep browser-first deployment constraints in view for every edit.
013. Static hosting is a product constraint, not an implementation detail.
014. Do not add server assumptions unless the feature explicitly requires them.
015. Prefer relative public asset paths.
016. Keep generated artifacts out of hand-authored contracts unless generation is documented.
017. When metadata exists twice, define one canonical source and sync-check mirrors.
018. Runtime-visible policy belongs in config, manifests, schemas, or indexed assets.
019. Runtime code consumes resolved policy; it should not invent behavior-changing defaults.
020. `null` means explicitly disabled when a schema says so.
021. `undefined` or absence means missing contract and should fail validation.
022. Literal fallbacks are acceptable only for presentation labels or test fixtures.
023. Model identity, dimensions, indexes, and reranker policy come from manifests.
024. Do not infer model family from URL strings, tensor names, or loose substrings.
025. The runtime gate must prove providers before marking the app ready.
026. Cache readiness is a receipt, not a substitute for provider readiness.
027. OPFS, CacheStorage, RAM, and GPU cache behavior must be observable.
028. First-load and reuse timing should be logged as structured runtime events.
029. Do not add ad hoc console logging in runtime paths.
030. Extend permanent trace, receipt, or dataset fields instead.
031. Logs must be useful to compare first load, cache hit, cache miss, and model reuse.
032. Use plain text status output in Simulatte docs and logs.
033. Do not add emoji to source, docs, receipts, tests, or CLI output.
034. Use markdown checkboxes for task lists.
035. Use terse, active, present-tense prose in docs.
036. Avoid filler phrases, vague claims, and decorative language.
037. Do not use em dashes in new documentation.
038. Use tables for structured options, phase contracts, and evidence matrices.
039. Use fenced code blocks for commands and schemas.
040. Every non-trivial doc should name the owner contract or source file.
041. JavaScript files are the browser runtime surface.
042. Keep JavaScript plain and deployable without build steps.
043. Follow the surrounding module format before introducing new module style.
044. Current public modules use browser globals plus CommonJS-compatible exports.
045. Do not add TypeScript, transpilation, bundlers, or runtime compilation steps.
046. Prefer `const` and pure helper functions for transforms.
047. Prefer frozen lookup tables for enum-like maps.
048. Keep constants near the top of the module after imports or factory setup.
049. Name behavior-changing constants; do not scatter magic numbers.
050. Use `camelCase` for functions, variables, object keys, and dataset helpers.
051. Use `PascalCase` only for classes or constructor-like public types.
052. Use `UPPER_SNAKE_CASE` for hard constants.
053. Use `kebab-case.js` for new JavaScript files.
054. Use `kebab-case.json` for data files.
055. Use `kebab-case.schema.json` for schemas.
056. JSON keys should be `camelCase` unless preserving an existing wire contract.
057. ID fields should end in `Id` when the property names a referenced thing.
058. Boolean names should use `is`, `has`, `should`, or `requires` when ambiguous.
059. Arrays should use plural names.
060. Items in arrays should have stable `id` fields when they are addressable.
061. Hand-authored JSON may use logical grouping.
062. Generated JSON should use two-space indentation, sorted keys, and trailing newline.
063. New schemas should include `$schema`, `title`, `type`, `required`, and `additionalProperties`.
064. Use restrictive schemas by default.
065. If a schema allows extension, say why in the schema or nearby docs.
066. Schema version and content version are separate concepts.
067. Bump schema versions for structural changes.
068. Keep content version names human-readable and stable.
069. Cross-reference configs by path when the loader resolves files.
070. Cross-reference registry entries by ID when a registry owns lookup.
071. Do not embed one config's full content inside another config.
072. Phase 1 Runtime Gate loads and proves runtime assets.
073. Phase 1 inputs: app config, manifests, cache state, provider capabilities.
074. Phase 1 outputs: runtime readiness, model/index/reranker/cache receipts.
075. Phase 1 must fail closed on missing required ML evidence.
076. Phase 2 Language Graph preserves prompt syntax and local linguistic evidence.
077. Phase 2 inputs: raw prompt text and language extraction options.
078. Phase 2 outputs: tokens, spans, clauses, predicates, quantities, negation, relations.
079. Phase 2 does not decide final semantics.
080. Phase 3 Retrieval And Rerank finds candidate world knowledge.
081. Phase 3 inputs: prompt, language graph, indexes, embedder, reranker policy.
082. Phase 3 outputs: ranked primitives, cards, universe rows, scores, provenance.
083. The reranker is an operation inside Phase 3, not a separate phase.
084. Phase 3 must separate visual similarity from physics similarity.
085. Activation fusion is a closing operation inside Phase 3, not a separate phase.
086. Phase 3 fusion inputs: language rows and retrieval/rerank results.
087. Phase 3 fusion outputs: weighted activations, coverage by obligation, conflicts, negative evidence, rejection reasons.
088. Phase 3 keeps raw retrieval and weighted activation as separate receipted artifact sections; fusion is evidence, not truth.
089. Phase 4 Grounded Intent decides the semantic world contract.
090. Phase 4 inputs: activation cloud, language evidence, retrieval provenance.
091. Phase 4 outputs: accepted graph, rejected rows, assumptions, unsupported concepts.
092. Every accepted semantic node needs provenance.
093. Inferred roles must be distinguishable from directly grounded roles.
094. Negative evidence and negation must propagate forward.
095. Phase 5 Simulation Compile lowers intent into executable simulation artifacts.
096. Phase 5 inputs: grounded graph, assumptions, unsupported rows.
097. Phase 5 outputs: PhysicsIR, solver graph, renderIR, channels, controls, readouts.
098. Solver support artifacts must not masquerade as visual intent.
099. Phase 5 should emit only render-addressable rows that have source evidence.
100. Phase 6 Visual Compile creates the renderable scene program.
101. Phase 6 inputs: renderIR, solver graph, visual cards, operator atlas, state bindings.
102. Phase 6 outputs: VisualIR, render instances, scene packet, camera, lights, passes.
103. Render instances need transforms, geometry, material, animation, collider, draw order.
104. Scene entities need semantic identity plus render class.
105. Phase 6 owns spatial layout and motion intent.
106. Phase 6 should not emit keyword-like rows as final render commands.
107. Phase 6 must preserve specific prompt objects such as dog, cat, water, robot, protein.
108. Phase 6 should reject generic helper rows unless they are marked support-only.
109. Phase 7 Render Execution draws compiled visual artifacts.
110. Phase 7 inputs: scene packet, render instances, state, canvas, WebGPU resources.
111. Phase 7 outputs: pixels, frame status, render receipts, timing receipts.
112. Phase 7 has no semantic authority.
113. Phase 7 must not retrieve, rerank, parse, infer, or choose templates.
114. Phase 7 may consume identity codes already compiled by Phase 6.
115. WGSL consumes resolved uniforms, constants, and buffers only.
116. WGSL must not make policy decisions.
117. Use override constants for compile-time shader parameters.
118. Use uniforms for per-frame or per-dispatch state.
119. Keep uniform layout and JavaScript packing in lockstep.
120. Add tests for any uniform lane or WGSL struct change.
121. Do not use JS syntax inside WGSL strings.
122. Shader failures found by browser audit require a regression check.
123. Keep rendering branches tied to compiled scene data, not raw prompt text.
124. If a renderer needs semantic shape, Phase 6 must compile it first.
125. Canvas datasets are receipts and should name schemas, counts, hashes, and source contracts.
126. Dataset receipts must not become the primary data path.
127. Screenshots and canvas hashes are evidence, not proof by themselves.
128. Visual audits must inspect scene kind, entities, packet identities, motion, and signal coverage.
129. Tests are the type system for this JavaScript-first repo.
130. Add tests at the phase boundary touched by the change.
131. A bug fix for a failure path needs a regression test for that failure path.
132. A rendering fix needs a browser proof when WebGPU behavior can change.
133. A schema or receipt change needs shape tests and at least one semantic fixture.
134. A retrieval change needs false-positive and false-negative probes.
135. A visual diversity change needs close-prompt and broad-prompt probes.
136. Do not weaken tests to match wrong behavior.
137. Do not relabel broken behavior as experimental instead of fixing it.
138. If repeated drift appears, create an inventory or audit check.
139. Prefer broad checkable tooling over one-off repairs for recurring classes.
140. Keep test output deterministic.
141. Seeded or hashed procedural behavior must remain stable for the same prompt.
142. Randomness in product code must derive from explicit prompt/spec seeds.
143. Do not use wall-clock time for deterministic compile artifacts.
144. Frame time is allowed only in render execution and loading UX.
145. Keep performance and fairness claims backed by raw data.
146. Read raw timings and proof paths before claiming improvement.
147. A speed claim is invalid if the compared paths did different work.
148. Report cache mode, model reuse, backend, and readback path with timing claims.
149. Errors should include what was expected, what was received, and which contract failed.
150. Prefer direct `Error` objects with stable fields when structured diagnostics need them.
151. Catch only expected failures.
152. Do not swallow provider, shader, cache, or manifest failures.
153. Unsupported behavior should produce unsupported receipts.
154. Missing required behavior should fail the run or block readiness.
155. Keep modules focused around phase ownership or browser subsystem ownership.
156. Avoid adding new high-fan-in utility hubs.
157. If a file becomes a broad hub, split by cohesive functionality.
158. Preserve compatibility facades only when callers are being migrated.
159. Do not grow root-level entry files with feature logic.
160. New feature logic belongs in the owning phase module or a narrow helper module.
161. Shared types or schemas live with the subsystem that owns their semantics.
162. Avoid import cycles and implicit upward dependencies.
163. Keep dependency direction: contract, helper, implementation, coordinator.
164. The UI coordinator should orchestrate, not own pipeline semantics.
165. The catalog owns static primitive and layer data.
166. The intent modules own language, retrieval, activation, and grounding receipts.
167. The simulation modules own PhysicsIR, solver graph, renderIR, state, and readouts.
168. The visual modules own VisualIR, graphics atoms, scene packets, and render instances.
169. The renderer owns GPU resources, shader execution, frame state, and pixels.
170. Comments explain why, not what.
171. Do not add comments that restate function names or language features.
172. Use short section headers only in large files.
173. Prefer clearer names or smaller helpers before adding explanatory comments.
174. Do not add TODO or FIXME inline as a substitute for tracked work.
175. If a follow-up is required, put it in an explicit status, issue, or audit artifact.
176. Keep public UI text concise and domain-specific.
177. Do not add in-app tutorial text to explain controls unless the product asks for it.
178. Browser controls should be inspectable through receipts and debug surfaces.
179. Keep mobile and desktop functional for any visible UI change.
180. Do not add visible cards inside other cards.
181. Do not use decorative visuals when the user needs to inspect the actual simulation.
182. The prompt dock, runtime status, and canvas should not overlap incoherently.
183. Text must fit its container on mobile and desktop.
184. Prefer stable dimensions for canvases, toolbars, counters, boards, and fixed controls.
185. Do not scale font size with viewport width.
186. Keep color palettes tied to the simulation domain, not a one-note theme.
187. Deployment changes must run directly from `public/`.
188. Hosted behavior must match local browser behavior except for documented asset URLs.
189. Build stamps and version receipts are deploy artifacts.
190. Do not hand-edit generated stamps except through the stamping tool.
191. Use `npm test` for full repository regression coverage.
192. Use `npm run audit:pipeline` for phase-score proof.
193. Use browser visual audits for WebGPU or scene-packet changes.
194. Use deployed audits after hosting changes.
195. Keep artifact paths in receipts so reports can be compared later.
196. Summaries should name changed files, contracts, and verification commands.
197. Do not claim deploy success without the hosting command completing.
198. Do not leave local dev servers running after verification unless the user asked for one.
199. Phase 8 Scene Proof settles every composition ledger obligation against render receipts.
200. Phase 8 inputs: render execution output, composition ledger, pixel and identity receipts.
201. Phase 8 outputs: settled obligations, verdict, losses; it adds no scene content and has no semantic authority.
202. A required obligation without render evidence is a surfaced loss or an explicit not-proven receipt, never a silent pass.
203. JavaScript source files have a strict 999-line limit.
204. Split any JavaScript file before it reaches 1,000 lines.
205. This guide is mandatory for Simulatte edits and supplements `AGENTS.md`.
