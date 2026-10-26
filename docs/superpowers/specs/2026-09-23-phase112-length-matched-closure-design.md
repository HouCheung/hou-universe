# Phase 112 — Length-Matched External Closure Audit — Design

**Date:** 2026-09-23
**Hypothesis:** H112 — under the frozen `P12-MASK` condition and the recorded
generation settings, every **comparable** divergent P0 decision produced by a fresh,
mechanically selected external prompt grid whose measured token lengths lie in the
previously registered `13–30` range falls within the mechanism family derived from the
frozen 11-state baseline.
**Training:** `NOT RUN`. Generation-only, read-only, zero-training. No optimizer step, no
checkpoint write, no tokenizer / vocabulary / merge-table change, no architecture,
evaluator, threshold, rollout, sampling-algorithm or mask change, no edit to any dataset,
no `Math.random()`, no `setTimeout()`.

---

## 0. Prior-art audit — duplication and conflict check

This section is the record of the required audit of the completed Phase-111 report and
implementation, performed before this design was fixed.

### 0.1 Phase 111 is complete but **not committed**

The brief describes Phase 111 as "completed and committed". The repository says otherwise:

| Check | Command | Observed |
|---|---|---|
| tracked Phase-111 files | `git ls-files experiments/phase111/` | **empty** |
| working-tree status | `git status --short experiments/phase111/` | `?? experiments/phase111/` |
| report / test tracked | `git ls-files src/lib/minimind/research/PHASE111-…REPORT.md …/tests/phase111-…test.ts` | **empty** |
| HEAD | `git log --oneline -1` | `351e68b feat(minimind): Phase 96 augmentation transfer experiment` |

Phase 111 is complete on disk and **entirely untracked**; the newest commit is Phase 96.
This is consistent with the standing pattern for Phases 94–110 (all completed, none
committed). It changes one thing in Phase 112's design: Phase 112's instrument **depends on
a Phase-111 source file that git does not track**, so that dependency is pinned by sha256 in
Phase 112's manifest (§2a) rather than left to convention. It does **not** block Phase 112,
and Phase 112 does not commit Phase 111 either.

### 0.2 No duplication

The audited Phase-111 experiment used `12 prompts × 4 arms` selected by
exclusion → **first four eligible per class in dataset array order**, with no length
filter of any kind (`selectExternalPrompts`, `grid-external-closure-audit.ts:820`). No
Phase-90–111 experiment filters prompts by measured token length. Phase 112's length-band
selection is therefore not a re-run of anything in the repository.

Phase 112 does **not** overwrite or reinterpret Phase 111. The two phases address disjoint
prompt populations and their verdicts are computed separately (§5.1).

### 0.3 The one real methodological divergence, recorded not smoothed

Phase 111's report §16 recommends, in this order:

1. *"Do not extend the prompt grid… more prompts of the same kind would add sample size
   without testing a new hypothesis."*
2. *"Test the structural claim that F2's target is currently unreachable at P0"* — drive the
   P0 compatible mass below `0.5` so that `under-ranked-legal` / `illegal-argmax-other`
   become reachable and F2 gets a chance to fire.
3. *"Address the length discrepancy at the design level… pre-register the length range it can
   actually measure (e.g. … measured as 28–45 tokens under the frozen tokenizer) instead of
   estimating it."*

Phase 112 answers the length question, and its remedy is a **different remedy from §16
recommendation 3**. Recommendation 3 fixes the discrepancy by *re-labelling the range*.
Phase 112 fixes it by *moving the prompts into the originally registered range*. These are
not contradictory — they are two repairs of the same defect, and Phase 112 performs both:
it pre-registers the range it can actually measure (§7) **and** selects prompts measured
inside the originally registered `13–30`. The divergence is recorded here rather than
smoothed, because a reader is entitled to know that Phase 111's own report proposed the
other repair.

Recommendation 1 does not apply. Phase 112 is not "more prompts of the same kind": it
changes the **prompt-length region**, which is a different hypothesis (H112), not additional
sampling of H111.

Recommendation 2 is **not** attempted by Phase 112 and remains open. It is explicitly named
as a non-goal (§11) because it is plausibly the more informative next step and the reader
must not read Phase 112's completion as having discharged it.

No conflict was found that requires the experiment to be redesigned or abandoned.

### 0.4 The measured limitation Phase 112 inherits

`experiments/phase111/prompt-set.json` records, for all 12 external prompts,
`datasetTokenCount` measured with the frozen tokenizer: `28, 37, 32, 33, 28, 31, 34, 38, 35,
45, 31, 32` — i.e. **28–45**, against a spec that pre-registered **13–30**. Independently
re-measured for this audit through `buildTokenizer(loadCorpus(), 300)`, all 12 counts
reproduce exactly (`phase111 counts reproduced: true`), and the five frozen prompts measure
`9, 13, 5, 13, 19` tokens, reproducing the spec's registered `5–19`. The registered external
range was simply wrong, and was never enforced at selection time.

---

## 1. Research question

> Does the frozen `P12-MASK` failure population remain within the already observed mechanism
> family when evaluated on a fresh, mechanically selected external prompt grid whose
> measured token lengths fall within the originally intended `13–30` token range?

The hypothesis in full, in the form the instrument tests:

**H112.** Under the frozen `P12-MASK` condition and the recorded generation settings, every
**comparable** divergent P0 decision produced by the Phase-112 external grid carries a
mechanism label inside the family derived from the frozen 11-state baseline, and the P0
partition closes.

This is **controlled scope extension, not a universal claim**. Nothing in this phase
establishes, or is intended to establish:

- universal failure-population completeness;
- universal closure;
- that prompt length is irrelevant to divergence;
- that Phase 111 was wrong. Phase 111's own verdict, grid and artifacts stand unchanged.

---

## 2. Frozen conditions

Byte-for-byte the frozen Phase-102/Phase-111 condition. No second condition, no new
corruption criterion, no threshold change, no convenience relaxation.

| Item | Value |
|---|---|
| Condition | `P12-MASK` |
| Arms | `A`, `B94`, `C94`, `T` |
| `SEED` | `42` |
| `VOCAB_TARGET` | `300` |
| `MAX_TOKENS` | `24` |
| `MAX_CTX` | `128` |
| `TEMPERATURE` | `0.8` |
| `EOS_TOKEN_ID` | `3` |
| Corpus | `loadCorpus()` → `getDatasetTexts(loadProductionDataset())`, 600 texts |
| Tokenizer | `buildTokenizer(corpus, 300)` — the frozen Phase-98 construction |
| RNG | `createSeededRNG(42)`, one stream **per arm**, consumed positionally, exactly one draw per sampling step |

Checkpoints, read-only, never written, sha256 verified before use (all four verified to
match Phase 111's manifest at design time):

| Arm | Path | sha256 |
|---|---|---|
| `A` | `experiments/phase90/phase90-aligned.ckpt.json` | `dff07a8366ba21e4a75c0ed48172bdc6848a882f252b2377e112c6152adcbc5e` |
| `B94` | `experiments/phase94/phase94-b.ckpt.json` | `c9f9d52d053e72eaf4ccaf54eced2590f663f07ca302b226c4290e1f5fe9dfcd` |
| `C94` | `experiments/phase94/phase94-c.ckpt.json` | `62557157cab318992f5701a59a444842e740717e2bfbf419db3163f3580a5e95` |
| `T` | `experiments/phase96/phase96-treatment.ckpt.json` | `5ebe2ab392ac8d0882233023b3c5ed5d111614372ceeff60ed0e566a550cb061` |

Reused **verbatim, by import** — the UTF-8 legality machinery, `P12-MASK` semantics,
sampling semantics, byte-phase walker, divergence definition, mechanism classifier, F1/F2/F3
definitions, comparability predicate, partition and bijection helpers, reproducibility rules
and parity-gate philosophy all come from the frozen Phase-111 module (§2a). None is
re-implemented.

### 2a. Import boundary (the Phase-111 lesson, applied)

The Phase-111 audit is unambiguous about *why* copies exist there:
`experiments/phase99/logit-mechanism-audit.ts` has **no `require.main` guard**, so importing
it executes `main()` and rewrites `experiments/phase99/logit-mechanism-audit.json`; Phases
101 and 102 import Phase 99 and therefore inherit the same write.

Re-audited for Phase 112:

| Source | Decision | Reason |
|---|---|---|
| `experiments/phase111/grid-external-closure-audit.ts` | **IMPORT** | pure logic module: no `main()`, no `require.main` branch, and no `fs.writeFileSync` / `fs.mkdirSync` anywhere. Empirically verified side-effect free — after importing it, `experiments/phase99/logit-mechanism-audit.json` held raw sha256 `fc7fa5b6…79468b` with mtime `2026-09-22 20:37:04` **unchanged**, and `experiments/phase110/probe-results.json` held `acc78927…a221b` **unchanged**. It exports 77 symbols, including every primitive Phase 112 needs. |
| `experiments/phase98/cjk-byte-corruption-audit.ts` | not imported directly | already imported transitively by the Phase-111 module, which re-exports `loadCorpus`, `buildTokenizer`, `GEN_EVAL_PROMPTS`, `createSeededRNG`, `sampleToken`, `ARMS`, `SEED`, `TEMPERATURE`, `VOCAB_TARGET`, `MAX_TOKENS`, `MAX_CTX`, `buildCorpusIndex`, `measureCorpusStateTransitions`. Phase 98 carries the `require.main` guard, so the transitive edge is safe. |
| `experiments/phase99/logit-mechanism-audit.ts` | **NEVER IMPORT** | rewrites its own artifact on import. |
| `experiments/phase101/…`, `experiments/phase102/…` | **NEVER IMPORT** | both inherit the Phase-99 write. |
| `experiments/phase110/failure-population-audit.ts` | not imported | this audit confirms it has no imports at all and would be side-effect free, but its primitives are already present in the Phase-111 module, so widening the boundary buys nothing. |

**Copy ledger: EMPTY.** Phase 112 copies no primitive. This is a strict improvement on Phase
111, which had to copy seven primitive groups and then *prove* the copies equivalent by
parity. Because Phase 112 imports the identical object, instrument identity is structural
rather than argued — and the parity gate (§6) changes its rôle accordingly: it no longer
proves a copy, it proves the **environment** (dataset, corpus, tokenizer build, vocabulary,
checkpoints) is still the one Phase 111 measured in.

**Pinned dependency.** `experiments/phase111/grid-external-closure-audit.ts` is untracked
(§0.1). Its sha256 `e55b4e346e346d6753b9a064bb9a0ec641fe75ef69eada8774989117369e57e8` is
recorded in `manifest.json.importBoundary.imports[0].sha256`, and the probe **halts**
(`D`) if the on-disk digest differs. The instrument's identity is thereby fixed by evidence,
not by the accident of a clean working tree.

---

## 3. Fresh external prompt set — rule R112

The selection is made **by rule, before any checkpoint is loaded**, and its central
constraint is a **measured tokenizer length**, never a character count.

### 3.1 The audit that fixed the rule

Measured for this design with the frozen tokenizer, over the eligible population:

| Class | Eligible after exclusion | In `[13,30]` | Eligible measured range | Length-sorted median |
|---|---|---|---|---|
| `en` | 195 | **45** | 19 – 30 | 27 |
| `zh` | 193 | **41** | 14 – 30 | 25 |
| `mixed` | 195 | **60** | 13 – 30 | 21 |

Every class has far more than four eligible candidates, so the
`INCONCLUSIVE — insufficient deterministic length-matched external prompt set` branch is
**not** triggered and the allocation is not relaxed for shortage.

Two candidate rules were then resolved against the data **before** this spec was fixed:

**Rule P — the recommended structure, adopted literally** (exclusion → range filter → first
four per class in dataset array order). Resolved: `en` 29, 28, 29, 30 · `zh` 29, 28, 20, 27 ·
`mixed` 30, 29, 30, 29 → aggregate `20–30`, with only **2 of 12** prompts below 28. The `en`
and `mixed` selections lie **entirely inside** Phase 111's already-observed `28–45` band. A
grid in that shape would satisfy the letter of the question while testing almost none of the
length region the phase exists to test. **Rejected, on measured grounds.**

**Rule S — rank-quartile at `⌊j·(N−1)/3⌋`.** Resolved: spans `13–30` and hits both
boundaries, but pulls **4 of 12** prompts from the `validation` / `test` splits
(`en-val-12`, `zh-test-20`, `zh-test-19`, `zh-test-14`), introducing a split-composition
difference from Phase 111 for no scientific gain. **Rejected.**

**Rule R112 — adopted.** Spans `18–30` with **7 of 12** prompts below 28, keeps the
split composition identical to Phase 111's (12/12 `train`), and is deterministic end to end.

### 3.2 Rule R112, in this exact order

1. Read `src/data/minimind/datasets/bilingual.json`; require identity
   `{id: "bilingual", version: "0.3.0", schemaVersion: 1}`, 600 samples. Any mismatch halts
   as `D`.
2. Build the frozen tokenizer: `buildTokenizer(loadCorpus(), 300)`.
3. Build the exclusion index set **mechanically**, from two computed sources:
   - **(a) frozen prompts** — call the Phase-111 `selectExternalPrompts(dataset)` and take
     `result.excluded[].datasetIndex`. These are the samples whose `text` contains one of the
     five frozen `GEN_EVAL_PROMPTS` as a substring, computed by the Phase-111 function
     itself. Never a hardcoded list. (Resolves to 5 samples, including `zh-fact-01` — the
     sample Phase 111's spec prose omitted and its rule included; the rule governs.)
   - **(b) Phase-111 external prompts** — read the frozen artifact
     `experiments/phase111/prompt-set.json` and exclude every dataset index whose `text`
     equals one of its `resolvedSelection[].text` entries. The probe **halts** (`D`) unless
     the file's raw sha256 is `4ce6c939c68a82c0759fbda5b30c9a6e484e852d5a456167613ad75a53f8b33c`
     **and** its `resolvedSelection[].text` list equals the freshly recomputed
     `selectExternalPrompts(dataset).selection[].text` list in order. Recomputation parity,
     not trust.
   Union: **17 excluded samples** (5 + 12).
4. Partition the remaining samples by `language` into `en` / `zh` / `mixed`, preserving
   dataset array order.
5. **Length filter.** Retain a sample iff `tokenizer.encode(sample.text).length ∈ [13, 30]`
   inclusive. This is the frozen Phase-98 tokenizer's own count — the same call the runtime
   uses. No character count, no byte count, no rounding, no truncation, no padding.
6. **Per class**, sort the retained candidates by `(measuredTokenCount ascending,
   datasetIndex ascending)` — dataset array order is the **tie-break**, so it remains
   load-bearing for determinism. Let `N` be the candidate count; require `N ≥ 4`, else halt
   with `INCONCLUSIVE — insufficient deterministic length-matched external prompt set`.
7. **Stratify.** Partition the sorted candidate list into four contiguous equal-count
   rank strata, stratum `j` covering ranks `[⌊jN/4⌋, ⌊(j+1)N/4⌋)` for `j = 0…3`. From each
   stratum select the candidate with the **smallest `datasetIndex`**. Because the strata are
   length-ordered, this guarantees the grid spans the class's eligible length range down to
   its low end, while array order still chooses *which* prompt within a stratum.
8. **Manifest order:** `en → zh → mixed`; within a class, stratum order `0 → 3`. This fixes
   the RNG-consumption order explicitly.

Prompt text is the sample's **full `text`**. No truncation, no hand-picking, no
post-generation replacement, no selection after model output is seen.

> **Deviation, named.** Step 2 of the brief's recommended structure ("preserve dataset array
> order") is preserved as the *within-stratum* selection key rather than the global
> selection key. The deviation is the audit-justified one described in §3.1, not a
> convenience.

### 3.3 Resolved selection — frozen before generation

Rule R112 resolved by this audit. The probe **re-derives** it and requires the digest to
match; this table is a pre-registration, not an input.

| # | Class | ID | datasetIndex | tokens | category | split | text |
|---|---|---|---|---|---|---|---|
| 0 | en | `en-daily-10` | 25 | 24 | daily | train | `my phone is out of battery again` |
| 1 | en | `en-daily-05` | 20 | 26 | daily | train | `he takes the bus to work when it rains` |
| 2 | en | `en-general-11` | 10 | 29 | general | train | `a red fox crosses the frozen field at dawn` |
| 3 | en | `en-daily-03` | 18 | 30 | daily | train | `she walks to the market every saturday morning` |
| 4 | zh | `zh-daily-10` | 225 | 20 | daily | train | `我的手机又没电了` |
| 5 | zh | `zh-sci-12` | 299 | 24 | science | train | `海拔越高气压越低` |
| 6 | zh | `zh-daily-02` | 217 | 28 | daily | train | `离开的时候请记得关灯` |
| 7 | zh | `zh-general-12` | 211 | 29 | general | train | `正午的白云飘过辽阔的天空` |
| 8 | mixed | `mixed-map-13` | 512 | 18 | mapping | train | `parameter 的中文是参数` |
| 9 | mixed | `mixed-map-05` | 504 | 20 | mapping | train | `attention 的中文是注意力` |
| 10 | mixed | `mixed-map-06` | 505 | 22 | mapping | train | `embedding 的中文是词嵌入` |
| 11 | mixed | `mixed-tech-18` | 417 | 30 | technology | train | `regularization 可以缓解 overfitting` |

### 3.4 Measured length record (first-class evidence)

The mismatch between Phase 111's registration and Phase 111's measurement is half the reason
Phase 112 exists. Length is therefore **primary evidence**, not a footnote.

| Property | Selected grid | Eligible population |
|---|---|---|
| Aggregate measured range | **18 – 30** | 13 – 30 |
| `en` measured range | 24 – 30 | 19 – 30 |
| `zh` measured range | 20 – 29 | 14 – 30 |
| `mixed` measured range | 18 – 30 | 13 – 30 |
| Selected counts | 24, 26, 29, 30 · 20, 24, 28, 29 · 18, 20, 22, 30 | — |
| Eligible candidates before truncation | 4 / 4 / 4 selected | **45 / 41 / 60** |

**Boundary membership, reported exactly as measured:**

- At the **13-token** boundary: **no selected prompt**. The eligible population contains
  exactly one 13-token sample, `mixed-map-30` (datasetIndex 529), which rule R112 does not
  select because stratum 0 of `mixed` is decided by array order. Recorded as
  `boundaryMembership.eligibleAt13`, not silently omitted.
- At the **30-token** boundary: **two selected prompts**, `en-daily-03` and `mixed-tech-18`.
  Recorded as `boundaryMembership.selectedAt30`.

Every length is the exact integer returned by `tokenizer.encode(text).length`. Nothing is
rounded, truncated, padded or otherwise manipulated, and the count recorded in the artifact
is produced by the identical call the generation stage uses.

`prompt-set.json` additionally records: the frozen tokenizer identity (§7),
`tokenCount` for all 12 selected prompts, the per-class and aggregate measured ranges for
both the selected grid and the eligible population, the eligible count per class before
truncation, the exact rule steps, the boundary membership above, and the resolved selections
of the two **audited alternative rules** (Rule P and Rule S) with their measured rejection
reasons (§3.1). Recording the rejected alternatives pre-generation is what makes the choice
of R112 auditable rather than merely asserted.

### 3.5 Known composition properties, disclosed

1. **`mixed` is template-concentrated.** Its four selected prompts are three
   `mapping`-category `X 的中文是 Y` items plus one `technology` item. This is a property of
   the dataset, not of the rule: every low-length `mixed` candidate is a mapping template, so
   *any* rule that reaches that class's low end inherits it. Disclosed as a limitation (§10).
2. **All 12 selected prompts are `train`-split**, matching Phase 111's 12/12. Recorded, and
   asserted by the suite. It is a recorded property, not a model-relevant one: the checkpoints
   were trained on `getDatasetTexts(dataset)`, which returns **all 600 samples regardless of
   `split`** (`src/lib/minimind/data/datasetLoader.ts:281`), so `split` carries no model
   meaning under this frozen condition.
3. **`en` has no candidate below 19 tokens.** English text tokenizes into more tokens per
   word; the band's lower region is unreachable for that class. Disclosed.

---

## 4. Generation grid

`12 prompts × 4 checkpoints = 48 trajectories`, all under `P12-MASK`, using the frozen
`decodeP12Arm` semantics exactly as Phase 111 did: one forward pass per step over
`currentIds.slice(-MAX_CTX)`, one RNG draw per step, `EOS_TOKEN_ID = 3` handling, empty-mask
termination **before** any draw is consumed, horizon `MAX_TOKENS`; all via the imported
`decodeP12Arm` with a `SupportContext` built from `buildCorpusIndex` +
`measureCorpusStateTransitions` (the same machinery Phase 102 used at its P0 states).

**RNG convention.** One `createSeededRNG(42)` stream **per arm**, created once and consumed
across the 12 manifest prompts **in manifest order** (§3.2 step 8), exactly one draw per
sampling step. The parity stage separately uses one `createSeededRNG(42)` per arm over the
five frozen prompts in the recorded order — the same two-stage convention Phase 111 used.
No per-prompt reseeding, no alternative seeds, no sampling sweep, no re-draw.

Every generated trajectory is recorded whether or not it looks malformed. None is discarded.

---

## 5. Enumeration, divergence and comparability

### 5.1 Scope isolation from Phase 111

Phase 112's verdict is computed from **its own 48 trajectories only**. The two populations
are **not pooled** into a new verdict, and Phase 111's 29 decisions are **not** re-counted
into Phase 112's census. Phase-111 numbers appear in Phase 112's report only as *context*
for the power discussion (§8) and as a disclosed comparison. Phase-111 artifacts are opened
read-only; none is rewritten.

### 5.2 Per-decision record

Every step of all 48 trajectories is inspected, and every P0 decision enumerated with the
full Phase-111 field set, unchanged: `trajectory`, `prompt`, `class`, `armKey`, `stepIndex`,
`tokenIndex`, `byteOffset`, `phaseBefore`, `needBefore`, `selectedId`, `selectedBytes`,
`selectedLegal`, `selectedStartsWithContinuationByte`, `rawArgmaxId`, `rawArgmaxLegal`,
`legalMass`, `illegalMass`, `continuationStartMass`, `bareContinuationMass`,
`multibyteLeadMass`, `argmaxCompatible`, `compatibleMass`, `maskActive`, `maskIntervened`,
`corpusSupportLevel`, `corpusSupportedBestId`, `corpusSupportedBestCount`, `divergent`,
`mechanismLabel`, plus partition metadata.

### 5.3 Divergence

Reuses the Phase-102 definition **verbatim**, through the imported `isDivergent`:
`phaseBefore === "P0" && selectedLegal === false`. No second corruption criterion — not
UTF-8 validity alone, not capability level, not `charIntegrityRate`, not rollout, not
semantics, not human judgement. No threshold is modified.

### 5.4 Comparability

Reuses the imported `missingComparability` predicate. A divergent P0 decision is
**comparable** iff `legalMass`, `byteClassMass.bareContinuation`,
`byteClassMass.multibyteLead` and `corpusSupportLevel` are all measured. A divergent decision
that is not comparable is recorded with its reason and is **excluded from F2**, never
reinterpreted as measured. The A/C boundary is therefore mechanical, not a judgement call.
The census records `divergentP0Draws`, `comparableDivergentP0Draws` and
`nonComparableDivergentP0Decisions` separately.

---

## 6. Baseline parity gate

Runs **before any new-prompt generation**. No new prompt is generated until every
requirement passes; any failure produces `D` —
`BLOCKED — frozen-condition parity not established`.

The gate re-derives the **frozen 20 trajectories** (`5 prompts × 4 arms`) under `P12-MASK`
through the **Phase-112 code path** — i.e. through the imported Phase-111 `decodeP12Arm` —
and requires, against Phase-102's recording:

| ID | Requirement |
|---|---|
| P1 | `generatedIds` **byte-identical** for all 20 frozen trajectories |
| P2 | `p0IllegalDraws === 11` **and** `corruptedTrajectories === 11` |
| P3 | the 11 established states reproduced as an **exact set**, with matching `failureTokenIndex` |
| P4 | the P0 partition closes: `221 − 11 − 210 === 0`, gap `0`, bijection holds |
| P5 | `phaseLegalIdsOf(vocab, BOUNDARY_STATE)` set-identical to the per-byte walk, and both agree with the production scanner |
| P6 | `compatibleMass` at P0 equals Phase 102's recorded `legalMass` within `1e-9` |
| P7 | derived family `{boundary-state-continuation ×7, sampling-draw ×4}` **and** the classifier reproduces **all five** Phase-101-recorded P0 labels |
| P8 | `p1p2IllegalDraws === 0` **and** `otherIllegalDraws === 0` |

Plus the identities the brief names: `221 = 11 + 210`; the exact 11-state population and
exact failure indices; Phase-101 P0 label fixture parity; tokenizer census identity;
recipe identity; checkpoint identities (4/4 sha256).

**Why the gate still matters when the instrument is imported, not copied.** Because the
module is the identical object, P1–P8 no longer prove a copy equivalent. They prove the
**environment** is unchanged: the dataset, the corpus string array, the BPE build, the
built vocabulary and the four checkpoints are still the ones Phase 111 measured in. A
dataset edit, a tokenizer drift, a swapped checkpoint or a corpus change all fail here. The
Phase-111 philosophy is reused wholesale; no weaker gate is invented.

The derived family is **computed from the re-derived 11 baseline states**, never assumed,
and then required to equal the imported `FROZEN_FAMILY` (`{boundary-state-continuation,
sampling-draw}`).

---

## 7. F1 / F2 / F3 and classification

Frozen Phase-111 logic, imported rather than restated. Verdict semantics are computed by the
imported `classifyH111`, whose input is a plain object — so Phase 112's grades are Phase
111's grades **by construction**, and the suite proves the equivalence on synthetic inputs
rather than asserting it.

### F1 — byte-phase consistency check (**not** a closure falsifier)

Under `P12-MASK` the illegal P1/P2 draw class has zero realized events by construction
(Phase 102: P1/P2 illegal `0`, other illegal `0`). F1 is therefore an **instrumentation /
consistency check**, reported with `p1p2IllegalDraws` and `otherIllegalDraws` as its
evidence.

- F1 zero is **not** closure evidence.
- F1 nonzero indicates frozen-condition or implementation corruption — a mask that did not
  apply, a drifted tokenizer, a mis-recorded phase — and halts the phase as `D`
  (`BLOCKED`). **F1 can never produce `B`.**

### F2 — mechanism-label falsifier (genuine)

A newly observed **comparable** divergent P0 decision whose mechanism label is absent from
the frozen family falsifies H112. The family is the one re-derived in §6 (P7). This is a
genuine out-of-grid falsifier: computed from the new trajectory's own measured quantities, it
can come out either way.

Phase 111's degeneracy is not repeated. Phase 110's 11 "labels" are composite identity keys
`` `${armKey}/${prompt}#${failureTokenIndex}` `` that embed prompt text, so no off-grid prompt
can produce one and the literal reading fires unconditionally. As in Phase 111, that literal
reading is **reported as an observation** (`literalIdentityKeyNewMembers`) and is explicitly
**not** the operative test.

### F3 — partition-gap falsifier (genuine)

`partitionGap = p0Steps − divergentP0 − intactP0`, under the **exact Phase-110 partition
definition**, computed by the imported `partitionOf`. `partitionGap !== 0` falsifies H112.
**Do not redefine F3.** No new gap metric is introduced. The Phase-111 precedent
(`484 = 29 + 455`, gap `0`) is context only; Phase 112's partition closes on its own numbers.

F2 is **not** adjusted in response to Phase 111's result. The first firing event is
sufficient; definitions are not modified afterwards.

### Verdict semantics

Precedence **D → F1 → B → A → C**, unaltered.

| Grade | Meaning |
|---|---|
| **A** | Closure supported on the finite length-matched Phase-112 grid: a nonzero comparable divergence population exists, no F2 violation, no F3 violation, and every observed comparable divergence stays inside the frozen family. |
| **B** | A genuine frozen-family falsifier fired (F2 or F3). The first falsifying event is reported exactly. |
| **C** | Insufficient evidence: zero comparable divergent P0 decisions; or the shorter-prompt distribution suppressed the event; or the population is too small to exercise the falsifier; or the grid could not be built. |
| **D** | Blocked: frozen-condition, prompt-manifest, dataset, checkpoint, tokenizer or authoritative enumeration failure. |

No new grade is created.

### Zero-divergence rule

If all 48 trajectories complete and produce `0 comparable divergent P0 decisions`, the
result **MUST** be:

`C — INCONCLUSIVE — no comparable failure observed`

Zero failures are **never** classified as closure proof.

### Selection-failure rule

If any class yields fewer than 4 eligible in-range candidates (§3.2 step 6), the phase halts
**before generation** as:

`C — INCONCLUSIVE — insufficient deterministic length-matched external prompt set`

The range `[13, 30]` is **never** relaxed to obtain enough prompts. (Audited: this branch is
not triggered — 45 / 41 / 60 eligible.)

### Finite-sample scope

> Even an `A` result supports only the finite Phase-112 prompt/checkpoint grid under the
> frozen condition. It does not establish universal closure over arbitrary prompts, and it
> does not establish that prompt length is irrelevant.

The report must distinguish *no new divergent event observed* from *the failure population
is universally complete*. No claim of universal closure, universal model behaviour, or
exhaustion of all possible failure mechanisms is made at any verdict.

---

## 8. Sample size and experimental power

`12 prompts × 4 arms = 48 trajectories` is **retained**. It is the smallest clean extension:
the grid shape is Phase 111's, exactly one variable changes (the prompt-length region).

Observed rates from the two bracketing grids, used as an informal expectation only:

| Grid | Prompts | Prompt lengths | Trajectories | Comparable divergent P0 | per trajectory |
|---|---|---|---|---|---|
| Phase 110 baseline | 5 | 5 – 19 | 20 | 11 | 0.550 |
| Phase 111 external | 12 | 28 – 45 | 48 | 29 | 0.604 |

Phase 111's breakdown is relevant to the expectation: the 29 decisions split `zh` 14 /
`mixed` 15 / **`en` 0**, over arms `A` 8 / `B94` 8 / `C94` 7 / `T` 6, labelled
`boundary-state-continuation` 25 / `sampling-draw` 4. Every `zh` and `mixed` prompt produced
at least two comparable divergences; the four `en` prompts produced none across 384 P0 steps.

Reading: both grids — one with short prompts and one with long prompts — produced comparable
divergence populations comfortably above zero, so a 48-trajectory grid at `18–30` tokens is
expected to yield an order-20–30 comparable population if length does not suppress the event.
**This is an informal expectation from two observed rates, not a power calculation.** No
formal statistical power claim is made, and none may be added later without a justified
generative model.

Explicitly **not** claimed: that 12 prompts or 48 trajectories prove population
completeness. A larger grid was considered and rejected — it would answer no additional
scientific question, and §16 recommendation 1 of the Phase-111 report warns against adding
samples of the same kind.

---

## 9. Artifacts

`experiments/phase112/` — the same five-artifact boundary as Phase 111, one artifact added
for nothing, one removed:

```
experiments/phase112/
  length-matched-closure-audit.ts    logic module; no main; pure or read-only exports
  probe.ts                           runner; writes exactly the five artifacts below
  run-probe.cmd                      launcher (`call npx --yes tsx …`)
  .gitignore                         run logs only
  manifest.json                      the pre-generation freeze, written FIRST
  prompt-set.json                    the frozen 12-prompt manifest + the §3.4 length record
  probe-results.json                 full 48-trajectory record
  trajectory-reconciliation.json     48-row trajectory table
  divergent-p0-decisions.json        per-decision enumeration
  run-phase112-suite.ts              focused suite launcher
```

| Artifact | Purpose |
|---|---|
| `prompt-set.json` | The frozen prompt manifest: rule, resolved selection, token counts, eligible counts, per-class and aggregate measured ranges, boundary membership, tokenizer identity, audited alternatives. Frozen and hashed **before** any checkpoint load. |
| `manifest.json` | Pre-registration: H112, recipe, arms + checkpoint digests, the pinned import digest, the parity fixtures, source-artifact digests, integrity attestations. Written before generation. |
| `probe-results.json` | The full run: parity gate record, grid census, partition, mechanism family, falsifier block, observations, classification, determinism digests, integrity. |
| `trajectory-reconciliation.json` | One row per trajectory: ids, bytes, step counts, phase histogram, first-invalid phase, corruption flag. |
| `divergent-p0-decisions.json` | One row per P0 decision (all of them, with `divergent` flagging the subset), plus the trajectory-level first-divergent index. |

No convenience artifact is added. The **length audit** required by the brief lives inside
`prompt-set.json` rather than in a sixth file, because it is part of the prompt manifest's
own identity and must be hashed with it.

---

## 10. Reproducibility

Preserving the strongest Phase-111 rules:

- **Deterministic selection.** Rule R112 is a pure function of the dataset, the frozen
  tokenizer and the frozen Phase-111 artifact. No hand-picking, no post-measurement
  selection, no prompt chosen for its expected outcome.
- **Deterministic manifest order.** `en → zh → mixed`, stratum `0 → 3` within class, which
  fixes the RNG-consumption order.
- **Fixed RNG convention.** `createSeededRNG(42)`, one stream per arm per stage, one draw per
  step. `Math.random()` and `setTimeout()` are absent and source-scanned.
- **No volatile metadata.** No wall-clock field, duration, PID, UUID, absolute path,
  machine-specific metadata or filesystem-enumeration ordering is written. Every path is
  repository-relative and forward-slashed; every artifact is `JSON.stringify(value, null, 2)`
  with no trailing newline, so each artifact's **raw sha256 is the reproducible identity of
  its evidence**.
- **Deterministic canonical digests.** The deterministic core runs **twice in-process** and
  requires identical canonical digests.
- **Fresh-process reproducibility.** The full probe runs **twice in two fresh processes**,
  and all five artifacts must be **byte-identical**. A disagreement is reported as
  `BLOCKED — reproducibility failure` with the field and both values named — never resolved
  by re-running until it matches, and never averaged.
- **Digest chain.** `prompt-set.json` → `manifest.json` → `probe-results.json`: each stage
  restates and re-verifies the previous stage's digest, and a mutated copy must fail the
  check.

**Must be invariant across runs:** the prompt manifest and its hash, the §3.4 length record,
the four checkpoint identities, the imported-instrument digest, generated token ids,
generated bytes, divergent-P0 decisions, mechanism labels, phase classifications,
comparability flags, partition counts, falsifier readings, and the H112 verdict.

For source artifacts whose own writers stamp a wall-clock counter (Phase 99's
`logit-mechanism-audit.json` and the other recorded `durationMs` artifacts), the **scientific
digest** — excluding only that counter — is the reproducible identity, and the digest check
tolerates a raw move only for artifacts recorded `rawDigestReproducible: false`. Phase 112
itself writes no such field.

---

## 11. Non-goals

Phase 112 does **not**:

- train, fine-tune, or take any optimizer step;
- write, modify or re-save a checkpoint;
- modify any Phase-90–111 experiment file, artifact or report;
- modify production MiniMind code, the dataset, the tokenizer, the vocabulary, the merge
  table, or `src/lib/minimind/research/__tests__/run.ts`;
- pool Phase-111 and Phase-112 populations into a single verdict;
- reinterpret, invalidate or overwrite Phase 111;
- test Phase-111 §16 recommendation 2 (starving P0 compatible mass to make F2 reachable) —
  that remains **open** (§0.3);
- claim universal closure, universal failure-population completeness, or that prompt length
  is irrelevant;
- add a sixth artifact, a second condition, a new corruption criterion, or a new grade.

---

## 12. Coherence notes and honest caveats

1. **Finite grid.** 12 prompts × 4 arms × 24 tokens. An `A` verdict is closure support over
   this grid only.
2. **`mixed` template concentration.** Three of four `mixed` prompts are `mapping` templates
   (§3.5). The four `mixed` prompts are therefore less diverse than Phase 111's four
   technology questions, and the effective external sample for that class is smaller than
   four. Disclosed; not repaired by hand-picking.
3. **`en` may again produce no divergence.** Phase 111's `en` prompts produced none across
   384 P0 steps. If Phase 112's do the same, that is a recorded observation about this
   sample, not a claim about English prompts generally.
4. **Partial length disjointness, disclosed.** Phase 112's selected grid spans `18–30`;
   Phase 111's spanned `28–45`. They **overlap at 28–30** (5 of 12 Phase-112 prompts). The
   two grids are therefore not length-disjoint, and no claim of disjointness is made.
   The extension below 28 is the part that is genuinely new.
5. **The `13` boundary is not exercised.** No selected prompt measures 13 tokens (§3.4).
   The registered range's lower endpoint is therefore unexercised by Phase 112's grid.
6. **A single condition.** Only `P12-MASK`. No other mask regime was tested.
7. **Untracked instrument dependency.** Phase 112 depends on an untracked Phase-111 source
   file (§0.1, §2a). Mitigated by digest pinning, not eliminated.
8. **Partition paths are not statistically independent.** A, A′/B and C are three separately
   computed paths over the same measurement.
9. **The pre-registered range is now honestly measured.** Unlike Phase 111, Phase 112's
   registered `13–30` is satisfiable and satisfied: the selected grid measures `18–30 ⊆
   13–30`, recorded before generation.

---

## 13. Validation and reporting

Gates, in order:

1. `npx --yes tsx experiments/phase112/run-phase112-suite.ts`
2. `npx --yes tsx experiments/phase111/run-phase111-suite.ts` (must be unchanged)
3. `npx --yes tsx experiments/phase110/run-phase110-suite.ts` (must be unchanged)
4. `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` — **run before the final probe
   pass**, because the aggregate runner reaches the Phase-99 chain through Phase 102 and
   re-stamps `experiments/phase99/logit-mechanism-audit.json`'s raw digest (§10)
5. `npx tsc --noEmit` — expected to remain at the pre-existing baseline; **0** errors in
   `experiments/phase112/**`, the new test file, or the report path
6. `npm run build` — exit 0; no new warning attributable to Phase 112
7. post-run re-digest of every recorded source artifact
8. `git status --short experiments/phase112/` — exactly the declared files
9. `git diff --stat -- src/lib/minimind/**` — confined to the two new files

Report: `src/lib/minimind/research/PHASE112-LENGTH-MATCHED-CLOSURE-REPORT.md`. The conclusion
is written **after** measurement, never pre-written. Known pre-existing TypeScript errors and
build warnings remain out of scope and are not repaired.

**Git:** no automatic commit, no `git add -A`, no `git add .`, no push. Phase 112 does not
commit Phase 111 either. The final report states the exact Phase-112 commit boundary, the
excluded scratch/log files, the unmodified status of `research/__tests__/run.ts`, the
confirmation that Phase-102–111 artifacts are unchanged, and the fact that Phase 111 remains
untracked.
