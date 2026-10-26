# Phase 111 — Grid-External Failure Closure Audit — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-22-phase111-grid-external-closure-design.md` (approved, frozen)
**Date:** 2026-09-22
**Status:** plan only — nothing implemented, nothing generated, nothing committed
**Verdict target:** H111 — under the frozen `P12-MASK` condition, every divergent P0 decision
produced by prompts outside the original five-prompt grid falls inside the already observed
byte-phase class and the existing mechanism-label family.

---

## 1. Scope

### 1.1 What Phase 111 is

A **generation-only, read-only, zero-training** audit. It runs the four frozen checkpoints over a
new, deterministically selected 12-prompt external set under the frozen `P12-MASK` condition
(`12 × 4 = 48` trajectories), enumerates every divergent P0 decision, labels it with the frozen
Phase-99 classifier, and asks whether the resulting population stays inside the frozen Phase-110
family.

### 1.2 What Phase 111 is not

- No optimizer step, no training, no checkpoint write, no tokenizer / vocabulary / merge-table
  change, no architecture, evaluator, threshold, rollout, sampling-algorithm or mask change.
- No `Math.random()`, no `setTimeout()`/`setInterval()`.
- No modification of the five-prompt dataset, the frozen five prompts, or any Phase 90–110 file
  (`experiments/phase9*/`, `experiments/phase10*/`, `experiments/phase110/probe-results.json`,
  `experiments/phase102/*`, `experiments/phase99/*`, …).
- No modification of production code under `src/lib/minimind/**` except the two new research
  files named in §3.
- No new corruption criterion, no new label, no new partition metric, no new statistical test.

### 1.3 Frozen condition, at a glance

| Item | Value | Re-derived from |
|---|---|---|
| Condition | `P12-MASK` | spec §4; `experiments/phase102/p0-phase-mask-audit.ts:648` |
| Arms | `A`, `B94`, `C94`, `T` | `experiments/phase98/cjk-byte-corruption-audit.ts:127` |
| Recipe | `SEED 42`, `VOCAB_TARGET 300`, `MAX_TOKENS 24`, `MAX_CTX 128`, `TEMPERATURE 0.8`, `EOS_TOKEN_ID 3` | phase98 constants + phase102 `recipe` |
| RNG | one `createSeededRNG(42)` **per arm**, consumed across the 12 manifest prompts in manifest order, exactly one draw per sampling step | spec §4 |
| Divergence | `phase === "P0" && selectedLegal === false` | Phase 102 `illegalEmissions[cond].p0IllegalDraws` |
| Falsifiers | F2 (mechanism label outside the frozen family), F3 (`partitionGap !== 0`) | spec §6 |
| Consistency check | F1 (`p1p2IllegalDraws`, `otherIllegalDraws`) — nonzero ⇒ `BLOCKED`, never B | spec §1c/§6 |

---

## 2. Existing code / artifact dependencies

Every dependency below was read from the repository during planning. The plan does **not** assume
any of them; each is re-verified by the parity gate (§5.2) and the test suite (§9).

### 2.1 Hard artifacts (read-only, never rewritten)

| Artifact | Why Phase 111 needs it | Recorded identity |
|---|---|---|
| `experiments/phase102/probe-results.json` | frozen 20-trajectory record; `illegalEmissions["P12-MASK"]` (`p0Steps 221`, `p0IllegalDraws 11`, `p1p2IllegalDraws 0`, `otherIllegalDraws 0`); `metrics["P12-MASK"].aggregate.corruptionByPhase.P0 = 11`; `capabilityByArm[arm]["P12-MASK"].samples[i].generatedIds`; `p0FailureStates.fromP12` (11 rows); `recipe.eosTokenId = 3` | scientific sha256 `47ee66cfb07bfec3…` (Phase 103/110 recorded) |
| `experiments/phase107/intact-states.json` | the intact P0 complement used by the Phase-110 partition — `populationSize 210` | scientific sha256 `1def8c9b7c4bc727…` |
| `experiments/phase101/static-failure-state.json` | 12 recorded states with their recorded `mechanismLabel`; the 5 P0 labels are the classifier parity fixture | scientific sha256 `2d80db8a4733beef…` |
| `experiments/phase99/logit-mechanism-audit.json` | recorded `failures` / `firstInvalidStepByTrajectory` (BASE context only, used by nothing in the decision path) | scientific sha256 `35eb66d11614a490…`; **raw digest not reproducible** (`durationMs`) |
| `experiments/phase110/probe-results.json`, `manifest.json` | the frozen Phase-110 baseline: 11-state population, `221 = 11 + 210` gap 0, `Census`/`Join` blocks | Phase-110 digests |

Dependencies are recorded in the Phase-111 `manifest.json` with **both** raw and scientific
digests, and every Phase-99-family entry is labelled `rawDigestReproducible: false` with the
reason (Phase-110 convention, `PHASE110-FAILURE-POPULATION-REPORT.md` §15). The report must repeat
the warning that **any import of the Phase-99 module chain (which `experiments/phase102/*` and
`src/lib/minimind/research/__tests__/run.ts` both reach) re-stamps `durationMs` in
`experiments/phase99/logit-mechanism-audit.json` and moves its raw bytes** while leaving its
scientific digest fixed.

### 2.2 Importable source (exactly one file)

`experiments/phase98/cjk-byte-corruption-audit.ts` — the **only** historical file Phase 111 imports,
because it is the only one in the chain that carries `if (require.main === module)` (`:2446`).
Objects used:

- `ARMS` (`:127`), `GEN_EVAL_PROMPTS` — **not** used for the new grid, only for the parity gate.
- `SEED`, `VOCAB_TARGET`, `MAX_TOKENS`, `MAX_CTX`, `TEMPERATURE` (`:89`–`:93`), `EXACT_CONTEXT_LEN` (`:100`).
- `appendBytes` (`:342`), `BOUNDARY_STATE` (`:320`), `tokenBytes` (`:264`),
  `classifyVocabEntry` (`:276`), `classifyVocabulary` (`:300`).
- `buildCorpusIndex` (`:535`), `measureCorpusStateTransitions` (`:812`), `measureSupport` (`:890`),
  `compatibleContinuations` (`:762`), `loadCorpus` (`:1815`), `buildTokenizer` (`:1824`),
  `loadArmModel` (`:1878`), `createSeededRNG` (`:1109`), `sampleToken` (`:1120`),
  `verifyScannerEquivalence` (`:390`).

Importing Phase 98 alone does **not** reach the Phase-99 module chain, so it does not rewrite
`experiments/phase99/logit-mechanism-audit.json`. The probe records the pre-run and post-run
scientific digest of that file and requires them to be unchanged (§12, gate G7).

### 2.3 Not importable — copied read-only into `experiments/phase111/grid-external-closure-audit.ts`

`experiments/phase99/logit-mechanism-audit.ts` executes `main()` on import (`:2378`, no guard) and
rewrites its own artifact. `experiments/phase101/utf8-phase-mask-audit.ts` and
`experiments/phase102/p0-phase-mask-audit.ts` both import it. The approved spec §2a therefore
restricts Phase 111 imports to Phase 98, and the following are **copied verbatim** (same
arithmetic, same tie-breaks, same error paths; no signature invention):

| Copied object | Source | Purpose |
|---|---|---|
| `leadSequenceLength`, `walkPhaseBytes`, `phaseOfConsumed`, `phaseOfIds`, `PhaseState` | `phase99/logit-mechanism-audit.ts:166–262` | the byte-phase walker |
| `softmaxAt`, `rankByLogit` | `phase99:270`, `:282` | distribution + ranking, ascending-id tie-break |
| `ByteClassMass`, `byteClassMassOf` | `phase99:370`, `:391` | F2 input |
| `FailureMechanismLabel`, `MechanismLabelInput`, `labelFailureMechanism` | `phase99:561–590` | F2 classifier |
| `isTokenLegalForUtf8Phase`, `phaseLegalIdsOf`, `buildPhaseMask`, `applyPhaseMask`, `maskedArgmaxOf`, `contextPhaseOf`, `ContextPhase`, `EOS_TOKEN_ID = 3`, `LEGAL_MASS_TOLERANCE = 1e-9` | `phase101/utf8-phase-mask-audit.ts:325, :363, :379, :441, :462, :500, :137, :179` | frozen `P12-MASK` |
| `decodeArmConditionP102` semantics, `maskForCondition` (P12 branch only), `stepLikeForP0` | `phase102/p0-phase-mask-audit.ts:788, :648, :1291` | the frozen generation loop |
| `partitionOf`, `censusOf`, `bijectionOf` | `experiments/phase110/failure-population-audit.ts:580, :499, :543` | F3 partition |

> **Observed, and deliberately not acted on.** `experiments/phase110/failure-population-audit.ts`
> has **no imports at all**, so importing it would be side-effect free. The approved spec's import
> boundary names Phase 98 only; the plan follows the spec and **copies**, proving equivalence by
> parity gate instead of widening the boundary. This is recorded in the report as a design note,
> not as a defect.

No historical file is modified to make anything importable.

### 2.4 Checkpoints (read-only, never written)

| Arm | Path | Loader |
|---|---|---|
| `A` | `experiments/phase90/phase90-aligned.ckpt.json` | `loadArmModel(tokenizer, path)` |
| `B94` | `experiments/phase94/phase94-b.ckpt.json` | idem |
| `C94` | `experiments/phase94/phase94-c.ckpt.json` | idem |
| `T` | `experiments/phase96/phase96-treatment.ckpt.json` | idem |

Each checkpoint's raw sha256 is recorded in `manifest.json` and again in `probe-results.json`.
`experiments/phase90/phase90-aligned.ckpt.json` **does not exist** if any arm checkpoint is missing
⇒ `BLOCKED — checkpoint identity failure` (no substitute arm, no dropped arm).

### 2.5 Dataset (read-only)

`src/data/minimind/datasets/bilingual.json` — `metadata.id "bilingual"`,
`metadata.version "0.3.0"`, `metadata.schemaVersion 1`, 600 samples, fields
`{id, language, text, category, split}`, class counts `en 200 / zh 200 / mixed 200`.

---

## 3. File-by-file implementation plan

Nine files. Nothing else is created, and no existing file is edited except the report (§10),
which is new anyway.

### 3.1 `experiments/phase111/grid-external-closure-audit.ts` (new)

Logic module. **No `main()`, no `require.main` block, no I/O writes, no timers, no `Math.random()`.**
All exports are pure functions or read-only readers. Contains:

1. the copied primitives of §2.3, each in an explicitly headed copy block naming its source
   `path:line` in a comment;
2. `selectExternalPrompts(dataset)` — the §4 selection, a pure function of the parsed dataset;
3. `decodeFrozenP12(arm, prompts, model, tokenizer, vocab, continuationStartIds, random)` — the
   Phase-102 decode semantics of §5 (`P12-MASK` only);
4. `enumerateP0Decisions(trajectory, …)` — the §6 enumerator;
5. `labelP0Mechanism(input)` — the §7 wrapper over the copied classifier;
6. `frozenFamilyOf(decisions11)` — derives the frozen family from the 11 re-derived states;
7. `partitionOf`-based `p0PartitionOf(census, intactP0Steps)` — copied, §8;
8. `classifyH111({f1, f2, f3, comparableDivergences, gateFailures})` — the §8 verdict function;
9. the artifact builders used by the probe.

### 3.2 `experiments/phase111/probe.ts` (new)

Runner. Writes exactly the five artifacts of spec §2 into `experiments/phase111/`, in the order of
§11.2, calls `require.main === module` (guard required — this file must be importable by the test
suite without generating anything). Imports `./grid-external-closure-audit` and
`../phase98/cjk-byte-corruption-audit` only. Exports `canonicalDigestOf`, `rawDigestOf`,
`scientificDigestOf`, `artifactIdentity`, `relPath` and a `runPhase111(stage)` entry so the test
can re-run the deterministic core in-process without writing.

### 3.3 `experiments/phase111/run-probe.cmd` (new)

Launcher. Phase-110 pattern, including the mandatory `call` before `npx` and an absolute `cd /d`
path. Stages: `--stage=frozen` (selection + manifest + prompt set only), `--stage=parity`
(parity gate), `--stage=grid` (new grid), `--stage=all`. Logs to `experiments/phase111/probe.log`.

### 3.4 `experiments/phase111/.gitignore` (new)

Ignores `probe.log`, `build.log`, `typecheck.log`, `research-suite.log`, `focused-suite.log` so
`git status --short experiments/phase111/` equals the Phase-111 commit boundary (Phase-110
pattern). No checkpoint lands here, so no `*.ckpt.json` rule is needed.

### 3.5 artifacts — `prompt-set.json`, `manifest.json`, `probe-results.json`, `trajectory-reconciliation.json`, `divergent-p0-decisions.json` (new, §11)

### 3.6 `experiments/phase111/run-phase111-suite.ts` (new)

Focused runner: imports `runPhase111Tests()` from the test file, prints
`PHASE111_TESTS passed=… failed=… skipped=…`, exits 1 on failure. Launcher, not a second runtime.

### 3.7 `src/lib/minimind/research/tests/phase111-grid-external-closure.test.ts` (new)

The contract suite of §9. Design convention copied from
`tests/phase110-failure-population.test.ts`: module-level `passed/failed/skipped` counters,
`check(name, condition, detail)` / `skip(name, why)`, `readJson<T>(file)`, `codeOf(source)` source
scanner, `NONDETERMINISM_CALL` / `TIMER_CALL` / `TRAINING_CALLS` / `MODEL_CALLS` scans, and a
single exported `runPhase111Tests(): TestResult`. Synchronous.

### 3.8 `src/lib/minimind/research/PHASE111-GRID-EXTERNAL-CLOSURE-REPORT.md` (new)

The report of §10.

### 3.9 **Not touched** (explicit)

`src/lib/minimind/research/__tests__/run.ts` — **no registration**, see §13.

---

## 4. Prompt-manifest construction

### 4.1 Dataset source and version

- Path: `src/data/minimind/datasets/bilingual.json`
- `metadata.id = "bilingual"`, `metadata.version = "0.3.0"`, `metadata.schemaVersion = 1`
- 600 samples; `language` ∈ `{zh, en, mixed}`; 200 per class (verified during planning).

### 4.2 The rule, in the spec's exact order

1. **Partition** the sample array by `language` into `en` (200), `zh` (200), `mixed` (200),
   preserving dataset array index.
2. **Exclusion (rule-faithful).** Drop every sample whose `text` contains any of the five frozen
   prompts as a substring:
   `the sun rises`, `machine learning is`, `太阳`, `机器学习是`, `什么是 machine learning`.
   The five frozen prompts are themselves never candidates.
   The exclusion set is **computed from the dataset at run time**, never hardcoded.
3. **Order** within each class by **dataset array index** (the array is grouped by language, so
   array index — not `id` lexicographic order — is the stable order).
4. **Take the first 4 eligible samples per class.**
5. **Prompt text = the sample's full `text`.** No truncation, no hand-picking, no length shaping.
6. **Manifest order** = `en` (in order) → `zh` (in order) → `mixed` (in order). This order is
   load-bearing: it fixes the RNG consumption order (§5.3).
7. **No `split` filter** is applied. The suite asserts that the first four eligible samples in
   every class are already `train` (non-`train` samples start at array index 160 / 360 / 560), so
   a split restriction would be redundant.
8. If any class yields fewer than 4 eligible samples ⇒ halt as
   `INCONCLUSIVE — insufficient deterministic out-of-grid prompt set`. Class counts are never
   silently changed.

### 4.3 Resolved selection (re-derived at planning time, to be re-derived by the probe)

| # | Class | Dataset index | ID | Text | split / category |
|---|---|---|---|---|---|
| 0 | en | 1 | `en-general-02` | `a small river flows through the green forest` | train / general |
| 1 | en | 2 | `en-general-03` | `children play under the tall oak trees after school` | train / general |
| 2 | en | 3 | `en-general-04` | `rain falls softly on the roof of the old house` | train / general |
| 3 | en | 4 | `en-general-05` | `the owl watches the field from its quiet branch` | train / general |
| 4 | zh | 201 | `zh-general-02` | `一条小河穿过绿色的森林` | train / general |
| 5 | zh | 202 | `zh-general-03` | `孩子们放学后在树下玩耍` | train / general |
| 6 | zh | 203 | `zh-general-04` | `细雨轻轻落在老房子的屋顶上` | train / general |
| 7 | zh | 204 | `zh-general-05` | `猫头鹰在树枝上安静地注视田野` | train / general |
| 8 | mixed | 401 | `mixed-tech-02` | `transformer 里的 attention 是怎么工作的？` | train / question |
| 9 | mixed | 402 | `mixed-tech-03` | `为什么要用 gradient descent 来训练模型？` | train / question |
| 10 | mixed | 403 | `mixed-tech-04` | `embedding 向量有什么作用？` | train / question |
| 11 | mixed | 404 | `mixed-tech-05` | `怎么判断模型是不是 overfitting？` | train / question |

### 4.4 Exclusions — the rule and the spec's enumeration differ, and the rule governs

The spec §3 rule ("drop any sample whose `text` contains any of the five frozen prompts as a
substring") removes **five** samples, not four:

| Dataset index | ID | offending substring |
|---|---|---|
| 0 | `en-general-01` | `the sun rises` |
| 200 | `zh-general-01` | `太阳` |
| 298 | `zh-sci-11` | `太阳` |
| **324** | **`zh-fact-01`** — `地球围绕太阳运行一周大约需要三百六十五天` | `太阳` |
| 400 | `mixed-tech-01` | `什么是 machine learning` |

The spec's parenthetical names only `en-general-01`, `zh-general-01`, `zh-sci-11`,
`mixed-tech-01`. The discrepancy is **inert for the selection**: `zh-fact-01` sits at index 324,
beyond the first four eligible `zh` samples (201–204), and does not enter any other class, so the
resolved 12-prompt set above is identical under either reading.

Handling, per the brief's "do not change the spec":

- the **rule** is implemented, because it is the operative deterministic instruction;
- the manifest records the full computed exclusion set (5 entries) **and** the ids the spec's
  parenthetical names (4), and states that the rule governs;
- the probe records `exclusionSetSize: 5`, `specProseExclusionSetSize: 4`, and
  `resolvedSelectionUnchanged: true` (re-derived, not asserted from prose);
- the report reports the discrepancy in its limitations/consistency section. It is **not**
  grounds for a verdict change and **not** grounds for re-selecting prompts.

### 4.5 Token-length measurement (declared limitation, measured not assumed)

The probe measures, with the frozen tokenizer, `encode(text).length` for all 12 external prompts
and for the five frozen prompts, and records them in `prompt-set.json`. The spec's pre-registered
ranges (original 5–19, external 13–30) are recorded alongside. A measured range outside the
pre-registered range is **reported as a measured discrepancy**, never used to re-select prompts.
The measured per-class token statistics are the evidence behind the spec §3a limitation and behind
the C verdict when divergence is suppressed.

### 4.6 Manifest freezing before generation

`prompt-set.json` is written and hashed **before any model is loaded**. Its raw sha256 is recorded
in `manifest.json` and restated in `probe-results.json`. The file is never updated after model
output is seen. Enforcement is mechanical, not conventional:

- the probe computes the manifest in memory, compares it against the on-disk `prompt-set.json`
  when that file exists, and **halts** (`D`) if the recomputed canonical digest differs;
- `probe-results.json` records the `prompt-set.json` digest it actually consumed;
- the suite recomputes the selection from the dataset and requires the digest to match the
  recorded one (§9).

No post-measurement prompt selection is possible: generation reads prompts only from the frozen
file, and the file cannot change without the probe refusing to run.

---

## 5. Frozen generation protocol

### 5.1 Checkpoint loading and model configuration

- Tokenizer: `buildTokenizer(loadCorpus(), VOCAB_TARGET)` (`phase98:1824`, `:1815`) — the same
  corpus loader and vocabulary build every phase since 98 used. Vocabulary classified by
  `classifyVocabulary(idToToken, tokenizer.vocabSize)`.
- Model: `loadArmModel(tokenizer, checkpointPath)` (`phase98:1878`) — production config via
  `getProductionModelConfig`, then `loadCheckpoint`. Weights are only read.
- `checkpointSha256` recorded per arm. The parity gate requires the recorded digest to match the
  digest Phase-102 recorded for the same path where Phase-102 recorded one.
- No model view subclass, no `forward` override: `P12-MASK` masks the **logit row**, exactly as
  `decodeArmConditionP102` does (`applyPhaseMask(row, mask)`), which needs no model wrapper.

### 5.2 The four-step order (hard gate before any new prompt)

Stage order is fixed and each stage is separately invocable:

1. `--stage=frozen` — selection, `prompt-set.json`, `manifest.json`, selection assertions.
   **No model is loaded.**
2. `--stage=parity` — `P12-MASK` over the **frozen five prompts** through the Phase-111 code path,
   compared against Phase-102's record. **No new prompt is generated.**
3. `--stage=grid` — the new 12-prompt grid.
4. `--stage=all` — 1 → 2 → 3 in one process.

### 5.3 Sampling, EOS, RNG and replay convention

Reproduced from `decodeArmConditionP102` (`phase102:788`), `P12-MASK` branch only:

1. `ctx = currentIds.slice(-MAX_CTX)`; one forward pass
   `Tensor.noGrad(() => model.forward(Tensor.fromArray([ctx])).toArray())`; row =
   `logitsArr[0][ctx.length - 1]`.
2. Byte state: `contextPhaseOf(idToToken, currentIds)` → `{state, phase}`. The copied function
   throws if the Phase-99 walker and the Phase-98 `appendBytes` machine disagree; the probe also
   keeps Phase-102's guard that throws when `ctx.length !== currentIds.length` (context truncation
   would make the derived state describe a different input). With ≤30 prompt tokens + 24
   generated < `MAX_CTX 128`, the guard never fires; the probe records `contextTruncationEvents: 0`.
3. `mask = maskForCondition("P12-MASK", …)` = `buildPhaseMask` (`phase101:379`): **inactive at
   `need === 0` (`character-boundary`) and when the stream is unrecoverable**, active at
   `need > 0`. At P0 the candidate set is the whole vocabulary — the mask is *recorded* at P0 and
   *not applied*, which is precisely why F1 is only a consistency check (§8.1).
4. **Empty-mask termination:** if `mask.active && mask.empty` → record `emptyMaskEvents++`,
   `terminatedByEmptyMask = true`, **break before any RNG draw is consumed**.
5. `probs = softmaxAt(row, TEMPERATURE)`.
6. `legalMass` / `illegalMass` are measured on `phaseLegalIdsOf(vocab, resolved.state)` — the full
   byte rule, **never** on the condition's candidate set.
7. **Exactly one draw per sampling step**: `const draw = random(); const oneDraw = () => draw;`
   `selectedId = sampleToken(applyPhaseMask(row, mask), oneDraw, TEMPERATURE)` here and
   `unmaskedSelectionId = sampleToken(row, oneDraw, TEMPERATURE)`. No second draw anywhere.
8. `generatedIds.push(selectedId)`; `currentIds.push(selectedId)`; if
   `selectedId === EOS_TOKEN_ID` → `eosEmitted = true`, **break**.
9. Horizon: `MAX_TOKENS = 24` steps.
10. `EOS_TOKEN_ID` is re-declared as `3` in the Phase-111 module and cross-checked against
    Phase-102's recorded `recipe.eosTokenId` (3), which the suite requires.

**RNG convention (frozen):** one `createSeededRNG(SEED)` **per arm**, created once, consumed
across the manifest prompts **in manifest order** (`en` ×4 → `zh` ×4 → `mixed` ×4). No per-prompt
reseeding, no alternative seeds, no rerun under different sampling, no alternative prompt/seed
sweep.

**RNG convention for the parity gate (different list, same rule):** one `createSeededRNG(SEED)`
per arm consumed across the **frozen five prompts in `GEN_EVAL_PROMPTS` order**
(`the sun rises`, `machine learning is`, `太阳`, `机器学习是`, `什么是 machine learning`) — the
order Phase 102 used. The parity gate must not consume the new-grid stream and vice versa: the two
stages take independent RNG instances.

**Truncation guard:** the `MAX_CTX` equality check of step 2 is retained verbatim, both stages.

### 5.4 Parity gate (mandatory, before any new prompt)

Runs the frozen 20 trajectories under `P12-MASK` through the Phase-111 code path and requires,
against Phase-102's recording:

| # | Requirement | Against |
|---|---|---|
| 1 | `generatedIds` byte-identical for all 20 trajectories | `capabilityByArm[arm]["P12-MASK"].samples[i].generatedIds` |
| 2 | `p0IllegalDraws === 11` **and** `corruptedTrajectories === 11` | `illegalEmissions["P12-MASK"]`, `metrics["P12-MASK"].aggregate.corruptionByPhase` |
| 3 | the 11 state labels reproduced as an **exact set**, with matching `failureTokenIndex` | `p0FailureStates.fromP12` (composite keys `${armKey}/${prompt}#${index}`) |
| 4 | `p0Steps − divergentP0 − intactP0 === 0` | `221 − 11 − 210` |
| 5 | `phaseLegalIdsOf(vocab, BOUNDARY_STATE)` is set-identical to the byte-walk predicate `appendBytes(BOUNDARY_STATE, bytes, 0).invalidAt === -1`, **and** both agree with the production scanner (`verifyScannerEquivalence` → `scanUtf8`) | computed, not assumed |
| 6 | `compatibleMass` at P0 equals Phase-102's recorded `legalMass` within `LEGAL_MASS_TOLERANCE` (`1e-9`) | `p0FailureStates` / `armResults` step quantities |
| 7 | the frozen family derived from the 11 re-derived states is `{boundary-state-continuation ×7, sampling-draw ×4}`, and the copied classifier reproduces **all five** Phase-101-recorded P0 `mechanismLabel` values | spec §1b; `phase101/static-failure-state.json` |
| 8 | `1`–`7` hold **and** `P1/P2 illegal = 0`, `other illegal = 0` | `illegalEmissions["P12-MASK"]` |

Any failure ⇒ **halt**:
`BLOCKED — frozen-condition parity not established`. No new prompt is generated.

---

## 6. Divergent-P0 enumeration

### 6.1 The enumerator, and why it is copied

The authoritative enumeration logic is `decodeArmConditionP102` + Phase-102's `P102StepRecord`
fields (`experiments/phase102/p0-phase-mask-audit.ts:788`, `:716`) and the divergence definition in
`illegalEmissions[cond].p0IllegalDraws`. Phase 102 **cannot be imported**: it imports Phase 101,
which imports Phase 99, whose module-level `main()` rewrites its own artifact (`:2378`) — an
unwanted dependency on untracked historical research files with a write side effect.

Smallest self-contained copy: the `P12-MASK` decode branch and the step record it emits, inside
`experiments/phase111/grid-external-closure-audit.ts`, **required to pass the §5.4 parity gate on
the original 20-trajectory grid before it is used on a single new prompt.** The gate is the
licence to use the copy; it is not optional and it is not a post-hoc comparison.

### 6.2 Per-decision field set (spec §5)

For **every P0 step of every one of the 48 trajectories** — divergent or intact:

`trajectory`, `armKey`, `manifestIndex`, `class`, `prompt`, `stepIndex` (step within the
trajectory), `tokenIndex` (index within `generatedIds`), `byteOffset` (byte offset of the decision
within the emitted stream), `phaseBefore`, `needBefore`, `selectedId`, `selectedBytes`,
`selectedLegal`, `selectedStartsWithContinuationByte`, `rawArgmaxId`, `rawArgmaxLegal`,
`legalMass`, `illegalMass`, `continuationStartMass`, `bareContinuationMass`,
`multibyteLeadMass`, `argmaxCompatible`, `compatibleMass`, `maskActive`, `maskIntervened`,
`corpusSupportLevel`, `corpusSupportedBestId`, `corpusSupportedBestCount`, `divergent`,
`mechanismLabel`, `partition` metadata.

Plus, per decision, two bookkeeping fields the verdict needs:
`comparable: boolean` and `nonComparableReason: string | null` (§6.4).

### 6.3 Divergence

Reused verbatim: **`phase === "P0" && selectedLegal === false`**, where `selectedLegal` is
`phaseLegalIdsOf(vocab, resolved.state).has(selectedId)` — the full byte rule at the character
boundary. No new criterion: not UTF-8 validity alone, not capability level, not
`charIntegrityRate`, not rollout, not semantics, not human judgement.

### 6.4 Comparability (mechanical, so the A/C boundary is not a judgement call)

A divergent P0 decision is **comparable** when all of `{phaseBefore === "P0", argmaxCompatible,
compatibleMass, byteClassMass.bareContinuation, byteClassMass.multibyteLead, corpusSupportLevel}`
were successfully measured — i.e. a real forward pass exists for that prefix and the state was
resolved by the phase walker without a walker disagreement. A decision that cannot be fully
measured is recorded with `comparable: false` and a reason string, is excluded from the closure
population, and is reported. `comparableDivergentP0Decisions` is the count used by §8.

By construction an empty-mask termination removes later decisions rather than making them
non-comparable; the probe records `nonComparableDivergentP0Decisions` separately so a suppression
by that route is visible rather than folded into the C verdict.

### 6.5 Corpus support

`measureSupport` is **imported from Phase 98, not copied**, with `EXACT_CONTEXT_LEN = 4` and the
corpus state-transition table (`buildCorpusIndex`, `measureCorpusStateTransitions`) — the same
machinery Phase 102 used at its P0 states. Call convention reproduced from
`auditP0State` (`phase102:1312`):

```
measureSupport(index, vocab, stepLikeForP0(rawArgmaxId, idToToken), [...generatedIds],
               tokenIndex, stateTransitions)
```

i.e. `generatedIds` **without** prompt ids, and `stepIndex` = the decision's token index within
the generated sequence. `level` ∈ `exact | sparse | indirect | none | unresolved`.
`corpusSupportedBestId` / `…BestCount` come from `bestTransitionIds[0]` / `bestTransitionCount`.
No semantic similarity, no decoded-text substring matching, no new support metric.

---

## 7. Mechanism-label integration

### 7.1 The classifier

`labelFailureMechanism` (`experiments/phase99/logit-mechanism-audit.ts:578`), copied verbatim.

- **Input:** `{argmaxCompatible: boolean, compatibleMass: number, phase: BytePhase,
  byteClassMass: {bareContinuation: number, multibyteLead: number, …}}`.
- **Output:** a `FailureMechanismLabel`.
- **Frozen label set (closed, 5 values, unchanged):**
  `sampling-draw` · `under-ranked-legal` · `boundary-state-continuation` · `midstate-new-lead` ·
  `illegal-argmax-other`. **No label is added, renamed or reordered.**
- **Rule order (unchanged):** `argmaxCompatible → sampling-draw`; `compatibleMass ≥ 0.5 →
  under-ranked-legal`; `phase === "P0" && bareContinuation ≥ 0.5 → boundary-state-continuation`;
  `phase ∈ {P1,P2,P3} && multibyteLead ≥ 0.5 → midstate-new-lead`; else `illegal-argmax-other`.

### 7.2 The wrapper — `labelP0Mechanism`, and the unknown-label rule

The classifier is total over its declared domain, so an "unknown" label cannot come from the
classifier itself. Phase 111 therefore labels through a thin wrapper that **refuses out-of-domain
input instead of letting it fall through**:

```
labelP0Mechanism(input):
  if input.phaseBefore !== "P0"                      -> "unknown"
  if any of {argmaxCompatible, compatibleMass, bareContinuationMass, multibyteLeadMass}
     is not a finite number                          -> "unknown"
  if the copied classifier was not applied           -> "unknown"
  else return labelFailureMechanism(copied fields)
```

`"unknown"` is a **Phase-111 sentinel, not a mechanism label**; it is never inserted into the
copied classifier's domain, and it is by construction outside the frozen family, so it **fires
F2**. This matters concretely: `illegal-argmax-other` is the classifier's fall-through value, so
without the wrapper a `PX` or malformed input would silently acquire a *domain* label. The
wrapper closes that hole. The rule is: **an unknown label stays unknown and triggers F2.**

### 7.3 The frozen family, and the parity fixture

- **Derivation.** Re-run the frozen 20 under `P12-MASK` through the Phase-111 path (§5.4), take the
  11 established states, measure `{argmaxCompatible, compatibleMass, phase, byteClassMass}` at each
  by real forward pass, and apply the copied classifier. Expected and required:
  `boundary-state-continuation × 7`, `sampling-draw × 4`. A different multiset ⇒ `BLOCKED`
  (baseline not reproducible). **Frozen family = `{boundary-state-continuation, sampling-draw}`.**
- **Phase-101 fixture.** From `experiments/phase101/static-failure-state.json`: 12 recorded states,
  of which 5 are `phase === "P0"`; their recorded `mechanismLabel` values are
  `boundary-state-continuation, boundary-state-continuation, sampling-draw,
  boundary-state-continuation, sampling-draw`. The copied classifier, fed each state's **recorded**
  quantities, must reproduce **all five** exactly. This is the second parity gate, and it is what
  licenses using the classifier on new prompts.
- **Reporting of the literal identity key.** Spec §1a's degeneracy is honoured: the composite key
  `${armKey}/${prompt}#${failureTokenIndex}` embeds prompt text, so no out-of-grid prompt can
  produce a Phase-110 key. The probe records
  `literalIdentityKeyNewMembers: 0` and the report states plainly that this reading fires
  unconditionally and is **not** the operative test. F2 is evaluated on the §7.3 family only.
- **Other 5-value labels are still reachable at P0** and therefore give F2 real teeth:
  `under-ranked-legal` (compatibleMass ≥ 0.5 with an illegal argmax) and `illegal-argmax-other`
  are both constructible at a character boundary; `midstate-new-lead` is unreachable at P0 by
  construction and is reported as structurally unreachable rather than as "not observed".

---

## 8. F1 / F2 / F3 logic

### 8.1 F1 — byte-phase consistency check (not a closure falsifier)

- **Evidence:** `p1p2IllegalDraws` (illegal draws at `P1`/`P2`) and `otherIllegalDraws` (illegal
  draws at `P3`/`PX` or any phase outside `P0`/`P1`/`P2`), summed over the 48 new trajectories,
  plus `p1p2Steps` for context.
- **Expected:** `0` — the `P12` mask suppresses that class by construction
  (Phase-102 `P12-MASK`: `p1p2IllegalDraws = 0`, `otherIllegalDraws = 0`).
- **Meaning:** a zero reading is **not** closure evidence; a **nonzero** reading means a mask that
  did not apply, a drifted tokenizer, a mis-recorded phase or a mis-recorded `selectedLegal`, i.e.
  **frozen-condition / implementation corruption**.
- **Consequence:** nonzero ⇒ **`BLOCKED`** (reported with the offending decision). F1 **never**
  produces verdict B, and its zero reading never contributes to verdict A.

### 8.2 F2 — mechanism-label falsifier (genuine)

- A newly observed **comparable** divergent P0 decision whose `labelP0Mechanism` output is absent
  from the frozen family `{boundary-state-continuation, sampling-draw}` falsifies H111.
- This includes `unknown` (§7.2) and includes the two reachable domain labels
  (`under-ranked-legal`, `illegal-argmax-other`).
- Computed from the new trajectory's own measured quantities; it can come out either way.
- **Consequence:** the first firing event is reported by full identity and ⇒ verdict **B**.
  Definitions are not modified after the first firing.

### 8.3 F3 — partition-gap falsifier (genuine)

- **Exact Phase-110 definition, copied** (`experiments/phase110/failure-population-audit.ts:580`):

  ```
  accountedSteps = divergentP0Draws + intactP0Steps
  gap            = p0Steps - accountedSteps
  exact          = p0Steps === accountedSteps
  ```

  No other partition metric is introduced.
- **Inputs, three independently produced paths** (this is what keeps the gap test from being
  vacuous — Phase 110 compared two artifacts written by different code paths, and Phase 111
  reproduces that structure):
  - `p0Steps` — **path A**: summed from each trajectory's own recorded phase histogram
    (`stepsAtP0`), written by the trajectory aggregator;
  - `divergentP0Draws` — **path B**: the step-level scan, `phase === "P0" && selectedLegal === false`;
  - `intactP0Steps` — **path C**: the trajectory-level fatal-step table (`firstInvalidTokenIndex`
    + `firstInvalidPhase`), from which the intact P0 population is the P0 steps that are not the
    fatal step of a P0-corrupted trajectory — checked against the bijection
    `divergentP0Draws === trajectoriesFirstInvalidAtP0` (`bijectionOf`, copied).
- **Expected frozen relationship (parity gate, §5.4 #4):** `221 = 11 + 210`, gap `0`.
- **F3 condition:** `partitionGap !== 0` on the new grid falsifies H111 ⇒ verdict **B**.
- Any disagreement between paths A, B and C is a gap by definition and is reported with the
  conflicting counts. A nonzero gap is **not** repairable by preferring one path.

### 8.4 Classification (spec §7, verbatim precedence)

| Verdict | Condition |
|---|---|
| **A** — closure supported | `comparableDivergentP0Decisions > 0` **and** no F2 firing **and** no F3 firing **and** every observed comparable divergence lies inside the frozen family. Only over the finite Phase-111 grid. |
| **B** — closure falsified | **any** F2 or F3 firing. The exact first falsifying event is reported. F1 alone never produces B. |
| **C** — inconclusive | zero comparable divergent P0 decisions (`INCONCLUSIVE — no comparable failure observed`), or the longer external prompt distribution suppresses the event, or there are too few comparable divergences to exercise the falsifier. |
| **D** — blocked | frozen-condition / prompt-manifest / checkpoint / tokenizer / parity-gate / enumeration failure — including a nonzero F1 and a manifest-digest mismatch with the on-disk `prompt-set.json`. |

Precedence, in order: **D** (nothing else is decidable) → **F1** (corruption ⇒ D) → **B** (F2/F3
fired) → **A** (nonzero comparable population, clean) → **C** (the residue). Every clause is
reported with its observed value whether or not it fired.

### 8.5 Observations, not falsifiers (spec §6, last paragraph)

- per-label count comparison against the 11 established states;
- corpus-support level comparison against the 11 established states;
- whether any established-state mechanism label is **absent** from the new set — population
  *drift*, reported as a separate observation from closure;
- the literal identity-key reading (§7.3);
- the measured token-length distribution versus the pre-registered ranges (§4.5);
- per-class divergence counts (`en`/`zh`/`mixed`).

None of these changes the verdict.

---

## 9. Test plan

`src/lib/minimind/research/tests/phase111-grid-external-closure.test.ts`, exporting
`runPhase111Tests()`. Reads the artifacts and re-derives the frozen fixtures; **never hardcodes a
new experimental outcome** (verdict, divergence count, generated ids, labels, partition counts of
the new grid). The frozen fixtures it *may* assert are the pre-registered ones: 20 / 11 / 11 /
`221 = 11 + 210` / the 5 Phase-101 P0 labels / the family `{bsc ×7, sd ×4}`.

**Prompt selection**

1. selection is deterministic: two evaluations produce identical `prompt-set.json` bytes;
2. 4 / 4 / 4 allocation across `en` / `zh` / `mixed`, exactly 12 entries, manifest order
   `en → zh → mixed`;
3. all five frozen prompts excluded, and each of the five sample IDs named in the spec's rule is
   absent from the selection; the computed exclusion set equals the dataset-derived set (5 entries)
   and the prose set (4) is recorded as a subset — the discrepancy is asserted, not smoothed;
4. no Phase-90–110 generation prompt other than the five frozen ones is selected (source scan of
   `experiments/phase90…110` prompt literals, comment/string-stripped `codeOf` scanner);
5. ordering is load-bearing: reordering the manifest changes at least one arm's generated ids
   under the frozen RNG (proved on a small deterministic fixture, not on the new grid);
6. the manifest digest recorded in `probe-results.json` equals the on-disk `prompt-set.json`
   digest; a mutated copy fails the digest check;
7. the first four eligible samples per class are `train`-split (equivalence to a redundant split
   filter);
8. measured token lengths are recorded for all 12 + 5 prompts, and the record is internally
   consistent (positive, `encode(text).length`).

**Frozen condition**

9. four checkpoint identities match `manifest.json` and the files exist; checkpoint digests match
   Phase-102's recorded digests where Phase-102 recorded them;
10. tokenizer identity: the rebuilt vocabulary reproduces Phase-102's recorded P0 census
    (300 vocab / 223 legal at P0 / 77 illegal / 64 continuation-start / 13 forbidden-lead,
    `p0CandidateCount = 223`) **read back** from Phase 102 rather than re-derived through the
    Phase-102 module chain (Phase-110 §15 precedent: rebuilding through that chain rewrites the
    Phase-99 artifact);
11. generation-setting identity: `SEED`, `VOCAB_TARGET`, `MAX_TOKENS`, `MAX_CTX`, `TEMPERATURE`,
    `EOS_TOKEN_ID` equal the values Phase-102 recorded, and the Phase-111 module's `EOS_TOKEN_ID`
    equals `recipe.eosTokenId`;
12. `P12-MASK` identity: copied `buildPhaseMask` is inactive at `need === 0`, inactive when
    unrecoverable, active at `need > 0` — asserted on fixtures, and the copied
    `applyPhaseMask` writes exactly `-Infinity` outside the candidate set while leaving legal
    logits bit-identical; `maskedArgmaxOf` tie-breaks by ascending id;
13. parity gate passed (§5.4 items 1–8), each recorded in the artifact, each re-read by the test;
14. importing the probe does not generate: the probe's `main` runs only under
    `require.main === module` (source scan) and the test imports it without side effects.

**Enumeration**

15. all 48 trajectories present, `48 = 12 × 4`, every trajectory has a `divergent-p0-decisions.json`
    row set and a `trajectory-reconciliation.json` row;
16. for every trajectory, `steps.length === generatedIds.length` and
    `stepsAtP0 + stepsAtP1 + stepsAtP2 + stepsAtP3 + stepsAtPX === steps.length` (accounting; P3/PX
    of the byte-phase walker);
17. every P0 decision carries every §6.2 field, none `undefined`, probabilities in `[0,1]` and
    `legalMass + illegalMass ≈ 1` within `1e-9`;
18. `divergent` is deterministic and equals `phase === "P0" && selectedLegal === false`; the
    counts in `probe-results.json` agree with a recount from `divergent-p0-decisions.json` — two
    code paths, not one;
19. the byte offset recorded for a decision equals the number of bytes emitted before it;
20. `comparable` flags reconcile: `comparable + nonComparable === divergent` per trajectory and in
    aggregate.

**Labels**

21. the copied classifier matches Phase-99's on fixtures — the copied source is compared
    textually against the Phase-99 source for the classifier body after comment stripping, and its
    behaviour is asserted on 5 synthetic inputs covering all 5 domain labels (including the exact
    `compatibleMass = 0.5` and `bareContinuation = 0.5` boundaries);
22. the classifier's domain is closed: repeated labelling never returns anything outside the 5
    values, and no call path adds a value;
23. the derivation reproduces the 5 Phase-101-recorded P0 labels exactly, from the artifact's own
    recorded quantities (the §7.3 parity fixture);
24. the derived 11-state family is `{boundary-state-continuation × 7, sampling-draw × 4}`, and the
    frozen family is exactly `{boundary-state-continuation, sampling-draw}`;
25. **unknown detection:** the wrapper maps an out-of-domain input (phase `PX`, or a non-finite
    mass) to `"unknown"` — proved by injection — and `"unknown"` is outside the frozen family, so a
    synthetic decision carrying it fires F2;
26. `midstate-new-lead` is structurally unreachable for a P0 decision (asserted from the
    classifier's rule order), and the reachable non-family labels are exactly
    `{under-ranked-legal, illegal-argmax-other, unknown}`.

**Partition**

27. the copied `partitionOf` reproduces the frozen `221 = 11 + 210`, gap `0`, from Phase-102's and
    Phase-107's **recorded** values;
28. the new-grid partition is computed by the same function, with paths A/B/C from §8.3, and every
    path's count is recorded;
29. an injected gap is detected: a synthetic census with one P0 step unaccounted yields
    `gap === 1`, `exact === false`;
30. the bijection check is non-vacuous: a synthetic census with two divergent draws on one
    trajectory (draws > trajectories-first-invalid-at-P0) is detected.

**F1/F2/F3 and classification**

31. F1 is reported with `p1p2IllegalDraws` and `otherIllegalDraws`; a synthetic nonzero F1 reading
    classifies as `D` and **not** as `B`;
32. a synthetic F2 firing classifies as `B`; a synthetic F3 firing classifies as `B`; the reported
    first falsifying event is the earliest by trajectory order, then token index;
33. zero comparable divergences ⇒ `INCONCLUSIVE — no comparable failure observed`, never A, and the
    `C` reason string is the literal one;
34. every A verdict the suite constructs carries `comparableDivergentP0Divergences > 0` — the
    classifier cannot return A on an empty population;
35. the four verdicts' precedence is fixed and each is individually reachable (one synthetic input
    per verdict);
36. the recorded verdict is re-derivable from the recorded falsifier blocks.

**Reproducibility and integrity**

37. same manifest digest ⇒ byte-identical scientific fields across two in-process runs of the
    deterministic core (canonical digests equal);
38. `probe-results.json` records no wall-clock field; `volatileFieldsWritten === []`;
39. the two on-disk probe runs' artifacts (if both are present / recorded) have equal raw sha256
    for all five artifacts;
40. neither the logic module nor the probe calls `Math.random()` or a timer, and neither contains
    call-shaped `train(`/`backward(`/`optimizer.`/`fit(`; the probe's only model calls are
    `forward(` via `Tensor.noGrad` — asserted against an explicit allow-list;
41. the integrity block states `trainingPerformed: false`, `checkpointFilesModified: false`,
    `tokenizerModified: false`, `vocabularyModified: false`, `mergeTableModified: false`,
    `promptTextModified: false`, `datasetModified: false`, `productionModulesModified: []`,
    `usesMathRandom: false`, `usesSetTimeout: false`, **and** the honest positives
    `modelLoaded: true`, `forwardPassesRun > 0`, `generationsPerformed: 68` (48 new + 20 parity),
    `writesOnlyItsOwnArtifacts: true`;
42. no Phase-90–110 artifact moved: the scientific digests of all recorded sources match the
    manifest, and `experiments/phase99/logit-mechanism-audit.json`'s **scientific** digest is
    unchanged after a probe → suite → probe cycle (its raw digest is allowed to move only if the
    suite is run through the aggregate runner, and the manifest labels it
    `rawDigestReproducible: false`);
43. Phase 111 added no artifact or instrument beyond the declared nine files (directory listing
    compared against the declared set, with the log files excluded by `.gitignore`).

---

## 10. Report plan

`src/lib/minimind/research/PHASE111-GRID-EXTERNAL-CLOSURE-REPORT.md`, written **after** measurement,
never pre-written. Header with hypothesis, verdict, `Training: NOT RUN`, and the
generation-only declaration.

The spec §10 requires the **17 sections named in the brief**. The plan's skeleton below follows the
Phase-102/109/110 report convention. If the original brief's 17 headings differ, **the brief's
headings govern** and the mapping is recorded in the report's integrity section — the report does
not silently invent or drop a section.

1. Phase-110 final validation
2. H111 research question
3. Pre-registered protocol (selection rule, frozen condition, falsifiers)
4. Prompt manifest (frozen, with digest; exclusions; the 4-vs-5 discrepancy; measured token lengths)
5. Frozen-condition parity gate (all eight requirements)
6. Generation grid (48 trajectories, per-class and per-arm results)
7. Divergent-P0 enumeration (census, comparability, corpus support)
8. Mechanism-label family and F2
9. Partition gap and F3
10. Byte-phase consistency and F1
11. Corpus-support and drift observations
12. Closure classification (A/B/C/D, with the precedence applied)
13. Reproducibility (two runs, digests, volatile fields)
14. Limitations (finite external grid; longer-prompt distribution; single condition; no universal
    claim; the 4-vs-5 rule/prose discrepancy)
15. What is NOT proven
16. Phase-112 recommendation
17. Final conclusion

Plus the two trailing blocks every recent report carries: **Integrity** (sources, prior-artifact
digests, the Phase-99 `durationMs` warning, the no-training attestation) and **Validation** (the
six commands and their results, with the pre-existing `tsc` errors and build warnings declared
out of scope).

Mandatory statements, in the verdict section:

> **Zero-divergence rule.** `0 comparable divergent P0 decisions` ⇒
> `INCONCLUSIVE — no comparable failure observed`. Absence of a new failure in this finite external
> sample does not establish that the failure population is universally complete.
>
> **Finite-sample scope.** Even an A result only supports closure over the fixed external
> prompt/checkpoint grid used by Phase 111. It does not establish universal closure over arbitrary
> prompts.

The report must distinguish *no new divergent event observed* from *failure population proven
universally complete*.

---

## 11. Artifact schemas and write order

### 11.1 Schemas

All artifacts are `JSON.stringify(value, null, 2)`, **no wall-clock field of any kind**
(`volatileFieldsWritten: []`), so raw sha256 is the reproducible identity of the evidence.

**`prompt-set.json`** — `{phase, title, readOnly, trainingPerformed, source: {path, metadata{id,
version, schemaVersion}, sampleCount, classCounts}, rule: {steps[], ordering, splitFilterApplied:
false}, excludedIds: [], excludedByRule: [], specProseExcludedIds: [], resolvedSelection: [{manifestIndex,
class, datasetIndex, id, text, category, split, datasetTokens, datasetTokenCount}],
manifestOrder, tokenLengths: {external: [], frozen: [], preRegisteredExternalRange: [13,30],
preRegisteredOriginalRange: [5,19], measuredExternalRange: [min,max], measuredOriginalRange: [min,max]},
digestOfRule: null}`.

**`manifest.json`** — pre-generation freeze, written **first**, never rewritten:
`{phase, title, hypothesis: {id, statement, falsifiers: {F1, F2, F3}}, recipe, arms:
[{key, checkpointPath, checkpointSha256}], importBoundary: {imports: ["experiments/phase98/…"],
copied: [{object, sourcePath, sourceLine, reason}]}, promptSetPath, promptSetSha256,
sourceArtifacts: {name: {path, bytes, sha256Raw, sha256ScientificExcluding, sha256Scientific,
rawDigestReproducible, note}}, preRegisteredParity: {trajectories: 20, p0IllegalDraws: 11,
corruptedTrajectories: 11, partition: {p0Steps: 221, divergentP0: 11, intactP0: 210, gap: 0},
frozenFamily: ["boundary-state-continuation", "sampling-draw"], phase101P0Labels: [...]},
frozenBeforeGeneration: true, readsItsOwnPromptSetOnly: true, volatileFieldsWritten: [],
integrity: {…}}`.

**`probe-results.json`** — `{phase, readOnly, trainingPerformed: false, recipe, promptSetSha256,
parityGate: {requirements: [{id, expected, observed, pass}], coreDigest, pass}, grid: {arms, prompts,
trajectories: [{trajectoryId, armKey, manifestIndex, class, prompt, promptIds, generatedIds,
generatedBytes, generatedLength, stepsAtP0, stepsAtP1, stepsAtP2, stepsAtP3, stepsAtPX,
eosEmitted, terminatedByEmptyMask, emptyMaskEvents, maskInterventions, trailingIncomplete,
corrupted, firstInvalidTokenIndex, firstInvalidPhase, p0Decisions: [§6.2 fields]}]},
census: {p0Steps, divergentP0Draws, comparableDivergentP0Draws, nonComparableDivergentP0Decisions,
p0ContinuationStartDraws, p0IllegalArgmaxSteps, p1p2Steps, p1p2IllegalDraws, otherIllegalDraws,
totalIllegalDraws, trajectoriesFirstInvalidAtP0, corruptedTrajectories,
contextTruncationEvents}, mechanismFamily: {domain: [...], frozenFamily: [...], derivedFrom11:
{counts}, newGrid: {counts, outsideFamily: [ids]}, literalIdentityKeyNewMembers: 0},
partition: {paths: {A, B, C}, p0Steps, divergentP0Draws, intactP0Steps, gap, exact, exactAcrossPaths},
falsifiers: {F1: {observed, fired, consequence}, F2: {observed, firstEvent, fired}, F3: {observed,
fired}}, observations: {perLabelCounts, corpusSupportByLevel, establishedLabelsAbsent,
perClassDivergence, tokenLengthComparison}, classification: {verdict, reason, precedenceApplied},
determinism: {coreDigestA, coreDigestB, equal}, integrity: {preRunPhase99ScientificDigest,
postRunPhase99ScientificDigest, unchanged, …}}`.

**`trajectory-reconciliation.json`** — 48 rows:
`{trajectoryId, armKey, manifestIndex, class, prompt, generatedLength, generatedIdsSha256,
corrupted, firstInvalidTokenIndex, firstInvalidPhase, p0DecisionCount, divergentP0Count,
comparableDivergentP0Count, stepsAtP0, eosEmitted, terminatedByEmptyMask, phaseHistogram}` plus
totals (`trajectories: 48`, `corrupted`, `divergentP0Draws`, `arms × classes`).

**`divergent-p0-decisions.json`** — `{census, partition, decisions: [all P0 decisions with §6.2
fields + comparable/nonComparableReason], divergent: [subset with divergent === true],
firstDivergentByTrajectory: {…}}`. Every P0 decision appears exactly once; the divergent subset is
re-derivable by filter, and the suite checks both.

### 11.2 Write order (the freeze, mechanically)

1. parse `bilingual.json`; compute the selection; assert the selection tests (§9 1–8);
2. write `prompt-set.json`; compute its raw sha256;
3. write `manifest.json` (embedding that digest) — **before any model is loaded**;
4. cross-check the on-disk `prompt-set.json`/`manifest.json` digests against the in-memory recompute;
   mismatch ⇒ halt `D`;
5. load the tokenizer + four checkpoints; run the parity gate (§5.4); halt on any failure;
6. run the 48-trajectory grid;
7. write `probe-results.json`, then `trajectory-reconciliation.json`, then
   `divergent-p0-decisions.json`;
8. re-digest the Phase-99 artifact; record unchanged/expected-to-move per §12.

---

## 12. Reproducibility plan

### 12.1 Two complete H111 runs

- **Run 1** (process 1): `npx --yes tsx experiments/phase111/probe.ts --stage=all`.
- **Run 2** (process 2, fresh process): the same command.
- The probe additionally runs its **deterministic core twice in-process** and requires identical
  canonical digests (`canonicalDigestOf`, Phase-110 convention); a mismatch halts interpretation.

### 12.2 Comparison fields

Required identical across runs: prompt manifest and its hash; checkpoint identities;
tokenization identity; generated token ids; generated bytes; every P0 decision; divergent-P0
decisions; mechanism labels; phase classifications; byte-phase classes; partition counts and gap;
comparability flags; corpus-support fields; falsifier blocks; H111 verdict.

Identity is **raw sha256 of each of the five artifacts**, byte-identical across runs.

### 12.3 Allowed volatile metadata

**None.** `volatileFieldsWritten: []`. No wall-clock, no duration, no PID, no path separator
leakage (repository-relative forward-slashed paths only), no ordering that depends on filesystem
enumeration (all arrays are sorted by an explicit key before hashing).

### 12.4 Halt rule

Any differing scientific field across the two runs stops the phase for diagnosis with
`BLOCKED — reproducibility failure`, naming the field and both values. The phase does not
"average", "prefer the second run", or re-run until agreement.

### 12.5 Known environment coupling (inherited, disclosed)

`experiments/phase99/logit-mechanism-audit.json` is re-stamped with a fresh `durationMs` whenever
the Phase-99 module chain is imported — which the **aggregate** runner reaches through
`experiments/phase102/*`. Phase 111's probe and suite must not reach that chain, so they import
Phase 98 only. The probe still records the pre-run and post-run **scientific** digest of that file
and requires them equal (gate G7). Run order matters: run the aggregate suite **before** the final
probe pass, exactly as Phase 110 did, so that the recorded source digests describe the bytes on
disk at the end of the phase.

---

## 13. Validation gates

| Gate | Command | Pass condition |
|---|---|---|
| G1 | `npx --yes tsx experiments/phase111/run-phase111-suite.ts` | `passed>0`, `failed=0`, `skipped` reported (skips allowed only for genuinely absent optional artifacts, each named) |
| G2 | `npx --yes tsx experiments/phase110/run-phase110-suite.ts` | `79 passed, 0 failed, 0 skipped` (unchanged) |
| G3 | `npx --yes tsx src/lib/minimind/research/__tests__/run.ts` | `TOTAL: 2597 passed, 0 failed` — the count is **unchanged** because `run.ts` is not edited (§14). Run **before** the final probe pass. |
| G4 | `npx tsc --noEmit` | pre-existing error count is not increased; **0 errors in `experiments/phase111/**`, the new test file, or the report path** |
| G5 | `npm run build` | exit 0; 0 new warnings attributable to Phase 111 |
| G6 | `git status --short` | the Phase-111 change set equals the declared boundary (§14); no `git add -A` / `git add .` anywhere |
| G7 | post-run re-digest | all recorded source artifacts still match their recorded scientific digests (13-of-13 style check over the Phase-111 source set); Phase-99 **scientific** digest unchanged |
| G8 | `git diff --stat` on `src/lib/minimind/**` | only the two new research files appear; **no production file modified** |

Any gate failure blocks the report's conclusion, not just its validation section.

---

## 14. Git boundary

### 14.1 Included (Phase-111 change set — exactly these nine)

```
experiments/phase111/grid-external-closure-audit.ts
experiments/phase111/probe.ts
experiments/phase111/run-probe.cmd
experiments/phase111/run-phase111-suite.ts
experiments/phase111/.gitignore
experiments/phase111/manifest.json
experiments/phase111/prompt-set.json
experiments/phase111/probe-results.json
experiments/phase111/trajectory-reconciliation.json
experiments/phase111/divergent-p0-decisions.json
src/lib/minimind/research/tests/phase111-grid-external-closure.test.ts
src/lib/minimind/research/PHASE111-GRID-EXTERNAL-CLOSURE-REPORT.md
docs/superpowers/plans/2026-09-22-phase111-grid-external-closure-plan.md  (this plan)
docs/superpowers/specs/2026-09-22-phase111-grid-external-closure-design.md (the approved spec)
```

### 14.2 Explicitly excluded

- **`src/lib/minimind/research/__tests__/run.ts`** — **not modified** unless separately authorized.
  Consequence, stated plainly: the Phase-111 suite is **not** part of the aggregate run, G3 stays at
  2597, and the suite is exercised through `run-phase111-suite.ts` (G1). If the user later
  authorizes registration, it is a one-line import plus one block, and the aggregate total becomes
  `2597 + passed`.
- Unrelated historical research files (`experiments/phase98/**` … `experiments/phase110/**`)
  including `experiments/phase110/probe-results.json` — read-only, never rewritten.
- Checkpoints (`experiments/phase90|94|96/*.ckpt.json`) — read-only, ~28 MB each, never added.
- Scratch logs (`probe.log`, `build.log`, `typecheck.log`, `research-suite.log`,
  `focused-suite.log`) — covered by `experiments/phase111/.gitignore`.
- Unrelated frontend/UI files — the ~240-file uncommitted backlog under `src/app/**`,
  `src/components/**`, `src/data/**` (the pre-existing diff listed in `git status`).
- The unrelated Phase 57–110 backlog (`experiments/phase57/**` … `phase110/**` untracked files).

### 14.3 Rules

No `git add -A`, no `git add .`, no `git commit`, no `git push` without an explicit instruction.
Files are enumerated explicitly if and when a commit is authorized. `git status --short
experiments/phase111/` must equal §14.1's ten `experiments/phase111` entries before any staging.

---

## 15. Explicit non-goals

1. No training of any kind — no optimizer step, no gradient, no checkpoint write.
2. No modification of production code, the tokenizer, vocabulary, merge table, architecture,
   evaluator, Phase-95 thresholds, rollout, sampler, decoder or decoding masks.
3. No modification of the five-prompt dataset, the frozen five prompts, or the Phase-90–110
   artifacts — including "correcting" or "normalising" them.
4. No new corruption criterion, no new mechanism label, no new partition metric, no new
   classifier, no new support metric, no new scoring function, no significance test.
5. No random prompt sampling, no hand-picked prompts, no re-selection after seeing model output,
   no alternative seeds, no alternative prompt/seed sweep, no per-prompt reseeding, no rerun under
   different sampling.
6. No universal-closure claim. An A verdict covers only the fixed Phase-111 grid.
7. No import of Phase 99, Phase 101, Phase 102 or the Phase-110 audit module; no widening of the
   import boundary even where it would be safe (see §2.3).
8. No repair of pre-existing TypeScript errors or build warnings.
9. No registration of the suite in `run.ts` without separate authorization.
10. No commit, no push, no staging of the unrelated backlog.

---

## 16. Stop conditions

The phase halts immediately, without any new-prompt generation, on:

| # | Condition | Outcome |
|---|---|---|
| S1 | the frozen condition, recipe, arms, tokenizer or mask cannot be reproduced | `BLOCKED — Phase-110 closure baseline not reproducible` |
| S2 | any parity-gate requirement (§5.4 #1–#8) fails | `BLOCKED — frozen-condition parity not established` |
| S3 | a class yields fewer than 4 eligible samples | `INCONCLUSIVE — insufficient deterministic out-of-grid prompt set` |
| S4 | `prompt-set.json` / `manifest.json` on-disk digest ≠ recomputed digest | `BLOCKED — prompt manifest frozen-state violation` |
| S5 | any checkpoint is missing or its digest is unexpected | `BLOCKED — checkpoint identity failure` |
| S6 | the byte-phase walker and `appendBytes` disagree at any audited state | `BLOCKED` (the copied `contextPhaseOf` throws; the probe records it) |
| S7 | any illegal draw at `P1`/`P2`/other phase (F1 nonzero) | `BLOCKED` — corruption, never verdict B |
| S8 | the two H111 runs differ in any scientific field | `BLOCKED — reproducibility failure` |
| S9 | a divergent P0 decision cannot be fully enumerated for a reason other than an empty-mask termination | `BLOCKED — enumeration failure` |
| S10 | paths A/B/C disagree on `p0Steps`, `divergentP0Draws` or `intactP0Steps` beyond the defined F3 gap | report as F3 ⇒ verdict **B** if `gap !== 0`, `BLOCKED` if the disagreement is in a count that should be identical |
| S11 | an F2 or F3 firing occurs | verdict **B** — report the first firing event by full identity; do **not** modify definitions afterwards |
| S12 | zero comparable divergent P0 decisions | verdict **C** = `INCONCLUSIVE — no comparable failure observed` — never A |
| S13 | any observed comparable divergence lies outside the frozen family | verdict **B** |

At no point does an empty external divergence population, a clean F1 reading, or a clean F2/F3
reading justify the phrase "closure proven". The strongest claim Phase 111 can make is
**closure over the finite Phase-111 external grid**.
