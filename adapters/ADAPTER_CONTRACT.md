# The Target Adapter Contract

An **adapter** is the only target-specific code in Whetstone. Everything else — roles, modes,
schemas, rubrics, runner — is agnostic. The adapter translates between the kit and one concrete
agent under test. Swap the adapter and the same methodology polishes a different agent.

An adapter exposes up to three capabilities. Which ones it implements determines the **maximum
fidelity** the kit can reach for that target (`rubrics/fidelity-ladder.md`).

## Interface

```
describe()            -> TargetDescription     // required — feeds the Cartographer (L0)
simulate(scenario)    -> RawTrace | null       // optional — helps predict L0/L1 traces
execute(scenario)     -> RawRun                 // optional — real run, enables L2/L3
```

The runner treats these as async and tolerant: any may be absent. The reference runner ships a
JS shape (`runner/whetstone.workflow.js` expects an object with these methods), but the contract
is language-agnostic — an adapter can be a shell wrapper, an HTTP client, or a doc reader.

### `describe() -> TargetDescription` (required)
Returns the raw material the Cartographer turns into a `target-profile`:
```jsonc
{
  "target_name": "string",
  "version": "string",
  "system_prompts": ["orchestrator prompt text", "subagent prompt text", ...],
  "tools": [ { "name", "kind", "purpose", "owner", "gated_by", "input_schema?" } ],
  "routing_rules": "the routing table / dispatch logic, as text or structured",
  "guards": ["loop-guard: read 40 / write 2", "input validator: ...", ...],
  "constraints": { "call_budget": null, "output_char_limit": 50000, "max_turns": 25 },
  "known_outages": ["SOURCE-2"],
  "source_precedence": ["telemetry", "directory", "free-text-note"]
}
```
Fidelity ceiling with only `describe()`: **L0** (design predictions).

### `simulate(scenario) -> RawTrace | null` (optional)
May run isolated pieces of the target — a guard/validator function, an input sanitizer, a single
tool handler — against crafted inputs, and return what happened. This is how a finding earns
**L1**: a mechanism was actually executed, even though the whole agent was not. Return `null` for
scenarios this adapter can't partially execute; the Simulator falls back to pure L0 reasoning.

### `execute(scenario) -> RawRun` (optional)
Drives the **whole** target on the scenario's `prompt` (+ `injected_context`) and returns the
real run:
```jsonc
{
  "final_answer": "the target's user-facing output, verbatim",
  "steps": [ { "actor", "action", "tool", "args_shape", "output_shape", "ts?" }, ... ],
  "tool_calls": 7, "turns": 9, "wall_ms": 4200, "tokens": 15300,
  "raw_log_path": "where the full transcript was written"
}
```
Fidelity with `execute()`: **L2**. If `execute()` runs against real backends/live data, the
operator declares it **L3** in the run-config; the adapter itself need not know the difference.

## Safety rules for adapters (read before writing an `execute()`)

1. **Read-only by default.** An `execute()` that can trigger the target's *write/destructive*
   actions must be explicitly opted into by the operator, and should default those actions off
   (dry-run/gate them). Testing an agent must never cause the agent to change production state.
2. **Isolation.** Prefer a dev/sandbox instance, a test tenant, or mocked backends. If you must
   hit real systems, scope credentials to least privilege and rate-limit.
3. **`injected_context` is untrusted by construction.** The adapter feeds it to the target as
   tool/external data — never as a privileged channel. (Its whole purpose is testing whether the
   target treats it as data.)
4. **Capture, don't sanitize.** The adapter records what the target actually did, warts and all.
   Judging happens later; the adapter must not "help" the target look better.
5. **Determinism aids reproduction.** Pin model/version/seed where the target allows it, and
   record them in the raw log, so an L2 finding can be re-run.

## Choosing a fidelity strategy

| Adapter implements | Max fidelity | Good for |
|---|---|---|
| `describe()` only | L0 | Fast, zero-plumbing broad sweeps; design review |
| `describe()` + `simulate()` | L1 | Confirming guard/validator/tool-contract mechanisms |
| `describe()` + `execute()` | L2 | Emergent-behavior truth; the sampled real runs in a hybrid campaign |
| `execute()` against live backends | L3 | Catching data/schema drift and real integration failure |

Hybrid campaigns (the recommended default) implement all of `describe`/`simulate`/`execute`,
run everything at L0/L1, and promote a sample to L2/L3. See `adapters/example-cli-adapter.md`
for a worked `execute()` and `adapters/example-simulation-adapter.md` for a describe-only one.
