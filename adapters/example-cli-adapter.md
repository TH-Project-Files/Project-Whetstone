# Example Adapter: CLI execution (L2)

A worked example of an adapter whose `execute()` drives a whole agent through its command-line
entry point and captures the real trace. This is the pattern that earns **L2** fidelity and
supplies the sampled real runs in a hybrid campaign.

The example targets an agent that (a) exposes a CLI like `tool "<prompt>"`, (b) emits structured
progress to stderr at a debug level (orchestrator/subagent/tool activity), and (c) prints the
final answer to stdout. Many agent CLIs fit this shape; adapt the parsing to yours.

> **Why a CLI adapter is a good L2 source.** A debug-instrumented CLI already prints the
> orchestrator → subagent → tool sequence line by line. That stream *is* the trace — you parse
> it rather than reconstruct it. It also runs the agent's *real* prompt/routing/guards, so it
> catches emergent behavior a design prediction would miss.

## Shape (JS, matches the reference runner's expectations)

```js
// adapters/cli-adapter.js  (you write this per target; keep it OUT of the kit's agnostic core)
import { spawn } from 'node:child_process';

export function makeCliAdapter(cfg) {
  // cfg: { cmd, args, cwd, env, debugLevel, timeoutMs, allowWrites }
  return {
    async describe() {
      // Cheapest correct source of truth is the target's own prompt/manifest/tool files.
      // Read them from disk (or call a `--dump-profile` mode if the target has one) and return
      // the TargetDescription shape from ADAPTER_CONTRACT.md. Do NOT invent — read real files.
      return readTargetProfileFromRepo(cfg.cwd);
    },

    // No cheap in-process mechanism harness here, so simulate() is omitted -> L0 fallback for
    // un-executed scenarios. (A TS target can add simulate() by importing guard functions under
    // tsx and running them on crafted inputs — that earns L1. See example-simulation-adapter.md.)

    async execute(scenario) {
      if (!cfg.allowWrites) assertReadOnly(scenario); // safety rule #1
      const input = buildInput(scenario);             // prompt + injected_context, verbatim
      const { stdout, stderr, ms } = await run(cfg, input, cfg.timeoutMs);
      const steps = parseDebugStream(stderr);         // -> [{actor, action, tool, ...}]
      return {
        final_answer: extractFinalAnswer(stdout),
        steps,
        tool_calls: steps.filter(s => s.action === 'tool_call').length,
        turns: countTurns(steps),
        wall_ms: ms,
        raw_log_path: writeRawLog(scenario.scenario_id, { stdout, stderr }),
      };
    },
  };
}
```

## Mapping the debug stream to trace steps

A typical debug line stream looks like:
```
[Orchestrator] Tool call: <bridge_tool>
[Orchestrator] Spawning subagent: <specialist>
[Subagent:<specialist>] Tool call: <read_tool>
[Subagent:<specialist>] Tool call: <read_tool>        <- duplicate? annotate it
[HITL] Write action detected: "<write_tool>"          <- gate fired
```
Parse each line into a `trace.step`: `actor` from the `[...]` prefix, `action`/`tool` from the
message. The Run Simulator (`roles/03`) consumes these to build `actual_path`, and its annotator
flags `duplicate-work`, `retry-loop`, `stall`, etc. from the sequence.

## `injected_context` handling

The CLI takes a single prompt string, so fold `injected_context` in the way the target would
actually encounter it — usually by pointing the adapter at a **mock backend** that returns the
injected payload as tool output, not by pasting it into the user prompt (pasting would test the
wrong thing). If the target can't be pointed at mocks, downgrade injection scenarios to
`simulate()`/L1 (test the sanitizer/boundary-wrapper directly) and note the limitation.

## Safety notes specific to this adapter
- Default `allowWrites=false`; `assertReadOnly` rejects any scenario whose expected path includes
  a write/external-action tool unless the operator explicitly opted in.
- Run against a dev instance or mocked backends. If pointing at live systems (→ L3), scope
  credentials to read-only least privilege and set a conservative `timeoutMs` so a stall in the
  target can't hang the campaign.
- Record model/version in the raw log for reproducibility.

## Fidelity produced
`execute()` present → **L2** (or **L3** if wired to live backends, declared in run-config).
Scenarios not sampled for execution stay **L0** unless a `simulate()` is added for **L1**.
