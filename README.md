# Simulatte ⚭

an n-gram and anagram collective
created for games who like mages

## /public

### ZQS - Zero Quantum State

Interactive quantum wave packet simulator with split-operator spectral methods, demonstrating relativistic Dirac dynamics and quantum tunneling through potential barriers.

### SPD - Stochastic Phase Dynamics

Double pendulum physics simulator showcasing deterministic chaos, sensitive dependence on initial conditions, and real-time phase space trajectory visualization.

### UTP - Unified Topology Processor

Google TPU architecture simulator featuring 2D/3D/Twisted torus network topologies with realistic bandwidth traffic modeling and compute heat distribution.

### AEH - Adversarial Equity Heuristics

Texas Hold'em poker equity analyzer with pre-flop hand strength heatmaps, Monte Carlo simulation, and multi-opponent showdown probability calculations.

### SFS - Strategic Flip Simulation

Monte Carlo card game simulator analyzing three distinct player strategies (cautious, risky, super risky) across millions of hands with real-time convergence statistics.

### FTD - Functional Tool Designer

Meta-programming framework for dynamically generating MCP-compatible tools via LLM API calls, featuring live preview, version comparison, and executable web components.

## /utils

### SIMP <-> PROS

[SIMP](utils/simp/README.md)

---

## WITR? Project Concepts And Cyclical Acronyms

what is this really? write it to read?

While seemingly a linguistic curiosity, the exploration of self-referential and mutually-referential acronyms offers a playful yet insightful parallel to some core concepts relevant to this project. Treating these acronyms formally, as we have done with our custom "Category 1r" and "Category 2t" taxonomies, allows us to rigorously examine rule-based structures and recursive patterns.

From a formal perspective, we treat acronyms as non-empty strings `A, B` from an alphabet `Σ+`. Their expansions are sequences of word strings, `Expand(A) = (a_1, ..., a_lenA)` and `Expand(B) = (b_1, ..., b_lenB)`. Acronyms like GNU or PHP belong to what is officially known as a **recursive acronym** structure (our "Category 1r"). These are defined by a single axiom: `∃ i ∈ [1, lenA] : a_i == A`. This signifies a direct self-reference; the string `A` itself appears as 1 of the words (`a_i`) within its own expansion sequence. Verification simply involves searching for string `A` within the sequence `Expand(A)`.

Our "Category 2t" (Tail-Defined Mutual Pair) involves 2 distinct acronyms, A and B (A \neq B), satisfying a stricter set of four minimal axioms: (1) `a_lenA == B`, (2) `b_lenB == A`, (3) `First(B) == Last(A)`, and (4) `First(A) == Last(B)`. Axioms 1 and 2 define the core mutual recursion, specifically requiring each acronym to appear as the final word in the other's expansion (tail-linking). Indeed, these first 2 conditions (`a_lenA == B` and `b_lenB == A`) could be more compactly and abstractly described by stating that A and B form a '2-cycle' under the transformation that maps an acronym to the final word of its expansion. However, we detail them as separate axioms here to maintain an explicit focus on the bi-directional nature of this tail-linking dependency and for maximal clarity in the rule structure, ensuring each component of the interaction is clearly delineated. Axioms 3 and 4 impose strong constraints on the boundary characters: the start of each acronym must exactly match the last character of its partner, ensuring a specific structural symmetry.

The fundamental difference lies in the reference structure and constraints. A standard recursive acronym ("Category 1r") involves a single entity (`A`) and a simple self-reference (`a_i == A`). Our "Category 2t" involves two distinct entities (`A`, `B`) locked in a specific, symmetrical mutual reference defined by 4 interlinked conditions involving both the tail positions of the expansions and the first/last characters of the acronym strings themselves. Checking "Category 1r" involves finding `A` within `Expand(A)`, while checking "Category 2t" requires verifying the 4 specific interlinked axioms between `A`, `B`, `Expand(A)`, and `Expand(B)`.

Why engage in this **fun game** with acronyms? The underlying patterns resonate with concepts central to the project's ambitions. The self-reference in "Category 1r" and the interlinked dependency in "Category 2t" directly mirror the logic found in **recursive networks** and algorithms where components are defined or operate in terms of themselves or each other. Furthermore, the challenge of constructing or discovering acronym pairs that satisfy the strict, **interlocking axioms** of "Category 2t" is analogous to searching for viable solutions within highly constrained search spaces, reminiscent of evolutionary processes explored in **genetic algorithms**. Even the notion of definitions containing references that loop back (`A` includes `B`, `B` includes `A`) touches upon foundational ideas related to closed systems and, conceptually, **self-modifying code**, where components interact to define or alter the system's behavior. Therefore, exploring these rule-based generative structures, even through the lens of **cyclical acronyms**, serves as a valuable exercise in understanding the kinds of recursive, emergent, and tightly coupled systems relevant to the **long-term goals** of this project in understanding sophisticated generative systems.

## LA-LA

### PAWS <-> SWAP

[PAWS](https://github.com/clocksmith/paws)

```md
~ REPLOID <---> DREAMER ~
~ ---|-------------|--- ~  
~ xxx|xxxxxxxxxxxxx|xxx ~
~ ---|-------------|--- ~  
~ DREAMER <---> REPLOID ~
```

Would you like to play a game [?](https://github.com/clocksmith/gamma)
