# Campaign example-campaign — ExampleAgent

Rounds: 3 · Converged: yes
Modes: efficiency, agent-logic, security, stall-conditions
Findings: 10 · Clusters: 3
Evidence confidence: **high-confidence**

## Round log
- Round 1: +8 scenarios (4 dup-rejected, 3 promoted to L2), 6 findings, 3 new clusters, dryStreak=0
- Round 2: +2 scenarios (10 dup-rejected, 0 promoted to L2), 4 findings, 0 new clusters, dryStreak=1
- Round 3: +0 scenarios (12 dup-rejected, 0 promoted to L2), 0 findings, 0 new clusters, dryStreak=2

## Top clusters
1. C-insufficient-stop-condition — rank 0.657, sev 3, prev 0.7, minFid L0, confirmed 3/7
2. C-cost-explosion — rank 0.209, sev 2, prev 0.2, minFid L2, confirmed 2/2
3. C-unsupported-synthesis — rank 0.104, sev 2, prev 0.1, minFid L2, confirmed 1/1

## Plan (Skeptic-gated)
- [needs-more-evidence] C-insufficient-stop-condition @ stop-conditions: Promote C-insufficient-stop-condition to L2 and re-measure before changing code
- [accepted] C-cost-explosion @ stop-conditions: Apply smallest fix at stop-conditions for cost-explosion
- [narrowed] C-unsupported-synthesis @ prompt-policy: Apply smallest fix at prompt-policy for unsupported-synthesis