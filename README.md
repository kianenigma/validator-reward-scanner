# Validator Reward Scanner

Single-page dashboard of Polkadot validator era points for concluded eras, split into relay chain
block authorship and parachain consensus (backing, plus rare dispute statements).

- Era points: `Staking::ErasRewardPoints` on Asset Hub (all eras still held, ~84).
- Era → relay sessions: `Staking::BondedEras`. Asset Hub credits the relay report of session `s`
  to the active era before it may start the next era at `s + 1`, so era `e` holds sessions
  `[start(e), start(e+1))`. Eras older than `BondedEras` assume 6 sessions per era (marked `~`).
- Authorship: every relay header in those sessions is read and its BABE pre-digest authority index
  mapped through `Session::Validators` of that session. Each block is 20 points
  (`StakingAhClient::PointsPerBlock`); the rest of a validator's points are parachain consensus
  (20 per backed candidate).
- Identities from the People chain.

Scans take about a minute per era and are cached in IndexedDB.

```bash
bun install
bun run dev
bun scripts/check-era.ts [era]   # scan one era from the CLI and cross-check against Asset Hub
```
