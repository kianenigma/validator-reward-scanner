// Reads the DAP's accounts as the dashboard does, and checks the derived era pots against staking.
// Usage: [NETWORK=westend] bun scripts/check-dap.ts
import { fetchDap } from "../src/api/dap";
import { fetchOverview } from "../src/api/eras";
import { destroyClients } from "../src/api/chains";
import { tokenAmount } from "../src/format";
import { NETWORK } from "../src/network";

const amt = (planck: bigint | null | undefined) =>
	planck == null ? "-" : `${tokenAmount(planck, NETWORK.token.decimals, 2)} ${NETWORK.token.symbol}`;

const ov = await fetchOverview(() => {});
const dap = await fetchDap(ov.eras.map((e) => e.era));
for (const a of dap.accounts) {
	const share = a.share === null ? "-" : `${a.share / 1e7}%`;
	const pots = a.eraPots ? `, ${a.eraPots.eras} era pots ${amt(a.eraPots.balance)}` : "";
	console.log(`${a.role.padEnd(9)} ${a.key.padEnd(19)} ${a.address} ${share.padStart(7)} ${amt(a.balance)}${pots}`);
}
console.log(`last drip ${new Date(dap.lastDripMs).toISOString()}, cadence ${dap.cadenceMs} ms, ceiling ${dap.maxElapsedMs} ms`);
console.log(`issuance ${amt(dap.totalIssuance)}, inactive ${amt(dap.inactiveIssuance)}`);

// An era pot holds at most what staking snapshotted into it, and the newest one is rarely paid
// out in full yet. Nothing in either means the era pot accounts are derived wrong.
const newest = ov.eras[0];
const one = await fetchDap([newest.era]);
const potOf = (role: string) => one.accounts.find((a) => a.role === role)?.eraPots?.balance;
const staker = potOf("staker");
const incentive = potOf("incentive");
console.log(`era ${newest.era}: staker pot holds ${amt(staker)} of ${amt(newest.validatorReward)} snapshotted`);
console.log(`era ${newest.era}: incentive pot holds ${amt(incentive)} of ${amt(newest.incentive?.budget)} snapshotted`);
destroyClients();
if (staker === undefined || incentive === undefined) throw new Error("staking pots not recognised; no era pots derived");
if (!staker && !incentive) throw new Error(`era ${newest.era}'s pots are both empty: derivation likely wrong`);
if ((newest.validatorReward !== null && staker > newest.validatorReward) || (newest.incentive && incentive > newest.incentive.budget))
	throw new Error(`era ${newest.era}'s pots hold more than was snapshotted: derivation likely wrong`);
console.log("era pot derivation ok");
process.exit(0);
