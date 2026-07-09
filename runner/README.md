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
  raw_traces/<scenario_id>.json
  plan.json  regression.json  summary.md
```
Run it twice with the same `campaign_id`: the second run's round log shows scenarios rejected by
the fingerprint gate — proof the non-repetition engine works across runs.

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
