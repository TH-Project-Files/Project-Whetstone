# Playbook: Sandboxing — the "Shadow Campus" pattern

Gristmill's fidelity ladder rewards running the target agent for real (L2/L3) — that's how
predictions get confirmed and emergent behavior gets caught. But a real run of a campus agent can
reach out and touch real systems: student records, directory, ticketing, mail. Testing must never
change production state.

The **Shadow Campus** pattern gives you the fidelity of a live run with **zero blast radius**: a
throwaway, mock replica of the environment is spun up for the test, the agent is pinned to it, and
it is destroyed the instant the run ends — pass, fail, or hang.

This is enforced in code, not by trusting a prompt: the harness **never calls a target agent
directly**. It calls the **safety wrapper** (`safety/safe-execute.mjs`), which holds the boundary
with an iron grip.

## Why code, not a prompt
A prompt instruction ("please use the sandbox") can be reasoned around by an agent under pressure —
the reference project's own dev CLI once autonomously edited source files when an ambiguous request
seemed to call for it. A thrown `BlastRadiusError` cannot be reasoned around. So the invariant
lives in `safety/blast-radius-guard.mjs`, and the harness is instructed to route every live run
through the wrapper.

## The invariant (blast-radius guard)
`safety/blast-radius-guard.mjs` refuses any **L2/L3** run unless BOTH hold:
1. **A sandbox is declared active** — via `GRISTMILL_SANDBOX=1`, a `GRISTMILL_SANDBOX_LOCKFILE`
   that exists, or a programmatic `sandbox.active === true`.
2. **The target endpoint is recognizably non-production** — matches a dev/test/staging/sandbox/
   mock/localhost hint and does *not* match a prod/production/live hint. Unclassifiable endpoints
   are **blocked** (fail-closed).

L0 (design prediction) and L1 (isolated mechanism) never call the live target, so they always pass.

Quick check:
```
node safety/blast-radius-guard.mjs check L2 https://agent.sandbox.example.edu   # ALLOWED
node safety/blast-radius-guard.mjs check L2 https://agent.prod.example.edu      # BLOCKED
node safety/blast-radius-guard.mjs                                              # self-tests
```

## The safety wrapper — five mechanical steps
`safety/safe-execute.mjs` exports `safeExecute({ adapter, scenario, fidelity, sandbox })`. The
harness calls this **instead of** `adapter.execute()`. It does exactly five things, in order, and
nothing clever:

1. **Environment Lock (hard pre-flight).** Forces the target's env (`DB_HOST`, `API_KEY`,
   endpoints, …) to point *only* at the mock infrastructure, overriding any defaults. It refuses if
   a locked value looks production, and passes the frozen env to the adapter as `ctx.env`. The
   adapter **must** read `ctx.env`, never ambient `process.env` — the same "never `process.env`"
   discipline good agents already follow.
2. **State Initialization.** Calls `sandbox.seed(handle, scenario)` to load the shadow-campus dummy
   data this specific scenario needs.
3. **Execution & Trace Capture.** Invokes the agent, captures its tool telemetry + output, and
   enforces a hard `timeoutMs`. A stuck agent is aborted; a stall becomes a *scoreable trace*, not a
   hang.
4. **Guaranteed Teardown.** Runs in a `finally` (via `withSandbox`): whether the agent succeeded,
   threw, or timed out, the mock state is destroyed and the locked env is dropped. Always.
5. **Return.** Hands a structured trace payload back to the harness — which passes it to the
   **Trace Judge** role for scoring. The payload includes a `safety` block (sandbox endpoint,
   locked keys, timeout, `timed_out`, `teardown: "guaranteed"`) so the run's safety posture is
   itself auditable.

## Defining a `sandbox` spec
```js
const sandbox = {
  endpoint: 'http://localhost:9099',                 // must be non-prod (guard-checked)
  envLock: { DB_HOST: 'localhost', API_KEY: 'mock-key', GRAPH_URL: 'http://localhost:9099/mock' },
  lockedKeys: ['DB_HOST', 'API_KEY', 'GRAPH_URL'],   // must be present + non-prod (defaults to envLock keys)
  setup:    async () => spinEphemeralMockDb(),        // → handle
  seed:     async (handle, scenario) => loadDummyData(handle, scenario),
  teardown: async (handle) => destroy(handle),        // always runs
  timeoutMs: 60000,
};
```
`setup` might launch a disposable container, an in-memory DB, or a mock API server; `teardown`
tears exactly that down. The wrapper doesn't care *how* — it only guarantees *when*.

## How the harness uses it (harness-native)
The Master Audit Prompt instructs the controller: for any L2/L3 scenario, **do not call the target
directly** — call `safeExecute(...)` with the campaign's sandbox spec, then hand the returned trace
to the Run Simulator/Trace Judge. For L0/L1 scenarios (no live call), use `describe()`/`simulate()`
as normal; the wrapper isn't needed.

## Building a shadow campus (practical notes)
- **Mock the systems the agent reads/writes**, not the whole university — usually a throwaway DB
  plus stub endpoints returning fixture data shaped like the real APIs.
- **Seed per scenario** so each test is deterministic and isolated; don't share mutable state
  across scenarios in a round.
- **Keep it ephemeral** — prefer containers/temp dirs/in-memory stores that vanish on teardown over
  anything persistent. If teardown can't fully clean up, that's a finding about the *test rig*, and
  the wrapper logs the teardown failure loudly on stderr.
- **Never point `envLock` at anything real** — the guard blocks prod-looking values, but the first
  line of defense is you not putting a real host in `envLock`.
