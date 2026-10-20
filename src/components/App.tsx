import { useCallback, useEffect, useRef, useState } from "react";
import { endSessionOf, fetchIdentities, fetchIncentiveWeights, fetchOverview, scanEra } from "../api/eras";
import { deleteScan, loadScans, saveScan } from "../cache";
import type { EraScan, Overview } from "../types";
import { EraStrip } from "./EraStrip";
import { EraDetail } from "./EraDetail";
import { useTheme, type ThemeChoice } from "../theme";
import { SettingsDialog } from "./SettingsDialog";
import { configure } from "../api/chains";
import { loadSettings, saveSettings, type Settings } from "../settings";

const THEMES: [ThemeChoice, string][] = [
	["system", "Auto"],
	["light", "Light"],
	["dark", "Dark"],
];

export interface ScanJob {
	era: number;
	msg: string;
	frac: number;
}

export function App() {
	const [overview, setOverview] = useState<Overview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [progress, setProgress] = useState("Connecting to Polkadot…");
	const [scans, setScans] = useState<Map<number, EraScan>>(new Map());
	const [names, setNames] = useState<Map<string, string>>(new Map());
	const [selected, setSelected] = useState<number | null>(null);
	const [weights, setWeights] = useState<Map<number, Map<string, bigint>>>(new Map());
	const [queue, setQueue] = useState<number[]>([]);
	const [job, setJob] = useState<ScanJob | null>(null);
	const [scanError, setScanError] = useState<string | null>(null);
	const running = useRef(false);
	const [theme, setTheme] = useTheme();
	const [settings] = useState<Settings>(() => {
		const s = loadSettings();
		configure(s);
		return s;
	});
	const [settingsOpen, setSettingsOpen] = useState(false);
	// Reloading is the simplest way to drop every open connection, cached query and running scan.
	const applySettings = (s: Settings) => {
		saveSettings(s);
		location.reload();
	};
	const settingsDialog = (
		<SettingsDialog
			open={settingsOpen}
			settings={settings}
			onClose={() => setSettingsOpen(false)}
			onSave={applySettings}
		/>
	);

	useEffect(() => {
		(async () => {
			try {
				const [ov, cached] = await Promise.all([fetchOverview(setProgress), loadScans()]);
				setOverview(ov);
				setScans(cached);
				setSelected(ov.eras[0]?.era ?? null);
				const stashes = [...new Set(ov.eras.flatMap((e) => e.individual.map(([s]) => s)))];
				fetchIdentities(stashes)
					.then(setNames)
					.catch((e) => console.warn("identities unavailable", e));
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		})();
	}, []);

	// Incentive weights are ~600 entries per era, so they are read only for the era on screen.
	useEffect(() => {
		if (selected === null || weights.has(selected)) return;
		if (!overview?.eras.find((e) => e.era === selected)?.incentive) return;
		fetchIncentiveWeights(selected)
			.then((w) => setWeights((m) => new Map(m).set(selected, w)))
			.catch((e) => console.warn(`incentive weights of era ${selected} unavailable`, e));
	}, [overview, selected, weights]);

	// Scans run one at a time: each already fans out into dozens of concurrent RPC calls.
	useEffect(() => {
		if (!overview || running.current || queue.length === 0) return;
		const eraNo = queue[0];
		const era = overview.eras.find((e) => e.era === eraNo);
		if (!era) {
			setQueue((q) => q.slice(1));
			return;
		}
		running.current = true;
		setScanError(null);
		setJob({ era: eraNo, msg: "Starting…", frac: 0 });
		scanEra(era, endSessionOf(era, overview), (msg, frac) => setJob({ era: eraNo, msg, frac }))
			.then((scan) => {
				saveScan(scan);
				setScans((m) => new Map(m).set(eraNo, scan));
			})
			.catch((e) => setScanError(`Scanning era ${eraNo} failed: ${e instanceof Error ? e.message : String(e)}`))
			.finally(() => {
				running.current = false;
				setJob(null);
				setQueue((q) => q.slice(1));
			});
	}, [overview, queue]);

	const enqueue = useCallback(
		(eras: number[]) => setQueue((q) => [...q, ...eras.filter((e) => !q.includes(e) && !scans.has(e))]),
		[scans],
	);
	const rescan = useCallback((era: number) => {
		deleteScan(era);
		setScans((m) => {
			const next = new Map(m);
			next.delete(era);
			return next;
		});
		setQueue((q) => (q.includes(era) ? q : [...q, era]));
	}, []);

	if (error) {
		return (
			<main className="center-screen">
				<h1 className="display">Couldn't read Polkadot</h1>
				<p className="error-msg">{error}</p>
				<div className="masthead-actions">
					<button className="btn primary" onClick={() => location.reload()}>
						Try again
					</button>
					<button className="btn" onClick={() => setSettingsOpen(true)}>
						Change connections
					</button>
				</div>
				{settingsDialog}
			</main>
		);
	}
	if (!overview) {
		return (
			<main className="center-screen">
				<div className="loader" aria-hidden />
				<p className="muted">
					{settings.source === "smoldot" ? "Syncing the smoldot light client. " : ""}
					{progress}
				</p>
			</main>
		);
	}

	const era = overview.eras.find((e) => e.era === selected) ?? null;
	const unscanned = overview.eras.filter((e) => !scans.has(e.era) && !queue.includes(e.era)).map((e) => e.era);
	return (
		<main>
			<header className="masthead">
				<div>
					<h1 className="wordmark">Validator rewards</h1>
					<p className="lede">
						Where Polkadot validators' era points come from: authoring relay chain blocks, or parachain
						consensus. Concluded eras only; era {overview.activeEra} is still running.
					</p>
				</div>
				<div className="masthead-actions">
					<button className="btn" disabled={unscanned.length === 0} onClick={() => enqueue(unscanned.slice(0, 7))}>
						Scan the 7 latest eras
					</button>
					<button className="btn" onClick={() => setSettingsOpen(true)}>
						Connections{settings.source === "smoldot" ? ": smoldot" : ""}
					</button>
					<div className="theme-switch" role="group" aria-label="Color theme">
						{THEMES.map(([value, label]) => (
							<button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>
								{label}
							</button>
						))}
					</div>
				</div>
			</header>

			<EraStrip
				overview={overview}
				scans={scans}
				selected={selected}
				onSelect={setSelected}
				queue={queue}
				job={job}
			/>
			<p className="strip-note">
				Pink-marked eras have been scanned. Scanning reads all ~14,400 relay headers of an era (about a
				minute) and is kept in this browser.
			</p>

			{settingsDialog}

			{scanError && (
				<p className="alert" role="alert">
					{scanError}
				</p>
			)}

			{era && (
				<EraDetail
					era={era}
					overview={overview}
					scan={scans.get(era.era) ?? null}
					names={names}
					weights={weights.get(era.era) ?? null}
					job={job?.era === era.era ? job : null}
					queued={queue.includes(era.era)}
					onScan={() => enqueue([era.era])}
					onRescan={() => rescan(era.era)}
				/>
			)}
		</main>
	);
}
