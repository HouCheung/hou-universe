# Phase 86 — Production Bilingual Corpus Expansion & Training Baseline

**Date:** 2026-08-20
**Purpose:** The bottleneck after Phase 85 was *insufficient bilingual training data
and insufficient training signal* for the current 1,126,528-parameter model. This
phase (1) expands the production corpus from 84 → 600 deterministic, auditable
bilingual samples, (2) establishes a real training baseline against the expanded
corpus using the unchanged production stack, and (3) re-runs the **unchanged**
Phase 84 capability evaluation to report an honest, evidence-backed comparison.

**Headline result:** The corpus is expanded **7.1×** (84 → 600 samples) with
**zero duplicated texts and zero duplicated ids**, provenance preserved as
`internally-authored-seed`. The real training path runs to completion and is
**bit-reproducible**. The model still reaches **Capability Level 2 of 5** —
training signal is real, but the model is **not** fluent, **not** memorizing
(top-1 0.034 vs the 0.5 threshold), and **not** generating coherent bilingual
text. Data volume alone did not move the capability needle; the remaining lever
is the training *recipe* (context length, epochs), not more seed text.

---

## 1. Corpus Expansion (84 → 600 samples, v0.3.0)

The single production dataset `bilingual.json` was expanded in place, keeping the
**dataset contract intact** (`id: "bilingual"`, `kind: "production"`, no
reintroduction of `tinystories`/`synthetic`/`textfile`).

| Property | Value |
|---|---|
| samples | **600** (was 84) |
| language coverage | zh **200** / en **200** / mixed **200** |
| split ratio | train **480** / validation **60** / test **60** (80/10/10) |
| `version` | `0.3.0` (was `0.2.0`) |
| `schemaVersion` | 1 (unchanged) |
| `purpose` | `pretraining` (unchanged) |
| `provenance` | `internally-authored-seed` (unchanged — no external sourcing claimed) |
| characters (total) | 17,854 |
| tokens (real tokenizer) | 21,303 |
| average tokens / sample | 35.51 |
| max tokens / sample | 60 |
| **duplicate texts** | **0** (verified by exact-match scan over all 600) |
| **duplicate ids** | **0** |

Category spread (capability-oriented — factual patterns, explanations, bilingual
mappings, short conversational patterns — **not** pure Q&A):

- **en** (200): general 20, daily 20, technology 20, programming 20, networking 16,
  education 16, science 16, mathematics 16, geography 14, factual 14, explanation 14,
  dialogue 14.
- **zh** (200): mirror of the en categories.
- **mixed** (200): mapping 50, programming 37, networking 37, technology 35,
  explanation 32, question 9.

Every sample is hand-authored and deterministic — no `Math.random`, no procedural
templates, no lorem ipsum, no duplication (see §7 fake-data audit).

---

## 2. Training Configuration (unchanged from Phase 84)

The exact production path is unchanged — no new model, tokenizer, Trainer, Runtime,
or Worker. The probe drives the same sequence as
[`experiments/phase84/probe.ts`](../../../../experiments/phase84/probe.ts).

| Parameter | Value |
|---|---|
| tokenizer | byte-level BPE, `train(corpus, 300)` → vocab **300** |
| model | `TensorMiniMindModel` — D=128, H=4, dFF=512, L=4, S=256, **1,126,528 params** |
| blockSize | 16 |
| batchSize | 4 |
| epochs | 5 |
| learningRate | 0.001 |
| weightDecay | 0.01 |
| gradientClipNorm | 1.0 |
| scheduler | Cosine (base → 1% min), warmup 10% |
| optimizer | AdamW (β₁=0.9, β₂=0.999, ε=1e-8) |
| seed | 42 |

With 600 texts at blockSize 16: `numSamples = 1368` tokenized windows,
`numBatches = 342`, `totalSteps = 1710` (6.45× the Phase 84 step count of 265).

---

## 3. Real Training Baseline Results

Measured from one full probe run (5 epochs, 1,710 optimizer steps):

| Metric | Value |
|---|---|
| wall-clock duration | 786,996 ms (~13.1 min) |
| initial loss (first recorded) | 6.0442 |
| **final loss** | **2.8615** |
| loss decrease | 6.0442 → 2.8615 (−3.18 nats) |
| max \|param delta\| across 1,126,528 params | 0.16668 |
| mean \|param delta\| | 0.01762 |
| checkpoint JSON size | 73,631,962 bytes |
| reproducibility (run 1 vs run 2) | Δ = **0 (exact)** |

Training genuinely updates weights and drives loss down. The parameter deltas are
~2× larger than Phase 84 (0.16668 vs 0.08269) because there is 7× more data to fit.

---

## 4. Phase 84 vs Phase 86 Comparison

| Metric | Phase 84 (84 samples) | Phase 86 (600 samples) | Change |
|---|---|---|---|
| corpus samples | 84 | **600** | **7.1×** |
| tokenized windows | 212 | 1,368 | 6.45× |
| optimizer steps (5 epochs) | 265 | 1,710 | 6.45× |
| initial loss | 6.1456 | 6.0442 | −0.10 |
| final loss | **2.4956** | **2.8615** | **+0.37** |
| max \|param delta\| | 0.08269 | 0.16668 | 2.0× |
| mean \|param delta\| | 0.00874 | 0.01762 | 2.0× |
| tokenizer round-trip | 84/84 | 600/600 | ✅ both |
| memorization top-1 | 0.0305 (295 preds) | 0.0344 (262 preds) | +0.004 |
| memorization vs chance (0.00333) | ~9.2× | ~10.3× | marginal |
| coherent generation | ❌ | ❌ | unchanged |
| **capability level** | **2** | **2** | **unchanged** |

**Honest interpretation:** the corpus is 7× larger and the model does 6.45× more
work, yet final loss is *higher* (2.50 → 2.86) and capability is *unchanged*. This
is the expected signature of **more diverse data that the model cannot yet compress
in 5 epochs** — the extra samples raise the entropy floor. The memorization signal
is ~10× above chance but still ~14× below the 0.5 threshold. **Expanding seed data
alone did not improve capability.** No fluency is claimed.

---

## 5. Capability Evaluation — Level 2 (unchanged gates)

The Phase 84 evaluator was **not** modified (see §7 test check #12). Gates re-derived
from measured evidence:

| Level | Gate | Evidence | Status |
|---|---|---|---|
| 0 | Pipeline runs end-to-end | 1,710-step real run completed | ✅ |
| 1 | Tokenizer round-trips bilingually | 600/600 lossless (zh 200 / en 200 / mixed 200) | ✅ |
| 2 | Training signal | loss 6.0442 → 2.8615; params changed (max Δ 0.16668) | ✅ |
| 3 | Memorization (top-1 ≥ 0.5) | top-1 **0.0344** on 262 predictions | ❌ |
| 4 | Coherent generation | en valid UTF-8; **zh invalid UTF-8** (ratio 0), collapse | ❌ |
| 5 | Basic Q&A | no evidence | ❌ |

**Final: Capability Level 2 of 5.** Generation after training is still garbled in
every language (echoed prompt + collapse loops + `�` replacement bytes for CJK) —
exactly what one expects from 5 epochs on a 1.13M-parameter byte-level model. The
zh generation `validUtf8Ratio = 0` means the model emits byte sequences that do not
form valid CJK code points; the tokenizer round-trip is still lossless (Level 1), so
this is under-training, not a tokenizer regression.

---

## 6. Tests

Phase 86 added a **17-check** suite (13 sync + 4 async) using the existing
hand-written `assert`/`test` harness (no Vitest/Jest/Bun), wired into `run.ts`.

| Suite | Result |
|---|---|
| Research suite (Phase 57–86) | **809 passed, 0 failed** |
| Phase 86 (sync) | 13 passed, 0 failed |
| Phase 86 (async, 1-epoch real training) | 4 passed, 0 failed |
| Data suite (corpus/dataset/datasetLoader) | **249 passed, 0 failed** |
| Phase 82 (data, dataset loader/schema) | 26 passed, 0 failed |

The 13 sync checks cover: schema validity, unique ids, non-empty text, valid
languages, valid splits, deterministic 80/10/10 (600/200/200/200/480/60/60),
500–1000 size range, real-tokenizer statistics, registry identity, no-fixture
fallback, version/provenance metadata, **Phase 84 evaluator unchanged**
(gates + thresholds intact), and **model config unchanged** (vocab 300,
`parameterCountOf === 1_126_528`).

---

## 7. Build, Fake-Data Audit, Remaining Gap & Recommended Phase 87

**Build.** `npm run build` exits 0 with **no TypeScript errors and no warnings in
any Phase 86 file** (174 pre-existing ESLint `no-unused-vars`/`exhaustive-deps`
warnings remain in legacy files untouched by this phase).

**Fake-data audit (clean).** `Math.random` uses are benign (ID generation,
seeded-RNG fallbacks, CLI demo, test fixtures) — none in training metrics
(`TrainingWorker`/`GenerationWorker` explicitly avoid `Math.random` for metrics).
`setTimeout` appears only as worker message-loop yields and in test `MockWorker`s,
never as training simulation. `synthetic` is a correctly-*unavailable* dataset
kind, not fabricated data. **0 duplicate texts, 0 duplicate ids** across 600
samples.

**Remaining gap.** Capability is stuck at Level 2. The binding constraint is **not
seed-text volume** — it is the recipe/context: blockSize 16 (≈ one short phrase of
context), 5 epochs, and a 1.13M-parameter byte-level model. Memorization top-1
(0.034) must reach 0.5 to advance a single level.

**Recommended Phase 87 — recipe tuning, not more seed text:**
1. **Increase context**: blockSize 16 → 64 (a data-batching parameter, not model
   architecture — allowed by constraint). Longer windows let the model learn
   cross-token structure instead of isolated bigrams.
2. **Increase epochs / tune LR schedule**: 5 → 20+ epochs with the same Cosine
   schedule, re-measured each run. No hidden capping — explicit, logged steps.
3. **Re-run the §5 capability gates after each change**, so the Level is re-derived
   from evidence and never asserted. Stop claiming fluency unless memorization
   top-1 actually approaches 0.5 and zh generation becomes valid UTF-8.
