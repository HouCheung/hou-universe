# Phase 114 — Chat SFT Failure Diagnostic

**Date:** 2026-10-21
**Status:** New diagnostic and one-variable follow-up. The Phase 113 report and its
pre-registered verdict **C — Not supported** are preserved unchanged. Nothing here
re-scores the frozen 27-item benchmark.

---

## 1. Question

Phase 113's SFT arm (B) reached a training loss of `0.0594`, yet scored `0/27` exact
matches on the held-out set. Was the SFT machinery broken, or did the model learn
something that does not transfer?

## 2. What Phase 113 did not measure

1. **Training-split fit.** The report contained only held-out aggregates. It never
   reported whether the saved B checkpoint could reproduce the 84 answers it was
   optimized on.
2. **Which snapshot was saved.** Candidate checkpoints were taken at steps
   `[84, 168, 252, 336]` and selected by validation loss. Validation loss was lowest at
   the **first** candidate (step 84), so the step-84 weights were saved and the
   step-336 weights were discarded. The evaluated model was one quarter of the way
   through the registered recipe.

## 3. Diagnostic method

Artifact: `experiments/phase114/diagnose-train-fit.ts`, results in
`experiments/phase114/train-fit.json`.

The exact checkpoints Phase 113 evaluated were loaded with unchanged production modules:

- **Teacher-forced fit** on the segment-wise training sequence
  `encode(prompt) ++ encode(" " + answer) ++ [<eos>]`. Token accuracy, exact-sequence
  accuracy, and NLL are measured over the supervised answer+EOS positions.
- **Free-running greedy generation** on B's own 84 training prompts, with the Phase 113
  decoding settings (`temperature 0`, `maxTokens 40`, `eosTokenId 3`, `enforceUtf8`).
- No training, no checkpoint writes, no changes to any Phase 113 artifact.

## 4. Diagnostic results

| Arm | Train free EM | Train teacher-forced acc | Train NLL | Validation TF acc | Test TF acc |
|---|---|---|---|---|---|
| **B** (step 84) | **25/84** | **89.1%** | **0.508** | 30.6% | 34.6% |
| C (step 84) | 0/84 | 49.2% | 2.485 | 30.3% | 30.9% |
| A (no SFT) | not run | 5.7% | 7.533 | 3.7% | 7.0% |

B's training recall by language: `en 5/28`, `zh 13/28`, `mixed 7/28`.

### Findings

- **F1 — The SFT pipeline works.** B's teacher-forced accuracy on its own training
  data is 89.1% (NLL 0.508) against 5.7% (NLL 7.533) for the no-SFT baseline A. The
  causal shift, assistant-only mask, EOS supervision, segment boundary, and tokenizer
  identity are not the defect.
- **F2 — The 0/27 is a transfer failure, not a broken instrument.** B reaches `0/21`
  on validation and `0/27` on test, with teacher-forced accuracy of 30.6% / 34.6%.
  That is barely above the mismatched-answer control's 30.3% / 30.9%.
- **F3 — Token accuracy alone is misleading.** C's teacher-forced token accuracy on
  the training split is 49.2%, but its NLL is 2.485 and its free-running exact match is
  `0/84`. Shared answer tokens (punctuation, common characters) inflate token accuracy
  without any question→answer association. Exact match and NLL both separate B from C.
- **F4 — The evaluated checkpoint was an early snapshot.** At step 84 the model had
  seen each training sample only four times; the recipe continued to step 336.

## 5. Follow-up experiment — retain the final snapshot

Artifact: `experiments/phase114/train-final.ts`, results in
`experiments/phase114/phase114-final-results.json`, checkpoint
`experiments/phase114/phase114-final.ckpt.json`.

**One variable changed relative to Phase 113: which snapshot is retained and
evaluated.** Dataset, seed, block size, batch size, mask, optimizer, scheduler, learning
rate, and the 336-step budget are identical. The run reproduced Phase 113's step-84
validation loss exactly (`4.223809`).

| Step | Validation loss | Train TF acc | Train exact-sequence | Train NLL |
|---|---|---|---|---|
| 84 | 4.223809 | 89.10% | 22/84 | 0.518 |
| 168 | 4.260974 | 94.79% | 42/84 | 0.178 |
| 252 | 4.291919 | 97.20% | 59/84 | 0.078 |
| **336** | 4.369914 | **99.44%** | **77/84** | **0.034** |

Final snapshot, free-running greedy:

| Split | Exact match | Mean token F1 | EOS stops |
|---|---|---|---|
| **Train (84)** | **79/84 (94.0%)** | 0.981 | 84/84 |
| Validation (21) | 0/21 | 0.209 | 20/21 |
| Test (27) | 0/27 | 0.149 | 21/27 |

Final train recall by language: `en 24/28`, `zh 28/28`, `mixed 27/28`.

The same checkpoint passes the existing Milestone-A import validator
(`analyzeCheckpointJSON` → `ok`, `tokenizerSource: metadata`, 1,126,528 parameters;
`experiments/phase114/verify-import.ts`).

### Representative outputs (final snapshot, greedy)

| Prompt | Gold | Output |
|---|---|---|
| What is the capital of Japan? (train) | Tokyo. | `Tokyo.` |
| Which planet is known as the Red Planet? (train) | Mars. | `Mars.` |
| How many legs does a spider have? (train) | Eight legs. | `Eight legs.` |
| What is the capital of France? (**test**) | Paris. | `Tokyo.` |
| What is 7 plus 5? (**test**) | 12. | `5.` |
| What is 9 times 3? (**test**) | 27. | `狗is an?視.` |

The held-out failures are not malformed-UTF-8 or format failures; the model produces
short, well-formed answer-shaped text using answers it memorized from other questions.

## 6. Interpretation

1. The 1.1M-parameter model **can** learn an arbitrary closed set of short Q/A mappings.
   At step 336 it recalls 79 of its 84 trained questions exactly under free-running
   greedy decoding, with correct EOS termination in 84/84 cases.
2. It **cannot** answer questions outside that set. Validation and test remain 0
   despite near-perfect training fit; validation loss rises monotonically as training
   fit improves. This is overfitting to 84 answers, not a decoding or masking failure.
3. Phase 113's verdict is unchanged: on the frozen held-out benchmark, SFT does not
   improve accuracy. The new result explains *why* the B arm looked identical to the
   controls: it was an early snapshot, and the recipe's endpoint memorizes rather than
   generalizes.

## 7. Product defect found and fixed

`src/lib/ai-lab/adapters/checkpointImport.ts` read `trainerState.step`, but
`TrainingStateSnapshot` serializes the optimizer-step counter as `globalStep` (there is
no `step` field). Every imported checkpoint was therefore displayed as **step 0**.
The reader now prefers `globalStep` and keeps `step` as a legacy fallback. Two
regression tests were added to
`src/lib/ai-lab/adapters/__tests__/milestone-a-checkpoint-import.test.ts`. The final
checkpoint now imports as step 336.

## 8. Capability statement

Reliably demonstrated:

- Recall of the 84 trained short Q/A pairs: 79/84 greedy exact match.
- Valid UTF-8 output under P012, and EOS termination on 84/84 training prompts.
- Checkpoint import through the existing chat path.

Not demonstrated:

- Answers to held-out or unseen questions (0/21 validation, 0/27 test).
- World knowledge not present in the 600-document pretraining corpus.
- Multi-turn generalization (two-turn samples are trained but not evaluated here).
- Paraphrase robustness (not tested).

## 9. Limitations

- One dataset, one seed, one architecture; this is a diagnostic, not a benchmark.
- The training-split score is a capability measurement, not the frozen Phase 113 metric.
- The saved checkpoint is 108 MB because it includes the full AdamW state; browser
  import works, but a weight-only export would be smaller if the import validator were
  relaxed for inference-only files.
- The model still has no positional encoding, no pretrained world knowledge, and a
  300-token byte-level BPE vocabulary with only 40 merges; Chinese answers cost roughly
  three tokens per Han character.

## 10. Single most valuable next step

Build a **closed-domain instruction corpus with paraphrase pairs** — each fact asked in
several phrasings — with a held-out split of *unseen phrasings*, then train with the
final-snapshot retention used here. That tests whether the model can associate a fact
with its answer across wording, rather than memorizing one prompt per answer.

- If paraphrases are answered: the product can carry a small curated knowledge base and
  becomes a usable closed-domain assistant.
- If paraphrases fail while exact prompts succeed: the bottleneck is the absence of
  pretrained language/world knowledge, and the next intervention must expand or improve
  the pretraining corpus rather than the SFT recipe.
