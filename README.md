# Simulatte ♁

an n-gram and anagram collective
created for games who like mages

## /public

### QZS <-> SPQ

[QZS](public/0/README.md)

**QZS** (Quantum Zeroing **SPQ** (Systems Processing **QZS**))

**SPQ** (Systems Processing **QZS** (Quantum Zeroing **SPQ**))

[SPQ](public/0/SPQ.md)

### DPS <-> SDD

[DPS](public/1/README.md)

**DPS** (Double Penduluming **SDD** (Simulation Demonstrating **DPS**))

**SDD** (Simulation Demonstrating **DPS** (Double Penduluming **SDD**))

[SDD](public/1/SDD.md)

### TPU <-> UTT

[TPU](public/36/README.md)

**TPU** (Tensor Processing **UTT** (Univeral Transforming **TPU**))

**UTT** (Units Transforming **TPU** (Tensor Processing **UTT**))

[UTT](public/36/README.md)

### DTF <-> FDD

[DTF](public/1225/README.md)

**DTF** (Design Tooling **FDD** (Factory Developing **DTF**))

**FDD** (Factory Developing **DTF** (Design Tooling **FDD**))

[FDD](public/1225/README.md)

## /utils

### SIMP <-> PROS

[SIMP](utils/simp/README.md)

---

## WITR? Project Concepts And Cyclical Acronyms

While seemingly a linguistic curiosity, the exploration of self-referential and mutually-referential acronyms offers a playful yet insightful parallel to some core concepts relevant to this project. Treating these acronyms formally, as we have done with our custom "Category 1r" and "Category 2t" taxonomies, allows us to rigorously examine rule-based structures and recursive patterns.

From a formal perspective, we treat acronyms as non-empty strings `A, B` from an alphabet `Σ+`. Their expansions are sequences of word strings, `Expand(A) = (a_1, ..., a_lenA)` and `Expand(B) = (b_1, ..., b_lenB)`. Acronyms like GNU or PHP belong to what is officially known as a **recursive acronym** structure (our "Category 1r"). These are defined by a single axiom: `∃ i ∈ [1, lenA] : a_i == A`. This signifies a direct self-reference; the string `A` itself appears as one of the words (`a_i`) within its own expansion sequence. Verification simply involves searching for string `A` within the sequence `Expand(A)`.

Our "Category 2t" (Tail-Defined Mutual Pair) involves two distinct acronyms, `A` and `B` (`A ≠ B`), satisfying a stricter set of four minimal axioms: (1) `a_lenA == B`, (2) `b_lenB == A`, (3) `First(B) == Last(A)`, and (4) `First(A) == Last(B)`. Axioms 1 and 2 define the core mutual recursion, specifically requiring each acronym to appear as the final word in the _other's_ expansion (tail-linking). Axioms 3 and 4 impose strong constraints on the boundary characters: the start of each acronym must exactly match the last character of its partner, ensuring a specific structural symmetry.

The fundamental difference lies in the reference structure and constraints. A standard recursive acronym ("Category 1r") involves a single entity (`A`) and a simple self-reference (`a_i == A`). Our "Category 2t" involves two distinct entities (`A`, `B`) locked in a specific, symmetrical mutual reference defined by four interlinked conditions involving both the tail positions of the expansions and the first/last characters of the acronym strings themselves. Checking "Category 1r" involves finding `A` within `Expand(A)`, while checking "Category 2t" requires verifying the four specific interlinked axioms between `A`, `B`, `Expand(A)`, and `Expand(B)`.

Why engage in this **fun game** with acronyms? The underlying patterns resonate with concepts central to the project's ambitions. The self-reference in "Category 1r" and the interlinked dependency in "Category 2t" directly mirror the logic found in **recursive networks** and algorithms where components are defined or operate in terms of themselves or each other. Furthermore, the challenge of constructing or discovering acronym pairs that satisfy the strict, **interlocking axioms** of "Category 2t" is analogous to searching for viable solutions within highly constrained search spaces, reminiscent of evolutionary processes explored in **genetic algorithms**. Even the notion of definitions containing references that loop back (`A` includes `B`, `B` includes `A`) touches upon foundational ideas related to closed systems and, conceptually, **self-modifying code**, where components interact to define or alter the system's behavior. Therefore, exploring these rule-based generative structures, even through the lens of **cyclical acronyms**, serves as a valuable exercise in understanding the kinds of recursive, emergent, and tightly coupled systems relevant to the **long-term goals** of this project in understanding sophisticated generative systems.

## LA-LA (you're still here?)

### PAWS <-> SWAP

[PAWS](https://github.com/clocksmith/paws)

```md
~ REPLOID <---> DREAMER ~
~ ---|-------------|--- ~  
~ xxx|xxxxxxxxxxxxx|xxx ~
~ ---|-------------|--- ~  
~ DREAMER <---> REPLOID ~
```

Would you like to play a game [?](gamma)
