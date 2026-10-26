# Phase 102 — Symmetric UTF-8 Phase-Constrained Decode Audit

**Status:** `PASS — symmetric byte-phase mechanism strongly supported`
**Training:** `NOT RUN`
**Commit:** `NOT COMMITTED`

Three decoding conditions over the same frozen 20 trajectories, four frozen
checkpoints, one tokenizer, one prompt set, one horizon, one RNG convention.
The only thing that differs between conditions is which tokens are permitted
candidates. No weight was trained, written or reloaded from a modified file.

---

## 1. Research question

Phase 101 excluded byte-phase-illegal candidates at P1/P2 and the corruption it
measured did not disappear — it **moved**. Mid-character corruption fell to zero
(P1/P2 5 → 0) and the failures reappeared at the character boundary instead (P0
5 → 11): five arrived from trajectories that had been corrupted with a character
open, five were already boundary failures, one came from a previously clean
trajectory, and only two trajectories became clean. Phase 101 left that residue
named but unexplained and proposed a mechanism: the residue might be the
**mirror** of the failure it had just removed.

Phase 102 asks one question:

> Is the P0 corruption that survives the P1/P2 mask caused by the model
> assigning excess probability to tokens that begin with a UTF-8
> **continuation byte** when it should be beginning a new character — and if
> so, does restricting P0 candidates to tokens that can legally *start* a
> character remove it?

The question is mechanistic, not editorial. It is answered by whether the same
byte-phase misalignment appears on **both** sides of the character-state
boundary and whether restricting each side removes the corresponding failure —
not by whether a corruption counter reaches zero.

## 2. Phase-101 evidence

Phase 101's artifact (`experiments/phase101/probe-results.json`) is the
baseline for everything below and was **not modified** by this phase.

| Condition | Corruption | P0 | P1 | P2 |
|---|---|---|---|---|
| BASE | 12/20 | 5 | 2 | 5 |
| MASKED (P1/P2 illegal candidates excluded) | 11/20 | **11** | 0 | 0 |

Paired transitions BASE → MASKED:
`corrupted→clean 2, corrupted→corrupted later 5, corrupted→corrupted same phase 5,
corrupted→corrupted other 0, clean→clean 7, clean→corrupted 1`.

A one-line summary of that table: the P1/P2 mask was **completely effective at
P1/P2** (5 → 0) and the surviving failures were **entirely at P0** (5 → 11).
The mask did not repair the model; it moved the failure to the one phase it did
not constrain. Phase 101 classified this as Outcome B, "partially supported",
because its own headline mechanism was confirmed while the overall corruption
count barely moved (12 → 11).

Phase 101 §17 named the residue for the next test: *at P0 the model emits a
continuation byte while no character is open*, the mirror image of *at P1/P2 the
model emits a new-character lead byte while a character is open*.

## 3. Hypothesis

**H102.** The P0 residue is byte-phase-symmetric with the P1/P2 failure: at a
character boundary the model assigns substantial probability mass to tokens
whose first byte is a UTF-8 continuation byte (`10xxxxxx`), and excluding those
candidates removes the corresponding failure states without displacing
corruption elsewhere.

### Pre-registered falsifier (§9 of the brief — unchanged from Phase 101 §17)

H102 is **falsified** if either clause fires:

1. **P012-MASK leaves at least one P0 corruption in a trajectory that remained
   corrupted under P12-MASK**, or
2. **the P0 corruption count does not fall below 11.**

Both thresholds are fixed against Phase 101's measured 11. Neither was moved
after seeing a result.

### Pre-registered classification (§20 of the brief)

Written as an ordered rule list at the top of the instrument before any
measurement, first match wins:

- **D — Confounded:** parity gate fails, or a paired invariant fails.
- **E — Blocked:** the P0 restriction cannot be a deterministic candidate-set
  filter, or the P0 candidate set is empty.
- **C — Refuted:** `p0OverrideCount === 0` **and** P012 P0 corruption equals P12
  P0 corruption.
- **A — Strongly supported:** P012 P0 corruption is 0; `p0OverrideCount ≥ 1`;
  `clean→corrupted === 0`; **and** both sides of the character-state boundary
  carry illegal argmaxes that their mask removes (P1/P2 override steps > 0
  **and** P0 override steps > 0).
- **B — Partially supported:** none of the above.

## 4. Exact P0 legality semantics

The rule is the repository's own walker, not a new predicate:

```
legalAtP0(token)  ⇔  appendBytes(BOUNDARY_STATE, token.bytes, 0).invalidAt === -1
```

decided on **raw token bytes**. Legality is never inferred from token id, token
name, decoded text, `U+FFFD`, or token class.

**Vocabulary census (measured, `p0Census` in the artifact):**

| Quantity | Value |
|---|---|
| Vocabulary size | 300 |
| Legal at P0 | **223** |
| Excluded at P0 | 77 |
| — first byte is a continuation byte `0x80–0xBF` | **64** |
| — first byte is a forbidden lead (`0xC0`, `0xC1`, `0xF5–0xFF`) | 13 |
| — internally invalid (any first byte) | 77 |
| Legal, opens a character and ends mid-character | 62 |
| Bytes cross a character boundary | 31 |
| Zero-length entries | 0 |

The excluded set is **exactly** the union of two classes, and the two are
disjoint:

- the **64 bare byte tokens `0x80–0xBF`** — the §3 target class, tokens that a
  correct decoder can never accept at a character boundary;
- **13 forbidden-lead byte tokens** (`0xC0`, `0xC1`, `0xF5–0xFF`) that no phase
  could ever accept, at any position, in any stream.

Because the 13 forbidden leads are illegal at *every* phase, the P0 restriction's
**only** phase-dependent effect is on the continuation-byte class. That is
asserted arithmetically in `p0SemanticsViolations` and re-derived by the contract
suite, not assumed.

**§5 — the reduction the brief forbids was measured, not taken.** The cheap test
`firstByte < 0x80 || firstByte is legal lead` was computed for every entry
alongside the full walk. `firstByteTestDisagreementCount = 0`: on **this**
vocabulary the cheap test is exactly equivalent. That is a measurement about
these 300 entries, corroborated structurally by the census:
`internallyInvalidCount = 77`, which is exactly the size of the union of the
continuation-byte and forbidden-lead sets, so **no** entry has a legal first
byte followed by an illegal one — not among the 256 byte tokens, and not among
the 40 learned merges (all 40 are legal at P0). The instrument still uses the
full walk, and the census reports the disagreement count as a first-class field,
so a future vocabulary cannot silently invalidate the equivalence.

**Multi-byte tokens** are decided by walking every byte. 62 kept entries legally
open a character without completing it; 31 keep and cross a character boundary
(a complete character followed by a legal lead). None of them is rejected for
"containing a continuation byte later" — the walk decides.

**§6 — special tokens, by the same rule.** Ids 0–3 are decided on their own raw
token bytes, which are the UTF-8 bytes of their literal names:

| Token | Bytes | Legal at P0 | Continuation-start |
|---|---|---|---|
| `<pad>` | `3c 70 61 64 3e` | true | false |
| `<unk>` | `3c 75 6e 6b 3e` | true | false |
| `<bos>` | `3c 62 6f 73 3e` | true | false |
| `<eos>` | `3c 65 6f 73 3e` | true | false |

All four begin with `0x3C`. No special-token policy was invented: the general
byte rule is applied, and EOS survives the restriction, so the stop path is
structurally preserved.

**Empty candidate set.** At P0 the 128 ASCII byte tokens are always legal, so the
P0 set cannot be empty on this vocabulary; at P1/P2 the 64 bare continuation
bytes are always legal. Five byte states were probed; zero were empty
(`p0NonEmptiness`). The empty path is still implemented and reported rather than
assumed away: an empty active mask **terminates the trajectory and is recorded**,
with no fallback to all tokens and no invented replacement.

**Where the experiment lives.** The P012 mask exists only under
`experiments/phase102/`. The capability gate reaches it through a model **view**
(`P012MaskedModel`) that overrides `forward` and nothing else, carrying no
weights of its own. No production file was modified: no `GenerationEvaluator`
change, no permanent mask option, no change to default inference, tokenizer,
decoder or weights. The contract suite walks `src/`, `experiments/` and
`scripts/` and asserts that nothing outside `experiments/phase102` and its test
file imports the mask.

## 5. Phase-101 parity gate

Run **before** the P012 result was examined, with tolerances fixed in advance
(`PARITY_FLOAT_TOLERANCE = 1e-9`, `PARITY_EXACT_TOLERANCE = 0`). All six named
checks passed:

| Check | Result |
|---|---|
| `base_token_ids_match_phase101` | **PASS** — 0 mismatches across 4 arms × 5 prompts |
| `p12_mask_token_ids_match_phase101_masked` | **PASS** — 0 mismatches across 4 arms × 5 prompts |
| `condition_metrics_match_phase101` | **PASS** — 0 mismatches over 6 aggregate keys, `corruptionByPhase` and 21 per-arm keys × 4 arms |
| `static_states_match_phase101` | **PASS** — 0 mismatches over 12 states |
| `base_to_p12_transition_matrix_matches_phase101` | **PASS** — identical matrices, both `{"clean→clean":7,"clean→corrupted":1,"corrupted→clean":2,"corrupted→corrupted later":5,"corrupted→corrupted same phase":5,"corrupted→corrupted other":0}` |
| `base_corruption_counts_match_phase101` | **PASS** — `p0/p1/p2/total = 5/2/5/12` on both sides |

The BASE and P12-MASK arms were therefore **not re-invented**: they reproduce
Phase 101 exactly, token by token, including the corruption histogram and the
transition matrix. `capabilityByArm` disagreement with the unchanged evaluator's
own `evaluateGeneration` output was zero for all four arms in all three
conditions (`evaluatorDiffs: []` throughout), and the `enabled: false` views were
bit-transparent against the frozen model in all eight view checks.

## 6. Static P0 audit (§7)

Every forward pass was re-run; no recorded logit was reused except as a labelled
reference. All twelve recorded Phase-99 static states reproduced Phase-99's
logits and legal mass with `maxAbsDiff = 0`.

**The five P0 states Phase 101 left corrupted, re-measured in full:**

| State | Raw argmax | Bytes | Continuation start? | Legal at P0? | p(argmax) | P0 legal mass | Continuation-start mass | Masked argmax | P0 override |
|---|---|---|---|---|---|---|---|---|---|
| A / 机器学习是 #11 | 169 | `a5` | **true** | false | 0.9294 | **0.0025** | **0.9975** | 234 (`e6`) | **yes** |
| B94 / 机器学习是 #2 | 161 | `9d` | **true** | false | 0.2723 | 0.4728 | 0.5266 | 232 (`e4`) | **yes** |
| B94 / 什么是 machine learning #3 | 104 | `64` | false | true | 0.2158 | 0.9528 | 0.0470 | 104 | no |
| C94 / 什么是 machine learning #3 | 169 | `a5` | **true** | false | 0.6775 | 0.2822 | 0.7177 | 278 (`79 20`) | **yes** |
| T / 什么是 machine learning #12 | 276 | `61 72` | false | true | 0.2511 | 0.9378 | 0.0609 | 276 | no |

- `p0IllegalArgmaxCount = 3`
- `p0OverrideCount = 3`
- `emptyMaskCount = 0`
- `allForwardPassesReproducible = true`

Three of the five residual failure states have an **illegal argmax**: the
model's single most probable token at a character boundary is a bare
continuation byte (`0xA5`, `0x9D`, `0xA5`). At state A/机器学习是#11 the model
places **99.75%** of its mass on the continuation-byte class and **0.25%** on
every token that could legally begin a character. That is not a sampling
accident and it is not an artifact of greedy decoding being unusual: it is the
mirror of the P1/P2 failure, at the opposite side of the same boundary.

The remaining two states have a **legal** argmax (`0x64` = `d`, `61 72` = `ar`).
The P0 mask changes nothing there — it can only remove candidates, and the
argmax is not among the removed ones. Those two corruptions are sampling draws
that landed on an illegal token the argmax had not selected, and they are
tabulated in §8 and discussed in §9.

## 7. Full paired experiment

Same four frozen checkpoints (A, B94, C94, T — all `checkpointMatchesPhase101`),
same five prompts, same 300-entry vocabulary, same tokenizer, `MAX_TOKENS = 24`,
`MAX_CTX = 128`, `temperature = 0.8`, no top-k, no top-p, no repetition
handling, seed 42 with one stream per arm per condition and **exactly one random
draw per step**. Nothing but the candidate set differs between the three
conditions.

| Condition | Corruption | P0 | P1 | P2 |
|---|---|---|---|---|
| BASE | 12/20 | 5 | 2 | 5 |
| P12-MASK | 11/20 | **11** | 0 | 0 |
| **P012-MASK** | **0/20** | **0** | **0** | **0** |

Per arm (total, then P0/P1/P2):

| Arm | BASE | P12-MASK | P012-MASK |
|---|---|---|---|
| A | 3 (1/1/1) | 2 (2/0/0) | 0 (0/0/0) |
| B94 | 2 (2/0/0) | 3 (3/0/0) | 0 (0/0/0) |
| C94 | 3 (1/1/1) | 3 (3/0/0) | 0 (0/0/0) |
| T | 4 (1/0/3) | 3 (3/0/0) | 0 (0/0/0) |

**Both falsifier clauses did not fire:** clause 1 measured 0 (no P0 corruption
survived P012-MASK in a trajectory that P12-MASK left corrupted); clause 2
measured 0, far below the threshold of 11.

### The illegal-emission census — the sharpest check in the experiment

An illegal token emitted at a phase makes the stream unrecoverable, so it must
be the **first** invalid token of exactly one trajectory. The probe asserts
`p0IllegalDraws === p0CorruptionCount` and
`p1p2IllegalDraws === p1CorruptionCount + p2CorruptionCount` for every condition,
and all six equalities hold (recorded in `illegalEmissions`, no invariant
failures):

| Condition | P0 steps | Illegal P0 draws | of which continuation-start | P0 steps whose **unmasked** argmax was illegal | P1/P2 steps | Illegal P1/P2 draws |
|---|---|---|---|---|---|---|
| BASE | 193 | 5 | **5** | 4 | 92 | 7 |
| P12-MASK | 221 | 11 | **11** | 9 | 112 | 0 |
| P012-MASK | 286 | **0** | 0 | 16 | 194 | **0** |

Every single P0 corruption in both BASE and P12-MASK — **5 of 5 and 11 of 11** —
was the emission of a UTF-8 continuation byte at a character boundary. Not
"most", not "the majority": all of them. And under P012-MASK the count is zero,
with no illegal emission at any phase.

The fifth column is worth reading on its own. It counts P0 steps whose
**unmasked** argmax was illegal, so it is a property of the model's preference,
not of the decoder. It **rises** across the conditions (4 → 9 → 16) even as the
illegal draws fall to zero, because P012-MASK keeps characters open and
therefore spends more of each trajectory at a character boundary (286 P0 steps
against BASE's 193). The mask did not remove the model's preference for
continuation bytes — the preference was still there at 16 P0 steps in the
P012-MASK trajectories. The mask overrode every one of them. Note also that
under BASE the illegal draws (5) **exceed** the illegal argmaxes (4): one
corruption was a sampling draw landing on an illegal token the argmax had not
selected.

## 8. P0 override analysis (§14)

Over the eleven P0 failure states of the P12-MASK condition:

- `p0IllegalArgmaxCount = 7`
- `p0OverrideCount = 7`
- `emptyMaskCount = 0`

Seven of the nine illegal-argmax P0 steps in the whole P12-MASK condition are
these failure states; the other two are P0 steps whose *argmax* was illegal but
whose *draw* happened to land on a legal token, so no corruption followed. All
nine are overridden by the P012 counterfactual:
`p12P0IllegalArgmaxSteps = 9`, `p12P0WouldOverrideSteps = 9`. (The counts differ
in the other direction too: a failure state need not have an illegal argmax —
see the four legal-argmax states below.)

**The seven overridden failure states, in full:**

| State | Raw argmax bytes | p(argmax) | Continuation-start mass | Best legal (rank) | Masked selection | Margin | Newly valid character start? | Corpus-supported? |
|---|---|---|---|---|---|---|---|---|
| A / machine learning is #15 | `8d` (145) | 0.6047 | 0.6059 | 234 (rank 2) | 234 (`e6`) | 0.2138 | yes | **yes** |
| A / 机器学习是 #11 | `a5` (169) | 0.9294 | 0.9975 | 234 (**rank 12**) | 234 (`e6`) | 0.9288 | yes | no |
| B94 / 机器学习是 #2 | `9d` (161) | 0.2723 | 0.5266 | 232 (rank 2) | 232 (`e4`) | 0.0949 | yes | no |
| C94 / 太阳 #11 | `b7` (187) | 0.9285 | 0.9787 | 237 (rank 3) | 237 (`e9`) | 0.9229 | yes | no |
| C94 / 什么是 machine learning #3 | `a5` (169) | 0.6775 | 0.7177 | 278 (rank 2) | 278 (`79 20`) | 0.5965 | yes | no |
| T / machine learning is #11 | `b6` (186) | 0.8894 | 0.9638 | 297 (rank 3) | 297 (`e5 88`) | 0.8702 | yes | no |
| T / 太阳 #15 | `a2` (166) | 0.7953 | 0.9593 | 233 (rank 5) | 233 (`e5`) | 0.7787 | yes | **yes** |

The four **legal**-argmax failure states, where the P0 mask changes nothing:

| State | Raw argmax | p(argmax) | Continuation-start mass | Masked selection | Override |
|---|---|---|---|---|---|
| B94 / 太阳 #15 | 265 (`e7 9a 84` = 的) | 0.2475 | 0.4886 | 265 | no |
| B94 / 什么是 machine learning #3 | 104 (`64` = d) | 0.2158 | 0.0470 | 104 | no |
| C94 / 机器学习是 #8 | 243 (`ef`) | 0.4791 | 0.3904 | 243 | no |
| T / 什么是 machine learning #12 | 276 (`61 72` = ar) | 0.2511 | 0.0609 | 276 | no |

Three observations, all of which the brief's §14 requires be kept distinct from
generation outcome:

1. **The mechanism is a mass problem, not a rank problem.** At the seven
   overridden states the model puts a mean of **0.846** of its probability on
   the continuation-byte class (against a mean P0-legal mass of **0.154**). At
   state A/机器学习是#11 the best legal candidate is ranked **twelfth**; at T/太阳#15
   it is ranked fifth. Masking does not flip a near-tie — it selects a token the
   model ranked far below the winner.

2. **A legal replacement is not a semantic repair.** **Five of the seven**
   replacements are **not** the corpus-supported continuation; only
   A/machine learning is#15 (234) and T/太阳#15 (233) select a candidate the
   corpus supports. The mask makes the *next byte* legal; it does not make the
   *next character* correct. §14 explicitly warns that a legal but semantically
   wrong token is not a successful generation repair, and that is what most of
   these are.

3. **A legal replacement is often a lead byte, not a character.** Five of the
   seven replacements are a **single bare lead byte** (`e6` twice, `e4`, `e9`,
   `e5`) and a sixth is a lead plus one continuation (`e5 88`); only one
   replacement — `79 20` (`y `) at C94/什么是 machine learning#3 — is a complete
   character. The mask has pushed the decision one step forward: for six of the
   seven the character is still unfinished. Whether the trajectory recovers is
   decided by the *following* step, where the mask is now a P1/P2 mask.

## 9. P1/P2 displacement analysis

Against §13's requirement not to claim symmetry the paired data does not
support:

- **No P1/P2 corruption returns under P012-MASK:** 0/20. The P012 mask is
  Phase-101's mask wherever a character is open, verified structurally
  (`masksCoincideAtP1P2 = true`, and the contract suite asserts the two candidate
  sets are identical element-by-element at P1, P2 and PX).
- **No P0 corruption moves to a later phase:** `p0CorruptionMovedElsewhere = 0`.
- **No new corruption is introduced:** `newCorruptionIntroduced = 0`;
  `clean→corrupted = 0`.
- **Illegal draws that do not follow an illegal argmax are still prevented.**
  Two of the five BASE P0 failure states (§6) and four of the eleven P12-MASK P0
  failure states (§8) have a legal argmax; the mask overrides nothing there, so
  the only thing that stops the draw is that the illegal mass it could land in
  has been removed. The illegal-emission census confirms it did: illegal P0
  draws fall 5 (BASE) → 11 (P12-MASK) → 0 (P012-MASK). Note the direction of the
  middle step — the P1/P2 mask *raised* the P0 draw count by keeping
  trajectories alive and at a boundary, which is what makes the 11 → 0 fall the
  load-bearing comparison.

Mean P0-legal mass across all P0 steps barely moves between conditions
(A 0.975 → 0.972 → 0.943; B94 0.982 → 0.971 → 0.961; C94 0.981 → 0.954 → 0.925;
T 0.956 → 0.910 → 0.904). The corruption is concentrated in a small number of
states with enormous illegal mass, not spread thinly across the distribution —
which is why a change of a few points in the mean accompanies a fall from 11
corruptions to zero.

## 10. Paired transition matrix

**BASE → P12-MASK** (the Phase-101 reference; reproduced exactly):

```
corrupted→clean 2   corrupted→corrupted later 5   corrupted→corrupted same phase 5
corrupted→corrupted other 0   clean→clean 7   clean→corrupted 1
```

**P12-MASK → P012-MASK** (the primary causal comparison):

```
corrupted→clean 11   corrupted→corrupted later 0   corrupted→corrupted same phase 0
corrupted→corrupted other 0   clean→clean 9   clean→corrupted 0
```

P0-specific categories for the primary comparison:

| Category | Count |
|---|---|
| P0 corruption **removed** | **11** |
| P0 corruption **moved elsewhere** | 0 |
| P0 corruption **unchanged** | 0 |
| **new** corruption introduced | 0 |

All eleven previously-P0-corrupted trajectories became clean; all nine that were
already clean stayed clean. The eleven keys are listed verbatim in the artifact
(`p0TransitionCategories.p12ToP012.keys`).

For completeness, in the BASE → P12 direction the P0 categories are
`previousWasP0Count 5, removed 0, movedElsewhere 0, unchanged 5,
newCorruptionIntroduced 1`: Phase 101's mask preserved BASE's five P0
corruptions at P0 and added one (the single `clean→corrupted` trajectory). The
other five P0 corruptions in P12-MASK arrived from trajectories that were
corrupted at P1/P2 under BASE, which is the displacement Phase 101 reported.

## 11. Mirror-symmetry analysis

This is the central analysis. It does not rest on the corruption count reaching
zero.

| Evidence | P1/P2 side | P0 side |
|---|---|---|
| Illegal **argmax** steps observed | 6 (`p12P1P2IllegalArgmaxSteps`) | 9 (`p12P0IllegalArgmaxSteps`) |
| Steps the corresponding mask **removes** | 6 (`p12P1P2OverriddenSteps`) | 9 (`p12P0WouldOverrideSteps`, counterfactual) |
| Steps the corresponding mask **actually changed** under its own condition | 36 (`p012P1P2OverriddenSteps`) | 27 (`p012P0OverriddenSteps`) |
| Character-state direction of the error | emits a **new-character lead** while a character is **open** | emits a **continuation byte** while **no** character is open |

- `masksCoincideAtP1P2 = true`
- `p1p2SidePresentAndRemovable = true`
- `p0SidePresentAndRemovable = true`
- `symmetric = true`

Additional mass evidence on the P0 side, measured over the P12-MASK condition:

- Mean continuation-start mass over **all** P0 steps: **0.0496** (mean P0-legal
  mass 0.9503) — the illegal class is small on average.
- Mean continuation-start mass over P0 steps whose **argmax is illegal**:
  **0.8463** (mean P0-legal mass 0.1535) — the illegal class dominates exactly
  where the failure occurs.

**What the paired data supports and what it does not.** The data supports a
*structural* symmetry: the same failure appears on both sides of the
character-state boundary, each side is a byte-phase misalignment of the same
kind (the model picks a byte class that the phase forbids), each side is
measurable as illegal argmaxes with dominant illegal mass, and restricting each
side removes the corresponding failure states. The data does **not** support a
*quantitative* symmetry: the two sides are not the same size (6 vs 9 illegal
argmax steps, 36 vs 27 mask-changed steps), they are measured over different
step populations (P1/P2 has 112 steps, P0 has 221), and the P0 side's
continuation-byte class has no P1/P2 counterpart of comparable concentration
(the P1/P2 illegal class is "any token that does not continue the open
character", which includes all 128 ASCII bytes plus every fresh lead). Phase 102
does not claim the two sides are equivalent in magnitude.

## 12. Generation metrics

Per-arm columns are ordered **A / B94 / C94 / T** throughout.

| Metric | BASE | P12-MASK | P012-MASK |
|---|---|---|---|
| Corruption (total) | 12/20 | 11/20 | **0/20** |
| Corruption by phase | P0 5, P1 2, P2 5 | P0 11 | — |
| Illegal P0 draws | 5 | 11 | **0** |
| Illegal P0 draws that are continuation-start | 5 | 11 | 0 |
| Illegal P1/P2 draws | 7 | 0 | 0 |
| Mask interventions (steps where the counterfactual changed the draw) | 0 | 14 | 63 |
| **Tolerant** UTF-8 valid | 8/20 | 9/20 | **20/20** |
| **Strict** UTF-8 valid | 8/20 | 9/20 | **13/20** |
| `charIntegrityRate` (per-arm mean) | .860 / .835 / .828 / .826 | .886 / .791 / .819 / .860 | **1.000** all four arms |
| `meanTokensToFirstInvalid` | .20 / .00 / .20 / .80 | .20 / .00 / .40 / .60 | **0** all four arms |
| Empty-mask events | 0 | 0 | 0 |
| Trajectories terminating on empty mask | 0 | 0 | 0 |
| Mean trajectory length | 24.0 | 24.0 | 24.0 |

### The strict/tolerant gap under P012-MASK

This is the one number in the table that could be misread, so it is stated
plainly: **tolerant validity is 20/20 but strict validity is only 13/20.** Seven
of the twenty P012-MASK trajectories end with a character still open.

That is not a masking failure and it is not corruption. Under the §4 walker no
illegal byte is ever appended under P012-MASK, so the byte stream is always a
legal *prefix* of some UTF-8 text; seven trajectories simply stop at the
24-token horizon in the middle of a character they legally began. A decoder
reading those seven tolerantly sees valid text with an incomplete final
sequence; a strict decoder rejects them. `charIntegrityRate` is 1.000 for every
arm in this condition — every emitted character is intact — which is the metric
that separates "truncated legally" from "corrupted".

This matters for §13: the Phase-95 evaluator's generation gate is
`utf8Gate: "tolerant"`, so P012-MASK clears it. A strict gate would not be
cleared by 7 of 20 trajectories, even though nothing illegal was ever emitted.

Per-language ratios and the per-sample record are in `probe-results.json` under
`metrics.<condition>.perArm.<arm>` and `capabilityByArm.<arm>.<condition>`.

**Rollout is decode-independent and is therefore identical across all three
conditions.** It is the own-context greedy next-token accuracy against the
original document — a property of the weights, not of a candidate set. The
artifact records it once under `rollout` and says so explicitly. Reporting three
different numbers would be a fabrication.

No threshold, metric definition or capability criterion was added or changed by
this phase. The `recipe` block in the artifact declares `topK: null`,
`topP: null`, no repetition handling, and the same seed, temperature, horizon and
EOS behaviour in all three conditions.

## 13. Capability result

Measured with the **unchanged** Phase-95 evaluator
(`capabilityFor` → `evaluateGeneration` → `buildEvidence` →
`deriveCapabilityLevel`, `utf8Gate: "tolerant"`). The metric model is always the
frozen checkpoint, so the Level-3 memorization term never sees a mask.

| Arm | BASE | P12-MASK | P012-MASK |
|---|---|---|---|
| A | Level 3 | Level 3 | **Level 4** |
| B94 | Level 3 | Level 3 | **Level 4** |
| C94 | Level 3 | Level 3 | **Level 4** |
| T | Level 3 | Level 3 | **Level 4** |

Under BASE and P12-MASK, Level 4 reports `"lower gate not met"`. Under
P012-MASK the same untouched code reports Level 4 achieved, with no failing
reason.

### Phase 102 does not claim Level 4

§15 of the brief forbids it and the reason is visible in the numbers. Level 4's
lower gate is the generation gate, and P012-MASK makes that gate satisfiable
**by construction**: if no illegal byte can ever be appended at any phase, the
byte stream is necessarily a legal UTF-8 prefix, which is what a tolerant gate
accepts. The evaluator awarding Level 4 here measures the *decoder constraint*,
not a property of the model. Exactly the same thing was true of Phase 101's
P1/P2 mask at its own phases.

The shape of the award is worth reading carefully, because it is the cleanest
available evidence that Level 4 here is not a capability claim. All four Level-4
sub-conditions — "generation is valid UTF-8", "generation is non-empty",
"generation is not repetition-collapsed", "generation uses learned (merged)
subword tokens" — are reported as satisfied in **all three conditions**, BASE
included. The only line that differs is the last: BASE and P12-MASK append
**"lower gate not met"**, and P012-MASK does not. So the single thing that
changed between Level 3 and Level 4 is the lower gate, and the lower gate is the
domain where the mask operates. Nothing in the model changed. If a strict gate
had been configured instead of the tolerant one, the same 20 trajectories would
have failed 7 of 20 on trailing incompleteness alone (§12) — which shows how
much the answer depends on a gate setting rather than on the weights.

Specifically, Phase 102:

- did **not** modify `GenerationEvaluator` or any threshold;
- did **not** add a Phase-102 Level-4 threshold;
- did **not** introduce a phase-mask-specific capability criterion;
- does **not** report a "masked Level 4" as a capability result;
- does **not** claim the model reached Level 4.

The observation is reported because suppressing a number the evaluator actually
produced would be worse than reporting it — but the claim is declined, and the
decline is the point.

## 14. Mechanistic interpretation

The evidence supports a single mechanism with two symmetric faces:

> At every step the model chooses among tokens using a distribution whose mass
> is concentrated on a byte class that the current byte phase forbids. The
> forbidden class is different at each phase, the model does not represent the
> phase in its candidate ranking, and the failure appears wherever the phase
> constraint bites.

At P1/P2 the forbidden class is "tokens that do not continue the open
character" and the model picks a fresh lead byte. Phase 101 removed that class
and the failure moved to the phase it had not constrained. At P0 the forbidden
class is "tokens that begin with a continuation byte" and the model picks
`0xA5`, `0x9D`, `0xB7`, `0xB6`, `0xA2` — bare continuation bytes — with up to
99.75% of the mass. Phase 102 removed that class as well, and there is no
further phase to move to.

Three structural facts are worth separating from the narrative:

- The **candidate filter is exact, not heuristic.** The P0 set is a pure
  function of (vocabulary, byte state), implemented with `-Infinity` at excluded
  ids only, leaving every permitted logit byte-identical. The contract suite
  asserts the forbidden first-byte reduction is unnecessary on this vocabulary
  rather than relying on it.
- The **counterfactual is paired, not re-sampled.** `p012WouldIntervene` compares
  two selections under the *same* uniform draw. Every reported override is a
  change caused by the candidate set alone, with the RNG stream untouched.
- The **trajectory-level zero is a consistency check.** Masking every phase
  guarantees no illegal byte is ever appended, so 0/20 corruption is implied by
  the construction. It is reported as such and is *not* offered as evidence. The
  load-bearing evidence is the illegal-emission census (§7: 11 of 11 P0
  corruptions were continuation-byte emissions, 16 of 16 counting BASE), the
  illegal-argmax counts (§6, §8), the mass measurements (§11) and the paired
  transition matrix (§10).

## 15. Limitations

1. **Corpus support is low.** Five of the seven overridden argmaxes are replaced
   with tokens the corpus does not support at that context. The mask repairs the
   *encoding*, not the *content*.
2. **Four checkpoints, five prompts, twenty trajectories.** The illegal-argmax
   counts are 6–9 steps out of hundreds. The effect is large where it occurs and
   absent elsewhere; the sample is small in absolute terms.
3. **The P0 restriction removes a class that is partly degenerate.** Thirteen of
   the 77 exclusions are forbidden leads no phase accepts, so the mask is
   strictly larger than the mechanism under test. The instrument separates the
   two classes so the phase-dependent part can be read on its own.
4. **The mask selects tokens the model ranked as low as twelfth.** The greedy
   replacement is not a controlled intervention on model belief; it is the
   highest-probability member of a class the model mostly ignored. Consequences
   for output quality beyond legality are not measured here.
5. **Some P0 failure states are untouched by the mask**, because their argmax
   was already legal: 2 of the 5 recorded BASE states (§6) and 4 of the 11
   P12-MASK states (§8). Those corruptions are sampling draws, and the P0
   restriction prevents them only by removing the illegal mass the draw could
   land in — a real effect, but a different one from overriding an argmax, and
   not evidence for the argmax-override mechanism the hypothesis is about.
6. **The symmetry is structural, not quantitative** (see §11). The two sides
   have different step populations and different class sizes.
7. **The garbage is measured, not decoded.** Whether the resulting text is
   meaningful is outside this experiment; only legality and the existing
   evaluator's metrics are reported.

## 16. What is NOT proven

- **Not proven that the model "reached Level 4".** §13. What changed is the
  decoder's candidate set, and the Level-4 gate is downstream of legality.
- **Not proven that the mask produces good text.** Legality is not fluency. Most
  legal replacements are bare lead bytes with no corpus support.
- **Not proven that the byte-phase story is the whole story.** Phase-99's audit
  of the same 12 BASE failures found 7 of them mid-sequence (`phaseMidCount = 7`,
  share 0.583) with mean compatible mass 0.448 — below one half — and its
  `decisionGate` raised two competing flags, `["B","C"]`, with a mechanism
  verdict of `E`. Phase 102 explains the P0 residue; it does not dissolve
  Phase-99's flags, and the two legal-argmax P0 states whose corruption is a
  sampling draw are direct evidence that the byte-phase account is not the only
  thing happening at this boundary.
- **Not proven that the P0 class is the only P0 problem.** Four of the eleven P0
  corruptions had a legal argmax; the mask removes the mass their draw landed
  in, not from an argmax override.
- **Not proven across vocabularies.** `firstByteTestDisagreementCount = 0` is a
  measurement about these 300 entries. A vocabulary with a legal lead followed
  by an illegal byte would make the cheap test wrong; the instrument uses the
  full walk and records the count so the claim cannot silently rot.
- **Not proven that these four checkpoints represent the training procedure.**
  All four arms behave the same way here; that is four checkpoints, not a
  distribution.
- **Nothing about training.** No gradient step was taken. `TRAINING: NOT RUN`
  in the manifest, the probe artifact and here.

Three complete runs of the experiment were performed against the frozen
instrument (the first after the artifact format was finalised, the second and
third to establish reproducibility). `experiments/phase102/reproducibility.json`
records the scientific digest of each artifact and compares it with the previous
run:

| Artifact | sha256 (identical in every run) |
|---|---|
| `probe-results.json` | `47ee66cfb07bfec3dbb2ae7f0af78f3fbfe1713cff52d32b5709d5934451b20d` |
| `static-p0-failure-state.json` | `fe25fd8d1b79b921ea0e1458d55a9620776c24be8224fe026c9c6447472963c5` |
| `manifest.json` | `e214a28f8ec5f0dd93fc86e1c199180fcd85752cc3b40dd5c76064dab27bf1a3` |

`matchesPrevious: true`, `differingFiles: []`, `runCount: 3`.

**The digest claim, stated precisely.** The digest is sha256 of the
canonicalised artifact with every `durationMs` field removed
(`scientificDigestOf`), and `durationMs` is the only excluded field. It is *not*
present in all three artifacts: the probe measures this and records the answer
rather than asserting it — `artifactsWithVolatileFields: ["manifest.json"]`.
So for `probe-results.json` and `static-p0-failure-state.json`, which contain no
volatile field at all, an equal digest **is** a byte-identical file; for
`manifest.json` it is identity modulo its one wall-clock counter. An earlier
draft of the artifact's own method string claimed all three were byte-identical;
that was false for the manifest, and the wording was corrected and re-measured
rather than left standing. The manifests carry no *timestamp* field at all — the
`producedAt` field is deliberately omitted and the omission is documented in the
artifact (`producedAtOmitted`); `durationMs` is a duration, not a clock reading.

Invariants held in every run: `allInvariantsHeld = true`,
`invariantFailures = []`, checkpoint SHA256 unchanged from Phase-101's recorded
values for all four arms, tokenizer and vocabulary unchanged, base replay
matching the recorded ids, `enabled:false` views bit-transparent, and zero
disagreement with the unchanged evaluator's own output in all twelve
arm-condition pairs.

Nothing varied between the runs except the manifest's `durationMs`, so there is
no scientific source of variation to report.

## 17. Phase-103 recommendation

**Exactly one next falsifiable hypothesis.**

> **H103.** If the P0 failure is a *phase-blind* candidate ranking rather than a
> P0-specific preference, then the model's continuation-byte mass at a character
> boundary should track the **continuation byte it would have emitted had a
> character been open at that point** — i.e. the same byte-phase confusion
> expressed from the other side. Test: at each P0 state in the P12-MASK
> trajectories, compare the distribution over continuation bytes (0x80–0xBF) with
> the distribution the same model produces when the *same prefix* is extended
> with a single illegal lead byte, forcing P1. Offsetting the two distributions
> by the byte that completes the intended character should reconstruct the P0
> continuation-byte ranking. **Falsified if** the two distributions are unrelated
> (rank correlation not distinguishable from zero), which would mean the P0
> continuation-byte preference is not the model "finishing" a character it never
> opened, and the two faces of the boundary are two separate mechanisms rather
> than one.

Recommendation: run H103 before any intervention work. It is a pure
forward-pass measurement over already-frozen checkpoints, needs no training and
no new decoding condition, and its outcome decides whether Phase 104 should
attack the candidate ranking itself (a phase-conditional prior) or the
representation (the model does not encode the open-character state at all).

Phase 103 is **not begun** in this task.

---

## Integrity

| Item | Status |
|---|---|
| Training | **NOT RUN** — no gradient step, no fine-tune, no embedding/LM-head update |
| Checkpoints | unchanged; SHA256 equal to Phase-101's recorded values for A, B94, C94, T |
| Tokenizer / vocabulary / merge table | unchanged |
| Prompts / dataset / generation settings | unchanged; `topK`/`topP` null throughout |
| Phase-95 evaluator and thresholds | unchanged; imports nothing from `experiments/phase102` |
| Level-4 definition | unchanged; no Phase-102 threshold, no "masked Level 4" |
| Phase-89 objective / Phase-90 layout | unchanged |
| Production code | no file modified; `productionModulesModified: []` |
| Mask scope | experimental; reached only through a weight-free model view |

Artifacts:

| Path | Role |
|---|---|
| `experiments/phase102/p0-phase-mask-audit.ts` | instrument |
| `experiments/phase102/probe.ts` | static stage then full stage |
| `experiments/phase102/run-probe.cmd` | launcher |
| `experiments/phase102/run-phase102-suite.ts` | focused suite launcher |
| `experiments/phase102/static-p0-failure-state.json` | P0 census, semantics, static audit |
| `experiments/phase102/probe-results.json` | the three-condition experiment |
| `experiments/phase102/manifest.json` | provenance and configuration |
| `experiments/phase102/reproducibility.json` | cross-run scientific digests |
| `src/lib/minimind/research/tests/phase102-p0-phase-mask.test.ts` | contract suite |

## Validation

| Check | Result |
|---|---|
| Phase-102 focused suite | **208 passed, 0 failed, 0 skipped** (exit 0) |
| Research suite (Phase 57–102) | **1639 passed, 0 failed** (exit 0); Phase-102 is 208 of that |
| `tsc --noEmit -p tsconfig.json` | **64 errors, 0 in `experiments/`, 0 in `phase102`** |
| `npm run build` | **exit 0**, compiled successfully; **0 Phase-102 warnings** (178 pre-existing warnings untouched) |
| `git status --short` | see the commit boundary below |

The 64 type errors and 178 build warnings are **pre-existing** — they sit in
`src/lib/minimind/training/__tests__/` and unrelated UI files, are identical in
count before and after this phase, and were left alone per the instruction not
to fix unrelated historical files.

Two of the suite's own contracts failed on first run and were **bugs in the
test file**, not in the experiment: one read Phase-99's failure records as
`phase` when the field is the nested `bytePhase.phase`, which silently produced
an empty set and made a downstream "every one has a counterpart" check pass
vacuously; the other asserted an ordering between two counters that measure
different things over different trajectory populations. Both were corrected —
the first now also asserts the Phase-99 set is non-empty so it cannot pass
vacuously again, and the second was replaced with the relation that does hold
(every P0 step with an illegal unmasked argmax is necessarily an override
step). A third test that had been skipping on this vocabulary was replaced with
synthetic byte sequences (`0xC3 0xC3`, `0xE5 0x99 0x41`, `0xF0 0x9F 0x41 0x80`,
…) that *do* have a legal first byte and an illegal later byte, so the §18
internal-validity requirement is now exercised rather than skipped.

**Commit:** `NOT COMMITTED`.
