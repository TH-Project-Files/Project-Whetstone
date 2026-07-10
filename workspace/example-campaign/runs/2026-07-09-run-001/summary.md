# Campaign example-campaign — ExampleAgent

Rounds: 3 · Converged: no (scenario generator dry — variety exhausted before the sample floor was met)
Modes: efficiency, agent-logic, security, stall-conditions
Findings: 9 · Clusters: 2
Evidence confidence: **directional**

## Round log
- Round 1: +8 scenarios (4 dup-rejected), 2 promoted to L2 (3 upgraded, 0 refuted), 5 findings, 2 new clusters, agreement 1, blind-vs-sighted delta 0, floor unmet, dryStreak=0
- Round 2: +2 scenarios (10 dup-rejected), 1 promoted to L2 (2 upgraded, 0 refuted), 4 findings, 0 new clusters, agreement 1, blind-vs-sighted delta 0.02, floor unmet, dryStreak=0
- Round 3: +0 scenarios (12 dup-rejected), 0 promoted to L2 (0 upgraded, 0 refuted), 0 findings, 0 new clusters, agreement 1, floor unmet, dryStreak=0 — generator dry, stopping

## Top clusters
1. C-insufficient-stop-condition — rank 0.73, sev 3, prev 0.78, minFid L0, confirmed 5/7
2. C-cost-explosion — rank 0.232, sev 2, prev 0.22, minFid L2, confirmed 2/2

## Plan (Skeptic-gated)
- [accepted] C-insufficient-stop-condition @ stop-conditions: Apply smallest fix at stop-conditions for insufficient-stop-condition
- [accepted] C-cost-explosion @ stop-conditions: Apply smallest fix at stop-conditions for cost-explosion