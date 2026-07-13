# Playbook: The grind — the closed critic↔planner loop

"The grind" is the practice of folding an agent back on itself in a closed loop, running it
between two millstones of critique and repair, pass after pass, until what comes out is refined.
Done naively it degrades into self-congratulation: an agent that critiques itself, plans a fix
from its own flawed critique, and grades the fix as a success. Gristmill makes it *work* through
one discipline: **role separation with an adversarial gate**. This playbook explains the loop and
how to keep it honest.

## The failure mode we're avoiding
A single agent doing generate → critique → fix → grade in one head will:
- rate its own reasoning charitably,
- fix the symptom it happened to notice rather than the root cause,
- overfit to the one case it looked at, and
- inflate the score by becoming more cautious (over-refusing), mistaking timidity for safety.

Every rule below exists to break one of those.

## The rotation (who may not be who)
Map the six classic milling roles onto Gristmill's roles. The hard constraint: **the agent that
produced an artifact never judges it, and the judge never grades its own verification.**

| Milling role | Gristmill role | Must be independent of |
|---|---|---|
| Builder (predicts intended/best behavior) | Scenario Smith's `expected_ideal_path` + Simulator's ideal path | the Judge |
| Breaker (hunts failure) | Scenario Smith (adversarial families) + Simulator's risk annotations | — |
| Judge (scores against a rubric) | Trace Judge (panel of N) | the Smith's private intent; co-judges |
| Historian (logs concise findings) | append-only `memory/` writes | — |
| Planner (proposes fixes) | Remediation Planner | the Skeptic |
| Skeptic (guards against overfit/regression) | Skeptic | the Planner |

The Root-Cause Analyst and Regression Warden are the connective tissue that make the loop
*longitudinal* rather than one-shot.

## The loop, one turn of the wheel
```
        ┌─────────────────────────────────────────────────────────┐
        ▼                                                         │
  generate (Smith) ─▶ run (Simulator) ─▶ score (Judge panel)      │
        │                                     │                   │
        │                              verify/refute (Judge′)      │
        │                                     ▼                   │
        │                          cluster (Analyst)               │
        │                                     ▼                   │
        │                          plan (Planner)                  │
        │                                     ▼                   │
        │                          gate (Skeptic) ── reject/narrow ┘  (back to Planner / more evidence)
        │                                     ▼ accept
        └───────────── regression pack (Warden) ─▶ implement ─▶ re-measure ─▶ next turn
```
Each turn leaves the grain (the target) a little finer, and leaves *the loop itself* smarter: the
fingerprint history grows (so the next turn asks new questions), the watchlist grows (so old wins
stay won), and the cluster stability record grows (so recurring defects rise in priority).

## The four honesty rails
1. **Fidelity before confidence.** A critique of predicted behavior (L0) is a hypothesis. Before
   the loop *changes* the target on the strength of it, promote it to L2 and see if the real agent
   actually does the thing. This is the rail that stops the loop chasing phantoms.
   (`rubrics/fidelity-ladder.md`)
2. **Refute, don't confirm.** Verification is adversarial by construction — the verifier's job is
   to kill the finding, and it survives only if it can't be killed. (`roles/04`, Verify mode)
3. **Root cause, not symptom.** The Analyst clusters by cause so the Planner fixes the mechanism,
   not the one scenario. The Skeptic rejects fixes that key on a literal value. (`roles/05`, `07`)
4. **Inflation is a regression.** The Warden treats a score that rose via over-refusal/over-
   escalation as `inflated`, not improved. Milling must remove flaws without grinding away what
   already works.
   (`roles/08`)

## Convergence — when to stop turning the wheel
Two anti-patterns bracket the right answer:
- **Stopping too early** (one shallow pass) misses the tail of rarer defects.
- **Milling forever** overfits and burns budget on diminishing returns.

The stopping rule (`rubrics/statistics.md` §5) splits the difference: keep turning until
`dry_rounds` consecutive rounds surface no *new* cluster **and** the sample floors are met. The
grind is "fine enough" when new passes stop revealing new flaws — not when you're tired of
looking, and not after the first promising crack.

## A note on models milling models
You can run the loop with the target and the milling roles all on the same model, or deliberately
use **different models for different roles** — e.g. one provider's model as Scenario Smith/Breaker,
another as Judge — and import externally-generated scenarios (`seed-imports/`). Cross-model
diversity is the strongest defense against shared blind spots: a target rarely fails on the cases
a *different* lineage of model thought to ask. The role-separation rules above are what let you
mix models safely — independence is enforced structurally, not by trusting any one model to be
fair to itself.
