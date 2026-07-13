/**
 * Gristmill — Blast-Radius Guard
 * ==============================
 * The one safety invariant that must live in code, not in a prompt: NEVER run a live end-to-end
 * test (fidelity L2/L3, i.e. anything that calls the target's real execute() path) unless a
 * throwaway sandbox is active AND the target is recognizably non-production.
 *
 * Prompts can be rationalized around by an agent; a thrown error cannot. Any adapter execute()
 * path — and the harness controller driving it — MUST call assertSandboxActive() before a live
 * run, and SHOULD wrap the run in withSandbox() so teardown always happens.
 *
 * Dependency-free ESM. Import it, or run it directly for self-tests:
 *   node safety/blast-radius-guard.mjs            # run the built-in self-tests
 *   node safety/blast-radius-guard.mjs check L2 https://agent.dev.example.edu
 *
 * See playbooks/SANDBOXING.md for the "Shadow Campus" pattern this enforces.
 */

import { existsSync } from 'node:fs';

/** Fidelity levels that touch the live target and therefore require a sandbox. */
const LIVE_FIDELITY = new Set(['L2', 'L3']);

/**
 * Heuristics for "recognizably non-production". Deliberately conservative: we ALLOW only endpoints
 * that look like a sandbox/dev/test/mock target, and BLOCK anything that looks production or that
 * we can't classify. Fail closed.
 */
const NONPROD_HINTS = [
  /(^|[.\-_/])sandbox([.\-_/]|$)/i,
  /(^|[.\-_/])(dev|development)([.\-_/]|$)/i,
  /(^|[.\-_/])(test|testing|qa|staging|stage)([.\-_/]|$)/i,
  /(^|[.\-_/])(mock|fake|ephemeral|shadow)([.\-_/]|$)/i,
  /(^|[.\-_/])localhost([.\-_/:]|$)/i,
  /(^|[.\-_/])127\.0\.0\.1([.\-_/:]|$)/i,
];
const PROD_HINTS = [
  /(^|[.\-_/])(prod|production|live)([.\-_/]|$)/i,
];

/**
 * Is a sandbox declared active? Three independent signals (any one suffices), so this works from a
 * shell (env), a wrapper script (lockfile), or programmatic config.
 *   1. env GRISTMILL_SANDBOX in {1,true,active,on}
 *   2. a lockfile path in env GRISTMILL_SANDBOX_LOCKFILE that exists on disk
 *   3. an explicit { active: true } passed in opts.sandbox
 */
export function isSandboxActive(opts = {}, env = process.env) {
  const flag = String(env.GRISTMILL_SANDBOX ?? '').trim().toLowerCase();
  if (['1', 'true', 'active', 'on', 'yes'].includes(flag)) return true;
  if (opts.sandbox && opts.sandbox.active === true) return true;
  const lock = env.GRISTMILL_SANDBOX_LOCKFILE;
  if (lock && existsSync(lock)) return true;
  return false;
}

/** Classify an endpoint string. Returns 'nonprod' | 'prod' | 'unknown'. Fails closed on unknown. */
export function classifyEndpoint(endpoint) {
  if (!endpoint) return 'unknown';
  const s = String(endpoint);
  if (PROD_HINTS.some((re) => re.test(s))) return 'prod';
  if (NONPROD_HINTS.some((re) => re.test(s))) return 'nonprod';
  return 'unknown';
}

export class BlastRadiusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlastRadiusError';
  }
}

/**
 * The gate. Call before any live execute(). Throws BlastRadiusError if a live run is not provably
 * safe. Returns silently (and returns true) when the run is allowed.
 *
 * @param {object} p
 * @param {'L0'|'L1'|'L2'|'L3'} p.fidelity   Fidelity of the intended run.
 * @param {string} [p.targetEndpoint]        Where execute() would send the target (URL/host/label).
 * @param {object} [p.sandbox]               Optional { active: boolean } programmatic signal.
 * @param {object} [env]                      Environment (defaults to process.env; injectable for tests).
 */
export function assertSandboxActive({ fidelity, targetEndpoint, sandbox } = {}, env = process.env) {
  // L0 (design prediction) and L1 (isolated mechanism) never call the live target → always allowed.
  if (!LIVE_FIDELITY.has(fidelity)) return true;

  if (!isSandboxActive({ sandbox }, env)) {
    throw new BlastRadiusError(
      `Refusing ${fidelity} live run: no sandbox is active. Declare one (GRISTMILL_SANDBOX=1, a ` +
      `GRISTMILL_SANDBOX_LOCKFILE, or sandbox.active) before calling execute(). See playbooks/SANDBOXING.md.`,
    );
  }

  const klass = classifyEndpoint(targetEndpoint);
  if (klass === 'prod') {
    throw new BlastRadiusError(
      `Refusing ${fidelity} live run: target "${targetEndpoint}" looks like PRODUCTION. Point the ` +
      `adapter at a sandbox/dev/test endpoint. See playbooks/SANDBOXING.md.`,
    );
  }
  if (klass === 'unknown') {
    throw new BlastRadiusError(
      `Refusing ${fidelity} live run: cannot verify target "${targetEndpoint}" is non-production ` +
      `(fail-closed). Use a sandbox/dev/test/mock/localhost endpoint, or add it to your non-prod ` +
      `allowlist. See playbooks/SANDBOXING.md.`,
    );
  }
  return true; // sandbox active AND endpoint recognizably non-prod
}

/**
 * Run body() bracketed by setup()/teardown(), guaranteeing teardown even on throw. Use this to
 * make the ephemeral env's lifetime exactly the live run's lifetime.
 *
 * @param {() => Promise<any>} setup      Spin the ephemeral sandbox; resolve to a handle.
 * @param {(handle:any) => Promise<any>} teardown  Destroy the sandbox (always runs).
 * @param {(handle:any) => Promise<any>} body      The actual run (e.g. adapter.execute()).
 */
export async function withSandbox(setup, teardown, body) {
  let handle;
  let setupOk = false;
  try {
    handle = await setup();
    setupOk = true;
    return await body(handle);
  } finally {
    if (setupOk) {
      try {
        await teardown(handle);
      } catch (err) {
        // Teardown failure is loud but must not mask a body error; surface on stderr.
        console.error(`[blast-radius-guard] teardown failed: ${err?.message ?? err}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CLI: self-tests (no args) or a one-off check.
// ---------------------------------------------------------------------------

function runSelfTests() {
  let pass = 0, fail = 0;
  const ok = (cond, label) => { if (cond) { pass++; console.log(`PASS ${label}`); } else { fail++; console.error(`FAIL ${label}`); } };
  const throws = (fn, label) => { try { fn(); fail++; console.error(`FAIL ${label} (did not throw)`); } catch { pass++; console.log(`PASS ${label}`); } };

  // L0/L1 always allowed, sandbox or not.
  ok(assertSandboxActive({ fidelity: 'L0' }, {}) === true, 'L0 allowed with no sandbox');
  ok(assertSandboxActive({ fidelity: 'L1' }, {}) === true, 'L1 allowed with no sandbox');

  // L2 with no sandbox → blocked.
  throws(() => assertSandboxActive({ fidelity: 'L2', targetEndpoint: 'https://agent.dev.example.edu' }, {}),
    'L2 blocked when no sandbox active');

  // L2 with sandbox flag but PROD endpoint → blocked.
  throws(() => assertSandboxActive({ fidelity: 'L2', targetEndpoint: 'https://agent.prod.example.edu' }, { GRISTMILL_SANDBOX: '1' }),
    'L2 blocked when endpoint looks production');

  // L2 with sandbox flag + unknown endpoint → blocked (fail closed).
  throws(() => assertSandboxActive({ fidelity: 'L2', targetEndpoint: 'https://agent.example.edu' }, { GRISTMILL_SANDBOX: '1' }),
    'L2 blocked when endpoint unclassifiable (fail-closed)');

  // L2 with sandbox flag + non-prod endpoint → allowed.
  ok(assertSandboxActive({ fidelity: 'L2', targetEndpoint: 'https://agent.sandbox.example.edu' }, { GRISTMILL_SANDBOX: '1' }) === true,
    'L2 allowed with sandbox + non-prod endpoint');
  ok(assertSandboxActive({ fidelity: 'L2', targetEndpoint: 'http://localhost:8080' }, { GRISTMILL_SANDBOX: 'true' }) === true,
    'L2 allowed with sandbox + localhost');

  // Programmatic sandbox signal works too.
  ok(assertSandboxActive({ fidelity: 'L3', targetEndpoint: 'https://mock-db.test.local', sandbox: { active: true } }, {}) === true,
    'L3 allowed via programmatic sandbox.active + non-prod');

  // withSandbox runs teardown even when body throws.
  let torn = false;
  return withSandbox(async () => ({ id: 'sbx' }), async () => { torn = true; }, async () => { throw new Error('boom'); })
    .then(() => { fail++; console.error('FAIL withSandbox should have rethrown body error'); },
          () => { pass++; console.log('PASS withSandbox rethrew body error'); })
    .then(() => {
      ok(torn === true, 'withSandbox ran teardown despite body throw');
      console.log(`\n${pass} passed, ${fail} failed`);
      if (fail > 0) process.exit(1);
    });
}

// Detect direct execution (ESM-safe).
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const [, , cmd, fidelity, endpoint] = process.argv;
  if (cmd === 'check') {
    try {
      assertSandboxActive({ fidelity: fidelity || 'L2', targetEndpoint: endpoint });
      console.log(`ALLOWED: ${fidelity || 'L2'} run against "${endpoint ?? ''}"`);
    } catch (e) {
      console.error(`BLOCKED: ${e.message}`);
      process.exit(2);
    }
  } else {
    await runSelfTests();
  }
}
