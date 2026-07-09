# Playbook: Run a polishing campaign

The operator's step-by-step. A campaign points Whetstone at one target, runs rounds until the
evidence converges, and ends with a Skeptic-gated improvement plan plus a regression pack. You
can drive it by hand (dispatch each role prompt yourself) or with the reference runner
(`runner/whetstone.workflow.js`); this playbook is the by-hand mental model the runner automates.

## 0. Prerequisites
- A **target adapter** for your agent (`adapters/ADAPTER_CONTRACT.md`). Minimum: `describe()`.
  For hybrid fidelity, also `simulate()` and/or `execute()`.
- A **run-config** (`schemas/run-config.schema.json`): which modes, fidelity policy, per-round
  count, style mix, scoring/judges, stopping rule.
- A **campaign workspace**: copy `workspace/_TEMPLATE/` to `workspace/<campaign_id>/`.

## 1. Configure
Write the run-config. Decisions that matter most:
- **Modes** — start with 1–3 (don't boil the ocean); the highest-leverage trio for most agents is
  `efficiency`, `agent-logic`, `security`. Add modes in later campaigns.
- **Fidelity** — hybrid default: `default_level: L0`, `real_execution_sample_rate: 0.2`,
  `sample_strategy: highest-risk-first`. Simulation-only? Set the rate to 0.
- **Judges** — `judge_panel_size: 3` if you want inter-rater agreement; 1 for a cheap first pass.
- **Stopping rule** — `dry_rounds: 2`, `min_samples_per_cell: 5` are sane defaults.

## 2. Cartograph (once)
Run the **Cartographer** (`roles/01`) on the adapter's `describe()` → `memory/target_profile.json`.
Read its return summary; confirm the tool catalog, constraints (note any `null` call budget!),
outages, and top failure domains look right. A wrong map poisons everything downstream.

## 3. Round loop
Repeat until the stopping rule fires:

1. **Generate** — **Scenario Smith** (`roles/02`) produces the round's scenarios, deduped against
   the full fingerprint history. Blend in curated `seed-imports/` if you have them.
2. **Run** — **Run Simulator** (`roles/03`) builds a trace per scenario. All at the default level;
   a sampled subset promoted to L2/L3 via the adapter's `execute()` (highest-risk-first).
3. **Score** — N independent **Trace Judges** (`roles/04`) per run; reconcile by median; record
   inter-rater agreement.
4. **Verify** — a separate Judge instance tries to *refute* each candidate finding →
   `verify_status`. Default to skeptical.
5. **Cluster** — **Root-Cause Analyst** (`roles/05`) folds findings into ranked clusters.
6. **Append & report** — write findings/fingerprints/scores (append-only), rewrite
   `issue_clusters.json`, log the coverage matrix. Check: any coverage cell still under the
   sample floor that a top cluster depends on? If so, next round targets those cells.

**Convergence check** (`rubrics/statistics.md` §5): stop when, for `dry_rounds` consecutive
rounds, no new cluster appeared **and** every top-cluster cell met the sample floor. Otherwise
stop on `max_rounds`/budget and mark the campaign *incompletely converged*.

## 4. Plan
Run the **Remediation Planner** (`roles/06`) over the ranked clusters → a draft `plan` of smallest
effective fixes, each with a locus, a concrete change, and named regression scenarios.

## 5. Skeptic gate
Run the **Skeptic** (`roles/07`) over the draft plan. Each item comes back
`accepted` / `narrowed` / `rejected` / `needs-more-evidence`. Items marked *needs-more-evidence*
usually mean "promote to L2 and re-measure" — feed them back into a targeted mini-round rather
than shipping a fix on an untested prediction.

## 6. Regression pack
Run the **Regression Warden** (`roles/08`) to build the pack guarding accepted fixes
(failure-revealers + close-variants + neighbors). This is built now; its `deltas` are filled
*after* the fixes are implemented and the pack is re-run.

## 7. Report & set honest confidence
Emit `runs/<run_id>/summary.md` with: coverage matrix, top clusters (rank, fidelity,
confirmed/total), the plan, and the regression pack. Set `plan.evidence_confidence`
truthfully — **directional / high-confidence / significant** per `rubrics/statistics.md` §6.
Most first campaigns are *directional* or *high-confidence*; do not write "significant" without
repeated trials.

## 8. Implement, re-run the pack, iterate
Hand the plan to whoever implements fixes (this can be a separate coding agent). After fixes land,
re-run the regression pack: revealers must improve, variants must improve (not just the literal
case), neighbors must not regress or inflate. Then start the next campaign — the watchlist and
fingerprint history carry forward, so you never repeat and never silently re-break a prior win.

## Scaling guidance
- *"Quick check"* → 1 mode, 1 judge, simulation-only, 1–2 rounds. Directional at best; say so.
- *"Thorough audit"* → 3–8 modes, 3 judges, hybrid with a real sample, run to convergence,
  adversarial verify on every finding. This is where high-confidence prioritization comes from.
