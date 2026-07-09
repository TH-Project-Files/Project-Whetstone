# Example Adapter: Simulation / mechanism harness (L0–L1)

A worked example of a `describe()`-plus-`simulate()` adapter that needs **no live target** and no
end-to-end run. It supplies design-level predictions (L0) and, where it can execute an isolated
mechanism, confirmed mechanism behavior (L1). This is the zero-plumbing default for a fast broad
sweep and for confirming guards/validators/tool-contracts.

## When to use
- The target isn't runnable from your environment (no credentials, no sandbox, prod-only).
- You want a cheap first pass to *find candidate weaknesses* before spending on L2 execution.
- You specifically want to confirm a **mechanism**: does a sanitizer neutralize a payload? does a
  query guard reject a mutation? does a validator reject an unscoped filter? does a schema cap a
  limit? These are unit-testable and earn L1 without running the whole agent.

## Shape (JS)

```js
// adapters/simulation-adapter.js
export function makeSimulationAdapter(cfg) {
  return {
    async describe() {
      // Read the target's prompt/manifest/tool source from disk and return the TargetDescription.
      return readTargetProfileFromSource(cfg.sourceDir);
    },

    async simulate(scenario) {
      // Return a partial trace ONLY when you actually executed a mechanism; else return null so
      // the Run Simulator falls back to pure L0 reasoning from the target profile.
      const mech = cfg.mechanisms[scenario.mode];   // e.g. a guard fn imported under tsx
      if (!mech) return null;
      const input = deriveMechanismInput(scenario); // the crafted input the scenario implies
      const result = mech(input);                    // <-- real execution of the isolated fn
      return {
        fidelity: 'L1',
        steps: [{ actor: 'mechanism', action: mech.name, output_shape: describe(result) }],
        mechanism_result: result,                    // e.g. "rejected", "accepted", escaped string
      };
    },

    // no execute() -> the campaign cannot exceed L1 with this adapter.
  };
}
```

## How L0 vs L1 gets decided here
- If `simulate()` returns `null`, the Run Simulator reasons from the profile → the trace is **L0**
  (a prediction). Its findings are phrased as predictions and carry the L0 rank discount.
- If `simulate()` returns a mechanism result, the relevant finding is **L1** — you can state that
  the guard/validator/formatter *does* (not *is predicted to*) reject/accept/neutralize the input.

## The value and the limit of L1
L1 confirms mechanisms with certainty and is cheap and deterministic — ideal for the
`prompt-injection` mode's *sanitizer* check, the `security` mode's *guard-bypass* check, and the
`tool-coverage` mode's *schema-contract* check.

But L1 says nothing about **emergent behavior**. A payload can pass the sanitizer and *still*
change the model's behavior end-to-end; a guard can reject a mutation the model would never have
emitted anyway. That gap is exactly why hybrid campaigns promote a sample to L2 (`execute()`).
Treat an L1-only campaign as *"the mechanisms are sound"* — never as *"the agent behaves well."*
See `rubrics/fidelity-ladder.md`.

## Building the mechanism map
`cfg.mechanisms` is where the only target-specific code lives: a small map from a mode (or an
intent) to a function that runs one isolated piece of the target. For a TypeScript target you can
import the real exported symbols under `tsx` and call them on crafted inputs — that is genuine
L1, not a re-implementation. Never re-implement the mechanism in the adapter; import and run the
real one, or return `null`.
