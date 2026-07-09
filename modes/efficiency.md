# Mode: efficiency

**Slug:** `efficiency`

## Focus
Hunts wasted work: tasks that should be cheap but aren't. Redundant tool calls, duplicate
parallel dispatches, schema/tool discovery in production, over-expansion of a simple request,
context flooding, and expensive fallback loops. The operational cost of an inefficient agent is
latency, token spend, and — at the extreme — worker exhaustion on wide tasks. Efficiency
failures rarely produce a *wrong* answer, which is exactly why they go unnoticed until they
dominate cost.

## Scoring emphasis
Weight up: **efficiency, tool-economy, stall-resistance**. Pass floor unchanged (overall ≥ 3.5),
but a run with `efficiency < 2` cannot pass this mode regardless of correctness — a right answer
reached wastefully still fails the dimension being measured.

## Scenario families

| Family | Probes | Hidden difficulty |
|---|---|---|
| Trivial-should-be-cheap | A one-fact lookup that a fast-path/aggregate tool answers in ≤2 calls | Tempting adjacent data invites over-gathering |
| Expansion bait | A request phrased to invite investigating the whole fleet/corpus when a scoped answer suffices | The scope creep reads as "thoroughness" |
| Known-outage economy | A task where one source is declared down | Does it consult cached outage state or retry the dead path? |
| Duplicate-dispatch | A question two layers/subagents could each answer | Orchestrator may dispatch both in parallel and reconcile identical data |
| Aggregate-vs-iterate | "Do X for each of N items" where an aggregate tool exists | Per-item iteration is the naive path; the aggregate is the right one |
| Pagination discipline | A large result set with a sane cap | Naive full-pull floods context or trips truncation |

## Failure signatures
- Repeated identical or near-identical tool calls → `issue_class: cost-explosion` (annotation `duplicate-work`).
- Tool/schema discovery calls in a production path → `cost-explosion` (`schema-discovery`).
- Per-item loop where a batch/aggregate tool exists → `cost-explosion` / `weak-tool-contract` (`unnecessary-call`).
- Retry against a source the profile lists as down → `insufficient-stop-condition` (`retry-loop`).
- Full-corpus pull that floods context or truncates → `cost-explosion` (`truncation`).
- Both a fast-path bridge tool *and* a full delegation fired for the same answer → `routing-defect`.

## Fix levers
- `stop-conditions` — per-task call budget; "consult outage cache before retry"; N-empty-round stop.
- `tool-contract` — add/expose an aggregate tool so iteration is unnecessary; add row caps.
- `routing-logic` — route to the fast-path bridge tool before full delegation; dedupe dispatch.
- `prompt-policy` — "aggregate-first for fleet/corpus questions"; "don't re-query without a discrepancy."

## Example scenarios
1. **Trivial-should-be-cheap.** Prompt: *"Is ENTITY-A currently compliant?"* Objective: reach the
   answer in ≤2 calls via the single-entity fast path. Ideal path:
   `resolve-subject → single-entity-status → answer`. Likely failure: agent pulls full inventory
   from three sources and diffs them for a one-entity question.
2. **Known-outage economy.** Profile says SOURCE-2 is down. Prompt: *"Give me ENTITY-B's status
   from SOURCE-2."* Ideal: state the outage from cached state, offer SOURCE-1 fallback, don't call
   SOURCE-2. Likely failure: repeated retries against the dead source until a timeout/loop-guard.
3. **Aggregate-vs-iterate.** Prompt: *"Which of these 40 items have property P?"* Ideal: one
   batch/aggregate call. Likely failure: 40 single-item calls (or per-item fan-out that exhausts
   the worker).

## Anti-goals
- Don't flag *necessary* multi-source work as waste — a genuine cross-source reconciliation is not
  inefficiency (that's `agent-logic`/`source-precedence` territory).
- Don't reward terseness that drops required caveats — that's a `clarity` regression, not an
  efficiency win.
- A stall/loop that *also* wastes calls is primarily a `stall-conditions` finding; record the
  waste but let the stall mode own the cluster to avoid double-counting.
