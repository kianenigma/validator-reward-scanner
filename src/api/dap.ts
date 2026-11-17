import { AccountId } from "polkadot-api";
import { ahApi, ahFinalizedHash } from "./chains";
import { NETWORK } from "../network";
import type { Dap, DapAccount, DapRole } from "../types";

const accountCodec = AccountId(NETWORK.ss58);
/** `PalletId`'s `TypeId`: its accounts are `modl ++ id ++ sub`, zero-padded to 32 bytes. */
const MODL = new TextEncoder().encode("modl");
/**
 * `pallet_staking_async::POT_POOL_SIZE`. Era pots are sub-accounts by slot, `era % 200`, so a slot
 * is reused every 200 eras. It is not in the metadata.
 */
const POT_POOL_SIZE = 200;
/** `RewardKind` of the staking pot each budget key funds. */
const POT_KIND: Record<string, 0 | 1> = { staker_rewards: 0, validator_incentive: 1 };

/** `PalletId(id).into_sub_account_truncating(sub)`, with `sub` already SCALE-encoded. */
function palletAccount(id: Uint8Array, sub: number[] = []): string {
	const bytes = new Uint8Array(32);
	bytes.set(MODL);
	bytes.set(id, 4);
	bytes.set(sub, 12);
	return accountCodec.dec(bytes);
}

const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/**
 * The era pots of `eras` for a general staking pot, if `address` is one: staking derives the
 * general pot as `RewardPot::General(kind)` of its pallet ID, and each era pot as
 * `RewardPot::Era(era % POT_POOL_SIZE, kind)` of the same ID. Null if `address` is not shaped so.
 */
function eraPotsOf(address: string, kind: 0 | 1, eras: number[]): string[] | null {
	const id = accountCodec.enc(address).slice(4, 12);
	if (palletAccount(id, [0, kind]) !== address) return null;
	return eras.map((era) => palletAccount(id, [1, ...u32le(era % POT_POOL_SIZE), kind]));
}

function roleOf(key: string, address: string, buffer: string): DapRole {
	if (address === buffer) return "buffer";
	if (key === "staker_rewards") return "staker";
	if (key === "validator_incentive") return "incentive";
	return "other";
}

/**
 * Every account holding DAP money: the drip recipients (`Dap::budget_recipients`, which include the
 * buffer), the era pots staking moved the staking recipients into for each of `eras`, and the
 * staging account where slashes, burns and unclaimed rewards wait to be moved into the buffer.
 */
export async function fetchDap(eras: number[]): Promise<Dap> {
	const api = await ahApi();
	const opts = { at: await ahFinalizedHash() };
	const [recipients, staging, palletId, cadence, maxElapsed, lastDrip, totalIssuance, inactiveIssuance] =
		await Promise.all([
			api.view.Dap.budget_recipients(opts),
			api.view.Dap.staging(opts),
			api.constants.Dap.PalletId(),
			api.constants.Dap.IssuanceCadence(),
			api.constants.Dap.MaxElapsedPerDrip(),
			api.query.Dap.LastIssuanceTimestamp.getValue(opts),
			api.query.Balances.TotalIssuance.getValue(opts),
			api.query.Balances.InactiveIssuance.getValue(opts),
		]);

	const buffer = palletAccount(palletId.asBytes());
	const found = recipients.map(([rawKey, address, share]) => {
		const key = rawKey.asText();
		const kind = POT_KIND[key];
		return {
			role: roleOf(key, address, buffer),
			key,
			address,
			share: share as number | null,
			pots: kind === undefined ? null : eraPotsOf(address, kind, eras),
		};
	});
	// The buffer collects slashes and burns even if a runtime does not drip into it.
	if (!found.some((a) => a.role === "buffer"))
		found.push({ role: "buffer", key: "buffer", address: buffer, share: null, pots: null });
	found.push({ role: "staging", key: "staging", address: staging, share: null, pots: null });

	const addresses = [...found.map((a) => a.address), ...found.flatMap((a) => a.pots ?? [])];
	const infos = await api.query.System.Account.getValues(
		addresses.map((a) => [a]),
		opts,
	);
	const balanceOf = new Map(addresses.map((a, i) => [a, infos[i].data.free + infos[i].data.reserved]));
	const balance = (a: string) => balanceOf.get(a) ?? 0n;

	const accounts: DapAccount[] = found.map(({ pots, ...a }) => ({
		...a,
		balance: balance(a.address),
		eraPots: pots && { eras: pots.length, balance: pots.reduce((sum, p) => sum + balance(p), 0n) },
	}));
	return {
		accounts,
		cadenceMs: Number(cadence),
		maxElapsedMs: Number(maxElapsed),
		lastDripMs: Number(lastDrip),
		totalIssuance,
		inactiveIssuance,
	};
}
