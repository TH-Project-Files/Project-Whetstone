# Future: unattended CI/CD gating (design record — NOT built)

> **Status: deferred, not implemented.** Gristmill today is **harness-native**: campaigns run
> interactively inside Claude Code / Codex, driven by the Master Audit Prompt (see the README).
> That is the intended deployment for now. This document records the design for a future
> unattended CI gate so the idea isn't lost — but none of it exists in the repo yet, by choice.

## Why it's deferred
An interactive harness already provides the orchestration Gristmill needs: it sequences tool
calls, writes artifacts, reprompts on error, and reads the roles straight from this repo. For a
human-driven "polish my agent" session, a standalone engine would reimplement what the harness
gives for free and be *less* aligned with a prompt-native method. So we didn't build it.

The **only** piece that must live in code regardless of deployment — the non-bypassable
blast-radius guard for live runs — **is** built (`safety/`). Everything below is what you'd add
*if and when* you want agents gated automatically in a pipeline.

## What "done" would look like
A team adds one step to their agent's pipeline:
```
npx @gristmill/engine run --config gristmill.config.json \
    --adapter-url $AGENT_SANDBOX_URL \
    --fail-on "severity>=4 && verify_status==CONFIRMED"
```
The engine spins the sandbox, runs the campaign to convergence against the agent, writes the
artifact chain, and **exits non-zero** if a confirmed high-severity cluster survives — failing the
build.

## The design (thin spine over the harness)
The right shape is **not** a from-scratch reimplementation. It's a lean, deterministic controller
whose *model backend is Claude Code / Codex running headless*. The spine owns only what a raw
harness doesn't guarantee; it delegates all role reasoning to the harness you already trust.

1. **Deterministic state machine.** `INIT → CARTOGRAPH → ROUND(GENERATE→RUN→SCORE→VERIFY→CLUSTER)* →
   PLAN → SKEPTIC → REGRESS → DONE`, sequenced in code (TypeScript), checkpointed after every step
   to `workspace/<campaign>/state.json` so a killed run resumes exactly where it stopped.
2. **Inline schema validation (Zod mirror of `schemas/*.json`).** Validate each role output at the
   boundary; on failure, re-prompt that role with the validation error as repair feedback before
   anything moves downstream. (`runner/validate.mjs` already does the post-hoc version.)
3. **Standardized adapter API.** A REST/gRPC profile of the existing `describe/simulate/execute`
   contract: every campus agent exposes `POST /gristmill/{describe,simulate,execute}`. The engine
   then tests any agent on the network uniformly; a `gristmill conformance <url>` command certifies
   an agent implements it. (Today the contract is the in-process JS shape in
   `adapters/ADAPTER_CONTRACT.md` — the network profile is the additive future piece.)
4. **Provider-agnostic model router.** Config maps role → model behind one `LlmClient` interface
   (Anthropic default, OpenAI, local/OpenAI-compatible, plus a deterministic mock for keyless CI).
   Route high-volume roles (Scenario Smith, Trace Judge) to cheap/fast tiers and the hard-reasoning
   roles (Root-Cause Analyst, Skeptic) to frontier tiers.
5. **Sandbox lifecycle — already solved.** The engine would call the existing `safety/safe-execute.mjs`
   wrapper for every live run; the guard and guaranteed teardown are done and reused as-is.

## What already exists and would be reused
- `schemas/*.json` — canonical contracts (Zod would mirror, not replace, them).
- `roles/*.md`, `modes/*.md`, `rubrics/*.md` — the engine executes these; it doesn't fork them.
- `runner/gristmill.workflow.js` — the deterministic reference control flow to port from.
- `runner/validate.mjs` — post-hoc validation, reusable as the CI cross-check.
- `safety/*` — the blast-radius guard + wrapper, reused verbatim.

## Trigger to build it
Revisit when there's a concrete, near-term requirement to gate agent releases automatically (a
real pipeline, more than a couple of target agents, or a need for reproducible/auditable verdicts
without a human in the loop). Until then, the interactive path plus the code-enforced safety
wrapper is the right amount of machinery.
