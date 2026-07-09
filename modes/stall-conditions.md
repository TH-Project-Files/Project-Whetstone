# Mode: stall-conditions

**Slug:** `stall-conditions`

## Focus
Hunts runs that don't terminate cleanly — or nearly don't. Where `efficiency` measures waste on a
run that *does* finish, this mode measures the failure to finish at all: infinite and
near-infinite loops, retry loops hammering a failing or empty source, dead-source rechecks that
never learn, over-expansion that keeps widening without converging, max-turn/budget exhaustion,
subagent handoff ping-pong, pagination that never reaches an end, and the inability to stop
cleanly on a request that is unanswerable or under-specified. The operational cost is the worst
kind: a run that consumes its entire turn/token budget and returns nothing usable, or a wedged
worker that must be killed. Unlike inefficiency, a stall often produces *no* answer — the agent
never reaches the synthesis step at all — which is why a missing or wrong stop condition is more
dangerous than a merely expensive path.

## Scoring emphasis
Weight up: **stall-resistance, robustness, efficiency**. Pass floor raised: a run that fails to
terminate within budget, or that only terminates because an external loop-guard/max-turn ceiling
fired, cannot pass this mode regardless of correctness — reaching a correct answer on turn 48 of a
50-turn ceiling is a near-stall, not a pass. Any run with `stall-resistance < 3` fails the
dimension; a hard non-termination (budget exhausted, worker killed) caps `stall-resistance` at 1.

## Scenario families

| Family | Probes | Hidden difficulty |
|---|---|---|
| Empty-source retry | A query whose source legitimately returns zero rows | "Empty" reads as "try again / try harder" instead of a valid terminal answer |
| Dead-source recheck | A source declared down that the agent keeps re-probing | No memory of the failed probe; each recheck looks fresh |
| Unanswerable stop | A request no available tool/source can satisfy | Agent widens the search forever rather than declaring it unanswerable |
| Convergence-free expansion | An open-ended "find everything about X" with no natural bound | Each result spawns new leads; nothing tells it when "enough" is reached |
| Pagination without end | A cursor/next-page source whose end is signalled subtly (or never) | Missing or misread end-of-pages sentinel drives an unbounded page walk |
| Handoff ping-pong | Two subagents (or a tool + subagent) that each defer to the other | Neither holds the stop authority; the task bounces indefinitely |
| Budget/turn brink | A legitimately large task run near the max-turn/token ceiling | Does it degrade gracefully and return partial, or crash into the ceiling? |
| Retry-storm on transient error | A tool that fails with a retriable error every time | No backoff cap; retries escalate instead of conceding |

## Failure signatures
The concrete, observable symptoms in a trace that indicate this weakness. Each maps to an
`issue_class` from `schemas/finding.schema.json`.

- Same tool call repeated against a source after it returned empty, with no changed inputs → `insufficient-stop-condition` (cluster `stall.empty-source-retry`).
- Re-probing a source the profile/outage state lists as down, across multiple turns → `insufficient-stop-condition` / `stale-data-mishandling` (`stall.dead-source-retry`).
- Search that keeps broadening (new entities/leads each round) without a convergence or "enough" test → `insufficient-stop-condition` (`stall.no-convergence`).
- Pagination loop with no end-of-pages check, or one that ignores the terminal cursor → `weak-tool-contract` / `insufficient-stop-condition` (`stall.pagination-unbounded`).
- Subagent A delegates to B which re-delegates to A (or a tool and subagent bounce a task) → `routing-defect` / `escalation-failure` (`stall.handoff-pingpong`).
- Run terminates only because an external max-turn / loop-guard / budget ceiling fired → `insufficient-stop-condition` (`stall.budget-exhaustion`).
- Retriable-error retries with no cap or backoff, count climbing every turn → `insufficient-stop-condition` (`stall.retry-storm`).
- Request is unanswerable by any available capability, yet no "cannot answer / need X" terminal is emitted → `escalation-failure` (`stall.no-clean-stop`).

## Fix levers
Keyed to a `fix_locus` from `schemas/plan.schema.json`. Hints for the Planner, not a mandate.

- `stop-conditions` — the primary lever: N-empty-round stop; per-task turn/call budget with a *graceful* degrade-to-partial exit; "treat empty as a valid terminal answer"; "consult outage/failed-probe state before any recheck"; retry cap + backoff ceiling; an explicit convergence test ("stop when a round adds no new in-scope results").
- `routing-logic` — assign single stop authority for a delegated task; forbid re-delegation back to the caller; collapse tool↔subagent bounce into one owner.
- `tool-contract` — expose an explicit end-of-pages sentinel / total-count so pagination can terminate; make tools return a distinguishable "empty vs error vs down" status so retry logic can branch correctly.
- `escalation-failure` remedies via `ux-expectation` — define the clean "I cannot answer this because …; here is what I would need" terminal so an unanswerable request stops instead of looping.
- `prompt-policy` — "empty is an answer, not a signal to retry"; "declare unanswerable rather than widen indefinitely"; "never re-probe a source flagged down this run."
- `new-tool` — a shared failed-probe/outage cache so dead-source rechecks are cheap to suppress across subagents.

## Example scenarios
1. **Empty-source retry.** Prompt: *"List open incidents for ENTITY-A in SOURCE-1."* State:
   ENTITY-A legitimately has zero open incidents. Ideal path: query once, report "no open
   incidents" as the terminal answer. Likely failure: agent reads empty as "I must be querying
   wrong," retries with permuted filters 6+ times, then exhausts budget without ever answering.
2. **Dead-source recheck.** Profile lists SOURCE-2 as down. Prompt: *"Cross-check ENTITY-B across
   all sources."* Ideal: skip SOURCE-2 citing cached outage state, answer from SOURCE-1/3, note the
   gap. Likely failure: agent re-probes SOURCE-2 every turn, each probe timing out, until the
   turn ceiling fires and the run dies with no synthesis.
3. **Handoff ping-pong.** Orchestrator delegates "resolve USER-X's access" to the identity
   subagent, which decides it's an entitlement question and hands back; the orchestrator re-routes
   it to identity. Ideal: one owner resolves or emits a clean "needs SOURCE-3 which is
   unavailable" terminal. Likely failure: the task bounces between the two until max-turns.
4. **Unanswerable stop.** Prompt: *"What did ENTITY-C do before it was onboarded?"* — data that
   predates every available source. Ideal: state plainly that no source covers the pre-onboarding
   window and stop. Likely failure: agent widens to adjacent entities and time ranges round after
   round, never converging, never conceding.

## Anti-goals
- Do **not** flag a run that terminated cleanly but wastefully — redundant calls, over-gathering,
  or context flooding on a run that *did* finish belong to `efficiency`. This mode owns the
  cluster only when termination itself failed or nearly failed.
- Do not penalize a legitimately long task that makes steady, converging progress and finishes
  within budget — length is not a stall; non-convergence is.
- Do not flag a *single* justified retry after a transient error, or a bounded backoff that
  concedes on schedule — that is correct robustness, not a retry storm.
- Do not treat a graceful degrade-to-partial near the budget ceiling as a failure; returning a
  well-flagged partial answer before exhaustion is the *desired* behavior this mode rewards.
- A stall that also mishandles precedence or picks the wrong source is scored here for the
  non-termination; the precedence error itself is `source-precedence` / `agent-logic` territory.
