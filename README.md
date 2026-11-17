# Validator Reward Scanner

Single-page dashboard of Polkadot or Westend validator era points, split into relay chain
block authorship, parachain consensus (backing, plus rare dispute statements) and, where the
runtime credits it, system chain collation.

- Era points: `Staking::ErasRewardPoints` on Asset Hub (all eras still held, ~84).
- Era → relay sessions: `Staking::BondedEras`. Asset Hub credits the relay report of session `s`
  to the active era before it may start the next era at `s + 1`, so era `e` holds sessions
  `[start(e), start(e+1))`. Eras older than `BondedEras` assume `Staking::SessionsPerEra` sessions
  per era (marked `~`).
- Authorship: every relay header in those sessions is read and its BABE pre-digest authority index
  mapped through `Session::Validators` of that session. Each block is 20 points
  (`StakingAhClient::PointsPerBlock`); the rest of a validator's points, less collation, are
  parachain consensus (20 per backed candidate).
- Collation: points for authoring Asset Hub and People blocks (polkadot-sdk#13464), from
  `Staking::ErasRewardPointsByService` under `Collation`. Asset Hub converts the reported block
  counts at `StakingPointsConverter::PointsPerService` and credits them to the era active when they
  arrive, so they need no scan. Chains are merged in that item, so the dashboard shows points, not
  blocks. It is read without descriptors, since the Polkadot ones predate it; a runtime without it
  (Polkadot, for now) credits no collation.
- DOT (or WND) per validator, from the two staking budgets of the DAP (`Dap::BudgetAllocation`):
  - Staker rewards: the era's `Staking::ErasValidatorReward` split pro rata by points, paid to the
    validator and its nominators together, before commission.
  - Self-stake incentive: the era's `Staking::ErasValidatorIncentiveBudget`, paid to the validator
    alone. Each share is `ErasValidatorIncentiveWeight × points / ErasSumWeightedPoints`, or
    `weight / ErasSumValidatorIncentiveWeight` for eras before `WeightedPointsFormulaStartEra`.
    Validators without points get nothing.
- Identities from the People chain.
- Issuance per era (the collapsible chart under the era strip): each concluded era's staker rewards
  and validator incentive pots, plus the DAP's cut. The DAP's cut is not stored per era, so the
  era's issuance is taken as the staker pot divided by the `staker_rewards` share of
  `Dap::BudgetAllocation`, and the DAP gets the rest. This assumes the staker share has not changed
  over the eras shown.
- The Dynamic Allocation Pool (collapsible, closed by default): what each DAP account holds at the
  finalized block, and its share of each drip. The drip recipients come from the
  `Dap::budget_recipients` view function: the DAP buffer and staking's two general pots. Each
  staking pot also shows its era pots, which staking moves the general pot into when an era ends
  and pays out of. They are derived as `RewardPot::Era(era % 200, kind)` sub-accounts of the
  general pot's pallet ID, since no API exposes them. The staging account (`Dap::staging`) holds
  slashes, burns, dust and expired rewards until `on_idle` moves them into the buffer.

Scans take about a minute per era and are cached in IndexedDB. Only concluded eras can be scanned:
the running era shows its points so far (up to `StakingRcClient::LastSessionReportEndingIndex`) but
is not scanned until it ends, and it has no DOT figures until then.

The Polkadot | Westend switch in the header picks the network and reloads the page. Each network
keeps its own connection settings and scan cache. Westend is read with the Polkadot papi
descriptors, since papi checks every query against the live runtime and refuses one whose shape
differs.

The Connections dialog sets the RPC endpoints of each chain, or reads Asset Hub and the People
chain through an in-browser smoldot light client. The relay chain always goes over RPC and must
be an archive node, since the scan reads months-old headers and state.

```bash
bun install
bun run dev
bun scripts/check-era.ts [era]   # scan one era from the CLI and cross-check against Asset Hub
bun scripts/check-smoldot.ts     # read era points and identities through smoldot
bun scripts/check-dap.ts         # list the DAP's accounts and check the derived era pots
NETWORK=westend bun scripts/check-era.ts   # either script, against Westend
```
