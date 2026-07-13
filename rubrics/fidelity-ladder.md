# The Fidelity Ladder

The single most important discipline in Gristmill. Every trace, score, finding, and cluster
carries a **fidelity level** recording *how the evidence was obtained*. Conclusions are weighted
by fidelity, and predictions are never reported as facts.

> **Why this exists.** In the reference project, a design-level red-team pass rated a batch of
> behaviors "pass." When the same cases were actually *executed*, two of those predictions
> flipped — an off-topic request that was predicted to be redirected was instead fully answered,
> and an ambiguous imperative predicted to trigger a clarifying question instead triggered
> autonomous edits. Static analysis is reliable about *mechanisms* (does the guard function
> reject X?) and unreliable about *emergent behavior* (what does the whole agent actually do?).
> The ladder makes that distinction structural instead of a footnote.

## The four levels

| Level | Name | How the datum was obtained | Trusts |
|---|---|---|---|
| **L0** | Design prediction | Reasoned from the target profile, prompts, schemas, and tool contracts — no execution. | Documented mechanism |
| **L1** | Code-path execution | A specific guard/validator/formatter/tool function was executed in isolation with crafted inputs. | Unit-level behavior |
| **L2** | End-to-end run | The whole agent was driven on the scenario via the adapter's `execute()`; the real trace and answer were captured. | Emergent behavior |
| **L3** | Live-environment run | An L2 run against real backends/data (live tenant, production-like integrations). | Real-world behavior incl. data/schema drift |

## Rules

1. **Tag at capture.** The Simulator sets `trace.fidelity`; the Judge copies it to `score` and
   `finding`; the Analyst records the cluster's `min_fidelity` (the *lowest* among its members).
2. **Predictions are labeled predictions.** An L0 finding's `summary` must read as a hypothesis
   ("*predicted to…*"), never as observed fact. Only L1+ may state "*does…*".
3. **Fidelity discounts rank.** Cluster `rank_score` multiplies by a fidelity weight
   (L0 0.6, L1 0.8, L2 1.0, L3 1.0) so a confirmed executed defect outranks an equal-severity
   prediction (`rubrics/weighting.md`).
4. **Promotion is the job of sampling.** Hybrid campaigns simulate everything at L0/L1, then
   promote a sampled subset to L2/L3 via `run-config.fidelity.real_execution_sample_rate`.
   Prefer promoting the highest-severity and most-prevalent L0 predictions first
   (`sample_strategy: highest-risk-first`) so the scariest predictions get tested.
5. **A prediction that survives execution is upgraded, not duplicated.** When an L0 finding is
   re-observed at L2, raise its `fidelity` and, if a verifier reproduced it, its `verify_status`
   to CONFIRMED — do not create a second finding.
6. **A prediction that execution contradicts is refuted.** Set `verify_status: REFUTED`, keep
   the record (it documents a static-analysis blind spot worth remembering), and drop it from
   the plan.
7. **A prediction can never be CONFIRMED.** `CONFIRMED` requires evidence a verifier can
   independently check, and an L0 trace's "evidence" is itself predicted — internal consistency
   is not reproduction. Verify over L0 caps at UNCERTAIN (with a note on what execution would
   settle it); the orchestrating harness enforces the cap mechanically rather than trusting the
   verifier's restraint.

## Fidelity vs. verify_status

They are independent axes and both matter:

- **fidelity** = *how directly* it was observed (prediction → executed → live).
- **verify_status** = *did an independent adversarial check reproduce it* (CONFIRMED / UNCERTAIN
  / REFUTED). The axes are independent except at one corner: CONFIRMED requires L1+ (rule 7).

A finding can be L2 + UNCERTAIN (executed once, not yet reproduced) or L1 + CONFIRMED (a guard
function repeatably rejects the input) — but never L0 + CONFIRMED. The Plan's `evidence_confidence` field summarizes the
portfolio: report **significant** only when the highest-value clusters are L2+/CONFIRMED and the
sampling met the stopping rule.
