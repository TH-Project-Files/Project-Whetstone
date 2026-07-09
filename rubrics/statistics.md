# Statistics — sampling, agreement, convergence, and honest significance

Whetstone aims for *defensible prioritization*, not a p-value theater. This file defines what
"enough evidence" means, how to keep judges trustworthy, when to stop, and — critically — how
to describe the strength of a conclusion without overclaiming.

## 1. The coverage matrix

Coverage is a fact, not a vibe. Define cells as `<mode> | <intent> | <difficulty-bucket>`
where difficulty-bucket ∈ {easy, moderate, hard, adversarial}. Every scenario fills exactly one
cell (its `fingerprint.coverage_cell`). A campaign tracks, per cell:

- `n` — scenarios run
- `n_confirmed` — findings at L1+ / CONFIRMED
- `mean_overall` and its spread

A cell is **under-sampled** until `n ≥ stopping_rule.min_samples_per_cell` (default 5). Under-
sampled cells may not anchor a top-priority conclusion — they can only *motivate more scenarios*.
The Controller reports the coverage matrix each round so gaps are visible.

## 2. Non-repetition: the similarity gate

Two scenarios are near-duplicates when their fingerprint similarity exceeds
`run-config.scenario_plan.max_repeat_similarity` (default 0.82). Similarity is a weighted blend:

```
sim(a,b) = 0.35 * pathShapeJaccard(a,b)
         + 0.25 * (a.intent === b.intent ? 1 : 0)
         + 0.20 * difficultyTagJaccard(a,b)
         + 0.10 * sourceMixJaccard(a,b)
         + 0.10 * normalizedTextTrigramCosine(a,b)
```

Exact-text duplicates (`normalized_text` identical) are always rejected regardless of the
threshold. A candidate that collides is either dropped or *mutated* along one axis until it
clears the gate — mutation is allowed only when the changed axis is itself the test objective
(e.g. deliberately varying `source_mix` to test a fix's breadth). Every accepted scenario's
fingerprint is appended to `memory/scenario_fingerprints.jsonl`; the gate checks against the
full history, so campaigns never repeat across rounds either.

## 3. Judge panels and inter-rater agreement

With `judge_panel_size > 1`, each run gets N independent RunScores. Trust the aggregate only
when the judges agree:

- Per-axis **percent-agreement-within-1**: fraction of axis scores where all judges land within
  1.0 of each other. Target ≥ 0.8.
- For a stricter figure, compute **Krippendorff's α (interval)** across judges per axis; α ≥ 0.67
  is the conventional "tentatively reliable" bar, α ≥ 0.8 "reliable."
- Reconcile to a consensus score by the **median** across judges (robust to one outlier judge),
  not the mean.
- If agreement is below target on an axis, that axis's descriptors need tightening
  (`rubrics/axes.md`) or the scenario is genuinely ambiguous — flag it, don't average over it.

Judges must be **independent**: they receive the scenario, trace, and answer, but not each
other's scores and not the Scenario Smith's private "expected answer" beyond the scenario's
public `expected_ideal_path`.

## 4. Prevalence and effect size

Once a cell meets its sample floor, a cluster's **prevalence** stops being an estimate and
becomes an empirical rate: `confirmed_members_in_cell / n_in_cell`, reported with a
**Wilson 95% confidence interval** (better than normal approximation at small n). Prioritize by
the *lower bound* of that interval — a cluster seen in 4/5 hard scenarios (Wilson lower ≈ 0.38)
is more trustworthy than one seen in 1/1 (Wilson lower ≈ 0.05).

For before/after fix comparisons, report the **effect size**, not just "scores went up":
mean overall delta on the failure-revealer scenarios, plus the count of `regressed` and
`inflated` verdicts on neighbors/variants (`schemas/regression.schema.json`).

## 5. Convergence — the stopping rule

Stop the campaign when **both** hold for `stopping_rule.dry_rounds` consecutive rounds
(default 2):

1. **No new clusters** — a round produced zero findings that map to a *new* `cluster_id`
   (new findings joining existing clusters are fine and expected).
2. **Sample floor met** — every coverage cell touched by a top-ranked cluster has `n ≥
   min_samples_per_cell`.

Also stop on `max_rounds` or `max_output_tokens` (budget), reporting the campaign as
**incompletely converged** if so. "Loop-until-dry" without a floor is how you miss the tail;
a floor without dry-rounds is how you stop early on a shallow pass.

## 6. Honest significance — the words you may use

Set `plan.evidence_confidence` truthfully:

- **directional** — coverage is thin, or top clusters are mostly L0, or dry-rounds not met.
  You may say *"suggests"* and *"prioritize investigating."*
- **high-confidence** — stopping rule met, top clusters L1+/CONFIRMED with judge agreement ≥ 0.8,
  prevalence CIs computed. You may say *"the evidence strongly supports."*
- **significant** — reserved for when a claim is backed by **repeated independent trials** with
  reported variance (e.g. the same scenario set run K times to separate model nondeterminism
  from a real defect), not merely broad one-shot coverage. Most campaigns should NOT claim this.

> Do not write "statistically significant" unless you actually ran repeated trials and can quote
> the variance. Breadth of coverage earns "high-confidence," not "significant." Overclaiming here
> is itself a failure the Skeptic (`roles/07-skeptic.md`) is instructed to catch.
