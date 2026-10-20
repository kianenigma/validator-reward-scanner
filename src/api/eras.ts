import { ahApi, ahFinalizedHash, peopleApi, SESSIONS_PER_ERA } from "./chains";
import { firstBlockOfSession, scanAuthors, sessionTip, sessionValidatorsAt } from "./relay";
import type { EraIncentive, EraPoints, EraScan, Overview, SessionRange } from "../types";

/**
 * Reward points of every era that Asset Hub still holds, including the running one.
 *
 * Asset Hub credits the relay's report for session `s` to the era active when it arrives, and only
 * then may start the next era at session `s + 1`. So era `e` holds the points of relay sessions
 * `[start(e), start(e + 1))`, with `start` from `Staking::BondedEras`, and the running era holds
 * those up to the last session report received.
 */
export async function fetchOverview(onProgress: (msg: string) => void, at?: string): Promise<Overview> {
	const api = await ahApi();
	onProgress("Reading staking state from Asset Hub...");
	// One block for all reads, so the running era's points match its last reported session.
	const opts = { at: at ?? (await ahFinalizedHash()) };
	const [
		active,
		bonded,
		pointEntries,
		rewardEntries,
		incentiveEntries,
		sumWeightEntries,
		sumWeightedPointsEntries,
		weightedPointsStart,
		lastReportedSession,
	] = await Promise.all([
		api.query.Staking.ActiveEra.getValue(opts),
		api.query.Staking.BondedEras.getValue(opts),
		api.query.Staking.ErasRewardPoints.getEntries(opts),
		api.query.Staking.ErasValidatorReward.getEntries(opts),
		api.query.Staking.ErasValidatorIncentiveBudget.getEntries(opts),
		api.query.Staking.ErasSumValidatorIncentiveWeight.getEntries(opts),
		api.query.Staking.ErasSumWeightedPoints.getEntries(opts),
		api.query.Staking.WeightedPointsFormulaStartEra.getValue(opts),
		api.query.StakingRcClient.LastSessionReportEndingIndex.getValue(opts),
	]);
	if (!active) throw new Error("Staking.ActiveEra is empty");
	if (bonded.length === 0) throw new Error("Staking.BondedEras is empty");

	const startOf = new Map(bonded.map(([era, session]) => [era, session]));
	const [oldestEra, oldestSession] = bonded[0];
	const byEra = (entries: { keyArgs: [number]; value: bigint }[]) =>
		new Map(entries.map(({ keyArgs, value }) => [keyArgs[0], value]));
	const rewards = byEra(rewardEntries);
	const incentives = byEra(incentiveEntries);
	const sumWeights = byEra(sumWeightEntries);
	const sumWeightedPoints = byEra(sumWeightedPointsEntries);

	// See `calculate_validator_incentive_for_page` in pallet-staking-async: eras from the cutoff on
	// share the pot by `weight × points`, older ones by `weight` alone. No cutoff recorded means
	// every era is weighted.
	const incentiveOf = (era: number): EraIncentive | null => {
		const budget = incentives.get(era);
		if (!budget) return null;
		const weighted = weightedPointsStart === undefined || era >= weightedPointsStart;
		const denominator = (weighted ? sumWeightedPoints : sumWeights).get(era) ?? 0n;
		return { budget, weighted, denominator };
	};

	const all: EraPoints[] = pointEntries
		.filter(({ keyArgs }) => keyArgs[0] <= active.index)
		.map(({ keyArgs: [era], value }) => {
			const known = startOf.get(era);
			return {
				era,
				startSession: known ?? oldestSession - (oldestEra - era) * SESSIONS_PER_ERA,
				startSessionInferred: known === undefined,
				totalPoints: value.total,
				validatorReward: rewards.get(era) ?? null,
				incentive: incentiveOf(era),
				individual: value.individual.map(([stash, p]) => [stash, p] as [string, number]),
			};
		})
		.sort((a, b) => b.era - a.era);

	// The end of each era is the start of the next one; the newest concluded era ends where the
	// active one starts.
	const activeEraStartSession = startOf.get(active.index);
	if (activeEraStartSession === undefined) throw new Error("active era missing from BondedEras");
	const reportedEndSession = (lastReportedSession ?? -1) + 1;
	// Until a session of the running era is reported it has no points to explain.
	const current =
		reportedEndSession > activeEraStartSession ? (all.find((e) => e.era === active.index) ?? null) : null;
	return {
		activeEra: active.index,
		activeEraStartSession,
		eras: all.filter((e) => e.era < active.index),
		current,
		currentEndSession: reportedEndSession,
		readAt: Date.now(),
		tokenDecimals: 10,
	};
}

/** A concluded era, or the running one. */
export function findEra(overview: Overview, era: number): EraPoints | null {
	if (overview.current?.era === era) return overview.current;
	return overview.eras.find((e) => e.era === era) ?? null;
}

/** The first session after `era`, i.e. the start of `era + 1`; for the running era, the first unreported one. */
export function endSessionOf(era: EraPoints, overview: Overview): number {
	if (era.era === overview.activeEra) return overview.currentEndSession;
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

/** stash -> self-stake incentive weight of every validator elected for `era`. */
export async function fetchIncentiveWeights(era: number): Promise<Map<string, bigint>> {
	const api = await ahApi();
	const entries = await api.query.Staking.ErasValidatorIncentiveWeight.getEntries(era);
	return new Map(entries.map(({ keyArgs, value }) => [keyArgs[1], value]));
}

/**
 * The self-stake incentive `stash` is owed for an era, before the per-page rounding of payout.
 * Validators without era points are not paid.
 */
export function incentiveOf(incentive: EraIncentive, weight: bigint, points: number): bigint {
	if (points === 0 || weight === 0n || incentive.denominator === 0n) return 0n;
	const numerator = incentive.weighted ? weight * BigInt(points) : weight;
	return (incentive.budget * numerator) / incentive.denominator;
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
