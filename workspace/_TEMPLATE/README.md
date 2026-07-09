# Campaign workspace template

Copy this whole directory to `workspace/<your-campaign-id>/` to start a campaign. The runner
(and the by-hand playbook) populate it as the campaign proceeds.

```
<campaign-id>/
  profiles/                 # optional: pinned target profiles / adapter config for this campaign
  memory/                   # append-only campaign memory (large-context, survives all rounds)
    target_profile.json         # Cartographer output (one, stamped with captured_at)
    scenario_fingerprints.jsonl # every accepted scenario's fingerprint — the non-repetition history
    long_term_findings.jsonl    # append-only findings across all rounds
    score_timeseries.jsonl      # append-only per-scenario score trend
    issue_clusters.json         # ranked clusters (the one aggregate rewritten each round)
    regression_watchlist.json   # cumulative fragile domains (carries into future campaigns)
  runs/
    <date>-run-NNN/         # one directory per run
      config.json  scenarios.jsonl  traces.jsonl  scores.jsonl
      raw_traces/<scenario_id>.*   # full captured/simulated traces
      plan.json  regression.json  summary.md
  patches/                  # optional: candidate / accepted / rejected change sets for the plan
```

**Append-only rule:** never overwrite `*.jsonl` in `memory/` — only append. `issue_clusters.json`
and `regression_watchlist.json` are the only files rebuilt in place. This is what lets the
context window hold the whole campaign history and lets non-repetition span rounds and campaigns.

See `../example-campaign/` for a fully-populated worked example produced by `runner/whetstone.workflow.js`.
