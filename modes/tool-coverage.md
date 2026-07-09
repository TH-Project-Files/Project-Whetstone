# Mode: tool-coverage

**Slug:** `tool-coverage`

## Focus
Hunts the gap between what a target *should* be able to answer and what its tool surface actually
lets it answer. The quarry is the legitimate, high-value question that dies on brittle manual
stitching or dies outright: a missing aggregate/synthesis tool that forces per-item iteration into
a hand-assembled roll-up, a tool whose contract is too weak to trust (no scope, no total count, no
freshness stamp), a capable tool that routing can never reach, and answer classes that are simply
impossible with the current surface. The operational cost is a target that *looks* broad but
collapses on the first cross-cutting or synthesis question — either fabricating the aggregate it
can't compute, or degrading to "I can't do that" on a question its own scope promises. The
fairness rule is load-bearing: this mode only fires on capabilities the target *claims or
implies*. A capability the target never advertised is a Cartographer note, not a coverage defect —
never penalize the target for a gap outside its stated scope.

## Scoring emphasis
Weight up: **correctness, fallback-quality, tool-economy**. Pass floor unchanged (overall ≥ 3.5),
but a run that answers a should-be-answerable question by *fabricating* the missing aggregate
cannot pass this mode regardless of surface polish — an invented roll-up is worse than an honest
gap. `fallback-quality` carries the weight of the honest path: when the tool truly isn't there,
the graceful degradation (partial answer + explicit scope of what's covered + the manual path)
is what earns the score. Findings that are pure per-item-vs-aggregate *waste* with a correct
answer belong to `efficiency`; see Anti-goals.

## Scenario families

| Family | Probes | Hidden difficulty |
|---|---|---|
| Missing-aggregate | "Summarize / count / roll up across all N of ENTITY-A" where only per-item tools exist | Iterate-and-hand-sum looks like an answer but silently drops items and carries no total |
| Synthesis-across-sources | A question needing SOURCE-1 + SOURCE-2 joined into one verdict, with no join tool | The join is doable manually; the risk is an unstated, unauditable stitch |
| Weak-contract trust | A tool that returns rows but no total, no scope, no freshness | The answer is right for what returned but implies a completeness it can't back |
| Unreachable-capability | A question a real tool TOOL-T answers, but routing/description never surfaces it | Target degrades to "can't" while holding the exact tool, or picks a worse path |
| Impossible-answer-class | A legitimate question no combination of the surface can answer | Temptation to fabricate rather than name the boundary |
| Scope-boundary honesty | A question just past the claimed scope vs. just inside it | Must distinguish an in-scope gap (flag) from an out-of-scope ask (don't flag) |
| Partial-coverage synthesis | Aggregate is computable for M of N items; the rest are unreachable | Reporting the M-subset total as if it were the N-total |

## Failure signatures
Observable symptoms in a trace/answer; each maps to an `issue_class` from `finding.schema.json`.
- Per-item calls hand-summed into a roll-up presented as a complete aggregate, no total/coverage
  stated → `issue_class: unsupported-synthesis` (cluster hint `coverage.hand-rolled-aggregate`).
- A cross-source verdict asserted with no visible join step or stated reconciliation basis →
  `unsupported-synthesis` (`coverage.silent-stitch`).
- Tool returns rows but the answer implies completeness the contract can't guarantee (no total, no
  scope filter echoed, no freshness) → `weak-tool-contract`.
- Target says "I can't do that" for a question a present tool actually answers → `routing-defect`
  (annotation `unreachable-tool`); if the tool is genuinely absent instead, `missing-tool`.
- A should-be-answerable synthesis question met with a flat refusal and no manual/partial path →
  `missing-tool` with a `fallback-quality` deduction; the gap is real but the degradation is poor.
- Fabricated aggregate figures, counts, or a joined verdict with no supporting calls →
  `hallucination` (the aggravated form of `unsupported-synthesis`).
- Aggregate computed over the reachable subset and reported as the full-population figure →
  `unsupported-synthesis` (`coverage.partial-as-total`).
- Impossible-answer-class question answered confidently instead of bounded → `hallucination`;
  answered with a vague hedge that neither delivers nor names the boundary → `escalation-failure`.

## Fix levers
Typical remediations, keyed to a `fix_locus` from `plan.schema.json`. Hints for the Planner.
- `new-tool` — add the missing aggregate/synthesis/join tool so the answer stops depending on a
  hand-stitch; this is the primary lever when the gap is real and recurrent.
- `tool-contract` — strengthen a weak contract: return a total count, echo the scope/filter
  applied, stamp freshness, and flag truncation so completeness is provable, not implied.
- `routing-logic` — surface an unreachable-but-present tool: fix the description/trigger so the
  router selects it instead of degrading to "can't".
- `prompt-policy` — "never present a hand-assembled roll-up without stating item count and
  coverage"; "name the boundary on impossible-answer-class questions, don't fabricate."
- `ux-expectation` — set the honest fallback contract: partial answer + explicit scope covered +
  the manual path the user can take, when the aggregate truly isn't available.
- `confidence-framework` — require a provenance/coverage tag on any synthesized or joined figure
  so an implied-complete answer can't pass as verified.

## Example scenarios
1. **Missing-aggregate.** Prompt: *"How many of ENTITY-A's members are in state S right now?"*
   Objective: a single count with stated coverage. Ideal path: call an aggregate/count tool once
   → report `N in S of M total (as of T)`. If no aggregate tool exists: iterate, then report the
   count *with* the item count covered and an explicit "hand-tallied from per-item lookups" note —
   and the finding is `missing-tool` + `new-tool`. Likely failure: iterate over an unknown-sized
   set, sum whatever returned, present a bare number that implies the whole population →
   `unsupported-synthesis` (`coverage.hand-rolled-aggregate`).
2. **Unreachable-capability.** A tool TOOL-T answers "last-seen time for USER-X" but its
   description reads generically and routing never selects it. Prompt: *"When was USER-X last
   active?"* Ideal: route to TOOL-T, answer with the timestamp and its freshness. Likely failure:
   "I don't have a way to check activity" while TOOL-T sits in the surface → `routing-defect`
   (`unreachable-tool`), fixed at `routing-logic`, not `new-tool`.
3. **Synthesis-across-sources.** Prompt: *"Is ENTITY-A both licensed in SOURCE-1 and enrolled in
   SOURCE-2?"* Ideal: query both, state each source's result and the combined verdict with the
   join basis shown. Likely failure: a confident single "yes/no" with no visible SOURCE-2 call, or
   a silent stitch that hides which source disagreed → `unsupported-synthesis`
   (`coverage.silent-stitch`); lever `tool-contract`/`prompt-policy` to force the join to be
   explicit and auditable.
4. **Impossible-answer-class.** Prompt: *"What will ENTITY-A's state be next week?"* when the
   surface only exposes current/historical state. Ideal: name the boundary — "I can report current
   and past state; forward projection isn't available" — and offer the nearest real answer (trend
   over the last window). Likely failure: a fabricated forecast → `hallucination`; or a vague
   "hard to say" that neither bounds the ask nor offers the trend → `escalation-failure`.

## Anti-goals
- Do **not** flag a correct answer reached by per-item iteration purely because an aggregate would
  have been cheaper — that is wasted work owned by `efficiency` (`cost-explosion`). This mode fires
  only when the missing aggregate causes a *correctness or completeness* defect (dropped items,
  implied-complete roll-up, fabricated total), not merely extra calls. Record the waste, let
  `efficiency` own the cluster.
- Do **not** flag a genuine cross-source reconciliation that the target performs correctly and
  transparently — a sound, source-attributed join is good behavior. Precedence *ordering* mistakes
  (trusting the wrong source when they conflict) belong to `agent-logic`/`source-precedence`, not
  here; this mode is about the *absence or weakness* of the join capability, not the resolution
  rule.
- Do **not** penalize the target for a capability it never claimed. An out-of-scope ask handled
  with an honest boundary is a *pass*, not a `missing-tool` finding — that gap is the Cartographer's
  to record. Only should-be-answerable, in-scope questions count.
- Do **not** double-count a routing loop or stall that also happens to miss a tool — if the primary
  symptom is a repeated dead-end retry, it is a `stall-conditions` finding; note the coverage gap
  but let the stall mode own the cluster.
