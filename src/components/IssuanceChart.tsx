import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { dotAmount, fmt } from "../format";
import type { Overview } from "../types";

const PERBILL = 1_000_000_000n;
const OPEN_KEY = "validator-reward-scanner.issuance-chart-open";

/** Stacked bottom to top. */
const SERIES = [
	{ key: "staker", label: "Staker rewards" },
	{ key: "incentive", label: "Validator incentive" },
	{ key: "dap", label: "DAP" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];
const TOP_DOWN = [...SERIES].reverse();

/** Where one concluded era's issuance went, in planck. */
type Bar = Record<SeriesKey | "total", bigint> & { era: number };

/**
 * The DAP mints every minute and splits each drip by `Dap::BudgetAllocation`; staking snapshots its
 * two pots when the era ends. The DAP's own cut is not recorded per era, so the era's issuance is
 * the staker pot over its share, and the DAP's cut is whatever the two pots did not get.
 */
function issuanceBars(overview: Overview): Bar[] {
	const share = BigInt(overview.allocation.staker_rewards ?? 0);
	if (share === 0n) return [];
	const bars: Bar[] = [];
	for (const e of overview.eras) {
		if (e.validatorReward === null || !e.incentive) continue;
		const staker = e.validatorReward;
		const incentive = e.incentive.budget;
		const issued = (staker * PERBILL) / share;
		const dap = issued > staker + incentive ? issued - staker - incentive : 0n;
		bars.push({ era: e.era, staker, incentive, dap, total: staker + incentive + dap });
	}
	return bars.reverse();
}

/** The smallest 1, 2, 2.5 or 5 × 10^k that is at least `x`. */
function niceStep(x: number): number {
	const p = 10 ** Math.floor(Math.log10(x));
	return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= x)!;
}

const compact = (v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}K` : `${v}`);
const share = (part: bigint, whole: bigint) =>
	whole > 0n ? `${(Number((part * 1000n + whole / 2n) / whole) / 10).toFixed(1)}%` : "–";

/** Collapsed unless the viewer left it open last time. */
function readOpen(): boolean {
	try {
		return localStorage.getItem(OPEN_KEY) === "true";
	} catch {
		return false;
	}
}

interface Props {
	overview: Overview;
	selected: number | null;
	onSelect: (era: number) => void;
}

/** Stacked bars of each concluded era's issuance: staker rewards, validator incentive and the DAP's cut. */
export function IssuanceChart({ overview, selected, onSelect }: Props) {
	const bars = useMemo(() => issuanceBars(overview), [overview]);
	const [open, setOpen] = useState(readOpen);
	const [tip, setTip] = useState<{ i: number; x: number; flip: boolean } | null>(null);
	const frame = useRef<HTMLDivElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const cols = useRef<(HTMLDivElement | null)[]>([]);

	// The newest eras are on the right; start there when the chart is wider than the screen.
	useEffect(() => {
		const el = scroller.current;
		if (open && el) el.scrollLeft = el.scrollWidth;
	}, [open, bars.length]);

	// Browsers also fire `toggle` when a details element is first rendered open; only a real change counts.
	const toggle = (next: boolean) => {
		if (next === open) return;
		setOpen(next);
		try {
			localStorage.setItem(OPEN_KEY, String(next));
		} catch {
			// not remembered; still toggled for this visit
		}
	};

	const place = (i: number) => {
		const col = cols.current[i];
		const box = frame.current;
		if (!col || !box) return;
		const c = col.getBoundingClientRect();
		const b = box.getBoundingClientRect();
		const x = c.left + c.width / 2 - b.left;
		setTip({ i, x, flip: x > b.width * 0.6 });
	};

	const selectedIndex = bars.findIndex((b) => b.era === selected);
	const onKey = (e: KeyboardEvent) => {
		const last = bars.length - 1;
		const at = tip?.i ?? (selectedIndex >= 0 ? selectedIndex : last);
		if ((e.key === "Enter" || e.key === " ") && tip) {
			e.preventDefault();
			onSelect(bars[tip.i].era);
			return;
		}
		if (e.key === "Escape") return setTip(null);
		const next =
			e.key === "ArrowLeft" ? at - 1 : e.key === "ArrowRight" ? at + 1 : e.key === "Home" ? 0 : e.key === "End" ? last : null;
		if (next === null) return;
		e.preventDefault();
		const i = Math.min(last, Math.max(0, next));
		cols.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
		place(i);
	};

	const latest = bars[bars.length - 1];
	const dotOf = (planck: bigint) => Number(planck) / 10 ** overview.tokenDecimals;
	const amount = (planck: bigint) => dotAmount(planck, overview.tokenDecimals);
	const max = Math.max(...bars.map((b) => dotOf(b.total)), 1);
	const step = niceStep(max / 4);
	const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
	const yMax = max * 1.06;
	const labelEvery = bars.length > 40 ? 10 : bars.length > 15 ? 5 : 1;
	const stakerShare = overview.allocation.staker_rewards;

	return (
		<details className="issuance" open={open} onToggle={(e) => toggle(e.currentTarget.open)}>
			<summary>
				<span className="section-title">Issuance per era</span>
				{latest && (
					<span className="issuance-sub">
						{amount(latest.total)} DOT minted in era {latest.era}: {share(latest.staker, latest.total)} staker
						rewards, {share(latest.incentive, latest.total)} validator incentive, {share(latest.dap, latest.total)}{" "}
						DAP
					</span>
				)}
			</summary>

			<div className="issuance-body">
				{bars.length === 0 ? (
					<p className="muted">No concluded era has both staking pots recorded yet.</p>
				) : (
					<>
						<div className="issuance-key">
							{TOP_DOWN.map((s) => (
								<span key={s.key}>
									<i className={`swatch ${s.key}`} />
									{s.label}
								</span>
							))}
						</div>

						<div className="ichart" ref={frame}>
							<div className="ichart-y" aria-hidden>
								{ticks.map((v) => (
									<span key={v} style={{ bottom: `${(v / yMax) * 100}%` }}>
										{compact(v)}
									</span>
								))}
							</div>
							<div
								className="ichart-scroll"
								ref={scroller}
								tabIndex={0}
								role="group"
								aria-label="DOT issued per era. Arrow keys move between eras, Enter opens one."
								onKeyDown={onKey}
								onFocus={() => tip || place(selectedIndex >= 0 ? selectedIndex : bars.length - 1)}
								onBlur={() => setTip(null)}
								onMouseLeave={() => setTip(null)}
								onScroll={() => tip && place(tip.i)}
							>
								<div className="ichart-inner" style={{ minWidth: `${bars.length * 6}px` }}>
									<div className="ichart-grid" aria-hidden>
										{ticks.map((v) => (
											<i key={v} className={v === 0 ? "base" : ""} style={{ bottom: `${(v / yMax) * 100}%` }} />
										))}
									</div>
									<div className="ichart-cols">
										{bars.map((b, i) => (
											<div
												key={b.era}
												ref={(el) => {
													cols.current[i] = el;
												}}
												className={`icol${tip?.i === i ? " active" : ""}${b.era === selected ? " selected" : ""}`}
												onMouseEnter={() => place(i)}
												onClick={() => onSelect(b.era)}
											>
												<div className="istack" style={{ height: `${(dotOf(b.total) / yMax) * 100}%` }}>
													{SERIES.map((s) => b[s.key] > 0n && <span key={s.key} className={`seg ${s.key}`} style={{ flexGrow: dotOf(b[s.key]) }} />)}
												</div>
											</div>
										))}
									</div>
									<div className="ichart-x" aria-hidden>
										{bars.map(
											(b, i) =>
												b.era % labelEvery === 0 && (
													<span key={b.era} style={{ left: `${((i + 0.5) / bars.length) * 100}%` }}>
														{b.era}
													</span>
												),
										)}
									</div>
								</div>
							</div>

							{tip && (
								<div className={`itip${tip.flip ? " flip" : ""}`} style={{ left: tip.x }} role="status">
									<div className="itip-head">Era {bars[tip.i].era}</div>
									{TOP_DOWN.map((s) => (
										<div className="itip-row" key={s.key}>
											<span>
												<i className={`swatch ${s.key}`} />
												{s.label}
											</span>
											<span>{amount(bars[tip.i][s.key])} DOT</span>
											<span className="soft">{share(bars[tip.i][s.key], bars[tip.i].total)}</span>
										</div>
									))}
									<div className="itip-row total">
										<span>Total issuance</span>
										<span>{amount(bars[tip.i].total)} DOT</span>
										<span />
									</div>
								</div>
							)}
						</div>

						<p className="issuance-note">
							Concluded eras. Staker rewards and validator incentive are the era's pots
							(<code>Staking::ErasValidatorReward</code>, <code>ErasValidatorIncentiveBudget</code>). The era's
							issuance is the staker pot divided by its share of <code>Dap::BudgetAllocation</code> (
							{fmt(Number(stakerShare ?? 0) / 1e7)}% today), and the DAP gets the rest. That holds as long as
							the staker share has not changed since. Click a bar to open its era.
						</p>
					</>
				)}
			</div>
		</details>
	);
}
