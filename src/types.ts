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
}

export interface Overview {
	activeEra: number;
	activeEraStartSession: number;
	/** Concluded eras still holding reward points, newest first. */
	eras: EraPoints[];
	tokenDecimals: number;
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
	/** Points not explained by authorship: parachain backing, plus rare dispute statements. */
	otherPoints: number | null;
}
