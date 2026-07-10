# Reference runner

`whetstone.workflow.js` automates one campaign end-to-end. It has one control flow
(`runCampaign`) and two interchangeable **engines**:

- **offlineEngine** — deterministic, dependency-free role stand-ins driven by a built-in
  `SimulationAdapter`. No LLM, no network. This is what runs when you invoke the file directly,
  and it exists so the *methodology* (loop, schemas, non-repetition, scoring math, artifact chain)
  is verifiable without any live target or model.
- **workflowEngine** — the same role methods, each backed by a real subagent via the Claude Code
  Workflow tool's `agent()` global, using the prompts in `../roles/*.md` and the schemas in
  `../schemas/*.json`. This is how you run a *real* campaign against a *real* target.

## Run the offline dry run (verify the kit works)

```bash
# from the kit root
node runner/whetstone.workflow.js
# or with your own config:
node runner/whetstone.workflow.js path/to/run-config.json
```

It writes a full campaign under `workspace/<campaign_id>/`:
```
memory/target_profile.json
memory/scenario_fingerprints.jsonl     # every accepted scenario's fingerprint (dedup history)
memory/long_term_findings.jsonl        # append-only findings
memory/score_timeseries.jsonl          # append-only score trend
memory/issue_clusters.json             # ranked clusters (rewritten each round)
memory/regression_watchlist.json       # cumulative fragile domains
runs/<date>-run-001/
  config.json  scenarios.jsonl  traces.jsonl  scores.jsonl
  raw_traces/<scenario_id>.<fidelity>.json   # a promoted scenario keeps both its L0 and L2 trace
  coverage_matrix.json                       # per-cell n / n_confirmed / mean (statistics §1)
  plan.json  regression.json  summary.md
```
Run it twice with the same `campaign_id`: the second run's round log shows scenarios rejected by
the fingerprint gate — proof the non-repetition engine works across runs.

## What the control flow enforces (either engine)

These live in `runCampaign`, not in any role prompt, so they hold no matter what the model does:

- **Similarity gate** — `fingerprintSimilarity` implements `rubrics/statistics.md` §2 verbatim
  (including the trigram-cosine text term); candidates are rejected mechanically, never by the
  Smith's self-assessment.
- **Blind panel split** — per `scoring.blind_fraction`, blind judges receive inputs with the
  Smith's hypothesis (`expected_ideal_path`, `likely_failure_risks`) and the Simulator's
  derivations (`ideal_path`, `divergence`) stripped; each round reports the blind-vs-sighted
  delta as the hypothesis-anchoring diagnostic.
- **CONFIRMED requires L1+** — verify over an L0 finding is clamped to UNCERTAIN
  (`rubrics/fidelity-ladder.md` rule 7).
- **Post-score promotion** — L2 promotion runs *after* judging so `highest-risk-first` ranks on
  observed severity/consensus; each promoted scenario's L0 predictions are reconciled against
  the executed trace (re-observed → upgraded, contradicted → REFUTED, ladder rules 5–6).
- **Two-condition stopping** — the dry streak only advances when no new cluster appeared *and*
  the top clusters' cells meet `min_samples_per_cell`; a zero-accept round stops as
  "generator dry."
- **Evidence loop-back** — Skeptic `needs-more-evidence` verdicts trigger one targeted L2 pass
  on the gated clusters' representatives, then re-cluster and re-gate the plan.
- **Honest-significance cap** — `plan.evidence_confidence` is capped at `directional` when the
  stopping rule didn't fire or judge agreement < 0.8 (`rubrics/statistics.md` §6).

## Run a real campaign (Workflow tool)

The Workflow tool executes a script that uses the `agent()`/`pipeline()` globals. To wire the
`workflowEngine`, each role method wraps an `agent()` call whose prompt is the matching
`roles/NN-*.md` file and whose `schema` is the matching `schemas/*.schema.json`:

| Control-flow step | Role prompt | Output schema | Suggested Workflow primitive |
|---|---|---|---|
| characterize | `roles/01-cartographer.md` | `target-profile` | single `agent()` (once) |
| generate | `roles/02-scenario-smith.md` | `scenario[]` | one `agent()` per mode (`parallel`) |
| run | `roles/03-run-simulator.md` | `trace` | `pipeline` stage 1 (per scenario) |
| score | `roles/04-trace-judge.md` | `score` | `pipeline` stage 2, `parallel` over N judges |
| verify | `roles/04` (Verify mode) | updated `verify_status` | `parallel` refuters per finding |
| cluster | `roles/05-root-cause-analyst.md` | `cluster[]` | barrier `agent()` |
| plan | `roles/06-remediation-planner.md` | `plan` | single `agent()` |
| skeptic | `roles/07-skeptic.md` | gated `plan` | single `agent()` |
| regression | `roles/08-regression-warden.md` | `regression` | single `agent()` |

The canonical fan-out shape is `pipeline(scenarios, simulate, score, verify)` so each scenario
flows through independently, with an adversarial `parallel` verify per finding — exactly the
pattern in the Workflow tool's docs. The offline stand-ins document the precise I/O each
`agent()` must produce, so you can port one method at a time and diff against the deterministic
baseline.

## Swapping in your target's adapter

`runCampaign({ config, engine, adapter })` takes the adapter as a parameter. Replace
`makeSimulationAdapter()` with your own object implementing `describe()` and (for real fidelity)
`simulate()` / `execute()` per `../adapters/ADAPTER_CONTRACT.md`. See
`../adapters/example-cli-adapter.md` for a real `execute()` and
`../adapters/example-simulation-adapter.md` for a mechanism harness.

## Determinism

No `Date.now()` / `Math.random()` — a seeded PRNG drives all variation and a fixed `now` stamps
artifacts. Same config + same adapter ⇒ byte-identical artifacts, so a real (LLM) run can be
diffed against the deterministic baseline and regressions in the *harness* are distinguishable
from changes in the *target*.
