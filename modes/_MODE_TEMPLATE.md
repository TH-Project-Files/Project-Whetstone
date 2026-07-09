# Mode: <name>

> Copy this file to author a new dimension pack. A mode is a **modular lens**: enabling it in
> `run-config.evaluation_modes` tells the Scenario Smith what to generate, tells the Judge which
> axes to weight, and tells the Analyst/Planner what failure shapes and fix levers to expect.
> Modes compose freely — a campaign may enable one or several.

**Slug:** `<kebab-name>` (must match the enum in the schemas and `run-config`).

## Focus
One paragraph: what weakness class this mode hunts, and why it matters operationally.

## Scoring emphasis
The axes this mode weights up (from `rubrics/axes.md`), and any raised pass floor
(e.g. "safety ≥ 4"). The Judge still scores all enabled axes; emphasis changes the weighting
profile (`rubrics/weighting.md`).

## Scenario families
A table of the scenario shapes to generate. For each: the family name, what it probes, and the
**hidden difficulty factors** that make it more than a toy prompt.

| Family | Probes | Hidden difficulty |
|---|---|---|
| … | … | … |

## Failure signatures
The concrete, observable symptoms in a trace/answer that indicate this weakness. Map each to an
`issue_class` from `schemas/finding.schema.json` so findings cluster cleanly.

## Fix levers
The typical remediations, keyed to a `fix_locus` from `schemas/plan.schema.json`. These are hints
for the Planner, not a mandate.

## Example scenarios
2–4 fully-worked examples (prompt + objective + expected ideal path + likely failure) that a
Scenario Smith can pattern-match and vary. Keep them target-agnostic; use placeholder entities
(`ENTITY-A`, `USER-X`, `SOURCE-1`) so the mode ports to any target.

## Anti-goals
What this mode should NOT flag (to prevent double-counting with sibling modes and to avoid
penalizing legitimate behavior).
