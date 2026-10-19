export interface EraPoints {
	era: number;
	/** First relay session whose points were credited to this era. */
	startSession: number;
	/** True if `startSession` was extrapolated because the era is older than `BondedEras`. */
	startSessionInferred: boolean;
	totalPoints: number;
	/** Validator payout pot of the era in planck, if recorded. */
	validatorReward: bigint | null;
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
	blocks: number | null;
	authorPoints: number | null;
	/** Points not explained by authorship: parachain backing, plus rare dispute statements. */
	otherPoints: number | null;
}
