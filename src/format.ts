/** `EraRewardPoints::total` is a `u32`. */
export const U32_MAX = 4_294_967_295;

export const fmt = (n: number) => n.toLocaleString("en-US");

export const pct = (part: number, whole: number, digits = 2) =>
	whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : "–";

export const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-6)}`;

/** `planck` in whole tokens, to at most two decimals. */
export function tokenAmount(planck: bigint, decimals: number, digits = 0): string {
	const whole = Number(planck / 10n ** BigInt(decimals - 2)) / 100;
	return whole.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export const tokens = (planck: bigint, decimals: number, symbol: string) =>
	`${tokenAmount(planck, decimals)} ${symbol}`;
