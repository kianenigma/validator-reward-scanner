import { POINTS_PER_BLOCK } from "../api/chains";
import { fmt, pct } from "../format";
import type { EraScan, Overview } from "../types";
import type { ScanJob } from "./App";

interface Props {
	overview: Overview;
	scans: Map<number, EraScan>;
	selected: number | null;
	onSelect: (era: number) => void;
	queue: number[];
	job: ScanJob | null;
}

/** Every concluded era, oldest to newest, as a selectable timeline. */
export function EraStrip({ overview, scans, selected, onSelect, queue, job }: Props) {
	const eras = [...overview.eras].reverse();
	return (
		<nav className="strip" aria-label="Concluded eras">
			{eras.map((e) => {
				const scan = scans.get(e.era);
				const isJob = job?.era === e.era;
				const state = scan ? "scanned" : isJob ? "scanning" : queue.includes(e.era) ? "queued" : "idle";
				const tip = [
					`Era ${e.era}${e.startSessionInferred ? " (session range inferred)" : ""}`,
					`${fmt(e.totalPoints)} points`,
					scan
						? `${pct((scan.toBlock - scan.fromBlock) * POINTS_PER_BLOCK, e.totalPoints)} from authorship`
						: isJob
							? "Scanning…"
							: queue.includes(e.era)
								? "Queued"
								: "Not scanned",
				].join("\n");
				return (
					<button
						key={e.era}
						className={`chip ${state} ${e.era === selected ? "selected" : ""}`}
						title={tip}
						aria-pressed={e.era === selected}
						onClick={() => onSelect(e.era)}
					>
						{e.era}
						{isJob && <span className="chip-fill" style={{ width: `${job!.frac * 100}%` }} />}
					</button>
				);
			})}
		</nav>
	);
}
