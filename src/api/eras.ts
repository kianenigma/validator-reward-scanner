import { ahApi, peopleApi, SESSIONS_PER_ERA } from "./chains";
import { firstBlockOfSession, scanAuthors, sessionTip, sessionValidatorsAt } from "./relay";
import type { EraPoints, EraScan, Overview, SessionRange } from "../types";

/**
 * Reward points of every concluded era that Asset Hub still holds.
 *
 * Asset Hub credits the relay's report for session `s` to the era active when it arrives, and only
 * then may start the next era at session `s + 1`. So era `e` holds the points of relay sessions
 * `[start(e), start(e + 1))`, with `start` from `Staking::BondedEras`.
 */
export async function fetchOverview(onProgress: (msg: string) => void): Promise<Overview> {
	const api = await ahApi();
	onProgress("Reading staking state from Asset Hub...");
	const [active, bonded, pointEntries, rewardEntries] = await Promise.all([
		api.query.Staking.ActiveEra.getValue(),
		api.query.Staking.BondedEras.getValue(),
		api.query.Staking.ErasRewardPoints.getEntries(),
		api.query.Staking.ErasValidatorReward.getEntries(),
	]);
	if (!active) throw new Error("Staking.ActiveEra is empty");
	if (bonded.length === 0) throw new Error("Staking.BondedEras is empty");

	const startOf = new Map(bonded.map(([era, session]) => [era, session]));
	const [oldestEra, oldestSession] = bonded[0];
	const rewards = new Map(rewardEntries.map(({ keyArgs, value }) => [keyArgs[0], value]));

	const eras: EraPoints[] = pointEntries
		.filter(({ keyArgs }) => keyArgs[0] < active.index)
		.map(({ keyArgs: [era], value }) => {
			const known = startOf.get(era);
			return {
				era,
				startSession: known ?? oldestSession - (oldestEra - era) * SESSIONS_PER_ERA,
				startSessionInferred: known === undefined,
				totalPoints: value.total,
				validatorReward: rewards.get(era) ?? null,
				individual: value.individual.map(([stash, p]) => [stash, p] as [string, number]),
			};
		})
		.sort((a, b) => b.era - a.era);

	// The end of each era is the start of the next one; the newest concluded era ends where the
	// active one starts.
	const activeEraStartSession = startOf.get(active.index);
	if (activeEraStartSession === undefined) throw new Error("active era missing from BondedEras");
	return { activeEra: active.index, activeEraStartSession, eras, tokenDecimals: 10 };
}

/** The first session after `era`, i.e. the start of `era + 1`. */
export function endSessionOf(era: EraPoints, overview: Overview): number {
	const next = overview.eras.find((e) => e.era === era.era + 1);
	if (next) return next.startSession;
	if (era.era + 1 === overview.activeEra) return overview.activeEraStartSession;
	return era.startSession + SESSIONS_PER_ERA;
}

/** Counts the relay blocks each validator authored over the sessions of `era`. */
export async function scanEra(
	era: EraPoints,
	endSession: number,
	onProgress: (msg: string, frac: number) => void,
): Promise<EraScan> {
	onProgress("Locating session boundaries on the relay chain...", 0);
	const tip = await sessionTip();
	const sessionIds = Array.from({ length: endSession - era.startSession + 1 }, (_, i) => era.startSession + i);
	const boundaries = await Promise.all(sessionIds.map((s) => firstBlockOfSession(s, tip)));

	onProgress("Reading session validator sets...", 0);
	const validatorSets = await Promise.all(boundaries.slice(0, -1).map((b) => sessionValidatorsAt(b)));
	const sessions: SessionRange[] = validatorSets.map((v, i) => ({
		session: sessionIds[i],
		firstBlock: boundaries[i],
		endBlock: boundaries[i + 1],
		validators: v.length,
	}));

	const from = boundaries[0];
	const to = boundaries[boundaries.length - 1];
	const total = to - from;
	const authors = await scanAuthors(from, to, (done) =>
		onProgress(`Scanning relay blocks ${done.toLocaleString()} / ${total.toLocaleString()}`, done / total),
	);

	const authored: Record<string, number> = {};
	sessions.forEach((s, i) => {
		for (let n = s.firstBlock; n < s.endBlock; n++) {
			const stash = validatorSets[i][authors[n - from]];
			if (!stash) throw new Error(`block ${n}: authority ${authors[n - from]} not in session ${s.session}`);
			authored[stash] = (authored[stash] ?? 0) + 1;
		}
	});

	return { era: era.era, fromBlock: from, toBlock: to, sessions, authored, scannedAt: Date.now() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function displayName(data: any): string | null {
	if (!data || data.type === "None") return null;
	const v = data.value;
	if (v && typeof v === "object" && "asText" in v) return v.asText();
	return typeof v === "string" ? v : null;
}

/** On-chain identities of `stashes` from the People chain, as `parent/sub` where applicable. */
export async function fetchIdentities(stashes: string[]): Promise<Map<string, string>> {
	const api = await peopleApi();
	const supers = await api.query.Identity.SuperOf.getValues(stashes.map((s) => [s]));
	const owners = stashes.map((s, i) => supers[i]?.[0] ?? s);
	const unique = [...new Set(owners)];
	const ids = await api.query.Identity.IdentityOf.getValues(unique.map((s) => [s]));
	const nameOf = new Map(unique.map((s, i) => [s, displayName(ids[i]?.info.display)]));

	const out = new Map<string, string>();
	stashes.forEach((s, i) => {
		const parent = nameOf.get(owners[i]);
		const sub = supers[i] ? displayName(supers[i]![1]) : null;
		const name = [parent, sub].filter(Boolean).join("/");
		if (name) out.set(s, name);
	});
	return out;
}
