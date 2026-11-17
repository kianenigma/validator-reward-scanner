/** The self-stake incentive pot of one era, from `Staking::ErasValidatorIncentiveBudget`. */
export interface EraIncentive {
	/** Planck. */
	budget: bigint;
	/** True if shares are `weight × points`, false for the legacy stake-only `weight`. */
	weighted: boolean;
	/** `ErasSumWeightedPoints` if `weighted`, else `ErasSumValidatorIncentiveWeight`. */
	denominator: bigint;
}

export interface EraPoints {
	era: number;
	/** First relay session whose points were credited to this era. */
	startSession: number;
	/** True if `startSession` was extrapolated because the era is older than `BondedEras`. */
	startSessionInferred: boolean;
	totalPoints: number;
	/** Staker reward pot of the era in planck (`Staking::ErasValidatorReward`), if recorded. */
	validatorReward: bigint | null;
	incentive: EraIncentive | null;
	/** `[stash, points]`, as stored in `Staking::ErasRewardPoints`. */
	individual: [string, number][];
	/**
	 * Points for authoring system chain blocks, part of `totalPoints` and `individual`:
	 * `Staking::ErasRewardPointsByService` under `Collation`. Zero where the runtime credits none.
	 */
	collation: { total: number; individual: Record<string, number> };
}

export interface Overview {
	activeEra: number;
	activeEraStartSession: number;
	/** Concluded eras still holding reward points, newest first. */
	eras: EraPoints[];
	/** The running era, once at least one of its sessions has been reported to Asset Hub. */
	current: EraPoints | null;
	/** First session not yet reported to Asset Hub; `current` holds the points before it. */
	currentEndSession: number;
	/** `Dap::BudgetAllocation`: each budget's share of issuance in parts per billion, by budget key. */
	allocation: Record<string, number>;
	/** When this overview was read, in ms since the epoch. */
	readAt: number;
	/** `Staking::SessionsPerEra`; eras older than `BondedEras` are assumed to last this long. */
	sessionsPerEra: number;
	tokenDecimals: number;
	tokenSymbol: string;
}

/**
 * What an account is to the DAP: its own buffer, one of the two staking pots it drips into, the
 * staging account its inflows pass through, or another drip recipient.
 */
export type DapRole = "buffer" | "staker" | "incentive" | "staging" | "other";

export interface DapAccount {
	role: DapRole;
	/** The `BudgetKey` of a drip recipient; `staging` for the staging account. */
	key: string;
	address: string;
	/** Share of each drip in parts per billion, or null if the drip does not pay this account. */
	share: number | null;
	/** Free plus reserved, in planck. */
	balance: bigint;
	/**
	 * For a staking pot: the era pots staking moved it into at the end of each era still held, and
	 * what is left in them in planck.
	 */
	eraPots: { eras: number; balance: bigint } | null;
}

/** The DAP's accounts and drip settings, read at one Asset Hub block. */
export interface Dap {
	/** Drip recipients in runtime order, then the staging account. */
	accounts: DapAccount[];
	/** `Dap::IssuanceCadence`: least time between drips. */
	cadenceMs: number;
	/** `Dap::MaxElapsedPerDrip`: most time one drip mints for. */
	maxElapsedMs: number;
	/** `Dap::LastIssuanceTimestamp`, in ms since the epoch. */
	lastDripMs: number;
	totalIssuance: bigint;
	/** `Balances::InactiveIssuance`; the buffer deactivates everything it receives. */
	inactiveIssuance: bigint;
}

export interface SessionRange {
	session: number;
	firstBlock: number;
	/** Exclusive. */
	endBlock: number;
	validators: number;
}

/** Relay chain authorship of one era, derived from block headers. */
export interface EraScan {
	era: number;
	fromBlock: number;
	toBlock: number;
	sessions: SessionRange[];
	/** stash -> relay blocks authored in the era. */
	authored: Record<string, number>;
	scannedAt: number;
}

export interface ValidatorRow {
	stash: string;
	name: string | null;
	points: number;
	/** Staker rewards of the validator and its nominators in planck: the pot split pro rata by points. */
	reward: bigint | null;
	/** Self-stake incentive of the validator in planck; null while its weight is loading. */
	incentive: bigint | null;
	/** `reward + incentive`, once both are known. */
	totalDot: bigint | null;
	blocks: number | null;
	authorPoints: number | null;
	/** Points for authoring system chain blocks. */
	collationPoints: number;
	/**
	 * Points explained by neither relay authorship nor collation: parachain backing, plus rare
	 * dispute statements.
	 */
	otherPoints: number | null;
}
