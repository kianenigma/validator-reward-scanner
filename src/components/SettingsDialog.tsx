import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

interface Props {
	open: boolean;
	settings: Settings;
	onClose: () => void;
	onSave: (s: Settings) => void;
}

const toText = (urls: string[]) => urls.join("\n");
const toUrls = (text: string) =>
	text
		.split(/\s+/)
		.map((u) => u.trim())
		.filter(Boolean);
const invalid = (urls: string[]) => urls.length === 0 || urls.some((u) => !/^wss?:\/\/\S+$/.test(u));

export function SettingsDialog({ open, settings, onClose, onSave }: Props) {
	const ref = useRef<HTMLDialogElement>(null);
	const [source, setSource] = useState(settings.source);
	const [relay, setRelay] = useState(toText(settings.relayRpc));
	const [ah, setAh] = useState(toText(settings.assetHubRpc));
	const [people, setPeople] = useState(toText(settings.peopleRpc));

	useEffect(() => {
		const d = ref.current;
		if (!d) return;
		if (open && !d.open) {
			setSource(settings.source);
			setRelay(toText(settings.relayRpc));
			setAh(toText(settings.assetHubRpc));
			setPeople(toText(settings.peopleRpc));
			d.showModal();
		} else if (!open && d.open) d.close();
	}, [open, settings]);

	const draft: Settings = { source, relayRpc: toUrls(relay), assetHubRpc: toUrls(ah), peopleRpc: toUrls(people) };
	const errors = {
		relay: invalid(draft.relayRpc),
		ah: source === "rpc" && invalid(draft.assetHubRpc),
		people: source === "rpc" && invalid(draft.peopleRpc),
	};
	const canSave = !errors.relay && !errors.ah && !errors.people;

	const reset = () => {
		setSource(DEFAULT_SETTINGS.source);
		setRelay(toText(DEFAULT_SETTINGS.relayRpc));
		setAh(toText(DEFAULT_SETTINGS.assetHubRpc));
		setPeople(toText(DEFAULT_SETTINGS.peopleRpc));
	};

	const field = (id: string, label: string, hint: string, value: string, set: (v: string) => void, bad: boolean) => (
		<div className="field">
			<label htmlFor={id}>{label}</label>
			<p className="hint" id={`${id}-hint`}>
				{hint}
			</p>
			<textarea
				id={id}
				rows={3}
				spellCheck={false}
				aria-describedby={`${id}-hint`}
				aria-invalid={bad}
				value={value}
				onChange={(e) => set(e.target.value)}
			/>
			{bad && <p className="field-error">Enter at least one wss:// or ws:// URL, one per line.</p>}
		</div>
	);

	return (
		<dialog ref={ref} className="settings" onClose={onClose} aria-labelledby="settings-title">
			<form
				method="dialog"
				onSubmit={(e) => {
					e.preventDefault();
					if (canSave) onSave(draft);
				}}
			>
				<h2 id="settings-title" className="section-title">
					Connections
				</h2>
				<p className="muted">Endpoints are tried in order, moving to the next one if a connection fails.</p>

				{field(
					"relay-rpc",
					"Relay chain",
					"Must be archive nodes: scanning reads headers and state from months-old blocks.",
					relay,
					setRelay,
					errors.relay,
				)}

				<fieldset className="field">
					<legend>Asset Hub and People chain</legend>
					<label className="radio">
						<input type="radio" name="source" checked={source === "rpc"} onChange={() => setSource("rpc")} />
						RPC endpoints
					</label>
					<label className="radio">
						<input
							type="radio"
							name="source"
							checked={source === "smoldot"}
							onChange={() => setSource("smoldot")}
						/>
						Smoldot light client, in this browser
					</label>
					<p className="hint">
						Smoldot verifies everything itself but needs a minute to sync before era points appear. The
						relay chain scan still uses the RPC endpoints above.
					</p>
				</fieldset>

				{source === "rpc" && (
					<>
						{field("ah-rpc", "Asset Hub", "Era points and payouts.", ah, setAh, errors.ah)}
						{field("people-rpc", "People chain", "Validator names.", people, setPeople, errors.people)}
					</>
				)}

				<div className="dialog-actions">
					<button type="button" className="text-btn" onClick={reset}>
						Restore defaults
					</button>
					<span className="spacer" />
					<button type="button" className="btn" onClick={onClose}>
						Cancel
					</button>
					<button type="submit" className="btn primary" disabled={!canSave}>
						Save and reconnect
					</button>
				</div>
			</form>
		</dialog>
	);
}
