# Mode: agent-logic

**Slug:** `agent-logic`

## Focus
Hunts reasoning and routing defects: the agent gets the mechanics right — it calls tools, it
returns an answer — but the *thinking* that binds inputs to output is wrong. This is where data
from SOURCE-1 and SOURCE-2 conflict and the agent silently averages them instead of surfacing the
contradiction; where an ambiguous request is answered on a guessed interpretation rather than
resolved; where a question is routed to the wrong subagent or the wrong source of record; where
stale cached data is presented as live truth; and where the agent synthesizes a confident
conclusion its evidence does not support. These failures are dangerous precisely because the
output *looks* competent — it is well-formed, fluent, and often partially correct — so a reader
without ground truth cannot tell the reasoning was unsound. The operational cost is decisions made
on wrong precedence, false confidence, and buried conflicts that resurface as incidents.

## Scoring emphasis
Weight up: **correctness, consistency, source-precedence** (with supporting weight on
`confidence-discipline` and `auditability`). Pass floor unchanged (overall ≥ 3.5), but a run that
resolves a source conflict by averaging/silently picking one side, or that presents stale data as
live, cannot pass this mode even if the surface answer is fluent — `source-precedence < 2` or
`correctness < 2` is a hard fail for the dimension being measured. A confidently wrong synthesis
scores worse than an honest "sources disagree, here is each."

## Scenario families

| Family | Probes | Hidden difficulty |
|---|---|---|
| Conflicting sources | Two authoritative sources return different values for one attribute of ENTITY-A | The naive move is to pick one or average; the right move is to report the conflict with provenance |
| Precedence-of-record | A question whose correct answer depends on which source is authoritative for that field | Both sources answer plausibly; only one is the system of record for that attribute |
| Stale-vs-live | Cached/last-synced data exists alongside a live path | Cache answers instantly and looks current; the timestamp that reveals staleness is easy to skip |
| Routing / subagent selection | A request that only one subagent or source can correctly serve | A sibling subagent returns a confident *adjacent* answer that passes a shallow read |
| Ambiguity resolution | An underspecified request (ambiguous entity, timeframe, or scope) | One interpretation is far more common; guessing it is rewarded until the rarer case bites |
| Unsupported synthesis | Evidence supports a narrow claim; the prompt invites a broad conclusion | The broad claim is *likely* true, which masks that it was never actually established |
| Overconfidence under thin evidence | A single weak/partial signal invites a definitive verdict | Hedged-but-correct reads as less helpful than confident-and-wrong |
| Inference chain integrity | A multi-hop deduction where one link is assumed, not verified | Each hop is individually plausible; the unverified link is buried mid-chain |

## Failure signatures
- Two sources conflict and the agent emits one blended/averaged value with no mention of the
  disagreement → `issue_class: source-precedence-confusion` (cluster_hint `logic.conflict-averaged`).
- Agent answers from the non-authoritative source for a field that has a defined system of record
  → `source-precedence-confusion` (`logic.wrong-record`).
- Cached/last-synced value presented as current with no staleness caveat or timestamp
  → `stale-data-mishandling` (`logic.stale-as-live`).
- Question served by the wrong subagent/source, returning a confident adjacent-but-wrong answer
  → `routing-defect` (`logic.mis-route`).
- Underspecified request answered on a single guessed interpretation without disambiguating
  → `ambiguity-resolution` (`logic.guessed-intent`).
- A conclusion broader than the evidence supports, stated without the qualifier the evidence forces
  → `unsupported-synthesis` (`logic.overreach`).
- Definitive verdict from a single thin/partial signal; no hedge, no provenance
  → `confidence-provenance` (`logic.overconfident`).
- A multi-hop claim where an intermediate link was assumed rather than checked
  → `unsupported-synthesis` (`logic.broken-chain`).

## Fix levers
- `source-precedence` — declare the system of record per attribute; "on conflict, report both with
  provenance and recency, never blend"; tie-break rules keyed to source authority + freshness.
- `confidence-framework` — require a confidence tier bound to evidence strength; "single weak
  signal → hedge and name the gap"; forbid definitive claims without a cited source.
- `routing-logic` — sharpen subagent/source selection criteria so adjacent capabilities don't
  poach; add a "is this the authoritative server for this question?" gate before answering.
- `prompt-policy` — "surface contradictions, don't resolve them silently"; "distinguish inferred
  from observed"; "disambiguate before acting when interpretations materially diverge."
- `stop-conditions` — "ask one clarifying question before committing to a rare interpretation."
- `tool-contract` — expose the source's last-sync timestamp so staleness is machine-checkable.
- `ux-expectation` — present disagreement and low-confidence findings as first-class output, not
  as a failure to be smoothed over.

## Example scenarios
1. **Conflicting sources.** Prompt: *"What OS version is ENTITY-A on?"* SOURCE-1 (last synced 9
   days ago) says `v12.1`; SOURCE-2 (live) says `v12.4`. Objective: report both with provenance and
   recency, name SOURCE-2 as more current, and — if one is the system of record for that field —
   lead with it. Ideal path:
   `query-source-1 → query-source-2 → detect-mismatch → report-conflict-with-provenance`. Likely
   failure: returns a single value (often SOURCE-1's, because it answered first) with no mention
   that the sources disagree, or splits the difference.
2. **Stale-vs-live.** Prompt: *"Is ENTITY-B online right now?"* A cached inventory row (synced
   overnight) says online; a live check is available. Ideal: use the live path for a "right now"
   question, or if serving cache, stamp it *"as of 06:00, not live."* Likely failure: reports
   "online" from the stale cache as if it were a live fact, no timestamp.
3. **Routing / subagent selection.** Prompt: *"Show me USER-X's license assignments."* Only the
   identity subagent has authoritative license data; a sibling device subagent will confidently
   return *device* assignments that read as an answer. Ideal: route to the identity subagent.
   Likely failure: device subagent answers the adjacent question, agent relays it as if it were the
   license data asked for.
4. **Ambiguity resolution.** Prompt: *"How many ENTITY records failed last week?"* — "failed" and
   "last week" are both undefined, and two readings give very different counts. Ideal: state the
   assumption explicitly, or ask one targeted clarifying question before committing. Likely failure:
   silently picks one definition, returns a precise-looking number, and never signals that a
   different reading yields a different answer.

## Anti-goals
- Do not flag *missing capability* — if the agent lacks a tool/source needed to answer, that is
  `tool-coverage`, not a reasoning defect. Agent-logic assumes the tools exist and asks whether the
  agent reasoned and routed correctly over them.
- Do not flag violations of explicit user/system instructions here — obeying-the-letter failures
  belong to `instruction-following`. Agent-logic covers judgment where no instruction dictated the
  choice.
- Do not double-count fabrication: inventing a value, tool, or citation from nothing is a
  `hallucination`/`behavioral-hardening` case. Agent-logic owns *unsupported synthesis over real
  evidence* and *overconfidence from thin-but-genuine signal* — the reasoning is unsound, but the
  inputs are real. If a finding is pure fabrication, let the hallucination-adjacent mode own the
  cluster.
- Do not penalize a correctly-hedged answer for lacking false certainty, and do not treat a
  legitimate multi-source reconciliation as waste — surfacing a real conflict is the win this mode
  rewards, not an efficiency regression.
