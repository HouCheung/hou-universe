# Phase 113 — Minimal Chat SFT — Report

**Date:** 2026-10-20
**Verdict:** C — Not supported

## 1. Question

Does assistant-only SFT improve held-out chat answers versus no SFT (A) and a
mismatched-answer control (C)?

## 2. Frozen inputs

- Dataset SHA-256: `efea181ee833ce1e584ebbb493b111c7c1b9955d40591d2420ada9c36e539312`
- Tokenizer fingerprint: `a39570023a0cfe171ea3eb9fbaf86a6fc3e58b643b57e1344fe89c2794695a3d`

## 3. Primary metric (greedy normalized exact-match count)

| Arm | Greedy EM count | mean token F1 | Sampled EM count | en EM count | zh EM count | mixed EM count |
|---|---|---|---|---|---|---|
| A | 0/27 | 0.0386 | 0/27 | 0/9 | 0/9 | 0/9 |
| B | 0/27 | 0.0868 | 0/27 | 0/9 | 0/9 | 0/9 |
| C | 0/27 | 0.0699 | 0/27 | 0/9 | 0/9 | 0/9 |

Counts are integers out of 27; the corresponding rate is `count / 27`.

## 4. Acceptance criteria

| Criterion | Result |
|---|---|
| absolute | FAIL |
| beatsA | FAIL |
| beatsC | FAIL |
| margin | FAIL |
| perLanguage | FAIL |

All criteria use integer exact-match counts over the same 27 held-out questions
(A=0, B=0,
C=0):

- `absolute`: `correct_B >= 5`
- `beatsA`: `correct_B > correct_A`
- `beatsC`: `correct_B > correct_C`
- `margin`: `correct_B - max(correct_A, correct_C) >= 2`
- `perLanguage`: `correct_B >= 1` in each of `en`, `zh`, `mixed`

The margin is two items (`2/27` as a rate), never a rate difference of 2.
Token F1 is secondary and cannot substitute for these criteria.

## 5. Integrity diagnostics (not capability)

| Arm | UTF-8 enforced | invalid UTF-8 | dropped tail | empty candidate | EOS stops | maxToken stops | error stops | empty outputs | turn leaks | ctx truncations |
|---|---|---|---|---|---|---|---|---|---|---|
| A | yes | 0 | 8 | 0 | 0 | 27 | 0 | 0 | 0 | 0 |
| B | yes | 0 | 2 | 0 | 18 | 9 | 0 | 1 | 0 | 0 |
| C | yes | 0 | 6 | 0 | 12 | 15 | 0 | 0 | 0 | 0 |

P012 is a decoding safeguard. A UTF-8-clean answer is not counted as correct
unless it matches the gold answer.

## 6. Artifact hashes

- A: `dff07a8366ba21e4a75c0ed48172bdc6848a882f252b2377e112c6152adcbc5e` (tokenizer: reconstructed)
- B: `f56e4ce39aa3c86981613f6c5361d8e7fa57aa4389625e7455a7202ddea0288d` (tokenizer: metadata)
- C: `fe679cbc2a8745a83b04acc556c69b074a0d551398ad1d4f69310659f469415e` (tokenizer: metadata)

## 7. Limitations

- 84 training examples and a 1.1M-parameter model; 27 held-out items.
- The held-out set is single-turn; multi-turn behavior is trained but not claimed.
- The base tokenizer state was reconstructed, not recorded.
- EOS termination is newly learned.
- No causal claim beyond this controlled experiment.
