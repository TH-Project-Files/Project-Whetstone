# Importing external scenario sets

Gristmill's Scenario Smith generates scenarios, but the strongest campaigns blend in scenarios
from **other sources**: other providers' models (ask GPT/Gemini/etc. to generate adversarial
cases for the same target profile), historic incidents and support tickets, and mutations of
past failures. Diversity of *authorship* surfaces blind spots any single generator shares with
the target it's testing.

This contract defines how external scenarios enter a campaign **without polluting it**. External
material is a raw material, not a trusted input — it passes the same schema, fingerprint gate,
and value filter as internally-generated scenarios.

## The pipeline: import → normalize → curate → gate

```
raw import file  ─▶  normalize to scenario schema  ─▶  curate (value filter)  ─▶  fingerprint gate  ─▶  campaign
   (any shape)         (fill required fields)          (drop junk/dupes)         (reject collisions)
```

### 1. Import format
Drop files in `seed-imports/` as JSONL. Each line is a loose scenario — at minimum a `prompt`
and an intended `mode`; anything else is best-effort. Tag the origin so provenance survives:

```jsonl
{ "origin": "provider:gpt", "mode": "prompt-injection", "prompt": "…", "note": "generated for target profile v2" }
{ "origin": "historic-incident", "mode": "stall-conditions", "prompt": "…", "incident_ref": "INC-1234" }
```

### 2. Normalize
Map each raw line onto `schemas/scenario.schema.json`: assign a `scenario_id`, set
`provenance` (`provider-import` | `historic-incident` | `mutation`), infer `category` and
`style`, draft an `expected_ideal_path`, and compute a `fingerprint`. Where a field is missing,
the Scenario Smith fills it exactly as it would for an internal scenario — grounded in the target
profile. Do **not** carry over the external model's *answer* or *grading opinion*; import the
stimulus only.

### 3. Curate (the value filter)
Reject imports that are not worth running. A scenario passes only if it is:
- **Legitimate** — a realistic ask or a meaningful adversarial probe, not nonsense.
- **In-scope** — exercises a capability the target actually claims (or a SHOULD-answerable gap);
  not a test of something the target never purported to do.
- **High-value** — plausibly reveals a scoreable weakness; drop trivia and un-failable prompts.
- **Category-balanced** — don't let an import dump 200 injection cases and skew the campaign;
  respect the run-config mix.
- **Safe to run** — an imported scenario that would drive a real write/destructive action needs
  the same operator opt-in as any other (`adapters/ADAPTER_CONTRACT.md` safety rules).

Curation is itself a role the Scenario Smith performs (or a dedicated curator agent). Log how many
imports were dropped and why — silent acceptance of a junk dump is how external sets degrade a
campaign.

### 4. Fingerprint gate
Surviving imports go through the exact same similarity gate as internal scenarios
(`rubrics/statistics.md` §2), checked against the full `memory/scenario_fingerprints.jsonl`
history. An import that duplicates an existing scenario is dropped or mutated along its test axis.

## Why not trust external generators directly
Two failure modes justify the gate:
1. **Junk volume** — models asked for "100 adversarial questions" produce many near-duplicates and
   many un-failable prompts; unfiltered, they inflate coverage counts without adding signal.
2. **Shared blind spots** — an external model may share assumptions with the target and generate
   only the cases both handle well. The value filter + your own Scenario Smith families counter
   this by forcing category balance and hidden-difficulty factors.

See `seed-imports/example-import.jsonl` for a small, correctly-formatted sample.
