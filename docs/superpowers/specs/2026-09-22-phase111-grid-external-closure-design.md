# Phase 111 — Grid-External Failure Closure Audit — Design

**Date:** 2026-09-22
**Hypothesis:** H111 — under the frozen `P12-MASK` condition and the recorded generation
settings, every divergent P0 decision produced by prompts outside the original
five-prompt grid falls within the already observed byte-phase/mechanism class and the
existing 11-state mechanism-label family.
**Training:** `NOT RUN`. This phase is generation-only. No optimizer step, no
checkpoint write, no tokenizer/vocabulary/merge-table change, no architecture,
evaluator, threshold, rollout, sampling-algorithm or mask change, no edit to the
original five-prompt dataset, no `Math.random()`, no `setTimeout()`.

---

## 1. Frozen baseline (verified from Phase-110 artifacts, not from prose)

| Item | Value |
|---|---|
| Grid | 4 arms × 5 prompts = 20 trajectories |
| Arms | `A` (`phase90-aligned.ckpt.json`), `B94` (`phase94-b.ckpt.json`), `C94` (`phase94-c.ckpt.json`), `T` (`phase96-treatment.ckpt.json`) |
| Prompts | `the sun rises`, `machine learning is`, `太阳`, `机器学习是`, `什么是 machine learning` |
| Recipe | `SEED = 42`, `VOCAB_TARGET = 300`, `MAX_TOKENS = 24`, `MAX_CTX = 128`, `TEMPERATURE = 0.8`, `EOS_TOKEN_ID = 3` |
| RNG convention | one `createSeededRNG(42)` **per arm per condition**, consumed across the prompt list in order, exactly one draw per generation step |
| Divergence | Phase 102 `illegalEmissions[cond].p0IllegalDraws` — one step with `phase === "P0"` **and** `selectedLegal === false` |
| Partition | `221 P0 steps = 11 divergent + 210 intact`, gap `0` |
| Frozen classes | all 11 states are `phase === "P0"` |
| Prior artifacts | Phase-110 manifest records 13 source digests; `phase102/probe-results.json` scientific sha256 `47ee66cf…` |

If any of the above cannot be reproduced, the phase stops with
`BLOCKED — Phase-110 closure baseline not reproducible`.

### 1a. The 11 "labels" are identity keys, not mechanism classes

Phase 110's 11 labels are the composite keys `` `${armKey}/${prompt}#${failureTokenIndex}` ``.
They embed prompt text, so **no out-of-grid prompt can produce one**. Read literally,
falsifier F2 ("mechanism label absent from the frozen 11-state label set") fires
unconditionally on the first new divergence and carries no information. This is
recorded as a degeneracy of the brief's wording, measured and reported, and is **not**
the operative test.

### 1b. The operative mechanism family

The repository's authoritative mechanism classifier is `labelFailureMechanism`
(`experiments/phase99/logit-mechanism-audit.ts:577`), a pure function of
`{argmaxCompatible, compatibleMass, phase, byteClassMass.bareContinuation, byteClassMass.multibyteLead}`
with a closed 5-value domain:

`sampling-draw` · `under-ranked-legal` · `boundary-state-continuation` · `midstate-new-lead` · `illegal-argmax-other`

Applied to the 11 established states' **recorded** Phase-102 quantities, the derived
family is `boundary-state-continuation` ×7 and `sampling-draw` ×4. This derivation
reproduces **all five** Phase-101-recorded P0 labels exactly, which is the parity gate
that licenses its use.

### 1c. F1 is a consistency check, not a closure falsifier

The P12 mask removes mid-sequence illegal emissions by construction (Phase 102:
`P1/P2 illegal = 0`, `other illegal = 0`), so the illegal P1/P2 draw class is expected to
have **zero realized events** under the frozen condition. F1 therefore cannot serve as an
independent closure falsifier. It is an instrumentation / consistency check: a zero
reading does not constitute closure evidence, and a violation would indicate
frozen-condition or implementation corruption rather than a normal model failure. See §6.

---

## 2. Instrument architecture

```
experiments/phase111/
  grid-external-closure-audit.ts   logic module, no main; all exports are pure or read-only
  probe.ts                         runner; writes the five artifacts below
  run-probe.cmd                    launcher (call npx --yes tsx ...)
  manifest.json                    written FIRST, before any generation
  prompt-set.json                  the frozen 12-prompt manifest
  probe-results.json               full 48-trajectory record
  trajectory-reconciliation.json   48-row trajectory table
  divergent-p0-decisions.json      per-decision enumeration
```

### 2a. Import boundary (side-effect avoidance)

`experiments/phase99/logit-mechanism-audit.ts` has **no `require.main` guard**: importing
it executes `main()` and rewrites `experiments/phase99/logit-mechanism-audit.json`. Phases
101–102 import it; Phase 110 does not.

Phase 111 imports **only** `experiments/phase98/cjk-byte-corruption-audit.ts`, which does
carry the guard. Verified empirically: importing phase98 alone leaves
`experiments/phase99/logit-mechanism-audit.json` at raw sha256 `0abf5480…` with its mtime
unchanged.

Everything else needed is copied into `grid-external-closure-audit.ts` as read-only
logic: the byte-phase walker, `byteClassMassOf`, `labelFailureMechanism`, the phase-mask
builder/applier, `softmaxAt`, `rankByLogit`, `isContinuationByte`, `phaseOfConsumed`.
No historical source file is modified.

### 2b. Mandatory parity gate (runs before any new-prompt generation)

The copy is proven equivalent by re-deriving the **frozen 20 trajectories** under
`P12-MASK` through the phase111 code path and requiring, against Phase 102's recording:

1. `generatedIds` byte-identical for all 20 trajectories;
2. `p0IllegalDraws === 11` and `corruptedTrajectories === 11`;
3. the 11 state labels reproduced as an exact set, with matching `failureTokenIndex`;
4. the P0 partition closes (`p0Steps − divergentP0 − intactP0 === 0`);
5. `phaseLegalIdsOf(vocab, BOUNDARY_STATE)` is set-identical to the byte walk
   `appendBytes(BOUNDARY_STATE, bytes, 0).invalidAt === -1` (computed, not assumed);
6. `compatibleMass` at P0 equals Phase 102's `legalMass` within the recorded tolerance.

Any failure stops the phase: `BLOCKED — frozen-condition parity not established`.
No new prompt is generated until this gate passes.

---

## 3. Prompt selection (deterministic, resolved before any generation)

**Source:** `src/data/minimind/datasets/bilingual.json`, version `0.3.0`, schemaVersion 1 —
the frozen dataset already used by MiniMind. It exposes `id`, `language` (`zh`/`en`/`mixed`),
`text`, `category`, `split`.

**Rule**, in this exact order:

1. Partition the 600 samples by `language` into `zh` (200), `en` (200), `mixed` (200).
2. **Exclusion:** drop any sample whose `text` contains any of the five frozen prompts as
   a substring (this removes `en-general-01`, `zh-general-01`, `zh-sci-11`,
   `mixed-tech-01` — the four samples the frozen prompts were drawn from), and drop the
   five frozen prompts themselves. No earlier Phase-90–110 generation prompt is anything
   other than one of those five, verified by scanning every phase's prompt literals.
3. Within each class, order by **dataset array index** — stable and reproducible. (The
   array is grouped by language then index, not globally `id`-sorted, so array index is
   the stable order, not `id` lexicographic order.)
4. Take the **first 4** eligible samples per class.
5. **Prompt text = the sample's full `text`.** No truncation, no hand-picking.

**Resolved selection** (read from the dataset, frozen before generation):

| Class | IDs | Prompts |
|---|---|---|
| en | `en-general-02..05` | `a small river flows through the green forest` · `children play under the tall oak trees after school` · `rain falls softly on the roof of the old house` · `the owl watches the field from its quiet branch` |
| zh | `zh-general-02..05` | `一条小河穿过绿色的森林` · `孩子们放学后在树下玩耍` · `细雨轻轻落在老房子的屋顶上` · `猫头鹰在树枝上安静地注视田野` |
| mixed | `mixed-tech-02..05` | `transformer 里的 attention 是怎么工作的？` · `为什么要用 gradient descent 来训练模型？` · `embedding 向量有什么作用？` · `怎么判断模型是不是 overfitting？` |

Manifest order is fixed as `en(in order) → zh(in order) → mixed(in order)`, making the
RNG-consumption order explicit. No `split` filter is applied: the first four eligible
samples in every class are already `train`-split (the `validation`/`test` samples begin at
array index 160 within each group), so a split restriction would be redundant. The test
suite asserts that equivalence rather than relying on it.

If any class yields fewer than 4 eligible samples →
`INCONCLUSIVE — insufficient deterministic out-of-grid prompt set`. Class counts are never
silently changed.

`prompt-set.json` is written and hashed **before** any model is loaded. The same manifest
is reused for all four checkpoints and for every rerun. It is never updated after model
output is seen.

### 3a. Limitation — external prompt length

The external prompt set is longer than the original five-prompt grid. Original prompts are
5–19 tokens; the external set is 13–30 tokens. If the longer-prefix distribution suppresses
divergence and produces no comparable divergent P0 decisions, the result must be classified
as `INCONCLUSIVE`, not as closure proof.

This is a **limitation recorded before measurement, not a reason to change the selection
protocol.** The prompt set above is approved and frozen; it is not to be redesigned around
token length. Suppression of the event is a property of the sample, and §7 handles it as a
classification outcome rather than as a reason to re-draw prompts.

---

## 4. Generation grid

`12 prompts × 4 checkpoints = 48 trajectories`, all under `P12-MASK`, using
`decodeArmConditionP102`'s semantics reproduced exactly: one forward pass per step over
`currentIds.slice(-MAX_CTX)`, one RNG draw per step, `sampleToken(rowAfterP12Mask, draw, TEMPERATURE)`,
`EOS_TOKEN_ID = 3` handling, empty-mask terminates the trajectory, horizon `MAX_TOKENS`.

**RNG convention:** one `createSeededRNG(42)` **per arm**, consumed across the 12 manifest
prompts in manifest order. This is the faithful extension of Phase 102's documented
convention ("one `createSeededRNG(42)` stream per arm PER CONDITION, consumed across the
prompts in order") to a different prompt list. No per-prompt reseeding, no alternative
seeds, no reruns under different sampling.

Every generated trajectory is recorded whether or not it looks malformed. None is
discarded.

---

## 5. Enumeration

For each of the 48 trajectories, **every** step is inspected and every P0 decision is
enumerated with:

`trajectory`, `prompt`, `class`, `armKey`, `stepIndex`, `tokenIndex`, `byteOffset`,
`phaseBefore`, `needBefore`, `selectedId`, `selectedBytes`, `selectedLegal`,
`selectedStartsWithContinuationByte`, `rawArgmaxId`, `rawArgmaxLegal`, `legalMass`,
`illegalMass`, `continuationStartMass`, `bareContinuationMass`, `multibyteLeadMass`,
`argmaxCompatible`, `compatibleMass`, `maskActive`, `maskIntervened`,
`corpusSupportLevel`, `corpusSupportedBestId`, `corpusSupportedBestCount`,
`divergent`, `mechanismLabel`, `gap/partition metadata`.

**Divergence** reuses Phase 102's definition verbatim: `phase === "P0" && selectedLegal === false`.
No new corruption criterion. Not UTF-8 validity alone, not capability level, not
`charIntegrityRate`, not rollout, not semantics, not human judgement.

**Corpus support** reuses Phase 98's `measureSupport` (imported, not copied) with
`EXACT_CONTEXT_LEN = 4` and the corpus state-transition table — the same machinery
Phase 102 used at its P0 states. Level ∈ `exact | sparse | indirect | none | unresolved`.
No semantic similarity, no decoded-text substring matching.

---

## 6. Closure test

Three clauses with explicitly different evidential weight. Only F2 and F3 are falsifiers.

### F1 — Byte-phase consistency check (not a closure falsifier)

Under `P12-MASK`, the illegal P1/P2 draw class is expected to have zero realized events,
because the mask prevents that class by construction. Therefore:

- F1 is a **consistency / instrumentation check**;
- F1 being zero does **not** constitute strong closure evidence;
- any violation would indicate **frozen-condition or implementation corruption** — a mask
  that did not apply, a drifted tokenizer, a mis-recorded phase — rather than a normal
  model failure.

F1 is reported with `p1p2IllegalDraws` and `otherIllegalDraws` as its evidence, and is
handled as a parity-gate extension: a nonzero reading stops the phase as corrupt
(`BLOCKED`), it does not produce verdict B.

### F2 — Mechanism-label falsifier (genuine)

A newly observed divergent P0 decision whose mechanism classifier output is absent from the
frozen Phase-110 11-state label family falsifies H111. The family is the one resolved in
§1b — the Phase-99 `labelFailureMechanism` output over the 11 established states,
`{boundary-state-continuation, sampling-draw}`, read within the classifier's closed
5-label domain.

This is a genuine out-of-grid falsifier: it is computed from the new trajectory's own
measured quantities and can come out either way. The literal identity-key reading (§1a) is
reported alongside it but is **not** the operative test.

### F3 — Partition-gap falsifier (genuine)

`partitionGap = p0Steps − divergentP0 − intactP0`, under the **exact Phase-110 partition
definition** — `221 = 11 + 210`, gap `0`. No new gap metric is introduced.
`partitionGap !== 0` falsifies H111.

The first firing event is sufficient; definitions are not modified afterwards.

Also reported, as observations rather than falsifiers: per-label count comparison;
corpus-support level comparison against the 11 established states; and whether any
established-state mechanism label is absent from the new set — population *drift*, a
separate observation from closure.

---

## 7. Classification

### A — Grid-external closure supported

**Only** when all of the following hold:

- the external grid contains **enough comparable divergent P0 decisions to exercise the
  closure test** — a nonzero comparable divergence population, not an empty one;
- no F2 mechanism-label violation occurs;
- no F3 partition-gap violation occurs;
- every observed comparable divergence remains within the frozen established family.

### B — Grid-external closure falsified

If **any** F2 or F3 falsifier fires. The exact first falsifying event is reported.

### C — Inconclusive

`INCONCLUSIVE` is used when:

- zero comparable divergent P0 decisions are observed;
- the external prompt distribution suppresses the relevant event;
- insufficient comparable divergences exist to test closure;
- generation completes but the evidence cannot exercise the falsifier.

### D — Blocked

`BLOCKED` is used for frozen-condition, prompt-manifest, checkpoint, tokenizer, or
authoritative event-enumeration failure.

### Zero-divergence rule

If all 48 new trajectories complete successfully but produce:

`0 comparable divergent P0 decisions`

then the result **MUST** be:

`INCONCLUSIVE — no comparable failure observed`

Zero failures are never classified as closure proof.

> Absence of a new failure in this finite external sample does not establish that the
> failure population is universally complete.

The report must distinguish *no new divergent event observed* from *failure population
proven universally complete*.

### Finite-sample scope

> Even an A result only supports closure over the fixed external prompt/checkpoint grid
> used by Phase 111. It does not establish universal closure over arbitrary prompts.

No claim of universal closure, universal model behaviour, or exhaustion of all possible
failure mechanisms is made at any verdict.

---

## 8. Reproducibility

The complete grid runs **at least twice**. Required identical across runs: prompt manifest
(and its hash), checkpoint identities, generated token IDs, generated bytes, divergent-P0
decisions, mechanism labels, phase classifications, partition counts, H111 verdict.

Artifacts are written with **no wall-clock field**, so raw sha256 is the reproducible
identity of the evidence (Phase-110 convention). Any differing scientific field stops the
phase for diagnosis. The probe also runs its deterministic core twice in-process and
requires identical canonical digests.

---

## 9. Tests

`src/lib/minimind/research/tests/phase111-grid-external-closure.test.ts`, covering:

- **Prompt selection** — determinism, 4/4/4 allocation, the five frozen prompts excluded,
  earlier Phase-90–110 generation prompts excluded, stable ordering, manifest hash stable,
  reordering the manifest changes the RNG consumption (so ordering is load-bearing).
- **Frozen condition** — four checkpoint identities, tokenizer/vocabulary identity,
  generation-setting identity, P12-MASK identity, parity gate result.
- **Enumeration** — every P0 decision inspected, divergent classification deterministic,
  no missing trajectory, `steps.length` consistent with `generatedIds.length`.
- **Labels** — phase-111 classifier matches Phase-99's on fixtures; the derivation
  reproduces the 5 Phase-101-recorded P0 labels; unknown label detected as failure;
  classifier domain closed.
- **Partition** — Phase-110 zero-gap logic reproduced on the frozen 20; new-prompt
  partition computed without changed semantics; injected gap detected.
- **Classification** — zero comparable divergences classifies as
  `INCONCLUSIVE — no comparable failure observed` and never as A; an F2 or F3 firing
  classifies as B; an F1 violation is reported as a consistency failure and does not by
  itself produce B; every A verdict in the suite carries a nonzero comparable divergence
  population.
- **Reproducibility** — same manifest → byte-identical scientific results; same
  checkpoints → same generated outputs.

Tests never hardcode the new experimental results; they read the artifacts and check
internal consistency and the frozen-fixture claims.

---

## 10. Validation and reporting

1. Phase-111 focused suite
2. Phase-110 focused suite
3. Aggregate research suite `src/lib/minimind/research/__tests__/run.ts`
4. `npx tsc --noEmit`
5. `npm run build`
6. `git status --short`

Report: `src/lib/minimind/research/PHASE111-GRID-EXTERNAL-CLOSURE-REPORT.md` with the 17
sections named in the brief. The conclusion is written after measurement, never
pre-written.

Known pre-existing TypeScript errors and build warnings remain out of scope; unrelated
historical files are not repaired.

**Git:** no automatic commit, no `git add -A` / `git add .`. The exact Phase-111 commit
boundary, excluded scratch files, the status of `research/__tests__/run.ts`, and
confirmation that Phase-102–110 artifacts are unchanged are reported at the end.
