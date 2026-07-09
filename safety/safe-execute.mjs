/**
 * Whetstone — Safety Wrapper (safe-execute)
 * =========================================
 * The harness NEVER calls a target agent's execute() directly. It calls THIS wrapper, which holds
 * the sandbox boundary with an iron grip and hands back only a structured trace. It is deliberately
 * "dumb": no scoring, no judgement, no cleverness — just five mechanical steps that cannot be
 * skipped or rationalized around by an LLM.
 *
 *   1. ENVIRONMENT LOCK   — force the target's env (DB_HOST, API_KEY, endpoints, …) to point ONLY at
 *                           local mock infrastructure; refuse if any locked value looks production.
 *   2. STATE INIT         — seed the ephemeral "shadow campus" dummy data for this scenario.
 *   3. EXECUTE & CAPTURE  — invoke the agent, capture tool telemetry + output, enforce a hard timeout.
 *   4. GUARANTEED TEARDOWN— destroy the mock state and drop the locked env, in a `finally` — always.
 *   5. RETURN             — pass a structured trace payload back to the harness (→ Trace Judge).
 *
 * Dependency-free ESM. Builds on blast-radius-guard.mjs. See playbooks/SANDBOXING.md.
 */

import { assertSandboxActive, withSandbox, classifyEndpoint, BlastRadiusError } from './blast-radius-guard.mjs';

/**
 * @typedef {object} SandboxSpec
 * @property {string}  endpoint                 Non-production URL/host the agent must be pinned to.
 * @property {Record<string,string>} envLock    Env the target is FORCED to use (mock DB, fake keys, …).
 * @property {string[]} [lockedKeys]            Keys that MUST be present in envLock and non-prod
 *                                              (defaults to the keys of envLock).
 * @property {() => Promise<any>}            [setup]     Spin the ephemeral sandbox → handle.
 * @property {(handle:any, scenario:any) => Promise<any>} [seed]  Seed dummy state for this scenario.
 * @property {(handle:any) => Promise<any>} [teardown]  Destroy the sandbox (always runs).
 * @property {number} [timeoutMs]               Hard cap on the agent run (default 60000).
 */

const DEFAULT_TIMEOUT_MS = 60000;

/** A locked value is unacceptable if it "looks production" by the same heuristic the guard uses. */
function assertEnvLockClean(envLock, lockedKeys) {
  for (const key of lockedKeys) {
    if (!(key in envLock)) {
      throw new BlastRadiusError(`Environment lock incomplete: required key "${key}" is not pinned to mock infrastructure.`);
    }
    const val = String(envLock[key] ?? '');
    if (classifyEndpoint(val) === 'prod') {
      throw new BlastRadiusError(`Environment lock rejected: "${key}"="${val}" looks like PRODUCTION. Pin it to a mock/dev/test/localhost value.`);
    }
  }
}

/**
 * Run a factory against a hard timeout. Signals the adapter via AbortController if it honors one.
 * The timeout is AUTHORITATIVE: once the timer fires, the outcome is timedOut even if the adapter
 * then resolves or rejects (e.g. an adapter that resolves on abort can't mask a stall).
 * Returns { timedOut, result, error }.
 */
function runWithTimeout(promiseFactory, timeoutMs) {
  const ac = new AbortController();
  let didTimeout = false;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { didTimeout = true; ac.abort(); resolve({ kind: 'timeout' }); }, timeoutMs);
  });
  const work = Promise.resolve()
    .then(() => promiseFactory(ac.signal))
    .then((r) => ({ kind: 'result', r }), (e) => ({ kind: 'error', e }));
  return Promise.race([work, timeout])
    .finally(() => clearTimeout(timer))
    .then((x) => {
      if (didTimeout || x.kind === 'timeout') return { timedOut: true, result: null, error: null };
      if (x.kind === 'error') return { timedOut: false, result: null, error: x.e };
      return { timedOut: false, result: x.r, error: null };
    });
}

/**
 * The wrapper. The harness calls this instead of adapter.execute().
 *
 * @param {object} p
 * @param {{ execute: Function }} p.adapter   Adapter with an execute(scenario, ctx) method. `ctx`
 *                                            carries { env, signal, sandboxHandle }. The adapter MUST
 *                                            use ctx.env (never ambient process.env) so the lock holds.
 * @param {any}    p.scenario                 The scenario to run.
 * @param {'L2'|'L3'} p.fidelity              Live fidelity (L0/L1 don't call execute → don't use this).
 * @param {SandboxSpec} p.sandbox             The ephemeral environment definition.
 * @returns {Promise<object>} a structured trace payload (RawRun shape + safety metadata).
 */
export async function safeExecute({ adapter, scenario, fidelity, sandbox }) {
  if (fidelity !== 'L2' && fidelity !== 'L3') {
    throw new BlastRadiusError(`safeExecute is only for live runs (L2/L3); got "${fidelity}". Use simulate() for L0/L1.`);
  }
  if (!sandbox || typeof sandbox !== 'object') {
    throw new BlastRadiusError('safeExecute requires a sandbox spec (endpoint + envLock). See playbooks/SANDBOXING.md.');
  }

  const lockedKeys = sandbox.lockedKeys ?? Object.keys(sandbox.envLock ?? {});
  const timeoutMs = sandbox.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // ── Pre-flight gate: the guard refuses a live run without an active, non-prod sandbox. ──
  assertSandboxActive({ fidelity, targetEndpoint: sandbox.endpoint, sandbox: { active: true } });

  // ── Step 1: ENVIRONMENT LOCK (hardcoded pre-flight). Force env to mock infra; refuse prod values.
  assertEnvLockClean(sandbox.envLock ?? {}, lockedKeys);
  const lockedEnv = Object.freeze({ ...sandbox.envLock });

  const startedAt = Date.now();
  let timedOut = false;

  // ── Steps 2–4: setup → (seed → execute+capture) → guaranteed teardown (finally). ──
  const run = await withSandbox(
    // setup
    async () => (sandbox.setup ? await sandbox.setup() : { endpoint: sandbox.endpoint }),
    // teardown — ALWAYS runs (blast-radius-guard.withSandbox guarantees the finally).
    async (handle) => { if (sandbox.teardown) await sandbox.teardown(handle); },
    // body
    async (handle) => {
      // Step 2: STATE INITIALIZATION — seed the shadow-campus dummy data for THIS scenario.
      if (sandbox.seed) await sandbox.seed(handle, scenario);

      // Step 3: EXECUTION & TRACE CAPTURE — invoke the agent with the locked env + a hard timeout.
      // Return a structured trace (never throw) so a stuck/erroring agent still yields a scoreable
      // trace — a stall IS a finding. Teardown still runs via the withSandbox finally either way.
      const outcome = await runWithTimeout(
        (signal) => adapter.execute(scenario, { env: lockedEnv, signal, sandboxHandle: handle }),
        timeoutMs,
      );
      if (outcome.timedOut) {
        timedOut = true;
        return { final_answer: null, steps: [], error: `agent run exceeded timeout of ${timeoutMs}ms`, timedOut: true };
      }
      if (outcome.error) {
        return { final_answer: null, steps: [], error: String(outcome.error?.message ?? outcome.error), timedOut: false };
      }
      return outcome.result;
    },
  );

  // ── Step 5: RETURN a structured trace payload for the harness → Trace Judge. ──
  return {
    fidelity,
    adapter: 'safe-execute',
    estimated: false,
    final_answer: run?.final_answer ?? null,
    steps: run?.steps ?? [],
    tool_calls: run?.tool_calls ?? (run?.steps?.length ?? 0),
    turns: run?.turns ?? undefined,
    wall_ms: Date.now() - startedAt,
    tokens: run?.tokens ?? undefined,
    raw_log_path: run?.raw_log_path ?? undefined,
    safety: {
      sandbox_endpoint: sandbox.endpoint,
      env_locked_keys: lockedKeys,
      timeout_ms: timeoutMs,
      timed_out: Boolean(run?.timedOut || timedOut),
      error: run?.error ?? null,
      teardown: 'guaranteed', // withSandbox ran teardown in its finally
    },
  };
}

// ---------------------------------------------------------------------------
// CLI self-test: exercises the wrapper against a fake adapter + fake sandbox (no real infra).
// ---------------------------------------------------------------------------

async function runSelfTests() {
  let pass = 0, fail = 0;
  const ok = (c, l) => { if (c) { pass++; console.log(`PASS ${l}`); } else { fail++; console.error(`FAIL ${l}`); } };

  const events = [];
  const sandbox = {
    endpoint: 'http://localhost:9999',
    envLock: { DB_HOST: 'localhost', API_KEY: 'mock-key' },
    setup: async () => { events.push('setup'); return { id: 'sbx-1' }; },
    seed: async (_h, _s) => { events.push('seed'); },
    teardown: async () => { events.push('teardown'); },
    timeoutMs: 200,
  };

  // Happy path: env used, ordered lifecycle, structured trace returned.
  const goodAdapter = {
    execute: async (_scn, ctx) => {
      events.push('execute');
      ok(ctx.env.DB_HOST === 'localhost', 'adapter received locked env (DB_HOST)');
      ok(Object.isFrozen(ctx.env), 'locked env is frozen (immutable)');
      return { final_answer: 'ok', steps: [{ n: 0, actor: 'agent', action: 'answer' }], tool_calls: 1 };
    },
  };
  const trace = await safeExecute({ adapter: goodAdapter, scenario: { scenario_id: 's1' }, fidelity: 'L2', sandbox });
  ok(trace.final_answer === 'ok', 'returns structured trace');
  ok(trace.safety.teardown === 'guaranteed', 'trace records guaranteed teardown');
  ok(events.join('>') === 'setup>seed>execute>teardown', `lifecycle order (got ${events.join('>')})`);

  // Prod endpoint → blocked before any setup.
  events.length = 0;
  try {
    await safeExecute({ adapter: goodAdapter, scenario: {}, fidelity: 'L2', sandbox: { ...sandbox, endpoint: 'https://prod.example.edu' } });
    fail++; console.error('FAIL prod endpoint should block');
  } catch { ok(events.length === 0, 'prod endpoint blocked before setup (no lifecycle ran)'); }

  // Env lock with a prod-looking value → blocked.
  try {
    await safeExecute({ adapter: goodAdapter, scenario: {}, fidelity: 'L2', sandbox: { ...sandbox, envLock: { DB_HOST: 'db.prod.example.edu' } } });
    fail++; console.error('FAIL prod env value should block');
  } catch { pass++; console.log('PASS prod-looking env value blocked'); }

  // Timeout → structured failure trace, teardown still runs.
  events.length = 0;
  const hangingAdapter = { execute: (_s, ctx) => new Promise((res) => { /* never resolves until abort */ ctx.signal.addEventListener('abort', () => res({})); }) };
  const t2 = await safeExecute({ adapter: hangingAdapter, scenario: {}, fidelity: 'L2', sandbox });
  ok(t2.safety.timed_out === true, 'timeout produces timed_out trace');
  ok(events.includes('teardown'), 'teardown ran despite timeout');

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) { await runSelfTests(); }
