import { useMemo, useState } from "react";
import { POINTS_PER_BACKING, POINTS_PER_BLOCK } from "../api/chains";
import { endSessionOf, incentiveOf } from "../api/eras";
import { dot, dotAmount, fmt, pct, short, U32_MAX } from "../format";
import type { EraPoints, EraScan, Overview, ValidatorRow } from "../types";
import type { ScanJob } from "./App";

interface Props {
	era: EraPoints;
	overview: Overview;
	scan: EraScan | null;
	names: Map<string, string>;
	/** stash -> self-stake incentive weight, null while loading. */
	weights: Map<string, bigint> | null;
	job: ScanJob | null;
	queued: boolean;
	onScan: () => void;
	onRescan: () => void;
}

type SortKey = "points" | "reward" | "incentive" | "totalDot" | "blocks" | "authorPoints" | "otherPoints" | "authorShare" | "otherShare";

function SplitBar({ author, other, scale, title }: { author: number; other: number; scale: number; title?: string }) {
	return (
		<div className="split" title={title}>
			{author > 0 && <span className="seg author" style={{ width: `${(author / scale) * 100}%` }} />}
			{other > 0 && <span className="seg other" style={{ width: `${(other / scale) * 100}%` }} />}
		</div>
	);
}

export function EraDetail({ era, overview, scan, names, weights, job, queued, onScan, onRescan }: Props) {
	const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "points", desc: true });
	const [filter, setFilter] = useState("");

	const rows: ValidatorRow[] = useMemo(() => {
		// A block author that earned no points would be a bug in the derivation; keep it visible.
		const stashes = new Set([...era.individual.map(([s]) => s), ...Object.keys(scan?.authored ?? {})]);
		const points = new Map(era.individual);
		return [...stashes].map((stash) => {
			const p = points.get(stash) ?? 0;
			const blocks = scan ? (scan.authored[stash] ?? 0) : null;
			const authorPoints = blocks === null ? null : blocks * POINTS_PER_BLOCK;
			const reward =
				era.validatorReward === null || era.totalPoints === 0
					? null
					: (era.validatorReward * BigInt(p)) / BigInt(era.totalPoints);
			const incentive = !era.incentive ? 0n : weights ? incentiveOf(era.incentive, weights.get(stash) ?? 0n, p) : null;
			return {
				stash,
				name: names.get(stash) ?? null,
				points: p,
				reward,
				incentive,
				totalDot: reward === null || incentive === null ? null : reward + incentive,
				blocks,
				authorPoints,
				otherPoints: authorPoints === null ? null : p - authorPoints,
			};
		});
	}, [era, scan, names, weights]);

	const visible = useMemo(() => {
		const q = filter.trim().toLowerCase();
		const share = (part: number | null, whole: number) => (whole ? (part ?? 0) / whole : 0);
		const value = (r: ValidatorRow) =>
			sort.key === "authorShare"
				? share(r.authorPoints, r.points)
				: sort.key === "otherShare"
					? share(r.otherPoints, r.points)
					: Number(r[sort.key] ?? 0);
		return rows
			.filter((r) => !q || r.stash.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q))
			.sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)));
	}, [rows, filter, sort]);

	const blocks = scan ? scan.toBlock - scan.fromBlock : null;
	const authorTotal = blocks === null ? null : blocks * POINTS_PER_BLOCK;
	const otherTotal = authorTotal === null ? null : era.totalPoints - authorTotal;
	const maxPoints = Math.max(...rows.map((r) => r.points), 1);
	const endSession = endSessionOf(era, overview);
	const anomalies = rows.filter((r) => r.otherPoints !== null && r.otherPoints < 0).length;
	const u32Share = era.totalPoints / U32_MAX;
	const live = era.era === overview.activeEra;

	const amount = (planck: bigint | null) => (planck === null ? "…" : dotAmount(planck, overview.tokenDecimals, 2));

	const th = (key: SortKey, label: string) => (
		<th className="num" aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
			<button
				className={`sort ${sort.key === key ? "active" : ""}`}
				onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
			>
				{label}
				<span className="arrow" aria-hidden>
					{sort.key === key ? (sort.desc ? "↓" : "↑") : ""}
				</span>
			</button>
		</th>
	);

	return (
		<>
			<section className="hero" aria-live="polite">
				{authorTotal !== null && otherTotal !== null ? (
					<h2 className="headline">
						In era {era.era}{live ? " so far" : ""}, authoring relay blocks earned{" "}
						<span className="figure author-ink">{pct(authorTotal, era.totalPoints)}</span> of the{" "}
						<span className="figure">{fmt(era.totalPoints)}</span> points. Parachain consensus earned the
						other <span className="figure other-ink">{pct(otherTotal, era.totalPoints)}</span>.
					</h2>
				) : (
					<h2 className="headline">
						Era {era.era} {live ? "has issued" : "issued"} <span className="figure">{fmt(era.totalPoints)}</span>{" "}
						points to <span className="figure">{fmt(era.individual.length)}</span> validators{live ? " so far" : ""}.
					</h2>
				)}

				{scan && authorTotal !== null && otherTotal !== null && (
					<div className="hero-split">
						<SplitBar author={authorTotal} other={otherTotal} scale={era.totalPoints} />
						<div className="split-key">
							<span>
								<i className="swatch author" />
								Relay block authorship: {fmt(blocks!)} blocks × {POINTS_PER_BLOCK} = {fmt(authorTotal)} pts
							</span>
							<span>
								<i className="swatch other" />
								Parachain consensus: {fmt(otherTotal)} pts, about {fmt(Math.round(otherTotal / POINTS_PER_BACKING))}{" "}
								backed candidates at {POINTS_PER_BACKING} pts each
							</span>
						</div>
					</div>
				)}

				{!scan && (
					<div className="scan-cta">
						{job ? (
							<div className="progress" role="status">
								<div className="progress-track">
									<span style={{ width: `${job.frac * 100}%` }} />
								</div>
								<span>{job.msg}</span>
							</div>
						) : (
							<>
								<button className="btn primary" disabled={queued} onClick={onScan}>
									{queued ? "Waiting for the current scan" : "Count authored blocks"}
								</button>
								<span className="muted">
									Reads the era's relay chain headers to split these points by source.
								</span>
							</>
						)}
					</div>
				)}
			</section>

			<dl className="facts">
				<div>
					<dt>Share of u32::MAX</dt>
					<dd>
						{pct(era.totalPoints, U32_MAX)}
						<span className="gauge" aria-hidden>
							<span style={{ width: `${Math.max(u32Share * 100, 0.5)}%` }} />
						</span>
						<small>{fmt(U32_MAX - era.totalPoints)} pts of headroom</small>
					</dd>
				</div>
				<div>
					<dt>Average per validator</dt>
					<dd>{fmt(Math.round(era.totalPoints / Math.max(1, era.individual.length)))}</dd>
				</div>
				{live && (
					<div>
						<dt>Rewards</dt>
						<dd>
							Not set yet
							<small>Both DOT pots are snapshotted when the era ends</small>
						</dd>
					</div>
				)}
				{era.validatorReward !== null && (
					<div>
						<dt>Staker rewards pot</dt>
						<dd>
							{dot(era.validatorReward, overview.tokenDecimals)}
							<small>Split by points, shared with nominators</small>
						</dd>
					</div>
				)}
				{era.incentive && (
					<div>
						<dt>Self-stake incentive pot</dt>
						<dd>
							{dot(era.incentive.budget, overview.tokenDecimals)}
							<small>
								Split by self-stake weight{era.incentive.weighted ? " × points" : " only (pre-cutoff era)"}, to
								the validator
							</small>
						</dd>
					</div>
				)}
				<div>
					<dt>Relay sessions</dt>
					<dd>
						{era.startSession}–{endSession - 1}
						{era.startSessionInferred && <small>Inferred: older than Staking.BondedEras</small>}
						{live && (
							<small>
								Reported to Asset Hub by {new Date(overview.readAt).toLocaleTimeString()}; the era is still
								running
							</small>
						)}
					</dd>
				</div>
				<div>
					<dt>Relay blocks</dt>
					<dd>
						{scan ? (
							<>
								{fmt(blocks!)}
								<small>
									#{fmt(scan.fromBlock)} to #{fmt(scan.toBlock - 1)}{" "}
									<button className="text-btn" onClick={onRescan}>
										Rescan
									</button>
								</small>
							</>
						) : (
							"Not scanned"
						)}
					</dd>
				</div>
			</dl>

			{anomalies > 0 && (
				<p className="alert" role="alert">
					{anomalies} validators have more authoring points than total points, so this era's session range
					is likely wrong. Treat the split below with caution.
				</p>
			)}

			<section className="validators">
				<div className="table-head">
					<h2 className="section-title">
						{fmt(visible.length)} validators
						{filter && <span className="muted"> matching “{filter}”</span>}
					</h2>
					<input
						className="search"
						type="search"
						placeholder="Find by name or address"
						aria-label="Find validator by name or address"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
				</div>
				<div className="table-scroll">
					<table>
						<thead>
							<tr>
								<th className="rank">#</th>
								<th>Validator</th>
								{th("points", "Points")}
								<th className="num">Of era</th>
								{era.validatorReward !== null && th("reward", "Staker DOT")}
								{era.incentive && th("incentive", "Incentive DOT")}
								{era.validatorReward !== null && era.incentive && th("totalDot", "Total DOT")}
								{th("blocks", "Blocks")}
								{th("authorPoints", "Authoring")}
								{th("authorShare", "%")}
								{th("otherPoints", "Para consensus")}
								{th("otherShare", "%")}
								<th className="bar-col">Split</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((r, i) => (
								<tr key={r.stash} className={r.otherPoints !== null && r.otherPoints < 0 ? "anomaly" : ""}>
									<td className="rank">{i + 1}</td>
									<td className="who" title={r.stash}>
										<span className={r.name ? "name" : "name anon"}>{r.name ?? short(r.stash)}</span>
										{r.name && <span className="addr">{short(r.stash)}</span>}
									</td>
									<td className="num strong">{fmt(r.points)}</td>
									<td className="num">{pct(r.points, era.totalPoints, 3)}</td>
									{era.validatorReward !== null && (
										<td className="num" title="Staker rewards: paid to the validator and its nominators, before commission">
											{amount(r.reward)}
										</td>
									)}
									{era.incentive && (
										<td className="num" title="Self-stake incentive: paid to the validator only">
											{amount(r.incentive)}
										</td>
									)}
									{era.validatorReward !== null && era.incentive && (
										<td className="num strong">{amount(r.totalDot)}</td>
									)}
									<td className="num">{r.blocks === null ? "–" : fmt(r.blocks)}</td>
									<td className="num">{r.authorPoints === null ? "–" : fmt(r.authorPoints)}</td>
									<td className="num soft">{r.authorPoints === null ? "–" : pct(r.authorPoints, r.points)}</td>
									<td className="num">{r.otherPoints === null ? "–" : fmt(r.otherPoints)}</td>
									<td className="num soft">{r.otherPoints === null ? "–" : pct(r.otherPoints, r.points)}</td>
									<td className="bar-col">
										<SplitBar
											author={r.authorPoints ?? 0}
											other={r.otherPoints ?? r.points}
											scale={maxPoints}
											title={
												r.authorPoints === null
													? `${fmt(r.points)} pts`
													: `${fmt(r.blocks!)} blocks → ${fmt(r.authorPoints)} pts from authorship\n${fmt(r.otherPoints!)} pts from parachain consensus (≈ ${fmt(Math.round(r.otherPoints! / POINTS_PER_BACKING))} backings)`
											}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</>
	);
}
