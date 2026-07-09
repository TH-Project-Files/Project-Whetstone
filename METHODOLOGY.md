# Whetstone Methodology

The scientific core. Whetstone treats agent improvement as a **measurement-and-improvement
experiment**, not a vibe check. This document states the frame, the eight disciplines that make
the results trustworthy, and the honest limits of what the evidence can claim.

---

## The operative question

The wrong question — the one that produces flattering, useless output — is *"how can we improve
this agent?"* A model asked that will free-associate plausible improvements untethered to evidence.

The right question, asked once per run, is narrow and answerable:

> *Given **this** agent, **this** toolset, **this** scenario, and **this** trace — what measurable
> failures occurred, how severe and how prevalent are they, what root cause best explains them,
> and what minimal-regression change would fix them?*

Every role, schema, and rubric in the kit exists to answer that question with evidence and to
resist answering it with confident narration.

---

## The eight disciplines

### 1. Framing: observation over intention
Score what the agent **did**, not what its prompt **promised**. A capability the system prompt
claims but the trace never exercises scores as absent. This is enforced in `rubrics/axes.md`
(the golden rule) and in the Cartographer's "observed, not advertised" invariant (`roles/01`).

### 2. The fidelity ladder (the load-bearing idea)
Every datum records *how* it was obtained: **L0** design prediction, **L1** code-path execution,
**L2** end-to-end run, **L3** live-environment run. Predictions are labeled predictions;
conclusions are weighted by fidelity; the scary L0 predictions get promoted to L2 by sampling
before anyone changes code on their account. This exists because, in the project that seeded this
kit, *executing* scenarios flipped predictions that static analysis had rated "pass" — static
analysis is reliable about mechanisms and unreliable about emergent behavior. Full detail:
`rubrics/fidelity-ladder.md`.

### 3. Non-repetition: coverage as a fact
Each scenario carries a structural **fingerprint** (`intent`, `path_shape`, `difficulty_tags`,
`source_mix`, `ambiguity_shape`). A similarity gate rejects near-duplicates against the full
history, so a campaign never repeats a question — across rounds or across campaigns. The payoff is
a **coverage matrix** (`<mode> | <intent> | <difficulty>`): "we tested broadly" becomes a
countable fact, and gaps become the next round's work. `rubrics/statistics.md` §1–2.

### 4. Three measurement layers
- **Per-run axis scores** (0–5, anchored) — the quality signal.
- **Failure-derived counts** (unnecessary calls, retry loops, unsupported inferences, overbroad
  refusals…) — objective tallies that don't depend on a judge's mood.
- **Portfolio metrics** — score trends by mode/version, failure rates by cell, and **calibration**
  (did stated confidence match correctness? a Brier-style check).
Three layers because a single 0–5 is too lossy to prioritize real work.

### 5. Sampling, panels, and agreement
Scores are only as trustworthy as the judges. Use a **panel of independent judges**, reconcile by
**median**, and report **inter-rater agreement** (percent-within-1, or Krippendorff's α). Low
agreement means the axis descriptors need tightening or the scenario is genuinely ambiguous —
never average over disagreement. Prevalence, once a cell meets its sample floor, is reported as an
empirical rate with a **Wilson confidence interval**, and clusters are prioritized by the interval's
**lower bound**. `rubrics/statistics.md` §3–4.

### 6. Convergence: a real stopping rule
Stop when, for `dry_rounds` consecutive rounds, **no new cluster** appears **and** every
top-cluster coverage cell has met its **sample floor**. "Loop-until-dry" without a floor misses
the tail; a floor without dry-rounds stops on a shallow pass. Both conditions, or you stop on
budget and label the campaign *incompletely converged*. `rubrics/statistics.md` §5.

### 7. Ranking and minimal remediation
Clusters rank by `severity × prevalence × improvement_leverage`, discounted by fidelity and
regression risk (`rubrics/weighting.md`). The Planner proposes the **smallest effective fix** at
the right locus (a mechanism bug is not fixable by a prompt clause), and every fix ships with the
regression scenarios that will prove it. The Skeptic gates each fix against overfit,
over-correction, and evidence sufficiency before it counts.

### 8. Anti-self-reinforcement
The closed loop only improves the target if it can't flatter itself. Role separation is
structural: the agent that generates a scenario never scores it; the Judge never grades its own
verification; the Planner never gates its own plan; verification is adversarial (refute, don't
confirm). Score inflation via over-refusal is treated as a **regression**, not a win. This is what
turns "stone polishing" from a self-licking exercise into a disciplined engine.
`playbooks/STONE_POLISHING.md`.

---

## Honest significance — what you may claim

The word "statistically significant" is earned, not asserted. Set `plan.evidence_confidence`:

- **directional** — thin coverage, or top clusters mostly L0, or dry-rounds not met. Say
  *"suggests," "prioritize investigating."*
- **high-confidence** — stopping rule met, top clusters L1+/CONFIRMED, judge agreement ≥ 0.8,
  prevalence CIs computed. Say *"the evidence strongly supports."* **Most thorough campaigns land
  here — and that is enough to prioritize real work.**
- **significant** — reserved for claims backed by **repeated independent trials with reported
  variance** (e.g. the same scenarios run K times to separate model nondeterminism from a real
  defect). Breadth of coverage earns "high-confidence," not "significant."

Overclaiming here is itself a defect the Skeptic is instructed to catch. Whetstone's honest
deliverable is *high-confidence prioritization of improvement work*, which is exactly what a team
needs to decide what to fix next — and far more than an unstructured "polish pass" can give.

---

## How the pieces connect

```
run-config ─▶ Cartographer ─▶ target-profile
                                   │
        ┌──────────────────────────┴───────────────── round loop ─────────────────────────────┐
        │  Scenario Smith ─▶ scenarios (+ fingerprints, deduped)                                │
        │        │                                                                              │
        │  Run Simulator ─▶ traces (L0 all; L2/L3 sampled via adapter.execute)                  │
        │        │                                                                              │
        │  Trace Judge ×N ─▶ scores + findings   ──▶ Judge (verify/refute) ──▶ verify_status    │
        │        │                                                                              │
        │  Root-Cause Analyst ─▶ ranked clusters   (append-only findings; rewritten clusters)   │
        └───────────────────────────────── until convergence ─────────────────────────────────┘
                                   │
   Remediation Planner ─▶ plan ─▶ Skeptic (gate) ─▶ Regression Warden ─▶ regression pack
```

The data contracts for every arrow live in `schemas/`; the prompts for every box live in
`roles/`; the lens each round applies lives in `modes/`; the numbers live in `rubrics/`; and the
only target-specific code lives in one `adapters/` file. Read `README.md` for the map,
`playbooks/RUN_A_CAMPAIGN.md` to run one.
