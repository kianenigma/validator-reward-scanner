# Validator Reward Scanner

Single-page dashboard of Polkadot validator era points, split into relay chain
block authorship and parachain consensus (backing, plus rare dispute statements).

- Era points: `Staking::ErasRewardPoints` on Asset Hub (all eras still held, ~84).
- Era → relay sessions: `Staking::BondedEras`. Asset Hub credits the relay report of session `s`
  to the active era before it may start the next era at `s + 1`, so era `e` holds sessions
  `[start(e), start(e+1))`. Eras older than `BondedEras` assume 6 sessions per era (marked `~`).
- Authorship: every relay header in those sessions is read and its BABE pre-digest authority index
  mapped through `Session::Validators` of that session. Each block is 20 points
  (`StakingAhClient::PointsPerBlock`); the rest of a validator's points are parachain consensus
  (20 per backed candidate).
- DOT per validator, from the two staking budgets of the DAP (`Dap::BudgetAllocation`):
  - Staker rewards: the era's `Staking::ErasValidatorReward` split pro rata by points, paid to the
    validator and its nominators together, before commission.
  - Self-stake incentive: the era's `Staking::ErasValidatorIncentiveBudget`, paid to the validator
    alone. Each share is `ErasValidatorIncentiveWeight × points / ErasSumWeightedPoints`, or
    `weight / ErasSumValidatorIncentiveWeight` for eras before `WeightedPointsFormulaStartEra`.
    Validators without points get nothing.
- Identities from the People chain.

Scans take about a minute per era and are cached in IndexedDB. "Scan current era" re-reads Asset Hub
and scans the running era up to its last session reported to Asset Hub
(`StakingRcClient::LastSessionReportEndingIndex`), so it lags the relay chain by up to a session.
Such scans are not cached, and the era has no DOT figures until it ends.

The Connections dialog sets the RPC endpoints of each chain, or reads Asset Hub and the People
chain through an in-browser smoldot light client. The relay chain always goes over RPC and must
be an archive node, since the scan reads months-old headers and state.

```bash
bun install
bun run dev
bun scripts/check-era.ts [era]   # scan one era from the CLI and cross-check against Asset Hub
bun scripts/check-smoldot.ts     # read era points and identities through smoldot
```
