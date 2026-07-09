# Whetstone

**A project-agnostic, closed-loop methodology for polishing agentic systems.**

Point Whetstone at any agent, pick the dimensions you want to improve, and it runs a disciplined
campaign that fuzzes out where the agent is actually weak — at the closest-to-real fidelity your
setup allows — then hands you a prioritized, low-regression-risk improvement plan and a regression
pack to guard the fixes. It is built to earn *high-confidence prioritization*, not to produce a
flattering "looks good to me."

A whetstone doesn't add anything to a blade. It removes what shouldn't be there, a little each
pass, until the edge is true. Same idea here: fold the agent back on itself in a closed
critic↔planner loop, grind down the real flaws, and leave every prior improvement protected.

---

## What's in the box

| Directory | What it holds |
|---|---|
| `METHODOLOGY.md` | The scientific core: the eight disciplines and the honest-significance rules. **Read this second.** |
| `roles/` | The nine closed-loop role prompts (Controller, Cartographer, Scenario Smith, Run Simulator, Trace Judge, Root-Cause Analyst, Remediation Planner, Skeptic, Regression Warden). Model-agnostic. |
| `modes/` | Eight modular dimension packs you toggle per campaign + a `_MODE_TEMPLATE` to add your own. |
| `schemas/` | Ten JSON-Schema data contracts — the backbone that keeps every artifact machine-checkable. |
| `rubrics/` | The numbers: scoring `axes`, `weighting`, the `fidelity-ladder`, and `statistics` (sampling, agreement, convergence). |
| `adapters/` | The only target-specific boundary. A contract + two worked examples (CLI execution, simulation/mechanism). |
| `seed-imports/` | How to blend in scenarios from other providers' models or historic incidents — normalized, curated, deduped. |
| `playbooks/` | `RUN_A_CAMPAIGN` (the operator's steps) and `STONE_POLISHING` (the closed-loop discipline). |
| `runner/` | A reference runnable orchestration (a Claude Code Workflow script) that automates a full campaign. |
| `workspace/` | Per-campaign local files (append-only memory + run artifacts). `_TEMPLATE/` to copy, `example-campaign/` to learn from. |

---

## The loop in one picture

```
characterize → generate → run(sim + sampled real) → score(panel) → verify(refute) →
cluster → plan(smallest fix) → skeptic-gate → regression-pack → implement → re-measure → repeat
                                    ▲                                                        │
                                    └──────────── until new looks stop revealing new flaws ──┘
```

Two ideas do most of the work:
1. **The fidelity ladder** — every finding is tagged by *how* it was observed (design prediction →
   isolated mechanism → real end-to-end run → live run). Predictions stay labeled as predictions;
   the scary ones get executed before they drive any change. (`rubrics/fidelity-ladder.md`)
2. **Non-repetition** — every scenario is fingerprinted and deduped against all history, so a
   campaign never repeats a question and coverage is a countable fact. (`rubrics/statistics.md`)

Everything else — panels of independent judges, adversarial verification, root-cause clustering,
the Skeptic gate, honest significance language — exists to keep a self-improving loop from
flattering itself. (`playbooks/STONE_POLISHING.md`)

---

## 5-minute quickstart

1. **Write an adapter** for your target (`adapters/ADAPTER_CONTRACT.md`). Minimum: `describe()`.
   Add `execute()` for real-run (L2) fidelity, `simulate()` for mechanism (L1) checks.
2. **Copy the workspace template**: `workspace/_TEMPLATE/` → `workspace/<campaign_id>/`.
3. **Write a run-config** (`schemas/run-config.schema.json`): pick 1–3 modes, set the fidelity
   sample rate, judges, and stopping rule. A good first trio: `efficiency`, `agent-logic`,
   `security`.
4. **Run it** — either drive the role prompts by hand per `playbooks/RUN_A_CAMPAIGN.md`, or launch
   `runner/whetstone.workflow.js` (see `runner/README.md`).
5. **Read the output** under `workspace/<campaign_id>/runs/<run_id>/`: the coverage matrix, ranked
   clusters, the Skeptic-gated plan, and the regression pack. Confidence is labeled honestly —
   *directional*, *high-confidence*, or (rarely) *significant*.

---

## Design principles

- **Agnostic by construction.** The kit hard-codes nothing about any specific agent. All
  target-specific code lives in one adapter file; swap it to polish a different agent.
- **Modular dimensions.** Improve only what you choose to — efficiency, tool coverage, agent
  logic, stall conditions, security, behavioral hardening, prompt-injection resistance,
  instruction following — or any combination.
- **Evidence over impressions.** Machine-checkable schemas, multi-axis scores, fidelity tags,
  adversarial verification, and a real stopping rule.
- **Never repeat, never regress.** Fingerprinted scenarios and a cumulative watchlist mean each
  campaign asks new questions and protects old wins.
- **Honest about its limits.** It tells you when the evidence is only directional and refuses to
  say "significant" without repeated trials.

## Glossary

- **Campaign** — one end-to-end polishing run against one target, made of one or more rounds.
- **Round** — one generate→run→score→cluster cycle within a campaign.
- **Mode** — a dimension lens (`modes/*.md`) that shapes what's generated and how it's weighted.
- **Adapter** — the target-specific shim implementing `describe`/`simulate`/`execute`.
- **Fidelity (L0–L3)** — how directly a datum was observed.
- **Finding → Cluster → Plan item** — a single defect → its root-cause group → the fix for it.
- **Convergence** — the point where new scenarios stop revealing new clusters and samples suffice.

Not a specific-agent tool and not a benchmark leaderboard. It's a method — a disciplined way to
find what to fix, fix the right thing, and prove you didn't break anything else.
